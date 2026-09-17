/**
 * ADAMS MAX I DEMOEN: MENNESKETS VINNERANDEL FØR/ETTER (K1), fra `hendelser`.
 *
 *   node examples/ab-resultat.ts [--data D:/amb-grp/menneske/hendelser.jsonl]
 *                                [--foer-fra 2026-08-05] [--versjon ab2-kunB-2026-09-17]
 *
 * Leser en JSONL-eksport av valens `hendelser` (`spillId`, `type`, `data`, `tid`, og `bot` eller
 * `navn` = «<spiller> vs <bot>»).
 *
 *   FØR    `start`-rader mot dagens bot før utrullingen: bot `Adams-v5` eller `Adams-v5.1`, UTEN
 *          `modeller.abVersjon`, tidligst `--foer-fra` (v5 kom 5. aug).
 *   ETTER  `start`-rader med `modeller.abVersjon` i --versjon (kommaliste, v15 og v16), `modeller.ab === "B"` og uten
 *          `abTvunget`. Intention-to-treat: kamper der helbotfilene manglet (`abFaktisk: "A"`)
 *          telles i ETTER, og antallet skrives ut.
 *   (Kamper fra en eventuell randomisert periode, `ab1-…`, skrives ut per arm for seg.)
 *
 * Ferdig = kampen har en `kamp`-rad; mennesket vant når `kamp.data.vinner === 0`.
 * Hovedtall: vinnerandel blant ferdige kamper per gruppe (Wilson-intervall), ETTER − FØR med
 * to-utvalgs z-test. Kontroll: fullføringsgrad, og for ETTER andel reservetrekk, nødbrems og
 * bokbrudd. Per SPILLER (hashen i `spiller`, om den finnes) skrives før/etter også ut: samme
 * spillere i begge perioder er det nærmeste denne designen kommer en parring.
 *
 * FØR/ETTER ER SVAKERE ENN RANDOMISERT. Spillerne kan ha blitt bedre (eller gått lei) over tid,
 * hvem som spiller kan ha endret seg, og nyhetseffekten av en ny bot faller i ETTER alene. En
 * forskjell er derfor bot + tid, ikke bot alene. Randomisert (`AB_ANDEL_B = 0.5`) skiller dem.
 */
import { readFileSync } from "node:fs";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
/** Kommaliste. ETTER er unionen; hver versjon skrives også ut for seg (v15 base, v16 med S1). */
const VERSJONER = new Set(arg("--versjon", "ab2-kunB-2026-09-17,ab3-kunB-fart-2026-09-17,ab4-kunB-fart-frist3s-2026-09-18").split(","));
const FØR_FRA = arg("--foer-fra", "2026-08-05");
const FØR_BOTER = new Set(["Adams-v5", "Adams-v5.1"]);

type Rad = { spillId: string; type: string; data: Record<string, unknown>; tid: string; bot?: string; navn?: string; spiller?: string };
const rader: Rad[] = readFileSync(DATA, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Rad & { data: unknown })
  .map((r) => ({ ...r, data: (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as Record<string, unknown> }));

const botAv = (r: Rad): string => r.bot ?? (r.navn ?? "").split(" vs ").slice(1).join(" vs ");

interface Gruppe {
  start: number;
  ferdig: number;
  vant: number;
  trekk: number;
  reserve: number;
  nødbrems: number;
  bokbrudd: number;
  maksMs: number;
  faktiskA: number;
}
const ny = (): Gruppe => ({ start: 0, ferdig: 0, vant: 0, trekk: 0, reserve: 0, nødbrems: 0, bokbrudd: 0, maksMs: 0, faktiskA: 0 });
const grupper = new Map<string, Gruppe>();
const gruppeFor = new Map<string, string>();
const spillerFor = new Map<string, string>();
const underFor = new Map<string, string>();

for (const r of rader) {
  if (r.type !== "start") continue;
  const m = r.data["modeller"] as Record<string, unknown> | undefined;
  let g: string | null = null;
  if (m?.["abVersjon"] === undefined) {
    if (FØR_BOTER.has(botAv(r)) && r.tid.slice(0, 10) >= FØR_FRA) g = "FØR";
  } else if (m["abTvunget"] !== true) {
    if (VERSJONER.has(String(m["abVersjon"])) && m["ab"] === "B") g = "ETTER";
    else g = `${String(m["abVersjon"])}/${String(m["ab"])}`;
  }
  if (g === null) continue;
  // Undergruppe per versjon (og fart), telles bare i start/ferdig/vant.
  if (g === "ETTER") {
    const u = `  ${String(m?.["abVersjon"])}${m?.["fart"] === true ? " (S1)" : ""} frist ${String(m?.["fristMs"])}`;
    if (!grupper.has(u)) grupper.set(u, ny());
    grupper.get(u)!.start++;
    underFor.set(r.spillId, u);
  }
  if (!grupper.has(g)) grupper.set(g, ny());
  const x = grupper.get(g)!;
  x.start++;
  if (m?.["abFaktisk"] === "A" && m["ab"] === "B") x.faktiskA++;
  gruppeFor.set(r.spillId, g);
  if (r.spiller !== undefined) spillerFor.set(r.spillId, r.spiller);
}

const perSpiller = new Map<string, Record<string, { ferdig: number; vant: number }>>();
for (const r of rader) {
  const g = gruppeFor.get(r.spillId);
  if (g === undefined) continue;
  const x = grupper.get(g)!;
  if (r.type === "kamp") {
    x.ferdig++;
    const vant = r.data["vinner"] === 0;
    if (vant) x.vant++;
    const u = underFor.get(r.spillId);
    if (u !== undefined) {
      grupper.get(u)!.ferdig++;
      if (vant) grupper.get(u)!.vant++;
    }
    const sp = spillerFor.get(r.spillId);
    if (sp !== undefined) {
      const p = perSpiller.get(sp) ?? {};
      const c = (p[g] ??= { ferdig: 0, vant: 0 });
      c.ferdig++;
      if (vant) c.vant++;
      perSpiller.set(sp, p);
    }
  } else if (r.type === "bottrekk") {
    for (const t of (r.data["trekk"] ?? []) as [number, string, string, number][]) {
      x.trekk++;
      if (t[2] === "frist" || t[2] === "feil" || t[2] === "ikke-klar") x.reserve++;
      x.maksMs = Math.max(x.maksMs, t[3]);
    }
    for (const d of (r.data["detalj"] ?? []) as number[][]) {
      if (d[2] === 1) x.nødbrems++;
      if (d[3] === 1) x.bokbrudd++;
    }
  }
}

const wilson = (k: number, n: number): [number, number] => {
  if (n === 0) return [0, 1];
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const m = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [m - h, m + h];
};
const pst = (x: number): string => `${(100 * x).toFixed(1)} %`;

for (const [n, x] of [...grupper].sort()) {
  const [lo, hi] = wilson(x.vant, x.ferdig);
  console.log(
    `${n.padEnd(6)} ${x.start} startet, ${x.ferdig} ferdige (${pst(x.ferdig / Math.max(1, x.start))}); ` +
      `mennesket vant ${x.vant} = ${pst(x.vant / Math.max(1, x.ferdig))} [${pst(lo)}, ${pst(hi)}]` +
      (n === "FØR"
        ? ""
        : `; bottrekk ${x.trekk}, reserve ${x.reserve}, nødbrems ${x.nødbrems}, bokbrudd ${x.bokbrudd}, maks ${x.maksMs} ms, uten helbot ${x.faktiskA}`),
  );
}
const F = grupper.get("FØR");
const E = grupper.get("ETTER");
if (F !== undefined && E !== undefined && F.ferdig > 0 && E.ferdig > 0) {
  const pf = F.vant / F.ferdig;
  const pe = E.vant / E.ferdig;
  const p = (F.vant + E.vant) / (F.ferdig + E.ferdig);
  const se = Math.sqrt(p * (1 - p) * (1 / F.ferdig + 1 / E.ferdig));
  console.log(
    `ETTER − FØR = ${pst(pe - pf)}, z = ${se > 0 ? ((pe - pf) / se).toFixed(2) : "–"} ` +
      "(negativ = mennesket vinner sjeldnere mot Adams Max). Før/etter, ikke randomisert: se toppen av fila.",
  );
}
const begge = [...perSpiller].filter(([, p]) => p["FØR"] !== undefined && p["ETTER"] !== undefined);
if (begge.length > 0) {
  console.log(`spillere med ferdige kamper i begge perioder: ${begge.length}`);
  for (const [sp, p] of begge) {
    console.log(`  ${sp}: før ${p["FØR"]!.vant}/${p["FØR"]!.ferdig}, etter ${p["ETTER"]!.vant}/${p["ETTER"]!.ferdig}`);
  }
}
