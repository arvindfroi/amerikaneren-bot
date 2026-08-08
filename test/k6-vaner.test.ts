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
 *  3b. Ville økten nådd søket om boka HADDE vært full? (Den gjorde det ikke da
 *      prøven ble skrevet: `vr:` droppet `ctx`, og `vr:` står mellom `okt:` og
 *      `amu:` i både V6 og V7. Feilen er siden rettet i `agentspek.ts`, og
 *      testen står igjen som VAKT mot at den kommer tilbake.)
 *   4. VILLE han sett vanen om resten av koblingen var hel? (Ja, men først
 *      etter tolv runder, ikke etter fire.)
 *
 * Punkt 2, 3 og 3b er prøvens «kan den feile»-halvdel. To av dem feiler ennå:
 * boka fylles aldri (2), og terskelen teller bud i stedet for runder (4). Hvert
 * av bruddene er alene nok til å gjøre K6 eksakt null, og de er uavhengige — å
 * rette ett av dem endrer ingenting så lenge de andre står.
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

test("K6: profilboka FYLLES naa i en ekte spilloeyfe", () => {
  /**
   * DENNE TESTEN DOKUMENTERTE EN FEIL, OG DEN ER RETTET.
   *
   * `Profilbok.observer` returnerer straks med mindre fasen er RUNDE_SLUTT, og
   * INGEN spilloeyfe i repoet ba en agent om en handling i den fasen - verken
   * `examples/kamp.ts` eller `web/app.ts`. Profilagenten kunne derfor aldri
   * bokfoere noe, uansett hvor lenge en oekt varte. Maalt: 0 runder.
   *
   * `test/profilagent.test.ts` kalte `bok.observer(s)` for haand i sine egne
   * sloeyfer og var groenn. Det er noeyaktig forskjellen paa «noe finnes» og
   * «noe fyrer» - og en test som trenger en krykke for aa faa en komponent til
   * aa virke, er selve varselet.
   *
   * `Spekagent` har naa en valgfri `observer(state)`, videresendt av `okt:`,
   * `vr:` og `amu:`, og `kamp.ts` kaller den foer NESTE.
   */
  const rader = spillKamp(arm("okt"), "stilisert", 810_000_201, 0, {
    målPoeng: 9999,
    maksRunder: 14,
    adams: ADAMS_MINI_USOKT,
    basis: ADAMS_MAALT,
  });
  assert.ok(rader.length >= 12, `fikk bare ${rader.length} runder`);
  const sisteBok = rader[rader.length - 1]?.bokRunder ?? 0;
  assert.ok(
    sisteBok > 0,
    `boka hadde ${sisteBok} runder etter ${rader.length} spilte. Da naar ikke ` +
      `bokfoeringskroken gjennom stakken, og K6 er umaalbar paa kampbenken.`,
  );
  // Og med telleren rettet fra `bud.n` til `bydde.n` skal terskelen naas
  // INNENFOR en normal kamp, ikke rundt runde tolv.
  assert.ok(
    rader.some((r) => r.aggressivitet !== null),
    `oekten leste ALDRI en stil paa ${rader.length} runder. MIN_RUNDER = 4 ` +
      `skal naas rundt runde fire naar telleren teller RUNDER og ikke BUD.`,
  );
});

// ---------------------------------------------------------------------------
// 3. Er `okt:` dermed bit-identisk med «av»?
// ---------------------------------------------------------------------------

test("K6: «okt:» ENDRER spillet naar det finnes en vane - og bare da", () => {
  /**
   * ============ DENNE TESTEN ER SNUDD, OG DET ER POENGET ==============
   *
   * Foer sto den motsatt vei: den LAASTE at `okt:` spilte bit-identisk med aa
   * ha laget av. Kommentaren sa hvorfor: «oekten vet aldri noe, saa
   * motpartFor returnerer alltid basis uendret». Det var en laas paa en kjent
   * defekt, ikke paa en oensket egenskap - og konsekvensen sto der ogsaa:
   * enhver maaling som sammenlignet en spek MED `okt:` mot en UTEN, maalte ren
   * stoey fra froeet.
   *
   * Med residualmaalet (`stilbias.ts`) vet oekten noe. Kravet er derfor det
   * Arvind ba om, i to halvdeler som begge maa holde:
   *
   *   MOT EN VANE      armene skal skille lag - ellers laerer den ingenting
   *   FOER BEVISET     de skal vaere identiske - ellers fyrer den paa stoey
   *
   * Den andre halvdelen er den viktigste. Den gamle detektoren hadde bestaatt
   * den foerste og strauket paa den andre (§108: fire identiske agenter
   * spredte seg -0,45..+0,17).
   */
  const kjør = (
    arm_: string,
    runder: number,
    motstander: "stilisert" | "noytral" = "stilisert",
  ): ReturnType<typeof spillKamp> =>
    spillKamp(arm(arm_), motstander, 810_000_301, 0, {
      målPoeng: 9999,
      maksRunder: runder,
      adams: ADAMS_MINI,
      basis: ADAMS_MAALT,
    });

  // HALVDEL 1: med nok runder mot en trumftrekker maa hukommelsen gjoere noe.
  const medL = kjør("okt", 20);
  const utenL = kjør("uten-okt", 20);
  assert.ok(medL.length >= 8, `for faa runder spilt (${medL.length})`);
  const likeLange = Math.min(medL.length, utenL.length);
  const ulike = Array.from({ length: likeLange }).filter(
    (_, i) =>
      medL[i]!.adamsPoeng !== utenL[i]!.adamsPoeng ||
      medL[i]!.andreSnitt !== utenL[i]!.andreSnitt,
  ).length;
  assert.ok(
    ulike > 0,
    `armene var identiske i alle ${likeLange} runder mot en stilisert ` +
      `trumftrekker. Da laerer «okt:» ingenting, og enhver maaling som ` +
      `sammenligner med og uten den maaler bare froeet.`,
  );

  /**
   * HALVDEL 2, NULLARMEN: mot en NOEYTRAL motstander - vaar egen bot, uten
   * vane - skal armene vaere bit-identiske uansett hvor lenge det spilles.
   *
   * Jeg proevde foerst «faa runder mot trumftrekkeren» som nullarm, og den
   * skilte lag alt etter tre runder. Det var ikke stoey: med ~10 observasjoner
   * per runde per sete er 30 nok til aa slaa 2 SE mange ganger naar residualet
   * er +0,6. Detektoren er rett og slett rask mot en aapenbar vane, og
   * nullarmen var feil valgt.
   *
   * DETTE er den ekte nullen: ingen vane, altsaa ingenting aa laere, altsaa
   * ingen forskjell. Det er der den gamle detektoren strauk.
   */
  const medN = kjør("okt", 20, "noytral");
  const utenN = kjør("uten-okt", 20, "noytral");
  assert.ok(medN.length >= 8, `for faa runder i nullarmen (${medN.length})`);
  assert.deepEqual(
    medN.map((r) => [r.rundeNr, r.adamsPoeng, r.andreSnitt]),
    utenN.map((r) => [r.rundeNr, r.adamsPoeng, r.andreSnitt]),
    "armene skilte lag mot en motstander UTEN vane. Da vrir hukommelsen " +
      "soeket paa stoey - noeyaktig feilen §108 maalte.",
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
  spillKamp(arm("okt"), "stilisert", 810_000_501, 0, {
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

test("K6: konteksten naar gjennom «vr:» - okt: er koblet i hele stakken", () => {
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
   * FEILEN ER RETTET. Alle sju kall som droppet `ctx` (`vr:`, `sik:`, `vv:`,
   * `vv2:`, `etl:`, `juks:` og `profil:`s indre) sender den naa videre.
   *
   * Testen maaler paa ATFERD, ikke paa kilden: samme spek, samme stillinger,
   * én gang med en oekt som HAR laert og én gang uten. Kravet er snudd - naa
   * skal `vr:` IKKE gjoere noen forskjell for om oekten naar fram.
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

  // OG MED `vr:` FORAN skal den fortsatt naa fram. Er c og d bit-identiske,
  // har noen sluttet aa sende `ctx` gjennom vr-grenen igjen, og hele
  // oektminnet er doed kode i ADAMS_V6/V7.
  const c = valg(medVr, lært, stillinger);
  const d = valg(medVr, null, stillinger);
  assert.notDeepEqual(
    c,
    d,
    "«vr:» kutter kontekstkjeden igjen - okt: naar ikke soeket i ADAMS_V7, og " +
      "hele oektminnet er da doed kode i den spekken vi maaler med",
  );
});

// ---------------------------------------------------------------------------
// 4. Ville han sett vanen om koblingen var hel?
// ---------------------------------------------------------------------------

test("K6: oekten leser trumftrekkeren, og naa i tide", () => {
  const stil = spillKamp(arm("okt"), "stilisert", 810_000_401, 0, {
    målPoeng: 9999,
    maksRunder: 26,
    adams: ADAMS_MINI_USOKT,
    basis: ADAMS_MAALT,
  });
  const nøytral = spillKamp(arm("okt"), "noytral", 810_000_401, 0, {
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
  /**
   * TERSKELEN ER 0,2, IKKE 0,6 - og forskjellen er en FIKS, ikke en oppmykning.
   *
   * `Økt.aggressivitet` hadde en HARD andre terskel: `trumfutspill.n <
   * MIN_RUNDER` ga null. Maalt vokser `bydde.n` hver runde (1,2,...,9) mens
   * `trumfutspill.n` vokser til **1 og stopper** - saa den doeren kunne aldri
   * aapnes, og hele K6 var umaalbar uansett hvor godt resten virket.
   *
   * Doeren er byttet mot KRYMPING (`tiltro(t) = n/(n+k)`), som er mekanismen
   * prosjektet ellers bruker for «hvor mye skal vi tro paa dette». Utslaget
   * vokser da gradvis med observasjonene i stedet for aa hoppe fra null til
   * fullt - og det DEMPER tallet med vilje.
   *
   * 0,6 var kalibrert til den ukrympede verdien. Terskelen som faktisk betyr
   * noe staar i kommentaren over: |a| >= 0,2 er der A2-vrien slaar inn, og
   * `vriAktiv` under haandhever at den faktisk gjorde det.
   */
  const sisteStil = lest[lest.length - 1]!.aggressivitet!;
  assert.ok(
    sisteStil >= 0.2,
    `leste aggressivitet ${sisteStil.toFixed(2)}, forventet over vriterskelen 0,2`,
  );
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
    /**
     * KRITERIET ER VRITERSKELEN, ikke en absolutt avstand.
     *
     * `> 0,35` var kalibrert til de UKRYMPEDE tallene. Krympingen
     * (`tiltro(t) = n/(n+k)`) demper begge armene proporsjonalt, saa en
     * absolutt avstand maaler hvor mange observasjoner vi har - ikke om
     * modellen skiller stilene.
     *
     * Det som betyr noe operasjonelt er om de havner paa HVER SIN SIDE av
     * 0,2: da vrir A2 rollout-policyen mot trumftrekkeren og lar den noeytrale
     * vaere. Det er hele forskjellen mellom «utnytter en vane» og «gjetter».
     */
    assert.ok(
      sisteStil >= 0.2 && sisteNøytral < 0.2,
      `stilisert ${sisteStil.toFixed(2)} mot nøytral ${sisteNøytral.toFixed(2)} — de skal ` +
        `havne paa hver sin side av vriterskelen 0,2, ellers vrir A2 likt mot begge`,
    );
  }

  /**
   * MIN_RUNDER TELTE I FEIL VALUTA, OG DET ER RETTET.
   *
   * `Profilbok.runder` returnerte `profil.bud.n` - antall runder setet FAKTISK
   * MELDTE, ikke antall runder det satt ved bordet. Et sete som passet telte
   * ikke, saa terskelen «fire runder» ble i praksis tolv til femten - omtrent
   * en hel kamp til 100 poeng. OEktminnet aktiverte seg altsaa aldri.
   *
   * Den returnerer naa `bydde.n`, som oeker hver observerte runde. Maalt:
   * bydde.n 1,2,3,...,9 mot bud.n 1,1,1,1,2,2,2,3,4.
   *
   * Denne testen ba uttrykkelig om aa bli snudd naar det skjedde: naa krever
   * den at stilen leses I TIDE, altsaa innenfor de foerste rundene av en kamp
   * og ikke naar den er over.
   */
  const førsteLeste = stil.findIndex((r) => r.aggressivitet !== null);
  assert.ok(
    førsteLeste >= 0 && førsteLeste <= MIN_RUNDER + 2,
    `stilen ble foerst lest i runde ${førsteLeste}. Med telleren rettet skal den ` +
      `leses rundt runde ${MIN_RUNDER} - er den sen igjen, teller MIN_RUNDER bud ` +
      `i stedet for runder, og oektminnet aktiverer seg aldri i en normal kamp.`,
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
