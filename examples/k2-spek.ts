/**
 * K2 FOR EN VILKÅRLIG SPEK — i alle faser, med kontrollarmer som MÅ bli tatt (11. sep).
 *
 *   node examples/k2-spek.ts --spek "<hele boten>" --giver 8 --verdener 4 \
 *     --faser bud,vrak,velg,spill --fra-stikk 0 --til-stikk 3 --ut analyse/k2-spek.json
 *
 * ============ HVORFOR DEN FINNES ========================================
 *
 * `test/k2-aldri-jukse.test.ts` og `test/k2-alle-faser.test.ts` prøver to FASTE
 * speker, og `prøv(spek)` er privat. Hele boten — `okt:vr:…:eks:…:profil:sik:…:budq:…`
 * — hadde derfor aldri vært gjennom K2. Den har tre lag de testene aldri har sett
 * sammen: eksakt sluttspill (enumererer verdener), søket med MLB-troen (trekker
 * verdener vektet av et nett) og BudQ. Alle tre håndterer skjult informasjon.
 *
 * ============ PRØVEN =====================================================
 *
 * For hver prøvestilling: beslutningen i den EKTE stillingen mot beslutningen i K
 * verdener som er forenlige med det setet har sett (`trekkVerdener` + `medVerden`,
 * nøyaktig som testene). Ett avvik er juks. Ingen margin.
 *
 * ============ STOKASTISK SØK: FERSK AGENT MED FAST FRØ PER KALL ===========
 *
 * `Sikkerorakel`, `Alphamuagent` og budsøket lager RNG-en sin i konstruktøren med et
 * FAST frø (`lagRng(opts.frø ?? 20_260_804)`), og den går framover for hvert kall. To
 * kall på samme agent er derfor ikke sammenliknbare — prøven ville målt RNG-posisjon.
 * En FERSK agent per kall starter på samme frø, bruker samme antall trekninger så
 * lenge den ærlig ser det samme, og gir dermed samme valg. Det er ikke en omgåelse:
 * er valget en funksjon av bare det synlige, er det likt; leser noe det skjulte,
 * endres enten valget eller RNG-forbruket, og begge gir avvik.
 *
 * DETERMINISMEN SJEKKES PER STILLING: fersk agent to ganger på den ekte stillingen.
 * Er de ulike, kan prøven ikke skille støy fra juks, stillingen telles som
 * `ikkeDeterministisk`, og dommen blir STUM i stedet for grønn. (Agent A bygger et
 * deterministisk per-beslutning-frø for `sik`; med det blir også en VEDVARENDE agent
 * sammenliknbar, og da kan prøven utvides til hukommelse på tvers av runder.)
 *
 * ============ FLERSTEGSTILSTAND: VELG KREVER VRAK FØRST ==================
 *
 * `Vrakrangerer` velger trumf og vrak SAMMEN i VRAK-fasen og LAGRER trumfen til
 * VELG. En fersk agent spurt rett i VELG har ingen lagret trumf og faller gjennom
 * til det indre laget — en annen beslutning enn den boten tar. VELG prøves derfor
 * fra VRAK-stillingen: fersk agent, VRAK, agentens EGET vrak utført, så VELG. Verdenene
 * trekkes i VRAK-stillingen fra budvinnerens synsvinkel og brukes for begge stegene.
 * `velgBeslutning(..., false)` finnes bare for prøven som viser at forspillet trengs.
 *
 * ============ KONTROLLARMENE =============================================
 *
 *   juks:6:<spek uten søk>   ser alle hender fra 6 kort igjen. MÅ bli tatt i sent spill.
 *   PLANTET (alle faser)     leser naboens hånd og vipper valget i hver fase. MÅ bli
 *                            tatt i hver fase som prøves.
 *
 * «Uten søk» er `utenSøkOveralt` (spek-lag.ts), ikke `utenSøk`: i hele boten står
 * søket midt i kjeden, og `utenSøk` stripper bare det ytterste laget.
 *
 * ============ HVA DEN IKKE DEKKER, SAGT HØYT =============================
 *
 * Hukommelse på tvers av runder: agenten er fersk, så `okt:`/`profil:`/søketroens bok
 * er tomme i begge armene. En lekkasje som bare går gjennom boka fra TIDLIGERE runder
 * er usynlig her (K2.5 har egne tester). Og som `k2-alle-faser` sier: en prøve som
 * varierer FORDELINGEN av skjulte kort fanger bare lekkasjer som avhenger av fordelingen.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { ADAMS_MAALT, lagIndre, tall, type Spekagent } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { utenSøkOveralt } from "./spek-lag.ts";

export type K2Fase = "bud" | "vrak" | "velg" | "spill";
export const K2_FASER: readonly K2Fase[] = ["bud", "vrak", "velg", "spill"];

/** Handlingen som en sammenliknbar streng. Ordrett formen fra `k2-alle-faser`. */
export function avtrykk(h: Handling): string {
  switch (h.type) {
    case "SPILL":
      return `SPILL ${h.kort.farge}${h.kort.verdi}`;
    case "BUD":
      return `BUD ${String(h.bud)}`;
    case "VRAK":
      return `VRAK ${[...h.kort].map((k) => `${k.farge}${k.verdi}`).sort().join(",")}`;
    case "VELG":
      return `VELG ${String(h.trumf)} ${h.etterlyst ? `${h.etterlyst.farge}${h.etterlyst.verdi}` : "-"}`;
    default:
      return h.type;
  }
}

export interface Fasefunn {
  /** Stillinger prøvd (også de som ble forkastet som ikke-deterministiske). */
  prøvd: number;
  /** Verdenssammenlikninger gjort. */
  sammenliknet: number;
  /** Sammenlikninger der valget endret seg. Ett er juks. */
  avvik: number;
  stillingerMedAvvik: number;
  /** Stillinger der fersk agent to ganger ga ulikt svar. Da kan støy ikke skilles fra juks. */
  ikkeDeterministisk: number;
  eksempler: string[];
}

export const tomtFunn = (): Fasefunn => ({
  prøvd: 0,
  sammenliknet: 0,
  avvik: 0,
  stillingerMedAvvik: 0,
  ikkeDeterministisk: 0,
  eksempler: [],
});

export interface K2Opts {
  readonly giver: number;
  readonly verdener: number;
  readonly fraStikk: number;
  readonly tilStikk: number;
  readonly faser: readonly K2Fase[];
  /** Stillinger per fase per giv. */
  readonly perGiv: number;
  readonly frøBase: number;
  /** Hvem som spiller fram stillingene. Billig standard: `ADAMS_MAALT`, som testene. */
  readonly drivere: string;
  readonly skard?: readonly [number, number];
}

/**
 * VELG-beslutningen slik boten faktisk tar den: fersk agent, VRAK, eget vrak utført,
 * så VELG. `medForspill = false` spør en fersk agent rett i VELG-stillingen etter
 * agentens eget vrak — det er feilen prøven unngår, og den finnes for testen.
 */
export function velgBeslutning(bygg: () => Spekagent, sVrak: GameState, medForspill = true): string {
  const a = bygg();
  a.nyKamp();
  const hv = a.velgHandling(sVrak);
  if (hv.type !== "VRAK") return `ikke VRAK: ${avtrykk(hv)}`;
  const etter = utfør(sVrak, hv).state;
  if (etter.fase !== "VELG") return `ingen VELG (${etter.fase})`;
  const b = medForspill ? a : bygg();
  if (!medForspill) b.nyKamp();
  return avtrykk(b.velgHandling(etter));
}

const likHånd = (a: GameState["hender"][number] | undefined, b: GameState["hender"][number] | undefined): boolean =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Prøver invariansen for én agentbygger i de valgte fasene. */
export function prøvInvarians(o: K2Opts, bygg: () => Spekagent): Record<K2Fase, Fasefunn> {
  const ut: Record<K2Fase, Fasefunn> = { bud: tomtFunn(), vrak: tomtFunn(), velg: tomtFunn(), spill: tomtFunn() };
  const vil = new Set(o.faser);

  for (let g = 0; g < o.giver; g++) {
    if (o.skard !== undefined && g % o.skard[1] !== o.skard[0]) continue;
    const frø = o.frøBase + g * 4271;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(o.drivere));
    for (const d of drivere) d.nyKamp();
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    const iGiv: Record<K2Fase, number> = { bud: 0, vrak: 0, velg: 0, spill: 0 };

    const prøv = (fase: K2Fase, st: GameState, handler: number): void => {
      const f = ut[fase];
      // Frøet avhenger av giv, fase og stikk — aldri av agenten — så alle armene
      // (kandidat, juks, plantet) prøves i NØYAKTIG de samme verdenene.
      const rng = lagRng((777_000 + g * 31 + K2_FASER.indexOf(fase) * 1_009 + st.stikkSpilt * 97) >>> 0);
      const verdener = trekkVerdener(st, handler, o.verdener, rng, undefined, undefined, 4);
      if (verdener.length === 0) return;
      const kjør = (x: GameState): string => {
        if (fase === "velg") return velgBeslutning(bygg, x);
        const a = bygg();
        a.nyKamp();
        return avtrykk(a.velgHandling(x));
      };
      f.prøvd++;
      iGiv[fase]++;
      const fasit = kjør(st);
      if (kjør(st) !== fasit) {
        f.ikkeDeterministisk++;
        return;
      }
      let traff = false;
      for (const hender of verdener) {
        const s2 = medVerden(st, hender, handler);
        if (!likHånd(s2.hender[handler], st.hender[handler])) {
          throw new Error("medVerden endret observatørens egen hånd — prøven måler feil ting");
        }
        f.sammenliknet++;
        const valg = kjør(s2);
        if (valg !== fasit) {
          f.avvik++;
          traff = true;
          if (f.eksempler.length < 6) {
            f.eksempler.push(
              `${fase} frø ${frø} stikk ${st.stikkSpilt} sete ${handler}: «${fasit}» i den ekte verdenen, «${valg}» i en forenlig`,
            );
          }
        }
      }
      if (traff) f.stillingerMedAvvik++;
    };

    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const handler = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (handler === null || handler === undefined) break;
      // Ingen grunn til å spille videre når vinduet er passert — driverne kan være dyre.
      if (s.fase === "SPILL" && (!vil.has("spill") || s.stikkSpilt > o.tilStikk)) break;
      if (s.fase === "BUDRUNDE" && vil.has("bud") && iGiv.bud < o.perGiv) prøv("bud", s, handler);
      if (s.fase === "VRAK") {
        if (vil.has("vrak") && iGiv.vrak < o.perGiv) prøv("vrak", s, handler);
        if (vil.has("velg") && iGiv.velg < o.perGiv) prøv("velg", s, handler);
      }
      if (
        s.fase === "SPILL" &&
        iGiv.spill < o.perGiv &&
        s.stikkSpilt >= o.fraStikk &&
        lovligeKort(s, handler).length >= 2
      ) {
        prøv("spill", s, handler);
      }
      s = utfør(s, drivere[handler]!.velgHandling(s)).state;
    }
  }
  return ut;
}

/**
 * EN KAPPE SOM LAR VALGET AVHENGE AV SKJULTE KORT. Skal bli tatt i hver fase.
 *
 * Ordrett logikken fra `test/k2-alle-faser.test.ts`, med lærdommene der: den leser
 * FORDELINGEN (naboens hånd), ikke mengden — summen av alle skjulte kort er invariant
 * når budvinneren har sett talongen; VRAK må endre MENGDEN, ikke rekkefølgen, fordi
 * `avtrykk` sorterer; og VELG må vippe trumfen.
 */
export function lagJukser(indre: Spekagent): Spekagent {
  const naboSum = (s: GameState, meg: number): number => {
    let n = 0;
    for (const k of s.hender[(meg + 1) % s.antallSpillere] ?? []) n += k.verdi;
    return n;
  };
  return {
    nyKamp: () => indre.nyKamp(),
    observer: (s: GameState) => indre.observer?.(s),
    velgHandling: (s: GameState): Handling => {
      const h = indre.velgHandling(s);
      const meg = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (meg === null || meg === undefined || naboSum(s, meg) % 2 !== 0) return h;
      if (h.type === "SPILL") {
        const annet = lovligeKort(s, meg).find((k) => k.farge !== h.kort.farge || k.verdi !== h.kort.verdi);
        return annet === undefined ? h : { type: "SPILL", spiller: meg, kort: annet };
      }
      if (h.type === "BUD") return { type: "BUD", spiller: meg, bud: h.bud === "PASS" ? 8 : "PASS" };
      if (h.type === "VRAK") {
        const iMengden = (k: { farge: string; verdi: number }): boolean =>
          h.kort.some((x) => x.farge === k.farge && x.verdi === k.verdi);
        const bytt = (s.hender[meg] ?? []).find((k) => !iMengden(k));
        return bytt === undefined || h.kort.length === 0 ? h : { ...h, kort: [bytt, ...h.kort.slice(1)] };
      }
      if (h.type === "VELG") {
        const andre = (["S", "H", "R", "K"] as const).find((f) => f !== h.trumf);
        return andre === undefined ? h : { ...h, trumf: andre };
      }
      return h;
    },
  };
}

export interface K2Rapport {
  readonly spek: string;
  readonly base: string;
  readonly drivere: string;
  readonly opts: {
    readonly giver: number;
    readonly verdener: number;
    readonly fraStikk: number;
    readonly tilStikk: number;
    readonly faser: readonly K2Fase[];
    readonly perGiv: number;
    readonly frøBase: number;
    readonly skard: string;
  };
  readonly faser: Record<K2Fase, Fasefunn>;
  /** Kontrollarmene, eller null når de er slått av (`--uten-kontroll`, en ekstra skive). */
  readonly kontroll: { readonly juks6: Fasefunn; readonly plantet: Record<K2Fase, Fasefunn> } | null;
  readonly sekunder: number;
}

export function kjørK2(spek: string, o: K2Opts, medKontroll = true): K2Rapport {
  const t0 = Date.now();
  const base = utenSøkOveralt(spek);
  const faser = prøvInvarians(o, () => lagIndre(spek));
  const kontroll = medKontroll
    ? {
        // Juksagenten ser alle hender fra seks kort igjen — altså fra stikk 7 — uansett
        // hvilket spillvindu kandidaten prøves i.
        juks6: prøvInvarians({ ...o, faser: ["spill"], fraStikk: 7, tilStikk: 99 }, () => lagIndre(`juks:6:${base}`)).spill,
        plantet: prøvInvarians(o, () => lagJukser(lagIndre(base))),
      }
    : null;
  return {
    spek,
    base,
    drivere: o.drivere,
    opts: {
      giver: o.giver,
      verdener: o.verdener,
      fraStikk: o.fraStikk,
      tilStikk: o.tilStikk,
      faser: o.faser,
      perGiv: o.perGiv,
      frøBase: o.frøBase,
      skard: o.skard === undefined ? "0/1" : `${o.skard[0]}/${o.skard[1]}`,
    },
    faser,
    kontroll,
    sekunder: Math.round((Date.now() - t0) / 1000),
  };
}

const plussFunn = (a: Fasefunn, b: Fasefunn): Fasefunn => ({
  prøvd: a.prøvd + b.prøvd,
  sammenliknet: a.sammenliknet + b.sammenliknet,
  avvik: a.avvik + b.avvik,
  stillingerMedAvvik: a.stillingerMedAvvik + b.stillingerMedAvvik,
  ikkeDeterministisk: a.ikkeDeterministisk + b.ikkeDeterministisk,
  eksempler: [...a.eksempler, ...b.eksempler].slice(0, 6),
});

const plussFaser = (a: Record<K2Fase, Fasefunn>, b: Record<K2Fase, Fasefunn>): Record<K2Fase, Fasefunn> => ({
  bud: plussFunn(a.bud, b.bud),
  vrak: plussFunn(a.vrak, b.vrak),
  velg: plussFunn(a.velg, b.velg),
  spill: plussFunn(a.spill, b.spill),
});

/** Summerer skiver (skard eller spillvinduer) til én rapport. Fasene er unionen. */
export function slåSammenK2(rs: readonly K2Rapport[]): K2Rapport {
  if (rs.length === 0) throw new Error("slåSammenK2: ingen rapporter");
  let faser = rs[0]!.faser;
  let kontroll = rs[0]!.kontroll;
  for (const r of rs.slice(1)) {
    faser = plussFaser(faser, r.faser);
    if (r.kontroll !== null) {
      kontroll =
        kontroll === null
          ? r.kontroll
          : { juks6: plussFunn(kontroll.juks6, r.kontroll.juks6), plantet: plussFaser(kontroll.plantet, r.kontroll.plantet) };
    }
  }
  const alleFaser = K2_FASER.filter((f) => rs.some((r) => r.opts.faser.includes(f)));
  return {
    ...rs[0]!,
    opts: { ...rs[0]!.opts, faser: alleFaser, skard: rs.map((r) => r.opts.skard).join(",") },
    faser,
    kontroll,
    sekunder: rs.reduce((a, r) => a + r.sekunder, 0),
  };
}

/**
 * DOMMEN. Rekkefølgen er ikke fri:
 *
 *   1. Ett avvik i en deterministisk stilling er JUKS — «nei», uansett kontrollarmene.
 *   2. En fase som aldri ble prøvd, eller en ikke-deterministisk stilling, gjør det grønne
 *      tallet tomt — «stum».
 *   3. Slapp en kontrollarm unna (juks:6 i sent spill, den plantede i en prøvd fase), kan
 *      prøven ikke feile — «stum».
 */
export function dømK2(r: K2Rapport): { dom: "ja" | "nei" | "stum"; grunn: string } {
  const faser = r.opts.faser;
  const juks = faser.filter((f) => r.faser[f].avvik > 0);
  if (juks.length > 0) {
    return { dom: "nei", grunn: `avvik i ${juks.map((f) => `${f} (${r.faser[f].avvik})`).join(", ")}` };
  }
  const tomme = faser.filter((f) => r.faser[f].prøvd - r.faser[f].ikkeDeterministisk === 0);
  if (tomme.length > 0) return { dom: "stum", grunn: `ingen deterministiske stillinger prøvd i ${tomme.join(", ")}` };
  const ikkeDet = faser.filter((f) => r.faser[f].ikkeDeterministisk > 0);
  if (ikkeDet.length > 0) {
    return {
      dom: "stum",
      grunn:
        `fersk agent ga ulikt svar på samme stilling i ${ikkeDet.map((f) => `${f} (${r.faser[f].ikkeDeterministisk})`).join(", ")} — ` +
        `støy kan ikke skilles fra juks (trenger deterministisk per-beslutning-frø)`,
    };
  }
  if (r.kontroll === null) return { dom: "stum", grunn: "kontrollarmene ble ikke kjørt" };
  if (r.kontroll.juks6.avvik === 0) {
    return { dom: "stum", grunn: `juks:6 slapp unna (${r.kontroll.juks6.prøvd} stillinger) — prøven kan ikke feile i sent spill` };
  }
  const slapp = faser.filter((f) => r.kontroll!.plantet[f].avvik === 0);
  if (slapp.length > 0) return { dom: "stum", grunn: `den plantede jukseren slapp unna i ${slapp.join(", ")}` };
  return { dom: "ja", grunn: "0 avvik i alle prøvde faser, kontrollarmene tatt" };
}

// ===========================================================================
// Kjøringen
// ===========================================================================

function kjør(): void {
  const arg = (n: string, s: string): string => {
    const i = process.argv.indexOf(n);
    return i < 0 ? s : (process.argv[i + 1] ?? s);
  };
  const spek = arg("--spek", ADAMS_MAALT);
  const faser = arg("--faser", "bud,vrak,velg,spill")
    .split(",")
    .filter((x) => x !== "") as K2Fase[];
  for (const f of faser) if (!K2_FASER.includes(f)) throw new Error(`Ukjent fase «${f}» (bud, vrak, velg, spill)`);
  const skard = arg("--skard", "0/1").split("/").map((x) => tall(x, 0, "--skard")) as [number, number];
  const ut = arg("--ut", "analyse/k2-spek.json");
  const o: K2Opts = {
    giver: tall(arg("--giver", "8"), 8, "--giver"),
    verdener: tall(arg("--verdener", "4"), 4, "--verdener"),
    fraStikk: tall(arg("--fra-stikk", "0"), 0, "--fra-stikk"),
    tilStikk: tall(arg("--til-stikk", "99"), 99, "--til-stikk"),
    faser,
    perGiv: tall(arg("--per-giv", "2"), 2, "--per-giv"),
    frøBase: tall(arg("--froe", "6600000"), 6_600_000, "--froe"),
    drivere: arg("--drivere", ADAMS_MAALT),
    skard,
  };
  const r = kjørK2(spek, o, !process.argv.includes("--uten-kontroll"));
  const d = dømK2(r);
  mkdirSync(dirname(ut), { recursive: true });
  writeFileSync(ut, JSON.stringify({ ...r, dom: d.dom, grunn: d.grunn }, null, 1) + "\n", "utf8");
  const linjer = [`K2 ${spek}`, `  base (uten søk): ${r.base}`];
  for (const f of faser) {
    const x = r.faser[f];
    linjer.push(`  ${f.padEnd(5)} prøvd ${x.prøvd}, sammenliknet ${x.sammenliknet}, avvik ${x.avvik}, ikke-deterministisk ${x.ikkeDeterministisk}`);
  }
  if (r.kontroll !== null) {
    linjer.push(`  juks:6  prøvd ${r.kontroll.juks6.prøvd}, avvik ${r.kontroll.juks6.avvik} (MÅ være > 0)`);
    for (const f of faser) linjer.push(`  plantet ${f.padEnd(5)} avvik ${r.kontroll.plantet[f].avvik} (MÅ være > 0)`);
  }
  linjer.push(`  DOM ${d.dom.toUpperCase()}: ${d.grunn}  (${r.sekunder} s) → ${ut}`);
  process.stderr.write(linjer.join("\n") + "\n");
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
