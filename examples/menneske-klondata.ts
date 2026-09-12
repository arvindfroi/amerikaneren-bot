/**
 * MENNESKEKLONENS TRENINGSDATA — alle fire valgene mennesket tar, i den EKTE stillingen (12. sep).
 *
 *   node examples/menneske-klondata.ts --band trening --ut D:/amb-grp/klon/trening
 *     [--data D:/amb-grp/menneske/hendelser.jsonl] [--etter 2026-08-10] [--skard 0/1]
 *
 * ===================== HVORFOR DENNE OG IKKE `menneskeklon-data.ts` =====
 *
 * Den gamle (`examples/menneskeklon-data.ts`, juli) leser en TEKSTEKSPORT, TVINGER budrunden
 * («budvinneren melder, alle andre passer») og henter bare KORTVALG, i MesterAI-klonens
 * 325-format. Den var riktig for det den skulle: en stedfortreder for MesterAI inne i
 * SD-rolloutene. Den er feil for dette: en kunstig budrunde er en annen budhistorikk enn den
 * som ble spilt, og et bud-hode trent på den ville lært å by mot et bord som ikke bød.
 *
 * `examples/menneske-logg.ts` (11. sep) løste nøyaktig dette: budrunden SPILLES OM med
 * budgiverne mennesket møtte (`V5_KJEDE`), menneskets egne bud tvunget i loggens rekkefølge, og
 * GODTAS BARE når den ender i loggens budvinner og kontrakt. Hver runde utføres deretter gjennom
 * `utfør`, som kaster på ulovlig trekk, og til slutt må motorens `delta` og `totalPoeng` være
 * loggens. En runde som ikke består blir aldri en rad. Den gjenskapingen gjenbrukes her —
 * ÉN leser, som fila der sier: to parsere av samme logg er to steder en runde kan forsvinne.
 *
 * ===================== FIRE HODER, FIRE FILER ============================
 *
 * Radene skrives i formatene de EKSISTERENDE trenerne alt leser, så ingen ny trener trengs:
 *
 *   <ut>/kort/s<i>.jsonl   `verktoy/sd-tren.py`    t (273), v per lovlig kort, frø, stikk
 *   <ut>/bud/s<i>.jsonl    `verktoy/budq-tren.py`  x (143), q per lovlig bud, policy, frø
 *   <ut>/par/s<i>.jsonl    `verktoy/vrak-tren.py`  kand[] (27 / 25), `type` skiller vrak og kall
 *
 * ETIKETTEN ER ÉN-VARM: menneskets faktiske valg får 1, hver annen lovlig kandidat 0. Trenerne
 * er skrevet for utspillingsVERDIER, men de optimerer alle en myk kryssentropi mot
 * `softmax(v/τ)` innenfor stillingen — med én-varme etiketter og lav τ er det nøyaktig en
 * klassifikator, og `--tau` styrer hvor skarp. Da blir trenernes egne holdout-tall det vi vil
 * vite: `treff` ER topp-1-enighet med mennesket, og `anger` ER 1 − treff.
 *
 * ===================== KANDIDATSETTENE ER BOTENS =========================
 *
 * Vrak og kall scores per KANDIDAT, og kandidatene er `klonVrakpar` / `etterlystKandidater` —
 * nøyaktig settene `Vrakrangerer` velger mellom, NevroHjernes eget par inkludert. Et eget sett
 * ville gjort «klonen er enigere med mennesket enn boten er» til to ulike spørsmål.
 *
 * OG DET GIR ET TAK SOM MÅ MÅLES, IKKE ANTAS: lå ikke menneskets faktiske par blant
 * kandidatene, kan ingen vekt treffe det. Raden forkastes da og TELLES (`utenfor`), og andelen
 * skrives ut. Uten det tallet ville et tak sett ut som en dårlig klone.
 *
 * ===================== BÅNDET ============================================
 *
 * `--band trening|holdout` er `menneskeBånd(kamp-id)` fra `menneske-logg.ts`: hver fjerde kamp
 * er holdout, avsatt på id FØR første rad. Samme deling som trohodene bruker, så en kamp kan
 * ikke ligge i trening her og holdout der. `frø` i hver rad er `fnv(kamp-id)` — trenernes
 * giv-deling hasher det feltet, så DERES holdout blir også per kamp, og `sd-tren.py` avbryter
 * selv med «GIV-LEKKASJE» hvis en kamp skulle havne i begge.
 *
 * ===================== PSEUDONYMER =======================================
 *
 * `spiller` i loggen er et pseudonym og skrives ALDRI ut, heller ikke i radene.
 */

import { appendFileSync, mkdirSync } from "node:fs";

import { lovligeHandlinger, lovligeKort, type GameState } from "../src/motor.ts";
import type { Farge, Kort } from "../src/kort.ts";
import type { Bud } from "../src/regler.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { NevroAgent, kortIndeks } from "../src/nevro/index.ts";
import { budqTrekk, BUDQ_BUD } from "../src/moe2/budq.ts";
import { etterlystKandidater, etterlystTrekk, vraktrekkK } from "../src/moe2/vraktrekk.ts";
import { klonVrakpar, nevroVrakpar, KLON_KORT_DIM } from "../src/moe2/menneskeklon.ts";
import { e1SpillTrekkMedTro } from "../src/e1/trekk.ts";
import {
  erSpiller,
  fnv,
  kamprunder,
  lesMenneskelogg,
  MENNESKE,
  MENNESKE_FRA,
  menneskeBånd,
  nyTeller,
  skardAv,
  tellerTekst,
  tidsside,
  V5_KJEDE,
} from "./menneske-logg.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};

const BAND = arg("--band", "trening");
if (BAND !== "trening" && BAND !== "holdout") throw new Error(`Ukjent bånd «${BAND}» (trening|holdout)`);
const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
const UT = arg("--ut", `D:/amb-grp/klon/${BAND}`);
const ETTER = arg("--etter", MENNESKE_FRA);

/**
 * ===================== ÉN SPILLER, DELT PÅ TID (12. sep) =================
 *
 *   --spiller <prefiks>   bare denne spillerens kamper (pseudonymprefiks, `erSpiller`)
 *   --snitt <dato> --side foer|etter   KAMPENE FØR eller ETTER datoen
 *
 * HVORFOR EN DATO OG IKKE `--band`. Båndet deler på en hash av kamp-id, og det er riktig for
 * et trohode som skal lære «mennesker». En MODELL AV ÉN SPILLER skal svare på et annet
 * spørsmål: hjelper det å kjenne ham FRA FØR? Da må treningen ligge i FORTIDEN til holdouten,
 * ikke være tilfeldig spredt gjennom den. En hash-deling ville latt klonen lære av kamper som
 * ble spilt etter dem den dømmes på, og «kjenner spilleren» hadde vært umulig å skille fra
 * «har sett framtiden».
 *
 * SNITTET GÅR PÅ KAMP, ikke på runde (`tidsside`). En kamp som spenner over datoen hører
 * ingen steder hjemme og TELLES (`spennende`) i stedet for å bli gjettet på. Delte vi på
 * rundetidspunkt, ville holdouten inneholdt kamper klonen alt hadde sett halve av — samme
 * giv-lekkasje `sd-tren.py` stopper for.
 *
 * `--snitt` SLÅR AV `--band`, med vilje: to delinger oppå hverandre ville kastet en firedel av
 * en spillers kamper uten at noen ba om det, og «holdout» hadde betydd to ting i samme fil.
 * Uten `--snitt` er hver rad som før — bånddelingen er urørt.
 */
const SPILLER = arg("--spiller", "");
const SNITT = arg("--snitt", "");
const SIDE = arg("--side", "");
if (SIDE !== "" && SIDE !== "foer" && SIDE !== "etter") throw new Error(`Ukjent --side «${SIDE}» (foer|etter)`);
if ((SNITT === "") !== (SIDE === "")) throw new Error("--snitt og --side må oppgis sammen");
const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
if (!Number.isFinite(SI) || !Number.isFinite(SN) || SN < 1) throw new Error("--skard <i>/<n>");

const rund = (x: number): number => Math.round(x * 10_000) / 10_000;
const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;
const parNøkkel = (vrak: readonly Kort[], trumf: Farge): string => `${trumf}|${vrak.map(nøkkel).sort().join(",")}`;

for (const m of ["kort", "bud", "par"]) mkdirSync(`${UT}/${m}`, { recursive: true });
const FIL = {
  kort: `${UT}/kort/s${SI}.jsonl`,
  bud: `${UT}/bud/s${SI}.jsonl`,
  par: `${UT}/par/s${SI}.jsonl`,
};

/**
 * MENNESKETS HANDLING UTLEDES AV TILSTANDSPARET, ikke av en ny loggparser.
 *
 * `gjenskapRunde` gir hver tilstand fra utdelingen til rundeslutt. Handlingen som ble gjort i
 * `s` er derfor differansen mot `neste` — og den er entydig for hver av de fire fasene. Å lese
 * `valg-bud`/`valg-kort`-hendelsene i stedet ville vært en ANDRE parser av samme logg, og de to
 * kunne kommet i utakt uten at noe feilet.
 */
function budAv(s: GameState, neste: GameState): Bud | null {
  if (neste.budrunde.passet[MENNESKE] === true && s.budrunde.passet[MENNESKE] !== true) return "PASS";
  const b = neste.budrunde.sisteBud[MENNESKE];
  if (b !== null && b !== undefined && b !== s.budrunde.sisteBud[MENNESKE]) return b;
  return null;
}

function kortAv(s: GameState, neste: GameState): Kort | null {
  if (neste.bord.length > s.bord.length) return neste.bord[neste.bord.length - 1]?.kort ?? null;
  // Stikket ble fullt: kortet ligger i `forrigeStikk`.
  for (const kp of neste.forrigeStikk?.kort ?? []) if (kp.spiller === MENNESKE) return kp.kort;
  return null;
}

const spill = lesMenneskelogg(DATA);
const nevro = new NevroAgent();
const teller = nyTeller();

let kamper = 0;
/** Kamper som SPENNER over `--snitt`: de hører ingen side til, og telles i stedet for å gjettes på. */
let spennende = 0;
let rKort = 0;
let rBud = 0;
let rVrak = 0;
let rKall = 0;
/** Menneskets faktiske valg lå ikke blant kandidatene — et TAK, ikke en dårlig klone. */
let utenforVrak = 0;
let utenforKall = 0;
let utenTur = 0;
const t0 = Date.now();

for (const [id, kamp] of spill) {
  if (kamp.start === null) continue;
  if (skardAv(id, SN) !== SI) continue;
  if (!erSpiller(kamp, SPILLER)) continue;
  // Med `--snitt` deler TIDEN, ikke hashen — og en kamp som spenner over snittet telles bort.
  if (SNITT === "") {
    if (menneskeBånd(id) !== BAND) continue;
  } else {
    const side = tidsside(kamp, SNITT);
    if (side === null) {
      spennende++;
      continue;
    }
    if (side !== SIDE) continue;
  }
  if (!kamp.runder.some((r) => r.tid >= ETTER)) continue;
  kamper++;
  const frø = fnv(id);
  const budgivere = [0, 1, 2, 3].map(() => lagIndre(V5_KJEDE));
  const kortLinjer: string[] = [];
  const budLinjer: string[] = [];
  const parLinjer: string[] = [];

  for (const steg of kamprunder(kamp, budgivere, teller)) {
    if (steg.runde === null) continue;
    if (steg.hendelse.tid < ETTER) continue;
    const ts = steg.runde.tilstander;

    // Vraket og trumfen hører til SAMME beslutning (`Vrakrangerer` scorer paret under ett), så
    // trumfen må hentes fra VELG-tilstanden før vrakraden kan skrives.
    let menneskeVrak: Kort[] | null = null;
    let vrakStilling: GameState | null = null;

    for (let i = 0; i + 1 < ts.length; i++) {
      const s = ts[i]!;
      const neste = ts[i + 1]!;

      if (s.fase === "BUDRUNDE" && s.iTur === MENNESKE) {
        const bud = budAv(s, neste);
        const lov = lovligeHandlinger(s);
        if (bud === null || lov.fase !== "BUDRUNDE" || lov.bud.length < 2) {
          if (bud === null) utenTur++;
          continue;
        }
        const q: Record<string, number[]> = {};
        for (const b of lov.bud) {
          const j = BUDQ_BUD.indexOf(b);
          if (j < 0) continue;
          q[String(b)] = [b === bud ? 1 : 0];
        }
        if (Object.keys(q).length < 2) continue;
        budLinjer.push(
          JSON.stringify({
            frø,
            runde: s.rundeNr,
            sete: MENNESKE,
            policy: String(bud),
            x: Array.from(budqTrekk(s, MENNESKE, null, false), rund),
            q,
          }),
        );
        rBud++;
        continue;
      }

      if (s.fase === "VRAK" && s.budvinner === MENNESKE) {
        menneskeVrak = neste.vrak.slice();
        vrakStilling = s;
        continue;
      }

      if (s.fase === "VELG" && s.budvinner === MENNESKE) {
        const trumf = neste.trumf;
        if (trumf === null) continue;

        // --- VRAKGRUPPEN: (trumf, vrak) som ett par -------------------------
        if (menneskeVrak !== null && vrakStilling !== null) {
          const fasit = parNøkkel(menneskeVrak, trumf);
          nevro.nyKamp();
          const par = klonVrakpar(vrakStilling, MENNESKE, nevroVrakpar(nevro, vrakStilling, MENNESKE));
          if (par.length >= 2 && par.some((p) => parNøkkel(p.vrak, p.trumf) === fasit)) {
            const hånd = (vrakStilling.hender[MENNESKE] ?? []).slice();
            parLinjer.push(
              JSON.stringify({
                frø,
                runde: s.rundeNr,
                sete: MENNESKE,
                // INGEN `nevro`-MERKING. Feltet er `vrak-tren.py` sin POLICY-referanse — «hva
                // ville policyen valgt» — og her er det ingen policy, bare mennesket. Merket vi
                // fasiten, ville treneren rapportert POLICY-ANGER 0,0000 og sett ut som om en
                // grunnlinje traff perfekt. Uten feltet rapporterer den nan: ingen referanse,
                // sagt rett ut. Grunnlinjene måles i `menneske-klondom.ts`, mot ekte boter.
                kand: par.map((p) => ({
                  t: Array.from(vraktrekkK(vrakStilling!, MENNESKE, hånd, p.vrak, p.trumf), rund),
                  v: parNøkkel(p.vrak, p.trumf) === fasit ? 1 : 0,
                })),
              }),
            );
            rVrak++;
          } else if (par.length >= 2) {
            utenforVrak++;
          }
        }
        menneskeVrak = null;
        vrakStilling = null;

        // --- KALLGRUPPEN: etterlysningen ------------------------------------
        const kalt = neste.etterlyst;
        if (kalt !== null) {
          const kand = etterlystKandidater(s, trumf);
          if (kand.length >= 2 && kand.some((k) => nøkkel(k) === nøkkel(kalt))) {
            parLinjer.push(
              JSON.stringify({
                type: "etterlyst",
                frø,
                runde: s.rundeNr,
                sete: MENNESKE,
                trumf,
                kand: kand.map((k) => ({
                  t: Array.from(etterlystTrekk(s, MENNESKE, trumf, k), rund),
                  v: nøkkel(k) === nøkkel(kalt) ? 1 : 0,
                })),
              }),
            );
            rKall++;
          } else if (kand.length >= 2) {
            utenforKall++;
          }
        }
        continue;
      }

      if (s.fase === "SPILL" && s.iTur === MENNESKE) {
        const kort = kortAv(s, neste);
        if (kort === null) {
          utenTur++;
          continue;
        }
        const lovlige = lovligeKort(s, MENNESKE);
        // Ett lovlig kort er REGLENE, ikke atferd — det ville fortynnet settet med gratis treff.
        if (lovlige.length < 2) continue;
        const v: Record<string, number> = {};
        for (const k of lovlige) v[String(kortIndeks(k))] = nøkkel(k) === nøkkel(kort) ? 1 : 0;
        kortLinjer.push(
          JSON.stringify({
            frø,
            runde: s.rundeNr,
            stikk: s.stikkSpilt,
            sete: MENNESKE,
            t: Array.from(e1SpillTrekkMedTro(s, MENNESKE, KLON_KORT_DIM, null), rund),
            v,
          }),
        );
        rKort++;
      }
    }
  }

  if (kortLinjer.length > 0) appendFileSync(FIL.kort, kortLinjer.join("\n") + "\n");
  if (budLinjer.length > 0) appendFileSync(FIL.bud, budLinjer.join("\n") + "\n");
  if (parLinjer.length > 0) appendFileSync(FIL.par, parLinjer.join("\n") + "\n");
  process.stdout.write(`\r  skard ${SI}/${SN} (${BAND}): ${kamper} kamper, ${rKort} kort, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}

const merke =
  SNITT === ""
    ? `bånd ${BAND}`
    : `spiller ${SPILLER === "" ? "(alle)" : SPILLER}, ${SIDE} ${SNITT}`;
console.log(
  `\nSkard ${SI}/${SN}, ${merke}: ${kamper} kamper → ${rKort} kortvalg, ${rBud} bud, ${rVrak} vrak, ${rKall} kall`,
);
if (spennende > 0) {
  console.log(`  ${spennende} kamper SPENNER over ${SNITT} og er utelatt fra begge sider (ingen giv-lekkasje).`);
}
console.log(`  ${tellerTekst(teller)}`);
// TAKET, sagt høyt: kandidatsettet kan ikke inneholde menneskets valg i hver stilling.
console.log(
  `  UTENFOR KANDIDATSETTET: vrak ${utenforVrak} (${(100 * utenforVrak / Math.max(1, rVrak + utenforVrak)).toFixed(1)} %), ` +
    `kall ${utenforKall} (${(100 * utenforKall / Math.max(1, rKall + utenforKall)).toFixed(1)} %). ` +
    `Disse er et TAK på oppnåelig enighet, ikke en dårlig klone.`,
);
if (utenTur > 0) console.log(`  ${utenTur} tilstander der menneskets handling ikke lot seg utlede av tilstandsparet`);
console.log(`  → ${FIL.kort}, ${FIL.bud}, ${FIL.par}`);
