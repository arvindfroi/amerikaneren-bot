/**
 * K2 — ALDRI JUKSE. Den eneste prøven i prosjektet som kan avgjøres HELT.
 *
 * Arvind: «aldri jukse.»
 *
 * Alle andre krav er statistiske: snitt, standardfeil, frøbånd, tegntest. Dette
 * er ikke. Enten er Adams' valg uavhengig av skjult informasjon, eller så er
 * det ikke.
 *
 * ================= PRØVEN ===============================================
 *
 * Konstruér to spilltilstander som er IDENTISKE i alt Adams lovlig kan se —
 * egen hånd, bordet, historikken, budrunden, hvem som er makker — men ULIKE i
 * de skjulte kortene. Adams må velge nøyaktig samme kort i begge.
 *
 * **Ett eneste avvik er juks.** Ingen tolkning, ingen margin.
 *
 * De alternative verdenene lages av `trekkVerdener`, som per konstruksjon bare
 * gir fordelinger forenlige med det observatøren har sett — renonser er harde
 * forbud der. `medVerden` bytter så de andres hender uten å røre våre egne.
 *
 * ================= HVORFOR DEN MÅTTE FINNES =============================
 *
 * Risikoen er ikke teoretisk. `medVerden`, `spillerVisning` og
 * verdenstrekningen håndterer skjulte kort ved HVER beslutning. En lekkasje der
 * ville ikke krasjet og ingen måling ville feilet — den ville bare gjort Adams
 * uforklarlig god, og hvert tall i `AdamsMax.md` verdiløst.
 *
 * Vi har `juksagent.ts`, men den er et MÅLEVERKTØY: en jukser brukt som tak for
 * å se hva klarsyn er verdt. Det er det motsatte av en garanti.
 *
 * ================= HVORFOR AGENTEN BYGGES PÅ NYTT HVER GANG =============
 *
 * Adams har en RNG som går framover for hvert kall (verdenstrekning,
 * uleselighet). To kall på samme agent er derfor ikke sammenlignbare uansett
 * hvor ærlig den er. En fersk agent per kall er ikke en omgåelse av prøven —
 * uten den ville prøven målt RNG-tilstand i stedet for informasjonslekkasje.
 *
 * Uleseligheten (`e`) står også av: den randomiserer med vilje blant likeverdige
 * kort, og et frø utledet av stillingen ville gjort støyen deterministisk men
 * ikke lik på tvers av verdener.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lovligeKort } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";

const kortNavn = (h: Handling): string =>
  h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type;

/**
 * Kjør prøven for én spek over flere giv.
 *
 * Returnerer antall stillinger prøvd og antall avvik, slik at kalleren kan
 * kreve BÅDE at det ikke er avvik OG at prøven faktisk fikk noe å prøve — en
 * grønn test på null stillinger beviser ingenting.
 */
function prøv(spek: string, giver: number, verdenerPerStilling: number, maksPerGiv = 3, fraStikk = 7): {
  stillinger: number;
  avvik: string[];
} {
  const avvik: string[] = [];
  let stillinger = 0;

  for (let g = 0; g < giver; g++) {
    const frø = 3_300_000 + g * 5171;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    /**
     * ÉN agent, ikke én per kall.
     *
     * Foerste utgave bygde en fersk agent for HVER stilling i HVER verden, og
     * V8 doede av tom haug etter ~380 s. Begrunnelsen var at RNG-en gaar
     * framover mellom kall - men den gjelder bare SOEKENDE speker.
     * `ADAMS_MAALT` er `vr` + `budm` + `vakt` + `e1`, og alle fire er rene
     * argmax uten tilfeldighet. Det samme er `juks:` over den.
     *
     * Determinismen er dessuten noe proeven SELV kontrollerer: kaller vi to
     * ganger paa samme tilstand og faar ulikt svar, er agenten ikke
     * deterministisk og proeven sier fra i stedet for aa maale stoey.
     */
    const under = lagIndre(spek);
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;

    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null) {
        const sete = s.iTur;
        // TAK PER GIV. Uten det bygges en fersk agent for HVER stilling i hver
        // verden, og prosessen doede paa node::OnFatalError etter ~500 s. Tre
        // stillinger per giv over flere giv gir samme dekning til en broekdel.
        if (iGiv < maksPerGiv && lovligeKort(s, sete).length >= 2 && s.stikkSpilt >= fraStikk) {
          // Verdener som er FORENLIGE med alt setet har sett.
          const rng = lagRng(777_000 + g * 31);
          const verdener = trekkVerdener(s, sete, verdenerPerStilling, rng, undefined, undefined, 4);
          if (verdener.length >= 2) {
            // Fersk agent per kall - se hodet.
            const fasit = kortNavn(under.velgHandling(s));
            // Determinismekrav: samme tilstand maa gi samme svar, ellers maaler
            // vi tilfeldighet og ikke informasjonslekkasje.
            assert.equal(
              kortNavn(under.velgHandling(s)),
              fasit,
              "agenten er ikke deterministisk - proeven kan ikke skille stoey fra juks",
            );
            stillinger++;
            iGiv++;
            for (const hender of verdener) {
              const s2 = medVerden(s, hender, sete);
              // Sanitetssjekk: VÅR hånd skal være urørt, ellers prøver vi noe annet.
              assert.deepEqual(
                s2.hender[sete],
                s.hender[sete],
                "medVerden endret observatoerens egen haand - proeven maaler feil ting",
              );
              const valg = kortNavn(under.velgHandling(s2));
              if (valg !== fasit) {
                avvik.push(
                  `froe ${frø} stikk ${s.stikkSpilt} sete ${sete}: ` +
                    `${fasit} i den ekte verdenen, ${valg} i en forenlig - ` +
                    `valget avhenger av SKJULTE kort`,
                );
              }
            }
          }
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return { stillinger, avvik };
}

test("K2: Adams velger likt i alle verdener som er forenlige med det han har sett", () => {
  const { stillinger, avvik } = prøv(ADAMS_MAALT, 8, 3, 3, 7);
  assert.ok(stillinger >= 8, `proeven fikk bare ${stillinger} stillinger - beviser ingenting`);
  assert.deepEqual(
    avvik,
    [],
    `JUKS: valget endret seg naar BARE de skjulte kortene ble byttet.\n` +
      `Ett avvik er nok - dette er ikke en statistisk proeve.\n\n` +
      avvik.slice(0, 8).join("\n"),
  );
});

test("K2: proeven kan FEILE - en jukser skal bli tatt", () => {
  /**
   * En prøve som aldri kan feile er ikke en prøve. `juks:` ser de virkelige
   * hendene, så den MÅ velge ulikt når hendene byttes — og gjør den ikke det,
   * er det prøven som er i stykker, ikke jukseren som er ærlig.
   *
   * Dette er den viktigste testen i fila. Uten den vet vi ikke om den grønne
   * over betyr «ærlig» eller «måler ingenting».
   */
  /**
   * TERSKELEN MAA VAERE HOEY. `Juksagent` jukser bare naar haanden har <= terskel
   * kort igjen:
   *
   *     if (igjen === 0 || igjen > this.terskel) return h;
   *
   * Foerste utgave brukte `juks:1`, og da jukser den bare paa siste kort - som
   * er tvunget uansett. Proeven var derfor groenn for en jukser, og hadde jeg
   * ikke skrevet DENNE testen ville jeg trodd at proeven virket.
   */
  /**
   * TERSKELEN MAA VAERE LOESBAR, ikke bare hoey.
   *
   * `Juksagent` jukser naar haanden har <= terskel kort igjen, og den finner
   * fasitkortet med en full DOBBELTDUMMY-LOESER. Med terskel 13 er det et
   * 13-korts firehaandsproblem - uregnbart, og prosessen doede paa
   * `node::OnFatalError` etter ~400 s.
   *
   * Foerste utgave brukte derimot `juks:1`, og da jukser den bare paa siste
   * kort, som er tvunget uansett. Proeven var groenn for en jukser.
   *
   * BEGGE FEILENE PEKTE SAMME VEI: uten denne testen ville jeg trodd at
   * proeven virket. Terskel 6 med stillinger fra stikk 7 er baade loesbart og
   * aktivt - maalt: 6 avvik av 9 verdenssammenlikninger.
   */
  const jukser = `juks:6:${ADAMS_MAALT}`;
  let bygget = true;
  try {
    lagIndre(jukser);
  } catch {
    bygget = false;
  }
  if (!bygget) {
    // Speken finnes kanskje ikke i denne formen; da skal testen si fra tydelig
    // i stedet for aa vaere groenn paa ingenting.
    assert.fail(
      `kunne ikke bygge «${jukser}» - uten en kjent jukser kan vi ikke vise at ` +
        `proeven faktisk fanger juks, og da er den groenne testen over verdiloes`,
    );
  }
  const { stillinger, avvik } = prøv(jukser, 4, 3, 3, 7);
  assert.ok(stillinger >= 5, `proeven fikk bare ${stillinger} stillinger`);
  assert.ok(
    avvik.length > 0,
    `en agent som SER de skjulte kortene ble ikke tatt av proeven. ` +
      `Da maaler proeven ikke informasjonslekkasje, og den groenne testen over ` +
      `beviser ingenting.`,
  );
});
