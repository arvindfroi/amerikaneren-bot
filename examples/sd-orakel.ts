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
 * | `--motpart` | nevro | rollout-policyen SD spiller verdenene ferdig med |
 *
 * Skrivingen skjer linje for linje til fil (append + flush). Kjøringer som
 * varer i timer må aldri ha resultatene sine i et rør: et avbrudd skal koste
 * den siste linjen, ikke alt.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { lovligeHandlinger, lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { e1SpillTrekkMedTro, E1_SPILL_DIM, E1_SPILL_DIM_V8, E1_SPILL_DIM_V9 } from "../src/e1/trekk.ts";
import { LOVLIGE_BREDDER } from "../src/e1/agent.ts";
import { Trosnett } from "../src/moe2/trosnett.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { vurderKortSD } from "../src/moe2/sdkort.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
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
/**
 * 1, IKKE 3.
 *
 * Treeren ble valgt da spillefoereren bar 104 % av gapet mot MesterAI. Han
 * baerer 0 % naa (maalt 3. august), og planen sa allerede «all videre
 * generering bruker 1» - men standardverdien her sto igjen paa 3.
 *
 * Foelgen, oppdaget 4. august etter at 587 000 rader var generert: korpuset
 * fikk 52,8 % foererrader mot naturlige 25 %. Forsvars- og makkerstillinger
 * ble undersamplet i selve dataene, og da kan ingen vekting i TAPET reparere
 * det - dekningen finnes rett og slett ikke.
 *
 * En standardverdi som motsier planen er verre enn ingen standardverdi: den
 * virker, den krasjer ikke, og den gjoer noe annet enn det som staar skrevet.
 */
let rolleVekt = 1;
let utforsk = 0.15;
let fraStikk = 0;
let maks = 0;
let motpartSpek = "nevro";
/**
 * BUDSPREDNING: andel runder der kontrakten TVINGES til et trukket bud i
 * stedet for å overlates til nevros budrunde.
 *
 * MÅLT PÅ sd-vakt-dataene 2026-08-02, 22 544 stillinger:
 *
 *   bud  7   0,03 %      bud 10   36,5 %
 *   bud  8    6,5 %      bud 11    1,6 %
 *   bud  9   55,3 %
 *
 * 92 % av all treningsdata er bud 9 eller 10, fordi det er dét nevro byr.
 * Nettet får kontrakten som trekk (indeks 225) og kan i prinsippet spille
 * ulikt under ulike kontrakter – men det har aldri sett en niende av dem.
 *
 * DET ER EN SELVFORSTERKENDE FELLE, og den binder budrunden til kortspillet:
 * `analyse/budflaks.txt` måler at det poengoptimale budet ligger rundt 7,6,
 * altså nøyaktig der dataene er tomme. Vi tør ikke by lavere fordi nettet
 * ikke kan spille lavere, og nettet lærer aldri å spille lavere fordi vi
 * ikke byr lavere.
 *
 * PRISEN er at stillingene blir mindre realistiske: en hånd som aldri ville
 * blitt meldt 12, meldes 12 her. Det er en bevisst byttehandel – dekning mot
 * realisme – og derfor er standarden 0,5 og ikke 1: halvparten av rundene
 * beholder nevros egen budfordeling, så den naturlige fordelingen fortsatt
 * dominerer der den finnes.
 */
let budspredning = 0.5;
/** Kontraktene som trekkes uniformt. Tyngden ligger med vilje i tynne data. */
const BUDSTIGE = [7, 8, 8, 9, 10, 11, 11, 12];
/**
 * BREDDEN ER ET ARGUMENT, IKKE EN HARDKODET KONSTANT.
 *
 * Den var hardkodet til V2 en gang, og da telleblokken kom i `trekk.ts` skrev
 * generatoren fortsatt 340 – timevis med data UTEN den nye informasjonen, uten
 * et eneste varsel. Advarselen sto i koden; konstanten sto der like fullt, nå
 * på V8. Så nå er den et argument som valideres mot `LOVLIGE_BREDDER`.
 */
let bredde = E1_SPILL_DIM_V8;
/** Trosnettet. Kreves fra v9 og opp – uten det er 84 av 88 sansetrekk null. */
let troFil: string | null = null;
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
  else if (a === "--bredde") bredde = Number(process.argv[++i]);
  else if (a === "--tro") troFil = process.argv[++i] ?? null;
  else if (a === "--fraStikk") fraStikk = Number(process.argv[++i]);
  else if (a === "--maks") maks = Number(process.argv[++i]);
  else if (a === "--motpart") motpartSpek = process.argv[++i] ?? "nevro";
  else if (a === "--budspredning") budspredning = Number(process.argv[++i]);
}

// --- BREDDE OG TRO: valider FOER en eneste rad genereres ------------------
//
// Alt her feiler HOEYLYTT og umiddelbart. En generatorkjoering er timer lang,
// og enhver feil som oppdages etterpaa koster hele kjoeringen.
if (!(LOVLIGE_BREDDER as readonly number[]).includes(bredde)) {
  throw new Error(
    `Ukjent bredde ${bredde}. Lovlige: ${LOVLIGE_BREDDER.join(", ")}. ` +
      `Skriver generatoren en bredde treneren ikke kjenner, hoppes hele korpuset over.`,
  );
}
const trosnett =
  troFil === null ? null : new Trosnett(nettFraBytes(new Uint8Array(readFileSync(troFil)))[0]!);
if (bredde >= E1_SPILL_DIM_V9 && trosnett === null) {
  throw new Error(
    `Bredde ${bredde} har sanseblokken, men --tro mangler. Da ville 84 av 88 ` +
      `sansetrekk vaert konstant null i HELE korpuset. Send --tro e1-modell/tro.bin.`,
  );
}
console.error(`bredde ${bredde}, tro: ${troFil ?? "ingen"}`);

// EGEN UTMAPPE. `verktoy/e1-tren.py` leser alle `skard-*.jsonl` i en mappe og
// blander dem uten å se på innholdet. Havner SD-linjer i e1-data/, er begge
// datasettene ødelagt uten at noe feiler – de har jo samme format.
const ut = utFil ?? `sd-data/skard-${skardI}.jsonl`;
mkdirSync(dirname(ut), { recursive: true });

/**
 * `appendFileSync` med retry på EBUSY/EPERM.
 *
 * HVORFOR DETTE ER NØDVENDIG, og det kostet flere timers generering å finne:
 * på Windows åpner `[System.IO.File]::OpenText` – som statusskriptene og hver
 * ad hoc radtelling bruker – fila med `FileShare.Read`. Den NEKTER andre å
 * skrive mens lesingen pågår. Et skard som tilfeldigvis skrev i det øyeblikket
 * fikk `EBUSY: resource busy or locked` og DØDE.
 *
 * Det forklarte alle de «mystiske» skarddødene 2026-08-02: sd-dagger-skard som
 * stoppet på 2 876 og 3 332 rader i stedet for ~5 200, og 8 av 14
 * sd-nevro-skard som forsvant. Overvåkingen drepte det den overvåket.
 *
 * Leserne er rettet til å dele skrivetilgang, men rettelsen hører HIT også:
 * en generator som har brukt timer på å samle data skal ikke dø av at noen
 * ser på fila. Antivirus og sikkerhetskopiering tar samme lås.
 */
function skrivRobust(fil: string, tekst: string, forsøk = 40): void {
  for (let i = 0; i < forsøk; i++) {
    try {
      appendFileSync(fil, tekst);
      return;
    } catch (e) {
      const kode = (e as NodeJS.ErrnoException).code;
      if (kode !== "EBUSY" && kode !== "EPERM" && kode !== "EACCES") throw e;
      // Kort, voksende pause. Låsen varer millisekunder, ikke sekunder.
      const til = Date.now() + Math.min(250, 5 * (i + 1));
      while (Date.now() < til) {
        /* opptatt venting – dette er en batchprosess uten hendelsesløkke å gi tid til */
      }
    }
  }
  throw new Error(`Ga opp aa skrive til ${fil} etter ${forsøk} forsoek (fila er laast av en annen prosess)`);
}

// Nevro er BÅDE den som spiller partiene (stillingskilden) og motstander-
// modellen SD-evalueringen spiller verdenene ferdig med. Det er ikke en
// forglemmelse: SD-fasiten som bestod porten var definert med NevroHjerne i
// alle fire seter, og en fasit skal genereres med nøyaktig den modellen den
// ble validert med.
const nevro = new NevroAgent();

/**
 * ROLLOUT-POLICYEN, altså hvem som spiller de samplede verdenene ferdig.
 *
 * Standard er nevro, og det skal den være for å reprodusere den fasiten som
 * bestod godkjenningsporten. `--motpart` finnes fordi den er blitt en
 * flaskehals: målt 2026-08-01 henter `vakt:ab:e1:sd-r2` +0,26 stikk MER enn
 * SD-estimatet som spillefører (`lagstikk − SD` = +0,26 mot nevros −0,00).
 * Eleven er altså allerede over læreren, og en fasit som sier «dette er hva
 * nevro ville hentet» kan ikke peke høyere enn nevro.
 *
 * Byttes rollouten til en sterkere spiller, blir merkelappen «dette er hva en
 * god spiller ville hentet». Det er en annen fasit, ikke en bedre versjon av
 * den samme, og den MÅ gjennom godkjenningsporten på nytt før den brukes til
 * trening. Uavhengig støtte for at retningen er riktig: mot MesterAI taper
 * `sd:e1:sd-r2` +0,351 mens `sd:nevro` taper +0,468 – en sterkere
 * motstandermodell i SD er allerede målt til å hjelpe.
 */
function lagMotpart(spec: string): { navn: string; velgHandling(s: GameState): Handling } {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagMotpart(vakt.indre);
    const pakket = new Konvensjonsvakt(indre, vakt.valg);
    return { navn: `v${vakt.flagg}:${indre.navn}`, velgHandling: (s) => pakket.velgHandling(s) };
  }
  if (spec === "nevro") return { navn: "NevroHjerne", velgHandling: (s) => nevro.velgHandling(s) };
  if (spec.startsWith("e1:")) {
    const agent = E1Agent.fraFil(spec.slice(3));
    return { navn: spec, velgHandling: (s) => agent.velgHandling(s) };
  }
  /**
   * `vr:<vektfil>:<flagg>:<indre>` - vrak- og trumfrangereren.
   *
   * Som budmodellen paavirker den ikke ROLLOUTENE, som starter etter at trumf
   * og vrak er avgjort. Men STILLINGSKILDEN bruker samme byggefunksjon, og der
   * bestemmer den hvilke stillinger som i det hele tatt oppstaar. Uten den
   * ville korpuset vaert merket paa stillinger Adams-v3 aldri havner i.
   */
  if (spec.startsWith("vr:")) {
    const r = spec.slice(3);
    const i = r.indexOf(":");
    const j = r.indexOf(":", i + 1);
    if (i < 0 || j < 0) throw new Error(`Ugyldig vr-spek «${spec}»`);
    const nett = nettFraBytes(new Uint8Array(readFileSync(r.slice(0, i))))[0];
    if (nett === undefined) throw new Error(`Tomme vekter i «${r.slice(0, i)}»`);
    const indre = lagMotpart(r.slice(j + 1));
    const pakket = new Vrakrangerer(
      { velgHandling: (s) => indre.velgHandling(s), nyKamp: () => {} },
      nett,
      r.slice(i + 1, j),
    );
    return { navn: `vr:${indre.navn}`, velgHandling: (s) => pakket.velgHandling(s) };
  }
  if (spec.startsWith("budm:")) {
    // BUDMODELLEN PAAVIRKER IKKE ROLLOUTENE - de starter i spillfasen, der budet
    // alt er avgjort - men den maa kunne staa i en spek, fordi STILLINGSKILDEN
    // under bruker samme byggefunksjon og der betyr den alt.
    //
    // «@<evForsvar>» MAA VAERE MED. Terskelen avgjoer hvor ofte og paa hvilket
    // nivaa boten byr, og dermed hvilke kontrakter som i det hele tatt spilles.
    // Merker vi et korpus med standardterskelen og spiller med -3,0, merker vi
    // stillinger fra en annen bot enn den som skal laere av dem - samme klasse
    // feil som kostet -0,357 mot +0,896 i orakelbenken.
    const rest = spec.slice(5);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig budm-spek «${spec}» - forventet budm:<modellfil>:<indre>`);
    const hode = rest.slice(0, skille);
    const at = hode.lastIndexOf("@");
    const fil = at < 0 ? hode : hode.slice(0, at);
    const ev = at < 0 ? 2.5 : Number(hode.slice(at + 1));
    if (!Number.isFinite(ev)) throw new Error(`Ugyldig evForsvar i «${spec}»`);
    const indre = lagMotpart(rest.slice(skille + 1));
    const pakket = new Budagent(
      { velgHandling: (s) => indre.velgHandling(s), nyKamp: () => {} },
      lesBudmodell(fil),
      ev,
    );
    return { navn: `budm@${ev}:${indre.navn}`, velgHandling: (s) => pakket.velgHandling(s) };
  }
  throw new Error(
    `Ukjent spek «${spec}» (bruk nevro, e1:<fil>, vakt:<flagg>:<indre>, ` +
      `vr:<vekter>:<flagg>:<indre> eller budm:<fil>[@<ev>]:<indre>)`,
  );
}
const motpart = lagMotpart(motpartSpek);
/**
 * Stillingskilden. Standard er nevro (runde 1); med --spiller er det nettet
 * som selv skal laere, og da er dette DAgger-runde 2.
 *
 * TAR NAA EN HEL SPEK, ikke bare en vektfil. Det var en ekte feilkobling:
 * Adams spiller med `budm:bud-gbt.json`, men stillingskilden var et bart
 * E1-nett. Maalt over 1 200 runder (`examples/kontraktskift.ts`) gir det en
 * helt annen kontraktsfordeling:
 *
 *   bud     uten budmodell   med budmodell
 *    8        13,4 %            0,2 %
 *    9        62,0 %           52,5 %
 *   10        23,8 %           47,3 %
 *
 * Bud 10 er altsaa naer halvparten av det Adams faktisk spiller og en
 * fjerdedel av det den var trent paa. Nettet var undertrent paa noeyaktig de
 * kontraktene det spiller mest.
 */
const spiller =
  spillerFil !== null
    ? (() => {
        const a = lagMotpart(spillerFil.includes(":") ? spillerFil : `e1:${spillerFil}`);
        return { velgHandling: (s: GameState) => a.velgHandling(s), nyKamp: () => {} };
      })()
    : nevro;
// SKRIV HVEM SOM SPILLER. To ganger i dag har noe staatt «koblet» uten aa
// vaere i bruk (muterRettet, spillFasit), og begge gangene fordi ingen linje
// sa hva som faktisk kjoerte.
console.log(
  `stillingskilde: ${spillerFil ?? "NevroHjerne"}` +
    `  |  motstandermodell i SD-rollout: ${motpart.navn}  |  ${verdener} verdener`,
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
  /** Kontrakten denne runden tvinges til, eller null = la nevro by fritt. */
  let tvungetBud: number | null = null;
  let harBydd = false;
  while (s.fase !== "FERDIG" && guard++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 30) break;
      s = utfør(s, { type: "NESTE" }).state;
      tvungetBud = null;
      harBydd = false;
      continue;
    }
    // Trekk kontrakt for runden ved første budhandling.
    if (s.fase === "BUDRUNDE" && tvungetBud === null && !harBydd && budspredning > 0) {
      if (rng() < budspredning) tvungetBud = BUDSTIGE[Math.floor(rng() * BUDSTIGE.length)]!;
      else tvungetBud = 0; // 0 = denne runden går til nevro
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
        const vurdert = vurderKortSD(s, sete, motpart, { verdener, rng });
        // Tom liste = ingen verden lot seg trekke. Da skal INGENTING skrives:
        // å behandle «ingen data» som «alle valg er like gode» var mekanismen
        // som gjorde `lærForsvar` verre enn ingenting.
        if (vurdert.length > 0) {
          // Verdiene lagres per KORTINDEKS (0–51), så treneren slipper å
          // kjenne rekkefølgen lovligeKort tilfeldigvis hadde.
          const verdi: Record<number, number> = {};
          for (const v of vurdert) verdi[kortIndeks(v.kort)] = Math.round(v.verdi * 1000) / 1000;
          skrivRobust(
            ut,
            JSON.stringify({
              // De to trekkvektorene er ulike kodinger – `t` er 273 (appens 238
              // + 35 egne), `nt` er NEATs 318 – og de er LETTE å forveksle: tre
              // feil på én dag kom av nettopp det. Uten begge kan ikke
              // NEAT-genomer scores på angerbenken.
              // `t` skrives nå i v2-bredde (340). De 273 første indeksene er
              // BIT FOR BIT de samme som før, så gamle rader og nye kan
              // blandes i samme treningssett – de gamle mangler bare halen,
              // og halens siste indeks er nettopp flagget som sier det.
              // BREDDEN ER V4, OG MAA FOELGE trekk.ts. Den var hardkodet til
              // V2, og da telleblokken ble lagt til i trekk.ts skrev
              // generatoren fortsatt 340 - altsaa timevis med data UTEN den
              // nye informasjonen, uten et eneste varsel. Fanget ved aa lese
              // foerste rad etter oppstart. GJOER DET IGJEN etter hver gang
              // kodingen utvides: `head -1 <mappe>/skard-0.jsonl` og tell.
              t: Array.from(e1SpillTrekkMedTro(s, sete, bredde, trosnett), (x) =>
                Math.round(x * 10_000) / 10_000,
              ),
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
    } else if (s.fase === "BUDRUNDE" && tvungetBud !== null && tvungetBud > 0) {
      // TVUNGEN KONTRAKT. Se BUDSTIGE for hvorfor: uten dette er 92 % av
      // dataene bud 9-10, og nettet kan bare spille de kontraktene.
      const lov = lovligeHandlinger(s);
      const tall = lov.fase === "BUDRUNDE" ? lov.bud.filter((b): b is number => typeof b === "number") : [];
      if (!harBydd && tall.includes(tvungetBud)) {
        harBydd = true;
        h = { type: "BUD", spiller: s.iTur!, bud: tvungetBud };
      } else if (!harBydd && tall.length > 0 && Math.min(...tall) > tvungetBud) {
        // Budet er alt overbudt av en tidligere runde i samme budrunde.
        // Da faller runden tilbake til nevro i stedet for aa tvinges hoyere -
        // aa presse budet opp ville laget nettopp den skjevheten vi fjerner.
        tvungetBud = 0;
        h = nevro.velgHandling(s);
      } else {
        h = { type: "BUD", spiller: s.iTur!, bud: "PASS" };
      }
    } else {
      // Vrak og trumfvalg tas alltid av nevro - ogsaa i DAgger-runden. Det er
      // de fasene sd-nettet ikke eier. Budrunden gaar hit naar kontrakten
      // ikke tvinges.
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
  `Ferdig: ${merket} stillinger à ${bredde} trekk (v1 ${E1_SPILL_DIM} + blokker opp til ${bredde}), ` +
    `SD med ${verdener} verdener, budspredning ${budspredning} → ${ut}`,
);
