import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import {
  angreSkritt,
  ANGRE_ANDEL,
  dommenOverBarnet,
  Innovasjonsbok,
  klonGenom,
  muter,
  muterRettet,
  nyttGenom,
  STANDARD_RATER,
  type Genom,
} from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { utId } from "../src/neat/genom.ts";
import { ANTALL_INN, ANTALL_UT, FORSVARSSENSORER, UT_KORT } from "../src/neat/trekk.ts";

/**
 * METNING ER HOVEDPROBLEMET i denne kodebasen, og disse testene låser fiksen.
 *
 * Målt årsakskjede: pre-aktiveringen er en RÅ sum uten deling på fan-in, og
 * både E|w| (additiv tilfeldig gange i muterVekter), fan-in (nyKobling legger
 * til mer enn beskjær fjerner) og |kilde| vokser over generasjoner. Summen
 * havner rundt 7, tanh gir 0,999998, og den deriverte 1−ut² blir ~4e−6.
 * kalibrerUtgang ganger HELE oppdateringen med den deriverte, så all læring
 * multipliseres med omtrent null. Nettet ser levende ut mens det står stille.
 *
 * normaliserVekter holder hver nodes innkommende vektvektor på fast lengde,
 * slik at mutasjon og læring endrer RETNING og aldri SKALA – relativt i
 * stedet for additivt.
 */

function mutertGjennomGenerasjoner(generasjoner: number, normaliser: number): Genom {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const rng = lagRng(4242);
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  const rater = { ...STANDARD_RATER, normaliser };
  for (let i = 0; i < generasjoner; i++) muter(g, bok, rng, rater);
  return g;
}

/** Snitt tanh-derivert over kortutgangene for et fast, syntetisk innsignal. */
function snittDerivert(g: Genom): number {
  const nett = new Nettverk(g);
  const rng = lagRng(99);
  let sum = 0;
  let n = 0;
  for (let p = 0; p < 20; p++) {
    const inn = Array.from({ length: ANTALL_INN }, () => (rng() < 0.15 ? 1 : 0));
    const ut = nett.aktiver(inn);
    for (let i = 0; i < 52; i++) {
      const v = ut[UT_KORT + i]!;
      sum += 1 - v * v;
      n++;
    }
  }
  return sum / n;
}

test("normalisering holder nettet lærbart gjennom mange generasjoner", () => {
  // 400 generasjoner med full mutasjonsrate. Uten normalisering vokser
  // pre-aktiveringen ut av tanh sitt responsive område; med den skal
  // gradienten fortsatt være til stede.
  const d = snittDerivert(mutertGjennomGenerasjoner(400, 1.5));
  assert.ok(
    d > 0.15,
    `snitt tanh-derivert falt til ${d.toFixed(5)} etter 400 generasjoner – nettet kan ikke lære`,
  );
});

test("uten normalisering metter nettet – kontrollen som viser at fiksen virker", () => {
  // Denne testen dokumenterer PROBLEMET.
  //
  // VIKTIG FORBEHOLD: det syntetiske innsignalet under UNDERVURDERER
  // metningen kraftig. Her måles ~0,42 uten normalisering; i ekte
  // spillstillinger er de samme deriverte målt til 0,001–0,18 (nett.ts:225).
  // Grunnen er at ekte innganger er korrelerte og tettere, så pre-
  // aktiveringen blir mye større enn med tilfeldig sparsomt signal.
  // Terskelen er derfor satt til det som faktisk MÅLES her (1,74x), ikke til
  // et pent tall – en test som består på feil premiss er verre enn ingen.
  const uten = snittDerivert(mutertGjennomGenerasjoner(400, 0));
  const med = snittDerivert(mutertGjennomGenerasjoner(400, 1.5));
  assert.ok(
    med > uten * 1.3,
    `normalisering ga ${med.toFixed(5)} mot ${uten.toFixed(5)} uten – forskjellen er borte`,
  );
});

test("normalisering endrer RETNING, ikke skala: lengden er lik for alle noder", () => {
  const g = mutertGjennomGenerasjoner(50, 1.5);
  const perNode = new Map<number, number>();
  for (const k of g.koblinger) {
    if (!k.aktiv) continue;
    perNode.set(k.ut, (perNode.get(k.ut) ?? 0) + k.vekt * k.vekt);
  }
  for (const [node, kvadratsum] of perNode) {
    assert.ok(
      Math.abs(Math.sqrt(kvadratsum) - 1.5) < 1e-6,
      `node ${node} har vektlengde ${Math.sqrt(kvadratsum).toFixed(4)}, ikke 1,5`,
    );
  }
});

test("forsvarssensorer: NEAT kobler seg aldri til bud-/trumfvalgsensorer", () => {
  // Arvind: «ta vekk alle sensorene som den ikke trenger for å felle budet og
  // ta stikk selv». Restriksjonen må gjelde over MANGE mutasjoner, ikke bare
  // ved oppstart – ellers siver de irrelevante inn igjen over generasjoner.
  const tillatte = new Set(FORSVARSSENSORER);
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const rng = lagRng(777);
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  // Start rent: fjern koblinger fra sensorer som ikke er lov.
  g.koblinger = g.koblinger.filter((k) => k.inn >= ANTALL_INN || tillatte.has(k.inn));
  const rater = { ...STANDARD_RATER, tillatteKilder: tillatte };
  for (let i = 0; i < 300; i++) muter(g, bok, rng, rater);

  const ulovlige = g.koblinger.filter((k) => k.inn < ANTALL_INN && !tillatte.has(k.inn));
  assert.equal(
    ulovlige.length,
    0,
    `${ulovlige.length} koblinger fra forbudte sensorer etter 300 generasjoner: ${ulovlige.slice(0, 5).map((k) => k.inn).join(", ")}`,
  );
  assert.ok(g.koblinger.length > 10, "genomet vokste ikke – restriksjonen blokkerte alt");
});

// ---------------------------------------------------------------------------
// Bevist mutering (D7)
// ---------------------------------------------------------------------------

test("bevist mutering: bedre barn vokser skrittet, verre barn krymper og snur", () => {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const rng = lagRng(31337);
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  const rater = { ...STANDARD_RATER };

  muterRettet(g, rng, rater);
  const steg0 = g.steg!;
  const retning0 = new Map(g.retning!);

  // Foerste dom setter bare referansen.
  dommenOverBarnet(g, 1.0);
  // Bedre enn forelderen -> skrittet skal VOKSE, retningen staa.
  dommenOverBarnet(g, 2.0);
  assert.ok(g.steg! > steg0, `skrittet vokste ikke: ${steg0} -> ${g.steg}`);
  for (const [i, d] of g.retning!) {
    assert.equal(d, retning0.get(i), "retningen ble endret selv om barnet var bedre");
  }

  const steg1 = g.steg!;
  // Verre enn forrige -> skrittet skal KRYMPE og retningen SNUS.
  //
  // Minnet snus OG skaleres med (1 - ANGRE_ANDEL). Grunnen er at halve
  // skrittet naa trekkes tilbake med det samme av angreSkritt; lot vi minnet
  // staa paa full styrke ville momentum dratt oss forbi forelderen paa
  // neste skritt i stedet for tilbake TIL den.
  dommenOverBarnet(g, 0.5);
  assert.ok(g.steg! < steg1, `skrittet krympet ikke: ${steg1} -> ${g.steg}`);
  for (const [i, d] of g.retning!) {
    const forventet = -retning0.get(i)! * (1 - ANGRE_ANDEL);
    assert.ok(
      Math.abs(d - forventet) < 1e-9,
      `retningen ble ikke snudd og skalert: ${d} mot forventet ${forventet}`,
    );
  }
});

test("retningshukommelsen overlever kloning – ellers er avlen minnelos", () => {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const rng = lagRng(555);
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  muterRettet(g, rng, STANDARD_RATER);
  g.steg = 0.123;
  const k = klonGenom(g);
  assert.equal(k.steg, 0.123);
  assert.ok(k.retning !== undefined && k.retning.size === g.retning!.size);
  // Kopi, ikke delt referanse: soesken maa ikke skrive over hverandre.
  k.retning!.set(0, 999);
  assert.notEqual(g.retning!.get(0), 999);
});

test("momentum: gjentatt mutering uten dom drar samme vei, ikke frem og tilbake", () => {
  // Med MOMENTUM > 0 skal summen av to paafoelgende skritt vaere STOERRE enn
  // to uavhengige tilfeldige skritt ville gitt i snitt – det er hele poenget
  // med aa fortsette der forrige skritt slapp.
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const rng = lagRng(808);
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  muterRettet(g, rng, STANDARD_RATER);
  const foerste = new Map(g.retning!);
  muterRettet(g, rng, STANDARD_RATER);
  let samme = 0;
  let n = 0;
  for (const [i, d] of g.retning!) {
    const f = foerste.get(i);
    if (f === undefined || f === 0) continue;
    n++;
    if (Math.sign(d) === Math.sign(f)) samme++;
  }
  assert.ok(n > 20, "for faa koblinger til aa maale");
  assert.ok(samme / n > 0.55, `bare ${((100 * samme) / n).toFixed(0)} % av skrittene gikk samme vei`);
});

test("kalibrering kan ikke mette nettet – tusenvis av steg endrer aldri skalaen", () => {
  // Arvind: «jeg trodde vi hadde gjort det relativt slik at den ikke kunne
  // mette seg lenger.» Normaliseringen i muter() dekket bare MUTASJON.
  // Laeringen gikk fri – og for linjer med fasit-trening er det laeringen som
  // dominerer: D5/D6 kaller kalibrerUtgang tusenvis av ganger per generasjon
  // mot én mutasjonsrunde. Det er den veien D6s mester ble ulaerbar.
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const rng = lagRng(1234);
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, rng);
  const nett = new Nettverk(g);

  const lengde = (): number => {
    let sum = 0;
    for (const k of g.koblinger) if (k.aktiv && k.ut === utId(ANTALL_INN, UT_KORT)) sum += k.vekt * k.vekt;
    return Math.sqrt(sum);
  };

  const inn = Array.from({ length: ANTALL_INN }, () => (rng() < 0.15 ? 1 : 0));
  nett.aktiver(inn);
  const foer = lengde();
  // Hardt, ensrettet press mot samme utgang – nettopp det som blaaser opp
  // vektene i en fasit-linje.
  for (let i = 0; i < 3000; i++) {
    nett.aktiver(inn);
    nett.kalibrerUtgang(UT_KORT, 0.95, 0.2);
  }
  const etter = lengde();
  assert.ok(
    Math.abs(etter - foer) < 1e-6,
    `vektlengden vokste fra ${foer.toFixed(4)} til ${etter.toFixed(4)} etter 3000 kalibreringssteg`,
  );

  // Og nettet skal fortsatt vaere responsivt etterpaa.
  const u = nett.aktiver(inn);
  const d = 1 - u[UT_KORT]! * u[UT_KORT]!;
  assert.ok(d > 0.05, `utgangen mettet likevel: tanh-derivert ${d.toFixed(5)}`);
});

// --- Per-gen angring -------------------------------------------------------
// Foer denne mekanismen ble et daarlig skritt staaende i genomet; bare
// retningsminnet ble snudd, saa skaden ble foerst delvis trukket tilbake ved
// NESTE mutasjon, blandet med ny stoey. Testene under laaser at skrittet nå
// angres med det samme, kobling for kobling.
test("angreSkritt foerer vekten tilbake langs forrige skritt", () => {
  const bok = new Innovasjonsbok();
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(7));
  const foer = g.koblinger.map((k) => k.vekt);
  muterRettet(g, lagRng(7), { ...STANDARD_RATER, bevist: true });
  const etter = g.koblinger.map((k) => k.vekt);
  assert.ok(etter.some((v, i) => v !== foer[i]), "mutasjonen endret ingenting");

  angreSkritt(g, 1);
  for (let i = 0; i < g.koblinger.length; i++) {
    if (!g.koblinger[i]!.aktiv) continue;
    assert.ok(
      Math.abs(g.koblinger[i]!.vekt - foer[i]!) < 1e-9,
      `kobling ${i}: ${g.koblinger[i]!.vekt} skulle vaert tilbake paa ${foer[i]}`,
    );
  }
});

test("halv angring gaar halvveis tilbake", () => {
  const g = nyttGenom(ANTALL_INN, ANTALL_UT, new Innovasjonsbok(), lagRng(11));
  const foer = g.koblinger.map((k) => k.vekt);
  muterRettet(g, lagRng(11), { ...STANDARD_RATER, bevist: true });
  const etter = g.koblinger.map((k) => k.vekt);
  angreSkritt(g, 0.5);
  for (let i = 0; i < g.koblinger.length; i++) {
    if (!g.koblinger[i]!.aktiv) continue;
    const forventet = (foer[i]! + etter[i]!) / 2;
    assert.ok(Math.abs(g.koblinger[i]!.vekt - forventet) < 1e-9, `kobling ${i}`);
  }
});

test("dommenOverBarnet angrer et daarlig skritt, men ikke et godt", () => {
  const lag = (): Genom => {
    const g = nyttGenom(ANTALL_INN, ANTALL_UT, new Innovasjonsbok(), lagRng(3));
    muterRettet(g, lagRng(3), { ...STANDARD_RATER, bevist: true });
    g.foreldreFitness = 10;
    return g;
  };
  const daarlig = lag();
  const godt = lag();
  const utgangspunkt = daarlig.koblinger.map((k) => k.vekt);

  dommenOverBarnet(daarlig, 5); // verre enn forelderens 10
  dommenOverBarnet(godt, 15); // bedre

  assert.ok(
    daarlig.koblinger.some((k, i) => Math.abs(k.vekt - utgangspunkt[i]!) > 1e-9),
    "et daarlig skritt skal trekkes tilbake",
  );
  assert.ok(
    godt.koblinger.every((k, i) => Math.abs(k.vekt - utgangspunkt[i]!) < 1e-9),
    "et godt skritt skal staa uroert",
  );
});
