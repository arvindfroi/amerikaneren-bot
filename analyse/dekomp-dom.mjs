/**
 * DEKOMPONERINGSDOMMEN — ΔP fordelt på leddet der bot og menneske først skilte lag.
 *
 *   node analyse/dekomp-dom.mjs --probe <probe.jsonl> --fri <friløp.jsonl> [--spek <spek-arm.jsonl ...>]
 *
 * `--probe` er `dekomp-probe.ts` (skillepunkt per runde, lærertvang på menneskets bane).
 * `--fri`   er `duplikat-menneske.ts` med SAMME spek (ΔP per runde i friløp).
 * Radene slås sammen på `spill|runde`. Attribusjonen er «første avvik»: hele rundens ΔP
 * tilskrives det leddet der banene først skilte lag.
 *
 * SE: klyngebootstrap over KAMPER (runder i samme kamp er ikke uavhengige), B = 20 000.
 * Parret innen runde: menneskesiden er identisk, så ΔP = bP − mP er en parret differanse.
 * Bootstrapfordelingens standardavvik ER SE-en – den deles ikke på √n en gang til.
 */

import { readFileSync } from "node:fs";

const arg = (n, s) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const flere = (n) => {
  const i = process.argv.indexOf(n);
  if (i < 0) return [];
  const ut = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith("--"); j++) ut.push(process.argv[j]);
  return ut;
};
const les = (f) => readFileSync(f, "utf8").split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x));

const PROBE = arg("--probe", "");
const FRI = arg("--fri", "");
const SPEK = flere("--spek");
const B = Number(arg("--b", "20000"));

/** Klyngebootstrap over kamper. Returnerer punktestimat og SE (bootstrapfordelingens SD). */
function klynge(rader, verdi, b = B, frø = 20260914) {
  if (rader.length === 0) return { pt: NaN, se: NaN, n: 0, k: 0 };
  const grupper = new Map();
  for (const r of rader) {
    const g = grupper.get(r.spill) ?? [];
    g.push(verdi(r));
    grupper.set(r.spill, g);
  }
  const gs = [...grupper.values()];
  const K = gs.length;
  let sum = 0;
  let n = 0;
  for (const g of gs) for (const x of g) { sum += x; n++; }
  const pt = sum / n;
  let st = frø >>> 0;
  const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const ds = new Float64Array(b);
  for (let i = 0; i < b; i++) {
    let s = 0;
    let m = 0;
    for (let j = 0; j < K; j++) {
      const g = gs[(rnd() * K) | 0];
      for (const x of g) { s += x; m++; }
    }
    ds[i] = s / m;
  }
  let mu = 0;
  for (const x of ds) mu += x;
  mu /= b;
  let v = 0;
  for (const x of ds) v += (x - mu) * (x - mu);
  return { pt, se: Math.sqrt(v / (b - 1)), n, k: K };
}

const probe = les(PROBE);
const fri = les(FRI);
const friKart = new Map(fri.map((r) => [`${r.spill}|${r.runde}`, r]));

const rader = [];
let uparret = 0;
for (const p of probe) {
  const f = friKart.get(`${p.spill}|${p.runde}`);
  if (f === undefined) { uparret++; continue; }
  rader.push({ ...p, spill: p.spill, dP: f.bP - f.mP, dPoeng: f.bot - f.menneske, mRolle: f.mRolle, bRolle: f.bRolle });
}

const N = rader.length;
const fmt = (x, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);
const L = [];
L.push("DEKOMPONERING AV K1 — ΔP(seier) etter leddet der bot og menneske FØRST skilte lag");
L.push("=".repeat(104));
L.push(`probe ${PROBE}`);
L.push(`friløp ${FRI}`);
L.push(`${N} runder parret (${uparret} uten friløpsrad), ${new Set(rader.map((r) => r.spill)).size} kamper; SE = klyngebootstrap på kamp, B=${B}`);
L.push("");

const alle = klynge(rader, (r) => r.dP);
L.push(`TOTALT  ΔP ${fmt(alle.pt)} ± ${alle.se.toFixed(2)} pp/runde (n=${alle.n}, ${alle.k} kamper, z ${fmt(alle.pt / alle.se, 1)})`);
L.push("");

const ORDEN = ["BUD", "VRAK", "VELG", "STIKK1_4", "STIKK5_8", "STIKK9_12", "INGEN"];
const NAVN = {
  BUD: "budet",
  VRAK: "vraket",
  VELG: "trumf + etterlyst kort",
  STIKK1_4: "kortspill stikk 1–4",
  STIKK5_8: "kortspill stikk 5–8",
  STIKK9_12: "kortspill stikk 9–12",
  INGEN: "ingen uenighet i runden",
};

L.push("SKILLEPUNKTET (første ledd der boten ville valgt noe annet enn mennesket)");
L.push("  ledd                      runder  andel   ΔP i disse rundene        bidrag til totalen");
let sumBidrag = 0;
for (const b of ORDEN) {
  const sub = rader.filter((r) => r.første === b);
  if (sub.length === 0) continue;
  const k = klynge(sub, (r) => r.dP);
  const bidrag = (k.pt * k.n) / N;
  sumBidrag += bidrag;
  L.push(
    `  ${NAVN[b].padEnd(24)} ${String(k.n).padStart(5)}  ${((100 * k.n) / N).toFixed(1).padStart(5)} %  ` +
      `${fmt(k.pt).padStart(6)} ± ${k.se.toFixed(2)} (${String(k.k).padStart(3)} kamper)   ${fmt(bidrag).padStart(6)} pp`,
  );
}
L.push(`  ${"SUM".padEnd(24)} ${String(N).padStart(5)}          ${" ".repeat(21)}   ${fmt(sumBidrag)} pp`);
L.push("");

L.push("SAMME TABELL I RUNDEPOENG");
for (const b of ORDEN) {
  const sub = rader.filter((r) => r.første === b);
  if (sub.length === 0) continue;
  const k = klynge(sub, (r) => r.dPoeng);
  L.push(`  ${NAVN[b].padEnd(24)} ${String(k.n).padStart(5)}  ${fmt(k.pt).padStart(6)} ± ${k.se.toFixed(2)}  bidrag ${fmt((k.pt * k.n) / N)}`);
}
L.push("");

L.push("HVOR OFTE ER DE UENIGE I DET HELE TATT (alle beslutninger, ikke bare den første)");
L.push("  ledd                      beslutninger   uenige    andel   runder med leddet");
for (const b of ORDEN) {
  if (b === "INGEN") continue;
  let valg = 0;
  let uenig = 0;
  let runder = 0;
  for (const r of rader) {
    const v = r.valg?.[b] ?? 0;
    if (v > 0) runder++;
    valg += v;
    uenig += r.uenig?.[b] ?? 0;
  }
  if (valg === 0) continue;
  L.push(
    `  ${NAVN[b].padEnd(24)} ${String(valg).padStart(12)} ${String(uenig).padStart(8)}   ${((100 * uenig) / valg).toFixed(1).padStart(5)} %   ${String(runder).padStart(5)}`,
  );
}
L.push("");

L.push("KRYSSET MED ROLLEAVVIKET (ulik rolle = kontrakten ble en annen)");
for (const [nm, f] of [["samme rolle", (r) => r.mRolle === r.bRolle], ["ulik rolle", (r) => r.mRolle !== r.bRolle]]) {
  const sub = rader.filter(f);
  const k = klynge(sub, (r) => r.dP);
  L.push(`  ${nm.padEnd(14)} n=${String(k.n).padStart(5)} ΔP ${fmt(k.pt)} ± ${k.se.toFixed(2)}  bidrag ${fmt((k.pt * k.n) / N)}`);
  const b = {};
  for (const r of sub) b[r.første] = (b[r.første] ?? 0) + 1;
  L.push(`    skillepunkt: ${ORDEN.filter((x) => b[x]).map((x) => `${x} ${b[x]}`).join(" · ")}`);
}
L.push("");

if (SPEK.length > 0) {
  const spek = SPEK.flatMap((f) => les(f));
  const sk = new Map(spek.map((r) => [`${r.spill}|${r.runde}`, r]));
  const par = rader.filter((r) => sk.has(`${r.spill}|${r.runde}`)).map((r) => ({ ...r, s: sk.get(`${r.spill}|${r.runde}`) }));
  // KONTROLL: menneskesiden må være bit-identisk i de to armene, ellers er differansen ikke parret.
  const ulikMenneske = par.filter((r) => Math.abs(r.s.mP - r.mP) > 1e-12).length;
  L.push(
    `SØKETS BIDRAG (spek-armen minus friløpet med samme nett, parret på runde; ${par.length} runder; ` +
      `kontroll: ${ulikMenneske} runder med ulik menneskeside, må være 0)`,
  );
  const d = klynge(par, (r) => r.s.bP - r.s.mP - r.dP);
  L.push(`  søk − uten søk  ΔP ${fmt(d.pt)} ± ${d.se.toFixed(2)} pp/runde`);
  for (const b of ORDEN) {
    const sub = par.filter((r) => r.første === b);
    if (sub.length === 0) continue;
    const k = klynge(sub, (r) => r.s.bP - r.s.mP - r.dP);
    L.push(`  ${NAVN[b].padEnd(24)} n=${String(k.n).padStart(5)} ${fmt(k.pt).padStart(6)} ± ${k.se.toFixed(2)}  bidrag ${fmt((k.pt * k.n) / par.length)}`);
  }
  L.push("");
}

console.log(L.join("\n"));
