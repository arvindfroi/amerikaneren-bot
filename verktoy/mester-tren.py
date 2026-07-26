#!/usr/bin/env python3
"""
MESTER-KLONEN: atferdskloning av MesterAI, med giv-delt holdout.

    ~/Arvind-Lora/.venv/bin/python verktoy/mester-tren.py \
        --data mester-data --kjor "mk-256:256,256" --kjor "mk-384:384,256" \
        --utmappe e1-modell --logg analyse/mester-tren.jsonl

HVA SOM SKILLER DENNE FRA `verktoy/sd-tren.py`, og hvorfor den ikke bare er et
flagg der:

1. FASITEN ER ET VALG, IKKE EN VERDIVEKTOR. sd-tren.py lærer mot
   `softmax(v/τ)` over SD-verdiene til alle lovlige kort. Her finnes det bare
   ett tall per stilling – kortet MesterAI spilte – og tapet er hard
   kryssentropi mot det, maskert til de lovlige kortene. Å presse en
   én-punkts-fasit gjennom det myke tapet ville gitt `softmax([1,0,0,…])`,
   altså en fasit som sier at det valgte kortet er 2,7 ganger så sannsynlig
   som de andre. Det er ikke det MesterAI gjorde.

2. MÅLET ER TROSKAP, IKKE STYRKE. Kriteriet for beste sjekkpunkt er
   HOLDOUT-TREFF: hvor ofte klonen velger samme kort som MesterAI. «Anger»
   finnes ikke og kan ikke regnes – vi har ingen verdi for kortene som ikke
   ble spilt. En klone som spiller BEDRE enn MesterAI er en DÅRLIGERE klone,
   og skal ikke belønnes av noe her.

3. TAKET MÅLES. MesterAIs søk sampler verdener og er tidsbudsjettert; spør du
   to ganger i samme stilling får du ikke alltid samme svar. `mester-orakel.ts`
   logger derfor et andre svar (`k2`) i en andel av stillingene, og denne
   treneren rapporterer selvenigheten som TAK. En treffprosent skal alltid
   leses mot det taket, aldri mot 100 %.

ALT ANNET er hentet direkte fra `verktoy/sd-tren.py` – innlesingen i
ferdigallokerte numpy-array, giv-delingen (`er_holdout`), nettformen (`E1Nett`)
og vektformatet (`skriv_vekter`). De importeres, de kopieres ikke: to
implementasjoner av holdout-regelen er nøyaktig den klassen feil som ga dette
prosjektet et falskt positivt før.
"""

import argparse
import glob
import importlib.util
import json
import os
import time

import numpy
import torch
import torch.nn.functional as F

# --- Gjenbruk av sd-tren.py -------------------------------------------------
# Filnavnet har bindestrek og kan ikke importeres med `import`. Modulen kjører
# ingenting ved import (main er bak __main__-vakten), så dette er trygt.
_STI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sd-tren.py")
_spek = importlib.util.spec_from_file_location("sdtren", _STI)
assert _spek is not None and _spek.loader is not None
sdtren = importlib.util.module_from_spec(_spek)
_spek.loader.exec_module(sdtren)

TREKK_DIM = sdtren.TREKK_DIM  # 273
KORT = sdtren.KORT  # 52


# --- Innlesing --------------------------------------------------------------


def les(mapper: list[str]):
    """Alle `skard-*.jsonl` i `mapper` → (X, K, M, FRO, KILDE, SIG, tak).

    `tak` er (enige, sjekkede) fra `k2`-feltene: MesterAIs enighet med seg selv
    i nøyaktig samme stilling. `KN` er NevroHjernes valg i samme stilling –
    nullpunktet enhver troskap skal leses mot.
    """
    filer: list[tuple[int, str]] = []
    for i, mappe in enumerate(mapper):
        f = sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl")))
        if not f:
            raise SystemExit(f"Fant ingen skard-*.jsonl i {mappe}")
        filer += [(i, x) for x in f]

    t0 = time.time()
    tak_linjer = 0
    for _, f in filer:
        tak_linjer += sdtren.tell_linjer(f)
    print(f"Teller {tak_linjer} linjer i {len(filer)} filer ({time.time() - t0:.0f}s)", flush=True)
    # 5 % slingringsmonn fordi filene KAN vokse mens de leses: generatorene
    # skriver linje for linje til de samme filene, og en måling som skal kunne
    # kjøres på et datasett under produksjon må tåle det. Blir arrayene likevel
    # fulle, stopper innlesingen der – da leses et prefiks, ikke feil data.
    tak_linjer = int(tak_linjer * 1.05) + 1000

    X = numpy.zeros((tak_linjer, TREKK_DIM), dtype=numpy.float32)
    K = numpy.zeros(tak_linjer, dtype=numpy.int64)
    KN = numpy.full(tak_linjer, -1, dtype=numpy.int64)
    NLOV = numpy.zeros(tak_linjer, dtype=numpy.int16)
    M = numpy.zeros((tak_linjer, KORT), dtype=numpy.float32)
    FRO = numpy.zeros(tak_linjer, dtype=numpy.int64)
    STIKK = numpy.zeros(tak_linjer, dtype=numpy.int16)
    KILDE = numpy.zeros(tak_linjer, dtype=numpy.int8)
    SIG = numpy.zeros(tak_linjer, dtype=numpy.uint64)

    sett: set[int] = set()
    n = 0
    dublett = 0
    ugyldig = 0
    selv_n = 0
    selv_enig = 0
    for kilde, fil in filer:
        foer = n
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                if n >= tak_linjer:
                    break
                linje = linje.strip()
                if not linje:
                    continue
                s = sdtren.sig64(linje)
                if s in sett:
                    dublett += 1
                    continue
                try:
                    r = json.loads(linje)
                except json.JSONDecodeError:
                    ugyldig += 1  # siste linje kan være halvskrevet
                    continue
                t = r.get("t")
                k = r.get("k")
                lov = r.get("lov")
                if not t or k is None or not lov or len(t) != TREKK_DIM:
                    ugyldig += 1
                    continue
                if len(lov) < 2 or k not in lov:
                    # Ett lovlig kort bærer ingen informasjon, og en fasit
                    # utenfor masken er en feil vi ikke skal trene på.
                    ugyldig += 1
                    continue
                sett.add(s)
                X[n] = t
                K[n] = k
                KN[n] = r.get("kn", -1)
                NLOV[n] = len(lov)
                for i in lov:
                    M[n, i] = 1.0
                FRO[n] = r["frø"]
                STIKK[n] = r.get("stikk", -1)
                KILDE[n] = kilde
                SIG[n] = s
                if "k2" in r:
                    selv_n += 1
                    if r["k2"] == k:
                        selv_enig += 1
                n += 1
        print(f"  {fil}: {n - foer} stillinger (totalt {n})", flush=True)

    print(
        f"Leste {n} stillinger, hoppet over {dublett} dubletter og {ugyldig} ugyldige/uinformative "
        f"({time.time() - t0:.0f}s)",
        flush=True,
    )
    return (
        X[:n], K[:n], KN[:n], NLOV[:n], M[:n], FRO[:n], STIKK[:n], KILDE[:n], SIG[:n],
        (selv_enig, selv_n),
    )


def maalestokk(K, KN, NLOV, STIKK, tak: tuple[int, int], idx) -> dict:
    """De to tallene enhver treffprosent skal leses mellom, pluss gulvet.

    TAK   – MesterAI mot seg selv i samme stilling (`k2`).
    NULL  – NevroHjerne mot MesterAI (`kn`). Dagens motstandermodell i SD.
    GULV  – uniformt tilfeldig blant de lovlige kortene, 1/|lovlige| i snitt.

    Uten alle tre er en treffprosent uleselig: 70 % er en triumf hvis gulvet er
    28 % og nullpunktet 40 %, og bortkastet arbeid hvis nullpunktet er 65 % og
    taket 77 %.
    """
    selv_enig, selv_n = tak
    kn = KN[idx]
    har = kn >= 0
    nevro_treff = float((kn[har] == K[idx][har]).mean()) if har.any() else float("nan")
    gulv = float((1.0 / NLOV[idx].astype(numpy.float64)).mean())
    ut = {
        "gulv_uniformt": gulv,
        "nullpunkt_nevro": nevro_treff,
        "nullpunkt_n": int(har.sum()),
        "tak_selvenighet": (selv_enig / selv_n) if selv_n else float("nan"),
        "tak_n": int(selv_n),
    }
    # Brutt ned på hvor mange kort som faktisk var lovlige. Enighet med to
    # lovlige kort er nesten myntkast; enighet med åtte er informasjon. Et
    # samletall skjuler den forskjellen fullstendig.
    per_lov: dict[str, list[float | int]] = {}
    for b in [2, 3, 4, 5, 6, 7]:
        m = (NLOV[idx] == b) & har
        if int(m.sum()) >= 50:
            per_lov[str(b)] = [float((kn[m] == K[idx][m]).mean()), 1.0 / b, int(m.sum())]
    m = (NLOV[idx] >= 8) & har
    if int(m.sum()) >= 50:
        per_lov["8+"] = [
            float((kn[m] == K[idx][m]).mean()),
            float((1.0 / NLOV[idx][m].astype(numpy.float64)).mean()),
            int(m.sum()),
        ]
    ut["nevro_per_lovlige"] = per_lov
    per_stikk: dict[str, list[float | int]] = {}
    for s in range(0, 13):
        m = (STIKK[idx] == s) & har
        if int(m.sum()) < 50:
            continue
        per_stikk[str(s)] = [float((kn[m] == K[idx][m]).mean()), int(m.sum())]
    ut["nevro_per_stikk"] = per_stikk
    return ut


# --- Tap og mål -------------------------------------------------------------


def maskert_ce(logits, k, maske):
    """Hard kryssentropi mot det valgte kortet, maskert til lovlige kort."""
    stor_negativ = torch.finfo(logits.dtype).min
    logits = logits.masked_fill(maske == 0, stor_negativ)
    return F.cross_entropy(logits, k)


@torch.no_grad()
def maal_i_biter(modell, X, K, M, idx, batch: int = 65536):
    """(tap, treff) over `idx`. Treff = argmax blant lovlige = MesterAIs kort."""
    stor_negativ = torch.finfo(torch.float32).min
    sum_tap = 0.0
    sum_treff = 0.0
    n = idx.numel()
    for i in range(0, n, batch):
        j = idx[i : i + batch]
        logits = modell(X[j])
        sum_tap += maskert_ce(logits, K[j], M[j]).item() * j.numel()
        valgt = logits.masked_fill(M[j] == 0, stor_negativ).argmax(dim=1)
        sum_treff += (valgt == K[j]).float().sum().item()
    return sum_tap / n, sum_treff / n


@torch.no_grad()
def treff_per_stikk(modell, X, K, M, STIKK_g, idx, batch: int = 65536):
    """Treffprosent brutt ned på stikknummer – der SD-fasiten er svakest er
    også klonens troskap mest verdt å vite."""
    stor_negativ = torch.finfo(torch.float32).min
    teller: dict[int, list[int]] = {}
    for i in range(0, idx.numel(), batch):
        j = idx[i : i + batch]
        logits = modell(X[j])
        valgt = logits.masked_fill(M[j] == 0, stor_negativ).argmax(dim=1)
        ok = (valgt == K[j]).cpu().numpy()
        st = STIKK_g[j].cpu().numpy()
        for s, o in zip(st.tolist(), ok.tolist()):
            rad = teller.setdefault(int(s), [0, 0])
            rad[0] += int(o)
            rad[1] += 1
    return {s: (a, b) for s, (a, b) in sorted(teller.items())}


# --- Hovedløkke -------------------------------------------------------------


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="mester-data", help="mapper som skal leses inn")
    p.add_argument("--holdoutmappe", default="mester-data")
    p.add_argument("--holdoutandel", type=float, default=0.08, help="andel GIVER i holdout")
    p.add_argument("--holdoutfroe", type=int, default=20260726, help="frø for giv-delingen")
    p.add_argument("--kjor", action="append", default=[], help="«navn:skjult[,skjult]»")
    p.add_argument("--utmappe", default="e1-modell")
    p.add_argument("--logg", default="analyse/mester-tren.jsonl")
    p.add_argument("--epoker", type=int, default=40)
    p.add_argument("--batch", type=int, default=1024)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--wd", type=float, default=0.0)
    p.add_argument("--taal", type=int, default=6)
    p.add_argument("--tremaal", type=int, default=200000)
    p.add_argument(
        "--barestatistikk",
        action="store_true",
        help="skriv målestokken (gulv/nullpunkt/tak) og avslutt – ingen trening, ingen GPU",
    )
    args = p.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Enhet: {enhet}" + (f" ({torch.cuda.get_device_name(0)})" if enhet == "cuda" else ""))

    mapper = [m for m in args.data.split(",") if m]
    if args.holdoutmappe not in mapper:
        raise SystemExit(f"--holdoutmappe {args.holdoutmappe} er ikke blant --data {mapper}")

    X, K, KN, NLOV, M, FRO, STIKK, KILDE, SIG, (selv_enig, selv_n) = les(mapper)
    n = X.shape[0]
    if n < 1000:
        raise SystemExit(f"For lite data ({n} stillinger)")

    # MÅLESTOKKEN. Skrives ut FØR treningen, så ingen treffprosent kan leses
    # uten den. Regnes over HELE settet her; den giv-delte holdouten får sin
    # egen like under, og de to skal ligne hverandre.
    tak = selv_enig / selv_n if selv_n else float("nan")
    se_tak = (tak * (1 - tak) / selv_n) ** 0.5 if selv_n else float("nan")
    alle = numpy.arange(n)
    ms = maalestokk(K, KN, NLOV, STIKK, (selv_enig, selv_n), alle)
    print("\n=== MÅLESTOKKEN (hele settet) ===")
    print(f"  GULV  uniformt lovlig valg      {100 * ms['gulv_uniformt']:.1f} %")
    print(
        f"  NULL  NevroHjerne mot MesterAI   {100 * ms['nullpunkt_nevro']:.1f} % "
        f"(n = {ms['nullpunkt_n']})   <- dagens motstandermodell i SD"
    )
    print(f"  TAK   MesterAI mot seg selv      {100 * tak:.1f} % ± {100 * se_tak:.1f} (n = {selv_n})")
    print("  En klone kan ikke treffe MesterAI oftere enn MesterAI treffer seg selv,")
    print("  og er verdiløs som BYTTE hvis den ikke slår nullpunktet klart.\n")
    print("  NevroHjernes enighet etter antall lovlige kort (enighet, gulv, n):")
    for b, (e, g, m) in ms["nevro_per_lovlige"].items():
        print(f"    {b:>3} lovlige: {100 * e:5.1f} %   gulv {100 * g:5.1f} %   n = {m}")
    print("  NevroHjernes enighet per stikk:")
    print(
        "    "
        + ", ".join(f"{s}: {100 * e:.0f} % (n={m})" for s, (e, m) in ms["nevro_per_stikk"].items())
    )
    print()

    if args.barestatistikk:
        os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
        with open(args.logg, "a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"type": "maalestokk", "tid": time.strftime("%Y-%m-%d %H:%M:%S"),
                     "stillinger": int(n), "givere": int(len(numpy.unique(FRO))), **ms},
                    ensure_ascii=False,
                )
                + "\n"
            )
        return

    # --- GIV-DELING (samme regel som sd-tren.py, importert) -----------------
    hm = mapper.index(args.holdoutmappe)
    kandidatfroe = numpy.unique(FRO[KILDE == hm])
    hold_froe = {
        f for f in kandidatfroe.tolist() if sdtren.er_holdout(f, args.holdoutfroe, args.holdoutandel)
    }
    er_hold = numpy.isin(FRO, numpy.fromiter(hold_froe, dtype=numpy.int64, count=len(hold_froe)))
    er_hold &= KILDE == hm
    hold_idx_np = numpy.flatnonzero(er_hold)

    tren_froe = set(FRO[~er_hold].tolist())
    krysning = hold_froe & tren_froe
    if krysning:
        raise SystemExit(
            f"GIV-LEKKASJE: {len(krysning)} frø ligger i både trening og holdout "
            f"(f.eks. {sorted(krysning)[:5]}). Avbryter."
        )
    print(
        f"Giv-deling: {len(hold_froe)} av {len(kandidatfroe)} givere → holdout "
        f"({len(hold_idx_np)} stillinger). Ingen giver i to deler."
    )
    # Nullpunktet MÅLT PÅ HOLDOUTEN, altså på nøyaktig de stillingene klonens
    # treffprosent regnes på. Det er den eneste sammenligningen som er gyldig.
    hold_ms = maalestokk(K, KN, NLOV, STIKK, (selv_enig, selv_n), hold_idx_np)
    nevro_hold = hold_ms["nullpunkt_nevro"]
    print(
        f"  Nullpunkt på HOLDOUTEN: NevroHjerne treffer MesterAI "
        f"{100 * nevro_hold:.2f} % (n = {hold_ms['nullpunkt_n']}), "
        f"gulv {100 * hold_ms['gulv_uniformt']:.2f} %\n"
    )

    Xg = torch.from_numpy(X).to(enhet)
    Kg = torch.from_numpy(K).to(enhet)
    Mg = torch.from_numpy(M).to(enhet)
    Sg = torch.from_numpy(STIKK.astype(numpy.int64)).to(enhet)
    del X, K, M
    hold_idx = torch.from_numpy(hold_idx_np).to(enhet)
    tren_idx = torch.from_numpy(numpy.flatnonzero(~er_hold)).to(enhet)

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(
        json.dumps(
            {
                "type": "start-innlesing",
                "tid": time.strftime("%Y-%m-%d %H:%M:%S"),
                "stillinger": int(n),
                "givere": int(len(numpy.unique(FRO))),
                "holdout_givere": len(hold_froe),
                "holdout_stillinger": int(len(hold_idx_np)),
                "selvenighet": {"enige": selv_enig, "n": selv_n, "andel": tak},
                "maalestokk_alle": ms,
                "maalestokk_holdout": hold_ms,
            },
            ensure_ascii=False,
        )
        + "\n"
    )

    for spek in args.kjor:
        navn, skjult = spek.split(":")
        dims = [TREKK_DIM] + [int(x) for x in skjult.split(",")] + [KORT]
        modell = sdtren.E1Nett(dims).to(enhet)
        antall = sum(q.numel() for q in modell.parameters())
        ut = os.path.join(args.utmappe, f"{navn}.bin")
        print(
            f"\n=== {navn}: {' → '.join(str(d) for d in dims)} ({antall} parametre) – "
            f"trening {tren_idx.numel()}, holdout {hold_idx.numel()} ==="
        )
        logg.write(
            json.dumps(
                {"type": "start", "navn": navn, "dims": dims, "parametre": antall,
                 "trening": int(tren_idx.numel()), "holdout": int(hold_idx.numel()),
                 "tid": time.strftime("%Y-%m-%d %H:%M:%S")},
                ensure_ascii=False,
            )
            + "\n"
        )

        g = torch.Generator(device="cpu").manual_seed(7)
        tm = tren_idx[torch.randperm(tren_idx.numel(), generator=g)[: args.tremaal].to(enhet)]

        opt = torch.optim.AdamW(modell.parameters(), lr=args.lr, weight_decay=args.wd)
        plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)
        beste = -1.0
        beste_epoke = 0
        siden = 0
        for epoke in range(args.epoker):
            modell.train()
            perm = torch.randperm(tren_idx.numel(), device=enhet)
            sum_tap = 0.0
            biter = 0
            for i in range(0, tren_idx.numel(), args.batch):
                j = tren_idx[perm[i : i + args.batch]]
                tap = maskert_ce(modell(Xg[j]), Kg[j], Mg[j])
                opt.zero_grad(set_to_none=True)
                tap.backward()
                opt.step()
                sum_tap += tap.item()
                biter += 1
            plan.step()
            modell.eval()
            tr_tap, tr_treff = maal_i_biter(modell, Xg, Kg, Mg, tm)
            ho_tap, ho_treff = maal_i_biter(modell, Xg, Kg, Mg, hold_idx)
            rad = {
                "type": "epoke", "navn": navn, "epoke": epoke + 1,
                "tren_tap_lopende": round(sum_tap / max(1, biter), 5),
                "tren_tap": round(tr_tap, 5), "hold_tap": round(ho_tap, 5),
                "gap": round(ho_tap - tr_tap, 5),
                "tren_treff": round(tr_treff, 5), "hold_treff": round(ho_treff, 5),
                # Troskapen som andel av det MesterAI selv klarer.
                "andel_av_tak": round(ho_treff / tak, 5) if selv_n else None,
            }
            rad["over_nevro"] = round(ho_treff - nevro_hold, 5)
            print(
                f"epoke {epoke + 1}/{args.epoker}: tren-tap {tr_tap:.4f} hold-tap {ho_tap:.4f} "
                f"(gap {ho_tap - tr_tap:+.4f})  tren-treff {100 * tr_treff:.1f} % "
                f"hold-treff {100 * ho_treff:.1f} % "
                f"(nevro {100 * nevro_hold:.1f} %, {100 * (ho_treff - nevro_hold):+.1f} pp)"
                + (f"  {100 * ho_treff / tak:.0f} % av taket" if selv_n else ""),
                flush=True,
            )
            # SJEKKPUNKTKRITERIET ER TROSKAP. Ikke tap: et nett kan bli
            # sikrere på feil kort og få bedre tap uten å ligne mer på MesterAI.
            if ho_treff > beste:
                beste = ho_treff
                beste_epoke = epoke + 1
                siden = 0
                sdtren.skriv_vekter(ut, modell)
                rad["lagret"] = True
            else:
                siden += 1
            logg.write(json.dumps(rad, ensure_ascii=False) + "\n")
            if siden >= args.taal:
                print(f"tidlig stopp: {args.taal} epoker uten framgang (beste {100 * beste:.1f} %)")
                break

        # Per stikk på det BESTE nettet er ikke tilgjengelig uten å laste det om
        # igjen; profilen tas derfor på sluttmodellen og merkes som sådan.
        profil = treff_per_stikk(modell, Xg, Kg, Mg, Sg, hold_idx)
        print(
            f"{navn} ferdig: beste hold-treff {100 * beste:.2f} % på epoke {beste_epoke} "
            f"(nevro {100 * nevro_hold:.2f} %, tak {100 * tak:.2f} %) → {ut}"
        )
        print("  treff per stikk (sluttmodell): " + ", ".join(
            f"{s}: {100 * a / b:.0f} % (n={b})" for s, (a, b) in profil.items() if b >= 50
        ))
        logg.write(
            json.dumps(
                {"type": "ferdig", "navn": navn, "beste_hold_treff": round(beste, 5),
                 "beste_epoke": beste_epoke, "tak": tak, "nullpunkt_nevro": nevro_hold,
                 "over_nevro": round(beste - nevro_hold, 5),
                 "andel_av_tak": round(beste / tak, 5) if selv_n else None,
                 "per_stikk_sluttmodell": {str(s): [a, b] for s, (a, b) in profil.items()},
                 "fil": ut},
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
