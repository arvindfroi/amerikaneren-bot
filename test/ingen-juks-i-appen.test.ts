/**
 * JUKSEMÅLEREN MÅ ALDRI NÅ NETTAPPEN.
 *
 * `Juksagent` ser alle fire hendene. Den finnes for å måle TAKET i
 * sluttspillet – hvor mye som i det hele tatt er å hente der – og er per
 * konstruksjon ulovlig som spiller.
 *
 * Faren er ikke at noen bygger den inn med vilje. Den er at et målespek blir
 * kopiert inn i `web/app.ts` fordi det ga et pent tall. Da ville boten spilt
 * perfekt sluttspill mot familien uten at noe feilet og uten at noen så det –
 * nøyaktig samme mønster som da worker-en bygget `Rolleorakel` mens målingen
 * var gjort på `Sikkerorakel`.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { KREVER_FASIT } from "../src/moe2/juksagent.ts";

const ROT = join(import.meta.dirname, "..");
const APPFILER = ["web/app.ts", "web/worker.ts", "web/index.html"];

test("modulen merker seg selv som fasitavhengig", () => {
  assert.equal(KREVER_FASIT, true);
});

test("ingen appfil refererer juksagenten – verken modul eller spek", () => {
  for (const f of APPFILER) {
    const kilde = readFileSync(join(ROT, f), "utf8");
    assert.ok(!kilde.includes("juksagent"), `${f} importerer juksagent`);
    assert.ok(!kilde.includes("Juksagent"), `${f} refererer Juksagent`);
    assert.ok(!/["'`]juks:/.test(kilde), `${f} inneholder et juks-spek`);
  }
});

/**
 * OG DEN MÅ FAKTISK JUKSE. En vaktpost mot en agent som ikke gjør noe er verre
 * enn ingen vaktpost: den gir trygghet uten dekning. Bytter vi ut de skjulte
 * hendene, MÅ valget kunne endre seg – ellers leser den dem ikke.
 */
test("juksagenten leser faktisk de skjulte hendene", async () => {
  const { opprettSpill, utfør } = await import("../src/index.ts");
  const { lagIndre, ADAMS } = await import("../src/moe2/agentspek.ts");

  let ulike = 0;
  let sammenliknet = 0;
  // Ingen tidlig avslutning: tallet på sammenlikninger skal si noe om hvor
  // bredt vakten faktisk har sett, ikke om hvor fort første treff kom.
  for (let g = 0; g < 12; g++) {
    const rein = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
    const juks = [0, 1, 2, 3].map(() => lagIndre(`juks:4:${ADAMS}`));
    let s = opprettSpill({ antallSpillere: 4 }, 6_200_000 + g * 7717);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      if (s.fase === "SPILL" && (s.hender[iTur]?.length ?? 0) <= 4) {
        const a = rein[iTur]!.velgHandling(s);
        const b = juks[iTur]!.velgHandling(s);
        sammenliknet++;
        if (a.type === "SPILL" && b.type === "SPILL" && !likeKortEnkel(a.kort, b.kort)) ulike++;
      }
      s = utfør(s, rein[iTur]!.velgHandling(s)).state;
    }
  }
  assert.ok(sammenliknet > 40, `for få sammenlikninger (${sammenliknet})`);
  assert.ok(ulike > 0, "juksagenten valgte aldri et annet kort – den jukser ikke");
});

function likeKortEnkel(a: { farge: string; verdi: number }, b: { farge: string; verdi: number }) {
  return a.farge === b.farge && a.verdi === b.verdi;
}
