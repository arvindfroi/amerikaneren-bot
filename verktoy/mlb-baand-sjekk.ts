/**
 * FRØBÅNDENE FOR `--kamp`: ER DE DISJUNKTE? — og ikke bare på frø.
 *
 *   node verktoy/mlb-baand-sjekk.ts [antall-kamper-aa-skanne]
 *
 * Se `src/mlb/froebaand.ts` for hvorfor «0 delte frø» ikke er nok: `blandeSeed` er lineær, så
 * to ULIKE frø gir samme giv når de skiller seg med `m·2654435761 mod 2³²`. Denne kontrollen
 * teller delte GIV, ikke bare delte frø.
 *
 * Exit 1 hvis noe hardt ryker.
 */
import { delerGiv, forbudteAvstander, KAMP_MAKSRUNDER_TAK, VERNEDE_BÅND, type Frøbånd } from "../src/mlb/froebaand.ts";

/** Speilet av `KAMP_BÅND` i `examples/mlb-trodata.ts` — den fila er et skript som skriver en
 *  fil når den lastes, så den kan ikke importeres. `test/mlb-trodata-kamp.test.ts` binder
 *  konstantene til driveren ved å faktisk kjøre den. */
const KAMP_TRENING: Frøbånd = { navn: "kamp-trening", base: 950_000_000, steg: 1, maks: 16_000_000 };
const KAMP_HOLDOUT: Frøbånd = { navn: "kamp-holdout", base: 1_985_000_000, steg: 7717, maks: 1_500 };
const SKANN = Number(process.argv[2] ?? 2_000_000);

const F = forbudteAvstander();
const minste = Math.min(...F.filter((x) => x !== 0).map((x) => Math.min(x, 2 ** 32 - x)));
const topp = (b: Frøbånd): number => b.base + (b.maks - 1) * b.steg;
const feil: string[] = [];

console.log("FRØBÅNDENE FOR --kamp");
for (const b of [KAMP_TRENING, KAMP_HOLDOUT]) {
  console.log(`  ${b.navn}: ${b.base.toLocaleString("nb")} + k·${b.steg}, k < ${b.maks.toLocaleString("nb")} → topp ${topp(b).toLocaleString("nb")}`);
}
console.log(`  maksrunder-tak ${KAMP_MAKSRUNDER_TAK}, minste forbudte frøavstand ${minste.toLocaleString("nb")}\n`);

// 1. INNE I HVERT BÅND: bredden må være mindre enn minste forbudte avstand.
for (const b of [KAMP_TRENING, KAMP_HOLDOUT]) {
  if (topp(b) > 0x7fffffff) feil.push(`${b.navn} går over int32 (frøet skrives som frø | 0)`);
  const bredde = (b.maks - 1) * b.steg;
  const internt = bredde >= minste;
  console.log(`  ${b.navn}: bredde ${bredde.toLocaleString("nb")} — intern givkollisjon: ${internt ? "JA" : "NEI"}`);
  if (internt) feil.push(`${b.navn} kan dele en giv med seg selv (bredde ${bredde} ≥ ${minste})`);
}

// 2. FRØOVERLAPP mellom trening og holdout.
const froOverlapp = !(topp(KAMP_TRENING) < KAMP_HOLDOUT.base || KAMP_TRENING.base > topp(KAMP_HOLDOUT));
console.log(`\n  frøoverlapp trening/holdout: ${froOverlapp ? "JA" : "NEI"}`);
if (froOverlapp) feil.push("trenings- og holdoutbåndet overlapper i frø");

// 3. DEN HARDE: etter filtreringen skal INGEN kamp som faktisk spilles dele giv med et vernet
//    bånd. Skannet, ikke antatt — det er nettopp filteret `mlb-trodata.ts` bruker.
console.log(`\n  skanner de første ${SKANN.toLocaleString("nb")} frøene i treningsbåndet …`);
const hoppetPerBånd = new Map<string, number>();
let overlevde = 0;
for (let k = 0; k < SKANN; k++) {
  const navn = delerGiv(KAMP_TRENING.base + k * KAMP_TRENING.steg);
  if (navn === null) overlevde++;
  else hoppetPerBånd.set(navn, (hoppetPerBånd.get(navn) ?? 0) + 1);
}
const hoppet = SKANN - overlevde;
console.log(`  ${overlevde.toLocaleString("nb")} frø overlever, ${hoppet.toLocaleString("nb")} hoppes over (${((100 * hoppet) / SKANN).toFixed(3)} %)`);
for (const b of VERNEDE_BÅND) {
  console.log(`    hoppet pga. ${b.navn}: ${(hoppetPerBånd.get(b.navn) ?? 0).toLocaleString("nb")}`);
}
if (overlevde === 0) feil.push("filteret hopper over ALT — da er båndet ubrukelig");

// 4. FELLA: en kontroll som ikke tar en KONSTRUERT kollisjon, beviser ingenting. Bygg et frø
//    som per konstruksjon deler giv med holdout, og krev at filteret ser det.
{
  const m = 89; // avstanden som ga minste |delta|
  const d = (m * 2_654_435_761) % 2 ** 32;
  const lekk = (KAMP_HOLDOUT.base + 7 * KAMP_HOLDOUT.steg + d) % 2 ** 32;
  const sett = delerGiv(lekk);
  console.log(`\n  FELLE: konstruert kollisjonsfrø ${lekk} → filteret sier «${sett ?? "ingen"}»`);
  if (sett === null) feil.push("filteret så ikke en konstruert kollisjon — kontrollen over beviser ingenting");
}

console.log("");
if (feil.length > 0) {
  for (const f of feil) console.log(`FEIL: ${f}`);
  process.exit(1);
}
console.log(`BÅNDENE ER I ORDEN: 0 delte frø, og 0 delte giv mot ${VERNEDE_BÅND.map((b) => b.navn).join(", ")} blant frøene som faktisk spilles.`);
