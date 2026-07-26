import { strict as assert } from "node:assert";
import { test } from "node:test";

import { kortId, type Farge, type Kort, type Verdi } from "../src/kort.ts";
import { opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import {
  Konvensjonsvakt,
  delVaktspek,
  garantertVårt,
  lesVaktflagg,
  slårEgetEtterlyst,
  vaktKort,
  type Vaktvalg,
} from "../src/moe2/konvensjonsvakt.ts";
import { lagetSynlig } from "../src/moe2/synlig.ts";

/**
 * Testene låser de to konvensjonsreglene i src/moe2/konvensjonsvakt.ts, og
 * særlig GRENSENE for dem: en vakt som slår inn i feil sete eller på et
 * uavklart stikk gjør skade i stedet for nytte. Derfor er halvparten av
 * testene her negative – «vakten skal IKKE røre dette valget».
 */

const k = (farge: Farge, verdi: Verdi): Kort => ({ farge, verdi });
const A_ÅPNING: Vaktvalg = { åpning: true, garantiIkkeTrumf: false, garantiBilligst: false };
const T_IKKE_TRUMF: Vaktvalg = { åpning: false, garantiIkkeTrumf: true, garantiBilligst: false };
const B_BILLIGST: Vaktvalg = { åpning: false, garantiIkkeTrumf: false, garantiBilligst: true };

/**
 * En spillestilling bygget for hånd. Bare feltene vakten faktisk leser settes:
 * egen hånd, bordet, trumf, etterlysning, lag og historikk. Motstandernes
 * hender står tomme med vilje – vakten har ikke lov til å se dem, så en test
 * som virker uten dem beviser samtidig at den ikke gjør det.
 */
function stilling(over: Partial<GameState>): GameState {
  const base = opprettSpill({}, 1);
  return {
    ...base,
    fase: "SPILL",
    hender: [[], [], [], []],
    vrak: [],
    historikk: [],
    bord: [],
    stikkSpilt: 0,
    stikkVunnet: [0, 0, 0, 0],
    trumf: "S",
    etterlyst: null,
    budvinner: 0,
    makker: null,
    makkerAvslørt: false,
    iTur: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Vakt 1 – slå aldri ditt eget etterlyste kort
// ---------------------------------------------------------------------------

test("vakt 1: åpningsutspillet slår ikke det etterlyste kortet", () => {
  // Budvinner sitter med trumfesset og en treer; det etterlyste er damen.
  // Motoren tvinger trumfutspill i stikk 1, så valget står mellom S14 og S3.
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    iTur: 0,
    hender: [[k("S", 14), k("S", 3), k("H", 2)], [], [], []],
  });
  assert.equal(slårEgetEtterlyst(s, 0, k("S", 14)), true);
  assert.equal(slårEgetEtterlyst(s, 0, k("S", 3)), false);
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), A_ÅPNING)), kortId(k("S", 3)));
  // Et utspill som allerede lar det etterlyste stå, røres ikke.
  assert.equal(kortId(vaktKort(s, 0, k("S", 3), A_ÅPNING)), kortId(k("S", 3)));
});

test("vakt 1, variant «h»: høyeste utspill som fortsatt lar det etterlyste stå", () => {
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    iTur: 0,
    hender: [[k("S", 14), k("S", 8), k("S", 3)], [], [], []],
  });
  const h = lesVaktflagg("h");
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), h)), kortId(k("S", 8)));
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), A_ÅPNING)), kortId(k("S", 3)));
  // På et PÅLEGG er kortet bortkastet uansett, og da gjelder billigst for begge.
  const pålegg = stilling({
    ...s,
    makker: 1,
    makkerAvslørt: true,
    stikkSpilt: 2,
    bord: [
      { spiller: 2, kort: k("S", 2) },
      { spiller: 1, kort: k("S", 12) },
    ],
  });
  assert.equal(kortId(vaktKort(pålegg, 0, k("S", 14), h)), kortId(k("S", 3)));
});

test("vakt 1: må alle lovlige kort slå det etterlyste, velges det billigste", () => {
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    iTur: 0,
    hender: [[k("S", 14), k("S", 13), k("H", 2)], [], [], []],
  });
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), A_ÅPNING)), kortId(k("S", 13)));
});

test("vakt 1: legger seg ikke over det etterlyste kortet på bordet", () => {
  // Forsvarer 2 har ledet, makkeren har lagt det etterlyste kortet og leder
  // stikket. Budvinneren har både esset og en femmer i fargen.
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    makker: 1,
    makkerAvslørt: true,
    stikkSpilt: 2,
    iTur: 0,
    hender: [[k("S", 14), k("S", 5), k("H", 2)], [], [], []],
    bord: [
      { spiller: 2, kort: k("S", 3) },
      { spiller: 1, kort: k("S", 12) },
    ],
  });
  assert.equal(slårEgetEtterlyst(s, 0, k("S", 14)), true);
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), A_ÅPNING)), kortId(k("S", 5)));
});

test("vakt 1 slår IKKE inn når vi ikke er på budlaget", () => {
  // Nøyaktig samme bord, men det er en FORSVARER som er i tur. For ham er det
  // etterlyste kortet motstanderens, og å slå det er hele poenget.
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    makker: 1,
    makkerAvslørt: true,
    stikkSpilt: 2,
    iTur: 3,
    hender: [[], [], [], [k("S", 14), k("S", 5)]],
    bord: [
      { spiller: 2, kort: k("S", 3) },
      { spiller: 1, kort: k("S", 12) },
    ],
  });
  assert.equal(slårEgetEtterlyst(s, 3, k("S", 14)), false);
  assert.equal(kortId(vaktKort(s, 3, k("S", 14), A_ÅPNING)), kortId(k("S", 14)));
});

test("vakt 1 slår ikke inn i senere stikk uten makkerplikt", () => {
  // Stikk 3, bordet tomt, det etterlyste kortet er fortsatt ute: ingen plikt
  // tvinger makkeren til å legge det, så en høy trumf er ikke konvensjonsbrudd.
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    stikkSpilt: 2,
    iTur: 0,
    hender: [[k("S", 14), k("S", 3)], [], [], []],
  });
  assert.equal(slårEgetEtterlyst(s, 0, k("S", 14)), false);
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), A_ÅPNING)), kortId(k("S", 14)));
});

test("vakt 1 rører ikke stillinger uten etterlysning (solo)", () => {
  const s = stilling({
    trumf: "S",
    etterlyst: null,
    budvinner: 0,
    iTur: 0,
    hender: [[k("S", 14), k("S", 3)], [], [], []],
  });
  assert.equal(kortId(vaktKort(s, 0, k("S", 14), A_ÅPNING)), kortId(k("S", 14)));
});

// ---------------------------------------------------------------------------
// Vakt 2 – garantert stikk
// ---------------------------------------------------------------------------

/**
 * Forsvarer 1 har ledet hjerter, makkeren (sete 2) har trumfet inn med
 * trumfesset. Ingenting kan slå det, så stikket er garantert – også med bare
 * spillerens egen informasjon. Sete 0 er renons i hjerter og kan kaste fritt.
 */
const GARANTERT = stilling({
  trumf: "S",
  etterlyst: k("S", 14),
  budvinner: 0,
  makker: 2,
  makkerAvslørt: true,
  stikkSpilt: 3,
  iTur: 0,
  hender: [[k("S", 2), k("R", 2), k("R", 14)], [], [], []],
  bord: [
    { spiller: 1, kort: k("H", 5) },
    { spiller: 2, kort: k("S", 14) },
  ],
});

test("vakt 2: stikket er garantert ut fra synlig informasjon", () => {
  assert.deepEqual(lagetSynlig(GARANTERT, 0), [0, 2]);
  assert.equal(garantertVårt(GARANTERT, 0), true);
});

test("vakt 2 «aldri trumf»: bytter bort trumfen, men ikke det dyre sidekortet", () => {
  assert.equal(kortId(vaktKort(GARANTERT, 0, k("S", 2), T_IKKE_TRUMF)), kortId(k("R", 2)));
  // Å kjøpe utspillet med et SIDEKORT er ikke det målte hullet (MesterAI gjør
  // det selv i 41 % av de garanterte), så den milde vakten lar det stå.
  assert.equal(kortId(vaktKort(GARANTERT, 0, k("R", 14), T_IKKE_TRUMF)), kortId(k("R", 14)));
});

test("vakt 2 «alltid billigst»: tar også det dyre sidekortet", () => {
  assert.equal(kortId(vaktKort(GARANTERT, 0, k("S", 2), B_BILLIGST)), kortId(k("R", 2)));
  assert.equal(kortId(vaktKort(GARANTERT, 0, k("R", 14), B_BILLIGST)), kortId(k("R", 2)));
});

test("vakt 2 slår ikke inn når stikket IKKE er garantert", () => {
  // Samme stilling, men makkeren har lagt trumfkongen: trumfesset er usett, og
  // sete 3 kan fortsatt overta. Da er overtak et legitimt valg.
  const s = stilling({
    ...GARANTERT,
    etterlyst: k("S", 13),
    bord: [
      { spiller: 1, kort: k("H", 5) },
      { spiller: 2, kort: k("S", 13) },
    ],
  });
  assert.equal(garantertVårt(s, 0), false);
  assert.equal(kortId(vaktKort(s, 0, k("S", 2), T_IKKE_TRUMF)), kortId(k("S", 2)));
  assert.equal(kortId(vaktKort(s, 0, k("R", 14), B_BILLIGST)), kortId(k("R", 14)));
});

test("vakt 2 slår ikke inn når det er en MOTSTANDER som leder stikket", () => {
  const s = stilling({
    ...GARANTERT,
    bord: [
      { spiller: 2, kort: k("H", 5) },
      { spiller: 1, kort: k("S", 14) },
    ],
  });
  assert.equal(garantertVårt(s, 0), false);
  assert.equal(kortId(vaktKort(s, 0, k("S", 2), B_BILLIGST)), kortId(k("S", 2)));
});

test("vakt 2 bruker ikke lagkunnskap før makkeren er avslørt", () => {
  // Uten `makkerAvslørt` vet ingen andre enn kortholderen selv hvem makkeren
  // er. Vakten må da la valget stå, selv om fasiten sier at laget har stikket.
  const s = stilling({ ...GARANTERT, makkerAvslørt: false });
  assert.equal(lagetSynlig(s, 0), null);
  assert.equal(garantertVårt(s, 0), false);
  assert.equal(kortId(vaktKort(s, 0, k("S", 2), B_BILLIGST)), kortId(k("S", 2)));
});

test("lagetSynlig: den som sitter med det etterlyste kortet vet at han er makker", () => {
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 14),
    budvinner: 0,
    makker: 2,
    makkerAvslørt: false,
    hender: [[], [], [k("S", 14), k("R", 3)], []],
  });
  assert.deepEqual(lagetSynlig(s, 2), [2, 0]);
  assert.equal(lagetSynlig(s, 1), null);
  // Solo: at budvinneren spiller alene er offentlig kjent fra meldingen.
  const solo = stilling({ etterlyst: null, budvinner: 1 });
  assert.deepEqual(lagetSynlig(solo, 1), [1]);
  assert.deepEqual(lagetSynlig(solo, 0), [0, 2, 3]);
});

// ---------------------------------------------------------------------------
// Innpakningen
// ---------------------------------------------------------------------------

test("vakten rører bare SPILL-handlinger", () => {
  const bud: Handling = { type: "BUD", spiller: 0, bud: 7 };
  const vakt = new Konvensjonsvakt({ velgHandling: () => bud }, A_ÅPNING);
  assert.equal(vakt.velgHandling(stilling({})), bud);
  assert.equal(vakt.valgTotalt, 0);
});

test("vakten teller overstyringene sine", () => {
  const s = stilling({
    trumf: "S",
    etterlyst: k("S", 12),
    budvinner: 0,
    iTur: 0,
    hender: [[k("S", 14), k("S", 3)], [], [], []],
  });
  const vakt = new Konvensjonsvakt(
    { velgHandling: () => ({ type: "SPILL", spiller: 0, kort: k("S", 14) }) },
    A_ÅPNING,
  );
  const h = vakt.velgHandling(s);
  assert.equal(h.type === "SPILL" && kortId(h.kort), kortId(k("S", 3)));
  assert.equal(vakt.overstyrt, 1);
  assert.equal(vakt.valgTotalt, 1);
});

test("vakten spiller hele kamper uten å bryte reglene", () => {
  // Motoren validerer hvert kort. Går en full kamp gjennom uten unntak, kan
  // vakten ikke ha returnert et ulovlig kort i noen av stillingene.
  const nevro = new NevroAgent();
  const vakt = new Konvensjonsvakt(nevro, { åpning: true, garantiIkkeTrumf: true, garantiBilligst: true });
  vakt.nyKamp();
  let s: GameState = opprettSpill({}, 4711);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    s = utfør(s, s.fase === "RUNDE_SLUTT" ? { type: "NESTE" } : vakt.velgHandling(s)).state;
  }
  assert.equal(s.fase, "FERDIG");
  assert.ok(vakt.overstyrt > 0, "vakten skal ha slått inn minst én gang i en hel kamp");
});

// ---------------------------------------------------------------------------
// Spesifikasjonsstrengen
// ---------------------------------------------------------------------------

test("vaktspesifikasjonen leses som skrevet", () => {
  assert.deepEqual(lesVaktflagg("a"), { åpning: true, garantiIkkeTrumf: false, garantiBilligst: false });
  assert.deepEqual(lesVaktflagg("tb"), { åpning: false, garantiIkkeTrumf: true, garantiBilligst: true });
  assert.deepEqual(delVaktspek("vakt:ab:e1:e1-modell/sd-r2.bin"), {
    valg: { åpning: true, garantiIkkeTrumf: false, garantiBilligst: true },
    flagg: "ab",
    indre: "e1:e1-modell/sd-r2.bin",
  });
  assert.equal(delVaktspek("nevro"), null);
  assert.throws(() => delVaktspek("vakt:a"), /mangler indre kandidat/);
  assert.throws(() => lesVaktflagg("x"), /Ukjent vaktflagg/);
});
