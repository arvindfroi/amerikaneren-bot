/**
 * MesterAI-bro: en liten HTTP-tjeneste som lar nettspillet (nettleseren) spille
 * mot appens EKTE MesterAI. Broen spawner Swift-adapteren (arena/adapter) og
 * rel­ererer NDJSON-protokollen over HTTP med CORS, så nettleseren kan speile
 * spillet og spørre «hva spiller du her?».
 *
 * Kjør på en maskin med Swift (f.eks. laptopen). Familien på samme wifi når
 * broen på laptopens LAN-IP.
 *
 *   1) bash arena/hent-appkode.sh
 *   2) cd arena/adapter && swift build -c release && cd ../..
 *   3) node arena/mesterai-bro.ts [--port 8787] [--ms 450]
 *          [--adapter arena/adapter/.build/release/adapter]
 *
 * Nettspillet peker på broen med ?mester=http://LAPTOP-IP:8787 i URL-en.
 *
 * Protokoll: POST / med adaptermeldingen som JSON-kropp → adapterens JSON-svar.
 * Se arena/adapterklient.ts for meldingstypene (nyKamp/rundeStart/handling/beslutt).
 * GET /helse → {ok:true}. Én kamp om gangen (nok for familietesting hjemme).
 */

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { Adapter } from "./adapterklient.ts";

function flagg(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : standard;
}
function tekstFlagg(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const port = flagg("port", 8787);
const tidMs = flagg("ms", 450);
const adapterSti = tekstFlagg("adapter", "arena/adapter/.build/release/adapter");

if (!existsSync(adapterSti)) {
  console.error(
    `Fant ikke adapteren på ${adapterSti}.\n` +
      "Bygg den først – se arena/README.md – eller pek på den med --adapter.",
  );
  process.exit(1);
}

const adapter = new Adapter(adapterSti);
await adapter.send({ type: "init", mesterSeter: [], tidsbudsjettMs: tidMs });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json", ...CORS });
    res.end(JSON.stringify({ ok: true, tjeneste: "mesterai-bro", tidMs }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, CORS);
    res.end();
    return;
  }
  let kropp = "";
  req.on("data", (d) => (kropp += d));
  req.on("end", async () => {
    try {
      const melding = JSON.parse(kropp) as object;
      const svar = await adapter.send(melding);
      res.writeHead(200, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify(svar));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ type: "feil", melding: String(e) }));
    }
  });
});

server.listen(port, () => {
  console.log(`MesterAI-bro kjører på http://0.0.0.0:${port}  (tidsbudsjett ${tidMs} ms/trekk)`);
  console.log(`Familietesting: finn laptopens LAN-IP (f.eks. 192.168.x.x) og åpne`);
  console.log(`nettspillet med  ?mester=http://<LAN-IP>:${port}`);
});

process.on("SIGINT", () => {
  adapter.stopp();
  server.close();
  process.exit(0);
});
