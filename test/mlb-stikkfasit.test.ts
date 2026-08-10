/**
 * STIKKETIKETTEN (§127) — og hvorfor den prøves med en IDENTITET.
 *
 * Etiketten er «hvor mange stikk tar setets LAG i resten av runden». Den er
 * gratis (kjent ved rundeslutt) og tett (endrer seg for hvert stikk), men den
 * er også lett å regne feil på fire måter som alle SER riktige ut:
 *
 *   1. telle fra stikk 0 i stedet for fra `stikkSpilt`
 *   2. glemme stikket som er I GANG
 *   3. sette laget til «budvinner + makker» også for forsvaret
 *   4. la en avbrutt runde få 0 i stedet for −1
 *
 * Ingen av dem krasjer. Alle fire gir et hode som trenes mot noe annet enn det
 * vi tror, og §124 kostet ti epoker på nøyaktig den feilklassen.
 *
 * Derfor prøves den på en IDENTITET som må holde uansett hvem som er på hvilket
 * lag, og som er avlesbar fra radene alene:
 *
 *     to seter, samme runde, samme `stikkSpilt`
 *     ⇒ enten SAMME tall (samme lag), eller SUM = antallStikk − stikkSpilt
 *
 * Og prøven kan feile: nederst kjøres nøyaktig samme sjekk på en etikett med
 * feil 1 innebygd, og den skal bli tatt.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { spillKamp, tilfeldigNett, type Beslutningsrad } from "../src/mlb/selvspill.ts";

const ANTALL_STIKK = 12; // fire spillere, 48 kort delt ut

function kamper(antall: number): Beslutningsrad[][] {
  const ut: Beslutningsrad[][] = [];
  for (let k = 0; k < antall; k++) {
    const rng = lagRng(90_127 + k * 3331);
    const nett = tilfeldigNett(rng);
    ut.push(
      spillKamp({
        frø: 7_100_000 + k * 977,
        målPoeng: 30,
        maksRunder: 12,
        seter: [0, 1, 2, 3].map((i) => ({
          navn: `s${i}`,
          nett,
          temperatur: 1,
          samle: true,
        })),
      }).rader,
    );
  }
  return ut;
}

/**
 * IDENTITETEN, som en funksjon så den kan brukes både på ekte rader og på den
 * bevisst ødelagte kontrollarmen.
 */
function bruddPåIdentiteten(rader: readonly Beslutningsrad[], etikett: (r: Beslutningsrad) => number): number {
  const grupper = new Map<string, Beslutningsrad[]>();
  for (const r of rader) {
    if (etikett(r) < 0) continue;
    const n = `${r.rundeNr}:${r.stikkSpilt}`;
    const g = grupper.get(n);
    if (g === undefined) grupper.set(n, [r]);
    else g.push(r);
  }
  let brudd = 0;
  for (const [, g] of grupper) {
    for (const a of g) {
      for (const b of g) {
        if (a.sete === b.sete) continue;
        const va = etikett(a);
        const vb = etikett(b);
        const sammeLag = va === vb;
        const motLag = va + vb === ANTALL_STIKK - a.stikkSpilt;
        if (!sammeLag && !motLag) brudd++;
      }
    }
  }
  return brudd;
}

test("stikkfasiten: identiteten holder i hver eneste runde", () => {
  let rader = 0;
  let kjent = 0;
  for (const kamp of kamper(6)) {
    rader += kamp.length;
    for (const r of kamp) if (r.stikkIgjen >= 0) kjent++;
    assert.equal(
      bruddPåIdentiteten(kamp, (r) => r.stikkIgjen),
      0,
      "to seter i samme runde med samme stikkSpilt er verken på samme lag eller på hvert sitt",
    );
  }
  assert.ok(rader > 1000, `for få rader til å si noe: ${rader}`);
  // Med `maksRunder` godt over det en kamp til 30 trenger, skal nesten hver
  // runde bli ferdigspilt. Er andelen lav, er det en feil og ikke et tall.
  assert.ok(kjent / rader > 0.8, `bare ${((kjent / rader) * 100).toFixed(1)} % av radene fikk fasit`);
});

test("stikkfasiten: den faller monotont gjennom runden, og aldri under null", () => {
  for (const kamp of kamper(4)) {
    const sist = new Map<string, { stikk: number; verdi: number }>();
    for (const r of kamp) {
      if (r.stikkIgjen < 0) continue;
      assert.ok(r.stikkIgjen >= 0 && r.stikkIgjen <= ANTALL_STIKK, `${r.stikkIgjen} stikk igjen`);
      const n = `${r.rundeNr}:${r.sete}`;
      const f = sist.get(n);
      if (f !== undefined && r.stikkSpilt > f.stikk) {
        // Et stikk som er spilt kan ikke gjøre at laget tar FLERE i resten.
        assert.ok(
          r.stikkIgjen <= f.verdi,
          `sete ${r.sete} runde ${r.rundeNr}: ${f.verdi} -> ${r.stikkIgjen} stikk igjen`,
        );
      }
      sist.set(n, { stikk: r.stikkSpilt, verdi: r.stikkIgjen });
    }
  }
});

test("stikkfasiten: BUD-radene bærer hele rundens lagstikk", () => {
  /**
   * Ved `stikkSpilt = 0` er «resten» hele runden. Det er den egenskapen som gjør
   * at BUDET får et signal i det hele tatt: budet skal nettopp spå hvor mange
   * stikk laget kommer til å ta, og K3 kaller budrunden det største gapet
   * (41,8 %). Er etiketten null i budfasen, er hele den delen borte.
   */
  let budrader = 0;
  for (const kamp of kamper(4)) {
    for (const r of kamp) {
      if (r.beslutning !== "BUD" || r.stikkIgjen < 0) continue;
      budrader++;
      assert.equal(r.stikkSpilt, 0, "en budrad kan ikke ha spilte stikk");
    }
  }
  assert.ok(budrader > 100, `for få budrader: ${budrader}`);
});

test("KONTROLLARM: en etikett som teller fra stikk 0 blir TATT", () => {
  /**
   * Feil 1 på lista: telle laget stikk fra rundens start i stedet for fra
   * `stikkSpilt`. Da er etiketten konstant gjennom runden — nøyaktig den
   * sykdommen §124 fant i λ = 1 — og den ser helt rimelig ut i en logg.
   *
   * Her bygges den av de EKTE radene: for hver (runde, sete) tas verdien fra
   * første rad, og alle radene i gruppen får den. Identiteten skal da brytes,
   * fordi `SUM = antallStikk − stikkSpilt` bare holder for «resten».
   */
  const kamp = kamper(1)[0]!;
  const første = new Map<string, number>();
  for (const r of kamp) {
    if (r.stikkIgjen < 0) continue;
    const n = `${r.rundeNr}:${r.sete}`;
    if (!første.has(n)) første.set(n, r.stikkIgjen);
  }
  const totalt = (r: Beslutningsrad): number =>
    r.stikkIgjen < 0 ? -1 : (første.get(`${r.rundeNr}:${r.sete}`) ?? -1);
  assert.ok(
    bruddPåIdentiteten(kamp, totalt) > 0,
    "kontrollarmen ble IKKE tatt — da prøver ikke identiteten det den skal",
  );
});
