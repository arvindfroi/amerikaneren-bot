/**
 * PROFILEN, SUMMERT (17. sep): selvtid per funksjon og per fil, pluss INKLUDERENDE tid for
 * utvalgte funksjoner (tid der funksjonen står et sted i kallstakken, talt én gang per prøve).
 *
 *   node examples/fart-profil.mjs <fil.cpuprofile> [funksjonsnavn ...]
 *
 * Lages med `node --cpu-prof --cpu-prof-dir=<dir> examples/sokfokus-kostnad.ts ...`.
 */
import { readFileSync } from "node:fs";

const [fil, ...inkl] = process.argv.slice(2);
const p = JSON.parse(readFileSync(fil, "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

// Tid per prøve: timeDeltas[i] hører til samples[i].
const selv = new Map();
const perFil = new Map();
const inklTid = new Map(inkl.map((f) => [f, 0]));
let total = 0;
const navn = (n) => {
  const cf = n.callFrame;
  const f = (cf.url || "").split("/").slice(-2).join("/");
  return `${cf.functionName || "(anon)"} ${f}:${cf.lineNumber + 1}`;
};
for (let i = 0; i < p.samples.length; i++) {
  const dt = (p.timeDeltas[i] ?? 0) / 1000;
  const n = byId.get(p.samples[i]);
  total += dt;
  const k = navn(n);
  selv.set(k, (selv.get(k) ?? 0) + dt);
  const f = (n.callFrame.url || n.callFrame.functionName || "?").split("/").slice(-2).join("/");
  perFil.set(f, (perFil.get(f) ?? 0) + dt);
  if (inkl.length > 0) {
    const sett = new Set();
    let id = n.id;
    while (id !== undefined) {
      const fn = byId.get(id).callFrame.functionName;
      if (inklTid.has(fn)) sett.add(fn);
      id = parent.get(id);
    }
    for (const fn of sett) inklTid.set(fn, inklTid.get(fn) + dt);
  }
}
const vis = (m, tittel, antall) => {
  console.log(`\n== ${tittel} (total ${(total / 1000).toFixed(2)} s) ==`);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, antall)) {
    console.log(`${((100 * v) / total).toFixed(1).padStart(6)} %  ${(v / 1000).toFixed(2).padStart(7)} s  ${k}`);
  }
};
vis(selv, "SELVTID per funksjon", 40);
vis(perFil, "SELVTID per fil", 25);
if (inkl.length > 0) vis(inklTid, "INKLUDERENDE tid", inkl.length);
