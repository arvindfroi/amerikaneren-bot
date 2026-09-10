#!/usr/bin/env python3
"""SEIERSPREDIKTOREN: P(hvem vinner kampen | poengtavla foer runden, maalet).

Leser CSV fra `examples/seier-data.ts`, trener et lite MLP (9 -> 64 -> 64 -> 4,
softmax over de fire setene ROTERT slik at plass 0 er setet selv) og skriver
vektene i appens nettformat (`nettFraBytes` i `src/nevro/nett.ts`, EN del).
Brukes av `src/mlb/seier.ts` til aa gjoere rundepoeng om til endring i
vinnersjanse (Suphx' Global Reward Prediction).

    python verktoy/seier-tren.py --inn 'D:/amb-grp/rader-*.csv' --ut D:/amb-grp/seier-g0

Hvert tall i rapporten staar ved siden av en KONTROLL, ellers betyr det ingenting:

  * uniform          ln 4 = 1,3863 - det et nett som ikke har laert noe faar
  * rangtabell       P(seier | maal, egen rang) talt paa trening - det enkleste
                     som bruker tavla; prediktoren maa slaa den for aa vaere verdt noe
  * stokkede etiketter  samme nett, etikettene permutert: holdout MAA ende paa
                     ~ln 4. Gjoer den ikke det, lekker oppsettet (f.eks. samme kamp
                     i trening og holdout), og alle de andre tallene er ugyldige.

Holdout er splittet paa KAMP (`froe % 10 == 0`), aldri paa rad: radene i en kamp
deler vinner, og en radvis splitt ville maalt gjenkjenning av kampen.
"""
import argparse
import glob
import json
import os
import struct
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

SETER = 4
INN = 2 * SETER + 1
UT = SETER


def trekk(P, mal, sete):
    """SAMME formel som `seierTrekk` i `src/mlb/seier.ts` - regnet i float64, lagret i float32.

    `sete` er et heltall eller en vektor. Plass j er setet (sete + j) mod 4.
    """
    n = P.shape[0]
    idx = np.arange(n)
    sete = np.broadcast_to(np.asarray(sete), (n,))
    rot = np.stack([P[idx, (sete + j) % SETER] for j in range(SETER)], axis=1).astype(np.float64)
    m = mal.astype(np.float64)[:, None]
    avstand = np.clip((m - rot) / 100.0, -1.0, 3.0)
    andel = np.clip(rot / m, -3.0, 1.5)
    return np.concatenate([avstand, andel, m / 100.0], axis=1).astype(np.float32)


def les(mønster):
    filer = sorted({f for m in mønster.split(",") for f in glob.glob(m)})
    if not filer:
        raise SystemExit(f"ingen filer matcher {mønster}")
    d = np.concatenate([np.loadtxt(f, delimiter=",", skiprows=1, ndmin=2) for f in filer])
    return filer, d


def utvid(d):
    """Hver rundestart blir FIRE eksempler, ett per sete, med rotert etikett."""
    froe = d[:, 0].astype(np.int64)
    mal = d[:, 1]
    P = d[:, 3:7]
    vinner = d[:, 7].astype(np.int64)
    X, Y, K, EGEN_RANG, MAL = [], [], [], [], []
    for s in range(SETER):
        X.append(trekk(P, mal, s))
        Y.append((vinner - s) % SETER)
        K.append(froe)
        # rang 0 = hoeyest; likhet deles ut etter hvor mange som er STRENGT over
        EGEN_RANG.append((P > P[:, [s]]).sum(axis=1))
        MAL.append(mal.astype(np.int64))
    return (np.concatenate(X), np.concatenate(Y), np.concatenate(K),
            np.concatenate(EGEN_RANG), np.concatenate(MAL))


def lag_modell(skjult):
    lag = []
    forrige = INN
    for h in skjult:
        lag += [nn.Linear(forrige, h), nn.ReLU()]
        forrige = h
    lag.append(nn.Linear(forrige, UT))
    return nn.Sequential(*lag)


def ce(modell, X, Y, bs=65536):
    modell.eval()
    tot = 0.0
    with torch.no_grad():
        for i in range(0, len(X), bs):
            tot += float(F.cross_entropy(modell(X[i:i + bs]), Y[i:i + bs], reduction="sum"))
    return tot / len(X)


def tren(X, Y, Xh, Yh, skjult, epoker, lr, bs, frø):
    torch.manual_seed(frø)
    modell = lag_modell(skjult)
    opt = torch.optim.Adam(modell.parameters(), lr=lr)
    beste, beste_tilstand, historikk = float("inf"), None, []
    g = torch.Generator().manual_seed(frø)
    for e in range(epoker):
        modell.train()
        perm = torch.randperm(len(X), generator=g)
        for i in range(0, len(X), bs):
            j = perm[i:i + bs]
            tap = F.cross_entropy(modell(X[j]), Y[j])
            opt.zero_grad()
            tap.backward()
            opt.step()
        h = ce(modell, Xh, Yh)
        historikk.append(h)
        if h < beste:
            beste = h
            beste_tilstand = {k: v.clone() for k, v in modell.state_dict().items()}
    modell.load_state_dict(beste_tilstand)
    return modell, beste, historikk


def skriv_vekter(sti, modell):
    """Appens format: antall deler (1), antall lag, og per lag inn, ut, W (ut x inn radvis), b."""
    lin = [m for m in modell if isinstance(m, nn.Linear)]
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(lin)))
        for l in lin:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def les_prediktor(sti):
    """Leser en prediktor i appformatet tilbake til et MLP, for sammenlikning paa samme holdout."""
    with open(sti, "rb") as f:
        (deler,) = struct.unpack("<i", f.read(4))
        if deler != 1:
            raise SystemExit(f"{sti}: {deler} deler, ventet 1")
        (antall,) = struct.unpack("<i", f.read(4))
        vekter = []
        for _ in range(antall):
            inn, ut = struct.unpack("<ii", f.read(8))
            w = np.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn).copy()
            b = np.frombuffer(f.read(ut * 4), dtype="<f4").copy()
            vekter.append((inn, ut, w, b))
        if f.read(1):
            raise SystemExit(f"{sti}: det sto igjen byte etter siste lag")
    if vekter[0][0] != INN or vekter[-1][1] != UT:
        raise SystemExit(f"{sti}: {vekter[0][0]} inn / {vekter[-1][1]} ut, ventet {INN}/{UT}")
    modell = lag_modell([v[1] for v in vekter[:-1]])
    lin = [m for m in modell if isinstance(m, nn.Linear)]
    with torch.no_grad():
        for l, (inn, ut, w, b) in zip(lin, vekter):
            l.weight.copy_(torch.from_numpy(w))
            l.bias.copy_(torch.from_numpy(b))
    modell.eval()
    return modell


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inn", required=True)
    ap.add_argument("--ut", required=True, help="prefiks: <ut>.bin, <ut>.txt, <ut>-ref.json")
    ap.add_argument("--skjult", default="64,64")
    ap.add_argument("--epoker", type=int, default=30)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--batch", type=int, default=8192)
    ap.add_argument("--froe", type=int, default=20260910)
    ap.add_argument("--traader", type=int, default=4)
    # R2: den gamle prediktoren maales paa SAMME holdout, saa driveren kan godta eller forkaste.
    ap.add_argument("--sammenlikn", default="", help="gammel prediktor (appformat)")
    args = ap.parse_args()
    torch.set_num_threads(args.traader)
    t0 = time.time()
    skjult = [int(x) for x in args.skjult.split(",") if x]

    filer, d = les(args.inn)
    X, Y, K, RANG, MAL = utvid(d)
    hold = (K % 10) == 0
    kamper = len(np.unique(d[:, 0]))
    kamper_hold = len(np.unique(d[(d[:, 0].astype(np.int64) % 10) == 0, 0]))

    Xt, Yt = torch.from_numpy(X[~hold]), torch.from_numpy(Y[~hold])
    Xh, Yh = torch.from_numpy(X[hold]), torch.from_numpy(Y[hold])
    ut = []

    def say(s):
        print(s, flush=True)
        ut.append(s)

    say(f"SEIERSPREDIKTOR {time.strftime('%Y-%m-%d %H:%M:%S')}  filer={len(filer)} ({args.inn})")
    say(f"kamper={kamper} (holdout {kamper_hold})  rundestarter={len(d)}  eksempler={len(X)} "
        f"(trening {int((~hold).sum())}, holdout {int(hold.sum())})")
    for m in sorted(set(MAL.tolist())):
        sel = d[:, 1] == m
        say(f"  maal {m}: {len(np.unique(d[sel, 0]))} kamper, snitt {sel.sum() / max(1, len(np.unique(d[sel, 0]))):.1f} runder, "
            f"avbrutt {d[sel, 8].mean() * 100:.2f} % av rundestartene")

    # --- kontroll 1: uniform
    say(f"KONTROLL uniform:          CE {np.log(4):.4f}")

    # --- kontroll 2: rangtabell, binaert tap paa EGET sete (plass 0)
    egen_h = (Y[hold] == 0).astype(np.float64)
    tabell = {}
    for m in sorted(set(MAL.tolist())):
        for r in range(SETER):
            sel = (~hold) & (MAL == m) & (RANG == r)
            tabell[(m, r)] = float((Y[sel] == 0).mean()) if sel.any() else 0.25
    p_tab = np.array([tabell[(m, r)] for m, r in zip(MAL[hold], RANG[hold])]).clip(1e-6, 1 - 1e-6)
    bin_tab = float(-(egen_h * np.log(p_tab) + (1 - egen_h) * np.log(1 - p_tab)).mean())
    bin_konst = float(-(egen_h * np.log(0.25) + (1 - egen_h) * np.log(0.75)).mean())
    say(f"KONTROLL konstant 0,25:    binaert tap eget sete {bin_konst:.4f}")
    say(f"KONTROLL rangtabell:       binaert tap eget sete {bin_tab:.4f}")

    # --- kontroll 3: stokkede etiketter (samme nett, kortere)
    rng = np.random.default_rng(args.froe)
    Ys = torch.from_numpy(rng.permutation(Y[~hold]))
    _, ce_stokk, _ = tren(Xt, Ys, Xh, Yh, skjult, max(3, args.epoker // 6), args.lr, args.batch, args.froe + 1)
    say(f"KONTROLL stokkede etiketter: holdout CE {ce_stokk:.4f}  (maa vaere ~{np.log(4):.4f}; "
        f"{'OK' if ce_stokk > np.log(4) - 0.005 else 'LEKKER - tallene under er ugyldige'})")

    # --- selve prediktoren
    modell, ce_h, hist = tren(Xt, Yt, Xh, Yh, skjult, args.epoker, args.lr, args.batch, args.froe)
    say(f"PREDIKTOR {INN}->{'->'.join(map(str, skjult))}->{UT}: holdout CE {ce_h:.4f} "
        f"(beste av {args.epoker} epoker; kurve {' '.join(f'{x:.4f}' for x in hist[::max(1, len(hist) // 10)])})")
    modell.eval()
    with torch.no_grad():
        pr = torch.softmax(modell(Xh), dim=1).numpy()
    p_egen = pr[:, 0].clip(1e-6, 1 - 1e-6)
    bin_mod = float(-(egen_h * np.log(p_egen) + (1 - egen_h) * np.log(1 - p_egen)).mean())
    say(f"PREDIKTOR binaert tap eget sete {bin_mod:.4f}  (rangtabell {bin_tab:.4f}, konstant {bin_konst:.4f})")
    if args.sammenlikn:
        gammel = les_prediktor(args.sammenlikn)
        ce_gammel = ce(gammel, Xh, Yh)
        say(f"SAMMENLIKNET med {args.sammenlikn} paa samme holdout: CE gammel {ce_gammel:.4f}, ny {ce_h:.4f}")
        print(json.dumps({"seier_foer": ce_gammel, "seier_etter": ce_h}), flush=True)
    say(f"PREDIKTOR argmaks treffer vinneren: {(pr.argmax(1) == Y[hold]).mean() * 100:.1f} %")

    say("KALIBRERING eget sete (holdout): anslag -> faktisk (n)")
    kanter = np.linspace(0, 1, 11)
    for a, b in zip(kanter[:-1], kanter[1:]):
        sel = (p_egen >= a) & (p_egen < b if b < 1 else p_egen <= b)
        if sel.sum() > 0:
            say(f"  [{a:.1f},{b:.1f}) {p_egen[sel].mean():.3f} -> {egen_h[sel].mean():.3f}  (n={int(sel.sum())})")
    for m in sorted(set(MAL.tolist())):
        start = trekk(np.zeros((1, 4)), np.array([m]), 0)
        with torch.no_grad():
            p0 = torch.softmax(modell(torch.from_numpy(start)), dim=1).numpy()[0]
        say(f"  tom tavla, maal {m}: P = {' '.join(f'{x:.3f}' for x in p0)}")

    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    skriv_vekter(args.ut + ".bin", modell)

    # REFERANSEN for TS-pariteten: 64 holdout-tavler, med nettets fordeling.
    idx = np.flatnonzero((d[:, 0].astype(np.int64) % 10) == 0)[:64]
    ref = []
    for i in idx:
        s = int(d[i, 2]) % SETER  # varier setet
        x = trekk(d[i:i + 1, 3:7], d[i:i + 1, 1], s)
        with torch.no_grad():
            p = torch.softmax(modell(torch.from_numpy(x)), dim=1).numpy()[0]
        ref.append({"poeng": [float(v) for v in d[i, 3:7]], "sete": s, "maal": float(d[i, 1]),
                    "trekk": [float(v) for v in x[0]], "p": [float(v) for v in p]})
    with open(args.ut + "-ref.json", "w") as f:
        json.dump(ref, f)

    say(f"skrevet {args.ut}.bin og {args.ut}-ref.json  ({time.time() - t0:.0f} s)")
    with open(args.ut + ".txt", "w") as f:
        f.write("\n".join(ut) + "\n")


if __name__ == "__main__":
    main()
