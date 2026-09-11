import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { E1Agent } from "../src/e1/agent.ts";
import { FARGER, lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { ADAMS_MAALT, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { medVerden, standardMål, trekkVerdener } from "../src/moe2/sdkort.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { byggUtrullet, type Velger } from "../src/moe2/utrullet.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";

/**
 * K7.2 — DEN EKSAKTE LØSNINGEN MATES INN I PLANEN (11. sep).
 *
 * `sik:<rolle>:<σ>:<V>e<T>` lar søkets utspillinger løse resten av runden EKSAKT i hver
 * verden fra T stikk igjen (poengløseren: hvert sete maksimerer egne poeng), i stedet
 * for at nettet spiller den ferdig. Da er verdien søket rangerer på, i sluttspillet,
 * verdenens likevekt og ikke en policy-utspilling.
 *
 * Fila låser at verdiene FAKTISK er likevekten (regnet uavhengig fra roten), at av er
 * bit-identisk med før, og at bryteren når fram gjennom speken og appens bygger.
 */

const nevro = new NevroAgent();

function stillingerMed(igjen: number, antall: number): GameState[] {
  const ut: GameState[] = [];
  for (let f = 0; ut.length < antall && f < antall * 8; f++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_500_000 + f);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
      if (s.fase === "SPILL" && s.iTur !== null && s.giving.antallStikk - s.stikkSpilt === igjen && lovligeKort(s, s.iTur).length >= 2) {
        ut.push(s);
        break;
      }
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  return ut;
}

test("med e<T> ≥ stikkene igjen er hver verdens verdi poengløserens likevekt, regnet fra roten", () => {
  let sammenliknet = 0;
  for (const s of stillingerMed(3, 8)) {
    const sete = s.iTur!;
    const V = 4;
    const par = vurderPar(s, sete, nevro, { verdener: V, rng: lagRng(515), verdenKandidater: 3, eksaktBlad: 3 });
    assert.ok(par !== null);
    const verdener = trekkVerdener(s, sete, V, lagRng(515), undefined, undefined, 3, undefined, true);
    assert.equal(par.n, verdener.length);
    for (let w = 0; w < verdener.length; w++) {
      const s2 = medVerden(s, verdener[w]!, sete);
      const rot = poengRotVerdier({
        N: 4,
        trump: s2.trumf ? FARGER.indexOf(s2.trumf) : 0,
        hender: s2.hender.map((h) => h.map(kortTilInt)),
        iTur: sete,
        bord: s2.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) })),
        stikkFør: s2.stikkVunnet.slice(),
        ferdigeStikk: s2.stikkSpilt,
        totalStikk: s2.giving.antallStikk,
        budvinner: s2.budvinner!,
        makker: s2.makker,
        melding: s2.melding!,
        målPoeng: s2.regler.målPoeng,
        mål: "diff",
      });
      for (const rv of rot.verdier) {
        const k = par.kandidater.find((x) => kortTilInt(x.kort) === rv.kort);
        if (k === undefined) continue;
        const forventet = standardMål({ ...s2, totalPoeng: s2.totalPoeng.map((t, p) => t + (rv.poeng[p] ?? 0)) }, sete);
        assert.equal(k.perVerden[w], forventet, `verden ${w}, kort ${rv.kort}: søket fikk ${k.perVerden[w]}, likevekten er ${forventet}`);
        sammenliknet++;
      }
    }
  }
  assert.ok(sammenliknet >= 30, `for få sammenlikninger (${sammenliknet})`);
});

test("av (udefinert eller 0) er bit-identisk med utspilling med policyen", () => {
  for (const s of stillingerMed(5, 4)) {
    const sete = s.iTur!;
    const a = vurderPar(s, sete, nevro, { verdener: 3, rng: lagRng(77) });
    const b = vurderPar(s, sete, nevro, { verdener: 3, rng: lagRng(77), eksaktBlad: 0 });
    assert.deepEqual(b, a);
  }
});

test("med e<T> spiller policyen fram til T stikk igjen, og løseren tar resten", () => {
  // Fra 6 stikk igjen med e3: verdiene skal avvike fra ren utspilling i minst én verden
  // (ellers er bryteren død), og være endelige.
  let ulike = 0;
  for (const s of stillingerMed(6, 5)) {
    const sete = s.iTur!;
    const a = vurderPar(s, sete, nevro, { verdener: 3, rng: lagRng(91) })!;
    const b = vurderPar(s, sete, nevro, { verdener: 3, rng: lagRng(91), eksaktBlad: 3 })!;
    for (let i = 0; i < a.kandidater.length; i++) {
      for (let w = 0; w < a.n; w++) {
        assert.ok(Number.isFinite(b.kandidater[i]!.perVerden[w]!));
        if (a.kandidater[i]!.perVerden[w] !== b.kandidater[i]!.perVerden[w]) ulike++;
      }
    }
  }
  assert.ok(ulike > 0, "e3 endret ingen verdi fra seks stikk igjen – bryteren når ikke fram");
});

test("speken sik:…:<V>e<T> leses, avvises ved ugyldig T, og utenSøk stripper den", () => {
  const a = lagIndre(`sik:foerer:0.5:8k8e3L:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(a.eksaktBlad, 3);
  const b = lagIndre(`sik:foerer:0.5:8e4amin:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(b.eksaktBlad, 4);
  const c = lagIndre(`sik:foerer:0.5:8:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(c.eksaktBlad, null);
  assert.throws(() => lagIndre(`sik:foerer:0.5:8e0:${ADAMS_MAALT}`), /e<T>/);
  assert.equal(utenSøk(`sik:alle:0.5:24k32e3L:${ADAMS_MAALT}`), ADAMS_MAALT);
});

test("appens bygger og speken velger identisk med e3 i førersøket", () => {
  const SPEK =
    "vr:e1-modell/vrakrang.bin:telrd:sik:foerer:0.5:8e3:" +
    "budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";
  const kortBytes = new Uint8Array(readFileSync("e1-modell/d7alle.bin"));
  const vrakBytes = new Uint8Array(readFileSync("e1-modell/vrakrang.bin"));
  const budJson: unknown = JSON.parse(readFileSync("e1-modell/bud-vant.json", "utf8"));
  const bygde = [0, 1, 2, 3].map(
    () =>
      byggUtrullet({
        kortnett: nettFraBytes(kortBytes)[0]!,
        kort: E1Agent.fraBytes(kortBytes),
        vaktflagg: "abmp",
        bud: tolkBudmodell(budJson),
        budterskel: -3.0,
        vraknett: nettFraBytes(vrakBytes)[0]!,
        vrakflagg: "telrd",
        søk: { type: "sik", verdener: 8, sigma: 0.5, eksaktBlad: 3 },
      }).agent,
  );
  const spek = [0, 1, 2, 3].map(() => lagIndre(SPEK) as unknown as Velger);
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 61_000_021);
  let valg = 0;
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000 && s.rundeNr < 2) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const ha = spek[iTur]!.velgHandling(s);
    const hb = bygde[iTur]!.velgHandling(s);
    assert.deepEqual(hb, ha, `divergens i runde ${s.rundeNr}, fase ${s.fase}, sete ${iTur} etter ${valg} valg`);
    valg++;
    s = utfør(s, ha).state;
  }
  assert.ok(valg > 25, `for få valg sammenlignet (${valg})`);
});
