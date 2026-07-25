/**
 * TRUMF-EKSPERTEN – score per farge (4) + etterlyst valør (13).
 *
 * FASIT: dobbelt-dummy-verdien av kontrakten under HVERT lovlig par
 * (trumffarge, etterlyst kort). Alle par enumereres – typisk ~40 – så gulvet
 * er eksakt og kandidatens valg er et tabelloppslag.
 *
 * HVORFOR DENNE EKSPERTEN FINNES I DET HELE TATT: fasedelingen målte at
 * trumf- og etterlysningsvalget alene er 32,4 ± 3,0 av et samlet gap på 41,7
 * poeng mot NevroHjerne. Det er den dyreste enkeltbeslutningen i spillet, og
 * i den gamle arkitekturen delte den vekter med korthodet.
 *
 * UTGANGSLAGET er 4 + 13 og ikke 4 + 52. Etterlysningen MÅ ligge i
 * trumffargen (`utførVelg` håndhever det), så fargen er allerede valgt når
 * valøren skal velges; 52 utganger ville vært 39 utganger som per konstruksjon
 * aldri kan velges, og hver av dem er et sted mutasjonen kan kaste bort en
 * kobling.
 *
 * AVGRENSNING: bare tallbud-kontrakter. Ved solo er etterlysning valgfri og
 * betyr noe helt annet (be om et kort du selv kan stikke over), og en fasit
 * som blander de to måler to ting med ett tall.
 */

import { FARGER } from "../../kort.ts";
import { opprettSpill } from "../../index.ts";
import { type GameState, lovligeEtterlys, spillerVisning, utfør } from "../../motor.ts";
import { NevroAgent } from "../../nevro/agent.ts";
import { kortIndeks, lagInn } from "../../neat/trekk.ts";
import { evaluerHybrid } from "../../solver/dds.ts";
import { rangeringsmål, type Ekspert, type Råstilling } from "./felles.ts";
import { projiser, TRUMF_SENSORER } from "./sensorer.ts";

/** Et trumfvalg: farge 0..3 og etterlyst valør 2..14. */
export interface Trumfhandling {
  readonly farge: number;
  readonly valør: number;
}

/** Utgang 0..3: farge. Utgang 4..16: valør 2..14. */
export const UT_FARGE = 0;
export const UT_VALØR = 4;
export const ANTALL_UT_TRUMF = 17;

export const trumfEkspert: Ekspert<Trumfhandling> = {
  navn: "trumf",
  fase: "VELG",
  rolle: null,
  sensorer: TRUMF_SENSORER,
  antallUt: ANTALL_UT_TRUMF,
  velg(ut, s) {
    // Fargen først, men bare blant farger som HAR en lovlig etterlysning.
    // Motoren avviser en farge uten kandidat, så en «vinner» der ville vært
    // et ulovlig valg – ikke et dårlig et.
    let besteFarge = -1;
    let besteScore = -Infinity;
    for (const h of s.handlinger) {
      const score = ut[UT_FARGE + h.farge]!;
      if (score > besteScore) {
        besteScore = score;
        besteFarge = h.farge;
      }
    }
    let beste = -1;
    let besteValør = -Infinity;
    for (let i = 0; i < s.handlinger.length; i++) {
      const h = s.handlinger[i]!;
      if (h.farge !== besteFarge) continue;
      const score = ut[UT_VALØR + (h.valør - 2)]!;
      if (score > besteValør) {
        besteValør = score;
        beste = i;
      }
    }
    return beste >= 0 ? beste : 0;
  },
};

export interface TrumfstillingOpts {
  readonly dybde?: number;
  readonly nodeTak?: number;
}

/**
 * Bygger én trumfstilling fra en GameState som står i VELG.
 *
 * Fasiten kjenner alle hender (den er et orakel); sensorvektoren kommer fra
 * `spillerVisning`, som bare viser budvinnerens egen hånd og eget vrak.
 */
export function lagTrumfstilling(
  state: GameState,
  opts: TrumfstillingOpts = {},
): Råstilling<Trumfhandling> | null {
  if (state.fase !== "VELG" || state.budvinner === null || state.melding === null) return null;
  if (state.melding.type !== "tall") return null;
  const dybde = opts.dybde ?? 6;
  const nodeTak = opts.nodeTak ?? 400_000;
  const bv = state.budvinner;
  const T = state.giving.antallStikk;
  const hender = state.hender.map((h) => h.map(kortIndeks));

  const handlinger: Trumfhandling[] = [];
  const verdi: number[] = [];
  for (let f = 0; f < FARGER.length; f++) {
    for (const kort of lovligeEtterlys(state, FARGER[f]!)) {
      const etterlyst = kortIndeks(kort);
      const declLag = hender.map((h, p) => p === bv || h.includes(etterlyst));
      handlinger.push({ farge: f, valør: kort.verdi });
      verdi.push(
        evaluerHybrid(
          { N: state.antallSpillere, trump: f, declLag, hender, iTur: bv, totalStikk: T },
          dybde,
          nodeTak,
        ),
      );
    }
  }
  if (handlinger.length < 2) return null;

  const nevros = new NevroAgent().velgTrumfOgEtterlys(state, bv, true);
  const nf = FARGER.indexOf(nevros.trumf);
  const takValg = handlinger.findIndex(
    (h) => h.farge === nf && nevros.etterlyst !== null && h.valør === nevros.etterlyst.verdi,
  );

  return {
    gruppe: `trumf:${state.frø}:${state.rundeNr}`,
    inn: projiser(lagInn(spillerVisning(state, bv), "VELG", T, state.regler.målPoeng), TRUMF_SENSORER),
    handlinger,
    verdi,
    takValg: takValg >= 0 ? takValg : 0,
    læremål: læremålFor(handlinger, verdi),
  };
}

/**
 * Kjører giver fram til VELG-fasen og bygger én stilling per giv.
 *
 * Budrunden OG vraket spilles av NevroHjerne. Vraket måtte gjøres av noen –
 * og at det er referansen som gjør det, er med vilje: da måles trumfvalget på
 * hender som ikke først er ødelagt av et dårlig vrak, altså på trumfvalget
 * alene. Det er den samme isolasjonen vrakeksperten får ved å holde trumfen
 * fast.
 */
export function lagTrumfstillinger(
  opts: TrumfstillingOpts & { giver: number; frø?: number },
): Råstilling<Trumfhandling>[] {
  const nevro = new NevroAgent();
  const ut: Råstilling<Trumfhandling>[] = [];
  for (let i = 0; i < opts.giver; i++) {
    let s = opprettSpill({}, (opts.frø ?? 13_000_000) + i);
    let vakt = 0;
    while ((s.fase === "BUDRUNDE" || s.fase === "VRAK") && vakt++ < 50) {
      s = utfør(s, nevro.velgHandling(s)).state;
    }
    if (s.fase !== "VELG") continue;
    const stilling = lagTrumfstilling(s, opts);
    if (stilling !== null) ut.push(stilling);
  }
  return ut;
}

/**
 * Læremålet er TO uavhengige rangeringer, ikke én over 17 utganger.
 *
 * Fargehodet lærer den beste oppnåelige verdien per farge – det er det
 * spørsmålet fargevalget faktisk stiller («hva er hånden verdt med denne
 * trumfen, gitt at jeg etterlyser fornuftig»). Valørhodet lærer rangeringen
 * INNENFOR den beste fargen, som er den eneste konteksten valøren velges i.
 *
 * Å normalisere de to hver for seg er poenget: en felles min–max over alle 17
 * ville latt fargespennet dominere valørspennet, og valørhodet ville lært at
 * alle valører er omtrent like gode.
 */
function læremålFor(
  handlinger: readonly Trumfhandling[],
  verdi: readonly number[],
): Map<number, number> {
  const bestePerFarge = new Map<number, number>();
  handlinger.forEach((h, i) => {
    const nå = bestePerFarge.get(h.farge);
    if (nå === undefined || verdi[i]! > nå) bestePerFarge.set(h.farge, verdi[i]!);
  });
  let besteFarge = -1;
  let beste = -Infinity;
  for (const [f, v] of bestePerFarge) {
    if (v > beste) {
      beste = v;
      besteFarge = f;
    }
  }
  const mål = rangeringsmål(
    [...bestePerFarge].map(([f, v]) => ({ utgang: UT_FARGE + f, verdi: v })),
  );
  const iFargen = handlinger
    .map((h, i) => ({ h, v: verdi[i]! }))
    .filter((x) => x.h.farge === besteFarge)
    .map((x) => ({ utgang: UT_VALØR + (x.h.valør - 2), verdi: x.v }));
  for (const [u, y] of rangeringsmål(iFargen)) mål.set(u, y);
  return mål;
}
