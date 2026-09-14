/**
 * ER SLUTTSPILLSFASITEN FLAT NÅR DEN MÅLES I SEIERSANNSYNLIGHET?
 *
 * `troledd.md` §2 målte at fasiten er FLAT i 88 % av sluttspillstillingene: hvert
 * lovlig kort gir samme rundepoeng, og `dekomp.md` §6 bygget «sluttspillet er dødt»
 * blant annet på det tallet. Men målet er å vinne løpet til 100, ikke å samle poeng.
 *
 * DENNE FILA MÅLER DE SAMME STILLINGENE MED EN ANNEN LINJAL. Den er en utvidelse av
 * `examples/troledd-fasitspredning.ts` — samme stillingsfilter, samme frø, samme
 * agentstrøm — men i stedet for bare å lese `verdi` (måltallet), leser den HELE
 * poengvektoren løseren alt returnerer og gjør den om til P(vinne kampen).
 *
 * ================= HVORFOR DET KAN GI ET ANNET SVAR ======================
 *
 * `måltall` (`poengdds.ts:167`) komprimerer vektoren til én skalar:
 *
 *     diff = egne − (Σ alle − egne) / (N − 1)
 *
 * Bytter to ANDRE seter ett stikk seg imellom, står `egne` stille OG `Σ andre` stille.
 * `diff` er da bit-identisk mens vektoren er en annen — og seiersannsynligheten bryr
 * seg om vektoren, fordi det betyr noe HVEM av motstanderne som nærmer seg 100.
 * Derfor rapporteres «flat i vektor» også: det er mellomleddet som avgjør om
 * mekanismen har noe å jobbe med i det hele tatt.
 *
 * ================= INGEN NY SØKETID ======================================
 *
 * Fasiten regnes uansett (`poengRotVerdier`), og `Poengverdi.poeng` er alt med i svaret.
 * Konverteringen er ett framoverpass gjennom et 9→64→64→4-nett per kandidatkort.
 *
 * K2: prediktoren ser bare `seierTrekk(poeng, sete, målPoeng)` — poengtavla og målet.
 * Ikke ett kort, verken skjult eller åpent.
 *
 * ================= REPRODUKSJONSKONTROLL =================================
 *
 *   node examples/seiersmaal-fasit.ts --kamper 1 --runder 2 --tak 7 --froe 13000777
 *
 * skal gi NØYAKTIG «37 av 42» flate i poeng — samme stillinger som `troledd.md` §2.
 * Gjør den ikke det, måler denne fila noe annet enn grunnlinja, og tallene er ugyldige.
 *
 * Bruk:
 *   node examples/seiersmaal-fasit.ts --kamper 20 --runder 40 --tak 7 \
 *        --ut analyse/seiersmaal-w0.jsonl [--skard 0/3] [--spek <policy>]
 */
import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { lovligeKort } from "../src/motor.ts";
import { FARGER } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { kortTilInt, intTilKort } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const KAMPER = tall(arg("--kamper", "1"), 1, "kamper");
const RUNDER = tall(arg("--runder", "2"), 2, "runder");
const TAK = tall(arg("--tak", "7"), 7, "tak");
const FRØ = tall(arg("--froe", "13000777"), 13_000_777, "froe");
const SPEK = arg("--spek", ADAMS_MAALT);
const SEIER = arg("--seier", "e1-modell/seier-g0.bin");
const UT = arg("--ut", "");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];

const pred = Seiersprediktor.fraFil(SEIER);
if (UT !== "") mkdirSync(dirname(UT), { recursive: true });

/** `kampvinner` fra `src/motor.ts` — ved likhet vinner budgiversiden. Må stemme EKSAKT. */
function kampvinnerAv(
  total: readonly number[],
  mål: number,
  budvinner: number | null,
  makker: number | null,
): number | null {
  const kand: number[] = [];
  for (let i = 0; i < total.length; i++) if ((total[i] ?? 0) >= mål) kand.push(i);
  if (kand.length === 0) return null;
  if (budvinner !== null && kand.includes(budvinner)) return budvinner;
  if (makker !== null && kand.includes(makker)) return makker;
  let best = kand[0]!;
  for (const k of kand) if ((total[k] ?? 0) > (total[best] ?? 0)) best = k;
  return best;
}

/** P(setet vinner kampen) etter runden. Er kampen over, er det fasiten 1 eller 0. */
function pSeier(
  tavle: readonly number[],
  sete: number,
  mål: number,
  budvinner: number | null,
  makker: number | null,
): number {
  const v = kampvinnerAv(tavle, mål, budvinner, makker);
  if (v !== null) return v === sete ? 1 : 0;
  return pred.sjanse(tavle, sete, mål);
}

/**
 * `utvidRepresentanter` fra `src/solver/eksakt.ts`, samme regel som `klasserIFarge`.
 * `poengRotVerdier` gir BARE det høyeste kortet i hver rekke av egne kort som er
 * naboer blant kortene i spill. Uten dette står de lave kortene uten verdi, og en
 * anger regnet på resten ville vært en stille skjevhet.
 */
function utvid<T>(
  rep: ReadonlyMap<number, T>,
  lovlige: readonly number[],
  hender: readonly (readonly number[])[],
  bord: readonly { readonly kort: number }[],
  observator: number,
): Map<number, T> {
  const iSpill = new Set<number>();
  for (const h of hender) for (const c of h) iSpill.add(c);
  for (const b of bord) iSpill.add(b.kort);
  const egne = new Set(hender[observator] ?? []);
  const ut = new Map<number, T>();
  for (const c of lovlige) {
    const direkte = rep.get(c);
    if (direkte !== undefined) {
      ut.set(c, direkte);
      continue;
    }
    const f = Math.floor(c / 13);
    for (let r = (c % 13) + 1; r <= 12; r++) {
      const k = f * 13 + r;
      if (!iSpill.has(k)) continue;
      if (!egne.has(k)) break;
      const v = rep.get(k);
      if (v !== undefined) {
        ut.set(c, v);
        break;
      }
    }
  }
  return ut;
}

const agenter = [0, 1, 2, 3].map(() => lagIndre(SPEK));

let ialt = 0;
let flatePoeng = 0;
let flateP = 0;
const t0 = Date.now();

for (let g = 0; g < KAMPER; g++) {
  if (g % SN !== SI) continue;
  const frø = FRØ + g * 7717;
  for (const a of agenter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
  let vakt = 0;
  let r = 0;

  while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;

    // Botens handling hentes FØR målingen, så agentstrømmen er den samme som i
    // `troledd-fasitspredning.ts`: nøyaktig ett `velgHandling` per tilstand.
    const h = agenter[iTur]!.velgHandling(s);

    if (
      s.fase === "SPILL" &&
      s.iTur !== null &&
      s.trumf !== null &&
      s.budvinner !== null &&
      s.melding !== null
    ) {
      const sete = s.iTur;
      const igjen = s.hender[sete]?.length ?? 0;
      const lovKort = lovligeKort(s, sete);
      if (igjen > 0 && igjen <= TAK && s.hender.every((x) => x.length > 0) && lovKort.length >= 2) {
        const hender = s.hender.map((x) => x.map(kortTilInt));
        const bord = s.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) }));
        const svar = poengRotVerdier({
          N: s.antallSpillere,
          trump: FARGER.indexOf(s.trumf),
          hender,
          iTur: sete,
          bord,
          stikkFør: s.stikkVunnet.slice(),
          ferdigeStikk: s.stikkSpilt,
          totalStikk: s.giving.antallStikk,
          budvinner: s.budvinner,
          makker: s.makker,
          melding: s.melding,
          målPoeng: s.regler.målPoeng,
          mål: "diff",
        });

        const rep = new Map<number, { poeng: readonly number[]; verdi: number }>();
        for (const v of svar.verdier) rep.set(v.kort, { poeng: v.poeng, verdi: v.verdi });
        const lovlige = lovKort.map(kortTilInt);
        const full = utvid(rep, lovlige, hender, bord, sete);

        // Et lovlig kort uten verdi ville gjort både spredning og anger skjeve.
        const mangler = lovlige.filter((c) => !full.has(c));
        if (mangler.length > 0) {
          throw new Error(
            `klasseutvidelsen er feil: ${mangler.map((c) => JSON.stringify(intTilKort(c))).join(", ")} uten verdi`,
          );
        }

        const mål = s.regler.målPoeng;
        const tavleFør = s.totalPoeng.slice();
        const rader = lovlige.map((c) => {
          const d = full.get(c)!;
          const tavle = tavleFør.map((p, i) => p + (d.poeng[i] ?? 0));
          return {
            kort: c,
            verdi: d.verdi,
            poeng: d.poeng,
            // I PROSENTPOENG, som resten av prosjektet.
            P: 100 * pSeier(tavle, sete, mål, s.budvinner, s.makker),
          };
        });

        const verdier = rader.map((x) => x.verdi);
        const Per = rader.map((x) => x.P);
        const spredPoeng = Math.max(...verdier) - Math.min(...verdier);
        const spredP = Math.max(...Per) - Math.min(...Per);

        // Er selve poengVEKTOREN flat? Mellomleddet mekanismen hviler på.
        const nøkler = new Set(rader.map((x) => x.poeng.join(",")));
        const vektorFlat = nøkler.size === 1;

        const maksV = Math.max(...verdier);
        const maksP = Math.max(...Per);
        const argmaksPoeng = rader.find((x) => x.verdi === maksV)!.kort;
        const argmaksP = rader.find((x) => x.P === maksP)!.kort;

        const botKort = h.type === "SPILL" ? kortTilInt(h.kort) : -1;
        const bot = botKort >= 0 ? full.get(botKort) : undefined;
        const botP = bot === undefined ? null : 100 * 0 + rader.find((x) => x.kort === botKort)!.P;
        const botV = bot === undefined ? null : bot.verdi;

        ialt++;
        if (spredPoeng < 1e-9) flatePoeng++;
        if (spredP < 0.01) flateP++;

        const rad = {
          kamp: g,
          runde: r,
          stikk: s.stikkSpilt,
          sete,
          rolle: rolleFor(s, sete),
          igjen,
          nLov: lovlige.length,
          nKlasser: svar.verdier.length,
          tavle: tavleFør,
          maalPoeng: mål,
          ledende: Math.max(...tavleFør),
          spredPoeng,
          spredP,
          vektorFlat,
          botKort,
          botV,
          botP,
          maksV,
          maksP,
          minP: Math.min(...Per),
          argmaksPoeng,
          argmaksP,
          // Ville en seierslinjal valgt et ANNET kort enn poenglinjalen?
          byttet: argmaksPoeng !== argmaksP,
          angerPoeng: spredPoeng < 1e-9 || botV === null ? null : maksV - botV,
          angerP: spredP < 0.01 || botP === null ? null : maksP - botP,
          P: Per,
          V: verdier,
        };
        if (UT !== "") appendFileSync(UT, `${JSON.stringify(rad)}\n`);
      }
    }
    s = utfør(s, h).state;
  }
}

const sek = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nFLATE (diff):  ${flatePoeng} av ${ialt} stillinger har spredning 0`);
console.log(`FLATE (seier): ${flateP} av ${ialt} stillinger har spredning < 0,01 pp`);
console.log(`${KAMPER} kamper x ${RUNDER} runder, tak ${TAK}, ${sek} s${UT === "" ? "" : `, skrevet til ${UT}`}`);
