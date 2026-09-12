/**
 * MENNESKELOGGEN — ÉN LESER OG ÉN GJENSKAPING AV DE SPILTE RUNDENE (11. sep).
 *
 * Tre skript leser `D:/amb-grp/menneske/hendelser.jsonl` (`menneske-eksport.ts`):
 * `duplikat-menneske.ts` (K1), `menneske-tro.ts` (K8 og K6 mot mennesker) og
 * `mlb-trodata.ts --menneske` (trosdata fra menneskekamper). Leseren og gjenskapingen står
 * her ÉN gang. To parsere av samme logg er to steder en rundeslutt kan forsvinne, og det
 * har alt skjedd én gang (`duplikat-menneske.ts`, 11. sep).
 *
 * ===================== HVA LOGGEN HAR, OG HVA DEN MANGLER ================
 *
 * `runde`-hendelsen har hele den offentlige runden: stikkene med avsender (`historikk`),
 * vraket, trumf, det kalte kortet, budvinneren, `delta` og `totalPoeng`. Motoren deler ut
 * DETERMINISTISK (`delUt(frø, rundeNr)`), og frøet står i `start`. Da er alle fire hendene
 * og talongen kjent. Målt 11. sep: i 2641 av 2641 runder fra 10. aug er hvert setes spilte
 * kort (pluss vraket for budvinneren) nøyaktig hånden som gjenskapes.
 *
 * BUDRUNDEN mangler. Feltet `budrunde` står i 1 av de 2641 rundene (eksporten fikk det
 * 11. sep). Loggen har menneskets egne bud (`valg-bud`) og `budvinner`-hendelsen (hvem, og
 * med hvilket bud), men ikke botenes mellombud. De er OFFENTLIGE: `spillerVisning` bærer
 * `budrunde.sisteBud` og `passet`, trohodets grunnblokk leser dem (`BUD_HIST`, `PASSET` i
 * `neat/trekk.ts`), og hukommelsen bokfører `budavvik`, `budandel` og `passtyrke` av dem.
 * Å sette dem til null ville vært å vise nettet et bord der ingen bot bød.
 *
 * Budrunden SPILLES DERFOR OM med budgiverne mennesket møtte (`V5_KJEDE`), med menneskets
 * bud tvunget i loggens rekkefølge, og GODTAS BARE når den ender i loggens budvinner og
 * kontrakt. Målt 11. sep: 2636 av 2641 runder med speken alene. Resten løses med MINST MULIG
 * AVVIK: iterativ fordypning over botbud som avviker fra speken (0, 1, 2 …). Dybde d−1 er
 * gjennomsøkt uten løsning før dybde d prøves, så den første løsningen på dybde d har
 * nøyaktig d avvik. Tallet følger runden (`budavvik`), så en rapport kan skille dem ut. Der
 * loggen HAR `budrunde`, må gjenskapingen være lik feltet, ellers avvises runden.
 *
 * ===================== GJENSKAPINGEN ER EN KONTROLL, IKKE ET ANSLAG ======
 *
 * Etter budrunden utføres vraket, trumfvalget og hvert eneste kort gjennom `utfør`, som
 * KASTER på ulovlig trekk og feil tur. Til slutt må motorens `delta` og `totalPoeng` være
 * loggens. En runde som ikke består, blir aldri tilstander — den telles, med grunn.
 *
 * Tilstandene er ekte `GameState`: `spillerVisning(s, sete)` er nøyaktig det setet så i det
 * øyeblikket, og `troFasit(s, sete)` er etiketten. Ingen bot velger et kort; bare budene som
 * ikke står i loggen gjenskapes, og de er kontrollert mot budvinneren og kontrakten.
 *
 * ===================== RUNDESLUTT OG HULL ================================
 *
 * Bøkene (`Hukommelse`, søketroen) bokfører bare `RUNDE_SLUTT`. En runde som løfter noen over
 * målet ender i FERDIG; `somRundeslutt` viser den som RUNDE_SLUTT — samme fiks som
 * `duplikat-menneske.ts` fikk 11. sep. Et hull i rundefølgen, eller en runde som ikke lar seg
 * gjenskape, gir `nyBok`: kortere hukommelse, aldri gal.
 *
 * ===================== NAVN ===============================================
 *
 * `spiller` i loggen er et PSEUDONYM (`menneske-eksport.ts`). Her brukes det bare til å velge
 * en kamp med en ANNEN spiller (fella i `menneske-tro.ts`). Det skrives aldri ut.
 */

import { readFileSync } from "node:fs";

import { lovligeHandlinger, opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { TEMPOFASER, type Tempofase, type Tempohendelse } from "../src/mlb/tempotrekk.ts";
import type { Farge, Kort, Verdi } from "../src/kort.ts";
import type { Bud } from "../src/regler.ts";
// Pseudonymformen håndheves ETT sted (`src/mlb/profil.ts`), ikke skrevet opp igjen her.
import { gyldigId } from "../src/mlb/profil.ts";

/** Mennesket sitter i sete 0 i hver kamp i Val Town. */
export const MENNESKE = 0;
/** Fra denne datoen møtte mennesket v5-kjeden (K1 måles herfra). */
export const MENNESKE_FRA = "2026-08-10";
/** Kjeden mennesket møtte fra 10. aug (v5, `bud-menneske`): motstanderne i K1, budgiverne her. */
export const V5_KJEDE =
  "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";

export interface Hendelse {
  id: number;
  tid: string;
  spillId: string;
  spiller: string;
  type: string;
  data: Record<string, unknown>;
}

export interface Vinnerbud {
  readonly spiller: number;
  readonly bud: Bud;
}

export interface Menneskekamp {
  start: Hendelse | null;
  runder: Hendelse[];
  /** Menneskets egne bud per rundeNr, i loggens rekkefølge (`valg-bud`). */
  bud: Map<number, Bud[]>;
  /** `budvinner`-hendelsen per rundeNr. */
  budvinner: Map<number, Vinnerbud>;
}

/**
 * Hele loggen, gruppert per kamp. Rekkefølgen i kartet er den `duplikat-menneske.ts` alltid
 * har hatt: en kamp får plass ved sin første `start`- eller `runde`-hendelse. Budhendelsene
 * samles ved siden av og hektes på til slutt, så de flytter aldri en kamp i rekkefølgen.
 */
export function lesMenneskelogg(sti: string): Map<string, Menneskekamp> {
  const spill = new Map<string, Menneskekamp>();
  const bud = new Map<string, Map<number, Bud[]>>();
  const vinner = new Map<string, Map<number, Vinnerbud>>();
  for (const linje of readFileSync(sti, "utf8").split("\n")) {
    if (linje === "") continue;
    const h = JSON.parse(linje) as Hendelse;
    if (h.type === "valg-bud" || h.type === "budvinner") {
      const nr = Number(h.data["rundeNr"]);
      if (!Number.isFinite(nr)) continue;
      if (h.type === "valg-bud") {
        const m = bud.get(h.spillId) ?? new Map<number, Bud[]>();
        m.set(nr, [...(m.get(nr) ?? []), h.data["bud"] as Bud]);
        bud.set(h.spillId, m);
      } else {
        const m = vinner.get(h.spillId) ?? new Map<number, Vinnerbud>();
        m.set(nr, { spiller: Number(h.data["spiller"]), bud: h.data["bud"] as Bud });
        vinner.set(h.spillId, m);
      }
      continue;
    }
    if (h.type !== "start" && h.type !== "runde") continue;
    const s = spill.get(h.spillId) ?? { start: null, runder: [], bud: new Map(), budvinner: new Map() };
    if (h.type === "start") s.start = h;
    else s.runder.push(h);
    spill.set(h.spillId, s);
  }
  for (const [id, s] of spill) {
    s.bud = bud.get(id) ?? new Map();
    s.budvinner = vinner.get(id) ?? new Map();
  }
  return spill;
}

/** FNV-1a over kamp-id: skard, halvdeler og bånd. Samme hash som K1-dommen bruker. */
export const fnv = (s: string): number => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
  return x;
};

/** Stabil skardfordeling på spill-id. */
export const skardAv = (id: string, n: number): number => fnv(id) % n;

/** Replikasjonshalvdelen (0/1): `fnv(id) % 2`, samme deling som K1-dommen. */
export const halvdel = (id: string): number => fnv(id) % 2;

/**
 * Avalanche-blanding (murmur3 `fmix32`). FNV-1a alene blander ikke de LAVE bitene: den laveste
 * biten i `fnv(s)` er bare pariteten til tegnenes laveste bit, og en fast salt flytter den med en
 * konstant. Målt 11. sep: `fnv("hold:" + id) % 4 === 0` la ALLE 76 holdout-kampene i halvdel 1,
 * så «trening mot holdout» og «halvdel 0 mot 1» var samme deling. Etter blandingen avhenger hver
 * utgangsbit av alle inngangsbitene.
 */
export const bland = (h: number): number => {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
};

/**
 * ===================== ÉN SPILLER, OG ET SNITT I TIDEN (12. sep) ==========
 *
 * `menneskeBånd` deler på kamp-id og blander ALLE spillerne i ett korpus. Det er riktig for
 * trohodene, som skal lære «mennesker», men galt for en MODELL AV ÉN SPILLER: en klone som
 * skal brukes som antatt policy mot nettopp ham, må trenes på hans kamper og dømmes på hans
 * ANDRE kamper.
 *
 * To ting kreves, og de er ikke det samme:
 *
 *   `erSpiller`   velger kampene ett pseudonym spilte. Prefiks, ikke hele pseudonymet, så en
 *                 kommandolinje og en rapport slipper å bære id-en i full lengde. Formen
 *                 håndheves av `gyldigId` — SAMME regel som profilfilene bruker, hentet
 *                 derfra og ikke skrevet opp igjen: et navn skal ikke kunne bli et filter,
 *                 og en id skal ikke kunne bli en sti ut av katalogen.
 *   `tidsside`    deler på KAMP, ikke på runde. En kamp som spenner over snittet hører ingen
 *                 steder hjemme og gis `null` — kalleren skal TELLE den, ikke gjette. Delte
 *                 vi på rundetidspunkt, ville de tidlige rundene i en kamp vært trening og de
 *                 sene holdout, og holdouten hadde inneholdt kamper klonen alt hadde sett
 *                 halve av. Det er nøyaktig giv-lekkasjen `sd-tren.py` stopper for.
 */
export const spillerAv = (k: Menneskekamp): string => k.start?.spiller ?? "";

/** Kampens første og siste rundetidspunkt. `null` når kampen ikke har en eneste runde. */
export function kampSpenn(k: Menneskekamp): { fra: string; til: string } | null {
  let fra: string | null = null;
  let til: string | null = null;
  for (const r of k.runder) {
    if (fra === null || r.tid < fra) fra = r.tid;
    if (til === null || r.tid > til) til = r.tid;
  }
  return fra === null || til === null ? null : { fra, til };
}

/**
 * Kampene ETT pseudonym spilte, valgt på prefiks. Tom prefiks = alle, som før.
 *
 * Pseudonymet skrives aldri ut herfra; kalleren eier utskriften og skal bare bruke prefikset.
 */
export function erSpiller(k: Menneskekamp, prefiks: string): boolean {
  if (prefiks === "") return true;
  if (!gyldigId(prefiks)) throw new Error(`Ugyldig spillerprefiks – forventet 1–32 hex (samme form som profilfilene)`);
  return spillerAv(k).startsWith(prefiks);
}

/** Hvilken side av snittet HELE kampen ligger på. `null` = den spenner over snittet. */
export type Tidsside = "foer" | "etter";
export function tidsside(k: Menneskekamp, snitt: string): Tidsside | null {
  const s = kampSpenn(k);
  if (s === null) return null;
  if (s.til < snitt) return "foer";
  if (s.fra >= snitt) return "etter";
  return null;
}

export type Menneskebånd = "trening" | "holdout";
/**
 * TRENINGSBÅNDENE FOR MENNESKEKAMPER, avsatt på kamp-id før første rad: hver fjerde kamp er
 * holdout. Egen salt og `bland`, så båndet er uavhengig av halvdelene og skardene over
 * (`test/mlb-trodata-menneske.test.ts` holder det). Et trohode trent på `trening` skal bare
 * dømmes på `holdout`.
 */
export const menneskeBånd = (id: string): Menneskebånd => (bland(fnv(`hold:${id}`)) % 4 === 0 ? "holdout" : "trening");

const FARGEKODE: Record<string, string> = { S: "S", H: "H", R: "R", K: "K" };
/** Loggens historikk: stikk som [[spiller, farge, verdi], …]. Gir setets spilte kort som «S14». */
export function spilteKort(historikk: unknown, sete: number): string[] {
  const ut: string[] = [];
  if (!Array.isArray(historikk)) return ut;
  for (const stikk of historikk) {
    if (!Array.isArray(stikk)) continue;
    for (const k of stikk) {
      if (Array.isArray(k) && k[0] === sete) ut.push(`${FARGEKODE[String(k[1])] ?? "?"}${k[2]}`);
    }
  }
  return ut;
}

/**
 * Samme stilling som mennesket møtte: runde 0 rett fra frøet, ellers en RUNDE_SLUTT rett før
 * og NESTE — da deler motoren selv ut runden, med sin egen giverrotasjon.
 */
export function stillingFør(frø: number, målPoeng: number, rundeNr: number, før: number[]): GameState {
  const grunn = opprettSpill({ antallSpillere: 4, målPoeng }, frø);
  return rundeNr === 0
    ? { ...grunn, totalPoeng: før }
    : utfør({ ...grunn, fase: "RUNDE_SLUTT", iTur: null, rundeNr: rundeNr - 1, giver: (rundeNr - 1) % 4, totalPoeng: før }, { type: "NESTE" }).state;
}

/**
 * KAMPSLUTT VISES SOM RUNDESLUTT. Ingen ny informasjon: hendene er tomme og historikken den
 * samme; bare kampslutten tas bort, og den finnes ikke for boka som skal se neste runde.
 */
export const somRundeslutt = (s: GameState): GameState => (s.fase === "FERDIG" ? { ...s, fase: "RUNDE_SLUTT", vinner: null } : s);

function kortFra(x: unknown): Kort | null {
  if (Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "number") return { farge: x[0] as Farge, verdi: x[1] as Verdi };
  if (x !== null && typeof x === "object" && "farge" in x && "verdi" in x) {
    const k = x as { farge: unknown; verdi: unknown };
    if (typeof k.farge === "string" && typeof k.verdi === "number") return { farge: k.farge as Farge, verdi: k.verdi as Verdi };
  }
  return null;
}

const likeTall = (a: readonly unknown[] | undefined, b: readonly unknown[]): boolean =>
  a !== undefined && a.length === b.length && a.every((x, i) => x === b[i]);

/** Det gjenskapingen trenger av en agent: budet i budrunden. */
export interface Budgiver {
  velgHandling(s: GameState): Handling;
  nyKamp?(): void;
}

/**
 * BUDRUNDEN MED MINST AVVIK. Menneskets bud er tvunget; hver bot byr som speken, og et avvik
 * koster 1. Godtatt bare om budrunden ender i `fasit` med alle menneskets bud brukt, og uten
 * at alle passer (det gir ny giv, og da er det ikke loggens runde).
 */
function budrunden(
  start: GameState,
  mine: readonly Bud[],
  fasit: Vinnerbud,
  budgivere: readonly Budgiver[],
  maksAvvik: number,
): { tilstander: GameState[]; avvik: number } | null {
  const rundeNr = start.rundeNr;
  const løs = (s: GameState, i: number, igjen: number, spor: GameState[]): GameState[] | null => {
    if (s.rundeNr !== rundeNr) return null;
    if (s.fase !== "BUDRUNDE") {
      return i === mine.length && s.budvinner === fasit.spiller && s.budrunde.høyeste?.bud === fasit.bud ? spor : null;
    }
    const p = s.iTur;
    const lov = lovligeHandlinger(s);
    if (p === null || lov.fase !== "BUDRUNDE") return null;
    const neste = (bud: Bud): GameState | null => (lov.bud.includes(bud) ? utfør(s, { type: "BUD", spiller: p, bud }).state : null);
    if (p === MENNESKE) {
      const b = i < mine.length ? neste(mine[i]!) : null;
      return b === null ? null : løs(b, i + 1, igjen, [...spor, b]);
    }
    const h = budgivere[p]!.velgHandling(s);
    const valgt = h.type === "BUD" && lov.bud.includes(h.bud) ? h.bud : null;
    const kandidater = valgt === null ? lov.bud : [valgt, ...lov.bud.filter((b) => b !== valgt)];
    for (let j = 0; j < kandidater.length; j++) {
      const kost = valgt !== null && j === 0 ? 0 : 1;
      if (kost > igjen) break;
      const b = neste(kandidater[j]!);
      if (b === null) continue;
      const r = løs(b, i, igjen - kost, [...spor, b]);
      if (r !== null) return r;
    }
    return null;
  };
  for (let d = 0; d <= maksAvvik; d++) {
    const spor = løs(start, 0, d, []);
    if (spor !== null) return { tilstander: spor, avvik: d };
  }
  return null;
}

/**
 * ===================== TENKETIDEN, DER LOGGEN HAR DEN (12. sep) ==========
 *
 * Fra v13 (`web/tempo.ts`, 11. sep) bærer `runde`-raden en `tempo`-liste: én post per
 * MENNESKEBESLUTNING i runden, i rekkefølge, med `{fase, stikk?, ms, skjultMs?,
 * ufokusMs?, angre?}`. Mennesket sitter i sete 0 i hver Val Town-kamp (`MENNESKE`), og
 * appen logger bare sine egne beslutninger — derfor er `sete` alltid `MENNESKE` her.
 *
 * SKILLET SOM MÅ STÅ: `null` betyr «loggen har ingen tider for denne runden», og en TOM
 * liste betyr «feltet sto der, men ingen post var lesbar». De er ikke det samme som
 * «spilleren brukte null tid», og en sans som forveksler dem lærer at gamle runder ble
 * spilt lynraskt. Målt 12. sep: 67 av 86 runder etter v13 har feltet; alle 4 448 runder
 * før har det ikke.
 *
 * BOTENES REGNETID KOMMER ALDRI HERFRA. Den står i `bottrekk`-raden, som denne funksjonen
 * ikke leser — den tar en `runde`-hendelse og henter bare `data.tempo`. Blandes de to,
 * måler «tenketid» hvor mye CPU søket fikk. `test/mlb-tempo.test.ts` har fella.
 */
export function rundeTempo(r: Hendelse): Tempohendelse[] | null {
  const rå = r.data["tempo"];
  if (!Array.isArray(rå)) return null;
  const ut: Tempohendelse[] = [];
  for (const x of rå) {
    if (x === null || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const fase = o["fase"];
    const ms = Number(o["ms"]);
    // En post uten lesbar fase eller tid er ikke en post: et gjettet tall er verre enn
    // et manglende, som i `web/tempo.ts` sin egen `stopp()`.
    if (typeof fase !== "string" || !TEMPOFASER.includes(fase as Tempofase) || !Number.isFinite(ms) || ms < 0) continue;
    const stikk = Number(o["stikk"]);
    const tall = (n: unknown): number => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0);
    ut.push({
      sete: MENNESKE,
      fase: fase as Tempofase,
      stikk: Number.isFinite(stikk) ? stikk : null,
      ms,
      skjultMs: tall(o["skjultMs"]),
      ufokusMs: tall(o["ufokusMs"]),
      angre: tall(o["angre"]),
    });
  }
  return ut;
}

export type Avvisning = "ingen start" | "ufullstendig" | "budrunde" | "budrundefelt" | "ulovlig" | "delta";

export interface GjenskaptRunde {
  /** Hver tilstand fra utdelingen til rundeslutt, i rekkefølge. Den siste er RUNDE_SLUTT eller FERDIG. */
  readonly tilstander: GameState[];
  /** Botbud som måtte avvike fra budspeken for å nå loggens budvinner og kontrakt. 0 = speken alene. */
  readonly budavvik: number;
  /**
   * TENKETIDEN til den som handlet, i beslutningsrekkefølge — eller `null` når loggen
   * ikke har den. `null` er tilfellet for de aller fleste runder: feltet kom med v13
   * 11. sep, og alt før det er stumt. Se `rundeTempo`.
   */
  readonly tempo: Tempohendelse[] | null;
}

/** Én loggført runde som ekte tilstander — eller en avvisning med grunn. */
export function gjenskapRunde(
  kamp: Menneskekamp,
  r: Hendelse,
  budgivere: readonly Budgiver[],
  maksAvvik = 2,
): GjenskaptRunde | { avvist: Avvisning; melding: string } {
  if (kamp.start === null) return { avvist: "ingen start", melding: "kampen har ingen start-hendelse" };
  const frø = Number(kamp.start.data["frø"]);
  const målPoeng = Number(kamp.start.data["målPoeng"] ?? 100);
  const d = r.data;
  const rundeNr = Number(d["rundeNr"]);
  const delta = d["delta"];
  const total = d["totalPoeng"];
  const historikk = d["historikk"];
  const vrak = d["vrak"];
  const trumf = d["trumf"];
  const fasit = kamp.budvinner.get(rundeNr);
  if (
    !Number.isFinite(frø) || !Number.isFinite(rundeNr) || !Array.isArray(delta) || delta.length !== 4 ||
    !Array.isArray(total) || total.length !== 4 || !Array.isArray(historikk) || !Array.isArray(vrak) ||
    typeof trumf !== "string" || fasit === undefined
  ) {
    return { avvist: "ufullstendig", melding: `runde ${rundeNr}: loggen mangler felt` };
  }
  const før = (total as number[]).map((t, p) => t - ((delta as number[])[p] ?? 0));
  const start = stillingFør(frø, målPoeng, rundeNr, før);
  const bud = budrunden(start, kamp.bud.get(rundeNr) ?? [], fasit, budgivere, maksAvvik);
  if (bud === null) return { avvist: "budrunde", melding: `runde ${rundeNr}: ingen budrunde med ≤ ${maksAvvik} avvik ender i loggens budvinner` };
  const tilstander = [start, ...bud.tilstander];
  let s = tilstander[tilstander.length - 1]!;
  const felt = d["budrunde"] as { sisteBud?: unknown[]; passet?: unknown[] } | undefined | null;
  if (felt !== undefined && felt !== null && (!likeTall(felt.sisteBud, s.budrunde.sisteBud) || !likeTall(felt.passet, s.budrunde.passet))) {
    return { avvist: "budrundefelt", melding: `runde ${rundeNr}: gjenskapt budrunde er ulik loggens budrunde-felt` };
  }
  try {
    const legg = (h: Handling): void => {
      s = utfør(s, h).state;
      tilstander.push(s);
    };
    const bv = s.budvinner!;
    if (s.fase === "VRAK") {
      const kort = (vrak as unknown[]).map(kortFra);
      if (kort.some((k) => k === null)) throw new Error("vraket har et kort loggen ikke kan lese");
      legg({ type: "VRAK", spiller: bv, kort: kort as Kort[] });
    }
    const kalt = d["etterlyst"] === null || d["etterlyst"] === undefined ? null : kortFra(d["etterlyst"]);
    legg({ type: "VELG", spiller: bv, trumf: trumf as Farge, etterlyst: kalt });
    for (const stikk of historikk as unknown[]) {
      if (!Array.isArray(stikk)) throw new Error("stikk er ikke en liste");
      for (const x of stikk) {
        const k = Array.isArray(x) ? kortFra([x[1], x[2]]) : null;
        if (k === null || !Array.isArray(x) || typeof x[0] !== "number") throw new Error("kort i historikken kan ikke leses");
        legg({ type: "SPILL", spiller: x[0], kort: k });
      }
    }
  } catch (e) {
    return { avvist: "ulovlig", melding: `runde ${rundeNr}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG") return { avvist: "ulovlig", melding: `runde ${rundeNr}: runden ble ikke ferdig` };
  if (!likeTall(s.sisteRunde?.delta, delta) || !likeTall(s.totalPoeng, total)) {
    return { avvist: "delta", melding: `runde ${rundeNr}: motorens poeng er ikke loggens` };
  }
  return { tilstander, budavvik: bud.avvik, tempo: rundeTempo(r) };
}

export interface Rundesteg {
  readonly hendelse: Hendelse;
  readonly rundeNr: number;
  /** Boka må startes på nytt FØR denne rundens tilstander: hull i følgen, eller runden ble avvist. */
  readonly nyBok: boolean;
  readonly runde: GjenskaptRunde | null;
  readonly avvist: Avvisning | null;
}

export interface Rundeteller {
  runder: number;
  gjenskapt: number;
  /** Gjenskapte runder der minst ett botbud avvek fra budspeken. */
  medBudavvik: number;
  /** Runder der motoren nådde målet (vist som RUNDE_SLUTT). */
  kampslutt: number;
  brudd: number;
  avvist: Record<string, number>;
}

export const nyTeller = (): Rundeteller => ({ runder: 0, gjenskapt: 0, medBudavvik: 0, kampslutt: 0, brudd: 0, avvist: {} });

export const tellerTekst = (t: Rundeteller): string =>
  `${t.gjenskapt}/${t.runder} runder gjenskapt (${t.medBudavvik} med budavvik, ${t.kampslutt} kampslutt vist som rundeslutt, ` +
  `${t.brudd} brudd i rundefølgen; avvist: ${JSON.stringify(t.avvist)})`;

/**
 * KAMPEN RUNDE FOR RUNDE, i rundefølge. Budgiverne får `nyKamp` først. Forbrukeren eier boka:
 * ny bok per kamp, og ny bok der `nyBok` er sann.
 */
export function* kamprunder(kamp: Menneskekamp, budgivere: readonly Budgiver[], teller: Rundeteller = nyTeller()): Generator<Rundesteg> {
  for (const b of budgivere) b.nyKamp?.();
  let sett: number | null = null;
  for (const r of [...kamp.runder].sort((a, b) => Number(a.data["rundeNr"]) - Number(b.data["rundeNr"]))) {
    const rundeNr = Number(r.data["rundeNr"]);
    teller.runder++;
    let nyBok = false;
    if (sett !== null && rundeNr !== sett + 1) {
      nyBok = true;
      teller.brudd++;
      sett = null;
    }
    const g = gjenskapRunde(kamp, r, budgivere);
    if ("avvist" in g) {
      teller.avvist[g.avvist] = (teller.avvist[g.avvist] ?? 0) + 1;
      sett = null;
      yield { hendelse: r, rundeNr, nyBok: true, runde: null, avvist: g.avvist };
      continue;
    }
    teller.gjenskapt++;
    if (g.budavvik > 0) teller.medBudavvik++;
    if (g.tilstander[g.tilstander.length - 1]!.fase === "FERDIG") teller.kampslutt++;
    sett = rundeNr;
    yield { hendelse: r, rundeNr, nyBok, runde: g, avvist: null };
  }
}
