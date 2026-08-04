#!/usr/bin/env python3
"""
LESER GATE2-UTDATA: snitt, SE, trimmet snitt, tegntest og rolledekomponering.

    python verktoy/gate2-les.py analyse/ev-g*.jsonl --ut analyse/ev-sveip.txt

KONTROLLARMEN MÅ MÅLE NØYAKTIG 0. Den er samme spek som miljøet, så enhver
forskjell fra null betyr at noe er ikke-deterministisk i oppsettet og at HELE
målingen er ugyldig. Derfor sjekkes den først og ropes høyt om den avviker.

TRE TALL, IKKE ETT. Snittet er utsatt for haler; det trimmede snittet viser
hvor mye av det som ligger i ytterpunktene; tegntesten er robust mot begge og
sier om kandidaten vinner OFTERE, uansett med hvor mye. Spriker de, står
konklusjonen på det svakeste av dem – ikke det snilleste.
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
    s = sorted(xs)
    k = int(n * 0.05)
    tr = s[k : n - k] or s
    p = sum(1 for x in xs if x > 0)
    g = sum(1 for x in xs if x < 0)
    # Tegntest: z mot 50/50 blant de avgjorte.
    a = p + g
    z = (p - a / 2) / math.sqrt(a * 0.25) if a > 0 else 0.0
    return n, m, se, sum(tr) / len(tr), p, g, z


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("moenstre", nargs="+")
    ap.add_argument("--ut", default="analyse/gate2-les.txt")
    args = ap.parse_args()

    per = defaultdict(list)
    per_rolle = defaultdict(lambda: defaultdict(list))
    stier = []
    for m in args.moenstre:
        stier.extend(sorted(glob.glob(m)))
    for sti in stier:
        with open(sti, encoding="utf-8") as f:
            for linje in f:
                try:
                    r = json.loads(linje)
                except Exception:
                    continue
                d = r.get("d") or {}
                if "KONTROLL" not in d:
                    continue
                base = d["KONTROLL"]
                roller = r.get("r") or {}
                for k, v in d.items():
                    if k == "KONTROLL":
                        continue
                    per[k].append(v - base)
                    per_rolle[k][roller.get(k, "?")].append(v - base)

    linjer = []

    def si(s):
        print(s, flush=True)
        linjer.append(s)

    si(f"{len(stier)} filer, {len(per)} armer")
    si("")
    for navn in sorted(per, key=lambda k: -(stat(per[k]) or (0, 0))[1]):
        s = stat(per[navn])
        if s is None:
            continue
        n, m, se, tr, p, g, z = s
        kort = navn.split(":")[1] if ":" in navn else navn
        si(f"{kort}")
        si(f"   n={n:6d}  {m:+.4f} +/- {se:.4f} ({m / se if se else 0:+.2f} SE)"
           f"  trimmet {tr:+.4f}  tegn {p}/{g} (z={z:+.2f})")
        for rolle in ("fører", "makker", "forsvar"):
            rs = stat(per_rolle[navn].get(rolle, []))
            if rs is not None:
                rn, rm, rse, rtr, _, _, rz = rs
                si(f"     {rolle:8} n={rn:6d}  {rm:+.4f} +/- {rse:.4f}"
                   f"  trimmet {rtr:+.4f}  z={rz:+.2f}")
        si("")

    si("KONTROLLARMEN er miljoespeken selv og MAA vaere nøyaktig 0,0000.")
    si("Er den ikke det, er noe ikke-deterministisk og hele maalingen er ugyldig.")
    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(linjer) + "\n")
    print(f"\nSkrevet til {args.ut}")


if __name__ == "__main__":
    main()
