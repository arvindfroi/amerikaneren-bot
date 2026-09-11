/**
 * VISNINGSFRØET — samme stilling, samme valg; skjulte kort flytter ingenting (11. sep).
 *
 * Sikkerorakelet trakk verdenene fra ÉN strøm per instans. To kall på samme stilling
 * ga derfor ulike verdener og kunne gi ulike valg, og da kan ingen prøve skille støy
 * fra virkning: K2 (bytt de skjulte kortene — står valget?) og K4 (med og uten
 * hukommelse — endret noe seg?) måler begge RNG-tilstand i stedet for det de skal.
 * `k2-aldri-jukse.test.ts` sier det i hodet sitt og prøver derfor bare søkefrie speker.
 *
 * `D` i speken (`visningsfrø`) utleder strømmen for hver beslutning av det setet SER.
 * Fila låser:
 *
 *   1. AV: strømmen går som før, bit for bit, over en hel sekvens beslutninger.
 *   2. PÅ: strømmen er `lagRng(visningsfrø(stilling, sete, frø))`, uansett historikk.
 *   3. DETERMINISME: to kall gir samme valg og samme σ — og uten `D` gjør de ikke det.
 *   4. K2 FOR FRØET: bytt skjulte kort, og frøet står. Byttet må faktisk ha skjedd, og
 *      frøet må avhenge av det setet ser — ellers beviser likheten ingenting.
 *   5. K2 FOR VALGET: et SØKENDE Sikkerorakel velger likt i alle forenlige verdener.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener, type Utspiller } from "../src/moe2/sdkort.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { kanoniskVisning, Sikkerorakel, visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { kortTilInt } from "../src/solver/dds.ts";

type Indre = ConstructorParameters<typeof Sikkerorakel>[0];

const motpart = lagIndre(ADAMS_MAALT) as unknown as Utspiller;
const kortNavn = (h: Handling): string => (h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type);
/** Hendene som sorterte heltall — uavhengig av hvordan kortobjektene ble laget. */
const hendene = (s: GameState): string => JSON.stringify(s.hender.map((h) => h.map(kortTilInt).sort((a, b) => a - b)));

/** Kortvalg med minst to lovlige kort fra stikk 5, maks tre per giv. */
const STILLINGER: GameState[] = (() => {
  const ut: GameState[] = [];
  for (let g = 0; g < 6; g++) {
    const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s = opprettSpill({ antallSpillere: 4 }, 3_400_000 + g * 5171);
    let vakt = 0;
    let iGiv = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 5 && iGiv < 3 && lovligeKort(s, s.iTur).length >= 2) {
        ut.push(s);
        iGiv++;
      }
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
})();

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 10, `bare ${STILLINGER.length} stillinger`);
});

test("AV: instansens strøm går som før over en hel sekvens beslutninger", () => {
  const sik = new Sikkerorakel(lagIndre(ADAMS_MAALT) as unknown as Indre, motpart, { verdener: 3, sigma: 0 });
  const strøm = lagRng(20_260_804);
  for (const s of STILLINGER.slice(0, 6)) {
    const sete = s.iTur!;
    sik.velgHandling(s);
    const par = vurderPar(s, sete, motpart, { verdener: 3, rng: strøm });
    assert.equal(sik.siste?.n, par?.n ?? 0);
    assert.equal(sik.siste?.sigma, par?.sigma ?? 0);
  }
});

test("PÅ: strømmen er lagRng(visningsfrø(stilling, sete, frø)), uansett hva agenten har sett før", () => {
  const sik = new Sikkerorakel(lagIndre(ADAMS_MAALT) as unknown as Indre, motpart, {
    verdener: 3,
    sigma: 0,
    frø: 99,
    visningsfrø: true,
  });
  // Baklengs og så forlengs: historikken skal ikke bety noe.
  for (const s of [...STILLINGER.slice(0, 4).reverse(), ...STILLINGER.slice(0, 4)]) {
    const sete = s.iTur!;
    sik.velgHandling(s);
    const par = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(visningsfrø(s, sete, 99)) });
    assert.equal(sik.siste?.n, par?.n ?? 0);
    assert.equal(sik.siste?.sigma, par?.sigma ?? 0);
  }
});

test("DETERMINISME: med «D» gir to kall samme valg og σ; uten «D» gjør de ikke det", () => {
  const med = lagIndre(`sik:alle:0:3D:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  const uten = lagIndre(`sik:alle:0:3:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  let ulikUten = 0;
  for (const s of STILLINGER.slice(0, 8)) {
    const a = med.velgHandling(s);
    const σa = med.siste?.sigma;
    const b = med.velgHandling(s);
    assert.deepEqual(b, a);
    assert.equal(med.siste?.sigma, σa);

    uten.velgHandling(s);
    const σ1 = uten.siste?.sigma;
    uten.velgHandling(s);
    if (uten.siste?.sigma !== σ1) ulikUten++;
  }
  // FELLEN: uten «D» SKAL to kall kunne skille lag. Gjør de ikke det, kan prøven over
  // ikke skille et deterministisk søk fra et som bare tilfeldigvis traff likt.
  assert.ok(ulikUten > 0, "uten «D» ga to kall samme σ overalt – determinismeprøven kan ikke feile");
});

test("K2 FOR FRØET: skjulte kort byttes, frøet står — og det avhenger av det setet ser", () => {
  const F = 20_260_804;
  let byttet = 0;
  let prøvd = 0;
  const frøene = new Set<number>();
  for (const [g, s] of STILLINGER.entries()) {
    const sete = s.iTur!;
    const fasit = visningsfrø(s, sete, F);
    frøene.add(fasit);
    const verdener = trekkVerdener(s, sete, 4, lagRng(777_000 + g * 31), undefined, undefined, 4);
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      assert.deepEqual(s2.hender[sete], s.hender[sete], "medVerden endret observatørens egen hånd");
      assert.equal(kanoniskVisning(s2, sete), kanoniskVisning(s, sete));
      assert.equal(visningsfrø(s2, sete, F), fasit, "frøet flyttet seg da BARE skjulte kort ble byttet");
      // FELLEN: et frø som leste hele tilstanden ville flyttet seg her.
      if (hendene(s2) !== hendene(s)) byttet++;
      prøvd++;
    }
    // Frøet er setets eget: en annen stol ved samme bord ser noe annet.
    assert.notEqual(visningsfrø(s, (sete + 1) % 4, F), fasit);
    assert.notEqual(visningsfrø(s, sete, F + 1), fasit);
  }
  assert.ok(prøvd >= 20, `bare ${prøvd} verdener prøvd`);
  assert.ok(byttet > 0, "ingen verden byttet skjulte kort – likheten beviser ingenting");
  assert.ok(frøene.size > STILLINGER.length / 2, "frøet er nesten konstant – det leser ikke stillingen");
});

test("K2 FOR VALGET: et søkende Sikkerorakel med «D» velger likt i alle forenlige verdener", () => {
  const sik = lagIndre(`sik:alle:0:3D:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  const avvik: string[] = [];
  let sammenliknet = 0;
  for (const [g, s] of STILLINGER.entries()) {
    const sete = s.iTur!;
    const fasit = kortNavn(sik.velgHandling(s));
    const σ = sik.siste?.sigma;
    const verdener = trekkVerdener(s, sete, 3, lagRng(888_000 + g * 17), undefined, undefined, 4);
    for (const hender of verdener) {
      const valg = kortNavn(sik.velgHandling(medVerden(s, hender, sete)));
      if (valg !== fasit || sik.siste?.sigma !== σ) {
        avvik.push(`stilling ${g} sete ${sete}: ${fasit} (σ ${σ}) i den ekte, ${valg} (σ ${sik.siste?.sigma}) i en forenlig`);
      }
      sammenliknet++;
    }
  }
  assert.ok(sammenliknet >= 20, `bare ${sammenliknet} sammenlikninger`);
  assert.ok(sik.tellere.vurdert > 0, "søket vurderte ingenting – prøven måler bare nettet");
  assert.deepEqual(avvik, [], `JUKS ELLER STØY: valget avhenger av skjulte kort.\n${avvik.slice(0, 6).join("\n")}`);

  // FELLEN: frøet må BETY noe for søket. Gir et annet instansfrø samme σ overalt, er
  // likheten over ingen prøve av frøets invarians.
  const annet = new Sikkerorakel(lagIndre(ADAMS_MAALT) as unknown as Indre, motpart, { verdener: 3, sigma: 0, visningsfrø: true, frø: 1 });
  let ulik = 0;
  for (const s of STILLINGER.slice(0, 8)) {
    sik.velgHandling(s);
    annet.velgHandling(s);
    if (sik.siste?.sigma !== annet.siste?.sigma) ulik++;
  }
  assert.ok(ulik > 0, "et annet frø ga samme σ overalt – verdenene avhenger ikke av frøet");
});
