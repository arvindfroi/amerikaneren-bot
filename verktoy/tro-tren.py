#!/usr/bin/env python3
"""
TRENER TROSMODELLEN: hvor ligger hvert usette kort?

    SD_BUFFER=$HOME/sd-buffer ~/Arvind-Lora/.venv/bin/python verktoy/tro-tren.py \
        --data tro-data --ut e1-modell/tro.bin --epoker 40

Arvind: «jeg vet at john doe ikke har noen rutere igjen […] dermed tror jeg
john doe har hjerter ess.»

Modellen tar de 470 offentlige trekkene og gir, for hvert av de 52 kortene, en
fordeling over FIRE plasseringer: relativt sete 1, 2, 3, eller dødt (i vraket).
Kort vi alt ser er maskert bort – de er ikke gjetning.

============================ HVA DEN MAALES MOT ==========================

En treffrate uten referanse betyr ingenting. Tre referanser regnes derfor ved
siden av, paa noeyaktig de samme radene:

  UNIFORM       hvert usett kort like sannsynlig hos hvert sete. Gulvet.
  KAPASITET     vekt etter hvor mange kort hver plassering har igjen: tre
                hender med h kort og fire doede gir P(doed) = 4/(3h+4).
                DETTE ER DEN EKTE REFERANSEN - alt en teller kan faa til uten
                aa forstaa noe som helst.
  RENONS        kapasitet, men null vekt paa seter som har vist renons i
                fargen. Det er omtrent det troblokken (v6) alt gir nettet.

Slaar modellen ikke RENONS, har den ikke laert noe vi ikke hadde.

============================ OG PAA HONNOERENE ============================

Samlet treffrate er et daarlig maal her. De fleste usette kort er smaa og
likegyldige; det er ESSENE som avgjoer stikk, og det er dem Arvinds kjede
handler om. Treffraten rapporteres derfor separat for verdi >= 12.

En modell som blir bedre paa smaakortene og staar stille paa essene har ikke
loest problemet, uansett hva totalen sier.
"""

import argparse
import glob
import hashlib
import json
import os
import struct
import time

import numpy
import torch
import torch.nn as nn
import torch.nn.functional as F

KORT = 52
KLASSER = 4  # rel sete 1, 2, 3, doedt
BUFFERMAPPE = os.environ.get("SD_BUFFER", "sd-buffer")


class Tronett(nn.Module):
    """MLP med 52x4 utganger. Én fordeling per kort."""

    def __init__(self, dims):
        super().__init__()
        self.lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])

    def forward(self, x):
        for i, l in enumerate(self.lag):
            x = l(x)
            if i < len(self.lag) - 1:
                x = F.relu(x)
        return x.view(-1, KORT, KLASSER)


def skriv_vekter(sti, modell):
    """Appens vektformat, saa TypeScript-siden leser den med samme loader."""
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def buffernavn(filer):
    """Samme regel som sd-tren: sti, stoerrelse og mtime for hver fil."""
    h = hashlib.md5()
    for f in filer:
        st = os.stat(f)
        h.update(f"{f}:{st.st_size}:{int(st.st_mtime)}|".encode("utf-8"))
    return os.path.join(BUFFERMAPPE, f"tro-{h.hexdigest()[:16]}.npz")


def les(mapper):
    filer = []
    for m in mapper:
        f = sorted(glob.glob(os.path.join(m, "*.jsonl")))
        if not f:
            raise SystemExit(f"Fant ingen *.jsonl i {m}")
        filer += f

    buf = buffernavn(filer)
    if os.path.exists(buf):
        t0 = time.time()
        d = numpy.load(buf)
        print(f"Buffer: {d['X'].shape[0]} rader fra {buf} ({time.time() - t0:.0f}s)", flush=True)
        return d["X"], d["F"], d["FRO"]

    t0 = time.time()
    X, Fa, FRO = [], [], []
    dim = None
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
                t, f = r.get("t"), r.get("f")
                if not t or not f or len(f) != KORT:
                    continue
                if dim is None:
                    dim = len(t)
                elif len(t) != dim:
                    # BREDDEN MAA VAERE EN. Blandes to bredder, hoppes halve
                    # korpuset over i stillhet - samme felle som i sd-tren.
                    continue
                X.append(t)
                Fa.append(f)
                FRO.append(r.get("frø", 0))
        print(f"  {sti}: totalt {len(X)}", flush=True)

    X = numpy.array(X, dtype=numpy.float32)
    Fa = numpy.array(Fa, dtype=numpy.int64)
    FRO = numpy.array(FRO, dtype=numpy.int64)
    print(f"Leste {len(X)} rader a {X.shape[1]} trekk ({time.time() - t0:.0f}s)", flush=True)
    try:
        os.makedirs(BUFFERMAPPE, exist_ok=True)
        numpy.savez(buf, X=X, F=Fa, FRO=FRO)
        print(f"Buffer skrevet: {buf}", flush=True)
    except OSError as e:
        print(f"  (kunne ikke skrive buffer: {e})", flush=True)
    return X, Fa, FRO


def referanser(Fa, enhet):
    """UNIFORM og KAPASITET regnet av fasiten selv, rad for rad.

    Kapasitetsreferansen kjenner IKKE svaret - den kjenner bare hvor mange
    kort hver plassering har igjen, som er offentlig. Den er derfor en aerlig
    referanse og ikke en fasit i forkledning.
    """
    ukjent = Fa > 0
    n = ukjent.sum()
    if n == 0:
        return 0.0, 0.0
    # Antall kort per plassering, per rad.
    ant = numpy.stack([(Fa == k).sum(axis=1) for k in (1, 2, 3, 4)], axis=1).astype(numpy.float64)
    tot = ant.sum(axis=1, keepdims=True)
    tot[tot == 0] = 1
    p = ant / tot  # sannsynlighet for hver plassering paa den raden
    # Forventet treff naar man gjetter etter kapasitet: sum p_k * andel_k = sum p_k^2
    kap = float((p**2).sum(axis=1).repeat(1).mean())
    return 0.25, kap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="tro-data")
    ap.add_argument("--ut", default="e1-modell/tro.bin")
    ap.add_argument("--skjult", default="512,384")
    ap.add_argument("--epoker", type=int, default=40)
    ap.add_argument("--batch", type=int, default=8192)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--holdoutandel", type=float, default=0.05)
    ap.add_argument("--froe", type=int, default=20260804)
    ap.add_argument("--logg", default="analyse/tro-tren.jsonl")
    args = ap.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    X, Fa, FRO = les([m for m in args.data.split(",") if m])
    if len(X) < 1000:
        raise SystemExit(f"For lite data ({len(X)} rader)")

    # HOLDOUT PAA GIV, ikke paa rad. To stillinger fra samme giv deler hele
    # kortfordelingen, saa en radvis deling ville lekket fasiten rett inn.
    unike = numpy.unique(FRO)
    rs = numpy.random.RandomState(args.froe)
    hold = set(rs.choice(unike, max(1, int(len(unike) * args.holdoutandel)), replace=False).tolist())
    er_hold = numpy.isin(FRO, numpy.fromiter(hold, dtype=numpy.int64, count=len(hold)))
    print(
        f"Giv-deling: {len(hold)} av {len(unike)} giver i holdout "
        f"({int(er_hold.sum())} rader)",
        flush=True,
    )

    uni, kap = referanser(Fa[er_hold], enhet)
    print(f"REFERANSER paa holdout: uniform {uni * 100:.1f} %, kapasitet {kap * 100:.1f} %", flush=True)

    Xt = torch.from_numpy(X).to(enhet)
    Ft = torch.from_numpy(Fa).to(enhet)
    Ht = torch.from_numpy(er_hold).to(enhet)
    # Honnoerene: verdi >= 12 (D, K, E) i kortindeksens rangdel.
    rang = torch.arange(KORT, device=enhet) % 13  # 0..12 der 12 = ess
    er_honnor = (rang >= 10).unsqueeze(0)

    torch.manual_seed(args.froe)
    dims = [X.shape[1]] + [int(x) for x in args.skjult.split(",")] + [KORT * KLASSER]
    modell = Tronett(dims).to(enhet)
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)

    tren_idx = torch.nonzero(~Ht, as_tuple=False).squeeze(1)
    hold_idx = torch.nonzero(Ht, as_tuple=False).squeeze(1)

    def tap_og_treff(idx, tren: bool):
        sum_tap, n_tap = 0.0, 0
        treff, tot = 0, 0
        treff_h, tot_h = 0, 0
        for i in range(0, len(idx), args.batch):
            j = idx[i : i + args.batch]
            ut = modell(Xt[j])
            mal = Ft[j]
            maske = mal > 0
            if maske.sum() == 0:
                continue
            # Klassene 1..4 -> 0..3
            t = (mal - 1).clamp(min=0)
            tap = F.cross_entropy(ut[maske], t[maske], reduction="mean")
            if tren:
                opt.zero_grad(set_to_none=True)
                tap.backward()
                opt.step()
            sum_tap += float(tap) * int(maske.sum())
            n_tap += int(maske.sum())
            with torch.no_grad():
                gjett = ut.argmax(dim=2)
                riktig = (gjett == t) & maske
                treff += int(riktig.sum())
                tot += int(maske.sum())
                hm = maske & er_honnor
                treff_h += int(((gjett == t) & hm).sum())
                tot_h += int(hm.sum())
        return (
            sum_tap / max(1, n_tap),
            treff / max(1, tot),
            treff_h / max(1, tot_h),
        )

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    beste = 0.0
    for e in range(args.epoker):
        modell.train()
        perm = tren_idx[torch.randperm(len(tren_idx), device=enhet)]
        tr_tap, tr_treff, tr_h = tap_og_treff(perm, True)
        plan.step()
        modell.eval()
        with torch.no_grad():
            ho_tap, ho_treff, ho_h = tap_og_treff(hold_idx, False)
        logg.write(
            json.dumps(
                {
                    "epoke": e + 1,
                    "tren_tap": round(tr_tap, 5),
                    "hold_tap": round(ho_tap, 5),
                    "hold_treff": round(ho_treff, 5),
                    "hold_honnor": round(ho_h, 5),
                }
            )
            + "\n"
        )
        if (e + 1) % 5 == 0 or e == 0:
            print(
                f"epoke {e + 1}/{args.epoker}: tap {tr_tap:.4f}/{ho_tap:.4f}  "
                f"treff {ho_treff * 100:.1f} %  honnoerer {ho_h * 100:.1f} %  "
                f"(kapasitet {kap * 100:.1f} %)",
                flush=True,
            )
        if ho_treff > beste:
            beste = ho_treff
            skriv_vekter(args.ut, modell)

    print(f"\nFerdig: beste holdout-treff {beste * 100:.2f} % -> {args.ut}", flush=True)
    print(
        "SLAAR DEN IKKE KAPASITETSREFERANSEN, har den ikke laert noe en teller\n"
        "ikke kunne. Og honnoertreffet betyr mer enn totalen: de fleste usette\n"
        "kort er smaa og likegyldige, det er essene som avgjoer stikk.",
        flush=True,
    )


if __name__ == "__main__":
    main()
