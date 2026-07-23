/**
 * NEAT-genom: NeuroEvolution of Augmenting Topologies.
 *
 * Et genom er en liste nodegener (nevroner) og koblingsgener (synapser).
 * Hvert koblingsgen bærer et historisk innovasjonsnummer som gjør at to
 * vilkårlige genomer kan linjeres opp gen for gen – grunnlaget for både
 * kryssing og artsavstand (speciation), akkurat som i Stanley & Miikkulainen
 * (2002). Topologien VOKSER over tid: populasjonen starter minimal (glisne
 * inn→ut-koblinger) og mutasjoner legger til nye nevroner og koblinger.
 *
 * Alt er avhengighetsfritt, deterministisk gitt en injisert RNG, og
 * JSON-serialiserbart (lagre/laste mestergenomer).
 */

export type NodeType = "inn" | "bias" | "skjult" | "ut";

export interface NodeGen {
  readonly id: number;
  readonly type: NodeType;
}

export interface KoblingGen {
  /** Node koblingen går FRA. */
  inn: number;
  /** Node koblingen går TIL. */
  ut: number;
  vekt: number;
  aktiv: boolean;
  /** Historisk markør – samme strukturelle nyvinning får samme nummer. */
  readonly innovasjon: number;
}

export interface Genom {
  readonly antallInn: number;
  readonly antallUt: number;
  noder: NodeGen[];
  koblinger: KoblingGen[];
}

/** Node-id for bias-noden (alltid verdien 1.0). */
export function biasId(antallInn: number): number {
  return antallInn;
}

/** Node-id for utgang nr. j. */
export function utId(antallInn: number, j: number): number {
  return antallInn + 1 + j;
}

/** Første ledige id for skjulte noder. */
export function førsteSkjulteId(antallInn: number, antallUt: number): number {
  return antallInn + 1 + antallUt;
}

// ---------------------------------------------------------------------------
// Innovasjonsbok – felles historikk for hele populasjonen
// ---------------------------------------------------------------------------

/**
 * Deler ut innovasjonsnumre og node-id-er. Samme strukturelle mutasjon
 * (samme inn→ut-kobling, eller splitting av samme kobling) får samme
 * nummer uansett hvilket genom den skjer i – slik kan gener linjeres opp
 * på tvers av hele populasjonen.
 */
export class Innovasjonsbok {
  private nesteInnovasjon = 0;
  private nesteNodeId: number;
  private readonly koblingsNr = new Map<string, number>();
  private readonly splittNode = new Map<number, number>();
  private readonly splittKoblinger = new Map<number, { innTilNy: number; nyTilUt: number }>();

  constructor(antallInn: number, antallUt: number) {
    this.nesteNodeId = førsteSkjulteId(antallInn, antallUt);
  }

  /**
   * Flytter tellerne forbi et eksisterende genom (ved gjenopptatt trening
   * fra fil), slik at nye innovasjoner aldri kolliderer med gamle.
   */
  hoppOver(genom: Genom): void {
    for (const k of genom.koblinger) {
      this.nesteInnovasjon = Math.max(this.nesteInnovasjon, k.innovasjon + 1);
    }
    for (const n of genom.noder) {
      this.nesteNodeId = Math.max(this.nesteNodeId, n.id + 1);
    }
  }

  /** Innovasjonsnummer for koblingen fra→til (gjenbrukes ved samme par). */
  kobling(fra: number, til: number): number {
    const nøkkel = `${fra}>${til}`;
    let nr = this.koblingsNr.get(nøkkel);
    if (nr === undefined) {
      nr = this.nesteInnovasjon++;
      this.koblingsNr.set(nøkkel, nr);
    }
    return nr;
  }

  /**
   * Node-id + koblingsnumre for å splitte koblingen med gitt
   * innovasjonsnummer. Samme splitt gir samme node-id i hele populasjonen.
   */
  splitt(koblingsInnovasjon: number, fra: number, til: number): {
    nodeId: number;
    innTilNy: number;
    nyTilUt: number;
  } {
    let nodeId = this.splittNode.get(koblingsInnovasjon);
    if (nodeId === undefined) {
      nodeId = this.nesteNodeId++;
      this.splittNode.set(koblingsInnovasjon, nodeId);
      this.splittKoblinger.set(koblingsInnovasjon, {
        innTilNy: this.kobling(fra, nodeId),
        nyTilUt: this.kobling(nodeId, til),
      });
    }
    const k = this.splittKoblinger.get(koblingsInnovasjon)!;
    return { nodeId, innTilNy: k.innTilNy, nyTilUt: k.nyTilUt };
  }
}

// ---------------------------------------------------------------------------
// Opprettelse
// ---------------------------------------------------------------------------

function gaussisk(rng: () => number): number {
  // Box–Muller (én verdi). rng() antas uniform [0,1).
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Minimalt startgenom: hver utgang kobles til bias + `koblingerPerUt`
 * tilfeldige innganger. NEAT starter med ENKLE nett og lar kompleksiteten
 * vokse («augmenting topologies») – med mange innganger/utganger ville full
 * tilkobling gitt et uhåndterlig stort søkeområde fra dag én.
 */
export function nyttGenom(
  antallInn: number,
  antallUt: number,
  bok: Innovasjonsbok,
  rng: () => number,
  koblingerPerUt = 5,
): Genom {
  const noder: NodeGen[] = [];
  for (let i = 0; i < antallInn; i++) noder.push({ id: i, type: "inn" });
  noder.push({ id: biasId(antallInn), type: "bias" });
  for (let j = 0; j < antallUt; j++) noder.push({ id: utId(antallInn, j), type: "ut" });

  const koblinger: KoblingGen[] = [];
  for (let j = 0; j < antallUt; j++) {
    const til = utId(antallInn, j);
    koblinger.push({
      inn: biasId(antallInn),
      ut: til,
      vekt: gaussisk(rng) * 0.5,
      aktiv: true,
      innovasjon: bok.kobling(biasId(antallInn), til),
    });
    const brukt = new Set<number>();
    for (let k = 0; k < koblingerPerUt; k++) {
      const fra = Math.floor(rng() * antallInn);
      if (brukt.has(fra)) continue;
      brukt.add(fra);
      koblinger.push({
        inn: fra,
        ut: til,
        vekt: gaussisk(rng) * 0.5,
        aktiv: true,
        innovasjon: bok.kobling(fra, til),
      });
    }
  }
  return { antallInn, antallUt, noder, koblinger };
}

export function klonGenom(g: Genom): Genom {
  return {
    antallInn: g.antallInn,
    antallUt: g.antallUt,
    noder: g.noder.map((n) => ({ ...n })),
    koblinger: g.koblinger.map((k) => ({ ...k })),
  };
}

// ---------------------------------------------------------------------------
// Mutasjoner
// ---------------------------------------------------------------------------

export interface MutasjonsRater {
  /** Sjanse for å perturbere vektene (per genom). */
  readonly vekter: number;
  /** Sjanse per vekt for HELT ny verdi (ellers liten perturbasjon). */
  readonly nyVekt: number;
  /** Standardavvik for perturbasjonen. */
  readonly styrke: number;
  /** Sjanse for å legge til en ny kobling. */
  readonly nyKobling: number;
  /** Sjanse for å splitte en kobling med en ny node. */
  readonly nyNode: number;
  /** Sjanse for å skru en tilfeldig kobling av/på. */
  readonly veksle: number;
}

export const STANDARD_RATER: MutasjonsRater = {
  vekter: 0.8,
  nyVekt: 0.1,
  styrke: 0.35,
  nyKobling: 0.35,
  nyNode: 0.08,
  veksle: 0.03,
};

export function muterVekter(g: Genom, rng: () => number, rater: MutasjonsRater): void {
  for (const k of g.koblinger) {
    if (rng() < rater.nyVekt) k.vekt = gaussisk(rng);
    else k.vekt += gaussisk(rng) * rater.styrke;
    if (k.vekt > 8) k.vekt = 8;
    if (k.vekt < -8) k.vekt = -8;
  }
}

/**
 * Legger til en ny kobling mellom to eksisterende noder. Rekurrente
 * koblinger (bakover, selvsløyfer, ut→skjult) er LOV – nettverket
 * aktiveres iterativt og håndterer dem (se nett.ts). Inngangs-/biasnoder
 * kan ikke være mål.
 */
export function muterNyKobling(
  g: Genom,
  bok: Innovasjonsbok,
  rng: () => number,
  forsøk = 30,
): boolean {
  const kilder = g.noder;
  const mål = g.noder.filter((n) => n.type === "skjult" || n.type === "ut");
  const finnes = new Set(g.koblinger.map((k) => `${k.inn}>${k.ut}`));
  for (let t = 0; t < forsøk; t++) {
    const fra = kilder[Math.floor(rng() * kilder.length)]!;
    const til = mål[Math.floor(rng() * mål.length)]!;
    if (finnes.has(`${fra.id}>${til.id}`)) continue;
    g.koblinger.push({
      inn: fra.id,
      ut: til.id,
      vekt: gaussisk(rng),
      aktiv: true,
      innovasjon: bok.kobling(fra.id, til.id),
    });
    return true;
  }
  return false;
}

/**
 * Splitter en aktiv kobling med en ny skjult node: gammel kobling skrus av,
 * inn→ny får vekt 1 og ny→ut arver den gamle vekten (bevarer funksjonen
 * omtrentlig, standard NEAT).
 */
export function muterNyNode(g: Genom, bok: Innovasjonsbok, rng: () => number): boolean {
  const aktive = g.koblinger.filter((k) => k.aktiv);
  if (aktive.length === 0) return false;
  const kobling = aktive[Math.floor(rng() * aktive.length)]!;
  const { nodeId, innTilNy, nyTilUt } = bok.splitt(kobling.innovasjon, kobling.inn, kobling.ut);
  if (g.noder.some((n) => n.id === nodeId)) return false; // samme splitt gjort før i dette genomet
  kobling.aktiv = false;
  g.noder.push({ id: nodeId, type: "skjult" });
  g.koblinger.push({ inn: kobling.inn, ut: nodeId, vekt: 1, aktiv: true, innovasjon: innTilNy });
  g.koblinger.push({ inn: nodeId, ut: kobling.ut, vekt: kobling.vekt, aktiv: true, innovasjon: nyTilUt });
  return true;
}

export function muterVeksle(g: Genom, rng: () => number): void {
  if (g.koblinger.length === 0) return;
  const k = g.koblinger[Math.floor(rng() * g.koblinger.length)]!;
  k.aktiv = !k.aktiv;
}

/** Kjører hele mutasjonspakka med gitte rater. */
export function muter(g: Genom, bok: Innovasjonsbok, rng: () => number, rater = STANDARD_RATER): void {
  if (rng() < rater.vekter) muterVekter(g, rng, rater);
  if (rng() < rater.nyKobling) muterNyKobling(g, bok, rng);
  if (rng() < rater.nyNode) muterNyNode(g, bok, rng);
  if (rng() < rater.veksle) muterVeksle(g, rng);
}

// ---------------------------------------------------------------------------
// Kryssing og artsavstand
// ---------------------------------------------------------------------------

/**
 * NEAT-kryssing: gener linjeres opp på innovasjonsnummer. Matchende gener
 * arves tilfeldig fra en av foreldrene; disjunkte/overskytende gener arves
 * fra den STERKESTE forelderen (a antas ≥ b i fitness). Et gen som er
 * deaktivert hos en forelder har 75 % sjanse for å forbli deaktivert.
 */
export function kryss(a: Genom, b: Genom, rng: () => number): Genom {
  const bKoblinger = new Map(b.koblinger.map((k) => [k.innovasjon, k]));
  const koblinger: KoblingGen[] = [];
  for (const ka of a.koblinger) {
    const kb = bKoblinger.get(ka.innovasjon);
    const kilde = kb !== undefined && rng() < 0.5 ? kb : ka;
    const gen: KoblingGen = { ...kilde };
    if (kb !== undefined && (!ka.aktiv || !kb.aktiv)) {
      gen.aktiv = rng() >= 0.75 ? true : false;
    }
    koblinger.push(gen);
  }

  // Nodesettet utledes av koblingene + de faste inn/bias/ut-nodene.
  const nodeType = new Map<number, NodeType>();
  for (const n of a.noder) nodeType.set(n.id, n.type);
  for (const n of b.noder) if (!nodeType.has(n.id)) nodeType.set(n.id, n.type);

  const nødvendige = new Set<number>();
  for (let i = 0; i < a.antallInn; i++) nødvendige.add(i);
  nødvendige.add(biasId(a.antallInn));
  for (let j = 0; j < a.antallUt; j++) nødvendige.add(utId(a.antallInn, j));
  for (const k of koblinger) {
    nødvendige.add(k.inn);
    nødvendige.add(k.ut);
  }
  const noder: NodeGen[] = [...nødvendige]
    .sort((x, y) => x - y)
    .map((id) => ({ id, type: nodeType.get(id) ?? "skjult" }));

  return { antallInn: a.antallInn, antallUt: a.antallUt, noder, koblinger };
}

export interface AvstandsKoeff {
  readonly c1: number; // overskytende gener
  readonly c2: number; // disjunkte gener
  readonly c3: number; // vektdifferanse
}

export const STANDARD_KOEFF: AvstandsKoeff = { c1: 1, c2: 1, c3: 0.4 };

/** Kompatibilitetsavstand δ = c1·E/N + c2·D/N + c3·Ŵ (NEAT-artsmålet). */
export function avstand(a: Genom, b: Genom, k: AvstandsKoeff = STANDARD_KOEFF): number {
  if (a.koblinger.length === 0 && b.koblinger.length === 0) return 0;
  const bMap = new Map(b.koblinger.map((x) => [x.innovasjon, x]));
  const aMaks = a.koblinger.reduce((m, x) => Math.max(m, x.innovasjon), -1);
  const bMaks = b.koblinger.reduce((m, x) => Math.max(m, x.innovasjon), -1);

  let match = 0;
  let vektDiff = 0;
  let disjunkt = 0;
  let overskytende = 0;

  for (const ka of a.koblinger) {
    const kb = bMap.get(ka.innovasjon);
    if (kb !== undefined) {
      match++;
      vektDiff += Math.abs(ka.vekt - kb.vekt);
    } else if (ka.innovasjon <= bMaks) disjunkt++;
    else overskytende++;
  }
  for (const kb of b.koblinger) {
    if (a.koblinger.some((x) => x.innovasjon === kb.innovasjon)) continue;
    if (kb.innovasjon <= aMaks) disjunkt++;
    else overskytende++;
  }

  const n = Math.max(a.koblinger.length, b.koblinger.length, 1);
  const normN = n < 20 ? 1 : n; // små genomer normaliseres ikke (standard praksis)
  const snittVekt = match > 0 ? vektDiff / match : 0;
  return (k.c1 * overskytende) / normN + (k.c2 * disjunkt) / normN + k.c3 * snittVekt;
}

// ---------------------------------------------------------------------------
// Serialisering
// ---------------------------------------------------------------------------

export function genomTilJson(g: Genom): string {
  return JSON.stringify(g);
}

export function genomFraJson(json: string): Genom {
  const g = JSON.parse(json) as Genom;
  if (
    typeof g.antallInn !== "number" ||
    typeof g.antallUt !== "number" ||
    !Array.isArray(g.noder) ||
    !Array.isArray(g.koblinger)
  ) {
    throw new Error("Ugyldig genom-JSON");
  }
  return g;
}
