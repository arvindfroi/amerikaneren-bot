/**
 * K3 — HVOR MYE AV BUDRUNDENS +8,06 ER KLARSYN, OG HVOR MYE ER NÅBART?
 *
 * ARVIND: «fokuser på å gjøre spillet hans optimalt så BAM legger vi på en
 * siste budmodell som gir max poeng.»
 *
 * Takkartet (§60) sier at budrunden er 41,8 % av alt som er å hente, og §61
 * delte de +8,06 i feilklasser. Begge tallene er målt med KLARSYN: taket
 * forgreiner seg over egne bud og leser av hvordan hver linje FAKTISK endte.
 * Det ser hvilke hender som ville feilet, og passer på nøyaktig dem.
 *
 * §63 viste hva den lesningen koster: terskelen ble sveipet i fire retninger
 * fordi klassefordelingen så ut som «boten er for feig», og alle fire målte
 * ≤ 0. Et tak sier hva som FINNES, aldri hvordan man tar det.
 *
 * Denne filen svarer på spørsmålet §61 utsatte: **hvor mye av potten
 * overlever når man ikke får se fasiten?**
 *
 * ================= TRE NIVÅER PÅ SAMME BESLUTNING =======================
 *
 *   POLICY    det Adams byr i dag.
 *   NÅBART    det beste budet en spiller kan velge som BARE ser sin egen
 *             hånd — anslått ved å trekke K verdener forenlige med hånden,
 *             spille hver ferdig for hvert kandidatbud, og ta gjennomsnittet.
 *   KLARSYN   det beste budet i den VIRKELIGE verdenen. §60/§61-taket.
 *
 * Avstanden POLICY → NÅBART er det en budmodell kan hente.
 * Avstanden NÅBART → KLARSYN er informasjon som ikke finnes ved bordet.
 *
 * ================= HVORFOR DETTE IKKE ER μ-SKIFT-FEILEN OM IGJEN ========
 *
 * §64 avvik 4: μ-skiftet ble anslått på residualen til dem som VANT
 * budrunden — og man vinner budrunden nettopp når modellen anslår høyt.
 * Effekten ble målt på et utvalg som var valgt PÅ den størrelsen som ble målt.
 *
 * To grep holder den feilen unna her:
 *
 *   1. VALG OG SCORE ER DISJUNKTE. Budet velges på K verdener der den
 *      VIRKELIGE verdenen ikke er med, og verdsettes så i den virkelige
 *      verdenen. Å ta argmax over støy kan da bare gjøre valget dårligere,
 *      aldri tallet finere. Estimatet er en NEDRE grense for regelen, ikke
 *      en oppblåst øvre.
 *
 *   2. ALLE GIV TELLER, IKKE BARE DE VUNNE. Nevneren er hver eneste giv,
 *      også dem der vi passer og der noen andre tar kontrakten. Ingen
 *      seleksjon på utfallet.
 *
 * ================= HVORFOR BARE ÅPNINGSBUDET ============================
 *
 * Vinduet er ÉN beslutning: det aller første budet i runden, gitt av setet
 * til venstre for giveren. Det er en smalere skive enn §60s budvindu (fire
 * seter, alle budturer, budsjett 4), og tallene her skal derfor IKKE leses
 * som «41,8 % av alt» — de skal leses som forholdet mellom nivåene INNENFOR
 * samme vindu, som er det eneste spørsmålet fila stiller.
 *
 * Grunnen til at vinduet må være så smalt er selve metoden. Informasjonsmengden
 * i et bud er «egen hånd + auksjonen så langt». I åpningsbudet er auksjonen
 * TOM, så de 40 usette kortene er nøyaktig uniformt fordelt — resamplingen er
 * da den eksakte posterioren, ikke en tilnærming. Ved senere budturer er
 * auksjonen informasjon: verdener må da betinges på at de tre andre ville
 * bydd det de faktisk bød, og en resampling uten den betingelsen måler et
 * annet sete enn det som satt der. Det er samme feilklasse som μ-skiftet,
 * bare i ny drakt, og prisen for å unngå den er at vinduet blir smalt.
 *
 * ================= VERDENENE LAGES HER, IKKE AV `trekkVerdener` =========
 *
 * Med full informasjon i måleverktøyet er den korrekte posterioren triviell:
 * ta de 52 kortene, hold vår hånd fast, stokk de 40 andre og del 12/12/12 + 4
 * i talongen. Da er verdenen garantert konsistent.
 *
 * `trekkVerdener` + `medVerden` — som A4 (`søktMu`) bruker — gjør noe annet:
 * `trekkVerden` legger `giving.talong` usette kort i en DØD binge, mens
 * `medVerden` bare bytter `hender` og lar `state.talong` stå. Om de to er
 * enige er ikke antatt her; det MÅLES i egen blokk til slutt, fordi svaret
 * avgjør om A4 i det hele tatt kan nå gapet denne fila måler.
 *
 * ================= FASITEN ==============================================
 *
 * Til slutt en tabell over det faktiske lagstikket mot budet i policy-linja:
 * hvor ofte kontrakten ryker, hvor ofte den går inn med slark, og hva hver
 * kolonne koster. Det er fasit i etterkant, ikke et tiltak — men det viser
 * hvilken retning feilene faktisk peker, uten noen modell imellom.
 *
 * BRUK:
 *   node examples/k3-budgap.ts --giver 120 --verdener 10 --froe 900000
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
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";

const arg = (n: string, s: string) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const FRØ = tall(arg("--froe", "900000"), 900000, "froe");
const GIVER = tall(arg("--giver", "120"), 120, "giver");
const VERDENER = tall(arg("--verdener", "10"), 10, "verdener");
/**
 * SPEKEN ER `ADAMS`, IKKE `ADAMS_MAALT`, og det er et bevisst valg.
 *
 * Fila dekomponerer §60/§61, og begge de målingene ble kjørt med `ADAMS`
 * (`tak-kart.ts` og `bud-feilklasser.ts` importerer den). Skulle tallene her
 * være sammenliknbare med potten de deler opp, må boten være den samme boten.
 * Forskjellen er vaktflagg `f`, målt til +0,031 ± 0,011 — under støygulvet i
 * et utvalg på noen hundre giv, men over null, så det står her og ikke i en
 * fotnote.
 */
const SPEK = arg("--spek", ADAMS);
const UT = arg("--ut", "analyse/k3-budgap.txt");
const JSONL = arg("--jsonl", "analyse/k3-budgap.jsonl");

// ---------------------------------------------------------------------------
// Grunnverktøy
// ---------------------------------------------------------------------------

const budNavn = (b: Bud | null | undefined): string =>
  b === "PASS" || b === null || b === undefined ? "PASS" : String(b);

const kortNøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

const poengFor = (s: GameState, sete: number): number => s.sisteRunde?.delta?.[sete] ?? 0;

/**
 * ÉN AGENTSTABEL FOR HELE KJØRINGEN.
 *
 * `ADAMS` er `vr` + `budm` + `vakt` + `e1`, og alle fire er rene argmax uten
 * tilfeldighet — samme begrunnelse som `k2-aldri-jukse.test.ts` bruker for å
 * gjenbruke agenten. Determinismen ANTAS ikke: `sjekkDeterminisme` under
 * spiller de første givene to ganger og krever samme svar. Er speken søkende
 * (`sik:`, `amu:`, `okt:`) er antakelsen feil, og da skal sjekken smelle.
 */
const agenter = [0, 1, 2, 3].map(() => lagIndre(SPEK));

/**
 * Spiller runden ferdig. `bud` tvinges i setets FØRSTE budtur; alt annet,
 * inkludert setets egne senere budturer, er policy.
 *
 * `bud === null` gir ren policy — og at den veien er BIT-IDENTISK med å tvinge
 * fram policyens eget bud er en av kontrollene i rapporten. Den kontrollen
 * finnes fordi prosjektets faste feil er at det målte og det kjørte ikke var
 * samme ting.
 */
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

/** Lagstikk for budlaget (budvinner + makker) etter at runden er spilt ut. */
function lagstikk(s: GameState): number {
  const bv = s.budvinner;
  if (bv === null) return 0;
  const mk = s.makker;
  return (s.stikkVunnet[bv] ?? 0) + (mk !== null && mk !== bv ? (s.stikkVunnet[mk] ?? 0) : 0);
}

/**
 * Én verden: vår hånd står, de 40 andre kortene stokkes og deles på nytt.
 *
 * Dette er den EKSAKTE posterioren i åpningsbudet, der ingen har meldt ennå.
 * Ingen renonseslutninger, ingen budvekting — det finnes ingen observasjoner
 * å betinge på, og det er nettopp derfor vinduet er valgt.
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
// Bøtter
// ---------------------------------------------------------------------------

/**
 * Bøtta et bytte fra `fra` til `til` hører hjemme i. Delingen er §61s, med
 * «feil tall» splittet i retning — for lavt og for høyt krever motsatt av en
 * modell, og å slå dem sammen skjuler nettopp det.
 */
function bøtte(fra: Bud, til: Bud): string {
  const a = budNavn(fra);
  const b = budNavn(til);
  if (a === b) return "ingen endring";
  if (a === "PASS") return "passet, burde budt";
  if (b === "PASS") return "bød, burde passet";
  const tallA = Number(a);
  const tallB = Number(b);
  if (!Number.isFinite(tallA) || !Number.isFinite(tallB)) return "melding (amerikaner/solo)";
  return tallB > tallA ? "bød for lavt" : "bød for høyt";
}

interface Bøtte {
  n: number;
  sum: number;
}
const nyBøtter = (): Record<string, Bøtte> => ({});
const tell = (b: Record<string, Bøtte>, k: string, d: number) => {
  const c = (b[k] ??= { n: 0, sum: 0 });
  c.n++;
  c.sum += d;
};

// ---------------------------------------------------------------------------
// Kjøringen
// ---------------------------------------------------------------------------

const linjer: string[] = [];
const si = (s: string) => {
  linjer.push(s);
  console.log(s);
};

const bøtterNåbar = nyBøtter();
const bøtterKons = nyBøtter();
const bøtterKlarsyn = nyBøtter();
const dNåbar: number[] = [];
const dKlarsyn: number[] = [];
const dHalv: number[] = [];
const dKons: number[] = [];
/** Per kandidatbud: differansen mot policyen, parret på giv. */
const konstant: Record<string, number[]> = {};
const policybud: Record<string, number> = {};
let avvikPolicy = 0;
let avvikDeterminisme = 0;
let enigNåbar = 0;
let enigKlarsyn = 0;
let sumPolicy = 0;

/** Fasit: budet i policy-linja mot lagstikket som faktisk kom. */
const fasit: Record<string, { n: number; poeng: number }> = {};
const fasitTell = (k: string, p: number) => {
  const c = (fasit[k] ??= { n: 0, poeng: 0 });
  c.n++;
  c.poeng += p;
};

writeFileSync(JSONL, "");
const t0 = Date.now();

for (let g = 0; g < GIVER; g++) {
  const frø = FRØ + g * 7717;
  const s0 = opprettSpill({ antallSpillere: 4 }, frø);
  if (s0.fase !== "BUDRUNDE" || s0.iTur === null) throw new Error("uventet startfase");
  const sete = s0.iTur;

  const lov = lovligeHandlinger(s0);
  if (lov.fase !== "BUDRUNDE") throw new Error("uventet lovlighetsfase");
  const kandidater = lov.bud;

  // --- policy-linja, som er både referansen og fasitkilden --------------
  const reinS = spillMedBud(s0, sete, null);
  const rein = poengFor(reinS, sete);
  sumPolicy += rein;

  // Determinismekontroll: samme giv, samme agenter, samme svar?
  if (g < 5) {
    const igjen = poengFor(spillMedBud(s0, sete, null), sete);
    if (igjen !== rein) avvikDeterminisme++;
  }

  const policyH = agenter[sete]!.velgHandling(s0);
  const bPolicy: Bud = policyH.type === "BUD" ? policyH.bud : "PASS";

  // --- den virkelige verdenen, alle kandidatbud -------------------------
  const vFaktisk = new Map<string, number>();
  for (const b of kandidater) {
    vFaktisk.set(budNavn(b), poengFor(spillMedBud(s0, sete, b), sete));
  }
  const vPolicy = vFaktisk.get(budNavn(bPolicy));
  if (vPolicy === undefined) throw new Error("policybudet var ikke lovlig");
  /**
   * KONTROLLEN SOM MÅ VÆRE NULL. Å tvinge fram policyens EGET bud skal gi
   * nøyaktig samme runde som å la policyen by selv. Er den ikke null, måler
   * fila en annen bot enn den som spiller, og alt under er ugyldig.
   */
  if (vPolicy !== rein) avvikPolicy++;

  /**
   * KONSTANTENE, gratis: hva ville «by alltid X i åpningen» vært verdt?
   *
   * `budplan.md` §1 måler regneren mot «by alltid 9», men aldri mot BOTEN.
   * Da blir det umulig å se om boten allerede ligger på konstanten eller
   * langt under den — og det er det billigste tiltaket som finnes: en
   * konstant krever ingen modell. §63 sveipet terskelen og målte null i fire
   * retninger; denne tabellen sier om det er fordi konstanten ikke fins,
   * eller fordi terskelen ikke er knotten som når den.
   */
  for (const b of kandidater) {
    const c = (konstant[budNavn(b)] ??= []);
    c.push(vFaktisk.get(budNavn(b))! - vPolicy);
  }
  policybud[budNavn(bPolicy)] = (policybud[budNavn(bPolicy)] ?? 0) + 1;

  // --- de K verdenene ---------------------------------------------------
  const anslag = new Map<string, number[]>();
  for (const b of kandidater) anslag.set(budNavn(b), []);
  for (let w = 0; w < VERDENER; w++) {
    const verden = nyVerden(s0, sete, frø * 31 + w * 104729 + 17);
    for (const b of kandidater) {
      anslag.get(budNavn(b))!.push(poengFor(spillMedBud(verden, sete, b), sete));
    }
  }

  const snitt = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
  /**
   * Argmax med POLICYEN som utgangspunkt: et kandidatbud må være STRENGT
   * bedre for å bytte. Uavgjort skal ikke telle som en forbedring.
   */
  const velg = (fra: number, til: number): Bud => {
    let best = bPolicy;
    let bestV = snitt(anslag.get(budNavn(bPolicy))!.slice(fra, til));
    for (const b of kandidater) {
      const v = snitt(anslag.get(budNavn(b))!.slice(fra, til));
      if (v > bestV) {
        bestV = v;
        best = b;
      }
    }
    return best;
  };

  const bNåbar = velg(0, VERDENER);
  const vNåbar = vFaktisk.get(budNavn(bNåbar))!;

  // Halv K, for å se om flere verdener flytter noe i det hele tatt.
  const halv = Math.max(1, Math.floor(VERDENER / 2));
  const bHalv = velg(0, halv);
  const vHalv = vFaktisk.get(budNavn(bHalv))!;

  /**
   * KONSERVATIV VARIANT — argmax over K støyete snitt er maks av støy.
   *
   * Med elleve kandidater og et titalls verdener vil argmax nesten alltid
   * peke bort fra policyen selv når ingen kandidat er bedre. Denne varianten
   * bytter bare når forbedringen slår standardfeilen til den PARREDE
   * differansen (samme verdener for begge bud, så parringen er gratis).
   * Det er den samme regelen benken bruker på seg selv.
   */
  const parretSe = (a: number[], b: number[]): number => {
    const d = a.map((x, i) => x - b[i]!);
    const m = d.reduce((s, x) => s + x, 0) / d.length;
    if (d.length < 2) return Infinity;
    const v = d.reduce((s, x) => s + (x - m) * (x - m), 0) / (d.length - 1);
    return Math.sqrt(v / d.length);
  };
  const basis = anslag.get(budNavn(bPolicy))!;
  let bKons: Bud = bPolicy;
  let bestMargin = 0;
  for (const b of kandidater) {
    if (budNavn(b) === budNavn(bPolicy)) continue;
    const xs = anslag.get(budNavn(b))!;
    const diff = snitt(xs) - snitt(basis);
    const s = parretSe(xs, basis);
    if (diff > s && diff - s > bestMargin) {
      bestMargin = diff - s;
      bKons = b;
    }
  }
  const vKons = vFaktisk.get(budNavn(bKons))!;

  // --- klarsyn ----------------------------------------------------------
  let bKlarsyn: Bud = bPolicy;
  let vKlarsyn = vPolicy;
  for (const b of kandidater) {
    const v = vFaktisk.get(budNavn(b))!;
    if (v > vKlarsyn) {
      vKlarsyn = v;
      bKlarsyn = b;
    }
  }

  dNåbar.push(vNåbar - vPolicy);
  dHalv.push(vHalv - vPolicy);
  dKons.push(vKons - vPolicy);
  dKlarsyn.push(vKlarsyn - vPolicy);
  if (budNavn(bNåbar) === budNavn(bPolicy)) enigNåbar++;
  if (budNavn(bKlarsyn) === budNavn(bPolicy)) enigKlarsyn++;
  tell(bøtterNåbar, bøtte(bPolicy, bNåbar), vNåbar - vPolicy);
  tell(bøtterKons, bøtte(bPolicy, bKons), vKons - vPolicy);
  tell(bøtterKlarsyn, bøtte(bPolicy, bKlarsyn), vKlarsyn - vPolicy);

  // --- fasiten på policy-linja -----------------------------------------
  const bv = reinS.budvinner;
  const meld = reinS.melding;
  const stikk = lagstikk(reinS);
  const budTall = meld?.type === "tall" ? meld.bud : null;
  let fasitKlasse: string;
  if (bv === null) fasitKlasse = "ingen kontrakt";
  else if (budTall === null) fasitKlasse = "amerikaner/solo";
  else if (stikk < budTall) fasitKlasse = `bet med ${budTall - stikk}`;
  else if (stikk === budTall) fasitKlasse = "akkurat";
  else fasitKlasse = `slark ${stikk - budTall}`;
  fasitTell(`${bv === sete ? "vi bød" : bv === null ? "ingen" : "andre bød"} — ${fasitKlasse}`, rein);

  appendFileSync(
    JSONL,
    `${JSON.stringify({
      frø,
      sete,
      bPolicy: budNavn(bPolicy),
      bNåbar: budNavn(bNåbar),
      bKlarsyn: budNavn(bKlarsyn),
      vPolicy,
      vNåbar,
      vKlarsyn,
      budvinner: bv,
      bud: budTall,
      lagstikk: stikk,
    })}\n`,
  );

  if ((g + 1) % 20 === 0) {
    const sn = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    appendFileSync(
      UT,
      `# framdrift ${g + 1}/${GIVER}  nåbar ${sn(dNåbar).toFixed(3)}  klarsyn ${sn(dKlarsyn).toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(0)} s\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// A4-SAMPLEREN: SER DEN SAMME VERDEN SOM DENNE MÅLINGEN?
// ---------------------------------------------------------------------------

/**
 * `søktMu` (A4) bygger verdenene sine med `trekkVerdener` + `medVerden`.
 * Denne fila bygger dem selv. Er de to uenige, gjelder ikke gapet målt over
 * for A4 — og forskjellen ville vært usynlig i enhver gate 2, fordi en
 * inkonsistent verden ikke krasjer, den bare svarer på feil spørsmål.
 *
 * To ting sjekkes: at kortene i verdenen er 52 ULIKE kort (hender + talong),
 * og at talongen faktisk endrer seg mellom verdener.
 */
let a4Prøvd = 0;
let a4Duplikat = 0;
let a4DuplikatKort = 0;
let a4TalongLik = 0;
for (let g = 0; g < Math.min(30, GIVER); g++) {
  const frø = FRØ + g * 7717;
  const s0 = opprettSpill({ antallSpillere: 4 }, frø);
  const sete = s0.iTur!;
  const rng = lagRng((frø ^ 0x5f5f) >>> 0);
  for (const hender of trekkVerdener(s0, sete, 3, rng, undefined, undefined, 3)) {
    const v = medVerden(s0, hender, sete);
    const nøkler = [...v.hender.flat(), ...v.talong].map(kortNøkkel);
    a4Prøvd++;
    a4DuplikatKort += nøkler.length - new Set(nøkler).size;
    if (new Set(nøkler).size !== nøkler.length) a4Duplikat++;
    if (v.talong.map(kortNøkkel).join(",") === s0.talong.map(kortNøkkel).join(",")) a4TalongLik++;
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const n = dNåbar.length;
const snitt = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const se = (xs: number[]) => {
  const m = snitt(xs);
  const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, xs.length - 1);
  return Math.sqrt(v / xs.length);
};
const tegn = (xs: number[]) => {
  const p = xs.filter((x) => x > 0).length;
  const m = xs.filter((x) => x < 0).length;
  return p + m === 0 ? 0 : (p - m) / Math.sqrt(p + m);
};
const andel = (xs: number[]) => (100 * xs.filter((x) => x !== 0).length) / xs.length;

si("");
si("=== K3 BUDGAP — ÅPNINGSBUDET, TRE NIVÅER ==============================");
si(`spek       ${SPEK}`);
si(`giv        ${n}   frø ${FRØ}   verdener per giv ${VERDENER}   ${((Date.now() - t0) / 1000).toFixed(0)} s`);
si(`policy     ${(sumPolicy / n).toFixed(3)} poeng per runde for åpnersetet`);
si("");
si("KONTROLLER (må være 0 — ellers er alt under ugyldig)");
si(`  tvunget policybud ulik ren policy   ${avvikPolicy}`);
si(`  ikke-deterministisk utspilling      ${avvikDeterminisme}`);
si("");
si(`${"nivå".padEnd(20)} ${"per runde".padStart(10)} ${"± se".padStart(8)} ${"tegntest".padStart(9)} ${"endret".padStart(8)}`);
for (const [navn, xs] of [
  ["NÅBART (argmax K)", dNåbar],
  ["nåbart (argmax K/2)", dHalv],
  ["NÅBART (konservativ)", dKons],
  ["KLARSYN (§60-taket)", dKlarsyn],
] as [string, number[]][]) {
  si(
    `${navn.padEnd(20)} ${snitt(xs).toFixed(3).padStart(10)} ${se(xs).toFixed(3).padStart(8)} ${tegn(xs).toFixed(2).padStart(9)} ${andel(xs).toFixed(1).padStart(7)}%`,
  );
}
si("");
si(`enig med policy:  nåbart ${((100 * enigNåbar) / n).toFixed(1)} %   klarsyn ${((100 * enigKlarsyn) / n).toFixed(1)} %`);
const kl = snitt(dKlarsyn);
const nå = snitt(dNåbar);
const ko = snitt(dKons);
si(
  `klarsynsandel av taket i dette vinduet: ${kl === 0 ? "—" : `${(100 * (1 - Math.max(nå, ko) / kl)).toFixed(1)} %`}` +
    `   (best nåbar ${Math.max(nå, ko).toFixed(3)} av tak ${kl.toFixed(3)})`,
);

for (const [tittel, b] of [
  ["BØTTER — NÅBART, argmax (dette kan en budmodell hente)", bøtterNåbar],
  ["BØTTER — NÅBART, konservativ (bytter bare over støygulvet)", bøtterKons],
  ["BØTTER — KLARSYN (§61s deling, samme vindu)", bøtterKlarsyn],
] as [string, Record<string, Bøtte>][]) {
  si("");
  si(tittel);
  si(`${"bøtte".padEnd(28)} ${"giv".padStart(5)} ${"andel".padStart(7)} ${"sum".padStart(9)} ${"per runde".padStart(10)}`);
  for (const [k, v] of Object.entries(b).sort((x, y) => y[1].sum - x[1].sum)) {
    si(
      `${k.padEnd(28)} ${String(v.n).padStart(5)} ${((100 * v.n) / n).toFixed(1).padStart(6)}% ${v.sum.toFixed(0).padStart(9)} ${(v.sum / n).toFixed(3).padStart(10)}`,
    );
  }
}

si("");
si("POLICYENS ÅPNINGSBUD");
si(
  Object.entries(policybud)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join("  "),
);

si("");
si("KONSTANTENE — «by alltid X i åpningen», parret mot policyen på samme giv");
si(`${"bud".padEnd(12)} ${"per runde".padStart(10)} ${"± se".padStart(8)} ${"tegntest".padStart(9)} ${"ulik policy".padStart(12)}`);
for (const [k, xs] of Object.entries(konstant)) {
  si(
    `${k.padEnd(12)} ${snitt(xs).toFixed(3).padStart(10)} ${se(xs).toFixed(3).padStart(8)} ${tegn(xs).toFixed(2).padStart(9)} ${andel(xs).toFixed(1).padStart(11)}%`,
  );
}

si("");
si("FASIT — budet mot lagstikket i policy-linja (etterpåklokskap, ikke tiltak)");
si(`${"klasse".padEnd(30)} ${"giv".padStart(5)} ${"andel".padStart(7)} ${"poeng/runde".padStart(12)}`);
for (const [k, v] of Object.entries(fasit).sort((x, y) => y[1].n - x[1].n)) {
  si(
    `${k.padEnd(30)} ${String(v.n).padStart(5)} ${((100 * v.n) / n).toFixed(1).padStart(6)}% ${(v.poeng / n).toFixed(3).padStart(12)}`,
  );
}

si("");
si("A4-SAMPLEREN (trekkVerdener + medVerden), 30 giv × 3 verdener");
si(`  verdener prøvd                 ${a4Prøvd}`);
si(`  med DUPLIKATKORT (hånd+talong) ${a4Duplikat}  (${((100 * a4Duplikat) / Math.max(1, a4Prøvd)).toFixed(1)} %)`);
si(`  duplikatkort per verden        ${(a4DuplikatKort / Math.max(1, a4Prøvd)).toFixed(2)} av 52`);
si(`  talongen uendret fra virkelig  ${a4TalongLik}  (${((100 * a4TalongLik) / Math.max(1, a4Prøvd)).toFixed(1)} %)`);

appendFileSync(UT, `${linjer.join("\n")}\n`);
console.log(`\nskrevet: ${UT} og ${JSONL}`);
