/**
 * BUDHULLET: hvor mye sier auksjonen om hendene, og hvor mye av det ser nettet?
 *
 * `src/nevro/trekk.ts` koder fra budrunden BARE tre ting inn i spillfasen:
 * hvem som vant (208-211), hva tallbudet ble (225), og Amerikaner/solo-flagg.
 * Selve AUKSJONEN - hvem som bød hva underveis, hvem som passet med en gang,
 * hvem som kjempet til 9 og ga seg - er ikke kodet i det hele tatt, selv om
 * `state.budrunde.sisteBud` og `.passet` ligger i staten gjennom hele spillet.
 *
 * Et menneske bruker den informasjonen konstant: «makkeren min meldte 8, da
 * har han minst to stikk» eller «begge motstanderne passet med en gang, da
 * ligger styrken hos spillefører». Adams er blind for alt sammen.
 *
 * DENNE MÅLINGEN PÅSTÅR INGENTING OM SPILLESTYRKE. Den svarer på ett spørsmål
 * som må stå FØR man bygger trekket: bærer `sisteBud` nok signal til at det er
 * verdt 20 kolonner? Hvis en forsvarer som bød 8 tar like mange stikk som en
 * som passet med en gang, er hullet tomt og vi lar det være.
 *
 * Fasit er stikk faktisk tatt i runden - ikke en modells anslag, så tallet
 * ikke arver modellens egne feil.
 */

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { PASS } from "../src/regler.ts";

const FRØ0 = Number(process.argv[2] ?? 700_000_000);
const RUNDER = Number(process.argv[3] ?? 4000);
const UT = process.argv[4] ?? "analyse/budhull.json";

type Rad = {
  /** Høyeste bud setet selv avga, eller null om det aldri bød. */
  eget: number | null;
  /** Var setet budvinner? */
  vant: boolean;
  /** Stikk setet faktisk tok. */
  stikk: number;
  /** Kort på hånd da spillet startet (for stikkandel). */
  kort: number;
  /**
   * Vinnerbudet. MÅ KONTROLLERES FOR. En forsvarer som bød 9 og tapte
   * auksjonen møter per definisjon en kontrakt på minst 10 - altså en sterkere
   * spillefører og oftere en trumf valgt mot ham. Stikk tatt faller da selv om
   * hånden er sterkere. Uten stratifisering måler man kontraktsnivået og
   * kaller det håndstyrke.
   */
  vinnerbud: number | null;
  /**
   * Kontraktsuavhengig styrkemål: ess og konger på hånd ved spillstart.
   * Stikk tatt avhenger av hva de andre gjør; honnørtellingen gjør ikke det.
   */
  honnør: number;
};

const nevro = new NevroAgent();

/** Spiller en hel runde og returnerer én rad per sete, eller null. */
function kjørRunde(frø: number): Rad[] | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let g = 0;
  // Auksjonen må leses FØR spillet er ferdig - `sisteBud` overlever, men vi
  // vil ha den sammen med korttellingen ved spillstart.
  let auksjon: (number | null)[] | null = null;
  let kortVedStart = 0;
  let honnører: number[] = [0, 0, 0, 0];
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 600) {
    if (auksjon === null && s.fase === "SPILL") {
      auksjon = s.budrunde.sisteBud.map((b) => (typeof b === "number" ? b : null));
      kortVedStart = s.giving.kortPerSpiller;
      // Leses ved SPILLSTART, altså etter at budvinneren har tatt talongen og
      // vraket. Forsvarernes hender er urørt av det.
      honnører = [0, 1, 2, 3].map(
        (sete) => (s.hender[sete] ?? []).filter((k) => k.verdi >= 13).length,
      );
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) return null;
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  if (auksjon === null || s.budvinner === null) return null;
  const vb = auksjon[s.budvinner] ?? null;
  return [0, 1, 2, 3].map((sete) => ({
    eget: auksjon![sete] ?? null,
    vant: sete === s.budvinner,
    stikk: s.stikkVunnet[sete] ?? 0,
    kort: kortVedStart,
    vinnerbud: vb,
    honnør: honnører[sete] ?? 0,
  }));
}

const rader: Rad[] = [];
for (let i = 0; i < RUNDER; i++) {
  const r = kjørRunde(FRØ0 + i * 1013);
  if (r !== null) rader.push(...r);
}

/** Gjennomsnitt og standardfeil. */
function oppsummer(xs: number[]): { n: number; snitt: number; se: number } {
  const n = xs.length;
  if (n === 0) return { n: 0, snitt: NaN, se: NaN };
  const m = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, snitt: m, se: NaN };
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  return { n, snitt: m, se: Math.sqrt(v / n) };
}

// Bare FORSVARERE (ikke budvinner): det er der hullet betyr noe. Budvinnerens
// eget bud ER kodet allerede (indeks 225), så den ville vært juks å telle med.
const forsvarere = rader.filter((r) => !r.vant);
const passetMedEnGang = forsvarere.filter((r) => r.eget === null);
const bød = forsvarere.filter((r) => r.eget !== null);

const perBud = new Map<number, number[]>();
for (const r of bød) {
  const a = perBud.get(r.eget!) ?? [];
  a.push(r.stikk);
  perBud.set(r.eget!, a);
}

const a = oppsummer(passetMedEnGang.map((r) => r.stikk));
const b = oppsummer(bød.map((r) => r.stikk));
const diff = b.snitt - a.snitt;
const diffSe = Math.sqrt(a.se ** 2 + b.se ** 2);

/**
 * STRATIFISERT PÅ VINNERBUDET. Innenfor ett kontraktsnivå møter alle
 * forsvarerne samme styrke spillefører, så det som er igjen av forskjellen er
 * hånden - ikke motstanden.
 */
function stratifisert(verdi: (r: Rad) => number): {
  perStratum: { vinnerbud: number; nLav: number; nHøy: number; diff: number; se: number }[];
  samlet: { diff: number; se: number; sigma: number };
} {
  const strata = new Map<number, Rad[]>();
  for (const r of forsvarere) {
    if (r.vinnerbud === null) continue;
    const s = strata.get(r.vinnerbud) ?? [];
    s.push(r);
    strata.set(r.vinnerbud, s);
  }
  const per: { vinnerbud: number; nLav: number; nHøy: number; diff: number; se: number }[] = [];
  for (const [vinnerbud, rs] of [...strata.entries()].sort((x, y) => x[0] - y[0])) {
    // Innenfor stratumet: delt på medianen av eget bud (null = 0, laveste).
    const egne = rs.map((r) => r.eget ?? 0).sort((x, y) => x - y);
    const median = egne[Math.floor(egne.length / 2)] ?? 0;
    const lav = rs.filter((r) => (r.eget ?? 0) < median).map(verdi);
    const høy = rs.filter((r) => (r.eget ?? 0) >= median).map(verdi);
    if (lav.length < 30 || høy.length < 30) continue;
    const L = oppsummer(lav);
    const H = oppsummer(høy);
    per.push({
      vinnerbud,
      nLav: L.n,
      nHøy: H.n,
      diff: H.snitt - L.snitt,
      se: Math.sqrt(L.se ** 2 + H.se ** 2),
    });
  }
  // Invers-varians-vekting over strata.
  let vsum = 0;
  let wsum = 0;
  for (const p of per) {
    const w = 1 / p.se ** 2;
    vsum += w * p.diff;
    wsum += w;
  }
  const d = wsum > 0 ? vsum / wsum : NaN;
  const se = wsum > 0 ? Math.sqrt(1 / wsum) : NaN;
  return { perStratum: per, samlet: { diff: d, se, sigma: d / se } };
}

const stratStikk = stratifisert((r) => r.stikk);
const stratHonnør = stratifisert((r) => r.honnør);

const rapport = {
  frø0: FRØ0,
  runder: RUNDER,
  seter: rader.length,
  forsvarere: forsvarere.length,
  andelSomBød: bød.length / Math.max(1, forsvarere.length),
  passetMedEnGang: a,
  bødMinstEnGang: b,
  forskjellStikk: { snitt: diff, se: diffSe, sigma: diff / diffSe },
  perBud: [...perBud.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([bud, xs]) => ({ bud, ...oppsummer(xs) })),
  stratifisertStikk: stratStikk,
  stratifisertHonnør: stratHonnør,
};

const fs = await import("node:fs");
fs.writeFileSync(UT, JSON.stringify(rapport, null, 2), "utf-8");

console.log(`Runder: ${RUNDER}, forsvarerseter: ${forsvarere.length}`);
console.log(`Andel forsvarere som bød underveis: ${(rapport.andelSomBød * 100).toFixed(1)} %`);
console.log(`  passet med en gang: ${a.snitt.toFixed(3)} stikk (n=${a.n}, SE ${a.se.toFixed(3)})`);
console.log(`  bød minst en gang : ${b.snitt.toFixed(3)} stikk (n=${b.n}, SE ${b.se.toFixed(3)})`);
console.log(`  FORSKJELL: ${diff >= 0 ? "+" : ""}${diff.toFixed(3)} +/- ${diffSe.toFixed(3)} stikk (${(diff / diffSe).toFixed(1)} SE)`);
for (const p of rapport.perBud) {
  console.log(`    bud ${p.bud}: ${p.snitt.toFixed(3)} stikk (n=${p.n})`);
}

console.log(`\nSTRATIFISERT PAA VINNERBUDET (hoeyt eget bud minus lavt, innen samme kontrakt):`);
for (const navn of ["stikk", "honnoer"] as const) {
  const st = navn === "stikk" ? stratStikk : stratHonnør;
  console.log(`  ${navn}:`);
  for (const p of st.perStratum) {
    console.log(
      `    vinnerbud ${p.vinnerbud}: ${p.diff >= 0 ? "+" : ""}${p.diff.toFixed(3)} +/- ${p.se.toFixed(3)} (n=${p.nLav}/${p.nHøy})`,
    );
  }
  console.log(
    `    SAMLET: ${st.samlet.diff >= 0 ? "+" : ""}${st.samlet.diff.toFixed(3)} +/- ${st.samlet.se.toFixed(3)} (${st.samlet.sigma.toFixed(1)} SE)`,
  );
}
console.log(`\nSkrevet til ${UT}`);
