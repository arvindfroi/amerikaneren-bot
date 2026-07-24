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
import { existsSync, readFileSync } from "node:fs";
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

// Statiske spillfiler serveres lokalt over HTTP, så iPad-en åpner ÉN adresse
// og /mester blir samme opphav (ingen HTTPS/mixed-content-blokkering).
// index.html lastes fra disk med skript-kilden pekt til same-origin /app.js.
const REPO = new URL("..", import.meta.url).pathname;
function les(sti: string): string | null {
  try {
    return readFileSync(REPO + sti, "utf8");
  } catch {
    return null;
  }
}
const INDEX = (les("web/index.html") ?? "").replace(
  /<script src="https:\/\/[^"]*\/app\.js"><\/script>/,
  '<script src="/app.js"></script>',
);
const STATISK: Record<string, [string, string]> = {
  "/app.js": ["web/dist/app.js", "text/javascript; charset=utf-8"],
  "/worker.js": ["web/dist/worker.js", "text/javascript; charset=utf-8"],
};

const server = createServer((req, res) => {
  const sti = (req.url ?? "/").split("?")[0]!;
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET") {
    if (sti === "/" || sti === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...CORS });
      res.end(INDEX);
      return;
    }
    const fil = STATISK[sti];
    if (fil) {
      const innhold = les(fil[0]);
      if (innhold === null) {
        res.writeHead(404, CORS);
        res.end("bygg web-bundelen: npx esbuild web/app.ts ...");
        return;
      }
      res.writeHead(200, { "content-type": fil[1], "cache-control": "no-store", ...CORS });
      res.end(innhold);
      return;
    }
    if (sti === "/helse" || sti === "/mester") {
      res.writeHead(200, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ ok: true, tjeneste: "mesterai-bro", tidMs }));
      return;
    }
    res.writeHead(404, CORS);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, CORS);
    res.end();
    return;
  }
  // POST /mester (eller /) → relé til adapteren (MesterAIs beslutninger).
  let kropp = "";
  req.on("data", (d) => (kropp += d));
  req.on("end", async () => {
    try {
      const melding = JSON.parse(kropp) as { type?: string };
      // Helsesjekk fra klienten før kamp: svar uten å forstyrre adapteren.
      if (melding.type === "helse") {
        res.writeHead(200, { "content-type": "application/json", ...CORS });
        res.end(JSON.stringify({ type: "ok" }));
        return;
      }
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
