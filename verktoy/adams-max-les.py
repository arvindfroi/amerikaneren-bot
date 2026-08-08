# -*- coding: utf-8 -*-
"""ADAMS MAX — RAPPORTEN. Bidrag per modul, og relasjonene mellom dem.

ARVIND: «det går nesten ikke an å måle Adams max del for del fordi alt er
avhengig av hverandre.»

Riggen svarer ved å ablatere NEDOVER fra full stakk. Denne fila oversetter
gate 2s parrede blokk til det språket spørsmålet ble stilt i.

================= FORTEGNET SNUS, OG DET ER HELE POENGET ================

gate 2 rapporterer `d(A) = A − KONTROLL`, der KONTROLLEN her er FULL stakk.
Armen «u-vakt» er FULL uten konvensjonsvakten, så

    d(u-vakt) = (FULL − vakt) − FULL

og BIDRAGET fra vakten er det motsatte:

    bidrag(vakt) = FULL − (FULL − vakt) = −d(u-vakt)

Leses tabellen med gate 2s fortegn, står hver eneste modul med motsatt fortegn
av det den er verdt. Derfor snus det her, ett sted, og tegntesten snus med
(`pos` blir `tot − pos`).

================= OG RELASJONEN MELLOM TO MODULER =======================

    interaksjon(X,Y) = bidrag(X og Y samlet) − bidrag(X) − bidrag(Y)
                     = −d(u-X-Y) + d(u-X) + d(u-Y)

Positiv: de gjør hverandre bedre. Negativ: de konkurrerer om det samme — som
`A6 mot A7`, `sender mot leser` og `søket mot vakten` alle gjorde.

STANDARDFEILEN PÅ EN SUM AV PARREDE LEDD KAN IKKE REGNES EKSAKT fra en
rapportfil: leddene er målt på samme giv og er derfor korrelerte. Som i
`verktoy/samspill.py` oppgis to grenser i stedet for å late som — uavhengige
(nedre) og fullt korrelerte (øvre) — og dommen faller bare når den holder
under den strengeste.

================= UMÅLBART ER IKKE NULL =================================

`okt`, `profil` og `amu «r»` er STRUKTURELT usynlige på gate 2: friske agenter
per giv, én runde, `press` eksakt 0. Rapporten setter dem i egen bolk med
grunnen, i stedet for å la en null i tabellen bli lest som «verdiløs».
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys

# STDOUT MÅ IKKE KUNNE VELTE RAPPORTEN. Konsollen her er cp1252, og et
# minustegn (U+2212) i teksten ga `UnicodeEncodeError` — etter at fila var
# skrevet, heldigvis, men en kjører som ser en traceback antar at målingen
# feilet. Rapporten skrives uansett; skjermutskrifta får erstatningstegn.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# RAPPORTPARSEREN GJENBRUKES fra samspill.py. To parsere for samme filformat er
# nøyaktig den driften `agentspek.ts` ble skrevet for å avslutte.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from samspill import les_armer  # noqa: E402


def tegntest(k: int, n: int, p0: float = 0.5) -> float:
    """Tosidig binomialtest. `p0=0.5` er tegntesten, `p0=0.25` kampbenkens null."""
    if n <= 0:
        return float("nan")

    def pmf(i: int) -> float:
        return math.exp(
            math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1)
            + i * math.log(p0) + (n - i) * math.log(1 - p0)
        )

    obs = pmf(k)
    # Tosidig ved «alle utfall minst like usannsynlige som det observerte».
    return min(1.0, sum(pmf(i) for i in range(n + 1) if pmf(i) <= obs * (1 + 1e-12)))


def les_kamp(prefiks: str, kode: str) -> tuple[int, float, float, int, list[float]] | None:
    """(n, vinnerandel, snittmargin, antall vunnet, poeng-per-runde-differanser).

    ============ HVORFOR POENG PER RUNDE OGSAA LESES ======================

    Arvind: «er det ikke en mer effektiv måte å måle kampbenken på?»

    Jo, og den ligger i STATISTIKKEN, ikke i kjoeringen. En kamp bruker ~25
    runder kortspill paa aa produsere ÉN BIT: vant eller tapte. Sluttmarginen og
    poeng per runde er kontinuerlige stoerrelser fra noeyaktig de samme kampene.

    Maalt paa den ferdige gulvkjoeringen (2400 rader, samme data):

        vinnerandel        |z| = 21,3
        sluttmargin        |z| = 31,7      0,45x saa mange kamper
        poeng per runde    |z| = 31,1      0,47x saa mange kamper

    **2,2x effektiv presisjon, gratis.** Ingen kjoering maa gjentas - bare
    lesningen.

    FORBEHOLD SOM MAA STAA: kravet K1 er formulert i VINNERANDEL, saa den
    forblir fasit for K1-dommen. Poeng per runde er en langt mer presis proxy
    for aa RANGERE moduler, og den brukes til det - ikke til aa erklaere K1
    innfridd.
    """
    vant = 0
    marg: list[float] = []
    ppr: list[float] = []
    for f in glob.glob(f"{prefiks}{kode}-s*.jsonl"):
        with open(f, encoding="utf8") as fh:
            for ln in fh:
                ln = ln.strip()
                if not ln:
                    continue
                r = json.loads(ln)
                vant += int(r["kandVant"])
                marg.append(float(r["kandMargin"]))
                kr = max(1.0, float(r.get("kandRunder", 1)))
                mr = max(1.0, float(r.get("miljøRunder", r.get("miljoRunder", 1))))
                mp = float(r.get("miljøPoeng", r.get("miljoPoeng", 0)))
                ppr.append(float(r.get("kandPoeng", 0)) / kr - mp / mr)
    n = len(marg)
    if n == 0:
        return None
    return n, vant / n, sum(marg) / n, vant, ppr


def se_av(xs: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return float("nan")
    m = sum(xs) / n
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1) / n)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--armkart", required=True, help="max-<merke>-armkart.json fra maxrigg.ts")
    p.add_argument("--gate2", default=None, help="gate2s .txt-rapport")
    p.add_argument("--kamp", default=None, help="prefiks for kampfilene, f.eks. analyse/max-m1-k-")
    p.add_argument("--ut", required=True)
    a = p.parse_args()

    with open(a.armkart, encoding="utf8") as fh:
        kart = json.load(fh)
    full_spek: str = kart["full"]
    # spek -> arm. gate 2 navngir armene med SPEKSTRENGEN, så det er den nøkkelen
    # rapporten må slås opp på.
    per_spek = {arm["spek"]: arm for arm in kart["armer"]}
    per_kode = {arm["kode"]: arm for arm in kart["armer"]}
    modul = {m["kode"]: m for m in kart["moduler"]}

    L: list[str] = []
    L.append("# ADAMS MAX — ALLE DELER, OG RELASJONENE MELLOM DEM")
    L.append("")
    L.append(f"merke «{kart['merke']}», armkart laget {kart['laget']}")
    L.append(f"FULL STAKK (miljø og kontroll):")
    L.append(f"  {full_spek}")
    L.append("")
    L.append("Ablasjon NEDOVER: hver arm er FULL MINUS én modul. Tallet under er")
    L.append("derfor hva modulen BIDRAR MED NÅR ALT ANNET ER DER — ikke hva den er")
    L.append("verdt alene. En modul målt alene måles i feil selskap: «amu:alle»")
    L.append("målte −0,2837 uten vaktens veto og +0,4809 med den.")
    L.append("")

    benk_i_stykker: list[str] = []

    # ================= PORT 1: GATE 2 =================================
    bidrag: dict[str, tuple[float, float, int, int]] = {}
    if a.gate2 is not None and os.path.exists(a.gate2):
        armer = les_armer(a.gate2)
        if not armer:
            L.append("gate 2: fant ingen parrede armer i rapporten — er kjøringen ferdig?")
            L.append("")
        else:
            # ---- KONTROLLARMEN, FØRST ----
            L.append("=" * 78)
            L.append("KONTROLLARMEN, GATE 2 — FULL mot seg selv i samme sete")
            L.append("=" * 78)
            if full_spek in armer:
                e, se, pos, tot = armer[full_spek]
                # `tot` er antall par der armen SKILTE SEG FRA kontrollen.
                # Er den 0, var hver eneste par bit-identisk — og det er den
                # skarpeste formen kontrollen kan ha. Et snitt på 0,0000 med
                # tot > 0 betyr derimot at parene spriker og bare tilfeldigvis
                # midler til null.
                ok = abs(e) < 5e-5 and tot == 0
                L.append(f"  {e:+.4f} ± {se:.4f}   ({tot} av parene skilte seg fra FULL)")
                if ok:
                    L.append("  OK — bit-identisk med FULL i hvert eneste par, som den skal.")
                else:
                    L.append("  BENKEN ER I STYKKER. Kontrollarmen skal måle EKSAKT 0,0000.")
                    L.append("  Den gjør den ikke, og da er det seteskjevhet eller ikke-determinisme")
                    L.append("  i oppsettet. INGEN av tallene under kan leses.")
                    benk_i_stykker.append("gate 2")
            else:
                L.append("  MANGLER. Kontrollarmen ble ikke kjørt, og uten den er det ingen")
                L.append("  måte å vite om benken måler noe i det hele tatt.")
                benk_i_stykker.append("gate 2 (kontrollarm mangler)")
            L.append("")

            # ---- BIDRAG PER MODUL ----
            L.append("=" * 78)
            L.append("BIDRAG PER MODUL — gate 2   (poeng/runde, FULL minus modulen)")
            L.append("=" * 78)
            L.append(f"{'modul':<12}{'bidrag':>10}{'SE':>9}{'SE-er':>8}{'tegntest':>16}{'p':>8}")
            L.append("-" * 78)
            usynlige: list[str] = []
            for spek, arm in per_spek.items():
                if arm["slag"] != "minus" or spek not in armer:
                    continue
                e, se, pos, tot = armer[spek]
                # FORTEGNET SNUS: bidrag = −(arm − full). Tegntesten snus med.
                b, bpos = -e, tot - pos
                bidrag[arm["fjernet"][0]] = (b, se, bpos, tot)
                kode = arm["fjernet"][0]
                if "gate2" in arm["usynligPaa"]:
                    usynlige.append(kode)
                    continue
                pv = tegntest(bpos, tot)
                ser = b / se if se else float("nan")
                L.append(
                    f"{kode:<12}{b:>+10.4f}{se:>9.4f}{ser:>8.1f}"
                    f"{f'{bpos}/{tot}':>16}{pv:>8.3f}"
                )
            L.append("-" * 78)

            # ---- HELE STAKKEN MOT GRUNNLINJA ----
            gspek = kart["grunnlinje"]
            if gspek in armer:
                e, se, pos, tot = armer[gspek]
                b, bpos = -e, tot - pos
                L.append(
                    f"{'HELE STAKKEN':<12}{b:>+10.4f}{se:>9.4f}{(b / se if se else float('nan')):>8.1f}"
                    f"{f'{bpos}/{tot}':>16}{tegntest(bpos, tot):>8.3f}"
                )
                L.append("  (FULL minus GRUNNLINJA — hva hele modulsamlingen er verdt til sammen)")
                sum_b = sum(v[0] for k, v in bidrag.items() if k not in usynlige)
                se_uavh = math.sqrt(sum(v[1] ** 2 for k, v in bidrag.items() if k not in usynlige))
                se_korr = sum(v[1] for k, v in bidrag.items() if k not in usynlige)
                delta = b - sum_b
                L.append("")
                L.append(f"  sum av de målbare bidragene   {sum_b:+.4f}")
                L.append(f"  hele stakken                  {b:+.4f}")
                L.append(f"  SUPERADDITIVITET              {delta:+.4f}")
                L.append(f"    SE hvis leddene uavhengige  ±{math.sqrt(se_uavh ** 2 + se ** 2):.4f}")
                L.append(f"    SE hvis fullt korrelerte    ±{se_korr + se:.4f}")
                if delta > 2 * (se_korr + se):
                    L.append("  DOM: SYNERGI, og den holder uansett korrelasjon mellom leddene.")
                elif delta < -2 * (se_korr + se):
                    L.append("  DOM: LEDDENE KONKURRERER om det samme.")
                else:
                    L.append("  DOM: IKKE AVGJORT innenfor den strengeste grensa.")
            L.append("")

            # ---- UMÅLBART PÅ DENNE PORTEN ----
            L.append("UMÅLBART PÅ GATE 2 — utelatt fra tabellen over med vilje")
            if not usynlige:
                L.append("  ingen — alle moduler i full stakk kan sees her")
            for kode in usynlige:
                m = modul.get(kode, {})
                b, se, bpos, tot = bidrag[kode]
                L.append(f"  {kode:<10} {b:+.4f} ± {se:.4f}   ({tot} par skilte seg fra FULL)")
                L.append(f"             {m.get('merknad', '')}")
                if tot == 0:
                    L.append("             BIT-IDENTISK med FULL i hvert par — porten kan BEVISLIG")
                    L.append("             ikke se modulen. Det er en egenskap ved benken, ikke")
                    L.append("             ved modulen.")
            if usynlige:
                L.append("  TALLENE OVER ER IKKE NULLRESULTATER. gate 2 lager friske agenter per")
                L.append("  giv og stopper etter én runde, så disse modulene har ikke noe å virke")
                L.append("  på her. Les dem på kampbenken eller ikke i det hele tatt.")
            L.append("")

            # ---- NØSTEDE MODULER ----
            nøstet = [m for m in kart["moduler"] if m.get("forelder") and m["iFullNaa"]]
            if nøstet:
                L.append("NØSTING — «u-forelder» fjerner barna med:")
                for m in kart["moduler"]:
                    barn = [x["kode"] for x in nøstet if x.get("forelder") == m["kode"]]
                    if barn and m["iFullNaa"]:
                        L.append(f"  bidrag({m['kode']}) er {m['kode']} PLUSS {', '.join(barn)} samlet.")
                L.append("")

            # ---- INTERAKSJONER ----
            par_armer = [x for x in kart["armer"] if x["slag"] == "par"]
            if par_armer:
                L.append("=" * 78)
                L.append("RELASJONENE — interaksjon(X,Y) = bidrag(X,Y samlet) − bidrag(X) − bidrag(Y)")
                L.append("=" * 78)
                L.append(f"{'X x Y':<20}{'samlet':>10}{'X':>10}{'Y':>10}{'interaksjon':>14}{'2 SE':>10}")
                L.append("-" * 78)
                for arm in par_armer:
                    if arm["spek"] not in armer:
                        continue
                    x, y = arm["fjernet"][0], arm["fjernet"][1]
                    if x not in bidrag or y not in bidrag:
                        L.append(f"  {x} x {y}: mangler enkeltarmen for {x if x not in bidrag else y}")
                        continue
                    e, se, _, _ = armer[arm["spek"]]
                    bxy = -e
                    bx, sex = bidrag[x][0], bidrag[x][1]
                    by, sey = bidrag[y][0], bidrag[y][1]
                    inter = bxy - bx - by
                    nedre = math.sqrt(se ** 2 + sex ** 2 + sey ** 2)
                    øvre = se + sex + sey
                    L.append(
                        f"{f'{x} x {y}':<20}{bxy:>+10.4f}{bx:>+10.4f}{by:>+10.4f}"
                        f"{inter:>+14.4f}{2 * øvre:>10.4f}"
                    )
                    if inter > 2 * øvre:
                        dom = "GJØR HVERANDRE BEDRE, uansett korrelasjon"
                    elif inter > 2 * nedre:
                        dom = "gjør hverandre bedre HVIS leddene er omtrent uavhengige"
                    elif inter < -2 * øvre:
                        dom = "KONKURRERER om det samme, uansett korrelasjon"
                    elif inter < -2 * nedre:
                        dom = "konkurrerer HVIS leddene er omtrent uavhengige"
                    else:
                        dom = "ikke avgjort"
                    L.append(f"{'':<20}-> {dom}")
                L.append("-" * 78)
                L.append("  «2 SE» er den STRENGESTE grensa (fullt korrelerte ledd). Er")
                L.append("  interaksjonen mindre enn den, er relasjonen ikke påvist.")
                L.append("")
    else:
        L.append("gate 2: ingen rapportfil oppgitt eller funnet.")
        L.append("")

    # ================= PORT 2: KAMPBENKEN =============================
    if a.kamp is not None:
        L.append("=" * 78)
        L.append("KAMPBENKEN — vinnerandel for armen i fokussetet (null = 0,2500)")
        L.append("=" * 78)
        # Kontrollarmen slås opp på KODEN sin fra armkartet, ikke på en streng
        # skrevet inn her. Sto «KONTROLL» hardkodet, og armen heter «kontroll» —
        # på et versalufølsomt filsystem traff globet likevel, og på et følsomt
        # ville den stille vært borte.
        kontrollkode = next((x["kode"] for x in kart["armer"] if x["slag"] == "KONTROLL"), None)
        k = None if kontrollkode is None else les_kamp(a.kamp, kontrollkode)
        if k is None:
            L.append("  KONTROLLARMEN MANGLER. Uten den kan ingen vinnerandel leses.")
            benk_i_stykker.append("kampbenken (kontrollarm mangler)")
        else:
            n, andel, marg, vant, kppr = k
            avvik = abs(andel - 0.25)
            sek = math.sqrt(0.25 * 0.75 / n)
            L.append(f"  KONTROLL (FULL mot seg selv)  {andel:.4f}  ({vant}/{n})   <- MÅ være 0,2500")
            if avvik > 3 * sek:
                L.append(f"  BENKEN ER I STYKKER: avviker {avvik / sek:.1f} SE fra 0,2500.")
                benk_i_stykker.append("kampbenken")
            else:
                L.append(f"  OK — innenfor støyen ({avvik / sek:.1f} SE).")
        L.append("")
        L.append(f"{'modul':<12}{'vinnerandel':>13}{'SE':>9}{'vs 0,25':>10}{'vunnet':>12}{'p':>8}")
        L.append("-" * 78)
        ppr_rader: list[tuple[str, int, float, float]] = []
        for arm in kart["armer"]:
            if arm["slag"] not in ("minus", "grunnlinje"):
                continue
            r = les_kamp(a.kamp, arm["kode"])
            if r is None:
                continue
            n, andel, marg, vant, ppr = r
            sek = math.sqrt(max(andel * (1 - andel), 1e-9) / n)
            kode = arm["fjernet"][0] if arm["slag"] == "minus" else "HELE STAKKEN"
            # Uten modulen: en LAV vinnerandel betyr at modulen BIDRAR. Fortegnet
            # står i kolonnen «vs 0,25», som er armens eget avvik — ikke bidraget.
            L.append(
                f"{kode:<12}{andel:>13.4f}{sek:>9.4f}{andel - 0.25:>+10.4f}"
                f"{f'{vant}/{n}':>12}{tegntest(vant, n, 0.25):>8.3f}"
            )
            if ppr:
                m = sum(ppr) / len(ppr)
                ppr_rader.append((kode, len(ppr), m, se_av(ppr)))
        L.append("-" * 78)

        # ============ DEN PRESISE KOLONNEN ==================================
        #
        # Arvind: «er det ikke en mer effektiv måte å måle kampbenken på?»
        #
        # En kamp bruker ~25 runder kortspill på å produsere ÉN BIT. Poeng per
        # runde er kontinuerlig og kommer fra nøyaktig de samme kampene. Målt på
        # den ferdige gulvkjøringen (2400 rader): |z| = 21,3 for vinnerandel mot
        # 31,1 for poeng per runde — altså **2,2× effektiv presisjon, gratis**.
        #
        # K1 er formulert i VINNERANDEL, så den står som fasit over. Denne
        # kolonnen er for å RANGERE moduler, og der er den langt skarpere.
        if ppr_rader:
            L.append("")
            L.append("SAMME KAMPER, PRESIS STATISTIKK — poeng per runde (2,2x skarpere)")
            L.append(f"{'modul':<12}{'differanse':>13}{'SE':>9}{'SE-er':>8}")
            L.append("-" * 78)
            for kode, n2, m2, s2 in ppr_rader:
                z = m2 / s2 if s2 > 0 else 0.0
                L.append(f"{kode:<12}{m2:>+13.4f}{s2:>9.4f}{z:>8.1f}")
            L.append("-" * 78)
            L.append("  Armen er FULL UTEN modulen. NEGATIV differanse => modulen BIDRAR.")
        L.append("  Radene er ARMEN (FULL uten modulen). Ligger den UNDER 0,2500, taper")
        L.append("  stakken på å miste modulen — altså bidrar modulen positivt.")
        L.append("  Her er INGEN modul strukturelt umålbar: agentene husker og kampene")
        L.append("  går til målPoeng. Til gjengjeld er parringen svakere enn gate 2s.")
        L.append("")

    # ================= DOMMEN =========================================
    L.append("=" * 78)
    if benk_i_stykker:
        L.append("BENKEN ER I STYKKER: " + ", ".join(benk_i_stykker))
        L.append("Ingen av tallene over kan leses. Rett kontrollarmen først.")
    else:
        L.append("Kontrollarmene er i orden. Tallene kan leses.")
    L.append("")
    L.append("PORTEN: en modul beholdes bare om bidraget er over 2 SE OG tegntesten")
    L.append("er med den. Aldri adoptere eller forkaste på snittet alene — og aldri")
    L.append("på ett frøbånd. Replikér i et disjunkt bånd før noe endres.")
    L.append("=" * 78)

    tekst = "\n".join(L)
    with open(a.ut, "w", encoding="utf8") as fh:
        fh.write(tekst + "\n")
    print(tekst)
    print(f"\n-> {a.ut}", file=sys.stderr)


if __name__ == "__main__":
    main()
