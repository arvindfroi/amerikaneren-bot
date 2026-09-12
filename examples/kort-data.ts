/**
 * KORT-DATA — kortvalgene merket av SØKET i den hele boten (ekspertiterasjon for kortnettet, 11. sep).
 *
 *   node examples/kort-data.ts --spek <helbot> --kamper 400 --skard 0/20 --ut D:/amb-grp/loop/iterK/kort/s0.jsonl
 *     [--drivere "@|A|@|B" --rotasjon] [--sjanse 1] [--froe 500000000] [--maksrunder 60] [--bredde 273|493]
 *     [--kanonisk]
 *
 * HVORFOR. Løkka trener bud, vrak, kall og tro hver iterasjon, men kortnettet (`e1:e1-modell/d7alle.bin`,
 * nederst under `vakt:abmp`) har stått siden 3. august. Det er prioren alt annet bygger på: utspillingene
 * i `sik:` spiller verdenene ferdig med det, og nettets valg står overalt der porten (σ) holder. d7alle er
 * destillert fra `sd-orakel`-korpuset — SD-verdier med STANDARDMÅLET, i stillinger eldre policyer spilte
 * seg inn i. Søket i den hele boten måler noe annet i dag: lagmålet (`L`), troen i verdenene (`~mlbu=`),
 * hukommelsen (`M`) og eksakte blader (`e3`). Ekspertiterasjon: søket merker, nettet lærer, og det bedre
 * nettet blir basen søket bygger på neste gang.
 *
 * ETIKETTEN ER GRATIS. `sik:alle` kjører `vurderPar` på HVER kortbeslutning med minst to lovlige kort for
 * å SPILLE, og kaster verdiene etter porten. `settParlytter` (sikkerorakel.ts) lar oss lese dem uten å
 * endre ett valg. Kostnaden per merket beslutning er derfor kostnaden av å spille den, og `--sjanse 1` er
 * standard: lavere sjanse sparer bare skriving, ikke søk.
 *
 * ETIKETTEN (`v`): kortindeks → snittverdien søket rangerer på, over de SAMME verdenene for alle kortene.
 * Med `L` i speken er det lagmålet (egen sides snitt av totalpoengene minus den andre sidens, etter runden
 * i utspillingen), ellers standardmålet; `mål` sier hvilket. `p` er kortet boten faktisk spilte (etter
 * sluttspillet og porten), `b` søkets beste, `n` verdenene, `sigma` porten, `rolle` rollen.
 *
 * K2 — INGEN FASIT. Verdenene trekker søket selv fra setets visning (med `D` er frøet en funksjon av
 * visningen). Trekkene (`t`) er `e1SpillTrekkMedTro(…, null)`, nøyaktig vektoren E1Agent gir et nett
 * under v9-bredde. Den virkelige given brukes bare til å spille kampen videre. `test/kort-data.test.ts`
 * bytter skjulte hender, vraket og talongen og krever bit-like trekk og like verdier for ikke-budvinnerne.
 *
 * FORMATET er det `verktoy/sd-tren.py` leser (som sd-orakel/e1-orakel): `t`, `v` og `frø`. `frø` er
 * KAMPFRØET, så sd-trens holdout (hash av frø) deler på kamp: ingen kamp i både trening og holdout.
 * `stikk` leser sd-tren til angeren per fase (TIDLIG 0–2, MIDT 3–6, SENT 7–11).
 *
 * BOKBREDDEN (`--bredde 493`, 11. sep): trekkene er `e1KortBokTrekk` (`src/e1/kortbok.ts`) — de
 * samme 273 først, så motstanderboka, stillingen og valgt bort — med SAMME etiketter. Boka er en
 * egen `Hukommelse` per kamp, matet hver virkelige tilstand som agentene (også `RUNDE_SLUTT`), altså
 * bit for bit boka et 493-nett i speken ville sett. Et 493-nett i speken gir bredden av seg selv.
 * Uten flagget og med et 273-nett er ingen bok laget, og radene er byte-identiske med før.
 *
 * OBSERVER: alle agentinstansene ser hver virkelige tilstand, også RUNDE_SLUTT og sluttilstanden. Uten
 * det står økta stum og hukommelsestroen kaster i runde 2. Utspillingene inne i søket vises aldri.
 *
 * POPULASJONEN: som budq-/vrakq-data (`examples/drivere.ts`); bare `@`-setene merkes. Søket i et
 * `@`-sete spiller verdenene med sin egen rollout-policy (og økta per motstander med `M`) — ikke med
 * bordets speker. Det er den hele botens eget søk som merker, ikke en generator som later som.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { byttTilstand, IDENTITET, kanoniskBytte, type Fargebytte } from "../src/mlb/fargebytte.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { settParlytter, type Parhendelse } from "../src/moe2/sikkerorakel.ts";
import type { ParResultat } from "../src/moe2/sdpar.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { e1SpillTrekkMedTro, E1_SPILL_DIM_V9 } from "../src/e1/trekk.ts";
import { e1KortBokTrekk, erKortbokBredde } from "../src/e1/kortbok.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { kortIndeks } from "../src/nevro/index.ts";
import { bordTekst, lesBord, slot, tilSeter } from "./drivere.ts";

const rund4 = (x: number): number => Math.round(x * 10_000) / 10_000;

/**
 * Bredden på kortnettet i speken (`e1:<fil>.bin`), så trekkene har nøyaktig nettets bredde.
 *
 * Et nett med sanseblokk (≥ 558) avvises: blokken fylles fra en tro ved spilletid, og en rad uten den
 * ville vært en annen vektor enn nettet ser. Uten `e1:` i speken må `--bredde` oppgis.
 */
export function kortnettBredde(spek: string): number {
  const treff = [...spek.matchAll(/(?:^|:)e1:([^:@]+\.bin)/g)];
  const fil = treff.at(-1)?.[1];
  if (fil === undefined) throw new Error(`Fant ingen «e1:<fil>.bin» i «${spek}» – oppgi --bredde`);
  const inn = nettFraBytes(new Uint8Array(readFileSync(fil)))[0]?.lag[0]?.inn;
  if (inn === undefined) throw new Error(`Tomt nett i ${fil}`);
  if (inn >= E1_SPILL_DIM_V9) throw new Error(`${fil} er ${inn} bredt – sanseblokken krever en tro, ikke støttet her`);
  return inn;
}

/**
 * DET SOM MÅ VÆRE K2-INVARIANT: trekkene og søkets verdi per lovlig kort. Eksportert for prøven, som
 * bytter skjulte kort og krever samme svar — og som fanger en variant som kikker.
 */
export function kortEtikett(
  state: GameState,
  sete: number,
  par: ParResultat,
  dim: number,
  bok: Hukommelse | null = null,
  bytte: Fargebytte = IDENTITET,
): { t: number[]; v: Record<string, number> } {
  /**
   * `bytte` er kanoniseringen (`--kanonisk`), IDENTITET ellers — og da er hver rad
   * byte-identisk med før. Byttet er regnet av `spillerVisning` alene på kallstedet,
   * så K2 står: `byttTilstand` ser skjulte kort, men PERMUTASJONEN gjør det ikke, og
   * en permutasjon av en verden er en like gyldig verden.
   *
   * TREKKENE OG ETIKETTEN MÅ FØLGE SAMME BYTTE. Døpes bare `t` om, peker `v` på kort
   * som ikke lenger ligger der — og ingenting krasjer, nettet lærer bare støy.
   */
  const s = byttTilstand(state, bytte);
  let t: number[];
  if (erKortbokBredde(dim)) {
    // En tom bok her ville skrevet 144 nuller som ser ut som «første runde» i hver rad.
    if (bok === null) throw new Error(`Bredde ${dim} leser motstanderboka, men ingen bok er gitt`);
    // Boka er fargeløs (48 skalarer per motstander), så den går inn uendret.
    t = Array.from(e1KortBokTrekk(s, sete, bok.vektor(sete, state.antallSpillere)));
  } else {
    t = Array.from(e1SpillTrekkMedTro(s, sete, dim, null));
  }
  const v: Record<string, number> = {};
  for (const k of par.kandidater) v[String(kortbytteIndeks(kortIndeks(k.kort), bytte))] = rund4(k.snitt);
  return { t, v };
}

/** Kortindeksen etter et fargebytte: valøren står, fargen flytter. */
export const kortbytteIndeks = (i: number, p: Fargebytte): number => p[Math.floor(i / 13)]! * 13 + (i % 13);

function kjør(): void {
  const arg = (n: string, s: string): string => {
    const i = process.argv.indexOf(n);
    return i < 0 ? s : (process.argv[i + 1] ?? s);
  };
  const SPEK = arg("--spek", "");
  if (SPEK === "" || !SPEK.includes("sik:")) {
    throw new Error("--spek mangler eller har ikke «sik:» – uten søket i speken finnes ingen etiketter");
  }
  const UT = arg("--ut", "");
  if (UT === "") throw new Error("--ut mangler");
  const KAMPER = tall(arg("--kamper", "40"), 40, "kamper");
  const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
  const SJANSE = Number(arg("--sjanse", "1"));
  const FRØ = tall(arg("--froe", "500000000"), 500_000_000, "froe");
  const MAKSRUNDER = tall(arg("--maksrunder", "60"), 60, "maksrunder");
  const BREDDE = process.argv.includes("--bredde") ? tall(arg("--bredde", "273"), 273, "bredde") : kortnettBredde(SPEK);
  /**
   * `--kanonisk`: DØP OM FARGENE før trekkene bygges — trumf først, så det etterlyste
   * kortets farge, så resten etter en offentlig nøkkel (`kanoniskBytte`). Samme flagg og
   * samme nøkkel som `examples/mlb-trodata.ts`, fordi et kanonisk kortnett og et kanonisk
   * trohode må være enige om hva fargene HETER: de sitter i samme spek, og søket i `sik:`
   * mater troen med stillinger kortnettet spiller ut.
   *
   * SØKET SELV ER URØRT. Etikettene (`v`) kommer fra `vurderPar` på den EKTE stillingen;
   * bare navnene på fargene byttes etterpå. Kanoniseringen kan derfor ikke endre ett valg
   * eller én verdi — den flytter bare hvilken kolonne de står i.
   */
  const KANONISK = process.argv.includes("--kanonisk");
  mkdirSync(dirname(UT), { recursive: true });

  /** Én spek per sete; uten `--drivere` fire ganger `SPEK`, alle registrert (se `drivere.ts`). */
  const BORD = lesBord(process.argv, SPEK);
  const kamp = BORD.spek.map((x) => lagIndre(x));
  if (BORD.blandet) console.log(`Bord (kamp 0): ${bordTekst(BORD, 0)}${BORD.rotasjon ? "  [roterer per kamp]" : ""}`);

  /**
   * FANGSTEN. Lytteren er global for prosessen, så den lytter BARE mens et `@`-sete som skal merkes
   * bestemmer seg. En populasjonsspek med `sik:` ville ellers fått sine verdier skrevet som kandidatens.
   */
  const fangst: { lytt: boolean; h: Parhendelse | null; antall: number } = { lytt: false, h: null, antall: 0 };
  settParlytter((h) => {
    if (!fangst.lytt) return;
    fangst.h = h;
    fangst.antall++;
  });

  const velg = lagRng(9_500_000 + SI);
  let skrevet = 0;
  let beslutninger = 0;
  let utenPar = 0;
  let doble = 0;
  let msSøk = 0;
  const t0 = Date.now();

  for (let g = 0; g < KAMPER; g++) {
    if (g % SN !== SI) continue;
    const frø = FRØ + g * 7717;
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, frø);
    for (const a of kamp) a.nyKamp();
    const seter = tilSeter(BORD, kamp, g);
    // Boka er kampens: ny per kamp, og bare for bokbredden (standardveien lager ingen).
    const bok = erKortbokBredde(BREDDE) ? new Hukommelse() : null;
    let sist: GameState | null = null;
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.rundeNr < MAKSRUNDER && vakt++ < 40_000) {
      for (const a of kamp) a.observer?.(s);
      bok?.observer(s);
      sist = s;
      if (s.fase === "RUNDE_SLUTT") {
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      // Opptaket FØR trekningen, og trekningen bare for kandidatens kortvalg: strømmen følger kampen.
      const merk =
        s.fase === "SPILL" && BORD.opptak[slot(BORD, sete, g)]! && lovligeKort(s, sete).length >= 2 && velg() < SJANSE;
      fangst.h = null;
      fangst.antall = 0;
      fangst.lytt = merk;
      const t1 = performance.now();
      const h = seter[sete]!.velgHandling(s);
      fangst.lytt = false;
      if (merk) {
        beslutninger++;
        msSøk += performance.now() - t1;
        const f = fangst.h as Parhendelse | null;
        if (f === null || f.sete !== sete) {
          utenPar++;
        } else {
          if (fangst.antall > 1) doble++;
          // Nøkkelen leser bare setets egen visning (K2); uten flagget er dette identiteten.
          const kb = KANONISK ? kanoniskBytte(spillerVisning(s, sete)) : IDENTITET;
          appendFileSync(
            UT,
            JSON.stringify({
              frø,
              kamp: g,
              runde: s.rundeNr,
              stikk: s.stikkSpilt,
              sete,
              rolle: rolleFor(s, sete),
              mål: f.sik.lagmål ? "lag" : "standard",
              n: f.par.n,
              sigma: rund4(f.par.sigma),
              // `p` og `b` er kortindekser og må inn i SAMME ramme som `t` og `v`.
              p: h.type === "SPILL" ? kortbytteIndeks(kortIndeks(h.kort), kb) : null,
              b: kortbytteIndeks(kortIndeks(f.par.beste.kort), kb),
              ...kortEtikett(s, sete, f.par, BREDDE, bok, kb),
            }) + "\n",
          );
          skrevet++;
        }
      }
      s = utfør(s, h).state;
    }
    if (sist !== s) {
      for (const a of kamp) a.observer?.(s);
      bok?.observer(s);
    }
    process.stdout.write(`\r  skard ${SI}/${SN}: kamp ${g}, ${skrevet} kortvalg, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  }
  settParlytter(null);
  const sek = (Date.now() - t0) / 1000;
  console.log(
    `\nSkard ${SI}/${SN} ferdig: ${skrevet} merkede kortvalg av ${beslutninger} (uten par ${utenPar}, doble ${doble}) → ${UT}`,
  );
  // Maskinlesbart, bakerst: kostnaden løkka dimensjonerer etter.
  console.log(`SEKUNDER ${sek.toFixed(1)}`);
  console.log(`MS-PER-MERKET ${skrevet > 0 ? ((sek * 1000) / skrevet).toFixed(1) : "nan"}`);
  console.log(`MS-SOEK-PER-MERKET ${beslutninger > 0 ? (msSøk / beslutninger).toFixed(1) : "nan"}`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
