/**
 * «HVEM LA HVA» SOM SLUTNING — ikke som trekkblokk.
 *
 * ARVIND: «hvem la hva er et must. det må funke og det må påvirke hvordan han
 * forutser spillet og predikerer hva kort andre har på hånden.»
 *
 * ================= HVORFOR IKKE VIA NETTET ================================
 *
 * Blokken FINNES som trekk: `src/e1/hvemla.ts`, 156 trekk (3 relative seter ×
 * 52 kort), med lekkasjevakt og fire tester. Men den ligger bare i v10-kodingen
 * (714), og det utrullede nettet leser 273. Nettene på 470/714 taper på
 * datamengde — `k470` målte −0,238 med tegntest z = −5,44.
 *
 * Å vente på at det brede nettet skal vinne er å vente på destillasjonen, som
 * venter på alpha-mu, som venter på gode verdener. Sirkelen er hele grunnen
 * til at A5 står SIST i §79.
 *
 * MEN SLUTNINGEN TRENGER IKKE NETTET. «Hvem la hva» er per definisjon en
 * påstand om hvem som har hva — altså en LIKELIHOOD over verdener, ikke en
 * inngang til en policy. Lagt der virker den i dag, i søket som allerede står
 * ute, uten å vente på noe.
 *
 * ================= HVA VI FAKTISK KAN SLUTTE ==============================
 *
 * Rangert etter styrke, og bare det som er robust nok til å tåle at folk
 * spiller rart:
 *
 *   1. RENONS (hard). Fulgte du ikke farge, har du ingen. Håndheves allerede
 *      som forbud i `sampler.ts` — verdenene er lovlige.
 *
 *   2. IKKE VANT NÅR DU KUNNE (myk). Fulgte du farge og lot stikket gå, har du
 *      neppe noe høyere i den fargen. Bygget i `spillvekt.ts`.
 *
 *   3. IKKE TRUMFET NÅR DU KUNNE (myk, NY, og den sterkeste av de myke). Var du
 *      renons i utspillsfargen og kastet av i stedet for å trumfe et stikk du
 *      ville vunnet — da har du neppe trumf igjen.
 *
 *      Den er sterk fordi den er DYR å bryte: å la et stikk gå man kunne
 *      trumfet gratis, koster nesten alltid. Men den er myk fordi trumfsparing
 *      er en ekte linje sent i runden.
 *
 *   4. LENGDE FRA FØLGING (myk). Har du fulgt en farge fem ganger, startet du
 *      med minst fem. En verden som gir deg ingen igjen er mulig, men en som
 *      gir deg flere er ofte mer forenlig med at du hadde lengde.
 *
 * Alt er LOG-VEKTER og ingen forbud. En spiller som dukker for å skjule et ess,
 * eller sparer trumf med vilje, må forbli mulig å modellere — ellers utelukker
 * vi nettopp de linjene et menneske faktisk spiller.
 */

import { FARGER, type Farge, type Kort } from "../kort.ts";
import type { GameState } from "../motor.ts";
import { intTilKort } from "../solver/dds.ts";

/** Straffene. Kalibrerte antakelser, ikke målinger — skal sveipes. */
/**
 * ============ KONSTANTENE ER MAALT, IKKE SATT ==========================
 *
 * Arvind: «prediksjonen burde ikke vaere normale regler men enten laering over
 * tid eller matematiske formler» - og «hvis de er daarlige saa maa du fikse det
 * ikke fjerne de».
 *
 * A1 maalte VERRE enn ingen slutning i det hele tatt paa trosnoeyaktighet
 * (log-tap 0,9624 mot 0,9509 for «av»). Grunnen var ikke at ideen er feil, men
 * at tallene var gjettet - og en log-vekt er ingen smakssak. Hver av dem er en
 * presis empirisk paastand, og `examples/slutning-kalibrer.ts` maaler den.
 *
 * Maalt over 200 giv (Adams mot Adams):
 *
 *     regel                        n     lot vaere    -log      var
 *     kunne vinne, vant ikke    2 138       16,8 %   1,782     1,000
 *     kunne trumfe, gjorde ikke   435       30,1 %   1,200     1,500
 *
 * Vekten ER -log P(lot vaere | kunne), fordi en spiller som IKKE kunne vinne
 * lar vaere med sannsynlighet 1 og log 1 = 0. Det er hele likelihood-forholdet,
 * ikke en heuristikk.
 *
 * Skiftes spillestilen, skal disse maales paa nytt - de beskriver hvordan
 * MOTSTANDERNE spiller, ikke en regel i spillet.
 */
export const STRAFF_IKKE_VANT = 1.782;
export const STRAFF_IKKE_TRUMFET = 1.2;

/**
 * ============ LENGDEREGELEN HADDE FEIL FORTEGN ==========================
 *
 * Den gamle regelen var `logW += 0.15 * min(fulgt, igjen)`: «jo flere ganger
 * du fulgte fargen, jo flere kort har du igjen i den».
 *
 * **Maalt helling: -0,671.** Motsatt vei, og aapenbart i ettertid - kortene du
 * spilte er borte. Regelen dro altsaa troen systematisk feil vei, og en skarp
 * gal tro er verre enn ingen tro.
 *
 * Formen er ogsaa endret. `min(fulgt, igjen)` beloenner monotont flere kort,
 * mens sammenhengen er en FORVENTNING med spredning. Naa brukes den gaussiske
 * likelihooden rundt den maalte regresjonslinja, som er den matematisk riktige
 * formen for «hvor forenlig er dette antallet med det vi har sett».
 *
 * Maalt over 1 870 (sete, farge)-par ved stikk 6.
 */
export const LENGDE_SNITT = 1.089;
export const FULGT_SNITT = 1.449;
export const LENGDE_HELLING = -0.671;
export const LENGDE_SD = 1.07;

/** Hva hvert sete har gjort, utledet av historikken alene. */
export interface Spillerspor {
  /** Antall ganger setet FULGTE hver farge. */
  readonly fulgt: Record<Farge, number>;
  /** Farger setet har vist seg renons i. */
  readonly renons: Set<Farge>;
  /** Stikk der setet kastet av (var renons) uten å trumfe. */
  readonly avkastUtenTrumf: number;
}

const tomtSpor = (): Spillerspor => ({
  fulgt: { S: 0, H: 0, R: 0, K: 0 },
  renons: new Set(),
  avkastUtenTrumf: 0,
});

/** Stikkets vinnerkort, gitt trumf. */
function vinnerkort(kort: readonly { kort: Kort; spiller: number }[], trumf: Farge | null): Kort {
  let best = kort[0]!.kort;
  for (const kp of kort) {
    if (kp.kort.farge === best.farge) {
      if (kp.kort.verdi > best.verdi) best = kp.kort;
    } else if (trumf !== null && kp.kort.farge === trumf && best.farge !== trumf) {
      best = kp.kort;
    }
  }
  return best;
}

/**
 * HVEM LA HVA, oppsummert per sete.
 *
 * Dette ER minnet. Nettet har det ikke i 273-kodingen — der ligger alle spilte
 * kort i én blokk uten spiller (`settKort(v, 52, ...)`), og det er nettopp
 * hullet v3-blokken ble laget for. Her regnes det ut direkte fra historikken,
 * som er offentlig informasjon og ikke kan lekke noe.
 */
export function hvemLaSpor(state: GameState, antallSpillere: number): Spillerspor[] {
  const spor: Spillerspor[] = [];
  for (let p = 0; p < antallSpillere; p++) spor.push(tomtSpor());
  const alle = [...state.historikk.map((s) => s.kort), ...(state.bord.length > 0 ? [state.bord] : [])];
  for (const stikk of alle) {
    if (stikk.length === 0) continue;
    const led = stikk[0]!.kort.farge;
    for (const kp of stikk) {
      const s = spor[kp.spiller];
      if (s === undefined) continue;
      if (kp.kort.farge === led) {
        s.fulgt[led]++;
      } else {
        s.renons.add(led);
      }
    }
  }
  return spor;
}

/**
 * Log-vekt for hvor godt verdenens skjulte hender stemmer med HVEM SOM LA HVA.
 *
 * `hender` er kandidatverdenen. `observator` utelates — vi vet hva vi selv har.
 */
export function hvemLaForenlighet(
  state: GameState,
  hender: readonly (readonly Kort[])[],
  observator: number,
): number {
  const trumf = state.trumf;
  let logW = 0;

  for (const stikk of state.historikk) {
    if (stikk.kort.length < 2) continue;
    const led = stikk.kort[0]!.kort.farge;
    const vinner = vinnerkort(stikk.kort, trumf);
    const vinnerSpiller = stikk.kort.find(
      (kp) => kp.kort.farge === vinner.farge && kp.kort.verdi === vinner.verdi,
    )?.spiller;

    for (const kp of stikk.kort) {
      const p = kp.spiller;
      if (p === observator || p === vinnerSpiller) continue;
      const hand = hender[p] ?? [];

      if (kp.kort.farge === led) {
        // SLUTNING 2: fulgte farge, vant ikke → har neppe noe høyere.
        if (vinner.farge === led) {
          for (const k of hand) {
            if (k.farge === led && k.verdi > vinner.verdi) {
              logW -= STRAFF_IKKE_VANT;
              break;
            }
          }
        }
      } else if (trumf !== null && kp.kort.farge !== trumf) {
        /**
         * SLUTNING 3: renons i ledfargen, KASTET AV i stedet for å trumfe.
         *
         * Ville en trumf de fortsatt har, vunnet stikket? Da lot de et stikk gå
         * de kunne tatt. Gjelder bare når stikket IKKE alt ble vunnet med en
         * høyere trumf enn den de har igjen.
         */
        for (const k of hand) {
          if (k.farge !== trumf) continue;
          const villeVunnet = vinner.farge === trumf ? k.verdi > vinner.verdi : true;
          if (villeVunnet) {
            logW -= STRAFF_IKKE_TRUMFET;
            break;
          }
        }
      }
    }
  }

  /**
   * SLUTNING 4: LENGDE. Har et sete fulgt en farge mange ganger, hadde det
   * lengde der, og en verden som gir det flere igjen er mer forenlig.
   *
   * Formen er en GAUSSISK LIKELIHOOD rundt den maalte regresjonslinja, ikke
   * en monoton beloenning: sammenhengen er en forventning med spredning, og
   * `LENGDE_SD` er den maalte residualspredningen (1,070).
   */
  const spor = hvemLaSpor(state, hender.length);
  for (let p = 0; p < hender.length; p++) {
    if (p === observator) continue;
    for (const f of FARGER as readonly Farge[]) {
      const fulgt = spor[p]!.fulgt[f];
      if (fulgt < 2) continue;
      const igjen = (hender[p] ?? []).filter((k) => k.farge === f).length;
      // Gaussisk likelihood rundt den MAALTE regresjonslinja. Konstantleddet
      // (-log(sigma*sqrt(2pi))) er likt for alle verdener og utelates: bare
      // FORSKJELLER mellom kandidater betyr noe for trekningen.
      const forventet = LENGDE_SNITT + LENGDE_HELLING * (fulgt - FULGT_SNITT);
      const avvik = igjen - forventet;
      logW -= (avvik * avvik) / (2 * LENGDE_SD * LENGDE_SD);
    }
  }

  return logW;
}

/** Klar til bruk som `ekstraVekt` i `trekkVerdenBelief`. */
export function lagHvemLaVekt(
  state: GameState,
  observator: number,
): (v: { hender: number[][] }) => number {
  return (v) => hvemLaForenlighet(state, v.hender.map((h) => h.map(intTilKort)), observator);
}
