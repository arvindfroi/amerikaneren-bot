/**
 * STILBIAS — de tre egenskapene den gamle detektoren manglet.
 *
 * ARVIND: «hvis det du prøvde på ikke funket så må du bygge noe nytt som
 * funker. Få K4 på plass først sammen med K8.»
 *
 * `Økt.aggressivitet` målte rå atferd og feilet på alle tre punktene under
 * (§108). Denne fila håndhever dem, så en ny variant ikke kan skli tilbake.
 *
 *   1. NULLPUNKTET ER NULL      fire identiske agenter skal ikke flagges
 *   2. VANEN BLIR FUNNET        en stilisert trumftrekker skal flagges
 *   3. LÆRINGEN ER TROFAST      det som læres ved rundeslutt må være nøyaktig
 *                               det som skjedde
 *
 * Punkt 3 er den som fanget mest. Rekonstruksjonen tok fire forsøk å få
 * riktig, og hver feil var stum:
 *
 *     fase arvet «RUNDE_SLUTT»       lovligeKort ga tom liste => null residualer
 *     historikk aldri bygget opp     nettet så en tom fortid i hvert valg
 *     pris-sortering ikke total      to farger med samme valør byttet rang
 *     tellerne arvet fra slutten     makkeren røpet fra første kort, og
 *                                    stikkVunnet sto på fasit hele runden
 *
 * Ingen av dem ville krasjet. Alle fire ville gitt en hukommelse som lærte av
 * en runde ingen spilte — prosjektets mest gjentatte feilklasse.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { forover, nettFraBytes } from "../src/nevro/nett.ts";
import { e1SpillTrekk } from "../src/e1/trekk.ts";
import { ADAMS_MAALT, lagIndre } from "../src/moe2/agentspek.ts";
import { MIN_RUNDER, Økt } from "../src/moe2/okt.ts";
import { lagTrumftrekker, type Spekagent } from "../examples/k6-vaner.ts";
import {
  leggTil,
  NULLFORM,
  residual,
  rundensResidualer,
  snitt,
  stilForskjell,
  stilForskjellForm,
  TOMT_BIAS,
  type Biasanslag,
  type Nullform,
} from "../src/moe2/stilbias.ts";

const nett = nettFraBytes(new Uint8Array(readFileSync("e1-modell/d7alle.bin")))[0]!;
const atferd = {
  logits: (s: GameState, p: number): Float32Array => forover(nett, e1SpillTrekk(s, p, nett.lag[0]!.inn)),
};

/** Spiller `runder` runder og samler residualene live, per sete. */
function spill(medVane: boolean, frø: number, runder: number): {
  bias: Biasanslag[];
  avvikMotRekonstruksjon: number;
  par: number;
} {
  const bias: Biasanslag[] = [TOMT_BIAS, TOMT_BIAS, TOMT_BIAS, TOMT_BIAS];
  const ag = [0, 1, 2, 3].map((p) =>
    medVane && p === 1 ? lagTrumftrekker(ADAMS_MAALT) : lagIndre(ADAMS_MAALT),
  );
  for (const a of ag) a.nyKamp();

  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  let vakt = 0;
  let r = 0;
  let live = new Map<number, number[]>();
  let poengFør: readonly number[] = [0, 0, 0, 0];
  let avvik = 0;
  let par = 0;

  while (s.fase !== "FERDIG" && vakt++ < 60_000 && r < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      // ORAKELET: det rekonstruerte må være identisk med det live-utregnede.
      const rek = rundensResidualer(s, atferd, poengFør);
      for (const [sete, liste] of live) {
        const b = rek.get(sete) ?? [];
        if (b.length !== liste.length) {
          avvik += Math.abs(b.length - liste.length);
          continue;
        }
        for (let i = 0; i < liste.length; i++) {
          par++;
          if (Math.abs(liste[i]! - b[i]!) > 1e-9) avvik++;
        }
      }
      live = new Map();
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL" && s.stikkSpilt === 0 && s.bord.length === 0) poengFør = s.totalPoeng;
    const h = ag[iTur]!.velgHandling(s);
    if (h.type === "SPILL" && s.fase === "SPILL") {
      const res = residual(s, iTur, h.kort, atferd);
      if (res !== null) {
        bias[iTur] = leggTil(bias[iTur]!, res);
        const l = live.get(iTur) ?? [];
        l.push(res);
        live.set(iTur, l);
      }
    }
    s = utfør(s, h).state;
  }
  return { bias, avvikMotRekonstruksjon: avvik, par };
}

/**
 * UTSLAGETS STOERRELSE etter myk terskel - ikke et binaert flagg.
 *
 * `stilvri` bruker `max(0, |forskjell| - 2·SE)`, saa et grensetilfelle gir
 * naermest ingen vridning mens en ekte vane beholder nesten alt. Da er
 * «hvor mange ble flagget» feil maal: det som betyr noe er om vanen faar et
 * utslag som er STOERRE ENN STOEYEN, ikke om stoeyen er eksakt null.
 */
const utslag = (bias: Biasanslag[]): number[] =>
  bias.map((b, p) => {
    const d = stilForskjell(b, bias.filter((_, q) => q !== p));
    if (!d.sikker || !Number.isFinite(d.se)) return 0;
    return Math.max(0, Math.abs(d.forskjell) - 2 * d.se);
  });

const flagget = (bias: Biasanslag[]): boolean[] => utslag(bias).map((x) => x > 0);

test("laeringen er trofast: rekonstruksjonen ved rundeslutt er EKSAKT lik live", () => {
  const { avvikMotRekonstruksjon, par } = spill(true, 77_000_011, 8);
  assert.ok(par > 200, `for faa residualpar sammenlignet (${par}) - testen beviser lite`);
  assert.equal(
    avvikMotRekonstruksjon,
    0,
    `${avvikMotRekonstruksjon} av ${par} residualer avvek. Da laerer hukommelsen av en ` +
      `runde som ikke ble spilt, og det er stumt - ingenting krasjer.`,
  );
});

test("nullpunktet er null: fire IDENTISKE agenter flagges ikke", () => {
  const { bias } = spill(false, 77_000_011, 16);
  for (const b of bias) {
    assert.ok(b.n >= 60, `for faa observasjoner (${b.n}) - hele poenget er at de er mange`);
  }
  const f = flagget(bias);
  assert.equal(
    f.filter(Boolean).length,
    0,
    `${f.filter(Boolean).length} av 4 identiske agenter ble flagget som saeregne. ` +
      `Den gamle detektoren gjorde nettopp dette - et normalt sete fyrte som «passiv».`,
  );
});

test("vanen blir funnet: trumftrekkeren flagges, og bare han", () => {
  const { bias } = spill(true, 77_000_011, 16);
  const f = flagget(bias);
  assert.equal(f[1], true, "den stiliserte trumftrekkeren ble ikke funnet");
  assert.ok(
    snitt(bias[1]!) > 0,
    `trumftrekkeren ble lest som ${snitt(bias[1]!).toFixed(3)} - han spiller HOEYERE enn ` +
      `nettet forventer, saa fortegnet skal vaere positivt`,
  );
  /**
   * VANEN SKAL DOMINERE STOEYEN, ikke bare vaere alene om aa fyre.
   *
   * Et normalt sete kan saa vidt krysse 2 SE naar en trumftrekker sitter ved
   * bordet - han endrer spillet for alle, saa de andres residualer skifter
   * ogsaa litt. Med myk terskel koster det nesten ingenting: utslaget deres
   * blir en broekdel av vanens, og vridningen skalerer med utslaget.
   *
   * Kriteriet er derfor FORHOLDET, ikke antallet.
   *
   * ============ TERSKELEN BLE SENKET FRA 5 TIL 2,5 (13. sep) ===========
   *
   * OG DET ER EN EKTE KOSTNAD, IKKE EN OPPRYDDING. Den skal staa synlig.
   *
   * Med den globale konstanten var nullpunktet et ANKER UTENFOR BORDET, saa en
   * ensom avviker paavirket ikke de andres avlesning i det hele tatt. Maalt
   * (`--del d --mot envane`, 3 froe x 2 kamper x 26 runder), stoerste utslag
   * per sete:
   *
   *     sete            global    bord
   *     0  (klone)      0,0000    0,1842
   *     1  (VANEN)      0,5953    0,6052
   *     2  (klone)      0,0100    0,2129
   *     3  (klone)      0,0222    0,1782
   *
   *     forhold vane/stoerste tilskuer:   27x       2,8x
   *
   * Aarsaken er aritmetisk og strukturell, ikke en innstilling: en tilskuers
   * referanse er de tre ANDRE setene, og ett av dem ER avvikeren. Referansen
   * forskyves derfor med ~1/3 av avviket, og tilskueren leses som avvikende
   * motsatt vei med ~1/3. Avvikeren selv maales mot tre rene kloner og faar
   * hele utslaget. Forholdet er dermed ~3:1 naar én av fire avviker - uansett
   * hvor terskelen settes.
   *
   * Det er prisen for at nullpunktet ikke kan bli foreldet. Den motsatte
   * feilen er verre og var den vi faktisk hadde: med et anker maalt paa en
   * ANNEN stakk fikk fire IDENTISKE kloner opptil 0,1055 i vri UTEN at noen
   * avvek i det hele tatt, og andelen vokste mot 31 % med kamplengden. En
   * ensom stilisert trumftrekker er en proevefikstur; fire like seter er det
   * loekka og appen faktisk spiller.
   *
   * 2,5 er valgt UNDER det maalte 2,8 og over det en blind detektor ville gitt.
   * Senkes den videre en gang til, er det ikke lenger en terskel.
   */
  const u = utslag(bias);
  const stoersteNormale = Math.max(u[0]!, u[2]!, u[3]!);
  assert.ok(
    u[1]! > 2.5 * stoersteNormale,
    `trumftrekkerens utslag ${u[1]!.toFixed(3)} mot stoerste normale ` +
      `${stoersteNormale.toFixed(3)} - vanen maa dominere stoeyen klart, ellers ` +
      `vrir hukommelsen soeket like mye mot vanlige spillere som mot saeregne.`,
  );
});

// ===========================================================================
// NULLPUNKTET ER BORDETS EGET, IKKE EN KONSTANT MAALT PAA ÉN STAKK (13. sep)
// ===========================================================================

/**
 * ============ HVA DISSE PROEVENE VOKTER =================================
 *
 * `BEFOLKNING_RESIDUAL = -0,0976` ble maalt over 8 812 valg paa stakken
 * `abmpf`+`d7alle`, og brukt som nullpunkt paa ALLE stakker. Testene over
 * kjoerer noeyaktig den stakken, saa de kunne ikke se feilen: paa hjemmebane
 * treffer konstanten.
 *
 * Loekka kjoerer `vakt:abmp` med `kort-7`/`kort-8`, og de halene ligger
 * 0,014-0,025 over konstanten. Et SYSTEMATISK avvik krymper ikke med `n` mens
 * SE gjoer, saa
 *
 *     z = |snitt - konstant| / SE  ~  avvik·√n / σ    ->  vokser uten grense
 *
 * Maalt (`D:\amb-grp\loop\residual.md`, 5 froe x 3 kamper x 26 runder):
 *
 *     hale              global            bord
 *     abmpf+d7alle       3,1 %  flat      4,1 %  flat
 *     abmp+kort-7       31,1 %  STIGER    2,2 %  flat
 *     abmp+kort-8       19,6 %  STIGER    4,5 %  flat
 *
 * Med den globale konstanten konkluderer detektoren altsaa med at fire
 * IDENTISKE kopier av boten har hver sin spillestil - og den blir sikrere paa
 * det jo lenger de spiller.
 *
 * ============ HVORFOR IKKE «NULL FLAGG, ALDRI» ==========================
 *
 * Den strengeste formen av proeven - «ingen sete passerer porten noensinne» -
 * er IKKE oppnaaelig for noen detektor, og det er ikke en innroemmelse: en port
 * paa 2 SE slipper per definisjon gjennom omtrent én av tjue ved ren
 * tilfeldighet (`okt.ts:154` sier det selv). Maalt krysser selv den GLOBALE
 * formen paa sin EGEN hale 6 av 20 seter en gang i loepet av 26 runder.
 *
 * Det som skiller en aerlig detektor fra en som lyver er derfor ikke om den
 * noen gang krysser, men om den krysser med NOMINELL RATE og med et utslag som
 * druknerer i vanens - i stedet for aa vokse mot 100 % og bli permanent.
 * Proevene under maaler nettopp de to.
 */

const HALE_ABMPF = "vakt:abmpf:e1:e1-modell/d7alle.bin";
const HALE_KORT7 = "vakt:abmp:e1:e1-modell/kort-7.bin";
const HALE_KORT8 = "vakt:abmp:e1:e1-modell/kort-8.bin";
const T_VR = "vr:e1-modell/vrakrang.bin:telrd";
const T_BUD = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5";

interface Punktmaal {
  readonly runde: number;
  readonly sikker: boolean;
  readonly krympet: number;
}

/**
 * Spiller `runder` runder paa en gitt konvensjonshale og leser detektoren i
 * hvert eneste kortvalg, for alle fire setene, i BEGGE former.
 *
 * Bokfoeringen gaar gjennom stakken (`observer` ved RUNDE_SLUTT), som i
 * `kamp.ts` - ikke rett inn i boka. Ett sete med oekten er nok: `Profilbok`
 * bokfoerer residualene for ALLE fire setene.
 */
function haleproeve(
  hale: string,
  runder: number,
  frø: number,
  vane: boolean,
): Record<Nullform, Punktmaal[]> {
  const kjerne = `${T_VR}:profil:${T_BUD}:${hale}`;
  const økt = new Økt();
  const seter: Spekagent[] = [0, 1, 2, 3].map((i) =>
    vane && i !== 0
      ? lagTrumftrekker(ADAMS_MAALT)
      : (lagIndre(kjerne, { økt }) as unknown as Spekagent),
  );
  const ut: Record<Nullform, Punktmaal[]> = { global: [], bord: [] };

  økt.nyKamp();
  for (const a of seter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, frø);
  let vakt = 0;
  let r = 0;
  while (s.fase !== "FERDIG" && vakt++ < 200_000 && r < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const a of seter) a.observer?.(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL") {
      for (let sete = 0; sete < 4; sete++) {
        const eget = økt.bok.biasFor(sete);
        const andre = [0, 1, 2, 3].filter((p) => p !== sete).map((p) => økt.bok.biasFor(p));
        for (const form of ["global", "bord"] as const) {
          const d = stilForskjellForm(eget, andre, form);
          ut[form].push({
            runde: r,
            sikker: d.sikker,
            krympet:
              d.sikker && Number.isFinite(d.se) ? Math.max(0, Math.abs(d.forskjell) - 2 * d.se) : 0,
          });
        }
      }
    }
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  return ut;
}

/** Andel over porten og stoerste utslag, ETTER rundegulvet. */
const oppsummer = (p: readonly Punktmaal[]): { andel: number; maks: number; n: number } => {
  const e = p.filter((x) => x.runde >= MIN_RUNDER);
  return {
    andel: e.length === 0 ? 0 : e.filter((x) => x.sikker).length / e.length,
    maks: Math.max(0, ...e.map((x) => x.krympet)),
    n: e.length,
  };
};

test("KLONPROEVEN: fire identiske seter flagges ikke systematisk - i ALLE tre halene", () => {
  const haler: [string, string][] = [
    ["abmpf+d7alle", HALE_ABMPF],
    ["abmp+kort-7", HALE_KORT7],
    ["abmp+kort-8", HALE_KORT8],
  ];
  for (const [navn, hale] of haler) {
    const p = haleproeve(hale, 26, 77_000_011, false);
    const b = oppsummer(p.bord);
    const g = oppsummer(p.global);
    assert.ok(b.n > 2000, `${navn}: bare ${b.n} punkter etter gulvet - proeven beviser lite`);

    /**
     * RATEN, ikke «noensinne». En port paa 2 SE slipper gjennom ~5 % ved ren
     * tilfeldighet; det er porten som er valgt, ikke en feil. Det som IKKE er
     * tilfeldighet er 31 %.
     */
    assert.ok(
      b.andel <= 0.15,
      `${navn}: bordformen flagget fire IDENTISKE agenter i ${(100 * b.andel).toFixed(1)} % av ` +
        `punktene. Over ~5 % er ikke lenger tilfeldighet - da er nullpunktet feil igjen.`,
    );
    /**
     * OG UTSLAGET MAA VAERE SMAATT. Det er utslaget som vrir soeket, ikke
     * flagget. Vanen maaler 0,66; klonene skal ligge en stoerrelsesorden under.
     */
    assert.ok(
      b.maks <= 0.15,
      `${navn}: stoerste vri mot en KLONE var ${b.maks.toFixed(4)}. Vanen maaler 0,66, ` +
        `saa over 0,15 vrir hukommelsen soeket nesten like mye mot seg selv som mot en vane.`,
    );

    // Og paa loekkas haler skal den nye formen vaere KLART bedre enn den gamle.
    // Paa `abmpf` treffer konstanten, og da skal de to vaere like - det er
    // nettopp derfor feilen kunne ligge uoppdaget.
    if (hale !== HALE_ABMPF) {
      assert.ok(
        b.andel < 0.5 * g.andel,
        `${navn}: bord ${(100 * b.andel).toFixed(1)} % mot global ${(100 * g.andel).toFixed(1)} %. ` +
          `Den globale konstanten er maalt paa en ANNEN hale, saa den skal vaere klart verre her - ` +
          `er den ikke det, maaler proeven ikke det den tror.`,
      );
    }
  }
});

test("KLONPROEVEN: z vokser IKKE med n - det var selve defekten", () => {
  /**
   * Signaturen paa et feil nullpunkt er ikke at porten passeres, men at den
   * passeres OFTERE jo lenger man spiller: avviket er systematisk og krymper
   * ikke, mens SE gjoer. En riktig kalibrert form ligger flat for alltid.
   */
  const p = haleproeve(HALE_KORT7, 26, 77_000_011, false);
  for (const form of ["global", "bord"] as const) {
    const e = p[form].filter((x) => x.runde >= MIN_RUNDER);
    const skille = Math.floor(e.length / 2);
    const tidlig = e.slice(0, skille);
    const sent = e.slice(skille);
    const aT = tidlig.filter((x) => x.sikker).length / Math.max(1, tidlig.length);
    const aS = sent.filter((x) => x.sikker).length / Math.max(1, sent.length);
    if (form === "bord") {
      assert.ok(
        aS <= Math.max(0.15, aT * 2 + 0.05),
        `bordformen flagget ${(100 * aT).toFixed(1)} % tidlig og ${(100 * aS).toFixed(1)} % sent ` +
          `mot fire IDENTISKE agenter. Vokser andelen med n, er nullpunktet systematisk feil.`,
      );
    }
  }
});

test("VANEN FYRER FORTSATT: tre trumftrekkere detekteres, og utslaget er bevart", () => {
  const p = haleproeve(HALE_ABMPF, 20, 77_000_011, true);
  const b = oppsummer(p.bord);
  /**
   * EN RETTING SOM GJOER DETEKTOREN BLIND ER VERRE ENN FEILEN. Med tre
   * trumftrekkere av fire seter trekkes bordets grunnlinje mot vanen - det er
   * nettopp der medianreferansen ga 0. Det sammenslaatte snittet gjoer det
   * ikke: differansen krymper, men den doer ikke.
   */
  assert.ok(
    b.andel >= 0.7,
    `bordformen fant vanen i bare ${(100 * b.andel).toFixed(1)} % av punktene. Med tre ` +
      `trumftrekkere ved bordet skal den fyre nesten overalt - gjoer den ikke det, er ` +
      `rettingen en detektor som er blitt blind, og det er verre enn feilen.`,
  );
  assert.ok(
    b.maks >= 0.4,
    `stoerste utslag mot en EKTE vane var ${b.maks.toFixed(4)}. Maalt skal det ligge rundt ` +
      `0,66 - faller det mot klonenes 0,02-0,07, vrir hukommelsen ikke lenger soeket.`,
  );
});

test("NULLFORMEN I BRUK er bordets egen grunnlinje", () => {
  /**
   * Vokteren mot en stille tilbakerulling. Byttes `NULLFORM` tilbake til
   * «global», er alle proevene over fortsatt groenne paa `abmpf` - de kjoerer
   * jo begge former direkte - og ingenting ville sagt fra om at PRODUKSJONEN
   * bruker den foreldede konstanten igjen.
   */
  assert.equal(
    NULLFORM,
    "bord",
    "produksjonen leser ikke bordets grunnlinje. Da er nullpunktet en konstant maalt paa " +
      "én stakk i august, brukt paa alle - og z vokser uten grense mot vaar egen bot.",
  );
  // Og `stilForskjell` maa faktisk gaa gjennom den valgte formen.
  const eget: Biasanslag = { sum: 10, kvadrat: 12, n: 40 };
  const andre: Biasanslag[] = [
    { sum: 10, kvadrat: 12, n: 40 },
    { sum: 10, kvadrat: 12, n: 40 },
    { sum: 10, kvadrat: 12, n: 40 },
  ];
  assert.deepEqual(
    stilForskjell(eget, andre),
    stilForskjellForm(eget, andre, NULLFORM),
    "«stilForskjell» gaar utenom «NULLFORM» - da er bryteren dekorasjon",
  );
  // Fire like anslag er per definisjon ikke saeregne. Med bordet som nullpunkt
  // er det EKSAKT null, ikke omtrent - og det er hele forskjellen fra en konstant.
  assert.equal(stilForskjellForm(eget, andre, "bord").forskjell, 0);
  assert.equal(stilForskjellForm(eget, andre, "bord").sikker, false);
});

test("RUNDEGULVET: «stilvri» tror ikke paa noe foer MIN_RUNDER, som «aggressivitet»", () => {
  /**
   * `Økt.aggressivitet` har krevd `MIN_RUNDER = 4` hele tiden; `stilvri` krevde
   * bare `d.sikker`. Ved n ~ 9 observasjoner kollapser `standardfeil` (den
   * bruker `n - 1`), og maalt topp z i runde 1 var 7,13 paa `abmpf` og 13,19 paa
   * `abmp`+`kort-8` - rene smaautvalgsspoekelser som kunne vri soeket.
   *
   * Proeven er universell og derfor froe-robust: paa ETHVERT tidspunkt foer
   * terskelen skal vrien vaere null, uansett hva tallene sier.
   */
  const kjerne = `${T_VR}:profil:${T_BUD}:${HALE_KORT8}`;
  const økt = new Økt();
  const seter: Spekagent[] = [0, 1, 2, 3].map(
    () => lagIndre(kjerne, { økt }) as unknown as Spekagent,
  );
  økt.nyKamp();
  for (const a of seter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 9999 }, 77_000_011);
  let vakt = 0;
  let r = 0;
  let sjekket = 0;
  let etterTerskel = 0;
  while (s.fase !== "FERDIG" && vakt++ < 200_000 && r < 12) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const a of seter) a.observer?.(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    if (s.fase === "SPILL") {
      for (let sete = 0; sete < 4; sete++) {
        if (økt.bok.runder(sete) < MIN_RUNDER) {
          sjekket++;
          assert.equal(
            økt.stilvri(sete),
            null,
            `sete ${sete} fikk en vri etter bare ${økt.bok.runder(sete)} runder. ` +
              `«aggressivitet» krever MIN_RUNDER = ${MIN_RUNDER}; «stilvri» maa kreve det samme, ` +
              `ellers fyrer hukommelsen paa en SE som har kollapset.`,
          );
        } else {
          etterTerskel++;
        }
      }
    }
    s = utfør(s, seter[iTur]!.velgHandling(s)).state;
  }
  assert.ok(sjekket > 50, `bare ${sjekket} avlesninger under terskelen - proeven beviser lite`);
  assert.ok(
    etterTerskel > 50,
    `bare ${etterTerskel} avlesninger OVER terskelen - da kan proeven passere med en ` +
      `«stilvri» som alltid er null, og det er ikke det som skal voktes`,
  );
});
