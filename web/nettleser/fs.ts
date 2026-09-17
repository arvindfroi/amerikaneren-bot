/**
 * `node:fs` I NETTLESEREN — et minnefilsystem, bare for å lese.
 *
 * Arm B i A/B-demoen kjører `lagIndre(<helbotspeken>)` i workeren, altså NØYAKTIG den
 * parseren node-målingene bruker. Parseren leser vektfiler med `readFileSync(sti)`; her
 * svarer den fra filene workeren har fått fra hovedtråden (`leggInnFil`). Bygget kobler
 * `node:fs` hit med esbuilds `alias` (se `verktoy/bygg-web.mjs`).
 *
 * Alt annet (`writeFileSync`, `existsSync` …) finnes bare for at importene skal løses. De
 * kastes eller svarer «finnes ikke» — en kjede som prøver å skrive til disk i nettleseren
 * skal feile høyt, ikke stille.
 */

const filer = new Map<string, Uint8Array>();
const norm = (sti: string): string => String(sti).split("\\").join("/").replace(/^\.\//, "");

export function leggInnFil(sti: string, bytes: Uint8Array): void {
  filer.set(norm(sti), bytes);
}

export function harFil(sti: string): boolean {
  return filer.has(norm(sti));
}

export function readFileSync(sti: string, koding?: unknown): Uint8Array | string {
  const b = filer.get(norm(sti));
  if (b === undefined) throw new Error(`ENOENT (nettleser-fs): «${String(sti)}» er ikke lagt inn`);
  const enc = typeof koding === "string" ? koding : (koding as { encoding?: string } | undefined)?.encoding;
  return enc === undefined ? b : new TextDecoder().decode(b);
}

export function existsSync(sti: string): boolean {
  return filer.has(norm(sti));
}

const skrivefeil = (navn: string) => (): never => {
  throw new Error(`${navn} finnes ikke i nettleseren`);
};
export const writeFileSync = skrivefeil("writeFileSync");
export const appendFileSync = skrivefeil("appendFileSync");
export const mkdirSync = skrivefeil("mkdirSync");
export const readdirSync = (): string[] => [];
export const statSync = skrivefeil("statSync");
export const rmSync = skrivefeil("rmSync");
export default { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, rmSync };
