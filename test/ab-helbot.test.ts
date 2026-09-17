/**
 * A/B-DEMOEN (17. sep): arm B i workeren er helbotspeken, og ingenting annet.
 *
 *   1. Workerkjernen (`helbot-init`, `okt:`-utpakkingen, bokvakten) velger det samme som
 *      `lagIndre(<speken>)` per sete på hver beslutning i en hel runde.
 *   2. En runde som aldri ble vist som RUNDE_SLUTT gir en ny bok (`bokbrudd`), ikke en feil.
 *   3. Søkeklienten avviser en kvittering med for lav protokoll, og `stopp()` løser ventende trekk.
 *   4. Speken er den løkka måler, med og uten fartsknottene.
 *
 * Nettene er løkkas (`e1-modell/<navn>-15.bin`) og ligger ikke i git; uten dem hoppes 1–2 over.
 * Fartsknottene er PÅ i prøven for å holde den kort; `examples/ab-avtrykk.ts` kjører begge.
 */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { avtrykk, avtrykkstekst, spillAvtrykk, type Driverkrok } from "../web/ab-driver.ts";
import { FARTSKNOTTER, HELBOT_FILER, helbotSpek, type HelbotSti } from "../web/helbotspek.ts";
import { lagSøkekjerne, type FraWorker } from "../web/sokekjerne.ts";
import { Søkeklient, type Arbeider } from "../web/sokeklient.ts";

const sti = (s: HelbotSti): string => `e1-modell/${s.slice(4, -4)}-15.bin`;
const HAR_NETT = (Object.keys(HELBOT_FILER) as HelbotSti[]).every((s) => existsSync(sti(s)));
const SPEK = helbotSpek(true, sti);

function kjerne(): { krok: Driverkrok; sist: () => FraWorker | null } {
  let svar: FraWorker | null = null;
  const w = lagSøkekjerne((m) => {
    svar = m;
  });
  w({ type: "helbot-init", spek: SPEK, filer: {}, seter: [0, 1, 2, 3], fristMs: null });
  assert.equal((svar as { klar?: boolean } | null)?.klar, true, JSON.stringify(svar));
  assert.equal((svar as { protokoll?: number } | null)?.protokoll, 4);
  let id = 0;
  return {
    sist: () => svar,
    krok: {
      klokke: () => 0,
      nyKamp: () => w({ type: "nyKamp" }),
      slutt: (s) => w({ type: "rundeslutt", state: structuredClone(s) }),
      velg: async (s, sete) => {
        svar = null;
        w({ type: "adams-trekk", id: ++id, state: structuredClone(s), sete });
        const r = svar as FraWorker | null;
        assert.ok(r !== null && "handling" in r, `ikke et trekk: ${JSON.stringify(r)}`);
        return { handling: r.handling, info: { bokbrudd: r.bokbrudd === true } };
      },
    },
  };
}

test("speken er løkkas helbot, og knottene står bakerst i verdensfeltet", () => {
  const uten = helbotSpek(false);
  assert.match(uten, /^okt:vr:max\/vrak\.bin@max\/etterlyst\.bin:telrd:eks:3Lt2000:profil:sik:alle:0\.5:48k32e3LMD~mlbu=max\/tro\.bin:budq:max\/budq\.bin:vakt:abmp:e1:max\/kort\.bin$/);
  assert.equal(helbotSpek(true), uten.replace("~mlbu=max/tro.bin:", `~mlbu=max/tro.bin${FARTSKNOTTER}:`));
});

test("workerkjernen velger identisk med lagIndre per sete (én runde)", { skip: !HAR_NETT && "løkkenettene mangler" }, async () => {
  const seter = [0, 1, 2, 3].map(() => lagIndre(SPEK));
  const ref = await spillAvtrykk([71_000_001], 1, {
    klokke: () => 0,
    nyKamp: () => seter.forEach((a) => a.nyKamp()),
    slutt: (s) => seter.forEach((a) => (a as { observer?(x: GameState): void }).observer?.(s)),
    velg: async (s, sete) => ({ handling: seter[sete]!.velgHandling(s) }),
  });
  const w = await spillAvtrykk([71_000_001], 1, kjerne().krok);
  assert.ok(ref.length > 50, `for få beslutninger (${ref.length})`);
  assert.equal(avtrykk(avtrykkstekst(w)), avtrykk(avtrykkstekst(ref)));
  assert.equal(avtrykkstekst(w), avtrykkstekst(ref));
});

test("en runde uten RUNDE_SLUTT gir ny bok (bokbrudd), ikke en feil", { skip: !HAR_NETT && "løkkenettene mangler" }, async () => {
  const { krok } = kjerne();
  await krok.nyKamp();
  // Spill runde 0 ferdig UTEN å vise workeren rundeslutten, og be så om et trekk i runde 1.
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 71_000_005);
  const agent = lagIndre("vakt:abmp:e1:e1-modell/d7alle.bin");
  for (let v = 0; v < 400 && s.fase !== "RUNDE_SLUTT"; v++) s = utfør(s, agent.velgHandling(s)).state;
  s = utfør(s, { type: "NESTE" }).state;
  const sete = s.iTur!;
  const første = await krok.velg(s, sete);
  assert.equal(første.info?.["bokbrudd"], false, "første trekk i en fersk bok er ikke et brudd");
  // Runde 1 slutter heller ikke synlig; runde 2 skal gi brudd.
  for (let v = 0; v < 400 && s.fase !== "RUNDE_SLUTT"; v++) s = utfør(s, agent.velgHandling(s)).state;
  s = utfør(s, { type: "NESTE" }).state;
  const r = await krok.velg(s, s.fase === "BUDRUNDE" ? s.iTur! : s.budvinner!);
  assert.equal(r.info?.["bokbrudd"], true);
});

test("søkeklienten: for lav protokoll er feil, og stopp() løser ventende trekk", async () => {
  const logg: string[] = [];
  const meldinger: unknown[] = [];
  let påMelding: (d: unknown) => void = () => {};
  const arbeider: Arbeider = {
    postMessage: (m) => meldinger.push(m),
    terminate: () => logg.push("terminert"),
    koble: (m) => {
      påMelding = m;
    },
  };
  const k = new Søkeklient({
    lagArbeider: async () => arbeider,
    kvitteringsfristMs: 60_000,
    trekkfristMs: 60_000,
    maksFristbrudd: 3,
    minProtokoll: 4,
    logg: (t, d) => logg.push(`${t}:${String(d["status"])}`),
  });
  const init = { type: "helbot-init", spek: "x", filer: {}, seter: [1], fristMs: null } as const;
  k.start(init);
  await new Promise((r) => setTimeout(r, 0));
  påMelding({ id: 0, klar: true, protokoll: 3 });
  assert.equal(k.status, "feil");

  k.nyKamp(); // omstart
  await new Promise((r) => setTimeout(r, 0));
  påMelding({ id: 0, klar: true, protokoll: 4 });
  assert.equal(k.status, "klar");
  const s = opprettSpill({ antallSpillere: 4 }, 1);
  const løfte = k.trekk(s, 1);
  k.stopp();
  const svar = await løfte;
  assert.equal(svar.handling, null);
  assert.equal(svar.lag, "feil");
  assert.equal(k.status, "av");
  assert.ok(logg.includes("terminert"));
  // Etter stopp går ingenting til workeren.
  const før = meldinger.length;
  k.rundeSlutt(s);
  k.nyKamp();
  assert.equal(meldinger.length, før);
});
