/**
 * BUNTEN SKAL IKKE LIGGE BAK KILDEN — håndhevet, ikke husket.
 *
 * ================= FUNNET DENNE FILA GJØR TIL EN RØD TEST ===============
 *
 * `docs/gammelkode.md` N1, «det viktigste funnet i revisjonen»:
 *
 *     src/moe2/utrullet.ts       8. aug 03:49
 *     web/worker.ts              8. aug 17:24
 *     web/dist/worker.js         6. aug 04:48   <-- 57 commits bak
 *
 * Commiten het «Workeren bruker naa byggUtrullet - duplikatkjeden er borte».
 * Duplikatkjeden var borte i KILDEN. Artefakten familien faktisk møtte var
 * fortsatt den håndbygde, i 57 commits, uten at noe krasjet.
 *
 * ================= HVORFOR AKKURAT DENNE VAKTEN MANGLET =================
 *
 * Prosjektet har allerede to vakter på nabolaget, og ingen av dem ser dette:
 *
 *   `utrullet-lik-spek.test.ts`   byggeren og spekstrengen velger identisk
 *   `spek-en-kilde.test.ts`       spekstrengen har én kilde
 *
 * Begge leser KILDEN. Ingen av dem åpner `web/dist/`. En bunt som er bygd fra
 * en eldre kilde består derfor begge to med glans — den er internt konsistent,
 * bare foreldet. Det er det siste av de fjorten «målt ≠ utrullet»-tilfellene
 * som fortsatt kunne gjenta seg uoppdaget.
 *
 * ================= HVA DEN MÅLER, OG HVA DEN IKKE GJØR =================
 *
 * Den spør git: finnes det commits som rører kilden ETTER den siste commiten
 * som rørte bunten? I så fall er bunten bak, og det er nøyaktig N1.
 *
 * Den kan IKKE se en kilde som er endret men ikke committet — da har git
 * ingenting å gå på. Den fanger deg i det øyeblikket du committer kilden uten
 * bunten, altså før push og før utrulling, og det er tidsnok.
 *
 * Bevisst IKKE gjort: å bygge på nytt i testen og sammenlikne bytene. Det ville
 * vært sterkere, men esbuild-utdata endrer seg mellom versjoner, og en vakt som
 * roper ulv hver gang noen oppgraderer en dev-avhengighet blir slått av. En
 * vakt som blir slått av er verre enn ingen vakt.
 */

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = fileURLToPath(new URL("..", import.meta.url));

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: ROT, encoding: "utf8" }).trim();

/**
 * Kilde → bunt. Begge bygges av `npm run bygg-web` (`verktoy/bygg-web.mjs`).
 *
 * De delte modulene i `web/` står med HVER bunt som importerer dem. Uten det
 * kunne `web/sokeklient.ts` endres og committes uten ny `app.js`, og vakten
 * ville vært grønn — N1 i ny drakt, med kilden flyttet ut av fila vakten så på.
 */
const PAR: readonly (readonly [string, string])[] = [
  ["web/app.ts", "web/dist/app.js"],
  ["web/adamskjede.ts", "web/dist/app.js"],
  ["web/sokeklient.ts", "web/dist/app.js"],
  ["web/tempo.ts", "web/dist/app.js"],
  // `sokekjerne.ts` står bare med workeren: appen importerer bare TYPER derfra,
  // og de forsvinner i bunten.
  ["web/worker.ts", "web/dist/worker.js"],
  ["web/adamskjede.ts", "web/dist/worker.js"],
  ["web/sokekjerne.ts", "web/dist/worker.js"],
  // A/B-demoen (17. sep): arm B bor i workeren, konstantene deles med appen og benken.
  ["web/helbot.ts", "web/dist/worker.js"],
  // `helbotspek.ts` står IKKE med workeren. Workeren får speken og filnavnene i
  // `helbot-init`-meldingen fra appen og importerer aldri fila (se prøven under, som
  // holder det sant). Paret sto her fra 17. sep og var feil: v17 endret `helbotspek.ts`
  // (fristen 1,1 → 3 s) uten å endre `worker.js` med en byte — den kan ikke endres av
  // noe som ikke er i den — og vakten sto rød fra da av. En vakt som roper ulv på hver
  // commit blir slått av; derfor er paret borte, og grafen sjekkes i stedet.
  ["web/helbotspek.ts", "web/dist/app.js"],
  ["web/helbotspek.ts", "web/dist/ab-benk.js"],
  ["web/nettleser/fs.ts", "web/dist/worker.js"],
  ["web/nettleser/path.ts", "web/dist/worker.js"],
  ["web/ab-benk.ts", "web/dist/ab-benk.js"],
  ["web/ab-driver.ts", "web/dist/ab-benk.js"],
  ["web/sokekjerne.ts", "web/dist/ab-benk.js"],
  ["web/helbot.ts", "web/dist/ab-benk.js"],
];

for (const [kilde, bunt] of PAR) {
  test(`«${bunt}» er ikke bygd fra en eldre «${kilde}»`, () => {
    // Ingen stille hopp om git mangler: dette ER et git-repo, og et hopp her
    // ville vaert nettopp den slags stillhet vakten finnes for aa fjerne.
    const buntCommit = git("log", "-1", "--format=%H", "--", bunt);
    assert.notEqual(buntCommit, "", `fant ingen commit som roerer ${bunt}`);

    const etter = git("log", "--format=%h %s", `${buntCommit}..HEAD`, "--", kilde)
      .split("\n")
      .filter((l) => l.length > 0);

    assert.deepEqual(
      etter,
      [],
      `«${kilde}» er endret i ${etter.length} commit(s) etter at «${bunt}» sist ble bygd:\n` +
        `  ${etter.join("\n  ")}\n\n` +
        `Familien moeter bunten, ikke kilden. Bygg den paa nytt og ta med begge i samme commit:\n` +
        `  npx esbuild ${kilde} --bundle --format=esm --charset=utf8 --minify --outfile=${bunt}\n\n` +
        `Dette er gammelkode.md N1, som lot duplikatkjeden leve i produksjon i 57 commits.`,
    );
  });
}

/**
 * PARLISTA OVER påstår at `worker.js` ikke avhenger av `web/helbotspek.ts`. Blir det usant —
 * importerer noen i workerkjeden fila en dag — må paret inn i `PAR` igjen, ellers er vakten
 * blind for nettopp N1. Denne prøven er det som gjør fjerningen trygg: den leser importgrafen.
 */
const grafFra = (start: string): Set<string> => {
  const sett = new Set<string>();
  const kø = [start];
  while (kø.length > 0) {
    const fil = kø.pop()!;
    if (sett.has(fil)) continue;
    sett.add(fil);
    let kode: string;
    try {
      kode = readFileSync(join(ROT, fil), "utf8");
    } catch {
      continue; // ikke en fil i repoet (node:*, pakker)
    }
    for (const m of kode.matchAll(/(?:import|export)[^;]*?from\s*"(\.[^"]+)"/g)) {
      kø.push(relative(ROT, resolve(join(ROT, fil), "..", m[1]!)).split("\\").join("/"));
    }
  }
  return sett;
};

test("workerens importgraf inneholder IKKE web/helbotspek.ts (derfor er paret ute av PAR)", () => {
  const graf = grafFra("web/worker.ts");
  assert.ok(graf.has("web/sokekjerne.ts"), `grafen ble ikke lest: ${graf.size} filer`);
  assert.ok(graf.has("web/helbot.ts"), "fant ikke web/helbot.ts — leseren er for svak");
  assert.ok(
    !graf.has("web/helbotspek.ts"),
    "workeren importerer nå web/helbotspek.ts. Legg paret [\"web/helbotspek.ts\", \"web/dist/worker.js\"] " +
      "tilbake i PAR over, ellers kan en endring der bli committet uten ny worker.js.",
  );
});

test("importleseren KAN finne fila — appens graf har web/helbotspek.ts", () => {
  assert.ok(grafFra("web/app.ts").has("web/helbotspek.ts"), "leseren finner den ikke der den ER, og beviser ingenting");
});
