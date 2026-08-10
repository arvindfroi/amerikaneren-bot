import { readFileSync } from "node:fs";
import { Sandkassenett, KVANTIL_UT } from "../../src/mlb/nett.ts";
import { TREKK_LENGDE } from "../../src/mlb/trekk.ts";

const b = readFileSync("mlb-epoke-data-127r/erf-s0.bin");
const post = b.readInt32LE(16);
const nett = Sandkassenett.fraFil("e1-modell/v127/mlb-roeyk.bin");
for (let r = 0; r < 8; r++) {
  const o = 20 + r * post;
  const x = new Float32Array(TREKK_LENGDE);
  for (let i = 0; i < TREKK_LENGDE; i++) x[i] = b.readFloatLE(o + i * 4);
  const f = nett.framover(x);
  const kv = [...f.verdiKvantil!].reduce((a, v) => a + v, 0) / KVANTIL_UT;
  console.log(
    `${r} V=${f.verdi.toFixed(6)} Vr=${f.verdiRunde!.toFixed(6)} Vh=${f.verdiHale!.toFixed(6)} ` +
      `kvsnitt=${kv.toFixed(6)} st0=${f.stikk![0]!.toFixed(6)}`,
  );
}
