/**
 * LØPSHARNESKET — GIR FIRE LIKE SETER 25 %? (12. sep)
 *
 * `examples/lop-menneske.ts` skal svare på ett spørsmål: hvor ofte vinner mennesket et race til
 * 100. Tallet er verdiløst hvis harnesket teller feil, og et harnesk som teller feil ser
 * NØYAKTIG ut som et harnesk som teller riktig — det skriver like pene rader.
 *
 * Den ene sjekken som kan skille dem: fire LIKE, deterministiske seter må gi fokussetet 25 %.
 * Er rotasjonen skjev, eller telles vinneren mot feil sete, faller tallet vekk fra 25 %.
 *
 *   KONTROLL   fire like seter over mange løp ligger på 25 %.
 *   FELLE      et SVAKERE sete må gi klart under 25 %. Uten den beviser kontrollen ingenting:
 *              et harnesk som ALLTID svarte «25 %» ville bestått den, og da måler den ikke at
 *              harnesket ser forskjell på sterk og svak — som er hele jobben.
 *   ROTASJON   `klonSete` dekker alle fire setene like ofte. FELLE: en fast rotasjon gjør det ikke.
 *   DOMMEN     `domLøp` regner andelen og et bootstrap-intervall som dekker den.
 */

import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { domLøp, klonSete, LOP_BASE, LOP_STEG, spillLøp, type Løperad } from "../examples/lop-menneske.ts";

/** Rent nett, ingen søk og ingen tilfeldighet: samme stilling gir alltid samme trekk. */
const LIK = "vakt:abmp:e1:e1-modell/d7alle.bin";
/** Merkbart svakere: NevroHjerne alene, uten kortnettet. */
const SVAK = "nevro";
const skip = existsSync("e1-modell/d7alle.bin") ? false : "mangler e1-modell/d7alle.bin (e1-modell er ikke sporet)";

/** Kjører `løp` løp med `klon` i det roterende setet og resten `bot`, og gir radene. */
function kjør(klon: string, bot: string, løp: number): Løperad[] {
  const rader: Løperad[] = [];
  for (let l = 0; l < løp; l++) {
    const sete = klonSete(l);
    const frø = LOP_BASE + l * LOP_STEG;
    const r = spillLøp(
      [0, 1, 2, 3].map((p) => (p === sete ? klon : bot)),
      frø,
      100,
      200,
    );
    if (r === null) continue;
    rader.push({
      frø,
      løp: l,
      sete,
      klonVant: r.vinner === sete ? 1 : 0,
      vinner: r.vinner,
      runder: r.runder,
      klonPoeng: r.poeng[sete] ?? 0,
      beste: Math.max(...r.poeng.filter((_, p) => p !== sete)),
    });
  }
  return rader;
}

test("KONTROLL: fire like seter gir fokussetet 25 %", { skip }, () => {
  const rader = kjør(LIK, LIK, 400);
  const d = domLøp(rader, 4000);
  assert.equal(d.n, 400, `bare ${d.n} av 400 løp ble ferdige`);
  console.log(`    fire like seter: ${(100 * d.andel).toFixed(1)} % [${(100 * d.lav).toFixed(1)}, ${(100 * d.høy).toFixed(1)}], ${d.runder.toFixed(1)} runder/løp`);
  // Grensen er vid med vilje: 400 løp har SE ≈ 2,2 pp, og prøven skal fange en ØDELAGT
  // rotasjon eller poengtelling (som bommer med titalls pp), ikke normal støy.
  assert.ok(
    Math.abs(d.andel - 0.25) < 0.08,
    `fire like seter ga ${(100 * d.andel).toFixed(1)} % – rotasjonen eller poengtellingen er gal`,
  );
});

test("FELLE: et svakere sete gir klart under 25 %", { skip }, () => {
  const rader = kjør(SVAK, LIK, 200);
  const d = domLøp(rader, 4000);
  assert.ok(d.n > 150, `bare ${d.n} løp ble ferdige`);
  console.log(`    svakt sete mot tre sterke: ${(100 * d.andel).toFixed(1)} % [${(100 * d.lav).toFixed(1)}, ${(100 * d.høy).toFixed(1)}]`);
  assert.ok(
    d.andel < 0.18,
    `det svake setet vant ${(100 * d.andel).toFixed(1)} % – harnesket ser ikke forskjell på sterk og svak, ` +
      `og da beviser 25 %-kontrollen ingenting`,
  );
});

test("rotasjonen dekker alle fire setene like ofte", () => {
  const tell = [0, 0, 0, 0];
  for (let l = 0; l < 400; l++) tell[klonSete(l)]!++;
  assert.deepEqual(tell, [100, 100, 100, 100], "klonSete dekker ikke setene likt");
});

test("FELLE: en fast rotasjon blir tatt av samme sjekk", () => {
  const fast = (): number => 0;
  const tell = [0, 0, 0, 0];
  for (let l = 0; l < 400; l++) tell[fast()]!++;
  assert.notDeepEqual(tell, [100, 100, 100, 100], "en fast rotasjon slapp unna dekningssjekken");
});

test("domLøp: andelen og intervallet stemmer", () => {
  const rad = (i: number, vant: 0 | 1): Løperad => ({
    frø: i,
    løp: i,
    sete: i % 4,
    klonVant: vant,
    vinner: vant === 1 ? i % 4 : (i + 1) % 4,
    runder: 20,
    klonPoeng: 50,
    beste: 100,
  });
  const rader = [...Array(100).keys()].map((i) => rad(i, i < 5 ? 1 : 0));
  const d = domLøp(rader, 4000);
  assert.equal(d.n, 100);
  assert.equal(d.seire, 5);
  assert.ok(Math.abs(d.andel - 0.05) < 1e-9, `andel ${d.andel}`);
  assert.ok(d.lav <= 0.05 && d.høy >= 0.05, `intervallet [${d.lav}, ${d.høy}] dekker ikke 5 %`);
  assert.ok(Math.abs(d.runder - 20) < 1e-9);

  // FELLE: alle løp vunnet må gi 100 %, ellers teller dommen ikke det den sier.
  const alle = domLøp([...Array(20).keys()].map((i) => rad(i, 1)), 2000);
  assert.equal(alle.andel, 1, "domLøp gir ikke 100 % når klonen vant hvert løp");
});
