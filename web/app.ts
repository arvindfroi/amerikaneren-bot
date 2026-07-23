/**
 * «Amerikaneren mot PIMC» – TV-vennlig nettspill.
 *
 * Hele spillmotoren + PIMC-solveren kjører i nettleseren (null latens).
 * Mennesket sitter på sete 0 (Sør); sete 1–3 er PIMC-boter med tidsbudsjett.
 * Designet for visning via Chromecast: store kort, høy kontrast,
 * firefarget kortstokk (fargeblind-vennlig), tastaturnavigasjon og
 * aria-live-oppleser. Hver runde og hvert menneskevalg logges til
 * datainnsamlings-endepunktet (Val Town) + localStorage som reserve.
 */

import { velgHandling } from "../src/bot/bot.ts";
import type { Farge, Kort } from "../src/kort.ts";
import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type GameState,
  type Handling,
  type Hendelse,
} from "../src/motor.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { genomFraJson } from "../src/neat/genom.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../src/regler.ts";

// --- Oppsett ----------------------------------------------------------------
const DATA_URL = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";
const MENNESKE = 0;
const NAVN = ["Du", "Vest 🤖", "Nord 🤖", "Øst 🤖"];
/**
 * Styrkenivåer for PIMC. Kortvalg (SPILL) er tidsstyrt; bud/vrak/trumf er
 * verdenstyrt med nodetak, så «øvrig» holder seg innenfor rimelig ventetid.
 * MAKS: dype eksaktsøk (terskel 9) med opptil ~3 min per kortvalg – kjør i
 * Web Worker så UI-et aldri fryser.
 */
const STYRKER = {
  RASK: {
    navn: "Rask (~1 s per trekk)",
    spill: { verdener: 12, terskel: 6, maksEval: 240, tidsbudsjettMs: 900 },
    øvrig: { verdener: 12, terskel: 6, maksEval: 240 },
  },
  STERK: {
    navn: "Sterk (~3 s per trekk)",
    spill: { verdener: 60, terskel: 7, nodeTak: 1_200_000, tidsbudsjettMs: 2_800 },
    øvrig: { verdener: 20, terskel: 6, budTerskel: 6, nodeTak: 800_000 },
  },
  MAKS: {
    navn: "MAKS (~5 s per trekk)",
    spill: { verdener: 200, terskel: 7, nodeTak: 2_000_000, tidsbudsjettMs: 4_800 },
    øvrig: { verdener: 24, terskel: 7, budTerskel: 7, nodeTak: 1_000_000 },
  },
} as const;
type Styrke = keyof typeof STYRKER;
let styrke: Styrke = "MAKS";

// --- Worker-kanal for PIMC (lange tenketider uten å fryse UI) ---------------
let worker: Worker | null = null;
let workerLast: Promise<Worker> | null = null;
const venterPåSvar = new Map<number, (h: Handling) => void>();
let nesteWorkerId = 1;
let tenkStart = 0;

function hentWorker(): Promise<Worker> {
  if (worker !== null) return Promise.resolve(worker);
  if (workerLast === null) {
    workerLast = fetch(DATA_URL + "worker.js")
      .then((r) => r.text())
      .then((kode) => {
        const w = new Worker(URL.createObjectURL(new Blob([kode], { type: "text/javascript" })));
        w.onmessage = (e: MessageEvent<{ id: number; handling?: Handling; feil?: string }>) => {
          const løs = venterPåSvar.get(e.data.id);
          venterPåSvar.delete(e.data.id);
          if (løs && e.data.handling) løs(e.data.handling);
        };
        worker = w;
        return w;
      });
  }
  return workerLast;
}

/** PIMC-beslutning i workeren; faller tilbake til rask synkron ved feil. */
async function pimcHandling(s: GameState): Promise<Handling> {
  const nivå = STYRKER[styrke];
  const opts = { ...(s.fase === "SPILL" ? nivå.spill : nivå.øvrig), frø: (Math.random() * 1e9) >>> 0 };
  try {
    const w = await hentWorker();
    return await new Promise<Handling>((løs, avvis) => {
      const id = nesteWorkerId++;
      venterPåSvar.set(id, løs);
      w.postMessage({ id, state: s, opts });
      setTimeout(() => {
        if (venterPåSvar.has(id)) {
          venterPåSvar.delete(id);
          avvis(new Error("tidsavbrudd"));
        }
      }, 45_000);
    });
  } catch {
    return velgHandling(s, { ...STYRKER.RASK.spill, frø: (Math.random() * 1e9) >>> 0 });
  }
}

/** Motstandertype: PIMC-solver eller et av de trente NEAT-nettene. */
type Motstander = "PIMC" | "C4" | "D1";
const MOTSTANDER_INFO: Record<Motstander, string> = {
  PIMC: "PIMC – solveren (vanskeligst)",
  C4: "C4 – evolusjonsnettet",
  D1: "D1 – gradientnettet",
};
let motstander: Motstander = "PIMC";
let nettAgenter: NeatAgent[] | null = null; // sete 1–3 ved C4/D1

const FARGE_TEGN: Record<Farge, string> = { S: "♠", H: "♥", R: "♦", K: "♣" };
const FARGE_NAVN: Record<Farge, string> = { S: "spar", H: "hjerter", R: "ruter", K: "kløver" };
// Firefarget kortstokk: lettere å skille på avstand og for fargeblinde.
const FARGE_CSS: Record<Farge, string> = { S: "#1a1a1a", H: "#d32f2f", R: "#1565c0", K: "#2e7d32" };
const VERDI_TEKST = (v: number): string =>
  v === 14 ? "A" : v === 13 ? "K" : v === 12 ? "D" : v === 11 ? "J" : String(v);

// --- Tilstand ---------------------------------------------------------------
let state: GameState;
let spillId = "";
let spillerNavn = "";
let venterPåMenneske = false;
let sistTur = 0; // tidsstempel for reaksjonstid-logging
let vrakValg: Kort[] = [];
let velgTrumfValg: Farge | null = null;
let travelt = false;

const rot = document.getElementById("app")!;
const oppleser = document.getElementById("oppleser")!;

function si(tekst: string): void {
  oppleser.textContent = tekst;
}

// --- Datainnsamling ---------------------------------------------------------
function logg(type: string, data: unknown): void {
  const hendelse = {
    spillId,
    navn: `${spillerNavn} vs ${motstander}${motstander === "PIMC" ? `/${styrke}` : ""}`,
    type,
    data,
    tid: new Date().toISOString(),
  };
  try {
    const alt = JSON.parse(localStorage.getItem("amerikaneren-logg") ?? "[]");
    alt.push(hendelse);
    localStorage.setItem("amerikaneren-logg", JSON.stringify(alt.slice(-500)));
  } catch { /* full/av – ikke kritisk */ }
  fetch(DATA_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(hendelse),
    keepalive: true,
  }).catch(() => { /* offline – localStorage har kopien */ });
}

const kortTekst = (k: Kort): string => `${FARGE_TEGN[k.farge]}${VERDI_TEKST(k.verdi)}`;
const kortTale = (k: Kort): string => `${FARGE_NAVN[k.farge]} ${VERDI_TEKST(k.verdi)}`;

// --- Spilløkke --------------------------------------------------------------
async function start(navn: string): Promise<void> {
  spillerNavn = navn || "familien";
  spillId = Math.random().toString(36).slice(2, 10);
  nettAgenter = null;
  if (motstander !== "PIMC") {
    rot.innerHTML = `<div class="panel start"><h2>Laster ${motstander}-nettet…</h2></div>`;
    try {
      const svar = await fetch(DATA_URL + motstander.toLowerCase() + ".json");
      const genom = genomFraJson(await svar.text());
      nettAgenter = [1, 2, 3].map(() => new NeatAgent(structuredClone(genom), { læringsrate: 0 }));
    } catch {
      rot.innerHTML = `<div class="panel start"><h2>Klarte ikke laste ${motstander}-nettet 😕</h2>
        <button class="stor bekreft" id="tilbake">Tilbake</button></div>`;
      document.getElementById("tilbake")!.onclick = () => startskjerm();
      return;
    }
  }
  state = opprettSpill({ antallSpillere: 4 }, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  for (const a of nettAgenter ?? []) a.nyKamp();
  logg("start", { frø: state.frø, målPoeng: state.regler.målPoeng, motstander });
  fortsett();
}

/** Ferdig stikk som holdes synlig på bordet en stund (med vinner). */
let frystStikk: { kort: readonly { spiller: number; kort: Kort }[]; vinner: number } | null = null;

function gjør(h: Handling): void {
  const res = utfør(state, h);
  state = res.state;
  håndterHendelser(res.hendelser);
  // Fullført stikk: frys det på bordet i 2,6 s slik at alle rekker å se
  // alle fire kortene og hvem som vant, før spillet går videre.
  const stikk = res.hendelser.find((x) => x.type === "STIKK_FERDIG");
  if (stikk !== undefined && stikk.type === "STIKK_FERDIG") {
    frystStikk = { kort: stikk.stikk, vinner: stikk.vinner };
    travelt = true;
    tegn();
    setTimeout(() => {
      frystStikk = null;
      travelt = false;
      fortsett();
    }, 2600);
    return;
  }
  fortsett();
}

function håndterHendelser(hendelser: readonly Hendelse[]): void {
  for (const h of hendelser) {
    if (h.type === "BUDVINNER") {
      si(`${NAVN[h.spiller]} vant budrunden med ${budTekst(h.bud)}.`);
      logg("budvinner", { spiller: h.spiller, bud: h.bud, rundeNr: state.rundeNr });
    } else if (h.type === "TRUMF_VALGT") {
      si(`Trumf er ${FARGE_NAVN[h.trumf]}${h.etterlyst ? `, etterlyst ${kortTale(h.etterlyst)}` : ""}.`);
    } else if (h.type === "MAKKER_AVSLØRT") {
      si(`${NAVN[h.spiller]} er makkeren!`);
    } else if (h.type === "STIKK_FERDIG") {
      si(`${NAVN[h.vinner]} vant stikket.`);
    } else if (h.type === "RUNDE_SLUTT") {
      logg("runde", {
        rundeNr: state.rundeNr,
        budvinner: h.resultat.budvinner,
        melding: h.resultat.melding,
        klart: h.resultat.klart,
        lagStikk: h.resultat.lagStikk,
        stikkVunnet: h.resultat.stikkVunnet,
        delta: h.resultat.delta,
        totalPoeng: h.totalPoeng,
      });
    } else if (h.type === "KAMP_SLUTT") {
      logg("kamp", { vinner: h.vinner, totalPoeng: state.totalPoeng, runder: state.rundeNr + 1 });
    }
  }
}

/** Driver spillet videre: botene spiller automatisk, mennesket får UI. */
function fortsett(): void {
  if (travelt) return;
  tegn();
  const lov = lovligeHandlinger(state);
  if (lov.fase === "FERDIG") return;
  if (lov.fase === "RUNDE_SLUTT") return; // venter på «Neste runde»-knappen

  const aktør = lov.fase === "VRAK" || lov.fase === "VELG" ? state.budvinner! : lov.spiller;
  if (aktør === MENNESKE) {
    venterPåMenneske = true;
    sistTur = performance.now();
    tegn();
    return;
  }

  // Bot i tur. NEAT-nettene svarer momentant; PIMC tenker i workeren
  // (opptil ~5 s ved MAKS) uten å blokkere UI-et.
  venterPåMenneske = false;
  travelt = true;
  tenkStart = performance.now();
  if (nettAgenter !== null) {
    setTimeout(() => {
      const h = nettAgenter![aktør - 1]!.velgHandling(state);
      travelt = false;
      gjørMedPause(h, 550);
    }, 30);
  } else {
    tegn();
    void pimcHandling(state).then((h) => {
      travelt = false;
      gjørMedPause(h, 250);
    });
  }
}

function gjørMedPause(h: Handling, pauseMs: number): void {
  travelt = true;
  setTimeout(() => {
    travelt = false;
    gjør(h);
  }, pauseMs);
}

// --- Menneskehandlinger -----------------------------------------------------
function menneskeBud(bud: Bud): void {
  logg("valg-bud", { rundeNr: state.rundeNr, bud, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  gjør({ type: "BUD", spiller: MENNESKE, bud });
}

function menneskeVrak(): void {
  logg("valg-vrak", { rundeNr: state.rundeNr, antall: vrakValg.length, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  const kort = vrakValg;
  vrakValg = [];
  gjør({ type: "VRAK", spiller: MENNESKE, kort });
}

function menneskeVelg(trumf: Farge, etterlyst: Kort | null): void {
  logg("valg-trumf", { rundeNr: state.rundeNr, trumf, etterlyst, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  velgTrumfValg = null;
  gjør({ type: "VELG", spiller: MENNESKE, trumf, etterlyst });
}

function menneskeSpill(kort: Kort): void {
  logg("valg-kort", { rundeNr: state.rundeNr, stikk: state.stikkSpilt, kort, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  si(`Du spilte ${kortTale(kort)}.`);
  gjør({ type: "SPILL", spiller: MENNESKE, kort });
}

// --- Tegning ----------------------------------------------------------------
const budTekst = (b: Bud): string =>
  b === PASS ? "Pass" : b === AMERIKANER ? "Amerikaner!" : b === SOLO ? "Solo!" : String(b);

function kortKnapp(k: Kort, opts: { valgbar?: boolean; valgt?: boolean; liten?: boolean; onKlikk?: () => void }): string {
  const id = `kort-${k.farge}${k.verdi}`;
  return `<button id="${id}" class="kort${opts.liten ? " liten" : ""}${opts.valgt ? " valgt" : ""}"
    style="--f:${FARGE_CSS[k.farge]}" ${opts.valgbar ? "" : "disabled"}
    aria-label="${kortTale(k)}${opts.valgt ? ", valgt" : ""}" data-farge="${k.farge}" data-verdi="${k.verdi}">
    <span class="hjorne">${VERDI_TEKST(k.verdi)}<br>${FARGE_TEGN[k.farge]}</span>
    <span class="midt">${FARGE_TEGN[k.farge]}</span>
  </button>`;
}

function sorterHånd(hånd: readonly Kort[]): Kort[] {
  const rekkefølge: Farge[] = ["S", "H", "K", "R"];
  return [...hånd].sort(
    (a, b) => rekkefølge.indexOf(a.farge) - rekkefølge.indexOf(b.farge) || b.verdi - a.verdi,
  );
}

function topplinje(): string {
  const m = state.melding;
  const kontrakt =
    state.budvinner !== null && m !== null
      ? `${NAVN[state.budvinner]}: ${m.type === "tall" ? m.bud : m.type} ${state.trumf ? FARGE_TEGN[state.trumf] : ""}`
      : state.fase === "BUDRUNDE"
        ? "Budrunde"
        : "";
  // Stikkteller vises så snart runden spilles (også mens stikket er fryst).
  const iSpill = state.fase === "SPILL" || frystStikk !== null || state.fase === "RUNDE_SLUTT";
  return `<header>
    <div class="poeng" role="group" aria-label="Poengstilling og stikk">
      ${state.totalPoeng.map((p, i) => `<div class="spiller${i === MENNESKE ? " deg" : ""}"><span>${NAVN[i]}</span><b>${p}</b>${iSpill ? `<span style="color:#7fe08a;font-weight:700" aria-label="stikk denne runden">${state.stikkVunnet[i]} stikk</span>` : ""}</div>`).join("")}
    </div>
    <div class="kontrakt">${kontrakt}</div>
    <div class="runde">Runde ${state.rundeNr + 1} · først til ${state.regler.målPoeng}</div>
  </header>`;
}

function bordet(): string {
  // bord[i] plasseres etter sete: 0 nederst, 1 venstre, 2 øverst, 3 høyre.
  const plass = ["bunn", "venstre", "topp", "høyre"];
  // Fryst stikk: alle fire kortene blir stående med vinnermarkering.
  const påBordet = frystStikk !== null ? frystStikk.kort : state.bord;
  const kort = påBordet
    .map((b) => `<div class="bordkort ${plass[b.spiller]}">
      <div class="hvem">${NAVN[b.spiller]}${frystStikk !== null && b.spiller === frystStikk.vinner ? ' <span style="color:#ffd54f">★ vant stikket</span>' : ""}</div>${kortKnapp(b.kort, { liten: true })}</div>`)
    .join("");
  const tenker =
    frystStikk === null &&
    !venterPåMenneske && state.fase === "SPILL" && state.iTur !== null && state.iTur !== MENNESKE
      ? `<div class="tenker ${plass[state.iTur]}">${NAVN[state.iTur]} tenker<span id="tenker-tid"></span>…</div>`
      : "";
  const info = state.etterlyst
    ? `<div class="etterlyst">Etterlyst: ${kortTekst(state.etterlyst)}${state.makkerAvslørt && state.makker !== null ? ` (${NAVN[state.makker]})` : " (skjult makker)"}</div>`
    : "";
  // Forrige stikk: alltid synlig i hjørnet mens neste stikk spilles.
  const forrige =
    frystStikk === null && state.fase === "SPILL" && state.forrigeStikk !== null
      ? `<div style="position:absolute;right:0.5%;top:1%;background:rgba(0,0,0,.55);border:2px solid #2c4a35;border-radius:12px;padding:0.6vh 0.8vw;text-align:center" aria-label="Forrige stikk">
          <div style="font-size:0.7em;color:#b9c7ad;margin-bottom:0.3vh">Forrige stikk · <b style="color:#ffd54f">${NAVN[state.forrigeStikk.vinner]}</b> vant</div>
          <div style="display:flex;gap:4px;justify-content:center">${state.forrigeStikk.kort
            .map((b) => `<div style="zoom:0.5"><div style="font-size:1.4em;color:#b9c7ad">${NAVN[b.spiller].split(" ")[0]}</div>${kortKnapp(b.kort, { liten: true })}</div>`)
            .join("")}</div>
        </div>`
      : "";
  return `<div class="bord" aria-label="Bordet">${kort}${tenker}${info}${forrige}</div>`;
}

function håndPanel(): string {
  const lov = lovligeHandlinger(state);
  const hånd = sorterHånd(state.hender[MENNESKE] ?? []);
  const spillbare =
    venterPåMenneske && lov.fase === "SPILL"
      ? new Set(lov.kort.map((k) => `${k.farge}${k.verdi}`))
      : null;
  return `<div class="hånd" role="group" aria-label="Kortene dine">
    ${hånd
      .map((k) =>
        kortKnapp(k, {
          valgbar: spillbare !== null && spillbare.has(`${k.farge}${k.verdi}`),
          valgt: vrakValg.some((v) => v.farge === k.farge && v.verdi === k.verdi),
        }),
      )
      .join("")}
  </div>`;
}

function budPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "BUDRUNDE") return "";
  const tall = lov.bud.filter((b): b is number => typeof b === "number");
  const høyeste = state.budrunde.høyeste;
  return `<div class="panel" role="dialog" aria-label="Ditt bud">
    <h2>Ditt bud${høyeste ? ` (høyeste: ${budTekst(høyeste.bud)} fra ${NAVN[høyeste.spiller]})` : ""}</h2>
    <div class="knapper">
      <button class="stor pass" data-bud="PASS">Pass</button>
      ${tall.map((b) => `<button class="stor tallbud" data-bud="${b}">${b}</button>`).join("")}
      ${lov.bud.includes(AMERIKANER) ? `<button class="stor spesial" data-bud="AMERIKANER">Amerikaner</button>` : ""}
      ${lov.bud.includes(SOLO) ? `<button class="stor spesial" data-bud="SOLO">Solo</button>` : ""}
    </div>
  </div>`;
}

function vrakPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "VRAK") return "";
  return `<div class="panel" role="dialog" aria-label="Vrak kort">
    <h2>Du vant budet! Velg ${lov.antall} kort å legge bort (${vrakValg.length}/${lov.antall} valgt)</h2>
    <div class="vrakhånd">${sorterHånd(lov.hånd)
      .map((k) => kortKnapp(k, { valgbar: true, valgt: vrakValg.some((v) => v.farge === k.farge && v.verdi === k.verdi) }))
      .join("")}</div>
    <button class="stor bekreft" id="vrak-ok" ${vrakValg.length === lov.antall ? "" : "disabled"}>Legg bort valgte</button>
  </div>`;
}

function velgPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "VELG") return "";
  if (velgTrumfValg === null) {
    return `<div class="panel" role="dialog" aria-label="Velg trumf">
      <h2>Velg trumffarge</h2>
      <div class="knapper">${(["S", "H", "R", "K"] as Farge[])
        .map((f) => `<button class="stor farge" style="--f:${FARGE_CSS[f]}" data-trumf="${f}">${FARGE_TEGN[f]} ${FARGE_NAVN[f]}</button>`)
        .join("")}</div>
    </div>`;
  }
  if (!lov.måEtterlyse) {
    return ""; // solo: velges direkte uten etterlysning i klikk-handleren
  }
  const egne = new Set((state.hender[MENNESKE] ?? []).map((k) => `${k.farge}${k.verdi}`));
  return `<div class="panel" role="dialog" aria-label="Etterlys et kort">
    <h2>Trumf: ${FARGE_TEGN[velgTrumfValg]} — etterlys et kort (eieren blir din hemmelige makker)</h2>
    ${(["S", "H", "R", "K"] as Farge[])
      .map(
        (f) => `<div class="etterlysrad"><span style="color:${FARGE_CSS[f]}">${FARGE_TEGN[f]}</span>
        ${[14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
          .map((v) => `<button class="mini" data-ef="${f}" data-ev="${v}" ${egne.has(`${f}${v}`) ? "disabled" : ""}>${VERDI_TEKST(v)}</button>`)
          .join("")}</div>`,
      )
      .join("")}
  </div>`;
}

function rundeSluttPanel(): string {
  if (state.fase !== "RUNDE_SLUTT" || state.sisteRunde === null) return "";
  const r = state.sisteRunde;
  const m = r.melding;
  const hva = m.type === "tall" ? `${m.bud}` : m.type;
  return `<div class="panel resultat" role="dialog" aria-label="Rundens resultat">
    <h2>${NAVN[r.budvinner]} meldte ${hva} og ${r.klart ? "KLARTE det! ✅" : "falt ❌"} (${r.lagStikk} stikk${r.makker !== null ? ` med ${NAVN[r.makker]}` : ""})</h2>
    <div class="delta">${r.delta.map((d, i) => `<span class="${d >= 0 ? "pluss" : "minus"}">${NAVN[i]}: ${d >= 0 ? "+" : ""}${d}</span>`).join("")}</div>
    <button class="stor bekreft" id="neste">Neste runde</button>
  </div>`;
}

function ferdigPanel(): string {
  if (state.fase !== "FERDIG") return "";
  const vantDu = state.vinner === MENNESKE;
  return `<div class="panel resultat" role="dialog" aria-label="Kampen er ferdig">
    <h2>${vantDu ? "🎉 DU VANT! 🎉" : `${NAVN[state.vinner!]} vant kampen`}</h2>
    <div class="delta">${state.totalPoeng.map((p, i) => `<span>${NAVN[i]}: ${p}</span>`).join("")}</div>
    <button class="stor bekreft" id="nytt-spill">Nytt spill</button>
    <p class="lite">Resultatene er lagret. <a href="${DATA_URL}" target="_blank" rel="noopener">Se innsamlede data</a></p>
  </div>`;
}

function tegn(): void {
  if (!state) return;
  rot.innerHTML = topplinje() + bordet() + budPanel() + vrakPanel() + velgPanel() + rundeSluttPanel() + ferdigPanel() + håndPanel();
  koble();
}

// --- Hendelseskobling (event delegation per tegning) ------------------------
function koble(): void {
  const lov = lovligeHandlinger(state);
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-bud]")) {
    b.onclick = () => {
      const t = b.dataset["bud"]!;
      menneskeBud(t === "PASS" ? PASS : t === "AMERIKANER" ? AMERIKANER : t === "SOLO" ? SOLO : Number(t));
    };
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-trumf]")) {
    b.onclick = () => {
      const f = b.dataset["trumf"] as Farge;
      if (lov.fase === "VELG" && !lov.måEtterlyse) menneskeVelg(f, null);
      else {
        velgTrumfValg = f;
        tegn();
      }
    };
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-ef]")) {
    b.onclick = () => menneskeVelg(velgTrumfValg!, { farge: b.dataset["ef"] as Farge, verdi: Number(b.dataset["ev"]) as Kort["verdi"] });
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>(".kort:not([disabled])")) {
    b.onclick = () => {
      const kort: Kort = { farge: b.dataset["farge"] as Farge, verdi: Number(b.dataset["verdi"]) as Kort["verdi"] };
      if (lov.fase === "VRAK" && venterPåMenneske) {
        const i = vrakValg.findIndex((v) => v.farge === kort.farge && v.verdi === kort.verdi);
        if (i >= 0) vrakValg.splice(i, 1);
        else if (vrakValg.length < lov.antall) vrakValg.push(kort);
        tegn();
      } else if (lov.fase === "SPILL" && venterPåMenneske) {
        menneskeSpill(kort);
      }
    };
  }
  const vrakOk = document.getElementById("vrak-ok");
  if (vrakOk) vrakOk.onclick = () => menneskeVrak();
  const neste = document.getElementById("neste");
  if (neste) {
    neste.focus();
    neste.onclick = () => gjør({ type: "NESTE" });
  }
  const nytt = document.getElementById("nytt-spill");
  if (nytt) {
    nytt.focus();
    nytt.onclick = () => startskjerm();
  }
}

// --- Startskjerm ------------------------------------------------------------
function startskjerm(): void {
  rot.innerHTML = `<div class="panel start" role="dialog" aria-label="Start">
    <h1>🃏 Amerikaneren mot botene</h1>
    <p>Store kort, laget for TV-en. Velg motstander:</p>
    <div class="knapper motstandere" role="radiogroup" aria-label="Motstander">
      ${(Object.keys(MOTSTANDER_INFO) as Motstander[])
        .map((m) => `<button class="stor motstander${m === motstander ? " aktiv" : ""}" data-mot="${m}"
          role="radio" aria-checked="${m === motstander}">${MOTSTANDER_INFO[m]}</button>`)
        .join("")}
    </div>
    ${motstander === "PIMC"
      ? `<p style="margin:0 0 0.6vh">Styrke:</p>
    <div class="knapper motstandere" role="radiogroup" aria-label="Styrke">
      ${(Object.keys(STYRKER) as Styrke[])
        .map((s) => `<button class="stor motstander${s === styrke ? " aktiv" : ""}" data-styrke="${s}"
          role="radio" aria-checked="${s === styrke}">${STYRKER[s].navn}</button>`)
        .join("")}
    </div>`
      : ""}
    <label for="navn">Hvem spiller? (for dataloggen)</label>
    <input id="navn" type="text" placeholder="f.eks. mamma" autocomplete="off">
    <button class="stor bekreft" id="start-knapp">Start spillet</button>
  </div>`;
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-mot]")) {
    b.onclick = () => {
      motstander = b.dataset["mot"] as Motstander;
      startskjerm();
    };
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-styrke]")) {
    b.onclick = () => {
      styrke = b.dataset["styrke"] as Styrke;
      startskjerm();
    };
  }
  const knapp = document.getElementById("start-knapp")!;
  const felt = document.getElementById("navn") as HTMLInputElement;
  knapp.onclick = () => void start(felt.value.trim());
  felt.onkeydown = (e) => { if (e.key === "Enter") void start(felt.value.trim()); };
  (knapp as HTMLButtonElement).focus();
}

// Tenketid-teller i «tenker…»-boblen (oppdateres utenom re-tegning).
setInterval(() => {
  const el = document.getElementById("tenker-tid");
  if (el !== null && travelt && tenkStart > 0) {
    const s = (performance.now() - tenkStart) / 1000;
    el.textContent = s >= 1.5 ? ` ${s.toFixed(0)} s` : "";
  }
}, 500);

startskjerm();
