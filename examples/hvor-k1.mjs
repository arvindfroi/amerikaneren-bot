/**
 * PARRET K1 — frakoblet driver (17. sep).
 *
 *   node examples/fart-k1.mjs [--konfig <fil.json>]      (startes via WMI)
 *
 * Uten `--konfig`: S1-kjøringen (base mot S1, iter-8, regel «ikke verre»), rapport
 * D:/amb-grp/loop/fart-k1.md. Med `--konfig`:
 *   { dir, rapport, tittel, armer: {navn: spek}, ref, regel: "ikke-verre" | "forbedring",
 *     ventPå?: pid, forsjekk?: { args: [...], froe, ref, ut, arbeidere? } }
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
import { execSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";

const ROT = "D:/amb-hvor";
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
const DIR = K.dir;
const RAPPORT = K.rapport;
const STATUS = `${DIR}/status.log`;
const ARMER = K.armer;
const REF = K.ref;
const REGELTEKST =
  K.regel === "forbedring"
    ? "en arm tas i bruk hvis arm − ref ≥ +0,15 pp OG z > +1,96; ellers «mer tenketid hjelper ikke målbart»"
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

/**
 * TRENINGSKJEDEN HAR FØRSTEPRIORITET (18.–19. sep). BelowNormal alene holder ikke når 20 andre
 * node-prosesser alt deler 24 kjerner, så hvert skard venter til maskinen har plass. Mine egne
 * barn kjennes igjen på `K.merke` i kommandolinja (det ligger i `--ut`-stien) og telles ikke med.
 * `maksAndre` udefinert = ingen venting.
 */
const andreJobber = () => {
  try {
    const ut = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -notlike '*wonderwhy*' -and $_.CommandLine -notlike '*${K.merke}*' }).Count"`,
      { encoding: "utf8" },
    );
    const n = Number(ut.trim());
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    logg(`kunne ikke telle node-jobber (${e}); antar 0`);
    return 0;
  }
};

async function ventPåPlass(merke) {
  if (K.maksAndre === undefined) return;
  let n = andreJobber();
  if (n > K.maksAndre) logg(`venter med ${merke}: ${n} andre node-jobber (tak ${K.maksAndre})`);
  while (n > K.maksAndre) {
    await vent(300_000);
    n = andreJobber();
  }
}

async function kjør(j) {
  if (existsSync(`${fil(j)}.ferdig`)) {
    logg(`hopper over ${j.arm} s${j.s} (ferdig fra før)`);
    return 0;
  }
  await ventPåPlass(`${j.arm} s${j.s}`);
  rmSync(fil(j), { force: true });
  const ekstra = [];
  if (K.motstander !== undefined) ekstra.push("--motstander", K.motstander);
  if (K.etter !== undefined) ekstra.push("--etter", K.etter);
  return nodeKjør(
    ["examples/duplikat-menneske.ts", "--spek", ARMER[j.arm], ...ekstra, "--skard", `${j.s}/${SKARDER}`, "--ut", fil(j)],
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
    logg(`venter på at pid ${K.ventPå} blir ferdig (maks ${SAMTIDIG} prosesser totalt)`);
    while (lever(K.ventPå)) await vent(60_000);
    logg(`pid ${K.ventPå} er borte, starter`);
  }
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
  let felles = [...refKart.keys()].filter((k) => Object.values(kart).every((m) => m.has(k)));
  /**
   * KAMPSETTET, som batteriet (`analyse/k1-kampsett.tsv`): `utvalg` er porten, `holdout` rapporteres ved
   * siden av og går ALDRI inn i dommen. En kamp som mangler i lista er en stopp, ikke en stille utelatelse.
   */
  let settAv = null;
  if (K.kampsett !== undefined) {
    settAv = new Map();
    for (const l of readFileSync("analyse/k1-kampsett.tsv", "utf8").split(/\r?\n/)) {
      if (!l.trim() || l.startsWith("#") || l.startsWith("spill\t")) continue;
      const [id, v] = l.split("\t");
      if (id && v) settAv.set(id.trim(), v.trim());
    }
    const mangler = [...new Set(felles.map((k) => refKart.get(k).spill))].filter((id) => !settAv.has(id));
    if (mangler.length > 0) problemer.push(`${mangler.length} kamp(er) mangler i analyse/k1-kampsett.tsv, f.eks. «${mangler[0]}»`);
  }
  const iSett = (k, sett) => settAv === null || sett === "alle" || settAv.get(refKart.get(k).spill) === sett;
  const nan = felles.filter(
    (k) => !Object.values(kart).every((m) => [m.get(k).bP, m.get(k).bot, m.get(k).mP].every(Number.isFinite)),
  );
  if (nan.length > 0) problemer.push(`${nan.length} rader med NaN/ikke-endelig verdi`);

  let t = `# ${K.tittel}\n\nFerdig ${new Date().toISOString()}. Gren \`fart-2026-09-17\` i \`${ROT}\`. Rådata: \`${DIR}\`.\n\n`;
  for (const [a, sp] of Object.entries(ARMER)) t += `- ${a}${a === REF ? " (referanse)" : ""}: \`${sp}\`\n`;
  t += `\nDuplikat på menneskekampene, ${SKARDER} skarder per arm, BelowNormal. `;
  t += K.motstander === undefined ? `Alle fire seter = armen. ` : `De tre andre setene: \`${K.motstander}\`. `;
  if (K.etter !== undefined) t += `Bare runder fra ${K.etter}. `;
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
  const alleFelles = felles;
  const port = K.kampsett ?? "alle";
  felles = alleFelles.filter((k) => iSett(k, port));
  const K0 = new Set(felles.map(kamp)).size;
  t += `## Resultat — PORTEN: kampsett = ${port} (${felles.length} parrede runder i ${K0} kamper)\n\n`;
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
  t += `\nVeggtid gjelder bare skarder kjørt i denne prosessen, på en belastet maskin i BelowNormal.\n\n`;
  if (settAv !== null) {
    const andre = Object.keys(ARMER).filter((a) => a !== REF);
    t += `### Ved siden av porten (kontekst, går ALDRI inn i dommen)\n\n`;
    t += `| kampsett | n | ${Object.keys(ARMER).map((a) => `${a} − menneske`).join(" | ")} | ${andre.map((a) => `${a} − ${REF}`).join(" | ")} |\n`;
    t += `|---|---|${Object.keys(ARMER).map(() => "---").join("|")}|${andre.map(() => "---").join("|")}|\n`;
    for (const sett of ["alle", "utvalg", "holdout"]) {
      const u = alleFelles.filter((k) => iSett(k, sett));
      if (u.length === 0) continue;
      const mot = Object.keys(ARMER).map((a) => {
        const o = klynge(u.map((k) => ({ k: kamp(k), d: kart[a].get(k).bP - kart[a].get(k).mP })));
        return `${f(o.m)} ± ${f(o.se).slice(1)}`;
      });
      const rel = andre.map((a) => {
        const o = klynge(u.map((k) => ({ k: kamp(k), d: kart[a].get(k).bP - refKart.get(k).bP })));
        return `${f(o.m)} ± ${f(o.se).slice(1)}`;
      });
      t += `| ${sett} | ${u.length} | ${mot.join(" | ")} | ${rel.join(" | ")} |\n`;
    }
    t += `\n`;
  }
  if (K.regel === "forbedring") {
    const tatt = dommer.filter((d) => d.ok);
    t += `## DOM: ${tatt.length === 0 ? "**mer tenketid hjelper ikke målbart**" : `**${tatt.map((d) => d.a).join(", ")} tas i bruk**`}\n`;
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
