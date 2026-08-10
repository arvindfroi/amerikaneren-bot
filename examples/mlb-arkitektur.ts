/**
 * ARKITEKTURREVISJONEN — måler hvilke INNGANGER som faktisk kan bære læring.
 *
 * Arvind, 10. august: «se i arkitekturen for å se om den har alle evnene og
 * blokkene den trenger. ofte så er det noe koblet opp eller så er det en evne
 * vi ikke har tenkt på.»
 *
 * Fila måler tre ting som ikke kan leses ut av kildekoden:
 *
 *   --vekt      Har vektene som mater en inngang FLYTTET SEG under trening?
 *               En inngang som alltid er null gir eksakt null gradient, og da
 *               er kolonnen fortsatt He-initialiseringen (bare krympet av
 *               AdamW). En inngang som er KONSTANT gir gradient, men den er
 *               kollineær med biasen — kolonnen er da en omskalert bias og
 *               bærer ingen funksjon av inngangen.
 *
 *   --valg      Endrer nettet VALG når en blokk forstyrres? Det er den samme
 *               prøven §K5 kjørte på den gamle stakken («0 av 20»), flyttet
 *               til sandkassen, og den skiller «inngangen finnes» fra
 *               «inngangen betyr noe».
 *
 *   --slutt     Hvor mange KORTFORDELINGER er forenlige med det boten lovlig
 *               ser, k stikk før slutt? Det avgjør om en eksakt sluttspills-
 *               løser er mulig i det hele tatt uten å se skjulte kort.
 *
 * Alt skrives LØPENDE til fil. `docs/plan.md` har en hard regel om at
 * flertimersmålinger aldri skal ligge i et stdout-rør.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { FARGER, lagRng } from "../src/kort.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { readFileSync } from "node:fs";
import { opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { kortgiving, lagRegler } from "../src/regler.ts";
import { Sandkassenett, velgKode } from "../src/mlb/nett.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import {
  HANDLING_NAVN,
  maske,
  nesteDelsteg,
  ta,
  TOMT_DELVALG,
  type Delvalg,
  type Giving,
} from "../src/mlb/handling.ts";
import { BLOKK, byggTrekk, TREKK_LENGDE, TREKK_NAVN } from "../src/mlb/trekk.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";

// ---------------------------------------------------------------------------
// Argumenter
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flagg = (n: string): boolean => argv.includes(n);
const arg = (n: string, standard: string): string => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? standard) : standard;
};

/**
 * TROEN SOM INNGANG (§126). MÅ være på når vektene er trent med den på.
 *
 * Prøvene her bygger ekte trekkvektorer og måler hva nettet VELGER. Bygges de
 * med TRO-blokken på null mens vektene ble trent med den fylt, måler prøven en
 * tilstand nettet aldri har sett — og «kollapset» den rapporterer ville vært
 * målerigens egen, ikke policyens.
 */
const trosti = arg("--tro", "e1-modell/mlb-tro.bin");
const tronett = trosti === "" ? null : MlbTronett.fraBytes(readFileSync(trosti));

const ut = arg("--ut", "analyse/mlb-arkitektur.txt");
mkdirSync(dirname(ut), { recursive: true });
if (!flagg("--tilfoy")) writeFileSync(ut, `mlb-arkitektur ${new Date().toISOString()}\n`);
const skriv = (s: string): void => {
  appendFileSync(ut, s + "\n");
  process.stderr.write(s + "\n");
};

/** Hvilken blokk hører inngang `i` til? */
function blokkFor(i: number): string {
  const g = Object.entries(BLOKK).sort((a, b) => b[1] - a[1]);
  for (const [navn, start] of g) if (i >= start) return navn;
  return "MIKRO";
}

// ---------------------------------------------------------------------------
// 1. VEKTREVISJONEN
// ---------------------------------------------------------------------------

/**
 * Stammens FØRSTE lag er `[ut][inn]`, altså `vekter[r * inn + c]`. Kolonne `c`
 * er hele det inngangen kan påvirke — flytter den seg ikke, kan inngangen ikke
 * ha lært noe, uansett hva den inneholder.
 */
function vektrevisjon(tidligSti: string, senSti: string): void {
  const tidlig = nettFraBytes(readFileSync(tidligSti))[0]!.lag[0]!;
  const sen = nettFraBytes(readFileSync(senSti))[0]!.lag[0]!;
  if (tidlig.inn !== sen.inn || tidlig.ut !== sen.ut) throw new Error("Ulik form på de to nettene");
  const { inn, ut: nUt } = tidlig;

  const normTidlig = new Float64Array(inn);
  const normSen = new Float64Array(inn);
  const absDiff = new Float64Array(inn);
  // Forholdet W_sen / W_tidlig per vekt. En kolonne som BARE er krympet av
  // AdamWs vektnedbrytning har samme forhold i hver eneste rad.
  const forholdSpenn = new Float64Array(inn);

  for (let c = 0; c < inn; c++) {
    let a = 0;
    let b = 0;
    let d = 0;
    let minF = Infinity;
    let maksF = -Infinity;
    for (let r = 0; r < nUt; r++) {
      const x = tidlig.vekter[r * inn + c]!;
      const y = sen.vekter[r * inn + c]!;
      a += x * x;
      b += y * y;
      d = Math.max(d, Math.abs(y - x));
      if (Math.abs(x) > 1e-12) {
        const f = y / x;
        if (f < minF) minF = f;
        if (f > maksF) maksF = f;
      }
    }
    normTidlig[c] = Math.sqrt(a);
    normSen[c] = Math.sqrt(b);
    absDiff[c] = d;
    forholdSpenn[c] = Number.isFinite(minF) ? maksF - minF : NaN;
  }

  // Biasen, som referanse: en konstant inngang beveger seg NØYAKTIG som biasen.
  const biasDiff: number[] = [];
  for (let r = 0; r < nUt; r++) biasDiff.push(sen.bias[r]! - tidlig.bias[r]!);

  const korr = (c: number): number => {
    const kol: number[] = [];
    for (let r = 0; r < nUt; r++) kol.push(sen.vekter[r * inn + c]! - tidlig.vekter[r * inn + c]!);
    const mx = kol.reduce((s, v) => s + v, 0) / nUt;
    const my = biasDiff.reduce((s, v) => s + v, 0) / nUt;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let r = 0; r < nUt; r++) {
      const dx = kol[r]! - mx;
      const dy = biasDiff[r]! - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  };

  skriv(`\n=== VEKTREVISJON: ${tidligSti} -> ${senSti} ===`);
  skriv(`stammens forste lag: ${inn} inn x ${nUt} ut`);

  // Grupper: kolonner som ikke har flyttet seg i det hele tatt, kolonner som
  // bare er KRYMPET (samme forhold i hver rad), og resten.
  const frosne: number[] = [];
  const bareKrympet: number[] = [];
  const levende: number[] = [];
  for (let c = 0; c < inn; c++) {
    // Baren er 1e-3 og ikke 0: vektene ligger i float32, så et FELLES forhold
    // leses tilbake med ~1e-7 relativ avrunding per vekt. En kolonne som har
    // lært noe har et spenn i størrelsesorden 1e+2 (se rapporten), så det er
    // ingen tvil om hvilken side av baren en kolonne havner på.
    if (absDiff[c] === 0) frosne.push(c);
    else if (forholdSpenn[c]! < 1e-3) bareKrympet.push(c);
    else levende.push(c);
  }
  skriv(`kolonner uendret (bit-identiske):        ${frosne.length}`);
  skriv(`kolonner BARE krympet (samme forhold):   ${bareKrympet.length}`);
  skriv(`kolonner som har flyttet seg fritt:      ${levende.length}`);

  if (bareKrympet.length > 0) {
    const c0 = bareKrympet[0]!;
    let f = NaN;
    for (let r = 0; r < nUt; r++) {
      const x = tidlig.vekter[r * inn + c0]!;
      if (Math.abs(x) > 1e-12) {
        f = sen.vekter[r * inn + c0]! / x;
        break;
      }
    }
    skriv(`  krympefaktoren er ${f.toFixed(6)} — ren AdamW-vektnedbrytning, ingen laering`);
    const perBlokk = new Map<string, number>();
    for (const c of bareKrympet) perBlokk.set(blokkFor(c), (perBlokk.get(blokkFor(c)) ?? 0) + 1);
    for (const [b, n] of perBlokk) skriv(`  ${b}: ${n}`);
    const ikkeTro = bareKrympet.filter((c) => blokkFor(c) !== "TRO");
    skriv(`  ALLE dode utenfor TRO: ${ikkeTro.map((c) => TREKK_NAVN[c]).join(", ")}`);
  }

  /**
   * KONSTANTENE, FUNNET AV VEKTENE OG IKKE AV EN LISTE.
   *
   * En inngang som er konstant `c != 0` gir gradienten `c · δ` — nøyaktig
   * proporsjonal med biasens `δ`. Kolonnen er da en OMSKALERT BIAS, og
   * korrelasjonen mellom kolonnens endring og biasens endring er 1 til siste
   * siffer. Det er den eneste måten å finne dem UTEN å vite hvilke de er.
   */
  const rangert: { c: number; r: number }[] = [];
  for (let c = 0; c < inn; c++) {
    if (absDiff[c] === 0 || forholdSpenn[c]! < 1e-3) continue; // dode, alt talt
    const r = korr(c);
    if (Number.isFinite(r)) rangert.push({ c, r });
  }
  rangert.sort((a, b) => b.r - a.r);
  const nesten = rangert.filter((x) => x.r > 0.999);
  skriv(`\nKONSTANTE INNGANGER, FUNNET AV VEKTENE (r mot biasen > 0,999): ${nesten.length}`);
  for (const x of nesten) skriv(`  ${TREKK_NAVN[x.c]!.padEnd(30)} r = ${x.r.toFixed(8)}`);
  skriv(`  --- de ti nest hoyeste, som IKKE er konstante ---`);
  for (const x of rangert.filter((y) => y.r <= 0.999).slice(0, 10)) {
    skriv(`  ${TREKK_NAVN[x.c]!.padEnd(30)} r = ${x.r.toFixed(8)}`);
  }

  // De konstante inngangene, navngitt i oppdraget.
  const konstante = [
    "meso.talong",
    "meso.antallStikk",
    "makro.antallStikk",
    "makro.antallSpillere",
    "makro.målPoeng.per100",
    "makro.målPoeng.trettiDelt",
  ];
  skriv(`\nKONSTANTE INNGANGER — korrelasjon mellom kolonnens endring og BIASENS endring:`);
  skriv(`(1,00 betyr at kolonnen er en omskalert bias og ikke kan uttrykke noe om inngangen)`);
  for (const navn of konstante) {
    const c = TREKK_NAVN.indexOf(navn);
    if (c < 0) {
      skriv(`  ${navn}: FINNES IKKE`);
      continue;
    }
    skriv(
      `  ${navn.padEnd(28)} r = ${korr(c).toFixed(4)}  |W| ${normTidlig[c]!.toFixed(4)} -> ${normSen[c]!.toFixed(4)}`,
    );
  }
  // Referanse: noen levende inngangar.
  skriv(`  --- til sammenlikning, inngangar som VARIERER ---`);
  for (const navn of ["mikro.hånd.S14", "mikro.stikkIgjen", "makro.racepress", "meso.kontrakt"]) {
    const c = TREKK_NAVN.indexOf(navn);
    if (c < 0) continue;
    skriv(
      `  ${navn.padEnd(28)} r = ${korr(c).toFixed(4)}  |W| ${normTidlig[c]!.toFixed(4)} -> ${normSen[c]!.toFixed(4)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. VALGREVISJONEN — endrer en forstyrrelse i en blokk faktisk et valg?
// ---------------------------------------------------------------------------

interface Punkt {
  readonly trekk: Float32Array;
  readonly maske: Uint8Array;
  readonly fase: string;
  /** Egen hånd ved beslutningen — bare for å kunne DØMME et trumfvalg. */
  readonly hånd: readonly { farge: string; verdi: number }[];
}

/** Samle ekte beslutningspunkter ved å la nettet spille mot seg selv. */
function samlePunkter(nett: Sandkassenett, antallKamper: number, målPoeng: number): Punkt[] {
  const punkter: Punkt[] = [];
  for (let k = 0; k < antallKamper; k++) {
    const regler = lagRegler({ antallSpillere: 4, målPoeng });
    const giving = kortgiving(regler);
    const givingKort: Giving = { antallStikk: giving.antallStikk, talong: giving.talong };
    const bok = new Hukommelse();
    let s: GameState = opprettSpill(regler, 12_000_000 + k * 7717);
    const rng = lagRng(k + 1);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 100_000 && s.rundeNr < 100) {
      bok.observer(s);
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null) break;
      let delvalg: Delvalg = TOMT_DELVALG;
      let ferdig = false;
      let indre = 0;
      while (!ferdig && indre++ < 64) {
        const visning = spillerVisning(s, sete);
        const m = maske(visning, givingKort, delvalg);
        const trekk = byggTrekk(visning, {
          regler,
          giving,
          delvalg,
          hukommelse: bok.vektor(sete, 4),
          tronett,
        });
        const steg = nesteDelsteg(visning, delvalg);
        let lovlige = 0;
        for (let i = 0; i < m.length; i++) if (m[i] === 1) lovlige++;
        if (lovlige >= 2) {
          punkter.push({
            trekk,
            maske: m,
            fase: steg ?? "?",
            hånd: visning.dinHånd.map((k) => ({ farge: String(k.farge), verdi: k.verdi })),
          });
        }
        const kode = velgKode(nett.framover(trekk).policy, m, 0, rng);
        const r = ta(visning, givingKort, delvalg, kode);
        if (r.ferdig) {
          const h = r.handling;
          s = utfør(s, {
            ...(h.type === "BUD"
              ? { type: "BUD" as const, spiller: sete, bud: h.bud }
              : h.type === "VRAK"
                ? { type: "VRAK" as const, spiller: sete, kort: h.kort }
                : h.type === "VELG"
                  ? { type: "VELG" as const, spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst }
                  : { type: "SPILL" as const, spiller: sete, kort: h.kort }),
          }).state;
          ferdig = true;
        } else delvalg = r.delvalg;
      }
    }
  }
  return punkter;
}

function valgrevisjon(nett: Sandkassenett, punkter: readonly Punkt[]): void {
  skriv(`\n=== VALGREVISJON: ${punkter.length} ekte beslutninger med >= 2 lovlige ===`);

  const grunnvalg = punkter.map((p) => velgKode(nett.framover(p.trekk).policy, p.maske, 0, () => 0));

  const prøv = (navn: string, endre: (v: Float32Array) => void): void => {
    let endret = 0;
    const perFase = new Map<string, [number, number]>();
    for (let i = 0; i < punkter.length; i++) {
      const p = punkter[i]!;
      const v = new Float32Array(p.trekk);
      endre(v);
      const kode = velgKode(nett.framover(v).policy, p.maske, 0, () => 0);
      const rad = perFase.get(p.fase) ?? [0, 0];
      rad[1]++;
      if (kode !== grunnvalg[i]) {
        endret++;
        rad[0]++;
      }
      perFase.set(p.fase, rad);
    }
    const andel = ((endret / punkter.length) * 100).toFixed(2);
    const detalj = [...perFase.entries()]
      .map(([f, [a, b]]) => `${f} ${a}/${b}`)
      .join("  ");
    skriv(`  ${navn.padEnd(34)} ${String(endret).padStart(6)}/${punkter.length} (${andel} %)   ${detalj}`);
  };

  const iPer100 = TREKK_NAVN.indexOf("makro.målPoeng.per100");
  const iTretti = TREKK_NAVN.indexOf("makro.målPoeng.trettiDelt");

  prøv("løpslengde 30 -> 100", (v) => {
    v[iPer100] = 1.0;
    v[iTretti] = 0.3;
  });
  prøv("løpslengde 30 -> 15", (v) => {
    v[iPer100] = 0.15;
    v[iTretti] = 1.0;
  });
  prøv("TRO-blokken: p ~ uniform (0,25)", (v) => {
    for (let i = 0; i < 52; i++) {
      if (v[BLOKK.TRO + i] !== 1) continue;
      for (let c = 0; c < 4; c++) v[BLOKK.TRO + 52 + i * 4 + c] = 0.25;
    }
    v[BLOKK.TRO + 52 + 208] = 1;
  });
  prøv("TRO-blokken: nettets EGET trohode", (v) => {
    const p = nett.troFordeling(v);
    for (let i = 0; i < 52; i++) {
      if (v[BLOKK.TRO + i] !== 1) continue;
      const rad = p[i]!;
      for (let c = 0; c < 4; c++) v[BLOKK.TRO + 52 + i * 4 + c] = rad[c] ?? 0;
    }
    v[BLOKK.TRO + 52 + 208] = 1;
  });
  prøv("HUKOMMELSE-blokken nullet", (v) => {
    for (let i = 0; i < BLOKK.MESO - BLOKK.HUKOMMELSE; i++) v[BLOKK.HUKOMMELSE + i] = 0;
  });
  /**
   * BARE MESO-LEDDENE I HUKOMMELSEN — «budet hun ga MOT HÅNDEN HUN VISTE SEG Å
   * HA» (`docs/sandkassen.md` §3) er indeks 11–28 av 48 per motstander. Det er
   * det signalet dokumentet kaller det sterkeste, og prøven spør om det når
   * fram til budet i det hele tatt.
   */
  prøv("HUKOMMELSE, bare MESO-leddene nullet", (v) => {
    for (let d = 0; d < 3; d++) {
      for (let i = 11; i <= 28; i++) v[BLOKK.HUKOMMELSE + d * 48 + i] = 0;
    }
  });
  prøv("MIKRO-blokken nullet (skalareferanse)", (v) => {
    for (let i = 0; i < BLOKK.TRO - BLOKK.MIKRO; i++) v[BLOKK.MIKRO + i] = 0;
  });
  prøv("KONVENSJON-blokken nullet", (v) => {
    for (let i = 0; i < BLOKK.LOVLIG - BLOKK.KONVENSJON; i++) v[BLOKK.KONVENSJON + i] = 0;
  });
  prøv("MAKRO-blokken nullet", (v) => {
    for (let i = 0; i < BLOKK.KONVENSJON - BLOKK.MAKRO; i++) v[BLOKK.MAKRO + i] = 0;
  });
  prøv("kampstilling: alle poeng like", (v) => {
    for (const n of ["makro.poeng.rel0", "makro.poeng.rel1", "makro.poeng.rel2", "makro.poeng.rel3"]) {
      const i = TREKK_NAVN.indexOf(n);
      if (i >= 0) v[i] = 0.5;
    }
    const r = TREKK_NAVN.indexOf("makro.racepress");
    if (r >= 0) v[r] = 0;
  });

  /**
   * K5 SLIK KRAVET FAKTISK ER FORMULERT — `docs/krav-status.md`: «bak 70–90»
   * ga **0 av 20** endrede valg på den gamle stakken. Her settes stillingen
   * direkte i vektoren, i begge retninger, ved målPoeng 100.
   */
  const settStilling = (v: Float32Array, egne: number, beste: number, mål: number): void => {
    const s = (n: string, x: number): void => {
      const i = TREKK_NAVN.indexOf(n);
      if (i >= 0) v[i] = x;
    };
    const kl = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
    s("makro.poeng.rel0", kl(egne / mål));
    s("makro.poeng.rel1", kl(beste / mål));
    s("makro.poeng.rel2", kl((beste - 10) / mål));
    s("makro.poeng.rel3", kl((beste - 20) / mål));
    s("makro.leder.rel0", egne >= beste ? 1 : 0);
    s("makro.leder.rel1", egne >= beste ? 0 : 1);
    s("makro.leder.rel2", 0);
    s("makro.leder.rel3", 0);
    s("makro.gapTilBeste", kl((beste - egne) / mål));
    s("makro.forsprang", kl((egne - beste) / mål));
    s("makro.framdrift", kl(Math.max(egne, beste) / mål));
    s("makro.målPoeng.per100", kl(mål / 100));
    s("makro.målPoeng.trettiDelt", kl(30 / mål));
  };
  prøv("K5 bak 70–90 (mål 100)", (v) => settStilling(v, 70, 90, 100));
  prøv("K5 foran 90–70 (mål 100)", (v) => settStilling(v, 90, 70, 100));
}

// ---------------------------------------------------------------------------
// 3. SLUTTSPILLET — hvor mange fordelinger er FORENLIGE med lovlig informasjon?
// ---------------------------------------------------------------------------

/**
 * Ved `k` stikk igjen: hvor mange måter kan de usette kortene ligge på, gitt
 * ALT boten lovlig vet (egen hånd, spilte kort, eget vrak, talongens
 * størrelse, og renonsene som følgeplikten har avslørt)?
 *
 * Tallet avgjør om «eksakt sluttspillsløsning» er noe annet enn dobbeltdummy.
 */
function sluttspillrevisjon(giver: number, målPoeng: number): void {
  skriv(`\n=== SLUTTSPILLET: forenlige kortfordelinger, ${giver} giv ===`);
  const teller = new Map<
    number,
    { n: number; sumLog: number; sumLogR: number; min: number; maks: number }
  >();

  for (let g = 0; g < giver; g++) {
    const regler = lagRegler({ antallSpillere: 4, målPoeng });
    const giving = kortgiving(regler);
    let s: GameState = opprettSpill(regler, 13_000_000 + g * 5171);
    const rng = lagRng(g + 1);
    let vakt = 0;
    // Bare FØRSTE runde per giv: sluttspillet er det samme uansett kampstilling.
    const startRunde = s.rundeNr;
    while (s.fase !== "FERDIG" && s.rundeNr === startRunde && vakt++ < 20_000) {
      if (s.fase === "RUNDE_SLUTT") break;
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null) break;

      if (s.fase === "SPILL" && s.bord.length === 0) {
        const igjen = giving.antallStikk - s.stikkSpilt;
        if (igjen >= 1 && igjen <= 6) {
          const v = spillerVisning(s, sete);
          // Usette kort, sett fra `sete`.
          const usett = new Uint8Array(52).fill(1);
          for (const k of v.dinHånd) usett[kortIndeks(k)] = 0;
          for (const st of v.historikk) for (const kp of st.kort) usett[kortIndeks(kp.kort)] = 0;
          for (const kp of v.bord) usett[kortIndeks(kp.kort)] = 0;
          for (const k of v.dittVrak) usett[kortIndeks(k)] = 0;
          let antallUsett = 0;
          for (let i = 0; i < 52; i++) antallUsett += usett[i]!;
          // Tre motstanderhender à `igjen` kort + talongen tar resten.
          // Antall måter = multinomial(antallUsett; igjen, igjen, igjen, rest).
          const rest = antallUsett - 3 * igjen;
          if (rest < 0) continue;
          const logFak = (n: number): number => {
            let x = 0;
            for (let i = 2; i <= n; i++) x += Math.log10(i);
            return x;
          };
          const logN = logFak(antallUsett) - 3 * logFak(igjen) - logFak(rest);

          /**
           * MED RENONSENE. Følgeplikten er den ENE slutningen som er gratis og
           * sikker: la noen et annet kort enn utspillsfargen, er hun tom i den
           * fargen fra da av. Uten den er tellingen over en øvre grense; med
           * den er den den ærlige.
           */
          const renons: boolean[][] = [
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false],
          ];
          for (const st of v.historikk) {
            const ledet = st.kort[0];
            if (ledet === undefined) continue;
            for (const kp of st.kort) {
              if (kp.kort.farge !== ledet.kort.farge) {
                renons[kp.spiller]![FARGER.indexOf(ledet.kort.farge)] = true;
              }
            }
          }
          const ledetNå = v.bord[0];
          if (ledetNå !== undefined) {
            for (const kp of v.bord) {
              if (kp.kort.farge !== ledetNå.kort.farge) {
                renons[kp.spiller]![FARGER.indexOf(ledetNå.kort.farge)] = true;
              }
            }
          }

          // Bøttene: de tre andre setene (kapasitet `igjen`) + talongen (`rest`).
          const andre: number[] = [];
          for (let i = 1; i < 4; i++) andre.push((sete + i) % 4);
          const kap = [igjen, igjen, igjen, rest];
          const lov: boolean[][] = [
            ...andre.map((s) => FARGER.map((_, f) => !renons[s]![f])),
            [true, true, true, true],
          ];
          const perFarge = FARGER.map((f) => {
            let m = 0;
            for (let i = 0; i < 52; i++) {
              if (usett[i] === 1 && FARGER[Math.floor(i / 13)] === f) m++;
            }
            return m;
          });

          // DP over (brukt kapasitet i hver bøtte), farge for farge, bøtte for bøtte.
          const bin = (n: number, k: number): number => {
            if (k < 0 || k > n) return 0;
            let x = 1;
            for (let i = 0; i < k; i++) x = (x * (n - i)) / (i + 1);
            return x;
          };
          const nøkkel = (u: number[]): number =>
            u[0]! + 14 * (u[1]! + 14 * (u[2]! + 14 * u[3]!));
          let dp = new Map<number, number>([[nøkkel([0, 0, 0, 0]), 1]]);
          for (let f = 0; f < 4; f++) {
            const m = perFarge[f]!;
            if (m === 0) continue;
            // Fordel `m` kort av fargen over de fire bøttene, én bøtte om gangen.
            let trinn = new Map<string, number>();
            for (const [nk, vekt] of dp) trinn.set(`${nk}|0`, vekt);
            for (let b = 0; b < 4; b++) {
              const neste = new Map<string, number>();
              for (const [nøkkelIgjen, vekt] of trinn) {
                const [nkS, brukS] = nøkkelIgjen.split("|");
                const nk = Number(nkS);
                const brukt = Number(brukS);
                const u = [nk % 14, Math.floor(nk / 14) % 14, Math.floor(nk / 196) % 14, Math.floor(nk / 2744)];
                const maks = lov[b]![f] === true ? Math.min(m - brukt, kap[b]! - u[b]!) : 0;
                for (let k = 0; k <= maks; k++) {
                  if (b === 3 && brukt + k !== m) continue; // siste bøtte må ta resten
                  const u2 = [...u];
                  u2[b] = u[b]! + k;
                  const nn = `${nøkkel(u2)}|${brukt + k}`;
                  neste.set(nn, (neste.get(nn) ?? 0) + vekt * bin(m - brukt, k));
                }
              }
              trinn = neste;
            }
            const ny = new Map<number, number>();
            for (const [nøkkelIgjen, vekt] of trinn) {
              const nk = Number(nøkkelIgjen.split("|")[0]);
              ny.set(nk, (ny.get(nk) ?? 0) + vekt);
            }
            dp = ny;
          }
          const målnøkkel = nøkkel([igjen, igjen, igjen, rest]);
          const medRenons = dp.get(målnøkkel) ?? 0;
          const logR = medRenons > 0 ? Math.log10(medRenons) : 0;

          const rad = teller.get(igjen) ?? {
            n: 0,
            sumLog: 0,
            sumLogR: 0,
            min: Infinity,
            maks: -Infinity,
          };
          rad.n++;
          rad.sumLog += logN;
          rad.sumLogR += logR;
          rad.min = Math.min(rad.min, logR);
          rad.maks = Math.max(rad.maks, logR);
          teller.set(igjen, rad);
        }
      }

      // Spill videre med et enkelt, lovlig valg (laveste lovlige handling).
      const visning = spillerVisning(s, sete);
      const givingKort: Giving = { antallStikk: giving.antallStikk, talong: giving.talong };
      let delvalg: Delvalg = TOMT_DELVALG;
      let ferdig = false;
      let indre = 0;
      while (!ferdig && indre++ < 64) {
        const vv = spillerVisning(s, sete);
        const m = maske(vv, givingKort, delvalg);
        const koder: number[] = [];
        for (let i = 0; i < m.length; i++) if (m[i] === 1) koder.push(i);
        const kode = koder[Math.floor(rng() * koder.length) % koder.length]!;
        const r = ta(vv, givingKort, delvalg, kode);
        if (r.ferdig) {
          const h = r.handling;
          s = utfør(s, {
            ...(h.type === "BUD"
              ? { type: "BUD" as const, spiller: sete, bud: h.bud }
              : h.type === "VRAK"
                ? { type: "VRAK" as const, spiller: sete, kort: h.kort }
                : h.type === "VELG"
                  ? { type: "VELG" as const, spiller: sete, trumf: h.trumf, etterlyst: h.etterlyst }
                  : { type: "SPILL" as const, spiller: sete, kort: h.kort }),
          }).state;
          ferdig = true;
        } else delvalg = r.delvalg;
      }
      void visning;
    }
  }

  skriv(`  stikk igjen | n | log10(fordelinger) UTEN renons | MED renons | min | maks`);
  for (const k of [...teller.keys()].sort((a, b) => a - b)) {
    const r = teller.get(k)!;
    skriv(
      `  ${String(k).padStart(11)} | ${String(r.n).padStart(4)} | ` +
        `${(r.sumLog / r.n).toFixed(2).padStart(28)} | ${(r.sumLogR / r.n).toFixed(2).padStart(10)} | ` +
        `${r.min.toFixed(2)} | ${r.maks.toFixed(2)}`,
    );
  }
  skriv(`  (log10 = 6 betyr en million fordelinger; hver må loeses eksakt for aa gi et eksakt svar)`);
}

// ---------------------------------------------------------------------------
// Kjøringen
// ---------------------------------------------------------------------------

skriv(`TREKK_LENGDE = ${TREKK_LENGDE}`);

if (flagg("--vekt")) {
  vektrevisjon(arg("--tidlig", "e1-modell/mlb-e1.bin"), arg("--sen", "e1-modell/mlb-g05-beste.bin"));
}

if (flagg("--valg")) {
  const nett = Sandkassenett.fraFil(arg("--nett", "e1-modell/mlb-g05-beste.bin"));
  const kamper = Number(arg("--kamper", "6"));
  const punkter = samlePunkter(nett, kamper, Number(arg("--maalpoeng", "30")));
  valgrevisjon(nett, punkter);
}

if (flagg("--fordeling")) {
  /**
   * HVA VELGER NETTET FAKTISK? En blokk som ikke endrer et valg kan enten være
   * uviktig — eller valget kan være en KONSTANT som ingenting kan flytte.
   * De to ser like ut i en forstyrrelsesprøve og er helt ulike ting.
   */
  const nett = Sandkassenett.fraFil(arg("--nett", "e1-modell/mlb-g05-beste.bin"));
  const punkter = samlePunkter(nett, Number(arg("--kamper", "40")), Number(arg("--maalpoeng", "30")));
  skriv(`
=== HANDLINGSFORDELING: ${punkter.length} beslutninger ===`);
  const perFase = new Map<string, Map<number, number>>();
  for (const p of punkter) {
    const kode = velgKode(nett.framover(p.trekk).policy, p.maske, 0, () => 0);
    const m = perFase.get(p.fase) ?? new Map<number, number>();
    m.set(kode, (m.get(kode) ?? 0) + 1);
    perFase.set(p.fase, m);
  }
  /**
   * SAMPLINGSENTROPIEN VED T = 1 — den treningen faktisk utforsker med.
   *
   * Argmaks-entropien over sier hva den UTRULLEDE boten gjør. Softmax-entropien
   * sier om SELVSPILLET i det hele tatt ser andre handlinger. Er den ~0, kan
   * fasen ikke lenger lære: den lager ingen variasjon å ta gradient over.
   */
  skriv(`
  softmax-entropi ved T = 1 (det selvspillet utforsker med):`);
  const entPerFase = new Map<string, number[]>();
  for (const p of punkter) {
    const logits = nett.framover(p.trekk).policy;
    let maks = -Infinity;
    for (let i = 0; i < p.maske.length; i++) {
      if (p.maske[i] === 1 && logits[i]! > maks) maks = logits[i]!;
    }
    let sum = 0;
    const w: number[] = [];
    for (let i = 0; i < p.maske.length; i++) {
      if (p.maske[i] !== 1) continue;
      const e = Math.exp(logits[i]! - maks);
      w.push(e);
      sum += e;
    }
    let H = 0;
    for (const e of w) {
      const q = e / sum;
      if (q > 0) H -= q * Math.log2(q);
    }
    const liste = entPerFase.get(p.fase) ?? [];
    liste.push(H / Math.log2(Math.max(2, w.length))); // normalisert: 1 = uniform
    entPerFase.set(p.fase, liste);
  }
  for (const [fase, liste] of entPerFase) {
    const snitt = liste.reduce((a, b) => a + b, 0) / liste.length;
    const under = liste.filter((x) => x < 0.01).length;
    skriv(
      `    ${fase.padEnd(16)} normalisert entropi ${snitt.toFixed(4)}   ` +
        `andel beslutninger under 0,01: ${((under / liste.length) * 100).toFixed(1)} %`,
    );
  }

  /**
   * ER TRUMFVALGET I DET HELE TATT ET VALG? Om argmaks alltid gir samme farge,
   * er spørsmålet hvor ofte den fargen er den boten faktisk BURDE valgt.
   * Målestokken er hånden selv — lengste farge, og lengste med brudd på styrke.
   * Det er ingen mester: det er å telle kort.
   */
  const trumfpunkter = punkter.filter((p) => p.fase === "VELG_TRUMF");
  if (trumfpunkter.length > 0) {
    let valgtErLengst = 0;
    let sumValgt = 0;
    let sumLengst = 0;
    for (const p of trumfpunkter) {
      const kode = velgKode(nett.framover(p.trekk).policy, p.maske, 0, () => 0);
      const navn = HANDLING_NAVN[kode] ?? "";
      const valgt = navn.startsWith("trumf:") ? navn.slice(6) : "";
      const lengde: Record<string, number> = {};
      for (const k of p.hånd) lengde[k.farge] = (lengde[k.farge] ?? 0) + 1;
      let maksL = 0;
      for (const f of Object.keys(lengde)) maksL = Math.max(maksL, lengde[f]!);
      const l = lengde[valgt] ?? 0;
      if (l === maksL) valgtErLengst++;
      sumValgt += l;
      sumLengst += maksL;
    }
    const n = trumfpunkter.length;
    skriv(
      `
  TRUMFVALGETS KVALITET (${n} valg): valgt farge er den LENGSTE i ` +
        `${((valgtErLengst / n) * 100).toFixed(1)} % (tilfeldig valg gir ~25-35 %). ` +
        `Snittlengde valgt ${(sumValgt / n).toFixed(2)} mot lengste ${(sumLengst / n).toFixed(2)}.`,
    );
  }

  for (const [fase, m] of perFase) {
    const sum = [...m.values()].reduce((a, b) => a + b, 0);
    const sortert = [...m.entries()].sort((a, b) => b[1] - a[1]);
    let H = 0;
    for (const [, n] of sortert) {
      const q = n / sum;
      H -= q * Math.log2(q);
    }
    skriv(
      `  ${fase.padEnd(16)} n=${String(sum).padStart(5)}  ulike koder=${String(sortert.length).padStart(3)}  ` +
        `entropi=${H.toFixed(3)} bit  topp: ` +
        sortert
          .slice(0, 5)
          .map(([k, n]) => `${HANDLING_NAVN[k]}=${((n / sum) * 100).toFixed(1)}%`)
          .join("  "),
    );
  }
}

if (flagg("--slutt")) {
  sluttspillrevisjon(Number(arg("--giver", "200")), Number(arg("--maalpoeng", "30")));
}

skriv(`\nFERDIG ${new Date().toISOString()}`);
