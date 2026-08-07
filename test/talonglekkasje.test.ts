/**
 * TALONGLEKKASJEN — funnet av K3-agenten, og K2-prøven kunne ikke se den.
 *
 * `medVerden` byttet bare `hender` og lot `state.talong` stå. Siden
 * `trekkVerden` legger talongens kort i en DØD BINGE og kaster dem (`Verden`
 * har bare `hender`), ble resultatet to feil på én gang:
 *
 *   1. UMULIGE VERDENER. Målt over 180 trekninger: **100 % hadde
 *      duplikatkort**, i snitt 3,6 av 52 — et kort lå både på en hånd og i
 *      talongen.
 *   2. JUKS. `motor.ts` gir budvinneren `s.talong` ved vrak, så i HVER rollout
 *      fikk hun de fire EKTE byttekortene. I 100 % av tilfellene.
 *
 * Latent så lenge A4-budsøket sto på `blanding = 0` — men `ADAMS_V7` bruker
 * `sok12k8b0.5`, altså aktivt.
 *
 * ================= HVORFOR K2 IKKE FANGET DEN ===========================
 *
 * `test/k2-aldri-jukse.test.ts` prøver kortvalg **fra stikk 7**. Der er
 * talongen for lengst tatt opp og `state.talong` er tom, så invariansen holdt
 * trivielt.
 *
 * Lærdommen er generell og verdt å skrive ned: **en invariansprøve dekker bare
 * de fasene den faktisk besøker.** «Adams jukser ikke» var sant om kortspillet
 * i sluttfasen og usant om budrundens rollouts, og ingen av delene var synlig
 * i den grønne testen.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { lagRng } from "../src/kort.ts";

/** Spill fram til en BUDRUNDE-stilling der noen har bydd. */
function tilBudrunde(frø: number): { s: GameState; sete: number } | null {
  const ag = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase === "BUDRUNDE" && vakt++ < 40) {
    if (s.iTur === null) return null;
    if (vakt >= 2) return { s, sete: s.iTur };
    s = utfør(s, ag[s.iTur]!.velgHandling(s)).state;
  }
  return null;
}

test("verdener i BUDRUNDEN har ingen duplikatkort", () => {
  let prøvd = 0;
  const feil: string[] = [];
  for (let g = 0; g < 12; g++) {
    const p = tilBudrunde(2_500_000 + g * 3313);
    if (p === null) continue;
    const { s, sete } = p;
    const verdener = trekkVerdener(s, sete, 4, lagRng(880_000 + g), undefined, undefined, 4);
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      prøvd++;
      const sett = new Set<number>();
      let dubletter = 0;
      for (const h of s2.hender) for (const k of h) {
        const c = kortTilInt(k);
        if (sett.has(c)) dubletter++;
        sett.add(c);
      }
      for (const k of s2.talong) {
        const c = kortTilInt(k);
        if (sett.has(c)) dubletter++;
        sett.add(c);
      }
      if (dubletter > 0) {
        feil.push(`froe ${2_500_000 + g * 3313} sete ${sete}: ${dubletter} duplikatkort`);
      }
    }
  }
  assert.ok(prøvd >= 8, `proeven fikk bare ${prøvd} verdener - beviser ingenting`);
  assert.deepEqual(
    feil,
    [],
    `UMULIGE VERDENER: samme kort ligger to steder.\n` + feil.slice(0, 6).join("\n"),
  );
});

test("talongen i en verden er IKKE den virkelige - ellers er den juks", () => {
  /**
   * Den harde delen. Budvinneren tar opp `state.talong` ved vrak, så en verden
   * som beholder den virkelige talongen gir henne fire kort hun ikke kan se.
   *
   * Kravet er ikke «av og til ulik» — det er at den skal følge verdenen. Med
   * fire kort trukket fra ~40 usette er sammenfall mulig, men det skal være
   * sjeldent, ikke universelt. Var det 100 %, er talongen ikke byttet i det
   * hele tatt.
   */
  let prøvd = 0;
  let identisk = 0;
  for (let g = 0; g < 12; g++) {
    const p = tilBudrunde(2_500_000 + g * 3313);
    if (p === null) continue;
    const { s, sete } = p;
    if (s.talong.length === 0) continue;
    const ekte = new Set(s.talong.map(kortTilInt));
    const verdener = trekkVerdener(s, sete, 4, lagRng(990_000 + g), undefined, undefined, 4);
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      prøvd++;
      const ny = s2.talong.map(kortTilInt);
      if (ny.length === ekte.size && ny.every((c) => ekte.has(c))) identisk++;
    }
  }
  assert.ok(prøvd >= 8, `proeven fikk bare ${prøvd} verdener`);
  const andel = identisk / prøvd;
  assert.ok(
    andel < 0.5,
    `talongen var IDENTISK med den virkelige i ${(100 * andel).toFixed(0)} % av ` +
      `${prøvd} verdener. Budvinneren tar den opp ved vrak, saa det er de EKTE ` +
      `byttekortene i hver rollout - altsaa juks. Maalt foer fiksen: 100 %.`,
  );
});

test("talongen har riktig STOERRELSE i hver verden", () => {
  // Residualet maa vaere noeyaktig `giving.talong` kort. Er det flere, mangler
  // noen kort paa hendene; er det faerre, er noen delt ut to ganger.
  for (let g = 0; g < 8; g++) {
    const p = tilBudrunde(2_500_000 + g * 3313);
    if (p === null) continue;
    const { s, sete } = p;
    const verdener = trekkVerdener(s, sete, 3, lagRng(770_000 + g), undefined, undefined, 4);
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      assert.equal(
        s2.talong.length,
        s.talong.length,
        `talongen fikk ${s2.talong.length} kort, den virkelige har ${s.talong.length}`,
      );
    }
  }
});
