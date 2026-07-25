/**
 * Rollebalansert måling av senatet – den målingen vi manglet.
 *
 *   node examples/senat-maal.ts trening-d5/gull.json --eksperter senat --kamper 300
 *
 * MÅLT BLINDSONE (2026-07-25): i den vanlige målingen mot NevroHjerne
 * vinner D-linjene ALDRI budrunden – nevro byr 9,3, de byr 5,6, så over 25
 * partier ble det n=0 kontrakter for kandidaten. «Mot nevro» har derfor bare
 * målt FORSVARSSPILL, som tilfeldigvis er deres svakeste rolle. Budgivning,
 * vraking, trumfvalg og spillefører-spill har vært helt umålt.
 *
 * Her tvinges kontrakten i stedet, slik moe-roller.ts gjør: budsetet får
 * kontrakt N, alle andre passer, og kandidaten plasseres i tur og orden som
 * SPILLEFØRER, MAKKER og FORSVARER. De tre andre setene er NevroHjerne, som
 * bare ser lovlig informasjon. Samme givere og samme kontrakter for alle
 * kandidatene, så kortflaksen er kontrollert (parret måling).
 *
 * FRØVALG (viktig): moe-roller.ts TRENER paa 900 000–1 300 000 og maaler paa
 * 880 000+. Denne maalingen laa foerst paa 950 000+, altsaa midt i
 * treningsomraadet – tallene for en trent ekspert var da lest av dens egne
 * treningsgivere. Vi ligger naa paa 1 400 000+, over begge, saa settet er
 * rent uansett hvilken ekspert som lastes. Endres treningsomraadet i
 * moe-roller, maa dette flyttes med.
 *
 * Kandidatene er alltid: grunngenomet alene, senatet med de ekspertene som
 * finnes, og NevroHjerne som tak. Da leses ekspertens bidrag av direkte –
 * og et senat uten eksperter skal måle likt med grunngenomet, som er en
 * gratis kontroll på at rutingen ikke ødelegger noe i seg selv.
 */

import { existsSync, readFileSync } from "node:fs";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { genomFraJson, NeatAgent } from "../src/neat/index.ts";
import type { Genom } from "../src/neat/genom.ts";
import { ROLLER, SenatAgent, type Rolle } from "../src/neat/senat.ts";
import { besteTrumf, NevroAgent } from "../src/nevro/index.ts";

const filer: string[] = [];
let ekspertMappe = "senat";
let kamper = 300;
let kontrakter = [8, 9, 10];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--eksperter") ekspertMappe = process.argv[++i]!;
  else if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakter") kontrakter = process.argv[++i]!.split(",").map(Number);
  else filer.push(a);
}

const lesGenom = (f: string): Genom => {
  const rå = JSON.parse(readFileSync(f, "utf8")) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(f, "utf8"));
};

const grunn = lesGenom(filer[0] ?? "trening-d5/gull.json");

// Ekspertene lastes etter filnavnet moe-roller.ts skriver.
const eksperter: Partial<Record<Rolle, Genom>> = {};
const funnet: string[] = [];
for (const r of ROLLER) {
  const kandidat =
    r === "makker" || r === "forsvar"
      ? `${ekspertMappe}/ekspert-${r}.json`
      : `${ekspertMappe}/ekspert-budvinner-${r.slice(3)}.json`;
  if (existsSync(kandidat)) {
    eksperter[r] = lesGenom(kandidat);
    funnet.push(r);
  }
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
type Rollenavn = "spillefører" | "makker" | "forsvar";

/** Tvinger kontrakt `k` hos `budsete`; null hvis hånden er urimelig svak. */
function oppsett(frø: number, budsete: number, k: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let guard = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < k - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: k }).state;
  } catch {
    return null;
  }
  guard = 0;
  while (s.fase === "BUDRUNDE" && guard++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  return s.fase === "BUDRUNDE" ? null : s;
}

interface Utfall {
  rolle: Rollenavn;
  suksess: boolean;
  lagStikk: number;
}

/**
 * Spiller én tvungen kontrakt med kandidaten i rollen `ønsket`. VRAK/VELG
 * kjøres av kandidaten selv når den er spillefører (det er en del av
 * spillefører-jobben), ellers av nevro.
 */
function énRunde(lag: () => Velger, frø: number, k: number, ønsket: Rollenavn): Utfall | null {
  const budsete = frø % 4;
  let s = oppsett(frø, budsete, k);
  if (s === null) return null;

  const nevro = new NevroAgent();
  const kandidat = lag();
  kandidat.nyKamp();

  // Spillefører-rollen eier vraking og trumfvalg; de andre rollene får en
  // nevro-ført kontrakt å forholde seg til, så vi måler kun deres eget spill.
  const førerErKandidat = ønsket === "spillefører";
  let guard = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && guard++ < 20) {
    s = utfør(s, førerErKandidat ? kandidat.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") return null;

  let sete: number;
  if (ønsket === "spillefører") sete = budsete;
  else if (ønsket === "makker") {
    if (s.makker === null || s.makker === budsete) return null;
    sete = s.makker;
  } else {
    const kand = [0, 1, 2, 3].filter((p) => p !== budsete && p !== s.makker);
    if (kand.length === 0) return null;
    sete = kand[frø % kand.length]!;
  }

  guard = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && guard++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, iTur === sete ? kandidat.velgHandling(s) : nevro.velgHandling(s)).state;
  }
  const res = s.sisteRunde;
  if (res === null) return null;
  const klart = res.lagStikk >= k;
  // Forsvaret lykkes når kontrakten FALLER – motsatt fortegn av de andre.
  return { rolle: ønsket, suksess: ønsket === "forsvar" ? !klart : klart, lagStikk: res.lagStikk };
}

const kandidater: { navn: string; lag: () => Velger }[] = [
  { navn: "grunngenom", lag: () => new NeatAgent(grunn, { læringsrate: 0 }) },
  { navn: `senat (${funnet.length === 0 ? "tomt" : funnet.join("+")})`, lag: () => new SenatAgent({ grunn, eksperter, nevroBud: true }) },
  { navn: "NevroHjerne", lag: () => new NevroAgent() },
];

const ROLLENAVN: Rollenavn[] = ["spillefører", "makker", "forsvar"];
const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);

console.log(`\n=== Rollebalansert måling, ${kamper} givere x kontrakt ${kontrakter.join("/")} ===`);
console.log(`grunnlag ${filer[0] ?? "trening-d5/gull.json"}, eksperter funnet: ${funnet.length === 0 ? "ingen" : funnet.join(", ")}`);
console.log(`(tre nevro i de andre setene; forsvar teller SUKSESS = kontrakten falt)\n`);

const bredde = 22;
process.stdout.write("rolle / kontrakt".padEnd(bredde));
for (const k of kandidater) process.stdout.write(k.navn.slice(0, 18).padStart(20));
console.log("\n" + "-".repeat(bredde + 20 * kandidater.length));

for (const rolle of ROLLENAVN) {
  for (const k of kontrakter) {
    const rad: string[] = [];
    for (const kand of kandidater) {
      let ok = 0;
      let n = 0;
      for (let f = 0; f < kamper; f++) {
        const u = énRunde(kand.lag, 1_400_000 + f, k, rolle);
        if (u === null) continue;
        n++;
        if (u.suksess) ok++;
      }
      rad.push(`${pst(ok, n)} (${n})`);
    }
    process.stdout.write(`${rolle} @ ${k}`.padEnd(bredde));
    console.log(rad.map((r) => r.padStart(20)).join(""));
  }
}
console.log("");
