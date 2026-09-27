/**
 * TRANGE iPAD-VIEWPORTER: hva ser håndregelen egentlig? (27. sep)
 *
 *   node examples/spill-lokal.ts --port 8795 &
 *   node examples/ipad-trangt.mjs [--url http://localhost:8795/] [--ut <mappe>] [--merke foer]
 *
 * Bestemor ser ikke hele hånden på iPad i landskap selv om `helHånd()` finnes. Denne prøven
 * kjører de FAKTISKE CSS-viewportene en iPad-Safari gir: full skjerm, med Safari-krom (fane- og
 * adresselinje spiser 100–140 px), og «zoomet visning» (~87 % av CSS-pikslene) med og uten krom.
 * Måler `innerWidth/innerHeight`, kortbredden, hjulets egen bredde, og hva håndregelen bestemte.
 * `spill-lokal.ts` holder logg-POST tilbake, så ingenting havner i menneskedataene.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, s) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const URL0 = arg("--url", "http://localhost:8795/");
const MERKE = arg("--merke", "foer");
const UT = arg("--ut", `D:/amb-grp/loop/ab-demo/ipad-v19-${MERKE}`);
mkdirSync(UT, { recursive: true });
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");

/** Krom = Safaris fane- + adresselinje i landskap. Zoom = «zoomet visning» i iOS. */
const BASER = [
  { navn: "ipad-pro-11", w: 1180, h: 820 },
  { navn: "ipad-pro-11-eldre", w: 1194, h: 834 },
  { navn: "ipad-mini", w: 1133, h: 744 },
  { navn: "ipad-air-10.9", w: 1080, h: 810 },
  { navn: "ipad-9", w: 1024, h: 768 },
];
const KROM = 110;
const ZOOM = 0.87;
/**
 * BESTEMORS EGEN FORM. Fra skjermbildet eieren sendte 27. sep: iPad i landskap, Safari med BÅDE
 * fanelinje og adresselinje (~105 px krom), bilde 1098×800 -> viewport ca. 1098×695. Altså rett
 * under det gamle `innerHeight >= 700`. De to nabotallene er med for å vise at det er en KANT og
 * ikke et tilfelle: 1080×710 slapp gjennom, 1098×695 og 1100×690 gjorde det ikke.
 */
const SKJERMER = [
  { navn: "bestemor-1098x695", w: 1098, h: 695 },
  { navn: "bestemor-1080x710", w: 1080, h: 710 },
  { navn: "bestemor-1100x690", w: 1100, h: 690 },
];
for (const b of BASER) {
  SKJERMER.push({ navn: `${b.navn}-full`, w: b.w, h: b.h });
  SKJERMER.push({ navn: `${b.navn}-krom`, w: b.w, h: b.h - KROM });
  const zw = Math.round(b.w * ZOOM), zh = Math.round(b.h * ZOOM);
  SKJERMER.push({ navn: `${b.navn}-zoom`, w: zw, h: zh });
  SKJERMER.push({ navn: `${b.navn}-zoom-krom`, w: zw, h: zh - Math.round(KROM * ZOOM) });
}

const nettleser = await chromium.launch();
const resultat = [];
for (const s of SKJERMER) {
  const ctx = await nettleser.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: true, deviceScaleFactor: 2 });
  const side = await ctx.newPage();
  await side.goto(`${URL0}?ab=A`);
  await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
  await side.waitForFunction(() => window.__m !== undefined);
  const fase = await side.evaluate(() => window.__m.tilSpill("layoutprove"));
  const m = await side.evaluate(() => {
    const hj = document.querySelector(".hjul");
    const app = document.getElementById("app");
    const pil = document.querySelector(".blapil");
    return {
      ...window.__m.maal(),
      touch: navigator.maxTouchPoints,
      dpr: devicePixelRatio,
      hjulBredde: Math.round(hj.clientWidth),
      appBredde: Math.round(app.clientWidth),
      pilBredde: pil ? Math.round(pil.getBoundingClientRect().width) : 0,
      pilSkjult: pil ? getComputedStyle(pil).opacity === "0" : null,
      steg: getComputedStyle(hj).getPropertyValue("--steg").trim(),
    };
  });
  await side.screenshot({ path: join(UT, `${s.navn}.png`) });
  const rad = {
    skjerm: s.navn, vw: m.vw, vh: m.vh, dpr: m.dpr, touch: m.touch, fase,
    kb: m.kb, appBredde: m.appBredde, hjulBredde: m.hjulBredde, pilBredde: m.pilBredde,
    steg: m.steg, n: m.n, laast: m.låst, heltSynlige: m.heltSynlige, minStripe: m.minStripe,
    kanScrolle: m.kanScrolle,
  };
  resultat.push(rad);
  console.log(JSON.stringify(rad));
  await ctx.close();
}
await nettleser.close();
writeFileSync(join(UT, "resultat.json"), JSON.stringify(resultat, null, 1));
