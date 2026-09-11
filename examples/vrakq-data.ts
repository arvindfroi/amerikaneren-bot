/**
 * VRAKQ-DATA — vrak og trumf merket mot SEIERSMÅLET, med dagens appbot som policy (11. sep).
 *
 *   node examples/vrakq-data.ts --kamper 1200 --skard 0/12 --verdener 12 --ut D:/amb-grp/vrakq/d0/s0.jsonl
 *     [--spek <policy>] [--sjanse 0.25] [--froe 23000000] [--maksrunder 60]
 *     [--seier e1-modell/seier-g0.bin] [--blanding 0.3] [--kampstilling]
 *     [--etterlyst] [--etterlystpar 1]
 *
 * BudQ-oppskriften (examples/budq-data.ts) flyttet til vraket. Vrakrangereren som er ute i
 * dag (`vrakrang.bin`) ble merket 4. august med RUNDEPOENG, NevroHjernes kort og budmodellen
 * som utspillere, i enkeltrunder. Tre ting er annerledes her:
 *
 *   1. MÅLET er å vinne KAMPEN: 100·ΔP(seier) for budvinneren, lest av seiersprediktoren
 *      (fasiten 0/1 når runden avslutter kampen), blandet med λ·rundepoeng som i BudQ-s2 –
 *      rent seiersmål ga vågale valg der prediktoren ekstrapolerer.
 *   2. POLICYEN er appens kjede (BudQ, konvensjonsvakt, E1-kortnettet), og stillingene er de
 *      den havner i i kamper til 100 – ekspertiterasjon, ikke enkeltrunder.
 *   3. KANDIDATENE er NØYAKTIG settet `Vrakrangerer` velger mellom ved spilletid
 *      (`vrakkandidater` over fire trumffarger + NevroHjernes eget par), så et nett trent her
 *      rangerer det samme settet det skal brukes på.
 *
 * FORMATET er `verktoy/vrak-tren.py` sitt: én linje per stilling med alle kandidatene.
 * `v` er den blandede etiketten treneren leser; `vs` (seier) og `vp` (rundepoeng) står ved
 * siden av, så blandingen kan velges på nytt uten ny data. POLICYENS eget par merkes `nevro: 1`
 * – treneren kaller referansen «NevroHjernes anger», men her er det dagens vrakrangerer den
 * måles mot, og det er den et nytt nett må slå.
 *
 * INGEN FASIT I ETIKETTEN: verdenene trekkes fra budvinnerens visning (egen hånd + talong), og
 * alle kandidatene får de SAMME verdenene. Den virkelige given brukes bare til å spille kampen
 * videre. Utspillingene har egne agentinstanser – vrakrangereren husker trumfen mellom VRAK og
 * VELG, og det skal ikke lekke mellom kandidatene.
 *
 * ================ `--etterlyst`: KALLET SOM ET LÆRT VALG (K3.5/K3.8) ================
 *
 * Vrakgruppene tvinger kallet til «høyeste lovlige» – regelen. Med `--etterlyst` merkes også
 * KALLET: for policyens eget (trumf, vrak)-par, og med `--etterlystpar k` i tillegg de k−1
 * best merkede andre parene, spilles hvert kall i `etterlystKandidater` (de tre høyeste
 * lovlige + den laveste) ut på de SAMME verdenene med samme utspillere og samme etikett.
 *
 * Hver slik gruppe er EN EGEN LINJE i samme fil, med `"type":"etterlyst"`, trekkene fra
 * `etterlystTrekk` (`ETTERLYST_DIM` = 25) og kortet i `k`. Vrakgruppene er uendret og har
 * ingen `type`. Referansen (`nevro: 1`) er policyens faktiske kall på dens eget par, og
 * «høyeste lovlige» på de andre parene (der vet vi bare hva regelen ville kalt). Treneren tar
 * gruppene med `--type etterlyst --dim 25`.
 *
 * Uten `--etterlyst` er vrakgruppene byte for byte de samme: kallmerkingen trekker ingen tall
 * fra noen delt generator, og verdenene til vrakgruppene trekkes før kallene spilles ut.
 *
 * ================ OBSERVER PÅ HVER TILSTAND ================
 *
 * Løkka håndterer RUNDE_SLUTT selv, og fram til 11. sep ble `observer` aldri kalt her – samme
 * feil som `examples/kamp.ts` hadde (0 bokførte runder). Lag som leser hukommelse eller
 * bokfører runder inne i speken så da en kamp uten rundeslutter. Nå får ALLE agentinstansene
 * (kampens, utspillernes og policyreferansens) hver virkelige tilstand, også RUNDE_SLUTT og
 * sluttilstanden. Utspillingene i tenkte verdener videresendes IKKE: en hukommelse som
 * bokførte tenkte runder ville fått etiketter som avhenger av kandidatrekkefølgen.
 *
 * ================ POPULASJONEN (`--drivere`, `--rotasjon`, 11. sep) ================
 *
 * `--drivere "A|B|C|D"` gir hvert sete sin spek; `@` er kandidaten (`--spek`), og bare
 * vrakstillinger der BUDVINNEREN er et `@`-sete merkes. Policyreferansen er kandidaten, og
 * utspillingene bruker de samme spekene per sete som kampen. Se `examples/drivere.ts`. Uten
 * flagget er alt byte-identisk med før.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { FARGER, lagRng, type Farge, type Kort } from "../src/kort.ts";
import { lovligeEtterlys, opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lesVrakflagg } from "../src/moe2/vrakpolicy.ts";
import { vrakkandidater } from "../src/moe2/vrakrang.ts";
import { etterlystKandidater, etterlystTrekk, vraktrekk, vraktrekkK } from "../src/moe2/vraktrekk.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { bordTekst, lesBord, slot, tilSeter } from "./drivere.ts";

/** Det løkka trenger av en agent. `observer` er valgfri, som i `Spekagent`. */
export interface Kampagent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
  observer?(s: GameState): void;
}

/** Et (trumf, vrak)-par, og – når det kommer fra en agent – kallet agenten gjorde etter. */
export interface Par {
  trumf: Farge;
  vrak: Kort[];
  etterlyst?: Kort | null;
}

const nøkkel = (vrak: readonly Kort[], trumf: Farge): string =>
  `${trumf}|${vrak.map((k) => `${k.farge}${k.verdi}`).sort().join(",")}`;
const kortnøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;
const rund = (x: number, n = 1000): number => Math.round(x * n) / n;

/**
 * Spiller én kamp fra `start` med `kamp` i setene. ALLE `lyttere` får `observer` på hver
 * tilstand løkka ser – også RUNDE_SLUTT, som løkka ellers håndterer uten å spørre noen – og på
 * sluttilstanden. `vedVrak` kalles før budvinneren vraker, med samme tilstand.
 */
export function spillKamp(
  start: GameState,
  kamp: readonly Kampagent[],
  lyttere: readonly Kampagent[],
  maksRunder: number,
  vedVrak?: (s: GameState, sete: number) => void,
): GameState {
  let s = start;
  let sist: GameState | null = null;
  const observer = (x: GameState): void => {
    for (const a of lyttere) a.observer?.(x);
    sist = x;
  };
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < maksRunder && vakt++ < 40_000) {
    observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (sete === null || sete === undefined) break;
    if (s.fase === "VRAK") vedVrak?.(s, sete);
    s = utfør(s, kamp[sete]!.velgHandling(s)).state;
  }
  if (sist !== s) observer(s);
  return s;
}

function vinnersjanse(prediktor: Seiersprediktor, s: GameState, sete: number): number {
  if (s.fase === "FERDIG") return s.vinner === sete ? 1 : 0;
  return prediktor.fordeling(s.totalPoeng, sete, s.regler.målPoeng)[0]!;
}

/** Et agentpar (vrak, så trumfen og kallet det velger på hånden som blir igjen). */
function parFra(agent: Kampagent, s: GameState, sete: number): Par | null {
  const h = agent.velgHandling(s);
  if (h.type !== "VRAK") return null;
  const etter = utfør(s, h).state;
  const v = agent.velgHandling(etter);
  if (v.type !== "VELG") return null;
  return { trumf: v.trumf, vrak: h.kort.slice(), etterlyst: v.etterlyst };
}

/**
 * Tving paret (og kallet), spill runden ferdig med utspillerne, og les av begge målene for
 * budvinneren. `etterlyst` udefinert = regelen «høyeste lovlige», nøyaktig som vrakgruppene.
 */
export function spillUt(
  utspill: readonly Kampagent[],
  prediktor: Seiersprediktor,
  start: GameState,
  sete: number,
  p: Par,
  etterlyst?: Kort | null,
): { vs: number; vp: number } {
  let s = utfør(start, { type: "VRAK", spiller: sete, kort: p.vrak }).state;
  const kand = lovligeEtterlys(s, p.trumf);
  const kall = etterlyst !== undefined ? etterlyst : kand.length > 0 ? kand[kand.length - 1]! : null;
  s = utfør(s, { type: "VELG", spiller: sete, trumf: p.trumf, etterlyst: kall }).state;
  const runde = start.rundeNr;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && s.rundeNr === runde && vakt++ < 400) {
    const i = s.iTur;
    if (i === null) break;
    s = utfør(s, utspill[i]!.velgHandling(s)).state;
  }
  const d = s.sisteRunde?.delta ?? [0, 0, 0, 0];
  const egne = d[sete] ?? 0;
  const vp = egne - (d.reduce((a, x) => a + x, 0) - egne) / (d.length - 1);
  return { vs: 100 * (vinnersjanse(prediktor, s, sete) - vinnersjanse(prediktor, start, sete)), vp };
}

function kjør(): void {
  const arg = (n: string, s: string): string => {
    const i = process.argv.indexOf(n);
    return i < 0 ? s : (process.argv[i + 1] ?? s);
  };
  const KAMPER = tall(arg("--kamper", "1200"), 1200, "kamper");
  const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
  const K = tall(arg("--verdener", "12"), 12, "verdener");
  const SJANSE = Number(arg("--sjanse", "0.25"));
  const FRØ = tall(arg("--froe", "23000000"), 23_000_000, "froe");
  const MAKSRUNDER = tall(arg("--maksrunder", "60"), 60, "maksrunder");
  const SPEK = arg(
    "--spek",
    "vr:e1-modell/vrakrang.bin:telrd:budq:e1-modell/budq-s3.bin:vakt:abmp:e1:e1-modell/d7alle.bin",
  );
  const UT = arg("--ut", "D:/amb-grp/vrakq/d0/s0.jsonl");
  const prediktor = Seiersprediktor.fraFil(arg("--seier", "e1-modell/seier-g0.bin"));
  const BLANDING = Number(arg("--blanding", "0.3"));
  const FLAGG = arg("--flagg", "telrd");
  /** VrakQ v2: trekkene med kampstillingen bakerst (27 i stedet for 24). Treneren må få `--dim 27`. */
  const KAMPSTILLING = process.argv.includes("--kampstilling");
  /** K3.5/K3.8: merk også kallet. Treneren tar gruppene med `--type etterlyst --dim 25`. */
  const ETTERLYST = process.argv.includes("--etterlyst");
  const ETTERLYSTPAR = tall(arg("--etterlystpar", "1"), 1, "etterlystpar");
  mkdirSync(dirname(UT), { recursive: true });

  /** Én spek per sete; uten `--drivere` fire ganger `SPEK`, alle registrert (se `drivere.ts`). */
  const BORD = lesBord(process.argv, SPEK);
  // Per SLOT, i samme rekkefølge som før (slot = sete uten `--rotasjon`).
  const kamp = BORD.spek.map((x) => lagIndre(x));
  const utspill = BORD.spek.map((x) => lagIndre(x));
  /** Egen instans for å lese POLICYENS par (vrak + trumfen den velger etter), uten å røre kampen. */
  const policyRef = lagIndre(SPEK);
  const nevroRef = new NevroAgent();
  const pol = lesVrakflagg(FLAGG);
  const lyttere: Kampagent[] = [...kamp, ...utspill, policyRef];
  /** Utspillerne stokket til seter for kampen som spilles nå. Uten rotasjon: samme objekter, samme rekkefølge. */
  let utspillSeter: Kampagent[] = utspill;
  if (BORD.blandet) console.log(`Bord (kamp 0): ${bordTekst(BORD, 0)}${BORD.rotasjon ? "  [roterer per kamp]" : ""}`);

  const velg = lagRng(9_300_000 + SI);
  let skrevet = 0;
  let skrevetE = 0;
  const t0 = Date.now();

  /** Merker én VRAK-stilling: vrakgruppen som før, og med `--etterlyst` kallgruppene. */
  const merk = (s: GameState, sete: number, frø: number): void => {
    const hånd = (s.hender[sete] ?? []).slice();
    const antall = s.giving.talong;
    const par: Par[] = [];
    const sett = new Set<string>();
    const legg = (p: Par | null): void => {
      if (p === null || p.vrak.length !== antall) return;
      const n = nøkkel(p.vrak, p.trumf);
      if (!sett.has(n)) {
        sett.add(n);
        par.push(p);
      }
    };
    for (const trumf of FARGER) for (const vrak of vrakkandidater(hånd, trumf, antall, pol)) legg({ trumf, vrak });
    legg(parFra(nevroRef, s, sete));
    const policyPar = parFra(policyRef, s, sete);
    legg(policyPar);
    const policyNøkkel = policyPar === null ? "" : nøkkel(policyPar.vrak, policyPar.trumf);

    if (par.length < 2 && !(ETTERLYST && policyPar !== null)) return;
    const verdener = trekkVerdener(s, sete, K, lagRng((frø * 31 + skrevet * 104_729 + sete) >>> 0), undefined, undefined, 32, undefined, true);
    if (verdener.length < 4) return;

    let vrakverdier: number[] | null = null;
    if (par.length >= 2) {
      const kand = par.map((p) => {
        const u = verdener.map((hender) => spillUt(utspillSeter, prediktor, medVerden(s, hender, sete), sete, p));
        const vs = u.reduce((a, x) => a + x.vs, 0) / u.length;
        const vp = u.reduce((a, x) => a + x.vp, 0) / u.length;
        return {
          t: Array.from((KAMPSTILLING ? vraktrekkK : vraktrekk)(s, sete, hånd, p.vrak, p.trumf), (z) => rund(z, 10_000)),
          v: rund(vs + BLANDING * vp),
          vs: rund(vs),
          vp: rund(vp),
          ...(nøkkel(p.vrak, p.trumf) === policyNøkkel ? { nevro: 1 } : {}),
        };
      });
      appendFileSync(UT, JSON.stringify({ frø, runde: s.rundeNr, sete, n: verdener.length, blanding: BLANDING, kand }) + "\n");
      skrevet++;
      vrakverdier = kand.map((k) => k.v);
    }
    if (!ETTERLYST) return;

    // KALLGRUPPENE. Policyens eget par først; med `--etterlystpar k` også de k−1 best merkede
    // andre parene, så nettet ser kall på par et lært vraknett kan komme til å velge.
    const valgte: { p: Par; policy: boolean }[] = [];
    if (policyPar !== null) valgte.push({ p: policyPar, policy: true });
    if (ETTERLYSTPAR > 1 && vrakverdier !== null) {
      const vv = vrakverdier;
      const andre = par
        .map((p, i) => ({ p, v: vv[i]! }))
        .filter((x) => nøkkel(x.p.vrak, x.p.trumf) !== policyNøkkel)
        .sort((a, b) => b.v - a.v);
      for (const x of andre.slice(0, ETTERLYSTPAR - 1)) valgte.push({ p: x.p, policy: false });
    }
    for (const { p, policy } of valgte) {
      // VELG-tilstanden i den VIRKELIGE given: trekkene leser bare budvinnerens egen hånd,
      // vrak og poengtavla (K2), og det er nøyaktig tilstanden `Vrakrangerer` ser ved VELG.
      const etter = utfør(s, { type: "VRAK", spiller: sete, kort: p.vrak }).state;
      const kall = etterlystKandidater(etter, p.trumf);
      const referanse = policy && p.etterlyst !== undefined ? p.etterlyst : (kall[0] ?? null);
      if (referanse !== null && !kall.some((k) => kortnøkkel(k) === kortnøkkel(referanse))) kall.push(referanse);
      if (kall.length < 2) continue;
      const kand = kall.map((k) => {
        const u = verdener.map((hender) => spillUt(utspillSeter, prediktor, medVerden(s, hender, sete), sete, p, k));
        const vs = u.reduce((a, x) => a + x.vs, 0) / u.length;
        const vp = u.reduce((a, x) => a + x.vp, 0) / u.length;
        return {
          k: kortnøkkel(k),
          t: Array.from(etterlystTrekk(etter, sete, p.trumf, k), (z) => rund(z, 10_000)),
          v: rund(vs + BLANDING * vp),
          vs: rund(vs),
          vp: rund(vp),
          ...(referanse !== null && kortnøkkel(k) === kortnøkkel(referanse) ? { nevro: 1 } : {}),
        };
      });
      appendFileSync(
        UT,
        JSON.stringify({
          type: "etterlyst",
          frø,
          runde: s.rundeNr,
          sete,
          n: verdener.length,
          blanding: BLANDING,
          trumf: p.trumf,
          vrak: p.vrak.map(kortnøkkel).sort(),
          ...(policy ? { policypar: 1 } : {}),
          kand,
        }) + "\n",
      );
      skrevetE++;
    }
  };

  const etterlystTekst = (): string => (ETTERLYST ? `, ${skrevetE} etterlyststillinger` : "");
  for (let g = 0; g < KAMPER; g++) {
    if (g % SN !== SI) continue;
    const frø = FRØ + g * 7717;
    const s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
    for (const a of kamp) a.nyKamp();
    utspillSeter = tilSeter(BORD, utspill, g);
    spillKamp(s, tilSeter(BORD, kamp, g), lyttere, MAKSRUNDER, (x, sete) => {
      // Opptaket FØR trekningen: uten `--drivere` alltid sant, og rng-strømmen som før.
      if (BORD.opptak[slot(BORD, sete, g)] && velg() < SJANSE) merk(x, sete, frø);
    });
    process.stdout.write(`\r  skard ${SI}/${SN}: kamp ${g}, ${skrevet} vrakstillinger${etterlystTekst()}, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  }
  console.log(`\nSkard ${SI}/${SN} ferdig: ${skrevet} vrakstillinger${etterlystTekst()} → ${UT}`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
