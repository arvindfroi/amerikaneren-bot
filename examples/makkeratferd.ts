/**
 * MAKKERENS ATFERD, målt mot Arvinds doktrine — ikke mot et orakel.
 *
 *   node examples/makkeratferd.ts 7000000 3000 analyse/makkeratferd.json
 *
 * HVORFOR IKKE ANGER. Makkerens `fanget` er 0,262 – lavest av alle roller – men
 * gulvet er også lavest (0,336 mot spillefører 2,010). Et lavt gulv betyr at
 * det står lite på spill per beslutning, og da sier anger lite om HVA som er
 * galt. Doktrinen sier derimot presis hva som skal skje, og brudd på den er
 * tellbare uten fasit:
 *
 *   «budvinnerens kort er generelt mer verdifulle»
 *   «viktig å vite hvordan man sparer på kort og bruker kort optimalt»
 *   «lagstikk ligger i bunnen»
 *
 * FIRE BRUDD SOM FØLGER DIREKTE AV DET:
 *
 *   OVERTAKING – makkeren legger et kort som slår spillefører når spillefører
 *     ALLEREDE vinner stikket, og hadde et lovlig kort som ikke ville gjort
 *     det. Stikket var lagets uansett; kortet er kastet bort.
 *
 *   TRUMFSLØSING – makkeren trumfer et stikk spillefører allerede vinner.
 *     Verste form av samme feil: trumf er den knappeste ressursen.
 *
 *   HONNØRSLØSING – makkeren legger knekt eller høyere i et stikk han verken
 *     vinner selv eller trenger å vinne, og hadde et lavere lovlig kort.
 *
 *   TAPT REDNING – motparten vinner stikket, makkeren KUNNE tatt det med et
 *     lovlig kort, og lot være. Motstykket til de tre over: sparing som er
 *     blitt feighet.
 *
 * ALLE FIRE KREVER AT ET ALTERNATIV FANTES. Følgeplikten er absolutt i
 * Amerikaneren, så et «brudd» der bare ett kort var lovlig er ikke et brudd –
 * det er reglene. Uten den sjekken måler man kortfordelingen og kaller det
 * atferd.
 *
 * Tallene skrives til fil, og skriptet endrer ingenting.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { vurderKortSD } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import type { Farge, Kort } from "../src/kort.ts";

const FRØ0 = Number(process.argv[2] ?? 7_000_000);
const RUNDER = Number(process.argv[3] ?? 3000);
const UT = process.argv[4] ?? "analyse/makkeratferd.json";
const SPEK = process.argv[5] ?? "budm:e1-modell/bud-gbt.json:vakt:abmp:e1:e1-modell/ftf1.bin";
/**
 * ORAKELREFERANSE. Uten den er bruddratene ubrukelige: noe overtaking ER
 * riktig - ligger spillefoererens kort lavt og en motstander bak fortsatt kan
 * slaa det, skal makkeren ta over. Spoersmaalet er ikke om vi gjoer det, men
 * om vi gjoer det OFTERE ENN VI BURDE. Derfor telles noeyaktig de samme fire
 * kategoriene for SD-orakelets kort i noeyaktig samme stilling, parret.
 */
const ORAKEL = process.argv.includes("--orakel");
const VERDENER = 12;
/**
 * EGEN, SEEDET RNG til orakelet. Verdenstrekkingen krever en - og den maa vaere
 * seedet, ellers er referansetallet ikke reproduserbart og to kjoeringer av
 * samme maaling kan ikke sammenliknes.
 */
const orakelRng = lagRng(918_273_645);

function lagIndre(indre: string): { velgHandling(s: GameState): Handling; nyKamp(): void } {
  if (indre === "nevro") return new NevroAgent();
  if (indre.startsWith("vakt:")) {
    const v = delVaktspek(indre);
    if (v === null) throw new Error(`Ugyldig vaktspek «${indre}»`);
    return new Konvensjonsvakt(lagIndre(v.indre), v.valg);
  }
  if (indre.startsWith("budm:")) {
    const rest = indre.slice(5);
    const skille = rest.indexOf(":");
    return new Budagent(lagIndre(rest.slice(skille + 1)), lesBudmodell(rest.slice(0, skille)));
  }
  if (indre.startsWith("e1:")) return E1Agent.fraFil(indre.slice(3));
  throw new Error(`Ukjent agent «${indre}»`);
}

/** Slår `a` kortet `b`, gitt utspilt farge og trumf? */
function slår(a: Kort, b: Kort, ledet: Farge, trumf: Farge | null): boolean {
  const aT = trumf !== null && a.farge === trumf;
  const bT = trumf !== null && b.farge === trumf;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (aT && bT) return a.verdi > b.verdi;
  if (a.farge === ledet && b.farge !== ledet) return true;
  if (a.farge !== ledet && b.farge === ledet) return false;
  if (a.farge !== ledet && b.farge !== ledet) return false;
  return a.verdi > b.verdi;
}

/** Hvem leder stikket akkurat nå, blant kortene som ligger. */
function ledende(bord: { spiller: number; kort: Kort }[], trumf: Farge | null): { spiller: number; kort: Kort } | null {
  if (bord.length === 0) return null;
  const ledet = bord[0]!.kort.farge;
  let best = bord[0]!;
  for (const kp of bord.slice(1)) if (slår(kp.kort, best.kort, ledet, trumf)) best = kp;
  return best;
}

const agent = lagIndre(SPEK);
/**
 * Rollout-policyen i SD-verdenene. NevroHjerne, fordi det er NOEYAKTIG den
 * konfigurasjonen fasiten ble validert med (+0,718 gjennom godkjenningsporten).
 * Byttes den, maaler vi mot et annet orakel enn det nettet er trent mot.
 */
const orakelMotpart = new NevroAgent();

let beslutninger = 0;
let medValg = 0;
let overtaking = 0;
let overtakingMulig = 0;
let trumfslosing = 0;
let trumfslosingMulig = 0;
let honnorslosing = 0;
let honnorslosingMulig = 0;
let taptRedning = 0;
let redningMulig = 0;
let oOvertaking = 0;
let oTrumfslosing = 0;
let oHonnorslosing = 0;
let oTaptRedning = 0;
let orakelstillinger = 0;

for (let i = 0; i < RUNDER; i++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, FRØ0 + i * 6151);
  agent.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;

    // ÉN kall per beslutning, gjenbrukt. Agentene har intern tilstand
    // (Konvensjonsvakt teller konvensjoner, E1Agent har en frøteller), så to
    // kall på samme stilling ville flyttet den tilstanden og endret nettopp
    // atferden vi måler.
    const handling = agent.velgHandling(s);

    const erMakker =
      s.fase === "SPILL" &&
      s.makker === iTur &&
      s.budvinner !== null &&
      s.makker !== s.budvinner;

    if (erMakker && s.bord.length > 0) {
      const trumf = s.trumf;
      const ledet = s.bord[0]!.kort.farge;
      const lovlige = lovligeKort(s, iTur);
      const leder = ledende(s.bord, trumf)!;
      const førerKort = s.bord.find((kp) => kp.spiller === s.budvinner);
      const førerVinner = førerKort !== undefined && leder.spiller === s.budvinner;

      beslutninger++;
      if (lovlige.length >= 2) {
        medValg++;
        const valgt = (handling as Handling & { kort: Kort }).kort;

        // Orakelets kort i NOEYAKTIG samme stilling - referansen alle fire
        // ratene maa leses mot.
        let orakelKort: Kort | null = null;
        if (ORAKEL) {
          const v = vurderKortSD(s, iTur, orakelMotpart, { verdener: VERDENER, rng: orakelRng });
          if (v.length > 0) {
            orakelKort = v.reduce((a, b) => (b.verdi > a.verdi ? b : a)).kort;
            orakelstillinger++;
          }
        }

        if (førerVinner) {
          // Spillefører har stikket. Alt makkeren legger over er bortkastet.
          const kanUnngå = lovlige.some((k) => !slår(k, leder.kort, ledet, trumf));
          if (kanUnngå) {
            overtakingMulig++;
            if (slår(valgt, leder.kort, ledet, trumf)) overtaking++;
            if (orakelKort !== null && slår(orakelKort, leder.kort, ledet, trumf)) oOvertaking++;
          }
          const kanUnngåTrumf = lovlige.some((k) => trumf === null || k.farge !== trumf);
          if (kanUnngåTrumf && trumf !== null && ledet !== trumf) {
            trumfslosingMulig++;
            if (valgt.farge === trumf) trumfslosing++;
            if (orakelKort !== null && orakelKort.farge === trumf) oTrumfslosing++;
          }
          const lavere = lovlige.filter((k) => k.verdi < 11);
          if (lavere.length > 0) {
            honnorslosingMulig++;
            if (valgt.verdi >= 11) honnorslosing++;
            if (orakelKort !== null && orakelKort.verdi >= 11) oHonnorslosing++;
          }
        } else {
          // Motparten leder stikket. Kan makkeren ta det?
          const vinnende = lovlige.filter((k) => slår(k, leder.kort, ledet, trumf));
          if (vinnende.length > 0) {
            redningMulig++;
            if (!slår(valgt, leder.kort, ledet, trumf)) taptRedning++;
            if (orakelKort !== null && !slår(orakelKort, leder.kort, ledet, trumf)) oTaptRedning++;
          }
        }
      }
    }
    s = utfør(s, handling).state;
  }
}

const andel = (a: number, b: number): number => (b > 0 ? a / b : NaN);
const rapport = {
  spek: SPEK,
  runder: RUNDER,
  makkerbeslutninger: beslutninger,
  medValg,
  overtaking: { brudd: overtaking, mulig: overtakingMulig, andel: andel(overtaking, overtakingMulig) },
  trumfslosing: { brudd: trumfslosing, mulig: trumfslosingMulig, andel: andel(trumfslosing, trumfslosingMulig) },
  honnorslosing: { brudd: honnorslosing, mulig: honnorslosingMulig, andel: andel(honnorslosing, honnorslosingMulig) },
  taptRedning: { brudd: taptRedning, mulig: redningMulig, andel: andel(taptRedning, redningMulig) },
  orakel: ORAKEL
    ? {
        stillinger: orakelstillinger,
        overtaking: andel(oOvertaking, overtakingMulig),
        trumfslosing: andel(oTrumfslosing, trumfslosingMulig),
        honnorslosing: andel(oHonnorslosing, honnorslosingMulig),
        taptRedning: andel(oTaptRedning, redningMulig),
      }
    : null,
};

mkdirSync(dirname(UT), { recursive: true });
writeFileSync(UT, JSON.stringify(rapport, null, 2), "utf-8");

console.log(`Spek: ${SPEK}`);
console.log(`Makkerbeslutninger: ${beslutninger}, med reelt valg: ${medValg}\n`);
const linje = (navn: string, o: { brudd: number; mulig: number; andel: number }, ork: number | null): void => {
  const vaar = `${o.brudd} av ${o.mulig} (${(o.andel * 100).toFixed(1)} %)`;
  const ref = ork === null || Number.isNaN(ork)
    ? ""
    : `   orakel ${(ork * 100).toFixed(1)} %   OVERSKUDD ${((o.andel - ork) * 100 >= 0 ? "+" : "")}${((o.andel - ork) * 100).toFixed(1)} pp`;
  console.log(`  ${navn.padEnd(28)} ${vaar.padEnd(22)}${ref}`);
};
const o = rapport.orakel;
linje("OVERTAKING av spillefoerer", rapport.overtaking, o ? o.overtaking : null);
linje("TRUMFSLOSING", rapport.trumfslosing, o ? o.trumfslosing : null);
linje("HONNOERSLOSING", rapport.honnorslosing, o ? o.honnorslosing : null);
linje("TAPT REDNING", rapport.taptRedning, o ? o.taptRedning : null);
console.log(`\nSkrevet til ${UT}`);
