/**
 * K2 I ALLE FASER — fordi den første prøven bare dekket én.
 *
 * `test/k2-aldri-jukse.test.ts` viste at Adams velger likt i alle verdener som
 * er forenlige med det han har sett. Den var grønn, og den var **usann om
 * halve spillet**.
 *
 * Prøven besøker kortvalg fra stikk 7. Der er talongen for lengst tatt opp, så
 * `medVerden`-lekkasjen — budvinneren fikk de EKTE byttekortene i hver rollout,
 * i 100 % av 180 verdener — var strukturelt usynlig for den.
 *
 * **Lærdommen er generell, og den gjelder hvert eneste krav i AdamsMax:**
 *
 *     En invariansprøve dekker bare de fasene den faktisk besøker.
 *
 * «Adams jukser ikke» var sant om sluttspillet og usant om budrunden samtidig,
 * og ingen av delene var synlig i det grønne tallet.
 *
 * ================= HVA DENNE GJØR ANNERLEDES ============================
 *
 * Fire faser, hver med sin egen handling å prøve:
 *
 *     BUDRUNDE   budet må være det samme
 *     VRAK       de vrakede kortene må være de samme
 *     VELG       trumf og etterlyst kort må være de samme
 *     SPILL      kortet må være det samme, tidlig OG sent
 *
 * `SPILL` deles i tidlig (stikk 1–3) og sent (stikk 7+) med vilje: talongen er
 * tatt opp ved trick 1, men den DØDE bingen — de fire vrakede kortene — er
 * fortsatt en informasjonskilde tidlig, og de spilles aldri.
 *
 * ================= EN FASE PRØVEN IKKE KAN DEKKE ========================
 *
 * `VRAK` og `VELG` utføres bare av BUDVINNEREN, og budvinneren har SETT
 * talongen. Verdenene må derfor konstrueres fra hennes synsvinkel, der de fire
 * opptatte kortene er kjent. `trekkVerden` gjør nettopp det
 * (`observatorErBudvinner` gir `dødKapasitet = 0`), så prøven er gyldig — men
 * den er svakere der, fordi det er mindre skjult å variere.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";

/**
 * ============ SPEKKEN SOM FAKTISK KAN JUKSE ============================
 *
 * Foerste utgave proevde `ADAMS_MAALT`, og den var groenn ogsaa naar
 * talonglekkasjen ble gjeninnfoert. Grunnen er alvorlig:
 *
 * **`ADAMS_MAALT` har ikke noe soekelag.** Den er `vr` + `telrd` + `budm` +
 * `vakt` + `e1` - en ren funksjon av egen haand og det som er offentlig. Den
 * ser aldri paa skjulte kort, saa invariansen er sann PER KONSTRUKSJON.
 *
 * Proeven beviste altsaa at en bot som ikke KAN jukse, ikke jukser.
 *
 * `medVerden`, `trekkVerdener` og `søktMu` - alt som roerer skjult informasjon
 * - lever bare i soekelagene. Derfor proeves en spek MED soek i alle faser:
 * `amu:` i spillet og `sok` i budrunden.
 *
 * DETERMINISME: `e0` slaar av uleseligheten (A7 randomiserer med vilje), og
 * agenten bygges PAA NYTT per kall fordi verdenstrekningens RNG gaar framover.
 * Det er ikke en omgaaelse - uten det ville proeven maalt RNG-posisjon i
 * stedet for informasjonslekkasje.
 */
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";

const BUDSOK = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok8k6b1";
const MED_SOEK =
  `vr:e1-modell/vrakrang.bin:telrd:amu:alle:6k4m1e0:` +
  `${BUDSOK}:vakt:abmpf:e1:e1-modell/d7alle.bin`;


/** Handlingen som en sammenliknbar streng, uansett type. */
function avtrykk(h: Handling): string {
  switch (h.type) {
    case "SPILL":
      return `SPILL ${h.kort.farge}${h.kort.verdi}`;
    case "BUD":
      return `BUD ${String(h.bud)}`;
    case "VRAK":
      return `VRAK ${[...h.kort].map((k) => `${k.farge}${k.verdi}`).sort().join(",")}`;
    case "VELG":
      return `VELG ${String(h.trumf)} ${h.etterlyst ? `${h.etterlyst.farge}${h.etterlyst.verdi}` : "-"}`;
    default:
      return h.type;
  }
}

interface Funn {
  prøvd: number;
  avvik: string[];
}

/**
 * Prøv invariansen i én fase.
 *
 * `velgSete` sier hvem som handler i fasen — for VRAK og VELG er det alltid
 * budvinneren, og verdenene MÅ da trekkes fra hennes synsvinkel.
 */
function prøvFase(
  fase: GameState["fase"],
  fraStikk: number,
  tilStikk: number,
  giver: number,
): Funn {
  const ut: Funn = { prøvd: 0, avvik: [] };

  for (let g = 0; g < giver; g++) {
    const frø = 6_600_000 + g * 4271;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;

    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      const handler = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (handler === null || handler === undefined) break;

      const iFase = s.fase === fase;
      const iVindu = s.fase !== "SPILL" || (s.stikkSpilt >= fraStikk && s.stikkSpilt <= tilStikk);
      const nokValg = s.fase !== "SPILL" || lovligeKort(s, handler).length >= 2;

      if (iFase && iVindu && nokValg && iGiv < 2) {
        const verdener = trekkVerdener(s, handler, 3, lagRng(444_000 + g * 17), undefined, undefined, 4);
        if (verdener.length >= 2) {
          iGiv++;
          ut.prøvd++;
          const fasit = avtrykk(lagIndre(MED_SOEK).velgHandling(s));
          for (const hender of verdener) {
            const s2 = medVerden(s, hender, handler);
            // Egen haand skal aldri roeres - ellers proever vi noe annet.
            assert.deepEqual(s2.hender[handler], s.hender[handler], "observatoerens haand ble endret");
            const valg = avtrykk(lagIndre(MED_SOEK).velgHandling(s2));
            if (valg !== fasit) {
              ut.avvik.push(
                `${fase} froe ${frø} stikk ${s.stikkSpilt} sete ${handler}: ` +
                  `«${fasit}» i den ekte verdenen, «${valg}» i en forenlig`,
              );
            }
          }
        }
      }
      s = utfør(s, drivere[handler]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const FASER: { fase: GameState["fase"]; fra: number; til: number; navn: string }[] = [
  { fase: "BUDRUNDE", fra: 0, til: 99, navn: "budrunden" },
  { fase: "VRAK", fra: 0, til: 99, navn: "vraket" },
  { fase: "VELG", fra: 0, til: 99, navn: "trumfvalget" },
  { fase: "SPILL", fra: 0, til: 3, navn: "spill tidlig (stikk 0-3)" },
  { fase: "SPILL", fra: 7, til: 99, navn: "spill sent (stikk 7+)" },
];

for (const { fase, fra, til, navn } of FASER) {
  test(`K2 i ${navn}: valget er uavhengig av skjulte kort`, () => {
    const { prøvd, avvik } = prøvFase(fase, fra, til, 8);
    assert.ok(
      prøvd >= 3,
      `${navn}: proeven fikk bare ${prøvd} stillinger - da beviser den ingenting om denne fasen`,
    );
    assert.deepEqual(
      avvik,
      [],
      `JUKS I ${navn.toUpperCase()}: valget endret seg naar BARE de skjulte kortene ble byttet.\n` +
        `Ett avvik er nok - dette er ikke en statistisk proeve.\n\n` +
        avvik.slice(0, 6).join("\n"),
    );
  });
}

test("hver fase ble faktisk besoekt - ellers er de groenne tallene tomme", () => {
  /**
   * VAKTEN MOT EN TOM PRØVE, og den er ikke teoretisk: det var nøyaktig slik
   * den første K2-prøven kunne være grønn mens talongen lekket. En fase som
   * aldri besøkes gir null avvik, og null avvik ser ut som et bevis.
   */
  const tomme: string[] = [];
  for (const { fase, fra, til, navn } of FASER) {
    const { prøvd } = prøvFase(fase, fra, til, 4);
    if (prøvd === 0) tomme.push(`${navn} (${fase})`);
  }
  assert.deepEqual(
    tomme,
    [],
    `Disse fasene ble ALDRI besoekt av proeven, saa deres groenne tall betyr ` +
      `ingenting:\n  ${tomme.join("\n  ")}`,
  );
});

/**
 * ============ KAN PRØVEN FEILE? Én falsifisering PER FASE ==============
 *
 * Dette er den viktigste delen av fila, og den er ikke valgfri.
 *
 * Første utgave prøvde `ADAMS_MAALT` og var grønn i alle fem faser — også når
 * talonglekkasjen ble gjeninnført. Grunnen var at `ADAMS_MAALT` **ikke har noe
 * søkelag**: den er en ren funksjon av egen hånd og det offentlige, så
 * invariansen er sann per konstruksjon. Prøven beviste at en bot som ikke KAN
 * jukse, ikke jukser.
 *
 * `juks:` dekker bare kortspillet. For budrunden, vraket og trumfvalget trengs
 * en jukser som virker DER, og den finnes ikke i produksjonskoden — den lages
 * her, lokalt, med det ene formålet å bli tatt.
 *
 * En prøve som ikke kan feile er ikke en prøve, og en prøve som bare kan feile
 * i én av fem faser beviser bare den ene.
 */

/** En kappe som lar valget avhenge av SKJULTE kort. Skal bli tatt. */
function lagJukser(indre: ReturnType<typeof lagIndre>): ReturnType<typeof lagIndre> {
  /**
   * MAA LESE FORDELINGEN, IKKE MENGDEN.
   *
   * Foerste utgave summerte ALLE de skjulte kortene. Den summen er
   * INVARIANT under omfordeling - og ved VRAK/VELG er observatoeren
   * budvinneren, saa `trekkVerden` gir `doedKapasitet = 0` og legger hvert
   * eneste usette kort ut paa de tre andre hendene. Summen ble dermed identisk
   * i hver verden, jukseren vippet aldri, og de to fasene saa udekket ut.
   *
   * Laerdommen er generell for hele K2: **en proeve som varierer FORDELINGEN
   * kan bare fange lekkasjer som avhenger av fordelingen.** Leser noen en
   * egenskap ved MENGDEN av skjulte kort, ser den ikke det - og det er
   * noeyaktig derfor talonglekkasjen trenger sin egen test.
   *
   * Her leses derfor ÉN bestemt motstanders haand.
   */
  const skjultSum = (s: GameState, meg: number): number => {
    const naboen = (meg + 1) % s.antallSpillere;
    let n = 0;
    for (const k of s.hender[naboen] ?? []) n += k.verdi;
    return n;
  };
  return {
    nyKamp: () => indre.nyKamp(),
    velgHandling: (s: GameState): Handling => {
      const h = indre.velgHandling(s);
      const meg = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (meg === null || meg === undefined) return h;
      // Bruk skjult informasjon til aa vippe valget. Ingen finesse - poenget er
      // at den SKAL avvike naar de skjulte kortene byttes.
      const vipp = skjultSum(s, meg) % 2 === 0;
      if (!vipp) return h;
      if (h.type === "SPILL") {
        const lov = lovligeKort(s, meg);
        const annet = lov.find((k) => k.farge !== h.kort.farge || k.verdi !== h.kort.verdi);
        return annet === undefined ? h : { type: "SPILL", spiller: meg, kort: annet };
      }
      if (h.type === "BUD") {
        return { type: "BUD", spiller: meg, bud: h.bud === "PASS" ? 8 : "PASS" };
      }
      if (h.type === "VRAK") {
        // MAA ENDRE MENGDEN, ikke rekkefoelgen: `avtrykk` SORTERER kortene, saa
        // en reversering ga identisk avtrykk og jukseren slapp unna. Det var en
        // feil i falsifiseringen, ikke i proeven - og uten denne testen ville
        // jeg trodd at VRAK-fasen var dekket.
        const haand = s.hender[meg] ?? [];
        const iMengden = (k: { farge: string; verdi: number }): boolean =>
          h.kort.some((x) => x.farge === k.farge && x.verdi === k.verdi);
        const bytt = haand.find((k) => !iMengden(k));
        if (bytt === undefined || h.kort.length === 0) return h;
        return { ...h, kort: [bytt, ...h.kort.slice(1)] };
      }
      if (h.type === "VELG") {
        // Og VELG hadde ingen vipp i det hele tatt - den falt rett gjennom.
        const andre = (["S", "H", "R", "K"] as const).find((f) => f !== h.trumf);
        return andre === undefined ? h : { ...h, trumf: andre };
      }
      return h;
    },
  };
}

for (const { fase, fra, til, navn } of FASER) {
  test(`K2-proeven KAN FEILE i ${navn} - en jukser blir tatt`, () => {
    let prøvd = 0;
    let avvik = 0;
    for (let g = 0; g < 6 && avvik === 0; g++) {
      const frø = 6_600_000 + g * 4271;
      const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
      let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
      let vakt = 0;
      let iGiv = 0;
      while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
        const handler = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        if (handler === null || handler === undefined) break;
        const iVindu = s.fase !== "SPILL" || (s.stikkSpilt >= fra && s.stikkSpilt <= til);
        const nokValg = s.fase !== "SPILL" || lovligeKort(s, handler).length >= 2;
        if (s.fase === fase && iVindu && nokValg && iGiv < 3) {
          const verdener = trekkVerdener(s, handler, 4, lagRng(555_000 + g), undefined, undefined, 4);
          if (verdener.length >= 2) {
            iGiv++;
            prøvd++;
            const j = lagJukser(lagIndre(ADAMS_MAALT));
            const fasit = avtrykk(j.velgHandling(s));
            for (const hender of verdener) {
              if (avtrykk(j.velgHandling(medVerden(s, hender, handler))) !== fasit) avvik++;
            }
          }
        }
        s = utfør(s, drivere[handler]!.velgHandling(s)).state;
      }
    }
    assert.ok(prøvd >= 2, `${navn}: falsifiseringen fikk bare ${prøvd} stillinger`);
    assert.ok(
      avvik > 0,
      `${navn}: en agent som LESER de skjulte kortene ble IKKE tatt av proeven ` +
        `(${prøvd} stillinger). Da maaler proeven ikke informasjonslekkasje i ` +
        `denne fasen, og det groenne tallet over beviser ingenting.`,
    );
  });
}
