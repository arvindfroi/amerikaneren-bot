/**
 * Avmetning: gjør et modent genom LÆRBART igjen, uten å endre spillet.
 *
 *   node examples/neat-avmett.ts bidrag/d5-adoptert.json ut.json [--faktor auto]
 *
 * PROBLEMET (målt): utgangshodene står i metning – kortutganger på
 * 0,93–1,00 gir tanh-derivert (1 − ut²) på 0,001–0,18. Delta-regelen ganger
 * feilen med nettopp den, så alle fasit-lærerne, MoE-forsterkningen og
 * imitasjonen var i praksis virkningsløse. 200 kalibreringer med rate 0,1
 * flyttet én av 593 koblinger.
 *
 * Årsaken er kumulativ, ikke ekstreme vekter: ~5 koblinger inn per
 * kortutgang, median |vekt| 1,2, og kildenoder som selv er nær ±1 → sum ≈ 7,
 * og tanh(7) = 0,999998.
 *
 * FIKSEN, og hvorfor den er trygg: skaler ALLE koblinger inn til
 * utgangsnodene med samme faktor s. Da skaleres hver utgangs pre-aktivering
 * med nøyaktig s, og siden tanh er strengt voksende er RANGERINGEN mellom
 * kortene uendret – argmax gir samme kort, alltid. Nettet spiller altså
 * identisk, men utgangene lander i det lineære området der deriverte er
 * ~1 i stedet for ~0, og læring blir mulig igjen.
 *
 * TEORIEN OM EKSAKT ORDENSBEVARING ER FEIL – verifiseringen felte den.
 * Med faktor 0,05 endret kortvalget seg i 129 av 300 stillinger. Grunnen er
 * at NEAT aktiverer ITERATIVT over flere pass: utgangsverdier mates tilbake
 * og påvirker skjulte noder, så skaleringen forplanter seg ulikt gjennom
 * nettet. Argumentet «tanh er monotont» holder bare for ett enkelt pass.
 *
 * Men prisen er målt og liten: −1,50 ± 2,23 poeng/kamp (p=0,26), altså
 * innenfor støyen. Endringene skjer i stillinger der kortene er likeverdige.
 * Til gjengjeld går snitt tanh-derivert fra 0,48 til 0,98 og andelen mettede
 * hoder fra 30 % til 0 % – og kalibreringen fester igjen (verifisert:
 * før NEI, etter JA). Mildere faktorer (0,25/0,35) koster enda mindre, men
 * gjenoppretter IKKE læreevnen.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { opprettSpill, spillerVisning, utfør, lovligeKort, type GameState } from "../src/index.ts";
import { genomFraJson, klonGenom, NeatAgent, utId, type Genom } from "../src/neat/index.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { lagInn, UT_KORT, UT_TRUMF, UT_XT, UT_XT_HØY, UT_XT_LAV, UT_MARGIN, ANTALL_UT } from "../src/neat/trekk.ts";

const innFil = process.argv[2] ?? "bidrag/d5-adoptert.json";
const utFil = process.argv[3] ?? "avmettet.json";
const faktorArg = process.argv.includes("--faktor")
  ? process.argv[process.argv.indexOf("--faktor") + 1]!
  : "auto";

const rå = JSON.parse(readFileSync(innFil, "utf8")) as { genom?: unknown };
const basis: Genom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(innFil, "utf8"));

/** Alle utgangsnodenes id-er. */
const utIder = new Set(Array.from({ length: ANTALL_UT }, (_, j) => utId(basis.antallInn, j)));

/** Samler stillinger fra ekte spill – vi måler metning der den betyr noe. */
function prøver(genom: Genom, antall: number): { inn: number[]; lovlige: number[] }[] {
  const ut: { inn: number[]; lovlige: number[] }[] = [];
  const agent = new NeatAgent(genom, { læringsrate: 0 });
  for (let k = 0; ut.length < antall && k < 400; k++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 991_000 + k);
    let guard = 0;
    while (s.fase !== "FERDIG" && guard++ < 300) {
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= 6) break;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.fase === "SPILL" && s.iTur !== null) {
        const lov = lovligeKort(s, s.iTur);
        if (lov.length >= 2 && ut.length < antall) {
          ut.push({
            inn: lagInn(spillerVisning(s, s.iTur), "SPILL", s.giving.antallStikk, s.regler.målPoeng),
            lovlige: lov.map((k2) => ["S", "H", "R", "K"].indexOf(k2.farge) * 13 + (k2.verdi - 2)),
          });
        }
      }
      s = utfør(s, agent.velgHandling(s)).state;
    }
  }
  return ut;
}

const sett = prøver(basis, 300);
console.log(`${innFil}: ${sett.length} stillinger til måling\n`);

/** Snitt tanh-derivert over de besluttende hodene – vårt læringsmål. */
function derivert(genom: Genom): { snitt: number; mettet: number } {
  const n = new Nettverk(genom);
  const hoder = [UT_XT, UT_XT_LAV, UT_XT_HØY, UT_MARGIN, ...[0, 1, 2, 3].map((f) => UT_TRUMF + f)];
  let sum = 0;
  let antall = 0;
  let mettet = 0;
  for (const p of sett) {
    const ut = n.aktiver(p.inn);
    for (const u of [...hoder, ...p.lovlige.map((k) => UT_KORT + k)]) {
      const d = 1 - ut[u]! * ut[u]!;
      sum += d;
      antall++;
      if (d < 0.05) mettet++;
    }
  }
  return { snitt: sum / antall, mettet: mettet / antall };
}

/** Skalerer alle koblinger INN til utgangsnodene med `s`. */
function skaler(genom: Genom, s: number): Genom {
  const g = klonGenom(genom);
  for (const k of g.koblinger) if (utIder.has(k.ut)) k.vekt *= s;
  return g;
}

const før = derivert(basis);
console.log(`FØR:  snitt tanh-derivert ${før.snitt.toFixed(4)}, mettet (< 0,05) ${(100 * før.mettet).toFixed(0)} %`);

// Finn faktoren som gir best læringsevne. Lavere faktor = mindre metning,
// men for lavt gjør nettet numerisk sløvt (alle utganger nær 0).
let beste = 1;
if (faktorArg === "auto") {
  let bestDer = før.snitt;
  for (const s of [0.5, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05]) {
    const d = derivert(skaler(basis, s));
    console.log(`  faktor ${s}: derivert ${d.snitt.toFixed(4)}, mettet ${(100 * d.mettet).toFixed(0)} %`);
    if (d.snitt > bestDer) {
      bestDer = d.snitt;
      beste = s;
    }
  }
} else {
  beste = Number(faktorArg);
}

const avmettet = skaler(basis, beste);
const etter = derivert(avmettet);
console.log(`\nValgt faktor ${beste}: derivert ${etter.snitt.toFixed(4)} (${(etter.snitt / før.snitt).toFixed(0)}× bedre), mettet ${(100 * etter.mettet).toFixed(0)} %`);

// --- VERIFISER at spillet er uendret ----------------------------------------
// Teorien sier at rangeringen er eksakt bevart. Vi stoler ikke på teorien.
const nA = new Nettverk(basis);
const nB = new Nettverk(avmettet);
let ulike = 0;
for (const p of sett) {
  const uA = nA.aktiver(p.inn);
  const uB = nB.aktiver(p.inn);
  const velg = (u: number[]): number => {
    let b = p.lovlige[0]!;
    for (const k of p.lovlige) if (u[UT_KORT + k]! > u[UT_KORT + b]!) b = k;
    return b;
  };
  if (velg(uA) !== velg(uB)) ulike++;
}
console.log(`Kortvalg endret i ${ulike} av ${sett.length} stillinger${ulike === 0 ? " – atferden er identisk" : " ← ADVARSEL"}`);

// --- VERIFISER at kalibrering nå fester -------------------------------------
function kalibreringFester(genom: Genom): boolean {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 12_345);
  const a0 = new NeatAgent(genom, { læringsrate: 0 });
  let guard = 0;
  while (s.fase !== "SPILL" && guard++ < 200) s = utfør(s, a0.velgHandling(s)).state;
  const lov = lovligeKort(s, s.iTur!);
  const før2 = a0.velgHandling(s);
  if (før2.type !== "SPILL") return false;
  const mål = lov.find((k) => k.farge !== før2.kort.farge || k.verdi !== før2.kort.verdi);
  if (mål === undefined) return false;
  const g1 = klonGenom(genom);
  const a1 = new NeatAgent(g1, { læringsrate: 0 });
  for (let i = 0; i < 50; i++) a1.lærSpill(s, s.iTur!, mål, 0.1);
  const etter2 = a1.velgHandling(s);
  return etter2.type === "SPILL" && etter2.kort.farge === mål.farge && etter2.kort.verdi === mål.verdi;
}
console.log(`Kalibrering fester: før ${kalibreringFester(basis) ? "JA" : "NEI"}, etter ${kalibreringFester(avmettet) ? "JA" : "NEI"}`);

writeFileSync(utFil, JSON.stringify(avmettet));
console.log(`\nSkrev ${utFil}`);
