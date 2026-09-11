/**
 * MYKE TROETIKETTER — POSTERIOR-DESTILLASJON FOR TROHODET (12. sep).
 *
 * ============ HVORFOR ====================================================
 *
 * Trohodet (tro-3, 996 inn) trenes på ÉN-HOT «hvor kortet faktisk lå» (`src/mlb/fasit.ts`). Den
 * etiketten er ett trekk fra posterioren gitt det setet kan vite: et riktig mål i forventning, men
 * med stor varians. Målt: løkkas trotrening overtilpasser etter én epoke i hver iterasjon, og
 * mot det eksakte rettferdige taket (`naabart-tro.ts`, agent P) når tro-3 bare 24,9 ± 2,3 % av veien
 * gulv → tak — 15,7 ± 2,2 % fra BUDVINNERENS stol, der den policy-blinde posterioren ligger nesten på
 * gulvet. Nesten all budvinnerinformasjon ligger altså i å LESE de andre setenes policyer.
 *
 * Der den eksakte posterioren er nåbar, er marginalene nøyaktig forventningen av én-hot-etiketten
 * over givene setet ikke kan skille (Rao–Blackwell): samme minimum for log-tapet, uten støyen, og med
 * policylesingen ferdig regnet inn. Det er dette fila skriver som etikett.
 *
 * ============ KLASSENE ===================================================
 *
 * Posteriorens kolonner er rel sete 1, 2, 3 og død binge (talong/vrak); `troFasit` har klasse 0 =
 * sett (maskert), 1–3 = rel sete, 4 = talongen. Samme rekkefølge som trohodets utgang, så
 * `p[kort·4 + k] = fordeling[kort][k]` der `fasit[kort] > 0`, og 0 ellers. Hver rad sjekkes:
 * støtten er NØYAKTIG de usette kortene og radene summerer til 1 (ellers har `setteKort` og
 * posterioren ulik mening om hva som er synlig, og tapet ville målt noe annet enn troen), og den
 * sanne klassen har masse når kontrollen holder. Brudd kaster: det er en feil, ikke støy.
 *
 * ============ K2 =========================================================
 *
 * Inngangene er urørt (`spillerVisning` alene). Etiketten er en funksjon av den VASKEDE loggen og
 * policydefinisjonene (skyggeagentene), som i `naabart-tro.ts`. De ekte hendene brukes bare til
 * masken (mengden usette kort, som er offentlig: den er invariant for enhver ombytting av skjulte
 * kort) og til kontrollen. `test/myk-etikett.test.ts` bytter alle skjulte kort og krever
 * bit-identisk etikett, med en felle (én-hot) som MÅ bli tatt.
 *
 * ============ DEKNING — HVA SOM FÅR MYK ETIKETT ===========================
 *
 *   myk        størrelsen ≤ grensen og den sanne given er forenlig
 *   over       størrelsen > grensen: én-hot (tidlig i runden, se `k8-tak.ts` for dekningen)
 *   uforenlig  den sanne given gjenskaper IKKE bordet: policyen er ikke en deterministisk funksjon
 *              av det setet kan vite (i kanonisk form). Da er posterioren ikke taket for dette
 *              bordet, og raden får én-hot. Tallet per bord er dekningsmålet for populasjonsdriverne.
 *   tom        ingen forenlig giv selv om den sanne er det — skal aldri skje; telles, aldri brukt.
 *
 * Grensen er `EKSAKT_STANDARD` i `k8-tak.ts` (1e6, fra målt kostnad), gjentatt her fordi k8-tak.ts
 * er et skript som kjører når det importeres.
 */

import type { GameState } from "../src/motor.ts";
import type { Spekagent } from "../src/moe2/agentspek.ts";
import { NaabartTro, Trominne, sannPlassering, type Loggpost } from "./naabart-tro.ts";

/** Standardgrensen for den eksakte tellingen (størrelse); = `EKSAKT_STANDARD` i k8-tak.ts. */
export const MYK_GRENSE = 1_000_000;
/** 52 kort × 4 klasser, samme form og rekkefølge som trohodets utgang. */
export const MYK_UT = 208;

export type MykUtfall = "myk" | "over" | "uforenlig" | "tom";

export interface MykRad {
  readonly utfall: MykUtfall;
  /** 208 sannsynligheter når `utfall` er «myk», ellers null. */
  readonly p: Float32Array | null;
  readonly størrelse: number;
  readonly ms: number;
  readonly kall: number;
}

/** Rollen sett fra `sete`: 0 budvinner, 1 makker (holder det etterlyste kortet — setet vet det selv), 2 motspiller. */
export function rolleAv(s: GameState, sete: number): number {
  if (s.budvinner === sete) return 0;
  return s.makker === sete ? 1 : 2;
}

/**
 * Posteriorens fordeling (52 × 4) → etiketten (208), maskert med `fasit`. Kaster hvis støtten ikke
 * er nøyaktig de usette kortene eller en usett rad ikke summerer til 1.
 */
export function mykFraFordeling(fordeling: readonly (readonly number[])[], fasit: ArrayLike<number>): Float32Array {
  const p = new Float32Array(MYK_UT);
  for (let c = 0; c < 52; c++) {
    const rad = fordeling[c]!;
    const sum = (rad[0] ?? 0) + (rad[1] ?? 0) + (rad[2] ?? 0) + (rad[3] ?? 0);
    if (fasit[c]! > 0) {
      if (Math.abs(sum - 1) > 1e-9) throw new Error(`myk etikett: kort ${c} er usett, men posterioren har masse ${sum}`);
      for (let k = 0; k < 4; k++) p[c * 4 + k] = rad[k] ?? 0;
    } else if (sum > 0) {
      throw new Error(`myk etikett: kort ${c} er sett (klasse 0), men posterioren har masse ${sum}`);
    }
  }
  return p;
}

/**
 * Myke etiketter for én kamp. Filter og hukommelse per sete per runde (inkrementelle: loggen
 * forlenges), kontrollen med egen hukommelse. `nyRunde()` når rundenummeret skifter.
 */
export class MykEtiketter {
  private readonly filtre = new Map<number, { f: NaabartTro; minne: Trominne; kontroll: Trominne }>();
  /** Skyggeagentene per SETE (kanoniske, ser hver ekte tilstand via `observer`). */
  private readonly agenter: readonly Spekagent[];
  private readonly grense: number;
  /**
   * `false` BARE for K2-prøven: en giv med byttede skjulte kort er (nesten alltid) uforenlig, så med
   * kontrollen på ville begge sider fått én-hot og prøven sammenliknet ingenting. Kontrollen er en port
   * foran etiketten, ikke en del av den; prøven krever at etiketten er den samme med og uten porten.
   */
  private readonly kontroll: boolean;

  // Vanlige felt, ikke parameteregenskaper: node kjører .ts med «strip-only», som ikke tar dem.
  constructor(agenter: readonly Spekagent[], grense: number = MYK_GRENSE, kontroll = true) {
    this.agenter = agenter;
    this.grense = grense;
    this.kontroll = kontroll;
  }

  nyRunde(): void {
    this.filtre.clear();
  }

  /**
   * Etiketten for `sete` i `s`. `logg` er rundens poster fra givens første budstilling til (ikke med) `s`.
   * `fasit` er `troFasit(s, sete)`: masken, og den sanne klassen for sjekken.
   */
  etikett(logg: readonly Loggpost[], s: GameState, sete: number, fasit: ArrayLike<number>): MykRad {
    let x = this.filtre.get(sete);
    if (x === undefined) {
      const minne = new Trominne();
      x = { f: new NaabartTro(sete, { partikler: 0, agenter: this.agenter, eksaktGrense: this.grense, minne }), minne, kontroll: new Trominne() };
      this.filtre.set(sete, x);
    }
    const t0 = performance.now();
    const k0 = x.minne.kall;
    const e = x.f.eksaktTro(logg, s);
    const ut = (utfall: MykUtfall, p: Float32Array | null): MykRad => ({
      utfall,
      p,
      størrelse: e.størrelse,
      ms: performance.now() - t0,
      kall: x.minne.kall - k0,
    });
    if (e.r === undefined) return ut("over", null);
    // KONTROLLEN (leser de ekte hendene, egen hukommelse, rører ikke posterioren).
    if (this.kontroll && !x.f.forenlig(sannPlassering(logg[0]!.s, sete, s.budvinner), x.kontroll)) return ut("uforenlig", null);
    if (e.r === null) return ut("tom", null);
    const p = mykFraFordeling(e.r.fordeling, fasit);
    for (let c = 0; this.kontroll && c < 52; c++) {
      const k = fasit[c]!;
      if (k > 0 && !(p[c * 4 + k - 1]! > 0)) throw new Error(`myk etikett: den sanne klassen ${k} for kort ${c} har ingen masse, men den sanne given er forenlig`);
    }
    return ut("myk", p);
  }
}
