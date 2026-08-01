/**
 * E1-spilleren – FILSKALLET rundt src/e1/agent.ts.
 *
 * Selve agenten bor i `agent.ts` og er nettlesertrygg. Denne fila legger bare
 * på det ene Node trenger: å lese vektfila fra disk. Delingen finnes fordi
 * nettsiden skal spille NØYAKTIG den agenten vi har målt – hadde nettleseren
 * fått en egen kopi av kortvalget, kunne de to kommet i utakt uten at noen
 * måling ville avslørt det.
 *
 * Alle Node-kallere kan importere herfra som før: `lesE1Nett`, `E1Agent` og
 * `E1Agent.fraFil` virker uendret, fordi denne modulen registrerer filleseren
 * når den lastes.
 */

import { readFileSync } from "node:fs";

import { e1NettFraBytes, E1Agent, settE1Filleser } from "./agent.ts";
import type { NevroNett } from "../nevro/nett.ts";

export function lesE1Nett(fil: string): NevroNett {
  return e1NettFraBytes(new Uint8Array(readFileSync(fil)), fil);
}

settE1Filleser(lesE1Nett);

export { E1Agent, e1NettFraBytes };
export type { E1Opts, SøkeFase } from "./agent.ts";
