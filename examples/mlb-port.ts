/**
 * MLB fase 0.5 — PORTEN, kjørt på en EKTE epoke.
 *
 *   node examples/mlb-port.ts --kandidat e1-modell/mlb-e3.bin \
 *     --forrige e1-modell/mlb-beste.bin --kamper 300 \
 *     --band 1800000000,1850000000 --kjerner 20 --ut analyse/mlb-epoke/e3-port
 *
 * §122 bygde `portDom` og prøvde den på KONSTRUERTE tall: 40 rene støyarmer,
 * 0 godkjent. Den var aldri kjørt på to ekte sett med vekter. Dette skriptet er
 * koblingen.
 *
 * ===================== HVILKET BORD PORTEN DØMMER PÅ, OG HVORFOR ========
 *
 * Første utgave lot porten dømme på LIGABORDET: kandidaten i ett sete, tre
 * motstandere trukket fra befolkningen, altså «forrige beste» og
 * treningsvanene. Det er den naturlige lesningen av `docs/mlb.md` §3 — og en
 * røykprøve på 60 kamper viste hvorfor den ikke duger tidlig i løpet:
 *
 *   epoke 2 mot epoke 0, ligabord:      −170,2 poeng (z = −5,27), 40 % AVBRUTT
 *   epoke 2 mot epoke 0, fast referanse: +31,7 poeng (z = +2,87), 0 % avbrutt
 *
 * Med tre nesten tilfeldige motstandere ved bordet tar kampen ikke slutt
 * (§122s ubundne løp), «lederen vinner» blir avgjort av hvem som sank
 * saktest, og poengskalaen er −100-vis. Porten dømte da hovedsakelig
 * *motstandernes* selvdestruksjon.
 *
 * **Porten dømmer derfor på en FAST REFERANSE: de tre testvanene.** Kandidat
 * og forrige spiller de SAMME givene mot de SAMME tre motstanderne, i to
 * disjunkte frøbånd, med en kontrollarm. Miljøet terminerer, skalaen er
 * lesbar, og referansen er den samme i epoke 1 og epoke 10 — så porten og
 * kurven måler det samme.
 *
 * `VANER_TEST` er dessuten den ene motstanden som ALDRI er i treningsligaen
 * (målt disjunkt fra `VANER_TRENING` i `test/mlb-liga.test.ts`), så tallet er
 * ikke gjenkjenning av en motstander boten har trent mot.
 *
 * LIGABORDET ER IKKE KASTET — det rapporteres ved siden av, som `LIGA-H2H`.
 * Det er der intransitiviteten i `docs/mlb.md` §2 ville vise seg, og et tall
 * som motsier porten er noe vi vil SE, ikke noe vi vil slippe å se.
 *
 * ===================== ARGMAKS, IKKE SAMPLING ==========================
 *
 * AVGJØRELSE 4: samplet handling i TRENING, argmaks i MÅLING. `temperatur = 0`
 * i alle seter her. Uten det kan to armer ikke parres.
 */

import { fork } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { AMERIKANER_KODE, SOLO_KODE } from "../src/mlb/handling.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { Sandkassenett } from "../src/mlb/nett.ts";
import { spillKamp, type NettLik, type Sete } from "../src/mlb/selvspill.ts";
import {
  beskrivDom,
  epokeDeltaker,
  lagVane,
  Liga,
  portDom,
  VANER_TEST,
  VANER_TRENING,
  type Parrad,
} from "../src/mlb/liga.ts";

// ---------------------------------------------------------------------------
// Argumenter
// ---------------------------------------------------------------------------

let kandidatSti: string | null = null;
let forrigeSti: string | null = null;
let kamperPerBånd = 300;
let bånd = [1_800_000_000, 1_850_000_000];
let ligaBånd = 1_900_000_000;
let ligaKamper = 200;
let kjerner = Math.max(1, cpus().length - 1);
let skardI = -1;
let skardN = 1;
let ut = "analyse/mlb-port";
/**
 * TROEN SOM INNGANG (§126). Samme standard og samme fil som i spillingen og i
 * gjenspillingen — porten dømmer vektene, og den må dømme dem på den vektoren
 * de faktisk ble trent på.
 */
let trosti: string | null = "e1-modell/mlb-tro.bin";
let målPoeng = 30;
let maksRunder = 100;
let epoke = 0;

const tall = (v: string | undefined, navn: string): number => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${navn} trenger et tall, fikk «${String(v)}»`);
  return x;
};

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--kandidat") kandidatSti = v ?? null;
  else if (a === "--tro") trosti = v ?? null;
  else if (a === "--uten-tro") trosti = null;
  else if (a === "--forrige") forrigeSti = v ?? null;
  else if (a === "--kamper") kamperPerBånd = tall(v, "--kamper");
  else if (a === "--band") bånd = (v ?? "").split(",").map((x) => tall(x, "--band"));
  else if (a === "--ligaband") ligaBånd = tall(v, "--ligaband");
  else if (a === "--ligakamper") ligaKamper = tall(v, "--ligakamper");
  else if (a === "--kjerner") kjerner = tall(v, "--kjerner");
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--maalpoeng") målPoeng = tall(v, "--maalpoeng");
  else if (a === "--maksrunder") maksRunder = tall(v, "--maksrunder");
  else if (a === "--epoke") epoke = tall(v, "--epoke");
  else if (a === "--skard") {
    const d = (v ?? "0/1").split("/");
    skardI = tall(d[0], "--skard i");
    skardN = tall(d[1], "--skard n");
  }
}

if (kandidatSti === null || forrigeSti === null) {
  throw new Error("--kandidat og --forrige er påkrevd");
}

const parfil = (i: number): string => `${ut}-par-${i}.jsonl`;
const ligafil = (i: number): string => `${ut}-liga-${i}.jsonl`;
const rapportfil = `${ut}-rapport.txt`;

// ---------------------------------------------------------------------------
// Bordene
// ---------------------------------------------------------------------------

/**
 * DEN FASTE REFERANSEN: tre testvaner, valgt deterministisk av kampnummeret.
 * Ingen trekning, ingen liga — referansen skal være IDENTISK i hver epoke,
 * ellers måler kurven motstanden i stedet for boten.
 */
function referansebord(nett: NettLik, kampnr: number): Sete[] {
  const kandidatsete = kampnr % 4;
  const ut: Sete[] = [];
  let j = 0;
  for (let i = 0; i < 4; i++) {
    if (i === kandidatsete) {
      ut.push({ navn: "arm", nett, temperatur: 0, samle: true });
    } else {
      const vane = VANER_TEST[(kampnr + j++) % VANER_TEST.length]!;
      ut.push({
        navn: vane.navn,
        nett: null,
        temperatur: 0,
        egen: lagVane(vane.spek),
        samle: false,
      });
    }
  }
  return ut;
}

/** LIGABORDET: tre motstandere trukket fra befolkningen der forrige er beste. */
function ligabord(nett: NettLik, forrige: NettLik, kampnr: number, frø: number): Sete[] {
  const rng = lagRng(frø ^ 0x2b7c_1d55);
  const liga = new Liga(VANER_TRENING);
  liga.settFørste(epokeDeltaker("forrige", forrige, "beste"));
  return liga.bord(epokeDeltaker("arm", nett, "beste"), kampnr % 4, 0, rng);
}

interface Utfall {
  readonly poeng: number;
  readonly seier: number;
  readonly avbrutt: number;
  /**
   * ANTALL `amerikaner`/`solo` BLANT BUDVALGENE.
   *
   * §122 fant at et løp til 30 ikke tar slutt med en tilfeldig policy, fordi
   * de to grove budene ligger i masken og koster `målPoeng/2` og `målPoeng`
   * når de ryker. De dominerer poengskalaen — første måling av verdietiketten
   * ga snitt −115 poeng med spredning 107. Da er «hvor ofte tar den dem» den
   * ene størrelsen som forklarer mest av bevegelsen i kurven, og uten den
   * ville «boten spiller bedre» og «boten har sluttet å skyte seg selv i
   * foten» vært umulige å skille.
   */
  readonly grovbud: number;
  readonly budvalg: number;
}

const tronett = trosti === null ? null : MlbTronett.fraBytes(readFileSync(trosti));

function spill(seter: Sete[], frø: number, kandidatsete: number, tell: boolean): Utfall {
  const e = spillKamp({ frø, seter, målPoeng, maksRunder, tronett, samleTrekk: false });
  let grov = 0;
  let bud = 0;
  if (tell) {
    for (const r of e.rader) {
      if (r.sete !== kandidatsete || r.delsteg !== "BUD") continue;
      bud++;
      if (r.kode === AMERIKANER_KODE || r.kode === SOLO_KODE) grov++;
    }
  }
  return {
    poeng: e.fasit.sluttpoeng[kandidatsete] ?? 0,
    seier: e.fasit.vinner === kandidatsete ? 1 : 0,
    avbrutt: e.fasit.avbrutt ? 1 : 0,
    grovbud: grov,
    budvalg: bud,
  };
}

// ---------------------------------------------------------------------------
// Ett skard
// ---------------------------------------------------------------------------

function kjørSkard(i: number, n: number): void {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(parfil(i), "");
  writeFileSync(ligafil(i), "");

  const kandidat = Sandkassenett.fraFil(kandidatSti!);
  const forrige = Sandkassenett.fraFil(forrigeSti!);
  /**
   * KONTROLLARMEN ER EN EGEN LESNING AV SAMME FIL.
   *
   * Ikke `forrige` om igjen: da hadde kontrollen vært den samme referansen
   * sammenliknet med seg selv, og den ville passert selv om lasteren var
   * ødelagt. En egen lesning gjennom nøyaktig samme rør prøver hele kjeden
   * fil → vekter → framover → valg, og den skal gi bit-likt utfall — altså
   * differanse 0 på HVER giv, ikke bare i snitt.
   */
  const kontroll = Sandkassenett.fraFil(forrigeSti!);

  for (let b = 0; b < bånd.length; b++) {
    const base = bånd[b]!;
    for (let k = 0; k < kamperPerBånd; k++) {
      if ((b * kamperPerBånd + k) % n !== i) continue;
      const frø = base + k * 7717;
      const sete = k % 4;
      // Kampnummeret må være ULIKT i de to båndene, ellers spiller de mot
      // nøyaktig samme tre vaner i samme rekkefølge og båndene er ikke
      // uavhengige i annet enn kortene.
      const nr = b * kamperPerBånd + k;
      const a = spill(referansebord(kandidat, nr), frø, sete, true);
      const c = spill(referansebord(forrige, nr), frø, sete, true);
      const d = spill(referansebord(kontroll, nr), frø, sete, false);
      appendFileSync(
        parfil(i),
        JSON.stringify({
          bånd: b,
          giv: frø,
          kandidat: a.poeng,
          forrige: c.poeng,
          kontroll: d.poeng,
          kSeier: a.seier,
          fSeier: c.seier,
          kAvbrutt: a.avbrutt,
          kGrov: a.grovbud,
          kBud: a.budvalg,
          fGrov: c.grovbud,
          fBud: c.budvalg,
        }) + "\n",
      );
    }
  }

  for (let k = 0; k < ligaKamper; k++) {
    if (k % n !== i) continue;
    const frø = ligaBånd + k * 7717;
    const sete = k % 4;
    const a = spill(ligabord(kandidat, forrige, k, frø), frø, sete, false);
    const c = spill(ligabord(forrige, forrige, k, frø), frø, sete, false);
    appendFileSync(
      ligafil(i),
      JSON.stringify({
        giv: frø,
        kandidat: a.poeng,
        forrige: c.poeng,
        kSeier: a.seier,
        fSeier: c.seier,
        kAvbrutt: a.avbrutt,
      }) + "\n",
    );
  }

  if (process.send !== undefined) process.send({ skard: i });
}

// ---------------------------------------------------------------------------
// Hovedløpet
// ---------------------------------------------------------------------------

const les = (sti: string): Record<string, number>[] =>
  readFileSync(sti, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, number>);

const snitt = (x: readonly number[]): number =>
  x.length === 0 ? 0 : x.reduce((a, b) => a + b, 0) / x.length;

const se = (x: readonly number[]): number => {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1) / x.length);
};

if (skardI >= 0) {
  kjørSkard(skardI, skardN);
} else {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(
    rapportfil,
    `mlb-port epoke ${epoke} startet ${new Date().toISOString()}\n` +
      `kandidat=${kandidatSti} forrige=${forrigeSti}\n` +
      `referanse=VANER_TEST kamper/band=${kamperPerBånd} band=[${bånd.join(",")}] ` +
      `liga-h2h=${ligaKamper}@${ligaBånd} maalpoeng=${målPoeng} maksrunder=${maksRunder}\n`,
  );
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: kjerner }, (_, i) => {
      return new Promise<void>((ferdig, feil) => {
        const barn = fork(process.argv[1]!, [
          ...process.argv.slice(2),
          "--skard",
          `${i}/${kjerner}`,
        ]);
        barn.on("exit", (kode) =>
          kode === 0 ? ferdig() : feil(new Error(`skard ${i} avsluttet med ${kode}`)),
        );
      });
    }),
  );

  // FØRST NÅ leses resultatfilene. §49: aldri les en resultatfil før kjøringen
  // er ferdig — et halvskrevet snitt har lurt dette prosjektet før.
  const par = Array.from({ length: kjerner }, (_, i) => les(parfil(i))).flat();
  const liga = Array.from({ length: kjerner }, (_, i) => les(ligafil(i))).flat();

  const dom = portDom(
    par.map((r) => ({ bånd: r.bånd!, giv: r.giv!, kandidat: r.kandidat!, forrige: r.forrige! })),
    par.map((r) => ({ bånd: r.bånd!, giv: r.giv!, kandidat: r.kontroll!, forrige: r.forrige! })),
  );

  const sum = (f: (r: Record<string, number>) => number): number => par.reduce((a, r) => a + f(r), 0);
  const styrke = {
    n: par.length,
    kandidatPoeng: snitt(par.map((r) => r.kandidat!)),
    kandidatSe: se(par.map((r) => r.kandidat!)),
    kandidatSeier: snitt(par.map((r) => r.kSeier!)),
    forrigePoeng: snitt(par.map((r) => r.forrige!)),
    forrigeSeier: snitt(par.map((r) => r.fSeier!)),
    avbrutt: snitt(par.map((r) => r.kAvbrutt!)),
    grovbudAndel: sum((r) => r.kGrov!) / Math.max(sum((r) => r.kBud!), 1),
    forrigeGrovbud: sum((r) => r.fGrov!) / Math.max(sum((r) => r.fBud!), 1),
    budPerKamp: snitt(par.map((r) => r.kBud!)),
  };
  const lD = liga.map((r) => r.kandidat! - r.forrige!);
  const ligaH2H = {
    n: liga.length,
    diff: snitt(lD),
    se: se(lD),
    z: snitt(lD) / (se(lD) || NaN),
    kandidatSeier: snitt(liga.map((r) => r.kSeier!)),
    forrigeSeier: snitt(liga.map((r) => r.fSeier!)),
    avbrutt: snitt(liga.map((r) => r.kAvbrutt!)),
  };

  const sek = (Date.now() - t0) / 1000;
  const linjer = [
    `FERDIG ${new Date().toISOString()}  veggtid=${sek.toFixed(1)} s  ` +
      `kamper=${par.length * 3 + liga.length * 2}`,
    `PORT (fast referanse, parret) ${beskrivDom(dom)}`,
    `STYRKE kandidat ${styrke.kandidatPoeng.toFixed(3)} ± ${styrke.kandidatSe.toFixed(3)} poeng, ` +
      `seier ${(styrke.kandidatSeier * 100).toFixed(1)} %  |  forrige ${styrke.forrigePoeng.toFixed(3)}, ` +
      `seier ${(styrke.forrigeSeier * 100).toFixed(1)} %  |  avbrutt ${(styrke.avbrutt * 100).toFixed(1)} %`,
    `GROVBUD (amerikaner+solo) andel av budvalg: kandidat ${(styrke.grovbudAndel * 100).toFixed(2)} % ` +
      `mot forrige ${(styrke.forrigeGrovbud * 100).toFixed(2)} % (${styrke.budPerKamp.toFixed(1)} budvalg/kamp)`,
    `LIGA-H2H (kandidat mot forrige paa ligabordet, n=${ligaH2H.n}): ` +
      `${ligaH2H.diff.toFixed(3)} ± ${ligaH2H.se.toFixed(3)} (z=${ligaH2H.z.toFixed(2)}), ` +
      `seier ${(ligaH2H.kandidatSeier * 100).toFixed(1)} % mot ${(ligaH2H.forrigeSeier * 100).toFixed(1)} %, ` +
      `avbrutt ${(ligaH2H.avbrutt * 100).toFixed(1)} %`,
    "",
  ];
  appendFileSync(rapportfil, linjer.join("\n"));
  appendFileSync(
    `${ut}-dom.jsonl`,
    JSON.stringify({ epoke, dom: dom.dom, ...dom, styrke, ligaH2H, sek }) + "\n",
  );
  process.stderr.write(linjer.join("\n"));
}
