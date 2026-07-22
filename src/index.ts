/**
 * Amerikaneren-motor – offentlig API.
 *
 * Lettvekts, avhengighetsfri spillmotor for kortspillet Amerikaner.
 * Ren logikk: ingen I/O, ingen rammeverk. Kan drive en server, en
 * nettleser-klient eller en mobil-app – alt over den samme tilstanden.
 *
 * Typisk bruk:
 * ```ts
 * import { opprettSpill, lovligeHandlinger, utfør } from "amerikaneren-motor";
 *
 * let state = opprettSpill({ antallSpillere: 4 }, 12345);
 * const valg = lovligeHandlinger(state);        // hva kan spiller i tur gjøre?
 * const { state: neste, hendelser } = utfør(state, { type: "BUD", spiller: valg.spiller, bud: 5 });
 * ```
 */

export * from "./kort.ts";
export * from "./regler.ts";
export * from "./motor.ts";
