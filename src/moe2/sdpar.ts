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
   * ADAPTIV BUDSJETTERING (`~fordel=` i speken, 14. sep). Udefinert = jevn fordeling, altså
   * PIMC-standarden og bit-identisk med før.
   *
   *   "halv"  SEKVENSIELL HALVERING: runde 1 gir alle kandidatene `K/⌈log2 k⌉` verdener,
   *           den dårligste halvparten kastes, budsjettet deles på de gjenværende, og slik
   *           til én står igjen. SAMME antall utspillinger som i dag — en omfordeling, ikke
   *           en fordyrelse. Se den lange begrunnelsen i `vurderPar`, inkludert hvorfor det
   *           ble halvering og ikke UCB.
   *
   * UDEFINERT OG IKKE `"jevn"`: «av» skal være strukturelt av. En standardverdi ville gjort
   * bit-identiteten avhengig av at grenen regner riktig i stedet for av at den ikke kjøres.
   */
  readonly fordeling?: "halv";
}

export interface ParKandidat {
  readonly kort: Kort;
  /** Snittverdi over verdenene. */
  readonly snitt: number;
  /** Verdien i hver enkelt verden – grunnlaget for den parrede differansen. */
  readonly perVerden: readonly number[];
}

export interface ParResultat {
  readonly kandidater: readonly ParKandidat[];
  /**
   * Antall verdener BESTE kandidat ble vurdert i. Med jevn fordeling er det antallet
   * verdener som lot seg trekke, som før — alle kandidatene deler dem. Med
   * `fordeling: "halv"` er det finalistenes antall, som er større enn `opts.verdener`:
   * budsjettet er flyttet dit, og det er hele poenget.
   */
  readonly n: number;
  /**
   * UTSPILLINGER FAKTISK BRUKT. Ligger her fordi påstanden «adaptiv fordeling koster det
   * samme» må kunne ETTERPRØVES og ikke bare hevdes: med jevn fordeling er dette
   * `n · antall lovlige kort`, og med halvering skal det være det samme tallet (minus en
   * rest mindre enn antall kandidater, som ikke rekker en hel verden til).
   */
  readonly utspillinger: number;
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
  const lovlige = lovligeKort(state, spiller);
  if (lovlige.length < 2) return null;
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

  const mål = opts.mål ?? standardMål;
  const klokke = opts.klokke ?? ((): number => performance.now());
  // Uten `motpartFor` er dette SAMME objekt som før, og utspillingene er bit-identiske.
  const utspiller = opts.motpartFor === undefined ? motpart : lagRuter(motpart, opts.motpartFor, spiller);

  /**
   * Trekker en BLOKK verdener. Samme `rng`-objekt hele veien, så to kall à m verdener
   * gir NØYAKTIG samme strøm som ett kall à 2m — `trekkVerdener` er bare en løkke rundt
   * `trekkVerdenBelief`. Det er derfor den jevne fordelingen under kan bli stående med
   * ett kall, og den adaptive kan trekke blokk for blokk uten å endre trekningene.
   */
  const trekk = (antall: number): number[][][] =>
    trekkVerdener(
      state,
      spiller,
      antall,
      opts.rng,
      undefined,
      vekt,
      opts.verdenKandidater,
      undefined,
      opts.budvekt ?? true,
    );

  /** ÉN UTSPILLING: kandidat `i` i verdenen `hender`. Ordrett uttrykket som sto i løkka. */
  const spillUt = (hender: number[][], i: number): number => {
    const h: Handling = { type: "SPILL", spiller, kort: lovlige[i]! };
    const etter = utfør(medVerden(state, hender, spiller), h).state;
    const slutt =
      opts.eksaktBlad !== undefined && opts.eksaktBlad > 0
        ? spillFerdigEksakt(etter, utspiller, opts.eksaktBlad)
        : spillFerdig(etter, utspiller);
    return mål(slutt, spiller);
  };

  const verdier: number[][] = lovlige.map(() => []);
  const lagKandidat = (i: number): ParKandidat => {
    const perVerden = verdier[i]!;
    const snitt = perVerden.reduce((a, b) => a + b, 0) / perVerden.length;
    return { kort: lovlige[i]!, snitt, perVerden };
  };

  /**
   * RANGERINGEN OVER VERDENER, trukket ut som funksjon fordi den adaptive fordelingen må
   * rangere de LEVENDE kandidatene mellom hver runde på NØYAKTIG samme kriterium som
   * sluttrangeringen. Uttrykkene er ordrett de som sto her før.
   *
   * Med `snitt` er dette som før. De andre kriteriene bruker `perVerden`, som allerede ble
   * regnet ut — de koster ingen ekstra utspillinger.
   */
  const vk = opts.verdenKombi ?? "snitt";
  const rangering = (kand: readonly ParKandidat[], nVerdener: number): Map<ParKandidat, number> => {
    const rang = new Map<ParKandidat, number>();
    if (vk === "flest") {
      for (const k of kand) rang.set(k, 0);
      for (let w = 0; w < nVerdener; w++) {
        let best = -Infinity;
        for (const k of kand) if (k.perVerden[w]! > best) best = k.perVerden[w]!;
        const vinnere = kand.filter((k) => k.perVerden[w]! >= best - 1e-9);
        for (const k of vinnere) rang.set(k, rang.get(k)! + 1 / vinnere.length);
      }
    } else {
      for (const k of kand) {
        if (vk === "snitt") {
          rang.set(k, k.snitt);
          continue;
        }
        const v = [...k.perVerden].sort((a, b) => a - b);
        rang.set(k, vk === "min" ? v[0]! : v[Math.floor(0.25 * (v.length - 1))]!);
      }
    }
    return rang;
  };

  /** Utspillinger faktisk brukt. Hele poenget med den adaptive fordelingen er at dette tallet står stille. */
  let utspillinger = 0;
  /** Verdener DE LEVENDE kandidatene deler. Jevn fordeling: alle lever hele veien. */
  let brukt = 0;
  /** Kandidatene som fortsatt er med, i indeksrekkefølge. */
  let live: number[] = lovlige.map((_, i) => i);
  /** Den best rangerte som ble kastet SIST — motparten i den parrede marginen når én står igjen. */
  let sistUte: number | null = null;

  if (opts.fordeling === undefined) {
    /**
     * JEVN FORDELING — PIMC-standarden, og stien uten knotten. BIT-IDENTISK: ett trekk av
     * `opts.verdener` verdener, og hvert lovlig kort spilt ut i hver av dem.
     *
     * VERDEN FOR VERDEN, ikke kort for kort (11. sep). Det er det som gjør fristen
     * mulig uten å ødelegge parringen: en verden er enten spilt ut for ALLE kandidatene
     * eller for ingen. Rekkefølgen endrer ingen verdi — motparten er tilstandsløs i SPILL
     * (E1, vakt og budagent holder ingenting mellom kall der), og hver utspilling starter
     * fra sin egen `medVerden`. `test/sik-tro.test.ts` holder den gamle rekkefølgen som
     * referanse.
     */
    const verdener = trekk(opts.verdener);
    if (verdener.length === 0) return null;
    for (const hender of verdener) {
      if (opts.frist !== undefined && klokke() >= opts.frist) break;
      for (let i = 0; i < lovlige.length; i++) {
        verdier[i]!.push(spillUt(hender, i));
        utspillinger++;
      }
      brukt++;
    }
  } else {
    /**
     * ============ SEKVENSIELL HALVERING (14. sep) ==============================
     *
     * PROBLEMET, MÅLT (`D:\amb-grp\loop\troledd.md` §3a og §5): søkets valgte kort skifter i
     * 43,8 % av beslutningene BARE av å trekke nye verdener med samme tro. Troens egen netto
     * virkning er +2,7 pp over det gulvet — under 6 % av endringene bærer informasjon. Syv
     * forsøk på å fikse det med bedre INFORMASJON har alle målt null. 16× flere verdener
     * kjøper 7,5 pp lavere gulv til 4× søketid. Det er ikke et informasjonsproblem, det er
     * et VARIANSPROBLEM i argmaks.
     *
     * OMFORDELINGEN. Den jevne løkka over gir hvert lovlig kort like mange utspillinger.
     * I en typisk stilling er 2–3 av 6 lovlige kort reelle kandidater; resten er avgjort
     * etter noen få verdener. Mesteparten av budsjettet går altså til å skille kort som
     * ikke konkurrerer. Sekvensiell halvering flytter det: runde 1 gir alle kandidatene
     * `K/⌈log2 k⌉` verdener, den dårligste halvparten kastes, og budsjettet deles på de
     * gjenværende. De to finalistene ender på ~2K verdener hver — det doble av i dag —
     * og det er DER argmaks faktisk avgjøres.
     *
     * SAMME ANTALL UTSPILLINGER. Budsjettet er `k · K`, nøyaktig det den jevne løkka
     * bruker. Hver runde får `⌊(budsjett − brukt) / (levende · gjenstående runder)⌋`
     * verdener per kandidat, så avrunding fra én runde tilfaller den neste i stedet for å
     * lekke. Taket under er hardt: en verden startes ikke om den ville tatt oss over
     * budsjettet. Resten (< antall levende, altså < k av k·K) blir stående ubrukt, og
     * `utspillinger` i svaret gjør differansen etterprøvbar i stedet for påstått.
     *
     * PARRET PÅ TVERS AV KANDIDATER. Alle som fortsatt lever i en runde spiller ut
     * NØYAKTIG de samme verdenene — blokken deles. To levende kandidater har derfor til
     * enhver tid identiske verdenssett, og enhver sammenlikning mellom dem er parret.
     * Uten det ville halveringen innført akkurat den variansen den er der for å fjerne.
     *
     * HVORFOR HALVERING OG IKKE UCB — begrunnelsen oppdraget ber om. To grunner, og den
     * andre er avgjørende:
     *
     *   1. UCB trenger en utforskningskonstant mot en BELØNNINGSSKALA. Verdiene her er
     *      rundepoeng, og spredningen varierer sterkt med stillingen (`troledd.md` §6:
     *      σ fra under 0,5 til over 2,5 i samme kjøring). En konstant måtte kalibreres per
     *      stilling — en ny knott å ta feil av. Halvering har ingen konstant: budsjettet og
     *      antall kandidater bestemmer alt.
     *   2. UCB ØDELEGGER PARRINGEN. Den trekker ett og ett armvalg, så to kandidater
     *      ender med ULIKE verdenssett. Da må de sammenliknes uparret, og verden-effekten
     *      («denne given var snill mot alle») kommer tilbake i differansen — nøyaktig
     *      støyen hele oppdraget handler om å fjerne. Halvering er den bandittalgoritmen
     *      som lar hele det levende feltet dele hver eneste verden.
     *
     * MARGIN OG σ REGNES PÅ FINALEPARET, som deler ALLE verdenene. Med jevn fordeling
     * hviler σ på K verdener; her hviler den på ~2K, og på de to kortene som faktisk
     * konkurrerte. Porten i `Sikkerorakel` ser altså en bedre målt margin, ikke bare et
     * annet kort.
     */
    const k = lovlige.length;
    const runder = Math.max(1, Math.ceil(Math.log2(k)));
    const budsjett = k * opts.verdener;
    let stopp = false;
    for (let r = 0; r < runder; r++) {
      const gjenstår = runder - r;
      const perKandidat = Math.max(1, Math.floor((budsjett - utspillinger) / (live.length * gjenstår)));
      const blokk = trekk(perKandidat);
      if (blokk.length === 0) break;
      for (const hender of blokk) {
        // TAKET: en verden startes ikke om den ville tatt oss over dagens budsjett.
        if (utspillinger + live.length > budsjett) {
          stopp = true;
          break;
        }
        if (opts.frist !== undefined && klokke() >= opts.frist) {
          stopp = true;
          break;
        }
        for (const i of live) {
          verdier[i]!.push(spillUt(hender, i));
          utspillinger++;
        }
        brukt++;
      }
      // Avbrutt midt i en blokk: ingen utsiling på halve data, de levende står som de er.
      if (stopp || live.length <= 1) break;
      /**
       * KAST DEN DÅRLIGSTE HALVPARTEN. `Array.prototype.sort` er stabil, og `live` står i
       * stigende indeksrekkefølge, så uavgjorte rangeringer avgjøres av kortrekkefølgen fra
       * `lovligeKort` — deterministisk, som resten av søket.
       */
      const par = live.map((i) => ({ i, kand: lagKandidat(i) }));
      const rang = rangering(
        par.map((p) => p.kand),
        brukt,
      );
      const sortert = par.slice().sort((a, b) => rang.get(b.kand)! - rang.get(a.kand)!);
      const behold = Math.ceil(live.length / 2);
      sistUte = sortert[behold]!.i;
      live = sortert
        .slice(0, behold)
        .map((p) => p.i)
        .sort((a, b) => a - b);
    }
  }
  // Fristen rakk ikke én verden: «ingen data», og policyen skal stå.
  if (brukt === 0) return null;

  const kandidater: ParKandidat[] = lovlige.map((_, i) => lagKandidat(i));

  let beste: ParKandidat;
  let nestBeste: ParKandidat | null;
  if (opts.fordeling === undefined) {
    const rang = rangering(kandidater, brukt);
    const sortert = kandidater.slice().sort((a, b) => rang.get(b)! - rang.get(a)!);
    beste = sortert[0]!;
    nestBeste = sortert[1] ?? null;
  } else if (live.length >= 2) {
    /**
     * Halveringen ble avbrutt (frist eller tomt trekk) med flere i live. De deler alle
     * `brukt` verdener, så toppen og nest øverst er fortsatt et PARRET par.
     */
    const levende = live.map((i) => kandidater[i]!);
    const rang = rangering(levende, brukt);
    const sortert = levende.slice().sort((a, b) => rang.get(b)! - rang.get(a)!);
    beste = sortert[0]!;
    nestBeste = sortert[1]!;
  } else {
    // Finalen: vinneren og den som ble kastet sist. De to deler HVER eneste verden.
    beste = kandidater[live[0]!]!;
    nestBeste = sistUte === null ? null : kandidater[sistUte]!;
  }
  const n = opts.fordeling === undefined ? brukt : beste.perVerden.length;

  if (nestBeste === null) {
    return {
      kandidater,
      n,
      utspillinger,
      beste,
      nestBeste: null,
      margin: 0,
      marginSE: Number.NaN,
      sigma: 0,
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
  return { kandidater, n, utspillinger, beste, nestBeste, margin, marginSE, sigma };
}
