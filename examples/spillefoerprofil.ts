/**
 * SPILLEFØRERPROFILEN – speilbildet av forsvarsprofil.ts.
 *
 *   node examples/spillefoerprofil.ts nevro e1:e1-modell/sd-r2.bin \
 *        vakt:at:e1:e1-modell/sd-r2.bin --kamper 1500 --kontrakt 9
 *
 * HVORFOR. Fasegapet mot MesterAI (`analyse/fasegap-sdr2-*.jsonl`) sier at hele
 * tapet ligger i spillefører­rollen, og at det avgjørende tallet er
 * `lagstikk − SD`: −0,01 for oss, +0,30 for MesterAI. Med hånden holdt fast av
 * orakelet er det spilleføringens eget bidrag.
 *
 * Det tallet var tvetydig, for det kunne like gjerne bety at FORSVARET vårt er
 * svakere enn nevro – som er motstandermodellen SD antar. Forsvarsmålingen
 * avkreftet det: sd-r2 forsvarer identisk med nevro (+0,005 ± 0,042 stikk over
 * 573 givere), selv om 40 % av kortvalgene er forskjellige. Da må resten ligge
 * i spilleføringen, og her måles den direkte.
 *
 * OPPSETTET er forsvarsprofilens, speilvendt: kontrakten TVINGES på ett sete,
 * kandidaten fører den, og de tre andre setene er NevroHjerne. Alle
 * kandidatene får NØYAKTIG de samme giverne og den samme motstanden, så
 * differansen er parret og måles på identisk materiale.
 *
 * REFERANSEN er den samme som fasegapet bruker: `analyserGiv` + `sdBud` gir
 * hva giva bærer for akkurat det setet. `lagstikk − SD` kan derfor leses rett
 * mot MesterAIs +0,30 fra fasegaprapporten – samme metrikk, samme enhet.
 *
 * MERK at SD-referansen selv er en nevro-rollout. «lagstikk − SD ≈ 0» betyr
 * altså «vi fører kontrakten omtrent som nevro ville gjort», ikke «vi henter
 * alt som er å hente». Det er nettopp poenget: MesterAI ligger over den
 * referansen, så en fasit bygget på nevro-rollouts kan ikke lære oss dit.
 */

import { writeFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { NevroAgent, besteTrumf } from "../src/nevro/index.ts";
import { velgHandling as pimcVelg } from "../src/bot/bot.ts";
import { analyserGiv, sdBud, tømCache } from "../src/neat/singledummy.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let kamper = 1500;
let kontrakt = 9;
let utFil = "analyse/spillefoerprofil.txt";
/**
 * Hvilket sete kandidaten sitter i. `spillefører` er benken som fant at
 * vakten er verdt +0,26 stikk. `makker` er den samme benken speilvendt:
 * NevroHjerne fører kontrakten, og kandidaten holder det etterlyste kortet.
 *
 * Makkersetet har aldri vært målt for seg. Det er verdt å gjøre fordi de to
 * målingene vi har spriker: fasegapet mot MesterAI sier makkerrollen er
 * NØYTRAL (−11 % av gapet, altså i vår favør), mens menneskedataene sier at
 * et menneske på budlaget løfter kontraktprosenten fra 0,274 til 0,833.
 * Enten er MesterAI like svak som oss i det setet, eller så måler de to
 * benkene ulike ting. Uansett er det ingen regel der i dag.
 */
let rolle: "spillefører" | "makker" = "spillefører";
/**
 * Hvem som spiller de ANDRE tre setene. Standard er NevroHjerne.
 *
 * Flagget finnes fordi makkermålingen med nevro som spillefører er tvetydig
 * på nøyaktig Arvinds poeng: samspillet mellom budvinner og makker er en
 * FELLES egenskap, og en god makker har lite å støtte når spilleføreren er
 * svak. Settes `--andre vakt:ab:e1:...`, føres kontrakten av vår beste
 * spillefører, og da måles makkeren i den stillingen den faktisk skal virke i.
 */
let frøBase = 1_700_000;
let andreSpec = "nevro";
const spesser: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--kamper") kamper = Number(process.argv[++i]);
  else if (a === "--kontrakt") kontrakt = Number(process.argv[++i]);
  else if (a === "--ut") utFil = process.argv[++i]!;
  else if (a === "--rolle") {
    const r = process.argv[++i]!;
    if (r !== "spillefører" && r !== "makker") throw new Error(`--rolle må være spillefører eller makker, ikke «${r}»`);
    rolle = r;
  } else if (a === "--andre") andreSpec = process.argv[++i]!;
  else spesser.push(a);
}

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };

function lagKandidat(spec: string): { navn: string; lag: () => Velger } {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return { navn: `v${vakt.flagg}:${indre.navn}`.slice(0, 14), lag: () => new Konvensjonsvakt(indre.lag(), vakt.valg) };
  }
  if (spec === "nevro") return { navn: "NevroHjerne", lag: () => new NevroAgent() };
  // TAKPRØVE. PIMC er for tregt til å brukes i appen, men det er en langt
  // sterkere spiller enn nettet. Ligger den ikke over nevro i et sete, er det
  // setet mettet – da finnes det ingenting å hente der, verken med regler
  // eller med trening, og letingen hører hjemme et annet sted.
  if (spec.startsWith("pimc")) {
    const verdener = Number(spec.split(":")[1] ?? 24);
    let teller = 0;
    return {
      navn: `PIMC${verdener}`,
      lag: () => ({
        nyKamp: () => { teller = 0; },
        velgHandling: (s: GameState): Handling =>
          pimcVelg(s, { verdener, terskel: 6, frø: (0x5eed + Math.imul(teller++, 0x9e3779b1)) >>> 0 }),
      }),
    };
  }
  if (spec.startsWith("e1:")) {
    const fil = spec.slice(3);
    const nett = lesE1Nett(fil);
    return { navn: fil.split(/[\\/]/).pop()!.replace(".bin", "").slice(0, 14), lag: () => new E1Agent(nett) };
  }
  throw new Error(`Ukjent kandidat «${spec}» (bruk nevro, e1:<fil> eller vakt:<flagg>:<indre>)`);
}

/** Tvinger kontrakten `k` på `budsete`. Null hvis giva ikke tåler det. */
function oppsett(frø: number, budsete: number, k: number): GameState | null {
  let s = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  while (s.fase === "BUDRUNDE" && s.iTur !== budsete && g++ < 8) {
    s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  }
  if (s.fase !== "BUDRUNDE" || s.iTur !== budsete) return null;
  // Samme filter som forsvarsprofil.ts: giva må i det minste være i nærheten
  // av kontrakten, ellers måler vi håpløse hender i stedet for spilleføring.
  if (besteTrumf(s.hender[budsete] ?? []).estimat < k - 3.5) return null;
  try {
    s = utfør(s, { type: "BUD", spiller: budsete, bud: k }).state;
  } catch {
    return null;
  }
  g = 0;
  while (s.fase === "BUDRUNDE" && g++ < 8) s = utfør(s, { type: "BUD", spiller: s.iTur!, bud: "PASS" }).state;
  return s.fase === "BUDRUNDE" ? null : s;
}

interface Rad {
  readonly lagStikk: number[];
  readonly motSD: number[];
  readonly klarte: number[];
  /** Kortvalg der kandidaten valgte noe annet enn nevro ville gjort. */
  valg: number;
  ulikNevro: number;
}
const nyRad = (): Rad => ({ lagStikk: [], motSD: [], klarte: [], valg: 0, ulikNevro: 0 });

/**
 * SD-estimatet for `sete` i denne giva – nøyaktig referansen fasegapet bruker.
 *
 * BUFRET på (frø, sete). Giva er den samme for alle kandidatene, så estimatet
 * er det også, og `analyserGiv` koster ~10 ms. Uten bufferen ville en
 * faktoriell kjøring med 36 kandidater brukt en halvtime på å regne ut det
 * samme tallet 36 ganger.
 */
const sdOrakel = new NevroAgent();
const sdBuffer = new Map<string, number | null>();
function sdFor(frø: number, sete: number): number | null {
  const nøkkel = `${frø}|${sete}`;
  const truffet = sdBuffer.get(nøkkel);
  if (truffet !== undefined) return truffet;
  const friskt = opprettSpill({ antallSpillere: 4 }, frø);
  let svar: number | null;
  try {
    svar = sdBud(analyserGiv(friskt, sdOrakel), sete, friskt.giving.antallStikk);
  } catch {
    svar = null;
  }
  sdBuffer.set(nøkkel, svar);
  return svar;
}

function kjør(lag: () => Velger, r: Rad, frø: number): void {
  const budsete = frø % 4;
  let s = oppsett(frø, budsete, kontrakt);
  if (s === null) return;
  const sd = sdFor(frø, budsete);
  if (sd === null) return;

  const kandidat = lag();
  kandidat.nyKamp();
  const nevro = andre.lag(); // de tre andre setene – nevro med mindre --andre er satt
  const skygge = new NevroAgent();
  skygge.nyKamp();

  // I makkerrollen fører NevroHjerne kontrakten, så vrak og trumfvalg må
  // gjøres av nevro FØR vi vet hvem makkeren er – makkeren er den som holder
  // det etterlyste kortet, og det avgjøres først av trumfvalget.
  let g = 0;
  if (rolle === "makker") {
    while ((s.fase === "VRAK" || s.fase === "VELG") && g++ < 20) s = utfør(s, nevro.velgHandling(s)).state;
    if (s.fase !== "SPILL" || s.makker === null) return;
  }
  const kandidatsete = rolle === "makker" ? s.makker! : budsete;

  g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    if (iTur !== kandidatsete) {
      s = utfør(s, nevro.velgHandling(s)).state;
      continue;
    }
    const h = kandidat.velgHandling(s);
    if (h.type === "SPILL" && lovligeHandlinger(s).fase === "SPILL") {
      r.valg++;
      const n = skygge.velgHandling(s);
      if (n.type !== "SPILL" || n.kort.farge !== h.kort.farge || n.kort.verdi !== h.kort.verdi) r.ulikNevro++;
    } else {
      // Hold skyggen i takt med linja også gjennom vrak og trumfvalg.
      skygge.velgHandling(s);
    }
    s = utfør(s, h).state;
  }

  const stikk = s.stikkVunnet;
  const lagStikk = (stikk[budsete] ?? 0) + (s.makker !== null ? (stikk[s.makker] ?? 0) : 0);
  r.lagStikk.push(lagStikk);
  r.motSD.push(lagStikk - sd);
  r.klarte.push(lagStikk >= kontrakt ? 1 : 0);
}

const kandidater = spesser.map(lagKandidat);
if (kandidater.length === 0) throw new Error("Oppgi minst én kandidat");
const andre = lagKandidat(andreSpec);
if (andreSpec !== "nevro") {
  // SD-referansen er en nevro-rollout. Byttes medspillerne ut, måler
  // «lagstikk − SD» noe annet enn i standardoppsettet, og kolonnen skal ikke
  // sammenliknes på tvers av kjøringer med ulik `--andre`.
  console.log(`  MERK: de tre andre setene er «${andre.navn}», ikke nevro.`);
}

const rader = kandidater.map(() => nyRad());
for (let i = 0; i < kandidater.length; i++) {
  for (let f = 0; f < kamper; f++) kjør(kandidater[i]!.lag, rader[i]!, frøBase + f);
  tømCache();
  process.stdout.write(`\r  ${i + 1}/${kandidater.length} maalt   `);
}
console.log();

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const parretSE = (a: readonly number[], b: readonly number[]): number => {
  const d = a.map((x, i) => x - b[i]!);
  const m = snitt(d);
  let sq = 0;
  for (const x of d) sq += (x - m) * (x - m);
  return Math.sqrt(sq / (d.length - 1) / d.length);
};

const linjer: string[] = [];
const ut = (s: string): void => { linjer.push(s); console.log(s); };
const kol = (v: string[]): string => v.map((x) => x.padStart(15)).join("");
const rad = (navn: string, v: string[]): void => ut(navn.padEnd(30) + kol(v));
const pst = (a: number, b: number): string => (b === 0 ? "–" : `${Math.round((100 * a) / b)} %`);

ut(`\n=== Rolleprofil «${rolle}», tvungen kontrakt ${kontrakt}, ${kamper} givere ===`);
ut(rolle === "makker"
  ? `NevroHjerne fører; kandidaten holder det etterlyste kortet. Parret på giver.\n`
  : `Kandidaten fører; de tre andre setene er NevroHjerne. Parret på giver.\n`);
rad("", kandidater.map((k) => k.navn));
ut("-".repeat(30 + 15 * kandidater.length));
rad("kontrakter spilt", rader.map((r) => String(r.lagStikk.length)));
rad("innfridd", rader.map((r) => pst(r.klarte.reduce((a, b) => a + b, 0), r.klarte.length)));
rad("lagstikk", rader.map((r) => snitt(r.lagStikk).toFixed(3)));
rad("lagstikk − SD", rader.map((r) => (snitt(r.motSD) >= 0 ? "+" : "") + snitt(r.motSD).toFixed(3)));
const g0 = rader[0]!;
rad(
  `  mot ${kandidater[0]!.navn} (±SE)`,
  rader.map((r, i) =>
    i === 0 || r.lagStikk.length !== g0.lagStikk.length
      ? "–"
      : `${snitt(r.lagStikk) - snitt(g0.lagStikk) >= 0 ? "+" : ""}${(snitt(r.lagStikk) - snitt(g0.lagStikk)).toFixed(3)}±${parretSE(r.lagStikk, g0.lagStikk).toFixed(3)}`,
  ),
);
rad("kortvalg (n)", rader.map((r) => String(r.valg)));
rad("  ulikt nevro", rader.map((r) => pst(r.ulikNevro, r.valg)));
ut(`
MesterAI ligger på lagstikk − SD = +0,30 i fasegaprapporten, målt i hele
kamper mot oss. Tallet over er målt mot NevroHjerne-motstand, så nivåene er
ikke direkte sammenliknbare – men RANGERINGEN mellom kandidatene er det, og
det er den som sier om et tiltak flytter spilleføringen i det hele tatt.`);

writeFileSync(utFil, linjer.join("\n") + "\n");
// RÅTALLENE per giver. Tabellen over parrer bare mot den første kandidaten;
// et faktorielt oppsett trenger alle kolonnene for å regne hovedeffekter og
// interaksjoner. Skrives ved siden av tekstrapporten.
writeFileSync(
  utFil.replace(/\.txt$/, "") + ".json",
  JSON.stringify(
    {
      rolle, kontrakt, kamper, andre: andre.navn,
      kandidater: kandidater.map((k, i) => ({ navn: k.navn, spek: spesser[i] })),
      lagStikk: rader.map((r) => r.lagStikk),
      motSD: rader.map((r) => r.motSD),
    },
    null,
  ) + "\n",
);
console.log(`\nSkrev ${utFil}`);
