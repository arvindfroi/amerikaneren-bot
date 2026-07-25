/**
 * Genanalyse: hvilke KOBLINGER står bak et godt kortvalg, og hvilke står bak
 * et dårlig?
 *
 *   node examples/genanalyse.ts d7/fro-d5.json --benk e1-data3 --antall 2000 \
 *        --ut d7/genanalyse-d5.json
 *
 * HVORFOR. Alt vi har målt sier at seleksjon på HELE genomet er for grovt.
 * Kampfitness er ett tall bak ~250 kortvalg med ±50 poeng kortflaks-støy
 * (se angerbenk.ts), og angerbenken løser bare halve problemet: den sier at
 * genomet valgte feil, ikke HVA i genomet som valgte feil. Krysning og
 * mutasjon arver derfor gener i blinde – et gen som står bak et godt valg og
 * et gen som står bak et katastrofalt valg har nøyaktig samme sjanse for å
 * bli med videre.
 *
 * Dette verktøyet tilskriver enkeltbeslutninger til enkeltGENER, slik at
 * arven kan bli selektiv: forsterk de koblingene som bærer de gode valgene,
 * demp de som bærer de dårlige.
 *
 * MÅLEMETODEN ER ABLASJON, IKKE VEKT. examples/neat-bidrag.ts målte
 * korrelasjonen mellom |vekt| og faktisk bidrag til r = 0,258. Vektstørrelse
 * er altså IKKE en gyldig proxy – en liten vekt inn i en kritisk sti kan bety
 * alt, en stor vekt fra en død node betyr ingenting. Eneste svar på «virker
 * denne koblingen?» er å slå den av og måle. Derfor nulles hver aktive
 * kobling i tur og orden, nettet reaktiveres, og endringen i det VALGTE
 * kortets utgang registreres.
 *
 * TO FASITER:
 *  (a) Orakelet i angerbenken (`v`: kortindeks → forventet egenpoeng fra
 *      eksakt dobbelt-dummy). Optimalt kort = argmax(v). Dette er den ekte
 *      fasiten – langt over enhver spillende bot.
 *  (b) NevroHjerne på samme stilling, som referansepunkt (appens ferdigtrente
 *      nett, ~0,94 anger på tilsvarende data). Den brukes IKKE som fasit,
 *      bare til å vise hvor genomet står i forhold til en kjent målestokk.
 *
 * GOD stilling = genomet valgte orakelets beste kort.
 * DÅRLIG stilling = genomet valgte et annet kort OG tapte minst `--margin`
 * forventede egenpoeng på det. Marginen er der fordi de fleste avvik er
 * likegyldige (to kort verdt 15,0 og 14,99); det er de kostbare avvikene vi
 * vil finne genene bak.
 *
 * YTELSE. Naiv full reaktivering per kobling er 2 000 koblinger × 8 pass ×
 * 2 000 kanter ≈ 32 M multiplikasjoner per stilling. Her brukes i stedet
 * EKSAKT DELTA-FORPLANTNING: å nulle én kobling endrer først bare målnoden,
 * og endringen sprer seg utover langs utgående kanter. Er kildeverdien 0 –
 * svært vanlig, inngangsvektoren er tynn og binær – skjer ingenting i det
 * hele tatt. Resultatet er bit-for-bit det samme bortsett fra
 * flyttallsassosiativitet; `--sjekk` verifiserer det mot full reaktivering og
 * skriver ut største avvik.
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import { lesBenk, type Benkstilling } from "../src/neat/angerbenk.ts";
import { biasId, genomFraJson, utId, type Genom } from "../src/neat/genom.ts";
import { Nettverk } from "../src/neat/nett.ts";
import { UT_KORT } from "../src/neat/trekk.ts";
import { forover, nevroHjerne } from "../src/nevro/index.ts";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const posisjonelle: string[] = [];
let benkMappe = "e1-data3";
let antall = 2000;
let utFil = "";
let steg = 7;
let margin = 1.0;
/**
 * Tak på hvor mange stillinger som ableres. Delta-forplantningen gjorde
 * ablasjonen billig nok til at taket sjelden binder – målt 40 stillinger ×
 * 1 992 kanter på under 0,3 s – så standardverdien er satt så høyt at hele
 * benken normalt tas med.
 */
let maksAblasjon = 4000;
let sjekk = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === "--benk") benkMappe = argv[++i] ?? benkMappe;
  else if (a === "--antall") antall = Number(argv[++i]);
  else if (a === "--ut") utFil = argv[++i] ?? "";
  else if (a === "--steg") steg = Number(argv[++i]);
  else if (a === "--margin") margin = Number(argv[++i]);
  else if (a === "--maks") maksAblasjon = Number(argv[++i]);
  else if (a === "--sjekk") sjekk = true;
  else posisjonelle.push(a);
}
const genomFil = posisjonelle[0];
if (genomFil === undefined) {
  console.error(
    "Bruk: node examples/genanalyse.ts <genom.json> [--benk e1-data3] [--antall 2000] [--ut fil.json]",
  );
  process.exit(1);
}
if (utFil === "") {
  const navn = genomFil.split(/[\\/]/).pop()!.replace(/\.json$/, "");
  utFil = `d7/genanalyse-${navn}.json`;
}

// Fall tilbake til e1-data hvis den nyere mappa ikke finnes. Merk at BARE
// e1-data3 er skrevet etter 2026-07-25 og dermed har `nt` – NEAT-vektoren.
// Uten den kan ingen NEAT-genom scores, og stillingen hoppes over.
if (!existsSync(benkMappe)) {
  console.log(`${benkMappe} finnes ikke – faller tilbake til e1-data.`);
  benkMappe = "e1-data";
}

// ---------------------------------------------------------------------------
// Genom
// ---------------------------------------------------------------------------

// Noen genomfiler er pakket som { genom: … } (treningsutskrifter), andre er
// rene genomer. Samme håndtering som examples/kontraktobduksjon.ts.
const råTekst = readFileSync(genomFil, "utf8");
const rå = JSON.parse(råTekst) as { genom?: unknown };
const genom: Genom = genomFraJson(rå.genom !== undefined ? JSON.stringify(rå.genom) : råTekst);

// ---------------------------------------------------------------------------
// Flatt nett: samme semantikk som Nettverk, men i typede tabeller
// ---------------------------------------------------------------------------

/**
 * «Ingen endring»-grensen ved MÅLING av et bidrag.
 *
 * Delta-forplantningen under er eksakt, men ikke bit-identisk med full
 * reaktivering: leddene summeres i en annen rekkefølge, og flyttall er ikke
 * assosiativt. Målt med `--sjekk` er avviket ≤ 1,1e-16 over 300 ablasjoner.
 * Terskelen ligger fire størrelsesordener over det og tolv under det minste
 * bidraget som faktisk rapporteres, så den kan bare fjerne støy.
 *
 * MERK at den IKKE gjør tallene reproduserbare mellom kjøringer, og det er
 * ikke dens jobb: e1-data3 skrives fortsatt av orakelgeneratoren mens
 * analysen kjører (målt 2026-07-25: seks av ti skard-filer vokste i løpet av
 * seks sekunder). `lesBenk` plukker hver 7. linje på tvers av filene, så to
 * kjøringer minutter fra hverandre leser ikke helt samme benk. Utslaget er
 * lite – én til to koblinger av ~2 000 skifter død/levende-status – men
 * sammenlign alltid genomer fra SAMME kjøring, ikke på tvers.
 */
const NULLGRENSE = 1e-12;

/**
 * Kjørbar kopi av Nettverk med to tillegg som ablasjonen trenger:
 *  1. verdiene fra HVERT pass tas vare på (ikke bare det siste), sammen med
 *     pre-aktiveringen. Uten dem må hver ablasjon regne hele nettet på nytt.
 *  2. utgående naboliste, slik at en endring kan forplantes framover i stedet
 *     for at alt regnes om.
 *
 * Nodeindekseringen er identisk med Nettverk (innganger, bias, deretter
 * ut+skjulte i id-orden), og `bekreftMotNettverk` sjekker at utgangene
 * stemmer – dette er en kopi, ikke en omskrivning.
 */
class FlatNett {
  readonly antallInn: number;
  readonly antallUt: number;
  readonly antallNoder: number;
  readonly pass: number;
  /** Node-indeks per utgangsnummer. */
  readonly utIdx: Int32Array;
  /** Kant → kildenode, målnode, vekt, indeks i genom.koblinger. */
  readonly kantFra: Int32Array;
  readonly kantTil: Int32Array;
  readonly kantVekt: Float64Array;
  readonly kantGen: Int32Array;
  readonly antallKanter: number;
  /** CSR: kanter INN til node n er innKant[innStart[n] .. innStart[n+1]). */
  private readonly innStart: Int32Array;
  private readonly innKant: Int32Array;
  /** CSR: kanter UT fra node n. */
  private readonly utStart: Int32Array;
  private readonly utKant: Int32Array;

  /** verdi[p][node] etter pass p (p = 0 er inngangene). */
  private readonly verdi: Float64Array[];
  /** sum[p][node] = pre-aktiveringen i pass p (p ≥ 1). */
  private readonly sum: Float64Array[];

  // Arbeidsbuffere for delta-forplantningen (allokeres én gang).
  private readonly dS: Float64Array;
  private readonly dSMerke: Int32Array;
  private readonly dSListe: Int32Array;
  private merkeA: Int32Array;
  private merkeB: Int32Array;
  private verdiA: Float64Array;
  private verdiB: Float64Array;
  private listeA: Int32Array;
  private listeB: Int32Array;
  private stempel = 0;
  private dStempel = 0;
  private sisteMerke: Int32Array;
  private sisteVerdi: Float64Array;
  private sisteStempel = -1;
  /** Fullt reaktiveringsbuffer (kun for --sjekk). */
  private readonly fullA: Float64Array;
  private readonly fullB: Float64Array;

  constructor(g: Genom, maksPass = 8) {
    this.antallInn = g.antallInn;
    this.antallUt = g.antallUt;

    const nodeIdx = new Map<number, number>();
    let idx = 0;
    for (let i = 0; i < g.antallInn; i++) nodeIdx.set(i, idx++);
    nodeIdx.set(biasId(g.antallInn), idx++);
    const øvrige = g.noder
      .filter((n) => n.type === "ut" || n.type === "skjult")
      .sort((x, y) => x.id - y.id);
    for (const n of øvrige) if (!nodeIdx.has(n.id)) nodeIdx.set(n.id, idx++);
    this.antallNoder = idx;

    const fra: number[] = [];
    const til: number[] = [];
    const vekt: number[] = [];
    const gen: number[] = [];
    for (let i = 0; i < g.koblinger.length; i++) {
      const k = g.koblinger[i]!;
      if (!k.aktiv) continue;
      const f = nodeIdx.get(k.inn);
      const t = nodeIdx.get(k.ut);
      if (f === undefined || t === undefined) continue;
      if (t < this.antallInn + 1) continue; // innganger/bias kan ikke være mål
      fra.push(f);
      til.push(t);
      vekt.push(k.vekt);
      gen.push(i);
    }
    this.antallKanter = fra.length;
    this.kantFra = Int32Array.from(fra);
    this.kantTil = Int32Array.from(til);
    this.kantVekt = Float64Array.from(vekt);
    this.kantGen = Int32Array.from(gen);

    this.innStart = byggCsrStart(this.kantTil, this.antallNoder);
    this.innKant = byggCsrKanter(this.kantTil, this.innStart);
    this.utStart = byggCsrStart(this.kantFra, this.antallNoder);
    this.utKant = byggCsrKanter(this.kantFra, this.utStart);

    this.utIdx = new Int32Array(g.antallUt);
    for (let j = 0; j < g.antallUt; j++) this.utIdx[j] = nodeIdx.get(utId(g.antallInn, j))!;

    const skjulte = this.antallNoder - (this.antallInn + 1) - this.antallUt;
    this.pass = Math.min(maksPass, 2 + skjulte);

    this.verdi = Array.from({ length: this.pass + 1 }, () => new Float64Array(this.antallNoder));
    this.sum = Array.from({ length: this.pass + 1 }, () => new Float64Array(this.antallNoder));

    this.dS = new Float64Array(this.antallNoder);
    this.dSMerke = new Int32Array(this.antallNoder).fill(-1);
    this.dSListe = new Int32Array(this.antallNoder);
    this.merkeA = new Int32Array(this.antallNoder).fill(-1);
    this.merkeB = new Int32Array(this.antallNoder).fill(-1);
    this.verdiA = new Float64Array(this.antallNoder);
    this.verdiB = new Float64Array(this.antallNoder);
    this.listeA = new Int32Array(this.antallNoder);
    this.listeB = new Int32Array(this.antallNoder);
    this.sisteMerke = this.merkeA;
    this.sisteVerdi = this.verdiA;
    this.fullA = new Float64Array(this.antallNoder);
    this.fullB = new Float64Array(this.antallNoder);
  }

  /** Kjører nettet og lagrer alle pass. Returnerer utgangsverdiene. */
  aktiver(inn: readonly number[]): Float64Array {
    const v0 = this.verdi[0]!;
    v0.fill(0);
    for (let i = 0; i < this.antallInn; i++) v0[i] = inn[i]!;
    v0[this.antallInn] = 1; // bias
    for (let p = 1; p <= this.pass; p++) {
      const les = this.verdi[p - 1]!;
      const skriv = this.verdi[p]!;
      const s = this.sum[p]!;
      // Inngangene og bias er faste gjennom alle pass (Nettverk skriver aldri
      // til indeks < antallInn+1 i noen av bufferne sine).
      for (let i = 0; i <= this.antallInn; i++) skriv[i] = v0[i]!;
      for (let n = this.antallInn + 1; n < this.antallNoder; n++) {
        let sum = 0;
        for (let e = this.innStart[n]!; e < this.innStart[n + 1]!; e++) {
          const k = this.innKant[e]!;
          sum += les[this.kantFra[k]!]! * this.kantVekt[k]!;
        }
        s[n] = sum;
        skriv[n] = Math.tanh(sum);
      }
    }
    const siste = this.verdi[this.pass]!;
    const ut = new Float64Array(this.antallUt);
    for (let j = 0; j < this.antallUt; j++) ut[j] = siste[this.utIdx[j]!]!;
    return ut;
  }

  /** Utgangsverdi nr. `j` fra siste `aktiver`. */
  basisUt(j: number): number {
    return this.verdi[this.pass]![this.utIdx[j]!]!;
  }

  /**
   * EKSAKT ABLASJON av kant `kant`, ved delta-forplantning fra siste
   * `aktiver`-kall. Etterpå gir `utEtter(j)` utgangsverdien uten kanten.
   *
   * Prinsipp: basissummen i hver node er kjent. Å nulle kanten trekker fra
   * dens bidrag i målnoden i HVERT pass (kilden kan selv ha endret seg), og
   * enhver node som får ny verdi sender differansen videre langs utgående
   * kanter. Noder som ikke endrer seg røres ikke – det er derfor dette er
   * raskt uten å være en tilnærming.
   */
  abler(kant: number): void {
    const t = this.kantTil[kant]!;
    const s = this.kantFra[kant]!;
    const w = this.kantVekt[kant]!;

    let prevMerke = this.merkeA;
    let prevVerdi = this.verdiA;
    let prevListe = this.listeA;
    let curMerke = this.merkeB;
    let curVerdi = this.verdiB;
    let curListe = this.listeB;
    let prevAnt = 0;
    let prevStempel = ++this.stempel; // pass 0: ingenting er endret ennå

    for (let p = 1; p <= this.pass; p++) {
      const curStempel = ++this.stempel;
      const dStempel = ++this.dStempel;
      let curAnt = 0;
      let dAnt = 0;
      const forrige = this.verdi[p - 1]!;

      // 1) Forplant endringene fra forrige pass langs utgående kanter.
      for (let i = 0; i < prevAnt; i++) {
        const n = prevListe[i]!;
        const d = prevVerdi[n]! - forrige[n]!;
        if (d === 0) continue;
        for (let e = this.utStart[n]!; e < this.utStart[n + 1]!; e++) {
          const kk = this.utKant[e]!;
          const m = this.kantTil[kk]!;
          if (this.dSMerke[m] !== dStempel) {
            this.dSMerke[m] = dStempel;
            this.dS[m] = 0;
            this.dSListe[dAnt++] = m;
          }
          this.dS[m] = this.dS[m]! + d * this.kantVekt[kk]!;
        }
      }

      // 2) Fjern den ablerte kantens eget bidrag i målnoden. Kildeverdien er
      //    den GJELDENDE (endrede) verdien hvis kilden selv ligger i deltaen –
      //    da har steg 1 allerede lagt inn endringen over samme kant, og vi
      //    trekker fra hele det oppdaterte bidraget.
      const vs = prevMerke[s] === prevStempel ? prevVerdi[s]! : forrige[s]!;
      if (vs !== 0) {
        if (this.dSMerke[t] !== dStempel) {
          this.dSMerke[t] = dStempel;
          this.dS[t] = 0;
          this.dSListe[dAnt++] = t;
        }
        this.dS[t] = this.dS[t]! - vs * w;
      }

      // 3) Nye verdier for de berørte nodene.
      const basis = this.verdi[p]!;
      const sp = this.sum[p]!;
      for (let i = 0; i < dAnt; i++) {
        const m = this.dSListe[i]!;
        const d = this.dS[m]!;
        if (d === 0) continue;
        const ny = Math.tanh(sp[m]! + d);
        // EKSAKT likhet her, ikke NULLGRENSE. Målt: å kutte kjeden på en
        // terskel (1e-12) ga spredning 894–902 døde koblinger på d5 mot 902–903
        // med eksakt likhet – om en kjede kuttes ett pass tidlig gir utslag
        // langt større enn terskelen selv. Terskelen hører hjemme i MÅLINGEN,
        // ikke i forplantningen.
        if (ny === basis[m]!) continue;
        curMerke[m] = curStempel;
        curVerdi[m] = ny;
        curListe[curAnt++] = m;
      }

      const tm = prevMerke;
      prevMerke = curMerke;
      curMerke = tm;
      const tv = prevVerdi;
      prevVerdi = curVerdi;
      curVerdi = tv;
      const tl = prevListe;
      prevListe = curListe;
      curListe = tl;
      prevAnt = curAnt;
      prevStempel = curStempel;
      if (prevAnt === 0) break; // ingenting endret seg – kanten er død herfra
    }

    this.merkeA = prevMerke;
    this.verdiA = prevVerdi;
    this.listeA = prevListe;
    this.merkeB = curMerke;
    this.verdiB = curVerdi;
    this.listeB = curListe;
    this.sisteMerke = prevMerke;
    this.sisteVerdi = prevVerdi;
    this.sisteStempel = prevStempel;
  }

  /** Utgangsverdi nr. `j` etter siste `abler`. */
  utEtter(j: number): number {
    const n = this.utIdx[j]!;
    return this.sisteMerke[n] === this.sisteStempel ? this.sisteVerdi[n]! : this.verdi[this.pass]![n]!;
  }

  /**
   * Full reaktivering med kanten slått av – referansen `--sjekk` måler
   * delta-forplantningen mot. Treg, brukes bare til verifisering.
   */
  aktiverUten(inn: readonly number[], kant: number, j: number): number {
    let les = this.fullA;
    let skriv = this.fullB;
    les.fill(0);
    skriv.fill(0);
    for (let i = 0; i < this.antallInn; i++) {
      les[i] = inn[i]!;
      skriv[i] = inn[i]!;
    }
    les[this.antallInn] = 1;
    skriv[this.antallInn] = 1;
    for (let p = 0; p < this.pass; p++) {
      for (let n = this.antallInn + 1; n < this.antallNoder; n++) {
        let sum = 0;
        for (let e = this.innStart[n]!; e < this.innStart[n + 1]!; e++) {
          const k = this.innKant[e]!;
          if (k === kant) continue;
          sum += les[this.kantFra[k]!]! * this.kantVekt[k]!;
        }
        skriv[n] = Math.tanh(sum);
      }
      const tmp = les;
      les = skriv;
      skriv = tmp;
    }
    return les[this.utIdx[j]!]!;
  }
}

function byggCsrStart(nøkkel: Int32Array, antallNoder: number): Int32Array {
  const start = new Int32Array(antallNoder + 1);
  for (let i = 0; i < nøkkel.length; i++) start[nøkkel[i]! + 1]!++;
  for (let n = 0; n < antallNoder; n++) start[n + 1] = start[n + 1]! + start[n]!;
  return start;
}

function byggCsrKanter(nøkkel: Int32Array, start: Int32Array): Int32Array {
  const teller = Int32Array.from(start.subarray(0, start.length - 1));
  const kanter = new Int32Array(nøkkel.length);
  for (let i = 0; i < nøkkel.length; i++) kanter[teller[nøkkel[i]!]!++] = i;
  return kanter;
}

// ---------------------------------------------------------------------------
// Oppstart: nett, benk, referansehjerne
// ---------------------------------------------------------------------------

const flat = new FlatNett(genom);
const aktiveKoblinger = genom.koblinger.filter((k) => k.aktiv).length;
console.log(
  `Genom ${genomFil}: ${genom.noder.length} noder, ${genom.koblinger.length} koblinger ` +
    `(${aktiveKoblinger} aktive), ${flat.antallKanter} kanter i nettet, ${flat.pass} pass.`,
);

// Kontroll mot den ekte Nettverk-klassen: FlatNett er en kopi, og hvis den
// avviker er alle tallene under verdiløse.
{
  const referanse = new Nettverk(genom);
  const prøve = Array.from({ length: genom.antallInn }, (_, i) => Math.sin(i * 1.7) * 0.5 + 0.5);
  const a = referanse.aktiver(prøve);
  const b = flat.aktiver(prøve);
  let maks = 0;
  for (let j = 0; j < a.length; j++) maks = Math.max(maks, Math.abs(a[j]! - b[j]!));
  if (maks > 1e-12) {
    console.error(`FlatNett avviker fra Nettverk (maks ${maks.toExponential(2)}) – avbryter.`);
    process.exit(1);
  }
  console.log(`FlatNett = Nettverk (maks avvik ${maks.toExponential(1)}).`);
}

const benk: Benkstilling[] = lesBenk(benkMappe, antall, steg);
if (benk.length === 0) {
  console.error(`Fant ingen stillinger i ${benkMappe}/*.jsonl`);
  process.exit(1);
}

// Skrives benken akkurat nå? Da er den ikke en fast benk, og to kjøringer
// leser ikke helt samme stillinger. Verdt å si fra om i stedet for å la
// leseren tro at små forskjeller mellom kjøringer betyr noe.
const benkLevende = ((): boolean => {
  const nå = Date.now();
  try {
    return readdirSync(benkMappe)
      .filter((f) => f.endsWith(".jsonl"))
      .some((f) => nå - statSync(`${benkMappe}/${f}`).mtimeMs < 120_000);
  } catch {
    return false;
  }
})();

const hjerne = nevroHjerne();

// ---------------------------------------------------------------------------
// Klassifiser stillingene: GOD / DÅRLIG / likegyldig
// ---------------------------------------------------------------------------

interface Stilling {
  readonly nt: readonly number[];
  readonly lovlige: number[];
  /** Kortet genomet spiller. */
  readonly valgt: number;
  /** Orakelets beste kort. */
  readonly fasit: number;
  /** Fasitens verdi minus valgt korts verdi (anger, i egenpoeng). */
  readonly anger: number;
  readonly god: boolean;
}

const gode: Stilling[] = [];
const dårlige: Stilling[] = [];
let uegnet = 0; // uten `nt` (eldre datasett) eller uten `t`
let forFåLovlige = 0;
let likegyldige = 0;
let treffOrakel = 0;
let treffNevro = 0;
let nevroTreffOrakel = 0;
let vurdert = 0;
let sumAnger = 0;

for (const s of benk) {
  if (s.nt === undefined || s.nt.length !== genom.antallInn) {
    uegnet++;
    continue;
  }
  const lovlige = Object.keys(s.v).map(Number);
  if (lovlige.length < 2) {
    forFåLovlige++;
    continue;
  }
  let fasit = lovlige[0]!;
  for (const k of lovlige) if (s.v[String(k)]! > s.v[String(fasit)]!) fasit = k;

  const ut = flat.aktiver(s.nt);
  let valgt = lovlige[0]!;
  for (const k of lovlige) if (ut[UT_KORT + k]! > ut[UT_KORT + valgt]!) valgt = k;

  // NevroHjernes spillnett tar de 238 første leddene av E1-vektoren – samme
  // kall som examples/neat-anger.ts bruker. NevroAgent selv trenger en hel
  // GameState, som benken ikke lagrer; nettet er den samme hjernen.
  const logits = forover(hjerne.spill, Float32Array.from(s.t.slice(0, 238)));
  let nevroValg = lovlige[0]!;
  for (const k of lovlige) if (logits[k]! > logits[nevroValg]!) nevroValg = k;

  const anger = s.v[String(fasit)]! - s.v[String(valgt)]!;
  vurdert++;
  sumAnger += anger;
  if (valgt === fasit) treffOrakel++;
  if (valgt === nevroValg) treffNevro++;
  if (nevroValg === fasit) nevroTreffOrakel++;

  const god = anger < 1e-6;
  if (god) gode.push({ nt: s.nt, lovlige, valgt, fasit, anger, god: true });
  else if (anger >= margin) dårlige.push({ nt: s.nt, lovlige, valgt, fasit, anger, god: false });
  else likegyldige++;
}

console.log(
  `\nBenk ${benkMappe}: ${benk.length} stillinger lest, ${vurdert} vurdert. ` +
    `Hoppet over ${uegnet} uten NEAT-vektor (nt) og ${forFåLovlige} med < 2 lovlige kort.`,
);
console.log(
  `GODE (= orakelet): ${gode.length}   DÅRLIGE (avvik ≥ ${margin} poeng): ${dårlige.length}   ` +
    `likegyldige avvik: ${likegyldige}`,
);

if (gode.length === 0 && dårlige.length === 0) {
  console.error("Ingen stillinger å tilskrive gener til – avbryter.");
  process.exit(1);
}

// Balansert utvalg: ablasjonen er den dyre delen, og en skjev fordeling ville
// gjort god- og dårlig-summene usammenlignbare i seg selv (de normaliseres
// riktignok per stilling under, men støyen ville vært skjev).
const halv = Math.max(1, Math.floor(maksAblasjon / 2));
const brukGode = gode.slice(0, Math.min(gode.length, Math.max(halv, maksAblasjon - dårlige.length)));
const brukDårlige = dårlige.slice(
  0,
  Math.min(dårlige.length, Math.max(halv, maksAblasjon - brukGode.length)),
);

// ---------------------------------------------------------------------------
// Ablasjon: bidrag per kobling
// ---------------------------------------------------------------------------

/**
 * To mål per kobling, begge fra samme ablasjon:
 *  - `bidrag`: hvor mye det VALGTE kortets utgang faller når koblingen nulles.
 *    Positivt = koblingen løfter det valgte kortet.
 *  - `margin`: hvor mye FORSPRANGET til nest beste lovlige kort faller.
 *    Dette er det beslutningsrelevante målet – en kobling kan løfte alle 52
 *    kortutgangene like mye uten å påvirke valget i det hele tatt.
 */
const godBidrag = new Float64Array(flat.antallKanter);
const godMargin = new Float64Array(flat.antallKanter);
const dårligBidrag = new Float64Array(flat.antallKanter);
const dårligMargin = new Float64Array(flat.antallKanter);
/** Antall stillinger der koblingen i det hele tatt flyttet noe. */
const godAktiv = new Int32Array(flat.antallKanter);
const dårligAktiv = new Int32Array(flat.antallKanter);

let sjekkMaksAvvik = 0;
let sjekkAntall = 0;

function ablerStilling(
  st: Stilling,
  bidrag: Float64Array,
  marginSum: Float64Array,
  aktivTeller: Int32Array,
): void {
  flat.aktiver(st.nt);
  const j = UT_KORT + st.valgt;
  const basisValgt = flat.basisUt(j);
  let basisNest = -Infinity;
  for (const k of st.lovlige) {
    if (k === st.valgt) continue;
    basisNest = Math.max(basisNest, flat.basisUt(UT_KORT + k));
  }
  const basisMargin = basisValgt - basisNest;

  for (let e = 0; e < flat.antallKanter; e++) {
    flat.abler(e);
    const etterValgt = flat.utEtter(j);
    // Marginen må måles selv når det valgte kortet står stille: en kobling
    // kan ha løftet en KONKURRENT, og da har den flyttet valget like fullt.
    let etterNest = -Infinity;
    for (const k of st.lovlige) {
      if (k === st.valgt) continue;
      etterNest = Math.max(etterNest, flat.utEtter(UT_KORT + k));
    }
    const dBidrag = basisValgt - etterValgt;
    const dMargin = basisMargin - (etterValgt - etterNest);
    if (Math.abs(dBidrag) < NULLGRENSE && Math.abs(dMargin) < NULLGRENSE) continue;
    bidrag[e] = bidrag[e]! + dBidrag;
    marginSum[e] = marginSum[e]! + dMargin;
    aktivTeller[e] = aktivTeller[e]! + 1;

    if (sjekk && sjekkAntall < 300) {
      // aktiverUten bruker egne buffere, så basis-passene er intakte.
      const fasit = flat.aktiverUten(st.nt, e, j);
      sjekkMaksAvvik = Math.max(sjekkMaksAvvik, Math.abs(fasit - etterValgt));
      sjekkAntall++;
    }
  }
}

const t0 = performance.now();
const totaltStillinger = brukGode.length + brukDårlige.length;
console.log(
  `\nAblerer ${flat.antallKanter} kanter × ${totaltStillinger} stillinger ` +
    `(${brukGode.length} gode + ${brukDårlige.length} dårlige) …`,
);
let ferdig = 0;
const framdrift = (): void => {
  ferdig++;
  if (ferdig % 25 === 0 || ferdig === totaltStillinger) {
    const brukt = (performance.now() - t0) / 1000;
    const igjen = (brukt / ferdig) * (totaltStillinger - ferdig);
    console.log(`  ${ferdig}/${totaltStillinger} (${brukt.toFixed(0)}s, ~${igjen.toFixed(0)}s igjen)`);
  }
};
for (const st of brukGode) {
  ablerStilling(st, godBidrag, godMargin, godAktiv);
  framdrift();
}
for (const st of brukDårlige) {
  ablerStilling(st, dårligBidrag, dårligMargin, dårligAktiv);
  framdrift();
}
if (sjekk) {
  console.log(
    `--sjekk: delta-forplantning mot full reaktivering på ${sjekkAntall} ablasjoner, ` +
      `maks avvik ${sjekkMaksAvvik.toExponential(2)}.`,
  );
}

// ---------------------------------------------------------------------------
// Aggregering per innovasjonsnummer
// ---------------------------------------------------------------------------

interface Rad {
  innovasjon: number;
  inn: number;
  ut: number;
  vekt: number;
  goodContribution: number;
  badContribution: number;
  goodMargin: number;
  badMargin: number;
  /** Andel av de gode/dårlige stillingene der koblingen flyttet noe. */
  goodAndel: number;
  badAndel: number;
  /**
   * RANGERINGEN: god − dårlig på MARGINEN. Marginen er valgt framfor råbidraget
   * fordi det er den som avgjør valget – en kobling som løfter alle 52
   * kortutganger like mye har stort råbidrag og null innflytelse på hvilket
   * kort som spilles.
   */
  score: number;
  scoreNorm: number;
  /** Samme differanse på råbidraget (endring i det valgte kortets utgang). */
  scoreBidrag: number;
  scoreBidragNorm: number;
}

// Summene deles på antall stillinger i hver klasse, ellers ville den største
// klassen dominert scoren uansett innhold.
const nGod = Math.max(1, brukGode.length);
const nDårlig = Math.max(1, brukDårlige.length);

const perInnovasjon = new Map<number, Rad>();
for (let e = 0; e < flat.antallKanter; e++) {
  const kobling = genom.koblinger[flat.kantGen[e]!]!;
  const g = godBidrag[e]! / nGod;
  const d = dårligBidrag[e]! / nDårlig;
  const gm = godMargin[e]! / nGod;
  const dm = dårligMargin[e]! / nDårlig;
  // Flere kanter kan i prinsippet dele innovasjonsnummer (duplikatgener etter
  // krysning). Da summeres de – de arves som én enhet uansett.
  const eksisterende = perInnovasjon.get(kobling.innovasjon);
  if (eksisterende !== undefined) {
    eksisterende.goodContribution += g;
    eksisterende.badContribution += d;
    eksisterende.goodMargin += gm;
    eksisterende.badMargin += dm;
    eksisterende.goodAndel += godAktiv[e]! / nGod;
    eksisterende.badAndel += dårligAktiv[e]! / nDårlig;
    continue;
  }
  perInnovasjon.set(kobling.innovasjon, {
    innovasjon: kobling.innovasjon,
    inn: kobling.inn,
    ut: kobling.ut,
    vekt: kobling.vekt,
    goodContribution: g,
    badContribution: d,
    goodMargin: gm,
    badMargin: dm,
    goodAndel: godAktiv[e]! / nGod,
    badAndel: dårligAktiv[e]! / nDårlig,
    score: 0,
    scoreNorm: 0,
    scoreBidrag: 0,
    scoreBidragNorm: 0,
  });
}

const rader = [...perInnovasjon.values()];
for (const r of rader) {
  r.score = r.goodMargin - r.badMargin;
  r.scoreBidrag = r.goodContribution - r.badContribution;
}
const maksAbs = rader.reduce((m, r) => Math.max(m, Math.abs(r.score)), 0);
const maksAbsB = rader.reduce((m, r) => Math.max(m, Math.abs(r.scoreBidrag)), 0);
for (const r of rader) {
  r.scoreNorm = maksAbs > 0 ? r.score / maksAbs : 0;
  r.scoreBidragNorm = maksAbsB > 0 ? r.scoreBidrag / maksAbsB : 0;
}
rader.sort((a, b) => b.score - a.score);

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const linjer: string[] = [];
const si = (s: string): void => {
  console.log(s);
  linjer.push(s);
};

si("");
si("=".repeat(78));
si(`GENANALYSE  ${genomFil}   benk ${benkMappe}`);
si("=".repeat(78));
si(`Stillinger lest              ${benk.length}`);
si(`  hoppet over (mangler nt)   ${uegnet}`);
si(`  hoppet over (< 2 lovlige)  ${forFåLovlige}`);
si(`Vurdert                      ${vurdert}`);
si(`Snittanger (egenpoeng)       ${(sumAnger / Math.max(1, vurdert)).toFixed(4)}`);
si(`Treff mot orakelet           ${((100 * treffOrakel) / Math.max(1, vurdert)).toFixed(1)} % (${treffOrakel}/${vurdert})`);
si(`Treff mot NevroHjerne        ${((100 * treffNevro) / Math.max(1, vurdert)).toFixed(1)} % (${treffNevro}/${vurdert})`);
si(`NevroHjerne mot orakelet     ${((100 * nevroTreffOrakel) / Math.max(1, vurdert)).toFixed(1)} % (referansemålestokk)`);
si(`GODE stillinger              ${gode.length} (ablert: ${brukGode.length})`);
si(`DÅRLIGE stillinger (≥ ${margin} p) ${dårlige.length} (ablert: ${brukDårlige.length})`);
si(`Likegyldige avvik            ${likegyldige}`);
si(`Koblinger analysert          ${flat.antallKanter} kanter → ${rader.length} innovasjonsnumre`);
si(`Ablasjonstid                 ${((performance.now() - t0) / 1000).toFixed(0)} s`);
if (benkLevende) {
  si("");
  si(
    `ADVARSEL: ${benkMappe} ble skrevet til under kjøringen (orakelgeneratoren går).`,
  );
  si("Benken er dermed ikke fast – sammenlign bare genomer fra SAMME kjøring.");
}
si("");

const skriv = (r: Rad): string =>
  `  innov ${String(r.innovasjon).padStart(6)}  ${String(r.inn).padStart(4)}→${String(r.ut).padStart(4)}` +
  `  vekt ${r.vekt.toFixed(3).padStart(7)}` +
  `  god ${r.goodMargin.toExponential(2).padStart(10)}` +
  `  dårlig ${r.badMargin.toExponential(2).padStart(10)}` +
  `  score ${r.scoreNorm.toFixed(4).padStart(8)}`;

si("15 MEST SKADELIGE koblinger (bærer de dårlige valgene mest):");
for (const r of rader.slice(-15).reverse()) si(skriv(r));
si("");
si("15 MEST NYTTIGE koblinger (bærer de gode valgene mest):");
for (const r of rader.slice(0, 15)) si(skriv(r));
si("");

// Hvor mye av genomet er i det hele tatt i spill? Hvis nesten alle koblinger
// har score ~0 er selektiv arv billig; hvis alt bidrar er den dyr.
const døde = rader.filter((r) => r.goodAndel === 0 && r.badAndel === 0).length;
si(
  `${døde} av ${rader.length} koblinger (${((100 * døde) / rader.length).toFixed(0)} %) ` +
    `flyttet INGENTING i noen av stillingene – de er ekte døde i kortspillet.`,
);

// ---------------------------------------------------------------------------
// Filer (aldri bare stdout – se LANGKJØRINGER-notatet)
// ---------------------------------------------------------------------------

const mappe = dirname(utFil);
if (mappe !== "" && mappe !== ".") mkdirSync(mappe, { recursive: true });

writeFileSync(
  utFil,
  JSON.stringify(
    {
      genom: genomFil,
      benk: benkMappe,
      antall,
      steg,
      margin,
      stillingerLest: benk.length,
      hoppetOverUtenNt: uegnet,
      hoppetOverForFaaLovlige: forFåLovlige,
      vurdert,
      snittanger: sumAnger / Math.max(1, vurdert),
      treffOrakel: treffOrakel / Math.max(1, vurdert),
      treffNevro: treffNevro / Math.max(1, vurdert),
      nevroTreffOrakel: nevroTreffOrakel / Math.max(1, vurdert),
      gode: gode.length,
      daarlige: dårlige.length,
      likegyldige,
      ablertGode: brukGode.length,
      ablertDaarlige: brukDårlige.length,
      koblinger: rader,
    },
    null,
    1,
  ),
);
const txtFil = utFil.replace(/\.json$/, "") + ".txt";
writeFileSync(txtFil, linjer.join("\n") + "\n");
console.log(`Skrev ${utFil} og ${txtFil}`);
