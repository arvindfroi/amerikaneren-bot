/**
 * ER STIKKSJANSEN KALIBRERT?
 *
 *   node examples/stikk-kalibrering.ts --spek "<agentspek>" --giver 400 \
 *     --ut analyse/stikkkal.jsonl
 *
 * `src/e1/stikksjanse.ts` påstår, for hvert kort på hånden, sannsynligheten
 * for at det tar stikket. Påstanden er verdiløs uten at noen sjekker den mot
 * hva som FAKTISK skjedde.
 *
 * ============================== TO PÅSTANDER ==============================
 *
 * 1. KALIBRERING. Sier den 0,7, skal kortet vinne omtrent 70 % av gangene.
 *
 * 2. NEDRE GRENSE. Beregningen antar at enhver spiller som KAN slå, GJØR det.
 *    Det er usant i praksis – forsvarere sparer høye kort – så den faktiske
 *    vinnerraten skal ligge OVER anslaget, ikke under.
 *
 * Bommer den motsatt vei, altså at kortene vinner SJELDNERE enn lovet, er noe
 * galt i selve regnestykket og ikke bare i antakelsene. Da er det en feil, og
 * ikke et forbehold.
 *
 * ============================ HVA SOM MÅLES ==============================
 *
 * For hvert kort som faktisk BLE SPILT: anslaget før trekket, og om spilleren
 * vant stikket. Bare det spilte kortet – de andre lovlige kortene har ingen
 * fasit å måles mot.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { E1Agent } from "../src/e1/nett.ts";
import { e1SpillTrekk, E1_SPILL_DIM_V8 } from "../src/e1/trekk.ts";
import { fyllStikksjanse, STIKK_FRA, STIKK_ANTALL } from "../src/e1/stikksjanse.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { Budagent, lesBudmodell } from "../src/moe2/budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { Trosnett, TRO_INN } from "../src/moe2/trosnett.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";

let givere = 400;
let frøBase = 660_000_000;
let spek = "nevro";
let trofil = "e1-modell/tro.bin";
let ut = "analyse/stikkkal.jsonl";
/**
 * «nett» bruker trosnettet, «uniform» fordeler alt likt paa de tre skjulte
 * setene. Den andre er REFERANSEN: regnestykket er identisk, saa forskjellen
 * maaler hva TROEN tilfoerer og ikke hva formelen gjoer.
 */
let kilde = "nett";
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") givere = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--spek") spek = process.argv[++i]!;
  else if (a === "--tro") trofil = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i]!;
  else if (a === "--kilde") kilde = process.argv[++i]!;
}

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void };

const trosnett = new Trosnett(nettFraBytes(new Uint8Array(readFileSync(trofil)))[0]!);
mkdirSync(dirname(ut), { recursive: true });
const agenter = [0, 1, 2, 3].map(() => lagIndre(spek));

let skrevet = 0;
for (let g = 0; g < givere; g++) {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frøBase + g * 7717);
  for (const a of agenter) a.nyKamp();
  let vakt = 0;
  // Ventende anslag: (spiller, kortindeks, anslag) inntil stikket er avgjort.
  let ventende: { spiller: number; anslag: number; stikk: number }[] = [];
  let forrigeStikkSpilt = 0;

  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const h = agenter[iTur]!.velgHandling(s);

    if (s.fase === "SPILL" && h.type === "SPILL" && s.trumf !== null) {
      const x = new Float32Array(TRO_INN);
      x.set(e1SpillTrekk(s, iTur, E1_SPILL_DIM_V8));
      const ford =
        kilde === "uniform"
          ? Array.from({ length: 52 }, () => [1 / 3, 1 / 3, 1 / 3, 0])
          : trosnett.fordeling(x);
      const v = new Float32Array(STIKK_FRA + STIKK_ANTALL);
      fyllStikksjanse(v, s, iTur, ford);
      ventende.push({
        spiller: iTur,
        anslag: v[STIKK_FRA + kortIndeks(h.kort)] ?? 0,
        stikk: s.stikkSpilt,
      });
    }

    s = utfør(s, h).state;

    // Stikket er ferdig naar telleren gaar opp; da vet vi hvem som vant.
    if ((s.stikkSpilt ?? 0) > forrigeStikkSpilt) {
      const sisteStikk = s.historikk[s.historikk.length - 1];
      if (sisteStikk !== undefined) {
        for (const p of ventende) {
          appendFileSync(
            ut,
            JSON.stringify({
              anslag: Math.round(p.anslag * 10000) / 10000,
              vant: sisteStikk.vinner === p.spiller ? 1 : 0,
              stikk: p.stikk,
            }) + "\n",
          );
          skrevet++;
        }
      }
      ventende = [];
      forrigeStikkSpilt = s.stikkSpilt ?? 0;
    }
  }
  if (g % 50 === 0) process.stdout.write(`  ${g}/${givere}, ${skrevet} trekk\r`);
}
console.log(`\nFerdig: ${skrevet} trekk -> ${ut}`);
