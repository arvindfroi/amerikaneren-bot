/**
 * TENKETIDEN MÅ MÅLES FRA DA KONTROLLENE STO FRAMME — håndhevet, ikke antatt.
 *
 * `web/tempo.ts` logger menneskets tenketid for hvert bud, vrak, trumfvalg og
 * kort. Tallet skal en gang lære en tempo-sans, og det er bare verdt noe om
 * klokka starter i riktig øyeblikk.
 *
 * ================= FELLEN =================================================
 *
 * Det enkle er å starte klokka ved forrige spillers handling. Det gir riktig
 * tall midt i et stikk, der boten legger kortet og menneskets kort blir aktive
 * i samme tegning — og FEIL tall i det øyeblikket det betyr noe: når mennesket
 * spiller ut etter et stikk det vant, står bordet fryst i 2,6 s før kortene blir
 * aktive. En slik klokke gir 2 600 ms ekstra, og en nettleserfri prøve av
 * klokka alene ser det aldri.
 *
 * Derfor spiller prøven EKTE RUNDER i Chromium, bygd fra `web/app.ts`, med
 * Playwrights styrte klokke. Et orakel som er uavhengig av appen — en
 * `MutationObserver` som ser når en aktiv menneskekontroll dukker opp i DOM-en —
 * sier når beslutningen ble tilgjengelig, og `ms` må stemme med det på
 * millisekundet. Prøven spiller til den har sett minst ett menneskeutspill etter
 * en stikkpause og ett kort rett etter en bot; uten dem vakter den ingenting.
 *
 * ================= INGENTING NÅR VAL TOWN =================================
 *
 * `fetch` mot datavalen er byttet ut FØR appen laster (som shimmen i
 * `examples/spill-lokal.ts`): POST fanges i siden, modellfiler hentes fra
 * `web/dist` og `e1-modell`, og alt som ikke går til localhost avbrytes.
 * Workeren er med vilje utilgjengelig, så botene spiller søkfritt og rundene er
 * de samme hver gang.
 *
 *   TEMPO_PROEVE=<fil>   skriver den første runden (uten `navn`) dit
 *   TEMPO_FROE=<tall>    et annet frø for `Math.random`
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { test } from "node:test";

import { build } from "esbuild";
import { chromium } from "playwright";

import { Tenkeklokke, type Synlighet } from "../web/tempo.ts";

const ROT = join(import.meta.dirname, "..");
const APP = readFileSync(join(ROT, "web", "app.ts"), "utf8");

// --- Klokka alene ---------------------------------------------------------

/** En klokke testen stiller selv. */
function stilleklokke(): { klokke: Tenkeklokke; til: (t: number) => void } {
  let nå = 0;
  return { klokke: new Tenkeklokke(() => nå), til: (t) => { nå = t; } };
}
const SYNLIG: Synlighet = { skjult: false, fokus: true };
const SKJULT: Synlighet = { skjult: true, fokus: false };
const UFOKUS: Synlighet = { skjult: false, fokus: false };

test("kjent forsinkelse med et skjult og et ufokusert intervall", () => {
  const { klokke, til } = stilleklokke();
  til(1000);
  klokke.start(SYNLIG);
  til(1400); klokke.endre(SKJULT);
  til(2100); klokke.endre(SYNLIG);
  til(2600); klokke.endre(UFOKUS);
  til(2900); klokke.endre(SYNLIG);
  til(3500);
  assert.deepEqual(klokke.stopp(), { ms: 2500, skjultMs: 700, ufokusMs: 300 });
});

test("skjult og ufokusert telles disjunkt, og aldri mer enn ms", () => {
  const { klokke, til } = stilleklokke();
  klokke.start(SYNLIG);
  til(100); klokke.endre(UFOKUS); // blur først, slik nettleseren gjør ved fanebytte
  til(150); klokke.endre(SKJULT);
  til(900); klokke.endre(UFOKUS);
  til(950); klokke.endre(SYNLIG);
  til(1000);
  const t = klokke.stopp()!;
  assert.deepEqual(t, { ms: 1000, skjultMs: 750, ufokusMs: 100 });
  assert.ok(t.skjultMs! + t.ufokusMs! <= t.ms);
});

test("tid skjult FØR beslutningen ble tilgjengelig telles ikke", () => {
  const { klokke, til } = stilleklokke();
  klokke.endre(SKJULT); // fanen skjules mens botene spiller
  til(5000);
  klokke.start(SKJULT); // menneskets tur kommer mens fanen er skjult
  til(5300); klokke.endre(SYNLIG);
  til(6000);
  assert.deepEqual(klokke.stopp(), { ms: 1000, skjultMs: 300 });
});

test("angre telles bare inne i en beslutning, og tomme felt utelates", () => {
  const { klokke, til } = stilleklokke();
  klokke.angre();
  klokke.start(SYNLIG);
  til(10); klokke.angre();
  til(20); klokke.angre();
  til(1234);
  assert.deepEqual(klokke.stopp(), { ms: 1234, angre: 2 });
  assert.equal(klokke.stopp(), null, "en andre stopp uten start har ikke noe riktig tall");
  klokke.start(SYNLIG);
  til(2000);
  assert.deepEqual(klokke.stopp(), { ms: 766 });
});

// --- K2: ingen bot får se tenketiden --------------------------------------

function tsFiler(mappe: string): string[] {
  return readdirSync(mappe).flatMap((n) => {
    const sti = join(mappe, n);
    return statSync(sti).isDirectory() ? (n === "dist" ? [] : tsFiler(sti)) : sti.endsWith(".ts") ? [sti] : [];
  });
}

test("K2: tempo.ts importeres bare av web/app.ts, og tenketiden går bare til logg()", () => {
  const importører = [...tsFiler(join(ROT, "web")), ...tsFiler(join(ROT, "src"))]
    .filter((f) => /from\s+["'][./]*\/?tempo(\.ts)?["']/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(ROT.length + 1).replaceAll("\\", "/"));
  assert.deepEqual(importører, ["web/app.ts"]);

  // Ingen linje som når en bot, workeren eller broen nevner klokka.
  const BOTVEIER = /broPost|broSend|søkeklient\.|velgHandling|nettAgenter|postMessage|rundeSlutt\(/;
  const KLOKKE = /tenkeklokke|rundeTempo|tenketid\(|Tenketid|Tempopost/;
  for (const [i, linje] of APP.split("\n").entries()) {
    assert.ok(!(BOTVEIER.test(linje) && KLOKKE.test(linje)), `web/app.ts:${i + 1} blander tenketid og en botvei: ${linje.trim()}`);
  }
});

// --- Ekte runder i nettleseren --------------------------------------------

const DATA_URL = /const DATA_URL = "([^"]+)"/.exec(APP)?.[1];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".b64": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Kjøres i siden før appen. Bytter ut `fetch`, synligheten og setter opp oraklet. */
const FØR_APPEN = (data: string, frø: number): string => `(() => {
  let s = ${frø} >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const D = ${JSON.stringify(data)};
  window.__logg = [];
  const f = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const url = String(u instanceof Request ? u.url : u);
    if (!url.startsWith(D)) return f(u, o);
    if (o && o.method === "POST") { window.__logg.push(JSON.parse(o.body)); return Promise.resolve(new Response("{}")); }
    return f("/modell/" + url.slice(D.length).split("?")[0], o);
  };
  let skjult = false, fokus = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (skjult ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => skjult });
  document.hasFocus = () => fokus;
  window.__skjul = (v) => { skjult = v; document.dispatchEvent(new Event("visibilitychange")); };
  window.__fokus = (v) => { fokus = v; window.dispatchEvent(new Event(v ? "focus" : "blur")); };
  // ORAKLET. Uavhengig av appens klokke: når dukket en aktiv menneskekontroll opp?
  const SEL = "#app [data-bud], #app [data-trumf], #app [data-ev], #app #velg-ok, #app #vrak-ok, #app button.kort:not([disabled])";
  window.__framme = false;
  window.__framVed = -1;
  new MutationObserver(() => {
    const nå = document.querySelector(SEL) !== null;
    if (nå && !window.__framme) window.__framVed = performance.now();
    window.__framme = nå;
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
})();`;

type Rad = { spillId: string; navn: string; type: string; data: Record<string, unknown>; tid: string };
type Fase = "B" | "V" | "T" | "S";
type Tall = { ms: number; skjultMs?: number; ufokusMs?: number; angre?: number };
type Forventet = Tall & { fase: Fase; runde: number };
type Side = {
  __framme: boolean;
  __framVed: number;
  __logg: Rad[];
  __skjul: (v: boolean) => void;
  __fokus: (v: boolean) => void;
};

/**
 * Hvordan mennesket oppfører seg ved beslutning nr. i. Syklusen dekker: bare
 * tenke, fanen skjult en stund, vinduet uten fokus en stund, og fanen skjult
 * ALLEREDE da turen kom (skjult under botenes trekk — den tiden skal ikke telles).
 */
type Atferd = { tenk: number; skjult?: readonly [number, number]; ufokus?: readonly [number, number]; skjultFør?: true };
const ATFERD: readonly Atferd[] = [
  { tenk: 1500 },
  { tenk: 900, skjult: [300, 700] },
  { tenk: 600, ufokus: [200, 400] },
  { tenk: 800, skjultFør: true },
];
const MAKS_RUNDER = 6;

test("nettleseren: ms er tiden kontrollene sto framme, skjultMs er den skjulte delen", { timeout: 600_000 }, async (t) => {
  assert.ok(DATA_URL, "fant ikke DATA_URL i web/app.ts");
  const tmp = mkdtempSync(join(tmpdir(), "tempo-logg-"));
  await build({
    entryPoints: [join(ROT, "web", "app.ts")],
    bundle: true, format: "esm", charset: "utf8", logLevel: "warning",
    outfile: join(tmp, "app.js"),
  });

  const server = createServer((req, res) => {
    const sti = (req.url ?? "/").split("?")[0]!;
    let fil: string | null = null;
    if (sti === "/" || sti === "/index.html") fil = join(ROT, "web", "index.html");
    else if (sti === "/dist/app.js") fil = join(tmp, "app.js");
    else if (sti === "/dist/worker.js" || sti === "/modell/worker.js") fil = null; // søket av: samme runder hver gang
    else if (/^\/dist\/[a-z0-9-]+\.woff2$/.test(sti)) fil = join(ROT, "web", sti);
    else if (/^\/modell\/[a-z0-9-]+\.b64$/.test(sti)) fil = join(ROT, "web", "dist", sti.slice(8));
    else if (/^\/modell\/[a-z0-9-]+\.json$/.test(sti)) fil = join(ROT, "e1-modell", sti.slice(8));
    if (fil === null || !existsSync(fil)) { res.writeHead(404).end("nei"); return; }
    res.writeHead(200, { "content-type": MIME[extname(fil)] ?? "application/octet-stream" });
    res.end(readFileSync(fil));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const nettleser = await chromium.launch();
  try {
    const kontekst = await nettleser.newContext();
    const utenfor: string[] = [];
    await kontekst.route("**/*", (r) => {
      if (r.request().url().startsWith(origin)) return r.continue();
      utenfor.push(`${r.request().method()} ${r.request().url()}`);
      return r.abort();
    });
    const page = await kontekst.newPage();
    const sidefeil: string[] = [];
    page.on("pageerror", (e) => sidefeil.push(String(e)));
    await page.addInitScript(FØR_APPEN(DATA_URL, Number(process.env["TEMPO_FROE"] ?? 20260911)));
    await page.clock.install({ time: new Date("2026-09-11T03:00:00Z") });
    await page.goto(origin + "/");
    // Uten pause flyter den installerte klokka med sanntid mellom kallene, og da er
    // oraklet og appen uenige med et millisekund eller to. Pauset går tiden bare med `runFor`.
    await page.clock.pauseAt(new Date("2026-09-11T03:00:05Z"));
    await page.evaluate(() => (document.getElementById("start-knapp") as HTMLButtonElement).click());

    const kjør = (ms: number): Promise<void> => page.clock.runFor(ms);
    const trykk = (sel: string): Promise<void> =>
      page.evaluate((s) => (document.querySelector(`#app ${s}`) as HTMLElement).click(), sel);
    const skjul = (v: boolean): Promise<void> => page.evaluate((v) => (window as unknown as Side).__skjul(v), v);
    const fokus = (v: boolean): Promise<void> => page.evaluate((v) => (window as unknown as Side).__fokus(v), v);
    const nå = (): Promise<number> => page.evaluate(() => performance.now());
    /** Det SISTE trykket: nullstiller oraklet i samme øyeblikk, og gir tiden. */
    const send = (sel: string): Promise<number> =>
      page.evaluate((s) => {
        (window as unknown as Side).__framme = false;
        const t0 = performance.now();
        (document.querySelector(`#app ${s}`) as HTMLElement).click();
        return t0;
      }, sel);

    const forventet: Forventet[] = [];
    let skjultSidenSist = false; // fanen ble skjult i det forrige beslutning ble sendt
    let budNr = 0;
    let runder = 0;
    let nesteTrykket = 0;
    let utspillEtterPause = 0;
    let rettEtterBot = 0;

    for (let steg = 0; steg < 40_000; steg++) {
      await kjør(100);
      const s = await page.evaluate(() => {
        const w = window as unknown as Side;
        const q = (sel: string): boolean => document.querySelector(`#app ${sel}`) !== null;
        return {
          framme: w.__framme, framVed: w.__framVed,
          bud: q("[data-bud]"), vrak: q("#vrak-ok"), velg: q("[data-trumf]") || q("[data-ev]") || q("#velg-ok"),
          neste: q("#neste"), runder: w.__logg.filter((r) => r.type === "runde").length,
        };
      });

      if (s.runder > runder) {
        // Runden er ferdig. Tell om den inneholdt fellene, og gå videre til neste om ikke.
        const logg = await page.evaluate(() => (window as unknown as Side).__logg);
        const d = logg.filter((r) => r.type === "runde")[runder]!.data;
        const historikk = d["historikk"] as [number, string, number][][];
        for (const e of (d["tempo"] as { fase: string; stikk?: number }[] | undefined) ?? []) {
          if (e.fase !== "S" || e.stikk === undefined) continue;
          const plass = historikk[e.stikk]!.findIndex((kp) => kp[0] === 0);
          if (plass === 0 && e.stikk > 0) utspillEtterPause++;
          if (plass > 0) rettEtterBot++;
        }
        runder = s.runder;
        budNr = 0;
        if ((utspillEtterPause >= 1 && rettEtterBot >= 1) || runder >= MAKS_RUNDER) break;
        continue;
      }
      if (s.neste && !s.framme) {
        // ÉN gang per runde. Under stikkpausen står knappen igjen i DOM-en etter trykket
        // (appen tegner ikke før pausen slipper), og et andre trykk kaster i appen.
        if (nesteTrykket < runder) {
          nesteTrykket = runder;
          await trykk("#neste");
        }
        continue;
      }
      if (!s.framme) continue;

      const a = ATFERD[forventet.length % ATFERD.length]!;
      const tilgjengelig = s.framVed;
      const f: Omit<Forventet, "ms"> = { fase: s.bud ? "B" : s.vrak ? "V" : s.velg ? "T" : "S", runde: runder };
      if (skjultSidenSist) {
        // Bare tiden ETTER at turen kom teller som skjult tenketid.
        await kjør(a.tenk);
        await skjul(false);
        f.skjultMs = Math.round((await nå()) - tilgjengelig);
        skjultSidenSist = false;
      }
      if (a.skjult) {
        await kjør(a.skjult[0]);
        await skjul(true);
        await kjør(a.skjult[1]);
        await skjul(false);
        f.skjultMs = a.skjult[1];
      }
      if (a.ufokus) {
        await kjør(a.ufokus[0]);
        await fokus(false);
        await kjør(a.ufokus[1]);
        await fokus(true);
        f.ufokusMs = a.ufokus[1];
      }
      await kjør(a.tenk);

      let sendt: number;
      if (f.fase === "B") {
        // Første bud i runden er det høyeste tallbudet, så mennesket vinner budrunden og får vrak og trumf.
        const høyest = await page.evaluate(() =>
          Math.max(...[...document.querySelectorAll<HTMLElement>("#app .tallbud")].map((b) => Number(b.dataset["bud"]))));
        sendt = await send(budNr++ === 0 && Number.isFinite(høyest) ? `[data-bud="${høyest}"]` : '[data-bud="PASS"]');
      } else if (f.fase === "V") {
        // Huk av ett kort og av igjen (ett angre), og velg så til knappen blir aktiv.
        await trykk(".vrakhånd button.kort:not(.valgt)");
        await kjør(150);
        await trykk(".vrakhånd button.kort.valgt");
        await kjør(150);
        for (let i = 0; i < 20 && (await page.evaluate(() => (document.getElementById("vrak-ok") as HTMLButtonElement).disabled)); i++) {
          await trykk(".vrakhånd button.kort:not(.valgt)");
          await kjør(150);
        }
        f.angre = 1;
        sendt = await send("#vrak-ok");
      } else if (f.fase === "T") {
        // Uten etterlysning (solo) sender trumfkortet valget med én gang, så trykket går
        // gjennom `send`. Kommer etterlysningen i stedet, er det sendingen på «Bekreft» som teller.
        sendt = await send("[data-trumf]");
        await kjør(150);
        if (await page.evaluate(() => document.querySelector("#app [data-ev]") !== null)) {
          await trykk("[data-ev]");
          await kjør(150);
          await trykk("#velg-angre"); // angre 1
          await kjør(150);
          await trykk("#velg-tilbake"); // «Bytt trumf», angre 2
          await kjør(150);
          await trykk("[data-trumf]");
          await kjør(150);
          await trykk("[data-ev]");
          await kjør(150);
          f.angre = 2;
          sendt = await send("#velg-ok");
        }
      } else {
        // Høyeste spillbare kort: mennesket vinner stikk og må spille ut etter stikkpausen.
        const sel = await page.evaluate(() => {
          const kort = [...document.querySelectorAll<HTMLButtonElement>("#app button.kort:not([disabled])")];
          const best = kort.reduce((a, b) => (Number(b.dataset["verdi"]) > Number(a.dataset["verdi"]) ? b : a));
          return `button.kort[data-farge="${best.dataset["farge"]}"][data-verdi="${best.dataset["verdi"]}"]:not([disabled])`;
        });
        sendt = await send(sel);
      }
      forventet.push({ ...f, ms: Math.round(sendt - tilgjengelig) });

      if (ATFERD[forventet.length % ATFERD.length]!.skjultFør) {
        // Fanen skjules i det handlingen er sendt, og står skjult mens botene spiller.
        await skjul(true);
        skjultSidenSist = true;
      }
    }

    const logg = await page.evaluate(() => (window as unknown as Side).__logg);
    const rundeRader = logg.filter((r) => r.type === "runde");
    const valgRader = logg.filter((r) => r.type.startsWith("valg-"));
    if (process.env["TEMPO_PROEVE"] && rundeRader.length > 0) {
      const utenNavn = (r: Rad): Omit<Rad, "navn"> => { const { navn: _n, ...rest } = r; return rest; };
      const nr = rundeRader[0]!.data["rundeNr"];
      writeFileSync(process.env["TEMPO_PROEVE"], JSON.stringify({
        runde: utenNavn(rundeRader[0]!),
        valg: valgRader.filter((r) => r.data["rundeNr"] === nr).map(utenNavn),
      }, null, 1));
    }

    assert.deepEqual(sidefeil, [], "siden kastet");
    assert.deepEqual(utenfor, [], "siden prøvde å nå noe utenfor localhost");
    assert.ok(rundeRader.length >= 1, `ingen runde ble logget (${forventet.length} menneskebeslutninger)`);
    assert.equal(valgRader.length, forventet.length, "én valg-rad per menneskebeslutning");

    const RADTYPE = { B: "valg-bud", V: "valg-vrak", T: "valg-trumf", S: "valg-kort" } as const;
    let i = 0;
    for (const [r, rad] of rundeRader.entries()) {
      const d = rad.data;
      // Eksisterende felt er urørt.
      for (const felt of ["rundeNr", "budvinner", "melding", "klart", "lagStikk", "stikkVunnet", "delta", "totalPoeng", "historikk", "vrak", "trumf", "etterlyst", "makker", "budrunde"]) {
        assert.ok(felt in d, `runde ${r} mangler ${felt}`);
      }
      const historikk = d["historikk"] as [number, string, number][][];
      const tempo = d["tempo"] as ({ fase: string; stikk?: number } & Tall)[];
      const her = forventet.filter((e) => e.runde === r);
      // Hver menneskebeslutning i runden, i rekkefølge, og INGEN bot.
      assert.equal(tempo.length, her.length, `runde ${r}: tempo skal ha nøyaktig én post per menneskebeslutning`);
      for (const [j, e] of her.entries()) {
        const { stikk, fase, ...tall } = tempo[j]!;
        const { fase: fe, runde: _r, ...ventet } = e;
        const hvem = `runde ${r}, beslutning ${j} (${fase}${stikk !== undefined ? `, stikk ${stikk}` : ""})`;
        assert.equal(fase, fe, `${hvem}: fase`);
        // DETTE ER FELLEN: en klokke som startet ved forrige handling gir 2 600 ms for mye ved et utspill.
        assert.deepEqual(tall, ventet, `${hvem}: tempo`);
        const valg = valgRader[i++]!;
        assert.equal(valg.type, RADTYPE[fe]);
        assert.equal(valg.data["rundeNr"], d["rundeNr"]);
        for (const k of ["ms", "skjultMs", "ufokusMs", "angre"] as const) assert.equal(valg.data[k], e[k], `${hvem}: valg-radens ${k}`);
        assert.ok((e.skjultMs ?? 0) + (e.ufokusMs ?? 0) <= e.ms);
        if (fase === "S") {
          assert.equal(stikk, valg.data["stikk"], `${hvem}: stikk`);
          const kp = historikk[stikk!]!.find((x) => x[0] === 0)!;
          const kort = valg.data["kort"] as { farge: string; verdi: number };
          assert.deepEqual(kp.slice(1), [kort.farge, kort.verdi], `${hvem}: stikk peker på menneskets kort`);
        }
      }
    }
    // Vakten må ha noe å vakte.
    assert.ok(utspillEtterPause >= 1, `${runder} runder uten et menneskeutspill etter stikkpausen – velg et annet TEMPO_FROE`);
    assert.ok(rettEtterBot >= 1, "ingen menneskekort rett etter en bot");
    assert.ok(forventet.some((e) => e.skjultMs !== undefined) && forventet.some((e) => e.ufokusMs !== undefined));
    for (const fase of ["B", "V", "T", "S"] as const) assert.ok(forventet.some((e) => e.fase === fase), `ingen ${fase}-beslutning i prøven`);

    const bytes = (rundeRader[0]!.data["tempo"] as unknown[]).length === 0 ? 0 : JSON.stringify(rundeRader[0]!.data["tempo"]).length;
    t.diagnostic(`${runder} runde(r), ${forventet.length} menneskebeslutninger, ${utspillEtterPause} utspill etter stikkpause, ${rettEtterBot} kort rett etter bot; tempo i første runde = ${bytes} byte`);
  } finally {
    await nettleser.close();
    server.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
