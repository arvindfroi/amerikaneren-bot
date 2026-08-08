/**
 * K3 — K-KURVEN OG PASS-BØTTA PÅ ÅPNINGSBUDET.
 *
 * `k3-budgap.ts` målte tre nivåer på åpningsbudet og fikk:
 *
 *   KLARSYN   +9,450 ± 0,899   z = +9,85   replikert i begge frøbånd
 *   NÅBART    +1,250 ± 0,799   z = +0,27   IKKE replikert (K = 12)
 *
 * To uavhengige målinger sier at et argmax over K trekninger ligger UNDER
 * nullpunktet ved lav K, og at vippepunktet er rundt K = 48–60:
 * `docs/budplan.md` §1 målte +0,097 ± 0,046 ved K = 120 og negativt under
 * K ≈ 48, og `k3-budgap.ts` målte fortegnsskifte mellom K = 6 og K = 12.
 *
 * Denne fila gjør to ting som den forrige ikke kunne:
 *
 *   1. Den TREKKER Kmax verdener én gang per giv og LAGRER hver eneste
 *      utspilling. K-kurven blir da et rent regnestykke i etterkant —
 *      K = 12, 60, 120, 240 måles på NØYAKTIG samme giv og samme verdener,
 *      så differansen mellom to K er parret og ikke to uavhengige kjøringer.
 *
 *   2. Den lagrer den VIRKELIGE verdien av hvert kandidatbud og modellens
 *      egen (μ, σ) for hånden. Dermed kan PASS-bøtta sveipes offline mot
 *      hvilken som helst rangering av hendene, uten å spille om igjen.
 *
 * Selve analysen ligger i `k3-analyse.ts`. Delingen er med vilje: kjøringen
 * her er timer lang, og en feil i en tabellformatering skal ikke koste den.
 *
 * ================= HVA SOM ER ARVET UENDRET ============================
 *
 * Frøskjema, verdensbygging, `spillMedBud`, argmax-semantikk og
 * kontrollene er BIT-IDENTISKE med `k3-budgap.ts`. Det er ikke latskap:
 * de tolv første verdenene her er de samme tolv som den fila brukte, så
 * K = 12-punktet på kurven må reprodusere +1,430 (bånd 900000) og +1,070
 * (bånd 5100000). Gjør det ikke det, er noe endret uten at noen ba om det,
 * og hele kurven er ugyldig.
 *
 * ================= FALLGRUVENE, OG HVA SOM HOLDER DEM UNNA =============
 *
 * μ-SKIFT-FEILEN (§64): valget gjøres på K verdener der den virkelige ikke
 * er med, og verdsettes i den virkelige. Nevneren er hver eneste giv, også
 * dem der noen andre tar kontrakten. Ingen seleksjon på den målte størrelsen.
 *
 * §65 AUKSJONSKORREKSJONEN: ett bånd er aldri et funn. Fila kjøres i to
 * disjunkte frøbånd, og `k3-analyse.ts` nekter å slå dem sammen uten å vise
 * dem hver for seg.
 *
 * BRUK:
 *   node examples/k3-kkurve.ts --giver 100 --verdener 240 --froe 900000 \
 *        --ut analyse/k3-kkurve-b1
 */

import { appendFileSync, writeFileSync } from "node:fs";

import {
  lagRng,
  lovligeHandlinger,
  opprettSpill,
  stokk,
  utfør,
  type Bud,
  type GameState,
  type Handling,
  type Kort,
} from "../src/index.ts";
import { ADAMS, lagIndre, tall } from "../src/moe2/agentspek.ts";
import { lesBudmodell } from "../src/moe2/budagent.ts";
import { muSigma } from "../src/moe2/budmodell.ts";
import { budTrekk } from "../src/moe2/budtrekk.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "100"), 100, "giver");
const VERDENER = tall(arg("--verdener", "240"), 240, "verdener");
/** Samme spek som §60/§61 og `k3-budgap.ts`, ellers deler tallene ikke populasjon. */
const SPEK = arg("--spek", ADAMS);
const STAMME = arg("--ut", "analyse/k3-kkurve-b1");
const JSONL = `${STAMME}.jsonl`;
const LOGG = `${STAMME}.log`;

/**
 * MODELLFILA HENTES UT AV SPEKEN, ikke oppgitt ved siden av den.
 *
 * Vedleggets punkt 4: det målte og det utrullede må være samme ting, funnet
 * feil tretten ganger. En `--budmodell`-flagg med egen standardverdi ville
 * vært den fjortende: speken kunne pekt på én modell mens (μ, σ) ble lest fra
 * en annen, og ingenting ville krasjet.
 */
const budmodellFil = (() => {
  const i = SPEK.indexOf("budm:");
  if (i < 0) return null;
  const m = /^([^:@]+)/.exec(SPEK.slice(i + 5));
  return m ? m[1]! : null;
})();
const budmodell = budmodellFil === null ? null : lesBudmodell(budmodellFil);

// ---------------------------------------------------------------------------
// Grunnverktøy — arvet uendret fra k3-budgap.ts
// ---------------------------------------------------------------------------

const budNavn = (b: Bud | null | undefined): string =>
  b === "PASS" || b === null || b === undefined ? "PASS" : String(b);

const kortNøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

const poengFor = (s: GameState, sete: number): number => s.sisteRunde?.delta?.[sete] ?? 0;

const agenter = [0, 1, 2, 3].map(() => lagIndre(SPEK));

/** Spiller runden ferdig. `bud` tvinges i setets FØRSTE budtur; alt annet er policy. */
function spillMedBud(start: GameState, sete: number, bud: Bud | null): GameState {
  let s = start;
  let brukt = bud === null;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    let h: Handling | null = null;
    if (!brukt && s.fase === "BUDRUNDE" && iTur === sete) {
      const lov = lovligeHandlinger(s);
      if (lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === bud)) {
        h = { type: "BUD", spiller: sete, bud: bud! };
        brukt = true;
      }
    }
    s = utfør(s, h ?? agenter[iTur]!.velgHandling(s)).state;
  }
  return s;
}

/** Lagstikk for budlaget etter at runden er spilt ut. */
function lagstikk(s: GameState): number {
  const bv = s.budvinner;
  if (bv === null) return 0;
  const mk = s.makker;
  return (s.stikkVunnet[bv] ?? 0) + (mk !== null && mk !== bv ? (s.stikkVunnet[mk] ?? 0) : 0);
}

/**
 * Én verden: vår hånd står, de 40 andre kortene stokkes og deles på nytt.
 * Den EKSAKTE posterioren i åpningsbudet, der auksjonen er tom.
 */
function nyVerden(s0: GameState, sete: number, frø: number): GameState {
  const egne = new Set(s0.hender[sete]!.map(kortNøkkel));
  const alle: Kort[] = [...s0.hender.flat(), ...s0.talong];
  const rest = alle.filter((k) => !egne.has(kortNøkkel(k)));
  const blandet = stokk(rest, lagRng(frø >>> 0));
  const perHånd = s0.hender[sete]!.length;

  const hender: Kort[][] = [];
  let i = 0;
  for (let p = 0; p < s0.antallSpillere; p++) {
    if (p === sete) {
      hender.push(s0.hender[sete]!.slice());
    } else {
      hender.push(blandet.slice(i, i + perHånd));
      i += perHånd;
    }
  }
  const talong = blandet.slice(i, i + s0.talong.length);
  if (talong.length !== s0.talong.length) throw new Error("verdenen gikk ikke opp");
  return { ...s0, hender, talong };
}

// ---------------------------------------------------------------------------
// Kjøringen
// ---------------------------------------------------------------------------

writeFileSync(JSONL, "");
writeFileSync(
  LOGG,
  `# k3-kkurve  spek ${SPEK}\n# giv ${GIVER}  Kmax ${VERDENER}  frø ${FRØ}  modell ${budmodellFil}\n`,
);

const t0 = Date.now();
let avvikPolicy = 0;
let avvikDeterminisme = 0;
let sumPolicy = 0;

for (let g = 0; g < GIVER; g++) {
  const frø = FRØ + g * 7717;
  const s0 = opprettSpill({ antallSpillere: 4 }, frø);
  if (s0.fase !== "BUDRUNDE" || s0.iTur === null) throw new Error("uventet startfase");
  const sete = s0.iTur;

  const lov = lovligeHandlinger(s0);
  if (lov.fase !== "BUDRUNDE") throw new Error("uventet lovlighetsfase");
  const kandidater = lov.bud;

  // --- policy-linja ------------------------------------------------------
  const reinS = spillMedBud(s0, sete, null);
  const rein = poengFor(reinS, sete);
  sumPolicy += rein;

  if (g < 5) {
    const igjen = poengFor(spillMedBud(s0, sete, null), sete);
    if (igjen !== rein) avvikDeterminisme++;
  }

  const policyH = agenter[sete]!.velgHandling(s0);
  const bPolicy: Bud = policyH.type === "BUD" ? policyH.bud : "PASS";

  // --- den virkelige verdenen, alle kandidatbud --------------------------
  const vFaktisk: Record<string, number> = {};
  for (const b of kandidater) {
    vFaktisk[budNavn(b)] = poengFor(spillMedBud(s0, sete, b), sete);
  }
  const vPolicy = vFaktisk[budNavn(bPolicy)];
  if (vPolicy === undefined) throw new Error("policybudet var ikke lovlig");
  /** Kontrollen som må være null: tvunget policybud == ren policy. */
  if (vPolicy !== rein) avvikPolicy++;

  // --- modellens eget anslag på hånden -----------------------------------
  //
  // Dette er den ENESTE håndstyrken som er lovlig ved bordet i åpningen:
  // (μ, σ) fra GBT-en boten allerede kjører, på et tomt auksjonsbilde.
  let μ: number | null = null;
  let σ: number | null = null;
  if (budmodell !== null) {
    const ms = muSigma(budmodell, budTrekk(s0, sete, budmodell.dim));
    μ = ms.μ;
    σ = ms.σ;
  }

  // --- de K verdenene, LAGRET i sin helhet -------------------------------
  const anslag: Record<string, number[]> = {};
  for (const b of kandidater) anslag[budNavn(b)] = [];
  for (let w = 0; w < VERDENER; w++) {
    // Samme frøuttrykk som k3-budgap.ts, så de 12 første verdenene er DE SAMME.
    const verden = nyVerden(s0, sete, frø * 31 + w * 104729 + 17);
    for (const b of kandidater) {
      anslag[budNavn(b)]!.push(poengFor(spillMedBud(verden, sete, b), sete));
    }
  }

  // --- fasit på policy-linja ---------------------------------------------
  const bv = reinS.budvinner;
  const meld = reinS.melding;
  const budTall = meld?.type === "tall" ? meld.bud : null;

  appendFileSync(
    JSONL,
    `${JSON.stringify({
      frø,
      sete,
      bPolicy: budNavn(bPolicy),
      vPolicy,
      μ,
      σ,
      vFaktisk,
      anslag,
      budvinner: bv,
      bud: budTall,
      lagstikk: lagstikk(reinS),
    })}\n`,
  );

  if ((g + 1) % 5 === 0 || g === 0) {
    const s = (Date.now() - t0) / 1000;
    appendFileSync(
      LOGG,
      `# ${g + 1}/${GIVER}  ${s.toFixed(0)} s  (${(s / (g + 1)).toFixed(1)} s/giv, ` +
        `anslått ferdig om ${(((s / (g + 1)) * (GIVER - g - 1)) / 60).toFixed(0)} min)\n`,
    );
  }
}

appendFileSync(
  LOGG,
  [
    `FERDIG  ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    `giv ${GIVER}   policy ${(sumPolicy / GIVER).toFixed(3)} poeng per runde for åpnersetet`,
    `KONTROLL tvunget policybud ulik ren policy   ${avvikPolicy}   (må være 0)`,
    `KONTROLL ikke-deterministisk utspilling      ${avvikDeterminisme}   (må være 0)`,
    "",
  ].join("\n"),
);
console.log(`skrevet: ${JSONL} og ${LOGG}`);
