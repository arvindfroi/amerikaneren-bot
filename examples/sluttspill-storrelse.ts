/**
 * HVOR STORT ER SLUTTSPILLET EGENTLIG?
 *
 * ARVIND: «hvorfor klarer den ikke å løse de siste 5 stikkene helt optimalt?
 * den burde jo det. den må bare ha dybde og bredde.»
 *
 * Innvendingen er riktig, og den peker på en feil jeg gjorde: jeg målte
 * størrelsen på FEIL regnestykke.
 *
 *   `eks:` løser N åpne-kort-spill og tar snittet. Det er PIMC med full
 *   enumerasjon i stedet for sampling – strategifusjonen står urørt. Hver
 *   verden får sitt eget optimale svar, som om vi fikk vite hvilken verden vi
 *   er i før neste kort.
 *
 *   Å LØSE de siste k stikkene betyr noe annet: finne ÉN strategi som er en
 *   funksjon av det vi faktisk ser (informasjonsmengden), ikke av verdenen.
 *   Det er et likevektsproblem, ikke et søkeproblem.
 *
 * Denne filen måler de tre tallene som avgjør om det er mulig:
 *
 *   VERDENER    hvor mange fordelinger av de skjulte kortene som er mulige
 *   NODER       størrelsen på spilltreet i ÉN verden
 *   HISTORIKKER hvor mange offentlige forløp som finnes (infosett-aksen)
 *
 * Kostnaden for en CFR-løsning av delspillet er omtrent
 * `iterasjoner × verdener × noder`. Alt annet er detaljer.
 *
 * Målt på EKTE stillinger fra motoren – ikke konstruerte – slik at
 * fargefordelingen og følg-farge-bindingene er representative.
 */

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import type { Farge, Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";

const MAKS_K = Number(process.argv[2] ?? 5);
const GIVER = Number(process.argv[3] ?? 12);

/** Stikkvinner: høyeste trumf, ellers høyeste i ledfarge. */
function vinner(bord: readonly { kort: Kort; spiller: number }[], trumf: Farge | null): number {
  let best = 0;
  for (let i = 1; i < bord.length; i++) {
    const a = bord[best]!.kort;
    const b = bord[i]!.kort;
    if (b.farge === a.farge) {
      if (b.verdi > a.verdi) best = i;
    } else if (trumf !== null && b.farge === trumf) {
      best = i;
    }
  }
  return bord[best]!.spiller;
}

/** Lovlige kort sent i spillet: følg farge om du kan, ellers alt. */
function lovlig(hånd: Kort[], led: Farge | null): Kort[] {
  if (led === null) return hånd;
  const følg = hånd.filter((k) => k.farge === led);
  return følg.length > 0 ? følg : hånd;
}

/**
 * Teller noder og blader i det åpne treet, og de DISTINKTE offentlige
 * forløpene. To ulike kort med samme rolle gir ulike forløp, så dette er et
 * øvre tak på infosett-aksen.
 */
function tell(hender: Kort[][], trumf: Farge | null, utspiller: number) {
  let noder = 0;
  let blader = 0;

  function gå(h: Kort[][], iTur: number, bord: { kort: Kort; spiller: number }[]) {
    noder++;
    if (h.every((x) => x.length === 0) && bord.length === 0) {
      blader++;
      return;
    }
    const led = bord.length > 0 ? bord[0]!.kort.farge : null;
    for (const k of lovlig(h[iTur]!, led)) {
      const nyH = h.map((x, i) => (i === iTur ? x.filter((c) => c !== k) : x));
      const nyBord = [...bord, { kort: k, spiller: iTur }];
      if (nyBord.length === 4) {
        gå(nyH, vinner(nyBord, trumf), []);
      } else {
        gå(nyH, (iTur + 1) % 4, nyBord);
      }
    }
  }

  gå(hender, utspiller, []);
  // Det fulle forløpet bestemmer historikken entydig, så antall distinkte
  // offentlige forløp ER bladtallet. Målt likt for k=1..4 før forenklingen.
  return { noder, blader, historikker: blader };
}

/** (3k)! / (k!)^3 – fordelinger av de skjulte kortene på tre motstandere. */
function verdener(k: number): number {
  let x = 1;
  for (let i = 1; i <= 3 * k; i++) x *= i;
  let f = 1;
  for (let i = 1; i <= k; i++) f *= i;
  return x / f ** 3;
}

console.log(`# sluttspillets stoerrelse, ekte stillinger, ${GIVER} givere per k`);
console.log("k\tverdener\tnoder\tblader\thistorikker\tstillinger");

for (let k = 1; k <= MAKS_K; k++) {
  let n = 0;
  let sumNoder = 0;
  let sumBlad = 0;
  let sumHist = 0;

  for (let g = 0; g < GIVER; g++) {
    const ag = [0, 1, 2, 3].map(() => new NevroAgent());
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_100_000 + g * 7717);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      // Ved starten av et stikk med nøyaktig k kort igjen på hver hånd.
      if (s.fase === "SPILL" && s.bord.length === 0 && (s.hender[0]?.length ?? 0) === k) {
        const r = tell(
          s.hender.map((h) => [...h]),
          s.trumf,
          s.iTur ?? 0,
        );
        sumNoder += r.noder;
        sumBlad += r.blader;
        sumHist += r.historikker;
        n++;
        break;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, ag[iTur]!.velgHandling(s)).state;
    }
  }

  if (n === 0) {
    console.log(`${k}\t-\t-\t-\t-\t0`);
    continue;
  }
  const e = (x: number) => (x / n).toExponential(2);
  console.log(
    `${k}\t${verdener(k).toExponential(2)}\t${e(sumNoder)}\t${e(sumBlad)}\t${e(sumHist)}\t${n}`,
  );
}
