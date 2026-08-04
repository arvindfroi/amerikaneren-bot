/**
 * DØDEBLOKKEN (v8) må aldri påstå noe som er usant om de skjulte hendene.
 *
 * Blokken sier hvor mange kort av hver farge som fortsatt KAN ligge ute, etter
 * at de fire vrakede er trukket fra. Er den nedre grensen for høy, lærer
 * nettet at kort finnes som ikke finnes – og det er verre enn å ikke ha
 * blokken i det hele tatt, fordi feilen er systematisk og ser ut som kunnskap.
 *
 * Testene spiller EKTE giver og sammenlikner mot fasiten i `state.hender`.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { FARGER } from "../src/kort.ts";
import { fargeIndeks } from "../src/nevro/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { DØDE_FRA, DØDE_ANTALL, fyllDødeblokk } from "../src/e1/dode.ts";

/** Antall kort av farge `f` på de tre andre hendene. */
function skjultAntall(s: GameState, sete: number, f: number): number {
  let n = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete) continue;
    for (const k of s.hender[p] ?? []) if (fargeIndeks(k.farge) === f) n++;
  }
  return n;
}

/** Spiller giva og kaller `sjekk` i hver spillestilling. */
function overGiver(antall: number, sjekk: (s: GameState) => void): number {
  let stillinger = 0;
  for (let i = 0; i < antall; i++) {
    const agenter = [0, 1, 2, 3].map(() => new NevroAgent());
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_100_000 + i * 7717);
    let g = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
      if (s.fase === "SPILL") {
        sjekk(s);
        stillinger++;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
    }
  }
  return stillinger;
}

test("nedre grense motsier aldri de faktiske skjulte hendene", () => {
  let sjekket = 0;
  const n = overGiver(20, (s) => {
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      fyllDødeblokk(v, s, sete);
      for (let f = 0; f < 4; f++) {
        const min = Math.round(v[DØDE_FRA + f]! * 13);
        const faktisk = skjultAntall(s, sete, f);
        assert.ok(
          min <= faktisk,
          `sete ${sete}, ${FARGER[f]}: nedre grense ${min} > faktisk ${faktisk}`,
        );
        sjekket++;
      }
    }
  });
  assert.ok(n > 100, `for få stillinger (${n})`);
  assert.ok(sjekket > 400);
});

test("øvre grense er aldri lavere enn det som faktisk ligger ute", () => {
  overGiver(20, (s) => {
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      fyllDødeblokk(v, s, sete);
      for (let f = 0; f < 4; f++) {
        const maks = Math.round(v[DØDE_FRA + 4 + f]! * 13);
        const faktisk = skjultAntall(s, sete, f);
        assert.ok(
          maks >= faktisk,
          `sete ${sete}, ${FARGER[f]}: øvre grense ${maks} < faktisk ${faktisk}`,
        );
      }
    }
  });
});

test("egen trumf og andel stemmer med hånden", () => {
  overGiver(10, (s) => {
    if (s.trumf === null) return;
    const tf = fargeIndeks(s.trumf);
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      fyllDødeblokk(v, s, sete);
      const egen = (s.hender[sete] ?? []).filter((k) => fargeIndeks(k.farge) === tf).length;
      assert.equal(Math.round(v[DØDE_FRA + 9]! * 13), egen, "egen trumf");
      const ute = Math.round(v[DØDE_FRA + 8]! * 13);
      if (ute + egen > 0) {
        assert.ok(Math.abs(v[DØDE_FRA + 10]! - egen / (ute + egen)) < 1e-6, "andel");
      }
    }
  });
});

test("budvinnerflagget er satt i nøyaktig ett sete", () => {
  overGiver(10, (s) => {
    let n = 0;
    for (let sete = 0; sete < 4; sete++) {
      const v = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      fyllDødeblokk(v, s, sete);
      if (v[DØDE_FRA + 11] === 1) n++;
    }
    assert.equal(n, 1, "nøyaktig ett sete skal være budvinner");
  });
});

/**
 * UTE_TRUMF er et ANSLAG, ikke en grense, og testen måler treffraten i stedet
 * for å kreve at den er perfekt.
 *
 * Anslaget bygger på at ingen vraker trumf. Målt: NevroHjerne bryter det i
 * 2,0 % av givene, Adams aldri (vrakflagget `t`), og av 21 loggede
 * menneskerunder brøt ingen det. Testen kjører med NevroHjerne – altså den
 * verste av de tre – og krever at anslaget treffer i minst 95 % av
 * stillingene. Faller det under, er noe annet galt enn et sjeldent trumfvrak.
 */
test("utestående trumf treffer i minst 95 % av stillingene", () => {
  let avvik = 0;
  let talt = 0;
  overGiver(20, (s) => {
    if (s.trumf === null) return;
    const tf = fargeIndeks(s.trumf);
    for (let sete = 0; sete < 4; sete++) {
      if (s.budvinner === sete) continue; // budvinneren ser sitt eget vrak
      const v = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      fyllDødeblokk(v, s, sete);
      const påstand = Math.round(v[DØDE_FRA + 8]! * 13);
      const faktisk = skjultAntall(s, sete, tf);
      talt++;
      if (påstand !== faktisk) avvik++;
    }
  });
  assert.ok(talt > 300, `for få stillinger (${talt})`);
  const rate = 1 - avvik / talt;
  assert.ok(rate >= 0.95, `traff bare ${(100 * rate).toFixed(1)} % (${avvik} av ${talt})`);
});

/**
 * LEKKASJEVAKTEN, og den viktigste testen i fila.
 *
 * `state.vrak` er skjult for alle andre enn den som kastet kortene. Blokken
 * finnes nettopp for å SLUTTE seg til det vraket inneholder – leser den fasiten
 * i stedet, ville nettet lært noe det aldri får se i spill, og alle målinger
 * bygget på det ville vært verdiløse uten å se feil ut.
 *
 * Testen bytter ut vraket med fire helt andre kort og krever at trekkene for
 * setene som IKKE er budvinner blir bit for bit like.
 */
test("vraket lekker ikke til de andre setene", () => {
  let sammenliknet = 0;
  overGiver(15, (s) => {
    // Et vrak som garantert er noe annet: fire kort ingen har på hånd nå.
    const falskt = s.vrak.map((k) => ({ farge: k.farge, verdi: k.verdi }));
    if (falskt.length === 0) return;
    const forfalsket = { ...s, vrak: [] as typeof s.vrak } as GameState;
    for (let sete = 0; sete < 4; sete++) {
      if (s.budvinner === sete) continue;
      const a = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      const b = new Float32Array(DØDE_FRA + DØDE_ANTALL);
      fyllDødeblokk(a, s, sete);
      fyllDødeblokk(b, forfalsket, sete);
      for (let i = DØDE_FRA; i < DØDE_FRA + DØDE_ANTALL; i++) {
        assert.equal(a[i], b[i], `sete ${sete}, indeks ${i}: vraket paavirket trekket`);
      }
      sammenliknet++;
    }
  });
  assert.ok(sammenliknet > 200, `for faa sammenlikninger (${sammenliknet})`);
});
