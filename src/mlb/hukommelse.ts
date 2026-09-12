/**
 * HUKOMMELSEN — motstanderboka på tre nivåer. MLB fase 0.2.
 *
 * Arvind, 9. august: «jeg snakket egentlig om hukommelsen og hvordan den
 * tilpasser seg til motstandere på alle 3 nivåer i løpet.»
 *
 * ======================= HVA SOM VAR GALT FØR ==============================
 *
 * **Ved rundeslutt er ALT avdekket.** Hver spilte runde gir motstanderens
 * eksakte hånd OG hva hun gjorde med den. I dag komprimerer vi hele den
 * historien til ETT TALL per sete — residualet i `src/moe2/stilbias.ts`. Vi
 * kaster et datasett som vokser med hver runde.
 *
 * Denne fila bokfører hele historien i stedet, delt på de tre nivåene
 * `docs/sandkassen.md` ber om:
 *
 *   MIKRO   hvordan hun spiller kortene   (residual, grådighet, honnørtiming,
 *                                          renonsatferd)
 *   MESO    hvordan hun byr og fører      (bud mot hånden hun VISTE SEG å ha,
 *                                          klarerate, vraket, trumfvalget)
 *   MAKRO   hvordan hun endrer seg        (byr hun mer når hun ligger under?
 *                                          blir hun forsiktig når hun leder?
 *                                          endrer stilen seg gjennom løpet?)
 *
 * ======================= HVERT TALL BÆRER SIN `n` ==========================
 *
 * Ingen statistikk her har en terskel. Som TREKK trenger de ingen: nettet
 * lærer selv når fire observasjoner er for lite og når tjue er nok. Derfor
 * eksporteres hver statistikk som et PAR — verdien og tiltroen `n/(n+k)` — og
 * residualet som en TRIPPEL, fordi standardfeilen er poenget der.
 *
 * Det er §108s lærdom tatt hele veien: en hard dør (`|a| ≥ 0,2`) gjorde
 * detektoren ubrukelig, mens krymping virket. En lært vekting er krympingen
 * tatt til sin ende.
 *
 * ======================= K2-GRENSEN ER ABSOLUTT ============================
 *
 * Hukommelsen ser **BARE ferdigspilte runder**. `observer(state)` gjør
 * ingenting før `state.fase === "RUNDE_SLUTT"`, og bare én gang per runde —
 * nøyaktig som `Profilbok.observer`. Valgene i runde `r` ser derfor bare
 * hukommelse fra runde `< r`.
 *
 * Det ene den leser MENS runden går er `state.totalPoeng`, og det er
 * offentlig: poengene endres først ved rundeslutt, så stillingen FØR runden
 * må fanges mens den pågår. Uten det ville makronivået kodet hver runde med
 * rundens eget resultat alt lagt til — altså med fasit.
 *
 * `test/mlb-hukommelse.test.ts` håndhever grensen: vektoren skal være
 * bit-identisk gjennom hele runden, og den skal ikke røre seg om de skjulte
 * hendene i den PÅGÅENDE runden byttes ut.
 *
 * ======================= HERKOMST: INGEN ORAKLER ===========================
 *
 * Fila importerer bare fra `src/motor.ts`, `src/kort.ts` og `src/regler.ts` —
 * reglene og tilstanden. Ingen `sd-orakel`, ingen dobbeltdummy, ingen
 * `d7alle`. `pris` og `kortIndeks` er gjenskapt lokalt (én linje hver) nettopp
 * for at importgrensen skal være triviell å håndheve.
 *
 * Residualet trenger en policy å måle mot. Den er en PARAMETER
 * (`Policy`), og standardvalget er `JEVN_POLICY` — en jevn fordeling over de
 * lovlige kortene. Se kommentaren over `JEVN_POLICY` for hvorfor.
 */

import { FARGER, type Farge, type Kort, likeKort } from "../kort.ts";
import { lovligeKort, type GameState, type KortPåBord } from "../motor.ts";
import { AMERIKANER, SOLO, type Bud } from "../regler.ts";

// ===========================================================================
// 1. Tellere: ledd, samvariasjon og fersk vekt
// ===========================================================================

/** Løpende sum, kvadratsum og antall — nok til snitt OG standardfeil. */
export interface Ledd {
  readonly sum: number;
  readonly kvadrat: number;
  readonly n: number;
}

export const TOMT_LEDD: Ledd = { sum: 0, kvadrat: 0, n: 0 };

export const leggTil = (a: Ledd, x: number): Ledd => ({
  sum: a.sum + x,
  kvadrat: a.kvadrat + x * x,
  n: a.n + 1,
});

export const snitt = (a: Ledd): number => (a.n === 0 ? 0 : a.sum / a.n);

/**
 * Standardfeilen på snittet. `n − 1` fordi variansen anslås fra de samme
 * dataene; med `n = 1` finnes ingen spredning å anslå og SE er udefinert.
 */
export const standardfeil = (a: Ledd): number => {
  if (a.n < 2) return Infinity;
  const m = a.sum / a.n;
  const varians = Math.max(0, a.kvadrat / a.n - m * m) * (a.n / (a.n - 1));
  return Math.sqrt(varians / a.n);
};

/**
 * Tiltroen som TALL, ikke som port. `n/(n+k)`: 0 uten data, 0,5 ved `n = k`.
 *
 * `k = 8` er valgt slik at en statistikk med én observasjon per runde når
 * halv tiltro rundt runde åtte — omtrent halvveis i en kamp til 100. Kortvalg
 * gir ~10 observasjoner per runde og når halv tiltro alt i runde én. Det er
 * med vilje: nettet skal se at et kortvalgstall er bedre belagt enn et
 * budtall, og det er nøyaktig det `n` forteller.
 */
export const TILTRO_K = 8;
export const tiltro = (n: number, k: number = TILTRO_K): number => n / (n + k);

/**
 * Løpende samvariasjon mellom to størrelser — nok til korrelasjonen.
 *
 * ============ HVORFOR WELFORD OG IKKE RÅSUMMER ==========================
 *
 * Første utgave lagret `Σx, Σy, Σxy, Σx², Σy²` og regnet `Var = Σx²/n − x̄²`.
 * Det er lærebokformelen, og den er ubrukelig her: makronivåets `x` er en
 * stillingsandel, og i en testkamp til en million poeng er den ~1e−5. Da er
 * `Σx²/n` og `x̄²` like til tolv siffer, differansen er ren avrundingsstøy, og
 * korrelasjonen kommer ut som et tilfeldig tall nær null.
 *
 * MÅLT: en stilisert motstander med vanen «byr høyere jo lenger bak hun
 * ligger» ga korrelasjon **+0,0025** — feil fortegn og null styrke — og GA
 * NØYAKTIG SAMME TALL da vanen ble byttet ut med en helt annen. To ulike
 * motstandere med identisk måltall til seksten siffer er selve varselet: da
 * måler formelen ikke motstanderen, den måler flyttallsstøyen.
 *
 * Welfords oppdatering sentrerer underveis og har ingen slik kansellering.
 */
export interface Samvar {
  /** Løpende snitt av x. */
  readonly mx: number;
  /** Løpende snitt av y. */
  readonly my: number;
  /** Σ(x−x̄)², sentrert underveis. */
  readonly cxx: number;
  readonly cyy: number;
  readonly cxy: number;
  readonly n: number;
}

export const TOM_SAMVAR: Samvar = { mx: 0, my: 0, cxx: 0, cyy: 0, cxy: 0, n: 0 };

export const leggTilPar = (c: Samvar, x: number, y: number): Samvar => {
  const n = c.n + 1;
  const dx = x - c.mx;
  const dy = y - c.my;
  const mx = c.mx + dx / n;
  const my = c.my + dy / n;
  return {
    mx,
    my,
    cxx: c.cxx + dx * (x - mx),
    cyy: c.cyy + dy * (y - my),
    cxy: c.cxy + dx * (y - my),
    n,
  };
};

/**
 * Pearson-korrelasjonen, klippet til [−1, 1], eller 0 når den ikke finnes.
 *
 * KORRELASJON OG IKKE STIGNINGSTALL, fordi et stigningstall har en enhet og
 * dermed en skala nettet må lære seg. Korrelasjonen er allerede i [−1, 1] og
 * betyr det samme på tvers av statistikker. Styrken ligger i `n` ved siden av.
 *
 * `n < 3` gir 0: med to punkter er korrelasjonen alltid ±1, altså ren støy.
 */
export function korrelasjon(c: Samvar): number {
  if (c.n < 3) return 0;
  if (!(c.cxx > 0) || !(c.cyy > 0)) return 0;
  const r = c.cxy / Math.sqrt(c.cxx * c.cyy);
  if (!Number.isFinite(r)) return 0;
  return Math.max(-1, Math.min(1, r));
}

/**
 * FERSK VEKT — det samme snittet, men med halveringstid.
 *
 * Makronivået spør «endrer stilen seg fra tidlige til sene runder?». Et fast
 * skille («runde < 8») ville vært et valg vi ikke kan forsvare og som ikke
 * finnes før kampen er over. En eksponentielt vektet middel er definert i
 * hvert eneste øyeblikk, og DIFFERANSEN mot alltid-snittet ER driften.
 */
export interface Fersk {
  readonly verdi: number;
  /** Effektiv `n`. Metter mot `1/(1−ρ)`, altså ~4,85 ved halveringstid 3. */
  readonly vekt: number;
}

export const TOM_FERSK: Fersk = { verdi: 0, vekt: 0 };

/** Halveringstid i RUNDER. Tre er kort nok til å fange et stilskifte. */
export const FERSK_HALVERING = 3;
const RHO = Math.pow(0.5, 1 / FERSK_HALVERING);

export const leggTilFersk = (f: Fersk, x: number): Fersk => {
  const v = f.vekt * RHO;
  return { verdi: (f.verdi * v + x) / (v + 1), vekt: v + 1 };
};

// ===========================================================================
// 2. Policyen residualet måles mot
// ===========================================================================

/**
 * Modellen residualet sammenlignes med: en fordeling over de LOVLIGE kortene.
 *
 * Den er en parameter, ikke en avhengighet. MLB sender inn sitt eget nett når
 * det finnes; da måler residualet «hvor mye høyere eller lavere spilte hun enn
 * VÅR policy ventet», som er formen `stilbias.ts` bruker i dag.
 */
export interface Policy {
  /** Sannsynlighet per kort, i samme rekkefølge som `lov`. Skal summere til 1. */
  fordeling(state: GameState, sete: number, lov: readonly Kort[]): number[];
}

/**
 * ============ STANDARDVALGET: DEN JEVNE POLICYEN ==========================
 *
 * VALGT MED VILJE, og det er et av kravene i fase 0.2: residualet skal ikke
 * avhenge av `sd-orakel`, dobbeltdummy eller `d7alle`. `stilbias.ts` måler i
 * dag mot `Atferdsmodell`, som i praksis alltid er E1/`d7alle` — altså
 * orakeltrent. Den kan ikke brukes her.
 *
 * Den jevne policyen er det eneste nullpunktet som er utledet av REGLENE
 * alene. Da blir residualet
 *
 *     res  =  h(spilt) − 0,5
 *
 * der `h` er kortets prisrang blant de lovlige, skalert til [0, 1]. I ord:
 * **spilte hun over eller under midten av det hun lovlig kunne?** Det er et
 * ærlig, kortuavhengig mål — og de to egenskapene §108 krevde holder fortsatt:
 *
 *   KORTENE FALLER UT   `h` regnes over nøyaktig de kortene hun hadde å velge
 *                       mellom. Har hun bare høye kort igjen, er rangen
 *                       fortsatt spredt over [0, 1] og residualet er ~0.
 *   BEVISET TIDOBLES    hvert valg med to eller flere lovlige kort teller,
 *                       altså ~10 per runde per sete.
 *
 * Det den IKKE fanger er stillingsavhengig finesse — en policy som vet at
 * ess skal spilles nå og ikke senere. Det er nettopp derfor `Policy` er en
 * parameter: når MLB har et nett, byttes nullpunktet ut, og residualet blir
 * «avvik fra det VI ville gjort» i stedet for «avvik fra midten».
 */
export const JEVN_POLICY: Policy = {
  fordeling: (_state, _sete, lov) => lov.map(() => 1 / lov.length),
};

/** Bygger en `Policy` av en logit-funksjon, slik MLB-nettet vil levere den. */
export function policyFraLogits(
  logits: (state: GameState, sete: number) => ArrayLike<number>,
): Policy {
  return {
    fordeling(state, sete, lov) {
      const g = logits(state, sete);
      let maks = -Infinity;
      for (const k of lov) maks = Math.max(maks, g[kortIndeks(k)] ?? 0);
      let sum = 0;
      const rå: number[] = [];
      for (const k of lov) {
        const w = Math.exp((g[kortIndeks(k)] ?? 0) - maks);
        rå.push(w);
        sum += w;
      }
      if (!(sum > 0) || !Number.isFinite(sum)) return lov.map(() => 1 / lov.length);
      return rå.map((w) => w / sum);
    },
  };
}

// ===========================================================================
// 3. Små regelfunksjoner — gjenskapt lokalt for å holde importgrensen ren
// ===========================================================================

const FARGE_INDEKS: Record<Farge, number> = { S: 0, H: 1, R: 2, K: 3 };

/** Stabil totalorden over de 52 kortene. Brytes uavgjort deterministisk med. */
export const kortIndeks = (k: Kort): number => FARGE_INDEKS[k.farge] * 13 + (k.verdi - 2);

/**
 * Hva koster det å bli kvitt kortet? Et sidekort går alltid foran en trumf.
 * Samme definisjon som `src/moe2/synlig.ts`, gjentatt her (én linje) fordi
 * hukommelsen ikke skal importere fra `moe2`.
 */
export const pris = (k: Kort, trumf: Farge): number => (k.farge === trumf ? 100 : 0) + k.verdi;

/** Slår `k` det kortet som leder stikket nå? Trumf slår farge, ellers valør. */
export function slår(k: Kort, ledende: Kort, trumf: Farge): boolean {
  if (k.farge === trumf && ledende.farge !== trumf) return true;
  if (k.farge !== ledende.farge) return false;
  return k.verdi > ledende.verdi;
}

/** Kortet som leder stikket etter kortene som ligger. */
function ledendeKort(bord: readonly KortPåBord[], trumf: Farge): Kort | null {
  if (bord.length === 0) return null;
  let best = bord[0]!.kort;
  for (let i = 1; i < bord.length; i++) {
    const k = bord[i]!.kort;
    if (slår(k, best, trumf)) best = k;
  }
  return best;
}

/** Prisrangen i [0, 1] per kort i utvalget. Ett kort gir 0,5 (ingen skala). */
function prisrang(kort: readonly Kort[], trumf: Farge): Map<number, number> {
  const sortert = [...kort].sort(
    (a, b) => pris(a, trumf) - pris(b, trumf) || kortIndeks(a) - kortIndeks(b),
  );
  const ut = new Map<number, number>();
  for (let i = 0; i < sortert.length; i++) {
    ut.set(kortIndeks(sortert[i]!), sortert.length < 2 ? 0.5 : i / (sortert.length - 1));
  }
  return ut;
}

/** Valørrangen i [0, 1] per kort. Brukes i vrakfasen, der trumf ikke er valgt. */
function valorrang(kort: readonly Kort[]): Map<number, number> {
  const sortert = [...kort].sort((a, b) => a.verdi - b.verdi || kortIndeks(a) - kortIndeks(b));
  const ut = new Map<number, number>();
  for (let i = 0; i < sortert.length; i++) {
    ut.set(kortIndeks(sortert[i]!), sortert.length < 2 ? 0.5 : i / (sortert.length - 1));
  }
  return ut;
}

const erHonnør = (k: Kort): boolean => k.verdi >= 11;

// ===========================================================================
// 4. Håndvurderingen — «hånden hun VISTE SEG å ha»
// ===========================================================================

/**
 * ============ EN TELLEREGEL, IKKE ET ORAKEL ===============================
 *
 * Meso-nivåets sterkeste tall er «budet hun ga MOT HÅNDEN HUN VISTE SEG Å HA».
 * Det krever et anslag på hva hånden er verdt, og anslaget må komme fra
 * REGLENE — ikke fra en løser og ikke fra et nett. Dette er derfor en
 * honnørtelling av bridge-typen: en fast, deterministisk, dokumentert regel.
 *
 * Den er ikke sann. Den er en MÅLESTOKK: to spillere med samme hånd får samme
 * anslag, så forskjellen i `bud − anslag` mellom to spillere er reell selv om
 * nivået er skjevt. Nettet lærer nivået bort; det kan ikke lære bort en
 * målestokk som flytter seg.
 *
 * SKJEVHETEN, MÅLT OG SAGT HØYT: anslaget teller EGNE stikk, mens budet er
 * LAGETS. Over 800 hender med fire spillere ligger anslaget på median 2,9 og
 * maks 6,2, mens minstebudet er 5. `budavvik` har derfor et positivt
 * grunnivå på omtrent +1,5 til +2 for alle. Det er greit for et TREKK — nivået
 * er felles og konstant — men tallet skal ikke leses som «hun overbyr» før det
 * er sammenlignet med de andre ved bordet.
 */
export function stikkanslag(hånd: readonly Kort[], trumf: Farge): number {
  const lengde: Record<Farge, number> = { S: 0, H: 0, R: 0, K: 0 };
  for (const k of hånd) lengde[k.farge] += 1;
  const tl = lengde[trumf];

  let sum = 0;
  for (const k of hånd) {
    if (k.farge === trumf) {
      if (k.verdi === 14) sum += 1;
      else if (k.verdi === 13) sum += 0.8;
      else if (k.verdi === 12) sum += 0.55;
      else if (k.verdi === 11) sum += 0.35;
    } else {
      const L = lengde[k.farge];
      if (k.verdi === 14) sum += 0.85;
      else if (k.verdi === 13 && L >= 2) sum += 0.5;
      else if (k.verdi === 12 && L >= 3) sum += 0.2;
    }
  }
  // Lengden i seg selv: hver trumf ut over tre tar et stikk mot slutten.
  sum += Math.max(0, tl - 3) * 0.6;
  // Kortfarger er bare verdt noe når det finnes trumf å stjele med.
  for (const f of FARGER) {
    if (f === trumf) continue;
    if (lengde[f] === 0) {
      if (tl >= 4) sum += 0.5;
    } else if (lengde[f] === 1 && tl >= 4) sum += 0.25;
  }
  return sum;
}

/** Beste trumfvalg etter telleregelen, og hva hånden da er verdt. */
export function besteAnslag(hånd: readonly Kort[]): { trumf: Farge; stikk: number } {
  let beste: Farge = "S";
  let best = -Infinity;
  for (const f of FARGER) {
    const v = stikkanslag(hånd, f);
    if (v > best) {
      best = v;
      beste = f;
    }
  }
  return { trumf: beste, stikk: best };
}

/**
 * ============ BUDVINNERENS HÅND ER IKKE DEN HUN BØD PÅ ====================
 *
 * Budvinneren tok opp talongen ETTER budet. Hånden vi ser henne spille med er
 * altså sterkere enn den hun bød på, og å måle `bud − anslag(spillehånd)`
 * ville systematisk fått enhver budvinner til å se FORSIKTIG ut. Det er en
 * feil i fortegnet på hele meso-nivåets viktigste tall.
 *
 * Men vi vet mer enn vi tror. Kortene hun SPILTE (12) pluss kortene hun VRAKET
 * (4) er nøyaktig puljen hun hadde etter opptaket — altså hennes delte hånd
 * PLUSS talongen. Talongen var en tilfeldig delmengde av den puljen, så hånden
 * hun bød på er en tilfeldig 12-delmengde av de 16.
 *
 * Da finnes forventningen EKSAKT: gå gjennom alle C(16, 4) = 1820 måter
 * talongen kunne vært, og snitt anslagene. Det er billig for alle
 * spillerantall (3 → 18, 4 → 1820, 5 → 66, 6 → 495 delmengder) og det fjerner
 * skjevheten helt.
 *
 * DET SOM IKKE ER RETTET, sagt høyt: puljen er bare tilfeldig gitt kortene,
 * ikke gitt at HUN VANT budrunden. Utvalgseffekten står igjen, og den er én av
 * grunnene til at tallet leveres med sin `n` og ikke som en dom.
 */
export function forventetAnslagFørBytte(pulje: readonly Kort[], talong: number): number {
  if (talong <= 0 || talong >= pulje.length) return besteAnslag(pulje).stikk;
  const n = pulje.length;
  const ute = new Array<boolean>(n).fill(false);
  const hånd: Kort[] = [];
  let sum = 0;
  let antall = 0;
  const velg = (fra: number, ta: number): void => {
    if (ta === 0) {
      hånd.length = 0;
      for (let i = 0; i < n; i++) if (!ute[i]) hånd.push(pulje[i]!);
      sum += besteAnslag(hånd).stikk;
      antall += 1;
      return;
    }
    for (let i = fra; i <= n - ta; i++) {
      ute[i] = true;
      velg(i + 1, ta - 1);
      ute[i] = false;
    }
  };
  velg(0, talong);
  return antall === 0 ? besteAnslag(pulje).stikk : sum / antall;
}

/** Budet som tall. Amerikaner = alle stikk, solo = ett hakk over (høyest). */
export function budTall(bud: Bud, antallStikk: number): number | null {
  if (bud === AMERIKANER) return antallStikk;
  if (bud === SOLO) return antallStikk + 1;
  if (typeof bud === "number") return bud;
  return null;
}

// ===========================================================================
// 5. Boka per sete
// ===========================================================================

/**
 * Alt hukommelsen bokfører om ETT sete. Alle felt er rene tellere; ingen av
 * dem har en terskel, og alle bærer sin `n`.
 */
export interface Setebok {
  /** Antall ferdigspilte runder bokført for dette setet. */
  runder: number;

  // ---- MIKRO: hvordan hun spiller kortene -----------------------------
  /** `h(spilt) − E_policy[h]` per kortvalg med to eller flere lovlige kort. */
  residual: Ledd;
  /** Tok hun stikket når hun kunne latt det gå? 1/0 per slik anledning. */
  overtar: Ledd;
  /** Når i runden spiller hun honnørene sine? 0 = først, 1 = sist. */
  honnørsen: Ledd;
  /** Trumfet hun da hun var renons og hadde valget? 1/0. */
  renonstrumf: Ledd;
  /** Valørrangen på kortet hun kastet av da hun IKKE trumfet. */
  avkasthøyde: Ledd;

  // ---- MESO: hvordan hun byr og fører ---------------------------------
  /** `bud − forventet anslag på hånden hun viste seg å ha`. Positiv = overbyr. */
  budavvik: Ledd;
  /** Anslaget på hånden i rundene hun PASSET. Høyt = hun underbyr. */
  passtyrke: Ledd;
  /** Bød hun i det hele tatt? 1/0 per runde. */
  budandel: Ledd;
  /** Klarte hun kontrakten? 1/0 per runde som budvinner. */
  klarte: Ledd;
  /** Valørrangen i puljen på hvert kort hun vraket. Lav = hun vraker lavt. */
  vrakhøyde: Ledd;
  /** Andel farger hun TØMTE med vraket. Høyt = hun vraker seg renons. */
  vrakrenons: Ledd;
  /** Andel av de vrakede kortene som var honnører. */
  vrakhonnør: Ledd;
  /** Valgte hun sin lengste farge som trumf? 1/0. */
  trumflengst: Ledd;
  /** Lengden på trumffargen hun valgte, i kort. */
  trumflengde: Ledd;

  // ---- MAKRO: hvordan hun endrer seg gjennom løpet ---------------------
  /** Stilling FØR runden mot budavvik. Negativ = hun byr mer når hun ligger under. */
  budavvikMotStilling: Samvar;
  /** Stilling mot om hun bød i det hele tatt. Negativ = hun byr oftere bakfra. */
  budandelMotStilling: Samvar;
  /** Stilling mot rundens snittresidual. Negativ = forsiktigere når hun leder. */
  residualMotStilling: Samvar;
  /** Rundenummer mot budavvik. Positiv = hun byr høyere utover i kampen. */
  budavvikMotTid: Samvar;
  /** Rundenummer mot budandel. */
  budandelMotTid: Samvar;
  /** Rundenummer mot snittresidual. Positiv = hun spiller høyere utover i kampen. */
  residualMotTid: Samvar;
  /** Fersk (halveringstid 3 runder) snittresidual. */
  ferskResidual: Fersk;
  /** Fersk budavvik. */
  ferskBudavvik: Fersk;
}

export function tomSetebok(): Setebok {
  return {
    runder: 0,
    residual: TOMT_LEDD,
    overtar: TOMT_LEDD,
    honnørsen: TOMT_LEDD,
    renonstrumf: TOMT_LEDD,
    avkasthøyde: TOMT_LEDD,
    budavvik: TOMT_LEDD,
    passtyrke: TOMT_LEDD,
    budandel: TOMT_LEDD,
    klarte: TOMT_LEDD,
    vrakhøyde: TOMT_LEDD,
    vrakrenons: TOMT_LEDD,
    vrakhonnør: TOMT_LEDD,
    trumflengst: TOMT_LEDD,
    trumflengde: TOMT_LEDD,
    budavvikMotStilling: TOM_SAMVAR,
    budandelMotStilling: TOM_SAMVAR,
    residualMotStilling: TOM_SAMVAR,
    budavvikMotTid: TOM_SAMVAR,
    budandelMotTid: TOM_SAMVAR,
    residualMotTid: TOM_SAMVAR,
    ferskResidual: TOM_FERSK,
    ferskBudavvik: TOM_FERSK,
  };
}

// ===========================================================================
// 6. LAYOUTEN — det neste agent bygger mot
// ===========================================================================

/**
 * ============ TALLVEKTOREN: FAST LENGDE, DOKUMENTERT REKKEFØLGE ===========
 *
 * `LEDD_NAVN` ER layouten. Den er 48 tall PER MOTSTANDER, og vektoren er
 *
 *     (antallSpillere − 1) × 48
 *
 * altså **144 tall ved fire spillere**. Setene kommer i ROTERT rekkefølge sett
 * fra observatøren: blokk 0 er `(eget + 1) % N`, blokk 1 er `(eget + 2) % N`,
 * og så videre. Eget sete er IKKE med — hukommelsen er en bok om de andre.
 *
 * Grovinndelingen er:
 *
 *     indeks  0–10   MIKRO   hvordan hun spiller kortene
 *     indeks 11–28   MESO    hvordan hun byr og fører
 *     indeks 29–47   MAKRO   hvordan hun endrer seg gjennom løpet
 *
 * Hvert par er `(verdi, tiltro)`. Residualet er en trippel `(snitt, tiltro,
 * z/4)`, der `z = snitt/standardfeil` klippet til ±4 — standardfeilen er
 * dermed med, og i den formen §108 sier den betyr noe.
 *
 * Alle verdier er skalert til omtrent [−1, 1]. Budtallene deles på antall
 * stikk i runden; korrelasjonene er allerede i [−1, 1].
 *
 * ALT ER NULL NÅR `n = 0`. Et sete vi aldri har sett gir en blokk med bare
 * nuller, og nettet ser tiltroen 0 ved siden av hver av dem.
 *
 * ============ ÉN SVAKHET SOM MÅ STÅ SKREVET ==============================
 *
 * `…MotStilling` og `…MotTid` er IKKE alltid uavhengige. Drar ett sete fra i
 * en kamp, vokser stillingen monotont med rundenummeret, og de to leddene ser
 * på samme akse. Målt: en stillingsBLIND byder fikk `budavvikMotStilling`
 * +0,50 i en slik kamp.
 *
 * Det krympes ikke bort og terskles ikke bort — begge deler er §108-feilen.
 * Begge leddene leveres med hver sin `n`, og nettet får skille dem i de
 * kampene der de ikke er kollineære. Men den som leser tallet for hånd må
 * vite det.
 */
export const LEDD_NAVN: readonly string[] = [
  // ---- MIKRO (0–10) ----
  "mikro.residual.snitt",
  "mikro.residual.tiltro",
  "mikro.residual.z",
  "mikro.overtar.verdi",
  "mikro.overtar.tiltro",
  "mikro.honnørsen.verdi",
  "mikro.honnørsen.tiltro",
  "mikro.renonstrumf.verdi",
  "mikro.renonstrumf.tiltro",
  "mikro.avkasthøyde.verdi",
  "mikro.avkasthøyde.tiltro",
  // ---- MESO (11–28) ----
  "meso.budavvik.verdi",
  "meso.budavvik.tiltro",
  "meso.passtyrke.verdi",
  "meso.passtyrke.tiltro",
  "meso.budandel.verdi",
  "meso.budandel.tiltro",
  "meso.klarte.verdi",
  "meso.klarte.tiltro",
  "meso.vrakhøyde.verdi",
  "meso.vrakhøyde.tiltro",
  "meso.vrakrenons.verdi",
  "meso.vrakrenons.tiltro",
  "meso.vrakhonnør.verdi",
  "meso.vrakhonnør.tiltro",
  "meso.trumflengst.verdi",
  "meso.trumflengst.tiltro",
  "meso.trumflengde.verdi",
  "meso.trumflengde.tiltro",
  // ---- MAKRO (29–47) ----
  "makro.budavvikMotStilling.korr",
  "makro.budavvikMotStilling.tiltro",
  "makro.budandelMotStilling.korr",
  "makro.budandelMotStilling.tiltro",
  "makro.residualMotStilling.korr",
  "makro.residualMotStilling.tiltro",
  "makro.budavvikMotTid.korr",
  "makro.budavvikMotTid.tiltro",
  "makro.budandelMotTid.korr",
  "makro.budandelMotTid.tiltro",
  "makro.residualMotTid.korr",
  "makro.residualMotTid.tiltro",
  "makro.ferskResidual.verdi",
  "makro.ferskResidual.tiltro",
  "makro.residualdrift",
  "makro.ferskBudavvik.verdi",
  "makro.ferskBudavvik.tiltro",
  "makro.budavvikdrift",
  "makro.runder.tiltro",
] as const;

/** Antall tall per motstander. */
export const LENGDE_PER_SETE = LEDD_NAVN.length; // 48

/** Vektorlengden for et gitt spillerantall. Fire spillere gir 144. */
export const hukommelseslengde = (antallSpillere: number): number =>
  (antallSpillere - 1) * LENGDE_PER_SETE;

/** Lengden i standardoppsettet — fire spillere. */
export const HUKOMMELSE_LENGDE_4 = hukommelseslengde(4);

const klipp = (x: number, g = 1): number => Math.max(-g, Math.min(g, x));

// ===========================================================================
// 7. Boka
// ===========================================================================

/**
 * Motstanderboka for ÉN kamp.
 *
 * `observer(state)` skal kalles på hver tilstand, som `Profilbok.observer`.
 * Den gjør ingenting før fasen er `RUNDE_SLUTT`, og bare én gang per runde.
 */
export class Hukommelse {
  private readonly bøker = new Map<number, Setebok>();
  private sistBokført = -1;
  private poengFør: number[] | null = null;
  private poengRunde = -1;
  private antallStikk = 12;
  private antallSpillere = 4;
  private readonly policy: Policy;

  constructor(policy: Policy = JEVN_POLICY) {
    this.policy = policy;
  }

  bok(sete: number): Setebok {
    let b = this.bøker.get(sete);
    if (b === undefined) {
      b = tomSetebok();
      this.bøker.set(sete, b);
    }
    return b;
  }

  /**
   * ============ STARTBOKA UTENFRA (12. sep, `profil.ts`) ==================
   *
   * Eieren flyttet K2.5: en spillerprofil får overleve kampen. Da må boka
   * kunne STARTE et annet sted enn på null, og det må skje gjennom en dør —
   * ikke ved at kalleren muterer objektet `bok()` gir ut.
   *
   * Grunnen er at `bokfør` og `mikro` jobber på KOPIER (`{ ...this.bok(sete) }`)
   * og skriver dem tilbake. En kaller som muterte referansen mellom to
   * bokføringer ville fått endringen overskrevet av en kopi som ble tatt før,
   * stille og bare noen ganger. Denne setter kartet, som er det de to gjør.
   *
   * DEN ENDRER IKKE HVA BOKA SER. Alt som fyller boka ligger fortsatt bak
   * `fase === "RUNDE_SLUTT"`; dette flytter bare NULLPUNKTET den teller fra.
   * Kalles den aldri, er hver bit som før — det er nullpunktet
   * `test/mlb-profil.test.ts` måler.
   */
  settBok(sete: number, b: Setebok): void {
    this.bøker.set(sete, b);
  }

  /** Antall runder boka har sett i det hele tatt. */
  runder(): number {
    let m = 0;
    for (const [, b] of this.bøker) m = Math.max(m, b.runder);
    return m;
  }

  /**
   * ============ K2-GRENSEN, HÅNDHEVET HER ================================
   *
   * Alt som leser hender ligger bak `fase === "RUNDE_SLUTT"`. Det eneste som
   * leses mens runden går er `totalPoeng`, som er offentlig — og som MÅ leses
   * mens runden går, ellers bærer makronivået rundens eget resultat.
   */
  observer(state: GameState): void {
    this.antallStikk = state.giving.antallStikk;
    this.antallSpillere = state.antallSpillere;

    if (state.fase !== "RUNDE_SLUTT" && state.fase !== "FERDIG") {
      if (this.poengRunde !== state.rundeNr) {
        this.poengFør = [...state.totalPoeng];
        this.poengRunde = state.rundeNr;
      }
      return;
    }
    if (state.fase !== "RUNDE_SLUTT" || state.rundeNr === this.sistBokført) return;
    this.sistBokført = state.rundeNr;
    this.bokfør(state);
    this.poengFør = null;
    this.poengRunde = -1;
  }

  // -------------------------------------------------------------------------

  private bokfør(slutt: GameState): void {
    const N = slutt.antallSpillere;
    const trumf = slutt.trumf;
    const antallStikk = slutt.giving.antallStikk;

    /**
     * HÅNDEN HVERT SETE HADDE: alt det la i løpet av runden. Ved `RUNDE_SLUTT`
     * er hendene tomme, men `historikk` er full. Samme rekonstruksjon som
     * `stilbias.rundensResidualer`, og lovlig av samme grunn: den kjører ETTER
     * at runden er ferdig.
     */
    const hender: Kort[][] = Array.from({ length: N }, () => []);
    for (const stikk of slutt.historikk) {
      for (const kp of stikk.kort) hender[kp.spiller]?.push(kp.kort);
    }

    const poengFør =
      this.poengFør !== null && this.poengFør.length === N
        ? this.poengFør
        : slutt.totalPoeng.map(() => 0);

    // Snittresidualet per sete i DENNE runden — makronivåets y-verdi.
    const runderesidual = new Map<number, { sum: number; n: number }>();

    if (trumf !== null && slutt.historikk.length > 0) {
      this.mikro(slutt, hender, trumf, antallStikk, runderesidual);
    }

    for (let sete = 0; sete < N; sete++) {
      const b = { ...this.bok(sete) };
      b.runder += 1;

      // ---- MESO: budet mot hånden hun viste seg å ha --------------------
      const erBudvinner = sete === slutt.budvinner;
      const pulje = erBudvinner ? [...(hender[sete] ?? []), ...slutt.vrak] : (hender[sete] ?? []);
      const talong = erBudvinner ? slutt.vrak.length : 0;
      const anslag =
        pulje.length === 0 ? null : forventetAnslagFørBytte(pulje, talong);

      const rått = slutt.budrunde.sisteBud[sete] ?? null;
      const bud = rått === null ? null : budTall(rått, antallStikk);
      let budavvik: number | null = null;
      if (bud !== null && anslag !== null) {
        budavvik = bud - anslag;
        b.budavvik = leggTil(b.budavvik, budavvik);
        b.ferskBudavvik = leggTilFersk(b.ferskBudavvik, budavvik);
      } else if (bud === null && anslag !== null) {
        b.passtyrke = leggTil(b.passtyrke, anslag);
      }
      b.budandel = leggTil(b.budandel, bud === null ? 0 : 1);

      if (erBudvinner) {
        const res = slutt.sisteRunde;
        if (res !== null) b.klarte = leggTil(b.klarte, res.klart ? 1 : 0);

        // ---- Vraket: vi ser puljen FØR og hånden ETTER --------------------
        if (slutt.vrak.length > 0 && pulje.length > slutt.vrak.length) {
          const rang = valorrang(pulje);
          for (const k of slutt.vrak) {
            b.vrakhøyde = leggTil(b.vrakhøyde, rang.get(kortIndeks(k)) ?? 0.5);
            b.vrakhonnør = leggTil(b.vrakhonnør, erHonnør(k) ? 1 : 0);
          }
          const iPulje = new Set(pulje.map((k) => k.farge));
          const iHånd = new Set((hender[sete] ?? []).map((k) => k.farge));
          let tømt = 0;
          for (const f of iPulje) if (!iHånd.has(f)) tømt += 1;
          b.vrakrenons = leggTil(b.vrakrenons, tømt / Math.max(1, iPulje.size - 1));
        }

        // ---- Trumfvalget mot formen -------------------------------------
        if (trumf !== null) {
          const egen = hender[sete] ?? [];
          let lengst = 0;
          for (const f of FARGER) lengst = Math.max(lengst, egen.filter((k) => k.farge === f).length);
          const lengde = egen.filter((k) => k.farge === trumf).length;
          if (egen.length > 0) {
            b.trumflengst = leggTil(b.trumflengst, lengde >= lengst ? 1 : 0);
            b.trumflengde = leggTil(b.trumflengde, lengde);
          }
        }
      }

      // ---- MAKRO: stillingen FØR runden, og tiden ----------------------
      /**
       * STILLINGEN er avstanden til den beste ANDRE spilleren. Negativ = hun
       * ligger under. Referansen er den beste andre og ikke snittet, fordi det
       * er den som avgjør om det haster.
       *
       * MÅLESTOKKEN ER RUNDENS SVING, IKKE MÅLPOENGET. `målPoeng` er en
       * regelparameter som kan settes til hva som helst — settes den høyt, blir
       * `x` så liten at samvariasjonen drukner i avrunding (se `Samvar`).
       * `2 × antallStikk` er derimot en STØRRELSE FRA SPILLET: det budvinneren
       * får for en klart maksbud, altså «én runde». `tanh` binder den til
       * (−1, 1) uten en hard vegg.
       *
       * Nettet trenger ikke målpoenget herfra: kampstillingen er et eget trekk
       * i `trekk.ts`. Hukommelsen svarer på «byr hun mer når hun ligger under»,
       * ikke på «hvor nær er kampen slutt».
       */
      let besteAndre = -Infinity;
      for (let p = 0; p < N; p++) if (p !== sete) besteAndre = Math.max(besteAndre, poengFør[p] ?? 0);
      const stilling = Math.tanh(
        ((poengFør[sete] ?? 0) - besteAndre) / Math.max(1, 2 * antallStikk),
      );
      const tid = slutt.rundeNr;

      if (budavvik !== null) {
        b.budavvikMotStilling = leggTilPar(b.budavvikMotStilling, stilling, budavvik);
        b.budavvikMotTid = leggTilPar(b.budavvikMotTid, tid, budavvik);
      }
      b.budandelMotStilling = leggTilPar(b.budandelMotStilling, stilling, bud === null ? 0 : 1);
      b.budandelMotTid = leggTilPar(b.budandelMotTid, tid, bud === null ? 0 : 1);

      const rr = runderesidual.get(sete);
      if (rr !== undefined && rr.n > 0) {
        const m = rr.sum / rr.n;
        b.residualMotStilling = leggTilPar(b.residualMotStilling, stilling, m);
        b.residualMotTid = leggTilPar(b.residualMotTid, tid, m);
        b.ferskResidual = leggTilFersk(b.ferskResidual, m);
      }

      this.bøker.set(sete, b);
    }
  }

  /**
   * MIKRO — runden spilles om igjen, kort for kort.
   *
   * Rekonstruksjonen følger `stilbias.rundensResidualer` nøye, av de samme
   * grunnene: fasen må settes tilbake til `SPILL` (ellers gir `lovligeKort`
   * tom liste), historikken må bygges opp underveis (ellers ser en policy en
   * tom fortid), og tellerne må NULLSTILLES i stedet for å arves — en
   * sluttilstand bærer rundens fasit i `stikkVunnet`, `makkerAvslørt` og
   * `totalPoeng`.
   */
  private mikro(
    slutt: GameState,
    hender: readonly Kort[][],
    trumf: Farge,
    antallStikk: number,
    runderesidual: Map<number, { sum: number; n: number }>,
  ): void {
    // Honnørene hvert sete hadde, og når de ble spilt (bare valgte spill).
    const honnørIgjen = hender.map((h) => new Set(h.filter(erHonnør).map(kortIndeks)));

    let s: GameState = {
      ...slutt,
      fase: "SPILL",
      hender: hender.map((h) => [...h]),
      historikk: [],
      bord: [],
      stikkSpilt: 0,
      makkerAvslørt: false,
      stikkVunnet: slutt.stikkVunnet.map(() => 0),
      totalPoeng: this.poengFør ?? slutt.totalPoeng,
    } as GameState;

    const spilte: GameState["historikk"][number][] = [];
    for (let si = 0; si < slutt.historikk.length; si++) {
      const stikk = slutt.historikk[si]!;
      for (const kp of stikk.kort) {
        s = { ...s, iTur: kp.spiller } as GameState;
        const sete = kp.spiller;
        const lov = lovligeKort(s, sete);
        const b = { ...this.bok(sete) };
        let endret = false;

        if (lov.length >= 2) {
          const rang = prisrang(lov, trumf);
          const h = rang.get(kortIndeks(kp.kort));
          if (h !== undefined) {
            // ---- residualet ------------------------------------------
            const p = this.policy.fordeling(s, sete, lov);
            let forventet = 0;
            let sum = 0;
            for (let i = 0; i < lov.length; i++) {
              const w = Number.isFinite(p[i]) ? Math.max(0, p[i]!) : 0;
              sum += w;
              forventet += w * (rang.get(kortIndeks(lov[i]!)) ?? 0);
            }
            if (sum > 0) {
              const res = h - forventet / sum;
              b.residual = leggTil(b.residual, res);
              const rr = runderesidual.get(sete) ?? { sum: 0, n: 0 };
              rr.sum += res;
              rr.n += 1;
              runderesidual.set(sete, rr);
              endret = true;
            }

            // ---- honnørtimingen: BARE når hun hadde et valg ------------
            if (erHonnør(kp.kort) && honnørIgjen[sete]?.has(kortIndeks(kp.kort))) {
              honnørIgjen[sete]!.delete(kortIndeks(kp.kort));
              const nårn = antallStikk < 2 ? 0.5 : si / (antallStikk - 1);
              b.honnørsen = leggTil(b.honnørsen, klipp(nårn, 1));
              endret = true;
            }

            // ---- tar hun stikk hun kunne latt gå? ----------------------
            const leder = ledendeKort(s.bord, trumf);
            if (leder !== null) {
              let kanTa = false;
              let kanLaVære = false;
              for (const k of lov) {
                if (slår(k, leder, trumf)) kanTa = true;
                else kanLaVære = true;
              }
              if (kanTa && kanLaVære) {
                b.overtar = leggTil(b.overtar, slår(kp.kort, leder, trumf) ? 1 : 0);
                endret = true;
              }

              // ---- renons: trumfer hun, eller kaster hun av? ------------
              const ledFarge = s.bord[0]!.kort.farge;
              const egen = s.hender[sete] ?? [];
              const harFargen = egen.some((k) => k.farge === ledFarge);
              if (!harFargen && ledFarge !== trumf) {
                const trumfer = egen.filter((k) => k.farge === trumf);
                const andre = egen.filter((k) => k.farge !== trumf);
                if (trumfer.length > 0 && andre.length > 0) {
                  const tok = kp.kort.farge === trumf;
                  b.renonstrumf = leggTil(b.renonstrumf, tok ? 1 : 0);
                  /**
                   * HADDE HUN NOE Å VELGE MELLOM? Med ETT avkastkort finnes
                   * ingen rang, og å telle det som «midt på treet» ville
                   * fortynnet signalet med tomme observasjoner — samme feil
                   * som `bydde.n` mot `klarte.n` i K4, og samme grunn som at
                   * residualet krever to lovlige kort.
                   */
                  if (!tok && andre.length >= 2) {
                    const vr = valorrang(andre);
                    b.avkasthøyde = leggTil(b.avkasthøyde, vr.get(kortIndeks(kp.kort)) ?? 0.5);
                  }
                  endret = true;
                }
              }
            }
          }
        }
        if (endret) this.bøker.set(sete, b);

        const nye = s.hender.map((h, p) =>
          p === sete ? h.filter((k) => !likeKort(k, kp.kort)) : h,
        );
        // Makkeren røpes I DET det etterlyste kortet legges - se motor.ts.
        const røpt = s.makkerAvslørt || (s.etterlyst !== null && likeKort(kp.kort, s.etterlyst));
        s = { ...s, hender: nye, bord: [...s.bord, kp], makkerAvslørt: røpt } as GameState;
      }
      spilte.push(stikk);
      const vunnet = s.stikkVunnet.map((x, p) => (p === stikk.vinner ? x + 1 : x));
      s = {
        ...s,
        bord: [],
        historikk: [...spilte],
        stikkSpilt: s.stikkSpilt + 1,
        stikkVunnet: vunnet,
      } as GameState;
    }
  }

  // -------------------------------------------------------------------------

  /**
   * HUKOMMELSEN SOM FLAT TALLVEKTOR — klar til å bli trekk.
   *
   * Lengden er `(antallSpillere − 1) × 48`, altså 144 ved fire spillere.
   * Rekkefølgen er `LEDD_NAVN`, gjentatt per motstander i rotert rekkefølge
   * `(eget + 1), (eget + 2), …`. Se kommentaren over `LEDD_NAVN`.
   */
  vektor(egetSete: number, antallSpillere: number = this.antallSpillere): Float64Array {
    const ut = new Float64Array(hukommelseslengde(antallSpillere));
    for (let d = 1; d < antallSpillere; d++) {
      const sete = (egetSete + d) % antallSpillere;
      this.skrivSete(ut, (d - 1) * LENGDE_PER_SETE, this.bok(sete));
    }
    return ut;
  }

  private skrivSete(ut: Float64Array, o: number, b: Setebok): void {
    const stikk = Math.max(1, this.antallStikk);
    const par = (i: number, verdi: number, n: number): void => {
      ut[o + i] = klipp(verdi);
      ut[o + i + 1] = tiltro(n);
    };

    // ---- MIKRO ----
    /**
     * Z-LEDDET: `snitt/standardfeil`, klippet til ±4 og skalert til ±1. Det er
     * standardfeilen i den formen §108 sier den betyr noe — «hvor sikkert er
     * avviket», ikke «hvor stort er det».
     *
     * NULL SPREDNING ER MAKSIMALT BEVIS, IKKE MANGLENDE BEVIS. En motstander
     * som spiller nøyaktig samme avvik hver gang gir `se = 0`, og en naiv
     * `se > 0`-vakt ville da meldt «vet ingenting» om den mest forutsigbare
     * spilleren ved bordet. Fanget av at teststiliserte vaner er akkurat så
     * deterministiske.
     */
    const se = standardfeil(b.residual);
    const mRes = snitt(b.residual);
    ut[o + 0] = klipp(mRes);
    ut[o + 1] = tiltro(b.residual.n);
    ut[o + 2] =
      b.residual.n < 2 ? 0 : se > 0 && Number.isFinite(se) ? klipp(mRes / se / 4) : Math.sign(mRes);
    par(3, snitt(b.overtar), b.overtar.n);
    par(5, snitt(b.honnørsen), b.honnørsen.n);
    par(7, snitt(b.renonstrumf), b.renonstrumf.n);
    par(9, snitt(b.avkasthøyde), b.avkasthøyde.n);

    // ---- MESO ----
    par(11, snitt(b.budavvik) / stikk, b.budavvik.n);
    par(13, snitt(b.passtyrke) / stikk, b.passtyrke.n);
    par(15, snitt(b.budandel), b.budandel.n);
    par(17, snitt(b.klarte), b.klarte.n);
    par(19, snitt(b.vrakhøyde), b.vrakhøyde.n);
    par(21, snitt(b.vrakrenons), b.vrakrenons.n);
    par(23, snitt(b.vrakhonnør), b.vrakhonnør.n);
    par(25, snitt(b.trumflengst), b.trumflengst.n);
    par(27, snitt(b.trumflengde) / stikk, b.trumflengde.n);

    // ---- MAKRO ----
    par(29, korrelasjon(b.budavvikMotStilling), b.budavvikMotStilling.n);
    par(31, korrelasjon(b.budandelMotStilling), b.budandelMotStilling.n);
    par(33, korrelasjon(b.residualMotStilling), b.residualMotStilling.n);
    par(35, korrelasjon(b.budavvikMotTid), b.budavvikMotTid.n);
    par(37, korrelasjon(b.budandelMotTid), b.budandelMotTid.n);
    par(39, korrelasjon(b.residualMotTid), b.residualMotTid.n);
    /**
     * FERSKVEKTEN METTER MOT ~4,85, ikke mot uendelig. Med `TILTRO_K = 8`
     * ville tiltroen aldri passert 0,38 uansett hvor mange runder vi så, og
     * nettet ville lest et velbelagt ferskestimat som nesten ukjent. `k = 2`
     * gir 0,71 ved metning — samme form, riktig skala.
     */
    ut[o + 41] = klipp(b.ferskResidual.verdi);
    ut[o + 42] = tiltro(b.ferskResidual.vekt, 2);
    ut[o + 43] = b.ferskResidual.vekt > 0 && b.residual.n > 0
      ? klipp(b.ferskResidual.verdi - snitt(b.residual))
      : 0;
    ut[o + 44] = klipp(b.ferskBudavvik.verdi / stikk);
    ut[o + 45] = tiltro(b.ferskBudavvik.vekt, 2);
    ut[o + 46] = b.ferskBudavvik.vekt > 0 && b.budavvik.n > 0
      ? klipp((b.ferskBudavvik.verdi - snitt(b.budavvik)) / stikk)
      : 0;
    ut[o + 47] = tiltro(b.runder);
  }
}
