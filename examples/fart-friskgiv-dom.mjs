/**
 * BEKREFTELSEN AV ARM1 PÅ FRISKE GIV (18. sep) — frakoblet driver.
 *
 *   node examples/fart-friskgiv-dom.mjs --konfig D:/amb-grp/loop/arm1bekreft/konfig.json
 *
 * Kjører `examples/fart-friskgiv.ts` i tre skarder (BelowNormal), leser radene og skriver dommen selv.
 * Paret er GIVEN: arm A og arm B spiller nøyaktig samme giv mot samme motstand, så givvariansen er
 * borte og tallet deler ingen støy med K1-korpuset.
 *
 * KRAV: minst `minGiv` par, ingen NaN, begge armene til stede i hver rad.
 * REGEL (fra konfigen, skrevet før kjøring): arm tas i bruk hvis a − b ≥ terskel OG z > 1,96.
 * Tegntest over par rapporteres ved siden av, fordi poengfordelingen har tunge haler.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";

const ROT = "D:/amb-fart";
const iK = process.argv.indexOf("--konfig");
const K = JSON.parse(readFileSync(process.argv[iK + 1], "utf8"));
const DIR = K.dir;
const STATUS = `${DIR}/status.log`;
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

const SKARD = K.skarder ?? 3;
const fil = (i) => `${DIR}/s${i}.jsonl`;

function kjør(i) {
  return new Promise((ok) => {
    if (existsSync(`${fil(i)}.ferdig`)) {
      logg(`hopper over skard ${i} (ferdig fra før)`);
      return ok(0);
    }
    rmSync(fil(i), { force: true });
    const t0 = Date.now();
    const p = spawn(
      process.execPath,
      [
        "examples/fart-friskgiv.ts",
        "--a", K.a, "--b", K.b, "--motstander", K.motstander,
        "--froe0", String(K.froe0), "--giv", String(K.giv),
        "--skard", `${i}/${SKARD}`, "--ut", fil(i),
      ],
      { cwd: ROT, stdio: ["ignore", "ignore", "pipe"] },
    );
    lav(p.pid);
    let feil = "";
    p.stderr.on("data", (d) => (feil = (feil + d).slice(-2000)));
    logg(`start skard ${i} pid ${p.pid}`);
    p.on("exit", (kode) => {
      const sek = (Date.now() - t0) / 1000;
      if (kode === 0) {
        writeFileSync(`${fil(i)}.ferdig`, `${sek}\n`);
        logg(`ferdig skard ${i} på ${sek.toFixed(0)} s`);
      } else {
        logg(`FEIL skard ${i} kode ${kode}: ${feil.replace(/\s+/g, " ")}`);
      }
      ok(kode ?? 1);
    });
  });
}

const f = (x, d = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",");

async function main() {
  writeFileSync(
    K.rapport,
    `# ${K.tittel} — PÅGÅR\n\nStartet ${new Date().toISOString()} (pid ${process.pid}). Status: \`${STATUS}\`.\n`,
  );
  logg(`driver startet, pid ${process.pid}`);
  /**
   * TRENINGSKJEDEN HAR FØRSTEPRIORITET. Er maskinen full av andres node-jobber, ventes det heller enn
   * å presse seg inn — BelowNormal alene holder ikke når 20 prosesser alt deler 24 kjerner.
   */
  if (K.maksAndre !== undefined) {
    const { execSync } = await import("node:child_process");
    const andre = () => {
      try {
        const ut = execSync(
          'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -notlike \'*wonderwhy*\' -and $_.CommandLine -notlike \'*fart-friskgiv*\' }).Count"',
          { encoding: "utf8" },
        );
        return Number(ut.trim());
      } catch {
        return 0;
      }
    };
    let n = andre();
    if (n > K.maksAndre) logg(`venter: ${n} andre node-jobber (tak ${K.maksAndre})`);
    while (n > K.maksAndre) {
      await new Promise((ok) => setTimeout(ok, 300_000));
      n = andre();
    }
    logg(`plass på maskinen (${n} andre jobber), starter skardene`);
  }
  const koder = await Promise.all(Array.from({ length: SKARD }, (_, i) => kjør(i)));
  const rader = [];
  for (let i = 0; i < SKARD; i++) {
    if (!existsSync(fil(i))) continue;
    for (const l of readFileSync(fil(i), "utf8").split(/\r?\n/)) if (l.trim()) rader.push(JSON.parse(l));
  }
  const problemer = [];
  if (koder.some((k) => k !== 0)) problemer.push(`${koder.filter((k) => k !== 0).length} skard(er) feilet`);
  if (rader.length < K.minGiv) problemer.push(`bare ${rader.length} giv (krav ${K.minGiv})`);
  const nan = rader.filter((r) => ![r.a?.bP, r.b?.bP, r.a?.poeng, r.b?.poeng].every(Number.isFinite));
  if (nan.length > 0) problemer.push(`${nan.length} rader med NaN`);
  const frø = new Set(rader.map((r) => r.frø));
  if (frø.size !== rader.length) problemer.push(`duplikate giv: ${rader.length - frø.size}`);

  let t = `# ${K.tittel}\n\nFerdig ${new Date().toISOString()}. Gren \`fart-2026-09-17\` i \`${ROT}\`. Rådata: \`${DIR}\`.\n\n`;
  t += `- arm A: \`${K.a}\`\n- arm B (referanse): \`${K.b}\`\n- motstand i de tre andre setene: \`${K.motstander}\`\n`;
  t += `- frøbånd: ${K.froe0}–${K.froe0 + K.giv - 1} (${K.giv} giv, én runde per giv, fersk poengtavle 0–0–0–0)\n\n`;
  t += `**Regel (skrevet før kjøring):** A tas i bruk hvis A − B ≥ ${f(K.terskel, 2)} pp OG z > 1,96.\n\n`;
  if (problemer.length > 0) {
    t += `## INGEN DOM\n\n${problemer.map((p) => `- ${p}`).join("\n")}\n`;
    writeFileSync(K.rapport, t);
    logg(`INGEN DOM: ${problemer.join("; ")}`);
    return;
  }
  const stat = (d) => {
    const n = d.length;
    const m = d.reduce((a, x) => a + x, 0) / n;
    const v = d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1);
    return { m, se: Math.sqrt(v / n), n, z: m / Math.sqrt(v / n) };
  };
  const dP = stat(rader.map((r) => r.a.bP - r.b.bP));
  const dPo = stat(rader.map((r) => r.a.poeng - r.b.poeng));
  const ulike = rader.filter((r) => r.a.poeng !== r.b.poeng || r.a.bP !== r.b.bP);
  const opp = ulike.filter((r) => r.a.bP > r.b.bP).length;
  const ned = ulike.filter((r) => r.a.bP < r.b.bP).length;
  // Tosidig tegntest, normaltilnærming over de parene der armene skilte lag.
  const nT = opp + ned;
  const zT = nT > 0 ? (opp - nT / 2) / Math.sqrt(nT / 4) : NaN;
  const ok = dP.m >= K.terskel && dP.z > 1.96;
  t += `## Resultat (${dP.n} parrede giv)\n\n`;
  t += `| mål | verdi |\n|---|---|\n`;
  t += `| **A − B, 100·ΔP(seier) per runde** | **${f(dP.m)} ± ${f(dP.se).slice(1)} pp**, z ${f(dP.z, 2)} |\n`;
  t += `| A − B, rundepoeng | ${f(dPo.m)} ± ${f(dPo.se).slice(1)}, z ${f(dPo.z, 2)} |\n`;
  t += `| giv der armene skilte lag | ${ulike.length} av ${dP.n} (${((100 * ulike.length) / dP.n).toFixed(1)} %) |\n`;
  t += `| tegntest på de givene | A bedre i ${opp}, verre i ${ned}, z ${f(zT, 2)} |\n\n`;
  t += `## DOM: **${ok ? "arm1 BEKREFTET — tas i bruk" : "ikke bekreftet"}**\n\n`;
  t += ok
    ? `A − B = ${f(dP.m)} ≥ ${f(K.terskel, 2)} og z = ${f(dP.z, 2)} > 1,96.\n`
    : `A − B = ${f(dP.m)} (z ${f(dP.z, 2)}) når ikke regelen (≥ ${f(K.terskel, 2)} og z > 1,96).\n`;
  writeFileSync(K.rapport, t);
  logg(`DOM ${ok ? "BEKREFTET" : "IKKE BEKREFTET"}: ${dP.m.toFixed(4)} ± ${dP.se.toFixed(4)} z ${dP.z.toFixed(2)} n=${dP.n}`);
}

main().catch((e) => {
  logg(`KRASJ: ${e?.stack ?? e}`);
  appendFileSync(K.rapport, `\n\n## KRASJ\n\n\`\`\`\n${e?.stack ?? e}\n\`\`\`\n`);
  process.exit(1);
});
