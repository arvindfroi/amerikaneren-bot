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
import { fraKortId, kortId, type Farge, type Kort } from "../src/kort.ts";
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
import { E1Agent } from "../src/e1/agent.ts";
import { Konvensjonsvakt, lesVaktflagg } from "../src/moe2/konvensjonsvakt.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../src/regler.ts";

// --- Oppsett ----------------------------------------------------------------
const DATA_URL = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";
const MENNESKE = 0;

// --- MesterAI-bro (kun når spillet serveres lokalt over HTTP) ---------------
// Farmor spiller mot appens EKTE MesterAI når hele spillet serveres fra
// laptopens bro (arena/mesterai-bro.ts) over HTTP. Da er /mester samme opphav
// (ingen HTTPS/mixed-content-blokkering på iPad-en). På Vercel (HTTPS) er
// LOKAL falsk, så MesterAI vises ikke og spillet er uendret.
const LOKAL = location.protocol === "http:";
const MESTER_URL = `${location.origin}/mester`;
const MESTER_SETER = [1, 2, 3]; // botsetene styres av MesterAI i bro-modus

// --- Vår beste bot ----------------------------------------------------------
// sd-r2 er E1-nettet trent på single-dummy-fasit i to DAgger-runder, pakket i
// konvensjonsvakten («at»): slå aldri ditt eget etterlyste kort, og brenn aldri
// trumf på et stikk laget alt har sikret. Alt utenom kortspillet – bud, vrak og
// trumfvalg – gjøres av NevroHjerne, som er bygget inn i bunten (src/nevro).
//
// Dette er NØYAKTIG den agenten som er målt mot appens MesterAI: +0,170 ± 0,043
// poeng per runde per sete bak MesterAI over 788 speilede par, mot NevroHjernes
// +1,068 ± 0,163. Vakten alene er verdt +0,319 ± 0,060 over rent sd-r2.
// Nettleseren laster derfor `src/e1/agent.ts` – den samme klassen benken kjører
// – i stedet for en kopi av kortvalget som kunne kommet i utakt.
const VAKTFLAGG = "at";
let botLaster: Promise<Konvensjonsvakt> | null = null;
function besteBot(): Promise<Konvensjonsvakt> {
  botLaster ??= fetch(DATA_URL + "sdr2.b64")
    .then((r) => {
      if (!r.ok) throw new Error(`sd-r2-vekter: HTTP ${r.status}`);
      return r.text();
    })
    .then((b64) => {
      const rå = atob(b64.trim());
      const bytes = new Uint8Array(rå.length);
      for (let i = 0; i < rå.length; i++) bytes[i] = rå.charCodeAt(i);
      // Ett delt eksemplar for alle tre botsetene – slik benken kjører den.
      return new Konvensjonsvakt(E1Agent.fraBytes(bytes, {}, "sdr2.b64"), lesVaktflagg(VAKTFLAGG));
    })
    .catch((feil: unknown) => {
      botLaster = null; // la neste forsøk prøve på nytt
      throw feil;
    });
  return botLaster;
}

/** Serialiserer en handling til adapterens JSON-format (som arena-adapteren). */
function handlingTilAdapter(h: Handling): Record<string, unknown> {
  switch (h.type) {
    case "BUD":
      return { type: "BUD", spiller: h.spiller, bud: h.bud };
    case "VRAK":
      return { type: "VRAK", spiller: h.spiller, kort: h.kort.map(kortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller: h.spiller,
        trumf: h.trumf,
        etterlyst: h.etterlyst ? kortId(h.etterlyst) : null,
      };
    case "SPILL":
      return { type: "SPILL", spiller: h.spiller, kort: kortId(h.kort) };
    case "NESTE":
      throw new Error("NESTE sendes aldri til broen");
  }
}

interface BroSvar {
  type: string;
  handling?: { type: string; spiller: number; bud?: unknown; kort?: unknown; trumf?: unknown; etterlyst?: unknown };
}

// Alle bro-kall serialiseres i kall-rekkefølge, så adapterens motor holder seg
// i eksakt synk med vår (samme mekanikk som arena-benchmarken, over HTTP).
let broKø: Promise<unknown> = Promise.resolve();
async function broSend(melding: object): Promise<BroSvar> {
  const r = await fetch(MESTER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(melding),
  });
  return (await r.json()) as BroSvar;
}
function broPost(melding: object): Promise<BroSvar> {
  const p = broKø.then(() => broSend(melding));
  broKø = p.catch(() => undefined);
  return p;
}
/** rundeStart-melding: gir broen hele givingen så motoren speiles eksakt. */
function broRundeStart(): object {
  return {
    type: "rundeStart",
    hender: state.hender.map((h) => h.map(kortId)),
    talong: state.talong.map(kortId),
    foersteBudgiver: state.iTur,
  };
}
/** MesterAIs beslutning (adapter-JSON) → vår Handling. */
function broHandlingFra(j: NonNullable<BroSvar["handling"]>): Handling {
  const spiller = j.spiller;
  switch (j.type) {
    case "BUD":
      return { type: "BUD", spiller, bud: j.bud as Bud };
    case "VRAK":
      return { type: "VRAK", spiller, kort: (j.kort as string[]).map(fraKortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller,
        trumf: j.trumf as Farge,
        etterlyst: j.etterlyst == null ? null : fraKortId(j.etterlyst as string),
      };
    default:
      return { type: "SPILL", spiller, kort: fraKortId(j.kort as string) };
  }
}
/** Speiler en utført handling til broen så adapterens motor holder synk. */
function broSpeil(h: Handling, hendelser: readonly Hendelse[]): void {
  if (motstander !== "MesterAI") return;
  if (h.type !== "NESTE") void broPost({ type: "handling", handling: handlingTilAdapter(h) });
  for (const e of hendelser) if (e.type === "NY_RUNDE") void broPost(broRundeStart());
}
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
    spill: { verdener: 60, terskel: 7, nodeTak: 1_200_000, tidsbudsjettMs: 2_800, adaptivDybde: true },
    øvrig: { verdener: 20, terskel: 6, budTerskel: 6, nodeTak: 800_000 },
  },
  MAKS: {
    navn: "MAKS (~5 s per trekk, pondrer)",
    spill: { verdener: 200, terskel: 7, nodeTak: 2_000_000, tidsbudsjettMs: 4_800, adaptivDybde: true },
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

/** Initialiser workerens agenter for valgt styrke (pondering + adaptiv dybde). */
async function initPimcWorker(): Promise<void> {
  const nivå = STYRKER[styrke];
  const w = await hentWorker();
  w.postMessage({
    type: "init",
    spill: { ...nivå.spill, frø: (Math.random() * 1e9) >>> 0 },
    øvrig: { ...nivå.øvrig, frø: (Math.random() * 1e9) >>> 0 },
  });
}

/**
 * Pondering hoerte til PIMC-solveren, som er fjernet som motstander.
 * NevroHjerne bruker mikrosekunder per trekk og har ingenting aa pondre paa.
 * Funksjonen staar som no-op saa kallstedene ikke maa rives ut.
 */
function ponder(_s: GameState, _ms: number): void {
  /* ingen motstander bruker worker-pondering lenger */
}

/** PIMC-beslutning i workeren; faller tilbake til rask synkron ved feil. */
async function pimcHandling(s: GameState): Promise<Handling> {
  const nivå = STYRKER[styrke];
  try {
    const w = await hentWorker();
    return await new Promise<Handling>((løs, avvis) => {
      const id = nesteWorkerId++;
      venterPåSvar.set(id, løs);
      w.postMessage({ type: "beslutt", id, state: s, maksMs: nivå.spill.tidsbudsjettMs ?? 5000 });
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

/**
 * Motstandertype: PIMC-solveren, et trent NEAT-nett, appens nevronett eller
 * appens fulle MesterAI.
 */
/**
 * Bare ÉN motstander står igjen på nett: vår egen beste bot.
 *
 * C4 og D1 er evolusjonslinjer som er MÅLT til å spille kort dårligere enn å
 * velge tilfeldig (anger 1,07–1,15 mot gulvet 1,035 på orakelbenken). PIMC
 * taper 72,6 ± 8,5 poeng per kamp mot MesterAI, og NevroHjerne 44,8 ± 6,6 –
 * mot vår beste bots 5,0 ± 1,5. Å la de svake stå ga familien motstandere som
 * verken var sterke eller lærerike, og delte innsamlingen på fire bots i
 * stedet for å samle den der den er verdt noe.
 *
 * MesterAI blir stående, men vises bare i bro-modus (spillet servert lokalt
 * over HTTP fra laptopen) – den kan ikke kjøre i nettleseren.
 */
type Motstander = "Vaar" | "MesterAI";
const MOTSTANDER_INFO: Record<Motstander, string> = {
  Vaar: "Vår beste bot – sd-r2 med konvensjonsvakt 🤖",
  MesterAI: "MesterAI – appens mester 🏆",
};
/** MesterAI vises kun i bro-modus (spillet servert lokalt over HTTP). */
const MOTSTANDERE = (): Motstander[] =>
  LOKAL ? ["Vaar", "MesterAI"] : ["Vaar"];
let motstander: Motstander = "Vaar";

/**
 * Et nett som fører sitt eget sete. NeatAgent (C4/D1) og NevroSpiller (appens
 * nevronett) har samme lille grensesnitt, så spilløkka trenger bare én vei.
 */
interface SeteAgent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
}
let nettAgenter: SeteAgent[] | null = null; // sete 1–3 ved Nevro/C4/D1

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
    navn: `${spillerNavn} vs ${motstander}`,
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
  if (motstander === "Vaar") {
    // Vår beste bot: vektene lastes én gang og bufres i nettleseren. ÉTT delt
    // eksemplar fører alle tre botsetene, slik benken kjører den.
    rot.innerHTML = `<div class="panel start"><h2>Laster vår beste bot…</h2></div>`;
    try {
      const bot = await besteBot();
      nettAgenter = [bot, bot, bot];
    } catch {
      rot.innerHTML = `<div class="panel start"><h2>Klarte ikke laste boten 😕</h2>
        <button class="stor bekreft" id="tilbake">Tilbake</button></div>`;
      document.getElementById("tilbake")!.onclick = () => startskjerm();
      return;
    }
  } else if (motstander === "MesterAI") {
    rot.innerHTML = `<div class="panel start"><h2>Kobler til MesterAI…</h2></div>`;
    try {
      await broSend({ type: "helse" }).catch(() => broSend({ type: "init", mesterSeter: [] }));
    } catch {
      rot.innerHTML = `<div class="panel start"><h2>Fikk ikke kontakt med MesterAI 😕</h2>
        <p class="sub">Er broen startet på laptopen? (arena/mesterai-bro.ts)</p>
        <button class="stor bekreft" id="tilbake">Tilbake</button></div>`;
      document.getElementById("tilbake")!.onclick = () => startskjerm();
      return;
    }
  } else {
    try {
      await initPimcWorker();
    } catch { /* faller tilbake til synkron RASK i pimcHandling */ }
  }
  state = opprettSpill({ antallSpillere: 4 }, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  // Ett delt eksemplar fører alle tre setene, så nullstill det bare én gang.
  for (const a of new Set(nettAgenter ?? [])) a.nyKamp();
  if (motstander === "MesterAI") {
    broKø = Promise.resolve();
    void broPost({ type: "nyKamp", mesterSeter: MESTER_SETER });
    void broPost(broRundeStart());
  }
  logg("start", { frø: state.frø, målPoeng: state.regler.målPoeng, motstander, styrke });
  fortsett();
}

/** Ferdig stikk som holdes synlig på bordet en stund (med vinner). */
let frystStikk: { kort: readonly { spiller: number; kort: Kort }[]; vinner: number } | null = null;

function gjør(h: Handling): void {
  const res = utfør(state, h);
  state = res.state;
  håndterHendelser(res.hendelser);
  broSpeil(h, res.hendelser);
  // Fullført stikk: frys det på bordet i 2,6 s slik at alle rekker å se
  // alle fire kortene og hvem som vant, før spillet går videre.
  const stikk = res.hendelser.find((x) => x.type === "STIKK_FERDIG");
  if (stikk !== undefined && stikk.type === "STIKK_FERDIG") {
    frystStikk = { kort: stikk.stikk, vinner: stikk.vinner };
    travelt = true;
    tegn();
    // Neste stikkleder (vinneren) pondrer gjennom hele frysingen.
    ponder(state, 2450);
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
  if (motstander === "MesterAI") {
    tegn();
    const reserve = (): Handling =>
      velgHandling(state, { ...STYRKER.RASK.spill, frø: (Math.random() * 1e9) >>> 0 });
    void broPost({ type: "beslutt", sete: aktør })
      .then((svar) => {
        travelt = false;
        gjørMedPause(svar.handling ? broHandlingFra(svar.handling) : reserve(), 550);
      })
      .catch(() => {
        travelt = false;
        gjørMedPause(reserve(), 550);
      });
  } else if (nettAgenter !== null) {
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
  // utfør er ren – regn ut neste stilling nå, så botene kan pondere i pausen.
  try {
    ponder(utfør(state, h).state, pauseMs - 40);
  } catch { /* pondering er best-effort */ }
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
      ${MOTSTANDERE()
        .map((m) => `<button class="stor motstander${m === motstander ? " aktiv" : ""}" data-mot="${m}"
          role="radio" aria-checked="${m === motstander}">${MOTSTANDER_INFO[m]}</button>`)
        .join("")}
    </div>
    <!-- Styrkevalget hoerte til PIMC, som er fjernet. Nevronettet bruker
         mikrosekunder per trekk, saa det finnes ingen tidsbudsjett aa velge. -->
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
