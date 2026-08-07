/**
 * ROLLENAVN — feilen som allerede har kostet en hel kveld.
 *
 * Fra lista over prosjektets mest gjentatte feil:
 *
 *   «gate2 skrev «foerer», leseren leste «fører» → førerraden usynlig i ALLE
 *    rapporter en hel kveld»
 *
 * ================= DET FINNES TRE VOKABULARER, OG DET ER GREIT ==========
 *
 * Første utkast av denne testen forbød alt annet enn «foerer/forsvar» og fant
 * 13 «feil». De var ikke feil. MesterAI-analysene bruker et FULLSTENDIG og
 * internt konsistent tredje vokabular, der hver fil selv erklærer
 * `type Rolle = "spillefører" | "makker" | "forsvarer"` og sammenlikner mot det
 * hele veien. Å døpe dem om ville brutt lagrede `.jsonl`-filer uten å vinne
 * noe.
 *
 * Og de to `Rolle`-typene i `src/` er ulike med vilje:
 *
 *   `src/moe2/rolleorakel.ts`        "foerer" | "makker" | "forsvar"
 *   `src/moe2/eksperter/felles.ts`   "fører"  | "makker" | "forsvar"
 *
 * TypeScript verner INNENFOR hvert delsystem: unionstypen gjør en feilstavet
 * rolle til en kompileringsfeil så lenge man holder seg på én side. Å slå dem
 * sammen ville krevd å døpe om ekspertnavn («spill-fører») som står i lagrede
 * rapporter.
 *
 * **Variasjon på tvers av delsystemer er altså ikke defekten.**
 *
 * ================= DEFEKTEN ER BLANDING INNAD I ÉN FIL ==================
 *
 * `examples/regrbro.ts` skrev «foerer» (familie A) sammen med «forsvarer»
 * (familie C) — i samme objekt, til samme fil. Det er nøyaktig formen feilen
 * som kostet en hel kveld hadde: to halvdeler av to ulike vokabularer, hver
 * for seg riktige.
 *
 * Faren ligger ved GRENSENE, der en rollestreng skrives til fil og leses av et
 * annet verktøy. Ingen typesjekk krysser en `.jsonl`.
 *
 * Testen krever derfor at hver fil holder seg til ÉN familie, og at ingen
 * fjerde oppstår.
 */

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { rolleFor as rolleOrakel } from "../src/moe2/rolleorakel.ts";
import { rolleFor as rolleEkspert } from "../src/moe2/eksperter/felles.ts";

const ROT = join(import.meta.dirname, "..");

const FAMILIER: Record<string, ReadonlySet<string>> = {
  "A (rolleorakel/gate2)": new Set(["foerer", "makker", "forsvar"]),
  "B (eksperter)": new Set(["fører", "makker", "forsvar"]),
  "C (mesterai-analysene)": new Set(["spillefører", "makker", "forsvarer"]),
};

/** Alt som ser ut som et rollenavn, uansett staving. */
const ROLLEAKTIG = /^(spillef[oø]e?rer|f[oø]e?rer|forsvar(?:er|ende)?|makker|medspiller)$/i;

function tsFiler(kat: string): string[] {
  const ut: string[] = [];
  for (const e of readdirSync(kat, { withFileTypes: true })) {
    const p = join(kat, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      ut.push(...tsFiler(p));
    } else if (e.name.endsWith(".ts")) ut.push(p);
  }
  return ut;
}

/**
 * Rolleaktige strengliteraler på TILORDNINGSSTEDER — linjer som setter et
 * `rolle`-felt.
 *
 * DET ER DEN PRESISE GRENSEN, og den er valgt etter at et bredere utkast ga
 * fire treff der bare ETT var ekte. De tre andre var internt vokabular som
 * aldri krysser en filgrense: et `--rolle`-flagg på kommandolinjen, en
 * `console.log("FORSVAR")`-overskrift, en lokal type brukt til skjermutskrift.
 * Å døpe om dem hadde vært støy uten gevinst, og en test som maser om støy
 * blir slått av.
 *
 * Den ekte var `examples/regresjonsdata.ts`, som skrev «foerer» sammen med
 * «forsvarer» i SAMME objekt til en `.jsonl`. Ingen typesjekk krysser en
 * `.jsonl`, og det er nøyaktig der feilen som kostet en hel kveld levde.
 */
function rolleordIFil(f: string): Map<string, number> {
  const ut = new Map<string, number>();
  const linjer = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < linjer.length; i++) {
    const l = linjer[i]!;
    const t = l.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
    if (!/\brolle\s*:/.test(l)) continue;
    for (const m of l.matchAll(/"([^"]{4,14})"/g)) {
      const o = m[1]!;
      if (ROLLEAKTIG.test(o) && !ut.has(o)) ut.set(o, i + 1);
    }
  }
  return ut;
}

test("ingen fil BLANDER to rollevokabularer", () => {
  const funn: string[] = [];
  for (const kat of ["src", "examples", "web"]) {
    for (const f of tsFiler(join(ROT, kat))) {
      const ord = rolleordIFil(f);
      if (ord.size === 0) continue;
      const passer = Object.values(FAMILIER).filter((sett) =>
        [...ord.keys()].every((o) => sett.has(o)),
      );
      if (passer.length === 0) {
        const detalj = [...ord.entries()].map(([o, n]) => `"${o}" (linje ${n})`).join(", ");
        funn.push(`${f.slice(ROT.length + 1)}: ${detalj}`);
      }
    }
  }
  const familieliste = Object.entries(FAMILIER)
    .map(([n, s]) => `  ${n}: ${[...s].join(", ")}`)
    .join("\n");
  assert.equal(
    funn.length,
    0,
    [
      "Filer som BLANDER rollevokabularer, eller bruker et FJERDE.",
      "Prosjektet mistet en hel kveld paa at gate2 skrev «foerer» mens leseren",
      "leste «fører». regrbro.ts skrev «foerer» sammen med «forsvarer» - to",
      "halvdeler av to vokabularer, hver for seg riktige.",
      "Velg ÉN familie per fil:",
      familieliste,
      "",
      ...funn,
    ].join("\n"),
  );
});

test("de to rolleFor-funksjonene er fortsatt ULIKE paa den dokumenterte maaten", () => {
  // Endres én av dem i stillhet, skal det bli synlig her og ikke i en rapport.
  const state = {
    budvinner: 1,
    makker: 2,
    fase: "SPILL",
  } as unknown as Parameters<typeof rolleOrakel>[0];

  assert.equal(rolleOrakel(state, 1), "foerer", "rolleorakel har endret staving");
  assert.equal(rolleEkspert(state, 1), "fører", "eksperter har endret staving");
  assert.equal(rolleOrakel(state, 2), "makker");
  assert.equal(rolleEkspert(state, 2), "makker");
  assert.equal(rolleOrakel(state, 3), "forsvar");
  assert.equal(rolleEkspert(state, 3), "forsvar");
});

test("rolleorakel svarer null uten budvinner - eksperten gjoer IKKE", () => {
  /**
   * DEN ANDRE FORSKJELLEN, som er lettere å overse enn stavingen.
   *
   * `rolleorakel.rolleFor` returnerer `null` når ingen har vunnet budrunden.
   * `eksperter.rolleFor` sjekker ikke, og faller gjennom til "forsvar" — den
   * merker altså en stilling FØR budrunden som forsvar.
   *
   * Innenfor ekspertsystemet er det ufarlig: `portvakt` sender bare
   * spillestillinger dit. Men det er en fallgruve for enhver som ser to
   * likelydende funksjoner og antar at de er utbyttbare.
   */
  const førBud = { budvinner: null, makker: null, fase: "BUDRUNDE" } as unknown as Parameters<
    typeof rolleOrakel
  >[0];
  assert.equal(rolleOrakel(førBud, 0), null, "rolleorakel skal si null uten budvinner");
  assert.equal(
    rolleEkspert(førBud, 0),
    "forsvar",
    "eksperten faller gjennom til forsvar - dokumentert, men ikke det samme som null",
  );
});
