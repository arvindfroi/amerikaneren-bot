/**
 * VAKTPOSTEN FOR `examples/k3-budgap.ts`.
 *
 * Måleverktøyet deler budrundens tak i «nåbart» og «klarsyn». Hele delingen
 * hviler på fire påstander om motoren, og ingen av dem er selvsagte. Blir én
 * av dem usann etter en endring et helt annet sted, slutter ikke verktøyet å
 * kjøre — det svarer bare på et annet spørsmål enn det som ble stilt. Det er
 * prosjektets faste feilklasse, og dette er tripwiren mot den.
 *
 * Testene er billige med vilje: ingen verdenstrekning i sløyfe, ingen søk.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type Bud,
  type GameState,
  type Handling,
  type Kort,
} from "../src/index.ts";
import { lagRng } from "../src/kort.ts";
import { ADAMS, lagIndre } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";

const nøkkel = (k: Kort): string => `${k.farge}${k.verdi}`;

/**
 * PÅSTAND 1: åpningsbudet har en TOM auksjon.
 *
 * Hele grunnen til at verktøyet måler åpningsbudet og ikke alle budturer er
 * at informasjonsmengden der er nøyaktig «egen hånd». Er det allerede meldt
 * når vi kommer til, er de usette kortene ikke lenger uniformt fordelt, og
 * resamplingen måler et annet sete enn det som satt der.
 */
test("åpningsbudet: tom auksjon, og de 52 kortene går opp", () => {
  for (let g = 0; g < 8; g++) {
    const s = opprettSpill({ antallSpillere: 4 }, 900_000 + g * 7717);
    assert.equal(s.fase, "BUDRUNDE");
    assert.equal(s.iTur, (s.giver + 1) % 4);
    assert.equal(s.budrunde.høyeste, null);
    assert.ok(s.budrunde.sisteBud.every((b) => b === null));
    assert.ok(s.budrunde.passet.every((p) => p === false));
    assert.equal(s.historikk.length, 0);

    const alle = [...s.hender.flat(), ...s.talong].map(nøkkel);
    assert.equal(alle.length, 52);
    assert.equal(new Set(alle).size, 52, "duplikatkort i den virkelige givingen");
    assert.ok(s.hender.every((h) => h.length === 12));
    assert.equal(s.talong.length, 4);
  }
});

/**
 * PÅSTAND 2: kandidatlisten i åpningsbudet er den samme uansett hånd.
 *
 * Orakelet velger blant kandidatene i den VIRKELIGE verdenen, men verdsetter
 * dem i resamplede verdener. Var kandidatlisten håndavhengig, ville de to
 * listene vært ulike, og et bud kunne fått en verdi i én verden og ingen i en
 * annen — uten at noe feilet.
 */
test("åpningsbudet: kandidatlisten er hånduavhengig", () => {
  const forventet = ["PASS", "5", "6", "7", "8", "9", "10", "11", "12", "AMERIKANER", "SOLO"];
  for (let g = 0; g < 8; g++) {
    const s = opprettSpill({ antallSpillere: 4 }, 900_000 + g * 7717);
    const lov = lovligeHandlinger(s);
    assert.equal(lov.fase, "BUDRUNDE");
    if (lov.fase !== "BUDRUNDE") return;
    assert.deepEqual(lov.bud.map(String), forventet);
  }
});

/**
 * PÅSTAND 3: å TVINGE policyens eget bud gir samme runde som å la den by selv.
 *
 * Verktøyet måler hvert kandidatbud gjennom en tvangssti og policyen gjennom
 * en fri sti. Er de to stiene ulike i noe annet enn budet, er hele
 * differansen forurenset. Verktøyet teller dette selv i hver kjøring — testen
 * er her fordi en kontroll som bare finnes i en kjøring ingen leser, ikke er
 * en kontroll.
 */
test("tvunget policybud er bit-identisk med fri policy", () => {
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS));

  const spill = (start: GameState, sete: number, bud: Bud | null): GameState => {
    let s = start;
    let brukt = bud === null;
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      let h: Handling | null = null;
      if (!brukt && s.fase === "BUDRUNDE" && iTur === sete) {
        const lov = lovligeHandlinger(s);
        if (lov.fase === "BUDRUNDE" && lov.bud.some((b) => b === bud)) {
          h = { type: "BUD", spiller: sete, bud: bud! };
          brukt = true;
        }
      }
      s = utfør(s, h ?? agenter[iTur]!.velgHandling(s)).state;
    }
    return s;
  };

  for (let g = 0; g < 8; g++) {
    const s0 = opprettSpill({ antallSpillere: 4 }, 900_000 + g * 7717);
    const sete = s0.iTur!;
    const h = agenter[sete]!.velgHandling(s0);
    assert.equal(h.type, "BUD");
    const fri = spill(s0, sete, null);
    const tvunget = spill(s0, sete, h.type === "BUD" ? h.bud : "PASS");
    assert.deepEqual(
      tvunget.sisteRunde?.delta,
      fri.sisteRunde?.delta,
      `giv ${g}: tvangsstien ga et annet resultat enn den frie`,
    );
    assert.deepEqual(tvunget.stikkVunnet, fri.stikkVunnet);
    assert.equal(tvunget.budvinner, fri.budvinner);
  }
});

/**
 * PÅSTAND 4: `medVerden` rører IKKE talongen — og derfor lager A4-samplerens
 * verdener ikke opp i budrunden.
 *
 * `trekkVerden` legger `giving.talong` usette kort i en DØD binge, altså i en
 * talong som ikke er den virkelige. `medVerden` bytter bare `hender`. Før
 * budvinneren har tatt opp talongen inneholder den resulterende tilstanden
 * derfor kort som ligger BÅDE i talongen og på en hånd — og talongen er den
 * ekte, som ingen ved bordet har sett.
 *
 * Dette er en STRUKTURELL egenskap, ikke et sammentreff, og den er årsaken
 * til at `k3-budgap.ts` bygger verdenene sine selv. `søktMu` (A4) bruker
 * paret, og er derfor bare gyldig et sted der talongen er borte.
 *
 * Testen påstår det den vet: at talongen står urørt. Endres det, skal noen
 * lese denne kommentaren og oppdatere A4 og `k3-budgap.ts` sammen.
 */
/**
 * DENNE TESTEN DOKUMENTERTE EN FEIL. Naa dokumenterer den fiksen.
 *
 * K3-agenten fant at `medVerden` byttet `hender` men lot `state.talong` staa.
 * Siden `trekkVerden` legger talongens kort i en doed binge og kaster dem, ga
 * det to feil samtidig: 100 % av verdenene hadde duplikatkort (3,6 av 52), og
 * budvinneren fikk de EKTE byttekortene i hver rollout - fordi `motor.ts` gir
 * henne `s.talong` ved vrak.
 *
 * Testen hevdet den gang at feilen fantes, med en vakt om aa varsle hvis den
 * forsvant. Den gjorde sin jobb: feilen ble rettet samme dag, `medVerden`
 * regner naa talongen som RESIDUALET (kort som verken ligger paa en haand, er
 * spilt eller er vraket), og testen er snudd til aa haandheve det.
 *
 * Den fulle proeven ligger i `test/talonglekkasje.test.ts`, som ogsaa er
 * verifisert ved aa gjeninnfoere lekkasjen.
 */
test("medVerden bytter talongen med verdenens - ellers er A4-rolloutene juks", () => {
  const s0 = opprettSpill({ antallSpillere: 4 }, 900_000);
  const sete = s0.iTur!;
  const verdener = trekkVerdener(s0, sete, 5, lagRng(4242), undefined, undefined, 3);
  assert.ok(verdener.length > 0, "samplerne ga ingen verdener - da maaler testen ingenting");

  let medDuplikat = 0;
  for (const hender of verdener) {
    const v = medVerden(s0, hender, sete);
    assert.deepEqual(v.hender[sete]!.map(nøkkel), s0.hender[sete]!.map(nøkkel), "egen haand ble roert");
    assert.equal(v.talong.length, s0.talong.length, "talongen fikk feil stoerrelse");
    const alle = [...v.hender.flat(), ...v.talong].map(nøkkel);
    if (new Set(alle).size !== alle.length) medDuplikat++;
  }
  assert.equal(medDuplikat, 0, "verdenene har duplikatkort - talongen foelger ikke verdenen");
});