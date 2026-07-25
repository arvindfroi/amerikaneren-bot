#!/usr/bin/env python3
"""
E1 fase 2: trener kortspill-nettet på GPU fra orakel-dataene.

Kjøres i WSL (PyTorch + CUDA):

    ~/Arvind-Lora/.venv/bin/python verktoy/e1-tren.py \
        --data e1-data,e1-data2,e1-data3 --utelat e1-frys \
        --ut e1-modell/e1-r2.bin --logg e1-modell/r2.log --epoker 40

--utelat ER IKKE VALGFRITT NÅR e1-data3 ER MED. Målebenken e1-frys er de
første ~4 200 linjene av hvert skard i e1-data3, tatt som et øyeblikksbilde
mens de ti orakelprosessene skrev videre til samme filer. Uten --utelat e1-frys
trener nettet på nøyaktig de stillingene det senere måles på, og
holdout-tallet blir en selvbekreftelse.

Læringsmålet er ORDENEN mellom kortene, ikke poengverdiene i seg selv:
orakelet gir forventet egenpoeng per lovlig kort, og nettet trenes med
maskert myk kryssentropi mot softmax(v/τ) over nettopp de lovlige kortene.
Ulovlige kort maskeres bort både i tapet og ved spilling, så nettet aldri
bruker kapasitet på å lære reglene – dem kan motoren.

Vektene skrives i appens eget binærformat (Int32/Float32 little-endian:
antall nett, så per nett antall lag, så per lag inn/ut/vekter/bias), slik at
src/nevro/nett.ts kan lese dem uendret. Ett nett her (kortspill).
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

TREKK_DIM = 273  # src/e1/trekk.ts – 238 fra appen + 35 egne
KORT = 52


def signaturer(mapper: list[str]) -> set[str]:
    """Linjesignaturene i et sett mapper – brukes til å HOLDE dem utenfor.

    Nødvendig fordi e1-frys er de første linjene av hvert skard i e1-data3,
    som orakelprosessene fortsatt skriver til. Uten dette ville målebenken
    ligget i treningssettet og «holdout»-tallet vært en løgn.
    """
    ut: set[str] = set()
    for mappe in mapper:
        for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
            with open(fil, "r", encoding="utf-8") as f:
                for linje in f:
                    linje = linje.strip()
                    if linje:
                        ut.add(hashlib.md5(linje.encode("utf-8")).hexdigest()[:16])
    return ut


def les_data(mapper: list[str], utelat: list[str]) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """JSONL → (trekk, verdier, maske). Verdier er 0 der kortet er ulovlig.

    Leser flere mapper, utelater alt som finnes i `utelat`, og fjerner
    duplikater (e1-data2 har 2 069 gjentatte linjer – de ville ellers vektet
    de samme stillingene dobbelt).
    """
    forbudt = signaturer(utelat)
    if forbudt:
        print(f"Utelater {len(forbudt)} stillinger fra {', '.join(utelat)}")
    X, V, M = [], [], []
    sett: set[str] = set()
    hoppet = 0
    for mappe in mapper:
        filer = sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl")))
        if not filer:
            raise SystemExit(f"Fant ingen skard-*.jsonl i {mappe}")
        foer = len(X)
        for fil in filer:
            with open(fil, "r", encoding="utf-8") as f:
                for linje in f:
                    linje = linje.strip()
                    if not linje:
                        continue
                    sig = hashlib.md5(linje.encode("utf-8")).hexdigest()[:16]
                    if sig in forbudt or sig in sett:
                        hoppet += 1
                        continue
                    sett.add(sig)
                    try:
                        r = json.loads(linje)
                    except json.JSONDecodeError:
                        continue  # siste linje kan være halvskrevet mens skardet kjører
                    t = r.get("t")
                    v = r.get("v")
                    if not t or not v or len(t) != TREKK_DIM:
                        continue
                    verdi = [0.0] * KORT
                    maske = [0.0] * KORT
                    for k, val in v.items():
                        i = int(k)
                        verdi[i] = float(val)
                        maske[i] = 1.0
                    if sum(maske) < 2:
                        continue
                    X.append(t)
                    V.append(verdi)
                    M.append(maske)
        print(f"  {mappe}: {len(X) - foer} stillinger")
    print(f"Leste {len(X)} stillinger fra {len(mapper)} mappe(r), hoppet over {hoppet}")
    return (
        torch.tensor(X, dtype=torch.float32),
        torch.tensor(V, dtype=torch.float32),
        torch.tensor(M, dtype=torch.float32),
    )


def hent_data(args) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Les data, eventuelt fra/til et npz-buffer.

    JSON-parsingen av 400 000 stillinger tar minutter; læringskurven trenger
    de samme dataene fem ganger. Bufferet gjør den målingen mulig i praksis.
    """
    mapper = [m for m in args.data.split(",") if m]
    utelat = [m for m in args.utelat.split(",") if m]
    if args.buffer and os.path.exists(args.buffer):
        d = numpy.load(args.buffer)
        print(f"Leste buffer {args.buffer}: {d['X'].shape[0]} stillinger")
        return (torch.from_numpy(d["X"]), torch.from_numpy(d["V"]), torch.from_numpy(d["M"]))
    X, V, M = les_data(mapper, utelat)
    if args.buffer:
        os.makedirs(os.path.dirname(args.buffer) or ".", exist_ok=True)
        numpy.savez(args.buffer, X=X.numpy(), V=V.numpy(), M=M.numpy())
        print(f"Skrev buffer {args.buffer}")
    return X, V, M


class E1Nett(nn.Module):
    """MLP, ReLU på alle lag unntatt det siste – samme form appens loader forventer."""

    def __init__(self, dims: list[int]):
        super().__init__()
        self.lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])

    def forward(self, x):
        for i, l in enumerate(self.lag):
            x = l(x)
            if i < len(self.lag) - 1:
                x = F.relu(x)
        return x


def maskert_tap(logits, verdi, maske, tau: float, vekt=None):
    """Myk kryssentropi mot softmax(v/τ), begge maskert til lovlige kort.

    `vekt` er per stilling: en beslutning der beste og verste kort skiller
    ti poeng betyr ti ganger mer enn en der alle kortene er likeverdige.
    Uten vekting drukner de avgjørende valgene i de likegyldige – og ~32 %
    av stillingene er målt helt flate.
    """
    stor_negativ = torch.finfo(logits.dtype).min
    logits = logits.masked_fill(maske == 0, stor_negativ)
    mål = (verdi / tau).masked_fill(maske == 0, stor_negativ)
    mål = F.softmax(mål, dim=1)
    logp = F.log_softmax(logits, dim=1)
    per = -(mål * logp).sum(dim=1)
    if vekt is None:
        return per.mean()
    return (per * vekt).sum() / vekt.sum().clamp(min=1e-6)


def stillingsvekt(verdi, maske, tak: float = 8.0):
    """Vekt = spennet mellom beste og verste lovlige kort, klippet.

    Klippingen hindrer at noen få runder med ±50 (amerikaner) tar over hele
    gradienten – samme lærdom som i målemetodikken: tunge haler må temmes,
    ikke få lov til å bestemme alt.
    """
    stor_negativ = torch.finfo(verdi.dtype).min
    beste = verdi.masked_fill(maske == 0, stor_negativ).max(dim=1).values
    verst = verdi.masked_fill(maske == 0, -stor_negativ).min(dim=1).values
    return (beste - verst).clamp(min=0.0, max=tak) + 0.05


@torch.no_grad()
def treffrate(logits, verdi, maske):
    """Andel stillinger der nettets argmax er orakelets beste kort.

    Uavgjorte tilfeller (flere kort med samme toppverdi) teller som treff –
    der er det ingenting å ta feil av, og ~1/3 av stillingene er slike.
    """
    stor_negativ = torch.finfo(logits.dtype).min
    valgt = logits.masked_fill(maske == 0, stor_negativ).argmax(dim=1)
    best = verdi.masked_fill(maske == 0, stor_negativ).max(dim=1, keepdim=True).values
    return (verdi.gather(1, valgt.unsqueeze(1)) >= best - 1e-6).float().mean().item()


def skriv_vekter(sti: str, modell: E1Nett) -> None:
    """Appens format: antall nett, per nett antall lag, per lag inn/ut/vekter/bias."""
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))  # ett nett
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            inn, ut = l.in_features, l.out_features
            f.write(struct.pack("<ii", inn, ut))
            # nn.Linear.weight er [ut, inn] radvis – nøyaktig appens layout.
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())
    print(f"Skrev {sti} ({os.path.getsize(sti)} byte)")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="e1-data", help="mappe(r), komma-separert")
    p.add_argument("--utelat", default="", help="mappe(r) hvis stillinger ALDRI skal trenes paa (f.eks. e1-frys)")
    p.add_argument("--buffer", default=None, help="npz-fil aa mellomlagre de leste dataene i")
    p.add_argument("--ut", default="e1-modell/e1.bin")
    p.add_argument("--epoker", type=int, default=30)
    p.add_argument("--batch", type=int, default=1024)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--wd", type=float, default=0.0, help="vektfall i AdamW")
    p.add_argument("--taal", type=int, default=6, help="epoker uten framgang foer tidlig stopp")
    p.add_argument("--tau", type=float, default=1.0)
    p.add_argument("--skjult", default="512,512,256")
    p.add_argument("--maks", type=int, default=None, help="trener paa bare N stillinger (valideringen er uendret)")
    p.add_argument("--froe", type=int, default=1, help="froe for treningsuttrekket ved --maks")
    p.add_argument("--vekt", action="store_true", default=True, help="vekt tapet med hvor mye som staar paa spill")
    p.add_argument("--uvektet", dest="vekt", action="store_false")
    p.add_argument("--logg", default="e1-modell/tren.log")
    args = p.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Enhet: {enhet}" + (f" ({torch.cuda.get_device_name(0)})" if enhet == "cuda" else ""))

    X, V, M = hent_data(args)
    n = X.shape[0]
    if n < 1000:
        raise SystemExit(f"For lite data ({n} stillinger) – vent til orakelet har kjørt lenger")
    # Siste 5 % holdes utenfor. Skardene er disjunkte i frø, så et rent
    # haleuttak er nok til å skille trening fra måling.
    #
    # VALIDERINGEN ER DEN SAMME UANSETT --maks. Læringskurven mot datamengde
    # er verdiløs hvis valideringssettet endrer seg med treningsmengden –
    # samme feil som å låne et referansetall fra et annet utvalg.
    del_ = int(n * 0.95)
    Xv, Vv, Mv = X[del_:].to(enhet), V[del_:].to(enhet), M[del_:].to(enhet)
    Xt, Vt, Mt = X[:del_], V[:del_], M[:del_]
    if args.maks is not None and args.maks < Xt.shape[0]:
        g = torch.Generator().manual_seed(args.froe)
        valgt = torch.randperm(Xt.shape[0], generator=g)[: args.maks]
        Xt, Vt, Mt = Xt[valgt], Vt[valgt], Mt[valgt]
    Xt, Vt, Mt = Xt.to(enhet), Vt.to(enhet), Mt.to(enhet)
    Wt = stillingsvekt(Vt, Mt) if args.vekt else None
    print(f"Trening {Xt.shape[0]}, validering {Xv.shape[0]}")

    dims = [TREKK_DIM] + [int(x) for x in args.skjult.split(",")] + [KORT]
    modell = E1Nett(dims).to(enhet)
    antall = sum(p.numel() for p in modell.parameters())
    print(f"Nett: {' → '.join(str(d) for d in dims)} ({antall} parametre)")

    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr, weight_decay=args.wd)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)  # linjebufret: overlever avbrudd
    logg.write(
        f"=== start {time.strftime('%Y-%m-%d %H:%M:%S')} data={args.data} utelat={args.utelat or '-'} "
        f"n={n} trening={Xt.shape[0]} val={Xv.shape[0]} dims={dims} lr={args.lr} wd={args.wd} "
        f"tau={args.tau} taal={args.taal} ===\n"
    )

    # TIDLIG STOPP. R1 (311k, 40 epoker) toppet val-treff paa epoke 2 og
    # falt saa mens val-tap steg (1,45 -> 1,56) - klar overtilpasning paa et
    # 700k-parameters nett. Vi stopper naar val-treffet ikke har blitt bedre
    # paa `taal` epoker, saa flere epoker aldri skader; sjekkpunktet er uansett
    # det BESTE, ikke det siste.
    beste = -1.0
    siden_beste = 0
    for epoke in range(args.epoker):
        modell.train()
        perm = torch.randperm(Xt.shape[0], device=enhet)
        sum_tap = 0.0
        biter = 0
        for i in range(0, Xt.shape[0], args.batch):
            idx = perm[i : i + args.batch]
            tap = maskert_tap(modell(Xt[idx]), Vt[idx], Mt[idx], args.tau, None if Wt is None else Wt[idx])
            opt.zero_grad(set_to_none=True)
            tap.backward()
            opt.step()
            sum_tap += tap.item()
            biter += 1
        plan.step()
        modell.eval()
        with torch.no_grad():
            val_logits = modell(Xv)
            val_tap = maskert_tap(val_logits, Vv, Mv, args.tau).item()
            val_treff = treffrate(val_logits, Vv, Mv)
        linje = (
            f"epoke {epoke + 1}/{args.epoker}: tap {sum_tap / max(1, biter):.4f} "
            f"val-tap {val_tap:.4f} val-treff {100 * val_treff:.1f} %"
        )
        print(linje)
        logg.write(linje + "\n")
        if val_treff > beste:
            beste = val_treff
            siden_beste = 0
            skriv_vekter(args.ut, modell)
            logg.write(f"  lagret (beste treff {100 * beste:.1f} %)\n")
        else:
            siden_beste += 1
            if siden_beste >= args.taal:
                linje = f"tidlig stopp: {args.taal} epoker uten framgang (beste {100 * beste:.1f} %)"
                print(linje)
                logg.write(linje + "\n")
                break

    logg.write(f"=== ferdig, beste val-treff {100 * beste:.1f} % ===\n")
    logg.close()
    print(f"Ferdig. Beste val-treff {100 * beste:.1f} % → {args.ut}")


if __name__ == "__main__":
    main()
