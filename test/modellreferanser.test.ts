/**
 * MODELLREFERANSER SOM RÅTNER.
 *
 * Arvind: «det virker som mye kode som gjenbrukes blir utdatert så kanskje prøv
 * å sjekk i det.»
 *
 * Han hadde rett, og omfanget var større enn ventet: **35 analyseverktøy** hadde
 * standardverdien `e1-modell/sd-r2.bin`. `sd-r2` er avløst av `d7alle`, så et
 * hvilket som helst av dem kjørt uten flagg målte en gammel bot og rapporterte
 * tallet som dagens. Ingen av dem feilet. De svarte bare på et annet spørsmål
 * enn det som ble stilt — som er den vanskeligste feilen å oppdage, fordi
 * utdata ser helt riktig ut.
 *
 * Det er samme rot som `gate2 --rapport`, som skrev standardverdien `sd-r2` i
 * overskriften mens målingen faktisk gikk mot `d7alle`.
 *
 * ================= HVORFOR EN TEST OG IKKE BARE EN OPPRYDDING ============
 *
 * Fordi oppryddingen råtner igjen. Neste gang nettet byttes, blir `d7alle` like
 * utdatert som `sd-r2` er nå, og ingen kommer til å huske de 35 filene.
 *
 * Testen håndhever derfor to ting som ikke krever hukommelse:
 *
 *   1. KJØRENDE kode refererer ikke til et AVLØST nett. Lista under er den
 *      eneste tingen som må vedlikeholdes, og den vokser med ett navn hver
 *      gang et nett pensjoneres.
 *
 *   2. Nettet `STANDARDNETT` peker på finnes faktisk. En standardverdi som
 *      viser til en fil som ikke er der, feiler først når noen kjører uten
 *      flagg — typisk måneder senere.
 *
 * KOMMENTARER ER UNNTATT MED VILJE. De beskriver HISTORIKK — «sd-r2 målte
 * 0,9431 her» er en sann setning som skal stå. Det er den kjørende koden som
 * ikke får peke bakover.
 */

import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { STANDARDNETT } from "../src/moe2/agentspek.ts";

const ROT = join(import.meta.dirname, "..");

/**
 * Nett som er AVLØST. Kjørende kode skal ikke navngi dem.
 *
 * `sd-r2-begge-512.bin` er bevisst IKKE her: den er en egen arkitektur som
 * `mesterai-konvensjoner.ts` sammenlikner mot, ikke en avløst standardverdi.
 */
const AVLØSTE = ["sd-r2.bin", "sd-r1.bin"];

/** Alle .ts-filer under en katalog, rekursivt. */
function tsFiler(kat: string): string[] {
  const ut: string[] = [];
  for (const e of readdirSync(kat, { withFileTypes: true })) {
    const p = join(kat, e.name);
    if (e.isDirectory()) ut.push(...tsFiler(p));
    else if (e.name.endsWith(".ts")) ut.push(p);
  }
  return ut;
}

/**
 * Linjer som faktisk KJØRER. En kommentar som nevner et gammelt nett er
 * dokumentasjon; en standardverdi som gjør det er en feil som venter.
 */
function kjørendeLinjer(fil: string): { nr: number; tekst: string }[] {
  const ut: { nr: number; tekst: string }[] = [];
  let iBlokk = false;
  const linjer = readFileSync(fil, "utf8").split("\n");
  for (let i = 0; i < linjer.length; i++) {
    const l = linjer[i]!;
    const t = l.trim();
    if (iBlokk) {
      if (t.includes("*/")) iBlokk = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) iBlokk = true;
      continue;
    }
    if (t.startsWith("*") || t.startsWith("//")) continue;
    ut.push({ nr: i + 1, tekst: l });
  }
  return ut;
}

test("kjoerende kode navngir ikke et AVLOEST nett", () => {
  const funn: string[] = [];
  for (const kat of ["examples", "src", "web"]) {
    const p = join(ROT, kat);
    if (!existsSync(p)) continue;
    for (const f of tsFiler(p)) {
      if (f.includes("node_modules") || f.includes(`${"dist"}`)) continue;
      for (const { nr, tekst } of kjørendeLinjer(f)) {
        /**
         * NØDUTGANG: `HISTORISK-PANEL` på linja.
         *
         * Et avløst nett KAN være riktig å navngi — et panel som med vilje
         * sammenlikner flere generasjoner er ikke råte. Men da skal det stå,
         * for forskjellen mellom «bevisst historisk referanse» og «ingen
         * oppdaterte den» er usynlig i koden ellers.
         *
         * Ingen av de 37 funnene i den første kjøringen hadde en slik
         * begrunnelse. Alle var bare gamle.
         */
        if (tekst.includes("HISTORISK-PANEL")) continue;
        for (const gammel of AVLØSTE) {
          // Eksakt filnavn, saa «sd-r2-begge-512.bin» ikke feilaktig treffes.
          if (new RegExp(`e1-modell/${gammel.replace(".", "\\.")}(?![\\w-])`).test(tekst)) {
            funn.push(`${f.slice(ROT.length + 1)}:${nr}  ${tekst.trim().slice(0, 90)}`);
          }
        }
      }
    }
  }
  assert.equal(
    funn.length,
    0,
    `Kjoerende kode peker paa avloeste nett. Kjoert uten flagg maaler disse en\n` +
      `GAMMEL bot og rapporterer tallet som dagens - uten aa feile.\n` +
      `Bytt til STANDARDNETT (${STANDARDNETT}), eller flytt referansen inn i en\n` +
      `kommentar om den beskriver historikk.\n\n` +
      funn.join("\n"),
  );
});

test("STANDARDNETT finnes faktisk paa disk", () => {
  assert.ok(
    existsSync(join(ROT, STANDARDNETT)),
    `STANDARDNETT er «${STANDARDNETT}», men fila finnes ikke. En standardverdi ` +
      `som peker paa noe som ikke er der, feiler foerst naar noen kjoerer uten flagg.`,
  );
});
