/**
 * D8 – ankret linje. Erstatter D7-ligaen, som ble målt til å gjøre alle fire
 * skår DÅRLIGERE enn sitt eget utgangspunkt over 525–1525 generasjoner.
 *
 *   node examples/d8-anker.ts --fra d7/fro-d5-klar.json --dir trening-d8a
 *
 * HVA SOM ER ENDRET, OG HVORFOR – hvert punkt er en målt feil i D7:
 *
 * 1. FITNESS ER ANKRET, IKKE RELATIV. D7 ga rating fra kamper mot naboene i
 *    populasjonen. Snittratingen steg fra 1520 til 4119 uten at spillet ble
 *    bedre, fordi mesteren beholdt feltets maks mens barna reseedet på
 *    snittet: +1,98 per generasjon i ren aritmetikk, +1,73 observert. Nå
 *    måles hvert genom mot en FROSSEN motstander, så tallet betyr det samme
 *    i generasjon 1 og 1000.
 *
 * 2. DUPLIKATE GIVERE. D7 ga hvert genom tre kamper på ulike giver – ren
 *    giverflaks. Nå spiller hele populasjonen de SAMME giverne i alle fire
 *    seter, så flaksen faller ut av differansen mellom to genom. Målt
 *    rangeringskorrelasjon mot neat-evaluer (160 kamper): rho=0,86 ved fire
 *    givere, mot i praksis ingenting for D7s tre kamper.
 *
 * 3. MOTSTANDEREN ER GRÅDIG, IKKE NEVRO – og det er et MÅLT valg, ikke en
 *    forenkling. Sju kandidater som spenner 25 poeng mot grådig (46,6 til
 *    71,3) ligger alle mellom -23,0 og -25,7 mot nevro, med SE 1,6. Den
 *    sanne spredningen mot nevro er altså ~2,7 poeng og drukner i støyen;
 *    å bruke nevro som fitness ville krevd hundrevis av giver per genom per
 *    generasjon. Grådig er billig og korrelerer (rho=0,75 mot nevro-fasiten).
 *    Nevro er BENK, ikke fitness.
 *
 * 4. FRØENE ROTERER med generasjonen. Et fast frøsett gjør «beste noensinne»
 *    til «heldigst på akkurat de giverne».
 *
 * 5. BEKREFTELSE FØR GULL. Argmax over 96 støyete tall er systematisk for
 *    høy (vinnerens forbannelse – målt før: fellprosenten falt 17 % til 12 %
 *    da den ble tatt uten bekreftelse). Utfordreren må slå sittende gull
 *    PARRET på et ferskt, større frøsett.
 *
 * SUKSESSKRITERIET ER SATT PÅ FORHÅND: nevro-benken står på -24 for hele
 * D-familien. Beveger den seg ikke ut av [-26, -22] i løpet av 300
 * generasjoner, er tilnærmingen falsifisert og linja skal stoppes – ikke
 * kjøres i dagevis fordi grådig-fitnessen ser fin ut.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { lagRng } from "../src/kort.ts";
import { Evolusjon, genomFraJson, genomTilJson, NeatAgent, type Genom } from "../src/neat/index.ts";
import { dommenOverBarnet, STANDARD_RATER } from "../src/neat/genom.ts";
import { benkelinjer, målAnkret } from "../src/neat/anker.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { grådigHandling } from "./graadig.ts";

let popp = 96;
let generasjoner = 100000;
let dir = "trening-d8";
let fraFil: string | null = null;
/**
 * Genomet benken parrer mot. Standard er startgenomet, men et FERSKT loep har
 * ikke noe - og uten referanse er den parrede differansen udefinert, altsaa
 * kan skaaret ikke doemmes i det hele tatt. Da maa referansen oppgis utenfra.
 */
let refFil: string | null = null;
let givere = 4;
/** Hvor mange toppkandidater som maales om igjen foer mesteren kaares (0 = av). */
let racing = 16;
/** Antall EKSTRA givere i semifinalen. */
let finGivere = 12;
/** Generasjonssentrert dom (av = raatall, slik det var foer stoeyryddingen). */
let relativDom = true;
/** NevroHjerne byr/vraker/etterlyser i kandidatens sete (av = kandidaten byr selv). */
let medBudfører = true;
let evoFrø = 0xd8;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--popp") popp = Number(process.argv[++i]);
  else if (a === "--gen") generasjoner = Number(process.argv[++i]);
  else if (a === "--dir") dir = process.argv[++i]!;
  else if (a === "--fra") fraFil = process.argv[++i]!;
  else if (a === "--givere") givere = Number(process.argv[++i]);
  else if (a === "--ref") refFil = process.argv[++i]!;
  else if (a === "--racing") racing = Number(process.argv[++i]);
  else if (a === "--fingivere") finGivere = Number(process.argv[++i]);
  else if (a === "--relativdom") relativDom = process.argv[++i] !== "0";
  else if (a === "--budfoerer") medBudfører = process.argv[++i] !== "0";
  else if (a === "--fro") evoFrø = Number(process.argv[++i]);
}
mkdirSync(dir, { recursive: true });

const lesGenom = (fil: string): Genom => {
  const rå = JSON.parse(readFileSync(fil, "utf8")) as { genom?: unknown };
  return genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : readFileSync(fil, "utf8"));
};

const startGenom: Genom | undefined = fraFil !== null ? lesGenom(fraFil) : undefined;
const refGenom: Genom | undefined =
  refFil !== null ? lesGenom(refFil) : startGenom;

const nevro = new NevroAgent();
const motNevro = (s: Parameters<typeof grådigHandling>[0]): ReturnType<typeof grådigHandling> =>
  nevro.velgHandling(s);

/**
 * BUDFOERER I KANDIDATENS EGET SETE. NevroHjerne byr, vraker og etterlyser;
 * genomet spiller bare kortene.
 *
 * Uten dette maalte fitness unnvikelse i stedet for spilleevne: D5 endte som
 * spillefoerer i 6 % av rundene, D6 i 2 %, D8b i 0,3 %. Aa passe er den
 * billigste maaten aa slippe unna en kontrakt man ikke kan spille hjem, og
 * seleksjonen fant den utveien hver gang. Naa er rollen paatvunget.
 *
 * Dette er halve koevolusjonen. Budagenten er foreloepig FROSSEN (nevro), ikke
 * en egen populasjon som laerer - det staar igjen.
 */
const budfører = medBudfører ? motNevro : undefined;

/**
 * Fitness for hele populasjonen på ETT delt frøsett.
 *
 * At frøbasen er felles er ikke en detalj – det er hele grunnen til at fire
 * givere holder. To genom som spilte ulike giver kan ikke sammenlignes ved
 * n=4; to genom som spilte de samme kan.
 */
function målPopulasjon(genomer: readonly Genom[], frøBase: number): number[] {
  return genomer.map(
    (g) =>
      målAnkret(
        () => new NeatAgent(g, { læringsrate: 0 }),
        grådigHandling,
        givere,
        frøBase,
        8,
        budfører,
      ).diff,
  );
}

const evo = new Evolusjon({
  populasjon: popp,
  frø: evoFrø,
  startGenom,
  rater: { ...STANDARD_RATER, bevist: true },
});
const rng = lagRng(evoFrø ^ 0x8a17);

const NL = String.fromCharCode(10);
const logg: string[] = [];
const si = (s: string): void => {
  console.log(s);
  logg.push(s);
  if (logg.length % 5 === 0) writeFileSync(`${dir}/anker.log`, logg.join(NL) + NL);
};

si(
  `D8-anker: popp ${popp}, ${givere} givere x4 seter per genom, ` +
    `fra ${fraFil ?? "ferskt"}`,
);

/** Sittende gull – byttes bare etter en bekreftet, parret forbedring. */
let gull: Genom | null = startGenom !== undefined ? startGenom : null;
let gullDiff = -Infinity;

for (let g = 0; g < generasjoner; g++) {
  // Roterende frøbase: fast frøsett ville gjort «beste noensinne» til
  // «heldigst paa akkurat de giverne».
  const frøBase = 1_000_000 + (g % 500) * 64;
  const fitness = målPopulasjon(evo.genomer, frøBase);

  // SEMIFINALE MOT VINNERENS FORBANNELSE. argmax over 96 tall med SE ~7 er
  // systematisk for hoey, og det var synlig: `beste` hoppet 46,7 -> 32,1 ->
  // 30,4 paa tre maalepunkter uten at populasjonen kan ha endret seg saa mye.
  // De toppKandidat beste maales derfor paa NYE givere i samme blokk, og
  // mesteren kaares paa det sammenslaatte estimatet. Selve avlen bruker
  // fortsatt grovmaalingen for alle - det er bare kroningen som skjerpes.
  const skjerpet = fitness.slice();
  if (racing > 0) {
    const topp = fitness
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v)
      .slice(0, racing)
      .map((x) => x.i);
    for (const i of topp) {
      // +16 holder oss innenfor generasjonens egen 64-brede froeblokk, saa
      // semifinalen aldri laaner giver fra en annen generasjon.
      const fin = målAnkret(
        () => new NeatAgent(evo.genomer[i]!, { læringsrate: 0 }),
        grådigHandling,
        finGivere,
        frøBase + 16,
        8,
        budfører,
      ).diff;
      skjerpet[i] = (givere * fitness[i]! + finGivere * fin) / (givere + finGivere);
    }
  }

  const beste = skjerpet.indexOf(Math.max(...skjerpet));
  const snitt = fitness.reduce((a, b) => a + b, 0) / fitness.length;

  // GENERASJONSSENTRERT DOM. Naar giversettet roterer faar hele feltet en
  // felles forskyvning, og raatallene ville latt den avgjoere skrittlengden.
  // Se dommenOverBarnet for maalingen som viser hvor stor forskyvningen er.
  for (let i = 0; i < evo.genomer.length; i++) {
    dommenOverBarnet(evo.genomer[i]!, relativDom ? fitness[i]! - snitt : fitness[i]!);
  }

  if ((g + 1) % 10 === 0) {
    const spredning = Math.sqrt(
      fitness.reduce((a, b) => a + (b - snitt) * (b - snitt), 0) / fitness.length,
    );
    si(
      `gen ${String(g + 1).padStart(5)}: beste ${fitness[beste]!.toFixed(1)}, ` +
        `snitt ${snitt.toFixed(1)}, spredning ${spredning.toFixed(1)}, ` +
        `koblinger ${evo.genomer[beste]!.koblinger.length}`,
    );
    writeFileSync(`${dir}/mester.json`, genomTilJson(evo.genomer[beste]!));
    writeFileSync(
      `${dir}/status.json`,
      JSON.stringify({
        generasjon: g + 1,
        tidsstempel: Date.now(),
        fitness: fitness[beste]!,
        snitt,
        koblinger: evo.genomer[beste]!.koblinger.length,
      }),
    );
  }

  // BEKREFTELSE: den billige fitnessen er bare en port. Utfordreren maales
  // parret mot sittende gull paa et ferskt, stoerre froesett, og bare en
  // positiv differanse DER bytter gullet.
  if ((g + 1) % 25 === 0) {
    const friskt = 2_000_000 + Math.floor(rng() * 100_000);
    const u = målAnkret(
      () => new NeatAgent(evo.genomer[beste]!, { læringsrate: 0 }),
      grådigHandling,
      24,
      friskt,
      8,
      budfører,
    );
    const s =
      gull === null
        ? null
        : målAnkret(
            () => new NeatAgent(gull!, { læringsrate: 0 }),
            grådigHandling,
            24,
            friskt,
            8,
            budfører,
          );
    if (s === null || u.diff > s.diff) {
      gull = evo.genomer[beste]!;
      gullDiff = u.diff;
      writeFileSync(`${dir}/gull.json`, genomTilJson(gull));
      si(
        `  gull byttet ved gen ${g + 1}: ${u.diff.toFixed(1)} +- ${u.se.toFixed(1)}` +
          (s !== null ? ` mot sittende ${s.diff.toFixed(1)} +- ${s.se.toFixed(1)}` : ""),
      );
    }
  }

  // NEVRO-BENKEN er dommen. Grådig-fitnessen kan stige uten at denne gjoer
  // det; da er linja ikke paa vei mot maalet, uansett hvor fin kurven ser ut.
  if (g + 1 === 25 || (g + 1) % 100 === 0) {
    const kandidat = gull ?? evo.genomer[beste]!;
    // 40 RUNDER, ikke 8: fitnessen har raad til aa kutte kampen kort, men
    // poeng akkumuleres per runde, saa benken maa ha en fast, lang skala.
    const frø = 3_000_000 + (g % 40) * 16;
    // Benken bruker SAMME oppsett som treningen. Maalte vi hele botten mens vi
    // trente bare kortspillet, ville tallet blandet inn en budagent genomet
    // ikke lenger eier.
    const nb = målAnkret(
      () => new NeatAgent(kandidat, { læringsrate: 0 }),
      motNevro,
      16,
      frø,
      40,
      budfører,
    );

    // UTGANGSPUNKTET MAALES PAA DE SAMME GIVERNE, hver gang.
    //
    // Grunnen er at absoluttnivaaet ikke er til aa stole paa: samme genom
    // maalt paa tre froesett ga -40,3 / -48,7 / -51,7, og D5s historiske
    // logg staar paa -32,4 uten at jeg klarte aa reprodusere det nivaaet.
    // Med et anker maalt paa NOEYAKTIG samme givere spiller nivaaet ingen
    // rolle - differansen er parret, og den er det ENESTE tallet jeg vil
    // laane oere til naar jeg avgjoer om linja gaar framover.
    const ref =
      refGenom !== undefined
        ? målAnkret(
            () => new NeatAgent(refGenom, { læringsrate: 0 }),
            motNevro,
            16,
            frø,
            40,
            budfører,
          )
        : null;
    const linjer = benkelinjer(g + 1, "nevro", nb);
    si(linjer);
    if (ref !== null) {
      si(
        `  parret mot utgangspunktet: ${(nb.diff - ref.diff >= 0 ? "+" : "") +
          (nb.diff - ref.diff).toFixed(1)} ` +
          `(kandidat ${nb.diff.toFixed(1)}, utgangspunkt ${ref.diff.toFixed(1)}, samme givere)`,
      );
    }
    appendFileSync(`${dir}.log`, linjer + NL);
    writeFileSync(
      `${dir}/nevro-benk.json`,
      JSON.stringify({
        generasjon: g + 1,
        diff: nb.diff,
        se: nb.se,
        utgangspunkt: ref?.diff ?? null,
        motUtgangspunkt: ref !== null ? nb.diff - ref.diff : null,
        gullDiff,
      }),
    );
  }

  evo.nesteGenerasjonMed(fitness);
}
