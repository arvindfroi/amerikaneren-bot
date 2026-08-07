/**
 * K5 — FORSTÅ KONTEKSTEN I SPILLET OG TILPASSE SEG.
 *
 *   node examples/k5-kontekst.ts --giver 8 --ut analyse/k5-kontekst.txt
 *
 * ARVIND: «forstå konteksten i spillet og tilpasse seg.»
 *
 * `AdamsMax.md` sier hva prøven skal være, ord for ord: SAMME KORT, SAMME
 * STIKK, ULIK KAMPSTILLING — 20 poeng bak mot 20 poeng foran ved 70–90 av 100.
 * Adams må velge ULIKT. Å ligge under skal gi mer risiko, å lede mindre.
 *
 * ================= HVORFOR MÅLINGEN IKKE FANTES FRA FØR ==================
 *
 * Ikke fordi ingen hadde tenkt på den, men fordi benken gjorde den umulig.
 * `race.ts` har regelen:
 *
 *     const framdrift = Math.min(1, Math.max(egne, beste) / mål);
 *     if (framdrift < 0.3) return 0;
 *
 * Hver gate2-giv starter på 0–0. `framdrift` er da 0, presset returnerer EKSAKT
 * NULL, og `racescore` faller tilbake til snittet. Parameteren `r0.4` i
 * ADAMS_V6 og ADAMS_V7 har derfor aldri gjort noe i et eneste tall prosjektet
 * har produsert. Den er ikke målt til null — den er aldri kjørt.
 *
 * Denne benken konstruerer kampstillingen i stedet for å vente på den: samme
 * stilling spilles fram på vanlig vis fra 0–0, og så settes `totalPoeng`
 * direkte til de to stillingene prøven ber om. ALT ANNET er bit-identisk —
 * samme kort på hånden, samme bord, samme historikk, samme frø.
 *
 * ================= FIRE ARMER, FORDI DET ER TO KANALER ==================
 *
 * Adams kan tilpasse seg kampstillingen på to helt uavhengige måter, og en
 * måling som blander dem kan ikke svare på hva som virker:
 *
 *   1. NETTET SER STILLINGEN SELV. `src/nevro/trekk.ts` fyller trekk 231 og
 *      232 med egen poengandel og beste motstanders poengandel. Nettet er
 *      trent på et korpus der de tallene varierte, så det HAR en kanal — men
 *      hva den lærte, vet ingen.
 *   2. RACEPRESSET vekter varians i alpha-muens score.
 *
 * Derfor:
 *
 *   nett       bare `vakt:abmpf:e1` — kanal 1 alene, uten søk
 *   amu λ=0    alpha-mu over nettet, racepresset AV — kanal 1 gjennom søket
 *   amu λ=0.4  begge kanalene — det ADAMS_V6/V7 påstår at de gjør
 *   kontroll   λ=0.4, men BEGGE armene får SAMME stilling
 *
 * KONTROLLARMEN ER DEN VIKTIGSTE. Måler den noe annet enn eksakt null, er
 * hele målingen ugyldig: da endrer valget seg av RNG-tilstand eller
 * agentbygging og ikke av kampstillingen. Den er dette oppsettets 0,2500.
 *
 * ================= RETNINGEN ER EN EGEN PÅSTAND =========================
 *
 * «Adams velger ulikt» er ikke nok. Kravet sier hvilken VEI: bak skal gi mer
 * risiko. Derfor logges spredningen i utfallsvektoren til det VALGTE kortet i
 * hver arm. Ligger Adams bak og velger et kort med lavere spredning enn når
 * han leder, er tilpasningen målbart feil vei — og det er et funn, ikke en
 * feil i benken.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState, type Handling } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { Alphamuagent } from "../src/moe2/amuagent.ts";
import { racepress } from "../src/moe2/race.ts";
import type { Utspiller } from "../src/moe2/sdkort.ts";

/**
 * DEN INDRE STAKKEN, identisk med bunnen i ADAMS_V6/V7.
 *
 * `vr:` og `budm:` er utelatt med vilje: de rører VRAK, VELG og BUD, og prøven
 * spør bare om ett kortvalg i en ferdig oppsatt SPILL-stilling. Å ta dem med
 * ville kostet tid uten å kunne endre et eneste svar.
 */
export const K5_INDRE = "vakt:abmpf:e1:e1-modell/d7alle.bin";

/** Speken drivere bruker for å spille stillingene fram. Rent argmax, ingen søk. */
export const K5_DRIVER = ADAMS_MAALT;

export type Arm = "nett" | "amu";

export interface K5Opts {
  /** Antall giv. Hold den lav — hver stilling koster flere alpha-mu-søk. */
  readonly giver?: number;
  readonly frøBase?: number;
  /** `r<lambda>` i amu-speken. 0 = racepresset av. */
  readonly lambda?: number;
  /** `e<eps>`. 0 i prøven: uleseligheten skal ikke kunne forveksles med tilpasning. */
  readonly epsilon?: number;
  readonly arm?: Arm;
  readonly verdener?: number;
  readonly verdenKandidater?: number;
  /** Poengene til setet i BAK-armen (og motstanderens i FORAN-armen). */
  readonly egne?: number;
  /** Poengene til motstanderen i BAK-armen (og setets i FORAN-armen). */
  readonly motstander?: number;
  readonly maksPerGiv?: number;
  readonly fraStikk?: number;
  readonly tilStikk?: number;
  /**
   * KONTROLLARMEN. Gir BEGGE armene BAK-stillingen. Alt annet i målingen er
   * uendret, så andelen endrede valg må bli eksakt 0. Blir den ikke det, måler
   * benken agentbygging eller RNG og ikke kontekst.
   */
  readonly likStilling?: boolean;
  /**
   * HVA DE TO ARMENE SKILLES PÅ.
   *
   *   "stilling"  BAK mot FORAN med samme λ — det AdamsMax.md ber om.
   *   "lambda"    SAMME stilling, λ=0 mot λ — isolerer racepresset alene.
   *
   * Den andre er nødvendig fordi den første ikke kan skille kanalene: nettet
   * ser kampstillingen selv (trekk 231/232), også inne i rolloutene. Endrer
   * valget seg mellom BAK og FORAN, kan det like gjerne være nettet som
   * `racescore`. Bare «lambda» svarer på om `r0.4` gjør noe i det hele tatt.
   */
  readonly sammenlikn?: "stilling" | "lambda";
  /** Hvilken stilling «lambda»-sammenlikningen holdes fast i. */
  readonly stillingFor?: "bak" | "foran";
}

export interface K5Rad {
  readonly frø: number;
  readonly stikk: number;
  readonly sete: number;
  readonly kortBak: string;
  readonly kortForan: string;
  readonly ulikt: boolean;
  readonly spredBak: number | null;
  readonly spredForan: number | null;
  readonly pressBak: number;
  readonly pressForan: number;
}

export interface K5Resultat {
  readonly arm: Arm;
  readonly lambda: number;
  readonly sammenlikn: "stilling" | "lambda";
  readonly likStilling: boolean;
  readonly stillinger: number;
  readonly ulike: number;
  readonly andelUlike: number;
  /** Snitt spredning i det VALGTE kortets utfallsvektor. */
  readonly spredBak: number | null;
  readonly spredForan: number | null;
  /** Stillinger der bak-valget hadde større / mindre / lik spredning. */
  readonly merRisikoBak: number;
  readonly mindreRisikoBak: number;
  readonly likRisiko: number;
  /** `racepress` i de to armene. Er de null, kan ingen λ endre noe. */
  readonly pressBak: number;
  readonly pressForan: number;
  /** `tellere.racejustert` summert — beviser at mekanismen FYRTE. */
  readonly racejustert: number;
  readonly rader: readonly K5Rad[];
}

const kortNavn = (h: Handling): string =>
  h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type;

/**
 * Et sete på det ANDRE laget, så «20 foran» betyr foran en motstander og ikke
 * foran makkeren sin. `racepress` tar bare maks over de andre, men stillingen
 * skal være en ekte kampstilling og ikke et kunstig tall.
 */
function motstandersete(s: GameState, sete: number): number {
  const eget = new Set<number>([sete]);
  const bv = s.budvinner;
  const mk = s.makker;
  if (bv !== null && mk !== null) {
    if (sete === bv) eget.add(mk);
    else if (sete === mk) eget.add(bv);
    else for (let p = 0; p < s.antallSpillere; p++) if (p !== bv && p !== mk) eget.add(p);
  }
  for (let p = 0; p < s.antallSpillere; p++) if (!eget.has(p)) return p;
  return (sete + 1) % s.antallSpillere;
}

/** Samme stilling, ny kampstilling. Alt annet er urørt. */
function medStilling(s: GameState, sete: number, mot: number, egne: number, motstander: number): GameState {
  const tp = new Array<number>(s.antallSpillere).fill(0);
  tp[sete] = egne;
  tp[mot] = motstander;
  return { ...s, totalPoeng: tp };
}

interface Valg {
  readonly kort: string;
  readonly spredning: number | null;
  readonly racejustert: number;
}

/**
 * FERSK AGENT PER KALL, og det er ikke pynt.
 *
 * `Alphamuagent` har en RNG som går framover for hver beslutning
 * (verdenstrekningen). To kall på samme instans trekker DERFOR ulike verdener,
 * og forskjellen mellom armene ville vært verdenstrekning og ikke kontekst.
 * Med en fersk agent per kall får begge armene bit-identiske verdener, og det
 * eneste som skiller dem er `totalPoeng`.
 */
function velgMed(
  o: Required<Pick<K5Opts, "epsilon" | "verdener" | "verdenKandidater">>,
  arm: Arm,
  lambda: number,
  s: GameState,
): Valg {
  const inn = lagIndre(K5_INDRE);
  if (arm === "nett") {
    return { kort: kortNavn(inn.velgHandling(s)), spredning: null, racejustert: 0 };
  }
  const agent = new Alphamuagent(inn, inn as unknown as Utspiller, {
    verdener: o.verdener,
    verdenKandidater: o.verdenKandidater,
    spillvekt: true,
    vektkilde: "regel",
    M: 1,
    epsilon: o.epsilon,
    lambda,
    forklar: true,
    frø: 20260806,
    roller: [],
  });
  agent.sisteForklaring = null;
  const h = agent.velgHandling(s);
  return {
    kort: kortNavn(h),
    spredning: agent.sisteForklaring?.detaljer.spredning ?? null,
    racejustert: agent.tellere.racejustert,
  };
}

export function målK5(opts: K5Opts = {}): K5Resultat {
  const giver = opts.giver ?? 6;
  const frøBase = opts.frøBase ?? 5_100_000;
  const lambda = opts.lambda ?? 0.4;
  const epsilon = opts.epsilon ?? 0;
  const arm: Arm = opts.arm ?? "amu";
  const verdener = opts.verdener ?? 12;
  const verdenKandidater = opts.verdenKandidater ?? 16;
  const egne = opts.egne ?? 70;
  const motstander = opts.motstander ?? 90;
  const maksPerGiv = opts.maksPerGiv ?? 2;
  const fraStikk = opts.fraStikk ?? 2;
  const tilStikk = opts.tilStikk ?? 7;
  const likStilling = opts.likStilling === true;
  const sammenlikn = opts.sammenlikn ?? "stilling";
  const stillingFor = opts.stillingFor ?? "bak";
  const felles = { epsilon, verdener, verdenKandidater };

  const rader: K5Rad[] = [];
  let racejustert = 0;

  for (let g = 0; g < giver; g++) {
    const frø = frøBase + g * 4409;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(K5_DRIVER));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;

    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 300) {
      if (s.fase === "SPILL" && s.iTur !== null) {
        const sete = s.iTur;
        if (
          iGiv < maksPerGiv &&
          s.stikkSpilt >= fraStikk &&
          s.stikkSpilt <= tilStikk &&
          lovligeKort(s, sete).length >= 2
        ) {
          const mot = motstandersete(s, sete);
          const bakStilling = medStilling(s, sete, mot, egne, motstander);
          const foranStilling = medStilling(s, sete, mot, motstander, egne);
          /**
           * DE TO ARMENE, ett sted. «stilling» varierer kampstillingen med fast
           * λ; «lambda» varierer λ med fast kampstilling. Kontrollarmen gjør
           * armene bit-identiske og må derfor måle eksakt null.
           */
          const fast = stillingFor === "bak" ? bakStilling : foranStilling;
          const sBak = sammenlikn === "lambda" ? fast : bakStilling;
          const sForan = sammenlikn === "lambda" ? fast : likStilling ? bakStilling : foranStilling;
          const lBak = sammenlikn === "lambda" ? 0 : lambda;
          const lForan = sammenlikn === "lambda" && !likStilling ? lambda : sammenlikn === "lambda" ? 0 : lambda;

          const bak = velgMed(felles, arm, lBak, sBak);
          const foran = velgMed(felles, arm, lForan, sForan);
          racejustert += bak.racejustert + foran.racejustert;
          rader.push({
            frø,
            stikk: s.stikkSpilt,
            sete,
            kortBak: bak.kort,
            kortForan: foran.kort,
            ulikt: bak.kort !== foran.kort,
            spredBak: bak.spredning,
            spredForan: foran.spredning,
            pressBak: racepress(sBak, sete),
            pressForan: racepress(sForan, sete),
          });
          iGiv++;
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }

  const ulike = rader.filter((r) => r.ulikt).length;
  const medSpred = rader.filter((r) => r.spredBak !== null && r.spredForan !== null);
  const snitt = (xs: number[]): number | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    arm,
    lambda,
    sammenlikn,
    likStilling,
    stillinger: rader.length,
    ulike,
    andelUlike: rader.length === 0 ? 0 : ulike / rader.length,
    spredBak: snitt(medSpred.map((r) => r.spredBak!)),
    spredForan: snitt(medSpred.map((r) => r.spredForan!)),
    merRisikoBak: medSpred.filter((r) => r.spredBak! > r.spredForan! + 1e-9).length,
    mindreRisikoBak: medSpred.filter((r) => r.spredBak! < r.spredForan! - 1e-9).length,
    likRisiko: medSpred.filter((r) => Math.abs(r.spredBak! - r.spredForan!) <= 1e-9).length,
    pressBak: rader[0]?.pressBak ?? 0,
    pressForan: rader[0]?.pressForan ?? 0,
    racejustert,
    rader,
  };
}

// ---------------------------------------------------------------------------
// Kommandolinja. Måleresultatet skrives til FIL, aldri bare til stdout.
// ---------------------------------------------------------------------------

const erHovedmodul = (): boolean => {
  const p = (process.argv[1] ?? "").replace(/\\/g, "/");
  return p.endsWith("/k5-kontekst.ts") && !p.endsWith(".test.ts");
};

if (erHovedmodul()) {
  let giver = 6;
  let frøBase = 5_100_000;
  let ut = "analyse/k5-kontekst.txt";
  let egne = 70;
  let motstander = 90;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--giver") giver = tall(v, giver, "--giver");
    else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
    else if (a === "--egne") egne = tall(v, egne, "--egne");
    else if (a === "--motstander") motstander = tall(v, motstander, "--motstander");
    else if (a === "--ut") ut = v ?? ut;
  }

  const felles = { giver, frøBase, egne, motstander };
  const armer: { navn: string; r: K5Resultat }[] = [
    { navn: "A  BAK/FORAN, nett alene (uten soek)", r: målK5({ ...felles, arm: "nett" }) },
    { navn: "B  BAK/FORAN, amu l=0 (racepresset AV)", r: målK5({ ...felles, arm: "amu", lambda: 0 }) },
    { navn: "C  BAK/FORAN, amu l=0.4 (begge kanaler)", r: målK5({ ...felles, arm: "amu", lambda: 0.4 }) },
    {
      navn: "D  l=0 mot l=0.4, FAST stilling 70-90 (bak)",
      r: målK5({ ...felles, arm: "amu", lambda: 0.4, sammenlikn: "lambda", stillingFor: "bak" }),
    },
    {
      navn: "E  l=0 mot l=0.4, FAST stilling 90-70 (foran)",
      r: målK5({ ...felles, arm: "amu", lambda: 0.4, sammenlikn: "lambda", stillingFor: "foran" }),
    },
    {
      navn: "K  KONTROLL: begge armer bit-identiske",
      r: målK5({ ...felles, arm: "amu", lambda: 0.4, likStilling: true }),
    },
  ];

  const l: string[] = [];
  l.push(`# K5 - kontekst og tilpasning   ${new Date().toISOString()}`);
  l.push(`# giv ${giver}, froe ${frøBase}, stilling BAK ${egne}-${motstander} mot FORAN ${motstander}-${egne} av 100`);
  l.push(`# indre: ${K5_INDRE}   driver: ${K5_DRIVER}`);
  l.push("");
  l.push("# arm 1 = venstre side, arm 2 = hoeyre side i «ulike»-sammenlikningen");
  l.push("");
  l.push("arm".padEnd(46) + "n    ulike  andel   press 1/2        spred 1/2        racejust");
  for (const { navn, r } of armer) {
    const sb = r.spredBak === null ? "  -  " : r.spredBak.toFixed(2);
    const sf = r.spredForan === null ? "  -  " : r.spredForan.toFixed(2);
    l.push(
      navn.padEnd(46) +
        String(r.stillinger).padEnd(5) +
        String(r.ulike).padEnd(7) +
        r.andelUlike.toFixed(3).padEnd(8) +
        `${r.pressBak.toFixed(3)} / ${r.pressForan.toFixed(3)}`.padEnd(17) +
        `${sb} / ${sf}`.padEnd(17) +
        String(r.racejustert),
    );
  }
  l.push("");
  const l04 = armer[2]!.r;
  l.push(
    `retning (arm C): bak tok STOERRE risiko i ${l04.merRisikoBak}, mindre i ` +
      `${l04.mindreRisikoBak}, likt i ${l04.likRisiko} av ${l04.stillinger}`,
  );
  l.push("");
  l.push("# DOMMEN");
  l.push(
    armer[5]!.r.ulike !== 0
      ? "  UGYLDIG - kontrollarmen K maalte ikke null. Forskjellene er ikke kontekst."
      : l04.ulike === 0
        ? "  INGEN TILPASNING - samme kort, samme stikk, 40 poengs forskjell i stillingen, likt valg."
        : `  TILPASNING: ${l04.ulike} av ${l04.stillinger} valg endret seg med kampstillingen.`,
  );
  l.push(
    armer[3]!.r.ulike === 0 && armer[4]!.r.ulike === 0
      ? "  RACEPRESSET (r0.4) endret INGEN valg ved fast stilling - all tilpasning kommer fra nettet."
      : `  RACEPRESSET (r0.4) endret ${armer[3]!.r.ulike}+${armer[4]!.r.ulike} valg ved fast stilling.`,
  );
  l.push("");
  for (const { navn, r } of armer) {
    if (r.ulike === 0) continue;
    l.push(`# stillinger der valget endret seg - ${navn}`);
    for (const rad of r.rader) {
      if (!rad.ulikt) continue;
      l.push(
        `  froe ${rad.frø} stikk ${rad.stikk} sete ${rad.sete}: arm1 ${rad.kortBak} ` +
          `(spred ${rad.spredBak?.toFixed(2) ?? "-"}), arm2 ${rad.kortForan} (spred ${rad.spredForan?.toFixed(2) ?? "-"})`,
      );
    }
    l.push("");
  }

  mkdirSync(dirname(ut), { recursive: true });
  appendFileSync(ut, l.join("\n") + "\n");
  console.log(l.join("\n"));
  console.log(`\nskrevet til ${ut}`);
}
