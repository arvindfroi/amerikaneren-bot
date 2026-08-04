"""HVA HADDE MENNESKET PÅ HÅNDEN DA DET BØD? — fra loggen, uten ny logging.

    python verktoy/menneskehand.py hendelser.json > analyse/menneskehand.txt

ARVINDS DESIGN (4. august):

  «Motstandermodellering skal skje over mange runder med samme motstander. At
   den adapterer gjennom mange runder for å bli bedre med/mot de andre. Byr de
   høyt eller lavt, hvordan spiller de ut. Jeg ser for meg at den husker hvor
   lang trumfserie du hadde siste gangene du bød 9, og tar det i betraktning
   når den gjetter hva hånden din er nå.»

DATAEN FINNES ALLEREDE, og det var ikke åpenbart. Val Town-loggen inneholder
ingen hender – men den inneholder HVERT KORTVALG mennesket gjør, og kortene et
menneske spiller ER hånden. Målt på basen: 1 172 runder har nøyaktig 12
`valg-kort`, altså en fullstendig hånd.

DEN ENE KOMPLIKASJONEN. Er mennesket budvinner, tok det opp talongen og vraket
fire – da er de spilte kortene ikke den utdelte hånden. `valg-vrak` sier hvor
mange, ikke hvilke. Derfor brukes BARE runder der mennesket IKKE vant budet.
Det er ~75 % av dem, og for dem er de tolv spilte kortene hånden eksakt.

HVA SOM REGNES UT, og hvorfor nettopp det: for hvert bud mennesket avga,
fordelingen av hva hånden faktisk inneholdt.

  lengste farge     «hvor lang trumfserie hadde du» – Arvinds egne ord
  honnører          ess og konger
  ess               alene, fordi de er sikre stikk
  fordeling         lengden på nest lengste farge, altså om hånden er skjev

Dette er BEFOLKNINGSTALL for én spiller. Krympingsestimatoren i
motstandermodellen skal starte på dem og flytte mot individet etter hvert som
observasjonene kommer – etter tre runder finnes det ikke grunnlag for et
individuelt anslag.
"""

import json
import sys
from collections import defaultdict

FARGER = ["S", "H", "R", "K"]


def les(sti):
    with open(sti, encoding="utf-8") as f:
        return json.load(f)


def main():
    rader = les(sys.argv[1] if len(sys.argv) > 1 else "analyse/hendelser.json")

    # (spill_id, rundeNr) -> samlet informasjon
    runder = defaultdict(lambda: {"kort": [], "bud": None, "budvinner": None, "navn": None})
    for r in rader:
        try:
            d = json.loads(r["data"])
        except Exception:
            continue
        rn = d.get("rundeNr")
        if rn is None:
            continue
        n = runder[(r["spill_id"], rn)]
        n["navn"] = r.get("navn")
        if r["type"] == "valg-kort" and isinstance(d.get("kort"), dict):
            n["kort"].append(d["kort"])
        elif r["type"] == "valg-bud":
            # SISTE bud vinner: en spiller kan by flere ganger i samme runde,
            # og det høyeste er det som beskriver hånden.
            b = d.get("bud")
            if isinstance(b, int):
                n["bud"] = b if n["bud"] is None else max(n["bud"], b)
        elif r["type"] == "budvinner":
            n["budvinner"] = d.get("spiller")

    brukbare = []
    for (spill, rn), n in runder.items():
        if len(n["kort"]) != 12:
            continue
        # MENNESKET ER SETE 0. Var det budvinner, er de spilte kortene ikke den
        # utdelte hånden (talong inn, fire vraket ut) - da hoppes runden over.
        if n["budvinner"] == 0:
            continue
        if n["bud"] is None:
            continue  # passet uten tallbud
        brukbare.append(n)

    if not brukbare:
        print("Ingen brukbare runder.")
        return

    def trekk(kort):
        per = defaultdict(list)
        for k in kort:
            per[k["farge"]].append(k["verdi"])
        lengder = sorted((len(v) for v in per.values()), reverse=True)
        while len(lengder) < 4:
            lengder.append(0)
        return {
            "lengste": lengder[0],
            "nest": lengder[1],
            "ess": sum(1 for k in kort if k["verdi"] == 14),
            "honnoer": sum(1 for k in kort if k["verdi"] >= 13),
        }

    perBud = defaultdict(list)
    for n in brukbare:
        perBud[n["bud"]].append(trekk(n["kort"]))

    def snitt(xs):
        return sum(xs) / len(xs) if xs else float("nan")

    print(f"MENNESKETS HAAND NAAR DET BOED — {len(brukbare)} runder der mennesket IKKE vant budet\n")
    print(f"{'bud':>5}{'runder':>8}{'lengste':>10}{'nest':>8}{'ess':>8}{'honnoer':>9}")
    alle = [t for ts in perBud.values() for t in ts]
    for bud in sorted(perBud):
        ts = perBud[bud]
        print(
            f"{bud:>5}{len(ts):>8}{snitt([t['lengste'] for t in ts]):>10.2f}"
            f"{snitt([t['nest'] for t in ts]):>8.2f}{snitt([t['ess'] for t in ts]):>8.2f}"
            f"{snitt([t['honnoer'] for t in ts]):>9.2f}"
        )
    print(
        f"{'ALLE':>5}{len(alle):>8}{snitt([t['lengste'] for t in alle]):>10.2f}"
        f"{snitt([t['nest'] for t in alle]):>8.2f}{snitt([t['ess'] for t in alle]):>8.2f}"
        f"{snitt([t['honnoer'] for t in alle]):>9.2f}"
    )
    print(
        "\nSIGNALET er forskjellen mellom radene. Er lengste farge og honnoerer\n"
        "flate over budnivaaene, baerer budet lite om haanden - og da har\n"
        "motstandermodellen ingenting aa lene seg paa for DENNE spilleren."
    )


if __name__ == "__main__":
    main()
