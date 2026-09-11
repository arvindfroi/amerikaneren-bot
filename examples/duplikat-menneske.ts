/**
 * K1 SOM DUPLIKAT — samme kort, bytt spilleren (11. sep).
 *
 *   node examples/duplikat-menneske.ts --spek <bot> --skard 0/8 --ut D:/amb-grp/duplikat/<merke>/s0.jsonl
 *     [--data D:/amb-grp/menneske/hendelser.jsonl]
 *
 * EIEREN: «poenget med K1 er at jeg vil ha det på et overmenneskelig nivå. Nå er den par.»
 * Vinnerandelen i kamper til 100 er et dårlig mål på det: kortfordelingen bestemmer mye av
 * utfallet, og 147 fullførte kamper (nesten alle fra én spiller) sier lite. Bridge løste det
 * samme problemet for hundre år siden med DUPLIKAT: alle får de samme kortene, og det som
 * sammenliknes er hva de gjorde med dem.
 *
 * Det går her fordi motoren deler ut DETERMINISTISK (`delUt(frø, rundeNr)`) og hver kamp i
 * Val Town har frøet i `start`-raden. For hver runde et menneske har spilt:
 *
 *   1. bygg nøyaktig samme stilling: samme giv (frø + rundeNr), samme giver (rundeNr mod 4),
 *      samme poengtavle før runden (loggens `totalPoeng − delta`)
 *   2. spill runden med BOTEN i menneskets sete (sete 0) og boten i de tre andre
 *   3. sammenlikn: botens rundepoeng i sete 0 minus menneskets faktiske rundepoeng
 *
 * Kortflaksen er da lik for begge. Positiv differanse = boten henter mer ut av de samme kortene.
 *
 * KONTROLL: menneskets spilte kort (loggens historikk) MÅ ligge i hånden + talongen som
 * gjenskapes. Stemmer det ikke, er given ikke den samme (annen motorversjon), og runden hoppes
 * over og telles – den skal aldri stille bli et tall.
 *
 * FORBEHOLD, sagt høyt: motstanderne i mennesket-runden var de botene som var utrullet DA;
 * i duplikatet er alle fire `--spek`. Kjøres med den kjeden mennesket faktisk møtte (v5, uten
 * BudQ), er avviket bare søkets tilfeldighet og budmodellen som ble brukt.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Seiersprediktor } from "../src/mlb/seier.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const SPEK = arg("--spek", "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin");
const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
const UT = arg("--ut", "D:/amb-grp/duplikat/roeyk/s0.jsonl");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
const MENNESKE = 0;
/**
 * DE TRE ANDRE SETENE. Standard = `--spek`, men den RETTFERDIGE sammenlikningen er at de spilles av
 * den kjeden mennesket faktisk møtte (v5 fra 10. aug): da er motstanderne de samme, og bare sete 0 er
 * byttet. Med kandidatboten også rundt bordet måles forsvaret mot andre kontrakter enn menneskets.
 */
const MOTSTANDER = arg("--motstander", SPEK);
/** Seiersmålet: 100·ΔP(seier) for sete 0 på samme poengtavle – det BudQ faktisk optimerer. */
const prediktor = Seiersprediktor.fraFil(arg("--seier", "e1-modell/seier-g0.bin"));
mkdirSync(dirname(UT), { recursive: true });

interface Hendelse {
  id: number;
  tid: string;
  spillId: string;
  spiller: string;
  type: string;
  data: Record<string, unknown>;
}

const spill = new Map<string, { start: Hendelse | null; runder: Hendelse[] }>();
for (const linje of readFileSync(DATA, "utf8").split("\n")) {
  if (linje === "") continue;
  const h = JSON.parse(linje) as Hendelse;
  if (h.type !== "start" && h.type !== "runde") continue;
  const s = spill.get(h.spillId) ?? { start: null, runder: [] };
  if (h.type === "start") s.start = h;
  else s.runder.push(h);
  spill.set(h.spillId, s);
}

/** Stabil skardfordeling på spill-id. */
const skardAv = (id: string): number => {
  let x = 2166136261;
  for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619) >>> 0;
  return x % SN;
};

const FARGEKODE: Record<string, string> = { S: "S", H: "H", R: "R", K: "K" };
/** Loggens historikk: stikk som [[spiller, farge, verdi], …]. Gir menneskets spilte kort som «S14». */
function spilteKort(historikk: unknown, sete: number): string[] {
  const ut: string[] = [];
  if (!Array.isArray(historikk)) return ut;
  for (const stikk of historikk) {
    if (!Array.isArray(stikk)) continue;
    for (const k of stikk) {
      if (Array.isArray(k) && k[0] === sete) ut.push(`${FARGEKODE[String(k[1])] ?? "?"}${k[2]}`);
    }
  }
  return ut;
}

function rolle(budvinner: unknown, makker: unknown, sete: number): string {
  if (budvinner === sete) return "fører";
  if (makker === sete) return "makker";
  return budvinner === null || budvinner === undefined ? "ingen" : "forsvar";
}

const agenter = [0, 1, 2, 3].map((p) => lagIndre(p === MENNESKE ? SPEK : MOTSTANDER));

/** Motorens vinnerregel (motor.ts): over målet; budvinner, så makker, så flest poeng. */
function vinnerAv(total: readonly number[], mål: number, budvinner: unknown, makker: unknown): number | null {
  const kand: number[] = [];
  for (let i = 0; i < total.length; i++) if ((total[i] ?? 0) >= mål) kand.push(i);
  if (kand.length === 0) return null;
  if (typeof budvinner === "number" && kand.includes(budvinner)) return budvinner;
  if (typeof makker === "number" && kand.includes(makker)) return makker;
  let best = kand[0]!;
  for (const k of kand) if ((total[k] ?? 0) > (total[best] ?? 0)) best = k;
  return best;
}
/** P(sete 0 vinner kampen) etter en poengtavle: fasiten når kampen er avgjort, ellers prediktoren. */
const sjanse = (total: readonly number[], mål: number, budvinner: unknown, makker: unknown): number => {
  const v = vinnerAv(total, mål, budvinner, makker);
  if (v !== null) return v === MENNESKE ? 1 : 0;
  return prediktor.fordeling([...total], MENNESKE, mål)[0]!;
};
/**
 * `--etter <ISO-dato>`: bare runder fra og med datoen blir RADER (K1 måles fra 10. aug). Kamper som
 * ligger helt før datoen spilles ikke; tidligere runder i en kamp som krysser datoen spilles, men
 * skrives ikke – se hukommelsen under.
 */
const ETTER = arg("--etter", "");
let tomLogg = 0;
let skrevet = 0;
let feilGiv = 0;
let hoppet = 0;
let tidlig = 0;
/** Runder der boten i duplikatet nådde målet (FERDIG) mens mennesket spilte videre. */
let kampslutt = 0;
/** Hull eller gjentak i rundefølgen: boka startes på nytt, se under. */
let brudd = 0;
const t0 = Date.now();
for (const [id, s] of spill) {
  if (skardAv(id) !== SI || s.start === null) continue;
  if (ETTER !== "" && !s.runder.some((r) => r.tid >= ETTER)) continue;
  const frø = Number(s.start.data["frø"]);
  const målPoeng = Number(s.start.data["målPoeng"] ?? 100);
  if (!Number.isFinite(frø)) continue;
  for (const a of agenter) a.nyKamp();
  /** Siste runde agentene har SETT slutte i denne kampen, eller null etter en ny bok. */
  let sett: number | null = null;
  for (const r of [...s.runder].sort((a, b) => Number(a.data.rundeNr) - Number(b.data.rundeNr))) {
    const rundeNr = Number(r.data.rundeNr);
    /**
     * HULL I RUNDEFØLGEN (11. sep). Mangler en runde i loggen, har ingen agent sett den
     * slutte, og en hukommelsesleser kaster med rette i neste. Å dikte opp runden er ikke
     * mulig, så boka startes på nytt: kortere hukommelse, aldri gal. Menneskedataene fra
     * 10. aug har ingen hull (målt 11. sep: 0 av 273 kamper), så radene der er uendret.
     */
    if (sett !== null && rundeNr !== sett + 1) {
      for (const a of agenter) a.nyKamp();
      brudd++;
      sett = null;
    }
    const delta = r.data.delta as number[] | undefined;
    const total = r.data.totalPoeng as number[] | undefined;
    if (!Array.isArray(delta) || !Array.isArray(total) || delta.length !== 4) {
      // Stillingen kan ikke gjenskapes. En bot som leser hukommelsen (budq 287, trosnett 804/920 i
      // søket) kaster hvis den møter en senere runde uten å ha sett denne slutte – så boka startes på
      // nytt i stedet for at kampen stopper. Hukommelsen blir kortere, aldri gal.
      for (const a of agenter) a.nyKamp();
      hoppet++;
      sett = null;
      continue;
    }
    const før = total.map((t, p) => t - (delta[p] ?? 0));

    // Samme stilling: runde 0 rett fra frøet, ellers en RUNDE_SLUTT rett før og NESTE –
    // da deler motoren selv ut runden, med sin egen giverrotasjon.
    const grunn = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
    let st: GameState =
      rundeNr === 0
        ? { ...grunn, totalPoeng: før }
        : utfør({ ...grunn, fase: "RUNDE_SLUTT", iTur: null, rundeNr: rundeNr - 1, giver: (rundeNr - 1) % 4, totalPoeng: før }, { type: "NESTE" }).state;

    /**
     * Kontrollen: menneskets spilte kort må finnes i gjenskapt hånd + talong. En runde som ikke
     * består (eller mangler spilte kort i loggen, eller ligger før `--etter`) blir IKKE en rad – men
     * den SPILLES likevel med boten, så hukommelsen i kampen ser hver runde slutte i rekkefølge.
     * Før 11. sep hoppet løkka over dem, og en hukommelsesleser kastet i neste runde.
     */
    const tilgjengelig = new Set([...(st.hender[MENNESKE] ?? []), ...st.talong].map((k) => `${k.farge}${k.verdi}`));
    const spilt = spilteKort(r.data.historikk, MENNESKE);
    let skriv = true;
    if (spilt.length === 0) {
      tomLogg++;
      skriv = false;
    } else if (spilt.some((k) => !tilgjengelig.has(k))) {
      feilGiv++;
      skriv = false;
    } else if (ETTER !== "" && r.tid < ETTER) {
      tidlig++;
      skriv = false;
    }

    let vakt = 0;
    while (st.fase !== "RUNDE_SLUTT" && st.fase !== "FERDIG" && vakt++ < 2_000) {
      const i = st.fase === "VRAK" || st.fase === "VELG" ? st.budvinner : st.iTur;
      if (i === null || i === undefined) break;
      st = utfør(st, agenter[i]!.velgHandling(st)).state;
    }
    /**
     * KAMPSLUTT I DUPLIKATET ER EN RUNDESLUTT (11. sep).
     *
     * Løfter botens runde noen over målet, går motoren til FERDIG — men mennesket spilte
     * videre, og neste runde gjenskapes fra HANS tavle. Bøkene (søketroen, `Hukommelse`,
     * `Profilbok`) bokfører bare `RUNDE_SLUTT`, så runden forsvant, og søketroen kastet i
     * neste runde: 10 av 20 K1-skard i batteriet 11. sep, og K1 målt på 197 av 273 kamper.
     *
     * Agentene får derfor SAMME tilstand med `fase: "RUNDE_SLUTT"`. Det er ingen ny
     * informasjon (hendene er tomme, historikken er den samme; bare kampslutten tas bort,
     * og den finnes ikke i menneskets kamp). En spek uten hukommelse leser ikke fasen i
     * `observer`, så radene er de samme for den.
     */
    if (st.fase === "FERDIG") kampslutt++;
    const slutt: GameState = st.fase === "FERDIG" ? { ...st, fase: "RUNDE_SLUTT", vinner: null } : st;
    for (const a of agenter) (a as { observer?(s: GameState): void }).observer?.(slutt);
    const bot = st.sisteRunde?.delta;
    if (bot === undefined) {
      for (const a of agenter) a.nyKamp();
      hoppet++;
      sett = null;
      continue;
    }
    sett = rundeNr;
    if (!skriv) continue;
    appendFileSync(
      UT,
      JSON.stringify({
        spill: id,
        spiller: s.start.spiller,
        tid: r.tid,
        runde: rundeNr,
        menneske: delta[MENNESKE],
        bot: bot[MENNESKE],
        diff: (bot[MENNESKE] ?? 0) - (delta[MENNESKE] ?? 0),
        mP: 100 * (sjanse(total, målPoeng, r.data.budvinner, r.data.makker) - sjanse(før, målPoeng, null, null)),
        bP: 100 * (sjanse(st.totalPoeng, målPoeng, st.sisteRunde?.budvinner, st.sisteRunde?.makker) - sjanse(før, målPoeng, null, null)),
        mRolle: rolle(r.data.budvinner, r.data.makker, MENNESKE),
        bRolle: rolle(st.sisteRunde?.budvinner, st.sisteRunde?.makker, MENNESKE),
      }) + "\n",
    );
    skrevet++;
  }
  process.stdout.write(`\r  skard ${SI}/${SN}: ${skrevet} runder, ${feilGiv} med annen giv, ${tomLogg} uten spilte kort, ${hoppet} hoppet, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}
console.log(`\nSkard ${SI}/${SN} ferdig: ${skrevet} runder, ${feilGiv} avvist av givkontrollen, ${tomLogg} uten spilte kort i loggen, ${hoppet} uten brukbar logg, ${kampslutt} kampslutt i duplikatet vist som rundeslutt, ${brudd} brudd i rundefølgen → ${UT}`);
