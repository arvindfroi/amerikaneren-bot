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
  // `sokekjerne.ts` står bare med workeren: appen importerer bare TYPER derfra,
  // og de forsvinner i bunten.
  ["web/worker.ts", "web/dist/worker.js"],
  ["web/adamskjede.ts", "web/dist/worker.js"],
  ["web/sokekjerne.ts", "web/dist/worker.js"],
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
