/**
 * T0.1 — BUDKORPUS VED EKTE AUKSJONSSTILLINGER.
 *
 *   node examples/budkorpus-auksjon.ts --hender 4000 --skard 0/12
 *
 * ================= HVORFOR DAGENS KORPUS IKKE KAN BRUKES ==================
 *
 * `BUD_DIM_V2` (140 trekk) legger BUDRUNDEN til budmodellen: de tre andres bud
 * på relativt sete, passflagg, høyeste bud, hvor mange som kan overby. Den er
 * bygget, versjonert og testet — og **aldri trent**, fordi korpuset ikke lar
 * seg trene på:
 *
 *     budkvant.ts:335   const mal = opprettSpill(...)          <- FERSK giv
 *     budkvant.ts:336   const sete = (mal.giver + 1) % 4       <- FØRSTE budgiver
 *
 * Hver eneste rad står altså i en TOM auksjon, i det ene setet der ingen har
 * rukket å by. Indeks 128–139 ville vært null i hele korpuset, og modellen
 * ville lært at blokken ikke betyr noe — akkurat slik minne- og telleblokken
 * ble lært bort da de var døde.
 *
 * ================= DET SOM ER LETT Å GJØRE FEIL HER =======================
 *
 * Å bare samle stillinger med bud i seg holder IKKE. Etiketten må være
 * BETINGET PÅ AUKSJONEN, ellers er blokken like verdiløs som før:
 *
 *   Trekker vi motstandernes hender fritt og limer de observerte budene på
 *   etterpå, er stikkfordelingen den samme uansett hva som ble bydd. Trekkene
 *   varierer, etiketten gjør ikke — og gradienten på indeks 128–139 er null i
 *   forventning. Modellen ville lært å ignorere dem, og vi ville målt «v2 gir
 *   ingenting» på en måling som ikke kunne gitt noe annet.
 *
 * Derfor FORKASTNINGSTREKKING: hver omtrekking spiller budrunden fra starten
 * med policyen, og beholdes bare hvis den produserer NØYAKTIG det observerte
 * budprefikset. Da er de andres hender trukket fra fordelingen betinget på
 * auksjonen, som er hele poenget. Aksepteringsraten logges per rad, slik at
 * en rad med sjelden auksjon ikke kan late som den har like mange trekninger.
 *
 * ================= HVA SOM LAGRES =========================================
 *
 * `frø` + `budprefiks` + `sete` bestemmer stillingen ENTYDIG, så treneren kan
 * bygge `budTrekk(s, sete, 140)` selv. Vi lagrer altså ikke trekkvektoren —
 * samme valg som `budmodell.ts` gjør, og av samme grunn: da kan kodingen
 * utvides uten å regenerere korpuset.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { kortId, lagRng, nyStokk, stokk, type Kort } from "../src/kort.ts";
import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type GameState,
  type Handling,
} from "../src/index.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const HENDER = tall(arg("--hender", "4000"), 4000, "hender");
const FRØ = tall(arg("--froe", "310000000"), 310_000_000, "froe");
const TREKNINGER = tall(arg("--trekninger", "24"), 24, "trekninger");
/** Tak på forkastninger per godkjent trekning. Uten det kan en sjelden
 *  auksjon spise hele budsjettet på én rad. */
const FORSØKSTAK = tall(arg("--forsoekstak", "40"), 40, "forsoekstak");
const skardTekst = arg("--skard", "0/1").split("/");
const SKARD_I = tall(skardTekst[0], 0, "skard-i");
const SKARD_N = tall(skardTekst[1], 1, "skard-n");
const UT = arg("--ut", `bud-auksjon/skard-${SKARD_I}.jsonl`);

mkdirSync(dirname(UT), { recursive: true });

/** Bud kodet som i `budTrekk`: tall, eller "PASS"/"AMERIKANER"/"SOLO". */
type BudKode = number | string;

const nyeAgenter = () => [0, 1, 2, 3].map(() => lagIndre(ADAMS));

/** Budsekvensen som er lagt så langt, i tur-rekkefølge fra første budgiver. */
function prefiksAv(logg: readonly { spiller: number; bud: BudKode }[]): string {
  return logg.map((b) => `${b.spiller}:${b.bud}`).join(",");
}

/** Erstatter alle hender unntatt `sete` med en tilfeldig omdeling. */
function omtrekk(mal: GameState, sete: number, hånd: readonly Kort[], rng: () => number): GameState {
  const mine = new Set(hånd.map(kortId));
  const resten = stokk(
    nyStokk().filter((k) => !mine.has(kortId(k))),
    rng,
  );
  const h2 = mal.hender.map((h, i) => (i === sete ? hånd.slice() : h.slice()));
  let j = 0;
  for (let p = 0; p < mal.antallSpillere; p++) {
    if (p === sete) continue;
    h2[p] = resten.slice(j, j + (mal.hender[p] ?? []).length);
    j += (mal.hender[p] ?? []).length;
  }
  // TALONG, IKKE VRAK. `vrak` er kortene budvinneren KASTER etter aa ha tatt
  // opp talongen; `talong` er de udelte kortene. Setter man `vrak` her, gaar
  // boten inn i VRAK-fasen med en talong den allerede har «kastet», og
  // konvensjonsvakten faller paa `likeKort(undefined, ...)`. Feilen var
  // hoeylytt, som den skal.
  return { ...mal, hender: h2, talong: resten.slice(j, j + mal.giving.talong) };
}

/**
 * Spiller budrunden fra `giv`.
 *
 * VAART sete replayer sine EGNE observerte bud (`mineBud`) saa lenge de rekker,
 * og byr deretter `refBud` ved sin foerste frie tur. Alle andre seter spiller
 * policyen sin.
 *
 * DET ER DENNE KONSTRUKSJONEN SOM GJOER BETINGINGEN RIKTIG, og foerste utgave
 * hadde den feil: der bydde vaart sete `refBud` med en gang, ogsaa der det
 * observerte prefikset hadde oss til aa passe. Prefikset spriket dermed i
 * foerste tur, aksepteringsraten ble null, og generatoren skrev 0 rader fra 37
 * stillinger. Feilen var stille i den forstand at den saa ut som «sjelden
 * auksjon» - den ble bare synlig fordi tallet var NULL og ikke lavt.
 */
function budrunde(
  giv: GameState,
  sete: number,
  mineBud: readonly BudKode[],
  refBud: number | null,
): { s: GameState; logg: { spiller: number; bud: BudKode }[] } {
  const ag = nyeAgenter();
  let s = giv;
  let egne = 0;
  let bydd = false;
  const logg: { spiller: number; bud: BudKode }[] = [];
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    let h: Handling;
    if (s.iTur === sete) {
      const lov = lovligeHandlinger(s);
      if (egne < mineBud.length) {
        // Replay av vaart eget observerte bud.
        h = { type: "BUD", spiller: sete, bud: mineBud[egne] as never };
        egne++;
      } else if (refBud === null) {
        h = { type: "BUD", spiller: sete, bud: "PASS" };
      } else {
        /**
         * LAVESTE LOVLIGE TALLBUD, ikke et fast referansebud.
         *
         * Foerste utgave bod alltid 9. I en TOM auksjon vinner det som regel,
         * og det er nettopp derfor `budkvant.ts` slipper unna med det - den
         * staar bare i tomme auksjoner. Men her staar vi ogsaa ETTER at noen
         * har bydd 10, og da er 9 ulovlig: `kan` ble usann, setet passet, og
         * `vant` ble 0 i 13 av 14 stillinger. Etiketten fantes ikke.
         *
         * Stikktallet laget tar er omtrent uavhengig av HVILKEN kontrakt vi
         * spiller, saa det laveste lovlige budet er det som gir flest
         * observasjoner uten aa endre stoerrelsen vi maaler.
         */
        // GULV PAA 9. Rent laveste lovlige bud vinner ikke auksjonen som
        // FOERSTE budgiver: der er laveste lovlige 7-8, og alle overbyr med
        // 9-10. Maalt: `vant` = 0 i hver eneste foerstebudgiver-stilling, mens
        // stillinger etter et bud fikk 6 av 6. Ni er ogsaa referansen
        // `budkvant.ts` bruker, saa den tomme auksjonen faar samme etikett som
        // foer og radene er sammenliknbare.
        const lovligeTall = lov.fase === "BUDRUNDE"
          ? lov.bud.filter((b): b is number => typeof b === "number").sort((a, b) => a - b)
          : [];
        const tall = bydd ? undefined : (lovligeTall.find((b) => b >= 9) ?? lovligeTall[0]);
        if (tall !== undefined) bydd = true;
        h = { type: "BUD", spiller: sete, bud: tall ?? "PASS" };
      }
    } else {
      h = ag[s.iTur]!.velgHandling(s);
    }
    if (h.type === "BUD") logg.push({ spiller: h.spiller, bud: h.bud as BudKode });
    s = utfør(s, h).state;
  }
  return { s, logg };
}

/** Spiller runden ferdig med policyen i alle seter. */
function spillUt(s0: GameState): GameState {
  const ag = nyeAgenter();
  let s = s0;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }
  return s;
}

const rng = lagRng((FRØ + SKARD_I * 7919) >>> 0);
let rader = 0;
let stillinger = 0;

for (let h = 0; h < HENDER; h++) {
  if (h % SKARD_N !== SKARD_I) continue;
  const frø = (FRØ + h) >>> 0;
  const start = opprettSpill({ antallSpillere: 4 }, frø);
  if (start.fase !== "BUDRUNDE") continue;

  // 1. SPILL DEN EKTE AUKSJONEN og noter hver stilling der et sete skal by.
  const ag = nyeAgenter();
  let s: GameState = start;
  const logg: { spiller: number; bud: BudKode }[] = [];
  const punkter: { sete: number; prefiks: string; hånd: Kort[]; mine: BudKode[] }[] = [];
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    punkter.push({
      sete: s.iTur,
      prefiks: prefiksAv(logg),
      hånd: (s.hender[s.iTur] ?? []).slice(),
      mine: logg.filter((b) => b.spiller === s.iTur).map((b) => b.bud),
    });
    const hh = ag[s.iTur]!.velgHandling(s);
    if (hh.type === "BUD") logg.push({ spiller: hh.spiller, bud: hh.bud as BudKode });
    s = utfør(s, hh).state;
  }

  for (const p of punkter) {
    if (p.hånd.length === 0) continue;
    stillinger++;

    // 2. FORKASTNINGSTREKKING: bare omdelinger som ville gitt SAMME budprefiks.
    //    Det er dette som gjør etiketten betinget paa auksjonen.
    const stikk: number[] = [];
    const passDiff: number[] = [];
    let vant = 0;
    let forsøk = 0;
    let godkjent = 0;
    const tak = TREKNINGER * FORSØKSTAK;

    while (godkjent < TREKNINGER && forsøk < tak) {
      forsøk++;
      const giv = omtrekk(start, p.sete, p.hånd, rng);

      // Referansebudet er 9 - det budet familien faktisk strides om, og det
      // budet `vant[N]`-tabellen er mest feilkalibrert paa (35,3 % maalt mot
      // 9,7 % i selvspill).
      const a = budrunde(giv, p.sete, p.mine, 1);
      // AKSEPTERING: de foerste budene i den omtrukne auksjonen maa vaere
      // NOEYAKTIG de observerte. Vaart eget sete replayer sine, saa det som
      // faktisk testes er om MOTSTANDERNES hender er forenlige med det de bod.
      const lengde = p.prefiks === "" ? 0 : p.prefiks.split(",").length;
      if (prefiksAv(a.logg.slice(0, lengde)) !== p.prefiks) continue;

      godkjent++;
      if (a.s.budvinner === p.sete) {
        vant++;
        const f = spillUt(a.s);
        const st = f.stikkVunnet;
        stikk.push((st[p.sete] ?? 0) + (f.makker !== null && f.makker !== p.sete ? (st[f.makker] ?? 0) : 0));
      }
      // PASSARMEN: hva er runden verdt hvis vi lar den gaa?
      const b = budrunde(giv, p.sete, p.mine, null);
      if (b.s.budvinner !== null) {
        const f = spillUt(b.s);
        const po = f.totalPoeng;
        const egne = po[p.sete] ?? 0;
        passDiff.push(Math.round((egne - (po.reduce((x, y) => x + y, 0) - egne) / 3) * 1000) / 1000);
      }
    }

    // Ingen godkjente trekninger = ingen data. AA SKRIVE RADEN LIKEVEL, med
    // tomme lister, ville gitt treneren en «etikett» som bare er stoey - samme
    // feil som `laerForsvar` gjorde da «ingen data» ble lest som «alt er likt».
    // `DIAG=1` skriver hver stilling. Det var den som fant BEGGE feilene:
    // foerst at aksepteringen var null (feil betinging), saa at `vant` var
    // null (ulovlig referansebud). Uten den saa begge ut som «0 rader».
    if (process.env.DIAG) {
      console.log(
        `  sete ${p.sete} prefiks«${p.prefiks}» mine[${p.mine.join("|")}] ` +
          `-> godkjent ${godkjent}/${forsøk}, vant ${vant}, stikk ${stikk.length}`,
      );
    }
    if (stikk.length < 3) continue;

    appendFileSync(
      UT,
      JSON.stringify({
        frø,
        sete: p.sete,
        prefiks: p.prefiks,
        stikk,
        passDiff,
        // AKSEPTERINGSRATEN. En rad med sjelden auksjon har faerre effektive
        // trekninger enn tallet paa `stikk` antyder, og treneren maa kunne
        // vekte den ned. Uten dette feltet ser en rad med 3 av 960 forsoek ut
        // som en rad med 24 av 24.
        godkjent,
        forsøk,
        vant,
      }) + "\n",
    );
    rader++;
  }

  if (rader > 0 && h % 200 === 0) {
    console.log(`skard ${SKARD_I}: ${rader} rader fra ${stillinger} stillinger`, { flush: true });
  }
}

console.log(`Skard ${SKARD_I} ferdig: ${rader} rader fra ${stillinger} stillinger → ${UT}`);
