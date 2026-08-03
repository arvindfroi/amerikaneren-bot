#!/usr/bin/env python3
"""
SD-TRENER MED GIV-DELT HOLDOUT – DAgger-runde 2 (sd-r2).

    ~/Arvind-Lora/.venv/bin/python verktoy/sd-tren.py \
        --data sd-data,sd-data2 --holdoutmappe sd-data2 \
        --kjor "r2a:sd-data2:384,256" --kjor "r2b:sd-data,sd-data2:384,256" \
        --utmappe e1-modell --logg analyse/sd-r2-tren.jsonl

HVORFOR DENNE FINNES OG IKKE BARE `verktoy/e1-tren.py`. Tre ting skiller.

1. HOLDOUT DELES PÅ GIV, IKKE PÅ STILLING. e1-tren.py tar de siste 5 % av
   linjene. To stillinger fra samme parti deler alle fire hender, hele
   budrunden og hele kontrakten – en stillingsdeling lekker derfor giv-nivå
   informasjon inn i «holdout». Prosjektet har allerede fått ett falskt
   positivt av nettopp det (et ferskt, utrent nett målte «bedre enn
   NevroHjerne» på en lekk holdout). Her hashes `frø` – partifrøet, altså det
   groveste og dermed sikreste grupperingsnivået som finnes i linjene – og
   hele partier havner enten i trening eller i holdout. Skriptet STOPPER hvis
   ett eneste frø havner i begge.

2. MINNET. e1-tren.py bygger Python-lister av lister og lager tensoren til
   slutt; 273 Python-floats per rad er ~8,8 kB, altså ~27 GB for 3,1 mill.
   stillinger. Her telles linjene først, numpy-arrayene allokeres én gang, og
   hver linje skrives rett inn. Toppen blir da ~4,7 GB for hele settet.

3. FLERE KJØRINGER PÅ ÉN INNLESING. Å parse 3,1 mill. JSON-linjer tar
   minutter; å trene et 200k-parameters nett på GPU tar sekunder. Derfor
   leses dataene ÉN gang, legges på GPU ÉN gang, og hver `--kjor` velger sine
   rader med et indekstensor. Datablandinger og arkitekturer kan dermed
   sammenlignes uten at innlesingen gjentas – og, viktigere, uten at de kan
   komme til å se ulike holdouts.

TAPET, VEKTINGEN, KRITERIET OG VEKTFORMATET ER UENDRET fra e1-tren.py, med
vilje: sd-r2 skal kunne settes rett mot sd-r1 der eneste forskjell er dataene.

TAPSKURVENE. Hver epoke logges FIRE tall, ikke bare det beste:
`tren_tap_vektet` (det optimalisereren faktisk ser), `tren_tap` og `hold_tap`
(samme UVEKTEDE tap på et fast treningsutvalg og på hele holdouten, så de kan
settes i samme graf), og `hold_anger`. En kurve som skiller lag er det vi
leter etter, og den kan ikke ses hvis bare det beste tallet rapporteres.
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

# BREDDEN LESES AV DATAENE, den er ikke hardkodet lenger.
#
# `src/e1/trekk.ts` har to lovlige bredder:
#   v1  273 = 238 fra appen + 35 egne
#   v2  340 = v1 + minneblokken (eget vrak, korrigert «hva er ute»)
#
# Den hardkodede 273-en var en STUM FELLE: innlesingen hopper over hver rad
# der `len(t)` ikke stemmer, så et v2-datasett ville gitt «0 gyldige rader»
# etter timer med generering – eller, om noen senere fjernet sjekken, trent
# på feiljusterte kolonner uten å feile.
LOVLIGE_DIM = (273, 340, 356)
TREKK_DIM = None  # settes av `finn_dim()` ved innlesing
KORT = 52


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


def voks(a, rader: int):
    """`a` kopiert inn i et NULLSTILT array med `rader` rader.

    IKKE `numpy.resize`. Den fyller de nye radene med GJENTATT gammelt
    innhold i stedet for nuller, og `M` er en maske som bare skrives der
    `v` faktisk har nøkler. Gjenbrukt søppel der ville slått på tapsledd
    for kort som aldri ble målt – en feil som ikke krasjer, og derfor er
    verre enn IndexError-en den skulle fjerne.
    """
    b = numpy.zeros((rader,) + a.shape[1:], dtype=a.dtype)
    b[: a.shape[0]] = a
    return b


def sig64(linje: str) -> int:
    """De første 8 bytene av md5 som uint64 – linjesignatur for duplikat- og
    overlappsjekk. Samme rolle som hexdigest[:16] i e1-tren.py, bare som tall,
    fordi 3 mill. Python-strenger koster et par hundre megabyte mer enn 3 mill.
    heltall."""
    return int.from_bytes(hashlib.md5(linje.encode("utf-8")).digest()[:8], "big")


def les(mapper: list[str]):
    """Alle `*.jsonl` i `mapper` → (X, V, M, FRO, KILDE, SIG).

    KILDE er indeksen inn i `mapper`, så en kjøring kan velge sin egen
    delmengde uten at noe leses om igjen. SIG brukes til duplikatfjerning og
    til overlappsrapporten.

    MØNSTERET ER `*.jsonl`, IKKE `skard-*.jsonl`. Det sto `skard-*` før, og
    det var en stillegående datatapsfeil: `sd-spredt/` inneholder både
    `skard-*.jsonl` og `b-*.jsonl`, og b-filene er de STØRSTE – 152 000 av
    170 000 rader. Med `skard-*` ble de utelatt uten et eneste varsel, fordi
    «fant ingen filer»-vakten under er fornøyd så lenge ETT mønstertreff
    finnes i mappen. Treningen ville altså kjørt på en tredel av dataene og
    rapportert full suksess.
    """
    filer: list[tuple[int, str]] = []
    for i, mappe in enumerate(mapper):
        f = sorted(glob.glob(os.path.join(mappe, "*.jsonl")))
        if not f:
            raise SystemExit(f"Fant ingen *.jsonl i {mappe}")
        filer += [(i, x) for x in f]

    t0 = time.time()
    tak = 0
    for _, f in filer:
        tak += tell_linjer(f)
    print(f"Teller {tak} linjer i {len(filer)} filer ({time.time() - t0:.0f}s)", flush=True)

    # BREDDEN AVGJOERES AV DATAENE, og den maa vaere ÉN. Blandes 273 og 340 i
    # samme trening, ville halvparten av radene blitt hoppet over i stillhet -
    # nettopp den fellen den hardkodede konstanten var.
    global TREKK_DIM
    bredder: dict[int, int] = {}
    for _, f in filer:
        with open(f, "r", encoding="utf-8") as fh:
            for linje in fh:
                linje = linje.strip()
                if not linje:
                    continue
                try:
                    t = json.loads(linje).get("t")
                except json.JSONDecodeError:
                    continue
                if t:
                    bredder[len(t)] = bredder.get(len(t), 0) + 1
                    break
    if not bredder:
        raise SystemExit("Fant ingen lesbare rader med «t» i datamappene")
    if len(bredder) > 1:
        raise SystemExit(
            f"BLANDEDE TREKKBREDDER i datasettet: {bredder}. "
            "273 (v1) og 340 (v2) kan ikke trenes sammen - de 273 foerste "
            "indeksene betyr riktignok det samme, men resten ville vaert "
            "nuller uten at nettet fikk vite at de MANGLER. Del settene."
        )
    TREKK_DIM = next(iter(bredder))
    if TREKK_DIM not in LOVLIGE_DIM:
        raise SystemExit(f"Ukjent trekkbredde {TREKK_DIM}, forventet en av {LOVLIGE_DIM}")
    navn_dim = {273: 'v1', 340: 'v2 med minneblokk', 356: 'v3 med telleblokk'}[TREKK_DIM]
    print(f"Trekkbredde: {TREKK_DIM} ({navn_dim})", flush=True)

    X = numpy.zeros((tak, TREKK_DIM), dtype=numpy.float32)
    V = numpy.zeros((tak, KORT), dtype=numpy.float32)
    M = numpy.zeros((tak, KORT), dtype=numpy.float32)
    FRO = numpy.zeros(tak, dtype=numpy.int64)
    KILDE = numpy.zeros(tak, dtype=numpy.int8)
    SIG = numpy.zeros(tak, dtype=numpy.uint64)

    sett: set[int] = set()
    n = 0
    dublett = 0
    ugyldig = 0
    for kilde, fil in filer:
        foer = n
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                linje = linje.strip()
                if not linje:
                    continue
                s = sig64(linje)
                if s in sett:
                    dublett += 1
                    continue
                try:
                    r = json.loads(linje)
                except json.JSONDecodeError:
                    ugyldig += 1  # siste linje kan være halvskrevet
                    continue
                t = r.get("t")
                v = r.get("v")
                if not t or not v or len(t) != TREKK_DIM:
                    ugyldig += 1
                    continue
                if len(v) < 2:
                    ugyldig += 1
                    continue
                sett.add(s)
                # RADENE KAN VÆRE FLERE ENN TELLINGEN FANT. Skardene skriver
                # fortsatt mens treningen leser, så filene vokser mellom
                # `tell_linjer` og denne løkken. Uten dette blir det en
                # IndexError etter flere minutters innlesing – eller, om noen
                # «fikser» det med en break, stille tap av de nyeste radene.
                if n >= X.shape[0]:
                    ny = int(X.shape[0] * 1.2) + 4096
                    print(f"  (utvider {X.shape[0]} → {ny} rader; filene vokser)", flush=True)
                    X, V, M, FRO, KILDE, SIG = (voks(a, ny) for a in (X, V, M, FRO, KILDE, SIG))
                X[n] = t
                for k, val in v.items():
                    i = int(k)
                    V[n, i] = val
                    M[n, i] = 1.0
                FRO[n] = r["frø"]
                KILDE[n] = kilde
                SIG[n] = s
                n += 1
        print(f"  {fil}: {n - foer} stillinger (totalt {n})", flush=True)

    print(
        f"Leste {n} stillinger, hoppet over {dublett} dubletter og {ugyldig} ugyldige "
        f"({time.time() - t0:.0f}s)",
        flush=True,
    )
    return X[:n], V[:n], M[:n], FRO[:n], KILDE[:n], SIG[:n]


def er_holdout(froe: int, hfroe: int, andel: float) -> bool:
    """Holdout-regelen, ETT sted. Hashen tas av (holdoutfrø, partifrø), så
    avgjørelsen for ett parti er uavhengig av hvilke andre partier som finnes –
    delingen blir da den samme enten den regnes under trening eller senere når
    holdouten skal skrives ut som en målebenk. Hadde regelen vært «de siste 5 %»
    eller «hver 20. unike frø», ville de to passene kunnet gi ulike svar."""
    h = hashlib.md5(f"{hfroe}:{froe}".encode("utf-8")).digest()[:4]
    return int.from_bytes(h, "big") < int(andel * (1 << 32))


def dump_holdout(mappe: str, ut: str, hfroe: int, andel: float) -> None:
    """Skriv holdout-linjene ut som en egen benkemappe.

    Poenget er å kunne kjøre `examples/e1-frysmaal.ts` på nøyaktig de samme
    stillingene treneren holdt utenfor. Da får holdouten GULV (uniformt lovlig
    valg) og TAK (NevroHjerne) målt på samme utvalg, som målekontrakten i
    docs/moe2.md krever – noe denne treneren ikke kan gjøre selv, fordi
    NevroHjerne ikke finnes på Python-siden.

    Linjene kopieres RÅTT. Ingen parsing, ingen reserialisering: en linje som
    endrer seg på veien er ikke lenger den samme stillingen, og md5-signaturene
    ville sluttet å stemme med treningssettets.
    """
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
    print(f"Skrev {n} holdout-stillinger til {ut}/", flush=True)


def signaturer(mappe: str) -> set:
    """Linjesignaturene i en mappe – for overlappsrapporten mot benker."""
    ut = set()
    for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                linje = linje.strip()
                if linje:
                    ut.add(sig64(linje))
    return ut


def froe_i(mappe: str) -> set:
    """Frøene i en mappe. Frø = parti; to stillinger med samme frø deler hender."""
    ut = set()
    for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                linje = linje.strip()
                if not linje:
                    continue
                try:
                    ut.add(json.loads(linje)["frø"])
                except (json.JSONDecodeError, KeyError):
                    pass
    return ut


# --- Nett, tap og mål (identisk med e1-tren.py) -----------------------------


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
    """Myk kryssentropi mot softmax(v/τ), begge maskert til lovlige kort."""
    stor_negativ = torch.finfo(logits.dtype).min
    logits = logits.masked_fill(maske == 0, stor_negativ)
    maal = (verdi / tau).masked_fill(maske == 0, stor_negativ)
    maal = F.softmax(maal, dim=1)
    logp = F.log_softmax(logits, dim=1)
    per = -(maal * logp).sum(dim=1)
    if vekt is None:
        return per.mean()
    return (per * vekt).sum() / vekt.sum().clamp(min=1e-6)


def stillingsvekt(verdi, maske, tak: float = 8.0):
    """Vekt = spennet mellom beste og verste lovlige kort, klippet."""
    stor_negativ = torch.finfo(verdi.dtype).min
    beste = verdi.masked_fill(maske == 0, stor_negativ).max(dim=1).values
    verst = verdi.masked_fill(maske == 0, -stor_negativ).min(dim=1).values
    return (beste - verst).clamp(min=0.0, max=tak) + 0.05


@torch.no_grad()
def maal_i_biter(modell, X, V, M, tau: float, idx, batch: int = 65536):
    """Uvektet tap, treffrate og anger over `idx` – i biter, så 3 mill. rader
    ikke krever et 3 mill. × 52 logit-tensor på GPU-en samtidig."""
    stor_negativ = torch.finfo(torch.float32).min
    sum_tap = 0.0
    sum_treff = 0.0
    sum_anger = 0.0
    n = idx.numel()
    for i in range(0, n, batch):
        j = idx[i : i + batch]
        logits = modell(X[j])
        v, m = V[j], M[j]
        sum_tap += maskert_tap(logits, v, m, tau).item() * j.numel()
        valgt = logits.masked_fill(m == 0, stor_negativ).argmax(dim=1)
        best = v.masked_fill(m == 0, stor_negativ).max(dim=1).values
        fikk = v.gather(1, valgt.unsqueeze(1)).squeeze(1)
        sum_treff += (fikk >= best - 1e-6).float().sum().item()
        sum_anger += (best - fikk).sum().item()
    return sum_tap / n, sum_treff / n, sum_anger / n


def skriv_vekter(sti: str, modell: E1Nett) -> None:
    """Appens format: antall nett, per nett antall lag, per lag inn/ut/vekter/bias."""
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())



def les_vekter(sti: str):
    """Inversen av `skriv_vekter`: appens format -> liste av (W, b) som numpy.

    FINJUSTERING ER GRUNNEN TIL AT DEN FINNES. Maalt 2026-08-03: sd-r2 er trent
    paa 4 824 794 stillinger, mens alt vi rakk aa generere paa ett doegn er
    410 645 - 8,5 %. Seks nett trent fra bunnen paa den mengden strauk gate 2
    med -0,35 til -0,69, uansett trekkbredde, arkitektur, froe og
    rollout-policy. Datamengden var flaskehalsen, ikke designet.

    Aa generere 4,4 mill. rader til tar ~19 timer. Men sd-r2 HAR allerede de
    4,8 millionene bakt inn i vektene sine. Starter vi derfra og lar de nye
    radene JUSTERE dem, arver vi hele det gamle datagrunnlaget gratis - og de
    nye radene faar bidra med det de er gode for: spredte kontrakter, DAgger-
    stillinger og riktig rollout-policy.

    Det er en annen operasjon enn aa trene fra bunnen, og den kan feile paa sin
    egen maate: for hoey laeringsrate glemmer det gamle («catastrophic
    forgetting»). Derfor er --startlr satt lavt som standard, og resultatet maa
    gjennom gate 2 som alt annet.
    """
    with open(sti, "rb") as f:
        antall_nett = struct.unpack("<i", f.read(4))[0]
        if antall_nett != 1:
            raise SystemExit(f"{sti}: forventet 1 nett, fant {antall_nett}")
        n_lag = struct.unpack("<i", f.read(4))[0]
        lag = []
        for _ in range(n_lag):
            inn, ut = struct.unpack("<ii", f.read(8))
            W = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn).copy()
            b = numpy.frombuffer(f.read(ut * 4), dtype="<f4").copy()
            lag.append((W, b))
        rest = f.read()
        if rest:
            raise SystemExit(f"{sti}: {len(rest)} byte til overs - feil format?")
    return lag


# --- Hovedløkke -------------------------------------------------------------


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="sd-data,sd-data2", help="alle mapper som skal leses inn")
    p.add_argument(
        "--holdoutmappe",
        default="sd-data2",
        help="holdouten trekkes BARE herfra, så kandidater som ikke har sett denne mappen "
        "(f.eks. sd-r1) kan måles på nøyaktig samme utvalg",
    )
    p.add_argument("--holdoutandel", type=float, default=0.05, help="andel GIVER i holdout")
    p.add_argument("--holdoutfroe", type=int, default=20260726, help="frø for giv-delingen")
    p.add_argument(
        "--kjor",
        action="append",
        default=[],
        help="«navn:mappe[,mappe]:skjult[,skjult]» – én treningskjøring. Kan gjentas.",
    )
    p.add_argument("--utmappe", default="e1-modell")
    p.add_argument("--logg", default="analyse/sd-r2-tren.jsonl")
    p.add_argument("--epoker", type=int, default=40)
    p.add_argument("--batch", type=int, default=1024)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--wd", type=float, default=0.0)
    p.add_argument("--taal", type=int, default=6)
    p.add_argument("--tau", type=float, default=1.0)
    p.add_argument("--tremaal", type=int, default=200000, help="rader treningstapet måles på")
    p.add_argument(
        "--start",
        default="",
        help="FINJUSTER fra en eksisterende vektfil i stedet for tilfeldig start. "
        "sd-r2 har 4,8 mill. stillinger bakt inn i vektene; de nye radene faar da "
        "JUSTERE dem i stedet for aa konkurrere med dem fra bunnen.",
    )
    p.add_argument(
        "--startlr",
        type=float,
        default=1e-4,
        help="laeringsrate naar --start brukes. Lav med vilje: for hoey rate "
        "glemmer nettet det gamle datagrunnlaget (catastrophic forgetting), og "
        "da er finjusteringen bare en daarlig omtrening.",
    )
    p.add_argument(
        "--initfroe",
        type=int,
        default=1,
        help="frø for VEKTINITIALISERINGEN, nullstilt før hver modell. Var useedet "
        "til 2026-08-03, slik at armene i en ablasjon skilte seg på startvekter "
        "i tillegg til det som skulle måles. Kjør samme ablasjon på flere frø "
        "for å skille effekt fra initialiseringsflaks.",
    )
    p.add_argument(
        "--overlappmot",
        default="",
        help="mapper det skal rapporteres overlapp mot (f.eks. e1-frys,sd-frys)",
    )
    p.add_argument(
        "--dumpholdout",
        default="",
        help="skriv holdout-linjene til denne mappen og avslutt (rask vei, ingen parsing)",
    )
    args = p.parse_args()

    # Rask vei: bare skrive ut benken. Den skal kunne kjøres uten GPU og uten
    # å lese hele treningssettet på nytt.
    if args.dumpholdout and not args.kjor:
        dump_holdout(args.holdoutmappe, args.dumpholdout, args.holdoutfroe, args.holdoutandel)
        return

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Enhet: {enhet}" + (f" ({torch.cuda.get_device_name(0)})" if enhet == "cuda" else ""))

    mapper = [m for m in args.data.split(",") if m]
    if args.holdoutmappe not in mapper:
        raise SystemExit(f"--holdoutmappe {args.holdoutmappe} er ikke blant --data {mapper}")

    X, V, M, FRO, KILDE, SIG = les(mapper)
    n = X.shape[0]
    if n < 1000:
        raise SystemExit(f"For lite data ({n} stillinger)")

    # --- OVERLAPPSRAPPORT ---------------------------------------------------
    # Rapporteres eksplisitt også når den er null. Å ikke se etter er ikke det
    # samme som at det ikke finnes, og dette prosjektet har allerede betalt for
    # den forskjellen én gang.
    rapport: dict = {"mapper": {}, "overlapp": {}, "froebaand": {}}
    for i, m in enumerate(mapper):
        idx = KILDE == i
        rapport["mapper"][m] = {
            "stillinger": int(idx.sum()),
            "givere": int(len(numpy.unique(FRO[idx]))),
        }
        rapport["froebaand"][m] = [int(FRO[idx].min()), int(FRO[idx].max())]
    for i in range(len(mapper)):
        for j in range(i + 1, len(mapper)):
            a, b = KILDE == i, KILDE == j
            felles_froe = numpy.intersect1d(FRO[a], FRO[b])
            felles_sig = numpy.intersect1d(SIG[a], SIG[b])
            rapport["overlapp"][f"{mapper[i]} ∩ {mapper[j]}"] = {
                "givere": int(len(felles_froe)),
                "linjer": int(len(felles_sig)),
            }
    for benk in [m for m in args.overlappmot.split(",") if m]:
        if not os.path.isdir(benk):
            rapport["overlapp"][f"data ∩ {benk}"] = "mappen finnes ikke"
            continue
        bs, bf = signaturer(benk), froe_i(benk)
        for i, m in enumerate(mapper):
            idx = KILDE == i
            rapport["overlapp"][f"{m} ∩ {benk}"] = {
                "givere": len(bf & set(FRO[idx].tolist())),
                "linjer": len(bs & set(SIG[idx].tolist())),
            }
    print("\n=== OVERLAPP ===")
    print(json.dumps(rapport, ensure_ascii=False, indent=2))

    # --- GIV-DELING ---------------------------------------------------------
    # Regelen ligger i `er_holdout` – ett sted, så treningen og benkeutskriften
    # ikke kan komme til å dele ulikt.
    hm = mapper.index(args.holdoutmappe)
    kandidatfroe = numpy.unique(FRO[KILDE == hm])
    hold_froe = {f for f in kandidatfroe.tolist() if er_holdout(f, args.holdoutfroe, args.holdoutandel)}
    er_hold = numpy.isin(FRO, numpy.fromiter(hold_froe, dtype=numpy.int64, count=len(hold_froe)))
    # Bare holdoutmappens rader kan være holdout; en annen mappe med samme frø
    # ville vært en lekkasje uansett, og den er allerede rapportert over.
    er_hold &= KILDE == hm
    hold_idx_np = numpy.flatnonzero(er_hold)

    # SAMME GIV I EN ANNEN MAPPE ER LEKKASJE, og den må kastes ut av
    # treningen – ikke flyttes inn i holdouten.
    #
    # Generatorene kjører på frøbånd som kan overlappe: sd-spredt spenner
    # 80–91 mill. og sd-dagger 85–98 mill., med 58 givere felles. En giv som
    # havner i holdouten via sd-spredt ligger da også i sd-daggers
    # treningsrader, og holdout-tapet ville målt på stillinger nettet har
    # sett. Alternativet – å la dem bli holdout også – er utelukket med vilje:
    # holdouten skal være NØYAKTIG det samme utvalget for kandidater som ikke
    # har sett alle mappene, ellers er to målinger ikke sammenlignbare.
    hold_arr = numpy.fromiter(hold_froe, dtype=numpy.int64, count=len(hold_froe))
    lekk = numpy.isin(FRO, hold_arr) & (KILDE != hm)
    if lekk.any():
        tapt = {}
        for i, m in enumerate(mapper):
            c = int((lekk & (KILDE == i)).sum())
            if c:
                tapt[m] = c
        print(
            f"\nLEKKASJE LUKET: {int(lekk.sum())} treningsrader kastet fordi giva "
            f"ligger i holdouten via {args.holdoutmappe} – {tapt}"
        )
        rapport["lekkasje_luket"] = {"rader": int(lekk.sum()), "per_mappe": tapt}

    # INVARIANTEN: ingen giver i to deler. Sjekkes, ikke antas.
    tren_froe = set(FRO[~er_hold & ~lekk].tolist())
    krysning = hold_froe & tren_froe
    if krysning:
        raise SystemExit(
            f"GIV-LEKKASJE: {len(krysning)} frø ligger i både trening og holdout "
            f"(f.eks. {sorted(krysning)[:5]}). Avbryter."
        )
    print(
        f"\nGiv-deling: {len(hold_froe)} av {len(kandidatfroe)} givere i {args.holdoutmappe} "
        f"→ holdout ({len(hold_idx_np)} stillinger). Ingen giver i to deler."
    )
    rapport["holdout"] = {
        "mappe": args.holdoutmappe,
        "givere": len(hold_froe),
        "givere_totalt": int(len(kandidatfroe)),
        "stillinger": int(len(hold_idx_np)),
        "andel": args.holdoutandel,
        "froe": args.holdoutfroe,
        "krysning": 0,
    }

    # --- På GPU én gang -----------------------------------------------------
    Xg = torch.from_numpy(X).to(enhet)
    Vg = torch.from_numpy(V).to(enhet)
    Mg = torch.from_numpy(M).to(enhet)
    del X, V, M
    hold_idx = torch.from_numpy(hold_idx_np).to(enhet)

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(json.dumps({"type": "overlapp", "tid": time.strftime("%Y-%m-%d %H:%M:%S"), **rapport}, ensure_ascii=False) + "\n")

    for spek in args.kjor:
        # VALGFRITT FJERDE LEDD: «navn:mapper:skjult:bredde» kutter trekkene til
        # de første `bredde` kolonnene.
        #
        # Dette er ablasjonen som isolerer minneblokken. Indeks 0-272 i v2 er
        # BIT-IDENTISKE med v1 (se src/e1/trekk.ts), så «:273» gir nøyaktig et
        # v1-nett trent på nøyaktig de samme radene og samme holdout.
        #
        # RETTELSE 2026-08-03. Her sto det tidligere «og samme initialisering.
        # Forskjellen mellom de to kjøringene kan da bare komme fra de 67
        # minnetrekkene – ikke fra data, splitt eller flaks.» Det var USANT:
        # vektene ble aldri seedet. `E1Nett(dims)` trakk fra den globale
        # RNG-tilstanden, som flyttet seg mellom kjøringene, så armene skilte
        # seg på initialisering I TILLEGG til trekkbredde – og vi kjørte n=1
        # av hver.
        #
        # Konklusjonen «minneblokken er skadelig» (−0,27 i spill) hvilte på
        # den påstanden og er derfor IKKE belagt. Arvind fant feilen ved å
        # nekte å godta at strengt mer informasjon kan gjøre et nett dårligere.
        #
        # `--initfroe` nullstiller nå frøet før HVER modell, så to armer i
        # samme kjøring trekker fra samme tilstand. Det fjerner drift mellom
        # armene, men ikke variansen mellom FRØ: ulike former kan ikke få
        # identiske vekter. Skal en arkitektur- eller trekkforskjell avgjøres,
        # må ablasjonen kjøres på flere `--initfroe` og fordelingene
        # sammenliknes.
        # VALGFRITT FEMTE LEDD: «…:bredde:a-b» NULLSTILLER kolonne a til og med
        # b, uten å endre bredden.
        #
        # HVORFOR DET IKKE HOLDER Å KUTTE. `:bredde` tar et PREFIKS. Trekkene
        # ligger i lag: v1 er 0-272, minneblokken 273-339, telleblokken
        # 340-355. Vil vi måle telleblokken ALENE, finnes det ikke noe prefiks
        # som gir den – den ligger bakerst, bak 67 minnekolonner.
        #
        # Det ble oppdaget 2026-08-03: ftf1.bin, nettet som faktisk spiller,
        # er 273 bredt. Minneblokken er aldri tatt i bruk. En «--start» til
        # 356 legger derfor på 83 nye kolonner, ikke 16, og en gate 2 på den
        # ville målt minneblokk OG telleblokk som én pakke. Passerer den, vet
        # vi ikke hvilken halvdel som virket; stryker den, vet vi ikke hvilken
        # som skadet. Maskering gjør de to skillbare.
        nullsone = None
        deler = spek.split(":")
        if len(deler) == 5:
            *deler, sone = deler
            a, _, b2 = sone.partition("-")
            nullsone = (int(a), int(b2))
        if len(deler) == 3:
            navn, mix, skjult = deler
            bredde = TREKK_DIM
        elif len(deler) == 4:
            navn, mix, skjult, b = deler
            bredde = int(b)
            if bredde > TREKK_DIM:
                raise SystemExit(f"{navn}: bredde {bredde} > trekkbredden {TREKK_DIM}")
        else:
            raise SystemExit(
                f"Ugyldig --kjor «{spek}»: forventet navn:mapper:skjult[:bredde[:a-b]]"
            )
        if nullsone is not None and nullsone[1] >= bredde:
            raise SystemExit(
                f"{navn}: nullsone {nullsone[0]}-{nullsone[1]} ligger utenfor bredden {bredde}"
            )
        mix_mapper = [m for m in mix.split(",") if m]
        mix_idx = [mapper.index(m) for m in mix_mapper]
        tren_maske = numpy.isin(KILDE, numpy.array(mix_idx, dtype=numpy.int8)) & ~er_hold & ~lekk
        tren_idx = torch.from_numpy(numpy.flatnonzero(tren_maske)).to(enhet)
        # Utsnitt, ikke kopi – Xg ligger allerede på GPU-en og er flere hundre MB.
        Xk = Xg if bredde == TREKK_DIM else Xg[:, :bredde]
        if nullsone is not None:
            # KOPI, ikke utsnitt. Å nulle inn i Xg ville stjålet kolonnene fra
            # armene som kommer etter i samme kjøring – stille, og først synlig
            # som et uforklarlig dårlig nett.
            Xk = Xk.clone()
            Xk[:, nullsone[0] : nullsone[1] + 1] = 0
            print(
                f"  nullstiller kolonne {nullsone[0]}-{nullsone[1]} "
                f"({nullsone[1] - nullsone[0] + 1} trekk) i en KOPI av dataen",
                flush=True,
            )
        dims = [bredde] + [int(x) for x in skjult.split(",")] + [KORT]
        # Nullstilles FØR hver modell, ikke én gang for hele kjøringen: ellers
        # arver arm nr. 2 en RNG-tilstand som arm nr. 1 har flyttet på.
        torch.manual_seed(args.initfroe)
        if enhet == "cuda":
            torch.cuda.manual_seed_all(args.initfroe)
        modell = E1Nett(dims).to(enhet)
        if args.start:
            # Formene maa stemme, med ÉN tillatt avvikelse: FOERSTE lag kan
            # vaere BREDERE enn startvekten. Alt annet avvises.
            #
            # HVORFOR DEN AVVIKELSEN FINNES. Telleblokken (v3, 340-355) gir
            # nettet informasjon det aldri har hatt: hvem som spilte hvilke
            # farger. Aa legge til trekk betyr normalt aa trene fra bunnen -
            # og seks nett trent fra bunnen paa 410k rader strauk gate 2 med
            # -0,35 til -0,69, fordi sd-r2 har 4,8 millioner stillinger i
            # vektene sine.
            #
            # Med NULLSTILTE nye kolonner starter nettet noeyaktig der
            # startvekten er: de nye trekkene ganges med 0 og kan ikke endre
            # ett eneste kortvalg. Nettet arver hele det gamle datagrunnlaget
            # og kan bare vinne paa aa ta den nye informasjonen i bruk.
            #
            # DE OEVRIGE LAGENE MAA STEMME EKSAKT. En stille delvis lasting
            # der ville gitt et halvt tilfeldig nett som saa ferdigtrent ut.
            start_lag = les_vekter(args.start)
            if len(start_lag) != len(modell.lag):
                raise SystemExit(
                    f"{args.start} har {len(start_lag)} lag, {navn} har {len(modell.lag)}"
                )
            for i, (W, b) in enumerate(start_lag):
                mål = tuple(modell.lag[i].weight.shape)
                if mål != W.shape:
                    utvider = i == 0 and mål[0] == W.shape[0] and mål[1] > W.shape[1]
                    if not utvider:
                        raise SystemExit(
                            f"{args.start} lag {i} er {W.shape}, {navn} venter {mål}. "
                            "Bare FOERSTE lag kan utvides, og bare i bredden."
                        )
                    nye = mål[1] - W.shape[1]
                    W = numpy.concatenate([W, numpy.zeros((W.shape[0], nye), dtype=W.dtype)], axis=1)
                    print(
                        f"  utvider inngangen {mål[1] - nye} → {mål[1]}: "
                        f"{nye} nye kolonner NULLSTILT, saa nettet starter identisk",
                        flush=True,
                    )
                with torch.no_grad():
                    modell.lag[i].weight.copy_(torch.from_numpy(W))
                    modell.lag[i].bias.copy_(torch.from_numpy(b))
            print(f"  finjusterer fra {args.start} (lr {args.startlr})", flush=True)
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

        Wt = stillingsvekt(Vg[tren_idx], Mg[tren_idx])
        # Fast utvalg for treningstapet. Må være FAST gjennom kjøringen, ellers
        # måler kurven utvalgsstøy i stedet for tilpasning.
        g = torch.Generator(device="cpu").manual_seed(7)
        tm = tren_idx[torch.randperm(tren_idx.numel(), generator=g)[: args.tremaal].to(enhet)]

        opt = torch.optim.AdamW(
            modell.parameters(), lr=args.startlr if args.start else args.lr, weight_decay=args.wd
        )
        plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)
        beste = float("inf")
        beste_epoke = 0
        siden = 0
        for epoke in range(args.epoker):
            modell.train()
            perm = torch.randperm(tren_idx.numel(), device=enhet)
            sum_tap = 0.0
            biter = 0
            for i in range(0, tren_idx.numel(), args.batch):
                j = tren_idx[perm[i : i + args.batch]]
                w = Wt[perm[i : i + args.batch]]
                tap = maskert_tap(modell(Xk[j]), Vg[j], Mg[j], args.tau, w)
                opt.zero_grad(set_to_none=True)
                tap.backward()
                opt.step()
                sum_tap += tap.item()
                biter += 1
            plan.step()
            modell.eval()
            tr_tap, tr_treff, tr_anger = maal_i_biter(modell, Xk, Vg, Mg, args.tau, tm)
            ho_tap, ho_treff, ho_anger = maal_i_biter(modell, Xk, Vg, Mg, args.tau, hold_idx)
            rad = {
                "type": "epoke",
                "navn": navn,
                "epoke": epoke + 1,
                "tren_tap_vektet": round(sum_tap / max(1, biter), 5),
                "tren_tap": round(tr_tap, 5),
                "hold_tap": round(ho_tap, 5),
                "gap": round(ho_tap - tr_tap, 5),
                "tren_anger": round(tr_anger, 5),
                "hold_anger": round(ho_anger, 5),
                "tren_treff": round(tr_treff, 5),
                "hold_treff": round(ho_treff, 5),
            }
            print(
                f"epoke {epoke + 1}/{args.epoker}: tren-tap {tr_tap:.4f} hold-tap {ho_tap:.4f} "
                f"(gap {ho_tap - tr_tap:+.4f})  tren-anger {tr_anger:.4f} hold-anger {ho_anger:.4f} "
                f"hold-treff {100 * ho_treff:.1f} %",
                flush=True,
            )
            if ho_anger < beste:
                beste = ho_anger
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
        print(f"{navn} ferdig: beste hold-anger {beste:.4f} på epoke {beste_epoke} → {ut}")
        logg.write(
            json.dumps(
                {
                    "type": "ferdig",
                    "navn": navn,
                    "beste_hold_anger": round(beste, 5),
                    "beste_epoke": beste_epoke,
                    "fil": ut,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        del modell, opt, Wt
        torch.cuda.empty_cache() if enhet == "cuda" else None

    logg.close()


if __name__ == "__main__":
    main()
