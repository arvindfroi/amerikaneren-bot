/**
 * LEKKASJETESTEN FOR SD-VRAKET.
 *
 * Hele grunnen til at `SDVrak` finnes er at den gamle veien hadde et
 * juksesteg: kandidatlisten ble plukket av en løser som så alle fire hender
 * (`lagVrakstilling`, som sier det selv i sin egen docstring). En spiller som
 * arver det steget er ikke en spiller.
 *
 * DENNE TESTEN ER SPEILVENDT AV DEN FEILEN: bytt om kortene til de tre andre
 * og hele talongen, og la budvinnerens 16 kort stå. Velger SDVrak et ANNET
 * vrak, har den lest noe den ikke får lese. Testen er verdiløs hvis den bare
 * kjøres én gang på én giv, så den går over flere.
 *
 * MERK at dette er den eneste testen som kan fange lekkasjen. Typene fanger
 * den ikke – `state.hender` er lovlig å ROERE, det er ulovlig å BRUKE – og et
 * målt utfall fanger den ikke heller, for en juksende spiller måler BEDRE.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng, nyStokk, stokk, kortId, type Kort } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { SDVrak } from "../src/moe2/sdvrak.ts";

/** Spiller budrunden fram til VRAK med nevro. */
function tilVrak(frø: number): GameState | null {
  const nevro = new NevroAgent();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) s = utfør(s, nevro.velgHandling(s)).state;
  return s.fase === "VRAK" && s.budvinner !== null ? s : null;
}

/** Deler de 36 kortene budvinneren IKKE har på nytt. Egen hånd står. */
function stokkOmAndre(s: GameState, rng: () => number): GameState {
  const bv = s.budvinner!;
  const mine = new Set((s.hender[bv] ?? []).map(kortId));
  const resten = stokk(
    nyStokk().filter((k) => !mine.has(kortId(k))),
    rng,
  );
  const hender: Kort[][] = s.hender.map((h, i) => (i === bv ? h.slice() : []));
  let j = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === bv) continue;
    hender[p] = resten.slice(j, j + (s.hender[p] ?? []).length);
    j += (s.hender[p] ?? []).length;
  }
  return { ...s, hender, talong: resten.slice(j, j + s.talong.length) };
}

const nøkkel = (kort: readonly Kort[]): string =>
  kort
    .map(kortId)
    .sort()
    .join(",");

test("SDVrak velger det SAMME vraket naar de andre hendene stokkes om", () => {
  // Grovsilen og SD-evalueringen sampler begge, saa froeet maa vaere likt i
  // begge kjoeringene. Det er ikke en innroemmelse: en agent er en funksjon av
  // det den ser PLUSS sin egen tilfeldighet, og vi tester det foerste.
  let sjekket = 0;
  for (let frø = 8_800_000; frø < 8_800_006; frø++) {
    const s = tilVrak(frø);
    if (s === null) continue;

    const a = new SDVrak(new NevroAgent(), { silVerdener: 1, topp: 6, verdener: 4, frø: 12345 });
    const b = new SDVrak(new NevroAgent(), { silVerdener: 1, topp: 6, verdener: 4, frø: 12345 });
    const hA = a.velgHandling(s);
    const hB = b.velgHandling(stokkOmAndre(s, lagRng(frø ^ 0xabcdef)));
    assert.equal(hA.type, "VRAK");
    assert.equal(hB.type, "VRAK");
    assert.equal(
      nøkkel((hA as { kort: Kort[] }).kort),
      nøkkel((hB as { kort: Kort[] }).kort),
      `frø ${frø}: vraket endret seg da MOTSTANDERNES kort ble byttet – SDVrak leser skjult informasjon`,
    );
    sjekket++;
  }
  assert.ok(sjekket >= 3, `for faa stillinger sjekket (${sjekket})`);
});

test("SDVrak vraker noeyaktig talongens antall, fra egen haand", () => {
  let sjekket = 0;
  for (let frø = 8_800_000; frø < 8_800_006; frø++) {
    const s = tilVrak(frø);
    if (s === null) continue;
    const h = new SDVrak(new NevroAgent(), { silVerdener: 1, topp: 6, verdener: 4 }).velgHandling(s);
    assert.equal(h.type, "VRAK");
    const kort = (h as { kort: Kort[] }).kort;
    assert.equal(kort.length, s.giving.talong, "feil antall vrakede kort");
    const påHånd = new Set((s.hender[s.budvinner!] ?? []).map(kortId));
    for (const k of kort) assert.ok(påHånd.has(kortId(k)), "vraket et kort som ikke er paa haanden");
    assert.equal(new Set(kort.map(kortId)).size, kort.length, "samme kort vraket to ganger");
    // Motoren er den endelige dommeren: den skal godta handlingen.
    assert.doesNotThrow(() => utfør(s, h));
    sjekket++;
  }
  assert.ok(sjekket >= 3, `for faa stillinger sjekket (${sjekket})`);
});
