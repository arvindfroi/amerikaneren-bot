import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import {
  genomFraJson,
  genomTilJson,
  Innovasjonsbok,
  klonGenom,
  nyttGenom,
} from "../src/neat/genom.ts";
import { Evolusjon } from "../src/neat/evolusjon.ts";
import { ANTALL_INN, ANTALL_UT } from "../src/neat/trekk.ts";

const KJAPP = { maksRunder: 8 } as const;

test("evolusjonen avviser ugyldig populasjonsstørrelse", () => {
  assert.throws(() => new Evolusjon({ populasjon: 6 }));
  assert.throws(() => new Evolusjon({ populasjon: 4 }));
});

test("to generasjoner: populasjonen består, mesteren forsvarer tittelen på plass 0", () => {
  const evo = new Evolusjon({ populasjon: 8, frø: 7, kampOpts: KJAPP });
  assert.equal(evo.genomer.length, 8);

  const stat0 = evo.kjørGenerasjon();
  assert.equal(stat0.generasjon, 0);
  assert.equal(evo.genomer.length, 8);
  assert.ok(evo.mester !== null, "mester kåret i første turnering");
  assert.ok(stat0.antallArter >= 1);
  assert.ok(stat0.besteFitness >= stat0.snittFitness);
  assert.ok(stat0.mesterDybde >= 1, "mesteren vant minst én gruppe");
  // Mesterkopien står uendret på plass 0 i neste kull.
  assert.deepEqual(evo.genomer[0], evo.mester);

  const førMester = klonGenom(evo.mester!);
  const stat1 = evo.kjørGenerasjon();
  assert.equal(stat1.generasjon, 1);
  assert.equal(evo.genomer.length, 8);
  assert.ok(evo.mester !== null);
  // Om tittelen ble forsvart, er mesteren samme nett STRUKTURELT – vektene
  // kan ha flyttet seg, for nettet regret-lærer (kalibrerer xT) mens det
  // spiller, og læringen skrives tilbake i genomet (lamarckisk).
  if (stat1.mesterForsvarte) {
    assert.deepEqual(
      evo.mester!.koblinger.map((k) => k.innovasjon),
      førMester.koblinger.map((k) => k.innovasjon),
    );
    assert.deepEqual(evo.mester!.noder, førMester.noder);
  }
});

test("mestergenomet overlever JSON-runden og kan så en ny populasjon", () => {
  const evo = new Evolusjon({ populasjon: 8, frø: 3, kampOpts: KJAPP });
  evo.kjørGenerasjon();
  const json = genomTilJson(evo.mester!);
  const lastet = genomFraJson(json);
  assert.equal(lastet.antallInn, ANTALL_INN);
  assert.equal(lastet.antallUt, ANTALL_UT);

  const evo2 = new Evolusjon({ populasjon: 8, frø: 4, kampOpts: KJAPP, startGenom: lastet });
  assert.deepEqual(evo2.genomer[0], lastet, "startgenomet står uendret først");
  // Mutantene skal være gyldige genomer med samme inn/ut-dimensjoner.
  for (const g of evo2.genomer) {
    assert.equal(g.antallInn, ANTALL_INN);
    assert.equal(g.antallUt, ANTALL_UT);
  }
  const stat = evo2.kjørGenerasjon();
  assert.ok(stat.besteFitness > 0);
});

test("determinisme: samme frø gir samme forløp", () => {
  const a = new Evolusjon({ populasjon: 8, frø: 11, kampOpts: KJAPP });
  const b = new Evolusjon({ populasjon: 8, frø: 11, kampOpts: KJAPP });
  const sa = a.kjørGenerasjon();
  const sb = b.kjørGenerasjon();
  assert.deepEqual(sa, sb);
  assert.deepEqual(a.mester, b.mester);
});

test("hall of fame: tidligere mestere stiller i cupen uten å endre populasjonen", () => {
  const evo = new Evolusjon({ populasjon: 8, frø: 21, kampOpts: KJAPP, hallOfFame: 4 });
  let medHall = false;
  for (let g = 0; g < 8; g++) {
    evo.kjørGenerasjon();
    assert.equal(evo.genomer.length, 8, "populasjonen holder seg");
    assert.ok(evo.hall.length <= 4, "hallen er avgrenset");
    if (evo.hall.length >= 4) medHall = true; // neste turnering får 12 deltakere
  }
  assert.ok(medHall, "hallen fyltes i løpet av 8 generasjoner");
});

test("startPopulasjon: genomer fra ulike historikker kanoniseres til felles nummerering", () => {
  // To «familier» laget med hver sin (ukoordinerte) innovasjonsbok.
  const famA = nyttGenom(ANTALL_INN, ANTALL_UT, new Innovasjonsbok(ANTALL_INN, ANTALL_UT), lagRng(1));
  const famB = nyttGenom(ANTALL_INN, ANTALL_UT, new Innovasjonsbok(ANTALL_INN, ANTALL_UT), lagRng(2));

  const evo = new Evolusjon({ populasjon: 8, frø: 5, kampOpts: KJAPP, startPopulasjon: [famA, famB] });
  assert.equal(evo.genomer.length, 8);

  // Samme (inn→ut)-par skal ha samme innovasjonsnummer på tvers av genomene.
  const nummerForPar = new Map<string, number>();
  for (const g of evo.genomer.slice(0, 2)) {
    for (const k of g.koblinger) {
      const par = `${k.inn}>${k.ut}`;
      const sett = nummerForPar.get(par);
      if (sett === undefined) nummerForPar.set(par, k.innovasjon);
      else assert.equal(k.innovasjon, sett, `paret ${par} har ulikt nummer`);
    }
  }
  const stat = evo.kjørGenerasjon();
  assert.ok(stat.besteFitness > 0);
  assert.equal(evo.genomer.length, 8);
});
