"""
BUDVANE §0 — TELLINGEN. Hvor mange budbeslutninger har vi, per spiller, i K1-vinduet?

    python verktoy/budvane-census.py [D:/amb-grp/menneske/hendelser.jsonl]

Leser BARE loggen (ingen motor), og svarer på det som avgjør om sporet er målbart:
hvor mange spillere har nok kamper til at «egen bok mot FREMMED bok» kan skilles?
Fremmed-bok-fella krever minst to spillere med mange kamper hver.

Skriver ingen navn — `spiller` er alt et pseudonym (`menneske-eksport.ts`).
"""
import json, sys, collections

STI = sys.argv[1] if len(sys.argv) > 1 else "D:/amb-grp/menneske/hendelser.jsonl"
FRA = "2026-08-10"  # MENNESKE_FRA i examples/menneske-logg.ts — v5-kjeden

kamp_spiller, kamp_tid = {}, {}
bud = collections.defaultdict(list)     # spillId -> [(rundeNr, bud)]
runder = collections.defaultdict(int)   # spillId -> antall runde-rader
vinner = collections.defaultdict(dict)  # spillId -> rundeNr -> (sete, bud)

for linje in open(STI, encoding="utf-8"):
    try:
        o = json.loads(linje)
    except Exception:
        continue
    sid, t, d = o.get("spillId"), o.get("type"), o.get("data") or {}
    if o.get("spiller"):
        kamp_spiller[sid] = o["spiller"]
    tid = o.get("tid", "")
    lo, hi = kamp_tid.get(sid, (tid, tid))
    kamp_tid[sid] = (min(lo, tid), max(hi, tid))
    if t == "valg-bud":
        bud[sid].append((d.get("rundeNr"), d.get("bud")))
    elif t == "runde":
        runder[sid] += 1
    elif t == "budvinner":
        vinner[sid][d.get("rundeNr")] = (d.get("spiller"), d.get("bud"))

vindu = [s for s, (lo, hi) in kamp_tid.items() if lo >= FRA]
print(f"kamper i alt {len(kamp_tid)} · med HELE kampen fra {FRA}: {len(vindu)}")

per = collections.defaultdict(lambda: {"kamper": 0, "runder": 0, "bud": 0})
budfordeling = collections.defaultdict(collections.Counter)
for s in vindu:
    p = kamp_spiller.get(s, "?")
    per[p]["kamper"] += 1
    per[p]["runder"] += runder[s]
    per[p]["bud"] += len(bud[s])
    for _, b in bud[s]:
        budfordeling[p][str(b)] += 1

print(f"\n{'spiller':14} {'kamper':>7} {'runder':>7} {'bud':>6}   budfordeling")
tot = collections.Counter()
for p, v in sorted(per.items(), key=lambda x: -x[1]["kamper"]):
    tot.update(budfordeling[p])
    topp = ", ".join(f"{b}:{n}" for b, n in budfordeling[p].most_common(8))
    print(f"{p[:12]:14} {v['kamper']:>7} {v['runder']:>7} {v['bud']:>6}   {topp}")
print(f"\nALLE          {len(vindu):>7} {sum(v['runder'] for v in per.values()):>7} "
      f"{sum(v['bud'] for v in per.values()):>6}   {', '.join(f'{b}:{n}' for b, n in tot.most_common(12))}")

nok = [p for p, v in per.items() if v["kamper"] >= 20]
print(f"\nSpillere med >= 20 kamper (fremmed-bok-fella trenger minst to): {len(nok)}")
