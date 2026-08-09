#!/usr/bin/env python3
"""
MLB FASE 0.3 — SANDKASSENETTET: ETT UNDERLAG, TRE HODER.

    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-tren.py \
        --tren "mlb-data/trening-*.bin" \
        --hold "mlb-data/holdout-*.bin" \
        --ut e1-modell/mlb-sandkasse.bin --epoker 20

    # bare tilfeldige vekter + referanseutganger, ingen trening:
    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-tren.py --referanse \
        --hold "mlb-data/holdout-0.bin" \
        --ut e1-modell/mlb-init.bin --ref-ut e1-modell/mlb-init-ref.bin

============================ FORMEN =====================================

  stamme   1032 -> 1024 -> 768 -> 512   (ReLU etter HVERT lag, ogsaa det siste)
  policy    512 -> 68                   (HANDLING_LENGDE)
  verdi     512 -> 1
  tro       512 -> 208                  (52 kort x 4 seter)

Stammens siste lag aktiveres fordi det mater tre hoder. `src/mlb/nett.ts`
legger den ReLU-en paa selv, rett etter `forover(stamme, x)` — `forover`
hopper over aktiveringen paa det siste laget i hvert nett, fordi det NORMALT er
logits. De to sidene maa vaere enige om akkurat dette, og `examples/
mlb-nettsjekk.ts` maaler at de er det.

============================ HVA SOM TRENES HER =========================

IKKE policyen. `docs/mlb.md` fase 0.4 er selvspill, og den kjoerer en annen
oekt. Her trenes bare de to hodene som har PERFEKTE etiketter og ingen
sirkularitet:

  verdi   rundens faktiske poeng for setet som sto for tur
  tro     hvor hvert usett kort FAKTISK laa

Policyhodet blir staaende med sin tilfeldige initialisering, og det er
meningen: det er en fornuftssjekk paa at roergata virker ende til ende, ikke en
kvalitetsmaaling.

============================ FLYTTALLSBREDDEN ===========================

X lagres i float32, ikke float16. `verktoy/mlb-tro-tren.py` bruker fp16 for aa
spare minne, og det er en STILLE presisjonsforskjell mellom det modellen trenes
paa og det TypeScript-siden mater inn: TS leser float32 fra disk. 500 000 rader
x 1032 trekk x 4 byte er 2,1 GB, som gaar greit paa et 16 GB-kort. `--fp16`
finnes for aa kunne kjoere stoerre korpus, men da er avviket kjent og valgt.
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
KLASSER = 4
POLICY_UT = 68
TRO_UT = KORT * KLASSER  # 208
VERDI_UT = 1
HODE = 12  # "MLBS" + versjon + dim

# Verdihodet spaar RAA rundepoeng. Skalaen brukes BARE i tapet, saa gradientene
# blir sammenliknbare med kryssentropien - utgangen er fortsatt poeng.
VERDI_SKALA = 10.0


def post_dtype(dim):
    """En rad slik `examples/mlb-data.ts` skriver den. Pakket, ikke justert."""
    return numpy.dtype(
        [
            ("t", "<f4", (dim,)),
            ("f", "i1", (KORT,)),
            ("p", "<f4"),
            ("sete", "<i2"),
            ("stikk", "<i2"),
            ("fase", "<i2"),
            ("kode", "<i2"),
            ("fro", "<i4"),
        ]
    )


def les_bin(monster, fp16, maks=None):
    """Leser MLBS-postene til (X, F int8, P float32, FASE int16)."""
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen filer for «{monster}»")
    Xs, Fs, Ps, FAs = [], [], [], []
    dim = None
    n = 0
    for sti in filer:
        with open(sti, "rb") as fh:
            magi = fh.read(4)
            if magi != b"MLBS":
                raise SystemExit(f"{sti}: ikke en MLBS-fil (fikk {magi!r})")
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
            a = numpy.fromfile(fh, dtype=post_dtype(d))
        if maks is not None and n + len(a) > maks:
            a = a[: max(0, maks - n)]
        Xs.append(a["t"].astype(numpy.float16) if fp16 else a["t"])
        Fs.append(a["f"])
        Ps.append(a["p"])
        FAs.append(a["fase"])
        n += len(a)
        print(f"  {sti}: {len(a)} rader", flush=True)
        del a
        if maks is not None and n >= maks:
            break
    return (
        numpy.concatenate(Xs),
        numpy.concatenate(Fs),
        numpy.concatenate(Ps),
        numpy.concatenate(FAs),
        dim,
    )


class Sandkassenett(nn.Module):
    """Ett felles underlag, tre hoder."""

    def __init__(self, dim, skjult):
        super().__init__()
        dims = [dim] + list(skjult)
        self.stamme = nn.ModuleList(
            [nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)]
        )
        b = dims[-1]
        self.policy = nn.Linear(b, POLICY_UT)
        self.verdi = nn.Linear(b, VERDI_UT)
        self.tro = nn.Linear(b, TRO_UT)

    def underlag(self, x):
        # ReLU etter HVERT lag, ogsaa det siste: stammen mater tre hoder, den er
        # ikke logits. TS-siden legger paa noeyaktig den samme.
        for l in self.stamme:
            x = F.relu(l(x))
        return x

    def forward(self, x):
        h = self.underlag(x)
        return self.policy(h), self.verdi(h).squeeze(-1), self.tro(h).view(-1, KORT, KLASSER)


def skriv_vekter(sti, modell):
    """Appens vektformat: FIRE nett - stamme, policy, verdi, tro - i den rekkefoelgen.

    `src/nevro/nett.ts` leser det uten oversetter, og `Sandkassenett` i
    `src/mlb/nett.ts` haandhever at det er noeyaktig fire deler med riktige
    bredder. En forskjoevet fil blir en feilmelding, ikke stille soeppel.
    """
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    deler = [list(modell.stamme), [modell.policy], [modell.verdi], [modell.tro]]
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", len(deler)))
        for lag in deler:
            f.write(struct.pack("<i", len(lag)))
            for l in lag:
                f.write(struct.pack("<ii", l.in_features, l.out_features))
                f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
                f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


def les_vekter(sti, modell):
    """Leser vektfila TILBAKE inn i modellen.

    Finnes for at TS-mot-PyTorch-sjekken skal kunne kjoeres paa de TRENTE
    vektene og ikke bare paa en tilfeldig initialisering. Toleransen som gjelder
    for smaa aktiveringer trenger ikke gjelde for store, og en toleranse som
    bare er maalt der utgangene er 0,002 er ikke maalt der de er 20.
    """
    with open(sti, "rb") as f:
        (antall,) = struct.unpack("<i", f.read(4))
        deler = [list(modell.stamme), [modell.policy], [modell.verdi], [modell.tro]]
        if antall != len(deler):
            raise SystemExit(f"{sti}: {antall} nett, ventet {len(deler)}")
        for lag in deler:
            (n,) = struct.unpack("<i", f.read(4))
            if n != len(lag):
                raise SystemExit(f"{sti}: {n} lag i en del, ventet {len(lag)}")
            for l in lag:
                inn, ut = struct.unpack("<ii", f.read(8))
                if (inn, ut) != (l.in_features, l.out_features):
                    raise SystemExit(f"{sti}: lag {inn}x{ut}, ventet {l.in_features}x{l.out_features}")
                w = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn)
                b = numpy.frombuffer(f.read(ut * 4), dtype="<f4")
                with torch.no_grad():
                    l.weight.copy_(torch.from_numpy(w.copy()))
                    l.bias.copy_(torch.from_numpy(b.copy()))
        if f.read(1):
            raise SystemExit(f"{sti}: det sto igjen byte etter siste lag - filen er forskjoevet")


def skriv_referanse(sti, modell, X32, dim, enhet):
    """Inngangene og PyTorchs egne utganger, saa TS-siden kan sammenliknes.

    INNGANGENE SKRIVES MED, i float32, noeyaktig slik de ble matet. Leste
    TS-siden dem fra datafila i stedet, ville vi maalt to ting samtidig -
    lasteren og aritmetikken - og et avvik kunne kommet fra begge.
    """
    modell.eval()
    with torch.no_grad():
        x = torch.from_numpy(X32).to(enhet).float()
        p, v, t = modell(x)
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(b"MLBR")
        f.write(struct.pack("<iii", 1, dim, len(X32)))
        f.write(X32.astype("<f4").tobytes())
        f.write(p.cpu().numpy().astype("<f4").tobytes())
        f.write(v.cpu().numpy().astype("<f4").reshape(-1, 1).tobytes())
        f.write(t.reshape(len(X32), TRO_UT).cpu().numpy().astype("<f4").tobytes())
    return len(X32)


def kapasitetsreferanse(Fa):
    """K8-formens gulv for en teller som bare kjenner antall plasser igjen.

    Den kjenner IKKE svaret - bare hvor mange kort hver plassering har igjen,
    som er offentlig. AErlig referanse, ikke fasit i forkledning.
    """
    ant = numpy.stack([(Fa == k).sum(axis=1) for k in (1, 2, 3, 4)], axis=1).astype(numpy.float64)
    tot = ant.sum(axis=1, keepdims=True)
    tot[tot == 0] = 1
    p = ant / tot
    p3 = p[:, :3]
    s3 = p3.sum(axis=1, keepdims=True)
    s3[s3 == 0] = 1
    pk = p3 / s3
    tap, n = 0.0, 0
    for k in range(3):
        m = (Fa == k + 1).sum(axis=1)
        tap += float((-numpy.log(numpy.maximum(1e-12, pk[:, k])) * m).sum())
        n += int(m.sum())
    return tap / max(1, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tren", default="mlb-data/trening-*.bin")
    ap.add_argument("--hold", default="mlb-data/holdout-*.bin")
    ap.add_argument("--ut", default="e1-modell/mlb-sandkasse.bin")
    ap.add_argument("--skjult", default="1024,768,512")
    ap.add_argument("--epoker", type=int, default=20)
    ap.add_argument("--batch", type=int, default=2048)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--froe", type=int, default=20260809)
    ap.add_argument("--vekt-verdi", type=float, default=1.0)
    ap.add_argument("--fp16", action="store_true", help="lagre X i float16 (kjent presisjonsavvik)")
    ap.add_argument("--maks-tren", type=int, default=0, help="0 = alt")
    ap.add_argument("--referanse", action="store_true", help="bare init + referanse, ingen trening")
    ap.add_argument("--last", default="", help="referansemodus: last disse vektene i stedet for aa initiere")
    ap.add_argument("--ref-ut", default="e1-modell/mlb-init-ref.bin")
    ap.add_argument("--ref-rader", type=int, default=64)
    ap.add_argument("--logg", default="analyse/mlb-tren.jsonl")
    ap.add_argument("--rapport", default="analyse/mlb-tren.txt")
    args = ap.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    skjult = [int(x) for x in args.skjult.split(",")]
    t0 = time.time()

    # ---------------- REFERANSEMODUS: tilfeldig init, ingen trening ---------
    if args.referanse:
        print("HOLDOUT (bare de foerste radene, som referanseinnganger):", flush=True)
        Xr, _, _, _, dim = les_bin(args.hold, False, maks=args.ref_rader)
        torch.manual_seed(args.froe)
        modell = Sandkassenett(dim, skjult).to(enhet)
        if args.last:
            les_vekter(args.last, modell)
            print(f"Leste vekter fra {args.last} (ingen ny initialisering)", flush=True)
        skriv_vekter(args.ut, modell)
        n = skriv_referanse(args.ref_ut, modell, Xr[: args.ref_rader], dim, enhet)
        par = sum(p.numel() for p in modell.parameters())
        os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
        with open(args.rapport, "a", encoding="utf-8") as f:
            f.write(f"\n=== MLB 0.3: tilfeldig init ({time.strftime('%Y-%m-%d %H:%M')}) ===\n")
            f.write(f"dim {dim}, skjult {skjult}, froe {args.froe}, parametre {par}\n")
            f.write(f"vekter -> {args.ut}\nreferanse ({n} rader) -> {args.ref_ut}\n")
        kilde = "Leste" if args.last else "Tilfeldige"
        print(f"{kilde} vekter -> {args.ut} ({par} parametre)", flush=True)
        print(f"Referanse ({n} rader) -> {args.ref_ut}", flush=True)
        return

    # ---------------- TRENING ----------------------------------------------
    print("TRENING:", flush=True)
    Xtr, Ftr, Ptr, _, dim = les_bin(
        args.tren, args.fp16, maks=(args.maks_tren or None)
    )
    print("HOLDOUT:", flush=True)
    Xho, Fho, Pho, FAho, dim2 = les_bin(args.hold, args.fp16)
    if dim != dim2:
        raise SystemExit(f"tren dim {dim} != holdout dim {dim2}")
    print(
        f"{len(Xtr)} treningsrader, {len(Xho)} holdoutrader, {dim} trekk "
        f"({time.time() - t0:.0f}s)",
        flush=True,
    )

    kap_k8 = kapasitetsreferanse(Fho)
    # GRUNNLINJEN FOR VERDIHODET: aa spaa treningssnittet, alltid. Faller tapet
    # ikke under den, har hodet ikke laert noe som helst - bare gjennomsnittet.
    snitt = float(Ptr.mean())
    grunn_rmse = float(numpy.sqrt(((Pho - snitt) ** 2).mean()))
    print(
        f"GRUNNLINJER paa holdout: tro-K8 kapasitet {kap_k8:.4f} (gulv 1,0986), "
        f"verdi-RMSE ved aa spaa snittet ({snitt:.2f}) {grunn_rmse:.4f}",
        flush=True,
    )

    Xt = torch.from_numpy(Xtr).to(enhet)
    Ft = torch.from_numpy(Ftr).to(enhet).long()
    Pt = torch.from_numpy(Ptr).to(enhet).float()
    Xh = torch.from_numpy(Xho).to(enhet)
    Fh = torch.from_numpy(Fho).to(enhet).long()
    Ph = torch.from_numpy(Pho).to(enhet).float()
    del Xtr, Ftr, Xho, Fho

    torch.manual_seed(args.froe)
    modell = Sandkassenett(dim, skjult).to(enhet)
    par = sum(p.numel() for p in modell.parameters())
    print(f"Sandkassenettet: {par} parametre, skjult {skjult}", flush=True)
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epoker))

    @torch.no_grad()
    def maal(X, Fa, P):
        """Tro-CE4, tro-treff, K8-tapsformen og verdi-RMSE - paa samme rader."""
        sum4, n4 = 0.0, 0
        treff, tot = 0, 0
        sumk8, nk8 = 0.0, 0
        kvad, nv = 0.0, 0
        for i in range(0, len(X), args.batch):
            x = X[i : i + args.batch].float()
            mal = Fa[i : i + args.batch]
            p = P[i : i + args.batch]
            _, v, t = modell(x)
            kvad += float(((v - p) ** 2).sum())
            nv += len(x)
            maske = mal > 0
            if maske.sum() == 0:
                continue
            m = (mal - 1).clamp(min=0)
            sum4 += float(F.cross_entropy(t[maske], m[maske], reduction="sum"))
            n4 += int(maske.sum())
            treff += int(((t.argmax(dim=2) == m) & maske).sum())
            tot += int(maske.sum())
            m3 = maske & (mal <= 3)
            if m3.sum() > 0:
                lp = F.log_softmax(t[:, :, :3], dim=2)
                valgt = lp.gather(2, m.clamp(max=2).unsqueeze(2)).squeeze(2)
                sumk8 += float((-valgt[m3]).sum())
                nk8 += int(m3.sum())
        return {
            "ce4": sum4 / max(1, n4),
            "treff": treff / max(1, tot),
            "k8": sumk8 / max(1, nk8),
            "rmse": (kvad / max(1, nv)) ** 0.5,
        }

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    # RADENE SKRIVES LOEPENDE, av prosessen selv. Aldri gjennom et stdout-roer.
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(
        json.dumps(
            {
                "start": time.strftime("%Y-%m-%d %H:%M"),
                "dim": dim,
                "skjult": skjult,
                "parametre": par,
                "tren_rader": len(Xt),
                "hold_rader": len(Xh),
                "kap_k8": round(kap_k8, 5),
                "grunn_rmse": round(grunn_rmse, 5),
            }
        )
        + "\n"
    )

    modell.eval()
    f0 = maal(Xh, Fh, Ph)
    logg.write(json.dumps({"epoke": 0, **{f"hold_{k}": round(v, 5) for k, v in f0.items()}}) + "\n")
    print(
        f"epoke 0 (tilfeldig): CE4 {f0['ce4']:.4f}  treff {f0['treff'] * 100:.1f} %  "
        f"K8 {f0['k8']:.4f}  verdi-RMSE {f0['rmse']:.4f}",
        flush=True,
    )

    n = len(Xt)
    beste = float("inf")
    beste_rad = (0, f0)
    for e in range(args.epoker):
        modell.train()
        perm = torch.randperm(n, device=enhet)
        s_tro, s_verdi, nb = 0.0, 0.0, 0
        for i in range(0, n, args.batch):
            j = perm[i : i + args.batch]
            _, v, t = modell(Xt[j].float())
            mal = Ft[j]
            maske = mal > 0
            if maske.sum() == 0:
                continue
            m = (mal - 1).clamp(min=0)
            tap_tro = F.cross_entropy(t[maske], m[maske], reduction="mean")
            tap_verdi = F.mse_loss(v / VERDI_SKALA, Pt[j] / VERDI_SKALA)
            tap = tap_tro + args.vekt_verdi * tap_verdi
            opt.zero_grad(set_to_none=True)
            tap.backward()
            opt.step()
            s_tro += float(tap_tro.detach())
            s_verdi += float(tap_verdi.detach())
            nb += 1
        plan.step()
        modell.eval()
        h = maal(Xh, Fh, Ph)
        rad = {
            "epoke": e + 1,
            "tren_tro": round(s_tro / max(1, nb), 5),
            "tren_verdi": round(s_verdi / max(1, nb), 5),
            "hold_ce4": round(h["ce4"], 5),
            "hold_treff": round(h["treff"], 5),
            "hold_k8": round(h["k8"], 5),
            "hold_rmse": round(h["rmse"], 5),
            "sek": round(time.time() - t0, 1),
        }
        logg.write(json.dumps(rad) + "\n")
        print(
            f"epoke {e + 1}/{args.epoker}: tro {rad['tren_tro']:.4f} verdi {rad['tren_verdi']:.4f}"
            f"  |  CE4 {h['ce4']:.4f}  treff {h['treff'] * 100:.1f} %  K8 {h['k8']:.4f}  "
            f"verdi-RMSE {h['rmse']:.4f}",
            flush=True,
        )
        # Beste paa SUMMEN av de to hodene vi faktisk trener, i samme skala som
        # tapet - ellers ville det ene hodet valgt vektene for det andre.
        skaar = h["ce4"] + args.vekt_verdi * (h["rmse"] / VERDI_SKALA) ** 2
        if skaar < beste:
            beste = skaar
            beste_rad = (e + 1, h)
            skriv_vekter(args.ut, modell)

    os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
    with open(args.rapport, "a", encoding="utf-8") as f:
        e, h = beste_rad
        f.write(f"\n=== MLB fase 0.3: sandkassenettet ({time.strftime('%Y-%m-%d %H:%M')}) ===\n")
        f.write(f"dim {dim}, skjult {skjult}, parametre {par}, epoker {args.epoker}, lr {args.lr}\n")
        f.write(f"trening {n} rader, holdout {len(Xh)} rader (eget froebaand)\n")
        f.write(f"X i {'float16' if args.fp16 else 'float32'}\n")
        f.write(f"GRUNNLINJER: tro-K8 kapasitet {kap_k8:.5f}, verdi-RMSE ved snitt {grunn_rmse:.5f}\n")
        f.write(
            f"foer trening (epoke 0): CE4 {f0['ce4']:.5f}  treff {f0['treff'] * 100:.2f} %  "
            f"K8 {f0['k8']:.5f}  verdi-RMSE {f0['rmse']:.5f}\n"
        )
        f.write(
            f"beste epoke {e}: CE4 {h['ce4']:.5f}  treff {h['treff'] * 100:.2f} %  "
            f"K8 {h['k8']:.5f}  verdi-RMSE {h['rmse']:.5f}\n"
        )
        f.write(f"vekter -> {args.ut}\n")
    print(f"\nFerdig. Rapport lagt til {args.rapport}", flush=True)


if __name__ == "__main__":
    main()
