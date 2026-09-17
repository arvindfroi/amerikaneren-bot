/**
 * iPAD LIGGENDE: HELE HÅNDEN SYNLIG (17. sep) — layoutprøve med ekte berøringsemulering.
 *
 *   node examples/spill-lokal.ts --port 8793 &
 *   node examples/ipad-layout.mjs [--url http://localhost:8793/] [--ut <mappe>]
 *
 * Playwright-Chromium med `hasTouch` (så `navigator.maxTouchPoints > 0`, som på en iPad) og
 * UTEN `?helhand=1`. For hver skjerm: spill fram til en full hånd (12 kort i spillfasen, 16 i
 * vrakpanelet), mål at hvert kort er helt innenfor skjermen med full dekkevne og en trykkstripe
 * på ≥ 44 px, og ta et skjermbilde. Telefon og stående nettbrett skal fortsatt BLA (låst = false).
 * Siden lastes med `?ab=A` (armen er likegyldig for layouten, og da trengs ingen helbotfiler).
 * `spill-lokal.ts` holder logg-POST tilbake, så ingenting havner i menneskedataene.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, s) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const URL0 = arg("--url", "http://localhost:8793/");
const UT = arg("--ut", "D:/amb-grp/loop/ab-demo/ipad");
mkdirSync(UT, { recursive: true });
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");

const SKJERMER = [
  { navn: "ipad-1180x820", w: 1180, h: 820, touch: true, hel: true },
  { navn: "ipad-1024x768", w: 1024, h: 768, touch: true, hel: true },
  { navn: "ipad-1366x1024", w: 1366, h: 1024, touch: true, hel: true },
  { navn: "ipad-mini-1133x744", w: 1133, h: 744, touch: true, hel: true },
  { navn: "ipad-staende-820x1180", w: 820, h: 1180, touch: true, hel: false },
  { navn: "telefon-390x844", w: 390, h: 844, touch: true, hel: false, mobil: true },
  { navn: "telefon-liggende-844x390", w: 844, h: 390, touch: true, hel: false, mobil: true },
  { navn: "pc-1280x800", w: 1280, h: 800, touch: false, hel: false },
];

const nettleser = await chromium.launch();
const resultat = [];
let feil = 0;
for (const s of SKJERMER) {
  const ctx = await nettleser.newContext({
    viewport: { width: s.w, height: s.h },
    hasTouch: s.touch,
    isMobile: s.mobil === true,
    deviceScaleFactor: 1,
  });
  const side = await ctx.newPage();
  await side.goto(`${URL0}?ab=A`);
  await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
  await side.waitForFunction(() => window.__m !== undefined);
  const vrak = await side.evaluate(async () => {
    const r = await window.__m.tilVrak("layoutprove");
    return r === "vrak" ? window.__m.maalVrak() : { feil: r };
  });
  await side.screenshot({ path: join(UT, `${s.navn}-vrak16.png`) });
  const spill = await side.evaluate(async () => {
    const vent = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 60; i++) {
      await vent(500);
      const ov = document.querySelector(".overlegg");
      if (!ov && document.querySelectorAll(".hjul .kort:not([disabled])").length > 0) break;
      if (ov) {
        const vk = [...ov.querySelectorAll("button.kort")];
        if (vk.length >= 16) {
          if (/4 av 4/.test(ov.innerText)) [...ov.querySelectorAll("button")].find((b) => /legg bort valgte/i.test(b.textContent))?.click();
          else vk.find((b) => b.getAttribute("aria-pressed") !== "true" && !b.classList.contains("valgt"))?.click();
          continue;
        }
        ov.querySelector("button:not(.kort):not([disabled])")?.click();
      }
    }
    await vent(1500);
    const m = window.__m.maal();
    return { ...m, touch: navigator.maxTouchPoints };
  });
  await side.screenshot({ path: join(UT, `${s.navn}-hand12.png`) });
  const ok =
    s.hel
      ? spill.n === 12 && spill.låst && spill.heltSynlige === 12 && spill.minStripe >= 44 && !spill.kanScrolle && vrak.utenfor === 0 && vrak.n === 16
      : spill.n === 12 && !spill.låst && vrak.utenfor === 0;
  if (!ok) feil++;
  const rad = { skjerm: s.navn, ok, forventetHel: s.hel, låst: spill.låst, heltSynlige: spill.heltSynlige, minStripe: spill.minStripe, kb: spill.kb, kanScrolle: spill.kanScrolle, touch: spill.touch, vrak };
  resultat.push(rad);
  console.log(JSON.stringify(rad));
  await ctx.close();
}
await nettleser.close();
writeFileSync(join(UT, "resultat.json"), JSON.stringify(resultat, null, 1));
process.exit(feil === 0 ? 0 : 1);
