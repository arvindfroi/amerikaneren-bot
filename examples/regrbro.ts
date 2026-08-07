/**
 * BROEN: får MesterAI og menneskene inn i den samme regresjonen.
 *
 *   node examples/regrbro.ts --kilde mester --ut regr-bro/mester-0.jsonl
 *   node examples/regrbro.ts --kilde menneske --ut regr-bro/menneske-0.jsonl
 *
 * PROBLEMET. `regresjonsdata.ts` kan spille våre egne boter på hvilken som
 * helst giv, men MesterAI koster 450 ms per kortvalg og menneskene kan ikke
 * kjøres på nytt i det hele tatt. Uten en bro står de utenfor tabellen.
 *
 * LØSNINGEN er at begge alt HAR spilt, på giver vi kan gjenskape:
 *
 *   MESTERAI  `analyse/fasegap-*.jsonl` har 1 498 runder med `froe`,
 *             `rundeNr`, poeng per sete og hvilke seter MesterAI hadde.
 *   MENNESKENE `analyse/menneskedata/` har 813 runder, og gjenskapingen er
 *             verifisert: 0 av 813 forkastet.
 *
 * For hver slik runde gjenskapes giva, og VÅRE agenter spilles i NØYAKTIG de
 * setene den andre parten hadde, med de samme motspillerne i resten. Da ligger
 * begge i samme giv, og den giv-faste effekten binder dem sammen.
 *
 * GJENSKAPINGEN: `blandeSeed(frø, rn) = frø + (rn+1)·2654435761`, så runde rn
 * av parti `frø` er en frisk runde 0 med frø `frø + rn·2654435761`.
 *
 * ================== TRE FORBEHOLD SOM MÅ STÅ I RESULTATET =================
 *
 * 1. POENGSTILLINGEN GÅR TAPT. Runde rn spilles her som en runde 0, så
 *    «hvor mange poeng har hver spiller» er nullstilt. NevroHjernes budtrekk
 *    leser poengstillingen (`egenPoengAndel`), så budrunden kan bli en annen
 *    enn den var. Det rammer BEGGE armene likt innenfor en giv – de spilles
 *    fra samme nullstilte tilstand – men det gjør at radene ikke er en
 *    rekonstruksjon av det som faktisk skjedde.
 *
 * 2. MENNESKENES MOTSTAND VAR EN ANNEN BOT enn dagens. Partiloggen sier
 *    hvilken (`mot`-feltet), og den brukes her, slik at «menneske mot bot»
 *    ikke forveksles med «møtte svakere motstand». Det var nettopp feilen som
 *    veltet `menneske-mot-bot.ts`.
 *
 * 3. MESTERAI-RADENE ER LOGGEDE UTFALL, ikke replay. De kan derfor ikke
 *    kontrolleres på nytt, og de bærer den maskinlasten de ble spilt under.
 *    `mesterai-fasegap.txt` sier selv at tallene er et NEDRE anslag på
 *    MesterAIs styrke.
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { beregnPoeng, STANDARD_REGLER as standardRegler } from "../src/regler.ts";

let kilde = "mester";
let skardI = 0;
let skardN = 1;
let agenter = "nevro,e1:e1-modell/d7alle.bin,vakt:ab:e1:e1-modell/d7alle.bin,vakt:abmp:e1:e1-modell/d7alle.bin";
let ut = "regr-bro/bro-0.jsonl";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kilde") kilde = process.argv[++i]!;
  else if (a === "--agenter") agenter = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}
mkdirSync(dirname(ut), { recursive: true });

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
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
const kortNavn = (s: string): string =>
  s.replace("e1-modell/", "").replace(".bin", "").replace("e1:", "e1-").replace(/:/g, "");
const kandidater = agenter.split(",").map((s) => ({ navn: kortNavn(s), lag: lagKandidat(s) }));

const givFor = (frø: number, rn: number): number => (frø + Math.imul(rn, 2654435761)) >>> 0;

const diffAv = (delta: readonly number[], sete: number): number => {
  const egne = delta[sete] ?? 0;
  return Math.round((egne - (delta.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000;
};

/** Spiller giva med `iSete` bemannet av `lag`, resten av `restLag`. */
function spill(
  givFrø: number,
  seter: readonly number[],
  lag: () => Velger,
  restLag: () => Velger,
): { delta: number[]; rolle: (s: number) => string; bud: number; klart: number; stikk: number[] } | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, givFrø);
  const inne = new Set(seter);
  const v: Velger[] = [0, 1, 2, 3].map((p) => (inne.has(p) ? lag() : restLag()));
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
  const bud = s.melding?.type === "tall" ? s.melding.bud : 0;
  const st = s.stikkVunnet;
  const lagStikk = (st[s.budvinner] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0);
  return {
    delta: s.totalPoeng.slice(),
    rolle: (p) => (p === s.budvinner ? "foerer" : p === s.makker ? "makker" : "forsvar"),
    bud,
    klart: bud > 0 && lagStikk >= bud ? 1 : 0,
    stikk: st.slice(),
  };
}

const skriv = (o: Record<string, unknown>): void => {
  appendFileSync(ut, JSON.stringify({ trumfUt: -1, honnørUt: -1, tokStikk: -1, trumfetInn: -1, ...o }) + "\n");
};

let n = 0;

if (kilde === "mester") {
  // --- MesterAI-broen -------------------------------------------------------
  interface FG {
    froe: number;
    rundeNr: number;
    mesterSeter: number[];
    delta: number[];
    budvinner: number;
    makker: number | null;
    bud: number;
    budType: string;
    klart: boolean;
    stikkVunnet: number[];
    kandidat: string;
  }
  const rader: FG[] = [];
  for (const f of readdirSync("analyse").filter((x) => /^fasegap-.*\.jsonl$/.test(x))) {
    for (const l of readFileSync(join("analyse", f), "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        const o = JSON.parse(l) as FG;
        if (o.froe !== undefined && Array.isArray(o.mesterSeter) && Array.isArray(o.delta)) rader.push(o);
      } catch {
        continue;
      }
    }
  }
  const restLag = lagKandidat("e1:e1-modell/d7alle.bin");
  for (let i = 0; i < rader.length; i++) {
    if (i % skardN !== skardI) continue;
    const r = rader[i]!;
    if (r.budType !== "tall") continue;
    const giv = givFor(r.froe, r.rundeNr);

    // MESTERAI-radene: loggede utfall, ett per sete MesterAI hadde.
    for (const s of r.mesterSeter) {
      skriv({
        giv,
        sete: s,
        agent: "MesterAI",
        rolle: s === r.budvinner ? "foerer" : s === r.makker ? "makker" : "forsvar",
        posisjon: -1,
        bud: r.bud,
        klart: r.klart ? 1 : 0,
        egneStikk: r.stikkVunnet[s] ?? 0,
        lagStikk: (r.stikkVunnet[r.budvinner] ?? 0) + (r.makker !== null ? (r.stikkVunnet[r.makker] ?? 0) : 0),
        poengdiff: diffAv(r.delta, s),
      });
      n++;
    }
    // VAARE AGENTER i NOEYAKTIG de samme setene, samme motspillere i resten.
    for (const k of kandidater) {
      const res = spill(giv, r.mesterSeter, k.lag, restLag);
      if (res === null) continue;
      for (const s of r.mesterSeter) {
        skriv({
          giv,
          sete: s,
          agent: k.navn,
          rolle: res.rolle(s),
          posisjon: -1,
          bud: res.bud,
          klart: res.klart,
          egneStikk: res.stikk[s] ?? 0,
          lagStikk: 0,
          poengdiff: diffAv(res.delta, s),
        });
        n++;
      }
    }
    process.stdout.write(`\r  mester-bro skard ${skardI}: ${n} rader   `);
  }
} else {
  // --- Menneskebroen --------------------------------------------------------
  const DATA = "analyse/menneskedata";
  const parti = new Map<string, { frø: number; mot: string }>();
  for (const l of readFileSync(`${DATA}/partier.txt`, "utf8").trim().split("\n")) {
    const f = l.split("|");
    parti.set(f[0]!, { frø: Number(f[1]), mot: f[2]! });
  }
  /**
   * FELTENE, verifisert mot `examples/menneske-atferd.ts` linje 121–122 og
   * mot de faktiske verdiene i fila. Første utkast leste dem feil, og feilen
   * ville vært stum: felt 2 er BUDVINNERENS sete (ikke menneskets), og felt 7
   * er STIKK per sete (ikke poeng).
   *
   *   0 parti  1 runde  2 budvinner  3 meldingstype  4 bud
   *   5 klart  6 lagstikk  7 stikk per sete  8 melding  9 trumf/etterlyst
   *
   * MENNESKET ER ALLTID SETE 0 – det er nettsidens spillersete, og det er
   * derfor `menneske-atferd.ts` filtrerer på `budvinner === 0` for å finne
   * rundene mennesket meldte selv.
   *
   * POENG FINNES IKKE I LOGGEN og må regnes ut. Makkeren står heller ikke
   * der, men lar seg utlede: makkeren er det setet hvis stikk lagt til
   * budvinnerens gir nøyaktig `lagstikk`. Er det tvetydig, hoppes runden over
   * i stedet for å gjettes.
   */
  interface MR { g: string; rn: number; budvinner: number; makker: number; stikk: number[]; bud: number }
  const MENNESKESETE = 0;
  const runder: MR[] = [];
  for (const fil of ["runder-1.txt", "runder-2.txt"]) {
    for (const l of readFileSync(`${DATA}/${fil}`, "utf8").trim().split("\n")) {
      const f = l.split("|");
      if (f[3] !== "tall") continue;
      const st = (f[7] ?? "").split(",").map(Number);
      if (st.length !== 4 || st.some((x) => !Number.isFinite(x))) continue;
      const bv = Number(f[2]);
      const lagStikk = Number(f[6]);
      const mulige = [0, 1, 2, 3].filter((p) => p !== bv && (st[bv] ?? 0) + (st[p] ?? 0) === lagStikk);
      if (mulige.length !== 1) continue; // tvetydig makker – hopp heller over
      runder.push({ g: f[0]!, rn: Number(f[1]), budvinner: bv, makker: mulige[0]!, stikk: st, bud: Number(f[4]) });
    }
  }
  // Motstanden mennesket faktisk moette. Ukjent navn -> nevro, som er
  // nettsidens eldste motstander og det svakeste rimelige anslaget.
  const motLag = (mot: string): (() => Velger) =>
    mot.includes("pimc") || mot.includes("sd") ? lagKandidat("e1:e1-modell/d7alle.bin") : lagKandidat("nevro");

  for (let i = 0; i < runder.length; i++) {
    if (i % skardN !== skardI) continue;
    const r = runder[i]!;
    const p = parti.get(r.g);
    if (p === undefined) continue;
    const giv = givFor(p.frø, r.rn);
    const rest = motLag(p.mot);

    // Poengene regnes av motorens EGEN tabell, ikke av en kopi her – da kan
    // de ikke gli fra hverandre den dagen reglene endres.
    const lagStikk = (r.stikk[r.budvinner] ?? 0) + (r.stikk[r.makker] ?? 0);
    const poeng = beregnPoeng({
      regler: standardRegler,
      melding: { type: "tall", bud: r.bud },
      antallStikk: 12,
      antallSpillere: 4,
      budvinner: r.budvinner,
      makker: r.makker,
      stikkPerSpiller: r.stikk,
    });
    skriv({
      giv,
      sete: MENNESKESETE,
      agent: "MENNESKE",
      rolle:
        MENNESKESETE === r.budvinner ? "foerer" : MENNESKESETE === r.makker ? "makker" : "forsvar",
      posisjon: -1,
      bud: r.bud,
      klart: lagStikk >= r.bud ? 1 : 0,
      egneStikk: r.stikk[MENNESKESETE] ?? 0,
      lagStikk,
      poengdiff: diffAv(poeng.delta, MENNESKESETE),
    });
    n++;
    for (const k of kandidater) {
      const res = spill(giv, [MENNESKESETE], k.lag, rest);
      if (res === null) continue;
      skriv({
        giv,
        sete: MENNESKESETE,
        agent: k.navn,
        rolle: res.rolle(MENNESKESETE),
        posisjon: -1,
        bud: res.bud,
        klart: res.klart,
        egneStikk: res.stikk[MENNESKESETE] ?? 0,
        lagStikk: 0,
        poengdiff: diffAv(res.delta, MENNESKESETE),
      });
      n++;
    }
    process.stdout.write(`\r  menneske-bro skard ${skardI}: ${n} rader   `);
  }
}
console.log(`\nFerdig: ${n} rader → ${ut}`);
