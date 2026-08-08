/**
 * BETYR REKKEFØLGEN NOE? — spørsmålet som må avgjøres før noe rulles ut.
 *
 * `web/worker.ts` bygger Adams slik:
 *
 *     Sikkerorakel ∘ Vrakrangerer ∘ Budagent ∘ Konvensjonsvakt ∘ E1
 *      ^^^^^^^^^^^^ søket YTTERST
 *
 * Spekspråket, og dermed hver eneste måling prosjektet har gjort, bygger den
 * andre veien — `okt:vr:...:amu:...` har `vr:` ytterst og søket UNDER:
 *
 *     Vrakrangerer ∘ Søk ∘ Budagent ∘ Konvensjonsvakt ∘ E1
 *
 * Forskjellen var udokumentert og umålt. Jeg oppdaget den da `byggUtrullet`
 * ble skrevet, valgte spekrekkefølgen der, og lot spørsmålet stå.
 *
 * ================= HVORFOR DET IKKE KAN STÅ =============================
 *
 * Er de to ULIKE, har den utrullede boten aldri vært den samme boten som noen
 * måling. Da er hvert tall i `docs/plan.md` målt på noe annet enn det familien
 * møter — prosjektets mest gjentatte feilklasse, tretten ganger og telling.
 *
 * Er de LIKE, kan workeren trygt bytte til `byggUtrullet`, og duplikatkjeden
 * som er årsaken til hele feilklassen forsvinner.
 *
 * Begge svar er nyttige. Det som ikke er nyttig er å anta.
 *
 * ================= HVA MAN SKULLE TRODD ================================
 *
 * Argumentet for at det ikke betyr noe: `Vrakrangerer` rører bare VRAK og
 * VELG, og søket rører bare SPILL, så de skal aldri se hverandres
 * beslutninger. Argumentet er plausibelt. Det er også nøyaktig den slags
 * plausible argument som har vært galt fire ganger denne uka.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState, Handling } from "../src/motor.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { Konvensjonsvakt, lesVaktflagg } from "../src/moe2/konvensjonsvakt.ts";
import { Budagent, tolkBudmodell } from "../src/moe2/budmodell.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { byggUtrullet, type Velger } from "../src/moe2/utrullet.ts";

const kortBytes = new Uint8Array(readFileSync("e1-modell/d7alle.bin"));
const vrakBytes = new Uint8Array(readFileSync("e1-modell/vrakrang.bin"));
const budJson: unknown = JSON.parse(readFileSync("e1-modell/bud-vant.json", "utf8"));

const VERDENER = 8;
const SIGMA = 0.5;
const VAKTFLAGG = "abmp";
const VRAKFLAGG = "telrd";
const BUDTERSKEL = -3.0;

/** Kjeden slik `web/worker.ts` bygger den i dag: søket YTTERST. */
function workerkjeden(): Velger {
  const kort: Velger = new Konvensjonsvakt(
    E1Agent.fraBytes(kortBytes),
    lesVaktflagg(VAKTFLAGG),
  ) as unknown as Velger;
  let bot: Velger = kort;
  bot = new Budagent(kort, tolkBudmodell(budJson), BUDTERSKEL) as unknown as Velger;
  const n = nettFraBytes(vrakBytes)[0]!;
  bot = new Vrakrangerer(bot, n, VRAKFLAGG) as unknown as Velger;
  return new Sikkerorakel(bot, bot as never, {
    verdener: VERDENER,
    sigma: SIGMA,
    roller: ["foerer"],
  }) as unknown as Velger;
}

/** Kjeden slik speken bygger den: `vr:` ytterst, søket under. */
function spekkjeden(): Velger {
  return byggUtrullet({
    kortnett: nettFraBytes(kortBytes)[0]!,
    kort: E1Agent.fraBytes(kortBytes) as unknown as Velger,
    vaktflagg: VAKTFLAGG,
    bud: tolkBudmodell(budJson),
    budterskel: BUDTERSKEL,
    vraknett: nettFraBytes(vrakBytes)[0]!,
    vrakflagg: VRAKFLAGG,
    søk: { type: "sik", verdener: VERDENER, sigma: SIGMA },
    økt: false,
  }).agent;
}

test("workerens rekkefoelge og spekens gir SAMME valg - eller vi vet at de ikke gjoer det", () => {
  const a = [0, 1, 2, 3].map(() => workerkjeden());
  const b = [0, 1, 2, 3].map(() => spekkjeden());

  let valg = 0;
  const avvik: string[] = [];

  for (let g = 0; g < 3; g++) {
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 44_000_000 + g * 6151);
    let vakt = 0;
    let runde = 0;
    while (s.fase !== "FERDIG" && vakt++ < 20_000 && runde < 3) {
      if (s.fase === "RUNDE_SLUTT") {
        runde++;
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const ha: Handling = a[iTur]!.velgHandling(s);
      const hb: Handling = b[iTur]!.velgHandling(s);
      valg++;
      if (JSON.stringify(ha) !== JSON.stringify(hb)) {
        avvik.push(
          `runde ${s.rundeNr} fase ${s.fase} sete ${iTur}: ` +
            `worker ${JSON.stringify(ha)} mot spek ${JSON.stringify(hb)}`,
        );
      }
      // Spillet drives av WORKERENS valg - det er den som faktisk er utrullet.
      s = utfør(s, ha).state;
    }
  }

  assert.ok(valg >= 80, `for faa valg sammenlignet (${valg}) - testen beviser lite`);
  assert.equal(
    avvik.length,
    0,
    `${avvik.length} av ${valg} valg avvek mellom workerens rekkefoelge og spekens.\n` +
      `Da er den UTRULLEDE boten ikke den samme boten som noen maaling, og hvert\n` +
      `tall i docs/plan.md er maalt paa noe annet enn det familien moeter.\n` +
      avvik.slice(0, 5).join("\n"),
  );
});
