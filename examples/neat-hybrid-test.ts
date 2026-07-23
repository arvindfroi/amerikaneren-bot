/**
 * Måler HybridAgenten (nett + eksakt sluttspill) mot PIMC-boten og på
 * grådig-benken – flakskontrollert duplikat med seterotasjon.
 *
 *   node examples/neat-hybrid-test.ts [genomfil] [pimcFrø=3] [terskel=5]
 */
import { readFileSync } from "node:fs";
import { opprettSpill, utfør, velgHandling, type Handling } from "../src/index.ts";
import { genomFraJson, HybridAgent } from "../src/neat/index.ts";
import { grådigHandling } from "./graadig.ts";

const genomFil = process.argv[2] ?? "trening-c4/mester.json";
const pimcFrø = Number(process.argv[3] ?? 3);
const terskel = Number(process.argv[4] ?? 5);

const genom = genomFraJson(readFileSync(genomFil, "utf8"));

function duplikat(motstander: "pimc" | "grådig", antallFrø: number): void {
  const agent = new HybridAgent(genom, { stikkTerskel: terskel });
  let egne = 0, andres = 0, seire = 0, kamper = 0;
  for (let f = 0; f < antallFrø; f++) {
    for (let sete = 0; sete < 4; sete++) {
      agent.nyKamp();
      let s = opprettSpill({ antallSpillere: 4 }, (motstander === "pimc" ? 555_100 : 777_000) + f);
      let guard = 0;
      while (s.fase !== "FERDIG" && guard++ < 20000) {
        if (s.fase === "RUNDE_SLUTT" && s.rundeNr + 1 >= 40) break;
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur;
        let h: Handling;
        if (s.fase === "RUNDE_SLUTT") h = { type: "NESTE" };
        else if (iTur === sete) h = agent.velgHandling(s);
        else if (motstander === "pimc")
          h = velgHandling(s, { verdener: 12, terskel: 6, frø: (f * 131 + (iTur ?? 0) * 17 + guard) >>> 0 });
        else h = grådigHandling(s);
        s = utfør(s, h).state;
      }
      const e = s.totalPoeng[sete] ?? 0;
      egne += e; andres += (s.totalPoeng.reduce((a, b) => a + b, 0) - e) / 3;
      if (s.vinner === sete) seire++;
      kamper++;
    }
  }
  console.log(
    `Hybrid vs ${motstander}: ${(egne / kamper).toFixed(1)} mot ${(andres / kamper).toFixed(1)}, ` +
      `diff ${((egne - andres) / kamper).toFixed(1)}, seire ${seire}/${kamper}`,
  );
}

console.log(`HybridAgent(${genomFil}, sluttspill ≤ ${terskel} stikk eksakt)`);
duplikat("grådig", 8);
duplikat("pimc", pimcFrø);
