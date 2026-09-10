/**
 * TAVLA VED HVER RUNDESTART, med kampens vinner — treningsdata for
 * seiersprediktoren (`src/mlb/seier.ts`, `verktoy/seier-tren.py`).
 *
 *   node examples/seier-data.ts --ut <prefiks> [--kjerner n] <kamplogg-glob> ...
 *
 * Skriver `<prefiks>-s<i>.csv`, ett per skard. Mønstrene globbes her og ikke av
 * skallet, så epokedriveren (R2) kan kalle den uten et skall imellom.
 *
 * Kamploggene gjenspilles uten nett og uten trekk (motoren og kodene fra
 * loggen alene), og `gjenspill` kaster hvis kampen ikke blir den samme — da er
 * vinneren i CSV-en garantert den som faktisk vant.
 *
 * Én linje per (kamp, runde): tavla slik den sto FØR runden ble spilt. Den
 * siste runden er med; tavla ETTER den er utfallet og skrives ikke.
 */
import { fork } from "node:child_process";
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { gjenspill, kamploggFraLinje } from "../src/mlb/selvspill.ts";

let ut = "";
let kjerner = 1;
let skardI = -1;
let skardN = 1;
const mønstre: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") ut = process.argv[++i] ?? "";
  else if (a === "--kjerner") kjerner = Number(process.argv[++i]);
  else if (a === "--skard") {
    const d = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(d[0]);
    skardN = Number(d[1]);
  } else mønstre.push(a);
}
if (ut === "" || mønstre.length === 0) {
  throw new Error("bruk: node examples/seier-data.ts --ut <prefiks> [--kjerner n] <kamplogg-glob> ...");
}
const filer = [...new Set(mønstre.flatMap((m) => globSync(m)))].sort();
if (filer.length === 0) throw new Error(`Fant ingen kamplogger for ${mønstre.join(" ")}`);

if (skardI < 0) {
  const t0 = Date.now();
  let ferdige = 0;
  let feil = 0;
  for (let s = 0; s < kjerner; s++) {
    const barn = fork(process.argv[1]!, [...process.argv.slice(2), "--skard", `${s}/${kjerner}`]);
    barn.on("exit", (kode) => {
      ferdige++;
      if (kode !== 0) feil++;
      if (ferdige === kjerner) {
        console.log(`seier-data: ${kjerner} skard, ${feil} feilet, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${ut}-s*.csv`);
        if (feil > 0) process.exit(1);
      }
    });
  }
} else {
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
  const sti = `${ut}-s${skardI}.csv`;
  writeFileSync(sti, linjer.join("\n") + "\n");
  console.log(
    `seier-data skard ${skardI}/${skardN}: ${kamper} kamper, ${linjer.length - 1} runder -> ${sti} ` +
      `(${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  );
}
