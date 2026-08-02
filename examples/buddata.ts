/**
 * TRENINGSDATA FOR BUDET: hånd → forventet poeng for hver handling.
 *
 *   node examples/buddata.ts --skard 0/8 --hender 4000 --trekninger 24
 *
 * ARVINDS KRAV, ordrett: «vi må kunne regne ut hva som er best å by basert på
 * hvilken hånd man har … gjette hvor mange stikk makker kan bidra med, hva vi
 * kan vrake eller få i talongen, hvordan forsvarernes kort er fordelt … slik
 * at man tar kalkulerte risikoer som lønner seg i det lange løpet.»
 *
 * DE TRE UKJENTE GJETTES IKKE HVER FOR SEG – DE INTEGRERES BORT. For hver hånd
 * holdes de 12 kortene faste (det er alt setet vet) og de 40 andre deles ut på
 * nytt K ganger. Talongen, makkerkortets plassering og forsvarernes fordeling
 * varierer da fritt over presis den fordelingen de faktisk har. Snittet over
 * trekningene ER forventningsverdien; ingen egen modell for makkeren trengs,
 * og en slik modell kunne uansett bare vært dårligere enn å regne eksakt.
 *
 * HVORFOR MÅLET IKKE ER «FORVENTEDE STIKK». `src/moe2/handnett.ts` sikter mot
 * SD-orakelets lagstikktall. Det er en god størrelse, men det er feil mål for
 * et bud, av to grunner:
 *
 *   1. UTBETALINGEN ER ASYMMETRISK. Klarer du n får du +2n, bommer du −2n.
 *      To hender med samme forventning på 9,2 stikk, men ulik SPREDNING,
 *      fortjener ulikt bud. Forventningen kjenner ikke spredningen.
 *   2. BUDRUNDEN FINNES. `analyse/budhandling.txt` målte at bud 7 vinner
 *      kontrakten 0 % av gangene – man blir alltid overbudt. Et mål som ikke
 *      ser budrunden anbefaler bud som ikke lar seg avgi.
 *
 * Målet her er derfor det eneste som virkelig teller: FORVENTET POENG for
 * hver handling setet kan velge, med budrunden og hele runden spilt ut.
 *
 * HANDLINGENE er «pass» og «åpne på n, og pass resten av budrunden». Det er en
 * policy vi faktisk kan implementere, så målingen og agenten er den samme
 * tingen – ikke to ting som kan gli fra hverandre.
 *
 * OMFANG, og det skal stå her: bare setets FØRSTE budbeslutning måles, og
 * setet er alltid første budgiver. Da er inngangen en ren funksjon av hånd,
 * plassering og regler – det finnes ingen tidligere budrunde som kunne vært
 * en annen i hver trekning. Senere budbeslutninger («den står i 9, skal jeg
 * si 10?») er IKKE dekket, og et nett trent her skal ikke brukes til dem uten
 * at det måles for seg.
 *
 * INNGANGEN er `handTrekk` (105 trekk), som allerede er strengt lovlig og har
 * permutasjonstesten i `test/moe2-handtrekk.test.ts`: bytt om motstandernes
 * kort og talongen, og vektoren skal være bit-identisk.
 *
 * Skrives linje for linje til fil. En kjøring på timer skal koste den siste
 * linjen ved avbrudd, ikke alt.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, nyStokk, stokk, kortId, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { handTrekk, HAND_DIM } from "../src/moe2/handtrekk.ts";

let hender = 4000;
let trekninger = 24;
/** null = bruk håndfrøet, altså gammel oppførsel. Se kommentaren ved `rng`. */
let trekkFrø: number | null = null;
let skardI = 0;
let skardN = 1;
/**
 * Frøbåndet ligger langt unna alle de andre: SD-orakelet på 50/70 mill.,
 * håndvurderingen på 60/61 mill., speilbenken på 42 mill. Ingen giv et nett
 * er trent på skal kunne dukke opp i en måling.
 */
let frøBase = 120_000_000;
let kandidatSpek = "vakt:ab:e1:e1-modell/sd-r2.bin";
let ut: string | null = null;
/** Handlingene. 0 = pass; ellers åpningsbudet. */
const BUD = [7, 8, 9, 10, 11];

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--hender") hender = Number(process.argv[++i]);
  else if (a === "--trekninger") trekninger = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--trekkfroe") trekkFrø = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i] ?? null;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}
const utFil = ut ?? `bud-data/skard-${skardI}.jsonl`;
mkdirSync(dirname(utFil), { recursive: true });

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
const nevro = new NevroAgent();
function lagKandidat(spec: string): () => Velger {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return () => new Konvensjonsvakt(indre(), vakt.valg);
  }
  if (spec === "nevro") return () => new NevroAgent();
  if (spec.startsWith("e1:")) {
    const nett = lesE1Nett(spec.slice(3));
    return () => new E1Agent(nett);
  }
  throw new Error("ukjent agentspesifikasjon: " + spec);
}
const lagBot = lagKandidat(kandidatSpek);

/** Ny giv der `sete` beholder hånden sin og de 40 andre kortene stokkes om. */
function omtrekk(mal: GameState, sete: number, hånd: readonly Kort[], rng: () => number): GameState {
  const mine = new Set(hånd.map(kortId));
  const resten = stokk(
    nyStokk().filter((k) => !mine.has(kortId(k))),
    rng,
  );
  const hender2 = mal.hender.map((h, i) => (i === sete ? hånd.slice() : h.slice()));
  let j = 0;
  for (let p = 0; p < mal.antallSpillere; p++) {
    if (p === sete) continue;
    hender2[p] = resten.slice(j, j + (mal.hender[p] ?? []).length);
    j += (mal.hender[p] ?? []).length;
  }
  return { ...mal, hender: hender2, talong: resten.slice(j, j + mal.giving.talong) };
}

/**
 * Spiller runden ut. `mittBud = null` betyr pass hele veien. Blir setet
 * OVERBUDT, spilles runden ferdig med setet som forsvarer og poengene teller
 * likevel – risikoen for å miste kontrakten er en ekte kostnad ved å by lavt,
 * og den skal ligge inne i tallet.
 */
function spillHandling(giv: GameState, sete: number, mittBud: number | null): number[] | null {
  let s = giv;
  let harBydd = false;
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    if (s.iTur === null) break;
    if (s.iTur === sete) {
      const lov = lovligeHandlinger(s);
      const kanBy =
        !harBydd && mittBud !== null && lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === mittBud);
      if (kanBy) {
        harBydd = true;
        s = utfør(s, { type: "BUD", spiller: sete, bud: mittBud }).state;
      } else {
        s = utfør(s, { type: "BUD", spiller: sete, bud: "PASS" }).state;
      }
    } else {
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;

  /**
   * KORTSPILLET GJØRES AV KANDIDATEN I ALLE FIRE SETENE.
   *
   * Første versjon satte NevroHjerne i de tre andre. Arvind fanget det: da
   * møter kontraktene et forsvar som er svakere enn noe vi faktisk spiller
   * mot, og hver eneste EV blir blåst opp. Verre er at skjevheten ikke er
   * jevn – den er størst for de høye budene, som er nettopp dem som lever av
   * at forsvaret bommer. Tabellen ville altså anbefalt for høye bud.
   *
   * Budrunden i de andre setene er fortsatt NevroHjerne, og det er ikke en
   * forglemmelse: budrunden ER NevroHjerne også i vår beste bot. Det er selve
   * hullet disse dataene finnes for å tette.
   */
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  // HELE poengvektoren, ikke bare vaar egen. Arvind: «det er ikke bare
  // poengene dine som teller, men ogsaa at du straffer motstanderne». Et bud
  // som gir oss 5 og motstanderne 2 er bedre enn ett som gir oss 6 og dem 8,
  // og egne poeng alene kan ikke skille de to. Med vektoren lagret kan BEGGE
  // maal regnes ut i ettertid uten aa generere dataene paa nytt.
  return [0, 1, 2, 3].map((p) => s.totalPoeng[p] ?? 0);
}

/**
 * TREKNINGSFRØET ER SKILT FRA HÅNDFRØET, og det er hele poenget med
 * `--trekkfroe`.
 *
 * Uten skillet seeder samme tall både hvilke HENDER som lages og hvilke
 * VERDENER som trekkes til dem. To kjøringer gir da enten identiske data
 * eller helt ulike hender – aldri de samme hendene med UAVHENGIGE trekninger.
 *
 * Det siste er nødvendig for å måle hvor mye et bedre μ er verdt. `ev[N]` er
 * et snitt over 24 trekninger, altså støyete, og argmax over det per hånd gir
 * vinnerens forbannelse. Prosjektet har allerede blitt lurt av den én gang:
 * «+1,18 i budhodrom» var ren argmax-støy, og splitt-halv målte −0,825.
 *
 * Med to uavhengige sett kan budet VELGES på sett A og LESES AV på sett B.
 * Da er tallet forventningsrett, og differansen til modellens eget valg er
 * det ekte rommet en perfekt håndvurdering ville hentet.
 */
const rng = lagRng(((trekkFrø ?? frøBase) + skardI * 7919) >>> 0);
const t0 = Date.now();
let skrevet = 0;

for (let h = 0; h < hender; h++) {
  if (h % skardN !== skardI) continue;
  const mal = opprettSpill({ antallSpillere: 4 }, (frøBase + h) >>> 0);
  const sete = (mal.giver + 1) % mal.antallSpillere; // første budgiver
  const hånd = mal.hender[sete] ?? [];
  if (hånd.length === 0 || mal.fase !== "BUDRUNDE") continue;

  // Inngangen leses FØR noe skjer, på malstillingen: hånd, plassering, regler.
  const t = handTrekk(mal, sete);

  // De SAMME trekningene for alle handlingene. Ellers domineres forskjellen
  // mellom to bud av hvilke gir som tilfeldigvis ble trukket til hver av dem.
  const giver: GameState[] = [];
  for (let k = 0; k < trekninger; k++) giver.push(omtrekk(mal, sete, hånd, rng));

  /** Handling → forventede EGNE poeng. */
  const ev: Record<number, number> = {};
  /**
   * HALVDELENE. `diffA` regnes av de 12 første trekningene, `diffB` av de 12
   * siste – på nøyaktig samme hånd og samme handlinger.
   *
   * De finnes for å svare på om taket i det hele tatt er ekte. Velger man den
   * beste handlingen etter et STØYETE anslag, ser valget bedre ut enn det er:
   * man plukker like mye den heldigste målingen som den beste handlingen. Det
   * er vinnerens forbannelse, og den blåser opp ethvert «tak» regnet med
   * etterpåklokskap på de samme dataene.
   *
   * Velg på A, les av på B, og forbannelsen forsvinner: A-støyen er
   * uavhengig av B. Faller taket sammen da, var det aldri der.
   */
  const diffA: Record<number, number> = {};
  const diffB: Record<number, number> = {};
  /** Handling → forventet DIFFERANSE: egne minus snittet av de tre andre. */
  const diff: Record<number, number> = {};
  const n: Record<number, number> = {};
  let mangler = false;
  for (const handling of [0, ...BUD]) {
    const p: number[] = [];
    const d: number[] = [];
    for (const giv of giver) {
      const r = spillHandling(giv, sete, handling === 0 ? null : handling);
      if (r === null) continue;
      const egne = r[sete]!;
      p.push(egne);
      d.push(egne - (r.reduce((a, x) => a + x, 0) - egne) / 3);
    }
    // En handling uten trekninger er ikke «verdi 0» – den er ukjent. Å skrive
    // en null der ville lært nettet at handlingen er middelmådig. Da droppes
    // hele hånden i stedet.
    if (p.length === 0) {
      mangler = true;
      break;
    }
    const halv = Math.floor(d.length / 2);
    const mid = (v: number[]): number => Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 1000) / 1000;
    if (halv >= 2) {
      diffA[handling] = mid(d.slice(0, halv));
      diffB[handling] = mid(d.slice(halv));
    }
    ev[handling] = Math.round((p.reduce((a, x) => a + x, 0) / p.length) * 1000) / 1000;
    diff[handling] = Math.round((d.reduce((a, x) => a + x, 0) / d.length) * 1000) / 1000;
    n[handling] = p.length;
  }
  if (mangler) continue;

  appendFileSync(
    utFil,
    JSON.stringify({
      t: Array.from(t, (x) => Math.round(x * 10_000) / 10_000),
      ev,
      diff,
      diffA,
      diffB,
      n,
      trekninger,
      frø: (frøBase + h) >>> 0,
      sete,
      kandidat: kandidatSpek,
    }) + "\n",
  );
  skrevet++;
  if (skrevet % 10 === 0) {
    const s = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  skard ${skardI}: ${skrevet} hender, ${s.toFixed(0)}s, ${(skrevet / Math.max(1, s)).toFixed(2)}/s   `,
    );
  }
}

console.log(
  `\nSkard ${skardI} ferdig: ${skrevet} hender à ${HAND_DIM} trekk, ` +
    `${trekninger} trekninger per handling → ${utFil}`,
);
