/**
 * VERIFIKASJON I PRODUKSJON (17. sep) — ingenting skrives til menneskedataene.
 *
 *   node examples/prod-verifiser.mjs [--url https://project-a9l2n.vercel.app/] [--ut <mappe>]
 *
 * Alle POST-er mot valen (loggen) fanges med `page.route` og besvares lokalt med «{}».
 * Hendelsene leses fra `localStorage` i stedet. Tre økter:
 *   B     uten parametere, 1280×800 uten berøring: minst én hel runde, tider per bottrekk
 *   iPad  uten parametere, 1180×820 med `hasTouch`: hele hånden synlig, skjermbilde
 *   A     `?ab=A`: starter, dagens bot (protokoll 3), minst én hel runde
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, s) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const URL0 = arg("--url", "https://project-a9l2n.vercel.app/");
const UT = arg("--ut", "D:/amb-grp/loop/ab-demo/prod");
const VAL = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";
mkdirSync(UT, { recursive: true });
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");

const nettleser = await chromium.launch();

async function økt(navn, sti, ctxValg, runder) {
  const ctx = await nettleser.newContext(ctxValg);
  const side = await ctx.newPage();
  let holdtTilbake = 0;
  const lekk = [];
  await ctx.route("**/*", (r) => {
    const q = r.request();
    if (q.method() === "POST") {
      if (q.url().startsWith(VAL)) holdtTilbake++;
      else lekk.push(q.url());
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return r.continue();
  });
  const feil = [];
  side.on("pageerror", (e) => feil.push(String(e).slice(0, 200)));
  const hentet = [];
  side.on("response", (r) => {
    const u = r.url();
    if (/\.(b64|js|json)(\?|$)/.test(u)) hentet.push(`${r.status()} ${u.replace(URL0, "/").replace(VAL, "VAL/")}`);
  });
  await side.goto(URL0 + sti);
  await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
  await side.waitForFunction(() => window.__m !== undefined);
  await side.evaluate(() => localStorage.clear());
  await side.fill("#navn", "prodverifisering");
  await side.click("#start-knapp");
  // Automatspiller på sete 0: pass, første lovlige kort, «neste», og panelene ved vrak/trumf.
  const t0 = Date.now();
  let hand = null;
  while (Date.now() - t0 < 8 * 60_000) {
    const st = await side.evaluate(async (vilHånd) => {
      const l = JSON.parse(localStorage.getItem("amerikaneren-logg") ?? "[]");
      const runder = l.filter((x) => x.type === "runde").length;
      let h = null;
      const ov = document.querySelector(".overlegg");
      const hk = document.querySelectorAll(".hjul .kort:not([disabled])");
      if (vilHånd && !ov && document.querySelectorAll(".hjul .kort").length === 12 && hk.length > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        h = window.__m.maal();
      }
      const p = document.querySelector("button.pass:not([disabled])");
      if (p) p.click();
      else if (ov) {
        const vk = [...ov.querySelectorAll("button.kort")];
        if (vk.length >= 16) {
          if (/4 av 4/.test(ov.innerText)) [...ov.querySelectorAll("button")].find((b) => /legg bort valgte/i.test(b.textContent))?.click();
          else vk.find((b) => b.getAttribute("aria-pressed") !== "true" && !b.classList.contains("valgt"))?.click();
        } else ov.querySelector("button:not(.kort):not([disabled])")?.click();
      } else if (hk.length > 0 && !vilHånd) hk[0].click();
      else if (!vilHånd) document.getElementById("neste")?.click();
      return { runder, h };
    }, hand === null && ctxValg.hasTouch === true);
    if (st.h !== null && hand === null) {
      hand = st.h;
      await side.screenshot({ path: join(UT, `${navn}-full-hand.png`) });
    }
    if (st.runder >= runder && (ctxValg.hasTouch !== true || hand !== null)) break;
    await side.waitForTimeout(600);
  }
  const logg = await side.evaluate(() => JSON.parse(localStorage.getItem("amerikaneren-logg") ?? "[]"));
  await ctx.close();
  const start = logg.find((x) => x.type === "start")?.data;
  const worker = logg.filter((x) => x.type === "worker").map((x) => x.data);
  const bottrekk = logg.filter((x) => x.type === "bottrekk").flatMap((x) => x.data.trekk);
  const tider = {};
  for (const [, fase, lag, ms] of bottrekk) (tider[fase] ??= []).push(ms);
  const stat = Object.fromEntries(
    Object.entries(tider).map(([f, l]) => {
      l.sort((a, b) => a - b);
      return [f, { n: l.length, median: l[Math.floor(l.length / 2)], p90: l[Math.floor(0.9 * l.length)], maks: l[l.length - 1] }];
    }),
  );
  const lag = {};
  for (const [, , l] of bottrekk) lag[l] = (lag[l] ?? 0) + 1;
  const detalj = logg.filter((x) => x.type === "bottrekk").flatMap((x) => x.data.detalj ?? []);
  const res = {
    økt: navn,
    spillId: logg[0]?.spillId,
    bundel: start?.bundel,
    modeller: start && { ab: start.modeller.ab, abFaktisk: start.modeller.abFaktisk, helbot: start.modeller.helbot, abTvunget: start.modeller.abTvunget, nett: start.modeller.nett, fart: start.modeller.fart, fristMs: start.modeller.fristMs, abVersjon: start.modeller.abVersjon },
    workerKilde: start?.workerKilde,
    worker,
    runder: logg.filter((x) => x.type === "runde").length,
    tider: stat,
    lag,
    nødbrems: detalj.filter((d) => d[2] === 1).length,
    bokbrudd: detalj.filter((d) => d[3] === 1).length,
    hand,
    holdtTilbake,
    lekk,
    feil,
    hentet: [...new Set(hentet)].filter((h) => /b64|worker|app\.js|json/.test(h)),
  };
  writeFileSync(join(UT, `${navn}.json`), JSON.stringify({ ...res, logg }, null, 1));
  return res;
}

const ut = [];
ut.push(await økt("B", "", { viewport: { width: 1280, height: 800 } }, 1));
ut.push(await økt("iPad", "", { viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 1 }, 1));
ut.push(await økt("A", "?ab=A", { viewport: { width: 1280, height: 800 } }, 1));
await nettleser.close();
for (const r of ut) console.log(JSON.stringify({ ...r, hand: r.hand && { låst: r.hand.låst, heltSynlige: r.hand.heltSynlige, n: r.hand.n, minStripe: r.hand.minStripe, kanScrolle: r.hand.kanScrolle } }));
