/**
 * FARGEBYTTET — er de to veiene enige, og er byttet blindt for skjulte kort?
 *
 * `src/mlb/fargebytte.ts` har to veier til den samme vektoren:
 *
 *   1. bytt STILLINGEN og bygg trekkene på nytt   (`byttVisning` + `troTrekkForBredde`)
 *   2. bytt KOLONNENE i en ferdig trekkvektor     (`troInnKilde` + `permuter`)
 *
 * Vei 2 er den eneste som gjør augmentering av et ferdig korpus mulig — 20 000
 * ganger billigere enn å spille kampene om igjen. Men et indekskart tar ikke
 * livet av seg når det er feil: det gir en vektor som SER riktig ut, med hjerter
 * der spar skulle stått, og en modell som blir stille dårligere. Derfor er
 * terskelen her bit-identitet, ikke «omtrent».
 *
 * ===================== DEN ENE DOKUMENTERTE UNNTAKET ====================
 *
 * `EST_ARGMAX` (302–305) er argmax over de fire fargeestimatene, og
 * `estimerStikk` brytes uavgjort på FARGEREKKEFØLGEN. Er to farger nøyaktig like
 * gode, peker one-hoten på den laveste fargeindeksen, og et bytte kan flytte den.
 * Prøven godtar avvik NØYAKTIG der, og ingen andre steder — og teller dem, fordi
 * antallet er en av målingene oppdraget spør om.
 *
 * ===================== OG DE MÅ KUNNE FEILE =============================
 *
 * Tre feller: et kart med ett forskjøvet kort, et kart som glemmer trumf-one-hoten,
 * og en «kanonisering» som kikker i en skjult hånd. Blir ingen av dem tatt, måler
 * de grønne prøvene over ingenting.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lovligeKort, spillerVisning, type SpillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { medVerden, trekkVerdener } from "../src/moe2/sdkort.ts";
import { lagRng } from "../src/kort.ts";
import { kortIndeks } from "../src/nevro/trekk.ts";
import { MLB_TRO_INN_HS2, troTrekkForBredde } from "../src/mlb/trotrekk.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { e1SpillTrekkMedTro } from "../src/e1/trekk.ts";
import {
  byttTilstand,
  byttVisning,
  erIdentitet,
  invers,
  kanoniskBytte,
  komponer,
  KORT_INN,
  kortInnKilde,
  lovligeBytter,
  permuter,
  troInnKilde,
  uavgjorteFarger,
  type Fargebytte,
} from "../src/mlb/fargebytte.ts";

const BREDDE = MLB_TRO_INN_HS2; // 996 — den bredden løkka faktisk trener
/** `INNGANG.EST_ARGMAX` = 302. Det ene stedet uavgjort kan flytte en one-hot. */
const EST_ARGMAX = [302, 303, 304, 305];

/**
 * Stillinger å prøve på: hele runder med den målte Adams i alle fire seter.
 * Samme generator som `test/mlb-k2-tro.test.ts`, så prøvene ser samme spill.
 */
function stillinger(giver: number, maksPerGiv: number, fraStikk = 0): { s: GameState; sete: number }[] {
  const ut: { s: GameState; sete: number }[] = [];
  for (let g = 0; g < giver; g++) {
    const drivere = [0, 1, 2, 3].map(() => lagIndre(ADAMS_MAALT));
    let s: GameState = opprettSpill({ antallSpillere: 4 }, 7_700_000 + g * 4231);
    let vakt = 0;
    let iGiv = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 200) {
      if (s.fase === "SPILL" && s.iTur !== null && iGiv < maksPerGiv && s.stikkSpilt >= fraStikk) {
        if (lovligeKort(s, s.iTur).length >= 2) {
          ut.push({ s, sete: s.iTur });
          iGiv++;
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const troTrekk = (v: SpillerVisning, s: GameState): Float32Array =>
  troTrekkForBredde(BREDDE, v, s.giving.antallStikk, s.regler.målPoeng, null);

/** Avvikende indekser mellom «bytt stillingen» og «bytt kolonnene». */
function avvikTro(s: GameState, sete: number, p: Fargebytte): number[] {
  const v = spillerVisning(s, sete);
  const direkte = troTrekk(byttVisning(v, p), s);
  const viaKart = permuter(troTrekk(v, s), troInnKilde(BREDDE, p));
  const ut: number[] = [];
  for (let i = 0; i < BREDDE; i++) if (!Object.is(direkte[i], viaKart[i])) ut.push(i);
  return ut;
}

test("fargebytte: gruppen er akkurat så stor som symmetrien tillater", () => {
  // Etterlyst i en sidefarge: to farger ankret, én transposisjon igjen.
  const to = lovligeBytter("S", { farge: "H", verdi: 14 });
  assert.equal(to.length, 2, "trumf + etterlyst i ulike farger skal gi |G| = 2");
  assert.ok(erIdentitet(to[0]!), "identiteten skal komme først");
  // Etterlyst i trumf: bare trumf ankret, 3! igjen.
  assert.equal(lovligeBytter("S", { farge: "S", verdi: 14 }).length, 6);
  // Uten etterlysning (solo): det samme.
  assert.equal(lovligeBytter("S", null).length, 6);
  // Hvert bytte må la ankrene stå.
  for (const p of lovligeBytter("S", { farge: "H", verdi: 14 })) {
    assert.equal(p[0], 0, "trumf (S) flyttet seg");
    assert.equal(p[1], 1, "etterlyst farge (H) flyttet seg");
    assert.deepEqual(invers(invers(p)), p);
  }
});

test("fargebytte: indekskartet og stillingen gir BIT-IDENTISKE trotrekk (996)", () => {
  const pos = stillinger(8, 4);
  assert.ok(pos.length >= 20, `bare ${pos.length} stillinger — beviser ingenting`);
  let prøvd = 0;
  let argmaxTilfeller = 0;
  const ekte: string[] = [];
  for (const { s, sete } of pos) {
    for (const p of lovligeBytter(s.trumf, s.etterlyst)) {
      if (erIdentitet(p)) continue;
      prøvd++;
      const avvik = avvikTro(s, sete, p);
      if (avvik.length === 0) continue;
      if (avvik.every((i) => EST_ARGMAX.includes(i))) argmaxTilfeller++;
      else ekte.push(`stikk ${s.stikkSpilt} sete ${sete}: indeks ${avvik.slice(0, 6).join(", ")}`);
    }
  }
  assert.ok(prøvd >= 20, `bare ${prøvd} bytter prøvd`);
  assert.deepEqual(
    ekte,
    [],
    `indekskartet er UENIG med stillingen utenfor EST_ARGMAX (${ekte.length} av ${prøvd}):\n` +
      ekte.slice(0, 6).join("\n"),
  );
  // Ikke en assert på antallet — bare i loggen, fordi det er en MÅLING.
  console.log(`  EST_ARGMAX-uavgjort i ${argmaxTilfeller} av ${prøvd} bytter`);
});

test("fargebytte: indekskartet og stillingen gir BIT-IDENTISKE korttrekk (273)", () => {
  const pos = stillinger(8, 4);
  let prøvd = 0;
  const avvik: string[] = [];
  for (const { s, sete } of pos) {
    for (const p of lovligeBytter(s.trumf, s.etterlyst)) {
      if (erIdentitet(p)) continue;
      prøvd++;
      const direkte = e1SpillTrekkMedTro(byttTilstand(s, p), sete, KORT_INN, null);
      const viaKart = permuter(e1SpillTrekkMedTro(s, sete, KORT_INN, null), kortInnKilde(KORT_INN, p));
      for (let i = 0; i < KORT_INN; i++) {
        if (!Object.is(direkte[i], viaKart[i])) {
          avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: indeks ${i} ${String(direkte[i])} ≠ ${String(viaKart[i])}`);
          break;
        }
      }
    }
  }
  assert.ok(prøvd >= 20, `bare ${prøvd} bytter prøvd`);
  assert.deepEqual(avvik, [], `kortkartet er uenig med stillingen:\n${avvik.slice(0, 6).join("\n")}`);
});

test("fargebytte: prøven kan FEILE — ett forskjøvet kort og en glemt trumf blir tatt", () => {
  const pos = stillinger(4, 3, 2);
  assert.ok(pos.length >= 6, `bare ${pos.length} stillinger`);

  /** FELLE 1: kartet bytter spar ess og spar konge i tillegg til fargene. */
  const forskjøvet = (p: Fargebytte): Int32Array => {
    const k = troInnKilde(BREDDE, p);
    const a = k[kortIndeks({ farge: "S", verdi: 14 })]!;
    k[kortIndeks({ farge: "S", verdi: 14 })] = k[kortIndeks({ farge: "S", verdi: 13 })]!;
    k[kortIndeks({ farge: "S", verdi: 13 })] = a;
    return k;
  };
  /** FELLE 2: kartet glemmer trumf-one-hoten (156–159) — den letteste å overse. */
  const glemtTrumf = (p: Fargebytte): Int32Array => {
    const k = troInnKilde(BREDDE, p);
    for (let f = 0; f < 4; f++) k[156 + f] = 156 + f;
    return k;
  };

  for (const [navn, feil] of [["forskjøvet kort", forskjøvet], ["glemt trumf", glemtTrumf]] as const) {
    let tatt = 0;
    let prøvd = 0;
    for (const { s, sete } of pos) {
      for (const p of lovligeBytter(s.trumf, s.etterlyst)) {
        if (erIdentitet(p)) continue;
        prøvd++;
        const v = spillerVisning(s, sete);
        const direkte = troTrekk(byttVisning(v, p), s);
        const viaKart = permuter(troTrekk(v, s), feil(p));
        for (let i = 0; i < BREDDE; i++) {
          if (!Object.is(direkte[i], viaKart[i])) {
            tatt++;
            break;
          }
        }
      }
    }
    assert.ok(prøvd > 0, "ingen bytter prøvd");
    assert.ok(tatt > 0, `fella «${navn}» ble ikke tatt i noen av ${prøvd} bytter — prøven over måler ingenting`);
  }
});

/**
 * K2 — er kanoniseringen og byttet en funksjon av OFFENTLIG informasjon alene?
 *
 * Byttes de skjulte hendene ut med en hvilken som helst forenlig verden, skal
 * BÅDE det valgte byttet OG den transformerte trekkvektoren stå bom stille.
 * Ett avvikende flyttall er juks — da har vi bygd en kanal som bærer fasiten
 * inn i inngangen, og hvert K8-tall etterpå er verdiløst.
 */
function k2Prøve(velgBytte: (v: SpillerVisning, s: GameState, sete: number) => Fargebytte): {
  stillinger: number;
  avvik: string[];
} {
  const avvik: string[] = [];
  let n = 0;
  for (const { s, sete } of stillinger(6, 3, 2)) {
    const rng = lagRng(4_242_000 + s.stikkSpilt * 37 + sete);
    const verdener = trekkVerdener(s, sete, 3, rng, undefined, undefined, 4);
    if (verdener.length < 2) continue;
    n++;
    const v = spillerVisning(s, sete);
    const p0 = velgBytte(v, s, sete);
    const fasit = troTrekk(byttVisning(v, p0), s);
    for (const hender of verdener) {
      const s2 = medVerden(s, hender, sete);
      const v2 = spillerVisning(s2, sete);
      const p2 = velgBytte(v2, s2, sete);
      if (p2.join(",") !== p0.join(",")) {
        avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: byttet ble ${p2.join(",")} mot ${p0.join(",")}`);
        continue;
      }
      const annen = troTrekk(byttVisning(v2, p2), s2);
      for (let i = 0; i < BREDDE; i++) {
        if (!Object.is(fasit[i], annen[i])) {
          avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: trekk ${i} endret seg da BARE skjulte kort ble byttet`);
          break;
        }
      }
    }
  }
  return { stillinger: n, avvik };
}

test("K2: kanoniseringen leser bare offentlig informasjon", () => {
  const { stillinger: n, avvik } = k2Prøve((v) => kanoniskBytte(v));
  assert.ok(n >= 8, `prøven fikk bare ${n} stillinger — beviser ingenting`);
  assert.deepEqual(avvik, [], `JUKS i kanoniseringen:\n${avvik.slice(0, 6).join("\n")}`);
});

test("K2: prøven kan FEILE — en kanonisering som kikker i en skjult hånd blir tatt", () => {
  /**
   * FELLA: samme nøkkel, men fargene rangeres etter hvor mange kort NESTE SETE
   * har i dem. Det er nøyaktig den slutningen troen skal gjøre selv, servert
   * gratis — og det er umulig å se på en trekkvektor at det har skjedd.
   */
  const jukser = (v: SpillerVisning, s: GameState, sete: number): Fargebytte => {
    const neste = (sete + 1) % s.antallSpillere;
    const tell = [0, 0, 0, 0];
    for (const k of s.hender[neste] ?? []) tell[["S", "H", "R", "K"].indexOf(k.farge)]!++;
    const t = v.trumf === null ? -1 : ["S", "H", "R", "K"].indexOf(v.trumf);
    const orden = [0, 1, 2, 3].sort((a, b) => (a === t ? -1 : b === t ? 1 : tell[b]! - tell[a]! || a - b));
    const p = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) p[orden[i]!] = i;
    return p as unknown as Fargebytte;
  };
  const { stillinger: n, avvik } = k2Prøve(jukser);
  assert.ok(n >= 8, `prøven fikk bare ${n} stillinger`);
  assert.ok(
    avvik.length > 0,
    "en kanonisering som RANGERER FARGENE ETTER EN SKJULT HÅND ble ikke tatt. Da måler K2-prøven over ingenting.",
  );
});

/**
 * ETIKETTEN FØLGER MED — påstanden hele augmenteringen hviler på.
 *
 * `examples/agX-augmenter.ts` permuterer en ferdig trekkvektor OG etiketten med
 * samme kart, uten å spille stillingen om igjen. Det er bare lov hvis fasiten er
 * EKVIVARIANT: kortet som lå hos relativt sete 2 før byttet, skal ligge hos
 * relativt sete 2 etterpå — på sin nye plass i indeksen. Klassen er et SETE, og
 * et fargebytte flytter ingen kort mellom hender.
 *
 * Holder ikke dette, lager augmenteringen rader der inngangen sier én ting og
 * fasiten en annen. Det krasjer ikke. Det gir et nett som lærer støy.
 */
const permIndeks = (i: number, p: Fargebytte): number => p[Math.floor(i / 13)]! * 13 + (i % 13);

/**
 * Etiketten slik `examples/agX-augmenter.ts` bygger den: kortet flytter til sin
 * nye farge, KLASSEN står. Prøven under holder denne påstanden opp mot fasiten
 * regnet på nytt i den byttede verdenen — og fellene bygger den samme tabellen
 * feil, så de kan sammenliknes med akkurat samme målestokk.
 */
const nyEtikett = (f: Int8Array, p: Fargebytte): Int8Array => {
  const ut = new Int8Array(52);
  for (let i = 0; i < 52; i++) ut[permIndeks(i, p)] = f[i]!;
  return ut;
};

/** Antall stillinger×bytter der den påståtte etiketten IKKE er fasiten i den byttede verdenen. */
function etikettAvvik(
  pos: { s: GameState; sete: number }[],
  bygg: (f: Int8Array, p: Fargebytte) => Int8Array,
): { prøvd: number; avvik: string[] } {
  const avvik: string[] = [];
  let prøvd = 0;
  for (const { s, sete } of pos) {
    const før = troFasit(s, sete);
    for (const p of lovligeBytter(s.trumf, s.etterlyst)) {
      if (erIdentitet(p)) continue;
      prøvd++;
      const fasit = troFasit(byttTilstand(s, p), sete);
      const påstand = bygg(før, p);
      for (let i = 0; i < 52; i++) {
        if (fasit[i] !== påstand[i]) {
          avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: kort ${i} skulle vært klasse ${fasit[i]}, ble ${påstand[i]}`);
          break;
        }
      }
    }
  }
  return { prøvd, avvik };
}

test("augmentering: fasiten er EKVIVARIANT — kortet bytter plass, klassen står", () => {
  const pos = stillinger(8, 4);
  assert.ok(pos.length >= 20, `bare ${pos.length} stillinger`);
  const { prøvd, avvik } = etikettAvvik(pos, nyEtikett);
  assert.ok(prøvd >= 20, `bare ${prøvd} bytter prøvd`);
  assert.deepEqual(avvik, [], `fasiten er IKKE ekvivariant:\n${avvik.slice(0, 6).join("\n")}`);
});

test("augmentering: prøven kan FEILE — en etikett som ikke permuteres blir tatt", () => {
  const pos = stillinger(6, 3, 1);
  assert.ok(pos.length >= 6, `bare ${pos.length} stillinger`);

  /**
   * FELLE 1: etiketten blir liggende mens trekkene byttes — nøyaktig det en
   * augmenter som glemmer `f2`-løkka ville gjort, og den er usynlig i fila.
   * FELLE 2: etiketten permuteres på VALØREN i stedet for fargen. Like mange
   * kort flytter seg, og radene ser like riktige ut.
   */
  const glemt = (f: Int8Array): Int8Array => Int8Array.from(f);
  const påValør = (f: Int8Array): Int8Array => {
    const ut = new Int8Array(52);
    for (let i = 0; i < 52; i++) ut[Math.floor(i / 13) * 13 + (12 - (i % 13))] = f[i]!;
    return ut;
  };

  for (const [navn, feil] of [["glemt etikett", glemt], ["permutert på valør", påValør]] as const) {
    const { prøvd, avvik } = etikettAvvik(pos, feil);
    assert.ok(prøvd > 0, "ingen bytter prøvd");
    assert.ok(
      avvik.length > 0,
      `fella «${navn}» ble ikke tatt i noen av ${prøvd} bytter — ekvivariansprøven måler ingenting`,
    );
  }
});

/**
 * SAMMENSETNINGEN — to bytter etter hverandre er ett bytte.
 *
 * `examples/agX-fargesymmetri.ts --kanonisk` kanoniserer den BYTTEDE stillingen på
 * nytt og må kunne si hvor kort `i` havnet etter begge stegene. Regnes den veien
 * ut for hånd på kallstedet, krasjer den ikke når den er feil — den peker på feil
 * kort, og restleddet som skulle vært null blir et tall som ser troverdig ut.
 */
test("komponer: to bytter etter hverandre er ETT bytte, og stillingen er enig", () => {
  const pos = stillinger(6, 3, 2);
  assert.ok(pos.length >= 10, `bare ${pos.length} stillinger`);
  let prøvd = 0;
  const avvik: string[] = [];
  for (const { s, sete } of pos) {
    const v = spillerVisning(s, sete);
    for (const a of lovligeBytter(s.trumf, s.etterlyst)) {
      // `b` trenger ikke være lovlig i ORIGINALEN: den virker på den alt byttede
      // stillingen, og der er det andre farger som er ankret.
      for (const b of lovligeBytter(s.trumf, s.etterlyst)) {
        prøvd++;
        const toSteg = troTrekk(byttVisning(byttVisning(v, a), b), s);
        const ettSteg = troTrekk(byttVisning(v, komponer(a, b)), s);
        for (let i = 0; i < BREDDE; i++) {
          if (!Object.is(toSteg[i], ettSteg[i])) {
            avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: trekk ${i} etter ${a.join("")}∘${b.join("")}`);
            break;
          }
        }
      }
    }
  }
  assert.ok(prøvd >= 20, `bare ${prøvd} sammensetninger prøvd`);
  assert.deepEqual(avvik, [], `komponer er UENIG med to bytter etter hverandre:\n${avvik.slice(0, 6).join("\n")}`);
});

/**
 * KANONISERINGEN SKAL GJØRE MÅLINGEN EKSAKT NULL — der nøkkelen skiller.
 *
 * Dette er påstanden hele `--kanonisk` hviler på, og den som gjør restleddet
 * tolkbart: i en stilling der den offentlige nøkkelen skiller alle frie farger
 * (`uavgjorteFarger === 0`), skal originalen og enhver byttet utgave av den falle
 * på NØYAKTIG samme navn — og trekkvektorene være bit-identiske. Er de ikke det,
 * er kanoniseringen ufullstendig, og hvert «restledd» målingen rapporterer er
 * kanoniseringens egen feil forkledd som nettets.
 *
 * `EST_ARGMAX` er det ene dokumenterte unntaket, som i prøvene over.
 */
function kanoniskFelles(velgBytte: (v: SpillerVisning) => Fargebytte): { prøvd: number; avvik: string[] } {
  const avvik: string[] = [];
  let prøvd = 0;
  for (const { s, sete } of stillinger(10, 4, 2)) {
    const v = spillerVisning(s, sete);
    if (uavgjorteFarger(v) !== 0) continue; // nøkkelen skiller ikke her — se hodet i eksempelet
    const fasit = troTrekk(byttVisning(v, velgBytte(v)), s);
    for (const p of lovligeBytter(s.trumf, s.etterlyst)) {
      if (erIdentitet(p)) continue;
      prøvd++;
      const vP = byttVisning(v, p);
      const annen = troTrekk(byttVisning(vP, velgBytte(vP)), s);
      for (let i = 0; i < BREDDE; i++) {
        if (!Object.is(fasit[i], annen[i]) && !EST_ARGMAX.includes(i)) {
          avvik.push(`stikk ${s.stikkSpilt} sete ${sete}: trekk ${i} skiller de to kanoniske formene`);
          break;
        }
      }
    }
  }
  return { prøvd, avvik };
}

test("kanonisering: der nøkkelen skiller, er den byttede stillingen BIT-IDENTISK med originalen", () => {
  const { prøvd, avvik } = kanoniskFelles(kanoniskBytte);
  assert.ok(prøvd >= 20, `bare ${prøvd} bytter prøvd — beviser ingenting`);
  assert.deepEqual(
    avvik,
    [],
    `kanoniseringen er UFULLSTENDIG (${avvik.length} av ${prøvd}):\n${avvik.slice(0, 6).join("\n")}`,
  );
});

test("kanonisering: prøven kan FEILE — en nøkkel som bare teller kort blir tatt", () => {
  /**
   * FELLA: samme rangering, men bare ledd (a) — ANTALL kort spilt åpent — og så
   * den faste fargerekkefølgen. Den ser komplett ut og er det ikke: to farger med
   * like mange spilte kort, men ulik høyeste valør, får navn etter fargeindeksen,
   * og da bytter navnet seg når fargene byttes. Nøyaktig den feilen som ville
   * gjort et «kanonisk» korpus stille inkonsistent.
   */
  const bareAntall = (v: SpillerVisning): Fargebytte => {
    const antall = [0, 0, 0, 0];
    for (const stikk of v.historikk) for (const kp of stikk.kort) antall[["S", "H", "R", "K"].indexOf(kp.kort.farge)]!++;
    for (const kp of v.bord) antall[["S", "H", "R", "K"].indexOf(kp.kort.farge)]!++;
    const t = v.trumf === null ? -1 : ["S", "H", "R", "K"].indexOf(v.trumf);
    const e = v.etterlyst === null ? -1 : ["S", "H", "R", "K"].indexOf(v.etterlyst.farge);
    const rang = (f: number): number => (f === t ? 0 : f === e ? 1 : 2);
    const orden = [0, 1, 2, 3].sort((a, b) => rang(a) - rang(b) || antall[b]! - antall[a]! || a - b);
    const p = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) p[orden[i]!] = i;
    return p as unknown as Fargebytte;
  };
  const { prøvd, avvik } = kanoniskFelles(bareAntall);
  assert.ok(prøvd >= 20, `bare ${prøvd} bytter prøvd`);
  assert.ok(
    avvik.length > 0,
    `en nøkkel UTEN høyeste valør og maske ble ikke tatt i noen av ${prøvd} bytter — ` +
      "da måler den grønne prøven over ingenting.",
  );
});
