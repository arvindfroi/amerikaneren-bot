/**
 * Arbeidstråden i gruppekamp-poolen: mottar 4 genomer + frø, spiller den
 * flakskontrollerte gruppekampen lokalt, og returnerer resultatet SAMT
 * genomenes vekter etter kampen – regret-læringen (lamarckisk
 * xT-kalibrering) skjer i tråden, og hovedtråden skriver vektene tilbake
 * i de ekte genomene. Kampen er en ren funksjon av (genomer, frø), så
 * utfallet er identisk med sekvensiell avvikling.
 */

import { parentPort } from "node:worker_threads";

import type { Genom } from "./genom.ts";
import { NeatAgent } from "./agent.ts";
import { spillGruppekamp, type GruppeResultat, type KampOpts } from "./turnering.ts";

export interface PoolJobb {
  readonly id: number;
  readonly genomer: Genom[];
  readonly gruppeFrø: number;
  readonly kampOpts: KampOpts;
  readonly læringsrate: number;
}

export interface PoolSvar {
  readonly id: number;
  readonly resultat: GruppeResultat;
  /** Vektene per genom (samme koblingsrekkefølge) etter regret-læringen. */
  readonly vekter: number[][];
}

if (parentPort === null) {
  throw new Error("pool-arbeider.ts må kjøres som worker-tråd");
}

parentPort.on("message", (jobb: PoolJobb) => {
  const agenter = jobb.genomer.map(
    (g) => new NeatAgent(g, { læringsrate: jobb.læringsrate }),
  );
  const resultat = spillGruppekamp(agenter, jobb.gruppeFrø, jobb.kampOpts);
  const svar: PoolSvar = {
    id: jobb.id,
    resultat,
    vekter: jobb.genomer.map((g) => g.koblinger.map((k) => k.vekt)),
  };
  parentPort!.postMessage(svar);
});
