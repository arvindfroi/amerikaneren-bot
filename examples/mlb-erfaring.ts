/**
 * MLB fase 0.5 — ERFARINGEN, fra kamplogg til gradientmat.
 *
 *   node examples/mlb-erfaring.ts --inn "analyse/mlb-e3-s*.jsonl" \
 *     --nett e1-modell/mlb-arbeid.bin --ut mlb-epoke-data/erf \
 *     --kjerner 20 --sjanse 0.2
 *
 * ===================== HVA DETTE LEDDET ER =============================
 *
 * `examples/mlb-spill.ts` skriver KAMPER (§5a): frø, hvem satt hvor, hvilke
 * koder ble valgt. 4,5 kB per kamp. Treningen trenger TREKK: 1 032 flyttall per
 * beslutning, masken, koden, og de tre etikettene. Dette leddet er
 * oversettelsen, og den skjer ved å SPILLE KAMPEN OM IGJEN — `gjenspill()` —
 * ikke ved å lese noe som ble lagret.
 *
 * Det er hele grunnen til at trekklayouten ikke er låst. Endres `trekk.ts`,
 * kjøres dette leddet på nytt over de samme kamploggene.
 *
 * ===================== HVORFOR NETTET MÅ VÆRE MED PÅ GJENSPILLINGEN =====
 *
 * Fordelen er `A = r + V(s') − V(s)`, og `V` er nettets eget verdianslag i
 * stillingen. Det er ikke lagret i kamploggen — det ville vært 1 400 flyttall
 * til per kamp, og det ville dessuten bundet erfaringen til vektene den ble
 * spilt med. Nettet settes derfor i kandidatsetet under gjenspillingen, mens
 * KODENE fortsatt kommer fra loggen. Da er `V` friskt og handlingene er de som
 * faktisk ble tatt.
 *
 * ===================== VERDIETIKETTEN ER RESTEN AV KAMPEN ===============
 *
 * `docs/mlb.md` §2: episoden er KAMPEN. Men etiketten kan ikke være setets
 * sluttpoeng slik det står: da telesкоperer ikke TD-en.
 *
 *     A = r + V(s') − V(s),  r = poeng(t+1) − poeng(t)
 *
 * Skal `A` være TD-residualet til et konsistent mål, må `V(s)` spå det som
 * gjenstår: `sluttpoeng[sete] − poengFør`. Da er `G(t) = r + G(t+1)` en
 * identitet, og et perfekt verdihode gir `A = 0` for hver rad. Med RÅ
 * sluttpoeng som etikett hadde `r` blitt talt to ganger, og fordelen ville hatt
 * en systematisk skjevhet på nøyaktig rundens poeng. Se §123.
 *
 * ===================== §124: OG «RESTEN» ER FOR MYE ====================
 *
 * `sluttpoeng[sete] − poengFør` er BIT-IDENTISK for hver beslutning i samme
 * runde. Med `--lambda 1` er fordelen `G − V`, og da bærer 99,68 % av
 * variansen ingen informasjon om hvilket KORT som var bra — den dytter hele
 * runden i samme retning. 96,5 % av rundene får identisk fortegn på alle sine
 * valg. Se `analyse/mlb-fordel-diagnose.txt` og `gaeFordel`.
 *
 * `--gamma` demper halen. Både fordelen og verdimålet regnes nå med samme γ,
 * og de regnes av SAMME funksjonspar i `selvspill.ts` — to steder med hver sin
 * γ ville gitt en skjevhet som ikke feiler noe sted.
 *
 * ===================== ANDELEN, OG HVORFOR DEN ER NØDVENDIG =============
 *
 * 5 000 kamper gir ~2,0 M kandidatrader. Som trekkvektorer i float32 er det
 * 8,3 GB per epoke, hver epoke. `--sjanse` trekker et tilfeldig utvalg —
 * deterministisk av kampens frø, så to kjøringer gir samme utvalg — og
 * FORDELEN regnes på HELE kjeden før utvalget tas. Ellers ville `nesteISete`
 * pekt forbi en rad som ikke ble skrevet, og `r` blitt målt over feil avstand.
 */

import { fork } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { globSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { Sandkassenett } from "../src/mlb/nett.ts";
import { HANDLING_LENGDE } from "../src/mlb/handling.ts";
import { TREKK_LENGDE } from "../src/mlb/trekk.ts";
import {
  diskontertRetur,
  gaeFordel,
  gjenspill,
  kamploggFraLinje,
  type Beslutningsrad,
  type Kamplogg,
  type Sete,
} from "../src/mlb/selvspill.ts";

// ---------------------------------------------------------------------------
// Argumenter
// ---------------------------------------------------------------------------

let innMønster = "analyse/mlb-selvspill-s*.jsonl";
let nettsti: string | null = null;
let ut = "mlb-epoke-data/erf";
let kjerner = Math.max(1, cpus().length - 1);
let skardI = -1;
let skardN = 1;
let sjanse = 1.0;
let maksRunder = 100;
let rapportfil = "analyse/mlb-erfaring.txt";
/**
 * HORISONTEN I FORDELEN. 1 = «faktisk minus ventet» (`G − V`), 0 = ren TD.
 *
 * Se `gaeFordel` i `src/mlb/selvspill.ts`: TD alene drev policyen med støy fra
 * et verdihode som ennå ikke forklarte variansen, og andelen `amerikaner`/
 * `solo` STEG. Standarden er derfor 1 i fase 0.5, og den skal ned igjen når
 * verdihodet forklarer noe.
 */
let lambda = 1.0;
/**
 * DISKONTERINGEN PER RUNDE. 1 = §123s form, hele resten av kampen udempet.
 *
 * Standarden er 0,5 fordi §124 målte at 1 tar kredittilordningen ut: sd på
 * rundens poeng er 9,9, sd på resten av kampen 61,5, og en regularisert ridge
 * på de samme trekkene forklarer bare +0,19 av den halen. Den kan altså ikke
 * baselines bort — den må veies ned. Med γ = 0,5 blir signal/støy 1,76 i
 * stedet for 0,16, og makrotrekkene beholder gradient (neste runde 0,5, den
 * etter 0,25), så K5 overlever.
 *
 * SAMME STANDARD HER OG I `verktoy/mlb-epoke.py`. To standarder for samme tall
 * er hvordan «det målte og det utrullede var ikke samme ting» oppstår.
 */
let gamma = 0.5;

const tall = (v: string | undefined, navn: string): number => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${navn} trenger et tall, fikk «${String(v)}»`);
  return x;
};

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--inn") innMønster = v ?? innMønster;
  else if (a === "--nett") nettsti = v ?? null;
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--kjerner") kjerner = tall(v, "--kjerner");
  else if (a === "--sjanse") sjanse = tall(v, "--sjanse");
  else if (a === "--maksrunder") maksRunder = tall(v, "--maksrunder");
  else if (a === "--rapport") rapportfil = v ?? rapportfil;
  else if (a === "--lambda") lambda = tall(v, "--lambda");
  else if (a === "--gamma") gamma = tall(v, "--gamma");
  else if (a === "--skard") {
    const d = (v ?? "0/1").split("/");
    skardI = tall(d[0], "--skard i");
    skardN = tall(d[1], "--skard n");
  }
}

if (nettsti === null) throw new Error("--nett er påkrevd: fordelen trenger nettets eget V(s)");

// ---------------------------------------------------------------------------
// Formatet — MLBE
// ---------------------------------------------------------------------------

/**
 * ÉN RAD, pakket. Bredden står i hodet, så leseren kan ikke gjette feil.
 *
 *   trekk      TREKK_LENGDE × f32
 *   maske      HANDLING_LENGDE × u8      — masken MÅ inn i tapet
 *   troFasit   52 × i8                   — 0 = sett, 1–3 = rel. sete, 4 = talong
 *   kode       i16    handlingen som faktisk ble tatt
 *   lovlige    i16    < 2 betyr at raden ikke bærer noen policygradient
 *   fase       i16    0 bud, 1 vrak, 2 velg, 3 spill
 *   sete       i16
 *   fordel     f32    A = r + γ·V(s') − V(s), akkumulert med λ (og γ)
 *   verdimål   f32    G^γ = r + γ·G^γ(neste). Med γ = 1 er det eksakt
 *                     `sluttpoeng[sete] − poengFør`, altså §123s form.
 *   vFør       f32    nettets eget V(s) da raden ble laget — for diagnostikk
 */
const MASKE_LENGDE = HANDLING_LENGDE;
const POST = TREKK_LENGDE * 4 + MASKE_LENGDE + 52 + 2 * 4 + 4 * 3;

const FASEKODE: Record<string, number> = { BUDRUNDE: 0, VRAK: 1, VELG: 2, SPILL: 3 };

const delfil = (i: number): string => `${ut}-s${i}.bin`;

// ---------------------------------------------------------------------------
// Ett skard
// ---------------------------------------------------------------------------

interface Sammendrag extends Record<string, number> {
  skard: number;
  kamper: number;
  rader: number;
  skrevet: number;
  medValg: number;
  sekunder: number;
  sumFordel: number;
  sumAbsFordel: number;
  sumMål: number;
  sumV: number;
  sumKvadMål: number;
  sumKvadFeil: number;
}

function kjørSkard(i: number, n: number): void {
  const filer = innMønster
    .split(",")
    .flatMap((m) => globSync(m))
    .sort();
  if (filer.length === 0) throw new Error(`Fant ingen kamplogger for «${innMønster}»`);

  const nett = Sandkassenett.fraFil(nettsti!);
  mkdirSync(dirname(ut), { recursive: true });
  const fd = openSync(delfil(i), "w");
  {
    /**
     * RADSTØRRELSEN STÅR I HODET, og det er ikke pynt.
     *
     * `numpy.fromfile` med en `dtype` som er ett felt for kort leser ikke feil —
     * den leser STILLE FEIL, forskjøvet med noen byte per rad, og gir et
     * korpus som ser ut som tall. Med bredden i hodet kan leseren KREVE at
     * `dtype.itemsize` stemmer, og en glemt kolonne blir en feilmelding.
     */
    const hode = Buffer.alloc(20);
    hode.write("MLBE", 0, "ascii");
    hode.writeInt32LE(1, 4);
    hode.writeInt32LE(TREKK_LENGDE, 8);
    hode.writeInt32LE(MASKE_LENGDE, 12);
    hode.writeInt32LE(POST, 16);
    writeSync(fd, hode);
  }

  const KLUMP = 64;
  const buf = Buffer.alloc(POST * KLUMP);
  let iKlump = 0;
  const tøm = (): void => {
    if (iKlump > 0) writeSync(fd, buf, 0, POST * iKlump);
    iKlump = 0;
  };

  const s: Sammendrag = {
    skard: i,
    kamper: 0,
    rader: 0,
    skrevet: 0,
    medValg: 0,
    sekunder: 0,
    sumFordel: 0,
    sumAbsFordel: 0,
    sumMål: 0,
    sumV: 0,
    sumKvadMål: 0,
    sumKvadFeil: 0,
  };
  const t0 = Date.now();

  let kampnr = -1;
  for (const fil of filer) {
    const linjer = readFileSync(fil, "utf8").split("\n");
    for (const linje of linjer) {
      if (linje.length === 0) continue;
      kampnr++;
      if (kampnr % n !== i) continue;
      const logg: Kamplogg = kamploggFraLinje(linje);
      const samle = logg.samleSeter;
      if (samle === undefined || samle.length === 0) {
        throw new Error(
          `Kamploggen mangler «samleSeter» (frø ${logg.frø}). Den er skrevet før §123 — ` +
            `spill epoken om igjen i stedet for å gjette hvem som var kandidaten.`,
        );
      }

      /**
       * SETENE FOR GJENSPILLINGEN: nettet BARE i kandidatsetene.
       *
       * `trengerTrekk` i `kjørKamp` er `nett !== null || (samleTrekk && samle
       * !== false)`, så et motstandersete uten nett og med `samle: false`
       * bygger ingen trekkvektor. Det er ikke sparsommelighet for syns skyld:
       * tre av fire seter er 75 % av `byggTrekk`-arbeidet, og de radene skal
       * likevel ikke trenes på — verdihodet spår DENNE agentens gjenstående
       * poeng, ikke en vanes.
       */
      const seter: Sete[] = logg.seter.map((navn, sete) => ({
        navn,
        nett: samle.includes(sete) ? nett : null,
        temperatur: 0,
        egen: () => {
          throw new Error("gjenspill skal lese koden fra loggen");
        },
        samle: samle.includes(sete),
      }));

      const erfaring = gjenspill(logg, { seter, samleTrekk: true, maksRunder });
      const rader = erfaring.rader;
      s.kamper++;
      s.rader += rader.length;
      const fordeler = gaeFordel(rader, erfaring.fasit, (x) => x.verdi ?? 0, lambda, gamma);
      // MÅLET REGNES AV SAMME γ SOM FORDELEN, i samme fil, i samme kall.
      const mål = diskontertRetur(rader, erfaring.fasit, gamma);

      // Utvalget er deterministisk av kampens frø — to kjøringer gir samme fil.
      const rng = lagRng((logg.frø ^ 0x51ed_270b) >>> 0);
      for (let r = 0; r < rader.length; r++) {
        const rad: Beslutningsrad = rader[r]!;
        const v = rad.verdi ?? 0;
        const fordel = fordeler[r]!;
        const m = mål[r]!;

        s.sumFordel += fordel;
        s.sumAbsFordel += Math.abs(fordel);
        s.sumMål += m;
        s.sumV += v;
        s.sumKvadMål += m * m;
        s.sumKvadFeil += (m - v) * (m - v);
        if (rad.lovlige > 1) s.medValg++;

        if (rng() > sjanse) continue;
        if (rad.trekk === null || rad.maske === null) {
          throw new Error("Gjenspillingen ga en rad uten trekk — samleTrekk var av");
        }

        let o = iKlump * POST;
        for (let k = 0; k < TREKK_LENGDE; k++) {
          buf.writeFloatLE(rad.trekk[k]!, o);
          o += 4;
        }
        for (let k = 0; k < MASKE_LENGDE; k++) buf.writeUInt8(rad.maske[k]!, o + k);
        o += MASKE_LENGDE;
        for (let k = 0; k < 52; k++) buf.writeInt8(rad.troFasit[k]!, o + k);
        o += 52;
        buf.writeInt16LE(rad.kode, o);
        buf.writeInt16LE(Math.min(32767, rad.lovlige), o + 2);
        buf.writeInt16LE(FASEKODE[rad.beslutning] ?? 3, o + 4);
        buf.writeInt16LE(rad.sete, o + 6);
        o += 8;
        buf.writeFloatLE(fordel, o);
        buf.writeFloatLE(m, o + 4);
        buf.writeFloatLE(v, o + 8);

        iKlump++;
        s.skrevet++;
        if (iKlump === KLUMP) tøm();
      }
    }
  }
  tøm();
  closeSync(fd);
  s.sekunder = Number(((Date.now() - t0) / 1000).toFixed(2));
  if (process.send !== undefined) process.send(s);
}

// ---------------------------------------------------------------------------
// Hovedløpet
// ---------------------------------------------------------------------------

if (skardI >= 0) {
  kjørSkard(skardI, skardN);
} else {
  mkdirSync(dirname(ut), { recursive: true });
  mkdirSync(dirname(rapportfil), { recursive: true });
  writeFileSync(
    rapportfil,
    `mlb-erfaring startet ${new Date().toISOString()}\n` +
      `inn=${innMønster} nett=${nettsti} ut=${ut} sjanse=${sjanse} kjerner=${kjerner}\n` +
      // λ og γ MÅ stå i den varige fila. To epoker med ulik γ gir tall som
      // ikke er sammenliknbare, og uten dem i loggen er de heller ikke
      // gjenkjennelige som ulike.
      `lambda=${lambda} gamma=${gamma} maksrunder=${maksRunder}\n`,
  );
  const t0 = Date.now();
  const deler: Sammendrag[] = [];
  await Promise.all(
    Array.from({ length: kjerner }, (_, i) => {
      return new Promise<void>((ferdig, feil) => {
        const barn = fork(process.argv[1]!, [
          ...process.argv.slice(2),
          "--skard",
          `${i}/${kjerner}`,
        ]);
        barn.on("message", (m) => deler.push(m as Sammendrag));
        barn.on("exit", (kode) =>
          kode === 0 ? ferdig() : feil(new Error(`skard ${i} avsluttet med ${kode}`)),
        );
      });
    }),
  );
  const sum = (f: (s: Sammendrag) => number): number => deler.reduce((a, s) => a + f(s), 0);
  const sek = (Date.now() - t0) / 1000;
  const rader = sum((s) => s.rader);
  const skrevet = sum((s) => s.skrevet);
  const snittMål = sum((s) => s.sumMål) / Math.max(rader, 1);
  const varMål = sum((s) => s.sumKvadMål) / Math.max(rader, 1) - snittMål * snittMål;
  const mseV = sum((s) => s.sumKvadFeil) / Math.max(rader, 1);
  const linjer = [
    `FERDIG ${new Date().toISOString()}  veggtid=${sek.toFixed(1)} s`,
    `kamper=${sum((s) => s.kamper)} rader=${rader} skrevet=${skrevet} ` +
      `medValg=${sum((s) => s.medValg)} (${((sum((s) => s.medValg) / Math.max(rader, 1)) * 100).toFixed(1)} %)`,
    `fordel: snitt=${(sum((s) => s.sumFordel) / Math.max(rader, 1)).toFixed(4)} ` +
      `snitt|A|=${(sum((s) => s.sumAbsFordel) / Math.max(rader, 1)).toFixed(4)}`,
    `verdimaal: snitt=${snittMål.toFixed(3)} varians=${varMål.toFixed(3)} ` +
      `MSE(V)=${mseV.toFixed(3)} forklart=${(1 - mseV / Math.max(varMål, 1e-9)).toFixed(4)}`,
    `paa disk=${((skrevet * POST) / 1e6).toFixed(1)} MB (${POST} bytes/rad)`,
    "",
  ];
  appendFileSync(rapportfil, linjer.join("\n"));
  process.stderr.write(linjer.join("\n"));
}
