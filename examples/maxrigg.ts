/**
 * ADAMS MAX — MÅLERIGGEN: alle deler, og relasjonene mellom dem.
 *
 * ARVIND: «det går nesten ikke an å måle Adams max del for del fordi alt er
 * avhengig av hverandre. så du må bygge alle delene som moduler også må vi
 * heller kjøre en omfattende test over samtlige deler individuelt og
 * relasjonene mellom de.»
 *
 * ===================== HVORFOR IKKE «GRUNNLINJE + ÉN» ======================
 *
 * Hittil har prosjektet målt addisjon oppover: grunnlinja i miljøet, og én
 * modul slått på i kandidatsetet. Det tallet har LØYET, og ikke i det små:
 *
 *     `amu:alle` alene            −0,2837 ± 0,0519   (z = −5,5)
 *     `amu:alle` med vaktens veto **+0,1742**
 *
 * Samme modul, motsatt fortegn. Grunnen er triviell når den er sagt: en modul
 * måles i det SELSKAPET den står i. `amu:alle` overstyrte konvensjonene fordi
 * ingen stoppet den; med vetoen på blir den et tillegg i stedet for en
 * erstatning. «Modulen alene» er derfor ikke et tall om modulen — det er et
 * tall om modulen PLUSS fraværet av alt annet.
 *
 * Denne riggen snur retningen:
 *
 *     arm 0     FULL stakk (alle moduler på)      = gate 2s KONTROLLARM
 *     arm i     FULL MINUS modul i                for hver modul
 *     arm K     GRUNNLINJA (alt av)
 *
 * «Full minus X» måler hva X bidrar med NÅR ALT ANNET ER DER — som er det
 * eneste spørsmålet med en handling bak seg: skal X være med i boten vi
 * faktisk rulller ut? Det er N+2 armer, ikke 2^N.
 *
 * ===================== OG RELASJONENE, SOM ET REGNESTYKKE ==================
 *
 * Med `d(A)` = den PARREDE differansen mellom arm A og FULL (gate 2s egen
 * kontrollblokk), er bidraget fra X per definisjon
 *
 *     bidrag(X) = FULL − (FULL−X) = −d(FULL−X)
 *
 * og relasjonen mellom to moduler leses ut av en tredje arm:
 *
 *     interaksjon(X,Y) = bidrag(X,Y samlet) − bidrag(X) − bidrag(Y)
 *                      = −d(−X−Y) + d(−X) + d(−Y)
 *
 * Positiv interaksjon = de gjør hverandre bedre. Negativ = de konkurrerer om
 * det samme, som `A6 mot A7`, `sender mot leser` og `søket mot vakten` alle
 * gjorde. Det er `verktoy/samspill.py` sin superadditivitet, bare regnet
 * nedover fra full stakk i stedet for oppover fra grunnlinja.
 *
 * ===================== TO PORTER, OG DE MÅLER ULIKE TING ===================
 *
 * gate 2 lager FRISKE agenter per giv og stopper etter én runde. `okt:`,
 * `profil:` og kampstillingen (`r`) er derfor STRUKTURELT USYNLIGE der —
 * `press` er eksakt 0 og økta har 1 runde mot `MIN_RUNDER = 4`. Kampbenken
 * spiller til `målPoeng` med agenter som HUSKER; der lever de.
 *
 * Riggen kjører begge, og katalogen under merker hver modul med hvilken port
 * den er usynlig på. Rapporten SIER det. Uten den merkingen leser man
 * «modul X bidrar 0» som «X er verdiløs», når sannheten er «X kan ikke sees
 * her».
 *
 * ===================== BRUK ================================================
 *
 *   node examples/maxrigg.ts --toerr --merke max1
 *   node examples/maxrigg.ts --toerr --merke max1 --par okt,profil --par amu,vakt
 *   node examples/maxrigg.ts --tid --merke max1        # kalibrerer tidsanslaget
 *
 * `--toerr` KJØRER INGENTING. Den bygger hver eneste armspek med `lagIndre`
 * (så en skrivefeil tas nå og ikke etter fire timer), skriver armkartet til
 * fil, og lister nøyaktig hvilke armer som ville blitt kjørt.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";

/* ======================= DELENE, SOM EN KATALOG ========================= */

/** Porten en modul måles på. */
type Port = "gate2" | "kamp";

interface Modul {
  /** Kort ASCII-kode. Brukes i FILNAVN og i rapporten, så den må være stabil. */
  readonly kode: string;
  readonly navn: string;
  /**
   * Er modulen med i FULL stakk?
   *
   * En modul som er AV i full stakk KAN IKKE ABLATERES NEDOVER — «full minus
   * X» er da lik full. Riggen nekter å late som: den lister dem for seg, med
   * grunnen, og `--med <kode>` slår dem på om man vil ha dem målt likevel.
   */
  readonly iFull: boolean;
  /** Modulen den bor inne i. Fjernes forelderen, fjernes denne med. */
  readonly forelder?: string;
  /** Porter der modulen er STRUKTURELT umålbar. */
  readonly usynligPaa: readonly Port[];
  /** Hvorfor den er usynlig / hvorfor den er av. Skrives i rapporten. */
  readonly merknad: string;
}

const VRAKFIL = "e1-modell/vrakrang.bin";
const BUDFIL = "e1-modell/bud-vant.json";
const NETT = "e1-modell/d7alle.bin";

/**
 * KATALOGEN. Rekkefølgen her er den rekkefølgen lagene ligger i speken, og
 * det er ikke tilfeldig — se `ADAMS_V7` i `src/moe2/agentspek.ts`.
 */
const KATALOG: readonly Modul[] = [
  {
    kode: "okt",
    navn: "okt: — økt-scopet motstandermodell (A2/K4/K6)",
    iFull: true,
    usynligPaa: ["gate2"],
    merknad: "krever MIN_RUNDER = 4 observerte runder; gate 2 gir 1",
  },
  {
    kode: "vr",
    navn: "vr: — vrakrangerer og trumfvalg",
    iFull: true,
    usynligPaa: [],
    merknad: "",
  },
  {
    kode: "amu",
    navn: "amu: — alpha-mu-søket (hele laget)",
    iFull: true,
    usynligPaa: [],
    merknad: "fjernes den, faller b, g, e, r og v med — de bor inne i den",
  },
  {
    kode: "amub",
    navn: "amu «b» — A5, bayesiansk verdensvekt",
    iFull: true,
    forelder: "amu",
    usynligPaa: [],
    merknad: "av gir vektkilde «av»; «s» er ALTERNATIVET og kan ikke stables med b",
  },
  {
    kode: "amug",
    navn: "amu «g» — A6, signalforenlighet",
    iFull: true,
    forelder: "amu",
    usynligPaa: [],
    merknad: "",
  },
  {
    kode: "amum",
    navn: "amu «m2» — A8, framoverblikk over egne valg",
    iFull: false,
    forelder: "amu",
    usynligPaa: [],
    merknad:
      "M=2 koster 3,1x M=1 (138 -> 439 ms per beslutning). De gamle 5,3x var " +
      "kontensjon. AV i full stakk; --med amum slår den på",
  },
  {
    kode: "amue",
    navn: "amu «e0.25» — A7, uleselighet (PARKERT: ikke i K1–K8, målt −0,0941)",
    iFull: true,
    forelder: "amu",
    usynligPaa: [],
    merknad: "",
  },
  {
    kode: "amur",
    navn: "amu «r1.5» — kampstillingsstyrt varians",
    iFull: true,
    forelder: "amu",
    usynligPaa: ["gate2"],
    merknad: "krever framdrift mot målPoeng; på gate 2 er press EKSAKT 0",
  },
  {
    kode: "amuv",
    navn: "amu «v0.5» — vaktens veto over søket",
    iFull: true,
    forelder: "amu",
    usynligPaa: [],
    merknad:
      "§103: uten den målte amu:alle −0,2837. §106 målte +0,4809 med den — men " +
      "§109 REPLIKERTE i disjunkt bånd og fikk +0,1742 ± 0,0970 (1,8 SE), altså " +
      "UNDER porten. +0,4809 er et erstattet tall og skal ikke siteres.",
  },
  {
    kode: "profil",
    navn: "profil: — motstandermodellen som fyller økt-boka",
    iFull: true,
    usynligPaa: ["gate2"],
    merknad: "lærer over runder; gate 2 gir 1 runde per agent",
  },
  {
    kode: "budm",
    navn: "budm: — budmodellen (GBT μ, σ)",
    iFull: true,
    usynligPaa: [],
    merknad: "fjernes den, faller budsøket med — det er et felt inne i den",
  },
  {
    kode: "budsok",
    navn: "budm «sok12k8b0.5» — A4, budsøket",
    iFull: true,
    forelder: "budm",
    usynligPaa: [],
    merknad: "",
  },
  {
    kode: "budkamp",
    navn: "budm «kamp1.5» — MAKRO → MESO, kampstillingen inn i BUDET (K5 → K3)",
    iFull: false,
    forelder: "budm",
    usynligPaa: ["gate2"],
    merknad:
      "racepress er strukturelt EKSAKT 0 på gate 2 — bare kampbenken ser den. " +
      "AV som standard; --med budkamp slår den på",
  },
  {
    kode: "eks",
    navn: "eks: — eksakt sluttspill",
    iFull: false,
    usynligPaa: [],
    merknad: "§56 målte eks:3 = −0,343 og eks:4 = −0,753. AV i full stakk med vilje",
  },
  {
    kode: "vakt",
    navn: "vakt:abmpf — konvensjonsvakten",
    iFull: true,
    usynligPaa: [],
    merknad: "",
  },
];

const KODER = new Set(KATALOG.map((m) => m.kode));

/* ======================= SPEKBYGGEREN =================================== */

/** Amu-rollen. `alle` er den som er målt best SAMMEN med vetoen (§108). */
let amuRolle = "alle";

/**
 * ÉN samling påslåtte moduler → ÉN spek.
 *
 * Bygges kompositorisk og ikke med tekstsubstitusjon. Substitusjon på speker
 * er nettopp slik `d`-feltet i gate 2 endte som et nøstet objekt: et regex som
 * ikke traff skriveren, og en rapport som ga NaN uten å feile.
 */
function byggSpek(på: ReadonlySet<string>): string {
  const lag: string[] = [];
  if (på.has("okt")) lag.push("okt:");
  if (på.has("vr")) lag.push(`vr:${VRAKFIL}:telrd:`);
  if (på.has("amu")) {
    // Rekkefølgen på flaggene speiler `lagIndre`: tallene leses ut med `les()`
    // og bokstavene fjernes etterpå, så «12k16bgm1e0.25r1.5v0.5».
    let f = "12k16";
    if (på.has("amub")) f += "b";
    if (på.has("amug")) f += "g";
    f += `m${på.has("amum") ? 2 : 1}`;
    /**
     * A7 ER PARKERT (Arvind, 8. august: signalisering og mind games er for
     * avansert naa). Den er ikke i K1-K8, og gate2-ablasjonen maalte den til
     * -0,0941. Full stakk kjoerer derfor `e0`, og `u-amue` blir en NULLARM som
     * skal maale eksakt 0 - en gratis kontroll paa at riggen er aerlig.
     */
    f += "e0";
    void på.has("amue");
    f += `r${på.has("amur") ? "1.5" : "0"}`;
    f += `v${på.has("amuv") ? "0.5" : "0"}`;
    lag.push(`amu:${amuRolle}:${f}:`);
  }
  if (på.has("profil")) lag.push("profil:");
  if (på.has("budm")) {
    /**
     * `<fil>@<ev>/<sigmagulv>/<muskift>/<forsvarsverdi>/<auksjon>/<sok>/<kamp>`
     *
     * FELTENE ER POSISJONELLE. Uten budsøket men MED kampstillingen må den
     * sjette luken stå tom — `.../0//kamp1.5`. Det er nettopp den slags
     * stilltiende posisjonsfeil som gjør en spek til et annet ord for noe
     * annet, så luken settes her og ikke ved strengsying et sted.
     */
    let hale = "";
    if (på.has("budsok")) hale = "/sok12k8b0.5";
    if (på.has("budkamp")) hale = (hale === "" ? "/" : hale) + "/kamp1.5";
    lag.push(`budm:${BUDFIL}@-3.0/0.6/0/-3.0/0${hale}:`);
  }
  // `eks:` OVER `vakt:`: en eksakt løser skal ikke kunne overstyres av en
  // konvensjon. Under `profil:`, så bokføringskroken ikke går gjennom den.
  if (på.has("eks")) lag.push("eks:1:");
  if (på.has("vakt")) lag.push("vakt:abmpf:");
  lag.push(`e1:${NETT}`);
  return lag.join("");
}

/* ======================= ARMENE ========================================= */

interface Arm {
  readonly kode: string;
  readonly slag: "KONTROLL" | "minus" | "grunnlinje" | "par";
  readonly spek: string;
  /** Modulene denne armen mangler i forhold til FULL. */
  readonly fjernet: readonly string[];
  readonly usynligPaa: readonly Port[];
  readonly merknad: string;
}

/** Fjerner `kode` og alt som bor inne i den. */
function utenModul(full: ReadonlySet<string>, koder: readonly string[]): Set<string> {
  const ut = new Set(full);
  for (const k of koder) {
    ut.delete(k);
    for (const m of KATALOG) if (m.forelder === k) ut.delete(m.kode);
  }
  return ut;
}

/* ======================= ARGUMENTENE ==================================== */

let merke = "max";
let tørr = false;
let tidsmodus = false;
/**
 * 1600 giv, ikke 4000.
 *
 * SE på gate 2 er ca `0,163 / sqrt(giv/400)` — 0,052 ved 4000 og 0,082 ved
 * 1600. Effektene denne riggen jakter på er STORE (vetoen +0,48, `amu:alle`
 * −0,28), og 4000 giv koster fire ganger så mye som 1600 for å halvere en SE
 * som allerede er liten nok. Tørrkjøringen skriver begge tallene, så valget
 * kan tas på tall og ikke på vane.
 */
let giver = 1600;
let kamper = 200;
let skard = 16;
let frøG = 5_300_000;
let frøK = 730_000_000;
/** Målt ms per gate2-replay (ett giv, ett sete, én arm). Kalibreres med --tid. */
let msReplay = 0;
/** Målt ms per kamp på kampbenken. Kalibreres med --tid. */
let msKamp = 0;
/** Hvor mange giv `--tid` måler over. Ett giv alene er et anslag på ETT giv. */
let tidGiv = 2;
const parBestilt: string[][] = [];
const med: string[] = [];
const uten: string[] = [];
let katalog = "analyse";

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--toerr" || a === "--tørr") tørr = true;
  else if (a === "--tid") tidsmodus = true;
  else if (a === "--merke") merke = process.argv[++i] ?? merke;
  else if (a === "--katalog") katalog = process.argv[++i] ?? katalog;
  else if (a === "--giver") giver = tall(process.argv[++i], giver, "--giver");
  else if (a === "--kamper") kamper = tall(process.argv[++i], kamper, "--kamper");
  else if (a === "--skard") skard = tall(process.argv[++i], skard, "--skard");
  else if (a === "--froe-gate2") frøG = tall(process.argv[++i], frøG, "--froe-gate2");
  else if (a === "--froe-kamp") frøK = tall(process.argv[++i], frøK, "--froe-kamp");
  else if (a === "--ms-replay") msReplay = tall(process.argv[++i], msReplay, "--ms-replay");
  else if (a === "--ms-kamp") msKamp = tall(process.argv[++i], msKamp, "--ms-kamp");
  else if (a === "--tid-giv") tidGiv = tall(process.argv[++i], tidGiv, "--tid-giv");
  else if (a === "--amu-rolle") amuRolle = process.argv[++i] ?? amuRolle;
  else if (a === "--med") med.push(process.argv[++i] ?? "");
  else if (a === "--uten") uten.push(process.argv[++i] ?? "");
  else if (a === "--par") parBestilt.push((process.argv[++i] ?? "").split(",").map((x) => x.trim()));
  else if (a.startsWith("--")) throw new Error(`Ukjent flagg «${a}»`);
}

const par: [string, string][] = parBestilt.map((p) => {
  if (p.length !== 2) throw new Error(`«--par ${p.join(",")}» må være NØYAKTIG to moduler, f.eks. --par okt,profil`);
  return [p[0]!, p[1]!];
});

for (const k of [...med, ...uten]) {
  if (!KODER.has(k)) {
    throw new Error(`Ukjent modul «${k}». Gyldige: ${[...KODER].join(", ")}`);
  }
}
for (const p of par) {
  for (const k of p) {
    if (!KODER.has(k)) throw new Error(`Ukjent modul «${k}» i --par. Gyldige: ${[...KODER].join(", ")}`);
  }
}

/* ======================= BYGG STAKKEN OG ARMENE ========================= */

const full = new Set<string>();
for (const m of KATALOG) if (m.iFull) full.add(m.kode);
for (const k of med) full.add(k);
for (const k of uten) full.delete(k);
// En undermodul uten forelder er meningsløs, og speken ville bare tiet om det.
for (const m of KATALOG) {
  if (m.forelder !== undefined && full.has(m.kode) && !full.has(m.forelder)) {
    full.delete(m.kode);
  }
}

const FULLSPEK = byggSpek(full);
const GRUNNSPEK = byggSpek(new Set());

const armer: Arm[] = [];
/**
 * KONTROLLARMEN ER EN EKTE ARM, ikke en antakelse.
 *
 * gate 2 setter alltid opp en indre «KONTROLL» = miljøet i setet, men den
 * sammenliknes med seg selv og kan derfor ikke avsløre noe. Sender vi FULL
 * INN SOM KANDIDAT også, får vi en arm som spiller nøyaktig samme spek som
 * miljøet — og den parrede differansen hennes MÅ da bli eksakt 0,0000.
 *
 * Blir den ikke det, er det seteskjevhet eller ikke-determinisme i oppsettet,
 * og ingen av de andre tallene kan leses. Det er `mvp-dom.sh` sin regel, og
 * den koster én arm.
 */
armer.push({
  kode: "kontroll",
  slag: "KONTROLL",
  spek: FULLSPEK,
  fjernet: [],
  usynligPaa: [],
  merknad: "FULL mot seg selv — skal måle EKSAKT 0,0000",
});
for (const m of KATALOG) {
  if (!full.has(m.kode)) continue;
  const spek = byggSpek(utenModul(full, [m.kode]));
  armer.push({
    kode: `u-${m.kode}`,
    slag: "minus",
    spek,
    fjernet: [m.kode, ...KATALOG.filter((x) => x.forelder === m.kode && full.has(x.kode)).map((x) => x.kode)],
    usynligPaa: m.usynligPaa,
    merknad: m.merknad,
  });
}
armer.push({
  kode: "grunnlinje",
  slag: "grunnlinje",
  spek: GRUNNSPEK,
  fjernet: [...full],
  usynligPaa: [],
  merknad: "alt av — det rene nettet",
});
for (const [x, y] of par) {
  if (!full.has(x) || !full.has(y)) {
    throw new Error(`--par ${x},${y}: begge må være i FULL stakk (er de ikke, er det ingenting å fjerne)`);
  }
  armer.push({
    kode: `u-${x}-${y}`,
    slag: "par",
    spek: byggSpek(utenModul(full, [x, y])),
    fjernet: [x, y],
    usynligPaa: [...new Set([...(KATALOG.find((m) => m.kode === x)?.usynligPaa ?? []), ...(KATALOG.find((m) => m.kode === y)?.usynligPaa ?? [])])],
    merknad: `interaksjonsarm for ${x} x ${y}`,
  });
}

/**
 * TO ARMER MED SAMME SPEK ER EN STILLE KOLLISJON.
 *
 * gate 2 nøkler `d` på SPEKSTRENGEN. Er to armer like, overskriver den ene den
 * andre og rapporten viser én rad der det skulle stått to — uten å feile.
 * Samme feilklasse som skardkollisjonen som slettet en hel natts data.
 */
const settSpeker = new Map<string, string>();
for (const a of armer) {
  // Kontrollarmen ER FULL med vilje — den eneste tillatte dubletten.
  if (a.slag === "KONTROLL") {
    settSpeker.set(a.spek, a.kode);
    continue;
  }
  const før = settSpeker.get(a.spek);
  if (før !== undefined) {
    throw new Error(
      `Armene «${a.kode}» og «${før}» har SAMME spek. gate 2 nøkler på speken, ` +
        `så den ene ville overskrevet den andre i stillhet:\n  ${a.spek}`,
    );
  }
  settSpeker.set(a.spek, a.kode);
}

/* ======================= FILNAVN ======================================== */

/**
 * SKARDSUFFIKS I HVERT FILNAVN, uten unntak.
 *
 * En tidligere kjøring lot alle skard skrive til samme fil. De sist skrevne
 * radene overlevde, resten ble borte, og rapporten så komplett ut. Derfor er
 * dette en funksjon og ikke en strenginterpolasjon på tolv steder.
 */
const gate2Fil = (s: number): string => `${katalog}/max-${merke}-g-s${s}.jsonl`;
const kampFil = (kode: string, s: number): string => `${katalog}/max-${merke}-k-${kode}-s${s}.jsonl`;
const armkartFil = `${katalog}/max-${merke}-armkart.json`;
const armlisteFil = `${katalog}/max-${merke}-armer.tsv`;
/** FULL-speken alene, på én linje. Skallet trenger den uten en JSON-parser. */
const fullFil = `${katalog}/max-${merke}-full.txt`;
/**
 * PARAMETRENE, SOM SKALLET KAN `source`.
 *
 * Frøene sto hardkodet BÅDE her og i `adams-max.sh`. Røyktesten kjørte med
 * `--froe-kamp 990000000` i armkartet og 730000000 i kommandoen — altså et
 * armkart som navnga et annet frøbånd enn det som ble målt. Det er nøyaktig
 * feilklassen «det målte og det skrevne var ikke samme ting», og kuren er den
 * samme som for agentspeken: ETT sted, og de andre leser derfra.
 */
const paramFil = `${katalog}/max-${merke}-parametre.sh`;
const tørrFil = `${katalog}/max-${merke}-toerr.txt`;
const tidFil = `${katalog}/max-${merke}-tid.json`;

mkdirSync(dirname(armkartFil), { recursive: true });

/* ======================= TIDSMODUS ====================================== */

type Velger = { velgHandling(s: GameState): Handling; nyKamp(): void };

/**
 * ÉN gate2-replay: arm i ett sete, FULL i de tre andre, spilt til RUNDE_SLUTT.
 *
 * Dette er NØYAKTIG det `examples/gate2.ts` gjør per (giv, sete, arm), så tida
 * herfra ganges rett opp. Et anslag hentet fra en annen løkke ville vært et
 * anslag på noe annet.
 */
function replay(frø: number, sete: number, spek: string): number {
  const t0 = performance.now();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const v: Velger[] = [0, 1, 2, 3].map((p) => lagIndre(p === sete ? spek : FULLSPEK) as Velger);
  for (const b of v) b.nyKamp();
  let g = 0;
  while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
    s = utfør(s, v[iTur]!.velgHandling(s)).state;
  }
  return performance.now() - t0;
}

if (tidsmodus) {
  /**
   * KONTENSJONEN ER MÅLT, IKKE ANTATT — og den er stor nok til å gjøre et
   * tidsanslag ubrukelig om den ties i hjel.
   *
   * Første kalibrering av nettopp denne riggen ga 25,2 s per replay. Andre
   * kalibrering, samme frø og samme speker, ga 5,1 s. Forskjellen var seks
   * andre node-prosesser på maskinen. Prosjektets eget kostnadssveip 7. august
   * målte 67x på en mettet CPU.
   *
   * Derfor rapporteres MINSTETIDA per arm ved siden av snittet: minstetida er
   * det nærmeste vi kommer kostnaden uten kontensjon, og spriket mellom dem er
   * en direkte måling av hvor opptatt maskinen var da tallet ble tatt.
   */
  const tider: Record<string, { snitt: number; minste: number }> = {};
  const mål = (spek: string): { snitt: number; minste: number } => {
    const t: number[] = [];
    for (let g = 0; g < Math.max(1, tidGiv); g++) t.push(replay(frøG + g, g % 4, spek));
    return { snitt: t.reduce((x, y) => x + y, 0) / t.length, minste: Math.min(...t) };
  };
  // Første replay er kald: nettene lastes, JIT-en er uvarm. Den kastes.
  replay(frøG, 0, FULLSPEK);
  tider["KONTROLL"] = mål(FULLSPEK);
  for (const a of armer) tider[a.kode] = mål(a.spek);
  const alle = Object.values(tider);
  const snitt = alle.reduce((x, y) => x + y.snitt, 0) / alle.length;
  const minste = alle.reduce((x, y) => x + y.minste, 0) / alle.length;
  writeFileSync(
    tidFil,
    JSON.stringify(
      { merke, full: FULLSPEK, tidGiv, msPerReplay: snitt, msPerReplayMinste: minste, tider },
      null,
      2,
    ) + "\n",
  );
  console.log(`${alle.length} armer x ${tidGiv} giv: snitt ${snitt.toFixed(0)} ms, minste ${minste.toFixed(0)} ms -> ${tidFil}`);
  if (snitt > 1.5 * minste) {
    console.log(
      `ADVARSEL: snittet er ${(snitt / minste).toFixed(1)}x minstetida. Maskinen var opptatt ` +
        `under kalibreringen, og tallet er da et anslag på DEN maskinen, ikke på arbeidet.`,
    );
  }
  console.log(`Gi den videre: --ms-replay ${Math.round(snitt)}`);
  process.exit(0);
}

/* ======================= ARMKARTET (VARIG FIL) ========================== */

const armkart = {
  merke,
  laget: new Date().toISOString(),
  full: FULLSPEK,
  grunnlinje: GRUNNSPEK,
  amuRolle,
  moduler: KATALOG.map((m) => ({ ...m, iFullNaa: full.has(m.kode) })),
  armer: armer.map((a) => ({ kode: a.kode, slag: a.slag, spek: a.spek, fjernet: a.fjernet, usynligPaa: a.usynligPaa, merknad: a.merknad })),
  gate2: { giver, skard, froe: frøG, filer: [...Array(skard).keys()].map(gate2Fil) },
  kamp: { kamper, skard, froe: frøK },
};
writeFileSync(armkartFil, JSON.stringify(armkart, null, 2) + "\n");
writeFileSync(
  armlisteFil,
  armer.map((a) => `${a.kode}\t${a.spek}`).join("\n") + "\n",
);
writeFileSync(fullFil, FULLSPEK + "\n");
writeFileSync(
  paramFil,
  [
    `# Skrevet av examples/maxrigg.ts. IKKE rediger - kjor riggen med andre flagg.`,
    `MAX_GIVER=${giver}`,
    `MAX_KAMPER=${kamper}`,
    `MAX_SKARD=${skard}`,
    `MAX_FROE_GATE2=${frøG}`,
    `MAX_FROE_KAMP=${frøK}`,
    `MAX_ARMER=${armer.length}`,
    "",
  ].join("\n"),
);

/* ======================= TØRRKJØRINGEN ================================== */

const L: string[] = [];
const w = (x: string): void => void L.push(x);

w("");
w("=== ADAMS MAX: ABLASJON NEDOVER FRA FULL STAKK ===");
w(`merke «${merke}»   ${armer.length} armer + KONTROLL   amu-rolle «${amuRolle}»`);
w("");
w("FULL STAKK (gate 2s MILJØ, og dermed KONTROLLARMEN):");
w(`  ${FULLSPEK}`);
w("");
w("GRUNNLINJA (alt av):");
w(`  ${GRUNNSPEK}`);
w("");
w(`ARMENE SOM VILLE BLITT KJØRT (${armer.length} stk, alle i SAMME gate2-kjøring)`);
w("-".repeat(100));
w(`${"kode".padEnd(16)}${"slag".padEnd(12)}${"usynlig på".padEnd(12)}fjernet i forhold til FULL`);
w("-".repeat(100));
for (const a of armer) {
  w(
    `${a.kode.padEnd(16)}${a.slag.padEnd(12)}` +
      `${(a.usynligPaa.length === 0 ? "-" : a.usynligPaa.join(",")).padEnd(12)}` +
      (a.fjernet.length === 0 ? "ingenting — den ER full stakk" : a.fjernet.join(" + ")),
  );
}
w("-".repeat(100));
w("");
w("SPEKENE, i sin helhet:");
for (const a of armer) {
  w(`  ${a.kode}`);
  w(`    ${a.spek}`);
}
w("");

const utenfor = KATALOG.filter((m) => !full.has(m.kode));
if (utenfor.length > 0) {
  w("MODULER SOM IKKE ER I FULL STAKK — DE KAN IKKE ABLATERES NEDOVER");
  w("(«full minus X» er lik full når X ikke er der. Riggen later ikke som.)");
  for (const m of utenfor) w(`  ${m.kode.padEnd(10)} ${m.navn}\n             ${m.merknad}`);
  w(`  Slå dem på med --med <kode> om de skal måles.`);
  w("");
}

const nøstet = KATALOG.filter((m) => full.has(m.kode) && KATALOG.some((x) => x.forelder === m.kode && full.has(x.kode)));
if (nøstet.length > 0) {
  w("NØSTEDE MODULER — å fjerne forelderen fjerner barna med:");
  for (const m of nøstet) {
    const barn = KATALOG.filter((x) => x.forelder === m.kode && full.has(x.kode)).map((x) => x.kode);
    w(`  u-${m.kode.padEnd(10)} fjerner også ${barn.join(", ")}`);
  }
  w("  Effekten av «u-forelder» er derfor FORELDEREN OG BARNA SAMLET, ikke");
  w("  forelderen alene. Rapporten skriver det i klartekst.");
  w("");
}

w("UMÅLBART PER PORT — dette skal leses FØR tallene:");
for (const port of ["gate2", "kamp"] as const) {
  const u = KATALOG.filter((m) => full.has(m.kode) && m.usynligPaa.includes(port));
  w(`  ${port}: ${u.length === 0 ? "ingen — alle moduler i full stakk kan sees her" : u.map((m) => m.kode).join(", ")}`);
  for (const m of u) w(`      ${m.kode.padEnd(8)} ${m.merknad}`);
}
w("  «Bidrar 0» på en port der modulen er usynlig betyr IKKE at den er verdiløs.");
w("");

w("KONTROLLARMENE (ufravikelige):");
w("  gate 2      miljøet mot seg selv skal måle EKSAKT 0,0000");
w("  kampbenken  fire like agenter skal måle 0,2500");
w("  Avviker en av dem, er den benken i stykker og INGEN andre tall kan leses.");
w("");

/* ---- kommandoene, ordrett ---- */
w("KOMMANDOENE SOM VILLE BLITT KJØRT");
w("");
w(`PORT 1 — gate 2 (${giver} giv over ${skard} skard, alle ${armer.length} armer i samme kjøring):`);
w("  for S in 0.." + (skard - 1) + ":");
w("    node examples/gate2.ts \\");
for (const a of armer) w(`      --kandidat "${a.spek}" \\`);
w(`      --miljo "${FULLSPEK}" \\`);
w(`      --froe ${frøG} --giver ${giver} --skard S/${skard} \\`);
w(`      --ut ${gate2Fil(0).replace("-s0.", "-s$S.")}`);
w("  node examples/gate2.ts --rapport " + `"${katalog}/max-${merke}-g-s*.jsonl"`);
w("");
w(`PORT 2 — kampbenken (${kamper} kamper over ${skard} skard, ÉN kjøring PER ARM):`);
w("  for hver arm A, for S i 0.." + (skard - 1) + ":");
w("    node examples/kamp.ts --uparret \\");
w("      --kandidat \"<armens spek>\" --miljo \"<FULL>\" \\");
w(`      --kamper ${kamper} --froe ${frøK} --skard S/${skard} \\`);
w(`      --ut ${kampFil("<kode>", 0).replace("-s0.", "-s$S.")}`);
w("");

/* ---- presisjonen ---- */
/**
 * SE-formelen er prosjektets egen, fra `verktoy/mvp-dom.sh`: `0,163·sqrt(400/g)`
 * der `g` er antall giv. Den er kalibrert mot §103, som målte ±0,0519 over
 * 4000 giv (16 000 par).
 */
const seFor = (g: number): number => 0.163 * Math.sqrt(400 / g);
w("PRESISJONEN");
w(`  ${giver} giv gir ${giver * 4} par per arm, SE ca ±${seFor(giver).toFixed(4)} poeng/runde`);
w(`  til sammenlikning:  400 giv ±${seFor(400).toFixed(4)}   1600 ±${seFor(1600).toFixed(4)}   4000 ±${seFor(4000).toFixed(4)}`);
w("  En effekt må være over 2 SE OG ha tegntesten med seg. Aldri snittet alene.");
w("");

/* ---- kostnaden ---- */
const replaysG = giver * 4 * (armer.length + 1);
w("KOSTNADEN");
w(`  gate 2:  ${giver} giv x 4 seter x ${armer.length + 1} armer = ${replaysG.toLocaleString("nb-NO")} replays`);
if (msReplay > 0) {
  const timerEn = (replaysG * msReplay) / 3_600_000;
  w(`           ${msReplay} ms per replay (målt med --tid)`);
  w(`           ${timerEn.toFixed(0)} kjernetimer, dvs ~${(timerEn / skard).toFixed(1)} timer over ${skard} skard`);
} else {
  w(`           tid ukjent. Kjør «node examples/maxrigg.ts --tid --merke ${merke}» først,`);
  w(`           og gi tallet tilbake som --ms-replay.`);
}
const kampKjør = armer.length * skard;
w(`  kamp:    ${armer.length} armer x ${skard} skard = ${kampKjør} prosesser, ${kamper} kamper hver`);
if (msKamp > 0) {
  const timerK = (armer.length * kamper * msKamp) / 3_600_000;
  w(`           ${msKamp} ms per kamp (målt med --tid)`);
  w(`           ${timerK.toFixed(0)} kjernetimer, dvs ~${(timerK / skard).toFixed(1)} timer over ${skard} skard`);
  w(`           uparret: SE på vinnerandelen ca ±${Math.sqrt((0.25 * 0.75) / Math.max(1, kamper)).toFixed(4)} per arm`);
} else {
  w(`           tid ukjent. --ms-kamp <ms> gir anslaget.`);
}
w("");
w("  DELINGEN PÅ SKARD ER IKKE GRATIS. Kontensjonen er målt i denne riggen:");
w("  samme frø, samme speker, 25,2 s per replay med seks andre node-prosesser");
w("  på maskinen mot 5,1 s uten. Prosjektets kostnadssveip 7. august målte 67x");
w("  på en mettet CPU. Regn med at wall-clock blir 1,5–3x tallene over.");
w("");
w("FILENE (alle med skardsuffiks, alle skrevet av prosessen selv):");
w(`  ${gate2Fil(0)} ... ${gate2Fil(skard - 1)}`);
w(`  ${kampFil("<kode>", 0)} ...`);
w(`  ${armkartFil}   (armkartet — rapporten trenger det for å oversette spek til modul)`);
w(`  ${armlisteFil}`);
w(`  ${fullFil}`);
w(`  ${paramFil}`);
w(`  ${tørrFil}`);
w("");
w("INGENTING ER KJØRT. Dette er --toerr.");
w("");

const tekst = L.join("\n");
writeFileSync(tørrFil, tekst + "\n");
console.log(tekst);

/**
 * HVER ARMSPEK BYGGES, OGSÅ I TØRRMODUS.
 *
 * En skrivefeil i en spek er en streng, ikke en type. Uten dette ville den
 * blitt oppdaget av skard 7 etter fire timer — og bare i en .err-fil ingen
 * leser. `lagIndre` laster nettene, så dette koster ~1 sekund og betaler seg
 * første gang.
 */
let feil = 0;
for (const [spek, navn] of settSpeker) {
  try {
    lagIndre(spek);
  } catch (e) {
    feil++;
    console.error(`BYGGEFEIL i arm «${navn}»:\n  ${spek}\n  ${(e as Error).message}`);
  }
}
if (feil > 0) {
  console.error(`\n${feil} arm(er) lar seg IKKE bygge. Ingenting skal kjøres før det er rettet.`);
  process.exit(1);
}
console.log(`Alle ${settSpeker.size} armspeker lar seg bygge.`);
if (!tørr) {
  console.log("");
  console.log("Kjør riggen med: verktoy/adams-max.sh " + merke);
}
