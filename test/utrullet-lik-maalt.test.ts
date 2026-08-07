/**
 * DET UTRULLEDE MÅ VÆRE DET MÅLTE.
 *
 * Dette er prosjektets mest gjentatte feil. Åtte ganger har en måling vært
 * gyldig og likevel verdiløs, fordi den ble gjort på noe annet enn det som
 * sto ute:
 *
 *   – generatoren skrev bredde 340 mens `trekk.ts` var på 356
 *   – workeren bygde `Rolleorakel` mens målingen var på `Sikkerorakel`
 *   – gate2 skrev «foerer», leseren leste «fører» → førerraden usynlig i ALLE
 *     rapporter en hel kveld
 *   – `LOVLIGE_DIM` i Python kjente ikke 470 etter v8
 *
 * Den niende ble funnet 6. august, i revisjon, FØR den rakk å koste noe:
 * `web/app.ts` hentet `bud-gbt.json` mens `ADAMS` — speken hver eneste måling
 * denne uka er gjort med — bruker `bud-vant.json`. Forskjellen er +0,127 poeng
 * per runde. Hadde noen fulgt utrullingslista, ville v5 gått ut med v3s
 * budmodell og gevinsten forsvunnet uten at noe feilet.
 *
 * Testen håndhever koblingen som mangler: filnavnene i `web/app.ts` MÅ være de
 * samme som i `ADAMS`. Ingen typesjekk krysser den grensen, fordi den ene
 * siden er en streng i en spek og den andre er en streng i en fetch.
 */

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test } from "node:test";

import { ADAMS, ADAMS_MAALT } from "../src/moe2/agentspek.ts";

const ROT = join(import.meta.dirname, "..");
const APP = readFileSync(join(ROT, "web", "app.ts"), "utf8");

/** Verdien av en `const NAVN = "..."` i appen. */
function konstant(navn: string): string {
  const m = new RegExp(`^const ${navn} = "([^"]+)";`, "m").exec(APP);
  assert.ok(m !== null, `fant ikke «const ${navn}» i web/app.ts`);
  return m[1]!;
}

/** Filnavnene ADAMS-speken viser til, uten katalog. */
function filerIAdams(): string[] {
  return [...ADAMS.matchAll(/[\w./-]+\.(?:bin|json)/g)].map((m) => basename(m[0]));
}

test("ADAMS peker på filer i det hele tatt – ellers tester vi ingenting", () => {
  const f = filerIAdams();
  assert.ok(f.length >= 3, `forventet minst tre modellfiler i ADAMS, fant ${f.length}: ${f}`);
});

/**
 * BUDMODELLEN — OG HVORFOR DENNE TESTEN IKKE KREVER LIKHET.
 *
 * Første utgave krevde at `BUDMODELL` var en fil `ADAMS` bruker. Det var feil,
 * og feilen var min: `vant[N]` er et faktum om OMGIVELSENE, og appens
 * omgivelser er ett menneske og to bots — ikke fire Adams. Planen har alltid
 * sagt at de to skal være ulike:
 *
 *     bud-vant.json      riktig naar bordet er fire Adams   -> BENKENE
 *     bud-menneske.json  riktig naar bordet er 1 menneske   -> APPEN
 *
 * En test som krevde likhet ville altså HÅNDHEVET feil oppsett, og gjort det
 * med grønn status. Det er verre enn ingen test.
 *
 * Det som skal håndheves er derfor: fila finnes, og forskjellen er BEGRUNNET
 * der noen leser den. En udokumentert forskjell er ikke til å skille fra den
 * niende feilen.
 */
test("appens BUDMODELL finnes som fil i repoet", () => {
  const f = join(ROT, "e1-modell", konstant("BUDMODELL"));
  assert.ok(existsSync(f), `web/app.ts henter «${konstant("BUDMODELL")}», som ikke finnes i e1-modell/`);
});

test("avviker appen fra ADAMS, MAA forskjellen vaere begrunnet i kilden", () => {
  const iApp = konstant("BUDMODELL");
  if (filerIAdams().includes(iApp)) return; // like – ingenting å begrunne
  const blokk = APP.slice(Math.max(0, APP.indexOf(`const BUDMODELL = "${iApp}"`) - 3000));
  for (const ord of ["vant[N]", "SELVSPILL", "FORBEHOLD"]) {
    assert.ok(
      blokk.includes(ord),
      `«${iApp}» er ikke fila ADAMS måler med, og begrunnelsen over den nevner ikke «${ord}»`,
    );
  }
});

/**
 * RESERVEN MÅ VÆRE EN ANNEN FIL. Peker begge på det samme, er kjeden pynt:
 * feiler den ene, feiler den andre likedan, og boten havner på NevroHjerne
 * uten at noen har ment det.
 */
test("budmodellens reserve er en ANNEN fil enn hovedmodellen", () => {
  assert.notEqual(konstant("BUDMODELL"), konstant("BUDMODELL_RESERVE"));
});

/**
 * FLAGGENE. `vakt:abmp` og `vr:...:telrd` er strenger som endrer HVILKE
 * konvensjoner boten spiller — like avgjørende som vektfilene, og i dag helt
 * uvoktet. Driver appen fra speken her, spiller den andre konvensjoner enn
 * benken måler, og ingenting feiler.
 *
 * `abmp` ble målt ledd for ledd: `m` gir +0,0404 ± 0,0075 (positiv i 10 av 10
 * disjunkte frøbånd), `p` gir +0,0039 ± 0,0010 (9 av 10). Faller en bokstav
 * bort i appen, forsvinner nøyaktig de tallene.
 */
test("appens VAKTFLAGG er det samme som ADAMS maaler med", () => {
  const m = /:vakt:([a-z]+):/.exec(ADAMS);
  assert.ok(m !== null, "fant ikke vakt-flagget i ADAMS");
  assert.equal(konstant("VAKTFLAGG"), m[1], "web/app.ts og ADAMS er uenige om konvensjonsflagget");
});

test("appens VRAKFLAGG er det samme som ADAMS maaler med", () => {
  const m = /^vr:[\w./-]+:([a-z]+):/.exec(ADAMS);
  assert.ok(m !== null, "fant ikke vrak-flagget i ADAMS");
  assert.equal(konstant("VRAKFLAGG"), m[1], "web/app.ts og ADAMS er uenige om vrakflagget");
});

/**
 * BUDTERSKELEN. Et TALL, ikke en streng, men samme feilklasse: `@-3.0` i
 * speken og `const BUDTERSKEL` i appen er to uavhengige kopier av samme
 * kalibrerte konstant.
 */
test("appens BUDTERSKEL er den samme som ADAMS maaler med", () => {
  const m = /\.json@(-?[\d.]+)[:/]/.exec(ADAMS);
  assert.ok(m !== null, "fant ikke budterskelen i ADAMS");
  const iApp = /^const BUDTERSKEL = (-?[\d.]+);/m.exec(APP);
  assert.ok(iApp !== null, "fant ikke BUDTERSKEL i web/app.ts");
  assert.equal(Number(iApp[1]), Number(m[1]), "web/app.ts og ADAMS er uenige om budterskelen");
});

/**
 * VEKTFILENE. `KORTVEKTER` er et `.b64`-navn og kan ikke sammenliknes med
 * `.bin`-navnet i speken direkte — koblingen mellom dem er et opplastingssteg
 * utenfor koden. Det testen KAN håndheve, er at utrullingslista navngir hver
 * fil ADAMS bruker, slik at ingen av dem kan bli glemt.
 */
test("utrullingslista navngir HVER modellfil ADAMS bruker", () => {
  const liste = readFileSync(join(ROT, "docs", "utrulling-v5.md"), "utf8");
  for (const f of filerIAdams()) {
    assert.ok(liste.includes(f), `docs/utrulling-v5.md nevner ikke «${f}» – da kan den bli glemt`);
  }
});

/**
 * SØKET. Lista har sagt «SØKVERDENER står på 0, og bunten er derfor trygg»
 * siden før workeren fantes. Kilden står nå på 24. Sier de to ulike ting, tror
 * den som ruller ut at søket er av mens det er på.
 */
test("utrullingslista lyver ikke om SOEKVERDENER", () => {
  const m = /^const SØKVERDENER = (\d+);/m.exec(APP);
  assert.ok(m !== null, "fant ikke SØKVERDENER i web/app.ts");
  const iKilde = Number(m[1]);
  const liste = readFileSync(join(ROT, "docs", "utrulling-v5.md"), "utf8");
  const påstand = /SØKVERDENER`? står på \*\*(\d+)\*\*/.exec(liste);
  if (påstand !== null) {
    assert.equal(
      Number(påstand[1]),
      iKilde,
      `lista sier SØKVERDENER er ${påstand[1]}, kilden sier ${iKilde}`,
    );
  }
});

/**
 * ============ DET MÅLTE MOT DET UTRULLEDE ============================
 *
 * `ADAMS` er den utrullede stakken; `ADAMS_MAALT` er den vi måler og genererer
 * korpus med. At de er ULIKE er riktig — `f` er målt og adoptert, men ikke
 * rullet ut, og utrulling krever eksplisitt beskjed.
 *
 * Det som IKKE er greit, er at forskjellen siger. Uten et navn for «det målte»
 * valgte verktøyene ad hoc, og to ulike bots ble kalt «vår» samtidig. Denne
 * testen krever at hvert avvik står oppført med sin egen måling.
 *
 * Å legge til et flagg uten å føre det opp her får testen til å feile. Det er
 * hele poenget: `F` ble prøvd og snudde fortegn mellom to bånd (−0,022 og
 * +0,072), og skal derfor ikke kunne gli inn i stillhet.
 */
const DOKUMENTERTE_VAKTAVVIK: Record<string, string> = {
  // stikk 1, følger trumf uten det etterlyste kortet -> legg billigst.
  // +0,031 ± 0,011 samlet over fire disjunkte frøbånd, z = +2,95.
  f: "+0,031 ± 0,011, fire baand, z = +2,95",
};

const vaktflagg = (spek: string): string => {
  const m = /:vakt:([a-z]+):/i.exec(spek);
  assert.ok(m !== null, `fant ikke vakt-flagget i «${spek}»`);
  return m[1]!;
};

test("ADAMS_MAALT skiller seg fra ADAMS BARE i vaktflagget", () => {
  const u = ADAMS.replace(/:vakt:[a-z]+:/i, ":vakt:*:");
  const m = ADAMS_MAALT.replace(/:vakt:[a-z]+:/i, ":vakt:*:");
  assert.equal(
    m,
    u,
    "ADAMS_MAALT og ADAMS er ulike i noe ANNET enn vaktflagget. Enten er det en " +
      "reell forskjell som maa dokumenteres her, eller saa har den ene drevet.",
  );
});

test("hvert ekstra vaktflagg i ADAMS_MAALT har en maaling bak seg", () => {
  const utrullet = new Set(vaktflagg(ADAMS).split(""));
  const ekstra = vaktflagg(ADAMS_MAALT)
    .split("")
    .filter((c) => !utrullet.has(c));
  for (const c of ekstra) {
    assert.ok(
      c in DOKUMENTERTE_VAKTAVVIK,
      `vaktflagg «${c}» er i ADAMS_MAALT men ikke i ADAMS, og har ingen maaling ` +
        `oppfoert i DOKUMENTERTE_VAKTAVVIK. Legg inn tallet, eller ta flagget ut.`,
    );
  }
});

test("ingen dokumentert avvik er BLITT liggende etter utrulling", () => {
  // Rulles v6 ut, blir `f` en del av ADAMS. Da skal den ut av lista, ellers
  // vokser den til en samling paastander ingen lenger sjekker.
  const utrullet = new Set(vaktflagg(ADAMS).split(""));
  for (const c of Object.keys(DOKUMENTERTE_VAKTAVVIK)) {
    assert.ok(
      !utrullet.has(c),
      `vaktflagg «${c}» staar som «maalt, ikke utrullet», men ADAMS har det naa. ` +
        `Fjern det fra DOKUMENTERTE_VAKTAVVIK.`,
    );
  }
});
