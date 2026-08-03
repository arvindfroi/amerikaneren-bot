"""KRYSSINDEKS: hva hver modell faktisk lener seg på, side om side.

    python verktoy/kryssindeks.py analyse/kol-*.json > analyse/kryssindeks.txt

Arvind: «jeg vil ha en sykt stor og dyp analyse over hele indeksen, og med
indeksen til andre modeller vi har hatt med å gjøre. Vi må vite om det er ting
som er skadelig, og hvor det er gullkorn i de andre.»

Hver `kol-*.json` er én modells permutasjonsviktighet per kolonne og per rolle
(`verktoy/sd-kolonner.py`). Denne fila setter dem ved siden av hverandre og
svarer på tre ting som ikke kan leses av én modell alene:

  FELLESGODS   kolonner alle modellene lener seg på. Det er ryggraden i
               kodingen, og den skal man ikke rote med.
  SKILLET      kolonner der modellene er UENIGE. Der ligger enten et gullkorn
               den ene har funnet, eller en felle den ene har gått i.
  SKADEN       kolonner med NEGATIV viktighet – modellen blir bedre av å miste
               dem. Et lite negativt tall er støy; et konsistent negativt tall
               på tvers av modeller er et trekk som bør ut.

FORBEHOLDET SOM MÅ STÅ: viktigheten er målt på data modellene er trent på. For
et memorert trekk er høy viktighet DER forventet – de 52 én-av-kolonnene i
minneblokken hadde viktighet 0,390 og kostet −1,475 i spill. Høy viktighet er
altså ikke bevis på verdi. Tabellen peker ut hvor man skal se, ikke hva som er
sant; gate 2 avgjør det siste.
"""

import glob
import json
import sys

BLOKKER = [
    (0, 52, "egen haand"),
    (52, 104, "spilte kort"),
    (104, 156, "bordet naa"),
    (156, 208, "etterlyst"),
    (208, 220, "roller (rel)"),
    (220, 228, "trumf/bud"),
    (228, 238, "stikk/poeng"),
    (238, 246, "fordeling"),
    (246, 262, "renonse"),
    (262, 273, "ute + rest"),
    (273, 277, "v2 vrak/farge"),
    (277, 329, "v2 vrak EN-AV"),
    (329, 340, "v2 korrigert"),
    (340, 356, "v3 telling"),
    (356, 364, "v4 auksjon"),
    (364, 376, "v5 plan"),
]


def blokk(i):
    for a, b, navn in BLOKKER:
        if a <= i < b:
            return navn
    return "?"


def main():
    stier = []
    for m in sys.argv[1:]:
        stier += sorted(glob.glob(m))
    if not stier:
        raise SystemExit("ingen kol-*.json angitt")

    modeller = {}
    for sti in stier:
        with open(sti, encoding="utf-8") as f:
            d = json.load(f)
        navn = d["nett"].split("/")[-1].replace(".bin", "")
        modeller[navn] = {r["i"]: r for r in d["kolonner"]}

    navn_sortert = sorted(modeller)
    print(f"KRYSSINDEKS over {len(navn_sortert)} modeller: {', '.join(navn_sortert)}")
    print("delta = oekning i anger naar kolonnen stokkes. Hoeyere = modellen lener seg mer paa den.\n")

    # --- PER BLOKK -----------------------------------------------------------
    print("PER BLOKK (sum av delta over kolonnene i blokken)")
    print(f"{'blokk':16}{'kol':>5}" + "".join(f"{n:>12}" for n in navn_sortert))
    for a, b, bnavn in BLOKKER:
        rad = f"{bnavn:16}{b - a:>5}"
        noe = False
        for n in navn_sortert:
            kols = [modeller[n][i] for i in range(a, b) if i in modeller[n]]
            if not kols:
                rad += f"{'—':>12}"
                continue
            noe = True
            rad += f"{sum(k['delta']['alle'] for k in kols):>12.4f}"
        if noe:
            print(rad)

    # --- SKILLET -------------------------------------------------------------
    # Kolonner der modellene er mest uenige, blant dem ALLE har.
    felles = set(modeller[navn_sortert[0]])
    for n in navn_sortert[1:]:
        felles &= set(modeller[n])
    felles = sorted(felles)

    def spenn(i):
        xs = [modeller[n][i]["delta"]["alle"] for n in navn_sortert]
        return max(xs) - min(xs), xs

    print(f"\nSTOERST UENIGHET blant de {len(felles)} kolonnene alle modellene har")
    print(f"{'i':>5}{'blokk':16}{'spenn':>9}" + "".join(f"{n:>12}" for n in navn_sortert))
    for i in sorted(felles, key=lambda i: -spenn(i)[0])[:20]:
        s, xs = spenn(i)
        print(f"{i:>5}{blokk(i):16}{s:>9.4f}" + "".join(f"{x:>12.4f}" for x in xs))

    # --- SKADEN --------------------------------------------------------------
    print("\nKONSISTENT NEGATIVE (modellen blir BEDRE av aa miste kolonnen)")
    print(f"{'i':>5}{'blokk':16}{'antall<0':>9}{'snitt':>10}")
    rader = []
    for i in felles:
        xs = [modeller[n][i]["delta"]["alle"] for n in navn_sortert]
        neg = sum(1 for x in xs if x < 0)
        if neg >= max(2, len(navn_sortert) - 1):
            rader.append((i, neg, sum(xs) / len(xs)))
    for i, neg, snitt in sorted(rader, key=lambda r: r[2])[:20]:
        print(f"{i:>5}{blokk(i):16}{neg:>9}{snitt:>10.5f}")
    if not rader:
        print("  ingen kolonne er negativ i naer alle modeller")

    # --- ROLLEPROFIL ---------------------------------------------------------
    print("\nHVOR HVER MODELL HENTER VIKTIGHETEN SIN (andel av total, per rolle)")
    print(f"{'modell':14}{'foerer':>10}{'makker':>10}{'forsvar':>10}")
    for n in navn_sortert:
        t = {r: sum(k["delta"][r] for k in modeller[n].values()) for r in ("foerer", "makker", "forsvar")}
        s = sum(t.values()) or 1.0
        print(f"{n:14}" + "".join(f"{100 * t[r] / s:>9.1f}%" for r in ("foerer", "makker", "forsvar")))


if __name__ == "__main__":
    main()
