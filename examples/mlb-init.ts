/**
 * EPOKE 0 — TILFELDIGE VEKTER, OG INGENTING ANNET.
 *
 *   node examples/mlb-init.ts --ut e1-modell/mlb-arbeid.bin --froe 20260809
 *
 * `docs/mlb.md` AVGJØRELSE 1: MLB starter fra TILFELDIGE vekter. Ikke fra E1,
 * ikke fra `d7alle`, ikke fra noe som har sett et orakel. Da må et slikt nett
 * kunne lages med én kommando, uten data og uten en Python-kjøring — ellers
 * arver «start fra null» en avhengighet den ikke skal ha.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Sandkassenett, STANDARD_SKJULT } from "../src/mlb/nett.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const ut = arg("ut", "e1-modell/mlb-arbeid.bin");
const frø = Number(arg("froe", "20260809"));
const skjult = arg("skjult", STANDARD_SKJULT.join(",")).split(",").map(Number);

const nett = Sandkassenett.tilfeldig(frø, skjult);
const bytes = nett.tilBytes();
mkdirSync(dirname(ut), { recursive: true });
writeFileSync(ut, bytes);

// LES DEN TILBAKE MED EN GANG. En vektfil som ikke kan leses er verre enn
// ingen fil: den oppdages først når ligaen har kjørt i en time.
const om = Sandkassenett.fraFil(ut);
const p = om.parametre();
process.stderr.write(
  `${ut}: ${bytes.length} byte, ${p.sum} parametre ` +
    `(stamme ${p.stamme}, policy ${p.policy}, verdi ${p.verdi}, tro ${p.tro}), ` +
    `skjult ${skjult.join(",")}, froe ${frø}\n`,
);
