import { strict as assert } from "node:assert";
import { test } from "node:test";

import { kortId } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { AMERIKANER, MINSTE_TALLBUD, PASS } from "../src/regler.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { handTrekk, HAND_DIM, minstebudFraStilling } from "../src/moe2/handtrekk.ts";
import { lovligMinstebud } from "../src/moe2/budvakt.ts";

/**
 * Håndvurderingens trekkuttrekk er inngangen til den eneste LOVLIGE
 * budestimatoren vi har trent. Hele påstanden om at den er lovlig hviler på
 * at vektoren ikke endrer seg når motstandernes kort byttes om – nøyaktig
 * samme test som holder den blinde estimatoren ærlig i
 * `test/moe2-budvakt.test.ts`, bare på trekkene i stedet for på tallet, og
 * derfor strengere: her kreves BIT-IDENTITET, ikke bare samme svar.
 */

function giv(frø: number): GameState {
  return opprettSpill({ antallSpillere: 4 }, frø);
}

/**
 * Bytter om kortene mellom de tre setene som IKKE er `sete`, og talongen.
 * Samme rutine som lekkasjetesten for `blindSd` – med vilje, så de to
 * testene ikke kan komme til å prøve to forskjellige ting.
 */
function stokkOmDeAndre(s: GameState, sete: number): GameState {
  const andre: number[] = [];
  for (let i = 0; i < s.antallSpillere; i++) if (i !== sete) andre.push(i);
  const hender = s.hender.map((h) => h.slice());
  const første = hender[andre[0]!]!;
  hender[andre[0]!] = hender[andre[1]!]!;
  hender[andre[1]!] = hender[andre[2]!]!;
  hender[andre[2]!] = første;
  const talong = s.talong.slice();
  const bytt = hender[andre[0]!]!.slice(0, talong.length);
  hender[andre[0]!] = talong.concat(hender[andre[0]!]!.slice(talong.length));
  return { ...s, hender, talong: bytt };
}

// ---------------------------------------------------------------------------
// Informasjonsdisiplinen – den viktigste testen i fila
// ---------------------------------------------------------------------------

test("handTrekk ser BARE egen hånd: bit-identisk når de andre stokkes om", () => {
  for (const frø of [1001, 1002, 1003, 4242, 7777]) {
    for (let sete = 0; sete < 4; sete++) {
      const s = giv(frø);
      const byttet = stokkOmDeAndre(s, sete);
      // Kontroll på at testen faktisk endret noe.
      assert.notDeepEqual(
        s.hender.map((h) => h.map(kortId).sort()),
        byttet.hender.map((h) => h.map(kortId).sort()),
      );
      assert.deepEqual(
        s.hender[sete]!.map(kortId),
        byttet.hender[sete]!.map(kortId),
        "egen hånd skal stå urørt",
      );
      assert.deepEqual(
        Array.from(handTrekk(s, sete)),
        Array.from(handTrekk(byttet, sete)),
        `sete ${sete} på frø ${frø} lekker skjult informasjon`,
      );
    }
  }
});

test("permutasjonen gjelder også midt i budrunden, med historikk på bordet", () => {
  // Budhistorikken er lovlig og SKAL påvirke vektoren; de skjulte kortene
  // skal ikke. Her står begge deler samtidig.
  let s = giv(31415);
  s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: 8 }).state;
  s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: PASS }).state;
  const sete = s.iTur!;
  assert.deepEqual(
    Array.from(handTrekk(s, sete)),
    Array.from(handTrekk(stokkOmDeAndre(s, sete), sete)),
  );
});

test("testen biter: vektoren ENDRER seg når egen hånd byttes ut", () => {
  const s = giv(1001);
  const bytteHånd = { ...s, hender: [s.hender[1]!, s.hender[0]!, s.hender[2]!, s.hender[3]!] };
  assert.notDeepEqual(Array.from(handTrekk(s, 0)), Array.from(handTrekk(bytteHånd, 0)));
});

// ---------------------------------------------------------------------------
// Innholdet
// ---------------------------------------------------------------------------

test("de 52 første trekkene er nøyaktig egen hånd, og bias står sist", () => {
  const s = giv(2024);
  for (let sete = 0; sete < 4; sete++) {
    const v = handTrekk(s, sete);
    assert.equal(v.length, HAND_DIM);
    const satt = new Set<number>();
    for (let i = 0; i < 52; i++) if (v[i] === 1) satt.add(i);
    assert.deepEqual(satt, new Set(s.hender[sete]!.map(kortIndeks)));
    assert.equal(satt.size, s.giving.kortPerSpiller);
    assert.equal(v[HAND_DIM - 1], 1, "bias");
  }
});

test("budhistorikken slår gjennom: et bud fra naboen endrer nabo-trekkene", () => {
  const s = giv(4242);
  const åpner = s.iTur!;
  const etter = utfør(s, { type: "BUD", spiller: åpner, bud: 9 }).state;
  const meg = (åpner + 1) % 4;
  const før = handTrekk(s, meg);
  const nå = handTrekk(etter, meg);
  // Naboen er relativt sete 3 sett fra meg (jeg sitter rett etter ham).
  const relÅpner = (åpner - meg + 4) % 4;
  assert.equal(før[98 + (relÅpner - 1)], 0);
  assert.equal(nå[98 + (relÅpner - 1)], 1, "naboen har meldt et tallbud");
  assert.ok(nå[101 + (relÅpner - 1)]! > 0, "budets størrelse skal stå der");
  assert.equal(nå[89 + relÅpner], 1, "han holder det høyeste budet");
});

test("minstebudFraStilling er enig med lovligMinstebud, og trenger ikke iTur", () => {
  let s = giv(4242);
  assert.equal(minstebudFraStilling(s), MINSTE_TALLBUD);
  assert.equal(minstebudFraStilling(s), lovligMinstebud(s));
  s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: 8 }).state;
  assert.equal(minstebudFraStilling(s), 9);
  assert.equal(minstebudFraStilling(s), lovligMinstebud(s));
  // Uten iTur ville `lovligeHandlinger` kastet; her går det fint.
  assert.equal(minstebudFraStilling({ ...s, iTur: null }), 9);
});

test("Amerikaner tar bort alle tallbud – og flagget sier fra", () => {
  let s = giv(4242);
  s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: AMERIKANER }).state;
  assert.equal(minstebudFraStilling(s), null);
  const v = handTrekk(s, s.iTur ?? 0);
  assert.equal(v[85], 0, "ingen lovlige tallbud");
  assert.equal(v[88], 1, "høyeste bud er amerikaner/solo");
  assert.equal(v[86], 0, "ingen tallbudskala for et amerikaner-bud");
});

test("trekkene er endelige tall og innenfor [-1, 1]", () => {
  // Et NaN her ville forplantet seg gjennom hele nettet uten å stoppe noe.
  for (const frø of [11, 22, 33]) {
    const s = giv(frø);
    for (let sete = 0; sete < 4; sete++) {
      for (const x of handTrekk(s, sete)) {
        assert.ok(Number.isFinite(x) && x >= -1 && x <= 1, `ugyldig trekkverdi ${x}`);
      }
    }
  }
});
