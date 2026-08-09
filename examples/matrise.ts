/**
 * MATRISEN — hele stakker mot hverandre, to og to ved bordet.
 *
 *   node examples/matrise.ts --froe 800000000 --giver 200 --skard 0/12 \
 *     --ut analyse/matrise-s0.jsonl
 *   node examples/matrise.ts --rapport "analyse/matrise-s*.jsonl" \
 *     > analyse/matrise-rapport.txt
 *
 * ARVIND: «vi må jo teste hele stakken. også trenger vi egentlig bare 2
 * spillere som har hele adams max, men de 2 andre kan være "fast" versjonen av
 * adams. da måler vi også forskjeller og sparer tid. så måler vi hvordan
 * dynamikkene i matrise.»
 *
 * ================= HVORFOR DETTE ER BEDRE ENN ABLASJONEN ===============
 *
 * Ablasjonen har FULL stakk i alle fire seter og bytter ut ett. Da betaler vi
 * fire søk per stikk for å måle én modul, og vi måler ett sete.
 *
 * Her sitter to av hver. Tre ting bedres samtidig:
 *
 *   KOSTNADEN   den billige stakken søker ikke. To fulle i stedet for fire
 *               halverer omtrent regningen per kamp.
 *   UTBYTTET    to seter måles i stedet for ett, på samme kamp.
 *   DYNAMIKKEN  i Amerikaneren avgjøres laget av BUDET, ikke av setet. To like
 *               agenter blir derfor noen ganger makkere og noen ganger
 *               motstandere — altså blir partnerskapet FAKTISK prøvd. Det er
 *               nettopp der alpha-mu har slitt: `amu:alle` målte −0,2837, og
 *               per rolle var makker −0,3342 og forsvar −0,4003.
 *
 * ================= SPEILINGEN ER IKKE VALGFRI ==========================
 *
 * Hver giv spilles TO ganger: A i setene {0,2} og B i {1,3}, så omvendt.
 * Uten den er enhver forskjell forurenset av seteskjevhet — hvem som gir, hvem
 * som byr først. Med den faller seteeffekten ut i differansen, og parringen
 * blir sterk selv om kampene divergerer.
 *
 * ================= MÅLESTOKKEN ER POENG PER RUNDE ======================
 *
 * En kamp bruker ~25 runder kortspill på å produsere ÉN BIT hvis vi bare
 * spør hvem som vant. Målt på gulvkjøringen (2400 rader, samme data):
 *
 *     vinnerandel        |z| = 21,3
 *     poeng per runde    |z| = 31,1     →  0,47× så mange kamper
 *
 * Vinnerandelen rapporteres også, fordi K1 er formulert i den. Men rangeringen
 * av stakker gjøres på poeng per runde: **2,2× presisjon, gratis.**
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { globSync } from "node:fs";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";
const VR = "vr:e1-modell/vrakrang.bin:telrd";
const BUD = "budm:e1-modell/bud-vant.json@-3.0";
const BUDSOK = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5";

/**
 * STAKKENE. Hver er en HEL bot, ikke en modul.
 *
 * `maks` er Adams Max slik den står i dag, med ALT som er bygd for K1–K8 og
 * ikke parkert: hukommelsen (K4/K6), kampstillingen og makro→bud (K5),
 * framoverblikket og sluttspilldybden (K4-B/K7), A5 og A6-LESEREN (K8),
 * vaktens veto, og budsøket.
 *
 * A7 og A6-avsenderen er UTE — de er parkert på Arvinds beskjed 8. august, og
 * de er ikke i K1–K8.
 */
export const STAKKER: Record<string, string> = {
  /**
   * Adams Max: alt som er bygd for kravene, påslått.
   *
   * MERK AT DEN HAR `m1`, IKKE `m2`. Framoverblikket overalt koster 4,0×
   * (~450 ms per beslutning), og med to søkende seter over 40 runder ble en
   * enkelt kamp flere minutter. Prosjektets egen regel gjelder: **en spek som
   * ikke kan måles er ikke en kandidat, den er en hypotese.**
   *
   * Dybden er i stedet dekket der den er BILLIG: `d5` gir full alpha-mu-dybde
   * i de siste fem stikkene til 1,73×. Og `maks-m2` står som egen stakk for
   * den som vil betale for resten.
   */
  maks:
    `okt:${VR}:amu:foerer:12k16bgm1e0r1.5v0.5d5B4:profil:` +
    `${BUDSOK}/kamp1.5:${NETT}`,

  /** Maks MED framoverblikk overalt. Dyr — egen stakk så den kan velges bort. */
  "maks-m2":
    `okt:${VR}:amu:foerer:12k16bgm2e0r1.5v0.5d5B4:profil:` +
    `${BUDSOK}/kamp1.5:${NETT}`,

  /** «Rask»: ingen søk, ingen hukommelse. Den utrullede boten i dag. */
  rask: `${VR}:${BUD}:${NETT}`,

  /**
   * Maks UTEN hukommelsen — isolerer K4 og K6 i ett par.
   *
   * ============ DENNE HADDE `m2` OG SKULLE HATT `m1` =================
   *
   * Da `maks` ble endret fra `m2` til `m1` (fordi M=2 gjorde en kamp flere
   * minutter), ble den avledede stakken staaende igjen med `m2`. Foelgen:
   * «maks-uten-minne» var ikke maks uten hukommelse, men **maks-m2 uten
   * hukommelse** — og siden hukommelsen endrer naer null, ble den BIT-IDENTISK
   * med `maks-m2`: 0 av 440 valg ulike.
   *
   * Matrisen 9. august maalte derfor «maks-m2 mot maks-uten-minne» til eksakt
   * 0,0000 over 200 kamper. Det tallet er ikke et funn — det er to like bots.
   *
   * Fjortende forekomst av prosjektets mest gjentatte feilklasse: **det maalte
   * var ikke det jeg mente aa maale.** Og den ble fanget av at to par ga
   * IDENTISKE tall til fjerde desimal, ikke av at noe krasjet.
   */
  "maks-uten-minne":
    `${VR}:amu:foerer:12k16bgm1e0r1.5v0.5d5B4:${BUDSOK}/kamp1.5:${NETT}`,

  /** Maks uten dagens tillegg (m2, d5, B4, kamp) — isolerer det nye. */
  "maks-uten-nye": `okt:${VR}:amu:foerer:12k16bgm1e0r1.5v0.5:profil:${BUDSOK}:${NETT}`,
};

interface Rad {
  readonly a: string;
  readonly b: string;
  readonly frø: number;
  readonly speil: number;
  /** Poeng per runde, snittet over de TO setene stakken hadde. */
  readonly aPpr: number;
  readonly bPpr: number;
  readonly aVant: number;
  readonly bVant: number;
  readonly runder: number;
}

/** Spiller én kamp med `a` i setene `aSeter` og `b` i resten. */
function kamp(
  aSpek: string,
  bSpek: string,
  aSeter: readonly number[],
  frø: number,
  målPoeng: number,
  maksRunder: number,
): { aPpr: number; bPpr: number; aVant: number; bVant: number; runder: number } {
  const erA = (p: number): boolean => aSeter.includes(p);
  const ag = [0, 1, 2, 3].map((p) => lagIndre(erA(p) ? aSpek : bSpek));
  for (const x of ag) x.nyKamp();

  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
  let vakt = 0;
  let runder = 0;
  while (s.fase !== "FERDIG" && vakt++ < 200_000 && runder < maksRunder) {
    if (s.fase === "RUNDE_SLUTT") {
      runder++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, ag[iTur]!.velgHandling(s)).state;
  }

  const r = Math.max(1, runder);
  let aP = 0;
  let bP = 0;
  for (let p = 0; p < 4; p++) {
    const poeng = s.totalPoeng[p] ?? 0;
    if (erA(p)) aP += poeng;
    else bP += poeng;
  }
  // KAMPVINNEREN. `s.vinner` er null når maksRunder stoppet kampen; da teller
  // ingen av dem, i stedet for å late som om den høyeste «vant».
  const v = s.vinner;
  return {
    aPpr: aP / 2 / r,
    bPpr: bP / 2 / r,
    aVant: v !== null && erA(v) ? 1 : 0,
    bVant: v !== null && !erA(v) ? 1 : 0,
    runder,
  };
}

function kjør(): void {
  const FRØ = tall(arg("--froe", "800000000"), 800_000_000, "--froe");
  const GIVER = tall(arg("--giver", "200"), 200, "--giver");
  const MÅL = tall(arg("--maal", "100"), 100, "--maal");
  const MAKSR = tall(arg("--maksrunder", "40"), 40, "--maksrunder");
  const UT = arg("--ut", "analyse/matrise.jsonl");
  const d = arg("--skard", "0/1").split("/");
  const skardI = tall(d[0], 0, "skard i");
  const skardN = tall(d[1], 1, "skard n");

  const navn = Object.keys(STAKKER);
  const par: [string, string][] = [];
  for (let i = 0; i < navn.length; i++) {
    for (let j = i + 1; j < navn.length; j++) par.push([navn[i]!, navn[j]!]);
  }

  mkdirSync(dirname(UT), { recursive: true });
  const ut: string[] = [];
  let n = 0;
  for (const [a, b] of par) {
    for (let g = 0; g < GIVER; g++) {
      if (n++ % skardN !== skardI) continue;
      const frø = FRØ + g * 7919;
      // SPEILING: samme giv, byttede seter. Uten den er forskjellen forurenset
      // av seteskjevhet.
      for (const [speil, aSeter] of [[0, [0, 2]], [1, [1, 3]]] as const) {
        const k = kamp(STAKKER[a]!, STAKKER[b]!, aSeter, frø, MÅL, MAKSR);
        const rad: Rad = { a, b, frø, speil, ...k };
        ut.push(JSON.stringify(rad));
      }
      /**
       * SKRIV HVER RAD. Første utgave skrev hver 20. — og med flere minutter
       * per kamp gjorde det meg BLIND i over en time: jeg kunne ikke se om
       * kjøringen gikk framover i det hele tatt.
       *
       * Det er brudd på prosjektets egen regel. Resultater skal skrives til
       * varige filer av prosessen selv, LØPENDE. En fil som først dukker opp
       * når alt er ferdig, er ikke en logg — den er et løfte.
       */
      writeFileSync(UT, ut.join("\n") + "\n");
    }
  }
  writeFileSync(UT, ut.join("\n") + "\n");
  process.stdout.write(`skard ${skardI}/${skardN}: ${ut.length} rader -> ${UT}\n`);
}

// ---------------------------------------------------------------------------
// Rapporten
// ---------------------------------------------------------------------------

function seAv(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return Infinity;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1);
  return Math.sqrt(v / n);
}

function rapport(mønster: string): void {
  const rader: Rad[] = [];
  for (const f of globSync(mønster)) {
    for (const ln of readFileSync(f, "utf8").split("\n")) {
      if (ln.trim()) rader.push(JSON.parse(ln) as Rad);
    }
  }
  if (rader.length === 0) throw new Error(`ingen rader i «${mønster}»`);

  const L: string[] = [];
  L.push("# MATRISEN — HELE STAKKER MOT HVERANDRE");
  L.push("");
  L.push("To av hver ved bordet. Laget avgjøres av BUDET, ikke av setet, så to");
  L.push("like agenter blir vekselvis makkere og motstandere — partnerskapet");
  L.push("blir faktisk prøvd. Hver giv spilles speilvendt, så seteskjevhet");
  L.push("faller ut av differansen.");
  L.push("");
  L.push(`${rader.length} kamper totalt.`);
  L.push("");

  const par = [...new Set(rader.map((r) => `${r.a}|${r.b}`))];
  L.push(`${"A mot B".padEnd(38)}${"Δ poeng/runde".padStart(15)}${"SE".padStart(9)}${"SE-er".padStart(8)}${"A vant".padStart(10)}`);
  L.push("-".repeat(82));
  for (const p of par) {
    const [a, b] = p.split("|") as [string, string];
    const her = rader.filter((r) => r.a === a && r.b === b);
    // PARRET PÅ (giv, speiling): differansen mellom de to stakkene i samme kamp.
    const diff = her.map((r) => r.aPpr - r.bPpr);
    const m = diff.reduce((x, y) => x + y, 0) / diff.length;
    const se = seAv(diff);
    const aV = her.reduce((x, r) => x + r.aVant, 0);
    const bV = her.reduce((x, r) => x + r.bVant, 0);
    const avgjort = aV + bV;
    L.push(
      `${`${a} mot ${b}`.padEnd(38)}${m.toFixed(4).padStart(15)}${se.toFixed(4).padStart(9)}` +
        `${(se > 0 ? m / se : 0).toFixed(1).padStart(8)}` +
        `${(avgjort > 0 ? `${aV}/${avgjort}` : "—").padStart(10)}`,
    );
  }
  L.push("-".repeat(82));
  L.push("");
  L.push("Δ er A minus B i poeng per runde, snittet over de to setene hver");
  L.push("stakk hadde. POSITIV betyr at A er sterkest.");
  L.push("");
  L.push("PORTEN: over 2 SE OG tegntesten med seg. Aldri adoptere på snittet");
  L.push("alene, og aldri på ett frøbånd — replikér i et disjunkt bånd.");
  L.push("");
  L.push("VINNERANDELEN er med fordi K1 er formulert i den, men rangeringen");
  L.push("gjøres på poeng per runde: målt 2,2x mer presist på samme kamper.");

  process.stdout.write(L.join("\n") + "\n");
}

/**
 * KJOERES BARE NAAR FILA ER STARTET DIREKTE.
 *
 * Uten denne vakten satte et blott `import { STAKKER }` i gang en full
 * maaling - jeg oppdaget det ved at en typesjekk brukte ti minutter paa aa
 * spille kamper. En modul som maaler noe naar den importeres, er en felle for
 * hver test som vil lese konstantene i den.
 */
const startetDirekte =
  process.argv[1] !== undefined &&
  process.argv[1].split("\\").join("/").endsWith("examples/matrise.ts");
if (startetDirekte) {
  const r = arg("--rapport", "");
  if (r !== "") rapport(r);
  else kjør();
}
