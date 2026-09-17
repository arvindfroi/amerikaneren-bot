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
  tilBytes,
  type AdamsKonfig,
  type Søkeutfall,
} from "./adamskjede.ts";
import { Bokvakt, byggHelbotsete, type Helbotsete } from "./helbot.ts";
import { leggInnFil } from "./nettleser/fs.ts";
import { simdTilgjengelig } from "../src/nevro/nett-simd.ts";

/**
 * PROTOKOLL 4 (17. sep, A/B-demoen): `helbot-init` bygger Adams Max (arm B) med
 * spekparseren, én agent per sete, og da går ALLE botbeslutninger for de setene hit —
 * bud, vrak, trumf og kort. Kvitteringen på `helbot-init` bærer 4; `adams-init` kvitteres
 * fortsatt med `SØKEPROTOKOLL` (3), så arm A logger som før.
 */
export const HELBOTPROTOKOLL = 4;

export type Initmelding = {
  readonly type: "adams-init";
  readonly kort: string;
  readonly bud: unknown;
  readonly vrak: string | null;
  /** MLB-trohodet som base64. Leses bare når `troISøk` er satt (se `AdamsKonfig`). */
  readonly tro: string | null;
  /**
   * BudQ-nettet som base64. Leses bare når `budqPå` er satt. Workeren MÅ få det samme
   * nettet som hovedtråden: søkets utspillinger byr som boten, og ellers måler søket en
   * annen kjede enn den som spiller.
   */
  readonly budq?: string | null;
} & AdamsKonfig;

/** Arm B. `filer` er spekstien → base64; `seter` er setene workeren fører. */
export type Helbotinit = {
  readonly type: "helbot-init";
  readonly spek: string;
  readonly filer: Readonly<Record<string, string>>;
  readonly seter: readonly number[];
  /** Nødbremsen i ms per kortvalg, eller `null` (ingen frist – bare til måling). */
  readonly fristMs: number | null;
  /** BARE BENKEN: later som WASM-SIMD mangler, så JS-reserven kan prøves i en nettleser som har den. */
  readonly utenSimd?: boolean;
};

export type TilWorker =
  | Initmelding
  | Helbotinit
  /** `frist` er `Date.now()`-tid. Hovedtråd og worker deler veggklokka, ikke `performance.now()`. */
  | { readonly type: "adams-trekk"; readonly id: number; readonly state: GameState; readonly sete: number; readonly frist?: number }
  | { readonly type: "nyKamp" }
  /**
   * Protokoll 3. Den ferdige runden, så søketroens hukommelse (K6 → K8) ser den —
   * workeren blir aldri spurt om et trekk ved `RUNDE_SLUTT`. Ingen svar.
   */
  | { readonly type: "rundeslutt"; readonly state: GameState };

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
      /** Protokoll 3: trohodet sitter i søket. */
      readonly tro?: boolean;
      readonly ms: number;
      /** Protokoll 4: helboten er bygd, og om WASM-SIMD-kjernen er tilgjengelig. */
      readonly helbot?: boolean;
      readonly simd?: boolean;
    }
  | { readonly id: 0; readonly klar: false; readonly protokoll: number; readonly feil: string }
  | {
      readonly id: number;
      readonly handling: Handling;
      readonly utfall: Søkeutfall | null;
      readonly ms: number;
      /** Protokoll 3: parret σ og verdener som faktisk ble spilt ut, når søket vurderte. */
      readonly sigma?: number;
      readonly n?: number;
      /** Protokoll 4: fristen kuttet verdener i dette kortvalget. */
      readonly nødbrems?: boolean;
      /** Protokoll 4: en runde manglet i hukommelsen, og bøkene ble nullet før trekket. */
      readonly bokbrudd?: boolean;
    }
  | { readonly id: number; readonly utløpt: true; readonly forsinketMs: number }
  | { readonly id: number; readonly feil: string };

export function lagSøkekjerne(
  post: (m: FraWorker) => void,
  veggklokke: () => number = () => Date.now(),
): (m: TilWorker) => void {
  let adams: Velger | null = null;
  let sik: Sikkerorakel | null = null;
  /** Arm B: én kjede per sete. Settes av `helbot-init` og nulles av `adams-init`. */
  let helbot: Map<number, Helbotsete> | null = null;
  /** Nødbremsens frist for helboten, eller null. */
  let helbotFrist: number | null = null;
  const bokvakt = new Bokvakt();

  return (m) => {
    if (m.type === "helbot-init") {
      const t0 = performance.now();
      try {
        adams = null;
        sik = null;
        helbot = null;
        if (m.utenSimd === true) {
          // Før første `forover`: modulbufferen i `nett-simd.ts` fylles ved første kall.
          (WebAssembly as unknown as { validate: () => boolean }).validate = () => false;
        }
        for (const [sti, b64] of Object.entries(m.filer)) leggInnFil(sti, tilBytes(b64));
        const kart = new Map<number, Helbotsete>();
        for (const sete of m.seter) kart.set(sete, byggHelbotsete(m.spek, m.fristMs));
        helbot = kart;
        helbotFrist = m.fristMs;
        bokvakt.nyKamp();
        post({
          id: 0,
          klar: true,
          protokoll: HELBOTPROTOKOLL,
          verdener: 0,
          sigma: 0,
          bud: false,
          vrak: true,
          søk: [...kart.values()].every((h) => h.sik !== null),
          tro: [...kart.values()].every((h) => h.sik?.tro != null),
          helbot: true,
          simd: simdTilgjengelig(),
          ms: Math.round(performance.now() - t0),
        });
      } catch (feil) {
        helbot = null;
        post({ id: 0, klar: false, protokoll: HELBOTPROTOKOLL, feil: `helbot-init: ${String(feil)}` });
      }
      return;
    }

    if (m.type === "adams-init") {
      // Bygges HER, ikke sendes ferdig: agenter kan ikke krysse en
      // meldingsgrense. Vektene kommer som base64 fra hovedtråden, som alt har
      // hentet dem – ingen dobbel nedlasting av sju megabyte.
      const t0 = performance.now();
      try {
        helbot = null;
        const bygd = byggAdams({ kort: m.kort, bud: m.bud, vrak: m.vrak, tro: m.tro, budq: m.budq ?? null }, m, true);
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
          tro: bygd.tro,
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
      if (helbot !== null) {
        for (const h of helbot.values()) h.agent.nyKamp();
        bokvakt.nyKamp();
      }
      return;
    }

    if (m.type === "rundeslutt") {
      // Kjeden sender tilstanden innover (`Vrakrangerer` → `Sikkerorakel` → søketroen).
      // Et kast her skal ikke drepe workeren; neste trekk melder feilen med sin id.
      try {
        adams?.observer?.(m.state);
        if (helbot !== null) {
          for (const h of helbot.values()) (h.agent as { observer?(s: GameState): void }).observer?.(m.state);
          bokvakt.slutt(m.state);
        }
      } catch (feil) {
        console.warn("rundeslutt kunne ikke bokføres:", feil);
      }
      return;
    }

    if (m.type === "adams-trekk" && helbot !== null) {
      try {
        const h = helbot.get(m.sete);
        if (h === undefined) throw new Error(`helboten fører ikke sete ${m.sete}`);
        if (m.frist !== undefined && veggklokke() >= m.frist) {
          post({ id: m.id, utløpt: true, forsinketMs: veggklokke() - m.frist });
          return;
        }
        let bokbrudd = false;
        if (bokvakt.brudd(m.state)) {
          for (const x of helbot.values()) x.agent.nyKamp();
          bokvakt.nyKamp();
          bokvakt.brudd(m.state);
          bokbrudd = true;
        }
        const t0 = performance.now();
        const før = h.sik === null ? null : { ...h.sik.tellere };
        const handling = h.agent.velgHandling(m.state);
        const utfall = h.sik === null || før === null ? null : lesUtfall(før, h.sik.tellere);
        const siste = h.sik?.siste ?? null;
        /**
         * NØDBREMS = FRISTEN kuttet verdener. `avkortet` teller også flat-stoppet (`~flat=`, S1), som
         * stopper tidlig fordi valget er avgjort — det er ingen brems. Fristen slår bare inn når
         * søket har brukt hele budsjettet, så tiden skiller dem.
         */
        const nødbrems =
          h.sik !== null && før !== null && helbotFrist !== null && siste !== null &&
          h.sik.tellere.avkortet > før.avkortet && siste.ms >= helbotFrist;
        post({
          id: m.id,
          handling,
          utfall,
          ms: Math.round(performance.now() - t0),
          ...(siste === null ? {} : { sigma: Math.round(siste.sigma * 100) / 100, n: siste.n }),
          ...(nødbrems ? { nødbrems: true } : {}),
          ...(bokbrudd ? { bokbrudd: true } : {}),
        });
      } catch (feil) {
        post({ id: m.id, feil: String(feil) });
      }
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
        const siste = sik?.siste ?? null;
        post({
          id: m.id,
          handling,
          utfall,
          ms: Math.round(performance.now() - t0),
          ...(siste === null ? {} : { sigma: Math.round(siste.sigma * 100) / 100, n: siste.n }),
        });
      } catch (feil) {
        post({ id: m.id, feil: String(feil) });
      }
      return;
    }

    const ukjent = m as { type?: unknown; id?: unknown };
    post({ id: typeof ukjent.id === "number" ? ukjent.id : -1, feil: `ukjent meldingstype «${String(ukjent.type)}»` });
  };
}
