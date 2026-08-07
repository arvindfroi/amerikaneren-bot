/**
 * SKAL MAKKEREN TRUMFE FØR BUDVINNEREN? Målt på utfallet.
 *
 *   node examples/makkertrumf.ts --kamper 12000 --skard 0/12
 *
 * ARVINDS HYPOTESE, ordrett: «det er bedre at makker trumfer et kort enn
 * budvinner hvis det gir de et stikk. dette forutsetter at noen andre spiller
 * ut og at budvinner spiller ut etter makkeren. siden da kan budvinner spare
 * en trumf OG kvitte seg med et svakt kort.»
 *
 * STILLINGEN, presist: en FORSVARER spiller ut, makkeren er i tur FØR
 * budvinneren i dette stikket, og makkeren kan lovlig trumfe. Trumfer
 * makkeren og tar stikket, slipper budvinneren – som spiller etter – å bruke
 * trumf, og kan i stedet kaste et svakt kort. Laget vinner stikket for én
 * trumf i stedet for to, og kvitter seg med en byrde på kjøpet.
 *
 * MEKANISMEN MÅLES, IKKE BARE UTFALLET. Hypotesen har to ledd: (1) laget
 * sparer en trumf, og (2) det lønner seg i poeng. Ledd 1 kan verifiseres
 * direkte – vi teller om budvinneren la trumf i det samme stikket – og det er
 * verdt å gjøre for seg. Et tiltak som gir poeng uten at mekanismen slår til
 * virker av en annen grunn enn vi tror, og da vet vi ikke når det slutter å
 * virke.
 *
 * MÅLT PÅ UTFALLET, etter Arvinds forslag: kortet legges i den EKTE giva og
 * runden spilles ferdig med de vanlige agentene. Ingen sampling, ingen
 * antakelse om perfekt spill, og – siden agentene er deterministiske – er
 * hver differanse EKSAKT for den giva.
 *
 * ARMENE:
 *   BOTEN       det boten faktisk spiller
 *   trumf       billigste trumf som VINNER stikket slik bordet står
 *   ikke trumf  billigste ikke-trumf (altså å la budvinneren om det)
 *
 * At «trumf» krever at trumfen faktisk VINNER er en del av hypotesen: å
 * trumfe under en høyere trumf gir ikke laget stikket, det brenner bare et
 * kort. Uten den betingelsen ville vi målt en annen regel enn den Arvind
 * beskrev.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, opprettSpill, stikkvinner, utfør, type GameState, type Handling } from "../src/index.ts";
import { type Kort } from "../src/kort.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 12000;
let kontrakt = 9;
let skardI = 0;
let skardN = 1;
let kandidatSpek = "vakt:ab:e1:e1-modell/d7alle.bin";
let ut = "analyse/makkertrumf-0.jsonl";
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
  stikk: number;
  /** Gjorde boten det Arvind foreslår? */
  botTrumfet: boolean;
  /** Arm → poengdifferanse for makkersetet. */
  diff: Record<string, number>;
  /** Arm → ble kontrakten innfridd? */
  klart: Record<string, number>;
  /** Arm → la BUDVINNEREN trumf i dette stikket? (mekanismen) */
  førerBruktTrumf: Record<string, number>;
  /** Arm → vant laget dette stikket? */
  vantStikket: Record<string, number>;
}

// --- Rapport ----------------------------------------------------------------
if (rapport !== null) {
  const rader: Linje[] = [];
  for (const f of rapport.split(",")) {
    for (const l of readFileSync(f, "utf8").split("\n")) {
      if (l.trim() === "") continue;
      try {
        rader.push(JSON.parse(l) as Linje);
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
  const hent = (nv: string, felt: keyof Linje): number[] =>
    rader.map((r) => (r[felt] as Record<string, number>)[nv] ?? NaN).filter(Number.isFinite);
  const par = (nv: string): string => {
    const d = rader.map((r) => (r.diff[nv] ?? NaN) - (r.diff["BOTEN"] ?? NaN)).filter(Number.isFinite);
    return `${snitt(d) >= 0 ? "+" : ""}${snitt(d).toFixed(3)} ± ${se(d).toFixed(3)} (${(snitt(d) / se(d)).toFixed(1)} SE)`;
  };
  const linjer = [
    `\n=== Skal makkeren trumfe foer budvinneren? ===`,
    `${rader.length} stillinger. Kandidat: ${kandidatSpek}, kontrakt ${kontrakt}.`,
    `Betingelse: en FORSVARER spilte ut, makkeren er i tur FOER budvinneren,`,
    `og makkeren har baade trumf som vinner OG et lovlig alternativ.`,
    ``,
    `Boten trumfer her i ${((100 * rader.filter((r) => r.botTrumfet).length) / Math.max(1, rader.length)).toFixed(0)} % av stillingene.`,
    ``,
    `arm              poengdiff mot boten     laget vant stikket   foerer brukte trumf   innfridd`,
    `-------------------------------------------------------------------------------------------`,
  ];
  for (const nv of ["trumf", "ikke trumf", "BOTEN"]) {
    if (hent(nv, "diff").length === 0) continue;
    linjer.push(
      `${nv.padEnd(16)} ${(nv === "BOTEN" ? "            –" : par(nv)).padStart(24)}   ` +
        `${(100 * snitt(hent(nv, "vantStikket"))).toFixed(1).padStart(14)} %   ` +
        `${(100 * snitt(hent(nv, "førerBruktTrumf"))).toFixed(1).padStart(15)} %   ` +
        `${(100 * snitt(hent(nv, "klart"))).toFixed(1).padStart(6)} %`,
    );
  }
  linjer.push(
    `-------------------------------------------------------------------------------------------`,
    ``,
    `MEKANISMEN Arvind beskrev er kolonnen «foerer brukte trumf»: trumfer`,
    `makkeren, skal budvinneren slippe aa gjoere det. Er de to armene like i`,
    `den kolonnen, virker et eventuelt poengutslag av en ANNEN grunn enn`,
    `hypotesen sier - og da vet vi ikke naar det slutter aa virke.`,
    ``,
    `Maalt paa utfallet i den ekte giva, ikke mot et orakel. Agentene er`,
    `deterministiske, saa hver differanse er eksakt for den giva. Regelen ser`,
    `bare egen haand og bordet, saa snittet er forventningsrett for regelen.`,
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

let n = 0;
for (let f = 0; f < kamper; f++) {
  if (f % skardN !== skardI) continue;
  const frø = 8_800_000 + f;
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

  const bv = s.budvinner!;
  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.iTur!;
    const makker = s.makker;
    const trumf = s.trumf!;
    const bordet = s.bord;
    // Betingelsen, ledd for ledd.
    const erMakker = makker !== null && iTur === makker && iTur !== bv;
    const forsvarerLedet =
      bordet.length > 0 && bordet[0]!.spiller !== bv && bordet[0]!.spiller !== makker;
    const førerIkkeSpilt = bordet.every((kp) => kp.spiller !== bv);
    if (erMakker && forsvarerLedet && førerIkkeSpilt) {
      const lovlige = lovligeKort(s, iTur);
      const vinnende = lovlige.filter((k) => {
        const etter = [...bordet, { spiller: iTur, kort: k }];
        return stikkvinner(etter, trumf) === iTur;
      });
      const vinnendeTrumf = vinnende.filter((k) => k.farge === trumf);
      const ikkeTrumf = lovlige.filter((k) => k.farge !== trumf);
      // Ekte valg: vi KAN trumfe og vinne, og vi KAN la det være.
      if (vinnendeTrumf.length > 0 && ikkeTrumf.length > 0) {
        const billigst = (v: readonly Kort[]): Kort =>
          [...v].sort((a, b) => a.verdi - b.verdi)[0]!;
        const armer: Record<string, Kort> = {
          trumf: billigst(vinnendeTrumf),
          "ikke trumf": billigst(ikkeTrumf),
        };
        const botValg = seter[iTur]!.velgHandling(s);
        if (botValg.type === "SPILL") armer["BOTEN"] = botValg.kort;

        const stikkNå = s.stikkSpilt;
        const diff: Record<string, number> = {};
        const klart: Record<string, number> = {};
        const førerBruktTrumf: Record<string, number> = {};
        const vantStikket: Record<string, number> = {};
        let ok = true;
        for (const [nv, kort] of Object.entries(armer)) {
          let t: GameState;
          try {
            t = utfør(s, { type: "SPILL", spiller: iTur, kort }).state;
          } catch {
            ok = false;
            break;
          }
          const arm = [0, 1, 2, 3].map(() => lagBot());
          for (const b of arm) b.nyKamp();
          let h = 0;
          while (t.fase !== "FERDIG" && t.fase !== "RUNDE_SLUTT" && h++ < 400) {
            t = utfør(t, arm[t.iTur!]!.velgHandling(t)).state;
          }
          const detteStikket = t.historikk[stikkNå];
          const førersKort = detteStikket?.kort.find((kp) => kp.spiller === bv)?.kort;
          førerBruktTrumf[nv] = førersKort !== undefined && førersKort.farge === trumf ? 1 : 0;
          const vinner = detteStikket?.vinner;
          vantStikket[nv] = vinner === bv || vinner === makker ? 1 : 0;
          const p = t.totalPoeng;
          const egne = p[iTur] ?? 0;
          diff[nv] = Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000;
          const st = t.stikkVunnet;
          klart[nv] = (st[bv] ?? 0) + (t.makker !== null ? (st[t.makker] ?? 0) : 0) >= kontrakt ? 1 : 0;
        }
        if (ok && armer["BOTEN"] !== undefined) {
          appendFileSync(
            ut,
            JSON.stringify({
              frø,
              stikk: stikkNå,
              botTrumfet: armer["BOTEN"]!.farge === trumf,
              diff,
              klart,
              førerBruktTrumf,
              vantStikket,
            } satisfies Linje) + "\n",
          );
          n++;
        }
      }
    }
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} stillinger   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} stillinger → ${ut}`);
