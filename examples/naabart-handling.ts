/**
 * NÅBAR HANDLING — DET INFORMASJONSRETTFERDIGE TAKET I TRUMFVALGET OG KORTSPILLET
 * (K3.4, K3.6, K7, 11. sep).
 *
 * Samme grep som `naabart-bud.ts` gjorde for budet, nå for resten av runden.
 * `tak-kart.ts --fase vrak|spill` måler taket med KLARSYN: vårt sete forgreiner seg over alle
 * lovlige handlinger i vinduet PÅ DEN VIRKELIGE GIVEN og tar maksimum av hvordan hver linje
 * faktisk endte. Ingen spiller uten skjult informasjon kan nå det, så porten |gap| ≤ 2 SE kunne
 * aldri lukkes. Batteriet 11. sep (iter1): K3.4 +1,18 ± 0,42 / +1,33 ± 0,45 (Adams +1,37 /
 * +1,37), K3.6 +1,46 ± 0,90 / +5,31 ± 1,85, K7 +0,31 ± 0,14 / +0,50 ± 0,20 — og Adams lå like
 * langt unna i alle tre. Det er informasjon, ikke feil.
 *
 * ============ HVA SOM VELGES ==============================================
 *
 *   KANDIDATENE  VELG: hver trumffarge med den HØYESTE lovlige etterlysningen (samme sett som
 *                klarsynstreet i `tak-kart.ts`, så de to takene spør om det samme valget), og
 *                policyens eget valg om det faller utenfor. SPILL: alle lovlige kort.
 *   VERDENENE    W verdener trukket fra DET SETET SER: `trekkVerdener` (renonser, håndstørrelser,
 *                budvekten, og for de tre som ikke er budvinner vraket som død binge) +
 *                `medVerden` (etter vraket er vraket i en ikke-budvinners verden kortene til
 *                overs, K2-fiksen 381df73; budvinneren ser sitt eget vrak og beholder det).
 *                Det er samme trekning som søket (`vurderPar`) bruker, uten troen.
 *   VERDIEN      snittet av setets rundepoeng når handlingen tvinges og runden spilles ferdig av
 *                agentene kalleren gir. Argmax; policyen står ved uavgjort.
 *
 * ============ K2: VALGET ER EN FUNKSJON AV VISNINGEN =======================
 *
 *   1. RNG-en utledes av `visningsfrø(state, sete, frø)`. To stillinger som bare skiller seg i
 *      skjulte kort (andres hender, et vrak setet ikke så, talongen) gir samme verdener.
 *   2. Hver verden er bygd av `medVerden` på den stillingen vi fikk: ALT skjult i den
 *      (hendene, vraket for en ikke-budvinner, talongen) erstattes av verdenens.
 *   3. FRØET VASKES som i budet. I kortspillet bestemmer det bare neste giv, som bladet ikke
 *      leser, men en krok som lot det stå skal ikke kunne bli en stille lekkasje senere.
 *
 * `test/naabart-handling.test.ts` bytter de skjulte hendene, vraket og talongen for en
 * forsvarer etter vraket og krever identiske VERDIER, og har en felle som MÅ bli tatt: et
 * «nåbart» tak som spiller ut i de ekte hendene.
 *
 * ============ HVA TALLET ER, OG HVA DET IKKE ER ===========================
 *
 *   ÉN-STEGS FORBEDRING, beslutning for beslutning: hver av setets senere beslutninger spilles
 *   av policyen i verdenene, og velges på nytt (like rettferdig) i den ekte runden.
 *   VALG OG SCORE ER DISJUNKTE: valget gjøres i W verdener uten den ekte, scoren leses i den
 *   ekte. Argmax over støy kan bare gjøre regelen dårligere, så med endelig W er det nåbare
 *   gapet en NEDRE grense, og porten er ensidig (se `domNaabart` i `krav-helbot.ts`).
 */

import { lovligeHandlinger, utfør, type GameState, type Handling } from "../src/index.ts";
import { FARGER, lagRng, type Kort } from "../src/kort.ts";
import { lovligeEtterlys } from "../src/motor.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import type { Spekagent } from "../src/moe2/agentspek.ts";
import { NAABART_FRØ } from "./naabart-bud.ts";

export interface NaabartHandlingOpts {
  /** W: verdener per beslutning. 0 = ingen bevis, policyen står (kontrollarmen). */
  readonly verdener: number;
  /** Kandidatverdener budvekten velger mellom. Standard 32, som i budet. */
  readonly kandidater?: number;
  readonly frø?: number;
  /** Fire seteagenter som spiller runden ferdig i verdenene. `nyKamp()` før hver utspilling. */
  readonly agenter: readonly Spekagent[];
  /** FELLE-KROK for prøvene: hvor verdenene kommer fra. En krok som gir de EKTE hendene er klarsyn. */
  readonly verdenerFor?: (s: GameState, sete: number, rng: () => number) => readonly (readonly number[][])[];
  /** FELLE-KROK: `false` lar det ekte frøet stå i verdenene. Standard vasket. */
  readonly vaskFrø?: boolean;
}

export interface NaabartHandlingValg {
  readonly handling: Handling;
  /** Snittpoeng per kandidat, i kandidatrekkefølge. Tom når ingenting ble vurdert. */
  readonly verdier: readonly { readonly handling: string; readonly snitt: number }[];
  readonly n: number;
}

/** Hvem som handler i `s`: budvinneren i VRAK/VELG, ellers den i tur. */
export const iTurFor = (s: GameState): number | null => (s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur);

const kortNavn = (k: Kort | null): string => (k === null ? "-" : `${k.farge}${k.verdi}`);

/** En stabil nøkkel for en handling: to handlinger er det samme valget hvis og bare hvis nøklene er like. */
export function handlingNøkkel(h: Handling): string {
  switch (h.type) {
    case "SPILL":
      return `S${kortNavn(h.kort)}`;
    case "VELG":
      return `T${h.trumf}/${kortNavn(h.etterlyst)}`;
    case "BUD":
      return `B${String(h.bud)}`;
    default:
      return h.type;
  }
}

/**
 * Kandidatene for `sete` i `s`. VELG: hver trumffarge med den HØYESTE lovlige etterlysningen,
 * ordrett regelen i `tak-kart.ts` sitt klarsynstre (etterlysningen MÅ ligge i trumffargen, og
 * «høyeste» er konvensjonen boten følger). SPILL: alle lovlige kort.
 */
export function kandidaterFor(s: GameState, sete: number): Handling[] {
  const l = lovligeHandlinger(s);
  if (l.fase === "SPILL") return l.kort.map((k) => ({ type: "SPILL", spiller: sete, kort: k }) as Handling);
  if (l.fase === "VELG") {
    const ut: Handling[] = [];
    for (const f of FARGER) {
      const kand = lovligeEtterlys(s, f);
      if (l.måEtterlyse && kand.length === 0) continue;
      const beste = kand.reduce<(typeof kand)[number] | null>((a, k) => (a === null || k.verdi > a.verdi ? k : a), null);
      ut.push({ type: "VELG", spiller: sete, trumf: f, etterlyst: beste } as Handling);
    }
    return ut;
  }
  throw new Error(`kandidaterFor: fasen ${s.fase} har ingen nåbar handling her (budet: naabart-bud.ts)`);
}

/** Tving `h`, spill runden ferdig med `agenter`, les av setets rundepoeng (som `tak-kart.ts`). */
export function spillHandlingUt(start: GameState, sete: number, h: Handling, agenter: readonly Spekagent[]): number {
  for (const a of agenter) a.nyKamp();
  let s = utfør(start, h).state;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const i = iTurFor(s);
    if (i === null || i === undefined) break;
    s = utfør(s, agenter[i]!.velgHandling(s)).state;
  }
  return s.sisteRunde?.delta?.[sete] ?? 0;
}

/**
 * Den nåbare handlingen for `sete` i `s` (VELG eller SPILL). `policy` er det boten selv valgte i
 * samme stilling: utgangspunktet for argmax, og det som står når W = 0, ingen verden lot seg
 * trekke eller bare én kandidat finnes.
 */
export function naabartHandling(s: GameState, sete: number, policy: Handling, o: NaabartHandlingOpts): NaabartHandlingValg {
  if ((s.fase !== "VELG" && s.fase !== "SPILL") || iTurFor(s) !== sete) {
    throw new Error(`naabartHandling: sete ${sete} er ikke i tur i VELG/SPILL (fase ${s.fase})`);
  }
  if (policy.type !== (s.fase === "VELG" ? "VELG" : "SPILL")) {
    throw new Error(`naabartHandling: policyen ga ${policy.type} i fasen ${s.fase}`);
  }
  const kand = kandidaterFor(s, sete);
  const pNøkkel = handlingNøkkel(policy);
  // Policyens valg er alltid med: i VELG kan den ha kalt et annet kort enn det høyeste.
  if (!kand.some((h) => handlingNøkkel(h) === pNøkkel)) kand.push(policy);
  if (o.verdener <= 0 || kand.length < 2) return { handling: policy, verdier: [], n: 0 };
  const vf = visningsfrø(s, sete, o.frø ?? NAABART_FRØ);
  const rng = lagRng(vf);
  const hender =
    o.verdenerFor === undefined
      ? trekkVerdener(s, sete, o.verdener, rng, undefined, undefined, o.kandidater ?? 32)
      : o.verdenerFor(s, sete, rng);
  if (hender.length === 0) return { handling: policy, verdier: [], n: 0 };

  // Samme verdener for alle kandidater: forskjellene er parvise.
  const sum = new Array<number>(kand.length).fill(0);
  for (let w = 0; w < hender.length; w++) {
    const v = medVerden(s, hender[w]! as number[][], sete);
    const verden: GameState = o.vaskFrø === false ? v : { ...v, frø: (vf + Math.imul(w + 1, 0x9e3779b1)) >>> 0 };
    for (let i = 0; i < kand.length; i++) sum[i]! += spillHandlingUt(verden, sete, kand[i]!, o.agenter);
  }
  const verdier = kand.map((h, i) => ({ handling: handlingNøkkel(h), snitt: sum[i]! / hender.length }));
  let beste = policy;
  let bv = verdier.find((x) => x.handling === pNøkkel)!.snitt;
  for (let i = 0; i < kand.length; i++) {
    if (verdier[i]!.snitt > bv) {
      bv = verdier[i]!.snitt;
      beste = kand[i]!;
    }
  }
  return { handling: beste, verdier, n: hender.length };
}

// ===========================================================================
// FELLENE: bevisst dårlige valg INNE I vinduet, K2-trygge og deterministiske
// ===========================================================================

/**
 * `lav`       SPILL: laveste lovlige kort (verdi, så fargerekkefølgen). Stikker aldri når det
 *             kan la være, og kaster aldri et høyt kort.
 * `tilfeldig` SPILL: et lovlig kort trukket med RNG fra `visningsfrø`, så samme stilling gir samme
 *             kort i ren-runden og i den nåbare runden (paringen), og skjulte kort ikke rører det.
 * `kortest`   VELG: trumf i fargen setet har FÆRREST kort i (høyeste lovlige etterlysning),
 *             første farge ved likhet. Den verste trumfregelen som ikke ser skjulte kort.
 * `hoy`       SPILL: høyeste lovlige kort. Stikker over makker og brenner ess og trumf.
 * `verst`     SPILL: kortet med LAVEST snittpoeng over W verdener fra setets visning — det verste
 *             kortet under samme informasjon. Eget frø (`FELLE_FRØ`), så fella og taket IKKE deler
 *             verdener. Krever `o` (utspillingsagentene).
 *
 * HVORFOR `hoy` OG `verst` (11. sep). Moderat utvalg, W = 32: i stikk 7–11 ga `lav` +1,00 ± 0,73
 * / +1,89 ± 0,99 (z 1,38 / 1,92, 16 giv per bånd) og `tilfeldig` +0,94 ± 0,65 / +0,63 ± 0,59. Et
 * laveste eller tilfeldig kort koster lite i sluttspillet, så fellene slapp unna. `verst` ga +2,30
 * ± 1,03 / +3,16 ± 1,18 (z 2,23 / 2,68) og er K7-fella. I stikk 3–5 holder `lav` på 48 giv
 * (z 3,84 / 3,02; på 12 giv så den svak ut, z 1,95 / 0,49). En felle uten kraft gjør raden
 * stum, ikke grønn; alle tallene står i filhodet til `krav-helbot.ts`.
 */
export type Felle = "lav" | "tilfeldig" | "kortest" | "hoy" | "verst";
export const FELLER: readonly Felle[] = ["lav", "tilfeldig", "kortest", "hoy", "verst"];
const FELLE_FRØ = 20_260_912;

export function felleHandling(felle: Felle, s: GameState, sete: number, o?: NaabartHandlingOpts): Handling {
  if (felle === "verst" || felle === "hoy") return grovFelle(felle, s, sete, o);
  const kand = kandidaterFor(s, sete);
  if (felle === "kortest") {
    if (s.fase !== "VELG") throw new Error(`felle kortest gjelder VELG, ikke ${s.fase}`);
    const hånd = s.hender[sete]!;
    let beste = kand[0]!;
    let bn = Infinity;
    for (const h of kand) {
      if (h.type !== "VELG") continue;
      const n = hånd.filter((k) => k.farge === h.trumf).length;
      if (n < bn) {
        bn = n;
        beste = h;
      }
    }
    return beste;
  }
  if (s.fase !== "SPILL") throw new Error(`felle ${felle} gjelder SPILL, ikke ${s.fase}`);
  if (felle === "tilfeldig") {
    const rng = lagRng(visningsfrø(s, sete, FELLE_FRØ));
    return kand[Math.floor(rng() * kand.length)]!;
  }
  let beste = kand[0]!;
  for (const h of kand) {
    if (h.type !== "SPILL" || beste.type !== "SPILL") continue;
    const a = h.kort;
    const b = beste.kort;
    if (a.verdi < b.verdi || (a.verdi === b.verdi && FARGER.indexOf(a.farge) < FARGER.indexOf(b.farge))) beste = h;
  }
  return beste;
}

/** `hoy` og `verst`. Egen funksjon så `lav`/`tilfeldig`/`kortest` over er urørt (byte-identiske rader). */
function grovFelle(felle: "hoy" | "verst", s: GameState, sete: number, o?: NaabartHandlingOpts): Handling {
  if (s.fase !== "SPILL") throw new Error(`felle ${felle} gjelder SPILL, ikke ${s.fase}`);
  const kand = kandidaterFor(s, sete);
  if (felle === "hoy") {
    let beste = kand[0]!;
    for (const h of kand) {
      if (h.type !== "SPILL" || beste.type !== "SPILL") continue;
      const a = h.kort;
      const b = beste.kort;
      if (a.verdi > b.verdi || (a.verdi === b.verdi && FARGER.indexOf(a.farge) > FARGER.indexOf(b.farge))) beste = h;
    }
    return beste;
  }
  if (o === undefined) throw new Error("felle verst trenger utspillingsagentene (NaabartHandlingOpts)");
  if (kand.length < 2 || o.verdener <= 0) return kand[0]!;
  const vf = visningsfrø(s, sete, FELLE_FRØ);
  const hender = trekkVerdener(s, sete, o.verdener, lagRng(vf), undefined, undefined, o.kandidater ?? 32);
  if (hender.length === 0) return kand[0]!;
  const sum = new Array<number>(kand.length).fill(0);
  for (let w = 0; w < hender.length; w++) {
    const v = medVerden(s, hender[w]! as number[][], sete);
    const verden: GameState = { ...v, frø: (vf + Math.imul(w + 1, 0x9e3779b1)) >>> 0 };
    for (let i = 0; i < kand.length; i++) sum[i]! += spillHandlingUt(verden, sete, kand[i]!, o.agenter);
  }
  let verst = 0;
  for (let i = 1; i < kand.length; i++) if (sum[i]! < sum[verst]!) verst = i;
  return kand[verst]!;
}
