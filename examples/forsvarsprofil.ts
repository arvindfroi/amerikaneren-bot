/**
 * HVA gjør forsvaret galt? Beslutning for beslutning, mot NevroHjerne.
 *
 *   node examples/forsvarsprofil.ts trening-d5/gull.json senat/v2fersk/ekspert-forsvar.json --kamper 400
 *
 * Rollemålingen sier at D5 feller kontrakt 9 i 12 % av tilfellene mot
 * NevroHjernes 26 %, men ikke hvorfor. Her tvinges kontrakten (nevro er
 * spillefører), kandidaten settes i et forsvarssete, og HVERT kortvalg
 * klassifiseres mot hva stillingen tillot.
 *
 * Forsvar er et LAGSPILL: den andre forsvareren spiller også mot kontrakten.
 * Derfor skilles det på hvem som leder stikket akkurat nå. Å legge på et
 * stikk medforsvareren allerede vinner er rent bortkast – kortet er borte og
 * stikket var alt vårt. Å la være å ta et stikk budlaget ellers tar, er
 * motsatt feil. Begge måles hver for seg, for de krever motsatt korreksjon.
 *
 * Alle kandidatene ser NØYAKTIG de samme stillingene: nevro spiller ut
 * kontrakten likt hver gang, så tallene er parret.
 */

import { readFileSync } from "node:fs";

import { type Kort } from "../src/kort.ts";
import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";
import { stikkvinner } from "../src/motor.ts";

const filer: string[] = [];
let kamper = 400;
let kontrakt = 9;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else filer.push(a);
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };

function oppsett(frø: number, budsete: number, k: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < k - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: k }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "BUDRUNDE" ? null : s;
}

interface Profil {
  valg: number;
  // Stikket ledes av MEDFORSVAREREN (stikket er allerede vårt)
  makkerLeder: number;
  makkerLederOgViSlo: number; // bortkastet: vi tok vårt eget stikk
  makkerLederOgViKastetHøyt: number; // bortkastet honnør
  // Stikket ledes av BUDLAGET og vi KUNNE tatt det
  kunneTa: number;
  tokDet: number;
  // Trumfing
  renonsMedTrumf: number;
  trumfetInn: number;
  // Utspill
  utspill: number;
  utspillTrumf: number;
  utspillHøyt: number;
  // Divergens mot nevro på identisk stilling
  likSomNevro: number;
  /**
   * UTFALLET, per giver. Atferd er bare interessant hvis den koster stikk, så
   * dette er raden som avgjør. `klarte[i]` er 1 hvis budlaget hentet hjem
   * kontrakten i giver i, `lagStikk[i]` er stikkene de fikk. Parret: alle
   * kandidatene forsvarer NØYAKTIG de samme giverne mot den samme
   * spilleføringen, så differansen måles på identisk materiale.
   */
  klarte: number[];
  lagStikk: number[];
}

const nyProfil = (): Profil => ({
  valg: 0, makkerLeder: 0, makkerLederOgViSlo: 0, makkerLederOgViKastetHøyt: 0,
  kunneTa: 0, tokDet: 0, renonsMedTrumf: 0, trumfetInn: 0,
  utspill: 0, utspillTrumf: 0, utspillHøyt: 0, likSomNevro: 0,
  klarte: [], lagStikk: [],
});

/** Ville `kort` vunnet stikket slik det står nå? */
function vinnerNå(s: GameState, kort: Kort, sete: number): boolean {
  const bord = s.bord.concat({ spiller: sete, kort });
  return stikkvinner(bord, s.trumf!) === sete;
}

function kjør(lag: () => Velger, p: Profil, frø: number): void {
  const budsete = frø % 4;
  let s = oppsett(frø, budsete, kontrakt);
  if (s === null) return;
  const nevro = new NevroAgent();
  let g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) s = utfør(s, nevro.velgHandling(s)).state;
  if (s.fase !== "SPILL") return;

  const forsvarere = [0, 1, 2, 3].filter((x) => x !== budsete && x !== s!.makker);
  if (forsvarere.length < 2) return;
  const sete = forsvarere[frø % forsvarere.length]!;
  const medforsvarer = forsvarere.find((x) => x !== sete)!;

  const kandidat = lag();
  kandidat.nyKamp();
  const skygge = new NevroAgent(); // for divergensmåling på identisk stilling
  skygge.nyKamp();

  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.iTur!;
    if (iTur !== sete) {
      s = utfør(s, nevro.velgHandling(s)).state;
      continue;
    }
    const lov = lovligeHandlinger(s);
    const h = kandidat.velgHandling(s);
    if (h.type !== "SPILL" || lov.fase !== "SPILL") {
      s = utfør(s, h).state;
      continue;
    }
    const kort = h.kort;
    p.valg++;

    const nevroValg = skygge.velgHandling(s);
    if (nevroValg.type === "SPILL" && nevroValg.kort.farge === kort.farge && nevroValg.kort.verdi === kort.verdi) {
      p.likSomNevro++;
    }

    if (s.bord.length === 0) {
      p.utspill++;
      if (kort.farge === s.trumf) p.utspillTrumf++;
      if (kort.verdi >= 13) p.utspillHøyt++;
    } else {
      const leder = stikkvinner(s.bord, s.trumf!);
      const ledFarge = s.bord[0]!.kort.farge;
      const harFarge = lov.kort.some((k) => k.farge === ledFarge);
      if (!harFarge && lov.kort.some((k) => k.farge === s!.trumf)) {
        p.renonsMedTrumf++;
        if (kort.farge === s.trumf) p.trumfetInn++;
      }
      if (leder === medforsvarer) {
        // Stikket er ALLEREDE vårt. Å slå det er bortkast.
        p.makkerLeder++;
        if (vinnerNå(s, kort, sete)) p.makkerLederOgViSlo++;
        else if (kort.verdi >= 13) p.makkerLederOgViKastetHøyt++;
      } else {
        // Budlaget leder. Kunne vi tatt stikket?
        if (lov.kort.some((k) => vinnerNå(s!, k, sete))) {
          p.kunneTa++;
          if (vinnerNå(s, kort, sete)) p.tokDet++;
        }
      }
    }
    s = utfør(s, h).state;
  }

  // UTFALLET. Budlaget er budgiveren pluss makkeren; makkeren spilles av nevro
  // i alle armene, så det eneste som varierer mellom kandidatene er det ene
  // forsvarssetet. Kontrakten er tvungen og lik, så «klarte» kan leses direkte.
  const stikk = s.stikkVunnet;
  const lagStikk = (stikk[budsete] ?? 0) + (s.makker !== null ? (stikk[s.makker] ?? 0) : 0);
  p.lagStikk.push(lagStikk);
  p.klarte.push(lagStikk >= kontrakt ? 1 : 0);
}

/**
 * Kandidatspesifikasjon, samme språk som benkene ellers: en genomfil,
 * «nevro», «e1:<vektfil>» eller «vakt:<flagg>:<indre>».
 *
 * Grunnen til at E1 og vakten må inn HER er at forsvaret aldri har vært målt
 * for dem. Fasegapet mot MesterAI viser -0,01 stikk mot SD for oss og +0,30
 * for MesterAI som spillefører, men det tallet er tvetydig: det kan bety at
 * MesterAI fører bedre, ELLER at forsvaret vårt er svakere enn nevros, som er
 * motstandermodellen SD antar. Med nevro som tvungen spillefører og kandidaten
 * i forsvarssetet er spilleføringen holdt fast, og bare forsvaret varierer.
 */
function lagKandidat(spec: string): { navn: string; lag: () => Velger } {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return {
      navn: `v${vakt.flagg}:${indre.navn}`.slice(0, 16),
      lag: () => new Konvensjonsvakt(indre.lag(), vakt.valg),
    };
  }
  if (spec === "nevro") return { navn: "NevroHjerne", lag: () => new NevroAgent() };
  if (spec.startsWith("e1:")) {
    const fil = spec.slice(3);
    const nett = lesE1Nett(fil);
    return {
      navn: fil.split(/[\\/]/).pop()!.replace(".bin", "").slice(0, 16),
      lag: () => new E1Agent(nett),
    };
  }
  const rå = JSON.parse(readFileSync(spec, "utf8")) as { genom?: unknown };
  const gen = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(spec, "utf8"));
  return {
    navn: spec.split(/[\\/]/).pop()!.replace(".json", "").slice(0, 16),
    lag: () => new NeatAgent(gen, { læringsrate: 0 }),
  };
}

const kandidater: { navn: string; lag: () => Velger }[] = filer.map(lagKandidat);
if (!filer.includes("nevro")) {
  kandidater.push({ navn: "NevroHjerne", lag: () => new NevroAgent() });
}

const profiler = kandidater.map(() => nyProfil());
for (let i = 0; i < kandidater.length; i++) {
  for (let f = 0; f < kamper; f++) kjør(kandidater[i]!.lag, profiler[i]!, 1_400_000 + f);
}

const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);
const rad = (navn: string, v: string[]): void => console.log(navn.padEnd(34) + v.map((x) => x.padStart(15)).join(""));

console.log(`\n=== Forsvarsprofil, kontrakt ${kontrakt}, ${kamper} givere (nevro spillefører) ===\n`);
rad("", kandidater.map((k) => k.navn));
console.log("-".repeat(34 + 15 * kandidater.length));

// UTFALLET FØRST. Atferdsradene under er bare diagnose; det er denne som sier
// om forsvaret faktisk virker. Alle kandidatene forsvarte de samme giverne mot
// den samme spilleføringen, så differansen er parret.
const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const parretSE = (a: readonly number[], b: readonly number[]): number => {
  const d = a.map((x, i) => x - b[i]!);
  const m = snitt(d);
  let sq = 0;
  for (const x of d) sq += (x - m) * (x - m);
  return Math.sqrt(sq / (d.length - 1) / d.length);
};
const grunn = profiler[0]!;
rad("givere spilt ut", profiler.map((p) => String(p.klarte.length)));
rad("KONTRAKTEN FALT", profiler.map((p) => pst(p.klarte.length - p.klarte.reduce((a, b) => a + b, 0), p.klarte.length)));
rad("budlagets stikk", profiler.map((p) => snitt(p.lagStikk).toFixed(3)));
rad(
  `  stikk mot ${kandidater[0]!.navn} (±SE)`,
  profiler.map((p, i) =>
    i === 0 || p.lagStikk.length !== grunn.lagStikk.length
      ? "–"
      : `${(snitt(p.lagStikk) - snitt(grunn.lagStikk) >= 0 ? "+" : "")}${(snitt(p.lagStikk) - snitt(grunn.lagStikk)).toFixed(3)}±${parretSE(p.lagStikk, grunn.lagStikk).toFixed(3)}`,
  ),
);
console.log("\nFærre stikk til budlaget = bedre forsvar. Positivt tall over betyr");
console.log("altså at kandidaten forsvarer DÅRLIGERE enn den første kolonnen.\n");

rad("kortvalg (n)", profiler.map((p) => String(p.valg)));
rad("likt valg som nevro", profiler.map((p) => pst(p.likSomNevro, p.valg)));
console.log();
rad("BUDLAGET leder og vi kunne ta", profiler.map((p) => String(p.kunneTa)));
rad("  -> tok stikket", profiler.map((p) => pst(p.tokDet, p.kunneTa)));
console.log();
rad("MEDFORSVARER leder (alt vårt)", profiler.map((p) => String(p.makkerLeder)));
rad("  -> slo vårt eget stikk", profiler.map((p) => pst(p.makkerLederOgViSlo, p.makkerLeder)));
rad("  -> kastet honnør bort", profiler.map((p) => pst(p.makkerLederOgViKastetHøyt, p.makkerLeder)));
console.log();
rad("renons + har trumf", profiler.map((p) => String(p.renonsMedTrumf)));
rad("  -> trumfet inn", profiler.map((p) => pst(p.trumfetInn, p.renonsMedTrumf)));
console.log();
rad("utspill", profiler.map((p) => String(p.utspill)));
rad("  -> spilte trumf ut", profiler.map((p) => pst(p.utspillTrumf, p.utspill)));
rad("  -> spilte honnør ut", profiler.map((p) => pst(p.utspillHøyt, p.utspill)));
console.log();
