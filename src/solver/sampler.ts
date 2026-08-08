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

    return { hender, declLag, makkerVerden };
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
): Verden | null {
  // Uten budinformasjon om noen andre er BUD-vektingen et nullbidrag – men
  // `ekstraVekt` (troen) leser SPILLET og bidrar uansett hva budrunden sa.
  const harInfo =
    ekstraVekt !== undefined ||
    state.budrunde.sisteBud.some(
      (b, p) => p !== observator && (b !== null || state.budrunde.passet[p]),
    );
  if (!harInfo || kandidater <= 1) return trekkVerden(state, observator, rng);

  const utvalg: { verden: Verden; logW: number }[] = [];
  for (let i = 0; i < kandidater; i++) {
    const v = trekkVerden(state, observator, rng);
    if (v) {
      // Budvekten og trosvekten er UAVHENGIGE kilder – den ene leser
      // auksjonen, den andre spillet – så log-vektene legges sammen.
      const budW =
        prior === undefined
          ? budForenlighet(state, v, observator)
          : lærtForenlighet(state, v, observator, prior, navn);
      utvalg.push({ verden: v, logW: budW + (ekstraVekt === undefined ? 0 : ekstraVekt(v)) });
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
