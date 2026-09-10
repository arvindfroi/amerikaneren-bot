#!/usr/bin/env python3
"""
HVOR LIGGER TAKET FOR VERDIHODET — i representasjonen, eller i optimeringen?

    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-verdi-tak.py \
        --inn "analyse/roeyk125/erf-s*.bin" \
        --vekter e1-modell/g05/mlb-arbeid.bin \
        --ut analyse/mlb-verdi-tak.txt

============================ HVORFOR DENNE FILA FINNES ==================

§125 froes stammen naar KL-bremsen fyrer, slik at verdi- og trohodet kan trene
videre. Etter 2 400 gradientsteg paa den FROSNE stammen forklarte rundehodet
+0,011 i utvalget og -0,023 paa holdout. To helt ulike ting kan forklare det:

  OPTIMERING       hodet KUNNE naadd taket, men 2 400 Adam-steg med et globalt
                   gradientklipp og et tap delt paa skala^2 rakk ikke fram.
  REPRESENTASJON   stammen, formet av policyen, koder rett og slett ikke
                   rundens gjenstaaende poeng lineaert. Da hjelper ingen
                   mengde steg, og stammen MAA faa trene.

Forskjellen avgjoer hva neste steg er, og den kan ikke leses av en tapskurve.
Den kan leses av en LUKKET LOESNING: regularisert ridge er det beste en lineaer
modell kan gjoere paa de trekkene, uten et eneste optimeringsvalg.

    w = (X'X + aI)^-1 X'y

Tre underlag maales mot hverandre, alle med holdout splittet paa KAMP:

  1032 raa trekk      §124s tall. Kontrollen: reproduseres +0,60 paa
                      rundemaalet, maaler denne fila det samme som §124 gjorde.
   512 stammens ut    NOEYAKTIG det verdihodet ser. Taket for ETHVERT lineaert
                      hode over den frosne stammen.

Er de to like, ligger taket i optimeringen. Er stammens tall langt lavere,
ligger det i representasjonen, og frysen har en pris som maa betales et annet
sted.
"""

import argparse
import glob
import importlib.util
import os
import struct
import time

import numpy
import torch

HER = os.path.dirname(os.path.abspath(__file__))


def _last(navn):
    sti = os.path.join(HER, navn)
    spec = importlib.util.spec_from_file_location(navn.replace("-", "_")[:-3], sti)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


GRAD = _last("mlb-gradient.py")
MLBT = _last("mlb-tren.py")


def les(monster, maks):
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen erfaringsfiler for «{monster}»")
    deler, dim, mdim, versjon = [], None, None, None
    n = 0
    for sti in filer:
        with open(sti, "rb") as fh:
            if fh.read(4) != b"MLBE":
                raise SystemExit(f"{sti}: ikke en MLBE-fil")
            (v,) = struct.unpack("<i", fh.read(4))
            (d,) = struct.unpack("<i", fh.read(4))
            (md,) = struct.unpack("<i", fh.read(4))
            (post,) = struct.unpack("<i", fh.read(4))
            if v >= 4:
                # Versjon 4 har maalkoden bakerst i hodet (0 poeng, 1 seier) - se
                # `les_erfaring` i mlb-gradient.py. Taket maales paa det maalet fila har.
                (maal,) = struct.unpack("<i", fh.read(4))
                print(f"{sti}: maal {'SEIER' if maal == 1 else 'POENG'}", flush=True)
            if v < 2:
                raise SystemExit(
                    f"{sti}: versjon {v}. Det delte maalet og kampnummeret finnes ikke "
                    f"foer versjon 2 - og uten kampnummer kan holdout bare splittes paa RAD."
                )
            dim, mdim, versjon = d, md, v
            dt = GRAD.post_dtype(d, md, v)
            if dt.itemsize != post:
                raise SystemExit(f"{sti}: hodet sier {post} byte/rad, leseren regner {dt.itemsize}")
            a = numpy.fromfile(fh, dtype=dt)
        if maks and n + len(a) > maks:
            a = a[: max(0, maks - n)]
        deler.append(a)
        n += len(a)
        if maks and n >= maks:
            break
    return numpy.concatenate(deler), dim


def ridge_r2(Xtr, ytr, Xte, yte, alfa):
    """Lukket loesning, med KONSTANTLEDD. Uten det maales ogsaa snittfeilen som
    om den var uforklart varians, og tallet blir kunstig lavt."""
    xm = Xtr.mean(0, keepdim=True)
    ym = ytr.mean()
    A = Xtr - xm
    b = ytr - ym
    d = A.shape[1]
    G = A.T @ A + alfa * torch.eye(d, device=A.device, dtype=A.dtype)
    w = torch.linalg.solve(G, A.T @ b)
    p = (Xte - xm) @ w + ym
    return float(1.0 - ((p - yte) ** 2).mean() / yte.var(unbiased=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inn", required=True)
    ap.add_argument("--vekter", required=True)
    ap.add_argument("--skjult", default="1024,768,512")
    ap.add_argument("--maks-rader", type=int, default=400000)
    ap.add_argument("--holdout-del", type=int, default=10)
    ap.add_argument("--alfa", default="1,10,100,1000,10000")
    ap.add_argument("--ut", default="analyse/mlb-verdi-tak.txt")
    a = ap.parse_args()

    t0 = time.time()
    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    rad, dim = les(a.inn, a.maks_rader)
    n = len(rad)

    X = torch.from_numpy(numpy.ascontiguousarray(rad["t"])).to(enhet).double()
    maal = {
        "G  (resten av kampen, diskontert)": rad["G"],
        "Gr (denne rundens gjenstaaende)": rad["Gr"],
        "Gh (den diskonterte halen)": rad["Gh"],
    }
    er_hold = (numpy.abs(rad["kamp"]) % a.holdout_del) == 0
    tr = torch.from_numpy(numpy.nonzero(~er_hold)[0].astype("<i8")).to(enhet)
    te = torch.from_numpy(numpy.nonzero(er_hold)[0].astype("<i8")).to(enhet)

    modell = MLBT.Sandkassenett(dim, [int(x) for x in a.skjult.split(",")]).to(enhet)
    MLBT.les_vekter(a.vekter, modell)
    modell.eval()
    with torch.no_grad():
        H = torch.cat(
            [modell.underlag(X[i : i + 4096].float()).double() for i in range(0, n, 4096)]
        )

    os.makedirs(os.path.dirname(a.ut) or ".", exist_ok=True)
    with open(a.ut, "a", encoding="utf-8") as f:
        f.write(
            f"\n=== {time.strftime('%Y-%m-%d %H:%M')} vekter={a.vekter} inn={a.inn}\n"
            f"{n} rader ({len(tr)} tren / {len(te)} holdout paa KAMP, 1 av {a.holdout_del}), "
            f"stammen gir {H.shape[1]} ut\n"
        )
        for navn, y in maal.items():
            yt = torch.from_numpy(numpy.ascontiguousarray(y)).to(enhet).double()
            linje = [f"  {navn:36s} sd={float(yt.std(unbiased=False)):6.2f}"]
            for merke, M in (("1032 raa", X), (f"{H.shape[1]} stamme", H)):
                best = max(
                    ridge_r2(M[tr], yt[tr], M[te], yt[te], float(al))
                    for al in a.alfa.split(",")
                )
                linje.append(f"{merke}: {best:+.4f}")
            f.write("  ".join(linje) + "\n")
        f.write(f"  ({time.time() - t0:.0f}s)\n")
    print(open(a.ut, encoding="utf-8").read()[-1200:], flush=True)


if __name__ == "__main__":
    main()
