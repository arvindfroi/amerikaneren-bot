/**
 * VANEROMMET, MÅLT LANGS TO AKSER SAMTIDIG — og det er hele poenget.
 *
 *   node examples/mlb-vanesplitt.ts --kamper 60 --kjerner 20 \
 *     --ut analyse/mlb-vanesplitt
 *
 * ====================== HVORFOR DENNE FILA FINNES ========================
 *
 * §124 fant at splitten mellom `VANER_TRENING` og `VANER_TEST` samtidig var en
 * STYRKESPLITT: treningsvanene spiller HØYT og vinner stikk, testvanene spiller
 * LAVT og kaster dem bort. Nettet tapte 7,5 / 7,2 / 5,4 poeng mot tre av fire
 * treningsvaner og vant 0,5 % av kampene mot to av dem — samtidig som det
 * knuste alle fire testvanene med +15 til +29.
 *
 * Porten (`examples/mlb-port.ts`) og STYRKE i epoketabellen dømmer begge på
 * `VANER_TEST`. Begge målte altså mot den halvparten nettet allerede hadde
 * mettet, og «seier 43 %» var overlegenhet over nettopp det.
 *
 * Splitten må derfor gjøres om. Men den kan ikke gjøres om på magefølelse:
 * disjunktheten K6 krever er et MÅLT krav (`test/mlb-liga.test.ts` krever at
 * det nærmeste kryssparet skiller seg i ≥ 25 % av valgene), og styrkebalansen
 * er et annet. En omfordeling som fikser den ene og bryter den andre er ikke en
 * forbedring, den er en bytte av feil.
 *
 * Denne fila måler BEGGE aksene for alle åtte vanene, slik at splitten kan
 * VELGES på tall i stedet for på hvilken rekkefølge de står i kildekoden.
 *
 * ====================== AKSE 1: ATFERDSAVSTAND ===========================
 *
 * `atferdsavstand` fra `liga.ts` teller hvor ofte to vaner velger ULIKT på de
 * SAMME stillingene. Stillingene samles ved å SPILLE — en beslutter som
 * skriver ned punktet før den svarer — så utvalget er det ligaen faktisk ser.
 *
 * Og den viktigste enkeltinnsikten måtte måles fram: **`høyest` og
 * `fargeordenHøy` er nesten identiske når man FØLGER FARGE.** Følger man farge,
 * er alle lovlige kort i samme farge, og da rangerer begge på ren verdi. De
 * skiller seg bare når man er renons og kan velge farge fritt. Det samme
 * gjelder `lavest` mot `fargeordenLav`. Dagens split har hvert av de to parene
 * INNENFOR samme sett, så avstanden mellom dem er aldri prøvd — en ny split som
 * river paret fra hverandre ville brutt K6 uten at noen så det.
 *
 * ====================== AKSE 2: INNBYRDES STYRKE =========================
 *
 * Styrken måles vane mot vane og ikke mot nettet vårt. Måler vi mot nettet,
 * velger vi splitten etter hva DENNE epoken tilfeldigvis synes er vanskelig, og
 * da er målestokken igjen tilpasset det den skal måle.
 *
 * Vane `a` i ett sete, TRE kopier av `b` i de andre, parret på givene:
 *
 *   arm         `a` i kandidatsetet
 *   referanse   `b` i kandidatsetet — nullpunktet
 *   kontroll    `b` EN GANG TIL, bygget uavhengig
 *
 * `kontroll − referanse` MÅ være 0,0000 på hver eneste giv. Er den ikke det,
 * er det seteskjevhet, og da kan ingen av tallene leses. Samme regel som
 * `mlb-port.ts` og `mlb-motalle.ts`, av samme grunn.
 *
 * Vanens STYRKE er snittet av kanten mot de sju andre. Det er et
 * motstanderuavhengig tall, og det er det splitten skal balanseres på.
 */

import { fork } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";

import {
  atferdsavstand,
  lagVane,
  VANER_TEST,
  VANER_TRENING,
  type Vane,
} from "../src/mlb/liga.ts";
import {
  spillKamp,
  type Beslutningspunkt,
  type Beslutter,
  type Sete,
} from "../src/mlb/selvspill.ts";

// ---------------------------------------------------------------------------

const ALLE: readonly Vane[] = [...VANER_TRENING, ...VANER_TEST];

let kamperPerBånd = 60;
let bånd = [2_400_000_000, 2_450_000_000];
let kjerner = Math.max(1, cpus().length - 1);
let skardI = -1;
let skardN = 1;
let ut = "analyse/mlb-vanesplitt";
let målPoeng = 30;
let maksRunder = 60;
let punktGiver = 8;
let punktTak = 2000;

const tall = (v: string | undefined, navn: string): number => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${navn} trenger et tall, fikk «${String(v)}»`);
  return x;
};

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--kamper") kamperPerBånd = tall(v, "--kamper");
  else if (a === "--band") bånd = (v ?? "").split(",").map((x) => tall(x, "--band"));
  else if (a === "--kjerner") kjerner = tall(v, "--kjerner");
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--maalpoeng") målPoeng = tall(v, "--maalpoeng");
  else if (a === "--maksrunder") maksRunder = tall(v, "--maksrunder");
  else if (a === "--punktgiver") punktGiver = tall(v, "--punktgiver");
  else if (a === "--punkttak") punktTak = tall(v, "--punkttak");
  else if (a === "--skard") {
    const d = (v ?? "0/1").split("/");
    skardI = tall(d[0], "--skard i");
    skardN = tall(d[1], "--skard n");
  }
}

const råfil = (i: number): string => `${ut}-raa-${i}.jsonl`;
const styrkefil = `${ut}-styrke.tsv`;
const avstandsfil = `${ut}-avstand.tsv`;

// ---------------------------------------------------------------------------
// AKSE 1 — stillingene, og avstanden mellom vanene på dem
// ---------------------------------------------------------------------------

/**
 * Stillingene samles ved å SPILLE, med en beslutter som skriver ned punktet før
 * den svarer. Da er utvalget nøyaktig de stillingene vanene selv fører spillet
 * inn i — en syntetisk stilling ville målt vanene et sted de aldri kommer.
 */
function samlePunkter(): Beslutningspunkt[] {
  const punkter: Beslutningspunkt[] = [];
  const opptaker = (indre: Beslutter): Beslutter => {
    return (p) => {
      if (punkter.length < punktTak) punkter.push(p);
      return indre(p);
    };
  };
  for (let g = 0; g < punktGiver && punkter.length < punktTak; g++) {
    // Fire ULIKE vaner ved bordet, rullert, så stillingene ikke er formet av
    // én enkelt stil. Et bord med fire like vaner gir et smalt utvalg.
    const seter: Sete[] = Array.from({ length: 4 }, (_, i) => {
      const v = ALLE[(g + i) % ALLE.length]!;
      return {
        navn: v.navn,
        nett: null,
        temperatur: 0,
        egen: opptaker(lagVane(v.spek)),
        samle: false,
      };
    });
    spillKamp({ frø: 8_200_000 + g * 5171, seter, målPoeng, maksRunder, samleTrekk: false });
  }
  return punkter;
}

// ---------------------------------------------------------------------------
// AKSE 2 — ett skard av styrkematrisen
// ---------------------------------------------------------------------------

function bord(arm: Vane, mot: Vane, kandidatsete: number): Sete[] {
  const seter: Sete[] = [];
  for (let i = 0; i < 4; i++) {
    // MERK: hver motstander bygges med sitt EGET `lagVane`-kall. Referanse- og
    // kontrollarmen skal gå gjennom nøyaktig samme rør, og at de to da gir
    // bit-likt spill er det kontrollen beviser.
    const v = i === kandidatsete ? arm : mot;
    seter.push({
      navn: i === kandidatsete ? "arm" : mot.navn,
      nett: null,
      temperatur: 0,
      egen: lagVane(v.spek),
      samle: false,
    });
  }
  return seter;
}

const poeng = (seter: Sete[], frø: number, sete: number): number =>
  spillKamp({ frø, seter, målPoeng, maksRunder, samleTrekk: false }).fasit.sluttpoeng[sete] ?? 0;

function kjørSkard(i: number, n: number): void {
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(råfil(i), "");
  let teller = 0;
  for (const a of ALLE) {
    for (const b of ALLE) {
      if (a.navn === b.navn) continue;
      for (let bd = 0; bd < bånd.length; bd++) {
        for (let k = 0; k < kamperPerBånd; k++) {
          if (teller++ % n !== i) continue;
          const frø = bånd[bd]! + k * 7717;
          const sete = k % 4;
          const armPoeng = poeng(bord(a, b, sete), frø, sete);
          const refPoeng = poeng(bord(b, b, sete), frø, sete);
          const ktrPoeng = poeng(bord(b, b, sete), frø, sete);
          appendFileSync(
            råfil(i),
            JSON.stringify({
              a: a.navn,
              b: b.navn,
              bånd: bd,
              giv: frø,
              arm: armPoeng,
              ref: refPoeng,
              ktr: ktrPoeng,
            }) + "\n",
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------

interface Rad {
  a: string;
  b: string;
  bånd: number;
  arm: number;
  ref: number;
  ktr: number;
}

const snitt = (x: readonly number[]): number =>
  x.length === 0 ? NaN : x.reduce((p, q) => p + q, 0) / x.length;

const se = (x: readonly number[]): number => {
  if (x.length < 2) return NaN;
  const m = snitt(x);
  return Math.sqrt(x.reduce((p, q) => p + (q - m) ** 2, 0) / (x.length - 1) / x.length);
};

if (skardI >= 0) {
  kjørSkard(skardI, skardN);
} else {
  mkdirSync(dirname(ut), { recursive: true });

  // ---- AKSE 1 først: den trenger ingen skard og er ferdig på sekunder ----
  const punkter = samlePunkter();
  writeFileSync(avstandsfil, `# ${punkter.length} stillinger\na\tb\tulike\tav\tandel\n`, "utf8");
  let nærmeste = { a: "", b: "", andel: 1 };
  for (let i = 0; i < ALLE.length; i++) {
    for (let j = i + 1; j < ALLE.length; j++) {
      const a = ALLE[i]!;
      const b = ALLE[j]!;
      const { ulike, av } = atferdsavstand(a.spek, b.spek, punkter);
      const andel = ulike / Math.max(av, 1);
      appendFileSync(
        avstandsfil,
        `${a.navn}\t${b.navn}\t${ulike}\t${av}\t${andel.toFixed(4)}\n`,
        "utf8",
      );
      if (andel < nærmeste.andel) nærmeste = { a: a.navn, b: b.navn, andel };
    }
  }
  process.stderr.write(
    `AVSTAND: ${punkter.length} stillinger, naermeste par ${nærmeste.a} / ${nærmeste.b} ` +
      `= ${(nærmeste.andel * 100).toFixed(1)} %  -> ${avstandsfil}\n`,
  );

  // ---- AKSE 2: styrkematrisen ------------------------------------------
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

  // FØRST NÅ leses resultatfilene (§49: aldri les en resultatfil før kjøringen
  // er ferdig — et halvskrevet snitt har lurt dette prosjektet før).
  const alle: Rad[] = [];
  for (let i = 0; i < kjerner; i++) {
    if (!existsSync(råfil(i))) continue;
    for (const l of readFileSync(råfil(i), "utf8").split("\n")) {
      if (l.trim() !== "") alle.push(JSON.parse(l) as Rad);
    }
  }

  writeFileSync(styrkefil, "a\tb\tn\tkant\tse\tz\tkontroll\n", "utf8");
  const kant = new Map<string, number[]>();
  let verstKontroll = 0;
  for (const a of ALLE) {
    for (const b of ALLE) {
      if (a.navn === b.navn) continue;
      const r = alle.filter((x) => x.a === a.navn && x.b === b.navn);
      const d = r.map((x) => x.arm - x.ref);
      const dk = r.map((x) => x.ktr - x.ref);
      const k = snitt(dk);
      verstKontroll = Math.max(verstKontroll, Math.abs(k));
      const m = snitt(d);
      const s = se(d);
      appendFileSync(
        styrkefil,
        `${a.navn}\t${b.navn}\t${d.length}\t${m.toFixed(4)}\t${s.toFixed(4)}\t` +
          `${(m / (s || NaN)).toFixed(2)}\t${Math.abs(k) < 1e-9 ? "0.0000 OK" : `${k.toFixed(4)} SKJEV`}\n`,
        "utf8",
      );
      kant.set(a.navn, [...(kant.get(a.navn) ?? []), m]);
    }
  }

  appendFileSync(styrkefil, "\n# STYRKE = snittet av kanten mot de sju andre\nvane\tstyrke\n", "utf8");
  const styrke = ALLE.map((v) => ({ navn: v.navn, s: snitt(kant.get(v.navn) ?? []) })).sort(
    (x, y) => y.s - x.s,
  );
  for (const s of styrke) {
    appendFileSync(styrkefil, `${s.navn}\t${s.s.toFixed(3)}\n`, "utf8");
    process.stderr.write(`  ${s.navn.padEnd(22)} ${s.s >= 0 ? "+" : ""}${s.s.toFixed(3)}\n`);
  }
  process.stderr.write(
    `\nSTYRKE ferdig paa ${((Date.now() - t0) / 60000).toFixed(1)} min, verste kontroll ` +
      `${verstKontroll.toFixed(6)} -> ${styrkefil}\n`,
  );
}
