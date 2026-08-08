/**
 * KOSTNADSSVEIP FOR ALPHA-MUENS FRAMOVERBLIKK (K4, prøve B).
 *
 * Det gamle tallet — `amu 12k16 M=1` 6 619 ms mot `M=2` 34 850 ms, altså 5,3×
 * — ble målt med CPU-en mettet av 18 andre prosesser. Da måler man ikke søket,
 * man måler kontensjonen. Dette sveipet er bygd for å svare på ÉN ting:
 *
 *     hvor mange ms koster ÉN alpha-mu-beslutning ved M=1 og ved M=2?
 *
 * TRE VALG SOM ER HELE POENGET:
 *
 *   1. SAMME STILLINGER. Spillet drives av faste referanseagenter, ikke av
 *      botene vi måler. Begge M-verdiene får dermed nøyaktig samme stilling,
 *      og forskjellen kan ikke komme av at den ene havnet i lettere spill.
 *   2. SAMME KJØRING, VEKSELVIS. M=1 og M=2 spørres etter hverandre i samme
 *      stilling. Blir maskinen travel midt i sveipet, rammer det begge like
 *      mye — mens to påfølgende kjøringer ville gitt hele driften til den ene.
 *   3. BARE BESLUTNINGER DER SØKET FAKTISK KJØRER. `Alphamuagent` faller rett
 *      gjennom i feil rolle og ved ett lovlig kort. Teller man dem med, blir
 *      snittet fortynnet av kall som koster ~0 ms — nøyaktig slik det gamle
 *      «per kortvalg»-tallet måtte ganges med fire for å bety noe. Porten her
 *      er den SAMME som agentens egen (`rolleFor` + `lovligeKort`), lest fra
 *      utsiden, fordi tellerne ligger begravd under `okt:` og `vr:`.
 *
 * MEDIAN RAPPORTERES VED SIDEN AV SNITTET. Snittet er det som betyr noe for et
 * timeanslag, men en enkelt GC-pause eller en nabojobb kan flytte det mye på få
 * stillinger. Står median og snitt langt fra hverandre, er tallet støy.
 *
 *     node examples/amu-kostnad.ts [stillinger] [frø]
 *
 * ================= MÅLT 8. AUGUST 2026 ==================================
 *
 * Maskinen delt med to andre jobber, 24 logiske kjerner, 5 node-prosesser.
 * `amu:foerer:12k16sm{1,2}e0.25r1.5` i ADAMS_V6-stakken:
 *
 *     frø / stillinger      M=1 snitt   M=2 snitt   forhold
 *     424242 / 20  (før)     428 ms     1 375 ms     3,2x
 *     424242 / 20  (etter)   138 ms       439 ms     3,2x
 *     987654 / 16  (etter)   161 ms       712 ms     4,4x
 *
 * «Før/etter» er den glissne framoverpasseringen i `src/nevro/nett.ts`:
 * **3,1x billigere, og bit-identiske valg** (samme 15 av 20 sammenfall mot M=2
 * i begge kjøringene, og `test/amu-bitidentisk.test.ts` holder det fast).
 *
 * STØYEN, SAGT HØYT: 16–20 stillinger er lite, og forholdet spriker 3,2–4,4x
 * mellom frøene. Det er ikke måleusikkerhet i klokka — det er STILLINGENE.
 * M=2 forgreiner seg over egne neste valg, så tidlig i runden med sju lovlige
 * kort koster den langt mer enn i stikk elleve med to. Snittet per beslutning
 * er robust nok til et timeanslag; forholdet mellom armene er det ikke, og skal
 * ikke siteres som en konstant.
 *
 * Det gamle tallet (6 619 ms mot 34 850 ms, 5,3x) sto med CPU-en mettet av 18
 * andre prosesser og målte kontensjon like mye som søk.
 */

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { NevroAgent } from "../src/nevro/index.ts";

/** ADAMS_V6 med M som eneste forskjell. Samme spek som det gamle sveipet. */
const spek = (m: number): string =>
  "okt:vr:e1-modell/vrakrang.bin:telrd:" +
  `amu:foerer:12k16sm${m}e0.25r1.5:` +
  "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

interface Arm {
  readonly navn: string;
  readonly bot: ReturnType<typeof lagIndre>;
  readonly ms: number[];
}

const stillinger = Number(process.argv[2] ?? 40);
const frø = Number(process.argv[3] ?? 987654);

const armer: Arm[] = [1, 2].map((m) => ({ navn: `M=${m}`, bot: lagIndre(spek(m)), ms: [] }));

const ref = [0, 1, 2, 3].map(() => new NevroAgent());
let målte = 0;
let enige = 0;
let runder = 1;
let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
let vakt = 0;

while (målte < stillinger && s.fase !== "FERDIG" && vakt++ < 20_000) {
  if (s.fase === "RUNDE_SLUTT") {
    s = utfør(s, { type: "NESTE" }).state;
    runder++;
    continue;
  }
  const iT = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iT === null || iT === undefined) break;

  // AGENTENS EGEN PORT, lest utenfra: førersetet, og mer enn ett lovlig kort.
  if (s.fase === "SPILL" && rolleFor(s, iT) === "foerer" && lovligeKort(s, iT).length > 1) {
    const valg: string[] = [];
    for (const a of armer) {
      const t0 = performance.now();
      const h = a.bot.velgHandling(s);
      a.ms.push(performance.now() - t0);
      valg.push(h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type);
    }
    målte++;
    if (valg[0] === valg[1]) enige++;
    process.stderr.write(`\r${målte}/${stillinger}`);
  }
  s = utfør(s, ref[iT]!.velgHandling(s)).state;
}
process.stderr.write("\n");

const snitt = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const median = (v: readonly number[]): number => {
  const x = [...v].sort((a, b) => a - b);
  return x.length === 0 ? 0 : x[Math.floor((x.length - 1) / 2)]!;
};

console.log(`\n${målte} soekte beslutninger, froe ${frø}`);
console.log("arm    n     snitt ms   median ms   totalt ms");
for (const a of armer) {
  console.log(
    `${a.navn.padEnd(6)} ${String(a.ms.length).padEnd(5)} ` +
      `${snitt(a.ms).toFixed(1).padStart(8)} ${median(a.ms).toFixed(1).padStart(11)} ` +
      `${a.ms.reduce((x, y) => x + y, 0).toFixed(0).padStart(11)}`,
  );
}
const [a1, a2] = armer as [Arm, Arm];
console.log(`\nforhold M=2/M=1: ${(snitt(a2.ms) / Math.max(1e-9, snitt(a1.ms))).toFixed(2)}x snitt, ` +
  `${(median(a2.ms) / Math.max(1e-9, median(a1.ms))).toFixed(2)}x median`);
console.log(`samme kort i ${enige}/${målte} stillinger (M=2 er et ANNET soek, ikke en optimalisering)`);

/**
 * TALLET EN MÅLEPLAN TRENGER. `gate2` gir én runde per (giv, sete), og søket
 * fyrer bare når setet er FØRER — altså i ett av fire par. Kostnaden per par er
 * derfor `soek per foererrunde / 4 * ms per soek`, og den er verdt å skrive ut
 * her i stedet for å regnes for hånd i en rapport ingen kan etterprøve.
 */
const perRunde = målte / Math.max(1, runder);
console.log(`\n${runder} runder besoekt => ${perRunde.toFixed(1)} soek per foererrunde`);
for (const a of armer) {
  const perPar = (snitt(a.ms) * perRunde) / 4;
  console.log(
    `${a.navn}: ${(perPar / 1000).toFixed(2)} s per gate2-par (ett sete, én runde) ` +
      `=> ${((perPar * 16000) / 3_600_000).toFixed(1)} t for 16 000 par paa én kjerne`,
  );
}
