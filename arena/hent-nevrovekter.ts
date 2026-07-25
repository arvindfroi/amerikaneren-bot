/**
 * Henter appens innebygde nevronett-vekter ut av `NevroVekter.swift` og
 * skriver dem som én base64-fil nettspillet kan laste over HTTP.
 *
 *   node arena/hent-nevrovekter.ts /sti/til/Amerikaneren-App
 *
 * Skriver `web/nevro-vekter.b64.txt` (~525 kB tekst / ~400 kB vekter) og
 * skriver ut arkitekturen som en kontroll. Kjør på nytt når appen retrenes –
 * filen er generert, ikke rediger den for hånd.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hjerneFraBase64 } from "../src/nevro/nett.ts";

const app = process.argv[2];
if (app === undefined) {
  console.error("Bruk: node arena/hent-nevrovekter.ts <sti-til-Amerikaneren-App-repoet>");
  process.exit(1);
}

const kilde = join(app, "Amerikaneren/AI/NevroVekter.swift");
const swift = readFileSync(kilde, "utf8");
// Vektene ligger som en liste base64-strenger (delt opp for kompilatoren).
const deler = [...swift.matchAll(/"([A-Za-z0-9+/=]+)"/g)].map((m) => m[1]!);
if (deler.length === 0) {
  console.error(`Fant ingen base64-deler i ${kilde} – er nettet eksportert?`);
  process.exit(1);
}
const b64 = deler.join("");

// Kontroller at det faktisk er et lesbart nett før vi skriver filen.
const hjerne = hjerneFraBase64(b64);
const form = (navn: string, n: { lag: readonly { inn: number; ut: number }[] }): string =>
  `${navn}: ${n.lag.map((l) => `${l.inn}→${l.ut}`).join(", ")}`;

const ut = join(dirname(new URL(import.meta.url).pathname), "../web/nevro-vekter.b64.txt");
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, b64);

console.log(`Leste ${deler.length} base64-deler fra ${kilde}`);
console.log(`  ${form("bud", hjerne.bud)}`);
console.log(`  ${form("bytt", hjerne.bytt)}`);
console.log(`  ${form("spill", hjerne.spill)}`);
console.log(`Skrev ${ut} (${b64.length} tegn base64)`);
