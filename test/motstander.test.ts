/**
 * MOTSTANDERMODELLEN: krympingen må virke, og asymmetrien må være der.
 *
 * Tre påstander, og alle tre svikter stille om de brytes — de gir bare en
 * dårligere prior, ikke en feilmelding:
 *
 *   1. KRYMPING. Uten observasjoner MÅ estimatet være befolkningens. Med mange
 *      må det nærme seg individets. Bommer den, er modellen enten døv for
 *      individet eller overtroisk etter én runde.
 *   2. ASYMMETRIEN. Målt: å passe og å by 7 ser nesten like ut (1,272 mot
 *      1,180 honnører). En sterk hånd hos en som bød lavt er derfor IKKE et
 *      sterkt argument mot verdenen. Straffen skal være mild oppover og full
 *      nedover.
 *   3. RANGERINGEN. En hånd som passer budet skal alltid få høyere log-vekt
 *      enn en som ikke gjør det. Det er hele nytten.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Motstandermodell, håndtrekk } from "../src/moe2/motstander.ts";
import type { Kort } from "../src/kort.ts";

const k = (farge: Kort["farge"], verdi: number): Kort => ({ farge, verdi: verdi as Kort["verdi"] });

/**
 * Tolv kort med `lengde` i spar og NØYAKTIG `honnør` ess/konger.
 *
 * HONNØR ER ess og konge, altså verdi >= 13 — bare TO per farge. Første utkast
 * av denne hjelperen la A, K, D, J i spar og trodde det var fire honnører; det
 * er to. Testen feilet på et tall som var riktig, og hjelperen som var gal.
 * Derfor fordeles honnørene over farger her, to og to.
 */
function hånd(lengde: number, honnør: number): Kort[] {
  const farger = ["S", "H", "R", "K"] as const;
  const ut: Kort[] = [];
  let igjen = honnør;
  // Spar først, så den blir den lengste fargen.
  for (let i = 0; i < lengde; i++) {
    if (igjen > 0 && i < 2) {
      ut.push(k("S", i === 0 ? 14 : 13));
      igjen--;
    } else ut.push(k("S", 2 + i));
  }
  let f = 1;
  let lav = 2;
  while (ut.length < 12) {
    const farge = farger[f]!;
    const iFargen = ut.filter((x) => x.farge === farge).length;
    if (igjen > 0 && iFargen < 2) {
      ut.push(k(farge, iFargen === 0 ? 14 : 13));
      igjen--;
    } else {
      ut.push(k(farge, 2 + lav));
      lav++;
    }
    f = f === 3 ? 1 : f + 1;
    if (lav > 9) lav = 2;
  }
  return ut;
}

test("haandtrekk teller lengste farge og honnoerer riktig", () => {
  const h = hånd(5, 2);
  const t = håndtrekk(h);
  assert.equal(t.lengste, 5, "lengste farge");
  assert.equal(t.honnør, 2, "honnoerer");
});

test("KRYMPING: uten data er estimatet befolkningens, med mye data individets", () => {
  const m = new Motstandermodell();
  const tom = m.forventning("A", 9);
  // Befolkningen for bud 9, maalt paa 67 familierunder.
  assert.ok(Math.abs(tom.mHonnør - 2.313) < 1e-6, `uten data skal estimatet vaere befolkningens, fikk ${tom.mHonnør}`);

  // En spiller som ALLTID har fire honnoerer naar hun byr 9.
  for (let i = 0; i < 3; i++) m.registrer("A", 9, hånd(5, 4));
  const litt = m.forventning("A", 9);
  assert.ok(litt.mHonnør > tom.mHonnør, "estimatet skal flytte seg mot individet");
  assert.ok(litt.mHonnør < 3.2, `etter 3 runder skal befolkningen fortsatt dominere, fikk ${litt.mHonnør}`);

  for (let i = 0; i < 100; i++) m.registrer("A", 9, hånd(5, 4));
  const mye = m.forventning("A", 9);
  assert.ok(mye.mHonnør > 3.7, `etter 103 runder skal individet dominere, fikk ${mye.mHonnør}`);

  // Spredningen krympes IKKE - et individuelt variansanslag paa et dusin
  // observasjoner er saa ustabilt at det gjoer vekten verre.
  assert.equal(mye.sdHonnør, tom.sdHonnør, "spredningen skal ikke krympes mot individet");
});

test("RANGERING: en haand som passer budet faar hoeyere vekt enn en som ikke gjoer det", () => {
  const m = new Motstandermodell();
  // Bud 9: maalt 5,00 i lengste farge og 2,31 honnoerer.
  const passer = m.logVekt("A", 9, hånd(5, 2));
  const forSvak = m.logVekt("A", 9, hånd(3, 0));
  assert.ok(passer > forSvak, `haand som passer (${passer.toFixed(3)}) maa slaa for svak (${forSvak.toFixed(3)})`);
});

test("ASYMMETRI: for sterk straffes mildere enn for svak", () => {
  const m = new Motstandermodell();
  // Bud 7: maalt 4,32 i lengste og 1,18 honnoerer.
  const forSterk = m.logVekt("A", 7, hånd(6, 4));
  const forSvak = m.logVekt("A", 7, hånd(3, 0));
  assert.ok(
    forSterk > forSvak,
    `en som boed lavt kan ha vaert forsiktig, saa for sterk (${forSterk.toFixed(3)}) skal straffes ` +
      `mildere enn for svak (${forSvak.toFixed(3)})`,
  );
  // Straffen oppover skal vaere merkbart mild: z klippes til 3, og faktoren er
  // 0,1, saa taket er 2 x 0,1 x 9 = 1,8.
  assert.ok(forSterk > -1.9, `for streng straff oppover: ${forSterk.toFixed(3)}`);
  // Og nedover skal den vaere streng - en svak haand paa et hoeyt bud er ekte
  // usannsynlig.
  const svakPaaNi = m.logVekt("A", 9, hånd(3, 0));
  assert.ok(svakPaaNi < -8, `for mild straff nedover: ${svakPaaNi.toFixed(3)}`);
});

test("modellen holder spillere fra hverandre", () => {
  const m = new Motstandermodell();
  for (let i = 0; i < 50; i++) m.registrer("A", 8, hånd(6, 4));
  assert.equal(m.antall("A", 8), 50);
  assert.equal(m.antall("B", 8), 0, "B skal ikke arve As observasjoner");
  assert.ok(
    m.forventning("A", 8).mHonnør > m.forventning("B", 8).mHonnør,
    "A og B skal ha ulike estimater",
  );
});
