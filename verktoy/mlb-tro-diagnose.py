#!/usr/bin/env python3
"""
HVA LAERTE TROHODET? Diagnosen, ikke bare skaaren.

    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-tro-diagnose.py \
        --nett e1-modell/mlb-tro.bin --hold "mlb-tro-data/holdout-*.bin" \
        --rapport analyse/mlb-tro-diagnose.txt

Et samlet tap sier at nettet er bedre. Det sier ikke HVA det er bedre paa, og
uten det er funnet en skaar og ikke en forklaring.

============================ ARVINDS EGEN KJEDE =========================

Arvind, 4. august (`examples/tro-data.ts`):

  «jeg tipper budvinneren hiv de lave kortene i vrak fordi det egnet han best og
   det hadde ikke vaert bra for han aa hive en ess. dermed tror jeg john doe har
   hjerter ess.»

Det er en paastand om TALONGKLASSEN, og den er etterproevbar: P(doed | kort)
skal falle med kortets verdi. Faller den i FASITEN men ikke i MODELLEN, har
nettet ikke laert kjeden. Faller den i begge, har det laert den - av aa se hvor
kortene laa, uten at noen fortalte det.

Rapporten skrives av prosessen selv, aldri gjennom et stdout-roer.
"""

import argparse
import glob
import os
import struct
import time

import numpy
import torch

KORT = 52
KLASSER = 4
VERDINAVN = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "D", "K", "E"]


def les_vekter(sti):
    """Appens binaerformat: antall nett, lag, saa per lag inn/ut/vekter/bias."""
    with open(sti, "rb") as f:
        b = f.read()
    p = 0

    def i32():
        nonlocal p
        (v,) = struct.unpack_from("<i", b, p)
        p += 4
        return v

    if i32() != 1:
        raise SystemExit(f"{sti}: forventet ett nett")
    lag = []
    for _ in range(i32()):
        inn, ut = i32(), i32()
        w = numpy.frombuffer(b, dtype="<f4", count=inn * ut, offset=p).reshape(ut, inn).copy()
        p += inn * ut * 4
        bi = numpy.frombuffer(b, dtype="<f4", count=ut, offset=p).copy()
        p += ut * 4
        lag.append((torch.from_numpy(w), torch.from_numpy(bi)))
    if p != len(b):
        raise SystemExit(f"{sti}: leste {p} av {len(b)} byte")
    return lag


def framover(lag, x):
    for i, (w, bi) in enumerate(lag):
        x = x @ w.T + bi
        if i < len(lag) - 1:
            x = torch.relu(x)
    return x.view(-1, KORT, KLASSER)


def les_bin(monster):
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen filer for «{monster}»")
    Xs, Fs = [], []
    dim = None
    for sti in filer:
        with open(sti, "rb") as fh:
            if fh.read(4) != b"MLBT":
                raise SystemExit(f"{sti}: ikke en MLBT-fil")
            struct.unpack("<i", fh.read(4))
            (d,) = struct.unpack("<i", fh.read(4))
            if dim is None:
                dim = d
            elif d != dim:
                raise SystemExit(f"{sti}: dim {d}, ventet {dim}")
            dt = numpy.dtype(
                [("t", "<f4", (dim,)), ("f", "i1", (KORT,)), ("fro", "<i4"),
                 ("stikk", "<i2"), ("sete", "<i2")]
            )
            a = numpy.fromfile(fh, dtype=dt)
        Xs.append(a["t"].astype(numpy.float16))
        Fs.append(a["f"])
        del a
    return numpy.concatenate(Xs), numpy.concatenate(Fs), dim


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nett", default="e1-modell/mlb-tro.bin")
    ap.add_argument("--hold", default="mlb-tro-data/holdout-*.bin")
    ap.add_argument("--rapport", default="analyse/mlb-tro-diagnose.txt")
    ap.add_argument("--batch", type=int, default=4096)
    args = ap.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    lag = [(w.to(enhet), b.to(enhet)) for w, b in les_vekter(args.nett)]
    X, Fa, dim = les_bin(args.hold)
    if lag[0][0].shape[1] != dim:
        raise SystemExit(f"nettet tar {lag[0][0].shape[1]} trekk, data har {dim}")

    Xt = torch.from_numpy(X).to(enhet)
    Ft = torch.from_numpy(Fa).to(enhet).long()
    rang = (torch.arange(KORT, device=enhet) % 13).unsqueeze(0)

    forv = torch.zeros(4, 4, dtype=torch.long, device=enhet)
    p_doed_sum = torch.zeros(13, dtype=torch.float64, device=enhet)
    p_doed_ant = torch.zeros(13, dtype=torch.long, device=enhet)
    fasit_doed = torch.zeros(13, dtype=torch.long, device=enhet)
    fasit_ant = torch.zeros(13, dtype=torch.long, device=enhet)
    with torch.no_grad():
        for i in range(0, len(Xt), args.batch):
            x = Xt[i : i + args.batch].float()
            mal = Ft[i : i + args.batch]
            pr = torch.softmax(framover(lag, x), dim=2)
            maske = mal > 0
            gjett = pr.argmax(dim=2)
            t = (mal - 1).clamp(min=0)
            for a in range(4):
                for b in range(4):
                    forv[a, b] += int(((t == a) & (gjett == b) & maske).sum())
            r = rang.expand_as(mal)
            pd = pr[:, :, 3]
            p_doed_sum.index_add_(0, r[maske], pd[maske].double())
            p_doed_ant.index_add_(0, r[maske], torch.ones_like(r[maske]))
            md = maske & (mal == 4)
            fasit_doed.index_add_(0, r[md], torch.ones_like(r[md]))
            fasit_ant.index_add_(0, r[maske], torch.ones_like(r[maske]))

    F = forv.cpu().numpy()
    navn = ["rel sete 1", "rel sete 2", "rel sete 3", "TALONG"]
    linjer = []
    p = linjer.append
    p(f"=== MLB fase 0a: hva laerte trohodet? ({time.strftime('%Y-%m-%d %H:%M')}) ===")
    p(f"nett {args.nett}   holdout {args.hold}   {len(X)} stillinger, {int(F.sum())} usette kort")
    p("")
    p("FORVIRRINGSMATRISE (rad = fasit, kolonne = argmaks)")
    p("  fasit \\ gjett " + "".join(n.rjust(12) for n in navn) + "     recall")
    for a in range(4):
        rad = "".join(str(F[a, b]).rjust(12) for b in range(4))
        rec = F[a, a] / max(1, F[a].sum())
        p(f"  {navn[a]:<14}{rad}    {rec * 100:6.2f} %")
    p("  " + "-" * 74)
    for b in range(4):
        prec = F[b, b] / max(1, F[:, b].sum())
        p(f"  presisjon {navn[b]:<12} {prec * 100:6.2f} %")
    p("")
    p("ARVINDS KJEDE: faller P(doed) med kortets verdi - i fasiten OG i modellen?")
    p("  kort        n     fasit P(doed)    modell P(doed)")
    pd = (p_doed_sum / p_doed_ant.clamp(min=1)).cpu().numpy()
    fd = (fasit_doed / fasit_ant.clamp(min=1)).cpu().numpy()
    ant = fasit_ant.cpu().numpy()
    for v in range(13):
        p(f"  {VERDINAVN[v]:>4} {ant[v]:>10}      {fd[v] * 100:8.2f} %       {pd[v] * 100:8.2f} %")
    p("")
    p("  Faller begge kolonnene fra 2 mot E, har nettet laert kjeden av aa se hvor")
    p("  kortene laa - ingen fortalte det. Faller bare den foerste, har det ikke.")

    os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
    with open(args.rapport, "a", encoding="utf-8") as f:
        f.write("\n".join(linjer) + "\n")
    print("\n".join(linjer))
    print(f"\nRapport lagt til {args.rapport}", flush=True)


if __name__ == "__main__":
    main()
