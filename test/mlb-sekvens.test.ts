/**
 * SONDENS INNGANGER — DEN ORDNEDE REKKA OG BORDMERKET (12. sep).
 *
 * `src/mlb/sekvens.ts` og `--sekvens`/`--bordmerke` i `examples/mlb-trodata.ts` finnes for å
 * MÅLE om flaskehalsen for K8 er en manglende sans eller en ubrukt sans. En sonde som selv er
 * gal, måler galt uten å krasje, og de tre måtene den kan være gal på er det prøvene her går
 * etter — hver med en FELLE, for en prøve som ikke kan feile er ikke en prøve:
 *
 *   1. REKKA SER SKJULTE KORT       da er «rekkefølgen bærer signal» bare lekkasje i forkledning.
 *                                   Prøvd med bytte av alle skjulte hender, og en felle som
 *                                   koder ETT bit om naboens hånd — den MÅ bli tatt.
 *   2. REKKA ER TOM ELLER FORSKJØVET  48 fyllverdier ser ut som en gyldig rad. Prøven krever at
 *                                   `n` er nøyaktig 4·stikkSpilt + kort på bordet, at padding er
 *                                   `SEKV_TOM`, og at prøven faktisk fikk lange rekker å se på.
 *   3. SONDEN ENDRER KORPUSET       løkka trener på nøyaktig disse filene hver iterasjon. Endrer
 *                                   et sondeflagg én byte, har sonden byttet ut produksjonens
 *                                   treningsdata mens den målte dem. Prøvd med sha1, og med en
 *                                   felle som viser at sha1-sammenlikningen KAN slå ut.
 *
 * Og til slutt: bordmerket skal gjenskape seteplasseringen `drivere.ts` faktisk brukte. Er de
 * to uenige, er hver eneste etikett i sonde A feil merkelapp på riktig rad — det verste
 * utfallet, fordi tallene da ser fornuftige ut.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { SEKV_FELT, SEKV_LENGDE, SEKV_MAKS, SEKV_TOM, SEKVENSFELT, sekvensTrekk } from "../src/mlb/sekvens.ts";
import { lesDrivere, slot } from "../examples/drivere.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));
/** Relativ til ROT og ignorert av git (`/_*`). Per prosess, så parallelle kjøringer ikke deler fil. */
const MAPPE = `_test-sekvens-${process.pid}`;

/** Den andre populasjonsspeken fra løkka (`adams-max-loop-v7.sh`), så bordet faktisk er blandet. */
const P_MENN = "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json:vakt:abmp:e1:e1-modell/d7alle.bin";

before(() => mkdirSync(`${ROT}/${MAPPE}`, { recursive: true }));
after(() => rmSync(`${ROT}/${MAPPE}`, { recursive: true, force: true }));

// ===========================================================================
// 1. K2: rekka er blind for skjulte kort
// ===========================================================================

type Bygger = (s: GameState, sete: number) => Int16Array;

const ærlig: Bygger = (s, sete) => sekvensTrekk(spillerVisning(s, sete)).v;

/**
 * KONTROLLEN: den minste tenkelige lekkasjen — ett felt av 192 som sier om relativt sete 1
 * holder spar ess. Finner ikke prøven den, finner den heller ikke en ekte lekkasje.
 */
const jukser: Bygger = (s, sete) => {
  const v = ærlig(s, sete);
  const neste = (sete + 1) % s.antallSpillere;
  const sparEss = kortIndeks({ farge: "S", verdi: 14 });
  if ((s.hender[neste] ?? []).some((k) => kortIndeks(k) === sparEss)) v[0] = (v[0]! + 1) as number;
  return v;
};

function prøv(bygg: Bygger, giver: number, verdenerPerStilling: number, fraStikk: number): {
  stillinger: number;
  sammenlikninger: number;
  avvik: string[];
  maksLengde: number;
} {
  const avvik: string[] = [];
  let stillinger = 0;
  let sammenlikninger = 0;
  let maksLengde = 0;

  for (let g = 0; g < giver; g++) {
    const frø = 5_500_000 + g * 4231;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;

    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null && iGiv < 3 && s.stikkSpilt >= fraStikk) {
        const sete = s.iTur;
        if (lovligeKort(s, sete).length >= 1) {
          const rng = lagRng(919_000 + g * 37 + s.stikkSpilt);
          const verdener = trekkVerdener(s, sete, verdenerPerStilling, rng, undefined, undefined, 4);
          if (verdener.length >= 2) {
            iGiv++;
            stillinger++;
            const fasit = bygg(s, sete);
            assert.equal(fasit.length, SEKV_LENGDE, "feil bredde på handlingsrekka");
            maksLengde = Math.max(maksLengde, sekvensTrekk(spillerVisning(s, sete)).n);
            for (const hender of verdener) {
              const s2 = medVerden(s, hender, sete);
              assert.deepEqual(
                s2.hender[sete],
                s.hender[sete],
                "medVerden endret observatørens egen hånd — prøven måler feil ting",
              );
              sammenlikninger++;
              const annen = bygg(s2, sete);
              for (let i = 0; i < SEKV_LENGDE; i++) {
                if (fasit[i] !== annen[i]) {
                  avvik.push(
                    `frø ${frø} stikk ${s.stikkSpilt} sete ${sete}: felt ${i} er ${String(fasit[i])} i den ` +
                      `ekte verdenen og ${String(annen[i])} i en forenlig — rekka avhenger av SKJULTE kort`,
                  );
                  break;
                }
              }
            }
          }
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return { stillinger, sammenlikninger, avvik, maksLengde };
}

test("K2: handlingsrekka er bit-identisk når BARE de skjulte kortene byttes", () => {
  const tidlig = prøv(ærlig, 5, 3, 0);
  const sent = prøv(ærlig, 5, 3, 6);
  const stillinger = tidlig.stillinger + sent.stillinger;
  const sammenlikninger = tidlig.sammenlikninger + sent.sammenlikninger;

  assert.ok(stillinger >= 12, `prøven fikk bare ${stillinger} stillinger — beviser ingenting`);
  assert.ok(sammenlikninger >= 24, `bare ${sammenlikninger} verdenssammenlikninger — beviser ingenting`);
  assert.deepEqual([...tidlig.avvik, ...sent.avvik], [], "handlingsrekka lekker skjult informasjon");
  // Og prøven må ha sett ekte, lange rekker — ikke bare tomme åpningsstillinger.
  assert.ok(sent.maksLengde >= 20, `lengste rekke var ${sent.maksLengde} steg — prøven så aldri en full runde`);
});

test("fella: en rekke som koder ETT bit om naboens hånd blir tatt", () => {
  const r = prøv(jukser, 5, 3, 6);
  assert.ok(r.sammenlikninger >= 12, "fella fikk ingenting å prøve");
  assert.ok(r.avvik.length > 0, "fella slapp unna: prøven ser ikke en lekkasje på ett eneste felt");
});

// ===========================================================================
// 2. Strukturen: lengde, padding og innhold
// ===========================================================================

test("rekka har nøyaktig ett steg per lagt kort, og padding er SEKV_TOM", () => {
  const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 7_300_011);
  let vakt = 0;
  let prøvd = 0;
  let sett = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const sete = s.iTur;
      const vis = spillerVisning(s, sete);
      const { n, v } = sekvensTrekk(vis);
      prøvd++;
      sett = Math.max(sett, n);
      assert.equal(n, s.stikkSpilt * 4 + vis.bord.length, `feil antall steg i stikk ${s.stikkSpilt}`);
      for (let i = n * SEKV_FELT; i < SEKV_LENGDE; i++) {
        assert.equal(v[i], SEKV_TOM, `padding på plass ${i} er ${String(v[i])}, ikke ${SEKV_TOM}`);
      }
      for (let i = 0; i < n; i++) {
        const o = i * SEKV_FELT;
        assert.ok(v[o + SEKVENSFELT.REL_SETE]! >= 0 && v[o + SEKVENSFELT.REL_SETE]! < 4, "relativt sete utenfor 0–3");
        assert.ok(v[o + SEKVENSFELT.KORT]! >= 0 && v[o + SEKVENSFELT.KORT]! < 52, "kortindeks utenfor 0–51");
        assert.equal(v[o + SEKVENSFELT.STIKK], Math.floor(i / 4), "stikknummeret følger ikke rekkefølgen");
        assert.equal(v[o + SEKVENSFELT.POSISJON], i % 4, "posisjonen i stikket følger ikke rekkefølgen");
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
  }
  assert.ok(prøvd >= 20, `bare ${prøvd} stillinger prøvd — beviser ingenting`);
  assert.ok(sett >= 20, `lengste rekke var ${sett} steg — runden ble aldri spilt ut`);
});

// ===========================================================================
// 3. Sondeflaggene rører ikke korpuset
// ===========================================================================

const sha1 = (sti: string): string => createHash("sha1").update(readFileSync(sti)).digest("hex");

function kjør(args: readonly string[]): void {
  const r = spawnSync(process.execPath, ["examples/mlb-trodata.ts", ...args], { cwd: ROT, encoding: "utf8" });
  assert.equal(r.status, 0, `mlb-trodata feilet:\n${r.stdout}\n${r.stderr}`);
}

const FELLES = [
  "--kamp",
  "--hukommelse",
  "--signal",
  "--sanser2",
  "--rotasjon",
  "--band",
  "holdout",
  "--maksrunder",
  "3",
  "--spek",
  ADAMS_MAALT,
  "--drivere",
  `@|${P_MENN}|@|${ADAMS_MAALT}`,
];

test("--sekvens og --bordmerke lar korpuset være BYTE-IDENTISK", () => {
  kjør([...FELLES, "--kamper", "3", "--skard", "0/1", "--ut", `${MAPPE}/uten.bin`]);
  kjør([...FELLES, "--kamper", "3", "--skard", "0/1", "--sekvens", "--bordmerke", "--ut", `${MAPPE}/med.bin`]);
  const uten = sha1(`${ROT}/${MAPPE}/uten.bin`);
  const med = sha1(`${ROT}/${MAPPE}/med.bin`);
  assert.equal(med, uten, "sondeflaggene endret korpuset — løkka ville trent på andre data");

  // FELLA: sha1-sammenlikningen over må kunne slå ut. Et annet antall kamper gir en annen fil.
  kjør([...FELLES, "--kamper", "2", "--skard", "0/1", "--ut", `${MAPPE}/annen.bin`]);
  assert.notEqual(sha1(`${ROT}/${MAPPE}/annen.bin`), uten, "sha1 skiller ikke to ulike korpus — prøven er blind");
});

test("sekv-fila har nøyaktig én post per rad i korpuset", () => {
  // Kjøringen over la begge filene; les dem her så prøven står på egne bein om rekkefølgen endres.
  kjør([...FELLES, "--kamper", "3", "--skard", "0/1", "--sekvens", "--bordmerke", "--ut", `${MAPPE}/par.bin`]);
  const korpus = statSync(`${ROT}/${MAPPE}/par.bin`).size;
  const sekv = statSync(`${ROT}/${MAPPE}/par.bin.sekv.bin`).size;
  const merke = JSON.parse(readFileSync(`${ROT}/${MAPPE}/par.bin.bord.json`, "utf8")) as { rader: number };

  const POST = 996 * 4 + 52 + 4 + 2 + 2;
  const SEKV_POST = 2 + SEKV_LENGDE * 2;
  assert.equal((korpus - 12) % POST, 0, "korpuset er ikke et helt antall poster");
  assert.equal((sekv - 16) % SEKV_POST, 0, "sekv-fila er ikke et helt antall poster");
  const rader = (korpus - 12) / POST;
  assert.ok(rader > 0, "kjøringen skrev ingen rader — prøven beviser ingenting");
  assert.equal((sekv - 16) / SEKV_POST, rader, "sekv-fila og korpuset har ulikt antall rader — de er ute av takt");
  assert.equal(merke.rader, rader, "bordmerket teller andre rader enn korpuset har");
});

test("bordmerket gjenskaper seteplasseringen drivere.ts faktisk brukte", () => {
  kjør([...FELLES, "--kamper", "3", "--skard", "0/1", "--bordmerke", "--ut", `${MAPPE}/merke.bin`]);
  const m = JSON.parse(readFileSync(`${ROT}/${MAPPE}/merke.bin.bord.json`, "utf8")) as {
    spek: string[];
    opptak: boolean[];
    rotasjon: boolean;
    base: number;
    steg: number;
  };
  const bord = lesDrivere(`@|${P_MENN}|@|${ADAMS_MAALT}`, ADAMS_MAALT, true);
  assert.deepEqual(m.spek, [...bord.spek], "bordmerket har andre speker enn drivere.ts leste");
  assert.deepEqual(m.opptak, [...bord.opptak], "bordmerket har et annet opptak enn drivere.ts leste");
  assert.equal(m.rotasjon, true, "bordmerket glemte rotasjonen");

  // Utledningen sonde A gjør: kamp = (frø − base)/steg, og slotten i setet er slot(sete, kamp).
  let prøvd = 0;
  let ulike = 0;
  for (let k = 0; k < 3; k++) {
    const frø = m.base + k * m.steg;
    assert.equal((frø - m.base) / m.steg, k, "kampnummeret kan ikke leses tilbake av frøet");
    for (let sete = 0; sete < 4; sete++) {
      const s = slot(bord, sete, k);
      assert.equal(s, (sete + k) % 4, "rotasjonsregelen i sonden er ikke drivere.ts sin");
      prøvd++;
      if (m.spek[s] !== m.spek[sete]) ulike++;
    }
  }
  assert.equal(prøvd, 12, "prøven gikk ikke gjennom alle setene");
  // FELLA: var bordet ublandet, ville utledningen vært riktig og likevel verdiløs.
  assert.ok(ulike > 0, "ingen sete byttet spek under rotasjonen — merket kan ikke skille motstandertyper");
});
