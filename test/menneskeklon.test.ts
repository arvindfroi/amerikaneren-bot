/**
 * MENNESKEKLONEN — KAN DEN JUKSE, OG DELER BÅNDENE RENT? (12. sep)
 *
 * Ingenting her krasjer når det er feil. En klone som kikker på en skjult hånd spiller like
 * pene kamper, og et korpus der samme kamp ligger i både trening og holdout gir like pene tall
 * — bare for gode. Hver prøve har derfor en FELLE som viser at sjekken KAN slå ut.
 *
 *   K2         to tilstander som er identiske i alt setet lovlig kan se, men ulike i de skjulte
 *              kortene (`trekkVerdener` + `medVerden`), pluss et bytte av TALONGEN og
 *              BUDVINNERENS VRAK. Klonen må velge nøyaktig samme kort i alle.
 *              FELLE: en «kikker» som rangerer etter nabosetets virkelige hånd må bli tatt av
 *              nøyaktig samme løkke. En grønn K2-prøve som aldri møtte en jukser beviser ingenting.
 *
 *   BÅNDENE    `menneskeBånd` er avsatt på kamp-id, og korpusene `menneske-klondata.ts` skriver
 *              må derfor ikke dele én eneste kamp. Sjekken kjøres på de FAKTISKE filene når de
 *              finnes. FELLE: to lister som DELER en kamp må bli avvist av samme funksjon.
 *
 * Klonenettene ligger i `e1-modell/`, som er gitignorert. Prøven hopper over med grunn når de
 * ikke finnes — som `test/duplikat-menneske.test.ts` gjør.
 */

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { lovligeKort, opprettSpill, utfør, type GameState } from "../src/motor.ts";
import type { Kort } from "../src/kort.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { Menneskeklone } from "../src/moe2/menneskeklon.ts";
import { menneskeBånd } from "../examples/menneske-logg.ts";

const NETT = {
  bud: "e1-modell/menneske-bud.bin",
  vrak: "e1-modell/menneske-vrak.bin",
  kall: "e1-modell/menneske-kall.bin",
  kort: "e1-modell/menneske-kort.bin",
};
const DRIVER = "vakt:abmp:e1:e1-modell/d7alle.bin";
const mangler = [...Object.values(NETT), "e1-modell/d7alle.bin"].filter((f) => !existsSync(f));
const skip = mangler.length > 0 ? `mangler ${mangler.join(", ")} (e1-modell er ikke sporet)` : false;

const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/**
 * SPILL-stillinger der setet i tur IKKE er budvinner og har et reelt valg.
 *
 * Ikke budvinner, med vilje: budvinneren SER sitt eget vrak (`spillerVisning.dittVrak`), så et
 * vrakbytte ville endret hans lovlige informasjon og prøven ville målt noe annet enn juks.
 */
function stillinger(giver: number, perGiv = 3): { s: GameState; sete: number }[] {
  const ut: { s: GameState; sete: number }[] = [];
  for (let g = 0; g < giver; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(DRIVER));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 4_400_000 + g * 6151);
    let vakt = 0;
    let iGiv = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 300) {
      if (
        s.fase === "SPILL" &&
        s.iTur !== null &&
        s.iTur !== s.budvinner &&
        s.vrak.length > 0 &&
        s.stikkSpilt >= 2 &&
        iGiv < perGiv &&
        lovligeKort(s, s.iTur).length >= 2
      ) {
        ut.push({ s, sete: s.iTur });
        iGiv++;
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return ut;
}

/** Stokker en liste deterministisk — for talongen og vraket, som ingen andre enn budvinneren ser. */
function stokk<T>(xs: readonly T[], frø: number): T[] {
  const ut = xs.slice();
  const rng = lagRng(frø);
  for (let i = ut.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ut[i], ut[j]] = [ut[j]!, ut[i]!];
  }
  return ut;
}

/**
 * Kjører K2-løkka for én kortvelger og returnerer (prøvde stillinger, avvik). Både klonen og
 * FELLA går gjennom denne, så det er bevist at det er samme sjekk som slipper den ene og tar
 * den andre.
 */
function k2(velg: (s: GameState, sete: number) => Kort, verdenerPer = 6): { prøvd: number; avvik: string[] } {
  const avvik: string[] = [];
  let prøvd = 0;
  for (const { s, sete } of stillinger(6)) {
    const rng = lagRng(555_000 + s.stikkSpilt * 31 + sete);
    const verdener = trekkVerdener(s, sete, verdenerPer, rng, undefined, undefined, 4);
    if (verdener.length < 2) continue;
    const fasit = nøkkel(velg(s, sete));
    assert.equal(nøkkel(velg(s, sete)), fasit, "velgeren er ikke deterministisk – prøven kan ikke skille støy fra juks");
    prøvd++;
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      assert.deepEqual(s2.hender[sete], s.hender[sete], "medVerden endret observatørens egen hånd");
      if (nøkkel(velg(s2, sete)) !== fasit) avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: skjulte kort endret valget`);
    }
    // TALONGEN OG BUDVINNERENS VRAK: usynlige for dette setet, så de kan byttes fritt.
    const s3: GameState = { ...s, talong: stokk(s.talong, 91 + sete), vrak: stokk(s.vrak, 137 + sete) };
    if (nøkkel(velg(s3, sete)) !== fasit) avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: talong/vrak endret valget`);
  }
  return { prøvd, avvik };
}

test("K2: klonen velger likt uansett skjulte kort, talong og vrak", { skip }, () => {
  const klone = new Menneskeklone(NETT);
  const { prøvd, avvik } = k2((s, sete) => klone.velgKort(s, sete));
  assert.ok(prøvd >= 8, `bare ${prøvd} stillinger prøvd – prøven fikk for lite å prøve på`);
  assert.deepEqual(avvik, [], `klonen leser skjult informasjon:\n${avvik.slice(0, 5).join("\n")}`);
});

test("FELLE: en kikker blir tatt av NØYAKTIG samme løkke", { skip }, () => {
  /**
   * Rangerer etter NABOSETETS virkelige hånd — den enkleste jukseren som finnes. Den er lovlig
   * TypeScript, den krasjer ikke, og den ville spilt pene kamper. Blir den ikke tatt her, måler
   * ikke K2-prøven over noe som helst.
   */
  const kikker = (s: GameState, sete: number): Kort => {
    const lovlige = lovligeKort(s, sete);
    const skjult = s.hender[(sete + 1) % s.antallSpillere] ?? [];
    const sum = skjult.reduce((a, k) => a + k.verdi, 0);
    return lovlige[sum % lovlige.length]!;
  };
  const { prøvd, avvik } = k2(kikker);
  assert.ok(prøvd >= 8, "fella fikk for lite å prøve på");
  assert.ok(avvik.length > 0, "kikkeren slapp unna K2-løkka – da beviser den grønne prøven over ingenting");
});

// ===========================================================================
// BÅNDENE
// ===========================================================================

/** Kampene et korpus er bygd av, lest av `frø`-feltet (= `fnv(kamp-id)`, se menneske-klondata.ts). */
function kampeneI(fil: string): Set<number> {
  const ut = new Set<number>();
  for (const l of readFileSync(fil, "utf8").split("\n")) {
    if (l === "") continue;
    ut.add(Number(JSON.parse(l).frø));
  }
  return ut;
}

const felles = (a: Set<number>, b: Set<number>): number[] => [...a].filter((x) => b.has(x));

const KORPUS = { trening: "D:/amb-grp/klon/trening/kort/s0.jsonl", holdout: "D:/amb-grp/klon/holdout/kort/s0.jsonl" };
const korpusSkip = Object.values(KORPUS).some((f) => !existsSync(f))
  ? "korpuset er ikke generert (menneske-klondata.ts)"
  : false;

test("holdout-delingen legger ALDRI en kamp i begge bånd", { skip: korpusSkip }, () => {
  const tren = kampeneI(KORPUS.trening);
  const hold = kampeneI(KORPUS.holdout);
  assert.ok(tren.size > 50 && hold.size > 10, `for få kamper (${tren.size} / ${hold.size}) til at prøven måler noe`);
  assert.deepEqual(felles(tren, hold), [], "en kamp ligger i BÅDE trening og holdout – holdouten er lekk");
});

test("FELLE: overlappssjekken tar to lister som DELER en kamp", () => {
  const a = new Set([1, 2, 3]);
  const b = new Set([3, 4]);
  assert.deepEqual(felles(a, b), [3], "overlappssjekken finner ikke en kamp som ligger i begge – da er prøven over blind");
});

test("menneskeBånd er stabilt og deler omtrent hver fjerde kamp til holdout", () => {
  let hold = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const id = `kamp-${i}`;
    const b = menneskeBånd(id);
    assert.equal(b, menneskeBånd(id), "menneskeBånd er ikke deterministisk");
    if (b === "holdout") hold++;
  }
  // Nominelt 25 %; vid grense, for det som prøves her er at delingen finnes og er stabil.
  assert.ok(hold / n > 0.18 && hold / n < 0.32, `holdout-andel ${(100 * hold) / n} % – delingen er ikke ~25 %`);
});
