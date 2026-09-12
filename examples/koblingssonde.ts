/**
 * KOBLINGSSONDEN — hvorfor staar en rad paa 0?
 *
 *   node examples/koblingssonde.ts > analyse/koblingssonde.txt
 *
 * `examples/koblingssjekk.ts` teller hvor mange VALG som endrer seg naar en
 * knott slaas av eller paa. Den kan si at tallet er 0. Den kan ikke si HVORFOR,
 * og de tre aarsakene krever hver sin handling:
 *
 *   (a) FRAKOBLET   parameteren naar aldri fram          -> legg ledningen
 *   (b) STUM HER    den naar fram, men kan ikke fyre i    -> lag en rad som
 *                   stillingen sjekken maaler                kan se den
 *   (c) FYRER       den fyrer og flytter ingen valg      -> tallet er ekte
 *
 * Kanal 2 var (a). Denne sonden finnes for at ingen skal maatte GJETTE hvilken
 * av de tre en ny null er — den maaler, i NOEYAKTIG de samme 219 valgene som
 * sjekken bruker, hvor mange ganger hver knott i det hele tatt HAR en stilling
 * aa virke i. En knott som aldri faar sjansen kan ikke leses som «virkningsloes».
 *
 * DEN DRIVER SPILLET MED ÉN ARM, ikke to. Sjekken bygger FULL og FULL-MINUS-X;
 * her er sporsmaalet ikke om de to er uenige, men om knotten har en aapning i
 * det hele tatt. Da holder det med A-armen, og sonden koster 1/16 av sjekken.
 */

import { opprettSpill, utfør } from "../src/index.ts";
import { lovligeKort, type GameState } from "../src/motor.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Økt } from "../src/moe2/okt.ts";
import { racepress } from "../src/moe2/race.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";

const NETT = "vakt:abmpf:e1:e1-modell/d7alle.bin";
const VR = "vr:e1-modell/vrakrang.bin:telrd";
const BUD = "budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5";
const AMU = (f: string) => `amu:foerer:${f}`;
/** Ordrett den samme strengen som `examples/koblingssjekk.ts:61`. */
const FULL = `okt:${VR}:${AMU("12k16bgm1e0r1.5v0.5")}:profil:${BUD}:${NETT}`;

// ===========================================================================
// DEL 1 — TOPOLOGIEN: naar `profil:` faktisk fester seg paa budlaget
// ===========================================================================

/**
 * `profil:` kobler seg til `settForsvarsjustering` i laget RETT UNDER seg
 * (`agentspek.ts:1643` leser `inn`, ikke treet under `inn`). Staar det et
 * soekelag imellom, finnes budagenten fortsatt — den er bare utenfor rekkevidde.
 *
 * `private` i TypeScript er en kompileringsregel, ikke en kjoeretidsregel, saa
 * feltet kan leses her. Det er med vilje: poenget er aa se hva som FAKTISK
 * staar i objektet etter at speken er bygd, ikke hva typen lover.
 */
function budleddet(agent: unknown): { funnet: boolean; koblet: boolean; dybde: number } {
  let x = agent as Record<string, unknown> | null | undefined;
  for (let dybde = 0; x != null && dybde < 30; dybde++) {
    if (typeof x["settForsvarsjustering"] === "function") {
      return { funnet: true, koblet: x["forsvarsjustering"] != null, dybde };
    }
    x = x["indre"] as Record<string, unknown> | null | undefined;
  }
  return { funnet: false, koblet: false, dybde: -1 };
}

console.log("=== DEL 1: fester «profil:» seg paa budlaget? ===");
console.log("");
/**
 * OEKTEN INJISERES GJENNOM `ctx`, ikke som `okt:` ytterst. `okt:`-grenen
 * returnerer et objektliteral (`agentspek.ts:928-937`) uten `indre`-felt, saa
 * walkeren ville stoppet paa selve wrapperen og rapportert «ingen budagent» —
 * en sondefeil som ser ut som et funn. `okt:` er idempotent naar oekten alt
 * finnes i konteksten, saa dette er den samme boten med det samme laget.
 */
const topologier: [string, string, boolean][] = [
  ["koblingssjekkens form   profil:budm:…", `profil:${BUD}:${NETT}`, false],
  ["helbotens form          profil:sik:…:budm:…", `profil:sik:alle:0.5:6k8:${BUD}:${NETT}`, false],
  ["helbotens form m/oekt   profil:sik:…:budm:…", `profil:sik:alle:0.5:6k8:${BUD}:${NETT}`, true],
];
for (const [navn, spek, medØkt] of topologier) {
  const b = budleddet(medØkt ? lagIndre(spek, { økt: new Økt() }) : lagIndre(spek));
  const st = !b.funnet ? "INGEN BUDAGENT" : b.koblet ? "KOBLET" : "*** BUDAGENT FINNES, JUSTERINGEN ER IKKE SATT ***";
  console.log(`${navn.padEnd(44)} budagent paa dybde ${String(b.dybde).padStart(2)}   ${st}`);
}

// ===========================================================================
// DEL 2 — HVA GJOER «sik:» MED EN KNOTT SOM BARE FINNES I «amu:»?
// ===========================================================================

/**
 * `r`, `d` og `B` leses av `amu:`-grenen (`agentspek.ts:1029/1034/1038`).
 * `sik:`-grenen har dem ikke. Spoersmaalet er hva som skjer om noen SKRIVER
 * dem i en sik-spek — kaster den, eller svelger den dem?
 *
 * Dette er kanal 2-lærdommen stilt som et spoersmaal om parseren i stedet for
 * om ledningen: en knott som forsvinner i stillhet er en maaling som ser ferdig
 * ut og ikke er det.
 */
console.log("");
console.log("=== DEL 2: «sik:» moett med amu-knottene r / d / B ===");
console.log("");
const sikKnotter: [string, string][] = [
  ["ren base                sik:…:12k16", `sik:alle:0.5:12k16:${NETT}`],
  ["r1.5 (kampstilling)     sik:…:12k16r1.5", `sik:alle:0.5:12k16r1.5:${NETT}`],
  ["d4   (sluttspilldybde)  sik:…:12k16d4", `sik:alle:0.5:12k16d4:${NETT}`],
  ["B4   (soekebredde)      sik:…:12k16B4", `sik:alle:0.5:12k16B4:${NETT}`],
];
for (const [navn, spek] of sikKnotter) {
  try {
    const a = lagIndre(spek) as unknown as Record<string, unknown>;
    const k = a["verdenKandidater"];
    const kTekst = typeof k === "number" ? (Number.isFinite(k) ? String(k) : "NaN") : "?";
    const st = kTekst === "NaN" ? "*** SVELGET I STILLHET - kandidater ble NaN ***" : "bygde";
    console.log(`${navn.padEnd(44)} verdenKandidater=${kTekst.padEnd(4)} ${st}`);
  } catch (e) {
    console.log(`${navn.padEnd(44)} KASTER: ${(e as Error).message.slice(0, 60)}`);
  }
}

/**
 * HVA KOSTER DEN STILLE NaN-EN? Les `sampler.ts:460` og `:463`:
 *
 *     if (!harInfo || kandidater <= 1) return trekkVerden(...)   // NaN <= 1 er FALSE
 *     for (let i = 0; i < kandidater; i++)                        // 0 < NaN er FALSE
 *
 * Loekka kjoerer null ganger, `utvalg` blir tom, og linje 482 returnerer `null`.
 * Hver eneste verdenstrekning gir altsaa null, `vurderPar` faar ingen verdener,
 * og HELE SOEKET er stille av. Under maales det: en spek med en svelget knott
 * skal da velge nøyaktig som den samme speken UTEN soekelag.
 */
console.log("");
console.log("=== DEL 2b: hva koster den svelgede knotten? ===");
console.log("");
{
  const utenSoek = [0, 1, 2, 3].map(() => lagIndre(NETT));
  const rent = [0, 1, 2, 3].map(() => lagIndre(`sik:alle:0.5:12k16:${NETT}`));
  const svelget = [0, 1, 2, 3].map(() => lagIndre(`sik:alle:0.5:12k16d4:${NETT}`));
  for (const x of [...utenSoek, ...rent, ...svelget]) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 13_000_777);
  let vakt = 0;
  let r = 0;
  let n = 0;
  let rentUlik = 0;
  let svelgetUlik = 0;
  while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < 2) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const x of [...utenSoek, ...rent, ...svelget]) x.velgHandling(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const b = JSON.stringify(utenSoek[iTur]!.velgHandling(s));
    if (JSON.stringify(rent[iTur]!.velgHandling(s)) !== b) rentUlik++;
    if (JSON.stringify(svelget[iTur]!.velgHandling(s)) !== b) svelgetUlik++;
    n++;
    s = utfør(s, JSON.parse(b) as never).state;
  }
  console.log(`avvik fra den SOEKLOESE basen over ${n} valg:`);
  console.log(`  sik:…12k16    (ren)      ${String(rentUlik).padStart(4)}   ${rentUlik > 0 ? "soeket lever" : "soeket er dodt"}`);
  console.log(
    `  sik:…12k16d4  (svelget)  ${String(svelgetUlik).padStart(4)}   ` +
      (svelgetUlik === 0 ? "*** SOEKET ER HELT AV - speken ser ut som den soeker ***" : "soeket lever"),
  );
}

// ===========================================================================
// DEL 3 — HAR KNOTTENE EN AAPNING I DE 219 VALGENE?
// ===========================================================================

/**
 * Samme froe, samme antall runder og samme loekke som `koblingssjekk.ts`, saa
 * tallene her beskriver NOEYAKTIG de valgene tabellen teller over.
 */
function sonder(runder: number): void {
  const økt = new Økt();
  const A = [0, 1, 2, 3].map(() => lagIndre(FULL, { økt }));
  for (const x of A) x.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, 13_000_777);

  let vakt = 0;
  let r = 0;
  let n = 0;
  // «r»: racepress er eksakt 0 for framdrift < 0,3 (race.ts:64).
  let amuValg = 0;
  let pressUlikNull = 0;
  let maksFramdrift = 0;
  // «d4»: slaar inn naar stikkIgjen <= 4 (amuagent.ts:344-348).
  let sluttstillinger = 0;
  // «okt:»: stilvri er null til stilen er sikker paa 2 SE (okt.ts:142).
  let stilSikker = 0;
  let maksStilZ = 0;
  // «profil:»: justering er 0 til vi har sett hoeyestbydende vinne et bud.
  let budValg = 0;
  let justeringUlikNull = 0;
  let maksJustering = 0;

  while (s.fase !== "FERDIG" && vakt++ < 40_000 && r < runder) {
    if (s.fase === "RUNDE_SLUTT") {
      for (const x of A) x.velgHandling(s);
      r++;
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    n++;

    if (s.fase === "BUDRUNDE") {
      budValg++;
      const j = økt.bok.justering(s);
      if (j !== 0) justeringUlikNull++;
      maksJustering = Math.max(maksJustering, Math.abs(j));
    }

    /**
     * AMU-LAGET ENGASJERER SEG BARE HER (amuagent.ts:272-280): fase SPILL,
     * rollen er foerer, og det finnes mer enn ett lovlig kort. Utenfor disse
     * valgene kan verken «r», «d4» eller «B4» ha en virkning i det hele tatt,
     * saa det er dem nevneren maa telle.
     */
    if (s.fase === "SPILL" && rolleFor(s, iTur) === "foerer" && lovligeKort(s, iTur).length > 1) {
      amuValg++;
      const press = racepress(s, iTur);
      if (press !== 0) pressUlikNull++;
      const mål = s.regler.målPoeng;
      let beste = 0;
      for (let p = 0; p < s.antallSpillere; p++) beste = Math.max(beste, s.totalPoeng[p] ?? 0);
      maksFramdrift = Math.max(maksFramdrift, mål <= 0 ? 0 : beste / mål);
      const stikkIgjen = s.hender[iTur]?.length ?? 0;
      if (stikkIgjen > 0 && stikkIgjen <= 4) sluttstillinger++;
      const d = økt.bok.stil(iTur);
      if (d.sikker) stilSikker++;
      if (Number.isFinite(d.se) && d.se > 0) maksStilZ = Math.max(maksStilZ, Math.abs(d.forskjell) / d.se);
    }

    s = utfør(s, A[iTur]!.velgHandling(s)).state;
  }

  const rad = (navn: string, teller: number, nevner: number, note: string): void => {
    const st = teller > 0 ? "HAR AAPNING" : "*** INGEN AAPNING - STUM HER ***";
    console.log(`${navn.padEnd(34)} ${String(teller).padStart(4)} av ${String(nevner).padStart(4)}   ${st.padEnd(34)} ${note}`);
  };
  console.log("");
  console.log(`--- ${runder} runder, ${n} valg (sjekkens nevner) ---`);
  console.log(`amu-laget engasjerer seg i ${amuValg} av dem (foerer, SPILL, >1 lovlig kort)`);
  console.log("");
  rad("  r   racepress != 0", pressUlikNull, amuValg, `maks framdrift ${(maksFramdrift * 100).toFixed(0)}% (kreves 30%)`);
  rad("  d4  stikkIgjen <= 4", sluttstillinger, amuValg, "amuagent.ts:344");
  rad("  okt: stil er sikker", stilSikker, amuValg, `maks |forskjell|/SE = ${maksStilZ.toFixed(2)} (kreves 2,0)`);
  rad("  profil: justering != 0", justeringUlikNull, budValg, `maks |justering| = ${maksJustering.toFixed(3)}`);
}

console.log("");
console.log("=== DEL 3: har knottene en aapning i valgene sjekken teller? ===");
sonder(4);
