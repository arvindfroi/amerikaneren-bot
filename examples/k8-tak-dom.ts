/**
 * DOMMEN OVER K8-TAKET (12. sep) — rene funksjoner over radene fra `examples/k8-tak.ts`.
 *
 * Tre andeler, alle som snitt over radene (ratioestimatoren, som `domK8`), med SE fra
 * klyngebootstrap over kamper (`frø`):
 *
 *   perfekt / andelPerfekt       (ln 3 − nett) / ln 3              — dagens K8-tall, tak = klarsyn
 *   takAndel                     (ln 3 − tak) / ln 3               — hvor langt det RETTFERDIGE taket selv når
 *   rettferdig / andelRettferdig (ln 3 − nett) / (ln 3 − tak)      — nettet som andel av veien gulv → nåbart tak
 *
 * `domPerStikk` er dommen som brukes: taket er den EKSAKTE tellingen (`eksakt`-kolonnen), bare der
 * den er regnet (størrelse ≤ grensen). Stillinger over grensen telles i `n` og `nettAlle`, men er
 * ALDRI med i andelene — ellers ville nettets tidlige stillinger blitt målt mot et tak som mangler.
 * Dekningen (`dekket / n`) er derfor en del av dommen, ikke en fotnote.
 *
 * `domK8Tak` er SMC-dommen (`tak<N>`-kolonnene, eksperimentell): endelig N gir for HØYT tak-tap
 * (Jensen), så `andelRettferdig` er der en øvre grense.
 */

import { lagRng } from "../src/kort.ts";
import { klyngeSnitt, type Klyngesnitt } from "./klynge.ts";
import { LN3 } from "./k8-maal.ts";

export interface K8TakRad {
  readonly frø: number;
  readonly nett: number;
  readonly gulv: number;
  readonly [kolonne: string]: unknown;
}

const tallverdi = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : NaN);

/** Partikkeltallene som står i radene (`tak<N>`), stigende. */
export function partikkeltall(rader: readonly K8TakRad[]): number[] {
  const ut = new Set<number>();
  for (const r of rader) for (const k of Object.keys(r)) {
    const m = /^tak(\d+)$/.exec(k);
    if (m !== null) ut.add(Number(m[1]));
  }
  return [...ut].sort((a, b) => a - b);
}

export interface Andel {
  readonly snitt: number;
  readonly se: number;
}

/** Nett, tak og de tre andelene over radene der begge er endelige, SE klynget på `frø`. */
function klyngeAndeler(rader: readonly K8TakRad[], tak: (r: K8TakRad) => number, B: number) {
  const ok = rader.filter((r) => Number.isFinite(tak(r)) && Number.isFinite(r.nett));
  const kl = new Map<string, { n: number; nett: number; tak: number }>();
  for (const r of ok) {
    const k = String(r.frø);
    const c = kl.get(k) ?? { n: 0, nett: 0, tak: 0 };
    c.n++;
    c.nett += r.nett;
    c.tak += tak(r);
    kl.set(k, c);
  }
  const K = [...kl.values()];
  const tre = (ks: readonly { n: number; nett: number; tak: number }[]) => {
    const n = ks.reduce((a, c) => a + c.n, 0);
    const nett = ks.reduce((a, c) => a + c.nett, 0) / n;
    const t = ks.reduce((a, c) => a + c.tak, 0) / n;
    return { nett, tak: t, perfekt: (LN3 - nett) / LN3, takAndel: (LN3 - t) / LN3, rettferdig: (LN3 - nett) / (LN3 - t) };
  };
  const hel = K.length === 0 ? null : tre(K);
  const boot: { perfekt: number; takAndel: number; rettferdig: number }[] = [];
  if (K.length >= 2) {
    const rng = lagRng(20_260_912);
    for (let i = 0; i < B; i++) boot.push(tre(K.map(() => K[Math.floor(rng() * K.length)]!)));
  }
  const sd = (f: (x: (typeof boot)[number]) => number): number => {
    if (boot.length < 2) return NaN;
    const v = boot.map(f);
    const m = v.reduce((a, x) => a + x, 0) / v.length;
    return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
  };
  const andel = (f: (x: (typeof boot)[number]) => number): Andel => ({ snitt: hel === null ? NaN : f(hel), se: sd(f) });
  return {
    ok,
    klynger: K.length,
    nett: hel?.nett ?? NaN,
    tak: hel?.tak ?? NaN,
    perfekt: andel((x) => x.perfekt),
    takAndel: andel((x) => x.takAndel),
    rettferdig: andel((x) => x.rettferdig),
  };
}

const snittAv = (rader: readonly K8TakRad[], f: (r: K8TakRad) => number): number => {
  const v = rader.map(f).filter(Number.isFinite);
  return v.length === 0 ? NaN : v.reduce((a, x) => a + x, 0) / v.length;
};

export function domK8Tak(rader: readonly K8TakRad[], N: number, B = 2000) {
  const kol = `tak${N}`;
  const med = rader.filter((r) => kol in r);
  const a = klyngeAndeler(med, (r) => tallverdi(r[kol]), B);
  return {
    N,
    n: a.ok.length,
    klynger: a.klynger,
    kollaps: med.length - a.ok.length,
    sannBrudd: rader.filter((r) => r["sann_ok"] === 0).length,
    nett: a.nett,
    tak: a.tak,
    andelPerfekt: a.perfekt,
    takAndel: a.takAndel,
    andelRettferdig: a.rettferdig,
    eksakt: snittAv(a.ok, (r) => tallverdi(r[`${kol}_eksakt`])),
    gulvbandt: snittAv(a.ok, (r) => tallverdi(r[`${kol}_gulvbandt`])),
    ms: snittAv(a.ok, (r) => tallverdi(r[`${kol}_ms`])),
    treff: snittAv(a.ok, (r) => tallverdi(r[`${kol}_treff`])),
    nettTreff: snittAv(a.ok, (r) => tallverdi(r["nett_treff"])),
  };
}

export interface StikkDom {
  /** `null` = alle stikkene samlet. */
  readonly stikk: number | null;
  /** Stillinger i utvalget, og hvor mange av dem som har det eksakte taket. */
  readonly n: number;
  readonly dekket: number;
  readonly klynger: number;
  /** Nettets tap over ALLE stillingene (dekket eller ikke), til sammenlikning med K8-raden. */
  readonly nettAlle: number;
  /** Nett og eksakt tak over de dekkede stillingene. */
  readonly nett: number;
  readonly tak: number;
  readonly perfekt: Andel;
  readonly rettferdig: Andel;
  readonly takAndel: Andel;
  /** Den policy-blinde tellingen og taket på DE SAMME radene (budvinnerstillinger med `regel`). */
  readonly nRegel: number;
  readonly regel: number;
  readonly takRegel: number;
  readonly treffNett: number;
  readonly treffTak: number;
  readonly ms: number;
  readonly sannBrudd: number;
  readonly tomme: number;
}

/** Dommen per stikk (og samlet) mot det EKSAKTE taket, over radene `filter` slipper gjennom. */
export function domPerStikk(rader: readonly K8TakRad[], filter: (r: K8TakRad) => boolean = () => true, B = 2000): StikkDom[] {
  const valgt = rader.filter(filter);
  const stikkene = [...new Set(valgt.map((r) => tallverdi(r["stikk"])).filter(Number.isFinite))].sort((a, b) => a - b);
  const en = (stikk: number | null): StikkDom => {
    const G = stikk === null ? valgt : valgt.filter((r) => r["stikk"] === stikk);
    // Et tak der den sanne given er uforenlig er ikke taket for disse policyene: aldri dekket, alltid flagget.
    const a = klyngeAndeler(G, (r) => (r["sann_ok"] === 0 ? NaN : tallverdi(r["eksakt"])), B);
    const medRegel = a.ok.filter((r) => Number.isFinite(tallverdi(r["regel"])));
    return {
      stikk,
      n: G.length,
      dekket: a.ok.length,
      klynger: a.klynger,
      nettAlle: snittAv(G, (r) => r.nett),
      nett: a.nett,
      tak: a.tak,
      perfekt: a.perfekt,
      rettferdig: a.rettferdig,
      takAndel: a.takAndel,
      nRegel: medRegel.length,
      regel: snittAv(medRegel, (r) => tallverdi(r["regel"])),
      takRegel: snittAv(medRegel, (r) => tallverdi(r["eksakt"])),
      treffNett: snittAv(a.ok, (r) => tallverdi(r["nett_treff"])),
      treffTak: snittAv(a.ok, (r) => tallverdi(r["eksakt_treff"])),
      ms: snittAv(a.ok, (r) => tallverdi(r["eksakt_ms"])),
      sannBrudd: G.filter((r) => r["sann_ok"] === 0).length,
      tomme: G.filter((r) => r["eksakt_tom"] === 1).length,
    };
  };
  return [...stikkene.map(en), en(null)];
}

export function skrivDomEksakt(rader: readonly K8TakRad[]): string[] {
  const L: string[] = [];
  const pct = (a: Andel): string => (Number.isFinite(a.snitt) ? `${(100 * a.snitt).toFixed(1)}±${Number.isFinite(a.se) ? (100 * a.se).toFixed(1) : "–"}` : "–");
  const f4 = (x: number): string => (Number.isFinite(x) ? x.toFixed(4) : "–");
  const grupper: [string, (r: K8TakRad) => boolean][] = [
    ["alle seter", () => true],
    ["budvinneren", (r) => r["erBv"] === 1],
    ["de andre", (r) => r["erBv"] === 0],
  ];
  L.push(`EKSAKT RETTFERDIG TAK (gulv ln 3 = ${LN3.toFixed(4)}; andelene er over de dekkede stillingene, SE klynget på kamp)`);
  for (const [navn, filter] of grupper) {
    L.push(`  ${navn}:`);
    L.push("  stikk     n  dekket  nett(alle)   nett    tak   nett→klarsyn %  nett→rettferdig %  tak→klarsyn %  | blind n  blind   tak  | ms/st");
    for (const d of domPerStikk(rader, filter)) {
      L.push(
        `  ${(d.stikk === null ? "alle" : String(d.stikk)).padStart(5)} ${String(d.n).padStart(5)} ${String(d.dekket).padStart(7)}  ` +
          `${f4(d.nettAlle).padStart(10)} ${f4(d.nett).padStart(6)} ${f4(d.tak).padStart(6)}   ${pct(d.perfekt).padStart(12)}   ` +
          `${pct(d.rettferdig).padStart(16)}   ${pct(d.takAndel).padStart(12)}  | ${String(d.nRegel).padStart(7)} ${f4(d.regel).padStart(6)} ${f4(d.takRegel).padStart(6)} | ` +
          `${Number.isFinite(d.ms) ? d.ms.toFixed(0) : "–"}` +
          (d.sannBrudd + d.tomme > 0 ? `  ! sann giv uforenlig ${d.sannBrudd}, tomme ${d.tomme}` : ""),
      );
    }
  }
  return L;
}

/** tak_N − tak_M parvis på radene der begge finnes, klynget på kamp. */
export function konvergens(rader: readonly K8TakRad[], N: number, M: number): Klyngesnitt {
  return klyngeSnitt(rader, (r) => r.frø, (r) => tallverdi(r[`tak${N}`]) - tallverdi(r[`tak${M}`]));
}

export function skrivDom(rader: readonly K8TakRad[]): string[] {
  const L: string[] = [];
  const Ns = partikkeltall(rader);
  const pct = (a: Andel): string => `${(100 * a.snitt).toFixed(2)} ± ${(100 * a.se).toFixed(2)} %`;
  for (const N of Ns) {
    const d = domK8Tak(rader, N);
    L.push(
      `SMC (eksperimentell) N=${N}: n=${d.n} i ${d.klynger} kamper · gulv ${LN3.toFixed(4)} · nett ${d.nett.toFixed(4)} · tak ${d.tak.toFixed(4)} ` +
        `(eksakt ${(100 * d.eksakt).toFixed(1)} %, gulvbundet ${(100 * d.gulvbandt).toFixed(2)} % av kortene, ${d.ms.toFixed(0)} ms/stilling)`,
    );
    L.push(
      `      nett mot KLARSYN ${pct(d.andelPerfekt)} · taket mot klarsyn ${pct(d.takAndel)} · nett mot TAKET ${pct(d.andelRettferdig)} · ` +
        `treff@1 nett ${d.nettTreff.toFixed(3)} tak ${d.treff.toFixed(3)} · kollaps ${d.kollaps} · sann giv uforenlig ${d.sannBrudd}`,
    );
  }
  const Mx = Ns[Ns.length - 1];
  for (const N of Ns) {
    if (Mx === undefined || N === Mx) continue;
    const k = konvergens(rader, N, Mx);
    L.push(`konvergens tak${N} − tak${Mx}: ${k.snitt.toFixed(4)} ± ${k.se.toFixed(4)} (n=${k.n})`);
  }
  return L;
}
