/**
 * STILLINGSJAKT for EPIMC-prøven (18. sep). Leter etter en stilling med 3 stikk igjen og to
 * verdener der PIMC (med allvitende egne senere valg) velger et annet rotkort enn EPIMC d = 1,
 * og der EPIMC sitt kort har høyere SANN verdi på informasjonsmengden.
 *
 *   node examples/epimc-jakt.ts [--forsok 20000]
 *
 * Skriver den første (og enkleste) stillingen den finner. Prøven `test/epimc.test.ts` har den
 * hardkodet; dette skriptet er bare verktøyet som fant den.
 */
import { opprettSpill, utfør, lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import { FARGER, lagRng, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { kortTilInt, intTilKort } from "../src/solver/dds.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { lagStillingsmal, motstander, allvitende, egneStikk } from "../test/epimc-hjelp.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FORSØK = Number(arg("--forsok", "20000"));
const VERDENER = Number(arg("--verdener", "3"));
void opprettSpill;
void NevroAgent;
void FARGER;
void lovligeKort;

const mal = lagStillingsmal();
const sete = mal.iTur!;
const rng = lagRng(20_260_918);
const trumf = mal.trumf!;
const pool: number[] = [];
for (let c = 0; c < 52; c++) if (intTilKort(c).farge !== trumf) pool.push(c);

const kortS = (c: number): string => {
  const k = intTilKort(c);
  return `${k.farge}${k.verdi}`;
};
const bland = <T>(xs: T[]): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** Sann informasjonsmengde-verdi (d = 1 er eksakt med 3 stikk: siste valg er tvunget). */
function sann(s: GameState, verdener: number[][][], rot: Kort): number {
  const grupper = new Map<string, { w: number; node: GameState }[]>();
  let sum = 0;
  verdener.forEach((v, w) => {
    const hender = s.hender.map((h, p) => (p === sete ? h : v[p]!.map(intTilKort)));
    let x = utfør({ ...s, hender }, { type: "SPILL", spiller: sete, kort: rot }).state;
    let nøkkel = "";
    while (x.fase === "SPILL" && x.iTur !== sete) {
      const h = motstander.velgHandling(x) as Extract<Handling, { type: "SPILL" }>;
      nøkkel += `${h.spiller}.${kortTilInt(h.kort)},`;
      x = utfør(x, h).state;
    }
    if (x.fase !== "SPILL") {
      sum += egneStikk(x, s, sete);
      return;
    }
    const g = grupper.get(nøkkel) ?? [];
    g.push({ w, node: x });
    grupper.set(nøkkel, g);
  });
  for (const g of grupper.values()) {
    let best = -Infinity;
    for (const c of lovligeKort(g[0]!.node, sete)) {
      let t = 0;
      for (const m of g) t += egneStikk(ferdig(utfør(m.node, { type: "SPILL", spiller: sete, kort: c }).state), s, sete);
      best = Math.max(best, t);
    }
    sum += best;
  }
  return sum / verdener.length;
}
function ferdig(x: GameState): GameState {
  let y = x;
  while (y.fase === "SPILL") y = utfør(y, (y.iTur === sete ? allvitende(sete) : motstander).velgHandling(y)).state;
  return y;
}

/**
 * STRUKTURERT FAMILIE (`--struktur`): vår hånd H14 K13 R13, sete (s+2) og (s+3) har faste lave kort,
 * og bare setet rett etter oss varierer mellom verdenene (ess, knekter, lave hjerter). Verdenene kan ha
 * ulike kortmengder på hendene — resten ligger i vraket, som er usett for oss.
 */
const STRUKTUR = process.argv.includes("--struktur");
const c = (f: string, v: number): number => kortTilInt({ farge: f, verdi: v } as Kort);
const ikkeTrumf = ["H", "K", "R", "S"].filter((f) => f !== trumf);
const [F1, F2, F3] = ikkeTrumf as [string, string, string];
const etter = [1, 2, 3].map((d) => (sete + d) % 4);
const fastA = [c(F1, 2), c(F2, 3), c(F3, 3)];
const fastB = [c(F1, 3), c(F2, 4), c(F3, 4)];
const s3pool = [c(F2, 14), c(F3, 14), c(F2, 11), c(F3, 11), c(F2, 9), c(F3, 9), c(F1, 8), c(F1, 5), c(F1, 6), c(F1, 10)];
const minS = [c(F1, 14), c(F2, 13), c(F3, 13)];
function strukturVerden(): number[][] {
  const v: number[][] = [[], [], [], []];
  v[etter[0]!] = bland(s3pool).slice(0, 3);
  v[etter[1]!] = fastA.slice();
  v[etter[2]!] = fastB.slice();
  return v;
}
let funnet = 0;
const diag = { forsøk: 0, null: 0, felles: 0, noder: 0, endret: 0, ulikVerdi: 0, ulikKort: 0 };
for (let f = 0; f < FORSØK && funnet < 3; f++) {
  const tolv = bland(pool).slice(0, 12);
  const min = STRUKTUR ? minS : tolv.slice(0, 3);
  const ni = tolv.slice(3);
  const andre = [0, 1, 2, 3].filter((p) => p !== sete);
  const verden = (xs: number[]): number[][] => {
    const v: number[][] = [[], [], [], []];
    andre.forEach((p, i) => (v[p] = xs.slice(3 * i, 3 * i + 3)));
    return v;
  };
  const vX = STRUKTUR ? strukturVerden() : verden(ni);
  // Y = X med ETT kortbytte mellom to motstandere: da er observasjonen ofte lik.
  const bytt = (): number[][] => {
    const a = Math.floor(rng() * 9);
    let b = Math.floor(rng() * 9);
    while (Math.floor(b / 3) === Math.floor(a / 3)) b = Math.floor(rng() * 9);
    const byttet = ni.slice();
    [byttet[a], byttet[b]] = [byttet[b]!, byttet[a]!];
    return verden(byttet);
  };
  const vY = STRUKTUR ? strukturVerden() : bytt();
  const ekstra = Array.from({ length: VERDENER - 2 }, STRUKTUR ? strukturVerden : bytt);
  const s: GameState = { ...mal, hender: mal.hender.map((h, p) => (p === sete ? min.map(intTilKort) : vX[p]!.map(intTilKort))) };
  const verdener = [vX, vY, ...ekstra];
  const felles = { verdener: verdener.length, rng, mål: (x: GameState) => egneStikk(x, s, sete), ferdigeVerdener: verdener };
  const pimc = vurderPar(s, sete, allvitende(sete, motstander), felles);
  const epimc = vurderPar(s, sete, allvitende(sete, motstander), { ...felles, epimc: { dybde: 1 } });
  diag.forsøk++;
  if (pimc === null || epimc === null) { diag.null++; continue; }
  diag.felles += epimc.epimc!.felles; diag.noder += epimc.epimc!.noder; diag.endret += epimc.epimc!.endret;
  if (pimc.kandidater.some((k, i) => k.snitt !== epimc.kandidater[i]!.snitt)) diag.ulikVerdi++;
  const p0 = pimc.beste;
  const e0 = epimc.beste;
  if (p0.kort.farge === e0.kort.farge && p0.kort.verdi === e0.kort.verdi) continue;
  diag.ulikKort++;
  // Strengt: PIMC foretrekker sitt kort, EPIMC sitt, og sann verdi følger EPIMC.
  const pAndre = pimc.kandidater.filter((k) => k !== p0).every((k) => k.snitt < p0.snitt);
  const eAndre = epimc.kandidater.filter((k) => k !== e0).every((k) => k.snitt < e0.snitt);
  const sP = sann(s, verdener, p0.kort);
  const sE = sann(s, verdener, e0.kort);
  if (process.argv.includes("--alle")) console.log("KANDIDAT", JSON.stringify({ pAndre, eAndre, sP, sE, min: min.map(kortS), X: vX.map((h) => h.map(kortS)), Y: vY.map((h) => h.map(kortS)), pimc: pimc.kandidater.map((k) => `${k.kort.farge}${k.kort.verdi}=${k.snitt}`), epimc: epimc.kandidater.map((k) => `${k.kort.farge}${k.kort.verdi}=${k.snitt}`) }));
  if (!pAndre || !eAndre || !(sE > sP)) continue;
  funnet++;
  console.log(
    JSON.stringify({
      sete,
      trumf,
      min: min.map(kortS),
      X: vX.map((h) => h.map(kortS)),
      Y: vY.map((h) => h.map(kortS)),
      ekstra: ekstra.map((v) => v.map((h) => h.map(kortS))),
      pimc: pimc.kandidater.map((k) => `${k.kort.farge}${k.kort.verdi}=${k.snitt}`),
      epimc: epimc.kandidater.map((k) => `${k.kort.farge}${k.kort.verdi}=${k.snitt}`),
      sann: { [`${p0.kort.farge}${p0.kort.verdi}`]: sP, [`${e0.kort.farge}${e0.kort.verdi}`]: sE },
      info: epimc.epimc,
    }),
  );
}
console.log(`ferdig, ${funnet} funnet`, JSON.stringify(diag), JSON.stringify({ trumf, sete, stikk: mal.stikkSpilt, antall: mal.giving.antallStikk }));
