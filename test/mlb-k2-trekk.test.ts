/**
 * K2 FOR HELE MLB-TREKKVEKTOREN — er den BLIND for de skjulte kortene?
 *
 * `docs/sandkassen.md` §2: «Garantien skal være STRUKTURELL, ikke en
 * konvensjon.» Trekkbyggeren tar `spillerVisning(state, sete)`, så de skjulte
 * kortene FINNES ikke i det den ser. Denne prøven er kontrollen på at den
 * strukturen faktisk holder gjennom alle syv blokkene — MIKRO er `e1SpillTrekk`
 * på en redigert stat, KONVENSJONSBLOKKEN er `vaktKort` på den samme, og begge
 * er kode som normalt tar `GameState`.
 *
 * Formen er den samme som `test/mlb-k2-tro.test.ts`: bytt ut BARE de skjulte
 * hendene med en forenlig verden (`trekkVerdener` + `medVerden`) og krev
 * BIT-IDENTISK vektor. Ett avvikende flyttall er juks.
 *
 * ===================== TRE TING DENNE GÅR LENGER PÅ =====================
 *
 * 1. ALLE FIRE FASER. `docs/mlb.md` §6 fører opp som en ærlig risiko at
 *    K2-prøven «dekker bare én av fire faser» — den prøvde kortvalg fra stikk
 *    7, og talonglekkasjen bet nettopp i VRAK, der prøven aldri var. Denne
 *    besøker BUDRUNDE, VRAK, VELG og SPILL, og krever at hver av dem fikk
 *    stillinger.
 *
 * 2. HUKOMMELSEN ER PÅ. Det er hele poenget med at hukommelsen bare ser
 *    FERDIGSPILTE runder: da kan K2 holde med full hukommelse påslått. Var den
 *    av under prøven, ville 144 av trekkene stått null og prøven vært stum om
 *    dem.
 *
 * 3. TROHODET ER PÅ, SOM EN FORSTERKER. Trofordeleren under er en sum over
 *    HELE `troTrekk`-vektoren. Endrer ett eneste av de 660 trekkene seg, endrer
 *    alle 208 sannsynlighetene seg. Et hode som bare leste noen få trekk kunne
 *    skjult en lekkasje bak sin egen ufølsomhet; dette kan ikke.
 *
 * ===================== OG DEN MÅ KUNNE FEILE ============================
 *
 * Nederst lekkes ÉN bit — «holder relativt sete 1 spar ess?» — og prøven må ta
 * den. En prøve som ikke kan feile måler ingenting.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { TOMT_DELVALG, type Delvalg } from "../src/mlb/handling.ts";
import {
  BLOKK,
  byggTrekk,
  HUKOMMELSE_LENGDE,
  TREKK_LENGDE,
  TREKK_NAVN,
  type Trofordeler,
} from "../src/mlb/trekk.ts";

// ===========================================================================
// Riggen
// ===========================================================================

type Beslutning = "BUD" | "VRAK" | "VELG" | "SPILL";

const fasenavn = (s: GameState): Beslutning =>
  s.fase === "BUDRUNDE" ? "BUD" : s.fase === "VRAK" ? "VRAK" : s.fase === "VELG" ? "VELG" : "SPILL";

const iTur = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

/**
 * ET TROHODE SOM FORSTERKER, IKKE DEMPER.
 *
 * Summen løper over hele `troTrekk`-vektoren med indeksvekt, så to vektorer som
 * skiller seg i ett eneste tall gir ulike sannsynligheter på alle 52 kortene.
 * Et ekte, trent hode ville kanskje ignorert nettopp det trekket som lakk.
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

type Bygger = (s: GameState, sete: number, huk: Float64Array) => Float32Array;

/**
 * ET DELVALG SOM DEKKER ALLE FEM DELSTEGENE.
 *
 * `VELG_ETTERLYST` og et halvferdig `VRAK_KORT` finnes bare når `delvalg` er
 * satt, og en invariansprøve dekker BARE de stegene den besøker. Delvalget
 * utledes av visningen alene — egen hånd og en fast trumf — så det er selv en
 * funksjon av lovlig informasjon og kan ikke bære en lekkasje inn.
 */
function delvalgFor(s: GameState, sete: number): Delvalg {
  if (s.fase === "VRAK") {
    const hånd = s.hender[sete] ?? [];
    return hånd.length > 1 ? { vrak: [hånd[0]!], trumf: null } : TOMT_DELVALG;
  }
  // Annenhver VELG-stilling prøves på etterlyssteget i stedet for trumfsteget.
  if (s.fase === "VELG" && s.rundeNr % 2 === 0) return { vrak: [], trumf: "S" };
  return TOMT_DELVALG;
}

const ærlig: Bygger = (s, sete, huk) =>
  byggTrekk(spillerVisning(s, sete), {
    regler: s.regler,
    giving: s.giving,
    delvalg: delvalgFor(s, sete),
    hukommelse: huk,
    tronett: troForsterker,
  });

/**
 * KONTROLLEN: den ærlige vektoren pluss ett bit.
 *
 * «Holder relativt sete 1 spar ess?» er den minste tenkelige lekkasjen — ett
 * flagg av 1 032. Finner prøven ikke den, finner den heller ikke en ekte.
 */
const jukser: Bygger = (s, sete, huk) => {
  const v = ærlig(s, sete, huk);
  const neste = (sete + 1) % s.antallSpillere;
  const sparEss = kortIndeks({ farge: "S", verdi: 14 });
  if ((s.hender[neste] ?? []).some((k) => kortIndeks(k) === sparEss)) v[0] = v[0]! + 1;
  return v;
};

interface Resultat {
  readonly stillinger: number;
  readonly sammenlikninger: number;
  readonly perFase: Record<Beslutning, number>;
  readonly avvik: string[];
}

/**
 * Spill `giver` kamper, og prøv HVER beslutning i hver fase mot forenlige
 * verdener. Hukommelsen bygges av den ekte kampen, som en agents hukommelse
 * gjør — den er en INNGANG til byggeren, ikke noe byggeren utleder.
 */
function prøv(bygg: Bygger, giver: number, verdenerPerStilling: number, maksPerRunde: number): Resultat {
  const avvik: string[] = [];
  const perFase: Record<Beslutning, number> = { BUD: 0, VRAK: 0, VELG: 0, SPILL: 0 };
  let stillinger = 0;
  let sammenlikninger = 0;

  for (let g = 0; g < giver; g++) {
    const frø = 6_400_000 + g * 4231;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    const huk = new Hukommelse();
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, frø);
    let vakt = 0;
    const iRunde: Record<Beslutning, number> = { BUD: 0, VRAK: 0, VELG: 0, SPILL: 0 };
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
        iRunde.BUD = 0;
        iRunde.VRAK = 0;
        iRunde.VELG = 0;
        iRunde.SPILL = 0;
      }
      const fase = fasenavn(s);
      if (iRunde[fase] < maksPerRunde) {
        const rng = lagRng(818_000 + g * 37 + vakt);
        const verdener = trekkVerdener(s, sete, verdenerPerStilling, rng, undefined, undefined, 4);
        if (verdener.length >= 2) {
          iRunde[fase]++;
          stillinger++;
          perFase[fase]++;
          const hukVektor = huk.vektor(sete, 4);
          const fasit = bygg(s, sete, hukVektor);
          assert.equal(fasit.length, TREKK_LENGDE, "feil bredde på trekkvektoren");
          for (const hender of verdener) {
            const s2 = medVerden(s, hender, sete);
            // Sanitetssjekk: VÅR hånd skal være urørt, ellers prøver vi noe annet.
            assert.deepEqual(
              s2.hender[sete],
              s.hender[sete],
              "medVerden endret observatørens egen hånd — prøven måler feil ting",
            );
            sammenlikninger++;
            const annen = bygg(s2, sete, hukVektor);
            for (let i = 0; i < TREKK_LENGDE; i++) {
              if (!Object.is(fasit[i], annen[i])) {
                avvik.push(
                  `frø ${frø} ${fase} runde ${s.rundeNr} stikk ${s.stikkSpilt} sete ${sete}: ` +
                    `trekk ${i} (${TREKK_NAVN[i]}) er ${String(fasit[i])} i den ekte verdenen og ` +
                    `${String(annen[i])} i en forenlig — vektoren avhenger av SKJULTE kort`,
                );
                break;
              }
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

test("K2/MLB: byggTrekk er bit-identisk når BARE de skjulte hendene byttes — i alle fire faser", () => {
  const r = prøv(ærlig, 4, 3, 3);

  assert.ok(r.stillinger >= 40, `prøven fikk bare ${r.stillinger} stillinger — beviser ingenting`);
  assert.ok(
    r.sammenlikninger >= 80,
    `prøven gjorde bare ${r.sammenlikninger} verdenssammenlikninger — beviser ingenting`,
  );
  for (const fase of ["BUD", "VRAK", "VELG", "SPILL"] as const) {
    assert.ok(
      r.perFase[fase] >= 2,
      `fasen ${fase} fikk bare ${r.perFase[fase]} stillinger. En invariansprøve dekker BARE de ` +
        `fasene den faktisk besøker — det var nettopp slik talonglekkasjen slapp gjennom.`,
    );
  }
  assert.deepEqual(
    r.avvik.slice(0, 8),
    [],
    `JUKS: trekkvektoren endret seg da bare de skjulte kortene ble byttet.\n` +
      `Ett avvik er nok — dette er ikke en statistisk prøve. ${r.avvik.length} avvik totalt.\n\n` +
      r.avvik.slice(0, 8).join("\n"),
  );
});

test("K2/MLB: prøven kan FEILE — én lekket bit skal bli tatt", () => {
  const r = prøv(jukser, 2, 3, 2);
  assert.ok(r.stillinger >= 10, `prøven fikk bare ${r.stillinger} stillinger`);
  assert.ok(
    r.avvik.length > 0,
    `en trekkvektor som SER en skjult hånd ble ikke tatt av prøven. Da måler prøven ikke ` +
      `informasjonslekkasje, og den grønne testen over beviser ingenting.`,
  );
});

// ===========================================================================
// HUKOMMELSEN SER BARE FERDIGSPILTE RUNDER
// ===========================================================================

test("K2/MLB: hukommelsesblokken er KONSTANT gjennom en runde og endrer seg bare ved rundeslutt", () => {
  /**
   * `docs/sandkassen.md`: «Hukommelsen ser bare FERDIGSPILTE runder.
   * Inneværende runde er skjult til den er over. Valgene i runde `r` ser altså
   * bare hukommelse fra runde `< r`. Det er det som gjør at K2 fortsatt kan
   * passere med full hukommelse påslått.»
   *
   * Her måles det på TREKKVEKTOREN, ikke bare på `Hukommelse.vektor`: blokken
   * skal være bit-identisk for hver eneste beslutning innenfor samme runde, for
   * samme sete. Sniker inneværende runde seg inn — for eksempel gjennom et
   * ledd som leser `stikkVunnet` mens runden går — vil den bevege seg, og
   * K2-garantien er hullete uten at noe krasjer.
   */
  const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  const huk = new Hukommelse();
  // Løp til 100: prøven trenger MANGE runder for at boka skal rekke å bevege
  // seg, og kontrollen nederst er verdiløs uten den bevegelsen.
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 6_777_001);

  // `runde -> sete -> blokken slik den var ved første beslutning i runden`
  const førsteIRunde = new Map<string, Float32Array>();
  const ulikeRunder = new Set<string>();
  const feil: string[] = [];
  let beslutninger = 0;
  let runder = 0;
  let vakt = 0;

  while (s.fase !== "FERDIG" && vakt++ < 6000) {
    huk.observer(s);
    const sete = iTur(s);
    if (sete === null) {
      if (s.fase === "RUNDE_SLUTT") {
        runder++;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      break;
    }
    const v = byggTrekk(spillerVisning(s, sete), {
      regler: s.regler,
      giving: s.giving,
      hukommelse: huk.vektor(sete, 4),
      tronett: null,
    });
    const blokk = v.slice(BLOKK.HUKOMMELSE, BLOKK.HUKOMMELSE + HUKOMMELSE_LENGDE);
    beslutninger++;

    const nøkkel = `${s.rundeNr}:${sete}`;
    const før = førsteIRunde.get(nøkkel);
    if (før === undefined) {
      førsteIRunde.set(nøkkel, blokk);
    } else {
      for (let i = 0; i < HUKOMMELSE_LENGDE; i++) {
        if (!Object.is(før[i], blokk[i])) {
          feil.push(
            `runde ${s.rundeNr} sete ${sete}: hukommelsesledd ${i} ` +
              `(${TREKK_NAVN[BLOKK.HUKOMMELSE + i]}) endret seg fra ${String(før[i])} til ` +
              `${String(blokk[i])} MENS RUNDEN GIKK`,
          );
          break;
        }
      }
    }
    ulikeRunder.add(String(s.rundeNr));
    s = utfør(s, drivere[sete]!.velgHandling(s)).state;
  }

  assert.ok(runder >= 4, `kampen ga bare ${runder} ferdigspilte runder`);
  assert.ok(beslutninger > 200, `bare ${beslutninger} beslutninger`);
  assert.deepEqual(
    feil.slice(0, 5),
    [],
    `HUKOMMELSEN SER INNEVÆRENDE RUNDE. ${feil.length} avvik:\n${feil.slice(0, 5).join("\n")}`,
  );

  /**
   * KONTROLLEN: blokken må FAKTISK bevege seg mellom runder. Sto den bare
   * null hele veien — for eksempel fordi hukommelsen aldri ble koblet på —
   * ville testen over vært grønn på ingenting.
   */
  let bevegde = 0;
  const setene = [0, 1, 2, 3];
  for (const sete of setene) {
    const nøkler = [...førsteIRunde.keys()].filter((k) => k.endsWith(`:${sete}`));
    for (let i = 1; i < nøkler.length; i++) {
      const a = førsteIRunde.get(nøkler[i - 1]!)!;
      const b = førsteIRunde.get(nøkler[i]!)!;
      for (let j = 0; j < HUKOMMELSE_LENGDE; j++) {
        if (!Object.is(a[j], b[j])) {
          bevegde++;
          break;
        }
      }
    }
  }
  assert.ok(
    bevegde > 0,
    `hukommelsesblokken var identisk i HVER runde for hvert sete. Da måler prøven over ` +
      `ingenting — den ville vært grønn på en blokk som aldri fylles.`,
  );
});
