/**
 * Forsvars- og makkerprofil: spiller boten som et LAG, eller individuelt?
 *
 *   node examples/lagprofil.ts bidrag/d5-adoptert.json --kamper 30
 *
 * Poengsummen skjuler lagspill. En bot kan ta mange stikk selv og likevel
 * være en dårlig makker – den kan stjele makkerens vinnende stikk, kaste
 * høye kort når det er unødvendig, eller trumfe inn der makkeren allerede
 * har kontroll. Denne måler beslutningene direkte i to roller:
 *
 * FORSVAR
 *  - avkast-disiplin: når stikket ikke kan vinnes, legges det LAVESTE?
 *  - trumfing: når renons i utspillsfargen og trumf på hånd – trumfes det inn?
 *  - holder tilbake: legges det høyt når det ikke trengs (sløsing)?
 *
 * MAKKER (og budvinner)
 *  - overtar makkeren: legges et høyere kort når makkeren ALLEREDE vinner
 *    stikket? Det er ren sløsing – laget vinner uansett.
 *  - sparer makkeren: legges lavt når makkeren vinner? (motstykket)
 *  - trumfkontroll: spilles trumf ut når laget har flest trumf igjen?
 *  - redder stikk: tas stikket når makkeren IKKE kan vinne det?
 *
 * Rollene bestemmes av den ekte tilstanden (budvinner/makker), men
 * beslutningene måles bare i stillinger der agenten selv kunne valgt
 * annerledes – ett lovlig kort er ingen beslutning.
 */

import { readFileSync } from "node:fs";

import type { Farge, Kort } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

const filer: string[] = [];
let kamper = 30;
/**
 * Motstanderne. Mot graadig vinner en sterk bot ALLTID budrunden og forsvarer
 * dermed aldri – maalt: NevroHjerne fikk n=0 forsvarsstikk. Da finnes det
 * ingen sammenlikning. Med nevro-motstandere tapes budrunden ofte nok til at
 * forsvarsrollen faktisk maales.
 */
let motstander: "grådig" | "nevro" = "nevro";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--motstander") motstander = process.argv[++i] === "grådig" ? "grådig" : "nevro";
  else filer.push(a);
}

interface Lag {
  // Forsvar
  fAvkastLavest: number; fAvkastValg: number;
  fTrumfetInn: number; fKunneTrumfe: number;
  fVantStikk: number; fStikkSomForsvarer: number;
  // Makker/budlag
  mOvertokMakker: number; mMakkerVant: number;
  mSpartMakker: number;
  mReddetStikk: number; mMakkerKunneIkke: number;
  mTrumfUtspill: number; mUtspillMedKontroll: number;
}
const nyLag = (): Lag => ({
  fAvkastLavest: 0, fAvkastValg: 0, fTrumfetInn: 0, fKunneTrumfe: 0,
  fVantStikk: 0, fStikkSomForsvarer: 0,
  mOvertokMakker: 0, mMakkerVant: 0, mSpartMakker: 0,
  mReddetStikk: 0, mMakkerKunneIkke: 0, mTrumfUtspill: 0, mUtspillMedKontroll: 0,
});

/** Slår `ny` det som ligger på bordet? (samme regel som motoren) */
function slår(ny: Kort, best: Kort, trumf: Farge | null, led: Farge): boolean {
  const nT = ny.farge === trumf, bT = best.farge === trumf;
  if (nT !== bT) return nT;
  if (nT) return ny.verdi > best.verdi;
  if (ny.farge !== led) return false;
  if (best.farge !== led) return true;
  return ny.verdi > best.verdi;
}

/** Hvem vinner stikket akkurat nå, og med hvilket kort? */
function leder(s: GameState): { spiller: number; kort: Kort } | null {
  if (s.bord.length === 0) return null;
  const led = s.bord[0]!.kort.farge;
  let best = s.bord[0]!;
  for (const kp of s.bord) if (slår(kp.kort, best.kort, s.trumf, led)) best = kp;
  return { spiller: best.spiller, kort: best.kort };
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };

function spill(lag: () => Velger, L: Lag, frø: number, sete: number): void {
  const agent = lag();
  const motpart = new NevroAgent();
  agent.nyKamp();
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 25) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
    const min = iTur === sete;
    const h = min ? agent.velgHandling(s) : motstander === "nevro" ? motpart.velgHandling(s) : grådigHandling(s);

    if (min && h.type === "SPILL" && s.fase === "SPILL") {
      const lovlige = lovligeKort(s, sete);
      if (lovlige.length >= 2) {
        const påBudlag = sete === s.budvinner || sete === s.makker;
        const lag2 = s.makkerAvslørt || s.makker === sete;
        const l = leder(s);
        const led = s.bord[0]?.kort.farge;
        const kanVinne = l === null ? true : lovlige.some((k) => slår(k, l.kort, s.trumf, led!));
        const lavest = lovlige.reduce((a, b) => (a.verdi <= b.verdi ? a : b));

        // --- FORSVAR ---
        if (!påBudlag && l !== null) {
          if (!kanVinne) {
            // Hva er RIKTIG avkast her? Har man kort utenom trumf, er det det
            // laveste av dem; er man tvunget i trumf, det laveste trumfkortet.
            // (Første versjon krevde farge !== trumf, og telte da hver tvungne
            // trumfrunde som bom – begge botene ble kunstig lave.)
            const kastbare = lovlige.filter((k) => k.farge !== s.trumf);
            const pool = kastbare.length > 0 ? kastbare : lovlige;
            const riktig = pool.reduce((a, b) => (a.verdi <= b.verdi ? a : b));
            if (pool.length >= 2) {
              L.fAvkastValg++;
              if (h.kort.farge === riktig.farge && h.kort.verdi === riktig.verdi) L.fAvkastLavest++;
            }
          }
          // Renons i utspillsfargen + har trumf = mulighet til å stjele.
          const harLed = lovlige.some((k) => k.farge === led);
          const harTrumf = lovlige.some((k) => k.farge === s.trumf);
          if (!harLed && harTrumf && l.kort.farge !== s.trumf) {
            L.fKunneTrumfe++;
            if (h.kort.farge === s.trumf) L.fTrumfetInn++;
          }
        }

        // --- MAKKER / BUDLAG ---
        if (påBudlag && l !== null && lag2) {
          const makkerLeder =
            (sete === s.budvinner && l.spiller === s.makker) ||
            (sete === s.makker && l.spiller === s.budvinner);
          if (makkerLeder) {
            L.mMakkerVant++;
            // Overtar man en makker som allerede vinner, kastes et kort bort.
            if (slår(h.kort, l.kort, s.trumf, led!)) L.mOvertokMakker++;
            else if (h.kort.verdi <= lavest.verdi + 1) L.mSpartMakker++;
          } else if (kanVinne) {
            // Makkeren leder ikke og motstanderen har stikket: kan vi redde det?
            L.mMakkerKunneIkke++;
            if (slår(h.kort, l.kort, s.trumf, led!)) L.mReddetStikk++;
          }
        }

        // Utspill med trumfkontroll: har laget flest trumf igjen, bør trumf ut.
        if (påBudlag && s.bord.length === 0) {
          const egneTrumf = lovlige.filter((k) => k.farge === s.trumf).length;
          if (egneTrumf >= 2) {
            L.mUtspillMedKontroll++;
            if (h.kort.farge === s.trumf) L.mTrumfUtspill++;
          }
        }
      }
    }
    const res = utfør(s, h);
    for (const e of res.hendelser) {
      if (e.type === "STIKK_FERDIG") {
        const påBudlag = sete === s.budvinner || sete === s.makker;
        if (!påBudlag) {
          L.fStikkSomForsvarer++;
          if (e.vinner === sete) L.fVantStikk++;
        }
      }
    }
    s = res.state;
  }
}

const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);
const kandidater: { navn: string; lag: () => Velger }[] = [];
for (const f of filer) {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  const g = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
  kandidater.push({ navn: f.split(/[\\/]/).pop()!, lag: () => new NeatAgent(g, { læringsrate: 0 }) });
}
kandidater.push({ navn: "NevroHjerne", lag: () => new NevroAgent() });

const L = kandidater.map(() => nyLag());
for (let f = 0; f < kamper; f++) {
  for (let i = 0; i < kandidater.length; i++) {
    for (let sete = 0; sete < 4; sete++) spill(kandidater[i]!.lag, L[i]!, 975_000 + f, sete);
  }
}

const rad = (navn: string, v: string[]): void => console.log(navn.padEnd(34) + v.map((x) => x.padStart(15)).join(""));
console.log(`\n=== Forsvars- og makkerprofil, ${kamper} givere × 4 seter ===\n`);
rad("", kandidater.map((k) => k.navn.slice(0, 14)));
console.log("-".repeat(34 + 15 * kandidater.length));
console.log("FORSVAR");
rad("  vant stikk som forsvarer", L.map((x) => pst(x.fVantStikk, x.fStikkSomForsvarer)));
rad("  avkast: la lavest når tapt", L.map((x) => pst(x.fAvkastLavest, x.fAvkastValg)));
rad("  trumfet inn når mulig", L.map((x) => pst(x.fTrumfetInn, x.fKunneTrumfe)));
console.log("MAKKER / BUDLAG");
rad("  overtok makker (sløsing)", L.map((x) => pst(x.mOvertokMakker, x.mMakkerVant)));
rad("  sparte kort når makker vant", L.map((x) => pst(x.mSpartMakker, x.mMakkerVant)));
rad("  reddet stikk makker tapte", L.map((x) => pst(x.mReddetStikk, x.mMakkerKunneIkke)));
rad("  trumf ut med kontroll", L.map((x) => pst(x.mTrumfUtspill, x.mUtspillMedKontroll)));
console.log("\n(n: forsvarsstikk " + L.map((x) => x.fStikkSomForsvarer).join(" / ") +
  ", makker-vant " + L.map((x) => x.mMakkerVant).join(" / ") + ")");
