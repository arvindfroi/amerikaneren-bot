import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import type { EksaktSluttspill } from "../src/moe2/eksaktagent.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import type { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";

/**
 * SØK VED SPILLETID OPPÅ MLB-NETTET (K4.3, K7.2, K8 kanal 6 for MLB – 11. sep).
 *
 * `src/mlb/` kan ikke importere `src/solver/` (herkomstprøven: treningen skal aldri nå en
 * modul som ser alle fire hender), og `Søk`-kroken i `src/mlb/sok.ts` er bare for søk
 * INNE i spillingen som trenes – forbudt av AVGJØRELSE 5. Søk ved SPILLETID er tillatt,
 * og det finnes allerede: `sik:` og `eks:` i `src/moe2/` tar en vilkårlig indre agent,
 * også `mlb:`, og importretningen moe2 → mlb er den lovlige.
 *
 * Fila låser at komposisjonen FAKTISK virker, med et tilfeldig MLB-nett så prøven ikke
 * avhenger av trente vekter:
 *
 *   sik:alle:…e3L:mlb:…   framoverblikk (utspillinger med MLB-policyen) og eksakt blad
 *   eks:3L:mlb:…          eksakt sluttspill, K2-invariant
 */

const MLB = "mlb:tilfeldig7";
const navn = (h: Handling): string => (h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type);

/** Sene SPILL-stillinger fra kamper der MLB-nettet spiller alle fire seter. */
function sene(antall: number, igjenMaks: number): GameState[] {
  const ut: GameState[] = [];
  for (let f = 0; ut.length < antall && f < antall * 6; f++) {
    const seter = [0, 1, 2, 3].map(() => lagIndre(MLB));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 8_600_000 + f);
    let vakt = 0;
    let tatt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 2_000) {
      if (
        s.fase === "SPILL" &&
        s.iTur !== null &&
        s.giving.antallStikk - s.stikkSpilt <= igjenMaks &&
        lovligeKort(s, s.iTur).length >= 2 &&
        tatt < 2
      ) {
        ut.push(s);
        tatt++;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, seter[iTur]!.velgHandling(s)).state;
    }
  }
  return ut.slice(0, antall);
}

test("utenSøk gir MLB-agenten som rollout-motpart", () => {
  assert.equal(utenSøk(`sik:alle:0.5:4e3L:${MLB}`), MLB);
  assert.equal(utenSøk(`eks:3L:sik:alle:0.5:4e3L:${MLB}`), MLB);
});

test("sik med eksakt blad oppå MLB: bygger, vurderer og velger lovlig i alle roller", () => {
  // σ = 0: søket overstyrer når det har en mening, så vi ser at det faktisk regner.
  const agent = lagIndre(`sik:alle:0:4e3L:${MLB}`) as unknown as Sikkerorakel;
  assert.equal(agent.eksaktBlad, 3);
  const stillinger = sene(6, 5);
  assert.ok(stillinger.length >= 4, `for få stillinger (${stillinger.length})`);
  for (const s of stillinger) {
    const h = agent.velgHandling(s);
    assert.equal(h.type, "SPILL");
    if (h.type === "SPILL") {
      assert.ok(lovligeKort(s, s.iTur!).some((k) => k.farge === h.kort.farge && k.verdi === h.kort.verdi), "ulovlig kort");
    }
  }
  assert.ok(agent.tellere.vurdert > 0, "søket vurderte ingen stilling – komposisjonen når ikke fram");
});

test("eksakt sluttspill oppå MLB slår til, og velger likt i alle verdener forenlige med setets visning (K2)", () => {
  const eks = lagIndre(`eks:3L:${MLB}`) as unknown as EksaktSluttspill;
  const avvik: string[] = [];
  let prøvd = 0;
  for (const s of sene(8, 3)) {
    const sete = s.iTur!;
    const fasit = navn(eks.velgHandling(s));
    for (const hender of trekkVerdener(s, sete, 3, lagRng(313 + prøvd), undefined, undefined, 4)) {
      const valg = navn(eks.velgHandling(medVerden(s, hender, sete)));
      if (valg !== fasit) avvik.push(`sete ${sete}, stikk ${s.stikkSpilt}: ${fasit} → ${valg}`);
      prøvd++;
    }
  }
  assert.ok(prøvd >= 12, `for få verdenssammenlikninger (${prøvd})`);
  assert.ok(eks.telling.enumerert > 0, "eksaktlaget slo aldri til oppå MLB");
  assert.deepEqual(avvik, [], `JUKS: valget endret seg når bare skjulte kort ble byttet\n${avvik.join("\n")}`);
});
