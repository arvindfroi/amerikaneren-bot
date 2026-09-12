/**
 * REVISJON AV SONDEN: BÆRER REKKA FAKTISK REKKEFØLGEN? (agent OE, 12. sep)
 *
 * ===================== HVORFOR DENNE PRØVEN FINNES =======================
 *
 * Sonde B (agent T) målte at den ordnede kortrekka ikke bar noe aggregatene manglet, og
 * konkluderte «ingen målt gevinst». En slik null er bare verdt noe hvis INNGANGEN var riktig:
 * en rekke som er forskjøvet, avkortet eller stokket innad i stikket, er ikke en rekkefølge —
 * den er støy med riktig form, og en modell som ikke finner noe i den, har ikke målt påstanden.
 * Da er nullen en målefeil forkledd som et funn, og det er det verste utfallet, fordi tallene
 * ser fornuftige ut.
 *
 * `test/mlb-sekvens.test.ts` prøver K2, bredden og paddingen. Den prøver IKKE ordenen mot en
 * uavhengig kilde: `STIKK` og `POSISJON` skrives av løkkeindeksen i `sekvensTrekk`, så
 * `v[STIKK] === ⌊i/4⌋` er sant per konstruksjon uansett hvilken rekkefølge kortene kom i.
 * Prøven der kan altså ikke skille en ekte rekke fra en stokket.
 *
 * ===================== DEN UAVHENGIGE KILDEN =============================
 *
 * `utfør` sender `KORT_SPILT` per kort, i den rekkefølgen kortene FAKTISK ble lagt. Den
 * strømmen er bokført her, uavhengig av `SpillerVisning.historikk`, og rekka fra
 * `sekvensTrekk` må stemme steg for steg med den — sete, kort, stikk og posisjon.
 * To kilder som er bygd av samme felt ville vært én kilde med to navn; hendelsesstrømmen
 * settes sammen i `utførSpill`, visningen leses av `historikk`/`bord`.
 *
 * ===================== FELLENE, EN PER MÅTE Å TA FEIL PÅ =================
 *
 * En prøve som ikke kan feile, er ingen prøve. De tre måtene rekka kan være gal på uten å
 * krasje, bygges her som ØDELAGTE byggere, og hver av dem MÅ bli tatt av nøyaktig den samme
 * sammenlikningen som godkjenner den ekte:
 *
 *   forskjøvet   første kortet mangler, alt annet rykker ett steg fram. Den formen har riktig
 *                lengdeform og riktig padding, og er nettopp det en av-for-én-feil i
 *                skrivingen ville gitt.
 *   reversert    kortene i det pågående stikket i motsatt orden. Aggregatene kan ikke skille
 *                den fra den ekte (`HVEM_LA` er den samme), så BARE en ordensprøve tar den —
 *                og det er akkurat den informasjonen sonden påstår å måle.
 *   avkortet     det pågående stikket droppet. Rekka er da «sann, men gammel»: en modell ville
 *                sett runden fire kort for tidlig hele veien.
 *
 * Blir en av dem IKKE tatt, er prøven blind, og da sier den ingenting om den ekte rekka heller.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { spillerVisning, type Kort } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { SEKV_FELT, SEKV_LENGDE, SEKV_TOM, SEKVENSFELT, sekvensTrekk } from "../src/mlb/sekvens.ts";

/** Ett kortlegg slik hendelsesstrømmen så det: absolutt sete og kort, i lagt rekkefølge. */
type Legg = { spiller: number; kort: Kort };

/**
 * Fasiten som vektor, sett fra `sete`. Bygd av hendelsesstrømmen ALENE — ikke av visningen.
 * Dette er formen `sekvensTrekk` skal treffe; er de to uenige, er det sonden som tar feil.
 */
function fasitVektor(legg: readonly Legg[], sete: number, antall: number): Int16Array {
  const v = new Int16Array(SEKV_LENGDE).fill(SEKV_TOM);
  for (let i = 0; i < legg.length; i++) {
    const o = i * SEKV_FELT;
    v[o + SEKVENSFELT.REL_SETE] = (((legg[i]!.spiller - sete) % antall) + antall) % antall;
    v[o + SEKVENSFELT.KORT] = kortIndeks(legg[i]!.kort);
    v[o + SEKVENSFELT.STIKK] = Math.floor(i / antall);
    v[o + SEKVENSFELT.POSISJON] = i % antall;
  }
  return v;
}

/** Første feltet der de to er uenige, eller null. Samme sammenlikning for ekte og felle. */
function førsteAvvik(fasit: Int16Array, prøvd: Int16Array): string | null {
  for (let i = 0; i < SEKV_LENGDE; i++) {
    if (fasit[i] !== prøvd[i]) {
      return `felt ${i} (steg ${Math.floor(i / SEKV_FELT)}, felt ${i % SEKV_FELT}): fasit ${String(fasit[i])}, rekka ${String(prøvd[i])}`;
    }
  }
  return null;
}

/** De ødelagte formene. Hver tar fasitleggene og gir den rekka en feil kode VILLE gitt. */
const ØDELAGTE: Record<string, (legg: readonly Legg[]) => Legg[]> = {
  // Av-for-én i skrivingen: første kortet faller ut, alt annet rykker fram.
  forskjøvet: (legg) => legg.slice(1),
  // Stikket i motsatt orden. Aggregatene ser ingen forskjell; en ordensprøve må se den.
  reversert: (legg) => {
    const n = legg.length;
    const helt = n - (n % 4);
    return [...legg.slice(0, helt), ...legg.slice(helt).reverse()];
  },
  // Bare ferdige stikk: rekka er sann, men fire kort for gammel.
  avkortet: (legg) => legg.slice(0, legg.length - (legg.length % 4)),
};

/**
 * Spiller en kamp og prøver rekka i HVER spillstilling, for HVERT sete — ikke bare det setet
 * som er i tur. Rekka er offentlig, så alle fire må se den samme historien opp til rotasjonen,
 * og en feil som bare rammer tre av fire seter ville ellers sluppet unna.
 */
function kjør(frø: number, maksRunder: number): {
  stillinger: number;
  avvik: string[];
  fellefunn: Record<string, number>;
  maksLengde: number;
  fulleStikk: number;
} {
  const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const avvik: string[] = [];
  const fellefunn: Record<string, number> = {};
  for (const navn of Object.keys(ØDELAGTE)) fellefunn[navn] = 0;
  /** Hendelsesstrømmens egen bok over runden. Nullstilles der motoren nullstiller `historikk`. */
  let legg: Legg[] = [];
  let stillinger = 0;
  let maksLengde = 0;
  let fulleStikk = 0;
  let vakt = 0;

  while (s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      for (let sete = 0; sete < s.antallSpillere; sete++) {
        const fasit = fasitVektor(legg, sete, s.antallSpillere);
        const { n, v } = sekvensTrekk(spillerVisning(s, sete));
        stillinger++;
        maksLengde = Math.max(maksLengde, n);
        if (n !== legg.length) {
          avvik.push(`frø ${frø} sete ${sete}: rekka har ${n} steg, hendelsesstrømmen ${legg.length}`);
          continue;
        }
        const a = førsteAvvik(fasit, v);
        if (a !== null) avvik.push(`frø ${frø} sete ${sete}: ${a}`);
        // FELLENE, på nøyaktig de samme radene og med den samme sammenlikningen.
        for (const [navn, ødelegg] of Object.entries(ØDELAGTE)) {
          const ødelagt = fasitVektor(ødelegg(legg), sete, s.antallSpillere);
          if (førsteAvvik(fasit, ødelagt) !== null) fellefunn[navn] = (fellefunn[navn] ?? 0) + 1;
        }
      }
      if (legg.length > 0 && legg.length % 4 === 0) fulleStikk = Math.max(fulleStikk, legg.length / 4);
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) break;
      s = utfør(s, { type: "NESTE" }).state;
      legg = [];
      continue;
    }
    const r = utfør(s, drivere[iTur]!.velgHandling(s));
    for (const h of r.hendelser) {
      if (h.type === "KORT_SPILT") legg.push({ spiller: h.spiller, kort: h.kort });
      // Motoren tømmer `historikk` ved ny givning og ved rundeslutt; boka her følger etter.
      if (h.type === "NY_RUNDE" || h.type === "KORT_GITT" || h.type === "RUNDE_SLUTT") legg = [];
    }
    s = r.state;
  }
  return { stillinger, avvik, fellefunn, maksLengde, fulleStikk };
}

test("rekka står steg for steg mot hendelsesstrømmen KORT_SPILT", () => {
  let stillinger = 0;
  let maksLengde = 0;
  let fulleStikk = 0;
  const avvik: string[] = [];
  const funn: Record<string, number> = {};
  for (const frø of [6_100_003, 6_100_017, 6_100_041]) {
    const r = kjør(frø, 4);
    stillinger += r.stillinger;
    maksLengde = Math.max(maksLengde, r.maksLengde);
    fulleStikk = Math.max(fulleStikk, r.fulleStikk);
    avvik.push(...r.avvik);
    for (const [k, v] of Object.entries(r.fellefunn)) funn[k] = (funn[k] ?? 0) + v;
  }

  // Prøven må ha sett nok, og den må ha sett SENT spill — en rekke kan være riktig i stikk 0
  // og gal i stikk 9, og det er sent i runden sonden påstår at ordenen betyr noe.
  assert.ok(stillinger >= 400, `bare ${stillinger} stillinger prøvd — beviser ingenting`);
  assert.ok(maksLengde >= 40, `lengste rekke var ${maksLengde} steg — runden ble aldri spilt ut`);
  assert.ok(fulleStikk >= 10, `så bare ${fulleStikk} fulle stikk — prøven nådde aldri sluttspillet`);
  assert.deepEqual(avvik.slice(0, 5), [], `rekka følger ikke rekkefølgen kortene ble lagt i (${avvik.length} avvik)`);

  // FELLENE: hver ødelagte form MÅ ha blitt tatt, ellers er sammenlikningen over blind.
  for (const navn of Object.keys(ØDELAGTE)) {
    assert.ok(
      (funn[navn] ?? 0) > 0,
      `fella «${navn}» slapp unna i alle ${stillinger} stillingene — ordensprøven ser ikke den feilen`,
    );
  }
});

/**
 * Rekka er OFFENTLIG: to seter som så de samme stikkene skal ha den samme rekka, bortsett fra
 * at setene er rotert. Er det ikke sant, er «relativt sete» ikke relativt, og sonde B målte tre
 * ulike historier i stedet for én sett fra fire stoler.
 */
test("alle fire seter ser den SAMME rekka, bare rotert", () => {
  const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 6_100_071);
  let vakt = 0;
  let prøvd = 0;
  let maksLengde = 0;
  let fellefunn = 0;
  const avvik: string[] = [];

  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 2_000) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      const n = s.antallSpillere;
      const r0 = sekvensTrekk(spillerVisning(s, 0));
      maksLengde = Math.max(maksLengde, r0.n);
      for (let sete = 1; sete < n; sete++) {
        const rs = sekvensTrekk(spillerVisning(s, sete));
        prøvd++;
        if (rs.n !== r0.n) {
          avvik.push(`sete ${sete} har ${rs.n} steg, sete 0 har ${r0.n}`);
          continue;
        }
        for (let i = 0; i < r0.n; i++) {
          const o = i * SEKV_FELT;
          // Sete 0 sin rel + sete = det absolutte setet; sett fra `sete` skal det være rel − sete.
          const ventet = (((r0.v[o + SEKVENSFELT.REL_SETE]! - sete) % n) + n) % n;
          if (rs.v[o + SEKVENSFELT.REL_SETE] !== ventet) {
            avvik.push(`steg ${i}: sete ${sete} ser rel ${String(rs.v[o + SEKVENSFELT.REL_SETE])}, ventet ${ventet}`);
            break;
          }
          if (rs.v[o + SEKVENSFELT.KORT] !== r0.v[o + SEKVENSFELT.KORT]) {
            avvik.push(`steg ${i}: setene er uenige om HVILKET kort som ble lagt`);
            break;
          }
        }
        // FELLA: en rotasjon som IKKE roterer ville bestått en prøve som bare sammenlikner kort.
        // Her kreves det at rotasjonen faktisk flytter minst ett sete, ellers er kravet tomt.
        for (let i = 0; i < r0.n; i++) {
          if (rs.v[i * SEKV_FELT + SEKVENSFELT.REL_SETE] !== r0.v[i * SEKV_FELT + SEKVENSFELT.REL_SETE]) {
            fellefunn++;
            break;
          }
        }
      }
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
  }

  assert.ok(prøvd >= 30, `bare ${prøvd} setesammenlikninger — beviser ingenting`);
  assert.ok(maksLengde >= 20, `lengste rekke var ${maksLengde} steg — prøven så aldri et sluttspill`);
  assert.deepEqual(avvik.slice(0, 5), [], `setene ser ikke den samme rekka (${avvik.length} avvik)`);
  assert.ok(fellefunn > 0, "ingen rad hadde ulike relative seter — rotasjonskravet er tomt");
});
