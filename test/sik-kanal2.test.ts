/**
 * KANAL 2 I `sik:`-STIEN — koblet, stum i førersetet, og bit-identisk når av.
 *
 * ================= HVA SOM VAR GALT =====================================
 *
 * Kanal 2 (budvinnerens vrak som bevis, `W<alfa>`) har vært bygd og målt siden
 * §111: +0,0046 ± 0,0004 nat mot «av» på troen, den nest sterkeste slutningen
 * prosjektet har etter renonsene. Men bokstaven ble bare lest i `amu:`-grenen,
 * og vekten bare bygd i `amuagent.ts`. `sik:` — søket helboten FAKTISK kjører —
 * leste den aldri, og `vurderPar` sendte en hardkodet `undefined` i
 * vrakvekt-sporet til `trekkVerdener`.
 *
 * Følgen: `analyse/koblingssjekk.txt` målte `W2 … 0 ulike *** IKKE KOBLET ***`,
 * og kanal 2 var stum i hvert eneste tall vi har målt på helboten. Det er
 * feilklassen `AdamsMax.md` linje 1106 fører som «kanal 2 nådde aldri fram fra
 * speken», og §99-mønsteret: en evne som ser levende ut fordi den finnes.
 *
 * ================= DE TRE TINGENE SOM MÅ HOLDE ==========================
 *
 *   1. AV ER AV. Uten «W», og med «W0», er hvert valg nøyaktig som før. Dette
 *      er det viktigste kravet: en ledningsjobb som stille flytter den målte
 *      boten er ikke en ledningsjobb, det er en ny bot.
 *   2. K2 — INGEN JUKS. Vekten leser `verden.vrakVerden`, altså de fire kortene
 *      SAMPLEREN la i den døde bingen i den innbilte verdenen — aldri
 *      budvinnerens virkelige vrak. Er observatøren SELV budvinneren, kjenner
 *      hun sitt eget vrak, `trekkVerden` setter `dødKapasitet = 0`, og vekten
 *      returnerer 0 per konstruksjon. Asymmetrien måles i begge ender: på
 *      vekten direkte, og på valgene i hennes sete.
 *   3. KOBLET. Med «W2» skal minst ett valg FLYTTE SEG i de andre setene.
 *      Ellers er ledningen fortsatt ikke koblet, uansett hva koden ser ut som.
 *
 * Nøyaktig denne asymmetrien er formen på lekkasjen som en gang ble funnet i
 * `medVerden` — en søkende agent som så budvinnerens ekte kort. Derfor står
 * punkt 2 her som en prøve og ikke som en kommentar.
 *
 * Små tall med vilje: CPU-en deles med treningen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
// SAMME konvertering som sampleren selv bruker. En egen kort-til-tall-koding her
// ville vært nøyaktig duplikatklassen kommentaren over importen i sdkort.ts advarer mot.
import { kortTilInt } from "../src/solver/dds.ts";
import { trekkVerden, vrakLogVekt, type Vrakvekt } from "../src/solver/sampler.ts";

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";
/** `sik:<rolle>:<sigma>:<verdener>:<indre>`. `alle` så kanal 2 kan fyre utenfor førersetet. */
const spek = (knott: string): string => `sik:alle:0.5:6k8${knott}:${NETT}`;
const V: Vrakvekt = { alfa: 2, beta: 0 };

interface Avvik {
  /** Valg tatt i budvinnerens EGET sete. */
  readonly bvN: number;
  readonly bvUlik: number;
  /** Valg tatt i de tre andre setene. */
  readonly andreN: number;
  readonly andreUlik: number;
}

/**
 * Spiller ÉN kamp og spør begge spekene ved hver beslutning, som
 * `examples/koblingssjekk.ts`. Spillet drives av A sitt valg, så B vurderes
 * alltid på nøyaktig samme stilling — ellers ville de to armene skilt lag etter
 * første avvik og resten av tellingen vært meningsløs.
 *
 * Begge armene får spørsmålet ved hver beslutning, også der de er enige. Det er
 * ikke sløsing: agentene har en RNG som går framover per kall, og hopper den ene
 * over et kall, måler resten av kampen RNG-drift i stedet for kanal 2.
 */
function avvik(a: string, b: string, runder: number, frø: number): Avvik {
  const A = [0, 1, 2, 3].map(() => lagIndre(a));
  const B = [0, 1, 2, 3].map(() => lagIndre(b));
  for (const x of [...A, ...B]) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  let vakt = 0;
  let r = 0;
  let bvN = 0;
  let bvUlik = 0;
  let andreN = 0;
  let andreUlik = 0;
  while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const x of [...A, ...B]) x.velgHandling(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const fase = s.fase;
    const bv = s.budvinner;
    const ha = A[iTur]!.velgHandling(s);
    const hb = B[iTur]!.velgHandling(s);
    // Bare SPILL teller: sikkerorakelet griper ikke inn i bud, vrak eller trumfvalg,
    // så et avvik der ville kommet fra noe annet enn kanal 2.
    if (fase === "SPILL") {
      const ulik = JSON.stringify(ha) !== JSON.stringify(hb) ? 1 : 0;
      if (iTur === bv) {
        bvN++;
        bvUlik += ulik;
      } else {
        andreN++;
        andreUlik += ulik;
      }
    }
    s = utfør(s, ha).state;
  }
  return { bvN, bvUlik, andreN, andreUlik };
}

/** Spiller fram til en SPILL-stilling med kjent budvinner og minst `stikk` ferdige stikk. */
function spillStilling(frø: number, stikk: number): GameState {
  const bot = [0, 1, 2, 3].map(() => lagIndre(NETT));
  for (const x of bot) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "SPILL" && s.budvinner !== null && s.historikk.length >= stikk) return s;
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, bot[iTur]!.velgHandling(s)).state;
  }
  throw new Error(`Fant ingen SPILL-stilling med budvinner for frø ${frø}`);
}

// ===========================================================================
// 1. AV ER AV — det viktigste kravet i hele endringen
// ===========================================================================

test("kanal 2: «W0» og ingen «W» gir NØYAKTIG samme valg — bit-identisk med før", () => {
  for (const frø of [4_100_001, 4_100_002]) {
    const d = avvik(spek(""), spek("W0"), 2, frø);
    assert.equal(
      d.bvUlik + d.andreUlik,
      0,
      `W0 flyttet ${d.bvUlik + d.andreUlik} valg av ${d.bvN + d.andreN} (frø ${frø}) — ` +
        "da er «av» ikke av, og hvert målt tall på helboten er i spill",
    );
    assert.ok(d.bvN + d.andreN > 0, "prøven må faktisk ha målt noen valg");
  }
});

test("kanal 2: speken bygger vekten, og «W0» bygger INGEN vekt", () => {
  /**
   * Leses av ORAKELET speken bygger, ikke av et håndlaget objekt: det er nettopp
   * leddet spek → orakel som var brutt, og en prøve som bygger orakelet selv ville
   * ikke merket det.
   *
   * `{ alfa: 0 }` ville lagt et ledd på null inn i log-summen. Det er matematisk det
   * samme, men ikke STRUKTURELT det samme: da er argumentet til `trekkVerdener` ikke
   * lenger `undefined`, og «bit-identisk» hviler på en flyttallsantakelse i stedet for
   * på at koden gjør nøyaktig som før.
   */
  const vekten = (s: string): Vrakvekt | null =>
    (lagIndre(s) as unknown as { vrakvekt: Vrakvekt | null }).vrakvekt;
  assert.equal(vekten(spek("")), null, "uten «W» skal vekten være null");
  assert.equal(vekten(spek("W0")), null, "«W0» skal gi null, ikke { alfa: 0 }");
  assert.deepEqual(vekten(spek("W2")), { alfa: 2, beta: 0 }, "beta er MÅLT og IKKE adoptert - den skal stå på 0");
  assert.deepEqual(vekten(spek("W1")), { alfa: 1, beta: 0 });
  // «W» skal kunne stå sammen med de andre knottene uten å spise dem.
  assert.deepEqual(vekten("sik:alle:0.5:6k8e3LMDW2:" + NETT), { alfa: 2, beta: 0 });
  assert.equal(vekten("sik:alle:0.5:6k8e3LMD:" + NETT), null);
});

test("kanal 2: «W» avviser tull i stedet for å tie", () => {
  assert.throws(() => lagIndre(spek("W")), /Ugyldig «W»/, "«W» uten tall må kaste");
  assert.throws(() => lagIndre(spek("W-1")), /Ugyldig «W»/, "negativ alfa må kaste");
});

// ===========================================================================
// 2. K2 — VEKTEN KAN IKKE SE BUDVINNERENS EKTE VRAK
// ===========================================================================

test("K2: i budvinnerens EGET sete er den døde bingen tom og vekten er 0 per konstruksjon", () => {
  let sett = 0;
  for (const frø of [5_200_001, 5_200_002, 5_200_003]) {
    const s = spillStilling(frø, 1);
    const bv = s.budvinner!;
    const rng = lagRng(frø ^ 0x5f5f);
    for (let i = 0; i < 8; i++) {
      const verden = trekkVerden(s, bv, rng);
      if (verden === null) continue;
      sett++;
      assert.equal(
        verden.vrakVerden.length,
        0,
        "budvinneren kjenner sitt eget vrak - da finnes det ingen død binge å gjette på",
      );
      assert.equal(
        vrakLogVekt(s, verden, V),
        0,
        "kanal 2 må være STRUKTURELT stum i førersetet, ikke bare svak der",
      );
    }
  }
  assert.ok(sett > 0, "prøven må faktisk ha trukket noen verdener");
});

test("K2: i de ANDRE setene er bingen GJETTET, og vekten leser gjetningen - ikke sannheten", () => {
  let fyrte = 0;
  let sett = 0;
  for (const frø of [5_200_001, 5_200_002, 5_200_003]) {
    const s = spillStilling(frø, 1);
    const bv = s.budvinner!;
    const ekte = new Set(s.vrak.map(kortTilInt));
    const andre = [0, 1, 2, 3].filter((p) => p !== bv);
    const rng = lagRng(frø ^ 0x2323);
    let treff = 0;
    let trukket = 0;
    for (let i = 0; i < 18; i++) {
      const sete = andre[i % andre.length]!;
      const verden = trekkVerden(s, sete, rng);
      if (verden === null) continue;
      sett++;
      trukket++;
      // Bingen finnes for de andre — det er nettopp det som gjør kanal 2 mulig der.
      assert.equal(verden.vrakVerden.length, s.giving.talong, "den døde bingen skal ha talongens størrelse");
      if (vrakLogVekt(s, verden, V) !== 0) fyrte++;
      if (verden.vrakVerden.length > 0 && verden.vrakVerden.every((c) => ekte.has(c))) treff++;
    }
    /**
     * INGEN JUKS: at den gjettede bingen av og til treffer det ekte vraket er
     * uunngåelig og helt greit — det er en gjetning som KAN være riktig. Feilen
     * ville vært at den ALLTID traff, altså at sampleren fikk se fasiten.
     */
    assert.ok(
      treff < trukket,
      `sampleren gjenskapte det ekte vraket i alle ${trukket} verdener (frø ${frø}) - da ser den fasiten`,
    );
  }
  assert.ok(sett > 0, "prøven må faktisk ha trukket noen verdener");
  assert.ok(fyrte > 0, "vekten fyrte aldri utenfor førersetet - da måler prøven ingenting");
});

// ===========================================================================
// 3. KOBLET — og stum i førersetet, målt på VALGENE
// ===========================================================================

test("kanal 2 er KOBLET i sik-stien: «W2» flytter valg i de andre setene", () => {
  let andreUlik = 0;
  let andreN = 0;
  let bvUlik = 0;
  let bvN = 0;
  for (const frø of [4_100_001, 4_100_002, 4_100_003]) {
    const d = avvik(spek(""), spek("W2"), 2, frø);
    andreUlik += d.andreUlik;
    andreN += d.andreN;
    bvUlik += d.bvUlik;
    bvN += d.bvN;
  }
  assert.ok(
    andreUlik > 0,
    `«W2» endret 0 av ${andreN} valg utenfor førersetet — ledningen er FORTSATT ikke koblet ` +
      "(det var nøyaktig dette analyse/koblingssjekk.txt målte før fiksen)",
  );
  /**
   * OG DEN MÅ VÆRE STUM DER HUN SITTER SELV. Dette er K2-asymmetrien målt på
   * valgene i stedet for på vekten: 0 avvik i budvinnerens eget sete er ikke en
   * svakhet, det er beviset på at hun ikke får se sitt eget vrak på nytt.
   */
  assert.equal(
    bvUlik,
    0,
    `«W2» flyttet ${bvUlik} av ${bvN} valg i budvinnerens EGET sete - der skal vekten være 0 ` +
      "per konstruksjon, og et avvik betyr at hun leser noe hun ikke skal se",
  );
  assert.ok(bvN > 0, "prøven må ha målt noen valg i førersetet også");
});
