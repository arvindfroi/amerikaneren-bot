/**
 * FINGERAVTRYKK FOR A/B-DEMOEN (17. sep) — node-siden.
 *
 *   node examples/ab-avtrykk.ts --arm B --kilde spek   [--fart 0|1] [--frø 71000001,71000002] [--runder 2]
 *   node examples/ab-avtrykk.ts --arm B --kilde kjerne [...]
 *   node examples/ab-avtrykk.ts --arm A [--rot <arbeidskopi>] [...]
 *
 * ARM B, `spek`:   REFERANSEN. `lagIndre(<helbotspeken med diskstier>)` per sete, som K1-driveren.
 * ARM B, `kjerne`: workerens meldingshåndtering (`lagSøkekjerne` + `helbot-init`) i Node, med
 *                  diskstier. Samme avtrykk som `spek` beviser at `okt:`-utpakkingen, bokvakten og
 *                  protokollen ikke endrer ett valg. Nettleserbenken (`web/ab-benk.html`) kjører
 *                  den SAMME kjernen i en ekte worker og skal gi det samme avtrykket.
 * ARM A:           appens oppdeling (hovedtrådens kjede + førersøket i workeren) med konstantene
 *                  lest fra `<rot>/web/app.ts` og vektene fra `<rot>/web/dist`. Kjøres i denne
 *                  arbeidskopien og i en kopi av prod (67dc9d7): likt avtrykk = arm A er uendret.
 *                  Uten søkefrist (en frist gjør valget avhengig av maskinens fart).
 *
 * Skriver `--ut <fil>` (JSON: avtrykk, antall, tider, beslutningene) om den er gitt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { GameState, Handling } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { avtrykk, avtrykkstekst, spillAvtrykk, tidstabell, type Driverkrok } from "../web/ab-driver.ts";
import { helbotSpek, type HelbotSti } from "../web/helbotspek.ts";
import type { FraWorker, TilWorker } from "../web/sokekjerne.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const ARM = arg("--arm", "B");
const KILDE = arg("--kilde", "spek");
const FART = arg("--fart", "0") === "1";
const FRØ = arg("--frø", "71000001,71000002").split(",").map(Number);
const RUNDER = Number(arg("--runder", "2"));
const UT = arg("--ut", "");
const ROT = resolve(arg("--rot", join(import.meta.dirname, "..")));
/** RELATIV til arbeidsmappa: speken bruker «:» som skille, så «D:/…» går ikke. */
const MODELL = arg("--modell", "e1-modell");
const GEN = arg("--gen", "15");

const diskSti = (s: HelbotSti): string =>
  `${MODELL}/${s.slice(4, -4)}-${GEN}.bin`;

async function krokB(): Promise<Driverkrok> {
  const spek = helbotSpek(FART, diskSti);
  if (KILDE === "spek") {
    const seter = [0, 1, 2, 3].map(() => lagIndre(spek));
    return {
      klokke: () => performance.now(),
      nyKamp: () => seter.forEach((a) => a.nyKamp()),
      velg: async (s, sete) => ({ handling: seter[sete]!.velgHandling(s) }),
      slutt: (s) => seter.forEach((a) => (a as { observer?(x: GameState): void }).observer?.(s)),
    };
  }
  const { lagSøkekjerne } = await import("../web/sokekjerne.ts");
  let svar: FraWorker | null = null;
  const w = lagSøkekjerne((m) => {
    svar = m;
  });
  w({ type: "helbot-init", spek, filer: {}, seter: [0, 1, 2, 3], fristMs: null });
  const kv = svar as FraWorker | null;
  if (kv === null || !("klar" in kv) || kv.klar !== true) throw new Error(`helbot-init: ${JSON.stringify(kv)}`);
  console.error(`kvittering: ${JSON.stringify(kv)}`);
  let id = 0;
  return {
    klokke: () => performance.now(),
    nyKamp: () => w({ type: "nyKamp" }),
    velg: async (s, sete) => {
      svar = null;
      w({ type: "adams-trekk", id: ++id, state: structuredClone(s), sete });
      const r = svar as FraWorker | null;
      if (r === null || !("handling" in r)) throw new Error(`trekk: ${JSON.stringify(r)}`);
      return { handling: r.handling, info: { n: r.n, nb: r.nødbrems, bb: r.bokbrudd } };
    },
    slutt: (s) => w({ type: "rundeslutt", state: structuredClone(s) }),
  };
}

async function krokA(): Promise<Driverkrok> {
  const url = (f: string): string => pathToFileURL(join(ROT, f)).href;
  const kjede = (await import(url("web/adamskjede.ts"))) as typeof import("../web/adamskjede.ts");
  const kjerne = (await import(url("web/sokekjerne.ts"))) as { lagSøkekjerne(p: (m: FraWorker) => void): (m: TilWorker) => void };
  const APP = readFileSync(join(ROT, "web", "app.ts"), "utf8");
  const konst = (n: string): string => {
    const m = new RegExp(`^const ${n}(?:: [\\w]+)? = ([^;]+);`, "m").exec(APP);
    if (m === null) throw new Error(`fant ikke ${n}`);
    return m[1]!.trim();
  };
  const KONFIG = {
    vaktflagg: JSON.parse(konst("VAKTFLAGG")) as string,
    vrakflagg: JSON.parse(konst("VRAKFLAGG")) as string,
    budterskel: Number(konst("BUDTERSKEL")),
    verdener: Number(konst("SØKVERDENER")),
    sigma: Number(konst("SØKSIGMA")),
    budqPå: konst("BUDQ_PÅ") === "true",
  };
  const dist = (n: string): string => readFileSync(join(ROT, "web", "dist", n), "utf8");
  const vekter = {
    kort: dist(JSON.parse(konst("KORTVEKTER")) as string),
    vrak: dist(JSON.parse(konst("VRAKRANGERER")) as string),
    bud: JSON.parse(readFileSync(join(MODELL, JSON.parse(konst("BUDMODELL")) as string), "utf8")) as unknown,
    budq: KONFIG.budqPå ? dist(JSON.parse(konst("BUDQVEKTER")) as string) : null,
    tro: null,
  };
  console.error(`arm A fra ${ROT}: ${JSON.stringify(KONFIG)}`);
  const hoved = kjede.byggAdams(vekter, KONFIG, false);
  let svar: FraWorker | null = null;
  const w = kjerne.lagSøkekjerne((m) => {
    svar = m;
  });
  w({ type: "adams-init", ...vekter, ...KONFIG });
  const kv = svar as FraWorker | null;
  if (kv === null || !("klar" in kv) || kv.klar !== true) throw new Error(`adams-init: ${JSON.stringify(kv)}`);
  if (!hoved.budq && KONFIG.budqPå) throw new Error("BudQ ble ikke bygd på hovedtråden");
  let id = 0;
  return {
    klokke: () => performance.now(),
    nyKamp: () => {
      hoved.agent.nyKamp();
      w({ type: "nyKamp" });
    },
    velg: async (s, sete) => {
      if (kjede.børSøke(s, sete, KONFIG.verdener)) {
        svar = null;
        w({ type: "adams-trekk", id: ++id, state: structuredClone(s), sete });
        const r = svar as FraWorker | null;
        if (r === null || !("handling" in r)) throw new Error(`trekk: ${JSON.stringify(r)}`);
        return { handling: r.handling as Handling, info: { lag: "worker" } };
      }
      return { handling: hoved.agent.velgHandling(s), info: { lag: "hoved" } };
    },
    // Appen sender rundeslutt til workeren (protokoll 3); hovedtråden får den ikke.
    slutt: (s) => w({ type: "rundeslutt", state: structuredClone(s) }),
  };
}

const krok = ARM === "A" ? await krokA() : await krokB();
const t0 = performance.now();
const b = await spillAvtrykk(FRØ, RUNDER, krok);
const tekst = avtrykkstekst(b);
const res = {
  arm: ARM,
  kilde: ARM === "A" ? ROT : KILDE,
  fart: FART,
  frø: FRØ,
  runder: RUNDER,
  antall: b.length,
  avtrykk: avtrykk(tekst),
  sekunder: Math.round((performance.now() - t0) / 100) / 10,
  tider: tidstabell(b),
};
console.log(JSON.stringify(res));
if (UT !== "") writeFileSync(UT, JSON.stringify({ ...res, tekst, beslutninger: b }, null, 1));
