/**
 * AGENTSPEKEN — ÉN parser, ikke sju kopier.
 *
 * DENNE FILEN FINNES FORDI KOPIENE HADDE DREVET FRA HVERANDRE, og driften var
 * ikke kosmetisk. `examples/gate2.ts` kjente elleve spekformer; de seks
 * analyseverktøyene kjente TRE (`budm`, `e1`, `vakt`). De kunne altså ikke
 * engang parse Adams-v3, som krever `vr:` — så hver eneste atferdsanalyse
 * prosjektet har kjørt, målte en bot UTEN vrakrangereren.
 *
 * Det er samme feilklasse som breddedriften (`test/e1-bredder.test.ts`) og som
 * trosnettet i §29: MÅLEVERKTØYET OG DEN UTRULLEDE STIEN VAR IKKE SAMME TING.
 * Kuren er den samme: ett sted å endre, og en test som håndhever det.
 *
 * Legger du til en spekform her, får alle sju verktøyene den samtidig.
 */

import { readFileSync } from "node:fs";

import type { GameState, Handling } from "../index.ts";
import { E1Agent, lesE1Nett } from "../e1/nett.ts";
import { Vrakrangerer } from "./vrakrang.ts";
import { nettFraBytes } from "../nevro/nett.ts";
import { NevroAgent } from "../nevro/index.ts";
import { Budagent, lesBudmodell } from "./budagent.ts";
import { Konvensjonsvakt, delVaktspek } from "./konvensjonsvakt.ts";
import { Ensemble, type EnsembleModus } from "./ensemble.ts";
import { Rolleorakel, type Rolle } from "./rolleorakel.ts";
import { Sikkerorakel } from "./sikkerorakel.ts";
import { Vrakvelger } from "./vrakvelg.ts";
import { Etterlysvelger } from "./etterlys.ts";
import { Vrakvelger2, lesVrakflagg } from "./vrakvelg2.ts";
import { Trosnett } from "./trosnett.ts";
import { Profilagent, type Budjusterbar } from "./profilagent.ts";
import { EksaktSluttspill, delEksaktSpek } from "./eksaktagent.ts";
import { Juksagent } from "./juksagent.ts";
import { Alphamuagent } from "./amuagent.ts";
import { monteTro } from "./montetro.ts";
import { forover } from "../nevro/nett.ts";
import { e1SpillTrekk } from "../e1/trekk.ts";
import { søktMu } from "./budsok.ts";
import type { Utspiller } from "./sdkort.ts";
import { lagHvemLaVekt } from "./hvemla-slutning.ts";
import { lagRng } from "../kort.ts";
import { Økt } from "./okt.ts";

/**
 * Nettene leses ÉN gang og deles. `E1Agent` holder ingen tilstand mellom
 * kamper, så delingen er trygg — og uten den leses samme fil opptil sju
 * ganger per måling.
 */
const nettbuf = new Map<string, ReturnType<typeof lesE1Nett>>();
export const lesNett = (fil: string): ReturnType<typeof lesE1Nett> => {
  if (!nettbuf.has(fil)) nettbuf.set(fil, lesE1Nett(fil));
  return nettbuf.get(fil)!;
};

/**
 * DEN UTRULLEDE STAKKEN, ett sted.
 *
 * Standardspekene i analyseverktøyene hadde drevet: de sto på
 * `budm:bud-gbt.json:vakt:abmp:e1:d7alle.bin` – uten vrakrangereren og med
 * budterskelen på standardverdien 2,5 i stedet for −3,0. Terskelen er den
 * samme konstanten som ga +0,392 da den ble flyttet, så verktøyene målte en
 * MERKBART annen bot enn den som spiller.
 *
 * Endres Adams, endres denne linja – og alle verktøyene følger med.
 */
export const ADAMS =
  "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";

/**
 * DET MÅLTE, som ikke er det samme som det utrullede.
 *
 * Arvind: «det virker som mye kode som gjenbrukes blir utdatert.»
 *
 * Han hadde rett, og dette var hullet. `ADAMS` dokumenterer seg selv som DEN
 * UTRULLEDE stakken, og den er riktig: appen kjører `abmp`, testen over
 * håndhever at de to er enige, og vi har ikke rullet ut siden.
 *
 * Men vaktflagg `f` er MÅLT og ADOPTERT uten å være utrullet:
 *
 *   | bånd      | n      | effekt         | tegntest |
 *   |-----------|--------|----------------|----------|
 *   | 900 000   | 2 400  | +0,074 ± 0,042 | z = +2,29 |
 *   | 6 300 000 | 2 400  | +0,014 ± 0,031 | z = −0,43 |
 *   | 7 000 000 | 10 000 | +0,049 ± 0,017 | z = +2,64 |
 *   | 9 100 000 | 10 000 | +0,008 ± 0,019 | z = +1,03 |
 *   | **samlet**|        | **+0,031 ± 0,011** | **z = +2,95** |
 *
 * Uten et navn for «det målte» valgte verktøyene ad hoc: `laerer-sammenlikning`
 * målte med `ADAMS` (uten `f`), mens nattgenereringen og hver gate 2 kjørte
 * `abmpf`. To ulike bots ble kalt «vår» i samme prosjekt samtidig — nøyaktig
 * feilklassen «det målte og det utrullede var ikke samme ting», bare speilvendt.
 *
 * REGELEN: nye målinger og all korpusgenerering bruker `ADAMS_MAALT`.
 * `ADAMS` er forbeholdt utrullingsparitet. Når v6 rulles ut, blir de like igjen.
 *
 * Og forskjellen mellom dem er VOKTET: `utrullet-lik-maalt.test.ts` krever at
 * hvert avvik står i en liste med sin egen måling. `F` (legg billigst når du
 * ikke kan vinne) ble prøvd og snudde fortegn mellom to bånd — den er derfor
 * IKKE med, og testen ville stoppet den om noen la den inn i stillhet.
 */
export const ADAMS_MAALT =
  "vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/**
 * NETTET dagens målinger bruker, ett sted.
 *
 * Tretti analyseverktøy hadde standardverdien `e1-modell/sd-r2.bin` — to
 * generasjoner utdatert. Kjørt uten flagg målte de altså en gammel bot og
 * rapporterte tallet som dagens. Ingen av dem feilet; de svarte bare på et
 * annet spørsmål enn det som ble stilt.
 */
export const STANDARDNETT = "e1-modell/d7alle.bin";

/**
 * ADAMS-V6 — ALT PÅSLÅTT, i den rekkefølgen lagene må ligge.
 *
 * Arvind: «vi hiver alt den trenger til den … lag en komplett modell.»
 *
 * Rekkefølgen er ikke tilfeldig, og hvert lag ligger der det gjør av en grunn:
 *
 *   okt:      ØVERST, fordi den må se HELE kampen for å lære motstanderne, og
 *             fordi både profilagenten (som lærer) og alpha-mu (som bruker
 *             det lærte) må dele samme objekt.
 *   vr:       vrak og trumfvalg. Utenfor søket — det er en annen beslutning
 *             med sin egen modell.
 *   amu:      søket. Under vrak fordi det bare gjelder kortspillet.
 *     k32     32 kandidatverdener (målt +2,62 pp verdenskvalitet mot 3)
 *     s       verdenene vektes av SPILLET, ikke bare budrunden (A1)
 *     m2      Pareto over egne framtidige valg (A8)
 *     e0.25   uleselighet blant kort innenfor ε (A7)
 *     r0.4    kampstillingsstyrt varians
 *   profil:   motstandermodellen, som fyller `okt`-boka
 *   budm:     budgivningen
 *   vakt:abmpf  konvensjonene, inkludert `f` (stikk 1 billigst, +0,031)
 *   e1:       nettet, nederst — det er prioren alt annet bygger på
 *
 * FLAGGET `f` ER DEN ENESTE MÅLTE GEVINSTEN HER. Resten er umålt, og det er
 * med vilje: hele poenget med v6 er å kunne måle dem sammen og hver for seg.
 *
 * KOSTNADEN ER IKKE MÅLT ENNÅ. `amu` med M=2 forgreiner seg over egne
 * framtidige valg, så den er vesentlig dyrere enn `sik` — og `sik` kostet
 * allerede 198 ms. Dette er en BENKESPEK, ikke en utrullingsspek.
 */
export const ADAMS_V6 =
  "okt:vr:e1-modell/vrakrang.bin:telrd:" +
  "amu:foerer:12k16sm1e0.25r1.5:" +
  "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/**
 * ADAMS-V7 — DEN FØRSTE SPEKKEN SOM FAKTISK INNEHOLDER DELENE SINE.
 *
 * Arvind: «vi har jo jobbet for at Adams skal ha tilgang til alt dette også
 * bruker vi det ikke. vær så snill å gjør det ordentlig nå.»
 *
 * Han hadde rett, og §99 målte omfanget. Av evnene som ble bygd:
 *
 *   `signal.ts` (A6)         importert av BARE sin egen test
 *   `budsok.ts` (A4)         importert av BARE sin egen test — mens
 *                            `Budagent` hadde en ubrukt `søktAnslag`-krok
 *                            med A4-kommentaren i
 *   `troverdighet.ts` (A5)   bare i `sd-orakel.ts`, altså i ETIKETTMAKEREN.
 *                            Adams hadde den ikke når han spilte.
 *   `forklar.ts`             forekom én gang i repoet: sin egen definisjon
 *   alpha-mu                 levde, men BARE i førersetet — 27 % av setene
 *
 * Hver gate 2 har målt «Adams». Den Adams hadde aldri delene i seg.
 *
 * ================= HVA SOM ER NYTT I V7, LEDD FOR LEDD ==================
 *
 *   amu:foerer  søket BARE i førersetet — og det er nå MÅLT, ikke arvet.
 *               `amu:alle` ble prøvd over 16 000 par: **−0,2837 ± 0,0519,
 *               z = −5,5**. Per rolle: makker −0,3342 (−6,4 SE), forsvar
 *               −0,4003 (−4,0 SE). Kontrollarmen eksakt 0.
 *
 *               Hypotesen i §98 var at `ork:`-nullen (−0,027) skyldtes
 *               STRATEGIFUSJON, og at alpha-mu ville fikse den. Motbevist:
 *               alpha-mu gjør det VERRE, ikke bedre.
 *     b         A5: verdenene vektes av en LIKELIHOOD under nettets egen
 *               policy, ikke av fire håndsatte regler. Erstatter «s» — de er
 *               alternative modeller av samme observasjoner og kan ikke stables.
 *     g         A6: signalforenligheten legges til. Additiv, fordi den leser
 *               noe annet: hvilket av de LIKEGYLDIGE kortene makker valgte.
 *   /sok12k8b0.5  A4: budet spør SPILLET hva hånden er verdt, blandet 50/50
 *               med GBT-en. Ikke full erstatning — rolloutene spiller som oss
 *               og arver vår skjevhet, mens GBT-en er tilpasset faktiske utfall.
 *
 * ================= HVA SOM FORTSATT MANGLER, SAGT HØYT ==================
 *
 * **`montetro` og sanseblokken er IKKE med, og det er ikke en glipp.** De
 * krever et nett på ≥ 558 trekk; Adams kjører `d7alle` på 273. Det eneste
 * brede nettet vi har (`b714gammel`) måler −1,15 mot `d7alle`, så å bytte til
 * det ville gjort Adams verre for å slå på en evne. Den låsen åpnes av et
 * bedre 714-nett, ikke av en spekendring — og det er nettopp det arm A trener
 * mot.
 *
 * ================= INGENTING HER ER MÅLT ================================
 *
 * V7 er en BENKESPEK. `b`, `g`, `alle` og `sok` er alle umålte, og noen av dem
 * kan godt være negative — `ork:`-forsvarssøket målte −0,027. Poenget med v7 er
 * at de nå KAN måles, hver for seg og sammen. Før dette var de ikke i boten.
 */
export const ADAMS_V7 =
  "okt:vr:e1-modell/vrakrang.bin:telrd:" +
  "amu:foerer:12k16bgm1e0.25r1.5:" +
  "profil:budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5:" +
  "vakt:abmpf:e1:e1-modell/d7alle.bin";

/**
 * V6 I FULL STYRKE — 24 verdener, 32 kandidater, M=2.
 *
 * IKKE MAALBAR I PRAKSIS, og det er et maalt tall og ikke en anelse.
 * Kostnadssveipet 7. august, med CPU-en mettet av 18 korpusskard:
 *
 *     basis (ingen soek)              1 ms
 *     sik 24 (dagens v5)         13 340 ms   <- kjent 198 ms => 67x kontensjon
 *     amu 12k16 M=1               6 619 ms   => ~99 ms reelt
 *     amu 12k16 M=1 + spillvekt   6 373 ms   => ~95 ms  A1 ER GRATIS
 *     amu 12k16 M=2              34 850 ms   => ~520 ms
 *     amu 24k32 M=2              fullfoerte ikke
 *
 * Sanitetssjekken er at `sik 24` traff sitt kjente tall etter omregning.
 *
 * TO FUNN: **spillvekten (A1) koster ingenting** - den bruker verdener som alt
 * er trukket. Og **M=2 koster 5,3x M=1**, som er den dyreste knotten vi har.
 *
 * Derfor er `ADAMS_V6` satt til M=1: en spek som ikke kan maales er ikke en
 * kandidat, den er en hypotese. Samme laerdom som da konfidensporten viste seg
 * baade sterkere OG billigere enn alltid-soek (§ utrulling-v5).
 */
export const ADAMS_V6_FULL =
  "okt:vr:e1-modell/vrakrang.bin:telrd:" +
  "amu:foerer:24k32sm2e0.25r1.5:" +
  "profil:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin";

/**
 * Tallargument med FAIL-FAST. `Number("vr:...")` gir `NaN` uten et pip, og et
 * NaN-frø gir samme giv om og om igjen – en måling som ser ferdig ut og er
 * ren søppel. Det skjedde 5. august under selve migreringen.
 */
export function tall(v: string | undefined, standard: number, navn: string): number {
  if (v === undefined) return standard;
  // TOM STRENG ER IKKE NULL. `Number("")` er 0 og fullt endelig, så en tom
  // parameter ville sklidd gjennom som et gyldig frø. Testen fant det.
  if (v.trim() === "") throw new Error(`«${navn}» må være et tall, fikk tom streng`);
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`«${navn}» må være et tall, fikk «${v}»`);
  return x;
}

/** Det ethvert lag i stakken må kunne. */
export interface Spekagent {
  velgHandling(s: GameState): Handling;
  nyKamp(): void;
  /**
   * BOKFOER EN RUNDE UTEN AA SPOERRE OM ET TREKK. Valgfri: bare lag som laerer
   * av rundeutfall trenger den, og bare drivere som haandterer `RUNDE_SLUTT`
   * selv maa kalle den.
   *
   * Den finnes fordi `Profilbok.observer` bare bokfoerer paa `RUNDE_SLUTT`, og
   * den ble bare kalt fra `velgHandling`. `examples/kamp.ts` utfoerer `NESTE`
   * selv og spoer aldri en agent i den fasen - maalt 0 bokfoerte runder mot 25
   * med tikk. Profilen, og dermed hele K6, var strukturelt tom i den ENESTE
   * benken som spiller kamper lange nok til aa laere noe.
   */
  observer?(s: GameState): void;
}

/**
 * Én spek → én agent. Formene nøstes, så en hel stige kan skrives på én linje:
 *
 *   nevro
 *   e1:<fil>
 *   ens:<modus>:<fil1,fil2,...>
 *   vakt:<flagg>:<indre>
 *   budm:<modellfil>:<indre>
 *
 * Rekursjonen er poenget: `budm:...:vakt:abmp:e1:sd-r2.bin` er budmodellen
 * utenpå konvensjonsvakten utenpå nettet, og hvert lag kan tas av for seg.
 * Det er den eneste måten å vise hva HVERT lag er verdt.
 */
/**
 * STRIPPER ALLE SØKELAG av en spek.
 *
 * Hver søkeoperator (`ork:`, `sik:`, `vv:`, `vv2:`) tar en ROLLOUT-MOTPART som
 * modellerer hvordan de andre spiller. Fikk den `inn` – det indre laget – og
 * `inn` selv var et søk, startet hver rollout et NYTT søk. Søk inne i søk,
 * eksponentielt.
 *
 * Det blokkerte forsvarslinja i timevis: tre målinger måtte brytes, og jeg
 * konkluderte hver gang med at det var en kostnadsgrense. Det var en bug.
 *
 * De andre spillerne søker ikke. Motparten skal derfor bygges fra speken UTEN
 * søkelag – uansett hvor mange som er stablet.
 */
export function utenSøk(spek: string): string {
  let s = spek;
  for (;;) {
    if (s.startsWith("ork:") || s.startsWith("sik:")) {
      // ork:<rolle>:<verdener>:<indre>  og  sik:<rolle>:<sigma>:<verdener>:<indre>
      const d = s.slice(4).split(":");
      s = d.slice(s.startsWith("sik:") ? 3 : 2).join(":");
    } else if (s.startsWith("vv2:")) {
      // slice(3) SPEILER `lagIndre`, som hopper over fire felt selv om
      // kommentaren over den sier tre. Uenigheten er eldre enn denne fiksen;
      // her gjelder bare at strippingen gjør nøyaktig det bygget gjør.
      s = s.slice(4).split(":").slice(3).join(":");
    } else if (s.startsWith("vv:")) {
      s = s.slice(3).split(":").slice(1).join(":");
    } else {
      return s;
    }
  }
}

/**
 * Kontekst som følger med NEDOVER i speken. I dag bare økten, som må deles av
 * BÅDE profilagenten (som lærer) og alpha-mu (som bruker det den lærte) — er de
 * to ikke samme objekt, lærer den ene noe den andre aldri ser.
 */
export interface Spekkontekst {
  økt?: Økt;
}

export function lagIndre(indre: string, ctx: Spekkontekst = {}): Spekagent {
  if (indre === "nevro") return new NevroAgent();
  if (indre.startsWith("vakt:")) {
    const v = delVaktspek(indre);
    if (v === null) throw new Error(`Ugyldig vaktspek «${indre}»`);
    return new Konvensjonsvakt(lagIndre(v.indre, ctx), v.valg);
  }
  /**
   * `budm:<modellfil>[@<evForsvar>]:<indre>`
   *
   * `@<evForsvar>` FINJUSTERER BUDLAGET MOT KORTLAGET. Beslutningsregelen er
   *
   *     ev = p · 2N(2P−1) + (1−p) · evForsvar,   by hvis ev > evForsvar
   *
   * der `evForsvar` er den ANTATTE verdien av å forsvare i stedet for å by.
   * Den ble satt til 2,5 den gangen kortnettet var svakere. Blir boten bedre
   * til å berge kontrakter, er 2,5 for høyt, og da byr den for forsiktig – den
   * lar seg presse ut av budvinnerfeltet (±18/9, ±20/10) og ned i
   * forsvarerfeltet (0–3), der nesten ingen poeng ligger.
   *
   * Tallet er altså ikke en fri parameter å søke i: det er ett bestemt ledd
   * som er kalibrert mot en bot som ikke finnes lenger. Derfor SVEIPES det,
   * og derfor må sveipet replikeres i disjunkt frøbånd som alt annet – argmax
   * over en sveip er like utsatt for vinnerens forbannelse som argmax over
   * kandidater.
   */
  /**
   * `vr:<vektfil>:<flagg>:<indre>` – vrak- og trumfrangereren utenpå alt annet.
   *
   * Rå `nettFraBytes`, ikke E1-laderen: rangereren tar 24 trekk mens laderen
   * håndhever kortnettets bredde, og den avvisningen er riktig – den fanget
   * meg da jeg først prøvde. `Vrakrangerer` sjekker bredden selv.
   */
  if (indre.startsWith("vr:")) {
    const rest = indre.slice(3);
    const a = rest.indexOf(":");
    const b = rest.indexOf(":", a + 1);
    if (a < 0 || b < 0) throw new Error(`Ugyldig vr-spek «${indre}»`);
    const nett = nettFraBytes(new Uint8Array(readFileSync(rest.slice(0, a))))[0];
    if (nett === undefined) throw new Error(`Tomme vekter i «${rest.slice(0, a)}»`);
    return new Vrakrangerer(lagIndre(rest.slice(b + 1), ctx), nett, rest.slice(a + 1, b));
  }
  if (indre.startsWith("budm:")) {
    const rest = indre.slice(5);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig budm-spek «${indre}» – forventet budm:<modellfil>:<indre>`);
    const hode = rest.slice(0, skille);
    const at = hode.lastIndexOf("@");
    const fil = at < 0 ? hode : hode.slice(0, at);
    // «@<ev>» eller «@<ev>/<sigmagulv>». Begge er KALIBRERTE ANSLAG mot et
    // tidligere kortnett, ikke regler - se kommentaren over.
    const hale = at < 0 ? "" : hode.slice(at + 1);
    const strek = hale.indexOf("/");
    const ev = at < 0 ? 2.5 : Number(strek < 0 ? hale : hale.slice(0, strek));
    // «@<ev>/<sigmagulv>/<muskift>». Skiftet er MAALT: modellen undervurderer
    // lagstikket med 0,130 i snitt over 3 000 runder.
    const halen = strek < 0 ? "" : hale.slice(strek + 1);
    const strek2 = halen.indexOf("/");
    const sg = strek < 0 ? 0.6 : Number(strek2 < 0 ? halen : halen.slice(0, strek2));
    const rest2 = strek2 < 0 ? "" : halen.slice(strek2 + 1);
    const strek3 = rest2.indexOf("/");
    const ms = strek2 < 0 ? 0 : Number(strek3 < 0 ? rest2 : rest2.slice(0, strek3));
    if (!Number.isFinite(ms)) throw new Error(`Ugyldig muskift i «${indre}»`);
    // Fjerde leddet: FORSVARSVERDIEN, som er en annen stoerrelse enn terskelen
    // selv om de har delt konstant til naa. Uten den faller den tilbake paa
    // terskelen, saa alle gamle spesifikasjoner spiller bit-identisk.
    const rest3 = strek3 < 0 ? "" : rest2.slice(strek3 + 1);
    const strek4 = rest3.indexOf("/");
    const fv = strek3 < 0 ? ev : Number(strek4 < 0 ? rest3 : rest3.slice(0, strek4));
    if (!Number.isFinite(fv)) throw new Error(`Ugyldig forsvarsverdi i «${indre}»`);
    // Femte felt: AUKSJONSKORREKSJON på μ. «1» slår den på. Målt 6. august:
    // residualen spriker 0,37 stikk mellom auksjonstilstander modellen ikke ser.
    const haleFelt = strek4 < 0 ? "" : rest3.slice(strek4 + 1);
    const strek5 = haleFelt.indexOf("/");
    const auk = (strek5 < 0 ? haleFelt : haleFelt.slice(0, strek5)) === "1";
    /**
     * SJETTE FELT: A4-BUDSØKET, «sok<verdener>[k<kandidater>][b<blanding>]».
     *
     * `budsok.ts` ble bygd, testet og dokumentert — og `Budagent` har hatt en
     * `søktAnslag`-krok med A4-kommentaren i hele tiden. Ingen satte den
     * noensinne. Kontakten fantes, pluggen fantes, de hadde aldri møtt
     * hverandre, og alle tester var grønne.
     *
     * BLANDINGEN ER STANDARD 0,5, ikke 1. Rolloutene spiller som OSS, så søket
     * arver vår egen skjevhet, mens GBT-en er tilpasset faktiske utfall. Full
     * erstatning bytter én skjevhet mot en annen uten å kunne måle det.
     */
    const sokFelt = strek5 < 0 ? "" : haleFelt.slice(strek5 + 1);
    if (!Number.isFinite(ev)) throw new Error(`Ugyldig evForsvar i «${indre}»`);
    if (!Number.isFinite(sg) || sg <= 0) throw new Error(`Ugyldig sigmagulv i «${indre}»`);
    const innagent = lagIndre(rest.slice(skille + 1), ctx);
    let søktAnslag: ((s: GameState, sete: number) => { μ: number; σ: number } | null) | null = null;
    let budblanding = 1;
    if (sokFelt !== "") {
      const m2 = /^sok(\d+)(?:k(\d+))?(?:b([\d.]+))?$/.exec(sokFelt);
      if (m2 === null) {
        throw new Error(
          `Ugyldig budsøk-felt «${sokFelt}» i «${indre}» – forventet ` +
            `sok<verdener>[k<kandidater>][b<blanding>], f.eks. «sok12k8b0.5».`,
        );
      }
      const vN = Number(m2[1]);
      const vK = m2[2] === undefined ? 8 : Number(m2[2]);
      budblanding = m2[3] === undefined ? 0.5 : Number(m2[3]);
      const rngB = lagRng(20260808);
      /**
       * BUDET SØKET SPILLER UT ER FAST 9, og det er ikke en forenkling.
       *
       * `Budagent` regner P(N) for alle N fra ÉN fordeling, fordi antall stikk
       * laget tar avhenger av KORTENE og ikke av hva vi meldte. Søket skal
       * derfor gi ett anslag på lagstikket, ikke ett per bud. 9 er den
       * vanligste kontrakten og den som oftest lar seg by.
       */
      søktAnslag = (s: GameState, sete: number) =>
        søktMu(s, sete, 9, innagent as unknown as Utspiller, {
          verdener: vN,
          rng: rngB,
          verdenKandidater: vK,
        });
    }
    // Rekkefølgen er: forsvarsjustering (7.), auksjonskorreksjon (8.),
    // søktAnslag (9.), budblanding (10.). Første forsøk sendte søket som 7.
    // argument; typesjekken stoppet det, men posisjonelle argumenter av samme
    // form ville ikke alltid gjort det.
    return new Budagent(
      innagent,
      lesBudmodell(fil),
      ev,
      sg,
      ms,
      fv,
      null,
      auk,
      søktAnslag,
      budblanding,
    );
  }
  /**
   * `ork:<rolle>:<indre>` - SD-ORAKELET spiller den rollen, det indre alt annet.
   *
   * Svarer paa om orakelet er et TAK i den rollen. Makkerens atferd avviker
   * ~19 SE fra orakelets, men planen har alt et motbevis for spillefoerersetet
   * (`lagstikk - SD` = +0,26 - nettet slaar laereren der). Fasiten ble godkjent
   * paa en AGGREGERT korrelasjon, aldri per rolle.
   */
  if (indre.startsWith("ork:")) {
    // ork:<rolle>:<verdener>:<indre>
    //
    // ROLLOUT-POLICYEN ER `indre`, IKKE NevroHjerne. Foerste maaling brukte
    // nevro, mens treningsdataen ble generert med vaar sterke bot som motpart -
    // altsaa ble et svakere orakel maalt enn det som lager fasiten. Med `indre`
    // som motpart forestiller orakelet seg at bordet spiller som oss, som er
    // den korrekt spesifiserte varianten.
    const d = indre.slice(4).split(":");
    const rolle = d[0] as Rolle;
    if (rolle !== "foerer" && rolle !== "makker" && rolle !== "forsvar") {
      throw new Error(`Ukjent rolle «${rolle}» (foerer, makker, forsvar)`);
    }
    // «<verdener>[@<trofil>][+<vaktflagg1,vaktflagg2>]» – troen vekter
    // verdenene, vaktflaggene gir FORTSETTELSER (Brown & Sandholm). Begge er
    // valgfrie, og uten dem er speken bit-identisk med den gamle formen.
    const hode = d[1] ?? "";
    const pluss = hode.indexOf("+");
    const hodeUtenForts = pluss < 0 ? hode : hode.slice(0, pluss);
    const fortsFlagg = pluss < 0 ? [] : hode.slice(pluss + 1).split(",").filter((x) => x.length > 0);
    const snabel = hodeUtenForts.indexOf("@");
    const verdener = Number(snabel < 0 ? hodeUtenForts : hodeUtenForts.slice(0, snabel));
    const troFil = snabel < 0 ? null : hodeUtenForts.slice(snabel + 1);
    if (!Number.isFinite(verdener) || verdener < 1) {
      throw new Error(
        `Ugyldig verdenstall i «${indre}» - forventet ork:<rolle>:<verdener>[@<trofil>][+<flagg,flagg>]:<indre>`,
      );
    }
    const restSpek = d.slice(2).join(":");
    const inn = lagIndre(restSpek, ctx);
    /**
     * ROLLOUT-MOTPARTEN MÅ VÆRE EN AGENT UTEN SØK.
     *
     * `Rolleorakel` fikk `inn` som motpart – men nestes to av dem
     * (`ork:foerer:…:ork:forsvar:…:…`), er `inn` SELV et søk. Da starter hver
     * eneste rollout i det ytre søket et nytt søk i det indre: søk inne i søk,
     * eksponentielt. Målingen så bare «treg» ut; den var uendelig mye tregere
     * enn den skulle.
     *
     * Motparten skal modellere hvordan de andre SPILLER, og de spiller uten
     * søk. Derfor strippes alle `ork:`-lag av før motparten bygges.
     */
    const baseSpek = utenSøk(restSpek);
    const motpart = baseSpek === restSpek ? inn : lagIndre(baseSpek, ctx);
    const trosnett =
      troFil === null || troFil === ""
        ? null
        : new Trosnett(nettFraBytes(new Uint8Array(readFileSync(troFil)))[0]!);
    // Fortsettelsene bygges ved å bytte VAKTFLAGGET i den indre speken – det
    // er den billigste måten å få målt ulike spillestiler, og policysveipen
    // 5. august viste at abmpd og abmpS er merkbart forskjellige fra abmp.
    const fortsettelser = fortsFlagg.map((f) => {
      const byttet = restSpek.replace(/vakt:[a-zA-Z]+/, `vakt:${f}`);
      if (byttet === restSpek) throw new Error(`Fant ingen «vakt:» å bytte til «${f}» i «${restSpek}»`);
      return lagIndre(byttet, ctx) as unknown as ConstructorParameters<typeof Rolleorakel>[1];
    });
    return new Rolleorakel(inn, motpart as unknown as ConstructorParameters<typeof Rolleorakel>[1], rolle, {
      verdener,
      trosnett,
      fortsettelser:
        fortsettelser.length > 0
          ? [motpart as unknown as ConstructorParameters<typeof Rolleorakel>[1], ...fortsettelser]
          : undefined,
    });
  }
  /**
   * `sik:<sigma>:<verdener>:<indre>` - SIKKERORAKELET.
   *
   * Overstyrer `indre` bare der den PARREDE marginen mellom beste og nest
   * beste kort overstiger sigma ganger sin egen SE. sigma=0 er dagens raa
   * orakel; hoey sigma er ren champion. De to ytterpunktene er valideringen.
   */
  /**
   * `amu:<rolle>:<verdener>[k<kand>][s][m<M>][e<eps>]:<indre>` — ALPHA-MU.
   *
   * Binder A1 (spillvekt, «s»), A2 (motstandermodell), A7 (uleselighet, «e»)
   * og A8 (Pareto-dybde, «m») i ett lag. Se `amuagent.ts` for hvorfor de
   * hoerer sammen: alpha-mu er en beslutningsregel OVER et utvalg, og A1 lager
   * utvalget.
   *
   * Eksempel: `amu:foerer:24k32sm2e0.3:<indre>`
   */
  /**
   * `okt:<indre>` — ØKT-SCOPET MOTSTANDERMODELL.
   *
   * Oppretter én `Økt` og sender den nedover. Profilagenten lærer inn i den,
   * og alpha-mu leser den ut igjen som `motpartFor`. Uten dette laget er
   * oppførselen bit-identisk med før.
   */
  if (indre.startsWith("okt:")) {
    /**
     * EN OEKT SOM ALLEREDE ER LEVERT SKAL IKKE SKYGGES.
     *
     * Sto `new Økt()` ubetinget. En kaller som selv lager en oekt for aa kunne
     * LESE den - en maaling som vil rapportere `aggressivitet` per runde, for
     * eksempel - fikk den erstattet i det oeyeblikket speken begynte med
     * `okt:`. Boka ble fylt, men i et objekt kalleren ikke kunne naa, saa
     * maalingen rapporterte `null` for evig.
     *
     * Det er samme feilklasse som resten av dagen: komponenten VIRKET, men to
     * deler pekte paa hvert sitt objekt. Naa er `okt:` idempotent naar en oekt
     * finnes i konteksten.
     */
    const økt = ctx.økt ?? new Økt();
    const inn = lagIndre(indre.slice(4), { ...ctx, økt });
    return {
      velgHandling: (s) => inn.velgHandling(s),
      nyKamp: () => {
        økt.nyKamp();
        inn.nyKamp();
      },
      // Bokfoeringskroken maa gjennom hit ogsaa - driveren holder DETTE
      // objektet, og `Profilagent` ligger flere lag lenger ned.
      observer: (s: GameState) => (inn as { observer?(x: GameState): void }).observer?.(s),
    };
  }
  if (indre.startsWith("amu:")) {
    const d = indre.slice(4).split(":");
    const rolle = d[0] as Rolle | "alle";
    if (rolle !== "foerer" && rolle !== "makker" && rolle !== "forsvar" && rolle !== "alle") {
      throw new Error(`Ukjent rolle «${rolle}» (foerer, makker, forsvar, alle)`);
    }
    let f = d[1] ?? "";
    const les = (tegn: string, standard: number): number => {
      const i = f.indexOf(tegn);
      if (i < 0) return standard;
      const rest = f.slice(i + 1);
      const m = /^[\d.]+/.exec(rest);
      if (m === null) throw new Error(`Ugyldig «${tegn}» i amu-spek «${indre}»`);
      f = f.slice(0, i) + rest.slice(m[0].length);
      return Number(m[0]);
    };
    const eps = les("e", 0);
    const M = les("m", 1);
    // «r<lambda>»: kampstillingsstyrt varians. 0 = av.
    const lambda = les("r", 0);
    // «v<margin>»: vaktens veto. 0 = av, bit-identisk med foer. Se §103.
    const vetoMargin = les("v", 0);
    /**
     * SLUTNINGEN SOM VEKTER VERDENENE — «s» (A1, regler) eller «b» (A5, Bayes).
     *
     * De er ALTERNATIVER, ikke tillegg: begge leser de samme observasjonene,
     * A1 som håndsatte regler og A5 som en likelihood under nettets policy. Å
     * slå på begge ville telt samme bevis to ganger. Speken avviser det derfor
     * i stedet for å velge for kalleren.
     *
     * «g» (A6, signaler) er additiv — den leser hvilket av de LIKEGYLDIGE
     * kortene som ble valgt, altså noe A1/A5 ikke ser.
     */
    let spillvekt = false;
    let bayes = false;
    let signal = false;
    if (f.includes("s")) {
      spillvekt = true;
      f = f.replace("s", "");
    }
    if (f.includes("b")) {
      bayes = true;
      f = f.replace("b", "");
    }
    if (f.includes("g")) {
      signal = true;
      f = f.replace("g", "");
    }
    if (spillvekt && bayes) {
      throw new Error(
        `amu-spek «${indre}» har baade «s» (A1 regler) og «b» (A5 Bayes). De er ` +
          `alternative modeller av de samme observasjonene og kan ikke stables - velg én.`,
      );
    }
    const kand = les("k", 3);
    const verdener = Number(f);
    if (!Number.isFinite(verdener) || verdener < 1) {
      throw new Error(`Ugyldig amu-spek «${indre}» - forventet amu:<rolle>:<verdener>...:<indre>`);
    }
    const restSpek = d.slice(2).join(":");
    const inn = lagIndre(restSpek, ctx);
    const utenS = utenSøk(restSpek);
    const motpart = utenS === restSpek ? inn : lagIndre(utenS, ctx);
    /**
     * ATFERDSMODELLEN SOM A5 TRENGER, hentet fra nettet som FAKTISK spiller.
     *
     * `troverdighet` regner P(observasjon | verden) under en policy. Den
     * policyen må være den samme boten vi modellerer, ellers måler vi
     * forenlighet med en annen spiller enn den ved bordet.
     *
     * Nettfila plukkes derfor ut av den INDRE speken — samme fil, samme
     * vekter, og `lesNett` deler instansen så den ikke lastes to ganger.
     */
    const nettFil = /e1:([\w./-]+\.bin)/.exec(restSpek)?.[1];
    const atferd =
      bayes && nettFil !== undefined
        ? (() => {
            const n = lesNett(nettFil);
            const grunn = {
              logits: (st: GameState, s2: number) =>
                forover(n, e1SpillTrekk(st, s2, n.lag[0]!.inn)),
            };
            /**
             * ============ K4 MATER K8 =================================
             *
             * Arvind: «k4 og k8 henger ogsaa sammen og komplementerer
             * hverandre.»
             *
             * A5 regner P(observasjon | verden) under en POLICY, og den
             * policyen var alltid vaart eget nett — ogsaa naar oekten hadde
             * laert at setet spiller helt annerledes. Da vektes verdenene med
             * feil modell.
             *
             * `Økt.atferdFor` gir den vridde policyen, og den deler `vri` og
             * ytterkortvalget med `motpartFor`. Uten den delingen ville soeket
             * rullet ut én motstander og troen vektet etter en annen — samme
             * feil som A6 hadde da avsender og mottaker hadde hver sin kode.
             *
             * Uten oekt er dette bit-identisk med foer: `atferdFor` returnerer
             * `grunn` uendret naar stilen ikke er lest.
             */
            if (ctx.økt === undefined) return grunn;
            const økt = ctx.økt;
            return {
              logits: (st: GameState, s2: number) => økt.atferdFor(grunn, s2).logits(st, s2),
            };
          })()
        : undefined;
    if (bayes && atferd === undefined) {
      throw new Error(
        `amu-spek «${indre}» ber om «b» (A5 Bayes), men fant ingen «e1:<fil>.bin» i ` +
          `den indre speken. Uten nettets policy kan ikke P(observasjon|verden) regnes, ` +
          `og en stille tilbakefall til reglene er nettopp slik A5 ble borte.`,
      );
    }
    return new Alphamuagent(inn, motpart, {
      verdener,
      verdenKandidater: kand,
      spillvekt,
      vektkilde: bayes ? "bayes" : spillvekt ? "regel" : "av",
      signal,
      atferd,
      M,
      epsilon: eps,
      lambda,
      vetoMargin,
      // A2: oekten gir én policy PER MOTSTANDER. Uten oekt er den udefinert,
      // og soeket antar som foer at alle spiller som oss.
      motpartFor:
        ctx.økt === undefined ? undefined : (sete: number) => ctx.økt!.motpartFor(motpart, sete),
      roller: rolle === "alle" ? [] : [rolle],
    });
  }
  if (indre.startsWith("sik:")) {
    // sik:<rolle>:<sigma>:<verdener>:<indre>
    //
    // ROLLEN ER MED FORDI KOSTNADEN ER REELL: uten den evalueres HVER
    // beslutning med K verdener x alle lovlige kort, og en enkelt maaling tar
    // timer. Med rollen blir den dessuten direkte sammenlignbar med ork:-benken,
    // som er sigma=0-varianten av noeyaktig det samme.
    const d = indre.slice(4).split(":");
    // «alle» er IKKE med i `Rolle`, så castet må si det eksplisitt. Uten det
    // mener typesjekken at `rolle === "alle"` er umulig, og hele
    // sik:alle-grenen ble stående som statisk død kode.
    const rolle = d[0] as Rolle | "alle";
    if (rolle !== "foerer" && rolle !== "makker" && rolle !== "forsvar" && rolle !== "alle") {
      throw new Error(`Ukjent rolle «${rolle}» (foerer, makker, forsvar, alle)`);
    }
    const sigma = Number(d[1]);
    // «<verdener>[k<kandidater>]» – f.eks. «24k32». Kandidatene er verdener
    // importance-samplingen får VELGE MELLOM, og en kandidat koster én
    // trekning mot utspillingens ~30 nettpass. Standard 3 var for lavt: målt
    // +0,68 pp verdenskvalitet ved 3 mot +2,62 ved 32.
    // «<verdener>[k<kandidater>][a<kriterium>]» - f.eks. «24k32amin».
    // `a` er ALPHA-MU-kriteriet over verdener: min, kvantil, flest.
    let vFelt = d[2] ?? "";
    let verdenKombi: "snitt" | "min" | "kvantil" | "flest" = "snitt";
    // «s» paa slutten slaar paa A1-spillvekten: kandidatverdenene vektes ogsaa
    // etter hvordan de andre har SPILT, ikke bare etter hva de bod.
    let spillvekt = false;
    if (vFelt.endsWith("s")) {
      spillvekt = true;
      vFelt = vFelt.slice(0, -1);
    }
    const aPos = vFelt.indexOf("a");
    if (aPos >= 0) {
      const k = vFelt.slice(aPos + 1);
      if (k !== "min" && k !== "kvantil" && k !== "flest") {
        throw new Error(`Ukjent alpha-mu-kriterium «${k}» (min, kvantil, flest)`);
      }
      verdenKombi = k;
      vFelt = vFelt.slice(0, aPos);
    }
    const kPos = vFelt.indexOf("k");
    const verdener = Number(kPos < 0 ? vFelt : vFelt.slice(0, kPos));
    const verdenKandidater = kPos < 0 ? 3 : Number(vFelt.slice(kPos + 1));
    if (!Number.isFinite(sigma) || !Number.isFinite(verdener) || verdener < 1) {
      throw new Error(`Ugyldig sik-spek «${indre}» - forventet sik:<rolle>:<sigma>:<verdener>:<indre>`);
    }
    const inn = lagIndre(d.slice(3).join(":"), ctx);
    const sikRest = utenSøk(d.slice(3).join(":"));
    return new Sikkerorakel(inn, (sikRest === d.slice(3).join(":") ? inn : lagIndre(sikRest, ctx)) as unknown as ConstructorParameters<typeof Sikkerorakel>[1], {
      sigma,
      verdener,
      verdenKandidater,
      verdenKombi,
      spillvekt,
      roller: rolle === "alle" ? [] : [rolle],
    });
  }
  /**
   * `vv:<verdener>:<indre>` - VRAK OG TRUMF SOM ETT VALG.
   *
   * Erstatter NevroHjernes to uavhengige beslutninger med et parret SD-valg
   * over doktrinstyrte (trumf, vrak)-kandidater. Trumfvalget er maalt til
   * 32,4 +/- 3,0 poeng per kamp og er den siste beslutningen som fortsatt tas
   * av en haandlagd formel fra appen.
   */
  if (indre.startsWith("vv:")) {
    const d = indre.slice(3).split(":");
    const verdener = Number(d[0]);
    if (!Number.isFinite(verdener) || verdener < 1) {
      throw new Error(`Ugyldig vv-spek «${indre}» - forventet vv:<verdener>:<indre>`);
    }
    const inn = lagIndre(d.slice(1).join(":"), ctx);
    const vvRest = utenSøk(d.slice(1).join(":"));
    return new Vrakvelger(inn, (vvRest === d.slice(1).join(":") ? inn : lagIndre(vvRest, ctx)) as unknown as ConstructorParameters<typeof Vrakvelger>[1], { verdener });
  }
  /**
   * `etl:<nivaa>:<indre>` - ETTERLYSNINGEN, den siste uundersoekte beslutningen.
   *
   * 0 = hoeyeste lovlige trumfkort (dagens regel), 1 = nest hoeyeste, osv.
   * Endrer BARE etterlysningen; trumfen kommer fra det indre laget.
   */
  if (indre.startsWith("etl:")) {
    const d = indre.slice(4).split(":");
    const nivaa = Number(d[0]);
    if (!Number.isFinite(nivaa) || nivaa < 0) {
      throw new Error(`Ugyldig etl-spek «${indre}» - forventet etl:<nivaa>:<indre>`);
    }
    return new Etterlysvelger(lagIndre(d.slice(1).join(":"), ctx), nivaa);
  }
  /**
   * `vv2:<verdener>:<finale>:<indre>` - VRAK OG TRUMF, andre forsoek.
   *
   * Harde skranker (aldri trumf, aldri ess i vraket), eksplisitte
   * renonskandidater, budprior paa verdenene og en to-trinns trakt.
   */
  if (indre.startsWith("vv2:")) {
    // vv2:<verdener>:<flagg>:<indre>, f.eks. vv2:24:telrd:nevro
    const d = indre.slice(4).split(":");
    const verdener = Number(d[0]);
    if (!Number.isFinite(verdener)) {
      throw new Error(`Ugyldig vv2-spek «${indre}» - forventet vv2:<verdener>:<flagg>:<indre>`);
    }
    const inn = lagIndre(d.slice(3).join(":"), ctx);
    const vv2Rest = utenSøk(d.slice(3).join(":"));
    return new Vrakvelger2(inn, (vv2Rest === d.slice(3).join(":") ? inn : lagIndre(vv2Rest, ctx)) as unknown as ConstructorParameters<typeof Vrakvelger2>[1], {
      verdener,
      policy: lesVrakflagg(d[1] ?? "telrd"),
    });
  }
  /**
   * `e1:<fil>[@<trofil>]` – kortnettet.
   *
   * TROFILEN ER PÅKREVD FRA v9-BREDDE OG OPP. Sanseblokken regnes ut FRA
   * troen, og uten den er 84 av 88 sansetrekk konstant null – et v9-nett ville
   * spilt på nuller uten at noe sa fra. `E1Agent` kaster derfor, og speken må
   * kunne uttrykke filen.
   */
  /**
   * `profil:<indre>` — MOTSTANDERMODELLEN.
   *
   * Bygger en løpende teori om hver ved bordet, utelukkende av det som skjer i
   * kampen som spilles nå. Påvirker i dag forsvarsverdien i budgivningen: hva
   * det er verdt å la den andre få kontrakten.
   *
   * Fester seg på budagenten om det finnes en. Uten `budm:` innenfor samler
   * den bare kunnskap uten å bruke den — det er lovlig, og nyttig for å måle
   * hva profilen VILLE sagt uten å la den påvirke spillet.
   */
  /**
   * `eks:<terskel>:<indre>` — EKSAKT SLUTTSPILL.
   *
   * Enumererer ALLE verdener som er forenlige med det setet faktisk har sett,
   * fra `terskel` gjenstående stikk og ut, og velger kortet etter snittet over
   * dem. Overstyrer bare der hele rommet lot seg enumerere innenfor taket;
   * ellers spiller det indre laget.
   *
   * IKKE DD OM IGJEN. Dobbelt dummy måler −0,609 mot poeng fordi den løser ÉN
   * verden med alle hender åpne og velger linjer som bare virker mot et
   * forsvar som ser like mye som deg. Her er informasjonsbildet VÅRT.
   *
   * MÅLT HULL SOM BEGRUNNER DEN: `fanget` er 0,830 i stikk 10 mot 0,23–0,29 i
   * stikk 0–4. Sluttspillet er nesten løst av nettet allerede — «nesten» er
   * nettopp det en eksakt løser fjerner.
   *
   * Modulen har vært bygget hele tiden og aldri vært i speken, så den har
   * aldri kunnet måles.
   */
  if (indre.startsWith("eks:")) {
    const d = delEksaktSpek(indre);
    if (d === null) throw new Error(`Ugyldig eks-spek «${indre}»`);
    return new EksaktSluttspill(lagIndre(d.indre, ctx), d.valg);
  }
  /**
   * `juks:<terskel>:<indre>` — TAKET, IKKE EN KANDIDAT.
   *
   * Ser alle fire hendene fra `terskel` gjenstående stikk og spiller det
   * dobbelt-dummy-beste kortet. Den er ULOVLIG som spiller og finnes bare for
   * å svare på ett spørsmål: hvor mye ligger det igjen i sluttspillet i det
   * hele tatt?
   *
   * Ingen strategi som bare ser sin egen hånd kan slå den. Måler `juks:5`
   * +0,4 poeng per runde, er 0,4 hele potten i de fem siste stikkene — og en
   * ekte løser av det imperfekte delspillet ville fått mindre.
   *
   * `test/ingen-juks-i-appen.test.ts` håndhever at den aldri når nettappen.
   */
  if (indre.startsWith("juks:")) {
    const d = indre.slice(5);
    const kolon = d.indexOf(":");
    if (kolon < 0) throw new Error(`Ugyldig juks-spek «${indre}»`);
    return new Juksagent(lagIndre(d.slice(kolon + 1), ctx), tall(d.slice(0, kolon), 4, "juks-terskel"));
  }
  if (indre.startsWith("profil:")) {
    const inn = lagIndre(indre.slice(7), ctx);
    const bud = (inn as unknown as Partial<Budjusterbar>).settForsvarsjustering
      ? (inn as unknown as Budjusterbar)
      : null;
    return new Profilagent(inn, bud, ctx.økt?.bok ?? null);
  }
  if (indre.startsWith("e1:")) {
    const rest = indre.slice(3);
    const at = rest.lastIndexOf("@");
    if (at < 0) {
      const n = lesNett(rest);
      /**
       * ET 714-NETT KAN IKKE SPILLE UTEN EN TRO. Sanseblokken maa fylles ved
       * SPILLETID akkurat som under treningen - ellers ser nettet 88 nuller
       * det aldri ble trent paa.
       *
       * Uten `@trofil` bruker vi `montetro`: fordelingen taalt fra de vektede
       * verdenene. Ingen 3,4 MB aa laste, og den arver hver forbedring i
       * trekningen. Kostnaden er én verdenstrekning per beslutning.
       */
      if (n.lag[0]!.inn >= 558) {
        const rng = lagRng(20260807);
        return new E1Agent(n, undefined, {
          tro: (st, sete) => monteTro(st, sete, 12, rng, lagHvemLaVekt(st, sete), 8),
        });
      }
      return new E1Agent(n);
    }
    const trosnett = new Trosnett(nettFraBytes(new Uint8Array(readFileSync(rest.slice(at + 1))))[0]!);
    return new E1Agent(lesNett(rest.slice(0, at)), undefined, { trosnett });
  }
  /**
   * `e1s:<fil>` - E1 med SOEK i VRAK og VELG.
   *
   * I dag gjoer NevroHjerne baade vraket og trumfvalget for Adams: E1Agent
   * sender alt annet enn SPILL videre til `this.nevro`. To hele
   * beslutningsfaser er altsaa overlatt til den svakeste komponenten i
   * sammensetningen, og det er aldri maalt hva det koster.
   *
   * E1Agent har mekanismen fra foer (`soekFaser`), men ingen benk har kunnet
   * be om den. Denne spekken gjoer det, saa spoersmaalet kan avgjoeres med
   * tall i stedet for antakelse.
   */
  if (indre.startsWith("e1s:")) {
    return new E1Agent(lesNett(indre.slice(4)), new NevroAgent(), {
      søkFaser: ["VRAK", "VELG"],
      søkVerdener: 12,
    });
  }
  if (indre.startsWith("ens:")) {
    const rest = indre.slice(4);
    const skille = rest.indexOf(":");
    if (skille < 0) throw new Error(`Ugyldig ensemblespek «${indre}» – forventet ens:<modus>:<filer>`);
    const modus = rest.slice(0, skille) as EnsembleModus;
    if (modus !== "snitt" && modus !== "rang" && modus !== "flertall") {
      throw new Error(`Ukjent ensemblemodus «${modus}» (snitt, rang, flertall)`);
    }
    const filer = rest
      .slice(skille + 1)
      .split(",")
      .filter((x) => x !== "");
    if (filer.length < 2) throw new Error(`Ensemble med ${filer.length} nett – bruk e1: for ett`);
    return new Ensemble(filer.map(lesNett), modus);
  }
  throw new Error(`Ukjent indre agent «${indre}» (e1:<fil> eller ens:<modus>:<filer>)`);
}
