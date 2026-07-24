/**
 * Strukturell sensoranalyse: hvilke innganger er i det hele tatt KOBLET?
 *
 *   node examples/neat-kobling.ts trening-d2/gull.json [flere.json ...]
 *
 * Ablasjon måler om en sensor BRUKES, men koster kamper og drukner i støy
 * ved lite n. Dette er det gratis komplementet: å telle koblingene ut fra
 * hver inngang svarer eksakt på om informasjonen i det hele tatt NÅR fram
 * til nettet. En gruppe uten aktive koblinger er en blindsone med
 * sikkerhet – ingen måling trengs, og ingen måling kan vise noe annet.
 *
 * Merk forskjellen på de to spørsmålene: «koblet» er nødvendig, ikke
 * tilstrekkelig. En sensor kan være koblet med vekt nær null, eller inn i
 * en skjult node uten sti videre til en utgang. Derfor rapporteres også
 * summen av |vekt| ut fra gruppen, og ablasjonen er fortsatt fasit på bruk.
 */

import { readFileSync } from "node:fs";

import { genomFraJson, SENSORGRUPPER, type Genom } from "../src/neat/index.ts";

const filer = process.argv.slice(2);
if (filer.length === 0) {
  console.error("Bruk: node examples/neat-kobling.ts <genom.json> [flere ...]");
  process.exit(1);
}

function les(fil: string): Genom {
  const tekst = readFileSync(fil, "utf8");
  const rå = JSON.parse(tekst) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : tekst);
}

for (const fil of filer) {
  const g = les(fil);
  const aktive = g.koblinger.filter((k) => k.aktiv !== false);
  console.log(`\n=== ${fil} ===`);
  console.log(
    `${g.noder.length} noder, ${g.koblinger.length} koblinger (${aktive.length} aktive), ` +
      `${g.antallInn} innganger, ${g.antallUt} utganger`,
  );

  // Hvor mange av ALLE inngangene har minst én aktiv kobling ut?
  const koblet = new Set<number>();
  for (const k of aktive) if (k.inn < g.antallInn) koblet.add(k.inn);
  console.log(`Innganger med minst én aktiv kobling: ${koblet.size} av ${g.antallInn}`);

  console.log("\ngruppe".padEnd(20) + "innganger".padStart(11) + "koblet".padStart(9) + "koblinger".padStart(11) + "Σ|vekt|".padStart(10));
  for (const [navn, [fra, til]] of Object.entries(SENSORGRUPPER)) {
    const n = til - fra;
    let medKobling = 0;
    for (let i = fra; i < til; i++) if (koblet.has(i)) medKobling++;
    const kobl = aktive.filter((k) => k.inn >= fra && k.inn < til);
    const sumVekt = kobl.reduce((a, k) => a + Math.abs(k.vekt), 0);
    console.log(
      navn.padEnd(20) +
        String(n).padStart(11) +
        String(medKobling).padStart(9) +
        String(kobl.length).padStart(11) +
        sumVekt.toFixed(1).padStart(10) +
        (medKobling === 0 ? "   ← BLINDSONE" : ""),
    );
  }
}
