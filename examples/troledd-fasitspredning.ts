/**
 * ER FASITEN FLAT? — spredningen i poengløserens rotverdier.
 *
 * `troledd.ts` målte regret 0 for hvert kort i hver arm. Enten er kartleggingen
 * feil, eller så sier den eksakte løseren at alle lovlige kort er like gode.
 * `poengdds.ts` advarer selv om det siste: «budlaget er ofte HELT likegyldig
 * (trinnfunksjonen er flat så snart kontrakten er sikret eller tapt)».
 *
 * Denne fila skiller de to: den skriver ut HELE verdisettet per stilling.
 */
import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { lovligeKort } from "../src/motor.ts";
import { FARGER } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { kortTilInt, intTilKort } from "../src/solver/dds.ts";
import { poengRotVerdier } from "../src/solver/poengdds.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "2"), 2, "runder");
const TAK = tall(arg("--tak", "7"), 7, "tak");

const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
for (const a of agenter) a.nyKamp();

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 13_000_777);
let vakt = 0, r = 0, flate = 0, ialt = 0;

while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
  if (s.fase === "RUNDE_SLUTT") {
    for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
    r++; s = utfør(s, { type: "NESTE" }).state; continue;
  }
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (s.fase === "SPILL" && s.iTur !== null && s.trumf !== null && s.budvinner !== null && s.melding !== null) {
    const sete = s.iTur;
    const igjen = s.hender[sete]?.length ?? 0;
    if (igjen > 0 && igjen <= TAK && s.hender.every((h) => h.length > 0) && lovligeKort(s, sete).length >= 2) {
      for (const maal of ["diff", "egen"] as const) {
        const svar = poengRotVerdier({
          N: s.antallSpillere, trump: FARGER.indexOf(s.trumf),
          hender: s.hender.map((h) => h.map(kortTilInt)), iTur: sete,
          bord: s.bord.map((kp) => ({ spiller: kp.spiller, kort: kortTilInt(kp.kort) })),
          stikkFør: s.stikkVunnet.slice(), ferdigeStikk: s.stikkSpilt,
          totalStikk: s.giving.antallStikk, budvinner: s.budvinner, makker: s.makker,
          melding: s.melding, målPoeng: s.regler.målPoeng, mål: maal,
        });
        const v = svar.verdier.map((x) => x.verdi);
        const spredning = Math.max(...v) - Math.min(...v);
        if (maal === "diff") { ialt++; if (spredning < 1e-9) flate++; }
        const kort = svar.verdier.map((x) => {
          const k = intTilKort(x.kort);
          return `${k.farge}${k.verdi}=${x.verdi.toFixed(2)}`;
        }).join(" ");
        console.log(`r${r} stikk${s.historikk.length} ${rolleFor(s, sete)} sete${sete} igjen${igjen} lovlige${lovligeKort(s, sete).length} [${maal}] spredning=${spredning.toFixed(3)} :: ${kort}`);
      }
    }
  }
  s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
}
console.log(`\nFLATE (diff): ${flate} av ${ialt} stillinger har spredning 0`);
