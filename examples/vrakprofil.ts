/**
 * VRAKET: hva gjør boten, og lønner det seg? Målt på utfallet.
 *
 *   node examples/vrakprofil.ts --kamper 8000 --skard 0/10
 *
 * ARVINDS SPØRSMÅL, punkt for punkt:
 *   «har vi sluttet å vrake trumf og ess?»
 *   «trekker vi inn trumf i taljongen?»
 *   «prøver vi å redusere antallet tapere og sorter på hånd hvis det lønner seg?»
 *   «jeg liker jo å kaste vekk en sort (eller 2 hvis mulig) for å kunne bruke
 *    trumf der. gjør våres bot det samme?»
 *
 * DE FIRE ER TO ULIKE SPØRSMÅL. «Hva gjør boten» er en beskrivelse og måles
 * ved å telle. «Lønner det seg» er en påstand om utfall og må måles mot
 * alternativet. Denne gjør begge, og holder dem fra hverandre.
 *
 * BESKRIVELSEN teller på botens faktiske vrak: hvor mange farger den tømmer,
 * om den beholder trumfen som kom i talongen, hvor mange tapere den sitter
 * igjen med, og hvor ofte den kaster en honnør.
 *
 * UTFALLET setter botens vrak opp mot faste alternativer på NØYAKTIG samme
 * giv. Hvert kandidatvrak legges, runden spilles ferdig i den EKTE giva, og
 * poengene leses av. Agentene er deterministiske, så differansen er eksakt for
 * den giva – ikke et estimat. Det er Arvinds egen målemetode, og den som ga
 * den eneste bekreftede forbedringen så langt.
 *
 * VIKTIG OM REKKEFØLGEN: vraket skjer FØR trumfen velges. En regel som vil
 * «tømme en farge for å kunne trumfe der» må derfor gjette hvilken farge som
 * blir trumf. Alle reglene her bruker den lengste fargen på hånden som
 * trumfkandidat – det er den samme antakelsen `fastTrumfvalg` gjør, og den er
 * riktig i det store flertallet av tilfellene.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { FARGER, type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 8000;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:abmp:e1:e1-modell/d7alle.bin";
let ut = "analyse/vrakprofil-0.jsonl";
let rapport: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
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
  frø: number;
  /** Beskrivelsen av BOTENS eget vrak. */
  tømteFarger: number;
  vrakHonnør: number;
  vrakTrumfkandidat: number;
  /** Trumfkandidat-kort som kom i talongen og ble BEHOLDT. */
  beholdtTalongtrumf: number;
  talongtrumf: number;
  /** Tapere igjen: kort utenfor trumfkandidaten som ikke er ess. */
  tapereIgjen: number;
  /** Arm → poengdifferanse for budvinneren. */
  diff: Record<string, number>;
  klart: Record<string, number>;
  tømt: Record<string, number>;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const r: Linje[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        r.push(JSON.parse(l) as Linje);
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
  const fordeling = (f: (x: Linje) => number): string =>
    [0, 1, 2, 3]
      .map((k) => `${k}: ${((100 * r.filter((x) => f(x) === k).length) / r.length).toFixed(0)} %`)
      .join("   ");

  const navn = Object.keys(r[0]?.diff ?? {}).filter((x) => x !== "BOTEN");
  const rad = navn
    .map((nv) => {
      const d = r.map((x) => (x.diff[nv] ?? NaN) - (x.diff["BOTEN"] ?? NaN)).filter(Number.isFinite);
      return {
        nv,
        m: snitt(d),
        se: se(d),
        klart: snitt(r.map((x) => x.klart[nv] ?? NaN).filter(Number.isFinite)),
        tømt: snitt(r.map((x) => x.tømt[nv] ?? NaN).filter(Number.isFinite)),
      };
    })
    .sort((a, b) => b.m - a.m);

  const linjer = [
    `\n=== Vraket: hva gjoer boten, og loenner det seg? ===`,
    `${r.length} giver, tvungen kontrakt ${kontrakt}, kandidat ${kandidatSpek}.`,
    ``,
    `HVA BOTEN GJOER (beskrivelse, ikke dom)`,
    `  farger toemt av vraket        ${snitt(r.map((x) => x.tømteFarger)).toFixed(2)}`,
    `    fordelt                     ${fordeling((x) => x.tømteFarger)}`,
    `  vraket en honnoer (K/D/E)     ${((100 * r.filter((x) => x.vrakHonnør > 0).length) / r.length).toFixed(1)} % av givene`,
    `  vraket et trumfkandidatkort   ${((100 * r.filter((x) => x.vrakTrumfkandidat > 0).length) / r.length).toFixed(1)} %`,
    `  trumf som kom i talongen      ${snitt(r.map((x) => x.talongtrumf)).toFixed(2)} kort per giv`,
    `    av dem BEHOLDT              ${((100 * snitt(r.map((x) => x.beholdtTalongtrumf))) / Math.max(0.001, snitt(r.map((x) => x.talongtrumf)))).toFixed(1)} %`,
    `  tapere igjen etter vraket     ${snitt(r.map((x) => x.tapereIgjen)).toFixed(2)}`,
    ``,
    `LOENNER DET SEG? Faste vrakregler mot botens eget valg, parret paa giv.`,
    ``,
    `regel                          mot boten              toemte farger   innfridd`,
    `-------------------------------------------------------------------------------`,
  ];
  for (const x of rad) {
    linjer.push(
      `${x.nv.padEnd(30)} ${(x.m >= 0 ? "+" : "") + x.m.toFixed(3)} ± ${x.se.toFixed(3)} ` +
        `(${(x.m / x.se).toFixed(1)} SE)   ${x.tømt.toFixed(2).padStart(11)}   ` +
        `${(100 * x.klart).toFixed(1).padStart(6)} %`,
    );
  }
  linjer.push(
    `${"BOTEN".padEnd(30)} ${"        –".padStart(22)}   ` +
      `${snitt(r.map((x) => x.tømteFarger)).toFixed(2).padStart(11)}   ` +
      `${(100 * snitt(r.map((x) => x.klart["BOTEN"] ?? NaN).filter(Number.isFinite))).toFixed(1).padStart(6)} %`,
    `-------------------------------------------------------------------------------`,
    ``,
    `Positivt = regelen gir budvinneren MER poengdifferanse enn botens eget`,
    `vrak, paa noeyaktig samme giv. Slaar «toem flest farger» boten, vraker`,
    `boten for lite aggressivt - slaar den ikke, gjoer boten alt det Arvind`,
    `beskriver, og mer aggresjon koster.`,
    ``,
    `MERK at vraket skjer FOER trumfen velges, saa alle reglene gjetter at den`,
    `lengste fargen blir trumf. Det er samme antakelse som fastTrumfvalg gjoer.`,
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

const tell = (h: readonly Kort[]): Record<Farge, Kort[]> => {
  const t = { S: [], H: [], R: [], K: [] } as Record<Farge, Kort[]>;
  for (const k of h) t[k.farge].push(k);
  return t;
};

/** Faste vrakregler. Alle ser BARE de 16 kortene paa haanden. */
function regler(hånd16: readonly Kort[], antall: number): Record<string, Kort[]> {
  const t = tell(hånd16);
  // Trumfkandidat: lengste farge. Samme antakelse som fastTrumfvalg.
  const trumf = (FARGER as readonly Farge[]).reduce((a, b) => (t[b].length > t[a].length ? b : a), "S" as Farge);
  const utenfor = hånd16.filter((k) => k.farge !== trumf).sort((a, b) => a.verdi - b.verdi);
  const alle = [...hånd16].sort((a, b) => a.verdi - b.verdi);

  /** Toem saa mange farger som mulig, deretter lavest. */
  const tømFlest = (): Kort[] => {
    const farger = (FARGER as readonly Farge[])
      .filter((f) => f !== trumf && t[f].length > 0)
      .sort((a, b) => t[a].length - t[b].length);
    const ut: Kort[] = [];
    for (const f of farger) {
      if (ut.length + t[f].length <= antall) ut.push(...t[f]);
    }
    for (const k of utenfor) {
      if (ut.length >= antall) break;
      if (!ut.includes(k)) ut.push(k);
    }
    return ut.slice(0, antall);
  };
  /** Toem BARE hvis en hel farge gaar inn i vraket; ellers lavest utenfor. */
  const tømNøyaktig = (): Kort[] => {
    const farger = (FARGER as readonly Farge[])
      .filter((f) => f !== trumf && t[f].length > 0 && t[f].length <= antall)
      .sort((a, b) => b.length - a.length);
    const beste = farger[0];
    const ut: Kort[] = beste === undefined ? [] : [...t[beste]];
    for (const k of utenfor) {
      if (ut.length >= antall) break;
      if (!ut.includes(k)) ut.push(k);
    }
    return ut.slice(0, antall);
  };

  return {
    "toem flest farger": tømFlest(),
    "toem EN hel farge": tømNøyaktig(),
    "lavest utenfor trumf": utenfor.slice(0, antall),
    "lavest uansett": alle.slice(0, antall),
  };
}

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 4_400_000 + f;
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
  if (s.fase !== "VRAK" || s.budvinner !== budsete) continue;

  const start = s;
  const hånd16 = (s.hender[budsete] ?? []).slice();
  const antall = s.giving.talong;
  if (hånd16.length !== 16) continue;
  // Talongen er de fire siste – motoren la dem til på hånden i `avsluttBudrunde`.
  const talong = hånd16.slice(12);
  const t16 = tell(hånd16);
  const trumfKand = (FARGER as readonly Farge[]).reduce(
    (a, b) => (t16[b].length > t16[a].length ? b : a),
    "S" as Farge,
  );

  /** Legg vraket og spill runden ferdig i den EKTE giva. */
  const utfall = (vrakKort: readonly Kort[]): { diff: number; klart: number; tømt: number } | null => {
    let t: GameState;
    try {
      t = utfør(start, { type: "VRAK", spiller: budsete, kort: vrakKort.slice() }).state;
    } catch {
      return null;
    }
    const igjen = t.hender[budsete] ?? [];
    const ti = tell(igjen);
    const tømt = (FARGER as readonly Farge[]).filter((x) => t16[x].length > 0 && ti[x].length === 0).length;
    const seter = [0, 1, 2, 3].map(() => lagBot());
    for (const b of seter) b.nyKamp();
    let h = 0;
    while (t.fase !== "FERDIG" && t.fase !== "RUNDE_SLUTT" && h++ < 400) {
      const iTur = t.fase === "VRAK" || t.fase === "VELG" ? t.budvinner! : t.iTur!;
      t = utfør(t, seter[iTur]!.velgHandling(t)).state;
    }
    const p = t.totalPoeng;
    const egne = p[budsete] ?? 0;
    const st = t.stikkVunnet;
    const lag = (st[budsete] ?? 0) + (t.makker !== null ? (st[t.makker] ?? 0) : 0);
    return {
      diff: Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000,
      klart: lag >= kontrakt ? 1 : 0,
      tømt,
    };
  };

  const botVrak = lagBot().velgHandling(start);
  if (botVrak.type !== "VRAK") continue;
  const armer: Record<string, readonly Kort[]> = { BOTEN: botVrak.kort, ...regler(hånd16, antall) };
  const diff: Record<string, number> = {};
  const klart: Record<string, number> = {};
  const tømt: Record<string, number> = {};
  let ok = true;
  for (const [nv, kort] of Object.entries(armer)) {
    const r = utfall(kort);
    if (r === null) {
      ok = false;
      break;
    }
    diff[nv] = r.diff;
    klart[nv] = r.klart;
    tømt[nv] = r.tømt;
  }
  if (!ok) continue;

  // Beskrivelsen av botens eget vrak.
  const vrakSett = new Set(botVrak.kort.map((k) => `${k.farge}${k.verdi}`));
  const igjen = hånd16.filter((k) => !vrakSett.has(`${k.farge}${k.verdi}`));
  const ti = tell(igjen);
  const talongTrumf = talong.filter((k) => k.farge === trumfKand);
  appendFileSync(
    ut,
    JSON.stringify({
      frø,
      tømteFarger: (FARGER as readonly Farge[]).filter((x) => t16[x].length > 0 && ti[x].length === 0).length,
      vrakHonnør: botVrak.kort.filter((k) => k.verdi >= 13).length,
      vrakTrumfkandidat: botVrak.kort.filter((k) => k.farge === trumfKand).length,
      talongtrumf: talongTrumf.length,
      beholdtTalongtrumf: talongTrumf.filter((k) => !vrakSett.has(`${k.farge}${k.verdi}`)).length,
      tapereIgjen: igjen.filter((k) => k.farge !== trumfKand && k.verdi < 14).length,
      diff,
      klart,
      tømt,
    } satisfies Linje) + "\n",
  );
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} giver   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} giver → ${ut}`);
