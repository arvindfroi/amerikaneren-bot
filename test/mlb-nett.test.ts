/**
 * SANDKASSENETTET — FORMEN, VEKTFORMATET, OG DEN HARDE SKRANKEN.
 *
 * `docs/sandkassen.md` §5: ett felles underlag, tre hoder. To ting kan gå galt
 * her uten at noe krasjer, og begge er prøvd:
 *
 * 1. **Vektfila kan være forskjøvet.** Leses `ut × inn` som `inn × ut`, eller
 *    havner biasen på feil sted, kjører alt videre med søppelvekter. Derfor
 *    bygges en HÅNDREGNET fil her, med tall der fasiten er eksakt i float32, og
 *    hvert eneste utgangstall sammenliknes.
 *
 * 2. **`velgKode` kan returnere en ulovlig kode.** Det er den ene skranken
 *    nettet aldri skal kunne bryte — `handling.ta` kaster på en ulovlig kode, og
 *    en agent som kaster én gang i timen stopper en flertimers liga midt i.
 *    Prøven kjører tusenvis av tilfeldige logits og masker, inkludert masker med
 *    bare ÉN åpen plass og logits med `-Infinity` og `NaN`, og krever
 *    `maske[kode] === 1` hver gang.
 *
 * Og prøven må kunne feile: nederst kjøres en VELGER SOM IKKE SER MASKEN
 * gjennom nøyaktig samme rigg, og den skal bli tatt.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import {
  HANDLING_LENGDE,
  HANDLING_NAVN,
  maske,
  ta,
  TOMT_DELVALG,
  type Delvalg,
} from "../src/mlb/handling.ts";
import {
  byggTrekk,
  LOVLIG_KODER,
  LOVLIG_UTELATT,
  TREKK_LENGDE,
  TREKK_NAVN,
  TRO_LENGDE,
} from "../src/mlb/trekk.ts";
import {
  DELER,
  POLICY_UT,
  KVANTIL_UT,
  Sandkassenett,
  STIKK_UT,
  TRO_UT,
  VERDI_UT,
  tilFordeling,
  velgKode,
} from "../src/mlb/nett.ts";

// ===========================================================================
// Formen
// ===========================================================================

test("Sandkassenettet: policyhodet ER handlingsrommet, og troen er 52 × 4", () => {
  assert.equal(POLICY_UT, HANDLING_LENGDE, "policy må ha nøyaktig én plass per handling");
  assert.equal(POLICY_UT, 68);
  assert.equal(TRO_UT, 208);
  assert.equal(VERDI_UT, 1);
  // Halehodet står BAKERST, og rekkefølgen er ikke smak: en fil skrevet før
  // §125 har fire deler, og bare med halen sist kan de fire leses uforskjøvet.
  assert.equal(STIKK_UT, 13);
  assert.equal(KVANTIL_UT, 32);
  // Nye hoder legges ALLTID BAKERST, og rekkefølgen er ikke smak: en fil
  // skrevet før §125 har fire deler og en før §127 har fem, og bare med de nye
  // sist kan de gamle leses uforskjøvet.
  assert.deepEqual(
    [...DELER],
    ["stamme", "policy", "verdi", "tro", "verdiHale", "stikk", "verdiKvantil"],
  );
  // STIKK_UT er `antallStikk + 1` ved fire spillere, og det leses av MOTOREN og
  // ikke av en kommentar. Et hardkodet 13 som stille ble feil ville gitt et hode
  // uten plass til etiketten.
  const g = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, 1);
  assert.equal(STIKK_UT, g.giving.antallStikk + 1);
});

test("Sandkassenettet: et tilfeldig nett har riktig form og gir tre hoder på én passering", () => {
  const nett = Sandkassenett.tilfeldig(1234, [64, 32]);
  assert.equal(nett.inngangsLengde, TREKK_LENGDE);
  assert.equal(nett.stammeBredde, 32);

  const x = new Float32Array(TREKK_LENGDE);
  const rng = lagRng(99);
  for (let i = 0; i < TREKK_LENGDE; i++) x[i] = rng() < 0.25 ? rng() : 0;
  const f = nett.framover(x);
  assert.equal(f.policy.length, POLICY_UT);
  assert.equal(f.tro.length, TRO_UT);
  assert.equal(typeof f.verdi, "number");
  assert.ok(Number.isFinite(f.verdi), "verdihodet ga ikke et endelig tall");
  for (let i = 0; i < POLICY_UT; i++) assert.ok(Number.isFinite(f.policy[i]!), `policy[${i}]`);
  for (let i = 0; i < TRO_UT; i++) assert.ok(Number.isFinite(f.tro[i]!), `tro[${i}]`);

  // Determinisme: samme frø, samme vekter, samme tall.
  const igjen = Sandkassenett.tilfeldig(1234, [64, 32]).framover(x);
  assert.deepEqual([...igjen.policy], [...f.policy]);
  assert.equal(igjen.verdi, f.verdi);

  const p = nett.troFordeling(x);
  assert.equal(p.length, 52);
  for (const rad of p) {
    assert.equal(rad.length, 4);
    const s = rad.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-6, `fordelingen summerte til ${s}`);
  }
  assert.deepEqual(tilFordeling(f.tro), p, "troFordeling må være tilFordeling(framover().tro)");
});

test("Sandkassenettet: parametertallet stemmer med lagformen", () => {
  const nett = Sandkassenett.tilfeldig(7, [1024, 768, 512]);
  const p = nett.parametre();
  const vent = (dims: number[]): number => {
    let s = 0;
    for (let i = 0; i + 1 < dims.length; i++) s += dims[i]! * dims[i + 1]! + dims[i + 1]!;
    return s;
  };
  assert.equal(p.stamme, vent([TREKK_LENGDE, 1024, 768, 512]));
  assert.equal(p.policy, 512 * POLICY_UT + POLICY_UT);
  assert.equal(p.verdi, 512 * 1 + 1);
  assert.equal(p.tro, 512 * TRO_UT + TRO_UT);
  assert.equal(p.verdiHale, 512 * 1 + 1);
  assert.equal(p.stikk, 512 * STIKK_UT + STIKK_UT);
  assert.equal(p.verdiKvantil, 512 * KVANTIL_UT + KVANTIL_UT);
  assert.equal(
    p.sum,
    p.stamme + p.policy + p.verdi + p.tro + p.verdiHale + p.stikk + p.verdiKvantil,
  );
});

test("Sandkassenettet: gamle filformater gir BIT-IDENTISKE utganger", () => {
  /**
   * DEN VIKTIGSTE BAKOVERKOMPATIBILITETEN I HELE §125 OG §127.
   *
   * Ti epokers vekter ligger i fire- og femdelsformatet. Kunne de ikke leses
   * videre, ville hvert nytt hode kostet et helt løp — og verre: en fil som ble
   * lest med et TILFELDIG halehode ville gitt et annet `V` uten at noe feilet,
   * og fordelen `G^γ − V` ville hatt en skjevhet på nøyaktig det hodets utgang.
   *
   * Prøven klipper hodene av bakfra, ett om gangen, og krever bit-likhet på
   * HVER utgang for hvert format. Den er derfor også prøven på at rekkefølgen
   * i `DELER` er riktig: står et nytt hode midt i, blir en gammel fil lest
   * forskjøvet, og trohodet ville flyttet seg med det samme.
   */
  const full = Sandkassenett.tilfeldig(4242, [64, 32]);
  const bytes = full.tilBytes();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getInt32(0, true), 7, "et nytt nett skal skrives med sju deler");

  const x = new Float32Array(TREKK_LENGDE);
  const rng = lagRng(31);
  for (let i = 0; i < TREKK_LENGDE; i++) x[i] = rng() < 0.3 ? rng() * 2 - 1 : 0;
  const a = full.framover(x);
  assert.equal(a.verdi, a.verdiRunde! + a.verdiHale!, "V er ikke summen av de to leddene");

  // Ett hode = dellengde + [inn,ut] + W (32×ut) + b (ut).
  const hodebytes = (ut: number): number => 4 + 8 + (32 * ut + ut) * 4;
  let kutt = 0;
  for (const [antall, ut] of [
    [6, KVANTIL_UT],
    [5, STIKK_UT],
    [4, VERDI_UT],
  ] as const) {
    kutt += hodebytes(ut);
    const kortere = bytes.slice(0, bytes.length - kutt);
    new DataView(kortere.buffer, kortere.byteOffset, kortere.byteLength).setInt32(0, antall, true);
    const gammel = Sandkassenett.fraBytes(kortere);
    assert.equal(gammel.lesteDeler, antall);
    const b = gammel.framover(x);
    assert.deepEqual([...b.policy], [...a.policy], `${antall} deler: policyhodet flyttet seg`);
    assert.deepEqual([...b.tro], [...a.tro], `${antall} deler: trohodet flyttet seg`);
    assert.equal(b.verdi, a.verdi, `${antall} deler: V er ikke bit-identisk`);
  }

  // Og de tre nye hodene er NØYTRALE i et nytt nett: halen er null,
  // kvantilsnittet er null, og `V_runde` er derfor skalaren alene.
  assert.equal(a.verdiHale, 0, "halehodet må starte på eksakt null");
  const snitt = [...a.verdiKvantil!].reduce((s, v) => s + v, 0) / KVANTIL_UT;
  assert.equal(snitt, 0, "kvantilsnittet må starte på eksakt null");
  assert.equal(a.stikk!.length, STIKK_UT);
});

test("Sandkassenettet: stikkfordelingen er en fordeling over 0…12", () => {
  const nett = Sandkassenett.tilfeldig(77, [64, 32]);
  const x = new Float32Array(TREKK_LENGDE);
  const rng = lagRng(5);
  for (let i = 0; i < TREKK_LENGDE; i++) x[i] = rng() < 0.3 ? rng() : 0;
  const p = nett.stikkFordeling(x);
  assert.equal(p.length, STIKK_UT);
  const s = p.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 1) < 1e-9, `stikkfordelingen summerte til ${s}`);
  // Et nullstilt hode er UNIFORMT, ikke degenerert. Det er den nøytrale
  // starten, og den skal ikke gi noen retning før hodet har lært noe.
  for (const q of p) assert.ok(Math.abs(q - 1 / STIKK_UT) < 1e-9);
});

// ===========================================================================
// Vektformatet — håndregnet, ikke antatt
// ===========================================================================

/** Skriver appens Int32/Float32-format: antall nett, per nett antall lag, per lag inn/ut/vekter/bias. */
function tilBytes(deler: readonly { inn: number; ut: number; vekter: Float32Array; bias: Float32Array }[][]): Uint8Array {
  let n = 4;
  for (const del of deler) {
    n += 4;
    for (const l of del) n += 8 + l.vekter.length * 4 + l.bias.length * 4;
  }
  const b = Buffer.alloc(n);
  let p = 0;
  b.writeInt32LE(deler.length, p);
  p += 4;
  for (const del of deler) {
    b.writeInt32LE(del.length, p);
    p += 4;
    for (const l of del) {
      b.writeInt32LE(l.inn, p);
      b.writeInt32LE(l.ut, p + 4);
      p += 8;
      for (const v of l.vekter) {
        b.writeFloatLE(v, p);
        p += 4;
      }
      for (const v of l.bias) {
        b.writeFloatLE(v, p);
        p += 4;
      }
    }
  }
  return new Uint8Array(b);
}

const lag = (inn: number, ut: number, f: (r: number, c: number) => number, bias: (r: number) => number) => {
  const vekter = new Float32Array(inn * ut);
  // ut × inn, RADVIS: rad r er utgang r. Byttes de om, faller prøven under.
  for (let r = 0; r < ut; r++) for (let c = 0; c < inn; c++) vekter[r * inn + c] = f(r, c);
  const b = new Float32Array(ut);
  for (let r = 0; r < ut; r++) b[r] = bias(r);
  return { inn, ut, vekter, bias: b };
};

test("Sandkassenettet: vektfila leses med riktig layout, og stammens ReLU ligger PÅ", () => {
  /**
   * Stammen plukker ut de fire første trekkene: rad r har 1 på kolonne r.
   * Tallene er små heltall, så fasiten er eksakt i float32 og prøven kan kreve
   * LIKHET, ikke nærhet. En transponert vektlesning ville plukket ut helt andre
   * trekk, og en bias på avveie ville flyttet alt.
   */
  const stamme = [lag(TREKK_LENGDE, 4, (r, c) => (c === r ? 1 : 0), (r) => (r === 3 ? -100 : 0))];
  const policy = [lag(4, POLICY_UT, (r, c) => (c === 0 ? r + 1 : 0), () => 0)];
  const verdi = [lag(4, VERDI_UT, (_, c) => c + 1, () => 5)];
  const tro = [lag(4, TRO_UT, (r, c) => (c === 1 ? r % 3 : 0), () => 0)];
  const nett = Sandkassenett.fraBytes(tilBytes([stamme, policy, verdi, tro]));

  const x = new Float32Array(TREKK_LENGDE);
  x[0] = 2;
  x[1] = 3;
  x[2] = -7; // negativ inn → stammen skal nulle den ut
  x[3] = 1; // + bias −100 → også null
  const f = nett.framover(x);

  // h = relu([2, 3, −7, 1 − 100]) = [2, 3, 0, 0]
  for (let r = 0; r < POLICY_UT; r++) {
    assert.equal(f.policy[r], (r + 1) * 2, `policy[${r}] — feil rad/kolonne i vektlesningen`);
  }
  assert.equal(f.verdi, 1 * 2 + 2 * 3 + 5, "verdihodet leste feil vekter eller mistet biasen");
  for (let r = 0; r < TRO_UT; r++) assert.equal(f.tro[r], (r % 3) * 3, `tro[${r}]`);
});

test("Sandkassenettet: en fil med feil form blir AVVIST, ikke stille godtatt", () => {
  const ok = {
    stamme: [lag(TREKK_LENGDE, 4, () => 0, () => 0)],
    policy: [lag(4, POLICY_UT, () => 0, () => 0)],
    verdi: [lag(4, VERDI_UT, () => 0, () => 0)],
    tro: [lag(4, TRO_UT, () => 0, () => 0)],
  };
  const feil: [string, () => Uint8Array][] = [
    ["tre nett i stedet for fire eller fem", () => tilBytes([ok.stamme, ok.policy, ok.verdi])],
    [
      "seks nett — ett for mye",
      () => tilBytes([ok.stamme, ok.policy, ok.verdi, ok.tro, ok.verdi, ok.verdi]),
    ],
    [
      "halehodet har feil bredde ut",
      () => tilBytes([ok.stamme, ok.policy, ok.verdi, ok.tro, [lag(4, 2, () => 0, () => 0)]]),
    ],
    [
      "feil inngangsbredde",
      () => tilBytes([[lag(TREKK_LENGDE - 1, 4, () => 0, () => 0)], ok.policy, ok.verdi, ok.tro]),
    ],
    [
      "policyhodet har feil bredde ut",
      () => tilBytes([ok.stamme, [lag(4, POLICY_UT - 1, () => 0, () => 0)], ok.verdi, ok.tro]),
    ],
    [
      "trohodet passer ikke på stammen",
      () => tilBytes([ok.stamme, ok.policy, ok.verdi, [lag(8, TRO_UT, () => 0, () => 0)]]),
    ],
  ];
  for (const [hva, bygg] of feil) {
    assert.throws(() => Sandkassenett.fraBytes(bygg()), new RegExp(".", "s"), `${hva} slapp igjennom`);
  }
  // Kontrollen: den RIKTIGE fila skal ikke kaste, ellers beviser prøven ingenting.
  assert.doesNotThrow(() => Sandkassenett.fraBytes(tilBytes([ok.stamme, ok.policy, ok.verdi, ok.tro])));
});

// ===========================================================================
// velgKode — DEN HARDE SKRANKEN
// ===========================================================================

type Velger = (l: Float32Array, m: Uint8Array, t: number, r: () => number) => number;

interface Sveip {
  readonly tilfeller: number;
  readonly brudd: string[];
  readonly ulikeKoder: number;
  readonly énÅpen: number;
}

/**
 * Sveiper gjennom logits og masker av alle slag, og teller hver gang velgeren
 * peker på en plass masken har stengt.
 *
 * Fordelingene er valgt for å treffe hjørnene, ikke for å se pene ut:
 * `-Infinity` og `NaN` er nøyaktig det et nett med sprengte vekter produserer,
 * og en maske med én åpen plass er stillingen der det bare finnes ett lovlig
 * kort — den vanligste i sluttspillet.
 */
function sveip(velg: Velger, runder: number): Sveip {
  const rng = lagRng(4_711_007);
  const brudd: string[] = [];
  const koder = new Set<number>();
  let tilfeller = 0;
  let énÅpen = 0;

  const temperaturer = [0, -1, NaN, 1e-6, 0.05, 0.5, 1, 3, 1e6];
  const rngVarianter: readonly [string, () => () => number][] = [
    ["seedet", () => lagRng(88_001)],
    ["alltid 0", () => () => 0],
    ["alltid 1", () => () => 1],
    ["over 1", () => () => 1.0000001],
    ["NaN", () => () => NaN],
    ["negativ", () => () => -0.5],
  ];

  for (let r = 0; r < runder; r++) {
    const n = HANDLING_LENGDE;
    const m = new Uint8Array(n);
    const form = r % 5;
    if (form === 0) {
      // Nøyaktig én åpen plass.
      m[Math.floor(rng() * n)] = 1;
      énÅpen++;
    } else if (form === 1) {
      for (let i = 0; i < n; i++) m[i] = 1; // alt åpent
    } else {
      const p = 0.05 + rng() * 0.5;
      for (let i = 0; i < n; i++) m[i] = rng() < p ? 1 : 0;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += m[i]!;
      if (sum === 0) {
        m[Math.floor(rng() * n)] = 1;
        énÅpen++;
      }
    }

    const l = new Float32Array(n);
    const stil = r % 7;
    for (let i = 0; i < n; i++) {
      if (stil === 0) l[i] = (rng() - 0.5) * 20;
      else if (stil === 1) l[i] = rng() < 0.5 ? -Infinity : (rng() - 0.5) * 4;
      else if (stil === 2) l[i] = rng() < 0.3 ? NaN : (rng() - 0.5) * 4;
      else if (stil === 3) l[i] = -Infinity; // ALLE umulige
      else if (stil === 4) l[i] = NaN; // ALLE ugyldige
      else if (stil === 5) l[i] = rng() < 0.1 ? Infinity : (rng() - 0.5) * 1e3;
      else l[i] = 0; // helt flat
    }

    for (const t of temperaturer) {
      for (const [navn, lagKilde] of rngVarianter) {
        tilfeller++;
        const kode = velg(l, m, t, lagKilde());
        koder.add(kode);
        if (!Number.isInteger(kode) || kode < 0 || kode >= n || m[kode] !== 1) {
          if (brudd.length < 8) {
            brudd.push(
              `runde ${r} maskeform ${form} logitstil ${stil} temp ${t} rng «${navn}»: ` +
                `velgeren returnerte ${kode}, som masken har STENGT`,
            );
          }
        }
      }
    }
  }
  return { tilfeller, brudd, ulikeKoder: koder.size, énÅpen };
}

test("velgKode: returnerer ALLTID en kode masken har åpnet — også for -Infinity og NaN", () => {
  const r = sveip(velgKode, 400);
  assert.ok(r.tilfeller >= 20_000, `bare ${r.tilfeller} tilfeller — beviser lite`);
  assert.ok(r.énÅpen >= 50, `bare ${r.énÅpen} masker med én åpen plass`);
  assert.ok(r.ulikeKoder >= 20, `bare ${r.ulikeKoder} ulike koder ble noen gang valgt`);
  assert.deepEqual(
    r.brudd,
    [],
    `ULOVLIG VALG. Dette er ikke en statistisk prøve — ett brudd er nok, fordi ` +
      `handling.ta kaster og en liga stopper.\n${r.brudd.join("\n")}`,
  );
});

test("velgKode: prøven kan FEILE — en velger som ikke ser masken blir tatt", () => {
  /** Ren argmaks over ALLE plasser, uten maske. Nøyaktig feilen skranken finnes for. */
  const blind: Velger = (l) => {
    let best = 0;
    for (let i = 1; i < l.length; i++) if ((l[i] ?? -Infinity) > (l[best] ?? -Infinity)) best = i;
    return best;
  };
  const r = sveip(blind, 60);
  assert.ok(
    r.brudd.length > 0,
    `en velger som ignorerer masken slapp gjennom riggen. Da måler den grønne prøven over ` +
      `ingenting.`,
  );
});

test("velgKode: temperatur 0 er argmaks OVER DE LOVLIGE, ikke over alle", () => {
  const rng = lagRng(20_260_809);
  for (let r = 0; r < 300; r++) {
    const n = HANDLING_LENGDE;
    const m = new Uint8Array(n);
    const l = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      m[i] = rng() < 0.3 ? 1 : 0;
      l[i] = (rng() - 0.5) * 10;
    }
    if (!m.includes(1)) m[3] = 1;
    // Det GLOBALT beste legges på en STENGT plass, så en maskeblind argmaks ryker.
    let stengt = -1;
    for (let i = 0; i < n; i++) if (m[i] === 0) stengt = i;
    if (stengt >= 0) l[stengt] = 1000;

    let vent = -1;
    for (let i = 0; i < n; i++) {
      if (m[i] !== 1) continue;
      if (vent < 0 || l[i]! > l[vent]!) vent = i;
    }
    assert.equal(velgKode(l, m, 0, rng), vent, `argmaks bommet i runde ${r}`);
  }
});

test("velgKode: sampling er faktisk sampling, og en skarp logit dominerer", () => {
  const n = HANDLING_LENGDE;
  const m = new Uint8Array(n);
  for (const i of [2, 5, 9, 40]) m[i] = 1;
  const flat = new Float32Array(n);
  const rng = lagRng(31_337);
  const teller = new Map<number, number>();
  for (let i = 0; i < 4000; i++) {
    const k = velgKode(flat, m, 1, rng);
    teller.set(k, (teller.get(k) ?? 0) + 1);
  }
  assert.equal(teller.size, 4, "en flat fordeling traff ikke alle fire lovlige plassene");
  for (const [k, c] of teller) assert.ok(c > 700 && c < 1300, `plass ${k} fikk ${c} av 4000`);

  const skarp = new Float32Array(n);
  skarp[9] = 20;
  let treff = 0;
  for (let i = 0; i < 2000; i++) if (velgKode(skarp, m, 1, rng) === 9) treff++;
  assert.ok(treff > 1980, `en logit 20 over de andre ble valgt bare ${treff} av 2000 ganger`);
});

// ===========================================================================
// DEN AVSKRUBARE EKSTERNE TROEN
// ===========================================================================

test("§126-layouten: bare den BEVISBART umulige er borte, og sensorene står på", () => {
  /**
   * Erstatter prøven «den eksterne troen er AVSKRUBAR». Troen er ikke lenger
   * avskrubar i praksis — den står PÅ i spillingen, i gjenspillingen og i
   * `spekagent.ts` — og det som prøves her er regelen bak layouten.
   *
   * REGELEN: en inngang fjernes bare når det kan BEVISES at den aldri kan bære
   * informasjon. Er det tvil, står den. Førsteutkastet til §126 fjernet 215
   * innganger på grunnlag av «fikk aldri gradient» — som er observasjon, ikke
   * bevis, og som for tro-blokkens del hadde en helt annen årsak: ingen driver
   * satte den. Prøven låser at rettelsen står.
   */
  assert.equal(TREKK_LENGDE, 1031);
  assert.equal(TRO_LENGDE, 261);

  // DE SOM STÅR — sensorer, ikke søppel.
  assert.equal(TREKK_NAVN.filter((n) => n.startsWith("tro.p.")).length, 208);
  assert.equal(TREKK_NAVN.filter((n) => n === "tro.tilgjengelig").length, 1);
  assert.equal(TREKK_NAVN.filter((n) => n.startsWith("tro.usett.")).length, 52);
  assert.equal(TREKK_NAVN.filter((n) => n.startsWith("meso.iTur.")).length, 4);
  assert.equal(TREKK_NAVN.filter((n) => n.startsWith("meso.utspiller.")).length, 4);

  // DEN SOM ER BORTE — og den er borte fordi den er umulig, ikke fordi den
  // er utrent.
  assert.deepEqual(LOVLIG_UTELATT, ["bud:13"]);
  assert.equal(TREKK_NAVN.filter((n) => n === "lovlig.bud:13").length, 0);
  assert.equal(LOVLIG_KODER.length, HANDLING_LENGDE - 1);

  /**
   * OG BEVISET, som er det eneste her som ikke kan leses ut av kildekoden:
   * `bud:13` er aldri lovlig ved fire spillere, fordi bordet gir tolv stikk.
   * Det prøves mot `maske()` selv — lovlighetens ENE kilde — over hver
   * stilling i seks hele kamper, i alle fire faser.
   */
  const utelatte = LOVLIG_UTELATT.map((n) => HANDLING_NAVN.indexOf(n));
  for (const i of utelatte) assert.ok(i >= 0, "en utelatt kode finnes ikke i HANDLING_NAVN");
  const rng = lagRng(70126);
  let stillinger = 0;
  let budstillinger = 0;
  for (let kamp = 0; kamp < 6; kamp++) {
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, 987_654 + kamp * 7717);
    for (let i = 0; i < 20000 && s.fase !== "FERDIG"; i++) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" } as never).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null) break;
      let delvalg: Delvalg = TOMT_DELVALG;
      for (let steg = 0; steg < 20; steg++) {
        const visning = spillerVisning(s, sete);
        const m = maske(visning, s.giving, delvalg);
        stillinger++;
        if (s.fase === "BUDRUNDE") budstillinger++;
        for (const k of utelatte) {
          assert.equal(m[k], 0, `${HANDLING_NAVN[k]} var LOVLIG — plassen bærer informasjon`);
        }
        const steget = ta(visning, s.giving, delvalg, velgKode(new Float32Array(m.length), m, 1, rng));
        if (steget.ferdig) {
          s = utfør(s, { ...steget.handling, spiller: sete }).state;
          break;
        }
        delvalg = steget.delvalg;
      }
    }
  }
  assert.ok(stillinger > 200, `bare ${stillinger} stillinger prøvd`);
  // BUDRUNDEN er den ENE fasen `bud:13` i det hele tatt kan dukke opp i. Uten
  // budstillinger ville prøven vært grønn på tom mengde — samme felle som
  // talonglekkasjen slapp gjennom.
  assert.ok(budstillinger > 50, `bare ${budstillinger} budstillinger — beviser ingenting`);
});

test("velgKode: en TOM maske kaster — det er ikke et valg som kan reddes", () => {
  const m = new Uint8Array(HANDLING_LENGDE);
  assert.throws(
    () => velgKode(new Float32Array(HANDLING_LENGDE), m, 0, lagRng(1)),
    /tom/i,
    "en tom maske ble stille godtatt",
  );
  assert.throws(
    () => velgKode(new Float32Array(HANDLING_LENGDE - 1), new Uint8Array(HANDLING_LENGDE), 0, lagRng(1)),
    /logits/,
    "ulike lengder på logits og maske ble stille godtatt",
  );
});
