/**
 * HVOR I RUNDEN BLØR VI? Tap per stikk, målt mot taket.
 *
 *   node examples/tap-per-stikk.ts --kamper 200 --fraStikk 2 --rolle spillefoerer
 *
 * ARVINDS HYPOTESE: vi spiller svakest i stikk 2–5, fordi sluttspillet er løst
 * og åpningen er optimalisert av konvensjonsvakten. Den er verdt å teste, og
 * den kan ikke testes med `examples/perfeksjon-per-stikk.ts`.
 *
 * HVORFOR DEN GAMLE MÅLINGEN IKKE SVARER PÅ DETTE. Den BYTTER INN et orakels
 * kortvalg i ett stikk og ser hva utfallet blir. Det måler «hva skjer om vi
 * følger orakelet her», ikke «hvor mye lot vi ligge her». For DD-orakelet er
 * de to tingene motsatte: DD-kolonnen er negativ i hvert eneste stikk, fordi
 * å FØLGE dobbelt dummy er målt skadelig (−0,609 gjennom porten). Det sier
 * ingenting om hvor tapet vårt ligger.
 *
 * DET SOM MÅLES HER er ANGER PER BESLUTNING. I hver stilling der setet vårt
 * skal spille, løses stillingen eksakt med alle kort på bordet:
 *
 *   beste   = høyeste lagstikk noen lovlig kort kan gi
 *   vårt    = lagstikk kortet vi FAKTISK spilte gir
 *   anger   = beste − vårt        (alltid ≥ 0)
 *
 * Summert per stikknummer viser det hvor i runden stikkene forsvinner. Det er
 * den samme størrelsen bridgeanalyse kaller «double dummy error».
 *
 * HVA TALLET IKKE ER. Taket forutsetter at ALLE spiller perfekt resten av
 * runden, med alle kort synlige. Anger mot det er «ferdighet + informasjon»,
 * ikke ferdighet alene: en del av det er kunnskap ingen lovlig spiller kan
 * ha. Tallet skal derfor leses som en FORDELING over stikk – hvor ligger
 * tapet – ikke som en sum vi kan hente. Sammenlikningen mellom stikk er
 * gyldig; nivået er ikke.
 *
 * STIKK 1 ER UTE AV REKKEVIDDE. Full DD med 48 kort sprengte 4 GB heap i seks
 * skard (se `examples/dd-tak.ts`). Standard er derfor `--fraStikk 2`. Er
 * stikk 2 også for dyrt på din maskin, hev flagget – og les da resultatet med
 * det i mente, for da er de tidlige stikkene ikke målt, bare utelatt.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { byggDDOppsett } from "../src/solver/sampler.ts";
import { rotVerdier, kortTilInt } from "../src/solver/dds.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 200;
let kontrakt = 9;
let fraStikk = 2;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/sd-r2.bin";
/** Hvilket sete som måles: spillefoerer, makker eller forsvarer. */
let rolle = "spillefoerer";
let ut = "analyse/tap-per-stikk-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--fraStikk") fraStikk = Number(process.argv[++i]);
  else if (a === "--kandidat") kandidatSpek = process.argv[++i]!;
  else if (a === "--rolle") rolle = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--rapport") rapport = process.argv[++i]!;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}

// --- Rapportmodus: les skardene og skriv tabellen ---------------------------
if (rapport !== null) {
  const filer = rapport.split(",");
  interface B { n: number; anger: number; feil: number; sek: number }
  const per = new Map<number, B>();
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").trim().split("\n")) {
      if (l.trim() === "") continue;
      const r = JSON.parse(l) as { stikk: number; anger: number; sek: number };
      const b = per.get(r.stikk) ?? { n: 0, anger: 0, feil: 0, sek: 0 };
      b.n++;
      b.anger += r.anger;
      if (r.anger > 0) b.feil++;
      b.sek += r.sek;
      per.set(r.stikk, b);
    }
  }
  const stikk = [...per.keys()].sort((a, b) => a - b);
  const totalN = stikk.reduce((a, s) => a + per.get(s)!.n, 0);
  const totalA = stikk.reduce((a, s) => a + per.get(s)!.anger, 0);
  const linjer = [
    `\n=== Tap per stikk mot taket – ${rolle} ===`,
    `${totalN} beslutninger, kandidat ${kandidatSpek}, kontrakt ${kontrakt}.`,
    `Anger = (beste lovlige kort) − (kortet vi spilte), begge løst eksakt med`,
    `alle kort synlige. Alltid ≥ 0.`,
    ``,
    `stikk   beslutninger   anger/beslutning   andel med feil   andel av tapet`,
    `---------------------------------------------------------------------------`,
  ];
  for (const s of stikk) {
    const b = per.get(s)!;
    linjer.push(
      `${String(s + 1).padStart(4)}   ${String(b.n).padStart(12)}   ` +
        `${(b.anger / b.n).toFixed(4).padStart(16)}   ` +
        `${((100 * b.feil) / b.n).toFixed(1).padStart(13)} %   ` +
        `${((100 * b.anger) / Math.max(1e-9, totalA)).toFixed(1).padStart(13)} %`,
    );
  }
  linjer.push(
    `---------------------------------------------------------------------------`,
    `SUM                       ${totalA.toFixed(2)} stikk over ${totalN} beslutninger`,
    ``,
    `LESEVEILEDNING. «Andel av tapet» er kolonnen som svarer på hvor i runden`,
    `stikkene forsvinner – den summerer til 100 %. «Anger/beslutning» sier hvor`,
    `dyrt et enkeltvalg er der; de to skiller seg fordi antallet beslutninger`,
    `er ulikt per stikk (sent i runden er mange kort tvungne).`,
    ``,
    `Taket forutsetter perfekt spill av ALLE med alle kort synlige. Anger mot`,
    `det er ferdighet PLUSS informasjon vi ikke kan ha. Sammenlikningen mellom`,
    `stikk er gyldig; nivået er det ikke.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(kandidatSpek);
const nett = vakt !== null ? lesE1Nett(vakt.indre.slice(3)) : null;
const nevro = new NevroAgent();
const lagBot = (): { velgHandling(s: GameState): Handling; nyKamp(): void } =>
  vakt !== null && nett !== null ? new Konvensjonsvakt(new E1Agent(nett), vakt.valg) : new NevroAgent();

function oppsett(frø: number, budsete: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  if (besteTrumf(s.hender[budsete] ?? []).estimat < kontrakt - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  return s.fase === "BUDRUNDE" ? null : s;
}

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 5_500_000 + f;
  const budsete = frø % 4;
  let s = oppsett(frø, budsete);
  if (s === null) continue;

  // Alle fire seter spilles av kandidaten. Måler vi anger mot et tak som
  // forutsetter perfekt motspill, skal motspillet ikke være kunstig svakt.
  const seter = [0, 1, 2, 3].map(() => lagBot());
  for (const b of seter) b.nyKamp();
  let g = 0;
  while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) {
    s = utfør(s, seter[s.budvinner!]!.velgHandling(s)).state;
  }
  if (s.fase !== "SPILL") continue;

  const målsete =
    rolle === "spillefoerer"
      ? s.budvinner!
      : rolle === "makker"
        ? (s.makker ?? -1)
        : [0, 1, 2, 3].find((p) => p !== s!.budvinner && p !== s!.makker)!;
  if (målsete < 0) continue;

  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.iTur!;
    const valgt = seter[iTur]!.velgHandling(s);
    if (iTur === målsete && s.stikkSpilt >= fraStikk && valgt.type === "SPILL") {
      const lovlige = lovligeKort(s, iTur);
      if (lovlige.length >= 2) {
        const verden = {
          hender: s.hender.map((h) => h.map(kortTilInt)),
          declLag: [0, 1, 2, 3].map((p) => p === s!.budvinner || p === s!.makker),
          makkerVerden: s.makker,
        };
        const t0 = Date.now();
        const rot = rotVerdier(byggDDOppsett(s, verden));
        const sek = (Date.now() - t0) / 1000;
        // `rotVerdier` gir lagstikk for budlaget. Måler vi et FORSVARERSETE,
        // er setets egen interesse det motsatte: det vil ha budlaget NED.
        // Uten dette fortegnet ville forsvarsangeren blitt målt opp-ned.
        const forsvarer = målsete !== s.budvinner && målsete !== s.makker;
        const verdiAv = (k: number): number => {
          const r = rot.find((x) => x.kort === k);
          return r === undefined ? NaN : forsvarer ? -r.lagStikk : r.lagStikk;
        };
        const vårt = verdiAv(kortTilInt(valgt.kort));
        let beste = -Infinity;
        for (const k of lovlige) {
          const v = verdiAv(kortTilInt(k));
          if (Number.isFinite(v) && v > beste) beste = v;
        }
        if (Number.isFinite(vårt) && Number.isFinite(beste)) {
          appendFileSync(
            ut,
            JSON.stringify({
              frø,
              stikk: s.stikkSpilt,
              valg: lovlige.length,
              anger: Math.round((beste - vårt) * 1000) / 1000,
              sek,
            }) + "\n",
          );
          n++;
        }
      }
    }
    s = utfør(s, valgt).state;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} beslutninger, giv ${f + 1}/${kamper}   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} beslutninger → ${ut}`);
