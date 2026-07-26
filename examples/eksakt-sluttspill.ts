/**
 * HVOR DYPT KAN VI SPILLE BEVISELIG OPTIMALT?
 *
 *   node examples/eksakt-sluttspill.ts --givere 40 --maksstikk 6 \
 *        --ut analyse/eksakt-sluttspill
 *
 * SPØRSMÅLET. Dobbelt dummy er målt til å være FEIL fasit for kortspillet
 * (−0,609 korrigert korrelasjon mot poeng): den løser én verden der alle fire
 * hender er åpne, og forutsetter dermed informasjon vi ikke har. Men sent i
 * runden krymper den skjulte informasjonen. Når få nok kort er usett kan vi
 * enumerere ALLE verdener som er forenlige med det setet faktisk har sett, og
 * løse hver eksakt. Da er snittet den EKSAKTE PIMC-verdien gitt vår virkelige
 * informasjon – ikke et sampleestimat av den, og ikke en DD-verdi som jukser.
 *
 * DENNE MÅLINGEN svarer på tre ting, per antall gjenstående stikk:
 *
 *   1. hvor mange verdener er forenlige med informasjonen (median og p90),
 *   2. hvor mange KONFIGURASJONER enumerasjonen faktisk må besøke – det er
 *      verdener modulo ekvivalensklasser, og det er dette som koster,
 *   3. hva full enumerasjon + eksakt løsning av hver verden koster i ms.
 *
 * KONTROLLEN SOM SKILLER FULL ENUMERASJON FRA SAMPLING I FORKLEDNING.
 * `enumerer` summerer vekten av hver konfigurasjon; `tellVerdener` teller det
 * samme rommet uavhengig, med dynamisk programmering kort for kort. Er de to
 * ikke bit for bit like, er enumerasjonen ufullstendig eller vektene gale, og
 * da er «eksakt» bare et ord. Antall avvik rapporteres, og skal være 0.
 *
 * INFORMASJONSBILDET er `sampler.ts` sitt, uendret: egen hånd, alle spilte
 * kort, håndstørrelser, renonse-inferens fra fargesvikt, det etterlyste kortet
 * hos en levende motspiller, og eget vrak når observatøren er budvinner.
 *
 * Stillingene hentes fra ekte spill: NevroHjerne i alle seter, og HVERT
 * kortvalg i sluttspillet måles – for alle fire setene, ikke bare ett, siden
 * budvinneren har et helt annet informasjonsbilde (han kjenner sitt eget vrak)
 * enn de tre andre.
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--givere` | 40 | antall givinger som spilles gjennom |
 * | `--maksstikk` | 6 | mål stillinger med opptil så mange stikk igjen |
 * | `--maksconf` | 400000 | tak på konfigurasjoner; over det er enumerasjonen ikke full |
 * | `--froe` | 4200000 | frøbase |
 * | `--verdi` | – | komma-liste med JSON fra `sd-parret-rapport.ts`: hva terskelen er VERDT |
 * | `--fra` | – | regn rapporten på nytt fra en tidligere kjørings `.json` uten å måle om |
 * | `--ut` | analyse/eksakt-sluttspill | skriver `.txt` og `.json` |
 *
 * `--fra` finnes fordi målingen tar tjue minutter mens poengtallene den skal
 * stå sammen med kommer inn etterpå. Rådataene (hver enkelt beslutning) ligger
 * i `.json`, så rapporten kan bygges om uten å måle om – samme skille mellom
 * varig logg og rapport som resten av prosjektet bruker.
 *
 * KOSTNADEN ER HALVE SVARET. Den andre halvdelen – hva metoden er verdt i
 * poeng – måles med `neat-evaluer.ts` og `sd-parret-rapport.ts`, og trekkes inn
 * hit med `--verdi` slik at kostnad og gevinst står i ÉN varig fil. En terskel
 * vi rekker innenfor tidsbudsjettet er ikke det samme som en terskel som
 * lønner seg, og de to tallene skal ikke ligge i hver sin rapport.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import {
  eksaktKortverdier,
  lesInformasjon,
  klasser,
  råAntall,
  tellKonfigurasjoner,
  tellVerdener,
} from "../src/solver/eksakt.ts";

function flagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  if (i < 0 || process.argv[i + 1] === undefined) return standard;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`Ugyldig verdi for --${navn}`);
  return v;
}
function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const givere = flagg("givere", 40);
const maksStikk = flagg("maksstikk", 6);
const maksConf = flagg("maksconf", 400_000);
const frøBase = flagg("froe", 4_200_000);
const utBase = tekstFlagg("ut", "analyse/eksakt-sluttspill");
const verdiFiler = tekstFlagg("verdi", "")
  .split(",")
  .map((x) => x.trim())
  .filter((x) => x.length > 0);

/** Én parret differanse mot grunnlinjen, slik `sd-parret-rapport.ts` skriver den. */
interface Verdilinje {
  readonly a: string;
  readonly b: string;
  readonly diff: number;
  readonly se: number;
  readonly tegn: string;
  readonly sigma: number;
}
interface Verdirapport {
  readonly kilde: string;
  readonly givere: number;
  readonly grunnlinje: string;
  readonly motGrunnlinje: Verdilinje[];
}
const verdier: Verdirapport[] = verdiFiler.map((f) => {
  const j = JSON.parse(readFileSync(f, "utf8")) as Omit<Verdirapport, "kilde">;
  return { kilde: f, givere: j.givere, grunnlinje: j.grunnlinje, motGrunnlinje: j.motGrunnlinje };
});

// --- Innsamling -------------------------------------------------------------

interface Punkt {
  /** Gjenstående stikk INKLUDERT det som er i gang. */
  readonly igjen: number;
  /** Antall usette kort (motspillerhender + evt. vrak). */
  readonly usett: number;
  /** Ekvivalensklasser blant de usette kortene. */
  readonly klasser: number;
  /** Forenlige verdener (DP-telling – fasiten). */
  readonly verdener: number;
  /** Uten renonse-inferens: hvor stort rommet ville vært. */
  readonly rå: number;
  /** Konfigurasjoner enumerasjonen besøkte. */
  readonly konf: number;
  /** Ble hele rommet dekket innenfor taket? */
  readonly full: boolean;
  /** Millisekunder for full enumerasjon + eksakt løsning av hver verden. */
  readonly ms: number;
  /** Stemte enumerasjonens vektsum med den uavhengige DP-tellingen? */
  readonly stemmer: boolean;
  /** Er observatøren budvinner (kjenner eget vrak – mindre skjult)? */
  readonly budvinner: boolean;
}

const fraSti = tekstFlagg("fra", "");
const punkter: Punkt[] = [];
const nevro = new NevroAgent();

if (fraSti !== "") {
  const j = JSON.parse(readFileSync(fraSti, "utf8")) as { punkter: Punkt[] };
  punkter.push(...j.punkter);
  process.stdout.write(`Gjenbruker ${punkter.length} målte beslutninger fra ${fraSti}\n`);
}

const startet = Date.now();
if (fraSti === "") process.stdout.write(`Samler stillinger fra ${givere} givinger …\n`);

for (let g = 0; fraSti === "" && g < givere; g++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + g);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const igjen = s.giving.antallStikk - s.stikkSpilt;
      if (igjen <= maksStikk) {
        const info = lesInformasjon(s, sete);
        const fasit = tellVerdener(info);
        const forhånd = tellKonfigurasjoner(info, maksConf);
        let ms = Number.NaN;
        let konf = forhånd.konfigurasjoner;
        let full = forhånd.full;
        let stemmer = forhånd.full && forhånd.verdener === fasit;
        if (forhånd.full) {
          const t0 = performance.now();
          const svar = eksaktKortverdier(s, sete, { maksKonfigurasjoner: maksConf });
          ms = performance.now() - t0;
          if (svar !== null) {
            konf = svar.enumerasjon.konfigurasjoner;
            full = svar.enumerasjon.full;
            stemmer = svar.enumerasjon.verdener === svar.fasitAntall;
          }
        }
        punkter.push({
          igjen,
          usett: info.usett.length,
          klasser: klasser(info).length,
          verdener: fasit,
          rå: råAntall(info),
          konf,
          full,
          ms,
          stemmer,
          budvinner: sete === s.budvinner,
        });
      }
    }
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  if ((g + 1) % 10 === 0) {
    const sek = ((Date.now() - startet) / 1000).toFixed(0);
    process.stdout.write(`  ${g + 1}/${givere} givinger, ${punkter.length} stillinger, ${sek}s\n`);
  }
}

// --- Statistikk -------------------------------------------------------------

function kvantil(xs: readonly number[], q: number): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i]!;
}

interface Rad {
  readonly igjen: number;
  readonly n: number;
  readonly usettMed: number;
  readonly klasserMed: number;
  readonly verdenerMed: number;
  readonly verdenerP90: number;
  readonly råMed: number;
  readonly konfMed: number;
  readonly konfP90: number;
  readonly msMed: number;
  readonly msP90: number;
  readonly msMaks: number;
  readonly fullAndel: number;
  readonly avvik: number;
  /** Andel av beslutningene som rakk innenfor hvert tidsbudsjett. */
  readonly under50: number;
  readonly under200: number;
  readonly under1000: number;
}

const rader: Rad[] = [];
for (let r = 1; r <= maksStikk; r++) {
  const p = punkter.filter((x) => x.igjen === r);
  if (p.length === 0) continue;
  const målte = p.filter((x) => Number.isFinite(x.ms));
  const ms = målte.map((x) => x.ms);
  const andelUnder = (grense: number): number =>
    p.length === 0 ? 0 : p.filter((x) => x.full && Number.isFinite(x.ms) && x.ms <= grense).length / p.length;
  rader.push({
    igjen: r,
    n: p.length,
    usettMed: kvantil(p.map((x) => x.usett), 0.5),
    klasserMed: kvantil(p.map((x) => x.klasser), 0.5),
    verdenerMed: kvantil(p.map((x) => x.verdener), 0.5),
    verdenerP90: kvantil(p.map((x) => x.verdener), 0.9),
    råMed: kvantil(p.map((x) => x.rå), 0.5),
    konfMed: kvantil(p.map((x) => x.konf), 0.5),
    konfP90: kvantil(p.map((x) => x.konf), 0.9),
    msMed: kvantil(ms, 0.5),
    msP90: kvantil(ms, 0.9),
    msMaks: ms.length > 0 ? Math.max(...ms) : Number.NaN,
    fullAndel: p.filter((x) => x.full).length / p.length,
    avvik: p.filter((x) => x.full && !x.stemmer).length,
    under50: andelUnder(50),
    under200: andelUnder(200),
    under1000: andelUnder(1000),
  });
}

const avvikTotalt = punkter.filter((x) => x.full && !x.stemmer).length;
const fulle = punkter.filter((x) => x.full).length;

// --- Rapport ----------------------------------------------------------------

const tall = (x: number): string => {
  if (!Number.isFinite(x)) return "–";
  if (x >= 1e9) return `${(x / 1e9).toFixed(1)}e9`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}e6`;
  if (x >= 1e4) return `${(x / 1e3).toFixed(0)}e3`;
  return x.toFixed(0);
};
const ms = (x: number): string => (Number.isFinite(x) ? x.toFixed(x < 10 ? 2 : 1) : "–");
const pst = (x: number): string => `${(100 * x).toFixed(0)} %`;

const linjer: string[] = [];
linjer.push("EKSAKT SLUTTSPILL – hvor dypt rekker full enumerasjon?");
linjer.push("");
linjer.push(
  `${givere} givinger, NevroHjerne i alle seter, ${punkter.length} sluttspillbeslutninger ` +
    `(alle fire seter), tak ${maksConf.toLocaleString("nb-NO")} konfigurasjoner.`,
);
linjer.push("");
linjer.push("«Verdener» = fordelinger forenlige med det setet har sett (DP-telling).");
linjer.push("«Rå» = det samme uten renonse-inferens – hvor mye informasjonen krymper rommet.");
linjer.push("«Konf» = klassekonfigurasjoner enumerasjonen faktisk løser. Det er DET som koster.");
linjer.push("ms = full enumerasjon + eksakt DD-løsning av HVER verden, for ett kortvalg.");
linjer.push("");
linjer.push(
  "| stikk igjen | n | usett | klasser | verdener med | verdener p90 | rå med | konf med | konf p90 | ms med | ms p90 | ms maks | full |",
);
linjer.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rader) {
  linjer.push(
    `| ${r.igjen} | ${r.n} | ${r.usettMed.toFixed(0)} | ${r.klasserMed.toFixed(0)} | ` +
      `${tall(r.verdenerMed)} | ${tall(r.verdenerP90)} | ${tall(r.råMed)} | ` +
      `${tall(r.konfMed)} | ${tall(r.konfP90)} | ${ms(r.msMed)} | ${ms(r.msP90)} | ` +
      `${ms(r.msMaks)} | ${pst(r.fullAndel)} |`,
  );
}
linjer.push("");
linjer.push("ANDEL BESLUTNINGER SOM RAKK INNENFOR TIDSBUDSJETTET (full enumerasjon, ikke sampling):");
linjer.push("");
linjer.push("| stikk igjen | ≤ 50 ms | ≤ 200 ms | ≤ 1 s |");
linjer.push("|---|---|---|---|");
for (const r of rader) {
  linjer.push(`| ${r.igjen} | ${pst(r.under50)} | ${pst(r.under200)} | ${pst(r.under1000)} |`);
}
linjer.push("");
linjer.push(
  `KONTROLL: enumerasjonens vektsum mot uavhengig DP-telling – ${avvikTotalt} avvik ` +
    `av ${fulle} fullførte enumerasjoner. 0 avvik = enumerasjonen dekker HELE rommet, ` +
    `og «eksakt» er ikke en sampling i forkledning.`,
);

if (verdier.length > 0) {
  linjer.push("");
  linjer.push("HVA TERSKELEN ER VERDT I POENG – parret mot kontrollen, samme givere.");
  linjer.push("Negativt tall = den eksakte varianten er DÅRLIGERE enn kontrollen.");
  for (const v of verdier) {
    linjer.push("");
    linjer.push(`${v.kilde} – ${v.givere} felles givere, grunnlinje «${v.grunnlinje}»`);
    linjer.push("");
    linjer.push("| variant | differanse | SE | SE-er | tegntest |");
    linjer.push("|---|---|---|---|---|");
    for (const m of v.motGrunnlinje) {
      linjer.push(
        `| ${m.a} | ${m.diff >= 0 ? "+" : ""}${m.diff.toFixed(4)} | ${m.se.toFixed(4)} | ` +
          `${m.sigma.toFixed(1)} | ${m.tegn} |`,
      );
    }
  }
}

const txt = `${linjer.join("\n")}\n`;
mkdirSync(dirname(utBase), { recursive: true });
writeFileSync(`${utBase}.txt`, txt, "utf8");
writeFileSync(
  `${utBase}.json`,
  `${JSON.stringify(
    {
      givere,
      frøBase,
      maksStikk,
      maksConf,
      beslutninger: punkter.length,
      avvikTotalt,
      fulleEnumerasjoner: fulle,
      rader,
      verdier,
      punkter,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${txt}\nSkrevet: ${utBase}.txt og ${utBase}.json\n`);
