/**
 * PARRET K1 — frakoblet driver (17. sep).
 *
 *   node examples/fart-k1.mjs [--konfig <fil.json>]      (startes via WMI)
 *
 * Uten `--konfig`: S1-kjøringen (base mot S1, iter-8, regel «ikke verre»), rapport
 * D:/amb-grp/loop/fart-k1.md. Med `--konfig`:
 *   { dir, rapport, tittel, armer: {navn: spek}, ref, regel: "ikke-verre" | "forbedring",
 *     ventPå?: pid, ventPåFil?: fil, ventPåAlle?: [pid], rot?, gren?, nei?, motstander?, data?, etter?,
 *     kampsettFil?, forsjekk?: { args: [...], froe, ref, ut, arbeidere? } }
 *
 * Hver arm: `examples/duplikat-menneske.ts` i 8 skarder over alle menneskekampene (alle fire seter
 * spilles av armen). Maks 3 prosesser samtidig, BelowNormal på driveren og alle barn.
 * `ventPå`: start først når den prosessen er borte (så totalen aldri overstiger 3).
 * `forsjekk`: knottriggen kjøres og analysen skrives til fil FØR K1 starter.
 *
 * PARRET: radene kobles på (spill, runde). Hovedtallet er arm − ref i `bP` (100·ΔP(seier) for
 * sete 0); menneskeleddet er likt og faller bort. SE: klyngebootstrap over kamper (B = 20 000),
 * klynget sandwich-SE som kontroll. Delt på n én gang.
 *
 * KRAV (ellers ingen dom): ≥ 2000 runder per arm, samme nøkkelmengde i alle armer, ingen NaN.
 * GJENOPPTAKBAR: en skard med «.ferdig»-merke hoppes over; en halvferdig skardfil slettes før omstart.
 * Rapporten skrives av prosessen selv.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";

const SKARDER = 8;
const SAMTIDIG = 3;
const P =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin";
const H = ":budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

const iK = process.argv.indexOf("--konfig");
const K =
  iK < 0
    ? {
        dir: "D:/amb-grp/loop/fartk1",
        rapport: "D:/amb-grp/loop/fart-k1.md",
        tittel: "K1 PARRET: S1 mot base",
        armer: { base: `${P}${H}`, S1: `${P}~ekv=1~topp=0.1~flat=8${H}` },
        ref: "base",
        regel: "ikke-verre",
      }
    : JSON.parse(readFileSync(process.argv[iK + 1], "utf8"));
/** Arbeidstreet barna kjører i (`rot` i konfig, 18. sep); standard som før. */
const ROT = K.rot ?? "D:/amb-fart";
const GREN = K.gren ?? "fart-2026-09-17";
/** Dommen når ingen arm består «forbedring»-regelen. */
const NEI = K.nei ?? "mer tenketid hjelper ikke målbart";
/**
 * ============ BORDET (18. sep, `D:/amb-grp/loop/k1-avstemming.md`) =========================
 *
 * UTEN `--motstander` sitter ARMEN i alle fire seter. Da endres motstanderne sammen med knotten, og en
 * jevn styrkeendring kansellerer delvis: krysstesten målte −0,28 ± 0,54 med armen rundt hele bordet mot
 * +1,20 ± 0,53 med v5 i de tre andre setene, på samme spek og samme runder (parret differanse 1,48 pp).
 * Batteriet (løkkas K1) har alltid kjørt `--motstander <v5-kjeden> --data <logg> --etter 2026-08-10`, og en
 * K1 som skal kunne sammenliknes med den MÅ kalle `duplikat-menneske.ts` likt. Feltene legges rett på
 * kommandolinja; uten dem er kallet som før.
 */
const DUP = [
  ...(K.motstander === undefined ? [] : ["--motstander", K.motstander]),
  ...(K.data === undefined ? [] : ["--data", K.data]),
  ...(K.etter === undefined ? [] : ["--etter", K.etter]),
];
/**
 * KAMPSETTET er bare RAPPORT her: batteriets port går på «utvalg» og rapporterer «holdout», mens dommen
 * under følger den registrerte regelen på ALLE kampene. De to settene skrives ved siden av, så tallene kan
 * sammenliknes med batteriets.
 */
const KAMPSETT =
  K.kampsettFil === undefined
    ? null
    : new Map(
        readFileSync(K.kampsettFil, "utf8")
          .split(/\r?\n/)
          .map((l) => l.split("\t"))
          .filter((d) => d.length >= 2 && !d[0].startsWith("#") && d[0].trim() !== "spill")
          .map((d) => [d[0].trim(), d[1].trim()]),
      );
const DIR = K.dir;
const RAPPORT = K.rapport;
const STATUS = `${DIR}/status.log`;
const ARMER = K.armer;
const REF = K.ref;
const REGELTEKST =
  K.regel === "forbedring"
    ? `en arm tas i bruk hvis arm − ref ≥ +0,15 pp OG z > +1,96; ellers «${NEI}»`
    : "armen godkjennes hvis arm − ref ≥ −0,15 pp og ikke signifikant negativ (z > −1,96)";

mkdirSync(DIR, { recursive: true });
const logg = (s) => appendFileSync(STATUS, `${new Date().toISOString()} ${s}\n`);
const lav = (pid) => {
  try {
    os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch (e) {
    logg(`kunne ikke senke prioritet for ${pid}: ${e}`);
  }
};
lav(process.pid);

const kø = [];
for (let s = 0; s < SKARDER; s++) for (const arm of Object.keys(ARMER)) kø.push({ arm, s });
const fil = (j) => `${DIR}/${j.arm}-s${j.s}.jsonl`;
const tider = Object.fromEntries(Object.keys(ARMER).map((a) => [a, 0]));
const lever = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const vent = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Kjører node med `args` i ROT, BelowNormal; løser med exit-kode. */
function nodeKjør(args, merke, påFerdig) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, args, { cwd: ROT, stdio: ["ignore", "ignore", "pipe"] });
    lav(p.pid);
    let feil = "";
    p.stderr.on("data", (d) => (feil = (feil + d).slice(-2000)));
    logg(`start ${merke} pid ${p.pid}`);
    p.on("exit", (kode) => {
      const sek = (Date.now() - t0) / 1000;
      if (kode === 0) {
        påFerdig?.(sek);
        logg(`ferdig ${merke} på ${sek.toFixed(0)} s`);
      } else {
        logg(`FEIL ${merke} kode ${kode}: ${feil.replace(/\s+/g, " ")}`);
      }
      ok(kode ?? 1);
    });
  });
}

function kjør(j) {
  if (existsSync(`${fil(j)}.ferdig`)) {
    logg(`hopper over ${j.arm} s${j.s} (ferdig fra før)`);
    return Promise.resolve(0);
  }
  rmSync(fil(j), { force: true });
  return nodeKjør(
    ["examples/duplikat-menneske.ts", "--spek", ARMER[j.arm], ...DUP, "--skard", `${j.s}/${SKARDER}`, "--ut", fil(j)],
    `${j.arm} s${j.s}`,
    (sek) => {
      tider[j.arm] += sek;
      writeFileSync(`${fil(j)}.ferdig`, `${sek}\n`);
    },
  );
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
  const N = par.length;
  const m = par.reduce((a, p) => a + p.d, 0) / N;
  const kl = new Map();
  for (const p of par) {
    const x = kl.get(p.k) ?? { s: 0, n: 0 };
    x.s += p.d;
    x.n++;
    kl.set(p.k, x);
  }
  const Kn = kl.size;
  let q = 0;
  for (const x of kl.values()) q += (x.s - m * x.n) ** 2;
  const seSandwich = Math.sqrt((Kn / (Kn - 1)) * q) / N;
  const liste = [...kl.values()];
  let rng = 20260917;
  const r = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const B = 20000;
  const bs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    let n = 0;
    for (let k = 0; k < Kn; k++) {
      const x = liste[Math.floor(r() * Kn)];
      s += x.s;
      n += x.n;
    }
    bs[b] = s / n;
  }
  const mb = bs.reduce((a, v) => a + v, 0) / B;
  const seBoot = Math.sqrt(bs.reduce((a, v) => a + (v - mb) ** 2, 0) / (B - 1));
  return { m, se: seBoot, seSandwich, N, K: Kn };
}

const f = (x, d = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",");

async function main() {
  writeFileSync(
    RAPPORT,
    `# ${K.tittel} — PÅGÅR\n\nStartet ${new Date().toISOString()} (pid ${process.pid}). Status: \`${STATUS}\`.\n\n` +
      `Beslutningsregel (før måling): ${REGELTEKST}.\n`,
  );
  logg(`driver startet, pid ${process.pid}`);
  if (K.ventPå !== undefined) {
    /**
     * `ventPåFil` (18. sep): vent så lenge prosessen lever OG fila fortsatt sier «PÅGÅR». Ferdig rapport
     * slipper oss løs selv om pid-en skulle være gjenbrukt; død prosess slipper oss løs selv om fila står.
     */
    const pågår = () => K.ventPåFil === undefined || (existsSync(K.ventPåFil) && readFileSync(K.ventPåFil, "utf8").includes("PÅGÅR"));
    logg(`venter på pid ${K.ventPå}${K.ventPåFil ? ` / ${K.ventPåFil}` : ""} (maks ${SAMTIDIG} prosesser totalt)`);
    while (lever(K.ventPå) && pågår()) await vent(60_000);
    logg(`pid ${K.ventPå} ${lever(K.ventPå) ? "lever, men rapporten er ferdig" : "er borte"}`);
  }
  if (K.ventPåAlle !== undefined) {
    logg(`venter på egne pid-er ${K.ventPåAlle.join(", ")}`);
    while (K.ventPåAlle.some(lever)) await vent(60_000);
  }
  logg("starter");
  if (K.forsjekk !== undefined) {
    const fs = K.forsjekk;
    const n = fs.arbeidere ?? SAMTIDIG;
    const ark = Array.from({ length: n }, (_, w) => `${DIR}/forsjekk-w${w}.jsonl`);
    const koder = await Promise.all(
      ark.map((ut, w) => {
        rmSync(ut, { force: true });
        return nodeKjør([...fs.args, "--froe", String(fs.froe + 1000 * w), "--ut", ut], `forsjekk w${w}`);
      }),
    );
    if (koder.some((k) => k !== 0)) {
      appendFileSync(RAPPORT, `\n## STOPPET: forsjekken feilet (${koder.join(",")}); ingen K1 startet.\n`);
      logg("forsjekken feilet; stopper");
      return;
    }
    await nodeKjør(["examples/fart-knott-analyse.mjs", ...ark, "--ref", fs.ref, "--skriv", fs.ut, "--gruppe", "stikk"], "forsjekk-analyse");
    logg(`forsjekken skrevet til ${fs.ut}; K1 starter`);
  }
  const feil = await kjørAlle();

  const data = Object.fromEntries(Object.keys(ARMER).map((a) => [a, les(a)]));
  const problemer = [];
  if (feil > 0) problemer.push(`${feil} skard(er) feilet`);
  const nøkkel = (r) => `${r.spill}#${r.runde}`;
  const kart = {};
  for (const [a, rader] of Object.entries(data)) {
    if (rader.length < 2000) problemer.push(`${a} har bare ${rader.length} runder`);
    kart[a] = new Map(rader.map((r) => [nøkkel(r), r]));
    if (kart[a].size !== rader.length) problemer.push(`${a}: duplikate (spill, runde)-nøkler`);
  }
  const refKart = kart[REF];
  for (const a of Object.keys(ARMER)) {
    if (a === REF) continue;
    const bareR = [...refKart.keys()].filter((k) => !kart[a].has(k)).length;
    const bareA = [...kart[a].keys()].filter((k) => !refKart.has(k)).length;
    if (bareR + bareA > 0) problemer.push(`ulik nøkkelmengde ${REF}/${a}: ${bareR} bare i ${REF}, ${bareA} bare i ${a}`);
  }
  const felles = [...refKart.keys()].filter((k) => Object.values(kart).every((m) => m.has(k)));
  const nan = felles.filter(
    (k) => !Object.values(kart).every((m) => [m.get(k).bP, m.get(k).bot, m.get(k).mP].every(Number.isFinite)),
  );
  if (nan.length > 0) problemer.push(`${nan.length} rader med NaN/ikke-endelig verdi`);

  let t = `# ${K.tittel}\n\nFerdig ${new Date().toISOString()}. Gren \`${GREN}\` i \`${ROT}\`. Rådata: \`${DIR}\`.\n\n`;
  for (const [a, sp] of Object.entries(ARMER)) t += `- ${a}${a === REF ? " (referanse)" : ""}: \`${sp}\`\n`;
  t += `\nDuplikat på menneskekampene, ${SKARDER} skarder per arm, `;
  t += DUP.length === 0 ? "alle fire seter = armen" : `bordet: \`${DUP.join(" ")}\` (armen i sete 0)`;
  t += `, BelowNormal. `;
  t += `SE: klyngebootstrap over kamper (B = 20 000); klynget sandwich i parentes.\n\n`;
  t += `**Beslutningsregel (skrevet før måling):** ${REGELTEKST}.\n\n`;
  if (K.forsjekk !== undefined) t += `Forsjekk (knottriggen, skrevet før K1): \`${K.forsjekk.ut}\`.\n\n`;
  if (problemer.length > 0) {
    t += `## INGEN DOM — kravene er ikke oppfylt\n\n${problemer.map((p) => `- ${p}`).join("\n")}\n`;
    writeFileSync(RAPPORT, t);
    logg(`INGEN DOM: ${problemer.join("; ")}`);
    return;
  }
  const kamp = (k) => refKart.get(k).spill;
  const K0 = new Set(felles.map(kamp)).size;
  t += `## Resultat (${felles.length} parrede runder i ${K0} kamper)\n\n`;
  t += `| arm | arm − menneske, ΔP (pp) | arm − ${REF}, ΔP (pp) | z | arm − ${REF}, rundepoeng | runder med ulikt rundepoeng | veggtid (sum skarder) | dom |\n`;
  t += `|---|---|---|---|---|---|---|---|\n`;
  const dommer = [];
  for (const a of Object.keys(ARMER)) {
    const m = kart[a];
    const mot = klynge(felles.map((k) => ({ k: kamp(k), d: m.get(k).bP - m.get(k).mP })));
    const tid = `${(tider[a] / 60).toFixed(0)} min`;
    if (a === REF) {
      t += `| ${a} | ${f(mot.m)} ± ${f(mot.se).slice(1)} | – | – | – | – | ${tid} | referanse |\n`;
      continue;
    }
    const dP = klynge(felles.map((k) => ({ k: kamp(k), d: m.get(k).bP - refKart.get(k).bP })));
    const dR = klynge(felles.map((k) => ({ k: kamp(k), d: m.get(k).bot - refKart.get(k).bot })));
    const z = dP.m / dP.se;
    const ok = K.regel === "forbedring" ? dP.m >= 0.15 && z > 1.96 : dP.m >= -0.15 && z > -1.96;
    const ulike = felles.filter((k) => m.get(k).bot !== refKart.get(k).bot).length;
    const dom = K.regel === "forbedring" ? (ok ? "**TAS I BRUK**" : "ikke målbart bedre") : ok ? "**GODKJENT**" : "**AVVIST**";
    dommer.push({ a, ok, dP, z });
    t += `| ${a} | ${f(mot.m)} ± ${f(mot.se).slice(1)} | **${f(dP.m)} ± ${f(dP.se).slice(1)}** (${f(dP.seSandwich).slice(1)}) | ${f(z, 2)} | ${f(dR.m)} ± ${f(dR.se).slice(1)} | ${ulike} | ${tid} | ${dom} |\n`;
    logg(`DOM ${a}: ${dP.m.toFixed(4)} ± ${dP.se.toFixed(4)} z ${z.toFixed(2)} (n=${dP.N}, K=${dP.K}) → ${ok}`);
  }
  if (KAMPSETT !== null) {
    t += `\n### Kampsett (rapport, ikke port): dommen over er på ALLE kampene\n\n| arm | utvalg | holdout |\n|---|---|---|\n`;
    for (const a of Object.keys(ARMER)) {
      if (a === REF) continue;
      const m = kart[a];
      const del = (sett) => {
        const u = felles.filter((x) => KAMPSETT.get(refKart.get(x).spill) === sett);
        if (u.length === 0) return "–";
        const d = klynge(u.map((x) => ({ k: kamp(x), d: m.get(x).bP - refKart.get(x).bP })));
        return `${f(d.m)} ± ${f(d.se).slice(1)} (${d.N} runder, ${d.K} kamper)`;
      };
      t += `| ${a} | ${del("utvalg")} | ${del("holdout")} |\n`;
    }
  }
  t += `\nVeggtid gjelder bare skarder kjørt i denne prosessen, på en belastet maskin i BelowNormal.\n\n`;
  if (K.regel === "forbedring") {
    const tatt = dommer.filter((d) => d.ok);
    t += `## DOM: ${tatt.length === 0 ? `**${NEI}**` : `**${tatt.map((d) => d.a).join(", ")} tas i bruk**`}\n`;
  } else {
    t += `## DOM\n\n${dommer.map((d) => `- ${d.a}: ${d.ok ? "GODKJENT" : "AVVIST"} (${f(d.dP.m)}, z ${f(d.z, 2)})`).join("\n")}\n`;
  }
  writeFileSync(RAPPORT, t);
}

main().catch((e) => {
  logg(`KRASJ: ${e?.stack ?? e}`);
  appendFileSync(RAPPORT, `\n\n## KRASJ\n\n\`\`\`\n${e?.stack ?? e}\n\`\`\`\n`);
  process.exit(1);
});
