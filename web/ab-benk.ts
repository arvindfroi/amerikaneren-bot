/**
 * ============ BENKEN FOR ARM B I NETTLESEREN (A/B-demoen, 17. sep) ============
 *
 *   ab-benk.html?frø=71000001,71000002&runder=2&frist=av&simd=1&fart=0&kilde=dist/
 *
 * Laster den EKTE workeren (`dist/worker.js`) og helbotens filer, spiller helboten mot seg
 * selv på alle fire seter med `web/ab-driver.ts`, og skriver avtrykket og tidene. Samme
 * frø og `frist=av` skal gi nøyaktig avtrykket fra `node examples/ab-avtrykk.ts --arm B`.
 * Med `frist=1100` måles tiden slik familien får den (nødbremsen på).
 *
 * Logger ingenting til basen. `kilde` er der `.b64`-filene hentes (standard `dist/`; på
 * nett valens adresse).
 */

import type { GameState, Handling } from "../src/motor.ts";
import { avtrykk, avtrykkstekst, spillAvtrykk, tidstabell, type Beslutning } from "./ab-driver.ts";
import { FART_PÅ, HELBOT_FILER, HELBOT_FRIST_MS, helbotSpek, type HelbotSti } from "./helbotspek.ts";
import { lagSøkekjerne, type FraWorker, type TilWorker } from "./sokekjerne.ts";

const q = new URLSearchParams(location.search);
const FRØ = (q.get("frø") ?? "71000001,71000002").split(",").map(Number);
const RUNDER = Number(q.get("runder") ?? "2");
const FRIST = q.get("frist") ?? "av";
const FRIST_MS = FRIST === "av" ? null : FRIST === "app" ? HELBOT_FRIST_MS : Number(FRIST);
const UTEN_SIMD = q.get("simd") === "0";
const FART = q.get("fart") === null ? FART_PÅ : q.get("fart") === "1";
const KILDE = q.get("kilde") ?? "dist/";
/**
 * `traad=side`: den SAMME meldingskjernen kjøres på sidens hovedtråd i stedet for i en worker.
 * Bare til treg-enhet-benken: Chromes CPU-struping (`Emulation.setCPUThrottlingRate`) virker
 * bare på sider, ikke på dedikerte workere. Svarene leveres asynkront, som over `postMessage`.
 */
const PÅ_SIDEN = q.get("traad") === "side";

const utEl = document.getElementById("ut")!;
const linje = (t: string): void => {
  utEl.textContent += `${t}\n`;
};

async function hent(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

async function kjør(): Promise<void> {
  const tLast = performance.now();
  const kode = PÅ_SIDEN ? "" : await hent("dist/worker.js");
  const filer: Record<string, string> = {};
  let byte = 0;
  for (const [sti, navn] of Object.entries(HELBOT_FILER) as [HelbotSti, string][]) {
    const t = (await hent(KILDE + navn)).trim();
    if (t.startsWith("<")) throw new Error(`${navn} er HTML, ikke base64`);
    filer[sti] = t;
    byte += t.length;
  }
  const lastMs = performance.now() - tLast;
  linje(`nedlasting: ${(byte / 1e6).toFixed(1)} MB base64 på ${Math.round(lastMs)} ms`);

  const w: { onmessage: ((e: MessageEvent<FraWorker>) => void) | null; postMessage(m: TilWorker): void; terminate(): void } = PÅ_SIDEN
    ? (() => {
        const skall = {
          onmessage: null as ((e: MessageEvent<FraWorker>) => void) | null,
          postMessage: (m: TilWorker): void => {
            setTimeout(() => kjerne(structuredClone(m)), 0);
          },
          terminate: (): void => {},
        };
        const kjerne = lagSøkekjerne((m) => setTimeout(() => skall.onmessage?.({ data: m } as MessageEvent<FraWorker>), 0));
        return skall;
      })()
    : new Worker(URL.createObjectURL(new Blob([kode], { type: "text/javascript" })));
  const ventende = new Map<number, (m: FraWorker) => void>();
  let kvittering: ((m: FraWorker) => void) | null = null;
  w.onmessage = (e: MessageEvent<FraWorker>) => {
    const m = e.data;
    if ("klar" in m) {
      kvittering?.(m);
      return;
    }
    ventende.get(m.id)?.(m);
    ventende.delete(m.id);
  };
  const send = (m: TilWorker): void => w.postMessage(m);

  const tInit = performance.now();
  const kv = await new Promise<FraWorker>((løs) => {
    kvittering = løs;
    send({ type: "helbot-init", spek: helbotSpek(FART), filer, seter: [0, 1, 2, 3], fristMs: FRIST_MS, utenSimd: UTEN_SIMD });
  });
  linje(`kvittering etter ${Math.round(performance.now() - tInit)} ms: ${JSON.stringify(kv)}`);
  if (!("klar" in kv) || kv.klar !== true) throw new Error("helboten ble ikke bygd");

  let id = 0;
  const t0 = performance.now();
  const b: Beslutning[] = await spillAvtrykk(FRØ, RUNDER, {
    klokke: () => performance.now(),
    nyKamp: () => send({ type: "nyKamp" }),
    slutt: (s: GameState) => send({ type: "rundeslutt", state: s }),
    velg: (s: GameState, sete: number) =>
      new Promise<{ handling: Handling; info?: Record<string, unknown> }>((løs, avvis) => {
        const mid = ++id;
        ventende.set(mid, (m) => {
          if ("handling" in m) {
            løs({ handling: m.handling, info: { wms: m.ms, n: m.n, nb: m.nødbrems === true, bb: m.bokbrudd === true } });
          } else avvis(new Error(JSON.stringify(m)));
        });
        send({ type: "adams-trekk", id: mid, state: s, sete });
      }),
  }, (x) => {
    if (x.fase === "SPILL" && x.ms > 1500) linje(`  tregt: kamp ${x.kamp} runde ${x.runde} sete ${x.sete} ${Math.round(x.ms)} ms`);
  });
  const tekst = avtrykkstekst(b);
  const nødbrems = b.filter((x) => x.info?.["nb"] === true).length;
  const res = {
    nettleser: navigator.userAgent,
    fart: FART,
    frist: FRIST_MS,
    utenSimd: UTEN_SIMD,
    tråd: PÅ_SIDEN ? "side" : "worker",
    simd: (kv as { simd?: boolean }).simd,
    frø: FRØ,
    runder: RUNDER,
    antall: b.length,
    avtrykk: avtrykk(tekst),
    sekunder: Math.round((performance.now() - t0) / 100) / 10,
    nødbrems,
    tider: tidstabell(b),
    lastMs: Math.round(lastMs),
    byggMs: (kv as { ms?: number }).ms,
  };
  linje(JSON.stringify(res, null, 1));
  (globalThis as unknown as Record<string, unknown>)["abResultat"] = { ...res, tekst, beslutninger: b };
  document.title = `ferdig ${res.avtrykk}`;
  w.terminate();
}

kjør().catch((e: unknown) => {
  linje(`FEIL: ${String(e)}`);
  document.title = "feil";
  (globalThis as unknown as Record<string, unknown>)["abResultat"] = { feil: String(e) };
});
