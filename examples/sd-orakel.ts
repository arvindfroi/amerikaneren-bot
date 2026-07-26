/**
 * SD-ORAKELET: treningsdata der kortverdien kommer fra SINGLE-DUMMY-evaluering,
 * ikke fra dobbelt-dummy-solveren.
 *
 *   node examples/sd-orakel.ts --skard 0/16 --kamper 200
 *
 * HVORFOR DENNE FINNES. E1 er destillert fra DD-orakelet. Den treffer orakelet
 * 61,4 % mot NevroHjernes 58,7 % og taper likevel 2,91 ± 0,06 poeng per kamp
 * (tegntest 9 av 599). Læreren var feil, ikke eleven. Målt direkte med
 * godkjenningsporten 2026-07-25:
 *
 *   fasit                       korrigert korrelasjon mot poeng
 *   kortspill, double dummy     −0,609   AVVIST (feil fortegn)
 *   kortspill, single dummy     +0,718   GODKJENT
 *
 * Fortegnet snur i syv av åtte stikkvinduer. Med 12 verdener snur også det
 * tidlige vinduet, fra −0,88 til +0,22 poeng/runde; 32 verdener gir ingenting
 * utover 12. Derfor er standarden her 12 – det er det MÅLTE nivået, og
 * verdenstallet skrives inn i hver linje som `sdVerdener` så data fra ulike
 * innstillinger ikke kan blandes i en trening uten at det synes.
 *
 * FORMATET er NØYAKTIG det `examples/e1-orakel.ts` skriver: `t` (E1-vektoren,
 * 273 trekk), `nt` (NEAT-vektoren, 318 trekk), `v` (kortindeks → verdi), `n`,
 * `frø`, `stikk`. Da virker `verktoy/e1-tren.py` uendret, og SD-data kan
 * sammenlignes direkte mot DD-data på samme trener. `dybde` finnes ikke her
 * (SD har ingen søkedybde) og er byttet ut med `sdVerdener`.
 *
 * KJENT SKJEVHET, som skal stå her og ikke oppdages senere: stillingene kommer
 * fra NEVROS spilling, som resten av benken. En agent trent på disse dataene
 * kommer til å møte ANDRE stillinger enn dem den er trent på, fordi den spiller
 * annerledes enn nevro. Det er nøyaktig distribution shift-en som gjorde
 * anger-trening på nevro-stillinger 105 poeng SVAKERE for D5 (se `--spiller` i
 * e1-orakel.ts). Utforskningen (`--utforsk`) demper det, men fjerner det ikke.
 * Riktig kur er DAgger: hent runde to av dataene fra SD-agentens EGEN spilling.
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--ut` | sd-data/skard-«i».jsonl | varig logg, én linje per merket stilling |
 * | `--kamper` | 200 | antall partier denne prosessen spiller |
 * | `--froe` | 50000000 | frøbase (skardet legges til, så skardene er disjunkte) |
 * | `--skard` | 0/1 | «i/n» – i-te av n prosesser; deler frørommet |
 * | `--verdener` | 12 | verdener SD-evalueringen sampler per beslutning |
 * | `--sjanse` | 0.35 | andel kortvalg som merkes (resten spilles bare) |
 * | `--utforsk` | 0.15 | andel trekk der spilleren velger tilfeldig, for spredning |
 * | `--fraStikk` | 0 | merk bare stillinger fra og med dette stikket |
 * | `--maks` | 0 | stopp etter så mange merkede stillinger (0 = ingen grense) |
 *
 * Skrivingen skjer linje for linje til fil (append + flush). Kjøringer som
 * varer i timer må aldri ha resultatene sine i et rør: et avbrudd skal koste
 * den siste linjen, ikke alt.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "../src/e1/trekk.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { vurderKortSD } from "../src/moe2/sdkort.ts";
import { kortIndeks, NevroAgent } from "../src/nevro/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagInn } from "../src/neat/trekk.ts";

let utFil: string | null = null;
let kamper = 200;
// Frørommet ligger med vilje langt unna e1-orakelets (300 000 + skard × 1 000 000,
// altså opp til ~15,3 mill.) og portenes (8,1/8,6 mill.). Delte frø ville gitt
// SD- og DD-settene overlappende givere, og dermed lekkasje den dagen et nett
// trent på det ene måles på en holdout skåret av det andre.
let frøBase = 50_000_000;
let skardI = 0;
let skardN = 1;
let verdener = 12;
/**
 * DAgger: hvem som SPILLER partiene, altsaa hvor stillingene kommer fra.
 *
 * Runde 1 brukte nevro som stillingskilde. Nettet som ble trent paa det moeter
 * ANDRE stillinger naar det spiller selv - det er fordelingsskiftet DAgger
 * finnes for aa lukke. Maalt paa sd-r1: +75,28 mot nevros +75,40, altsaa 96 %
 * av gapet lukket, men ikke forbi.
 *
 * MERK at dette bare bytter STILLINGSKILDEN. Motstandermodellen i
 * SD-rolloutene er fortsatt NevroHjerne, fordi det er noeyaktig den
 * konfigurasjonen fasiten ble validert med (+0,718 gjennom porten). Endrer vi
 * begge samtidig, vet vi ikke hvilken av dem som forklarte utfallet.
 */
let spillerFil: string | null = null;
let sjanse = 0.35;
/**
 * ROLLEVEKT: hvor mye oftere spillefoererens stillinger merkes.
 *
 * MAALT 26. juli paa 1498 runder mot MesterAI, rolledekomponert:
 *
 *   rolle          andel av sete-runder   andel av TOTALTAPET
 *   spillefoerer            25 %                  104 %
 *   makker                  25 %                   -7 %
 *   forsvarer               50 %                    2 %
 *
 * Hele gapet ligger i ÉN av tre roller. Makker og forsvar er noeytrale eller
 * i vaar favoer. Likevel merker generatoren i dag alle roller likt, saa tre
 * fjerdedeler av dataene gaar til stillinger der vi ikke taper noe.
 *
 * Med rollevekt 3 merkes spillefoererens stillinger tre ganger saa ofte.
 * Rollen forblir representert - vi kutter ikke de andre, for et nett som
 * glemmer forsvar taper det vi alt har.
 */
let rolleVekt = 3;
let utforsk = 0.15;
let fraStikk = 0;
let maks = 0;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--ut") utFil = process.argv[++i] ?? utFil;
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--skard") {
    const [i2, n2] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(i2);
    skardN = Number(n2);
  } else if (a === "--verdener") verdener = Number(process.argv[++i]);
  else if (a === "--spiller") spillerFil = process.argv[++i] ?? null;
  else if (a === "--sjanse") sjanse = Number(process.argv[++i]);
  else if (a === "--rollevekt") rolleVekt = Number(process.argv[++i]);
  else if (a === "--utforsk") utforsk = Number(process.argv[++i]);
  else if (a === "--fraStikk") fraStikk = Number(process.argv[++i]);
  else if (a === "--maks") maks = Number(process.argv[++i]);
}

// EGEN UTMAPPE. `verktoy/e1-tren.py` leser alle `skard-*.jsonl` i en mappe og
// blander dem uten å se på innholdet. Havner SD-linjer i e1-data/, er begge
// datasettene ødelagt uten at noe feiler – de har jo samme format.
const ut = utFil ?? `sd-data/skard-${skardI}.jsonl`;
mkdirSync(dirname(ut), { recursive: true });

// Nevro er BÅDE den som spiller partiene (stillingskilden) og motstander-
// modellen SD-evalueringen spiller verdenene ferdig med. Det er ikke en
// forglemmelse: SD-fasiten som bestod porten var definert med NevroHjerne i
// alle fire seter, og en fasit skal genereres med nøyaktig den modellen den
// ble validert med.
const nevro = new NevroAgent();
/**
 * Stillingskilden. Standard er nevro (runde 1); med --spiller er det nettet
 * som selv skal laere, og da er dette DAgger-runde 2.
 */
const spiller = spillerFil !== null ? E1Agent.fraFil(spillerFil) : nevro;
// SKRIV HVEM SOM SPILLER. To ganger i dag har noe staatt «koblet» uten aa
// vaere i bruk (muterRettet, spillFasit), og begge gangene fordi ingen linje
// sa hva som faktisk kjoerte.
console.log(
  `stillingskilde: ${spillerFil ?? "NevroHjerne"}` +
    `  |  motstandermodell i SD-rollout: NevroHjerne  |  ${verdener} verdener`,
);
const rng = lagRng((frøBase + skardI * 7919) >>> 0);
let merket = 0;
let beslutninger = 0;
const t0 = performance.now();

alleKamper: for (let k = 0; k < kamper; k++) {
  // Skardene deler frørommet, så to prosesser aldri spiller samme parti.
  const frø = frøBase + skardI * 1_000_000 + k;
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 30) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    let h: Handling;
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const lovlige = lovligeKort(s, sete);
      beslutninger++;
      // Spillefoereren er 25 % av stillingene og 104 % av tapet - se rolleVekt.
      const erFoerer = s.budvinner === sete;
      const p = Math.min(1, sjanse * (erFoerer ? rolleVekt : 1));
      if (lovlige.length >= 2 && s.stikkSpilt >= fraStikk && rng() < p) {
        const vurdert = vurderKortSD(s, sete, nevro, { verdener, rng });
        // Tom liste = ingen verden lot seg trekke. Da skal INGENTING skrives:
        // å behandle «ingen data» som «alle valg er like gode» var mekanismen
        // som gjorde `lærForsvar` verre enn ingenting.
        if (vurdert.length > 0) {
          // Verdiene lagres per KORTINDEKS (0–51), så treneren slipper å
          // kjenne rekkefølgen lovligeKort tilfeldigvis hadde.
          const verdi: Record<number, number> = {};
          for (const v of vurdert) verdi[kortIndeks(v.kort)] = Math.round(v.verdi * 1000) / 1000;
          appendFileSync(
            ut,
            JSON.stringify({
              // De to trekkvektorene er ulike kodinger – `t` er 273 (appens 238
              // + 35 egne), `nt` er NEATs 318 – og de er LETTE å forveksle: tre
              // feil på én dag kom av nettopp det. Uten begge kan ikke
              // NEAT-genomer scores på angerbenken.
              t: Array.from(e1SpillTrekk(s, sete), (x) => Math.round(x * 10_000) / 10_000),
              nt: lagInn(spillerVisning(s, sete), "SPILL", s.giving.antallStikk, s.regler.målPoeng).map(
                (x) => Math.round(x * 10_000) / 10_000,
              ),
              v: verdi,
              // `n` = verdener som faktisk lot seg trekke, samme betydning som i
              // e1-orakel. `sdVerdener` = det BESTILTE antallet, som er
              // innstillingen data fra ulike kjøringer ikke må blandes på tvers
              // av. De to er som regel like, men ikke alltid.
              n: vurdert[0]!.n,
              sdVerdener: verdener,
              frø,
              stikk: s.stikkSpilt,
            }) + "\n",
          );
          merket++;
          if (maks > 0 && merket >= maks) break alleKamper;
        }
      }
      // Utforskning gir bredere stillinger enn ren nett-policy ville gitt.
      h =
        rng() < utforsk
          ? { type: "SPILL", spiller: sete, kort: lovlige[Math.floor(rng() * lovlige.length)]! }
          : spiller.velgHandling(s);
    } else {
      // Bud, vrak og trumfvalg tas alltid av nevro - ogsaa i DAgger-runden.
      // Det er de fasene sd-nettet ikke eier, og aa la det bestemme dem ville
      // endret kontraktfordelingen og dermed hva stillingene er.
      h = nevro.velgHandling(s);
    }
    s = utfør(s, h).state;
  }
  const brukt = (performance.now() - t0) / 1000;
  console.log(
    `parti ${k + 1}/${kamper} (skard ${skardI}/${skardN}) – ${merket} merkede stillinger av ${beslutninger} kortvalg, ` +
      `${brukt.toFixed(0)}s, ${(merket / Math.max(1, brukt)).toFixed(2)}/s`,
  );
}

console.log(
  `Ferdig: ${merket} stillinger à ${E1_SPILL_DIM} trekk, SD med ${verdener} verdener → ${ut}`,
);
