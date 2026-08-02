/**
 * MAKKERENS UTSPILL I STIKK 2, etter at han tok stikk 1.
 *
 *   node examples/makkerutspill.ts --kamper 400 --skard 0/6
 *
 * ARVINDS SPØRSMÅL: hva gjør makkeren når han har vunnet første stikk og
 * sitter med utspillet? Hva funker best?
 *
 * HVORFOR AKKURAT DENNE STILLINGEN. Den er nesten obligatorisk i Amerikaneren:
 * budvinneren spiller ut lav trumf og etterlyser det høyeste trumfkortet han
 * ikke har, makkeren legger det og tar stikket. Så sitter makkeren – som nå er
 * avslørt for alle – med utspillet, og det er hans FØRSTE frie valg i runden.
 * Den forekommer i nesten hver kontrakt, den er strukturelt gjenkjennelig, og
 * ingen har målt den.
 *
 * MÅLT MOT SD, IKKE DD. Dette er ikke en detalj. Første graverunde i natt
 * brukte dobbelt dummy og fant at spilleføreren «trumfer for mye»; regelen
 * som fulgte målte −0,171. Årsaken var fasiten: DD ble AVVIST av
 * godkjenningsporten (−0,609), SD GODKJENT (+0,718). Å lete etter regler i
 * DD-anger er å lete etter steder vi avviker fra en policy vi allerede vet er
 * dårligere enn vår egen.
 *
 * Her evalueres derfor hvert lovlige utspill med `vurderKortSD`, som spiller
 * runden ferdig i K samplede verdener. Verdien er poengdifferansen – egne
 * poeng minus snittet av de tre andre – altså også «straffer vi motparten»,
 * ikke bare «får vi selv».
 *
 * SPØRSMÅLENE, i den rekkefølgen de betyr noe:
 *   1. Hva SPILLER boten vår her, og hva er angeren?
 *   2. Hva slags kort er BEST – trumf eller sidefarge, høyt eller lavt?
 *   3. Hvilken FAST REGEL ville gjort det best? Det er den som kan bli en vakt.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { vurderKortSD } from "../src/moe2/sdkort.ts";

let kamper = 400;
let kontrakt = 9;
let verdener = 12;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/sd-r2.bin";
let ut = "analyse/makkerutspill-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Linje {
  frø: number;
  /** Hva boten vår spilte, og hva SD mente om det. */
  vårFarge: string;
  vårVerdi: number;
  vårTrumf: boolean;
  vårVerdi_sd: number;
  besteVerdi_sd: number;
  anger: number;
  /** Kjennetegn ved det BESTE kortet. */
  besteTrumf: boolean;
  besteHøyest: boolean;
  besteLavest: boolean;
  besteVerdi: number;
  besteFarge: string;
  /** Hva de faste reglene ville valgt, og hva de er verdt. */
  regler: Record<string, number>;
  reglerB: Record<string, number>;
  /** Kortet A mente var best, verdsatt paa B. Det aerlige taket. */
  besteAB: number;
  vårB: number;
  besteB_sd: number;
  antallLovlige: number;
  egneTrumfIgjen: number;
}

// --- Rapportmodus -----------------------------------------------------------
if (rapport !== null) {
  const rader: Linje[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() !== "") rader.push(JSON.parse(l) as Linje);
    }
  }
  const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);
  const se = (v: readonly number[]): number => {
    if (v.length < 2) return NaN;
    const m = snitt(v);
    let s = 0;
    for (const x of v) s += (x - m) * (x - m);
    return Math.sqrt(s / (v.length - 1) / v.length);
  };
  const pst = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(0)} %`;

  const regelNavn = Object.keys(rader[0]?.regler ?? {});
  const linjer: string[] = [
    `\n=== Makkerens utspill i stikk 2, etter aa ha tatt stikk 1 ===`,
    `${rader.length} stillinger. Kandidat: ${kandidatSpek}. SD med ${verdener} verdener.`,
    `Verdien er POENGDIFFERANSE: egne poeng minus snittet av de tre andre.`,
    ``,
    `HVA GJOER BOTEN VAAR`,
    `  spiller trumf ut              ${pst(rader.filter((r) => r.vårTrumf).length, rader.length)}`,
    `  anger mot beste lovlige kort  ${snitt(rader.map((r) => r.anger)).toFixed(3)} ± ${se(rader.map((r) => r.anger)).toFixed(3)}`,
    `  traff beste kort              ${pst(rader.filter((r) => r.anger <= 1e-9).length, rader.length)}`,
    ``,
    `HVA ER BEST (etter SD)`,
    `  beste kort er TRUMF           ${pst(rader.filter((r) => r.besteTrumf).length, rader.length)}`,
    `  beste kort er HOEYEST lovlig  ${pst(rader.filter((r) => r.besteHøyest).length, rader.length)}`,
    `  beste kort er LAVEST lovlig   ${pst(rader.filter((r) => r.besteLavest).length, rader.length)}`,
    ``,
    `FASTE REGLER, rangert etter oppnaadd SD-verdi`,
    `regel                          verdi     mot botens valg      traff beste`,
    `----------------------------------------------------------------------------`,
  ];
  const vårt = rader.map((r) => r.vårVerdi_sd);
  const rangert = regelNavn
    .map((navn) => {
      const v = rader.map((r) => r.regler[navn] ?? NaN).filter((x) => Number.isFinite(x));
      const d = rader.map((r) => (r.regler[navn] ?? NaN) - r.vårVerdi_sd).filter((x) => Number.isFinite(x));
      const traff = rader.filter((r) => Math.abs((r.regler[navn] ?? -1e9) - r.besteVerdi_sd) < 1e-9).length;
      return { navn, v: snitt(v), d: snitt(d), dse: se(d), traff: traff / rader.length };
    })
    .sort((a, b) => b.v - a.v);
  for (const r of rangert) {
    linjer.push(
      `${r.navn.padEnd(30)} ${r.v.toFixed(3).padStart(6)}   ` +
        `${(r.d >= 0 ? "+" : "") + r.d.toFixed(3)} ± ${r.dse.toFixed(3)}   ${(100 * r.traff).toFixed(0).padStart(8)} %`,
    );
  }
  linjer.push(
    `${"BOTEN VAAR".padEnd(30)} ${snitt(vårt).toFixed(3).padStart(6)}   ${"        –".padStart(15)}   ` +
      `${pst(rader.filter((r) => r.anger <= 1e-9).length, rader.length).padStart(10)}`,
    `${"beste lovlige (fasit)".padEnd(30)} ${snitt(rader.map((r) => r.besteVerdi_sd)).toFixed(3).padStart(6)}`,
    `----------------------------------------------------------------------------`,
    ``,
    `LESEVEILEDNING. «mot botens valg» er parret paa stilling. En regel maa`,
    `slaa boten HER for i det hele tatt aa vaere interessant – men selv da er`,
    `den ikke et funn foer den er maalt i SPILL paa et friskt froebaand. En`,
    `regel kan hente SD-verdi i stikk 2 og tape mer senere i runden.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

const rng = lagRng((0x9a + skardI * 7919) >>> 0);

/** De faste reglene som stilles opp mot hverandre. Alle er lovlige. */
function reglerFor(lovlige: readonly Kort[], trumf: Farge): Record<string, Kort> {
  const sortert = [...lovlige].sort((a, b) => a.verdi - b.verdi);
  const trumfer = sortert.filter((k) => k.farge === trumf);
  const side = sortert.filter((k) => k.farge !== trumf);
  const ut: Record<string, Kort> = {
    "hoeyeste trumf": trumfer[trumfer.length - 1] ?? sortert[sortert.length - 1]!,
    "laveste trumf": trumfer[0] ?? sortert[0]!,
    "hoeyeste sidekort": side[side.length - 1] ?? sortert[sortert.length - 1]!,
    "laveste sidekort": side[0] ?? sortert[0]!,
    "hoeyeste kort uansett": sortert[sortert.length - 1]!,
    "laveste kort uansett": sortert[0]!,
  };
  // «Lengste sidefarge, hoeyeste kort» – den klassiske etableringslinjen.
  const tell = new Map<string, Kort[]>();
  for (const k of side) tell.set(k.farge, [...(tell.get(k.farge) ?? []), k]);
  let lengst: Kort[] | null = null;
  for (const v of tell.values()) if (lengst === null || v.length > lengst.length) lengst = v;
  ut["lengste sidefarge, hoeyest"] = lengst === null ? ut["hoeyeste kort uansett"]! : lengst[lengst.length - 1]!;
  return ut;
}

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 6_600_000 + f;
  const budsete = frø % 4;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) continue;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) continue;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    continue;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;

  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) {
    s = utfør(s, seter[s.budvinner!]!.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") continue;

  // Spill stikk 1 ferdig.
  g = 0;
  while (s.fase === "SPILL" && s.stikkSpilt === 0 && g++ < 12) {
    s = utfør(s, seter[s.iTur!]!.velgHandling(s)).state;
  }
  // Betingelsen: makkeren finnes, tok stikk 1, og har utspillet i stikk 2.
  if (s.fase !== "SPILL" || s.stikkSpilt !== 1 || s.makker === null) continue;
  if (s.iTur !== s.makker || s.bord.length !== 0) continue;
  const makker = s.makker;
  const trumf = s.trumf!;
  const lovlige = lovligeKort(s, makker);
  if (lovlige.length < 2) continue;

  /**
   * TO UAVHENGIGE SD-EVALUERINGER av NOEYAKTIG samme stilling.
   *
   * I natt rapporterte jeg et budtak paa +1,18 som viste seg aa vaere ren
   * vinnerens forbannelse: «beste handling» ble valgt med etterpaaklokskap paa
   * de samme trekningene den ble lest av paa. Argmax over stoeyete anslag
   * plukker den heldigste MAALINGEN like mye som det beste KORTET.
   *
   * Den feilen skal ikke gjentas her. `vurdertA` og `vurdertB` bruker
   * uavhengige verdenstrekninger, saa valg tatt paa A kan leses av paa B uten
   * at stoeyen er felles. Er det ingen ekte forskjell mellom kortene, faller
   * anger maalt slik sammen til null.
   */
  const vurdert = vurderKortSD(s, makker, nevro, { verdener, rng });
  const vurdertB = vurderKortSD(s, makker, nevro, { verdener, rng });
  if (vurdert.length === 0 || vurdertB.length === 0) continue;
  const verdiB = (k: Kort): number =>
    vurdertB.find((v) => v.kort.farge === k.farge && v.kort.verdi === k.verdi)?.verdi ?? NaN;
  const verdiAv = (k: Kort): number =>
    vurdert.find((v) => v.kort.farge === k.farge && v.kort.verdi === k.verdi)?.verdi ?? NaN;

  const valgt = seter[makker]!.velgHandling(s);
  if (valgt.type !== "SPILL") continue;
  const vårVerdi = verdiAv(valgt.kort);
  let beste = vurdert[0]!;
  for (const v of vurdert) if (v.verdi > beste.verdi) beste = v;
  if (!Number.isFinite(vårVerdi)) continue;

  const sortert = [...lovlige].sort((a, b) => a.verdi - b.verdi);
  const regler: Record<string, number> = {};
  const reglerB: Record<string, number> = {};
  for (const [navn, kort] of Object.entries(reglerFor(lovlige, trumf))) {
    const v = verdiAv(kort);
    if (Number.isFinite(v)) regler[navn] = Math.round(v * 1000) / 1000;
    const vb = verdiB(kort);
    if (Number.isFinite(vb)) reglerB[navn] = Math.round(vb * 1000) / 1000;
  }
  // Kortet A mente var best, lest av paa B. Dette er det AERLIGE taket.
  const besteAB = Math.round(verdiB(beste.kort) * 1000) / 1000;
  const vårB = Math.round(verdiB(valgt.kort) * 1000) / 1000;
  let besteB = vurdertB[0]!;
  for (const v of vurdertB) if (v.verdi > besteB.verdi) besteB = v;

  appendFileSync(
    ut,
    JSON.stringify({
      frø,
      vårFarge: valgt.kort.farge,
      vårVerdi: valgt.kort.verdi,
      vårTrumf: valgt.kort.farge === trumf,
      vårVerdi_sd: Math.round(vårVerdi * 1000) / 1000,
      besteVerdi_sd: Math.round(beste.verdi * 1000) / 1000,
      anger: Math.round((beste.verdi - vårVerdi) * 1000) / 1000,
      besteTrumf: beste.kort.farge === trumf,
      besteHøyest: beste.kort.verdi === sortert[sortert.length - 1]!.verdi,
      besteLavest: beste.kort.verdi === sortert[0]!.verdi,
      besteVerdi: beste.kort.verdi,
      besteFarge: beste.kort.farge,
      regler,
      reglerB,
      besteAB,
      vårB,
      besteB_sd: Math.round(besteB.verdi * 1000) / 1000,
      antallLovlige: lovlige.length,
      egneTrumfIgjen: (s.hender[makker] ?? []).filter((k) => k.farge === trumf).length,
    } satisfies Linje) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} stillinger   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} stillinger → ${ut}`);
