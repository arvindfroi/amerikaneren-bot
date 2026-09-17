/**
 * A/B-DEMOEN: MENNESKETS VINNERANDEL PER ARM (K1), fra `hendelser`.
 *
 *   node examples/ab-resultat.ts [--data D:/amb-grp/menneske/hendelser.jsonl] [--versjon ab1-2026-09-17]
 *
 * Leser en JSONL-eksport av valens `hendelser` (én rad per linje med `spillId`, `type`, `data`,
 * `tid`). Tar bare kamper med `start.data.modeller.abVersjon === --versjon` og UTEN `abTvunget`.
 *
 *   ferdige   kamper med en `kamp`-rad; mennesket vant når `kamp.data.vinner === 0`
 *   hovedtall vinnerandel blant ferdige kamper per arm, Wilson-intervall, og differansen B − A
 *             med to-utvalgs z-test (samlet p under H0)
 *   kontroll  fullføringsgrad per arm (en arm som får folk til å gi opp, skjevvrir hovedtallet),
 *             og for arm B: andel botbeslutninger reserven tok (`lag` frist/feil/ikke-klar),
 *             nødbrems og bokbrudd fra `bottrekk.detalj`, og tregeste trekk
 *
 * Armen er KAMPENS. En kamp som arver armen (`abArv`) er en egen kamp i tellingen.
 */
import { readFileSync } from "node:fs";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
const VERSJON = arg("--versjon", "ab1-2026-09-17");

type Rad = { spillId: string; type: string; data: Record<string, unknown> | string; tid: string };
const rader = readFileSync(DATA, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Rad)
  .map((r) => ({ ...r, data: (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as Record<string, unknown> }));

type Arm = { start: number; ferdig: number; vant: number; trekk: number; reserve: number; nødbrems: number; bokbrudd: number; maksMs: number };
const ny = (): Arm => ({ start: 0, ferdig: 0, vant: 0, trekk: 0, reserve: 0, nødbrems: 0, bokbrudd: 0, maksMs: 0 });
const arm = new Map<string, Arm>([["A", ny()], ["B", ny()]]);
const armFor = new Map<string, string>();

for (const r of rader) {
  if (r.type !== "start") continue;
  const m = r.data["modeller"] as Record<string, unknown> | undefined;
  if (m?.["abVersjon"] !== VERSJON || m["abTvunget"] === true) continue;
  const a = String(m["ab"]);
  if (!arm.has(a)) continue;
  armFor.set(r.spillId, a);
  arm.get(a)!.start++;
}
for (const r of rader) {
  const a = armFor.get(r.spillId);
  if (a === undefined) continue;
  const x = arm.get(a)!;
  if (r.type === "kamp") {
    x.ferdig++;
    if (r.data["vinner"] === 0) x.vant++;
  } else if (r.type === "bottrekk") {
    const trekk = (r.data["trekk"] ?? []) as [number, string, string, number][];
    for (const t of trekk) {
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
  const z = 1.959964, p = k / n, d = 1 + (z * z) / n;
  const m = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [m - h, m + h];
};
const pst = (x: number): string => `${(100 * x).toFixed(1)} %`;
for (const [n, x] of arm) {
  const [lo, hi] = wilson(x.vant, x.ferdig);
  console.log(
    `arm ${n}: ${x.start} startet, ${x.ferdig} ferdige (${pst(x.ferdig / Math.max(1, x.start))}), ` +
      `mennesket vant ${x.vant} = ${pst(x.vant / Math.max(1, x.ferdig))} [${pst(lo)}, ${pst(hi)}]; ` +
      `bottrekk ${x.trekk}, reserve ${x.reserve}, nødbrems ${x.nødbrems}, bokbrudd ${x.bokbrudd}, maks ${x.maksMs} ms`,
  );
}
const A = arm.get("A")!, B = arm.get("B")!;
if (A.ferdig > 0 && B.ferdig > 0) {
  const pa = A.vant / A.ferdig, pb = B.vant / B.ferdig;
  const p = (A.vant + B.vant) / (A.ferdig + B.ferdig);
  const se = Math.sqrt(p * (1 - p) * (1 / A.ferdig + 1 / B.ferdig));
  console.log(`B − A = ${pst(pb - pa)}, z = ${se > 0 ? ((pb - pa) / se).toFixed(2) : "–"} (negativ = mennesket vinner sjeldnere mot B)`);
}
