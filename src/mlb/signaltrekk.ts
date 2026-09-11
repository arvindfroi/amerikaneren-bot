/**
 * MLB — SIGNALBLOKKEN TIL TROHODET (K8 kanal 5 og 2, 11. sep). Bygd fra `SpillerVisning` alene.
 *
 * Kravlista (`analyse/krav-delkrav-2026-09-11.md`) hadde to kanaler som bare fantes
 * implisitt:
 *
 *   kanal 5  hva en spiller la RELATIVT TIL ALTERNATIVENE. `HVEM_LA` sier HVILKET kort
 *            hun la, men ikke hva det kortet betydde i stikket: lå hun under det som
 *            ledet (og har da trolig ikke noe mellom), tok hun over, kastet hun, ledet
 *            hun høyt eller lavt i fargen?
 *   kanal 2  vraket. Bare budvinneren ser sitt eget. De andre kan bare slutte
 *            indirekte: av trumfvalget, det etterlyste kortet og budvinnerens eget
 *            spill i hver farge. Blokken samler de tre relativt til budvinneren.
 *
 * ===================== ALT HER ER OFFENTLIG, OG STRUKTURELT SÅ ============
 *
 * Bare `historikk`, `bord`, `trumf`, `etterlyst`, `budvinner` og `deg` leses — det alle
 * ved bordet så. Ikke egen hånd, ikke eget vrak. «Levende kort» i en farge er de som
 * ikke er SPILT før kortet ble lagt, ikke de observatøren tilfeldigvis ikke har: da er
 * blokken lik for alle som så de samme stikkene, bortsett fra rotasjonen til relativt
 * sete. `test/mlb-signaltrekk.test.ts` bytter de skjulte hendene og krever bit-identitet.
 *
 * Slutningene selv (at «fulgte under» betyder «har ikke noe mellom») gjør NETTET. Blokken
 * serverer bare hendelsene i en form det slipper å rekonstruere fra 208 kortbiter.
 *
 * ===================== LAYOUT (116) =====================================
 *
 *   0..95     4 relative seter × 4 farger × 6:
 *               0 LEDET        antall utspill i fargen (/4)
 *               1 LEDHØYDE     snitt av utspillets rang blant levende kort i fargen (0 = lavest)
 *               2 FULGTE_UNDER antall ganger hun fulgte farge UNDER det som ledet i fargen (/4)
 *               3 TAK          laveste ledende rang hun ikke slo når hun fulgte (/12; 1 = aldri)
 *               4 FULGTE_OVER  antall ganger hun fulgte farge og tok ledelsen (/4)
 *               5 KASTET       antall kort kastet i fargen på en annen farges stikk, uten å trumfe (/4)
 *   96..99    4 relative seter: TRUMFET – trumf lagt på en annen farges stikk (/4)
 *   100..115  4 farger × 4, sett fra budvinneren:
 *               0 er trumf   1 er det etterlystes farge
 *               2 budvinneren har vist renons i fargen   3 budvinnerens spilte kort i fargen (/13)
 */

import { FARGER, type Kort } from "../kort.ts";
import type { KortPåBord, SpillerVisning } from "../motor.ts";

export const MLB_TRO_SIGNAL = 116;

const PER_CELLE = 6;
const LEDET = 0;
const LEDHØYDE = 1;
const FULGTE_UNDER = 2;
const TAK = 3;
const FULGTE_OVER = 4;
const KASTET = 5;
const TRUMFET = 16 * PER_CELLE;
const BUDVINNER = TRUMFET + 4;

/** Offsetene, relativt til blokkens start. */
export const SIGNALINNGANG = { PER_CELLE, LEDET, LEDHØYDE, FULGTE_UNDER, TAK, FULGTE_OVER, KASTET, TRUMFET, BUDVINNER } as const;

const fargeAv = (k: Kort): number => FARGER.indexOf(k.farge);

/** Slår `k` det som leder stikket? Trumf slår alt annet; ellers bare høyere i samme farge. */
function slår(k: Kort, leder: Kort, trumf: number): boolean {
  const fk = fargeAv(k);
  const fl = fargeAv(leder);
  if (fk === fl) return k.verdi > leder.verdi;
  return fk === trumf;
}

export function signalTrekk(visning: SpillerVisning): Float32Array {
  const v = new Float32Array(MLB_TRO_SIGNAL);
  const n = visning.antallKort.length;
  const meg = visning.deg;
  const rel = (sete: number): number => (((sete - meg) % n) + n) % n;
  const trumf = visning.trumf === null ? -1 : FARGER.indexOf(visning.trumf);
  const budvinner = visning.budvinner;

  /** Kortindekser (farge·13 + verdi−2) som er spilt FØR kortet som behandles. */
  const spilt = new Set<number>();
  const ledSum = new Float64Array(16);
  const ledAntall = new Float64Array(16);
  const tak = new Float64Array(16).fill(1);
  const bvRenons = [false, false, false, false];
  const bvSpilt = [0, 0, 0, 0];

  const stikkene: (readonly KortPåBord[])[] = visning.historikk.map((s) => s.kort);
  if (visning.bord.length > 0) stikkene.push(visning.bord);

  for (const stikk of stikkene) {
    const første = stikk[0];
    if (første === undefined) continue;
    const ledFarge = fargeAv(første.kort);
    let leder = første.kort;
    for (let i = 0; i < stikk.length; i++) {
      const { spiller, kort } = stikk[i]!;
      const f = fargeAv(kort);
      const r = kort.verdi - 2;
      const celle = (rel(spiller) * 4 + f) * PER_CELLE;

      if (i === 0) {
        v[celle + LEDET]! += 1 / 4;
        let under = 0;
        let levende = 0;
        for (let x = 0; x < 13; x++) {
          if (spilt.has(f * 13 + x)) continue;
          levende++;
          if (x < r) under++;
        }
        ledSum[rel(spiller) * 4 + f]! += levende > 1 ? under / (levende - 1) : 0.5;
        ledAntall[rel(spiller) * 4 + f]!++;
      } else if (f === ledFarge) {
        // Bare når det som leder er i den ledede fargen er «under» et valg: har noen
        // trumfet, er et lavt kort i fargen ikke noe signal om hva hun mangler.
        if (fargeAv(leder) === ledFarge) {
          if (kort.verdi < leder.verdi) {
            v[celle + FULGTE_UNDER]! += 1 / 4;
            const c = rel(spiller) * 4 + f;
            tak[c] = Math.min(tak[c]!, (leder.verdi - 2) / 12);
          } else {
            v[celle + FULGTE_OVER]! += 1 / 4;
          }
        }
      } else if (f === trumf) {
        v[TRUMFET + rel(spiller)]! += 1 / 4;
        if (spiller === budvinner) bvRenons[ledFarge] = true;
      } else {
        v[celle + KASTET]! += 1 / 4;
        if (spiller === budvinner) bvRenons[ledFarge] = true;
      }
      if (spiller === budvinner) bvSpilt[f]! += 1 / 13;
      if (i > 0 && slår(kort, leder, trumf)) leder = kort;
      spilt.add(f * 13 + r);
    }
  }

  for (let c = 0; c < 16; c++) {
    v[c * PER_CELLE + LEDHØYDE] = ledAntall[c]! > 0 ? ledSum[c]! / ledAntall[c]! : 0;
    v[c * PER_CELLE + TAK] = tak[c]!;
  }

  const etterlystFarge = visning.etterlyst === null ? -1 : fargeAv(visning.etterlyst);
  for (let f = 0; f < 4; f++) {
    const b = BUDVINNER + f * 4;
    v[b] = f === trumf ? 1 : 0;
    v[b + 1] = f === etterlystFarge ? 1 : 0;
    v[b + 2] = bvRenons[f] ? 1 : 0;
    v[b + 3] = bvSpilt[f]!;
  }
  return v;
}
