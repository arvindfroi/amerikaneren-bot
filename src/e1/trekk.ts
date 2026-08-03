/**
 * E1s trekkuttrekk for kortspill.
 *
 * De 238 første indeksene er NØYAKTIG appens `NevroTrekk.spill` (se
 * src/nevro/trekk.ts). Det er bevisst: da er E1 mot NevroHjerne en
 * kontrollert sammenlikning – samme inngangsinformasjon, men bedre lærer
 * (eksakt dobbelt-dummy i stedet for destillert MesterAI) og større nett.
 *
 * Oppå ligger 35 ekstra trekk som VÅR motor kjenner og appens koding ikke
 * uttrykker: renonse-slutninger fra stikkhistorikken, hvilke kort som
 * fortsatt er ute, og fargefordelingen på egen hånd. Alt er lovlig
 * informasjon – utledet av offentlig stikkhistorikk og egen hånd, aldri av
 * skjulte hender, talongen eller andres vrak.
 *
 * MINNEBLOKKEN (v2, indeks 273–339) retter et hull som ble målt, ikke gjettet:
 * budvinneren tok opp talongen og vraket fire kort. De fire er DØDE – de kan
 * ikke ligge på noen hånd – og budvinneren er den eneste som vet hvilke.
 * Kodingen over utleder «hva er fortsatt ute» av egen hånd pluss åpent spilte
 * kort, så de fire døde telles alltid som levende.
 *
 * `examples/hukommelseshull.ts` målte hva det koster i informasjon: i 18,9 %
 * av budvinnerens kortvalg er det «høyeste kortet ute» i minst én farge et
 * kort budvinneren vraket selv. Nettet tror altså at en trussel lever, mens
 * spilleren rundt bordet husker at han la den ned.
 *
 * DET GJØR MER ENN Å KOSTE OPPSIDE. Fasiten vi trener mot – SD-orakelet – ER
 * vrak-bevisst (`src/moe2/synlig.ts`, `src/solver/sampler.ts`). Etiketten er
 * altså en funksjon av informasjon inngangen ikke kan uttrykke, og de
 * stillingene er ikke bare vanskelige: de er ULÆRBARE. Nettet kan bare midle
 * over dem, og middelet lekker som støy inn i nabostillingene.
 *
 * BAKOVERKOMPATIBELT MED VILJE. Indeks 0–272 er urørt og betyr NØYAKTIG det
 * samme som før, så nett trent på v1 (sd-r2.bin) leser fortsatt sin egen
 * verden. Rettelsene ligger i egne indekser ved siden av de gamle, ikke oppå
 * dem. `e1SpillTrekkFor(dim)` gir den bredden nettet faktisk ble trent med.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import { fyllPlanblokk, PLAN_ANTALL } from "./plan.ts";
import type { GameState } from "../motor.ts";
import { fargeIndeks, kortIndeks, SPILL_DIM, spillTrekk } from "../nevro/trekk.ts";

/** 238 fra appen + 35 egne. Kodingen sd-r2.bin og eldre nett ble trent med. */
export const E1_SPILL_DIM = SPILL_DIM + 35;

/** v1 + 67 minnetrekk. Kodingen nye nett trenes med. */
export const E1_SPILL_DIM_V2 = E1_SPILL_DIM + 67;
/**
 * v3 (indeks 340–355): HVEM som har spilt hvilke farger.
 *
 * HULLET, og det er det største som er funnet i kodingen. `src/nevro/trekk.ts`
 * legger alle spilte kort i ÉN blokk (52–103) uten å si hvem som spilte dem.
 * v1 legger til «spilte kort per farge» (242–245), men summert over alle fire
 * setene. Renonsflaggene (246–261) er BINÆRE – de fanger bare endepunktet,
 * «helt tom», ikke veien dit.
 *
 * Nettet kan derfor ikke skille «spillefører spilte tre spar, makkeren null»
 * fra «spillefører null, makkeren tre». Det er nøyaktig slutningen en
 * menneskelig forsvarer gjør hele tiden:
 *
 *   «Han har vist fem spar og to hjerter, og har tre kort igjen –
 *    altså har han høyst ett hjerte.»
 *
 * MesterAI får formen implisitt ved å sample verdener. Mennesket teller.
 * Adams har gjort ingen av delene.
 *
 * HVORFOR DET RAMMER FORSVARET HARDEST: en forsvarer må plassere
 * spillefløyens form for å vite om et ess holder eller blir trumfet.
 * Fasegapet mot MesterAI viser −0,12 poeng per runde i forsvarssetet, og
 * forsvaret vårt er målt til −0,051 ± 0,063 mot NevroHjernes – altså ikke
 * bedre, tross at nettet slår nevro med +1,07 totalt.
 *
 * LOVLIG INFORMASJON. Hvert stikk i historikken sier åpent hvem som la hvilket
 * kort. Dette er ren telling av det som ligger på bordet, ikke et blikk i
 * skjulte hender – samme klasse som renonsflaggene som alt finnes.
 *
 * INDEKSERINGEN ER RELATIV til setet, som resten av kodingen: rad 0 er meg
 * selv. Egen rad er utledbar fra egen hånd og bærer lite, men den er med
 * fordi uniform indeksering er mindre feilutsatt enn en hoppet rad – og
 * indeksfeil i denne fila har kostet dette prosjektet dyrt før.
 */
export const E1_SPILL_DIM_V3 = E1_SPILL_DIM_V2 + 16;

/**
 * v4 (indeks 356–363): AUKSJONEN. Hvor høyt hvert sete bød, og om det bød.
 *
 * HULLET. Fra hele budrunden koder `src/nevro/trekk.ts` inn i spillfasen bare
 * hvem som vant (208–211), hva tallbudet ble (225) og Amerikaner/solo. Selve
 * auksjonen – hvem som kjempet til 9 og ga seg, hvem som passet med en gang –
 * finnes ikke i kodingen, selv om `state.budrunde.sisteBud` ligger i staten
 * gjennom hele spillet.
 *
 * MÅLT, IKKE GJETTET (`examples/budhull.ts`, 3000 runder, 2026-08-03).
 * Stratifisert på vinnerbudet, så alle forsvarerne i et stratum møter samme
 * kontrakt, er forskjellen mellom forsvarere som bød høyt og lavt:
 *
 *   honnører på hånd  +0,288 ± 0,022  (13,3 SE)   ← sterkt signal
 *   stikk faktisk tatt +0,065 ± 0,026  ( 2,5 SE)   ← nesten ingenting
 *
 * Og honnørsignalet vokser med kontrakten: +0,026 ved vinnerbud 8, +0,275 ved
 * 9, +0,477 ved 10.
 *
 * DEN SPREKKEN ER HELE POENGET, og målingen kan ikke lukke den. Enten er det
 * å vite at en forsvarer har et ekstra ess lite handlingsbart, ELLER så er det
 * handlingsbart og agenten som spilte klarte ikke å bruke det – fordi den ikke
 * kan se det. Gate 2 avgjør. Målingen sier bare at signalet FINNES og at
 * kodingen er blind for det.
 *
 * IKKE FORVEKSL MED BUDMODELLEN. `bud-gbt.json` avgjør hva Adams SELV byr.
 * Dette er noe annet: hva de ANDRE bød, brukt som informasjon under kortspill.
 */
export const E1_SPILL_DIM_V4 = E1_SPILL_DIM_V3 + 8;

/**
 * v5 (indeks 364–375): PLANBLOKKEN – kontraktsregnskapet, eksplisitt.
 *
 * Se `src/e1/plan.ts` for hele begrunnelsen. Kort: nettet ser budet, lagets
 * stikk og stikk igjen, men ikke DIFFERANSEN – og poengreglene har et brått
 * hopp nøyaktig der, siden overstikk ikke gir budlaget noe. Blokken er en ren
 * funksjon av de 364 første trekkene, så den finnes bare ett sted og kan legges
 * på ferdige datarader uten ny generering.
 */
export const E1_SPILL_DIM_V5 = E1_SPILL_DIM_V4 + PLAN_ANTALL;

const BASIS = SPILL_DIM;
/** Der minneblokken begynner. */
const MINNE = E1_SPILL_DIM;
/** Der telleblokken begynner. */
const TELL = E1_SPILL_DIM_V2;
/** Der auksjonsblokken begynner. */
const AUKSJON = E1_SPILL_DIM_V3;

/**
 * Motpartens sete sett fra `sete` (0 = meg selv, 1 = neste i tur, …).
 *
 * Samme definisjon som `rel` i `src/nevro/trekk.ts`, som ikke er eksportert.
 * Den er gjentatt her framfor å eksporteres, fordi appens koding (0–237) er
 * en KONTRAKT mot NevroVekter.swift: endres eksportflaten der, er det lett å
 * komme til å endre noe som må stå fast. Kopien er tre linjer og testes mot
 * originalen i test/e1-telleblokk.test.ts.
 */
const relSete = (sete: number, annet: number): number => (annet - sete + 4) % 4;

/** Alle kort som er spilt åpent denne runden (historikk + bordet). */
function spilteKort(state: GameState): Kort[] {
  const ut: Kort[] = [];
  for (const stikk of state.historikk) for (const kp of stikk.kort) ut.push(kp.kort);
  for (const kp of state.bord) ut.push(kp.kort);
  return ut;
}

/**
 * Renonse: setet fulgte ikke farge i et stikk der den ble etterspurt.
 * Utledes av den offentlige stikkhistorikken – nøyaktig den slutningen en
 * oppmerksom menneskespiller gjør, og den PIMC-sampleren allerede bruker.
 */
function renonser(state: GameState): boolean[][] {
  const ut = [0, 1, 2, 3].map(() => [false, false, false, false]);
  const stikkene = [...state.historikk.map((s) => s.kort), ...(state.bord.length > 0 ? [state.bord] : [])];
  for (const stikk of stikkene) {
    const led = stikk[0]?.kort.farge;
    if (led === undefined) continue;
    for (const kp of stikk) {
      if (kp.kort.farge !== led) ut[kp.spiller]![fargeIndeks(led)] = true;
    }
  }
  return ut;
}

export function e1SpillTrekk(state: GameState, sete: number, dim: number = E1_SPILL_DIM): Float32Array {
  const v = new Float32Array(dim);
  v.set(spillTrekk(state, sete), 0);

  const hånd = state.hender[sete] ?? [];
  const spilt = spilteKort(state);

  // 238–241: egen fargefordeling.
  for (const k of hånd) v[BASIS + fargeIndeks(k.farge)]! += 1 / 13;
  // 242–245: hvor mange kort som er spilt i hver farge.
  for (const k of spilt) v[BASIS + 4 + fargeIndeks(k.farge)]! += 1 / 13;

  // 246–261: renonse per RELATIVT sete × farge (egen rad er alltid 0).
  const ren = renonser(state);
  for (let s = 0; s < 4; s++) {
    const r = (s - sete + 4) % 4;
    for (let f = 0; f < 4; f++) if (ren[s]![f]) v[BASIS + 8 + r * 4 + f] = 1;
  }

  // 262–265: høyeste kort som fortsatt er ute i hver farge (0 = ingen igjen).
  // 266–269: hvor mange kort som fortsatt er ute i hver farge.
  const sett = new Set<string>();
  for (const k of hånd) sett.add(`${k.farge}${k.verdi}`);
  for (const k of spilt) sett.add(`${k.farge}${k.verdi}`);
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    let høyest = 0;
    let antall = 0;
    for (let verdi = 2; verdi <= 14; verdi++) {
      if (sett.has(`${farge}${verdi}`)) continue;
      antall++;
      if (verdi > høyest) høyest = verdi;
    }
    v[BASIS + 24 + f] = høyest === 0 ? 0 : (høyest - 2) / 12;
    v[BASIS + 28 + f] = antall / 13;
  }

  // 270: stikk igjen. 271: har jeg utspillet? 272: bias.
  v[BASIS + 32] = (state.giving.antallStikk - state.stikkSpilt) / 13;
  v[BASIS + 33] = state.bord.length === 0 ? 1 : 0;
  v[BASIS + 34] = 1;

  if (dim <= E1_SPILL_DIM) return v;

  // --- MINNEBLOKKEN (v2) --------------------------------------------------
  // Bare budvinneren har SETT vraket. For alle andre er blokkens kjente del
  // tom, og det er riktig: de vet at fire kort er døde, ikke hvilke.
  const erBudvinner = sete === state.budvinner;
  const mittVrak = erBudvinner ? state.vrak : [];
  const dødt = new Set<string>();
  for (const k of mittVrak) dødt.add(`${k.farge}${k.verdi}`);

  // 273–276: eget vrak per farge. 277–328: eget vrak, ett kort per indeks.
  for (const k of mittVrak) {
    v[MINNE + fargeIndeks(k.farge)]! += 1 / 4;
    v[MINNE + 4 + kortIndeks(k)] = 1;
  }

  // 329–332 / 333–336: samme to spørsmål som 262–269, men med de døde
  // kortene trukket fra. For alle andre enn budvinneren er de identiske med
  // originalene – da er det ingenting å rette.
  let levendeUte = 0;
  for (let f = 0; f < 4; f++) {
    const farge = FARGER[f] as Farge;
    let høyest = 0;
    let antall = 0;
    for (let verdi = 2; verdi <= 14; verdi++) {
      const id = `${farge}${verdi}`;
      if (sett.has(id) || dødt.has(id)) continue;
      antall++;
      if (verdi > høyest) høyest = verdi;
    }
    v[MINNE + 56 + f] = høyest === 0 ? 0 : (høyest - 2) / 12;
    v[MINNE + 60 + f] = antall / 13;
    levendeUte += antall;
  }

  // 337: hvor mange kort som VIRKELIG er i spill hos de andre. Budvinneren
  // kjenner tallet eksakt; de andre vet bare at talongens fire er borte, og
  // det trekkes fra her – ellers tror kodingen at 40 kort er i omløp når 36
  // er det.
  const usett = levendeUte - (erBudvinner ? 0 : state.giving.talong);
  v[MINNE + 64] = Math.max(0, usett) / 39;
  // 338: vet jeg HVILKE kort som er døde?
  v[MINNE + 65] = erBudvinner ? 1 : 0;
  // 339: er minneblokken i det hele tatt fylt ut? Alltid 1 i spill. Treneren
  // setter den til 0 på gamle rader som ble merket før blokken fantes, slik
  // at nullene der leses som «ukjent» og ikke som «ingen døde kort».
  v[MINNE + 66] = 1;

  if (dim <= E1_SPILL_DIM_V2) return v;

  // --- TELLEBLOKKEN (v3, 340–355) ------------------------------------------
  // Hvor mange kort av hver farge HVERT sete har lagt, relativt til meg.
  // Rad r, farge f ligger på TELL + r * 4 + f.
  //
  // Både historikken og bordet telles: kortene som ligger ute NÅ er like
  // offentlige som de som er samlet inn, og en forsvarer som skal plassere
  // formen bruker begge.
  //
  // Normalisert på 13 som resten av kodingen, så en full farge blir 1.
  for (const stikk of state.historikk) {
    for (const kp of stikk.kort) {
      v[TELL + relSete(sete, kp.spiller) * 4 + fargeIndeks(kp.kort.farge)]! += 1 / 13;
    }
  }
  for (const kp of state.bord) {
    v[TELL + relSete(sete, kp.spiller) * 4 + fargeIndeks(kp.kort.farge)]! += 1 / 13;
  }

  if (dim <= E1_SPILL_DIM_V3) return v;

  // --- AUKSJONSBLOKKEN (v4, 356–363) ---------------------------------------
  // Per relativt sete: hvor høyt det bød, og om det bød i det hele tatt.
  //
  // `state.budrunde.sisteBud` overlever inn i spillfasen (avsluttBudrunde
  // rører den ikke), så informasjonen har ligget i staten hele tiden – bare
  // ikke i kodingen.
  //
  // Normaliseringen deler på 13 som resten av blokken, ikke på budets eget
  // spenn. Det er bevisst: budene er stikkantall, og 8 skal bety det samme
  // her som v[225] og v[229] betyr.
  for (let s = 0; s < 4; s++) {
    const b = state.budrunde.sisteBud[s];
    const r = relSete(sete, s);
    if (typeof b === "number") {
      v[AUKSJON + r * 2] = b / 13;
      v[AUKSJON + r * 2 + 1] = 0;
    } else {
      // «Bød aldri» er ikke det samme som «bød 0», og et nett kan ikke skille
      // dem hvis begge koder til 0. Egen flaggkolonne.
      v[AUKSJON + r * 2] = 0;
      v[AUKSJON + r * 2 + 1] = 1;
    }
  }

  if (dim <= E1_SPILL_DIM_V4) return v;

  // --- PLANBLOKKEN (v5, 364–375) -------------------------------------------
  // Regnes av de 364 foregående, ikke av `state`. Samme funksjon brukes til å
  // utvide ferdige datarader, så de to kan ikke komme i utakt.
  fyllPlanblokk(v);
  return v;
}
