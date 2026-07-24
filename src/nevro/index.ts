/**
 * NevroHjerne – appens ferdigtrente nett (Amerikaneren-App), kjørbart her
 * som rask og sterk motstander/lærer. Se nett.ts for formatet og agent.ts
 * for spilleren.
 */

export { forover, hjerneFraBase64, nevroHjerne, type NevroHjerne, type NevroLag, type NevroNett } from "./nett.ts";
export {
  besteTrumf,
  estimerStikk,
  HÅND_VEKTER,
  NevroAgent,
  nevroHandling,
  type HåndVekter,
} from "./agent.ts";
export { BUD_DIM, BUD_HANDLINGER, BYTT_DIM, budTrekk, byttTrekk, kortIndeks, spillTrekk, SPILL_DIM } from "./trekk.ts";
