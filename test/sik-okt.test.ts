/**
 * K4 I SIKKERORAKELET — hukommelsen som lærte uten å bestemme noe (11. sep).
 *
 * `okt:…:profil:sik:…` fylte økta med motstandernes vaner hele kvelden, men bare `amu:`
 * leste den (`motpartFor`). Sikkerorakelet rullet ut ALLE seter med samme policy, så i
 * den hele boten var K4/K6 null PER KONSTRUKSJON — ingen måling kunne vist noe annet.
 *
 * Fila låser koblingen, og at den kan ryke uten at noen merker det:
 *
 *   1. AV er bit-identisk, og en `motpartFor` som gir samme motpart overalt endrer ingenting.
 *   2. PÅ spiller hvert MOTSTANDERSETE sin egen policy og vårt eget sete aldri — verdiene
 *      regnes uavhengig, og en felle kaster om ruteren spør om vårt sete.
 *   3. Den når de EKSAKTE bladene også (`e<T>`), ikke bare den vanlige utspillingen.
 *   4. SPEKEN: «M» krever en økt, rekkefølgen med L/M/D/~ leses, og feil rekkefølge kastes.
 *   5. Økta kobles på ROLLOUT-MOTPARTEN, aldri på søket selv; en tom økt endrer ingenting,
 *      en plantet stil flytter søket.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState, type Handling } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { ADAMS_MAALT, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import { medVerden, standardMål, trekkVerdener, type Utspiller } from "../src/moe2/sdkort.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { Sikkerorakel } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { Økt } from "../src/moe2/okt.ts";

const motpart = lagIndre(ADAMS_MAALT) as unknown as Utspiller;

/**
 * En policy som er TYDELIG annerledes enn Adams og helt uten tilstand: første lovlige kort.
 * Tilstandsløs med vilje — prøven under regner verdiene i en annen rekkefølge enn søket.
 */
const førsteLovlige: Utspiller = {
  velgHandling: (s: GameState): Handling => ({ type: "SPILL", spiller: s.iTur!, kort: lovligeKort(s, s.iTur!)[0]! }),
};

/** Kortvalg med minst to lovlige kort, fra `fraStikk` og ut, i noen Adams-giv. */
function stillinger(fraStikk: number, igjen: number | null = null): GameState[] {
  const ut: GameState[] = [];
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  for (const frø of [7_311_001, 7_311_002, 7_311_003, 7_311_004]) {
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      if (
        s.fase === "SPILL" &&
        s.iTur !== null &&
        s.stikkSpilt >= fraStikk &&
        (igjen === null || s.giving.antallStikk - s.stikkSpilt === igjen) &&
        lovligeKort(s, s.iTur).length >= 2 &&
        vakt % 2 === 0
      ) {
        ut.push(s);
      }
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const STILLINGER = stillinger(4);

const spillFerdig = (start: GameState, m: Utspiller): GameState => {
  let s = start;
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) s = utfør(s, m.velgHandling(s)).state;
  return s;
};

test("stillingene finnes", () => {
  assert.ok(STILLINGER.length >= 10, `bare ${STILLINGER.length} stillinger`);
});

test("uten motpartFor, og med en som gir samme motpart overalt, er vurderingen bit-identisk", () => {
  for (const s of STILLINGER.slice(0, 4)) {
    const sete = s.iTur!;
    const uten = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(41) });
    const lik = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(41), motpartFor: () => motpart });
    assert.deepEqual(lik, uten);
  }
});

test("motpartFor spiller hvert motstandersete og aldri vårt eget — verdiene regnet uavhengig", () => {
  let ulike = 0;
  for (const s of STILLINGER.slice(0, 5)) {
    const sete = s.iTur!;
    const spurt = new Set<number>();
    const motpartFor = (p: number): Utspiller => {
      // FELLEN: spør ruteren om vårt eget sete, er det feilen K6-nullarmen fant i alpha-mu.
      if (p === sete) throw new Error(`motpartFor ble spurt om vårt eget sete ${p}`);
      spurt.add(p);
      return førsteLovlige;
    };
    const par = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(43), motpartFor });
    const uten = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(43) });
    assert.ok(par !== null && uten !== null);
    assert.ok(spurt.size > 0, "motpartFor ble aldri spurt – koblingen er død");

    // DEN UAVHENGIGE REGNINGEN: vårt sete spiller Adams, alle andre sin egen policy.
    const verdener = trekkVerdener(s, sete, 3, lagRng(43));
    assert.equal(par.n, verdener.length);
    const ruter: Utspiller = { velgHandling: (x) => (x.iTur === sete ? motpart : førsteLovlige).velgHandling(x) };
    for (const [i, kort] of lovligeKort(s, sete).entries()) {
      const forventet = verdener.map((hender) =>
        standardMål(spillFerdig(utfør(medVerden(s, hender, sete), { type: "SPILL", spiller: sete, kort }).state, ruter), sete),
      );
      assert.deepEqual([...par.kandidater[i]!.perVerden], forventet);
      if (forventet.some((v, w) => v !== uten.kandidater[i]!.perVerden[w])) ulike++;
    }
  }
  // Ellers kunne regningen over vært lik fordi motstanderpolicyen aldri betød noe.
  assert.ok(ulike > 0, "motstanderpolicyen endret ingen verdi – prøven beviser ingenting");
});

test("motpartFor når også utspillingen fram til de eksakte bladene (e<T>)", () => {
  const fraSeks = stillinger(0, 6);
  assert.ok(fraSeks.length >= 3, `bare ${fraSeks.length} stillinger med seks stikk igjen`);
  let ulike = 0;
  for (const s of fraSeks.slice(0, 5)) {
    const sete = s.iTur!;
    const motpartFor = (p: number): Utspiller => {
      if (p === sete) throw new Error(`motpartFor ble spurt om vårt eget sete ${p}`);
      return førsteLovlige;
    };
    const med = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(47), eksaktBlad: 3, motpartFor })!;
    const uten = vurderPar(s, sete, motpart, { verdener: 3, rng: lagRng(47), eksaktBlad: 3 })!;
    for (let i = 0; i < med.kandidater.length; i++) {
      for (let w = 0; w < med.n; w++) {
        if (med.kandidater[i]!.perVerden[w] !== uten.kandidater[i]!.perVerden[w]) ulike++;
      }
    }
  }
  assert.ok(ulike > 0, "e3 med motpartFor ga nøyaktig de samme verdiene – `spillFerdigEksakt` ser ikke ruteren");
});

test("speken: «M» krever økt, L/M/D/~ leses bakfra, feil rekkefølge kastes, utenSøk stripper", () => {
  assert.throws(() => lagIndre(`sik:alle:0.5:4M:${ADAMS_MAALT}`), /økt/);
  // Med «okt:» ytterst bygger den.
  assert.doesNotThrow(() => lagIndre(`okt:sik:alle:0.5:4MD:${ADAMS_MAALT}`));

  const økt = new Økt();
  const alt = lagIndre(`sik:alle:0.5:4k8e3LMD:${ADAMS_MAALT}`, { økt }) as unknown as Sikkerorakel;
  assert.ok(alt instanceof Sikkerorakel);
  assert.notEqual(alt.motpartFor, null);
  assert.equal(alt.visningsfrø, true);
  assert.equal(alt.eksaktBlad, 3);

  // GAMMEL STI: uten bokstavene er begge av, også når en økt finnes i konteksten.
  const gammel = lagIndre(`sik:alle:0.5:4k8e3L:${ADAMS_MAALT}`, { økt }) as unknown as Sikkerorakel;
  assert.equal(gammel.motpartFor, null);
  assert.equal(gammel.visningsfrø, false);
  assert.equal(gammel.eksaktBlad, 3);

  // Hver for seg, med kriterium (inneholder små bokstaver) og med troen bakerst.
  const bareD = lagIndre(`sik:alle:0.5:4aminD:${ADAMS_MAALT}`) as unknown as Sikkerorakel;
  assert.equal(bareD.visningsfrø, true);
  assert.equal(bareD.motpartFor, null);
  const medTro = lagIndre(`sik:alle:0.5:4k8LM~mlbu=e1-modell/mlb-tro.bin:${ADAMS_MAALT}`, { økt }) as unknown as Sikkerorakel;
  assert.ok(medTro.tro instanceof MlbSøketro);
  assert.notEqual(medTro.motpartFor, null);
  assert.equal(medTro.visningsfrø, false);

  assert.throws(() => lagIndre(`sik:alle:0.5:4DM:${ADAMS_MAALT}`, { økt }), /Ugyldig sik-spek/);
  assert.throws(() => lagIndre(`sik:alle:0.5:4ML:${ADAMS_MAALT}`, { økt }), /Ugyldig sik-spek/);
  assert.equal(utenSøk(`sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/mlb-tro-signal.bin:${ADAMS_MAALT}`), ADAMS_MAALT);
});

test("«M» kobler økta på rollout-motparten for motstandersetene, og en tom økt endrer ingenting", () => {
  const økt = new Økt();
  const kall: { basis: Utspiller; sete: number }[] = [];
  const ekte = økt.motpartFor.bind(økt);
  økt.motpartFor = (basis: Utspiller, sete: number): Utspiller => {
    kall.push({ basis, sete });
    return ekte(basis, sete);
  };
  const med = lagIndre(`sik:alle:0:3M:${ADAMS_MAALT}`, { økt }) as unknown as Sikkerorakel;
  const uten = lagIndre(`sik:alle:0:3:${ADAMS_MAALT}`, { økt: new Økt() }) as unknown as Sikkerorakel;
  for (const s of STILLINGER.slice(0, 6)) {
    const før = kall.length;
    const a = med.velgHandling(s);
    const b = uten.velgHandling(s);
    // NULLARMEN: økta har aldri sett en runde, så `motpartFor` gir basis — bit-identisk.
    assert.deepEqual(a, b);
    assert.equal(med.siste?.sigma, uten.siste?.sigma);
    assert.equal(med.siste?.n, uten.siste?.n);
    for (const k of kall.slice(før)) {
      assert.notEqual(k.sete, s.iTur, "økta ble spurt om vårt eget sete");
      assert.ok(!(k.basis instanceof Sikkerorakel), "basis er søket selv – hver utspilling ville startet et nytt søk");
    }
  }
  assert.ok(kall.length > 0, "«M» spurte aldri økta");
  assert.ok(kall.every((k) => k.basis === kall[0]!.basis), "økta fikk ulike basis-policyer i samme agent");
});

test("en plantet stil i økta flytter søket — K4 er ikke lenger null per konstruksjon", () => {
  // Vi planter STILEN, ikke hele boka: `motpartFor` leser `stilvri`, og vrien regnes med
  // nettets egen policy (`e1:` gir økta atferdsmodellen). Å lære en stil tar mange runder.
  const plantet = (): Økt => {
    const ø = new Økt();
    ø.stilvri = (): number => 0.6;
    return ø;
  };
  const med = lagIndre(`sik:alle:0:4M:${ADAMS_MAALT}`, { økt: plantet() }) as unknown as Sikkerorakel;
  const uten = lagIndre(`sik:alle:0:4:${ADAMS_MAALT}`, { økt: plantet() }) as unknown as Sikkerorakel;
  let ulik = 0;
  for (const s of STILLINGER.slice(0, 8)) {
    med.velgHandling(s);
    uten.velgHandling(s);
    // Samme frø og samme verdener: bare motstandernes policy skiller armene.
    assert.equal(med.siste?.n, uten.siste?.n);
    if (med.siste?.sigma !== uten.siste?.sigma) ulik++;
  }
  assert.ok(ulik > 0, "en plantet stil ga nøyaktig samme σ overalt – økta når ikke sikkerorakelet");
});
