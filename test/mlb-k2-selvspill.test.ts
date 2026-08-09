/**
 * K2 FOR SELVE BESLUTNINGEN — ikke bare for trekkvektoren.
 *
 * `test/mlb-k2-trekk.test.ts` prøver INNGANGEN: er de 1 032 tallene
 * bit-identiske når bare de skjulte hendene byttes? Denne prøver UTGANGEN:
 * velger selvspillagenten den SAMME KODEN?
 *
 * ===================== HVORFOR BEGGE MÅ FINNES ==========================
 *
 * En blind vektor er en nødvendig, men ikke tilstrekkelig betingelse. Løkka i
 * `selvspill.ts` gjør fire ting til utenom å bygge vektoren: den henter
 * hukommelsen, den bygger masken, den kaller nettet, og den plukker en kode ut
 * av logitene med en RNG. Hver av dem tar imot noe annet enn trekkvektoren, og
 * hver av dem KUNNE lekket:
 *
 *   - masken bygges av `visning`, men en fremtidig snarvei kunne tatt `state`
 *   - hukommelsen er per sete, og en delt bok ville vært sete 0 som leser
 *     sete 1s observasjoner av sete 2
 *   - `velgKode` trekker fra en RNG, og en RNG som avhenger av stillingen
 *     ville gjort valget avhengig av de skjulte kortene helt uten at vektoren
 *     endret seg
 *
 * Prøven her er derfor på beslutningen selv, med et nett som forsterker
 * enhver forskjell i inngangen til en forskjell i utgangen.
 *
 * ===================== OG DEN KJØRES FØR HVER EPOKE =====================
 *
 * `docs/sandkassen.md` §2: «kjøres etter HVER epoke, ikke bare til slutt.»
 * `examples/mlb-spill.ts` kjører nettopp denne fila som en underprosess før den
 * skriver en eneste kamp, og stopper hele epoken på rødt.
 *
 * ===================== KONTROLLARMEN MÅ BLI TATT =======================
 *
 * Nederst sitter et nett som ser ÉN bit av en skjult hånd — «holder relativt
 * sete 1 spar ess?» — og bare bruker den til å vippe mellom to lovlige koder.
 * Blir den ikke tatt, måler ikke prøven noe, og den grønne testen over beviser
 * ingenting.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { kortgiving, lagRegler } from "../src/regler.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { maske, nesteDelsteg, TOMT_DELVALG, type Delvalg, type Giving } from "../src/mlb/handling.ts";
import { byggTrekk } from "../src/mlb/trekk.ts";
import { velgKode, type Framover, type NettLik } from "../src/mlb/selvspill.ts";

// ===========================================================================
// Riggen
// ===========================================================================

const REGLER = lagRegler({ antallSpillere: 4, målPoeng: 30 });
const GIVING = kortgiving(REGLER);
const GIVING_KORT: Giving = { antallStikk: GIVING.antallStikk, talong: GIVING.talong };

const iTur = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

/**
 * ET NETT SOM FORSTERKER.
 *
 * Logitene er en funksjon av HELE trekkvektoren med indeksvekt, så to vektorer
 * som skiller seg i ett eneste tall gir ulik rangering på alle 68 plassene. Et
 * ekte, trent nett kunne vært ufølsomt for nettopp det trekket som lakk —
 * dette kan ikke.
 */
const forsterker: NettLik = {
  framover(trekk: Float32Array): Framover {
    let sum = 0;
    for (let i = 0; i < trekk.length; i++) sum += trekk[i]! * (i + 1) * 0.001;
    const policy = new Float32Array(68);
    for (let i = 0; i < 68; i++) policy[i] = Math.sin(sum + i * 1.37) * 3;
    return { policy, verdi: Math.tanh(sum), tro: new Float32Array(208) };
  },
};

/** Dekker alle fem delstegene, utledet av lovlig informasjon alene. */
function delvalgFor(s: GameState, sete: number): Delvalg {
  if (s.fase === "VRAK") {
    const hånd = s.hender[sete] ?? [];
    return hånd.length > 1 ? { vrak: [hånd[0]!], trumf: null } : TOMT_DELVALG;
  }
  if (s.fase === "VELG" && s.rundeNr % 2 === 0) return { vrak: [], trumf: "S" };
  return TOMT_DELVALG;
}

type Velg = (s: GameState, sete: number, huk: Float64Array) => number;

function lagVelger(nett: NettLik): Velg {
  return (s, sete, huk) => {
    const visning = spillerVisning(s, sete);
    const delvalg = delvalgFor(s, sete);
    const steg = nesteDelsteg(visning, delvalg);
    assert.ok(steg !== null, "ingen delsteg — prøven ville målt ingenting");
    const m = maske(visning, GIVING_KORT, delvalg);
    const trekk = byggTrekk(visning, {
      regler: REGLER,
      giving: GIVING,
      delvalg,
      hukommelse: huk,
      tronett: null,
    });
    /**
     * TEMPERATUR 0. Med sampling ville prøven målt RNG-strømmen og ikke
     * blindheten — og det er nettopp derfor AVGJØRELSE 4 finnes: måling er
     * argmaks, alltid.
     */
    return velgKode(nett.framover(trekk).policy, m, 0, lagRng(1));
  };
}

interface Resultat {
  readonly stillinger: number;
  readonly sammenlikninger: number;
  readonly perFase: Record<string, number>;
  readonly avvik: string[];
}

function prøv(velg: Velg, giver: number, verdenerPerStilling: number, maksPerRunde: number): Resultat {
  const avvik: string[] = [];
  const perFase: Record<string, number> = { BUDRUNDE: 0, VRAK: 0, VELG: 0, SPILL: 0 };
  let stillinger = 0;
  let sammenlikninger = 0;

  for (let g = 0; g < giver; g++) {
    const frø = 5_300_000 + g * 3719;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    const huk = new Hukommelse();
    let s: GameState = opprettSpill(REGLER, frø);
    let vakt = 0;
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
      const fase = s.fase;
      if ((iRunde[fase] ?? 0) < maksPerRunde) {
        const rng = lagRng(717_000 + g * 41 + vakt);
        const verdener = trekkVerdener(s, sete, verdenerPerStilling, rng, undefined, undefined, 4);
        if (verdener.length >= 2) {
          iRunde[fase] = (iRunde[fase] ?? 0) + 1;
          stillinger++;
          perFase[fase] = (perFase[fase] ?? 0) + 1;
          const hukVektor = huk.vektor(sete, 4);
          const fasit = velg(s, sete, hukVektor);
          for (const hender of verdener) {
            const s2 = medVerden(s, hender, sete);
            assert.deepEqual(
              s2.hender[sete],
              s.hender[sete],
              "medVerden endret observatørens egen hånd — prøven måler feil ting",
            );
            sammenlikninger++;
            const annen = velg(s2, sete, hukVektor);
            if (annen !== fasit) {
              avvik.push(
                `frø ${frø} ${fase} runde ${s.rundeNr} stikk ${s.stikkSpilt} sete ${sete}: ` +
                  `kode ${fasit} i den ekte verdenen, ${annen} i en forenlig — ` +
                  `BESLUTNINGEN avhenger av skjulte kort`,
              );
            }
          }
        }
      }
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
  return { stillinger, sammenlikninger, perFase, avvik };
}

// ===========================================================================
// Prøvene
// ===========================================================================

test("K2/selvspill: valgt kode er identisk når BARE de skjulte hendene byttes — alle fire faser", () => {
  const r = prøv(lagVelger(forsterker), 4, 3, 3);
  assert.ok(r.stillinger >= 40, `bare ${r.stillinger} stillinger — prøven beviser ingenting`);
  assert.ok(r.sammenlikninger >= 80, `bare ${r.sammenlikninger} sammenlikninger`);
  for (const fase of ["BUDRUNDE", "VRAK", "VELG", "SPILL"]) {
    assert.ok(
      (r.perFase[fase] ?? 0) >= 2,
      `fasen ${fase} fikk bare ${r.perFase[fase] ?? 0} stillinger. En invariansprøve dekker ` +
        `BARE de fasene den faktisk besøker — slik slapp talonglekkasjen gjennom.`,
    );
  }
  assert.deepEqual(
    r.avvik.slice(0, 8),
    [],
    `JUKS: selvspillagenten valgte ulikt da bare de skjulte kortene ble byttet.\n` +
      `${r.avvik.length} avvik. Ett er nok — dette er ikke en statistisk prøve.\n\n` +
      r.avvik.slice(0, 8).join("\n"),
  );
});

test("K2/selvspill: prøven kan FEILE — et nett som ser ÉN bit skal bli tatt", () => {
  /**
   * Jukseren ser ett flagg: har relativt sete 1 spar ess? Den bruker det bare
   * til å snu fortegnet på policyen, altså til å velge et annet LOVLIG kort.
   * Det er den minste tenkelige lekkasjen, og en prøve som ikke tar den er
   * blind for alle større.
   */
  const sparEss = kortIndeks({ farge: "S", verdi: 14 });
  const jukserVelg: Velg = (s, sete, huk) => {
    const neste = (sete + 1) % s.antallSpillere;
    const ser = (s.hender[neste] ?? []).some((k) => kortIndeks(k) === sparEss);
    const jukseNett: NettLik = {
      framover(trekk: Float32Array): Framover {
        const f = forsterker.framover(trekk);
        const policy = new Float32Array(f.policy.length);
        for (let i = 0; i < policy.length; i++) policy[i] = ser ? -f.policy[i]! : f.policy[i]!;
        return { policy, verdi: f.verdi, tro: f.tro };
      },
    };
    return lagVelger(jukseNett)(s, sete, huk);
  };
  const r = prøv(jukserVelg, 2, 3, 2);
  assert.ok(r.stillinger >= 10, `bare ${r.stillinger} stillinger`);
  assert.ok(
    r.avvik.length > 0,
    `et nett som SER en skjult hånd ble ikke tatt. Da måler prøven ikke informasjonslekkasje, ` +
      `og den grønne testen over beviser ingenting.`,
  );
});
