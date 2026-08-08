/**
 * STILBIAS — hukommelsen som RESIDUAL, ikke som rå atferd.
 *
 * ARVIND: «hver gang en spiller gjør et valg som er offentlig så vil jeg at
 * alle sin tro om hva de andre sine kort er skal oppdatere seg. […] det er ikke
 * ja eller nei, men at troen er spredd over de ukjente på bordet basert på
 * tidligere spill og atferd som vi kjenner til.»
 *
 * Og: «hvis det du prøvde på ikke funket så må du bygge noe nytt som funker.»
 *
 * ================= HVORFOR DET FORRIGE IKKE KUNNE VIRKE =================
 *
 * `Økt.aggressivitet` målte RÅ ATFERD — andelen utspill som var trumf. To
 * feil fulgte av det, og begge er målt (§108):
 *
 *   NULLPUNKTET VAR IKKE NULL. Rå atferd avhenger av kortene. En spiller med
 *   mange trumf leder trumf oftere uten å være «aggressiv». Fire IDENTISKE
 *   Adams spredte seg fra −0,45 til +0,17, og et helt normalt sete fyrte som
 *   «passiv» mens en stilisert trumftrekker lå under terskelen.
 *
 *   FOR LITE BEVIS. En forsvarer leder bare ~1,3 stikk per runde. Avviket nådde
 *   2,0 SE etter en hel kamp — akkurat på grensen, og under den.
 *
 * ================= HVA DENNE MÅLER I STEDET =============================
 *
 * Ikke hva spilleren gjorde, men **hvor mye høyere eller lavere hun spilte enn
 * vår egen modell forventet i nøyaktig den stillingen.**
 *
 *     h(k)  = kortets pris-rang blant de LOVLIGE, skalert til [0, 1]
 *     E     = Σ_k P_nett(k) · h(k)        forventningen under nettets policy
 *     res   = h(spilt) − E                residualet
 *
 * Det fjerner begge feilene på én gang:
 *
 *   KORTENE FALLER UT. `E` regnes over nettopp de kortene hun faktisk hadde å
 *   velge mellom. Har hun bare høye kort igjen, er både `h(spilt)` og `E` høye,
 *   og residualet er null. Det gamle målet ville kalt henne aggressiv.
 *
 *   BEVISET TIDOBLES. Hvert kort med to eller flere lovlige alternativer er en
 *   observasjon — omtrent 10 per runde per sete, mot 1,3.
 *
 * ================= OG DET ER K4 SOM MØTER K8 ============================
 *
 * Residualet er ikke en merkelapp vi henger på en spiller. Det ER korreksjonen
 * A5 trenger: `troverdighet` regner `P(observasjon | verden)` under en policy,
 * og den policyen var alltid vårt eget nett. Et sete med `res = +0,2` spiller
 * systematisk høyere enn nettet, og både rolloutene (`motpartFor`) og troens
 * likelihood (`atferdFor`) skal vite det.
 *
 * K4 lærer PÅ TVERS av runder. K8 slutter INNENFOR runden. Dette tallet er
 * leddet mellom dem.
 *
 * ================= NÅR DET LÆRES, OG HVORFOR DET IKKE ER JUKS ===========
 *
 * Residualet krever at vi vet hvilke kort hun KUNNE valgt, altså hånden hennes.
 * Den er skjult mens runden spilles, og kjent når den er over.
 *
 * Derfor oppdateres dette **bare ved rundeslutt**, som `Profilbok` alt gjør:
 * «alle kort er avdekket nå — det er ikke lekkasje, det er slik mennesker leser
 * hverandre mellom runder.» Valgene i runde `r` påvirkes bare av residualer fra
 * runde `< r`. K2-prøven ser fortsatt invarians under skjult informasjon.
 */

import { lovligeKort, type GameState } from "../motor.ts";
import { likeKort, type Kort } from "../kort.ts";
import { pris } from "./synlig.ts";
import { kortIndeks } from "../nevro/trekk.ts";
import type { Atferdsmodell } from "./troverdighet.ts";

/** Løpende sum, kvadratsum og antall — nok til snitt OG standardfeil. */
export interface Biasanslag {
  sum: number;
  kvadrat: number;
  n: number;
}

export const TOMT_BIAS: Biasanslag = { sum: 0, kvadrat: 0, n: 0 };

export const snitt = (a: Biasanslag): number => (a.n === 0 ? 0 : a.sum / a.n);

/**
 * Standardfeilen på snittet. `n − 1` fordi variansen anslås fra de samme
 * dataene; med n = 1 finnes ingen spredning å anslå og SE er udefinert.
 */
export const standardfeil = (a: Biasanslag): number => {
  if (a.n < 2) return Infinity;
  const m = a.sum / a.n;
  const varians = Math.max(0, a.kvadrat / a.n - m * m) * (a.n / (a.n - 1));
  return Math.sqrt(varians / a.n);
};

export const leggTil = (a: Biasanslag, x: number): Biasanslag => ({
  sum: a.sum + x,
  kvadrat: a.kvadrat + x * x,
  n: a.n + 1,
});

/**
 * Residualet for ETT kortvalg, eller `null` når valget ikke bar informasjon.
 *
 * `null` når det bare fantes ett lovlig kort: da sier valget ingenting om
 * spilleren, og å telle det som «nøytralt» ville fortynnet signalet med tomme
 * observasjoner. Det er samme feil som `bydde.n` mot `klarte.n` i K4.
 */
export function residual(
  state: GameState,
  sete: number,
  spilt: Kort,
  atferd: Atferdsmodell,
): number | null {
  const lov = lovligeKort(state, sete);
  if (lov.length < 2) return null;
  const trumf = state.trumf;
  if (trumf === null) return null;

  // PRIS-RANG, ikke rå verdi: `pris` vet at trumf slår farge, så rangen er den
  // samme rekkefølgen `dyreste`/`billigste` bruker — altså nøyaktig den aksen
  // A2-vrien beveger seg langs.
  /**
   * SORTERINGEN MAA VAERE TOTAL. `pris` skiller trumf fra farge og valoer fra
   * valoer, men to kort i ULIKE ikke-trumffarger med samme valoer faar SAMME
   * pris. Da avgjorde haandens rekkefoelge rangen - og haandens rekkefoelge er
   * ikke den samme live som i rekonstruksjonen ved rundeslutt.
   *
   * Foelgen var at ALLE 329 rekonstruerte residualer avvek fra de live, med
   * stoerste avvik 0,428. Ingen av dem krasjet; hukommelsen ville bare laert
   * av en litt annen runde enn den som ble spilt.
   *
   * `kortIndeks` bryter uavgjort deterministisk, saa de to veiene gir samme
   * tall - noe `test/stilbias.test.ts` haandhever.
   */
  const sortert = [...lov].sort(
    (a, b) => pris(a, trumf) - pris(b, trumf) || kortIndeks(a) - kortIndeks(b),
  );
  const h = new Map<number, number>();
  for (let i = 0; i < sortert.length; i++) {
    h.set(kortIndeks(sortert[i]!), i / (sortert.length - 1));
  }

  const g = atferd.logits(state, sete);
  let maks = -Infinity;
  for (const k of lov) maks = Math.max(maks, g[kortIndeks(k)] ?? 0);
  let sum = 0;
  for (const k of lov) sum += Math.exp((g[kortIndeks(k)] ?? 0) - maks);
  if (!(sum > 0) || !Number.isFinite(sum)) return null;

  let forventet = 0;
  for (const k of lov) {
    const i = kortIndeks(k);
    forventet += (Math.exp((g[i] ?? 0) - maks) / sum) * (h.get(i) ?? 0);
  }

  const spiltIdx = kortIndeks(spilt);
  const faktisk = h.get(spiltIdx);
  // Kortet må ha vært lovlig. Er det ikke det, er noe galt med rekonstruksjonen,
  // og en stille 0 ville forurenset anslaget i stedet for å si fra.
  if (faktisk === undefined) return null;

  return faktisk - forventet;
}

/**
 * Alle residualer for ÉN ferdigspilt runde, per sete — REKONSTRUERT.
 *
 * Ved `RUNDE_SLUTT` er hendene tomme: alle kort er spilt. Men de er alle i
 * `historikk`, så hånden hvert sete HADDE ved første stikk er nøyaktig kortene
 * det la i løpet av runden. Runden spilles derfor om igjen, og `lovligeKort`
 * blir eksakt i hvert eneste valg.
 *
 * ================= OG DETTE ER GRENSA MOT K2 ============================
 *
 * Rekonstruksjonen leser hender. Det er lov HER og bare her, fordi den kjører
 * ETTER at runden er ferdig — nøyaktig som `Profilbok`, som alt bokfører på
 * avdekkede kort. Valgene i runde `r` ser bare residualer fra runde `< r`.
 *
 * Å regne det samme UNDERVEIS ville gitt identiske tall og vært juks. Skillet
 * er ikke hvilken informasjon som brukes, men NÅR den kan påvirke et valg.
 */
export function rundensResidualer(
  slutt: GameState,
  atferd: Atferdsmodell,
  /**
   * Totalpoengene FOER runden. De endres bare ved rundeslutt, saa den foerste
   * stillingen kalleren ser i runden baerer dem. Uten dem koder nettet
   * poengandelene med rundens resultat alt lagt til - altsaa med fasit.
   */
  poengFoer?: readonly number[],
): Map<number, number[]> {
  const ut = new Map<number, number[]>();
  const N = slutt.antallSpillere;
  if (slutt.trumf === null || slutt.historikk.length === 0) return ut;

  // Hånden hvert sete HADDE: alt det la i løpet av runden.
  const hender: Kort[][] = Array.from({ length: N }, () => []);
  for (const stikk of slutt.historikk) {
    for (const kp of stikk.kort) hender[kp.spiller]?.push(kp.kort);
  }

  // En MINIMAL tilstand for `lovligeKort`: hånd, bord, trumf, og
  // etterlyst+stikkSpilt for makkerplikten. Ingen motorkall, så ingen
  // sideeffekter kan snike seg inn i det vi lærer av.
  let s: GameState = {
    ...slutt,
    // FASEN MAA SETTES TILBAKE. `lovligeKort` returnerer TOM LISTE naar fasen
    // ikke er «SPILL», saa uten denne ga hver eneste rekonstruerte stilling
    // null lovlige kort og null residualer - en helt stum laering som saa ut
    // til aa virke. Fanget av at rekonstruksjonen ble sammenlignet med
    // live-utregningen i stedet for antatt lik.
    fase: "SPILL",
    hender: hender.map((h) => [...h]),
    historikk: [],
    bord: [],
    stikkSpilt: 0,
    /**
     * ============ TELLERNE MAA NULLSTILLES, IKKE ARVES =================
     *
     * Sluttilstanden baerer rundens FASIT: stikkene er vunnet, makkeren er
     * roepet, poengene er delt ut. Spres den inn i rundens start, koder nettet
     * hvert eneste valg med informasjon som ikke fantes da valget ble tatt.
     *
     * Maalt paa trekkvektoren, foerste stikk: 8 av 273 felt avvek fra den ekte
     * stillingen.
     *
     *     v[219]      makkerAvsloert - makkeren roepet fra foerste kort
     *     v[229-236]  stikkVunnet og poengandeler - sluttverdier hele veien
     *
     * Ingen av dem krasjer. De ville bare gitt en hukommelse som laerte av en
     * runde ingen spilte. Det er prosjektets mest gjentatte feilklasse, og den
     * eneste grunnen til at den ble tatt er at rekonstruksjonen ble SAMMENLIGNET
     * med live-utregningen i stedet for antatt lik.
     */
    makkerAvslørt: false,
    stikkVunnet: slutt.stikkVunnet.map(() => 0),
    totalPoeng: poengFoer === undefined ? slutt.totalPoeng : [...poengFoer],
  } as GameState;

  /**
   * HISTORIKKEN MAA BYGGES OPP UNDERVEIS, ikke bare hendene.
   *
   * `atferd.logits` koder stillingen med `e1SpillTrekk`, som leser BAADE
   * spilte stikk og hvem som er i tur. Uten det saa nettet en tom fortid i
   * hvert eneste valg, og alle 329 rekonstruerte residualer avvek fra de
   * live-utregnede - stoerste avvik 0,618, altsaa nesten hele skalaen.
   *
   * Feilen ville ikke krasjet. Den ville gitt en hukommelse som laerte av en
   * runde som aldri ble spilt.
   */
  const spilte: GameState["historikk"][number][] = [];
  for (const stikk of slutt.historikk) {
    for (const kp of stikk.kort) {
      s = { ...s, iTur: kp.spiller } as GameState;
      const r = residual(s, kp.spiller, kp.kort, atferd);
      if (r !== null) {
        const liste = ut.get(kp.spiller) ?? [];
        liste.push(r);
        ut.set(kp.spiller, liste);
      }
      const nye = s.hender.map((h, p) =>
        p === kp.spiller ? h.filter((k) => !likeKort(k, kp.kort)) : h,
      );
      // Makkeren roepes I DET det etterlyste kortet legges - se motor.ts:540.
      const roept =
        s.makkerAvslørt ||
        (s.etterlyst !== null && likeKort(kp.kort, s.etterlyst));
      s = {
        ...s,
        hender: nye,
        bord: [...s.bord, kp],
        makkerAvslørt: roept,
      } as GameState;
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
  return ut;
}

/**
 * SKILLER DETTE SETET SEG FRA DE ANDRE VED BORDET?
 *
 * Referansen er bordet, ikke en konstant. Da faller alt som rammer alle likt ut
 * — nettets egen skjevhet, konvensjonsvakten, styrkenivået — og det som står
 * igjen er spørsmålet Arvind stilte: skiller DENNE spilleren seg ut?
 *
 * Porten er 2 SE på DIFFERANSEN, samme krav som gate 2 stiller til en vekt.
 * Uten den fyrte den gamle detektoren på vår egen bot.
 */
export function stilForskjell(
  eget: Biasanslag,
  andre: readonly Biasanslag[],
): { forskjell: number; se: number; sikker: boolean } {
  const gyldige = andre.filter((a) => a.n >= 2);
  if (eget.n < 2 || gyldige.length === 0) return { forskjell: 0, se: Infinity, sikker: false };

  /**
   * ============ REFERANSEN ER MEDIANSPILLEREN, IKKE SNITTET ===========
   *
   * Å slå sammen de andre til ett anslag virker riktigere — flere
   * observasjoner teller mer — men det MÅLTE feil. Med én trumftrekker ved
   * bordet dro han snittet opp, og alle de tre normale setene ble stemplet som
   * signifikant passive:
   *
   *     sete 0 normal   −0,182 ± 0,043   «sikker»
   *     sete 1 VANE     +0,642 ± 0,022   «sikker»
   *     sete 2 normal   −0,191 ± 0,043   «sikker»
   *     sete 3 normal   −0,258 ± 0,040   «sikker»
   *
   * Fire av fire flagget, av én vane. Et nullpunkt som flytter seg når ÉN
   * spiller er spesiell, gjør alle de andre spesielle også.
   *
   * Medianen av de tre andre kan ikke rykkes av én uteligger. Og vi bruker det
   * medianSETETS eget anslag, ikke bare medianverdien, så standardfeilen
   * fortsatt har spredningen bak seg.
   */
  const sortert = [...gyldige].sort((a, b) => snitt(a) - snitt(b));
  const samlet = sortert[Math.floor((sortert.length - 1) / 2)]!;
  const forskjell = snitt(eget) - snitt(samlet);
  const seEget = standardfeil(eget);
  const seAndre = standardfeil(samlet);
  const se = Math.sqrt(seEget * seEget + seAndre * seAndre);
  return { forskjell, se, sikker: Number.isFinite(se) && Math.abs(forskjell) >= 2 * se };
}
