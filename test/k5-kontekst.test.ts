/**
 * K5 — FORSTÅ KONTEKSTEN I SPILLET OG TILPASSE SEG.
 *
 * Arvind: «forstå konteksten i spillet og tilpasse seg.»
 *
 * `AdamsMax.md` skriver prøven ut i klartekst: SAMME KORT, SAMME STIKK, ULIK
 * KAMPSTILLING — 20 poeng bak mot 20 foran ved 70–90 av 100. Adams må velge
 * ULIKT. Å ligge under skal gi mer risiko, å lede mindre.
 *
 * ================= HVORFOR PRØVEN IKKE FANTES ===========================
 *
 * Fordi den var UMULIG å kjøre, ikke fordi den var uinteressant:
 *
 *     const framdrift = Math.min(1, Math.max(egne, beste) / mål);
 *     if (framdrift < 0.3) return 0;
 *
 * Hver gate2-giv starter på 0–0. `framdrift` er 0, `racepress` returnerer
 * eksakt null, og `racescore` faller tilbake til snittet. `r0.4` i ADAMS_V6 og
 * ADAMS_V7 har derfor aldri vært kjørt én eneste gang i noen måling. Den er
 * ikke målt til null — den har aldri fått lov til å fyre.
 *
 * Denne prøven konstruerer kampstillingen i stedet for å vente på at benken
 * skal produsere den: stillingen spilles fram på vanlig vis fra 0–0, og så
 * settes `totalPoeng` direkte. Alt annet er bit-identisk.
 *
 * ================= DEN MÅ KUNNE FEILE, OG HER ER HVORDAN ================
 *
 * En prøve som ikke kan feile er ikke en prøve. Denne har tre måter:
 *
 *   KONTROLLARMEN gir de to armene BIT-IDENTISKE tilstander. Måler den noe
 *   annet enn eksakt 0, kommer forskjellene fra RNG eller agentbygging og ikke
 *   fra kampstillingen — og da er hvert tall i fila ugyldig. Dette er dette
 *   oppsettets 0,2500.
 *
 *   NULLPUNKTET: λ=0 i begge armer må gi eksakt samme valg. `racescore` med
 *   λ=0 er nøyaktig snittet, og «av» må være bit-identisk med av.
 *
 *   RETNINGEN er en egen påstand fra kravet, ikke en bonus. «Ulikt valg» er
 *   ikke nok — bak skal gi MER varians, ledelse MINDRE. Snur fortegnet, feiler
 *   prøven selv om valgene er aldri så ulike.
 *
 * ================= OG DEN MÅTTE SKILLE TO KANALER =======================
 *
 * Adams ser kampstillingen på to uavhengige måter, og en prøve som bare
 * sammenlikner 70–90 mot 90–70 kan ikke si hvilken som virker:
 *
 *   1. NETTET selv. `src/nevro/trekk.ts` fyller trekk 231/232 med egen og
 *      beste motstanders poengandel. Kanalen har alltid vært der.
 *   2. RACEPRESSET i alpha-muens score — det `r0.4` skrur på.
 *
 * Derfor holder prøven STILLINGEN FAST og varierer λ i stedet. Det er den
 * eneste sammenlikningen der racepresset er alene om å skille armene.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { appendFileSync, mkdirSync } from "node:fs";

import { opprettSpill } from "../src/index.ts";
import { racepress, racescore } from "../src/moe2/race.ts";
import { målK5, type K5Resultat } from "../examples/k5-kontekst.ts";

/**
 * SMÅ TALL MED VILJE. Hver stilling koster to alpha-mu-søk med 12 verdener og
 * 16 kandidater, og prøven kjøres i `npm test`. Tre giv gir seks stillinger,
 * og hver stilling er en HEL sammenlikning — ikke et støymål som må midles.
 * Kontrollarmen er eksakt, ikke statistisk, så n trenger ikke være stort.
 */
const GIVER = 3;
const FRØ = 5_100_000;
const LAMBDA = 0.4;
const RAPPORT = "analyse/k5-kontekst-test.txt";

const linjer: string[] = [`# K5-proeven kjoert ${new Date().toISOString()} (giv ${GIVER}, froe ${FRØ})`];

function loggfør(navn: string, r: K5Resultat): K5Resultat {
  linjer.push(
    `${navn.padEnd(44)} n=${String(r.stillinger).padEnd(3)} ulike=${String(r.ulike).padEnd(3)} ` +
      `press ${r.pressBak.toFixed(3)}/${r.pressForan.toFixed(3)}  ` +
      `spred ${r.spredBak?.toFixed(3) ?? "-"}/${r.spredForan?.toFixed(3) ?? "-"}  ` +
      `racejustert=${r.racejustert}`,
  );
  return r;
}

process.on("exit", () => {
  // MÅLERESULTAT TIL VARIG FIL, aldri bare til stdout. `node --test` sluker
  // konsollen, så uten dette ville tallene prøven bygger på vært borte.
  try {
    mkdirSync("analyse", { recursive: true });
    appendFileSync(RAPPORT, linjer.join("\n") + "\n\n");
  } catch {
    /* en rapport som ikke lar seg skrive skal ikke velte prøven */
  }
});

/**
 * HVER ARM KJØRES ÉN GANG. Et alpha-mu-søk med 12 verdener koster ~1 s under
 * last, og to tester som stiller samme spørsmål skal ikke betale for det to
 * ganger — de skal se på NØYAKTIG samme tall, ellers kan de være uenige.
 */
const buf = new Map<string, K5Resultat>();
const husk = (nøkkel: string, lag: () => K5Resultat): K5Resultat => {
  if (!buf.has(nøkkel)) buf.set(nøkkel, loggfør(nøkkel, lag()));
  return buf.get(nøkkel)!;
};

/** BAK 70–90 mot FORAN 90–70, λ=0.4. Det AdamsMax.md ber om, ordrett. */
const kontekst = (): K5Resultat =>
  husk("BAK 70-90 mot FORAN 90-70 (l=0.4)", () =>
    målK5({ giver: GIVER, frøBase: FRØ, lambda: LAMBDA, egne: 70, motstander: 90 }),
  );

/** Fast stilling, λ=0 mot λ. Racepresset ALENE om å skille armene. */
const lambdaarm = (stillingFor: "bak" | "foran", lambda = LAMBDA): K5Resultat =>
  husk(`FAST ${stillingFor === "bak" ? "70-90 (bak)" : "90-70 (foran)"}, l=0 mot l=${lambda}`, () =>
    målK5({
      giver: GIVER,
      frøBase: FRØ,
      lambda,
      egne: 70,
      motstander: 90,
      sammenlikn: "lambda",
      stillingFor,
    }),
  );

/**
 * SELVE DOMMEN, som én funksjon.
 *
 * Den står for seg fordi den brukes to ganger: én gang på knotten slik den er,
 * og én gang på en knott som er VENDT FEIL VEI. Er de to kallene ikke nøyaktig
 * samme kriterium, beviser ikke det andre at det første kan feile.
 */
const bestårRetning = (r: K5Resultat): boolean =>
  r.ulike > 0 && r.spredBak !== null && r.spredForan !== null && r.spredForan <= r.spredBak + 1e-9;

test("K5: diagnosen - i hver maaling prosjektet har gjort er racepresset EKSAKT null", () => {
  /**
   * Dette er hele grunnen til at proeven ikke fantes, og det tar ett kall aa
   * vise. Gate 2 spiller fra 0-0, og da er `framdrift` 0:
   *
   *     if (framdrift < 0.3) return 0;
   *
   * `racescore` faller da tilbake paa snittet uansett hva lambda er, saa
   * «r0.4» i ADAMS_V6 og ADAMS_V7 er bit-identisk med aa ikke ha parameteren.
   */
  const s = opprettSpill({ antallSpillere: 4 }, 5_100_000);
  for (let sete = 0; sete < 4; sete++) {
    assert.equal(racepress(s, sete), 0, `racepresset var ikke null ved 0-0 i sete ${sete}`);
  }
  const v = [1, 4, 9, 16];
  assert.equal(
    racescore(v, racepress(s, 0), 0.4),
    racescore(v, 0, 0),
    "med press = 0 maa racescore vaere NOEYAKTIG snittet - ellers lekker knotten inn i gate 2",
  );
  // Og ved 20-90 av 100 er den ikke null lenger. Uten dette leddet ville testen
  // over vaert groenn ogsaa for en `racepress` som alltid returnerer 0.
  const sent = { ...s, totalPoeng: [70, 90, 0, 0] };
  assert.ok(racepress(sent, 0) > 0.3, "racepresset fyrer ikke engang ved 70-90 - da er knotten doed");
  linjer.push(`racepress 0-0 = 0 (alle seter); racepress 70-90 = ${racepress(sent, 0).toFixed(3)}`);
});

test("K5: KONTROLLARMEN maaler eksakt null - ellers er ingenting annet gyldig", () => {
  const r = husk("KONTROLL (bit-identiske armer)", () =>
    målK5({
      giver: GIVER,
      frøBase: FRØ,
      lambda: LAMBDA,
      egne: 70,
      motstander: 90,
      likStilling: true,
    }),
  );
  assert.ok(r.stillinger >= 5, `proeven fikk bare ${r.stillinger} stillinger - beviser ingenting`);
  assert.equal(
    r.ulike,
    0,
    `KONTROLLARMEN ER IKKE NULL: ${r.ulike} av ${r.stillinger} valg endret seg selv om ` +
      `de to armene fikk BIT-IDENTISKE tilstander. Da maaler benken RNG-tilstand eller ` +
      `agentbygging og ikke kampstilling, og hvert tall i denne fila er ugyldig.`,
  );
});

test("K5: nullpunktet - lambda=0 er bit-identisk med «av»", () => {
  /**
   * Vedleggsregel 5: «en knott maa ha et nullpunkt som er bit-identisk med av.»
   * `racescore` med λ=0 returnerer snittet uten aa se paa presset i det hele
   * tatt. Med λ=0 i BEGGE armer og samme stilling skal valget vaere det samme
   * kortet, hver gang.
   */
  const r = lambdaarm("bak", 0);
  assert.ok(r.stillinger >= 5, `bare ${r.stillinger} stillinger`);
  assert.equal(r.racejustert, 0, `racepresset fyrte ${r.racejustert} ganger med lambda=0 - nullpunktet lekker`);
  assert.equal(r.ulike, 0, `lambda=0 ga ${r.ulike} ulike valg - nullpunktet er ikke bit-identisk med av`);
});

test("K5: racepresset FYRER - det har det aldri gjort i noen maaling foer", () => {
  /**
   * Vedleggsregel 6: «en test skal maale at noe FYRER, ikke at det finnes.»
   *
   * DENNE TESTEN VILLE FEILET FOR HVER ENESTE MAALING PROSJEKTET HAR GJORT.
   * Gate 2 spiller fra 0-0, saa `framdrift < 0.3` og `racepress` returnerer
   * eksakt null. `tellere.racejustert` oeker bare naar presset er ulik null, og
   * den har vaert 0 hele veien.
   */
  const r = kontekst();
  assert.ok(r.stillinger >= 5, `bare ${r.stillinger} stillinger`);
  assert.ok(
    r.pressBak > 0.3,
    `racepresset er ${r.pressBak} naar vi ligger 20 bak ved 70-90. Skal vaere klart positivt.`,
  );
  assert.ok(
    r.pressForan < -0.3,
    `racepresset er ${r.pressForan} naar vi leder 90-70. Skal vaere klart negativt.`,
  );
  assert.equal(
    r.racejustert,
    2 * r.stillinger,
    `racejusteringen fyrte ${r.racejustert} ganger paa ${2 * r.stillinger} beslutninger. ` +
      `Fyrer den ikke paa alle, er presset null et sted det ikke skal vaere det.`,
  );
});

test("K5: samme kort, samme stikk, ulik kampstilling - Adams velger ULIKT", () => {
  /**
   * HOVEDPROEVEN. Feiler den, er K5 ikke innfridd - da spiller Adams likt med
   * 40 poengs forskjell i stillingen, og «tilpasse seg» er dekorasjon.
   */
  const r = kontekst();
  assert.ok(r.stillinger >= 5, `bare ${r.stillinger} stillinger`);
  assert.ok(
    r.ulike > 0,
    `INGEN TILPASNING: samme kort, samme stikk, 20 poeng bak mot 20 poeng foran ` +
      `ved 70-90 av 100 - og Adams valgte NOEYAKTIG samme kort i alle ` +
      `${r.stillinger} stillingene. Kravet er ikke innfridd.`,
  );
});

test("K5: retningen - aa LEDE skal gi mindre risiko, ikke bare et annet kort", () => {
  /**
   * «Adams velger ulikt» er ikke kravet. Kravet sier hvilken VEI.
   *
   * Stillingen holdes FAST paa 90-70 (vi leder, press = -0,36) og bare λ
   * varieres. Racepresset er da alene om aa skille armene, og et negativt press
   * skal STRAFFE spredning. Spredningen i det valgte kortets utfallsvektor maa
   * derfor gaa NED.
   *
   * Snur fortegnet, feiler prøven - og det ville betydd at knotten gjoer det
   * motsatte av det den heter.
   */
  const r = lambdaarm("foran");
  assert.ok(r.stillinger >= 5, `bare ${r.stillinger} stillinger`);
  assert.ok(r.spredBak !== null && r.spredForan !== null, "ingen spredning maalt - soeket kjoerte ikke");
  assert.ok(
    r.ulike > 0,
    `racepresset endret INGEN av ${r.stillinger} valg naar Adams leder 90-70, selv om ` +
      `presset er ${r.pressForan.toFixed(3)} og racejusteringen fyrte ${r.racejustert} ganger. ` +
      `Da er «r0.4» en parameter uten virkning.`,
  );
  assert.ok(
    bestårRetning(r),
    `FEIL VEI: naar Adams LEDER 90-70 valgte han kort med STOERRE spredning med ` +
      `racepresset paa (${r.spredForan!.toFixed(3)}) enn med det av (${r.spredBak!.toFixed(3)}). ` +
      `Kravet sier at ledelse skal gi MINDRE risiko.`,
  );
});

test("K5: proeven kan FEILE - en knott som er vendt feil vei blir tatt", () => {
  /**
   * DEN VIKTIGSTE TESTEN I FILA, av samme grunn som jukseren er det i K2: uten
   * den betyr den groenne testen over «maaler ingenting» like gjerne som
   * «virker».
   *
   * `lambda = -0.4` er nøyaktig samme knott med fortegnet snudd: den BELOENNER
   * varians naar vi leder og straffer den naar vi ligger under - det motsatte
   * av kravet. NOEYAKTIG samme kriterium (`bestaarRetning`) kjoeres paa den, og
   * den maa ryke.
   *
   * MAALT: den ryker fordi `ulike` blir 0. Det er ikke tilfeldig, og formen
   * forklarer det: `snitt + λ·press·spredning`. Grenen med hoeyest snitt har som
   * regel ogsaa stoerst spredning, saa et POSITIVT ledd loefter den som alt
   * ledet og flytter ingenting. Bare det NEGATIVE leddet kan velte et valg.
   * Snudd knott = bare loeft = ingen virkning = ingen tilpasning.
   */
  const vendt = lambdaarm("foran", -0.4);
  assert.ok(vendt.stillinger >= 5, `bare ${vendt.stillinger} stillinger`);
  assert.equal(
    bestårRetning(vendt),
    false,
    `PROEVEN GODKJENTE EN KNOTT SOM ER VENDT FEIL VEI: med lambda = -0.4 beloenner ` +
      `Adams varians naar han LEDER, og proeven sa likevel ja (ulike=${vendt.ulike}, ` +
      `spred ${vendt.spredBak?.toFixed(3)} -> ${vendt.spredForan?.toFixed(3)}). ` +
      `Da maaler den groenne retningstesten ingenting.`,
  );
});

test("K5: retningen - aa ligge BAK skal ikke gi mindre risiko", () => {
  /**
   * SPEILET AV TESTEN OVER, og den staar for seg selv fordi de to retningene
   * IKKE oppfoerer seg likt.
   *
   * MAALT 7. august, 20 stillinger: med stillingen fast paa 70-90 (press
   * +0,36) endret racepresset **0 av 20** valg. Med stillingen fast paa 90-70
   * (press -0,36) endret det **4 av 20**. Presset fyrte like mange ganger i
   * begge - `racejustert` var 20 i hver.
   *
   * FORKLARINGEN LIGGER I FORMEN: `snitt + λ·press·spredning`. Grenen med
   * hoeyest snitt har som regel ogsaa stoerst spredning, saa et POSITIVT press
   * loefter den som alt ledet og flytter ingenting. Et NEGATIVT press straffer
   * den, og da kan en annen gren vinne. Halve knotten er inert.
   *
   * DERFOR ASSERTERES RETNINGEN og ikke tallet: gaar spredningen NED naar vi
   * ligger under, gjoer knotten det motsatte av navnet sitt og proeven skal
   * feile. Begynner den aa virke, gaar spredningen OPP og proeven staar - saa
   * denne testen laaser ikke funnet inne.
   */
  const r = lambdaarm("bak");
  assert.ok(r.stillinger >= 5, `bare ${r.stillinger} stillinger`);
  assert.ok(r.spredBak !== null && r.spredForan !== null, "ingen spredning maalt - soeket kjoerte ikke");
  assert.ok(
    r.spredForan! >= r.spredBak! - 1e-9,
    `FEIL VEI: naar Adams ligger 20 BAK valgte han kort med MINDRE spredning med ` +
      `racepresset paa (${r.spredForan!.toFixed(3)}) enn med det av (${r.spredBak!.toFixed(3)}). ` +
      `Kravet sier at aa ligge under skal gi MER risiko.`,
  );
  linjer.push(
    `  # bak-retningen endret ${r.ulike} av ${r.stillinger} valg. Er den 0, er halve ` +
      `knotten inert - se hodet paa denne testen.`,
  );
});
