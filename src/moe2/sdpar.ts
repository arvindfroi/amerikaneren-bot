/**
 * PARRET SD: forbedringsoperatoren, med usikkerheten beholdt.
 *
 * HVORFOR DEN FINNES. `vurderSD` trekker verdenene én gang og evaluerer alle
 * kandidatene i NØYAKTIG de samme – parringen er allerede riktig. Men den
 * returnerer bare snittet per kandidat og kaster spredningen. Da kan ingen se
 * om det beste kortets forsprang er ekte eller trukket flaks, og `argmax` over
 * K=12 støyete anslag er vinnerens forbannelse: det kortet som tilfeldigvis
 * fikk de snilleste verdenene vinner.
 *
 * DET ER MÅLT, IKKE ANTATT. 3. august ble SD-orakelet satt inn som spiller i
 * én rolle om gangen mot nettet det selv lærte opp (`ork:`-benken):
 *
 *     spillefører  −0,357     makker  −0,078     forsvar  −0,153
 *
 * Orakelet er DÅRLIGERE enn eleven i alle tre roller. En forbedringsoperator
 * som gjør policyen verre kan ingen mengde destillasjon redde – og det
 * forklarer hvorfor fem trekk-blokker på 278k rader alle målte null.
 *
 * KUREN ER IKKE FLERE VERDENER, DET ER Å VITE NÅR MAN IKKE VET.
 * Fordi alle kandidatene deles om de samme verdenene, er den riktige
 * statistikken den PARREDE differansen per verden:
 *
 *     d_w = verdi(beste, w) − verdi(nest beste, w)
 *
 * Verden-effekten – «denne giva var snill mot alle» – kansellerer i d_w, så
 * SE-en blir langt mindre enn to uavhengige SE-er lagt sammen. Med den kan
 * operatoren si «jeg vet ikke» i stedet for å gjette, og bare overstyre der
 * forspranget overstiger støyen.
 *
 * DET GJØR OPERATOREN KONSERVATIV, OG DET ER MENINGEN. En operator som bare
 * flytter policyen der den er sikker, kan i verste fall la den stå. En som
 * flytter overalt, flytter den mot støy tre av fire ganger.
 */

import { lovligeKort, utfør, type GameState, type Handling } from "../motor.ts";
import type { Verden } from "../solver/sampler.ts";
import { kortTilInt } from "../solver/dds.ts";
import { poengRotVerdier } from "../solver/poengdds.ts";
import { FARGER, type Kort } from "../kort.ts";
import { medVerden, standardMål, trekkVerdener, type Utspiller } from "./sdkort.ts";
import { lagHvemLaVekt } from "./hvemla-slutning.ts";

export interface ParOpts {
  /**
   * Kandidatverdener importance-samplingen får VELGE MELLOM.
   *
   * Sto på 3 – og med tre å velge blant har vektingen nesten ingenting å
   * velge blant. Målt for trosnettet 6. august: +0,68 pp verdenskvalitet ved
   * 3 kandidater mot +2,62 ved 32. Budvektingen har hatt samme begrensning
   * hele tiden, og `vurderPar` sendte tallet ikke engang videre.
   *
   * BILLIG: en kandidat koster én TREKNING, ikke én utspilling, og
   * utspillingene er ~30x dyrere.
   */
  readonly verdenKandidater?: number;
  /**
   * ALPHA-MU-KRITERIET: hvordan utfallene over VERDENER slås sammen til én
   * rangering.
   *
   *   snitt    PIMC. Standard, og bit-identisk med før.
   *   min      maksimin over verdener.
   *   kvantil  nedre kvartil — maksimin uten at én katastrofeverden bestemmer.
   *   flest    i hvor mange verdener er kortet best? alpha-muens Pareto-tanke
   *            i skalar form.
   *
   * HVORFOR DEN FINNES. PIMC-middelet lar et kort se bra ut fordi det er
   * strålende i noen verdener og katastrofalt i andre, og velger det som om vi
   * fikk vite hvilken verden vi er i. Det er strategifusjon, og den er MÅLT to
   * ganger her: `eks:` (§56) og `juks:` (§58) døde begge av den. Dette er den
   * ene formen i litteraturen som angriper den direkte.
   *
   * `sigma` og `beste` regnes fortsatt fra SNITTET uansett kriterium — porten
   * skal måle hvor tydelig valget er, ikke hvilket kriterium som brukes.
   */
  readonly verdenKombi?: "snitt" | "min" | "kvantil" | "flest";
  /**
   * A1: vekt kandidatverdenene etter SPILLET, ikke bare budrunden. Se
   * `src/moe2/spillvekt.ts`. Av som standard - ingen stille regresjon.
   */
  readonly spillvekt?: boolean;
  /**
   * TROEN I VERDENENE (11. sep): vektfunksjonen for DENNE stillingen, bygd av
   * kalleren — se `lagTrovektFraVisning` i `troprior.ts`.
   *
   * Utelukker `spillvekt`. A1 og troen leser det samme beviset (hodet i
   * `verdensvekt.ts`), og begge på samtidig ville telt det to ganger. Det er en
   * feil å be om begge, ikke et valg, så det kastes.
   */
  readonly trovekt?: (v: Verden) => number;
  /** Budvekten på kandidatverdenene. Standard på; av når troen selv leser budet. */
  readonly budvekt?: boolean;
  /**
   * LIKELIHOOD-VEKTEN (12. sep): hvor godt verdenen gjenskaper de andres OBSERVERTE
   * handlinger under en antatt policy — se `likvekt.ts`.
   *
   * LEGGES TIL `trovekt`, den erstatter den ikke. De to leser ulike ting: trohodet sier hvor
   * kortene PLEIER å ligge gitt stillingen, likelihooden hvilke giver som ville fått dem til
   * å spille slik de gjorde. Additivt i log er derfor riktig, og det er samme regel som
   * budvekten og troen alt følger i `trekkVerdenBelief` («tre uavhengige kilder, samme
   * skala»). Udefinert = av, og da er kallet under bit for bit som før.
   */
  readonly likvekt?: (v: Verden) => number;
  /**
   * FRISTEN, i `klokke()`-millisekunder. Utspillingen går VERDEN FOR VERDEN, og en
   * verden som ikke rakk fristen tas ikke med for NOEN kandidat — marginen er
   * fortsatt parvis over nøyaktig de samme verdenene. Udefinert = ingen frist, og
   * all måling går uten.
   */
  readonly frist?: number;
  /** Klokka fristen måles mot. Standard `performance.now()`; prøvene setter sin egen. */
  readonly klokke?: () => number;
  readonly verdener: number;
  readonly rng: () => number;
  readonly mål?: (sluttState: GameState, spiller: number) => number;
  /**
   * K7.2 (11. sep): løs resten av runden EKSAKT i hver verden fra `eksaktBlad` stikk
   * igjen (`poengdds`: hvert sete maksimerer egne poeng) i stedet for å la motparten
   * spille den ferdig. Da er verdien søket rangerer på, i sluttspillet, verdenens
   * likevekt. Udefinert eller 0 = av, bit-identisk med før.
   */
  readonly eksaktBlad?: number;
  /**
   * K4 I SIKKERORAKELET (11. sep): én rollout-policy PER MOTSTANDER, som `motpartFor` i
   * `amuagent.ts`. Udefinert = `motpart` i alle seter, bit-identisk med før.
   *
   * VÅRT EGET SETE bruker alltid `motpart`. Vi kjenner vår egen policy; å slutte den fra
   * residualer og vri den er ren støy — det var nøyaktig feilen K6-nullarmen fant i
   * alpha-mu («en motstandermodell modellerer MOTSTANDERE»).
   *
   * Kalles HØYST ÉN GANG PER SETE PER VURDERING, og svaret gjenbrukes i alle verdenene.
   * Det er ikke bare fart: `Økt.motpartFor` leser boka, og boka endres bare ved
   * `RUNDE_SLUTT`, som ingen utspilling når fram til. Samme vurdering ser derfor samme
   * motstandermodell i hver verden — parringen over verdener forutsetter det.
   */
  readonly motpartFor?: (sete: number) => Utspiller;
  /**
   * ============ FARTSKNOTTENE (17. sep, `D:/amb-grp/loop/fart.md`) =======================
   *
   * Alle tre er AV når feltet mangler, og da kjøres ikke én linje av dem: stien er bit for bit
   * som før (fingeravtrykk over ≥ 120 stillinger, `examples/fart-avtrykk.ts`).
   *
   * KORTEKVIVALENS (`~ekv=1`, Kermit/αμ). To lovlige kort i samme farge uten et LEVENDE kort
   * mellom seg er strategisk likeverdige når poengene er stikk: det som ligger mellom er enten
   * spilt i et FULLFØRT stikk eller på vår egen hånd. Et kort på BORDET mellom dem teller som
   * levende (det ene slår det, det andre ikke), og det etterlyste kortet står alltid alene (det
   * avslører makkeren). Bare én representant per klasse spilles ut — den LAVESTE — og klassen
   * følger med i `ParKandidat.medlemmer`, så porten kan se at nettets kort er «det samme».
   */
  readonly ekvivalens?: boolean;
  /**
   * KANDIDATBESKJÆRING (`~topp=<p>`): bare disse kortene vurderes (en delmengde av de lovlige,
   * valgt av kalleren fra nettets prior). Færre enn to igjen = «ingen data», policyen står.
   */
  readonly kandidater?: readonly Kort[];
  /**
   * FLAT-STOPP (`~flat=<n0>`): er ALLE kandidatene nøyaktig like i hver av de første `n0`
   * verdenene, stopper utspillingen der. Da er hver parvis differanse 0, σ = 0, og nettets kort
   * står — det samme som full kjøring gir hvis resten også er flatt (79 % av stillingene med
   * ≤ 7 kort er flate i fasiten, `seiersmaal.md`).
   */
  readonly flatStopp?: number;
  /**
   * EPIMC (`~epimc=<d>`, 18. sep, `D:/amb-grp/loop/epimc.md`). Udefinert = av, og da kjøres ikke én
   * linje av grenen under — stien er bit for bit som før.
   */
  readonly epimc?: EpimcOpts;
  /**
   * PRØVEHÅNDTAK: ferdig gitte verdener (hender per sete, kort-int) i stedet for `trekkVerdener`.
   * Samme idé som `SDOpts.verdener` i `sdkort.ts`. Udefinert = trekkes som før; ingen spek setter den.
   */
  readonly ferdigeVerdener?: readonly (readonly (readonly number[])[])[];
}

/**
 * ============ EPIMC: DET NESTE EGNE VALGET SOM ETT FELLES VALG (18. sep) ==================
 *
 * Arjonilla, Saffidine & Cazenave (CoG 2024): PIMC løser hver verden som om den var kjent, og
 * lar dermed senere valg tilpasse seg verdenen (strategifusjon). EPIMC utsetter den perfekte
 * oppløsningen: over dybde d bygges et felles tre der noder med SAMME informasjonstilstand er
 * slått sammen og løses med maks over snitt; først under d løses hver verden for seg.
 *
 * HER er d = 1 (og bare 1): botens NESTE egne kortvalg etter rotkortet. For hver verden spilles
 * rotkortet, så spiller politikken de andre setene fram til vi er i tur igjen. Det vi har SETT
 * i mellomtiden er nøyaktig sekvensen av spilte kort (samme rotvisning + samme rotkort), så
 * verdenene grupperes på den sekvensen. Innen en gruppe vurderes hvert kandidatkort c i hver
 * verden, og gruppen får ÉTT kort: argmaks over snittet. Verdien til rotkortet i verden w er
 * verdien av gruppens kort i w — max over snitt, ikke snitt over max.
 *
 * HVOR FUSJONEN FAKTISK SITTER I DETTE SØKET. Utspillingspolitikken (E1-nettet bak vakten)
 * ser bare sin egen visning, så dagens utspillinger tar allerede SAMME valg i verdener setet
 * ikke kan skille. Fusjonen i dagens `sik:` sitter i e-bladet (`poengRotVerdier` er perfekt
 * informasjon). Under e-bladet er egne valg per verden; i bladet ved vår tur gir løseren verdien
 * per kort, og da er det rotkortet i bladet som gjøres felles.
 *
 * SMÅ GRUPPER ER EN FELLE. En gruppe på én verden gjør «felles maks» til maks PER VERDEN — ren
 * fusjon, og verre enn politikken som står der i dag. `minGruppe` lar grupper under grensen
 * beholde dagens verdi (politikkens kort; i bladet løserens per-verden-maks). `kryss` velger
 * kortet for verden w fra gruppen UTEN w (utelat-én), så valget aldri ser w sitt eget utfall;
 * da er ingen seleksjonsskjevhet mulig, og en gruppe på én faller tilbake.
 */
export interface EpimcOpts {
  /** Dybden i EGNE valg. Bare 1 er implementert. */
  readonly dybde: number;
  /** Grupper med færre verdener beholder dagens verdi. Standard 1 (alle grupper velger felles). */
  readonly minGruppe?: number;
  /** Utelat-én: kortet for w velges av gruppen uten w. */
  readonly kryss?: boolean;
  /** Beskjæring på dybde 1 (samme form som `~topp=`): prior ≥ p, pluss politikkens kort. */
  readonly toppP?: number;
  readonly prior?: (state: GameState, sete: number) => ArrayLike<number>;
  /** Kortekvivalens på dybde 1 (politikkens kort står for sin klasse). */
  readonly ekvivalens?: boolean;
}

/** Tellere for EPIMC-grenen, for riggen. Bare satt når `epimc` er på. */
export interface EpimcInfo {
  /** (rotkort, verden)-par som nådde en egen beslutning på dybde 1. */
  noder: number;
  /** Av dem: i e-bladet. */
  bladnoder: number;
  /** Grupper totalt, og grupper som valgte felles (≥ minGruppe). */
  grupper: number;
  felles: number;
  /** Par der gruppens kort var et annet enn dagens (politikkens / løserens per-verden-maks). */
  endret: number;
  /** Ekstra utspillinger (kandidater utover politikkens kort). */
  ekstra: number;
}

export interface ParKandidat {
  readonly kort: Kort;
  /** Snittverdi over verdenene. */
  readonly snitt: number;
  /** Verdien i hver enkelt verden – grunnlaget for den parrede differansen. */
  readonly perVerden: readonly number[];
  /** `ekvivalens`: kortene representanten står for (inkl. seg selv). Udefinert uten knotten. */
  readonly medlemmer?: readonly Kort[];
}

/**
 * EKVIVALENSKLASSENE blant `lovlige` for `spiller` (se `ParOpts.ekvivalens`). Hver klasse er
 * sortert stigende, og klassene står i rekkefølgen til sin laveste i `lovlige`.
 */
export function kortklasser(state: GameState, lovlige: readonly Kort[]): Kort[][] {
  const borte = new Set<number>();
  for (const stikk of state.historikk) for (const kp of stikk.kort) borte.add(kortTilInt(kp.kort));
  const etterlyst = state.etterlyst === null ? -1 : kortTilInt(state.etterlyst);
  const ints = lovlige.map(kortTilInt);
  const orden = ints.map((_, i) => i).sort((a, b) => ints[a]! - ints[b]!);
  const klasseAv = new Array<number>(lovlige.length).fill(-1);
  const klasser: number[][] = [];
  for (let j = 0; j < orden.length; j++) {
    const i = orden[j]!;
    const c = ints[i]!;
    const forrige = j > 0 ? orden[j - 1]! : -1;
    let slåSammen = false;
    if (forrige >= 0 && c !== etterlyst) {
      const p = ints[forrige]!;
      if (p !== etterlyst && Math.floor(p / 13) === Math.floor(c / 13)) {
        slåSammen = true;
        for (let m = p + 1; m < c; m++) {
          if (!borte.has(m)) {
            slåSammen = false;
            break;
          }
        }
      }
    }
    if (slåSammen) {
      klasseAv[i] = klasseAv[forrige]!;
      klasser[klasseAv[i]!]!.push(i);
    } else {
      klasseAv[i] = klasser.length;
      klasser.push([i]);
    }
  }
  // Rekkefølge: etter laveste medlems plass i `lovlige`, så representantene står som før.
  klasser.sort((a, b) => Math.min(...a) - Math.min(...b));
  return klasser.map((k) => k.map((i) => lovlige[i]!));
}

export interface ParResultat {
  readonly kandidater: readonly ParKandidat[];
  /** Antall verdener som faktisk lot seg trekke. */
  readonly n: number;
  /** Beste kandidat etter snitt. */
  readonly beste: ParKandidat;
  /** Nest beste etter snitt, eller null om det bare fantes én kandidat. */
  readonly nestBeste: ParKandidat | null;
  /**
   * PARRET margin: snittet av (beste − nest beste) per verden. Identisk med
   * differansen av snittene, men SE-en under hører til DENNE størrelsen.
   */
  readonly margin: number;
  /** SE til marginen, regnet på de parvise differansene. NaN om n < 2. */
  readonly marginSE: number;
  /** margin / marginSE. 0 når SE er 0 eller udefinert. */
  readonly sigma: number;
  /** EPIMC-tellerne; bare med `epimc`. */
  readonly epimc?: EpimcInfo;
}

function spillFerdig(start: GameState, motpart: Utspiller): GameState {
  let s = start;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    s = utfør(s, motpart.velgHandling(s)).state;
  }
  return s;
}

/**
 * K7.2: motparten spiller til `blad` stikk igjen, og poengløseren tar resten i verdenen.
 *
 * Verdenen er åpen for løseren – det er PIMC, som resten av søket: hver verden løses som
 * om alle visste hvilken den var. Tilstanden som returneres har `totalPoeng` lagt til
 * likevektens rundepoeng, som er alt `standardMål` og `lagMål` leser. Kan løseren ikke
 * brukes (ingen kontrakt, tom hånd), spilles runden ferdig som før.
 */
function spillFerdigEksakt(start: GameState, motpart: Utspiller, blad: number): GameState {
  let s = start;
  let vakt = 0;
  while (s.fase === "SPILL" && s.giving.antallStikk - s.stikkSpilt > blad && vakt++ < 20_000) {
    s = utfør(s, motpart.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL" || s.iTur === null || s.budvinner === null || s.melding === null) {
    return spillFerdig(s, motpart);
  }
  const hender = s.hender.map((h) => h.map(kortTilInt));
  if (hender.some((h) => h.length === 0)) return spillFerdig(s, motpart);
  const svar = poengRotVerdier({
    N: s.antallSpillere,
    trump: s.trumf ? FARGER.indexOf(s.trumf) : 0,
    hender,
    iTur: s.iTur,
    bord: s.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) })),
    stikkFør: s.stikkVunnet.slice(),
    ferdigeStikk: s.stikkSpilt,
    totalStikk: s.giving.antallStikk,
    budvinner: s.budvinner,
    makker: s.makker,
    melding: s.melding,
    målPoeng: s.regler.målPoeng,
    mål: "diff",
  });
  // Setet i tur spiller sitt beste kort; første av like gode, som løserens egen konvensjon.
  let beste = svar.verdier[0];
  for (const v of svar.verdier) if (beste === undefined || v.verdi > beste.verdi) beste = v;
  if (beste === undefined) return spillFerdig(s, motpart);
  const poeng = beste.poeng;
  return { ...s, totalPoeng: s.totalPoeng.map((t, p) => t + (poeng[p] ?? 0)) };
}

/**
 * ============ EPIMC-MASKINERIET (d = 1) ============
 *
 * `tilEgenNode`: politikken spiller de ANDRE setene fram til vi er i tur, runden er over, eller
 * e-bladet begynner med et annet sete i tur. Nøyaktig samme løkke-betingelser som
 * `spillFerdigEksakt`/`spillFerdig`, så det som skjer før noden er det samme som før.
 */
type Egennode =
  | { readonly slutt: GameState }
  | { readonly node: GameState; readonly nøkkel: string; readonly blad: boolean };

/** Returnerer selve tilstanden (har `fase`) når e-bladet begynner med et annet sete i tur. */
function tilEgenNode(start: GameState, utspiller: Utspiller, sete: number, blad: number | undefined): Egennode | GameState {
  let s = start;
  let vakt = 0;
  let nøkkel = "";
  const iBlad = (x: GameState): boolean => blad !== undefined && x.giving.antallStikk - x.stikkSpilt <= blad;
  while (s.fase === "SPILL" && s.iTur !== null && vakt++ < 20_000) {
    if (s.iTur === sete) return { node: s, nøkkel, blad: iBlad(s) };
    // e-bladet begynner med et annet sete i tur: ingen egen beslutning over bladet.
    if (iBlad(s)) return s;
    const h = utspiller.velgHandling(s);
    if (h.type === "SPILL") nøkkel += `${h.spiller}.${kortTilInt(h.kort)},`;
    s = utfør(s, h).state;
  }
  return { slutt: s };
}

/** Løserens svar i `s` (setet i tur), eller null når løseren ikke kan brukes. Som `spillFerdigEksakt`. */
function eksaktSvar(s: GameState): ReturnType<typeof poengRotVerdier> | null {
  if (s.fase !== "SPILL" || s.iTur === null || s.budvinner === null || s.melding === null) return null;
  const hender = s.hender.map((h) => h.map(kortTilInt));
  if (hender.some((h) => h.length === 0)) return null;
  const svar = poengRotVerdier({
    N: s.antallSpillere,
    trump: s.trumf ? FARGER.indexOf(s.trumf) : 0,
    hender,
    iTur: s.iTur,
    bord: s.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) })),
    stikkFør: s.stikkVunnet.slice(),
    ferdigeStikk: s.stikkSpilt,
    totalStikk: s.giving.antallStikk,
    budvinner: s.budvinner,
    makker: s.makker,
    melding: s.melding,
    målPoeng: s.regler.målPoeng,
    mål: "diff",
  });
  return svar.verdier.length === 0 ? null : svar;
}

/** Løserens representant er den HØYESTE i en sekvens; et annet kort slås opp mot nærmeste over i fargen. */
function slåOppSvar(verdier: ReturnType<typeof poengRotVerdier>["verdier"], c: number): number {
  let beste = -1;
  let r0 = Infinity;
  for (let i = 0; i < verdier.length; i++) {
    const k = verdier[i]!.kort;
    if (k === c) return i;
    if (Math.floor(k / 13) === Math.floor(c / 13) && k % 13 > c % 13 && k % 13 < r0) {
      r0 = k % 13;
      beste = i;
    }
  }
  return beste;
}

/** Én dybde-1-node for ett (rotkort, verden)-par. `v[j]` er verdien av kandidat j; `fall` er dagens verdi. */
interface Nodeverdi {
  readonly v: readonly number[];
  readonly fall: number;
  /** Indeksen i `v` dagens verdi tilsvarer (politikkens kort), eller −1 (bladets per-verden-maks). */
  readonly fallJ: number;
}
interface Gruppe {
  readonly kand: readonly Kort[];
  readonly politikk: Kort | null;
  readonly blad: boolean;
  /** Per verden i gruppen: verdensindeks og nodeverdiene. */
  readonly medlem: { w: number; nv: Nodeverdi }[];
}

/**
 * Kandidatene på dybde 1 for `node` (vår tur). Politikkens kort først og som representant for sin
 * klasse, så «dagens verdi» alltid er med. Avhenger bare av det vi ser i `node`, så den regnes én
 * gang per gruppe.
 */
function dybde1Kandidater(node: GameState, sete: number, politikk: Kort, e: EpimcOpts): Kort[] {
  let lov = lovligeKort(node, sete);
  if (e.toppP !== undefined && e.prior !== undefined) {
    const logits = e.prior(node, sete);
    const kidx = (k: Kort): number => FARGER.indexOf(k.farge) * 13 + (k.verdi - 2);
    let maks = -Infinity;
    for (const k of lov) maks = Math.max(maks, logits[kidx(k)]!);
    let z = 0;
    for (const k of lov) z += Math.exp(logits[kidx(k)]! - maks);
    const p = e.toppP;
    lov = lov.filter((k) => {
      const l = logits[kidx(k)]!;
      return l === maks || (k.farge === politikk.farge && k.verdi === politikk.verdi) || Math.exp(l - maks) / z >= p;
    });
  }
  const lik = (a: Kort, b: Kort): boolean => a.farge === b.farge && a.verdi === b.verdi;
  if (e.ekvivalens === true) {
    const klasser = kortklasser(node, lov);
    lov = klasser.map((kl) => kl.find((k) => lik(k, politikk)) ?? kl[0]!);
  }
  return [politikk, ...lov.filter((k) => !lik(k, politikk))];
}

/**
 * RUTEREN: hvem som er i tur bestemmer hvilken policy som spiller, som i `Alphamuagent`.
 * Utspillingene tar én `Utspiller`, så modellen per sete pakkes bak én — da trenger
 * verken `spillFerdig` eller `spillFerdigEksakt` å vite at det finnes flere.
 */
function lagRuter(motpart: Utspiller, motpartFor: (sete: number) => Utspiller, egetSete: number): Utspiller {
  const perSete = new Map<number, Utspiller>();
  return {
    velgHandling: (s: GameState): Handling => {
      const p = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (p === null || p === undefined || p === egetSete) return motpart.velgHandling(s);
      let m = perSete.get(p);
      if (m === undefined) {
        m = motpartFor(p);
        perSete.set(p, m);
      }
      return m.velgHandling(s);
    },
  };
}

/**
 * Vurderer hvert lovlige kort i K FELLES verdener og beholder verdien per
 * verden, så marginen mellom de to beste kan testes parvis.
 *
 * Returnerer null når ingen verden lot seg trekke, eller når det bare finnes
 * ett lovlig kort. Kalleren skal da la policyen stå – «ingen data» er ikke det
 * samme som «alle valg er like gode», og å blande dem sammen er feilen som
 * gjorde `lærForsvar` verre enn ingenting.
 */
export function vurderPar(
  state: GameState,
  spiller: number,
  motpart: Utspiller,
  opts: ParOpts,
): ParResultat | null {
  const alleLovlige = lovligeKort(state, spiller);
  if (alleLovlige.length < 2) return null;
  let lovlige: readonly Kort[] = alleLovlige;
  if (opts.kandidater !== undefined) {
    const valgt = opts.kandidater;
    lovlige = alleLovlige.filter((k) => valgt.some((v) => v.farge === k.farge && v.verdi === k.verdi));
    if (lovlige.length < 2) return null;
  }
  let klasser: Kort[][] | null = null;
  if (opts.ekvivalens === true) {
    klasser = kortklasser(state, lovlige);
    // Representanten er klassens LAVESTE kort.
    lovlige = klasser.map((k) => k[0]!);
    if (lovlige.length < 2) {
      // Alle lovlige kort er likeverdige: søket har ingenting å skille.
      return null;
    }
  }
  if (opts.spillvekt === true && opts.trovekt !== undefined) {
    throw new Error("vurderPar: spillvekt og trovekt leser det samme beviset - velg én");
  }

  /**
   * VEKTEN PÅ KANDIDATVERDENENE. Uten `likvekt` er dette NØYAKTIG uttrykket som sto her, og
   * samme funksjonsobjekt går videre — ingen ny lukning, ingen ny gren, bit-identisk.
   */
  const grunnvekt = opts.trovekt ?? (opts.spillvekt === true ? lagHvemLaVekt(state, spiller) : undefined);
  const lik = opts.likvekt;
  const vekt =
    lik === undefined ? grunnvekt : (v: Verden): number => (grunnvekt === undefined ? 0 : grunnvekt(v)) + lik(v);

  const verdener = opts.ferdigeVerdener !== undefined ? opts.ferdigeVerdener.map((v) => v.map((h) => h.slice())) : trekkVerdener(
    state,
    spiller,
    opts.verdener,
    opts.rng,
    undefined,
    vekt,
    opts.verdenKandidater,
    undefined,
    opts.budvekt ?? true,
  );
  if (verdener.length === 0) return null;
  const mål = opts.mål ?? standardMål;
  const klokke = opts.klokke ?? ((): number => performance.now());
  // Uten `motpartFor` er dette SAMME objekt som før, og utspillingene er bit-identiske.
  const utspiller = opts.motpartFor === undefined ? motpart : lagRuter(motpart, opts.motpartFor, spiller);

  /**
   * VERDEN FOR VERDEN, ikke kort for kort (11. sep). Det er det som gjør fristen
   * mulig uten å ødelegge parringen: en verden er enten spilt ut for ALLE kandidatene
   * eller for ingen. Rekkefølgen endrer ingen verdi — motparten er tilstandsløs i SPILL
   * (E1, vakt og budagent holder ingenting mellom kall der), og hver utspilling starter
   * fra sin egen `medVerden`. `test/sik-tro.test.ts` holder den gamle rekkefølgen som
   * referanse.
   */
  const verdier: number[][] = lovlige.map(() => []);
  let brukt = 0;
  const flatStopp = opts.flatStopp;
  let flatHittil = true;
  const epimc = opts.epimc;
  if (epimc !== undefined) {
    return epimcLøkke(state, spiller, lovlige, klasser, verdener, utspiller, mål, klokke, opts, epimc);
  }
  for (const hender of verdener) {
    if (opts.frist !== undefined && klokke() >= opts.frist) break;
    for (let i = 0; i < lovlige.length; i++) {
      const h: Handling = { type: "SPILL", spiller, kort: lovlige[i]! };
      const etter = utfør(medVerden(state, hender, spiller), h).state;
      const slutt =
        opts.eksaktBlad !== undefined && opts.eksaktBlad > 0
          ? spillFerdigEksakt(etter, utspiller, opts.eksaktBlad)
          : spillFerdig(etter, utspiller);
      verdier[i]!.push(mål(slutt, spiller));
    }
    brukt++;
    if (flatStopp !== undefined) {
      if (flatHittil) {
        const v0 = verdier[0]![brukt - 1]!;
        for (let i = 1; i < lovlige.length; i++) {
          if (verdier[i]![brukt - 1] !== v0) {
            flatHittil = false;
            break;
          }
        }
      }
      if (flatHittil && brukt >= flatStopp) break;
    }
  }
  return rangér(lovlige, klasser, verdier, brukt, opts, undefined);
}

/**
 * EPIMC-løkka (se `EpimcOpts`). Verden for verden som over, så fristen kutter hele verdener; men
 * verdien per (rotkort, verden) er først kjent når gruppene er fylt, så den settes etter løkka.
 */
function epimcLøkke(
  state: GameState,
  spiller: number,
  lovlige: readonly Kort[],
  klasser: Kort[][] | null,
  verdener: readonly (readonly number[][])[] | readonly number[][][],
  utspiller: Utspiller,
  mål: (s: GameState, spiller: number) => number,
  klokke: () => number,
  opts: ParOpts,
  e: EpimcOpts,
): ParResultat | null {
  if (e.dybde !== 1) throw new Error(`vurderPar: epimc-dybde ${e.dybde} er ikke implementert (bare 1)`);
  const minGruppe = e.minGruppe ?? 1;
  const kryss = e.kryss === true;
  const blad = opts.eksaktBlad !== undefined && opts.eksaktBlad > 0 ? opts.eksaktBlad : undefined;
  const fullfør = (s: GameState): GameState =>
    blad !== undefined ? spillFerdigEksakt(s, utspiller, blad) : spillFerdig(s, utspiller);
  const info: EpimcInfo = { noder: 0, bladnoder: 0, grupper: 0, felles: 0, endret: 0, ekstra: 0 };
  const verdier: number[][] = lovlige.map(() => []);
  const grupper: Map<string, Gruppe>[] = lovlige.map(() => new Map());
  let brukt = 0;
  let flatHittil = true;
  for (const hender of verdener) {
    if (opts.frist !== undefined && klokke() >= opts.frist) break;
    const w = brukt;
    const sett: number[] = [];
    for (let i = 0; i < lovlige.length; i++) {
      const h: Handling = { type: "SPILL", spiller, kort: lovlige[i]! };
      const etter = utfør(medVerden(state, hender as number[][], spiller), h).state;
      const r = tilEgenNode(etter, utspiller, spiller, blad);
      if ("fase" in r || "slutt" in r) {
        const x = mål(fullfør("fase" in r ? r : r.slutt), spiller);
        verdier[i]!.push(x);
        sett.push(x);
        continue;
      }
      const node = r.node;
      let nv: Nodeverdi;
      let kand: Kort[];
      let politikk: Kort | null = null;
      const nøkkel = `${r.blad ? "B" : "N"}|${r.nøkkel}`;
      const g0 = grupper[i]!.get(nøkkel);
      if (r.blad) {
        const svar = eksaktSvar(node);
        if (svar === null) {
          const x = mål(spillFerdig(node, utspiller), spiller);
          verdier[i]!.push(x);
          sett.push(x);
          continue;
        }
        kand = g0?.kand.slice() ?? lovligeKort(node, spiller);
        const medPoeng = (poeng: readonly number[]): number =>
          mål({ ...node, totalPoeng: node.totalPoeng.map((t, p) => t + (poeng[p] ?? 0)) }, spiller);
        // Dagens verdi: løserens beste for setet i tur, første av like gode (som `spillFerdigEksakt`).
        let beste = svar.verdier[0]!;
        for (const v of svar.verdier) if (v.verdi > beste.verdi) beste = v;
        const fall = medPoeng(beste.poeng);
        const v = kand.map((c) => {
          const j = slåOppSvar(svar.verdier, kortTilInt(c));
          return j < 0 ? fall : medPoeng(svar.verdier[j]!.poeng);
        });
        nv = { v, fall, fallJ: -1 };
        info.bladnoder++;
      } else {
        const ph = utspiller.velgHandling(node);
        if (ph.type !== "SPILL") {
          const x = mål(fullfør(node), spiller);
          verdier[i]!.push(x);
          sett.push(x);
          continue;
        }
        politikk = ph.kort;
        kand = g0?.kand.slice() ?? dybde1Kandidater(node, spiller, politikk, e);
        // Gruppens kandidater, ikke denne verdenens politikkort: kandidatlista er FELLES for gruppen.
        const v = kand.map((c) => mål(fullfør(utfør(node, { type: "SPILL", spiller, kort: c }).state), spiller));
        info.ekstra += kand.length - 1;
        // Dagens verdi er politikkens kort i DENNE verdenen. Politikken i `sik:` ser bare visningen, så
        // det er gruppens kort 0; en politikk som ser mer (prøvene) kan velge et annet, som da spilles ut.
        const fallJ = kand.findIndex((c) => c.farge === politikk!.farge && c.verdi === politikk!.verdi);
        const fall = fallJ >= 0 ? v[fallJ]! : mål(fullfør(utfør(node, ph).state), spiller);
        nv = { v, fall, fallJ };
      }
      info.noder++;
      let g = g0;
      if (g === undefined) {
        g = { kand, politikk, blad: r.blad, medlem: [] };
        grupper[i]!.set(nøkkel, g);
      }
      g.medlem.push({ w, nv });
      // Plassholder: dagens verdi; byttes ut når gruppen er kjent.
      verdier[i]!.push(nv.fall);
      sett.push(nv.fall, ...nv.v);
    }
    brukt++;
    if (opts.flatStopp !== undefined) {
      // Flatt = ALT som ble regnet i verdenen er likt, også dybde-1-kandidatene: da kan intet valg skille.
      if (flatHittil) for (const x of sett) if (x !== sett[0]) flatHittil = false;
      if (flatHittil && brukt >= opts.flatStopp) break;
    }
  }
  if (brukt === 0) return null;

  // FELLES VALG PER GRUPPE: maks over snitt (utelat-én med `kryss`).
  for (let i = 0; i < lovlige.length; i++) {
    for (const g of grupper[i]!.values()) {
      info.grupper++;
      const n = g.medlem.length;
      if (n < minGruppe || (kryss && n < 2)) continue;
      info.felles++;
      const J = g.kand.length;
      const sum = new Float64Array(J);
      for (const m of g.medlem) for (let j = 0; j < J; j++) sum[j]! += m.nv.v[j]!;
      const argmaks = (utenfor: Nodeverdi | null): number => {
        let bj = 0;
        let bv = -Infinity;
        for (let j = 0; j < J; j++) {
          const x = utenfor === null ? sum[j]! : sum[j]! - utenfor.v[j]!;
          if (x > bv + 1e-9) {
            bv = x;
            bj = j;
          }
        }
        return bj;
      };
      const felles = kryss ? -1 : argmaks(null);
      for (const m of g.medlem) {
        const j = kryss ? argmaks(m.nv) : felles;
        const x = m.nv.v[j]!;
        if (g.blad ? x !== m.nv.fall : j !== m.nv.fallJ) info.endret++;
        verdier[i]![m.w] = x;
      }
    }
  }
  return rangér(lovlige, klasser, verdier, brukt, opts, info);
}

/** Rangering, margin og σ fra verdiene per verden — felles for PIMC og EPIMC. */
function rangér(
  lovlige: readonly Kort[],
  klasser: Kort[][] | null,
  verdier: number[][],
  brukt: number,
  opts: ParOpts,
  info: EpimcInfo | undefined,
): ParResultat | null {
  // Fristen rakk ikke én verden: «ingen data», og policyen skal stå.
  if (brukt === 0) return null;

  const kandidater: ParKandidat[] = lovlige.map((kort, i) => {
    const perVerden = verdier[i]!;
    const snitt = perVerden.reduce((a, b) => a + b, 0) / perVerden.length;
    return klasser === null ? { kort, snitt, perVerden } : { kort, snitt, perVerden, medlemmer: klasser[i]! };
  });

  /**
   * RANGERINGEN. Med `snitt` er dette nøyaktig som før. De andre kriteriene
   * bruker `perVerden`, som allerede ble regnet ut — de koster ingen ekstra
   * utspillinger.
   */
  const vk = opts.verdenKombi ?? "snitt";
  const rang = new Map<ParKandidat, number>();
  if (vk === "flest") {
    for (const k of kandidater) rang.set(k, 0);
    for (let w = 0; w < brukt; w++) {
      let best = -Infinity;
      for (const k of kandidater) if (k.perVerden[w]! > best) best = k.perVerden[w]!;
      const vinnere = kandidater.filter((k) => k.perVerden[w]! >= best - 1e-9);
      for (const k of vinnere) rang.set(k, rang.get(k)! + 1 / vinnere.length);
    }
  } else {
    for (const k of kandidater) {
      if (vk === "snitt") {
        rang.set(k, k.snitt);
        continue;
      }
      const v = [...k.perVerden].sort((a, b) => a - b);
      rang.set(k, vk === "min" ? v[0]! : v[Math.floor(0.25 * (v.length - 1))]!);
    }
  }
  const sortert = kandidater.slice().sort((a, b) => rang.get(b)! - rang.get(a)!);
  const beste = sortert[0]!;
  const nestBeste = sortert[1] ?? null;

  if (nestBeste === null) {
    return {
      kandidater,
      n: brukt,
      beste,
      nestBeste: null,
      margin: 0,
      marginSE: Number.NaN,
      sigma: 0,
      ...(info === undefined ? {} : { epimc: info }),
    };
  }

  // PARVIS per verden. Verden-effekten kansellerer her, og det er hele grunnen
  // til at kandidatene måtte dele verdener.
  const d = beste.perVerden.map((x, i) => x - nestBeste.perVerden[i]!);
  const margin = d.reduce((a, b) => a + b, 0) / d.length;
  let marginSE = Number.NaN;
  if (d.length > 1) {
    const varians = d.reduce((a, x) => a + (x - margin) ** 2, 0) / (d.length - 1);
    marginSE = Math.sqrt(varians / d.length);
  }
  const sigma = Number.isFinite(marginSE) && marginSE > 1e-12 ? margin / marginSE : 0;
  return info === undefined
    ? { kandidater, n: brukt, beste, nestBeste, margin, marginSE, sigma }
    : { kandidater, n: brukt, beste, nestBeste, margin, marginSE, sigma, epimc: info };
}
