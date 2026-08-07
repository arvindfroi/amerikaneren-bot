/**
 * HVA BURDE MAN BY? Budet som beslutning under usikkerhet, ikke som estimat.
 *
 *   node examples/budflaks.ts --hender 150 --trekninger 30
 *
 * SPØRSMÅLET Arvind stilte: vi trenger et anslag for hva man burde by GITT
 * FLAKSEN – talongen man ikke har sett, makkerens kort man ikke vet hvor er,
 * og fordelingen rundt bordet.
 *
 * HVORFOR «forventet antall stikk» ER FEIL SVAR. Utbetalingen er sterkt
 * asymmetrisk: klarer du kontrakten får du +2n, bommer du −2n. Med bud 9 er
 * det 18 poeng som skifter fortegn på ett eneste stikk. Da er riktig bud ikke
 * forventningen, men det budet som maksimerer FORVENTET POENG over
 * fordelingen av mulige utfall. Det ligger systematisk under forventningen,
 * og hvor langt under avhenger av hvor bred fordelingen er.
 *
 * METODEN. Budgiverens 12 kort holdes FASTE – det er alt han vet når han byr.
 * De 40 andre kortene deles ut på nytt for hver trekning, så både talongen,
 * makkerens plassering og fordelingen varierer. Det ER flaksen. For hvert
 * kandidatbud spilles runden ut med boten som spillefører og NevroHjerne i de
 * andre setene, og poengene leses av motoren.
 *
 * At hvert bud simuleres for seg er ikke sløsing: spilleføringen avhenger av
 * kontrakten – en som har meldt 11 tar sjanser en som har meldt 8 ikke tar –
 * så stikkfordelingen er ikke den samme under ulike bud.
 *
 * REFERANSENE er de samme som ellers i prosjektet: SD-orakelets bud, det
 * NevroHjerne faktisk byr, og – der det finnes – hva menneskene bød på
 * tilsvarende hender (analyse/menneskedata-2026-08-01.md: de melder 8,95 der
 * SD sier 9,40, og tar 9,70).
 */

import { writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, nyStokk, stokk, kortId, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { analyserGiv, sdBud, tømCache } from "../src/neat/singledummy.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let antallHender = 150;
let trekninger = 30;
let kandidatSpek = "vakt:ab:e1:e1-modell/d7alle.bin";
let utFil = "analyse/budflaks.txt";
const BUD = [7, 8, 9, 10, 11];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--hender") antallHender = Number(process.argv[++i]);
  else if (a === "--trekninger") trekninger = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") utFil = process.argv[++i]!;
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
function lagKandidat(spec: string): () => Velger {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return () => new Konvensjonsvakt(indre(), vakt.valg);
  }
  if (spec === "nevro") return () => new NevroAgent();
  if (spec.startsWith("e1:")) {
    const nett = lesE1Nett(spec.slice(3));
    return () => new E1Agent(nett);
  }
  throw new Error(`Ukjent kandidat «${spec}»`);
}
const lagFører = lagKandidat(kandidatSpek);
const nevro = new NevroAgent();

/**
 * Ny giv der `hånd` beholdes i `sete` og de 40 andre kortene deles ut på nytt.
 * Det er nøyaktig flaksen budgiveren står overfor: han kjenner sine tolv, og
 * ingenting annet.
 */
function omtrekk(mal: GameState, sete: number, hånd: readonly Kort[], rng: () => number): GameState {
  const mine = new Set(hånd.map(kortId));
  const resten = stokk(nyStokk().filter((k) => !mine.has(kortId(k))), rng);
  const hender: Kort[][] = [];
  let i = 0;
  for (let s = 0; s < mal.antallSpillere; s++) {
    if (s === sete) hender.push([...hånd]);
    else {
      hender.push(resten.slice(i, i + mal.giving.kortPerSpiller));
      i += mal.giving.kortPerSpiller;
    }
  }
  return { ...mal, hender, talong: resten.slice(i, i + mal.giving.talong) };
}

/** Spiller runden med tvungen kontrakt `bud` på `sete`. Returnerer setets poeng. */
function spillMedBud(start: GameState, sete: number, bud: number): { poeng: number; lagStikk: number } | null {
  let s = start;
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== sete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== sete) return null;
  const lov = lovligeHandlinger(s);
  if (lov.fase !== "BUDRUNDE" || !lov.bud.includes(bud)) return null;
  s = utfør(s, { type: "BUD", spiller: sete, bud }).state;
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  if (s.fase === "BUDRUNDE" || s.budvinner !== sete) return null;

  const fører = lagFører();
  fører.nyKamp();
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, iTur === sete ? fører.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  const stikk = s.stikkVunnet;
  return {
    poeng: s.totalPoeng[sete] ?? 0,
    lagStikk: (stikk[sete] ?? 0) + (s.makker !== null ? (stikk[s.makker] ?? 0) : 0),
  };
}

interface Rad {
  readonly sd: number;
  readonly nevroBud: number | null;
  /** Forventet poeng per kandidatbud, og stikkfordelingens spredning. */
  readonly poeng: Map<number, number>;
  readonly stikkSnitt: Map<number, number>;
  readonly stikkSpredning: Map<number, number>;
  readonly beste: number;
}

const rader: Rad[] = [];
const rng = lagRng(90909);
for (let h = 0; h < antallHender; h++) {
  const mal = opprettSpill({ antallSpillere: 4 }, 3_300_000 + h);
  const sete = (mal.giver + 1) % mal.antallSpillere; // første budgiver
  const hånd = mal.hender[sete] ?? [];
  if (hånd.length === 0) continue;

  const sd = sdBud(analyserGiv(mal, nevro), sete, mal.giving.antallStikk);
  const lov = lovligeHandlinger(mal);
  let nevroBud: number | null = null;
  if (lov.fase === "BUDRUNDE") {
    const nb = nevro.velgHandling(mal);
    if (nb.type === "BUD" && typeof nb.bud === "number") nevroBud = nb.bud;
  }

  const poeng = new Map<number, number>();
  const stikkSnitt = new Map<number, number>();
  const stikkSpredning = new Map<number, number>();
  for (const b of BUD) {
    const p: number[] = [];
    const st: number[] = [];
    for (let t = 0; t < trekninger; t++) {
      const giv = omtrekk(mal, sete, hånd, rng);
      const r = spillMedBud(giv, sete, b);
      if (r === null) continue;
      p.push(r.poeng);
      st.push(r.lagStikk);
    }
    if (p.length === 0) continue;
    const m = p.reduce((a, x) => a + x, 0) / p.length;
    const ms = st.reduce((a, x) => a + x, 0) / st.length;
    let sq = 0;
    for (const x of st) sq += (x - ms) * (x - ms);
    poeng.set(b, m);
    stikkSnitt.set(b, ms);
    stikkSpredning.set(b, Math.sqrt(sq / Math.max(1, st.length - 1)));
  }
  if (poeng.size === 0) continue;
  let beste = BUD[0]!;
  for (const [b, v] of poeng) if (v > (poeng.get(beste) ?? -Infinity)) beste = b;
  rader.push({ sd, nevroBud, poeng, stikkSnitt, stikkSpredning, beste });
  tømCache();
  if (rader.length % 10 === 0) process.stdout.write(`\r  ${rader.length}/${antallHender} hender   `);
}
console.log();

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const linjer: string[] = [];
const ut = (s: string): void => { linjer.push(s); console.log(s); };

ut(`\n=== Hva burde man by? ${rader.length} hender x ${trekninger} trekninger per bud ===`);
ut(`Budgiverens 12 kort holdes faste; de 40 andre deles ut på nytt hver gang.`);
ut(`Spillefører: ${kandidatSpek}, NevroHjerne i de andre setene.\n`);

ut("bud".padEnd(6) + "forventet poeng".padStart(18) + "lagstikk".padStart(12) + "spredning".padStart(12) + "innfridd".padStart(11));
ut("-".repeat(59));
for (const b of BUD) {
  const p = rader.map((r) => r.poeng.get(b)).filter((x): x is number => x !== undefined);
  const s = rader.map((r) => r.stikkSnitt.get(b)).filter((x): x is number => x !== undefined);
  const sp = rader.map((r) => r.stikkSpredning.get(b)).filter((x): x is number => x !== undefined);
  if (p.length === 0) continue;
  const innfridd = rader.filter((r) => (r.stikkSnitt.get(b) ?? 0) >= b).length / rader.length;
  ut(
    `${b}`.padEnd(6) + snitt(p).toFixed(2).padStart(18) + snitt(s).toFixed(2).padStart(12) +
      snitt(sp).toFixed(2).padStart(12) + `${Math.round(100 * innfridd)} %`.padStart(11),
  );
}

const besteSnitt = snitt(rader.map((r) => r.beste));
const sdSnitt = snitt(rader.map((r) => r.sd));
const nevroRader = rader.filter((r) => r.nevroBud !== null);
ut(`\nOPTIMALT BUD mot referansene, samme hender:`);
ut(`  poengoptimalt bud (denne målingen)   ${besteSnitt.toFixed(2)}`);
ut(`  SD-orakelets bud                     ${sdSnitt.toFixed(2)}`);
if (nevroRader.length > 0) {
  // ÅPNINGSBUDET, ikke sluttbudet. Nevro åpner på minimum og klatrer, så dette
  // tallet skal IKKE leses som «nevro byr så lavt» – det er første melding i
  // en budrunde som ikke spilles ut her. Tatt med bare som referansepunkt.
  ut(`  NevroHjernes ÅPNINGSbud (ikke slutt) ${snitt(nevroRader.map((r) => r.nevroBud!)).toFixed(2)}  (n=${nevroRader.length})`);
}
ut(`  differanse optimalt − SD             ${(besteSnitt - sdSnitt >= 0 ? "+" : "") + (besteSnitt - sdSnitt).toFixed(2)}`);

// HVA KOSTER DET Å BOMME? Forskjellen mellom beste bud og SD-budet, i poeng.
let tapSD = 0;
let n = 0;
for (const r of rader) {
  const best = r.poeng.get(r.beste);
  const nærmesteSD = BUD.reduce((a, b) => (Math.abs(b - r.sd) < Math.abs(a - r.sd) ? b : a));
  const vedSD = r.poeng.get(nærmesteSD);
  if (best === undefined || vedSD === undefined) continue;
  tapSD += best - vedSD;
  n++;
}
ut(`\nÅ by SD-budet i stedet for det poengoptimale koster ${(tapSD / Math.max(1, n)).toFixed(2)} poeng per hånd (n=${n}).`);
ut(`
FORBEHOLD. «Optimalt» her er optimalt MOT NEVRO-MOTSTAND og med vår egen
spilleføring. En sterkere motstand presser det optimale budet ned, og en
bedre spillefører løfter det. Tallet er et anslag på RETNINGEN og
størrelsesordenen, ikke en fasit som kan kopieres inn i budnettet.

Merk også at spredningen i lagstikk er flaksen i ren form: den kommer fra
talongen, fra hvor makkerkortet ligger og fra fordelingen. Er den stor, skal
budet ligge langt under forventningen – det er nettopp derfor menneskene
melder 8,95 der SD sier 9,40 og likevel vinner.`);

writeFileSync(utFil, linjer.join("\n") + "\n");
console.log(`\nSkrev ${utFil}`);
