/**
 * K2 FOR HELE KJEDEN: TREKK → NETT → VALG.
 *
 * `test/mlb-k2-trekk.test.ts` prøver det FØRSTE leddet: trekkvektoren er
 * bit-identisk når bare de skjulte kortene byttes. Men det er ikke der en
 * agent slutter. Den kjører vektoren gjennom et nett og velger en handling, og
 * det er HANDLINGEN som er observerbar for motstanderen.
 *
 * Denne prøven lukker kjeden. For hver stilling:
 *
 *   1. bygg trekkene fra `spillerVisning(state, sete)`
 *   2. kjør `Sandkassenett.framover`
 *   3. velg med `velgKode`, både argmaks og samplet med samme frø
 *
 * og krev at ALLE fire — policy, verdi, tro og den valgte koden — er
 * bit-identiske når bare de skjulte hendene byttes til en forenlig verden.
 *
 * ===================== HVORFOR VALGET MÅ MED, IKKE BARE VEKTOREN =========
 *
 * Et avvik i trekkvektoren er en lekkasje som KANSKJE endrer valget. Et avvik i
 * valget er en lekkasje som SIKKERT er synlig. Måler vi bare det første, kan vi
 * ikke si noe om det andre uten et mellomledd av resonnement — og K2 er den ene
 * prøven i prosjektet som skal avgjøres absolutt, ikke resonneres om.
 *
 * ===================== BEGGE ARMENE AV DEN AVSKRUBARE TROEN ==============
 *
 * Troen er et HODE nå, og den eksterne `tronett`-inngangen står AV som
 * standard. Men den er beholdt og skal kunne måles, så prøven kjøres i BEGGE
 * stillinger. En lekkasje som bare finnes når den eksterne troen er koblet på
 * ville ellers stått uprøvd nettopp i den armen vi en dag skal måle.
 *
 * ===================== OG DEN MÅ KUNNE FEILE ============================
 *
 * Nederst lekkes ÉN bit — «holder relativt sete 1 spar ess?» — inn i
 * trekkvektoren før nettet ser den, og prøven må ta den.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { maske, ta, TOMT_DELVALG, type Delvalg } from "../src/mlb/handling.ts";
import { Sandkassenett, velgKode } from "../src/mlb/nett.ts";
import { byggTrekk, TREKK_LENGDE, type Trofordeler } from "../src/mlb/trekk.ts";

// ===========================================================================
// Riggen
// ===========================================================================

/** Lite nett, men ekte: tre hoder over ett underlag, deterministisk av frøet. */
const NETT = Sandkassenett.tilfeldig(20_260_809, [128, 64]);

/**
 * ET EKSTERNT TROHODE SOM FORSTERKER, IKKE DEMPER — samme som i
 * `mlb-k2-trekk.test.ts`. Summen løper over hele `troTrekk`-vektoren med
 * indeksvekt, så to vektorer som skiller seg i ett eneste tall gir ulike
 * sannsynligheter på alle 52 kortene.
 */
const troForsterker: Trofordeler = {
  fordeling(trekk: Float32Array): number[][] {
    let sum = 0;
    for (let i = 0; i < trekk.length; i++) sum += trekk[i]! * (i + 1);
    const a = Math.abs(sum) % 1;
    return Array.from({ length: 52 }, (_, k) => {
      const x = (a + k / 52) % 1;
      const rå = [x + 0.1, 1.1 - x, x / 2 + 0.1, 1.1 - x / 2];
      const s = rå[0]! + rå[1]! + rå[2]! + rå[3]!;
      return rå.map((q) => q / s);
    });
  },
};

const iTur = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

/** Alt en beslutning gir fra seg: de tre hodene og de to valgene. */
interface Utfall {
  readonly policy: Float32Array;
  readonly verdi: number;
  readonly tro: Float32Array;
  readonly argmaks: number;
  readonly samplet: number;
}

type Bygger = (s: GameState, sete: number, huk: Float64Array, delvalg: Delvalg, eksternTro: boolean) => Float32Array;

const ærlig: Bygger = (s, sete, huk, delvalg, eksternTro) =>
  byggTrekk(spillerVisning(s, sete), {
    regler: s.regler,
    giving: s.giving,
    delvalg,
    hukommelse: huk,
    tronett: eksternTro ? troForsterker : null,
  });

/**
 * KONTROLLEN: den ærlige vektoren pluss ett bit, lekket FØR nettet ser den.
 * «Holder relativt sete 1 spar ess?» er den minste tenkelige lekkasjen.
 */
const jukser: Bygger = (s, sete, huk, delvalg, eksternTro) => {
  const v = ærlig(s, sete, huk, delvalg, eksternTro);
  const neste = (sete + 1) % s.antallSpillere;
  const sparEss = kortIndeks({ farge: "S", verdi: 14 });
  if ((s.hender[neste] ?? []).some((k) => kortIndeks(k) === sparEss)) v[0] = v[0]! + 1;
  return v;
};

function kjør(
  bygg: Bygger,
  s: GameState,
  sete: number,
  huk: Float64Array,
  delvalg: Delvalg,
  eksternTro: boolean,
  frø: number,
): Utfall {
  const trekk = bygg(s, sete, huk, delvalg, eksternTro);
  assert.equal(trekk.length, TREKK_LENGDE, "feil bredde på trekkvektoren");
  const f = NETT.framover(trekk);
  const m = maske(spillerVisning(s, sete), s.giving, delvalg);
  return {
    policy: f.policy,
    verdi: f.verdi,
    tro: f.tro,
    argmaks: velgKode(f.policy, m, 0, lagRng(frø)),
    // SAMME frø til begge sammenlikningene: da er en forskjell i den samplede
    // koden en forskjell i FORDELINGEN, ikke i tilfeldigheten.
    samplet: velgKode(f.policy, m, 1, lagRng(frø)),
  };
}

interface Resultat {
  readonly stillinger: number;
  readonly sammenlikninger: number;
  readonly perFase: Record<string, number>;
  readonly avvikUtgang: string[];
  readonly avvikKode: string[];
}

function prøv(bygg: Bygger, giver: number, verdenerPerStilling: number, eksternTro: boolean): Resultat {
  const avvikUtgang: string[] = [];
  const avvikKode: string[] = [];
  const perFase: Record<string, number> = { BUDRUNDE: 0, VRAK: 0, VELG: 0, SPILL: 0 };
  let stillinger = 0;
  let sammenlikninger = 0;

  for (let g = 0; g < giver; g++) {
    const frø = 7_700_000 + g * 4231;
    const rng = lagRng((frø ^ 0x2b1c9e4d) >>> 0);
    const huk = new Hukommelse();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, frø);
    let vakt = 0;
    // Høyst noen få stillinger per runde: `trekkVerdener` er dyrt, og en prøve
    // som tar minutter blir slått av i praksis.
    const iRunde: Record<string, number> = { BUDRUNDE: 0, VRAK: 0, VELG: 0, SPILL: 0 };
    let sistRunde = -1;

    while (s.fase !== "FERDIG" && vakt++ < 4000) {
      huk.observer(s);
      const sete = iTur(s);
      if (sete === null) {
        if (s.fase === "RUNDE_SLUTT") {
          s = utfør(s, { type: "NESTE" }).state;
          continue;
        }
        break;
      }
      if (s.rundeNr !== sistRunde) {
        sistRunde = s.rundeNr;
        for (const k of Object.keys(iRunde)) iRunde[k] = 0;
      }
      const hukVektor = huk.vektor(sete, 4);
      let delvalg: Delvalg = TOMT_DELVALG;

      for (let steg = 0; steg < 20; steg++) {
        const fase = s.fase;
        if ((iRunde[fase] ?? 0) < 2) {
          const verdener = trekkVerdener(s, sete, verdenerPerStilling, lagRng(818_000 + g * 37 + vakt), undefined, undefined, 4);
          if (verdener.length >= 2) {
            iRunde[fase] = (iRunde[fase] ?? 0) + 1;
            stillinger++;
            perFase[fase] = (perFase[fase] ?? 0) + 1;
            const valgfrø = 4_242 + vakt * 13 + steg;
            const fasit = kjør(bygg, s, sete, hukVektor, delvalg, eksternTro, valgfrø);
            for (const hender of verdener) {
              const s2 = medVerden(s, hender, sete);
              assert.deepEqual(
                s2.hender[sete],
                s.hender[sete],
                "medVerden endret observatørens egen hånd — prøven måler feil ting",
              );
              sammenlikninger++;
              const annen = kjør(bygg, s2, sete, hukVektor, delvalg, eksternTro, valgfrø);
              const merk = `frø ${frø} ${fase} runde ${s.rundeNr} stikk ${s.stikkSpilt} sete ${sete}`;
              for (let i = 0; i < fasit.policy.length; i++) {
                if (!Object.is(fasit.policy[i], annen.policy[i])) {
                  avvikUtgang.push(`${merk}: policy[${i}] ${String(fasit.policy[i])} ≠ ${String(annen.policy[i])}`);
                  break;
                }
              }
              if (!Object.is(fasit.verdi, annen.verdi)) {
                avvikUtgang.push(`${merk}: verdi ${fasit.verdi} ≠ ${annen.verdi}`);
              }
              for (let i = 0; i < fasit.tro.length; i++) {
                if (!Object.is(fasit.tro[i], annen.tro[i])) {
                  avvikUtgang.push(`${merk}: tro[${i}] ${String(fasit.tro[i])} ≠ ${String(annen.tro[i])}`);
                  break;
                }
              }
              if (fasit.argmaks !== annen.argmaks) {
                avvikKode.push(`${merk}: argmaks ${fasit.argmaks} ≠ ${annen.argmaks} — VALGET avhenger av skjulte kort`);
              }
              if (fasit.samplet !== annen.samplet) {
                avvikKode.push(`${merk}: samplet ${fasit.samplet} ≠ ${annen.samplet} — VALGET avhenger av skjulte kort`);
              }
            }
          }
        }
        const visning = spillerVisning(s, sete);
        const m = maske(visning, s.giving, delvalg);
        const kode = velgKode(new Float32Array(m.length), m, 1, rng);
        const steget = ta(visning, s.giving, delvalg, kode);
        if (steget.ferdig) {
          s = utfør(s, { ...steget.handling, spiller: sete }).state;
          break;
        }
        delvalg = steget.delvalg;
      }
    }
  }
  return { stillinger, sammenlikninger, perFase, avvikUtgang, avvikKode };
}

// ===========================================================================
// Prøvene
// ===========================================================================

for (const eksternTro of [false, true]) {
  const merke = eksternTro ? "ekstern tro PÅ" : "ekstern tro AV (standard)";
  test(`K2/MLB-nett: trekk → nett → valg er bit-identisk når bare skjulte hender byttes (${merke})`, () => {
    const r = prøv(ærlig, 3, 3, eksternTro);

    assert.ok(r.stillinger >= 30, `prøven fikk bare ${r.stillinger} stillinger — beviser ingenting`);
    assert.ok(
      r.sammenlikninger >= 60,
      `bare ${r.sammenlikninger} verdenssammenlikninger — beviser ingenting`,
    );
    for (const fase of ["BUDRUNDE", "VRAK", "VELG", "SPILL"]) {
      assert.ok(
        (r.perFase[fase] ?? 0) >= 1,
        `fasen ${fase} fikk ingen stillinger. En invariansprøve dekker BARE de fasene den ` +
          `faktisk besøker — det var nettopp slik talonglekkasjen slapp gjennom.`,
      );
    }
    assert.deepEqual(
      r.avvikUtgang.slice(0, 5),
      [],
      `JUKS: nettets UTGANG endret seg da bare de skjulte kortene ble byttet. ` +
        `${r.avvikUtgang.length} avvik.\n${r.avvikUtgang.slice(0, 5).join("\n")}`,
    );
    assert.deepEqual(
      r.avvikKode.slice(0, 5),
      [],
      `JUKS: den VALGTE HANDLINGEN endret seg da bare de skjulte kortene ble byttet. ` +
        `${r.avvikKode.length} avvik.\n${r.avvikKode.slice(0, 5).join("\n")}`,
    );
  });
}

test("K2/MLB-nett: prøven kan FEILE — én lekket bit inn i trekkene blir tatt av nettet", () => {
  const r = prøv(jukser, 2, 3, false);
  assert.ok(r.stillinger >= 10, `prøven fikk bare ${r.stillinger} stillinger`);
  assert.ok(
    r.avvikUtgang.length > 0,
    `et nett som fikk ÉN lekket bit inn ble ikke tatt. Da måler prøven ikke ` +
      `informasjonslekkasje, og de grønne prøvene over beviser ingenting.`,
  );
});
