/**
 * PROTOTYPE, IKKE APPKODE (29. sep): hånden som TO RADER À 6 i stedet for én vifte med 12.
 *
 *   node examples/spill-lokal.ts --port 8793 &
 *   node examples/ipad-hand-2x6.mjs [--w 1080] [--h 695]
 *
 * Koordinatoren ba om at alternativet ble vurdert og VIST. Dette skriptet legger et overstyrende
 * stilark oppå den kjørende sida og tar bildet — ingenting av det er bygget inn i appen.
 *
 * Rammen er satt slik at HÅNDRADEN BEHOLDER HØYDEN sin (samme som vifta har i v20), for ellers
 * sammenlignes to ting som har tatt ulikt mye plass fra bordet. Under den rammen er regnestykket:
 *
 *     radhøyde  = kh · (1 + OVERLAPP)      der kh = kb / 0,714
 *     radbredde = 6 · kb + 5 · gap         (og den er rikelig: 6 kort tar under 80 % av bredden)
 *
 * Skriver ut hva hvert alternativ faktisk gir av synlig kortflate.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, s) => { const i = process.argv.indexOf(n); return i < 0 ? s : (process.argv[i + 1] ?? s); };
const URL0 = arg("--url", "http://localhost:8793/");
const W = Number(arg("--w", "1080")), H = Number(arg("--h", "695"));
const UT = arg("--ut", `D:/amb-grp/loop/ab-demo/ipad-hand-2x6-${W}x${H}`);
mkdirSync(UT, { recursive: true });
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");
/** Hvor stor del av det bakerste kortet som er gjemt bak det fremste. */
const OVERLAPP = 0.55;
const GAP = 8;

const nettleser = await chromium.launch();
const ctx = await nettleser.newContext({ viewport: { width: W, height: H }, hasTouch: true, deviceScaleFactor: 2 });
const side = await ctx.newPage();
await side.goto(`${URL0}?ab=A`);
await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
await side.waitForFunction(() => window.__m !== undefined);
await side.evaluate(() => window.__m.tilSpill("prototype2x6"));
// Vent til det ligger kort på bordet, så bildene viser det samme som de andre bevisene.
await side.evaluate(async () => {
  const vent = (ms) => new Promise((r) => setTimeout(r, ms));
  const paa = () => document.querySelectorAll(".motspiller .bordkort .kort").length;
  const tur = () => document.querySelectorAll(".hjul .kort:not([disabled])").length > 0;
  for (let i = 0; i < 400; i++) {
    if (tur() && paa() >= 2) { await vent(600); return "stikk"; }
    if (i > 60 && tur()) return "min-tur-forst";
    await vent(120);
  }
  return "tidsavbrudd";
});
const foer = await side.evaluate(() => window.__m.maal());
await side.screenshot({ path: join(UT, "a-en-rad-12.png") });
const etter = await side.evaluate(({ OVERLAPP, GAP }) => {
  const hjul = document.querySelector(".hjul");
  const radH = hjul.getBoundingClientRect().height;
  const kort = [...hjul.querySelectorAll(".kort")];
  // kh·(1+OVERLAPP) = radH  =>  kb = 0,714 · radH / (1+OVERLAPP)
  const kb = Math.floor((0.714 * radH) / (1 + OVERLAPP));
  const kh = Math.round(kb / 0.714);
  const perRad = Math.ceil(kort.length / 2);
  const radB = perRad * kb + (perRad - 1) * GAP;
  const venstre = Math.round((hjul.clientWidth - radB) / 2);
  const st = document.createElement("style");
  st.textContent = `.hjul { display:block !important; position:relative !important; clip-path:none !important; overflow:visible !important; }
    .hjul .kort, .hjul .kort:not([disabled]), .hjul .kort[disabled] {
      position:absolute !important; transform:none !important; translate:none !important;
      rotate:none !important; scale:none !important; opacity:1 !important; filter:none !important;
      margin:0 !important; --kb:${kb}px !important; --krymp:1 !important; transition:none !important; }`;
  document.head.appendChild(st);
  kort.forEach((k, i) => {
    const rad = i < perRad ? 0 : 1;
    const kol = i - rad * perRad;
    k.style.left = `${venstre + kol * (kb + GAP)}px`;
    k.style.top = `${rad === 0 ? 0 : Math.round(kh * OVERLAPP)}px`;
    k.style.zIndex = String(10 + rad);
  });
  // Mål synlig flate per kort: hele kortet minus det som ligger under naboen/framraden.
  const synlig = kort.map((k, i) => {
    const r = k.getBoundingClientRect();
    const dekket = i < perRad ? Math.max(0, kh * (1 - OVERLAPP) - 0) : 0;
    return { i, b: Math.round(r.width), h: Math.round(r.height), synligH: Math.round(i < perRad ? kh * OVERLAPP : kh), dekket: Math.round(dekket) };
  });
  return { kb, kh, radH: Math.round(radH), radB, venstre, perRad, synlig: synlig[0], synligBak: synlig[perRad - 1] };
}, { OVERLAPP, GAP });
await side.waitForTimeout(300);
await side.screenshot({ path: join(UT, "b-to-rader-6.png") });
console.log(JSON.stringify({ UT, foer: { kb: foer.kb, stripe: foer.minStripe, n: foer.n }, etter }, null, 1));
await nettleser.close();
