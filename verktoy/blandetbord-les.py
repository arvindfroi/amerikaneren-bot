#!/usr/bin/env python3
"""
LESER BLANDET BORD: hvor skiller A og B seg, og hva skyldes hva?

    python verktoy/blandetbord-les.py "analyse/bb-g*.jsonl" --ut analyse/blandetbord.txt

PARRINGEN ER PÅ GIV, ikke på rad. Hver giv er spilt to ganger med byttede
seter, og de to radene slås sammen til ÉN observasjon før noe regnes ut.
Regner man på radene hver for seg, teller man samme giv to ganger og halverer
SE-en uten å ha mer informasjon – tallet ser dobbelt så sikkert ut som det er.

HOVEDTALLET er poeng per runde: snittet over A-setene minus snittet over
B-setene, midlet over de to oppsettene. Seteeffekten kansellerer ved
konstruksjon.

DEKOMPONERINGENE svarer på ulike spørsmål, og de er IKKE additive:

  ROLLE      hva er A verdt som fører, som makker, som forsvarer? Her er
             parringen brutt – A og B har ikke samme rolle i samme runde – så
             tallene er ustratifiserte snitt med hver sin SE.

             FØRERTALLET ER SKJEVT OPPOVER I A SIN FAVØR, og det må leses med.
             B vinner bare budrunden når A PASSER, altså på hender A vurderte
             som ikke verdt å ta. B spiller derfor sine kontrakter på et
             dårligere håndutvalg enn A gjør. Retningen er ekte, størrelsen
             overdrevet. Makker- og forsvarstallene har ikke dette problemet:
             der er rollen tildelt av hvem som har det etterlyste kortet, ikke
             av hvem som valgte å by.

  BUDRUNDEN  hvor ofte vinner A budrunden, på hvilket nivå, og hvor ofte
             holder kontrakten? Dette er «fasen» før et eneste kort er spilt,
             og den avgjør hvem som i det hele tatt er i poengfeltet.

  LAG        A+A, A+B, B+B. At A+B-lag finnes er hele poenget: det er den
             eneste måten å se om de spiller SAMMEN dårligere enn hver for seg.

             MEN TALLENE ER KONFUNDERT og kan ikke leses som en årsak.
             Lagsammensetningen avgjøres av hvem som har det etterlyste kortet, og av hvem som vant budrunden – ikke av tilfeldighet. Et
             AA-lag oppstår oftere på giv der A har lang trumf i to hender.
             Sammenlikningen er tatt med fordi den er verdt å se, ikke fordi
             den avgjør noe.

SIGNIFIKANS: SE over giv-par, og tegntest ved siden av. Poengene har ±18/9 og
±20/10 i halene, så snittet alene er ikke nok.
"""

import argparse
import glob
import json
import math
from collections import defaultdict


def stat(xs):
    n = len(xs)
    if n < 2:
        return None
    m = sum(xs) / n
    se = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1) / n)
    p = sum(1 for x in xs if x > 0)
    g = sum(1 for x in xs if x < 0)
    a = p + g
    z = (p - a / 2) / math.sqrt(a * 0.25) if a else 0.0
    return n, m, se, p, g, z


def linje(navn, s, bredde=26):
    if s is None:
        return f"  {navn:<{bredde}} (for få)"
    n, m, se, p, g, z = s
    stjerne = " *" if se > 0 and abs(m / se) >= 2 else "  "
    return (
        f"  {navn:<{bredde}} n={n:6d}  {m:+.4f} +/- {se:.4f} "
        f"({m / se if se else 0:+5.2f} SE){stjerne} tegn {p}/{g} (z={z:+.2f})"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("moenstre", nargs="+")
    ap.add_argument("--ut", default="analyse/blandetbord.txt")
    args = ap.parse_args()

    per_frø = defaultdict(list)
    stier = []
    for m in args.moenstre:
        stier.extend(sorted(glob.glob(m)))
    for sti in stier:
        with open(sti, encoding="utf-8") as f:
            for l in f:
                try:
                    r = json.loads(l)
                except Exception:
                    continue
                per_frø[r["frø"]].append(r)

    L = []

    def si(s=""):
        print(s, flush=True)
        L.append(s)

    # --- Hovedtallet: parret paa giv ---------------------------------------
    hoved = []
    for frø, rader in per_frø.items():
        if len(rader) != 2:
            continue  # bare komplette giv-par; en halv observasjon har seteeffekt i seg
        d = 0.0
        for r in rader:
            a = [r["delta"][i] for i in range(4) if r["type"][i] == "A"]
            b = [r["delta"][i] for i in range(4) if r["type"][i] == "B"]
            d += sum(a) / len(a) - sum(b) / len(b)
        hoved.append(d / 2)

    si(f"{len(stier)} filer, {len(per_frø)} giv, {len(hoved)} komplette giv-par")
    si()
    si("=== HOVEDTALLET: poeng per runde, A minus B, parret paa giv ===")
    si(linje("A - B", stat(hoved)))
    si()

    # --- Rolle -------------------------------------------------------------
    # Ustratifisert: A og B har ikke samme rolle i samme runde, saa parringen
    # er brutt her og hver rolle faar sin egen SE.
    rolle = defaultdict(list)
    for rader in per_frø.values():
        for r in rader:
            for i in range(4):
                rolle[(r["type"][i], r["rolle"][i])].append(r["delta"][i])
    si("=== ROLLE: poeng per runde i rollen (ustratifisert, egen SE) ===")
    for rl in ("fører", "makker", "forsvar"):
        for t in ("A", "B"):
            s = stat(rolle.get((t, rl), []))
            if s:
                n, m, se, *_ = s
                si(f"  {t} som {rl:<8} n={n:6d}  {m:+.4f} +/- {se:.4f}")
        sa, sb = stat(rolle.get(("A", rl), [])), stat(rolle.get(("B", rl), []))
        if sa and sb:
            d = sa[1] - sb[1]
            sd = math.sqrt(sa[2] ** 2 + sb[2] ** 2)
            si(f"    -> forskjell {d:+.4f} +/- {sd:.4f} ({d / sd if sd else 0:+.2f} SE)")
        si()

    # --- Budrunden ---------------------------------------------------------
    si("=== BUDRUNDEN: hvem havner i poengfeltet, og holder kontrakten? ===")
    bud = defaultdict(lambda: {"n": 0, "sum": 0, "klart": 0, "poeng": 0.0})
    tot = 0
    for rader in per_frø.values():
        for r in rader:
            t = r["type"][r["budvinner"]]
            b = bud[t]
            b["n"] += 1
            b["sum"] += r["bud"]
            b["klart"] += 1 if r["klart"] else 0
            b["poeng"] += r["delta"][r["budvinner"]]
            tot += 1
    for t in ("A", "B"):
        b = bud[t]
        if b["n"] == 0:
            continue
        si(
            f"  {t} vant budrunden {b['n']:5d} av {tot} ({100 * b['n'] / tot:.1f} %), "
            f"snittbud {b['sum'] / b['n']:.2f}, "
            f"klart {100 * b['klart'] / b['n']:.1f} %, "
            f"{b['poeng'] / b['n']:+.2f} poeng per kontrakt"
        )
    si()

    # --- Lagsammensetning --------------------------------------------------
    si("=== LAG: spiller de daarligere SAMMEN enn hver for seg? ===")
    lag = defaultdict(list)
    for rader in per_frø.values():
        for r in rader:
            mk = r["makker"]
            if mk is None:
                continue
            par = "".join(sorted([r["type"][r["budvinner"]], r["type"][mk]]))
            # Budlagets samlede poeng - det er laget som lykkes eller feiler.
            lag[par].append(r["delta"][r["budvinner"]] + r["delta"][mk])
    for par in ("AA", "AB", "BB"):
        s = stat(lag.get(par, []))
        if s:
            n, m, se, *_ = s
            si(f"  budlag {par}  n={n:6d}  {m:+.3f} +/- {se:.3f} poeng til laget")
    sa, sab = stat(lag.get("AA", [])), stat(lag.get("AB", []))
    if sa and sab:
        d = sa[1] - sab[1]
        sd = math.sqrt(sa[2] ** 2 + sab[2] ** 2)
        si(f"    AA - AB = {d:+.3f} +/- {sd:.3f} ({d / sd if sd else 0:+.2f} SE)")
    si()
    si("* = minst 2 SE. Tegntesten staar ved siden av fordi poengene har")
    si("+/-18/9 og +/-20/10 i halene, og snittet alene ikke er nok.")

    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"\nSkrevet til {args.ut}")


if __name__ == "__main__":
    main()
