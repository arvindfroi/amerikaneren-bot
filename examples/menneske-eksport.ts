/**
 * EKSPORTVEIEN FOR MENNESKEDATAENE (11. sep).
 *
 *   node examples/menneske-eksport.ts [--ut D:/amb-grp/menneske] [--fra 0]
 *
 * Kravlista hadde den som mangel: 4 448 runder, 5 635 bud og 147 fullførte kamper lå i Val
 * Town-valen `arvindfroi/amerikaneren-data`, men den offentlige lista ga bare de 1000 siste
 * hendelsene, og skriptene leste en lokal dump fra 23. jul–1. aug. Valen har nå sidevisning
 * (`?format=json&etter=<id>&grense=<n>`), og denne fila henter HELE historikken.
 *
 * ================= NAVN SKRIVES ALDRI UT =================================
 *
 * Eieren har sagt at dataene ikke er sensitive, men prosjektet skriver likevel aldri navn i
 * rapporter eller i repoet. Feltet `navn` («<spiller> vs <bot>») byttes derfor mot et
 * PSEUDONYM før noe skrives: `spiller` = de første 12 hex av sha256(salt + spillernavn), og
 * `bot` = botnavnet (det er ikke en person). Saltet ligger i `<ut>/salt.txt`, utenfor repoet,
 * og lages første gang. Samme salt gir samme pseudonym, så en spiller kan følges på tvers av
 * kamper (K1, K6) uten at noen fil i analysen inneholder navnet.
 *
 * Utdata: `<ut>/hendelser.jsonl` (én hendelse per linje, stigende id) og en telling per type
 * på stdout – aldri innholdet. Gjenopptakelig: `--fra <id>` fortsetter etter en id.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";
const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const UT = arg("--ut", "D:/amb-grp/menneske");
let etter = Number(arg("--fra", "0"));
const GRENSE = 5000;

mkdirSync(UT, { recursive: true });
const saltfil = join(UT, "salt.txt");
if (!existsSync(saltfil)) writeFileSync(saltfil, randomBytes(24).toString("hex"));
const salt = readFileSync(saltfil, "utf8").trim();
const utfil = join(UT, "hendelser.jsonl");
if (etter === 0 && existsSync(utfil)) writeFileSync(utfil, "");

interface Rad {
  id: number;
  tid: string;
  spillId: string;
  navn: string;
  type: string;
  data: unknown;
}

const pseudonym = (navn: string): { spiller: string; bot: string } => {
  const skille = navn.lastIndexOf(" vs ");
  const person = skille < 0 ? navn : navn.slice(0, skille);
  const bot = skille < 0 ? "" : navn.slice(skille + 4);
  return { spiller: createHash("sha256").update(salt + person.trim()).digest("hex").slice(0, 12), bot };
};

const teller = new Map<string, number>();
const spillere = new Set<string>();
let totalt = 0;
for (;;) {
  const r = await fetch(`${DATA}?format=json&etter=${etter}&grense=${GRENSE}`);
  if (!r.ok) throw new Error(`valen svarte ${r.status}`);
  const side = (await r.json()) as Rad[];
  if (!Array.isArray(side)) throw new Error("valen svarte ikke med en liste – mangler sidevisningen?");
  if (side.length === 0) break;
  const linjer: string[] = [];
  for (const rad of side) {
    const { spiller, bot } = pseudonym(String(rad.navn ?? ""));
    spillere.add(spiller);
    linjer.push(JSON.stringify({ id: rad.id, tid: rad.tid, spillId: rad.spillId, spiller, bot, type: rad.type, data: rad.data }));
    teller.set(rad.type, (teller.get(rad.type) ?? 0) + 1);
    if (rad.id <= etter) throw new Error(`id ${rad.id} er ikke større enn ${etter} – sidevisningen går ikke framover`);
    etter = rad.id;
  }
  appendFileSync(utfil, linjer.join("\n") + "\n");
  totalt += side.length;
  process.stdout.write(`  ${totalt} hendelser, siste id ${etter}\r`);
  if (side.length < GRENSE) break;
}

console.log(`\n${totalt} hendelser -> ${utfil}  (${spillere.size} ulike pseudonymer, siste id ${etter})`);
for (const [type, n] of [...teller].sort((a, b) => b[1] - a[1])) console.log(`  ${type.padEnd(12)} ${n}`);
