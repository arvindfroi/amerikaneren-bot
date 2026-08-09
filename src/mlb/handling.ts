/**
 * Sandkassens handlingsrom — ETT policyhode over alle fire faser.
 *
 * `docs/sandkassen.md` §4: budet skal inn i samme nett som spillet, fordi
 * verdien av en kontrakt ER hvor mange stikk vi tar. Da må budrunde, vrak,
 * trumfvalg og kortspill dele én utgang, maskert per fase.
 *
 * ## Hvorfor sekvensiell dekomponering
 *
 * VRAK er å velge `talong` kort av hånden. Skrevet direkte er det C(13, 3)
 * = 286 handlinger ved standardgiving, og tallet endrer seg med givingen.
 * VELG er trumf × etterlyst valør = 4 × 13 = 52 kombinasjoner der lovligheten
 * av den andre halvdelen avhenger av den første.
 *
 * I stedet brytes begge ned til ETT valg om gangen:
 *
 *   VRAK  -> `talong` påfølgende kortvalg
 *   VELG  -> ett trumfvalg, så ett kortvalg (etterlyst), hoppes over ved solo
 *
 * Da holder 68 plasser for hele spillet, masken er alltid veldefinert, og
 * ingenting vokser med givingen.
 *
 * ## Plassene
 *
 *   0..51   kort        — brukes av VRAK, VELG (etterlyst) og SPILL
 *   52      pass
 *   53..61  tallbud 5..13
 *   62      amerikaner
 *   63      solo
 *   64..67  trumf S, H, R, K
 *
 * ## K2
 *
 * Alt her leser `SpillerVisning`, aldri `GameState`. De skjulte kortene
 * FINNES ikke i det denne modulen ser — garantien er en typegrense, ikke en
 * konvensjon. `test/mlb-handling.test.ts` håndhever det med en kontrollarm
 * som blir tatt.
 */

import { FARGER, VERDIER, type Farge, type Kort, type Verdi } from "../kort.ts";
import type { SpillerVisning } from "../motor.ts";
import {
  AMERIKANER,
  MINSTE_TALLBUD,
  PASS,
  SOLO,
  erHøyereBud,
  type Bud,
} from "../regler.ts";
import { kortIndeks } from "./hukommelse.ts";

// ===========================================================================
// Plassene
// ===========================================================================

export const KORT_FRA = 0;
export const ANTALL_KORT = 52;

export const BUD_FRA = KORT_FRA + ANTALL_KORT; // 52
export const PASS_KODE = BUD_FRA; // 52
export const TALLBUD_FRA = BUD_FRA + 1; // 53
/** Tallbudene går fra MINSTE_TALLBUD til 13 (største mulige antall stikk). */
export const STØRSTE_TALLBUD = 13;
export const ANTALL_TALLBUD = STØRSTE_TALLBUD - MINSTE_TALLBUD + 1; // 9
export const AMERIKANER_KODE = TALLBUD_FRA + ANTALL_TALLBUD; // 62
export const SOLO_KODE = AMERIKANER_KODE + 1; // 63

export const TRUMF_FRA = SOLO_KODE + 1; // 64
export const ANTALL_TRUMF = 4;

export const HANDLING_LENGDE = TRUMF_FRA + ANTALL_TRUMF; // 68

// ===========================================================================
// Koding
// ===========================================================================

export const kortKode = (k: Kort): number => KORT_FRA + kortIndeks(k);

export function kortFraKode(kode: number): Kort {
  const i = kode - KORT_FRA;
  if (i < 0 || i >= ANTALL_KORT) throw new Error(`Ikke en kortkode: ${kode}`);
  const farge = FARGER[Math.floor(i / 13)]!;
  const verdi = ((i % 13) + 2) as Verdi;
  return { farge, verdi };
}

export function budKode(bud: Bud): number {
  if (bud === PASS) return PASS_KODE;
  if (bud === AMERIKANER) return AMERIKANER_KODE;
  if (bud === SOLO) return SOLO_KODE;
  if (!Number.isInteger(bud) || bud < MINSTE_TALLBUD || bud > STØRSTE_TALLBUD) {
    throw new Error(`Ikke et lovlig tallbud: ${String(bud)}`);
  }
  return TALLBUD_FRA + (bud - MINSTE_TALLBUD);
}

export function budFraKode(kode: number): Bud {
  if (kode === PASS_KODE) return PASS;
  if (kode === AMERIKANER_KODE) return AMERIKANER;
  if (kode === SOLO_KODE) return SOLO;
  if (kode >= TALLBUD_FRA && kode < TALLBUD_FRA + ANTALL_TALLBUD) {
    return kode - TALLBUD_FRA + MINSTE_TALLBUD;
  }
  throw new Error(`Ikke en budkode: ${kode}`);
}

const FARGE_TIL_KODE: Record<Farge, number> = { S: 0, H: 1, R: 2, K: 3 };

export const trumfKode = (f: Farge): number => TRUMF_FRA + FARGE_TIL_KODE[f];

export function trumfFraKode(kode: number): Farge {
  const i = kode - TRUMF_FRA;
  if (i < 0 || i >= ANTALL_TRUMF) throw new Error(`Ikke en trumfkode: ${kode}`);
  return FARGER[i]!;
}

/** Navn på hver plass — for feilsøking og for å lese en policy med øynene. */
export const HANDLING_NAVN: readonly string[] = (() => {
  const n = new Array<string>(HANDLING_LENGDE);
  for (let i = 0; i < ANTALL_KORT; i++) {
    const k = kortFraKode(KORT_FRA + i);
    n[KORT_FRA + i] = `kort:${k.farge}${k.verdi}`;
  }
  n[PASS_KODE] = "bud:pass";
  for (let b = MINSTE_TALLBUD; b <= STØRSTE_TALLBUD; b++) n[budKode(b)] = `bud:${b}`;
  n[AMERIKANER_KODE] = "bud:amerikaner";
  n[SOLO_KODE] = "bud:solo";
  for (const f of FARGER) n[trumfKode(f)] = `trumf:${f}`;
  return n as readonly string[];
})();

// ===========================================================================
// Delvalg — der en fase krever flere valg etter hverandre
// ===========================================================================

/**
 * Givingens offentlige parametre. Alle ved hvor mange kort som ble delt, men
 * `SpillerVisning` bærer dem ikke, så de sendes med eksplisitt. Å utlede
 * `antallStikk` fra `antallKort` ville virke i budrunden og ryke senere.
 */
export interface Giving {
  readonly antallStikk: number;
  readonly talong: number;
}

export type Delsteg = "BUD" | "VRAK_KORT" | "VELG_TRUMF" | "VELG_ETTERLYST" | "SPILL_KORT";

/** Det som er valgt så langt i en fase som krever flere valg. */
export interface Delvalg {
  /** Kort valgt til vraket så langt. */
  readonly vrak: readonly Kort[];
  /** Trumf valgt, før etterlyst er bestemt. */
  readonly trumf: Farge | null;
}

export const TOMT_DELVALG: Delvalg = { vrak: [], trumf: null };

/** Hvilket delsteg står for tur, gitt hva som er valgt så langt? */
export function nesteDelsteg(visning: SpillerVisning, delvalg: Delvalg): Delsteg | null {
  switch (visning.fase) {
    case "BUDRUNDE":
      return "BUD";
    case "VRAK":
      return "VRAK_KORT";
    case "VELG":
      if (delvalg.trumf === null) return "VELG_TRUMF";
      return måEtterlyse(visning) ? "VELG_ETTERLYST" : null;
    case "SPILL":
      return "SPILL_KORT";
    default:
      return null;
  }
}

const måEtterlyse = (visning: SpillerVisning): boolean =>
  visning.melding !== null && visning.melding.type !== "solo";

// ===========================================================================
// Masken
// ===========================================================================

const harKortet = (kort: readonly Kort[], k: Kort): boolean =>
  kort.some((x) => x.farge === k.farge && x.verdi === k.verdi);

/**
 * Hvilke plasser er lovlige akkurat nå? Uint8Array med 1 for lovlig.
 *
 * Nettet skal ALDRI kunne velge ulovlig — masken er den harde skranken, og
 * `test/mlb-handling.test.ts` sammenlikner den mot motorens egen
 * `lovligeHandlinger` for hver fase over mange giv.
 */
export function maske(
  visning: SpillerVisning,
  giving: Giving,
  delvalg: Delvalg = TOMT_DELVALG,
): Uint8Array {
  const m = new Uint8Array(HANDLING_LENGDE);
  const steg = nesteDelsteg(visning, delvalg);
  if (steg === null) return m;

  switch (steg) {
    case "BUD": {
      const høyeste = visning.budrunde.høyeste?.bud ?? null;
      m[PASS_KODE] = 1;
      for (let n = MINSTE_TALLBUD; n <= giving.antallStikk; n++) {
        if (erHøyereBud(n, høyeste, giving.antallStikk)) m[budKode(n)] = 1;
      }
      if (erHøyereBud(AMERIKANER, høyeste, giving.antallStikk)) m[AMERIKANER_KODE] = 1;
      if (erHøyereBud(SOLO, høyeste, giving.antallStikk)) m[SOLO_KODE] = 1;
      break;
    }
    case "VRAK_KORT": {
      // Hvert kort på hånden som ikke alt er lagt i vraket denne gangen.
      for (const k of visning.dinHånd) {
        if (!harKortet(delvalg.vrak, k)) m[kortKode(k)] = 1;
      }
      break;
    }
    case "VELG_TRUMF": {
      for (const f of FARGER) m[trumfKode(f)] = 1;
      break;
    }
    case "VELG_ETTERLYST": {
      // Samme regel som motorens `lovligeEtterlys`, men lest fra visningen:
      // et kort i trumffargen som verken ligger på egen hånd eller i vraket.
      const trumf = delvalg.trumf!;
      const vraket = delvalg.vrak.length > 0 ? delvalg.vrak : visning.dittVrak;
      for (const v of VERDIER) {
        const k: Kort = { farge: trumf, verdi: v };
        if (harKortet(visning.dinHånd, k)) continue;
        if (harKortet(vraket, k)) continue;
        m[kortKode(k)] = 1;
      }
      break;
    }
    case "SPILL_KORT": {
      for (const k of visning.lovligeKort) m[kortKode(k)] = 1;
      break;
    }
  }
  return m;
}

/** Antall lovlige plasser — nyttig for å oppdage en tom maske tidlig. */
export const antallLovlige = (m: Uint8Array): number => m.reduce((a, b) => a + b, 0);

// ===========================================================================
// Fra kode til delvalg, og videre til en ferdig handling
// ===========================================================================

/**
 * Resultatet av å ta ett valg: enten er fasen ferdig og vi har en komplett
 * handling, eller så står et nytt delsteg for tur.
 */
export type Steg =
  | { readonly ferdig: true; readonly handling: Ferdig }
  | { readonly ferdig: false; readonly delvalg: Delvalg };

/** En komplett handling, uten spillernummeret — det setter kalleren. */
export type Ferdig =
  | { readonly type: "BUD"; readonly bud: Bud }
  | { readonly type: "VRAK"; readonly kort: readonly Kort[] }
  | { readonly type: "VELG"; readonly trumf: Farge; readonly etterlyst: Kort | null }
  | { readonly type: "SPILL"; readonly kort: Kort };

/**
 * Ta ett valg. Kaster hvis koden ikke er lovlig i masken — en ulovlig
 * handling skal aldri kunne nå motoren, og en stille retting ville skjule
 * en feil i nettet i stedet for å avsløre den.
 */
export function ta(
  visning: SpillerVisning,
  giving: Giving,
  delvalg: Delvalg,
  kode: number,
): Steg {
  const m = maske(visning, giving, delvalg);
  if (m[kode] !== 1) {
    const steg = nesteDelsteg(visning, delvalg);
    throw new Error(
      `Ulovlig handling ${HANDLING_NAVN[kode] ?? kode} i ${visning.fase}/${steg ?? "-"}`,
    );
  }

  switch (nesteDelsteg(visning, delvalg)!) {
    case "BUD":
      return { ferdig: true, handling: { type: "BUD", bud: budFraKode(kode) } };

    case "SPILL_KORT":
      return { ferdig: true, handling: { type: "SPILL", kort: kortFraKode(kode) } };

    case "VRAK_KORT": {
      const vrak = [...delvalg.vrak, kortFraKode(kode)];
      if (vrak.length === giving.talong) {
        return { ferdig: true, handling: { type: "VRAK", kort: vrak } };
      }
      return { ferdig: false, delvalg: { ...delvalg, vrak } };
    }

    case "VELG_TRUMF": {
      const trumf = trumfFraKode(kode);
      const nytt: Delvalg = { ...delvalg, trumf };
      if (!måEtterlyse(visning)) {
        return { ferdig: true, handling: { type: "VELG", trumf, etterlyst: null } };
      }
      return { ferdig: false, delvalg: nytt };
    }

    case "VELG_ETTERLYST":
      return {
        ferdig: true,
        handling: {
          type: "VELG",
          trumf: delvalg.trumf!,
          etterlyst: kortFraKode(kode),
        },
      };
  }
}
