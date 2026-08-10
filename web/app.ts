/**
 * «Amerikaneren mot PIMC» – TV-vennlig nettspill.
 *
 * Hele spillmotoren + PIMC-solveren kjører i nettleseren (null latens).
 * Mennesket sitter på sete 0 (Sør); sete 1–3 er PIMC-boter med tidsbudsjett.
 * Designet for visning via Chromecast: store kort, høy kontrast,
 * firefarget kortstokk (fargeblind-vennlig), tastaturnavigasjon og
 * aria-live-oppleser. Hver runde og hvert menneskevalg logges til
 * datainnsamlings-endepunktet (Val Town) + localStorage som reserve.
 */

import { velgHandling } from "../src/bot/bot.ts";
import { fraKortId, kortId, type Farge, type Kort } from "../src/kort.ts";
import {
  lovligeEtterlys,
  lovligeHandlinger,
  opprettSpill,
  utfør,
  type GameState,
  type Handling,
  type Hendelse,
} from "../src/motor.ts";
import { NeatAgent } from "../src/neat/agent.ts";
import { genomFraJson } from "../src/neat/genom.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { Konvensjonsvakt, lesVaktflagg } from "../src/moe2/konvensjonsvakt.ts";
import { Vrakrangerer } from "../src/moe2/vrakrang.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
// Fra budmodell.ts og IKKE budagent.ts: den siste importerer node:fs paa
// toppniva, og esbuild med nettleserplattform stopper paa den.
import { Budagent, tolkBudmodell } from "../src/moe2/budmodell.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../src/regler.ts";

// --- Oppsett ----------------------------------------------------------------
const DATA_URL = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";
const MENNESKE = 0;

// --- MesterAI-bro (kun når spillet serveres lokalt over HTTP) ---------------
// Farmor spiller mot appens EKTE MesterAI når hele spillet serveres fra
// laptopens bro (arena/mesterai-bro.ts) over HTTP. Da er /mester samme opphav
// (ingen HTTPS/mixed-content-blokkering på iPad-en). På Vercel (HTTPS) er
// LOKAL falsk, så MesterAI vises ikke og spillet er uendret.
const LOKAL = location.protocol === "http:";
const MESTER_URL = `${location.origin}/mester`;
const MESTER_SETER = [1, 2, 3]; // botsetene styres av MesterAI i bro-modus

// --- Vår beste bot ----------------------------------------------------------
// Vrak og trumfvalg gjøres av den lærte rangereren (`vrakrang.ts`), med
// NevroHjernes eget par alltid blant kandidatene – så den kan bare forbedre.
// Nettleseren laster `src/e1/agent.ts`, `konvensjonsvakt.ts`, `budmodell.ts` og
// `vrakrang.ts` – NØYAKTIG de klassene benken kjører – i stedet for kopier som
// kunne kommet i utakt med det som er målt.
// ---------------------------------------------------------------------------
// ADAMS v1, satt ut 2026-08-03. Tre lag, og hvert av dem er målt for seg:
//
//   budm:bud-gbt.json  budmodellen. Forutsier (μ, σ) for lagstikk fra hånden og
//                      regner EV(N) = P(vinner budrunden)·2N(2P(N)−1) analytisk
//                      for hvert lovlige bud. Parret mot MesterAI på 203 par:
//                      +0,618 ± 0,166 (3,7 SE), trimmet snitt +0,545.
//                      FØRSTE GANG noe vi har måler POSITIVT mot MesterAI:
//                      +0,357 ± 0,129 marginalt, der vakt:abmp ligger −0,268.
//
//   vakt:abmp          konvensjonsvakten. «at» ble byttet til «abmp»: `m` er
//                      makker leder laveste trumf i stikk 2 etter å ha tatt
//                      stikk 1 (+0,0404 ± 0,0075, positiv i 10 av 10 disjunkte
//                      frøbånd), `p` er makker trumfer før budvinneren når det
//                      vinner stikket (+0,0039 ± 0,0010, 9 av 10).
//
//   e1:ftf1            kortnettet, FINJUSTERT fra sd-r2. Seks nett trent fra
//                      BUNNEN på de nye dataene strøk gate 2 med −0,35 til
//                      −0,69 – årsaken var datamengde, ikke design: sd-r2 er
//                      trent på 4 824 794 stillinger, de nye på 410 645 (8,5 %).
//
//                      Finjustering arver sd-r2s vekter og lar de nye radene
//                      justere dem, så hele det gamle datagrunnlaget følger med
//                      gratis. Målt i tre DISJUNKTE frøbånd mot sd-r2:
//                      +0,206 / +0,079 / +0,123 → samlet +0,136 ± 0,038
//                      (3,5 SE), og tegntesten er p=0,000 i hver eneste av dem.
//
//                      Læringsraten er 1e-4. Ved 3e-3 blir tallet −0,171:
//                      nettet glemmer det gamle datagrunnlaget. Grensen er målt,
//                      ikke gjettet.
const VAKTFLAGG = "abmp";
/**
 * BUDMODELLEN — RETTET 6. august, funnet i revisjon FØR den rakk å koste noe.
 *
 * Fram til nå sto det `bud-gbt.json` her, mens `ADAMS`-speken i
 * `src/moe2/agentspek.ts` — den ALLE målinger denne uka er gjort med — bruker
 * `bud-vant.json`. De er ulike modeller, og forskjellen er målt: `bud-vant` gir
 * **+0,127 ± 0,043 poeng per runde** over `bud-gbt` (plan.md §-tabellen over
 * budmodeller).
 *
 * Ingen deploy hadde skjedd, så feilen hadde ikke rukket å virke. Men
 * `docs/utrulling-v5.md` DEFINERER v5 med `bud-vant.json@-3.0` og sier
 * ingenting om å laste den opp. Hadde noen fulgt lista, ville v5 gått ut med
 * v3-budmodellen — og de +0,127 forsvunnet uten at noe feilet.
 *
 * Det er den samme feilklassen som har tatt oss åtte ganger før: DET MÅLTE OG
 * DET UTRULLEDE VAR IKKE SAMME TING. `test/utrullet-lik-maalt.test.ts` holder
 * de to filnavnene i lås fra nå.
 *
 * FALLBACK-KJEDEN er ikke pynt. Val Town svarer 200 med HTML på manglende
 * filer, så en modell som ikke er lastet opp blir `null` — og uten kjeden
 * faller boten helt tilbake til NevroHjernes budgivning, som er svakere enn
 * BEGGE. Rekkefølgen er derfor: målt modell → forrige utrullede → NevroHjerne.
 */
/**
 * APPEN SKAL IKKE BRUKE BENKENS TABELL, OG DET ER MED VILJE.
 *
 * `vant[N]` er ikke en tuningparameter. Den er et FAKTUM om omgivelsene: hvor
 * ofte bud N vinner budrunden. `bud-vant` regnet den ut med fikspunkt over
 * SELVSPILL — likevekten der fire Adams byr mot hverandre. Det bordet spiller
 * appen aldri; den sitter med ett menneske og to bots.
 *
 * Målt på familiens EKTE runder mot Adams-linja:
 *
 *     bud 8    13 ganger,   0 vant  ->   0 %
 *     bud 9    34 ganger,  12 vant  ->  35,3 %
 *     bud 10   57 ganger,  57 vant  -> 100 %
 *
 * mot tabellenes vant[9]: `bud-menneske` 0,304, `bud-vant` 0,097, `bud-gbt`
 * 0,662. Avviket fra det observerte er 4,9 / 25,6 / 30,9 prosentpoeng.
 *
 * MEKANISMEN. Terskelen for å by er nesten lik for alle bud (P mellom 0,41 og
 * 0,43), så en hånd som kvalifiserer til 10 kvalifiserer også til 9. Valget
 * mellom dem styres av `vant`-forholdet ALENE. Med vant[9] = 0,097 blir bud 9
 * strukturelt uattraktivt og boten hopper til 10 — en hardere kontrakt for to
 * poeng mer.
 *
 * `examples/budtabell-kostnad.ts` verdsetter hver tabells VALG med den målte
 * auksjonen: 2,519 / 2,392 / 2,347 rått, 2,340 / 2,260 / 2,147 krympet.
 * Rekkefølgen er den samme under begge.
 *
 * FORBEHOLD SOM MÅ STÅ:
 *   – n = 34 for bud 9. Ekte, men tynt. `bud-menneske` er derfor KRYMPET mot
 *     selvspilltabellen med K = 8 (0,304 i stedet for rå 0,353).
 *   – Den EV-målingen er delvis SIRKULÆR: `bud-menneske` er krympet mot
 *     nettopp den tabellen den scores med. Argumentet som IKKE er sirkulært,
 *     er kalibreringen — hvilket tall som ligger nærmest det observerte.
 *   – BENKENE skal fortsatt bruke `bud-vant`. Der ER selvspill riktig, og
 *     `ADAMS` er uendret. De to skal være ulike, og `test/utrullet-lik-maalt`
 *     håndhever at forskjellen er BEGRUNNET, ikke at den ikke finnes.
 *
 * Reserven er benkens tabell, ikke v3s: er `bud-menneske.json` ikke lastet
 * opp, er `bud-vant` det nest best kalibrerte av de tre.
 */
const BUDMODELL = "bud-menneske.json";
const BUDMODELL_RESERVE = "bud-vant.json";
/**
 * TREDJE LEDD — LAGT TIL 10. AUGUST FORDI KJEDEN FAKTISK BRAST I DRIFT.
 *
 * Kommentaren over sier at kjeden er «målt modell → forrige utrullede →
 * NevroHjerne», og at Val Town svarer 200 med HTML på filer som ikke er lastet
 * opp. Begge deler stemmer. Det som IKKE stemte, var at kjeden hadde det
 * mellomste leddet:
 *
 *     GET /bud-menneske.json  ->  <!doctype html…   (209 309 byte)
 *     GET /bud-vant.json      ->  <!doctype html…   (209 309 byte)
 *     GET /bud-gbt.json       ->  {"dim":128,…      (322 134 byte)
 *
 * Målt mot det levende endepunktet, ikke antatt. Verken `bud-menneske` eller
 * `bud-vant` er lastet opp. Det ENESTE budmodellfilnavnet som finnes der er
 * `bud-gbt.json` — det v3 brukte — og da konstanten 6. august ble flyttet fra
 * `bud-gbt` til `bud-menneske`, falt appen ut av budmodellen helt og ned på
 * NevroHjernes budgivning uten at noe feilet.
 *
 * Vaktposten i `hentBudmodell` gjorde jobben sin: den så HTML-en og
 * returnerte `null`. Men reserven pekte på en fil som heller ikke lå der, og
 * da var det ingenting igjen. Konsollen sa det hele tiden — «Budmodellen
 * kunne ikke lastes – spiller med NevroHjernes bud» — men ingen leser en
 * nettleserkonsoll på en iPad i sofaen.
 *
 * KOSTNADEN ER MÅLT, og den står i kommentaren over denne: `bud-gbt` mot
 * ingen budmodell er **+0,618 ± 0,166 poeng per runde (3,7 SE)** parret mot
 * MesterAI. Det er den forskjellen familien har spilt uten.
 *
 * DETTE ER EN NØDBREMS, IKKE RETTELSEN. Rettelsen er å laste opp
 * `bud-menneske.json`, som er den best kalibrerte for nettopp dette bordet
 * (+0,127 over `bud-gbt` for `bud-vant`, og `bud-menneske` er kalibrert på
 * familiens EGNE runder). Så lenge den ikke ligger ute, er `bud-gbt` det
 * beste tilgjengelige — og et tredje ledd koster ingenting den dagen de to
 * første virker, for da blir det aldri spurt.
 */
const BUDMODELL_SISTE_UTVEI = "bud-gbt.json";
/**
 * BUDTERSKELEN. Beslutningsregelen ser ut som en avveining mot verdien av å
 * forsvare, men leddet `(1−p)·evForsvar` kansellerer mot terskelen:
 *
 *     p·2N(2P−1) + (1−p)·e > e   ⟺   2N(2P−1) > e
 *
 * `evForsvar` er altså en REN TERSKEL på kontraktens forventningsverdi. Den
 * sto på 2,5 – satt da kortnettet var svakere – så boten krevde at en kontrakt
 * var verdt over 2,5 poeng før den bød i det hele tatt. Risikonøytralt optimum
 * er 0, og fordi μ anslås av en modell trent på det GAMLE nettet (og derfor
 * undervurderer hvor mange stikk dagens nett tar), ligger optimum under 0.
 *
 * Målt på gate 2, kontrollarmen nøyaktig 0,0000 i alle bånd:
 *
 *     bånd 133 M   +0,2342 ± 0,0757    bånd 147 M   +0,3812 ± 0,0707
 *     slått sammen +0,3127 ± 0,0517 (6,05 SE), 3 757 avgjorte giver
 *
 * −3,0 er MIDTEN av et platå: −2, −3 og −5 målte likt, −8 falt til −0,07.
 * Midten er valgt framfor kanten fordi platået flytter seg når kortnettet
 * endres, og da ryker kanten først.
 */
const BUDTERSKEL = -3.0;
/** Kortvektene. «sdr2.b64» ligger igjen som fallback om denne ikke kan hentes. */
const KORTVEKTER = "adams-kort.b64";
// VRAK OG TRUMF med den lærte rangereren. Måles per budvinnerrunde på
// `examples/vrakbenk.ts`, som teller BARE de rundene og parrer på giv og
// budvinner – tre disjunkte frøbånd, to miljøer:
//
//     nevro-miljø, bånd 45 M   +0,5770 ± 0,1563   tegn 575/433
//     nevro-miljø, bånd 52 M   +0,4000 ± 0,1530   tegn 527/434
//     Adams-miljø, bånd 61 M   +0,5752 ± 0,1925   tegn 350/228
//
// Snittet er haledrevet – trimmet ligger det på +0,15. Tegntesten er tallet
// som bærer adopsjonen: 5,1 SE i Adams-miljøet, positiv i alle tre bånd. Den
// er robust mot nettopp de halene. Formen er som ventet for et vrakvalg: som
// regel nesten likegyldig, av og til avgjørende for runden.
const VRAKRANGERER = "adams-vrak.b64";
const VRAKFLAGG = "telrd";
/**
 * TROSNETTET ER AV, og det er en MÅLT beslutning.
 *
 * Trosvektingen ga +0,34 poeng per runde i førersetet i ett frøbånd – og
 * −0,12 i det disjunkte. Fortegnet snur, altså er den IKKE etablert. Den
 * koster 4,6 MB nedlasting og innfører en ny feilmodus for en gevinst vi ikke
 * kan vise.
 *
 * SLIK SLÅS DEN PÅ IGJEN: sett TROFIL til navnet på trosfila og last den opp.
 * `null` her betyr at `besteBot()` hopper over hentingen helt — det gjøres av
 * `TROFIL === null ? Promise.resolve(null) : hentB64(TROFIL)` lenger nede, så
 * det går ikke ett eneste nettverkskall til trosnettet i dag.
 *
 * FILNAVNET STÅR MED VILJE IKKE I HERMETEGN HER. `verktoy/sjekk-utrulling.ts`
 * utleder lista over filer appen henter ved å regex-e ALLE strengliteraler i
 * denne fila som ser ut som filnavn — også de som står inne i kommentarer.
 * Da ble trosfila rapportert som «hentes ved hver sidelasting, 209 KB
 * HTML-feilside», og den slutningen er feil: verktøyet målte «strenger som
 * ligner filnavn i kilden», ikke «filer nettleseren ber om».
 *
 * Målt i stedet for antatt — over alle sidelastingene i nettlesertestene ba
 * appen om nøyaktig seks filer: adams-kort.b64, adams-vrak.b64,
 * bud-menneske.json, bud-vant.json, bud-gbt.json og worker.js. Trosfila var
 * ikke blant dem, og kan heller ikke lastes opp: lokalt finnes bare
 * `e1-modell/tro.bin`, ikke en b64-utgave.
 *
 * Den EKTE nedlastingskostnaden ligger et annet sted: bud-menneske.json og
 * bud-vant.json er ikke lastet opp, svarer 209 KB HTML hver, og hentes begge
 * ved hver sidelasting — 418 KB søppel før kjeden når fram til bud-gbt.json.
 * Det forsvinner i det de to blir lastet opp; begge finnes i `e1-modell/`.
 */
const TROFIL: string | null = null;

/** Vakten og budagenten deler dette grensesnittet; appen trenger ikke mer. */
type Bot = { velgHandling(s: GameState): Handling; nyKamp(): void };

/**
 * Henter en vektfil og VALIDERER at det faktisk er base64.
 *
 * Val Town serverer appens fallback-HTML med status **200** for filer som ikke
 * finnes. `r.ok` er da sann, og `<!doctype html...` gikk rett inn i
 * nettparseren. Funnet 6. august ved å faktisk kjøre appen i en nettleser –
 * bunting og typesjekk ser ingenting av dette.
 *
 * Returnerer `null` ved feil, som kallerne allerede håndterer.
 */
async function hentB64(navn: string): Promise<string | null> {
  try {
    const r = await fetch(DATA_URL + navn);
    if (!r.ok) return null;
    const t = (await r.text()).trim();
    // En HTML-side starter med «<». Ekte base64 gjør aldri det, og er dessuten
    // aldri kortere enn noen kilobyte for disse filene.
    if (t.length < 1024 || t.startsWith("<") || !/^[A-Za-z0-9+/=\s]+$/.test(t.slice(0, 256))) {
      console.warn(`«${navn}» er ikke base64 – fikk ${t.length} tegn som starter med «${t.slice(0, 20)}»`);
      return null;
    }
    return t;
  } catch (feil) {
    console.warn(`«${navn}» kunne ikke hentes:`, feil);
    return null;
  }
}

/**
 * Budmodellen, med SAMME vaktpost som `hentB64` — og av samme grunn.
 *
 * Den gamle koden var `r.ok ? r.json() : null`. Val Town svarer 200 med HTML
 * på manglende filer, så `r.ok` er sann og `r.json()` kaster på «<». Det ga
 * riktig utfall ved rein flaks, men gjennom en unntakssti som ikke skiller
 * «fila mangler» fra «fila er ødelagt» — og som derfor ikke kunne få en
 * reserve. Nå returnerer den `null` EKSPLISITT, og kalleren kan prøve neste.
 *
 * `tolkBudmodell` kalles her, ikke senere, slik at en modell med feil `dim`
 * regnes som mislykket henting og utløser reserven — i stedet for å bli
 * avvist lenger nede og sende boten til NevroHjerne.
 */
async function hentBudmodell(navn: string): Promise<unknown | null> {
  try {
    const r = await fetch(DATA_URL + navn);
    if (!r.ok) return null;
    const t = (await r.text()).trim();
    if (t.startsWith("<")) {
      console.warn(`«${navn}» er ikke JSON – fikk HTML (${t.length} tegn)`);
      return null;
    }
    const rå: unknown = JSON.parse(t);
    tolkBudmodell(rå); // kaster ved feil bredde – da skal reserven brukes
    return rå;
  } catch (feil) {
    console.warn(`«${navn}» kunne ikke hentes eller tolkes:`, feil);
    return null;
  }
}

function tilBytes(b64: string): Uint8Array {
  const rå = atob(b64.trim());
  const bytes = new Uint8Array(rå.length);
  for (let i = 0; i < rå.length; i++) bytes[i] = rå.charCodeAt(i);
  return bytes;
}

/**
 * Legger rangereren utenpå boten, eller lar boten være om vektene mangler
 * eller ikke ser riktige ut.
 *
 * `Vrakrangerer` KASTER på feil bredde i stedet for å score søppel. Det er med
 * vilje: vrakvalget tas én gang per runde, så et stille feilvalg ville nesten
 * ikke syntes i statistikken – og her, i nettleseren, ville ingen sett det i
 * det hele tatt. Derfor fanger vi kastet og faller tilbake, i stedet for å la
 * det bli en bot som velger tilfeldig uten at noen merker det.
 */
/**
 * SØK I FØRERSETET — Adams-v5. **KJØRER I WEB WORKEREN**, ikke her.
 *
 * MÅLT over fem uavhengige frøbånd: +1,7 til +2,2 poeng per runde i
 * førersetet (z = +2,96 til +6,44). På kampbenken flyttet det en
 * menneske-ekvivalent motstander fra 20,21 % til 15,83 % vinnerandel.
 *
 * HVORFOR IKKE HER. `velgHandling` kalles synkront fra spillsløyfen. Søket
 * koster ~1,3 s per kort, og boten er fører i tre av fire runder fordi tre
 * seter er bot – altså nærmere femti sekunder frosset UI per runde. Ikke
 * tregt, men umulig å skille fra en krasj.
 *
 * Hovedtråden beholder derfor den SØKFRIE boten. Den svarer på 0,5 ms og er
 * reserven hvis workeren feiler eller ikke rekker fram.
 *
 * FORSVARSSØK ER IKKE MED, og det er målt: −0,027 med z = −0,55.
 */
const SØKVERDENER = 24;
/**
 * KONFIDENSPORTEN: hvor mange standardfeil marginen må overstige før søket
 * overstyrer nettet. Målt 6. august i to disjunkte bånd — 0,5 gir +1,78 og
 * +1,68 i førersetet mot alltid-søkets +1,25, og koster 198 ms mot 329.
 * 0,25 og 0,5 er ikke skillbare, så porten er robust mot terskelen.
 */
const SØKSIGMA = 0.5;

/** Rå vekter, holdt for å kunne sendes til workeren. Agenter kan ikke krysse
 *  en meldingsgrense; workeren må bygge sin egen fra de samme bytene. */
let råVekter: { kort: string; bud: unknown; vrak: string | null; tro: string | null } | null = null;

function medVrakrangerer(bot: Bot, b64: string | null): Bot {
  if (b64 === null) {
    console.warn("Vrakrangereren kunne ikke hentes – vraker som før.");
    return bot;
  }
  try {
    const nett = nettFraBytes(tilBytes(b64))[0];
    if (nett === undefined) throw new Error("tomme vekter");
    return new Vrakrangerer(bot, nett, VRAKFLAGG);
  } catch (feil) {
    console.warn("Vrakrangereren ble avvist:", feil);
    return bot;
  }
}

let botLaster: Promise<Bot> | null = null;
function besteBot(): Promise<Bot> {
  botLaster ??= Promise.all([
    // Faller tilbake til sd-r2 om de finjusterte vektene ikke kan hentes.
    // Da spiller boten som i gaar i stedet for aa ikke spille i det hele tatt.
    hentB64(KORTVEKTER).then(async (t) => {
      if (t !== null) return t;
      console.warn(`${KORTVEKTER} kunne ikke hentes – faller tilbake til sd-r2.`);
      const r = await hentB64("sdr2.b64");
      if (r === null) throw new Error("verken finjusterte vekter eller sd-r2 kunne hentes");
      return r;
    }),
    // Budmodellen hentes ved siden av vektene, med reserve. Feiler BEGGE,
    // faller vi tilbake til NevroHjernes budgivning i stedet for å la hele
    // boten dø – kortspillet er uendret og fortsatt det familien har møtt.
    hentBudmodell(BUDMODELL).then(async (m) => {
      if (m !== null) return m;
      console.warn(`${BUDMODELL} kunne ikke hentes – faller tilbake til ${BUDMODELL_RESERVE}.`);
      const r = await hentBudmodell(BUDMODELL_RESERVE);
      if (r !== null) return r;
      console.warn(`${BUDMODELL_RESERVE} kunne heller ikke hentes – siste utvei ${BUDMODELL_SISTE_UTVEI}.`);
      return hentBudmodell(BUDMODELL_SISTE_UTVEI);
    }),
    // Vrakrangereren. Samme vilkår som de to over: feiler den, vraker og
    // velger trumf boten som i går. Ingen enkeltdel får lov til å ta ned
    // resten – det er derfor familien alltid har noe å spille mot.
    hentB64(VRAKRANGERER),
    // TROSNETTET. Vekter kandidatverdenene i søket etter hvordan de andre har
    // SPILT, ikke bare hva de bød.
    //
    // AV, OG DET ER EN MÅLT BESLUTNING — se `TROFIL` over: +0,34 i ett frøbånd
    // og −0,12 i det disjunkte. Fortegnet snur, altså er den IKKE etablert.
    //
    // Her sto tidligere «+0,34 … like mye som å DOBLE utvalget» som et
    // etablert funn, uten at tilbaketrekkingen var nevnt. To kommentarer om
    // samme sak, én riktig og én foreldet — nøyaktig samme feilklasse som
    // utrullingslista (§62), bare inne i én fil.
    //
    // Feiler den, søker boten uvektet som før; ingen enkeltdel tar ned resten.
    TROFIL === null ? Promise.resolve(null) : hentB64(TROFIL),
  ])
    .then(([b64, budRå, vrakB64, troB64]) => {
      // Ett delt eksemplar for alle tre botsetene – slik benken kjører den.
      const kort = new Konvensjonsvakt(
        E1Agent.fraBytes(tilBytes(b64), {}, KORTVEKTER),
        lesVaktflagg(VAKTFLAGG),
      );
      let bot: Bot = kort;
      if (budRå === null) {
        console.warn("Budmodellen kunne ikke lastes – spiller med NevroHjernes bud.");
      } else {
        try {
          bot = new Budagent(kort, tolkBudmodell(budRå), BUDTERSKEL);
        } catch (feil) {
          console.warn("Budmodellen ble avvist:", feil);
        }
      }
      råVekter = { kort: b64, bud: budRå, vrak: vrakB64, tro: troB64 };
      return medVrakrangerer(bot, vrakB64);
    })
    .catch((feil: unknown) => {
      botLaster = null; // la neste forsøk prøve på nytt
      throw feil;
    });
  return botLaster;
}

/** Serialiserer en handling til adapterens JSON-format (som arena-adapteren). */
function handlingTilAdapter(h: Handling): Record<string, unknown> {
  switch (h.type) {
    case "BUD":
      return { type: "BUD", spiller: h.spiller, bud: h.bud };
    case "VRAK":
      return { type: "VRAK", spiller: h.spiller, kort: h.kort.map(kortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller: h.spiller,
        trumf: h.trumf,
        etterlyst: h.etterlyst ? kortId(h.etterlyst) : null,
      };
    case "SPILL":
      return { type: "SPILL", spiller: h.spiller, kort: kortId(h.kort) };
    case "NESTE":
      throw new Error("NESTE sendes aldri til broen");
  }
}

interface BroSvar {
  type: string;
  handling?: { type: string; spiller: number; bud?: unknown; kort?: unknown; trumf?: unknown; etterlyst?: unknown };
}

// Alle bro-kall serialiseres i kall-rekkefølge, så adapterens motor holder seg
// i eksakt synk med vår (samme mekanikk som arena-benchmarken, over HTTP).
let broKø: Promise<unknown> = Promise.resolve();
async function broSend(melding: object): Promise<BroSvar> {
  const r = await fetch(MESTER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(melding),
  });
  return (await r.json()) as BroSvar;
}
function broPost(melding: object): Promise<BroSvar> {
  const p = broKø.then(() => broSend(melding));
  broKø = p.catch(() => undefined);
  return p;
}
/** rundeStart-melding: gir broen hele givingen så motoren speiles eksakt. */
function broRundeStart(): object {
  return {
    type: "rundeStart",
    hender: state.hender.map((h) => h.map(kortId)),
    talong: state.talong.map(kortId),
    foersteBudgiver: state.iTur,
  };
}
/** MesterAIs beslutning (adapter-JSON) → vår Handling. */
function broHandlingFra(j: NonNullable<BroSvar["handling"]>): Handling {
  const spiller = j.spiller;
  switch (j.type) {
    case "BUD":
      return { type: "BUD", spiller, bud: j.bud as Bud };
    case "VRAK":
      return { type: "VRAK", spiller, kort: (j.kort as string[]).map(fraKortId) };
    case "VELG":
      return {
        type: "VELG",
        spiller,
        trumf: j.trumf as Farge,
        etterlyst: j.etterlyst == null ? null : fraKortId(j.etterlyst as string),
      };
    default:
      return { type: "SPILL", spiller, kort: fraKortId(j.kort as string) };
  }
}
/** Speiler en utført handling til broen så adapterens motor holder synk. */
function broSpeil(h: Handling, hendelser: readonly Hendelse[]): void {
  if (motstander !== "MesterAI") return;
  if (h.type !== "NESTE") void broPost({ type: "handling", handling: handlingTilAdapter(h) });
  for (const e of hendelser) if (e.type === "NY_RUNDE") void broPost(broRundeStart());
}
const NAVN = ["Du", "Vest 🤖", "Nord 🤖", "Øst 🤖"];
/**
 * Styrkenivåer for PIMC. Kortvalg (SPILL) er tidsstyrt; bud/vrak/trumf er
 * verdenstyrt med nodetak, så «øvrig» holder seg innenfor rimelig ventetid.
 * MAKS: dype eksaktsøk (terskel 9) med opptil ~3 min per kortvalg – kjør i
 * Web Worker så UI-et aldri fryser.
 */
const STYRKER = {
  RASK: {
    navn: "Rask (~1 s per trekk)",
    spill: { verdener: 12, terskel: 6, maksEval: 240, tidsbudsjettMs: 900 },
    øvrig: { verdener: 12, terskel: 6, maksEval: 240 },
  },
  STERK: {
    navn: "Sterk (~3 s per trekk)",
    spill: { verdener: 60, terskel: 7, nodeTak: 1_200_000, tidsbudsjettMs: 2_800, adaptivDybde: true },
    øvrig: { verdener: 20, terskel: 6, budTerskel: 6, nodeTak: 800_000 },
  },
  MAKS: {
    navn: "MAKS (~5 s per trekk, pondrer)",
    spill: { verdener: 200, terskel: 7, nodeTak: 2_000_000, tidsbudsjettMs: 4_800, adaptivDybde: true },
    øvrig: { verdener: 24, terskel: 7, budTerskel: 7, nodeTak: 1_000_000 },
  },
} as const;
type Styrke = keyof typeof STYRKER;
let styrke: Styrke = "MAKS";

// --- Worker-kanal for PIMC (lange tenketider uten å fryse UI) ---------------
let worker: Worker | null = null;
let workerLast: Promise<Worker> | null = null;
const venterPåSvar = new Map<number, (h: Handling) => void>();
let nesteWorkerId = 1;
let tenkStart = 0;

/**
 * Gir workeren vektene så den kan bygge sin egen Adams med søk. Kalles én
 * gang; workeren holder agenten mellom trekk.
 */
/**
 * ============ WORKEREN MÅ KVITTERE, OG HER ER HVORFOR ===================
 *
 * Her sto `adamsSendt = true` rett etter `postMessage`, altså «sendt» brukt
 * som om det betydde «mottatt og forstått». Det gjør det ikke, og forskjellen
 * er ikke teoretisk. Målt mot det levende endepunktet 10. august:
 *
 *     GET /worker.js   20 761 byte
 *     inneholder «init» og «pondre» — og HVERKEN «adams-init» ELLER
 *     «adams-trekk». Lokalt ligger en 598 836 byte worker som har begge.
 *
 * Den utrullede `app.js` er derimot BIT-IDENTISK med `web/dist/app.js`
 * (md5 9a8ff21a…), altså v5. Appen ute er ny, workeren ute er gammel.
 *
 * OG DET FEILER IKKE STILLE — DET FEILER FEIL. Den gamle workerens
 * `onmessage` er en kjede av `if (m.type === …) return;` som ender i en
 * ukommentert felle: alt som ikke er «init» eller «pondre» faller gjennom til
 * `beslutt`-grenen. `adams-trekk` bærer en ekte `state`, så grenen kjører
 *
 *     agentFor(s.iTur).beslutt(s, m.maksMs)      // maksMs er undefined
 *
 * og svarer med `{ id, handling }` — samme form som et ekte søkesvar. Appen
 * kan ikke se forskjell, godtar det, og logger `soek: { brukt: true }`.
 *
 * Kortet er altså valgt av den GAMLE PIMC-agenten med tomme opsjoner (`init`
 * sendes aldri i «Vaar»-løypa), ikke av Adams med søk. PIMC taper 72,6 ± 8,5
 * poeng per kamp mot MesterAI der Adams taper 5,0 ± 1,5. Førersetets kortvalg
 * — tre av fire runder — har vært tatt av den svakeste boten vi har, og
 * loggen har sagt at søket ble brukt.
 *
 * Det er prosjektets mest gjentatte feilklasse i ny drakt: DET MÅLTE OG DET
 * UTRULLEDE VAR IKKE SAMME TING — bare at her var det ikke engang det samme
 * fra det ene meldingsfeltet til det neste.
 *
 * RETTELSEN er en kvittering. Workeren svarer `{ klar: true }` på
 * `adams-init`, og `adams-trekk` sendes ikke før den kvitteringen er kommet.
 * En eldre worker kan ikke sende `klar` — den kjenner ikke feltet — så den
 * faller ut av veien i stedet for å svare på vegne av en annen bot.
 *
 * NÅR KVITTERINGEN UTEBLIR spiller hovedtrådens søkfrie Adams, som er
 * reserven den alltid har vært. Den er svakere enn Adams med søk og MYE
 * sterkere enn PIMC, så feilmodusen peker riktig vei nå.
 *
 * MERK: dette gjør ikke søket levende igjen. Det krever at `web/dist/worker.js`
 * lastes opp — steg 2 i `docs/utrulling-v5.md`, som aldri ble utført.
 */
let adamsKlar: Promise<Worker | null> | null = null;
/** Settes mens vi venter på kvitteringen; kalles av workerens `onmessage`. */
let kvitter: ((ok: boolean) => void) | null = null;

async function sikreAdamsIWorker(): Promise<Worker | null> {
  if (råVekter === null || SØKVERDENER <= 0) return null;
  adamsKlar ??= (async (): Promise<Worker | null> => {
    try {
      const w = await hentWorker();
      return await new Promise<Worker | null>((løs) => {
        // Kvitteringen har en frist. En worker som ikke svarer på seks
        // sekunder er enten feil worker eller ute av stand til å bygge
        // Adams; begge deler betyr «spill uten søk», ikke «vent lenger».
        const frist = setTimeout(() => {
          kvitter = null;
          console.warn(
            "Workeren kvitterte ikke på «adams-init» innen 6 s – den er sannsynligvis en eldre " +
              "utgave uten Adams-meldingene. Spiller med hovedtrådens søkfrie bot.",
          );
          løs(null);
        }, 6_000);
        kvitter = (ok) => { clearTimeout(frist); kvitter = null; løs(ok ? w : null); };
        w.postMessage({
          type: "adams-init",
          kort: råVekter!.kort,
          bud: råVekter!.bud,
          vrak: råVekter!.vrak,
          tro: råVekter!.tro,
          vaktflagg: VAKTFLAGG,
          vrakflagg: VRAKFLAGG,
          budterskel: BUDTERSKEL,
          verdener: SØKVERDENER,
          sigma: SØKSIGMA,
        });
      });
    } catch (feil) {
      console.warn("Kunne ikke gi workeren Adams – spiller uten søk:", feil);
      return null;
    }
  })();
  return adamsKlar;
}

/** Ber workeren om ETT kortvalg. `null` betyr «bruk hovedtrådens bot». */
async function søkTrekk(st: GameState, sete: number): Promise<Handling | null> {
  const w = await sikreAdamsIWorker();
  if (w === null) return null;
  const id = nesteWorkerId++;
  return new Promise<Handling | null>((løs) => {
    // Reserven er hovedtrådens søkfrie bot. Kommer ikke svaret, spiller vi
    // som før i stedet for å la runden stoppe.
    const tid = setTimeout(() => { venterPåSvar.delete(id); løs(null); }, 20_000);
    venterPåSvar.set(id, (h) => { clearTimeout(tid); løs(h); });
    w.postMessage({ type: "adams-trekk", id, state: st, sete });
  });
}

function hentWorker(): Promise<Worker> {
  if (worker !== null) return Promise.resolve(worker);
  if (workerLast === null) {
    workerLast = fetch(DATA_URL + "worker.js")
      .then((r) => r.text())
      .then((kode) => {
        const w = new Worker(URL.createObjectURL(new Blob([kode], { type: "text/javascript" })));
        w.onmessage = (e: MessageEvent<{ id: number; handling?: Handling; feil?: string; klar?: boolean }>) => {
          // Kvitteringen på «adams-init». Den bæres av et EGET felt, ikke av
          // at det kommer et svar i det hele tatt — en eldre worker svarer
          // også, bare med noe helt annet. Se `sikreAdamsIWorker`.
          if (e.data.klar !== undefined) {
            if (e.data.klar === false) console.warn("Workeren klarte ikke bygge Adams:", e.data.feil);
            kvitter?.(e.data.klar === true);
            return;
          }
          const løs = venterPåSvar.get(e.data.id);
          venterPåSvar.delete(e.data.id);
          if (løs && e.data.handling) løs(e.data.handling);
        };
        worker = w;
        return w;
      });
  }
  return workerLast;
}

/** Initialiser workerens agenter for valgt styrke (pondering + adaptiv dybde). */
async function initPimcWorker(): Promise<void> {
  const nivå = STYRKER[styrke];
  const w = await hentWorker();
  w.postMessage({
    type: "init",
    spill: { ...nivå.spill, frø: (Math.random() * 1e9) >>> 0 },
    øvrig: { ...nivå.øvrig, frø: (Math.random() * 1e9) >>> 0 },
  });
}

/**
 * Pondering hoerte til PIMC-solveren, som er fjernet som motstander.
 * NevroHjerne bruker mikrosekunder per trekk og har ingenting aa pondre paa.
 * Funksjonen staar som no-op saa kallstedene ikke maa rives ut.
 */
function ponder(_s: GameState, _ms: number): void {
  /* ingen motstander bruker worker-pondering lenger */
}

/** PIMC-beslutning i workeren; faller tilbake til rask synkron ved feil. */
async function pimcHandling(s: GameState): Promise<Handling> {
  const nivå = STYRKER[styrke];
  try {
    const w = await hentWorker();
    return await new Promise<Handling>((løs, avvis) => {
      const id = nesteWorkerId++;
      venterPåSvar.set(id, løs);
      w.postMessage({ type: "beslutt", id, state: s, maksMs: nivå.spill.tidsbudsjettMs ?? 5000 });
      setTimeout(() => {
        if (venterPåSvar.has(id)) {
          venterPåSvar.delete(id);
          avvis(new Error("tidsavbrudd"));
        }
      }, 45_000);
    });
  } catch {
    return velgHandling(s, { ...STYRKER.RASK.spill, frø: (Math.random() * 1e9) >>> 0 });
  }
}

/**
 * Motstandertype: PIMC-solveren, et trent NEAT-nett, appens nevronett eller
 * appens fulle MesterAI.
 */
/**
 * Bare ÉN motstander står igjen på nett: vår egen beste bot.
 *
 * C4 og D1 er evolusjonslinjer som er MÅLT til å spille kort dårligere enn å
 * velge tilfeldig (anger 1,07–1,15 mot gulvet 1,035 på orakelbenken). PIMC
 * taper 72,6 ± 8,5 poeng per kamp mot MesterAI, og NevroHjerne 44,8 ± 6,6 –
 * mot vår beste bots 5,0 ± 1,5. Å la de svake stå ga familien motstandere som
 * verken var sterke eller lærerike, og delte innsamlingen på fire bots i
 * stedet for å samle den der den er verdt noe.
 *
 * MesterAI blir stående, men vises bare i bro-modus (spillet servert lokalt
 * over HTTP fra laptopen) – den kan ikke kjøre i nettleseren.
 */
type Motstander = "Vaar" | "MesterAI";

/**
 * BOT-ID-EN SOM LOGGES, og hvorfor den ikke er den samme som nøkkelen.
 *
 * `navn`-feltet i hendelsesloggen er `<spiller> vs <bot>`, og ALL analyse
 * grupperer på det. Nøkkelen «Vaar» har vært brukt siden 1. august, gjennom
 * flere ulike boter – og da Adams ble satt ut 3. august kl. 03:40 rakk det å
 * bli spilt 54 runder mot den FØR dette ble oppdaget, alle logget som «Vaar»
 * og dermed umulige å skille fra de 89 mot forgjengeren. De reddes bare av
 * tidsstempelet, og det er flaks, ikke design.
 *
 * Derfor logges nå en VERSJON. Gamle rader beholder «Vaar»; nye sier hva de
 * faktisk møtte. Endres boten igjen, skal dette tallet endres samtidig –
 * ellers blandes to populasjoner i én rad, og differansen måler hvilken bot
 * som ble spilt mest.
 */
const BOT_ID: Record<Motstander, string> = {
  // Adams-v2, 4. august: kortvektene destillert fra 544 573 rader merket med
  // 24-verdeners framoverblikk og korrekt rollout-policy. Gate 2 over TO
  // disjunkte froebaand, n=14 000: +0,1434 +/- 0,0526 (2,72 SE), og forsvaret
  // alene +0,1866 +/- 0,0609 (3,06 SE).
  //
  // ID-EN MAA BYTTES VED HVER UTPLASSERING. Uten det blandes familiens runder
  // mot v1 og v2 i samme rad i Val Town-basen, og da kan ingen av dem maales.
  // Det var slik v1 kunne skilles fra forgjengeren og vise +4,61 poeng/runde.
  Vaar: "Adams-v5",
  MesterAI: "MesterAI",
};
/**
 * Motstanderen er alltid vår beste bot. `MOTSTANDER_INFO` og `MOTSTANDERE()`
 * er borte sammen med velgeren de fylte: brukeren velger ikke modell, og en
 * knapp som beskriver «budmodell + vakt + finjustert nett» spurte om noe
 * ingen i familien har grunnlag for å svare på.
 *
 * MesterAI settes fra `?mester=1` i bro-modus – se `startskjerm()`.
 */
let motstander: Motstander = "Vaar";

/**
 * Et nett som fører sitt eget sete. NeatAgent (C4/D1) og NevroSpiller (appens
 * nevronett) har samme lille grensesnitt, så spilløkka trenger bare én vei.
 */
interface SeteAgent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
}
let nettAgenter: SeteAgent[] | null = null; // sete 1–3 ved Nevro/C4/D1

const FARGE_TEGN: Record<Farge, string> = { S: "♠", H: "♥", R: "♦", K: "♣" };
const FARGE_NAVN: Record<Farge, string> = { S: "spar", H: "hjerter", R: "ruter", K: "kløver" };
/**
 * FARGEN SETTES SOM KLASSE, IKKE SOM STILSTRENG — og det er hele rettelsen.
 *
 * ARVIND: «når du velger trumf og etterlyser kort så er ikke spar så lett å
 * se.»
 *
 * Her sto det en `FARGE_CSS` med ÉN verdi per farge, spar = `#1a1a1a`. Den
 * verdien er riktig som blekk på en hvit kortflate, og den ble brukt der. Men
 * den ble ogsaa brukt som `style="color:..."` paa MOERK bakgrunn tre steder:
 *
 *   – overskriften i trumf-/etterlysningspanelet, oppå `rgba(8,16,10,.94)`
 *   – bekreftelseslinja, samme flate
 *   – hver eneste valørknapp i etterlysningen, oppå `#16232f`
 *
 * Kontrasten for spar der er ca. **1,2:1**. WCAG krever 4,5:1 for tekst. Det
 * var ikke «litt vanskelig å se»; det var usynlig. Kløver `#2e7d32` lå på
 * 2,1:1 og var nest verst — nøyaktig de to svarte fargene Arvind nevnte.
 *
 * Rettelsen er ikke en lysere spar-farge. Én farge kan ikke tjene både hvit
 * og mørk flate. Derfor har `index.html` nå to variabler per farge — `--f`
 * (blekk på hvitt) og `--fd` (flateverdi på mørkt) — og klassen `f-<farge>`
 * setter begge. Hvert visningssted velger den som passer flaten sin:
 *
 *   HVIT FLATE (kort, minikort, trumfkort)  bruker `--f` som tekstfarge.
 *   MØRK FLATE (overskrifter, skilt, bekreftelse) bruker ALDRI farget tekst,
 *   men `fargeMerke()`: et fylt merke med `--fd` som BAKGRUNN og nesten svart
 *   symbol oppå. Kontrasten blir 11–14:1 for alle fire, og spar er da den
 *   LYSESTE av dem i stedet for den mørkeste.
 *
 * OG ALDRI FARGE ALENE. `fargeMerke` skriver alltid symbolet, og navnet der
 * det er plass. Fargen er en snarvei, aldri den eneste bæreren.
 */
const fargeKlasse = (f: Farge): string => `f-${f}`;
/** Farge som fylt merke — den ENE måten en farge vises på mørk flate. */
const fargeMerke = (f: Farge, medNavn = true): string =>
  `<span class="fargemerke ${fargeKlasse(f)}"><span class="sym" aria-hidden="true">${FARGE_TEGN[f]}</span>${
    medNavn ? FARGE_NAVN[f] : `<span class="skjult">${FARGE_NAVN[f]}</span>`
  }</span>`;
/**
 * VALØRENE PÅ KORTET: A, K, Q, J — den engelske notasjonen.
 *
 * Her sto «D» for dame. Det var den ENESTE «D»-en i hele prosjektet: motorens
 * egen `kortId` i `src/kort.ts` har brukt `12: "Q"` hele veien, og alle
 * kort-id-er i loggen, i treningsdataene og i analysefilene er skrevet med Q.
 * Nettappen viste altså en annen notasjon enn den datamaskinen skrev ned, og
 * en annen enn den familien kjenner fra en vanlig kortstokk.
 *
 * A og K var allerede riktige, J likeså. Bare dama var oversatt.
 */
const VERDI_TEKST = (v: number): string =>
  v === 14 ? "A" : v === 13 ? "K" : v === 12 ? "Q" : v === 11 ? "J" : String(v);
/**
 * ... men skjermleseren skal si ORDET.
 *
 * `aria-label` og opplesningen gikk gjennom samme funksjon som kortflaten, så
 * en skjermleser fikk «spar Q» — bokstaven, ikke kortet. Norsk tale skal si
 * «spar dame». Kortet viser Q, stemmen sier dame; begge er riktige for sin
 * kanal.
 */
const VERDI_ORD = (v: number): string =>
  v === 14 ? "ess" : v === 13 ? "konge" : v === 12 ? "dame" : v === 11 ? "knekt" : String(v);

// --- Tilstand ---------------------------------------------------------------
let state: GameState;
let spillId = "";
let spillerNavn = "";
let venterPåMenneske = false;
let sistTur = 0; // tidsstempel for reaksjonstid-logging
let vrakValg: Kort[] = [];
let velgTrumfValg: Farge | null = null;
/**
 * Etterlysningen som er PEKT PÅ, men ikke bekreftet ennå.
 *
 * ARVIND: «valg av trumf farge og etterlyse kort er ikke vits å skille fordi
 * kortet du etterlyser er trumf. dermed må du gjøre det slik at man bekrefter
 * valget fordi det er lett å trykke feil.»
 *
 * Begge deler var ekte feil i grensesnittet:
 *
 *   Panelet viste ALLE FIRE FARGER med 13 valører hver — 52 knapper der bare
 *   13 er lovlige. `lovligeEtterlys(state, trumf)` returnerer utelukkende kort
 *   i trumffargen, så 39 av knappene kunne ikke føre fram. De var ikke engang
 *   deaktiverte; bare egne kort var det.
 *
 *   Og valget var UMIDDELBART. Ett feiltrykk låste både trumf og makker for
 *   hele runden, uten vei tilbake.
 */
let velgEtterlysValg: Kort | null = null;
let travelt = false;

const rot = document.getElementById("app")!;
const oppleser = document.getElementById("oppleser")!;

function si(tekst: string): void {
  oppleser.textContent = tekst;
}

// --- Datainnsamling ---------------------------------------------------------
function logg(type: string, data: unknown): void {
  const hendelse = {
    spillId,
    navn: `${spillerNavn} vs ${BOT_ID[motstander]}`,
    type,
    data,
    tid: new Date().toISOString(),
  };
  try {
    const alt = JSON.parse(localStorage.getItem("amerikaneren-logg") ?? "[]");
    alt.push(hendelse);
    localStorage.setItem("amerikaneren-logg", JSON.stringify(alt.slice(-500)));
  } catch { /* full/av – ikke kritisk */ }
  fetch(DATA_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(hendelse),
    keepalive: true,
  }).catch(() => { /* offline – localStorage har kopien */ });
}

// `kortTekst` er borte: den skrev «♠A» som ren tekst, og det eneste stedet
// den ble brukt (etterlysningsskiltet på bordet) viser nå fargemerket i
// stedet. Symbol uten flate var akkurat den formen som ikke tålte mørk
// bakgrunn.
const kortTale = (k: Kort): string => `${FARGE_NAVN[k.farge]} ${VERDI_ORD(k.verdi)}`;

/**
 * STJERNA — motivet fra appikonet, gjenbrukt overalt.
 *
 * Selve figuren er definert ÉN gang i `index.html`, utenfor `#app`. Det er
 * ikke en detalj: `tegn()` bygger `#app` på nytt med `innerHTML` ved hver
 * tilstandsendring, så en `<defs>` som lå der inne ville blitt revet vekk
 * under føttene på hver `<use>` som pekte på den — og stjernene ville
 * forsvunnet ved neste tegning uten at noe feilet.
 */
const stjerne = (klasse = ""): string =>
  `<svg class="stjerne${klasse ? ` ${klasse}` : ""}" viewBox="0 0 100 100" aria-hidden="true"><use href="#stjernemerke"></use></svg>`;

/**
 * Ventetilstand med framdrift. Erstatter den nakne overskriften: en skjerm som
 * står helt stille i fem sekunder er ikke til å skille fra en som har krasjet,
 * og det var den eneste tilbakemeldingen appen ga mens 2,4 MB ble hentet.
 */
const laster = (tittel: string, undertekst = ""): string =>
  `<div class="overlegg"><div class="panel start"><div class="laster">
    <h2>${tittel}</h2>
    <div class="stjerner" role="progressbar" aria-label="${tittel}">${stjerne()}${stjerne()}${stjerne()}</div>
    ${undertekst ? `<p class="bekreftsmatt">${undertekst}</p>` : ""}
  </div></div></div>`;

/** Feiltilstand som sier hva som gikk galt OG gir en vei videre. */
const feilrute = (tittel: string, hva: string): string =>
  `<div class="overlegg"><div class="panel start">
    <h2>${tittel} 😕</h2>
    <p class="bekreftsmatt">${hva}</p>
    <button class="stor bekreft" id="tilbake">Tilbake</button>
  </div></div>`;

// --- Spilløkke --------------------------------------------------------------
async function start(navn: string): Promise<void> {
  spillerNavn = navn || "familien";
  spillId = Math.random().toString(36).slice(2, 10);
  nettAgenter = null;
  if (motstander === "Vaar") {
    // Vår beste bot: vektene lastes én gang og bufres i nettleseren. ÉTT delt
    // eksemplar fører alle tre botsetene, slik benken kjører den.
    // 2,4 MB kortvekter over mobilnett kan ta flere sekunder. En naken
    // overskrift på en stille skjerm ser ut som en krasj; framdriftsstripa
    // sier at noe skjer.
    rot.innerHTML = laster("Laster boten…", "Henter kortvektene — 2,4 MB første gang, deretter fra hurtigbufferen.");
    try {
      const bot = await besteBot();
      nettAgenter = [bot, bot, bot];
    } catch {
      rot.innerHTML = feilrute(
        "Klarte ikke laste boten",
        "Vektfilene kunne ikke hentes. Sjekk nettet og prøv igjen — spillet trenger dem for å ha noen å spille mot.",
      );
      document.getElementById("tilbake")!.onclick = () => startskjerm();
      return;
    }
  } else if (motstander === "MesterAI") {
    rot.innerHTML = laster("Kobler til MesterAI…", "Broen kjører på laptopen.");
    try {
      await broSend({ type: "helse" }).catch(() => broSend({ type: "init", mesterSeter: [] }));
    } catch {
      rot.innerHTML = feilrute(
        "Fikk ikke kontakt med MesterAI",
        "Er broen startet på laptopen? (arena/mesterai-bro.ts)",
      );
      document.getElementById("tilbake")!.onclick = () => startskjerm();
      return;
    }
  } else {
    try {
      await initPimcWorker();
    } catch { /* faller tilbake til synkron RASK i pimcHandling */ }
  }
  state = opprettSpill({ antallSpillere: 4 }, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  // Ett delt eksemplar fører alle tre setene, så nullstill det bare én gang.
  for (const a of new Set(nettAgenter ?? [])) a.nyKamp();
  if (motstander === "MesterAI") {
    broKø = Promise.resolve();
    void broPost({ type: "nyKamp", mesterSeter: MESTER_SETER });
    void broPost(broRundeStart());
  }
  logg("start", { frø: state.frø, målPoeng: state.regler.målPoeng, motstander, styrke });
  fortsett();
}

/** Ferdig stikk som holdes synlig på bordet en stund (med vinner). */
let frystStikk: { kort: readonly { spiller: number; kort: Kort }[]; vinner: number } | null = null;

function gjør(h: Handling): void {
  const res = utfør(state, h);
  state = res.state;
  håndterHendelser(res.hendelser);
  broSpeil(h, res.hendelser);
  const stikk = res.hendelser.find((x) => x.type === "STIKK_FERDIG");
  if (stikk !== undefined && stikk.type === "STIKK_FERDIG") {
    frystStikk = { kort: stikk.stikk, vinner: stikk.vinner };
    travelt = true;
    tegn();
    ponder(state, STIKKPAUSE - 150);
    samleStikketTilVinneren(stikk.vinner);
    setTimeout(() => {
      frystStikk = null;
      travelt = false;
      fortsett();
    }, STIKKPAUSE);
    return;
  }
  fortsett();
}

/**
 * ============ STIKKET SKAL SES GÅ TIL DEN SOM VANT DET ==================
 *
 * ARVIND: «det kan gå litt for raskt når vi spiller og vi får ikke med oss
 * ting.»
 *
 * Før lå de fire kortene stille i 2,6 sekunder med en stjerne ved vinnerens
 * navn, og så var de borte. Man måtte LESE seg til hvem som tok stikket. Nå
 * gjør bordet det i stedet: kortene blir stående mens man rekker å se dem,
 * og glir så samlet bort til vinnerens plass.
 *
 * ============ HVORFOR FLYTTINGEN MÅLES OG IKKE SKRIVES I CSS ============
 *
 * Fire plasser × fire mulige vinnere er seksten retninger, og de er ikke
 * faste: bordet er et rutenett som endrer form med skjermen, så en avstand
 * skrevet i CSS ville vært en gjetning som stemte på én skjermstørrelse.
 * `getBoundingClientRect` vet det eksakt, og det er fire elementer å måle.
 *
 * DOM-EN STÅR STILLE HER, og det er forutsetningen. `tegn()` kalles ikke
 * under frysingen, så elementene vi måler er de samme som fortsatt henger
 * der når flyttingen skal skje.
 */
const STIKKPAUSE = 3000;
const SAMLE_START = 1450; // hvor lenge stikket står stille før det samles
function samleStikketTilVinneren(vinner: number): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  setTimeout(() => {
    const bord = rot.querySelector<HTMLElement>(".bord");
    const mål = rot.querySelector<HTMLElement>(".bordkort.vant .kort");
    if (bord === null || mål === null) return;
    // 1. MÅL FØRST, mens ingenting er endret.
    const m = mål.getBoundingClientRect();
    const flytt: { el: HTMLElement; dx: number; dy: number }[] = [];
    for (const el of rot.querySelectorAll<HTMLElement>(".bordkort .kort")) {
      const r = el.getBoundingClientRect();
      flytt.push({
        el,
        dx: m.left + m.width / 2 - (r.left + r.width / 2),
        dy: m.top + m.height / 2 - (r.top + r.height / 2),
      });
    }
    // 2. Slå på den lange overgangen, og tving fram en omregning så
    //    nettleseren har sett tilstanden UTEN flyttingen med overgangen på.
    //    Uten dette steget settes overgang og sluttposisjon i samme omgang,
    //    og kortene hopper i stedet for å gli.
    bord.classList.add("samler");
    void bord.offsetHeight;
    // 3. Så flytter vi. Vinnerens eget kort blir liggende og løftes litt;
    //    de andre reiser dit.
    for (const { el, dx, dy } of flytt) {
      const sammeSted = Math.abs(dx) < 1 && Math.abs(dy) < 1;
      el.style.transform = sammeSted
        ? "scale(1.08)"
        : `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(.8)`;
      if (!sammeSted) el.style.opacity = "0.5";
    }
  }, SAMLE_START);
}

function håndterHendelser(hendelser: readonly Hendelse[]): void {
  for (const h of hendelser) {
    if (h.type === "BUDVINNER") {
      si(`${NAVN[h.spiller]} vant budrunden med ${budTekst(h.bud)}.`);
      logg("budvinner", { spiller: h.spiller, bud: h.bud, rundeNr: state.rundeNr });
    } else if (h.type === "TRUMF_VALGT") {
      si(`Trumf er ${FARGE_NAVN[h.trumf]}${h.etterlyst ? `, etterlyst ${kortTale(h.etterlyst)}` : ""}.`);
    } else if (h.type === "MAKKER_AVSLØRT") {
      si(`${NAVN[h.spiller]} er makkeren!`);
    } else if (h.type === "STIKK_FERDIG") {
      si(`${NAVN[h.vinner]} vant stikket.`);
    } else if (h.type === "RUNDE_SLUTT") {
      logg("runde", {
        rundeNr: state.rundeNr,
        budvinner: h.resultat.budvinner,
        melding: h.resultat.melding,
        klart: h.resultat.klart,
        lagStikk: h.resultat.lagStikk,
        stikkVunnet: h.resultat.stikkVunnet,
        delta: h.resultat.delta,
        totalPoeng: h.totalPoeng,
        // HELE RUNDEN, kort for kort og sete for sete.
        //
        // HVORFOR DEN MÅ LOGGES. Uten den kan en runde bare gjenskapes ved å
        // spille den om igjen med NØYAKTIG den boten som satt der — og
        // divergerer ett eneste kortvalg, endres stikkvinneren og hele
        // turrekkefølgen forskyver seg. Målt 4. august: av 1 172 loggede
        // runder lot bare 123 seg gjenskape, fordi de eldste ble spilt mot
        // PIMC og ikke mot nettet.
        //
        // Med historikken logget trengs ingen gjenskaping i det hele tatt.
        // Hver framtidig runde blir treningsdata for menneskeklonen — den
        // eneste linjen som angriper målet direkte, siden et BESTE SVAR mot en
        // fast motstanderpopulasjon slår enhver likevekt.
        //
        // INGEN NY LEKKASJE: klienten spiller hele runden lokalt og har alle
        // hendene i minnet fra før. Dette skriver bare ned det den alt vet,
        // ETTER at runden er ferdig.
        historikk: state.historikk.map((st) => st.kort.map((kp) => [kp.spiller, kp.kort.farge, kp.kort.verdi])),
        vrak: state.vrak.map((k) => [k.farge, k.verdi]),
        trumf: state.trumf,
        etterlyst: state.etterlyst === null ? null : [state.etterlyst.farge, state.etterlyst.verdi],
        makker: state.makker,
      });
    } else if (h.type === "KAMP_SLUTT") {
      logg("kamp", { vinner: h.vinner, totalPoeng: state.totalPoeng, runder: state.rundeNr + 1 });
    }
  }
}

/** Driver spillet videre: botene spiller automatisk, mennesket får UI. */
function fortsett(): void {
  if (travelt) return;
  tegn();
  const lov = lovligeHandlinger(state);
  if (lov.fase === "FERDIG") return;
  if (lov.fase === "RUNDE_SLUTT") return; // venter på «Neste runde»-knappen

  const aktør = lov.fase === "VRAK" || lov.fase === "VELG" ? state.budvinner! : lov.spiller;
  if (aktør === MENNESKE) {
    venterPåMenneske = true;
    sistTur = performance.now();
    tegn();
    return;
  }

  // Bot i tur. NEAT-nettene svarer momentant; PIMC tenker i workeren
  // (opptil ~5 s ved MAKS) uten å blokkere UI-et.
  venterPåMenneske = false;
  travelt = true;
  tenkStart = performance.now();
  if (motstander === "MesterAI") {
    tegn();
    const reserve = (): Handling =>
      velgHandling(state, { ...STYRKER.RASK.spill, frø: (Math.random() * 1e9) >>> 0 });
    void broPost({ type: "beslutt", sete: aktør })
      .then((svar) => {
        travelt = false;
        gjørMedPause(svar.handling ? broHandlingFra(svar.handling) : reserve(), 550);
      })
      .catch(() => {
        travelt = false;
        gjørMedPause(reserve(), 550);
      });
  } else if (nettAgenter !== null) {
    // SØKET GÅR TIL WORKEREN, og bare når det er noe å hente: kortvalg der
    // boten er spillefører. Alt annet svarer nettet på i mikrosekunder, og å
    // sende det gjennom en meldingskø ville vært ren overhead.
    const børSøke =
      SØKVERDENER > 0 && state.fase === "SPILL" && aktør === state.budvinner && råVekter !== null;
    if (børSøke) {
      tegn();
      const t0 = performance.now();
      void søkTrekk(state, aktør).then((h) => {
        travelt = false;
        // LOGG OM SØKET FAKTISK KJØRTE. Uten dette vet vi ikke fra basen om
        // v5 spilte med søk eller falt stille tilbake til nettet – samme
        // problem som førerraden som var usynlig i hver måling.
        logg("soek", {
          rundeNr: state.rundeNr,
          stikk: state.stikkSpilt,
          brukt: h !== null,
          ms: Math.round(performance.now() - t0),
          verdener: SØKVERDENER,
        });
        gjørMedPause(h ?? nettAgenter![aktør - 1]!.velgHandling(state), 250);
      });
      return;
    }
    // Tegner ETTER at `travelt` er satt, slik at «… tenker»-bobla rekker å
    // vises også for bud, vrak og trumfvalg. Uten dette sto skjermen helt
    // stille i de fasene — og en stille skjerm er ikke til å skille fra en
    // hengt side, selv når pausen er et halvt sekund.
    tegn();
    setTimeout(() => {
      const h = nettAgenter![aktør - 1]!.velgHandling(state);
      travelt = false;
      gjørMedPause(h, 550);
    }, 30);
  } else {
    tegn();
    void pimcHandling(state).then((h) => {
      travelt = false;
      gjørMedPause(h, 250);
    });
  }
}

function gjørMedPause(h: Handling, pauseMs: number): void {
  travelt = true;
  // utfør er ren – regn ut neste stilling nå, så botene kan pondere i pausen.
  try {
    ponder(utfør(state, h).state, pauseMs - 40);
  } catch { /* pondering er best-effort */ }
  setTimeout(() => {
    travelt = false;
    gjør(h);
  }, pauseMs);
}

// --- Menneskehandlinger -----------------------------------------------------
function menneskeBud(bud: Bud): void {
  logg("valg-bud", { rundeNr: state.rundeNr, bud, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  gjør({ type: "BUD", spiller: MENNESKE, bud });
}

function menneskeVrak(): void {
  logg("valg-vrak", { rundeNr: state.rundeNr, antall: vrakValg.length, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  const kort = vrakValg;
  vrakValg = [];
  gjør({ type: "VRAK", spiller: MENNESKE, kort });
}

function menneskeVelg(trumf: Farge, etterlyst: Kort | null): void {
  logg("valg-trumf", { rundeNr: state.rundeNr, trumf, etterlyst, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  velgTrumfValg = null;
  velgEtterlysValg = null;
  gjør({ type: "VELG", spiller: MENNESKE, trumf, etterlyst });
}

function menneskeSpill(kort: Kort): void {
  logg("valg-kort", { rundeNr: state.rundeNr, stikk: state.stikkSpilt, kort, ms: Math.round(performance.now() - sistTur) });
  venterPåMenneske = false;
  si(`Du spilte ${kortTale(kort)}.`);
  gjør({ type: "SPILL", spiller: MENNESKE, kort });
}

// --- Tegning ----------------------------------------------------------------
const budTekst = (b: Bud): string =>
  b === PASS ? "Pass" : b === AMERIKANER ? "Amerikaner!" : b === SOLO ? "Solo!" : String(b);

/**
 * KORTBAKSIDEN. Stjerna på kobolt, med kremramme slik ekte kortrygger har.
 * Brukes til motstandernes bunker på bordet og til viften på startskjermen.
 */
const kortRygg = (): string =>
  `<div class="kort rygg" aria-hidden="true">${stjerne()}</div>`;

function kortKnapp(
  k: Kort,
  opts: { valgbar?: boolean; valgt?: boolean; liten?: boolean; ny?: boolean },
): string {
  const id = `kort-${k.farge}${k.verdi}`;
  const sym = FARGE_TEGN[k.farge];
  const v = VERDI_TEKST(k.verdi);
  // Indeksen i BEGGE hjørner, som på et ekte kort. Det øverste er det som er
  // synlig når hånden ligger i vifte; det nederste er det som gjør at kortet
  // LESER som et kort i stedet for som en knapp med et symbol på.
  const hjorne = (ned: boolean): string =>
    `<span class="hjorne${ned ? " ned" : ""}" aria-hidden="true">${v}<span class="sym">${sym}</span></span>`;
  return `<button id="${id}" class="kort ${fargeKlasse(k.farge)}${opts.liten ? " liten" : ""}${opts.valgt ? " valgt" : ""}${opts.ny ? " ny" : ""}"
    ${opts.valgbar ? "" : "disabled"}
    aria-label="${kortTale(k)}${opts.valgt ? ", valgt" : ""}" data-farge="${k.farge}" data-verdi="${k.verdi}">
    ${hjorne(false)}
    <span class="midt" aria-hidden="true">${sym}</span>
    ${hjorne(true)}
  </button>`;
}

function sorterHånd(hånd: readonly Kort[]): Kort[] {
  const rekkefølge: Farge[] = ["S", "H", "K", "R"];
  return [...hånd].sort(
    (a, b) => rekkefølge.indexOf(a.farge) - rekkefølge.indexOf(b.farge) || b.verdi - a.verdi,
  );
}

function topplinje(): string {
  const m = state.melding;
  const kontrakt =
    state.budvinner !== null && m !== null
      ? `<span class="hvem">${NAVN[state.budvinner]}</span> meldte <b>${m.type === "tall" ? m.bud : m.type}</b>${state.trumf ? ` i ${fargeMerke(state.trumf)}` : ""}`
      : state.fase === "BUDRUNDE"
        ? "Budrunde"
        : "";
  // Stikkteller vises så snart runden spilles (også mens stikket er fryst).
  const iSpill = state.fase === "SPILL" || frystStikk !== null || state.fase === "RUNDE_SLUTT";
  // HVEM SIN TUR DET ER sto ikke noe sted. Boblen «… tenker» dekket botene,
  // men ingenting sa «det er din tur» — og i en firemannsrunde med to sekunders
  // pauser er det nettopp det man mister oversikten over.
  const iTur = frystStikk !== null ? null : (state.iTur ?? null);
  return `<header>
    <div class="poeng" role="group" aria-label="Poengstilling og stikk">
      ${state.totalPoeng
        .map(
          (p, i) =>
            `<div class="spiller${i === MENNESKE ? " deg" : ""}${i === iTur ? " itur" : ""}"><span class="navn">${NAVN[i]}</span><b>${p}</b>${iSpill ? `<span class="stikk" aria-label="stikk denne runden">${state.stikkVunnet[i]} stikk</span>` : ""}</div>`,
        )
        .join("")}
    </div>
    ${kontrakt ? `<div class="kontrakt">${kontrakt}</div>` : ""}
    <div class="runde">Runde ${state.rundeNr + 1}<br>først til ${state.regler.målPoeng}</div>
  </header>`;
}

/**
 * Kortene som lå på bordet ved FORRIGE tegning.
 *
 * `tegn()` bygger hele DOM-en på nytt med `innerHTML`, så et kort som blir
 * liggende er likevel et nytt element hver gang. Uten denne ville
 * innleggings-animasjonen spilt av på ALLE fire kortene hver gang noe som
 * helst annet endret seg — som er verre enn ingen animasjon. Med den animeres
 * bare det kortet som faktisk nettopp ble lagt ned.
 */
let forrigeBordkort = new Set<string>();

function bordet(): string {
  // bord[i] plasseres etter sete: 0 nederst, 1 venstre, 2 øverst, 3 høyre.
  const plass = ["bunn", "venstre", "topp", "høyre"];
  // Fryst stikk: alle fire kortene blir stående med vinnermarkering.
  const påBordet = frystStikk !== null ? frystStikk.kort : state.bord;
  const nå = new Set(påBordet.map((b) => `${b.spiller}${kortId(b.kort)}`));
  const erNy = (b: { spiller: number; kort: Kort }): boolean =>
    !forrigeBordkort.has(`${b.spiller}${kortId(b.kort)}`);
  const lagt = new Set(påBordet.map((b) => b.spiller));
  const kort = påBordet
    .map((b) => {
      const vant = frystStikk !== null && b.spiller === frystStikk.vinner;
      return `<div class="bordkort ${plass[b.spiller]}${vant ? " vant" : ""}">
      <div class="hvem">${NAVN[b.spiller]}${vant ? `<span class="vant">${stjerne()} vant stikket</span>` : ""}</div>${kortKnapp(b.kort, { liten: true, ny: erNy(b) })}</div>`;
    })
    .join("");
  forrigeBordkort = nå;

  // «TENKER»-BOBLA GJALDT BARE KORTSPILLET. Botene bruker like lang tid på
  // bud, vrak og trumfvalg — og der sto skjermen helt stille, som er umulig å
  // skille fra at siden har hengt seg. Nå gjelder den alle fasene.
  const tenkeSete =
    frystStikk === null && !venterPåMenneske && travelt && state.fase !== "RUNDE_SLUTT" && state.fase !== "FERDIG"
      ? (state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner : state.iTur)
      : null;
  /** «tenker …» med tellende sekunder — brukes både i bunken og alene. */
  const tenkeboble = `tenker<span id="tenker-tid"></span><span class="prikker" aria-hidden="true"><i></i><i></i><i></i></span>`;

  /**
   * MOTSTANDERNES BUNKER. Et bord uten kort på hendene ser ut som en tom
   * flate med noen knapper på — og på telefon sto to tredeler av skjermen
   * ubrukt. Tre kortrygger og et tall gjør det til et kortbord, og sier
   * samtidig hvor langt ut i runden man er.
   *
   * Bunken og «tenker»-bobla DELER RUTE, og det er derfor de er slått sammen
   * her i stedet for å være to elementer: begge hører til det setet som ennå
   * ikke har lagt, altså nøyaktig samme celle i rutenettet. To absolutt
   * plasserte ting i samme celle ville lagt seg oppå hverandre — det var
   * akkurat den feilen bordkortene hadde mot trumfskiltet på liggende
   * telefon.
   */
  const bunker =
    state.fase === "SPILL"
      ? [1, 2, 3]
          .filter((s) => !lagt.has(s) && (state.hender[s]?.length ?? 0) > 0)
          .map(
            (s) => `<div class="bordkort ${plass[s]}"><div class="bunke">
              <div class="vifte">${kortRygg()}${kortRygg()}${kortRygg()}</div>
              <div class="antall">${
                s === tenkeSete ? `${NAVN[s]} ${tenkeboble}` : `${NAVN[s]} · ${state.hender[s]!.length} kort`
              }</div>
            </div></div>`,
          )
          .join("")
      : "";

  // I SPILLFASEN bæres «tenker» av bunken over, siden bunken og bobla hører
  // til samme sete og dermed samme rute. Utenfor spillfasen finnes ingen
  // bunker, og da står bobla for seg selv.
  const tenker =
    tenkeSete !== null && tenkeSete !== MENNESKE && state.fase !== "SPILL"
      ? `<div class="tenker ${plass[tenkeSete]}">${NAVN[tenkeSete]} ${tenkeboble}</div>`
      : "";

  // TRUMFEN SKAL ALLTID VÆRE SYNLIG. Den lå som ett lite tegn i kontraktlinja
  // øverst; midt i en runde er det nøyaktig den ene opplysningen man ser etter
  // oftest, og den skal ikke måtte letes fram.
  const trumfskilt =
    state.trumf !== null && (state.fase === "SPILL" || frystStikk !== null)
      ? `<div class="trumfskilt">${stjerne()}<span class="merkelapp">TRUMF</span>${fargeMerke(state.trumf)}</div>`
      : "";
  const info = state.etterlyst
    ? `<div class="etterlyst"><span class="merkelapp">Etterlyst</span>${fargeMerke(state.etterlyst.farge, false)} <b>${VERDI_TEKST(state.etterlyst.verdi)}</b>${state.makkerAvslørt && state.makker !== null ? ` · ${NAVN[state.makker]}` : " · skjult makker"}</div>`
    : "";
  // «DIN TUR» sto ingen steder. Botene fikk en boble, mennesket fikk
  // ingenting — og med to sekunders pauser mellom hvert stikk er det lett å
  // sitte og vente på en skjerm som venter på deg.
  const dinTur =
    venterPåMenneske && state.fase === "SPILL" && frystStikk === null
      ? `<div class="dintur">Din tur — spill et kort</div>`
      : "";
  const midt =
    trumfskilt || info || dinTur ? `<div class="midtfelt">${trumfskilt}${info}${dinTur}</div>` : "";

  // Forrige stikk: alltid synlig i hjørnet mens neste stikk spilles.
  const forrige =
    frystStikk === null && state.fase === "SPILL" && state.forrigeStikk !== null
      ? `<div class="forrige" aria-label="Forrige stikk">
          <div class="tittel">Forrige · <b>${NAVN[state.forrigeStikk.vinner]}</b> vant</div>
          <div class="rad">${state.forrigeStikk.kort
            .map((b) => `<div><div class="navn">${NAVN[b.spiller].split(" ")[0]}</div>${kortKnapp(b.kort, {})}</div>`)
            .join("")}</div>
        </div>`
      : "";
  return `<div class="bord" aria-label="Bordet">${kort}${bunker}${midt}${tenker}${forrige}</div>`;
}

/**
 * HVOR MANGE KORT DET SKAL VÆRE PLASS TIL PER RAD.
 *
 * ============ HVA SOM VAR GALT, OG HVORFOR DET IKKE SYNTES ==============
 *
 * Hånden lå i én `flex-wrap: nowrap`-rad med `width: clamp(82px, 11.5vh,
 * 184px)`. `nowrap` hindrer bryting, men ikke KRYMPING: flex-elementer har
 * `flex-shrink: 1` som standard, så tretten kort i 390 piksler ble klemt til
 * rundt 30 px hver. `overflow: hidden` på `body` gjorde at det ikke engang
 * ble en scrollbar å ta tak i — kortene ble bare små.
 *
 * 30 px er under enhver lesbarhetsgrense og godt under de 44 px Apple og
 * Google begge oppgir som minste trykkflate. På PC syntes ingenting av det,
 * fordi der var det plass.
 *
 * ============ REGELEN, OG HVORFOR DEN TAR HØYDEN MED ====================
 *
 * Å bare la raden brekke er ikke nok. Da blir kortene så små som gulvet
 * tillater, i stedet for så store som plassen tillater. Derfor velges
 * ANTALL RADER først, og bredden følger av det.
 *
 * Bredden sier hvor mange rader som trengs for at et kort skal nå målbredden.
 * Høyden sier hvor mange rader det er RÅD til: en liggende telefon har 390
 * piksler totalt, og to rader kort ville spist over halvparten av bordet.
 * Derfor er taket 1 rad under 500 px høyde, 2 under 700, ellers 3.
 *
 *     PC 1440×900        1 rad,  13 per rad  → 107 px kort
 *     iPad 820×1180      2 rader, 7 per rad  → 101 px kort (mot 59 før)
 *     telefon 390×844    3 rader, 5 per rad  →  75 px kort (mot ~30 før)
 *     telefon 844×390    1 rad,  13 per rad  →  61 px kort, bordet beholdt
 *
 * Liggende telefon er den formfaktoren som pleier å bli glemt, og det er
 * nøyaktig den som taper på en regel som bare ser på bredden.
 */
const MÅLBREDDE = 76; // px inkludert luft — under dette blir kortet for smått
/** Andel av skjermhøyden hånden får lov å bruke, uansett antall rader. */
const HÅNDHØYDE = 0.42;
function håndmål(antall: number): { n: number; maks: number } {
  const b = window.innerWidth || 1024;
  const h = window.innerHeight || 768;
  if (antall <= 1) return { n: 1, maks: 132 };
  const takRader = h < 500 ? 1 : h < 700 ? 2 : 3;
  const passerPerRad = Math.max(1, Math.floor(b / MÅLBREDDE));
  const rader = Math.min(takRader, Math.max(1, Math.ceil(antall / passerPerRad)));
  // Taket er en HØYDEGRENSE, ikke en smaksdom: `rader` kort à `bredde/0,7` i
  // høyden skal ikke spise mer enn 42 % av skjermen, ellers forsvinner bordet.
  const maks = Math.min(132, Math.max(46, Math.floor((HÅNDHØYDE * h * 0.7) / rader)));
  return { n: Math.ceil(antall / rader), maks };
}

function håndPanel(): string {
  const lov = lovligeHandlinger(state);
  const hånd = sorterHånd(state.hender[MENNESKE] ?? []);
  const spillbare =
    venterPåMenneske && lov.fase === "SPILL"
      ? new Set(lov.kort.map((k) => `${k.farge}${k.verdi}`))
      : null;
  const mål = håndmål(hånd.length);
  // «passiv» = kortene er ikke valgbare fordi et panel har ordet, ikke fordi
  // de er ulovlige. Da skal de være fullt lesbare — se `.hånd.passiv` i CSS.
  const passiv = spillbare === null;
  return `<div class="hånd${passiv ? " passiv" : ""}" role="group" aria-label="Kortene dine" style="--n:${mål.n};--kmaks:${mål.maks}px">
    ${hånd
      .map((k) =>
        kortKnapp(k, {
          valgbar: spillbare !== null && spillbare.has(`${k.farge}${k.verdi}`),
          valgt: vrakValg.some((v) => v.farge === k.farge && v.verdi === k.verdi),
        }),
      )
      .join("")}
  </div>`;
}

function budPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "BUDRUNDE") return "";
  const tall = lov.bud.filter((b): b is number => typeof b === "number");
  const høyeste = state.budrunde.høyeste;
  return `<div class="overlegg"><div class="panel" role="dialog" aria-label="Ditt bud">
    <h2>Ditt bud${høyeste ? ` <span class="bekreftsmatt">— høyeste er ${budTekst(høyeste.bud)} fra ${NAVN[høyeste.spiller]}</span>` : ""}</h2>
    <div class="knapper">
      <button class="stor pass" data-bud="PASS">Pass</button>
      ${tall.map((b) => `<button class="stor tallbud" data-bud="${b}">${b}</button>`).join("")}
      ${lov.bud.includes(AMERIKANER) ? `<button class="stor spesial" data-bud="AMERIKANER">Amerikaner</button>` : ""}
      ${lov.bud.includes(SOLO) ? `<button class="stor spesial" data-bud="SOLO">Solo</button>` : ""}
    </div>
  </div></div>`;
}

function vrakPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "VRAK") return "";
  return `<div class="overlegg"><div class="panel" role="dialog" aria-label="Vrak kort">
    <h2>Du vant budet! Velg ${lov.antall} kort å legge bort
      <span class="bekreftsmatt">(${vrakValg.length} av ${lov.antall} valgt)</span></h2>
    <div class="vrakhånd">${sorterHånd(lov.hånd)
      .map((k) => kortKnapp(k, { valgbar: true, valgt: vrakValg.some((v) => v.farge === k.farge && v.verdi === k.verdi) }))
      .join("")}</div>
    <button class="stor bekreft" id="vrak-ok" ${vrakValg.length === lov.antall ? "" : "disabled"}>Legg bort valgte</button>
  </div></div>`;
}

function velgPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "VELG") return "";

  if (velgTrumfValg === null) {
    /**
     * FIRE KORT, IKKE FIRE TEKSTKNAPPER — og det er rettelsen på klagen.
     *
     * Knappene var `background:#f5f5ee` med `color:--f`, altså riktig vei
     * (mørkt blekk på lyst). Problemet var at de var SMÅ og at symbolet var
     * satt i samme størrelse som teksten ved siden av. På telefon var ♠ og ♣
     * to like små sorte flekker.
     *
     * Nå er hver farge et kort: farget stripe langs toppen (leses av på
     * avstand, uten å tyde symbolet), symbolet stort i blekkfargen på hvit
     * flate, og navnet skrevet under. Tre uavhengige kjennetegn — form, farge
     * og ord — så ingen av dem trenger å bære valget alene.
     */
    return `<div class="overlegg"><div class="panel" role="dialog" aria-label="Velg trumf">
      <h2>Velg trumffarge</h2>
      <div class="trumfvalg">${(["S", "K", "H", "R"] as Farge[])
        .map(
          (f) => `<button class="trumfkort ${fargeKlasse(f)}" data-trumf="${f}" aria-label="${FARGE_NAVN[f]}">
            <span class="stripe" aria-hidden="true"></span>
            <span class="tsym" aria-hidden="true">${FARGE_TEGN[f]}</span>
            <span class="tnavn">${FARGE_NAVN[f]}</span>
          </button>`,
        )
        .join("")}</div>
    </div></div>`;
  }
  if (!lov.måEtterlyse) return ""; // solo: ingen etterlysning

  const trumf = velgTrumfValg;
  const symbol = FARGE_TEGN[trumf];

  // BEKREFTELSESSTEGET. Ingenting sendes til motoren før dette er trykket.
  if (velgEtterlysValg !== null) {
    const e = velgEtterlysValg;
    return `<div class="overlegg"><div class="panel" role="dialog" aria-label="Bekreft valget">
      <h2>Bekreft</h2>
      <p class="bekreftlinje">Trumf blir ${fargeMerke(trumf)}
         — du etterlyser ${fargeMerke(trumf, false)} <b>${VERDI_TEKST(e.verdi)}</b>.</p>
      <p class="bekreftsmatt">Den som har kortet blir din hemmelige makker.</p>
      <div class="knapper">
        <button class="stor bekreft" id="velg-ok">Bekreft</button>
        <button class="stor" id="velg-angre">Angre</button>
      </div>
    </div></div>`;
  }

  /**
   * BARE TRUMFFARGEN, og bare de LOVLIGE valørene.
   *
   * Listen kommer fra `lovligeEtterlys` — motorens egen regel — og ikke fra en
   * kopi her. Den utelater både egne kort og de vrakede, som er to ulike
   * grunner til at et kort ikke kan etterlyses, og bare den ene var håndtert
   * før (egne kort ble deaktivert, vrakede ikke).
   */
  const lovlige = lovligeEtterlys(state, trumf);
  /**
   * VALØRKNAPPENE VAR DET VERSTE STEDET, og de er nå MINIKORT.
   *
   * De hadde `background:#16232f` (mørk blå) og `style="color:${css}"`. For
   * spar ble det `#1a1a1a` på `#16232f` — kontrast 1,2:1. Man kunne se at det
   * sto NOE i knappen, ikke hva. Kløver lå på 2,1:1.
   *
   * Nå har hver valør hvit kortflate og blekkfarge, altså samme kontrast som
   * kortene på hånden, og de er minst 48×60 px. Overskriften bærer fargen som
   * et fylt merke, ikke som farget tekst.
   */
  return `<div class="overlegg"><div class="panel" role="dialog" aria-label="Etterlys et kort">
    <h2>Trumf blir ${fargeMerke(trumf)} — hvilket kort etterlyser du?</h2>
    <p class="bekreftsmatt">Eieren blir din hemmelige makker. Kortet må være trumf.</p>
    <div class="etterlysrad">${lovlige
      .slice()
      .sort((a, b) => b.verdi - a.verdi)
      .map(
        (k) => `<button class="minikort ${fargeKlasse(trumf)}" data-ev="${k.verdi}" aria-label="${kortTale(k)}">
          <span class="v">${VERDI_TEKST(k.verdi)}</span><span class="sym" aria-hidden="true">${symbol}</span>
        </button>`,
      )
      .join("")}</div>
    <div class="knapper"><button class="stor" id="velg-tilbake">Bytt trumffarge</button></div>
  </div></div>`;
}

function rundeSluttPanel(): string {
  if (state.fase !== "RUNDE_SLUTT" || state.sisteRunde === null) return "";
  const r = state.sisteRunde;
  const m = r.melding;
  const hva = m.type === "tall" ? `${m.bud}` : m.type;
  return `<div class="overlegg"><div class="panel resultat" role="dialog" aria-label="Rundens resultat">
    <h2>${NAVN[r.budvinner]} meldte ${hva} og ${r.klart ? "KLARTE det! ✅" : "falt ❌"}<br>
      <span class="bekreftsmatt">${r.lagStikk} stikk${r.makker !== null ? ` sammen med ${NAVN[r.makker]}` : ""}</span></h2>
    <div class="delta">${r.delta.map((d, i) => `<span class="${d >= 0 ? "pluss" : "minus"}">${NAVN[i]}: ${d >= 0 ? "+" : ""}${d}</span>`).join("")}</div>
    <button class="stor bekreft" id="neste">Neste runde</button>
  </div></div>`;
}

function ferdigPanel(): string {
  if (state.fase !== "FERDIG") return "";
  const vantDu = state.vinner === MENNESKE;
  return `<div class="overlegg"><div class="panel resultat" role="dialog" aria-label="Kampen er ferdig">
    <h2>${vantDu ? "🎉 DU VANT! 🎉" : `${NAVN[state.vinner!]} vant kampen`}</h2>
    <div class="delta">${state.totalPoeng.map((p, i) => `<span>${NAVN[i]}: ${p}</span>`).join("")}</div>
    <button class="stor bekreft" id="nytt-spill">Nytt spill</button>
    <p class="lite">Resultatene er lagret. <a href="${DATA_URL}" target="_blank" rel="noopener">Se innsamlede data</a></p>
  </div></div>`;
}

/** Hvilket panel som sto framme ved forrige tegning — se `fersk` under. */
let sistPanel = "";

function tegn(): void {
  if (!state) return;
  rot.innerHTML = topplinje() + bordet() + budPanel() + vrakPanel() + velgPanel() + rundeSluttPanel() + ferdigPanel() + håndPanel();
  /**
   * «fersk» = panelet er et ANNET enn forrige gang, og bare da skal det
   * animeres inn.
   *
   * `innerHTML` bygger alt på nytt ved hver tilstandsendring, så et panel som
   * blir stående er likevel et nytt element. Med animasjonen bundet til
   * elementet blinket og gled hele vrakpanelet hver gang man huket av ett
   * kort — fordi tellerne «(1/4 valgt)» endret seg og utløste en ny tegning.
   * Det så ut som en feil, og det var en.
   */
  const panel = rot.querySelector<HTMLElement>(".overlegg > .panel");
  const nøkkel = panel?.getAttribute("aria-label") ?? "";
  if (panel !== null && nøkkel !== sistPanel) panel.parentElement!.classList.add("fersk");
  sistPanel = nøkkel;
  koble();
}

// --- Hendelseskobling (event delegation per tegning) ------------------------
function koble(): void {
  const lov = lovligeHandlinger(state);
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-bud]")) {
    b.onclick = () => {
      const t = b.dataset["bud"]!;
      menneskeBud(t === "PASS" ? PASS : t === "AMERIKANER" ? AMERIKANER : t === "SOLO" ? SOLO : Number(t));
    };
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-trumf]")) {
    b.onclick = () => {
      const f = b.dataset["trumf"] as Farge;
      if (lov.fase === "VELG" && !lov.måEtterlyse) menneskeVelg(f, null);
      else {
        velgTrumfValg = f;
        tegn();
      }
    };
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>("[data-ev]")) {
    // Peker bare PÅ kortet. Bekreftelsen sender det.
    b.onclick = () => {
      velgEtterlysValg = { farge: velgTrumfValg!, verdi: Number(b.dataset["ev"]) as Kort["verdi"] };
      tegn();
    };
  }
  for (const b of rot.querySelectorAll<HTMLButtonElement>(".kort:not([disabled])")) {
    b.onclick = () => {
      const kort: Kort = { farge: b.dataset["farge"] as Farge, verdi: Number(b.dataset["verdi"]) as Kort["verdi"] };
      if (lov.fase === "VRAK" && venterPåMenneske) {
        const i = vrakValg.findIndex((v) => v.farge === kort.farge && v.verdi === kort.verdi);
        if (i >= 0) vrakValg.splice(i, 1);
        else if (vrakValg.length < lov.antall) vrakValg.push(kort);
        tegn();
      } else if (lov.fase === "SPILL" && venterPåMenneske) {
        menneskeSpill(kort);
      }
    };
  }
  const vrakOk = document.getElementById("vrak-ok");
  if (vrakOk) vrakOk.onclick = () => menneskeVrak();
  /**
   * BEKREFTELSEN. Trumf og etterlysning sendes samlet, og foerst her — et
   * feiltrykk paa kortlista er naa gratis.
   */
  const velgOk = document.getElementById("velg-ok");
  if (velgOk) {
    velgOk.focus();
    velgOk.onclick = () => menneskeVelg(velgTrumfValg!, velgEtterlysValg);
  }
  const velgAngre = document.getElementById("velg-angre");
  if (velgAngre) velgAngre.onclick = () => { velgEtterlysValg = null; tegn(); };
  const velgTilbake = document.getElementById("velg-tilbake");
  if (velgTilbake) velgTilbake.onclick = () => { velgTrumfValg = null; velgEtterlysValg = null; tegn(); };
  const neste = document.getElementById("neste");
  if (neste) {
    neste.focus();
    neste.onclick = () => gjør({ type: "NESTE" });
  }
  const nytt = document.getElementById("nytt-spill");
  if (nytt) {
    nytt.focus();
    nytt.onclick = () => startskjerm();
  }
}

// --- Startskjerm ------------------------------------------------------------
/**
 * ETT FELT, ÉN KNAPP.
 *
 * ARVIND, om modellvalget: brukeren velger ikke modell — så det skal ikke stå
 * der. Det var to knapper som het noe bare vi forstår («Adams – budmodell +
 * vakt + finjustert nett», «MesterAI – appens mester»), og de spurte om noe
 * ingen i familien har grunnlag for å svare på. En startskjerm skal spørre om
 * det brukeren VET: hva de heter.
 *
 * MESTERAI ER IKKE FJERNET, bare tatt ut av veien. Den er et utviklerverktøy
 * som krever at broen kjører på laptopen, og den nås nå med `?mester=1` i
 * adressen. Å slette den ville vært å kaste bort en fungerende målevei for å
 * rydde en skjerm.
 *
 * NAVNET LAGRES IKKE MELLOM ØKTER. Feltet er tomt hver gang, og ingenting her
 * skriver det til `localStorage`. (Merk at hendelsesloggen — som alltid har
 * gjort det — fortsatt tar med navnet i sine egne rader; det er
 * datainnsamlingen, og den er en annen sak enn å huske navnet i skjemaet.)
 */
function startskjerm(): void {
  const broModus = new URLSearchParams(location.search).get("mester") === "1";
  motstander = broModus && LOKAL ? "MesterAI" : "Vaar";
  rot.innerHTML = `<div class="overlegg"><div class="panel start" role="dialog" aria-label="Start">
    <div class="kortvifte" aria-hidden="true">${kortRygg()}${kortRygg()}${kortRygg()}</div>
    <h1 class="ordmerke">Amerikaneren<span class="demo">demo</span></h1>
    <p>Tre boter mot deg. Store kort, laget for TV, iPad og telefon.</p>
    ${motstander === "MesterAI" ? `<p class="bekreftsmatt">Bromodus: du møter MesterAI fra laptopen.</p>` : ""}
    <label for="navn">Hva heter du?</label>
    <input id="navn" type="text" placeholder="skriv navnet ditt" autocomplete="off"
           enterkeyhint="go" maxlength="24" aria-describedby="navn-hjelp">
    <p id="navn-hjelp" class="bekreftsmatt">Brukes bare til å merke rundene i statistikken.</p>
    <button class="stor bekreft" id="start-knapp">Start spillet</button>
  </div></div>`;
  const knapp = document.getElementById("start-knapp") as HTMLButtonElement;
  const felt = document.getElementById("navn") as HTMLInputElement;
  knapp.onclick = () => void start(felt.value.trim());
  felt.onkeydown = (e) => { if (e.key === "Enter") void start(felt.value.trim()); };
  felt.focus();
}

/**
 * ROTASJON MÅ REGNES OM. `håndmål()` leser `innerWidth`/`innerHeight`, så en
 * telefon som vris fra stående til liggende beholder ellers stående-layouten
 * til noe annet får spillet til å tegne på nytt — og i en stikkpause kan det
 * ta flere sekunder.
 *
 * Tegner BARE når utfallet faktisk endrer seg. `tegn()` bygger hele DOM-en
 * med `innerHTML` og river dermed fokus ut av knappen brukeren står på; å
 * gjøre det for hver piksel under en dra-i-vindus-kant ville vært verre enn
 * problemet.
 */
let sistLayout = "";
addEventListener("resize", () => {
  if (!state) return;
  const m = håndmål((state.hender[MENNESKE] ?? []).length);
  const nøkkel = `${m.n}:${m.maks}`;
  if (nøkkel === sistLayout) return;
  sistLayout = nøkkel;
  tegn();
});

// Tenketid-teller i «tenker…»-boblen (oppdateres utenom re-tegning).
setInterval(() => {
  const el = document.getElementById("tenker-tid");
  if (el !== null && travelt && tenkStart > 0) {
    const s = (performance.now() - tenkStart) / 1000;
    el.textContent = s >= 1.5 ? ` ${s.toFixed(0)} s` : "";
  }
}, 500);

startskjerm();
