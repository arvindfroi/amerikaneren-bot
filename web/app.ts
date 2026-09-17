/**
 * «Amerikaneren» – TV-vennlig nettspill mot Adams.
 *
 * Hele spillmotoren og boten kjører i nettleseren (null latens). Mennesket
 * sitter på sete 0 (Sør); sete 1–3 er Adams, med søket i førersetet i en Web
 * Worker (`web/worker.ts`) og resten på hovedtråden — begge bygd av
 * `web/adamskjede.ts`. Designet for visning via Chromecast: store kort, høy
 * kontrast, firefarget kortstokk (fargeblind-vennlig), tastaturnavigasjon og
 * aria-live-oppleser. Hver runde og hvert menneskevalg logges til
 * datainnsamlings-endepunktet (Val Town) + localStorage som reserve.
 */

// PIMC-en er bare igjen som bromodusens reserve når MesterAI-broen ikke svarer.
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
// Fra budmodell.ts og IKKE budagent.ts: den siste importerer node:fs paa
// toppniva, og esbuild med nettleserplattform stopper paa den.
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { AMERIKANER, PASS, SOLO, type Bud } from "../src/regler.ts";
import { byggAdams, børSøke, erLovligKort, type AdamsKonfig } from "./adamskjede.ts";
import { Søkeklient, type Arbeider, type Søkelag } from "./sokeklient.ts";
import { Tenkeklokke, type Synlighet, type Tenketid } from "./tempo.ts";

// --- Oppsett ----------------------------------------------------------------
const DATA_URL = "https://arvindfroi--eb370dc886d311f1abd41607ee4eb77e.web.val.run/";
const MENNESKE = 0;

/**
 * ============ VERSJONSHÅNDTAKET MOT `index.html` ========================
 *
 * `index.html` bærer den samme strengen og sammenligner den med denne etter
 * at bundelen er kjørt. Er de ulike, skriver siden det på skjermen.
 *
 * HVORFOR DET TRENGS. Fram til nå lastet `index.html` spillkoden fra en
 * hardkodet adresse hos basen, uansett hvor sida selv ble åpnet fra. Stilarket
 * ligger inne i HTML-fila og var derfor alltid ferskt, mens bundelen kunne
 * være vilkårlig gammel — og det gir én bestemt feilform: NY DESIGN, GAMMEL
 * LOGIKK, uten at noe sier fra.
 *
 * Det er nøyaktig det som ble rapportert denne runden: identiteten fra runde 2
 * var på plass, mens dama fortsatt sto som «D» og stikkvinneren ikke ble vist.
 * Begge var rettet i kilden. Ingen av rettelsene var i bundelen sida kjørte.
 *
 * BUMPES VED HVER ENDRING i `web/`, sammen med `VENTET` i `index.html`.
 */
const BUNDELVERSJON = "v13-2026-09-11";
(globalThis as unknown as Record<string, unknown>)["AMERIKANEREN_VERSJON"] = BUNDELVERSJON;

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

/**
 * ============ TIDSBUDSJETTET — FEM SEKUNDER PER TREKK, RESERVEN MEDREGNET ==
 *
 * Eieren tillater opptil fem sekunder tenketid per trekk. Svarer ikke workeren
 * innen `TREKKFRIST_MS`, spiller hovedtrådens søkfrie kjede — og den svarer på
 * under ett millisekund i Node, noen få på en iPad. Med visningspausen på 250
 * ms etter trekket ligger hele trekket under fem sekunder også når søket bommer.
 *
 * `SØKEFRIST_MS` er budsjettet søket SELV skal få når `Søkspek` får et
 * tidsbudsjett (se `søkspek` i `web/adamskjede.ts`): litt under hovedtrådens
 * frist, så et søk som stopper i tide også rekker gjennom meldingskøen.
 *
 * `KVITTERINGSFRIST_MS` er ikke en dom. Uteblir kvitteringen, spilles trekkene
 * uten søk til den kommer — og kommer den aldri, startes workeren på nytt ved
 * neste kamp (`web/sokeklient.ts`). Her sto seks sekunder som slo av søket for
 * resten av økten.
 */
const TREKKFRIST_MS = 4_500;
const SØKEFRIST_MS = 4_000;
const KVITTERINGSFRIST_MS = 15_000;
/** Så mange fristbrudd på rad før søket settes på pause resten av kampen. */
const MAKS_FRISTBRUDD = 3;

/**
 * ============ BUDQ — BUDET SOM ET LÆRT VALG (11. september) ==============
 *
 * `src/moe2/budq.ts`: Q(stilling, bud) lært fra utspillinger, argmax over de lovlige
 * budene, i stedet for budmodellen og terskelen over. MÅLT på kampbenken, 400 frø per bånd:
 *
 *   appens kjede (søk som fører) med BudQ mot dagens, samme frø   +0,075 ± 0,013 (5,8 SE)
 *   søkfri appkjede med BudQ mot søkfri appkjede, frø 740M         +0,058 ± 0,009
 *   det samme, frø 750M                                            +0,049 ± 0,009
 *
 * Vinner oftere, taper med ~4 poeng mer når den taper. LÆRT MOT ADAMS-MOTSTANDERE, ikke
 * mot mennesker — effekten mot familien kan bare måles etter utrulling.
 *
 * AV til eieren har sett tallene og sagt ja. Når `BUDQ_PÅ` er `false`, går det ikke ett
 * nettverkskall til vektfila, og kjeden er bit for bit den som var utrullet før.
 */
const BUDQVEKTER = "adams-budq.b64";
// PÅ 11. september: eieren overlot beslutningen («du bestemmer»). Tallene over står; å slå av er
// å sette denne til false — da går det ingen forespørsel etter fila, og kjeden er den gamle.
const BUDQ_PÅ: boolean = true;

/** Det ENE oppsettet begge kjedene bygges fra. Se `web/adamskjede.ts`. */
const ADAMS_KONFIG: AdamsKonfig = {
  vaktflagg: VAKTFLAGG,
  vrakflagg: VRAKFLAGG,
  budterskel: BUDTERSKEL,
  verdener: SØKVERDENER,
  sigma: SØKSIGMA,
  fristMs: SØKEFRIST_MS,
  budqPå: BUDQ_PÅ,
};

/** Rå vekter, holdt for å kunne sendes til workeren. Agenter kan ikke krysse
 *  en meldingsgrense; workeren må bygge sin egen fra de samme bytene. */
let råVekter: { kort: string; bud: unknown; vrak: string | null; tro: string | null; budq: string | null } | null = null;

/**
 * ============ HVILKE FILER SOM FAKTISK VANT RESERVEKJEDEN ================
 *
 * `docs/gammelkode.md` N14. Reservekjedene under er gode — de fanger Val Towns
 * 200-med-HTML eksplisitt og roper `console.warn` på hvert trinn. Problemet var
 * hvor ropet havnet: nettleserkonsollen på farmors iPad, som ingen leser.
 *
 * Og `logg("start", …)` skrev bare `motstander` og `styrke` — altså hvilken bot
 * vi MENTE å kjøre. **Ingen rad sa hvilken budmodell som faktisk kjørte.**
 *
 * Det er ikke en detalj: stedfortrederstigen 1. september målte at å fjerne
 * budmodellen koster 18,2 prosentpoeng vinnerandel, den største enkeltdelen i
 * stakken. Ble `bud-menneske.json` lastet opp en dag, ville den sterkeste
 * komponenten byttet seg ut i stillhet, og hver menneskeandel i basen ville
 * blandet to populasjoner uten at én eneste rad viste det.
 *
 * Nå skrives oppløsningen til basen ved hver kampstart. `start` logges etter
 * `await besteBot()` (se `start()`), så feltene er alltid utfylt når de logges.
 * `null` i `bud` betyr at ALLE tre falt bort og at NevroHjernes budgivning
 * kjørte i stedet — som er en helt annen bot, og som nå er synlig som det.
 */
const oppløst: {
  kort: string | null;
  bud: string | null;
  vrak: boolean;
  tro: boolean;
  /** BudQ byr (se `BUDQ_PÅ`). Settes først når nettet faktisk sitter i kjeden. */
  budq: boolean;
} = { kort: null, bud: null, vrak: false, tro: false, budq: false };

let botLaster: Promise<Bot> | null = null;
function besteBot(): Promise<Bot> {
  botLaster ??= Promise.all([
    // Faller tilbake til sd-r2 om de finjusterte vektene ikke kan hentes.
    // Da spiller boten som i gaar i stedet for aa ikke spille i det hele tatt.
    hentB64(KORTVEKTER).then(async (t) => {
      if (t !== null) {
        oppløst.kort = KORTVEKTER;
        return t;
      }
      console.warn(`${KORTVEKTER} kunne ikke hentes – faller tilbake til sd-r2.`);
      const r = await hentB64("sdr2.b64");
      if (r === null) throw new Error("verken finjusterte vekter eller sd-r2 kunne hentes");
      oppløst.kort = "sdr2.b64";
      return r;
    }),
    // Budmodellen hentes ved siden av vektene, med reserve. Feiler BEGGE,
    // faller vi tilbake til NevroHjernes budgivning i stedet for å la hele
    // boten dø – kortspillet er uendret og fortsatt det familien har møtt.
    hentBudmodell(BUDMODELL).then(async (m) => {
      if (m !== null) {
        oppløst.bud = BUDMODELL;
        return m;
      }
      console.warn(`${BUDMODELL} kunne ikke hentes – faller tilbake til ${BUDMODELL_RESERVE}.`);
      const r = await hentBudmodell(BUDMODELL_RESERVE);
      if (r !== null) {
        oppløst.bud = BUDMODELL_RESERVE;
        return r;
      }
      console.warn(`${BUDMODELL_RESERVE} kunne heller ikke hentes – siste utvei ${BUDMODELL_SISTE_UTVEI}.`);
      const s = await hentBudmodell(BUDMODELL_SISTE_UTVEI);
      oppløst.bud = s === null ? null : BUDMODELL_SISTE_UTVEI;
      return s;
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
    // BUDQ. Hentes bare når den er slått på; av betyr ingen nettverkskall og samme kjede
    // som før. Feiler hentingen, byr boten med budmodellen — ingen enkeltdel tar ned resten.
    BUDQ_PÅ ? hentB64(BUDQVEKTER) : Promise.resolve(null),
  ])
    .then(([b64, budRå, vrakB64, troB64, budqB64]) => {
      /**
       * N2: KJEDEN BYGGES IKKE LENGER FOR HÅND.
       *
       * Her sto `Konvensjonsvakt` → `Budagent` → `medVrakrangerer`, skrevet en
       * gang til ved siden av `byggUtrullet`. Nå går den gjennom `byggAdams`,
       * den samme funksjonen workeren bruker, med `medSøk: false`. Hovedtrådens
       * bot er dermed BEVISELIG workerens bot minus søket —
       * `test/app-lik-spek.test.ts` spiller oppdelingen mot speken.
       *
       * Ett delt eksemplar for alle tre botsetene – slik benken kjører den.
       */
      if (budRå === null) console.warn("Budmodellen kunne ikke lastes – spiller med NevroHjernes bud.");
      if (vrakB64 === null) console.warn("Vrakrangereren kunne ikke hentes – vraker som før.");
      const bygd = byggAdams({ kort: b64, bud: budRå, vrak: vrakB64, budq: budqB64 }, ADAMS_KONFIG, false, oppløst.kort ?? KORTVEKTER);
      // Hentet, men forkastet i byggingen: da KJØRER den ikke, og da skal den
      // heller ikke stå i loggen som om den gjorde det.
      if (!bygd.bud) oppløst.bud = null;
      oppløst.vrak = bygd.vrak; // settes FØRST når den faktisk er bygd, ikke når fila kom
      oppløst.tro = troB64 !== null;
      oppløst.budq = bygd.budq;
      råVekter = { kort: b64, bud: budRå, vrak: vrakB64, tro: troB64, budq: budqB64 };
      return bygd.agent;
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
/**
 * SETENE. Ingen robot-emoji.
 *
 * ARVIND: «trenger vi emojer?» — retorisk, og svaret er nei. 🤖 sto etter hvert
 * eneste botnavn og dermed fire til seks ganger på skjermen samtidig: i
 * poengbrettet, i kontraktlinja, over hvert bordkort, i bunkene, i
 * etterlysningsskiltet og i rundeoppgjøret. Det er også et av de tydeligste
 * AI-generert-tegnene et grensesnitt kan bære.
 *
 * Opplysningen den skulle gi — «dette er ikke et menneske» — er dessuten
 * allerede gitt: familien vet at de tre andre er boter, og «Du» skiller det
 * ene setet som er et menneske. Formen sier det, ordet trengs ikke.
 */
/**
 * ============ OG NÅ HETER DE FRANKLIN, LINCOLN OG TRUMP =================
 *
 * ARVIND, om konseptkunsten: «man ser de 3 motstanderene sitte overfor bordet
 * (franklin, lincon, trump)».
 *
 * «Vest», «Nord» og «Øst» er bridgens himmelretninger, og de beskriver et
 * bord sett rett ovenfra. Det er ikke bordet lenger: de tre sitter PÅ RAD
 * overfor deg, og en himmelretning kan ikke få et fjes. Et navn kan.
 *
 * Rekkefølgen er sete 1, 2, 3 fra venstre — samme rekkefølge som fjesene i
 * `FJES` under, og som medaljongene i stikksøyla. De tre listene MÅ følge
 * hverandre; gjør de ikke det, får Lincoln Trumps stikk.
 */
const NAVN = ["Du", "Franklin", "Lincoln", "Trump"];
/** Karikaturen som hører til hvert sete. Se `<defs>` i `index.html`. */
const FJES = ["", "fjes-franklin", "fjes-lincoln", "fjes-trump"];
/**
 * Bromodusens reserve når MesterAI-broen ikke svarer. Det er det ENESTE som er
 * igjen av PIMC i appen: styrkenivåene, `initPimcWorker`, `pimcHandling` og
 * `ponder` hørte til en motstander som er fjernet, og ingen kallsti nådde dem.
 */
const BRO_RESERVE = { verdener: 12, terskel: 6, maksEval: 240, tidsbudsjettMs: 900 } as const;

/**
 * ============ WORKEREN MÅ KVITTERE, OG HER ER HVORFOR ===================
 *
 * 10. august ble det målt at den utrullede `worker.js` var en GAMMEL PIMC-worker
 * som svarte på `adams-trekk` gjennom en ukommentert `beslutt`-gren — med
 * forespørselens id, og med et lovlig kort valgt av PIMC. Appen kunne ikke se
 * forskjell og logget `soek: { brukt: true }`. Førersetets kortvalg ble tatt av
 * den svakeste boten vi har (−72,6 ± 8,5 poeng per kamp mot MesterAI, der Adams
 * taper 5,0 ± 1,5), og loggen sa at søket ble brukt.
 *
 * RETTELSEN var en kvittering: workeren svarer `{ klar: true }` på `adams-init`,
 * og `adams-trekk` sendes ikke før den er kommet. Den står.
 *
 * Det som IKKE sto, var fristene rundt den — se `web/sokeklient.ts`: et
 * `feil`-svar som aldri ble løst, en frist på 20 s i stedet for fem, og en
 * kvitteringsfrist som slo av søket for resten av økten.
 *
 * NÅR KVITTERINGEN UTEBLIR spiller hovedtrådens søkfrie Adams — den samme
 * kjeden minus søket, bygd av `byggAdams`.
 */
const søkeklient = new Søkeklient({
  lagArbeider,
  kvitteringsfristMs: KVITTERINGSFRIST_MS,
  trekkfristMs: TREKKFRIST_MS,
  maksFristbrudd: MAKS_FRISTBRUDD,
  logg: (type, data) => logg(type, data),
});

/** Hvor workerkoden faktisk ble hentet fra. Logges ved kampstart. */
let workerKilde: string | null = null;
/** Når boten begynte å tenke. Driver sekundtelleren i «tenker …»-bobla. */
let tenkStart = 0;

/**
 * WORKEREN HENTES FRA SAMME OPPHAV FØRST, og Val Town-proxyen er reserven.
 *
 * Her ble `worker.js` ALLTID hentet fra `DATA_URL`, altså fra Val Town-valen som
 * proxyer GitHub raw PINNET til en commit. `app.js` kom fra Vercel og fulgte
 * hver push; workeren sto på pinnen. Det er samme form som N1 — ny app, gammel
 * worker — og det var nøyaktig slik PIMC havnet i førersetet 10. august.
 *
 * `dist/worker.js` ligger ved siden av `dist/app.js` og rulles ut i samme
 * push. Proxyen står igjen som reserve, slik den gjør for `app.js` i
 * `index.html`, og klienten tåler at den serverer en protokoll-1-worker.
 *
 * Val Town svarer 200 med HTML på filer den ikke har, så innholdet sjekkes:
 * starter det med «<», eller mangler det meldingsnavnet, er det ikke workeren.
 */
async function hentWorkerkode(): Promise<string> {
  for (const url of ["dist/worker.js", DATA_URL + "worker.js"]) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const kode = await r.text();
      if (kode.trimStart().startsWith("<") || !kode.includes("adams-trekk")) {
        console.warn(`«${url}» er ikke workeren (${kode.length} tegn)`);
        continue;
      }
      workerKilde = url;
      return kode;
    } catch (feil) {
      console.warn(`«${url}» kunne ikke hentes:`, feil);
    }
  }
  throw new Error("worker.js kunne ikke hentes fra noen av kildene");
}

/** `Worker` bak det lille grensesnittet klienten bruker. */
async function lagArbeider(): Promise<Arbeider> {
  const kode = await hentWorkerkode();
  const w = new Worker(URL.createObjectURL(new Blob([kode], { type: "text/javascript" })));
  return {
    postMessage: (m) => w.postMessage(m),
    terminate: () => w.terminate(),
    koble: (påMelding, påFeil) => {
      w.onmessage = (e: MessageEvent<unknown>) => påMelding(e.data);
      w.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        påFeil(e.message || "ukjent workerfeil");
      };
    },
  };
}

/**
 * ============ HVILKET LAG SOM AVGJORDE HVERT BOTTREKK ====================
 *
 * `docs/gammelkode.md` N6: hovedtråden og workeren er to optimerere over samme
 * beslutning, og regelen for hvem som vinner er en stoppeklokke. Analysen
 * grupperer på `BOT_ID`, som er ÉN rad for begge. Uten å vite hvilket lag som
 * spilte hvert kort, blandes to bots i én rad.
 *
 * Hvert bottrekk noteres her som `[sete, fase, lag, ms]` og skrives som ÉN
 * `bottrekk`-rad per runde — ikke én rad per trekk, som ville vært ~40
 * nettverkskall per runde mot en SQLite-base. Fase er B(ud), V(rak), T(rumf)
 * eller S(pill). Lag er `nett`, `bro`, `bro-reserve` eller et `Søkelag`.
 */
type Bottrekk = [sete: number, fase: string, lag: Søkelag | "nett" | "bro" | "bro-reserve", ms: number];
let bottrekk: Bottrekk[] = [];
const FASEKODE: Partial<Record<GameState["fase"], string>> = { BUDRUNDE: "B", VRAK: "V", VELG: "T", SPILL: "S" };
function notérBottrekk(sete: number, fase: GameState["fase"], lag: Bottrekk[2], ms: number): void {
  bottrekk.push([sete, FASEKODE[fase] ?? fase, lag, Math.round(ms)]);
}

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
  //
  // Adams-v5.1, 11. september: SAMME kjede og samme vekter som v5, men søket
  // har nå en frist på 4,5 s med hovedtrådens søkfrie kjede som reserve, og
  // workeren startes på nytt i stedet for å slås av for økten. På en treg
  // maskin spiller v5.1 derfor flere kort uten søk enn v5 ville ventet på —
  // en annen bot i praksis, og derfor en egen ID. Ikke «v6»: det navnet er
  // tatt av `ADAMS_V6` i `src/moe2/agentspek.ts`, som er en annen stakk.
  Vaar: "Adams-v5.1",
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
/**
 * KORTFARGEN SOM MYK FIGUR — den store, konturløse formen fra appikonet.
 *
 * Brukes bare der figuren er STOR: midt på kortflaten og i trumfvelgeren.
 * Hjørneindeksen og `fargeMerke` beholder skriftglyffen, og det er ikke en
 * forglemmelse: en uskarp gradient på tolv piksler blir grøt, og det er
 * nettopp hjørnet som bærer lesbarheten når hånden ligger i vifte. Airbrushen
 * skal koste null kontrast, og da må den holde seg der den er stor.
 */
const fargefigur = (f: Farge): string =>
  `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#kf-${f}"></use></svg>`;
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
/**
 * TENKETIDEN (11. sep) — se `web/tempo.ts`. Erstatter `sistTur`, som målte det
 * samme `ms` uten å skille ut tid med skjult fane eller vindu uten fokus.
 *
 * Startes i `fortsett()` når menneskets kontroller er tegnet, stoppes når
 * handlingen sendes. Leses BARE av `logg()`: ingen bot, verken her eller i
 * workeren, får menneskets tenketid under spillet (K2).
 */
const tenkeklokke = new Tenkeklokke(() => performance.now());
const synlighet = (): Synlighet => ({ skjult: document.visibilityState === "hidden", fokus: document.hasFocus() });
document.addEventListener("visibilitychange", () => tenkeklokke.endre(synlighet()));
addEventListener("blur", () => tenkeklokke.endre(synlighet()));
addEventListener("focus", () => tenkeklokke.endre(synlighet()));
/**
 * Menneskets beslutninger i denne runden, i den rekkefølgen de ble sendt.
 * Skrives som `tempo` i `runde`-raden. Fase-koden er den samme som i
 * `bottrekk` (B/V/T/S); `stikk` står bare ved kortspill og peker inn i
 * `historikk`.
 */
type Tempopost = { fase: string; stikk?: number } & Partial<Tenketid>;
let rundeTempo: Tempopost[] = [];

/** Stopper klokka for en menneskebeslutning og noterer den for runden. */
function tenketid(fase: string, stikk?: number): Tenketid | Record<string, never> {
  const t = tenkeklokke.stopp();
  rundeTempo.push({ fase, ...(stikk !== undefined ? { stikk } : {}), ...(t ?? {}) });
  return t ?? {};
}
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

/**
 * ============ HVA SOM SKAL ANIMERES, HUSKET MELLOM TEGNINGER ============
 *
 * `tegn()` bygger hele `#app` på nytt med `innerHTML`. Da er hvert element
 * nytt hver gang, og en CSS-`transition` har ingenting å gå ut fra — den er
 * grunnen til at ingenting overgikk og alt bare hoppet.
 *
 * Løsningen er ikke en DOM-differ. Den er å HUSKE den forrige verdien her, og
 * la tegningen sette en klasse bare på det som faktisk endret seg. Da spilles
 * animasjonen én gang, på riktig element, uten at resten blinker med.
 */
/** Poengsum per spiller ved forrige tegning — for tellerslaget. */
let sistPoeng: number[] = [];

/**
 * ============ PYNT SOM BARE SKAL ANIMERES NÅR DEN ER NY =================
 *
 * Skiltene på bordet — trumf, etterlysning, «din tur», kontraktlinja, forrige
 * stikk — har hver sin lille inngangsanimasjon. Siden `tegn()` bygger alt på
 * nytt, ville de spilt av HVER gang noe som helst endret seg: flere ganger i
 * sekundet mens botene spiller. Skiltene ville stått og blinket.
 *
 * Det er den samme fellen `forrigeBordkort` allerede løser for kortene og
 * `sistPanel` for panelene. Her er den generelle utgaven: hvert pyntestykke
 * har en NØKKEL som beskriver innholdet sitt, og animasjonsklassen settes bare
 * når nøkkelen ikke sto der ved forrige tegning. Endrer innholdet seg — ny
 * trumf, ny etterlysning — endrer nøkkelen seg, og da SKAL den animeres.
 */
let sistPynt = new Set<string>();
let nåPynt = new Set<string>();
/** Returnerer klassen « inn» hvis dette pyntestykket er nytt siden sist. */
function pynt(nøkkel: string): string {
  nåPynt.add(nøkkel);
  return sistPynt.has(nøkkel) ? "" : " inn";
}

/**
 * ============ LAGSTIKK-BAREN: HVILKEN FORM DEN HAR NÅ ===================
 *
 * ARVIND: «når det etterlyste kortet kommer frem og laget dannes så burde
 * deres stikk gå til et felles lagstikk progress bar.»
 *
 * Det er regelen i Amerikaneren gjort synlig. Fram til det etterlyste kortet
 * dukker opp teller den enkeltes stikk; fra det øyeblikket er det LAGETS
 * samlede stikk som avgjør kontrakten. Grensesnittet viste aldri skiftet, så
 * spilleren måtte holde to tall i hodet og legge dem sammen selv.
 *
 *   "ingen"        ingen kontrakt ennå (budrunde, vrak, trumfvalg)
 *   "individuell"  kontrakt satt, makkeren ikke funnet — fire tellere
 *   "smelter"      makkeren nettopp avslørt — de to glir sammen (0,9 s)
 *   "lag"          én bar mot budet, og en dempet motstandsteller
 *
 * Ved solo og ved amerikaner uten etterlysning finnes ingen makker å vente
 * på, og da står baren fra første stikk.
 */
type Lagmodus = "ingen" | "individuell" | "smelter" | "lag";
let lagmodus: Lagmodus = "ingen";
/** Hvor lenge sammenslåingen varer. Må stemme med `smelt`/`bar-fram` i CSS. */
const SMELTETID = 900;
/**
 * Sammenslåingen skal spilles ÉN gang.
 *
 * Uten dette flagget ville den startet på nytt ved hver eneste tegning i de
 * 900 millisekundene den varer — og det skjer minst én tegning i det vinduet,
 * siden neste spiller legger et kort. Resultatet ville vært en animasjon som
 * hakket i stedet for å gå.
 */
let smeltetVist = false;

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
 * FJESMEDALJONGEN — karikaturen i sin hvite ring, slik Arvind tegnet den.
 *
 * Ditt eget sete har ikke noe fjes i tegningen (du sitter jo bak skjermen),
 * så det får stjerna på korall i stedet — samme merking som din egen rute i
 * poengbrettet allerede bruker.
 *
 * `aria-hidden`: navnet står ALLTID skrevet ved siden av eller i sonens
 * `aria-label`. Medaljongen er en gjenkjennelsesflate, ikke en opplysning
 * som bare finnes som bilde.
 */
const medaljong = (sete: number, klasse = ""): string =>
  sete === MENNESKE
    ? `<span class="medaljong deg${klasse}" aria-hidden="true">${stjerne("fjes")}</span>`
    : `<span class="medaljong${klasse}" aria-hidden="true"><svg class="fjes" viewBox="0 0 100 100"><use href="#${FJES[sete]}"></use></svg></span>`;

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
    <h2>${tittel}</h2>
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
  }
  state = opprettSpill({ antallSpillere: 4 }, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  bottrekk = [];
  rundeTempo = [];
  // Ett delt eksemplar fører alle tre setene, så nullstill det bare én gang.
  for (const a of new Set(nettAgenter ?? [])) a.nyKamp();
  if (motstander === "Vaar" && råVekter !== null && SØKVERDENER > 0) {
    // WORKEREN STARTES VED KAMPSTART, ikke ved første førertrekk. Da er den
    // som regel klar før budrunden er over, og første kort venter ikke på en
    // nedlasting. `start` gjør ingenting om den alt går.
    søkeklient.start({
      type: "adams-init",
      kort: råVekter.kort,
      bud: råVekter.bud,
      vrak: råVekter.vrak,
      tro: råVekter.tro,
      // Samme BudQ-nett som hovedtråden, ellers byr søkets utspillinger som en annen bot.
      budq: råVekter.budq,
      ...ADAMS_KONFIG,
    });
    // N5: `nyKamp()` når nå workerens kjede også — og en worker som var treg
    // eller feilet i forrige kamp, startes på nytt her.
    søkeklient.nyKamp();
  }
  if (motstander === "MesterAI") {
    broKø = Promise.resolve();
    void broPost({ type: "nyKamp", mesterSeter: MESTER_SETER });
    void broPost(broRundeStart());
  }
  // `modeller` er de FAKTISK oppløste filene, ikke de vi ba om. Se `oppløst`.
  //
  // `klar` er workerens status I DET kampen starter. Første kamp i en økt står
  // den som regel på «laster»; `worker`-raden sier når den ble klar, og
  // `bottrekk` per runde sier hvilket lag som faktisk spilte hvert kort.
  logg("start", {
    frø: state.frø,
    målPoeng: state.regler.målPoeng,
    motstander,
    modeller: { ...oppløst },
    bundel: BUNDELVERSJON,
    søkverdener: SØKVERDENER,
    søksigma: SØKSIGMA,
    klar: søkeklient.status === "klar",
    worker: søkeklient.status,
    workerKilde,
  });
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
/**
 * ============ HVA SOM VAR GALT MED DEN FORRIGE UTGAVEN ==================
 *
 * Tallene stemte: kortene ble målt til å flytte seg 408 px, og de gjorde det.
 * Men de fire endte i NØYAKTIG SAMME PUNKT — sentrum av vinnerens kort — på
 * `opacity:.5` og `scale(.8)`, altså under et ugjennomsiktig kort. Det et
 * menneske så var derfor ikke en overføring, men en forsvinning. Og etterpå
 * sto bordet tomt i over ett sekund før neste stikk begynte.
 *
 * Det er samme feilklasse som har tatt dette prosjektet seksten ganger, bare i
 * visuell form: målingen svarte på «flyttet elementet seg», ikke på «ser en
 * spiller at stikket gikk til Øst».
 *
 * ============ HVA DEN GJØR NÅ ==========================================
 *
 *   0 ms     stikket er avgjort. Vinnerkortet løftes og lyser, setet gløder,
 *            de tre andre mørkner og trekker seg tilbake, skiltet spretter opp.
 *   900 ms   de tre reiser til vinneren og LANDER — i vifte rundt hans kort,
 *            med hver sin lille rotasjon og forskyvning, i FULL dekkevne. En
 *            bunke man ser ligge der, ikke fire kort som ble borte.
 *   1280 ms  bunken får et lite nedslag når den treffer.
 *   1500 ms  et stikkmerke spretter ut av bunken og flyr inn i den siden av
 *            stikksøyla som fikk stikket, og den slår til. Da har stikket en
 *            synlig konsekvens: det ble framdrift i kappløpet.
 *   2600 ms  neste stikk.
 *
 * Under `prefers-reduced-motion` gjøres ingenting av dette; da står kortene
 * stille med vinnermarkeringen, og pausen alene gjør jobben.
 */
const STIKKPAUSE = 2600;
const SAMLE_START = 900; // hvor lenge stikket står stille før det samles
const LANDING = 1280; // når bunken har landet og får nedslaget
const MERKE_FLYR = 1500; // når stikkmerket forlater bunken
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
    // 3. Så flytter vi. Kortene legger seg i VIFTE rundt vinnerens, ikke oppå
    //    det: hver taper får sin egen lille forskyvning og vinkel, og blir
    //    liggende synlig. Det er forskjellen på en bunke og en forsvinning.
    // Vifta måles i ANDELER AV KORTBREDDEN, ikke i piksler. Et fast tall som
    // sprer tydelig på en PC blir usynlig på et 44 px kort på telefon — og da
    // er man tilbake til en bunke som ser ut som ett tykt kort.
    const b = m.width;
    let nr = 0;
    for (const { el, dx, dy } of flytt) {
      const sammeSted = Math.abs(dx) < 1 && Math.abs(dy) < 1;
      if (sammeSted) continue; // vinnerens eget kort: `vinnerslag` eier det
      const vri = [-14, 11, -6][nr % 3] ?? 0;
      const skyv = ([-0.34, 0.36, 0.08][nr % 3] ?? 0) * b;
      const senk = ([0.2, -0.16, 0.3][nr % 3] ?? 0) * b;
      nr++;
      el.style.zIndex = String(nr);
      el.style.transform =
        `translate(${Math.round(dx + skyv)}px, ${Math.round(dy + senk)}px) rotate(${vri}deg) scale(.94)`;
    }
    setTimeout(() => bord.classList.add("landet"), LANDING - SAMLE_START);
    setTimeout(() => flyStikkmerke(mål, vinner), MERKE_FLYR - SAMLE_START);
  }, SAMLE_START);
}

/**
 * STIKKET BLIR TIL FRAMDRIFT. Et merke spretter ut av bunken og flyr inn i den
 * siden av stikksøyla som fikk stikket — den blå nedenfra eller den røde
 * ovenfra — og den flaten slår til når det treffer.
 *
 * Dette er koblingen Arvind ba om: «deres stikk gå til et felles lagstikk
 * progress bar». Uten flyvningen er baren bare et tall som endrer seg mens man
 * ser en annen vei; med den ser man stikket bli til framdrift.
 *
 * Elementet legges i `document.body`, ikke i `#app`. `tegn()` river `#app` med
 * `innerHTML`, og selv om det ikke skjer under frysingen er det ingen grunn
 * til å la animasjonen henge i noe som blir revet.
 */
function flyStikkmerke(fra: HTMLElement, vinner: number): void {
  // Merket skal fly til den SIDEN av løpet som fikk stikket, ikke til søyla
  // som helhet. Det er hele koblingen: man ser hvem stikket ble framdrift
  // for, og hvilken vei den siden vokser.
  const til =
    rot.querySelector<HTMLElement>(`.fyll[data-seter~="${vinner}"]`) ??
    rot.querySelector<HTMLElement>(".stikksoyle .lop");
  if (til === null) return;
  const a = fra.getBoundingClientRect();
  const b = til.getBoundingClientRect();
  const merke = document.createElement("div");
  merke.className = "flygemerke";
  merke.setAttribute("aria-hidden", "true");
  merke.textContent = "+1";
  merke.style.left = `${a.left + a.width / 2}px`;
  merke.style.top = `${a.top + a.height / 2}px`;
  document.body.appendChild(merke);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const flukt = merke.animate(
    [
      { transform: "translate(-50%, -50%) scale(.4)", opacity: 0, offset: 0 },
      { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1, offset: 0.18 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 26}px)) scale(1)`, opacity: 1, offset: 0.62 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0, offset: 1 },
    ],
    { duration: 720, easing: "cubic-bezier(.4,0,.2,1)" },
  );
  flukt.onfinish = () => {
    merke.remove();
    til.classList.add("treff");
  };
}

function håndterHendelser(hendelser: readonly Hendelse[]): void {
  for (const h of hendelser) {
    if (h.type === "BUDVINNER") {
      si(`${NAVN[h.spiller]} vant budrunden med ${budTekst(h.bud)}.`);
      logg("budvinner", { spiller: h.spiller, bud: h.bud, rundeNr: state.rundeNr });
    } else if (h.type === "TRUMF_VALGT") {
      si(`Trumf er ${FARGE_NAVN[h.trumf]}${h.etterlyst ? `, etterlyst ${kortTale(h.etterlyst)}` : ""}.`);
      // Uten etterlysning (solo, og amerikaner som ikke etterlyser) finnes
      // ingen makker å vente på, og baren står fra første stikk.
      lagmodus = h.etterlyst === null ? "lag" : "individuell";
      smeltetVist = h.etterlyst === null;
      sistBudTatt = -1;
      sistForsvarTatt = -1;
      avgjortVist = "";
    } else if (h.type === "MAKKER_AVSLØRT") {
      si(`${NAVN[h.spiller]} er makkeren!`);
      // SAMMENSLÅINGEN. Fra nå av er det lagets stikk som teller, og bandet
      // skal vise det skje — ikke bare vise et annet tall neste gang.
      lagmodus = "smelter";
      smeltetVist = false;
      setTimeout(() => {
        lagmodus = "lag";
        // Er stikket fryst, står DOM-en stille med vilje; da overtar den
        // tegningen som uansett kommer når frysingen slipper.
        if (frystStikk === null && !travelt) tegn();
      }, SMELTETID);
    } else if (h.type === "NY_RUNDE") {
      rundeTempo = [];
      lagmodus = "ingen";
      smeltetVist = false;
      sistBudTatt = -1;
      sistForsvarTatt = -1;
      avgjortVist = "";
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
        // BUDRUNDEN FOR ALLE SETER (11. sep). Uten den finnes bare menneskets egne bud
        // (`valg-bud`) og vinnerbudet: botenes bud og pass var borte, og hukommelsens
        // budavvik (K6.6) kunne ikke gjenskapes fra loggen. Offentlig informasjon.
        budrunde: { sisteBud: state.budrunde.sisteBud.slice(), passet: state.budrunde.passet.slice() },
        // MENNESKETS TENKETID (11. sep), én post per beslutning i sendt rekkefølge:
        // `{ fase, stikk?, ms, skjultMs?, ufokusMs?, angre? }`. BARE mennesket — botenes
        // regnetid står i `bottrekk` og skal aldri kunne leses som menneskelig tempo.
        tempo: rundeTempo,
      });
      // ÉN rad per runde med hvert bottrekk: sete, fase, lag og tenketid.
      // `sene` er søkesvar som kom etter fristen og ble kastet (bare når > 0).
      if (bottrekk.length > 0) {
        logg("bottrekk", {
          rundeNr: state.rundeNr,
          trekk: bottrekk,
          ...(søkeklient.sene > 0 ? { sene: søkeklient.sene } : {}),
        });
        bottrekk = [];
      }
      // Søketroens hukommelse (K6 → K8) ser runden først når den er ferdig. Går bare
      // til en klar worker som forstår meldingen (protokoll 3); ellers ingenting.
      søkeklient.rundeSlutt(state);
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
    tegn();
    // ETTER tegningen: nå står kontrollene framme. Ikke ved forrige spillers
    // handling — da ville stikkpausen og botpausen blitt menneskets tenketid.
    tenkeklokke.start(synlighet());
    return;
  }

  // Bot i tur. Nettet svarer på under ett millisekund; søket i førersetet
  // tenker i workeren, innenfor `TREKKFRIST_MS`, uten å blokkere UI-et.
  venterPåMenneske = false;
  travelt = true;
  tenkStart = performance.now();
  if (motstander === "MesterAI") {
    tegn();
    const t0 = performance.now();
    const fase = state.fase;
    const reserve = (): Handling => velgHandling(state, { ...BRO_RESERVE, frø: (Math.random() * 1e9) >>> 0 });
    void broPost({ type: "beslutt", sete: aktør })
      .then((svar) => {
        travelt = false;
        notérBottrekk(aktør, fase, svar.handling ? "bro" : "bro-reserve", performance.now() - t0);
        gjørMedPause(svar.handling ? broHandlingFra(svar.handling) : reserve(), 550);
      })
      .catch(() => {
        travelt = false;
        notérBottrekk(aktør, fase, "bro-reserve", performance.now() - t0);
        gjørMedPause(reserve(), 550);
      });
  } else if (nettAgenter !== null) {
    // SØKET GÅR TIL WORKEREN, og bare når det er noe å hente: kortvalg der
    // boten er spillefører (`børSøke`, delt med paritetsprøven).
    if (råVekter !== null && børSøke(state, aktør, SØKVERDENER)) {
      tegn();
      const t0 = performance.now();
      const spurt = state;
      const kamp = spillId;
      void søkeklient.trekk(spurt, aktør).then((svar) => {
        // SVARET GJELDER STILLINGEN DET BLE REGNET PÅ. Har spillet gått videre
        // (ny kamp), føres det ikke inn i en annen stilling.
        if (state !== spurt || spillId !== kamp) return;
        let lag = svar.lag;
        let h = svar.handling;
        if (h !== null && !erLovligKort(state, h)) {
          console.warn("Workeren svarte med et ulovlig kort – spiller hovedtrådens valg:", h);
          h = null;
          lag = "feil";
        }
        // RESERVEN er hovedtrådens kjede: den samme boten minus søket.
        const valgt = h ?? nettAgenter![aktør - 1]!.velgHandling(state);
        const ms = performance.now() - t0;
        travelt = false;
        // LOGG HVA SOM FAKTISK SPILTE. `brukt` står igjen for gamle spørringer;
        // `lag` sier om søket overstyrte, lot nettet stå, bommet på fristen
        // eller feilet. `wms` er workerens egen regnetid.
        logg("soek", {
          rundeNr: state.rundeNr,
          stikk: state.stikkSpilt,
          sete: aktør,
          brukt: h !== null,
          lag,
          ...(svar.utfall ? { utfall: svar.utfall } : {}),
          ms: Math.round(ms),
          ...(svar.wms !== undefined ? { wms: svar.wms } : {}),
          verdener: SØKVERDENER,
          sigma: SØKSIGMA,
          // Protokoll 3: søkets EGEN parrede σ for trekket og verdenene som rakk fristen.
          // `sigma` over er porten; disse to sier hvor tydelig valget var og om tiden bet.
          ...(svar.sigma !== undefined ? { sigmaMålt: svar.sigma } : {}),
          ...(svar.n !== undefined ? { verdenerBrukt: svar.n } : {}),
        });
        notérBottrekk(aktør, "SPILL", lag, ms);
        gjørMedPause(valgt, 250);
      });
      return;
    }
    // Tegner ETTER at `travelt` er satt, slik at «… tenker»-bobla rekker å
    // vises også for bud, vrak og trumfvalg. Uten dette sto skjermen helt
    // stille i de fasene — og en stille skjerm er ikke til å skille fra en
    // hengt side, selv når pausen er et halvt sekund.
    tegn();
    setTimeout(() => {
      const t0 = performance.now();
      const fase = state.fase;
      const h = nettAgenter![aktør - 1]!.velgHandling(state);
      notérBottrekk(aktør, fase, "nett", performance.now() - t0);
      travelt = false;
      gjørMedPause(h, 550);
    }, 30);
  }
}

function gjørMedPause(h: Handling, pauseMs: number): void {
  travelt = true;
  setTimeout(() => {
    travelt = false;
    gjør(h);
  }, pauseMs);
}

// --- Menneskehandlinger -----------------------------------------------------
// `ms` står der den alltid har stått; `skjultMs`, `ufokusMs` og `angre` er nye og
// står bare med når de er > 0. Se `web/tempo.ts`.
function menneskeBud(bud: Bud): void {
  logg("valg-bud", { rundeNr: state.rundeNr, bud, ...tenketid("B") });
  venterPåMenneske = false;
  gjør({ type: "BUD", spiller: MENNESKE, bud });
}

function menneskeVrak(): void {
  logg("valg-vrak", { rundeNr: state.rundeNr, antall: vrakValg.length, ...tenketid("V") });
  venterPåMenneske = false;
  const kort = vrakValg;
  vrakValg = [];
  gjør({ type: "VRAK", spiller: MENNESKE, kort });
}

function menneskeVelg(trumf: Farge, etterlyst: Kort | null): void {
  logg("valg-trumf", { rundeNr: state.rundeNr, trumf, etterlyst, ...tenketid("T") });
  venterPåMenneske = false;
  velgTrumfValg = null;
  velgEtterlysValg = null;
  gjør({ type: "VELG", spiller: MENNESKE, trumf, etterlyst });
}

function menneskeSpill(kort: Kort): void {
  logg("valg-kort", { rundeNr: state.rundeNr, stikk: state.stikkSpilt, kort, ...tenketid("S", state.stikkSpilt) });
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
  opts: { valgbar?: boolean; valgt?: boolean; liten?: boolean; ny?: boolean; stil?: string },
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
    ${opts.stil ? `style="${opts.stil}"` : ""}
    ${opts.valgbar ? "" : "disabled"}
    aria-label="${kortTale(k)}${opts.valgt ? ", valgt" : ""}" data-farge="${k.farge}" data-verdi="${k.verdi}">
    ${hjorne(false)}
    <span class="midt" aria-hidden="true">${fargefigur(k.farge)}</span>
    ${hjorne(true)}
  </button>`;
}

function sorterHånd(hånd: readonly Kort[]): Kort[] {
  const rekkefølge: Farge[] = ["S", "H", "K", "R"];
  return [...hånd].sort(
    (a, b) => rekkefølge.indexOf(a.farge) - rekkefølge.indexOf(b.farge) || b.verdi - a.verdi,
  );
}

/**
 * ============ TOPPLINJA: ETT BRETT, IKKE FEM LIKE BOKSER ================
 *
 * ARVIND: «jeg synes boksene ser veldig basic ut … det bør være et bedre
 * visuelt hierarki gjennom hele appen.»
 *
 * Her lå fire poengbokser og én kontraktboks side om side med samme ramme,
 * samme flate og samme vekt. Ingenting av det sa hva som var viktigst, og
 * øyet måtte lese alle fem for å finne den ene opplysningen det lette etter.
 *
 * Nå er poengene ETT brett med hårfine skiller — fire ruter som hører sammen,
 * fordi de ER én tabell — med din egen rute merket i korall. Raden kan ikke
 * brekke: den var `flex-wrap` en gang, og brøt om til to rader så snart
 * kontraktteksten vokste.
 *
 * STIKKTELLERNE ER FLYTTET UT. De hørte aldri hjemme ved siden av poengsummen
 * — det er to helt ulike tall med hver sin levetid, og de sto i samme rute med
 * samme vekt. Nå bor de i lagfeltet under, der de kan slås sammen når laget
 * dannes.
 *
 * KONTRAKTEN STO FOR SEG SELV her, som en egen pille ved siden av brettet.
 * Runde 7 flyttet den inn i det samme brettet som en nederste etasje — se
 * kommentaren rett under.
 */
/**
 * ============ ÉN SENTRERT ENHET ØVERST =================================
 *
 * ARVIND, runde 7: «hvor det står hvem som har budd hva og trumf er ikke
 * sentrert og kunne konsolidert seg med poengsummen.»
 *
 * Budtavla, trumfen og poengstillingen er tre visninger av det samme:
 * HVOR RUNDEN STÅR. Før lå de tre ulike steder — poengene til venstre i
 * topplinja, kontrakten i midten, rundetelleren til høyre, og budene i en
 * egen tavle midt på bordet. Fire flater med samme ærend.
 *
 * Nå er det ETT brett, sentrert: én celle per spiller med navn, poeng og —
 * mens det bys — hans bud, og under dem én linje med kontrakten, trumfen,
 * det etterlyste kortet og rundetelleren.
 *
 * ============ OG DET LØSER BLOKKERINGEN ================================
 *
 * ARVIND: «det viktigste er at byinga havner under mine kort så jeg ser ikke
 * hva andre har bydd. info om hva trumf er og hva som er etterlyst gjemmer
 * seg også under mine kort.»
 *
 * Alle fire opplysningene lå i bordflaten, altså i den samme halvdelen av
 * skjermen som hånden vokser opp i. Her kan de ikke havne under hånden i det
 * hele tatt: `header` er rad 1 i `#app`-rutenettet og hånden er rad 3, og
 * rader i et rutenett overlapper ikke. Det er en geometrisk garanti, ikke en
 * justering som må måles på nytt hver gang kortene blir større.
 */
function topplinje(): string {
  const m = state.melding;
  const b = state.budrunde;
  const bys = state.fase === "BUDRUNDE";
  const leder = bys ? b.høyeste : null;
  const kontrakt =
    state.budvinner !== null && m !== null
      ? `<span class="hvem">${NAVN[state.budvinner]}</span> <span class="bud">${m.type === "tall" ? m.bud : m.type === "solo" ? "Solo" : "Amerikaner"}</span>${state.trumf ? fargeMerke(state.trumf) : ""}`
      : bys
        ? `<span class="hvem">Budrunde</span>`
        : "";
  /**
   * ETTERLYSNINGEN STO PÅ BORDET og er flyttet HIT, inn i den samme enheten.
   *
   * ARVIND: «kortet jeg spiller ut legger seg oppå info om etterlyste kortet
   * … den infoen egentlig ikke trengs.»
   *
   * Den er derfor borte fra bordflaten. Å slette den helt ville tatt bort den
   * ene opplysningen som sier hvem man leter etter før makkeren er avslørt —
   * så den er krympet til ett merke i statuslinja i stedet, der den koster
   * ingen plass og per konstruksjon ikke kan komme under noe.
   */
  const etterlyst =
    state.etterlyst !== null && (state.fase === "SPILL" || frystStikk !== null)
      ? `<span class="etterlystmerke">${fargeMerke(state.etterlyst.farge, false)}<b>${VERDI_TEKST(state.etterlyst.verdi)}</b>${state.makkerAvslørt && state.makker !== null ? `<i>${NAVN[state.makker]}</i>` : ""}</span>`
      : "";
  // HVEM SIN TUR DET ER sto ikke noe sted. Boblen «… tenker» dekket botene,
  // men ingenting sa «det er din tur» — og i en firemannsrunde med to sekunders
  // pauser er det nettopp det man mister oversikten over.
  const iTur = frystStikk !== null ? null : (state.iTur ?? null);
  const brett = state.totalPoeng
    .map((p, i) => {
      const endret = sistPoeng.length > 0 && sistPoeng[i] !== p;
      /**
       * BUDET STÅR I SPILLERENS EGEN CELLE, ikke i en egen tavle.
       *
       * Dataene er de samme som `budtavle()` brukte (`budrunde.sisteBud`);
       * motoren er ikke rørt. Forskjellen er at «hvem» nå bare skrives ÉN
       * gang — navnet står der fra før — og at budet dermed leses i samme
       * blikk som poengene.
       */
      const bud = bys ? (b.sisteBud[i] ?? null) : null;
      const passet = bys && b.passet[i] === true;
      const erLeder = leder !== null && leder.spiller === i;
      const budrad = !bys
        ? ""
        : bud !== null
          ? `<span class="budtall">${budTekst(bud)}</span>`
          : passet
            ? `<span class="budtall pass">pass</span>`
            : `<span class="budtall intet" aria-hidden="true">·</span>`;
      const tale = !bys
        ? ""
        : ` aria-label="${NAVN[i]}: ${p} poeng, ${bud === null ? (passet ? "pass" : "ikke meldt") : budTekst(bud)}"`;
      return `<div class="spiller${i === MENNESKE ? " deg" : ""}${i === iTur ? " itur" : ""}${erLeder ? " leder" : ""}${passet ? " ute" : ""}"${tale}>
        <span class="navn">${NAVN[i]}</span>
        <span class="verdi"><b${endret ? ` class="endret"` : ""}>${p}</b></span>
        ${budrad}
      </div>`;
    })
    .join("");
  sistPoeng = state.totalPoeng.slice();
  const status = kontrakt || etterlyst
    ? `<div class="kontraktlinje${pynt(`kontrakt:${state.budvinner}:${m === null ? "" : m.bud}:${state.trumf ?? ""}`)}">
        ${kontrakt}${etterlyst}
        <span class="runde">R${state.rundeNr + 1} · ${state.regler.målPoeng}</span>
      </div>`
    : `<div class="kontraktlinje"><span class="runde">R${state.rundeNr + 1} · ${state.regler.målPoeng}</span></div>`;
  return `<header>
    <div class="statustavle" role="group" aria-label="Stillingen i runden">
      <div class="tavle">${brett}</div>
      ${status}
    </div>
  </header>`;
}

/** Setene som spiller på kontrakten, slik stillingen står nå. */
function budlaget(): number[] {
  if (state.budvinner === null) return [];
  return state.makkerAvslørt && state.makker !== null
    ? [state.budvinner, state.makker]
    : [state.budvinner];
}

/** Hvor mange stikk kontrakten krever. */
function målStikk(): number {
  const m = state.melding;
  if (m === null) return 0;
  return m.type === "tall" ? m.bud : state.giving.antallStikk;
}

/**
 * ============ STIKKSØYLA SOM KAPPLØP ====================================
 *
 * ARVIND: «progress baren skal være helt tom fra alle sider og fylles det opp
 * nedenfra når budparet får stikk og så fylles det fra toppen når forsvaret
 * får stikk. også er det en markør på hvor kontrakten ligger og begge lag
 * prøver å passere den først liksom.»
 *
 * ============ HVORFOR DETTE ER RIKTIGERE ENN FIRE SONER ================
 *
 * Forrige runde ga hver konto sin egen sone og fylte dem hver for seg. Den var
 * lesbar, og den fortalte likevel feil historie: runden så ut som fire
 * uavhengige tellere, mens den er ETT kappløp mot én strek.
 *
 * ============ GEOMETRIEN GJØR REGELEN SANN AV SEG SELV =================
 *
 * Løpet har ett hakk per stikk i runden (`antallStikk`), og markøren står
 * `mål` hakk over bunnen. Da gjelder:
 *
 *   budlaget klarer seg  ⟺  budstikk ≥ mål        ⟺  den blå NÅR streken
 *   forsvaret feller     ⟺  forsvarsstikk > n−mål ⟺  den røde KRYSSER den
 *
 * Summen av alle stikk er nøyaktig antall hakk, så de to kan aldri skje
 * samtidig og det finnes ingen tredje utgang. Formen kan derfor ikke vise et
 * utfall spillet ikke har.
 *
 * ============ FORSVARET ER ÉN FLATE ====================================
 *
 * Forsvarerne deler ikke poeng — det var hele grunnen til at de fikk hver sin
 * sone sist — men de VINNER SAMMEN: ett stikk over streken feller kontrakten
 * uansett hvem av dem som tok det. Kappløpet handler om den grensen, og da er
 * én rød flate sannere enn tre stabler. Hvem som tok hva står fortsatt i
 * poengbrettet øverst.
 *
 * FØR MAKKEREN ER AVSLØRT teller den skjulte makkerens stikk med i den røde.
 * Det er ikke en unøyaktighet, det er det spillerne faktisk vet: ingen ved
 * bordet kan skille dem ennå. I det han avsløres flytter stikkene seg over av
 * seg selv, siden begge fyllene glir mot sin nye høyde.
 */
interface LopData {
  /** Hakk i alt — ett per stikk i runden. */
  hakk: number;
  /** Hvor mange stikk kontrakten krever; markøren står her. */
  mål: number;
  lag: number[];
  forsvar: number[];
  budTatt: number;
  forsvarTatt: number;
  /**
   * Hvem som tok hvert av forsvarets stikk, i den rekkefølgen de ble tatt.
   * Ett tall per fylt hakk ovenfra og ned. Se `stikksoyle()`.
   */
  forsvarEiere: number[];
}

function lopData(): LopData {
  const lag = budlaget();
  const stikk = state.stikkVunnet;
  const forsvar = state.totalPoeng.map((_, i) => i).filter((i) => !lag.includes(i));
  const forsvarTatt = forsvar.reduce((s, i) => s + (stikk[i] ?? 0), 0);
  /**
   * ============ HVEM TOK HVILKET HAKK ==================================
   *
   * ARVIND, punkt 1: «forsvarssiden er bare rød. den skal skille de to
   * forsvarerne: én forsvarer rød, den andre hvit. tar den hvite to stikk,
   * fylles to hvite hakk.»
   *
   * Rekkefølgen leses av `state.historikk`, som er de fullførte stikkene
   * denne runden med vinner. Ingenting nytt lagres: eierskapet REGNES UT på
   * nytt ved hver tegning, mot laget slik det ser ut NÅ.
   *
   * Det er ikke en detalj. Når makkeren avsløres, flytter et stikk han tok
   * mens han var skjult seg fra forsvarets side til budlagets — og fordi
   * lista bygges mot dagens `lag`, faller hakket ut av seg selv i samme
   * tegning som fyllene glir til sin nye høyde. Et lagret eierskap måtte
   * vært ryddet manuelt, og ville før eller siden løyet.
   */
  const forsvarEiere = state.historikk
    .map((s) => s.vinner)
    .filter((v) => !lag.includes(v));
  /**
   * HISTORIKKEN KAN LIGGE ETT STIKK BAK TELLEREN i det øyeblikket et stikk
   * er ferdig men ennå ikke lagt bort. Da fylles resten med −1, som tegnes
   * som et nøytralt hakk — heller et hakk uten eier i et halvt sekund enn en
   * farge som peker på feil person.
   */
  while (forsvarEiere.length < forsvarTatt) forsvarEiere.push(-1);
  return {
    hakk: Math.max(1, state.giving.antallStikk),
    mål: Math.max(1, målStikk()),
    lag,
    forsvar,
    budTatt: lag.reduce((s, i) => s + (stikk[i] ?? 0), 0),
    forsvarTatt,
    forsvarEiere: forsvarEiere.slice(0, forsvarTatt),
  };
}

/**
 * Stikktallene ved forrige tegning.
 *
 * `tegn()` bygger alt på nytt, så uten et minne ville tellerslaget spilt av på
 * nytt hver gang noe som helst annet endret seg.
 */
let sistBudTatt = -1;
let sistForsvarTatt = -1;
/**
 * Er avgjørelsen alt spilt i denne runden? Settes til «klart» eller «falt».
 *
 * Uten flagget ville gjennombruddsanimasjonen startet på nytt ved hver eneste
 * tegning etter at streken ble passert — altså flere ganger i sekundet resten
 * av runden.
 */
let avgjortVist: "" | "klart" | "falt" = "";

function stikksoyle(): string {
  const iSpill = state.fase === "SPILL" || frystStikk !== null || state.fase === "RUNDE_SLUTT";
  if (!iSpill || lagmodus === "ingen" || state.budvinner === null) {
    sistBudTatt = -1;
    sistForsvarTatt = -1;
    return `<div class="stikksoyle tom" aria-hidden="true"></div>`;
  }
  const d = lopData();
  const pst = (n: number): string => `${((n / d.hakk) * 100).toFixed(4)}%`;
  // Sammenslåingen spilles ÉN gang — se `smeltetVist`.
  const smelterNå = lagmodus === "smelter" && !smeltetVist;
  if (smelterNå) smeltetVist = true;

  const budNavn = d.lag.map((i) => NAVN[i]).join(" og ");
  /**
   * FARGEKODEN MÅ OGSÅ FINNES FOR DEN SOM IKKE SER DEN. Hakkene sier hvem som
   * tok hva med rødt og hvitt; her står det samme i klartekst, per forsvarer.
   * Ellers ville punkt 1 gjort søylen RINGERE for en skjermleser enn den var
   * med én rød flate, siden opplysningen bare fantes som farge.
   */
  const forsvarFordelt = d.forsvar
    .map((i) => `${NAVN[i]} ${state.stikkVunnet[i] ?? 0}`)
    .join(", ");
  // Hvor mange stikk forsvaret trenger for å felle kontrakten.
  const felleKrav = d.hakk - d.mål + 1;

  /**
   * ============ ØYEBLIKKET KONTRAKTEN AVGJØRES ==========================
   *
   * ARVIND: «liten animasjon når stikket feller kontrakten.»
   *
   * FALLET SPILLES BARE NÅR DET ER SANT. Er makkeren fortsatt skjult, ligger
   * hans stikk i den røde flaten, og den kan derfor krysse streken uten at
   * kontrakten faktisk er felt. Da ville animasjonen løyet. Derfor kreves
   * `lagmodus === "lag"` — altså at makkeren er kjent, eller at det aldri blir
   * noen (solo og amerikaner uten etterlysning).
   *
   * «Klart» har ikke det problemet: budlagets tall kan bare vokse når noen
   * flyttes INN i laget, aldri ut.
   */
  const utfall: "" | "klart" | "falt" =
    d.budTatt >= d.mål ? "klart" : d.forsvarTatt >= felleKrav && lagmodus === "lag" ? "falt" : "";
  if (utfall !== "" && avgjortVist === "") {
    avgjortVist = utfall;
    // Bivirkning i en tegnefunksjon, med vilje og bare denne ene gangen:
    // beskjeden hører til øyeblikket, ikke til tilstanden, og `#oppleser`
    // ligger utenfor `#app` og overlever tegningen.
    si(utfall === "klart" ? "Kontrakten er i havn." : "Kontrakten falt.");
    // Selve sprellet settes opp av `tegn()`, når søyla står i DOM-en og kan
    // måles. Se `visGjennombrudd` for hvorfor det ikke bygges her.
    gjennombruddVenter = utfall;
  }

  /**
   * ============ FARGEKODEN FOR FORSVARERNE =============================
   *
   * Rød og hvit, som Arvind sier — og et tredje, nøytralt lyst hakk for det
   * tilfellet han ikke beskriver: FØR makkeren er avslørt teller den skjulte
   * makkerens stikk med i forsvaret, og da er det tre «forsvarere», ikke to.
   * Da må det finnes en tredje farge, ellers ville to av dem delt en.
   *
   * Rekkefølgen er stigende setenummer, altså den SAMME rekkefølgen
   * medaljongene står i over søylen. Det er hele nøkkelen: fargen på et hakk
   * kan bare leses fordi ringen rundt fjeset har den samme fargen. Uten den
   * koblingen ville rødt og hvitt vært to farger uten mening.
   */
  // Klassenavnene er ASCII med vilje: de skal kunne leses like trygt av en
  // CSS-minifiserer, et søk i loggen og et blikk i utviklerverktøyet.
  const HAKKFARGE = ["rod", "hvit", "graa"];
  const fargeAv = (sete: number): string => {
    const i = d.forsvar.indexOf(sete);
    return i < 0 ? "ukjent" : (HAKKFARGE[i] ?? "ukjent");
  };
  const fjes = (seter: number[], sisteErNy: boolean, medFarge = false): string =>
    seter
      .map((i, n) =>
        medaljong(
          i,
          (sisteErNy && n === seter.length - 1 ? " kommer" : "") +
            (medFarge ? ` ring-${fargeAv(i)}` : ""),
        ),
      )
      .join("");

  /**
   * HAKKENE. Ett element per stikk forsvaret har tatt, plassert på sin faste
   * plass i løpet ovenfra og ned. De ligger i ETT lag som klippes av
   * `clip-path` til nøyaktig samme høyde som den røde flaten under — så
   * fyllingen kommer fortsatt ovenfra og ned som ÉN felles side mot
   * markøren, og kappløpet er uendret. Det er bare fargen på hvert hakk som
   * sier hvem som tok det.
   *
   * KLIPPINGEN OG IKKE HØYDEN er det som animeres, og grunnen er den samme
   * som at hakkene har fast plass: et hakk som allerede ligger der skal ikke
   * flytte seg når det neste kommer. Med en beholder som VOKSER ville alle
   * hakkene blitt skalert på nytt ved hvert eneste stikk.
   */
  const hakkene = d.forsvarEiere
    .map((eier, k) => {
      const f = eier < 0 ? "ukjent" : fargeAv(eier);
      return `<span class="hakk h-${f}" style="--k:${k}"></span>`;
    })
    .join("");

  const budSlag = sistBudTatt >= 0 && d.budTatt !== sistBudTatt;
  const forsvarSlag = sistForsvarTatt >= 0 && d.forsvarTatt !== sistForsvarTatt;
  sistBudTatt = d.budTatt;
  sistForsvarTatt = d.forsvarTatt;

  return `<div class="stikksoyle" role="group" aria-label="Kappløpet om kontrakten">
    <div class="lop" style="--n:${d.hakk}">
      <div class="fyll forsvar" data-seter="${d.forsvar.join(" ")}"
           style="height:${pst(Math.min(d.forsvarTatt, d.hakk))}"
           role="progressbar" aria-valuemin="0" aria-valuemax="${felleKrav}" aria-valuenow="${d.forsvarTatt}"
           aria-label="Forsvaret: ${d.forsvarTatt} stikk, trenger ${felleKrav} for å felle kontrakten. ${forsvarFordelt}"></div>
      <div class="fyll bud" data-seter="${d.lag.join(" ")}"
           style="height:${pst(Math.min(d.budTatt, d.hakk))}"
           role="progressbar" aria-valuemin="0" aria-valuemax="${d.mål}" aria-valuenow="${d.budTatt}"
           aria-label="${budNavn}: ${d.budTatt} av ${d.mål} stikk"></div>
      <div class="hakkene" aria-hidden="true"
           style="--rest:${pst(Math.max(0, d.hakk - Math.min(d.forsvarTatt, d.hakk)))}">${hakkene}</div>
    </div>
    <div class="kontraktmerke" style="bottom:${pst(d.mål)}" aria-hidden="true">
      <span class="strek"></span><span class="budmerke">${d.mål}</span>
    </div>
    <div class="medaljongstabel topp" aria-hidden="true">${fjes(d.forsvar, false, true)}</div>
    <div class="medaljongstabel bunn" aria-hidden="true">${fjes(d.lag, smelterNå)}</div>
    <span class="tall topp${forsvarSlag ? " slag" : ""}" aria-hidden="true">${d.forsvarTatt}</span>
    <span class="tall bunn${budSlag ? " slag" : ""}" aria-hidden="true">${d.budTatt}</span>
  </div>`;
}

/**
 * ============ SPRELLET KAN IKKE BO I `#app` ============================
 *
 * ARVIND: «liten animasjon når stikket feller kontrakten.»
 *
 * FØRSTE FORSØK BLE ALDRI SETT, og grunnen er verdt å skrive ned fordi den er
 * usynlig i koden: elementet ble lagt inn i strengen `stikksoyle()` returnerer,
 * altså i den DOM-en `tegn()` bygger med `innerHTML`. Og `fortsett()` kaller
 * `tegn()` TO GANGER etter hverandre når det blir menneskets tur — først på
 * toppen, så igjen etter at `venterPåMenneske` er satt. Sprellet ble bygget i
 * den første tegningen og revet ut i den andre, mikrosekunder senere.
 *
 * Målt i nettleseren gjennom en hel runde: kontrakten falt, `avgjortVist` ble
 * satt, og elementet fantes aldri i noen av de 200 avlesningene. En animasjon
 * som er riktig kodet og aldri kan ses er nøyaktig den feilen forrige runde
 * ble tatt av — bare på et annet sted.
 *
 * Nå ligger sprellet i `document.body`, måles inn over søyla, og rydder opp
 * etter seg selv. Samme løsning som `flyStikkmerke` bruker, og av samme grunn.
 */
let gjennombruddVenter: "" | "klart" | "falt" = "";
const GJENNOMBRUDD_MS = 1300;

function visGjennombrudd(utfall: "klart" | "falt"): void {
  const merke = rot.querySelector<HTMLElement>(".stikksoyle .kontraktmerke");
  const søyle = rot.querySelector<HTMLElement>(".stikksoyle .lop");
  if (merke === null || søyle === null) return;
  const m = merke.getBoundingClientRect();
  const s = søyle.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = `gjennombrudd ${utfall}`;
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${s.left}px`;
  el.style.top = `${m.top}px`;
  el.style.width = `${s.width}px`;
  el.innerHTML =
    `<span class="lyn"></span><span class="bolge"></span>` +
    `<span class="rop">${utfall === "klart" ? "I havn" : "Kontrakten falt"}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), GJENNOMBRUDD_MS);
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

/**
/**
 * ============ BUDTAVLA, OG HVOR DEN BLE AV ==============================
 *
 * ARVIND, punkt 6 i runde 6: «under budrunden er det ikke tydelig hva alle har
 * budt, og teksten om hvem som har budt høyere er altfor liten. budrunden er
 * halve spillet — den fortjener sin egen lesbare visning av hvem som bød hva.»
 *
 * Alt den viser er offentlig og fantes fra før: `budrunde.sisteBud` er hver
 * spillers høyeste meldte bud, `budrunde.passet` hvem som er ute. Motoren er
 * ikke rørt — opplysningen har hele tiden ligget der uten å bli vist.
 *
 * TRE TILSTANDER, hver med sin form og ikke bare sin farge:
 *   LEDER   korallflate med hvitt tall. Det er ett bud i runden som gjelder,
 *           og det skal kunne ses på en armlengdes avstand.
 *   MELDT   lys flate med mørkt tall.
 *   PASSET  dempet, med teksten «pass». Han kan ikke komme tilbake, og da
 *           skal cellen hans slutte å konkurrere om oppmerksomheten.
 * Den som ikke har sagt noe ennå står tom, som han er.
 *
 * De tre tilstandene lever videre i `topplinje()`. Det som er borte er den
 * EGNE TAVLA de sto i, og grunnen står under.
 */
/**
 * `budtavle()` STO HER og er strøket.
 *
 * Den var riktig i runde 6 og er overflødig i runde 7: budene står nå i
 * spillernes egne celler i topplinja (`topplinje()`), altså i den ENE
 * sentrerte enheten Arvind ba om — og dermed også utenfor rekkevidde for
 * hånden, som var blokkeringen denne runden begynte med. To visninger av
 * hvem som bød hva ville vært to steder å lete.
 */
function bordet(): string {
  // Fryst stikk: alle fire kortene blir stående med vinnermarkering.
  const påBordet = frystStikk !== null ? frystStikk.kort : state.bord;
  const nå = new Set(påBordet.map((b) => `${b.spiller}${kortId(b.kort)}`));
  const erNy = (b: { spiller: number; kort: Kort }): boolean =>
    !forrigeBordkort.has(`${b.spiller}${kortId(b.kort)}`);
  const lagtAv = new Map(påBordet.map((b) => [b.spiller, b]));
  /**
   * ============ STIKKVINNEREN SKAL IKKE KUNNE OVERSES =====================
   *
   * ARVIND: «det viser aldri hvem som får stikket med en animasjon.»
   *
   * Det var ikke at animasjonen manglet — den fantes, og den var målt til å
   * flytte kortene 408 px. Feilen var HVOR de ble flyttet: alle fire endte
   * oppå hverandre under vinnerens eget kort, på `opacity:.5`. Det som
   * faktisk ble sett var derfor at kortene FORSVANT, ikke at de gikk et sted.
   * Målingen var sann og svarte likevel ikke på spørsmålet.
   *
   * Og markeringen var en liten koralltekst ved siden av navnet — som
   * vinnerkortet så vokste opp i og dekket halve, siden det skalerte 1,08 rett
   * inn i sin egen etikett.
   *
   * Nå bærer fire ting beskjeden samtidig, og ingen av dem er tekst man må
   * lete etter:
   *   – vinnerkortet løftes og får en korallglød (`vinnerslag`)
   *   – setet lyser opp bak det (`seteglans`)
   *   – de tre andre trekker seg tilbake og mørkner (`.bord.avgjort`)
   *   – et korallskilt med navnet spretter fram OVER kortet, ikke bak det
   *
   * Deretter LANDER kortene hos vinneren i full dekkevne (se
   * `samleStikketTilVinneren`), og et stikkmerke flyr derfra inn i stikksøyla.
   */
  /**
   * Kortplassen til ett sete: kortet han la, eller en antydet tom flate.
   *
   * VINNERNAVNET STÅR BARE PÅ VINNEREN. Før sto navnet over hvert eneste
   * bordkort, og med fjesene på plass ville det vært det samme ordet to
   * ganger rett over hverandre. Vinnerbåndet er noe annet — det er en
   * beskjed, ikke en etikett — og det skal fortsatt sprette fram.
   */
  /**
   * FIRE TOMME KORTFLATER MENS INGEN HAR SPILT ENNÅ.
   *
   * Plassholderen finnes for at raden ikke skal HOPPE i det et kort legges —
   * den grunnen står ved `.tomplass` i CSS. Men i budrunden, vraket og
   * trumfvalget har ingen lagt noe, og da lå det fire skrå, tomme
   * spøkelsesflater midt på bordet under budtavla. Med vidvinkelen ble de
   * enda mer påfallende: de er de eneste flatene på bordet uten innhold.
   *
   * `usynlig` er `visibility: hidden` og ikke `display: none`: boksen tar
   * fortsatt sin plass, så raden står nøyaktig like høyt før og etter — altså
   * beholdes hele grunnen til at plassholderen finnes.
   */
  const iSpillNå = state.fase === "SPILL" || frystStikk !== null;
  const kortplass = (sete: number): string => {
    const b = lagtAv.get(sete);
    if (b === undefined) {
      return `<div class="tomplass${iSpillNå ? "" : " usynlig"}" aria-hidden="true"></div>`;
    }
    const vant = frystStikk !== null && sete === frystStikk.vinner;
    return `<div class="bordkort${vant ? " vant" : ""}">
      ${vant ? `<div class="seteglans" aria-hidden="true"></div>` : ""}
      ${kortKnapp(b.kort, { liten: true, ny: erNy(b) })}
      ${vant ? `<div class="hvem"><span class="vinnerband">${stjerne()}${NAVN[sete]}</span></div>` : ""}
    </div>`;
  };
  forrigeBordkort = nå;

  // «TENKER»-BOBLA GJALDT BARE KORTSPILLET. Botene bruker like lang tid på
  // bud, vrak og trumfvalg — og der sto skjermen helt stille, som er umulig å
  // skille fra at siden har hengt seg. Nå gjelder den alle fasene.
  const tenkeSete =
    frystStikk === null && !venterPåMenneske && travelt && state.fase !== "RUNDE_SLUTT" && state.fase !== "FERDIG"
      ? (state.fase === "VRAK" || state.fase === "VELG" ? state.budvinner : state.iTur)
      : null;
  /** «tenker …» med tellende sekunder — brukes både ved fjeset og alene. */
  const tenkeboble = `tenker<span id="tenker-tid"></span><span class="prikker" aria-hidden="true"><i></i><i></i><i></i></span>`;

  /**
   * ============ DE TRE OVERFOR BORDET ==================================
   *
   * Hvert sete er én søyle: fjeset øverst, navnet under, og kortet han la
   * foran seg i perspektiv. Vridningen er FAST PER SETE og ikke tilfeldig —
   * en ny vinkel ved hver tegning ville fått kortene til å riste, siden
   * `tegn()` går flere ganger i sekundet mens botene spiller.
   *
   * Kortryggene som lå her før er borte. De sa «han har fortsatt kort», og
   * det sier tallet ved fjeset like presist uten å ta halve bordet.
   */
  /**
   * ============ KORTENE VENDER INN MOT BORDETS MIDTE ====================
   *
   * ARVIND, runde 7: «kortene vender også inn mot midten av bordet istedenfor
   * mot seg.»
   *
   * Her sto `["0", "-7", "4", "9"]` — tall valgt for at raden skulle se
   * uryddig ut på en hyggelig måte, altså tilfeldig vri. I skissen peker
   * hvert kort mot MIDTEN av bordet, slik kort gjør når fire personer kaster
   * dem inn mot samme punkt.
   *
   * Retningen følger av geometrien og ikke av smak: `rotate(θ)` dreier med
   * klokka, så et kort som ligger til VENSTRE for midten må dreies MOT klokka
   * for at underkanten skal peke inn mot sentrum, og et kort til høyre med
   * klokka. Derfor negativt for Franklin (venstre) og positivt for Trump
   * (høyre). Det er den samme veien skissen viser: der ligger venstre kort med
   * høyre ende høyest og høyre kort med venstre ende høyest.
   *
   * TALLENE ER IKKE SPEILVENDTE, av samme grunn som `NAER` under: en
   * nøyaktig symmetri leses som et diagram. Midtsetet får et par grader det
   * ikke trenger geometrisk, fordi et kort som ligger helt rett er det ene
   * som ser plassert ut.
   */
  const VRI = ["-2", "-17", "3", "16"];
  /**
   * ============ HVOR LANGT UNNA HVERT SETE SITTER =======================
   *
   * ARVIND: «pov med litt distorted vidvinkel … man ser liksom kanten av
   * bordet», og «spillerne kan sitte tettere sammen».
   *
   * `--naer` er 0 for setet rett overfor deg og 1 for det som sitter nærmest
   * din egen kant. Rundt et bord er det midtsetet som er lengst unna, og de
   * to på sidene som er nærmere — så Lincoln (sete 2) står lengst bak, mens
   * Franklin og Trump kommer fram mot deg.
   *
   * TALLENE ER IKKE SYMMETRISKE, og det er med vilje. Er de to sidesetene
   * nøyaktig like langt fram, leses raden som speilet — altså som et
   * diagram. Skissen er tegnet for hånd og sitter litt skjevt, og det er
   * nettopp den skjevheten som gjør at man tror på rommet.
   *
   * `--vend` er sideblikket: setene i kanten vender ansiktet inn mot linsa,
   * slik folk ytterst i et vidvinkelbilde gjør. Fortegnet følger siden.
   */
  const NAER = ["0", "0.72", "0", "1"];
  /**
   * VINKELEN ER KLEMT NED FRA 13/−15 TIL 8/−9, og det er en målt rettelse.
   * Ved 15 grader sto «TRUMP» så skrått at pilleformen rundt navnet leste som
   * en feil i stedet for som perspektiv — bokstavene ble ujevnt høye og
   * kanten på flaten fikk en knekk. Vidvinkelen skal være gøyal, ikke i veien
   * for det ene ordet som sier hvem det er.
   */
  const VEND = ["0", "8", "0", "-9"];
  const motstandere = [1, 2, 3]
    .map((s) => {
      const igjen = state.hender[s]?.length ?? 0;
      const tenker = s === tenkeSete;
      return `<div class="motspiller" style="--vri:${VRI[s]}deg;--naer:${NAER[s]};--vend:${VEND[s]}">
        <div class="hode">
          ${medaljong(s)}
          <div class="navn">${NAVN[s]}</div>
          ${
            tenker
              ? `<div class="tenker">${tenkeboble}</div>`
              : state.fase === "SPILL"
                ? `<div class="igjen">${igjen}</div>`
                : `<div class="igjen"></div>`
          }
        </div>
        <div class="kortplass">${kortplass(s)}</div>
      </div>`;
    })
    .join("");

  /**
   * ============ BOBLA STO TO STEDER SAMTIDIG ===========================
   *
   * ARVIND, punkt 9: «unødvendig skrift er ikke vits.»
   *
   * Her sto en «Lincoln tenker …»-boble midt på bordet UTENFOR spillfasen —
   * i tillegg til den som allerede sto ved Lincolns eget fjes, siden
   * `.motspiller` tegner sin egen boble for det samme setet. Altså to bobler
   * med samme beskjed på skjermen samtidig, den ene med navnet skrevet ut
   * fordi den ikke sto ved noen.
   *
   * Den kunne ikke være annet enn dobbel: `tenkeSete` er `iTur` i budrunden
   * og `budvinner` under vrak og trumfvalg, og i begge tilfeller er det enten
   * en av de tre motstanderne — som har sin egen søyle med sin egen boble —
   * eller deg selv, og da venter appen på DEG og ingen tenker i det hele
   * tatt. Midtbobla hadde derfor aldri et tilfelle den var alene om.
   *
   * Boblen ved fjeset er dessuten den bedre av de to: den PEKER på den det
   * gjelder, og trenger derfor ikke skrive navnet.
   */

  /**
   * ============ TRUMFEN OG ETTERLYSNINGEN ER FLYTTET UT AV BORDET =========
   *
   * ARVIND: «info om hva trumf er og hva som er etterlyst gjemmer seg også
   * under mine kort», og «kortet jeg spiller ut legger seg oppå info om
   * etterlyste kortet».
   *
   * Begge sto som skilt i `.midtfelt`, altså i bordflaten — den ene halvdelen
   * av skjermen hånden vokser opp i. Å flytte dem lenger opp i den samme
   * flaten ville bare utsatt problemet til neste gang kortene ble større.
   *
   * De står nå i statusenheten øverst (se `topplinje()`), som er en egen rad i
   * `#app`-rutenettet. Hånden er en annen rad, og rader overlapper ikke.
   */
  // «DIN TUR» sto ingen steder. Botene fikk en boble, mennesket fikk
  // ingenting — og med to sekunders pauser mellom hvert stikk er det lett å
  // sitte og vente på en skjerm som venter på deg.
  //
  // «— spill et kort» er strøket: kortene på hånden står allerede løftet og
  // lyst opp når de er spillbare, og en som har spilt Amerikaneren ved
  // kjøkkenbordet i tjue år trenger ikke få vite hva man gjør i sin tur.
  const dinTur =
    venterPåMenneske && state.fase === "SPILL" && frystStikk === null
      ? `<div class="dintur${pynt("dintur")}">Din tur</div>`
      : "";
  const midt = dinTur ? `<div class="midtfelt">${dinTur}</div>` : "";

  // Forrige stikk: alltid synlig i hjørnet mens neste stikk spilles.
  const forrige =
    frystStikk === null && state.fase === "SPILL" && state.forrigeStikk !== null
      ? `<div class="forrige${pynt(`forrige:${state.stikkSpilt}`)}" aria-label="Forrige stikk">
          <div class="tittel">Forrige · <b>${NAVN[state.forrigeStikk.vinner]}</b></div>
          <div class="rad">${state.forrigeStikk.kort
            .map((b) => `<div><div class="navn">${NAVN[b.spiller].split(" ")[0]}</div>${kortKnapp(b.kort, {})}</div>`)
            .join("")}</div>
        </div>`
      : "";
  // `avgjort` skrur på tilbaketrekkingen av de tre som tapte stikket.
  return `<div class="bord${frystStikk !== null ? " avgjort" : ""}" aria-label="Bordet">
    <div class="motstandere">${motstandere}</div>
    ${midt}
    <div class="dinplass"><div class="kortplass">${kortplass(MENNESKE)}</div></div>
    ${forrige}
  </div>`;
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
/**
 * KORTBREDDEN. Ett tall, ikke et rutenett — hjulet trenger ingen rader.
 *
 * To tak, og begge er nødvendige:
 *   HØYDEN   hånden får 34 % av skjermen. Et kort er 1/0,714 så høyt som det
 *            er bredt, så høydetaket er den bindende grensen på liggende
 *            telefon (844×390), der 30 % av bredden ville gitt et kort som
 *            dekket to tredeler av skjermen.
 *   BREDDEN  ett enkelt kort skal aldri ta mer enn 30 % av bredden. Uten det
 *            ville et smalt, høyt vindu gitt ett gigantisk kort og ingen
 *            følelse av en hånd.
 */
function kortBredde(): number {
  const b = window.innerWidth || 1024;
  const h = window.innerHeight || 768;
  /**
   * ============ KORTENE VAR FOR STORE ==================================
   *
   * ARVIND, runde 7: «kortene er så sykt store.»
   *
   * Runde 6 dro dem OPP (0,30 → 0,33 av høyden) fordi hånden så ut som det
   * minste av de tre feltene. Det var å lese skissen feil på ett punkt: der
   * er hånden bred, ikke høy — vifta spenner hele bunnen, men hvert kort er
   * lite nok til at seks av dem får plass ved siden av hverandre.
   *
   * Målt før endringen: 125 px kort på 390×844 og 160 px på iPad, altså 30 %
   * av skjermbredden per kort. Nå 0,23 av høyden og 0,25 av bredden, med tak
   * 112 px:
   *
   *     telefon 390×844     125 → 98 px   (−22 %)
   *     iPad 820×1180       160 → 112 px  (−30 %)
   *     iPad liggende       160 → 112 px  (−30 %)
   *
   * Plassen som blir til overs er nettopp den bordflaten blokkeringen
   * trengte — se `topplinje()`.
   *
   * ============ HØYDELEDDET ER 0,27 OG IKKE 0,23, OG DET ER MÅLT =======
   *
   * På de tre skjermene familien bruker mest er det BREDDEN eller taket som
   * binder, så høydeleddet endrer ingenting der. Det binder bare på LIGGENDE
   * TELEFON (844×390) — og der har mindre kort en bivirkning som drar mot
   * punkt 2 («man skal måtte bla»): jo mindre kortene er, jo flere av dem får
   * plass i vinduet, siden steget aldri får bli bredere enn kortet.
   *
   * Målt på 844×390: med 0,23 ble kortet 64 px og ELLEVE av tolv kort sto i
   * vinduet — altså praktisk talt hele hånden. Med 0,27 blir det 75 px og
   * ni av tolv. Punkt 2 er en regel om hånden, ikke om skjermen, og den skal
   * ikke falle på nettopp den formfaktoren som pleier å bli glemt.
   */
  return Math.round(Math.max(56, Math.min(112, h * 0.27 * 0.714, b * 0.25)));
}

/**
 * ============ HÅNDEN SOM HJUL ==========================================
 *
 * ARVIND: «kortene ser mer synlig, men at man kan bla i de som et hjul (eller
 * trykke på pilene) også kan man holde på et kort og kaste det ut på bordet
 * (eller trykke på det). det er viktig at gesturene er bra kodet slik at det
 * ikke blir feil når man navigerer og at det føles smooth.»
 *
 * `hjulSenter` er en FLYTTALLSINDEKS: 3,5 betyr «midt mellom fjerde og femte
 * kort». Den holdes her ute fordi `tegn()` bygger `#app` på nytt ved hver
 * tilstandsendring — lå den i DOM-en, ville hjulet hoppet tilbake til start
 * hver gang en bot la et kort.
 */
let hjulSenter = 0;
/** Antall kort ved forrige tegning — for å kjenne igjen en NY hånd. */
let sistHåndAntall = -1;
/** Hvilken beslutning hjulet sist ble stilt for — se `håndrad()`. */
let sistSpillTur = "";

/**
 * ============ VIFTA GÅR RUNDT ==========================================
 *
 * ARVIND: «hånden skal kunne blas i LOOP — fra siste kort videre til det
 * første, uten stopp.»
 *
 * Kortets plass i vifta bestemmes av `d`: avstanden i kortplasser fra
 * senteret. `wrapD` bretter den inn i [−n/2, n/2⟩, slik at kortet som går ut
 * av vinduet til høyre kommer inn igjen til venstre. Hjulet har ingen ender
 * lenger — bare én omdreining.
 *
 * BRETTEN ER USYNLIG fordi den skjer UTENFOR vinduet: `|d| = n/2` er den
 * plassen som ligger lengst fra midten, og den er klippet bort av hjulets
 * `clip-path` i enhver hånd som er stor nok til å måtte blas i. Er hånden så
 * liten at alt får plass, låses senteret som før og `wrapD` er identiteten.
 */
function wrapD(d: number, n: number): number {
  if (n <= 0) return d;
  const halv = n / 2;
  let x = d;
  while (x > halv) x -= n;
  while (x <= -halv) x += n;
  return x;
}

/** Senteret brettet inn i [0, n⟩ — ellers vokser tallet uten grense. */
function wrapSenter(v: number, n: number): number {
  if (n <= 0) return 0;
  return ((v % n) + n) % n;
}

/**
 * `d` for hvert kort ved forrige `settSenter`.
 *
 * Uten den ville et kort som nettopp brettet rundt GLIDD tvers over hele
 * vifta i stedet for å dukke opp på den andre siden — 340 ms med et kort som
 * flyr forbi alle de andre, hver gang man blar forbi skjøten.
 */
let sistD: number[] = [];

/**
 * ============ LAGREKKEFØLGEN GÅR VENSTRE MOT HØYRE =====================
 *
 * ARVIND: «de ytterste kortene i vifta er vanskelige å se på mobil.»
 *
 * Her lå halve forklaringen, og den var ikke en plassfeil. Rekkefølgen fulgte
 * AVSTANDEN FRA MIDTEN — `40 − |d| · 2` — slik at midtkortet lå øverst og
 * vifta lukket seg symmetrisk. Følgen var at hvert kort til HØYRE for midten
 * fikk sitt eget øvre venstre hjørne dekket av naboen til venstre, altså
 * nøyaktig der valøren står. Halve hånden kunne ikke leses i det hele tatt,
 * og verst der kortene overlapper mest: på telefon.
 *
 * En hånd man holder i vifte ligger ikke slik. Den ligger med hvert kort over
 * det til venstre for seg, og det er derfor kortstokker i hele verden har
 * indeksen i ØVRE VENSTRE hjørne. Rekkefølgen er nå monoton i `d`, og da
 * viser hvert eneste kort sitt eget hjørne.
 */
function zAv(d: number): number {
  return Math.max(1, Math.round(30 + d * 2));
}

function håndrad(): string {
  const lov = lovligeHandlinger(state);
  const hånd = sorterHånd(state.hender[MENNESKE] ?? []);
  const spillbare =
    venterPåMenneske && lov.fase === "SPILL"
      ? new Set(lov.kort.map((k) => `${k.farge}${k.verdi}`))
      : null;
  // «passiv» = kortene er ikke valgbare fordi et panel har ordet, ikke fordi
  // de er ulovlige. Da skal de være fullt lesbare — se `.hjul.passiv` i CSS.
  const passiv = spillbare === null;
  /**
   * NY HÅND: hjulet stilles til midten. Blir hånden bare kortere fordi et
   * kort ble spilt, skal senteret bli stående der spilleren forlot det.
   *
   * SENTERET RUNDES AV, og det er ikke kosmetikk. Med et halvtalls senter
   * («midt mellom kort 5 og 6», som `(n−1)/2` gir for et partall) står HVERT
   * kort en halv plass forskjøvet, og da treffer klippekanten midt på et
   * kort i stedet for mellom to. Målt på en 390 px skjerm: 24 px av et kort
   * sto igjen i venstre kant som en blank hvit flis. Alle andre veier inn i
   * `settSenter` runder allerede av; denne ene gjorde det ikke.
   */
  if (hånd.length > sistHåndAntall) hjulSenter = Math.round((hånd.length - 1) / 2);
  sistHåndAntall = hånd.length;
  // Brettes, ikke klemmes: senteret kan stå hvor som helst på omdreiningen.
  hjulSenter = wrapSenter(hjulSenter, hånd.length);

  /**
   * ============ DE LOVLIGE KORTENE MÅ VÆRE I VINDUET =====================
   *
   * ARVIND: «marker de lovlige kortene man har lov til å spille — i dag må
   * man gjette.»
   *
   * Merkingen i CSS er halve svaret. Den andre halvparten fant jeg først i
   * nettleseren: med tolv kort på en telefon står bare fem av dem i vinduet,
   * og hånden er sortert etter farge. Blir det spilt ut i en farge du har
   * langt ute på flanken, er HVER ENESTE synlige kort ulovlig — og da hjelper
   * ingen merking, for det er ingenting å merke.
   *
   * Derfor stilles hjulet på de lovlige kortene når turen din begynner, og
   * BARE da: er ett av dem allerede i vinduet, står vifta der du forlot den.
   * Nøkkelen er stikknummer + håndstørrelse, altså «en ny beslutning», ikke
   * «en ny tegning» — ellers ville vifta rykket tilbake hver gang en bot
   * gjorde noe som helst.
   */
  const turNøkkel = spillbare === null ? "" : `${state.stikkSpilt}:${hånd.length}`;
  if (spillbare !== null && turNøkkel !== sistSpillTur) {
    sistSpillTur = turNøkkel;
    const lovlige = hånd
      .map((k, i) => (spillbare.has(`${k.farge}${k.verdi}`) ? i : -1))
      .filter((i) => i >= 0);
    const synlig = lovlige.some(
      (i) => Math.abs(wrapD(i - hjulSenter, hånd.length)) <= hjulSpenn + 0.5,
    );
    if (lovlige.length > 0 && !synlig) {
      hjulSenter = lovlige[Math.floor((lovlige.length - 1) / 2)]!;
    }
  } else if (turNøkkel === "") {
    sistSpillTur = "";
  }

  const kb = kortBredde();
  /**
   * ============ VIFTA MÅ STÅ RIKTIG ALLEREDE I FØRSTE BILDE ==============
   *
   * Her sto bare `--kb`, og alt det andre — `--senter`, `--i`, `--steg` —
   * ble satt av `oppdaterHjul()` ETTER at DOM-en var bygget. Følgen var at
   * hvert eneste kort begynte på `--senter: 0`, altså med hele vifta skjøvet
   * seks plasser til høyre, og så gled på plass over 340 ms. Med en `tegn()`
   * flere ganger i sekundet mens botene spiller sto hånden og skled fram og
   * tilbake uten stans.
   *
   * FUNNET I NETTLESEREN, IKKE I KODEN. Gestprøven var ustabil: «trykk
   * spiller kortet» var rød når den kom rett etter en tegning og grønn når
   * det lå noen titalls millisekunder foran. Årsaken var at kortet fingeren
   * siktet på fortsatt var underveis — som er nøyaktig det Arvind advarte
   * mot, bare i den formen som rammer et trykk i stedet for et sveip.
   *
   * Nå skrives de sist MÅLTE verdiene inn i selve HTML-en. `oppdaterHjul()`
   * måler like etterpå og setter dem på nytt; er de like — og det er de i
   * alle tegninger som ikke endrer hverken skjermstørrelse eller kortantall
   * — utløses ingen overgang i det hele tatt.
   */
  /**
   * `--d` SKRIVES INN HER OGSÅ, ikke bare i `settSenter`.
   *
   * Med loopen kan ikke CSS lenger regne `--d` selv: `calc(--i − --senter)`
   * kjenner ikke omdreiningen, og kortet som er brettet rundt ville stått på
   * feil side i det første bildet og så glidd tvers over vifta. Verdien her er
   * den samme `settSenter` regner ut like etterpå, så en tegning som ikke
   * endrer hverken hånd eller skjerm utløser ingen overgang i det hele tatt.
   */
  const låstNå = hjulLåst;
  const kort = hånd
    .map((k, i) => {
      const d = låstNå ? i - hjulSenter : wrapD(i - hjulSenter, hånd.length);
      return kortKnapp(k, {
        valgbar: spillbare !== null && spillbare.has(`${k.farge}${k.verdi}`),
        valgt: vrakValg.some((v) => v.farge === k.farge && v.verdi === k.verdi),
        stil: `--i:${i};--d:${d.toFixed(3)};z-index:${zAv(d)}`,
      });
    })
    .join("");
  const pil = (retning: "venstre" | "hoyre", merke: string): string =>
    `<button class="blapil ${retning}" id="bla-${retning}" aria-label="${merke}" disabled>
      <svg class="pil" viewBox="0 0 100 100" aria-hidden="true"><use href="#pilmerke"></use></svg>
    </button>`;
  return `<div class="handrad">
    ${pil("venstre", "Bla til kortene til venstre")}
    <div class="hjul${passiv ? " passiv" : ""}" role="group" aria-label="Kortene dine"
         style="--kb:${kb}px;--senter:${hjulSenter.toFixed(3)};${hjulMål}">${kort}</div>
    ${pil("hoyre", "Bla til kortene til høyre")}
  </div>`;
}

/**
 * ============ HJULETS MÅL, MÅLT OG IKKE GJETTET ========================
 *
 * Steget mellom to kort kan ikke skrives i CSS, for det avhenger av hvor
 * bredt hjulet FAKTISK ble — og det vet ingen før søyla, pilene og
 * sikkerhetssonene har tatt sitt. Derfor måles det her, etter tegningen.
 *
 * Steget er klemt mellom to grenser med hver sin grunn:
 *   0,34 × kortbredden er der VALØREN I HJØRNET så vidt fortsatt er synlig.
 *                      Tettere, og hånden blir en stripe uten opplysninger.
 *   0,94 × kortbredden er der kortene nesten ikke overlapper. Videre enn det
 *                      ser det ikke ut som en hånd lenger.
 * Mellom dem sprer kortene seg så mye plassen tillater, slik at hele hånden
 * står synlig på iPad mens telefonen får et hjul som faktisk må blas.
 */
const HJUL_MIN_STEG = 0.34;
const HJUL_MAKS_STEG = 0.94;
/**
 * ============ HÅNDEN SKAL ALDRI VISES HEL ==============================
 *
 * ARVIND, punkt 2: «man skal ikke se hele hånden på én gang — man skal måtte
 * bla», og punkt 7: «når man trekker inn potten ser man hele hånden sin. det
 * bryter med punkt 2 og skal være likt overalt.»
 *
 * DE TO ER SAMME FEIL. Steget ble regnet ut som «så tett at ALLE n kortene
 * får plass», med `HJUL_MIN_STEG` som eneste gulv. På en iPad med tolv kort
 * ga det 76 px steg — alt fikk plass, `hjulLåst` ble sann, pilene skrudde seg
 * av, og hånden lå der som en åpen vifte. På telefon var den samme regelen
 * bindende bare fordi skjermen var for smal, altså av en tilfeldighet.
 *
 * Derfor er ANTALL SYNLIGE KORT nå det som styrer, ikke antall kort i hånden.
 * Steget får et gulv som holder vinduet på `MAKS_SYNLIG` kort uansett skjerm,
 * uansett håndstørrelse og uansett fase. Da er den lik overalt per
 * konstruksjon, ikke fordi hver enkelt situasjon er rettet for seg.
 *
 * 5,4 er lest av skissen: seks kort spenner bredden der, det ytterste bare
 * halvveis inne. Et halvt kort i hver kant er dessuten det som SIER at det er
 * mer å bla til — en vifte som slutter pent i begge ender ser ferdig ut.
 */
/**
 * RUNDE 7: 5,4 → 6,6, og det er toningen som betaler for det.
 *
 * Tallet er «hvor mange kortPLASSER vinduet er bredt», ikke «hvor mange kort
 * man ser». Med den nye toningen i kanten er de ytterste plassene halvt eller
 * helt utonet, så 6,6 plasser gir omtrent seks LESBARE kort — nøyaktig det
 * skissen viser. Sto den igjen på 5,4, ville toningen spist to av fem kort og
 * hånden blitt smalere enn før i stedet for luftigere.
 *
 * Punkt 2 og 7 står uendret: seks av tolv er fortsatt en hånd man må bla i,
 * og gulvet er fortsatt det samme i budrunde, spill og innsamling.
 */
const MAKS_SYNLIG = 6.6;
/**
 * ============ VIFTA BØYER SEG MYE MER =================================
 *
 * ARVIND, runde 7: «hvis man ser på mockup så ser man at kortene er større på
 * midten og blir mindre på sidene. de bøyer seg også mye mer etter hjulet.»
 *
 * Tre tall styrer den formen, og de hører sammen:
 *
 *   YTTERVINKEL  hvor skrått ytterkortet står. 11° → 20°.
 *   BUEANDEL     hvor langt ned ytterkortet faller, som andel av korthøyden.
 *                0,07 → 0,34 — altså en tredel av et kort, som i skissen.
 *   TAPER        hvor mye mindre ytterkortet er enn midtkortet. Ny.
 *
 * De er ikke uavhengige: `fotavtrykk` i `oppdaterHjul()` regner ut hvor bredt
 * et kort på skrå faktisk blir, og `overheng` hvor mye høyere. Begge leser
 * den SAMME vinkelen som kortene får (`ytter`, altså YTTERVINKEL flatet ut
 * for lave skjermer), så en kraftigere bue betaler for seg selv i plass i
 * stedet for å bli klippet — som er nøyaktig feilen runde 6 rettet én gang og
 * som ville kommet tilbake hvis vinkelen ble skrudd opp alene.
 */
const YTTERVINKEL = 20;
/** Hvor langt ytterkortet faller under midtkortet, i andel av korthøyden. */
const BUEANDEL = 0.34;
/**
 * ============ BUEN FLATER UT FØR KANTEN ================================
 *
 * Bøyen er `d²`, og et kvadrat faller 1 : 4 : 9 for steg 1, 2 og 3. Målt på
 * skissen faller den 1 : 2,3 — altså mye slakere ute på flankene. Skissens
 * vifte er en SMILEBUE, ikke en parabel: den krummer i midten og retter seg
 * ut mot endene, slik en vifte man holder i hånden gjør når kortene begynner
 * å ligge parallelt.
 *
 * `d²` er fortsatt formen (`abs()` finnes ikke på eldre iPad-Safari, og et
 * kvadrat er den eneste billige, jevne kurven som er symmetrisk). Knekken
 * kommer av at UTSLAGET når taket sitt allerede ved 0,72 av spennet i stedet
 * for helt ute ved kanten: koeffisienten regnes ut for det punktet, og
 * `min()` i CSS holder resten flat. Målt etterpå faller vifta 1 : 2,8.
 */
const BUEKNEKK = 0.72;
/**
 * PERSPEKTIVSKALERINGEN. Ytterkortet er 18 % mindre enn midtkortet.
 *
 * 0,30 først, og det var for mye: målt på det rendrede bildet ble ytterkortet
 * 0,77 av midtkortet, mens skissen ligger på 0,88 over tre steg. Vifta så da
 * ut som en trapp av ulike kortstokker i stedet for som én hånd i perspektiv.
 * Den samlede krympingen er litt større enn 0,18, siden `translate`-ens
 * dybde skalerer i tillegg — målt 0,84 ved kanten av vinduet.
 *
 * Dette er en ANDRE skalering, uavhengig av `translate`-ens dybde (`--zdyp`).
 * Dybden gir kortet en plass i rommet; denne gir vifta formen skissen har,
 * der midtkortet er det største og de andre trapper ned symmetrisk. Uten den
 * er en vifte bare en rad med skrå kort.
 *
 * Ligger på CSS-egenskapen `scale` og ikke i `transform` — av nøyaktig samme
 * grunn som `translate` og `rotate` gjør det: `transform` er allerede eid av
 * løftet, hoveren og kastet, og to skrivere på samme egenskap betyr at den
 * ene alltid taper.
 */
const TAPER = 0.18;
/**
 * TONINGEN I KANTEN.
 *
 * ARVIND: «kortene har en stygg avkutting rett før pilene.»
 *
 * `clip-path` klipper vifta mot hjulets kanter, og et kort som blir kappet
 * med en loddrett strek midt i flaten ser uferdig ut — i et design der
 * ingenting annet har en hard kant. Nå tones kortet ut FØR det når klippet:
 * full dekkevne inn til 0,85 av spennet, null nøyaktig ved kanten. Klippet
 * gjør fortsatt jobben sin; det er bare ingenting igjen å klippe.
 *
 * Tallet er `A` i `opacity = A − ton·d²`, med `ton = A / spenn²` slik at
 * nullpunktet ligger på kanten uansett hvor mange kort hånden har.
 *
 * 3,6 og ikke 1,9, og forskjellen er målt: `A` bestemmer HVOR toningen
 * begynner (ved `spenn·√(1−1/A)`), ikke hvor den slutter — nullpunktet ligger
 * på kanten uansett. Med 1,9 begynte den på 0,69 av spennet, og på en 390 px
 * telefon spiste den to av fem kort: tre lesbare kort igjen der forrige runde
 * hadde fem. Med 3,6 begynner den på 0,85, altså først når kortet er på vei
 * ut av bildet. Målt etterpå: fem kort i full dekkevne, og et kort er helt
 * utonet 21 px FØR det når klippekanten — så avkuttingen kan ikke ses.
 */
const TONEHOYDE = 3.6;
/** Sant når alle kortene får plass; da er pilene av og senteret låst. */
let hjulLåst = true;
/** Piksler per indekssteg, målt sist. Gestene regner om fra denne. */
let hjulSteg = 60;
/** Største avstand fra senter som får plass innenfor hjulet. */
let hjulSpenn = 0;
/**
 * De sist MÅLTE viftemålene, som en ferdig stilstreng.
 *
 * Grunnen til at den finnes står i `håndrad()`: uten den begynner hver
 * tegning med udefinerte mål, og vifta glir på plass i stedet for å stå der.
 */
let hjulMål = "";

function oppdaterHjul(): void {
  const hjul = rot.querySelector<HTMLElement>(".hjul");
  if (hjul === null) return;
  const kort = [...hjul.querySelectorAll<HTMLElement>(".kort")];
  const n = kort.length;
  if (n === 0) return;
  /**
   * ============ `offsetWidth`, IKKE `getBoundingClientRect()` ==========
   *
   * Her sto `getBoundingClientRect().width`, og det var riktig helt til
   * runde 7 ga kortene en perspektivskalering. Da ble det en LØKKE: den
   * målte bredden er den TRANSFORMERTE bredden, altså kortbredden ganget med
   * `--krymp` — som er utregnet av forrige runde gjennom denne funksjonen.
   *
   * Målt i nettleseren: `kort[0]` er ytterkortet i vifta (senteret ligger
   * midt i hånden, så DOM-ens første kort er det som er brettet lengst bort),
   * altså nøyaktig det kortet skaleringen krymper mest. 98 px ble målt til
   * 66, steget ble regnet ut av 66, og toningen fikk et spenn på 1,94 i
   * stedet for 2,8 — tre synlige kort i stedet for sju. Formen så feil ut på
   * en måte ingen enkelt verdi i koden var feil.
   *
   * `offsetWidth` er LAYOUTBREDDEN og ser ikke transformer i det hele tatt.
   * Den kan derfor ikke mate sitt eget resultat tilbake. Rundet til heltall,
   * som er nøyaktig nok her: `--kb` settes i hele piksler fra `kortBredde()`.
   */
  const kb = kort[0]!.offsetWidth || kortBredde();
  const bredde = hjul.clientWidth || window.innerWidth;
  /**
   * DET YTTERSTE KORTET STÅR PÅ SKRÅ, og et skrått kort er BREDERE enn et
   * rett. Her sto `kb` alene, og resultatet var målbart galt: tolv kort ble
   * regnet til å få plass på en iPad, hjulet låste seg, pilene skrudde seg
   * av — og så ble ytterkortet likevel klippet på langs av `overflow:hidden`,
   * fordi 14 graders vipping legger på 62 px i bredden for et kort som er
   * 255 px høyt.
   *
   * Fotavtrykket er derfor det ROTERTE kortets bredde: b·cos v + h·sin v,
   * med v = `YTTERVINKEL`, den største vinkelen `oppdaterHjul` deler ut.
   */
  /**
   * ============ LIGGENDE TELEFON FLATER UT VIFTA ========================
   *
   * ARVIND, runde 7: liggende telefon er «skikkelig dårlig».
   *
   * Buen og vinkelen koster HØYDE — bøyen legger `BUEANDEL` av en korthøyde
   * til under vifta, og et skrått kort er høyere enn et rett. På 390×844 er
   * det billig; på 844×390 er høyden den knappe ressursen, og den samme buen
   * spiste 33 % av skjermen for en hånd som skulle vært lesbar.
   *
   * `flathet` går fra 1 på en høy skjerm til 0,45 på den laveste. Den ganges
   * inn i BÅDE buen og vinkelen, slik at formen blir flatere og bredere i
   * stedet for mindre — vifta bruker den bredden liggende har i overflod.
   *
   *     390×844   flathet 1,00   bue 45 px, ytterkort 20°
   *     844×390   flathet 0,56   bue 20 px, ytterkort 16°
   *
   * Vinkelen faller mindre enn buen (0,55 + 0,45·flathet mot flathet selv):
   * skråstillingen er det som gjør en vifte til en vifte, mens fallet er det
   * som koster plass. Blir vinkelen null, er hånden en rad kort igjen.
   */
  const flathet = Math.min(1, Math.max(0.45, (window.innerHeight || 768) / 700));
  const ytter = YTTERVINKEL * (0.55 + 0.45 * flathet);
  const ytterRad = (ytter * Math.PI) / 180;
  const fotavtrykk = kb * Math.cos(ytterRad) + (kb / 0.714) * Math.sin(ytterRad);
  const ønsket = n > 1 ? (bredde - fotavtrykk) / (n - 1) : kb;
  /**
   * GULVET SOM HOLDER VINDUET PÅ `MAKS_SYNLIG` KORT. Se konstanten for
   * hvorfor den finnes. Steget kan aldri bli SÅ tett at flere enn så mange
   * kort står i vinduet samtidig — heller ikke når skjermen har plass.
   */
  const gulv = Math.max(kb * HJUL_MIN_STEG, (bredde - fotavtrykk) / (MAKS_SYNLIG - 1));
  /**
   * TAKET VINNER OVER GULVET, og rekkefølgen er ikke likegyldig.
   *
   * På en iPad blir gulvet 190 px mens kortet er 160 px bredt. Et steg som
   * er STØRRE enn kortbredden gir LUFT mellom kortene — altså en rad med
   * mellomrom, ikke en hånd. Målt på 1180×820 før taket kom på: seks kort
   * med 30 px glipe mellom hvert.
   *
   * `HJUL_MAKS_STEG` (0,94) er nettopp grensen der kortene så vidt fortsatt
   * overlapper. Den er derfor det ytterste ordet: `MAKS_SYNLIG` er et mål,
   * mens «det skal se ut som en hånd» er et krav. På iPad gir det 6,6 kort i
   * vinduet i stedet for 5,4 — fortsatt godt under tolv, så det må fortsatt
   * blas, som er hele poenget med punkt 2.
   */
  hjulSteg = Math.min(kb * HJUL_MAKS_STEG, Math.max(gulv, ønsket));
  hjulSpenn = Math.max(0, (bredde - fotavtrykk) / (2 * hjulSteg));
  /**
   * LÅSEN GJELDER BARE EN HÅND SOM ER MINDRE ENN VINDUET. Er den større, skal
   * det blas — også på iPad, også midt i en innsamling. Uten `Math.min` her
   * ville et bredt vindu låst hånden igjen, og punkt 2 og 7 vært tilbake på
   * nøyaktig de skjermene de ble meldt fra.
   */
  hjulLåst = n <= MAKS_SYNLIG && (n - 1) / 2 <= hjulSpenn + 0.001;
  /**
   * BØYEN REGNES BAKLENGS FRA HVOR MYE PLASS DEN FÅR LOV Å TA.
   *
   * Her sto `--boy` som en andel av steget. Det var galt på nøyaktig én måte,
   * og den kostet: bøyen vokser med KVADRATET av avstanden fra midten, så
   * ytterkortene falt 60 px under beholderen og ble klippet på tvers. Vifta
   * så ut som en rad kort med bunnen skåret av.
   *
   * Nå bestemmes UTSLAGET først — høyst 9 % av kortets høyde, og aldri mer
   * enn 26 px — og koeffisienten følger av det. Da kan ytterkortet per
   * definisjon ikke falle utenfor, uansett hvor mange kort hånden har.
   */
  const kortHøyde = kb / 0.714;
  const maksD = Math.max(0.5, hjulLåst ? (n - 1) / 2 : hjulSpenn);
  const bue = Math.min(58, kortHøyde * BUEANDEL * flathet);
  // Vinkelen på samme vis: ytterkortet skal stå rundt `ytter` på skrå,
  // uansett om hånden har fire kort eller tretten. Taket per steg er hevet
  // fra 3,2° til 10° sammen med vinkelen selv — sto det igjen på 3,2, ville
  // en hånd med få kort aldri nådd den buen skissen har.
  const vinkel = Math.min(10, ytter / maksD);
  /**
   * ET SKRÅTT KORT ER OGSÅ HØYERE, og det ble glemt én gang til — i høyden
   * denne gangen. Målt i nettleseren: ytterkortet lå 16 px under beholderen
   * på iPad selv etter at bøyen fikk sin plass, fordi hjørnene på et 14 graders
   * kort stikker ut både over og under.
   *
   * Utslaget er halve forskjellen mellom det roterte og det rette kortets
   * høyde, og det legges til luften i bunnen sammen med bøyen.
   */
  const rad = ((vinkel * maksD) * Math.PI) / 180;
  const overheng = Math.max(0, (kortHøyde * Math.cos(rad) + kb * Math.sin(rad) - kortHøyde) / 2);
  /**
   * SKALERINGEN OG TONINGEN REGNES BAKLENGS FRA SPENNET, som bue og vinkel.
   *
   * Da holder formen seg lik enten hånden har tolv kort eller tre: det er
   * ALLTID ytterkortet i vinduet som er `TAPER` mindre og som treffer null i
   * dekkevne, ikke «kort nummer fem» eller en piksel-avstand som tilfeldigvis
   * stemte på den ene skjermen den ble prøvd på.
   *
   * LÅST HÅND TONER IKKE. Får alle kortene plass, er det ingen kant å tone
   * mot — og en vifte der ytterkortet er halvveis borte uten at det finnes
   * mer å bla til er bare et kort som mangler.
   */
  const skalning = TAPER / (maksD * maksD);
  const toning = hjulLåst ? 0 : TONEHOYDE / (maksD * maksD);
  // Skrives som ÉN streng, slik at neste tegning kan legge nøyaktig de samme
  // verdiene rett i HTML-en og dermed ikke utløse noen overgang.
  // Koeffisienten er regnet for KNEKKPUNKTET, ikke for kanten — se `BUEKNEKK`.
  const knekkD = Math.max(0.5, maksD * BUEKNEKK);
  hjulMål =
    `--steg:${hjulSteg.toFixed(2)}px;--boy:${(bue / (knekkD * knekkD)).toFixed(4)}px;` +
    `--boymaks:${bue.toFixed(1)}px;--vinkel:${vinkel.toFixed(2)}deg;` +
    `--krymp:${skalning.toFixed(5)};--krympmaks:${TAPER.toFixed(3)};` +
    `--ton:${toning.toFixed(5)};` +
    `--bue:${(bue + overheng).toFixed(1)}px`;
  for (const [navn, verdi] of hjulMål.split(";").map((d) => d.split(":") as [string, string])) {
    hjul.style.setProperty(navn, verdi);
  }
  /**
   * ============ HVOR HØY HÅNDEN FAKTISK BLE ==============================
   *
   * ARVIND, punkt 8: «popup-boblene dekker andre spillere og kort. "ditt bud"
   * dekker Lincoln. ingen boble skal legge seg over en motstander eller over
   * kortene.»
   *
   * Budpanelet lå festet til TOPPEN av skjermen, altså nøyaktig der de tre
   * motstanderne sitter. Det skal i stedet stå i den tomme bordflaten mellom
   * kortene på bordet og din egen hånd — og da må noe VITE hvor hånden
   * slutter. Høyden kan ikke skrives i CSS: den avhenger av kortbredden,
   * bøyens utslag og overhenget, som alle regnes ut her.
   *
   * Skrives på `documentElement` og ikke på `#app`, fordi overleggene ligger
   * `position: fixed` utenfor rutenettet.
   */
  const håndrada = rot.querySelector<HTMLElement>(".handrad");
  if (håndrada !== null) {
    document.documentElement.style.setProperty(
      "--handhoyde",
      `${Math.round(håndrada.getBoundingClientRect().height)}px`,
    );
  }
  settSenter(hjulSenter);
}

/** Skriver senteret til DOM-en: viftens plass, lagrekkefølgen og pilene. */
function settSenter(v: number): void {
  const hjul = rot.querySelector<HTMLElement>(".hjul");
  if (hjul === null) return;
  const kort = [...hjul.querySelectorAll<HTMLElement>(".kort")];
  const n = kort.length;
  if (n === 0) return;
  // Ny håndstørrelse: minnet om forrige `d` gjelder andre kort enn disse.
  if (sistD.length !== n) sistD = [];
  // LÅST hånd: alt får plass, og da står vifta midtstilt uansett hva som
  // sendes inn. ULÅST: senteret brettes rundt i stedet for å stoppe ved
  // endene — det er loopen.
  hjulSenter = hjulLåst ? (n - 1) / 2 : wrapSenter(v, n);
  hjul.style.setProperty("--senter", hjulSenter.toFixed(3));
  const nyD: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = hjulLåst ? i - hjulSenter : wrapD(i - hjulSenter, n);
    nyD.push(d);
    const el = kort[i]!;
    const før = sistD[i];
    // BRETTET RUNDT? Da skal kortet dukke opp på den andre siden, ikke fly
    // dit. Overgangen slås av mens sprangets verdi settes, og på igjen
    // etterpå — en tvunget omregning imellom er det som skiller «satt» fra
    // «animert».
    if (før !== undefined && Math.abs(d - før) > n / 2) {
      el.style.transition = "none";
      el.style.setProperty("--d", d.toFixed(3));
      void el.offsetWidth;
      el.style.transition = "";
    } else {
      el.style.setProperty("--d", d.toFixed(3));
    }
    el.style.zIndex = String(zAv(d));
  }
  sistD = nyD;
  // MED LOOP HAR HJULET INGEN ENDER, så pilene kan aldri gå tomme. De er bare
  // av når hele hånden får plass og det ikke finnes noe å bla til.
  const v1 = document.getElementById("bla-venstre") as HTMLButtonElement | null;
  const h1 = document.getElementById("bla-hoyre") as HTMLButtonElement | null;
  if (v1) v1.disabled = hjulLåst;
  if (h1) h1.disabled = hjulLåst;
}

/**
 * ============ GESTENE ==================================================
 *
 * ARVIND: «det er viktig at gesturene er bra kodet slik at det ikke blir feil
 * når man navigerer og at det føles smooth.»
 *
 * Feilen han beskriver har ett navn: et SVEIP som blir tolket som et KAST.
 * Den oppstår når man bestemmer hva gesten er ved første piksel, eller når
 * touch- og musehåndterere ligger side om side og begge svarer. Her er
 * reglene som holder den ute:
 *
 * 1. ÉN HENDELSESFAMILIE. Pointer Events, ikke `touchstart` + `mousedown`.
 *    To familier betyr to sannheter om samme finger, og på en iPad sender
 *    nettleseren begge.
 *
 * 2. `touch-action: none` PÅ HJULET OG PÅ KORTENE. Uten det panorerer
 *    nettleseren siden, tar pekeren fra oss midt i bevegelsen og sender
 *    `pointercancel` — som ser ut som at fingeren ble løftet.
 *
 * 3. INGEN AVGJØRELSE FØR TERSKELEN. Under 11 px er gesten UBESTEMT, og
 *    ingenting skjer. Det er dette som gjør at en tommel som skjelver ved
 *    trykket ikke blar hånden.
 *
 * 4. RETNING MED MARGIN. Over terskelen kreves det at den ene aksen er
 *    minst 1,25 ganger den andre. En diagonal bevegelse er verken blaing
 *    eller kast før den bestemmer seg — og hvis den aldri gjør det, tvinges
 *    valget først ved tre terskler, der tvilen ikke lenger er ekte.
 *
 * 5. `setPointerCapture` PÅ HJULET, ikke på kortet. Fingeren skal kunne
 *    forlate kortet — den skal jo dra det bort fra der det lå — og en
 *    fangst på et element som blir fjernet er en fangst som forsvinner.
 *
 * 6. TRYKK SENDES IKKE HERFRA. Et trykk (under terskelen hele veien) gjør
 *    INGENTING i `pointerup`; da får nettleseren sende sin egen `click`, og
 *    den ene kodeveien betjener både finger, mus og tastatur. Var det derimot
 *    en ekte gest, undertrykkes den etterfølgende `click` — ellers ville et
 *    kast spilt kortet én gang og klikket det én gang til.
 *
 * 7. AVBRUDD HÅNDTERES. `pointercancel` og `lostpointercapture` fører kortet
 *    tilbake nøyaktig som en for kort dragning gjør.
 */
interface Gest {
  id: number;
  kort: HTMLElement | null;
  spillbart: boolean;
  x0: number;
  y0: number;
  senter0: number;
  modus: null | "bla" | "kast";
  sisteX: number;
  sisteT: number;
  fart: number;
}
let gest: Gest | null = null;
/**
 * ============ KLIKKSPERREN MÅ KUNNE UTLØPE =============================
 *
 * Her sto et rent `boolean`, satt ved slutten av hver ekte gest og slettet
 * av den `click`-en som fulgte. Feilen er at det IKKE ALLTID KOMMER EN KLIKK:
 * etter et sveip sender nettleseren ingen, og etter et kast tegnes DOM-en om
 * før klikket rekker fram. Flagget ble stående sant, og da svelget appen det
 * NESTE trykket — altså det første trykket etter hvert eneste sveip.
 *
 * Prøvd i nettleseren med simulerte pekerhendelser, og det var nøyaktig det
 * som skjedde: «trykk spiller kortet» var rød rett etter en sveipeprøve og
 * grønn alene. Det er den verste sorten feil i et grensesnitt — den viser seg
 * bare når man gjør to ting etter hverandre, altså bare når noen spiller.
 *
 * Nå er sperren et TIDSPUNKT. Den gjelder bare klikk som kommer rett etter
 * gesten (nettleseren sender dem innen få millisekunder), og den fjernes
 * dessuten når en ny peker settes ned. Uteblir klikket, utløper sperren av
 * seg selv, og tastaturet blir aldri stående låst.
 */
let gestSluttet = 0;
const KLIKKSPERRE_MS = 400;
const GEST_TERSKEL = 11; // px før noe i det hele tatt regnes som en gest
const GEST_MARGIN = 1.25; // hvor mye den ene aksen må slå den andre

function kastegrense(): number {
  // Kortet må dras opp forbi rundt en tredel av sin egen høyde. Målt i
  // kortets mål og ikke i piksler: 70 px er et lite napp på en PC og en
  // umulig strekning på en liggende telefon.
  return Math.max(46, (kortBredde() / 0.714) * 0.34);
}

/**
 * ============ ETTERGLIDET ==============================================
 *
 * ARVIND, punkt 5: kortene skal oppleves som 3D-objekter, «med momentum når
 * man blar. i dag stopper vifta brått.»
 *
 * Her sto ett hopp: `settSenter(Math.round(hjulSenter + kast))` med en
 * CSS-overgang på 340 ms. Det er ikke momentum — det er en teleportering med
 * en glidende etterslep, og forskjellen KJENNES: farten forsvinner i det
 * fingeren slipper, og så flytter vifta seg et fast antall plasser uansett
 * hvor hardt man dro.
 *
 * Nå integreres bevegelsen bilde for bilde med eksponentiell friksjon, slik
 * en vekt på et lager oppfører seg. Farten fingeren faktisk hadde er
 * startverdien, så et lite dytt gir en plass og et hardt kast gir fem.
 *
 * ============ HVORFOR DETTE IKKE KAN BLI ET KAST =======================
 *
 * Momentum er lett å forveksle med et kast, og det er nettopp den feilen
 * gestreglene er bygget for å holde ute. Den blir det ikke her, av én grunn
 * som er verdt å skrive ned: ETTERGLIDET LEVER ETTER `pointerup`.
 *
 * Valget mellom «bla» og «kast» tas i `pointermove`, på retning og margin, og
 * er allerede tatt før fingeren slipper. Etterglidet leser bare `g.fart` fra
 * en gest som ALLEREDE er avgjort til å være blaing (`g.modus === "bla"`), og
 * det rører hverken `gest`, kortvalget eller klikksperren. Et raskt sveip kan
 * derfor ikke bli et kort som spilles — det kan bare bli en vifte som
 * fortsetter å rulle.
 *
 * TAKET ER MÅLT, IKKE GJETTET. Med friksjon 0,008 per ms er strekningen
 * `fart / friksjon`, så et tak på fem plasser er en startfart på 0,04
 * indekssteg per ms. Uten det taket sender et hardt sveip på en telefon vifta
 * ni plasser — altså nesten en hel omdreining — og da har man mistet
 * oversikten over hvor i hånden man er.
 */
const GLID_FRIKSJON = 0.008; // per ms
const GLID_MAKS_FART = 0.04; // indekssteg per ms ⇒ høyst fem plasser
const GLID_STOPP = 0.0004;   // under dette er bevegelsen ikke synlig lenger
let glidId = 0;

function stoppGlid(): void {
  if (glidId === 0) return;
  cancelAnimationFrame(glidId);
  glidId = 0;
  rot.querySelector<HTMLElement>(".hjul")?.classList.remove("drar");
}

/** Sant når brukeren har bedt om mindre bevegelse. */
function redusertBevegelse(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function startGlid(fart0: number): void {
  stoppGlid();
  const hjul = rot.querySelector<HTMLElement>(".hjul");
  // REDUSERT BEVEGELSE: ingen etterglid i det hele tatt. Vifta går til
  // nærmeste kort og blir stående — det er den samme handlingen, uten svevet.
  if (hjul === null || redusertBevegelse()) { settSenter(Math.round(hjulSenter)); return; }
  let fart = Math.max(-GLID_MAKS_FART, Math.min(GLID_MAKS_FART, fart0));
  if (Math.abs(fart) < GLID_STOPP) { settSenter(Math.round(hjulSenter)); return; }
  // Overgangene AV mens vi selv driver bevegelsen: en CSS-transition oppå en
  // rAF-løkke gir dobbelt etterslep, altså sirup.
  hjul.classList.add("drar");
  let sist = performance.now();
  const steg = (nå: number): void => {
    // Et bilde som kommer sent (fanen var i bakgrunnen) skal ikke flytte
    // vifta et halvt kvartal. 48 ms er tre bilder på 60 Hz.
    const dt = Math.min(48, Math.max(1, nå - sist));
    sist = nå;
    settSenter(hjulSenter + fart * dt);
    fart *= Math.exp(-GLID_FRIKSJON * dt);
    if (Math.abs(fart) > GLID_STOPP) {
      glidId = requestAnimationFrame(steg);
      return;
    }
    // LANDINGEN. Overgangen slås på igjen FØR siste `settSenter`, slik at de
    // siste pikselene inn til nærmeste kort glir i stedet for å hoppe.
    glidId = 0;
    hjul.classList.remove("drar");
    settSenter(Math.round(hjulSenter));
  };
  glidId = requestAnimationFrame(steg);
}

/**
 * `snapp: false` lar den som kaller ta hånd om senteret selv — se
 * `startGlid`. Uten den ville etterglidet begynt med et hopp til nærmeste
 * kort, altså med nøyaktig det bråstoppet det skal erstatte.
 */
function avbrytGest(snapp = true): void {
  if (gest === null) return;
  const g = gest;
  gest = null;
  const hjul = rot.querySelector<HTMLElement>(".hjul");
  hjul?.classList.remove("drar");
  hjul?.classList.remove("tar");
  rot.querySelector(".bord")?.classList.remove("tarimot");
  if (g.kort !== null) {
    g.kort.style.removeProperty("--dx");
    g.kort.style.removeProperty("--dy");
    g.kort.classList.remove("griper", "kaster");
  }
  if (snapp && g.modus !== null) settSenter(Math.round(hjulSenter));
}

function koblHjul(): void {
  const hjul = rot.querySelector<HTMLElement>(".hjul");
  if (hjul === null) return;
  const lov = lovligeHandlinger(state);
  const kanSpille = venterPåMenneske && lov.fase === "SPILL";

  hjul.onpointerdown = (e: PointerEvent) => {
    // Bare den FØRSTE pekeren. En andrefinger midt i en dragning er ikke en
    // ny gest; den er en hånd som holder nettbrettet.
    if (gest !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    // EN FINGER PÅ VIFTA STOPPER ETTERGLIDET. Det er slik en fysisk skive
    // oppfører seg, og uten det ville det neste sveipet lagt seg oppå en
    // bevegelse som fortsatt pågikk.
    stoppGlid();
    gestSluttet = 0; // en ny gest starter alltid med blanke ark
    const kort = (e.target as HTMLElement | null)?.closest<HTMLElement>(".kort") ?? null;
    gest = {
      id: e.pointerId,
      kort,
      spillbart: kanSpille && kort !== null && !(kort as HTMLButtonElement).disabled,
      x0: e.clientX,
      y0: e.clientY,
      senter0: hjulSenter,
      modus: null,
      sisteX: e.clientX,
      sisteT: e.timeStamp,
      fart: 0,
    };
    try { hjul.setPointerCapture(e.pointerId); } catch { /* pekeren er alt borte */ }
  };

  hjul.onpointermove = (e: PointerEvent) => {
    const g = gest;
    if (g === null || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.modus === null) {
      const lengde = Math.hypot(dx, dy);
      if (lengde < GEST_TERSKEL) return;
      const opp = dy < 0 && Math.abs(dy) > Math.abs(dx) * GEST_MARGIN;
      const sidelengs = Math.abs(dx) > Math.abs(dy) * GEST_MARGIN;
      if (opp && g.spillbart) g.modus = "kast";
      else if (sidelengs) g.modus = "bla";
      // TVILEN VARER IKKE EVIG. Har fingeren gått tre terskler uten å ha
      // bestemt seg, er den ikke i tvil lenger — den er bare skrå. Da
      // avgjør den største komponenten, og et oppdrag som ikke kan kastes
      // (ulovlig kort, eller ingen tur) blir alltid blaing.
      else if (lengde > GEST_TERSKEL * 3) {
        g.modus = Math.abs(dy) > Math.abs(dx) && dy < 0 && g.spillbart ? "kast" : "bla";
      } else return;
      if (g.modus === "bla") {
        hjul.classList.add("drar");
      } else if (g.kort !== null) {
        hjul.classList.add("drar", "tar");
        g.kort.classList.add("griper");
      }
    }
    if (g.modus === "bla") {
      const nå = e.timeStamp;
      const dt = Math.max(1, nå - g.sisteT);
      g.fart = (e.clientX - g.sisteX) / dt; // px per ms
      g.sisteX = e.clientX;
      g.sisteT = nå;
      settSenter(g.senter0 - dx / hjulSteg);
    } else if (g.modus === "kast" && g.kort !== null) {
      g.kort.style.setProperty("--dx", `${Math.round(dx)}px`);
      g.kort.style.setProperty("--dy", `${Math.round(dy)}px`);
      const over = dy <= -kastegrense();
      g.kort.classList.toggle("kaster", over);
      rot.querySelector(".bord")?.classList.toggle("tarimot", over);
    }
  };

  const slipp = (e: PointerEvent): void => {
    const g = gest;
    if (g === null || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const kastet = g.modus === "kast" && dy <= -kastegrense() && g.spillbart && g.kort !== null;
    /**
     * ============ TRYKKET SENDES HERFRA, IKKE AV `click` =================
     *
     * Her sto det at et trykk skulle gjøre INGENTING, og heller la
     * nettleseren sende sin egen `click`. Tanken var god — én kodevei for
     * finger, mus og tastatur — men den hviler på at nettleseren treffer
     * samme kort som fingeren gikk ned på, og det gjør den ikke alltid:
     * `:hover` løfter kortet 1 vh og skalerer det 1,05 i det musa kommer inn,
     * altså MELLOM `mousemove` og `mousedown`. Målt i nettleseren var
     * museklikket den ene prøven som ble stående rød gjennom hele runden,
     * mens musedrag og fingertrykk begge var grønne.
     *
     * Nå avgjør vi det selv: gikk pekeren ned på et spillbart kort og opp
     * igjen innenfor terskelen, er det et trykk — uansett hva som har flyttet
     * seg under den i mellomtiden. Klikket som følger undertrykkes.
     *
     * Tastaturet er urørt: `Enter` på en knapp sender `click` UTEN noen
     * `pointerdown` foran, og da er sperren ikke satt.
     */
    const trykket =
      g.modus === null && g.spillbart && g.kort !== null &&
      Math.hypot(dx, dy) < GEST_TERSKEL;
    // Sperren settes FØR vi handler: `menneskeSpill` tegner på nytt, og
    // klikket kommer etter tegningen.
    if (g.modus !== null || trykket) gestSluttet = performance.now();
    const blaFart = g.modus === "bla" ? g.fart : 0;
    const kort = g.kort;
    // Skal det glis videre, må senteret IKKE snappes her — se `avbrytGest`.
    avbrytGest(blaFart === 0);
    if ((kastet || trykket) && kort !== null) {
      const k: Kort = {
        farge: kort.dataset["farge"] as Farge,
        verdi: Number(kort.dataset["verdi"]) as Kort["verdi"],
      };
      menneskeSpill(k);
      return;
    }
    if (blaFart !== 0) {
      // `g.fart` er piksler per ms, og fortegnet er speilvendt: å dra mot
      // HØYRE senker senteret (`senter0 − dx / steg`). Omregningen til
      // indekssteg per ms er derfor delt på steget og snudd.
      startGlid(-blaFart / hjulSteg);
    }
  };
  hjul.onpointerup = slipp;
  hjul.onpointercancel = () => avbrytGest();
  hjul.onlostpointercapture = () => avbrytGest();
  // Langtrykk på en iPad åpner ellers «Kopier / Del» midt i et kast.
  hjul.oncontextmenu = (e) => { e.preventDefault(); };
  // Et kort som får fokus med tastaturet skal komme til syne. `focusin`
  // finnes ikke som `on…`-egenskap, og `hjul` er uansett et nytt element ved
  // hver tegning — så lytteren kan ikke hope seg opp.
  hjul.addEventListener("focusin", (e: FocusEvent) => {
    const kort = (e.target as HTMLElement | null)?.closest<HTMLElement>(".kort");
    if (kort === null || kort === undefined) return;
    const i = [...hjul.querySelectorAll(".kort")].indexOf(kort);
    if (i >= 0) settSenter(i);
  });
  hjul.onkeydown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { stoppGlid(); settSenter(Math.round(hjulSenter) - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { stoppGlid(); settSenter(Math.round(hjulSenter) + 1); e.preventDefault(); }
  };

  for (const [id, steg] of [["bla-venstre", -1], ["bla-hoyre", 1]] as const) {
    const b = document.getElementById(id);
    if (b) b.onclick = () => { stoppGlid(); settSenter(Math.round(hjulSenter) + steg); };
  }
}

/**
 * ============ HÅNDEN SKAL LESES FØR MAN BYR ============================
 *
 * ARVIND: «man ser ikke kortene sine ordentlig før man byr.»
 *
 * Det var ikke pynt: budet ER en vurdering av hånden, og panelet lå oppå den
 * bak et sløret heldekkende lag. Man måtte altså huske kortene sine for å
 * kunne by på dem.
 *
 * `apen` gjør overlegget til et TOPPANEL: det dekker bare sin egen høyde, har
 * ingen bakgrunn og slipper alt under seg fram. Hånden står der den står,
 * fullt lesbar, og kan blas i mens man tenker. Se `.overlegg.apen` i CSS.
 *
 * TRUMFVALGET FÅR DET SAMME, og av nøyaktig samme grunn: hvilken farge man
 * gjør til trumf leses av hånden, ikke av hukommelsen. Vrakpanelet trenger
 * det ikke — det VISER hånden, siden man plukker fra den.
 */
function budPanel(): string {
  const lov = lovligeHandlinger(state);
  if (!venterPåMenneske || lov.fase !== "BUDRUNDE") return "";
  const tall = lov.bud.filter((b): b is number => typeof b === "number");
  /**
   * «Høyeste: 7 · Trump» STO HER, i 0,82 em dempet tekst, og er strøket.
   *
   * ARVIND, punkt 6: «under budrunden er det ikke tydelig hva alle har budt,
   * og teksten om hvem som har budt høyere er altfor liten. budrunden er
   * halve spillet — den fortjener sin egen lesbare visning av hvem som bød
   * hva.»
   *
   * Den er nå en TAVLE på bordet (`budtavle()`), ikke en bisetning i en
   * overskrift. Og den står der gjennom HELE budrunden — også mens botene
   * byr — i stedet for bare i det halve sekundet ditt eget panel er oppe.
   * Det var den egentlige mangelen: opplysningen fantes bare når du selv
   * skulle handle på den, altså for sent til å tenke med.
   */
  return `<div class="overlegg apen"><div class="panel" role="dialog" aria-label="Ditt bud">
    <h2>Ditt bud</h2>
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
    <h2>Legg bort ${lov.antall} kort
      <span class="bekreftsmatt">${vrakValg.length} av ${lov.antall} valgt</span></h2>
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
    return `<div class="overlegg apen"><div class="panel" role="dialog" aria-label="Velg trumf">
      <h2>Trumf</h2>
      <div class="trumfvalg">${(["S", "K", "H", "R"] as Farge[])
        .map(
          (f) => `<button class="trumfkort ${fargeKlasse(f)}" data-trumf="${f}" aria-label="${FARGE_NAVN[f]}">
            <span class="stripe" aria-hidden="true"></span>
            <span class="tsym">${fargefigur(f)}</span>
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
      <p class="bekreftlinje">Trumf ${fargeMerke(trumf)}
         — etterlyser ${fargeMerke(trumf, false)} <b>${VERDI_TEKST(e.verdi)}</b></p>
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
  return `<div class="overlegg apen"><div class="panel" role="dialog" aria-label="Etterlys et kort">
    <h2>Etterlys et ${fargeMerke(trumf)}</h2>
    <div class="etterlysrad">${lovlige
      .slice()
      .sort((a, b) => b.verdi - a.verdi)
      .map(
        (k) => `<button class="minikort ${fargeKlasse(trumf)}" data-ev="${k.verdi}" aria-label="${kortTale(k)}">
          <span class="v">${VERDI_TEKST(k.verdi)}</span><span class="sym" aria-hidden="true">${symbol}</span>
        </button>`,
      )
      .join("")}</div>
    <div class="knapper"><button class="stor" id="velg-tilbake">Bytt trumf</button></div>
  </div></div>`;
}

function rundeSluttPanel(): string {
  if (state.fase !== "RUNDE_SLUTT" || state.sisteRunde === null) return "";
  const r = state.sisteRunde;
  const m = r.melding;
  const hva = m.type === "tall" ? `${m.bud}` : m.type;
  // ✅/❌ er byttet mot et merke med form og farge. Emojiene var dessuten de
  // eneste to stedene utfallet ble sagt, og et grønt hake-emoji gjengis
  // forskjellig på hver plattform — på en TV kunne det bli en tom firkant.
  return `<div class="overlegg"><div class="panel resultat" role="dialog" aria-label="Rundens resultat">
    <h2>${NAVN[r.budvinner]} meldte ${hva} — <span class="utfall ${r.klart ? "ja" : "nei"}">${r.klart ? "klart" : "falt"}</span>
      <span class="bekreftsmatt">${r.lagStikk} stikk${r.makker !== null ? ` med ${NAVN[r.makker]}` : ""}</span></h2>
    <div class="delta">${r.delta
      .map(
        (d, i) =>
          `<span class="${d >= 0 ? "pluss" : "minus"}"><span class="navn">${NAVN[i]}</span><b>${d >= 0 ? "+" : ""}${d}</b></span>`,
      )
      .join("")}</div>
    <button class="stor bekreft" id="neste">Neste runde</button>
  </div></div>`;
}

function ferdigPanel(): string {
  if (state.fase !== "FERDIG") return "";
  const vantDu = state.vinner === MENNESKE;
  // 🎉 er byttet mot stjerna — motivet spillet allerede eier.
  return `<div class="overlegg"><div class="panel resultat" role="dialog" aria-label="Kampen er ferdig">
    <h2>${vantDu ? `${stjerne()}Du vant!${stjerne()}` : `${NAVN[state.vinner!]} vant`}</h2>
    <div class="delta">${state.totalPoeng
      .map((p, i) => `<span><span class="navn">${NAVN[i]}</span><b>${p}</b></span>`)
      .join("")}</div>
    <button class="stor bekreft" id="nytt-spill">Nytt spill</button>
    <p class="lite"><a href="${DATA_URL}" target="_blank" rel="noopener">Se innsamlede data</a></p>
  </div></div>`;
}

/** Hvilket panel som sto framme ved forrige tegning — se `fersk` under. */
let sistPanel = "";

function tegn(): void {
  if (!state) return;
  // Startskjermen er forlatt i det spillet tegner seg — se `startskjerm()`.
  document.body.classList.remove("paa-start");
  // EN PÅGÅENDE GEST OVERLEVER IKKE EN NY DOM. `innerHTML` bytter ut kortet
  // fingeren holder i, og en pekerfangst på et element som er borte er en
  // fangst ingen får meldinger fra. Å avbryte her er samme håndtering som
  // `pointercancel`: kortet legger seg tilbake, og ingenting blir hengende
  // halvveis kastet.
  avbrytGest();
  // OG HELLER IKKE ET ETTERGLID. `settSenter` slår opp `.hjul` på nytt for
  // hvert bilde, så en løkke som overlevde tegningen ville fortsatt å dra i
  // den NYE vifta — med en fart som hørte til den gamle hånden.
  stoppGlid();
  nåPynt = new Set<string>();
  rot.innerHTML =
    topplinje() + stikksoyle() + bordet() +
    budPanel() + vrakPanel() + velgPanel() + rundeSluttPanel() + ferdigPanel() + håndrad();
  sistPynt = nåPynt;
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
  // MÅLES ETTER at DOM-en står. Hjulets steg avhenger av hvor bredt hjulet
  // faktisk ble, og det vet ingen før søyla og pilene har tatt sitt.
  oppdaterHjul();
  // Og sprellet når kontrakten avgjøres — også etter at DOM-en står, siden
  // det måles inn over søyla. Se `visGjennombrudd`.
  if (gjennombruddVenter !== "") {
    const u = gjennombruddVenter;
    gjennombruddVenter = "";
    visGjennombrudd(u);
  }
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
      // TRYKKET GÅR HERFRA, OG BARE HERFRA. Var det egentlig et sveip eller
      // et kast, har `pointerup` alt gjort jobben og satt dette flagget —
      // uten det ville et kast spilt kortet, og klikket nettleseren sender
      // etterpå ville forsøkt å spille det én gang til.
      if (performance.now() - gestSluttet < KLIKKSPERRE_MS) { gestSluttet = 0; return; }
      const kort: Kort = { farge: b.dataset["farge"] as Farge, verdi: Number(b.dataset["verdi"]) as Kort["verdi"] };
      if (lov.fase === "VRAK" && venterPåMenneske) {
        const i = vrakValg.findIndex((v) => v.farge === kort.farge && v.verdi === kort.verdi);
        if (i >= 0) {
          vrakValg.splice(i, 1);
          tenkeklokke.angre(); // et avhuket kort hukes av igjen
        } else if (vrakValg.length < lov.antall) vrakValg.push(kort);
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
  if (velgAngre) velgAngre.onclick = () => { velgEtterlysValg = null; tenkeklokke.angre(); tegn(); };
  const velgTilbake = document.getElementById("velg-tilbake");
  if (velgTilbake) velgTilbake.onclick = () => { velgTrumfValg = null; velgEtterlysValg = null; tenkeklokke.angre(); tegn(); };
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
  koblHjul();
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
  // NAVN, KNAPP, SPILL.
  //
  // ARVIND: «trenger vi tekst over alt? … minimalt hassle maksimalt gøy!»
  //
  // Her sto tre setninger til: «Tre boter mot deg. Store kort, laget for TV,
  // iPad og telefon.» — som er en beskrivelse av produktet, ikke noe spilleren
  // trenger for å komme i gang — og «Brukes bare til å merke rundene i
  // statistikken.», som svarer på et spørsmål ingen stilte og som reiser ett
  // nytt. Overskriften «Hva heter du?» sier alt feltet trenger, og den står nå
  // bare for skjermleseren siden plassholderen sier det samme på skjermen.
  /**
   * ============ STARTSKJERMEN ER APPIKONET ==============================
   *
   * ARVIND, punkt 10: «gjenskap appikonet i fullskjerm, animert bittelitt,
   * med teksten "Amerikaneren demo". `web/konsept/appikon.png` er fasiten —
   * myke airbrush-gradienter, ingen harde kanter, bakgrunn som lysner mot
   * kantene.»
   *
   * Her sto en boks: en `.panel`-flate med tre kortrygger i vifte oppå
   * romgradienten. Den var pen og den var en DIALOG, altså det motsatte av
   * et ikon — et ikon har ingen ramme, det ER flaten.
   *
   * Nå er de fem formene fra ikonet lagt ut over hele skjermen i ikonets egne
   * posisjoner: kløver oppe til venstre, ruter oppe til høyre, stjerna i
   * midten, hjerter nede til venstre, spar nede til høyre. Ingen boks,
   * ingen kant. Bakgrunnen er `--rom-fall`, som ER ikonets omvendte vignett
   * og allerede ligger på `body`.
   *
   * FORMENE ER DE SAMME som spillet bruker (`#kf-S` og de tre andre), med
   * airbrushfilteret og gradientene fra runde 4. Å tegne dem på nytt her
   * ville gitt to sannheter om hvordan en kløver ser ut.
   */
  /**
   * BORDET SKAL IKKE ANES BAK IKONET. `.rom` ligger utenfor `#app` og
   * overlever derfor enhver `innerHTML` — også denne. Bordkanten som buer
   * seg tvers over skjermen hører til spillet, og på startskjermen leste den
   * som en strek gjennom ikonet.
   *
   * En klasse på `body` og ikke `:has()` i CSS: dette må virke likt på hver
   * eneste nettleser familien bruker, og en klasse gjør det i alle.
   */
  document.body.classList.add("paa-start");
  rot.innerHTML = `<div class="overlegg ikonstart">
    <div class="ikonlag" aria-hidden="true">
      <svg class="fig kloever" viewBox="0 0 100 100"><use href="#kf-K-koks"></use></svg>
      <svg class="fig ruter" viewBox="0 0 100 100"><use href="#kf-R-korall"></use></svg>
      <svg class="fig stjerna" viewBox="0 0 100 100"><use href="#stjernemerke"></use></svg>
      <svg class="fig hjerter" viewBox="0 0 100 100"><use href="#kf-H"></use></svg>
      <svg class="fig spar" viewBox="0 0 100 100"><use href="#kf-S"></use></svg>
    </div>
    <div class="startinnhold" role="dialog" aria-label="Start">
      <h1 class="ordmerke">Amerikaneren<span class="demo">demo</span></h1>
      ${motstander === "MesterAI" ? `<p class="bromelding">Bromodus: du møter MesterAI fra laptopen.</p>` : ""}
      <label class="skjult" for="navn">Hva heter du?</label>
      <input id="navn" type="text" placeholder="Hva heter du?" autocomplete="off"
             enterkeyhint="go" maxlength="24">
      <button class="stor bekreft" id="start-knapp">Spill</button>
    </div>
  </div>`;
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
  // Kortbredden er det ene tallet som ikke kan regnes ut i CSS, så det er
  // også det ene som krever en ny tegning. Endres den ikke, holder det å
  // måle hjulet på nytt — og da beholder knappen brukeren står på fokuset.
  const nøkkel = String(kortBredde());
  if (nøkkel === sistLayout) { oppdaterHjul(); return; }
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
