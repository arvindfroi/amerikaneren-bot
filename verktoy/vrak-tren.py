#!/usr/bin/env python3
"""
TRENER RANGERINGSMODELLEN FOR (TRUMF, VRAK) — uten søk ved spilletid.

    ~/Arvind-Lora/.venv/bin/python verktoy/vrak-tren.py \
        --data vrak-data --ut e1-modell/vrakrang.bin --epoker 60

HVORFOR RANGERING OG IKKE REGRESJON. Valget krever bare å vite hvilken kandidat
som er best i DENNE stillingen, ikke hva den er verdt i absolutte poeng. En
regresjon mot verdien bruker kapasitet på å lære at «denne giva var god for
alle kandidatene» – en fellesfaktor som er irrelevant for valget og som
dominerer variansen.

Derfor er tapet en myk kryssentropi INNENFOR hver stilling, mot
`softmax(verdi/tau)` over kandidatene der. Fellesfaktoren forsvinner ved
konstruksjon, akkurat som verden-effekten kanselleres i den parrede
evalueringen som lagde etikettene.

HOLDOUT DELES PÅ GIV, ikke på stilling – samme regel som `sd-tren.py`, og av
samme grunn: to kandidater fra samme stilling deler hele giva, så en
stillingsdeling ville lekket.

FORMATET er appens vektformat (`skriv_vekter`), så TypeScript-siden kan lese
modellen med samme loader som kortnettet. Utgangen er ÉN skalar per kandidat.
"""

import argparse
import glob
import json
import os
import struct

import numpy
import torch
import torch.nn as nn
import torch.nn.functional as F

VRAK_DIM = 24


class Rangnett(nn.Module):
    """MLP med ÉN utgang: poengsummen for én kandidat."""

    def __init__(self, dims):
        super().__init__()
        self.lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])

    def forward(self, x):
        for i, l in enumerate(self.lag):
            x = l(x)
            if i < len(self.lag) - 1:
                x = F.relu(x)
        return x.squeeze(-1)


def skriv_vekter(sti, modell):
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def les_vekter(sti):
    """Appformatet (`skriv_vekter`) tilbake til [(W, b)], radvis W (ut x inn)."""
    with open(sti, "rb") as f:
        data = f.read()
    _, n = struct.unpack_from("<ii", data, 0)
    o = 8
    lag = []
    for _ in range(n):
        inn, ut = struct.unpack_from("<ii", data, o)
        o += 8
        w = numpy.frombuffer(data, dtype="<f4", count=inn * ut, offset=o).reshape(ut, inn).copy()
        o += 4 * inn * ut  # offset er i BYTES, float32 er fire
        b = numpy.frombuffer(data, dtype="<f4", count=ut, offset=o).copy()
        o += 4 * ut
        lag.append((w, b))
    return lag


def les(mapper, dim=VRAK_DIM):
    """→ (X, gruppe, verdi, frø, erNevro). `gruppe` sier hvilken stilling raden hører til."""
    X, G, V, FRO, NEV = [], [], [], [], []
    g = 0
    for mappe in mapper:
        for sti in sorted(glob.glob(os.path.join(mappe, "*.jsonl"))):
            with open(sti, encoding="utf-8") as f:
                for linje in f:
                    try:
                        r = json.loads(linje)
                    except Exception:
                        continue
                    kand = r.get("kand") or []
                    # Én kandidat gir ingen rangering å lære av.
                    if len(kand) < 2:
                        continue
                    for k in kand:
                        t = k.get("t")
                        if not t or len(t) != dim:
                            continue
                        X.append(t)
                        G.append(g)
                        V.append(k["v"])
                        FRO.append(r.get("frø", 0))
                        NEV.append(1 if k.get("nevro") else 0)
                    g += 1
    return (
        numpy.array(X, dtype=numpy.float32),
        numpy.array(G, dtype=numpy.int64),
        numpy.array(V, dtype=numpy.float32),
        numpy.array(FRO, dtype=numpy.int64),
        numpy.array(NEV, dtype=numpy.int64),
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="vrak-data")
    p.add_argument("--ut", default="e1-modell/vrakrang.bin")
    p.add_argument("--skjult", default="64,32")
    p.add_argument("--epoker", type=int, default=60)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--tau", type=float, default=3.0)
    p.add_argument("--holdoutandel", type=float, default=0.1)
    p.add_argument("--froe", type=int, default=11)
    p.add_argument("--logg", default="analyse/vrak-tren.jsonl")
    # VrakQ v2 (11. sep): 27 = de 24 trekkene + kampstillingen (egne/beste andres poeng, runde).
    p.add_argument("--dim", type=int, default=VRAK_DIM, choices=[24, 27])
    # VRAKQ (11. sep): runde 1 trent fra null slo ikke vrakrangereren som er ute (anger 2,15 mot 2,05).
    # Start fra de vektene i stedet: nettet begynner DER, og flytter seg bare der dataene sier noe.
    # Et 24-nett til --dim 27 utvides med nullkolonner (kampstillingen starter uten virkning).
    p.add_argument("--vekter", default="", help="start fra disse vektene (appformat); tom = tilfeldig")
    args = p.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    X, G, V, FRO, NEV = les([m for m in args.data.split(",") if m], args.dim)
    if len(X) == 0:
        raise SystemExit(f"Ingen brukbare rader i {args.data}")
    ant_grupper = int(G.max()) + 1
    print(f"Enhet: {enhet}. {len(X)} kandidater i {ant_grupper} stillinger", flush=True)

    # HOLDOUT PAA GIV. To kandidater fra samme stilling deler hele giva.
    unike = numpy.unique(FRO)
    rs = numpy.random.RandomState(args.froe)
    hold_frø = set(rs.choice(unike, max(1, int(len(unike) * args.holdoutandel)), replace=False))
    er_hold = numpy.array([f in hold_frø for f in FRO])
    print(
        f"Giv-deling: {len(hold_frø)} av {len(unike)} givere i holdout "
        f"({int(er_hold.sum())} kandidater)",
        flush=True,
    )

    Xt = torch.from_numpy(X).to(enhet)
    Gt = torch.from_numpy(G).to(enhet)
    Vt = torch.from_numpy(V).to(enhet)
    Ht = torch.from_numpy(er_hold).to(enhet)
    Nt = torch.from_numpy(NEV).to(enhet)

    # REFERANSEN: NevroHjernes egen anger paa noeyaktig samme stillinger.
    # Uten den er modellens tall meningsloest - det som betyr noe er om den
    # slaar det som ALT spiller, ikke om den er naer et teoretisk optimum.
    def nevro_anger(maske):
        idx = torch.nonzero(maske, as_tuple=False).squeeze(1)
        g = Gt[idx]
        v = Vt[idx]
        n = Nt[idx]
        best = torch.full((ant_grupper,), -1e30, device=enhet).scatter_reduce(
            0, g, v, reduce="amax", include_self=True
        )
        valgt = torch.full((ant_grupper,), -1e30, device=enhet)
        er_n = n > 0
        if int(er_n.sum()) == 0:
            return float("nan"), 0
        valgt = valgt.scatter_reduce(0, g[er_n], v[er_n], reduce="amax", include_self=True)
        med = (best > -1e29) & (valgt > -1e29)
        if int(med.sum()) == 0:
            return float("nan"), 0
        return float((best[med] - valgt[med]).clamp(min=0).mean()), int(med.sum())

    torch.manual_seed(args.froe)
    dims = [args.dim] + [int(x) for x in args.skjult.split(",")] + [1]
    modell = Rangnett(dims).to(enhet)
    if args.vekter:
        gamle = les_vekter(args.vekter)
        if len(gamle) != len(modell.lag):
            raise SystemExit(f"--vekter har {len(gamle)} lag, modellen {len(modell.lag)} (--skjult maa matche)")
        with torch.no_grad():
            for i, (l, (w, b)) in enumerate(zip(modell.lag, gamle)):
                ut, inn = w.shape
                if ut != l.out_features or inn > l.in_features or (i > 0 and inn != l.in_features):
                    raise SystemExit(f"lag {i}: vektene er {inn}->{ut}, modellen {l.in_features}->{l.out_features}")
                ny = torch.zeros_like(l.weight)
                ny[:, :inn] = torch.from_numpy(w)
                l.weight.copy_(ny)
                l.bias.copy_(torch.from_numpy(b))
        print(f"START FRA {args.vekter}" + (f" (utvidet {gamle[0][0].shape[1]} -> {args.dim} med nullkolonner)" if gamle[0][0].shape[1] < args.dim else ""), flush=True)
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)

    def gruppetap(idx):
        """Myk kryssentropi INNENFOR hver stilling."""
        s = modell(Xt[idx])
        g = Gt[idx]
        v = Vt[idx]
        # Stabil gruppevis softmax: trekk fra gruppens maks.
        maks_s = torch.full((ant_grupper,), -1e30, device=enhet).scatter_reduce(
            0, g, s, reduce="amax", include_self=True
        )
        maks_v = torch.full((ant_grupper,), -1e30, device=enhet).scatter_reduce(
            0, g, v / args.tau, reduce="amax", include_self=True
        )
        es = torch.exp(s - maks_s[g])
        ev = torch.exp(v / args.tau - maks_v[g])
        sum_s = torch.zeros(ant_grupper, device=enhet).scatter_add(0, g, es)
        sum_v = torch.zeros(ant_grupper, device=enhet).scatter_add(0, g, ev)
        logp = s - maks_s[g] - torch.log(sum_s[g] + 1e-12)
        mål = ev / (sum_v[g] + 1e-12)
        per = -(mål * logp)
        tap = torch.zeros(ant_grupper, device=enhet).scatter_add(0, g, per)
        med = torch.zeros(ant_grupper, device=enhet).scatter_add(0, g, torch.ones_like(per)) > 0
        return tap[med].mean()

    @torch.no_grad()
    def treff(idx):
        """Andel stillinger der modellens toppvalg ER den beste kandidaten."""
        s = modell(Xt[idx])
        g = Gt[idx]
        v = Vt[idx]
        best_s = torch.full((ant_grupper,), -1e30, device=enhet).scatter_reduce(
            0, g, s, reduce="amax", include_self=True
        )
        best_v = torch.full((ant_grupper,), -1e30, device=enhet).scatter_reduce(
            0, g, v, reduce="amax", include_self=True
        )
        # Verdien til kandidaten modellen ville valgt.
        valgt = torch.full((ant_grupper,), -1e30, device=enhet)
        er_topp = s >= best_s[g] - 1e-9
        valgt = valgt.scatter_reduce(0, g[er_topp], v[er_topp], reduce="amax", include_self=True)
        med = best_v > -1e29
        # ANGER i poeng: hvor mye taper vi paa aa velge modellens topp i stedet
        # for den faktisk beste. Det er tallet som betyr noe, ikke treffraten.
        anger = (best_v[med] - valgt[med]).clamp(min=0)
        return float((anger < 1e-9).float().mean()), float(anger.mean())

    tren_idx = torch.nonzero(~Ht, as_tuple=False).squeeze(1)
    hold_idx = torch.nonzero(Ht, as_tuple=False).squeeze(1)
    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)

    n_tren, ant_tren = nevro_anger(~Ht)
    n_hold, ant_hold = nevro_anger(Ht)
    print(
        f"REFERANSE - NevroHjernes egen anger: tren {n_tren:.4f} ({ant_tren} stillinger), "
        f"holdout {n_hold:.4f} ({ant_hold})",
        flush=True,
    )
    # Maskinlesbar, for skriptene som avgjoer om et nett skal benkes.
    print(f"POLICY-ANGER-HOLDOUT {n_hold:.4f}", flush=True)

    beste = float("inf")
    for e in range(args.epoker):
        modell.train()
        opt.zero_grad(set_to_none=True)
        tap = gruppetap(tren_idx)
        tap.backward()
        opt.step()
        plan.step()
        modell.eval()
        tr_treff, tr_anger = treff(tren_idx)
        ho_treff, ho_anger = treff(hold_idx)
        rad = {
            "epoke": e + 1,
            "tap": round(float(tap), 5),
            "tren_treff": round(tr_treff, 4),
            "tren_anger": round(tr_anger, 4),
            "hold_treff": round(ho_treff, 4),
            "hold_anger": round(ho_anger, 4),
        }
        logg.write(json.dumps(rad) + "\n")
        if (e + 1) % 10 == 0 or e == 0:
            print(
                f"epoke {e + 1}/{args.epoker}: tap {float(tap):.4f}  "
                f"tren-treff {tr_treff * 100:.1f} % anger {tr_anger:.3f}  "
                f"hold-treff {ho_treff * 100:.1f} % anger {ho_anger:.3f}",
                flush=True,
            )
        if ho_anger < beste:
            beste = ho_anger
            skriv_vekter(args.ut, modell)

    # Ren ASCII. Windows-konsollen er cp1252, og en pil her tok ned skriptet
    # ETTER at treningen var ferdig og vektene lagret - verste slaget: alt
    # arbeidet gjort, og likevel en traceback som ser ut som en feilet kjoering.
    print(f"\nFerdig: beste hold-anger {beste:.4f} poeng -> {args.ut}", flush=True)
    print(f"MODELL-ANGER-HOLDOUT {beste:.4f}", flush=True)
    print(
        "ANGEREN ER TALLET SOM BETYR NOE. Treffraten sier hvor ofte modellen\n"
        "velger nøyaktig beste kandidat; angeren sier hva feilvalgene KOSTER.\n"
        "En modell som bommer ofte, men bare på kandidater som er nesten like\n"
        "gode, er bedre enn en som treffer oftere og bommer katastrofalt.",
        flush=True,
    )


if __name__ == "__main__":
    main()
