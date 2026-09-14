/**
 * Verdenssampler for imperfekt informasjon.
 *
 * En bot ser bare sin egen hånd, de spilte kortene og offentlig info. For å
 * spille nær optimalt (PIMC) trekker den mange «verdener» – komplette
 * kortfordelinger som er forenlige med alt den vet – og løser hver eksakt.
 *
 * Denne modulen bygger slike determiniseringer fra en GameState sett fra én
 * spiller, og respekterer:
 *  - egen hånd og alle spilte kort (kjent),
 *  - motspillernes håndstørrelser (offentlig),
 *  - fargesvikt: en spiller som ikke fulgte farge er renonce i den fargen,
 *  - det etterlyste kortet ligger alltid hos en motspiller (aldri i vraket),
 *  - budvinnerens eget vrak når observatøren er budvinner.
 */

import { FARGER, type Kort } from "../kort.ts";
import { kortTilInt } from "./dds.ts";
import type { DDOppsett } from "./dds.ts";
import type { GameState } from "../motor.ts";

export interface Verden {
  /** Komplette hender for alle spillere (kort-int), inkl. observatøren. */
  readonly hender: number[][];
  /**
   * KORTENE DENNE VERDENEN PAASTAAR BLE VRAKET, eller tom liste.
   *
   * Vraket er skjult for alle andre enn budvinneren, saa fire ukjente kort
   * legges i en «doed binge». Men de kortene er VALGT, ikke tilfeldige - og
   * uten aa eksponere dem kan ingen vekt vurdere om valget var troverdig.
   *
   * Maalt over 720 runder (§111): budvinneren skaper 0,967 renonser per runde,
   * mot 0,169 om hun bare kastet billigst og 0,101 tilfeldig. Sampleren antok
   * det siste.
   */
  readonly vrakVerden: number[];
  /** declLag[spiller] = på budlaget (budvinner + makker i denne verdenen). */
  readonly declLag: boolean[];
  /** Makkeren i denne verdenen, eller null (solo / ingen). */
  readonly makkerVerden: number | null;
}

/**
 * Alle 52 kort som int. EKSPORTERT fordi `medVerden` maa regne talongen som
 * residualet - og en kopi av kortuniverset ville vaert noeyaktig den
 * duplikatklassen kommentaren over `intTilKort`-importen i sdkort.ts advarer
 * mot.
 */
export function alleKortInt(): number[] {
  const ut: number[] = [];
  for (let c = 0; c < 52; c++) ut.push(c);
  return ut;
}

/** Renonce-fargeindekser per spiller ut fra spillet så langt. */
export function infererRenonce(state: GameState): Set<number>[] {
  const voids: Set<number>[] = [];
  for (let p = 0; p < state.antallSpillere; p++) voids.push(new Set());
  const behandle = (kort: { spiller: number; kort: Kort }[]): void => {
    if (kort.length === 0) return;
    const led = FARGER.indexOf(kort[0]!.kort.farge);
    for (const kp of kort) {
      const f = FARGER.indexOf(kp.kort.farge);
      if (f !== led) voids[kp.spiller]!.add(led);
    }
  };
  for (const s of state.historikk) behandle(s.kort);
  behandle(state.bord);
  return voids;
}

function stokkInt(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

interface Bin {
  spiller: number; // -1 = vrak (dødt)
  kapasitet: number;
  forbud: Set<number> | null; // forbudte farger (renonce)
  kort: number[];
}

/**
 * Trekker én determinisering forenlig med observatørens informasjon.
 * Returnerer null dersom en gyldig fordeling ikke ble funnet (svært sjelden;
 * kalleren kan prøve igjen).
 */
export function trekkVerden(state: GameState, observator: number, rng: () => number): Verden | null {
  const N = state.antallSpillere;
  const budvinner = state.budvinner;

  // Spilte kort (offentlig) + observatørens hånd + eget vrak.
  const brukt = new Set<number>();
  for (const s of state.historikk) for (const kp of s.kort) brukt.add(kortTilInt(kp.kort));
  for (const kp of state.bord) brukt.add(kortTilInt(kp.kort));
  const egen = state.hender[observator]!.map(kortTilInt);
  for (const c of egen) brukt.add(c);
  const observatorErBudvinner = observator === budvinner;
  if (observatorErBudvinner) for (const k of state.vrak) brukt.add(kortTilInt(k));

  const usett = alleKortInt().filter((c) => !brukt.has(c));

  const voids = infererRenonce(state);
  const dødKapasitet = observatorErBudvinner ? 0 : state.giving.talong;

  const etterlystInt = state.etterlyst ? kortTilInt(state.etterlyst) : null;
  const erSolo = state.melding?.type === "solo";
  const spiltEtterlyst = etterlystInt !== null && brukt.has(etterlystInt);
  const måPlassereEtterlyst =
    etterlystInt !== null && !spiltEtterlyst && usett.includes(etterlystInt);

  const forsøk = (relaksVoids: boolean): Verden | null => {
    const bins: Bin[] = [];
    for (let p = 0; p < N; p++) {
      if (p === observator) continue;
      bins.push({
        spiller: p,
        kapasitet: state.hender[p]!.length,
        forbud: relaksVoids ? null : voids[p]!,
        kort: [],
      });
    }
    if (dødKapasitet > 0) {
      bins.push({ spiller: -1, kapasitet: dødKapasitet, forbud: null, kort: [] });
    }

    const igjen = usett.slice();
    stokkInt(igjen, rng);

    /**
     * Plasser det etterlyste kortet hos en tillatt motspiller (aldri i vraket).
     *
     * ============ OG ALDRI HOS BUDVINNEREN ==============================
     *
     * ARVIND: «han ber om konge - da har han nok essen selv.»
     *
     * `lovligeEtterlys` forbyr uttrykkelig aa etterlyse et kort man har selv:
     * `if (harKort(egen, kort)) continue`. At budvinneren IKKE har det kalte
     * kortet er altsaa ikke en slutning - det er en regel, sann mot enhver
     * motstander, ogsaa et menneske som spiller helt uortodoks.
     *
     * Her sto budvinneren likevel i kandidatlista. MAALT paa 7680 verdener i
     * 240 stillinger i stikk 1:
     *
     *     22,7 % av verdenene la kortet hos budvinneren  - regelstridig
     *     1742 av 1742 av dem satte `makker = budvinner`
     *
     * Den andre linja er den dyre. `medVerden` finner makkeren ved aa lete opp
     * hvem som holder det etterlyste kortet, saa i hver eneste umulige verden
     * ble budvinneren sin egen makker - og `avsluttRunde` ga da et budlag paa
     * ÉN person 2n uten makkerens n. Rolloutene ble ikke bare usannsynlige,
     * de ble scoret etter feil regler.
     *
     * Og det bet noeyaktig i stikk 1, som er den ENESTE stillingen der kortet
     * fortsatt er uspilt: makkerplikten legger det ned med én gang. Aapnings-
     * utspillet er hele etterlysningskonvensjonen, saa en fjerdedel av
     * verdenene var soeppel akkurat der konvensjonen avgjoeres.
     *
     * Finner vi ingen tillatt binge, returneres null og kalleren proever paa
     * nytt med relakserte renonser. Det er riktig: er begge de oevrige setene
     * renons i trumf, er det renonsslutningen som tar feil, ikke regelen.
     */
    if (måPlassereEtterlyst && etterlystInt !== null) {
      const f = Math.floor(etterlystInt / 13);
      const kandidater = bins.filter(
        (b) =>
          b.spiller !== -1 &&
          b.spiller !== budvinner &&
          b.kapasitet > 0 &&
          !(b.forbud && b.forbud.has(f)),
      );
      if (kandidater.length === 0) return null;
      const b = kandidater[Math.floor(rng() * kandidater.length)]!;
      b.kort.push(etterlystInt);
      b.kapasitet--;
      igjen.splice(igjen.indexOf(etterlystInt), 1);
    }

    // Mest begrensede kort først (farge forbudt av flest bins).
    igjen.sort((a, b) => forbudtAntall(bins, b) - forbudtAntall(bins, a));

    for (const c of igjen) {
      const f = Math.floor(c / 13);
      let sumKap = 0;
      for (const b of bins) if (b.kapasitet > 0 && !(b.forbud && b.forbud.has(f))) sumKap += b.kapasitet;
      if (sumKap === 0) return null;
      let valg = Math.floor(rng() * sumKap);
      let plassert = false;
      for (const b of bins) {
        if (b.kapasitet <= 0 || (b.forbud && b.forbud.has(f))) continue;
        valg -= b.kapasitet;
        if (valg < 0) {
          b.kort.push(c);
          b.kapasitet--;
          plassert = true;
          break;
        }
      }
      if (!plassert) return null;
    }

    // Bygg hender.
    const hender: number[][] = [];
    for (let p = 0; p < N; p++) hender.push(p === observator ? egen.slice() : []);
    for (const b of bins) if (b.spiller !== -1) hender[b.spiller] = b.kort;

    // Makker i denne verdenen.
    let makkerVerden: number | null = null;
    if (!erSolo && etterlystInt !== null) {
      if (spiltEtterlyst) makkerVerden = state.makker;
      else {
        for (let p = 0; p < N; p++) if (hender[p]!.includes(etterlystInt)) makkerVerden = p;
      }
    }
    const declLag = new Array<boolean>(N).fill(false);
    if (budvinner !== null) declLag[budvinner] = true;
    if (makkerVerden !== null) declLag[makkerVerden] = true;

    const vrakVerden = bins.find((b) => b.spiller === -1)?.kort ?? [];
    return { hender, declLag, makkerVerden, vrakVerden };
  };

  for (let i = 0; i < 30; i++) {
    const v = forsøk(false);
    if (v) return v;
  }
  // Fall tilbake til å ignorere renonce-hint hvis fordelingen er vanskelig.
  for (let i = 0; i < 10; i++) {
    const v = forsøk(true);
    if (v) return v;
  }
  return null;
}

function forbudtAntall(bins: Bin[], c: number): number {
  const f = Math.floor(c / 13);
  let n = 0;
  for (const b of bins) if (b.forbud && b.forbud.has(f)) n++;
  return n;
}

// --- Belief-vektet sampling (budhistorikken avslører håndstyrke) -----------

/** Honnørpoeng (E=4,K=3,D=2,Kn=1) + lengste farge − 3: grov håndstyrke. */
function styrkeFraInt(kort: readonly number[]): number {
  let hcp = 0;
  const lengder = [0, 0, 0, 0];
  for (const c of kort) {
    lengder[Math.floor(c / 13)]!++;
    const verdi = (c % 13) + 2;
    if (verdi >= 11) hcp += verdi - 10;
  }
  return hcp + Math.max(...lengder) - 3;
}

/**
 * Log-vekt for hvor forenlig en verden er med budhistorikken: spillere som
 * bød høyt skal ha sterke ORIGINALHÅNDER (rest + egne spilte kort), spillere
 * som passet uten å by skal ikke ha dem. Snitthånd ≈ styrke 12.
 */
function budForenlighet(state: GameState, verden: Verden, observator: number): number {
  const spilteAv: number[][] = [];
  for (let p = 0; p < state.antallSpillere; p++) spilteAv.push([]);
  for (const s of state.historikk) for (const kp of s.kort) spilteAv[kp.spiller]!.push(kortTilInt(kp.kort));
  for (const kp of state.bord) spilteAv[kp.spiller]!.push(kortTilInt(kp.kort));

  let logW = 0;
  for (let p = 0; p < state.antallSpillere; p++) {
    if (p === observator) continue;
    const bud = state.budrunde.sisteBud[p];
    if (bud === undefined || (bud === null && !state.budrunde.passet[p])) continue;
    const st = styrkeFraInt([...verden.hender[p]!, ...spilteAv[p]!]);
    if (typeof bud === "number") {
      logW -= ((st - (12 + 2 * (bud - 5))) / 5) ** 2;
    } else if (bud === "AMERIKANER" || bud === "SOLO") {
      logW -= ((Math.min(0, st - 24)) / 6) ** 2;
    } else {
      // Passet uten å by: neppe en sterk hånd.
      logW -= (Math.max(0, st - 14) / 5) ** 2;
    }
  }
  return logW;
}

/**
 * En lært budprior, i stedet for den håndlagde `budForenlighet`.
 *
 * `logVekt(sete, bud, originalhånd)` skal si hvor godt hånden passer med det
 * setet bød. `src/moe2/motstander.ts` er implementasjonen, men typen holdes
 * strukturell her: `sampler.ts` er kjernen og skal ikke avhenge av moe2.
 */
export interface Budprior {
  logVekt(spiller: string, bud: number, hånd: readonly Kort[]): number;
}

/** Kortindeks → kort, invers av `kortTilInt`. */
function intTilKort(c: number): Kort {
  return { farge: FARGER[Math.floor(c / 13)]!, verdi: ((c % 13) + 2) as Kort["verdi"] };
}

/**
 * Som `budForenlighet`, men med en LÆRT prior i stedet for en håndlagd formel.
 *
 * HVORFOR DET ER EN EGEN FUNKSJON OG IKKE EN ERSTATNING. Prioren beskriver ÉN
 * budpolicy, og de er målbart ulike: familien byr 7 med 1,18 honnører i snitt,
 * `bud-gbt.json` byr 7 med 0,000 (36 av 36 tilfeller). Brukes menneskenes
 * tabell i selvspill, er prioren feilspesifisert — nøyaktig samme klasse feil
 * som da SD-orakelet rullet ut med NevroHjerne mens bordet spilte som Adams,
 * og førersetet målte −0,357 i stedet for +0,896.
 *
 * En prior som beskriver feil motpart er verre enn ingen prior: den skyver
 * utvalget systematisk feil vei. Derfor er `prior` valgfri, og kalleren må
 * velge tabellen som hører til bordet.
 */
function lærtForenlighet(
  state: GameState,
  verden: Verden,
  observator: number,
  prior: Budprior,
  navn: (sete: number) => string,
): number {
  const spilteAv: number[][] = [];
  for (let p = 0; p < state.antallSpillere; p++) spilteAv.push([]);
  for (const s of state.historikk) for (const kp of s.kort) spilteAv[kp.spiller]!.push(kortTilInt(kp.kort));
  for (const kp of state.bord) spilteAv[kp.spiller]!.push(kortTilInt(kp.kort));

  let logW = 0;
  for (let p = 0; p < state.antallSpillere; p++) {
    if (p === observator) continue;
    // BUDVINNEREN UTELATES. Hun tok opp talongen og vraket fire, så
    // originalhånden er ikke rest + spilte kort — og prioren er målt på
    // spillere som IKKE vant budet.
    if (p === state.budvinner) continue;
    const bud = state.budrunde.sisteBud[p];
    if (bud === undefined) continue;
    if (bud !== null && typeof bud !== "number") continue; // Amerikaner/solo
    const hånd = [...verden.hender[p]!, ...spilteAv[p]!].map(intTilKort);
    logW += prior.logVekt(navn(p), typeof bud === "number" ? bud : 0, hånd);
  }
  return logW;
}


/**
 * ============ KANAL 2: VRAKET SOM BEVIS ================================
 *
 * ARVIND: «budvinner faar x antall ekstra verdi paa sin haand, og jeg vet at
 * den proever aa skape renonser og maksimerer sin haand i vrak.»
 *
 * Vraket er SKJULT for de andre, saa fire ukjente kort legges i en doed binge.
 * Men de kortene er VALGT. Maalt over 720 runder (§111), budvinnerens
 * sidefargerenonser per runde:
 *
 *     faktisk vraking           0,967
 *     om hun kastet billigst    0,169
 *     tilfeldig kasting         0,101
 *
 * Hun toemmer altsaa en farge nesten hver runde - 9,6x oftere enn tilfeldig, og
 * 5,7x oftere enn en ren prisstrategi. Inversjonsraten er 0,1132, saa prisen
 * styrer OGSAA, men renonsen er hovedmotivet.
 *
 * Sampleren antok det tilfeldige. Foelgen er systematisk: verdenene gir henne
 * sidefargekort hun sannsynligvis ikke har, og undervurderer hvor ofte hun kan
 * trumfe.
 *
 * ================= VEKTEN ER TO LEDD, BEGGE MAALTE ====================
 *
 *     logW = alfa * (renonser i sidefarger)  -  beta * (inversjonsrate)
 *
 * En inversjon er et par (beholdt kort billigere enn et vraket kort). En
 * perfekt grisk kasting har raten 0; tilfeldig kasting ligger rundt 0,5.
 *
 * KOEFFISIENTENE ER IKKE ADOPTERT. De staar som parametre med maalte
 * standardverdier, og hva de skal vaere avgjoeres paa benken - ikke her.
 * `amu:alle` var ogsaa aapenbart riktig og maalte -0,2837.
 */
export interface Vrakvekt {
  /** Vekt per renons budvinneren har i en sidefarge. 0 = av. */
  readonly alfa: number;
  /** Straff for aa ha beholdt billigere kort enn de vrakede. 0 = av. */
  readonly beta: number;
}

export function vrakLogVekt(state: GameState, verden: Verden, v: Vrakvekt): number {
  const bv = state.budvinner;
  if (bv === null || bv === undefined) return 0;
  if (verden.vrakVerden.length === 0) return 0;
  const trumf = state.trumf;
  if (trumf === null) return 0;
  const trumfIdx = FARGER.indexOf(trumf);

  // Renonser regnes paa HELE haanden hennes: de kortene hun holder naa pluss
  // de hun alt har spilt. Ellers ville en tom haand sent i runden telt som
  // fire renonser.
  const holdt = new Set<number>();
  for (const c of verden.hender[bv] ?? []) holdt.add(Math.floor(c / 13));
  for (const stikk of state.historikk) {
    for (const kp of stikk.kort) if (kp.spiller === bv) holdt.add(FARGER.indexOf(kp.kort.farge));
  }
  for (const kp of state.bord) if (kp.spiller === bv) holdt.add(FARGER.indexOf(kp.kort.farge));

  let renonser = 0;
  for (let f = 0; f < 4; f++) if (f !== trumfIdx && !holdt.has(f)) renonser++;

  // Inversjoner mot prisrangen. Trumf er alltid dyrere enn farge, ellers valoer.
  const rang = (c: number): number => (Math.floor(c / 13) === trumfIdx ? 100 : 0) + (c % 13);
  const beholdt = verden.hender[bv] ?? [];
  let inv = 0;
  let par = 0;
  for (const b of beholdt) {
    for (const k of verden.vrakVerden) {
      par++;
      if (rang(b) < rang(k)) inv++;
    }
  }
  const rate = par === 0 ? 0 : inv / par;
  return v.alfa * renonser - v.beta * rate;
}

/**
 * Som `trekkVerden`, men vekter mellom flere kandidatverdener etter hvor
 * godt de stemmer med budhistorikken (Belief-MC-idéen fra bridge-AI:
 * verdener samples ikke uniformt, men etter hva budene har avslørt).
 *
 * Med `prior` brukes en LÆRT budmodell i stedet for den håndlagde formelen.
 * Kalleren har ansvaret for at prioren beskriver de som faktisk sitter ved
 * bordet — se `lærtForenlighet`.
 */
export function trekkVerdenBelief(
  state: GameState,
  observator: number,
  rng: () => number,
  kandidater = 3,
  prior?: Budprior,
  navn: (sete: number) => string = (s) => `sete${s}`,
  ekstraVekt?: (v: Verden) => number,
  /** KANAL 2. Udefinert = av, og da er alt her bit-identisk med foer. */
  vrakvekt?: Vrakvekt,
  /**
   * BUDVEKTEN AV (11. sep). Et trosnett som selv leser budrunden (MLB-trohodet,
   * `src/mlb/trotrekk.ts`) har allerede budet i fordelingen; å legge
   * `budForenlighet` oppå teller det samme beviset to ganger. Standard på, og da er
   * alt her bit-identisk med før.
   */
  budvekt = true,
): Verden | null {
  // Uten budinformasjon om noen andre er BUD-vektingen et nullbidrag – men
  // `ekstraVekt` (troen) leser SPILLET og bidrar uansett hva budrunden sa.
  const harInfo =
    ekstraVekt !== undefined ||
    (budvekt &&
      state.budrunde.sisteBud.some(
        (b, p) => p !== observator && (b !== null || state.budrunde.passet[p]),
      ));
  if (!harInfo || kandidater <= 1) return trekkVerden(state, observator, rng);

  const utvalg: { verden: Verden; logW: number }[] = [];
  for (let i = 0; i < kandidater; i++) {
    const v = trekkVerden(state, observator, rng);
    if (v) {
      // Budvekten og trosvekten er UAVHENGIGE kilder – den ene leser
      // auksjonen, den andre spillet – så log-vektene legges sammen.
      const budW = !budvekt
        ? 0
        : prior === undefined
          ? budForenlighet(state, v, observator)
          : lærtForenlighet(state, v, observator, prior, navn);
      // TRE UAVHENGIGE KILDER, samme skala: budrunden sier hva de MELDTE,
      // troen leser hva de SPILTE, og vrakvekten hva budvinneren KASTET.
      utvalg.push({
        verden: v,
        logW:
          budW +
          (ekstraVekt === undefined ? 0 : ekstraVekt(v)) +
          (vrakvekt === undefined ? 0 : vrakLogVekt(state, v, vrakvekt)),
      });
    }
  }
  if (utvalg.length === 0) return null;
  const maks = Math.max(...utvalg.map((u) => u.logW));
  const vekter = utvalg.map((u) => Math.exp(u.logW - maks));
  let r = rng() * vekter.reduce((a, b) => a + b, 0);
  for (const [i, u] of utvalg.entries()) {
    r -= vekter[i]!;
    if (r < 0) return u.verden;
  }
  return utvalg[utvalg.length - 1]!.verden;
}

/**
 * ============ ÉN FELLES KANDIDATPULJE (14. sep) — `~pulje=` ================
 *
 * Trekker ALLE `antall` verdenene i ett, fra ÉN felles pulje på `antall · kandidater`
 * kandidater, i stedet for fra `antall` uavhengige puljer på `kandidater` hver.
 *
 * ---- HVORFOR: risten manglet en akse -------------------------------------
 *
 * `strata.md` §4c målte variansreduksjonen ved stratifisert utvalg til **0,997** og
 * fant grunnen: `trekkVerdener` gir hver av de 48 verdenene sin EGEN uavhengige
 * kandidatpulje. «Rangering 0,9 i pulje A» og «rangering 0,9 i pulje B» er to
 * urelaterte verdener, så en rist lagt over vektkvantilen INNENFOR hver pulje har
 * ingenting felles å virke langs. Her slås de 48 puljene sammen til én, og risten
 * legges over den FELLES kumulative vekten. Da betyr celle `v` det samme for alle
 * slottene, og dekningen av vektfordelingen er garantert jevn i stedet for tilfeldig.
 *
 * ---- RNG-STRØMMEN ER BEVART, OG DET ER IKKE PYNT -------------------------
 *
 * Dagens strøm er `[kandidater trekk][1 rng][kandidater trekk][1 rng]…`. En naiv
 * felles pulje som trekker alle `antall · kandidater` i ett strekk og DERETTER trekker
 * utvalgstallene ville fått ANDRE kandidater fra og med nr. `kandidater + 1`, fordi
 * i.i.d.-grenen har brukt et `rng()` på utvelgelsen imellom. Armen ville da målt
 * «andre verdener» i tillegg til «bedre fordelte verdener» — to endringer i én, som er
 * fella `bandit.md` §3 beskriver.
 *
 * Løkka under beholder derfor blokkstrukturen i STRØMMEN og slår bare sammen
 * UTVELGELSEN: `kandidater` trekk, så ett `rng()` (som blir `u_v`), `antall` ganger.
 * Antall `trekkVerden`-kall, rekkefølgen deres og antall `rng()`-kall er dermed
 * NØYAKTIG som i i.i.d.-grenen, og kandidatpuljen blir bit-identisk på samme frø.
 * Bare hvilke kandidater som plukkes ut skiller.
 *
 * ---- `"blokk"`: SAMME KODESTI, BIT-IDENTISK RESULTAT ----------------------
 *
 * Med `"blokk"` velges hver verden med invers-CDF innenfor SIN EGEN blokk på
 * `kandidater`, med blokkens egen `maks`-normalisering og `u_v` rått — altså nøyaktig
 * regnestykket `trekkVerdenBelief` gjør. Modusen finnes for å BEVISE at den felles
 * kodestien er en tro omskriving: er `"blokk"` bit-identisk med i.i.d., er den eneste
 * forskjellen i `"felles"` selve utvelgelsen, og ingenting annet har sneket seg med.
 *
 * ---- FORDELINGEN FLYTTER SEG, OG DET SKAL SIES HØYT ----------------------
 *
 * Dagens utvalg er SIR med M = `kandidater`; med felles pulje er hver verden SIR med
 * M = `antall · kandidater`. SIR er bare asymptotisk riktig, så den endelige-M-
 * skjevheten mot forslagsfordelingen KRYMPER. Fordelingen står altså ikke stille —
 * den flytter seg mot målfordelingen `p ∝ q·w`. Det er en uunngåelig følge av å gi
 * risten en felles akse: aksen finnes bare fordi kandidatene nå konkurrerer på tvers
 * av slottene. `examples/pulje-forventning.ts` måler retningen mot en høy-M referanse
 * i stedet for å påstå at ingenting skjedde.
 *
 * ---- MANGFOLDET KAN KOLLAPSE, OG DET MÅLES ------------------------------
 *
 * `troledd.md` §4 målte vekten som skarp (ESS/K 0,179, maks p 0,547, log-spenn 19,13).
 * En kandidat som holder mer enn `1/antall` av totalvekten får FLERE slott her, mens
 * de 48 uavhengige puljene i dag gir hver blokk sin egen vinner og dermed 48 ulike
 * verdener. Et støygulv som faller fordi de 48 verdenene har kollapset til en håndfull
 * er ikke en seier. Kallerne logger derfor antall DISTINKTE verdener.
 */
export function trekkVerdenerFellesPulje(
  state: GameState,
  observator: number,
  rng: () => number,
  antall: number,
  kandidater = 3,
  prior?: Budprior,
  navn: (sete: number) => string = (s) => `sete${s}`,
  ekstraVekt?: (v: Verden) => number,
  vrakvekt?: Vrakvekt,
  budvekt = true,
  modus: "felles" | "blokk" = "felles",
): Verden[] {
  // ORDRETT samme vakt som `trekkVerdenBelief`, og med vilje: uten den ville de to
  // grenene tatt ulike veier nettopp i stillingene der det ikke er noe å vekte på.
  const harInfo =
    ekstraVekt !== undefined ||
    (budvekt &&
      state.budrunde.sisteBud.some(
        (b, p) => p !== observator && (b !== null || state.budrunde.passet[p]),
      ));
  if (!harInfo || kandidater <= 1) {
    // Uten informasjon å vekte på gjør `trekkVerdenBelief` ett rått `trekkVerden` per
    // verden og bruker INGEN rng() til utvelgelse. Samme her, kall for kall.
    const rå: Verden[] = [];
    for (let v = 0; v < antall; v++) {
      const w = trekkVerden(state, observator, rng);
      if (w !== null) rå.push(w);
    }
    return rå;
  }

  /** Hele puljen, med hvilken blokk hver kandidat ble trukket i. */
  const alle: { verden: Verden; logW: number; blokk: number }[] = [];
  /** Ett utvalgstall per slott, trukket PÅ SAMME STED i strømmen som i i.i.d.-grenen. */
  const us: number[] = [];
  for (let v = 0; v < antall; v++) {
    for (let i = 0; i < kandidater; i++) {
      const w = trekkVerden(state, observator, rng);
      if (w) {
        const budW = !budvekt
          ? 0
          : prior === undefined
            ? budForenlighet(state, w, observator)
            : lærtForenlighet(state, w, observator, prior, navn);
        alle.push({
          verden: w,
          logW:
            budW +
            (ekstraVekt === undefined ? 0 : ekstraVekt(w)) +
            (vrakvekt === undefined ? 0 : vrakLogVekt(state, w, vrakvekt)),
          blokk: v,
        });
      }
    }
    // SAMME POSISJON I STRØMMEN som `let r = rng() * …` i i.i.d.-grenen.
    us.push(rng());
  }
  if (alle.length === 0) return [];

  const ut: Verden[] = [];

  if (modus === "blokk") {
    /**
     * BIT-IDENTISK MED I.I.D. Blokkens egen `maks`, blokkens egen sum, `u_v` rått og
     * samme løkkeform — altså tegn for tegn regnestykket i `trekkVerdenBelief`. En tom
     * blokk gir ingen verden, akkurat som et `null`-svar derfra gjør i dag.
     */
    for (let v = 0; v < antall; v++) {
      const blokk = alle.filter((a) => a.blokk === v);
      if (blokk.length === 0) continue;
      const maks = Math.max(...blokk.map((u) => u.logW));
      const vekter = blokk.map((u) => Math.exp(u.logW - maks));
      let r = us[v]! * vekter.reduce((a, b) => a + b, 0);
      let valgt = blokk[blokk.length - 1]!.verden;
      for (const [i, u] of blokk.entries()) {
        r -= vekter[i]!;
        if (r < 0) {
          valgt = u.verden;
          break;
        }
      }
      ut.push(valgt);
    }
    return ut;
  }

  /**
   * FELLES PULJE. Sortert på vekt, så celle-indeksen betyr «vektkvantil i HELE puljen»
   * og ikke «tilfeldig trekkerekkefølge». Sorteringen er gratis og eksakt: en kategorisk
   * fordeling er permutasjonsinvariant, så invers-CDF over en sortert pulje har samme
   * marginal som over en usortert — sorteringen gjør bare aksen meningsfull.
   */
  const sortert = alle.slice().sort((a, b) => a.logW - b.logW);
  const maks = Math.max(...sortert.map((u) => u.logW));
  const vekter = sortert.map((u) => Math.exp(u.logW - maks));
  const total = vekter.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return sortert.slice(0, antall).map((u) => u.verden);

  /**
   * KUMULATIV ÉN GANG, så utvelgelsen er `antall · log(pulje)` og ikke `antall · pulje`.
   * Summen akkumuleres i samme rekkefølge som `vekter`, så avrundingen er den samme.
   */
  const kum = new Float64Array(sortert.length);
  {
    let s = 0;
    for (let i = 0; i < sortert.length; i++) {
      s += vekter[i]!;
      kum[i] = s;
    }
  }

  /** Første indeks der `kum[i] >= mål`. Binærsøk; `kum` er ikke-avtakende. */
  const finn = (mål: number): number => {
    let lo = 0;
    let hi = sortert.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (kum[m]! < mål) lo = m + 1;
      else hi = m;
    }
    return lo;
  };

  for (let v = 0; v < antall; v++) {
    // Én rist over den FELLES kumulative vekten: ett punkt i hver av `antall` like
    // brede celler. `u_v` er slottets eget tilfeldighetstall, trukket over.
    const u = (v + us[v]!) / antall;
    ut.push(sortert[finn(u * total)]!.verden);
  }
  return ut;
}

/** Bygger et DD-oppsett for stillingen NÅ (før spiller i tur har lagt kort). */
export function byggDDOppsett(state: GameState, verden: Verden): DDOppsett {
  const trump = state.trumf ? FARGER.indexOf(state.trumf) : 0;
  const bord = state.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) }));
  let declStikkFør = 0;
  for (let p = 0; p < state.antallSpillere; p++) {
    if (verden.declLag[p]) declStikkFør += state.stikkVunnet[p] ?? 0;
  }
  return {
    N: state.antallSpillere,
    trump,
    declLag: verden.declLag,
    hender: verden.hender,
    iTur: state.iTur!,
    bord,
    declStikkFør,
    ferdigeStikk: state.stikkSpilt,
    totalStikk: state.giving.antallStikk,
  };
}
