/**
 * SPEKEN SOM LAG — for kravprøvene som tar en VILKÅRLIG spek (11. sep).
 *
 * Kravbatteriet målte bare MLB (`mlb:<vekter>`), fordi hver prøve var bygd rundt
 * sin egen stakk. Skal hele boten måles (`okt:vr:…:eks:…:profil:sik:…:budq:…`),
 * må prøvene kunne si ting som «den samme boten uten søk» (K2-kontrollarmen) og
 * «den samme boten uten hukommelse» (K4-nullarmen). Det er strengoperasjoner på
 * speken, og de må gjøre NØYAKTIG det `lagIndre` gjør — ellers bygger nullarmen
 * en annen bot enn den som ble målt, prosjektets verste feilklasse.
 *
 * ============ HVORFOR IKKE `utenSøk` FRA agentspek.ts ========================
 *
 * `utenSøk` stripper bare søkelag som ligger YTTERST. Den finnes for å lage en
 * ROLLOUT-MOTPART, der søket alltid står øverst. I hele boten står søket MIDT i
 * kjeden (`okt:vr:…:eks:…:profil:sik:…`), og `utenSøk` returnerer speken urørt —
 * en «kontrollarm uten søk» som søker. Den ville sett ut som den virket.
 *
 * Feltantallene under er avlest fra grenene i `lagIndre` (d.slice(n)), og
 * `test/k2-spek.test.ts` bygger hver form for å holde dem sammen.
 */

import { readFileSync } from "node:fs";

import { MlbTronett } from "../src/mlb/tronett.ts";

/** Lag med fast antall kolonfelt etter prefikset. Terminaler står ikke her. */
const FELT: Record<string, number> = {
  "okt:": 0,
  "profil:": 0,
  "vr:": 2,
  "eks:": 1,
  "sik:": 3,
  "amu:": 2,
  "ork:": 2,
  "vv:": 1,
  "vv2:": 3,
  "sum:": 1,
  "etl:": 1,
  "juks:": 1,
  "budq:": 1,
  "budm:": 1,
  "vakt:": 1,
};

/** Lag som SØKER ved spilletid (trekker verdener eller enumererer). */
export const SØKELAG = new Set(["eks:", "sik:", "amu:", "ork:", "vv:", "vv2:", "sum:"]);

/** Lag som HUSKER på tvers av runder i kampen (K4/K6). */
export const MINNELAG = new Set(["okt:", "profil:"]);

export interface Lag {
  /** Prefikset med kolon, f.eks. `sik:`. */
  readonly navn: string;
  /** Feltene mellom prefikset og det indre laget. */
  readonly felt: readonly string[];
}

/**
 * Deler en spek i lag utenfra og inn, pluss terminalen (`e1:…`, `mlb:…`, `nevro`).
 *
 * KASTER på et ukjent prefiks i stedet for å gjette: en prøve som stille
 * behandlet et nytt lag som terminal, ville latt det stå i nullarmen.
 */
export function delLag(spek: string): { lag: Lag[]; terminal: string } {
  const lag: Lag[] = [];
  let rest = spek;
  for (;;) {
    const navn = Object.keys(FELT).find((p) => rest.startsWith(p));
    if (navn === undefined) break;
    const d = rest.slice(navn.length).split(":");
    const n = FELT[navn]!;
    if (d.length <= n) throw new Error(`Laget «${navn}» i «${spek}» mangler felt eller indre agent`);
    lag.push({ navn, felt: d.slice(0, n) });
    rest = d.slice(n).join(":");
  }
  const terminal = /^(nevro$|e1:|e1r:|e1s:|ens:|mlb:)/.test(rest);
  if (!terminal) throw new Error(`Ukjent lag «${rest.split(":")[0]}» i «${spek}» — spek-lag.ts kjenner det ikke`);
  return { lag, terminal: rest };
}

/** Setter lagene sammen igjen. `settSammen(delLag(s))` er identisk med `s`. */
export function settSammen(d: { lag: readonly Lag[]; terminal: string }): string {
  return d.lag.map((l) => l.navn + l.felt.map((f) => `${f}:`).join("")).join("") + d.terminal;
}

export function harLag(spek: string, navn: string): boolean {
  return delLag(spek).lag.some((l) => l.navn === navn);
}

/**
 * Budmodellens sjette felt er A4-BUDSØKET (`sok12k8b0.5`). Det trekker verdener
 * i budrunden og er et søk som alle andre. Tømmes, med sjuende felt (`kamp<λ>`)
 * bevart — posisjonene er faste i parseren.
 */
function budmUtenSøk(hode: string): string {
  const at = hode.lastIndexOf("@");
  if (at < 0) return hode;
  const f = hode.slice(at + 1).split("/");
  if (f.length < 6 || f[5] === "") return hode;
  f[5] = "";
  while (f.length > 5 && f[f.length - 1] === "") f.pop();
  return `${hode.slice(0, at)}@${f.join("/")}`;
}

/** Er det noe i speken som søker ved spilletid? */
export function harSøk(spek: string): boolean {
  const d = delLag(spek);
  if (d.terminal.startsWith("e1s:")) return true;
  return d.lag.some((l) => SØKELAG.has(l.navn) || (l.navn === "budm:" && budmUtenSøk(l.felt[0]!) !== l.felt[0]));
}

/**
 * DEN SAMME BOTEN UTEN SØK — hvor søket enn står.
 *
 * `e1s:<fil>` (søk i vrak og trumf) blir `e1:<fil>`. Alt annet står: vrakrangereren,
 * budlaget, vakten, økten. Det er K2-kontrollarmens «juks:6:<base>»: en bot som
 * spiller som kandidaten der søket ikke griper inn, og som prøven MÅ ta når den
 * får klarsyn.
 */
export function utenSøkOveralt(spek: string): string {
  const d = delLag(spek);
  const lag = d.lag
    .filter((l) => !SØKELAG.has(l.navn))
    .map((l) => (l.navn === "budm:" ? { navn: l.navn, felt: [budmUtenSøk(l.felt[0]!)] } : l));
  const terminal = d.terminal.startsWith("e1s:") ? `e1:${d.terminal.slice(4)}` : d.terminal;
  return settSammen({ lag, terminal });
}

/** Troen søket bruker, lest ut av `sik:`-feltet (`24k32e3L~mlbu=<fil>`). */
export interface Søketrospek {
  readonly art: "mlb" | "mlbu";
  readonly sti: string;
  readonly verdener: number;
  readonly kandidater: number;
}

export function søketro(spek: string): Søketrospek | null {
  for (const l of delLag(spek).lag) {
    if (l.navn !== "sik:") continue;
    const f = l.felt[2] ?? "";
    const t = f.indexOf("~");
    const vFelt = t < 0 ? f : f.slice(0, t);
    const m = /^(\d+)(?:k(\d+))?/.exec(vFelt);
    const verdener = m === null ? 12 : Number(m[1]);
    const kandidater = m?.[2] === undefined ? 3 : Number(m[2]);
    if (t < 0) return null;
    const [art, sti] = f.slice(t + 1).split("=");
    if ((art !== "mlb" && art !== "mlbu") || sti === undefined || sti === "") return null;
    return { art, sti, verdener, kandidater };
  }
  return null;
}

/** Søkets verdens- og kandidattall, også uten tro. `null` = ingen `sik:`. */
export function sikVerdener(spek: string): { verdener: number; kandidater: number } | null {
  for (const l of delLag(spek).lag) {
    if (l.navn !== "sik:") continue;
    const m = /^(\d+)(?:k(\d+))?/.exec(l.felt[2] ?? "");
    return { verdener: m === null ? 12 : Number(m[1]), kandidater: m?.[2] === undefined ? 3 : Number(m[2]) };
  }
  return null;
}

/** Leser trohodet og svarer på om det tar hukommelsen som inngang (804-bredden). */
export function troLeserMinne(sti: string): boolean {
  return MlbTronett.fraBytes(new Uint8Array(readFileSync(sti))).brukerHukommelse === true;
}

/**
 * DEN SAMME BOTEN UTEN HUKOMMELSE — K4-nullarmen.
 *
 * Hukommelsen bor tre steder i hele boten, og en nullarm som bare fjerner ett av
 * dem måler de to andre som «ikke hukommelse»:
 *
 *   `okt:` og `profil:`     motstanderprofilen og økta              → lagene tas ut
 *   `mlb:<vekter>`          sandkassens 144 hukommelsestall          → `h0`
 *   `sik:…~mlbu=<fil>`      trohodet i søket, NÅR det leser boka     → troen tas ut
 *
 * Det siste er en ulempe som skal stå: uten et trohode UTEN minne i samme bredde
 * finnes ingen annen måte å skru av boka på fra speken. Nullarmen søker da med
 * budvekten alene — en annen tro, men ingen hukommelse. `--null-spek` finnes for
 * den som har en bedre nullarm.
 */
export function utenMinne(spek: string, leserMinne: (sti: string) => boolean = troLeserMinne): string {
  const d = delLag(spek);
  const lag = d.lag
    .filter((l) => !MINNELAG.has(l.navn))
    .map((l) => {
      if (l.navn !== "sik:") return l;
      const f = l.felt[2] ?? "";
      const t = f.indexOf("~");
      if (t < 0) return l;
      const sti = f.slice(t + 1).split("=")[1] ?? "";
      if (!leserMinne(sti)) return l;
      // «L» (lagmålet) står FORAN «~» (`24k32e3L~mlbu=…`), så den følger med i f.slice(0, t).
      return { navn: l.navn, felt: [l.felt[0]!, l.felt[1]!, f.slice(0, t)] };
    });
  let terminal = d.terminal;
  if (terminal.startsWith("mlb:")) {
    const tilde = terminal.lastIndexOf("~");
    const kropp = tilde < 0 ? terminal : terminal.slice(0, tilde);
    const tro = tilde < 0 ? "" : terminal.slice(tilde);
    terminal = (kropp.endsWith("h0") ? kropp : `${kropp}h0`) + tro;
  }
  return settSammen({ lag, terminal });
}
