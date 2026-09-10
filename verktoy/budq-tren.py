#!/usr/bin/env python3
"""
BUDQ — TRENER Q(stilling, bud) PAA UTSPILLINGSETIKETTENE (K3.1, K3.2). 11. sep.

    ~/Arvind-Lora/.venv/bin/python verktoy/budq-tren.py \
        --data "/mnt/d/amb-grp/budq/d0/s*.jsonl" --ut /mnt/d/amb-grp/budq/budq-v1.bin

Radene kommer fra `examples/budq-data.ts`: trekk (143), og for hvert lovlige bud K
utspillingsverdier fra verdener trukket fra setets visning. Maalet per (rad, bud) er
snittet over verdenene; maska sier hvilke bud som var lovlige.

HVA SOM MAALES PAA HOLDOUT (hele kamper, hash av froeet):

  MSE        paa de lovlige budene.
  GEVINST    snittet av  q[argmax nett] - q[policyens bud]  paa holdoutradenes EGNE
             etiketter. Valget tas av nettet (trent paa andre kamper), verdien leses av
             uavhengige utspillinger - ingen seleksjon paa stoey i tallet.
  TAK        snittet av  max q - q[policy]: hva en perfekt velger ville hentet PAA DISSE
             etikettene. Stoeyen blaaser det opp; det er en oevre grense, ikke et maal.

Beste epoke velges paa GEVINST. Vektene skrives i appformatet (`src/nevro/nett.ts`).
"""

import argparse
import glob
import json
import os
import struct

import numpy
import torch
import torch.nn as nn

BUD = ["PASS", "5", "6", "7", "8", "9", "10", "11", "12", "AMERIKANER", "SOLO"]
INDEKS = {b: i for i, b in enumerate(BUD)}


def les(monster):
    X, T, M, P, FRO = [], [], [], [], []
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Ingen filer for «{monster}»")
    for sti in filer:
        with open(sti, encoding="utf-8") as fh:
            for linje in fh:
                linje = linje.strip()
                if not linje:
                    continue
                try:
                    r = json.loads(linje)
                except json.JSONDecodeError:
                    continue  # siste linje kan vaere halvskrevet
                t = numpy.zeros(len(BUD), dtype=numpy.float32)
                m = numpy.zeros(len(BUD), dtype=numpy.float32)
                for b, verdier in r["q"].items():
                    if b in INDEKS and verdier:
                        t[INDEKS[b]] = float(numpy.mean(verdier))
                        m[INDEKS[b]] = 1.0
                if m.sum() < 2:
                    continue
                X.append(numpy.asarray(r["x"], dtype=numpy.float32))
                T.append(t)
                M.append(m)
                P.append(INDEKS.get(str(r.get("policy")), -1))
                FRO.append(int(r["frø"]))
    return numpy.stack(X), numpy.stack(T), numpy.stack(M), numpy.asarray(P), numpy.asarray(FRO, dtype=numpy.int64), len(filer)


def skriv_vekter(sti, lag):
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(lag)))
        for l in lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--ut", required=True)
    ap.add_argument("--skjult", default="256,256")
    ap.add_argument("--epoker", type=int, default=60)
    ap.add_argument("--skala", type=float, default=10.0, help="maalene deles paa dette foer trening")
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--vektforfall", type=float, default=1e-4)
    ap.add_argument("--batch", type=int, default=2048)
    ap.add_argument("--hold-del", type=int, default=10)
    ap.add_argument("--froe", type=int, default=20260911)
    ap.add_argument("--rapport", default="")
    a = ap.parse_args()

    X, T, M, P, FRO, nfiler = les(a.data)
    h = (FRO.astype(numpy.uint64) * numpy.uint64(2654435761)) % numpy.uint64(4294967296)
    hold = (h % numpy.uint64(a.hold_del)) == 0
    print(f"{len(X)} budstillinger fra {nfiler} filer, {int(hold.sum())} paa holdout, "
          f"{int((~hold).sum())} i trening, {X.shape[1]} trekk", flush=True)

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(a.froe)
    dims = [X.shape[1]] + [int(x) for x in a.skjult.split(",")] + [len(BUD)]
    lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)]).to(enhet)

    def fram(x):
        for i, l in enumerate(lag):
            x = l(x)
            if i < len(lag) - 1:
                x = torch.relu(x)
        return x

    til = lambda z: torch.from_numpy(z).to(enhet)
    # PARVIS MAAL: alle budene i en rad deler de SAMME verdenene, saa radens felles nivaa
    # («hvor god var haanden») er stoey for valget. Trekkes det lovlige snittet fra, blir
    # maalet budets FORDEL - argmax er uendret, variansen langt lavere.
    snittlovlig = (T * M).sum(axis=1, keepdims=True) / numpy.maximum(1.0, M.sum(axis=1, keepdims=True))
    A = ((T - snittlovlig) * M / a.skala).astype(numpy.float32)
    Xt, Tt, Mt = til(X[~hold]), til(A[~hold]), til(M[~hold])
    Xh, Th, Mh, Ph = til(X[hold]), til(T[hold]), til(M[hold]), P[hold]
    opt = torch.optim.AdamW(lag.parameters(), lr=a.lr, weight_decay=a.vektforfall)

    @torch.no_grad()
    def maal():
        ut = fram(Xh)
        Ah = til(A[hold])
        mse = float((((ut - Ah) ** 2) * Mh).sum() / Mh.sum())
        maskert = ut.masked_fill(Mh == 0, -1e9)
        valg = maskert.argmax(dim=1)
        q_valg = Th.gather(1, valg.unsqueeze(1)).squeeze(1).cpu().numpy()
        gyldig = Ph >= 0
        q_pol = Th.cpu().numpy()[numpy.arange(len(Ph)), numpy.maximum(Ph, 0)]
        tak = Th.masked_fill(Mh == 0, -1e9).max(dim=1).values.cpu().numpy()
        d = (q_valg - q_pol)[gyldig]
        se = float(d.std(ddof=1) / numpy.sqrt(max(1, len(d)))) if len(d) > 1 else float("nan")
        enig = float((valg.cpu().numpy() == Ph)[gyldig].mean())
        fordeling = numpy.bincount(valg.cpu().numpy(), minlength=len(BUD)) / len(valg)
        return mse, float(d.mean()), se, float((tak - q_pol)[gyldig].mean()), enig, fordeling

    mse0, g0, se0, tak0, enig0, _ = maal()
    print(f"start: mse {mse0:.3f}  gevinst {g0:+.3f} ± {se0:.3f}  tak {tak0:+.3f}", flush=True)
    beste = -1e9
    beste_rad = None
    n = len(Xt)
    for e in range(a.epoker):
        perm = torch.randperm(n, device=enhet)
        sum_tap = 0.0
        for i in range(0, n, a.batch):
            j = perm[i : i + a.batch]
            ut = fram(Xt[j])
            tap = (((ut - Tt[j]) ** 2) * Mt[j]).sum() / Mt[j].sum()
            opt.zero_grad(set_to_none=True)
            tap.backward()
            opt.step()
            sum_tap += tap.item() * len(j)
        mse, g, se, tak, enig, ford = maal()
        print(f"epoke {e + 1}/{a.epoker}: tren {sum_tap / n:.3f}  hold mse {mse:.3f}  "
              f"gevinst {g:+.3f} ± {se:.3f}  tak {tak:+.3f}  enig m/policy {enig * 100:.1f} %", flush=True)
        if g > beste:
            beste = g
            beste_rad = (e + 1, mse, g, se, tak, enig, ford)
            skriv_vekter(a.ut, lag)

    e, mse, g, se, tak, enig, ford = beste_rad
    tekst = (
        f"BUDQ {a.data}: {len(X)} stillinger, holdout {int(hold.sum())}. Beste epoke {e}: mse {mse:.3f}, "
        f"gevinst mot policy {g:+.3f} ± {se:.3f} poeng/budbeslutning (tak {tak:+.3f}), enig {enig * 100:.1f} %.\n"
        f"Valgfordeling paa holdout: " + ", ".join(f"{b} {p * 100:.1f} %" for b, p in zip(BUD, ford)) + "\n"
        f"vekter -> {a.ut}\n"
    )
    print(tekst, flush=True)
    if a.rapport:
        with open(a.rapport, "a", encoding="utf-8") as f:
            f.write(tekst)
    print(json.dumps({"budq": {"epoke": e, "mse": mse, "gevinst": g, "se": se, "tak": tak, "enig": enig}}), flush=True)


if __name__ == "__main__":
    main()
