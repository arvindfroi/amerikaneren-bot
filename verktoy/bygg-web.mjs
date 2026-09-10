/**
 * BYGGER NETTAPPENS TO BUNTER — den ENE byggekommandoen.
 *
 *   npm run bygg-web        (eller: node verktoy/bygg-web.mjs)
 *
 * gir `web/dist/app.js` og `web/dist/worker.js` fra `web/app.ts` og
 * `web/worker.ts`, begge med
 *
 *   esbuild --bundle --format=esm --charset=utf8 --minify
 *
 * ================= HVORFOR DENNE FILA FINNES =============================
 *
 * Fram til 11. september sto byggekommandoen fire steder, og de var uenige:
 *
 *   docs/utrulling-v5.md          UTEN --minify («slik den utrullede er»)
 *   MESTERAI-NETT.md              MED --minify
 *   bunt-ikke-foreldet.test.ts    MED --minify
 *   arena/mesterai-bro.ts         «npx esbuild web/app.ts ...»
 *
 * De committede buntene var MINIFISERT (reprodusert byte for byte med esbuild
 * 0.28.1, bortsett fra linjeskift fra core.autocrlf). Utrullingslista beskrev
 * altså en annen artefakt enn den som lå i repoet — og en sammenlikning mot
 * feil byggemåte har allerede «funnet» 70 kB drift som ikke fantes
 * (`docs/utrulling-v5.md`, «Byggekommandoen i denne lista stemmer ikke»).
 *
 * Minifisert er valgt fordi det er det som ligger ute, og fordi det er ~20 %
 * mindre over mobilnett. `--minify` bevarer semantikken.
 *
 * ================= NÅR DEN SKAL KJØRES ====================================
 *
 * Etter hver endring i `web/*.ts` eller i `src/` som appen importerer, og
 * buntene committes SAMMEN med kilden. `test/bunt-ikke-foreldet.test.ts` blir
 * rød om kilden er committet etter bunten.
 *
 * Utrulling er en push til produksjonsgrenen (se `docs/utrulling-v5.md`).
 * Denne fila ruller ingenting ut.
 */

import { build } from "esbuild";
import { statSync } from "node:fs";
import { resolve } from "node:path";

const rot = resolve(import.meta.dirname, "..");

const FELLES = {
  bundle: true,
  format: "esm",
  charset: "utf8",
  minify: true,
  logLevel: "warning",
};

for (const [inn, ut] of [
  ["web/app.ts", "web/dist/app.js"],
  ["web/worker.ts", "web/dist/worker.js"],
]) {
  await build({ ...FELLES, entryPoints: [resolve(rot, inn)], outfile: resolve(rot, ut) });
  console.log(`${ut.padEnd(20)} ${statSync(resolve(rot, ut)).size.toLocaleString("nb-NO")} byte  <- ${inn}`);
}
