/**
 * APPENS SØKEKANAL: FRISTER, ID-ER, FEIL OG GJENOPPRETTING — prøvd, ikke lovet.
 *
 * Revisjonen 11. september fant tre måter kanalen mellom `web/app.ts` og
 * workeren kunne fryse eller slå av boten på (se filhodet i
 * `web/sokeklient.ts`):
 *
 *   1. et `feil`-svar ble aldri løst — trekket ventet ut 20 s
 *   2. ingen frist innenfor eierens fem sekunder, og et sent søk blokkerte
 *      workerens kø for neste forespørsel
 *   3. seks sekunder uten kvittering slo av søket for resten av økten
 *
 * Og N5: `nyKamp()` nådde aldri workerens kjede.
 *
 * Klienten prøves her med en FALSK worker og en FALSK klokke, så fristene kan
 * prøves på mikrosekunder og uten flak. Kjernen (`web/sokekjerne.ts`) prøves med
 * EKTE vekter — de samme base64-filene nettleseren laster ned.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState, Handling } from "../src/motor.ts";
import {
  byggAdams,
  børSøke,
  erLovligKort,
  finnSikkerorakel,
  SØKEPROTOKOLL,
  type AdamsKonfig,
} from "../web/adamskjede.ts";
import { ekteTid, Søkeklient, type Arbeider, type Søkesvar, type Tidtaker } from "../web/sokeklient.ts";
import { lagSøkekjerne, type FraWorker, type Initmelding, type TilWorker } from "../web/sokekjerne.ts";

const ROT = join(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// Falsk klokke og falsk worker
// ---------------------------------------------------------------------------

class FalskTid implements Tidtaker {
  t = 1_000_000;
  private readonly timere: { når: number; fn: () => void; aktiv: boolean }[] = [];
  nå(): number {
    return this.t;
  }
  etter(ms: number, fn: () => void): () => void {
    const x = { når: this.t + ms, fn, aktiv: true };
    this.timere.push(x);
    return () => {
      x.aktiv = false;
    };
  }
  gå(ms: number): void {
    const mål = this.t + ms;
    for (;;) {
      const neste = this.timere.filter((x) => x.aktiv && x.når <= mål).sort((a, b) => a.når - b.når)[0];
      if (neste === undefined) break;
      this.t = neste.når;
      neste.aktiv = false;
      neste.fn();
    }
    this.t = mål;
  }
}

class FalskArbeider implements Arbeider {
  readonly sendt: TilWorker[] = [];
  avsluttet = false;
  private påMelding: (d: unknown) => void = () => {};
  private påFeil: (f: unknown) => void = () => {};
  postMessage(m: TilWorker): void {
    this.sendt.push(m);
  }
  terminate(): void {
    this.avsluttet = true;
  }
  koble(m: (d: unknown) => void, f: (feil: unknown) => void): void {
    this.påMelding = m;
    this.påFeil = f;
  }
  svar(d: unknown): void {
    this.påMelding(d);
  }
  krasj(f: unknown): void {
    this.påFeil(f);
  }
  trekk(): Extract<TilWorker, { type: "adams-trekk" }>[] {
    return this.sendt.filter((m): m is Extract<TilWorker, { type: "adams-trekk" }> => m.type === "adams-trekk");
  }
}

const INIT: Initmelding = {
  type: "adams-init",
  kort: "",
  bud: null,
  vrak: null,
  tro: null,
  vaktflagg: "abmp",
  vrakflagg: "telrd",
  budterskel: -3,
  verdener: 24,
  sigma: 0.5,
};
const KVITT = { id: 0, klar: true, protokoll: 2, verdener: 24, sigma: 0.5, bud: true, vrak: true, søk: true, ms: 1 };
const H: Handling = { type: "SPILL", spiller: 1, kort: { farge: "S", verdi: 14 } };
const S0: GameState = opprettSpill({ antallSpillere: 4 }, 1);

/** La `lagArbeider`-promisen og `.then`-kjedene gå ferdig. */
const tøm = (): Promise<void> => new Promise((r) => setImmediate(r));

function oppsett(o: { trekk?: number; kvittering?: number; maks?: number } = {}) {
  const tid = new FalskTid();
  const arbeidere: FalskArbeider[] = [];
  const logg: [string, Record<string, unknown>][] = [];
  const k = new Søkeklient({
    lagArbeider: async () => {
      const a = new FalskArbeider();
      arbeidere.push(a);
      return a;
    },
    tid,
    kvitteringsfristMs: o.kvittering ?? 15_000,
    trekkfristMs: o.trekk ?? 4_500,
    maksFristbrudd: o.maks ?? 3,
    logg: (t, d) => logg.push([t, d]),
  });
  return { tid, arbeidere, logg, k };
}

async function klarKlient(o: Parameters<typeof oppsett>[0] = {}) {
  const x = oppsett(o);
  x.k.start(INIT);
  await tøm();
  x.arbeidere[0]!.svar(KVITT);
  assert.equal(x.k.status, "klar");
  return x;
}

/** Starter et trekk og gir tilgang til svaret når det kommer. */
function spør(k: Søkeklient): { svar: () => Søkesvar | undefined } {
  let s: Søkesvar | undefined;
  void k.trekk(S0, 1).then((x) => {
    s = x;
  });
  return { svar: () => s };
}

// ---------------------------------------------------------------------------
// Klienten
// ---------------------------------------------------------------------------

test("1: et feil-svar løser trekket MED ÉN GANG, ikke etter fristen", async () => {
  const { k, arbeidere } = await klarKlient();
  const p = spør(k);
  const id = arbeidere[0]!.trekk()[0]!.id;
  arbeidere[0]!.svar({ id, feil: "TypeError: noe" });
  await tøm();
  assert.equal(p.svar()?.lag, "feil");
  assert.equal(p.svar()?.handling, null);
  assert.equal(p.svar()?.ms, 0, "klokka har ikke gått – svaret skal ikke ha ventet");
});

test("2: uten svar kommer reserven ved fristen, og det SENE svaret føres aldri inn", async () => {
  const { k, arbeidere, tid } = await klarKlient({ trekk: 4_500 });
  const a = arbeidere[0]!;
  const første = spør(k);
  const id1 = a.trekk()[0]!.id;
  assert.equal(a.trekk()[0]!.frist, tid.nå() + 4_500, "forespørselen skal bære fristen");

  tid.gå(4_499);
  await tøm();
  assert.equal(første.svar(), undefined, "før fristen skal trekket fortsatt vente");
  tid.gå(1);
  await tøm();
  assert.deepEqual(første.svar(), { handling: null, lag: "frist", ms: 4_500 });

  // Neste beslutning. Det sene svaret på den FORRIGE kommer først.
  const andre = spør(k);
  const id2 = a.trekk()[1]!.id;
  assert.notEqual(id2, id1);
  a.svar({ id: id1, handling: H, utfall: "overstyrt", ms: 9_000 });
  await tøm();
  assert.equal(andre.svar(), undefined, "et svar med en annen id skal ikke løse dette trekket");
  assert.equal(k.sene, 1);

  const H2: Handling = { type: "SPILL", spiller: 1, kort: { farge: "H", verdi: 2 } };
  tid.gå(120);
  a.svar({ id: id2, handling: H2, utfall: "enig", ms: 80 });
  await tøm();
  assert.deepEqual(andre.svar(), { handling: H2, lag: "soek-nett", ms: 120, utfall: "enig", wms: 80 });
});

test("2b: et overstyrende søk merkes «soek», og utløpt i køen regnes som fristbrudd", async () => {
  const { k, arbeidere } = await klarKlient();
  const a = arbeidere[0]!;
  const p = spør(k);
  a.svar({ id: a.trekk()[0]!.id, handling: H, utfall: "overstyrt", ms: 5 });
  await tøm();
  assert.equal(p.svar()?.lag, "soek");

  const q = spør(k);
  a.svar({ id: a.trekk()[1]!.id, utløpt: true, forsinketMs: 12 });
  await tøm();
  assert.equal(q.svar()?.lag, "frist");
});

test("3: kvitteringsfristen gjør workeren TREG, ikke død — en sen kvittering gjør den klar", async () => {
  const { k, arbeidere, tid, logg } = oppsett({ kvittering: 15_000 });
  k.start(INIT);
  await tøm();
  assert.equal(k.status, "laster");
  assert.equal((await k.trekk(S0, 1)).lag, "ikke-klar", "laster: ingen venting, hovedtråden spiller");

  tid.gå(15_000);
  assert.equal(k.status, "treg");
  assert.ok(logg.some(([t, d]) => t === "worker" && d.status === "treg"), "treg skal logges");
  assert.equal((await k.trekk(S0, 1)).lag, "ikke-klar");

  tid.gå(5_000);
  arbeidere[0]!.svar(KVITT);
  assert.equal(k.status, "klar", "en sen kvittering skal slå søket PÅ igjen");
  assert.ok(logg.some(([t, d]) => t === "worker" && d.status === "klar" && d.fra === "treg" && d.ms === 20_000));

  const p = spør(k);
  arbeidere[0]!.svar({ id: arbeidere[0]!.trekk()[0]!.id, handling: H, utfall: "enig", ms: 1 });
  await tøm();
  assert.equal(p.svar()?.lag, "soek-nett");
  assert.equal(arbeidere.length, 1, "ingen omstart var nødvendig");
});

test("3b: fortsatt treg ved neste kamp -> ny worker, og den gamle kan ikke svare for den nye", async () => {
  const { k, arbeidere, tid, logg } = oppsett();
  k.start(INIT);
  await tøm();
  tid.gå(15_000);
  assert.equal(k.status, "treg");

  k.nyKamp();
  assert.ok(arbeidere[0]!.avsluttet, "den gamle workeren skal avsluttes");
  assert.ok(logg.some(([t, d]) => t === "worker" && d.status === "omstart" && d.fra === "treg"));
  await tøm();
  assert.equal(arbeidere.length, 2);
  assert.equal(arbeidere[1]!.sendt[0]?.type, "adams-init");

  arbeidere[0]!.svar(KVITT); // fra den avløste – skal ignoreres
  assert.equal(k.status, "laster");
  arbeidere[1]!.svar(KVITT);
  assert.equal(k.status, "klar");
});

test("3c: klar:false og krasj løser ventende trekk straks, og neste kamp prøver igjen", async () => {
  const x = oppsett();
  x.k.start(INIT);
  await tøm();
  x.arbeidere[0]!.svar({ id: 0, klar: false, protokoll: 2, feil: "adams-init: tomme vekter" });
  assert.equal(x.k.status, "feil");
  x.k.nyKamp();
  await tøm();
  assert.equal(x.arbeidere.length, 2, "feilet worker skal startes på nytt ved neste kamp");

  const { k, arbeidere } = await klarKlient();
  const p = spør(k);
  arbeidere[0]!.krasj("Uncaught RangeError");
  await tøm();
  assert.equal(p.svar()?.lag, "feil");
  assert.equal(k.status, "feil");
});

test("3d: workerkoden kan ikke hentes -> feil, logget, og ny sjanse neste kamp", async () => {
  let forsøk = 0;
  const logg: [string, Record<string, unknown>][] = [];
  const k = new Søkeklient({
    lagArbeider: async () => {
      forsøk++;
      throw new Error("worker.js kunne ikke hentes");
    },
    tid: new FalskTid(),
    kvitteringsfristMs: 15_000,
    trekkfristMs: 4_500,
    maksFristbrudd: 3,
    logg: (t, d) => logg.push([t, d]),
  });
  k.start(INIT);
  await tøm();
  assert.equal(k.status, "feil");
  assert.ok(logg.some(([t, d]) => t === "worker" && d.status === "feil"));
  k.nyKamp();
  await tøm();
  assert.equal(forsøk, 2);
});

test("fristbrudd på rad setter søket på pause resten av kampen, og ny kamp slår det på", async () => {
  const { k, tid, logg } = await klarKlient({ trekk: 1_000, maks: 3 });
  for (let i = 0; i < 3; i++) {
    const p = spør(k);
    tid.gå(1_000);
    await tøm();
    assert.equal(p.svar()?.lag, "frist");
  }
  assert.equal(k.status, "pause");
  assert.ok(logg.some(([t, d]) => t === "worker" && d.status === "pause"));
  assert.equal((await k.trekk(S0, 1)).lag, "ikke-klar");
  k.nyKamp();
  assert.equal(k.status, "klar");
});

test("N5: nyKamp når workeren — men sendes ikke til en protokoll-1-worker", async () => {
  const { k, arbeidere } = await klarKlient();
  k.nyKamp();
  assert.ok(arbeidere[0]!.sendt.some((m) => m.type === "nyKamp"));

  const gammel = oppsett();
  gammel.k.start(INIT);
  await tøm();
  gammel.arbeidere[0]!.svar({ id: 0, klar: true }); // slik HEAD-workeren kvitterer
  assert.equal(gammel.k.protokoll, 1);
  gammel.k.nyKamp();
  assert.ok(!gammel.arbeidere[0]!.sendt.some((m) => m.type === "nyKamp"));
  const p = spør(gammel.k);
  gammel.arbeidere[0]!.svar({ id: gammel.arbeidere[0]!.trekk()[0]!.id, handling: H });
  await tøm();
  assert.equal(p.svar()?.lag, "soek-v1");
});

// ---------------------------------------------------------------------------
// Kjernen, med ekte vekter
// ---------------------------------------------------------------------------

const VEKTER = {
  kort: readFileSync(join(ROT, "web", "dist", "adams-kort.b64"), "utf8"),
  vrak: readFileSync(join(ROT, "web", "dist", "adams-vrak.b64"), "utf8"),
  bud: JSON.parse(readFileSync(join(ROT, "e1-modell", "bud-menneske.json"), "utf8")) as unknown,
};
const KONFIG: AdamsKonfig = { vaktflagg: "abmp", vrakflagg: "telrd", budterskel: -3, verdener: 8, sigma: 0.5 };
const INIT_EKTE: Initmelding = { type: "adams-init", ...VEKTER, tro: null, ...KONFIG };

/** Spiller fram til første kortvalg der boten er spillefører. */
function førerstilling(frø: number): { s: GameState; aktør: number } {
  const bot = byggAdams(VEKTER, KONFIG, false).agent;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  for (let vakt = 0; vakt < 2_000; vakt++) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    if (børSøke(s, aktør, KONFIG.verdener) && s.stikkSpilt >= 2) return { s, aktør };
    s = utfør(s, bot.velgHandling(s)).state;
  }
  throw new Error("fant ingen førerstilling");
}

test("kjernen: kvittering med protokoll, lovlig kort med utfall, og søkelaget finnes i kjeden", () => {
  const svar: FraWorker[] = [];
  const kjerne = lagSøkekjerne((m) => svar.push(m));
  kjerne({ type: "nyKamp" }); // før init: skal ikke kaste
  kjerne(INIT_EKTE);
  const kvitt = svar.shift() as Extract<FraWorker, { klar: true }>;
  assert.equal(kvitt.klar, true, JSON.stringify(kvitt));
  assert.equal(kvitt.protokoll, SØKEPROTOKOLL);
  assert.ok(kvitt.søk && kvitt.bud && kvitt.vrak, `ikke alt ble bygd: ${JSON.stringify(kvitt)}`);

  const { s, aktør } = førerstilling(61_100_001);
  kjerne({ type: "adams-trekk", id: 7, state: structuredClone(s), sete: aktør });
  const t = svar.shift() as Extract<FraWorker, { handling: Handling }>;
  assert.equal(t.id, 7);
  assert.ok(erLovligKort(s, t.handling), `ulovlig kort ${JSON.stringify(t.handling)}`);
  assert.ok(["overstyrt", "enig", "under-port", "ikke-vurdert"].includes(String(t.utfall)), `utfall ${t.utfall}`);

  // `finnSikkerorakel` følger `indre`. Bytter feltet navn, skal DETTE bli rødt.
  assert.notEqual(finnSikkerorakel(byggAdams(VEKTER, KONFIG, true).agent), null);
  assert.equal(finnSikkerorakel(byggAdams(VEKTER, KONFIG, false).agent), null);
});

test("kjernen: for sene forespørsler hoppes over, ukjente meldinger får feil MED id", () => {
  let klokke = 50_000;
  const svar: FraWorker[] = [];
  const kjerne = lagSøkekjerne((m) => svar.push(m), () => klokke);
  kjerne(INIT_EKTE);
  svar.length = 0;

  const { s, aktør } = førerstilling(61_100_002);
  const t0 = performance.now();
  kjerne({ type: "adams-trekk", id: 3, state: s, sete: aktør, frist: klokke - 1 });
  assert.ok(performance.now() - t0 < 50, "et utløpt trekk skal ikke regnes ut");
  assert.deepEqual(svar.shift(), { id: 3, utløpt: true, forsinketMs: 1 });

  klokke = 0;
  kjerne({ type: "adams-trekk", id: 4, state: s, sete: aktør, frist: 10_000 });
  assert.ok("handling" in svar.shift()!, "innenfor fristen skal trekket regnes ut");

  kjerne({ type: "beslutt", id: 9 } as unknown as TilWorker);
  const f = svar.shift() as { id: number; feil: string };
  assert.equal(f.id, 9);
  assert.match(f.feil, /ukjent meldingstype/);

  // Før init: feil med id, ikke taushet.
  const tom: FraWorker[] = [];
  lagSøkekjerne((m) => tom.push(m))({ type: "adams-trekk", id: 5, state: s, sete: aktør });
  assert.equal((tom[0] as { id: number; feil?: string }).id, 5);
  assert.ok("feil" in tom[0]!);
});

test("ende til ende: klienten mot ekte kjerne over en asynkron, klonende kanal", async () => {
  const kanal: Arbeider = (() => {
    let påMelding: (d: unknown) => void = () => {};
    let lukket = false;
    const kjerne = lagSøkekjerne((m) => {
      if (!lukket) setImmediate(() => påMelding(structuredClone(m)));
    });
    return {
      postMessage: (m) => setImmediate(() => kjerne(structuredClone(m))),
      terminate: () => {
        lukket = true;
      },
      koble: (m) => {
        påMelding = m;
      },
    };
  })();
  const k = new Søkeklient({
    lagArbeider: async () => kanal,
    tid: ekteTid,
    kvitteringsfristMs: 30_000,
    trekkfristMs: 30_000,
    maksFristbrudd: 3,
    logg: () => {},
  });
  k.start(INIT_EKTE);
  for (let i = 0; i < 400 && k.status !== "klar"; i++) await tøm();
  assert.equal(k.status, "klar");
  assert.equal(k.protokoll, SØKEPROTOKOLL);

  const { s, aktør } = førerstilling(61_100_003);
  const svar = await k.trekk(s, aktør);
  assert.ok(svar.lag === "soek" || svar.lag === "soek-nett", `lag ${svar.lag}`);
  assert.ok(svar.handling !== null && erLovligKort(s, svar.handling));
  k.nyKamp();
});
