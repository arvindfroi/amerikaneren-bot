import { strict as assert } from "node:assert";
import { test } from "node:test";

import { lovligeKort, opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { likeKort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/agent.ts";
import { kortTilInt } from "../src/solver/dds.ts";
import { infererRenonce } from "../src/solver/sampler.ts";
import {
  eksaktBesteKort,
  enumerer,
  klasser,
  lesInformasjon,
  råAntall,
  tellKonfigurasjoner,
  tellVerdener,
} from "../src/solver/eksakt.ts";
import { EksaktSluttspill, delEksaktSpek, eksaktKort } from "../src/moe2/eksaktagent.ts";

/**
 * Testene låser DEN ENE PÅSTANDEN som skiller eksakt enumerasjon fra en
 * sampling i forkledning: at alle verdener som er forenlige med spillerens
 * informasjon faktisk blir besøkt, hverken flere eller færre.
 *
 * Derfor er kontrollen bygget to ganger, uavhengig: `enumerer` går over
 * KLASSEKONFIGURASJONER og vekter hver med hvor mange verdener den står for,
 * mens `tellVerdener` teller de samme verdenene kort for kort med dynamisk
 * programmering. De to deler ingen kode. Er de like på hver eneste stilling,
 * er både oppregningen og vektene riktige – tar én av dem feil, spriker de.
 *
 * Resten av testene låser grensene: at hver besøkt verden faktisk ER lovlig
 * (håndstørrelser, renonser, det etterlyste kortet hos en levende spiller,
 * egen hånd urørt), og at agenten ikke rører kortvalg utenfor terskelen.
 */

const nevro = new NevroAgent();

/** Spiller fram til en SPILL-stilling med nøyaktig `igjen` stikk igjen. */
function stillingMed(frø: number, igjen: number): GameState | null {
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    if (s.fase === "SPILL" && s.iTur !== null && s.giving.antallStikk - s.stikkSpilt === igjen) {
      return s;
    }
    s = utfør(s, nevro.velgHandling(s)).state;
  }
  return null;
}

/** Et knippe ekte sluttspillstillinger fra ulike givinger og dybder. */
function stillinger(igjen: number, antall: number): GameState[] {
  const ut: GameState[] = [];
  for (let f = 0; ut.length < antall && f < antall * 6; f++) {
    const s = stillingMed(7_100_000 + f, igjen);
    if (s !== null) ut.push(s);
  }
  return ut;
}

test("enumerasjonen dekker HELE rommet: vektsummen er lik en uavhengig DP-telling", () => {
  // Dette er kontrollen hele metoden hviler på. `enumerer` og `tellVerdener`
  // deler ingen kode: den ene går over klassekonfigurasjoner med
  // multinomialvekter, den andre kort for kort over gjenstående kapasitet.
  let sjekket = 0;
  for (const igjen of [1, 2, 3]) {
    for (const s of stillinger(igjen, 6)) {
      for (let sete = 0; sete < s.antallSpillere; sete++) {
        const info = lesInformasjon(s, sete);
        const e = enumerer(info, () => {});
        assert.ok(e.full, "uten tak skal enumerasjonen alltid bli full");
        assert.equal(
          e.verdener,
          tellVerdener(info),
          `stikk igjen ${igjen}, sete ${sete}: enumerasjonen dekket ${e.verdener} verdener, DP-tellingen fant ${tellVerdener(info)}`,
        );
        assert.ok(e.verdener > 0, "minst den virkelige givingen må være forenlig");
        sjekket++;
      }
    }
  }
  assert.ok(sjekket >= 40, `for få stillinger sjekket (${sjekket})`);
});

test("den virkelige givingen er blant verdenene som enumereres", () => {
  // Den sterkeste enkeltkontrollen på at rommet ikke er for SMALT: den
  // fordelingen som faktisk ligger på bordet må være blant dem vi dekker.
  // Ellers har informasjonsbildet utelukket sannheten, og da er «eksakt» verre
  // enn ubrukelig – den er systematisk feil.
  //
  // «Blant» betyr her opp til EKVIVALENS, og det er ikke en oppmykning av
  // kravet. Enumerasjonen besøker én representant per klassekonfigurasjon,
  // fordi kort i samme klasse ikke lar seg skille av noen – verken av
  // reglene, motstanderne eller løseren – og verdener som bare bytter om på
  // dem har identisk verdi. Det som må gjenfinnes er derfor den ekte
  // givingens SIGNATUR: hvor mange kort fra hver klasse hver hånd har.
  // Krevde vi de samme kortene, ville testen målt en tilfeldighet i hvilken
  // representant vi tilfeldigvis deler ut først.
  for (const igjen of [1, 2, 3]) {
    for (const s of stillinger(igjen, 4)) {
      for (let sete = 0; sete < s.antallSpillere; sete++) {
        const info = lesInformasjon(s, sete);
        const kl = klasser(info);
        const klasseAv = new Map<number, number>();
        for (let i = 0; i < kl.length; i++) for (const c of kl[i]!.kort) klasseAv.set(c, i);
        /** signatur[spiller][klasse] = antall kort derfra på hånden. */
        const signatur = (hender: readonly (readonly number[])[]): string => {
          const m = s.hender.map(() => new Array<number>(kl.length).fill(0));
          for (let p = 0; p < s.antallSpillere; p++) {
            for (const c of hender[p] ?? []) {
              const i = klasseAv.get(c);
              if (i !== undefined) m[p]![i]!++;
            }
          }
          return m.map((r) => r.join(",")).join("|");
        };
        const fasit = signatur(s.hender.map((h) => h.map(kortTilInt)));
        let funnet = false;
        enumerer(info, (hender) => {
          if (!funnet && signatur(hender) === fasit) funnet = true;
        });
        assert.ok(
          funnet,
          `stikk igjen ${igjen}, sete ${sete}: den ekte givingen manglet i enumerasjonen`,
        );
      }
    }
  }
});

test("hver enumerert verden er LOVLIG: størrelser, renonser, etterlyst og egen hånd", () => {
  for (const s of stillinger(3, 4)) {
    const voids = infererRenonce(s);
    for (let sete = 0; sete < s.antallSpillere; sete++) {
      const info = lesInformasjon(s, sete);
      const egen = new Set(info.egen);
      let besøkt = 0;
      enumerer(
        info,
        (hender) => {
          besøkt++;
          // Observatørens egen hånd står urørt – vi evaluerer VÅR hånd.
          const min = hender[sete] ?? [];
          assert.equal(min.length, egen.size);
          for (const c of min) assert.ok(egen.has(c));
          for (let p = 0; p < s.antallSpillere; p++) {
            const h = hender[p] ?? [];
            assert.equal(h.length, s.hender[p]!.length, `hånd ${p} fikk feil antall kort`);
            if (p === sete) continue;
            for (const c of h) {
              assert.ok(!egen.has(c), "et kort på vår egen hånd havnet hos en motspiller");
              assert.ok(
                !voids[p]!.has(Math.floor(c / 13)),
                `spiller ${p} fikk en farge han er avslørt renonse i`,
              );
            }
          }
          // Ingen kort to steder.
          const alle = new Set<number>();
          for (const h of hender) for (const c of h) {
            assert.ok(!alle.has(c), "samme kort på to hender");
            alle.add(c);
          }
          // Det etterlyste kortet, når det ennå er usett, må ligge hos en LEVENDE
          // spiller – det kan aldri ha havnet i vraket.
          if (info.etterlystUsett !== null) {
            assert.ok(alle.has(info.etterlystUsett), "det etterlyste kortet forsvant ned i vraket");
          }
        },
        400,
      );
      assert.ok(besøkt > 0);
    }
  }
});

test("klassene deler de usette kortene i akkurat én bit hver", () => {
  for (const s of stillinger(3, 4)) {
    for (let sete = 0; sete < s.antallSpillere; sete++) {
      const info = lesInformasjon(s, sete);
      const sett = new Set<number>();
      for (const kl of klasser(info)) {
        for (const c of kl.kort) {
          assert.ok(!sett.has(c), "et kort havnet i to klasser");
          sett.add(c);
          assert.equal(Math.floor(c / 13), kl.farge, "klassen har kort fra feil farge");
        }
      }
      assert.deepEqual([...sett].sort((a, b) => a - b), [...info.usett].sort((a, b) => a - b));
    }
  }
});

test("informasjonen KRYMPER rommet: forenlige verdener ≤ råtallet", () => {
  // Renonse-inferens og det etterlyste kortets plassering kan bare fjerne
  // verdener, aldri legge til. Er det motsatt, leser vi informasjonen feil vei.
  let strengt = 0;
  for (const s of stillinger(3, 6)) {
    for (let sete = 0; sete < s.antallSpillere; sete++) {
      const info = lesInformasjon(s, sete);
      const v = tellVerdener(info);
      const rå = råAntall(info);
      assert.ok(v <= rå, `verdener ${v} > rå ${rå}`);
      if (v < rå) strengt++;
    }
  }
  assert.ok(strengt > 0, "ingen stilling ble faktisk krympet – da måler kontrollen ingenting");
});

test("taket stopper enumerasjonen, og den sier fra at den ikke er full", () => {
  // En avkortet enumerasjon er en skjev sampling, ikke en fasit. Det eneste som
  // holder metoden ærlig er at `full` blir false og at kalleren respekterer det.
  const s = stillinger(3, 1)[0]!;
  const info = lesInformasjon(s, s.iTur!);
  const helt = tellKonfigurasjoner(info);
  assert.ok(helt.full);
  if (helt.konfigurasjoner > 2) {
    const kappet = tellKonfigurasjoner(info, 2);
    assert.equal(kappet.full, false);
    assert.ok(kappet.konfigurasjoner <= 2);
    assert.ok(kappet.verdener < helt.verdener);
  }
});

test("det eksakte valget er et LOVLIG kort", () => {
  for (const s of stillinger(2, 6)) {
    const sete = s.iTur!;
    const svar = eksaktBesteKort(s, sete);
    assert.ok(svar !== null);
    const lovlige = lovligeKort(s, sete);
    assert.ok(lovlige.some((k) => likeKort(k, svar.kort)), "det eksakte valget var ikke lovlig");
    // Alle lovlige kort skal ha fått en verdi – ellers er noen kandidater tapt.
    assert.equal(svar.svar.vurderinger.length, lovlige.length);
    assert.equal(svar.svar.enumerasjon.verdener, svar.svar.fasitAntall);
  }
});

test("spesifikasjonen «eks:<terskel>:<indre>» leses, og avvises når den er ugyldig", () => {
  const d = delEksaktSpek("eks:3:vakt:at:e1:modell.bin");
  assert.ok(d !== null);
  assert.equal(d.valg.terskel, 3);
  assert.equal(d.indre, "vakt:at:e1:modell.bin");
  assert.equal(delEksaktSpek("nevro"), null);
  assert.equal(delEksaktSpek("vakt:at:nevro"), null);
  assert.throws(() => delEksaktSpek("eks:3"), /mangler indre kandidat/);
  assert.throws(() => delEksaktSpek("eks:0:nevro"), /Ugyldig terskel/);
  assert.throws(() => delEksaktSpek("eks:x:nevro"), /Ugyldig terskel/);
});

test("agenten rører IKKE kortvalg utenfor terskelen", () => {
  // Halve poenget med en terskel er at alt over den er urørt. Måles den
  // varianten mot kontrollen, skal forskjellen komme fra sluttspillet alene.
  const valg = { terskel: 2, maksKonfigurasjoner: 50_000 };
  let utenfor = 0;
  for (const s of stillinger(6, 5)) {
    const sete = s.iTur!;
    assert.equal(eksaktKort(s, sete, valg), null, "enumerasjonen slo til seks stikk før slutt");
    utenfor++;
  }
  assert.ok(utenfor >= 3);
});

test("agenten overstyrer bare SPILL, og lar bud, vrak og trumfvalg stå", () => {
  const agent = new EksaktSluttspill(nevro, { terskel: 3, maksKonfigurasjoner: 50_000 });
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 7_654_321);
  let vakt = 0;
  let ikkeSpill = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 20_000) {
    const fra = nevro.velgHandling(s);
    const h = agent.velgHandling(s);
    if (fra.type !== "SPILL") {
      assert.deepEqual(h, fra, "agenten rørte en handling som ikke er et kortvalg");
      ikkeSpill++;
    }
    s = utfør(s, h).state;
  }
  assert.ok(ikkeSpill > 0);
  // Den skal ha vært innom sluttspillet, ellers har testen ikke prøvd noe.
  assert.ok(agent.telling.innenfor > 0);
  assert.equal(agent.telling.avstått, 0, "med tre stikk igjen skal rommet alltid være overkommelig");
});

test("agenten er deterministisk: samme stilling gir samme kort", () => {
  // Enumerasjonen har ingen tilfeldighet i seg. Gir den to ulike svar på samme
  // stilling, ligger det en skjult tilstand et sted den ikke skal være.
  const valg = { terskel: 3, maksKonfigurasjoner: 50_000 };
  for (const s of stillinger(3, 5)) {
    const sete = s.iTur!;
    const a = eksaktKort(s, sete, valg);
    const b = eksaktKort(s, sete, valg);
    if (a === null) assert.equal(b, null);
    else {
      assert.ok(b !== null);
      assert.ok(likeKort(a, b), "to kall ga ulike kort");
    }
  }
});
