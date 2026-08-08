/**
 * MAKRO → MESO — kampstillingen inn i BUDET (K5 → K3).
 *
 * `AdamsMax.md`, «K5 utvidet — de tre nivåene»: makro (løpet mot 100), meso
 * (kontrakten som spilles), mikro (hvert stikk). Makro virket i SØKET og
 * ingenting annet — `totalPoeng` hadde null treff i `budmodell.ts`. En bot 30
 * poeng bak med tre runder igjen bød nøyaktig som en som ledet.
 *
 * ================= DE TRE PÅSTANDENE DENNE FILA LÅSER ===================
 *
 *   1. NULLPUNKTET er bit-identisk. `kamp0` og «ingen kamp-felt» velger samme
 *      bud, i en stilling der presset er klart ulik null — ellers ville testen
 *      vært grønn av samme grunn som gate 2 er blind.
 *   2. MODULEN FYRER. Samme kort, samme budrunde, 20 poeng bak mot 20 foran
 *      ved 70–90 av 100 gir ULIKE bud. Vedleggsregel 6: en test skal måle at
 *      noe fyrer, ikke at det finnes.
 *   3. RETNINGEN er den kravet ber om, ikke bare «noe annet»: bak byr MER
 *      aggressivt, ledelse MINDRE. Snur fortegnet, feiler prøven.
 *
 * ================= OG FELLEN, SOM ER TESTET OG IKKE BARE SKREVET ========
 *
 * **Modulen er strukturelt usynlig på gate 2.** Hver giv der starter på 0–0,
 * `racepress` returnerer eksakt 0 (`framdrift < 0.3`), og budet er bit-identisk
 * med at knotten er av — uansett lambda. Testen «gate 2 kan ikke se denne
 * modulen» under måler nettopp det, så ingen kan kjøre en gate2-sveip, se
 * 0,0000 og konkludere med at modulen er inert.
 *
 * Det har skjedd før: `r0.4` i ADAMS_V6 ble konkludert inert av NØYAKTIG denne
 * grunnen, og hadde da aldri fått lov til å fyre én eneste gang.
 *
 * **Kampbenken (`examples/kamp.ts`) er den eneste porten som kan måle dette**,
 * fordi den er den eneste som spiller kamper til `målPoeng`.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { budpress, kampjustertMu, kampvipp } from "../src/moe2/budrace.ts";
/** Hentet fra KILDEN, ikke fra budrace: testen under sammenlikner de to. */
import { racepress as racepressFasit } from "../src/moe2/race.ts";
import { AMERIKANER, PASS } from "../src/regler.ts";

/** Terskelen `-3.0` er den utrullede; alt annet enn `kamp`-feltet er likt. */
const AV = "budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
const NULLPUNKT = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0//kamp0:vakt:abmpf:e1:e1-modell/d7alle.bin";
const PÅ = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0//kamp1.5:vakt:abmpf:e1:e1-modell/d7alle.bin";

/**
 * LAMBDA 1,5 ER LÅNT FRA `r1.5` I ADAMS_V6, og det er en STARTVERDI og ikke et
 * måleresultat. Ved press 0,36 (70–90 av 100) gir den vipp 0,54 σ. Skal
 * sveipes på kampbenken.
 */

/** PASS = 0, tallbud = N, Amerikaner = 13 (over bud 12, som den er). */
const nivå = (b: unknown): number => {
  if (typeof b === "number") return b;
  if (b === AMERIKANER) return 13;
  if (b === PASS) return 0;
  return -1;
};

const budNivå = (h: unknown): number => nivå((h as { bud: unknown }).bud);

/**
 * Kampstillingen settes DIREKTE, slik `test/k5-kontekst.test.ts` gjør det.
 * Å vente på at en benk skal produsere 70–90 er ikke et alternativ i en
 * enhetstest — og alt annet i tilstanden er bit-identisk.
 */
const medStilling = (s: GameState, egne: number, andre: number, sete: number): GameState => {
  const p = [andre, andre, andre, andre];
  p[sete] = egne;
  return { ...s, totalPoeng: p } as GameState;
};

test("makro→meso: nullpunktet i modulen - lambda 0 og press 0 gir my UENDRET", () => {
  // Ikke «samme verdi» men SAMME TALL: en tidlig retur, ingen flyttallsaddisjon.
  assert.ok(Object.is(kampjustertMu(9.804, 1.227, 0.36, 0), 9.804));
  assert.ok(Object.is(kampjustertMu(9.804, 1.227, 0, 1.5), 9.804));
  assert.equal(kampvipp(0.36, 0), 0);
  assert.equal(kampvipp(0, 1.5), 0);
});

test("makro→meso: retningen i modulen - bak loefter my, ledelse senker den", () => {
  const μ = 9.8;
  const σ = 1.2;
  const bak = kampjustertMu(μ, σ, +0.36, 1.5);
  const foran = kampjustertMu(μ, σ, -0.36, 1.5);
  assert.ok(bak > μ, `bak skal loefte my (${bak} mot ${μ})`);
  assert.ok(foran < μ, `ledelse skal senke my (${foran} mot ${μ})`);
  // Symmetrisk om my, og aldri mer enn ett standardavvik.
  assert.ok(Math.abs(bak - μ - (μ - foran)) < 1e-12, "vippet skal vaere symmetrisk");
  assert.ok(kampjustertMu(μ, σ, 1, 99) <= μ + σ + 1e-12, "vippet skal vaere klippet til ett sigma");
  assert.ok(kampjustertMu(μ, σ, -1, 99) >= μ - σ - 1e-12, "vippet skal vaere klippet til ett sigma");
});

test("makro→meso: modulen KAN vendes feil vei - retningstesten over kan feile", () => {
  /**
   * Falsifiseringsarmen, av samme grunn som i `race.ts`: uten den vet vi ikke
   * om den groenne retningstesten maaler retning eller bare maaler at noe
   * skjer. `kamp-1.5` er samme knott med fortegnet snudd, og den maa gi det
   * MOTSATTE - ellers har parameteren ingen retning i det hele tatt.
   */
  const μ = 9.8;
  assert.ok(kampjustertMu(μ, 1.2, +0.36, -1.5) < μ, "vendt knott skal senke my naar vi ligger bak");
  assert.ok(kampjustertMu(μ, 1.2, -0.36, -1.5) > μ, "vendt knott skal loefte my naar vi leder");
});

test("makro→meso: presset er GJENBRUKT fra race.ts, ikke regnet paa nytt her", () => {
  /**
   * Krav 3: to definisjoner av «hvor langt er vi kommet» ville drevet fra
   * hverandre - samme feilklasse som `signal.ts` hadde, der avsender og leser
   * hadde hver sin kode. `budpress` skal vaere `racepress`, tall for tall.
   */
  const s = opprettSpill({ antallSpillere: 4 }, 5_100_000);
  const bak = medStilling(s, 70, 90, 0);
  const foran = medStilling(s, 90, 70, 0);
  assert.equal(budpress(bak, 0), racepressFasit(bak, 0));
  assert.equal(budpress(foran, 0), racepressFasit(foran, 0));
  assert.ok(budpress(bak, 0) > 0.3, `presset fyrer ikke ved 70-90: ${budpress(bak, 0)}`);
  assert.ok(budpress(foran, 0) < -0.3, `presset fyrer ikke ved 90-70: ${budpress(foran, 0)}`);
});

test("makro→meso: GATE 2 KAN IKKE SE DENNE MODULEN - presset er eksakt null der", () => {
  /**
   * DEN VIKTIGSTE TESTEN I FILA aa lese, selv om den er den enkleste aa passere.
   *
   * Gate 2 spiller én runde fra 0-0. `racepress` returnerer eksakt 0, og budet
   * er BIT-IDENTISK med at knotten er av - uansett lambda. En sveip over
   * `kamp` paa gate 2 vil maale 0,0000 i hver arm, og det er ikke et bevis paa
   * at modulen er inert. `r0.4` ble felt paa noeyaktig den feilslutningen.
   *
   * Bare `examples/kamp.ts` spiller kamper til maalPoeng og produserer
   * stillinger med `framdrift >= 0,3`.
   */
  const s = opprettSpill({ antallSpillere: 4 }, 5_100_000);
  for (let sete = 0; sete < 4; sete++) {
    assert.equal(budpress(s, sete), 0, `presset var ikke null ved 0-0 i sete ${sete}`);
  }

  const av = lagIndre(AV);
  const på = lagIndre(PÅ);
  let t: GameState = s;
  let vakt = 0;
  let sett = 0;
  while (t.fase === "BUDRUNDE" && vakt++ < 40 && t.iTur !== null) {
    const ha = av.velgHandling(t);
    const hb = på.velgHandling(t);
    sett++;
    assert.deepEqual(
      hb,
      ha,
      "kamp1.5 endret et bud fra 0-0. Da lekker modulen inn i gate 2, og formen er feil.",
    );
    t = utfør(t, ha).state;
  }
  assert.ok(sett > 0, "kom aldri til en budbeslutning");
});

test("makro→meso: NULLPUNKTET er bit-identisk - «kamp0» byr som uten feltet", () => {
  /**
   * Vedleggsregel 5. Og maalt DER PRESSET ER ULIK NULL: hadde stillingen vaert
   * 0-0 ville denne testen vaert groenn av samme grunn som gate 2 er blind, og
   * da hadde den ikke bevist noe om nullpunktet.
   */
  let sett = 0;
  for (let g = 0; g < 12; g++) {
    const a = lagIndre(AV);
    const b = lagIndre(NULLPUNKT);
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_600_000 + g * 733);
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 40 && s.iTur !== null) {
      const sete = s.iTur;
      const bak = medStilling(s, 70, 90, sete);
      assert.ok(budpress(bak, sete) > 0.3, "stillingen presser ikke - testen ville bevist ingenting");
      const ha = a.velgHandling(bak);
      const hb = b.velgHandling(bak);
      sett++;
      assert.deepEqual(hb, ha, "«kamp0» skal gi NOEYAKTIG samme bud som uten feltet");
      s = utfør(s, ha).state;
    }
  }
  assert.ok(sett > 20, `bare ${sett} budbeslutninger - beviser lite`);
});

/**
 * SELVE MAALINGEN, kjoert ÉN GANG og lest av to tester.
 *
 * Samme giv, samme budrunde, samme agent - bare `totalPoeng` skiller armene.
 * Det er den eneste sammenlikningen der kampstillingen er alene om aa skille.
 */
function målRetning(): { sett: number; opp: number; ned: number } {
  const b = lagIndre(PÅ);
  const framdriver = lagIndre(AV);
  let sett = 0;
  let opp = 0;
  let ned = 0;
  for (let g = 0; g < 12; g++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 5_100_000 + g * 911);
    let vakt = 0;
    while (s.fase === "BUDRUNDE" && vakt++ < 40 && s.iTur !== null) {
      const sete = s.iTur;
      const nBak = budNivå(b.velgHandling(medStilling(s, 70, 90, sete)));
      const nForan = budNivå(b.velgHandling(medStilling(s, 90, 70, sete)));
      sett++;
      if (nBak > nForan) opp++;
      if (nBak < nForan) ned++;
      // Budrunden fores fram med knotten AV, saa de to armene alltid ser
      // NOEYAKTIG samme historikk.
      s = utfør(s, framdriver.velgHandling(s)).state;
    }
  }
  return { sett, opp, ned };
}
/** ÉN kjoering, lest av to tester - to tall som kan vaere uenige er verre enn ett. */
let bufret: { sett: number; opp: number; ned: number } | null = null;
const retning = (): { sett: number; opp: number; ned: number } => (bufret ??= målRetning());

test("makro→meso: modulen FYRER - samme kort, ulik kampstilling, ULIKT bud", () => {
  /**
   * Vedleggsregel 6: en test skal maale at noe FYRER, ikke at det finnes.
   * Fire doede moduler hadde groenne enhetstester hele tiden.
   */
  const r = retning();
  assert.ok(r.sett > 20, `bare ${r.sett} budbeslutninger`);
  assert.ok(
    r.opp + r.ned > 0,
    `INGEN TILPASNING: 20 poeng bak mot 20 poeng foran ved 70-90 av 100, og Adams bod ` +
      `NOEYAKTIG likt i alle ${r.sett} beslutningene. Da er «kamp1.5» pynt.`,
  );
});

test("makro→meso: RETNINGEN - bak byr mer aggressivt, ledelse forsiktigere", () => {
  /**
   * «Ulikt bud» er ikke kravet. Kravet sier hvilken VEI, og retningen er
   * strukturell og ikke statistisk: et hoeyere `my` loefter `P(lagstikk >= N)`
   * for HVERT bud, saa `ev = p*2N(2P-1) + (1-p)*fv` vokser mot terskelen.
   *
   * MAALT paa 183 beslutninger over 40 giv i baand 5,1M: 87 opp, **0 ned**.
   * Derfor asserteres «aldri ned» og ikke bare et snitt - et enkelt tilfelle
   * av at ledelse gir HOEYERE bud ville betydd at formen ikke er monoton, og
   * det skal vi vite.
   */
  const r = retning();
  assert.ok(r.opp > 0, `ingen av ${r.sett} beslutninger bod hoeyere naar Adams laa bak`);
  assert.equal(
    r.ned,
    0,
    `FEIL VEI: i ${r.ned} av ${r.sett} beslutninger bod Adams HOEYERE da han ledet ` +
      `90-70 enn da han laa 70-90 under. Kravet sier at aa ligge bak skal gi mer aggressive bud.`,
  );
});

test("makro→meso: speken avviser soppel i kamp-feltet i stedet for aa tie", () => {
  assert.throws(
    () => lagIndre("budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0//kampX:nevro"),
    /kamp<lambda>/,
    "et ulovlig kamp-felt skal si fra, ikke degradere stille til av",
  );
  // Falsifiseringsarmen maa vaere skrivbar, ellers kan ingen sveip vende knotten.
  assert.doesNotThrow(() =>
    lagIndre("budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0//kamp-1.5:nevro"),
  );
});
