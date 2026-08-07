/**
 * K6-PRØVEN — «lære seg andre spillere sine vaner ila spillet og tilpasse seg
 * og utnytte de».
 *
 *   node examples/k6-vaner.ts --kamper 2 --froe 810000000 --maal 300 \
 *     --maksrunder 40 --armer okt-matet,uten-okt --ut analyse/k6-vaner
 *
 * ============================ HVA SOM MÅLES ==============================
 *
 * AdamsMax K6 krever TO ting, og bare den andre er interessant:
 *
 *   1. Adams tjener mer mot en STILISERT motstander med en utnyttbar vane enn
 *      mot en NØYTRAL motstander.
 *   2. Gevinsten VOKSER med rundenummeret.
 *
 * Punkt 1 alene beviser ingenting: en stilisert motstander er dårligere, og en
 * hvilken som helst bot tjener mer mot en dårligere motpart fra første kort.
 * Punkt 2 er signaturen på LÆRING — at forspranget ikke er der i runde 1, men
 * bygger seg opp etter hvert som bordet avslører seg.
 *
 * ========================== HVORFOR KAMPBENKENS FORM ======================
 *
 * `examples/gate2.ts` gir ÉN runde per giv med friske agenter. K6 er
 * strukturelt umålbar der: `okt.ts` har `MIN_RUNDER = 4` og tror ikke på noe
 * før terskelen er nådd. Her spilles hele kamper, med agenter som husker
 * gjennom kampen — samme form som `examples/kamp.ts`.
 *
 * ============================ PARRINGEN ===================================
 *
 * Sterkere enn kampbenkens: `delUt(regler, giving, frø, rundeNr)` avhenger BARE
 * av frø og rundenummer, ikke av hvordan det er spilt. Runde r har derfor
 * NØYAKTIG samme kort i hver arm med samme frø. Måltallet
 *
 *     g(k, r) = kant(stilisert, k, r) − kant(nøytral, k, r)
 *
 * er altså parret på identiske giv. Kampene divergerer i LENGDE og i
 * poengstilling, ikke i givene, så bare runder som finnes i begge armene telles.
 *
 * `kant` er Adams' rundepoeng minus snittet av de tre andres — samme måltall
 * som `d1-fasedeling.ts`.
 *
 * ========================= DEN STILISERTE MOTSTANDEREN ====================
 *
 * TRUMFTREKKEREN. Én vane, og den er valgt fordi den er den ENESTE vanen
 * profilboka faktisk registrerer: `Profilbok.observer` bokfører `ledetTrumf`
 * for forsvarssetene, og `Økt.aggressivitet` leser nettopp det feltet.
 * Trumftrekkeren leder alltid trumf når han har, og legger ellers alltid
 * dyrest. Det gir `trumfutspill`-rate ≈ 1,0 mot befolkningens 0,14, altså
 * `aggressivitet ≈ +1` — så langt over vriterskelen som det går an å komme.
 *
 * Den NØYTRALE er nøyaktig samme basisagent UTEN kappen. Forskjellen mellom de
 * to armene er da vanen og ingenting annet — ikke styrke, ikke bud, ikke vrak.
 *
 * ============================== ARMENE ====================================
 *
 *   uten-okt        `okt:`-laget av. Nullpunktet, bit-identisk med «av»:
 *                   `motpartFor` finnes ikke, og søket antar som før at alle
 *                   spiller som oss. FALSIFISERINGSARMEN — vokser gevinsten
 *                   her også, måler prøven ikke læring.
 *   okt-som-i-dag   `okt:` slik den står i speken i dag.
 *   okt-matet       `okt:` PLUSS at sløyfen mater `bok.observer(s)` ved
 *                   RUNDE_SLUTT.
 *
 * De to siste burde vært samme arm. At de ikke er det er selve funnet — se
 * kommentaren over `ARMER`.
 *
 * ===================== TRE BRUDD MELLOM ØKTEN OG SPILLET ==================
 *
 * Prøven fant tre uavhengige brudd, og hvert av dem alene er nok til å gjøre
 * K6 til null. Alle tre er målt på ATFERD i `test/k6-vaner.test.ts`:
 *
 *   1. `Profilbok.observer` fyrer bare ved RUNDE_SLUTT, og ingen spillsløyfe
 *      spør en agent om noe i den fasen. Boka fylles aldri.
 *   2. `lagIndre` slipper ikke `Spekkontekst` gjennom `vr:`, som står mellom
 *      `okt:` og `amu:` i både V6 og V7. Økten når aldri fram. Se `K6_ADAMS`.
 *   3. `MIN_RUNDER = 4` teller BUD, ikke runder: `Profilbok.runder` returnerer
 *      `profil.bud.n`, og et sete som passer teller ikke. Terskelen inntreffer
 *      i praksis rundt runde tolv — altså omtrent når en kamp til 100 er slutt.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { ADAMS_MAALT, lagIndre, tall } from "../src/moe2/agentspek.ts";
import { MIN_RUNDER, Økt } from "../src/moe2/okt.ts";
import { dyreste } from "../src/moe2/synlig.ts";

/**
 * MATING — hvorfor armen «okt-matet» måtte finnes, og hvorfor det er et funn.
 *
 * `Profilagent.velgHandling` kaller `bok.observer(state)`, og `observer`
 * returnerer straks med mindre `state.fase === "RUNDE_SLUTT"`. Men INGEN
 * spillsløyfe i repoet spør en agent om en handling i den fasen:
 *
 *   examples/kamp.ts   `if (s.fase === "RUNDE_SLUTT") { utfør(NESTE); continue; }`
 *   web/app.ts         `if (lov.fase === "RUNDE_SLUTT") return;`
 *
 * Profilboka fylles altså aldri under spill. `test/profilagent.test.ts` kaller
 * `bok.observer(s)` FOR HÅND i sine egne sløyfer, og er grønn — nøyaktig
 * feilklassen «en test skal måle at noe FYRER, ikke at det finnes».
 *
 * Armen «okt-matet» mater boka fra sløyfen, slik testene gjør, for å svare på
 * det andre spørsmålet: VILLE Adams utnyttet vanen om koblingen var hel? Den er
 * merket i hver eneste rad, og skal aldri forveksles med dagens Adams.
 */
export interface Arm {
  readonly navn: string;
  readonly medØkt: boolean;
  readonly matet: boolean;
}

export const ARMER: readonly Arm[] = [
  { navn: "okt-matet", medØkt: true, matet: true },
  { navn: "uten-okt", medØkt: false, matet: false },
  { navn: "okt-som-i-dag", medØkt: true, matet: false },
];

/**
 * SPEKEN K6 I DET HELE TATT KAN MÅLES MED — og hvorfor det ikke er `ADAMS_V7`.
 *
 * V7 og V6 er begge skrevet `okt:vr:...:amu:...:profil:...`. Men `lagIndre`
 * sender `Spekkontekst` videre gjennom `vakt:`, `budm:`, `amu:`, `ork:` og
 * `eks:` — og IKKE gjennom `vr:`:
 *
 *     return new Vrakrangerer(lagIndre(rest.slice(b + 1)), nett, ...);
 *                             ^ ingen ctx
 *
 * Vrakrangereren står altså MELLOM økten og alt som skulle brukt den. Verken
 * `amu` (som skulle fått `motpartFor`) eller `profil` (som skulle fylt øktens
 * bok) ser den noensinne, og `okt:`-laget lager et objekt ingen leser. Målt i
 * `test/k6-vaner.test.ts` på atferd, ikke på kilden.
 *
 * Her legges `okt:` derfor ØVERST OVER `amu:`, og vrakrangereren tas ut. Adams
 * blir litt svakere av det — men BEGGE armene mister den likt, og uten dette
 * grepet måler prøven en kanal som ikke er koblet.
 */
export const K6_ADAMS =
  "okt:amu:alle:6k8bgm1e0.25r0.4:profil:" +
  "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0:vakt:abmpf:e1:e1-modell/d7alle.bin";

export type Motstander = "stilisert" | "noytral";

export interface Spekagent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
}

/**
 * TRUMFTREKKEREN — den stiliserte motstanderen.
 *
 * En kappe utenpå `spek`, ikke en egen bot: bud, vrak og trumfvalg tas av
 * nøyaktig samme agent som den nøytrale bruker. Bare KORTVALGET vris, og bare
 * der det finnes mer enn ett lovlig kort. Da er den eneste forskjellen mellom
 * armene vanen.
 */
export function lagTrumftrekker(spek: string): Spekagent {
  const basis = lagIndre(spek);
  return {
    nyKamp: () => basis.nyKamp(),
    velgHandling(s: GameState): Handling {
      const h = basis.velgHandling(s);
      if (h.type !== "SPILL" || s.trumf === null) return h;
      const sete = h.spiller;
      const lov = lovligeKort(s, sete);
      if (lov.length < 2) return h;
      // VANEN, del 1: leder alltid trumf når han sitter med trumf.
      if (s.bord.length === 0) {
        const t = lov.filter((k) => k.farge === s.trumf);
        if (t.length > 0) return { type: "SPILL", spiller: sete, kort: dyreste(t, s.trumf) };
      }
      // VANEN, del 2: legger alltid dyrest ellers.
      return { type: "SPILL", spiller: sete, kort: dyreste(lov, s.trumf) };
    },
  };
}

export interface Runderad {
  readonly arm: string;
  readonly motstander: Motstander;
  readonly frø: number;
  readonly sete: number;
  readonly rundeNr: number;
  readonly adamsPoeng: number;
  readonly andreSnitt: number;
  readonly kant: number;
  /** Runder profilboka har bokført om det første motstandersetet. */
  readonly bokRunder: number;
  /** Stilen økten leste ut av det setet, eller null for «vet ikke nok». */
  readonly aggressivitet: number | null;
  /** Ville A2-vrien endret rollout-policyen for det setet nå? */
  readonly vriAktiv: boolean;
}

export interface KampOpts {
  readonly målPoeng: number;
  readonly maksRunder: number;
  readonly adams: string;
  readonly basis: string;
  /** Kalles med økten etter hver runde – bare for tester som vil se innsiden. */
  readonly kikk?: (økt: Økt | null, s: GameState) => void;
}

/** Spiller ÉN kamp til slutt (eller til `maksRunder`) og gir én rad per runde. */
export function spillKamp(
  arm: Arm,
  motstander: Motstander,
  frø: number,
  adamsSete: number,
  opts: KampOpts,
): Runderad[] {
  const økt = arm.medØkt ? new Økt() : null;
  /**
   * `okt:` STRIPPES OG ERSTATTES AV EN ØKT VI SELV EIER.
   *
   * `lagIndre("okt:X", {})` gjør nøyaktig dette internt — lager en `Økt` og
   * sender den ned som kontekst. Forskjellen er at vi beholder referansen, så
   * målingen kan lese ut hva boten FAKTISK lærte i stedet for å slutte det av
   * utfallet. Agenten er den samme.
   */
  const kjerne = opts.adams.startsWith("okt:") ? opts.adams.slice(4) : opts.adams;
  const adams = lagIndre(kjerne, økt === null ? {} : { økt });

  const seter: Spekagent[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === adamsSete) seter.push(adams);
    else seter.push(motstander === "stilisert" ? lagTrumftrekker(opts.basis) : lagIndre(opts.basis));
  }
  økt?.nyKamp();
  for (const a of seter) a.nyKamp();

  const ut: Runderad[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: opts.målPoeng }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 500_000) {
    if (s.fase === "RUNDE_SLUTT") {
      const r = s.sisteRunde;
      if (r !== null) {
        const adamsPoeng = r.delta[adamsSete] ?? 0;
        let sum = 0;
        for (let i = 0; i < 4; i++) if (i !== adamsSete) sum += r.delta[i] ?? 0;
        const andreSnitt = sum / 3;
        /**
         * DIAGNOSTIKKEN LESES FØR MATINGEN. Raden skal vise hva boten visste
         * MENS runden ble spilt, ikke hva den vet etterpå — ellers ser det ut
         * som om terskelen ble nådd én runde tidligere enn den ble.
         */
        const motsete = (adamsSete + 1) % 4;
        const merke: { velgHandling(st: GameState): Handling } = {
          velgHandling: (st: GameState) => adams.velgHandling(st),
        };
        ut.push({
          arm: arm.navn,
          motstander,
          frø,
          sete: adamsSete,
          rundeNr: s.rundeNr,
          adamsPoeng,
          andreSnitt,
          kant: adamsPoeng - andreSnitt,
          bokRunder: økt === null ? 0 : økt.bok.runder(motsete),
          aggressivitet: økt === null ? null : økt.aggressivitet(motsete),
          vriAktiv: økt !== null && økt.motpartFor(merke, motsete) !== merke,
        });
      }
      if (arm.matet && økt !== null) økt.bok.observer(s);
      opts.kikk?.(økt, s);
      if (s.rundeNr + 1 >= opts.maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Statistikk
// ---------------------------------------------------------------------------

export function snitt(x: readonly number[]): number {
  return x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length;
}

export function se(x: readonly number[]): number {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  const v = x.reduce((a, b) => a + (b - m) * (b - m), 0) / (x.length - 1);
  return Math.sqrt(v / x.length);
}

/** OLS-stigningstall for g mot rundenummer, med sitt eget standardavvik. */
export function stigning(r: readonly number[], g: readonly number[]): { b: number; se: number } {
  const n = r.length;
  if (n < 3) return { b: NaN, se: NaN };
  const rm = snitt(r);
  const gm = snitt(g);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (r[i]! - rm) * (g[i]! - gm);
    sxx += (r[i]! - rm) * (r[i]! - rm);
  }
  if (sxx === 0) return { b: NaN, se: NaN };
  const b = sxy / sxx;
  const a = gm - b * rm;
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const e = g[i]! - (a + b * r[i]!);
    rss += e * e;
  }
  return { b, se: Math.sqrt(rss / (n - 2) / sxx) };
}

export interface Parret {
  readonly arm: string;
  readonly frø: number;
  readonly rundeNr: number;
  readonly g: number;
}

/** Parrer stilisert mot nøytral på (arm, frø, rundenummer) – altså på giv. */
export function par(alle: readonly Runderad[]): Parret[] {
  const nøkkel = (r: Runderad): string => `${r.arm}|${r.frø}|${r.rundeNr}`;
  const stil = new Map<string, Runderad>();
  for (const r of alle) if (r.motstander === "stilisert") stil.set(nøkkel(r), r);
  const ut: Parret[] = [];
  for (const r of alle) {
    if (r.motstander !== "noytral") continue;
    const s = stil.get(nøkkel(r));
    if (s === undefined) continue;
    ut.push({ arm: r.arm, frø: r.frø, rundeNr: r.rundeNr, g: s.kant - r.kant });
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Kjøringen — bare når fila er inngangspunktet, så tester kan importere den
// ---------------------------------------------------------------------------

function kjør(): void {
  let kamper = 2;
  let frøBase = 810_000_000;
  let målPoeng = 300;
  let maksRunder = 40;
  let utBase = "analyse/k6-vaner";
  let adamsSpek = K6_ADAMS;
  let basisSpek = ADAMS_MAALT;
  let valgteArmer = ["okt-matet", "uten-okt"];

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
    else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
    else if (a === "--maal") målPoeng = tall(v, målPoeng, "--maal");
    else if (a === "--maksrunder") maksRunder = tall(v, maksRunder, "--maksrunder");
    else if (a === "--ut") utBase = v ?? utBase;
    else if (a === "--adams") adamsSpek = v ?? adamsSpek;
    else if (a === "--basis") basisSpek = v ?? basisSpek;
    else if (a === "--armer") valgteArmer = (v ?? "").split(",").filter((x) => x !== "");
  }

  const armer = ARMER.filter((a) => valgteArmer.includes(a.navn));
  if (armer.length === 0) throw new Error(`Ingen kjente armer i «${valgteArmer.join(",")}»`);

  const jsonl = `${utBase}.jsonl`;
  const rapport = `${utBase}.txt`;
  mkdirSync(dirname(jsonl), { recursive: true });
  writeFileSync(jsonl, "");

  const alle: Runderad[] = [];
  const t0 = Date.now();
  for (const arm of armer) {
    for (let k = 0; k < kamper; k++) {
      const frø = frøBase + k * 7717;
      const sete = k % 4;
      for (const m of ["stilisert", "noytral"] as const) {
        const rader = spillKamp(arm, m, frø, sete, {
          målPoeng,
          maksRunder,
          adams: adamsSpek,
          basis: basisSpek,
        });
        for (const rad of rader) {
          alle.push(rad);
          appendFileSync(jsonl, JSON.stringify(rad) + "\n");
        }
        process.stderr.write(
          `${arm.navn} frø ${frø} sete ${sete} ${m}: ${rader.length} runder, ` +
            `${Math.round((Date.now() - t0) / 1000)} s totalt\n`,
        );
      }
    }
  }

  const parret = par(alle);
  const linjer: string[] = [];
  const skriv = (l: string): void => void linjer.push(l);

  skriv("K6 — LÆRE MOTSTANDERNES VANER OG UTNYTTE DEM");
  skriv("");
  skriv(`Adams:      ${adamsSpek}`);
  skriv(`Basis:      ${basisSpek}`);
  skriv("Stilisert:  trumftrekker (leder alltid trumf, legger alltid dyrest)");
  skriv(`Kamper:     ${kamper} per arm per motstander, til ${målPoeng} poeng, maks ${maksRunder} runder`);
  skriv(`Frøbånd:    ${frøBase} + k·7717`);
  skriv(`MIN_RUNDER: ${MIN_RUNDER} (økten tror ikke på noe før terskelen)`);
  skriv(`Kjøretid:   ${Math.round((Date.now() - t0) / 1000)} s`);
  skriv("");
  skriv("g(k,r) = kant mot stilisert − kant mot nøytral, parret på identisk giv.");
  skriv("Kant    = Adams' rundepoeng − snittet av de tre andres.");
  skriv("");

  for (const arm of armer) {
    const p = parret.filter((x) => x.arm === arm.navn);
    const alleG = p.map((x) => x.g);
    const tidlig = p.filter((x) => x.rundeNr < 12).map((x) => x.g);
    const sen = p.filter((x) => x.rundeNr >= 12).map((x) => x.g);
    const st = stigning(p.map((x) => x.rundeNr), alleG);
    const vekst = snitt(sen) - snitt(tidlig);
    const veksSE = Math.sqrt(se(sen) ** 2 + se(tidlig) ** 2);

    skriv(`=== ARM «${arm.navn}» ===`);
    skriv(`  parrede runder             n = ${p.length}`);
    skriv(`  K6.1 gevinst totalt        ${snitt(alleG).toFixed(3)} ± ${se(alleG).toFixed(3)}`);
    skriv(`  runde 0–11  (før terskel)  ${snitt(tidlig).toFixed(3)} ± ${se(tidlig).toFixed(3)}  (n = ${tidlig.length})`);
    skriv(`  runde 12+   (etter)        ${snitt(sen).toFixed(3)} ± ${se(sen).toFixed(3)}  (n = ${sen.length})`);
    skriv(`  K6.2 vekst (sen − tidlig)  ${vekst.toFixed(3)} ± ${veksSE.toFixed(3)}  z = ${(vekst / veksSE).toFixed(2)}`);
    skriv(`  K6.2 stigning per runde    ${st.b.toFixed(4)} ± ${st.se.toFixed(4)}  z = ${(st.b / st.se).toFixed(2)}`);

    const mot = alle.filter((x) => x.arm === arm.navn && x.motstander === "stilisert");
    const aggr = mot.map((x) => x.aggressivitet).filter((x): x is number => x !== null);
    skriv(`  profilboka så maks         ${Math.max(0, ...mot.map((x) => x.bokRunder))} bokførte runder om setet`);
    skriv(
      `  aggressivitet lest         ${aggr.length === 0 ? "ALDRI (null i hver runde)" : `${aggr.length} av ${mot.length} runder, snitt ${snitt(aggr).toFixed(2)}`}`,
    );
    skriv(`  A2-vrien ville fyrt        ${mot.filter((x) => x.vriAktiv).length} av ${mot.length} runder`);
    skriv("");
  }

  skriv("Gevinst per rundenummer (arm; g; n):");
  for (const arm of armer) {
    const p = parret.filter((x) => x.arm === arm.navn);
    const maks = Math.max(0, ...p.map((x) => x.rundeNr));
    for (let r = 0; r <= maks; r++) {
      const g = p.filter((x) => x.rundeNr === r).map((x) => x.g);
      if (g.length === 0) continue;
      skriv(`  ${arm.navn.padEnd(14)} r=${String(r).padStart(2)}  ${snitt(g).toFixed(3).padStart(8)}  n=${g.length}`);
    }
  }

  writeFileSync(rapport, linjer.join("\n") + "\n");
  process.stderr.write(`\n${linjer.join("\n")}\n\nSkrevet: ${jsonl} og ${rapport}\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
