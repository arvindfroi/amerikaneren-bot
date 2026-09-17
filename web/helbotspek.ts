/**
 * ============ ADAMS MAX I NETTSIDEN — SPEKEN OG FILENE, ETT STED ============
 *
 * A/B-demoen (17. sep): hver kamp trekkes til arm A (dagens utrullede Adams-v5.1) eller
 * arm B (Adams Max, «helboten»). Arm B er IKKE en kopi av kjeden: workeren kjører
 * `lagIndre(<speken under>)` — nøyaktig parseren node-målingene bruker — mot et
 * minnefilsystem (`web/nettleser/fs.ts`). Da kan den ikke drive fra det målte uten at
 * fingeravtrykket (`examples/ab-avtrykk.ts`) blir rødt.
 *
 * Denne fila er LETT med vilje: `web/app.ts` importerer den, og den skal ikke dra
 * spekparseren inn i hovedbunten.
 */

/** Stien i speken → fila appen henter (via valens PROXY-tabell, som de andre modellene). */
export const HELBOT_FILER = {
  "max/kort.bin": "max-kort.b64",
  "max/tro.bin": "max-tro.b64",
  "max/vrak.bin": "max-vrak.b64",
  "max/etterlyst.bin": "max-etterlyst.b64",
  "max/budq.bin": "max-budq.b64",
} as const;

export type HelbotSti = keyof typeof HELBOT_FILER;

/**
 * Hvilke nett filene er. Loggføres i `start`-raden, så en senere nettbytte (samme filnavn,
 * ny pinne) kan skilles i basen. `D:\amb-grp\loop\nett\beste.txt` = «15 1.29 0.28».
 */
export const HELBOT_NETT = "loop-15";

/**
 * FARTSKNOTTENE (S1, `D:\amb-grp\loop\fart.md`): kortekvivalens, prior-topp og flat-stopp.
 * Én konstant slår dem av og på. Se `D:\amb-grp\loop\fart-k1.md` for dommen.
 */
export const FARTSKNOTTER = "~ekv=1~topp=0.1~flat=8";
export const FART_PÅ: boolean = false;

/**
 * Helbotspeken, ordrett som i løkka og `examples/fart-k1.mjs`. Stiene er nettleserens
 * (`max/…`); `sti` bytter dem ut, så node-referansen bruker SAMME streng med diskstier.
 */
export function helbotSpek(fart: boolean = FART_PÅ, sti: (s: HelbotSti) => string = (s) => s): string {
  const P =
    `okt:vr:${sti("max/vrak.bin")}@${sti("max/etterlyst.bin")}:telrd:eks:3Lt2000:profil:` +
    `sik:alle:0.5:48k32e3LMD~mlbu=${sti("max/tro.bin")}`;
  const H = `:budq:${sti("max/budq.bin")}:vakt:abmp:e1:${sti("max/kort.bin")}`;
  return `${P}${fart ? FARTSKNOTTER : ""}${H}`;
}

/**
 * NØDBREMSEN. Søket får så mange ms per kortvalg; når fristen går, stopper det ved neste hele
 * verden (σ regnes fortsatt parvis over de verdenene som rakk). Workeren melder
 * `nødbrems: true` når færre enn 48 verdener ble spilt ut. `null` = ingen frist (all måling).
 *
 * 1 100 ms og ikke 1 500: resten av trekket (trovekt, eksakt sluttspill, meldingskø, klone av
 * stillingen) må også få plass innenfor ~1,5 s på en iPad.
 */
export const HELBOT_FRIST_MS: number | null = 1_100;

/**
 * Hovedtrådens frist for et helbotsvar. Løs, med vilje: workerens egen frist holder trekket
 * nede; denne fanger bare en hengt eller treg worker, og da spiller arm A-kjeden (logget).
 */
export const HELBOT_TREKKFRIST_MS = 4_000;
