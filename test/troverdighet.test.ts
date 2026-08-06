/**
 * PREDIKSJON SOM LIKELIHOOD — testene som skiller den fra en gjetning.
 *
 * Arvind: «det burde ikke være normale regler men enten læring over tid eller
 * matematiske formler som vi vet kommer til å gi best resultater.»
 *
 * Formelen er Bayes. Det den MÅ oppfylle for å være det, og ikke bare hete
 * det, er tre ting: at den skiller mellom verdener, at den er en gyldig
 * log-sannsynlighet, og at den ikke stille returnerer 0 når rekonstruksjonen
 * feiler — en stille 0 ser ut som «helt normal verden».
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { logTroverdighet, lagTroverdighetsvekt } from "../src/moe2/troverdighet.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { lagRng } from "../src/kort.ts";
import { readFileSync } from "node:fs";

const nett = nettFraBytes(new Uint8Array(readFileSync("e1-modell/d7alle.bin")))[0]!;
const DIM = nett.lag[0]!.inn;
/** Atferdsmodellen: kortnettet vi allerede har. Ingen ny modell å trene. */
const modell = { logits: (s: GameState, sete: number) => forover(nett, e1SpillTrekk(s, sete, DIM)) };

/** Spiller fram til et punkt med minst `stikk` ferdige stikk. */
function fram(frø: number, stikk: number): GameState | null {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    if (s.fase === "SPILL" && s.stikkSpilt >= stikk && s.bord.length === 0) return s;
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) return null;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  return null;
}

test("likelihooden er en gyldig log-sannsynlighet: alltid <= 0", () => {
  let sjekket = 0;
  for (let g = 0; g < 8; g++) {
    const s = fram(7_700_000 + g * 7717, 4);
    if (s === null || s.iTur === null) continue;
    const verdener = trekkVerdener(s, s.iTur, 4, lagRng(g + 1), undefined, undefined, 3);
    for (const w of verdener) {
      const x = logTroverdighet(s, s.iTur, w, modell);
      if (!Number.isFinite(x)) continue;
      assert.ok(x <= 1e-9, `log-sannsynlighet skal vaere <= 0, fikk ${x}`);
      sjekket++;
    }
  }
  assert.ok(sjekket > 5, `for faa verdener sjekket (${sjekket})`);
});

test("den SKILLER mellom verdener - ellers er den en dyr nulloperasjon", () => {
  let ulike = 0;
  let stillinger = 0;
  for (let g = 0; g < 10; g++) {
    const s = fram(8_800_000 + g * 7717, 5);
    if (s === null || s.iTur === null) continue;
    const verdener = trekkVerdener(s, s.iTur, 6, lagRng(g * 13 + 3), undefined, undefined, 3);
    if (verdener.length < 2) continue;
    stillinger++;
    const v = verdener.map((w) => logTroverdighet(s, s.iTur!, w, modell));
    if (new Set(v.map((x) => x.toFixed(5))).size > 1) ulike++;
  }
  assert.ok(stillinger >= 4, `for faa stillinger (${stillinger})`);
  assert.ok(ulike > 0, "likelihooden ga IDENTISK verdi til alle verdener - den er doed");
});

/**
 * TEMPERATUREN MÅ VIRKE. `tau` er den ene parameteren som står igjen etter at
 * de fire håndsatte konstantene falt bort; gjør den ingenting, har vi byttet
 * fire gjetninger mot én som ikke engang er koblet.
 */
test("tau skjerper fordelingen: lav tau gir stoerre forskjeller", () => {
  const s = fram(9_900_000, 5);
  assert.ok(s !== null && s.iTur !== null);
  const verdener = trekkVerdener(s!, s!.iTur!, 6, lagRng(77), undefined, undefined, 3);
  const spenn = (tau: number): number => {
    const v = verdener.map((w) => logTroverdighet(s!, s!.iTur!, w, modell, { tau })).filter(Number.isFinite);
    return v.length < 2 ? 0 : Math.max(...v) - Math.min(...v);
  };
  const skarp = spenn(0.5);
  const myk = spenn(4);
  assert.ok(skarp >= myk, `lav tau skal gi minst like stort spenn (${skarp} mot ${myk})`);
});

/**
 * INGEN STILLE NULL. Er verdenen uforenlig med historikken, skal det SES.
 *
 * FOERSTE UTGAVE AV DENNE TESTEN VAR FEIL, og det er verdt aa notere: den ga
 * tomme hender og ventet -Infinity. Men med vindus-rekonstruksjon legges de
 * spilte kortene TILBAKE, saa tomme hender blir en gyldig (om enn merkelig)
 * verden. Testen maalte altsaa noe annet enn den trodde.
 *
 * Den ekte uforenligheten er en RENONSBRUDD: et sete som kastet av i vinduet,
 * men som verdenen gir kort i den ledede fargen. Da var avkastet ulovlig, og
 * verdenen kan umulig vaere sann.
 */
test("verden som bryter en observert renons gir -Infinity, ikke 0", () => {
  for (let g = 0; g < 12; g++) {
    const s = fram(5_500_000 + g * 7717, 6);
    if (s === null || s.iTur === null) continue;
    const alle = s.historikk;
    const sisteTo = alle.slice(Math.max(0, alle.length - 2));
    // Finn et avkast i vinduet: fulgte ikke ledfargen.
    let offer: { spiller: number; led: string } | null = null;
    for (const t of sisteTo) {
      const led = t.kort[0]!.kort.farge;
      for (const kp of t.kort) {
        if (kp.kort.farge !== led && kp.spiller !== s.iTur) {
          offer = { spiller: kp.spiller, led };
          break;
        }
      }
      if (offer) break;
    }
    if (offer === null) continue;

    const verdener = trekkVerdener(s, s.iTur, 3, lagRng(g + 41), undefined, undefined, 3);
    if (verdener.length === 0) continue;
    const w = verdener[0]!.map((h) => h.slice());
    // Gi offeret et kort i fargen det kastet av i — da var avkastet ulovlig.
    const fargeIdx = ["S", "H", "R", "K"].indexOf(offer.led);
    // Et kort som ingen andre har i denne verdenen.
    const brukt = new Set(w.flat());
    let plantet = -1;
    for (let v = 0; v < 13; v++) {
      const c = fargeIdx * 13 + v;
      if (!brukt.has(c)) { plantet = c; break; }
    }
    if (plantet < 0) continue;
    w[offer.spiller]!.push(plantet);

    const x = logTroverdighet(s, s.iTur, w, modell);
    assert.equal(x, Number.NEGATIVE_INFINITY, "renonsbrudd ble ikke oppdaget");

    // Men vekten skal fortsatt gi et TALL, saa trekningen har noe aa velge blant
    // selv om ALLE kandidatene skulle vaere uforenlige.
    const vekt = lagTroverdighetsvekt(s, s.iTur, modell);
    assert.ok(Number.isFinite(vekt({ hender: w })), "vekten ga ikke et endelig tall");
    return; // én gyldig konstruksjon er nok
  }
  assert.fail("fant ingen stilling med avkast i vinduet");
});
