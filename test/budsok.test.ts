/**
 * A4: BUDET SPØR SPILLET.
 *
 * `søktMu` anslår lagstikk ved å SPILLE hånden ut i trukne verdener, i stedet
 * for å regne på den med en GBT. Det som må håndheves er tre ting:
 *
 *   at anslaget faktisk er et anslag (endelig, i riktig område),
 *   at det SKILLER mellom bud — ellers er det en dyr konstant,
 *   og at `blanding = 0` gir modellens tall BIT-IDENTISK, så ingen måling
 *   endrer seg for noen som ikke har bedt om det.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { søktMu, blandMu } from "../src/moe2/budsok.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";

/** Spiller fram til en budstilling. */
function budstilling(frø: number): { s: GameState; sete: number } | null {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 200) {
    if (s.fase === "BUDRUNDE" && s.iTur !== null) return { s, sete: s.iTur };
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) return null;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  return null;
}

test("blanding = 0 gir modellens tall BIT-IDENTISK", () => {
  const m = { μ: 9.4, σ: 1.2 };
  assert.deepEqual(blandMu(m, { μ: 2, σ: 9 }, 0), m);
  assert.deepEqual(blandMu(m, null, 1), m, "uten soekt anslag skal modellen staa");
});

test("blanding = 1 gir soekets tall, 0,5 gir midt imellom", () => {
  const m = { μ: 8, σ: 1 };
  const s = { μ: 10, σ: 2 };
  assert.deepEqual(blandMu(m, s, 1), s);
  assert.deepEqual(blandMu(m, s, 0.5), { μ: 9, σ: 1.5 });
});

test("soektMu gir et TROVERDIG anslag, ikke soppel", () => {
  const b = budstilling(2_700_000);
  assert.ok(b !== null, "fant ingen budstilling");
  const r = søktMu(b!.s, b!.sete, 9, lagIndre(ADAMS), { verdener: 6, rng: lagRng(11) });
  if (r === null) return; // ingen verden ga oss kontrakten - lovlig utfall
  assert.ok(Number.isFinite(r.μ) && Number.isFinite(r.σ));
  assert.ok(r.μ >= 0 && r.μ <= b!.s.giving.antallStikk, `mu utenfor omraadet: ${r.μ}`);
  assert.ok(r.σ >= 0, `sigma negativ: ${r.σ}`);
  assert.ok(r.n >= 2, `for faa verdener talt: ${r.n}`);
});

/**
 * DEN VIKTIGSTE — OG PREMISSET MITT VAR FEIL FØRSTE GANG.
 *
 * Jeg skrev først en test på at anslaget SKILLER mellom bud. Den feilet, og
 * den skulle feile: antall stikk laget tar avhenger av KORTENE, ikke av hva vi
 * meldte. Derfor anslår budmodellen én (μ, σ) og regner P(N) for alle N fra
 * samme fordeling — og derfor kalles søket ÉN gang per beslutning, ikke per N.
 *
 * Det som faktisk må håndheves er at anslaget skiller mellom HENDER. Gir det
 * samme tall uansett kort, er det en dyr konstant.
 */
test("anslaget skiller mellom HENDER", () => {
  const verdier: number[] = [];
  // BUD 11, ikke 9: med 9 vinner foerste budgiver auksjonen i under en tredel
  // av verdenene (maalt 28 %), saa `soektMu` returnerer null og testen faar
  // for faa anslag. Det er ikke en feil i anslaget - det er at spoersmaalet
  // «hvor mange stikk tar laget mitt» bare finnes naar vi FAAR kontrakten.
  for (let g = 0; g < 20 && verdier.length < 5; g++) {
    const b = budstilling(3_900_000 + g * 7717);
    if (b === null) continue;
    const r = søktMu(b.s, b.sete, 11, lagIndre(ADAMS), { verdener: 6, rng: lagRng(g + 3) });
    if (r !== null) verdier.push(r.μ);
  }
  assert.ok(verdier.length >= 3, `for faa anslag (${verdier.length})`);
  assert.ok(
    new Set(verdier.map((x) => x.toFixed(3))).size > 1,
    `anslaget ga samme tall for alle hender: ${verdier.join(", ")}`,
  );
});

/**
 * OG DET SKAL VÆRE STABILT for samme hånd og samme frø — ellers kan det ikke
 * inngå i en parret måling der kontrollarmen må treffe eksakt 0,0000.
 */
test("anslaget er deterministisk for samme froe", () => {
  const b = budstilling(2_700_000);
  assert.ok(b !== null);
  const a = søktMu(b!.s, b!.sete, 9, lagIndre(ADAMS), { verdener: 5, rng: lagRng(99) });
  const c = søktMu(b!.s, b!.sete, 9, lagIndre(ADAMS), { verdener: 5, rng: lagRng(99) });
  assert.deepEqual(a, c, "samme froe ga ulikt anslag");
});
