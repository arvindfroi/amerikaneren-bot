/**
 * BÆRER PROFILEN SEG I SPILL? — måling (b), 12. september.
 *
 *   node examples/profil-lop.ts --arm baerer --klon "<klonespek>" --bot "okt:<botspek>" \
 *     --profildir analyse/profil/lop-baerer --spiller 0123456789ab --lop 200 \
 *     --ut analyse/profil/lop-baerer.jsonl
 *   node examples/profil-lop.ts --arm fersk  --klon "<klonespek>" --bot "okt:<botspek>" --lop 200 …
 *   node examples/profil-lop.ts --arm kontroll --bot "okt:<botspek>" --lop 200 …
 *   node examples/profil-lop.ts --dom analyse/profil/lop-*.jsonl
 *
 * ===================== SPØRSMÅLET ========================================
 *
 * Måling (a) spør om profilen PREDIKERER bedre. Dette spør om den VINNER mer, som er det
 * eieren faktisk bryr seg om. Harnesket er agent S sitt (`examples/lop-menneske.ts`): et
 * race til 100 poeng, mennesket som klone (`menn:`) i ett roterende sete, tre boter rundt.
 *
 * TRE ARMER:
 *
 *   baerer     botene får klonens profil ved kampstart, og profilen OPPDATERES etter hvert
 *              race. Race 1 spilles altså mot en tom profil, race 50 mot en profil bygget
 *              av 49 tidligere races. Det er eierens bilde: vanene følger spilleren.
 *   fersk      samme boter, ingen profil. DAGENS BOT.
 *   kontroll   klon = bot, fire like seter. MÅ gi 25 %. Uten den vet vi ikke om harnesket
 *              teller riktig, og da er de to andre tallene verdiløse — se `lop-menneske.ts`.
 *
 * Måltallet er KLONENS vinnerandel. Lavere er bedre for boten.
 *
 * ===================== HVORFOR «baerer» IKKE KAN SKARDES =================
 *
 * Race `i + 1` bruker profilen fra race `i`. Kjeden er sekvensiell, og to skard som skrev
 * i samme katalog ville flettet hverandres profiler i en rekkefølge ingen kan gjenskape —
 * tallet ville ikke vært reproduserbart, og det ville ikke sagt fra. `--skard` avvises
 * derfor for denne armen. `fersk` og `kontroll` kan skardes fritt: de har ingen tilstand.
 *
 * ===================== PROFILEN ER RENT OFFENTLIG ========================
 *
 * Etter hvert race bygges bidraget av harneskets EGEN `Hukommelse`, som har sett hver
 * tilstand og bokført bare `RUNDE_SLUTT` (`src/mlb/profil.ts`). Ingen `GameState` går inn
 * i profilen; typen slipper den ikke inn.
 *
 * ===================== USIKKERHETEN ======================================
 *
 * `domLøp` fra `lop-menneske.ts`: persentil-bootstrap over race. En andel nær 5–20 % på
 * hundre race har SE ~3 pp, så to armer skilles bare av en STOR forskjell. Det står i
 * rapporten, ikke i en fotnote.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { bidragFraBok, gyldigId, oppdaterProfil, profilSti } from "../src/mlb/profil.ts";
import { domLøp, klonSete, LOP_BASE, LOP_STEG, type Løperad } from "./lop-menneske.ts";

const argv = process.argv;
const arg = (n: string, s: string): string => {
  const i = argv.indexOf(n);
  return i < 0 ? s : (argv[i + 1] ?? s);
};

/**
 * ETT RACE, MED BOKA. Som `spillLøp` i `lop-menneske.ts`, men harnesket holder sin egen
 * `Hukommelse` ved siden av — den er kilden til profilbidraget etterpå.
 *
 * Agentene bygges PER RACE, som `kamp.ts` gjør: en agent bærer bok, økt og RNG, og to race
 * som deler dem er ikke uavhengige forsøk. Profilen bæres gjennom FILA, ikke gjennom objektet
 * — det er nettopp det som gjør at «bæreren» måler lagring og ikke bare en lang økt.
 */
export function spillMedBok(
  seter: readonly string[],
  frø: number,
  målPoeng: number,
  maksRunder: number,
): { vinner: number; poeng: number[]; runder: number; bok: Hukommelse } | null {
  const agenter = seter.map((sp) => lagIndre(sp));
  for (const a of agenter) a.nyKamp?.();
  const bok = new Hukommelse();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.rundeNr < maksRunder && vakt++ < 200_000) {
    for (const a of agenter) a.observer?.(s);
    bok.observer(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  for (const a of agenter) a.observer?.(s);
  bok.observer(s);
  if (s.fase !== "FERDIG" || s.vinner === null || s.vinner === undefined) return null;
  return { vinner: s.vinner, poeng: [...s.totalPoeng], runder: s.rundeNr, bok };
}

function kjørDom(): void {
  const filer = argv.slice(argv.indexOf("--dom") + 1).filter((x) => !x.startsWith("--"));
  if (filer.length === 0) throw new Error("--dom <filer...>");
  for (const f of filer) {
    const rader: Løperad[] = [];
    for (const l of readFileSync(f, "utf8").split("\n")) if (l !== "") rader.push(JSON.parse(l) as Løperad);
    const d = domLøp(rader);
    const p = (x: number): string => `${(100 * x).toFixed(1)} %`;
    console.log(
      `${f}\n  n = ${d.n}, ${d.runder.toFixed(1)} runder/race — KLONENS ANDEL ${p(d.andel)} ` +
        `(${d.seire}/${d.n}) 95 % [${p(d.lav)}, ${p(d.høy)}] SE ${p(d.se)}` +
        `\n  per sete: ${d.perSete.map((x, i) => `${i}: ${Number.isNaN(x) ? "–" : p(x)}`).join("  ")}`,
    );
    console.log(`ANDEL ${d.andel.toFixed(5)} LAV ${d.lav.toFixed(5)} HOEY ${d.høy.toFixed(5)} N ${d.n}`);
  }
  console.log(`\nFire like seter (kontroll) skal gi 25 %. Lavere klone-andel = sterkere bot.`);
}

function kjør(): void {
  const ARM = arg("--arm", "fersk");
  if (ARM !== "baerer" && ARM !== "fersk" && ARM !== "kontroll") {
    throw new Error(`Ukjent --arm «${ARM}» (baerer, fersk, kontroll)`);
  }
  const BOT = arg("--bot", "");
  const KLON = ARM === "kontroll" ? BOT : arg("--klon", "");
  if (BOT === "" || KLON === "") throw new Error("--bot og (utenom kontroll) --klon må oppgis");
  const LØP = tall(arg("--lop", "100"), 100, "--lop");
  const MÅL = tall(arg("--maalpoeng", "100"), 100, "--maalpoeng");
  const MAKS = tall(arg("--maksrunder", "200"), 200, "--maksrunder");
  const BASE = tall(arg("--froe", String(LOP_BASE)), LOP_BASE, "--froe");
  const UT = arg("--ut", `analyse/profil/lop-${ARM}.jsonl`);
  const PROFILDIR = arg("--profildir", "analyse/profil/lager");
  const SPILLER = arg("--spiller", "0123456789ab");
  const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
  if (!Number.isFinite(SI) || !Number.isFinite(SN) || SN < 1) throw new Error("--skard <i>/<n>");

  if (ARM === "baerer") {
    if (SN !== 1) {
      throw new Error(
        "«baerer» kan ikke skardes: race i+1 bruker profilen fra race i, og to skard i samme " +
          "katalog ville flettet profilene i en rekkefølge ingen kan gjenskape.",
      );
    }
    if (!gyldigId(SPILLER)) throw new Error("--spiller må være et pseudonym (1–32 hex)");
    if (!BOT.startsWith("okt:")) {
      throw new Error(`--bot må begynne med «okt:» for at «profil=» skal ha et sted å henge («${BOT.slice(0, 20)}…»)`);
    }
    /**
     * FRISK KATALOG. Lå det profiler igjen fra en tidligere kjøring, ville race 1 ikke
     * lenger vært mot en tom profil, og kurven «gevinsten vokser med antall race» ville
     * startet et sted ingen vet hvor.
     */
    if (existsSync(PROFILDIR) && readdirSync(PROFILDIR).length > 0) {
      if (!argv.includes("--fortsett")) {
        throw new Error(`${PROFILDIR} er ikke tom – bruk --fortsett om det er meningen, ellers slett den`);
      }
    } else {
      mkdirSync(PROFILDIR, { recursive: true });
    }
  }

  mkdirSync(dirname(UT), { recursive: true });
  rmSync(UT, { force: true });
  console.log(
    `${LØP} race til ${MÅL}, arm «${ARM}»` +
      (ARM === "kontroll" ? "  [KONTROLL: fire like seter, ventet 25 %]" : "") +
      `\n  klon: ${KLON}\n  bot:  ${BOT}` +
      (ARM === "baerer" ? `\n  profil: ${PROFILDIR}/${SPILLER}.json` : ""),
  );

  let skrevet = 0;
  let seire = 0;
  let uferdige = 0;
  const t0 = Date.now();
  for (let l = 0; l < LØP; l++) {
    if (l % SN !== SI) continue;
    const sete = klonSete(l);
    const frø = BASE + l * LOP_STEG;

    /**
     * BOTENS SPEK FOR DETTE RACET. Profilen henges på med setet klonen sitter i, og setet
     * skifter hvert race — en profil på feil sete er en påstand om en spiller som ikke
     * sitter der. Finnes ingen profilfil ennå (race 1), spilles armen uten, som «fersk».
     */
    let botSpek = BOT;
    if (ARM === "baerer" && existsSync(profilSti(PROFILDIR, SPILLER))) {
      botSpek = `okt:profil=${profilSti(PROFILDIR, SPILLER).replace(/\\/g, "/")}@${sete}:${BOT.slice(4)}`;
    }

    const seter = [0, 1, 2, 3].map((p) => (p === sete ? KLON : botSpek));
    const r = spillMedBok(seter, frø, MÅL, MAKS);
    if (r === null) {
      uferdige++;
      continue;
    }
    const klonVant: 0 | 1 = r.vinner === sete ? 1 : 0;
    seire += klonVant;
    const rad: Løperad = {
      frø,
      løp: l,
      sete,
      klonVant,
      vinner: r.vinner,
      runder: r.runder,
      klonPoeng: r.poeng[sete] ?? 0,
      beste: Math.max(...r.poeng.filter((_, p) => p !== sete)),
    };
    appendFileSync(UT, JSON.stringify(rad) + "\n");
    skrevet++;

    // ETTER racet: klonens vaner legges til profilen. Bare offentlige, ferdige runder.
    if (ARM === "baerer") {
      const dato = new Date().toISOString().slice(0, 10);
      oppdaterProfil(PROFILDIR, bidragFraBok(r.bok, sete, SPILLER, dato));
    }

    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  ${ARM} ${SI}/${SN}: ${skrevet} race, klonen ${seire} (${((100 * seire) / Math.max(1, skrevet)).toFixed(1)} %), ` +
        `${(sek / Math.max(1, skrevet)).toFixed(1)} s/race   `,
    );
  }
  const sek = (Date.now() - t0) / 1000;
  console.log(
    `\nArm «${ARM}» skard ${SI}/${SN} ferdig: ${skrevet} race, klonen vant ${seire}` +
      (uferdige > 0 ? `, ${uferdige} nådde ikke målet` : "") +
      ` → ${UT}`,
  );
  console.log(`SEKUNDER ${sek.toFixed(1)}`);
  console.log(`SEK-PER-LOEP ${skrevet > 0 ? (sek / skrevet).toFixed(1) : "nan"}`);
}

/** Bare som kommando — `test/`-importer skal ikke kjøre målingen. Samme vakt som `lop-menneske.ts`. */
const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) {
  if (argv.includes("--dom")) kjørDom();
  else kjør();
}
