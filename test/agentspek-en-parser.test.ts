/**
 * ÉN parser, ikke sju kopier – håndhevet.
 *
 * Fram til 5. august hadde `lagIndre` sju kopier, og driften var ikke
 * kosmetisk: `examples/gate2.ts` kjente elleve spekformer, de seks
 * analyseverktøyene kjente TRE. De kunne ikke parse `vr:`, og de bygde
 * `Budagent` UTEN terskelargument – altså standard 2,5 der Adams bruker −3,0.
 * Det er den samme konstanten som ga +0,392 da den ble flyttet.
 *
 * Hver atferdsanalyse prosjektet hadde kjørt, målte dermed en annen bot enn
 * den som spiller. Samme feilklasse som breddedriften og som trosnettet: DET
 * SOM MÅLES OG DET SOM RULLES UT VAR IKKE SAMME TING.
 *
 * Denne testen gjør at det ikke kan skje igjen i stillhet.
 */

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ADAMS, lagIndre, tall, ADAMS_MAALT, ADAMS_V6, ADAMS_V6_FULL } from "../src/moe2/agentspek.ts";

const ROT = join(import.meta.dirname, "..");

/**
 * Alle `.ts`-filer under de gitte mappene, REKURSIVT.
 *
 * Fram til 9. august var dette `readdirSync` uten rekursjon, og da ble
 * `src/moe2/` — mappa der parseren og alle lagene faktisk bor — aldri lest.
 * Hopplinja sammenliknet i tillegg `src/f.ts` med `src/moe2/agentspek.ts`
 * og kunne aldri treffe. Vakten kunne ikke feile, og en vakt som ikke kan
 * feile måler ingenting.
 */
function alleKildefiler(mapper: readonly string[]): string[] {
  const ut: string[] = [];
  const gå = (rel: string): void => {
    for (const e of readdirSync(join(ROT, rel), { withFileTypes: true })) {
      const sti = join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
        gå(sti);
      } else if (e.name.endsWith(".ts")) {
        ut.push(sti);
      }
    }
  };
  for (const m of mapper) gå(m);
  return ut;
}

/** Prefiksene som til sammen utgjør spec-kjeden. */
const LAGPREFIKSER = ["okt:", "vr:", "amu:", "profil:", "budm:", "vakt:", "e1:", "sum:"];

const KANONISK = join("src", "moe2", "agentspek.ts");

/**
 * Filer som får forgrene på flere prefikser, med grunnen skrevet ned.
 * Å stå her er ikke en frikjennelse — det er en påminnelse om at fila
 * driver fra kjeden hvis kjeden endres.
 */
const UNNTAK: ReadonlyMap<string, string> = new Map([
  [
    join("src", "moe2", "sdagent.ts"),
    "benkinngang for «klone:» og «e1:» alene; nås ikke av utrullet.ts eller worker.ts",
  ],
]);

/**
 * KJENT GJELD, målt 9. august med den rettede vakten.
 *
 * Hver av disse bygger spec-kjeden på egen hånd i stedet for å gå gjennom
 * `lagIndre`. Det er nøyaktig mekanismen bak prosjektets verste feilklasse —
 * «det målte og det utrullede var ikke samme ting», 15 ganger — fordi en benk
 * som parser selv kan tape et lag uten at noe sier fra. Budterskelen er verdt
 * +0,3127 (6,05 SE), og en benk uten «@» får stille standardverdien 2,5.
 *
 * De fem merket DATA er verst: de genererer treningsdata, så et tapt lag
 * betyr at korpuset er laget av en annen agent enn den som rulles ut.
 *
 * Lista er en SKRALLE. Den skal bare krympe. Fikser du en fil, fjern den her
 * — prøven feiler også hvis en oppført fil er blitt ren, så gjelden kan
 * verken vokse i stillhet eller bli stående etter at den er betalt.
 */
const KJENT_DRIFT: readonly string[] = [
  join("examples", "blandetbord.ts"),
  join("examples", "buddata.ts"),
  join("examples", "menneskeklon-data.ts"),
  join("examples", "mesterai-fasegap.ts"),
  join("examples", "mesterai-h2h.ts"),
  join("examples", "mesterai-konvensjoner.ts"),
  join("examples", "rolleanger.ts"),
  join("examples", "sd-orakel.ts"),
  join("examples", "stikk-kalibrering.ts"), // DATA
  join("examples", "tro-data.ts"), // DATA
  join("examples", "tro-sampler.ts"), // DATA
  join("examples", "vanttabell.ts"), // DATA
  join("examples", "vrakbenk.ts"), // DATA
  join("examples", "vrakorakel.ts"),
];

test("bare agentspek.ts parser HELE spec-kjeden", () => {
  const skyldige: string[] = [];

  for (const sti of alleKildefiler(["examples", "src", "test", "web"])) {
    if (sti === KANONISK) continue;
    const kilde = readFileSync(join(ROT, sti), "utf8");

    // Én egen `lagIndre` er alltid en kopi av parseren.
    if (/(?:^|\n)\s*(?:export\s+)?function lagIndre\s*\(/.test(kilde)) {
      skyldige.push(`${sti} (egen lagIndre)`);
      continue;
    }

    // Å forgrene på ETT prefiks er en legitim underparser for eget lag
    // (slik `konvensjonsvakt.ts` gjør med «vakt:»). Å forgrene på FLERE er
    // å bygge kjeden om igjen, og da kan lag falle ut i stillhet — slik
    // budterskelen gjorde, den som er verdt +0,3127 (6,05 SE).
    const truffet = LAGPREFIKSER.filter((p) => kilde.includes(`startsWith("${p}")`));
    if (truffet.length > 1 && !UNNTAK.has(sti)) {
      skyldige.push(`${sti} (forgrener på ${truffet.join(", ")})`);
    }
  }

  // Skralle: nøyaktig den kjente gjelden, verken mer eller mindre.
  const funnet = skyldige.map((s) => s.split(" (")[0]!).sort();
  const kjent = [...KJENT_DRIFT].sort();

  const nye = funnet.filter((f) => !kjent.includes(f));
  const betalte = kjent.filter((k) => !funnet.includes(k));

  assert.deepEqual(nye, [], `NY drift — disse bygger spec-kjeden om igjen: ${nye.join(", ")}`);
  assert.deepEqual(
    betalte,
    [],
    `disse er ryddet opp — fjern dem fra KJENT_DRIFT: ${betalte.join(", ")}`,
  );
});

test("parser-vakten kan FEILE — den ser inn i src/moe2/", () => {
  // Kontrollarm: vakten er verdiløs hvis den ikke leser mappa der lagene bor.
  const filer = alleKildefiler(["src"]);
  assert.ok(
    filer.includes(KANONISK),
    `vakten ser ikke ${KANONISK} — den er blind for nettopp det den vokter`,
  );
  assert.ok(
    filer.some((f) => f.startsWith(join("src", "moe2"))),
    "vakten leser ikke src/moe2/",
  );
  assert.ok(filer.length > 40, `for få filer sett (${filer.length}) — rekursjonen virker ikke`);

  // Og at kriteriet faktisk slår ut på en konstruert kopi.
  const konstruert = LAGPREFIKSER.slice(0, 3)
    .map((p) => `if (s.startsWith("${p}")) return 1;`)
    .join("\n");
  const truffet = LAGPREFIKSER.filter((p) => konstruert.includes(`startsWith("${p}")`));
  assert.ok(truffet.length > 1, "kriteriet fanger ikke en konstruert kjedekopi");
});

test("ADAMS-speken bygger, og inneholder hvert lag i den utrullede stakken", () => {
  for (const lag of ["vr:", "budm:", "vakt:", "e1:"]) {
    assert.ok(ADAMS.includes(lag), `ADAMS mangler laget «${lag}»`);
  }
  // Terskelen MÅ stå eksplisitt. Uten «@» får Budagent standardverdien 2,5,
  // og det er nettopp den stille regresjonen testen finnes for.
  assert.match(ADAMS, /@-?\d/, "ADAMS mangler eksplisitt budterskel");
  const a = lagIndre(ADAMS);
  assert.equal(typeof a.velgHandling, "function");
  assert.equal(typeof a.nyKamp, "function");
});

test("tall() feiler HØYLYTT på noe som ikke er et tall", () => {
  assert.equal(tall(undefined, 7, "x"), 7);
  assert.equal(tall("42", 7, "x"), 42);
  // Den ekte feilen: en spek sendt inn der et frø var ventet ga NaN, og NaN
  // som frø gir samme giv om og om igjen – en måling som ser ferdig ut.
  assert.throws(() => tall("vr:e1-modell/vrakrang.bin:telrd", 7, "frø"), /må være et tall/);
  assert.throws(() => tall("", 7, "frø"), /må være et tall/);
});

/**
 * ALLE NAVNGITTE STAKKER MÅ FAKTISK LA SEG BYGGE.
 *
 * `ADAMS_V6_FULL` forekom nøyaktig én gang i repoet: sin egen deklarasjon. Den
 * er en spek på ni ledd som ingen bygde og ingen testet — altså en påstand om
 * en bot som kanskje ikke finnes.
 *
 * Speker er strenger. Ingen typesjekk krysser dem, så et ledd som endrer navn
 * eller får et nytt argument bryter en ubenyttet spek i stillhet, og feilen
 * dukker opp den dagen noen endelig kjører den.
 */
test("hver navngitt ADAMS-stakk lar seg bygge", () => {
  for (const [navn, spek] of [
    ["ADAMS", ADAMS],
    ["ADAMS_MAALT", ADAMS_MAALT],
    ["ADAMS_V6", ADAMS_V6],
    ["ADAMS_V6_FULL", ADAMS_V6_FULL],
  ] as const) {
    let agent: unknown = null;
    assert.doesNotThrow(() => {
      agent = lagIndre(spek);
    }, `${navn} lot seg ikke bygge: ${spek}`);
    assert.ok(agent !== null, `${navn} ga ingen agent`);
    assert.ok(
      typeof (agent as { velgHandling?: unknown }).velgHandling === "function",
      `${navn} ga noe uten velgHandling`,
    );
  }
});
