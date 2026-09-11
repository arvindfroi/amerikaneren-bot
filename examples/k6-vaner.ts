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
 *   okt             Adams slik han står i dag: `okt:`-laget på, og driveren
 *                   tikker `observer(s)` ved RUNDE_SLUTT nøyaktig som
 *                   `examples/kamp.ts` gjør. Ingen krykke — bokføringen går
 *                   gjennom den samme kroken den utrullede benken bruker.
 *   uten-okt        `okt:`-laget av. Nullpunktet: `motpartFor` finnes ikke, og
 *                   søket antar som før at alle spiller som oss.
 *                   FALSIFISERINGSARMEN — vokser gevinsten her også, måler
 *                   prøven ikke læring, men at motparten bare er dårligere.
 *   okt-utikk       `okt:` på, men driveren tikker ALDRI. Tilstanden før fiks
 *                   2. Ligger igjen som kontroll; ikke med i standardkjøringen.
 *
 * ===================== TRE BRUDD MELLOM ØKTEN OG SPILLET ==================
 *
 * Første kjøring av prøven fant tre uavhengige brudd, og hvert av dem alene er
 * nok til å gjøre K6 eksakt null. ALLE TRE ER NÅ RETTET, og hvert av dem har
 * en atferdstest i `test/k6-vaner.test.ts` som vakt mot at det kommer tilbake:
 *
 *   1. `lagIndre` slapp ikke `Spekkontekst` gjennom `vr:`, som står mellom
 *      `okt:` og `amu:` i både V6 og V7. Økten ble laget og kastet. RETTET —
 *      sju grener (`vr:`, `sik:`, `vv:`, `vv2:`, `etl:`, `juks:` og `profil:`s
 *      indre) sender nå `ctx` videre.
 *   2. `Profilbok.observer` fyrer bare ved RUNDE_SLUTT, og ingen spillsløyfe
 *      spurte en agent om noe i den fasen — boka ble aldri fylt. RETTET —
 *      `Spekagent` har nå en valgfri `observer(s)`, videresendt av `okt:`,
 *      `vr:` og `amu:`, og `kamp.ts` kaller den før NESTE.
 *   3. `MIN_RUNDER = 4` telte BUD, ikke runder: `Profilbok.runder` returnerte
 *      `profil.bud.n`, som bare øker når setet faktisk meldte. Med budandel
 *      ~0,33 inntraff terskelen rundt runde TOLV. RETTET — den returnerer nå
 *      `bydde.n`, som teller hver observert runde.
 *
 * Fiks 3 flytter terskelen fra runde ~12 til runde ~4–6, og det er derfor
 * denne kjøringen bruker KORTE kamper: en kamp på 40 runder brenner CPU på 28
 * runder som alle ligger etter terskelen. Kraften per CPU-minutt er høyest når
 * «før» og «etter» er omtrent like store.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { ADAMS_MAALT, lagIndre, tall } from "../src/moe2/agentspek.ts";
import { MIN_RUNDER, Økt } from "../src/moe2/okt.ts";
import { dyreste } from "../src/moe2/synlig.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { kortnettLeserMinne } from "./spek-lag.ts";

/**
 * TIKKET — den kroken som gjorde «matet» til en vanlig arm.
 *
 * `Profilagent.velgHandling` kaller `bok.observer(state)`, og `observer`
 * returnerer straks med mindre `state.fase === "RUNDE_SLUTT"`. Ingen
 * spillsløyfe spurte en agent om en handling i den fasen:
 *
 *   examples/kamp.ts   `if (s.fase === "RUNDE_SLUTT") { utfør(NESTE); continue; }`
 *   web/app.ts         `if (lov.fase === "RUNDE_SLUTT") return;`
 *
 * Profilboka ble altså aldri fylt under spill, og den forrige kjøringen av
 * denne prøven måtte mate `økt.bok.observer(s)` FOR HÅND fra sløyfen — en
 * krykke som svarte på «ville han utnyttet vanen?», ikke på «gjør han det?».
 *
 * NÅ ER KROKEN EKTE: `Spekagent.observer?(s)` finnes i speken, `okt:`, `vr:` og
 * `amu:` videresender den, og `examples/kamp.ts` kaller den før NESTE. Denne
 * sløyfen kaller nøyaktig det samme — `adams.observer?.(s)` — så bokføringen
 * går gjennom hele stakken og ikke utenom den. `tikk` er derfor ikke lenger en
 * innrømmelse, men en beskrivelse av hva enhver driver skal gjøre.
 */
export interface Arm {
  readonly navn: string;
  readonly medØkt: boolean;
  /**
   * Kaller driveren `observer(s)` ved RUNDE_SLUTT, slik `kamp.ts` gjør?
   *
   * UNNTAK (11. sep): en stakk med HUKOMMELSESTRO tikkes i alle armer, se
   * `stakkLeserHukommelse`. Den kan ikke spilles uten tikk — den kaster i runde 2.
   */
  readonly tikk: boolean;
}

/**
 * LESER STAKKEN HUKOMMELSE GJENNOM EN SØKETRO? (11. sep)
 *
 * `sik:…~mlbu=<fil>` / `~mlb=<fil>` med et 804- eller 920-trohode gir en `MlbSøketro`, og
 * den KASTER når en ferdig runde aldri ble vist den (`src/moe2/soketro.ts`). Det er
 * med vilje: et valgfritt kall som aldri når fram, feiler ellers ikke.
 *
 * For armene betyr det at «tikk» og «hukommelse» ikke kan skilles i ÉN stakk — kroken
 * er den samme, og `profil:`-boka under søket får se runden like fullt som troens bok.
 * Armene uten tikk (`uten-okt`, `okt-utikk`) tikker derfor en slik stakk likevel, og
 * rapporten sier det. Uten hukommelsestro er ingenting endret: `K6_ADAMS` og
 * `ADAMS_MAALT` har ingen, og radene er byte-identiske med før.
 *
 * Bredden avgjøres av FILA, ikke av speken: et 660/776-trohode leser ingen bok og
 * trenger ingen tikk.
 */
const hukommelseCache = new Map<string, boolean>();
export function stakkLeserHukommelse(spek: string): boolean {
  let svar = hukommelseCache.get(spek);
  if (svar === undefined) {
    svar = false;
    for (const m of spek.matchAll(/~mlbu?=([^:]+)/g)) {
      if (MlbTronett.fraBytes(new Uint8Array(readFileSync(m[1]!))).brukerHukommelse) svar = true;
    }
    // Kortnettet med motstanderbok (`e1:<493>`, 12. sep) kaster på samme måte (`Kortbok`); med `h0`
    // har det ingen bok og trenger ingen tikk. Et 273-nett gir `false`, så gamle rader står.
    for (const m of spek.matchAll(/(?:^|:)e1:([^:@]+)$/g)) {
      if (!m[1]!.endsWith("h0") && kortnettLeserMinne(m[1]!)) svar = true;
    }
    hukommelseCache.set(spek, svar);
  }
  return svar;
}

export const ARMER: readonly Arm[] = [
  { navn: "okt", medØkt: true, tikk: true },
  { navn: "uten-okt", medØkt: false, tikk: false },
  { navn: "okt-utikk", medØkt: true, tikk: false },
];

/**
 * SPEKEN K6 I DET HELE TATT KAN MÅLES MED — og hvorfor det ikke er `ADAMS_V7`.
 *
 * V7 og V6 er begge skrevet `okt:vr:...:amu:...:profil:...`. Da prøven ble
 * skrevet sendte `lagIndre` `Spekkontekst` videre gjennom `vakt:`, `budm:`,
 * `amu:`, `ork:` og `eks:` — og IKKE gjennom `vr:`:
 *
 *     return new Vrakrangerer(lagIndre(rest.slice(b + 1)), nett, ...);
 *                             ^ ingen ctx
 *
 * Vrakrangereren sto altså MELLOM økten og alt som skulle brukt den. Verken
 * `amu` (som skulle fått `motpartFor`) eller `profil` (som skulle fylt øktens
 * bok) så den noensinne, og `okt:`-laget lagde et objekt ingen leste. Målt i
 * `test/k6-vaner.test.ts` på atferd, ikke på kilden. FEILEN ER SIDEN RETTET.
 *
 * Speken her beholdes likevel, av to grunner: den er den tallene under FAKTISK
 * ble målt med, og den holder `okt:` rett over `amu:` uansett hva som skjer med
 * kontekstkjeden. Vrakrangereren er ute — Adams blir litt svakere av det, men
 * BEGGE armene mister den likt, så differansen er upåvirket.
 */
export const K6_ADAMS =
  "okt:amu:alle:6k8bgm1e0.25r1.5:profil:" +
  "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0:vakt:abmpf:e1:e1-modell/d7alle.bin";

export type Motstander = "stilisert" | "noytral";

export interface Spekagent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
  /** Bokfør en runde uten å spørre om et trekk. Valgfri, som i speken. */
  observer?(s: GameState): void;
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
    // Kappen skal være gjennomsiktig for ALT annet enn kortvalget, også for
    // bokføringskroken — ellers er den ikke «samme agent med én vane».
    observer: (s: GameState) => (basis as { observer?(x: GameState): void }).observer?.(s),
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
  /**
   * DEN ANDRE TERSKELEN, og den fiks 3 ikke rørte.
   *
   * `Økt.aggressivitet` krever BÅDE `bok.runder(sete) ≥ MIN_RUNDER` OG
   * `trumfutspill.n ≥ MIN_RUNDER`. Den siste telleren øker bare når setet var i
   * FORSVAR og selv kom på utspill — altså når det vant et stikk. Mot en Adams
   * som tar stikkene skjer det langt sjeldnere enn én gang per runde, så det er
   * DENNE telleren som avgjør når stilen kan leses, ikke `bydde.n`.
   */
  readonly trumfN: number;
  /** Stilen økten leste ut av det setet, eller null for «vet ikke nok». */
  readonly aggressivitet: number | null;
  /**
   * Hvor mange av de TRE motstandersetene A2-vrien endret policyen for.
   *
   * Ikke bare `motsete`: `motpartFor` spørres per sete, og et av de andre setene
   * kan passere terskelen først. Skal denne raden brukes som «var økten på i
   * denne runden?», må den se hele bordet — ellers merkes runder som urørte
   * mens vrien fyrte et annet sted.
   */
  readonly vriSeter: number;
  /** Fyrte vrien i det hele tatt? `vriSeter > 0`. */
  readonly vriAktiv: boolean;
}

/** `trumfutspill.n` for et sete — telleren som faktisk styrer terskelen. */
export function trumfTeller(økt: Økt, sete: number): number {
  const p = økt.bok.profilFor(sete) as unknown as { trumfutspill?: { n: number } };
  return p.trumfutspill?.n ?? 0;
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
  const adamsTikk = arm.tikk || stakkLeserHukommelse(opts.adams);
  const basisTikk = arm.tikk || stakkLeserHukommelse(opts.basis);

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
        let vriSeter = 0;
        if (økt !== null) {
          for (let i = 0; i < 4; i++) {
            if (i !== adamsSete && økt.motpartFor(merke, i) !== merke) vriSeter++;
          }
        }
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
          trumfN: økt === null ? 0 : trumfTeller(økt, motsete),
          aggressivitet: økt === null ? null : økt.aggressivitet(motsete),
          vriSeter,
          vriAktiv: vriSeter > 0,
        });
      }
      /**
       * TIKKET GÅR GJENNOM STAKKEN, IKKE UTENOM DEN.
       *
       * Forrige kjøring skrev `økt.bok.observer(s)` rett inn i boka. Det svarte
       * på et hypotetisk spørsmål. Nå kalles `observer` på selve agenten —
       * samme linje som `examples/kamp.ts` har — så et hvilket som helst brudd
       * i videresendingen (`okt:` → `vr:` → `amu:` → `profil:`) slår ut i
       * tallet i stedet for å bli maskert.
       */
      // Unntaket: en stakk med hukommelsestro tikkes i alle armer (`stakkLeserHukommelse`).
      for (let i = 0; i < 4; i++) {
        if (i === adamsSete ? adamsTikk : basisTikk) seter[i]!.observer?.(s);
      }
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

/**
 * DOBBELTDIFFERANSEN, PARRET PÅ GIV.
 *
 * `delUt(regler, giving, frø, rundeNr)` avhenger bare av frø og rundenummer, så
 * runde r i arm «okt» har NØYAKTIG samme kort som runde r i «uten-okt». Da kan
 * de to armene differanseres rad for rad i stedet for å sammenliknes som to
 * uavhengige utvalg, og givstøyen — som er den store variansen her — trekkes
 * bort på begge sider.
 *
 *     dd(k, r) = g_okt(k, r) − g_utenOkt(k, r)
 *
 * Det er DET tallet K6 står og faller på. Vokser `dd` med rundenummeret, er det
 * øktminnet som gjør det; vokser bare `g`, er motparten bare dårligere.
 */
export function dobbelt(parret: readonly Parret[], arm: string, null_arm: string): Parret[] {
  const nøkkel = (p: Parret): string => `${p.frø}|${p.rundeNr}`;
  const grunn = new Map<string, number>();
  for (const p of parret) if (p.arm === null_arm) grunn.set(nøkkel(p), p.g);
  const ut: Parret[] = [];
  for (const p of parret) {
    if (p.arm !== arm) continue;
    const b = grunn.get(nøkkel(p));
    if (b === undefined) continue;
    ut.push({ arm: `${arm}−${null_arm}`, frø: p.frø, rundeNr: p.rundeNr, g: p.g - b });
  }
  return ut;
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
  let kamper = 30;
  let frøBase = 810_000_000;
  let målPoeng = 300;
  let maksRunder = 10;
  let utBase = "analyse/k6-vaner";
  let adamsSpek = K6_ADAMS;
  let basisSpek = ADAMS_MAALT;
  let valgteArmer = ["okt", "uten-okt"];
  /**
   * SKILLET MELLOM «FØR» OG «ETTER» TERSKELEN.
   *
   * Satt av `MIN_RUNDER`, ikke av tallene: `Økt.aggressivitet` returnerer null
   * til boka har sett så mange runder. Grensen er altså en egenskap ved KODEN,
   * lest før noe utfall er sett — ikke et sted vi klipper fordi det kler
   * resultatet. Rapporten skriver også ut hvilken runde stilen FAKTISK ble
   * lest i, så avviket mellom de to er synlig.
   */
  let delerunde = MIN_RUNDER;
  /**
   * SAMLEMODUS. Kjøringen deles på flere prosesser med disjunkte frøbånd fordi
   * én runde koster sekunder, ikke millisekunder. `--les a.jsonl,b.jsonl` hopper
   * over spillingen og rapporterer på radene som alt er skrevet. Ingen egen
   * analysefil, og dermed ingen risiko for at rapporten og målingen kommer i
   * utakt: samme kode regner begge.
   */
  let lesFiler: string[] = [];

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--les") lesFiler = (v ?? "").split(",").filter((x) => x !== "");
    else if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
    else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
    else if (a === "--maal") målPoeng = tall(v, målPoeng, "--maal");
    else if (a === "--maksrunder") maksRunder = tall(v, maksRunder, "--maksrunder");
    else if (a === "--delerunde") delerunde = tall(v, delerunde, "--delerunde");
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

  const alle: Runderad[] = [];
  const t0 = Date.now();
  if (lesFiler.length > 0) {
    for (const f of lesFiler) {
      for (const linje of readFileSync(f, "utf8").split("\n")) {
        if (linje.trim() !== "") alle.push(JSON.parse(linje) as Runderad);
      }
    }
    process.stderr.write(`Leste ${alle.length} rader fra ${lesFiler.length} filer\n`);
  } else {
    writeFileSync(jsonl, "");
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
  }

  const parret = par(alle);
  const linjer: string[] = [];
  const skriv = (l: string): void => void linjer.push(l);

  skriv("K6 — LÆRE MOTSTANDERNES VANER OG UTNYTTE DEM");
  skriv("");
  skriv(`Adams:      ${adamsSpek}`);
  skriv(`Basis:      ${basisSpek}`);
  skriv("Stilisert:  trumftrekker (leder alltid trumf, legger alltid dyrest)");
  if (lesFiler.length > 0) {
    const frøene = new Set(alle.map((r) => r.frø));
    skriv(`Kamper:     ${frøene.size} frø per arm per motstander, samlet fra ${lesFiler.length} disjunkte bånd`);
    skriv(`Kilder:     ${lesFiler.join(", ")}`);
  } else {
    skriv(`Kamper:     ${kamper} per arm per motstander, til ${målPoeng} poeng, maks ${maksRunder} runder`);
    skriv(`Frøbånd:    ${frøBase} + k·7717`);
  }
  skriv(`MIN_RUNDER: ${MIN_RUNDER} (økten tror ikke på noe før terskelen)`);
  // Bare når unntaket slo inn — ellers er rapporten byte-identisk med før.
  for (const arm of armer) {
    if (arm.tikk) continue;
    const hvem = [
      ...(stakkLeserHukommelse(adamsSpek) ? ["Adams"] : []),
      ...(stakkLeserHukommelse(basisSpek) ? ["basis"] : []),
    ];
    if (hvem.length > 0) {
      skriv(`NB:         arm «${arm.navn}» tikker likevel ${hvem.join(" og ")}: stakken har hukommelsestro og kaster uten tikk`);
    }
  }
  skriv(`Kjøretid:   ${Math.round((Date.now() - t0) / 1000)} s`);
  skriv("");
  skriv("g(k,r) = kant mot stilisert − kant mot nøytral, parret på identisk giv.");
  skriv("Kant    = Adams' rundepoeng − snittet av de tre andres.");
  skriv(`Skille:  runde < ${delerunde} er FØR terskelen, runde ≥ ${delerunde} er ETTER.`);
  skriv("");

  /** Skriver de fem tallene K6 faktisk vurderes på, for én serie. */
  const bolk = (navn: string, p: readonly Parret[]): void => {
    const alleG = p.map((x) => x.g);
    const tidlig = p.filter((x) => x.rundeNr < delerunde).map((x) => x.g);
    const sen = p.filter((x) => x.rundeNr >= delerunde).map((x) => x.g);
    const st = stigning(p.map((x) => x.rundeNr), alleG);
    const vekst = snitt(sen) - snitt(tidlig);
    const veksSE = Math.sqrt(se(sen) ** 2 + se(tidlig) ** 2);
    skriv(`=== ${navn} ===`);
    skriv(`  parrede runder             n = ${p.length}`);
    skriv(`  K6.1 gevinst totalt        ${snitt(alleG).toFixed(3)} ± ${se(alleG).toFixed(3)}  z = ${(snitt(alleG) / se(alleG)).toFixed(2)}`);
    skriv(`  runde 0–${delerunde - 1}   (før terskel)   ${snitt(tidlig).toFixed(3)} ± ${se(tidlig).toFixed(3)}  (n = ${tidlig.length})`);
    skriv(`  runde ${delerunde}+    (etter)        ${snitt(sen).toFixed(3)} ± ${se(sen).toFixed(3)}  (n = ${sen.length})`);
    skriv(`  K6.2 vekst (sen − tidlig)  ${vekst.toFixed(3)} ± ${veksSE.toFixed(3)}  z = ${(vekst / veksSE).toFixed(2)}`);
    skriv(`  K6.2 stigning per runde    ${st.b.toFixed(4)} ± ${st.se.toFixed(4)}  z = ${(st.b / st.se).toFixed(2)}`);
  };

  for (const arm of armer) {
    bolk(`ARM «${arm.navn}»`, parret.filter((x) => x.arm === arm.navn));
    const mot = alle.filter((x) => x.arm === arm.navn && x.motstander === "stilisert");
    const aggr = mot.map((x) => x.aggressivitet).filter((x): x is number => x !== null);
    const lest = mot.filter((x) => x.aggressivitet !== null).map((x) => x.rundeNr);
    skriv(`  profilboka så maks         ${Math.max(0, ...mot.map((x) => x.bokRunder))} bokførte runder om setet`);
    skriv(
      `  aggressivitet lest         ${aggr.length === 0 ? "ALDRI (null i hver runde)" : `${aggr.length} av ${mot.length} runder, snitt ${snitt(aggr).toFixed(2)}`}`,
    );
    skriv(`  først lest i runde         ${lest.length === 0 ? "aldri" : String(Math.min(...lest))} (tidligste over alle kamper)`);
    skriv(`  trumfutspill.n maks        ${Math.max(0, ...mot.map((x) => x.trumfN))} (terskelen krever ${MIN_RUNDER})`);
    skriv(`  A2-vrien fyrte             ${mot.filter((x) => x.vriAktiv).length} av ${mot.length} runder`);
    skriv("");
  }

  /**
   * DOBBELTDIFFERANSEN — prøvens egentlige svar.
   *
   * Krever at «uten-okt» er med. Uten falsifiseringsarmen betyr et positivt
   * tall i «okt» ingenting, og da skal det heller ikke skrives ut noe som ser
   * ut som en konklusjon.
   */
  const harNull = armer.some((a) => a.navn === "uten-okt");
  const hovedarm = armer.find((a) => a.navn !== "uten-okt");
  if (harNull && hovedarm !== undefined) {
    const dd = dobbelt(parret, hovedarm.navn, "uten-okt");
    skriv("Parret rad for rad på giv: samme frø og rundenummer i begge armene.");
    bolk(`DOBBELTDIFFERANSE «${hovedarm.navn}» − «uten-okt»`, dd);
    skriv("");

    /**
     * DEN MEKANISTISKE DELINGEN — sterkere enn et rundenummer.
     *
     * Rundenummeret er bare en STEDFORTREDER for «hadde økten lest noe?».
     * Terskelen faller i ulik runde i hver kamp, så et fast skille blander
     * behandlede og ubehandlede runder på begge sider. Her deles det på det som
     * faktisk skjedde: fyrte A2-vrien i den stiliserte kampen den runden?
     *
     * Delingen ser bare på ØKTENS EGEN TILSTAND, aldri på utfallet, og den er
     * derfor ikke en klipping etter tallene. Kontrollen er skarp: i runder der
     * vrien ALDRI fyrte skal dobbeltdifferansen være EKSAKT 0,000 — armene er da
     * bit-identiske. Er den ikke det, lekker noe annet enn økten mellom armene,
     * og hele dobbeltdifferansen måler noe vi ikke har navngitt.
     */
    const fyrte = new Set<string>();
    for (const r of alle) {
      if (r.arm === hovedarm.navn && r.motstander === "stilisert" && r.vriAktiv) {
        fyrte.add(`${r.frø}|${r.rundeNr}`);
      }
    }
    bolk(
      "DOBBELTDIFFERANSE der A2-vrien FYRTE",
      dd.filter((x) => fyrte.has(`${x.frø}|${x.rundeNr}`)),
    );
    bolk(
      "DOBBELTDIFFERANSE der den ikke fyrte (skal være 0,000)",
      dd.filter((x) => !fyrte.has(`${x.frø}|${x.rundeNr}`)),
    );
    skriv("");
  } else {
    skriv("INGEN DOBBELTDIFFERANSE: falsifiseringsarmen «uten-okt» var ikke med.");
    skriv("");
  }

  skriv("Gevinst per rundenummer (arm; g; n):");
  for (const arm of armer) {
    const p = parret.filter((x) => x.arm === arm.navn);
    const maks = Math.max(0, ...p.map((x) => x.rundeNr));
    for (let r = 0; r <= maks; r++) {
      const g = p.filter((x) => x.rundeNr === r).map((x) => x.g);
      if (g.length === 0) continue;
      skriv(`  ${arm.navn.padEnd(14)} r=${String(r).padStart(2)}  ${snitt(g).toFixed(3).padStart(8)} ± ${se(g).toFixed(3)}  n=${g.length}`);
    }
  }

  writeFileSync(rapport, linjer.join("\n") + "\n");
  process.stderr.write(`\n${linjer.join("\n")}\n\nSkrevet: ${jsonl} og ${rapport}\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
