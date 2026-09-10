/**
 * WORKERENS MELDINGSHÅNDTERING, UTEN `self`.
 *
 * `web/worker.ts` er bare limet: `self.onmessage = lagSøkekjerne(post)`. Alt som
 * kan gå galt ligger her, der Node-prøvene kan kjøre det med ekte vekter og
 * ekte søk (`test/app-sokeklient.test.ts`) — i stedet for å bare kunne prøves i
 * en nettleser, som ingen gjør på en iPad i sofaen.
 *
 * ================= DEN GAMLE FELLA ER BORTE ==============================
 *
 * Workeren før denne endte i en ukommentert felle: alt som ikke var «init»
 * eller «pondre» falt gjennom til PIMC-ens `beslutt`-gren (`docs/utrulling-v5.md`,
 * «Workeren svarer på meldinger den ikke kjenner — med feil bot»). PIMC-grenen
 * er fjernet, og en ukjent melding får nå et EKSPLISITT `feil`-svar med sin id,
 * så hovedtråden går videre med én gang i stedet for å vente ut fristen.
 */

import type { GameState, Handling } from "../src/motor.ts";
import type { Velger } from "../src/moe2/utrullet.ts";
import type { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import {
  byggAdams,
  lesUtfall,
  SØKEPROTOKOLL,
  type AdamsKonfig,
  type Søkeutfall,
} from "./adamskjede.ts";

export type Initmelding = {
  readonly type: "adams-init";
  readonly kort: string;
  readonly bud: unknown;
  readonly vrak: string | null;
  /** Sendes, men leses ikke: `Trosnett` krever et bredere nett enn `d7alle`. */
  readonly tro: string | null;
} & AdamsKonfig;

export type TilWorker =
  | Initmelding
  /** `frist` er `Date.now()`-tid. Hovedtråd og worker deler veggklokka, ikke `performance.now()`. */
  | { readonly type: "adams-trekk"; readonly id: number; readonly state: GameState; readonly sete: number; readonly frist?: number }
  | { readonly type: "nyKamp" };

export type FraWorker =
  | {
      readonly id: 0;
      readonly klar: true;
      readonly protokoll: number;
      readonly verdener: number;
      readonly sigma: number;
      readonly bud: boolean;
      readonly vrak: boolean;
      readonly søk: boolean;
      readonly ms: number;
    }
  | { readonly id: 0; readonly klar: false; readonly protokoll: number; readonly feil: string }
  | { readonly id: number; readonly handling: Handling; readonly utfall: Søkeutfall | null; readonly ms: number }
  | { readonly id: number; readonly utløpt: true; readonly forsinketMs: number }
  | { readonly id: number; readonly feil: string };

export function lagSøkekjerne(
  post: (m: FraWorker) => void,
  veggklokke: () => number = () => Date.now(),
): (m: TilWorker) => void {
  let adams: Velger | null = null;
  let sik: Sikkerorakel | null = null;

  return (m) => {
    if (m.type === "adams-init") {
      // Bygges HER, ikke sendes ferdig: agenter kan ikke krysse en
      // meldingsgrense. Vektene kommer som base64 fra hovedtråden, som alt har
      // hentet dem – ingen dobbel nedlasting av sju megabyte.
      const t0 = performance.now();
      try {
        const bygd = byggAdams({ kort: m.kort, bud: m.bud, vrak: m.vrak }, m, true);
        adams = bygd.agent;
        sik = bygd.sik;
        /**
         * KVITTERINGEN. Uten den kan ikke hovedtråden vite at det er DENNE
         * workeren den snakker med. `klar: true` sendes bare herfra, så en eldre
         * worker kan ikke forfalske den ved uhell. `protokoll` sier hvilke
         * meldinger den forstår — se `SØKEPROTOKOLL`.
         */
        post({
          id: 0,
          klar: true,
          protokoll: SØKEPROTOKOLL,
          verdener: m.verdener,
          sigma: m.sigma,
          bud: bygd.bud,
          vrak: bygd.vrak,
          søk: bygd.sik !== null,
          ms: Math.round(performance.now() - t0),
        });
      } catch (feil) {
        adams = null;
        sik = null;
        post({ id: 0, klar: false, protokoll: SØKEPROTOKOLL, feil: `adams-init: ${String(feil)}` });
      }
      return;
    }

    if (m.type === "nyKamp") {
      // N5: hovedtrådens kjede fikk `nyKamp()`, workerens gjorde det aldri. I dag
      // er det uten virkning (`økt: false`), men det er DEN som skiller «én økt»
      // fra «historie» den dagen K4/K6 slås på.
      adams?.nyKamp();
      return;
    }

    if (m.type === "adams-trekk") {
      try {
        if (adams === null) throw new Error("adams er ikke initialisert");
        // SVAR SOM ALLEREDE ER FOR SENT, REGNES IKKE UT. En worker er én tråd:
        // et søk som bommet på fristen blokkerer køen, og uten denne sjekken
        // ville neste forespørsel starte etter at DENS frist også var ute —
        // og så videre. Her tømmes køen på mikrosekunder.
        if (m.frist !== undefined && veggklokke() >= m.frist) {
          post({ id: m.id, utløpt: true, forsinketMs: veggklokke() - m.frist });
          return;
        }
        const t0 = performance.now();
        const før = sik === null ? null : { ...sik.tellere };
        const handling = adams.velgHandling(m.state);
        const utfall = sik === null || før === null ? null : lesUtfall(før, sik.tellere);
        post({ id: m.id, handling, utfall, ms: Math.round(performance.now() - t0) });
      } catch (feil) {
        post({ id: m.id, feil: String(feil) });
      }
      return;
    }

    const ukjent = m as { type?: unknown; id?: unknown };
    post({ id: typeof ukjent.id === "number" ? ukjent.id : -1, feil: `ukjent meldingstype «${String(ukjent.type)}»` });
  };
}
