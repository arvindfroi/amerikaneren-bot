/**
 * Hjelpere for EPIMC-prøven og stillingsjakten (18. sep). Ikke en prøve i seg selv.
 */
import { opprettSpill, utfør, lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import type { Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { intTilKort as tilKort } from "../src/solver/dds.ts";
import type { Utspiller } from "../src/moe2/sdkort.ts";

/**
 * En EKTE tilstand fra et parti med nett, med 3 stikk igjen og tomt bord. Bare strukturfeltene
 * (trumf, melding, budvinner, giving …) brukes; hendene byttes ut av prøven.
 */
export function lagStillingsmal(): GameState {
  const nett = new NevroAgent();
  let s = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 18_092_026);
  let vakt = 0;
  while (vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    if (
      s.fase === "SPILL" &&
      s.iTur !== null &&
      s.bord.length === 0 &&
      s.giving.antallStikk - s.stikkSpilt === 3 &&
      s.trumf !== null
    ) {
      return s;
    }
    s = utfør(s, nett.velgHandling(s)).state;
  }
  throw new Error("fant ingen mal");
}

/**
 * MOTSTANDEREN: deterministisk og ser bare egen hånd og bordet. Følger med HØYESTE kort i
 * fargen, kaster LAVESTE ellers, spiller ut HØYESTE. (Ingen trumf finnes i prøvestillingene.)
 */
export const motstander: Utspiller = {
  velgHandling(s: GameState): Handling {
    const p = s.iTur!;
    const lov = lovligeKort(s, p);
    const følger = s.bord.length > 0 && lov.every((k) => k.farge === s.bord[0]!.kort.farge) && lov.length > 0 &&
      s.hender[p]!.some((k) => k.farge === s.bord[0]!.kort.farge);
    const høy = lov.reduce((a, b) => (b.verdi > a.verdi ? b : a));
    const lav = lov.reduce((a, b) => (b.verdi < a.verdi ? b : a));
    const kort: Kort = s.bord.length === 0 || følger ? høy : lav;
    return { type: "SPILL", spiller: p, kort };
  },
};

/** Egne stikk vunnet fra `start` til `slutt`. */
export const egneStikk = (slutt: GameState, start: GameState, sete: number): number =>
  (slutt.stikkVunnet[sete] ?? 0) - (start.stikkVunnet[sete] ?? 0);

/**
 * ALLVITENDE EGET SETE: velger kortet som gir flest egne stikk i DENNE verdenen (brute force mot
 * `motstander`). Det er perfekt-informasjons-oppløsningen PIMC gjør under roten — i dagens `sik:`
 * er det e-bladet (`poengRotVerdier`). De andre setene spiller `motstander`.
 */
export function allvitende(sete: number, andre: Utspiller = motstander): Utspiller {
  const verdi = (s: GameState, start: GameState): number => {
    if (s.fase !== "SPILL" || s.iTur === null) return egneStikk(s, start, sete);
    if (s.iTur !== sete) return verdi(utfør(s, andre.velgHandling(s)).state, start);
    let best = -Infinity;
    for (const k of lovligeKort(s, sete)) best = Math.max(best, verdi(utfør(s, { type: "SPILL", spiller: sete, kort: k }).state, start));
    return best;
  };
  return {
    velgHandling(s: GameState): Handling {
      if (s.iTur !== sete) return andre.velgHandling(s);
      let best: Kort | null = null;
      let bv = -Infinity;
      for (const k of lovligeKort(s, sete)) {
        const v = verdi(utfør(s, { type: "SPILL", spiller: sete, kort: k }).state, s);
        if (v > bv) {
          bv = v;
          best = k;
        }
      }
      return { type: "SPILL", spiller: sete, kort: best! };
    },
  };
}

/**
 * SANN VERDI PÅ INFORMASJONSMENGDEN for rotkortet `rot`, uavhengig av `sdpar.ts`: verdenene
 * grupperes på det vi ser fram til neste egne valg, og hver gruppe får ÉTT kort (det beste i sum).
 * Med 3 stikk igjen er dette eksakt: det siste egne kortet er tvunget. Motstanderne er `motstander`.
 */
export function sannVerdi(s: GameState, sete: number, verdener: readonly (readonly (readonly number[])[])[], rot: Kort): number {
  const grupper = new Map<string, GameState[]>();
  let sum = 0;
  const ferdig = (x: GameState): GameState => {
    let y = x;
    while (y.fase === "SPILL" && y.iTur !== null) {
      const lov = lovligeKort(y, y.iTur);
      y = utfør(y, y.iTur === sete ? { type: "SPILL", spiller: sete, kort: lov[0]! } : motstander.velgHandling(y)).state;
    }
    return y;
  };
  for (const v of verdener) {
    const hender = s.hender.map((h, p) => (p === sete ? h : v[p]!.map(tilKort)));
    let x = utfør({ ...s, hender }, { type: "SPILL", spiller: sete, kort: rot }).state;
    let nøkkel = "";
    while (x.fase === "SPILL" && x.iTur !== sete) {
      const h = motstander.velgHandling(x) as Extract<Handling, { type: "SPILL" }>;
      nøkkel += `${h.spiller}.${h.kort.farge}${h.kort.verdi},`;
      x = utfør(x, h).state;
    }
    if (x.fase !== "SPILL") {
      sum += egneStikk(x, s, sete);
      continue;
    }
    grupper.set(nøkkel, [...(grupper.get(nøkkel) ?? []), x]);
  }
  for (const g of grupper.values()) {
    let best = -Infinity;
    for (const c of lovligeKort(g[0]!, sete)) {
      let t = 0;
      for (const node of g) {
        if (node.hender[sete]!.length !== 2) throw new Error("sannVerdi: bare laget for 3 stikk igjen");
        t += egneStikk(ferdig(utfør(node, { type: "SPILL", spiller: sete, kort: c }).state), s, sete);
      }
      best = Math.max(best, t);
    }
    sum += best;
  }
  return sum / verdener.length;
}
