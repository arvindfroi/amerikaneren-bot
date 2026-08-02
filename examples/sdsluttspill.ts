/**
 * SØK I DELER AV SPILLET: SD-søk fra stikk N og ut, nettet før det.
 *
 *   node examples/sdsluttspill.ts --giver 1200 --skard 0/8
 *
 * ARVIND: «når det kommer til søk så liker jeg ideen i deler av spillet, men
 * det er veldig tregt. men det kan jo implementeres, men da må det også ha
 * dybden på plass.»
 *
 * ==================== HVORFOR DYBDE HAR GJORT DET VERRE =====================
 *
 * Intuisjonen er riktig for perfekt informasjon og feil her. Eksakt sluttspill
 * med FULL enumerasjon av alle forenlige verdener målte
 *
 *   terskel 2 → −0,017      terskel 3 → −0,289      terskel 4 → −0,778
 *
 * altså monotont DÅRLIGERE jo dypere. Enumerasjonen fjernet samplingstøyen og
 * gjorde det verre – så det er ikke et budsjettproblem. Dobbelt dummy løser
 * feil spill: den antar at alle, også vi selv senere i runden, får vite hvilken
 * verden det var. Da velges linjer som bare virker med allvitenhet.
 *
 * DEN RIKTIGE SØKEFORMEN er SD: sample verdener, men spill dem ut med en
 * POLICY i stedet for å løse dem eksakt. Den bestod godkjenningsporten med
 * +0,718 der DD ble avvist med −0,609. `SDAgent` kan kjøre den fra et gitt
 * stikk og la nettet spille før det – som er nøyaktig «søk i deler av spillet».
 *
 * ======================= DET DENNE MÅLINGEN AVGJØR =========================
 *
 * To akser som må skilles, og som en enkelt kjøring ville blandet:
 *
 *   FRA HVILKET STIKK søket overtar. Sent = billig og lite å hente; tidlig =
 *   dyrt og mer å hente. Kurven over dette ER svaret på hvor søk lønner seg.
 *
 *   HVOR MANGE VERDENER det sampler. Det er «dybden» i Arvinds forstand: med
 *   for få er argmax over dem støy, akkurat som i budregnestykket, der
 *   vippepunktet lå på K = 24.
 *
 * KOSTNADEN LOGGES per beslutning, så gevinsten kan leses mot den. Et søk som
 * henter +0,05 for 40 ms per kortvalg er brukbart på nettsiden; det samme for
 * 4 sekunder er det ikke.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { SDAgent } from "../src/moe2/sdagent.ts";

let giver = 1200;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
let basisSpek = "vakt:abmp:e1:e1-modell/sd-r2.bin";
let ut = "analyse/sdslutt-0.jsonl";
let rapport: string | null = null;
/** (fraStikk, verdener)-parene som prøves. */
const OPPSETT: { fra: number; k: number }[] = [
  { fra: 9, k: 12 },
  { fra: 9, k: 24 },
  { fra: 7, k: 12 },
  { fra: 7, k: 24 },
  { fra: 5, k: 12 },
  { fra: 5, k: 24 },
];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--basis") basisSpek = process.argv[++i]!;
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
  /** Arm → lagstikk for budlaget. */
  lag: Record<string, number>;
  /** Arm → sekunder brukt av det setet som søkte. */
  sek: Record<string, number>;
}

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
  const sn = (v: readonly number[]): number => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
  const se = (v: readonly number[]): number => {
    if (v.length < 2) return NaN;
    const m = sn(v);
    let s = 0;
    for (const x of v) s += (x - m) * (x - m);
    return Math.sqrt(s / (v.length - 1) / v.length);
  };
  const linjer = [
    `\n=== SD-soek fra stikk N og ut, nettet foer det ===`,
    `${R.length} giver, tvungen kontrakt ${kontrakt}. Basis: ${basisSpek} i alle seter.`,
    `Bare BUDVINNERENS sete soeker; alt annet er identisk.`,
    ``,
    `arm              lagstikk mot basis        ms per runde`,
    `-----------------------------------------------------------`,
  ];
  for (const o of OPPSETT) {
    const nv = `fra${o.fra}k${o.k}`;
    const d = R.map((r) => (r.lag[nv] ?? NaN) - (r.lag["BASIS"] ?? NaN)).filter(Number.isFinite);
    if (d.length < 20) continue;
    const ms = sn(R.map((r) => (r.sek[nv] ?? NaN) * 1000).filter(Number.isFinite));
    linjer.push(
      `stikk ${o.fra}, K=${String(o.k).padEnd(3)} ${(sn(d) >= 0 ? "+" : "") + sn(d).toFixed(4)} ± ${se(d).toFixed(4)} ` +
        `(${(sn(d) / se(d)).toFixed(1)} SE)   ${ms.toFixed(0).padStart(8)}`,
    );
  }
  linjer.push(
    `-----------------------------------------------------------`,
    ``,
    `Positivt = soeket henter stikk. Kolonnen til hoeyre er hva det KOSTER;`,
    `en gevinst maa leses mot den. Nettsiden taaler noen hundre ms per`,
    `kortvalg - menneskene bruker 4,1 s paa sine.`,
    ``,
    `SAMMENLIKN MED DEN EKSAKTE VARIANTEN, som ble maalt paa samme akse:`,
    `terskel 2 -> -0,017, terskel 3 -> -0,289, terskel 4 -> -0,778. Blir`,
    `SD-kurven positiv der DD-kurven var negativ, er det FASITEN i soeket som`,
    `var feil - ikke soek som idé.`,
  );
  const tekst = linjer.join("\n");
  console.log(tekst);
  writeFileSync(rapport.split(",")[0]!.replace(/-\d+\.jsonl$/, ".txt"), tekst + "\n");
  process.exit(0);
}

mkdirSync(dirname(ut), { recursive: true });
const vakt = delVaktspek(basisSpek)!;
const nett = lesE1Nett(vakt.indre.slice(3));
const nevro = new NevroAgent();
type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };
const lagBasis = (): Velger => new Konvensjonsvakt(new E1Agent(nett), vakt.valg);

let n = 0;
for (let f = 0; f < giver; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 6_100_000 + f;
  const budsete = frø % 4;
  let s0: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s0.fase === "BUDRUNDE" && s0.iTur !== budsete && g++ < 8) {
    s0 = utfør(s0, { type: "BUD", spiller: s0.iTur!, bud: "PASS" }).state;
  }
  if (s0.fase !== "BUDRUNDE" || s0.iTur !== budsete) continue;
  if (besteTrumf(s0.hender[budsete] ?? []).estimat < kontrakt - 3.5) continue;
  try {
    s0 = utfør(s0, { type: "BUD", spiller: budsete, bud: kontrakt }).state;
  } catch {
    continue;
  }
  g = 0;
  while (s0.fase === "BUDRUNDE" && g++ < 8) s0 = utfør(s0, { type: "BUD", spiller: s0.iTur!, bud: "PASS" }).state;
  if (s0.fase === "BUDRUNDE") continue;

  /** Spiller runden med `søker` i budvinnersetet. null = ren basis. */
  const kjør = (søker: Velger | null): { lag: number; sek: number } | null => {
    let s = s0;
    const seter: Velger[] = [0, 1, 2, 3].map(() => lagBasis());
    if (søker !== null) seter[budsete] = søker;
    for (const b of seter) b.nyKamp();
    const t0 = Date.now();
    let h = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && h++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
      s = utfør(s, seter[iTur]!.velgHandling(s)).state;
    }
    if (s.fase === "BUDRUNDE" || s.budvinner === null) return null;
    const st = s.stikkVunnet;
    return {
      lag: (st[s.budvinner] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0),
      sek: (Date.now() - t0) / 1000,
    };
  };

  const basis = kjør(null);
  if (basis === null) continue;
  const lag: Record<string, number> = { BASIS: basis.lag };
  const sek: Record<string, number> = { BASIS: basis.sek };
  let ok = true;
  for (const o of OPPSETT) {
    // MOTPARTEN i rolloutene er vaar egen beste bot, ikke nevro. Vi slaar
    // nevro med +0,26 som spillefoerer, saa nevro som rollout-policy ville
    // systematisk undervurdert de linjene som krever god oppfoelging fra oss.
    const søker = new SDAgent(lagBasis(), {
      verdener: o.k,
      fraStikk: o.fra,
      frø: frø ^ 0x5bd1,
      egen: lagBasis(),
    });
    const r = kjør(søker as unknown as Velger);
    if (r === null) {
      ok = false;
      break;
    }
    lag[`fra${o.fra}k${o.k}`] = r.lag;
    sek[`fra${o.fra}k${o.k}`] = r.sek;
  }
  if (!ok) continue;
  appendFileSync(ut, JSON.stringify({ frø, lag, sek } satisfies Linje) + "\n");
  n++;
  process.stdout.write(`\r  skard ${skardI}: ${n} giver   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} giver → ${ut}`);
