/**
 * EKSPLISITTE VRAKREGLER, OG TREKKENE DE SKAL MÅLES PÅ.
 *
 * BAKGRUNNEN. Vraket gjøres i dag av NevroHjerne i ALLE våre agenter – E1 og
 * konvensjonsvakten overstyrer bare kortspillet – så alt vi har målt på vrak er
 * nevros oppførsel. Atferdsprofilen mot MesterAI (`analyse/mesterai-atferd2.txt`)
 * ga ett tall som skiller dem: farger tømt av vraket, MesterAI 0,95 mot nevros
 * 0,89. Arvind sier at DET er hele poenget med vraket – man vraker for å bli
 * RENONS, ikke bare for å bli kvitt lave kort, fordi en renons er retten til å
 * trumfe når fargen spilles.
 *
 * DOMMEN, MÅLT 2026-07-26 på 2 × 24 000 giver (`analyse/vrak-analyse.txt` og
 * `-r1.txt`), parret mot nevros eget vrak med `vakt:at:e1:e1-modell/sd-r2.bin`
 * i budvinnersetet:
 *
 *   INGEN eksplisitt regel her slår nevros vrak. Den beste, «tøm korteste
 *   farge, men kast aldri et ess», er +0,056 ± 0,043 over begge kjøringene –
 *   en uavgjort. Ingenting promoteres.
 *
 *   Mekanismene bak reglene er derimot ekte, og de er asymmetriske: å forby
 *   ESSET er verdt +0,53 poeng (samme regel med og uten forbudet), mens å
 *   legge kongeforbudet oppå koster −0,06. Renonsen er verdt +0,49 ± 0,08 i
 *   det parrede ett-korts-byttet, men bare +0,16 ± 0,09 når den tar deg fra
 *   fire farger til tre, og +2,16 ± 0,18 når den tar deg fra tre til to.
 *
 * Reglene blir stående fordi de er MÅLT, og fordi tallene over er det eneste
 * grunnlaget en framtidig vrakekspert kan skrive sin tapsfunksjon fra.
 *
 * Modulen inneholder tre ting, og med vilje ikke mer:
 *
 *   1. TREKKENE en hånd etter vrak har (`håndtrekk`) – renonser, trumflengde,
 *      korte sterke farger, og hva vraket kostet i valør. Det er disse
 *      `examples/vrak-analyse.ts` regresserer utfallet på.
 *   2. REGLENE som skal måles mot nevros vrak (`vrakKorteste`,
 *      `vrakKortesteBevarHonnør`, `vrakVeid`).
 *   3. HÅNDPROFILEN (`håndprofil`) – råtallene påstand 3 skal prøves med: er
 *      «A K i kløver» verdt mer enn «lang serie med lave kort i hjerter»?
 *
 * KORTINDEKSER, ikke `Kort`. Hele vrakmaskineriet i `eksperter/vrak.ts` og
 * `moe2-port-vrak-sd.ts` regner i indeksen farge × 13 + valør − 2, og en egen
 * koding her ville vært nøyaktig den klassen feil som ga `i >> 4` mot
 * `floor(c / 13)` i første SD-utkast. `kortFraIndeks` hentes derfra.
 */

import { alleVrak } from "./eksperter/vrak.ts";

/** Valøren (2..14) til en kortindeks. */
export function valørAv(i: number): number {
  return (i % 13) + 2;
}

/** Fargen (0..3) til en kortindeks. */
export function fargeAv(i: number): number {
  return Math.floor(i / 13);
}

/** Antall kort per farge. Alltid lengde 4. */
export function fargelengder(hånd: readonly number[]): number[] {
  const l = [0, 0, 0, 0];
  for (const k of hånd) l[fargeAv(k)]!++;
  return l;
}

/** Honnørpoeng etter bridgeskalaen: E 4, K 3, D 2, Kn 1. */
export function honnørpoeng(hånd: readonly number[]): number {
  let sum = 0;
  for (const k of hånd) {
    const v = valørAv(k);
    if (v >= 11) sum += v - 10;
  }
  return sum;
}

// --- Trekkene ved en hånd ETTER vrak ---------------------------------------

export interface Håndtrekk {
  /** Farger med minst ett kort igjen: 1, 2, 3 eller 4. */
  readonly fargerIgjen: number;
  /** 4 − fargerIgjen. Renonser er det hypotesen handler om, så det står eget. */
  readonly renonser: number;
  /**
   * Lengden på den lengste fargen som er igjen. Trumfen VELGES ikke her, men
   * atferdsprofilen viste at nevro tar den lengste fargen i 100 % av
   * kontraktene (MesterAI 96 %), så lengste farge ER trumflengden i praksis.
   * Målingen bruker likevel den FAKTISK valgte trumfen der den er kjent.
   */
  readonly lengsteFarge: number;
  /** Antall farger med ≤ 3 kort som holder ess eller konge. */
  readonly korteSterke: number;
  /** 1 hvis hånden har minst én kort sterk farge – påstand 3 i sin enkleste form. */
  readonly harKortSterk: number;
  /** Summen av valørene på de vrakede kortene. Prisen for det man kjøpte. */
  readonly vraketValør: number;
  /**
   * Antall ESS i vraket – EGET felt, atskilt fra kongene.
   *
   * Arvind presiserte det: «Man kan hive konge altså. av og til lønner det seg,
   * men A er veldig sjeldent man hiver.» Slår vi dem sammen til «honnør», er
   * nettopp den forskjellen han peker på det første som forsvinner ut av
   * tallene – ett felt kan ikke ha to fortegn. Derfor to felt, alltid, uansett
   * hvilken regel som til slutt vinner.
   */
  readonly vraketEss: number;
  /** Antall KONGER i vraket. */
  readonly vraketKonge: number;
}

/** Trekkene ved hånden som blir igjen når `vrak` er lagt fra `hånd`. */
export function håndtrekk(hånd: readonly number[], vrak: readonly number[]): Håndtrekk {
  const ute = new Set(vrak);
  const igjen = hånd.filter((k) => !ute.has(k));
  const lengder = fargelengder(igjen);
  const fargerIgjen = lengder.filter((x) => x > 0).length;
  let korteSterke = 0;
  for (let f = 0; f < 4; f++) {
    if (lengder[f]! === 0 || lengder[f]! > 3) continue;
    if (igjen.some((k) => fargeAv(k) === f && valørAv(k) >= 13)) korteSterke++;
  }
  let vraketValør = 0;
  let vraketEss = 0;
  let vraketKonge = 0;
  for (const k of vrak) {
    const v = valørAv(k);
    vraketValør += v;
    if (v === 14) vraketEss++;
    else if (v === 13) vraketKonge++;
  }
  return {
    fargerIgjen,
    renonser: 4 - fargerIgjen,
    lengsteFarge: Math.max(...lengder),
    korteSterke,
    harKortSterk: korteSterke > 0 ? 1 : 0,
    vraketValør,
    vraketEss,
    vraketKonge,
  };
}

// --- Reglene ----------------------------------------------------------------

/**
 * Vraker de `antall` kortene med lavest `nøkkel`. Stabilt ved likhet, så to
 * kjøringer av samme regel gir samme vrak.
 *
 * Identisk med `lavesteEtter` i `examples/moe2-port-vrak-sd.ts` – med vilje, så
 * «korteste farge» her og «korteste farge» der er den samme policyen og tallene
 * kan settes mot hverandre.
 */
export function vrakLavesteEtter(
  hånd: readonly number[],
  antall: number,
  nøkkel: (k: number) => number,
): number[] {
  const sortert = [...hånd].sort((a, b) => {
    const d = nøkkel(a) - nøkkel(b);
    return d !== 0 ? d : a - b;
  });
  return sortert.slice(0, antall).sort((a, b) => a - b);
}

/**
 * «TØM KORTESTE FARGE FØRST» – hypotesen i sin reneste form.
 *
 * Sorterer på (fargens lengde, valør) og kaster de fire laveste. Da tømmes den
 * korteste fargen først, deretter den nest korteste, og innenfor en farge går
 * de laveste kortene først.
 *
 * SVAKHETEN, som skal stå: er den korteste fargen på fem kort, brukes hele
 * vraket uten at det blir noen renons – regelen ser ikke om tømmingen er
 * OPPNÅELIG. `vrakVeid` gjør det, fordi den scorer sluttresultatet.
 *
 * MÅLT: −0,474 ± 0,046 poeng mot nevros vrak. Den taper, og den taper på ÉN
 * ting: uten honnørvern kaster den 0,21 ess per vrak, mot nevros 0,01. Legg
 * esset i fred (`vrakKortesteBevarEss`) og de −0,47 blir +0,06.
 */
export function vrakKorteste(hånd: readonly number[], antall: number): number[] {
  const lengder = fargelengder(hånd);
  return vrakLavesteEtter(hånd, antall, (k) => lengder[fargeAv(k)]! * 100 + valørAv(k));
}

/**
 * Samme, men kort med valør ≥ `vern` kastes ALDRI så lenge det finnes andre.
 *
 * `vern = 14` verner bare ESSENE, `vern = 13` verner ess OG konger. Skillet er
 * hele poenget: Arvind kan hive en konge, men nesten aldri et ess, og en regel
 * som behandler dem likt kan ikke måle den forskjellen. De to variantene måles
 * derfor mot hverandre, ikke som én «bevar honnør»-regel.
 *
 * En 16-kortshånd har høyst åtte ess/konger, så det finnes alltid minst åtte
 * andre kort – fallbacken under er en ren sikring, ikke en forventet gren.
 */
export function vrakKortesteBevar(hånd: readonly number[], antall: number, vern: number): number[] {
  const lengder = fargelengder(hånd);
  const lave = hånd.filter((k) => valørAv(k) < vern);
  if (lave.length < antall) return vrakKorteste(hånd, antall);
  return vrakLavesteEtter(lave, antall, (k) => lengder[fargeAv(k)]! * 100 + valørAv(k));
}

/**
 * HOVEDKANDIDATEN: tøm korteste farge, men kast aldri et ess. Konge er lov.
 * MÅLT: +0,056 ± 0,043 mot nevros vrak over 48 000 giver – uavgjort, ikke seier.
 */
export function vrakKortesteBevarEss(hånd: readonly number[], antall: number): number[] {
  return vrakKortesteBevar(hånd, antall, 14);
}

/**
 * KONTROLLEN: tøm korteste farge, kast verken ess eller konge.
 * MÅLT: −0,003 ± 0,043. Kongeforbudet oppå essforbudet er verdt −0,06 – altså
 * ingenting. Det er DEN forskjellen som gjør at de to aldri slås sammen.
 */
export function vrakKortesteBevarAK(hånd: readonly number[], antall: number): number[] {
  return vrakKortesteBevar(hånd, antall, 13);
}

/**
 * «TØM FARGEN HVIS DEN KAN TØMMES, OG DEN IKKE KOSTER ET ESS.»
 *
 * Regelen er ikke gjettet – den er skrevet AV tall 1d i `analyse/vrak-analyse.txt`.
 * Renonsbyttet der viser at det å tømme den korteste fargen lønner seg når
 * toppkortet er en konge eller lavere, og taper stort når det er et ess. Denne
 * regelen gjør nøyaktig det, og ingenting mer:
 *
 *   1. Er den korteste fargen kort nok til å tømmes med `antall` kort, OG
 *      holder den ikke esset – kast hele fargen, og fyll opp med de laveste
 *      kortene som ikke er ess.
 *   2. Ellers: kast de laveste kortene som ikke er ess, korteste farge først.
 *
 * SVAKHETEN, som skal stå: den ser bare på ÉN farge. En hånd der to farger
 * kunne tømmes tømmer bare den ene. `vrakVeid` er den som veier alt mot alt.
 *
 * MÅLT: −0,010 ± 0,044 mot nevros vrak. Den tømmer 0,94 farger mot nevros
 * 0,86 og får ingenting igjen for det. Renonsen er ekte (tabell 1d), men
 * nevro høster den allerede – det er ikke der poengene ligger.
 */
export function vrakRenonsUtenEss(hånd: readonly number[], antall: number): number[] {
  const lengder = fargelengder(hånd);
  const nøkkel = (k: number): number => lengder[fargeAv(k)]! * 100 + valørAv(k);
  let korteste = -1;
  for (let f = 0; f < 4; f++) {
    if (lengder[f]! === 0 || lengder[f]! > antall) continue;
    if (korteste < 0 || lengder[f]! < lengder[korteste]!) korteste = f;
  }
  const harEss = korteste >= 0 && hånd.some((k) => fargeAv(k) === korteste && valørAv(k) === 14);
  if (korteste < 0 || harEss) return vrakKortesteBevar(hånd, antall, 14);

  const iFargen = hånd.filter((k) => fargeAv(k) === korteste);
  const resten = hånd.filter((k) => fargeAv(k) !== korteste && valørAv(k) < 14);
  const mangler = antall - iFargen.length;
  if (resten.length < mangler) return vrakKortesteBevar(hånd, antall, 14);
  return [...iFargen, ...vrakLavesteEtter(resten, mangler, nøkkel)].sort((a, b) => a - b);
}

/** «Kast de laveste kortene» – referanseregelen fra portkjøringen. */
export function vrakLavestValør(hånd: readonly number[], antall: number): number[] {
  return vrakLavesteEtter(hånd, antall, valørAv);
}

/**
 * VEKTENE i den veide regelen: poeng per enhet av hvert trekk.
 *
 * Dette er ikke gjettede tall. De settes av `examples/vrak-analyse.ts`, som
 * regresserer rundepoeng på trekkene med GIV-FASTE EFFEKTER – altså bare på
 * variasjonen mellom ulike vrak av NØYAKTIG samme hånd. Vektene her er de
 * målte koeffisientene fra tilpasningssettet, og regelen måles etterpå på et
 * DISJUNKT holdout. Endres de, skal tallet i `docs/moe2.md` endres med dem.
 */
export interface Vrakvekter {
  readonly renons: number;
  readonly lengsteFarge: number;
  readonly korteSterke: number;
  readonly vraketValør: number;
  /** Ess og konge har HVER SIN vekt. Se `Håndtrekk.vraketEss`. */
  readonly vraketEss: number;
  readonly vraketKonge: number;
}

/**
 * MÅLT 2026-07-26, 24 000 giver, frøbase 31 000 000. Giv-faste effekter over
 * de fire TILFELDIGE vrakene – den eneste kilden til eksogen variasjon i
 * trekkene. Se `analyse/vrak-analyse-r1.txt`, tabell 1a, kolonnen «eksogen».
 * Poeng per runde per enhet.
 *
 * FORBEHOLDET SOM MÅ STÅ, og som holdout-målingen BEKREFTET: tilfeldige vrak
 * lever i et helt annet område enn en fornuftig policy. De blir renons i 0,10
 * av tilfellene; nevro i 0,86. Koeffisienten +3,13 for en renons er derfor et
 * EKSTRAPOLAT når regelen brukes til å velge, og det parrede renonsbyttet
 * (tabell 1d) måler den samme renonsen til +0,49 i det området valget faktisk
 * tas – sju ganger mindre.
 *
 * OG DET GIKK SLIK MODELLEN ADVARTE: `vrakVeid` med disse vektene målte
 * −0,176 ± 0,068 poeng mot nevros vrak på 24 000 FRISKE giver (frøbase
 * 33 000 000, `analyse/vrak-analyse.txt`). Den tømmer 1,01 farger mot nevros
 * 0,86 – altså akkurat den overvurderingen av renonsen ekstrapolatet forutsa.
 * Vektene er ærlige der de er målt, og for optimistiske der de brukes.
 */
export const VEKTER_MÅLT: Vrakvekter = {
  renons: 3.1321,
  lengsteFarge: 4.0341,
  korteSterke: -0.2286,
  vraketValør: -0.1483,
  vraketEss: -2.586,
  vraketKonge: -1.6715,
};

/** Den veide scoren til én kandidat, i poeng per runde. */
export function vrakScore(t: Håndtrekk, v: Vrakvekter): number {
  return (
    v.renons * t.renonser +
    v.lengsteFarge * t.lengsteFarge +
    v.korteSterke * t.korteSterke +
    v.vraketValør * t.vraketValør +
    v.vraketEss * t.vraketEss +
    v.vraketKonge * t.vraketKonge
  );
}

/**
 * DEN VEIDE REGELEN: enumerer alle C(16,4) = 1 820 vrak og ta det som scorer
 * høyest på de MÅLTE vektene.
 *
 * Full enumerering er billig her – 1 820 × en telling over 12 kort – i motsetning
 * til SD-fasiten, der hver kandidat koster en hel utspilling per verden og
 * derfor må forhåndsfiltreres. Det er hele forskjellen i pris mellom en regel
 * og et orakel, og grunnen til at regelen i det hele tatt er interessant.
 *
 * Stabilt ved likhet: første kandidat i `alleVrak`-rekkefølgen vinner.
 *
 * MÅLT OG FORKASTET: −0,176 ± 0,068 poeng mot nevros vrak, 24 000 holdout-giver.
 * Regelen står igjen som dokumentasjon på hvorfor en koeffisient målt på
 * tilfeldige vrak ikke kan brukes til å VELGE vrak – ikke som en kandidat.
 */
export function vrakVeid(
  hånd: readonly number[],
  antall: number,
  vekter: Vrakvekter = VEKTER_MÅLT,
): number[] {
  const kandidater = alleVrak([...hånd].sort((a, b) => a - b), antall);
  let beste = kandidater[0]!;
  let bestScore = -Infinity;
  for (const v of kandidater) {
    const s = vrakScore(håndtrekk(hånd, v), vekter);
    if (s > bestScore) {
      bestScore = s;
      beste = v;
    }
  }
  return [...beste].sort((a, b) => a - b);
}

// --- Håndverdi: påstand 3 ---------------------------------------------------

/**
 * RÅTALLENE FOR HÅNDVERDI.
 *
 * Påstanden som skal prøves: «A K i kløver slår en lang serie med lave kort i
 * hjerter» – altså at lengde alene er et dårlig mål, og at korte sterke farger
 * bærer mer enn lengden sier.
 *
 * Feltene er derfor delt i to grupper som kan settes mot hverandre i en
 * regresjon: de som BARE beskriver fordelingen (lengder), og de som beskriver
 * STYRKEN og hvor den sitter. Er påstand 3 sann, skal den andre gruppen
 * forklare varians den første ikke gjør.
 *
 * `lengste` regnes som trumfkandidat fordi trumfen faktisk velges slik: nevro
 * tar lengste farge i 100 % av kontraktene, MesterAI i 96 %.
 */
export interface Håndprofil {
  /** Fargelengdene, sortert fallende. Alltid fire tall. */
  readonly lengder: readonly number[];
  readonly lengste: number;
  readonly nestLengste: number;
  readonly fargerBrukt: number;
  /** Honnørpoeng i hele hånden (E 4, K 3, D 2, Kn 1). */
  readonly honnør: number;
  /** Antall ess i hånden. Eget felt, av samme grunn som i `Håndtrekk`. */
  readonly ess: number;
  /** Antall konger i hånden. */
  readonly konger: number;
  /**
   * Farger med ≤ 3 kort som holder BÅDE ess og konge – «A K i kløver», hans
   * eget eksempel, som eget tall. Uten det kan påstanden om at en slik farge
   * slår en lang svak farge ikke prøves, bare omskrives til honnørpoeng.
   */
  readonly korteAK: number;
  /** Honnørpoeng i den lengste fargen. */
  readonly trumfHonnør: number;
  /** Sammenhengende serie fra ess og nedover i lengste farge: E, E-K, E-K-D … */
  readonly trumfSerie: number;
  /** Ess og konger UTENFOR lengste farge. */
  readonly sideAK: number;
  /** Farger utenom den lengste med ≤ 3 kort som holder ess eller konge. */
  readonly korteSterke: number;
  /** Antall kort i sidefarger, altså
   * hvor mye av hånden som IKKE er trumf. */
  readonly sidekort: number;
}

/** Profilen til en hånd gitt som kortindekser. */
export function håndprofil(hånd: readonly number[]): Håndprofil {
  const lengder = fargelengder(hånd);
  const sortert = [...lengder].sort((a, b) => b - a);
  // Ved lik lengde velges laveste fargeindeks – deterministisk, og valget
  // spiller ingen rolle for regresjonen så lenge det er konsistent.
  let lengsteFarge = 0;
  for (let f = 1; f < 4; f++) if (lengder[f]! > lengder[lengsteFarge]!) lengsteFarge = f;

  const iTrumf = hånd.filter((k) => fargeAv(k) === lengsteFarge);
  const har = new Set(iTrumf.map(valørAv));
  let serie = 0;
  for (let v = 14; v >= 2; v--) {
    if (!har.has(v)) break;
    serie++;
  }
  let sideAK = 0;
  let korteSterke = 0;
  let korteAK = 0;
  for (let f = 0; f < 4; f++) {
    if (lengder[f]! === 0) continue;
    const iFargen = hånd.filter((k) => fargeAv(k) === f);
    const harE = iFargen.some((k) => valørAv(k) === 14);
    const harK = iFargen.some((k) => valørAv(k) === 13);
    if (lengder[f]! <= 3 && harE && harK) korteAK++;
    if (f === lengsteFarge) continue;
    const ak = iFargen.filter((k) => valørAv(k) >= 13).length;
    sideAK += ak;
    if (lengder[f]! <= 3 && ak > 0) korteSterke++;
  }
  return {
    lengder: sortert,
    lengste: sortert[0]!,
    nestLengste: sortert[1]!,
    fargerBrukt: lengder.filter((x) => x > 0).length,
    honnør: honnørpoeng(hånd),
    ess: hånd.filter((k) => valørAv(k) === 14).length,
    konger: hånd.filter((k) => valørAv(k) === 13).length,
    korteAK,
    trumfHonnør: honnørpoeng(iTrumf),
    trumfSerie: serie,
    sideAK,
    korteSterke,
    sidekort: hånd.length - iTrumf.length,
  };
}
