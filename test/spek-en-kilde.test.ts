/**
 * ÉN KILDE TIL «HVILKEN BOT ER BOTEN» — håndhevet, ikke lovet.
 *
 * ================= FEILKLASSEN DENNE FILA LUKKER ========================
 *
 * Prosjektets mest gjentatte feil er at «det målte» og «det utrullede» ikke var
 * samme bot. `docs/plan.md` §118 teller **fjorten** forekomster, og
 * `test/utrullet-lik-spek.test.ts` lister dem: budmodellen som pekte på
 * `bud-gbt` i appen og `bud-vant` på benken, **vaktflagget som manglet `f`**,
 * trosnettet appen laster ned og workeren aldri leser.
 *
 * `utrullet-lik-spek` fanger den siste milen: at byggeren og spekstrengen
 * velger identisk. Denne fila står ett hakk lenger ute og spør hvor
 * spekstrengen kommer fra i det hele tatt.
 *
 * ================= HVORFOR EN SPERRE OG EN SKRALLE, IKKE ET OPPRYDD ======
 *
 * 71 filer under `examples/` og `test/` bygger spekstrengen for hånd. Det er
 * FRISTENDE å skrive dem om til å importere `ADAMS`, og det ville vært galt:
 * en gammel benk sin hardkodede spek er **data**. Den forteller hva den
 * kjøringen faktisk målte. Bytter vi den til dagens `ADAMS`, endrer vi
 * stilltiende hva de historiske tallene betyr — nøyaktig den feilen resten av
 * fila finnes for å hindre.
 *
 * Derfor to regler med ulik hardhet:
 *
 *   SPERRE   `src/` og `web/` — produktkoden — får ikke hardkode vektnavnene
 *            i det hele tatt. Bare `agentspek.ts`, som ER kilden. Denne
 *            regelen er oppfylt i dag, og trenger ingen liste.
 *
 *   SKRALLE  `examples/` og `test/` måler mot en innsjekket liste. En NY fil
 *            på lista er en feil (importer fra `agentspek` i stedet). En fil
 *            som er ryddet MÅ tas ut av lista. Skrallen går bare én vei, og
 *            lista kan derfor ikke bli foreldet slik `docs/gammelkode.md`
 *            ble.
 */

import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ADAMS, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { STAKKER } from "../examples/matrise.ts";

const ROT = fileURLToPath(new URL("..", import.meta.url));

/**
 * De to vektfilene som bare finnes inne i en spekstreng.
 *
 * Mønsteret settes sammen av biter med vilje: skrevet som ett literal ville
 * DENNE fila inneholdt navnene, og skrallen ville meldt seg selv som en ny
 * håndbygd spek. Alternativet — å gjøre et unntak for filnavnet her — ville
 * skjult en ekte spek om noen la en inn i vakten senere.
 */
const VEKTNAVN = new RegExp(["vrakrang", "d7alle"].map((n) => `${n}\\.bin`).join("|"));

/**
 * `bud-vant.json` er MED VILJE ikke på lista over: `web/app.ts` nevner den som
 * et NEDLASTINGSNAVN (den hentes over HTTP fra CDN-en), ikke som et ledd i en
 * spek. En regel som slo på den ville meldt feil på en helt legitim bruk, og en
 * vakt som melder feil på riktig kode blir slått av.
 */

function tsFiler(mappe: string): string[] {
  const ut: string[] = [];
  const gaa = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) gaa(p);
      else if (p.endsWith(".ts")) ut.push(p);
    }
  };
  gaa(resolve(ROT, mappe));
  return ut;
}

const hardkoder = (f: string): boolean => VEKTNAVN.test(readFileSync(f, "utf8"));

/**
 * Repo-relativ sti med `/` på ALLE plattformer. `relative()` gir `\` på
 * Windows, og både unntaket for `agentspek.ts` og lista i
 * `spek-hardkodet-tillatt.txt` er skrevet med `/`. Uten dette var begge
 * reglene røde på laptopen treningen kjører på: SPERRE meldte kilden selv, og
 * SKRALLE meldte alle 71 tillatte filer som «nye» — målt 2026-09-10.
 */
const repoSti = (f: string): string => relative(ROT, f).split(sep).join("/");

test("SPERRE: bare agentspek.ts hardkoder vektnavnene i src/ og web/", () => {
  const brudd = [...tsFiler("src"), ...tsFiler("web")]
    .filter(hardkoder)
    .map(repoSti)
    .filter((f) => f !== "src/moe2/agentspek.ts")
    .sort();

  assert.deepEqual(
    brudd,
    [],
    `Disse filene i produktkoden bygger en spek for haand:\n  ${brudd.join("\n  ")}\n` +
      `Importer ADAMS / ADAMS_MAALT fra src/moe2/agentspek.ts i stedet. ` +
      `To definisjoner av den utrullede boten kan komme i utakt, og det har de ` +
      `gjort fjorten ganger (docs/plan.md §118).`,
  );
});

test("SKRALLE: ingen NYE haandbygde speker i examples/ og test/", () => {
  const naa = [...tsFiler("examples"), ...tsFiler("test")]
    .filter(hardkoder)
    .map(repoSti)
    .sort();

  const tillatt = readFileSync(resolve(ROT, "test/spek-hardkodet-tillatt.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const nye = naa.filter((f) => !tillatt.includes(f));
  const ryddede = tillatt.filter((f) => !naa.includes(f));

  assert.deepEqual(
    nye,
    [],
    `NYE filer bygger spekstrengen for haand:\n  ${nye.join("\n  ")}\n` +
      `Importer fra src/moe2/agentspek.ts i stedet for aa skrive vektstiene paa nytt.`,
  );

  assert.deepEqual(
    ryddede,
    [],
    `Disse staar paa lista men hardkoder ikke lenger:\n  ${ryddede.join("\n  ")}\n` +
      `Ta dem ut av test/spek-hardkodet-tillatt.txt. Skrallen gaar bare en vei, ` +
      `og en liste som ikke krymper blir foreldet uten at noen merker det.`,
  );
});

/**
 * N3 FRA `docs/gammelkode.md`, PINNET.
 *
 * `examples/matrise.ts` kalte `rask` «den utrullede boten i dag». Den er det
 * ikke: den er `ADAMS_MAALT`, som skiller seg fra utrullede `ADAMS` på ett
 * tegn — vaktflagget `abmpf` mot `abmp`. §118s hovedtall hvilte på den
 * påstanden.
 *
 * Strengen er beholdt uendret (alle tidligere matrise-tall er målt med den);
 * det som er rettet er navnet og påstanden. Denne testen holder de to fra å
 * gli sammen igjen.
 */
test("matrise-armen «rask» ER det maalte, IKKE det utrullede", () => {
  assert.equal(STAKKER.rask, ADAMS_MAALT, "«rask» skal vaere ADAMS_MAALT");
  assert.notEqual(STAKKER.rask, ADAMS, "«rask» er IKKE den utrullede boten");
  // Og forskjellen er nøyaktig den ene f-en, ikke noe mer som har sneket seg inn.
  assert.equal(ADAMS_MAALT.replace("vakt:abmpf:", "vakt:abmp:"), ADAMS);
});
