/**
 * HVA ER DET BESTE BUDET Å AVGI – i en ekte budrunde, ikke en tvunget.
 *
 *   node examples/budhandling.ts --hender 300 --trekninger 30
 *
 * HVORFOR DENNE ERSTATTER budflaks. `examples/budflaks.ts` tvinger kontrakten:
 * setet byr N og de tre andre passer alltid. Den måler derfor «hvilken
 * kontrakt er best å sitte med», og svarte 7–8. Det er riktig svar på det
 * spørsmålet og feil svar på Arvinds: i en ekte budrunde kan du ikke velge å
 * spille 7. Byr du 7, byr noen andre 8, og du sitter igjen som forsvarer.
 *
 * DET TALLET SOM MANGLET ER ALTERNATIVET. Poengtabellen er sterkt asymmetrisk
 * i budlagets favør:
 *
 *   budvinner som klarer N   +2N        (bud 9 → +18)
 *   budvinner som bommer     −2N        (bud 9 → −18)
 *   makker                   ±N
 *   forsvarer                +1 per EGET stikk
 *
 * En forsvarer henter altså et par poeng uansett hvor godt han spiller. Da er
 * ikke spørsmålet «er bud 9 sikkert» – det er «er bud 9 bedre enn å sitte som
 * forsvarer». Et bud som går inn 64 % av gangene kan være klart riktig selv
 * om det bommer hver tredje gang, fordi alternativet er nesten ingenting.
 *
 * DESIGNET. For hver hånd holdes budgiverens 12 kort FASTE – det er alt han
 * vet. De 40 andre deles ut på nytt hver trekning, så talongen, makkerkortet
 * og fordelingen varierer. Det ER flaksen. For hver KANDIDATHANDLING spilles
 * runden helt ut:
 *
 *   PASS       setet passer; de tre andre byr som vanlig (nevro)
 *   BUD N      setet byr N første gang det er lovlig; de andre byr som vanlig
 *
 * Ved BUD N kan setet BLI OVERBUDT. Da spilles runden ut med setet som
 * forsvarer, og poengene teller likevel. Det er hele poenget: risikoen for å
 * miste kontrakten er en ekte kostnad ved å by lavt, og den skal ligge i
 * tallet – ikke utenfor det.
 *
 * Poengene som leses av er setets EGNE rundepoeng fra motoren, altså den
 * samme skalaen familien spiller på.
 */

import { writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagRng, nyStokk, stokk, kortId, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let antallHender = 300;
let trekninger = 30;
let kandidatSpek = "vakt:ab:e1:e1-modell/d7alle.bin";
let utFil = "analyse/budhandling.txt";
const BUD = [7, 8, 9, 10, 11];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--hender") antallHender = Number(process.argv[++i]);
  else if (a === "--trekninger") trekninger = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") utFil = process.argv[++i]!;
}

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
  const hender = mal.hender.map((h, i) => (i === sete ? hånd.slice() : h.slice()));
  let j = 0;
  for (let p = 0; p < mal.antallSpillere; p++) {
    if (p === sete) continue;
    hender[p] = resten.slice(j, j + (mal.hender[p] ?? []).length);
    j += (mal.hender[p] ?? []).length;
  }
  return { ...mal, hender, talong: resten.slice(j, j + mal.giving.talong) };
}

/**
 * Spiller runden ut. `mittBud` = null betyr «pass alltid»; ellers byr setet
 * det budet første gang det er lovlig, og passer resten av budrunden.
 *
 * Returnerer setets egne rundepoeng, og hvem som endte med kontrakten.
 */
function spillHandling(
  giv: GameState,
  sete: number,
  mittBud: number | null | "nevro",
): { poeng: number; fikkKontrakt: boolean; kontrakt: number | null } | null {
  let s = giv;
  let harBydd = false;
  let g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 40) {
    const iTur = s.iTur;
    if (iTur === null) break;
    if (iTur === sete && mittBud !== "nevro") {
      const lov = lovligeHandlinger(s);
      const kanBy =
        !harBydd &&
        mittBud !== null &&
        lov.fase === "BUDRUNDE" &&
        lov.bud.some((b) => b === mittBud);
      if (kanBy) {
        harBydd = true;
        s = utfør(s, { type: "BUD", spiller: sete, bud: mittBud }).state;
      } else {
        s = utfør(s, { type: "BUD", spiller: sete, bud: "PASS" }).state;
      }
    } else {
      // «nevro»-armen lar setet by helt fritt gjennom HELE budrunden. Det er
      // den ekte referansen: nevros ÅPNINGSbud er alltid 5, så et opptak av
      // første bud måler ingenting om hva den faktisk ender på.
      s = utfør(s, nevro.velgHandling(s)).state;
    }
  }
  // Ingen bød – runden har ingen kontrakt og sier ingenting om budvalget.
  if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
  const fikkKontrakt = s.budvinner === sete;
  const høy = s.budrunde.høyeste;
  const kontrakt = høy !== null && typeof høy.bud === "number" ? høy.bud : null;

  /**
   * KORTSPILLET GJØRES AV KANDIDATEN I ALLE FIRE SETENE. Første versjon satte
   * NevroHjerne i de tre andre, og da møtte kontraktene et svakere forsvar
   * enn noe vi faktisk spiller mot. Skjevheten er ikke jevn: den er størst
   * for de høye budene, som lever av at forsvaret bommer, så tabellen ville
   * anbefalt for høye bud. Budrunden i de andre setene er fortsatt nevro –
   * det er den budrunden vår beste bot faktisk har.
   */
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  return { poeng: s.totalPoeng[sete] ?? 0, fikkKontrakt, kontrakt };
}

/** Handlingsnøkler: -1 = la nevro by fritt, 0 = PASS, ellers budtallet. */
const NEVRO = -1;
const PASS = 0;

interface Rad {
  /** Kontrakten nevro-armen faktisk endte på, når den vant den. */
  readonly nevroKontrakt: number | null;
  readonly ev: Map<number, number>;
  readonly vant: Map<number, number>;
  readonly beste: number;
}

const rader: Rad[] = [];
const rng = lagRng(414141);
const t0 = Date.now();
for (let h = 0; h < antallHender; h++) {
  const mal = opprettSpill({ antallSpillere: 4 }, 4_400_000 + h);
  const sete = (mal.giver + 1) % mal.antallSpillere; // første budgiver
  const hånd = mal.hender[sete] ?? [];
  if (hånd.length === 0) continue;

  // De SAMME trekningene brukes for alle handlingene, så forskjellen mellom
  // dem ikke domineres av hvilke gir som tilfeldigvis ble trukket.
  const giver: GameState[] = [];
  for (let t = 0; t < trekninger; t++) giver.push(omtrekk(mal, sete, hånd, rng));

  const ev = new Map<number, number>();
  const vant = new Map<number, number>();
  const kontrakter: number[] = [];
  for (const handling of [NEVRO, PASS, ...BUD]) {
    const p: number[] = [];
    let fikk = 0;
    for (const giv of giver) {
      const r = spillHandling(giv, sete, handling === NEVRO ? "nevro" : handling === PASS ? null : handling);
      if (r === null) continue;
      p.push(r.poeng);
      if (r.fikkKontrakt) {
        fikk++;
        if (handling === NEVRO && r.kontrakt !== null) kontrakter.push(r.kontrakt);
      }
    }
    if (p.length === 0) continue;
    ev.set(handling, p.reduce((a, x) => a + x, 0) / p.length);
    vant.set(handling, fikk / p.length);
  }
  if (!ev.has(NEVRO)) continue;
  // Den beste FASTE handlingen; nevro-armen er referansen, ikke en kandidat.
  let beste = PASS;
  for (const [k, v] of ev) if (k !== NEVRO && v > (ev.get(beste) ?? -Infinity)) beste = k;
  const nevroKontrakt =
    kontrakter.length > 0 ? kontrakter.reduce((a, x) => a + x, 0) / kontrakter.length : null;
  rader.push({ nevroKontrakt, ev, vant, beste });
  if ((h + 1) % 25 === 0) {
    process.stdout.write(`\r  ${rader.length} hender, ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
  }
}

const snitt = (v: readonly number[]): number => v.reduce((a, x) => a + x, 0) / Math.max(1, v.length);
const navn = (k: number): string => (k === NEVRO ? "NEVRO" : k === PASS ? "PASS" : `bud ${k}`);

const linjer: string[] = [
  `\n=== Hva er det beste BUDET å avgi? ${rader.length} hender x ${trekninger} trekninger ===`,
  `Budgiverens 12 kort er faste; de 40 andre deles ut på nytt hver trekning.`,
  `De tre andre setene byr som vanlig (NevroHjerne) – setet kan bli OVERBUDT,`,
  `og spiller da runden ut som forsvarer. Kandidat i eget sete: ${kandidatSpek}.`,
  ``,
  `handling   forventet poeng   fikk kontrakten   best på denne hånden`,
  `----------------------------------------------------------------------`,
];
for (const k of [NEVRO, PASS, ...BUD]) {
  const e = rader.map((r) => r.ev.get(k)).filter((x): x is number => x !== undefined);
  const v = rader.map((r) => r.vant.get(k)).filter((x): x is number => x !== undefined);
  const b = rader.filter((r) => r.beste === k).length;
  if (e.length === 0) continue;
  linjer.push(
    `${navn(k).padEnd(10)} ${snitt(e).toFixed(2).padStart(13)}   ` +
      `${(100 * snitt(v)).toFixed(0).padStart(13)} %   ${((100 * b) / rader.length).toFixed(0).padStart(16)} %`,
  );
}

// Hva er å hente ved å velge riktig handling per HÅND, i stedet for nevros?
const parret: number[] = [];
for (const r of rader) {
  const nevroEV = r.ev.get(NEVRO);
  const besteEV = r.ev.get(r.beste);
  if (nevroEV === undefined || besteEV === undefined) continue;
  parret.push(besteEV - nevroEV);
}
const m = snitt(parret);
let sq = 0;
for (const x of parret) sq += (x - m) * (x - m);
const se = Math.sqrt(sq / Math.max(1, parret.length - 1) / Math.max(1, parret.length));

const medKontrakt = rader.map((r) => r.nevroKontrakt).filter((x): x is number => x !== null);
const besteFordeling = new Map<number, number>();
for (const r of rader) besteFordeling.set(r.beste, (besteFordeling.get(r.beste) ?? 0) + 1);

linjer.push(
  ``,
  `Kontrakten nevro-armen ender paa naar den vinner budrunden: ` +
    `${snitt(medKontrakt).toFixed(2)} (n=${medKontrakt.length})`,
  ``,
  `Den beste FASTE handlingen, fordelt over hender:`,
  ...[...besteFordeling.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, n]) => `  ${navn(k).padEnd(8)} ${((100 * n) / rader.length).toFixed(0).padStart(3)} %`),
  ``,
  `Å velge den poengbeste handlingen per hånd i stedet for nevros:`,
  `  ${m >= 0 ? "+" : ""}${m.toFixed(2)} ± ${se.toFixed(2)} poeng per budgiverrunde (n=${parret.length})`,
  ``,
  `LESEVEILEDNING – og hvorfor dette IKKE motsier at 9 «pleier å gå».`,
  `Et bud er ikke bra fordi det er sikkert, men fordi det slår alternativet.`,
  `Forsvarersetet henter bare +1 per eget stikk, mens en innfridd niende gir`,
  `+18. Derfor kan bud 9 være klart riktig selv om det bommer hver tredje`,
  `gang. Kolonnen «fikk kontrakten» viser den andre siden: byr man for lavt,`,
  `blir man overbudt, og da er det gode budet verdt ingenting.`,
  ``,
  `TALLET ER ET ANSLAG PÅ ØVRE GRENSE. «Beste handling per hånd» velges HER`,
  `med fasit i hånd – vi har simulert alle seks handlingene på nøyaktig denne`,
  `hånden. En ekte budvurdering må gjette det fra kortene alene, og henter`,
  `derfor mindre. Gapet er hva en budmodell har å spille om.`,
);

const tekst = linjer.join("\n");
console.log("\n" + tekst);
writeFileSync(utFil, tekst + "\n");
writeFileSync(
  utFil.replace(/\.txt$/, ".json"),
  JSON.stringify(
    rader.map((r) => ({ nevroKontrakt: r.nevroKontrakt, beste: r.beste, ev: [...r.ev], vant: [...r.vant] })),
    null,
    1,
  ),
);
