/**
 * ER HVER BLOKK FAKTISK KOBLET? — målt, ikke antatt.
 *
 *   node examples/koblingssjekk.ts > analyse/koblingssjekk.txt
 *
 * ARVIND: «men blokkene fungerer som de skal? alt er koblet opp og satt opp på
 * en riktig måte?»
 *
 * Spørsmålet fortjener et tall, ikke en forsikring. Denne økten har fire ting
 * vist seg å være bygd, testet og IKKE KOBLET — kanal 2 så sent som samme dag.
 * Mønsteret er §99: en evne som ser levende ut fordi den finnes.
 *
 * For hver bryter: bygg FULL og FULL-MINUS-X, spill de samme stillingene, og
 * tell hvor mange valg som skiller seg. 0 betyr én av tre ting, og de må
 * skilles:
 *
 *   IKKE KOBLET        parameteren når aldri fram
 *   BENKEGRENSE        modulen kan ikke virke her (okt: trenger 4+ runder,
 *                      «r» trenger poeng på bordet)
 *   INGENTING Å GJØRE  fire like agenter har ingen stil å lære av hverandre
 *
 * MÅLT 8. august, 219 valg over 4 runder med fire like agenter:
 *
 *     vakt        27   amu        15   v (veto)   12
 *     m2          11   g (leser)   9   budm        7
 *     e (A7)       5   b (A5)      4   vr          2
 *     G (avsend)   1   okt/profil  0   r           0
 *     d4/B4/W2     0
 *
 * Og oppfølgingen som skilte de tre årsakene:
 *
 *     r        24 av 765 over 14 runder            BENKEGRENSE, koblet
 *     W2       22 av 329 med `amu:alle`, 0 med     STRUKTURELT: budvinneren
 *              `amu:foerer`                        kjenner sitt eget vrak, så
 *                                                  det finnes ingen død binge
 *                                                  å vekte i førersetet
 *     okt:      0 av 657 med fire like             INGENTING Å LÆRE
 *               2 av 548 mot tre trumftrekkere     koblet, men SVAKT
 *     d5        1 av 657                           koblet, men sjeldent
 *     B4        0 selv med M=2                     bredden biter bare når
 *                                                  snittet av lovlige kort
 *                                                  dypere i treet er > 4
 *
 * DE TO SISTE ER DEN VIKTIGSTE LESNINGEN. `okt:` endrer 0,4 % av valgene selv
 * mot en åpenbar vane. Da KAN den ikke gi en målbar poenggevinst — og det
 * forklarer K6-målingens 0,007 ± 0,494 bedre enn «kanalen betaler seg ikke».
 * Kanalen er nesten stum.
 *
 * Årsaken er strukturell: hukommelsen vrir ROLLOUT-policyen, altså søkets
 * EVALUERING. For at det skal vises i et valg må vridningen flippe søkets
 * argmax. Det er en høy terskel.
 */
import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";
const VR = "vr:e1-modell/vrakrang.bin:telrd";
const BUD = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5";
const AMU = (f: string) => `amu:foerer:${f}`;
const FULL = `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`;

const armer: [string, string][] = [
  ["okt:      hukommelsen (K4/K6)",   `${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`],
  ["profil:   motstandermodellen",    `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:${BUD}:${NETT}`],
  ["vr:       vrak og trumf (K3)",    `okt:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`],
  ["amu:      soeket",                `okt:${VR}:profil:${BUD}:${NETT}`],
  ["  b       A5 Bayes-vekt (K8)",    `okt:${VR}:${AMU("12k16gm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`],
  ["  g       A6 LESEREN (K8 nr.5)",  `okt:${VR}:${AMU("12k16bm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`],
  ["  r       kampstilling (K5)",     `okt:${VR}:${AMU("12k16bgm1e0v0.5")}:profil:${BUD}:${NETT}`],
  ["  v       vaktens veto",          `okt:${VR}:${AMU("12k16bgm1e0r1.5")}:profil:${BUD}:${NETT}`],
  ["budm:     budmodellen (K3)",      `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${NETT}`],
  ["vakt:     konvensjonene",         `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${BUD}:e1:e1-modell/d7alle.bin`],
];
const paaslag: [string, string][] = [
  ["  m2      framoverblikk (K4-B)",  `okt:${VR}:${AMU("12k16bgm2e0r1.5v0.5")}:profil:${BUD}:${NETT}`],
  ["  d4      sluttspilldybde (K7)",  `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5d4")}:profil:${BUD}:${NETT}`],
  ["  B4      soekebredde",           `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5B4")}:profil:${BUD}:${NETT}`],
  ["  W2      kanal 2, vraket (K8)",  `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5W2")}:profil:${BUD}:${NETT}`],
  ["  G       A6 avsender (PARKERT)", `okt:${VR}:${AMU("12k16bgGm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`],
  ["  e0.25   A7 (PARKERT)",          `okt:${VR}:${AMU("12k16bgm1e0.25r1.5v0.5")}:profil:${BUD}:${NETT}`],
];

function ulike(a: string, b: string, runder: number): { n: number; ulik: number } {
  const A = [0,1,2,3].map(() => lagIndre(a));
  const B = [0,1,2,3].map(() => lagIndre(b));
  for (const x of [...A, ...B]) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 13_000_777);
  let vakt = 0, r = 0, n = 0, ulik = 0;
  while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < runder) {
    if (s.fase === "RUNDE_SLUTT") { for (const x of [...A,...B]) x.velgHandling(s); r++; s = utfør(s, { type: "NESTE" }).state; continue; }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const ha = A[iTur]!.velgHandling(s);
    const hb = B[iTur]!.velgHandling(s);
    n++; if (JSON.stringify(ha) !== JSON.stringify(hb)) ulik++;
    s = utfør(s, ha).state;
  }
  return { n, ulik };
}

console.log("BLOKK                             valg   ulike   status");
console.log("-".repeat(66));
for (const [navn, uten] of armer) {
  const { n, ulik } = ulike(FULL, uten, 4);
  const st = ulik > 0 ? "KOBLET" : "*** IKKE KOBLET ***";
  console.log(`${navn.padEnd(33)} ${String(n).padStart(5)} ${String(ulik).padStart(7)}   ${st}`);
}
console.log("-".repeat(66));
console.log("PAASLAG (skal endre naar de slaas PAA):");
for (const [navn, med] of paaslag) {
  const { n, ulik } = ulike(FULL, med, 4);
  const st = ulik > 0 ? "KOBLET" : "*** IKKE KOBLET ***";
  console.log(`${navn.padEnd(33)} ${String(n).padStart(5)} ${String(ulik).padStart(7)}   ${st}`);
}
