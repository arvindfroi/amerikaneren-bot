/**
 * ER LIGAEN TOM FOR UTFORDRING? Kandidaten mot HVER ENKELT i befolkningen.
 *
 *   node examples/mlb-motalle.ts --kandidat e1-modell/mlb-e10.bin \
 *     --epoker e1-modell/mlb-beste-e1.bin,e1-modell/mlb-beste-e5.bin \
 *     --kamper 150 --kjerner 20 --ut analyse/mlb-motalle
 *
 * ====================== HVORFOR DENNE FILA FINNES ========================
 *
 * Porten spør «slår epoke 10 epoke 9?», og LIGA-H2H spør «slår den bordet?».
 * Ingen av dem kan skille to tilstander som ser helt like ut innenfra:
 *
 *   METTET      nettet slår ALLE i befolkningen med god margin. Da finnes det
 *               ikke mer signal å hente, og flere epoker er bortkastet tid —
 *               svaret er sterkere motstandere.
 *   SYKLISK     nettet slår noen og taper mot andre. Da er befolkningen ikke
 *               tom; den er intransitiv, og porten måler stein-saks-papir.
 *
 * Forskjellen er hele forskjellen på hva som skal gjøres videre, og den kan
 * bare ses ved å bryte bordet opp i ENKELTMOTSTANDERE.
 *
 * ====================== BORDET, OG KONTROLLARMEN ========================
 *
 * Motstanderen sitter i TRE seter, kandidaten i det fjerde. Tre armer spiller
 * de SAMME givene:
 *
 *   kandidat    nettet som prøves
 *   referanse   motstanderen selv i kandidatsetet — nullpunktet
 *   kontroll    motstanderen EN GANG TIL, bygget uavhengig
 *
 * `kontroll − referanse` MÅ være eksakt 0 på hver eneste giv. Er den ikke det,
 * er det seteskjevhet eller ikke-determinisme i røret, og da kan ingen av
 * tallene på raden leses. Kontrollen er en EGEN konstruksjon og ikke den samme
 * peker om igjen — ellers ville den passert selv om lasteren var ødelagt.
 * Samme regel som `examples/mlb-port.ts`, og av samme grunn.
 *
 * ====================== ARGMAKS, TO BÅND, TEGNTEST ======================
 *
 * `temperatur = 0` i alle seter (AVGJØRELSE 4), to disjunkte frøbånd, og
 * tegntesten ved siden av gjennomsnittet. Et snitt uten tegnet bak seg er
 * båret av noen få kamper.
 */

import { fork } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";

import { Sandkassenett } from "../src/mlb/nett.ts";
import { spillKamp, type Beslutter, type NettLik, type Sete } from "../src/mlb/selvspill.ts";
import { lagVane, VANER_TEST, VANER_TRENING } from "../src/mlb/liga.ts";

// ---------------------------------------------------------------------------

let kandidatSti: string | null = null;
let epokeStier: string[] = [];
let kamperPerBånd = 150;
let bånd = [2_100_000_000, 2_150_000_000];
let kjerner = Math.max(1, cpus().length - 1);
let skardI = -1;
let skardN = 1;
let ut = "analyse/mlb-motalle";
let målPoeng = 30;
let maksRunder = 60;
let tilfeldigFrø = 7_310_001;

const tall = (v: string | undefined, navn: string): number => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${navn} trenger et tall, fikk «${String(v)}»`);
  return x;
};

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--kandidat") kandidatSti = v ?? null;
  else if (a === "--epoker") epokeStier = (v ?? "").split(",").filter((x) => x !== "");
  else if (a === "--kamper") kamperPerBånd = tall(v, "--kamper");
  else if (a === "--band") bånd = (v ?? "").split(",").map((x) => tall(x, "--band"));
  else if (a === "--kjerner") kjerner = tall(v, "--kjerner");
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--maalpoeng") målPoeng = tall(v, "--maalpoeng");
  else if (a === "--maksrunder") maksRunder = tall(v, "--maksrunder");
  else if (a === "--skard") {
    const d = (v ?? "0/1").split("/");
    skardI = tall(d[0], "--skard i");
    skardN = tall(d[1], "--skard n");
  }
}

if (kandidatSti === null) throw new Error("--kandidat er påkrevd");

// ---------------------------------------------------------------------------
// Befolkningen, som en liste med NAVN og en BYGGER
// ---------------------------------------------------------------------------

/**
 * En motstander bygges av en FUNKSJON, ikke av et delt objekt. Referansearmen
 * og kontrollarmen kaller den hver sin gang, og at de to da gir bit-likt spill
 * er nettopp det kontrollen skal bevise.
 */
interface Motstander {
  readonly navn: string;
  readonly bygg: () => { nett: NettLik | null; egen?: Beslutter };
}

const befolkning: Motstander[] = [
  ...VANER_TRENING.map((v) => ({
    navn: `tren.${v.navn}`,
    bygg: () => ({ nett: null, egen: lagVane(v.spek) }),
  })),
  ...VANER_TEST.map((v) => ({
    navn: `test.${v.navn}`,
    bygg: () => ({ nett: null, egen: lagVane(v.spek) }),
  })),
  {
    navn: "epoke0.tilfeldig",
    bygg: () => ({ nett: Sandkassenett.tilfeldig(tilfeldigFrø) }),
  },
  ...epokeStier.map((s) => ({
    navn: s.replace(/^.*[\\/]/, "").replace(/\.bin$/, ""),
    bygg: () => ({ nett: Sandkassenett.fraFil(s) }),
  })),
];

// ---------------------------------------------------------------------------

const råfil = (i: number): string => `${ut}-raa-${i}.jsonl`;
const tabellfil = `${ut}.tsv`;

function bord(
  arm: { nett: NettLik | null; egen?: Beslutter },
  mot: Motstander,
  kandidatsete: number,
): Sete[] {
  const ut: Sete[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === kandidatsete) {
      ut.push({ navn: "arm", nett: arm.nett, temperatur: 0, egen: arm.egen, samle: false });
    } else {
      const m = mot.bygg();
      ut.push({ navn: mot.navn, nett: m.nett, temperatur: 0, egen: m.egen, samle: false });
    }
  }
  return ut;
}

function spill(
  seter: Sete[],
  frø: number,
  sete: number,
): { poeng: number; seier: number; avbrutt: number } {
  const e = spillKamp({ frø, seter, målPoeng, maksRunder, samleTrekk: false });
  return {
    poeng: e.fasit.sluttpoeng[sete] ?? 0,
    seier: e.fasit.vinner === sete ? 1 : 0,
    avbrutt: e.fasit.avbrutt ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Ett skard
// ---------------------------------------------------------------------------

/**
 * Kandidaten kan være et NETT eller en VANE.
 *
 * `vane:<navn>` finnes for én bestemt måling: er `VANER_TRENING` sterkere enn
 * `VANER_TEST`? Splitten er begrunnet i K6 (disjunkte sett), men den er også
 * splitten mellom «spiller høyt» og «spiller lavt» — og da er den kanskje
 * samtidig en styrkesplitt, uten at noen har målt det. Uten denne grenen måtte
 * påstanden hvile på at ETT nett scorer ulikt mot de to settene, og det er en
 * slutning, ikke et tall.
 */
function byggKandidat(): { nett: NettLik | null; egen?: Beslutter } {
  const s = kandidatSti!;
  if (s.startsWith("vane:")) {
    const navn = s.slice(5);
    const v = [...VANER_TRENING, ...VANER_TEST].find((x) => x.navn === navn);
    if (v === undefined) {
      const alle = [...VANER_TRENING, ...VANER_TEST].map((x) => x.navn).join(", ");
      throw new Error(`Ukjent vane «${navn}». Finnes: ${alle}`);
    }
    return { nett: null, egen: lagVane(v.spek) };
  }
  return { nett: Sandkassenett.fraFil(s) };
}

function kjørSkard(i: number, n: number): void {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(råfil(i), "");
  const kandidatArm = byggKandidat();

  for (const mot of befolkning) {
    for (let b = 0; b < bånd.length; b++) {
      for (let k = 0; k < kamperPerBånd; k++) {
        if ((b * kamperPerBånd + k) % n !== i) continue;
        const frø = bånd[b]! + k * 7717;
        const sete = k % 4;
        const a = spill(bord(kandidatArm, mot, sete), frø, sete);
        const r = spill(bord(mot.bygg(), mot, sete), frø, sete);
        const c = spill(bord(mot.bygg(), mot, sete), frø, sete);
        appendFileSync(
          råfil(i),
          JSON.stringify({
            mot: mot.navn,
            bånd: b,
            giv: frø,
            kandidat: a.poeng,
            referanse: r.poeng,
            kontroll: c.poeng,
            kSeier: a.seier,
            rSeier: r.seier,
            kAvbrutt: a.avbrutt,
          }) + "\n",
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dommen
// ---------------------------------------------------------------------------

interface Rad {
  mot: string;
  bånd: number;
  kandidat: number;
  referanse: number;
  kontroll: number;
  kSeier: number;
  rSeier: number;
  kAvbrutt: number;
}

function døm(d: readonly number[]): { n: number; snitt: number; se: number; z: number; pos: number; neg: number } {
  const n = d.length;
  if (n === 0) return { n: 0, snitt: NaN, se: NaN, z: NaN, pos: 0, neg: 0 };
  const snitt = d.reduce((a, b) => a + b, 0) / n;
  const varians = n > 1 ? d.reduce((a, x) => a + (x - snitt) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(varians / n);
  return {
    n,
    snitt,
    se,
    z: se > 0 ? snitt / se : NaN,
    pos: d.filter((x) => x > 0).length,
    neg: d.filter((x) => x < 0).length,
  };
}

if (skardI >= 0) {
  kjørSkard(skardI, skardN);
} else {
  mkdirSync(dirname(ut), { recursive: true });
  // HODET FØRST, RADEN LØPENDE. En flertimers måling som bare skriver til
  // slutt er en måling som kan gå tapt.
  if (!existsSync(tabellfil)) {
    writeFileSync(
      tabellfil,
      "kandidat\tmotstander\tn\tsnitt\tse\tz\tpos\tneg\tseier%\tavbrutt%\tbaand0\tbaand1\tkontroll\n",
      "utf8",
    );
  }
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: kjerner }, (_, i) => {
      return new Promise<void>((ferdig, feil) => {
        const barn = fork(process.argv[1]!, [...process.argv.slice(2), "--skard", `${i}/${kjerner}`]);
        barn.on("exit", (kode) =>
          kode === 0 ? ferdig() : feil(new Error(`skard ${i} avsluttet med ${kode}`)),
        );
      });
    }),
  );

  const alle: Rad[] = [];
  for (let i = 0; i < kjerner; i++) {
    for (const l of readFileSync(råfil(i), "utf8").split("\n")) {
      if (l.trim() !== "") alle.push(JSON.parse(l) as Rad);
    }
  }
  const navn = kandidatSti.replace(/^.*[\\/]/, "").replace(/\.bin$/, "");

  for (const mot of befolkning) {
    const rader = alle.filter((r) => r.mot === mot.navn);
    const d = rader.map((r) => r.kandidat - r.referanse);
    const dk = rader.map((r) => r.kontroll - r.referanse);
    const dom = døm(d);
    const kdom = døm(dk);
    const bandSnitt = (b: number): number => {
      const v = rader.filter((r) => r.bånd === b).map((r) => r.kandidat - r.referanse);
      return v.length === 0 ? NaN : v.reduce((a, x) => a + x, 0) / v.length;
    };
    const kontrollTekst =
      kdom.n === 0 || Math.abs(kdom.snitt) < 1e-9 ? "0.0000 OK" : `${kdom.snitt.toFixed(4)} SKJEV`;
    const seier = (rader.reduce((a, r) => a + r.kSeier, 0) / Math.max(rader.length, 1)) * 100;
    const avbrutt = (rader.reduce((a, r) => a + r.kAvbrutt, 0) / Math.max(rader.length, 1)) * 100;
    const linje = [
      navn,
      mot.navn,
      dom.n,
      dom.snitt.toFixed(4),
      dom.se.toFixed(4),
      dom.z.toFixed(2),
      dom.pos,
      dom.neg,
      seier.toFixed(1),
      avbrutt.toFixed(1),
      bandSnitt(0).toFixed(3),
      bandSnitt(1).toFixed(3),
      kontrollTekst,
    ].join("\t");
    appendFileSync(tabellfil, linje + "\n", "utf8");
    process.stderr.write(linje + "\n");
  }
  process.stderr.write(`\nFerdig paa ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min -> ${tabellfil}\n`);
}
