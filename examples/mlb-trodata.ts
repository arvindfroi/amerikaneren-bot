/**
 * MLB FASE 0a — DATASETTET FOR TROHODET.
 *
 *   node examples/mlb-trodata.ts --giver 20000 --skard 0/20 --band trening \
 *     --ut mlb-tro-data/trening-0.bin
 *
 *   node examples/mlb-trodata.ts --kamp --hukommelse --signal --kamper 4000 \
 *     --skard 0/20 --band trening --spek "<spek>" --ut mlb-tro-data/kamp920/trening-0.bin
 *
 * For hver spillestilling: TREKKENE fra `spillerVisning(state, sete)` — aldri
 * fra `state` — og ETIKETTEN «hvilket sete holdt hvert usett kort», med en
 * FJERDE klasse for talongen.
 *
 * ===================== FASIT OM FORTIDEN, IKKE EN DOM ===================
 *
 * `docs/mlb.md` §0: «hvor kortene faktisk lå, kjent ved rundeslutt» står
 * uttrykkelig på lista over det som IKKE er et orakel. Ingen SD-evaluering,
 * ingen dobbeltdummy, ingen `d7alle`-etikett. Vi skriver bare ned hvor kortene
 * lå, og det vet vi fordi vi delte dem ut.
 *
 * ===================== DEN FJERDE KLASSEN ===============================
 *
 *   0   sett (egen hånd, alt spilt, eget vrak) — MASKERT BORT, ikke gjetning
 *   1–3 relativt sete
 *   4   TALONGEN (budvinnerens fire vrakede kort)
 *
 * Uten klasse 4 måtte modellen fordele talongens kort over tre hender som ikke
 * har dem. §117s forgjenger gjorde nettopp det ved å sammenlikne en marginal
 * fordeling mot et betinget gulv, og «viste» at Adams var verre enn uniform.
 * Det var målingen som var gal, ikke troen.
 *
 * BUDVINNEREN SER SITT EGET VRAK. For henne er de fire kortene ikke gjetning,
 * de får klasse 0, og talongklassen er umulig. `troTrekk` koder den
 * asymmetrien eksplisitt (`VRAK_KJENT`), slik at nettet slipper å gjette den.
 *
 * ===================== FRØBÅNDENE, AVSATT FØR FØRSTE RAD ================
 *
 * `docs/mlb.md` §5: «holdout-frøbånd avsatt før første kamp». Tre disjunkte
 * bånd, låst i koden her og aldri overlappende:
 *
 *   trening   41 000 000 + g·7717,  g < 100 000   → 41,0 M … 812,7 M
 *   holdout   1 100 000 000 + g·7717, g < 20 000  → 1,100 G … 1,254 G
 *   K8-prøven 12 000 000 + g·6151                 → `examples/tro-noyaktighet.ts`
 *
 * K8-båndet er `tro-noyaktighet.ts` sitt eget og ligger UNDER treningsbåndets
 * start. Nettet ser altså aldri en eneste giv fra prøven det skal dømmes på.
 *
 * ===================== FORMATET ========================================
 *
 * Rått binært, ikke JSONL. En rad er 660 flyttall; som JSON blir det ~6 kB og
 * en parsetid som dominerer treningen. Her: «MLBT», versjon, dim — og så faste
 * poster som numpy leser med én `fromfile`.
 *
 * ===================== --kamp: HELE KAMPER, MED HUKOMMELSE (11. sep) =====
 *
 * Uten `--kamp` spilles ÉN runde per giv med friske agenter, og hukommelsen går inn som
 * `null`. Et 804- eller 920-korpus kan ikke lages slik: i første runde er boka tom per
 * konstruksjon, så hukommelsesblokken ville vært null i HVER rad — og et nett trent på
 * det lærer at blokken ikke betyr noe, selv om den gjør det i spill.
 *
 * `--kamp` spiller hele kamper til `--maalpoeng` (100) med de samme fire agentene:
 *
 *   BOKA FOR BORDET  én `Hukommelse` ser HVER tilstand, også RUNDE_SLUTT. Den bokfører
 *                    bare ferdige runder, så en rad i runde r bærer runde < r (K2).
 *   AGENTENE         `observer(state)` på hver agent for hver tilstand, også RUNDE_SLUTT.
 *                    Løkka utfører NESTE selv og spør aldri en agent der, så uten kroken
 *                    kaster en spek med hukommelsestro (`sik:…~mlbu=<804/920>`, se
 *                    `src/moe2/soketro.ts`) i andre runde — samme krok som `kamp.ts`.
 *   BREDDEN          660 / 776 (`--signal`) / 804 (`--hukommelse`) / 920 (begge), alt via
 *                    `troTrekkForBredde`. NB: 920 er 804 + signal. Signalblokken ligger
 *                    altså ETTER hukommelsen (804–919), ikke på 660–775 som i 776.
 *   RUNDETAKET       `--maksrunder` (100). En kamp som ikke tar slutt, stoppes der;
 *                    radene som alt er skrevet er like gyldige.
 *
 * Radformatet er uendret. `frø` er KAMPENS frø og deles av alle radene i kampen, så
 * `mlb-tro-tren.py --hold-del` holder ut hele kamper, aldri halve.
 *
 * FRØBÅNDENE FOR --kamp — egne, og disjunkte fra hvert bånd som er dokumentert i repoet:
 *
 *   kamp-trening  1 950 000 000 + k·7717, k < 4 000  → 1,950 0 G … 1,980 9 G
 *   kamp-holdout  1 985 000 000 + k·7717, k < 1 500  → 1,985 0 G … 1,996 6 G
 *
 * De bor i hullet mellom styrkebåndet (1,900 G + k·7717, k < 200; `mlb-epoke.py`,
 * `mlb-port.ts`) og treningsbåndet til `mlb-data.ts` (2,000 G …). Sjekket mot: trodata
 * over (41 M–812,7 M, 1,100–1,254 G), K8-prøven 12 M, `budq-data` 15 M, `vrakq-data`
 * 23 M, `kamp.ts`/`kampport.sh` 700 M, selvspillepokene 1,300–1,500 G, `analyse/126-*`
 * 1,6/1,7/1,75 G, portbåndene 1,800/1,850 G, `mlb-motalle` 2,100/2,150 G,
 * `mlb-vanesplitt` 2,400 G og `mlb-data` 2,000 G/3,000 G. Øvre ende ligger under
 * 2³¹ − 1 med vilje: frøet skrives som `frø | 0`, og et bånd over ville kommet
 * NEGATIVT ut i fila og blandet seg med alt `--hold-del` hasher.
 *
 * Standarden (uten `--kamp`) er byte-identisk med før: samme giv, samme utvalg, samme
 * rader. `test/mlb-trodata-kamp.test.ts` holder begge.
 *
 * ===================== POPULASJONEN (`--drivere`, 11. sep) ==============
 *
 * `--drivere "A|B|C|D"` gir hvert sete sin spek, `@` = kandidaten (`--spek`), og BARE
 * `@`-setene skriver rader: troen skal læres av kandidatens stol, om motstandere som
 * faktisk har ulike vaner (K6 → K8). `--rotasjon` flytter setene én plass per giv/kamp.
 * Se `examples/drivere.ts`. Uten flagget er radene byte-identiske med før.
 *
 * ===================== --menneske: INNSPILTE MENNESKEKAMPER (11. sep) ====
 *
 *   node examples/mlb-trodata.ts --menneske D:/amb-grp/menneske/hendelser.jsonl --band trening \
 *     --hukommelse --signal --ut mlb-tro-data/menneske920/trening-0.bin [--etter 2026-08-10] [--budspek <v5>]
 *
 * Trohodet og hukommelsen er trent bare på selvspill, og et trohode trent mot én motstandertype
 * falt fra 12,34 % til 5,09 % av veien gulv → tak mot en annen. Rader fra ~273 menneskekamper
 * (fra 10. aug) er det nærmeste vi har treningsdata MOT MENNESKER.
 *
 * Kampene gås runde for runde av `menneske-logg.ts`, som gjør hver loggført runde om til ekte
 * tilstander og KONTROLLERER dem (budvinner og kontrakt, lovlige trekk, loggens poeng). Løkka
 * er da den samme som i `--kamp`: én bok for bordet ser hver tilstand (kampslutt vist som
 * rundeslutt), og hver SPILL-stilling med ukjente kort skrives med sjansen `--sjanse` — alle
 * fire seter, også menneskets. Samme radformat og samme bredder (660/776/804/920), så
 * `verktoy/mlb-tro-tren.py` leser fila uendret.
 *
 * BÅNDENE er `menneskeBånd(kamp-id)`: hver fjerde kamp er holdout, avsatt på id før første rad.
 * `--band trening` og `--band holdout` er derfor disjunkte på KAMP, og `menneske-tro.ts --band
 * holdout` dømmer et nett trent på trening. `frø` i posten er kampens frø fra Val Town (tilfeldig
 * 32-bit, `frø | 0` kan bli negativt) — bruk båndene, ikke `--hold-del`, på disse radene.
 *
 * `--kamp`, `--giver`, `--fra`, `--drivere`, `--rotasjon` og `--spek` avvises med `--menneske`:
 * ingen agent spiller et kort her. Uten flagget er alt byte-identisk med før (sha1 før/etter).
 *
 * ===================== --myk: POSTERIOREN SOM ETIKETT (12. sep) ==========
 *
 *   node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --myk --spek "<pol>" \
 *     --drivere "@|A|@|B" --rotasjon --band trening --kamper 450 --skard 0/6 --ut <fil>
 *
 * Én-hot «hvor lå kortet» er ett trekk fra posterioren, og løkkas trotrening overtilpasser etter
 * én epoke. Med `--myk` får hver rad der den EKSAKTE posterioren er nåbar (`examples/myk-etikett.ts`,
 * størrelse ≤ `--myk-grense`, standard 1e6) posteriorens marginaler over de fire klassene som
 * etikett i tillegg til én-hot. Inngangene er uendret (K2); etiketten leser den vaskede loggen og
 * policydefinisjonene.
 *
 * TO ENDRINGER I SPILLET, begge nødvendige for at posterioren skal være taket for bordet:
 *   KANONISKE AGENTER  alle seter spiller `kanoniskAgent` (hånd, talong og vrak sortert, frø 0).
 *                      Uten det bryter speken likhet etter skjult håndorden og den sanne given er
 *                      uforenlig (agent P: 5 av 24 kamper). Kampene med `--myk` skiller seg derfor
 *                      fra kampene uten i likhetsbrudd — samme bord, ikke samme bytes.
 *   SKYGGEAGENTER      fire egne agenter fra de samme spekene (per slot, rotert som bordet) ser hver
 *                      ekte tilstand via `observer` og spiller aldri; de definerer likelihooden.
 *
 * FORMATET er VERSJON 2 bare med `--myk`: etter (trekk, etikett, frø, stikk, sete) kommer `rolle`
 * (i8: 0 budvinner, 1 makker, 2 motspiller), `myk` (u8: 1 = posterioren står der) og 208 × f32
 * (nuller når `myk` er 0). Uten flagget er fila versjon 1 og byte-identisk med før;
 * `verktoy/mlb-tro-tren.py` leser begge. Dekningen per rolle × stikk (myk / over grensen /
 * uforenlig / tom, og ms) skrives av prosessen selv til `<ut>.myk.json`.
 */

import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { spillerVisning } from "../src/motor.ts";
import { lagIndre, ADAMS_MAALT } from "../src/moe2/agentspek.ts";
import { troFasit } from "../src/mlb/fasit.ts";
import { Hukommelse } from "../src/mlb/hukommelse.ts";
import {
  MLB_TRO_INN,
  MLB_TRO_INN_H,
  MLB_TRO_INN_HS,
  MLB_TRO_INN_HS2,
  MLB_TRO_INN_HS2T,
  MLB_TRO_INN_S,
  troTrekkForBredde,
} from "../src/mlb/trotrekk.ts";
import { Tempobok } from "../src/mlb/tempotrekk.ts";
import { SEKV_FELT, SEKV_LENGDE, SEKV_MAKS, sekvensTrekk } from "../src/mlb/sekvens.ts";
import { bordTekst, lesBord, slot, tilSeter } from "./drivere.ts";
import { kanoniskAgent, type Loggpost } from "./naabart-tro.ts";
import { MYK_GRENSE, MYK_UT, MykEtiketter, rolleAv, type MykUtfall } from "./myk-etikett.ts";
import {
  kamprunder,
  lesMenneskelogg,
  MENNESKE_FRA,
  rundeTempo,
  menneskeBånd,
  nyTeller,
  skardAv,
  somRundeslutt,
  tellerTekst,
  V5_KJEDE,
} from "./menneske-logg.ts";

const arg =(n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const tall = (s: string, f: number): number => (Number.isFinite(Number(s)) ? Number(s) : f);
const har = (n: string): boolean => process.argv.includes(n);

/** Båndene. Endres de, blir alle tidligere datasett uforenlige — derfor låst her. */
export const BÅND: Record<string, { base: number; steg: number }> = {
  trening: { base: 41_000_000, steg: 7717 },
  holdout: { base: 1_100_000_000, steg: 7717 },
};

/** `--kamp` sine bånd (se toppen). `maks` er antall KAMPER båndet er avsatt til. */
export const KAMP_BÅND: Record<string, { base: number; steg: number; maks: number }> = {
  trening: { base: 1_950_000_000, steg: 7717, maks: 4_000 },
  holdout: { base: 1_985_000_000, steg: 7717, maks: 1_500 },
};

/**
 * `--kamp` spiller hele kamper; uten flagget er alt under nøyaktig som før.
 * `--hukommelse` uten `--kamp` avvises: boka er tom i hver rad da, og et 804-korpus
 * med bare nuller i blokken er verre enn ingen — det SER riktig ut.
 */
const KAMP = har("--kamp");
const HUKOMMELSE = har("--hukommelse");
/** `--menneske <hendelser.jsonl>`: rader fra innspilte menneskekamper (se toppen). */
const MENNESKE_DATA = arg("--menneske", "");
const MENNESKE = MENNESKE_DATA !== "";
if (MENNESKE && KAMP) throw new Error("--menneske og --kamp utelukker hverandre: menneskekampene er alt hele kamper");
if (MENNESKE) {
  for (const n of ["--giver", "--fra", "--drivere", "--rotasjon", "--spek"]) {
    if (har(n)) throw new Error(`${n} gjelder ikke --menneske: ingen agent spiller et kort der`);
  }
}
if (HUKOMMELSE && !KAMP && !MENNESKE) throw new Error("--hukommelse krever --kamp: med én runde per giv er boka tom i hver rad");
for (const n of ["--kamper", "--maksrunder", "--maalpoeng"]) {
  if (har(n) && !KAMP) throw new Error(`${n} gjelder bare --kamp`);
}
if (KAMP && har("--giver")) throw new Error("--kamp teller kamper: bruk --kamper, ikke --giver");

const BAND = arg("--band", "trening");
const bånd = BÅND[BAND];
if (bånd === undefined) throw new Error(`Ukjent bånd «${BAND}» (trening|holdout)`);
const GIVER = tall(arg("--giver", "2000"), 2000);
/** Første giv-nummer (kampnummer med `--kamp`). Finnes for å UTVIDE et datasett uten å lage det om igjen. */
const FRA = tall(arg("--fra", "0"), 0);
if (!KAMP && BAND === "trening" && GIVER > 100_000) throw new Error("treningsbåndet er avsatt til 100 000 giv");
if (!KAMP && BAND === "holdout" && GIVER > 20_000) throw new Error("holdout-båndet er avsatt til 20 000 giv");
const KAMPER = tall(arg("--kamper", "200"), 200);
const MAKSRUNDER = tall(arg("--maksrunder", "100"), 100);
const MÅLPOENG = tall(arg("--maalpoeng", "100"), 100);
if (KAMP) {
  const kb = KAMP_BÅND[BAND]!;
  if (KAMPER > kb.maks) throw new Error(`kamp-${BAND}-båndet er avsatt til ${kb.maks} kamper`);
  if (!(MAKSRUNDER >= 1)) throw new Error(`--maksrunder må være ≥ 1, fikk ${MAKSRUNDER}`);
}
/** Andel spillestillinger som skrives. 1 gir sterkt korrelerte naborader. */
const SJANSE = tall(arg("--sjanse", "0.5"), 0.5);
const SPEK = arg("--spek", ADAMS_MAALT);
const UT = arg("--ut", MENNESKE ? `mlb-tro-data/menneske-${BAND}-0.bin` : KAMP ? `mlb-tro-data/kamp-${BAND}-0.bin` : `mlb-tro-data/${BAND}-0.bin`);
const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [number, number];
/**
 * `--signal` (11. sep, K8 kanal 5 og 2): signalblokken bakerst, 660 → 776 trekk. Uten
 * flagget er radene byte-identiske med før. Frøbåndene og utvalget er de samme, så et
 * 776-korpus inneholder nøyaktig de samme stillingene som 660-korpuset.
 */
const SIGNAL = har("--signal");
/**
 * `--sanser2` (11. sep): stillingen per sete og valgt bort (`src/mlb/stillingtrekk.ts`,
 * `src/mlb/valgtbort.ts`) bakerst etter 920, altså 996 trekk. Krever `--hukommelse --signal`
 * og hele kamper – `--kamp` ELLER `--menneske` (begge går gjennom `troTrekkForBredde(DIM, …)`
 * med boka): det finnes bare ÉN sanser-2-bredde, og den er 920 med nuller bakerst for et
 * utvidet nett. Uten flagget er radene byte-identiske med før.
 *
 * Vakten krevde først `--kamp` alene, og da kunne menneskeradene (agent I) aldri skrives i
 * samme bredde som selvspillet (agent K) – begge grenene var grønne hver for seg.
 */
const SANSER2 = har("--sanser2");
if (SANSER2 && !((KAMP || MENNESKE) && HUKOMMELSE && SIGNAL)) {
  throw new Error("--sanser2 legger 76 trekk bak 920: krever --hukommelse --signal og --kamp eller --menneske");
}
/**
 * `--tempo` (12. sep): TENKETIDEN til de andre setene bakerst etter 996, altså 1028 trekk
 * (`src/mlb/tempotrekk.ts`). Krever `--menneske` og `--sanser2`: tidene finnes BARE i
 * menneskeloggen — selvspill har ingen — og det finnes bare én tempobredde, 1028, slik at
 * et 996-nett utvidet med nullkolonner gir nøyaktig samme svar. Uten flagget er radene
 * byte-identiske med før.
 *
 * BOKA BÆRER BARE FERDIGE RUNDER, nøyaktig som `Hukommelse`: en rad i runde r ser tidene
 * fra runde < r. Det er strengere enn det som er lovlig — et menneske ved bordet ser jo
 * nølingen i inneværende runde også — men det er den samme K2-disiplinen resten av
 * korpuset har, og det gjør det umulig for en beslutnings EGEN tid å havne i raden som
 * beskriver den. Tidene inne i runden kan legges til senere; da må de bokføres etter hver
 * beslutning, ikke etter runden.
 */
const TEMPO = har("--tempo");
if (TEMPO && !(MENNESKE && SANSER2)) {
  throw new Error("--tempo legger 32 trekk bak 996: krever --sanser2, og --menneske (bare menneskeloggen har tider)");
}
const DIM = TEMPO
  ? MLB_TRO_INN_HS2T
  : SANSER2
  ? MLB_TRO_INN_HS2
  : SIGNAL
  ? HUKOMMELSE ? MLB_TRO_INN_HS : MLB_TRO_INN_S
  : HUKOMMELSE ? MLB_TRO_INN_H : MLB_TRO_INN;

/** `--myk` (se toppen): posterioren som etikett der den er nåbar, versjon 2. Bare hele kamper med agenter. */
const MYK = har("--myk");
if (MYK && !KAMP) throw new Error("--myk krever --kamp: skyggeagentene og loggen følger kampen (og --menneske har ingen kjente policyer)");
if (har("--myk-grense") && !MYK) throw new Error("--myk-grense gjelder bare --myk");
const MYK_GRENSE_ARG = tall(arg("--myk-grense", String(MYK_GRENSE)), MYK_GRENSE);
if (MYK && !(MYK_GRENSE_ARG >= 0)) throw new Error("--myk-grense må være ≥ 0");

/**
 * ===================== SONDEFLAGGENE (12. sep) ==========================
 *
 * Måleoppdraget: er flaskehalsen for K8 en MANGLENDE SANS, eller at boten ikke klarer å bruke
 * sansene den alt har? Begge flaggene under skriver EGNE filer ved siden av korpuset, og rører
 * ikke én byte i `UT`. Det er ikke en høflighet — løkka leser korpuset hver iterasjon, og en
 * sonde som endret det, ville byttet ut treningsdataene til produksjonen mens den målte dem.
 * `test/mlb-sekvens.test.ts` krever sha1-likhet med og uten flaggene.
 *
 *   --bordmerke  `<ut>.bord.json`: hvem satt i hvilken SLOT, rotasjonen, og båndets base/steg.
 *                Etiketten «hvilken motstandertype satt i relativt sete r» er dermed en
 *                funksjon av (frø, sete) ALENE — kampnummeret er `(frø − base) / steg`, og
 *                slotten i setet er `(sete + kamp) mod 4`. Ingen rad trenger et eget felt, og
 *                etiketten kan ikke lekke inn i trekkene fordi den ikke er i fila med dem.
 *   --sekvens    `<ut>.sekv.bin`: den ordnede kortrekka per rad (`src/mlb/sekvens.ts`), i
 *                NØYAKTIG samme radrekkefølge som korpuset. Til sonde B, som spør om
 *                rekkefølgen bærer noe aggregatene ikke har.
 */
const BORDMERKE = har("--bordmerke");
const SEKVENS = har("--sekvens");
for (const n of ["--bordmerke", "--sekvens"]) {
  // Begge hviler på kampnummeret og på at boka er kampens: uten `--kamp` finnes ingen av delene.
  if (har(n) && !KAMP) throw new Error(`${n} krever --kamp: sonden merker kamper, ikke enkeltgiv`);
}

mkdirSync(dirname(UT), { recursive: true });
const fd = openSync(UT, "w");
{
  const hode = Buffer.alloc(12);
  hode.write("MLBT", 0, "ascii");
  hode.writeInt32LE(MYK ? 2 : 1, 4);
  hode.writeInt32LE(DIM, 8);
  writeSync(fd, hode);
}
/** Versjon 2 (`--myk`): + rolle i8 + myk u8 + 208 × f32. */
const POST = DIM * 4 + 52 + 4 + 2 + 2 + (MYK ? 1 + 1 + MYK_UT * 4 : 0);
/** Skriv i klumper: én `writeSync` per rad ga 3× lengre kjøretid enn spillingen. */
const KLUMP = 512;
const buf = Buffer.alloc(POST * KLUMP);
let iKlump = 0;
/** `--sekvens`: «MLBS», versjon, maks steg, felt per steg — og så n (i16) + 48 × 4 × i16 per rad. */
const SEKV_POST = 2 + SEKV_LENGDE * 2;
const sekvFd = SEKVENS ? openSync(`${UT}.sekv.bin`, "w") : -1;
if (SEKVENS) {
  const hode = Buffer.alloc(16);
  hode.write("MLBS", 0, "ascii");
  hode.writeInt32LE(1, 4);
  hode.writeInt32LE(SEKV_MAKS, 8);
  hode.writeInt32LE(SEKV_FELT, 12);
  writeSync(sekvFd, hode);
}
const sekvBuf = SEKVENS ? Buffer.alloc(SEKV_POST * KLUMP) : Buffer.alloc(0);
const tøm = (): void => {
  if (iKlump > 0) {
    writeSync(fd, buf, 0, POST * iKlump);
    // Samme `iKlump`, samme tømming: radene i de to filene kan ikke komme ut av takt.
    if (SEKVENS) writeSync(sekvFd, sekvBuf, 0, SEKV_POST * iKlump);
  }
  iKlump = 0;
};

let skrevet = 0;
/** Én post: trekk, etikett, frø, stikk, sete. Felles for begge løkkene, så formatet er ett. */
const skrivRad = (t: Float32Array, f: ArrayLike<number>, frø: number, stikk: number, sete: number, myk?: { rolle: number; p: Float32Array | null }, sekv?: { n: number; v: Int16Array }): void => {
  let o = iKlump * POST;
  for (let i = 0; i < DIM; i++) {
    buf.writeFloatLE(t[i]!, o);
    o += 4;
  }
  for (let i = 0; i < 52; i++) buf.writeInt8(f[i]!, o + i);
  o += 52;
  buf.writeInt32LE(frø | 0, o);
  buf.writeInt16LE(stikk, o + 4);
  buf.writeInt16LE(sete, o + 6);
  if (MYK) {
    if (myk === undefined) throw new Error("--myk: raden mangler rolle og etikett");
    buf.writeInt8(myk.rolle, o + 8);
    buf.writeUInt8(myk.p === null ? 0 : 1, o + 9);
    // Bufferet gjenbrukes mellom klumpene: nullene skrives, de arves ikke.
    for (let i = 0; i < MYK_UT; i++) buf.writeFloatLE(myk.p === null ? 0 : myk.p[i]!, o + 10 + i * 4);
  }
  if (SEKVENS) {
    if (sekv === undefined) throw new Error("--sekvens: raden mangler handlingsrekka");
    let o2 = iKlump * SEKV_POST;
    sekvBuf.writeInt16LE(sekv.n, o2);
    o2 += 2;
    // Bufferet gjenbrukes mellom klumpene: fyllverdiene skrives, de arves ikke.
    for (let i = 0; i < SEKV_LENGDE; i++) sekvBuf.writeInt16LE(sekv.v[i]!, o2 + i * 2);
  }
  if (++iKlump === KLUMP) tøm();
  skrevet++;
};

/** Ingen ukjente igjen betyr ingenting å lære av. */
const harUkjente = (f: ArrayLike<number>): boolean => {
  let noe = false;
  for (let i = 0; i < 52; i++) if (f[i]! > 0) noe = true;
  return noe;
};

type Agent = { velgHandling(s: GameState): Handling; nyKamp(): void; observer?(s: GameState): void };
/** Én spek per sete; uten `--drivere` fire ganger `SPEK`, alle registrert (se `drivere.ts`). */
const BORD = lesBord(process.argv, SPEK);
// Per SLOT, i samme rekkefølge som før (slot = sete uten `--rotasjon`). `observer`/`nyKamp` går til alle.
// `--myk`: KANONISKE agenter ved bordet og egne skyggeagenter per slot (se toppen). Uten flagget som før.
const agenter: Agent[] = BORD.spek.map((x) => (MYK ? kanoniskAgent(lagIndre(x)) : lagIndre(x)));
const skygge = MYK ? BORD.spek.map((x) => kanoniskAgent(lagIndre(x))) : [];
if (BORD.blandet) console.log(`Bord (giv/kamp 0): ${bordTekst(BORD, 0)}${BORD.rotasjon ? "  [roterer per giv/kamp]" : ""}`);

let rng = 8_675_309 + SI * 7919;
const tilfeldig = (): number => {
  rng = (rng * 1103515245 + 12345) & 0x7fffffff;
  return rng / 0x7fffffff;
};

const t0 = Date.now();
if (MENNESKE) {
  const ETTER = arg("--etter", MENNESKE_FRA);
  const budgivere = [0, 1, 2, 3].map(() => lagIndre(arg("--budspek", V5_KJEDE)));
  const medBok = DIM === MLB_TRO_INN_H || DIM === MLB_TRO_INN_HS;
  const teller = nyTeller();
  let kamper = 0;
  /** `--tempo`: hvor mye loggen FAKTISK bar, skrevet ut så ingen tror korpuset er fullt av tider. */
  let medTempo = 0;
  let rundeTot = 0;
  for (const [id, kamp] of lesMenneskelogg(MENNESKE_DATA)) {
    if (kamp.start === null || skardAv(id, SN) !== SI || menneskeBånd(id) !== BAND) continue;
    if (ETTER !== "" && !kamp.runder.some((r) => r.tid >= ETTER)) continue;
    const frø = Number(kamp.start.data["frø"]);
    kamper++;
    // Én bok for bordet, ny per kamp — og ny der loggen har et hull eller en runde ble avvist.
    let bok = new Hukommelse();
    // Tempoboka følger hukommelsen: samme levetid, samme nullstilling, bare ferdige runder.
    let tbok = TEMPO ? new Tempobok() : null;
    for (const steg of kamprunder(kamp, budgivere, teller)) {
      if (steg.nyBok) {
        bok = new Hukommelse();
        if (TEMPO) tbok = new Tempobok();
      }
      if (steg.runde === null) continue;
      // Runder før `--etter` spilles gjennom boka, men blir ikke rader.
      const skriv = ETTER === "" || steg.hendelse.tid >= ETTER;
      for (const s0 of steg.runde.tilstander) {
        const s = somRundeslutt(s0);
        bok.observer(s);
        if (skriv && s.fase === "SPILL" && s.iTur !== null && tilfeldig() < SJANSE) {
          const sete = s.iTur;
          const f = troFasit(s, sete);
          if (harUkjente(f)) {
            // K2: visningen alene, og bøkene — som begge bare kjenner FERDIGE runder.
            const huk = medBok ? bok.vektor(sete, s.antallSpillere) : null;
            const t = troTrekkForBredde(DIM, spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng, huk, tbok);
            skrivRad(t, f, frø, s.stikkSpilt, sete);
          }
        }
      }
      // ETTER radene: runden er ferdig, og tidene fra den kan bokføres for de neste.
      rundeTot++;
      if (rundeTempo(steg.hendelse) !== null) medTempo++;
      if (tbok !== null) {
        const tid = steg.runde.tempo;
        tbok.rundeSett(tid !== null && tid.length > 0);
        for (const h of tid ?? []) tbok.se(h);
      }
    }
    const sek = (Date.now() - t0) / 1000;
    process.stdout.write(`  skard ${SI}: ${kamper} menneskekamper, ${skrevet} rader, ${(skrevet / Math.max(1, sek)).toFixed(0)}/s\r`);
  }
  tøm();
  closeSync(fd);
  console.log(
    `\nSkard ${SI} ferdig: ${kamper} menneskekamper i båndet ${BAND}, ${tellerTekst(teller)}, ` +
      `${skrevet} rader (${DIM} trekk${medBok ? ", med hukommelse" : ""}${SIGNAL ? ", med signalblokk" : ""}` +
      `${TEMPO ? `, med tempoblokk — ${medTempo} av ${rundeTot} gjenskapte runder bar tider` : ""}) -> ${UT}`,
  );
} else if (!KAMP) {
  for (let g = FRA + SI; g < GIVER; g += SN) {
    const frø = bånd.base + g * bånd.steg;
    let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
    for (const a of agenter) a.nyKamp();
    const seter = tilSeter(BORD, agenter, g);
    let vakt = 0;
    while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && vakt++ < 400) {
      // Opptaket sjekkes FØR trekningen: uten `--drivere` er det alltid sant, og rng-strømmen som før.
      if (s.fase === "SPILL" && s.iTur !== null && BORD.opptak[slot(BORD, s.iTur, g)] && tilfeldig() < SJANSE) {
        const sete = s.iTur;
        const f = troFasit(s, sete);
        if (harUkjente(f)) {
          const t = troTrekkForBredde(DIM, spillerVisning(s, sete), s.giving.antallStikk, s.regler.målPoeng, null);
          skrivRad(t, f, frø, s.stikkSpilt, sete);
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      s = utfør(s, seter[iTur]!.velgHandling(s)).state;
    }
    if (g % 200 === SI % 200) {
      const sek = (Date.now() - t0) / 1000;
      process.stdout.write(`  skard ${SI}: ${skrevet} rader, ${(skrevet / Math.max(1, sek)).toFixed(0)}/s\r`);
    }
  }
  tøm();
  closeSync(fd);
  console.log(`\nSkard ${SI} ferdig: ${skrevet} rader (${DIM} trekk${SIGNAL ? ", med signalblokk" : ""}) -> ${UT}`);
} else {
  const kb = KAMP_BÅND[BAND]!;
  const medBok = DIM === MLB_TRO_INN_H || DIM === MLB_TRO_INN_HS || DIM === MLB_TRO_INN_HS2;
  let runder = 0;
  let kamper = 0;
  let kappet = 0;
  /** DEKNINGEN med `--myk`, per rolle × stikk (se `myk-etikett.ts` for utfallene). */
  type Dekning = { rolle: number; stikk: number; rader: number; myk: number; over: number; uforenlig: number; tom: number; ms: number; msMyk: number; kall: number };
  const dekning = new Map<string, Dekning>();
  const tellMyk = (rolle: number, stikk: number, utfall: MykUtfall, ms: number, kall: number): void => {
    const nøkkel = `${rolle}|${stikk}`;
    const d = dekning.get(nøkkel) ?? { rolle, stikk, rader: 0, myk: 0, over: 0, uforenlig: 0, tom: 0, ms: 0, msMyk: 0, kall: 0 };
    d.rader++;
    d[utfall]++;
    d.ms += ms;
    if (utfall === "myk") d.msMyk += ms;
    d.kall += kall;
    dekning.set(nøkkel, d);
  };
  for (let k = FRA + SI; k < KAMPER; k += SN) {
    const frø = kb.base + k * kb.steg;
    let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: MÅLPOENG }, frø);
    for (const a of agenter) a.nyKamp();
    for (const a of skygge) a.nyKamp();
    const seter = tilSeter(BORD, agenter, k);
    // Skyggeagentene sitter der bordets agenter sitter (samme rotasjon): de definerer likelihooden per sete.
    const myk = MYK ? new MykEtiketter(tilSeter(BORD, skygge, k), MYK_GRENSE_ARG) : null;
    let logg: Loggpost[] = [];
    // Én bok for bordet, ny per kamp: hukommelsen er KAMPENS, aldri korpusets.
    const bok = new Hukommelse();
    let vakt = 0;
    while (s.fase !== "FERDIG" && vakt++ < 500_000) {
      bok.observer(s);
      for (const a of agenter) a.observer?.(s);
      for (const a of skygge) a.observer?.(s);
      // Ny runde (også når alle passet): loggen og filtrene starter på nytt i givens første budstilling.
      if (myk !== null && logg.length > 0 && s.rundeNr !== logg[0]!.s.rundeNr) {
        logg = [];
        myk.nyRunde();
      }
      if (s.fase === "RUNDE_SLUTT") {
        if (s.rundeNr + 1 >= MAKSRUNDER) {
          kappet++;
          break;
        }
        s = utfør(s, { type: "NESTE" }).state;
        continue;
      }
      if (s.fase === "SPILL" && s.iTur !== null && BORD.opptak[slot(BORD, s.iTur, k)] && tilfeldig() < SJANSE) {
        const sete = s.iTur;
        const f = troFasit(s, sete);
        if (harUkjente(f)) {
          // K2: visningen alene, og boka — som bare kjenner FERDIGE runder.
          const huk = medBok ? bok.vektor(sete, s.antallSpillere) : null;
          const vis = spillerVisning(s, sete);
          const t = troTrekkForBredde(DIM, vis, s.giving.antallStikk, s.regler.målPoeng, huk);
          // Sonde B: rekka bygges av NØYAKTIG samme visning som trekkene, så K2 arves i stedet for å loves.
          const sekv = SEKVENS ? sekvensTrekk(vis) : undefined;
          if (myk === null) skrivRad(t, f, frø, s.stikkSpilt, sete, undefined, sekv);
          else {
            // Etiketten leser den vaskede loggen og skyggeagentene; inngangen over er urørt (K2).
            const rolle = rolleAv(s, sete);
            const e = myk.etikett(logg, s, sete, f);
            tellMyk(rolle, s.stikkSpilt, e.utfall, e.ms, e.kall);
            skrivRad(t, f, frø, s.stikkSpilt, sete, { rolle, p: e.p });
          }
        }
      }
      const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (iTur === null || iTur === undefined) break;
      const h = seter[iTur]!.velgHandling(s);
      if (myk !== null) logg.push({ s, h });
      s = utfør(s, h).state;
    }
    runder += s.rundeNr + 1;
    kamper++;
    const sek = (Date.now() - t0) / 1000;
    const nMyk = [...dekning.values()].reduce((a, d) => a + d.myk, 0);
    process.stdout.write(
      `  skard ${SI}: ${kamper} kamper, ${runder} runder, ${skrevet} rader${MYK ? ` (${nMyk} myke)` : ""}, ${(skrevet / Math.max(1, sek)).toFixed(0)}/s\r`,
    );
  }
  tøm();
  closeSync(fd);
  if (SEKVENS) closeSync(sekvFd);
  /**
   * SONDEMERKET: skrevet av prosessen som FAKTISK spilte kampene, ikke gjenskapt av en leser.
   * `spek` er per SLOT; slotten som satt i sete `s` i kamp `k` er `(s + k) mod 4` med rotasjon,
   * og kampnummeret er `(frø − base) / steg`. Etiketten til sonde A følger av de to alene.
   */
  if (BORDMERKE) {
    writeFileSync(
      `${UT}.bord.json`,
      JSON.stringify(
        {
          kandidat: SPEK,
          spek: BORD.spek,
          opptak: BORD.opptak,
          rotasjon: BORD.rotasjon,
          blandet: BORD.blandet,
          band: BAND,
          base: kb.base,
          steg: kb.steg,
          fra: FRA,
          kamper: KAMPER,
          skard: [SI, SN],
          rader: skrevet,
          sekvens: SEKVENS ? { maks: SEKV_MAKS, felt: SEKV_FELT } : null,
        },
        null,
        1,
      ),
    );
  }
  console.log(
    `\nSkard ${SI} ferdig: ${kamper} kamper (${kappet} stoppet på rundetaket ${MAKSRUNDER}), ${runder} runder, ` +
      `${skrevet} rader (${DIM} trekk${medBok ? ", med hukommelse" : ""}${SIGNAL ? ", med signalblokk" : ""}) -> ${UT}`,
  );
  if (MYK) {
    // DEKNINGEN SKRIVES AV PROSESSEN SELV (langkjøringer): per rolle × stikk, og bordet den gjelder.
    const rader = [...dekning.values()].sort((a, b) => a.rolle - b.rolle || a.stikk - b.stikk);
    const sum = (f: (d: Dekning) => number): number => rader.reduce((a, d) => a + f(d), 0);
    const sek = (Date.now() - t0) / 1000;
    writeFileSync(
      `${UT}.myk.json`,
      JSON.stringify({ bord: bordTekst(BORD, FRA + SI), grense: MYK_GRENSE_ARG, kamper, rader: skrevet, myk: sum((d) => d.myk), over: sum((d) => d.over), uforenlig: sum((d) => d.uforenlig), tom: sum((d) => d.tom), sek, msMyk: sum((d) => d.msMyk), msAlle: sum((d) => d.ms), perRolleStikk: rader }, null, 1),
    );
    const navn = ["budvinner", "makker", "motspiller"];
    for (let r = 0; r < 3; r++) {
      const R = rader.filter((d) => d.rolle === r);
      const n = R.reduce((a, d) => a + d.rader, 0);
      const m = R.reduce((a, d) => a + d.myk, 0);
      const u = R.reduce((a, d) => a + d.uforenlig, 0);
      const ms = R.reduce((a, d) => a + d.msMyk, 0);
      console.log(
        `  myk ${navn[r]!.padEnd(10)} ${String(m).padStart(6)} av ${String(n).padStart(6)} rader (${((100 * m) / Math.max(1, n)).toFixed(1)} %), uforenlig ${u}, ` +
          `${(ms / Math.max(1, m)).toFixed(0)} ms per myk; per stikk ${R.filter((d) => d.myk > 0).map((d) => `${d.stikk}:${d.myk}/${d.rader}`).join(" ")}`,
      );
    }
    console.log(`  myk: ${sum((d) => d.myk)} av ${skrevet} rader, ${(sum((d) => d.ms) / 1000).toFixed(0)} s i etikettene av ${sek.toFixed(0)} s -> ${UT}.myk.json`);
  }
}
