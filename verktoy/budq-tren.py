#!/usr/bin/env python3
"""
BUDQ — TRENER Q(stilling, bud) PAA UTSPILLINGSETIKETTENE (K3.1, K3.2). 11. sep.

    <venv>/bin/python verktoy/budq-tren.py \
        --data "/mnt/d/amb-grp/budq/d0/s*.jsonl" --ut /mnt/d/amb-grp/budq/budq-v1.bin

Radene kommer fra `examples/budq-data.ts`: trekk (143, eller 287 med `--hukommelse`:
motstanderboka bakerst), og for hvert lovlige bud K utspillingsverdier fra verdener
trukket fra setets visning. Maalet per (rad, bud) er snittet over verdenene; maska sier
hvilke bud som var lovlige.

BREDDEN leses av radene (alle maa ha samme), eller settes med `--dim 143|287`; da hoppes
rader med annen bredde over og telles.

VARMSTART (K6.6, 11. sep): `--vekter <appformat>` starter fra et ferdig nett. Et 143-nett
til 287 utvides med NULLKOLONNER i foerste lag, saa startnettet velger bit-identisk med
143-nettet (motstanderboka har ingen virkning foer dataene gir den en), og starten er
selv en kandidat ("epoke 0") - resultatet er aldri daarligere enn starten paa holdout.
Bruk samme `--skala` og `--skjult` som startnettet ble trent med.

    bash /d/amb-k8/py-wsl.sh verktoy/budq-tren.py --data "/mnt/d/amb-grp/budq/h0/s*.jsonl" \
        --vekter /mnt/d/amb-agB/e1-modell/budq-s2.bin --ut /mnt/d/amb-grp/budq/budq-h1.bin

MASKINLESBART paa SLUTTEN (stdout fra WSL mister tidlige linjer): `MODELL-GEVINST-HOLDOUT`,
`START-GEVINST-HOLDOUT`, `MODELL-DIM` osv., én per linje.

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


# 323 = 287 + stillingen per sete (sans A, `src/mlb/stillingtrekk.ts`), bakerst: 287 -> 323 er nuller bakerst.
# 367 = 323 + auksjonens rekkefoelge (sans C, `src/mlb/auksjonsrekke.ts`, 12. sep), ogsaa bakerst.
BREDDER = (143, 287, 323, 367)


def les(monster, blanding=0.0, dim=0):
    """dim=0: bredden leses av foerste rad, og en annen bredde senere er en feil (to
    datasett blandet i stillhet ville gitt et nett som leser boka halve tiden)."""
    X, T, M, P, FRO = [], [], [], [], []
    lest_bredde = dim == 0
    feil_bredde = 0
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
                qp = r.get("qp")
                if blanding != 0.0 and qp is None:
                    raise SystemExit("--blanding krever qp i radene (budq-data --seier)")
                for b, verdier in r["q"].items():
                    if b in INDEKS and verdier:
                        # BLANDINGEN (11. sep): rent seiersmaal laerte vaagale bud der
                        # seiersprediktoren ekstrapolerer (kampbenk: margin -407, 50 runder).
                        ekstra = blanding * float(numpy.mean(qp[b])) if blanding != 0.0 else 0.0
                        t[INDEKS[b]] = float(numpy.mean(verdier)) + ekstra
                        m[INDEKS[b]] = 1.0
                if m.sum() < 2:
                    continue
                bredde = len(r["x"])
                if dim == 0:
                    dim = bredde
                    if dim not in BREDDER:
                        raise SystemExit(f"Ukjent trekkbredde {dim} i {sti} (ventet {BREDDER})")
                if bredde != dim:
                    if lest_bredde:
                        raise SystemExit(f"Blandede trekkbredder: {dim} og {bredde} ({sti}). Velg med --dim.")
                    feil_bredde += 1
                    continue
                X.append(numpy.asarray(r["x"], dtype=numpy.float32))
                T.append(t)
                M.append(m)
                P.append(INDEKS.get(str(r.get("policy")), -1))
                FRO.append(int(r["frø"]))
    if not X:
        raise SystemExit(f"Ingen brukbare rader i «{monster}» (bredde {dim or 'ukjent'}, {feil_bredde} med annen bredde)")
    return (numpy.stack(X), numpy.stack(T), numpy.stack(M), numpy.asarray(P),
            numpy.asarray(FRO, dtype=numpy.int64), len(filer), dim, feil_bredde)


def les_vekter(sti):
    """Appformatet (`skriv_vekter`) tilbake til [(W, b)], radvis W (ut x inn). Som vrak-tren.py."""
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
    if o != len(data):
        raise SystemExit(f"{sti}: leste {o} av {len(data)} byte - formatet er forskjoevet")
    return lag


def skriv_vekter(sti, lag):
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(lag)))
        for l in lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def varmstart(lag, gamle, enhet):
    """Legger `gamle` inn i `lag` med NULLKOLONNER bakerst i foerste lag (143 -> 287 -> 323).

    Alle breddene er prefikser av hverandre (bok bak 143, stilling bak boka), saa nullene
    bakerst gir samme Q ved start. Returnerer startnettets inngangsbredde.
    """
    if len(gamle) != len(lag):
        raise SystemExit(f"--vekter har {len(gamle)} lag, modellen {len(lag)} (--skjult maa matche)")
    with torch.no_grad():
        for i, (l, (w, b)) in enumerate(zip(lag, gamle)):
            ut, inn = w.shape
            if ut != l.out_features or inn > l.in_features or (i > 0 and inn != l.in_features):
                raise SystemExit(f"lag {i}: vektene er {inn}->{ut}, modellen {l.in_features}->{l.out_features}")
            ny = torch.zeros_like(l.weight)
            ny[:, :inn] = torch.from_numpy(w).to(enhet)
            l.weight.copy_(ny)
            l.bias.copy_(torch.from_numpy(b).to(enhet))
    return gamle[0][0].shape[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="")
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
    ap.add_argument("--blanding", type=float, default=0.0,
                    help="maal = q + blanding*qp: seiersmaal pluss en andel rundepoeng (krever qp i dataene)")
    ap.add_argument("--dim", type=int, default=0, choices=[0, 143, 287, 323],
                    help="trekkbredde; 0 = les av radene (143 uten, 287 med budq-data --hukommelse, 323 med --sanser2)")
    ap.add_argument("--vekter", default="",
                    help="start fra dette nettet (appformat); et smalere nett utvides med nullkolonner bakerst")
    # BARE UTVIDELSEN (11. sep): CPU, ingen data, ingen trening. --vekter utvidet til --dim skrives til --ut,
    # med noeyaktig den varmstarten treningen bruker - saa den kan proeves uten GPU og uten et korpus.
    ap.add_argument("--bare-utvid", action="store_true", help="utvid --vekter til --dim, skriv --ut og avslutt (CPU)")
    a = ap.parse_args()

    if a.bare_utvid:
        if not a.vekter or a.dim == 0:
            raise SystemExit("--bare-utvid krever --vekter og --dim")
        gamle = les_vekter(a.vekter)
        dims = [a.dim] + [w.shape[0] for w, _ in gamle]
        lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])
        fra = varmstart(lag, gamle, "cpu")
        skriv_vekter(a.ut, lag)
        print(f"UTVIDET {a.vekter} {fra} -> {a.dim}: {a.ut}", flush=True)
        return
    if not a.data:
        raise SystemExit("--data mangler")

    X, T, M, P, FRO, nfiler, dim, hoppet = les(a.data, a.blanding, a.dim)
    h = (FRO.astype(numpy.uint64) * numpy.uint64(2654435761)) % numpy.uint64(4294967296)
    hold = (h % numpy.uint64(a.hold_del)) == 0
    print(f"{len(X)} budstillinger fra {nfiler} filer, {int(hold.sum())} paa holdout, "
          f"{int((~hold).sum())} i trening, {dim} trekk"
          + (f" ({hoppet} rader med annen bredde hoppet over)" if hoppet else ""), flush=True)
    if int(hold.sum()) == 0 or int((~hold).sum()) == 0:
        raise SystemExit("Holdout eller trening er tom - flere kamper (froe) eller en annen --hold-del")

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(a.froe)
    dims = [dim] + [int(x) for x in a.skjult.split(",")] + [len(BUD)]
    lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)]).to(enhet)
    start_inn = None
    if a.vekter:
        # VARMSTART (K6.6). Nullkolonnene er hele poenget: Q er uendret ved start, og
        # motstanderboka faar bare vekt der gradienten finner noe i den.
        start_inn = varmstart(lag, les_vekter(a.vekter), enhet)
        print(f"START FRA {a.vekter}"
              + (f" (utvidet {start_inn} -> {dim} med nullkolonner)" if start_inn < dim else ""), flush=True)

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

    mse0, g0, se0, tak0, enig0, ford0 = maal()
    print(f"start: mse {mse0:.3f}  gevinst {g0:+.3f} ± {se0:.3f}  tak {tak0:+.3f}", flush=True)
    beste = -1e9
    beste_rad = None
    if a.vekter:
        # Starten er selv en kandidat: blir ingen epoke bedre paa holdout, skrives
        # startnettet (nullutvidet) - aldri et daarligere nett enn det vi startet fra.
        beste = g0
        beste_rad = (0, mse0, g0, se0, tak0, enig0, ford0)
        skriv_vekter(a.ut, lag)
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
    print(json.dumps({"budq": {"epoke": e, "mse": mse, "gevinst": g, "se": se, "tak": tak, "enig": enig,
                               "dim": dim, "start": a.vekter or None, "start_gevinst": g0}}), flush=True)
    # MASKINLESBART, HELT TIL SLUTT: stdout fra WSL mister de tidlige linjene.
    for navn, verdi in (
        ("MODELL-DIM", dim),
        ("MODELL-EPOKE", e),
        ("MODELL-GEVINST-HOLDOUT", f"{g:.4f}"),
        ("MODELL-SE-HOLDOUT", f"{se:.4f}"),
        ("MODELL-TAK-HOLDOUT", f"{tak:.4f}"),
        ("MODELL-MSE-HOLDOUT", f"{mse:.4f}"),
        ("MODELL-ENIG-HOLDOUT", f"{enig:.4f}"),
        ("START-GEVINST-HOLDOUT", f"{g0:.4f}"),
        ("START-FRA", (a.vekter + (f" ({start_inn}->{dim})" if start_inn is not None and start_inn < dim else "")) if a.vekter else "tilfeldig"),
        ("MODELL-UT", a.ut),
    ):
        print(f"{navn} {verdi}", flush=True)


if __name__ == "__main__":
    main()
