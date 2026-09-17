/**
 * TREG ENHET (18. sep): helboten i nettleseren med CPU-struping, frist mot frist.
 *
 *   node examples/spill-lokal.ts --port 8793 &
 *   node examples/treg-enhet.mjs [--rate 10] [--frister 1100,3000] [--frø 71000003,71000004] [--runder 1]
 *
 * Kjører `web/ab-benk.html` (den ekte `dist/worker.js`, S1 som i v16/v17) i Playwright-Chromium med
 * `Emulation.setCPUThrottlingRate`. Chrome struper bare SIDER, ikke dedikerte workere («Operation is only
 * supported for pages»), så benken kjører workerkjernen på sidens hovedtråd (`traad=side`). Skriver median, p90,
 * maks og nødbremsandel for kortvalgene per frist. Logger ingenting (benken poster ingenting).
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const arg = (n, s) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RATE = Number(arg("--rate", "10"));
const FRISTER = arg("--frister", "1100,3000").split(",");
const FRØ = arg("--frø", "71000003,71000004");
const RUNDER = arg("--runder", "1");
/** `side` (standard): kjernen på sidens hovedtråd, der strupingen virker. `worker`: som appen. */
const TRÅD = arg("--traad", "side");
const URL0 = arg("--url", "http://localhost:8793/");
const UT = arg("--ut", "D:/amb-grp/loop/ab-demo/treg-enhet.json");

const PORT = 9335;
const nettleser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
const lukk = [];
const alle = [];
for (const frist of FRISTER) {
  const ctx = await nettleser.newContext();
  const side = await ctx.newPage();
  const cdp = await ctx.newCDPSession(side);
  let workerStrupt = 0;
  let workerSvar = "";
  if (RATE > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    // WORKEREN har sin egen tråd. Playwrights CDP-økt kan ikke adressere en flat underøkt, så
    // strupingen sendes over en RÅ websocket til sidens mål (`--remote-debugging-port`), med
    // `flatten: true` og `sessionId` på meldingen.
    const mål = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const side0 = mål.find((m) => m.type === "page" && m.url === "about:blank") ?? mål.find((m) => m.type === "page");
    const ws = new WebSocket(side0.webSocketDebuggerUrl);
    await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
    let id = 1000;
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Target.attachedToTarget" && m.params.targetInfo.type === "worker") {
        ws.send(JSON.stringify({ id: ++id, sessionId: m.params.sessionId, method: "Emulation.setCPUThrottlingRate", params: { rate: RATE } }));
        ws.send(JSON.stringify({ id: ++id, sessionId: m.params.sessionId, method: "Runtime.runIfWaitingForDebugger" }));
        workerStrupt++;
      } else if (m.sessionId !== undefined && m.id !== undefined) {
        workerSvar += JSON.stringify(m.error ?? m.result ?? {}).slice(0, 120) + " ";
      }
    });
    ws.send(JSON.stringify({ id: 1, method: "Target.setAutoAttach", params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true } }));
    lukk.push(() => ws.close());
  }
  const t0 = Date.now();
  await side.goto(`${URL0}ab-benk.html?frø=${FRØ}&runder=${RUNDER}&frist=${frist}&traad=${TRÅD}`);
  await side.waitForFunction(() => globalThis.abResultat !== undefined, null, { timeout: 30 * 60_000, polling: 2000 });
  const r = await side.evaluate(() => globalThis.abResultat);
  for (const f of lukk.splice(0)) f();
  await ctx.close();
  if (r.feil) throw new Error(r.feil);
  const kort = r.beslutninger.filter((b) => b.fase === "SPILL");
  const ms = kort.map((b) => b.ms).sort((a, b) => a - b);
  const q = (f) => Math.round(ms[Math.min(ms.length - 1, Math.floor(f * ms.length))]);
  const rad = {
    frist: Number(frist),
    rate: RATE,
    tråd: TRÅD,
    workerStrupt,
    workerSvar: workerSvar.slice(0, 120),
    kortvalg: ms.length,
    median: q(0.5),
    p90: q(0.9),
    maks: Math.round(ms[ms.length - 1]),
    nødbrems: kort.filter((b) => b.info?.nb === true).length,
    nødbremsAndel: +(kort.filter((b) => b.info?.nb === true).length / ms.length).toFixed(3),
    bud: r.tider.BUDRUNDE,
    avtrykk: r.avtrykk,
    sekunder: Math.round((Date.now() - t0) / 1000),
  };
  alle.push(rad);
  console.log(JSON.stringify(rad));
}
await nettleser.close();
writeFileSync(UT, JSON.stringify(alle, null, 1));
