/**
 * K8 OG K6 MOT MENNESKER — ren PREDIKSJON på innspilte menneskekamper (11. sep).
 *
 *   node examples/menneske-tro.ts --nett e1-modell/tro-1.bin --skard 0/4 --ut analyse/menneske-tro/s0.jsonl
 *     [--data D:/amb-grp/menneske/hendelser.jsonl] [--band alle|trening|holdout] [--etter 2026-08-10]
 *     [--budspek <v5-kjeden>] [--frastikk 0] [--sjanse 1] [--maks-kamper N]
 *   node examples/menneske-tro.ts --dom analyse/menneske-tro/s*.jsonl
 *
 * EIEREN vil at troen og hukommelsen skal virke mot MENNESKER, ikke mot boten selv. I dag er
 * trohodet og hukommelsen trent bare på selvspill, og målt før: et trohode trent mot én
 * motstandertype falt fra 12,34 % til 5,09 % av veien gulv → tak mot en annen. K6-raden
 * (gevinsten av hukommelsen vokser med rundenummeret) er bare målt mot stiliserte boter.
 *
 * ===================== HVA SOM MÅLES ====================================
 *
 * Hver innspilte kamp gås runde for runde i den opprinnelige rekkefølgen. `menneske-logg.ts`
 * gjør runden om til ekte tilstander og KONTROLLERER den (budvinner og kontrakt, lovlige trekk,
 * loggens poeng). Ingen bot velger et kort, så det finnes ingen replay-divergens: stillingene
 * er de mennesket og botene faktisk sto i.
 *
 * I hver SPILL-stilling der setet i tur har minst to lovlige kort (samme utvalg som K8), gir
 * trohodet en fordeling over de skjulte kortene, og den dømmes mot hvor kortene faktisk lå.
 * Måltallet er K8 sitt, fra `k8-maal.ts`: log-tap per kort renormalisert over tre seter,
 * gulvkolonnen ln 3, og andelen av veien gulv → tak. To deler av de samme radene:
 *
 *   m_*     observatøren er en bot (sete 1–3) og bare MENNESKETS kort telles
 *   (uten)  alle seter, alle skjulte kort
 *
 * ===================== ARMENE: SAMME NETT, SAMME STILLING, SAMME KORT ====
 *
 *   tro      hukommelsen er bordets bok, matet med HVER tilstand i de tidligere FERDIGE
 *            rundene av kampen — som søketroen (`soketro.ts`) og `kamp.ts` gjør. En runde som
 *            ender i FERDIG vises som RUNDE_SLUTT (`somRundeslutt`).
 *   null     samme nett med hukommelsesblokken null (`trekkFor(…, null)`).
 *   null2    KONTROLL: nettet lastet en gang til, blokken som eksplisitt nullvektor. Skal være
 *            identisk med `null` på hver rad; `ulik2` teller plassene i 52 × 4 som ikke er det.
 *   fremmed  FELLE: boka fra en ANNEN kamp i samme utvalg (en annen spiller der det finnes),
 *            etter like mange ferdige runder. Full blokk, riktig tiltro, feil bord.
 *   rotert   denne kampens bok, men blokkene flyttet ett sete (`vektor(sete + 1)`).
 *   *_fakta  `tro` og `null` med «vet»-masken (`trofakta.ts`). Ingen ekstra foroverkjøring.
 *
 * `menneske-tro-dom.ts` har dommene og rapporten; `krav-helbot.ts` gjør dem til radene
 * K8-menneske og K6-menneske.
 *
 * ===================== K2 ============================================
 *
 * Inngangen er `spillerVisning(s, sete)` og `bok.vektor(sete)`, der boka bare bokfører ferdige
 * runder (`Hukommelse.observer`). Hendene i `s` leses bare av måltallet, som etikett — «hvor
 * kortene faktisk lå, kjent ved rundeslutt», `docs/mlb.md` §0. Budgiverne (`--budspek`) brukes
 * bare til å gjenskape de offentlige budene loggen mangler, og kontrolleres mot loggen.
 *
 * ===================== BÅND ============================================
 *
 * Dataene er faste, så replikasjonen er to halvdeler av KAMPENE (`halvdel` = fnv(id) % 2, som
 * K1). `--band trening|holdout` er treningsbåndet fra `menneskeBånd` (hver fjerde kamp holdout):
 * et trohode trent på menneskerader dømmes med `--band holdout`, og fella henter da også sin
 * fremmede bok bare fra holdout.
 *
 * ===================== KOSTNAD ==========================================
 *
 * Fem foroverkjøringer per stilling (tro, null, null2, fremmed, rotert). Med tro-1 (920 inn)
 * 1,7 ms hver; gjenskapingen av alle 2641 rundene tar under ett sekund.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lovligeKort, spillerVisning } from "../src/motor.ts";
import { lagIndre, tall } from "../src/moe2/agentspek.ts";
import { Hukommelse, hukommelseslengde } from "../src/mlb/hukommelse.ts";
import { maskerFordeling } from "../src/mlb/trofakta.ts";
import { MlbTronett } from "../src/mlb/tronett.ts";
import { gulvene, nettTap } from "./k8-maal.ts";
import {
  fnv,
  halvdel,
  kamprunder,
  lesMenneskelogg,
  MENNESKE,
  MENNESKE_FRA,
  menneskeBånd,
  nyTeller,
  skardAv,
  somRundeslutt,
  tellerTekst,
  V5_KJEDE,
  type Budgiver,
  type Menneskekamp,
} from "./menneske-logg.ts";
import { rapportMenneskeTro, type MenneskeTroRad } from "./menneske-tro-dom.ts";

const argv = process.argv;
const arg = (n: string, s: string): string => {
  const i = argv.indexOf(n);
  return i < 0 ? s : (argv[i + 1] ?? s);
};

if (argv.includes("--dom")) {
  const filer = argv.slice(argv.indexOf("--dom") + 1).filter((f) => !f.startsWith("--"));
  const rader: MenneskeTroRad[] = [];
  for (const f of filer) {
    for (const l of readFileSync(f, "utf8").split("\n")) if (l.trim() !== "") rader.push(JSON.parse(l) as MenneskeTroRad);
  }
  console.log(rapportMenneskeTro(rader));
} else {
  kjør();
}

function kjør(): void {
  const DATA = arg("--data", "D:/amb-grp/menneske/hendelser.jsonl");
  const NETTFIL = arg("--nett", "e1-modell/tro-1.bin");
  const BUDSPEK = arg("--budspek", V5_KJEDE);
  const ETTER = arg("--etter", MENNESKE_FRA);
  const BAND = arg("--band", "alle");
  if (BAND !== "alle" && BAND !== "trening" && BAND !== "holdout") throw new Error(`Ukjent bånd «${BAND}» (alle|trening|holdout)`);
  const [SI, SN] = (arg("--skard", "0/1").split("/") as [string, string]).map(Number) as [number, number];
  if (!(SN >= 1 && SI >= 0 && SI < SN)) throw new Error("--skard i/n med 0 ≤ i < n");
  const UT = arg("--ut", "analyse/menneske-tro/s0.jsonl");
  const FRASTIKK = tall(arg("--frastikk", "0"), 0, "frastikk");
  const SJANSE = Number(arg("--sjanse", "1"));
  if (!(SJANSE > 0 && SJANSE <= 1)) throw new Error(`--sjanse må ligge i (0, 1], fikk ${SJANSE}`);
  const MAKS_KAMPER = argv.includes("--maks-kamper") ? tall(arg("--maks-kamper", ""), 0, "maks-kamper") : Infinity;

  const bytes = new Uint8Array(readFileSync(NETTFIL));
  const nett = MlbTronett.fraBytes(bytes);
  /** KONTROLLENS nett: en egen instans av de samme vektene, så null2 ikke kan dele tilstand med null. */
  const nett2 = MlbTronett.fraBytes(new Uint8Array(readFileSync(NETTFIL)));
  const minne = nett.brukerHukommelse;
  const HUK = hukommelseslengde(4);
  const budgivere: Budgiver[] = [0, 1, 2, 3].map(() => lagIndre(BUDSPEK));

  const logg = lesMenneskelogg(DATA);
  /** Utvalget: kamper med start, minst én runde fra `--etter`, i båndet. Fella henter sine bøker HERFRA. */
  const utvalg = [...logg].filter(
    ([id, k]) =>
      k.start !== null &&
      k.runder.length > 0 &&
      (ETTER === "" || k.runder.some((r) => r.tid >= ETTER)) &&
      (BAND === "alle" || menneskeBånd(id) === BAND),
  );
  /** Fast rekkefølge for fella, uavhengig av skard: fnv(id), så id. */
  const orden = [...utvalg].sort((a, b) => fnv(a[0]) - fnv(b[0]) || (a[0] < b[0] ? -1 : 1));
  const plass = new Map(orden.map(([id], i) => [id, i] as const));
  const pseudonym = (k: Menneskekamp): string => k.start?.spiller ?? "";

  /** Den fremmede kampen: neste i `orden` med en annen spiller; finnes ingen, neste kamp. */
  const fremmedAv = (id: string): string | null => {
    const i = plass.get(id)!;
    const n = orden.length;
    if (n < 2) return null;
    const meg = pseudonym(orden[i]![1]);
    for (let d = 1; d < n; d++) {
      const [jid, jk] = orden[(i + d) % n]!;
      if (pseudonym(jk) !== meg) return jid;
    }
    return orden[(i + 1) % n]![0];
  };

  /**
   * BOKBILDENE til en kamp: `bilder[n][sete]` = `bok.vektor(sete)` etter n ferdige runder.
   * Et bilde legges bare til når boka når et NYTT antall runder, så en bok som startes på nytt
   * aldri skriver over et bilde fra før.
   */
  const bildeLager = new Map<string, Float64Array[][]>();
  const bokbilder = (id: string): Float64Array[][] => {
    const lagret = bildeLager.get(id);
    if (lagret !== undefined) return lagret;
    const k = logg.get(id)!;
    let bok = new Hukommelse();
    const bilde = (): Float64Array[] => [0, 1, 2, 3].map((s) => bok.vektor(s, 4));
    const ut: Float64Array[][] = [bilde()];
    for (const steg of kamprunder(k, budgivere)) {
      if (steg.nyBok) bok = new Hukommelse();
      if (steg.runde === null) continue;
      for (const s of steg.runde.tilstander) bok.observer(somRundeslutt(s));
      if (bok.runder() === ut.length) ut.push(bilde());
    }
    bildeLager.set(id, ut);
    return ut;
  };

  mkdirSync(dirname(UT), { recursive: true });
  writeFileSync(UT, "");
  let buffer: string[] = [];
  const tøm = (): void => {
    if (buffer.length > 0) appendFileSync(UT, buffer.join(""));
    buffer = [];
  };

  const teller = nyTeller();
  const t0 = Date.now();
  let kamper = 0;
  let rader = 0;
  let ulikeTotalt = 0;
  for (const [id, k] of utvalg) {
    if (skardAv(id, SN) !== SI) continue;
    if (kamper >= MAKS_KAMPER) break;
    kamper++;
    const fid = minne ? fremmedAv(id) : null;
    const fb = fid === null ? null : bokbilder(fid);
    const runder = Math.max(...k.runder.map((r) => Number(r.data["rundeNr"]))) + 1;
    let bok = new Hukommelse();

    for (const steg of kamprunder(k, budgivere, teller)) {
      if (steg.nyBok) bok = new Hukommelse();
      if (steg.runde === null) continue;
      const skriv = ETTER === "" || steg.hendelse.tid >= ETTER;
      /** Ferdige runder i boka FØR denne runden. Boka endres ikke før rundeslutt (K2). */
      const iBoka = bok.runder();
      const fremmedHuk = fb === null ? null : fb[Math.min(iBoka, fb.length - 1)]!;

      for (const s0 of steg.runde.tilstander) {
        const s = somRundeslutt(s0);
        bok.observer(s);
        if (!skriv || s.fase !== "SPILL" || s.iTur === null) continue;
        const sete = s.iTur;
        if (s.stikkSpilt < FRASTIKK || lovligeKort(s, sete).length < 2) continue;
        if (SJANSE < 1 && fnv(`${id}|${steg.rundeNr}|${s.stikkSpilt}|${sete}`) / 4294967296 >= SJANSE) continue;
        const alle = gulvene(s, sete);
        if (alle.kort === 0) continue;

        const visning = spillerVisning(s, sete);
        const ant = s.giving.antallStikk;
        const mål = s.regler.målPoeng;
        const fTro = nett.fordeling(nett.trekkFor(visning, ant, mål, minne ? bok.vektor(sete, 4) : null));
        const fNull = nett.fordeling(nett.trekkFor(visning, ant, mål, null));
        const fNull2 = nett2.fordeling(nett2.trekkFor(spillerVisning(s, sete), ant, mål, minne ? new Float64Array(HUK) : null));
        const fFremmed = fremmedHuk === null ? fNull : nett.fordeling(nett.trekkFor(visning, ant, mål, fremmedHuk[sete]!));
        const fRotert = minne ? nett.fordeling(nett.trekkFor(visning, ant, mål, bok.vektor((sete + 1) % 4, 4))) : fNull;
        const fTroF = maskerFordeling(fTro, visning).fordeling;
        const fNullF = maskerFordeling(fNull, visning).fordeling;

        let ulik2 = 0;
        for (let i = 0; i < fNull.length; i++) {
          for (let c = 0; c < fNull[i]!.length; c++) if (!Object.is(fNull[i]![c], fNull2[i]![c])) ulik2++;
        }
        ulikeTotalt += ulik2;

        const rad: Record<string, number | string> = {
          spill: id,
          halvdel: halvdel(id),
          band: menneskeBånd(id),
          runde: steg.rundeNr,
          runder,
          bok: iBoka,
          stikk: s.stikkSpilt,
          sete,
          budavvik: steg.runde.budavvik,
          kort: alle.kort,
          gulv: alle.gulv,
          gulvPluss: alle.gulvPluss,
        };
        const armer = (pref: string, kort: number, målSete?: (p: number) => boolean): void => {
          rad[`${pref}tro`] = nettTap(fTro, s, sete, kort, målSete).tap;
          rad[`${pref}null`] = nettTap(fNull, s, sete, kort, målSete).tap;
          rad[`${pref}null2`] = nettTap(fNull2, s, sete, kort, målSete).tap;
          rad[`${pref}fremmed`] = nettTap(fFremmed, s, sete, kort, målSete).tap;
          rad[`${pref}rotert`] = nettTap(fRotert, s, sete, kort, målSete).tap;
          rad[`${pref}tro_fakta`] = nettTap(fTroF, s, sete, kort, målSete).tap;
          rad[`${pref}null_fakta`] = nettTap(fNullF, s, sete, kort, målSete).tap;
        };
        armer("", alle.kort);
        rad.ulik2 = ulik2;
        if (sete !== MENNESKE) {
          const erMenneske = (p: number): boolean => p === MENNESKE;
          const m = gulvene(s, sete, erMenneske);
          if (m.kort > 0) {
            rad.m_kort = m.kort;
            rad.m_gulv = m.gulv;
            rad.m_gulvPluss = m.gulvPluss;
            armer("m_", m.kort, erMenneske);
          }
        }
        buffer.push(JSON.stringify(rad) + "\n");
        rader++;
        if (buffer.length >= 500) tøm();
      }
    }
    tøm();
    process.stdout.write(`\r  skard ${SI}/${SN}: ${kamper} kamper, ${rader} rader, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  }
  tøm();
  console.log(
    `\nSkard ${SI}/${SN} ferdig: ${kamper} kamper, ${rader} rader, ${tellerTekst(teller)}; ` +
      `nett ${nett.innBredde} inn${minne ? "" : " (leser IKKE hukommelsen: tro = null)"}; null/null2 ulike plasser ${ulikeTotalt}; ` +
      `${((Date.now() - t0) / 1000).toFixed(1)} s → ${UT}`,
  );
}
