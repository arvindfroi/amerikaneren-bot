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

====================== MYKE ETIKETTER OG ROLLER (12. sep) ================

Versjon 2-filer (`mlb-trodata.ts --myk`) har posteriorens marginaler der den eksakte
tellingen var naabar (`examples/myk-etikett.ts`), og et rollefelt. Maalet paa de radene
er kryssentropien mot fordelingen; alle andre rader trenes paa én-hot som foer, i samme
batch. `--etikett hard` er kontrollarmen paa de samme radene, `--myk-vekt` vekten paa de
myke radene, `--rolle-vekt` vekten per rolle (budvinner, makker, motspiller). Rollen leses
av trekkene (184/280) i versjon 1. Dommen er uendret: én-hot-K8 paa holdout (naa ogsaa per
rolle, og «mot posterioren» der holdout har myke etiketter) og det rettferdige taket i
`examples/k8-tak.ts`. Uten versjon 2-filer og uten de nye flaggene: samme kodevei som foer.
`test/myk-etikett.test.ts` holder tapet mot en TS-referanse (`--bare-tap`).
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


# ROLLEN (12. sep, agent R). `lagInn` (src/neat/trekk.ts) har ER_BUDVINNER paa 184 og ER_HEMMELIG_MAKKER
# paa 280 i ALLE bredder (NEAT-prefikset), saa rollen kan leses av versjon 1-filer uten et nytt felt.
# Versjon 2 har feltet i tillegg, og de to MAA vaere enige: ellers er rollevekten og rollerapporten om
# noe annet enn det setet saa.
TREKK_ER_BUDVINNER = 184
TREKK_ER_MAKKER = 280
ROLLER = ["budvinner", "makker", "motspiller"]
MYK_UT = KORT * KLASSER


def rolle_fra_trekk(t):
    bv = t[:, TREKK_ER_BUDVINNER] > 0.5
    mk = (t[:, TREKK_ER_MAKKER] > 0.5) & ~bv
    return numpy.where(bv, 0, numpy.where(mk, 1, 2)).astype(numpy.int8)


def les_mlbt(monster):
    """Leser MLBT versjon 1 og 2 til en dict: X fp16, F int8, FRO int32, ST int16, ROLLE int8, MYK bool,
    P f32 (N, 52, 4) eller None (ingen versjon 2-fil), dim.

    Versjon 2 (`mlb-trodata --myk`, 12. sep): posten har i tillegg rolle i8, myk u8 og 208 x f32 -
    posteriorens marginaler der den eksakte tellingen var naabar (`examples/myk-etikett.ts`).
    """
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen filer for «{monster}»")
    Xs, Fs, FROs, STs, ROs, MYs, Ps = [], [], [], [], [], [], []
    dim = None
    for sti in filer:
        with open(sti, "rb") as fh:
            magi = fh.read(4)
            if magi != b"MLBT":
                raise SystemExit(f"{sti}: ikke en MLBT-fil")
            (versjon,) = struct.unpack("<i", fh.read(4))
            (d,) = struct.unpack("<i", fh.read(4))
            if versjon not in (1, 2):
                raise SystemExit(f"{sti}: ukjent versjon {versjon}")
            # BREDDEN MAA VAERE EN. Blandes to bredder, hoppes halve korpuset
            # over i stillhet - samme felle som i sd-tren og tro-tren.
            if dim is None:
                dim = d
            elif d != dim:
                raise SystemExit(f"{sti}: dim {d}, ventet {dim}")
            felt = [
                ("t", "<f4", (dim,)),
                ("f", "i1", (KORT,)),
                ("fro", "<i4"),
                ("stikk", "<i2"),
                ("sete", "<i2"),
            ]
            if versjon == 2:
                felt += [("rolle", "i1"), ("myk", "u1"), ("p", "<f4", (MYK_UT,))]
            a = numpy.fromfile(fh, dtype=numpy.dtype(felt))
        rolle = rolle_fra_trekk(a["t"])
        if versjon == 2:
            ulik = int((a["rolle"] != rolle).sum())
            if ulik:
                raise SystemExit(f"{sti}: rollefeltet og trekkene (184/280) er uenige i {ulik} rader")
            myk = a["myk"] == 1
            p = a["p"].reshape(-1, KORT, KLASSER)
            # STOETTEN ER DE USETTE KORTENE (samme sjekk som myk-etikett.ts): sum 1 der f > 0, 0 ellers,
            # og nuller i radene uten myk etikett. En forskjoevet post ville feilet her, ikke i treningen.
            s = p.sum(axis=2)
            usett = a["f"] > 0
            feil = myk[:, None] & ((usett & (numpy.abs(s - 1) > 1e-4)) | (~usett & (s > 1e-6)))
            if bool(feil.any()) or bool((~myk[:, None] & (s != 0)).any()):
                raise SystemExit(f"{sti}: myke etiketter summerer ikke til 1 paa de usette kortene ({int(feil.any(axis=1).sum())} rader)")
            Ps.append(numpy.ascontiguousarray(p))
        else:
            myk = numpy.zeros(len(a), dtype=bool)
            Ps.append(None)
        Xs.append(a["t"].astype(numpy.float16))
        Fs.append(a["f"])
        FROs.append(a["fro"])
        STs.append(a["stikk"])
        ROs.append(rolle)
        MYs.append(myk)
        print(f"  {sti}: {len(a)} rader" + (f" (versjon 2, {int(myk.sum())} med myk etikett)" if versjon == 2 else ""), flush=True)
        del a
    P = None
    if any(p is not None for p in Ps):
        P = numpy.concatenate([p if p is not None else numpy.zeros((len(x), KORT, KLASSER), numpy.float32) for p, x in zip(Ps, Xs)])
    return {
        "X": numpy.concatenate(Xs),
        "F": numpy.concatenate(Fs),
        "FRO": numpy.concatenate(FROs),
        "ST": numpy.concatenate(STs),
        "ROLLE": numpy.concatenate(ROs),
        "MYK": numpy.concatenate(MYs),
        "P": P,
        "dim": dim,
    }


def les_bin(monster):
    """Den gamle formen (X fp16, F int8, FRO int32, STIKK int16, dim), for kallere uten roller og myke etiketter."""
    d = les_mlbt(monster)
    return d["X"], d["F"], d["FRO"], d["ST"], d["dim"]


def rolletabell(ROLLE, ST, MYK=None):
    """Rader per rolle x stikk (og hvor mange med myk etikett) - tekstlinjer."""
    L = []
    n = max(1, len(ROLLE))
    for r, navn in enumerate(ROLLER):
        m = ROLLE == r
        per = [int((m & (ST == s)).sum()) for s in range(12)]
        L.append(f"  {navn:10s} {int(m.sum()):7d} rader ({100 * m.sum() / n:.1f} %)  per stikk 0-11: {per}")
        if MYK is not None and MYK.any():
            pm = [int((m & MYK & (ST == s)).sum()) for s in range(12)]
            L.append(f"  {'':10s} {int((m & MYK).sum()):7d} med myk etikett      per stikk 0-11: {pm}")
    return L


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


# BLOKKENE I HVER TROBREDDE, i rekkefoelge (11. sep). Samme tabell som `MLB_TRO_LAYOUT` i
# `src/mlb/trotrekk.ts`; `test/mlb-sanser2-utvid.test.ts` krever at `--bare-utvid` her og
# `utvidTronett` i TS gir BYTE-IDENTISKE vektfiler.
LAYOUT = {
    660: [("grunn", 660)],
    804: [("grunn", 660), ("hukommelse", 144)],
    776: [("grunn", 660), ("signal", 116)],
    920: [("grunn", 660), ("hukommelse", 144), ("signal", 116)],
    996: [("grunn", 660), ("hukommelse", 144), ("signal", 116), ("stilling", 36), ("valgtbort", 40)],
    # TO SANSER LANDET SAMME DAG (12. sep), og de er UAVHENGIGE: tempo (32, tenketiden) og
    # auksjon (44, budrekkefoelgen). Rekkefoelgen i 1072 er den de landet i - tempo foerst -
    # saa 996 -> 1028 og 996 -> 1072 og 1028 -> 1072 alle er nuller BAKERST. 1040 -> 1072 er
    # det ikke: auksjonen staar paa 996 i 1040 og paa 1028 i 1072, og `kolonnekart` flytter den
    # dit (samme mekanikk som 776 -> 920 flytter signalet). Legges nullene bakerst i STEDET,
    # leser auksjonsvektene tempoblokken - den gamle 776 -> 920-feilen, en gang til.
    1028: [("grunn", 660), ("hukommelse", 144), ("signal", 116), ("stilling", 36), ("valgtbort", 40), ("tempo", 32)],
    1040: [("grunn", 660), ("hukommelse", 144), ("signal", 116), ("stilling", 36), ("valgtbort", 40), ("auksjon", 44)],
    1072: [("grunn", 660), ("hukommelse", 144), ("signal", 116), ("stilling", 36), ("valgtbort", 40), ("tempo", 32), ("auksjon", 44)],
}


def kolonnekart(fra, til):
    """[(kildestart, maalstart, lengde)] per blokk i `fra`, plassert der blokken staar i `til`.

    En ukjent bredde gir prefikset, som foer tabellen fantes. En blokk som MANGLER i `til`
    stopper: en utvidelse som mister en blokk er ikke en utvidelse.
    """
    if fra not in LAYOUT or til not in LAYOUT:
        return [(0, 0, fra)]
    start, o = {}, 0
    for navn, lengde in LAYOUT[til]:
        start[navn] = o
        o += lengde
    kart, o = [], 0
    for navn, lengde in LAYOUT[fra]:
        if navn not in start:
            raise SystemExit(f"blokken «{navn}» i {fra} finnes ikke i {til}")
        kart.append((o, start[navn], lengde))
        o += lengde
    return kart


def les_vekter(sti, modell):
    """Leser appformatet tilbake. R2 starter hver epoke fra forrige epokes trosnett."""
    with open(sti, "rb") as f:
        f.read(8)
        for i, l in enumerate(modell.lag):
            inn, ut = struct.unpack("<ii", f.read(8))
            utvid = i == 0 and ut == l.out_features and inn < l.in_features
            if (inn, ut) != (l.in_features, l.out_features) and not utvid:
                raise SystemExit(f"{sti}: lag {inn}x{ut}, ventet {l.in_features}x{l.out_features}")
            w = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn)
            b = numpy.frombuffer(f.read(ut * 4), dtype="<f4")
            with torch.no_grad():
                if utvid:
                    # UTVIDET INNGANG: hver blokk der den staar i den brede layouten, null ellers.
                    # 776 = 660 | signal, men 920 = 660 | hukommelse (144) | signal: aa legge nullene
                    # BAKERST ville latt signalvektene lese hukommelsesblokken (agent C maalte 0 av 40
                    # like fordelinger). 920 -> 996 (sanser 2) er nuller bakerst, 804 -> 996 et hull paa 804.
                    l.weight.zero_()
                    for fra, til, lengde in kolonnekart(inn, l.in_features):
                        l.weight[:, til : til + lengde].copy_(torch.from_numpy(w[:, fra : fra + lengde].copy()))
                else:
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
    # MENNESKERADENE (11. sep, agent I): finjustering paa menneskekamper ga +1,26 pp K8 mot mennesker, men
    # minnegevinsten ble NEGATIV (-0,22 pp): hukommelsesblokken laerte aa kjenne igjen den ene hovedspilleren
    # i stedet for vaner som gjelder paa tvers. MINNE-DROPOUT nuller blokken [660, 804) i en andel av
    # menneskeradene i hver batch, saa nettet maa kunne spaa uten den og bare bruke den der den hjelper.
    ap.add_argument("--tren-menneske", default="", help="MLBT-filer fra mlb-trodata --menneske (band trening)")
    ap.add_argument("--hold-menneske", default="", help="MLBT-filer fra mlb-trodata --menneske (band holdout)")
    ap.add_argument("--minne-dropout", type=float, default=0.0, help="andel menneskerader med hukommelsen nullet per batch")
    # SYMMETRISK MINNE-DROPOUT (12. sep). Med dropout bare paa menneskeradene ble «hukommelsesblokken er null» en
    # MENNESKE/BOT-INDIKATOR: med 1,0 var den null i alle menneskerader og aldri i botradene, og i innspilte
    # menneskekamper (der boka er fylt) spaadde nettet som mot en bot. Maalt: K6-menneske stigning z −5,4, nivå
    # −0,29 pp, og en fremmed bok slo kampens egen. Samme andel paa botradene gjoer null-minne uinformativt om kilden.
    ap.add_argument("--minne-dropout-bot", type=float, default=0.0, help="andel BOTrader med hukommelsen nullet per batch")
    # BARE UTVIDELSEN (11. sep): CPU, ingen data, ingen trening. Skriver --vekter utvidet til --dim
    # med nullkolonner etter LAYOUT, saa varmstarten kan proeves uten GPU og uten et korpus.
    ap.add_argument("--bare-utvid", default="", help="skriv --vekter utvidet til --dim hit og avslutt (CPU)")
    ap.add_argument("--dim", type=int, default=0, help="maalbredden for --bare-utvid")
    # MYKE ETIKETTER (12. sep, agent R). Én-hot «hvor laa kortet» er ett trekk fra posterioren; loekka
    # overtilpasser etter én epoke. Versjon 2-filer (`mlb-trodata --myk`) har posteriorens marginaler der
    # den var naabar, og da er maalet kryssentropien mot FORDELINGEN (-sum p log q per usett kort) - samme
    # minimum, uten stoeyen. Rader uten myk etikett trenes paa én-hot som foer, i samme batch.
    ap.add_argument("--etikett", default="myk", choices=["myk", "hard"], help="myk: posterioren der fila har den; hard: alltid én-hot (kontrollarmen)")
    ap.add_argument("--myk-vekt", type=float, default=1.0, help="vekt per kort i rader med myk etikett, relativt til én-hot-rader")
    # ROLLEVEKT: budvinneren naar bare 15,7 % av veien mot det rettferdige taket (de andre 44,2 %), og hun
    # er 31 % av radene. Vekten ganges inn per rad; K8 per rolle rapporteres alltid.
    ap.add_argument("--rolle-vekt", default="1,1,1", help="vekt per rolle: budvinner,makker,motspiller")
    ap.add_argument("--bare-les", action="store_true", help="CPU: les --tren, skriv rader per rolle x stikk og myk dekning, avslutt")
    ap.add_argument("--bare-tap", action="store_true", help="CPU: treningstapet for --vekter paa --tren (med --etikett, --myk-vekt, --rolle-vekt), avslutt")
    # VALG AV EPOKE: «beste» paa holdout (som foer; med --vekter teller startvektene som epoke 0) eller «siste».
    # A/B-armer paa en holdout fra et annet bord enn dommen (k8-tak.ts) kan ellers alle ende som startvektene,
    # og sammenlikningen maaler da ingenting.
    ap.add_argument("--velg", default="beste", choices=["beste", "siste"], help="hvilken epoke som skrives til --ut")
    args = ap.parse_args()
    rolle_vekt = [float(x) for x in args.rolle_vekt.split(",")]
    if len(rolle_vekt) != 3 or any(not (v >= 0) for v in rolle_vekt):
        raise SystemExit(f"--rolle-vekt maa vaere tre tall >= 0 (budvinner,makker,motspiller), fikk «{args.rolle_vekt}»")
    if not (args.myk_vekt >= 0):
        raise SystemExit("--myk-vekt maa vaere >= 0")

    if args.bare_les:
        d = les_mlbt(args.tren)
        print(f"{len(d['X'])} rader, {d['dim']} trekk, {int(d['MYK'].sum())} med myk etikett", flush=True)
        for l in rolletabell(d["ROLLE"], d["ST"], d["MYK"]):
            print(l, flush=True)
        return

    if args.bare_utvid:
        if not args.vekter or args.dim <= 0:
            raise SystemExit("--bare-utvid krever --vekter og --dim")
        dims = les_dims(args.vekter)
        if args.dim < dims[0]:
            raise SystemExit(f"{args.vekter} tar {dims[0]} trekk, --dim {args.dim} er smalere")
        fra = dims[0]
        dims[0] = args.dim
        modell = Tronett(dims)
        les_vekter(args.vekter, modell)
        skriv_vekter(args.bare_utvid, modell)
        print(f"UTVIDET {args.vekter} {fra} -> {args.dim}: {args.bare_utvid}", flush=True)
        return

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    t0 = time.time()
    print("TRENING:", flush=True)
    dtr = les_mlbt(args.tren)
    Xtr, Ftr, FROtr, STtr, dim = dtr["X"], dtr["F"], dtr["FRO"], dtr["ST"], dtr["dim"]
    Rtr, Ktr, Ptr = dtr["ROLLE"], dtr["MYK"], dtr["P"]
    del dtr
    if args.bare_tap:
        # BARE TAPET: holdout er treningsradene selv (ingen deling, ingen fil), bare for aa ha noe i Xho.
        Xho, Fho, Sho, Rho, Kho, Pho = Xtr, Ftr, STtr, Rtr, Ktr, Ptr
        dim2 = dim
    elif args.hold_del > 0:
        # HOLDOUT PAA KAMP, fra samme filer: epokens data har ikke et eget froebaand,
        # og en radvis splitt ville maalt gjenkjenning av kampen.
        # HASH AV FROEET, ikke `froe % N`: froene er base + 7717*k og skardene k % S, saa
        # `froe % 10` faller sammen med skardnummeret (ett skard ga 100 % holdout).
        h = (FROtr.astype(numpy.uint64) * numpy.uint64(2654435761)) % numpy.uint64(4294967296)
        hold = (h % numpy.uint64(args.hold_del)) == 0
        Xho, Fho, Sho, Rho, Kho = Xtr[hold], Ftr[hold], STtr[hold], Rtr[hold], Ktr[hold]
        Pho = None if Ptr is None else Ptr[hold]
        Xtr, Ftr, STtr, Rtr, Ktr = Xtr[~hold], Ftr[~hold], STtr[~hold], Rtr[~hold], Ktr[~hold]
        Ptr = None if Ptr is None else Ptr[~hold]
        dim2 = dim
    else:
        print("HOLDOUT:", flush=True)
        dho = les_mlbt(args.hold)
        Xho, Fho, Sho, dim2 = dho["X"], dho["F"], dho["ST"], dho["dim"]
        Rho, Kho, Pho = dho["ROLLE"], dho["MYK"], dho["P"]
        del dho
    if dim != dim2:
        raise SystemExit(f"tren dim {dim} != holdout dim {dim2}")
    # Menneskerader: samme bredde, merket saa minne-dropout bare treffer dem.
    er_menneske = numpy.zeros(len(Xtr), dtype=bool)
    if args.tren_menneske:
        print("TRENING (menneske):", flush=True)
        dm = les_mlbt(args.tren_menneske)
        Xm, Fm, dim_m = dm["X"], dm["F"], dm["dim"]
        if dim_m != dim:
            raise SystemExit(f"menneskerader dim {dim_m} != {dim}")
        if dm["P"] is not None:
            raise SystemExit("menneskerader med myke etiketter: menneskets policy er ukjent, posterioren finnes ikke")
        Xtr = numpy.concatenate([Xtr, Xm])
        Ftr = numpy.concatenate([Ftr, Fm])
        # Rolle, stikk og myk-flagget foelger radene, saa rollevekten og rolletabellen ogsaa gjelder menneskeradene.
        STtr = numpy.concatenate([STtr, dm["ST"]])
        Rtr = numpy.concatenate([Rtr, dm["ROLLE"]])
        Ktr = numpy.concatenate([Ktr, dm["MYK"]])
        if Ptr is not None:
            Ptr = numpy.concatenate([Ptr, numpy.zeros((len(Xm), KORT, KLASSER), numpy.float32)])
        er_menneske = numpy.concatenate([er_menneske, numpy.ones(len(Xm), dtype=bool)])
        del Xm, Fm, dm
    Xhm = Fhm = Shm = None
    if args.hold_menneske:
        print("HOLDOUT (menneske):", flush=True)
        Xhm, Fhm, _, Shm, dim_hm = les_bin(args.hold_menneske)
        if dim_hm != dim:
            raise SystemExit(f"menneske-holdout dim {dim_hm} != {dim}")
    if args.minne_dropout > 0 and dim < 804:
        raise SystemExit(f"--minne-dropout krever hukommelsesblokken (bredde 804/920/996), dataene har {dim}")
    print(
        f"{len(Xtr)} treningsrader ({int(er_menneske.sum())} menneske), {len(Xho)} holdoutrader"
        f"{'' if Xhm is None else f' + {len(Xhm)} menneske'}, {dim} trekk ({time.time() - t0:.0f}s)",
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
    Mt = torch.from_numpy(er_menneske).to(enhet)

    # ROLLENE OG DE MYKE ETIKETTENE (12. sep, agent R).
    print("RADER PER ROLLE, trening:", flush=True)
    for l in rolletabell(Rtr, STtr, Ktr):
        print(l, flush=True)
    print("RADER PER ROLLE, holdout:", flush=True)
    for l in rolletabell(Rho, Sho, Kho):
        print(l, flush=True)
    bruk_myk = args.etikett == "myk" and Ptr is not None and bool(Ktr.any())
    if bruk_myk and args.tapsform != "ce4":
        raise SystemExit("myke etiketter trenes bare med --tapsform ce4 (posterioren har talongklassen; kond betinger den bort)")
    if Ptr is not None:
        print(f"MYKE ETIKETTER: {int(Ktr.sum())} av {len(Ktr)} treningsrader; " + (f"brukt, vekt {args.myk_vekt}" if bruk_myk else "IKKE brukt (--etikett hard)"), flush=True)
    # RADVEKTEN: rollevekten, ganget med --myk-vekt der etiketten er myk. Alle 1 og ingen myke = det gamle
    # tapet paa den gamle kodeveien (F.cross_entropy), saa en loekke uten de nye flaggene trener som foer.
    rv = numpy.array(rolle_vekt, dtype=numpy.float32)[Rtr.astype(numpy.int64)]
    if bruk_myk:
        rv = numpy.where(Ktr, rv * numpy.float32(args.myk_vekt), rv).astype(numpy.float32)
    ny_tapsvei = bruk_myk or bool((rv != 1).any())
    Wt = torch.from_numpy(rv).to(enhet)
    Kt = torch.from_numpy(Ktr if bruk_myk else numpy.zeros(len(Ktr), dtype=bool)).to(enhet)
    Pt = torch.from_numpy(Ptr).to(enhet) if bruk_myk else None
    Rh = torch.from_numpy(Rho.astype(numpy.int64)).to(enhet)
    # K8 MOT POSTERIOREN paa holdout-radene som har den: forventet én-hot-K8 under posterioren (lavere varians).
    har_myk_hold = Pho is not None and bool(Kho.any())
    Kh = torch.from_numpy(Kho).to(enhet) if har_myk_hold else None
    Ph = torch.from_numpy(Pho).to(enhet) if har_myk_hold else None
    del Ptr, Pho
    if Xhm is not None:
        Xhm_t = torch.from_numpy(Xhm).to(enhet)
        Fhm_t = torch.from_numpy(Fhm).to(enhet).long()
        Shm_t = torch.from_numpy(Shm.astype(numpy.int64)).to(enhet)
        del Xhm, Fhm
    del Xtr, Ftr, Xho, Fho

    rang = torch.arange(KORT, device=enhet) % 13  # 0..12 der 12 = ess
    er_honnor = (rang >= 10).unsqueeze(0)

    torch.manual_seed(args.froe)
    if args.vekter:
        dims = les_dims(args.vekter)
        if dims[0] > dim:
            raise SystemExit(f"{args.vekter} tar {dims[0]} trekk, dataene har bare {dim}")
        if dims[0] < dim:
            # UTVIDET INNGANG (K6 -> K8): de nye kolonnene (hukommelsen, lagt BAKERST) starter
            # paa NULL, saa nettet gir noeyaktig samme fordeling som foer til det har laert noe.
            print(f"UTVIDER inngangen {dims[0]} -> {dim}: nye kolonner starter paa null", flush=True)
            dims[0] = dim
    else:
        dims = [dim] + [int(x) for x in args.skjult.split(",")] + [KORT * KLASSER]
    modell = Tronett(dims).to(enhet)
    if args.vekter:
        les_vekter(args.vekter, modell)
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)

    def tap_batch(ut, mal, w=None, k=None, p=None):
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
            if not ny_tapsvei:
                return F.cross_entropy(ut[maske], t[maske], reduction="mean")
            # MYK OG VEKTET (agent R): per kort -log q[sann] (én-hot) eller -sum_k p_k log q_k (myk), vektet
            # per rad og delt paa vektsummen - med alle vekter 1 og ingen myke er det F.cross_entropy over.
            logq = F.log_softmax(ut.float(), dim=2)
            per = -logq.gather(2, t.unsqueeze(2)).squeeze(2)
            if p is not None:
                per = torch.where(k.unsqueeze(1), -(p * logq).sum(dim=2), per)
            vekt = maske.float() * w.unsqueeze(1)
            nevner = vekt.sum()
            return None if float(nevner) == 0 else (per * vekt).sum() / nevner
        m3 = maske & (mal <= 3)
        if m3.sum() == 0:
            return None
        if not ny_tapsvei:
            return F.cross_entropy(ut[m3][:, :3], t[m3], reduction="mean")
        per = -F.log_softmax(ut[:, :, :3].float(), dim=2).gather(2, t.clamp(max=2).unsqueeze(2)).squeeze(2)
        vekt = m3.float() * w.unsqueeze(1)
        nevner = vekt.sum()
        return None if float(nevner) == 0 else (per * vekt).sum() / nevner

    if args.bare_tap:
        # BARE TAPET (CPU, for prøven): hele --tren i én batch, saa snittet er det samme uttrykket som i treningen.
        if not args.vekter:
            raise SystemExit("--bare-tap krever --vekter")
        modell.eval()
        with torch.no_grad():
            tap = tap_batch(modell(Xt.float()), Ft, Wt, Kt, Pt)
        print(f"TRO-TAP {float(tap):.8f}", flush=True)
        return

    @torch.no_grad()
    def mål(X, Fa, S=None, R=None, K=None, P=None):
        """CE4, treff, honnoertreff og K8-tap - alt paa samme rader.

        Med R (rolle): K8 per rolle og per rolle x stikk. Med K/P (myke etiketter paa holdout): «k8_myk»,
        forventet én-hot-K8 under posterioren paa de radene - sum_c sum_k<3 p_ck (-log q3_ck) / sum_c sum_k<3 p_ck,
        samme brøk som K8 med kortene paa haand vektet med sannsynligheten for at de er der. Lavere varians enn
        én-hot paa de samme radene; dommen er fortsatt én-hot-K8 og det rettferdige taket i `k8-tak.ts`.
        """
        sum4, n4 = 0.0, 0
        treff, tot = 0, 0
        treff_h, tot_h = 0, 0
        sumk8, nk8 = 0.0, 0
        summyk, nmyk = 0.0, 0.0
        # K8-tap per stikk, saa vi ser om det vokser utover i runden slik §117 saa.
        perStikk = {}
        perRolle = {}
        perRolleStikk = {}
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
                if R is not None:
                    rr = R[i : i + args.batch].unsqueeze(1).expand_as(mal)
                    for r in torch.unique(rr[m3]).tolist():
                        selr = m3 & (rr == r)
                        a, b = perRolle.get(r, (0.0, 0))
                        perRolle[r] = (a + float((-valgt[selr]).sum()), b + int(selr.sum()))
                        if S is not None:
                            for v in torch.unique(st[selr]).tolist():
                                sel = selr & (st == v)
                                a, b = perRolleStikk.get((r, v), (0.0, 0))
                                perRolleStikk[(r, v)] = (a + float((-valgt[sel]).sum()), b + int(sel.sum()))
            if K is not None:
                kb = K[i : i + args.batch]
                if bool(kb.any()):
                    p3 = P[i : i + args.batch][:, :, :3].float()
                    lq3 = F.log_softmax(ut[:, :, :3].float(), dim=2)
                    rad = (kb.unsqueeze(1) & maske).float()
                    summyk += float((-(p3 * lq3).sum(dim=2) * rad).sum())
                    nmyk += float((p3.sum(dim=2) * rad).sum())
        return {
            "ce4": sum4 / max(1, n4),
            "treff": treff / max(1, tot),
            "honnor": treff_h / max(1, tot_h),
            "k8": sumk8 / max(1, nk8),
            "k8_n": nk8,
            "perStikk": {int(k): round(v[0] / max(1, v[1]), 5) for k, v in sorted(perStikk.items())},
            "perRolle": {int(k): round(v[0] / max(1, v[1]), 5) for k, v in sorted(perRolle.items())},
            "perRolle_n": {int(k): v[1] for k, v in sorted(perRolle.items())},
            "perRolleStikk": {f"{k[0]}|{k[1]}": round(v[0] / max(1, v[1]), 5) for k, v in sorted(perRolleStikk.items())},
            "k8_myk": (summyk / nmyk) if nmyk > 0 else None,
            "k8_myk_n": round(nmyk, 1),
        }

    # STARTVEKTENE MAALES FOERST (R2). De er grunnlinjen: et trosnett som ikke
    # slaar dem paa epokens egen holdout skal ikke erstatte dem, og driveren leser
    # «tro_foer»/«tro_etter» for aa avgjoere det.
    modell.eval()
    foer = mål(Xh, Fh, Sh, Rh, Kh, Ph)
    kort_dom = lambda d: {k: v for k, v in d.items() if k not in ("perStikk", "perRolleStikk")}  # noqa: E731
    rolle_tekst = lambda d: "  ".join(f"{ROLLER[r]} {d['perRolle'].get(r, float('nan')):.4f}" for r in range(3))  # noqa: E731
    print(json.dumps({"tro_foer": kort_dom(foer)}), flush=True)
    print(f"START K8 per rolle: {rolle_tekst(foer)}" + ("" if foer["k8_myk"] is None else f"  | mot posterioren {foer['k8_myk']:.4f}"), flush=True)
    foer_m = mål(Xhm_t, Fhm_t, Shm_t) if args.hold_menneske else None
    if foer_m is not None:
        print(json.dumps({"tro_foer_menneske": {k: v for k, v in foer_m.items() if k != "perStikk"}}), flush=True)

    def poeng(hb, hm):
        """Valgtallet: bot-holdoutens K8-tap, eller snittet med menneske-holdouten naar den finnes.
        Et nett som blir bedre mot mennesker og verre mot botene (eller omvendt) skal ikke vinne gratis."""
        return hb["k8"] if hm is None else 0.5 * (hb["k8"] + hm["k8"])

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    beste = poeng(foer, foer_m) if args.vekter else float("inf")
    beste_rad = (0, foer) if args.vekter else None
    beste_m = foer_m
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
            x = Xt[j].float()
            if args.minne_dropout > 0 or args.minne_dropout_bot > 0:
                andel = torch.where(Mt[j], args.minne_dropout, args.minne_dropout_bot)
                slipp = torch.rand(len(j), device=enhet) < andel
                if bool(slipp.any()):
                    x[slipp, 660:804] = 0  # hukommelsesblokken i 804/920/996
            ut = modell(x)
            tap = tap_batch(ut, Ft[j], Wt[j], Kt[j], None if Pt is None else Pt[j])
            if tap is None:
                continue
            opt.zero_grad(set_to_none=True)
            tap.backward()
            opt.step()
            sum_tap += float(tap.detach())
            n_tap += 1
        plan.step()
        modell.eval()
        h = mål(Xh, Fh, Sh, Rh, Kh, Ph)
        rad = {
            "epoke": e + 1,
            "tapsform": args.tapsform,
            "tren_tap": round(sum_tap / max(1, n_tap), 5),
            "hold_ce4": round(h["ce4"], 5),
            "hold_treff": round(h["treff"], 5),
            "hold_honnor": round(h["honnor"], 5),
            "hold_k8": round(h["k8"], 5),
            "hold_k8_n": h["k8_n"],
            "hold_k8_rolle": h["perRolle"],
            "hold_k8_myk": None if h["k8_myk"] is None else round(h["k8_myk"], 5),
        }
        logg.write(json.dumps(rad) + "\n")
        print(
            f"epoke {e + 1}/{args.epoker}: tren {rad['tren_tap']:.4f}  "
            f"CE4 {h['ce4']:.4f}  treff {h['treff'] * 100:.1f} %  "
            f"honnoer {h['honnor'] * 100:.1f} %  K8-tap {h['k8']:.4f}",
            flush=True,
        )
        print(f"          per rolle: {rolle_tekst(h)}" + ("" if h["k8_myk"] is None else f"  | mot posterioren {h['k8_myk']:.4f}"), flush=True)
        hm = mål(Xhm_t, Fhm_t, Shm_t) if args.hold_menneske else None
        if hm is not None:
            print(f"          menneske-holdout K8-tap {hm['k8']:.4f}  treff {hm['treff'] * 100:.1f} %", flush=True)
            logg.write(json.dumps({"epoke": e + 1, "menneske_k8": round(hm["k8"], 5), "menneske_k8_n": hm["k8_n"]}) + "\n")
        # BESTE PAA K8-TAPET, ikke paa treffet: det er tallet kravet stiller.
        if poeng(h, hm) < beste or args.velg == "siste":
            beste = poeng(h, hm)
            beste_rad = (e + 1, h)
            beste_m = hm
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
        f.write(f"K8-tap per rolle: {rolle_tekst(h)} (kort {h['perRolle_n']})\n")
        f.write(f"K8-tap per rolle|stikk: {h['perRolleStikk']}\n")
        if h["k8_myk"] is not None:
            f.write(f"K8 mot posterioren (holdoutrader med myk etikett): {h['k8_myk']:.5f}\n")
        f.write(f"etikett {args.etikett}, myk-vekt {args.myk_vekt}, rolle-vekt {args.rolle_vekt}\n")
        f.write(f"vekter -> {args.ut}\n")
    print(f"\nFerdig: beste holdout K8-tap {beste:.5f} -> {args.ut}", flush=True)
    print(json.dumps({"tro_etter": {"epoke": beste_rad[0], **kort_dom(beste_rad[1])}}), flush=True)
    print(f"Rapport lagt til {args.rapport}", flush=True)
    # MASKINLESBARE LINJER SIST: de foerste linjene i stdout kan forsvinne gjennom WSL-roeret, saa
    # loekka leser bare disse (samme regel som vrak-tren og budq-tren).
    print(f"TRO-BESTE-EPOKE {beste_rad[0]}", flush=True)
    print(f"TRO-BOT-K8-START {foer['k8']:.5f}", flush=True)
    print(f"TRO-BOT-K8-BESTE {beste_rad[1]['k8']:.5f}", flush=True)
    rtall = lambda d: " ".join("%.5f" % d["perRolle"].get(r, float("nan")) for r in range(3))  # noqa: E731
    print(f"TRO-BOT-K8-ROLLE-START {rtall(foer)}", flush=True)
    print(f"TRO-BOT-K8-ROLLE-BESTE {rtall(beste_rad[1])}", flush=True)
    if foer["k8_myk"] is not None:
        print(f"TRO-BOT-K8-MYK-START {foer['k8_myk']:.5f}", flush=True)
        print(f"TRO-BOT-K8-MYK-BESTE {beste_rad[1]['k8_myk']:.5f}", flush=True)
    if foer_m is not None:
        print(f"TRO-MENNESKE-K8-START {foer_m['k8']:.5f}", flush=True)
        print(f"TRO-MENNESKE-K8-BESTE {beste_m['k8']:.5f}", flush=True)


if __name__ == "__main__":
    main()
