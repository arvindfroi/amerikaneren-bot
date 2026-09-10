/**
 * KRAVBATTERIET — «hvor står MLB mot K2–K8?», i én tabell.
 *
 *   node examples/mlb-krav.ts --vekter e1-modell/mlb-beste.bin \
 *     --tro e1-modell/mlb-tro.bin --ut analyse/mlb-krav
 *
 *   node examples/mlb-krav.ts --vekter tilfeldig7310001 --uten-tro --kjapp \
 *     --bare k4,k5,k6        # bare noen krav, små tall
 *
 * ===================== HVORFOR FILA FINNES ==============================
 *
 * Arvind: «kravene 2-8 må være godkjent for at Adams max skal ut.»
 *
 * `docs/krav-status.md` måler K2–K8 på DAGENS STAKK. Sandkassen hadde ingen
 * slik måling i det hele tatt. Når MLB begynner å virke kunne vi si om den slår
 * `rask` — og ingenting om den innfrir et eneste krav. Denne fila lukker det
 * hullet, og den EIER ikke en eneste måling: den orkestrerer prøvene og leser
 * deres egne varige rader, nøyaktig som `examples/mlb-stigen.ts` gjør mot
 * `gate2.ts`. Å skrive måltallene på nytt her ville vært den 17. forekomsten av
 * prosjektets verste feilklasse — «det målte og det utrullede var ikke samme
 * ting».
 *
 * ===================== HVA SOM ER GJENBRUKT, KRAV FOR KRAV ==============
 *
 *   K2  `test/mlb-k2-{tro,trekk,nett,selvspill}.test.ts`, kjørt med
 *       `MLB_K2_NETT=<vektfil>`. Gjenbrukt HELT. §124 fant at en K2-prøve
 *       målte arkitekturen og ikke vektene; miljøvariabelen er svaret på
 *       nettopp det, og batteriet SETTER den alltid.
 *   K3  `examples/tak-kart.ts --fase bud --spek mlb:<vekt>`. Gjenbrukt HELT.
 *       Samme verktøy som målte budtaket for dagens stakk.
 *   K7  `examples/tak-kart.ts --fase spill --fra 7 --til 11`. Gjenbrukt HELT.
 *       Det er de SISTE FEM STIKKENE — den lesningen §117 slo fast at kravet
 *       skal måles på, ikke de to siste.
 *   K8  `examples/mlb-k8.ts --nett <trofil>`. Gjenbrukt HELT. Stillingsutvalget
 *       er ordrett `tro-noyaktighet.ts` sitt, så tallet er sammenliknbart med
 *       §117 og §119.
 *   K4  `examples/mlb-k4.ts` — NY. `k4-hukommelse.ts` måler `Profilbok` og
 *       `Økt`, to lag sandkassen ikke har. Se filhodet der.
 *   K5  `examples/mlb-k5.ts` — NY. `k5-kontekst.ts` leser alpha-muens
 *       utfallsvektor, som sandkassen ikke har. Riggen er gjenbrukt, armene
 *       ikke. Se filhodet der.
 *   K6  `examples/mlb-k6.ts` — NY. `k6-vaner.ts` måler `okt:`-laget. MÅLTALLET
 *       er gjenbrukt ordrett; benken og armene er andre. Se filhodet der.
 *
 * ===================== ÉN DEFEKT FUNNET UNDERVEIS, OG DEN ER IKKE LITEN ==
 *
 * `Sandkasseagent` (`src/mlb/spekagent.ts`) eksponerer bokføringskroken som
 * `observerRunde`. `examples/kamp.ts`, `okt:`, `vr:`, `amu:`, `profil:` og
 * `sumvelger` kaller alle `observer`. Navnene møtes aldri.
 *
 * Følgen: et `mlb:`-lag på KAMPBENKEN får aldri bokført en eneste runde.
 * `Hukommelse.observer` gjør ingenting utenom `RUNDE_SLUTT`, og `velgHandling`
 * blir aldri kalt i den fasen. Hukommelsen — 144 av 1 031 innganger, og hele
 * MLB-svaret på K4 og K6 — står da eksakt null gjennom hele kampen.
 *
 * Det er BRUDD NUMMER 2 fra §K6 om igjen, ett hus lenger bort: «Kampbenken
 * fylte aldri profilboka.» Batteriet MÅLER det i stedet for å påstå det:
 * `mlb-k4.ts` har en arm (`PLANTET-utikk`) som er et nett med en beviselig
 * hukommelseseffekt og et tikk som aldri kalles, og den måler 0,0000.
 *
 * Fiksen hører hjemme i `src/mlb/spekagent.ts` (et alias `observer`), og den
 * fila eies av en annen økt. Derfor står defekten her som et målt funn, og
 * K4/K6-prøvene bruker drivere som tikker riktig (`spillKamp` fra
 * `src/mlb/selvspill.ts`, som kaller `bok.observer(s)` i sin egen løkke).
 *
 * ===================== HVER RAD HAR EN KONTROLL OG EN FELLE =============
 *
 * `AdamsMax.md`, vedlegget: kontrollarmen må måle eksakt 0,0000 (gate 2) eller
 * 0,2500 (kampbenken), og en prøve som ikke kan feile er ikke en prøve. Begge
 * står i tabellen, per krav, og en rad der kontrollen bommer eller fella ikke
 * slår merkes STUM — tallet skal da ikke leses.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { ADAMS_MAALT, tall } from "../src/moe2/agentspek.ts";
import { fmt, mlbSpek, Radskriver, se, snitt, tegntest } from "./mlb-krav-felles.ts";

// ===========================================================================
// 1. Dagens stakk — ARKIVERTE tall, med kilde
// ===========================================================================

/**
 * TALLENE FOR DAGENS STAKK ER SITERT, IKKE MÅLT PÅ NYTT — bortsett fra K3 og
 * K7, der batteriet kjører samme verktøy på samme giv i begge armene.
 *
 * Grunnen til skillet: K3 og K7 måles av `tak-kart.ts`, som tar `--spek` og
 * derfor kan settes på `ADAMS_MAALT` uten en eneste ny linje. K4, K5, K6 og K8
 * måles av prøver som er bygd rundt hver sin stakk, og en «ny måling av dagens
 * stakk» der ville vært en ny prøve — altså et annet tall enn det
 * `docs/krav-status.md` har.
 *
 * Kilden står i kolonnen, slik at et sitat aldri kan forveksles med en måling.
 */
export const DAGENS: Record<string, { verdi: string; kilde: string }> = {
  K2: { verdi: "0 avvik", kilde: "krav-status.md K2 (BEVIST)" },
  K3: { verdi: "41,8 % av budtaket igjen", kilde: "krav-status.md K3" },
  K4: { verdi: "ubevist — benken kan ikke vise det", kilde: "krav-status.md K4" },
  K5: { verdi: "0 av 20 endret i «bak 70–90»", kilde: "krav-status.md K5" },
  K6: { verdi: "vekst z = 0,23", kilde: "krav-status.md K6" },
  K7: { verdi: "+0,947 poeng/runde igjen ved fem stikk", kilde: "krav-status.md K7 / §117" },
  K8: { verdi: "12,34 % av veien gulv → tak", kilde: "krav-status.md K8 / §119" },
};

// ===========================================================================
// 2. Én rad i tabellen
// ===========================================================================

export interface Kravrad {
  readonly krav: string;
  /**
   * FRØBÅNDET raden ble målt i.
   *
   * `AdamsMax.md`-vedlegget punkt 1: «replikert i disjunkte frøbånd». Det er
   * ikke pynt — auksjonskorreksjonen (§65) hadde z = 0,71 i ett bånd og 0,54 i
   * det neste og ble forkastet på nettopp det. Kjøres batteriet med to bånd,
   * står hver krav to ganger i tabellen, og en effekt som bare finnes i det ene
   * er synlig i stedet for utjevnet.
   */
  readonly bånd: number;
  readonly navn: string;
  /** Måltallet, formatert med sin egen enhet. */
  readonly målt: string;
  /** Kontrollarmen og dens kjente verdi. */
  readonly kontroll: string;
  readonly kontrollOk: boolean;
  /** Falsifiseringsarmen — ble den tatt? */
  readonly felle: string;
  readonly felleOk: boolean;
  readonly innfridd: "ja" | "nei" | "stum" | "ikke målbar";
  readonly kilde: string;
  readonly merknad: string;
}

// ===========================================================================
// 3. Verktøy
// ===========================================================================

function kjørNode(args: string[], env: Record<string, string> = {}): { ok: boolean; ut: string } {
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: r.status === 0, ut: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function lesJsonl<T>(sti: string): T[] {
  if (!existsSync(sti)) return [];
  return readFileSync(sti, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as T);
}

/**
 * Snitt, SE OG TEGNTEST av `diff` i en `tak-kart`-fil. Måltallet for K3 og K7.
 *
 * Tegntesten står ved siden av snittet fordi rundepoengene har ±50 og ±100 i
 * halene: to tredeler av de +0,947 i K7 lå i 16 giver av 1 000 (§117), så et
 * snitt uten tegnet bak seg kan være båret av en håndfull kontraktvipp.
 */
function takGap(sti: string): {
  n: number;
  snitt: number;
  se: number;
  pos: number;
  neg: number;
  p: number;
} {
  const d = lesJsonl<{ diff: number }>(sti).map((r) => r.diff);
  const pos = d.filter((x) => x > 0).length;
  const neg = d.filter((x) => x < 0).length;
  return { n: d.length, snitt: snitt(d), se: se(d), pos, neg, p: tegntest(pos, pos + neg) };
}

// ===========================================================================
// 4. Prøvene
// ===========================================================================

interface Rigg {
  readonly vekt: string;
  readonly tro: string | null;
  readonly utBase: string;
  readonly giver: number;
  /**
   * EGET GIVTALL FOR BUDVINDUET, og det er ikke en bekvemmelighet.
   *
   * `tak-kart.ts` forgreiner seg over VÅRE valg inne i vinduet, altså ~b^v
   * blader. Budvinduet har `BUDSJETT = 4` og en b på opptil elleve bud, og
   * hvert blad er en HEL runde spilt av fire nett. Trikkvinduet har b ≈ 2–3.
   * Målt i røykmodus: budvinduet skrev ni rader på ti minutter der
   * sluttspillvinduet var ferdig på under ett.
   *
   * Med ett felles `--giver` måtte enten K3 vært uframkommelig eller K7 vært
   * tynt. To tall løser det, og begge står i rapporten.
   */
  readonly budGiver: number;
  /** Frøbåndets basis. Disjunkte bånd = disjunkte tallrekker, ingen overlapp. */
  readonly frø: number;
  /** Båndets nummer, bare for merking i tabellen. */
  readonly bånd: number;
  readonly kamper: number;
  readonly målPoeng: number;
  readonly maksRunder: number;
  readonly målRunde: number;
}

// --------------------------------------------------------------------------

const K2_PRØVER = [
  "test/mlb-k2-tro.test.ts",
  "test/mlb-k2-trekk.test.ts",
  "test/mlb-k2-nett.test.ts",
  "test/mlb-k2-selvspill.test.ts",
];

function k2(r: Rigg): Kravrad {
  /**
   * `MLB_K2_NETT` SETTES ALLTID. Uten den bygger `mlb-k2-nett.test.ts` og
   * `mlb-k2-selvspill.test.ts` sine egne stillasnett, og da er K2 en attest på
   * ARKITEKTUREN. Det var nettopp hullet §124 fant.
   */
  const res = kjørNode(["--test", ...K2_PRØVER], { MLB_K2_NETT: r.vekt });
  /**
   * BEGGE RAPPORTFORMENE. `node --test` skriver «# pass N» med TAP-rapportøren
   * og «ℹ pass N» med `spec`, som er standard når utdata er et rør. Første
   * utkast leste bare den første og skrev «? prøver grønne» i tabellen — et
   * spørsmålstegn der et tall skulle stått, i den ene raden som kan avgjøres
   * absolutt.
   */
  const pass = /^(?:#|ℹ)\s*pass (\d+)/m.exec(res.ut)?.[1] ?? "?";
  const fail = /^(?:#|ℹ)\s*fail (\d+)/m.exec(res.ut)?.[1] ?? "?";
  /**
   * FELLA ER ALLEREDE INNE I PRØVENE: hver av de fire har en jukserarm som
   * lekker ÉN bit og skal bli tatt. Kjøres de grønt, har begge halvdelene
   * passert. Går en av jukserarmene grønn uten å ta noe, feiler filen selv.
   */
  const jukserne = (res.ut.match(/kan FEILE/g) ?? []).length;
  return {
    krav: "K2",
    bånd: r.bånd,
    navn: "aldri jukse",
    målt: `${pass} prøver grønne, ${fail} røde`,
    kontroll: "bit-identisk valg under bytte av skjulte hender",
    kontrollOk: res.ok,
    felle: `${jukserne} jukserarmer (én bit lekket) — må bli tatt`,
    felleOk: res.ok && jukserne >= 4,
    innfridd: res.ok && jukserne >= 4 ? "ja" : "nei",
    kilde: K2_PRØVER.join(" "),
    merknad:
      `MLB_K2_NETT=${r.vekt} — prøvene kjørte VEKTENE, ikke bare arkitekturen. ` +
      `mlb-k2-tro og mlb-k2-trekk måler trekkvektoren og er vektuavhengige av natur.`,
  };
}

// --------------------------------------------------------------------------

/**
 * K3 og K7 er samme verktøy i to vinduer, så de deler kode.
 *
 * KONTROLLARMEN ER ET TOMT VINDU (`--fra 99 --til 99`). Da er `iVindu` aldri
 * sann, taklinja brukes aldri, og de to gjennomspillingene er bit-identiske:
 * gapet MÅ bli eksakt +0,0000. Det er `tak-kart.ts` sin egen 0,0000, og den
 * fantes ikke før — kartet ble lest uten en nullarm.
 */
function takvindu(
  krav: "K3" | "K7",
  navn: string,
  r: Rigg,
  vindu: string[],
  port: string,
): Kravrad {
  const spek = mlbSpek({ vekt: r.vekt, tro: r.tro });
  const base = `${r.utBase}-${krav.toLowerCase()}`;
  const giver = krav === "K3" ? r.budGiver : r.giver;
  const kjør = (merke: string, sp: string, v: string[]): ReturnType<typeof takGap> => {
    const fil = `${base}-${merke}.jsonl`;
    new Radskriver(fil);
    kjørNode([
      "examples/tak-kart.ts",
      "--giver", String(giver),
      "--froe", String(r.frø),
      "--spek", sp,
      "--merke", merke,
      "--ut", fil,
      ...v,
    ]);
    return takGap(fil);
  };

  const mlb = kjør("mlb", spek, vindu);
  const stakk = kjør("stakk", ADAMS_MAALT, vindu);
  // FELLA: et tomt vindu MÅ gi eksakt 0. Slår den ikke til, måler kartet noe
  // annet enn vinduet — og da er begge tallene over uleselige.
  // Kontrollen er BILLIG uansett vindu — den forgreiner seg aldri — men den
  // skal ha samme antall giv som armen den kontrollerer, ellers er den ikke
  // den samme målingen.
  const tom = kjør("tomtvindu", spek, ["--fase", "spill", "--fra", "99", "--til", "99"]);

  /**
   * PORTEN ER «GAPET ER INNENFOR 2 SE AV NULL» — og den er FARLIG ALENE.
   *
   * Med få giv er SE stor, og da er ALT innenfor 2 SE. En måling uten kraft
   * ville dermed levert «innfridd» for et hvilket som helst nett. Målt i
   * røykmodus: 8 rader ga +7,88 ± 4,01, altså «ja».
   *
   * Kraften måles derfor av FELLA: dagens stakk i nøyaktig samme vindu på
   * nøyaktig samme giv. Har den ikke et påvisbart gap heller, kan ikke
   * målingen skille en lukket port fra en tom benk, og raden er STUM.
   */
  const innfridd = Number.isFinite(mlb.snitt) && Math.abs(mlb.snitt) <= 2 * mlb.se;
  const kontrollOk = tom.n > 0 && Math.abs(tom.snitt) < 1e-9;
  const felleOk = Number.isFinite(stakk.snitt) && stakk.snitt > 2 * stakk.se;
  return {
    krav,
    bånd: r.bånd,
    navn,
    målt:
      `${fmt(mlb.snitt)} ± ${mlb.se.toFixed(4)} poeng/runde igjen ` +
      `(n=${mlb.n}, ${mlb.pos}/${mlb.pos + mlb.neg} opp, p=${mlb.p.toFixed(3)})`,
    kontroll: `tomt vindu: ${fmt(tom.snitt)} (må være +0,0000)`,
    kontrollOk,
    felle: `dagens stakk i samme vindu, samme giv: ${fmt(stakk.snitt)} ± ${stakk.se.toFixed(4)}`,
    felleOk,
    innfridd: !kontrollOk || !felleOk ? "stum" : innfridd ? "ja" : "nei",
    kilde: `examples/tak-kart.ts ${vindu.join(" ")}`,
    merknad: port,
  };
}

// --------------------------------------------------------------------------

function k4(r: Rigg): Kravrad {
  const base = `${r.utBase}-k4`;
  kjørNode([
    "examples/mlb-k4.ts",
    "--vekter", r.vekt,
    ...(r.tro === null ? ["--uten-tro"] : ["--tro", r.tro]),
    "--kamper", String(r.kamper),
    "--maalrunde", String(r.målRunde),
    "--maalpoeng", String(r.målPoeng),
    "--maksrunder", String(r.maksRunder),
    "--froe", String(r.frø),
    "--ut", base,
  ]);
  const rader = lesJsonl<{ arm: string; ulikt: number }>(`${base}.jsonl`);
  const andel = (arm: string): { n: number; a: number } => {
    const x = rader.filter((y) => y.arm === arm);
    return { n: x.length, a: x.length === 0 ? NaN : x.reduce((s, y) => s + y.ulikt, 0) / x.length };
  };
  const kontroll = andel("KONTROLL");
  const mlb = andel("mlb");
  const plantet = andel("PLANTET");
  const utikk = andel("PLANTET-utikk");
  const kOk = kontroll.n > 0 && kontroll.a === 0;
  return {
    krav: "K4",
    bånd: r.bånd,
    navn: "hukommelse over hele spillet",
    målt: `${fmt(mlb.a)} av valgene endres av hukommelsen (n=${mlb.n})`,
    kontroll: `h0 mot h0: ${fmt(kontroll.a)} (må være +0,0000)`,
    kontrollOk: kOk,
    felle: `plantet hukommelsesnett: ${fmt(plantet.a)}, samme nett uten tikk: ${fmt(utikk.a)}`,
    felleOk: plantet.a > 0.5 && utikk.a === 0,
    innfridd: !kOk || !(plantet.a > 0.5) ? "stum" : mlb.a > 0 ? "ja" : "nei",
    kilde: `${base}.txt`,
    merknad:
      "PRØVE B (framoverblikk, alpha-mu M≥2) er IKKE MÅLBAR: sandkassen har " +
      "ingen alpha-mu, og `Sete.søk` står av i hver driver (AVGJØRELSE 5). " +
      "«PLANTET-utikk = +0,0000» er defekten `observerRunde` mot `observer`.",
  };
}

// --------------------------------------------------------------------------

function k5(r: Rigg): Kravrad {
  const base = `${r.utBase}-k5`;
  kjørNode([
    "examples/mlb-k5.ts",
    "--vekter", r.vekt,
    ...(r.tro === null ? ["--uten-tro"] : ["--tro", r.tro]),
    "--giver", String(r.giver),
    "--froe", String(r.frø),
    "--ut", base,
  ]);
  type Rad = { arm: string; fase?: string; ulikt: number; tv: number; budgap?: number };
  const rader = lesJsonl<Rad>(`${base}.jsonl`);
  const d = (arm: string) => {
    const alle = rader.filter((y) => y.arm === arm);
    const x = alle.filter((y) => y.fase !== "BUD");
    const b = alle.filter((y) => y.fase === "BUD");
    const høyere = b.filter((y) => (y.budgap ?? 0) > 1e-12).length;
    const lavere = b.filter((y) => (y.budgap ?? 0) < -1e-12).length;
    return {
      n: x.length,
      andel: x.length === 0 ? NaN : x.reduce((s, y) => s + y.ulikt, 0) / x.length,
      tv: snitt(x.map((y) => y.tv)),
      budN: b.length,
      budNull: b.every((y) => (y.budgap ?? 0) === 0),
      budGap: snitt(b.map((y) => y.budgap ?? 0)),
      budSe: se(b.map((y) => y.budgap ?? 0)),
      høyere,
      lavere,
      p: tegntest(høyere, høyere + lavere),
    };
  };
  const kontroll = d("KONTROLL");
  const mlb = d("mlb");
  const plantet = d("PLANTET");
  const pluss = d("PLANTET+BUD");
  const minus = d("PLANTET-BUD");
  const kOk =
    kontroll.n > 0 && kontroll.andel === 0 && kontroll.tv === 0 && kontroll.budN > 0 && kontroll.budNull;
  /**
   * PORTEN HAR TO LEDD, og det andre er det kravet faktisk sier: «å ligge under
   * skal gi mer risiko». Endring alene er ikke tilpasning — retningen må være
   * riktig.
   *
   * ============ RETNINGEN MÅLES PÅ BUDET, IKKE PÅ VERDIHODET (10. sep) ======
   *
   * Første utgave dømte på V(bak) < V(foran). Under seiersmålet spår V endringen
   * i vinnersjanse fra tavla, og den er ≈ 0 både bak og foran: i2 fikk «nei» på
   * 150 av 360, nær tilfeldig, mens i1b med poengverdi fikk «ja». Det var et
   * skifte i enhet, ikke i evne. Retningen er nå: bak skal by HØYERE enn foran,
   * med tegntest, og fella har to armer som må tas hver sin vei.
   */
  const retning = mlb.høyere > mlb.lavere && mlb.p < 0.05;
  const felleOk =
    plantet.andel > 0.5 &&
    pluss.høyere > pluss.lavere &&
    pluss.p < 0.05 &&
    minus.lavere > minus.høyere &&
    minus.p < 0.05;
  return {
    krav: "K5",
    bånd: r.bånd,
    navn: "forstå konteksten og tilpasse seg",
    målt:
      `${fmt(mlb.andel)} endrede kortvalg, TV ${fmt(mlb.tv)} (n=${mlb.n}); ` +
      `BUD bak høyere i ${mlb.høyere} av ${mlb.høyere + mlb.lavere} (p=${mlb.p.toFixed(3)}), ` +
      `budgap ${fmt(mlb.budGap)} ± ${mlb.budSe.toFixed(4)} (n=${mlb.budN})`,
    kontroll: `lik stilling: ${fmt(kontroll.andel)} endret, TV ${fmt(kontroll.tv)}, budgap ${fmt(kontroll.budGap)} (må være +0,0000)`,
    kontrollOk: kOk,
    felle:
      `plantet på racepress: ${fmt(plantet.andel)} endret; ` +
      `PLANTET+BUD bak høyere ${pluss.høyere}/${pluss.høyere + pluss.lavere}, ` +
      `PLANTET-BUD bak lavere ${minus.lavere}/${minus.høyere + minus.lavere}`,
    felleOk,
    innfridd: !kOk || !felleOk ? "stum" : mlb.andel > 0 && retning ? "ja" : "nei",
    kilde: `${base}.txt`,
    merknad:
      "Retningen måles på POLICYEN I BUDET (bak skal by høyere), ikke på verdihodet: " +
      "under seiersmålet er V(bak) − V(foran) ≈ 0 per konstruksjon. Se " +
      "analyse/krav-samspill-2026-09-10.md §3A.",
  };
}

// --------------------------------------------------------------------------

function k6(r: Rigg): Kravrad {
  const base = `${r.utBase}-k6`;
  kjørNode([
    "examples/mlb-k6.ts",
    "--vekter", r.vekt,
    ...(r.tro === null ? ["--uten-tro"] : ["--tro", r.tro]),
    "--kamper", String(r.kamper),
    "--maalpoeng", String(r.målPoeng),
    "--maksrunder", String(r.maksRunder),
    "--froe", String(r.frø),
    "--ut", base,
  ]);
  type Rad = { arm: string; rundeNr: number; dd: number };
  const rader = lesJsonl<Rad>(`${base}.jsonl`);
  const d = (arm: string) => {
    const x = rader.filter((y) => y.arm === arm);
    const dd = x.map((y) => y.dd);
    const xs = x.map((y) => y.rundeNr);
    const n = xs.length;
    let b = NaN;
    let bse = NaN;
    if (n >= 3) {
      const xm = snitt(xs);
      const ym = snitt(dd);
      let sxy = 0;
      let sxx = 0;
      for (let i = 0; i < n; i++) {
        sxy += (xs[i]! - xm) * (dd[i]! - ym);
        sxx += (xs[i]! - xm) ** 2;
      }
      if (sxx > 0) {
        b = sxy / sxx;
        const a = ym - b * xm;
        let rss = 0;
        for (let i = 0; i < n; i++) rss += (dd[i]! - (a + b * xs[i]!)) ** 2;
        bse = Math.sqrt(rss / (n - 2) / sxx);
      }
    }
    return { n, dd: snitt(dd), ddSe: se(dd), b, bse };
  };
  const kontroll = d("KONTROLL");
  const mlb = d("mlb");
  const plantet = d("PLANTET");
  const kOk = kontroll.n > 0 && Math.abs(kontroll.dd) < 1e-9;
  const felleOk = Math.abs(plantet.dd) > 3 * plantet.ddSe;
  return {
    krav: "K6",
    bånd: r.bånd,
    navn: "lære vaner og utnytte dem",
    målt:
      `stigning ${fmt(mlb.b)} ± ${mlb.bse.toFixed(4)} per runde ` +
      `(z = ${(mlb.b / mlb.bse).toFixed(2)}), nivå dd ${fmt(mlb.dd, 3)} ± ${mlb.ddSe.toFixed(3)}, n=${mlb.n}`,
    kontroll: `h0 mot h0: dd ${fmt(kontroll.dd)} (må være +0,0000 på hver rad)`,
    kontrollOk: kOk,
    felle: `plantet hukommelsesnett: dd ${fmt(plantet.dd, 3)} ± ${plantet.ddSe.toFixed(3)}`,
    felleOk,
    innfridd: !kOk || !felleOk ? "stum" : mlb.b > 2 * mlb.bse ? "ja" : "nei",
    kilde: `${base}.txt`,
    merknad:
      "Motstanderne er VANER_TEST — aldri i treningsligaen. Porten er " +
      "STIGNINGEN, ikke nivået: et positivt nivå betyr bare at hukommelsen " +
      "hjelper, ikke at den lærer i løpet.",
  };
}

// --------------------------------------------------------------------------

function k8(r: Rigg): Kravrad {
  if (r.tro === null) {
    return {
      krav: "K8",
      bånd: r.bånd,
      navn: "predikere motstandernes kort",
      målt: "ikke kjørt — ingen trofil",
      kontroll: "—",
      kontrollOk: false,
      felle: "—",
      felleOk: false,
      innfridd: "ikke målbar",
      kilde: "examples/mlb-k8.ts",
      merknad: "K8 måler TROHODET. Uten `--tro <fil>` finnes det ikke noe hode å måle.",
    };
  }
  const fil = `${r.utBase}-k8.jsonl`;
  new Radskriver(fil);
  kjørNode([
    "examples/mlb-k8.ts",
    "--giver", String(r.giver),
    "--nett", r.tro,
    "--sandkasse", r.vekt,
    "--froe", String(r.frø),
    "--ut", fil,
  ]);
  type Rad = { gulv: number; gulvPluss: number; nett: number; sandkasse?: number; av?: number; bayes?: number };
  const rader = lesJsonl<Rad>(fil);
  /**
   * ANDELEN AV VEIEN GULV → TAK, nøyaktig som §119 regner den: gulvet er
   * uniform over tre seter (`ln 3`), taket er klarsyn (log-tap 0).
   */
  const andel = (x: number): number => (Math.log(3) - x) / Math.log(3);
  const nett = snitt(rader.map((x) => x.nett));
  const gulvPluss = snitt(rader.map((x) => x.gulvPluss));
  const gulvMålt = snitt(rader.map((x) => x.gulv));
  const nettSe = se(rader.map((x) => x.nett));
  const slårGulv = Number.isFinite(nett) && nett < gulvPluss;
  // NETTETS EGET TROHODE (10. sep): trosnettFILA over er fast under RL, så den
  // raden sto stille uansett hva en epoke gjorde. Hodet i sandkassenettet trenes.
  const sk = rader.filter((x) => typeof x.sandkasse === "number").map((x) => x.sandkasse!);
  const skSnitt = snitt(sk);
  const skSe = se(sk);
  return {
    krav: "K8",
    bånd: r.bånd,
    navn: "predikere motstandernes kort",
    målt:
      `${(100 * andel(nett)).toFixed(2)} % av veien gulv → tak (log-tap ${nett.toFixed(4)} ± ${nettSe.toFixed(4)}, n=${rader.length})` +
      (sk.length > 0
        ? `; nettets EGET trohode ${(100 * andel(skSnitt)).toFixed(2)} % (log-tap ${skSnitt.toFixed(4)} ± ${skSe.toFixed(4)})`
        : ""),
    kontroll:
      `gulvet i FILA = ${gulvMålt.toFixed(5)} mot ln 3 = ${Math.log(3).toFixed(5)}; ` +
      `gulv+ = ${gulvPluss.toFixed(4)} → ${(100 * andel(gulvPluss)).toFixed(2)} %`,
    /**
     * KONTROLLEN LESER GULVET UT AV DATAENE, ikke ut av formelen.
     *
     * Første utkast sammenliknet `andel(ln 3)` med 0 — en tautologi som er sann
     * uansett hva fila inneholder. Nå kreves det at `gulv`-kolonnen `mlb-k8.ts`
     * FAKTISK skrev er `ln 3` (den skrives som `-log(1/3)` per kort). Er den
     * ikke det, er skalaen prosentandelen regnes mot en annen enn §119 sin, og
     * tallene kan ikke sammenliknes med 12,34 %.
     *
     * Den er fortsatt den svakeste av de sju kontrollene, og det skal stå.
     */
    kontrollOk: rader.length > 0 && Math.abs(gulvMålt - Math.log(3)) < 1e-4,
    felle: `slår trohodet gulv+? ${slårGulv ? "ja" : "NEI"}`,
    felleOk: slårGulv,
    innfridd: rader.length === 0 ? "stum" : slårGulv ? "ja" : "nei",
    kilde: "examples/mlb-k8.ts",
    merknad:
      "Kravet har ingen absolutt terskel — «veldig høyt nivå» er et tall " +
      "mellom gulv og tak. Porten her er den svakest mulige som betyr noe: " +
      "slår den `gulv+`, altså renonsene alene. Første tall er trosnettFILA, som er " +
      "fast under RL-trening; «nettets EGET trohode» er hodet i sandkassenettet, trent " +
      "hver epoke, og det er det epoker sammenliknes på.",
  };
}

// ===========================================================================
// 5. Kjøringen
// ===========================================================================

const ALLE: Record<string, (r: Rigg) => Kravrad> = {
  k2,
  k3: (r) =>
    takvindu("K3", "optimalt i alle faser (budrunden)", r, ["--fase", "bud"],
      "Innfridd når gapet til budtaket er innenfor 2 SE av null. Budrunden er " +
      "det største gapet dagens stakk har, og det eneste vinduet stort nok for K1."),
  k4,
  k5,
  k6,
  k7: (r) =>
    takvindu("K7", "matematisk optimalt sluttspill", r,
      ["--fase", "spill", "--fra", "7", "--til", "11"],
      "DE SISTE FEM STIKKENE, ikke de to. §117: «K7 hvilte på den trangeste " +
      "mulige lesningen av sitt eget ord.» Taket er klarsynt — en MÅLESTOKK, " +
      "ikke en inngang til boten."),
  k8,
};

function kjør(): void {
  let vekt = "e1-modell/mlb-beste.bin";
  let tro: string | null = "e1-modell/mlb-tro.bin";
  let utBase = "analyse/mlb-krav";
  let bare: string[] = [];
  let giver = 120;
  let budGiver = 30;
  let kamper = 6;
  let målPoeng = 300;
  let maksRunder = 40;
  let målRunde = 8;
  /**
   * DISJUNKTE FRØBÅND. Ett bånd er standard fordi batteriet er dyrt; to er det
   * `AdamsMax.md`-vedlegget krever før noe adopteres. Båndene er 50 millioner
   * fra hverandre, og hver prøve stepper med under 10 000 per giv, så de kan
   * ikke overlappe uansett hvor stort `--giver` settes.
   */
  let bånd = [7_700_000];

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    const v = process.argv[i + 1];
    if (a === "--vekter") vekt = v ?? vekt;
    else if (a === "--tro") tro = v ?? tro;
    else if (a === "--uten-tro") tro = null;
    else if (a === "--ut") utBase = v ?? utBase;
    else if (a === "--bare") bare = (v ?? "").split(",").filter((x) => x !== "").map((x) => x.toLowerCase());
    else if (a === "--giver") giver = tall(v, giver, "--giver");
    else if (a === "--budgiver") budGiver = tall(v, budGiver, "--budgiver");
    else if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
    else if (a === "--maalpoeng") målPoeng = tall(v, målPoeng, "--maalpoeng");
    else if (a === "--maksrunder") maksRunder = tall(v, maksRunder, "--maksrunder");
    else if (a === "--maalrunde") målRunde = tall(v, målRunde, "--maalrunde");
    else if (a === "--band") bånd = (v ?? "").split(",").filter((x) => x !== "").map((x) => tall(x, 0, "--band"));
    else if (a === "--to-band") bånd = [7_700_000, 57_700_000];
    else if (a === "--kjapp") {
      // RØYKMODUS. Tallene er da IKKE en kravdom — de viser at apparatet
      // virker. Det står i rapporten, ikke bare her.
      giver = 6;
      budGiver = 2;
      kamper = 2;
      målPoeng = 120;
      maksRunder = 12;
      målRunde = 4;
    }
  }

  const navn = bare.length === 0 ? Object.keys(ALLE) : bare.filter((k) => k in ALLE);
  if (navn.length === 0) throw new Error(`Ingen kjente krav i «${bare.join(",")}». Finnes: ${Object.keys(ALLE).join(", ")}`);

  /**
   * TABELLEN SKRIVES RAD FOR RAD, mens den lages. Batteriet er timer langt, og
   * en kjøring som bare skriver til slutt er en kjøring som kan gå tapt — det
   * har skjedd her før, og notatet «Langkjøringer trenger varig logg» finnes
   * nettopp fordi stdout-røret løy fire ganger på én natt.
   */
  const tsv = new Radskriver(
    `${utBase}.tsv`,
    "krav\tband\tnavn\tmaalt\tkontroll\tkontroll_ok\tfelle\tfelle_ok\tinnfridd\tdagens_stakk\tkilde",
  );

  const rader: Kravrad[] = [];
  const t0 = Date.now();
  for (let b = 0; b < bånd.length; b++) {
    /**
     * HVERT BÅND FÅR SIN EGEN UTBASE når det er mer enn ett. Uten det ville
     * bånd 2 skrevet over bånd 1s råfiler, og «replikert i disjunkte frøbånd»
     * hadde vært en påstand uten data bak seg.
     */
    const rigg: Rigg = {
      vekt,
      tro,
      utBase: bånd.length === 1 ? utBase : `${utBase}-b${b}`,
      giver,
      budGiver,
      frø: bånd[b]!,
      bånd: b,
      kamper,
      målPoeng,
      maksRunder,
      målRunde,
    };
    for (const n of navn) {
      process.stderr.write(`\n=== ${n.toUpperCase()} bånd ${b} (frø ${rigg.frø}) — kjører ===\n`);
      const rad = ALLE[n]!(rigg);
      rader.push(rad);
      tsv.rad(
        [
          rad.krav,
          rad.bånd,
          rad.navn,
          rad.målt,
          rad.kontroll,
          rad.kontrollOk ? "OK" : "BOMMET",
          rad.felle,
          rad.felleOk ? "TATT" : "SLAPP UNNA",
          rad.innfridd,
          DAGENS[rad.krav]?.verdi ?? "—",
          rad.kilde,
        ].join("\t"),
      );
      process.stderr.write(`  ${rad.krav} b${b}: ${rad.målt}  [${rad.innfridd}]\n`);
    }
  }

  const L: string[] = [];
  L.push("MLB MOT KRAVENE K2–K8");
  L.push("");
  L.push(`Vekter:    ${vekt}`);
  L.push(`Tro:       ${tro ?? "AV"}`);
  L.push(`Spek:      ${mlbSpek({ vekt, tro })}`);
  L.push(`Omfang:    ${giver} giv (${budGiver} i budvinduet), ${kamper} kamper per vane, løp til ${målPoeng} (maks ${maksRunder} runder)`);
  L.push(`Frøbånd:   ${bånd.join(", ")}${bånd.length === 1 ? "  — ETT BÅND. Vedlegget krever to før noe adopteres (--to-band)." : "  — disjunkte"}`);
  L.push(`Kjøretid:  ${Math.round((Date.now() - t0) / 1000)} s`);
  L.push("");
  for (const r of rader) {
    L.push(`--- ${r.krav} — ${r.navn}${bånd.length > 1 ? ` (bånd ${r.bånd}, frø ${bånd[r.bånd]})` : ""} ---`);
    L.push(`  MÅLT       ${r.målt}`);
    L.push(`  KONTROLL   ${r.kontroll}   [${r.kontrollOk ? "OK" : "BOMMET"}]`);
    L.push(`  FELLE      ${r.felle}   [${r.felleOk ? "TATT" : "SLAPP UNNA"}]`);
    L.push(`  DAGENS     ${DAGENS[r.krav]?.verdi ?? "—"}   (${DAGENS[r.krav]?.kilde ?? "—"})`);
    L.push(`  INNFRIDD   ${r.innfridd.toUpperCase()}`);
    L.push(`  Kilde      ${r.kilde}`);
    L.push(`  Merknad    ${r.merknad}`);
    L.push("");
  }
  const innfridde = rader.filter((r) => r.innfridd === "ja").length;
  const stumme = rader.filter((r) => r.innfridd === "stum").length;
  L.push(`${innfridde} av ${rader.length} rader lukket porten sin.`);
  if (bånd.length > 1) {
    /**
     * REPLIKASJONEN ER EN EGEN DOM. §65: auksjonskorreksjonen hadde z = 0,71 i
     * ett bånd og 0,54 i det neste, og ble forkastet på nettopp det. Et krav
     * som bare innfris i ETT bånd er ikke innfridd.
     */
    const perKrav = new Map<string, string[]>();
    for (const r of rader) perKrav.set(r.krav, [...(perKrav.get(r.krav) ?? []), r.innfridd]);
    const sprikende = [...perKrav].filter(([, v]) => new Set(v).size > 1).map(([k]) => k);
    L.push(
      sprikende.length === 0
        ? "Alle krav gir samme dom i begge bånd."
        : `SPRIKER MELLOM BÅNDENE: ${sprikende.join(", ")}. Et krav som bare innfris i ETT bånd er IKKE innfridd.`,
    );
  }
  if (stumme > 0) {
    L.push(
      `${stumme} rad(er) er STUMME: kontrollarmen bommet eller fella slapp unna. ` +
        `De tallene skal ikke leses — prøven målte ikke det den sier den måler.`,
    );
  }
  L.push("");
  L.push("«DAGENS» ER SITERT FOR K2, K4, K5, K6 og K8 og MÅLT FOR K3 og K7.");
  L.push("Skillet er ikke pynt: `tak-kart.ts` tar `--spek` og kan derfor settes på");
  L.push("ADAMS_MAALT på nøyaktig samme giv. De andre prøvene er bygd rundt hver");
  L.push("sin stakk, og en «ny måling av dagens stakk» der ville vært en annen");
  L.push("prøve enn den `docs/krav-status.md` siterer.");

  const tekst = L.join("\n");
  new Radskriver(`${utBase}.txt`).rad(tekst);
  process.stderr.write(`\n${tekst}\n\nSkrevet: ${utBase}.tsv og ${utBase}.txt\n`);
}

const inngang = process.argv[1];
if (inngang !== undefined && import.meta.url === pathToFileURL(inngang).href) kjør();
