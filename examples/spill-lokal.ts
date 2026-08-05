/**
 * Serverer spillet med den LOKALE bunten, ikke den utrullede.
 *
 *   node examples/spill-lokal.ts [--port 8791]
 *
 * `web/index.html` laster `app.js` fra Val Town-URL-en, så å åpne fila
 * direkte gir den UTRULLEDE boten. Denne serveren bytter den ene script-taggen
 * mot `/app.js` herfra, og serverer `worker.js` og vektene fra `web/dist`.
 *
 * Finnes fordi jeg 6. august skrev en utrullingssjekkliste for kode jeg aldri
 * hadde kjørt i en nettleser. Bunting og typesjekk sier ingenting om hvordan
 * 4,6 MB base64 og et søk oppfører seg i en nettlesermotor.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const WEB = resolve(import.meta.dirname, "..", "web");
const port = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8791);
const DATA = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".b64": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer((req, res) => {
  const sti = (req.url ?? "/").split("?")[0]!;
  if (sti === "/" || sti === "/index.html") {
    let html = readFileSync(resolve(WEB, "index.html"), "utf8");
    // Bytt den utrullede bunten mot den lokale.
    html = html.replace(new RegExp(`<script src="${DATA}app\.js"></script>`), '<script type="module" src="/app.js"></script>');
    res.writeHead(200, { "content-type": MIME[".html"]! });
    res.end(html);
    return;
  }
  const fil = resolve(WEB, "dist", sti.replace(/^\//, ""));
  if (!fil.startsWith(resolve(WEB, "dist")) || !existsSync(fil)) {
    res.writeHead(404).end("nei");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(fil)] ?? "application/octet-stream" });
  res.end(readFileSync(fil));
}).listen(port, () => console.log(`spillet paa http://localhost:${port}`));
