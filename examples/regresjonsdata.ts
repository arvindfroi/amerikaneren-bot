/**
 * REGRESJONSDATA: én rad per (giv, sete, agent), med atferd og utfall.
 *
 *   node examples/regresjonsdata.ts --giver 5000 --skard 0/10
 *
 * ARVIND: «ta de mest aktuelle modellene + menneskene vi har spilt, og deres
 * atferd, samtidig som vi inkluderer dummy-variabler som kontrollerer for støy
 * og måler atferd.»
 *
 * HVORFOR DETTE ER BEDRE ENN PARRET MÅLING. Hver benk vi har måler parret
 * innenfor seg selv, så to agenter som aldri har møtt hverandre kan ikke
 * sammenliknes uten transitivitet. Med en FAST EFFEKT PER GIV absorberes hvor
 * lett giva var, og agenteffekten identifiseres av variasjon INNENFOR samme
 * giv. Da kan agenter som aldri har spilt mot hverandre likevel havne på én
 * skala – så lenge de har spilt de samme givene.
 *
 * REFERANSEMOTSTANDEREN ER NØDVENDIG, ikke en detalj. Setter man samme agent i
 * alle fire seter, summerer poengdifferansen til null over setene, og
 * agenteffekten blir null per konstruksjon. Derfor: agenten under måling i ETT
 * sete, en fast referanse i de tre andre.
 *
 * ATFERDEN MÅLES I SAMME RAD som utfallet, slik at den kan brukes som mediator:
 * kjør regresjonen først med agent-dummyer alene, så med atferden lagt til.
 * Hvor mye agentkoeffisienten KRYMPER er hvor stor del av kanten den målte
 * atferden forklarer. Det er den analysen som peker på HVA som skal endres, i
 * stedet for bare hvem som er best.
 *
 * ROLLEN ER IKKE ET VALG. Hvilken rolle et sete får avhenger av budrunden, og
 * budrunden avhenger av agenten. Rolle er derfor en MELLOMLIGGENDE variabel,
 * ikke en kontroll – å betinge på den kan skjule en ekte forskjell i hvor ofte
 * agenten havner i den lønnsomme rollen. Begge modellene kjøres derfor, med og
 * uten rolle, og forskjellen står i rapporten.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, type GameState, type Handling } from "../src/index.ts";
import { type Farge, type Kort } from "../src/kort.ts";
import { NevroAgent } from "../src/nevro/index.ts";
import { E1Agent, lesE1Nett } from "../src/e1/nett.ts";
import { Konvensjonsvakt, delVaktspek } from "../src/moe2/konvensjonsvakt.ts";

let giver = 5000;
let skardI = 0;
let skardN = 1;
let frøBase = 300_000_000;
let referanse = "nevro";
let agenter = "nevro,e1:e1-modell/d7alle.bin,vakt:ab:e1:e1-modell/d7alle.bin,vakt:abmp:e1:e1-modell/d7alle.bin";
let ut: string | null = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a === "--giver") giver = Number(process.argv[++i]);
  else if (a === "--froe") frøBase = Number(process.argv[++i]);
  else if (a === "--referanse") referanse = process.argv[++i]!;
  else if (a === "--agenter") agenter = process.argv[++i]!;
  else if (a === "--ut") ut = process.argv[++i] ?? null;
  else if (a === "--skard") {
    const [x, y] = (process.argv[++i] ?? "0/1").split("/");
    skardI = Number(x);
    skardN = Number(y);
  }
}
const utFil = ut ?? `regr-data/skard-${skardI}.jsonl`;
mkdirSync(dirname(utFil), { recursive: true });

type Velger = { nyKamp(): void; velgHandling(s: GameState): Handling };
function lagKandidat(spec: string): () => Velger {
  const vakt = delVaktspek(spec);
  if (vakt !== null) {
    const indre = lagKandidat(vakt.indre);
    return () => new Konvensjonsvakt(indre(), vakt.valg);
  }
  if (spec === "nevro") return () => new NevroAgent();
  if (spec.startsWith("e1:")) {
    const nett = lesE1Nett(spec.slice(3));
    return () => new E1Agent(nett);
  }
  throw new Error("ukjent agentspesifikasjon: " + spec);
}
const kort = (s: string): string =>
  s.replace("e1-modell/", "").replace(".bin", "").replace("e1:", "e1-").replace(/:/g, "");
const kandidater = agenter.split(",").map((s) => ({ navn: kort(s), lag: lagKandidat(s) }));
const lagRef = lagKandidat(referanse);

let n = 0;
for (let f = 0; f < giver; f++) {
  if (f % skardN !== skardI) continue;
  const frø = (frøBase + f) >>> 0;

  for (const kand of kandidater) {
    for (let sete = 0; sete < 4; sete++) {
      let s: GameState = opprettSpill({ antallSpillere: 4 }, frø);
      const seter: Velger[] = [0, 1, 2, 3].map((p) => (p === sete ? kand.lag() : lagRef()));
      for (const b of seter) b.nyKamp();

      // Atferdstellere for MÅLESETET. Alle er andeler av relevante valg.
      let utspill = 0;
      let trumfUt = 0;
      let honnørUt = 0;
      let kunneTa = 0;
      let tokStikk = 0;
      let renonsValg = 0;
      let trumfetInn = 0;

      let g = 0;
      const førsteBudgiver = (s.giver + 1) % 4;
      while (s.fase !== "FERDIG" && s.fase !== "RUNDE_SLUTT" && g++ < 400) {
        const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner! : s.iTur!;
        const h = seter[iTur]!.velgHandling(s);
        if (iTur === sete && h.type === "SPILL" && s.trumf !== null) {
          const trumf = s.trumf;
          const k = h.kort as Kort;
          const bordet = s.bord;
          if (bordet.length === 0) {
            utspill++;
            if (k.farge === trumf) trumfUt++;
            if (k.verdi >= 12) honnørUt++;
          } else {
            const led = bordet[0]!.kort.farge as Farge;
            const egen = s.hender[iTur] ?? [];
            if (!egen.some((c) => c.farge === led)) {
              renonsValg++;
              if (k.farge === trumf) trumfetInn++;
            }
          }
        }
        s = utfør(s, h).state;
      }
      if (s.fase === "BUDRUNDE" || s.budvinner === null) continue;

      // «tok stikket naar vi kunne» leses av historikken i ettertid.
      for (const stikk of s.historikk) {
        const vårt = stikk.kort.find((kp) => kp.spiller === sete);
        if (vårt === undefined || stikk.kort[0]?.spiller === sete) continue;
        kunneTa++;
        if (stikk.vinner === sete) tokStikk++;
      }

      const p = s.totalPoeng;
      const egne = p[sete] ?? 0;
      const st = s.stikkVunnet;
      const erFører = s.budvinner === sete;
      const erMakker = s.makker === sete && !erFører;
      const lag = (st[s.budvinner] ?? 0) + (s.makker !== null ? (st[s.makker] ?? 0) : 0);
      const bud = s.melding?.type === "tall" ? s.melding.bud : 0;

      appendFileSync(
        utFil,
        JSON.stringify({
          giv: frø,
          sete,
          agent: kand.navn,
          referanse: kort(referanse),
          rolle: erFører ? "foerer" : erMakker ? "makker" : "forsvarer",
          posisjon: (sete - førsteBudgiver + 4) % 4,
          bud,
          klart: bud > 0 && lag >= bud ? 1 : 0,
          egneStikk: st[sete] ?? 0,
          lagStikk: lag,
          // Utfallet: egne poeng minus snittet av de tre andre.
          poengdiff: Math.round((egne - (p.reduce((a, x) => a + x, 0) - egne) / 3) * 1000) / 1000,
          // Atferd, som andeler. -1 betyr «ingen slike valg i denne runden».
          trumfUt: utspill > 0 ? trumfUt / utspill : -1,
          honnørUt: utspill > 0 ? honnørUt / utspill : -1,
          tokStikk: kunneTa > 0 ? tokStikk / kunneTa : -1,
          trumfetInn: renonsValg > 0 ? trumfetInn / renonsValg : -1,
          utspill,
        }) + "\n",
      );
      n++;
    }
  }
  process.stdout.write(`\r  skard ${skardI}: ${n} rader   `);
}
console.log(`\nSkard ${skardI} ferdig: ${n} rader → ${utFil}`);
