/**
 * LIGAEN OG PORTEN.
 *
 * To ting prøves her, og begge er krav og ikke pynt:
 *
 * 1. **Vanene er FAKTISK ulike.** `docs/mlb.md` §6: «K6 trener på
 *    testmotstanderen … vanene må deles i DISJUNKTE trenings- og testsett.»
 *    Å skrive to lister er lett. Å vise at de VELGER ULIKT er målingen §118
 *    manglet: `maks-uten-minne` sto igjen med feil flagg og ble bit-identisk
 *    med `maks-m2` — 0 av 440 valg ulike — og «målingen» mellom dem målte
 *    ingenting. Her telles avstanden på ekte stillinger.
 *
 * 2. **Porten kan si NEI, og den kan si VET IKKE.** En port som bare kan si
 *    ja er en gummistempel. Prøvene under mater den med ren støy (må avvises),
 *    med en ekte effekt (må godkjennes), med bånd som er uenige (må avvises)
 *    og med en ødelagt kontrollarm (må bli UGYLDIG, ikke NEI).
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortgiving, lagRegler } from "../src/regler.ts";
import { maske, nesteDelsteg, ta, TOMT_DELVALG, type Delvalg, type Giving } from "../src/mlb/handling.ts";
import {
  atferdsavstand,
  epokeDeltaker,
  lagVane,
  Liga,
  portDom,
  TRENINGSVEKTER,
  ulikeSpek,
  vaneDeltaker,
  VANER_TEST,
  VANER_TRENING,
  ytreDeltaker,
  type Parrad,
} from "../src/mlb/liga.ts";
import {
  spillKamp,
  tilfeldigNett,
  type Beslutningspunkt,
  type Sete,
} from "../src/mlb/selvspill.ts";

const R = lagRegler({ antallSpillere: 4, målPoeng: 30 });
const G = kortgiving(R);
const GK: Giving = { antallStikk: G.antallStikk, talong: G.talong };

/**
 * SAMLE EKTE BESLUTNINGSPUNKTER.
 *
 * Stillingene spilles fram av vanene selv, så utvalget er det ligaen faktisk
 * ser. En syntetisk stilling ville målt vanene på et sted de aldri kommer.
 */
function samlePunkter(giver: number, maks: number): Beslutningspunkt[] {
  const ut: Beslutningspunkt[] = [];
  const fører = lagVane(VANER_TRENING[0]!.spek);
  for (let g = 0; g < giver && ut.length < maks; g++) {
    let s: GameState = opprettSpill(R, 8_200_000 + g * 5171);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 800 && ut.length < maks && s.rundeNr < 12) {
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null) break;
      let delvalg: Delvalg = TOMT_DELVALG;
      let handling: unknown = null;
      let indre = 0;
      while (handling === null && indre++ < 30) {
        const visning = spillerVisning(s, sete);
        const delsteg = nesteDelsteg(visning, delvalg)!;
        const m = maske(visning, GK, delvalg);
        const punkt: Beslutningspunkt = {
          visning,
          sete,
          delsteg,
          delvalg,
          maske: m,
          trekk: null,
          framover: null,
        };
        ut.push(punkt);
        const steg = ta(visning, GK, delvalg, fører(punkt));
        if (steg.ferdig) handling = { ...steg.handling, spiller: sete };
        else delvalg = steg.delvalg;
      }
      s = utfør(s, handling as never).state;
    }
  }
  return ut;
}

// ===========================================================================
// Vanene
// ===========================================================================

test("vanene: hver treningsvane skiller seg fra hver testvane i SPEKEN", () => {
  for (const a of VANER_TRENING) {
    for (const b of VANER_TEST) {
      assert.ok(
        ulikeSpek(a.spek, b.spek) >= 2,
        `${a.navn} og ${b.navn} skiller seg bare på ${ulikeSpek(a.spek, b.spek)} akse — ` +
          `da er «disjunkte sett» en påstand om navn, ikke om atferd`,
      );
    }
  }
  const navn = new Set([...VANER_TRENING, ...VANER_TEST].map((v) => v.navn));
  assert.equal(navn.size, VANER_TRENING.length + VANER_TEST.length, "to vaner deler navn");
});

test("vanene: trenings- og testsettet VELGER ULIKT på ekte stillinger — målt", () => {
  const punkter = samlePunkter(6, 1500);
  assert.ok(punkter.length > 800, `bare ${punkter.length} stillinger — prøven er for liten`);

  const rapport: string[] = [];
  let verste = 1;
  for (const a of VANER_TRENING) {
    for (const b of VANER_TEST) {
      const { ulike, av } = atferdsavstand(a.spek, b.spek, punkter);
      const andel = ulike / Math.max(av, 1);
      rapport.push(`${a.navn} mot ${b.navn}: ${(andel * 100).toFixed(1)} % (${ulike}/${av})`);
      verste = Math.min(verste, andel);
    }
  }
  /**
   * BAREN ER 25 %, ikke «over null». Målt er det NÆRMESTE paret 51,9 % ulike,
   * så terskelen har god margin — og en fremtidig endring som gjør to vaner
   * like igjen blir tatt lenge før de er identiske.
   */
  assert.ok(
    verste >= 0.25,
    `det NÆRMESTE paret skiller seg bare i ${(verste * 100).toFixed(1)} % av valgene.\n` +
      `Da måler K6 gjenkjenning i vektene og ikke læring i løpet.\n` +
      rapport.join("\n"),
  );
});

test("vanene: KONTROLLARMEN — en vane mot seg selv skal gi NULL avstand", () => {
  /**
   * Uten denne kunne `atferdsavstand` returnert et positivt tall uansett — for
   * eksempel om vanene var ikke-deterministiske — og prøven over ville vært
   * grønn på en måling som ikke måler noe.
   */
  const punkter = samlePunkter(3, 600);
  for (const v of [...VANER_TRENING, ...VANER_TEST]) {
    const { ulike, av } = atferdsavstand(v.spek, v.spek, punkter);
    assert.ok(av > 100, `bare ${av} sammenlikninger for ${v.navn}`);
    assert.equal(ulike, 0, `${v.navn} valgte ulikt fra seg selv — vanen er ikke deterministisk`);
  }
});

test("vanene: spiller ALDRI ulovlig — masken er den samme skranken som for nettet", () => {
  for (let k = 0; k < 6; k++) {
    const frø = 9_100_000 + k * 3313;
    const seter: Sete[] = [...VANER_TRENING, ...VANER_TEST]
      .slice(k % 4, (k % 4) + 4)
      .map((v) => ({ navn: v.navn, nett: null, temperatur: 0, egen: lagVane(v.spek), samle: false }));
    // Fire vaner ved bordet er det verste tilfellet: ingen av dem gir etter.
    const e = spillKamp({ frø, seter, målPoeng: 30, samleTrekk: false, maksRunder: 60 });
    assert.ok(e.logg.koder.length > 20, "kampen ga nesten ingen beslutninger");
    assert.ok(e.fasit.sluttpoeng.length === 4);
  }
});

// ===========================================================================
// Befolkningen
// ===========================================================================

test("ligaen: `ytre` har vekt 0 i trening — AVGJØRELSE 1b, som en målbar egenskap", () => {
  assert.equal(TRENINGSVEKTER.ytre, 0);
  const liga = new Liga(VANER_TRENING);
  liga.settFørste(epokeDeltaker("epoke0", tilfeldigNett(lagRng(1)), "beste"));
  liga.leggTilYtre(ytreDeltaker("rask", () => 0));
  const rng = lagRng(99);
  const teller = new Map<string, number>();
  for (let i = 0; i < 4000; i++) {
    const d = liga.trekkMotstander(rng);
    teller.set(d.slag, (teller.get(d.slag) ?? 0) + 1);
  }
  assert.equal(
    teller.get("ytre") ?? 0,
    0,
    `en ytre motstander ble trukket i TRENING. \`rask\` bærer d7alle og vrakrang, og da er ` +
      `«orakelet er ikke i gradienten» ikke lenger noe vi kan forsvare.`,
  );
  const beste = teller.get("beste") ?? 0;
  const vaner = teller.get("vane") ?? 0;
  assert.ok(beste > 1800 && beste < 2900, `beste-andelen er ${beste}/4000, ventet ~57 %`);
  assert.ok(vaner > 900, `bare ${vaner}/4000 vaner — uten vaner finnes ingenting å utnytte (K6)`);
});

test("ligaen: en ny epoke slipper inn BARE på «godkjent»", () => {
  const liga = new Liga(VANER_TRENING);
  const e0 = epokeDeltaker("epoke0", tilfeldigNett(lagRng(1)), "beste");
  liga.settFørste(e0);
  const e1 = epokeDeltaker("epoke1", tilfeldigNett(lagRng(2)));

  const avvist = portDom(
    Array.from({ length: 400 }, (_, i) => ({ bånd: i % 2, giv: i, kandidat: 0, forrige: 0 })),
    Array.from({ length: 400 }, (_, i) => ({ bånd: i % 2, giv: i, kandidat: 0, forrige: 0 })),
  );
  assert.equal(avvist.dom, "avvist");
  assert.equal(liga.adopter(e1, avvist), false);
  assert.equal(liga.beste().navn, "epoke0");
  assert.equal(liga.tidligere().length, 0);
});

test("ligaen: epoke 0 blir liggende som anker når vinduet renner over", () => {
  const liga = new Liga(VANER_TRENING);
  liga.settFørste(epokeDeltaker("epoke0", tilfeldigNett(lagRng(1)), "beste"));
  const rng = lagRng(5);
  for (let e = 1; e <= 15; e++) {
    const rader: Parrad[] = Array.from({ length: 400 }, (_, i) => ({
      bånd: i % 2,
      giv: i,
      kandidat: 1 + rng() * 0.2,
      forrige: 0,
    }));
    const kontroll: Parrad[] = Array.from({ length: 400 }, (_, i) => ({
      bånd: i % 2,
      giv: i,
      kandidat: 0,
      forrige: 0,
    }));
    const dom = portDom(rader, kontroll);
    assert.equal(dom.dom, "godkjent", dom.begrunnelse);
    assert.equal(liga.adopter(epokeDeltaker(`epoke${e}`, tilfeldigNett(lagRng(e))), dom), true);
  }
  assert.equal(liga.beste().navn, "epoke15");
  const navn = liga.tidligere().map((d) => d.navn);
  assert.ok(navn.includes("epoke0"), `ankeret falt ut av vinduet: ${navn.join(", ")}`);
  assert.ok(navn.length <= 8, `vinduet holder ${navn.length} epoker`);
});

// ===========================================================================
// Porten
// ===========================================================================

const støy = (n: number, rng: () => number, forskyv = 0): Parrad[] =>
  Array.from({ length: n }, (_, i) => ({
    bånd: i % 2,
    giv: i,
    kandidat: (rng() - 0.5) * 20 + forskyv,
    forrige: 0,
  }));

test("porten: REN STØY skal avvises — det er hele grunnen til at den finnes", () => {
  let godkjent = 0;
  for (let f = 0; f < 40; f++) {
    const rng = lagRng(1000 + f);
    const dom = portDom(støy(400, rng), støy(400, lagRng(9000 + f)));
    if (dom.dom === "godkjent") godkjent++;
  }
  assert.ok(
    godkjent <= 2,
    `porten godkjente ${godkjent}/40 rene støyarmer. Med 30 epoker ville den sluppet inn ` +
      `${((godkjent / 40) * 30).toFixed(1)} versjoner som ikke er bedre — det er ligakollaps.`,
  );
});

test("porten: en EKTE effekt slipper gjennom, ellers står vi bom fast", () => {
  const rng = lagRng(4242);
  const dom = portDom(støy(600, rng, 3), støy(600, lagRng(77)));
  assert.equal(dom.dom, "godkjent", dom.begrunnelse);
  assert.ok(dom.z > 2, `z = ${dom.z}`);
  assert.ok(dom.tegnZ > 1.5, `tegn-z = ${dom.tegnZ}`);
});

test("porten: UENIGE BÅND avvises selv når snittet er stort — §65 og §109", () => {
  const rng = lagRng(31337);
  const rader: Parrad[] = Array.from({ length: 600 }, (_, i) => ({
    bånd: i % 2,
    giv: i,
    // Bånd 0 er sterkt positivt, bånd 1 er svakt negativt. Snittet er positivt.
    kandidat: (i % 2 === 0 ? 8 : -1) + (rng() - 0.5) * 4,
    forrige: 0,
  }));
  const dom = portDom(rader, støy(600, lagRng(5)));
  assert.equal(dom.dom, "avvist");
  assert.match(dom.begrunnelse, /uenige/);
});

test("porten: en ØDELAGT kontrollarm gir UGYLDIG, ikke NEI", () => {
  /**
   * `port.ts`: «En konklusjon som ikke kan bli 'vet ikke' er ikke en
   * konklusjon.» En rigg der forrige mot forrige ikke gir null måler noe annet
   * enn den tror, og da er både ja og nei feil svar.
   */
  const rng = lagRng(606);
  const skjevKontroll: Parrad[] = Array.from({ length: 400 }, (_, i) => ({
    bånd: i % 2,
    giv: i,
    kandidat: 2 + (rng() - 0.5) * 2,
    forrige: 0,
  }));
  const dom = portDom(støy(400, lagRng(11), 3), skjevKontroll);
  assert.equal(dom.dom, "ugyldig");
  assert.match(dom.begrunnelse, /kontrollarmen bommer/);

  const utenKontroll = portDom(støy(400, lagRng(11), 3), null);
  assert.equal(utenKontroll.dom, "ugyldig");
});

test("porten: for få giv er ikke et JA uansett hvor stor effekten er", () => {
  const dom = portDom(
    Array.from({ length: 20 }, (_, i) => ({ bånd: i % 2, giv: i, kandidat: 50, forrige: 0 })),
    Array.from({ length: 20 }, (_, i) => ({ bånd: i % 2, giv: i, kandidat: 0, forrige: 0 })),
  );
  assert.equal(dom.dom, "avvist");
  assert.match(dom.begrunnelse, /parrede giv/);
});

test("vaneDeltaker: et sete fra en vane har ALDRI et nett, og samler ingen rader", () => {
  const s = vaneDeltaker(VANER_TEST[0]!).lagSete(0.9);
  assert.equal(s.nett, null);
  assert.equal(s.samle, false);
  assert.equal(s.temperatur, 0, "en vane er deterministisk — temperatur skal ikke smitte inn");
});
