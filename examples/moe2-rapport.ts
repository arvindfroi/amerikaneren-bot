/**
 * FØRSTE MÅLING AV MoE2-EKSPERTENE – med gulv og tak fra samme utvalg.
 *
 *   node examples/moe2-rapport.ts --spill-mappe e1-data3 --epoker 5
 *
 * Rapporten er bygget slik at ingen av tallene kan komme fra hvert sitt sett:
 * hver linje er én `Maaling`, og `mål()` regner kandidat, gulv og tak i samme
 * kall over de samme stillingene. Kandidaten som rapporteres er det genomet
 * som er BEST PÅ UTVIKLINGSSETTET – altså valgt uten å se holdout – og så
 * målt på holdout. Det er den eneste rekkefølgen som ikke gir et optimistisk
 * tall.
 *
 * Alle tre delene skrives ut for hver ekspert. Sprik mellom trening/utvikling
 * og holdout ER informasjonen: uten den vet vi ikke om læringen generaliserer
 * eller bare pugger.
 */

import { appendFileSync } from "node:fs";

import {
  beskriv,
  framdrift,
  mål,
  overGulvet,
  slaarTaket,
  type Maaling,
} from "../src/moe2/maaling.ts";
import {
  budEkspert,
  lagBudstillinger,
} from "../src/moe2/eksperter/bud.ts";
import {
  anger,
  delUtvalg,
  gulvFor,
  målEkspert,
  Populasjon,
  type Ekspert,
  type Råstilling,
  type Utvalg,
} from "../src/moe2/eksperter/felles.ts";
import { lagTrumfstillinger, trumfEkspert } from "../src/moe2/eksperter/trumf.ts";
import { lagVrakstillinger, vrakEkspert } from "../src/moe2/eksperter/vrak.ts";
import { lesSpillstillinger, SPILLEKSPERTER } from "../src/moe2/eksperter/spill.ts";

interface Argumenter {
  giverBud: number;
  giverVrak: number;
  giverTrumf: number;
  spillMappe: string;
  spillPerRolle: number;
  spillSteg: number;
  dybde: number;
  pop: number;
  epoker: number;
  rate: number;
  frø: number;
  logg: string | null;
}

const arg: Argumenter = {
  giverBud: 120,
  giverVrak: 30,
  giverTrumf: 120,
  spillMappe: "e1-data3",
  spillPerRolle: 1500,
  spillSteg: 11,
  dybde: 6,
  pop: 16,
  epoker: 5,
  rate: 0.05,
  frø: 0x4d6f4532,
  logg: null,
};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const tall = (): number => Number(process.argv[++i]);
  if (a === "--giver-bud") arg.giverBud = tall();
  else if (a === "--giver-vrak") arg.giverVrak = tall();
  else if (a === "--giver-trumf") arg.giverTrumf = tall();
  else if (a === "--spill-mappe") arg.spillMappe = process.argv[++i] ?? arg.spillMappe;
  else if (a === "--spill-per-rolle") arg.spillPerRolle = tall();
  else if (a === "--spill-steg") arg.spillSteg = tall();
  else if (a === "--dybde") arg.dybde = tall();
  else if (a === "--pop") arg.pop = tall();
  else if (a === "--epoker") arg.epoker = tall();
  else if (a === "--rate") arg.rate = tall();
  else if (a === "--frø") arg.frø = tall();
  else if (a === "--logg") arg.logg = process.argv[++i] ?? null;
}

/**
 * VARIG LOGG. En flertimersmåling som bare skriver til stdout er tapt om
 * røret ryker; derfor skriver prosessen selv til fil når `--logg` er satt.
 */
const linjer: string[] = [];
function skriv(s: string): void {
  console.log(s);
  linjer.push(s);
  if (arg.logg !== null) appendFileSync(arg.logg, s + "\n");
}

function kjør<H>(
  ekspert: Ekspert<H>,
  alle: readonly Råstilling<H>[],
): { fersk: Maaling; lært: Maaling; utvalg: Utvalg<H> } | null {
  const utvalg: Utvalg<H> = delUtvalg(ekspert.navn, alle);
  skriv(
    `\n=== ${ekspert.navn} ===\n` +
      `  sensorer ${ekspert.sensorer.length} av 318, utganger ${ekspert.antallUt}\n` +
      `  stillinger: ${utvalg.trening.length} trening / ${utvalg.utvikling.length} utvikling / ` +
      `${utvalg.holdout.length} holdout`,
  );
  if (utvalg.holdout.length === 0 || utvalg.utvikling.length === 0) {
    skriv("  INGEN MÅLING: for få stillinger til en ærlig tredeling.");
    return null;
  }
  const pop = new Populasjon(ekspert, { antall: arg.pop, frø: arg.frø });

  const beste = (): (typeof pop.genomer)[number] => pop.rangér(utvalg.utvikling)[0]!.genom;
  const fersk = målEkspert(ekspert, beste(), utvalg, "holdout", `${ekspert.navn} fersk`);
  skriv("  " + beskriv(fersk));

  for (let e = 0; e < arg.epoker; e++) pop.lærEpoke(utvalg.trening, arg.rate);
  const valgt = beste();
  const lært = målEkspert(ekspert, valgt, utvalg, "holdout", `${ekspert.navn} lært`);
  skriv("  " + beskriv(lært));
  skriv("  " + beskriv(målEkspert(ekspert, valgt, utvalg, "trening", `${ekspert.navn} tren`)));
  return { fersk, lært, utvalg };
}

/**
 * En TRIVIELL strategi, målt med nøyaktig samme kontrakt.
 *
 * Grunnen til at denne linjen finnes: gulvet er «uniformt lovlig valg», og
 * det er et svakt gulv når handlingsrommet er en ORDNET skala. For budet er
 * handlingene 4…12 stikk, og et konstant svar midt på skalaen slår et
 * uniformt trekk med god margin uten å kunne noe som helst. Uten denne linjen
 * ville et nett som bare sier «omtrent ni» sett ut som framgang.
 */
function trivielt<H>(
  navn: string,
  utvalg: Utvalg<H>,
  velgFast: (s: Råstilling<H>) => number,
): Maaling {
  return mål({
    navn,
    stillinger: utvalg.holdout,
    holdout: true,
    retning: "lavereErBedre",
    kandidat: (s) => anger(s, velgFast(s)),
    gulv: gulvFor,
    tak: (s) => anger(s, s.takValg),
  });
}

const start = Date.now();
skriv(`MoE2-eksperter, første måling. ${new Date().toISOString()}`);
skriv(
  `pop ${arg.pop}, epoker ${arg.epoker}, rate ${arg.rate}, DD-dybde ${arg.dybde}, frø ${arg.frø}`,
);

const oppsummering: { navn: string; m: Maaling }[] = [];

{
  const s = lagBudstillinger({ giver: arg.giverBud });
  const r = kjør(budEkspert, s);
  if (r) {
    oppsummering.push({ navn: "bud", m: r.lært });
    // Konstant «omtrent ni stikk»: SD-orakelet byr 8,78 i snitt. Denne linjen
    // sier hvor mye av ekspertens tall som bare er kjennskap til gjennomsnittet.
    skriv(
      "  " +
        beskriv(
          trivielt("bud konstant-9", r.utvalg, (st) => {
            let beste = 0;
            for (let i = 1; i < st.handlinger.length; i++) {
              if (Math.abs(st.handlinger[i]! - 9) < Math.abs(st.handlinger[beste]! - 9)) beste = i;
            }
            return beste;
          }),
        ),
    );
  }
}
{
  const s = lagVrakstillinger({ giver: arg.giverVrak, dybde: arg.dybde });
  const r = kjør(vrakEkspert, s);
  if (r) oppsummering.push({ navn: "vrak", m: r.lært });
}
{
  const s = lagTrumfstillinger({ giver: arg.giverTrumf, dybde: arg.dybde });
  const r = kjør(trumfEkspert, s);
  if (r) oppsummering.push({ navn: "trumf", m: r.lært });
}
{
  const per = lesSpillstillinger({
    mappe: arg.spillMappe,
    perRolle: arg.spillPerRolle,
    steg: arg.spillSteg,
  });
  for (const rolle of ["fører", "forsvar", "makker"] as const) {
    const ekspert = SPILLEKSPERTER[rolle];
    if (per[rolle].length === 0) {
      skriv(`\n=== ${ekspert.navn} ===\n  ingen stillinger i ${arg.spillMappe} (mangler NEAT-vektor?)`);
      continue;
    }
    const r = kjør(ekspert, per[rolle]);
    if (r) oppsummering.push({ navn: ekspert.navn, m: r.lært });
  }
}

skriv("\n=== OPPSUMMERING (holdout, etter læring) ===");
skriv(
  "ekspert".padEnd(16) +
    "verdi".padStart(10) +
    "gulv".padStart(10) +
    "tak".padStart(10) +
    "framdrift".padStart(12) +
    "  dom",
);
for (const o of oppsummering) {
  // TAKET KAN LIGGE UNDER GULVET. `framdrift` deler på (gulv − tak), og er
  // taket dårligere enn tilfeldig valg blir nevneren negativ og prosenten
  // meningsløs (målt: budeksperten, der NevroHjerne underbyr så systematisk
  // at et uniformt lovlig bud treffer SD-orakelet bedre). Da skrives det, i
  // stedet for et tall som ser ut som framgang.
  const taketHolder =
    o.m.retning === "lavereErBedre" ? o.m.tak < o.m.gulv : o.m.tak > o.m.gulv;
  // ET SPENN NÆR NULL GJØR PROSENTEN TIL STØY. Er referansen praktisk talt
  // like god som tilfeldig valg, deler `framdrift` på nesten ingenting, og
  // en forskjell på tredje desimal blir til «104 %». Da er ikke tallet galt –
  // det er referansen som ikke duger som tak på denne oppgaven.
  const spenn = Math.abs(o.m.gulv - o.m.tak);
  const tynt = spenn < 0.05 * Math.abs(o.m.gulv);
  const dom = !taketHolder
    ? "TAKET ER UNDER GULVET – referansen er verre enn tilfeldig her"
    : tynt
      ? `taket er praktisk talt gulvet (spenn ${spenn.toFixed(4)}) – prosenten er støy`
      : !overGulvet(o.m)
        ? "UNDER GULVET"
        : slaarTaket(o.m)
          ? "over taket"
          : "mellom gulv og tak";
  skriv(
    o.navn.padEnd(16) +
      o.m.verdi.toFixed(4).padStart(10) +
      o.m.gulv.toFixed(4).padStart(10) +
      o.m.tak.toFixed(4).padStart(10) +
      (taketHolder && !tynt ? `${(100 * framdrift(o.m)).toFixed(1)} %` : "–").padStart(12) +
      `  ${dom}`,
  );
}
skriv(`\nTid: ${((Date.now() - start) / 1000).toFixed(0)} s`);
