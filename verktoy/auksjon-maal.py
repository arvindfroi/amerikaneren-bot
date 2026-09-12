#!/usr/bin/env python3
"""BAERER AUKSJONSREKKA SIGNAL? K8 med og uten blokken, paa NOEYAKTIG de samme radene.

    bash /d/amb-k8/py-wsl.sh verktoy/auksjon-maal.py \
        --nett-a <996-nett> --hold-a <996-holdout> \
        --nett-b <1040-nett> --hold-b <1040-holdout> --skjult 512,384

Armene skal skille seg i ÉN ting. Derfor lages korpuset ÉN gang med `--auksjon` (1040),
og 996-armen er den SAMME fila kuttet til de 996 foerste trekkene: da er radene, kampene,
utvalget og fasiten bit for bit de samme, og det eneste som skiller er blokken. Prøven
her nekter aa maale hvis det ikke stemmer (`--hold-a` maa vaere prefikset av `--hold-b`).

Bruker trenerens EGNE funksjoner (`les_mlbt`, `Tronett`, `les_vekter`) ved import, saa
tapet ikke er en ny definisjon av K8: snittet som skrives ut MAA stemme med trenerens
«TRO-BOT-K8-BESTE» til fjerde desimal, og det er selvproeven paa at dette er samme tall.

SE-EN ER KLYNGET PAA KAMP (`fro`). Kortene i én stilling og stillingene i én kamp deler
kortfordelingen; en naiv SE over ~900 000 kortoppslag ville vaert flere ganger for liten
og gjort enhver forskjell «signifikant». Begge skrives ut, og klyngen er dommen.
"""
import argparse
import importlib.util
import math
import os

import numpy
import torch
import torch.nn.functional as F

_HER = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("trener", os.path.join(_HER, "mlb-tro-tren.py"))
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)


def tap_per_kort(nett_sti, hold, skjult, batch=4096):
    """(-log q) for hvert KORT som ligger paa en haand, i fast rekkefoelge, med kamp og rolle."""
    X, Fa, FRO, R = hold["X"], hold["F"], hold["FRO"], hold["ROLLE"]
    dim = hold["dim"]
    modell = T.Tronett([dim] + [int(x) for x in skjult.split(",")] + [T.KORT * T.KLASSER])
    T.les_vekter(nett_sti, modell)
    modell.eval()
    tap, kamp, rolle = [], [], []
    with torch.no_grad():
        for i in range(0, len(X), batch):
            x = torch.from_numpy(X[i : i + batch].astype(numpy.float32))
            mal = torch.from_numpy(Fa[i : i + batch].astype(numpy.int64))
            ut = modell(x)
            m3 = (mal > 0) & (mal <= 3)
            if not bool(m3.any()):
                continue
            t = (mal - 1).clamp(min=0, max=2)
            lp = F.log_softmax(ut[:, :, :3], dim=2)
            valgt = -lp.gather(2, t.unsqueeze(2)).squeeze(2)
            tap.append(valgt[m3].numpy())
            rad = numpy.arange(i, min(i + batch, len(X)))
            rr = numpy.repeat(rad[:, None], T.KORT, axis=1)[m3.numpy()]
            kamp.append(FRO[rr])
            rolle.append(R[rr])
    return numpy.concatenate(tap), numpy.concatenate(kamp), numpy.concatenate(rolle)


def klynge_se(verdier, kamp):
    """Snitt og SE der KAMPEN er klyngen (kortene i en kamp er ikke uavhengige)."""
    n = len(verdier)
    if n == 0:
        return float("nan"), float("nan"), 0
    snitt = float(verdier.mean())
    nokler, indeks = numpy.unique(kamp, return_inverse=True)
    g = len(nokler)
    sum_g = numpy.bincount(indeks, weights=verdier, minlength=g)
    n_g = numpy.bincount(indeks, minlength=g).astype(numpy.float64)
    rest = sum_g - snitt * n_g
    var = (g / max(1, g - 1)) * float((rest**2).sum()) / (n**2)
    return snitt, math.sqrt(max(0.0, var)), g


def naiv_se(v):
    return float(v.std(ddof=1) / math.sqrt(len(v))) if len(v) > 1 else float("nan")


def linje(navn, v, kamp):
    s, se, g = klynge_se(v, kamp)
    print(f"  {navn:28s} {s:.5f} ± {se:.5f} (klynge, {g} kamper)   ± {naiv_se(v):.5f} (naiv, {len(v)} kort)", flush=True)
    return s, se


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nett-a", required=True, help="uten auksjonsblokken (996)")
    ap.add_argument("--hold-a", required=True)
    ap.add_argument("--nett-b", required=True, help="med auksjonsblokken (1040)")
    ap.add_argument("--hold-b", required=True)
    ap.add_argument("--skjult", default="512,384")
    args = ap.parse_args()

    ha = T.les_mlbt(args.hold_a)
    hb = T.les_mlbt(args.hold_b)
    if len(ha["X"]) != len(hb["X"]):
        raise SystemExit("holdoutene har ulikt antall rader — da er de ikke de samme radene")
    if not numpy.array_equal(ha["F"], hb["F"]) or not numpy.array_equal(ha["FRO"], hb["FRO"]):
        raise SystemExit("holdoutene har ulik fasit eller ulike kamper — parvis sammenlikning er ugyldig")
    if not numpy.array_equal(ha["X"], hb["X"][:, : ha["dim"]]):
        raise SystemExit("de smale radene er ikke prefikset av de brede — armene ser ulike data")

    ta, kampa, rolla = tap_per_kort(args.nett_a, ha, args.skjult)
    tb, kampb, rollb = tap_per_kort(args.nett_b, hb, args.skjult)
    if len(ta) != len(tb) or not numpy.array_equal(kampa, kampb):
        raise SystemExit("ulik rekkefoelge paa kortene — parvis differanse er da meningsloes")

    print(f"HOLDOUT {len(ha['X'])} rader, {len(ta)} kortoppslag, {len(numpy.unique(kampa))} kamper", flush=True)
    print("K8-tap (lavere er bedre):", flush=True)
    linje("UTEN auksjon (996)", ta, kampa)
    linje("MED auksjon (1040)", tb, kampb)
    d = tb - ta
    s, se, _ = klynge_se(d, kampa)
    print(f"  {'PARVIS med − uten':28s} {s:+.5f} ± {se:.5f} (klynge)   ± {naiv_se(d):.5f} (naiv)", flush=True)
    print(f"  z (klynget) = {s / se if se > 0 else float('nan'):+.2f}", flush=True)

    print("Per rolle (budvinner, makker, motspiller):", flush=True)
    for r, navn in enumerate(T.ROLLER):
        m = rolla == r
        if not m.any():
            continue
        linje(f"{navn} uten", ta[m], kampa[m])
        linje(f"{navn} med", tb[m], kampa[m])
        s, se, _ = klynge_se(d[m], kampa[m])
        print(f"  {navn + ' PARVIS':28s} {s:+.5f} ± {se:.5f} (klynge)   z = {s / se if se > 0 else float('nan'):+.2f}", flush=True)


if __name__ == "__main__":
    main()
