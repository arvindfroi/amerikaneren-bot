/**
 * A4 — BUDET SPØR SPILLET.
 *
 * ARVIND: «hva med a4 og spill?»
 *
 * A4 har to retninger, og målingen 7. august viste at bare den ene manglet.
 *
 * ================= RETNING 1: SPILLET HØRER BUDET — ER PÅ PLASS ==========
 *
 * Målt over 4 719 beslutninger for budlaget:
 *
 *     kontrakten SIKRET (overstikk verdiløse)   71,4 % spilte laveste
 *     kontrakten UMULIG (alt tapt)              56,9 %
 *     fortsatt ÅPEN (hvert stikk teller)        36,4 %
 *
 * En ren, monoton gradient i riktig retning: boten sparer kort når stikkene
 * ikke lenger er verdt noe, og slåss når de er det.
 *
 * DEN TIDLIGERE PÅSTANDEN VAR FEIL. §79 A4 sa «boten spiller nesten likt på 8
 * og 11», med ablasjonens 8,7 % som belegg. Men ablasjonen delte de relevante
 * trekkene over to blokker: budet ligger på indeks 225, lagstikkene på 230.
 * Hver for seg ser de svake ut; sammen bærer de kontraktbevisstheten.
 * Blokkvis ablasjon kan ikke se samspill — det er en grense ved metoden, ikke
 * ved boten.
 *
 * ================= RETNING 2: BUDET SPØR SPILLET — MANGLET ===============
 *
 * `Budagent` anslår μ (lagstikk) med en GBT på 128 håndtrekk og spør ALDRI hva
 * kortspillet mener. Det er merkelig: vi har en spiller som kan spille hånden
 * ut, og en regresjon som gjetter hvor mange stikk den tar.
 *
 * `søktMu` gjør det direkte: trekk K verdener forenlige med det setet vet,
 * spill hånden ferdig i hver, og les av lagstikket. Ingen modell, ingen
 * kalibrering mot et kortnett som ikke finnes lenger — bare utfallet.
 *
 * ================= HVORFOR DETTE ER BILLIG ==============================
 *
 * Budgivning skjer 1–4 ganger per runde; kortvalg 12 ganger. En budbeslutning
 * har derfor råd til det samme som ETT kortsøk, og førersøket koster 198 ms.
 * Kostnaden er ikke grunnen til at dette ikke fantes.
 *
 * ================= OG FALLGRUVEN, SOM ER MÅLT FØR ========================
 *
 * Utspillingen bruker vår EGEN policy i alle fire seter. Det gjør anslaget
 * SKJEVT på nøyaktig samme måte som `juks:` var skjevt (§58): vi antar at
 * makkeren spiller som oss. Mot familien er det feil.
 *
 * Derfor er `blanding` med: anslaget kan blandes med modellens μ i stedet for
 * å erstatte den. `blanding = 0` gir dagens oppførsel bit-identisk.
 */

import { lovligeHandlinger, utfør, type GameState, type Handling } from "../motor.ts";
import { medVerden, trekkVerdener, type Utspiller } from "./sdkort.ts";

export interface BudsøkOpts {
  /** Verdener å trekke per budbeslutning. */
  readonly verdener: number;
  readonly rng: () => number;
  readonly verdenKandidater?: number;
  /**
   * Hvor mye av det SØKTE anslaget som brukes, i [0, 1].
   *
   *   0    bare modellens μ — bit-identisk med før
   *   1    bare søkets anslag
   *   0,5  gjennomsnitt
   *
   * Skal sveipes. En full erstatning ville arvet skjevheten fra at
   * rolloutene spiller som oss selv.
   */
  readonly blanding?: number;
}

/**
 * Anslår lagstikk ved å SPILLE hånden ut, ikke ved å regne på den.
 *
 * Setet byr `bud` og vinner kontrakten i hver verden der det lar seg gjøre;
 * verdener der noen andre tar den, teller ikke — der er spørsmålet uansett
 * ikke «hvor mange stikk tar laget mitt».
 *
 * `null` når ingen verden ga oss kontrakten. Kalleren skal da bruke modellen,
 * ikke gjette.
 */
export function søktMu(
  state: GameState,
  sete: number,
  bud: number,
  motpart: Utspiller,
  opts: BudsøkOpts,
): { μ: number; σ: number; n: number } | null {
  const verdener = trekkVerdener(
    state,
    sete,
    opts.verdener,
    opts.rng,
    undefined,
    undefined,
    opts.verdenKandidater ?? 3,
  );
  if (verdener.length === 0) return null;

  const stikk: number[] = [];
  for (const hender of verdener) {
    let s = medVerden(state, hender, sete);
    let bydd = false;
    let vakt = 0;
    // Spill budrunden ferdig: vi byr `bud` ved første anledning, de andre
    // følger policyen sin.
    while (s.fase === "BUDRUNDE" && vakt++ < 40) {
      if (s.iTur === null) break;
      let h: Handling;
      if (s.iTur === sete) {
        const lov = lovligeHandlinger(s);
        const kan = !bydd && lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === bud);
        if (kan) bydd = true;
        h = { type: "BUD", spiller: sete, bud: kan ? bud : "PASS" };
      } else {
        h = motpart.velgHandling(s);
      }
      s = utfør(s, h).state;
    }
    if (s.budvinner !== sete) continue;

    vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, motpart.velgHandling(s)).state;
    }
    const mk = s.makker;
    stikk.push(
      (s.stikkVunnet[sete] ?? 0) + (mk !== null && mk !== sete ? (s.stikkVunnet[mk] ?? 0) : 0),
    );
  }
  if (stikk.length < 2) return null;

  const μ = stikk.reduce((a, b) => a + b, 0) / stikk.length;
  const v = stikk.reduce((a, x) => a + (x - μ) * (x - μ), 0) / (stikk.length - 1);
  return { μ, σ: Math.sqrt(v), n: stikk.length };
}

/**
 * Blander søkets anslag med modellens.
 *
 * `blanding` = 0 gir NØYAKTIG modellens tall, altså bit-identisk med å ikke
 * bruke søket i det hele tatt.
 */
export function blandMu(
  modell: { μ: number; σ: number },
  søkt: { μ: number; σ: number } | null,
  blanding: number,
): { μ: number; σ: number } {
  if (søkt === null || blanding <= 0) return modell;
  const b = Math.min(1, blanding);
  return {
    μ: modell.μ * (1 - b) + søkt.μ * b,
    σ: modell.σ * (1 - b) + søkt.σ * b,
  };
}
