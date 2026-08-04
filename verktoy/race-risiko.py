#!/usr/bin/env python3
"""
ER DET VERDT Å SPILLE ETTER STILLINGEN I RACET?

    python verktoy/race-risiko.py --runder analyse/race100-runder-0803.txt

Vi måler alt i poeng per runde. Men målet er å VINNE KAMPER TIL 100, og de to
er ikke samme sak: ligger boten 80–40 bak med fem runder igjen, er «maksimer
forventede poeng» feil – et jevnt tap er like tapt som et stort.

HVA SOM MODELLERES. Boten kan skru på VARIANSEN uten å endre snittet: spille
linjer som enten går veldig bra eller veldig dårlig når den ligger under, og
kvele variansen når den leder. Det gjøres her ved å skalere avviket fra
rundesnittet med en faktor, som bevarer forventningen eksakt.

    delta' = snitt + s · (delta − snitt)

`s > 1` bak, `s < 1` foran. Snittet er urørt, så alt tallet viser er hva
STILLINGSBEVISSTHET alene er verdt – ikke en skjult styrkeøkning.

HVORFOR DETTE MÅLES FØR NOE BYGGES. En beslutningsregel betinget på stillingen
koster null modellkompleksitet, men den er bare verdt å bygge om effekten er
der. Er den under et par tideler, er den ikke verdt en linje kode.

FORBEHOLDET SOM SKAL STÅ: at boten FAKTISK kan skru variansen ±30 % uten å
tape snitt er en antakelse. I praksis koster mer varians som regel litt
forventning. Tallet her er derfor et TAK for hva stillingsbevissthet kan gi,
ikke et anslag på hva den vil gi.
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


def kjør(runder, mål, antall, rng, opp, ned, terskel):
    """→ andel menneskeseier. `opp` brukes når boten ligger bak, `ned` når den leder."""
    seire = 0
    n = len(runder)
    # Rundesnitt per sete, som variansskaleringen speiler rundt.
    snitt = [sum(r[i] for r in runder) / n for i in range(4)]
    for _ in range(antall):
        p = [0.0, 0.0, 0.0, 0.0]
        v = 0
        while max(p) < mål and v < 400:
            d = runder[rng.randrange(n)]
            # Botsetene er 1–3; mennesket er sete 0.
            bestBot = max(p[1], p[2], p[3])
            diff = bestBot - p[0]
            s = opp if diff < -terskel else (ned if diff > terskel else 1.0)
            p[0] += d[0]
            for k in (1, 2, 3):
                p[k] += snitt[k] + s * (d[k] - snitt[k])
            v += 1
        if p[0] >= max(p):
            seire += 1
    return seire / antall


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runder", default="analyse/race100-runder-0803.txt")
    ap.add_argument("--maal", type=int, default=100)
    ap.add_argument("--antall", type=int, default=40000)
    ap.add_argument("--froe", type=int, default=13)
    ap.add_argument("--terskel", type=float, default=12.0)
    ap.add_argument("--ut", default="analyse/race-risiko.txt")
    args = ap.parse_args()

    runder = les(args.runder)
    rng = random.Random(args.froe)
    L = []

    def si(s):
        print(s, flush=True)
        L.append(s)

    si(f"{len(runder)} ekte runder, race til {args.maal}, {args.antall} simuleringer per rad")
    si(f"Variansen skrus naar forskjellen er over {args.terskel:.0f} poeng. Snittet er UROERT.")
    si("")
    si("  bak    foran    P(mennesket vinner)")
    grunn = kjør(runder, args.maal, args.antall, rng, 1.0, 1.0, args.terskel)
    si(f"  1,00   1,00           {grunn * 100:6.2f} %   (dagens: ingen stillingsbevissthet)")
    for opp, ned in [
        (1.2, 1.0), (1.4, 1.0), (1.0, 0.8), (1.0, 0.6),
        (1.2, 0.8), (1.4, 0.7), (1.6, 0.6), (2.0, 0.5),
    ]:
        a = kjør(runder, args.maal, args.antall, rng, opp, ned, args.terskel)
        merke = "  <-" if a < grunn - 0.004 else ""
        si(f"  {opp:.2f}   {ned:.2f}           {a * 100:6.2f} %{merke}")
    si("")
    si("SNITTET ER UROERT I ALLE RADER. Alt som skiller dem er NAAR boten tar")
    si("risiko - ikke hvor god den er. Er utslaget lite, er stillingsbevissthet")
    si("ikke verdt en linje kode.")
    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"\nSkrevet til {args.ut}")


if __name__ == "__main__":
    main()
