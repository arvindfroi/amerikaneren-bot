/**
 * MLB — SANDKASSENS TREKKBYGGER. Alt vi har bygd, som INNGANGER.
 *
 * `docs/sandkassen.md`: «ett nett som tar alle beslutninger, med alt vi har
 * bygd som INNGANGER.» Denne fila er inngangene, og bare dem. Den tar ingen
 * beslutning, den vekter ingenting, og den har ingen mening om hva som er lurt.
 *
 * ===================== K2 ER STRUKTURELL, IKKE LOVET =====================
 *
 * `byggTrekk` tar `SpillerVisning`, ALDRI `GameState`. Motoren har allerede
 * redigert bort andres hender, talongen, andres vrak og uavslørt makker, så de
 * skjulte kortene FINNES ikke i det funksjonen ser. Det er en typegrense, ikke
 * en konvensjon — og `test/mlb-k2-trekk.test.ts` bytter i tillegg ut de skjulte
 * hendene og krever BIT-IDENTISK vektor, med en kontrollarm som lekker én bit
 * og blir tatt.
 *
 * ===================== GJENBRUK, IKKE OMSKRIVING =========================
 *
 * MIKRO er `e1SpillTrekk` på 273 — de samme 273 tallene dagens utrullede nett
 * leser, hverken flere eller færre. KONVENSJONSBLOKKEN er `vaktKort` selv, og
 * MAKRO bruker `racepress` slik den står. Ingen av dem er skrevet om.
 *
 * De tar alle `GameState`. Broen er `visningTilState`: en REDIGERT stat bygd
 * av visningen alene, der de andre hendene er TOMME. Det er ikke en lekkasje —
 * det er det motsatte. Tomme hender betyr at enhver konsument som forsøker å
 * lese skjult informasjon får et annet svar enn i den ekte staten, og
 * `test/mlb-trekk.test.ts` krever bit-identitet mot den ekte staten på begge.
 * Prosaen i `konvensjonsvakt.ts` om «informasjonsdisiplin» er dermed målt i
 * stedet for lovet.
 *
 * ===================== BLOKKENE ==========================================
 *
 *   MIKRO         273   stikket: hånd, spilte kort, renonser, trumfkontroll
 *   TRO           261   trohodets fordeling: P(hvert usett kort ligger hvor)
 *   HUKOMMELSE    144   motstanderboka, LÅST layout fra `hukommelse.ts`
 *   MESO          186   budrunden, kontrakten, vraket, trumfvalget, lagstikk
 *   MAKRO          23   kampstillingen, racepresset - OG LØPSLENGDEN
 *   KONVENSJON     71   hva hver `vaktKort`-regel ville valgt
 *   LOVLIG         73   masken fra `handling.ts`, uendret
 *   ------------------
 *   TREKK_LENGDE 1031
 *
 * ===================== ÉN INNGANG ER FJERNET, OG BARE ÉN (§126) ========
 *
 * Arkitekturrevisjonen fant 222 innganger som «ikke baerer informasjon», og
 * førsteutkastet til §126 fjernet 215 av dem. Det var galt, og det er verdt
 * å skrive ned HVORFOR, fordi feilen er lett aa gjoere igjen.
 *
 * De 209 tro-inngangene fikk aldri gradient. Men grunnen var ikke at de er
 * informasjonsløse — det var at INGEN DRIVER SATTE DEM. Blokken var eksakt
 * null i hver rad, så den kunne per konstruksjon ikke få gradient. Målingen
 * som skulle vise at de er verdiløse («nettets egen tro flytter 5,62 % av
 * valgene, uniform stoey 5,17 %») ble gjort på et nett som ALDRI har trent
 * med dem påkoblet. Tilfeldig initierte vekter på en ny inngang kan ikke gi
 * annet enn stoey. Målingen svarte altså på et annet spørsmål enn det som
 * ble stilt.
 *
 * Sandkassens premiss er det motsatte: alle sensorene på, og så lar vi
 * nettet finne ut av resten. Troen er derfor KOBLET PÅ fra epoke 0 - se
 * `Trekkontekst.tronett`. Det koster 1,84× per beslutning, og den prisen er
 * tatt med vilje, slik at spørsmålet «tilfører en eksplisitt tro noe utover
 * hodet?» blir MÅLT for første gang i stedet for antatt i begge retninger.
 *
 * ===================== REGELEN SOM STÅR IGJEN =========================
 *
 * En inngang fjernes bare når det kan BEVISES at den aldri kan bære
 * informasjon. Er det tvil, står den. Etter den regelen er det nøyaktig én:
 *
 *   `lovlig.bud:13`   Fire spillere gir 12 stikk, så bud 13 er aldri lovlig.
 *                     Det er ikke en utrent sensor, det er en tom plass i
 *                     handlingsrommet - og påstanden er PRØVD mot `maske()`
 *                     selv over hver stilling i seks hele kamper, ikke bare
 *                     observert i et utvalg.
 *
 * DISSE STÅR, selv om de er konstante i dag:
 *
 *   `meso.iTur.rel1/2/3` og `meso.utspiller.rel0` SER strukturelt umulige ut -
 *   vektoren bygges for setet som bestemmer, saa «hvem er i tur» skulle alltid
 *   vært meg selv. Men det er en KONTRAKT om hvem `byggTrekk` kalles for,
 *   ikke noe typene håndhever, og målingen bak paastanden er «fikk aldri
 *   gradient», som er observasjon og ikke bevis. De står.
 *
 *   `mikro.bias` og `meso.iTur.rel0` er begge konstant 1, og én av dem er
 *   overflødig. Den ENESTE som er provbart konstant er `mikro.bias` - den
 *   andre er bare konstant hvis kontrakten over holder. Og `mikro.bias` kan
 *   ikke fjernes uten å bryte en sterkere regel: MIKRO ER `e1SpillTrekk` på
 *   273, hverken flere eller færre, og det er den invarianten som hindrer at
 *   sandkassen og det utrullede nettet leser ulike sensorer. Én overflødig
 *   bias-inngang koster ingenting maalbart. Å bryte den invarianten kan koste
 *   en hel klasse stille feil. Begge står, og det er et valg, ikke en
 *   forglemmelse.
 *
 * ===================== ÉN LOVLIGHETSREGEL, IKKE TO =======================
 *
 * LOVLIG-blokken er `handling.maske(...)` slik den står, pluss hvilket delsteg
 * masken gjelder for. Første utkast kodet lovligheten på nytt i 173 egne trekk,
 * fase for fase. Det var to lister med de samme tallene — nøyaktig feilklassen
 * `neat/trekk.ts` advarer mot der `INNGANG` eksporteres: «kodingen ville
 * fortsatt kjørt, bare med feil sensorer koblet.» Nå finnes regelen ett sted,
 * og `test/mlb-handling.test.ts` prøver den mot motorens egen `lovligeHandlinger`.
 *
 * ===================== HVORFOR `målPoeng` MÅ VÆRE ET TREKK ===============
 *
 * `docs/mlb.md` §8: vi TRENER på løp til 30 og DØMMER på 100. Er løpslengden
 * ikke en inngang, kan nettet ikke lære at presset er RELATIVT — det lærer
 * «20 poeng bak er kritisk», som er sant ved 30 og feil ved 100. Da måler
 * dommen noe annet enn treningen lærte, og avviket ville sett ut som at
 * makroatferden ikke overførte seg. Den ligger i MAKRO i to skalaer, slik at
 * begge regimer er lesbare uten at nettet må invertere noe.
 *
 * ===================== HUKOMMELSEN SER BARE FORTIDEN =====================
 *
 * `Hukommelse.observer` bokfører bare ved `RUNDE_SLUTT`. Blokken er derfor
 * KONSTANT gjennom hele runde `r` og endrer seg først når runden er over.
 * Det er nettopp det som gjør at K2 kan holde med full hukommelse påslått, og
 * det er prøvd for seg i `test/mlb-k2-trekk.test.ts`.
 */

import { FARGER, likeKort, type Kort } from "../kort.ts";
import type { GameState, SpillerVisning } from "../motor.ts";
import { AMERIKANER, SOLO, type GameRules, type Kortgiving } from "../regler.ts";
import { E1_SPILL_DIM, e1SpillTrekk } from "../e1/trekk.ts";
import { vaktKort, type Vaktvalg } from "../moe2/konvensjonsvakt.ts";
import { racepress } from "../moe2/race.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import {
  antallLovlige,
  HANDLING_LENGDE,
  HANDLING_NAVN,
  maske,
  nesteDelsteg,
  TOMT_DELVALG,
  type Delsteg,
  type Delvalg,
} from "./handling.ts";
import type { Beslutning } from "../neat/trekk.ts";
import { HUKOMMELSE_LENGDE_4, LEDD_NAVN, LENGDE_PER_SETE } from "./hukommelse.ts";
import { MLB_TRO_KLASSER, MLB_TRO_KORT, troTrekk } from "./trotrekk.ts";

/** De fire fasene. Re-eksportert så kallere har ÉN kilde til navnene. */
export type { Beslutning };

// ===========================================================================
// 0. Små hjelpere
// ===========================================================================

const klipp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const klipp11 = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);

/** «S2» … «K14». Samme rekkefølge som `kortIndeks`. */
export const KORTNAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (const f of FARGER) for (let v = 2; v <= 14; v++) ut.push(`${f}${v}`);
  return ut;
})();

const REL = ["rel0", "rel1", "rel2", "rel3"] as const;

// ===========================================================================
// 1. Broen: en REDIGERT stat bygd av visningen alene
// ===========================================================================

/**
 * En `GameState` som inneholder NØYAKTIG det visningen inneholder, og ikke ett
 * bit mer. De andre hendene er tomme, talongen er tom, og vraket er bare mitt
 * eget (som bare budvinneren har).
 *
 * ============ HVORFOR TOMME HENDER ER RIKTIG, IKKE SLURV ================
 *
 * Alternativet — å fylle dem med plausible kort — ville vært å DIKTE OPP
 * informasjon, og en konsument som leste dem ville fått et svar som så
 * rimelig ut. Tomme hender gir i stedet et ÅPENBART galt svar hvis noen leser
 * dem, og identitetsprøven mot den ekte staten fanger det umiddelbart.
 *
 * ============ MAKKEREN, SOM ER DET ENESTE SUBTILE PUNKTET ===============
 *
 * `spillerVisning` setter `makker` til null før avsløringen — også for den som
 * ER makkeren. Men den som sitter med det etterlyste kortet VET at hun er
 * makker; det er lovlig, privat kunnskap, og både `spillTrekk` og
 * `lagetSynlig` bruker den. Den rekonstrueres her av egen hånd:
 * `motor.velgTrumf` setter `makker = finnKortholder(hender, etterlyst)`, og
 * `lovligeEtterlys` forbyr å etterlyse et kort man selv har eller har vraket.
 * Å holde det etterlyste kortet er derfor EKVIVALENT med å være makkeren, og
 * ekvivalensen er prøvd, ikke antatt.
 */
export function visningTilState(
  visning: SpillerVisning,
  regler: GameRules,
  giving: Kortgiving,
): GameState {
  const n = visning.antallKort.length;
  const meg = visning.deg;
  const hender: Kort[][] = Array.from({ length: n }, () => []);
  hender[meg] = visning.dinHånd.slice();

  const holderEtterlyst =
    visning.etterlyst !== null && visning.dinHånd.some((k) => likeKort(k, visning.etterlyst!));
  const makker = visning.makker !== null ? visning.makker : holderEtterlyst ? meg : null;

  return {
    regler,
    giving,
    antallSpillere: n,
    frø: 0,
    rundeNr: visning.rundeNr,
    giver: visning.giver,
    fase: visning.fase,
    iTur: visning.iTur,
    totalPoeng: visning.totalPoeng.slice(),
    vinner: visning.vinner,
    hender,
    talong: [],
    budrunde: {
      passet: visning.budrunde.passet.slice(),
      høyeste: visning.budrunde.høyeste,
      sisteBud: visning.budrunde.sisteBud.slice(),
    },
    budvinner: visning.budvinner,
    melding: visning.melding,
    vrak: visning.dittVrak.slice(),
    trumf: visning.trumf,
    etterlyst: visning.etterlyst,
    makker,
    makkerAvslørt: visning.makker !== null,
    // Ingenting i vår sti leser `utspiller`; den rekonstrueres av bordet for at
    // staten skal være internt konsistent, ikke fordi noen spør om den.
    utspiller: visning.bord[0]?.spiller ?? (visning.fase === "SPILL" ? visning.iTur : null),
    bord: visning.bord.slice(),
    stikkVunnet: visning.stikkVunnet.slice(),
    stikkSpilt: visning.stikkSpilt,
    forrigeStikk: visning.forrigeStikk,
    historikk: visning.historikk.slice(),
    sisteRunde: visning.sisteRunde,
  };
}

// ===========================================================================
// 2. Kontrakten
// ===========================================================================

/** Det trohodet leverer. Strukturell type, så `trekk.ts` slipper å eie nettet. */
export interface Trofordeler {
  /** → `p[kort][klasse]`, klasse 0–2 = rel. sete 1–3, klasse 3 = talongen. */
  fordeling(trekk: Float32Array): number[][];
  /**
   * Trekkene nettet tar — med hukommelsen hvis nettet leser den (K6 → K8). Mangler
   * metoden (stillaser i prøver), brukes `troTrekk` som før.
   */
  trekkFor?(
    visning: SpillerVisning,
    antallStikk: number,
    målPoeng: number,
    hukommelse: Float64Array | null,
  ): Float32Array;
}

/**
 * Alt som IKKE er spillerens visning, men som må til for å bygge vektoren.
 *
 * `regler` og `giving` er offentlige regelparametre, ikke tilstand: hvor mange
 * stikk runden har, hvor stor talongen er og hvor langt løpet går. De ligger
 * ikke i `SpillerVisning` og kan derfor ikke lekke noe.
 */
export interface Trekkontekst {
  readonly regler: GameRules;
  readonly giving: Kortgiving;
  /**
   * Hva som er valgt så langt i en fase som krever flere valg: vraket bygges
   * ett kort om gangen, og trumfen velges før etterlysningen. Uten den vet
   * hverken masken eller nettet hvilket delsteg som står for tur.
   *
   * FASEN SELV KOMMER FRA VISNINGEN, ikke herfra. Et eget `beslutning`-felt i
   * konteksten ville vært en andre kilde til den samme opplysningen, og to
   * kilder som kan komme i utakt er nøyaktig feilklassen §118 handler om.
   */
  readonly delvalg?: Delvalg;
  /**
   * Hukommelsesvektoren fra `Hukommelse.vektor(eget sete)`. `null` gir en
   * nullblokk — den ærlige verdien når vi ikke har sett noen runder ennå.
   */
  readonly hukommelse?: Float64Array | null;
  /**
   * Trohodet. `null` gir en nullblokk og `tro.tilgjengelig = 0`.
   *
   * §126: den skal IKKE stå på null i noen driver lenger. Se `TRO_NAVN`.
   */
  readonly tronett?: Trofordeler | null;
}

// ===========================================================================
// 3. MIKRO — de 273 trekkene dagens nett leser
// ===========================================================================

/**
 * `e1SpillTrekk(state, sete, E1_SPILL_DIM)` — 238 fra appens `NevroTrekk` og
 * 35 fra E1 oppå. IKKE skrevet om: kalt, med den redigerte staten.
 *
 * Bredden er valgt med vilje. `E1_SPILL_DIM_V2` og oppover legger på blokker
 * som krever `state.giving.talong` og trosnettets fordeling, og de to hører
 * hjemme i egne blokker her (MESO og TRO) der de kan måles for seg. Det som
 * ligger i MIKRO er nøyaktig det som er utrullet og målt i dag.
 */
export const MIKRO_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (const k of KORTNAVN) ut.push(`mikro.hånd.${k}`);
  for (const k of KORTNAVN) ut.push(`mikro.spilt.${k}`);
  for (const k of KORTNAVN) ut.push(`mikro.bord.${k}`);
  for (const k of KORTNAVN) ut.push(`mikro.etterlystUte.${k}`);
  for (const r of REL) ut.push(`mikro.budvinner.${r}`);
  for (const r of REL) ut.push(`mikro.leder.${r}`);
  for (const r of REL) ut.push(`mikro.makker.${r}`);
  for (const f of FARGER) ut.push(`mikro.trumf.${f}`);
  ut.push("mikro.ingenTrumf");
  ut.push("mikro.tallbud");
  ut.push("mikro.amerikaner");
  ut.push("mikro.påBudlaget");
  ut.push("mikro.stikkAndel");
  ut.push("mikro.mineStikk");
  ut.push("mikro.lagStikk");
  ut.push("mikro.minePoeng");
  ut.push("mikro.besteMotstanderPoeng");
  for (const r of REL) ut.push(`mikro.stikkVunnet.${r}`);
  ut.push("mikro.solo");
  for (const f of FARGER) ut.push(`mikro.egenFargelengde.${f}`);
  for (const f of FARGER) ut.push(`mikro.spiltIFarge.${f}`);
  for (const r of REL) for (const f of FARGER) ut.push(`mikro.renons.${r}.${f}`);
  for (const f of FARGER) ut.push(`mikro.høyesteUte.${f}`);
  for (const f of FARGER) ut.push(`mikro.antallUte.${f}`);
  ut.push("mikro.stikkIgjen");
  ut.push("mikro.harUtspill");
  ut.push("mikro.bias");
  return ut;
})();

export const MIKRO_LENGDE = MIKRO_NAVN.length; // 273

// ===========================================================================
// 4. TRO — trohodets fordeling
// ===========================================================================

const TROKLASSE = ["rel1", "rel2", "rel3", "talong"] as const;

/**
 * For hvert USETT kort: hvor ligger det?
 *
 * Sette kort står på null i alle fire klassene — de er ikke gjetning, og en
 * fordeling over dem ville vært støy. Det er nøyaktig samme maske som
 * `fasit.troFasit` bruker på etiketten, og de to henter den fra samme
 * `setteKort`.
 *
 * `tro.tilgjengelig` skiller «ingen tro koblet på» fra «troen er flat». Uten
 * det flagget er de to identiske nullblokker, og nettet ville lest et
 * manglende trohode som en sikker paastand om at ingenting ligger noe sted.
 *
 * ===================== OG NÅ ER DEN FAKTISK KOBLET PÅ (§126) =========
 *
 * Blokken var bygd, registrert og eksakt null i hver eneste rad i ti epoker,
 * fordi ingen driver satte `tronett`. `Sandkasseagent.velgHandling` sendte
 * `null`, `spillKamp` sendte `opts.tronett ?? null`, og verken epokedriveren
 * eller `mlb-erfaring.ts` satte det. Det er samme feilklasse som sanseblokken:
 * riktig bygd, aldri fylt.
 *
 * Nå settes den de TRE stedene som må være enige, ellers er det maalte ikke
 * det som ble trent: `examples/mlb-spill.ts` (som spiller),
 * `examples/mlb-erfaring.ts` (som gjenspiller for gradienten) og
 * `src/mlb/spekagent.ts` (som rulles ut og maales). Er de uenige, ser nettet
 * én vektor når det handler og en annen når det lærer.
 */
export const TRO_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (const k of KORTNAVN) ut.push(`tro.usett.${k}`);
  for (const k of KORTNAVN) for (const c of TROKLASSE) ut.push(`tro.p.${k}.${c}`);
  ut.push("tro.tilgjengelig");
  return ut;
})();

export const TRO_LENGDE = TRO_NAVN.length; // 261

// ===========================================================================
// 5. HUKOMMELSE — LÅST layout fra `hukommelse.ts`
// ===========================================================================

/**
 * 48 tall per motstander, i rotert rekkefølge `(eget + 1), (eget + 2), …`.
 * `LEDD_NAVN`, `LENGDE_PER_SETE` og `HUKOMMELSE_LENGDE_4` er låst der og
 * gjentas IKKE her — navnene bygges av dem, så de to kan ikke komme i utakt.
 */
export const HUKOMMELSE_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (let d = 1; d <= HUKOMMELSE_LENGDE_4 / LENGDE_PER_SETE; d++) {
    for (const navn of LEDD_NAVN) ut.push(`hukommelse.rel${d}.${navn}`);
  }
  return ut;
})();

export const HUKOMMELSE_LENGDE = HUKOMMELSE_NAVN.length; // 144

// ===========================================================================
// 6. MESO — kontrakten
// ===========================================================================

export const BESLUTNINGER: readonly Beslutning[] = ["BUD", "VRAK", "VELG", "SPILL"];

/**
 * BESLUTNINGEN SOM TALL, slik MLBE-radens `fase`-felt bærer den.
 *
 * ===================== HVORFOR DEN STÅR HER OG IKKE I SKRIVEREN =========
 *
 * Den sto i `examples/mlb-erfaring.ts`, som en `Record<string, number>` med
 * nøkkelen `BUDRUNDE` — motorens navn, ikke `fasenavn()`s. Oppslaget bommet
 * derfor på hver eneste budrad, og `?? 3` gjorde bommen til «SPILL». Målt: fase
 * 0 hadde **null rader** i tjue skard, og budkodene 52–60 lå i fase 3.
 *
 * Rettelsen er ikke bare nøkkelen. Kartet hører hjemme ved siden av `fasenavn`,
 * som er det eneste stedet `Beslutning` blir til, og typen er `Record<Beslutning,
 * number>` slik at et navn som ikke finnes er en TYPEFEIL og ikke en 3.
 */
export const FASEKODE: Record<Beslutning, number> = { BUD: 0, VRAK: 1, VELG: 2, SPILL: 3 };

/**
 * Fasen, lest av VISNINGEN og ikke av konteksten.
 *
 * `RUNDE_SLUTT` og `FERDIG` er ingen beslutning og gir `null`, som koder til en
 * tom one-hot. Det er den ærlige kodingen for «det er ingenting å velge», og
 * ikke en femte fase i forkledning.
 */
export function fasenavn(visning: SpillerVisning): Beslutning | null {
  switch (visning.fase) {
    case "BUDRUNDE":
      return "BUD";
    case "VRAK":
      return "VRAK";
    case "VELG":
      return "VELG";
    case "SPILL":
      return "SPILL";
    default:
      return null;
  }
}

export const MESO_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  // Budrunden så langt: hvem bød hva, og hvem passet.
  for (const r of REL) ut.push(`meso.bud.${r}.tall`);
  for (const r of REL) ut.push(`meso.bud.${r}.bød`);
  for (const r of REL) ut.push(`meso.bud.${r}.amerikaner`);
  for (const r of REL) ut.push(`meso.bud.${r}.solo`);
  for (const r of REL) ut.push(`meso.bud.${r}.passet`);
  for (const r of REL) ut.push(`meso.høyeste.${r}`);
  ut.push("meso.høyeste.tall", "meso.høyeste.amerikaner", "meso.høyeste.solo");
  ut.push("meso.antallPasset");
  ut.push("meso.melding.tall", "meso.melding.amerikaner", "meso.melding.solo");
  ut.push("meso.kontrakt");
  // Rollene.
  for (const r of REL) ut.push(`meso.budvinner.${r}`);
  ut.push("meso.erBudvinner");
  ut.push("meso.erHemmeligMakker");
  ut.push("meso.påBudlaget");
  ut.push("meso.erForsvarer");
  ut.push("meso.makkerKjent");
  for (const r of REL) ut.push(`meso.makker.${r}`);
  // Vraket — bare budvinneren har et.
  for (const k of KORTNAVN) ut.push(`meso.vrak.${k}`);
  ut.push("meso.vrakKjent");
  for (const f of FARGER) ut.push(`meso.vrakFarge.${f}`);
  ut.push("meso.vrakSnittverdi");
  // Trumfvalget og etterlysningen.
  for (const f of FARGER) ut.push(`meso.trumf.${f}`);
  ut.push("meso.trumfValgt");
  for (const k of KORTNAVN) ut.push(`meso.etterlyst.${k}`);
  ut.push("meso.etterlystUte", "meso.etterlystErTrumf", "meso.jegHolderEtterlyst");
  // Stikkregnskapet.
  ut.push("meso.lagStikkPrivat", "meso.manglerStikk", "meso.stikkIgjen");
  for (const r of REL) ut.push(`meso.stikkVunnet.${r}`);
  ut.push("meso.stikkSpiltAndel");
  ut.push("meso.talong", "meso.antallStikk");
  for (const b of BESLUTNINGER) ut.push(`meso.beslutning.${b}`);
  /**
   * `meso.iTur` og `meso.utspiller.rel0` STÅR (§126). De er konstante i dag —
   * vektoren bygges for setet som bestemmer - men det er en KONTRAKT om hvem
   * `byggTrekk` kalles for, ikke noe typene håndhever, og «fikk aldri
   * gradient» er observasjon og ikke bevis. Se filhodet.
   */
  for (const r of REL) ut.push(`meso.iTur.${r}`);
  ut.push("meso.bordAntall");
  for (const r of REL) ut.push(`meso.utspiller.${r}`);
  return ut;
})();

export const MESO_LENGDE = MESO_NAVN.length; // 186

// ===========================================================================
// 7. MAKRO — kampen, og LØPSLENGDEN
// ===========================================================================

export const MAKRO_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (const r of REL) ut.push(`makro.poeng.${r}`);
  for (const r of REL) ut.push(`makro.leder.${r}`);
  ut.push("makro.gapTilBeste");
  ut.push("makro.forsprang");
  ut.push("makro.framdrift");
  ut.push("makro.racepress");
  ut.push("makro.rundeNr");
  ut.push("makro.rundeAndel");
  // De to skalaene: uten dem kan ikke «presset er relativt» læres. Se toppen.
  ut.push("makro.målPoeng.per100");
  ut.push("makro.målPoeng.trettiDelt");
  ut.push("makro.poengPerRunde");
  for (const r of REL) ut.push(`makro.giver.${r}`);
  ut.push("makro.antallSpillere");
  ut.push("makro.antallStikk");
  return ut;
})();

export const MAKRO_LENGDE = MAKRO_NAVN.length; // 23

// ===========================================================================
// 8. KONVENSJONER — hva hver `vaktKort`-regel ville valgt
// ===========================================================================

/**
 * Hver vaktregel, alene.
 *
 * REGLENE ER IKKE UAVHENGIGE FLAGG. `åpningHøyest` er en VARIANT av `åpning`
 * og gjør ingenting uten den; `draBilligst` er en variant av `ikkeDraTrumf`.
 * Slås varianten på alene, tier regelen — og blokken ville vist en konstant
 * null som så ut som «konvensjonen mener ingenting her». Derfor er hver
 * oppføring et FULLSTENDIG valg, ikke ett flagg.
 */
const BASISVALG: Vaktvalg = { åpning: false, garantiIkkeTrumf: false, garantiBilligst: false };

export const KONVENSJONSREGLER: readonly { readonly navn: string; readonly valg: Vaktvalg }[] = [
  { navn: "åpning.billigst", valg: { ...BASISVALG, åpning: true } },
  { navn: "åpning.høyest", valg: { ...BASISVALG, åpning: true, åpningHøyest: true } },
  { navn: "åpning.lavestTrumf", valg: { ...BASISVALG, åpningLavest: true } },
  { navn: "kast.billigst", valg: { ...BASISVALG, kastBilligst: true } },
  { navn: "kast.nytte", valg: { ...BASISVALG, kastNytte: true } },
  { navn: "trumf.ikkeDra.dyrest", valg: { ...BASISVALG, ikkeDraTrumf: true } },
  { navn: "trumf.ikkeDra.billigst", valg: { ...BASISVALG, ikkeDraTrumf: true, draBilligst: true } },
  { navn: "trumf.stoppNårTomt", valg: { ...BASISVALG, stoppTrumfNårTomt: true } },
  { navn: "makker.trumfTilbake", valg: { ...BASISVALG, makkerTrumfTilbake: true } },
  { navn: "makker.trumferFørst", valg: { ...BASISVALG, makkerTrumferFørst: true } },
  { navn: "makker.essFørst", valg: { ...BASISVALG, makkerEssFørst: true } },
  { navn: "stikk1.billigst", valg: { ...BASISVALG, stikk1Billigst: true } },
  { navn: "stikk1.førerBilligst", valg: { ...BASISVALG, stikk1FørerBilligst: true } },
  { navn: "fører.trumfKontroll", valg: { ...BASISVALG, førerTrumfKontroll: true } },
  { navn: "garanti.ikkeTrumf", valg: { ...BASISVALG, garantiIkkeTrumf: true } },
  { navn: "garanti.billigst", valg: { ...BASISVALG, garantiBilligst: true } },
  { navn: "garanti.nytte", valg: { ...BASISVALG, garantiNytte: true } },
] as const;

/**
 * Hvorfor ÉN felles kortblokk og ikke én per regel.
 *
 * «Hva regelen ville valgt» er et KORT, og 17 × 52 = 884 trekk for et signal
 * som nesten alltid peker på ett kort ville nær doblet hele vektoren. I stedet
 * teller `konv.ønsket` HVOR MANGE regler som peker på hvert kort, og
 * `konv.enighet` sier om de fyrende reglene er samstemte. Da er både «alle vil
 * ha spar 3» og «to konvensjoner er uenige» lesbart, med ett flagg per regel
 * ved siden av som sier hvem som i det hele tatt hadde en mening.
 */
export const KONVENSJON_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (const r of KONVENSJONSREGLER) ut.push(`konv.fyrer.${r.navn}`);
  for (const k of KORTNAVN) ut.push(`konv.ønsket.${k}`);
  ut.push("konv.enighet");
  ut.push("konv.andelFyrer");
  return ut;
})();

export const KONVENSJON_LENGDE = KONVENSJON_NAVN.length; // 71

// ===========================================================================
// 9. LOVLIGMASKE — nettet skal aldri kunne velge ulovlig
// ===========================================================================

/**
 * Masken, plass for plass, i NØYAKTIG handlingsrommets rekkefølge.
 *
 * `handling.maske` er den harde skranken nettet aldri skal kunne bryte, og den
 * er allerede prøvd mot motorens egen `lovligeHandlinger` i hver fase. Her er
 * den en INNGANG i tillegg: nettet skal både være SPERRET fra det ulovlige og
 * SE hva som er lovlig — ellers må det bruke kapasitet på å utlede formen på
 * sin egen skranke.
 *
 * `lovlig.delsteg.*` sier hvilket av de fem delstegene masken gjelder for.
 * Uten det er kortplassene tvetydige: de betyr «kort å vrake», «valør å
 * etterlyse» eller «kort å legge, med følgeplikt» avhengig av hvor i fasen vi
 * står, og en 52-blokk som betyr tre ting er ikke ett trekk, men tre.
 */
const DELSTEG: readonly Delsteg[] = [
  "BUD",
  "VRAK_KORT",
  "VELG_TRUMF",
  "VELG_ETTERLYST",
  "SPILL_KORT",
];

/**
 * ===================== HANDLINGSKODENE SOM KAN VÆRE LOVLIGE (§126) ========
 *
 * Fire spillere gir **12 stikk**, så `bud:13` er ALDRI lovlig. Vektrevisjonen
 * fant kolonnen som permanent null — ikke av variansen, som aldri kan se en
 * inngang som ikke varierer, men av gradienten: den hadde aldri fått noen.
 *
 * ===================== HVORFOR DETTE IKKE ER EN ANDRE LOVLIGHETSREGEL ====
 *
 * Toppen av fila har en hard regel: lovligheten finnes ÉTT sted, i
 * `handling.maske(...)`. Lista under koder ikke lovlighet på nytt — den sier
 * bare hvilke plasser i vektoren som er verdt å bruke, og den er PRØVD mot
 * masken selv. `test/mlb-trekk.test.ts` krever at hver utelatt kode er null i
 * hver eneste maske den ser. Blir en av dem lovlig, er prøven rød, ikke stille.
 *
 * Handlingsrommet selv røres IKKE. Policyhodet har fortsatt 68 utganger, og
 * `bud:13` er fortsatt en av dem — en logit som trenes mot ingenting, men som
 * masken stenger. Å krympe handlingsrommet ville flyttet hver eneste kode og
 * gjort hver vektfil og hver erfaringsrad i prosjektet uleselig, for én logit.
 */
export const LOVLIG_UTELATT: readonly string[] = ["bud:13"];

/** Indeksene i `HANDLING_NAVN` som faktisk får en plass i LOVLIG-blokken. */
export const LOVLIG_KODER: readonly number[] = HANDLING_NAVN.map((_, i) => i).filter(
  (i) => !LOVLIG_UTELATT.includes(HANDLING_NAVN[i]!),
);

export const LOVLIG_NAVN: readonly string[] = (() => {
  const ut: string[] = [];
  for (const i of LOVLIG_KODER) ut.push(`lovlig.${HANDLING_NAVN[i]}`);
  for (const d of DELSTEG) ut.push(`lovlig.delsteg.${d}`);
  ut.push("lovlig.antall");
  return ut;
})();

export const LOVLIG_LENGDE = LOVLIG_NAVN.length; // 73

// ===========================================================================
// 10. Den samlede layouten
// ===========================================================================

/** Blokkgrensene som ÉN kilde til sannhet. */
export const BLOKK = {
  MIKRO: 0,
  TRO: MIKRO_LENGDE,
  HUKOMMELSE: MIKRO_LENGDE + TRO_LENGDE,
  MESO: MIKRO_LENGDE + TRO_LENGDE + HUKOMMELSE_LENGDE,
  MAKRO: MIKRO_LENGDE + TRO_LENGDE + HUKOMMELSE_LENGDE + MESO_LENGDE,
  KONVENSJON: MIKRO_LENGDE + TRO_LENGDE + HUKOMMELSE_LENGDE + MESO_LENGDE + MAKRO_LENGDE,
  LOVLIG:
    MIKRO_LENGDE + TRO_LENGDE + HUKOMMELSE_LENGDE + MESO_LENGDE + MAKRO_LENGDE + KONVENSJON_LENGDE,
} as const;

export const TREKK_NAVN: readonly string[] = [
  ...MIKRO_NAVN,
  ...TRO_NAVN,
  ...HUKOMMELSE_NAVN,
  ...MESO_NAVN,
  ...MAKRO_NAVN,
  ...KONVENSJON_NAVN,
  ...LOVLIG_NAVN,
];

export const TREKK_LENGDE = TREKK_NAVN.length; // 1032

// ===========================================================================
// 11. Byggeren
// ===========================================================================

/**
 * Trekkvektoren for sandkassenettet, bygd av LOVLIG INFORMASJON ALENE.
 *
 * Signaturen er kontrakten: `SpillerVisning`, aldri `GameState`.
 */
export function byggTrekk(visning: SpillerVisning, kontekst: Trekkontekst): Float32Array {
  const v = new Float32Array(TREKK_LENGDE);
  const meg = visning.deg;
  const n = visning.antallKort.length;
  const rel = (sete: number): number => (((sete - meg) % n) + n) % n;
  const stikk = Math.max(1, kontekst.giving.antallStikk);
  const mål = Math.max(1, kontekst.regler.målPoeng);
  const redigert = visningTilState(visning, kontekst.regler, kontekst.giving);

  // ---- MIKRO ------------------------------------------------------------
  {
    const m = e1SpillTrekk(redigert, meg, E1_SPILL_DIM);
    for (let i = 0; i < MIKRO_LENGDE; i++) v[BLOKK.MIKRO + i] = m[i] ?? 0;
  }

  // ---- TRO --------------------------------------------------------------
  {
    const b = BLOKK.TRO;
    const usett = new Uint8Array(52).fill(1);
    for (const k of visning.dinHånd) usett[kortIndeks(k)] = 0;
    for (const st of visning.historikk) for (const kp of st.kort) usett[kortIndeks(kp.kort)] = 0;
    for (const kp of visning.bord) usett[kortIndeks(kp.kort)] = 0;
    for (const k of visning.dittVrak) usett[kortIndeks(k)] = 0;
    for (let i = 0; i < 52; i++) v[b + i] = usett[i] ?? 0;

    const nett = kontekst.tronett ?? null;
    if (nett !== null) {
      // HUKOMMELSEN TIL TROEN (K6 → K8): samme vektor som HUKOMMELSE-blokken under,
      // så troen kan gjette om DENNE motstanderen. Et nett uten hukommelsesinngang får
      // `troTrekk` alene, bit-identisk med før.
      const t =
        nett.trekkFor !== undefined
          ? nett.trekkFor(visning, kontekst.giving.antallStikk, mål, kontekst.hukommelse ?? null)
          : troTrekk(visning, kontekst.giving.antallStikk, mål);
      const p = nett.fordeling(t);
      for (let k = 0; k < MLB_TRO_KORT; k++) {
        if (usett[k] !== 1) continue; // sette kort er ikke gjetning
        const rad = p[k];
        if (rad === undefined) continue;
        for (let c = 0; c < MLB_TRO_KLASSER; c++) {
          v[b + 52 + k * MLB_TRO_KLASSER + c] = rad[c] ?? 0;
        }
      }
      v[b + 52 + MLB_TRO_KORT * MLB_TRO_KLASSER] = 1;
    }
  }

  // ---- HUKOMMELSE -------------------------------------------------------
  {
    const h = kontekst.hukommelse ?? null;
    if (h !== null) {
      const antall = Math.min(HUKOMMELSE_LENGDE, h.length);
      for (let i = 0; i < antall; i++) v[BLOKK.HUKOMMELSE + i] = h[i] ?? 0;
    }
  }

  // ---- MESO -------------------------------------------------------------
  {
    let o = BLOKK.MESO;
    const legg = (x: number): void => {
      v[o++] = x;
    };
    const blokk = (bredde: number, fyll: (sett: (i: number, x: number) => void) => void): void => {
      const start = o;
      fyll((i, x) => {
        v[start + i] = x;
      });
      o = start + bredde;
    };

    // Budrunden så langt.
    blokk(4, (sett) => {
      for (let s = 0; s < n; s++) {
        const b = visning.budrunde.sisteBud[s];
        if (typeof b === "number") sett(rel(s), b / stikk);
      }
    });
    blokk(4, (sett) => {
      for (let s = 0; s < n; s++) if (visning.budrunde.sisteBud[s] != null) sett(rel(s), 1);
    });
    blokk(4, (sett) => {
      for (let s = 0; s < n; s++) if (visning.budrunde.sisteBud[s] === AMERIKANER) sett(rel(s), 1);
    });
    blokk(4, (sett) => {
      for (let s = 0; s < n; s++) if (visning.budrunde.sisteBud[s] === SOLO) sett(rel(s), 1);
    });
    blokk(4, (sett) => {
      for (let s = 0; s < n; s++) if (visning.budrunde.passet[s] === true) sett(rel(s), 1);
    });
    const høyeste = visning.budrunde.høyeste;
    blokk(4, (sett) => {
      if (høyeste !== null) sett(rel(høyeste.spiller), 1);
    });
    legg(høyeste !== null && typeof høyeste.bud === "number" ? høyeste.bud / stikk : 0);
    legg(høyeste !== null && høyeste.bud === AMERIKANER ? 1 : 0);
    legg(høyeste !== null && høyeste.bud === SOLO ? 1 : 0);
    legg(visning.budrunde.passet.filter(Boolean).length / Math.max(1, n - 1));

    const melding = visning.melding;
    legg(melding?.type === "tall" ? 1 : 0);
    legg(melding?.type === "amerikaner" ? 1 : 0);
    legg(melding?.type === "solo" ? 1 : 0);
    legg(melding === null ? 0 : melding.type === "tall" ? melding.bud / stikk : 1);

    // Rollene.
    const erBudvinner = visning.budvinner === meg;
    const holderEtterlyst =
      visning.etterlyst !== null && visning.dinHånd.some((k) => likeKort(k, visning.etterlyst!));
    const erMakker = visning.makker === meg || (holderEtterlyst && !erBudvinner);
    const påBudlaget = erBudvinner || erMakker;
    blokk(4, (sett) => {
      if (visning.budvinner !== null) sett(rel(visning.budvinner), 1);
    });
    legg(erBudvinner ? 1 : 0);
    legg(erMakker && visning.makker === null ? 1 : 0);
    legg(påBudlaget ? 1 : 0);
    legg(visning.budvinner !== null && !påBudlaget ? 1 : 0);
    legg(visning.makker !== null ? 1 : 0);
    blokk(4, (sett) => {
      if (visning.makker !== null) sett(rel(visning.makker), 1);
    });

    // Vraket.
    blokk(52, (sett) => {
      for (const k of visning.dittVrak) sett(kortIndeks(k), 1);
    });
    legg(erBudvinner ? 1 : 0);
    blokk(4, (sett) => {
      const teller = [0, 0, 0, 0];
      for (const k of visning.dittVrak) teller[FARGER.indexOf(k.farge)]!++;
      for (let f = 0; f < 4; f++) sett(f, (teller[f] ?? 0) / 4);
    });
    legg(
      visning.dittVrak.length === 0
        ? 0
        : visning.dittVrak.reduce((a, k) => a + (k.verdi - 2), 0) / visning.dittVrak.length / 12,
    );

    // Trumfvalget og etterlysningen.
    blokk(4, (sett) => {
      if (visning.trumf !== null) sett(FARGER.indexOf(visning.trumf), 1);
    });
    legg(visning.trumf !== null ? 1 : 0);
    const etterlyst = visning.etterlyst;
    blokk(52, (sett) => {
      if (etterlyst !== null) sett(kortIndeks(etterlyst), 1);
    });
    let etterlystSett = false;
    if (etterlyst !== null) {
      const i = kortIndeks(etterlyst);
      for (const s of visning.historikk) {
        for (const kp of s.kort) if (kortIndeks(kp.kort) === i) etterlystSett = true;
      }
      for (const kp of visning.bord) if (kortIndeks(kp.kort) === i) etterlystSett = true;
    }
    legg(etterlyst !== null && !etterlystSett ? 1 : 0);
    legg(etterlyst !== null && visning.trumf !== null && etterlyst.farge === visning.trumf ? 1 : 0);
    legg(holderEtterlyst ? 1 : 0);

    // Stikkregnskapet, med MIN kunnskap: den uavslørte makkeren teller sine egne.
    let lag = 0;
    if (visning.budvinner !== null) {
      lag = visning.stikkVunnet[visning.budvinner] ?? 0;
      if (visning.makker !== null && visning.makker !== visning.budvinner) {
        lag += visning.stikkVunnet[visning.makker] ?? 0;
      } else if (erMakker && visning.makker === null) {
        lag += visning.stikkVunnet[meg] ?? 0;
      }
    }
    legg(lag / stikk);
    const kontrakt = melding === null ? 0 : melding.type === "tall" ? melding.bud : stikk;
    legg(visning.budvinner === null ? 0 : klipp01((kontrakt - lag) / stikk));
    legg((stikk - visning.stikkSpilt) / stikk);
    blokk(4, (sett) => {
      for (let s = 0; s < n; s++) sett(rel(s), (visning.stikkVunnet[s] ?? 0) / stikk);
    });
    legg(visning.stikkSpilt / stikk);
    legg(kontekst.giving.talong / 13);
    legg(kontekst.giving.antallStikk / 13);
    blokk(4, (sett) => {
      const fase = fasenavn(visning);
      const i = fase === null ? -1 : BESLUTNINGER.indexOf(fase);
      if (i >= 0) sett(i, 1);
    });
    blokk(4, (sett) => {
      if (visning.iTur !== null) sett(rel(visning.iTur), 1);
    });
    legg(visning.bord.length / Math.max(1, n - 1));
    blokk(4, (sett) => {
      if (visning.bord.length > 0) sett(rel(visning.bord[0]!.spiller), 1);
    });

    if (o !== BLOKK.MESO + MESO_LENGDE) {
      throw new Error(`MESO skrev ${o - BLOKK.MESO} tall, layouten sier ${MESO_LENGDE}`);
    }
  }

  // ---- MAKRO ------------------------------------------------------------
  {
    let o = BLOKK.MAKRO;
    const legg = (x: number): void => {
      v[o++] = x;
    };
    let beste = -Infinity;
    let besteSete = meg;
    for (let s = 0; s < n; s++) {
      const p = visning.totalPoeng[s] ?? 0;
      if (p > beste) {
        beste = p;
        besteSete = s;
      }
    }
    let besteAndre = 0;
    for (let s = 0; s < n; s++) {
      if (s !== meg) besteAndre = Math.max(besteAndre, visning.totalPoeng[s] ?? 0);
    }
    const egne = visning.totalPoeng[meg] ?? 0;

    const start = o;
    for (let s = 0; s < n; s++) v[start + rel(s)] = klipp01((visning.totalPoeng[s] ?? 0) / mål);
    o = start + 4;
    v[o + rel(besteSete)] = 1;
    o += 4;
    legg(klipp01((besteAndre - egne) / mål));
    legg(klipp01((egne - besteAndre) / mål));
    legg(klipp01(Math.max(egne, besteAndre) / mål));
    legg(klipp11(racepress(redigert, meg)));
    legg(klipp01(visning.rundeNr / 60));
    legg(klipp01(visning.rundeNr / 30));
    legg(klipp01(mål / 100));
    legg(klipp01(30 / mål));
    legg(klipp01(egne / Math.max(1, visning.rundeNr) / 10));
    const g = o;
    v[g + rel(visning.giver)] = 1;
    o = g + 4;
    legg(n / 6);
    legg(kontekst.giving.antallStikk / 13);

    if (o !== BLOKK.MAKRO + MAKRO_LENGDE) {
      throw new Error(`MAKRO skrev ${o - BLOKK.MAKRO} tall, layouten sier ${MAKRO_LENGDE}`);
    }
  }

  // ---- KONVENSJONER -----------------------------------------------------
  {
    const b = BLOKK.KONVENSJON;
    const lovlige = visning.lovligeKort;
    // Vakten er en SPILLEREGEL for kortvalget. Utenfor SPILL, og når det bare
    // finnes ett lovlig kort, returnerer `vaktKort` forslaget urørt — da har
    // ingen regel en mening, og blokken er null med rette.
    if (visning.fase === "SPILL" && visning.iTur === meg && lovlige.length >= 2) {
      const teller = new Int32Array(52);
      const ønsket = new Set<number>();
      let fyrende = 0;
      for (let r = 0; r < KONVENSJONSREGLER.length; r++) {
        const regel = KONVENSJONSREGLER[r]!;
        let fyrte = false;
        for (const kandidat of lovlige) {
          const valgt = vaktKort(redigert, meg, kandidat, regel.valg);
          if (likeKort(valgt, kandidat)) continue;
          fyrte = true;
          const i = kortIndeks(valgt);
          teller[i]!++;
          ønsket.add(i);
        }
        if (fyrte) {
          v[b + r] = 1;
          fyrende++;
        }
      }
      const antall = KONVENSJONSREGLER.length;
      for (let i = 0; i < 52; i++) v[b + antall + i] = (teller[i] ?? 0) / antall;
      v[b + antall + 52] = fyrende > 0 && ønsket.size === 1 ? 1 : 0;
      v[b + antall + 53] = fyrende / antall;
    }
  }

  // ---- LOVLIGMASKE ------------------------------------------------------
  {
    const b = BLOKK.LOVLIG;
    const delvalg = kontekst.delvalg ?? TOMT_DELVALG;
    const m = maske(visning, kontekst.giving, delvalg);
    // `LOVLIG_KODER` hopper over de kodene som aldri kan bli lovlige ved fire
    // spillere (§126). Antallet under telles av HELE masken — en utelatt kode
    // som mot formodning ble lovlig, ville da vist seg som et avvik mellom
    // `lovlig.antall` og summen av plassene, og `test/mlb-trekk.test.ts` leser
    // masken direkte og krever at de utelatte er null.
    for (let i = 0; i < LOVLIG_KODER.length; i++) v[b + i] = m[LOVLIG_KODER[i]!] ?? 0;
    const nk = LOVLIG_KODER.length;
    const steg = nesteDelsteg(visning, delvalg);
    if (steg !== null) {
      const i = DELSTEG.indexOf(steg);
      if (i >= 0) v[b + nk + i] = 1;
    }
    v[b + nk + DELSTEG.length] = antallLovlige(m) / HANDLING_LENGDE;
  }

  return v;
}

/**
 * MIKROBLOKKEN ALENE — den visningsbaserte innpakningen om de 273.
 *
 * Eksportert fordi identitetsprøven mot `e1SpillTrekk(state, sete, 273)` må
 * kunne kalle nøyaktig den funksjonen `byggTrekk` bruker, og ikke en kopi av
 * den. To veier inn til det samme tallet er den feilklassen §118 kaller «det
 * målte var ikke det jeg mente».
 */
export function mikroTrekk(visning: SpillerVisning, kontekst: Trekkontekst): Float32Array {
  return e1SpillTrekk(
    visningTilState(visning, kontekst.regler, kontekst.giving),
    visning.deg,
    E1_SPILL_DIM,
  );
}
