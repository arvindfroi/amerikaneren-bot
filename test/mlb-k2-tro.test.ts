/**
 * K2 FOR MLB-TROHODET — er trekkvektoren BLIND for de skjulte kortene?
 *
 * `docs/mlb.md`, fase 1: «trekkbyggeren er bevist blind for skjulte kort —
 * bytt ut de skjulte hendene og krev bit-identisk trekkvektor.»
 *
 * Dette er ikke en statistisk prøve. Enten er `troTrekk` en funksjon av lovlig
 * informasjon alene, eller så er den det ikke. Ett eneste avvikende flyttall er
 * juks.
 *
 * ===================== HVORFOR BIT, OG IKKE «OMTRENT» ===================
 *
 * En lekkasje trenger ikke være grov for å ødelegge alt. Et enkelt trekk som
 * subtilt korrelerer med hvor essene ligger, ville gjort trohodet uforklarlig
 * godt på K8 og hvert tall i rapporten verdiløst — uten å krasje, og uten at
 * noen måling feilet. Derfor er terskelen bit-identitet.
 *
 * ===================== OG DEN MÅ KUNNE FEILE ============================
 *
 * En prøve som aldri kan feile er ikke en prøve. Nederst bygges en trekkvektor
 * som SER de skjulte hendene, og prøven må ta den. Uten den testen vet vi ikke
 * om den grønne over betyr «blind» eller «måler ingenting».
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { MLB_TRO_INN, troTrekk } from "../src/mlb/trotrekk.ts";

type Bygger = (s: GameState, sete: number) => Float32Array;

const ærlig: Bygger = (s, sete) =>
  troTrekk(spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng);

/**
 * KONTROLLEN: en bygger som jukser med ett eneste bit.
 *
 * Den ærlige vektoren, pluss «holder relativt sete 1 spar ess?». Det er den
 * minste tenkelige lekkasjen — ett flagg av 660 — og finner prøven ikke den,
 * finner den heller ikke en ekte.
 */
const jukser: Bygger = (s, sete) => {
  const v = ærlig(s, sete);
  const neste = (sete + 1) % s.antallSpillere;
  const sparEss = kortIndeks({ farge: "S", verdi: 14 });
  if ((s.hender[neste] ?? []).some((k) => kortIndeks(k) === sparEss)) v[0] = v[0]! + 1;
  return v;
};

/**
 * Kjør prøven over flere giv og flere stikk.
 *
 * Returnerer både antall prøvde stillinger og avvikene, slik at kalleren kan
 * kreve BÅDE at det ikke er avvik OG at prøven fikk noe å prøve — en grønn test
 * på null stillinger beviser ingenting.
 */
function prøv(
  bygg: Bygger,
  giver: number,
  verdenerPerStilling: number,
  fraStikk: number,
  maksPerGiv: number,
): { stillinger: number; sammenlikninger: number; avvik: string[] } {
  const avvik: string[] = [];
  let stillinger = 0;
  let sammenlikninger = 0;

  for (let g = 0; g < giver; g++) {
    const frø = 5_500_000 + g * 4231;
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    let iGiv = 0;

    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null && iGiv < maksPerGiv && s.stikkSpilt >= fraStikk) {
        const sete = s.iTur;
        if (lovligeKort(s, sete).length >= 1) {
          const rng = lagRng(919_000 + g * 37 + s.stikkSpilt);
          const verdener = trekkVerdener(s, sete, verdenerPerStilling, rng, undefined, undefined, 4);
          if (verdener.length >= 2) {
            iGiv++;
            stillinger++;
            const fasit = bygg(s, sete);
            assert.equal(fasit.length, MLB_TRO_INN, "feil bredde på trekkvektoren");
            for (const hender of verdener) {
              const s2 = medVerden(s, hender, sete);
              // Sanitetssjekk: VÅR hånd skal være urørt, ellers prøver vi noe annet.
              assert.deepEqual(
                s2.hender[sete],
                s.hender[sete],
                "medVerden endret observatørens egen hånd — prøven måler feil ting",
              );
              sammenlikninger++;
              const annen = bygg(s2, sete);
              for (let i = 0; i < MLB_TRO_INN; i++) {
                if (!Object.is(fasit[i], annen[i])) {
                  avvik.push(
                    `frø ${frø} stikk ${s.stikkSpilt} sete ${sete}: trekk ${i} er ` +
                      `${String(fasit[i])} i den ekte verdenen og ${String(annen[i])} i en ` +
                      `forenlig — vektoren avhenger av SKJULTE kort`,
                  );
                  break;
                }
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
  return { stillinger, sammenlikninger, avvik };
}

test("K2/MLB: troTrekk er bit-identisk når BARE de skjulte hendene byttes", () => {
  // Fra stikk 0 av: tidlige stillinger er der talongen fortsatt er ferskest, og
  // det var nettopp i vrakfasen talonglekkasjen bet sist (§ talonglekkasje).
  const tidlig = prøv(ærlig, 6, 3, 0, 3);
  const sent = prøv(ærlig, 6, 3, 7, 3);
  const stillinger = tidlig.stillinger + sent.stillinger;
  const sammenlikninger = tidlig.sammenlikninger + sent.sammenlikninger;
  const avvik = [...tidlig.avvik, ...sent.avvik];

  assert.ok(stillinger >= 12, `prøven fikk bare ${stillinger} stillinger — beviser ingenting`);
  assert.ok(
    sammenlikninger >= 24,
    `prøven gjorde bare ${sammenlikninger} verdenssammenlikninger — beviser ingenting`,
  );
  assert.deepEqual(
    avvik,
    [],
    `JUKS: trekkvektoren endret seg da bare de skjulte kortene ble byttet.\n` +
      `Ett avvik er nok — dette er ikke en statistisk prøve.\n\n` +
      avvik.slice(0, 8).join("\n"),
  );
});

test("K2/MLB: prøven kan FEILE — én lekket bit skal bli tatt", () => {
  const { stillinger, avvik } = prøv(jukser, 4, 3, 4, 3);
  assert.ok(stillinger >= 6, `prøven fikk bare ${stillinger} stillinger`);
  assert.ok(
    avvik.length > 0,
    `en trekkvektor som SER en skjult hånd ble ikke tatt av prøven. Da måler prøven ` +
      `ikke informasjonslekkasje, og den grønne testen over beviser ingenting.`,
  );
});
