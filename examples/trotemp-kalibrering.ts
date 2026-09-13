/**
 * ER TROEN OVERKONFIDENT? — kalibreringsproben (13. sep).
 *
 *   node examples/trotemp-kalibrering.ts --runder 20 --fro 13000777 --ut analyse/trokal-w0.jsonl
 *
 * ============ SPØRSMÅLET EIEREN STILTE ====================================
 *
 * «Selv om den tror og predikerer hvilke kort den har, så må den spille som om den ikke
 * egentlig vet — eller at den er usikker. Ellers hallusinerer den bare.»
 *
 * Det er en påstand om KALIBRERING, og den kan måles direkte: en tro som sier at en
 * verden har 30 % sannsynlighet, skal ha rett i 30 % av tilfellene. Denne fila samler
 * råstoffet; `trotemp-kal-sum.ts` feller dommen og sveiper temperaturen.
 *
 * ============ TO NIVÅER, OG DET ER POENGET ================================
 *
 * MARGINALT   trohodet gir `p[kort][klasse]` — hvor hvert enkelt skjulte kort ligger.
 *             Fasiten er kjent (`state.hender`), så dette er en ren kalibreringskurve
 *             uten en eneste trekning. Ingen approksimasjon noe sted.
 *
 * FELLES      vekten søket faktisk bruker er SUMMEN av de marginale log-sannsynlighetene
 *             over alle skjulte kort. Den summen behandler kortene som UAVHENGIGE, og det
 *             er de ikke: håndstørrelsene er faste, så plasseringene er koblet. En sum av
 *             marginaler som er nesten kalibrert kan derfor være grovt overkonfident som
 *             felles fordeling — og det er den felles fordelingen som velger verdenen.
 *
 * Begge må måles, og forskjellen mellom dem ER svaret. Er T_felles ≫ T_marginal, er
 * overkonfidensen ikke trohodets feil, men produktantakelsens.
 *
 * ============ HVORFOR TEMPERATUR PÅ VEKTEN = TEMPERATUR PÅ MARGINALENE ====
 *
 *     logW(v)/T = (Σ_i log p_i(klasse_i(v)))/T = Σ_i log p_i(klasse_i(v))^(1/T)
 *
 * Å dele log-vekten på T er altså NØYAKTIG å opphøye hver marginal i 1/T. Renormaliseringen
 * per kort er en konstant som er lik for alle kandidatverdenene, og den spises av softmaxen
 * over kandidatene. De to skalaene er derfor den samme knotten.
 *
 * ============ SETTET KALIBRERINGEN MÅLES I ================================
 *
 * Nøyaktig det settet sampleren selv bruker: K = 32 kandidater trukket fra `trekkVerden`
 * med den EKTE rng-strømmen (`lagRng(visningsfrø(...))`, som `D` i speken gir), pluss den
 * SANNE verdenen. Spørsmålet blir da det operative: gitt 33 verdener der én er sann, treffer
 * troens sannsynlighet frekvensen?
 *
 * FORBEHOLDET, sagt her og ikke i en fotnote: forslagsfordelingen `trekkVerden` er
 * tilnærmet uniform over de forenlige givene, ikke eksakt. Er den skjev, er den sanne
 * verdenen ikke helt utbyttbar med de 32 trukne. Trakk strømmen den sanne verdenen selv
 * (`nSann > 0`), er den OVERrepresentert i settet — det trekker målingen mot BEDRE
 * kalibrering, altså mot å avkrefte overkonfidens. Feilen går i konservativ retning, og
 * summeringsverktøyet rapporterer delmengden uten duplikat ved siden av.
 *
 * ============ DRIVEREN ====================================================
 *
 * Standard er den BILLIGE (`ADAMS_MAALT`), som i `troledd-vektspredning.ts`: kalibrering er
 * en egenskap ved trohodet og stillingen, ikke ved hvem som spiller, og proben skal dekke
 * mange stillinger uten å betale for 48 utspillinger per beslutning. `--helbot` kjører den
 * utrullede speken i stedet, for å vise at tallet ikke henger på driveren.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { skjulteKort } from "../src/moe2/troprior.ts";
import { TRO_KLASSER } from "../src/moe2/trosnett.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { trekkVerden } from "../src/solver/sampler.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const RUNDER = tall(arg("--runder", "20"), 20, "runder");
const FRO = tall(arg("--fro", "13000777"), 13_000_777, "fro");
const KAND = tall(arg("--kandidater", "32"), 32, "kandidater");
const UT = arg("--ut", "");
const HELBOT_DRIVER = process.argv.includes("--helbot");

/** Sikkerorakelets standardfrø, så `D` gir samme strøm som i boten. */
const SIK_FRØ = 20_260_804;
const TROFIL = "e1-modell/tro-8.bin";

/** Den utrullede speken (iter-8-modellene), ordrett fra `troledd.ts`. */
const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";

const tronett = MlbTronett.fraBytes(readFileSync(TROFIL));
const tro = new MlbSøketro(tronett);
const agenter = [0, 1, 2, 3].map(() => lagIndre(HELBOT_DRIVER ? HELBOT : ADAMS_MAALT));
for (const a of agenter) a.nyKamp();
tro.nyKamp();

if (UT !== "") mkdirSync(dirname(UT), { recursive: true });
const rader: string[] = [];
const skriv = (o: unknown): void => {
  if (UT === "") return;
  rader.push(JSON.stringify(o));
  if (rader.length >= 100) {
    appendFileSync(UT, rader.join("\n") + "\n");
    rader.length = 0;
  }
};

/**
 * KLASSEN ET KORT HAR I EN GITT FORDELING AV HENDENE — ordrett samme utregning som
 * `vektFraFordeling` i `troprior.ts`. Skrevet om her ville vært en annen fasit enn den
 * vekten scorer, og da måler proben en tro som ikke finnes.
 */
const klasseFor = (holder: number, sete: number): number => {
  if (holder < 0) return TRO_KLASSER - 1;
  const k = ((holder - sete + 4) % 4) - 1;
  return k < 0 ? TRO_KLASSER - 1 : k;
};

const r5 = (x: number): number => Math.round(x * 1e5) / 1e5;
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRO);
let vakt = 0;
let r = 0;
let utenTro = 0;
let n = 0;
const tStart = performance.now();

while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < RUNDER) {
  if (s.fase === "RUNDE_SLUTT") {
    for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
    tro.observer(s);
    r++;
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
    const sete = s.iTur;
    const trovekt = tro.vektFor(s, sete);
    if (trovekt === null) {
      utenTro++;
    } else {
      const skjult = skjulteKort(s, sete, true);
      const p = tro.fordelingFor(s, sete);

      // ---------------------------------------------------------------- fasiten
      // Hvor kortene FAKTISK ligger. −1 = på ingen hånd, altså vraket/talongen (klasse 3).
      const holder = new Int8Array(52).fill(-1);
      for (let q = 0; q < s.antallSpillere; q++) {
        for (const k of s.hender[q] ?? []) holder[kortTilInt(k)] = q;
      }

      const mp: number[] = [];
      const mt: number[] = [];
      for (const i of skjult) {
        const rad = p[i] ?? [];
        for (let c = 0; c < TRO_KLASSER; c++) mp.push(r5(rad[c] ?? 0));
        mt.push(klasseFor(holder[i]!, sete));
      }

      // ---------------------------------------------- den sanne verdenens log-vekt
      // Bygd av de EKTE hendene og scoret med nøyaktig den vektfunksjonen søket bruker.
      const sannHender: number[][] = [];
      for (let q = 0; q < s.antallSpillere; q++) sannHender.push((s.hender[q] ?? []).map(kortTilInt));
      const lwS = trovekt({ hender: sannHender } as never);
      // Nøkkelen som avgjør log-vekten: klassen til hvert skjulte kort, ingenting annet.
      const nøkkel = (h: readonly number[][]): string => {
        const hos = new Int8Array(52).fill(-1);
        for (let q = 0; q < h.length; q++) for (const c of h[q]!) hos[c] = q;
        return skjult.map((i) => klasseFor(hos[i]!, sete)).join("");
      };
      const sannNøkkel = nøkkel(sannHender);

      // -------------------------------------------------- de 32 kandidatene, ekte strøm
      const rng = lagRng(visningsfrø(s, sete, SIK_FRØ));
      const lw: number[] = [];
      const nøkler = new Set<string>();
      let nSann = 0;
      for (let i = 0; i < KAND; i++) {
        const v = trekkVerden(s, sete, rng);
        if (v === null) continue;
        lw.push(r4(trovekt(v)));
        const nk = nøkkel(v.hender);
        nøkler.add(nk);
        if (nk === sannNøkkel) nSann++;
      }
      if (lw.length > 0) {
        n++;
        skriv({
          r,
          sete,
          rolle: rolleFor(s, sete) ?? "ukjent",
          stikk: s.historikk.length,
          igjen: s.hender[sete]?.length ?? 0,
          nSkjult: skjult.length,
          lovlige: lovligeKort(s, sete).length,
          lw,
          lwS: r4(lwS),
          nSann,
          nDist: nøkler.size,
          mp,
          mt,
        });
      }
    }
  }
  s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
}

if (UT !== "" && rader.length > 0) appendFileSync(UT, rader.join("\n") + "\n");
console.log(
  `trotemp-kalibrering: frø ${FRO}, ${r} runder, ${n} beslutninger, ${utenTro} uten skjulte kort, ` +
    `${((performance.now() - tStart) / 1000).toFixed(0)} s → ${UT === "" ? "(ingen fil)" : UT}`,
);
