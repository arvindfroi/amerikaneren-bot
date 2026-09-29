/**
 * ENHETSPRØVEN (29. sep): er `hand`- og `start.skjerm`-radene CSS-px eller enhetspiksler?
 *
 *   node examples/spill-lokal.ts --port 8793 &
 *   node examples/ipad-enheter.mjs [--w 1080] [--h 695] [--dpr 2]
 *
 * Spiller fram til spillfasen og skriver ut NØYAKTIG de feltene loggen sender, side om side med
 * de samme tallene lest direkte fra DOM-en og fra `screen`/`visualViewport`. Betatesterens rader
 * kan da sammenlignes felt for felt. `spill-lokal.ts` holder logg-POST tilbake.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, s) => { const i = process.argv.indexOf(n); return i < 0 ? s : (process.argv[i + 1] ?? s); };
const URL0 = arg("--url", "http://localhost:8793/");
const W = Number(arg("--w", "1080")), H = Number(arg("--h", "695")), DPR = Number(arg("--dpr", "2"));
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");

const nettleser = await chromium.launch();
const ctx = await nettleser.newContext({ viewport: { width: W, height: H }, hasTouch: true, deviceScaleFactor: DPR });
const side = await ctx.newPage();
await side.goto(`${URL0}?ab=A`);
await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
await side.waitForFunction(() => window.__m !== undefined);
await side.evaluate(() => window.__m.tilSpill("enhetsprove"));
const ut = await side.evaluate(() => {
  const hj = document.querySelector(".hjul");
  const k = hj.querySelector(".kort");
  const vv = window.visualViewport;
  return {
    hjulSteg: (() => { const ks = [...document.querySelectorAll(".hjul .kort")].map((e) => e.getBoundingClientRect().left); ks.sort((a,b)=>a-b); return ks.length > 1 ? Math.round(ks[1] - ks[0]) : null; })(),
    innerWidth: innerWidth, innerHeight: innerHeight,
    dpr: devicePixelRatio,
    screen: [screen.width, screen.height],
    outer: [outerWidth, outerHeight],
    vv: vv ? { b: Math.round(vv.width), h: Math.round(vv.height), skala: vv.scale } : null,
    hjulClientWidth: hj.clientWidth,
    kortOffsetWidth: k?.offsetWidth ?? null,
    kortRect: k ? Math.round(k.getBoundingClientRect().width) : null,
    // Det loggen kaller «rad»: den MÅLTE bredden håndraden fikk.
    handradClientWidth: document.querySelector(".handrad").clientWidth,
    baseFont: getComputedStyle(document.body).fontSize,
  };
});
console.log(JSON.stringify(ut, null, 1));
await nettleser.close();
