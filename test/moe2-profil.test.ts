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
