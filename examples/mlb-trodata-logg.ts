/**
 * TROHODETS DATA FRA EPOKENS EGNE KAMPER — R2, trosnettet trenes SAMMEN med policyen.
 *
 *   node examples/mlb-trodata-logg.ts --inn "mlb-epoke-data/e3-s*.jsonl" --ut mlb-epoke-data/tro-e3 \
 *     --kjerner 16 --sjanse 0.3 --maksrunder 100
 *
 * Skriver `<ut>-s<i>.bin` i MLBT v1 — nøyaktig formatet `examples/mlb-trodata.ts`
 * skriver og `verktoy/mlb-tro-tren.py` leser.
 *
 * ===================== HVORFOR (analyse/krav-samspill-2026-09-10.md) ========
 *
 * Trosnettet ble trent én gang, på ADAMS_MAALT mot seg selv, og sto fast mens
 * policyen lærte. Troen er motstanderspesifikk (§119: 12,34 % → 5,09 % på en annen
 * motstander), så jo mer R1 flyttet spillet, jo mer feil ble troen om NETTOPP de
 * spillerne den ble brukt mot — og kortspillet (K7, K3) bygger på den troen.
 * Her lages treningsdataene av de SAMME kampene policyen trenes på, i samme epoke.
 *
 * ===================== HVORDAN, OG HVORFOR IKKE `gjenspill` ===================
 *
 * `gjenspill` gir rader med `troFasit`, men ikke VISNINGEN, og trekkene trohodet
 * tar er `troTrekk(visning, …)`. Kampen spilles derfor på nytt gjennom den samme
 * løkka (`spillKamp`) med en beslutter som leser kodene fra loggen og fanger
 * visningen ved hvert kortvalg. Løkka lager én rad per beslutterkall, i samme
 * rekkefølge, så fangsten og radene pares én til én. Blir kampen ikke den samme
 * (antall koder, vinner), kaster den — samme vakt som `gjenspill`.
 *
 * K2: `troTrekk` tar en `SpillerVisning`. Etiketten (`troFasit`) ser skjult
 * informasjon, men den havner bare i etiketten — som i `mlb-trodata.ts`.
 */
import { fork } from "node:child_process";
import { closeSync, globSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { lagRng } from "../src/kort.ts";
import type { SpillerVisning } from "../src/motor.ts";
import { kortgiving, lagRegler } from "../src/regler.ts";
import {
  kamploggFraLinje,
  spillKamp,
  type Beslutter,
  type Kamplogg,
} from "../src/mlb/selvspill.ts";
import { MLB_TRO_INN, troTrekk } from "../src/mlb/trotrekk.ts";

export interface Trorad {
  readonly t: Float32Array;
  readonly f: Int8Array;
  readonly frø: number;
  readonly stikk: number;
  readonly sete: number;
  /** Visningen raden ble bygd av — for prøven som låser paringen, skrives ikke. */
  readonly visning: SpillerVisning;
}

/**
 * Radene for én kamp. `sjanse` er andelen kortvalg som tas med; `rng` bestemmer
 * hvilke, og bør være bundet til kampens frø så to kjøringer gir samme utvalg.
 */
export function troRaderFraLogg(
  logg: Kamplogg,
  opts: { readonly sjanse: number; readonly rng: () => number; readonly maksRunder: number },
): Trorad[] {
  const koder = logg.koder;
  let i = 0;
  const fanget: (SpillerVisning | null)[] = [];
  const beslutter: Beslutter = (p) => {
    const kode = koder[i++];
    if (kode === undefined) throw new Error(`frø ${logg.frø}: kamploggen er kortere enn kampen`);
    if (p.maske[kode] !== 1) {
      throw new Error(`frø ${logg.frø}: kode ${kode} er ulovlig i ${p.delsteg} — loggen hører til en annen kamp`);
    }
    fanget.push(p.delsteg === "SPILL_KORT" ? p.visning : null);
    return kode;
  };
  const e = spillKamp({
    frø: logg.frø,
    målPoeng: logg.målPoeng,
    seter: logg.seter.map((navn) => ({ navn, nett: null, temperatur: 0, egen: beslutter, samle: true })),
    samleTrekk: false,
    hukommelse: false,
    maksRunder: opts.maksRunder,
  });
  if (e.logg.koder.length !== koder.length || e.fasit.vinner !== logg.fasit.vinner) {
    throw new Error(
      `frø ${logg.frø}: gjenspillingen ga en annen kamp (${e.logg.koder.length} mot ${koder.length} koder, ` +
        `vinner ${e.fasit.vinner} mot ${logg.fasit.vinner})`,
    );
  }
  if (e.rader.length !== fanget.length) {
    throw new Error(`frø ${logg.frø}: ${e.rader.length} rader mot ${fanget.length} beslutterkall — paringen holder ikke`);
  }
  const giving = kortgiving(lagRegler({ antallSpillere: logg.antallSpillere, målPoeng: logg.målPoeng }));
  const ut: Trorad[] = [];
  for (let j = 0; j < fanget.length; j++) {
    const visning = fanget[j];
    if (visning === null || visning === undefined) continue;
    if (opts.rng() >= opts.sjanse) continue;
    const rad = e.rader[j]!;
    if (rad.sete !== visning.deg) {
      throw new Error(`frø ${logg.frø}: rad ${j} er sete ${rad.sete}, visningen er sete ${visning.deg}`);
    }
    let noe = false;
    for (let k = 0; k < 52; k++) if (rad.troFasit[k]! > 0) noe = true;
    if (!noe) continue; // ingen ukjente kort, ingenting å lære
    ut.push({
      t: troTrekk(visning, giving.antallStikk, logg.målPoeng),
      f: rad.troFasit,
      frø: logg.frø,
      stikk: rad.stikkSpilt,
      sete: rad.sete,
      visning,
    });
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Kjøringen
// ---------------------------------------------------------------------------

function kjør(): void {
  let inn = "";
  let ut = "";
  let kjerner = 1;
  let sjanse = 0.3;
  let maksRunder = 100;
  let skardI = -1;
  let skardN = 1;
  for (let a = 2; a < process.argv.length; a++) {
    const x = process.argv[a]!;
    const v = process.argv[a + 1];
    if (x === "--inn") inn = v ?? inn;
    else if (x === "--ut") ut = v ?? ut;
    else if (x === "--kjerner") kjerner = Number(v);
    else if (x === "--sjanse") sjanse = Number(v);
    else if (x === "--maksrunder") maksRunder = Number(v);
    else if (x === "--skard") {
      const d = (v ?? "0/1").split("/");
      skardI = Number(d[0]);
      skardN = Number(d[1]);
    }
  }
  if (inn === "" || ut === "") throw new Error("bruk: --inn <glob> --ut <prefiks> [--kjerner n] [--sjanse p]");

  if (skardI < 0) {
    const t0 = Date.now();
    let ferdige = 0;
    let feil = 0;
    for (let s = 0; s < kjerner; s++) {
      const barn = fork(process.argv[1]!, [...process.argv.slice(2), "--skard", `${s}/${kjerner}`]);
      barn.on("exit", (kode) => {
        ferdige++;
        if (kode !== 0) feil++;
        if (ferdige === kjerner) {
          console.log(`mlb-trodata-logg: ${kjerner} skard ferdige, ${feil} feilet, ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${ut}-s*.bin`);
          if (feil > 0) process.exit(1);
        }
      });
    }
    return;
  }

  const filer = inn.split(",").flatMap((m) => globSync(m)).sort();
  if (filer.length === 0) throw new Error(`Fant ingen kamplogger for «${inn}»`);
  const sti = `${ut}-s${skardI}.bin`;
  mkdirSync(dirname(sti), { recursive: true });
  const fd = openSync(sti, "w");
  const hode = Buffer.alloc(12);
  hode.write("MLBT", 0, "ascii");
  hode.writeInt32LE(1, 4);
  hode.writeInt32LE(MLB_TRO_INN, 8);
  writeSync(fd, hode);
  const POST = MLB_TRO_INN * 4 + 52 + 4 + 2 + 2;
  const KLUMP = 512;
  const buf = Buffer.alloc(POST * KLUMP);
  let iKlump = 0;
  const tøm = (): void => {
    if (iKlump > 0) writeSync(fd, buf, 0, POST * iKlump);
    iKlump = 0;
  };

  let kampnr = -1;
  let rader = 0;
  let kamper = 0;
  for (const fil of filer) {
    for (const linje of readFileSync(fil, "utf8").split("\n")) {
      if (linje.length === 0) continue;
      kampnr++;
      if (kampnr % skardN !== skardI) continue;
      const logg = kamploggFraLinje(linje);
      const rng = lagRng((logg.frø ^ 0x7a0d_a7a1) >>> 0);
      for (const r of troRaderFraLogg(logg, { sjanse, rng, maksRunder })) {
        let o = iKlump * POST;
        for (let k = 0; k < MLB_TRO_INN; k++) {
          buf.writeFloatLE(r.t[k]!, o);
          o += 4;
        }
        for (let k = 0; k < 52; k++) buf.writeInt8(r.f[k]!, o + k);
        o += 52;
        buf.writeInt32LE(r.frø | 0, o);
        buf.writeInt16LE(r.stikk, o + 4);
        buf.writeInt16LE(r.sete, o + 6);
        if (++iKlump === KLUMP) tøm();
        rader++;
      }
      kamper++;
    }
  }
  tøm();
  closeSync(fd);
  console.log(`skard ${skardI}/${skardN}: ${kamper} kamper, ${rader} rader (${MLB_TRO_INN} trekk) -> ${sti}`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
