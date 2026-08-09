/**
 * SUMVELGEREN — én poengsum, ett argmax, målbare vekter.
 *
 * ARVIND, 9. august: «skap adams max visjonen. ta hensyn til mikro meso og
 * makro. få på en arkitektur som tar veldig gode valg til enhver tid. unngå
 * sunken cost fallacy.»
 *
 * ================= HVA SOM ER GALT MED STABELEN ========================
 *
 * Dagens arkitektur er en STABEL AV OVERSTYRINGER: `vr` utenpå `amu` utenpå
 * `profil` utenpå `budm` utenpå `vakt` utenpå nettet. Hvert lag kan overkjøre
 * det under, og siste skriver vinner.
 *
 * Det er ikke en smakssak. Det har en målt kostnad — fire kollisjoner, alle med
 * NØYAKTIG samme form: **to deler som optimerer ulike mål over samme
 * beslutning.**
 *
 *     A6 avsender mot A7 leser    de frie kortvalgene, 36,2 %
 *     avsender mot leser          signalkoden var to koder
 *     søket mot vakten            68 % av valgene → ble til vetoen
 *     DD-fasit mot poeng          −0,609 korrelasjon
 *
 * Og «løsningene» har alle vært samme type lapp: en terskel foran
 * overstyringen. Vetoen (`v0.5`) er en dør, ikke en avveining.
 *
 * ================= HVA SUMMEN GJØR I STEDET ============================
 *
 *     score(kort) = w_nett · nettets verdi
 *                 + w_vakt · konvensjonsbonus
 *                 + w_søk  · søkets korreksjon
 *                 + w_stil · stilkorreksjon
 *                 + w_race · stillingskorreksjon
 *
 * Ett argmax over totalen. Da kan to lag ALDRI vinne over hverandre — de veier
 * hverandre. Er nettet svært sikkert, vinner nettet. Er det nesten likegyldig,
 * avgjør konvensjonen. Kollisjonsklassen er strukturelt borte, ikke målt bort.
 *
 * ================= OG VEKTENE KAN MÅLES ================================
 *
 * Det er den andre gevinsten, og kanskje den største. En REKKEFØLGE kan ikke
 * optimeres — den er enten sånn eller sånn. Fem VEKTER er et lite
 * søkeproblem som kan sveipes på benken.
 *
 * En modul som ikke bærer sin egen vekt får da vekt nær null AV SEG SELV, i
 * stedet for å bli diskutert. Ablasjonen 8. august sa at søket bidrar +0,167
 * (1,5 SE) og at A5/A6/A7 er null eller negative — med vekter ville det vist
 * seg som tall i stedet for som armer.
 *
 * ================= MIKRO, MESO, MAKRO ==================================
 *
 * Arvind ba om at alle tre nivåene tas hensyn til. I denne formen er de ikke
 * tre systemer, men tre LEDD som havner i samme sum:
 *
 *     MIKRO   nettets verdi + konvensjonen + søket   → dette kortet
 *     MESO    budmodellen                            → denne kontrakten
 *     MAKRO   racepresset                            → hele kampen
 *
 * Og makroleddet skal inn i BEGGE summene — både kortvalget og budet. Det er
 * hullet K5→K3 peker på, og i summeformen er det bare ett ledd til.
 *
 * ================= NULL-PUNKTET ========================================
 *
 * Med bare nettleddet (vekt 1) og ingen andre er dette EKSAKT `E1Agent`s eget
 * argmax. Hvert ledd med vekt 0 er et ledd som ikke finnes. Så stabelen og
 * summen kan sammenlignes på samme benk, og forskjellen er vektene — ikke
 * arkitekturen som sådan.
 */

import { lovligeKort, type GameState, type Handling } from "../motor.ts";
import { FARGER, type Kort } from "../kort.ts";
import { kortIndeks } from "../nevro/trekk.ts";

/** Kortindeks → kort. `kortIndeks` er inversen og deler rekkefølgen. */
export function kortFraIndeks(i: number): Kort {
  return { farge: FARGER[Math.floor(i / 13)]!, verdi: ((i % 13) + 2) as Kort["verdi"] };
}

/**
 * Ett ledd i summen.
 *
 * `poeng` gir et tall per LOVLIG kort. Kort som mangler regnes som 0 — et ledd
 * som ikke har noe å si om et kort, skal ikke straffe det.
 */
export interface Ledd {
  /** Navn, bare for logging og feilsøking. */
  readonly navn: string;
  /** Vekten leddet ganges med. 0 = leddet finnes ikke. */
  readonly vekt: number;
  poeng(state: GameState, sete: number, lovlige: readonly Kort[]): Map<number, number>;
}

/**
 * NORMALISERING, og hvorfor den er nødvendig.
 *
 * Leddene er på ULIKE SKALAER: nettets logits er en ting, søkets utfall er
 * poeng per runde, konvensjonsbonusen er en indikator. Å summere dem rått ville
 * gjort vektene uleselige — og verre, gjort dem avhengige av hvor spredt
 * nettets logits tilfeldigvis er i akkurat den stillingen.
 *
 * Hvert ledd skaleres derfor til [0, 1] over de lovlige kortene FØR vekten
 * legges på. Da betyr en vekt det samme i hver stilling, og de kan sveipes.
 *
 * Er alle verdiene like, er leddet uten mening her og gir 0 til alle — ikke
 * 0,5, som ville vært et vilkårlig dytt.
 */
export function normaliser(m: Map<number, number>): Map<number, number> {
  if (m.size === 0) return m;
  let lav = Infinity;
  let høy = -Infinity;
  for (const v of m.values()) {
    if (v < lav) lav = v;
    if (v > høy) høy = v;
  }
  const spenn = høy - lav;
  const ut = new Map<number, number>();
  for (const [k, v] of m) ut.set(k, spenn > 1e-12 ? (v - lav) / spenn : 0);
  return ut;
}

export interface Sumvalg {
  readonly kort: Kort;
  /** Totalpoeng per kort, for `forklar` og for tester. */
  readonly total: Map<number, number>;
  /** Hvert ledds normaliserte bidrag, før vekt. */
  readonly bidrag: Map<string, Map<number, number>>;
}

/**
 * Velger kortet med høyest sum.
 *
 * DETERMINISTISK VED UAVGJORT: laveste kortindeks vinner. Uten en fast regel
 * ville to like summer gitt ulikt kort avhengig av innsettingsrekkefølge, og
 * da dør parringen i målingene — samme feilklasse som `pris`-sorteringen i
 * `stilbias.ts`, der to farger med samme valør byttet rang og ALLE 329
 * rekonstruerte residualer avvek.
 */
export function velgSum(
  state: GameState,
  sete: number,
  ledd: readonly Ledd[],
): Sumvalg | null {
  const lovlige = lovligeKort(state, sete);
  if (lovlige.length === 0) return null;
  if (lovlige.length === 1) {
    return { kort: lovlige[0]!, total: new Map(), bidrag: new Map() };
  }

  const total = new Map<number, number>();
  for (const k of lovlige) total.set(kortIndeks(k), 0);

  const bidrag = new Map<string, Map<number, number>>();
  for (const l of ledd) {
    if (l.vekt === 0) continue;
    const rå = l.poeng(state, sete, lovlige);
    if (rå.size === 0) continue;
    const n = normaliser(rå);
    bidrag.set(l.navn, n);
    for (const k of lovlige) {
      const i = kortIndeks(k);
      total.set(i, (total.get(i) ?? 0) + l.vekt * (n.get(i) ?? 0));
    }
  }

  let beste = kortIndeks(lovlige[0]!);
  let bestePoeng = total.get(beste) ?? 0;
  for (const k of lovlige) {
    const i = kortIndeks(k);
    const p = total.get(i) ?? 0;
    if (p > bestePoeng || (p === bestePoeng && i < beste)) {
      bestePoeng = p;
      beste = i;
    }
  }
  return { kort: kortFraIndeks(beste), total, bidrag };
}

/**
 * Agenten som bruker summen.
 *
 * Bare KORTVALG går gjennom summen. Bud, vrak og trumfvalg er andre
 * beslutninger med egne modeller, og å blande dem inn her ville vært å bygge
 * den samme stabelen på nytt under et annet navn.
 */
export class Sumvelger {
  private readonly indre: { velgHandling(s: GameState): Handling; nyKamp?(): void };
  private readonly ledd: readonly Ledd[];
  /** Hvor ofte summen valgte noe annet enn det indre laget. Kontroll. */
  endret = 0;
  totalt = 0;

  constructor(
    indre: { velgHandling(s: GameState): Handling; nyKamp?(): void },
    ledd: readonly Ledd[],
  ) {
    this.indre = indre;
    this.ledd = ledd;
  }

  nyKamp(): void {
    this.indre.nyKamp?.();
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    if (h.type !== "SPILL" || state.fase !== "SPILL") return h;
    this.totalt++;
    const v = velgSum(state, h.spiller, this.ledd);
    if (v === null) return h;
    if (v.kort.farge !== h.kort.farge || v.kort.verdi !== h.kort.verdi) this.endret++;
    return { type: "SPILL", spiller: h.spiller, kort: v.kort };
  }
}
