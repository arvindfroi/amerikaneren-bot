# -*- coding: utf-8 -*-
"""Leser kampbenken.

KLYNGEKORRIGERT SE, og det er ikke pynt. De fire radene fra samme froe deler
SAMME kontrollkamp, saa de er ikke uavhengige - naiv SE over rader ville
undervurdert usikkerheten. Derfor aggregeres det per froe foerst.

MILJOETS vinnerandel MAA vaere noeyaktig 0,2500: kontrollkampen har akkurat
en vinner, og hvert sete er fokus en gang. Er den ikke det, er noe galt.
"""
import glob, json, math, sys

# ALLE POSISJONSARGUMENTER, hvert globbet. `kampport.sh` sendte globben UKVOTERT, saa
# bash ekspanderte den til seksten filnavn, og her ble bare sys.argv[1] lest - SKARD 0.
# Hver kampport med 16 skard ble dermed doemt paa 1/16 av kampene (funnet 10. sep:
# i1b «0,190, -1,44 SE» paa 25 froe var 0,204, -5,19 SE paa 400).
utfil = None
if "--ut" in sys.argv:
    utfil = sys.argv[sys.argv.index("--ut") + 1]
monstre = [a for i, a in enumerate(sys.argv[1:], 1)
           if not a.startswith("--") and sys.argv[i - 1] != "--ut"]
if not monstre:
    sys.exit("bruk: kamp-les.py <jsonl-glob> [flere ...] [--ut fil]")

per_froe = {}
rader = 0
filer = sorted({f for m in monstre for f in glob.glob(m)})
if not filer:
    sys.exit(f"ingen filer matcher {monstre}")
for f in filer:
    for ln in open(f, encoding="utf-8"):
        ln = ln.strip()
        if not ln:
            continue
        r = json.loads(ln)
        per_froe.setdefault(r["frø"], []).append(r)
        rader += 1

L = []
for froe, rs in per_froe.items():
    if len(rs) != 4:
        continue
    L.append((
        sum(x["kandVant"] for x in rs) / 4.0,
        sum(x["miljøVant"] for x in rs) / 4.0,
        sum(x["kandMargin"] for x in rs) / 4.0,
        sum(x["miljøMargin"] for x in rs) / 4.0,
        sum(x["kandRunder"] for x in rs) / 4.0,
    ))
n = len(L)

def stat(par):
    d = [a - b for a, b in par]
    m = sum(d) / len(d)
    v = sum((x - m) ** 2 for x in d) / max(1, len(d) - 1)
    return m, math.sqrt(v / len(d))

vinn = stat([(a, b) for a, b, _, _, _ in L])
marg = stat([(c, d) for _, _, c, d, _ in L])
pos = sum(1 for a, b, _, _, _ in L if a > b)
neg = sum(1 for a, b, _, _, _ in L if a < b)
z = (pos - neg) / math.sqrt(pos + neg) if pos + neg else 0.0

kandandel = sum(a for a, _, _, _, _ in L) / n
miljoandel = sum(b for _, b, _, _, _ in L) / n
runder = sum(e for _, _, _, _, e in L) / n

ut = []
ut.append("%d froe, %d rader, %.1f runder per kamp  (%d filer)" % (n, rader, runder, len(filer)))
ut.append("")
ut.append("  KANDIDATENS vinnerandel   %.4f" % kandandel)
ut.append("  MILJOETS vinnerandel      %.4f   <- MAA vaere 0.2500" % miljoandel)
ut.append("")
ut.append("  differanse i vinnerandel  %+.4f +/- %.4f  (%+.2f SE)" % (vinn[0], vinn[1], vinn[0] / vinn[1] if vinn[1] else 0))
ut.append("  tegntest froe             %d opp / %d ned  (z=%+.2f)" % (pos, neg, z))
ut.append("")
ut.append("  differanse i sluttmargin  %+.3f +/- %.3f  (%+.2f SE)" % (marg[0], marg[1], marg[0] / marg[1] if marg[1] else 0))
ut.append("")
ut.append("  Grunnlinja er 0,2500. En vinnerandel paa 0,2500 betyr INGEN forskjell;")
ut.append("  0,3333 betyr at kandidaten vinner 1 av 3 mot tre like motstandere.")
s = "\n".join(ut)
print(s)
if utfil:
    open(utfil, "w", encoding="utf-8").write(s + "\n")
