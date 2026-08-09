/**
 * MLB-TREKKBYGGEREN — layouten, gjenbruket, og at masken er sann.
 *
 * K2-prøven ligger i `test/mlb-k2-trekk.test.ts`. Denne fila prøver det andre:
 *
 *   1. LAYOUTEN     lengdekonstant = navnearray = det byggeren faktisk skriver.
 *                   En vektor der navnene har glidd én plass ut av takt med
 *                   tallene er den verste feilen i denne fila: alt kjører, alt
 *                   er grønt, og hver eneste analyse etterpå er feil.
 *
 *   2. GJENBRUKET   `docs/mlb.md` fase 0.1 krever at de 273 GJENBRUKES, ikke
 *                   skrives om. De tar `GameState`; innpakningen tar
 *                   `SpillerVisning`. Prøven krever BIT-IDENTITET mot den ekte
 *                   staten — ellers er «gjenbruk» bare en påstand.
 *
 *   3. VAKTEN       `konvensjonsvakt.ts` PÅSTÅR i prosa at den «ser bare det
 *                   setet selv kan se». Her måles det: vakten kjørt på den
 *                   redigerte staten (der de andre hendene er TOMME) må velge
 *                   nøyaktig samme kort som på den ekte. Leste den skjult
 *                   informasjon, ville de to sprikt.
 *
 *   4. MASKEN       et kort som er 1 i masken må være lovlig, og et lovlig kort
 *                   må være 1. Nettet skal aldri kunne velge ulovlig, og en
 *                   maske som er for VID er nøyaktig så farlig som en som er
 *                   for smal.
 *
 *   5. LIVET        ingen blokk skal stå konstant null over et representativt
 *                   utvalg stillinger. Sanseblokken var bygd, permutasjonstestet
 *                   og registrert fem steder — og leverte nuller gjennom hver
 *                   sti som fantes (§ revisjonen 5. august). En blokk som aldri
 *                   fylles er en død modul med grønn hake.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { likeKort, type Kort } from "../src/kort.ts";
import { lovligeKort, opprettSpill, spillerVisning, utfør, type GameState } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { vaktKort } from "../src/moe2/konvensjonsvakt.ts";
import { E1_SPILL_DIM, e1SpillTrekk } from "../src/e1/trekk.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import {
  HANDLING_LENGDE,
  HANDLING_NAVN,
  maske,
  nesteDelsteg,
  TOMT_DELVALG,
} from "../src/mlb/handling.ts";
import {
  BLOKK,
  byggTrekk,
  HUKOMMELSE_LENGDE,
  HUKOMMELSE_NAVN,
  KONVENSJON_LENGDE,
  KONVENSJON_NAVN,
  KONVENSJONSREGLER,
  LOVLIG_LENGDE,
  LOVLIG_NAVN,
  MAKRO_LENGDE,
  MAKRO_NAVN,
  MESO_LENGDE,
  MESO_NAVN,
  MIKRO_LENGDE,
  MIKRO_NAVN,
  mikroTrekk,
  TREKK_LENGDE,
  TREKK_NAVN,
  TRO_LENGDE,
  TRO_NAVN,
  visningTilState,
  type Trekkontekst,
} from "../src/mlb/trekk.ts";

// ===========================================================================
// Riggen
// ===========================================================================

type Beslutning = "BUD" | "VRAK" | "VELG" | "SPILL";

const fasenavn = (s: GameState): Beslutning =>
  s.fase === "BUDRUNDE" ? "BUD" : s.fase === "VRAK" ? "VRAK" : s.fase === "VELG" ? "VELG" : "SPILL";

function kontekstFor(s: GameState): Trekkontekst {
  return { regler: s.regler, giving: s.giving };
}

/** Setet som faktisk skal handle nå. */
function iTur(s: GameState): number | null {
  if (s.fase === "VRAK" || s.fase === "VELG") return s.budvinner;
  return s.iTur;
}

/**
 * Gå gjennom `giver` hele kamper og kall `se` på HVER beslutning, i alle fire
 * faser. Prøvene under må se BUD, VRAK og VELG også — talonglekkasjen bet
 * nettopp i vrakfasen, og prøven som fantes den gangen besøkte den aldri.
 */
function gåGjennom(
  giver: number,
  se: (s: GameState, sete: number, beslutning: Beslutning) => void,
  frøbasis = 7_100_000,
  målPoeng = 30,
): number {
  let besøk = 0;
  for (let g = 0; g < giver; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng }, frøbasis + g * 3319);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 4000) {
      const sete = iTur(s);
      if (sete === null) {
        if (s.fase === "RUNDE_SLUTT") {
          s = utfør(s, { type: "NESTE" }).state;
          continue;
        }
        break;
      }
      se(s, sete, fasenavn(s));
      besøk++;
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
  return besøk;
}

// ===========================================================================
// 1. LAYOUTEN
// ===========================================================================

test("MLB-trekk: hver blokk har like mange navn som lengdekonstanten sier", () => {
  assert.equal(MIKRO_NAVN.length, MIKRO_LENGDE);
  assert.equal(TRO_NAVN.length, TRO_LENGDE);
  assert.equal(HUKOMMELSE_NAVN.length, HUKOMMELSE_LENGDE);
  assert.equal(MESO_NAVN.length, MESO_LENGDE);
  assert.equal(MAKRO_NAVN.length, MAKRO_LENGDE);
  assert.equal(KONVENSJON_NAVN.length, KONVENSJON_LENGDE);
  assert.equal(LOVLIG_NAVN.length, LOVLIG_LENGDE);

  assert.equal(
    TREKK_LENGDE,
    MIKRO_LENGDE +
      TRO_LENGDE +
      HUKOMMELSE_LENGDE +
      MESO_LENGDE +
      MAKRO_LENGDE +
      KONVENSJON_LENGDE +
      LOVLIG_LENGDE,
  );
  assert.equal(TREKK_NAVN.length, TREKK_LENGDE);

  // Blokkgrensene skal peke på første navn i sin egen blokk.
  assert.ok(TREKK_NAVN[BLOKK.MIKRO]!.startsWith("mikro."));
  assert.ok(TREKK_NAVN[BLOKK.TRO]!.startsWith("tro."));
  assert.ok(TREKK_NAVN[BLOKK.HUKOMMELSE]!.startsWith("hukommelse."));
  assert.ok(TREKK_NAVN[BLOKK.MESO]!.startsWith("meso."));
  assert.ok(TREKK_NAVN[BLOKK.MAKRO]!.startsWith("makro."));
  assert.ok(TREKK_NAVN[BLOKK.KONVENSJON]!.startsWith("konv."));
  assert.ok(TREKK_NAVN[BLOKK.LOVLIG]!.startsWith("lovlig."));

  // Et duplikat betyr at to ulike tall bærer samme etikett, og da er enhver
  // forklaring av vektoren tvetydig.
  assert.equal(new Set(TREKK_NAVN).size, TREKK_LENGDE, "to trekk deler navn");
});

test("MLB-trekk: byggeren gir alltid nøyaktig TREKK_LENGDE endelige tall", () => {
  let n = 0;
  const besøk = gåGjennom(3, (s, sete, beslutning) => {
    const v = byggTrekk(spillerVisning(s, sete), kontekstFor(s));
    assert.equal(v.length, TREKK_LENGDE);
    for (let i = 0; i < v.length; i++) {
      if (!Number.isFinite(v[i]!)) {
        assert.fail(`trekk ${i} (${TREKK_NAVN[i]}) er ${String(v[i])} — ikke et endelig tall`);
      }
    }
    n++;
  });
  assert.ok(besøk > 200, `bare ${besøk} beslutninger prøvd`);
  assert.equal(n, besøk);
});

// ===========================================================================
// 2. GJENBRUKET — de 273, bit-identisk
// ===========================================================================

test("MLB-trekk: den visningsbaserte innpakningen gir BIT-IDENTISKE 273 trekk", () => {
  const avvik: string[] = [];
  let faser = new Set<string>();
  const besøk = gåGjennom(4, (s, sete, beslutning) => {
    faser.add(beslutning);
    const fasit = e1SpillTrekk(s, sete, E1_SPILL_DIM);
    const vår = mikroTrekk(spillerVisning(s, sete), kontekstFor(s));
    assert.equal(vår.length, MIKRO_LENGDE);
    for (let i = 0; i < MIKRO_LENGDE; i++) {
      if (!Object.is(fasit[i], vår[i])) {
        avvik.push(
          `${beslutning} sete ${sete} stikk ${s.stikkSpilt}: trekk ${i} (${MIKRO_NAVN[i]}) er ` +
            `${String(fasit[i])} fra state og ${String(vår[i])} fra visningen`,
        );
      }
    }
  });
  assert.ok(besøk > 250, `bare ${besøk} beslutninger prøvd`);
  assert.deepEqual(
    [...faser].sort(),
    ["BUD", "SPILL", "VELG", "VRAK"],
    "prøven besøkte ikke alle fire faser — vrakfasen er nettopp der talonglekkasjen bet",
  );
  assert.equal(
    avvik.length,
    0,
    `innpakningen er IKKE de samme 273 trekkene (${avvik.length} avvik):\n` +
      avvik.slice(0, 10).join("\n"),
  );
});

test("MLB-trekk: identitetsprøven kan FEILE — en innpakning som mister makkeren blir tatt", () => {
  /**
   * KONTROLLEN. `spillerVisning` skjuler makkeren til kortet er avslørt, og en
   * naiv innpakning ville derfor mistet «jeg ER den hemmelige makkeren» —
   * trekk 216. Rekonstruksjonen i `visningTilState` henter den tilbake av egen
   * hånd. Her fjernes nettopp den rekonstruksjonen, og prøven må ta det.
   *
   * Uten denne testen vet vi ikke om den grønne over betyr «identisk» eller
   * «prøven besøker aldri en stilling der de kan avvike».
   */
  let tatt = 0;
  let stillinger = 0;
  gåGjennom(6, (s, sete, beslutning) => {
    if (s.fase !== "SPILL" || s.makker !== sete || s.makkerAvslørt) return;
    stillinger++;
    const visning = spillerVisning(s, sete);
    const naiv = visningTilState(
      // Fjern det etterlyste kortet fra hånden vi rekonstruerer makkeren av —
      // nøyaktig den ene tingen som gjør at «jeg er makker» går tapt.
      { ...visning, dinHånd: visning.dinHånd.filter((k) => !likeKort(k, visning.etterlyst!)) },
      s.regler,
      s.giving,
    );
    const fasit = e1SpillTrekk(s, sete, E1_SPILL_DIM);
    const skadet = e1SpillTrekk(naiv, sete, E1_SPILL_DIM);
    for (let i = 0; i < MIKRO_LENGDE; i++) {
      if (!Object.is(fasit[i], skadet[i])) {
        tatt++;
        break;
      }
    }
    void beslutning;
  });
  assert.ok(stillinger >= 5, `bare ${stillinger} makkerstillinger — kontrollen fikk ikke noe å ta`);
  assert.ok(
    tatt > 0,
    `en innpakning som mister den hemmelige makkeren ble IKKE tatt av identitetsprøven. ` +
      `Da måler prøven ikke gjenbruk, og den grønne testen over beviser ingenting.`,
  );
});

// ===========================================================================
// 3. VAKTEN — prosaens «informasjonsdisiplin», målt
// ===========================================================================

test("MLB-trekk: vaktKort velger identisk på den redigerte staten (der de andre hendene er TOMME)", () => {
  const avvik: string[] = [];
  let prøvd = 0;
  gåGjennom(4, (s, sete, beslutning) => {
    if (s.fase !== "SPILL") return;
    const lovlige = lovligeKort(s, sete);
    if (lovlige.length < 2) return;
    const red = visningTilState(spillerVisning(s, sete), s.regler, s.giving);
    for (const regel of KONVENSJONSREGLER) {
      for (const kandidat of lovlige) {
        const ekte = vaktKort(s, sete, kandidat, regel.valg);
        const vår = vaktKort(red, sete, kandidat, regel.valg);
        prøvd++;
        if (!likeKort(ekte, vår)) {
          avvik.push(
            `${regel.navn} stikk ${s.stikkSpilt} sete ${sete}: ekte state gir ` +
              `${ekte.farge}${ekte.verdi}, redigert gir ${vår.farge}${vår.verdi}`,
          );
        }
      }
    }
    void beslutning;
  });
  assert.ok(prøvd > 5000, `bare ${prøvd} vaktoppslag prøvd`);
  assert.deepEqual(
    avvik.slice(0, 10),
    [],
    `KONVENSJONSVAKTEN LESER SKJULT INFORMASJON. ${avvik.length} av ${prøvd} oppslag ` +
      `sprikte mellom den ekte staten og en der bare setets egen hånd er fylt.\n` +
      avvik.slice(0, 10).join("\n"),
  );
});

// ===========================================================================
// 4. MASKEN
// ===========================================================================

test("MLB-trekk: LOVLIG-blokken ER handlingsrommets maske, plass for plass", () => {
  /**
   * ÉN LOVLIGHETSREGEL, IKKE TO. Blokken skal være `handling.maske` uendret —
   * ikke «enig med den». Prøven sammenlikner bit for bit, slik at en fremtidig
   * endring i handlingsrommet enten følger med hit eller blir rød.
   *
   * At masken stemmer med MOTOREN prøves i `test/mlb-handling.test.ts`, som
   * eier den regelen. Her prøves KOBLINGEN, pluss en uavhengig kryssjekk mot
   * `lovligeKort` i spillefasen — den er gratis, og «nettet skal aldri kunne
   * velge ulovlig» er for viktig til å hvile på én fil.
   */
  const feil: string[] = [];
  const sett = { SPILL: 0, VRAK: 0, VELG: 0, BUD: 0 };
  gåGjennom(4, (s, sete, beslutning) => {
    const visning = spillerVisning(s, sete);
    const v = byggTrekk(visning, kontekstFor(s));
    const b = BLOKK.LOVLIG;
    sett[beslutning]++;

    const m = maske(visning, s.giving, TOMT_DELVALG);
    for (let i = 0; i < HANDLING_LENGDE; i++) {
      if (v[b + i] !== m[i]) {
        feil.push(`${beslutning}: lovlig.${HANDLING_NAVN[i]} er ${v[b + i]}, masken sier ${m[i]}`);
      }
    }

    // Kryssjekk mot motoren i spillefasen: et merket kort MÅ være lovlig, og
    // et lovlig kort MÅ være merket. En for VID maske er den farlige retningen.
    if (s.fase === "SPILL") {
      const lov = new Set(lovligeKort(s, sete).map(kortIndeks));
      for (let i = 0; i < 52; i++) {
        if ((v[b + i] === 1) !== lov.has(i)) {
          feil.push(`SPILL: kortplass ${i} er ${v[b + i]}, motoren sier ${lov.has(i) ? 1 : 0}`);
        }
      }
    }

    // Delsteget må være satt nøyaktig når det finnes ett.
    const steg = nesteDelsteg(visning, TOMT_DELVALG);
    let antallSteg = 0;
    for (let i = 0; i < 5; i++) if (v[b + HANDLING_LENGDE + i] === 1) antallSteg++;
    if (antallSteg !== (steg === null ? 0 : 1)) {
      feil.push(`${beslutning}: ${antallSteg} delsteg satt, forventet ${steg === null ? 0 : 1}`);
    }
  });
  assert.ok(sett.SPILL > 100 && sett.VRAK > 3 && sett.VELG > 3 && sett.BUD > 20, JSON.stringify(sett));
  assert.deepEqual(feil.slice(0, 10), [], `${feil.length} maskefeil:\n${feil.slice(0, 10).join("\n")}`);
});

test("MLB-trekk: masken FØLGER delvalget — halvferdig vrak og valgt trumf flytter den", () => {
  /**
   * VRAK og VELG er sekvensielle: vraket bygges ett kort om gangen, og trumfen
   * velges før etterlysningen. Sto masken stille gjennom delstegene, kunne
   * nettet vraket samme kort to ganger og etterlyst i feil farge.
   *
   * Dette er også prøven på at `delvalg` i det hele tatt NÅR FRAM gjennom
   * konteksten. Samme feilklasse som sanseblokken: riktig bygd, aldri koblet.
   */
  let vrakPrøvd = 0;
  let velgPrøvd = 0;
  gåGjennom(6, (s, sete) => {
    const visning = spillerVisning(s, sete);
    const b = BLOKK.LOVLIG;

    if (s.fase === "VRAK" && visning.dinHånd.length > 1) {
      const først = visning.dinHånd[0]!;
      const før = byggTrekk(visning, kontekstFor(s));
      const etter = byggTrekk(visning, { ...kontekstFor(s), delvalg: { vrak: [først], trumf: null } });
      const i = b + kortIndeks(først);
      assert.equal(før[i], 1, "kortet var ikke vrakbart før det ble valgt");
      assert.equal(etter[i], 0, "et kort som ALT ligger i vraket er fortsatt merket lovlig");
      vrakPrøvd++;
    }

    if (s.fase === "VELG") {
      const trumfSteg = byggTrekk(visning, kontekstFor(s));
      const etterlysSteg = byggTrekk(visning, {
        ...kontekstFor(s),
        delvalg: { vrak: [], trumf: "S" },
      });
      // Før trumfen er valgt: trumfplassene er åpne og ingen kort er det.
      let kortÅpne = 0;
      for (let i = 0; i < 52; i++) if (trumfSteg[b + i] === 1) kortÅpne++;
      assert.equal(kortÅpne, 0, "VELG_TRUMF åpner kortplasser — da er delsteget feil");
      // Etter: bare spar-kort kan etterlyses, og aldri et kort setet har.
      const mine = new Set(visning.dinHånd.map(kortIndeks));
      for (let i = 0; i < 52; i++) {
        if (etterlysSteg[b + i] !== 1) continue;
        assert.ok(i < 13, `etterlysningen tillater et kort utenfor valgt trumf (plass ${i})`);
        assert.ok(!mine.has(i), "etterlysningen tillater et kort setet selv har");
      }
      velgPrøvd++;
    }
  });
  assert.ok(vrakPrøvd > 3, `bare ${vrakPrøvd} vrakstillinger prøvd`);
  assert.ok(velgPrøvd > 3, `bare ${velgPrøvd} velgstillinger prøvd`);
});

test("MLB-trekk: maskeprøven kan FEILE — en maske som slipper gjennom ett ulovlig kort blir tatt", () => {
  /**
   * En maske som er for VID er den farlige retningen: nettet får lov å velge et
   * kort motoren avviser, og feilen dukker opp som en krasj midt i en epoke.
   * Her konstrueres nøyaktig det, og regelen prøven bruker må si fra.
   */
  let tatt = false;
  let stillinger = 0;
  gåGjennom(2, (s, sete) => {
    if (s.fase !== "SPILL") return;
    const lov = new Set(lovligeKort(s, sete).map(kortIndeks));
    if (lov.size >= 52) return;
    stillinger++;
    const v = byggTrekk(spillerVisning(s, sete), kontekstFor(s));
    // Lekk ETT ulovlig kort inn i masken.
    let ulovlig = -1;
    for (let i = 0; i < 52; i++) if (!lov.has(i)) { ulovlig = i; break; }
    v[BLOKK.LOVLIG + ulovlig] = 1;
    for (let i = 0; i < 52; i++) {
      if ((v[BLOKK.LOVLIG + i] === 1) !== lov.has(i)) tatt = true;
    }
  });
  assert.ok(stillinger > 20, `bare ${stillinger} stillinger`);
  assert.ok(tatt, "regelen maskeprøven bruker fanger ikke engang et innlekket ulovlig kort");
});

// ===========================================================================
// 5. LIVET — ingen blokk skal være konstant null
// ===========================================================================

test("MLB-trekk: ingen blokk står konstant null over et representativt utvalg", () => {
  const grenser: readonly [string, number, number][] = [
    ["MIKRO", BLOKK.MIKRO, MIKRO_LENGDE],
    ["TRO", BLOKK.TRO, TRO_LENGDE],
    ["HUKOMMELSE", BLOKK.HUKOMMELSE, HUKOMMELSE_LENGDE],
    ["MESO", BLOKK.MESO, MESO_LENGDE],
    ["MAKRO", BLOKK.MAKRO, MAKRO_LENGDE],
    ["KONVENSJON", BLOKK.KONVENSJON, KONVENSJON_LENGDE],
    ["LOVLIG", BLOKK.LOVLIG, LOVLIG_LENGDE],
  ];
  const levende = new Map<string, number>(grenser.map(([navn]) => [navn, 0]));

  // Hukommelsen må være PÅ, ellers er blokken død av konstruksjon og prøven
  // ville bare målt at vi glemte å koble den til.
  const huk = new Hukommelse();
  let besøk = 0;
  for (let g = 0; g < 2; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 30 }, 7_900_000 + g * 1237);
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 4000) {
      huk.observer(s);
      const sete = iTur(s);
      if (sete === null) {
        if (s.fase === "RUNDE_SLUTT") {
          s = utfør(s, { type: "NESTE" }).state;
          continue;
        }
        break;
      }
      const v = byggTrekk(spillerVisning(s, sete), {
        ...kontekstFor(s),
        hukommelse: huk.vektor(sete, 4),
      });
      besøk++;
      for (const [navn, fra, lengde] of grenser) {
        let ikkeNull = 0;
        for (let i = 0; i < lengde; i++) if (v[fra + i] !== 0) ikkeNull++;
        levende.set(navn, Math.max(levende.get(navn) ?? 0, ikkeNull));
      }
      s = utfør(s, drivere[sete]!.velgHandling(s)).state;
    }
  }
  assert.ok(besøk > 100, `bare ${besøk} beslutninger`);
  for (const [navn, , lengde] of grenser) {
    const n = levende.get(navn) ?? 0;
    assert.ok(
      n > 0,
      `blokken ${navn} (${lengde} trekk) var null i HVER av ${besøk} stillinger — ` +
        `den er bygd og registrert, men aldri fylt. Samme feilklasse som sanseblokken.`,
    );
  }
  // TRO-blokken uten trohode: bare usett-masken skal fyre, aldri fordelingen.
  // Det er den ærlige verdien, og flagget sier fra at troen ikke er koblet på.
  assert.ok((levende.get("TRO") ?? 0) >= 10, "usett-masken i TRO-blokken fylles ikke");
});

test("MLB-trekk: trohodet fyller TRO-blokken og setter tilgjengelig-flagget", () => {
  /**
   * Et FALSKT trohode med en kjent fordeling. Poenget er ikke om troen er god —
   * det er at koblingen finnes. Sanseblokken var riktig bygd og leverte nuller
   * fordi ingen kaller sendte inn troen; her prøves nettopp den stien.
   */
  const falskt = {
    fordeling(): number[][] {
      return Array.from({ length: 52 }, () => [0.4, 0.3, 0.2, 0.1]);
    },
  };
  let prøvd = 0;
  gåGjennom(1, (s, sete, beslutning) => {
    if (s.fase !== "SPILL" || prøvd > 40) return;
    const visning = spillerVisning(s, sete);
    const utenTro = byggTrekk(visning, kontekstFor(s));
    const medTro = byggTrekk(visning, { ...kontekstFor(s), tronett: falskt });
    prøvd++;

    assert.equal(utenTro[BLOKK.TRO + TRO_LENGDE - 1], 0, "tilgjengelig-flagget lyver uten trohode");
    assert.equal(medTro[BLOKK.TRO + TRO_LENGDE - 1], 1, "tilgjengelig-flagget settes ikke med trohode");

    // Fordelingen skal stå på de USETTE kortene og på ingen andre.
    for (let k = 0; k < 52; k++) {
      const usett = medTro[BLOKK.TRO + k] === 1;
      const p0 = medTro[BLOKK.TRO + 52 + k * 4]!;
      if (usett) assert.ok(Math.abs(p0 - 0.4) < 1e-6, `usett kort ${k} mangler fordeling`);
      else assert.equal(p0, 0, `sett kort ${k} har fått en fordeling — det er ikke en gjetning`);
    }
    // Utenfor TRO-blokken skal ingenting ha endret seg.
    for (let i = 0; i < TREKK_LENGDE; i++) {
      if (i >= BLOKK.TRO && i < BLOKK.TRO + TRO_LENGDE) continue;
      assert.ok(
        Object.is(utenTro[i], medTro[i]),
        `trohodet endret trekk ${i} (${TREKK_NAVN[i]}) UTENFOR sin egen blokk`,
      );
    }
  });
  assert.ok(prøvd > 20, `bare ${prøvd} stillinger prøvd`);
});

// ===========================================================================
// 6. KONVENSJONSBLOKKEN sier hva den påstår
// ===========================================================================

test("MLB-trekk: konvensjonsblokken fyrer nøyaktig når en regel ville overstyrt", () => {
  let fyringer = 0;
  let uenigheter = 0;
  const feil: string[] = [];
  gåGjennom(4, (s, sete, beslutning) => {
    if (s.fase !== "SPILL") return;
    const lovlige = lovligeKort(s, sete);
    if (lovlige.length < 2) return;
    const v = byggTrekk(spillerVisning(s, sete), kontekstFor(s));
    const b = BLOKK.KONVENSJON;

    const ønsket = new Set<number>();
    for (let r = 0; r < KONVENSJONSREGLER.length; r++) {
      const regel = KONVENSJONSREGLER[r]!;
      let fasit = false;
      for (const kandidat of lovlige) {
        const valgt = vaktKort(s, sete, kandidat, regel.valg);
        if (!likeKort(valgt, kandidat)) {
          fasit = true;
          ønsket.add(kortIndeks(valgt));
        }
      }
      if ((v[b + r] === 1) !== fasit) {
        feil.push(`konv.fyrer.${regel.navn} er ${v[b + r]}, fasit er ${fasit ? 1 : 0}`);
      }
      if (fasit) fyringer++;
    }
    // Et kort som ingen regel peker på skal være 0; kortene i unionen > 0.
    for (let i = 0; i < 52; i++) {
      const tellet = v[b + KONVENSJONSREGLER.length + i]! > 0;
      if (tellet !== ønsket.has(i)) feil.push(`konv.ønsket.${i} stemmer ikke med unionen`);
    }
    if (ønsket.size > 1) uenigheter++;
  });
  assert.ok(fyringer > 100, `konvensjonene fyrte bare ${fyringer} ganger — blokken måler ingenting`);
  assert.ok(
    uenigheter > 0,
    "konvensjonene var ALDRI uenige — da bærer konv.enighet ingen informasjon",
  );
  assert.deepEqual(feil.slice(0, 10), [], `${feil.length} feil:\n${feil.slice(0, 10).join("\n")}`);
});

// ===========================================================================
// 7. LØPSLENGDEN ER ET TREKK
// ===========================================================================

test("MLB-trekk: målPoeng er et TREKK — 30 og 100 gir ulik vektor", () => {
  /**
   * `docs/mlb.md` §8: vi trener på løp til 30 og dømmer på 100. Er løpslengden
   * ikke en inngang, kan nettet ikke lære at presset er RELATIVT — og da måler
   * dommen noe annet enn treningen lærte. Prøven er billig og fanger nøyaktig
   * det: to ellers identiske stillinger med ulikt mål må gi ulike trekk.
   */
  let prøvd = 0;
  let ulike = 0;
  gåGjennom(2, (s, sete, beslutning) => {
    if (prøvd > 60) return;
    const visning = spillerVisning(s, sete);
    const kort = byggTrekk(visning, { regler: { ...s.regler, målPoeng: 30 }, giving: s.giving });
    const langt = byggTrekk(visning, { regler: { ...s.regler, målPoeng: 100 }, giving: s.giving });
    void beslutning;
    prøvd++;
    for (let i = 0; i < TREKK_LENGDE; i++) {
      if (!Object.is(kort[i], langt[i])) {
        ulike++;
        return;
      }
    }
  });
  assert.ok(prøvd > 30, `bare ${prøvd} stillinger`);
  assert.equal(
    ulike,
    prøvd,
    `løpslengden var usynlig i ${prøvd - ulike} av ${prøvd} stillinger — da kan ` +
      `«presset er relativt» ikke læres`,
  );
});

test("MLB-trekk: MAKRO bærer racepresset, og det er ikke konstant", () => {
  const verdier = new Set<number>();
  const i = MAKRO_NAVN.indexOf("makro.racepress");
  assert.ok(i >= 0, "makro.racepress finnes ikke i layouten");
  gåGjennom(3, (s, sete, beslutning) => {
    const v = byggTrekk(spillerVisning(s, sete), kontekstFor(s));
    verdier.add(v[BLOKK.MAKRO + i]!);
  });
  assert.ok(
    verdier.size > 1,
    `racepress tok bare verdien ${[...verdier].join(",")} — kampstillingen når ikke fram`,
  );
});
