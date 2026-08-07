/**
 * K4 — «ha hukommelse over hele spill, og evnen til å planlegge framover»
 *
 * Prøven selv ligger i `examples/k4-hukommelse.ts`; måletallene i
 * `analyse/k4-hukommelse.txt`. Denne fila er prøvens SELVKONTROLL og dens
 * TILSTANDSLÅS, og det er to ulike jobber:
 *
 *   1. VALIDITET   Måler prøven hukommelse, eller måler den støy? Nullarmene må
 *                  gi eksakt 0, og positivkontrollen må gi mer enn 0. Uten
 *                  begge betyr ingen av tallene noe.
 *
 *   2. TILSTANDEN  Det prøven FAKTISK målte, låst fast. Flytter noen på et av
 *                  tallene, blir denne fila rød — og da skal `AdamsMax.md`
 *                  oppdateres, ikke testen tilpasses.
 *
 * ================= HVA PRØVEN FANT, KORT ================================
 *
 * Hukommelsen har to kanaler inn i en beslutning, og de måler helt ulikt:
 *
 *   BUDET (`Profilbok.justering`)  ba om maks 0,51 budpoeng etter tre kamper.
 *                                  Minste forskyvning som snur et valg er 1,0.
 *                                  Null valg endret seg. Dekorasjon.
 *   KORTET (`Økt.motpartFor`, A2)  endret 58 % av kortvalgene. Fyrer.
 *
 * Og over dem begge: `okt:` står i ADAMS_V6/V7 rett over `vr:`, som bygger sitt
 * indre lag uten å sende konteksten videre. I de spekene når økten aldri fram
 * til laget som lærer eller til laget som bruker det lærte.
 *
 * ================= HVORFOR EN TILSTANDSLÅS OG IKKE EN GRØNN HAKE ==========
 *
 * Vedlegget i AdamsMax: «en test skal måle at noe FYRER, ikke at det finnes —
 * fire døde moduler hadde grønne enhetstester hele tiden.» En testfil som var
 * grønn fordi hukommelsen «finnes» ville vært den femte.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  A_MINNE,
  A_NULL,
  BASE_DET,
  prøveA,
  prøveA2,
  prøveAForsterket,
  prøveB,
  øktNåesGjennom,
} from "../examples/k4-hukommelse.ts";
import { ADAMS_V6, ADAMS_V7 } from "../src/moe2/agentspek.ts";
import { MIN_RUNDER } from "../src/moe2/okt.ts";

const FRØ = 4_400_000;
const MÅLRUNDE = 7; // runde 8, nullindeksert — AdamsMax' egen formulering

/**
 * ============ 1. VALIDITET: NULLARMEN ====================================
 *
 * En stakk uten `profil:` har ingenting å huske. Den METTE og den FERSKE
 * agenten er da samme funksjon, og prøven MÅ måle eksakt null avvik.
 *
 * Måler den noe annet, lekker det tilstand et sted prøven ikke kontrollerer —
 * konvensjonsvakten, budagenten, nettet — og hvert tall fra minnearmene er da
 * uleselig. Dette er samme halvdel som K2-prøvens jukser.
 */
test("K4: nullarmen uten hukommelse maaler eksakt 0 avvik", () => {
  const m = prøveA({
    spek: A_NULL,
    medØkt: false,
    giv: 2,
    frøBase: FRØ,
    målRunde: MÅLRUNDE,
    tikk: true,
  });
  assert.ok(m.n >= 20, `proeven fikk bare ${m.n} beslutninger - beviser ingenting`);
  assert.equal(
    m.avvik,
    0,
    `en stakk UTEN hukommelse endret ${m.avvik} valg av ${m.n}. Da maaler proeven ` +
      `noe annet enn hukommelse, og alle tallene fra minnearmene er uleselige.\n` +
      m.eksempler.join("\n"),
  );
});

/**
 * ============ 2. VALIDITET: POSITIVKONTROLLEN ============================
 *
 * Nullarmen alene beviser ikke at prøven KAN se hukommelse — en prøve som
 * alltid returnerer null består den også.
 *
 * Kontrollen gir budlaget en forskyvning som er en ren funksjon av
 * hukommelsen: `forsterk` budpoeng når profilboka HAR bokført noe, eksakt 0
 * når den er tom. En fersk agent får dermed nøyaktig null, akkurat som ellers
 * i prøven.
 *
 * FØRSTE UTGAVE GANGET OPP `Profilbok.justering` I STEDET, og målte null helt
 * til 50x. Grunnen var ikke at prøven var blind: `justering` returnerer 0 så
 * snart ingen ANNEN har bydd ennå, og det gjaldt fem av seks budstillinger
 * prøven fikk se. Kontrollen fikk knapt anledning til å fyre. Hadde jeg stoppet
 * der, ville jeg konkludert med at prøven var i stykker.
 */
test("K4: proeven SER hukommelse naar den er sterk nok", () => {
  const sveip = prøveAForsterket({
    giv: 2,
    frøBase: FRØ,
    målRunde: MÅLRUNDE,
    forkamper: 2,
    nivåer: [8],
    modus: "flat",
  });
  const p = sveip[0]!;
  assert.ok(p.n >= 20, `positivkontrollen fikk bare ${p.n} beslutninger`);
  assert.ok(
    p.avvik > 0,
    `en hukommelsesstyrt forskyvning paa ${p.forsterk} budpoeng endret ingen av ${p.n} ` +
      `valg. Da er det PROEVEN som er blind, ikke hukommelsen som er svak, og hele ` +
      `K4-maalingen er ugyldig.`,
  );
});

/**
 * ============ 3. FYRER HUKOMMELSEN I DET HELE TATT? =====================
 *
 * `Profilbok.observer` gjør ingenting med mindre den får en tilstand med
 * `fase === "RUNDE_SLUTT"`, og den kalles bare fra `Profilagent.velgHandling`.
 *
 * `examples/kamp.ts` — kampbenken AdamsMax peker på for K4 — utfører `NESTE`
 * selv ved rundeslutt og spør aldri agenten. Profilboka får da null
 * observasjoner uansett hvor lenge kampen varer. `test/profilagent.test.ts`
 * kaller `a.velgHandling(s)` der med kommentaren «la profilen bokføre runden»,
 * altså en krykke som bare finnes i testen.
 *
 * Testen låser begge sidene: med tikk lærer den, uten tikk lærer den ingenting.
 */
test("K4: hukommelsen fylles BARE naar driveren mater RUNDE_SLUTT til agenten", () => {
  const felles = { spek: A_MINNE, medØkt: true, giv: 2, frøBase: FRØ, målRunde: MÅLRUNDE };
  const med = prøveA({ ...felles, tikk: true });
  const uten = prøveA({ ...felles, tikk: false });

  const sumMed = med.bokførte.reduce((a, b) => a + b, 0);
  const sumUten = uten.bokførte.reduce((a, b) => a + b, 0);

  assert.ok(
    sumMed > 0,
    `profilboka bokfoerte ${sumMed} runder selv MED tikk. Da laerer hukommelsen ` +
      `ingenting i det hele tatt, og K4 er daarligere stilt enn maalingen sier.`,
  );
  assert.equal(
    sumUten,
    0,
    `profilboka bokfoerte ${sumUten} runder UTEN tikk. Blir denne roed, har noen ` +
      `koblet observasjonen til noe annet enn RUNDE_SLUTT - og da kan kampbenken ` +
      `(examples/kamp.ts) endelig maale K4. Oppdater AdamsMax.md.`,
  );
});

/**
 * ============ 4. «okt:» NÅR IKKE GJENNOM «vr:» ===========================
 *
 * `lagIndre` sender `Spekkontekst` nedover — men `vr:` bygger sitt indre lag
 * med `lagIndre(rest)` UTEN `ctx`. Alt under `vr:` får en tom kontekst.
 *
 * ADAMS_V6 og ADAMS_V7 begynner begge med «okt:vr:…». Økten opprettes, og blir
 * så aldri levert til `profil:` (som lærer) eller til `amu:` (som bruker det
 * lærte gjennom `motpartFor`).
 *
 * Det er nøyaktig feilklassen vedlegget beskriver: en modul som ser levende ut
 * fordi den finnes i speken.
 */
/**
 * DENNE TESTEN DOKUMENTERTE EN FEIL, OG BA UTTRYKKELIG OM AA BLI SNUDD.
 *
 * K4-proeven fant at `okt:` var FRAKOBLET i baade ADAMS_V6 og ADAMS_V7:
 * `lagIndre` sender `Spekkontekst` nedover, men `vr:`-grenen bygde sitt indre
 * lag med `lagIndre(rest)` UTEN `ctx`. Begge spekene begynner med `okt:vr:…`,
 * saa oekten ble opprettet og kastet umiddelbart. Verken `profil:` (som
 * laerer) eller `amu:` (som leser via `motpartFor`) fikk den noen gang.
 *
 * Maalt den gang: 0 bokfoerte runder bak `vr:`, 7 rett over `profil:`.
 *
 * Samme mangel fantes i `sik:`, `vv:`, `vv2:`, `etl:`, `juks:` og `profil:`s
 * indre kall - sju kall til sammen. Alle retter naa `ctx` videre.
 *
 * Konsekvensen var stor: der oekten NAAR fram endrer 58 % av kortvalgene seg
 * av det den har laert. I ADAMS_V7 slik den sto var tallet 0.
 */
test("K4: «okt:» naar frem gjennom HELE stakken, ogsaa bak «vr:»", () => {
  const direkte = øktNåesGjennom(A_MINNE);
  const bakVr = øktNåesGjennom(`vr:e1-modell/vrakrang.bin:telrd:${A_MINNE}`);

  assert.ok(
    direkte > 0,
    `oekten fikk ${direkte} bokfoerte runder selv rett over «profil:». Da maaler ` +
      `denne testen ingenting.`,
  );
  assert.ok(
    bakVr > 0,
    `oekten fikk ${bakVr} bokfoerte runder BAK «vr:». Da har noen sluttet aa ` +
      `sende «ctx» videre i vr-grenen, og «okt:» er frakoblet i ADAMS_V6/V7 igjen - ` +
      `hele oektminnet og A2 er da doed kode i den utrullede spekken.`,
  );
  // Spekene kandidatene faktisk maales med, sagt rett ut.
  assert.ok(ADAMS_V6.startsWith("okt:vr:"), "ADAMS_V6 begynner ikke lenger med okt:vr:");
  assert.ok(ADAMS_V7.startsWith("okt:vr:"), "ADAMS_V7 begynner ikke lenger med okt:vr:");
});
/**
 * ============ 5. PRØVE A, BUDKANALEN ====================================
 *
 * AdamsMax: «Spill samme runde to ganger … Valgene MÅ avvike. Gjør de ikke det,
 * er hukommelsen dekorasjon.»
 *
 * Med hukommelsen riktig koblet, tikket på og to forkamper i økten bak seg
 * avviker ingen valg i budrunden. Grunnen er målt, ikke gjettet: profilens
 * eneste kanal inn i budet er `Profilbok.justering`, den ba om maks 0,51
 * budpoeng, og positivkontrollen viser at det trengs 1,0 for å snu ett valg.
 *
 * Testen låser nullen. Blir den rød, har budkanalen begynt å bite — det skal
 * skrives ned, ikke stilles ned.
 */
test("K4 PROEVE A: budkanalen endrer null valg i runde 8 - hukommelsen er for svak der", () => {
  const m = prøveA({
    spek: A_MINNE,
    medØkt: true,
    giv: 2,
    frøBase: FRØ,
    målRunde: MÅLRUNDE,
    tikk: true,
    forkamper: 2,
  });
  assert.ok(m.n >= 20, `proeven fikk bare ${m.n} beslutninger`);
  assert.ok(
    m.bokførte.reduce((a, b) => a + b, 0) >= 12,
    `oekten hadde bare ${m.bokførte.join("/")} bokfoerte runder etter to forkamper - ` +
      `da er dette ikke en proeve paa hukommelse, men paa at det ikke ble spilt nok`,
  );
  assert.equal(
    m.avvik,
    0,
    `hukommelsen endret ${m.avvik} av ${m.n} valg gjennom budkanalen. Det er nytt - ` +
      `skriv det inn i AdamsMax.md og slett denne laasen.\n` +
      m.eksempler.join("\n"),
  );
});

/**
 * ============ 6. PRØVE A, KORTKANALEN (A2) ==============================
 *
 * Den deterministiske stakken i test 5 har ingen `amu:`, så hukommelsen kan der
 * per konstruksjon bare røre BUDET. Å rapportere «0 avvik i kortspillet» derfra
 * ville vært å telle en tom kolonne som bevis.
 *
 * Den andre kanalen er `Økt.motpartFor`, som gir alpha-mu én rollout-policy per
 * motstander. Den måles ETT NIVÅ NED — samme stilling, samme trukne verdener,
 * samme `alphaMu`, bare to ulike rollout-motparter — slik at agentens
 * RNG-posisjon, som de sju rundene har flyttet, ikke kan forveksles med
 * hukommelse.
 *
 * DETTE ER DEN ENE HALVDELEN AV PRØVE A SOM ER INNFRIDD.
 *
 * TO tellere må over `MIN_RUNDER`, og de teller ulike ting: `bok.runder(sete)`
 * er `profil.bud.n` (runder setet faktisk BØD i), mens `Økt.aggressivitet` i
 * tillegg krever `trumfutspill.n ≥ 4` (runder setet var FORSVARER og ledet et
 * stikk). Den andre er den bindende — målingen viser at bud.n når 4 etter sju
 * runder mens aggressiviteten fortsatt er null. Derfor to forkamper her.
 */
test("K4 PROEVE A: hukommelsen ENDRER kortvalget gjennom A2 - naar den er koblet", () => {
  const a2 = prøveA2({
    giv: 2,
    frøBase: FRØ,
    målRunde: MÅLRUNDE,
    forkamper: 2,
    verdener: 8,
    kandidater: 8,
    maksPerGiv: 2,
  });
  assert.ok(a2.n >= 2, `A2-proeven fikk bare ${a2.n} kortstillinger`);
  assert.ok(
    a2.aggressivitet.some((x) => x !== null),
    `ingen sete naadde MIN_RUNDER=${MIN_RUNDER} etter to forkamper. Da er ` +
      `«motpartFor» en identitetsfunksjon og A2 er koblet til ingenting.`,
  );
  assert.ok(
    a2.vridde > 0,
    `«motpartFor» ga basis uendret for HVERT sete (${a2.vridde} av ${a2.seteSjekker}). ` +
      `A2 fyrer da ikke i det hele tatt, uansett hva den har laert.`,
  );
  /**
   * NULLARMEN FØRST. `alphaMu` er deterministisk gitt verdenene, så to
   * IDENTISKE motparter må gi identisk kort. Gjør de ikke det, måler `endret`
   * ustabilitet i søket og ikke hukommelse — og da beviser tallet under
   * ingenting.
   */
  assert.equal(
    a2.endretNull,
    0,
    `basis mot en TOM oekt ga ${a2.endretNull} ulike kortvalg av ${a2.n}. Da er ikke ` +
      `alphaMu deterministisk gitt verdenene, og «endret» maaler stoey.`,
  );
  assert.ok(
    a2.endret > 0,
    `hukommelsen endret ingen av ${a2.n} kortvalg gjennom A2. Da er ogsaa den ` +
      `andre kanalen dekorasjon, og K4 proeve A er tapt i begge ender.`,
  );

  /**
   * OG SÅ BRYTES FORUTSETNINGEN — men ikke slik den ble brutt før.
   *
   * Første utgave kjørte samme prøve med `forkamper: 0` og krevde at ingen
   * sete nådde `MIN_RUNDER`. Det virket den gang fordi `Profilbok.runder`
   * telte BUD, ikke runder: åtte spilte runder ga bare 2–3 bud, altså under
   * terskelen på fire.
   *
   * Den telleren var en feil, og den er rettet — `runder()` teller nå `bydde`,
   * som øker hver observerte runde. Da lærer økten INNENFOR selve målekampen,
   * som er hele poenget med et øktminne, og `forkamper: 0` isolerer ingenting
   * lenger.
   *
   * Den ekte nullarmen er den prøven allerede har: `tom = new Økt()`, en økt
   * som aldri har sett en runde. `motpartFor` gir da basis uendret PER
   * KONSTRUKSJON, og ruteren er en identitetsfunksjon. `endretNull` måles på
   * nøyaktig samme stillinger og samme trukne verdener som `endret`.
   */
  assert.equal(
    a2.endretNull,
    0,
    `en oekt som ALDRI har sett en runde endret likevel ${a2.endretNull} av ${a2.n} ` +
      `kortvalg. «motpartFor» skal gi basis uendret naar «aggressivitet» er null, ` +
      `saa da maaler A2-proeven noe annet enn hukommelse - og de ${a2.endret} over ` +
      `beviser ingenting.`,
  );
});
/**
 * ============ 7. PRØVE B — FRAMOVERBLIKKET ==============================
 *
 * AdamsMax: «Alpha-mu med M ≥ 2 søker over egne FRAMTIDIGE valg. Gevinsten ved
 * M=2 mot M=1 må være målt og positiv.»
 *
 * Testen tar det leddet som kan avgjøres uten statistikk: KOSTER den mer?
 * Forgreiner M=2 seg ikke over egne framtidige valg, gjør den nøyaktig samme
 * arbeid som M=1, og da er `m2` i speken like mye dekorasjon som `okt:` er bak
 * `vr:`.
 *
 * Gevinsten selv er en statistisk størrelse med to siffers standardfeil og
 * hører hjemme i `analyse/k4-hukommelse.txt`, ikke i en grønn hake. En
 * enhetstest som påstår et fortegn på n=10 er nøyaktig den feilen vedlegget
 * forbyr: «aldri adoptere på støy».
 */
test("K4 PROEVE B: M=2 soeker faktisk dypere enn M=1", () => {
  const b = prøveB({
    giv: 1,
    frøBase: FRØ + 1_000_000,
    verdener: 8,
    kandidater: 8,
    dommerVerdener: 16,
    maksPerGiv: 2,
    fraStikk: 3,
  });
  assert.ok(b.n >= 1, `proeve B fikk ${b.n} stillinger - ingenting ble soekt`);
  /**
   * TERSKELEN ER 1,15x OG IKKE 1,5x, OG DET ER MÅLT.
   *
   * Planen oppgir M=2 til 5,3x M=1 (24k32, førersete). Det tallet gjelder ikke
   * her: `alphaMu` beskjærer Pareto-fronten mot `maksFront = 16`, så dybden
   * koster mindre jo bredere forgreiningen er. Målt i denne fila: 2,6x fra
   * stikk 3 med 8 verdener, men bare 1,46x fra stikk 2 med 12.
   *
   * Første utgave sto på 1,5x og ville feilet på 1,46. Terskelen skal ligge der
   * den skiller «forgreiner seg» fra «gjør ingenting», ikke der jeg gjettet at
   * kostnaden lå.
   */
  assert.ok(
    b.msM2 > b.msM1 * 1.15,
    `M=2 kostet ${b.msM2.toFixed(0)} ms mot M=1s ${b.msM1.toFixed(0)} ms (` +
      `${(b.msM2 / Math.max(1e-9, b.msM1)).toFixed(2)}x). Under 1,15x forgreiner den seg ` +
      `ikke over egne framtidige valg, og «m2» i speken er dekorasjon.`,
  );
});

/**
 * ============ 8. NULLPUNKTET =============================================
 *
 * Vedlegget: «En knott må ha et nullpunkt som er bit-identisk med av.»
 *
 * `A_MINNE` uten én eneste observasjon må spille NØYAKTIG som `A_NULL`. Gjør
 * den ikke det, koster `profil:` noe allerede før den har lært noe — og da er
 * ingenting over en ren måling av hukommelse.
 */
test("K4: «profil:» uten observasjoner spiller identisk med stakken uten den", () => {
  const utenTikk = prøveA({
    spek: A_MINNE,
    medØkt: true,
    giv: 2,
    frøBase: FRØ,
    målRunde: MÅLRUNDE,
    tikk: false,
  });
  assert.equal(
    utenTikk.bokførte.reduce((a, b) => a + b, 0),
    0,
    `armen som skulle vaere tom hadde bokfoert noe - da er den ikke et nullpunkt`,
  );
  assert.equal(
    utenTikk.avvik,
    0,
    `«profil:» endret ${utenTikk.avvik} valg uten aa ha bokfoert én eneste runde. ` +
      `Nullpunktet er da ikke bit-identisk med «av».`,
  );
  assert.ok(BASE_DET.startsWith("budm:"), "den deterministiske kjernen har flyttet paa seg");
});
