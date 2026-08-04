#!/usr/bin/env python3
"""
HVOR STOR MÅ LEDELSEN VÆRE FØR ET RACE TIL 100 ER TAPT PÅ FORHÅND?

    python verktoy/race100.py --runder analyse/race100-runder-0803.txt

Arvind, 4. august: «jeg setter et mål om at vi ikke skal kunne tape mot
mennesker i et race til 100 poeng (med mindre et mirakel skjer).»

HVORFOR RACE-METRIKKEN ER SKARPERE ENN POENG PER RUNDE. Et race varer ~15
runder. Poeng per runde måler snittet over uendelig mange runder; racet måler
halen over femten. To boter med samme snitt kan ha svært ulik racesjanse hvis
den ene henter poengene sine i sjeldne store slag og den andre jevnt.

HVORFOR VI IKKE ANTAR EN NORMALFORDELING. Poengfordelingen per runde er ikke
i nærheten av normal: budvinnerlaget får ±18/9 eller ±20/10, forsvarerne 0–3.
Den er trimodal og tung i begge haler. Derfor bootstrapper vi HELE
runde-vektoren (alle fire setene samtidig), som bevarer at nøyaktig ett lag
scorer stort hver runde og at de to lagene er perfekt antikorrelerte.

HVA «MIRAKEL» BETYR I TALL. Vi rapporterer sjansen for at mennesket (sete 0)
når 100 først. En jevn spiller i et firemannsrace vinner 25 %. Terskelen vi
sikter mot er 5 % – ett race av tjue – og 1 % for «mirakel».

SKIFTET er poeng per runde lagt til botsetene og trukket fra mennesket, altså
en forbedring av boten relativt mennesket. Det svarer på: hvor mye bedre må
Adams bli før racet er avgjort?
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


def kjør(runder, skift, mål, antall, rng):
    """→ (andel menneskeseier, snitt antall runder). Bootstrap over hele runder."""
    seire = 0
    sum_r = 0
    n = len(runder)
    for _ in range(antall):
        p = [0.0, 0.0, 0.0, 0.0]
        r = 0
        while max(p) < mål:
            d = runder[rng.randrange(n)]
            # Skiftet flyttes fra mennesket til botene. Nullsum, så racet
            # ikke bare blir kortere for alle.
            p[0] += d[0] - skift
            for s in (1, 2, 3):
                p[s] += d[s] + skift / 3.0
            r += 1
            if r > 400:
                break  # skal ikke skje; hindrer evig løkke ved absurde skift
        sum_r += r
        # Uavgjort på toppen teller som menneskeseier – det konservative valget.
        if p[0] >= max(p):
            seire += 1
    return seire / antall, sum_r / antall


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--runder", default="analyse/race100-runder-0803.txt")
    p.add_argument("--maal", type=int, default=100)
    p.add_argument("--antall", type=int, default=40000)
    p.add_argument("--froe", type=int, default=7)
    p.add_argument("--ut", default="analyse/race100.txt")
    args = p.parse_args()

    runder = les(args.runder)
    rng = random.Random(args.froe)
    linjer = []

    def si(s):
        print(s, flush=True)
        linjer.append(s)

    si(f"{len(runder)} ekte runder som grunnlag, race til {args.maal}, "
       f"{args.antall} simuleringer per skift")
    m0 = sum(r[0] for r in runder) / len(runder)
    mb = sum(r[s] for r in runder for s in (1, 2, 3)) / (3 * len(runder))
    si(f"Målt per runde: mennesket {m0:+.3f}, botsete {mb:+.3f} "
       f"(differanse {mb - m0:+.3f})")
    si("")
    si("  skift   P(mennesket vinner racet)   runder per race")
    for skift in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0]:
        a, r = kjør(runder, skift, args.maal, args.antall, rng)
        merke = ""
        if a <= 0.01:
            merke = "  <- mirakel"
        elif a <= 0.05:
            merke = "  <- maalet"
        si(f"  {skift:+5.1f}          {a * 100:6.2f} %              {r:5.1f}{merke}")
    si("")
    si("En jevn spiller i et firemannsrace vinner 25 %. Uavgjort paa toppen")
    si("telles som menneskeseier - det konservative valget.")

    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(linjer) + "\n")
    print(f"\nSkrevet til {args.ut}")


if __name__ == "__main__":
    main()
