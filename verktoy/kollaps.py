"""KOLLAPSVAKT — vokter den overtilpasningen som IKKE vises i en holdout.

ARVIND: «pass deg for overfitting, og pass på at den lærer av seg selv.»

De to henger sammen, og det er verdt å si hvorfor.

================= HOLDOUTEN SER IKKE DEN FARLIGE FEILEN =====================

Treningsloggene viser gap −0,0238: holdout-tapet er LAVERE enn treningstapet.
Klassisk overtilpasning finnes altså ikke her, og en holdout til ville ikke
funnet noe den første ikke fant.

Men holdouten er trukket fra SAMME selvspill som treningen. Den deler frø, så
ingen enkeltstilling lekker — og likevel deler den fordeling. Den kan derfor
ikke se den feilen som faktisk truer et selvlærende system:

    FORDELINGSKOLLAPS. Nettet blir stadig bedre på stillingene dets eget spill
    når fram til, og stadig dårligere på alt annet. Selvspillet snevrer seg
    inn, treningen følger etter, og begge tallene ser sunne ut hele veien ned.

Det er ikke et hypotetisk problem: hele poenget med å sette et nytt nett inn i
generatoren er at neste korpus skal komme fra det nye nettets spill. Løkka som
gjør systemet selvlærende er den samme løkka som kan snevre det inn.

================= HVA SOM FAKTISK ER MÅLBART, OG HVA SOM IKKE ER ===========

`sd-frys2` er 87 964 stillinger fra den GAMLE fordelingen, med de gamle
SD-etikettene. Den er en fremmed prøve, og det er nettopp det vi vil ha.

Men vær ærlig om hva et enkelt tall derfra betyr: **ingenting alene.** Blir
angeren på `sd-frys2` verre, kan det være kollaps — eller det kan være at
nettet helt riktig har lært å være UENIG med de gamle, svakere etikettene. Vi
tror jo nettopp at alpha-mu er en bedre lærer enn SD; da SKAL et bedre nett
score dårligere mot en dårligere fasit.

De to kan ikke skilles fra ett målepunkt. De kan skilles fra en KURVE:

    faller selvspill-angeren mens fremmed-angeren stiger MONOTONT over flere
    generasjoner, er det kollaps. Et engangshopp er uenighet med gammel fasit.

Derfor skriver denne fila til en jsonl som VOKSER, og rapporterer trenden ved
siden av tallet. Et enkelt tall herfra skal ikke brukes til å bestemme noe.

================= BREDDEBEGRENSNINGEN, SAGT HØYT =========================

`sd-frys2` er 273 trekk bred. Et 714-nett kan ikke evalueres på den, og å fylle
de 441 manglende med null ville vært en løgn om hva nettet ser — samme grunn
som `--klipp` aldri padder oppover.

Arm A (714) har derfor INGEN fremmed prøve i dag. Det er et hull, ikke en
detalj, og det står her i stedet for at målingen stilltiende hopper over den.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time

import torch


def last_sdtren():
    """Importer sd-tren.py som modul, så anger-definisjonen brukes ÉN gang.

    To definisjoner av samme størrelse er den feilklassen som har bitt dette
    prosjektet gjentatte ganger. `maal_i_biter` er fasiten; den skal ikke
    skrives om her.
    """
    sti = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sd-tren.py")
    spec = importlib.util.spec_from_file_location("sdtren", sti)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # main() er vaktet av __name__, så ingenting kjøres
    return mod


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--nett", required=True, help="komma-separerte .bin-filer")
    p.add_argument("--korpus", required=True, help="komma-separerte mapper")
    p.add_argument("--bredde", type=int, default=273)
    p.add_argument("--tau", type=float, default=1.0)
    p.add_argument("--ut", default="analyse/kollaps.txt")
    p.add_argument("--jsonl", default="analyse/kollaps.jsonl")
    p.add_argument("--merk", default="")
    a = p.parse_args()

    S = last_sdtren()
    enhet = "cuda" if torch.cuda.is_available() else "cpu"

    netter = [x for x in a.nett.split(",") if x]
    mapper = [x for x in a.korpus.split(",") if x]

    # BREDDEVAKT FØR NOE LESES. Et nett som ikke passer korpuset skal stoppe
    # målingen, ikke få en stilltiende null-fylt inngang.
    for n in netter:
        lag = S.les_vekter(n)
        inn = lag[0][0].shape[1]
        if inn != a.bredde:
            raise SystemExit(
                f"{n} venter {inn} trekk, --bredde er {a.bredde}. "
                "Ingen padding: nettet ville sett noe annet enn det er trent for."
            )

    linjer: list[str] = []
    linjer.append(f"# KOLLAPSVAKT {time.strftime('%Y-%m-%d %H:%M')}  {a.merk}")
    linjer.append(f"# bredde {a.bredde}, enhet {enhet}")
    linjer.append("")
    linjer.append(f"{'nett':<28}{'korpus':<16}{'n':>9}{'tap':>10}{'treff':>9}{'anger':>10}")
    linjer.append("-" * 82)

    rader = []
    for mappe in mapper:
        X, V, M, FRO, KILDE, SIG = S.les([mappe], klipp=a.bredde)
        Xk = torch.from_numpy(X).to(enhet)
        Vg = torch.from_numpy(V).to(enhet)
        Mg = torch.from_numpy(M).to(enhet)
        alle = torch.arange(Xk.shape[0], device=enhet)

        for n in netter:
            lag = S.les_vekter(n)
            dims = [lag[0][0].shape[1]] + [W.shape[0] for W, _ in lag]
            modell = S.E1Nett(dims, 0.0).to(enhet)
            with torch.no_grad():
                for i, (W, b) in enumerate(lag):
                    modell.lag[i].weight.copy_(torch.from_numpy(W))
                    modell.lag[i].bias.copy_(torch.from_numpy(b))
            modell.eval()
            with torch.no_grad():
                tap, treff, anger = S.maal_i_biter(modell, Xk, Vg, Mg, a.tau, alle)
            navn = os.path.basename(n)
            linjer.append(
                f"{navn:<28}{mappe:<16}{Xk.shape[0]:>9}{tap:>10.4f}{100 * treff:>8.1f}%{anger:>10.4f}"
            )
            rader.append(
                {
                    "tid": time.strftime("%Y-%m-%dT%H:%M"),
                    "merk": a.merk,
                    "nett": navn,
                    "korpus": mappe,
                    "n": int(Xk.shape[0]),
                    "tap": round(tap, 5),
                    "treff": round(treff, 5),
                    "anger": round(anger, 5),
                }
            )
        del Xk, Vg, Mg
        if enhet == "cuda":
            torch.cuda.empty_cache()

    linjer.append("")
    linjer.append("ETT TALL HERFRA BESTEMMER INGENTING. Stiger angeren paa en FREMMED")
    linjer.append("mappe, kan det vaere kollaps - eller riktig uenighet med en svakere")
    linjer.append("fasit. Bare en MONOTON kurve over flere generasjoner skiller dem.")

    tekst = "\n".join(linjer)
    os.makedirs(os.path.dirname(a.ut) or ".", exist_ok=True)
    with open(a.ut, "w", encoding="utf8") as f:
        f.write(tekst + "\n")
    with open(a.jsonl, "a", encoding="utf8") as f:
        for r in rader:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(tekst)
    print(f"\n-> {a.ut} og {a.jsonl}")


if __name__ == "__main__":
    main()
