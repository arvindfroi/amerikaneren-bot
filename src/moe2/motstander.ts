/**
 * MOTSTANDERMODELLEN: hva DENNE spilleren pleier å ha når hun byr slik.
 *
 * ARVINDS DESIGN, 4. august:
 *
 *   «Motstandermodellering skal skje over mange runder med samme motstander.
 *    At den adapterer gjennom mange runder for å bli bedre med/mot de andre.
 *    Byr de høyt eller lavt, hvordan spiller de ut. Jeg ser for meg at den
 *    husker hvor lang trumfserie du hadde siste gangene du bød 9, og tar det i
 *    betraktning når den gjetter hva hånden din er nå.»
 *
 * HVORFOR AKKURAT DENNE LINJEN. To uavhengige målinger 4. august endte samme
 * sted: vrakvelgeren feilet fordi verdensrommet er størst tidlig i runden
 * (§17), og uttømmende enumerering er først råd fra stikk 9 (§19). Begge sier
 * at det som mangler er en bedre PRIOR over hva motparten har — ikke flere
 * trekk og ikke mer eksakt regning.
 *
 * BEFOLKNINGSTALLENE ER MÅLT, IKKE GJETTET. 768 runder fra familiens faktiske
 * spill der mennesket ikke vant budet, med hånden rekonstruert fra kortene de
 * spilte (`verktoy/menneskehand.py`):
 *
 *   bud       n    lengste farge      honnører
 *   passet  298   4,396 ± 0,669    1,272 ± 0,943
 *   7       161   4,323 ± 0,530    1,180 ± 0,833
 *   8       226   4,509 ± 0,667    1,788 ± 0,986
 *   9        67   5,000 ± 0,881    2,313 ± 0,934
 *
 * Bud 9 mot bud 7 er +1,13 honnører, omtrent 7,5 SE. Signalet er ekte.
 *
 * OG ETT FUNN SOM STYRER FORMEN: å passe og å by 7 ser nesten helt like ut
 * (1,272 mot 1,180 honnører). De lave budene skiller ikke mellom svak hånd og
 * forsiktig spiller. Modellen skal derfor ikke straffe sterke hender hardt hos
 * en som bød lavt — bare belønne dem hos en som bød høyt.
 *
 * KRYMPING MOT BEFOLKNINGEN ER IKKE VALGFRITT. Etter tre runder mot en ny
 * motstander finnes det ikke grunnlag for et individuelt anslag. Estimatet
 * starter derfor på tabellen over og flytter mot individet i takt med antall
 * observasjoner:
 *
 *     estimat = (n · individ + k · befolkning) / (n + k)
 *
 * Med k = 12 trengs et dusin observasjoner før individet veier like mye som
 * befolkningen. Da kan modellen stå på fra første runde uten å skade.
 */

import { FARGER, type Kort } from "../kort.ts";

/** Trekkene modellen beskriver en hånd med. */
export interface Håndtrekk {
  /** Lengden på den lengste fargen. */
  readonly lengste: number;
  /** Ess og konger. */
  readonly honnør: number;
}

interface Fordeling {
  readonly mLengste: number;
  readonly sdLengste: number;
  readonly mHonnør: number;
  readonly sdHonnør: number;
}

/**
 * Målt på 768 familierunder. Nøkkel 0 = passet uten tallbud.
 *
 * Bud utenfor 7–9 finnes knapt i dataen (bud 5: 3 runder, bud 6: 9, bud 10: 4),
 * så de slås opp ved nærmeste nabo i stedet for å ekstrapolere en linje
 * gjennom støy.
 */
const BEFOLKNING: ReadonlyMap<number, Fordeling> = new Map([
  [0, { mLengste: 4.396, sdLengste: 0.669, mHonnør: 1.272, sdHonnør: 0.943 }],
  [7, { mLengste: 4.323, sdLengste: 0.53, mHonnør: 1.18, sdHonnør: 0.833 }],
  [8, { mLengste: 4.509, sdLengste: 0.667, mHonnør: 1.788, sdHonnør: 0.986 }],
  [9, { mLengste: 5.0, sdLengste: 0.881, mHonnør: 2.313, sdHonnør: 0.934 }],
]);

/** Hvor mange observasjoner som skal til før individet veier like mye. */
const KRYMPING = 12;

export function håndtrekk(kort: readonly Kort[]): Håndtrekk {
  const per = new Map<string, number>();
  let honnør = 0;
  for (const k of kort) {
    per.set(k.farge, (per.get(k.farge) ?? 0) + 1);
    if (k.verdi >= 13) honnør++;
  }
  let lengste = 0;
  for (const f of FARGER) lengste = Math.max(lengste, per.get(f) ?? 0);
  return { lengste, honnør };
}

/** Befolkningsfordelingen for et bud, med nærmeste nabo utenfor 7–9. */
function befolkning(bud: number): Fordeling {
  const direkte = BEFOLKNING.get(bud);
  if (direkte !== undefined) return direkte;
  if (bud <= 0) return BEFOLKNING.get(0)!;
  let beste = 7;
  for (const b of [7, 8, 9]) if (Math.abs(b - bud) < Math.abs(beste - bud)) beste = b;
  return BEFOLKNING.get(beste)!;
}

interface Teller {
  n: number;
  sumLengste: number;
  sumHonnør: number;
}

export class Motstandermodell {
  /** spillernøkkel → budnivå → observasjoner. */
  private readonly obs = new Map<string, Map<number, Teller>>();

  /**
   * Registrerer en FERDIG runde: hva spilleren bød, og hva hånden var.
   *
   * Skal bare kalles når hånden er SIKKERT kjent. Er spilleren budvinner, tok
   * hun opp talongen og vraket fire, og de spilte kortene er ikke den utdelte
   * hånden — de rundene må utelates, ikke gjettes på.
   */
  registrer(spiller: string, bud: number, hånd: readonly Kort[]): void {
    const t = håndtrekk(hånd);
    const perBud = this.obs.get(spiller) ?? new Map<number, Teller>();
    const teller = perBud.get(bud) ?? { n: 0, sumLengste: 0, sumHonnør: 0 };
    teller.n++;
    teller.sumLengste += t.lengste;
    teller.sumHonnør += t.honnør;
    perBud.set(bud, teller);
    this.obs.set(spiller, perBud);
  }

  /** Antall registrerte runder for spilleren på dette budnivået. */
  antall(spiller: string, bud: number): number {
    return this.obs.get(spiller)?.get(bud)?.n ?? 0;
  }

  /**
   * Krympet forventning: starter på befolkningen, flytter mot individet.
   *
   * Spredningen krympes IKKE mot individet. Med et dusin observasjoner er et
   * individuelt varians­anslag så ustabilt at det gjør vekten verre, ikke
   * bedre — og en for smal spredning er farligere enn en for bred: den
   * forkaster verdener som faktisk er mulige.
   */
  forventning(spiller: string, bud: number): Fordeling {
    const b = befolkning(bud);
    const t = this.obs.get(spiller)?.get(bud);
    if (t === undefined || t.n === 0) return b;
    const v = t.n / (t.n + KRYMPING);
    return {
      mLengste: (1 - v) * b.mLengste + v * (t.sumLengste / t.n),
      sdLengste: b.sdLengste,
      mHonnør: (1 - v) * b.mHonnør + v * (t.sumHonnør / t.n),
      sdHonnør: b.sdHonnør,
    };
  }

  /**
   * Log-vekt for hvor godt en KANDIDATHÅND passer med det spilleren bød.
   *
   * ASYMMETRIEN ER MÅLT, IKKE VALGT. Passet og bud 7 ser nesten like ut
   * (1,272 mot 1,180 honnører), så en sterk hånd hos en som bød lavt er
   * IKKE et sterkt argument mot verdenen – hun kan ha vært forsiktig. Derfor
   * straffes bare avvik som gjør hånden for SVAK for budet, pluss et mildt
   * ledd for det motsatte.
   */
  logVekt(spiller: string, bud: number, hånd: readonly Kort[]): number {
    const f = this.forventning(spiller, bud);
    const t = håndtrekk(hånd);
    // Z-VERDIEN KLIPPES TIL +/-3. Standardavvikene er målt på 67–298 runder,
    // så halene er dårlig estimert. Å la et 4-sigma-avvik derfra utradere en
    // verden er å stole på data vi ikke har — og sampleren har bare tre
    // kandidater å velge mellom, så én utradert verden er dyr.
    const z = (x: number, m: number, sd: number): number =>
      Math.max(-3, Math.min(3, (x - m) / Math.max(0.3, sd)));
    const zL = z(t.lengste, f.mLengste, f.sdLengste);
    const zH = z(t.honnør, f.mHonnør, f.sdHonnør);
    // FOR SVAK straffes fullt; FOR STERK bare en tiendedel.
    //
    // Asymmetrien følger av målingen, ikke av smak: passet og bud 7 skiller
    // seg med 0,09 honnører (1,272 mot 1,180). En sterk hånd hos en som bød
    // lavt er derfor nesten ingen informasjon — hun kan ha vært forsiktig.
    // Første utkast brukte en fjerdedel og ga −5,37 for en 6-4-hånd på bud 7,
    // altså exp(−5,37) ≈ 1/200. Det er å påstå noe dataen ikke sier.
    // En svak hånd på et HØYT bud er derimot ekte usannsynlig, og straffes
    // fullt.
    const straff = (zed: number): number => (zed < 0 ? zed * zed : 0.1 * zed * zed);
    return -(straff(zL) + straff(zH));
  }
}
