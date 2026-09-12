/**
 * TO STILLE FEIL I SPEKEN — profilen som ikke naar budet, og knotten som slaar
 * av soeket i stillhet.
 *
 * ================= HVA SOM VAR GALT =====================================
 *
 * 1. `profil:` fester seg paa `settForsvarsjustering` i laget RETT UNDER seg.
 *    I `…:profil:budm:…` (koblingssjekkens form) virker det. I
 *    `…:profil:sik:…:budm:…` (helbotens form) gjoer det ikke: budagenten
 *    FINNES, den ligger ett lag for dypt, og `bud` blir `null` uten et pip.
 *
 * 2. `r`, `d` og `B` leses bare av `amu:`-grenen. Skrives de i en sik-spek,
 *    havner halen i kandidatfeltet, `Number("16d4")` er `NaN`, og hver eneste
 *    verdenstrekning returnerer `null`. Speken ser ut som den soeker, og soeket
 *    er helt av.
 *
 * Begge er §99-mønsteret: en evne som ser levende ut fordi den staar i
 * strengen. Samme klasse som kanal 2, som var bygd, maalt og frakoblet fra det
 * soeket helboten faktisk kjoerer.
 *
 * Smaa tall med vilje: CPU-en deles med treningen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Økt } from "../src/moe2/okt.ts";

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";
const BUD = "budm:e1-modell/bud-vant.json@-3.0";

/**
 * Leser hva objektet FAKTISK inneholder etter bygging. `private` i TypeScript er
 * en kompileringsregel, ikke en kjoeretidsregel — og det var nettopp loeftet fra
 * typen, ikke innholdet, som lot kanalen staa doed.
 */
function budleddet(agent: unknown): { funnet: boolean; koblet: boolean; dybde: number } {
  let x = agent as Record<string, unknown> | null | undefined;
  for (let dybde = 0; x != null && dybde < 30; dybde++) {
    if (typeof x["settForsvarsjustering"] === "function") {
      return { funnet: true, koblet: x["forsvarsjustering"] != null, dybde };
    }
    x = x["indre"] as Record<string, unknown> | null | undefined;
  }
  return { funnet: false, koblet: false, dybde: -1 };
}

// ===========================================================================
// 1. AV ER AV — «profil:» skal bygge NOEYAKTIG som foer
// ===========================================================================

test("profil: uten «d» er uendret - fester seg naert, og IKKE gjennom soekelaget", () => {
  const nært = budleddet(lagIndre(`profil:${BUD}:${NETT}`));
  assert.equal(nært.funnet, true);
  assert.equal(nært.dybde, 1, "budagenten ligger rett under, som foer");
  assert.equal(nært.koblet, true, "og der HAR profilen alltid naadd fram");

  /**
   * DETTE ER «AV»-TILFELLET, og det skal fortsatt vaere doedt. Endrer denne raden
   * seg til `true`, er `profild:` ikke lenger opt-in — da har hver eneste maaling
   * som er gjort med `…:profil:sik:…` stille faatt en ny budkanal.
   */
  const gjennomSøk = budleddet(lagIndre(`profil:sik:alle:0.5:6k8:${BUD}:${NETT}`));
  assert.equal(gjennomSøk.funnet, true, "budagenten FINNES under soekelaget");
  assert.equal(gjennomSøk.dybde, 2, "den ligger bare ett lag for dypt");
  assert.equal(
    gjennomSøk.koblet,
    false,
    "uten «d» skal justeringen IKKE settes - dette er formen helboten har, og den skal staa urørt",
  );
});

test("profil: og profild: er samme bot naar budlaget ligger rett under", () => {
  /**
   * Ligger budagenten paa dybde 1, tar `profild:` den samme grenen som `profil:`
   * (det dype oppslaget kjoeres ikke i det hele tatt). Da skal ikke ett eneste
   * valg flytte seg — ellers er «av» ikke av.
   */
  const A = [0, 1, 2, 3].map(() => lagIndre(`profil:${BUD}:${NETT}`));
  const B = [0, 1, 2, 3].map(() => lagIndre(`profild:${BUD}:${NETT}`));
  for (const x of [...A, ...B]) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 7_310_001);
  let vakt = 0;
  let r = 0;
  let n = 0;
  let ulik = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000 && r < 3) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const x of [...A, ...B]) x.velgHandling(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const ha = A[iTur]!.velgHandling(s);
    const hb = B[iTur]!.velgHandling(s);
    n++;
    if (JSON.stringify(ha) !== JSON.stringify(hb)) ulik++;
    s = utfør(s, ha).state;
  }
  assert.ok(n > 0, "proeven maa faktisk ha maalt noen valg");
  assert.equal(ulik, 0, `profild: flyttet ${ulik} av ${n} valg der budlaget alt var i rekkevidde`);
});

// ===========================================================================
// 2. KOBLET — «profild:» naar fram gjennom soekelaget
// ===========================================================================

test("profild: naar budlaget gjennom soekelaget - i BEGGE formene helboten bruker", () => {
  const u = budleddet(lagIndre(`profild:sik:alle:0.5:6k8:${BUD}:${NETT}`));
  assert.equal(u.funnet, true);
  assert.equal(u.dybde, 2);
  assert.equal(u.koblet, true, "«d» skal finne budagenten under soekelaget");

  // Med oekt: samme svar. Oekten bytter ut boka, ikke veien ned til budet.
  const m = budleddet(lagIndre(`profild:sik:alle:0.5:6k8:${BUD}:${NETT}`, { økt: new Økt() }));
  assert.equal(m.koblet, true, "oekten skal ikke endre om budkanalen finner fram");
});

test("profild: finner ingenting naar det ikke FINNES noe budlag - og sier ikke at den gjorde", () => {
  /**
   * Dagens helbot byr med `budq:`, og BudQagent er ikke `Budjusterbar` i det hele
   * tatt (`settForsvarsjustering` finnes bare i `budmodell.ts`). `profild:` skal
   * da oppfoere seg som `profil:` — ikke kaste, og ikke late som.
   */
  const u = budleddet(lagIndre(`profild:sik:alle:0.5:6k8:${NETT}`));
  assert.equal(u.funnet, false, "det finnes ingen budagent i denne kjeden");
  assert.equal(typeof lagIndre(`profild:sik:alle:0.5:6k8:${NETT}`).velgHandling, "function");
});

// ===========================================================================
// 3. KANDIDATFELTET — en svelget knott slaar av HELE soeket
// ===========================================================================

test("sik: avviser amu-knottene r / d / B i stedet for aa svelge dem", () => {
  for (const knott of ["r1.5", "d4", "B4"]) {
    assert.throws(
      () => lagIndre(`sik:alle:0.5:12k16${knott}:${NETT}`),
      /Ugyldig kandidatfelt/,
      `«${knott}» i en sik-spek maa kaste - foer denne endringen ble den NaN og slo av soeket`,
    );
  }
});

test("gyldige sik-speker bygger fortsatt, med og uten «k»", () => {
  for (const felt of ["12k16", "12", "6k8", "24k32e3L", "4k8e3LD", "8e4amin"]) {
    assert.equal(
      typeof lagIndre(`sik:alle:0.5:${felt}:${NETT}`).velgHandling,
      "function",
      `«${felt}» er en gyldig sik-spek og skal fortsatt bygge`,
    );
  }
});

test("kandidatfeltet maa vaere et HELT tall ≥ 1", () => {
  for (const felt of ["12k0", "12k-1", "12k1.5", "12k"]) {
    assert.throws(() => lagIndre(`sik:alle:0.5:${felt}:${NETT}`), /Ugyldig kandidatfelt/, `«${felt}» maa kaste`);
  }
});
