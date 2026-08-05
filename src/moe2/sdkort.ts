/**
 * SINGLE-DUMMY EVALUERING – den validerte formen.
 *
 * Modulen het `sdkort` fordi kortspillet var den første beslutningen som ble
 * bygget om fra DD til SD. Den dekker nå tre: kortspill, vrak og trumf. Alle
 * tre deler nøyaktig samme maskineri (`vurderSD`), og det er med vilje – å
 * skrive verdenssampling og utspilling på nytt per beslutning er den klassen
 * feil som ga `i >> 4` mot `floor(c / 13)` i første utkast.
 *
 * BAKGRUNNEN, målt 25. juli 2026 med godkjenningsporten:
 *
 *   fasit      metode         korrigert korrelasjon mot poeng
 *   bud        single dummy   +0,925   GODKJENT
 *   vrak       single dummy   +0,848   GODKJENT   (denne modulen)
 *   trumf      single dummy   +0,831   GODKJENT   (denne modulen)
 *   kortspill  single dummy   +0,718   GODKJENT   (denne modulen)
 *   trumf      double dummy   +0,234   avvist
 *   vrak       double dummy   +0,144   avvist
 *   kortspill  double dummy   −0,609   AVVIST, feil fortegn
 *
 * Sju kjøringer: fire single dummy, fire godkjenninger; tre double dummy, tre
 * avvisninger. En fasit som forutsetter informasjon du ikke har er ikke et mål
 * – den er en felle. DD-kortet er optimalt mot et motspill som ser like mye som
 * deg selv; mot skjult informasjon setter det opp linjer som bare virker mot
 * perfekt forsvar.
 *
 * Klarest i etterlysningen: DD kaller på valør 4,3 fordi den SER hvem som
 * sitter med toeren. SD-fasiten, som ikke ser det, kaller på 12,1 – og henter
 * +0,91 poeng per runde uten at noen har fortalt den at høyt er bra.
 *
 * DENNE MODULEN gjør det etter samme oppskrift som budet:
 *
 *   1. Trekk K verdener som er forenlige med det AGENTEN har sett.
 *   2. Utfør kandidathandlingen, og la så en REALISTISK modell (NevroHjerne)
 *      spille resten ut – i alle seter, uten å se skjulte kort.
 *   3. Kandidatens verdi er snittutfallet over verdenene.
 *
 * Ingen ser noe de ikke skal. Det er hele forskjellen fra DD.
 */

import {
  FARGER,
  likeKort,
  lovligeKort,
  utfør,
  type GameState,
  type Handling,
  type Kort,
  type Verdi,
} from "../index.ts";
// Konverteringen HENTES, den skrives ikke paa nytt. Foerste utkast rullet sin
// egen med `i >> 4` mens den kanoniske bruker `floor(c / 13)` - to helt ulike
// kodinger, og feilen ville gitt gale kort i stillhet. Tre av dagens feil var
// av samme klasse (nt/t-vektorene), saa duplisert konvertering er forbudt her.
import { intTilKort } from "../solver/dds.ts";
import { trekkVerdenBelief, type Budprior , type Verden } from "../solver/sampler.ts";

/** Motstandermodellen som spiller runden ferdig. NevroAgent oppfyller det. */
export interface Utspiller {
  velgHandling(state: GameState): Handling;
}

export interface SDOpts {
  /** Antall verdener forenlige med agentens informasjon. */
  readonly verdener: number;
  readonly rng: () => number;
  /**
   * Utfallsmål. Standard er egne poeng minus snittet av de tre andre – samme
   * differanse som benken bruker, så treningsmålet og målestokken er ett.
   */
  readonly mål?: (sluttState: GameState, spiller: number) => number;
  /**
   * Ferdig trukne verdener. Settes når to kandidatpartier skal måles i
   * NØYAKTIG de samme verdenene – ellers blir forskjellen mellom dem dominert
   * av hvilke hender som tilfeldigvis ble trukket.
   */
  readonly verdenerHender?: readonly (readonly number[][])[];
  /**
   * HVORDAN FLERE FORTSETTELSER SLÅS SAMMEN — Brown & Sandholm (2019).
   *
   * `"min"` er papirets egen form: motparten VELGER fortsettelse, så verdien
   * er den fortsettelsen som skader oss mest. Det er valget som gjør
   * evalueringen robust og ikke-utnyttbar.
   *
   * `"snitt"` er den mildere formen: robust i forventning i stedet for i verste
   * fall. Tas med fordi Amerikaneren ikke er nullsum med faste lag — «motparten
   * velger» er mindre entydig her enn i toparts-poker.
   *
   * MERK at `min` her IKKE lider av den vanlige minimums-skjevheten. Verdenen
   * er FAST og hver fortsettelse er DETERMINISTISK, så vi tar ikke minimum av
   * støyende estimater av samme størrelse – vi tar minimum over genuint ulike
   * strategier. Det er nøyaktig den størrelsen papiret vil ha.
   */
  readonly fortsKombi?: "min" | "snitt" | "cfr";
  /**
   * TROSVEKT på verdenstrekkeren — se `src/moe2/troprior.ts`.
   *
   * Uten den vektes kandidatverdenene bare etter BUDET, og ingenting av
   * hvordan folk har SPILT teller. `sd-stoy.ts` målte at etiketten da er mest
   * støy (signal/støy 0,27 ved 12 verdener).
   */
  readonly trovekt?: (v: Verden) => number;
}

export interface SDKortOpts extends SDOpts {
  /** Begrens til disse kandidatene (ellers alle lovlige kort). */
  readonly kandidater?: readonly Kort[];
}

const standardMål = (s: GameState, spiller: number): number => {
  const egne = s.totalPoeng[spiller] ?? 0;
  return egne - (s.totalPoeng.reduce((a, b) => a + b, 0) - egne) / 3;
};

/**
 * Bytter ut de skjulte hendene med verdenens, og lar agentens egen hånd stå.
 *
 * Observatørens hånd ER kjent, så den skal ikke erstattes – gjør vi det,
 * evaluerer vi en annen hånd enn den vi faktisk har.
 *
 * MAKKEREN MÅ FLYTTE MED. `state.makker` settes én gang, i VELG, som «den som
 * sitter med det etterlyste kortet», og motoren rører den aldri igjen. Flytter
 * vi kortene uten å flytte makkeren, sitter feltet igjen og peker på et sete
 * som i denne verdenen IKKE er makker – og `avsluttRunde` gir da stikkene og
 * poengene til feil lag. Konsekvensen var stum og stor: `lovligeKort`
 * håndhever makkerplikten på HÅNDEN, så utspillingen ble riktig, men
 * poengsummen den ble målt med var feil.
 *
 * Det bet nøyaktig i STIKK 1, som er den eneste stillingen der det etterlyste
 * kortet fortsatt er uspilt og usett – makkerplikten legger det ned med én
 * gang. Fra stikk 2 og ut er kortet spilt, `trekkVerdenBelief` lar det ligge og
 * `state.makker` er allerede riktig. Åpningsutspillet, som er hele
 * etterlysningskonvensjonen, lå altså i den ene stillingen feilen traff.
 *
 * Finner vi ikke kortet på noen hånd er det spilt, og da står `s.makker`.
 * Er `s.makker` null (solo, eller ingen etterlysning) rører vi den ikke.
 *
 * FORBEHOLD, ikke fikset her: i BUDRUNDEN er talongens fire kort fortsatt i
 * `state.talong`, og verdenstrekningen legger dem i en «død» bin som ikke
 * kommer tilbake i `Verden`. Byttes hendene da, blir talongen den gamle og
 * kortene kan dukke opp to steder. `vurderSD` skal derfor ikke kalles i
 * BUDRUNDE-fasen; VRAK, VELG og SPILL er trygge, for der er talongen alt
 * fordelt.
 */
export function medVerden(s: GameState, hender: readonly number[][], observator: number): GameState {
  const nye = s.hender.map((h, p) => (p === observator ? h : hender[p]!.map(intTilKort)));
  let makker = s.makker;
  if (makker !== null && s.etterlyst !== null) {
    const holder = nye.findIndex((h) => h.some((k) => likeKort(k, s.etterlyst!)));
    if (holder >= 0) makker = holder;
  }
  return { ...s, hender: nye, makker };
}

export interface KortVurdering {
  readonly kort: Kort;
  /** Snittutfall over verdenene. */
  readonly verdi: number;
  /** Hvor mange verdener som faktisk lot seg spille ut. */
  readonly n: number;
}

/** SD-verdien av én kandidathandling, med sin plass i kandidatlisten. */
export interface SDVurdering {
  /** Indeks i kandidatlisten som ble sendt inn. */
  readonly indeks: number;
  /** Snittutfall over verdenene. */
  readonly verdi: number;
  /** Hvor mange verdener som faktisk lot seg spille ut. */
  readonly n: number;
}

/**
 * Trekker K verdener EN gang, til bruk på alle kandidatene.
 *
 * Skilt ut som egen funksjon fordi parringen er hele poenget: trekkes nye
 * verdener per kandidat, blir forskjellen mellom to kandidater dominert av
 * hvilke hender som tilfeldigvis ble trukket – samme prinsipp som
 * duplikatgiverne på benken.
 */
export function trekkVerdener(
  state: GameState,
  spiller: number,
  antall: number,
  rng: () => number,
  prior?: Budprior,
  trovekt?: (v: Verden) => number,
  kandidater = 3,
): number[][][] {
  const ut: number[][][] = [];
  for (let v = 0; v < antall; v++) {
    // Med `prior` vektes kandidatverdenene etter en LÆRT budmodell i stedet
    // for den håndlagde formelen. Kalleren må sørge for at prioren beskriver
    // dem som faktisk sitter ved bordet - se `laertForenlighet` i sampler.ts.
    const w = trekkVerdenBelief(state, spiller, rng, kandidater, prior, undefined, trovekt);
    if (w !== null) ut.push(w.hender);
  }
  return ut;
}

/** Spiller tilstanden ferdig med `motpart` i alle seter. */
function spillFerdig(start: GameState, motpart: Utspiller): GameState {
  let s = start;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    s = utfør(s, motpart.velgHandling(s)).state;
  }
  return s;
}

/**
 * KJERNEN. Vurderer hver kandidathandling ved å utføre den og la en realistisk
 * modell spille runden ferdig i K verdener forenlige med agentens EGEN
 * informasjon.
 *
 * Handlingstypen er likegyldig – SPILL, VRAK og VELG går alle gjennom her – og
 * det er nettopp derfor kortspill, vrak og trumf skal dele denne funksjonen.
 *
 * Returnerer tom liste når ingen verden lot seg trekke. Kalleren skal da IKKE
 * lære noe: å behandle «ingen data» som «alle valg er like gode» var
 * mekanismen som gjorde `lærForsvar` verre enn ingenting.
 */
export function vurderSD(
  state: GameState,
  spiller: number,
  motpart: Utspiller | readonly Utspiller[],
  handlinger: readonly Handling[],
  opts: SDOpts,
): SDVurdering[] {
  if (handlinger.length === 0) return [];
  const mål = opts.mål ?? standardMål;
  const verdener =
    opts.verdenerHender ??
    trekkVerdener(state, spiller, opts.verdener, opts.rng, undefined, opts.trovekt);
  if (verdener.length === 0) return [];

  /**
   * FORTSETTELSENE. Én modell er det gamle oppsettet og gir BIT-IDENTISK
   * resultat – ingen stille regresjon for noen som ikke ber om det nye.
   */
  const forts: readonly Utspiller[] = Array.isArray(motpart)
    ? (motpart as readonly Utspiller[])
    : [motpart as Utspiller];
  const kombi = opts.fortsKombi ?? "min";

  /**
   * UTBYTTEMATRISEN A[i][j]: vår handling i mot motpartens fortsettelse j,
   * midlet over verdenene.
   *
   * MIDLINGEN OVER VERDENER SKJER FØRST, og det er ikke en detalj. Tar man
   * minimum INNE i hver verden, får motparten velge ULIK fortsettelse i hver
   * verden — og det er strategifusjon på motpartens side, nøyaktig den feilen
   * PIMC kritiseres for. Motparten kjenner like lite til kortfordelingen som
   * vi gjør, så fortsettelsen må velges ÉN gang for hele informasjonsmengden.
   */
  const A: number[][] = [];
  for (let i = 0; i < handlinger.length; i++) {
    const rad = new Array<number>(forts.length).fill(0);
    for (const hender of verdener) {
      const etter = utfør(medVerden(state, hender, spiller), handlinger[i]!).state;
      for (let j = 0; j < forts.length; j++) rad[j]! += mål(spillFerdig(etter, forts[j]!), spiller);
    }
    for (let j = 0; j < forts.length; j++) rad[j]! /= verdener.length;
    A.push(rad);
  }

  // Motpartens blanding over fortsettelser.
  let τ: number[];
  if (kombi === "cfr") τ = løsMatrisespill(A);
  else if (kombi === "snitt") τ = new Array<number>(forts.length).fill(1 / forts.length);
  else τ = [];

  const ut: SDVurdering[] = [];
  for (let i = 0; i < handlinger.length; i++) {
    const rad = A[i]!;
    let v: number;
    if (kombi === "min") {
      v = rad[0]!;
      for (let j = 1; j < rad.length; j++) if (rad[j]! < v) v = rad[j]!;
    } else {
      v = 0;
      for (let j = 0; j < rad.length; j++) v += τ[j]! * rad[j]!;
    }
    ut.push({ indeks: i, verdi: v, n: verdener.length });
  }
  return ut;
}

/**
 * REGRET MATCHING på et lite nullsum-matrisespill — CFR der den faktisk gjelder.
 *
 * Brown & Sandholms poeng er ikke «kjør CFR på hele spillet». Det er: ved
 * dybdegrensen, LØS et lite delspill i stedet for å stole på én fast
 * utspilling. Her er delspillet nøyaktig `handlinger x fortsettelser`, og
 * rolloutene som fyller det er alt beregnet — så løsningen koster
 * mikrosekunder oppå millisekunder.
 *
 * Returnerer motpartens likevektsblanding. Vår verdi per handling blir da
 * `Σ_j τ_j A[i][j]`: hva kortet er verdt når motparten spiller sitt beste
 * svar i BLANDING, i stedet for den ene verste fortsettelsen (paranoid) eller
 * et uvektet snitt (naivt).
 *
 * Motparten minimerer, vi maksimerer. Deterministisk: ingen RNG, så to like
 * kall gir bit-identisk svar.
 */
function løsMatrisespill(A: readonly (readonly number[])[], runder = 400): number[] {
  const m = A.length;
  const k = A[0]?.length ?? 0;
  if (m === 0 || k === 0) return [];
  if (k === 1) return [1];
  const angerV = new Array<number>(m).fill(0);
  const angerM = new Array<number>(k).fill(0);
  const sumM = new Array<number>(k).fill(0);
  const fra = (anger: readonly number[]): number[] => {
    let s = 0;
    for (const a of anger) if (a > 0) s += a;
    if (s <= 0) return new Array<number>(anger.length).fill(1 / anger.length);
    return anger.map((a) => (a > 0 ? a / s : 0));
  };
  for (let t = 0; t < runder; t++) {
    const σ = fra(angerV);
    const τ = fra(angerM);
    for (let j = 0; j < k; j++) sumM[j]! += τ[j]!;
    // Vår nytte per handling gitt motpartens blanding, og omvendt.
    const uV = A.map((rad) => rad.reduce((s, x, j) => s + x * τ[j]!, 0));
    const vV = uV.reduce((s, x, i) => s + x * σ[i]!, 0);
    for (let i = 0; i < m; i++) angerV[i]! += uV[i]! - vV;
    const uM = new Array<number>(k).fill(0);
    for (let j = 0; j < k; j++) for (let i = 0; i < m; i++) uM[j]! += A[i]![j]! * σ[i]!;
    // Motparten MINIMERER, så angeren har motsatt fortegn.
    for (let j = 0; j < k; j++) angerM[j]! += vV - uM[j]!;
  }
  const s = sumM.reduce((a, b) => a + b, 0);
  return s > 0 ? sumM.map((x) => x / s) : new Array<number>(k).fill(1 / k);
}

/** Indeksen med høyest SD-verdi, eller −1 om ingen verden lot seg trekke. */
export function besteIndeks(vurdert: readonly SDVurdering[]): number {
  if (vurdert.length === 0) return -1;
  let beste = vurdert[0]!;
  for (const v of vurdert) if (v.verdi > beste.verdi) beste = v;
  return beste.indeks;
}

/**
 * Vurderer hvert lovlige kort ved å spille runden ferdig i K samplede verdener.
 */
export function vurderKortSD(
  state: GameState,
  spiller: number,
  motpart: Utspiller | readonly Utspiller[],
  opts: SDKortOpts,
): KortVurdering[] {
  const lovlige = opts.kandidater ?? lovligeKort(state, spiller);
  if (lovlige.length === 0) return [];
  const vurdert = vurderSD(
    state,
    spiller,
    motpart,
    lovlige.map((kort) => ({ type: "SPILL", spiller, kort }) as const),
    opts,
  );
  return vurdert.map((v) => ({ kort: lovlige[v.indeks]!, verdi: v.verdi, n: v.n }));
}

/** Det beste kortet etter SD-vurdering, eller null om ingen verden lot seg trekke. */
export function besteKortSD(
  state: GameState,
  spiller: number,
  motpart: Utspiller,
  opts: SDKortOpts,
): Kort | null {
  const vurdert = vurderKortSD(state, spiller, motpart, opts);
  if (vurdert.length === 0) return null;
  let beste = vurdert[0]!;
  for (const v of vurdert) if (v.verdi > beste.verdi) beste = v;
  return beste.kort;
}

// --- VRAK ------------------------------------------------------------------

/**
 * SD-verdien av hvert kandidatvrak: legg vraket, og la `motpart` velge trumf
 * OG spille runden ferdig i alle seter, i K verdener.
 *
 * TO FORSKJELLER FRA DD-FASITEN, som begge er poenget og ikke skjønnhetsfeil:
 *
 * 1. DD-fasiten holder trumfen fast med `fastTrumfvalg` for å isolere vraket.
 *    Her velges trumfen av den samme modellen som faktisk kommer til å velge
 *    den. Det er nødvendig: verdien av et vrak ER verdien det får under det
 *    trumfvalget som følger, og et hypotetisk trumfvalg er nettopp den slags
 *    informasjon agenten ikke har.
 * 2. Kandidatlisten er ikke alle C(16,4) = 1 820. Ett SD-oppslag koster en
 *    hel utspilling per verden; 1 820 × K er uoverkommelig. Kalleren
 *    forhåndsfiltrerer – DD duger godt som grovsil selv om den er målt
 *    ubrukelig som fasit – og prisen for filteret skal MÅLES, ikke antas.
 *
 * `kandidater` er kortindekser (farge × 13 + verdi − 2), samme koding som
 * `kortIndeks`/`kortTilInt`.
 */
export function vurderVrakSD(
  state: GameState,
  motpart: Utspiller | readonly Utspiller[],
  kandidater: readonly (readonly number[])[],
  opts: SDOpts,
): SDVurdering[] {
  if (state.fase !== "VRAK" || state.budvinner === null) return [];
  const bv = state.budvinner;
  return vurderSD(
    state,
    bv,
    motpart,
    kandidater.map((v) => ({ type: "VRAK", spiller: bv, kort: v.map(intTilKort) }) as const),
    opts,
  );
}

// --- TRUMF -----------------------------------------------------------------

/**
 * Et trumfvalg: farge 0..3 og etterlyst valør 2..14. Strukturelt likt
 * `Trumfhandling` i `eksperter/trumf.ts`, som derfor kan sendes rett inn.
 */
export interface Trumfvalg {
  readonly farge: number;
  readonly valør: number;
}

/**
 * SD-verdien av hvert (trumffarge, etterlyst valør).
 *
 * DETTE ER STEDET DD FEILET MEST SPEKTAKULÆRT. Etterlysningen bestemmer hvem
 * makkeren blir. Dobbelt dummy SER hvem som sitter med toeren og kaller derfor
 * på valør 4,3 i snitt; uten den informasjonen er samme trekk et sjansespill,
 * og nevro (12,9) scorer et helt poeng bedre.
 *
 * Her får makkeren komme ut av verdenstrekningen: i hver av de K verdenene
 * havner det etterlyste kortet der det tilfeldigvis havner, og valørens verdi
 * er snittet over dem. Det er nøyaktig usikkerheten DD trollbinder bort.
 *
 * Søkerommet er lite (typisk ~40 par), så listen kan enumereres komplett.
 */
export function vurderTrumfSD(
  state: GameState,
  motpart: Utspiller,
  kandidater: readonly Trumfvalg[],
  opts: SDOpts,
): SDVurdering[] {
  if (state.fase !== "VELG" || state.budvinner === null) return [];
  const bv = state.budvinner;
  return vurderSD(
    state,
    bv,
    motpart,
    kandidater.map((h) => {
      const farge = FARGER[h.farge]!;
      return {
        type: "VELG",
        spiller: bv,
        trumf: farge,
        etterlyst: { farge, verdi: h.valør as Verdi },
      } as const;
    }),
    opts,
  );
}
