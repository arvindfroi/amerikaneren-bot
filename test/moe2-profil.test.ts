/**
 * MOTSTANDERPROFILEN må aldri påstå mer enn den har sett.
 *
 * Feilen som ville gjort mest skade her er ikke at et anslag blir litt galt –
 * det er at profilen blir SKARP for tidlig. En bot som etter to runder er
 * overbevist om at motstanderen overbyr, og som byr deretter, taper mer enn en
 * bot uten profil i det hele tatt. Krympingen er hele vernet, og disse testene
 * vokter den.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  BEFOLKNING,
  evForsvarMot,
  krymp,
  legg,
  oppdater,
  tiltro,
  TOMT,
  tomProfil,
  type Profil,
} from "../src/moe2/profil.ts";

test("uten observasjoner er anslaget nøyaktig befolkningssnittet", () => {
  assert.equal(krymp(TOMT, 0.82), 0.82);
  assert.equal(tiltro(TOMT), 0);
  const p = tomProfil("x");
  // Ingen felt skal bære noe før noe er sett.
  for (const a of [p.bud, p.bydde, p.klarte, p.margin, p.poeng, p.trumfutspill, p.anger]) {
    assert.equal(a.n, 0);
    assert.equal(a.sum, 0);
  }
});

test("anslaget beveger seg MOT individet, aldri forbi det", () => {
  let a = TOMT;
  const bef = 0.82;
  let forrige = krymp(a, bef);
  for (let i = 0; i < 200; i++) {
    a = legg(a, 0.0); // en spiller som ALDRI klarer kontrakten
    const na = krymp(a, bef);
    assert.ok(na <= forrige + 1e-12, `anslaget gikk oppover ved ${i}`);
    assert.ok(na >= 0, "anslaget passerte individet");
    forrige = na;
  }
  // Etter 200 observasjoner skal vi være nær individet, men ikke i mål.
  assert.ok(forrige < 0.06, `for tregt: ${forrige}`);
  assert.ok(forrige > 0, "kollapset helt til individet");
});

test("tiltroen vokser monotont og når aldri 1", () => {
  let a = TOMT;
  let forrige = 0;
  for (let i = 1; i <= 500; i++) {
    a = legg(a, 1);
    const t = tiltro(a);
    assert.ok(t > forrige, `tiltroen falt ved ${i}`);
    assert.ok(t < 1, "tiltroen nådde 1");
    forrige = t;
  }
});

test("EN runde flytter anslaget lite – det er hele poenget", () => {
  let p = tomProfil("x");
  p = oppdater(p, { id: "x", bud: 9, varBudvinner: true, klarte: false, lagStikk: 6, poeng: -18 });
  const etterEn = krymp(p.klarte, BEFOLKNING.klarte);
  // Fra 0,82 skal ett bomskudd flytte oss under ett prosentpoeng per runde.
  assert.ok(etterEn > 0.74, `for stort hopp: ${etterEn}`);
  assert.ok(etterEn < BEFOLKNING.klarte, "flyttet ikke i det hele tatt");
});

test("pass telles som «bydde ikke», og forurenser ikke budsnittet", () => {
  let p = tomProfil("x");
  p = oppdater(p, { id: "x", bud: null, varBudvinner: false, poeng: 1 });
  p = oppdater(p, { id: "x", bud: 9, varBudvinner: true, klarte: true, lagStikk: 10, poeng: 18 });
  assert.equal(p.bydde.n, 2);
  assert.equal(p.bydde.sum, 1);
  // Budsnittet skal bare ha sett DET ene budet, ikke et null.
  assert.equal(p.bud.n, 1);
  assert.equal(p.bud.sum, 9);
});

test("forsvarsverdien er HØYERE mot en som ryker ofte", () => {
  const mange = (p: Profil, treff: number, n: number): Profil => {
    let ut = p;
    for (let i = 0; i < n; i++) {
      ut = oppdater(ut, {
        id: p.id,
        bud: 9,
        varBudvinner: true,
        klarte: i < treff,
        lagStikk: 9,
        poeng: 0,
      });
    }
    return ut;
  };
  // Tallene er de målte ytterpunktene: 92 % mot 62 %.
  const trygg = mange(tomProfil("trygg"), 92, 100);
  const vaklende = mange(tomProfil("vaklende"), 62, 100);
  const a = evForsvarMot(trygg, 9);
  const b = evForsvarMot(vaklende, 9);
  assert.ok(b > a, `forsvar mot den vaklende skal lønne seg mer (${b} vs ${a})`);
  // Og forskjellen skal være stor nok til å endre en beslutning, ikke bare
  // eksistere: mot 62 % skal forsvaret være verdt merkbart mer.
  assert.ok(b - a > 1.0, `for liten forskjell: ${b - a}`);
});

test("en ukjent spiller får nøyaktig befolkningens forsvarsverdi", () => {
  const p = tomProfil("ny");
  const ventet = ((1 - BEFOLKNING.klarte) * 2 * 9) / 3;
  assert.ok(Math.abs(evForsvarMot(p, 9) - ventet) < 1e-9);
});

test("profilen bærer ingen navn", () => {
  // Repoet er offentlig. Nøkkelen skal være ugjennomsiktig, og modulen skal
  // ikke ha noe sted å lagre et navn selv om noen skulle sende ett inn.
  const p = tomProfil("a1b2c3");
  assert.equal(Object.keys(p).filter((k) => k === "navn").length, 0);
  assert.equal(p.id, "a1b2c3");
});

/**
 * DE AVDEKTE KORTENE. Ved rundeslutt har alle lagt tolv kort, og hånden hver
 * spiller HADDE står i stikkhistorikken. Det er ikke lekkasje – det er slik en
 * medspiller bygger en lesning også – men det må skilles skarpt fra hva som er
 * kjent UNDER runden, der et oppslag i fasiten ville vært juks.
 */
/**
 * HVOR MANGE RUNDER KOSTER EN OVERBEVISNING? Testen dokumenterer farten, ikke
 * bare retningen.
 *
 * John byr 10 med 4 trumf og 1 honnoer. Sant overbud er +1,85. Med k=12:
 *
 *   etter 10 runder   0,45 x 1,85 = 0,84   – merkbart, men ikke nok til aa
 *                                            snu en beslutning
 *   etter 30 runder   0,71 x 1,85 = 1,32   – naa vet boten det
 *
 * Foerste utkast av denne testen krevde over 1,0 etter ti runder og feilet.
 * Den hadde rett: krympingen ER saa treg, og det er meningen. Tallet under er
 * derfor maalt, ikke oensket.
 */
test("«bød 10 med bare 4 trumf» gir positivt overbud", () => {
  let p = tomProfil("john");
  for (let i = 0; i < 30; i++) {
    p = oppdater(p, {
      id: "john",
      bud: 10,
      varBudvinner: true,
      klarte: false,
      lagStikk: 8,
      poeng: -20,
      trumflengde: 4,
      honnorer: 1,
    });
  }
  const ob = krymp(p.overbud, BEFOLKNING.overbud);
  assert.ok(ob > 1.25, `etter 30 runder skal overbudet vaere tydelig, var ${ob.toFixed(2)}`);
  assert.ok(ob < 1.85, "og fortsatt ikke helt framme ved individet");
  // Og trumflengden skal vise det den faktisk saa.
  assert.equal(krymp(p.trumflengdeVedBud, BEFOLKNING.trumflengdeVedBud, 0), 4);
});

test("en som byr etter kortene sine har overbud rundt null", () => {
  let p = tomProfil("nokternt");
  for (let i = 0; i < 20; i++) {
    // 5 trumf og 2 honnoerer -> budFraHand = 5,5 + 2,75 + 0,9 = 9,15
    p = oppdater(p, {
      id: "nokternt",
      bud: 9,
      varBudvinner: true,
      klarte: true,
      lagStikk: 10,
      poeng: 18,
      trumflengde: 5,
      honnorer: 2,
    });
  }
  assert.ok(Math.abs(krymp(p.overbud, BEFOLKNING.overbud)) < 0.35);
});

test("FLAKS skilles fra ferdighet: klarte noe dobbeltdummy sier var uklarbart", () => {
  let heldig = tomProfil("heldig");
  let dyktig = tomProfil("dyktig");
  for (let i = 0; i < 10; i++) {
    // Klarte 9, men perfekt spill ville gitt bare 8 -> hun var heldig.
    heldig = oppdater(heldig, {
      id: "heldig", bud: 9, varBudvinner: true, klarte: true,
      lagStikk: 9, poeng: 18, ddLagStikk: 8,
    });
    // Klarte 9, og perfekt spill ga 10 -> ingen flaks involvert.
    dyktig = oppdater(dyktig, {
      id: "dyktig", bud: 9, varBudvinner: true, klarte: true,
      lagStikk: 9, poeng: 18, ddLagStikk: 10,
    });
  }
  // BEGGE har klart 10 av 10. Uten flaksleddet ville de sett like ut.
  assert.equal(krymp(heldig.klarte, BEFOLKNING.klarte), krymp(dyktig.klarte, BEFOLKNING.klarte));
  assert.ok(krymp(heldig.flaks, BEFOLKNING.flaks) > 0.3, "den heldige skal skille seg ut");
  assert.ok(Math.abs(krymp(dyktig.flaks, BEFOLKNING.flaks)) < 1e-9, "den dyktige skal ligge paa null");
});

test("en runde uten avdekte kort mister ikke de andre feltene", () => {
  let p = tomProfil("x");
  p = oppdater(p, { id: "x", bud: 9, varBudvinner: true, klarte: true, lagStikk: 10, poeng: 18 });
  assert.equal(p.klarte.n, 1, "klarte skal telles selv uten kortinfo");
  assert.equal(p.overbud.n, 0, "overbud kan ikke regnes uten haanden");
  assert.equal(p.flaks.n, 0, "flaks kan ikke regnes uten DD-fasit");
});
