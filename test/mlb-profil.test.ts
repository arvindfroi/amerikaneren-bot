/**
 * SPILLERPROFILEN — at den bærer riktig, og at den ikke bærer for mye.
 *
 * Eieren flyttet K2.5 og K6.7 den 12. september: lagring på tvers av kamper er
 * lov. Den nye regelen er SMALERE enn «alt er lov», og det er den smale delen
 * som må voktes, for den brede delen vokter ingen:
 *
 *   1. NULLPUNKTET      uten profil er boka bit-identisk med `new Hukommelse()`,
 *                       og `rabatt = 0` er også bit-identisk. FELLE: en profil
 *                       med rabatt MÅ flytte vektoren, ellers måler prøven at
 *                       ingenting virker.
 *   2. BARE FERDIGE RUNDER   profilen bygges av `Hukommelse`, som ikke bokfører
 *                       før `RUNDE_SLUTT`. Prøven mater hele den PÅGÅENDE runden
 *                       og krever en tom profil. FELLE: en bok som får
 *                       rundeslutt gir en profil som IKKE er tom.
 *   3. SKJULT INFO      de skjulte hendene i den pågående runden byttes ut under
 *                       bokføringen — profilen må være bit-identisk. FELLE: en
 *                       «kikker» som bokfører fra hendene blir tatt av samme løkke.
 *   4. FERSKVEKTENE BÆRES IKKE   `ferskResidual`/`ferskBudavvik` har halveringstid
 *                       tre runder, og «akkurat nå» fra i går er ikke ferskt.
 *   5. SAMMENSLÅINGEN   to kamper slått sammen skal gi NØYAKTIG det én samlet
 *                       strøm gir. FELLE: den naive råsum-formen for samvariasjon
 *                       gir et annet svar, og prøven regner den ut for å vise det.
 *   6. INGEN LEDD FALLER UTENFOR   et nytt tall i `Setebok` må klassifiseres som
 *                       båret eller ikke-båret; ellers blir denne rød.
 *   7. NAVN OG STIER    `gyldigId` avviser et fornavn og avviser «../».
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import {
  Hukommelse,
  korrelasjon,
  snitt,
  tomSetebok,
  TOM_FERSK,
  type Samvar,
} from "../src/mlb/hukommelse.ts";
import {
  BÅRNE_LEDD,
  BÅRNE_SAMVAR,
  bidragFraBok,
  gyldigId,
  IKKE_BÅRNE,
  lesProfil,
  lagBokfrø,
  oppdaterProfil,
  profilIder,
  skrivProfil,
  slåSammen,
  startbok,
  såBok,
  tomProfil,
} from "../src/mlb/profil.ts";

/** Rent nett, ingen søk: samme stilling gir alltid samme trekk. */
const SPEK = "nevro";

/** Spiller `runder` runder og gir HVER tilstand, i rekkefølge. */
function kampens(runder: number, frø = 90_120_001): GameState[] {
  const ag = [0, 1, 2, 3].map(() => lagIndre(SPEK));
  for (const a of ag) a.nyKamp?.();
  let s = opprettSpill({ antallSpillere: 4, målPoeng: 10_000 }, frø);
  const ut: GameState[] = [];
  let vakt = 0;
  while (s.rundeNr < runder && s.fase !== "FERDIG" && vakt++ < 20_000) {
    ut.push(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const i = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (i === null || i === undefined) break;
    s = utfør(s, ag[i]!.velgHandling(s)).state;
  }
  ut.push(s);
  return ut;
}

const bokAv = (st: readonly GameState[]): Hukommelse => {
  const b = new Hukommelse();
  for (const s of st) b.observer(s);
  return b;
};

const like = (a: Float64Array, b: Float64Array): number => {
  let ulik = 0;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) ulik++;
  return ulik;
};

// ===========================================================================
// 1. Nullpunktet
// ===========================================================================

test("NULLPUNKT: uten profil er boka bit-identisk med new Hukommelse()", () => {
  const st = kampens(3);
  const uten = bokAv(st);
  const tom = new Hukommelse();
  såBok(tom, new Map()); // tom tildeling = nulloperasjon
  for (const s of st) tom.observer(s);
  for (let sete = 0; sete < 4; sete++) {
    assert.equal(like(uten.vektor(sete, 4), tom.vektor(sete, 4)), 0, `sete ${sete} skilte seg`);
  }
});

test("NULLPUNKT: rabatt 0 er bit-identisk — og FELLE: rabatt 0,5 flytter vektoren", () => {
  const st = kampens(4);
  const profil = bidragFraBok(bokAv(st), 1, "abc123", "2026-09-12");
  assert.ok(profil.runder > 0, "profilen er tom — da måler resten av prøven ingenting");

  const grunn = bokAv(st.slice(0, 3));

  const null0 = new Hukommelse();
  såBok(null0, new Map([[1, profil]]), { rabatt: 0 });
  for (const s of st.slice(0, 3)) null0.observer(s);
  assert.equal(
    like(grunn.vektor(0, 4), null0.vektor(0, 4)),
    0,
    "rabatt 0 er ikke bit-identisk med ingen profil — knotten mangler nullpunkt",
  );

  // FELLE: uten denne ville en `såBok` som ikke gjorde NOE bestått testen over.
  const med = new Hukommelse();
  såBok(med, new Map([[1, profil]]), { rabatt: 0.5 });
  for (const s of st.slice(0, 3)) med.observer(s);
  assert.ok(
    like(grunn.vektor(0, 4), med.vektor(0, 4)) > 0,
    "rabatt 0,5 endret ingen av de 144 tallene — profilen er koblet fra",
  );
});

// ===========================================================================
// 2 og 3. Bare ferdige runder, og ingen skjult informasjon
// ===========================================================================

test("BARE FERDIGE RUNDER: en pågående runde gir en TOM profil — FELLE: rundeslutt gir en full", () => {
  const st = kampens(2);
  const sisteSlutt = st.map((s) => s.fase).lastIndexOf("RUNDE_SLUTT");
  assert.ok(sisteSlutt > 0, "kampen hadde ingen RUNDE_SLUTT — prøven ville vært grønn på ingenting");

  // Alt FØR den første rundeslutten: hele budrunden, vraket og hvert kort.
  const førsteSlutt = st.findIndex((s) => s.fase === "RUNDE_SLUTT");
  const pågår = bokAv(st.slice(0, førsteSlutt));
  const p = bidragFraBok(pågår, 1, "abc123", "2026-09-12");
  assert.equal(p.runder, 0, "en pågående runde ble bokført — K2-grensen lekker");
  for (const navn of BÅRNE_LEDD) {
    assert.equal(p.ledd[navn]?.n ?? 0, 0, `«${navn}» fikk bevis fra en runde som ikke var ferdig`);
  }

  // FELLE: tas rundeslutten med, MÅ profilen fylles. Uten dette ville en
  // `bidragFraBok` som alltid ga tomt bestått sjekken over.
  const ferdig = bidragFraBok(bokAv(st.slice(0, førsteSlutt + 1)), 1, "abc123", "2026-09-12");
  assert.equal(ferdig.runder, 1, "en ferdig runde ble IKKE bokført — da måler nullsjekken ingenting");
});

test("K2: skjulte hender i den PÅGÅENDE runden endrer ikke profilen — FELLE: en kikker tas", () => {
  const st = kampens(3);
  const fasit = bidragFraBok(bokAv(st), 2, "abc123", "2026-09-12");

  /** Samme kamp, men hver hånd i en PÅGÅENDE runde byttet ut med noe annet. */
  const rotet = st.map((s) =>
    s.fase === "RUNDE_SLUTT" || s.fase === "FERDIG"
      ? s
      : ({ ...s, hender: s.hender.map((h) => [...h].reverse()) } as GameState),
  );
  const etter = bidragFraBok(bokAv(rotet), 2, "abc123", "2026-09-12");
  for (const navn of BÅRNE_LEDD) {
    assert.deepEqual(etter.ledd[navn], fasit.ledd[navn], `«${navn}» flyttet seg da skjulte hender ble byttet`);
  }

  // FELLE: en bok som bokfører fra hendene UANSETT fase må bli tatt av samme
  // sammenlikning. Her er kikkeren: den teller kort på hånden i hver tilstand.
  const kikk = (states: readonly GameState[]): number => {
    let sum = 0;
    for (const s of states) if (s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG") sum += (s.hender[2] ?? []).length;
    return sum;
  };
  assert.notEqual(
    kikk(st),
    kikk(rotet.map((s) => ({ ...s, hender: s.hender.map((h) => h.slice(1)) }) as GameState)),
    "en kikker ville ikke sett forskjell på de to kampene — da beviser K2-sjekken over ingenting",
  );
});

// ===========================================================================
// 4. Ferskvektene bæres ikke
// ===========================================================================

test("FERSKVEKTENE BÆRES IKKE — «akkurat nå» fra i går er ikke ferskt", () => {
  const st = kampens(6);
  const profil = bidragFraBok(bokAv(st), 1, "abc123", "2026-09-12");
  const start = startbok(profil, { rabatt: 1 });
  assert.deepEqual(start.ferskResidual, TOM_FERSK, "ferskResidual ble båret over fra en annen kamp");
  assert.deepEqual(start.ferskBudavvik, TOM_FERSK, "ferskBudavvik ble båret over fra en annen kamp");
  assert.equal(start.runder, 0, "kampens rundeteller ble startet på profilens runder");

  // Og det som SKAL bæres, er båret — ellers er testen over grønn på en tom profil.
  const bårne = BÅRNE_LEDD.filter((n) => (start as unknown as Record<string, { n: number }>)[n]!.n > 0);
  assert.ok(bårne.length >= 3, `bare ${bårne.length} ledd ble båret — profilen bærer ingenting`);
});

test("RABATTEN beholder SNITTET og krymper VEKTEN, med tak", () => {
  const st = kampens(8);
  const profil = bidragFraBok(bokAv(st), 1, "abc123", "2026-09-12");
  const helt = startbok(profil, { rabatt: 1, tak: 1e9 });
  const halvt = startbok(profil, { rabatt: 0.5, tak: 1e9 });
  for (const navn of BÅRNE_LEDD) {
    const a = (helt as unknown as Record<string, { sum: number; n: number }>)[navn]!;
    const b = (halvt as unknown as Record<string, { sum: number; n: number }>)[navn]!;
    if (a.n === 0) continue;
    assert.ok(Math.abs(snitt(a as never) - snitt(b as never)) < 1e-9, `«${navn}»: snittet flyttet seg`);
    assert.ok(Math.abs(b.n - a.n / 2) < 1e-9, `«${navn}»: vekten ble ikke halvert`);
  }
  // TAKET: en stor profil kan ikke kjøpe seg ubegrenset vekt.
  const kappet = startbok(profil, { rabatt: 1, tak: 2 });
  for (const navn of BÅRNE_LEDD) {
    const b = (kappet as unknown as Record<string, { n: number }>)[navn]!;
    assert.ok(b.n <= 2 + 1e-9, `«${navn}» kom over taket med n = ${b.n}`);
  }
});

// ===========================================================================
// 5. Sammenslåingen
// ===========================================================================

test("SLÅ SAMMEN: to kamper = én samlet strøm — FELLE: råsumformen gir et annet svar", () => {
  const a = bidragFraBok(bokAv(kampens(5, 90_120_101)), 1, "abc123", "2026-09-10");
  const b = bidragFraBok(bokAv(kampens(5, 90_120_202)), 1, "abc123", "2026-09-11");
  const sum = slåSammen(a, b);

  assert.equal(sum.runder, a.runder + b.runder);
  assert.equal(sum.kamper, 2);
  assert.equal(sum.sist, "2026-09-11", "sist skal være den seneste av de to");

  for (const navn of BÅRNE_LEDD) {
    assert.ok(
      Math.abs((sum.ledd[navn]?.n ?? 0) - ((a.ledd[navn]?.n ?? 0) + (b.ledd[navn]?.n ?? 0))) < 1e-9,
      `«${navn}»: n ble ikke lagt sammen`,
    );
  }

  /**
   * FELLE. Den naive sammenslåingen legger sammen `cxy` uten korrigeringsleddet
   * `dx·dy·na·nb/n`. Den er lett å skrive og gal, og uten dette leddet ville
   * makronivåets korrelasjon vært feil på nøyaktig den måten `Samvar` i
   * `hukommelse.ts` advarer mot. Her regnes den ut, og den MÅ avvike.
   */
  const naiv = (x: Samvar, y: Samvar): Samvar => ({
    mx: (x.mx * x.n + y.mx * y.n) / Math.max(1, x.n + y.n),
    my: (x.my * x.n + y.my * y.n) / Math.max(1, x.n + y.n),
    cxx: x.cxx + y.cxx,
    cyy: x.cyy + y.cyy,
    cxy: x.cxy + y.cxy,
    n: x.n + y.n,
  });
  let feltMedForskjell = 0;
  for (const navn of BÅRNE_SAMVAR) {
    const ea = a.samvar[navn]!;
    const eb = b.samvar[navn]!;
    if (ea.n < 3 || eb.n < 3) continue;
    if (Math.abs(korrelasjon(naiv(ea, eb)) - korrelasjon(sum.samvar[navn]!)) > 1e-9) feltMedForskjell++;
  }
  assert.ok(
    feltMedForskjell > 0,
    "den naive råsumformen ga NØYAKTIG samme korrelasjon i hvert felt — da prøver ikke testen sammenslåingen",
  );
});

// ===========================================================================
// 6. Ingen ledd faller utenfor
// ===========================================================================

test("HVERT tall i Setebok er klassifisert som båret eller ikke-båret", () => {
  const felt = Object.keys(tomSetebok()).filter((k) => k !== "runder");
  const dekket = new Set<string>([...BÅRNE_LEDD, ...BÅRNE_SAMVAR, ...IKKE_BÅRNE]);
  const glemt = felt.filter((f) => !dekket.has(f));
  assert.deepEqual(
    glemt,
    [],
    `disse tallene i Setebok er verken båret eller uttrykkelig holdt utenfor: ${glemt.join(", ")}. ` +
      `Et nytt ledd skal ikke stille falle ut av profilen — ta stilling i src/mlb/profil.ts.`,
  );
  assert.equal(dekket.size, felt.length, "profilen nevner et felt Setebok ikke har");
});

// ===========================================================================
// 7. Navn, stier og lageret
// ===========================================================================

test("gyldigId avviser fornavn og stitraversering", () => {
  assert.ok(gyldigId("957f6f6c3a62"), "et ekte pseudonym ble avvist");
  for (const stygg of ["Arvind", "../hemmelig", "abc/def", "ABC123", "", "a".repeat(33), "sha256"]) {
    assert.ok(!gyldigId(stygg), `«${stygg}» slapp gjennom som spiller-id`);
  }
});

test("lageret: skriv, les og oppdater i en OPPGITT katalog", () => {
  const dir = mkdtempSync(join(tmpdir(), "amb-profil-"));
  try {
    const id = "0123456789ab";
    assert.equal(lesProfil(dir, id), null, "en katalog uten filer ga likevel en profil");
    assert.deepEqual(profilIder(dir), []);

    const a = bidragFraBok(bokAv(kampens(4, 90_120_303)), 1, id, "2026-09-10");
    skrivProfil(dir, a);
    const lest = lesProfil(dir, id);
    assert.ok(lest !== null, "profilen ble ikke lest tilbake");
    assert.deepEqual(lest, a, "profilen kom ikke uendret tilbake fra disk");
    assert.deepEqual(profilIder(dir), [id]);

    const b = bidragFraBok(bokAv(kampens(4, 90_120_404)), 1, id, "2026-09-11");
    const etter = oppdaterProfil(dir, b);
    assert.equal(etter.kamper, 2, "oppdatering la ikke til en kamp");
    assert.equal(etter.runder, a.runder + b.runder);
    assert.deepEqual(lesProfil(dir, id), etter, "det som ble skrevet er ikke det som ble lest");

    /**
     * FEIL EIER SKAL KASTE, ikke feiltolkes. En profil hører til sitt
     * pseudonym, og en forvekslet fil ville gitt boten en ANNEN spillers vaner
     * — den verste feilen dette lageret kan gjøre, og en helt stille en.
     */
    const fremmed = join(dir, "eeeeeeeeeeee.json");
    writeFileSync(fremmed, JSON.stringify(tomProfil("ffffffffffff")) + "\n");
    assert.throws(() => lesProfil(dir, "eeeeeeeeeeee"), /er for/, "en fil med feil eier ble godtatt");

    // Ukjent versjon skal kaste, ikke leses som om formen var den samme.
    const gammel = join(dir, "dddddddddddd.json");
    writeFileSync(gammel, JSON.stringify({ ...tomProfil("dddddddddddd"), versjon: 99 }) + "\n");
    assert.throws(() => lesProfil(dir, "dddddddddddd"), /profilversjon/, "en ukjent versjon ble lest");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// 8. Bokfrøet — det speken sender nedover
// ===========================================================================

/**
 * SPEKEN MÅ FYRE, IKKE BARE FINNES.
 *
 * Regel 6 i `AdamsMax.md`: en test skal måle at noe FYRER. Fire døde moduler hadde
 * grønne enhetstester hele tiden, og `okt:` selv er et av eksemplene — laget ble
 * bygget, økta ble laget, og ingen leste den.
 *
 * `mlb:tilfeldig<frø>` brukes med vilje: den bygger en `Sandkasseagent` UTEN en
 * vektfil, så prøven kjører også der `e1-modell/` ikke er sporet.
 */
test("SPEKEN: «okt:profil=» endrer valgene — og uten den er de bit-identiske", () => {
  /**
   * RELATIV KATALOG MED VILJE. `okt:` deler speken på første kolon, så en sti kan ikke
   * inneholde en — nøyaktig samme regel som `sik:…~mlbu=<fil>`. På Windows har en
   * `tmpdir()`-sti en drivbokstav («C:\…»), og speken ville delt midt i den. Det er ikke
   * en feil i parseren, men det er en felle å gå i: appen og løkka gir relative stier.
   */
  const dir = mkdtempSync("_profilspek-");
  try {
    const id = "00ff00ff00ff";
    const st = kampens(6, 90_120_505);
    skrivProfil(dir, bidragFraBok(bokAv(st), 1, id, "2026-09-12"));
    const sti = join(dir, `${id}.json`).replace(/\\/g, "/");

    const valgene = (spek: string): string[] => {
      const ag = [0, 1, 2, 3].map((p) => lagIndre(p === 0 ? spek : SPEK));
      for (const a of ag) a.nyKamp?.();
      let s = opprettSpill({ antallSpillere: 4, målPoeng: 10_000 }, 90_120_606);
      const ut: string[] = [];
      let vakt = 0;
      while (s.rundeNr < 4 && s.fase !== "FERDIG" && vakt++ < 20_000) {
        for (const a of ag) a.observer?.(s);
        if (s.fase === "RUNDE_SLUTT") {
          s = utfør(s, { type: "NESTE" }).state;
          continue;
        }
        const i = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
        if (i === null || i === undefined) break;
        const h = ag[i]!.velgHandling(s);
        if (i === 0) ut.push(JSON.stringify(h));
        s = utfør(s, h).state;
      }
      return ut;
    };

    const bar = valgene("mlb:tilfeldig7");
    const medOkt = valgene("okt:mlb:tilfeldig7");
    const medProfil = valgene(`okt:profil=${sti}@1:mlb:tilfeldig7`);

    assert.ok(bar.length > 20, `bare ${bar.length} valg — prøven ville vært grønn på nesten ingenting`);
    assert.deepEqual(medOkt, bar, "«okt:» alene endret valgene — nullpunktet er ikke bit-identisk");
    assert.notDeepEqual(
      medProfil,
      bar,
      "«okt:profil=» endret ikke ett eneste valg — profilen når ikke fram til hukommelsen",
    );

    // FELLE: en profil på et sete agenten ikke har foran seg skal treffe et ANNET
    // sted i vektoren. Traff «profil=» uansett sete, ville setefeltet vært pynt.
    const sete2 = valgene(`okt:profil=${sti}@2:mlb:tilfeldig7`);
    assert.notDeepEqual(sete2, medProfil, "sete 1 og sete 2 ga samme valg — setet i «profil=» blir ignorert");

    // Og en tom/ugyldig form skal KASTE, ikke stille bli ignorert.
    assert.throws(() => lagIndre(`okt:profil=${sti}:mlb:tilfeldig7`), /sete|<sti>@<sete>/);
    assert.throws(() => lagIndre("okt:profil=:mlb:tilfeldig7"), /Tomt profilfelt|sete/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lagBokfrø gir en FRISK bok hver gang — to kamper deler ikke tilstand", () => {
  const st = kampens(5);
  const profil = bidragFraBok(bokAv(st), 1, "abc123", "2026-09-12");
  const frø = lagBokfrø(new Map([[1, profil]]), { rabatt: 0.5 });

  const b1 = frø.lagBok();
  const b2 = frø.lagBok();
  assert.notEqual(b1, b2, "bokfrøet ga samme objekt to ganger — kamp 2 ville arvet kamp 1");
  assert.equal(like(b1.vektor(0, 4), b2.vektor(0, 4)), 0, "to friske bøker fra samme profil er ulike");

  // Og de to skal skille lag når bare den ene ser en kamp.
  for (const s of st) b1.observer(s);
  assert.ok(
    like(b1.vektor(0, 4), b2.vektor(0, 4)) > 0,
    "boka som så en hel kamp er identisk med den som ikke så noe — observer er koblet fra",
  );
});
