/**
 * MLB — SELVSPILLKJØRINGEN. N kamper over skard, skrevet LØPENDE til fil.
 *
 *   node examples/mlb-spill.ts --kamper 5000 --kjerner 20 --ut analyse/mlb-e0 \
 *     --maalpoeng 30 --temperatur 1.0 --nett e1-modell/mlb-sandkasse.bin \
 *     [--tro <sti>] [--maksrunder 100] [--uten-k2] [--maal]
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
import { epokeDeltaker, Liga, VANER_TRENING } from "../src/mlb/liga.ts";

// ---------------------------------------------------------------------------
// Argumenter
// ---------------------------------------------------------------------------

let kamper = 200;
let frøBase = 4_100_000;
let kjerner = Math.max(1, cpus().length - 1);
let skardI = -1;
let skardN = 1;
let ut = "analyse/mlb-selvspill";
let målPoeng = 30;
let temperatur = 1.0;
let trosti: string | null = null;
let nettsti: string | null = null;
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

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
  else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
  else if (a === "--kjerner") kjerner = tall(v, kjerner, "--kjerner");
  else if (a === "--maalpoeng") målPoeng = tall(v, målPoeng, "--maalpoeng");
  else if (a === "--temperatur") temperatur = tall(v, temperatur, "--temperatur");
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--tro") trosti = v ?? "e1-modell/mlb-tro.bin";
  else if (a === "--nett") nettsti = v ?? null;
  else if (a === "--maksrunder") maksRunder = tall(v, maksRunder, "--maksrunder");
  else if (a === "--uten-k2") kjørK2 = false;
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
const tronett = trosti === null ? null : MlbTronett.fraBytes(readFileSync(trosti));

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
const sandkasse = nettsti === null ? null : Sandkassenett.fraFil(nettsti);

/**
 * ETT BORD, gitt kampnummeret.
 *
 * Kandidaten roterer gjennom setene. Å la den sitte fast i sete 0 ville blandet
 * «bedre bot» med «bedre plass»: giveren roterer, og budrunden er ikke
 * symmetrisk rundt bordet.
 */
function lagBord(kampnr: number, frø: number): Sete[] {
  const rng = lagRng(frø ^ 0x2b7c_1d55);
  const liga = new Liga(VANER_TRENING);
  liga.settFørste(
    epokeDeltaker(
      nettsti === null ? "epoke0.tilfeldig" : "epoke0",
      sandkasse ?? tilfeldigNett(lagRng(frø ^ 0x9e37_79b9)),
      "beste",
    ),
  );
  return liga.bord(liga.beste(), kampnr % 4, temperatur, rng);
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
      seter: lagBord(k, frø),
      målPoeng,
      maksRunder,
      tronett,
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
    const e = spillKamp({ frø, seter: lagBord(k, frø), målPoeng, maksRunder, tronett, samleTrekk: false });
    besl += e.logg.koder.length;
    rader += e.rader.length;
    rnd += e.fasit.runder;
    if (e.fasit.avbrutt) avb++;
  }
  const sek = (Date.now() - t) / 1000;
  const rad =
    `MÅL kamper=${n} maalpoeng=${målPoeng} tro=${trosti === null ? "av" : "på"} ` +
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
    `kamper=${kamper} kjerner=${kjerner} maalpoeng=${målPoeng} temperatur=${temperatur} ` +
      `tro=${trosti ?? "av"} nett=${nettsti ?? "tilfeldig"} froe=${frøBase}\n`,
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
