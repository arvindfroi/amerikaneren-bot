/**
 * K6 — «lære seg andre spillere sine vaner ila spillet og tilpasse seg og
 * utnytte de».
 *
 * Testene her er den delen av prøven som IKKE trenger statistikk. De svarer på
 * fem spørsmål, i den rekkefølgen de må besvares:
 *
 *   1. Har den stiliserte motstanderen i det hele tatt en vane? En prøve mot en
 *      motpart uten vane måler ingenting uansett hvor pene tallene blir.
 *   2. Ser Adams vanen når han spiller? (Nei — profilboka fylles aldri.)
 *   3. Er `okt:` dermed bit-identisk med å ha laget AV? (Ja — og det gjør enhver
 *      måling av «okt: mot uten okt:» til en måling av ingenting.)
 *  3b. Ville økten nådd søket om boka HADDE vært full? (Nei — `vr:` kutter
 *      kontekstkjeden, og `vr:` står mellom `okt:` og `amu:` i V6 og V7.)
 *   4. VILLE han sett vanen om begge koblingene var hele? (Ja, men først etter
 *      tolv runder, ikke etter fire.)
 *
 * Punkt 2, 3 og 3b er prøvens «kan den feile»-halvdel, og de feiler. Hvert av
 * de tre bruddene er alene nok til å gjøre K6 eksakt null, og de er uavhengige:
 * å fikse ett av dem endrer ingenting.
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import { lovligeKort, opprettSpill, utfør, type GameState } from "../src/index.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { MIN_RUNDER, type Økt } from "../src/moe2/okt.ts";
import { ARMER, lagTrumftrekker, spillKamp, stigning, type Arm } from "../examples/k6-vaner.ts";

const arm = (navn: string): Arm => {
  const a = ARMER.find((x) => x.navn === navn);
  if (a === undefined) throw new Error(`Ukjent arm «${navn}»`);
  return a;
};

/** Billig Adams MED søkelaget, så A2-kanalen (`motpartFor`) faktisk finnes. */
const ADAMS_MINI =
  "okt:vr:e1-modell/vrakrang.bin:telrd:amu:foerer:3k3m1:profil:" +
  "budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/** Samme stakk uten søk — nok når det bare er profilboka som skal fylles. */
const ADAMS_MINI_USOKT =
  "okt:vr:e1-modell/vrakrang.bin:telrd:profil:" +
  "budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

// ---------------------------------------------------------------------------
// 1. Har den stiliserte motstanderen en vane?
// ---------------------------------------------------------------------------

/** Andelen utspill fra `sete` som var trumf, når `sete` HADDE trumf å velge. */
function trumfutspillsrate(lagAgent: () => { velgHandling(s: GameState): unknown; nyKamp(): void }): number {
  const seter = [0, 1, 2, 3].map(() => lagAgent());
  for (const a of seter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, 810_000_101);
  let ledet = 0;
  let medTrumf = 0;
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 200_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 6) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    // Bare utspill der spilleren HAR trumf og mer enn ett lovlig kort teller —
    // ellers måler vi kortfordelingen og ikke vanen.
    const teller =
      s.fase === "SPILL" && s.bord.length === 0 && s.trumf !== null && s.stikkSpilt > 0;
    const lov = teller ? lovligeKort(s, iTur) : [];
    const kanTrumfe = teller && lov.length > 1 && lov.some((k) => k.farge === s.trumf);
    const h = seter[iTur]!.velgHandling(s) as { type: string; kort?: { farge: string } };
    if (kanTrumfe) {
      ledet++;
      if (h.kort?.farge === s.trumf) medTrumf++;
    }
    s = utfør(s, h as never).state;
  }
  assert.ok(ledet >= 10, `for få utspill å måle på (${ledet})`);
  return medTrumf / ledet;
}

test("K6: den stiliserte motstanderen har vanen, den nøytrale har den ikke", () => {
  const stil = trumfutspillsrate(() => lagTrumftrekker(ADAMS_MAALT));
  const nøytral = trumfutspillsrate(() => lagIndre(ADAMS_MAALT));
  // Trumftrekkeren skal være maksimal. Uten dette er hele prøven en måling mot
  // en motstander som ikke har den vanen vi later som vi utnytter.
  assert.equal(stil, 1, `trumftrekkeren ledet trumf i bare ${(stil * 100).toFixed(0)} % av utspillene`);
  // Og den nøytrale må ligge klart lavere, ellers er de to armene samme bot.
  assert.ok(
    nøytral < 0.6,
    `den nøytrale ledet trumf i ${(nøytral * 100).toFixed(0)} % — da er det ingen vane å skille dem på`,
  );
});

// ---------------------------------------------------------------------------
// 2. Ser Adams vanen når han spiller? — HOVEDFUNNET
// ---------------------------------------------------------------------------

test("K6: profilboka fylles ALDRI i en ekte spillsløyfe", () => {
  /**
   * `Profilbok.observer` returnerer straks med mindre fasen er RUNDE_SLUTT, og
   * ingen spillsløyfe i repoet ber en agent om en handling i den fasen —
   * verken `examples/kamp.ts` eller `web/app.ts`. Profilagenten kan derfor
   * aldri bokføre noe, uansett hvor lenge en økt varer.
   *
   * `test/profilagent.test.ts` kaller `bok.observer(s)` for hånd i sine egne
   * sløyfer og er grønn. Det er nettopp forskjellen på «noe finnes» og «noe
   * fyrer».
   */
  const rader = spillKamp(arm("okt-som-i-dag"), "stilisert", 810_000_201, 0, {
    målPoeng: 9999,
    maksRunder: 14,
    adams: ADAMS_MINI_USOKT,
    basis: ADAMS_MAALT,
  });
  assert.ok(rader.length >= 12, `fikk bare ${rader.length} runder`);
  for (const r of rader) {
    assert.equal(r.bokRunder, 0, `runde ${r.rundeNr}: boka hadde ${r.bokRunder} runder — koblingen er hel`);
    assert.equal(r.aggressivitet, null, `runde ${r.rundeNr}: økten leste en stil`);
    assert.equal(r.vriAktiv, false, `runde ${r.rundeNr}: A2-vrien fyrte`);
  }
});

// ---------------------------------------------------------------------------
// 3. Er `okt:` dermed bit-identisk med «av»?
// ---------------------------------------------------------------------------

test("K6: «okt:» spiller bit-identisk med å ha laget av", () => {
  /**
   * Nullpunktet skal være bit-identisk med «av» NÅR ØKTEN IKKE VET NOE — det er
   * regelen. Her er den oppfylt av feil grunn: økten vet aldri noe, så
   * `motpartFor` returnerer alltid `basis` uendret, og de to armene er samme
   * bot i hver eneste stilling.
   *
   * Konsekvensen er skarp: enhver måling som sammenlikner en spek MED `okt:`
   * mot en UTEN, måler ren støy fra frøet. Speken må ha `amu:` for at
   * påstanden skal bety noe — uten søkelag finnes ikke A2-kanalen i det hele
   * tatt, og likheten ville vært triviell.
   */
  const med = spillKamp(arm("okt-som-i-dag"), "stilisert", 810_000_301, 0, {
    målPoeng: 9999,
    maksRunder: 5,
    adams: ADAMS_MINI,
    basis: ADAMS_MAALT,
  });
  const uten = spillKamp(arm("uten-okt"), "stilisert", 810_000_301, 0, {
    målPoeng: 9999,
    maksRunder: 5,
    adams: ADAMS_MINI,
    basis: ADAMS_MAALT,
  });
  assert.equal(med.length, uten.length);
  assert.ok(med.length >= 4);
  assert.deepEqual(
    med.map((r) => [r.rundeNr, r.adamsPoeng, r.andreSnitt]),
    uten.map((r) => [r.rundeNr, r.adamsPoeng, r.andreSnitt]),
    "armene skiller lag — da fyrer okt: faktisk, og hovedfunnet er feil",
  );
});

// ---------------------------------------------------------------------------
// 3b. Når `okt:` ligger over `vr:`, når konteksten aldri fram i det hele tatt
// ---------------------------------------------------------------------------

/** Stillinger der sete 0 skal legge kort og har mer enn ett lovlig valg. */
function samleStillinger(antall: number, frø: number): GameState[] {
  const seter = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
  for (const a of seter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, frø);
  const ut: GameState[] = [];
  let vakt = 0;
  while (s.fase !== "FERDIG" && ut.length < antall && vakt++ < 200_000) {
    if (s.fase === "RUNDE_SLUTT") {
      if (s.rundeNr + 1 >= 12) break;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL" && iTur === 0 && lovligeKort(s, 0).length > 1) ut.push(s);
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  return ut;
}

/** Kortene en spek velger i hver stilling, som sammenliknbare strenger. */
function valg(spek: string, økt: Økt | null, st: readonly GameState[]): string[] {
  const a = lagIndre(spek, økt === null ? {} : { økt });
  a.nyKamp();
  return st.map((s) => {
    const h = a.velgHandling(s) as { type: string; kort?: { farge: string; verdi: number } };
    return h.kort === undefined ? h.type : `${h.kort.farge}${h.kort.verdi}`;
  });
}

/** En økt som har sett en trumftrekker lenge nok til å ha en mening om ham. */
function lagØktSomHarLært(): Økt {
  let holdt: Økt | null = null;
  spillKamp(arm("okt-matet"), "stilisert", 810_000_501, 0, {
    målPoeng: 9999,
    maksRunder: 26,
    adams: ADAMS_MINI_USOKT,
    basis: ADAMS_MAALT,
    kikk: (o) => {
      if (o !== null) holdt = o;
    },
  });
  if (holdt === null) throw new Error("fikk ingen økt ut av kampen");
  return holdt;
}

test("K6: «vr:» kutter kontekstkjeden, så okt: i ADAMS_V7 aldri når søket", () => {
  /**
   * TREDJE BRUDD, uavhengig av de to over.
   *
   * `lagIndre` sender `ctx` videre gjennom `vakt:`, `budm:`, `amu:`, `ork:` og
   * `eks:` — men IKKE gjennom `vr:`:
   *
   *     return new Vrakrangerer(lagIndre(rest.slice(b + 1)), nett, ...);
   *                             ^ ingen ctx
   *
   * `ADAMS_V6` og `ADAMS_V7` er begge skrevet `okt:vr:...:amu:...:profil:...`.
   * Vrakrangereren står altså MELLOM økten og alt som skulle brukt den. Verken
   * `amu` (som skulle fått `motpartFor`) eller `profil` (som skulle fylt
   * øktens bok) ser den noensinne. `okt:`-laget lager et objekt ingen leser.
   *
   * Testen måler det på ATFERD, ikke på kilden: samme spek, samme stillinger,
   * én gang med en økt som HAR lært og én gang uten.
   */
  const stillinger = samleStillinger(14, 810_000_601);
  assert.ok(stillinger.length >= 10, `fikk bare ${stillinger.length} stillinger`);
  const lært = lagØktSomHarLært();
  assert.notEqual(lært.aggressivitet(1), null, "økten lærte ingenting — da måler testen ingenting");

  const utenVr = "amu:alle:8k12m1:profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";
  const medVr = `vr:e1-modell/vrakrang.bin:telrd:${utenVr}`;

  // KANALEN VIRKER når konteksten får lov å nå fram: A2 vrir rollout-policyen,
  // og minst én stilling får et annet kort.
  const a = valg(utenVr, lært, stillinger);
  const b = valg(utenVr, null, stillinger);
  assert.notDeepEqual(a, b, "økten endret ingenting selv uten vr: — da finnes ikke A2-kanalen i det hele tatt");

  // MEN MED `vr:` FORAN er de to bit-identiske: konteksten kom aldri fram.
  const c = valg(medVr, lært, stillinger);
  const d = valg(medVr, null, stillinger);
  assert.deepEqual(c, d, "vr: slipper konteksten gjennom likevel — da er funnet feil");
});

// ---------------------------------------------------------------------------
// 4. Ville han sett vanen om koblingen var hel?
// ---------------------------------------------------------------------------

test("K6: matet fra sløyfen leser økten trumftrekkeren riktig — men altfor sent", () => {
  const stil = spillKamp(arm("okt-matet"), "stilisert", 810_000_401, 0, {
    målPoeng: 9999,
    maksRunder: 26,
    adams: ADAMS_MINI_USOKT,
    basis: ADAMS_MAALT,
  });
  const nøytral = spillKamp(arm("okt-matet"), "noytral", 810_000_401, 0, {
    målPoeng: 9999,
    maksRunder: 26,
    adams: ADAMS_MINI_USOKT,
    basis: ADAMS_MAALT,
  });

  const lest = stil.filter((r) => r.aggressivitet !== null);
  assert.ok(lest.length > 0, "økten leste aldri en stil, selv matet over 26 runder");
  /**
   * Trumftrekkeren skal leses som klart aggressiv. Ikke eksakt +1, og grunnen
   * er ekte og ikke en slark i vanen: `ledetTrumf` bokføres bare for runder der
   * setet både var i FORSVAR og selv kom på utspill, og i en av de rundene var
   * setet renons i trumf. Vanen er maksimal; observasjonene er det ikke.
   * Terskelen som betyr noe er `|a| ≥ 0,2` — der slår A2-vrien inn.
   */
  const sisteStil = lest[lest.length - 1]!.aggressivitet!;
  assert.ok(sisteStil >= 0.6, `leste aggressivitet ${sisteStil.toFixed(2)}, forventet klart positiv`);
  assert.equal(lest[lest.length - 1]!.vriAktiv, true, "A2-vrien fyrte ikke selv med stilen lest");

  /**
   * Og den nøytrale må leses ANNERLEDES — ellers skiller ikke modellen folk.
   *
   * MARGINEN ER SMALERE ENN DEN SER UT: målt her leses den nøytrale — vår egen
   * `ADAMS_MAALT` — til +0,29, altså ALT over vriterskelen på 0,2. `BEFOLKNING
   * .trumfutspill = 0,14` er hentet fra menneskedata, men nullpunktet i
   * `aggressivitet` er hardkodet til 0,5. Mot vår egen bot fyrer A2-vrien
   * derfor selv når det ikke er noen vane å utnytte, og hele skalaen mellom
   * «nøytral» og «trumftrekker» er 0,29 til 0,75 i stedet for 0 til 1.
   */
  const nLest = nøytral.filter((r) => r.aggressivitet !== null);
  if (nLest.length > 0) {
    const sisteNøytral = nLest[nLest.length - 1]!.aggressivitet!;
    assert.ok(
      sisteStil - sisteNøytral > 0.35,
      `stilisert ${sisteStil.toFixed(2)} mot nøytral ${sisteNøytral.toFixed(2)} — modellen skiller dem ikke`,
    );
  }

  /**
   * MIN_RUNDER TELLER I FEIL VALUTA, og det er et eget funn.
   *
   * `Økt.aggressivitet` krever `bok.runder(sete) ≥ MIN_RUNDER`, og
   * `Profilbok.runder` returnerer `profil.bud.n` — antall runder setet FAKTISK
   * MELDTE, ikke antall runder det satt ved bordet. Et sete som passer teller
   * ikke. Terskelen «fire runder» blir derfor i praksis tolv til femten runder,
   * altså omtrent en hel kamp til 100 poeng.
   */
  const førsteLeste = stil.findIndex((r) => r.aggressivitet !== null);
  assert.ok(
    førsteLeste > MIN_RUNDER,
    `stilen ble lest allerede i runde ${førsteLeste} — da teller MIN_RUNDER runder, ikke bud`,
  );
});

// ---------------------------------------------------------------------------
// 5. Måltallet selv
// ---------------------------------------------------------------------------

test("K6: stigningstallet er null på flat gevinst og positivt på voksende", () => {
  const r = [0, 1, 2, 3, 4, 5, 6, 7];
  assert.equal(stigning(r, r.map(() => 3)).b, 0);
  const voksende = stigning(r, r.map((x) => 2 * x));
  assert.ok(Math.abs(voksende.b - 2) < 1e-9, `fikk ${voksende.b}`);
});
