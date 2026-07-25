import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { Innovasjonsbok, muter, nyttGenom, STANDARD_RATER, type Genom } from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { ANTALL_INN, ANTALL_UT, UT_KORT } from "../src/neat/trekk.ts";

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
