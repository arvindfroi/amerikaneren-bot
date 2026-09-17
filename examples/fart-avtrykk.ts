/**
 * FINGERAVTRYKK OG PARRET TID I LÅSTRINN (17. sep).
 *
 *   node examples/fart-avtrykk.ts --a "<spek>" --b "<spek>" [--ka ref] [--kb auto] --runder 5 --froe 1250000000
 *
 * To partier med samme frø spilles SIDE OM SIDE: ved hver botbeslutning tar arm A sitt valg og
 * rett etter tar arm B sitt valg på den samme stillingen (rekkefølgen byttes annenhver gang, så
 * ingen arm systematisk får varm cache). Så lenge armene er bit-identiske, er stillingene de samme,
 * og tiden er PARRET per beslutning — det eneste som tåler en belastet maskin.
 *
 * Avtrykket er en FNV-hash over hver bothandling og hver `Parhendelse` (σ, n, beste kort og ALLE
 * verdiene per verden per kandidat). Skiller armene lag, stopper riggen og sier hvor.
 *
 * `--ka/--kb` velger `forover`-kjernen per arm (`ref` = den opprinnelige radkjernen).
 * Tre botseter med speken + ett sete `ADAMS_MAALT`, som `sokfokus-kostnad.ts`.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { settParlytter, type Parhendelse } from "../src/moe2/sikkerorakel.ts";
import { settForoverKjerne, type ForoverKjerne } from "../src/nevro/nett.ts";
import { settKortbokRask } from "../src/e1/kortbok.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const SPEK_A = arg("--a", HELBOT);
const SPEK_B = arg("--b", SPEK_A);
const K_A = arg("--ka", "ref") as ForoverKjerne;
const K_B = arg("--kb", "auto") as ForoverKjerne;
const RUNDER = Number(arg("--runder", "5"));
const FRØ = Number(arg("--froe", "1250000000"));
const UT = arg("--ut", "D:/amb-grp/loop/fart/avtrykk.jsonl");
const MERKE = arg("--merke", "avtrykk");
/**
 * SIDEVOGN: A spiller partiet, B tar sin beslutning på NØYAKTIG A sin stilling (og ser de samme
 * tilstandene gjennom `observer`), men B sitt valg kastes. For speker som ENDRER valg: tiden er
 * fortsatt parret per stilling, og andelen ulike kortvalg telles i stedet for avtrykket.
 */
const SIDEVOGN = process.argv.includes("--sidevogn");

class Hash {
  h = 0x811c9dc5;
  tall(x: number): void {
    const b = new Uint8Array(new Float64Array([x]).buffer);
    for (const v of b) {
      this.h ^= v;
      this.h = Math.imul(this.h, 0x01000193);
    }
  }
  tekst(s: string): void {
    for (let i = 0; i < s.length; i++) {
      this.h ^= s.charCodeAt(i);
      this.h = Math.imul(this.h, 0x01000193);
    }
  }
  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, "0");
  }
}

interface Arm {
  seter: ReturnType<typeof lagIndre>[];
  kjerne: ForoverKjerne;
  s: GameState;
  hash: Hash;
  ms: number[];
  vurdert: number;
}
const lagArm = (spek: string, kjerne: ForoverKjerne): Arm => {
  const seter = [lagIndre(spek), lagIndre(spek), lagIndre(spek), lagIndre(ADAMS_MAALT)];
  for (const a of seter) a.nyKamp();
  return { seter, kjerne, s: opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRØ), hash: new Hash(), ms: [], vurdert: 0 };
};
const A = lagArm(SPEK_A, K_A);
const B = lagArm(SPEK_B, K_B);

let aktiv: Arm = A;
settParlytter((h: Parhendelse) => {
  aktiv.vurdert++;
  const x = aktiv.hash;
  x.tall(h.par.sigma);
  x.tall(h.par.n);
  x.tekst(`${h.par.beste.kort.farge}${h.par.beste.kort.verdi}`);
  for (const k of h.par.kandidater) {
    x.tekst(`${k.kort.farge}${k.kort.verdi}`);
    for (const v of k.perVerden) x.tall(v);
  }
});

const handlingTekst = (h: Handling): string => JSON.stringify(h);

/** Ett steg for én arm; returnerer handlingen (og tiden hvis det var en botbeslutning i SPILL). */
function steg(arm: Arm): { h: Handling | null; ms: number | null; tekst: string } {
  const s = arm.s;
  for (const a of arm.seter) a.observer?.(s);
  if (s.fase === "RUNDE_SLUTT") return { h: { type: "NESTE" }, ms: null, tekst: "NESTE" };
  const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (sete === null || sete === undefined) return { h: null, ms: null, tekst: "stopp" };
  aktiv = arm;
  settForoverKjerne(arm.kjerne);
  // «ref» betyr hele den gamle stien: radkjernen OG grunntrekkene via `e1SpillTrekk`.
  settKortbokRask(arm.kjerne !== "ref");
  const t = performance.now();
  const h = arm.seter[sete]!.velgHandling(s);
  const ms = performance.now() - t;
  const tekst = handlingTekst(h);
  if (sete < 3) arm.hash.tekst(tekst);
  return { h, ms: sete < 3 && s.fase === "SPILL" ? ms : null, tekst };
}

let vakt = 0;
let nr = 0;
let avvik: string | null = null;
let ulikeKort = 0;
const par: { a: number; b: number; stikk: number }[] = [];
while (A.s.fase !== "FERDIG" && A.s.rundeNr < RUNDER && vakt++ < 40_000) {
  if (SIDEVOGN) B.s = A.s;
  const først = nr++ % 2 === 0 ? [A, B] : [B, A];
  const r1 = steg(først[0]!);
  const r2 = steg(først[1]!);
  const ra = først[0] === A ? r1 : r2;
  const rb = først[0] === A ? r2 : r1;
  if (ra.h === null || rb.h === null) break;
  const stikk = A.s.stikkSpilt + 1;
  if (ra.ms !== null && rb.ms !== null) {
    par.push({ a: ra.ms, b: rb.ms, stikk });
    if (ra.tekst !== rb.tekst) ulikeKort++;
  }
  if (!SIDEVOGN && (ra.tekst !== rb.tekst || A.hash.hex() !== B.hash.hex())) {
    avvik = `steg ${nr}, runde ${A.s.rundeNr}, stikk ${stikk}: A=${ra.tekst} B=${rb.tekst} hashA=${A.hash.hex()} hashB=${B.hash.hex()}`;
    break;
  }
  A.s = utfør(A.s, ra.h).state;
  B.s = SIDEVOGN ? A.s : utfør(B.s, rb.h).state;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const ta = sum(par.map((p) => p.a));
const tb = sum(par.map((p) => p.b));
// Kvotienten av summer, med SE fra deltametoden over beslutningene (rå forholdstall per beslutning
// er skjevt for de billige). Klynger ikke: dette er én kamp, og tallet er en tidsmåling.
const n = par.length;
const r = ta / tb;
const res = par.map((p) => p.a - r * p.b);
const se = Math.sqrt(sum(res.map((x) => x * x)) / Math.max(1, n - 1) / n) / (tb / n);
const rad = {
  merke: MERKE,
  a: SPEK_A,
  b: SPEK_B,
  ka: K_A,
  kb: K_B,
  runder: A.s.rundeNr,
  kortvalg: n,
  vurdertA: A.vurdert,
  vurdertB: B.vurdert,
  hashA: A.hash.hex(),
  hashB: B.hash.hex(),
  sidevogn: SIDEVOGN,
  ulikeKort,
  identisk: SIDEVOGN ? null : avvik === null,
  avvik,
  msPerKortvalgA: Number((ta / Math.max(1, n)).toFixed(1)),
  msPerKortvalgB: Number((tb / Math.max(1, n)).toFixed(1)),
  fartBmotA: Number(r.toFixed(3)),
  fartSE: Number(se.toFixed(3)),
};
mkdirSync(dirname(UT), { recursive: true });
appendFileSync(UT, JSON.stringify(rad) + "\n");
console.log(JSON.stringify(rad, null, 1));
