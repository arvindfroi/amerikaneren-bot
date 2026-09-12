/**
 * SPILLERPROFILEN — motstanderboka som følger SPILLEREN, ikke kampen.
 *
 * Arvind, 12. september: «når botten starter en kamp mot en spiller så lastes
 * den spilleren sine vaner inn i botten sitt minne basert på tidligere matches,
 * også oppdateres den videre under kampen. så en spiller sine vaner og
 * spillerstil følger brukeren, også kan botten trekke fra den.»
 *
 * ======================= KRAVET SOM BLE ENDRET =============================
 *
 * K2.5 og K6.7 sa «ingen lagring på tvers av økter», og `src/moe2/okt.ts` er
 * bygget på det skillet: økt = så lenge prosessen lever, historie = databasen
 * som ble avvist. Eieren har nå flyttet grensen, og den nye er SMALERE enn
 * «alt er lov»:
 *
 *   LAGRING PÅ TVERS AV KAMPER ER LOV. En profil kan overleve at appen lukkes.
 *   MEN EN PROFIL KAN BARE INNEHOLDE DET SOM VAR OFFENTLIG VED BORDET I
 *   FERDIGSPILTE RUNDER. Ingen skjulte kort, ingen talong, ingen annen
 *   spillers vrak ut over det som er utledbart ved rundeslutt.
 *   OG K2 STÅR UENDRET: valgene skal fortsatt være invariante for skjult
 *   informasjon.
 *
 * ======================= HVORFOR DEN ER RENT AVLEDET =======================
 *
 * Profilen bygges IKKE av en egen avlesning av tilstanden. Den bygges av
 * `Hukommelse` — nøyaktig den boka kampen selv fører (`hukommelse.ts`, 48 tall
 * per motstander). Den boka har allerede K2-grensen innebygd: `observer` gjør
 * ingenting før `fase === "RUNDE_SLUTT"`, og da ER alt avdekket.
 *
 * Det er en bevisst arvet grense, ikke en gjentatt. Skrev denne fila sin egen
 * avlesning av `GameState`, ville vi hatt TO steder en skjult hånd kan lekke
 * inn, og bare det ene ville vært testdekket. Her finnes det ett:
 * `byggProfil` tar en `Hukommelse` og aldri en `GameState`, så en skjult hånd
 * har ingen vei inn i typen i det hele tatt.
 *
 * ======================= HVA SOM BÆRES, OG HVA SOM IKKE GJØR DET ===========
 *
 * Ikke alle 48 tallene betyr det samme på tvers av kamper.
 *
 *   MIKRO   BÆRES. Hvordan hun spiller kortene — residualet, om hun overtar,
 *           honnørtimingen, renonsatferden, avkasthøyden — er vaner. De er det
 *           eieren kaller «spillerstil», og de er det samme på tirsdag som på
 *           lørdag.
 *   MESO    BÆRES. Budavviket mot hånden hun viste seg å ha, passtyrken,
 *           budandelen, klareraten, vraket og trumfvalget. Samme argument:
 *           dette er hvordan hun VURDERER, ikke hvordan denne kampen gikk.
 *   MAKRO korrelasjonene   BÆRES. `…MotStilling` og `…MotTid` er par av
 *           (stilling, atferd) og (rundenummer, atferd). Begge aksene
 *           nullstilles hver kamp, så parene fra to kamper er sammenliknbare,
 *           og å samle dem er nettopp det som gjør spørsmålet «byr hun mer når
 *           hun ligger under?» besvarbart — én kamp gir sjelden nok spredning.
 *   FERSKVEKTENE   BÆRES IKKE. `ferskResidual` og `ferskBudavvik` har
 *           halveringstid tre RUNDER (`FERSK_HALVERING`). De svarer på «hva
 *           gjør hun akkurat nå», og «akkurat nå» fra en kamp i forrige uke er
 *           ikke ferskt — det er gammelt, med et navn som sier det motsatte.
 *           Å bære dem ville plantet et driftssignal (`makro.residualdrift`)
 *           i runde 1 som ikke måler noen drift.
 *
 * Det er ikke en smakssak: nettet leser `ferskVerdi − alltidSnitt` som DRIFT
 * innenfor kampen. Et båret ferskestimat gjør den differansen til støy fra en
 * annen dag.
 *
 * ======================= TILTROEN ER TELLEREN, IKKE EN PORT ================
 *
 * Som i `hukommelse.ts` har ingen størrelse her en terskel. Hvert ledd bærer
 * sin `n`, og `tiltro(n) = n/(n+k)` er tallet nettet får se. Profilen legger
 * bare til `n` fra tidligere kamper — den innfører ingen ny dør.
 *
 * ======================= SAMMENSLÅINGEN VED KAMPSTART ======================
 *
 * `såBok` fyller kampens bok med profilen FØR første runde, RABATTERT:
 *
 *     n_start = min(RABATT · n_profil, TAK_N)
 *
 * og sum/kvadrat/samvariasjon skaleres med samme faktor, slik at SNITTET er
 * profilens mens VEKTEN er liten. Så akkumulerer kampens egne runder oppå,
 * gjennom vanlig `Hukommelse.observer`. Etter noen runder dominerer dagens
 * bevis av seg selv — uten en bryter som slår om.
 *
 * TO GRUNNER TIL AT DET MÅ RABATTERES:
 *
 *   DAGSFORM   en profil på 2 000 runder ville med full vekt gjort dagens
 *              tjue runder usynlige. Da ville boten ikke lenger LÆRE under
 *              kampen, som er K4 — den ville bare lest opp et arkiv.
 *   BORDET     vanene er målt mot ANDRE motstandere i andre kamper. Residualet
 *              er et avvik fra en policy, og hvem hun satt med farger det.
 *
 * TAKET er det som gjør rabatten trygg for en stor profil: uten det vokser
 * `RABATT · n` uten grense, og en spiller med tusen kamper ville fått en
 * prior ingen kamp kan flytte. `TAK_N` er satt til omtrent én kamps bevis, så
 * profilen er verdt «én kamp du allerede har spilt mot henne» — ikke mer.
 *
 * NULLPUNKTET ER BIT-IDENTISK. Uten profil kalles `såBok` aldri, og boka er
 * `new Hukommelse()` slik den alltid har vært. `test/mlb-profil.test.ts`
 * håndhever det, og `RABATT = 0` gir samme bit-identitet med profil koblet på
 * — en knott med et nullpunkt, slik regel 5 i `AdamsMax.md` krever.
 *
 * ======================= NAVN ==============================================
 *
 * `spiller` er ALLTID et pseudonym (`sha256(salt + navn)` → 12 hex,
 * `menneske-eksport.ts`). `gyldigId` håndhever formen, og den håndhever den to
 * ganger: et navn skal aldri kunne bli et filnavn, og en id skal aldri kunne
 * bli en sti ut av katalogen.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  Hukommelse,
  tomSetebok,
  TOMT_LEDD,
  TOM_FERSK,
  TOM_SAMVAR,
  type Ledd,
  type Samvar,
  type Setebok,
} from "./hukommelse.ts";

/** Filformatets versjon. Endres formen, skal en gammel fil AVVISES, ikke feiltolkes. */
export const PROFIL_VERSJON = 1;

/**
 * Hvor mye av profilens bevis som bæres inn i kampens bok.
 *
 * 0,5 er et valg, ikke et resultat: halv vekt på gårsdagens bevis mot dagens.
 * Den skal sveipes som `evForsvar` sveipes — og `RABATT = 0` er nullpunktet.
 */
export const RABATT = 0.5;

/**
 * Taket på båret bevis, i observasjoner per ledd. 24 ≈ én kamps runder, så en
 * profil er aldri verdt mer enn «én kamp du har spilt mot henne før».
 */
export const TAK_N = 24;

/** Leddene som BÆRES. Ferskvektene står med vilje ikke her — se toppen. */
export const BÅRNE_LEDD = [
  "residual",
  "overtar",
  "honnørsen",
  "renonstrumf",
  "avkasthøyde",
  "budavvik",
  "passtyrke",
  "budandel",
  "klarte",
  "vrakhøyde",
  "vrakrenons",
  "vrakhonnør",
  "trumflengst",
  "trumflengde",
] as const;

/** Samvariasjonene som bæres. Samme begrunnelse som `BÅRNE_LEDD`. */
export const BÅRNE_SAMVAR = [
  "budavvikMotStilling",
  "budandelMotStilling",
  "residualMotStilling",
  "budavvikMotTid",
  "budandelMotTid",
  "residualMotTid",
] as const;

/** Leddene som med vilje IKKE bæres, og som derfor må starte tomme. */
export const IKKE_BÅRNE = ["ferskResidual", "ferskBudavvik"] as const;

export type Bårne = (typeof BÅRNE_LEDD)[number];
export type BårneSamvar = (typeof BÅRNE_SAMVAR)[number];

export interface Spillerprofil {
  readonly versjon: number;
  /** Pseudonymet. Aldri et navn — se `gyldigId`. */
  readonly spiller: string;
  /** Kamper profilen er bygget av. */
  readonly kamper: number;
  /** Ferdigspilte runder profilen er bygget av. */
  readonly runder: number;
  /** Siste dato som er bakt inn, ISO. Gjør «bare tidligere kamper» etterprøvbart. */
  readonly sist: string;
  readonly ledd: Readonly<Record<string, Ledd>>;
  readonly samvar: Readonly<Record<string, Samvar>>;
}

/**
 * PSEUDONYMFORMEN, håndhevet. 1–32 hex.
 *
 * To jobber i én regel. Den ene er personvern: et fornavn består ikke, så et
 * navn kan ikke bli et filnavn ved et uhell. Den andre er stien: uten `/`,
 * `\` og `.` finnes ingen `../` å traversere med.
 */
export const gyldigId = (id: string): boolean => /^[0-9a-f]{1,32}$/.test(id);

export const tomProfil = (spiller: string): Spillerprofil => ({
  versjon: PROFIL_VERSJON,
  spiller,
  kamper: 0,
  runder: 0,
  sist: "",
  ledd: {},
  samvar: {},
});

// ===========================================================================
// 1. Fra kampens bok til en profil
// ===========================================================================

const leddAv = (b: Setebok, navn: string): Ledd =>
  (b as unknown as Record<string, Ledd>)[navn] ?? TOMT_LEDD;

const samvarAv = (b: Setebok, navn: string): Samvar =>
  (b as unknown as Record<string, Samvar>)[navn] ?? TOM_SAMVAR;

const plussLedd = (a: Ledd, b: Ledd): Ledd => ({
  sum: a.sum + b.sum,
  kvadrat: a.kvadrat + b.kvadrat,
  n: a.n + b.n,
});

/**
 * SAMMENSLÅING AV TO WELFORD-AKKUMULATORER (Chan/Golub/LeVeque).
 *
 * Ikke råsummer, av nøyaktig grunnen `Samvar` i `hukommelse.ts` dokumenterer:
 * makronivåets x er en stillingsandel nær null, og en sentrering-i-etterkant
 * kansellerer bort hele signalet. Her er den parvise formen, som holder
 * sentreringen gjennom sammenslåingen også.
 */
function plussSamvar(a: Samvar, b: Samvar): Samvar {
  if (a.n === 0) return b;
  if (b.n === 0) return a;
  const n = a.n + b.n;
  const dx = b.mx - a.mx;
  const dy = b.my - a.my;
  return {
    mx: a.mx + (dx * b.n) / n,
    my: a.my + (dy * b.n) / n,
    cxx: a.cxx + b.cxx + (dx * dx * a.n * b.n) / n,
    cyy: a.cyy + b.cyy + (dy * dy * a.n * b.n) / n,
    cxy: a.cxy + b.cxy + (dx * dy * a.n * b.n) / n,
    n,
  };
}

/**
 * Kampens bok for ETT sete → et profilbidrag.
 *
 * `bok` er en `Hukommelse`, og det er hele K2-argumentet: den har bare sett
 * `RUNDE_SLUTT`. Signaturen slipper ikke en `GameState` inn, så det finnes
 * ingen vei til et skjult kort herfra.
 */
export function bidragFraBok(bok: Hukommelse, sete: number, spiller: string, dato: string): Spillerprofil {
  const b = bok.bok(sete);
  const ledd: Record<string, Ledd> = {};
  for (const navn of BÅRNE_LEDD) ledd[navn] = leddAv(b, navn);
  const samvar: Record<string, Samvar> = {};
  for (const navn of BÅRNE_SAMVAR) samvar[navn] = samvarAv(b, navn);
  return {
    versjon: PROFIL_VERSJON,
    spiller,
    kamper: b.runder > 0 ? 1 : 0,
    runder: b.runder,
    sist: dato,
    ledd,
    samvar,
  };
}

/** To profiler lagt sammen. Rekkefølgen spiller ingen rolle — summene er kommutative. */
export function slåSammen(a: Spillerprofil, b: Spillerprofil): Spillerprofil {
  if (a.spiller !== b.spiller) {
    throw new Error(`Kan ikke slå sammen profiler for ulike spillere («${a.spiller}» og «${b.spiller}»)`);
  }
  const ledd: Record<string, Ledd> = {};
  for (const navn of BÅRNE_LEDD) {
    ledd[navn] = plussLedd(a.ledd[navn] ?? TOMT_LEDD, b.ledd[navn] ?? TOMT_LEDD);
  }
  const samvar: Record<string, Samvar> = {};
  for (const navn of BÅRNE_SAMVAR) {
    samvar[navn] = plussSamvar(a.samvar[navn] ?? TOM_SAMVAR, b.samvar[navn] ?? TOM_SAMVAR);
  }
  return {
    versjon: PROFIL_VERSJON,
    spiller: a.spiller,
    kamper: a.kamper + b.kamper,
    runder: a.runder + b.runder,
    sist: a.sist > b.sist ? a.sist : b.sist,
    ledd,
    samvar,
  };
}

// ===========================================================================
// 2. Fra profil til kampens bok
// ===========================================================================

/** Skalerer et ledd slik at SNITTET står og VEKTEN krymper. */
function skalerLedd(l: Ledd, tak: number, rabatt: number): Ledd {
  if (l.n <= 0 || rabatt <= 0) return TOMT_LEDD;
  const nyN = Math.min(l.n * rabatt, tak);
  const f = nyN / l.n;
  return { sum: l.sum * f, kvadrat: l.kvadrat * f, n: nyN };
}

/** Samme skalering for samvariasjonen: snittene står, spredningsmassen krymper. */
function skalerSamvar(c: Samvar, tak: number, rabatt: number): Samvar {
  if (c.n <= 0 || rabatt <= 0) return TOM_SAMVAR;
  const nyN = Math.min(c.n * rabatt, tak);
  const f = nyN / c.n;
  return { mx: c.mx, my: c.my, cxx: c.cxx * f, cyy: c.cyy * f, cxy: c.cxy * f, n: nyN };
}

export interface Såopsjoner {
  readonly rabatt?: number;
  readonly tak?: number;
}

/**
 * Profilen som en STARTBOK for ett sete.
 *
 * Ferskvektene og `runder` settes med vilje ikke fra profilen:
 *
 *   FERSKVEKTENE   se toppen — «akkurat nå» fra en annen dag er ikke ferskt.
 *   `runder`       er kampens rundeteller, og den mater `makro.runder.tiltro`.
 *                  Å starte den på 2 000 ville fortalt nettet at DENNE kampen
 *                  har vart i 2 000 runder. Bevisvekten fra profilen ligger
 *                  allerede i hvert ledds egen `n`, som er der nettet leser den.
 */
export function startbok(p: Spillerprofil, opts: Såopsjoner = {}): Setebok {
  const rabatt = opts.rabatt ?? RABATT;
  const tak = opts.tak ?? TAK_N;
  const b = tomSetebok();
  for (const navn of BÅRNE_LEDD) {
    (b as unknown as Record<string, Ledd>)[navn] = skalerLedd(p.ledd[navn] ?? TOMT_LEDD, tak, rabatt);
  }
  for (const navn of BÅRNE_SAMVAR) {
    (b as unknown as Record<string, Samvar>)[navn] = skalerSamvar(p.samvar[navn] ?? TOM_SAMVAR, tak, rabatt);
  }
  b.ferskResidual = TOM_FERSK;
  b.ferskBudavvik = TOM_FERSK;
  return b;
}

/**
 * KAMPENS BOK, SÅDD MED PROFILENE. `tildeling` er sete → profil.
 *
 * Et sete uten profil røres ikke, og en tom `tildeling` gjør funksjonen til en
 * ren nulloperasjon — det er nullpunktet `test/mlb-profil.test.ts` måler.
 */
export function såBok(
  bok: Hukommelse,
  tildeling: ReadonlyMap<number, Spillerprofil>,
  opts: Såopsjoner = {},
): void {
  for (const [sete, p] of tildeling) bok.settBok(sete, startbok(p, opts));
}

/**
 * BOKFABRIKKEN som speken sender nedover.
 *
 * Holderne av en `Hukommelse` (`Sandkasseagent`, `MlbSøketro`, `Kortbok`,
 * `BudQagent`) skriver `new Hukommelse()` fire steder. Med denne skriver de
 * `frø?.lagBok() ?? new Hukommelse()`, og da er «ingen profil» bokstavelig
 * talt det samme uttrykket som før.
 */
export interface Bokfrø {
  lagBok(): Hukommelse;
}

export function lagBokfrø(
  tildeling: ReadonlyMap<number, Spillerprofil>,
  opts: Såopsjoner = {},
): Bokfrø {
  return {
    lagBok(): Hukommelse {
      const bok = new Hukommelse();
      såBok(bok, tildeling, opts);
      return bok;
    },
  };
}

// ===========================================================================
// 3. Lageret — ÉN LITEN JSON PER SPILLER, MED EKSPLISITT KATALOG
// ===========================================================================

/**
 * KATALOGEN ER ET ARGUMENT, ALDRI EN GLOBAL.
 *
 * Prosjektets måleapparat kjører mange armer i samme prosess, og en implisitt
 * standardsti ville latt en arm skrive inn i en annens profiler uten at noe
 * feilet. Den som vil ha profiler, må si hvor de ligger.
 */
export const profilSti = (katalog: string, id: string): string => {
  if (!gyldigId(id)) throw new Error(`Ugyldig spiller-id «${id}» – ventet 1–32 hex (pseudonym)`);
  return join(katalog, `${id}.json`);
};

/** Profilen for `id`, eller `null` om den ikke finnes. Avviser en fil med feil versjon. */
export function lesProfil(katalog: string, id: string): Spillerprofil | null {
  const sti = profilSti(katalog, id);
  if (!existsSync(sti)) return null;
  const p = JSON.parse(readFileSync(sti, "utf8")) as Spillerprofil;
  if (p.versjon !== PROFIL_VERSJON) {
    throw new Error(`${sti}: profilversjon ${p.versjon}, koden leser ${PROFIL_VERSJON}`);
  }
  if (p.spiller !== id) throw new Error(`${sti}: filen er for «${p.spiller}», ikke «${id}»`);
  return p;
}

export function skrivProfil(katalog: string, p: Spillerprofil): void {
  const sti = profilSti(katalog, p.spiller);
  mkdirSync(katalog, { recursive: true });
  writeFileSync(sti, JSON.stringify(p, null, 1) + "\n");
}

/** Alle id-ene som har en profil i katalogen. Tom liste når katalogen ikke finnes. */
export function profilIder(katalog: string): string[] {
  if (!existsSync(katalog)) return [];
  return readdirSync(katalog)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => f.slice(0, -5))
    .filter(gyldigId)
    .sort();
}

/**
 * Les, slå sammen, skriv. Det appen gjør ved kampslutt, i én linje.
 *
 * IDEMPOTENT DEN ER IKKE, og det er med vilje: to kamper mot samme spiller SKAL
 * legge til bevis to ganger. Kalleren må derfor kalle den én gang per kamp, og
 * `sist` er der for at en dobbeltkjøring skal kunne oppdages i ettertid.
 */
export function oppdaterProfil(katalog: string, bidrag: Spillerprofil): Spillerprofil {
  const før = lesProfil(katalog, bidrag.spiller) ?? tomProfil(bidrag.spiller);
  const etter = slåSammen(før, bidrag);
  skrivProfil(katalog, etter);
  return etter;
}

/** Profilen på en oppgitt sti. Brukes av speken, der stien står ordrett. */
export function lesProfilFil(sti: string): Spillerprofil {
  const p = JSON.parse(readFileSync(sti, "utf8")) as Spillerprofil;
  if (p.versjon !== PROFIL_VERSJON) {
    throw new Error(`${sti}: profilversjon ${p.versjon}, koden leser ${PROFIL_VERSJON}`);
  }
  if (!gyldigId(p.spiller)) throw new Error(`${sti}: «${p.spiller}» er ikke et pseudonym (1–32 hex)`);
  return p;
}

/**
 * SPEKFELTET → EN BOKFABRIKK: `<sti>@<sete>[,<sti>@<sete>]`.
 *
 * Formen står HER og ikke i `agentspek.ts`, av samme grunn som resten av fila:
 * den som endrer profilformatet skal se parseren i samme fil. Og den kan
 * prøves uten å bygge en hel agent.
 *
 * SETET MÅ STÅ. Et pseudonym vet ingenting om hvor spilleren sitter, og
 * seterotasjonen i harneskene flytter henne hvert løp. Uten setet ville
 * profilen blitt sådd på et vilkårlig sete — og en profil på FEIL sete er
 * verre enn ingen profil: den er en påstand om en spiller som ikke sitter der.
 */
export function bokfrøFraSpek(felt: string, opts: Såopsjoner = {}): Bokfrø {
  const tildeling = new Map<number, Spillerprofil>();
  for (const del of felt.split(",")) {
    if (del === "") continue;
    const at = del.lastIndexOf("@");
    if (at < 0) throw new Error(`Ugyldig profilfelt «${del}» – ventet <sti>@<sete>`);
    const sti = del.slice(0, at);
    const sete = Number(del.slice(at + 1));
    if (!Number.isInteger(sete) || sete < 0 || sete > 5) {
      throw new Error(`Ugyldig sete «${del.slice(at + 1)}» i profilfeltet «${del}»`);
    }
    if (tildeling.has(sete)) throw new Error(`Sete ${sete} har fått to profiler i «${felt}»`);
    tildeling.set(sete, lesProfilFil(sti));
  }
  if (tildeling.size === 0) throw new Error(`Tomt profilfelt «${felt}» – da skal «profil=» stå ute`);
  return lagBokfrø(tildeling, opts);
}
