/**
 * KONTEKSTJAKT: finn systematisk HVOR boten spiller feil, og hva den bør gjøre.
 *
 *   node examples/kontekstjakt.ts --kamper 3000 --skard 0/10
 *
 * ARVIND: «måler vi atferd og finner vi muligheter for å forklare hvor
 * fortrinnet kommer fra? hvordan kan vi bruke og lære av dataen for å spille
 * bedre?»
 *
 * HVORFOR REGRESJONENS ATFERDSMÅL IKKE HOLDT. `analyse/regresjon.txt` fant at
 * vaktens fortrinn er 0 % forklart av «trumf ut», «honnør ut», «tok stikket»
 * og «trumfet inn». Det er ikke et mysterium – det er feil analyseenhet.
 * Vaktreglene fyrer i smale strukturelle stillinger (makkerens stikk 2, et
 * garantert stikk, åpningsutspillet), og en RATE over hele runden midler dem
 * bort. En regel som gjør det riktige i 3 % av stillingene flytter knapt en
 * rate, men kan flytte poeng.
 *
 * DENNE BYTTER ENHET: fra runde til BESLUTNING, og fra rate til KONTEKST.
 *
 * METODEN, som er Arvinds utfallsmåling brukt systematisk i stedet for på
 * håndplukkede hypoteser:
 *
 *   1. Spill giver normalt med boten.
 *   2. Ved hvert kortvalg: regn ut en KONTEKSTNØKKEL av strukturelle trekk
 *      setet lovlig ser – rolle, posisjon i stikket, renons, hvem som leder,
 *      hvor mange trumf som står ute.
 *   3. Spill det samme stikket om igjen med hvert av noen få KANONISKE
 *      alternativer, og spill runden ferdig i den EKTE giva.
 *   4. Aggreger per kontekst: hva vinner alternativet mot botens eget valg?
 *
 * RANGERINGEN er (hvor ofte konteksten forekommer) × (hva som er å hente der).
 * Det er den rekkefølgen regler bør bygges i – en stor gevinst i en sjelden
 * stilling er lite verdt, slik regel `p` viste: +0,115 per stilling ble
 * +0,004 per runde fordi stillingen bare er 3 % av givene.
 *
 * HVORFOR DETTE ER LÆRING OG IKKE BARE MÅLING. Utdata er en rangert liste av
 * formen «i denne strukturelt gjenkjennelige stillingen spiller boten X, men
 * Y gir mer – og stillingen forekommer så ofte». Det er nøyaktig formen en
 * konvensjonsvaktregel har, og de to eneste bekreftede forbedringene i dag kom
 * begge ut av akkurat den formen. Forskjellen er at de ble gjettet; denne
 * finner dem.
 *
 * ADVARSELEN SOM MÅ LESES. Dette er leting over mange kontekster samtidig, og
 * med nok kontekster vil noen se lovende ut ved ren tilfeldighet. Listen er
 * KANDIDATER, ikke funn. Hver kandidat må bygges som regel og måles parret på
 * et FRISKT frøbånd før den er noe – det er den prosedyren som forkastet
 * trumfregelen i natt og bekreftet makkerreglene i dag.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, stikkvinner, utfør, type GameState, type Handling } from "../src/index.ts";
import { type Kort } from "../src/kort.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { ukjenteKort } from "../src/moe2/synlig.ts";

let kamper = 3000;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
/** Andel beslutninger som testes. Hver koster fire gjennomspillinger. */
let sjanse = 0.12;
let kandidatSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut = "analyse/kontekst-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--sjanse") sjanse = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

interface Linje {
  kontekst: string;
  /** Alternativ → poengdifferanse minus botens eget valg. */
  d: Record<string, number>;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const R: Linje[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        R.push(JSON.parse(l) as Linje);
      } catch {
        continue;
      }
    }
  }
  const snitt = (v: readonly number[]): number => (v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length);
  const se = (v: readonly number[]): number => {
    if (v.length < 2) return NaN;
    const m = snitt(v);
    let s = 0;
    for (const x of v) s += (x - m) * (x - m);
    return Math.sqrt(s / (v.length - 1) / v.length);
  };
  const perKontekst = new Map<string, Linje[]>();
  for (const r of R) perKontekst.set(r.kontekst, [...(perKontekst.get(r.kontekst) ?? []), r]);

  interface Funn { kontekst: string; alt: string; n: number; m: number; se: number; andel: number; vekt: number }
  const funn: Funn[] = [];
  for (const [k, rs] of perKontekst) {
    if (rs.length < 60) continue;
    const andel = rs.length / R.length;
    for (const alt of Object.keys(rs[0]!.d)) {
      const v = rs.map((r) => r.d[alt] ?? NaN).filter(Number.isFinite);
      if (v.length < 60) continue;
      const m = snitt(v);
      const s = se(v);
      // VEKTEN er gevinst x hvor ofte konteksten forekommer. En stor gevinst i
      // en sjelden stilling er lite verdt - det var hele laerdommen fra regel p.
      funn.push({ kontekst: k, alt, n: v.length, m, se: s, andel, vekt: m * andel });
    }
  }
  funn.sort((a, b) => b.vekt - a.vekt);

  const linjer = [
    `\n=== Kontekstjakt: hvor spiller boten systematisk feil? ===`,
    `${R.length} testede beslutninger, ${perKontekst.size} kontekster, kandidat ${kandidatSpek}.`,
    `Hvert alternativ er spilt i den EKTE giva og runden spilt ferdig.`,
    ``,
    `KONTEKSTNOEKKELEN: rolle | posisjon i stikket | renons | hvem leder | trumf ute`,
    ``,
    `kontekst                         alternativ        n     gevinst        andel   VEKT`,
    `--------------------------------------------------------------------------------------`,
  ];
  for (const f of funn.slice(0, 18)) {
    if (f.m <= 0) continue;
    linjer.push(
      `${f.kontekst.padEnd(32)} ${f.alt.padEnd(16)} ${String(f.n).padStart(5)}   ` +
        `${(f.m >= 0 ? "+" : "") + f.m.toFixed(3)} ± ${f.se.toFixed(3)}  ` +
        `${(100 * f.andel).toFixed(1).padStart(6)} %  ${f.vekt.toFixed(4)}`,
    );
  }
  linjer.push(
    `--------------------------------------------------------------------------------------`,
    ``,
    `VEKT = gevinst x andel, altsaa hva regelen ville vaere verdt PER BESLUTNING`,
    `i snitt over hele spillet. Det er den stoerrelsen som avgjoer om en regel`,
    `er verdt aa bygge - ikke gevinsten alene.`,
    ``,
    `DETTE ER KANDIDATER, IKKE FUNN. Leting over mange kontekster gir lovende`,
    `tall ved ren tilfeldighet. Hver kandidat maa bygges som regel og maales`,
    `parret paa et FRISKT froebaand - den prosedyren forkastet trumfregelen i`,
    `natt (-0,171) og bekreftet makkerreglene i dag (+0,040, 10 av 10 skard).`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

// --- Innsamling -------------------------------------------------------------
mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

/** Kontekstnøkkelen. BARE lovlig informasjon – dette skal kunne bli en regel. */
function kontekstAv(s: GameState, sete: number): string {
  const trumf = s.trumf!;
  const rolle = sete === s.budvinner ? "F" : sete === s.makker ? "M" : "D";
  const pos = s.bord.length;
  const egen = s.hender[sete] ?? [];
  const led = s.bord[0]?.kort.farge;
  const renons = led !== undefined && !egen.some((k) => k.farge === led) ? "R" : "-";
  let leder = "-";
  if (s.bord.length > 0) {
    const v = stikkvinner(s.bord, trumf);
    leder = v === s.budvinner || v === s.makker ? "oss" : "dem";
  }
  const ute = ukjenteKort(s, sete).filter((k) => k.farge === trumf).length;
  const uteB = ute >= 5 ? "5+" : String(ute);
  return `${rolle}|p${pos}|${renons}|${leder}|t${uteB}`;
}

/** Kanoniske alternativer. Alle er lovlige og strukturelt beskrivbare. */
function alternativer(lovlige: readonly Kort[], trumf: string, s: GameState, sete: number): Record<string, Kort> {
  const sortert = [...lovlige].sort((a, b) => a.verdi - b.verdi);
  const tr = sortert.filter((k) => k.farge === trumf);
  const side = sortert.filter((k) => k.farge !== trumf);
  const vinnende = s.bord.length > 0
    ? sortert.filter((k) => stikkvinner([...s.bord, { spiller: sete, kort: k }], trumf as never) === sete)
    : [];
  const ut: Record<string, Kort> = {
    billigste: sortert[0]!,
    dyreste: sortert[sortert.length - 1]!,
  };
  if (tr.length > 0) ut["billigst trumf"] = tr[0]!;
  if (side.length > 0) ut["billigst sidekort"] = side[0]!;
  if (vinnende.length > 0) ut["billigst vinnende"] = vinnende[0]!;
  return ut;
}

const rng = (() => {
  let x = (0x2f6e2b1 + skardI * 7919) >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
})();

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 5_100_000 + f;
  const budsete = frø % 4;
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) continue;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) continue;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    continue;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;

  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) {
    s = utfør(s, seter[s.budvinner!]!.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") continue;

  /** Spill runden ferdig fra `st` og les av poengdifferansen for `sete`. */
  const ferdig = (st: GameState, sete: number): number => {
    let t = st;
    const v = [0, 1, 2, 3].map(() => lagBot());
    for (const b of v) b.nyKamp();
    let h = 0;
    while (t.fase !== "FERDIG" && t.fase !== "RUNDE_SLUTT" && h++ < 400) {
      t = utfør(t, v[t.iTur!]!.velgHandling(t)).state;
    }
    const p = t.totalPoeng;
    const egne = p[sete] ?? 0;
    return egne - (p.reduce((a, x) => a + x, 0) - egne) / 3;
  };

  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.iTur!;
    const valgt = seter[iTur]!.velgHandling(s);
    const lovlige = lovligeKort(s, iTur);
    if (valgt.type === "SPILL" && lovlige.length >= 2 && s.trumf !== null && rng() < sjanse) {
      const alt = alternativer(lovlige, s.trumf, s, iTur);
      const basis = ferdig(utfør(s, valgt).state, iTur);
      const d: Record<string, number> = {};
      for (const [navn, kort] of Object.entries(alt)) {
        try {
          d[navn] = Math.round((ferdig(utfør(s, { type: "SPILL", spiller: iTur, kort }).state, iTur) - basis) * 1000) / 1000;
        } catch {
          /* ulovlig i denne stillingen - hopp over dette alternativet */
        }
      }
      if (Object.keys(d).length > 0) {
        appendFileSync(ut, JSON.stringify({ kontekst: kontekstAv(s, iTur), d } satisfies Linje) + "\n");
        n++;
      }
    }
    s = utfør(s, valgt).state;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} beslutninger   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} beslutninger → ${ut}`);
