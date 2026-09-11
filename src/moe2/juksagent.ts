/**
 * JUKSAGENTEN — TAKET FOR SLUTTSPILLET. MÅLEVERKTØY, ALDRI I APPEN.
 *
 * ARVIND: «hvorfor klarer den ikke å løse de siste 5 stikkene helt optimalt?
 * … får vi de 5 siste stikkene på plass så er vi i en god posisjon.»
 *
 * Før vi bruker uker på å løse delspillet, må vi vite hvor mye som ligger der.
 * Denne agenten svarer på det ved å JUKSE: fra `terskel` gjenstående stikk ser
 * den ALLE fire hendene og spiller det dobbelt-dummy-optimale kortet. Over
 * terskelen spiller det indre laget som vanlig.
 *
 * HVORFOR DETTE ER ET TAK. Ingen strategi som bare ser sin egen hånd kan slå
 * en som ser alle fire. Måler juksing fra 5 stikk +0,4 poeng per runde, er
 * 0,4 ALT som finnes å hente i de siste fem stikkene — en perfekt løser av
 * det imperfekte delspillet ville fått mindre, aldri mer.
 *
 * OG DET ER ET TAK, IKKE EN PROGNOSE. Juksing er strategifusjon satt i
 * system: den velger linjer som bare virker fordi den vet hvor kortene er.
 * Derfor er tallet romslig i vår favør, og det gjør det egnet til å STENGE
 * en retning: er taket lavt, er retningen død uansett hvor godt vi løser den.
 *
 * MERK FORSKJELLEN FRA `eks:`. `eks:` enumererer verdener fra VÅRT
 * informasjonsbilde og tar snittet — den jukser ikke, men lider av fusjon.
 * Denne jukser åpenlyst. Den ene er en kandidat, den andre er en målestokk.
 *
 * SPERRET FOR UTRULLING. `KREVER_FASIT = true` leses av
 * `test/ingen-juks-i-appen.test.ts`, som håndhever at verken `web/app.ts`
 * eller `web/worker.ts` refererer denne modulen.
 */

import { FARGER, likeKort, type Farge, type Kort } from "../kort.ts";
import type { GameState, Handling } from "../motor.ts";
import { kortTilInt, intTilKort, rotVerdier } from "../solver/dds.ts";
import { poengRotVerdier, type Poengmål } from "../solver/poengdds.ts";
import type { Innagent } from "./budmodell.ts";

/** Leses av vakttesten. Enhver modul som jukser må merke seg selv slik. */
export const KREVER_FASIT = true;

/**
 * ============ BRYTEREN: HVILKEN FASIT SONDEN SPØR ======================
 *
 * `dd` er NULLPUNKTET og standardverdien: dobbelt dummy på budlagets stikk,
 * bit-identisk med sonden slik den var før 8. august.
 * `test/juks-nullpunkt.test.ts` håndhever bit-identiteten.
 *
 * `egen` og `diff` går til `solver/poengdds.ts`, som gjør bakoverinduksjon på
 * SPILLERNES POENG i stedet. Les løsningsbegrepet i hodet på den fila før et
 * tall derfra tolkes som «optimalt»: det er en delspillperfekt likevekt i et
 * generell-sum-spill, ikke et minimax-optimum.
 *
 * BAKGRUNNEN (plan.md §114): `juks:6` med `dd` målte 0,1100 mot grunnlinjas
 * 0,2500. En bot som ser kortene spilte dramatisk verre, fordi den minimerte
 * budlagets stikk i tre av fire seter — og en forsvarer som minimerer føreren
 * kan gjøre det ved å gi stikket til den ANDRE forsvareren, og score null selv.
 */
export type Jukselmål = "dd" | Poengmål;

export interface Jukstelling {
  /** Stillinger der juksing var i vinduet og faktisk ble regnet ut. */
  løst: number;
  /** Stillinger der fasiten valgte et ANNET kort enn det indre laget. */
  overstyrt: number;
  msTotalt: number;
}

export class Juksagent implements Innagent {
  private readonly indre: Innagent;
  private readonly terskel: number;
  private readonly mål: Jukselmål;
  readonly telling: Jukstelling = { løst: 0, overstyrt: 0, msTotalt: 0 };

  constructor(indre: Innagent, terskel: number, mål: Jukselmål = "dd") {
    this.indre = indre;
    this.terskel = terskel;
    this.mål = mål;
  }

  nyKamp(): void {
    this.indre.nyKamp?.();
  }

  /** Videresender bokføringskroken (12. sep) — se `Budagent.observer`. */
  observer(state: GameState): void {
    (this.indre as { observer?(s: GameState): void }).observer?.(state);
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    if (h.type !== "SPILL") return h;

    const igjen = state.hender[h.spiller]?.length ?? 0;
    if (igjen === 0 || igjen > this.terskel) return h;
    if (state.trumf === null) return h;

    const t0 = performance.now();
    const kort =
      this.mål === "dd" ? fasitKort(state, h.spiller) : poengfasitKort(state, h.spiller, this.mål);
    this.telling.msTotalt += performance.now() - t0;
    if (kort === null) return h;

    this.telling.løst++;
    if (likeKort(kort, h.kort)) return h;
    this.telling.overstyrt++;
    return { type: "SPILL", spiller: h.spiller, kort };
  }
}

/**
 * Det dobbelt-dummy-beste kortet for `sete`, med alle hender åpne.
 *
 * `rotVerdier` gir stikk for BUDLAGET. Sitter setet i forsvaret, er det beste
 * kortet det som MINIMERER det tallet — ikke det som maksimerer det.
 */
export function fasitKort(state: GameState, sete: number): Kort | null {
  const N = state.antallSpillere;
  const trumf = state.trumf as Farge;
  const trumfIdx = FARGER.indexOf(trumf);

  const hender: number[][] = [];
  for (let p = 0; p < N; p++) {
    const hånd = state.hender[p];
    if (!hånd || hånd.length === 0) return null;
    hender.push(hånd.map(kortTilInt));
  }

  // Budlaget: budvinner og – når den er kjent – makkeren. Er makkeren ikke
  // avslørt ennå, kjenner MOTOREN den likevel, og fasiten skal ha den: dette
  // er et tak, ikke en spiller.
  const declLag = new Array<boolean>(N).fill(false);
  if (state.budvinner === null) return null;
  declLag[state.budvinner] = true;
  if (state.makker !== null && state.makker !== state.budvinner) declLag[state.makker] = true;

  const bord = state.bord.map((b) => ({ spiller: b.spiller, kort: kortTilInt(b.kort) }));
  let declStikkFør = 0;
  for (let p = 0; p < N; p++) if (declLag[p]) declStikkFør += state.stikkVunnet[p] ?? 0;

  const verdier = rotVerdier({
    N,
    trump: trumfIdx,
    declLag,
    hender,
    iTur: sete,
    bord,
    declStikkFør,
    ferdigeStikk: state.stikkSpilt,
    totalStikk: state.giving.antallStikk,
  });
  if (verdier.length === 0) return null;

  const vilHa = declLag[sete] === true;
  let best = verdier[0]!;
  for (const v of verdier) {
    if (vilHa ? v.lagStikk > best.lagStikk : v.lagStikk < best.lagStikk) best = v;
  }
  return intTilKort(best.kort);
}

/**
 * Det POENGBESTE kortet for `sete`, med alle hender åpne.
 *
 * Forskjellen fra `fasitKort` er ikke en knott, det er et annet spill:
 * `poengRotVerdier` fører fire poengfunksjoner samtidig gjennom
 * bakoverinduksjonen og lar hvert sete maksimere SIN egen. Løsningsbegrepet
 * (delspillperfekt likevekt, ikke minimax, ikke entydig) står i hodet på
 * `solver/poengdds.ts` og må leses før tallene tolkes.
 *
 * Merk at makkeren hentes fra motoren selv om den ikke er avslørt: dette er et
 * tak, ikke en spiller.
 */
export function poengfasitKort(state: GameState, sete: number, mål: Poengmål): Kort | null {
  const N = state.antallSpillere;
  if (state.budvinner === null || state.melding === null || state.trumf === null) return null;
  const trumfIdx = FARGER.indexOf(state.trumf as Farge);

  const hender: number[][] = [];
  for (let p = 0; p < N; p++) {
    const hånd = state.hender[p];
    if (!hånd || hånd.length === 0) return null;
    hender.push(hånd.map(kortTilInt));
  }

  const svar = poengRotVerdier({
    N,
    trump: trumfIdx,
    hender,
    iTur: sete,
    bord: state.bord.map((b) => ({ spiller: b.spiller, kort: kortTilInt(b.kort) })),
    stikkFør: state.stikkVunnet.slice(),
    ferdigeStikk: state.stikkSpilt,
    totalStikk: state.giving.antallStikk,
    budvinner: state.budvinner,
    makker: state.makker,
    melding: state.melding,
    målPoeng: state.regler.målPoeng,
    mål,
  });
  if (svar.verdier.length === 0) return null;

  let best = svar.verdier[0]!;
  for (const v of svar.verdier) if (v.verdi > best.verdi) best = v;
  return intTilKort(best.kort);
}
