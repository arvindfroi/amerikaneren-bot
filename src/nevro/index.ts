/**
 * Appens innebygde nevronett («NevroHjerne»), portert til TypeScript slik at
 * nettspillet kan bruke det uten Swift, uten laptop og uten bro.
 */
export {
  base64TilBytes,
  forover,
  hjerneFraBase64,
  hjerneFraBinær,
  lagForover,
  type NevroHjerne,
  type NevroLag,
  type NevroNett,
} from "./nett.ts";
export {
  BUD_DIM,
  BUD_HANDLINGER,
  budRang,
  budTrekk,
  budUtgang,
  BYTT_DIM,
  byttTrekk,
  fargeIndeks,
  kortIndeks,
  SPILL_DIM,
  spillTrekk,
  spilteKort,
} from "./trekk.ts";
export {
  besteTrumf,
  estimerStikk,
  kortSomKanØnskes,
  NevroSpiller,
} from "./spiller.ts";
