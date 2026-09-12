/**
 * SØKETS VERDENER MOT ET KJENT MENNESKE — betaler det å ANTA HANS POLICY? (12. sep)
 *
 *   node examples/menneske-verdener.ts --spiller 957f6f6c --snitt 2026-09-01 --side etter \
 *     --armer "av|-,selv|selv,klon|<spek>@0,feil|<annen spek>@0" --ut analyse/klon-p957/verdener.jsonl
 *   node examples/menneske-verdener.ts --dom analyse/klon-p957/verdener.jsonl
 *
 * ===================== SPØRSMÅLET, OG HVORFOR AKKURAT DETTE ==============
 *
 * Tre målinger står bak denne fila, og de peker samme vei:
 *
 *   AGENT T   trohodet blir DÅRLIGERE av å få vite motstanderens identitet, også servert som
 *             orakel. Aggregerte vanetall er feil form.
 *   AGENT U   en spillerprofil av nettopp de aggregatene (48 tall, `src/mlb/profil.ts`) er
 *             K2-ren og bit-identisk når den er av — og gir ingenting: +0,06 ± 0,02 pp
 *             prediksjon, med fella som slapp unna.
 *   AGENT V   det som VIRKER er å simulere: `~lik=` vekter hver kandidatverden etter hvor godt
 *             den forklarer motstandernes FAKTISKE kort under en ANTATT POLICY. +3,83 pp
 *             riktig plasserte kort fra stikk 7, −0,096 nat/kort K8.
 *
 * Agent V antok at motstanderen spiller SOM OSS (`~lik=selv`). Sitter det et KJENT MENNESKE
 * der, er det anslaget beviselig feil: menneskeklonen (agent S) treffer menneskets kortvalg
 * 63,8 % mot botenes 50,3 %. Hypotesen her er derfor at profilen som betaler ikke er 48 tall
 * om en spiller, men en MODELL av ham satt inn som antatt policy på HANS sete.
 *
 * ===================== STILLINGENE ER EKTE, OG HOLDT UTENFOR =============
 *
 * Kampene gjenskapes av `menneske-logg.ts` — budrunden spilt om med v5-kjeden og menneskets
 * bud tvunget, hvert trekk gjennom `utfør`, motorens poeng mot loggens. Ingen bot velger et
 * kort, så armene måles i NØYAKTIG de stillingene som ble spilt.
 *
 * Utvalget er `--side etter --snitt <dato>`: kamper spilt ETTER at klonen sluttet å lære.
 * Snittet går på KAMP (`tidsside`), og kamper som spenner over det er ute av begge sider.
 * Klonen har altså aldri sett én runde av det den dømmes på, og den har heller ikke sett
 * FRAMTIDEN til dem — som en hash-deling ville latt den gjøre.
 *
 * ===================== OBSERVATØREN ER EN BOT ============================
 *
 * Bare seter som IKKE er mennesket måles. Det er appens tilfelle: boten sitter ved bordet og
 * skal slutte seg til hva mennesket har på hånden. Mennesket som observatør ville målt hva
 * han vet om botene, som ingen har spurt om.
 *
 * TO KOLONNER, og forskjellen mellom dem er hele poenget:
 *
 *   alle   hvert skjulte kort, hos hvem som helst
 *   menn   BARE menneskets kort (`mål`-parameteren i `k8-maal.ts`). Det er her en modell av
 *          HAM må slå ut. Slår en arm ut like mye på `alle` som på `menn`, har den ikke lært
 *          noe om personen — den har bare gjort vektingen skarpere.
 *
 * ===================== ARMENE ============================================
 *
 *   `navn|-`            ingen likelihood-vekt. Grunnarmen alt måles mot.
 *   `navn|selv`         v5-kjeden for ALLE setene — botene som faktisk satt der. Dette er
 *                       agent V sin arm, og det ærlige anslaget uten personkunnskap.
 *   `navn|<spek>@<sete>` v5-kjeden for alle, men <spek> for <sete>. Modellen av spilleren.
 *   `navn|<spek>`       <spek> for alle setene (sjelden nyttig; med for symmetriens skyld).
 *
 * Speken deles fra setet på SISTE «@» (`lastIndexOf`), som `okt:profil=<sti>@<sete>` og
 * `~lik=…,<fil>@<sete>` gjør det — en klonespek inneholder selv «@» mellom de fire nettene.
 *
 * FELLENE MÅ VÆRE MED, ellers måler dette bare «enhver vekting hjelper»:
 *
 *   feil person   en klone av en ANNEN spiller, trent av samme rørledning. Gjør den like mye
 *                 som den riktige, er det ikke personen som betaler.
 *   feil sete     den riktige klonen lagt på et BOTSETE. Treffer den like godt der, når
 *                 setefeltet ikke fram, og «per sete» er pynt.
 *
 * ===================== SAMME FRØ, SAMME KANDIDATER =======================
 *
 * Alle armene får samme frø per stilling og samme kandidatantall, så forskjellen er parvis mot
 * grunnarmen. Ingen søketro her (`trovekt` udefinert): armene skal skille seg på likelihooden
 * alene, og et trohode oppå ville blandet to vekter i ett tall. Budvekten står PÅ, som i
 * `app`-armen i `sok-verdener.ts`.
 *
 * SE er klyngebootstrap over KAMP (`klyngeSnitt`), på den PARVISE differansen per stilling:
 * stillinger i samme kamp deler giver, motstand og dagsform.
 *
 * ===================== PSEUDONYMER =======================================
 *
 * `--spiller` er et pseudonymPREFIKS (`erSpiller`). Ingen navn finnes i loggen, og verken
 * pseudonymet eller prefikset skrives til radene.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, utenSøk, type Spekagent } from "../src/moe2/agentspek.ts";
import { lagLikvekt } from "../src/moe2/likvekt.ts";
import { trekkVerdener } from "../src/moe2/sdkort.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { intTilKort } from "../src/solver/dds.ts";
import type { Verden } from "../src/solver/sampler.ts";
import { fordelingFra, gulvene, nettTap } from "./k8-maal.ts";
import { klyngeSnitt } from "./klynge.ts";
import {
  erSpiller,
  fnv,
  kamprunder,
  lesMenneskelogg,
  MENNESKE,
  MENNESKE_FRA,
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

interface Rad {
  readonly kamp: string;
  readonly runde: number;
  readonly stikk: number;
  readonly rolle: string;
  readonly sete: number;
  readonly [kolonne: string]: number | string;
}

const FASTE = new Set(["kamp", "runde", "stikk", "rolle", "sete", "kort", "kortM"]);

// ===========================================================================
// DOM-MODUS
// ===========================================================================

/** Stikkbøttene agent V rapporterte gevinsten i. Grensene er hans, ikke nye. */
const BØTTER: readonly { navn: string; i: (r: Rad) => boolean }[] = [
  { navn: "stikk 0-3", i: (r) => r.stikk <= 3 },
  { navn: "stikk 4-6", i: (r) => r.stikk >= 4 && r.stikk <= 6 },
  { navn: "stikk 7+", i: (r) => r.stikk >= 7 },
];

function kjørDom(): void {
  /**
   * Filene står rett bak `--dom` og slutter ved neste flagg. En `filter(x => !x.startsWith("--"))`
   * ville tatt VERDIEN til et flagg bak filene (`--grunn feil` → fila «feil») og krasjet på en
   * fil som ikke finnes — eller verre, tiet om den fantes.
   */
  const filer: string[] = [];
  for (const x of process.argv.slice(process.argv.indexOf("--dom") + 1)) {
    if (x.startsWith("--")) break;
    filer.push(x);
  }
  if (filer.length === 0) throw new Error("--dom <filer...>");
  const rader: Rad[] = [];
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") rader.push(JSON.parse(l) as Rad);
  }
  if (rader.length === 0) throw new Error("ingen rader");
  const armer = Object.keys(rader[0]!).filter((k) => !FASTE.has(k) && !k.endsWith("_ms") && !k.endsWith("_k8") && !k.endsWith("_m") && !k.endsWith("_mk8"));
  /**
   * ============ HVILKEN ARM ALT MÅLES MOT (`--grunn`) ======================
   *
   * Standard er den første armen (`av`), og det svarer på «hjelper vekting i det hele tatt».
   * Men FELLA i denne målingen er et annet spørsmål: gjør RIKTIG persons modell det bedre enn
   * en ANNEN persons? Det er en parvis differanse mellom to armer som begge har vekt, og den
   * kan ikke leses av to differanser mot `av` — de deler støy, og å trekke dem fra hverandre
   * for hånd gir feil SE. `--grunn feil` gjør sammenlikningen direkte, per stilling.
   */
  const grunn = arg("--grunn", armer[0]!);
  if (!armer.includes(grunn)) throw new Error(`Ukjent --grunn «${grunn}» (armer: ${armer.join(", ")})`);

  const vis = (utvalg: Rad[], merke: string): void => {
    if (utvalg.length === 0) return;
    console.log(`\n${merke}: ${utvalg.length} stillinger, ${new Set(utvalg.map((r) => r.kamp)).size} kamper`);
    for (const a of armer) {
      const linje: string[] = [];
      for (const [kol, navn] of [
        [a, "treff alle"],
        [`${a}_m`, "treff menn"],
        [`${a}_k8`, "K8 alle"],
        [`${a}_mk8`, "K8 menn"],
      ] as const) {
        const gk = kol.replace(a, grunn);
        const med = utvalg.filter((r) => Number.isFinite(r[kol] as number) && Number.isFinite(r[gk] as number));
        if (med.length === 0) continue;
        const snitt = med.reduce((s, r) => s + (r[kol] as number), 0) / med.length;
        // PARVIS PER STILLING, så klynges differansen på kamp. Ikke to uavhengige snitt.
        const d = klyngeSnitt(med, (r) => r.kamp, (r) => (r[kol] as number) - (r[gk] as number));
        const skala = navn.startsWith("treff") ? 100 : 1;
        const enhet = navn.startsWith("treff") ? "pp" : "";
        linje.push(
          `${navn} ${(snitt * skala).toFixed(navn.startsWith("treff") ? 2 : 4)}` +
            (a === grunn
              ? ""
              : `  (${d.snitt >= 0 ? "+" : ""}${(d.snitt * skala).toFixed(navn.startsWith("treff") ? 2 : 4)} ± ${(d.se * skala).toFixed(navn.startsWith("treff") ? 2 : 4)}${enhet})`),
        );
      }
      console.log(`  ${a.padEnd(10)} ${linje.join("   ")}`);
    }
  };

  vis(rader, "ALLE");
  for (const rolle of ["foerer", "makker", "forsvar"]) vis(rader.filter((r) => r.rolle === rolle), rolle.toUpperCase());
  for (const b of BØTTER) vis(rader.filter(b.i), b.navn.toUpperCase());

  // Maskinlesbart, bakerst.
  for (const a of armer) {
    for (const suff of ["", "_m", "_k8", "_mk8"]) {
      const kol = `${a}${suff}`;
      const gk = `${grunn}${suff}`;
      const med = rader.filter((r) => Number.isFinite(r[kol] as number) && Number.isFinite(r[gk] as number));
      if (med.length === 0) continue;
      const d = klyngeSnitt(med, (r) => r.kamp, (r) => (r[kol] as number) - (r[gk] as number));
      console.log(`DIFF ${a} ${suff === "" ? "treff" : suff.slice(1)} ${d.snitt.toFixed(6)} ${d.se.toFixed(6)} ${med.length}`);
    }
  }
}

// ===========================================================================
// KJØREMODUS
// ===========================================================================

interface Arm {
  readonly navn: string;
  /** null = ingen likelihood-vekt. */
  readonly velger: ((sete: number) => Spekagent) | null;
}

/** Andel av motstandernes håndkort verdenen legger hos riktig spiller. `mål` avgrenser hvem. */
function treff(
  s: GameState,
  sete: number,
  hender: readonly (readonly number[])[],
  mål: (p: number) => boolean,
): number {
  let r = 0;
  let n = 0;
  for (let p = 0; p < s.antallSpillere; p++) {
    if (p === sete || !mål(p)) continue;
    const ekte = new Set((s.hender[p] ?? []).map(kortIndeks));
    n += ekte.size;
    for (const c of hender[p] ?? []) if (ekte.has(kortIndeks(intTilKort(c)))) r++;
  }
  return n === 0 ? NaN : r / n;
}

function kjør(): void {
  const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
  const SPILLER = arg("--spiller", "");
  const SNITT = arg("--snitt", "");
  const SIDE = arg("--side", "etter");
  if (SIDE !== "foer" && SIDE !== "etter") throw new Error(`Ukjent --side «${SIDE}» (foer|etter)`);
  const ETTER = arg("--etter", MENNESKE_FRA);
  const V = Number(arg("--verdener", "24"));
  const KAND = Number(arg("--kand", "32"));
  const FRASTIKK = Number(arg("--frastikk", "0"));
  const SJANSE = Number(arg("--sjanse", "1"));
  const MAKS = Number(arg("--maks-kamper", "1000000"));
  const UT = arg("--ut", "analyse/klon/verdener.jsonl");
  const [SI, SN] = arg("--skard", "0/1").split("/").map(Number) as [number, number];
  const BUDSPEK = arg("--budspek", V5_KJEDE);
  /** Basen: kjeden botene FAKTISK spilte fra 10. aug. `selv` betyr denne, ikke ADAMS. */
  const BASIS = arg("--basis", V5_KJEDE);

  const ARMER: Arm[] = arg("--armer", "av|-,selv|selv").split(",").map((del) => {
    const rør = del.indexOf("|");
    if (rør < 0) throw new Error(`Ugyldig arm «${del}» – forventet navn|<policy>`);
    const navn = del.slice(0, rør);
    const pol = del.slice(rør + 1);
    if (FASTE.has(navn)) throw new Error(`Armnavnet «${navn}» kolliderer med en fast kolonne`);
    if (pol === "-") return { navn, velger: null };
    const basis = lagIndre(BASIS);
    if (pol === "selv") return { navn, velger: () => basis };
    /**
     * `<spek>@<sete>` deles på SISTE «@»: en klonespek (`menn:a@b@c@d`) har selv «@» inni seg.
     * Uten setet gjelder speken alle setene.
     */
    const at = pol.lastIndexOf("@");
    const sete = at < 0 ? null : Number(pol.slice(at + 1));
    const rå = at < 0 || !Number.isInteger(sete) ? pol : pol.slice(0, at);
    /**
     * `@<fil>` henter speken FRA FIL, nøyaktig som `~lik=@<fil>` gjør det. En klonespek er lang
     * og inneholder kolon; å skrive den inline her OG i speken ville vært to steder den kan bli
     * en annen klone enn den som ble målt.
     */
    const spek = rå.startsWith("@") ? readFileSync(rå.slice(1), "utf8").trim() : rå;
    if (spek === "") throw new Error(`Armen «${navn}»: speken er tom`);
    if (utenSøk(spek) !== spek) {
      throw new Error(`Armen «${navn}» søker – likelihooden ville søkt per observasjon per verden`);
    }
    const agent = lagIndre(spek);
    if (sete === null || !Number.isInteger(sete)) return { navn, velger: () => agent };
    return { navn, velger: (p: number) => (p === sete ? agent : basis) };
  });
  if (ARMER.length === 0) throw new Error("--armer er tom");

  const budgivere = [0, 1, 2, 3].map(() => lagIndre(BUDSPEK));
  const logg = lesMenneskelogg(DATA);
  const teller = nyTeller();
  mkdirSync(dirname(UT), { recursive: true });
  writeFileSync(UT, "");

  let kamper = 0;
  let skrevet = 0;
  const t0 = Date.now();
  for (const [id, kamp] of logg) {
    if (kamp.start === null || kamp.runder.length === 0) continue;
    if (skardAv(id, SN) !== SI) continue;
    if (!erSpiller(kamp, SPILLER)) continue;
    if (SNITT !== "" && tidsside(kamp, SNITT) !== SIDE) continue;
    if (!kamp.runder.some((r) => r.tid >= ETTER)) continue;
    if (kamper >= MAKS) break;
    kamper++;

    for (const steg of kamprunder(kamp, budgivere, teller)) {
      if (steg.runde === null) continue;
      if (steg.hendelse.tid < ETTER) continue;
      for (const s of steg.runde.tilstander) {
        if (s.fase !== "SPILL" || s.iTur === null) continue;
        const sete = s.iTur;
        // OBSERVATØREN ER EN BOT: appens tilfelle er at boten slutter seg til menneskets hånd.
        if (sete === MENNESKE) continue;
        if (s.stikkSpilt < FRASTIKK || lovligeKort(s, sete).length < 2) continue;
        if (SJANSE < 1 && fnv(`${id}|${s.rundeNr}|${s.stikkSpilt}|${sete}`) / 4_294_967_296 >= SJANSE) continue;
        const erMenn = (p: number): boolean => p === MENNESKE;
        const alle = gulvene(s, sete);
        const menn = gulvene(s, sete, erMenn);
        if (alle.kort === 0) continue;

        const rad: Record<string, unknown> = {
          kamp: id,
          runde: s.rundeNr,
          stikk: s.stikkSpilt,
          rolle: rolleFor(s, sete),
          sete,
          kort: alle.kort,
          kortM: menn.kort,
        };
        // SAMME FRØ FOR HVER ARM: forskjellen skal komme av vekten, ikke av trekningen.
        const frø = (fnv(id) + s.rundeNr * 7919 + s.stikkSpilt * 97 + sete) >>> 0;
        for (const a of ARMER) {
          const t0a = performance.now();
          const vekt: ((v: Verden) => number) | undefined =
            a.velger === null ? undefined : (lagLikvekt(s, sete, a.velger, {}) ?? undefined);
          const verdener = trekkVerdener(s, sete, V, lagRng(frø), undefined, vekt, KAND, undefined, true);
          rad[`${a.navn}_ms`] = Number((performance.now() - t0a).toFixed(2));
          if (verdener.length === 0) continue;
          const f = fordelingFra(verdener, s, sete);
          rad[a.navn] = Number(
            (verdener.reduce((x, w) => x + treff(s, sete, w, () => true), 0) / verdener.length).toFixed(5),
          );
          rad[`${a.navn}_k8`] = nettTap(f, s, sete, alle.kort).tap;
          if (menn.kort > 0) {
            rad[`${a.navn}_m`] = Number(
              (verdener.reduce((x, w) => x + treff(s, sete, w, erMenn), 0) / verdener.length).toFixed(5),
            );
            rad[`${a.navn}_mk8`] = nettTap(f, s, sete, menn.kort, erMenn).tap;
          }
        }
        appendFileSync(UT, JSON.stringify(rad) + "\n");
        skrevet++;
      }
    }
    process.stdout.write(
      `\r  skard ${SI}/${SN}: ${kamper} kamper, ${skrevet} stillinger, ${((Date.now() - t0) / 1000).toFixed(0)} s   `,
    );
  }
  console.log(`\n${kamper} kamper. ${tellerTekst(teller)}`);
  console.log(`${skrevet} stillinger → ${UT}`);
  console.log(`SEKUNDER ${((Date.now() - t0) / 1000).toFixed(1)}`);
}

if (process.argv.includes("--dom")) kjørDom();
else kjør();
