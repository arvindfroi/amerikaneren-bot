/**
 * NULL-PUNKTET I SUMMEFORMEN ER HELLIG.
 *
 * `sum:nett=1:e1:<fil>` skal velge NØYAKTIG de kortene `E1Agent` velger alene.
 * Ikke «nesten», ikke «i 99,8 % av stillingene» — kort for kort.
 *
 * ================= HVORFOR DEN TESTEN OG IKKE EN BENK ==================
 *
 * Summen er en ny arkitektur for de samme fem delene. Det eneste som gjør den
 * målbar mot stabelen, er at den har et kjent utgangspunkt: med alle vekter
 * unntatt nettets på null ER den nettet. Holder ikke det, måler en sveip over
 * vektene ikke «hva hvert ledd er verdt» — den måler forskjellen mellom to
 * ulike bots pluss vektene, og ingen kan skille de to bidragene etterpå.
 *
 * Det er samme lærdom som `r0.4`, `vetoMargin=0` og `lambda=0`: hver eneste
 * knott i dette prosjektet har et dokumentert null-punkt, fordi en sveip som
 * ikke starter fra noe kjent ikke kan tolkes.
 *
 * ================= HVA SOM FÅR DEN TIL Å FEILE =========================
 *
 * Uavgjortregelen i `velgSum` som ikke lenger er `E1Agent.velgKort` sin. En
 * normalisering som slår inn når bare ett ledd bidrar. Et ledd som svarer med
 * nuller i stedet for et tomt kart. Alle tre har vært skrevet én gang hver i
 * denne fila, og alle tre flytter valg i stillinger ingen har bedt om.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, lesNett, lesSumvekter } from "../src/moe2/agentspek.ts";
import { argmaks, velgSum, type Ledd } from "../src/moe2/sumvelger.ts";
import { lagSumledd } from "../src/moe2/sumledd.ts";
import { rangOgPolicy } from "../src/moe2/stilbias.ts";
import type { Scorbar } from "../src/moe2/konvensjonsvakt.ts";
import type { Økt } from "../src/moe2/okt.ts";
import { forover } from "../src/nevro/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const NETT = "e1:e1-modell/d7alle.bin";

/**
 * Spiller en kamp med faste `NevroAgent`-er og kaller `sjekk` i HVER
 * spillstilling med mer enn ett lovlig kort — alle fire setene, ikke bare
 * førerens. Drivkraften er referanseagentene og ikke kandidatene, så
 * stillingene avhenger bare av frøet: to armer møter nøyaktig de samme.
 */
function overStillinger(
  frø: number,
  maks: number,
  sjekk: (s: GameState, sete: number) => void,
): number {
  const ref = [0, 1, 2, 3].map(() => new NevroAgent());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let n = 0;
  let vakt = 0;
  while (n < maks && s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iT === null || iT === undefined) break;
    if (s.fase === "SPILL" && lovligeKort(s, iT).length > 1) {
      sjekk(s, iT);
      n++;
    }
    s = utfør(s, ref[iT]!.velgHandling(s)).state;
  }
  return n;
}

const kortNavn = (s: GameState, agent: { velgHandling(x: GameState): { type: string } }): string => {
  const h = agent.velgHandling(s) as { type: string; kort?: { farge: string; verdi: number } };
  assert.equal(h.type, "SPILL");
  return `${h.kort!.farge}${h.kort!.verdi}`;
};

test("sum:nett=1 velger kort for kort som E1Agent alene", () => {
  const sum = lagIndre(`sum:nett=1:${NETT}`);
  const nett = lagIndre(NETT);
  let stillinger = 0;
  for (const frø of [987654, 20260809, 4242, 1]) {
    stillinger += overStillinger(frø, 150, (s, sete) => {
      const a = kortNavn(s, sum);
      const b = kortNavn(s, nett);
      assert.equal(a, b, `sete ${sete}, stikk ${s.stikkSpilt}: summen la ${a}, nettet ${b}`);
    });
  }
  // En grønn test over tolv stillinger beviser ingenting. Tallet er en
  // NEDRE grense på beviset, ikke en forventning om nøyaktig antall.
  assert.ok(stillinger >= 400, `bare ${stillinger} stillinger ble sammenliknet`);
});

/**
 * VEKTEN PÅ ET ENSLIG LEDD KAN IKKE FLYTTE ARGMAKS. Den er en skalering, og
 * den skal være det: et null-punkt som bare gjelder for vekt nøyaktig 1 ville
 * vært et sammentreff og ikke en egenskap.
 */
test("nettleddet er skalainvariant – vekt 1, 2 og 0,25 gir samme kort", () => {
  const armer = ["1", "2", "0.25"].map((w) => lagIndre(`sum:nett=${w}:${NETT}`));
  const n = overStillinger(31337, 120, (s) => {
    const fasit = kortNavn(s, armer[0]!);
    for (const a of armer.slice(1)) assert.equal(kortNavn(s, a), fasit);
  });
  assert.ok(n >= 100, `bare ${n} stillinger`);
});

/**
 * ET LEDD MED VEKT 0 SKAL IKKE KALLES.
 *
 * Ikke «kalles og ganges med null»: søkeleddet koster en full alpha-mu per
 * beslutning. En sveip som slår av søket for å måle resten, men fortsatt
 * betaler for det, ville tatt like lang tid som den fulle — og da måles ikke
 * kostnaden av leddet, bare av koden rundt.
 */
test("velgSum kaller ikke et ledd med vekt 0", () => {
  const bombe: Ledd = {
    navn: "bombe",
    vekt: 0,
    poeng: () => {
      throw new Error("et ledd med vekt 0 ble kalt");
    },
  };
  const nett = lagIndre(NETT) as unknown as { scorer(s: GameState, p: number): Map<number, number> };
  const nettledd: Ledd = { navn: "nett", vekt: 1, poeng: (s, p) => nett.scorer(s, p) };
  const n = overStillinger(555, 40, (s, sete) => {
    const v = velgSum(s, sete, [nettledd, bombe]);
    assert.ok(v !== null);
  });
  assert.ok(n >= 30, `bare ${n} stillinger`);
});

/**
 * OVERSTYRINGEN ER ET SPESIALTILFELLE AV SUMMEN.
 *
 * `konvensjonsvakt.ts` sier det i ord: vekt 0 = vakten finnes ikke, vekt →
 * uendelig = dagens overstyring. Dette måler det. Uten testen er påstanden en
 * kommentar, og kommentarer kan ikke feile.
 */
test("vaktleddet med enorm vekt gir nøyaktig Konvensjonsvaktens kort", () => {
  const sum = lagIndre(`sum:nett=1,vakt=1e9:vakt:abmpf:${NETT}`);
  const stabel = lagIndre(`vakt:abmpf:${NETT}`);
  const n = overStillinger(24680, 150, (s) => {
    assert.equal(kortNavn(s, sum), kortNavn(s, stabel));
  });
  assert.ok(n >= 100, `bare ${n} stillinger`);
});

/**
 * SPEKEN FEILER HØYT PÅ SØPPEL.
 *
 * `tall()` finnes fordi et NaN-frø 5. august ga samme giv om og om igjen — en
 * måling som så ferdig ut og var søppel. En NaN-VEKT er verre: hele summen blir
 * NaN, alle kort får samme poeng, og uavgjortregelen legger første lovlige kort
 * i hver eneste stilling. Det ser ut som en bot og er en konstant.
 */
test("sum-speken kaster på hver form for søppel", () => {
  const feil: [string, RegExp][] = [
    [`sum::${NETT}`, /Tom vektliste/],
    [`sum:nett=1`, /forventet sum:<vekter>:<indre>/],
    [`sum:nett:${NETT}`, /forventet <navn>=<verdi>/],
    [`sum:nett=:${NETT}`, /må være et tall/],
    [`sum:nett=x:${NETT}`, /må være et tall/],
    [`sum:nett=1,:${NETT}`, /Tomt felt/],
    [`sum:nett=1,nett=2:${NETT}`, /oppgitt to ganger/],
    [`sum:nett=1,vekt=2:${NETT}`, /Ukjent felt/],
    [`sum:nett=0,vakt=0,sok=0,stil=0,race=0:${NETT}`, /Alle vektene/],
    [`sum:nett=1,verdener=0:${NETT}`, /helt tall/],
    [`sum:nett=1,verdener=1.5:${NETT}`, /helt tall/],
    [`sum:nett=1,roller=alle2:${NETT}`, /Ukjent rolle/],
    // Kildene MÅ finnes når leddet har vekt. Et stumt ledd er verre enn et
    // fraværende: det ser ut som en arm i en sveip og bidrar ingenting.
    [`sum:nett=1,vakt=0.3:${NETT}`, /ingen konvensjonsflagg/],
    [`sum:nett=1,stil=0.3:${NETT}`, /ingen «okt:»/],
    [`sum:nett=1:nevro`, /Fant ingen «e1:<fil>»/],
  ];
  for (const [spek, mønster] of feil) {
    assert.throws(() => lagIndre(spek), mønster, `«${spek}» burde kastet`);
  }
});

test("vektlista leses uavhengig av rekkefølge, og knottene har null-punkt", () => {
  const a = lesSumvekter("nett=1,race=0.2", "sum:…").vekter;
  const b = lesSumvekter("race=0.2,nett=1", "sum:…").vekter;
  assert.deepEqual(a, b);
  // Standardene er de som gjør resten av speken lesbar; endres de, endres hver
  // spek som ikke skriver dem ut.
  assert.equal(a.verdener, 12);
  assert.equal(a.kand, 16);
  assert.equal(a.M, 1);
  assert.equal(a.rlambda, 1);
  assert.deepEqual(a.roller, ["foerer"]);
  assert.equal(a.vakt, 0);
  assert.equal(a.sok, 0);
  assert.equal(a.stil, 0);
});

/**
 * SØKELEDDET BYGGER OG SVARER. Fire verdener og to kandidater, ikke Adams'
 * 12k16: koden som skal beskyttes er den samme, og en enhetstest som tar et
 * halvt minutt blir slått av. Kostnaden måles på benken, ikke her.
 */
test("søkeleddet gir et lovlig kort, og raceleddet er stumt på 0–0", () => {
  const sum = lagIndre(`sum:nett=1,sok=0.5,race=0.5,verdener=4,kand=2,roller=alle:${NETT}`);
  const n = overStillinger(777, 8, (s, sete) => {
    const h = sum.velgHandling(s) as { type: string; kort: { farge: string; verdi: number } };
    assert.equal(h.type, "SPILL");
    assert.ok(
      lovligeKort(s, sete).some((k) => k.farge === h.kort.farge && k.verdi === h.kort.verdi),
      "summen la et ulovlig kort",
    );
  });
  assert.equal(n, 8);
});

/**
 * STILLEDDET, DIREKTE.
 *
 * Det er det eneste av de fem leddene som ikke kan nås gjennom en spek i en
 * enhetstest: `stilvri` gir `null` til residualet mot nettets prediksjon er
 * målt sikkert, og det krever hundrevis av observerte trekk. Å bygge dem her
 * ville gjort testen til en måling.
 *
 * Derfor mates leddet med en STILT ØKT. Da kan de tre egenskapene som betyr
 * noe måles hver for seg: at null bevis gir et tomt ledd, at skift 0 peker på
 * nettets eget kort, og at et positivt skift flytter valget OPPOVER i
 * prisrangen — samme akse `Økt.motpartFor` skyver rollout-motstanderen langs.
 */
test("stilleddet: uten bevis er det stumt, med skift 0 er det nettets eget kort", () => {
  const n = lesNett("e1-modell/d7alle.bin");
  const atferd = {
    logits: (st: GameState, p: number) => forover(n, e1SpillTrekk(st, p, n.lag[0]!.inn)),
  };
  const nettAgent = lagIndre(NETT) as unknown as Scorbar;
  const scorer = (s: GameState, sete: number): Map<number, number> => nettAgent.scorer(s, sete);
  const stiltØkt = (skift: number | null): Økt =>
    ({ stilvri: () => skift, bok: { atferdModell: () => atferd } }) as unknown as Økt;

  const stilleddet = (skift: number | null): Ledd => {
    const v = lesSumvekter("stil=1", "sum:…").vekter;
    const alle = lagSumledd(v, {
      scorer,
      vaktvalg: null,
      motpart: null,
      økt: stiltØkt(skift),
    });
    return alle.find((l) => l.navn === "stil")!;
  };

  const stumt = stilleddet(null);
  const null0 = stilleddet(0);
  const opp = stilleddet(0.6);

  let flyttet = 0;
  const antall = overStillinger(13579, 120, (s, sete) => {
    const lovlige = lovligeKort(s, sete);
    assert.equal(stumt.poeng(s, sete, lovlige).size, 0, "et ukjent sete ga likevel et ledd");

    const basis = argmaks(lovlige, scorer(s, sete));
    const p0 = null0.poeng(s, sete, lovlige);
    if (p0.size === 0) return; // ingen trumf ennå: rangOgPolicy har ingen akse
    assert.deepEqual(
      argmaks(lovlige, p0),
      basis,
      "skift 0 skal peke på nettets eget kort, uten avrunding som kan vippe",
    );

    const rp = rangOgPolicy(s, sete, atferd)!;
    const rang = (k: { farge: string; verdi: number }): number =>
      rp.h[rp.lov.findIndex((x) => x.farge === k.farge && x.verdi === k.verdi)]!;
    const valgt = argmaks(lovlige, opp.poeng(s, sete, lovlige));
    assert.ok(
      rang(valgt) >= rang(basis) - 1e-12,
      `et positivt skift flyttet valget NEDOVER i prisrangen: ${rang(basis)} → ${rang(valgt)}`,
    );
    if (rang(valgt) > rang(basis)) flyttet++;
  });
  assert.ok(antall >= 100, `bare ${antall} stillinger`);
  // Et ledd som aldri flytter noe er ikke koblet. Uten denne linja ville en
  // `poeng` som alltid returnerte tomt vært grønn.
  assert.ok(flyttet >= 10, `skiftet flyttet bare ${flyttet} valg – er leddet koblet?`);
});
