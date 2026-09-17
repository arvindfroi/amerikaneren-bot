/**
 * EPIMC (`~epimc=1`) — 18. sep, `D:\amb-grp\loop\epimc.md`.
 *
 * STILLINGEN (funnet av `examples/epimc-jakt.ts --struktur`, sjekket for hånd). Tre stikk igjen, vi
 * (sete s) spiller ut, trumf finnes ikke i spill. Farger: F1 = hjerter, F2 = kløver, F3 = ruter
 * (trumf er spar i malen). Vår hånd: HE (hjerter ess), KK (kløver konge), RK (ruter konge).
 * Setene etter oss: s+1 varierer, s+2 har H2 K3 R3, s+3 har H3 K4 R4. Fire verdener for s+1:
 *
 *     W1: H8 KE H5      W2: Rkn H6 RE      W3: KE Kkn H6      W4: H8 RE Rkn
 *
 * (E = ess, kn = knekt.) Motstanderne spiller HØYESTE kort i fargen, kaster LAVESTE, spiller ut
 * HØYESTE, og ser bare egen hånd. Vårt eget sete løses ALLVITENDE i utspillingen — nøyaktig den
 * perfekt-informasjons-oppløsningen PIMC gjør under roten (i `sik:` er det e-bladet).
 *
 * HE FØRST («gjetteren»): vi tar stikket, og s+1 følger med H8 (W1, W4) eller H6 (W2, W3). Så må vi
 * spille ut en konge. I hver observasjonsgruppe har s+1 kløveress i den ene verdenen og ruteress i
 * den andre: riktig konge gir 2 stikk (konge vinner, den andre taper mot esset), feil konge gir 1
 * (esset vinner, s+1 spiller ut hjerter, vi kaster). Den allvitende gjetter alltid riktig:
 *     PIMC(HE) = 2,0       sann verdi = (2 + 1) / 2 per gruppe = 1,5
 *
 * KK FØRST («informasjonsspillet»): hvem som har kløveresset, AVSLØRES i første stikk, og resten spilles
 * uten gjetting. Verdien er 2, 2, 1, 2 → 1,75 (i W3 spiller s+1 ut kløverknekt etter esset, og vi må
 * kaste) — sann og PIMC er like her, for ingen gjetting gjenstår.
 * RK først gir 1,5 (også uten fusjon).
 *
 * PIMC velger altså HE (2,0 mot 1,75) på grunn av strategifusjon; EPIMC regner HE til 1,5 og velger KK,
 * som er det sant beste kortet.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { GameState } from "../src/motor.ts";
import { lagRng, type Kort } from "../src/kort.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { vurderPar, type ParOpts } from "../src/moe2/sdpar.ts";
import { ADAMS, lagIndre } from "../src/moe2/agentspek.ts";
import type { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { allvitende, egneStikk, lagStillingsmal, motstander, sannVerdi } from "./epimc-hjelp.ts";

const mal = lagStillingsmal();
const sete = mal.iTur!;
assert.equal(mal.trumf, "S", "malen skal ha spar som trumf (fargene i stillingen er valgt etter det)");
const k = (f: Kort["farge"], v: number): Kort => ({ farge: f, verdi: v as Kort["verdi"] });
const i = (f: Kort["farge"], v: number): number => kortTilInt(k(f, v));
const [s1, s2, s3] = [1, 2, 3].map((d) => (sete + d) % 4) as [number, number, number];
const verden = (etter: number[]): number[][] => {
  const v: number[][] = [[], [], [], []];
  v[s1] = etter;
  v[s2] = [i("H", 2), i("K", 3), i("R", 3)];
  v[s3] = [i("H", 3), i("K", 4), i("R", 4)];
  return v;
};
const VERDENER = [
  verden([i("H", 8), i("K", 14), i("H", 5)]),
  verden([i("R", 11), i("H", 6), i("R", 14)]),
  verden([i("K", 14), i("K", 11), i("H", 6)]),
  verden([i("H", 8), i("R", 14), i("R", 11)]),
];
const MIN = [k("H", 14), k("K", 13), k("R", 13)];
const s: GameState = {
  ...mal,
  hender: mal.hender.map((_, p) => (p === sete ? MIN : VERDENER[0]![p]!.map((c) => ({ farge: "S", verdi: 2 }) as Kort))),
};
// De andres hender i `s` brukes ikke (verdenene erstatter dem), men må ha riktig lengde.
const opts = (ekstra: Partial<ParOpts> = {}): ParOpts => ({
  verdener: VERDENER.length,
  rng: lagRng(1),
  mål: (x: GameState) => egneStikk(x, s, sete),
  ferdigeVerdener: VERDENER,
  ...ekstra,
});
const snitt = (par: ReturnType<typeof vurderPar>, kort: Kort): number =>
  par!.kandidater.find((x) => x.kort.farge === kort.farge && x.kort.verdi === kort.verdi)!.snitt;
const navn = (kort: Kort): string => `${kort.farge}${kort.verdi}`;

test("SANN VERDI (uavhengig regnet): KK er best, HE er gjetteren", () => {
  assert.equal(sannVerdi(s, sete, VERDENER, MIN[0]!), 1.5);
  assert.equal(sannVerdi(s, sete, VERDENER, MIN[1]!), 1.75);
  assert.equal(sannVerdi(s, sete, VERDENER, MIN[2]!), 1.5);
});

test("PIMC FEILER: strategifusjonen gjør HE til 2,0 og velger den", () => {
  const par = vurderPar(s, sete, allvitende(sete, motstander), opts());
  assert.equal(snitt(par, MIN[0]!), 2);
  assert.equal(snitt(par, MIN[1]!), 1.75);
  assert.equal(navn(par!.beste.kort), "H14");
  const kk = par!.kandidater.find((x) => navn(x.kort) === "K13")!;
  assert.deepEqual(kk.perVerden, [2, 2, 1, 2], "KK per verden (kommentaren øverst)");
  assert.equal(par!.epimc, undefined, "uten feltet finnes ingen EPIMC-tellere");
});

test("EPIMC d=1 VELGER RIKTIG: HE faller til sann verdi 1,5, KK velges", () => {
  const par = vurderPar(s, sete, allvitende(sete, motstander), opts({ epimc: { dybde: 1 } }));
  for (const kort of MIN) assert.equal(snitt(par, kort), sannVerdi(s, sete, VERDENER, kort), navn(kort));
  assert.equal(navn(par!.beste.kort), "K13");
  // HE: to grupper à to verdener, felles kort i begge, og i én verden per gruppe er det et annet enn gjetterens.
  assert.ok(par!.epimc!.felles >= 2 && par!.epimc!.endret >= 2, JSON.stringify(par!.epimc));
});

test("SMÅ GRUPPER: m3 lar gruppene på to stå som PIMC; x (utelat-én) velger også KK", () => {
  const m3 = vurderPar(s, sete, allvitende(sete, motstander), opts({ epimc: { dybde: 1, minGruppe: 3 } }));
  assert.equal(snitt(m3, MIN[0]!), 2);
  assert.equal(navn(m3!.beste.kort), "H14");
  const x = vurderPar(s, sete, allvitende(sete, motstander), opts({ epimc: { dybde: 1, kryss: true } }));
  // Utelat-én: verdenens kort velges av den ANDRE verdenen i gruppen, som har esset i motsatt farge.
  assert.equal(snitt(x, MIN[0]!), 1);
  assert.equal(navn(x!.beste.kort), "K13");
});

test("SYNSBASERT POLITIKK: ingen fusjon å fjerne, og EPIMC gir aldri lavere verdi enn politikken", () => {
  // Egen utspilling med samme synsbaserte regel som motstanderne: da er politikkens kort likt i hele
  // gruppen, og felles maks over kandidatene kan bare løfte verdien.
  const pimc = vurderPar(s, sete, motstander, opts());
  const e = vurderPar(s, sete, motstander, opts({ epimc: { dybde: 1 } }));
  for (const kort of MIN) assert.ok(snitt(e, kort) >= snitt(pimc, kort) - 1e-12, navn(kort));
});

const bygg = (vFelt: string): Sikkerorakel => lagIndre(`sik:alle:0:${vFelt}:${ADAMS}`) as unknown as Sikkerorakel;

test("SPEKEN: av er av, feltet leses, ugyldige verdier kaster", () => {
  assert.equal(bygg("4k4").epimc, null);
  assert.equal(bygg("4k4~ekv=1~topp=0.1~flat=8").epimc, null);
  assert.deepEqual(bygg("4k4~epimc=1").epimc, { dybde: 1 });
  assert.deepEqual(bygg("4k4~epimc=1,m3,x").epimc, { dybde: 1, minGruppe: 3, kryss: true });
  const med = bygg("48k32e3LD~ekv=1~topp=0.1~flat=8~epimc=1");
  assert.equal(med.epimc!.toppP, 0.1, "beskjæringen arves fra ~topp=");
  assert.equal(med.epimc!.ekvivalens, true);
  assert.equal(typeof med.epimc!.prior, "function");
  assert.equal(bygg("4k4~epimc=1,p0.2").epimc!.toppP, 0.2);
  assert.equal(med.eksaktBlad, 3);
  for (const d of ["~epimc=", "~epimc=0", "~epimc=2", "~epimc=1,m0", "~epimc=1,y", "~epimc=1,p1"]) {
    assert.throws(() => bygg(`4k4${d}`), /epimc/, `«${d}» skulle kastet`);
  }
});
