/**
 * EPOKEDRIVERENS EGNE SKRANKER — de fire påstandene resten hviler på.
 *
 * `verktoy/mlb-epoke.py` binder sammen spill → erfaring → gradient → port. Tre
 * av leddene er allerede prøvd hver for seg (§120–§122). Det som IKKE var
 * prøvd, fordi det ikke fantes, er koblingene:
 *
 *   1. **Verdietiketten telesкoperer.** Fordelen `A = r + V(s') − V(s)` er bare
 *      TD-residualet til et konsistent mål hvis `V` spår RESTEN av kampen. Et
 *      perfekt verdihode må da gi `A = 0` på HVER rad. Gjør det ikke det, er
 *      det en systematisk skjevhet i gradienten, og den ville aldri vist seg
 *      som en feilmelding — bare som en policy som lærte noe annet enn vi tror.
 *   2. **`samleSeter` peker på kandidaten**, ikke på et navn som kan gjentas.
 *   3. **Vektfila kan skrives og leses tilbake bit-likt.**
 *   4. **Gjenspilling MED nettet i kandidatsetet** gir de samme kodene og den
 *      samme fasiten som spillingen — ellers er `V(s)` hentet fra en annen kamp
 *      enn den som ble spilt.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { HANDLING_LENGDE } from "../src/mlb/handling.ts";
import { Sandkassenett } from "../src/mlb/nett.ts";
import { TREKK_LENGDE } from "../src/mlb/trekk.ts";
import {
  diskontertRetur,
  gjenspill,
  kamploggFraLinje,
  kamploggTilLinje,
  spillKamp,
  gaeFordel,
  tdFordel,
  tilfeldigNett,
  type Beslutningsrad,
  type Sete,
} from "../src/mlb/selvspill.ts";
import { lagVane, VANER_TRENING } from "../src/mlb/liga.ts";

const MÅL = 30;
const MAKS_RUNDER = 40;

/** Ett bord: nettet i kandidatsetet, tre vaner rundt. Deterministisk. */
function bord(frø: number, kandidatsete: number): Sete[] {
  const nett = tilfeldigNett(lagRng(frø ^ 0x9e37_79b9));
  const ut: Sete[] = [];
  let j = 0;
  for (let i = 0; i < 4; i++) {
    if (i === kandidatsete) {
      ut.push({ navn: "kandidat", nett, temperatur: 1, samle: true });
    } else {
      const v = VANER_TRENING[j++ % VANER_TRENING.length]!;
      ut.push({ navn: v.navn, nett: null, temperatur: 0, egen: lagVane(v.spek), samle: false });
    }
  }
  return ut;
}

// ===========================================================================
// 1. Verdietiketten telesкoperer — et perfekt V gir A = 0
// ===========================================================================

test("et perfekt verdihode gir fordel = 0 paa hver eneste rad", () => {
  let rader = 0;
  let verste = 0;
  for (let g = 0; g < 6; g++) {
    const frø = 5_500_000 + g * 7717;
    const e = spillKamp({ frø, seter: bord(frø, g % 4), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
    /**
     * DET PERFEKTE VERDIHODET: «hvor mange poeng står igjen for dette setet ut
     * kampen?» Det er nøyaktig etiketten `mlb-erfaring.ts` skriver, og
     * identiteten `G(t) = r + G(t+1)` gjør at TD-residualet må bli null.
     *
     * Med RÅ sluttpoeng som etikett i stedet ville `A` blitt nøyaktig `r` på
     * hver rad — altså rundens poeng talt to ganger, og en fordel som ikke
     * måler valget i det hele tatt. Denne testen er hele forskjellen.
     */
    const perfekt = (r: Beslutningsrad): number =>
      (e.fasit.sluttpoeng[r.sete] ?? 0) - r.poengFør;
    for (let i = 0; i < e.rader.length; i++) {
      const a = tdFordel(e.rader, i, e.fasit, perfekt);
      verste = Math.max(verste, Math.abs(a));
      rader++;
    }
  }
  assert.ok(rader > 200, `for få rader (${rader}) til at prøven betyr noe`);
  assert.ok(verste < 1e-9, `perfekt V ga fordel ${verste}, skal være 0`);
});

test("GAE-endepunktene: lambda 0 er TD, lambda 1 er faktisk minus ventet", () => {
  const frø = 5_550_021;
  const e = spillKamp({ frø, seter: bord(frø, 3), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
  // Et vilkårlig, IKKE-perfekt verdianslag: endepunktene skal holde uansett
  // hvor galt V er, ellers er identiteten en tilfeldighet.
  const rng = lagRng(31337);
  const v = new Map<Beslutningsrad, number>(e.rader.map((r) => [r, (rng() - 0.5) * 40]));
  const V = (r: Beslutningsrad): number => v.get(r) ?? 0;

  const a0 = gaeFordel(e.rader, e.fasit, V, 0);
  for (let i = 0; i < e.rader.length; i++) {
    const td = tdFordel(e.rader, i, e.fasit, V);
    assert.ok(Math.abs(a0[i]! - td) < 1e-9, `rad ${i}: GAE(0) = ${a0[i]}, TD = ${td}`);
  }

  const a1 = gaeFordel(e.rader, e.fasit, V, 1);
  for (let i = 0; i < e.rader.length; i++) {
    const rad = e.rader[i]!;
    const g = (e.fasit.sluttpoeng[rad.sete] ?? 0) - rad.poengFør;
    assert.ok(
      Math.abs(a1[i]! - (g - V(rad))) < 1e-9,
      `rad ${i}: GAE(1) = ${a1[i]}, G − V = ${g - V(rad)}`,
    );
  }
  assert.ok(e.rader.length > 20, "for få rader");
});

// ===========================================================================
// 1b. DISKONTERINGEN (§124) — γ = 1 må være identiteten, og γ < 1 må dempe
// ===========================================================================

test("gamma = 1 gir eksakt sluttpoeng minus poengFoer", () => {
  const frø = 5_650_007;
  const e = spillKamp({ frø, seter: bord(frø, 1), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
  const g = diskontertRetur(e.rader, e.fasit, 1);
  let verste = 0;
  for (let i = 0; i < e.rader.length; i++) {
    const rad = e.rader[i]!;
    const fasit = (e.fasit.sluttpoeng[rad.sete] ?? 0) - rad.poengFør;
    verste = Math.max(verste, Math.abs(g[i]! - fasit));
  }
  assert.ok(e.rader.length > 20, "for få rader");
  // Er denne ikke 0, er hele §123s tallgrunnlag ikke lenger reproduserbart.
  assert.ok(verste < 1e-9, `gamma=1 avvek ${verste} fra «resten av kampen»`);
});

test("identiteten A = G^gamma - V holder for lambda = 1, ogsaa naar gamma < 1", () => {
  const frø = 5_650_019;
  const e = spillKamp({ frø, seter: bord(frø, 2), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
  const rng = lagRng(90_210);
  const v = new Map<Beslutningsrad, number>(e.rader.map((r) => [r, (rng() - 0.5) * 40]));
  const V = (r: Beslutningsrad): number => v.get(r) ?? 0;

  for (const gamma of [1, 0.7, 0.5, 0.3, 0]) {
    const a = gaeFordel(e.rader, e.fasit, V, 1, gamma);
    const g = diskontertRetur(e.rader, e.fasit, gamma);
    for (let i = 0; i < e.rader.length; i++) {
      const venta = g[i]! - V(e.rader[i]!);
      assert.ok(
        Math.abs(a[i]! - venta) < 1e-9,
        `gamma ${gamma}, rad ${i}: A = ${a[i]}, G^γ − V = ${venta}`,
      );
    }
  }
  assert.ok(e.rader.length > 20, "for få rader");
});

/**
 * γ SKAPER IKKE KREDITT INNAD I RUNDEN — DEN SKRUMPER STØYEN RUNDT DEN.
 *
 * Første utkast av denne prøven brukte `V ≡ 0` og krevde at γ < 1 flyttet
 * varians inn i runden. Den ble rød, og den hadde rett: med `V ≡ 0` er
 * `A = G^γ`, og `G^γ` er KONSTANT innenfor en runde uansett γ. Forskjellen
 * mellom to valg i samme runde er `V(s_2) − V(s_1)` og ingenting annet — for
 * enhver γ.
 *
 * Det γ gjør er å krympe det som ligger MELLOM runder, altså nevneren.
 * Kreditten innad i runden er uendret i absolutte tall, men den drukner ikke
 * lenger — og etter standardiseringen i `mlb-gradient.py` (`A` deles på sin
 * egen spredning) er det nøyaktig forholdet som avgjør hvor mye av steget som
 * peker på KORTET i stedet for på RUNDEN.
 *
 * Prøven bruker derfor en `V` som varierer innenfor runden, og krever at
 * andelen stiger uten at telleren rører seg.
 */
test("gamma < 1 krymper stoeyen rundt kredittilordningen, ikke kreditten", () => {
  const frø = 5_650_031;
  const e = spillKamp({ frø, seter: bord(frø, 0), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
  // Et verdianslag som FAKTISK varierer gjennom runden, slik et virksomt
  // verdihode ville gjort: «hvor langt er runden kommet».
  const V = (r: Beslutningsrad): number => r.stikkSpilt * 3;

  const oppdeling = (a: Float64Array): { innen: number; mellom: number } => {
    const grupper = new Map<string, number[]>();
    for (let i = 0; i < e.rader.length; i++) {
      const r = e.rader[i]!;
      const nøkkel = `${r.sete}:${r.rundeNr}`;
      let v = grupper.get(nøkkel);
      if (v === undefined) grupper.set(nøkkel, (v = []));
      v.push(a[i]!);
    }
    const alle = [...a];
    const snitt = alle.reduce((x, y) => x + y, 0) / alle.length;
    const tot = alle.reduce((x, y) => x + (y - snitt) ** 2, 0) / alle.length;
    let innen = 0;
    for (const v of grupper.values()) {
      const s = v.reduce((x, y) => x + y, 0) / v.length;
      for (const x of v) innen += (x - s) ** 2;
    }
    innen /= alle.length;
    return { innen, mellom: tot - innen };
  };

  const helt = oppdeling(gaeFordel(e.rader, e.fasit, V, 1, 1));
  const dempet = oppdeling(gaeFordel(e.rader, e.fasit, V, 1, 0.5));

  // TELLEREN RØRER SEG IKKE. Kreditten innad i runden er `V`-differansen, og
  // den er den samme for begge γ.
  assert.ok(
    Math.abs(helt.innen - dempet.innen) < 1e-9,
    `innenfor-variansen endret seg: ${helt.innen} mot ${dempet.innen}`,
  );
  // NEVNEREN KRYMPER. Det er hele virkningen, og den er stor.
  assert.ok(
    dempet.mellom < helt.mellom * 0.5,
    `gamma=0,5 krympet ikke stoeyen mellom runder (${dempet.mellom} mot ${helt.mellom})`,
  );
  const før = helt.innen / (helt.innen + helt.mellom);
  const etter = dempet.innen / (dempet.innen + dempet.mellom);
  assert.ok(etter > før * 1.5, `andelen innenfor steg ikke nok: ${før} -> ${etter}`);
});

test("summen av r over ett sete er setets kamppoeng", () => {
  const frø = 5_600_013;
  const e = spillKamp({ frø, seter: bord(frø, 2), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
  const først = e.rader[0]!;
  // Fordelen med V ≡ 0 er nettopp `r`. Summen skal da bli hele kampen.
  let sum = 0;
  for (let i = 0; i < e.rader.length; i++) sum += tdFordel(e.rader, i, e.fasit, () => 0);
  const fasit = (e.fasit.sluttpoeng[først.sete] ?? 0) - først.poengFør;
  assert.ok(e.rader.length > 20, "for få rader");
  assert.ok(Math.abs(sum - fasit) < 1e-9, `sum r = ${sum}, kamppoeng = ${fasit}`);
});

// ===========================================================================
// 2. samleSeter
// ===========================================================================

test("samleSeter peker paa kandidatsetet, ikke paa et navn", () => {
  for (let s = 0; s < 4; s++) {
    const frø = 5_700_000 + s * 7717;
    const e = spillKamp({ frø, seter: bord(frø, s), målPoeng: MÅL, maksRunder: MAKS_RUNDER });
    assert.deepEqual([...(e.logg.samleSeter ?? [])], [s]);
    for (const r of e.rader) assert.equal(r.sete, s, "en rad kom fra feil sete");
    // Og den overlever serialiseringen — det er formen som havner på disk.
    const om = kamploggFraLinje(kamploggTilLinje(e.logg));
    assert.deepEqual([...(om.samleSeter ?? [])], [s]);
  }
});

// ===========================================================================
// 3. Vektfila skrives og leses tilbake bit-likt
// ===========================================================================

test("Sandkassenett.tilBytes -> fraBytes er bit-likt", () => {
  const n = Sandkassenett.tilfeldig(4242, [64, 32]);
  const b = n.tilBytes();
  const om = Sandkassenett.fraBytes(b);
  assert.deepEqual(om.form(), n.form());
  assert.deepEqual(om.parametre(), n.parametre());
  const trekk = new Float32Array(TREKK_LENGDE);
  const rng = lagRng(99);
  for (let i = 0; i < trekk.length; i++) trekk[i] = rng() * 2 - 1;
  const a = n.framover(trekk);
  const c = om.framover(trekk);
  assert.deepEqual([...c.policy], [...a.policy]);
  assert.deepEqual([...c.tro], [...a.tro]);
  assert.equal(c.verdi, a.verdi);
  // Og bytene skal være de samme igjen — ellers er skriveren ikke en invers.
  assert.deepEqual([...om.tilBytes()], [...b]);
});

// ===========================================================================
// 4. Gjenspilling MED nettet i kandidatsetet
// ===========================================================================

test("gjenspilling med nettet paa gir samme kamp, og V bare i kandidatsetet", () => {
  const frø = 5_800_017;
  const kandidatsete = 1;
  const e = spillKamp({
    frø,
    seter: bord(frø, kandidatsete),
    målPoeng: MÅL,
    maksRunder: MAKS_RUNDER,
    samleTrekk: true,
  });

  const nett = tilfeldigNett(lagRng(frø ^ 0x9e37_79b9));
  const seter: Sete[] = e.logg.seter.map((navn, i) => ({
    navn,
    nett: i === kandidatsete ? nett : null,
    temperatur: 0,
    egen: () => {
      throw new Error("gjenspill skal lese koden fra loggen");
    },
    samle: i === kandidatsete,
  }));
  const g = gjenspill(e.logg, { seter, samleTrekk: true, maksRunder: MAKS_RUNDER });

  assert.equal(g.rader.length, e.rader.length, "ulikt antall rader");
  assert.equal(g.fasit.vinner, e.fasit.vinner);
  assert.deepEqual([...g.fasit.sluttpoeng], [...e.fasit.sluttpoeng]);
  for (let i = 0; i < g.rader.length; i++) {
    const a = e.rader[i]!;
    const b = g.rader[i]!;
    assert.equal(b.kode, a.kode, `rad ${i}: ulik kode`);
    assert.equal(b.sete, kandidatsete);
    assert.equal(b.lovlige, a.lovlige);
    assert.equal(b.poengFør, a.poengFør);
    assert.notEqual(b.verdi, null, "kandidatsetet mangler V(s)");
    assert.equal(b.trekk?.length, TREKK_LENGDE);
    assert.equal(b.maske?.length, HANDLING_LENGDE);
    assert.deepEqual([...b.trekk!], [...a.trekk!], `rad ${i}: trekkvektoren er ikke identisk`);
  }
});

// ===========================================================================
// 5. MLBE-formatets radstørrelse — den kan ikke endres i stillhet
// ===========================================================================

test("MLBE-radens bredde er den avtalte", () => {
  /**
   * Tallet står også i `verktoy/mlb-gradient.py` sin `post_dtype`, og skriveren
   * legger det i FILHODET slik at leseren kan kreve at de tre er enige. Endres
   * layouten uten at alle tre følger med, leser `numpy.fromfile` forskjøvet og
   * gir et korpus som SER ut som tall.
   */
  const post = TREKK_LENGDE * 4 + HANDLING_LENGDE + 52 + 2 * 4 + 4 * 3;
  assert.equal(TREKK_LENGDE, 1032);
  assert.equal(HANDLING_LENGDE, 68);
  assert.equal(post, 4268);
});
