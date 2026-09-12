/**
 * ÉN ANTATT POLICY PER SETE (`~lik=…,<fil>@<sete>`, `src/moe2/agentspek.ts`) — 12. sep.
 *
 * Likelihood-vekten (agent V) spurte «hvilken giv ville fått DEM til å spille slik?» med ÉN
 * antatt policy for hele bordet. Sitter det et kjent menneske der, er den antakelsen beviselig
 * feil, og setefeltet finnes for å kunne legge en MODELL AV HAM på nettopp hans sete.
 *
 * Fire ting må holde, og de er ikke de samme:
 *
 *   1. SETET NÅS. En policy lagt på sete X må gi et ANNET svar enn den samme policyen lagt på
 *      sete Y. Gjør den ikke det, er setefeltet pynt og hele målingen måler basen.
 *   2. EGET SETE ER EN NULLOPERASJON. Observatørens egne handlinger scores aldri
 *      (`logLikelihood` hopper over dem), så en policy lagt på HANS sete må gi BIT-IDENTISK
 *      svar. Det er den ene plassen vi vet fasiten på forhånd, og derfor den skarpeste prøven
 *      på at oppslaget går på setet og ikke på noe annet.
 *   3. K2. Med en setepolicy koblet på skal det vektede verdenssettet fortsatt være
 *      bit-identisk når BARE de skjulte kortene byttes. FELLE: en vekt som leser en ekte hånd
 *      må bli tatt av samme løkke — ellers vet vi ikke om den grønne prøven betyr «blind»
 *      eller «måler ingenting».
 *   4. STANDARDSTIEN. Uten setefelt er speken som før, og feilformene kastes i stedet for å
 *      bli tiet i hjel.
 *
 * Små tall med vilje: CPU-en deles med treningen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { intTilKort, kortTilInt } from "../src/solver/dds.ts";
import { ADAMS, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagLikvekt, logLikelihood } from "../src/moe2/likvekt.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { trekkVerden, type Verden } from "../src/solver/sampler.ts";

/** Bordets policy. `ANNEN` er en beviselig ULIK, søkfri policy — «den andre spilleren». */
const BORD = ADAMS;
const ANNEN = "nevro";
const policy = lagIndre(BORD);
const annen = lagIndre(ANNEN);

/**
 * `~lik=@<fil>` og setefeltet leser en spek FRA FIL. Skrives her, så prøven ikke trenger modeller.
 *
 * RELATIVE STIER MED VILJE. Spekfeltet deles på kolon, så en Windows-sti («C:/Users/…») ville
 * blitt lest som knotter — «C» først. Det er ikke en svakhet prøven skal gå utenom, det er
 * regelen speken har fra før: «Stien kan ikke inneholde kolon (bruk relativ sti)», samme som
 * `~mlbu=` og `okt:profil=`. Prøven bruker derfor formen produksjonen faktisk bruker.
 */
const KAT = "analyse/lik-per-sete";
mkdirSync(KAT, { recursive: true });
const FIL_ANNEN = `${KAT}/annen.spek`;
const FIL_SOEK = `${KAT}/soek.spek`;
const FIL_TOM = `${KAT}/tom.spek`;
writeFileSync(FIL_ANNEN, `${ANNEN}\n`);
writeFileSync(FIL_SOEK, `sik:alle:0:4:${ADAMS}\n`);
writeFileSync(FIL_TOM, "   \n");

interface Stilling {
  readonly s: GameState;
  readonly sete: number;
}

/** Kortvalg med minst to lovlige kort, fra noen giv spilt av `BORD`. Som i `lik-vekt.test.ts`. */
function samle(frøene: readonly number[]): Stilling[] {
  const ut: Stilling[] = [];
  const agenter = [0, 1, 2, 3].map(() => lagIndre(BORD));
  for (const frø of frøene) {
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (s.fase === "SPILL" && s.iTur !== null && s.stikkSpilt >= 1 && lovligeKort(s, s.iTur).length >= 2) {
        ut.push({ s, sete: s.iTur });
      }
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const STILLINGER: Stilling[] = samle([8_120_901, 8_120_902, 8_120_903]);

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 20, `bare ${STILLINGER.length} stillinger`);
});

/**
 * log P(observasjonene | DEN SANNE GIVEN) med `annen` på `påSete` og `policy` ellers.
 *
 * Den sanne given, ikke en trukket verden: da er tallet en ren funksjon av hvilken policy som
 * ble antatt for hvem, og ingen samplingstøy kan skjule at setefeltet ikke virker.
 */
function medSetepolicy(st: Stilling, påSete: number | null): number {
  const ekte = st.s.hender.map((h) => h.map(kortTilInt));
  return logLikelihood(st.s, st.sete, ekte, (p) => (p === påSete ? annen : policy), {});
}

// ===========================================================================
// 1 og 2: setet nås, og eget sete er en nulloperasjon
// ===========================================================================

test("SETET NÅS: samme policy på ULIKE seter gir ulikt svar — og på EGET sete ingen forskjell", () => {
  let ulikeSeter = 0;
  let egetLikt = 0;
  let prøvd = 0;
  for (const st of STILLINGER) {
    const grunn = medSetepolicy(st, null);
    if (!Number.isFinite(grunn)) continue;
    prøvd++;

    /**
     * EGET SETE: `logLikelihood` scorer aldri observatørens egne handlinger, så en annen policy
     * der MÅ gi nøyaktig samme tall. Er den ikke bit-identisk, treffer oppslaget feil sete.
     */
    assert.equal(
      medSetepolicy(st, st.sete),
      grunn,
      `en policy lagt på observatørens EGET sete (${st.sete}) endret svaret – oppslaget treffer feil sete`,
    );
    egetLikt++;

    // ANDRE SETER: minst ett av dem må kunne flytte tallet, ellers er feltet pynt.
    const andre = [0, 1, 2, 3].filter((p) => p !== st.sete);
    const verdier = andre.map((p) => medSetepolicy(st, p));
    if (new Set(verdier).size > 1) ulikeSeter++;
  }
  assert.ok(prøvd >= 15, `bare ${prøvd} stillinger prøvd`);
  assert.equal(egetLikt, prøvd, "eget-sete-kontrollen kjørte ikke i alle stillingene");
  assert.ok(
    ulikeSeter >= 5,
    `FELLE: samme policy på ulike seter ga samme svar overalt (${ulikeSeter} av ${prøvd} skilte seg) – ` +
      `setefeltet når ikke fram, eller de to policyene er for like til at prøven måler noe`,
  );
});

// ===========================================================================
// 3: K2 og fella, med en setepolicy koblet på
// ===========================================================================

const V = 6;
const KAND = 16;
const settFor = (st: Stilling, s: GameState, vekt: ((v: Verden) => number) | undefined, frø: number): number[][][] =>
  trekkVerdener(s, st.sete, V, lagRng(frø), undefined, vekt, KAND, undefined, true);

/** Stillingen med de SKJULTE kortene stokket om — det observatøren ser er uendret. */
function byttSkjult(st: Stilling): GameState[] {
  const { s, sete } = st;
  const ut: GameState[] = [];
  const a = (sete + 1) % 4;
  const b = (sete + 2) % 4;
  if (s.hender[a]!.length > 0 && s.hender[b]!.length > 0) {
    const hender = s.hender.map((h) => [...h]);
    const x = hender[a]![0]!;
    hender[a]![0] = hender[b]![0]!;
    hender[b]![0] = x;
    ut.push({ ...s, hender });
  }
  if (s.vrak.length > 0 && sete !== s.budvinner && s.hender[a]!.length > 0) {
    const hender = s.hender.map((h) => [...h]);
    const vrak = [...s.vrak];
    const x = hender[a]![0]!;
    hender[a]![0] = vrak[0]!;
    vrak[0] = x;
    ut.push({ ...s, hender, vrak });
  }
  ut.push({ ...s, talong: [{ farge: "S", verdi: 14 }] });
  return ut;
}

/** Vekten med `annen` på ett motstandersete og `policy` på resten. */
const vektMedSete = (st: Stilling, s: GameState): ((v: Verden) => number) | null => {
  const på = (st.sete + 1) % 4;
  return lagLikvekt(s, st.sete, (p) => (p === på ? annen : policy), {});
};

test("K2: med en SETEPOLICY er verdenssettet bit-identisk når bare de skjulte kortene byttes", () => {
  let prøvd = 0;
  let ulikeVekter = 0;
  for (const st of STILLINGER) {
    const v1 = vektMedSete(st, st.s);
    if (v1 === null) continue;
    const frø = 5_353 + prøvd;
    const fasit = settFor(st, st.s, v1, frø);

    // Kontroll: vekten skal SKILLE mellom verdener, ellers beviser likheten ingenting.
    const r = lagRng(frø);
    const verdier = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const w = trekkVerden(st.s, st.sete, r);
      if (w !== null) verdier.add(v1(w));
    }
    if (verdier.size > 1) ulikeVekter++;

    for (const annenS of byttSkjult(st)) {
      const v2 = vektMedSete(st, annenS);
      assert.ok(v2 !== null, "vekten forsvant da de skjulte kortene ble byttet");
      assert.deepEqual(
        settFor(st, annenS, v2, frø),
        fasit,
        `JUKS: verdenssettet endret seg da bare de SKJULTE kortene ble byttet ` +
          `(stikk ${st.s.stikkSpilt}, sete ${st.sete}). Ett avvik er nok.`,
      );
    }
    prøvd++;
  }
  assert.ok(prøvd >= 15, `bare ${prøvd} stillinger prøvd — beviser ingenting`);
  assert.ok(ulikeVekter >= 5, `vekten var konstant i alle stillinger (${ulikeVekter} med spredning)`);
});

test("K2 KAN FEILE: en setepolicy-vekt som ser de EKTE hendene blir tatt", () => {
  let tatt = 0;
  let prøvd = 0;
  for (const st of STILLINGER.slice(0, 12)) {
    const { s, sete } = st;
    const a = (sete + 1) % 4;
    /** Den minste tenkelige lekkasjen, lagt på det setet setepolicyen gjelder. */
    const jukser = (t: GameState) => (v: Verden): number =>
      t.hender[a]![0] !== undefined &&
      (v.hender[a] ?? []).some((c) => kortIndeks(intTilKort(c)) === kortIndeks(t.hender[a]![0]!))
        ? 0
        : -5;
    const frø = 9_700 + prøvd;
    const fasit = settFor(st, s, jukser(s), frø);
    for (const annenS of byttSkjult(st)) {
      prøvd++;
      try {
        assert.deepEqual(settFor(st, annenS, jukser(annenS), frø), fasit);
      } catch {
        tatt++;
      }
    }
  }
  assert.ok(
    tatt > 0,
    `en vekt som leser en ekte hånd ble IKKE tatt i ${prøvd} sammenlikninger — da måler K2-prøven over ingenting`,
  );
});

// ===========================================================================
// 4: speken
// ===========================================================================

const bygg = (f: string): Sikkerorakel => lagIndre(`sik:alle:0:4k8${f}:${ADAMS}`) as unknown as Sikkerorakel;

test("speken: setefeltet bygger, og standardstien er urørt", () => {
  const uten = bygg("");
  assert.equal(uten.likFor, null, "standardstien har fått en likelihood-vekt den ikke ba om");

  const med = bygg(`~lik=selv,${FIL_ANNEN}@1`);
  assert.ok(med.likFor !== null, "«<fil>@<sete>» ga ingen vekt");
  // Feltantallet er uendret, så strippingen er som før.
  assert.equal(utenSøk(`sik:alle:0:4k8~lik=selv,${FIL_ANNEN}@1:${ADAMS}`), ADAMS);

  // Knottene skal fortsatt virke SAMMEN med setefeltet.
  assert.ok(bygg(`~lik=selv,${FIL_ANNEN}@1,f7,t0.5,v2`).likFor !== null);
  assert.ok(bygg(`~lik=@${FIL_ANNEN},${FIL_ANNEN}@2`).likFor !== null, "basen fra fil + setepolicy");
});

test("speken: feilformene kastes, ikke ties i hjel", () => {
  assert.throws(() => bygg(`~lik=selv,${FIL_ANNEN}@1,${FIL_ANNEN}@1`), /to policyer/, "samme sete to ganger");
  assert.throws(() => bygg(`~lik=selv,${FIL_ANNEN}@9`), /Ugyldig setepolicy/, "sete utenfor bordet");
  assert.throws(() => bygg(`~lik=selv,@1`), /Ugyldig setepolicy/, "tom sti");
  assert.throws(() => bygg(`~lik=selv,${FIL_SOEK}@1`), /søker/, "en setepolicy som SØKER");
  assert.throws(() => bygg(`~lik=selv,${FIL_TOM}@1`), /tom/, "en tom fil");
  // De gamle feilene står.
  assert.throws(() => bygg("~lik=selv,q3"), /Ukjent knott/);
  assert.throws(() => bygg("~lik=annet"), /selv/);
});

test("speken: setet NÅR fram til σ — samme klone på to ulike seter gir ulik vurdering", () => {
  /**
   * FELLA denne prøven er bygget mot: en parser som leser `<fil>@<sete>`, godtar det og så
   * bruker basen for alle setene likevel. Da ville alt over vært grønt — men speken hadde
   * målt noe annet enn den sier. Her går det gjennom HELE veien: spek → `likFor` → `lagLikvekt`
   * → `vurderPar` → σ.
   */
  const a = bygg(`~lik=selv,${FIL_ANNEN}@1`);
  const b = bygg(`~lik=selv,${FIL_ANNEN}@2`);
  let ulik = 0;
  let prøvd = 0;
  for (const st of STILLINGER.slice(0, 10)) {
    a.velgHandling(st.s);
    b.velgHandling(st.s);
    if (a.siste === null || b.siste === null) continue;
    prøvd++;
    if (a.siste.sigma !== b.siste.sigma) ulik++;
  }
  assert.ok(prøvd >= 5, `bare ${prøvd} vurderinger`);
  assert.ok(ulik > 0, `klonen på sete 1 og på sete 2 ga samme σ i alle ${prøvd} stillingene — setet når ikke søket`);
});
