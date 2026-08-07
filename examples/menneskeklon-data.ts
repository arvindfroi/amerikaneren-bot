/**
 * MENNESKEKLONENS TRENINGSDATA: gjenskaper hver logget runde og henter ut
 * menneskets kortvalg i den EKTE stillingen.
 *
 *   node examples/menneskeklon-data.ts analyse/menneskedata/kortvalg.txt \
 *     menneske-data/kort.jsonl
 *
 * HVORFOR EN KLONE ER VEIEN TIL MÅLET. Arvind: «lag en amerikaneren bot som er
 * umulig for mennesker å vinne mot i det lange løpet.» Mot en FAST
 * motstanderpopulasjon er det maksimale et BESTE SVAR, ikke en likevekt — en
 * likevektsstrategi gir bevisst fra seg gevinst mot utnyttbare motstandere.
 * Budmodellen er allerede beviset: de +2,138 den henter kommer av å utnytte at
 * motparten passer for mye.
 *
 * Men Adams' kortspill er et RENT NETT som ikke sampler verdener, så en
 * motstandermodell kan ikke settes inn ved spilletid. Veien er å bake den inn i
 * TRENINGSDATAEN: rull ut SD-verdenene med en klone av familien, og destiller.
 * Da lærer nettet å utnytte deres tendenser, og det koster millisekunder.
 *
 * GJENSKAPINGEN. Loggen har ingen hender — men den har `frø`, og motoren deler
 * ut deterministisk med `blandeSeed(frø, rn) = frø + (rn+1)·2654435761`
 * (`motor.ts`). Så `opprettSpill(regler, frø + (rn+1)·2654435761)` gir runde
 * `rn`s giv som en fersk tilstand. Ingen intern funksjon trengs, og ingen kopi
 * av utdelingslogikken kan komme i utakt med motoren.
 *
 * DE ANDRE SETENE spilles av boten som faktisk satt der. Den er
 * DETERMINISTISK, så replayen er eksakt — forutsatt at riktig versjon brukes.
 * Loggen sier hvilken (`v1`, `v2`, `gml`), og rundene merkes deretter.
 *
 * KORREKTHETSPORTEN, og den er ikke valgfri: hvert kort mennesket logget må
 * være LOVLIG i stillingen replayen har bygget opp. Er det ikke det, har
 * replayen drevet fra virkeligheten, og raden forkastes. Antallet forkastede
 * skrives ut — er det ikke lavt, er frø-koblingen feil og hele datasettet
 * verdiløst. Da skal det ikke brukes.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { kloneTrekk } from "../src/moe2/mesterklone.ts";
import { kortIndeks } from "../src/nevro/index.ts";
import type { Farge, Kort } from "../src/kort.ts";

const INN = process.argv[2] ?? "analyse/menneskedata/kortvalg.txt";
const UT = process.argv[3] ?? "menneske-data/kort.jsonl";
/** Menneskets sete på nettsiden (`web/app.ts: const MENNESKE = 0`). */
const MENNESKE = 0;

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };
function lag(spek: string): Agent {
  if (spek === "nevro") return new NevroAgent();
  if (spek.startsWith("vakt:")) {
    const v = delVaktspek(spek);
    if (v === null) throw new Error(`Ugyldig vaktspek «${spek}»`);
    return new Konvensjonsvakt(lag(v.indre), v.valg);
  }
  if (spek.startsWith("budm:")) {
    const rest = spek.slice(5);
    const i = rest.indexOf(":");
    return new Budagent(lag(rest.slice(i + 1)), lesBudmodell(rest.slice(0, i)));
  }
  if (spek.startsWith("e1:")) return E1Agent.fraFil(spek.slice(3));
  throw new Error(`Ukjent spek «${spek}»`);
}

/** Boten som faktisk satt i de tre andre setene, per loggmerke. */
const BOTER: Record<string, string> = {
  v2: "budm:e1-modell/bud-gbt.json:vakt:abmp:e1:e1-modell/d7alle.bin",
  v1: "budm:e1-modell/bud-gbt.json:vakt:abmp:e1:e1-modell/ftf1.bin",
  gml: "vakt:abmp:e1:e1-modell/d7alle.bin",
};
const agenter = new Map<string, Agent>();
for (const [k, v] of Object.entries(BOTER)) agenter.set(k, lag(v));

const nevroRef = new NevroAgent();
mkdirSync(dirname(UT), { recursive: true });

/**
 * BUDRUNDEN MÅ TVINGES, ikke replayes.
 *
 * Første versjon lot boten by for sete 0 i stedet for mennesket. Da ble
 * kontrakten en annen enn den som faktisk ble spilt, og de loggede kortene ble
 * ulovlige: **1 066 av 1 172 runder forkastet**.
 *
 * Loggen sier hvem som vant og med hvilket bud (`runder-*.txt`). Auksjonen
 * drives derfor dit direkte: budvinneren melder sitt bud, alle andre passer.
 * Budhistorikken blir kunstig — det påvirker bare et nett som leser
 * budtrekkene, og NevroHjerne gjør ikke det i kortspillet — men KONTRAKTEN og
 * BUDVINNEREN blir de ekte, og det er det kortspillet henger på.
 */
interface Rundefakta {
  readonly bv: number;
  readonly bud: number;
  readonly trumf: Farge | null;
  readonly etterlyst: Kort | null;
}
const fakta = new Map<string, Rundefakta>();
for (const fil of ["runder-1.txt", "runder-2.txt"]) {
  let tekst = "";
  try {
    tekst = readFileSync(`analyse/menneskedata/${fil}`, "utf-8");
  } catch {
    continue;
  }
  for (const l of tekst.trim().split(/\r?\n/)) {
    const f = l.split("|");
    if (f.length < 10 || f[3] !== "tall") continue; // amerikaner/solo droppes
    const tr = f[9] ?? "";
    let trumf: Farge | null = null;
    let etterlyst: Kort | null = null;
    if (tr.length > 0) {
      trumf = tr[0] as Farge;
      const e = tr.slice(2);
      if (e !== "-" && e.length > 1) {
        etterlyst = { farge: e[0] as Farge, verdi: Number(e.slice(1)) as Kort["verdi"] };
      }
    }
    fakta.set(`${f[0]}|${f[1]}`, {
      bv: Number(f[2]),
      bud: Number(f[4]),
      trumf,
      etterlyst,
    });
  }
}
console.log(`Rundefakta lest: ${fakta.size} runder med tallmelding`);

let ok = 0;
let forkastet = 0;
let rader = 0;
const perBot = new Map<string, number>();

// SPLITT PÅ /\r?\n/, IKKE PÅ "\n". Filen er skrevet på Windows og har CRLF, og
// et etterslepende \r gjorde at SISTE kort i hver linje ikke matchet regexen.
// Med `break` i parsingen betydde det at 1 171 av 1 172 runder ble hoppet over
// i stillhet — ingen krasj, ingen advarsel, bare et tomt datasett.
for (const linje of readFileSync(INN, "utf-8").trim().split(/\r?\n/)) {
  const [spill, rnS, frøS, bot, kortS] = linje.split("|");
  if (kortS === undefined) continue;
  const rn = Number(rnS);
  const frø = Number(frøS);
  const agent = agenter.get(bot ?? "gml") ?? agenter.get("gml")!;

  // Menneskets kort i stikkrekkefølge: «<stikk><farge><verdi>».
  const valgt: Kort[] = [];
  for (const s of kortS.split(",")) {
    const m = /^(\d+)([SHRK])(\d+)$/.exec(s);
    if (m === null) break;
    valgt.push({ farge: m[2] as Farge, verdi: Number(m[3]) as Kort["verdi"] });
  }
  if (valgt.length !== 12) continue;

  // GIVA GJENSKAPT, og forskyvningen er en AV-MED-ÉN som porten fanget.
  //
  //   motor.ts: blandeSeed(frø, rn) = (frø + (rn+1)·2654435761) >>> 0
  //
  // `opprettSpill(regler, X)` deler ut runde 0, altså med `blandeSeed(X, 0)`
  // = X + 1·M. For at den skal gi runde `rn`s giv må
  //
  //   X + 1·M = frø + (rn+1)·M   ⟹   X = frø + rn·M
  //
  // Første forsøk brukte (rn+1) og ga FEIL giv i alle 1 172 runder. Ingen av
  // dem krasjet — de ga bare kort mennesket aldri hadde, og porten forkastet
  // 100 %. Uten porten ville datasettet vært rent søppel som så riktig ut.
  let s: GameState = opprettSpill({ antallSpillere: 4 }, (frø + rn * 2_654_435_761) >>> 0);
  agent.nyKamp();
  nevroRef.nyKamp();

  const fk = fakta.get(`${spill}|${rn}`);
  const linjer: string[] = [];
  let i = 0;
  let gyldig = true;
  let harBudt = false;
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;

    // TVUNGEN BUDRUNDE: budvinneren fra loggen melder sitt bud, alle andre
    // passer. Uten dette blir kontrakten en annen enn den som ble spilt.
    if (s.fase === "BUDRUNDE" && fk !== undefined) {
      const p = iTur;
      if (p === fk.bv && !harBudt) {
        harBudt = true;
        s = utfør(s, { type: "BUD", spiller: p, bud: fk.bud }).state;
      } else {
        s = utfør(s, { type: "BUD", spiller: p, bud: "PASS" }).state;
      }
      continue;
    }
    // MENNESKETS EGEN TRUMF OG ETTERLYSNING når det var budvinner. Boten ville
    // valgt noe annet, og da spilles en annen runde enn den loggede.
    if (s.fase === "VELG" && fk !== undefined && fk.bv === MENNESKE && fk.trumf !== null) {
      s = utfør(s, {
        type: "VELG",
        spiller: MENNESKE,
        trumf: fk.trumf,
        etterlyst: fk.etterlyst,
      }).state;
      continue;
    }

    if (s.fase === "SPILL" && s.iTur === MENNESKE) {
      const kort = valgt[i];
      if (kort === undefined) break;
      const lovlige = lovligeKort(s, MENNESKE);
      // KORREKTHETSPORTEN. Er kortet ikke lovlig her, har replayen drevet.
      if (!lovlige.some((k) => k.farge === kort.farge && k.verdi === kort.verdi)) {
        gyldig = false;
        break;
      }
      if (lovlige.length >= 2) {
        // Bare stillinger med et REELT valg. Ett lovlig kort er reglene, ikke
        // atferd, og ville fortynnet dataen med gratis treff.
        const nevroKort = (nevroRef.velgHandling(s) as Handling & { kort: Kort }).kort;
        const t = kloneTrekk(s, MENNESKE, nevroKort);
        linjer.push(
          JSON.stringify({
            t: Array.from(t, (x) => Math.round(x * 10_000) / 10_000),
            k: kortIndeks(kort),
            n: kortIndeks(nevroKort),
            m: lovlige.map(kortIndeks),
            bot,
            frø,
          }),
        );
      }
      i++;
      s = utfør(s, { type: "SPILL", spiller: MENNESKE, kort }).state;
      continue;
    }
    // Menneskets bud, vrak og trumf er ikke i denne filen; boten spiller dem.
    // Det gjør stillingen litt annerledes enn den ekte når mennesket var
    // budvinner - merket `bot` lar den delen filtreres bort senere om nødvendig.
    s = utfør(s, agent.velgHandling(s)).state;
  }

  if (gyldig && i === 12 && linjer.length > 0) {
    appendFileSync(UT, linjer.join("\n") + "\n", "utf-8");
    ok++;
    rader += linjer.length;
    perBot.set(bot ?? "gml", (perBot.get(bot ?? "gml") ?? 0) + 1);
  } else forkastet++;
}

console.log(`Gjenskapte runder: ${ok}, forkastet: ${forkastet}`);
console.log(`Treningsrader (stillinger med reelt valg): ${rader}`);
for (const [b, n] of [...perBot.entries()].sort()) console.log(`  ${b}: ${n} runder`);
console.log(
  `\nFORKASTEDE ER PORTEN. Er andelen hoy, har froe-koblingen drevet og\n` +
    `datasettet er verdiloest. ${((100 * forkastet) / Math.max(1, ok + forkastet)).toFixed(1)} % forkastet.`,
);
console.log(`\nSkrevet til ${UT}`);
