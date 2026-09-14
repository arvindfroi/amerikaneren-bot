/**
 * «AV ER AV» PÅ TVERS AV KODEENDRINGEN — fingeravtrykk av søket UTEN knotten.
 *
 *   node examples/strata-identitet.ts --ut analyse/strata-id-etter.txt
 *   git checkout <grunnlinje> -- src/ && node examples/strata-identitet.ts --ut analyse/strata-id-foer.txt
 *   diff analyse/strata-id-foer.txt analyse/strata-id-etter.txt
 *
 * ============ HVORFOR DENNE OG IKKE EN PRØVE ==============================
 *
 * En prøve inne i grenen kan bare vise at knotten AV oppfører seg som knotten AV.
 * Den kan ikke vise at den oppfører seg som KODEN FØR KNOTTEN FANTES — og det er
 * nøyaktig det «av er av» betyr. Denne fila skriver derfor et fingeravtrykk som kan
 * regnes ut på BEGGE commitene og sammenliknes med `diff`. Består den, hviler
 * bit-identiteten på at grenen ikke kjøres, ikke på at den regner riktig.
 *
 * Formen er ordrett `examples/bandit-identitet.ts` sin (`D:\amb-bandit`, `e87864d`),
 * fordi den løste nøyaktig det samme problemet for `~fordel=`. To ting er endret:
 *
 *   1. VERDENER STÅR PÅ 48, ikke 16. Det er tallet den utrullede speken faktisk
 *      bruker, og stratifiseringen er en funksjon AV antall verdener (cellene er
 *      1/K brede). Et fingeravtrykk på 16 ville latt en feil som bare slår inn ved
 *      det virkelige K slippe gjennom.
 *   2. Ingen `trekk`-nøkkel i det hele tatt — ikke `trekk: undefined`, men fraværende.
 *
 * Fingeravtrykket dekker alt `Sikkerorakel` leser ut av `vurderPar`: valgt kort,
 * antall verdener, σ, margin OG hver enkelt verdi per kandidat per verden. Bare
 * kortet ville sluppet gjennom en endring som flyttet verdiene uten å snu argmaks —
 * og det er nettopp det en trekkeendring GJØR, så per-verden-verdiene er ikke pynt
 * her, de er hele beviset.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { opprettSpill, utfør, lovligeKort, type GameState } from "../src/motor.ts";
import { lagRng } from "../src/kort.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { vurderPar } from "../src/moe2/sdpar.ts";
import { visningsfrø } from "../src/moe2/sikkerorakel.ts";
import { MlbSøketro } from "../src/moe2/soketro.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { lagMål, type Utspiller } from "../src/moe2/sdkort.ts";

const arg = (n: string, s: string): string => {
  const i = process.argv.indexOf(n);
  return i < 0 ? s : (process.argv[i + 1] ?? s);
};
const UT = arg("--ut", "");
const STILLINGER = tall(arg("--stillinger", "120"), 120, "stillinger");
const FRO = tall(arg("--fro", "14000901"), 14_000_901, "fro");
const VERDENER = tall(arg("--verdener", "48"), 48, "verdener");

const HELBOT =
  "okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:" +
  "sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const INDRE = "budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin";
const SIK_FRØ = 20_260_804;

const tro = new MlbSøketro(MlbTronett.fraBytes(readFileSync("e1-modell/tro-8.bin")));
const drivere = [0, 1, 2, 3].map(() => lagIndre(HELBOT));
const indre = [0, 1, 2, 3].map(() => lagIndre(INDRE));
for (const a of [...drivere, ...indre]) a.nyKamp();
tro.nyKamp();

const alleSer = (s: GameState): void => {
  for (const a of [...drivere, ...indre]) (a as { observer?(x: GameState): void }).observer?.(s);
  tro.observer(s);
};

if (UT !== "") mkdirSync(dirname(UT), { recursive: true });
const linjer: string[] = [];

let s: GameState = opprettSpill({ antallSpillere: 4, målPoeng: 100 }, FRO);
let vakt = 0;
let n = 0;

while (s.fase !== "FERDIG" && vakt++ < 40_000 && n < STILLINGER) {
  if (s.fase === "RUNDE_SLUTT") {
    alleSer(s);
    s = utfør(s, { type: "NESTE" }).state;
    continue;
  }
  alleSer(s);
  const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
  if (iTur === null || iTur === undefined) break;

  if (s.fase === "SPILL" && s.iTur !== null && lovligeKort(s, s.iTur).length >= 2) {
    const sete = s.iTur;
    const par = vurderPar(s, sete, indre[sete]! as unknown as Utspiller, {
      verdener: VERDENER,
      verdenKandidater: 32,
      verdenKombi: "snitt",
      eksaktBlad: 3,
      mål: lagMål,
      trovekt: tro.vektFor(s, sete) ?? undefined,
      budvekt: false,
      rng: lagRng(visningsfrø(s, sete, SIK_FRØ)),
      // INGEN `trekk`. Nøkkelen skal ikke finnes i objektet i det hele tatt.
    });
    if (par !== null) {
      n++;
      const verdier = par.kandidater
        .map((k) => `${k.kort.farge}${k.kort.verdi}=${k.perVerden.map((v) => v.toFixed(6)).join(",")}`)
        .join("|");
      linjer.push(
        `${n}\tsete=${sete}\tstikk=${s.historikk.length}\tkort=${par.beste.kort.farge}${par.beste.kort.verdi}` +
          `\tn=${par.n}\tsigma=${par.sigma.toFixed(9)}\tmargin=${par.margin.toFixed(9)}\t${verdier}`,
      );
    }
  }
  s = utfør(s, drivere[iTur]!.velgHandling(s)).state;
}

const tekst = linjer.join("\n") + "\n";
if (UT !== "") appendFileSync(UT, tekst);
else process.stdout.write(tekst);
console.error(`${n} stillinger fingeravtrykket (${VERDENER} verdener).`);
