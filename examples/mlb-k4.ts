/**
 * K4 FOR SANDKASSEN — «ha hukommelse over hele spill, og evnen til å planlegge
 * framover».
 *
 *   node examples/mlb-k4.ts --vekter e1-modell/mlb-beste.bin \
 *     --kamper 12 --maalrunde 8 --maalpoeng 300 --ut analyse/mlb-k4
 *
 * ===================== HVORFOR DEN IKKE ER `k4-hukommelse.ts` =============
 *
 * Gjenbruk var førstevalget, og det gikk ikke. `examples/k4-hukommelse.ts`
 * måler `Profilbok.justering` og `Økt.motpartFor` — to kanaler som er LAG
 * UTENPÅ et nett (`profil:` og `okt:`). Sandkassen har ingen av dem: de 144
 * hukommelsestallene er 144 INNGANGER i trekkvektoren, og et `mlb:`-lag har
 * verken profilbok eller økt. `A_NULL`/`A_MINNE` kan altså ikke bygges for et
 * MLB-nett i det hele tatt.
 *
 * Det som ER gjenbrukt er FORMEN, ordrett, fordi den er avgjort:
 *
 *   K2:  samme synlige tilstand, ULIKE skjulte kort  → valget må være LIKT
 *   K4A: samme synlige tilstand, ULIK hukommelse     → valget må være ULIKT
 *
 * ===================== NULLARMEN ER EN SPEKBRYTER, IKKE EN OMSKRIVING =====
 *
 * `mlb:<vekt>h0` slår hukommelsen av og gir en NULLBLOKK på de 144 plassene.
 * Da er den METTE og den FERSKE agenten bit-identiske i inngangen, og andelen
 * endrede valg MÅ bli eksakt 0,0000. Blir den ikke det, måler prøven
 * RNG-posisjon eller agentbygging og ikke hukommelse — nøyaktig den fella
 * `k4-hukommelse.ts` beskriver, og som er grunnen til at den kjører en
 * deterministisk stakk.
 *
 * Her er determinismen gratis: `velgKode` med temperatur 0 er ren argmaks og
 * rører ikke RNG-en i det hele tatt (`nett.ts`). AVGJØRELSE 4 gir oss altså
 * nullpunktet uten at noe måtte skrus av.
 *
 * ===================== OG DEN MÅ KUNNE FEILE ==============================
 *
 * `plantetNett(nett, "HUKOMMELSE")` snur policyen så snart hukommelsesblokka
 * er ulik null. Den agenten HAR per konstruksjon en hukommelseseffekt, og
 * prøven må se den. Gjør den ikke det, betyr et lavt tall fra ekte vekter
 * «prøven er stum», ikke «nettet husker ikke».
 *
 * ===================== LØPET MÅ VÆRE LANGT ===============================
 *
 * `målPoeng = 30` gir kamper på 5,68 runder. Hukommelsen rekker da å se fire–
 * fem ferdigspilte runder, og K4 er strukturelt ulærbar. Standard her er
 * `--maalpoeng 300` og `--maalrunde 8`: målrunden nås med sju ferdigspilte
 * runder bak seg, som er nøyaktig det `AdamsMax.md` ber om.
 *
 * ===================== PRØVE B ER IKKE MÅLBAR, OG HVORFOR =================
 *
 * `AdamsMax.md` K4 har to prøver. Prøve B er «alpha-mu med M ≥ 2 søker over
 * egne FRAMTIDIGE valg». Sandkassen har ikke alpha-mu, og søket den HAR
 * (`src/mlb/sok.ts`, §127) står av i hver eneste driver i repoet — `Sete.søk`
 * er `undefined` overalt, og `docs/mlb.md` AVGJØRELSE 5 forbyr søk i
 * gradienten. Prøve B rapporteres derfor som IKKE MÅLBAR med den grunnen, i
 * stedet for som et tall som later som den er målt.
 */

import { pathToFileURL } from "node:url";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { Sandkasseagent } from "../src/mlb/spekagent.ts";
import { lesSandkasse, mlbSpek, plantetNett, Radskriver, fmt } from "./mlb-krav-felles.ts";

// ===========================================================================
// Riggen
// ===========================================================================

/** Alt en agent må kunne her: velge, nullstille, og bokføre en ferdig runde. */
export interface K4Agent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
  observerRunde?(s: GameState): void;
}

export interface K4Opts {
  readonly vekt: string;
  readonly tro?: string | null;
  readonly kamper?: number;
  readonly frøBase?: number;
  readonly målRunde?: number;
  readonly målPoeng?: number;
  readonly maksRunder?: number;
  /** Hvor mange stillinger per giv som tas opp. Holder kostnaden nede. */
  readonly perRunde?: number;
  readonly fokus?: number;
}

export interface K4Arm {
  readonly navn: string;
  /** Bygger en agent. Kalles på nytt for METT og FERSK, så de aldri deler noe. */
  readonly bygg: () => K4Agent;
  /** Skal denne armen tikke hukommelsen ved RUNDE_SLUTT? */
  readonly tikk: boolean;
}

export interface K4Rad {
  readonly arm: string;
  readonly frø: number;
  readonly runde: number;
  readonly stikk: number;
  readonly fase: string;
  readonly mett: string;
  readonly fersk: string;
  readonly ulikt: 0 | 1;
  /** Runder hukommelsen faktisk hadde bokført da valget ble tatt. */
  readonly bokførte: number;
}

const navn = (h: Handling): string => {
  switch (h.type) {
    case "SPILL":
      return `S${h.kort.farge}${h.kort.verdi}`;
    case "BUD":
      return `B${String(h.bud)}`;
    case "VRAK":
      return `V${h.kort.map((k) => `${k.farge}${k.verdi}`).sort().join(",")}`;
    case "VELG":
      return `T${h.trumf}/${h.etterlyst === null ? "-" : `${h.etterlyst.farge}${h.etterlyst.verdi}`}`;
    default:
      return h.type;
  }
};

/** Antall ferdigspilte runder agenten har bokført. Leses, ikke sluttet. */
function bokførte(a: K4Agent): number {
  const h = (a as unknown as { hukommelse?: { runder(): number } }).hukommelse;
  return h === undefined ? 0 : h.runder();
}

const setetSomBestemmer = (s: GameState): number | null =>
  s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;

/**
 * Spiller ÉN kamp fram til målrunden og sammenlikner METT mot FERSK der.
 *
 * FERSK BYGGES PER STILLING, ikke én gang. En agent som allerede har svart på
 * stilling k har flyttet sin egen beslutningsteller, og selv om `velgKode` med
 * temperatur 0 ikke rører RNG-en, ville hukommelsen dens fått se stillingene
 * den ble spurt om. Da måler prøven en halvfersk agent — og differansen
 * krymper uten at noe i nettet er endret.
 */
export function kjørKamp(arm: K4Arm, frø: number, o: Required<Omit<K4Opts, "vekt" | "tro">>): K4Rad[] {
  const agenter = [0, 1, 2, 3].map(() => arm.bygg());
  for (const a of agenter) a.nyKamp();
  const fokus = agenter[o.fokus]!;

  const ut: K4Rad[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: o.målPoeng }, frø);
  let vakt = 0;
  let iRunde = 0;
  let sisteRunde = -1;

  while (s.fase !== "FERDIG" && vakt++ < 200_000) {
    if (s.rundeNr >= o.maksRunder) break;
    if (s.fase === "RUNDE_SLUTT") {
      // TIKKET. `Hukommelse.observer` bokfører BARE på RUNDE_SLUTT, og ingen
      // spillsløyfe spør en agent om et trekk i den fasen. Uten denne linja er
      // hukommelsen tom hele kampen — se filhodet i `examples/mlb-krav.ts`.
      if (arm.tikk) for (const a of agenter) a.observerRunde?.(s);
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = setetSomBestemmer(s);
    if (sete === null || sete === undefined) break;

    if (s.rundeNr !== sisteRunde) {
      sisteRunde = s.rundeNr;
      iRunde = 0;
    }

    if (
      s.rundeNr === o.målRunde &&
      sete === o.fokus &&
      iRunde < o.perRunde &&
      // Ett lovlig kort er ikke et VALG, og en stilling uten valg kan aldri
      // avvike. Å telle den med ville fortynnet andelen med garanterte nuller.
      (s.fase !== "SPILL" || lovligeKort(s, sete).length >= 2)
    ) {
      iRunde++;
      const mett = navn(fokus.velgHandling(s));
      const ferskAgent = arm.bygg();
      ferskAgent.nyKamp();
      const fersk = navn(ferskAgent.velgHandling(s));
      ut.push({
        arm: arm.navn,
        frø,
        runde: s.rundeNr,
        stikk: s.stikkSpilt,
        fase: s.fase,
        mett,
        fersk,
        ulikt: mett === fersk ? 0 : 1,
        bokførte: bokførte(fokus),
      });
    }

    s = utfør(s, agenter[sete]!.velgHandling(s)).state;
  }
  return ut;
}

// ===========================================================================
// Armene
// ===========================================================================

export function lagArmer(o: K4Opts): K4Arm[] {
  const nett = lesSandkasse(o.vekt);
  const medHuk = mlbSpek({ vekt: o.vekt, tro: o.tro });
  const utenHuk = mlbSpek({ vekt: o.vekt, tro: o.tro, hukommelse: false });
  return [
    /**
     * KONTROLLEN. Hukommelsen er AV i begge halvdelene, så METT og FERSK ser
     * bit-identiske trekkvektorer. MÅ måle eksakt 0,0000. Den står FØRST fordi
     * ingen av de andre radene kan leses uten den.
     */
    { navn: "KONTROLL", bygg: () => lagIndre(utenHuk) as unknown as K4Agent, tikk: true },
    { navn: "mlb", bygg: () => lagIndre(medHuk) as unknown as K4Agent, tikk: true },
    /**
     * FALSIFISERINGSARMEN. Policyen snus så snart hukommelsesblokka er ulik
     * null, altså fra og med første bokførte runde. Andelen MÅ bli høy.
     */
    {
      navn: "PLANTET",
      bygg: () =>
        new Sandkasseagent(plantetNett(nett, "HUKOMMELSE"), {
          temperatur: 0,
          hukommelse: true,
        }) as unknown as K4Agent,
      tikk: true,
    },
    /**
     * DEN TREDJE KONTROLLEN, og den er ikke overflødig: samme plantede nett,
     * men tikket AV. Da fylles hukommelsen aldri, blokka står null hele kampen,
     * og en arm som beviselig HAR evnen måler likevel 0,0000.
     *
     * Den finnes fordi den er nøyaktig defekten `examples/kamp.ts` har mot et
     * `mlb:`-lag i dag — se `examples/mlb-krav.ts`. Uten denne raden ville en
     * null fra den armen sett ut som «nettet husker ikke».
     */
    {
      navn: "PLANTET-utikk",
      bygg: () =>
        new Sandkasseagent(plantetNett(nett, "HUKOMMELSE"), {
          temperatur: 0,
          hukommelse: true,
        }) as unknown as K4Agent,
      tikk: false,
    },
  ];
}

// ===========================================================================
// Måltallet
// ===========================================================================

export interface K4Dom {
  readonly arm: string;
  readonly stillinger: number;
  readonly ulike: number;
  readonly andel: number;
  readonly maksBokførte: number;
}

export function døm(rader: readonly K4Rad[], arm: string): K4Dom {
  const r = rader.filter((x) => x.arm === arm);
  const ulike = r.reduce((a, x) => a + x.ulikt, 0);
  return {
    arm,
    stillinger: r.length,
    ulike,
    andel: r.length === 0 ? NaN : ulike / r.length,
    maksBokførte: r.reduce((a, x) => Math.max(a, x.bokførte), 0),
  };
}

export function målK4(o: K4Opts, skriv?: (r: K4Rad) => void): K4Dom[] {
  const full: Required<Omit<K4Opts, "vekt" | "tro">> = {
    kamper: o.kamper ?? 12,
    frøBase: o.frøBase ?? 4_400_000,
    målRunde: o.målRunde ?? 8,
    målPoeng: o.målPoeng ?? 300,
    maksRunder: o.maksRunder ?? 40,
    perRunde: o.perRunde ?? 6,
    fokus: o.fokus ?? 0,
  };
  const armer = lagArmer(o);
  const alle: K4Rad[] = [];
  for (const arm of armer) {
    for (let k = 0; k < full.kamper; k++) {
      for (const rad of kjørKamp(arm, full.frøBase + k * 7717, full)) {
        alle.push(rad);
        skriv?.(rad);
      }
    }
  }
  return armer.map((a) => døm(alle, a.navn));
}

// ===========================================================================
// Kjøringen
// ===========================================================================

function kjør(): void {
  let vekt = "e1-modell/mlb-beste.bin";
  let tro: string | null = "e1-modell/mlb-tro.bin";
  let utBase = "analyse/mlb-k4";
  const o: { [k: string]: number } = {
    kamper: 12,
    froe: 4_400_000,
    maalrunde: 8,
    maalpoeng: 300,
    maksrunder: 40,
    perrunde: 6,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--vekter") vekt = v ?? vekt;
    else if (a === "--tro") tro = v ?? tro;
    else if (a === "--uten-tro") tro = null;
    else if (a === "--ut") utBase = v ?? utBase;
    else if (a.startsWith("--")) {
      const n = a.slice(2);
      if (n in o) o[n] = tall(v, o[n]!, a);
    }
  }

  const jsonl = new Radskriver(`${utBase}.jsonl`);
  const t0 = Date.now();
  const dommer = målK4(
    {
      vekt,
      tro,
      kamper: o["kamper"]!,
      frøBase: o["froe"]!,
      målRunde: o["maalrunde"]!,
      målPoeng: o["maalpoeng"]!,
      maksRunder: o["maksrunder"]!,
      perRunde: o["perrunde"]!,
    },
    (r) => jsonl.rad(r),
  );

  const L: string[] = [];
  L.push("K4 — HUKOMMELSE OVER HELE SPILLET (sandkassen)");
  L.push("");
  L.push(`Vekter:     ${vekt}`);
  L.push(`Tro:        ${tro ?? "AV"}`);
  L.push(`Kamper:     ${o["kamper"]} til ${o["maalpoeng"]} poeng, målrunde ${o["maalrunde"]}, maks ${o["maksrunder"]}`);
  L.push(`Frøbånd:    ${o["froe"]} + k·7717`);
  L.push(`Kjøretid:   ${Math.round((Date.now() - t0) / 1000)} s`);
  L.push("");
  L.push("Måltallet: andel av fokussetets valg i målrunden som endrer seg når");
  L.push("hukommelsen er FYLT av de foregående rundene, mot en FERSK agent på");
  L.push("nøyaktig samme stilling.");
  L.push("");
  L.push("arm              stillinger   ulike    andel     maks bokførte runder");
  L.push("-".repeat(70));
  for (const d of dommer) {
    L.push(
      `${d.arm.padEnd(16)} ${String(d.stillinger).padStart(10)} ${String(d.ulike).padStart(7)} ` +
        `${fmt(d.andel).padStart(9)} ${String(d.maksBokførte).padStart(20)}`,
    );
  }
  L.push("-".repeat(70));
  L.push("");
  L.push("KONTROLL må være +0,0000. Er den ikke det, måler prøven RNG-posisjon");
  L.push("eller agentbygging, og ingen av de andre radene kan leses.");
  L.push("PLANTET må være klart over null — den armen HAR evnen per konstruksjon.");
  L.push("PLANTET-utikk må være +0,0000: samme nett, men hukommelsen tikkes aldri.");
  L.push("");
  L.push("PRØVE B (framoverblikk) ER IKKE MÅLBAR HER. Sandkassen har ingen");
  L.push("alpha-mu, og søket den har (`src/mlb/sok.ts`) står av i hver driver:");
  L.push("`Sete.søk` er undefined overalt, og AVGJØRELSE 5 forbyr søk i");
  L.push("gradienten. Et tall her ville vært oppdiktet.");

  const tekst = L.join("\n");
  new Radskriver(`${utBase}.txt`).rad(tekst);
  process.stderr.write(tekst + `\n\nSkrevet: ${utBase}.jsonl og ${utBase}.txt\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
