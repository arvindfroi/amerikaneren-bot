/**
 * UTVIDER FERDIGE 364-RADER TIL 376 ved å legge på planblokken.
 *
 *   node examples/utvid-v5.ts sd-v4 sd-v5
 *
 * HVORFOR DETTE ER TRYGT. Planblokken er en ren funksjon av de 364 første
 * trekkene (`src/e1/plan.ts`), og dette skriptet kaller NØYAKTIG samme
 * funksjon som `e1SpillTrekk` gjør under spill. Det finnes altså ikke to
 * implementasjoner som kan komme i utakt – den klassen feil har kostet dette
 * prosjektet dyrt før (hardkodet bredde i generatoren skrev v2-data i timevis
 * etter at v3 fantes).
 *
 * PRISEN VI SLIPPER: 278 798 rader tar timer å generere på nytt. Her tar det
 * sekunder, og etikettene (`v`) er bit for bit de samme – så en ablasjon mot
 * sd-v4 måler BARE planblokken, ikke ny data.
 *
 * AVRUNDINGEN. Radene lagrer `t` med fire desimaler. `fyllPlanblokk` runder
 * derfor av de heltallige størrelsene den leser (bud, lagstikk, stikk igjen)
 * i stedet for å stole på at 0,6923 × 13 blir nøyaktig 9.
 */

import { createReadStream, createWriteStream, mkdirSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

import { fyllPlanblokk, PLAN_ANTALL, PLAN_FRA } from "../src/e1/plan.ts";

const inn = process.argv[2] ?? "sd-v4";
const ut = process.argv[3] ?? "sd-v5";

mkdirSync(ut, { recursive: true });
const filer = readdirSync(inn).filter((f) => f.endsWith(".jsonl")).sort();
if (filer.length === 0) throw new Error(`Fant ingen *.jsonl i ${inn}`);

let totalt = 0;
let hoppet = 0;

for (const fil of filer) {
  const lesestrøm = createInterface({
    input: createReadStream(join(inn, fil), { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  const skriv = createWriteStream(join(ut, fil), { encoding: "utf-8" });
  let n = 0;
  for await (const linje of lesestrøm) {
    if (linje.trim() === "") continue;
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(linje) as Record<string, unknown>;
    } catch {
      hoppet++;
      continue;
    }
    const t = r["t"] as number[] | undefined;
    if (!Array.isArray(t) || t.length !== PLAN_FRA) {
      hoppet++;
      continue;
    }
    const v = new Float32Array(PLAN_FRA + PLAN_ANTALL);
    v.set(t, 0);
    fyllPlanblokk(v);
    // Samme avrunding som generatoren bruker, saa formatet er identisk.
    r["t"] = Array.from(v, (x) => Math.round(x * 10_000) / 10_000);
    skriv.write(JSON.stringify(r) + "\n");
    n++;
  }
  await new Promise<void>((løs) => skriv.end(løs));
  totalt += n;
  console.log(`  ${fil}: ${n} rader`);
}

console.log(`\nFerdig: ${totalt} rader utvidet ${PLAN_FRA} → ${PLAN_FRA + PLAN_ANTALL}, ${hoppet} hoppet over.`);
console.log(`Etikettene er uendret, så en ablasjon mot ${inn} måler BARE planblokken.`);
