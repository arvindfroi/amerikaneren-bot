#!/usr/bin/env python3
"""
LESER ROLLEANGER: hvor mye kan hver rolle hente, i beste fall?

    python verktoy/rolleanger-les.py "analyse/ra-g*.jsonl" --ut analyse/rolleanger.txt

TALLET ER ET TAK, IKKE ET SLØSERI-MÅL. Fasiten ser alle fire hender; boten ser
sin egen. En del av angeren er derfor uunngåelig – den skyldes at
informasjonen ikke finnes. Det gjør tallet til en ØVRE grense for hva bedre
spill kan hente, og det er nettopp det spørsmålet er: er grensen for forsvar
liten, er linja ikke verdt å forfølge.

TVUNGNE TREKK TELLER IKKE. Har setet ett lovlig kort, er angeren null per
konstruksjon, og å ta dem med ville fortynnet alle rater med en faktor som
varierer mellom rollene (forsvarere følger farge oftere enn føreren).
Rapporten viser begge, men rate-per-VALG er tallet som betyr noe.

OMREGNING TIL POENG er ikke gjort her, og det er med vilje. Et stikk fra eller
til flytter ±2N når det avgjør kontrakten, og ingenting når den er trygt i
havn eller trygt tapt. Kontrakten og utfallet logges per giv, så omregningen
kan gjøres på de rundene der den betyr noe.
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
    return n, m, se


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("moenstre", nargs="+")
    ap.add_argument("--ut", default="analyse/rolleanger.txt")
    args = ap.parse_args()

    stier = []
    for m in args.moenstre:
        stier.extend(sorted(glob.glob(m)))

    per_rolle = defaultdict(list)          # alle trekk
    per_rolle_valg = defaultdict(list)     # bare trekk med >1 lovlig kort
    per_stikk = defaultdict(list)
    per_giv_rolle = defaultdict(lambda: defaultdict(float))
    giv_info = {}
    tvungne = defaultdict(int)
    alle = defaultdict(int)

    for sti in stier:
        with open(sti, encoding="utf-8") as f:
            for l in f:
                try:
                    r = json.loads(l)
                except Exception:
                    continue
                giv_info[r["frø"]] = (r["bud"], r["klart"])
                for x in r["valg"]:
                    rl = x["rolle"]
                    # Budlaget vil ha FLEST stikk, forsvaret FÆRREST.
                    a = (x["beste"] - x["valgt"]) if rl != "forsvar" else (x["valgt"] - x["beste"])
                    per_rolle[rl].append(a)
                    alle[rl] += 1
                    if x["lovlige"] <= 1:
                        tvungne[rl] += 1
                    else:
                        per_rolle_valg[rl].append(a)
                        per_stikk[(rl, x["stikk"])].append(a)
                    per_giv_rolle[r["frø"]][rl] += a

    L = []

    def si(s=""):
        print(s, flush=True)
        L.append(s)

    si(f"{len(stier)} filer, {len(giv_info)} giver")
    si()
    si("=== ANGER PER EKTE VALG (>1 lovlig kort), i stikk ===")
    si(f"  {'rolle':<9} {'n':>7}  {'snitt':>8}  {'SE':>7}  {'andel>0':>8}  {'tvungne':>8}")
    for rl in ("fører", "makker", "forsvar"):
        xs = per_rolle_valg.get(rl, [])
        s = stat(xs)
        if s is None:
            continue
        n, m, se = s
        andel = sum(1 for x in xs if x > 0) / n
        tv = tvungne[rl] / alle[rl] if alle[rl] else 0
        si(f"  {rl:<9} {n:7d}  {m:8.4f}  {se:7.4f}  {100 * andel:7.1f} %  {100 * tv:7.1f} %")
    si()

    si("=== ANGER PER GIV, summert over rollens trekk i giva ===")
    si("  (dette er taket i STIKK for hva perfekt spill i rollen ville gitt)")
    for rl in ("fører", "makker", "forsvar"):
        # Merk: 2 forsvarere per giv, saa summen deres daekker to seter.
        xs = [g[rl] for g in per_giv_rolle.values() if rl in g]
        s = stat(xs)
        if s:
            n, m, se = s
            ekstra = "  (to seter til sammen)" if rl == "forsvar" else ""
            si(f"  {rl:<9} n={n:5d}  {m:6.3f} +/- {se:.3f} stikk per giv{ekstra}")
    si()

    si("=== HVOR I SPILLET SITTER ANGEREN? (snitt per valg, per stikk) ===")
    stikk = sorted({s for (_, s) in per_stikk})
    si("  stikk   " + "  ".join(f"{s:>6d}" for s in stikk))
    for rl in ("fører", "makker", "forsvar"):
        rad = []
        for s in stikk:
            xs = per_stikk.get((rl, s), [])
            rad.append(f"{sum(xs) / len(xs):6.3f}" if len(xs) >= 20 else "     .")
        si(f"  {rl:<8}" + "  ".join(rad))
    si()
    si("«.» = færre enn 20 valg, ikke rapportert.")
    si()

    # --- Var giva i det hele tatt i spill? ---------------------------------
    #
    # Arvind: «man kan spille bra forsvar og ikke ha en sjanse.» Det er en
    # empirisk paastand, og den kan avgjoeres. Ved foerste analyserte stilling
    # sier DD-fasiten hva budlaget faar med perfekt spill paa BEGGE sider. Er
    # det tallet langt over eller langt under kontrakten, var runden avgjort
    # foer noen ferdighet fikk virke - da er forsvarets anger uten poengverdi
    # uansett hvor stor den er.
    si("=== VAR RUNDEN I SPILL? (DD-fasit ved foerste analyserte stilling) ===")
    margin = defaultdict(int)
    tot = 0
    for sti in stier:
        with open(sti, encoding="utf-8") as f:
            for l in f:
                try:
                    r = json.loads(l)
                except Exception:
                    continue
                if not r["valg"]:
                    continue
                # Foererens beste = budlagets DD-optimum i den stillingen.
                f0 = next((x for x in r["valg"] if x["rolle"] == "fører"), r["valg"][0])
                dd = f0["beste"] if f0["rolle"] != "forsvar" else f0["valgt"]
                margin[dd - r["bud"]] += 1
                tot += 1
    if tot:
        nær = sum(v for k, v in margin.items() if abs(k) <= 1)
        si(f"  {tot} giver. DD-fasit minus kontrakt:")
        for k in sorted(margin):
            if margin[k] >= max(2, tot // 100):
                si(f"    {k:+3d} stikk: {margin[k]:5d} ({100 * margin[k] / tot:5.1f} %)")
        si(f"  PAA MARGINEN (innen +/-1 stikk): {nær} av {tot} = {100 * nær / tot:.1f} %")
        si("  Utenfor marginen er runden avgjort av giva, ikke av spillet -")
        si("  og der er forsvarets anger uten poengverdi uansett stoerrelse.")
    si()
    si("TAKET, IKKE SLOESERIET: fasiten ser alle fire hender, boten ser sin egen.")
    si("En del av angeren er uunngaaelig fordi informasjonen ikke finnes.")

    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"\nSkrevet til {args.ut}")


if __name__ == "__main__":
    main()
