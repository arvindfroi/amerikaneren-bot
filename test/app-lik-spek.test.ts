/**
 * APPEN SPILLER DEN UTRULLEDE SPEKEN — med appens EGEN oppdeling mellom tråder.
 *
 * `test/utrullet-lik-spek.test.ts` binder `byggUtrullet` til `lagIndre`. Det
 * den ikke ser, er hvordan appen BRUKER byggeren (`docs/gammelkode.md` N2):
 *
 *   – hovedtrådens kjede (`byggAdams(…, medSøk: false)`) tar hvert bud, vrak,
 *     trumfvalg og kortvalg utenfor førersetet
 *   – workerens kjede (`lagSøkekjerne` → `byggAdams(…, medSøk: true)`) tar
 *     BARE førerens kortvalg (`børSøke`)
 *   – ÉTT delt eksemplar av hver fører alle botsetene
 *
 * Hvert lag med tilstand — søkets tilfeldighetsstrøm, vrakrangererens valgte
 * trumf — ser dermed et annet utvalg beslutninger enn i speken. Er noen av dem
 * avhengige av HVILKE beslutninger de har sett, driver appen fra det målte uten
 * at noen annen prøve merker det. Denne prøven spiller oppdelingen mot
 * `lagIndre(<utrullet spek>)` og krever identiske handlinger.
 *
 * ================= KONFIGURASJONEN LESES, DEN SKRIVES IKKE =================
 *
 * Tallene og flaggene leses ut av `web/app.ts`, og vektene er de base64-filene
 * nettleseren faktisk laster ned (`web/dist/*.b64`). Speken bygges fra `ADAMS`
 * (spek-en-kilde: ingen håndskrevne vektstier i prøvene) med appens budmodell og
 * søkelag satt inn. Formen sjekkes mot den utrullede kjeden:
 *
 *   vr:…:telrd : sik:foerer:0.5:24 : budm:bud-menneske.json@-3.0 : vakt:abmp : e1:…
 *
 * `bud-menneske` og ikke `bud-vant` er MED VILJE — se `BUDMODELL` i `web/app.ts`.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState, Handling } from "../src/motor.ts";
import { ADAMS, lagIndre } from "../src/moe2/agentspek.ts";
import type { Velger } from "../src/moe2/utrullet.ts";
import { byggAdams, børSøke, tilBytes, type AdamsKonfig } from "../web/adamskjede.ts";
import { lagSøkekjerne, type FraWorker } from "../web/sokekjerne.ts";

const ROT = join(import.meta.dirname, "..");
const APP = readFileSync(join(ROT, "web", "app.ts"), "utf8");

function konstant(navn: string): string {
  const m = new RegExp(`^const ${navn} = ([^;]+);`, "m").exec(APP);
  assert.ok(m !== null, `fant ikke «const ${navn}» i web/app.ts`);
  return m[1]!.trim();
}
const streng = (navn: string): string => JSON.parse(konstant(navn)) as string;
const tall = (navn: string): number => Number(konstant(navn).replace(/_/g, ""));

const KONFIG: AdamsKonfig = {
  vaktflagg: streng("VAKTFLAGG"),
  vrakflagg: streng("VRAKFLAGG"),
  budterskel: tall("BUDTERSKEL"),
  verdener: tall("SØKVERDENER"),
  sigma: tall("SØKSIGMA"),
};
const BUDMODELL = streng("BUDMODELL");

const VEKTER = {
  kort: readFileSync(join(ROT, "web", "dist", streng("KORTVEKTER")), "utf8"),
  vrak: readFileSync(join(ROT, "web", "dist", streng("VRAKRANGERER")), "utf8"),
  bud: JSON.parse(readFileSync(join(ROT, "e1-modell", BUDMODELL), "utf8")) as unknown,
};

/** `ADAMS` med appens budmodell, og førersøket satt inn under vrakrangereren. */
const budterskelTekst = Number.isInteger(KONFIG.budterskel) ? KONFIG.budterskel.toFixed(1) : String(KONFIG.budterskel);
const SPEK = ADAMS.replace(/[\w-]+\.json@-?[\d.]+:/, `${BUDMODELL}@${budterskelTekst}:`).replace(
  /:budm:/,
  `:sik:foerer:${KONFIG.sigma}:${KONFIG.verdener}:budm:`,
);

test("speken er den utrullede kjeden, og appens vekter er spekens bytes", () => {
  assert.match(
    SPEK,
    /^vr:e1-modell\/[\w-]+\.bin:telrd:sik:foerer:0\.5:24:budm:e1-modell\/bud-menneske\.json@-3\.0:vakt:abmp:e1:e1-modell\/[\w-]+\.bin$/,
    `ikke den utrullede kjeden: ${SPEK}`,
  );
  // Det nettleseren laster ned og det speken leser fra disk MÅ være de samme
  // bytene — ellers sammenlikner prøven to ulike bots og er grønn av flaks.
  const [, vrakSti] = /^vr:([^:]+):/.exec(SPEK)!;
  const [, kortSti] = /:e1:(.+)$/.exec(SPEK)!;
  assert.deepEqual(tilBytes(VEKTER.kort), new Uint8Array(readFileSync(join(ROT, kortSti!))));
  assert.deepEqual(tilBytes(VEKTER.vrak), new Uint8Array(readFileSync(join(ROT, vrakSti!))));
});

/**
 * Spiller `runder` runder. Speken driver spillet; appen må svare likt på hvert
 * eneste beslutningspunkt, med hovedtråd og worker delt slik `fortsett()` deler.
 */
function spillApp(frø: number, runder: number): { valg: number; søk: number } {
  const hovedtråd = byggAdams(VEKTER, KONFIG, false).agent;

  let svar: FraWorker | null = null;
  const worker = lagSøkekjerne((m) => {
    svar = m;
  });
  worker({ type: "adams-init", ...VEKTER, tro: null, ...KONFIG });
  assert.equal((svar as { klar?: boolean } | null)?.klar, true, `workeren kvitterte ikke: ${JSON.stringify(svar)}`);

  // ÉTT delt eksemplar, som i appen. Speken får det samme, så søkets
  // tilfeldighetsstrøm går i samme takt på begge sider.
  const spek = lagIndre(SPEK) as unknown as Velger;

  // N5: ny kamp når begge trådene.
  hovedtråd.nyKamp();
  worker({ type: "nyKamp" });
  spek.nyKamp();

  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let valg = 0;
  let søk = 0;
  let id = 0;
  for (let vakt = 0; vakt < 20_000 && s.fase !== "FERDIG" && s.rundeNr < runder; vakt++) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (aktør === null || aktør === undefined) break;

    const fasit: Handling = spek.velgHandling(s);
    let app: Handling;
    if (børSøke(s, aktør, KONFIG.verdener)) {
      svar = null;
      // `structuredClone` er det `postMessage` gjør med stillingen.
      worker({ type: "adams-trekk", id: ++id, state: structuredClone(s), sete: aktør });
      const r = svar as FraWorker | null;
      assert.ok(r !== null && "handling" in r, `workeren svarte ikke med et trekk: ${JSON.stringify(r)}`);
      app = r.handling;
      søk++;
    } else {
      app = hovedtråd.velgHandling(s);
    }
    assert.deepEqual(
      app,
      fasit,
      `divergens i runde ${s.rundeNr}, fase ${s.fase}, sete ${aktør} etter ${valg} valg ` +
        `(${børSøke(s, aktør, KONFIG.verdener) ? "worker" : "hovedtråd"})`,
    );
    valg++;
    s = utfør(s, fasit).state;
  }
  return { valg, søk };
}

test("appens oppdeling (hovedtråd + worker) velger identisk med den utrullede speken", () => {
  let valg = 0;
  let søk = 0;
  for (const frø of [61_200_001, 61_200_002, 61_200_003]) {
    const r = spillApp(frø, 2);
    valg += r.valg;
    søk += r.søk;
  }
  assert.ok(valg > 150, `for få valg sammenlignet (${valg}) – prøven beviser ingenting`);
  assert.ok(søk > 30, `for få førertrekk gjennom workeren (${søk}) – søkeveien er ikke prøvd`);
});
