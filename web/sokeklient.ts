/**
 * ============ HOVEDTRÅDENS SIDE AV SØKET — MED KLOKKE =====================
 *
 * Eieren tillater boten å tenke i opptil fem sekunder per trekk. Boten skal
 * aldri fryse UI-et og aldri stoppe et spill. Denne fila er hvordan det holdes,
 * og den er DOM-fri så `test/app-sokeklient.test.ts` kan kjøre den med en falsk
 * worker og en falsk klokke.
 *
 * ================= DET SOM VAR GALT (revisjonen 11. september) ===========
 *
 *   1. Et `feil`-svar fra workeren slettet ventelappen, men løste den ALDRI.
 *      Trekket ble stående til 20-sekundersfristen gikk ut. En frys.
 *
 *   2. Fristen VAR 20 sekunder, ikke fem, og et søk som bommet blokkerte
 *      workerens kø: neste forespørsel startet først når det sene søket var
 *      ferdig, så også den bommet. Svaret ble heller ikke sjekket mot
 *      stillingen det skulle føres inn i.
 *
 *   3. Kvitteringsfristen på seks sekunder var PERMANENT: `adamsKlar` ble en
 *      løst promise med `null`, og ingenting prøvde igjen før siden ble lastet
 *      på nytt. Én treg oppstart (kald hurtigbuffer, 2,4 MB over mobilnett) slo
 *      av søket for resten av økten — og ingen rad i basen sa det.
 *
 * ================= REGLENE NÅ ============================================
 *
 *   – Hvert trekk har en frist (`trekkfristMs`). Svar etter den kastes; appen
 *     spiller hovedtrådens søkfrie kjede i stedet. Den er den SAMME kjeden minus
 *     søket (`web/adamskjede.ts`), så reserven er ikke en annen bot.
 *   – Forespørselen bærer fristen. Workeren hopper over forespørsler som
 *     allerede er for sene når den når dem, så køen tømmes.
 *   – `feil` og en krasjet worker løser ventende trekk MED ÉN GANG.
 *   – Uteblir kvitteringen, blir statusen «treg» — ikke «av». En sen kvittering
 *     gjør den «klar». Er den fortsatt treg eller feilet ved neste kamp, startes
 *     workeren på nytt. Hver overgang logges.
 *   – Bommer søket på fristen `maksFristbrudd` ganger på rad, settes det på
 *     pause resten av kampen: på en maskin der hvert søk bommer, er hvert søk
 *     fire og et halvt sekund venting for ingenting.
 */

import type { GameState, Handling } from "../src/motor.ts";
import type { Søkeutfall } from "./adamskjede.ts";
import type { FraWorker, Initmelding, TilWorker } from "./sokekjerne.ts";

/** Det appen trenger av en `Worker`. En adapter i `app.ts`, en falsk i prøvene. */
export interface Arbeider {
  postMessage(m: TilWorker): void;
  terminate(): void;
  koble(påMelding: (data: unknown) => void, påFeil: (feil: unknown) => void): void;
}

export interface Tidtaker {
  /** Veggklokke i ms. MÅ være `Date.now()`-tid: fristen sendes til workeren. */
  nå(): number;
  /** Kaller `fn` om `ms` millisekunder. Returnerer avbryteren. */
  etter(ms: number, fn: () => void): () => void;
}

export const ekteTid: Tidtaker = {
  nå: () => Date.now(),
  etter: (ms, fn) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export type Søkestatus = "av" | "laster" | "klar" | "treg" | "feil" | "pause";

/**
 * HVILKET LAG SOM AVGJORDE et trekk der søket ble forespurt.
 *
 *   soek       søket overstyrte nettet
 *   soek-nett  søket kjørte, og nettets kort sto (enig, under porten, eller
 *              bare ett lovlig kort)
 *   soek-v1    en protokoll-1-worker svarte; den melder ikke utfallet
 *   frist      svaret kom ikke innen fristen — hovedtrådens kjede spilte
 *   feil       workeren svarte med feil eller krasjet — hovedtrådens kjede spilte
 *   ikke-klar  workeren var ikke klar (laster, treg, feilet, på pause)
 */
export type Søkelag = "soek" | "soek-nett" | "soek-v1" | "frist" | "feil" | "ikke-klar";

export interface Søkesvar {
  /** `null` = bruk hovedtrådens søkfrie kjede. */
  readonly handling: Handling | null;
  readonly lag: Søkelag;
  /** Tid fra forespørsel til svar, sett fra hovedtråden. */
  readonly ms: number;
  readonly utfall?: Søkeutfall | null;
  /** Workerens egen regnetid. Differansen mot `ms` er kø og meldingsoverføring. */
  readonly wms?: number;
}

export interface Klientvalg {
  readonly lagArbeider: () => Promise<Arbeider>;
  readonly tid?: Tidtaker;
  readonly kvitteringsfristMs: number;
  readonly trekkfristMs: number;
  readonly maksFristbrudd: number;
  readonly logg: (type: string, data: Record<string, unknown>) => void;
}

interface Ventende {
  readonly t0: number;
  readonly løs: (s: Søkesvar) => void;
}

export class Søkeklient {
  status: Søkestatus = "av";
  /** 0 til kvitteringen er kommet. 1 = eldre worker uten `protokoll`-felt. */
  protokoll = 0;
  /** Svar som kom etter fristen og ble kastet. */
  sene = 0;

  private readonly v: Klientvalg;
  private readonly tid: Tidtaker;
  private arbeider: Arbeider | null = null;
  private init: Initmelding | null = null;
  /** Øker ved hver (om)start. Meldinger fra en avløst worker ignoreres. */
  private generasjon = 0;
  private startetVed = 0;
  private avbrytKvittering: () => void = () => {};
  private readonly venter = new Map<number, Ventende>();
  private nesteId = 1;
  private fristbrudd = 0;

  constructor(v: Klientvalg) {
    this.v = v;
    this.tid = v.tid ?? ekteTid;
  }

  /** Starter workeren om den ikke går. Idempotent. */
  start(init: Initmelding): void {
    this.init = init;
    if (this.status === "av") this.startArbeider("start");
  }

  /**
   * NY KAMP. Når begge kjedene (N5), og er stedet workeren får en ny sjanse:
   * treg eller feilet ved kampstart betyr at forrige kamp gikk uten søk, og
   * da er det billigere å prøve igjen enn å spille én kamp til uten.
   */
  nyKamp(): void {
    this.fristbrudd = 0;
    if (this.init === null) return;
    if (this.status === "treg" || this.status === "feil") {
      this.v.logg("worker", { status: "omstart", fra: this.status });
      this.startArbeider("omstart");
      return;
    }
    if (this.status === "pause") {
      this.status = "klar";
      this.v.logg("worker", { status: "klar", fra: "pause" });
    }
    // En protokoll-1-worker kjenner ikke `nyKamp` og ville svart med feil.
    if (this.status === "klar" && this.protokoll >= 2) this.arbeider?.postMessage({ type: "nyKamp" });
  }

  /**
   * Ber om ETT kortvalg. Løses ALLTID innen `trekkfristMs` — med en handling,
   * eller med `null` og grunnen i `lag`. Avviser aldri.
   */
  trekk(state: GameState, sete: number): Promise<Søkesvar> {
    const w = this.arbeider;
    if (this.status !== "klar" || w === null) {
      return Promise.resolve({ handling: null, lag: "ikke-klar", ms: 0 });
    }
    const id = this.nesteId++;
    const t0 = this.tid.nå();
    return new Promise<Søkesvar>((løs) => {
      const avbryt = this.tid.etter(this.v.trekkfristMs, () => {
        if (!this.venter.delete(id)) return;
        this.fristBrudd();
        løs({ handling: null, lag: "frist", ms: this.tid.nå() - t0 });
      });
      this.venter.set(id, {
        t0,
        løs: (s) => {
          avbryt();
          løs(s);
        },
      });
      try {
        w.postMessage({ type: "adams-trekk", id, state, sete, frist: t0 + this.v.trekkfristMs });
      } catch (feil) {
        // `postMessage` kaster om stillingen ikke kan klones. Da er det en feil
        // i appen, ikke i workeren, men spillet skal gå videre likevel.
        this.venter.delete(id);
        avbryt();
        console.warn("adams-trekk kunne ikke sendes:", feil);
        løs({ handling: null, lag: "feil", ms: this.tid.nå() - t0 });
      }
    });
  }

  private startArbeider(grunn: "start" | "omstart"): void {
    const gen = ++this.generasjon;
    this.avbrytKvittering();
    this.arbeider?.terminate();
    this.arbeider = null;
    this.løsAlle("feil");
    this.status = "laster";
    this.protokoll = 0;
    this.startetVed = this.tid.nå();
    this.v
      .lagArbeider()
      .then((w) => {
        if (gen !== this.generasjon) {
          w.terminate();
          return;
        }
        this.arbeider = w;
        w.koble(
          (data) => this.motta(gen, data),
          (feil) => this.krasj(gen, feil),
        );
        this.avbrytKvittering = this.tid.etter(this.v.kvitteringsfristMs, () => {
          if (gen !== this.generasjon || this.status !== "laster") return;
          this.status = "treg";
          console.warn(
            `Workeren kvitterte ikke innen ${this.v.kvitteringsfristMs} ms. Spiller uten søk til den gjør det; ` +
              "prøver på nytt ved neste kamp om den aldri gjør det.",
          );
          this.v.logg("worker", { status: "treg", ms: this.tid.nå() - this.startetVed, grunn });
        });
        w.postMessage(this.init!);
      })
      .catch((feil: unknown) => {
        if (gen !== this.generasjon) return;
        this.status = "feil";
        console.warn("Workeren kunne ikke startes – spiller uten søk:", feil);
        this.v.logg("worker", { status: "feil", feil: String(feil).slice(0, 160), grunn });
      });
  }

  private motta(gen: number, rå: unknown): void {
    if (gen !== this.generasjon || rå === null || typeof rå !== "object") return;
    const d = rå as Partial<Record<string, unknown>> & { id?: unknown };

    // KVITTERINGEN bæres av et EGET felt, ikke av at det kommer et svar i det
    // hele tatt — en eldre worker svarer også, bare med noe helt annet.
    if (d.klar !== undefined) {
      this.avbrytKvittering();
      const ms = this.tid.nå() - this.startetVed;
      if (d.klar === true) {
        if (this.status !== "laster" && this.status !== "treg") return;
        const fra = this.status;
        this.status = "klar";
        this.protokoll = typeof d.protokoll === "number" ? d.protokoll : 1;
        this.v.logg("worker", {
          status: "klar",
          ms,
          protokoll: this.protokoll,
          ...(fra === "treg" ? { fra } : {}),
          ...(typeof d.ms === "number" ? { byggMs: d.ms } : {}),
        });
      } else {
        this.status = "feil";
        console.warn("Workeren klarte ikke bygge Adams:", d.feil);
        this.v.logg("worker", { status: "feil", ms, feil: String(d.feil).slice(0, 160) });
      }
      return;
    }

    const id = typeof d.id === "number" ? d.id : -1;
    const lapp = this.venter.get(id);
    if (lapp === undefined) {
      // For sent, eller fra en forespørsel vi aldri sendte. Aldri ført inn.
      this.sene++;
      return;
    }
    this.venter.delete(id);
    const ms = this.tid.nå() - lapp.t0;
    const svar = d as Partial<FraWorker & { handling: Handling; utfall: Søkeutfall | null; ms: number; utløpt: true; feil: string }>;

    if (svar.handling !== undefined) {
      this.fristbrudd = 0;
      const utfall = svar.utfall ?? null;
      const lag: Søkelag = this.protokoll < 2 ? "soek-v1" : utfall === "overstyrt" ? "soek" : "soek-nett";
      lapp.løs({ handling: svar.handling, lag, ms, utfall, ...(typeof svar.ms === "number" ? { wms: svar.ms } : {}) });
      return;
    }
    if (svar.utløpt === true) {
      this.fristBrudd();
      lapp.løs({ handling: null, lag: "frist", ms });
      return;
    }
    console.warn("Workeren svarte med feil:", svar.feil);
    lapp.løs({ handling: null, lag: "feil", ms });
  }

  private krasj(gen: number, feil: unknown): void {
    if (gen !== this.generasjon) return;
    this.avbrytKvittering();
    this.status = "feil";
    console.warn("Workeren krasjet:", feil);
    this.v.logg("worker", { status: "krasj", feil: String(feil).slice(0, 160) });
    this.løsAlle("feil");
  }

  private fristBrudd(): void {
    this.fristbrudd++;
    if (this.fristbrudd >= this.v.maksFristbrudd && this.status === "klar") {
      this.status = "pause";
      this.v.logg("worker", { status: "pause", fristbrudd: this.fristbrudd });
    }
  }

  private løsAlle(lag: "feil"): void {
    const nå = this.tid.nå();
    for (const [id, lapp] of this.venter) {
      this.venter.delete(id);
      lapp.løs({ handling: null, lag, ms: nå - lapp.t0 });
    }
  }
}
