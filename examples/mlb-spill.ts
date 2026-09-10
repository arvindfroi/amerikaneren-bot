/**
 * MLB — SELVSPILLKJØRINGEN. N kamper over skard, skrevet LØPENDE til fil.
 *
 *   node examples/mlb-spill.ts --kamper 5000 --kjerner 20 --ut analyse/mlb-e0 \
 *     --maalpoeng 30 --temperatur 1.0 --nett e1-modell/mlb-sandkasse.bin \
 *     [--maksrunder 100] [--uten-k2] [--maal]
 *
 * ===================== HVORFOR «LØPENDE PER RAD» STÅR I TOPPEN ==========
 *
 * `docs/plan.md` har en hard regel kjøpt med tapte kjøringer: flertimers
 * målinger skal ALDRI ligge i et stdout-rør. Prosessen skriver derfor selv,
 * med `appendFileSync`, én linje per kamp — og en egen framdriftslogg per
 * skard, også den til fil. Blir kjøringen drept etter to timer, står alt som
 * ble spilt fram til drapet på disk.
 *
 * ===================== FORMATET ER KAMPEN, IKKE VEKTOREN ================
 *
 * `docs/mlb.md` §5a: 1 032 flyttall per beslutning er 17–67 GB per epoke og
 * ville låst trekklayouten for alltid. Her skrives `Kamplogg` — frø, hvem som
 * satt hvor, hvilke koder som ble valgt — og `gjenspill()` bygger trekkene på
 * nytt når treningen trenger dem. Endres layouten, gjenspilles bufferet.
 *
 * ===================== K2 KJØRES FØR HVER EPOKE, IKKE ETTER =============
 *
 * `docs/sandkassen.md` §2: «kjøres etter HVER epoke, ikke bare til slutt.»
 * Her kjøres den FØR erfaringen genereres, som er det samme kravet lest
 * riktig vei: en epoke som lakk skal ikke rekke å skrive 5 000 kamper med
 * forgiftede rader først. Prøven er `test/mlb-k2-selvspill.test.ts`, den har en
 * kontrollarm som blir tatt, og et rødt svar STOPPER kjøringen.
 *
 * ===================== TO NETT, OG BEGGE HAR EN JOBB ====================
 *
 * Med `--nett` kjøres `Sandkassenett` fra `src/mlb/nett.ts` — det ekte, og det
 * som setter epoketiden. UTEN flagget kjøres `tilfeldigNett`, og det er ikke en
 * nødløsning: det ER fase 1 i `docs/mlb.md`, «et TILFELDIG nett spiller lovlig
 * i 1000 kamper uten å krasje», og den prøven skal kunne kjøres uten vekter i
 * det hele tatt.
 *
 * Stubben lages med et frø AVLEDET AV KAMPENS FRØ, ikke av en delt strøm —
 * ellers ville to kjøringer av samme kommando gitt ulike kamper, og hele
 * parringsmetodikken forutsetter at de ikke gjør det.
 */

import { fork } from "node:child_process";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { Sandkassenett } from "../src/mlb/nett.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import {
  antallMedValg,
  kamploggTilLinje,
  spillKamp,
  tilfeldigNett,
  type Sete,
} from "../src/mlb/selvspill.ts";
import { epokeDeltaker, Liga, TRENINGSVEKTER, VANER_TRENING } from "../src/mlb/liga.ts";
/**
 * LÆREREN — Arvind 10. september: MLB startes fra Adams-v5, et bevisst unntak fra
 * «ingen mester» (`docs/mlb.md` AVGJØRELSE 1b og 2). Importen ligger i `examples/`
 * og aldri i `src/mlb/`, så herkomstvakten for selve nettet står uendret: det er
 * TRENINGSDATAENE som bærer læreren, og bare med `--laerer adams`.
 */
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { kortgiving, lagRegler, type GameRules, type Kortgiving } from "../src/regler.ts";
import type { Handling } from "../src/motor.ts";
import { budKode, kortKode, trumfKode } from "../src/mlb/handling.ts";
import { visningTilState } from "../src/mlb/trekk.ts";
import type { Beslutter } from "../src/mlb/selvspill.ts";

// ---------------------------------------------------------------------------
// Argumenter
// ---------------------------------------------------------------------------

let kamper = 200;
let frøBase = 4_100_000;
let kjerner = Math.max(1, cpus().length - 1);
let skardI = -1;
let skardN = 1;
let ut = "analyse/mlb-selvspill";
/**
 * LØPSLENGDEN — ÉN ELLER FLERE, TRUKKET PER KAMP (§126).
 *
 * ===================== HVORFOR DEN MÅTTE BLI FLERE ======================
 *
 * Den var ett tall for hele kjøringen, og arkitekturrevisjonen målte hva det
 * koster. `makro.målPoeng.per100` og `.trettiDelt` er da KONSTANTE innganger,
 * og en konstant inngang gir gradienten `c · δ` — nøyaktig proporsjonal med
 * biasens. Målt over ti epoker er korrelasjonen mellom kolonnens endring og
 * biasens endring **r = 1,0000**: kolonnen er en omskalert bias, og alt nettet
 * har lært av den er et konstantledd. K5 kunne derfor ikke læres. Ikke «ble
 * ikke lært» — kunne ikke, uansett antall epoker.
 *
 * Og det slår videre. Ved mål 30 varer en kamp **5,68 runder** i trening.
 * `Hukommelse.observer` bokfører ved `RUNDE_SLUTT`, så hukommelsen ser høyst
 * fire–fem ferdigspilte runder før siste beslutning. `docs/sandkassen.md` §3
 * forutsetter at «nettet lærer selv når fire observasjoner er for lite og når
 * tjue er nok» — den får aldri tjue. De nitten MAKRO-leddene i hukommelsen
 * (`…MotStilling`, `…MotTid`) er korrelasjoner over høyst fire punkter, og K6s
 * nullresultat følger av det. Ved mål 100 er kampen 27,16 runder.
 *
 * Én endring, to krav: K5 blir lærbart, K4 og K6 får dybden de forutsetter.
 *
 * ===================== PRISEN, MÅLT OG IKKE ANSLÅTT =====================
 *
 * 30 / 60 / 100 gir 5,68 / 12,88 / 27,16 runder per kamp. En lik blanding
 * koster derfor ~2,7× maskintid per kamp mot dagens rene 30-løp.
 *
 * ===================== TREKNINGEN ER PER KAMP, IKKE PER SKARD ===========
 *
 * Den tas av kampens EGET frø, ikke av kampnummeret. `lagBord` bruker allerede
 * `kampnr % 4` for setet og `kampnr` gjennom `frø`; en runde-robin på `k` ville
 * låst løpslengden til bordsammensetningen i et fast mønster, og da måler vi
 * samspillet mellom de to i stedet for løpslengden. Trekningen er determinis-
 * tisk per frø, så skardene er enige uten å snakke sammen, og to kjøringer av
 * samme kommando gir samme kamper.
 */
let målPoengValg: number[] = [30];
let temperatur = 1.0;
/**
 * TROEN SOM INNGANG (§126). Står PÅ som standard, med `e1-modell/mlb-tro.bin`.
 *
 * Den sto AV, og resultatet var at TRO-blokkens 209 innganger var eksakt null
 * i hver rad i ti epoker. Standarden er derfor snudd: sensorene står på, og
 * `--uten-tro` er den eksplisitte veien til å slå dem av. Stien SKRIVES i
 * rapporten, så en kjøring uten tro ikke kan forveksles med en med.
 */
let trosti: string | null = "e1-modell/mlb-tro.bin";
let nettsti: string | null = null;
/**
 * BEFOLKNINGEN, som filer.
 *
 * `--beste` er ligaens nåværende beste (vekt 0,4) og `--tidligere` er de
 * porterte forgjengerne (0,3). Uten dem har ligaen bare ETT nett, og §3s
 * «tidligere epoker, 30 %, hindrer at vi glemmer» er en tom rad i en tabell.
 * Standardvalget — ingen av delene — er epoke 0, der de tomme gruppene faller
 * bort av seg selv i `Liga.trekkMotstander`.
 */
let bestesti: string | null = null;
let tidligereStier: string[] = [];
let kjørK2 = true;
let bareMål = false;
/**
 * RUNDETAKET. Se `Kampfasit.avbrutt`: med en utrent policy tar et løp til 30
 * ikke alltid slutt, og de avbrutte kampene er de DYRESTE — de koster taket i
 * runder mens en ferdigspilt kamp koster ~15. Taket er derfor en fartsknapp
 * like mye som en sikkerhetsvakt, og det skal kunne skrus på fra kommandolinja
 * og stå i rapporten.
 */
let maksRunder = 100;

const tall = (v: string | undefined, standard: number, navn: string): number => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${navn} trenger et tall, fikk «${String(v)}»`);
  return x;
};

/** `--maalpoeng 30` eller `--maalpoeng 30,60,100`. Ett tall er dagens oppførsel. */
const lesMålPoeng = (v: string | undefined): number[] => {
  const d = (v ?? "").split(",").filter((x) => x.length > 0).map((x) => tall(x, 0, "--maalpoeng"));
  if (d.length === 0) throw new Error("--maalpoeng trenger minst ett tall");
  for (const x of d) {
    if (!Number.isInteger(x) || x < 1) throw new Error(`--maalpoeng må være hele tall ≥ 1, fikk ${x}`);
  }
  return d;
};

/**
 * Løpslengden for kamp `k`, trukket av kampens EGET frø.
 *
 * Ett tall i lista gir det tallet uten å røre noen RNG — en kjøring med
 * `--maalpoeng 30` er da bit-identisk med den som var før §126.
 */
const målPoengFor = (frø: number): number => {
  if (målPoengValg.length === 1) return målPoengValg[0]!;
  const i = Math.floor(lagRng(frø ^ 0x5f37_2b91)() * målPoengValg.length);
  return målPoengValg[Math.min(i, målPoengValg.length - 1)]!;
};

/**
 * KOLONNEKJERNEN (`src/nevro/nett-kolonne.ts`), 1,94× per beslutning, IKKE
 * bit-identisk. Treningsdata tåler numerisk støy; måling gjør det ikke — derfor
 * av som standard, og derfor står valget i rapporten. Skardene får flagget
 * gjennom `process.argv`, så alle kjører samme kjerne.
 */
let raskKjerne = false;

/**
 * LÆREREN I ALLE FIRE SETER (`--laerer adams`). Da er bordet ikke ligaen, men
 * Adams-v5 mot seg selv, og hvert sete samles: kodene i loggen er Adams' egne
 * valg, og `mlb-erfaring.ts` gjør dem til rader med Adams' valg som etikett.
 * Adapteren er prøvd: Adams velger identisk på `visningTilState` som på ekte
 * stat (9 876 beslutninger, 0 avvik), og fire adaptersetert gir eksakt samme
 * kamp som fire Adams i motoren (8 av 8: vinner, poeng, runder).
 */
let laerer: "adams" | null = null;

/**
 * ADAMS SOM MOTSTANDER (`--adams-andel p`). Andelen p av kampene spilles med
 * kandidaten i ETT sete (roterer med kampnummeret) mot TRE Adams-v5 - det
 * samme bordet kampbenken doemmer paa. Resten er ligaen som foer. Adams-setene
 * samles IKKE: her er de motstandere, ikke laerere. Trukket av kampens eget
 * froe, saa to kjoeringer gir samme bord.
 */
let adamsAndel = 0;

/**
 * VANEANDELEN (`--ligavekter beste,tidligere,vaner`, R2). K6 krever vaner å lære og
 * utnytte, og i R1 satt de i bare 15 % av kampene (30 % av ligahalvdelen). Tom =
 * `TRENINGSVEKTER` i `src/mlb/liga.ts`. Summen må være 1.
 */
let ligavekter: { beste: number; tidligere: number; vaner: number } | null = null;

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
  else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
  else if (a === "--kjerner") kjerner = tall(v, kjerner, "--kjerner");
  else if (a === "--maalpoeng") målPoengValg = lesMålPoeng(v);
  else if (a === "--temperatur") temperatur = tall(v, temperatur, "--temperatur");
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--tro") trosti = v ?? null;
  else if (a === "--uten-tro") trosti = null;
  else if (a === "--nett") nettsti = v ?? null;
  else if (a === "--beste") bestesti = v ?? null;
  else if (a === "--tidligere") tidligereStier = (v ?? "").split(",").filter((x) => x.length > 0);
  else if (a === "--maksrunder") maksRunder = tall(v, maksRunder, "--maksrunder");
  else if (a === "--uten-k2") kjørK2 = false;
  else if (a === "--rask-kjerne") raskKjerne = true;
  else if (a === "--laerer") {
    if (v !== "adams") throw new Error(`--laerer kjenner bare «adams», fikk «${String(v)}»`);
    laerer = "adams";
  }
  else if (a === "--adams-andel") adamsAndel = tall(v, adamsAndel, "--adams-andel");
  else if (a === "--ligavekter") {
    const d = (v ?? "").split(",").map((x) => tall(x, NaN, "--ligavekter"));
    if (d.length !== 3 || d.some((x) => !(x >= 0)) || Math.abs(d[0]! + d[1]! + d[2]! - 1) > 1e-6) {
      throw new Error(`--ligavekter trenger «beste,tidligere,vaner» som summerer til 1, fikk «${String(v)}»`);
    }
    ligavekter = { beste: d[0]!, tidligere: d[1]!, vaner: d[2]! };
  }
  else if (a === "--maal") bareMål = true;
  else if (a === "--skard") {
    const d = (v ?? "0/1").split("/");
    skardI = tall(d[0], 0, "--skard i");
    skardN = tall(d[1], 1, "--skard n");
  }
}

const delfil = (i: number): string => `${ut}-s${i}.jsonl`;
const loggfil = (i: number): string => `${ut}-log-${i}.txt`;
const rapportfil = `${ut}-rapport.txt`;

// ---------------------------------------------------------------------------
// Bordet
// ---------------------------------------------------------------------------

/**
 * TROHODET SOM TREKK KOSTER 0,45 ms AV 0,52 (§120).
 *
 * Det er sju ganger alt annet i vektoren til sammen, og det er DET som setter
 * epoketiden — ikke resten. Derfor er det avslått som standard i denne
 * kjøringen og slås på med `--tro`, slik at de to regimene kan måles hver for
 * seg i stedet for at det dyre er skjult i et standardvalg.
 */

/**
 * DET EKTE NETTET, når det finnes.
 *
 * Uten `--nett` kjøres `tilfeldigNett`, som er fase 1: «spiller et TILFELDIG
 * nett lovlig?». Med `--nett` er det `Sandkassenett` fra `src/mlb/nett.ts`, og
 * det er DEN kjøringen som setter epoketiden — et framoverpass over ~2,4 M
 * vekter er tre størrelsesordener dyrere enn stubben.
 *
 * ALLE SETER DELER ÉN INSTANS. Vektene er de samme, `framover` er ren, og en
 * kopi per sete ville kostet 9,5 MB × 4 uten å endre ett eneste tall.
 */
/**
 * Lastes ÉN gang per prosess. `MlbTronett` kaster hvis formen er feil, og det
 * skal den: et trohode med feil bredde ville gitt tause søppelvekter.
 */
const tronett = trosti === null ? null : MlbTronett.fraBytes(readFileSync(trosti));

const sandkasse = nettsti === null ? null : Sandkassenett.fraFil(nettsti);

/**
 * MOTSTANDERNE, lastet ÉN gang.
 *
 * `Sandkassenett.fraFil` leser 9,5 MB og bygger 2,4 M vekter; å gjøre det per
 * kamp ville kostet mer enn kampen. Vektene er de samme for alle kamper, og
 * `framover` er ren, så én instans per fil holder.
 */
const besteNett = bestesti === null ? null : Sandkassenett.fraFil(bestesti);
const tidligereNett = tidligereStier.map((s) => ({ sti: s, nett: Sandkassenett.fraFil(s) }));

/**
 * ALLE NETTENE I SAMME KJERNE. Et bord der kandidaten regner i én kjerne og
 * motstanderne i en annen ville vært et bord ingen har bedt om.
 */
if (raskKjerne) {
  tronett?.brukKolonnekjerne();
  sandkasse?.brukKolonnekjerne();
  besteNett?.brukKolonnekjerne();
  for (const t of tidligereNett) t.nett.brukKolonnekjerne();
}

const navnAv = (sti: string): string => sti.replace(/\\/g, "/").split("/").pop() ?? sti;

/**
 * ETT BORD, gitt kampnummeret.
 *
 * Kandidaten roterer gjennom setene. Å la den sitte fast i sete 0 ville blandet
 * «bedre bot» med «bedre plass»: giveren roterer, og budrunden er ikke
 * symmetrisk rundt bordet.
 *
 * KANDIDATEN ER `--nett`, BEFOLKNINGEN ER `--beste` + `--tidligere` + vanene.
 * De to er ikke det samme etter epoke 0: arbeidsvektene trenes hver epoke,
 * mens ligaens «beste» bare flyttes av PORTEN. Faller de sammen (epoke 0, og
 * hver gang porten godkjenner), settes ingen egen `beste`-deltaker inn — da
 * ville kandidaten møtt seg selv to ganger under to navn, og vektene i §3
 * hadde ikke betydd det de sier.
 */
function lagBord(kampnr: number, frø: number): Sete[] {
  if (laerer === "adams") return lærerbord(frø);
  if (adamsAndel > 0 && lagRng(frø ^ 0x6ad4_11a1)() < adamsAndel) return adamsbord(kampnr, frø);
  const rng = lagRng(frø ^ 0x2b7c_1d55);
  const liga =
    ligavekter === null ? new Liga(VANER_TRENING) : new Liga(VANER_TRENING, { ...TRENINGSVEKTER, ...ligavekter });
  const kandidat = epokeDeltaker(
    nettsti === null ? "epoke0.tilfeldig" : navnAv(nettsti),
    sandkasse ?? tilfeldigNett(lagRng(frø ^ 0x9e37_79b9)),
    "beste",
  );
  liga.settFørste(
    besteNett === null
      ? kandidat
      : epokeDeltaker(navnAv(bestesti!), besteNett, "beste"),
  );
  for (const t of tidligereNett) {
    liga.leggTilTidligere(epokeDeltaker(navnAv(t.sti), t.nett, "tidligere"));
  }
  return liga.bord(kandidat, kampnr % 4, temperatur, rng);
}

/**
 * ADAMS-V5 SOM MLB-SETE. Hele handlingen regnes ut ved FØRSTE delsteg av en
 * beslutning og leveres som én kode per delsteg: vrak = fire kort i Adams' egen
 * rekkefølge, velg = trumf og så etterlyst kort. Adams ser bare `visning`, gjort
 * om til en redigert stat — prøvd å gi identiske valg som på ekte stat.
 *
 * Passer delsteget ikke handlingen, KASTER den. En lærer som gjetter en kode
 * ville lært nettet noe Adams aldri gjorde.
 */
function adamsBeslutter(regler: GameRules, giving: Kortgiving): Beslutter {
  const agent = lagIndre(ADAMS);
  let plan: Handling | null = null;
  return (p) => {
    if (p.delvalg.vrak.length === 0 && p.delvalg.trumf === null) {
      plan = agent.velgHandling(visningTilState(p.visning, regler, giving));
      // KANONISK VRAKREKKEFØLGE. Adams leverer de fire vrakkortene i vilkårlig orden (målt
      // 10. sep på 200 kamper: 263 stigende, 82 synkende, 1 865 annet av 2 210 vrak). Rekkefølgen
      // endrer ikke spillet, men imitasjonen ville lært å GJETTE den, og samsvaret i VRAK blitt
      // kunstig lavt. Stigende kortkode er én fast rekkefølge; settet er Adams' eget.
      if (plan.type === "VRAK") {
        plan = { ...plan, kort: [...plan.kort].sort((a, b) => kortKode(a) - kortKode(b)) };
      }
    }
    const h = plan;
    if (h === null) throw new Error("Adams-læreren har ingen plan");
    switch (p.delsteg) {
      case "BUD":
        if (h.type === "BUD") return budKode(h.bud);
        break;
      case "VRAK_KORT": {
        const k = h.type === "VRAK" ? h.kort[p.delvalg.vrak.length] : undefined;
        if (k !== undefined) return kortKode(k);
        break;
      }
      case "VELG_TRUMF":
        if (h.type === "VELG") return trumfKode(h.trumf);
        break;
      case "VELG_ETTERLYST":
        if (h.type === "VELG" && h.etterlyst !== null) return kortKode(h.etterlyst);
        break;
      case "SPILL_KORT":
        if (h.type === "SPILL") return kortKode(h.kort);
        break;
    }
    throw new Error(`Adams-læreren: delsteg ${p.delsteg} passer ikke handlingen ${JSON.stringify(h)}`);
  };
}

/** Fire Adams-seter, alle samlet. `målPoeng` følger kampens eget frø, som i `kjørSkard`. */
function lærerbord(frø: number): Sete[] {
  const regler = lagRegler({ antallSpillere: 4, målPoeng: målPoengFor(frø) });
  const giving = kortgiving(regler);
  return [0, 1, 2, 3].map((i) => ({
    navn: `adams-v5.${i}`,
    nett: null,
    temperatur: 0,
    egen: adamsBeslutter(regler, giving),
    samle: true,
  }));
}

/** Kandidaten i sete `kampnr % 4`, tre Adams-v5 rundt. Bare kandidaten samles. */
function adamsbord(kampnr: number, frø: number): Sete[] {
  if (sandkasse === null) throw new Error("--adams-andel trenger --nett: kandidaten må være et nett");
  const regler = lagRegler({ antallSpillere: 4, målPoeng: målPoengFor(frø) });
  const giving = kortgiving(regler);
  const kandidatsete = kampnr % 4;
  return [0, 1, 2, 3].map((i) =>
    i === kandidatsete
      ? { navn: navnAv(nettsti!), nett: sandkasse, temperatur, samle: true }
      : { navn: `adams-v5.${i}`, nett: null, temperatur: 0, egen: adamsBeslutter(regler, giving), samle: false },
  );
}

// ---------------------------------------------------------------------------
// Ett skard
// ---------------------------------------------------------------------------

function kjørSkard(i: number, n: number): void {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(delfil(i), "");
  writeFileSync(loggfil(i), `skard ${i}/${n} startet ${new Date().toISOString()}\n`);

  let skrevet = 0;
  let beslutninger = 0;
  let samlede = 0;
  let medValg = 0;
  let runder = 0;
  let avbrutt = 0;
  let bytes = 0;
  const t0 = Date.now();

  for (let k = 0; k < kamper; k++) {
    if (k % n !== i) continue;
    const frø = frøBase + k * 7717;
    const erfaring = spillKamp({
      frø,
      tronett,
      seter: lagBord(k, frø),
      målPoeng: målPoengFor(frø),
      maksRunder,
      /**
       * SAMLETREKK ER AV. Radene bygges når treningen trenger dem, av
       * `gjenspill()`. Det er §5a, og det er forskjellen på 36 MB og 67 GB.
       */
      samleTrekk: false,
    });
    const linje = kamploggTilLinje(erfaring.logg);
    appendFileSync(delfil(i), linje);
    bytes += Buffer.byteLength(linje);
    skrevet++;
    /**
     * TO ULIKE TALL, og de ble blandet i første utgave.
     *
     * `koder.length` er ALLE beslutninger ved bordet — det er den som setter
     * maskintiden. `rader.length` er bare kandidatsetets rader, altså den
     * erfaringen epoken faktisk kan trene på. Rapportert som ett tall ga det
     * en «ms per beslutning» fire ganger for høy.
     */
    beslutninger += erfaring.logg.koder.length;
    samlede += erfaring.rader.length;
    medValg += antallMedValg(erfaring.rader);
    runder += erfaring.fasit.runder;
    if (erfaring.fasit.avbrutt) avbrutt++;

    if (skrevet % 25 === 0) {
      const sek = (Date.now() - t0) / 1000;
      appendFileSync(
        loggfil(i),
        `${skrevet} kamper, ${(skrevet / sek).toFixed(2)} kamper/s, ` +
          `${(beslutninger / skrevet).toFixed(1)} beslutninger/kamp, ` +
          `${(runder / skrevet).toFixed(1)} runder/kamp\n`,
      );
    }
  }

  const sek = (Date.now() - t0) / 1000;
  const oppsummering = {
    skard: i,
    kamper: skrevet,
    sekunder: Number(sek.toFixed(2)),
    kamperPerSek: Number((skrevet / Math.max(sek, 1e-9)).toFixed(3)),
    beslutningerPerKamp: Number((beslutninger / Math.max(skrevet, 1)).toFixed(1)),
    raderPerKamp: Number((samlede / Math.max(skrevet, 1)).toFixed(1)),
    medValgPerKamp: Number((medValg / Math.max(skrevet, 1)).toFixed(1)),
    runderPerKamp: Number((runder / Math.max(skrevet, 1)).toFixed(2)),
    avbruttAndel: Number((avbrutt / Math.max(skrevet, 1)).toFixed(4)),
    bytesPerKamp: Math.round(bytes / Math.max(skrevet, 1)),
  };
  appendFileSync(loggfil(i), `FERDIG ${JSON.stringify(oppsummering)}\n`);
  if (process.send !== undefined) process.send(oppsummering);
}

// ---------------------------------------------------------------------------
// K2 — porten inn til en epoke
// ---------------------------------------------------------------------------

function k2EllerStopp(): void {
  const t = Date.now();
  const r = spawnSync(process.execPath, ["--test", "test/mlb-k2-selvspill.test.ts"], {
    encoding: "utf8",
  });
  const sek = ((Date.now() - t) / 1000).toFixed(1);
  const linje = `K2/selvspill: ${r.status === 0 ? "GRØNN" : "RØD"} etter ${sek} s\n`;
  appendFileSync(rapportfil, linje);
  process.stderr.write(linje);
  if (r.status !== 0) {
    appendFileSync(rapportfil, `${r.stdout ?? ""}\n${r.stderr ?? ""}\n`);
    throw new Error(
      "K2-prøven er RØD. Epoken genereres IKKE — en epoke som lekker skal ikke rekke " +
        "å skrive tusenvis av forgiftede rader først. Se " + rapportfil,
    );
  }
}

// ---------------------------------------------------------------------------
// Hovedløpet
// ---------------------------------------------------------------------------

if (skardI >= 0) {
  kjørSkard(skardI, skardN);
} else if (bareMål) {
  /**
   * FARTSMÅLINGEN, alene og på ÉN kjerne. Hele budsjettregnestykket i §5b
   * hviler på «kamper per sekund per kjerne», og det tallet må måles der
   * ingenting annet konkurrerer om kjernen.
   */
  mkdirSync(dirname(ut), { recursive: true });
  const n = Math.max(10, Math.min(kamper, 200));
  let besl = 0;
  let rader = 0;
  let rnd = 0;
  let avb = 0;
  const t = Date.now();
  for (let k = 0; k < n; k++) {
    const frø = frøBase + k * 7717;
    const e = spillKamp({ frø, seter: lagBord(k, frø), målPoeng: målPoengFor(frø), maksRunder, tronett, samleTrekk: false });
    besl += e.logg.koder.length;
    rader += e.rader.length;
    rnd += e.fasit.runder;
    if (e.fasit.avbrutt) avb++;
  }
  const sek = (Date.now() - t) / 1000;
  const rad =
    `MÅL kamper=${n} maalpoeng=${målPoengValg.join("/")} ` +
    `nett=${nettsti ?? "tilfeldig"} maksrunder=${maksRunder} ` +
    `sek=${sek.toFixed(2)} kamper/s/kjerne=${(n / sek).toFixed(2)} ` +
    `beslutninger/kamp=${(besl / n).toFixed(1)} rader/kamp=${(rader / n).toFixed(1)} ` +
    `runder/kamp=${(rnd / n).toFixed(2)} ` +
    `avbrutt=${((avb / n) * 100).toFixed(1)}% ` +
    `ms/beslutning=${((sek * 1000) / Math.max(besl, 1)).toFixed(3)}\n`;
  appendFileSync(rapportfil, rad);
  process.stderr.write(rad);
} else {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(rapportfil, `mlb-spill startet ${new Date().toISOString()}\n`);
  appendFileSync(
    rapportfil,
    `kamper=${kamper} kjerner=${kjerner} maalpoeng=${målPoengValg.join("/")} temperatur=${temperatur} `
      + `tro=${trosti ?? "AV"} ` +
      `nett=${nettsti ?? "tilfeldig"} froe=${frøBase} ` +
      `maksrunder=${maksRunder} beste=${bestesti ?? "(kandidaten selv)"} ` +
      `tidligere=[${tidligereStier.join(",")}] ` +
      `laerer=${laerer === null ? "ingen (liga)" : "adams (alle fire seter, Arvinds unntak 10. sep)"} adams-andel=${adamsAndel} ligavekter=${ligavekter === null ? "standard" : `${ligavekter.beste}/${ligavekter.tidligere}/${ligavekter.vaner}`} ` +
      `kjerne=${raskKjerne ? "kolonne (--rask-kjerne, ikke bit-identisk)" : "rad (bit-identisk)"}\n`,
  );
  if (kjørK2) k2EllerStopp();

  const t0 = Date.now();
  const sammendrag: Record<string, number>[] = [];
  await Promise.all(
    Array.from({ length: kjerner }, (_, i) => {
      return new Promise<void>((ferdig, feil) => {
        const barn = fork(process.argv[1]!, [
          ...process.argv.slice(2).filter((a) => a !== "--maal"),
          "--skard",
          `${i}/${kjerner}`,
          "--uten-k2",
        ]);
        barn.on("message", (m) => sammendrag.push(m as Record<string, number>));
        barn.on("exit", (kode) =>
          kode === 0 ? ferdig() : feil(new Error(`skard ${i} avsluttet med ${kode}`)),
        );
      });
    }),
  );
  const sek = (Date.now() - t0) / 1000;
  const totalt = sammendrag.reduce((a, s) => a + (s.kamper ?? 0), 0);
  const perKjerne =
    sammendrag.reduce((a, s) => a + (s.kamperPerSek ?? 0), 0) / Math.max(sammendrag.length, 1);
  const beslutninger =
    sammendrag.reduce((a, s) => a + (s.beslutningerPerKamp ?? 0), 0) /
    Math.max(sammendrag.length, 1);
  const bytesPerKamp =
    sammendrag.reduce((a, s) => a + (s.bytesPerKamp ?? 0), 0) / Math.max(sammendrag.length, 1);
  const linjer = [
    `FERDIG ${new Date().toISOString()}`,
    `kamper=${totalt} veggtid=${sek.toFixed(1)} s`,
    `kamper/s totalt=${(totalt / sek).toFixed(2)}  kamper/s/kjerne=${perKjerne.toFixed(2)}`,
    `beslutninger/kamp=${beslutninger.toFixed(1)}  rader/kamp=${(
      sammendrag.reduce((a, x) => a + (x.raderPerKamp ?? 0), 0) / Math.max(sammendrag.length, 1)
    ).toFixed(1)}  bytes/kamp=${bytesPerKamp.toFixed(0)}`,
    `avbrutt paa rundetaket=${(
      (sammendrag.reduce((a, x) => a + (x.avbruttAndel ?? 0), 0) /
        Math.max(sammendrag.length, 1)) *
      100
    ).toFixed(1)} %`,
    `erfaring på disk=${((bytesPerKamp * totalt) / 1e6).toFixed(1)} MB`,
    `EPOKEANSLAG 5000 kamper: ${((5000 / (totalt / sek)) / 60).toFixed(1)} min`,
    `TI EPOKER: ${(((5000 / (totalt / sek)) * 10) / 3600).toFixed(2)} timer`,
    "",
  ];
  appendFileSync(rapportfil, linjer.join("\n"));
  process.stderr.write(linjer.join("\n"));
}
