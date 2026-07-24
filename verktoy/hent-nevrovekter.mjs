/**
 * Henter NevroHjerne-vektene fra Amerikaneren-App og skriver dem som
 * src/nevro/vekter.ts. Kjøres på nytt når appen trener opp nettet.
 *
 *   node verktoy/hent-nevrovekter.mjs [sti/til/Amerikaneren-App]
 *
 * Appen lagrer vektene som base64 av sitt eget binærformat
 * (Int32/Float32 little-endian) i NevroVekter.swift. Vi tar strengen
 * uendret – dekodingen skjer i src/nevro/nett.ts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const app = process.argv[2] ?? resolve(import.meta.dirname, "..", "..", "Amerikaneren-App");
const kilde = readFileSync(`${app}/Amerikaneren/AI/NevroVekter.swift`, "utf8");

const b64 = [...kilde.matchAll(/"([A-Za-z0-9+/=]{20,})"/g)].map((m) => m[1]).join("");
if (b64.length === 0) throw new Error(`Fant ingen base64-deler i ${app}/Amerikaneren/AI/NevroVekter.swift`);

// Sanity: formatet må parse, ellers skriver vi ikke noe.
const buf = Buffer.from(b64, "base64");
let p = 0;
const i32 = () => {
  const v = buf.readInt32LE(p);
  p += 4;
  return v;
};
const antallNett = i32();
if (antallNett !== 3) throw new Error(`Forventet 3 nett, fikk ${antallNett}`);
const former = [];
for (let n = 0; n < 3; n++) {
  const lag = i32();
  const dims = [];
  for (let l = 0; l < lag; l++) {
    const inn = i32();
    const ut = i32();
    p += 4 * (inn * ut + ut);
    dims.push(`${inn}→${ut}`);
  }
  former.push(dims.join(", "));
}
if (p !== buf.length) throw new Error(`Leste ${p} av ${buf.length} byte – formatet stemmer ikke`);

const biter = b64.match(/.{1,4000}/g);
const ut = [
  "/**",
  " * Vektene til NevroHjerne, hentet uendret fra Amerikaneren-App",
  " * (Amerikaneren/AI/NevroVekter.swift). Tre MLP-er – bud, byttekort og",
  " * kortspill – trent der ved destillering fra MesterAI + selvspill.",
  " *",
  " * Formatet er appens eget: Int32/Float32 little-endian, base64. Filen er",
  " * GENERERT (verktoy/hent-nevrovekter.mjs) – ikke rediger for hånd.",
  " *",
  ` * bud   ${former[0]}`,
  ` * bytt  ${former[1]}`,
  ` * spill ${former[2]}`,
  " */",
  "",
  "const BITER: readonly string[] = [",
  ...biter.map((b) => `  "${b}",`),
  "];",
  "",
  'export const NEVRO_VEKTER_B64: string = BITER.join("");',
  "",
].join("\n");

const mål = resolve(import.meta.dirname, "..", "src", "nevro", "vekter.ts");
writeFileSync(mål, ut);
console.log(`Skrev ${mål} (${(ut.length / 1024).toFixed(0)} KB, ${buf.length} byte vekter)`);
for (let i = 0; i < 3; i++) console.log(`  ${["bud", "bytt", "spill"][i]}: ${former[i]}`);
