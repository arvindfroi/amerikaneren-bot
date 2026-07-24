/**
 * Turneringsmotoren for evolusjonen: cup i grupper på 4 med flakskontroll.
 *
 * FLAKSKONTROLL (duplikat-prinsippet fra turneringsbridge): en gruppekamp
 * består av 4 hele kamper med NØYAKTIG samme kortgiving (samme frø), der
 * agentene roteres syklisk gjennom setene. Hver agent spiller altså hver
 * hånd fra hver posisjon; god- og dårlig-kort jevnes ut, og differansen som
 * står igjen er ferdighet – ikke flaks.
 *
 * CUPEN: feltet deles i grupper på 4; gruppevinneren (flest kampseire,
 * deretter flest duplikatpoeng) går videre, resten er slått ut – de dårlige
 * spillerne lukes bort. Hvor langt en agent når (dybden) er grunnlaget for
 * fitness. Går ikke antallet opp i 4, fylles gruppene med «lucky losers»
 * (de beste allerede utslåtte), som kan spille seg videre igjen.
 *
 * ANGER (regret): for hver kontrakt bokføres hvor feil budvinnerens
 * xT-estimat var (kalibrering) og hva feilbudet kostet (falt kontrakt,
 * eller ubrukt overskudd). Snittangeren trekkes fra i fitness – populasjonen
 * lærer på regret, ikke bare på plassering.
 */

import { lagRng, type Kort } from "../kort.ts";
import type { GameState, Handling, Hendelse } from "../motor.ts";
import { opprettSpill, utfør } from "../motor.ts";
import type { BudEstimat } from "./agent.ts";
import { solverBesteKort } from "./hybrid.ts";

/** Det en agent må kunne for å delta (NeatAgent oppfyller dette). */
export interface TurneringsAgent {
  nyKamp(): void;
  velgHandling(state: GameState): Handling;
  estimatFor(rundeNr: number): BudEstimat | undefined;
  /**
   * Valgfri regret-læring: kalles når agentens kontrakt er avgjort, med de
   * faktiske lag- og makkerstikkene, slik at nettet kan kalibrere seg.
   */
  lærAvKontrakt?(rundeNr: number, lagStikk: number, makkerStikk?: number): void;
  /** Kan overstyres av sluttsøket (KampOpts.sluttsøk). Portvakter er ikke det. */
  readonly søkbar?: boolean;
  /** Valgfri spillfasit-læring: smal kalibrering mot solverens kortvalg. */
  lærSpill?(state: GameState, spiller: number, solverKort: Kort, rate: number): void;
  /** Valgfri budfasit-læring: xT-kalibrering mot en utspilt rollout. */
  lærBudFasit?(state: GameState, spiller: number, lagStikk: number, makkerStikk: number, rate: number): void;
}

export interface KampOpts {
  /** Rundetak per kamp (sikkerhetsventil; avgjøres da på poeng). */
  readonly maksRunder?: number;
  /** Handlingstak per kamp (vern mot evige budrunder hos svake nett). */
  readonly maksHandlinger?: number;
  /**
   * Antall kortgivinger per gruppekamp (hver spilles med full sete-
   * rotasjon → 4·frøPerKamp kamper). Flere frø = mindre trekningsstøy i
   * seleksjonen – avgjørende når populasjonen er jevn og ekte forskjeller
   * er små. Standard 1.
   */
  readonly frøPerKamp?: number;
  /**
   * SLUTTSØK (D1): søkbare agenter spiller sluttspillet med eksakt søk –
   * ved ≤ `terskel` stikk igjen erstattes nettets kortvalg av solverens
   * (fra agentens eget informasjonsbilde). Nettet slipper å lære sluttspill
   * og seleksjonen konsentreres om budgivning og tidlig-/midtspill.
   */
  readonly sluttsøk?: { readonly terskel: number; readonly verdener: number; readonly nodeTak: number };
  /**
   * SPILLFASIT (D1): med sannsynlighet `sjanse` per kortvalg regnes
   * solverens beste kort ut i samme stilling, og agenten kalibrerer
   * korthodet sitt smalt mot det (lærSpill). Agentens EGET valg spilles
   * fortsatt (on-policy – DAgger-lærdommen).
   */
  readonly spillFasit?: {
    readonly sjanse: number;
    readonly verdener: number;
    readonly dybde: number;
    readonly nodeTak: number;
    readonly rate: number;
  };
  /**
   * BUDFASIT: med sannsynlighet `sjanse` per budbeslutning spilles en
   * ROLLOUT av givingen der agenten tvinges til å vinne budrunden (minste
   * lovlige bud), og resten av runden spilles ut av kampens egne agenter.
   * Lagstikkene derfra kalibrerer xT-hodene (lærBudFasit). Fasiten er
   * dermed «hva laget mitt faktisk spiller hjem med MIN spillestyrke» –
   * ikke et perfekt-spill-tall – og den dekker også hender der agenten
   * passer (lærAvKontrakt fyrer bare når agenten vinner budrunden).
   * Selve kampen påvirkes ikke: agentens egen budhandling spilles.
   */
  readonly budFasit?: { readonly sjanse: number; readonly rate: number };
}

const STD_MAKS_RUNDER = 40;
const STD_MAKS_HANDLINGER = 20000;

/**
 * Budfasit-rollout: fra budøyeblikket tvinges `sete` til å vinne budrunden
 * med minste lovlige tallbud (alle andre passer), og runden spilles ut med
 * LÆRLINGENS EGET NETT på alle fire seter – fasiten er hva agentens egen
 * spillestyrke faktisk spiller hjem, ikke et perfekt-spill-tall. Kampens
 * ekte tilstand røres ikke (utfør kloner), og velgHandling bokfører
 * ingenting utenfor budrunden.
 */
function budRollout(
  budState: GameState,
  sete: number,
  agent: TurneringsAgent,
  rate: number,
): void {
  const høyesteBud = budState.budrunde.høyeste?.bud ?? null;
  if (høyesteBud !== null && typeof høyesteBud !== "number") return; // am/solo kan ikke overbys med tall
  const bud = høyesteBud === null ? 5 : høyesteBud + 1;
  if (bud > budState.giving.antallStikk) return;

  let s = utfør(budState, { type: "BUD", spiller: sete, bud }).state;
  let guard = 0;
  while (s.fase === "BUDRUNDE" && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  guard = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG" || s.fase === "SPILL") && guard++ < 250) {
    s = utfør(s, agent.velgHandling(s)).state;
  }
  const res = s.sisteRunde;
  if (!res || res.budvinner !== sete) return;
  const makkerStikk =
    res.makker !== null && res.makker !== res.budvinner ? (res.stikkVunnet[res.makker] ?? 0) : 0;
  agent.lærBudFasit!(budState, sete, res.lagStikk, makkerStikk, rate);
}

export interface GruppeResultat {
  /**
   * Sum POENGDIFFERANSE per agent over alle 4 seterotasjoner: egne
   * kamppoeng minus snittet av motstandernes. Differansen er det som
   * faktisk vinner kamper – og den priser budhøyden riktig (å by 6 og ta
   * 8 gir 12, å by 8 gir 16; differansen straffer feige bud av seg selv).
   */
  readonly poeng: number[];
  /** Antall kampseire per agent (0–4). */
  readonly seire: number[];
  /** Sum anger og antall kontrakter per agent (for snittberegning). */
  readonly regretSum: number[];
  readonly regretRunder: number[];
  /** Agentindekser sortert best → dårligst. */
  readonly rekkefølge: number[];
}

/**
 * Spiller en flakskontrollert gruppekamp mellom 4 agenter: samme frø i alle
 * 4 kampene, agentene roterer ett sete per kamp. Loddtrekningen ved full
 * poenglikhet utledes av frøet, så resultatet er en ren funksjon av
 * (agenter, frø) – dermed kan grupper spilles i vilkårlig rekkefølge eller
 * parallelt i arbeidstråder med identisk utfall.
 */
export function spillGruppekamp(
  agenter: readonly TurneringsAgent[],
  frø: number,
  opts: KampOpts = {},
): GruppeResultat {
  const rng = lagRng((frø ^ 0x51ed270b) >>> 0);
  if (agenter.length !== 4) throw new Error("Gruppekamp krever nøyaktig 4 agenter");
  const maksRunder = opts.maksRunder ?? STD_MAKS_RUNDER;
  const maksHandlinger = opts.maksHandlinger ?? STD_MAKS_HANDLINGER;
  const frøPerKamp = opts.frøPerKamp ?? 1;

  const poeng = [0, 0, 0, 0];
  const seire = [0, 0, 0, 0];
  const regretSum = [0, 0, 0, 0];
  const regretRunder = [0, 0, 0, 0];

  for (let kampNr = 0; kampNr < 4 * frøPerKamp; kampNr++) {
    const rotasjon = kampNr % 4;
    const kampFrø = (frø + Math.imul(Math.floor(kampNr / 4), 0x9e3779b1)) >>> 0;
    // Agent i sitter i sete (i + rotasjon) % 4.
    const agentISete = (sete: number): number => (sete - rotasjon + 4) % 4;
    for (const a of agenter) a.nyKamp();

    let state = opprettSpill({ antallSpillere: 4 }, kampFrø);
    let handlinger = 0;
    while (state.fase !== "FERDIG" && handlinger++ < maksHandlinger) {
      if (state.fase === "RUNDE_SLUTT" && state.rundeNr + 1 >= maksRunder) break;
      const sete =
        state.fase === "VRAK" || state.fase === "VELG"
          ? state.budvinner!
          : state.fase === "RUNDE_SLUTT"
            ? 0
            : state.iTur!;
      const agent = agenter[agentISete(sete)]!;
      let handling: Handling =
        state.fase === "RUNDE_SLUTT" ? ({ type: "NESTE" } as const) : agent.velgHandling(state);
      if (
        state.fase === "BUDRUNDE" &&
        opts.budFasit !== undefined &&
        agent.lærBudFasit !== undefined &&
        rng() < opts.budFasit.sjanse
      ) {
        budRollout(state, sete, agent, opts.budFasit.rate);
      }
      if (state.fase === "SPILL" && handling.type === "SPILL") {
        const gjenstår = state.giving.antallStikk - state.stikkSpilt;
        if (
          opts.sluttsøk !== undefined &&
          agent.søkbar === true &&
          gjenstår <= opts.sluttsøk.terskel
        ) {
          // Sluttsøk: solveren spiller sluttspillet for søkbare agenter.
          const kort = solverBesteKort(state, sete, {
            verdener: opts.sluttsøk.verdener,
            dybde: gjenstår,
            nodeTak: opts.sluttsøk.nodeTak,
            rng,
          });
          if (kort !== null) handling = { type: "SPILL", spiller: sete, kort };
        } else if (
          opts.spillFasit !== undefined &&
          agent.lærSpill !== undefined &&
          rng() < opts.spillFasit.sjanse
        ) {
          // Spillfasit: solverens valg i samme stilling som smal fasit for
          // korthodet – agentens eget valg spilles fortsatt (on-policy).
          const kort = solverBesteKort(state, sete, {
            verdener: opts.spillFasit.verdener,
            dybde: opts.spillFasit.dybde,
            nodeTak: opts.spillFasit.nodeTak,
            rng,
          });
          if (kort !== null) agent.lærSpill(state, sete, kort, opts.spillFasit.rate);
        }
      }
      const res = utfør(state, handling);
      bokførRegret(state, res.hendelser, agenter, agentISete, regretSum, regretRunder);
      state = res.state;
    }

    // Differanse = egne − (sum − egne)/3. Akkumuler helttalls-telleren
    // (4·egne − sum) og del på 3 til slutt – gir bit-identiske resultater
    // uavhengig av seterekkefølge.
    const sum = state.totalPoeng.reduce((a, b) => a + b, 0);
    for (let sete = 0; sete < 4; sete++) {
      poeng[agentISete(sete)]! += 4 * (state.totalPoeng[sete] ?? 0) - sum;
    }
    if (state.vinner !== null) seire[agentISete(state.vinner)]!++;
  }

  for (let i = 0; i < 4; i++) poeng[i]! /= 3;

  // Full likhet avgjøres av en forhåndstrukket loddtrekning (stabil komparator).
  const lodd = [rng(), rng(), rng(), rng()];
  const rekkefølge = [0, 1, 2, 3].sort(
    (a, b) => seire[b]! - seire[a]! || poeng[b]! - poeng[a]! || lodd[b]! - lodd[a]!,
  );
  return { poeng, seire, regretSum, regretRunder, rekkefølge };
}

/**
 * Anger for budvinnerens kontrakt når en runde er ferdig. VIKTIG: angeren
 * straffer BUDET, aldri spillet. Spillkvaliteten avgjøres allerede av
 * poengdifferansen (fitness `poeng`): hvert stikk motstanderne tar er +1 til
 * dem, så det å ta så mange stikk som mulig maksimerer differansen av seg
 * selv. En egen overstikk-straff ville derimot premiert agenten for å ta
 * FÆRRE stikk (spille dårlig med vilje for å treffe et lavt bud) – nettopp
 * det reward-hacket vi må unngå. Derfor:
 *  - kalibrering: |xT-estimat − faktiske lagstikk| (per stikk) – trener
 *    ESTIMATET til å treffe det hånden faktisk bærer (overbud OG underbud
 *    fanges her, som estimatfeil, ikke som spillstraff).
 *  - klart: INGEN ekstra straff – underbud prises av differansen (bud 9 klart
 *    = +18, bud 6 = +12) og av budfasit-rollouten, ikke av overstikk.
 *  - falt: tapet mot beste etterpåklokskap (2·bud + 2·stikk hvis stikkene
 *    bar et lovlig bud) – dette er budregret: budet var uklart for hånden.
 * Normalisert (poeng delt på 2·antallStikk) slik at verdien er ~[0, 2].
 */
function bokførRegret(
  førState: GameState,
  hendelser: readonly Hendelse[],
  agenter: readonly TurneringsAgent[],
  agentISete: (sete: number) => number,
  regretSum: number[],
  regretRunder: number[],
): void {
  for (const h of hendelser) {
    if (h.type !== "RUNDE_SLUTT") continue;
    const res = h.resultat;
    const agentIdx = agentISete(res.budvinner);
    const agent = agenter[agentIdx]!;
    const est = agent.estimatFor(førState.rundeNr);
    if (est === undefined) continue;
    const antallStikk = førState.giving.antallStikk;
    const mål = res.melding.type === "tall" ? res.melding.bud : antallStikk;
    const kalibrering = Math.abs(est.xt - res.lagStikk) / antallStikk;
    let poengTap: number;
    if (res.klart) {
      // Klart: overstikk er IKKE en spillfeil (differansen belønner allerede
      // hvert stikk), og å straffe dem ville lært agenten å sandbagge mot et
      // lavt bud. Underbud fanges av kalibreringen (estimatfeil) og av
      // differansen (høyere bud = mer poeng klart). Ingen ekstra straff.
      poengTap = 0;
    } else {
      const kunneBudt = res.lagStikk >= 5 ? 2 * res.lagStikk : 0;
      poengTap = 2 * mål + kunneBudt;
    }
    regretSum[agentIdx]! += kalibrering + poengTap / (2 * antallStikk);
    regretRunder[agentIdx]!++;
    // Nettet lærer av angeren sin med en gang fasiten foreligger.
    const makkerStikk = res.makker !== null ? (res.stikkVunnet[res.makker] ?? 0) : 0;
    agent.lærAvKontrakt?.(førState.rundeNr, res.lagStikk, makkerStikk);
  }
}

// ---------------------------------------------------------------------------
// Cupturnering
// ---------------------------------------------------------------------------

export interface TurneringsResultat {
  /** Hvor mange grupperunder agenten vant seg gjennom (0 = røk i første). */
  readonly dybde: number[];
  /** Sum poengDIFFERANSE (egne − snitt motstandere) over alle gruppekamper. */
  readonly poeng: number[];
  /** Sum kampseire. */
  readonly seire: number[];
  /** Snittanger per kontrakt (0 om agenten aldri vant en budrunde). */
  readonly regretSnitt: number[];
  /** Turneringsvinneren. */
  readonly mesterIdx: number;
  /** Antall grupperunder som ble spilt. */
  readonly runder: number;
}

/**
 * En gruppespiller: avvikler kampen mellom fire deltakere (angitt ved
 * indeks i feltet) med gitt frø. Den lokale varianten spiller selv; den
 * parallelle (se pool.ts) sender jobben til en arbeidstråd. Grupper i
 * samme runde er uavhengige, så resultatet er identisk uansett
 * avviklingsrekkefølge.
 */
export type GruppeSpiller = (
  medlemmer: readonly number[],
  gruppeFrø: number,
) => Promise<GruppeResultat>;

/**
 * Kjører hele cupen med en vilkårlig gruppespiller. `antall` må være ≥ 4
 * og delelig med 4 (da trengs aldri utfylling i første runde).
 * Deterministisk gitt frø – også med parallell gruppespiller, siden hver
 * gruppekamp er en ren funksjon av (deltakere, gruppeFrø).
 *
 * MÅLESTOKK (C6): med `målestokk` satt (en felt-indeks, typisk en PIMC-
 * portvakt) spilles FØRSTE runde i grupper på 3 konkurrenter + målestokken
 * som fjerdemann i hver gruppe. Alle konkurrenter måles dermed mot samme
 * yardstick hver generasjon – flakskontrollert differanse mot solveren er
 * ren ferdighet, ikke trekningslykke. Målestokken AVANSERER ALDRI (den er
 * langt sterkere enn feltet; å la den konkurrere gjorde dybden til støy) –
 * gruppens beste konkurrent går videre, og fra runde 2 er cupen ren.
 */
export async function kjørTurneringMed(
  antall: number,
  spillGruppe: GruppeSpiller,
  frø: number,
  målestokk: number | null = null,
): Promise<TurneringsResultat> {
  const n = antall;
  const konkurrenter = målestokk !== null ? n - 1 : n;
  if (målestokk === null && (n < 4 || n % 4 !== 0)) {
    throw new Error("Turneringen krever minst 4 agenter og et antall delelig med 4");
  }
  if (målestokk !== null && konkurrenter < 4) {
    throw new Error("Turneringen krever minst 4 konkurrenter i tillegg til målestokken");
  }
  const rng = lagRng(frø ^ 0x9e3779b9);

  const dybde = new Array<number>(n).fill(0);
  const poeng = new Array<number>(n).fill(0);
  const seire = new Array<number>(n).fill(0);
  const regretSum = new Array<number>(n).fill(0);
  const regretRunder = new Array<number>(n).fill(0);

  let kandidater = stokkIndekser(n, rng).filter((i) => i !== målestokk);
  const utslåtte = new Set<number>();
  let runde = 0;

  while (kandidater.length > 1) {
    // Gruppestørrelse denne runden: 3 + målestokk i runde 1 (når satt),
    // ellers vanlige grupper på 4. Antall 3-grupper velges så resten går
    // opp i 4 (n = 3a + 4b); overskytende spiller vanlig firergruppe.
    const medMålestokk = målestokk !== null && runde === 0;
    let treGrupper = 0;
    if (medMålestokk) {
      treGrupper = Math.floor(kandidater.length / 3);
      while (treGrupper > 0 && (kandidater.length - 3 * treGrupper) % 4 !== 0) treGrupper--;
    }

    // Fyll opp til delelig med 4 med de beste utslåtte («lucky losers»).
    const rest = kandidater.length - 3 * treGrupper;
    const mangler = (4 - (rest % 4)) % 4;
    if (mangler > 0 || kandidater.length < 4) {
      const inne = new Set(kandidater);
      const pool = [...utslåtte]
        .filter((i) => !inne.has(i))
        .sort((a, b) => dybde[b]! - dybde[a]! || poeng[b]! - poeng[a]!);
      const behov = kandidater.length < 4 ? 4 - kandidater.length : mangler;
      for (let i = 0; i < behov && i < pool.length; i++) kandidater.push(pool[i]!);
      if ((kandidater.length - 3 * treGrupper) % 4 !== 0) {
        throw new Error("Klarte ikke fylle gruppene – for få agenter");
      }
    }

    // Alle gruppene i runden avvikles samtidig (uavhengige kamper).
    const grupper: number[][] = [];
    const jobber: Promise<GruppeResultat>[] = [];
    let posisjon = 0;
    let gruppeNr = 0;
    while (posisjon < kandidater.length) {
      const erTre = gruppeNr < treGrupper;
      const gruppe = kandidater.slice(posisjon, posisjon + (erTre ? 3 : 4));
      if (erTre) gruppe.push(målestokk!);
      posisjon += erTre ? 3 : 4;
      const gruppeFrø = (frø + Math.imul(runde * 131 + gruppeNr * 4 + 1, 0x85ebca6b)) >>> 0;
      grupper.push(gruppe);
      jobber.push(spillGruppe(gruppe, gruppeFrø));
      gruppeNr++;
    }
    const resultater = await Promise.all(jobber);

    const vinnere: number[] = [];
    for (let g = 0; g < grupper.length; g++) {
      const gruppe = grupper[g]!;
      const res = resultater[g]!;
      for (let j = 0; j < 4; j++) {
        const idx = gruppe[j]!;
        poeng[idx]! += res.poeng[j]!;
        seire[idx]! += res.seire[j]!;
        regretSum[idx]! += res.regretSum[j]!;
        regretRunder[idx]! += res.regretRunder[j]!;
      }
      // Beste KONKURRENT vinner gruppa – målestokken avanserer aldri.
      const vinnerPlass = res.rekkefølge.find((j) => gruppe[j] !== målestokk)!;
      const vinner = gruppe[vinnerPlass]!;
      vinnere.push(vinner);
      dybde[vinner] = runde + 1;
      for (const idx of gruppe) if (idx !== vinner && idx !== målestokk) utslåtte.add(idx);
    }
    kandidater = vinnere;
    runde++;
  }

  const regretSnitt = regretSum.map((s, i) =>
    regretRunder[i]! > 0 ? s / regretRunder[i]! : 0,
  );
  return {
    dybde,
    poeng,
    seire,
    regretSnitt,
    mesterIdx: kandidater[0]!,
    runder: runde,
  };
}

/** Kjører cupen lokalt (én tråd) med ferdige agenter. */
export async function kjørTurnering(
  agenter: readonly TurneringsAgent[],
  frø: number,
  opts: KampOpts = {},
  målestokk: number | null = null,
): Promise<TurneringsResultat> {
  return kjørTurneringMed(
    agenter.length,
    (medlemmer, gruppeFrø) =>
      Promise.resolve(
        spillGruppekamp(
          medlemmer.map((i) => agenter[i]!),
          gruppeFrø,
          opts,
        ),
      ),
    frø,
    målestokk,
  );
}

function stokkIndekser(n: number, rng: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Fitness
// ---------------------------------------------------------------------------

export interface FitnessOpts {
  /** Vekten angeren trekkes fra med. */
  readonly lambdaRegret?: number;
}

/**
 * Fitness fra turneringsresultatet.
 *
 * Første turnering (`mesterIdx === null`): fitness følger hvor langt
 * agenten nådde i cupen. Senere generasjoner: fitness er RANGERING
 * RELATIVT TIL FORRIGE MESTER, som selv deltar i feltet – dybden måles som
 * differanse mot mesterens dybde (skiftet så alt er positivt). Slår du
 * mesterens dybde, får du mer enn den; når du kortere, får du mindre.
 *
 * Duplikatpoengene skiller agenter på samme dybde (< 1 i utslag, dybden
 * dominerer alltid), og snittangeren per kontrakt trekkes fra – to agenter
 * som når like langt rangeres etter hvem som byr mest presist.
 */
export function beregnFitness(
  res: TurneringsResultat,
  forrigeMesterIdx: number | null,
  opts: FitnessOpts = {},
  ekskluder: number | null = null,
): number[] {
  // Lav vekt: angeren måles på få kontrakter per cup (høy varians) og ville
  // ellers sprøytet støy inn i seleksjonen; selve LÆRINGEN av anger skjer nå
  // uansett i nettet (kalibreringen), ikke via fradraget.
  const lambda = opts.lambdaRegret ?? 0.25;
  const n = res.dybde.length;
  const maksDybde = Math.max(...res.dybde);
  const referanse = forrigeMesterIdx === null ? 0 : res.dybde[forrigeMesterIdx]!;

  // Målestokken (ekskluder) holdes utenfor normaliseringen – dens enorme
  // poengsum ville ellers klemt sammen poengbonusen for hele feltet.
  let minP = Infinity;
  let maksP = -Infinity;
  for (let i = 0; i < res.poeng.length; i++) {
    if (i === ekskluder) continue;
    minP = Math.min(minP, res.poeng[i]!);
    maksP = Math.max(maksP, res.poeng[i]!);
  }
  const spenn = maksP - minP || 1;

  const fitness = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const relativDybde = res.dybde[i]! - referanse + maksDybde; // ≥ 0
    const base = (relativDybde + 1) * 2;
    // 1,8 < 2 (ett dybdesteg): dybden dominerer fortsatt, men differansen
    // får nå reell seleksjonskraft innen samme dybde – avgjørende når
    // populasjonen er jevn og dybden alene er nesten ren trekningsstøy.
    const poengBonus = ((res.poeng[i]! - minP) / spenn) * 1.8;
    const anger = lambda * res.regretSnitt[i]!;
    fitness[i] = Math.max(0.05, base + poengBonus - anger);
  }

  // Grunnregelen: KUN agenter som SLÅR den regjerende mesteren (når lenger
  // i cupen) får høyere fitness enn den. Poengbonusen kan ellers la en
  // agent på SAMME dybde snike seg over – de klemmes inn rett under
  // mesteren, med innbyrdes rekkefølge bevart.
  if (forrigeMesterIdx !== null) {
    const mesterFit = fitness[forrigeMesterIdx]!;
    const mesterDybde = res.dybde[forrigeMesterIdx]!;
    const over: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i === ekskluder) continue;
      if (i !== forrigeMesterIdx && res.dybde[i]! <= mesterDybde && fitness[i]! >= mesterFit) {
        over.push(i);
      }
    }
    over.sort((a, b) => fitness[b]! - fitness[a]!);
    over.forEach((i, k) => {
      fitness[i] = Math.max(0.05, mesterFit - 0.01 * (k + 1));
    });
  }
  return fitness;
}
