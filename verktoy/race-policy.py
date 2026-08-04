#!/usr/bin/env python3
"""
HVOR MYE RISIKO SKAL BOTEN TA, GITT HELE STILLINGEN?

    python verktoy/race-policy.py --runder analyse/race100-runder-0803.txt

Arvind, 4. august: *«gjør det dynamisk basert på hvordan alle ligger relativt
til hverandre og hvor langt vi er ifra x […] ikke helt analogt, men at hele
konteksten kommer inn.»*

============================ HVA MÅLET FAKTISK ER ========================

Ikke «maksimer poeng». Ikke engang «ligg foran». I appen sitter ett menneske
og tre botseter, og botene vinner hvis NOEN av dem når målet først. Det de
skal maksimere er derfor

    P(mennesket kommer IKKE i mål først)

og det er en helt annen funksjon enn forventede poeng. Den bryr seg om hvem
som er nær mål, ikke om hvem som har flest poeng akkurat nå.

========================= HVORFOR «BAK» IKKE HOLDER ======================

Den enkle regelen «ta risiko når du ligger bak» er en tilnærming til dette. I
et firespillerrace er den for grov: å ligge 20 bak når alle er på 15 er noe
helt annet enn å ligge 20 bak når mennesket står på 90. I det første tilfellet
er det femten runder igjen å ordne opp på; i det andre er det én.

Derfor regnes politikken her som en funksjon av HELE stillingen, og formen
leses av tallene i stedet for å antas.

============================== METODEN ===================================

For et utvalg stillinger, og for hver risikofaktor, simuleres racet til ende
fra den stillingen. Beste faktor er den som gir lavest menneskesjanse.

Variansen skrus uten å røre snittet, `delta' = snitt + s·(delta − snitt)`, så
tallene måler NÅR boten tar risiko og ikke hvor god den er.

FORBEHOLD: at boten kan skru variansen fritt uten å tape snitt er en
antakelse. Dette er derfor formen på politikken, ikke gevinsten den gir.
"""

import argparse
import random


def les(sti):
    with open(sti, encoding="utf-8") as f:
        tekst = f.read()
    ut = []
    for bit in tekst.replace("\n", "").split(";"):
        bit = bit.strip()
        if not bit:
            continue
        tall = [int(x) for x in bit.split()]
        if len(tall) == 4:
            ut.append(tall)
    return ut


def fra_stilling(runder, snitt, start, mål, s, antall, rng):
    """→ andel av racene der MENNESKET (sete 0) kommer i mål først."""
    n = len(runder)
    tap = 0
    for _ in range(antall):
        p = list(start)
        v = 0
        while max(p) < mål and v < 400:
            d = runder[rng.randrange(n)]
            p[0] += d[0]
            for k in (1, 2, 3):
                p[k] += snitt[k] + s * (d[k] - snitt[k])
            v += 1
        if p[0] >= max(p):
            tap += 1
    return tap / antall


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runder", default="analyse/race100-runder-0803.txt")
    ap.add_argument("--maal", type=int, default=100)
    ap.add_argument("--antall", type=int, default=4000)
    ap.add_argument("--froe", type=int, default=21)
    ap.add_argument("--ut", default="analyse/race-policy.txt")
    args = ap.parse_args()

    runder = les(args.runder)
    n = len(runder)
    snitt = [sum(r[i] for r in runder) / n for i in range(4)]
    rng = random.Random(args.froe)
    FAKTORER = [0.6, 1.0, 1.5, 2.0, 3.0]
    L = []

    def si(t):
        print(t, flush=True)
        L.append(t)

    si(f"Maal {args.maal}. {args.antall} simuleringer per (stilling, faktor).")
    si("Snittet er uroert; bare variansen skrus.")
    si("")
    si("  mennesket   beste bot   |   " + "   ".join(f"s={f:.1f}" for f in FAKTORER) + "   BESTE")
    si("  " + "-" * 74)

    # Stillinger som faktisk oppstaar: mennesket paa vei mot maal, boten
    # naermere eller lenger unna. Tallene er valgt for aa spenne ut rommet,
    # ikke for aa vaere uttoemmende.
    stillinger = []
    for m in (20, 45, 70, 85, 95):
        for b in (m - 30, m - 15, m, m + 15, m + 30):
            if 0 <= b <= args.maal - 3:
                stillinger.append((m, b))

    rader = []
    for m, b in stillinger:
        # De to andre botsetene legges litt under lederboten - typisk bilde.
        start = [float(m), float(b), float(max(0, b - 12)), float(max(0, b - 20))]
        res = [fra_stilling(runder, snitt, start, args.maal, f, args.antall, rng) for f in FAKTORER]
        beste = FAKTORER[min(range(len(res)), key=lambda i: res[i])]
        rader.append((m, b, res, beste))
        si(
            f"  {m:9d}   {b:9d}   |   "
            + "   ".join(f"{x * 100:5.1f}" for x in res)
            + f"   {beste:.1f}"
        )

    si("")
    si("HVA FORMEN SIER:")
    # Les strukturen ut av tallene i stedet for aa paastaa den paa forhaand.
    naer = [r for r in rader if r[0] >= 85]
    langt = [r for r in rader if r[0] <= 45]
    bak = [r for r in rader if r[1] < r[0] - 10]
    foran = [r for r in rader if r[1] > r[0] + 10]
    def snitt_beste(v):
        return sum(x[3] for x in v) / len(v) if v else float("nan")
    si(f"  mennesket naer maal (>=85):   beste faktor i snitt {snitt_beste(naer):.2f}")
    si(f"  mennesket langt unna (<=45):  beste faktor i snitt {snitt_beste(langt):.2f}")
    si(f"  boten ligger bak:             beste faktor i snitt {snitt_beste(bak):.2f}")
    si(f"  boten ligger foran:           beste faktor i snitt {snitt_beste(foran):.2f}")
    si("")
    si("Er de to foerste like, er det IKKE naerheten til maal som styrer, og")
    si("politikken kan da vaere en funksjon av differansen alene.")

    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"\nSkrevet til {args.ut}")


if __name__ == "__main__":
    main()
