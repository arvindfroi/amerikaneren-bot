/**
 * HJELPER PROFILEN Å PREDIKERE MENNESKET? — måling (a), 12. september.
 *
 *   node examples/profil-tro.ts --nett e1-modell/tro-6.bin --spiller <pseudonym> \
 *     --ut analyse/profil/tro-s0.jsonl [--band holdout] [--rabatt 0.5] [--tak 24]
 *   node examples/profil-tro.ts --dom analyse/profil/tro-*.jsonl
 *
 * ===================== SPØRSMÅLET ========================================
 *
 * Eieren, 12. sep: «når botten starter en kamp mot en spiller så lastes den spilleren sine
 * vaner inn i botten sitt minne basert på tidligere matches.» Hele poenget med en profil er
 * at den virker FRA RUNDE 1 — der den tomme boka ikke vet noe som helst. Fra runde 8 har
 * kampens egen hukommelse tatt igjen mesteparten uansett.
 *
 * Derfor måles to ting, ikke ett: gevinsten totalt, og gevinsten I RUNDE 1.
 *
 * ===================== ARMENE ============================================
 *
 * Samme nett, samme stilling, samme kort. Bare motstanderboka skiller dem:
 *
 *   profil   boka SÅDD med spillerens profil fra TIDLIGERE kamper, pluss denne kampens
 *            ferdige runder oppå (`src/mlb/profil.ts`, rabattert).
 *   tom      boka fra denne kampens ferdige runder alene. DETTE ER DAGENS BOT.
 *   null     hukommelsesblokken null. Referansen som viser hvor mye boka i det hele tatt
 *            er verdt her — er `tom ≈ null`, er det ingen kanal å forbedre.
 *   fremmed  FELLE: en profil bygget av en ANNEN spillers kamper, samme form, samme
 *            tiltro, feil person. Slår ikke `profil` denne, måler vi at blokken FYLLES,
 *            ikke at den er RIKTIG. Uten denne fella er tallet verdiløst.
 *
 * ===================== STRENGT ETTER DATO ================================
 *
 * Kampene til spilleren sorteres på tid, og profilen som brukes i kamp `i` er bygget av
 * kampene med TIDLIGERE sluttid — aldri kamp `i` selv, aldri en senere. Det er ikke en
 * detalj: bygde profilen på alle kampene, ville den inneholdt rundene vi måler på, og
 * tallet ville vært en hukommelsestest, ikke en prediksjon.
 *
 * Profilen bygges av ALLE tidligere kamper (begge bånd), mens MÅLINGEN skjer på `--band
 * holdout`. Trohodet er trent på menneskerader fra treningsbåndet, så en måling der ville
 * blandet «profilen hjelper» med «nettet har sett runden».
 *
 * ===================== K2 ================================================
 *
 * Inngangen er `spillerVisning(s, sete)` og `bok.vektor(sete)`. Boka bokfører bare ferdige
 * runder, og profilen kan bare bygges av en bok (`bidragFraBok` tar ingen `GameState`).
 * Hendene leses bare av måltallet, som etikett — «hvor kortene faktisk lå», kjent ved
 * rundeslutt.
 *
 * ===================== NAVN ==============================================
 *
 * `--spiller` er et PSEUDONYM (12 hex). Ingen navn finnes i loggen, og ingen skrives ut.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import {
  bidragFraBok,
  gyldigId,
  slåSammen,
  startbok,
  tomProfil,
  type Spillerprofil,
} from "../src/mlb/profil.ts";
import { andelGulvTak, gulvene, nettTap } from "./k8-maal.ts";
import { klyngeSnitt } from "./klynge.ts";
import {
  kamprunder,
  lesMenneskelogg,
  MENNESKE,
  MENNESKE_FRA,
  menneskeBånd,
  nyTeller,
  somRundeslutt,
  tellerTekst,
  V5_KJEDE,
  type Budgiver,
} from "./menneske-logg.ts";

const argv = process.argv;
const arg = (n: string, s: string): string => {
  const i = argv.indexOf(n);
  return i < 0 ? s : (argv[i + 1] ?? s);
};

export interface Profiltrorad {
  readonly spill: string;
  readonly kampnr: number;
  readonly runde: number;
  /** Ferdige runder i kampens egen bok FØR denne runden. 0 = runde 1, profilens hele poeng. */
  readonly bok: number;
  /** Runder profilen er bygget av. 0 = ingen tidligere kamper. */
  readonly profilrunder: number;
  readonly sete: number;
  readonly kort: number;
  readonly gulv: number;
  readonly profil: number;
  readonly tom: number;
  readonly null: number;
  readonly fremmed: number;
}

// ===========================================================================
// DOM
// ===========================================================================

const pm = (x: { snitt: number; se: number }): string =>
  `${(100 * x.snitt).toFixed(2)} ± ${(100 * x.se).toFixed(2)} %`;

export function rapport(rader: readonly Profiltrorad[], B = 2000): string {
  const L: string[] = [];
  const andel = (r: Profiltrorad, arm: "profil" | "tom" | "null" | "fremmed"): number =>
    andelGulvTak(r[arm]);
  const a = (rr: readonly Profiltrorad[], arm: "profil" | "tom" | "null" | "fremmed") =>
    klyngeSnitt(rr, (x) => x.spill, (x) => andel(x, arm), B);
  const diff = (rr: readonly Profiltrorad[], x: "profil", y: "tom" | "fremmed") =>
    klyngeSnitt(rr, (r) => r.spill, (r) => andel(r, x) - andel(r, y), B);

  const deler: [string, Profiltrorad[]][] = [
    ["alle stillinger", [...rader]],
    ["RUNDE 1 (tom bok)", rader.filter((r) => r.bok === 0)],
    ["runde 2–4", rader.filter((r) => r.bok >= 1 && r.bok <= 3)],
    ["runde 5+", rader.filter((r) => r.bok >= 4)],
  ];
  L.push(`PROFIL MOT TOM BOK — % av veien gulv → tak, SE klynget på kamp (B = ${B})`);
  L.push(`n = ${rader.length} stillinger i ${new Set(rader.map((r) => r.spill)).size} kamper`);
  for (const [navn, rr] of deler) {
    if (rr.length === 0) {
      L.push(`\n[${navn}] ingen rader`);
      continue;
    }
    L.push(`\n[${navn}] n = ${rr.length}`);
    L.push(`  profil     ${pm(a(rr, "profil"))}`);
    L.push(`  tom        ${pm(a(rr, "tom"))}   (dagens bot)`);
    L.push(`  null       ${pm(a(rr, "null"))}`);
    L.push(`  fremmed    ${pm(a(rr, "fremmed"))}   (felle: feil spillers profil)`);
    const g = diff(rr, "profil", "tom");
    const f = diff(rr, "profil", "fremmed");
    L.push(`  GEVINST profil − tom      ${pm(g)}  z = ${(g.snitt / (g.se || Infinity)).toFixed(2)}`);
    L.push(`  FELLE   profil − fremmed  ${pm(f)}  z = ${(f.snitt / (f.se || Infinity)).toFixed(2)}`);
  }
  /**
   * KONTROLLEN. Gulvkolonnen må være ln 3 per rad; bommer den, er utvalget eller måltallet
   * galt, og ingen av tallene over skal leses som dom.
   */
  const gulvOk = rader.every((r) => Math.abs(r.gulv - Math.log(3)) < 1e-4);
  L.push(`\nKONTROLL gulv = ln 3: ${gulvOk ? "OK" : "BOMMET — tallene over er STUMME"}`);
  return L.join("\n");
}

if (argv.includes("--dom")) {
  const filer = argv.slice(argv.indexOf("--dom") + 1).filter((f) => !f.startsWith("--"));
  const rader: Profiltrorad[] = [];
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") rader.push(JSON.parse(l) as Profiltrorad);
  }
  console.log(rapport(rader));
} else {
  kjør();
}

function kjør(): void {
  const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
  const NETTFIL = arg("--nett", "e1-modell/tro-6.bin");
  const SPILLER = arg("--spiller", "");
  const BAND = arg("--band", "holdout");
  const ETTER = arg("--etter", MENNESKE_FRA);
  const UT = arg("--ut", "analyse/profil/tro.jsonl");
  const RABATT = Number(arg("--rabatt", "0.5"));
  const TAK = tall(arg("--tak", "24"), 24, "--tak");
  const MAKS = argv.includes("--maks-kamper") ? tall(arg("--maks-kamper", ""), 0, "--maks-kamper") : Infinity;
  if (SPILLER !== "" && !gyldigId(SPILLER)) throw new Error("--spiller må være et pseudonym (1–32 hex)");

  const nett = MlbTronett.fraBytes(new Uint8Array(readFileSync(NETTFIL)));
  if (!nett.brukerHukommelse) throw new Error(`${NETTFIL} leser ikke hukommelsen — da kan ingen profil måles`);
  const budgivere: Budgiver[] = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));

  const logg = lesMenneskelogg(DATA);
  /** Kampene med start, minst én runde fra `--etter`, sortert på SLUTTID. */
  const alle = [...logg]
    .filter(([, k]) => k.start !== null && k.runder.length > 0)
    .map(([id, k]) => ({
      id,
      k,
      spiller: k.start!.spiller,
      slutt: k.runder.map((r) => r.tid).sort().at(-1)!,
    }))
    .filter((x) => x.slutt >= ETTER)
    .sort((a, b) => (a.slutt < b.slutt ? -1 : a.slutt > b.slutt ? 1 : a.id < b.id ? -1 : 1));

  /** Uten `--spiller`: den med flest kamper. Bare pseudonymet skrives. */
  const tell = new Map<string, number>();
  for (const x of alle) tell.set(x.spiller, (tell.get(x.spiller) ?? 0) + 1);
  const valgt = SPILLER !== "" ? SPILLER : [...tell].sort((a, b) => b[1] - a[1])[0]![0];
  const mine = alle.filter((x) => x.spiller === valgt);
  if (mine.length < 2) throw new Error(`spilleren har ${mine.length} kamper – for få til «tidligere kamper»`);

  /** FELLENS spiller: den andre med flest kamper. Profilen hans er like full, og feil. */
  const annen = [...tell].filter(([s]) => s !== valgt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (annen === null) throw new Error("fant ingen ANNEN spiller – fella kan ikke bygges");
  const andres = alle.filter((x) => x.spiller === annen);

  console.log(
    `spiller ${valgt.slice(0, 12)}: ${mine.length} kamper (${mine.filter((x) => menneskeBånd(x.id) === BAND).length} i «${BAND}»); ` +
      `felle ${annen.slice(0, 12)}: ${andres.length} kamper; nett ${NETTFIL} (${nett.innBredde} inn); rabatt ${RABATT}, tak ${TAK}`,
  );

  mkdirSync(dirname(UT), { recursive: true });
  writeFileSync(UT, "");
  const teller = nyTeller();

  /** Kampens egen bok, spilt gjennom fra start. Brukes både til profil og til måling. */
  const bokFor = (k: (typeof mine)[number]["k"]): Hukommelse => {
    let bok = new Hukommelse();
    for (const steg of kamprunder(k, budgivere)) {
      if (steg.nyBok) bok = new Hukommelse();
      if (steg.runde === null) continue;
      for (const s of steg.runde.tilstander) bok.observer(somRundeslutt(s));
    }
    return bok;
  };

  /** Profilen til fella, av ALLE den andre spillerens kamper. Full blokk, feil person. */
  let fremmedProfil = tomProfil(annen);
  for (const x of andres) {
    fremmedProfil = slåSammen(fremmedProfil, bidragFraBok(bokFor(x.k), MENNESKE, annen, x.slutt));
  }

  let profil = tomProfil(valgt);
  let buffer: string[] = [];
  let rader = 0;
  let målte = 0;
  const t0 = Date.now();

  for (let i = 0; i < mine.length; i++) {
    const kamp = mine[i]!;
    const måles = menneskeBånd(kamp.id) === BAND && målte < MAKS;

    if (måles) {
      målte++;
      const profilrunder = profil.runder;
      const såddProfil = profilrunder > 0 ? startbok(profil, { rabatt: RABATT, tak: TAK }) : null;
      const såddFremmed = startbok(fremmedProfil, { rabatt: RABATT, tak: TAK });

      let bokP = new Hukommelse();
      let bokT = new Hukommelse();
      let bokF = new Hukommelse();
      if (såddProfil !== null) bokP.settBok(MENNESKE, startbok(profil, { rabatt: RABATT, tak: TAK }));
      bokF.settBok(MENNESKE, såddFremmed);

      for (const steg of kamprunder(kamp.k, budgivere, teller)) {
        if (steg.nyBok) {
          bokP = new Hukommelse();
          bokT = new Hukommelse();
          bokF = new Hukommelse();
          if (såddProfil !== null) bokP.settBok(MENNESKE, startbok(profil, { rabatt: RABATT, tak: TAK }));
          bokF.settBok(MENNESKE, startbok(fremmedProfil, { rabatt: RABATT, tak: TAK }));
        }
        if (steg.runde === null) continue;
        const iBoka = bokT.runder();

        for (const s0 of steg.runde.tilstander) {
          const s = somRundeslutt(s0);
          bokP.observer(s);
          bokT.observer(s);
          bokF.observer(s);
          if (s.fase !== "SPILL" || s.iTur === null) continue;
          const sete = s.iTur;
          // Bare BOTENES syn på MENNESKETS kort: det er der en profil om mennesket kan hjelpe.
          if (sete === MENNESKE) continue;
          if (lovligeKort(s, sete).length < 2) continue;
          const erMenneske = (p: number): boolean => p === MENNESKE;
          const m = gulvene(s, sete, erMenneske);
          if (m.kort === 0) continue;

          const visning = spillerVisning(s, sete);
          const ant = s.giving.antallStikk;
          const mål = s.regler.målPoeng;
          const tap = (bok: Hukommelse | null): number =>
            nettTap(
              nett.fordeling(nett.trekkFor(visning, ant, mål, bok === null ? null : bok.vektor(sete, 4))),
              s,
              sete,
              m.kort,
              erMenneske,
            ).tap;

          const rad: Profiltrorad = {
            spill: kamp.id,
            kampnr: i,
            runde: steg.rundeNr,
            bok: iBoka,
            profilrunder,
            sete,
            kort: m.kort,
            gulv: m.gulv,
            profil: tap(bokP),
            tom: tap(bokT),
            null: tap(null),
            fremmed: tap(bokF),
          };
          buffer.push(JSON.stringify(rad) + "\n");
          rader++;
          if (buffer.length >= 500) {
            appendFileSync(UT, buffer.join(""));
            buffer = [];
          }
        }
      }
      if (buffer.length > 0) {
        appendFileSync(UT, buffer.join(""));
        buffer = [];
      }
    }

    // ETTERPÅ: kampen legges til profilen, aldri før den er målt.
    profil = slåSammen(profil, bidragFraBok(bokFor(kamp.k), MENNESKE, valgt, kamp.slutt));
    process.stdout.write(
      `\r  ${i + 1}/${mine.length} kamper, ${målte} målt, ${rader} rader, profil ${profil.runder} runder, ` +
        `${((Date.now() - t0) / 1000).toFixed(0)} s   `,
    );
  }
  if (buffer.length > 0) appendFileSync(UT, buffer.join(""));
  console.log(`\nFerdig: ${målte} målte kamper, ${rader} rader, ${tellerTekst(teller)} → ${UT}`);
}
