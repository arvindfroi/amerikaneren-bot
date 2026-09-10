/**
 * Pakker ut Adams' vektfiler til `e1-modell/` fra de base64-filene som ligger
 * i `web/dist/`. Kjøres av `npm test` (pretest), og kan kjøres for hånd:
 *
 *   node verktoy/hent-vekter.mjs
 *
 * ================= HVORFOR DENNE FILA FINNES =============================
 *
 * `e1-modell/` står i `.gitignore`, og to av vektfilene spekstrengen krever —
 * `vrakrang.bin` og `d7alle.bin` — lå derfor ingen steder i repoet. Uten dem
 * feilet 113 av 607 prøver på ENOENT i en fersk klone, og blant dem ALLE tretten
 * K2-prøvene. K2 er det ene kravet som er erklært BEVIST, og beviset kunne
 * altså ikke etterprøves av noen andre enn den maskinen filene tilfeldigvis lå
 * på. Se `docs/krav-status.md`, «Prøven kan ikke kjøres fra en fersk klone».
 *
 * ================= HVORFOR B64 OG IKKE TO NYE BINÆRFILER =================
 *
 * Vektene ligger allerede i repoet: `web/dist/adams-kort.b64` og
 * `web/dist/adams-vrak.b64` er nøyaktig det nettleseren laster ned, og de er
 * sporet fordi Vercel serverer `web/`. Å legge inn `e1-modell/*.bin` i tillegg
 * ville lagret de samme vektene to ganger — og da kan de to kopiene komme i
 * utakt. Det er nøyaktig feilklassen `test/utrullet-lik-spek.test.ts` finnes
 * for å fange: at det målte og det utrullede ikke er samme bot.
 *
 * Ved å pakke ut FRA nettleserfilene er «målt = utrullet» ikke lenger noe som
 * må håndheves i ettertid — det følger av at det er de samme bytene.
 *
 * ================= SANITY, FØR VI SKRIVER ================================
 *
 * Formatet parses før noe treffer disk (samme grep som
 * `verktoy/hent-nevrovekter.mjs`). En forskjøvet vektfil krasjer ikke — den
 * spiller bare søppel, og et nett som spiller søppel er verre enn et som nekter
 * å starte.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rot = resolve(import.meta.dirname, "..");

/** `web/dist/<b64>` → `e1-modell/<bin>`, med forventet antall nett i fila. */
const FILER = [
  { b64: "adams-kort.b64", bin: "d7alle.bin", nett: 1 },
  { b64: "adams-vrak.b64", bin: "vrakrang.bin", nett: 1 },
];

/**
 * Leser vektformatet uten å bygge nettet: Int32 antallNett, så per nett
 * Int32 antallLag, så per lag Int32 inn, Int32 ut og (inn*ut + ut) Float32.
 * Kaster hvis fila ikke går akkurat opp — se `src/nevro/nett.ts:174`.
 */
function sjekkFormat(buf, ventetAntallNett) {
  let p = 0;
  const i32 = () => {
    if (p + 4 > buf.length) throw new Error(`leser forbi slutten ved byte ${p}`);
    const v = buf.readInt32LE(p);
    p += 4;
    return v;
  };
  const antallNett = i32();
  if (antallNett !== ventetAntallNett) {
    throw new Error(`forventet ${ventetAntallNett} nett, fikk ${antallNett}`);
  }
  const former = [];
  for (let n = 0; n < antallNett; n++) {
    const antallLag = i32();
    const dims = [];
    for (let l = 0; l < antallLag; l++) {
      const inn = i32();
      const ut = i32();
      p += 4 * (inn * ut + ut);
      dims.push(`${inn}→${ut}`);
    }
    former.push(dims.join(" "));
  }
  if (p !== buf.length) throw new Error(`leste ${p} av ${buf.length} byte`);
  return former.join(" | ");
}

mkdirSync(resolve(rot, "e1-modell"), { recursive: true });

let skrevet = 0;
for (const { b64, bin } of FILER) {
  const fra = resolve(rot, "web", "dist", b64);
  const til = resolve(rot, "e1-modell", bin);

  const buf = Buffer.from(readFileSync(fra, "utf8").trim(), "base64");
  let form;
  try {
    form = sjekkFormat(buf, FILER.find((f) => f.bin === bin).nett);
  } catch (feil) {
    throw new Error(`${b64} er ikke en gyldig vektfil (${feil.message}) — skriver ingenting`);
  }

  // Idempotent: rør ikke disk når fila alt er byte-identisk. Da kan dette
  // kjøres som pretest uten å skitne til arbeidstreet ved hver test.
  let lik = false;
  try {
    lik = statSync(til).size === buf.length && readFileSync(til).equals(buf);
  } catch {
    /* finnes ikke — skriv den */
  }
  if (lik) {
    console.log(`e1-modell/${bin}  alt på plass (${buf.length} byte, ${form})`);
    continue;
  }
  writeFileSync(til, buf);
  skrevet++;
  console.log(`e1-modell/${bin}  skrevet fra web/dist/${b64} (${buf.length} byte, ${form})`);
}

if (skrevet > 0) console.log(`\n${skrevet} vektfil(er) pakket ut. «npm test» skal nå kunne kjøre K2.`);
