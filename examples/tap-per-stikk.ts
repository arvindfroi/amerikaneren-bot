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
import { vurderKortSD } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
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
/**
 * HVILKEN FASIT ANGEREN MAALES MOT. Dette er ikke en detalj, det er hele
 * gyldigheten av maalingen.
 *
 *   dd  dobbelt dummy, alle kort synlige. Maaler avstand til et tak ingen
 *       kan naa. AVVIST som fasit av godkjenningsporten: -0,609 korrigert
 *       korrelasjon mot poeng. Aa foelge den er MAALT skadelig.
 *   sd  single dummy, samplede verdener. GODKJENT av porten: +0,718.
 *
 * Foerste graverunde brukte dd og fant at spillefoereren «trumfer for mye».
 * Regelen som fulgte (vakt-flagg d) maalte -0,171 +/- 0,028 - altsaa verre.
 * Det var ikke uflaks: aa lete etter regler i DD-anger er aa lete etter
 * steder vi avviker fra en policy vi allerede vet er daarligere enn vaar
 * egen. Signalet var ekte og pekte feil vei.
 */
let fasit = "sd";
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
  else if (a === "--fasit") fasit = process.argv[++i]!;
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

/**
 * TRUMFBILDET slik setet lovlig ser det.
 *
 * Overtrumfing bærer 61 % av spilleførerens tap (`analyse/regelgraving-*`),
 * så disse feltene finnes for å finne den STRUKTURELLE formen på feilen. Det
 * klassiske skillet i stikkspill er om man sitter med den høyeste trumfen
 * som er ute: gjør man det, trekker man trumf; gjør man det ikke, gir hvert
 * trumfutspill motparten et gratis stikk å velge tidspunkt for.
 *
 * Alt utledes av egen hånd og de åpent spilte kortene – ingen skjulte hender.
 */
function trumfbilde(
  s: GameState,
  sete: number,
  egen: readonly { farge: string; verdi: number }[],
  trumf: string | null,
): Record<string, number | boolean> {
  if (trumf === null) return { trumfIgjenUte: -1, harHøyesteTrumf: false, egneTrumf: 0 };
  const sett = new Set<string>();
  for (const k of egen) sett.add(`${k.farge}${k.verdi}`);
  for (const stikk of s.historikk) for (const kp of stikk.kort) sett.add(`${kp.kort.farge}${kp.kort.verdi}`);
  for (const kp of s.bord) sett.add(`${kp.kort.farge}${kp.kort.verdi}`);
  // Budvinneren vet i tillegg at hans eget vrak er dødt.
  if (sete === s.budvinner) for (const k of s.vrak) sett.add(`${k.farge}${k.verdi}`);

  let ute = 0;
  let høyestUte = 0;
  for (let v = 2; v <= 14; v++) {
    if (sett.has(`${trumf}${v}`)) continue;
    ute++;
    if (v > høyestUte) høyestUte = v;
  }
  const egneTrumf = egen.filter((k) => k.farge === trumf);
  const minHøyeste = egneTrumf.reduce((a, k) => Math.max(a, k.verdi), 0);
  return {
    trumfIgjenUte: ute,
    // Sitter vi med en trumf høyere enn alt som fortsatt er ute?
    harHøyesteTrumf: minHøyeste > høyestUte,
    egneTrumf: egneTrumf.length,
  };
}

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

const sdRng = lagRng((0x5d + skardI * 7919) >>> 0);
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
        // SD sampler verdener og er den fasiten som bestod porten. DD loeser
        // den ekte verdenen eksakt og er et TAK, ikke en laerer.
        const sdVerdi = new Map<number, number>();
        let rot: { kort: number; lagStikk: number }[] = [];
        if (fasit === "sd") {
          for (const v of vurderKortSD(s, iTur, nevro, { verdener: 12, rng: sdRng })) {
            sdVerdi.set(kortTilInt(v.kort), v.verdi);
          }
          if (sdVerdi.size === 0) {
            s = utfør(s, valgt).state;
            continue;
          }
        } else {
          rot = rotVerdier(byggDDOppsett(s, verden));
        }
        const sek = (Date.now() - t0) / 1000;
        // `rotVerdier` gir lagstikk for budlaget. Måler vi et FORSVARERSETE,
        // er setets egen interesse det motsatte: det vil ha budlaget NED.
        // Uten dette fortegnet ville forsvarsangeren blitt målt opp-ned.
        const forsvarer = målsete !== s.budvinner && målsete !== s.makker;
        const verdiAv = (k: number): number => {
          if (fasit === "sd") {
            const v = sdVerdi.get(k);
            // SD-maalet er alt setets EGNE poeng minus de andres, saa
            // fortegnet er allerede riktig for rollen. DD gir lagstikk for
            // budlaget og maa snus for en forsvarer.
            return v === undefined ? NaN : v;
          }
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
          /**
           * KJENNETEGN VED BESLUTNINGEN, logget for å kunne LETE etter en
           * regel i ettertid. Tapsfordelingen sier HVOR vi blør (stikk 3–7);
           * disse feltene er det som skal til for å si HVA vi gjør galt der.
           *
           * Konvensjonsvakten er bygget av nettopp slike funn, og formen som
           * har virket er alltid den samme: en strukturelt gjenkjennelig
           * bommert som kan forbys uten å kunne ta noe fra oss. Feltene er
           * derfor valgt slik at de kan uttrykkes av en regel som bare ser
           * det setet selv ser.
           */
          const trumf = s.trumf;
          const bordet = s.bord;
          const led = bordet[0]?.kort.farge ?? null;
          const egen = s.hender[iTur] ?? [];
          const besteKort = lovlige.find((k) => verdiAv(kortTilInt(k)) === beste) ?? lovlige[0]!;
          const valgtKort = valgt.kort;
          // Hvem leder stikket akkurat nå, og er det makkeren vår?
          let ledende: number | null = null;
          if (bordet.length > 0) {
            let best = bordet[0]!;
            for (const kp of bordet) {
              const bTrumf = best.kort.farge === trumf;
              const kTrumf = kp.kort.farge === trumf;
              if (kTrumf && !bTrumf) best = kp;
              else if (kTrumf === bTrumf && kp.kort.farge === best.kort.farge && kp.kort.verdi > best.kort.verdi) {
                best = kp;
              }
            }
            ledende = best.spiller;
          }
          const laget = (p: number | null): boolean =>
            p !== null && (p === s!.budvinner || p === s!.makker);
          const sorterte = [...lovlige].sort((a, b) => a.verdi - b.verdi);
          appendFileSync(
            ut,
            JSON.stringify({
              frø,
              stikk: s.stikkSpilt,
              valg: lovlige.length,
              anger: Math.round((beste - vårt) * 1000) / 1000,
              sek,
              // posisjon i stikket: 0 = vi spiller ut, 3 = vi er sist
              pos: bordet.length,
              // fulgte vi farge, eller var vi renons?
              renons: led !== null && !egen.some((k) => k.farge === led),
              // trumf involvert
              vårTrumf: valgtKort.farge === trumf,
              besteTrumf: besteKort.farge === trumf,
              // høyeste/laveste av de lovlige
              vårHøyest: valgtKort.verdi === sorterte[sorterte.length - 1]!.verdi,
              vårLavest: valgtKort.verdi === sorterte[0]!.verdi,
              besteHøyest: besteKort.verdi === sorterte[sorterte.length - 1]!.verdi,
              besteLavest: besteKort.verdi === sorterte[0]!.verdi,
              // ledet vårt eget lag stikket da vi skulle spille?
              egetLagLedet: laget(ledende),
              makkerLedet: ledende !== null && ledende === s.makker && iTur !== s.makker,
              makkerAvslørt: s.makkerAvslørt,
              ...trumfbilde(s, iTur, egen, trumf),
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
