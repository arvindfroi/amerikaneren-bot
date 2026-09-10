/**
 * ============ ÉN KJEDE FOR HOVEDTRÅDEN OG WORKEREN =======================
 *
 * `docs/gammelkode.md` N2: `web/app.ts` bygde Adams FOR HÅND — `Konvensjonsvakt`
 * → `Budagent` → `medVrakrangerer` — mens workeren gikk gjennom `byggUtrullet`.
 * Og hovedtrådens kjede var ikke en reserve: den tar hvert bud, hvert vrak,
 * hvert trumfvalg og hvert kortvalg i makker- og forsvarssetet. Flertallet av
 * botens beslutninger ble altså tatt av kjeden ingen test bandt til speken.
 *
 * Nå bygger BEGGE tråder gjennom `byggAdams` under, som kaller `byggUtrullet`
 * med de samme vektene og de samme flaggene. Den ENESTE forskjellen er `medSøk`,
 * og den er et argument, ikke en kopi. `test/app-lik-spek.test.ts` spiller
 * nøyaktig denne oppdelingen — hovedtrådens kjede for alt annet, workerens for
 * førerens kortvalg — mot `lagIndre(<utrullet spek>)` og krever identiske valg.
 *
 * DOM-FRI OG DISKFRI MED VILJE: fila importeres av `web/app.ts`, `web/worker.ts`
 * og prøvene i Node. Ingen `document`, ingen `node:fs`, ingen `self`.
 */

import { lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";
// Fra budmodell.ts og IKKE budagent.ts: den siste importerer node:fs paa
// toppniva, og esbuild med nettleserplattform stopper paa den.
import { tolkBudmodell, type Budmodell } from "../src/moe2/budmodell.ts";
import { Sikkerorakel, type SikkerTellere } from "../src/moe2/sikkerorakel.ts";
import { byggUtrullet, type Søkspek, type Velger } from "../src/moe2/utrullet.ts";

/**
 * Meldingsprotokollen mellom hovedtråd og worker.
 *
 *   1  `adams-init` / `adams-trekk`, kvittering `{klar}` uten versjon
 *   2  + request-id med `frist`, `utløpt`-svar, `nyKamp`, `utfall` per trekk,
 *      og `protokoll` i kvitteringen
 *
 * Hovedtråden må tåle 1: Val Town-proxyen serverer workeren fra en PINNET
 * commit, og den er eldre enn denne fila (se rapporten om reservebundelen).
 */
export const SØKEPROTOKOLL = 2;

/** Konfigurasjonen som sendes til workeren. Tall og flagg, aldri agenter. */
export interface AdamsKonfig {
  readonly vaktflagg: string;
  readonly vrakflagg: string;
  readonly budterskel: number;
  /** Kandidatverdener i førersøket. 0 = søk av. */
  readonly verdener: number;
  /** Konfidensporten: overstyr nettet bare når marginen slår sin egen SE. */
  readonly sigma: number;
  /**
   * Tidsbudsjettet per beslutning i søket selv. Leses IKKE av søket enda —
   * se `søkspek` under. Hovedtråden har sin egen frist uansett.
   */
  readonly fristMs?: number;
}

/** Rå vekter slik de kommer over nettet: base64 og JSON. */
export interface RåAdamsVekter {
  readonly kort: string;
  readonly bud: unknown | null;
  readonly vrak: string | null;
}

/** Hva som FAKTISK ble bygd — ikke hva vi ba om. Se `oppløst` i `web/app.ts`. */
export interface Bygd {
  readonly agent: Velger;
  /** Budmodellen kom gjennom `tolkBudmodell` og sitter i kjeden. */
  readonly bud: boolean;
  /** Vrakrangereren ble bygd. Kaster konstruktøren, er den `false`. */
  readonly vrak: boolean;
  /** Søkelaget, for tellerne. `null` når søket er av. */
  readonly sik: Sikkerorakel | null;
}

export function tilBytes(b64: string): Uint8Array {
  const rå = atob(b64.trim());
  const bytes = new Uint8Array(rå.length);
  for (let i = 0; i < rå.length; i++) bytes[i] = rå.charCodeAt(i);
  return bytes;
}

/**
 * SØKESPEKEN, ETT STED.
 *
 * `fristMs` er med i konfigurasjonen fordi `Søkspek` sin `sik`-variant får et
 * valgfritt tidsbudsjett per beslutning. Når det feltet finnes, er påkoblingen
 * ÉN linje her — `fristMs: k.fristMs` — og ingenting annet i appen endres.
 * Til da er det hovedtrådens frist (`web/sokeklient.ts`) som holder tiden.
 */
export function søkspek(k: AdamsKonfig): Søkspek | null {
  if (k.verdener <= 0) return null;
  return { type: "sik", verdener: k.verdener, sigma: k.sigma };
}

/**
 * Bygger Adams fra rå vekter. `medSøk: false` er hovedtrådens kjede, `true`
 * workerens. Alt annet er likt, og det er hele poenget.
 *
 * RESERVENE ER DE SAMME SOM FØR: en budmodell som ikke tolkes gir
 * NevroHjernes budgivning, og en vrakrangerer med feil bredde gir nevros vrak.
 * Ingen enkeltdel får ta ned resten. Men utfallet MELDES i `Bygd`, så loggen
 * kan si hvilken bot som faktisk kjørte.
 */
export function byggAdams(v: RåAdamsVekter, k: AdamsKonfig, medSøk: boolean, kilde = "vektene"): Bygd {
  const kortBytes = tilBytes(v.kort);
  let bud: Budmodell | null = null;
  if (v.bud !== null) {
    try {
      bud = tolkBudmodell(v.bud);
    } catch (feil) {
      console.warn("Budmodellen ble avvist:", feil);
    }
  }
  let vraknett: NevroNett | null = null;
  if (v.vrak !== null) {
    try {
      vraknett = nettFraBytes(tilBytes(v.vrak))[0] ?? null;
      if (vraknett === null) console.warn("Vrakrangereren: tomme vekter");
    } catch (feil) {
      console.warn("Vrakrangereren kunne ikke leses:", feil);
    }
  }
  const bygg = (vn: NevroNett | null): Velger =>
    byggUtrullet({
      kortnett: nettFraBytes(kortBytes)[0]!,
      kort: E1Agent.fraBytes(kortBytes, {}, kilde),
      vaktflagg: k.vaktflagg,
      bud,
      budterskel: k.budterskel,
      vraknett: vn,
      vrakflagg: k.vrakflagg,
      søk: medSøk ? søkspek(k) : null,
      // K4/K6 er BYGD, men ikke maalt i spill enda. Slås de på, må `nyKamp`
      // nå begge tråder — og det gjør den nå (N5).
      økt: false,
    }).agent;

  let agent: Velger;
  let vrak = vraknett !== null;
  try {
    agent = bygg(vraknett);
  } catch (feil) {
    // `Vrakrangerer` KASTER på feil bredde i stedet for å score søppel. Et
    // stille feilvalg ville nesten ikke syntes, så vi faller tilbake og sier fra.
    if (vraknett === null) throw feil;
    console.warn("Vrakrangereren ble avvist:", feil);
    agent = bygg(null);
    vrak = false;
  }
  return { agent, bud: bud !== null, vrak, sik: finnSikkerorakel(agent) };
}

/**
 * Finner søkelaget i kjeden ved å følge `indre`.
 *
 * `byggUtrullet` returnerer bare det ytterste laget, og `utrullet.ts` er ikke
 * vår å endre. Feltet heter `indre` i hvert lag i kjeden; skulle det bytte navn,
 * gir denne `null` og `test/app-sokeklient.test.ts` blir rød — loggen mister
 * `utfall`, men spillet går som før.
 */
export function finnSikkerorakel(agent: unknown): Sikkerorakel | null {
  let x: unknown = agent;
  for (let dybde = 0; dybde < 16 && x !== null && typeof x === "object"; dybde++) {
    if (x instanceof Sikkerorakel) return x;
    x = (x as { indre?: unknown }).indre;
  }
  return null;
}

/**
 * HVILKE BESLUTNINGER SOM GÅR TIL WORKEREN: kortvalg der boten er spillefører.
 *
 * Forsvarssøk er målt til −0,027 (z = −0,55) og er ikke med. Alt annet svarer
 * nettet på i mikrosekunder, og å sende det gjennom en meldingskø ville vært
 * ren overhead. Regelen står her og ikke i `app.ts`, så paritetsprøven kan
 * bruke NØYAKTIG den.
 */
export function børSøke(state: GameState, aktør: number, verdener: number): boolean {
  return verdener > 0 && state.fase === "SPILL" && aktør === state.budvinner;
}

/** Hva søkelaget gjorde med ÉN beslutning, lest av tellerne før og etter. */
export type Søkeutfall = "overstyrt" | "enig" | "under-port" | "ikke-vurdert" | "ikke-rolle";

export function lesUtfall(før: SikkerTellere, etter: SikkerTellere): Søkeutfall {
  if (etter.beslutninger === før.beslutninger) return "ikke-rolle";
  if (etter.vurdert === før.vurdert) return "ikke-vurdert"; // bare ett lovlig kort, eller ingen verden
  if (etter.overstyrt > før.overstyrt) return "overstyrt";
  if (etter.enig > før.enig) return "enig";
  return "under-port";
}

/**
 * Er handlingen lovlig i DENNE stillingen? Et svar fra workeren er regnet ut
 * på en kopi av stillingen; kommer det inn etter at spillet har gått videre,
 * skal det ikke kunne føres inn. `utfør` kaster på ulovlige trekk, og et kast
 * midt i spillsløyfen er en hengt runde.
 */
export function erLovligKort(state: GameState, h: Handling): boolean {
  if (h.type !== "SPILL" || state.fase !== "SPILL" || h.spiller !== state.iTur) return false;
  return lovligeKort(state, h.spiller).some((k) => k.farge === h.kort.farge && k.verdi === h.kort.verdi);
}
