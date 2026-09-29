/**
 * BORDKORTENE PÅ BESTEMORS iPAD (29. sep) — måler stikkflaten MIDT I ET STIKK.
 *
 *   node examples/spill-lokal.ts --port 8793 &
 *   node examples/ipad-bord.mjs [--url http://localhost:8793/] [--ut <mappe>] [--merke foer|etter]
 *
 * Playwright-Chromium, `hasTouch`, dpr 2, viewporten 1098×695 (betatesterens form) pluss noen
 * kontrollformer. Spiller fram til en stilling der det ligger MINST TO kort på bordet og det er
 * menneskets tur (en stilling som står stille, så målingen ikke leser et mellombilde i
 * animasjonen), og rapporterer i CSS-px:
 *
 *   håndkort · bordkort · forholdet mellom dem · avataren (medaljongen) · det tomme båndet
 *   mellom nederste bordkort og øverste håndkort · om hånden dekker stikkflaten
 *   · om «DIN TUR», tavla og navnene overlappes.
 *
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
const MERKE = arg("--merke", "maal");
const UT = arg("--ut", `D:/amb-grp/loop/ab-demo/ipad-bord-${MERKE}`);
mkdirSync(UT, { recursive: true });
const HJELP = readFileSync(join(import.meta.dirname, "ipad-layout-hjelp.js"), "utf8");

const SKJERMER = [
  { navn: "bestemor-1098x695", w: 1098, h: 695, touch: true, stikkrad: true },
  // Betatesterens EGEN viewport, lest av v19-loggen (`hand`-raden): 2160×1391 CSS-px.
  { navn: "bestemor-logg-2160x1391", w: 2160, h: 1391, touch: true, stikkrad: true },
  { navn: "bestemor-logg-2152x1452", w: 2152, h: 1452, touch: true, stikkrad: true },
  { navn: "bestemor-1080x695", w: 1080, h: 695, touch: true, stikkrad: true },
  { navn: "ipad-1180x820", w: 1180, h: 820, touch: true, stikkrad: true },
  { navn: "ipad-9-krom-1024x658", w: 1024, h: 658, touch: true, stikkrad: true },
  { navn: "ipad-zoom-krom-891x572", w: 891, h: 572, touch: true, stikkrad: true },
  { navn: "ipad-staende-820x1180", w: 820, h: 1180, touch: true },
  { navn: "telefon-390x844", w: 390, h: 844, touch: true, mobil: true },
  { navn: "telefon-liggende-844x390", w: 844, h: 390, touch: true, mobil: true },
  { navn: "pc-1280x800", w: 1280, h: 800, touch: false },
];

// Kjøres i siden: spiller kort til det ligger >= 2 kort på bordet OG det er min tur.
const TIL_STIKK = `async () => {
  const vent = (ms) => new Promise((r) => setTimeout(r, ms));
  const paaBordet = () => document.querySelectorAll(".motspiller .bordkort .kort").length;
  const minTur = () => document.querySelectorAll(".hjul .kort:not([disabled])").length > 0;
  for (let i = 0; i < 400; i++) {
    if (document.querySelector(".overlegg")) return "overlegg";
    if (minTur() && paaBordet() >= 2) { await vent(700); if (minTur() && paaBordet() >= 2) return "stikk"; }
    if (minTur()) {
      const lovlige = [...document.querySelectorAll(".hjul .kort:not([disabled])")];
      lovlige[Math.floor(lovlige.length / 2)].click();
      await vent(300);
    }
    await vent(120);
  }
  return "tidsavbrudd";
}`;

const MAAL = `() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { b: +b.width.toFixed(1), h: +b.height.toFixed(1), t: +b.top.toFixed(1), n: +b.bottom.toFixed(1), v: +b.left.toFixed(1), hy: +b.right.toFixed(1) }; };
  const haand = [...document.querySelectorAll(".hjul .kort")];
  const bord = [...document.querySelectorAll(".motspiller .bordkort .kort")];
  const din = document.querySelector(".dinplass .kort");
  const tom = [...document.querySelectorAll(".tomplass")];
  const ava = [...document.querySelectorAll(".motspiller .medaljong")];
  const navn = [...document.querySelectorAll(".motspiller .navn")];
  const dintur = document.querySelector(".dintur");
  const tavle = document.querySelector("header");
  // offsetWidth er layoutbredden UTEN 3D-vipping; getBoundingClientRect gir den projiserte.
  const layout = (e) => e ? { b: e.offsetWidth, h: e.offsetHeight } : null;
  const hjorne = (e) => e ? +getComputedStyle(e.querySelector(".hjorne")).fontSize.replace("px","") : null;
  const bordNede = bord.length ? Math.max(...bord.map((e) => e.getBoundingClientRect().bottom)) : (tom.length ? Math.max(...tom.map((e) => e.getBoundingClientRect().bottom)) : null);
  const dinNede = din ? din.getBoundingClientRect().bottom : null;
  const haandOppe = haand.length ? Math.min(...haand.map((e) => e.getBoundingClientRect().top)) : null;
  // Overlapp: areal av snitt mellom hvert håndkort og hver stikkflate-boks.
  const snitt = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const stikkbokser = [...document.querySelectorAll(".motspiller .kortplass, .dinplass .kortplass")].map((e) => e.getBoundingClientRect());
  let overlapp = 0;
  for (const k of haand) { const kb = k.getBoundingClientRect(); for (const s of stikkbokser) overlapp += snitt(kb, s); }
  // Bare de SYNLIGE kortene: en tom kortplass er luft, og luft kan ikke dekkes.
  const synlige = [...document.querySelectorAll(".bordkort .kort, .dinplass .kort")].map((e) => e.getBoundingClientRect());
  let overlappSynlig = 0;
  for (const k of haand) { const kb = k.getBoundingClientRect(); for (const s of synlige) overlappSynlig += snitt(kb, s); }
  // Dekkes av HÅNDEN eller av et BORDKORT — ikke av sin egen bakgrunn.
  const dekkes = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); const pk = [[b.left+3,b.top+3],[b.right-3,b.top+3],[b.left+3,b.bottom-3],[b.right-3,b.bottom-3],[(b.left+b.right)/2,(b.top+b.bottom)/2]]; let d = 0; for (const [x,y] of pk) { const t = document.elementFromPoint(x,y); if (t && !e.contains(t) && t !== e && (t.closest(".hjul") || t.closest(".bordkort") || t.closest(".kort"))) d++; } return d; };
  return {
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    nHaand: haand.length, nBord: bord.length,
    haandKort: layout(haand[0]), haandHjorne: hjorne(haand[0]),
    bordKort: layout(bord[0]), bordHjorne: hjorne(bord[0]), bordProj: bord[0] ? r(bord[0]) : null,
    dinKort: layout(din), tomplass: tom.length ? layout(tom[0]) : null,
    forhold: haand[0] && bord[0] ? +(bord[0].offsetWidth / haand[0].offsetWidth).toFixed(3) : null,
    avatar: ava.length ? ava.map((e) => Math.round(e.getBoundingClientRect().width)) : null,
    navnHoyde: navn.length ? Math.round(navn[0].getBoundingClientRect().height) : null,
    bordNede: bordNede === null ? null : Math.round(bordNede),
    dinNede: dinNede === null ? null : Math.round(dinNede),
    haandOppe: haandOppe === null ? null : Math.round(haandOppe),
    tomtBaand: bordNede !== null && haandOppe !== null ? Math.round(haandOppe - Math.max(bordNede, dinNede ?? 0)) : null,
    haandDekkerStikk: Math.round(overlapp), haandDekkerKort: Math.round(overlappSynlig),
    dekketDinTur: dekkes(dintur), dekketTavle: dekkes(tavle), dekketNavn: navn.map(dekkes),
    dinturBoks: dintur ? r(dintur) : null,
    kanScrolle: document.scrollingElement.scrollHeight > innerHeight + 1 && getComputedStyle(document.body).overflowY !== "hidden",
  };
}`;

const nettleser = await chromium.launch();
const resultat = [];
let feil = 0;
for (const s of SKJERMER) {
  const ctx = await nettleser.newContext({
    viewport: { width: s.w, height: s.h },
    hasTouch: s.touch,
    isMobile: s.mobil === true,
    deviceScaleFactor: 2,
  });
  const side = await ctx.newPage();
  await side.goto(`${URL0}?ab=A`);
  await side.addScriptTag({ type: "module", content: `${HJELP}\nwindow.__m = { maal, tilSpill, tilVrak, maalVrak };` });
  await side.waitForFunction(() => window.__m !== undefined);
  const fase = await side.evaluate(() => window.__m.tilSpill("bordprove"));
  const naadde = fase === "spill" ? await side.evaluate(eval(TIL_STIKK)) : fase;
  const m = await side.evaluate(eval(MAAL));
  await side.screenshot({ path: join(UT, `${s.navn}.png`) });
  /**
   * KRAVENE. Uten dem er dette bare en måling, og en måling kan ikke bli rød neste gang noe
   * sklir. `nBord >= 2` er vakta mot den tomme mengden: nås ikke stillingen, skal prøven
   * FALLE, ikke stå grønn på null kort.
   */
  const krav = [];
  if (naadde !== "stikk") krav.push(`naadde=${naadde}`);
  if (!(m.nBord >= 2)) krav.push(`bare ${m.nBord} kort paa bordet`);
  if (m.haandDekkerKort !== 0) krav.push(`haanden dekker ${m.haandDekkerKort} px2 av et bordkort`);
  if (m.dekketDinTur) krav.push(`DIN TUR dekket (${m.dekketDinTur} av 5 punkter)`);
  if (m.dekketNavn.some((x) => x)) krav.push(`navn dekket ${JSON.stringify(m.dekketNavn)}`);
  if (m.dekketTavle) krav.push("tavla dekket");
  if (m.kanScrolle) krav.push("siden kan rulles");
  // Stikkraden: bordkortet skal minst være på størrelse med håndkortet (oppdraget 29. sep).
  // 0,94 er slingringsmonnet fra kvantiseringen til 4 px, ikke et lavere mål.
  if (s.stikkrad && !(m.forhold >= 0.94)) krav.push(`bordkort/haandkort = ${m.forhold}`);
  const rad = { skjerm: s.navn, ok: krav.length === 0, krav, naadde, ...m };
  if (krav.length) feil++;
  resultat.push(rad);
  console.log(JSON.stringify(rad));
  await ctx.close();
}
await nettleser.close();
writeFileSync(join(UT, "resultat.json"), JSON.stringify(resultat, null, 1));
console.log(feil === 0 ? "ALLE GRONNE" : `${feil} RODE`);
process.exit(feil === 0 ? 0 : 1);
