#!/usr/bin/env python3
"""
HÅNDVURDERINGSTRENER – hånd (+ budhistorikk, + posisjon) → forventede lagstikk.

    ~/Arvind-Lora/.venv/bin/python verktoy/hand-tren.py \
        --data hand-data --holdoutmappe hand-data \
        --kjor "hand-a:hand-data:256,128" --kjor "hand-b:hand-data:512,256,128" \
        --utmappe e1-modell --logg analyse/hand-tren.jsonl

SAMME MASKINERI SOM `verktoy/sd-tren.py`, med vilje: giv-delt holdout (ett sted,
`er_holdout`, med hard stopp hvis ett eneste frø havner i begge deler),
forhåndsallokerte numpy-arrayer så minnet er forutsigbart, flere kjøringer på
én innlesing, og appens binærformat ut. Det som er BYTTET er de tre tingene
oppgaven faktisk er en annen:

1. FASITEN ER ET TALL, IKKE EN VEKTOR. Målet er SD-orakelets lagstikk for
   setet (`analyserGiv().sd[sete]`), ikke en verdi per kort. Nettet har derfor
   ÉN utgang, tapet er kvadratfeil, og det finnes ingen maske og ingen softmax.

2. KRITERIET ER KORRELASJONEN, ikke angeren. Referansepunktet er målt og står
   i `analyse/budgrense.txt`: den samplende, lovlige estimatoren (8–24
   rollouts) korrelerer r = 0,31 med orakelet. Slår nettet 0,31, ser det mer
   enn å sample gjør. Modellen som lagres er den med lavest holdout-MSE –
   det er tapet den optimerer – men r logges hver epoke, for det er det tallet
   som skal sammenlignes.

3. INGEN STILLINGSVEKT. I sd-tren.py vektes en stilling med spennet mellom
   beste og verste kort, fordi et valg mellom to like kort ikke betyr noe.
   Her er hver rad ett tall og alle rader er like viktige.

TAKET PÅ HVA SOM KAN LÆRES. Fasiten avhenger av de 40 kortene setet ikke ser.
En lovlig estimator kan derfor ikke nå r = 1 uansett hvor stort nettet er:
den beste mulige er E[SD | det setet ser], og dens korrelasjon er
std(E[SD|sett]) / std(SD). Et nett som slutter å forbedre seg har derfor ikke
nødvendigvis for få parametre – det kan ha truffet informasjonsgrensen. Det er
nettopp den forskjellen målingen skal avgjøre, så gapet mellom
`tren_tap` og `hold_tap` logges eksplisitt.
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

TREKK_DIM = 105  # src/moe2/handtrekk.ts – HAND_DIM


# --- Innlesing --------------------------------------------------------------


def tell_linjer(fil: str) -> int:
    """Antall linjeskift i filen. Trengs for å allokere numpy-arrayene én gang."""
    n = 0
    with open(fil, "rb") as f:
        while True:
            blokk = f.read(1 << 26)
            if not blokk:
                return n
            n += blokk.count(b"\n")


def les(mapper):
    """Alle `skard-*.jsonl` i `mapper` → (X, Y, FRO, SETE, KILDE)."""
    filer = []
    for i, mappe in enumerate(mapper):
        f = sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl")))
        if not f:
            raise SystemExit(f"Fant ingen skard-*.jsonl i {mappe}")
        filer += [(i, x) for x in f]

    t0 = time.time()
    tak = 0
    for _, f in filer:
        tak += tell_linjer(f)
    print(f"Teller {tak} linjer i {len(filer)} filer ({time.time() - t0:.0f}s)", flush=True)

    X = numpy.zeros((tak, TREKK_DIM), dtype=numpy.float32)
    Y = numpy.zeros(tak, dtype=numpy.float32)
    FRO = numpy.zeros(tak, dtype=numpy.int64)
    SETE = numpy.zeros(tak, dtype=numpy.int8)
    KILDE = numpy.zeros(tak, dtype=numpy.int8)

    n = 0
    ugyldig = 0
    fullt = False
    for kilde, fil in filer:
        if fullt:
            break
        foer = n
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                if n >= tak:
                    # Filene vokste mellom tellingen og innlesingen – typisk
                    # fordi datagenereringen fortsatt kjører. Å stoppe her er
                    # riktigere enn å vokse arrayene under seg: utvalget blir
                    # da et prefiks av hver fil, ikke en tilfeldig blanding.
                    print("  ... filene vokste under innlesingen; leser ikke mer", flush=True)
                    fullt = True
                    break
                linje = linje.strip()
                if not linje:
                    continue
                try:
                    r = json.loads(linje)
                except json.JSONDecodeError:
                    ugyldig += 1  # siste linje kan være halvskrevet
                    continue
                t = r.get("t")
                if not t or len(t) != TREKK_DIM or "y" not in r:
                    ugyldig += 1
                    continue
                X[n] = t
                Y[n] = r["y"]
                FRO[n] = r["frø"]
                SETE[n] = r.get("s", 0)
                KILDE[n] = kilde
                n += 1
        print(f"  {fil}: {n - foer} rader (totalt {n})", flush=True)

    print(f"Leste {n} rader, hoppet over {ugyldig} ugyldige ({time.time() - t0:.0f}s)", flush=True)
    return X[:n], Y[:n], FRO[:n], SETE[:n], KILDE[:n]


def er_holdout(froe: int, hfroe: int, andel: float) -> bool:
    """Holdout-regelen, ETT sted – ordrett den samme som i verktoy/sd-tren.py.
    Hashen tas av (holdoutfrø, partifrø), så avgjørelsen for én giv er
    uavhengig av hvilke andre giver som finnes. To rader fra samme giv deler
    alle fire hender og hele fasiten; en radvis deling ville lekket."""
    h = hashlib.md5(f"{hfroe}:{froe}".encode("utf-8")).digest()[:4]
    return int.from_bytes(h, "big") < int(andel * (1 << 32))


def dump_holdout(mappe: str, ut: str, hfroe: int, andel: float) -> None:
    """Skriv holdout-linjene ut som en egen benkemappe. Linjene kopieres RÅTT."""
    import re

    os.makedirs(ut, exist_ok=True)
    monster = re.compile(r'"frø":(\d+)')
    n = 0
    for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
        beholdt = []
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                m = monster.search(linje)
                if m is None:
                    continue
                if er_holdout(int(m.group(1)), hfroe, andel):
                    beholdt.append(linje if linje.endswith("\n") else linje + "\n")
        with open(os.path.join(ut, os.path.basename(fil)), "w", encoding="utf-8") as f:
            f.writelines(beholdt)
        n += len(beholdt)
        print(f"  {fil}: {len(beholdt)} holdout-linjer", flush=True)
    print(f"Skrev {n} holdout-rader til {ut}/", flush=True)


# --- Nett, tap og mål -------------------------------------------------------


class HandNett(nn.Module):
    """MLP, ReLU på alle lag unntatt det siste – samme form appens loader
    forventer, og samme klasse som E1/SD bortsett fra at siste lag har ÉN
    utgang og at den utgangen er et tall og ikke en logit."""

    def __init__(self, dims):
        super().__init__()
        self.lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])

    def forward(self, x):
        for i, l in enumerate(self.lag):
            x = l(x)
            if i < len(self.lag) - 1:
                x = torch.relu(x)
        return x.squeeze(-1)


@torch.no_grad()
def maal_i_biter(modell, X, Y, idx, batch: int = 65536):
    """MSE, MAE og Pearson-r over `idx`, i biter."""
    n = idx.numel()
    sum_kv = 0.0
    sum_abs = 0.0
    sa = 0.0
    sb = 0.0
    saa = 0.0
    sbb = 0.0
    sab = 0.0
    for i in range(0, n, batch):
        j = idx[i : i + batch]
        p = modell(X[j])
        y = Y[j]
        d = p - y
        sum_kv += (d * d).sum().item()
        sum_abs += d.abs().sum().item()
        sa += p.sum().item()
        sb += y.sum().item()
        saa += (p * p).sum().item()
        sbb += (y * y).sum().item()
        sab += (p * y).sum().item()
    ma, mb = sa / n, sb / n
    kov = sab / n - ma * mb
    va = max(saa / n - ma * ma, 0.0)
    vb = max(sbb / n - mb * mb, 0.0)
    r = 0.0 if va <= 0 or vb <= 0 else kov / (va**0.5 * vb**0.5)
    return sum_kv / n, sum_abs / n, r


def skriv_vekter(sti: str, modell: HandNett) -> None:
    """Appens format: antall nett, per nett antall lag, per lag inn/ut/vekter/bias."""
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())


# --- Hovedløkke -------------------------------------------------------------


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="hand-data", help="alle mapper som skal leses inn")
    p.add_argument("--holdoutmappe", default="hand-data", help="holdouten trekkes BARE herfra")
    p.add_argument("--holdoutandel", type=float, default=0.05, help="andel GIVER i holdout")
    p.add_argument("--holdoutfroe", type=int, default=20260726, help="frø for giv-delingen")
    p.add_argument(
        "--kjor",
        action="append",
        default=[],
        help="«navn:mappe[,mappe]:skjult[,skjult]» – én treningskjøring. Kan gjentas.",
    )
    p.add_argument("--utmappe", default="e1-modell")
    p.add_argument("--logg", default="analyse/hand-tren.jsonl")
    p.add_argument("--epoker", type=int, default=60)
    p.add_argument("--batch", type=int, default=4096)
    p.add_argument("--lr", type=float, default=2e-3)
    p.add_argument("--wd", type=float, default=0.0)
    p.add_argument("--taal", type=int, default=8)
    p.add_argument("--tremaal", type=int, default=200000, help="rader treningstapet måles på")
    p.add_argument("--dumpholdout", default="", help="skriv holdout-linjene til denne mappen og avslutt")
    args = p.parse_args()

    if args.dumpholdout and not args.kjor:
        dump_holdout(args.holdoutmappe, args.dumpholdout, args.holdoutfroe, args.holdoutandel)
        return

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Enhet: {enhet}" + (f" ({torch.cuda.get_device_name(0)})" if enhet == "cuda" else ""))

    mapper = [m for m in args.data.split(",") if m]
    if args.holdoutmappe not in mapper:
        raise SystemExit(f"--holdoutmappe {args.holdoutmappe} er ikke blant --data {mapper}")

    X, Y, FRO, SETE, KILDE = les(mapper)
    n = X.shape[0]
    if n < 1000:
        raise SystemExit(f"For lite data ({n} rader)")

    rapport = {"mapper": {}, "froebaand": {}, "fasit": {}}
    for i, m in enumerate(mapper):
        idx = KILDE == i
        rapport["mapper"][m] = {"rader": int(idx.sum()), "givere": int(len(numpy.unique(FRO[idx])))}
        rapport["froebaand"][m] = [int(FRO[idx].min()), int(FRO[idx].max())]
    rapport["fasit"] = {
        "snitt": float(Y.mean()),
        "std": float(Y.std()),
        "min": float(Y.min()),
        "maks": float(Y.max()),
    }
    # Nullmodellen: gjett snittet alltid. Alt et nett gjør må måles mot den,
    # ellers ser en MSE på 2,5 imponerende ut uten å være det.
    rapport["nullmodell_mse"] = float(((Y - Y.mean()) ** 2).mean())
    print("\n=== DATA ===")
    print(json.dumps(rapport, ensure_ascii=False, indent=2))

    # --- GIV-DELING ---------------------------------------------------------
    hm = mapper.index(args.holdoutmappe)
    kandidatfroe = numpy.unique(FRO[KILDE == hm])
    hold_froe = {f for f in kandidatfroe.tolist() if er_holdout(f, args.holdoutfroe, args.holdoutandel)}
    er_hold = numpy.isin(FRO, numpy.fromiter(hold_froe, dtype=numpy.int64, count=len(hold_froe)))
    er_hold &= KILDE == hm
    hold_idx_np = numpy.flatnonzero(er_hold)

    # INVARIANTEN: ingen giv i to deler. Sjekkes, ikke antas.
    tren_froe = set(FRO[~er_hold].tolist())
    krysning = hold_froe & tren_froe
    if krysning:
        raise SystemExit(
            f"GIV-LEKKASJE: {len(krysning)} frø ligger i både trening og holdout "
            f"(f.eks. {sorted(krysning)[:5]}). Avbryter."
        )
    print(
        f"\nGiv-deling: {len(hold_froe)} av {len(kandidatfroe)} givere i {args.holdoutmappe} "
        f"→ holdout ({len(hold_idx_np)} rader). Ingen giv i to deler."
    )
    rapport["holdout"] = {
        "mappe": args.holdoutmappe,
        "givere": len(hold_froe),
        "givere_totalt": int(len(kandidatfroe)),
        "rader": int(len(hold_idx_np)),
        "andel": args.holdoutandel,
        "froe": args.holdoutfroe,
        "krysning": 0,
    }

    Xg = torch.from_numpy(X).to(enhet)
    Yg = torch.from_numpy(Y).to(enhet)
    del X
    hold_idx = torch.from_numpy(hold_idx_np).to(enhet)

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(
        json.dumps({"type": "data", "tid": time.strftime("%Y-%m-%d %H:%M:%S"), **rapport}, ensure_ascii=False)
        + "\n"
    )

    for spek in args.kjor:
        navn, mix, skjult = spek.split(":")
        mix_mapper = [m for m in mix.split(",") if m]
        mix_idx = [mapper.index(m) for m in mix_mapper]
        tren_maske = numpy.isin(KILDE, numpy.array(mix_idx, dtype=numpy.int8)) & ~er_hold
        tren_idx = torch.from_numpy(numpy.flatnonzero(tren_maske)).to(enhet)
        dims = [TREKK_DIM] + [int(x) for x in skjult.split(",")] + [1]
        modell = HandNett(dims).to(enhet)
        antall = sum(q.numel() for q in modell.parameters())
        ut = os.path.join(args.utmappe, f"{navn}.bin")
        print(
            f"\n=== {navn}: {'+'.join(mix_mapper)}, {' → '.join(str(d) for d in dims)} "
            f"({antall} parametre) – trening {tren_idx.numel()}, holdout {hold_idx.numel()} ==="
        )
        logg.write(
            json.dumps(
                {
                    "type": "start",
                    "navn": navn,
                    "mix": mix_mapper,
                    "dims": dims,
                    "parametre": antall,
                    "trening": int(tren_idx.numel()),
                    "holdout": int(hold_idx.numel()),
                    "tid": time.strftime("%Y-%m-%d %H:%M:%S"),
                },
                ensure_ascii=False,
            )
            + "\n"
        )

        g = torch.Generator(device="cpu").manual_seed(7)
        tm = tren_idx[torch.randperm(tren_idx.numel(), generator=g)[: args.tremaal].to(enhet)]

        opt = torch.optim.AdamW(modell.parameters(), lr=args.lr, weight_decay=args.wd)
        plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)
        beste = float("inf")
        beste_epoke = 0
        beste_r = 0.0
        siden = 0
        for epoke in range(args.epoker):
            modell.train()
            perm = torch.randperm(tren_idx.numel(), device=enhet)
            sum_tap = 0.0
            biter = 0
            for i in range(0, tren_idx.numel(), args.batch):
                j = tren_idx[perm[i : i + args.batch]]
                tap = ((modell(Xg[j]) - Yg[j]) ** 2).mean()
                opt.zero_grad(set_to_none=True)
                tap.backward()
                opt.step()
                sum_tap += tap.item()
                biter += 1
            plan.step()
            modell.eval()
            tr_mse, tr_mae, tr_r = maal_i_biter(modell, Xg, Yg, tm)
            ho_mse, ho_mae, ho_r = maal_i_biter(modell, Xg, Yg, hold_idx)
            rad = {
                "type": "epoke",
                "navn": navn,
                "epoke": epoke + 1,
                "tren_tap": round(sum_tap / max(1, biter), 5),
                "tren_mse": round(tr_mse, 5),
                "hold_mse": round(ho_mse, 5),
                "gap": round(ho_mse - tr_mse, 5),
                "tren_r": round(tr_r, 5),
                "hold_r": round(ho_r, 5),
                "hold_mae": round(ho_mae, 5),
            }
            print(
                f"epoke {epoke + 1}/{args.epoker}: tren-mse {tr_mse:.4f} hold-mse {ho_mse:.4f} "
                f"(gap {ho_mse - tr_mse:+.4f})  tren-r {tr_r:.4f} hold-r {ho_r:.4f} "
                f"hold-mae {ho_mae:.4f}",
                flush=True,
            )
            if ho_mse < beste:
                beste = ho_mse
                beste_r = ho_r
                beste_epoke = epoke + 1
                siden = 0
                skriv_vekter(ut, modell)
                rad["lagret"] = True
            else:
                siden += 1
            logg.write(json.dumps(rad, ensure_ascii=False) + "\n")
            if siden >= args.taal:
                print(f"tidlig stopp: {args.taal} epoker uten framgang (beste {beste:.4f})")
                break
        print(
            f"{navn} ferdig: beste hold-mse {beste:.4f} (r {beste_r:.4f}) på epoke {beste_epoke} → {ut}\n"
            f"  nullmodellen (gjett snittet) har mse {rapport['nullmodell_mse']:.4f}"
        )
        logg.write(
            json.dumps(
                {
                    "type": "ferdig",
                    "navn": navn,
                    "beste_hold_mse": round(beste, 5),
                    "beste_hold_r": round(beste_r, 5),
                    "nullmodell_mse": round(rapport["nullmodell_mse"], 5),
                    "beste_epoke": beste_epoke,
                    "fil": ut,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        del modell, opt
        if enhet == "cuda":
            torch.cuda.empty_cache()

    logg.close()


if __name__ == "__main__":
    main()
