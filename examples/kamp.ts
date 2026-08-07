/**
 * KAMPBENKEN — måler det målet FAKTISK er formulert som.
 *
 *   node examples/kamp.ts --kandidat "<spek>" --miljo "<spek>" \
 *     --kamper 400 --froe 700000000 --skard 0/6 --ut analyse/kamp-0.jsonl
 *
 * HVORFOR DEN MÅTTE FINNES. `examples/gate2.ts` stopper ved `RUNDE_SLUTT` —
 * én runde fra 0–0–0–0. Poengandelen (trekk 231/232) er dermed pinnet til null
 * i hvert eneste tall dette prosjektet har produsert, og enhver strategi som
 * avhenger av STILLINGEN — dristig når man ligger under, forsiktig når man
 * leder, hele Dubins–Savage-linja — har vært usynlig for benken.
 *
 * Arvinds mål er «vi skal ikke kunne tape et race til 100». Rundedifferanse er
 * en PROXY for det. Dette er saken selv.
 *
 * ============================ OPPSETTET ==================================
 *
 * Per frø spilles FEM kamper til `målPoeng`:
 *
 *   1 KONTROLLKAMP   alle fire setene er miljøet
 *   4 KANDIDATKAMPER kandidaten i sete 0, 1, 2, 3 etter tur
 *
 * Det gir fire parrede sammenlikninger per frø: «vant sete s da kandidaten
 * satt der» mot «vant sete s da miljøet satt der», på SAMME giv-sekvens.
 *
 * PARRINGEN ER SVAKERE ENN I GATE 2, og det skal sies rett ut. Kampene
 * divergerer så snart spillet gjør det: ulike bud gir ulike vraket kort, og
 * etter hvert ulikt antall runder. Bare FØRSTE giv er garantert felles. Derfor
 * sjekkes nettopp den eksplisitt (`gitLike`), som gate 2s kontrollarm på
 * 0,0000: slår den feil, er hele målingen ugyldig.
 *
 * MÅLTALLET er andelen kamper fokussetet VINNER. Med fire like agenter er
 * grunnlinja 25 %. Sekundært logges sluttpoeng og antall runder, fordi
 * marginen er kontinuerlig og derfor har mer statistisk kraft enn en
 * ja/nei-vinner.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS, tall } from "../src/moe2/agentspek.ts";

let kamper = 200;
let frøBase = 700_000_000;
let skardI = 0;
let skardN = 1;
let kandSpek = ADAMS;
let miljøSpek = ADAMS;
let ut = "analyse/kamp-0.jsonl";
/**
 * UPARRET MODUS — én kamp per frø i stedet for fem.
 *
 * Den parrede formen spiller 1 kontrollkamp + 4 kandidatkamper per frø. Med
 * SØK i miljøet er kontrollkampen den dyreste av alle (alle fire seter søker),
 * og den er ren overhead: grunnlinja er 0,2500 ved symmetri, ikke noe som må
 * måles.
 *
 * Parringen demper varians, men den KOSTER 5x. Med søk i flere seter gjorde
 * den målingen umulig — tre forsøk måtte brytes fordi benken ikke skrev en
 * eneste rad på tjue minutter.
 *
 * Uparret: kandidaten settes i ETT sete som roterer med frøet, og
 * vinnerandelen sammenliknes med 0,2500 direkte. Forventningsrett, bare
 * støyere per kamp — og fem ganger flere kamper for samme tid.
 */
let uparret = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  const v = process.argv[i + 1];
  if (a === "--kamper") kamper = tall(v, kamper, "--kamper");
  else if (a === "--froe") frøBase = tall(v, frøBase, "--froe");
  else if (a === "--kandidat") kandSpek = v ?? kandSpek;
  else if (a === "--miljo") miljøSpek = v ?? miljøSpek;
  else if (a === "--ut") ut = v ?? ut;
  else if (a === "--uparret") uparret = true;
  else if (a === "--skard") {
    const d = (v ?? "0/1").split("/");
    skardI = tall(d[0], 0, "--skard i");
    skardN = tall(d[1], 1, "--skard n");
  }
}

/** Fingeravtrykk av FØRSTE giv – parringsvakten. */
function gitAvtrykk(s: GameState): string {
  return s.hender.map((h) => h.map((k) => `${k.farge}${k.verdi}`).join(",")).join("|");
}

/** Spiller ÉN kamp til slutt og returnerer vinner, sluttpoeng og rundetall. */
function spillKamp(
  seter: readonly string[],
  frø: number,
): { vinner: number; poeng: number[]; runder: number; avtrykk: string } | null {
  const agenter = seter.map((sp) => lagIndre(sp));
  for (const a of agenter) a.nyKamp();
  let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
  const avtrykk = gitAvtrykk(s);
  let vakt = 0;
  while (s.fase !== "FERDIG" && vakt++ < 200_000) {
    if (s.fase === "RUNDE_SLUTT") {
      /**
       * LA AGENTENE BOKFOERE RUNDEN FOER KORTENE DELES UT PAA NYTT.
       *
       * `Profilbok.observer` bokfoerer bare paa `RUNDE_SLUTT`, og den ble bare
       * kalt fra `velgHandling`. Denne loekka haandterer fasen selv, saa ingen
       * agent ble noensinne spurt her - maalt **0 bokfoerte runder** mot 25 med
       * tikket paa.
       *
       * Konsekvensen var at K6 («laere andre spilleres vaner ila spillet») var
       * strukturelt umaalbar paa den eneste benken som spiller kamper lange nok
       * til at noen kunne laert noe.
       */
      for (const a of agenter) (a as { observer?(x: GameState): void }).observer?.(s);
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    s = utfør(s, agenter[iTur]!.velgHandling(s)).state;
  }
  if (s.fase !== "FERDIG" || s.vinner === null || s.vinner === undefined) return null;
  return { vinner: s.vinner, poeng: [...s.totalPoeng], runder: s.rundeNr, avtrykk };
}

mkdirSync(dirname(ut), { recursive: true });
const miljøAlle = [miljøSpek, miljøSpek, miljøSpek, miljøSpek];
let skrevet = 0;
let avvik = 0;
for (let k = 0; k < kamper; k++) {
  if (k % skardN !== skardI) continue;
  const frø = frøBase + k * 7717;
  // Uparret hopper over kontrollkampen helt: grunnlinja er 0,2500 ved
  // symmetri. Setet roterer med frøet, så alle fire dekkes over mange frø.
  const kontroll = uparret ? null : spillKamp(miljøAlle, frø);
  if (!uparret && kontroll === null) continue;
  const seter0 = uparret ? [k % 4] : [0, 1, 2, 3];
  for (const sete of seter0) {
    const seter = miljøAlle.map((m, p) => (p === sete ? kandSpek : m));
    const kand = spillKamp(seter, frø);
    if (kand === null) continue;
    // PARRINGSVAKTEN. Første giv MÅ være identisk; ellers er ikke de to
    // kampene sammenliknbare i det hele tatt.
    if (kontroll !== null && kand.avtrykk !== kontroll.avtrykk) {
      avvik++;
      continue;
    }
    appendFileSync(
      ut,
      JSON.stringify({
        frø,
        sete,
        kandVant: kand.vinner === sete ? 1 : 0,
        miljøVant: kontroll === null ? 0.25 : kontroll.vinner === sete ? 1 : 0,
        kandPoeng: kand.poeng[sete],
        miljøPoeng: kontroll === null ? 0 : kontroll.poeng[sete],
        kandMargin: kand.poeng[sete]! - Math.max(...kand.poeng.filter((_, p) => p !== sete)),
        miljøMargin: kontroll === null ? 0 : kontroll.poeng[sete]! - Math.max(...kontroll.poeng.filter((_, p) => p !== sete)),
        kandRunder: kand.runder,
        miljøRunder: kontroll === null ? kand.runder : kontroll.runder,
      }) + "\n",
    );
    skrevet++;
  }
  if (skrevet % 80 === 0) process.stderr.write(`  skard ${skardI}: ${skrevet} rader\r`);
}
process.stderr.write(`Skard ${skardI} ferdig: ${skrevet} rader, ${avvik} givavvik -> ${ut}\n`);
