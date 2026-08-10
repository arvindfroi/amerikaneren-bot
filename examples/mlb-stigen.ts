/**
 * STIGEN: hver MLB-epoke mot en FAST ytre målestokk.
 *
 *   node examples/mlb-stigen.ts --vekter e1-modell/mlb-ep1.bin,e1-modell/mlb-ep2.bin \
 *     --giver 400 --ut analyse/mlb-stigen.tsv
 *
 * ====================== HVORFOR DENNE FILA FINNES ========================
 *
 * Epokeporten i `liga.ts` spør: slår epoke 8 epoke 7? Det er en
 * SELVREFERERENDE prøve. Et nett kan slå forgjengeren sin epoke etter epoke
 * og likevel bli dårligere mot alt annet — stein-saks-papir-sykling er den
 * klassiske selvspillsfella, og en intern port kan ikke se den.
 *
 * Kurven kan altså stige i tretti epoker uten at noe blir bedre.
 *
 * Stigen måler mot en fast panel i stedet. En stigende INTERN kurve med flat
 * YTRE kurve er ikke en skuffelse — det er en diagnose, og det er den mest
 * sannsynlige feilen vi kan få.
 *
 * ================== HVORFOR DEN IKKE MÅLER SELV ==========================
 *
 * `gate2.ts` er en validert benk: nullarmen treffer 0,0000, og den er
 * bekreftet for `mlb:`-agenter (160 par, 0 avvik av 0). Å skrive
 * målelogikken en gang til her ville vært den 17. forekomsten av prosjektets
 * verste feilklasse — «det målte og det utrullede var ikke samme ting».
 *
 * Stigen KJØRER derfor `gate2.ts` som underprosess og leser dens egne varige
 * rader. Den eier orkestreringen, ikke målingen.
 *
 * ====================== PANELET =========================================
 *
 * Faste motstandere, valgt fordi de svarer på ULIKE spørsmål:
 *
 *   tilfeldig   epoke 0. Beveger vi oss i det hele tatt bort fra start?
 *   nevro       en ekte, svak bot. Har vi passert noe som spiller på ordentlig?
 *   ADAMS_MAALT dagens stakk. Er vi på vei mot noe som er verdt å ha?
 *
 * Panelet endres ALDRI mellom epoker. Endrer det seg, er stigen ikke en stige.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { ADAMS_MAALT } from "../src/moe2/agentspek.ts";

// ---------------------------------------------------------------------------

const PANEL: ReadonlyArray<{ navn: string; spek: string }> = [
  { navn: "tilfeldig", spek: "mlb:tilfeldig7310001" },
  { navn: "nevro", spek: "nevro" },
  { navn: "adams", spek: ADAMS_MAALT },
];

let vekter: string[] = [];
let giver = 400;
let frøBase = 8_300_000;
let ut = "analyse/mlb-stigen.tsv";
let arbeid = "analyse/mlb-stigen-raa";
/**
 * TROEN SOM INNGANG (§126). Stigen MÅLER vektene, så den må måle dem på den
 * samme vektoren de ble trent på. Stien havner i spekstrengen (`mlb:<vekt>~<tro>`)
 * og dermed i hver eneste målerad — en måling uten troen kan ikke forveksles
 * med en med.
 */
let trosti: string | null = "e1-modell/mlb-tro.bin";

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--vekter") vekter = (process.argv[++i] ?? "").split(",").filter((x) => x !== "");
  else if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--arbeid") arbeid = process.argv[++i]!;
  else if (a === "--tro") trosti = process.argv[++i]!;
  else if (a === "--uten-tro") trosti = null;
}

const spekFor = (vekt: string): string => (trosti === null ? `mlb:${vekt}` : `mlb:${vekt}~${trosti}`);

if (vekter.length === 0) {
  console.error("Bruk: --vekter <fil1,fil2,...> [--giver 400] [--ut analyse/mlb-stigen.tsv]");
  process.exit(1);
}

// ---------------------------------------------------------------------------

interface Rad {
  readonly giv: number;
  readonly sete: number;
  readonly d: Record<string, number>;
}

interface Dom {
  n: number;
  snitt: number;
  se: number;
  z: number;
  pos: number;
  neg: number;
}

/** Parret differanse mot KONTROLL, med tegntest ved siden av gjennomsnittet. */
function døm(rader: readonly Rad[], arm: string): Dom {
  const d: number[] = [];
  for (const r of rader) {
    const a = r.d[arm];
    const k = r.d["KONTROLL"];
    if (a === undefined || k === undefined) continue;
    d.push(a - k);
  }
  const n = d.length;
  if (n === 0) return { n: 0, snitt: NaN, se: NaN, z: NaN, pos: 0, neg: 0 };
  const snitt = d.reduce((a, b) => a + b, 0) / n;
  const varians = n > 1 ? d.reduce((a, x) => a + (x - snitt) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(varians / n);
  return {
    n,
    snitt,
    se,
    z: se > 0 ? snitt / se : NaN,
    pos: d.filter((x) => x > 0).length,
    neg: d.filter((x) => x < 0).length,
  };
}

// ---------------------------------------------------------------------------

// SKRIV HODET FØRST, og hver rad LØPENDE. En flertimers kjøring som bare
// skriver til slutt er en kjøring som kan gå tapt — det har skjedd her før.
if (!existsSync(ut)) {
  writeFileSync(ut, "epoke\tmotstander\tn\tsnitt\tse\tz\tpos\tneg\tkontroll\n", "utf8");
}

console.log(`Stigen: ${vekter.length} vekter x ${PANEL.length} motstandere, ${giver} giv hver`);

for (const vekt of vekter) {
  const epoke = vekt.replace(/^.*[\\/]/, "").replace(/\.bin$/, "");

  for (const mot of PANEL) {
    const rå = `${arbeid}-${epoke}-${mot.navn}.jsonl`;

    /**
     * KONTROLLARMEN ER MILJØET MOT SEG SELV, i samme sete. Den MÅ måle
     * eksakt 0. Gjør den ikke det, er det seteskjevhet i oppsettet, og da
     * kan ingen av de andre tallene på den raden leses.
     */
    const res = spawnSync(
      process.execPath,
      [
        "examples/gate2.ts",
        "--giver", String(giver),
        "--froe", String(frøBase),
        "--miljo", mot.spek,
        "--kandidat", mot.spek,
        "--kandidat", spekFor(vekt),
        "--ut", rå,
      ],
      { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
    );

    if (res.status !== 0) {
      const feil = (res.stderr ?? "").trim().split("\n").slice(-2).join(" | ");
      appendFileSync(ut, `${epoke}\t${mot.navn}\t0\tFEIL\t-\t-\t-\t-\t${feil}\n`, "utf8");
      console.log(`  ${epoke} mot ${mot.navn}: FEIL — ${feil}`);
      continue;
    }

    const rader: Rad[] = readFileSync(rå, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Rad);

    const kontroll = døm(rader, mot.spek);
    const kand = døm(rader, spekFor(vekt));

    // Kontrollen skrives PÅ RADEN, ikke i en logg ved siden av. Et tall uten
    // sin egen nullarm er ikke etterprøvbart av den som leser fila senere.
    const kontrollTekst =
      kontroll.n === 0 || Math.abs(kontroll.snitt) < 1e-9
        ? "0.0000 OK"
        : `${kontroll.snitt.toFixed(4)} SKJEV`;

    appendFileSync(
      ut,
      [
        epoke,
        mot.navn,
        kand.n,
        kand.snitt.toFixed(4),
        kand.se.toFixed(4),
        kand.z.toFixed(2),
        kand.pos,
        kand.neg,
        kontrollTekst,
      ].join("\t") + "\n",
      "utf8",
    );

    console.log(
      `  ${epoke} mot ${mot.navn.padEnd(10)} ${kand.snitt.toFixed(4)} ` +
        `+-${kand.se.toFixed(4)} (z ${kand.z.toFixed(2)}, ${kand.pos}/${kand.pos + kand.neg}) ` +
        `kontroll ${kontrollTekst}`,
    );
  }
}

console.log(`\nStigen skrevet til ${ut}`);
console.log(
  "LES DEN SLIK: stiger den mot «tilfeldig» men staar flatt mot «adams», " +
    "laerer nettet aa slaa seg selv og ingenting annet.",
);
