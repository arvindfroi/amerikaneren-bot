/**
 * TAVLA VED HVER RUNDESTART, med kampens vinner — treningsdata for
 * seiersprediktoren (`src/mlb/seier.ts`, `verktoy/seier-tren.py`).
 *
 *   node examples/seier-data.ts --ut <fil.csv> [--skard i/n] <kamplogg.jsonl> ...
 *
 * Kamploggene gjenspilles uten nett og uten trekk (motoren og kodene fra
 * loggen alene), og `gjenspill` kaster hvis kampen ikke blir den samme — da er
 * vinneren i CSV-en garantert den som faktisk vant.
 *
 * Én linje per (kamp, runde): tavla slik den sto FØR runden ble spilt. Den
 * siste runden er med; tavla ETTER den er utfallet og skrives ikke.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gjenspill, kamploggFraLinje } from "../src/mlb/selvspill.ts";

let ut = "";
let skardI = 0;
let skardN = 1;
const filer: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") ut = process.argv[++i] ?? "";
  else if (a === "--skard") {
    const d = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(d[0]);
    skardN = Number(d[1]);
  } else filer.push(a);
}
if (ut === "" || filer.length === 0) {
  throw new Error("bruk: node examples/seier-data.ts --ut <fil.csv> [--skard i/n] <kamplogg.jsonl> ...");
}

const linjer: string[] = ["froe,maal,runde,p0,p1,p2,p3,vinner,avbrutt,runder"];
let kampnr = -1;
let kamper = 0;
const t0 = Date.now();
for (const fil of filer) {
  for (const linje of readFileSync(fil, "utf8").split("\n")) {
    if (linje.length === 0) continue;
    kampnr++;
    if (kampnr % skardN !== skardI) continue;
    const logg = kamploggFraLinje(linje);
    const { rader, fasit } = gjenspill(logg, { samleTrekk: false, hukommelse: false });
    const sett = new Set<number>();
    for (const rad of rader) {
      if (sett.has(rad.rundeNr)) continue;
      sett.add(rad.rundeNr);
      if (rad.poengAlleFør.length !== 4) throw new Error(`frø ${logg.frø}: ${rad.poengAlleFør.length} seter`);
      linjer.push(
        [
          logg.frø,
          fasit.målPoeng,
          rad.rundeNr,
          ...rad.poengAlleFør,
          fasit.vinner,
          fasit.avbrutt ? 1 : 0,
          fasit.runder,
        ].join(","),
      );
    }
    kamper++;
  }
}
writeFileSync(ut, linjer.join("\n") + "\n");
console.log(`seier-data: ${kamper} kamper, ${linjer.length - 1} runder -> ${ut} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
