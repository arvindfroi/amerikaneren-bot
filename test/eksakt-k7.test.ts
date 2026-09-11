import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { E1Agent } from "../src/e1/agent.ts";
import { lagRng } from "../src/kort.ts";
import { lovligeKort, opprettSpill, utfør, type GameState, type Handling } from "../src/motor.ts";
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { ADAMS_MAALT, lagIndre, utenSøk } from "../src/moe2/agentspek.ts";
import { delEksaktSpek, STANDARD_TAK } from "../src/moe2/eksaktagent.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { byggUtrullet, type Velger } from "../src/moe2/utrullet.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { eksaktKortverdier, enumerer, lesInformasjon, tellVerdener } from "../src/solver/eksakt.ts";

/**
 * K7.1 — EKSAKT SLUTTSPILL I SPILL (11. sep).
 *
 * `eksakt.ts` fantes, men var målt negativ (§56) og hadde to feil som denne fila låser:
 *
 *  1. MAKKEREN LEKTE. `lesInformasjon` leste `state.makker`, som motoren setter i VELG
 *     – før kortet er spilt. Et sete som ikke har sett makkeren fikk vite hvem det var.
 *     Det er juks (K2), ikke en tilnærming.
 *  2. DET ETTERLYSTE KORTET KUNNE LIGGE HOS BUDVINNEREN. Samplerens egen kommentar
 *     (sampler.ts:141-167) viser hva det koster: budvinneren ble sin egen makker og
 *     verdenen ble scoret etter feil regler.
 *
 * Og løseren er byttet fra budlagets stikk (`dds.ts`) til spillernes poeng
 * (`poengdds.ts`), med klasseutvidelse – den som denne fila også låser.
 */

const nevro = new NevroAgent();

/** Alle SPILL-stillinger i én runde drevet av NevroHjerne. */
function rundeStillinger(frø: number): GameState[] {
  const ut: GameState[] = [];
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    if (s.fase === "SPILL" && s.iTur !== null) ut.push(s);
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return ut;
}

function stillingerMed(igjen: number, antall: number): GameState[] {
  const ut: GameState[] = [];
  for (let f = 0; ut.length < antall && f < antall * 8; f++) {
    const s = rundeStillinger(8_200_000 + f).find((x) => x.giving.antallStikk - x.stikkSpilt === igjen);
    if (s !== undefined) ut.push(s);
  }
  return ut;
}

test("K2: makkeren er ukjent i informasjonsbildet til han er avslørt – med mindre setet selv har kortet", () => {
  let uavslørt = 0;
  for (let f = 0; f < 30 && uavslørt < 12; f++) {
    for (const s of rundeStillinger(8_100_000 + f)) {
      if (s.makkerAvslørt || s.etterlyst === null || s.makker === null) continue;
      uavslørt++;
      for (let sete = 0; sete < 4; sete++) {
        const info = lesInformasjon(s, sete);
        if (sete === s.makker) {
          assert.equal(info.makker, sete, "setet som HAR det etterlyste kortet vet at det er makker");
        } else {
          assert.equal(
            info.makker,
            null,
            `sete ${sete} fikk vite makkeren (${s.makker}) før kortet var spilt – motoren setter den i VELG`,
          );
        }
      }
    }
  }
  assert.ok(uavslørt >= 5, `for få stillinger med uavslørt makker (${uavslørt}) – testen beviser ingenting`);
});

test("det etterlyste kortet legges aldri hos budvinneren, og tellingene er fortsatt like", () => {
  // Bygger et informasjonsbilde der kortet er usett og budvinneren er en levende
  // bøtte, og krever at INGEN enumerert verden gir ham det. Før rettingen tillot både
  // `enumerer` og `tellVerdener` bøtta, så testen feiler på den gamle koden.
  let prøvd = 0;
  for (const s of stillingerMed(2, 12)) {
    const bv = s.budvinner!;
    for (let sete = 0; sete < 4 && prøvd < 10; sete++) {
      if (sete === bv) continue;
      const grunn = lesInformasjon(s, sete);
      const bvBøtte = grunn.bøtter.find((b) => b.spiller === bv);
      if (bvBøtte === undefined) continue;
      for (const c of grunn.usett) {
        if (bvBøtte.forbud.has(Math.floor(c / 13))) continue;
        const info = { ...grunn, etterlystUsett: c, makker: null };
        let verdener = 0;
        const e = enumerer(info, (hender, vekt) => {
          assert.ok(!(hender[bv] ?? []).includes(c), "det etterlyste kortet havnet hos budvinneren");
          assert.ok(hender.some((h, p) => p !== bv && h.includes(c)), "det etterlyste kortet forsvant");
          verdener += vekt;
        });
        if (e.verdener === 0) continue;
        assert.equal(verdener, tellVerdener(info), "enumerasjonen og DP-tellingen spriker");
        prøvd++;
        break;
      }
    }
  }
  assert.ok(prøvd >= 5, `for få prøvde bilder (${prøvd})`);
});

test("hvert lovlige kort får en verdi – poengløser, dd-kontroll og alle tre målformer", () => {
  let sjekket = 0;
  for (const igjen of [2, 3]) {
    for (const s of stillingerMed(igjen, 5)) {
      const sete = s.iTur!;
      const lovlige = lovligeKort(s, sete);
      for (const opts of [{}, { løser: "dd" as const }, { mål: "lag" as const }, { mål: "egen" as const }]) {
        const svar = eksaktKortverdier(s, sete, opts);
        assert.ok(svar !== null);
        assert.equal(svar.vurderinger.length, lovlige.length, `kort uten verdi (${JSON.stringify(opts)})`);
        assert.equal(svar.enumerasjon.verdener, svar.fasitAntall);
        for (const v of svar.vurderinger) assert.ok(Number.isFinite(v.verdi));
      }
      sjekket++;
    }
  }
  assert.ok(sjekket >= 6, `for få stillinger (${sjekket})`);
});

test("speken «eks:<terskel>[L][t<tak>]» leses, og avvises når den er ugyldig", () => {
  const a = delEksaktSpek("eks:4L:nevro")!;
  assert.deepEqual(a.valg, { terskel: 4, maksKonfigurasjoner: STANDARD_TAK, mål: "lag" });
  assert.equal(a.indre, "nevro");
  const b = delEksaktSpek("eks:5Lt20000:vakt:at:nevro")!;
  assert.deepEqual(b.valg, { terskel: 5, maksKonfigurasjoner: 20_000, mål: "lag" });
  assert.equal(b.indre, "vakt:at:nevro");
  const c = delEksaktSpek("eks:3t500:nevro")!;
  assert.deepEqual(c.valg, { terskel: 3, maksKonfigurasjoner: 500 });
  assert.throws(() => delEksaktSpek("eks:3Q:nevro"), /Ugyldig terskel/);
  assert.throws(() => delEksaktSpek("eks:3t0:nevro"), /Ugyldig tak/);
});

test("utenSøk stripper eks: – en rollout-motpart skal ikke enumerere", () => {
  assert.equal(utenSøk(`eks:3L:${ADAMS_MAALT}`), ADAMS_MAALT);
  assert.equal(utenSøk(`eks:4Lt20000:sik:foerer:0.5:8:${ADAMS_MAALT}`), ADAMS_MAALT);
});

test("K2: eks-laget velger likt i alle verdener som er forenlige med det setet har sett", () => {
  const spek = `eks:4Lt20000:${ADAMS_MAALT}`;
  const avvik: string[] = [];
  let stillinger = 0;
  for (let g = 0; g < 4; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    const under = lagIndre(spek);
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 3_400_000 + g * 5171);
    let iGiv = 0;
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null) {
        const sete = s.iTur;
        const igjen = s.giving.antallStikk - s.stikkSpilt;
        if (iGiv < 3 && igjen <= 4 && lovligeKort(s, sete).length >= 2) {
          const verdener = trekkVerdener(s, sete, 3, lagRng(888_000 + g), undefined, undefined, 4);
          if (verdener.length >= 2) {
            const navn = (h: Handling): string => (h.type === "SPILL" ? `${h.kort.farge}${h.kort.verdi}` : h.type);
            const fasit = navn(under.velgHandling(s));
            stillinger++;
            iGiv++;
            for (const hender of verdener) {
              const valg = navn(under.velgHandling(medVerden(s, hender, sete)));
              if (valg !== fasit) avvik.push(`giv ${g} stikk ${s.stikkSpilt} sete ${sete}: ${fasit} → ${valg}`);
            }
          }
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  assert.ok(stillinger >= 6, `for få stillinger (${stillinger})`);
  assert.deepEqual(avvik, [], `JUKS: valget endret seg når bare skjulte kort ble byttet\n${avvik.join("\n")}`);
});

test("appens bygger og speken velger identisk med eksakt sluttspill utenpå søket, og laget slår til", () => {
  const SPEK =
    "vr:e1-modell/vrakrang.bin:telrd:eks:3L:sik:foerer:0.5:8:" +
    "budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";
  const kortBytes = new Uint8Array(readFileSync("e1-modell/d7alle.bin"));
  const vrakBytes = new Uint8Array(readFileSync("e1-modell/vrakrang.bin"));
  const budJson: unknown = JSON.parse(readFileSync("e1-modell/bud-vant.json", "utf8"));
  const bygde = [0, 1, 2, 3].map(() =>
    byggUtrullet({
      kortnett: nettFraBytes(kortBytes)[0]!,
      kort: E1Agent.fraBytes(kortBytes),
      vaktflagg: "abmp",
      bud: tolkBudmodell(budJson),
      budterskel: -3.0,
      vraknett: nettFraBytes(vrakBytes)[0]!,
      vrakflagg: "telrd",
      søk: { type: "sik", verdener: 8, sigma: 0.5 },
      eksakt: { terskel: 3, lagmål: true },
    }),
  );
  const spek = [0, 1, 2, 3].map(() => lagIndre(SPEK) as unknown as Velger);

  let s: GameState = opprettSpill({ antallSpillere: 4 }, 61_000_011);
  let valg = 0;
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 20_000 && s.rundeNr < 2) {
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const ha = spek[iTur]!.velgHandling(s);
    const hb = bygde[iTur]!.agent.velgHandling(s);
    assert.deepEqual(hb, ha, `divergens i runde ${s.rundeNr}, fase ${s.fase}, sete ${iTur} etter ${valg} valg`);
    valg++;
    s = utfør(s, ha).state;
  }
  assert.ok(valg > 25, `for få valg sammenlignet (${valg})`);
  const enumerert = bygde.reduce((n, b) => n + (b.eksakt?.telling.enumerert ?? 0), 0);
  assert.ok(enumerert > 0, "eksaktlaget slo aldri til – testen sammenlignet bare søket");
});
