/**
 * GruppePool: spiller gruppekamper parallelt i arbeidstråder.
 *
 * Cuprundens grupper er uavhengige kamper, så de kan avvikles samtidig på
 * alle kjerner. Hver jobb sender 4 genomer til en tråd; tråden spiller den
 * flakskontrollerte kampen (inkl. regret-læring i nettet) og returnerer
 * resultatet pluss de lærte vektene, som hovedtråden skriver tilbake i de
 * ekte genomobjektene (lamarckismen bevares på tvers av tråder).
 *
 * Determinisme: hver kamp er en ren funksjon av (genomer, gruppeFrø), og
 * innen en runde spiller hvert genom i nøyaktig én gruppe – resultatet er
 * derfor bit-identisk med sekvensiell avvikling, uansett fullførings-
 * rekkefølge.
 */

import { Worker } from "node:worker_threads";

import type { Genom } from "./genom.ts";
import type { GruppeResultat, KampOpts } from "./turnering.ts";
import type { PoolJobb, PoolSvar } from "./pool-arbeider.ts";

interface Venter {
  readonly løs: (svar: PoolSvar) => void;
  readonly avvis: (feil: unknown) => void;
}

export class GruppePool {
  private readonly arbeidere: Worker[] = [];
  private readonly ledige: Worker[] = [];
  private readonly kø: PoolJobb[] = [];
  private readonly venter = new Map<number, Venter>();
  private readonly jobbTilArbeider = new Map<number, Worker>();
  private nesteId = 0;
  private lukket = false;

  readonly tråder: number;

  constructor(tråder: number) {
    if (tråder < 1) throw new Error("Poolen trenger minst én tråd");
    this.tråder = tråder;
    for (let i = 0; i < tråder; i++) {
      const w = new Worker(new URL("./pool-arbeider.ts", import.meta.url));
      // Ledige arbeidere skal ikke holde prosessen i live ved avslutning.
      w.unref();
      w.on("message", (svar: PoolSvar) => {
        this.jobbTilArbeider.delete(svar.id);
        const v = this.venter.get(svar.id);
        this.venter.delete(svar.id);
        this.ledige.push(w);
        this.pump();
        v?.løs(svar);
      });
      w.on("error", (feil: Error) => {
        // En død arbeider feiler alle jobbene sine; resten av poolen lever.
        for (const [id, v] of [...this.venter]) {
          if (this.jobbTilArbeider.get(id) === w) {
            this.venter.delete(id);
            this.jobbTilArbeider.delete(id);
            v.avvis(feil);
          }
        }
      });
      this.arbeidere.push(w);
      this.ledige.push(w);
    }
  }

  private pump(): void {
    while (this.kø.length > 0 && this.ledige.length > 0) {
      const jobb = this.kø.shift()!;
      const w = this.ledige.pop()!;
      this.jobbTilArbeider.set(jobb.id, w);
      w.postMessage(jobb);
    }
  }

  /**
   * Spiller en gruppekamp i en tråd og skriver de lærte vektene tilbake i
   * genomene. Returnerer kampresultatet.
   */
  async spill(
    genomer: readonly Genom[],
    gruppeFrø: number,
    kampOpts: KampOpts,
    læringsrate: number,
  ): Promise<GruppeResultat> {
    if (this.lukket) throw new Error("Poolen er lukket");
    const id = this.nesteId++;
    const svar = await new Promise<PoolSvar>((løs, avvis) => {
      this.venter.set(id, { løs, avvis });
      this.kø.push({ id, genomer: genomer as Genom[], gruppeFrø, kampOpts, læringsrate });
      this.pump();
    });
    for (let i = 0; i < genomer.length; i++) {
      const koblinger = genomer[i]!.koblinger;
      const vekter = svar.vekter[i]!;
      if (vekter.length !== koblinger.length) {
        throw new Error("Vektlisten fra arbeideren matcher ikke genomet");
      }
      for (let k = 0; k < koblinger.length; k++) koblinger[k]!.vekt = vekter[k]!;
    }
    return svar.resultat;
  }

  /** Avslutter alle arbeidstrådene. */
  async lukk(): Promise<void> {
    this.lukket = true;
    await Promise.all(this.arbeidere.map((w) => w.terminate()));
  }
}
