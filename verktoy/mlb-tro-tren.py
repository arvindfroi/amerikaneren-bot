#!/usr/bin/env python3
"""
MLB FASE 0a — TRENER TROHODET ALENE, VEILEDET, PAA PERFEKTE ETIKETTER.

    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-tro-tren.py \
        --tren "mlb-tro-data/trening-*.bin" \
        --hold "mlb-tro-data/holdout-*.bin" \
        --ut e1-modell/mlb-tro.bin --epoker 30

Hypotesen, fra `docs/mlb.md` fase 0a: dagens tro er et MONTE-CARLO-ESTIMAT.
Log-tap straffer variansen systematisk (Jensen), og §117 maalte at
underskuddet kollapser med V. Et NETT har ingen slik straff. Et trohode trent
veiledet paa fasit om fortiden kan derfor slaa dagens tro uten noe soek.

============================ HVA SOM MAALES =============================

Fire tall paa holdout, alle paa noeyaktig samme rader:

  CE4        4-klasses kryssentropi (rel sete 1-3 + TALONG). Det modellen
             faktisk trenes paa.
  TREFF      topp-1 over de fire klassene.
  KAPASITET  referansen `tro-tren.py` kaller «alt en teller kan faa til»:
             vekt etter hvor mange kort hver plassering har igjen.
  K8-TAP     og dette er det viktige. Log-tap over de TRE setene, renormalisert
             og betinget paa at kortet ER paa en haand - noeyaktig maaltallet i
             `examples/tro-noyaktighet.ts`. Gulvet er 1,0986 (uniform over 3);
             `gulv+` laa paa 1,0342 og dagens beste arm paa 1,0525 (§117).

K8-tapet her er en FORHAANDSVISNING, ikke dommen. Dommen faller i
`examples/mlb-k8.ts`, paa de samme stillingene som dagens tro maales paa.

============================ FROEBAANDENE ==============================

Holdout er et EGET froebaand, avsatt foer foerste rad ble generert
(`examples/mlb-trodata.ts`). Ikke en radvis deling: to stillinger fra samme giv
deler hele kortfordelingen, saa en radvis deling ville lekket fasiten rett inn.
"""

import argparse
import glob
import json
import os
import struct
import time

import numpy
import torch
import torch.nn as nn
import torch.nn.functional as F

KORT = 52
KLASSER = 4  # rel sete 1, 2, 3, talong
HODE = 12  # "MLBT" + versjon + dim


def les_bin(monster):
    """Leser MLBT-postene til (X fp16, F int8, FRO int32, STIKK int16)."""
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen filer for «{monster}»")
    Xs, Fs, FROs, STs = [], [], [], []
    dim = None
    for sti in filer:
        with open(sti, "rb") as fh:
            magi = fh.read(4)
            if magi != b"MLBT":
                raise SystemExit(f"{sti}: ikke en MLBT-fil")
            (versjon,) = struct.unpack("<i", fh.read(4))
            (d,) = struct.unpack("<i", fh.read(4))
            if versjon != 1:
                raise SystemExit(f"{sti}: ukjent versjon {versjon}")
            # BREDDEN MAA VAERE EN. Blandes to bredder, hoppes halve korpuset
            # over i stillhet - samme felle som i sd-tren og tro-tren.
            if dim is None:
                dim = d
            elif d != dim:
                raise SystemExit(f"{sti}: dim {d}, ventet {dim}")
            dt = numpy.dtype(
                [
                    ("t", "<f4", (dim,)),
                    ("f", "i1", (KORT,)),
                    ("fro", "<i4"),
                    ("stikk", "<i2"),
                    ("sete", "<i2"),
                ]
            )
            a = numpy.fromfile(fh, dtype=dt)
        Xs.append(a["t"].astype(numpy.float16))
        Fs.append(a["f"])
        FROs.append(a["fro"])
        STs.append(a["stikk"])
        print(f"  {sti}: {len(a)} rader", flush=True)
        del a
    return (
        numpy.concatenate(Xs),
        numpy.concatenate(Fs),
        numpy.concatenate(FROs),
        numpy.concatenate(STs),
        dim,
    )


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
    """Appens vektformat, saa `src/nevro/nett.ts` leser den uten oversetter."""
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def les_dims(sti):
    """Lagbreddene i en vektfil i appformatet, uten aa laste vektene."""
    with open(sti, "rb") as f:
        (deler,) = struct.unpack("<i", f.read(4))
        if deler != 1:
            raise SystemExit(f"{sti}: {deler} deler, trosnettet er EN")
        (lag,) = struct.unpack("<i", f.read(4))
        dims = []
        for i in range(lag):
            inn, ut = struct.unpack("<ii", f.read(8))
            if i == 0:
                dims.append(inn)
            dims.append(ut)
            f.seek(inn * ut * 4 + ut * 4, 1)
    return dims


def les_vekter(sti, modell):
    """Leser appformatet tilbake. R2 starter hver epoke fra forrige epokes trosnett."""
    with open(sti, "rb") as f:
        f.read(8)
        for l in modell.lag:
            inn, ut = struct.unpack("<ii", f.read(8))
            if (inn, ut) != (l.in_features, l.out_features):
                raise SystemExit(f"{sti}: lag {inn}x{ut}, ventet {l.in_features}x{l.out_features}")
            w = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn)
            b = numpy.frombuffer(f.read(ut * 4), dtype="<f4")
            with torch.no_grad():
                l.weight.copy_(torch.from_numpy(w.copy()))
                l.bias.copy_(torch.from_numpy(b.copy()))
        if f.read(1):
            raise SystemExit(f"{sti}: det sto igjen byte etter siste lag")


def kapasitetsreferanse(Fa):
    """Treffrate og K8-tap for en teller som bare kjenner antall plasser igjen.

    Den kjenner IKKE svaret - bare hvor mange kort hver plassering har igjen,
    som er offentlig. Ærlig referanse, ikke fasit i forkledning.
    """
    ant = numpy.stack([(Fa == k).sum(axis=1) for k in (1, 2, 3, 4)], axis=1).astype(numpy.float64)
    tot = ant.sum(axis=1, keepdims=True)
    tot[tot == 0] = 1
    p = ant / tot
    treff = float((p**2).sum(axis=1).mean())
    # K8-formen: betinget paa at kortet er paa en haand, altsaa over de tre
    # setene renormalisert.
    p3 = p[:, :3]
    s3 = p3.sum(axis=1, keepdims=True)
    s3[s3 == 0] = 1
    pk = p3 / s3
    tap, n = 0.0, 0
    for k in range(3):
        m = (Fa == k + 1).sum(axis=1)
        tap += float((-numpy.log(numpy.maximum(1e-12, pk[:, k])) * m).sum())
        n += int(m.sum())
    return treff, tap / max(1, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tren", default="mlb-tro-data/trening-*.bin")
    ap.add_argument("--hold", default="mlb-tro-data/holdout-*.bin")
    ap.add_argument("--ut", default="e1-modell/mlb-tro.bin")
    ap.add_argument("--skjult", default="1024,768,512")
    ap.add_argument("--epoker", type=int, default=30)
    ap.add_argument("--batch", type=int, default=4096)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--froe", type=int, default=20260809)
    ap.add_argument("--tapsform", default="ce4", choices=["ce4", "kond"])
    ap.add_argument("--logg", default="analyse/mlb-tro-tren.jsonl")
    ap.add_argument("--rapport", default="analyse/mlb-tro-tren.txt")
    # R2 (10. sep): trosnettet trenes SAMMEN med policyen, paa epokens egne kamper.
    ap.add_argument("--vekter", default="", help="start fra disse vektene (appformat); tom = tilfeldig")
    ap.add_argument("--hold-del", type=int, default=0, help=">0: holdout = rader med froe %% N == 0 fra --tren")
    args = ap.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    t0 = time.time()
    print("TRENING:", flush=True)
    Xtr, Ftr, FROtr, STtr, dim = les_bin(args.tren)
    if args.hold_del > 0:
        # HOLDOUT PAA KAMP, fra samme filer: epokens data har ikke et eget froebaand,
        # og en radvis splitt ville maalt gjenkjenning av kampen.
        hold = (numpy.abs(FROtr.astype(numpy.int64)) % args.hold_del) == 0
        Xho, Fho, Sho = Xtr[hold], Ftr[hold], STtr[hold]
        Xtr, Ftr = Xtr[~hold], Ftr[~hold]
        dim2 = dim
    else:
        print("HOLDOUT:", flush=True)
        Xho, Fho, _, Sho, dim2 = les_bin(args.hold)
    if dim != dim2:
        raise SystemExit(f"tren dim {dim} != holdout dim {dim2}")
    print(
        f"{len(Xtr)} treningsrader, {len(Xho)} holdoutrader, {dim} trekk "
        f"({time.time() - t0:.0f}s)",
        flush=True,
    )

    kap_treff, kap_k8 = kapasitetsreferanse(Fho)
    print(
        f"REFERANSER paa holdout: uniform-treff 25,0 %, kapasitet-treff "
        f"{kap_treff * 100:.1f} %, kapasitet K8-tap {kap_k8:.4f} (gulv 1,0986)",
        flush=True,
    )

    Xt = torch.from_numpy(Xtr).to(enhet)
    Ft = torch.from_numpy(Ftr).to(enhet).long()
    Xh = torch.from_numpy(Xho).to(enhet)
    Fh = torch.from_numpy(Fho).to(enhet).long()
    Sh = torch.from_numpy(Sho.astype(numpy.int64)).to(enhet)
    del Xtr, Ftr, Xho, Fho

    rang = torch.arange(KORT, device=enhet) % 13  # 0..12 der 12 = ess
    er_honnor = (rang >= 10).unsqueeze(0)

    torch.manual_seed(args.froe)
    if args.vekter:
        dims = les_dims(args.vekter)
        if dims[0] != dim:
            raise SystemExit(f"{args.vekter} tar {dims[0]} trekk, dataene har {dim}")
    else:
        dims = [dim] + [int(x) for x in args.skjult.split(",")] + [KORT * KLASSER]
    modell = Tronett(dims).to(enhet)
    if args.vekter:
        les_vekter(args.vekter, modell)
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)

    def tap_batch(ut, mal):
        """Tapet modellen trenes paa.

        `ce4` er den fulle 4-klassemodellen; `kond` er K8-formen direkte
        (betinget paa at kortet er paa en haand, renormalisert over de tre
        setene). Den siste finnes for aa vise om forskjellen mellom aa MODELLERE
        talongen og aa BETINGE den bort er stor nok til aa bry seg om.
        """
        maske = mal > 0
        if maske.sum() == 0:
            return None
        t = (mal - 1).clamp(min=0)
        if args.tapsform == "ce4":
            return F.cross_entropy(ut[maske], t[maske], reduction="mean")
        m3 = maske & (mal <= 3)
        if m3.sum() == 0:
            return None
        return F.cross_entropy(ut[m3][:, :3], t[m3], reduction="mean")

    @torch.no_grad()
    def mål(X, Fa, S=None):
        """CE4, treff, honnoertreff og K8-tap - alt paa samme rader."""
        sum4, n4 = 0.0, 0
        treff, tot = 0, 0
        treff_h, tot_h = 0, 0
        sumk8, nk8 = 0.0, 0
        # K8-tap per stikk, saa vi ser om det vokser utover i runden slik §117 saa.
        perStikk = {}
        for i in range(0, len(X), args.batch):
            x = X[i : i + args.batch].float()
            mal = Fa[i : i + args.batch]
            ut = modell(x)
            maske = mal > 0
            if maske.sum() == 0:
                continue
            t = (mal - 1).clamp(min=0)
            sum4 += float(F.cross_entropy(ut[maske], t[maske], reduction="sum"))
            n4 += int(maske.sum())
            gjett = ut.argmax(dim=2)
            treff += int(((gjett == t) & maske).sum())
            tot += int(maske.sum())
            hm = maske & er_honnor
            treff_h += int(((gjett == t) & hm).sum())
            tot_h += int(hm.sum())
            # K8: bare kort som ER paa en haand, renormalisert over de tre setene.
            m3 = maske & (mal <= 3)
            if m3.sum() > 0:
                lp = F.log_softmax(ut[:, :, :3], dim=2)
                valgt = lp.gather(2, t.clamp(max=2).unsqueeze(2)).squeeze(2)
                sumk8 += float((-valgt[m3]).sum())
                nk8 += int(m3.sum())
                if S is not None:
                    st = S[i : i + args.batch].unsqueeze(1).expand_as(mal)
                    for v in torch.unique(st[m3]).tolist():
                        sel = m3 & (st == v)
                        a, b = perStikk.get(v, (0.0, 0))
                        perStikk[v] = (a + float((-valgt[sel]).sum()), b + int(sel.sum()))
        return {
            "ce4": sum4 / max(1, n4),
            "treff": treff / max(1, tot),
            "honnor": treff_h / max(1, tot_h),
            "k8": sumk8 / max(1, nk8),
            "k8_n": nk8,
            "perStikk": {int(k): round(v[0] / max(1, v[1]), 5) for k, v in sorted(perStikk.items())},
        }

    # STARTVEKTENE MAALES FOERST (R2). De er grunnlinjen: et trosnett som ikke
    # slaar dem paa epokens egen holdout skal ikke erstatte dem, og driveren leser
    # «tro_foer»/«tro_etter» for aa avgjoere det.
    modell.eval()
    foer = mål(Xh, Fh, Sh)
    print(json.dumps({"tro_foer": {k: v for k, v in foer.items() if k != "perStikk"}}), flush=True)
    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    beste = foer["k8"] if args.vekter else float("inf")
    beste_rad = (0, foer) if args.vekter else None
    if args.vekter:
        # Uten dette kunne en epoke som bare ble verre etterlate en fil DAARLIGERE
        # enn den den startet fra.
        skriv_vekter(args.ut, modell)
    n = len(Xt)
    for e in range(args.epoker):
        modell.train()
        perm = torch.randperm(n, device=enhet)
        sum_tap, n_tap = 0.0, 0
        for i in range(0, n, args.batch):
            j = perm[i : i + args.batch]
            ut = modell(Xt[j].float())
            tap = tap_batch(ut, Ft[j])
            if tap is None:
                continue
            opt.zero_grad(set_to_none=True)
            tap.backward()
            opt.step()
            sum_tap += float(tap.detach())
            n_tap += 1
        plan.step()
        modell.eval()
        h = mål(Xh, Fh, Sh)
        rad = {
            "epoke": e + 1,
            "tapsform": args.tapsform,
            "tren_tap": round(sum_tap / max(1, n_tap), 5),
            "hold_ce4": round(h["ce4"], 5),
            "hold_treff": round(h["treff"], 5),
            "hold_honnor": round(h["honnor"], 5),
            "hold_k8": round(h["k8"], 5),
            "hold_k8_n": h["k8_n"],
        }
        logg.write(json.dumps(rad) + "\n")
        print(
            f"epoke {e + 1}/{args.epoker}: tren {rad['tren_tap']:.4f}  "
            f"CE4 {h['ce4']:.4f}  treff {h['treff'] * 100:.1f} %  "
            f"honnoer {h['honnor'] * 100:.1f} %  K8-tap {h['k8']:.4f}",
            flush=True,
        )
        # BESTE PAA K8-TAPET, ikke paa treffet: det er tallet kravet stiller.
        if h["k8"] < beste:
            beste = h["k8"]
            beste_rad = (e + 1, h)
            skriv_vekter(args.ut, modell)

    # RESULTATET SKRIVES AV PROSESSEN SELV, aldri gjennom et stdout-roer.
    os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
    with open(args.rapport, "a", encoding="utf-8") as f:
        e, h = beste_rad
        f.write(f"\n=== MLB fase 0a: trohodet trent alene ({time.strftime('%Y-%m-%d %H:%M')}) ===\n")
        f.write(f"tapsform {args.tapsform}, dims {dims}, epoker {args.epoker}, lr {args.lr}\n")
        f.write(f"trening {n} rader, holdout {len(Xh)} rader (eget froebaand)\n")
        f.write(f"kapasitetsreferanse: treff {kap_treff * 100:.2f} %, K8-tap {kap_k8:.4f}\n")
        f.write(f"beste epoke {e}: CE4 {h['ce4']:.5f}  treff {h['treff'] * 100:.2f} %  ")
        f.write(f"honnoer {h['honnor'] * 100:.2f} %  K8-tap {h['k8']:.5f} (n={h['k8_n']})\n")
        f.write(f"K8-tap per stikk: {h['perStikk']}\n")
        f.write(f"vekter -> {args.ut}\n")
    print(f"\nFerdig: beste holdout K8-tap {beste:.5f} -> {args.ut}", flush=True)
    print(json.dumps({"tro_etter": {"epoke": beste_rad[0], **{k: v for k, v in beste_rad[1].items() if k != "perStikk"}}}), flush=True)
    print(f"Rapport lagt til {args.rapport}", flush=True)


if __name__ == "__main__":
    main()
