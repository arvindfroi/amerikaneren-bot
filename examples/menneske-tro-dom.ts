/**
 * DOMMENE FOR K8-MENNESKE OG K6-MENNESKE — rene funksjoner over radene fra
 * `examples/menneske-tro.ts` (11. sep). Prøvd i `test/menneske-tro.test.ts` uten ett eneste
 * nett, og brukt av `krav-helbot.ts` og av `menneske-tro.ts --dom`.
 *
 * ===================== TO DELER AV DE SAMME RADENE =======================
 *
 *   menneske   observatøren er en BOT (sete 1–3), og bare kortene i MENNESKETS hånd telles
 *              (`m_*`-kolonnene). Det er spørsmålet eieren stiller: gjetter boten hva
 *              mennesket har?
 *   alle       alle seter som observatør, alle skjulte kort — K8 slik `mlb-k8.ts` regner den.
 *
 * Andelen er `(ln 3 − tap)/ln 3` per rad (`k8-maal.ts`), snittet over rader med SE fra
 * klyngebootstrap over KAMPER: radene i én kamp deler bord, spiller og bok.
 *
 * ===================== K8-MENNESKE: RAPPORTERT, INGEN PORT ================
 *
 * Raden er ny, og ingen terskel er avtalt. KONTROLL: gulvkolonnen er ln 3, og nullarmen regnet
 * to ganger (`null2`: nettet lastet på nytt, nullblokken som eksplisitt vektor) er identisk på
 * HVER rad, både tapet og hele fordelingen (`ulik2 = 0`). FELLE (kraft, som i K8): troen slår
 * gulv+ i begge deler. Kontroll som bommer gjør raden stum; ellers «rapportert».
 *
 * ===================== K6-MENNESKE: STIGNINGEN, I BEGGE HALVDELER =========
 *
 * `g = andel(tro) − andel(null)` per rad: hva boka fra de ferdige rundene i SAMME kamp gir,
 * parvis på samme stilling og samme kort. K6 er at det VOKSER utover kampen, altså
 * stigningen av g mot rundenummeret, klynget på kamp.
 *
 *   KONTROLL  null mot null2 eksakt likt på hver rad.
 *   FELLE     `fremmed`: boka fra en ANNEN kamp (annen spiller der det finnes) etter like mange
 *             ferdige runder. Samme fylte blokk, samme tiltro, feil bord. Er gevinsten bare at
 *             blokken er full, gir fremmed like mye. Kravet er at tro slår fremmed med > 2 SE;
 *             ellers kan ingen stigning leses som læring av DETTE bordet, og raden er stum.
 *   JA        stigning − 2 SE > 0 i BEGGE halvdelene (`fnv(kamp-id) % 2`, samme deling som K1).
 *
 * Porten går på delen `menneske`. `alle` og `rotert` (riktig bok, blokkene flyttet ett sete)
 * rapporteres ved siden av, sammen med «andre halvdel av kampen mot første».
 */

import { andelGulvTak, LN3 } from "./k8-maal.ts";
import { klyngeSnitt, klyngeStigning, type Klyngesnitt, type Klyngestigning } from "./klynge.ts";

export interface MenneskeTroRad {
  readonly spill: string;
  readonly halvdel: number;
  readonly runde: number;
  /** Antall runder i kampen (høyeste rundeNr + 1): «andre halvdel» er `2·runde ≥ runder`. */
  readonly runder: number;
  /** Ferdige runder i boka da stillingen oppsto. */
  readonly bok: number;
  readonly stikk: number;
  readonly sete: number;
  readonly budavvik: number;
  readonly kort: number;
  readonly gulv: number;
  readonly gulvPluss: number;
  readonly tro: number;
  readonly null: number;
  readonly null2: number;
  readonly fremmed: number;
  readonly rotert: number;
  readonly tro_fakta: number;
  readonly null_fakta: number;
  /** Plasser i 52 × 4-fordelingen der null og null2 er ulike. Skal være 0. */
  readonly ulik2: number;
  readonly m_kort?: number;
  readonly m_gulv?: number;
  readonly m_gulvPluss?: number;
  readonly m_tro?: number;
  readonly m_null?: number;
  readonly m_null2?: number;
  readonly m_fremmed?: number;
  readonly m_rotert?: number;
  readonly m_tro_fakta?: number;
  readonly m_null_fakta?: number;
}

export type Del = "menneske" | "alle";
export type Arm = "tro" | "null" | "null2" | "fremmed" | "rotert" | "tro_fakta" | "null_fakta" | "gulv" | "gulvPluss";

export const DELER: readonly Del[] = ["menneske", "alle"];

/** Tapet (per kort) for en arm i en del. NaN der raden ikke har delen. */
export function tap(x: MenneskeTroRad, del: Del, arm: Arm): number {
  const v = (x as unknown as Record<string, unknown>)[del === "menneske" ? `m_${arm}` : arm];
  return typeof v === "number" ? v : NaN;
}

export const iDel = (rader: readonly MenneskeTroRad[], del: Del): MenneskeTroRad[] =>
  rader.filter((x) => Number.isFinite(tap(x, del, "tro")));

const ulikNull = (x: MenneskeTroRad, del: Del): boolean => tap(x, del, "null2") !== tap(x, del, "null") || x.ulik2 !== 0;

export interface K8Del {
  readonly n: number;
  readonly klynger: number;
  readonly andel: Record<"tro" | "null" | "tro_fakta" | "null_fakta" | "gulvPluss", Klyngesnitt>;
  /** Andelen for `tro` i hver halvdel. */
  readonly halv: readonly Klyngesnitt[];
  readonly tapTro: number;
  readonly gulv: number;
  readonly gulvPluss: number;
}

const snittAv = (r: readonly MenneskeTroRad[], f: (x: MenneskeTroRad) => number): number =>
  r.length === 0 ? NaN : r.reduce((a, x) => a + f(x), 0) / r.length;

function k8Del(rader: readonly MenneskeTroRad[], del: Del, B: number): K8Del {
  const r = iDel(rader, del);
  const a = (arm: Arm) => klyngeSnitt(r, (x) => x.spill, (x) => andelGulvTak(tap(x, del, arm)), B);
  return {
    n: r.length,
    klynger: new Set(r.map((x) => x.spill)).size,
    andel: { tro: a("tro"), null: a("null"), tro_fakta: a("tro_fakta"), null_fakta: a("null_fakta"), gulvPluss: a("gulvPluss") },
    halv: [0, 1].map((h) =>
      klyngeSnitt(r.filter((x) => x.halvdel === h), (x) => x.spill, (x) => andelGulvTak(tap(x, del, "tro")), B),
    ),
    tapTro: snittAv(r, (x) => tap(x, del, "tro")),
    gulv: snittAv(r, (x) => tap(x, del, "gulv")),
    gulvPluss: snittAv(r, (x) => tap(x, del, "gulvPluss")),
  };
}

export function domK8Menneske(rader: readonly MenneskeTroRad[], B = 2000) {
  const deler = { menneske: k8Del(rader, "menneske", B), alle: k8Del(rader, "alle", B) };
  const ulike = DELER.reduce((a, d) => a + iDel(rader, d).filter((x) => ulikNull(x, d)).length, 0);
  const kontrollOk =
    deler.alle.n > 0 && deler.menneske.n > 0 && ulike === 0 &&
    DELER.every((d) => Math.abs(deler[d].gulv - LN3) < 1e-4);
  const felleOk = DELER.every((d) => Number.isFinite(deler[d].tapTro) && deler[d].tapTro < deler[d].gulvPluss);
  const innfridd: "rapportert" | "stum" = kontrollOk ? "rapportert" : "stum";
  return { deler, ulike, kontrollOk, felleOk, innfridd };
}

export function domK6Menneske(rader: readonly MenneskeTroRad[], del: Del = "menneske", B = 2000) {
  const r = iDel(rader, del);
  const andel = (x: MenneskeTroRad, arm: Arm): number => andelGulvTak(tap(x, del, arm));
  const g = (x: MenneskeTroRad): number => andel(x, "tro") - andel(x, "null");
  const halv: Klyngestigning[] = [0, 1].map((h) =>
    klyngeStigning(r.filter((x) => x.halvdel === h), (x) => x.spill, (x) => x.runde, g, B),
  );
  const stig = klyngeStigning(r, (x) => x.spill, (x) => x.runde, g, B);
  const nivå = klyngeSnitt(r, (x) => x.spill, g, B);
  const sen = klyngeSnitt(r.filter((x) => 2 * x.runde >= x.runder), (x) => x.spill, g, B);
  const tidlig = klyngeSnitt(r.filter((x) => 2 * x.runde < x.runder), (x) => x.spill, g, B);
  // Uavhengige SE-er lagt sammen: de to halvdelene av én kamp samvarierer positivt, så dette er på den trygge siden.
  const senMotTidlig = { snitt: sen.snitt - tidlig.snitt, se: Math.hypot(sen.se, tidlig.se) };
  const fremmed = klyngeSnitt(r, (x) => x.spill, (x) => andel(x, "tro") - andel(x, "fremmed"), B);
  const rotert = klyngeSnitt(r, (x) => x.spill, (x) => andel(x, "tro") - andel(x, "rotert"), B);
  const fremmedStig = klyngeStigning(r, (x) => x.spill, (x) => x.runde, (x) => andel(x, "fremmed") - andel(x, "null"), B);
  const ulike = r.filter((x) => ulikNull(x, del)).length;
  const kontrollOk = r.length > 0 && ulike === 0;
  const felleOk = Number.isFinite(fremmed.se) && fremmed.snitt > 2 * fremmed.se;
  const innfridd: "ja" | "nei" | "stum" | "ikke målbar" =
    r.length === 0
      ? "ikke målbar"
      : !kontrollOk || !felleOk
        ? "stum"
        : halv.every((s) => Number.isFinite(s.se) && s.b - 2 * s.se > 0)
          ? "ja"
          : "nei";
  return { n: r.length, klynger: new Set(r.map((x) => x.spill)).size, halv, stig, nivå, sen, tidlig, senMotTidlig, fremmed, rotert, fremmedStig, ulike, kontrollOk, felleOk, innfridd };
}

const pst = (x: number, d = 2): string => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(d)}`;
const pm = (k: { snitt: number; se: number }, d = 2): string => `${pst(k.snitt, d)} ± ${(100 * k.se).toFixed(d)}`;
const stigTekst = (s: Klyngestigning): string =>
  `${pst(s.b, 3)} ± ${(100 * s.se).toFixed(3)} pp/runde (z = ${(s.b / s.se).toFixed(2)}, n=${s.n} i ${s.klynger} kamper)`;

/** Hele rapporten som tekst — det `menneske-tro.ts --dom` skriver. */
export function rapportMenneskeTro(rader: readonly MenneskeTroRad[], B = 2000): string {
  const k8 = domK8Menneske(rader, B);
  const L: string[] = [];
  L.push(`K8/K6 MOT MENNESKER — ${rader.length} rader i ${new Set(rader.map((x) => x.spill)).size} kamper`);
  L.push(`  budavvik > 0 i ${rader.filter((x) => x.budavvik > 0).length} rader`);
  L.push("");
  for (const d of DELER) {
    const x = k8.deler[d];
    L.push(`K8 [${d}] n=${x.n} i ${x.klynger} kamper — % av veien gulv → tak (SE klynget på kamp)`);
    L.push(`  tro        ${pm(x.andel.tro)}   halvdel 0: ${pm(x.halv[0]!)}   halvdel 1: ${pm(x.halv[1]!)}`);
    L.push(`  null       ${pm(x.andel.null)}`);
    L.push(`  tro+fakta  ${pm(x.andel.tro_fakta)}`);
    L.push(`  null+fakta ${pm(x.andel.null_fakta)}`);
    L.push(`  gulv+      ${pm(x.andel.gulvPluss)}   (log-tap tro ${x.tapTro.toFixed(4)}, gulv ${x.gulv.toFixed(5)}, gulv+ ${x.gulvPluss.toFixed(4)})`);
  }
  L.push(`  KONTROLL null = null2 på hver rad: ${k8.ulike} ulike [${k8.kontrollOk ? "OK" : "BOMMET"}]; FELLE tro slår gulv+ i begge deler [${k8.felleOk ? "TATT" : "SLAPP UNNA"}]`);
  L.push("");
  for (const d of DELER) {
    const k6 = domK6Menneske(rader, d, B);
    L.push(`K6 [${d}] g = andel(tro) − andel(null), n=${k6.n} i ${k6.klynger} kamper${d === "menneske" ? "  (PORTEN)" : ""}`);
    L.push(`  nivå            ${pm(k6.nivå, 3)} pp`);
    L.push(`  stigning        ${stigTekst(k6.stig)}`);
    L.push(`  halvdel 0 / 1   ${stigTekst(k6.halv[0]!)}  /  ${stigTekst(k6.halv[1]!)}`);
    L.push(`  andre halvdel av kampen − første: ${pm(k6.senMotTidlig, 3)} pp (sen ${pm(k6.sen, 3)}, tidlig ${pm(k6.tidlig, 3)})`);
    L.push(`  FELLE tro − fremmed ${pm(k6.fremmed, 3)} pp [${k6.felleOk ? "TATT" : "SLAPP UNNA"}]; fremmed − null stigning ${stigTekst(k6.fremmedStig)}`);
    L.push(`  tro − rotert    ${pm(k6.rotert, 3)} pp`);
    L.push(`  KONTROLL ${k6.ulike} ulike [${k6.kontrollOk ? "OK" : "BOMMET"}]   INNFRIDD ${k6.innfridd.toUpperCase()}`);
  }
  return L.join("\n");
}
