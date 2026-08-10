/**
 * SJEKK UTRULLINGEN: ligger det som skal ligge, og er det det RIKTIGE?
 *
 *   node verktoy/sjekk-utrulling.ts [--ut analyse/utrulling-sjekk.txt]
 *
 * ====================== HVORFOR DENNE FILA FINNES ========================
 *
 * 9.–10. august ble det funnet tre lag av samme feil på den levende siden:
 *
 *   worker.js       59 commits gammel -> gammel PIMC spilte i foerersetet
 *                   i stedet for Adams. Maalt: -72,6 mot -5,0 poeng/kamp.
 *   bud-vant.json   ALDRI lastet opp. Endepunktet svarer 200 med en
 *                   HTML-feilside, saa budmodellen har vaert av siden 6.8.
 *                   Maalt kostnad: +0,618 +- 0,166 (3,7 SE).
 *   telemetrien     logget «brukt: true» hele veien, fordi den gamle
 *                   workeren SVARTE - bare med feil bot.
 *
 * Og prøvene var grønne. `utrullet-lik-maalt` haandhever at reserven er en
 * ANNEN FIL enn den maalte - ikke at fila faktisk er lagt ut. Det er en ekte
 * prøve som svarer paa feil spoersmaal.
 *
 * ================== HVORFOR EN STATUSKODE IKKE HOLDER ====================
 *
 * `bud-vant.json` svarer **200 OK** med 209 309 byte. Innholdet er
 * `<!doctype html`. Enhver sjekk som ser paa statuskoden, eller bare paa at
 * det kom bytes, ville sagt at alt var i orden.
 *
 * Derfor validerer denne INNHOLDET: JSON maa parse, JavaScript maa ikke vaere
 * HTML, og hashen maa stemme med det som ligger lokalt.
 *
 * ================== LISTA UTLEDES, DEN SKRIVES IKKE ======================
 *
 * Filnavnene leses ut av `web/app.ts`. En haandskrevet liste ville drevet fra
 * appen ved neste endring - og en sjekk som sjekker feil liste er nøyaktig
 * den feilklassen den er satt til aa fange.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Fjerner // og /* *\/-kommentarer, men lar strenger staa.
 *
 * Naiv fjerning ville spist «https://...» inne i en streng — og DATA_URL er
 * nettopp det. Derfor foelges strengtilstanden.
 */
export function utenKommentarer(kode: string): string {
  let ut = "";
  let i = 0;
  let streng: string | null = null;
  while (i < kode.length) {
    const c = kode[i]!;
    const n = kode[i + 1];
    if (streng !== null) {
      ut += c;
      if (c === "\\") {
        ut += kode[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === streng) streng = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      streng = c;
      ut += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < kode.length && kode[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < kode.length && !(kode[i] === "*" && kode[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    ut += c;
    i++;
  }
  return ut;
}

/** Hvert filnavn appen faktisk henter. Utledet, ikke skrevet ned. */
export function utledNavn(app: string): Set<string> {
  const navn = new Set<string>(["worker.js", "app.js"]);
  // KOMMENTARER TELLER IKKE.
  //
  // Første utkast regex-et hele fila, og «tro.b64» sto i én kommentar om en fil
  // som skal lastes opp «hvis den senere replikeres». Verktøyet meldte den som
  // utrullingsfeil, og jeg rapporterte den videre som et funn. Appen henter den
  // aldri: `TROFIL === null` hindrer det.
  //
  // Det er nøyaktig feilklassen verktøyet er bygd for å fange, begått av
  // verktøyet selv — det målte var ikke det appen faktisk gjør.
  for (const m of utenKommentarer(app).matchAll(
    /"([a-z0-9-]+\.(?:json|b64|bin|js))"/g,
  )) {
    navn.add(m[1]!);
  }
  return navn;
}

/** Hvor den samme fila ligger lokalt. Flere kataloger er i bruk. */
function lokalt(f: string): string | null {
  for (const p of [`web/dist/${f}`, `e1-modell/${f}`, f])
    if (existsSync(p)) return p;
  return null;
}

const sha = (b: Buffer | string): string =>
  createHash("sha256").update(b).digest("hex").slice(0, 12);

interface Dom {
  fil: string;
  status: string;
  ute: number;
  her: number | null;
  lik: boolean | null;
  merknad: string;
}

/**
 * VAKTEN. Uten den kjoerer hele sjekken - inkludert nettverkskallene - bare
 * noen importerer `utenKommentarer` for aa teste den. `examples/matrise.ts`
 * brukte ti minutter paa aa spille kamper under en typecheck av samme grunn.
 */
const startetDirekte =
  process.argv[1] !== undefined &&
  process.argv[1].split("\\").join("/").endsWith("verktoy/sjekk-utrulling.ts");

async function kjor(): Promise<void> {
  const app = readFileSync("web/app.ts", "utf8");
  const basen = /const DATA_URL = "([^"]+)"/.exec(app)?.[1];
  if (basen === undefined) throw new Error("Fant ikke DATA_URL i web/app.ts");
  const navn = utledNavn(app);
  const UT = (() => {
    const i = process.argv.indexOf("--ut");
    return i >= 0 ? process.argv[i + 1]! : "analyse/utrulling-sjekk.txt";
  })();

  const dommer: Dom[] = [];

  for (const f of [...navn].sort()) {
    const sti = lokalt(f);
    let ute = 0;
    let status = "-";
    let merknad = "";
    let lik: boolean | null = null;

    try {
      const r = await fetch(`${basen}${f}`);
      status = String(r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      ute = buf.length;
      const start = buf
        .subarray(0, 32)
        .toString("utf8")
        .trimStart()
        .toLowerCase();

      // INNHOLDET, ikke statuskoden. En 200 med <!doctype html er den feilen
      // som faktisk skjedde, og den er usynlig for alt annet enn dette.
      if (start.startsWith("<!doctype") || start.startsWith("<html")) {
        merknad = "HTML-FEILSIDE — filen er ikke lastet opp";
      } else if (f.endsWith(".json")) {
        try {
          JSON.parse(buf.toString("utf8"));
        } catch {
          merknad = "svarer, men er ikke gyldig JSON";
        }
      }

      if (merknad === "" && sti !== null) {
        const her = readFileSync(sti);
        lik = sha(her) === sha(buf);
        if (!lik) {
          const d = buf.length - her.length;
          merknad = `AVVIKER fra ${sti} (${d > 0 ? "+" : ""}${d} byte)`;
        }
      } else if (sti === null) {
        merknad =
          merknad === "" ? "ingen lokal kopi å sammenlikne med" : merknad;
      }
    } catch (feil) {
      status = "FEIL";
      merknad = String(feil).slice(0, 60);
    }

    dommer.push({
      fil: f,
      status,
      ute,
      her: sti === null ? null : readFileSync(sti).length,
      lik,
      merknad,
    });
  }

  // ---------------------------------------------------------------------------

  const linjer: string[] = [];
  linjer.push(`# Utrullingssjekk mot ${basen}`);
  linjer.push("#");
  linjer.push(
    "# En 200-status betyr INGENTING her: bud-vant.json svarte 200 med",
  );
  linjer.push("# 209 309 byte HTML i ukevis. Innholdet er det som teller.");
  linjer.push("");
  linjer.push(
    `${"fil".padEnd(22)}${"kode".padEnd(6)}${"ute".padStart(9)}${"her".padStart(9)}  merknad`,
  );
  linjer.push("-".repeat(78));

  let feil = 0;
  for (const d of dommer) {
    const ok = d.merknad === "" && d.lik !== false;
    if (!ok) feil++;
    linjer.push(
      d.fil.padEnd(22) +
        d.status.padEnd(6) +
        String(d.ute).padStart(9) +
        (d.her === null ? "-" : String(d.her)).padStart(9) +
        "  " +
        (ok ? "ok" : d.merknad),
    );
  }

  linjer.push("");
  linjer.push(
    feil === 0
      ? `ALT STEMMER — ${dommer.length} filer, innhold validert mot lokal kopi.`
      : `${feil} av ${dommer.length} filer er GALE. Se merknadene over.`,
  );

  const tekst = linjer.join("\n") + "\n";
  writeFileSync(UT, tekst, "utf8");
  console.log(tekst);
  console.log(`Skrevet til ${UT}`);
  process.exitCode = feil === 0 ? 0 : 1;
}

if (startetDirekte) await kjor();
