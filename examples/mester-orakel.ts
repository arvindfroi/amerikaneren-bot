/**
 * MESTER-ORAKELET: treningsdata der FASITEN er kortet MesterAI faktisk valgte.
 *
 *   node examples/mester-orakel.ts --skard 0/4 --kamper 400 \
 *        --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
 *
 * HVORFOR DENNE FINNES. SD-evalueringen (`src/moe2/sdkort.ts`) spiller
 * kandidatkortet ut mot en MOTSTANDERMODELL, og den modellen er i dag
 * NevroHjerne. Men vi spiller ikke mot NevroHjerne – vi spiller mot MesterAI,
 * som er målt 1,07 poeng per runde per sete sterkere (docs/moe2.md,
 * «MesterAI målt for første gang»). SD optimerer altså mot feil motstander.
 * MesterAI selv kan ikke brukes i rolloutene: den bruker opptil 450 ms per
 * kortvalg, og SD trenger tolv verdener × hele runden per beslutning.
 *
 * Kuren er ATFERDSKLONING. Denne filen produserer råstoffet: par av
 * (stilling, kortet MesterAI valgte). Et lite nett trenes på det
 * (`verktoy/mester-tren.py`) og settes så inn som `motpart` i SD.
 *
 * DETTE ER IKKE ET STYRKEORAKEL. Fasiten her er ikke «det beste kortet», den
 * er «kortet MesterAI ville spilt». Et nett trent på den skal SPILLE SOM
 * MesterAI, ikke spille godt, og det skal aldri brukes som vår egen policy.
 * Sammenlign med `examples/sd-orakel.ts`, der `v` er en VERDI per kort; her er
 * `k` ett kort, og alt annet er feil.
 *
 * OPPSETTET: MesterAI besetter ALLE FIRE setene. Da er hvert eneste kortvalg i
 * partiet en merket stilling, ikke bare halvparten – det dobler utbyttet per
 * adapterprosess, som er den knappe ressursen her. Vår egen motor er dommer;
 * adapteren speiler hver handling og verifiseres etter hver eneste av dem,
 * nøyaktig som i `examples/mesterai-h2h.ts`.
 *
 * SELVSJEKKEN (`--selvsjekk`) er den viktigste kontrollen i skriptet.
 * MesterAIs søk sampler verdener og er tidsbudsjettert, så den er ikke
 * deterministisk: spør du to ganger i samme stilling, kan du få to svar. I en
 * andel av stillingene spørres den derfor TO ganger, og begge svarene logges
 * (`k` og `k2`). NULLPUNKTET er `kn`: NevroHjernes valg i nøyaktig samme
 * stilling, logget i HVER linje. NevroHjerne er dagens motstandermodell i
 * SD-rolloutene, så dens treffprosent er akkurat det en klone må slå for at
 * byttet skal kunne bety noe. Er de to like ofte enige med MesterAI, er hele
 * øvelsen bortkastet – og det er billigere å vite her enn etter en
 * treningsrunde og en arenamåling. NevroHjerne er tilstandsløs (`nyKamp` er
 * tom), så svaret er en ren funksjon av stillingen.
 * Andelen der de to MesterAI-svarene er like er TAKET for troskap – ingen klone kan
 * treffe MesterAI oftere enn MesterAI treffer seg selv. Uten det tallet er
 * «70 % troskap» et tall uten målestokk.
 *
 * KJENT SKJEVHET, som skal stå her og ikke oppdages senere: stillingene kommer
 * fra MesterAIs EGEN spilling. Klonen skal brukes inne i SD-rollouts, som
 * starter fra stillinger VÅR agent har skapt. Det er det samme
 * fordelingsskiftet som gjorde DAgger-runde 2 verdt +0,49 poeng. `--utforsk`
 * demper det (et tilfeldig lovlig kort spilles i stedet for MesterAIs, men
 * MesterAIs valg logges likevel – det er nettopp det som gjør linjen
 * off-policy og nyttig), men fjerner det ikke.
 *
 * | Flagg | Standard | Betydning |
 * |---|---|---|
 * | `--ut` | mester-data/skard-«i».jsonl | varig logg, én linje per merket stilling |
 * | `--kamper` | 400 | antall partier denne prosessen spiller |
 * | `--froe` | 120000000 | frøbase; disjunkt fra alle andre bånd i prosjektet |
 * | `--skard` | 0/1 | «i/n» – i-te av n prosesser; deler frørommet |
 * | `--runder` | 30 | stopp partiet etter så mange runder (som sd-orakel) |
 * | `--utforsk` | 0.10 | andel trekk der et tilfeldig lovlig kort spilles |
 * | `--selvsjekk` | 0.05 | andel stillinger der MesterAI spørres to ganger |
 * | `--ms` | 450 | MesterAIs tidsbudsjett per kortvalg (appens innstilling) |
 * | `--verdener` | 0 | > 0 låser min/maks verdener; da styrer ikke klokken |
 * | `--maks` | 0 | stopp etter så mange merkede stillinger (0 = ingen grense) |
 * | `--adapter` | arena/adapter/.build/release/adapter | `wsl:`-prefiks støttes |
 *
 * Skrivingen skjer linje for linje til fil (append). En kjøring som varer i
 * timer skal aldri ha resultatene sine i et rør: et avbrudd skal koste den
 * siste linjen, ikke alt.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { e1SpillTrekk, E1_SPILL_DIM } from "../src/e1/trekk.ts";
import { kortIndeks, NevroAgent } from "../src/nevro/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagInn } from "../src/neat/trekk.ts";
import {
  Adapter,
  handlingFraJson,
  handlingTilJson,
  løsAdapter,
  rundeStart,
  sjekkSynk,
  type AdapterKommando,
} from "../arena/adapterklient.ts";

// --- Argumenter -------------------------------------------------------------

function tall(navn: string, standard: number): number {
  const i = process.argv.indexOf(`--${navn}`);
  if (i < 0 || process.argv[i + 1] === undefined) return standard;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`Ugyldig verdi for --${navn}`);
  return v;
}
function tekst(navn: string, standard: string): string {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : standard;
}

const skardSpek = tekst("skard", "0/1").split("/");
const skardI = Number(skardSpek[0]);
const skardN = Number(skardSpek[1] ?? 1);
const kamper = tall("kamper", 400);
// Frøbåndet ligger med vilje langt unna alle andre: e1-frys 0,7–9,7 mill.,
// portene 8,1/8,6 mill., h2h 0,55–0,78 mill., poengbenkene 33–34 mill.,
// sd-data 50–65 mill., sd-data2 80–95 mill. Delte frø ville gitt lekkasje den
// dagen et nett trent her måles på en holdout skåret av et av de andre.
const frøBase = tall("froe", 120_000_000);
const maksRunder = tall("runder", 30);
const utforsk = tall("utforsk", 0.1);
const selvsjekk = tall("selvsjekk", 0.05);
const tidMs = tall("ms", 450);
const låsteVerdener = tall("verdener", 0);
const maks = tall("maks", 0);
const utSti = tekst("ut", `mester-data/skard-${skardI}.jsonl`);
const adapterSti = tekst("adapter", "arena/adapter/.build/release/adapter");

let adapterKmd: AdapterKommando;
try {
  adapterKmd = løsAdapter(adapterSti);
} catch (feil) {
  console.error(feil instanceof Error ? feil.message : String(feil));
  process.exit(1);
}

// EGEN UTMAPPE. Treneren leser alle `skard-*.jsonl` i en mappe og blander dem
// uten å se på innholdet. Havner mester-linjer i sd-data/, er begge settene
// ødelagt uten at noe feiler – de har nesten samme format, men helt ulik
// betydning (`v` er verdier, `k` er et valg).
mkdirSync(dirname(utSti), { recursive: true });

const rng = lagRng((frøBase + skardI * 7919) >>> 0);

/**
 * NevroHjerne, som IKKE spiller her – den svarer bare på hva DEN ville gjort i
 * samme stilling (`kn`).
 *
 * Dette er den viktigste kontrollen i datasettet, og den koster ingenting:
 * NevroHjerne er dagens motstandermodell i SD-rolloutene. Treffer den MesterAI
 * like ofte som en klone gjør, er hele øvelsen bortkastet – da er MesterAI og
 * NevroHjerne ikke ulike nok til at bytte av motstandermodell kan flytte noe.
 * Uten dette tallet er «klonen treffer 70 %» et tall uten nullpunkt.
 */
const nevro = new NevroAgent();

// --- Ett parti --------------------------------------------------------------

interface Teller {
  merket: number;
  kortvalg: number;
  selvsjekker: number;
  selvenige: number;
  beslutninger: number;
}

const teller: Teller = { merket: 0, kortvalg: 0, selvsjekker: 0, selvenige: 0, beslutninger: 0 };
const t0 = performance.now();

async function spillParti(adapter: Adapter, frø: number): Promise<boolean> {
  // Alle fire setene betjenes av MesterAI. Da er hvert kortvalg en fasit.
  await adapter.send({ type: "nyKamp", mesterSeter: [0, 1, 2, 3] });
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  await adapter.send(rundeStart(s));

  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= maksRunder) return true;
      const res = utfør(s, { type: "NESTE" });
      s = res.state;
      for (const h of res.hendelser) {
        if (h.type === "NY_RUNDE") await adapter.send(rundeStart(s));
      }
      continue;
    }

    const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    const svar = await adapter.send({ type: "beslutt", sete: aktør });
    const mesterValg = handlingFraJson(svar.handling!);
    teller.beslutninger++;

    let handling: Handling = mesterValg;

    if (s.fase === "SPILL" && mesterValg.type === "SPILL") {
      const lovlige = lovligeKort(s, aktør);
      teller.kortvalg++;
      // Ett lovlig kort bærer ingen informasjon: nettet skal ikke lære å
      // «velge» der det ikke finnes noe valg, og motoren håndhever reglene
      // uansett. Slike stillinger ville bare fortynnet både tapet og
      // treffprosenten med gratispoeng.
      if (lovlige.length >= 2) {
        // SELVSJEKKEN: spør en gang til i NØYAKTIG samme stilling. Adapterens
        // motor er urørt av spørringen (`beslutt` utfører ikke handlingen),
        // så det andre svaret gjelder samme stilling som det første.
        let k2: number | null = null;
        if (rng() < selvsjekk) {
          const svar2 = await adapter.send({ type: "beslutt", sete: aktør });
          const valg2 = handlingFraJson(svar2.handling!);
          if (valg2.type === "SPILL") {
            k2 = kortIndeks(valg2.kort);
            teller.selvsjekker++;
            if (k2 === kortIndeks(mesterValg.kort)) teller.selvenige++;
          }
        }

        // NevroHjernes svar på NØYAKTIG samme stilling. Den utfører ingenting;
        // handlingen kastes etter at kortet er lest ut.
        const nevroHandling = nevro.velgHandling(s);
        const nevroValg =
          nevroHandling.type === "SPILL"
            ? nevroHandling
            : // Skal ikke kunne skje i SPILL-fasen; faller tilbake på det
              // første lovlige kortet i stedet for å kaste og miste partiet.
              ({ type: "SPILL", spiller: aktør, kort: lovlige[0]! } as const);

        appendFileSync(
          utSti,
          JSON.stringify({
            // De to trekkvektorene er ulike kodinger – `t` er 273 (appens 238
            // + 35 egne), `nt` er NEATs 318 – og de er LETTE å forveksle.
            // Begge skrives, som i sd-orakel, så en klone kan trenes på E1-
            // vektoren og likevel scores mot NEAT-maskineriet senere.
            t: Array.from(e1SpillTrekk(s, aktør), (x) => Math.round(x * 10_000) / 10_000),
            nt: lagInn(spillerVisning(s, aktør), "SPILL", s.giving.antallStikk, s.regler.målPoeng).map(
              (x) => Math.round(x * 10_000) / 10_000,
            ),
            // FASITEN: ett kort, ikke en verdivektor. Nøkkelen heter `k` og
            // ikke `v` nettopp for at et mester-datasett aldri skal kunne
            // leses av `verktoy/sd-tren.py` som om det var SD-verdier.
            k: kortIndeks(mesterValg.kort),
            // Andre spørring i samme stilling, når selvsjekken slo til.
            ...(k2 === null ? {} : { k2 }),
            // NevroHjernes valg i samme stilling – nullpunktet for troskap.
            kn: kortIndeks(nevroValg.kort),
            // Lovlige kort som indekser: masken tapet regnes over. Uten den
            // ville nettet blitt straffet for sannsynlighetsmasse på kort som
            // aldri var et alternativ.
            lov: lovlige.map(kortIndeks),
            sete: aktør,
            frø,
            stikk: s.stikkSpilt,
            // Hvilken MesterAI som svarte. To tall fra to ulike innstillinger
            // er ikke det samme datasettet, og det skal synes i linjen.
            ms: låsteVerdener > 0 ? null : tidMs,
            verdener: låsteVerdener > 0 ? låsteVerdener : null,
          }) + "\n",
        );
        teller.merket++;
        if (maks > 0 && teller.merket >= maks) return false;
      }

      // Utforskning: spill et tilfeldig lovlig kort i stedet. MesterAIs valg
      // er ALLEREDE logget, så linjen beholder sin fasit – vi flytter bare
      // spillet til en stilling MesterAIs egen policy ikke ville nådd.
      if (lovlige.length >= 2 && rng() < utforsk) {
        handling = { type: "SPILL", spiller: aktør, kort: lovlige[Math.floor(rng() * lovlige.length)]! };
      }
    }

    const res = utfør(s, handling);
    s = res.state;
    // Speilingen verifiseres etter HVER handling. Et avvik skal stoppe
    // kjøringen, ikke produsere data fra to motorer som har glidd fra
    // hverandre.
    const synk = await adapter.send({ type: "handling", handling: handlingTilJson(handling) });
    sjekkSynk(s, synk, `runde ${s.rundeNr}, ${handling.type} fra sete ${aktør}`);

    for (const h of res.hendelser) {
      if (h.type === "NY_RUNDE") await adapter.send(rundeStart(s));
    }
  }
  return true;
}

// --- Hovedløkke -------------------------------------------------------------

async function hoved(): Promise<void> {
  const adapter = new Adapter(adapterKmd);
  // Med --verdener låses min = maks, og fristen settes så høyt at klokken
  // aldri kutter søket kort. Da er arbeidsmengden per kortvalg uavhengig av
  // maskinlasten – se hodekommentaren i examples/mesterai-h2h.ts.
  await adapter.send({
    type: "init",
    mesterSeter: [],
    tidsbudsjettMs: låsteVerdener > 0 ? 3_600_000 : tidMs,
    ...(låsteVerdener > 0 ? { minVerdener: låsteVerdener, maksVerdener: låsteVerdener } : {}),
  });

  console.log(
    `mester-orakel: MesterAI i alle fire seter, skard ${skardI}/${skardN}, ` +
      `frøbase ${frøBase}, ` +
      (låsteVerdener > 0 ? `${låsteVerdener} verdener per kortvalg (låst)` : `${tidMs} ms per kortvalg`) +
      `\nutforsk ${utforsk}, selvsjekk ${selvsjekk}, ${E1_SPILL_DIM} trekk per linje → ${utSti}\n`,
  );

  for (let k = 0; k < kamper; k++) {
    // Skardene deler frørommet, så to prosesser aldri spiller samme parti.
    const frø = frøBase + skardI * 1_000_000 + k;
    const fortsett = await spillParti(adapter, frø);
    const brukt = (performance.now() - t0) / 1000;
    const enighet =
      teller.selvsjekker > 0 ? `${((100 * teller.selvenige) / teller.selvsjekker).toFixed(1)} %` : "–";
    console.log(
      `parti ${k + 1}/${kamper} (skard ${skardI}/${skardN}) – ${teller.merket} merkede av ` +
        `${teller.kortvalg} kortvalg, ${brukt.toFixed(0)}s, ` +
        `${(teller.merket / Math.max(1, brukt)).toFixed(2)}/s, ` +
        `selvenighet ${enighet} (n=${teller.selvsjekker})`,
    );
    if (!fortsett) break;
  }

  adapter.stopp();
  console.log(
    `\nFerdig: ${teller.merket} stillinger, ${teller.beslutninger} MesterAI-beslutninger totalt, ` +
      `selvenighet ${teller.selvenige}/${teller.selvsjekker} → ${utSti}`,
  );
}

hoved().catch((feil: unknown) => {
  console.error(feil);
  process.exit(1);
});
