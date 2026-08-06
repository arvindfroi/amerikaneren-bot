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

export function lagIndre(indre: string): { velgHandling(s: GameState): Handling; nyKamp(): void } {
  if (indre === "nevro") return new NevroAgent();
  if (indre.startsWith("vakt:")) {
    const v = delVaktspek(indre);
    if (v === null) throw new Error(`Ugyldig vaktspek «${indre}»`);
    return new Konvensjonsvakt(lagIndre(v.indre), v.valg);
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
    return new Vrakrangerer(lagIndre(rest.slice(b + 1)), nett, rest.slice(a + 1, b));
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
    const auk = strek4 >= 0 && rest3.slice(strek4 + 1) === "1";
    if (!Number.isFinite(ev)) throw new Error(`Ugyldig evForsvar i «${indre}»`);
    if (!Number.isFinite(sg) || sg <= 0) throw new Error(`Ugyldig sigmagulv i «${indre}»`);
    return new Budagent(lagIndre(rest.slice(skille + 1)), lesBudmodell(fil), ev, sg, ms, fv, null, auk);
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
    const inn = lagIndre(restSpek);
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
    const motpart = baseSpek === restSpek ? inn : lagIndre(baseSpek);
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
      return lagIndre(byttet) as unknown as ConstructorParameters<typeof Rolleorakel>[1];
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
    const inn = lagIndre(d.slice(3).join(":"));
    const sikRest = utenSøk(d.slice(3).join(":"));
    return new Sikkerorakel(inn, (sikRest === d.slice(3).join(":") ? inn : lagIndre(sikRest)) as unknown as ConstructorParameters<typeof Sikkerorakel>[1], {
      sigma,
      verdener,
      verdenKandidater,
      verdenKombi,
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
    const inn = lagIndre(d.slice(1).join(":"));
    const vvRest = utenSøk(d.slice(1).join(":"));
    return new Vrakvelger(inn, (vvRest === d.slice(1).join(":") ? inn : lagIndre(vvRest)) as unknown as ConstructorParameters<typeof Vrakvelger>[1], { verdener });
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
    return new Etterlysvelger(lagIndre(d.slice(1).join(":")), nivaa);
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
    const inn = lagIndre(d.slice(3).join(":"));
    const vv2Rest = utenSøk(d.slice(3).join(":"));
    return new Vrakvelger2(inn, (vv2Rest === d.slice(3).join(":") ? inn : lagIndre(vv2Rest)) as unknown as ConstructorParameters<typeof Vrakvelger2>[1], {
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
    return new EksaktSluttspill(lagIndre(d.indre), d.valg);
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
    return new Juksagent(lagIndre(d.slice(kolon + 1)), tall(d.slice(0, kolon), 4, "juks-terskel"));
  }
  if (indre.startsWith("profil:")) {
    const inn = lagIndre(indre.slice(7));
    const bud = (inn as unknown as Partial<Budjusterbar>).settForsvarsjustering
      ? (inn as unknown as Budjusterbar)
      : null;
    return new Profilagent(inn, bud);
  }
  if (indre.startsWith("e1:")) {
    const rest = indre.slice(3);
    const at = rest.lastIndexOf("@");
    if (at < 0) return new E1Agent(lesNett(rest));
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
