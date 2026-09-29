/**
 * Skjermbilder av bordet i flere FASER på én form (29. sep), for øyekontroll av stikkraden.
 *
 *   node examples/spill-lokal.ts --port 8793 &
 *   node examples/ipad-bord-faser.mjs [--w 1098] [--h 695] [--ut <mappe>]
 *
 * Tar bilde av: budrunden, vrakpanelet, tomt bord, mitt eget kort lagt, fullt stikk (fire kort)
 * og det avgjorte stikket. `spill-lokal.ts` holder logg-POST tilbake.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, s) => { const i = process.argv.indexOf(n); return i < 0 ? s : (process.argv[i + 1] ?? s); };
const URL0 = arg("--url", "http://localhost:8793/");
const W = Number(arg("--w", "1098")), H = Number(arg("--h", "695"));
const UT = arg("--ut", `D:/amb-grp/loop/ab-demo/ipad-bord-faser-${W}x${H}`);
mkdirSync(UT, { recursive: true });
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");

const nettleser = await chromium.launch();
const ctx = await nettleser.newContext({ viewport: { width: W, height: H }, hasTouch: true, deviceScaleFactor: 2 });
const side = await ctx.newPage();
await side.goto(`${URL0}?ab=A`);
await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
await side.waitForFunction(() => window.__m !== undefined);
const logg = [];
const skudd = async (navn) => { await side.screenshot({ path: join(UT, `${navn}.png`) }); logg.push(navn); };

await side.evaluate(() => { document.getElementById("navn").value = "faseprove"; document.getElementById("start-knapp").click(); });
await side.waitForTimeout(2500);
await skudd("1-bud");
// Videre uten å starte på nytt: by høyest, kom til vrakpanelet, så inn i spillfasen.
const fram = (stopp) => side.evaluate(async (s) => {
  const vent = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 120; i++) {
    const ov = document.querySelector(".overlegg");
    if (s === "vrak" && ov && ov.querySelectorAll("button.kort").length >= 16) { await vent(700); return "vrak"; }
    if (s === "spill" && !ov && document.querySelectorAll(".hjul .kort:not([disabled])").length > 0) { await vent(1200); return "spill"; }
    const bud = [...document.querySelectorAll("button.tallbud:not([disabled])")];
    if (bud.length) { bud[bud.length - 1].click(); await vent(400); continue; }
    if (ov) {
      const vk = [...ov.querySelectorAll("button.kort")];
      if (vk.length >= 16) {
        if (/4 av 4/.test(ov.innerText)) [...ov.querySelectorAll("button")].find((b) => /legg bort valgte/i.test(b.textContent))?.click();
        else vk.find((b) => b.getAttribute("aria-pressed") !== "true" && !b.classList.contains("valgt"))?.click();
        await vent(200); continue;
      }
      ov.querySelector("button:not(.kort):not([disabled])")?.click();
    }
    await vent(400);
  }
  return "tidsavbrudd";
}, stopp);
console.log("vrak:", await fram("vrak"));
await skudd("2-vrak");
console.log("spill:", await fram("spill"));
await skudd("3-tomt-bord");
// Legg mitt eget kort.
await side.evaluate(async () => {
  const vent = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200; i++) {
    const l = [...document.querySelectorAll(".hjul .kort:not([disabled])")];
    if (l.length) { l[l.length >> 1].click(); return "lagt"; }
    await vent(150);
  }
  return "nei";
});
await side.waitForTimeout(400);
await skudd("4-mitt-kort");
await side.waitForTimeout(1600);
await skudd("5-fullt-stikk");
await side.waitForTimeout(1400);
await skudd("6-avgjort");
await nettleser.close();
writeFileSync(join(UT, "bilder.json"), JSON.stringify(logg, null, 1));
console.log(UT, logg.join(" "));
