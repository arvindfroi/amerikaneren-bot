import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lagRng } from "../src/kort.ts";
import { Innovasjonsbok, nyttGenom } from "../src/neat/genom.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { ANTALL_INN, ANTALL_UT } from "../src/neat/trekk.ts";
import {
  beregnFitness,
  kjørTurnering,
  kontraktAnger,
  spillGruppekamp,
  type TurneringsResultat,
} from "../src/neat/turnering.ts";

function nyAgenter(antall: number, frøStart = 1): NeatAgent[] {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  return Array.from(
    { length: antall },
    (_, i) => new NeatAgent(nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(frøStart + i))),
  );
}

const KJAPP = { maksRunder: 12 } as const;

test("flakskontroll: identiske agenter får identiske duplikatpoeng", () => {
  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const genom = nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(99));
  // Regret-læring slås av: den endrer nettet UNDERVEIS i kampen (det er
  // meningen), og da spilles rotasjonene ikke lenger identisk. Her testes
  // selve flakskontrollen, som krever frosne agenter.
  const agenter = Array.from({ length: 4 }, () => new NeatAgent(genom, { læringsrate: 0 }));
  const res = spillGruppekamp(agenter, 12345, KJAPP);
  // Samme genom i alle seter + samme kortgiving i alle rotasjoner ⇒ hver
  // agent har spilt nøyaktig de samme fire setene i nøyaktig samme kamp.
  assert.equal(new Set(res.poeng).size, 1, `like poeng, fikk ${res.poeng.join(",")}`);
  assert.equal(new Set(res.seire).size, 1);
});

test("gruppekamp er deterministisk gitt frø", () => {
  const a1 = nyAgenter(4);
  const a2 = nyAgenter(4);
  const r1 = spillGruppekamp(a1, 777, KJAPP);
  const r2 = spillGruppekamp(a2, 777, KJAPP);
  assert.deepEqual(r1.poeng, r2.poeng);
  assert.deepEqual(r1.rekkefølge, r2.rekkefølge);
});

test("cupturnering: dybder, mester og lucky losers henger sammen", async () => {
  const agenter = nyAgenter(8);
  const res = await kjørTurnering(agenter, 2024, KJAPP);
  assert.equal(res.dybde.length, 8);
  // 8 → 2 grupper → 2 vinnere → fylles til 4 med lucky losers → finale.
  assert.equal(res.runder, 2);
  const maks = Math.max(...res.dybde);
  assert.equal(res.dybde[res.mesterIdx], maks, "mesteren har størst dybde");
  assert.equal(res.dybde.filter((d) => d === maks).length, 1, "én mester");
  assert.ok(res.dybde.every((d) => d >= 0 && d <= res.runder));
  // Alle spilte minst én gruppekamp – duplikatpoeng er bokført.
  assert.ok(res.poeng.some((p) => p !== 0));
});

test("turneringen avviser felt som ikke er delelig med 4", async () => {
  await assert.rejects(() => kjørTurnering(nyAgenter(6), 1));
  await assert.rejects(() => kjørTurnering(nyAgenter(0), 1));
});

test("fitness: RELATIV POENGDIFFERANSE dominerer, dybde er tilleggsopplysning", () => {
  // Endret kontrakt (Arvind): «den boer bli straffet og beloennet med hvor
  // mange poeng den klarer aa faa i forhold til resten. dette beloenner godt
  // spill.» Foer veide ett dybdesteg 2,0 mens HELE poengspennet ga 1,8 – et
  // genom som spilte best av alle, men roek i én gruppe, rangerte under et
  // middelmaadig genom som kom én runde videre. Cupdybden er ETT
  // knockout-utfall med stor kortflaks; poengdifferansen er summen over alle
  // seterotasjoner og runder.
  const res: TurneringsResultat = {
    dybde: [2, 1, 1, 0],
    poeng: [400, 300, 100, 50],
    seire: [6, 3, 2, 0],
    regretSnitt: [0.1, 0.2, 0.2, 1.5],
    mesterIdx: 0,
    runder: 2,
  };
  const fit = beregnFitness(res, null);
  assert.ok(fit[0]! > fit[1]!, "flest poeng OG dypest skal rangere oeverst");
  assert.ok(fit[1]! > fit[2]!, "lik dybde: flere poeng gir mer fitness");
  assert.ok(fit[2]! > fit[3]!);
  for (const f of fit) assert.ok(f > 0);

  // KJERNEN: et genom som spiller klart best, men roek tidlig i cupen, skal
  // naa rangere OVER et svakere genom som kom lenger. Det var umulig foer.
  const cupflaks: TurneringsResultat = {
    dybde: [0, 3],
    poeng: [400, 50],
    seire: [1, 5],
    regretSnitt: [0.1, 0.1],
    mesterIdx: 1,
    runder: 2,
  };
  const f2 = beregnFitness(cupflaks, null);
  assert.ok(
    f2[0]! > f2[1]!,
    `beste spiller (400 poeng, dybde 0) fikk ${f2[0]!.toFixed(2)} mot ${f2[1]!.toFixed(2)} for et svakt genom som kom dypere`,
  );
});

test("fitness relativt til forrige mester: å slå mesterens dybde gir mer enn mesteren", () => {
  const res: TurneringsResultat = {
    dybde: [1, 2, 0, 1],
    poeng: [200, 250, 100, 150],
    seire: [3, 6, 1, 2],
    regretSnitt: [0, 0, 0, 0],
    mesterIdx: 1,
    runder: 2,
  };
  // Forrige mester står på plass 0 og nådde dybde 1; agent 1 nådde lenger.
  const fit = beregnFitness(res, 0);
  assert.ok(fit[1]! > fit[0]!, "dypere enn mesteren ⇒ høyere fitness enn mesteren");
  assert.ok(fit[2]! < fit[0]!, "grunnere enn mesteren ⇒ lavere fitness");
  // Samme dybde som mesteren rangeres via POENG, og forskjellen kan naa vaere
  // stor – det er hele poenget med endringen. Den gamle testen krevde at
  // avstanden var under ett dybdesteg, altsaa at poeng bare kunne nudge
  // innenfor et niva. Naa skal 150 poeng mot mesterens 200 gi maalbart
  // lavere fitness, ikke bare marginalt.
  assert.ok(fit[3]! < fit[0]!, "faerre poeng paa samme dybde skal gi lavere fitness");
  // ... men mesterbeskyttelsen staar: ingen paa samme dybde kan passere.
  assert.ok(fit[3]! <= fit[0]!);
});

test("parallell cup (arbeidstråder) gir bit-identisk resultat med sekvensiell", async () => {
  const { GruppePool } = await import("../src/neat/pool.ts");
  const { kjørTurneringMed } = await import("../src/neat/turnering.ts");
  const { klonGenom } = await import("../src/neat/genom.ts");

  const bok = new Innovasjonsbok(ANTALL_INN, ANTALL_UT);
  const genomerA = Array.from({ length: 8 }, (_, i) =>
    nyttGenom(ANTALL_INN, ANTALL_UT, bok, lagRng(500 + i)),
  );
  const genomerB = genomerA.map(klonGenom);

  // Sekvensielt (med regret-læring, standard rate).
  const agenter = genomerA.map((g) => new NeatAgent(g));
  const sekvensiell = await kjørTurnering(agenter, 4242, KJAPP);

  // Parallelt med 2 tråder på identiske genomkopier.
  const pool = new GruppePool(2);
  try {
    const parallell = await kjørTurneringMed(
      8,
      (medlemmer, gruppeFrø) =>
        pool.spill(medlemmer.map((i) => genomerB[i]!), gruppeFrø, KJAPP, 0.05),
      4242,
    );
    assert.deepEqual(parallell, sekvensiell, "samme turneringsresultat");
    // Lamarck-vektene skrives tilbake likt i begge kjøringene.
    assert.deepEqual(
      genomerB.map((g) => g.koblinger.map((k) => k.vekt)),
      genomerA.map((g) => g.koblinger.map((k) => k.vekt)),
      "samme lærte vekter",
    );
  } finally {
    await pool.lukk();
  }
});

test("kun agenter som slår mesteren (dypere i cupen) kan få høyere fitness", () => {
  const res: TurneringsResultat = {
    dybde: [1, 2, 1, 1],
    poeng: [100, 150, 400, 380], // agent 2 og 3: samme dybde som mester, flere poeng
    seire: [3, 6, 4, 4],
    regretSnitt: [0, 0, 0, 0],
    mesterIdx: 1,
    runder: 2,
  };
  const fit = beregnFitness(res, 0); // forrige mester = agent 0, dybde 1
  assert.ok(fit[1]! > fit[0]!, "dypere enn mesteren ⇒ høyere fitness");
  assert.ok(fit[2]! < fit[0]!, "samme dybde, flere poeng ⇒ FORTSATT under mesteren");
  assert.ok(fit[3]! < fit[0]!, "samme dybde ⇒ under mesteren");
  assert.ok(fit[2]! > fit[3]!, "innbyrdes rekkefølge bevart blant de nedklemte");
});

// ---------------------------------------------------------------------------
// Kontraktanger: to invarianter som ble brutt i den gamle formelen
// ---------------------------------------------------------------------------

test("anger er MONOTON i lagstikk: flere stikk gir aldri mer anger", () => {
  // Den gamle formelen la til |xT − lagStikk|, og med et xT-estimat på 6 var
  // anger LAVEST ved nøyaktig 6 stikk. Da lønner det seg å legge seg ned og
  // spille dårlig. Ingen stikktall skal noensinne straffes for å være høyt.
  for (const mål of [5, 6, 7, 8, 9, 10, 11, 12]) {
    for (let s = 0; s < 12; s++) {
      const her = kontraktAnger(mål, s, s >= mål, 12);
      const mer = kontraktAnger(mål, s + 1, s + 1 >= mål, 12);
      assert.ok(
        mer <= her + 1e-12,
        `bud ${mål}: ${s} stikk ga ${her}, ${s + 1} stikk ga ${mer} – flere stikk straffet`,
      );
    }
  }
});

test("anger er UAVHENGIG av budets størrelse: lik bom koster likt", () => {
  // Gammel formel: 2·bud + 2·stikk. Å bomme med ett stikk kostet 32/26 på
  // bud 9 mot 12/26 på bud 6 – ambisjon ble straffet, på toppen av at
  // reglene alt trekker −2n i poeng.
  for (let bom = 1; bom <= 4; bom++) {
    const verdier = [5, 6, 7, 8, 9, 10, 11, 12]
      .filter((b) => b - bom >= 0)
      .map((b) => kontraktAnger(b, b - bom, false, 12));
    for (const v of verdier) {
      assert.equal(v, verdier[0]!, `bom på ${bom} stikk koster ulikt for ulike bud`);
    }
  }
});

test("klart bud gir null anger uansett antall overstikk", () => {
  for (let s = 6; s <= 12; s++) assert.equal(kontraktAnger(6, s, true, 12), 0);
});
