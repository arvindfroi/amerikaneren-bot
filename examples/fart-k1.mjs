/**
 * PARRET K1 FOR FARTSSPEKEN S1 (17. sep) — frakoblet driver.
 *
 *   node examples/fart-k1.mjs            (startes via WMI; se D:/amb-grp/loop/fart-k1.md)
 *
 * To armer, begge med ny kjerne (koden i denne arbeidskopien), iter-8-nettene:
 *   base  helbotspeken uten fartsknotter
 *   S1    samme spek + «~ekv=1~topp=0.1~flat=8»
 * Hver arm: `examples/duplikat-menneske.ts` i 8 skarder over alle menneskekampene (alle fire seter
 * spilles av armen, som i tidligere K1-duplikat). Maks 3 prosesser samtidig, BelowNormal-prioritet.
 *
 * PARRET: radene kobles på (spill, runde). Hovedtallet er S1 − base i `bP` (100·ΔP(seier) for
 * sete 0); menneskeleddet er likt i begge og faller bort. SE: klyngebootstrap over kamper
 * (B = 20 000) og klynget sandwich-SE som kontroll. Delt på n én gang.
 *
 * KRAV (ellers ingen dom): ≥ 2000 runder per arm, samme nøkkelmengde i begge, ingen NaN.
 * BESLUTNINGSREGEL (skrevet før måling): S1 godkjennes hvis S1 − base ≥ −0,15 OG ikke
 * signifikant negativ (z > −1,96).
 *
 * GJENOPPTAKBAR: en skard med «.ferdig»-merke hoppes over; en halvferdig skardfil slettes før omstart.
 * Rapporten skrives av prosessen selv til D:/amb-grp/loop/fart-k1.md.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";

const ROT = "D:/amb-fart";
const DIR = "D:/amb-grp/loop/fartk1";
const RAPPORT = "D:/amb-grp/loop/fart-k1.md";
const STATUS = `${DIR}/status.log`;
const SKARDER = 8;
const SAMTIDIG = 3;
const P =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin";
const H = ":budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const ARMER = { base: `${P}${H}`, S1: `${P}~ekv=1~topp=0.1~flat=8${H}` };

mkdirSync(DIR, { recursive: true });
const logg = (s) => appendFileSync(STATUS, `${new Date().toISOString()} ${s}\n`);
try {
  os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch (e) {
  logg(`kunne ikke senke egen prioritet: ${e}`);
}

const kø = [];
for (let s = 0; s < SKARDER; s++) for (const arm of Object.keys(ARMER)) kø.push({ arm, s });
const fil = (j) => `${DIR}/${j.arm}-s${j.s}.jsonl`;
const tider = { base: 0, S1: 0 };

function kjør(j) {
  return new Promise((ok) => {
    if (existsSync(`${fil(j)}.ferdig`)) {
      logg(`hopper over ${j.arm} s${j.s} (ferdig fra før)`);
      return ok(0);
    }
    rmSync(fil(j), { force: true });
    const t0 = Date.now();
    const p = spawn(
      process.execPath,
      ["examples/duplikat-menneske.ts", "--spek", ARMER[j.arm], "--skard", `${j.s}/${SKARDER}`, "--ut", fil(j)],
      { cwd: ROT, stdio: ["ignore", "ignore", "pipe"] },
    );
    try {
      os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch (e) {
      logg(`kunne ikke senke prioritet for ${p.pid}: ${e}`);
    }
    let feil = "";
    p.stderr.on("data", (d) => (feil = (feil + d).slice(-2000)));
    logg(`start ${j.arm} s${j.s} pid ${p.pid}`);
    p.on("exit", (kode) => {
      const sek = (Date.now() - t0) / 1000;
      if (kode === 0) {
        tider[j.arm] += sek;
        writeFileSync(`${fil(j)}.ferdig`, `${sek}\n`);
        logg(`ferdig ${j.arm} s${j.s} på ${sek.toFixed(0)} s`);
      } else {
        logg(`FEIL ${j.arm} s${j.s} kode ${kode}: ${feil.replace(/\s+/g, " ")}`);
      }
      ok(kode ?? 1);
    });
  });
}

async function kjørAlle() {
  let i = 0;
  let feil = 0;
  const arbeider = async () => {
    while (i < kø.length) {
      const j = kø[i++];
      if ((await kjør(j)) !== 0) feil++;
    }
  };
  await Promise.all(Array.from({ length: SAMTIDIG }, arbeider));
  return feil;
}

const les = (arm) => {
  const rader = [];
  for (let s = 0; s < SKARDER; s++) {
    const f = fil({ arm, s });
    if (!existsSync(f)) continue;
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) if (l.trim()) rader.push(JSON.parse(l));
  }
  return rader;
};

function klynge(par) {
  // par: [{k, d}]; snitt, klynget sandwich-SE og bootstrap-SE over kamper.
  const N = par.length;
  const m = par.reduce((a, p) => a + p.d, 0) / N;
  const kl = new Map();
  for (const p of par) {
    const x = kl.get(p.k) ?? { s: 0, n: 0 };
    x.s += p.d;
    x.n++;
    kl.set(p.k, x);
  }
  const K = kl.size;
  let q = 0;
  for (const x of kl.values()) q += (x.s - m * x.n) ** 2;
  const seSandwich = Math.sqrt((K / (K - 1)) * q) / N;
  const liste = [...kl.values()];
  let rng = 20260917;
  const r = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const B = 20000;
  const bs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    let n = 0;
    for (let k = 0; k < K; k++) {
      const x = liste[Math.floor(r() * K)];
      s += x.s;
      n += x.n;
    }
    bs[b] = s / n;
  }
  const mb = bs.reduce((a, v) => a + v, 0) / B;
  const seBoot = Math.sqrt(bs.reduce((a, v) => a + (v - mb) ** 2, 0) / (B - 1));
  return { m, se: seBoot, seSandwich, N, K };
}

const f = (x, d = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",");

async function main() {
  writeFileSync(
    RAPPORT,
    `# K1 PARRET: S1 mot base — PÅGÅR\n\nStartet ${new Date().toISOString()} (pid ${process.pid}). Status: \`${STATUS}\`.\n\n` +
      `Beslutningsregel (før måling): S1 godkjennes hvis S1 − base ≥ −0,15 og ikke signifikant negativ.\n`,
  );
  logg(`driver startet, pid ${process.pid}`);
  const feil = await kjørAlle();
  const base = les("base");
  const s1 = les("S1");
  const problemer = [];
  if (feil > 0) problemer.push(`${feil} skard(er) feilet`);
  if (base.length < 2000) problemer.push(`base har bare ${base.length} runder`);
  if (s1.length < 2000) problemer.push(`S1 har bare ${s1.length} runder`);
  const nøkkel = (r) => `${r.spill}#${r.runde}`;
  const bMap = new Map(base.map((r) => [nøkkel(r), r]));
  const sMap = new Map(s1.map((r) => [nøkkel(r), r]));
  if (bMap.size !== base.length || sMap.size !== s1.length) problemer.push("duplikate (spill, runde)-nøkler");
  const bareB = [...bMap.keys()].filter((k) => !sMap.has(k));
  const bareS = [...sMap.keys()].filter((k) => !bMap.has(k));
  if (bareB.length + bareS.length > 0) problemer.push(`ulik nøkkelmengde: ${bareB.length} bare i base, ${bareS.length} bare i S1`);
  const felles = [...bMap.keys()].filter((k) => sMap.has(k));
  const nan = felles.filter((k) => ![bMap.get(k).bP, sMap.get(k).bP, bMap.get(k).bot, sMap.get(k).bot, bMap.get(k).mP].every(Number.isFinite));
  if (nan.length > 0) problemer.push(`${nan.length} rader med NaN/ikke-endelig verdi`);

  let t = `# K1 PARRET: S1 mot base\n\nFerdig ${new Date().toISOString()}. Gren \`fart-2026-09-17\` i \`${ROT}\`. Rådata: \`${DIR}\`.\n\n`;
  t += `- base: \`${ARMER.base}\`\n- S1: \`${ARMER.S1}\`\n\n`;
  t += `Duplikat på menneskekampene, 8 skarder per arm, alle fire seter = armen, BelowNormal. `;
  t += `SE: klyngebootstrap over kamper (B = 20 000); klynget sandwich i parentes.\n\n`;
  t += `**Beslutningsregel (skrevet før måling):** S1 godkjennes hvis S1 − base ≥ −0,15 og ikke signifikant negativ (z > −1,96).\n\n`;
  if (problemer.length > 0) {
    t += `## INGEN DOM — kravene er ikke oppfylt\n\n${problemer.map((p) => `- ${p}`).join("\n")}\n`;
    writeFileSync(RAPPORT, t);
    logg(`INGEN DOM: ${problemer.join("; ")}`);
    return;
  }
  const kamp = (k) => bMap.get(k).spill;
  const parP = felles.map((k) => ({ k: kamp(k), d: sMap.get(k).bP - bMap.get(k).bP }));
  const parR = felles.map((k) => ({ k: kamp(k), d: sMap.get(k).bot - bMap.get(k).bot }));
  const dP = klynge(parP);
  const dR = klynge(parR);
  const bmP = klynge(felles.map((k) => ({ k: kamp(k), d: bMap.get(k).bP - bMap.get(k).mP })));
  const smP = klynge(felles.map((k) => ({ k: kamp(k), d: sMap.get(k).bP - sMap.get(k).mP })));
  const ulike = felles.filter((k) => sMap.get(k).bot !== bMap.get(k).bot).length;
  const z = dP.m / dP.se;
  const godkjent = dP.m >= -0.15 && z > -1.96;
  t += `## Resultat (${dP.N} parrede runder i ${dP.K} kamper)\n\n`;
  t += `| mål | verdi |\n|---|---|\n`;
  t += `| **S1 − base, 100·ΔP(seier) per runde** | **${f(dP.m)} ± ${f(dP.se).slice(1)} pp** (sandwich ${f(dP.seSandwich).slice(1)}), z ${f(z, 2)} |\n`;
  t += `| S1 − base, rundepoeng | ${f(dR.m)} ± ${f(dR.se).slice(1)} (z ${f(dR.m / dR.se, 2)}) |\n`;
  t += `| base − menneske, ΔP | ${f(bmP.m)} ± ${f(bmP.se).slice(1)} pp |\n`;
  t += `| S1 − menneske, ΔP | ${f(smP.m)} ± ${f(smP.se).slice(1)} pp |\n`;
  t += `| runder med ulikt rundepoeng S1 mot base | ${ulike} av ${dP.N} |\n`;
  t += `| veggtid, sum over skarder | base ${(tider.base / 60).toFixed(0)} min, S1 ${(tider.S1 / 60).toFixed(0)} min (bare skarder kjørt i denne prosessen) |\n\n`;
  t += `## DOM: **${godkjent ? "S1 GODKJENT" : "S1 AVVIST"}**\n\n`;
  t += godkjent
    ? `S1 − base = ${f(dP.m)} ≥ −0,150 og z = ${f(z, 2)} > −1,96.\n`
    : `S1 − base = ${f(dP.m)}, z = ${f(z, 2)}: ${dP.m < -0.15 ? "under −0,15" : ""}${z <= -1.96 ? " signifikant negativ" : ""}.\n`;
  writeFileSync(RAPPORT, t);
  logg(`DOM ${godkjent ? "GODKJENT" : "AVVIST"}: ${dP.m.toFixed(4)} ± ${dP.se.toFixed(4)} (n=${dP.N}, K=${dP.K})`);
}

main().catch((e) => {
  logg(`KRASJ: ${e?.stack ?? e}`);
  appendFileSync(RAPPORT, `\n\n## KRASJ\n\n\`\`\`\n${e?.stack ?? e}\n\`\`\`\n`);
  process.exit(1);
});
