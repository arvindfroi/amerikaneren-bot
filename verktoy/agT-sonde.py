#!/usr/bin/env python3
"""
SONDEN (agent T, 12. sep) — ER FLASKEHALSEN EN MANGLENDE SANS, ELLER EN UBRUKT SANS?

    python verktoy/agT-sonde.py --sonde a --tren "_agT/data/trening-*.bin" --hold "_agT/data/holdout-*.bin"
    python verktoy/agT-sonde.py --sonde b --tren ... --hold ...
    python verktoy/agT-sonde.py --sonde c --tren ... --hold ... --myk "_agT/myk/*.bin" --nett e1-modell/tro-6.bin

============================ HVORFOR ====================================

Maalt (agent P/R): trohodet naar 13 % av veien gulv -> det eksakte informasjonsrettferdige
taket naar setet er BUDVINNER, mot 41-48 % for makker og motspillere. En policy-blind
posterior (bare renonser og kapasitet) ligger nesten paa gulvet i budvinnerens stol. Nesten
all budvinnerinformasjon ligger altsaa i aa LESE HVORDAN motstanderne spiller.

Da er det to helt ulike diagnoser, og de peker paa hver sin loesning:

  MANGLENDE SANS   det som skiller motstandertypene staar ikke i de 996 inngangene i det
                   hele tatt. Da hjelper ingen arkitektur; det maa nye trekk til.
  UBRUKT SANS      det STAAR der, men nettet klarer ikke aa bruke det. Da er nye trekk
                   bortkastet, og arkitektur eller treningsmaal er svaret.

Sonden skiller dem ved aa spoerre om noe trohodet ALDRI blir bedt om: hvem er motstanderen?
Loekka spiller tre faste bord (`adams-max-loop-v7.sh`), saa hver rad HAR en kjent
motstandertype per sete. Kan en liten klassifikator lese typen ut av de samme 996 tallene,
saa er sansen der og ubrukt. Kan den ikke, mangler den.

  SONDE A  motstanderidentitet fra dagens 996 - i alt, og per blokk (hukommelse 144,
           signal 116, grunn 660, sanser2 76). Blokken som baerer identiteten er svaret paa
           HVILKEN sans som gjoer jobben.
  SONDE B  baerer REKKEFOELGEN noe aggregatene mangler? Samme rader, samme etiketter, samme
           budsjett: aggregat-MLP mot aggregat + GRU over den ordnede kortrekka.
  SONDE C  bor budvinnerens gap der identiteten er ukjent? Trohodets K8-tap mot det EKSAKTE
           rettferdige taket paa de samme radene, delt paa om sonde A traff typen.

============================ ETIKETTEN KAN IKKE LEKKE ====================

Etiketten staar ikke i korpuset. Den utledes av (froe, sete) og `<fil>.bord.json`:
kampnummeret er (froe - base)/steg, og slotten som satt i sete s er (s + kamp) mod 4. Trekkene
inneholder verken froe eller sete. `--felle` legger etiketten inn SOM en inngang; den armen
maa naa ~100 %, ellers er treningsloekka i stykker og hvert andre tall her verdiloest.

============================ SE ER KLYNGET PER KAMP ======================

To rader fra samme kamp deler bok, bord og kortfordeling. Binomisk SE over rader ville vaert
2-4x for liten. Alle SE her er bootstrap over KAMPER (`klynge_se`), og holdout er et eget
froebaand - disjunkt per kamp fra treningen ved konstruksjon, ikke per rad.
"""

import argparse
import glob
import importlib.util
import json
import os
import struct
import sys

import numpy
import torch
import torch.nn as nn
import torch.nn.functional as F

# MASKINBUDSJETT: treningsloekka eier maskinen. To traader, ikke 24.
torch.set_num_threads(2)

KORT = 52
KLASSER = 4
HODE = 12
# Blokkene i 996, samme tabell som `MLB_TRO_LAYOUT` i src/mlb/trotrekk.ts.
BLOKKER = [("grunn", 0, 660), ("hukommelse", 660, 804), ("signal", 804, 920), ("stilling", 920, 956), ("valgtbort", 956, 996)]
ROLLER = ["budvinner", "makker", "motspiller"]
TREKK_ER_BUDVINNER = 184
TREKK_ER_MAKKER = 280
SEKV_MAKS = 48
SEKV_FELT = 4


def last_trener():
    """`verktoy/mlb-tro-tren.py` som modul: vektleseren og K8-formen skal vaere DENS, ikke en kopi.

    Bindestreken i filnavnet gjoer den uimporterbar med `import`, og en kopi av `les_vekter`
    her ville drevet fra originalen neste gang formatet endres.
    """
    sti = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mlb-tro-tren.py")
    spec = importlib.util.spec_from_file_location("mlb_tro_tren", sti)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ===========================================================================
# Lesing: korpuset, sekvensfila og etikettene
# ===========================================================================


def les_korpus(monster):
    """MLBT versjon 1/2 -> dict med X, F, FRO, STIKK, SETE, ROLLE, MYK, P, og filnavn per rad.

    Egen leser fordi `les_mlbt` ikke returnerer SETE, og etiketten trenger det. Den krysstjekkes
    mot `les_mlbt` i `sjekk_leser` - en stille uenighet mellom de to ville flyttet hver etikett.
    """
    filer = []
    for m in monster.split(","):
        # LEDSAGERFILENE MAA UT: «trening-*.bin» treffer ogsaa «trening-0.bin.sekv.bin», og en
        # sekvensfil lest som korpus stopper foerst paa magien - i beste fall. Filtrert her, én gang.
        filer += [f for f in sorted(glob.glob(m)) if not f.endswith(".sekv.bin")]
    if not filer:
        raise SystemExit(f"Fant ingen filer for «{monster}»")
    ut = {k: [] for k in ("X", "F", "FRO", "STIKK", "SETE", "MYK", "P")}
    fil_av_rad = []
    dim = None
    for sti in filer:
        with open(sti, "rb") as fh:
            if fh.read(4) != b"MLBT":
                raise SystemExit(f"{sti}: ikke en MLBT-fil")
            (versjon,) = struct.unpack("<i", fh.read(4))
            (d,) = struct.unpack("<i", fh.read(4))
            if versjon not in (1, 2):
                raise SystemExit(f"{sti}: ukjent versjon {versjon}")
            if dim is None:
                dim = d
            elif d != dim:
                raise SystemExit(f"{sti}: dim {d}, ventet {dim}")
            felt = [("t", "<f4", (dim,)), ("f", "i1", (KORT,)), ("fro", "<i4"), ("stikk", "<i2"), ("sete", "<i2")]
            if versjon == 2:
                felt += [("rolle", "i1"), ("myk", "u1"), ("p", "<f4", (KORT * KLASSER,))]
            a = numpy.fromfile(fh, dtype=numpy.dtype(felt))
        ut["X"].append(a["t"].astype(numpy.float32))
        ut["F"].append(a["f"])
        ut["FRO"].append(a["fro"])
        ut["STIKK"].append(a["stikk"])
        ut["SETE"].append(a["sete"])
        if versjon == 2:
            ut["MYK"].append(a["myk"] == 1)
            ut["P"].append(a["p"].reshape(-1, KORT, KLASSER))
        else:
            ut["MYK"].append(numpy.zeros(len(a), dtype=bool))
            ut["P"].append(numpy.zeros((len(a), KORT, KLASSER), numpy.float32))
        fil_av_rad.append(numpy.full(len(a), len(fil_av_rad), dtype=numpy.int32))
        print(f"  {sti}: {len(a)} rader (versjon {versjon})", flush=True)
        del a
    d = {k: numpy.concatenate(v) for k, v in ut.items()}
    d["dim"] = dim
    d["filer"] = filer
    d["FIL"] = numpy.concatenate(fil_av_rad)
    bv = d["X"][:, TREKK_ER_BUDVINNER] > 0.5
    mk = (d["X"][:, TREKK_ER_MAKKER] > 0.5) & ~bv
    d["ROLLE"] = numpy.where(bv, 0, numpy.where(mk, 1, 2)).astype(numpy.int8)
    return d


def sjekk_leser(d, trener):
    """Krysstjekk mot `les_mlbt`: samme rader, samme trekk, samme froe. Ellers er alt etterpaa feil.

    Filliste, ikke moenster: `les_mlbt` globber hvert ledd, og moensteret ville dratt inn
    ledsagerfilene som `les_korpus` nettopp luket bort.
    """
    r = trener.les_mlbt(",".join(d["filer"]))
    if len(r["FRO"]) != len(d["FRO"]):
        raise SystemExit(f"leserne er uenige om antall rader: {len(r['FRO'])} mot {len(d['FRO'])}")
    if not numpy.array_equal(r["FRO"], d["FRO"]) or not numpy.array_equal(r["ST"], d["STIKK"]):
        raise SystemExit("leserne er uenige om froe/stikk - postlayouten er forskjoevet")
    if not numpy.array_equal(r["ROLLE"], d["ROLLE"]):
        raise SystemExit("leserne er uenige om rollen")
    if not numpy.allclose(r["X"].astype(numpy.float32), d["X"], atol=2e-3):
        raise SystemExit("leserne er uenige om trekkene")
    print(f"  leser-krysstjekk mot mlb-tro-tren.les_mlbt: OK ({len(d['FRO'])} rader)", flush=True)


def les_typer(sti):
    navn = {}
    with open(sti, encoding="utf-8") as fh:
        for linje in fh:
            if not linje.strip():
                continue
            n, spek = linje.rstrip("\n").split("\t", 1)
            navn[spek] = n
    return navn


def etiketter(d, navn):
    """Motstandertypen i hvert RELATIVT sete, utledet av (froe, sete) og bordmerket.

    Retur: L (N, 4) int8 med typeindeks per relativt sete (0 = meg selv, alltid kandidaten),
    KAMP (N,) int64 kampnummer, og navnelista. Kaster om froet ikke ligger paa baandets rutenett -
    da er merket fra en annen kjoering enn korpuset, og hver etikett ville vaert feil rad.
    """
    typenavn = sorted(set(navn.values()))
    indeks = {n: i for i, n in enumerate(typenavn)}
    N = len(d["FRO"])
    L = numpy.full((N, 4), -1, dtype=numpy.int8)
    KAMP = numpy.zeros(N, dtype=numpy.int64)
    for fi, fil in enumerate(d["filer"]):
        with open(f"{fil}.bord.json", encoding="utf-8") as fh:
            m = json.load(fh)
        maske = d["FIL"] == fi
        fro = d["FRO"][maske].astype(numpy.int64)
        rest = (fro - m["base"]) % m["steg"]
        if numpy.any(rest != 0):
            raise SystemExit(f"{fil}: {int((rest != 0).sum())} froe ligger ikke paa baandets rutenett - feil bordmerke")
        k = (fro - m["base"]) // m["steg"]
        KAMP[maske] = k
        sete = d["SETE"][maske].astype(numpy.int64)
        for r in range(4):
            s = ((sete + r) + k) % 4 if m["rotasjon"] else (sete + r) % 4
            spek = numpy.array([indeks[navn[m["spek"][int(x)]]] for x in s], dtype=numpy.int8)
            L[maske, r] = spek
    if numpy.any(L < 0):
        raise SystemExit("noen rader fikk ingen etikett")
    return L, KAMP, typenavn


def les_sekvens(d):
    """`<fil>.sekv.bin` -> (N, 48, 4) int16 og lengder (N,). Radrekkefoelgen er korpusets."""
    biter, lengder = [], []
    for fil in d["filer"]:
        sti = f"{fil}.sekv.bin"
        with open(sti, "rb") as fh:
            if fh.read(4) != b"MLBS":
                raise SystemExit(f"{sti}: ikke en MLBS-fil")
            (versjon,) = struct.unpack("<i", fh.read(4))
            (maks,) = struct.unpack("<i", fh.read(4))
            (felt,) = struct.unpack("<i", fh.read(4))
            if versjon != 1 or maks != SEKV_MAKS or felt != SEKV_FELT:
                raise SystemExit(f"{sti}: uventet hode {versjon}/{maks}/{felt}")
            a = numpy.fromfile(fh, dtype=numpy.dtype([("n", "<i2"), ("v", "<i2", (maks * felt,))]))
        biter.append(a["v"].reshape(-1, maks, felt))
        lengder.append(a["n"])
    V = numpy.concatenate(biter)
    L = numpy.concatenate(lengder)
    if len(V) != len(d["FRO"]):
        raise SystemExit(f"sekvensfilene har {len(V)} rader, korpuset {len(d['FRO'])} - de er ute av takt")
    return V, L


# ===========================================================================
# SE: bootstrap over KAMPER, ikke over rader
# ===========================================================================


def klynge_se(verdi, klynge, B=400, fro=20260912):
    """Bootstrap-SE der klyngen (kampen) trekkes med tilbakelegging. Rader i samme kamp er ikke uavhengige."""
    verdi = numpy.asarray(verdi, dtype=numpy.float64)
    if len(verdi) == 0:
        return float("nan"), float("nan")
    rng = numpy.random.default_rng(fro)
    unike, inv = numpy.unique(klynge, return_inverse=True)
    grupper = [numpy.flatnonzero(inv == i) for i in range(len(unike))]
    if len(grupper) < 2:
        return float(verdi.mean()), float("nan")
    snitt = numpy.empty(B)
    for b in range(B):
        valg = rng.integers(0, len(grupper), len(grupper))
        idx = numpy.concatenate([grupper[i] for i in valg])
        snitt[b] = verdi[idx].mean()
    return float(verdi.mean()), float(snitt.std(ddof=1))


def pp(snitt, se, skala=100):
    return f"{snitt * skala:.1f} +/- {se * skala:.1f}"


# ===========================================================================
# Modellene
# ===========================================================================


class MLP(nn.Module):
    def __init__(self, inn, ut, bredde=256):
        super().__init__()
        self.n = nn.Sequential(nn.Linear(inn, bredde), nn.ReLU(), nn.Linear(bredde, bredde // 2), nn.ReLU(), nn.Linear(bredde // 2, ut))

    def forward(self, x, s=None):
        return self.n(x)


class SekvensNett(nn.Module):
    """GRU over den ordnede kortrekka, eventuelt sammen med aggregatene.

    Padding (-1) maskeres bort ved aa pakke sekvensen: et steg med «sete -1, kort -1» ville ellers
    vaert et lovlig oppslag i embeddingen og lært som spill.
    """

    def __init__(self, ut, agg_inn=0, emb=24, skjult=96):
        super().__init__()
        self.e_sete = nn.Embedding(5, emb)
        self.e_kort = nn.Embedding(53, emb)
        self.e_stikk = nn.Embedding(13, emb // 2)
        self.e_pos = nn.Embedding(5, emb // 2)
        self.gru = nn.GRU(emb * 3, skjult, num_layers=2, batch_first=True)
        self.agg_inn = agg_inn
        d = skjult + (128 if agg_inn else 0)
        if agg_inn:
            self.agg = nn.Sequential(nn.Linear(agg_inn, 256), nn.ReLU(), nn.Linear(256, 128), nn.ReLU())
        self.hode = nn.Sequential(nn.Linear(d, 128), nn.ReLU(), nn.Linear(128, ut))

    def forward(self, x, s):
        # s: (B, 48, 4) int64 der padding er -1. +1 gjoer padding til indeks 0 i hver embedding.
        sete, kort, stikk, pos = s[:, :, 0] + 1, s[:, :, 1] + 1, s[:, :, 2] + 1, s[:, :, 3] + 1
        z = torch.cat([self.e_sete(sete), self.e_kort(kort), self.e_stikk(stikk), self.e_pos(pos)], dim=2)
        h, _ = self.gru(z)
        lengde = (s[:, :, 0] >= 0).sum(dim=1).clamp(min=1)
        siste = h[torch.arange(len(h)), lengde - 1]
        if self.agg_inn:
            siste = torch.cat([siste, self.agg(x)], dim=1)
        return self.hode(siste)


def tren_klassifikator(modell, Xt, St, yt, Xh, Sh, yh, epoker, batch, lr=1e-3, merke=""):
    opt = torch.optim.Adam(modell.parameters(), lr=lr)
    n = len(yt)
    for e in range(epoker):
        modell.train()
        perm = torch.randperm(n)
        sum_tap = 0.0
        for i in range(0, n, batch):
            j = perm[i : i + batch]
            opt.zero_grad()
            ut = modell(Xt[j], St[j] if St is not None else None)
            tap = F.cross_entropy(ut, yt[j])
            tap.backward()
            opt.step()
            sum_tap += float(tap) * len(j)
        modell.eval()
        with torch.no_grad():
            treff = []
            for i in range(0, len(yh), 4096):
                ut = modell(Xh[i : i + 4096], Sh[i : i + 4096] if Sh is not None else None)
                treff.append((ut.argmax(1) == yh[i : i + 4096]).numpy())
            treff = numpy.concatenate(treff)
        print(f"    {merke} epoke {e + 1}/{epoker}: tap {sum_tap / n:.4f}  holdout-treff {treff.mean() * 100:.1f} %", flush=True)
    return treff


# ===========================================================================
# SONDE A
# ===========================================================================


def sonde_a(args, trener):
    print("== SONDE A: er motstanderidentitet lesbar av dagens 996 trekk? ==", flush=True)
    navn = les_typer(args.typer)
    dt = les_korpus(args.tren)
    dh = les_korpus(args.hold)
    sjekk_leser(dt, trener)
    Lt, Kt, typenavn = etiketter(dt, navn)
    Lh, Kh, _ = etiketter(dh, navn)

    # HOLDOUT ER DISJUNKT PER KAMP: baandene er ulike, saa froene kan ikke overlappe. Sjekket, ikke antatt.
    felles = numpy.intersect1d(dt["FRO"], dh["FRO"])
    if len(felles):
        raise SystemExit(f"trening og holdout deler {len(felles)} froe - baandene overlapper")
    print(f"  trening {len(Lt)} rader / {len(numpy.unique(Kt))} kamper, holdout {len(Lh)} rader / {len(numpy.unique(Kh))} kamper", flush=True)
    print(f"  typer: {typenavn}", flush=True)
    for r in range(4):
        f = numpy.bincount(Lh[:, r], minlength=len(typenavn))
        print(f"  rel sete {r}: " + "  ".join(f"{typenavn[i]} {100 * f[i] / len(Lh):.1f} %" for i in range(len(typenavn)) if f[i]), flush=True)

    resultat = {"typer": typenavn, "rader": {"tren": len(Lt), "hold": len(Lh)}, "armer": []}
    Xt_full = torch.from_numpy(dt["X"])
    Xh_full = torch.from_numpy(dh["X"])

    armer = [("alle 996", 0, 996)] + [(f"bare {n}", a, b) for n, a, b in BLOKKER]
    for rel in args.rel:
        yt = torch.from_numpy(Lt[:, rel].astype(numpy.int64))
        yh_np = Lh[:, rel].astype(numpy.int64)
        yh = torch.from_numpy(yh_np)
        # Grunnraten: den vanligste typen i holdout. Alt en modell gjoer under dette er stoey.
        f = numpy.bincount(yh_np, minlength=len(typenavn))
        grunn = f.max() / len(yh_np)
        g_snitt, g_se = klynge_se((yh_np == f.argmax()).astype(float), Kh)
        print(f"\n  -- relativt sete {rel} -- grunnrate {pp(g_snitt, g_se)} % (alltid «{typenavn[f.argmax()]}»)", flush=True)
        if len(numpy.unique(yh_np)) < 2:
            print("     (bare én type i dette setet - degenerert, hoppes over)", flush=True)
            resultat["armer"].append({"rel": rel, "degenerert": True, "type": typenavn[int(f.argmax())]})
            continue

        for merke, a, b in armer:
            torch.manual_seed(20260912 + rel)
            modell = MLP(b - a, len(typenavn), args.bredde)
            treff = tren_klassifikator(modell, Xt_full[:, a:b], None, yt, Xh_full[:, a:b], None, yh, args.epoker, args.batch, merke=merke)
            snitt, se = klynge_se(treff.astype(float), Kh)
            print(f"    {merke:18s} topp-1 {pp(snitt, se)} %  (grunnrate {grunn * 100:.1f} %)", flush=True)
            rad = {"rel": rel, "arm": merke, "treff": snitt, "se": se, "grunnrate": grunn}
            # Per stikk og per rolle - der bæres identiteten sent eller tidlig?
            if a == 0 and b == 996:
                rad["perStikk"] = {}
                for s in sorted(set(dh["STIKK"].tolist())):
                    m = dh["STIKK"] == s
                    if m.sum() >= 50:
                        sn, sse = klynge_se(treff[m].astype(float), Kh[m])
                        rad["perStikk"][int(s)] = [sn, sse]
                        print(f"      stikk {s:2d}: {pp(sn, sse)} %  (n={int(m.sum())})", flush=True)
                rad["perRolle"] = {}
                for r in range(3):
                    m = dh["ROLLE"] == r
                    if m.sum() >= 50:
                        sn, sse = klynge_se(treff[m].astype(float), Kh[m])
                        rad["perRolle"][ROLLER[r]] = [sn, sse]
                        print(f"      {ROLLER[r]:11s}: {pp(sn, sse)} %  (n={int(m.sum())})", flush=True)
                numpy.save(args.ut.replace(".json", f"-gjett-rel{rel}.npy"), treff)
            resultat["armer"].append(rad)

        if args.felle:
            # FELLA: etiketten som inngang. Naar denne ikke er ~100 %, er treningsloekka i stykker.
            torch.manual_seed(1)
            ekstra_t = F.one_hot(yt, len(typenavn)).float()
            ekstra_h = F.one_hot(yh, len(typenavn)).float()
            modell = MLP(996 + len(typenavn), len(typenavn), args.bredde)
            treff = tren_klassifikator(
                modell, torch.cat([Xt_full, ekstra_t], 1), None, yt, torch.cat([Xh_full, ekstra_h], 1), None, yh, 1, args.batch, merke="FELLE"
            )
            snitt, se = klynge_se(treff.astype(float), Kh)
            ok = snitt > 0.99
            print(f"    {'FELLE (etikett inn)':18s} topp-1 {pp(snitt, se)} %  -> {'FELLA BLE TATT' if ok else 'ADVARSEL: fella slapp unna'}", flush=True)
            resultat["armer"].append({"rel": rel, "arm": "felle", "treff": snitt, "se": se, "tatt": bool(ok)})

    with open(args.ut, "w", encoding="utf-8") as fh:
        json.dump(resultat, fh, indent=1)
    print(f"\n  -> {args.ut}", flush=True)


# ===========================================================================
# SONDE B
# ===========================================================================


def sonde_b(args, trener):
    print("== SONDE B: baerer rekkefoelgen noe aggregatene mangler? ==", flush=True)
    navn = les_typer(args.typer)
    dt = les_korpus(args.tren)
    dh = les_korpus(args.hold)
    Lt, Kt, typenavn = etiketter(dt, navn)
    Lh, Kh, _ = etiketter(dh, navn)
    Vt, _ = les_sekvens(dt)
    Vh, _ = les_sekvens(dh)

    # Delutvalg: GRU over 48 steg paa to traader er det dyre her, ikke MLP-en.
    rng = numpy.random.default_rng(7)
    it = rng.permutation(len(Lt))[: args.maks_tren]
    ih = numpy.arange(len(Lh)) if args.maks_hold >= len(Lh) else rng.permutation(len(Lh))[: args.maks_hold]
    print(f"  delutvalg: {len(it)} treningsrader, {len(ih)} holdoutrader", flush=True)

    Xt = torch.from_numpy(dt["X"][it])
    Xh = torch.from_numpy(dh["X"][ih])
    St = torch.from_numpy(Vt[it].astype(numpy.int64))
    Sh = torch.from_numpy(Vh[ih].astype(numpy.int64))
    Khs = Kh[ih]

    resultat = {"rader": {"tren": len(it), "hold": len(ih)}, "armer": []}
    for rel in args.rel:
        yt_np, yh_np = Lt[it, rel].astype(numpy.int64), Lh[ih, rel].astype(numpy.int64)
        if len(numpy.unique(yh_np)) < 2:
            print(f"  rel sete {rel}: degenerert, hoppes over", flush=True)
            continue
        yt, yh = torch.from_numpy(yt_np), torch.from_numpy(yh_np)
        f = numpy.bincount(yh_np, minlength=len(typenavn))
        print(f"\n  -- relativt sete {rel} -- grunnrate {100 * f.max() / len(yh_np):.1f} %", flush=True)
        for merke, lag in [
            ("aggregat (MLP 996)", lambda: MLP(996, len(typenavn), args.bredde)),
            ("bare rekka (GRU)", lambda: SekvensNett(len(typenavn))),
            ("aggregat + rekka", lambda: SekvensNett(len(typenavn), agg_inn=996)),
        ]:
            torch.manual_seed(20260912 + rel)
            modell = lag()
            treff = tren_klassifikator(modell, Xt, St, yt, Xh, Sh, yh, args.epoker, args.batch, merke=merke)
            snitt, se = klynge_se(treff.astype(float), Khs)
            print(f"    {merke:20s} topp-1 {pp(snitt, se)} %", flush=True)
            resultat["armer"].append({"rel": rel, "arm": merke, "treff": snitt, "se": se})

    with open(args.ut, "w", encoding="utf-8") as fh:
        json.dump(resultat, fh, indent=1)
    print(f"\n  -> {args.ut}", flush=True)


# ===========================================================================
# SONDE C
# ===========================================================================


def k8_mot_posterior(q_logits, P, F_maske):
    """Forventet én-hot-K8 under posterioren, per rad: sum_c sum_k<3 p_ck (-log q3_ck) / sum p.

    NOEYAKTIG broeken `mlb-tro-tren.py --myk` bruker (`maal`, «k8_myk»), saa taket og nettet maales
    med samme linjal. Med q = p er dette takets eget tap (entropien til den renormaliserte posterioren).
    """
    p3 = torch.from_numpy(P[:, :, :3]).float()
    lq3 = F.log_softmax(q_logits[:, :, :3].float(), dim=2)
    maske = torch.from_numpy((F_maske > 0).astype(numpy.float32))
    teller = (-(p3 * lq3).sum(dim=2) * maske).sum(dim=1)
    nevner = (p3.sum(dim=2) * maske).sum(dim=1)
    return teller.numpy(), nevner.numpy()


def sonde_c(args, trener):
    print("== SONDE C: bor budvinnerens gap der identiteten er ukjent? ==", flush=True)
    navn = les_typer(args.typer)
    dm = les_korpus(args.myk)
    Lm, Km, typenavn = etiketter(dm, navn)
    myk = dm["MYK"]
    print(f"  {len(myk)} rader, {int(myk.sum())} med eksakt posterior ({100 * myk.mean():.1f} %)", flush=True)
    if myk.sum() < 50:
        raise SystemExit("for faa myke rader til aa konkludere - oek --kamper i myk-kjoeringen")

    # Trohodet som loekka bruker naa.
    dims = trener.les_dims(args.nett)
    modell = trener.Tronett(dims)
    trener.les_vekter(args.nett, modell)
    modell.eval()
    X = torch.from_numpy(dm["X"])
    with torch.no_grad():
        logits = torch.cat([modell(X[i : i + 2048]) for i in range(0, len(X), 2048)])

    t_nett, n_nett = k8_mot_posterior(logits, dm["P"], dm["F"])
    # TAKET: posterioren scoret mot seg selv, samme broek. Differansen er det nettet lar ligge.
    tak_logits = torch.log(torch.from_numpy(dm["P"]).float().clamp(min=1e-12))
    t_tak, _ = k8_mot_posterior(tak_logits, dm["P"], dm["F"])

    gyldig = myk & (n_nett > 0)
    nett_tap = t_nett[gyldig] / n_nett[gyldig]
    tak_tap = t_tak[gyldig] / n_nett[gyldig]
    gap = nett_tap - tak_tap
    rolle = dm["ROLLE"][gyldig]
    kamp = Km[gyldig]

    resultat = {"myke_rader": int(gyldig.sum()), "deler": [], "identitet": []}
    sn, se = klynge_se(nett_tap, kamp)
    tn, tse = klynge_se(tak_tap, kamp)
    gn, gse = klynge_se(gap, kamp)
    print(f"  alle myke rader (n={int(gyldig.sum())}): nett {sn:.4f} +/- {se:.4f}, tak {tn:.4f} +/- {tse:.4f}, gap {gn:.4f} +/- {gse:.4f}", flush=True)
    resultat["alle"] = {"n": int(gyldig.sum()), "nett": [sn, se], "tak": [tn, tse], "gap": [gn, gse]}

    for r in range(3):
        m = rolle == r
        if m.sum() < 20:
            continue
        gn_, gse_ = klynge_se(gap[m], kamp[m])
        nn_, nse = klynge_se(nett_tap[m], kamp[m])
        tn_, tse_ = klynge_se(tak_tap[m], kamp[m])
        print(f"    {ROLLER[r]:11s} n={int(m.sum()):5d}  nett {nn_:.4f} +/- {nse:.4f}  tak {tn_:.4f} +/- {tse_:.4f}  gap {gn_:.4f} +/- {gse_:.4f}", flush=True)
        resultat["deler"].append({"rolle": ROLLER[r], "n": int(m.sum()), "nett": [nn_, nse], "tak": [tn_, tse_], "gap": [gn_, gse_]})

    # =======================================================================
    # BOR GAPET DER IDENTITETEN ER UKJENT?
    #
    # Sonde A sier om typen ER lesbar. Her spoerres det dyrere spoersmaalet: paa de radene
    # der sonden BOMMER paa typen, er nettet lengre fra taket enn der den treffer? Er svaret
    # ja, peker gapet mot identitet; er svaret nei, ligger gapet et annet sted, og mer
    # motstanderlesing er feil medisin.
    #
    # Identitetsmodellen trenes paa TRENINGSBAANDET og brukes paa myk-radene, som ligger i
    # holdout-baandet: disjunkt per kamp, saa treffet her ikke er innlaering.
    # =======================================================================
    rel = args.rel[0]
    dt = les_korpus(args.tren)
    Lt, Kt, typenavn_t = etiketter(dt, navn)
    if typenavn_t != typenavn:
        raise SystemExit("typelistene i trening og myk er ulike")
    felles = numpy.intersect1d(dt["FRO"], dm["FRO"])
    if len(felles):
        raise SystemExit(f"myk-radene deler {len(felles)} froe med treningen - identitetstreffet ville vaert innlaering")
    torch.manual_seed(20260912)
    id_modell = MLP(996, len(typenavn), args.bredde)
    yt = torch.from_numpy(Lt[:, rel].astype(numpy.int64))
    Xt = torch.from_numpy(dt["X"])
    opt = torch.optim.Adam(id_modell.parameters(), lr=1e-3)
    for e in range(args.epoker):
        id_modell.train()
        perm = torch.randperm(len(yt))
        for i in range(0, len(yt), args.batch):
            j = perm[i : i + args.batch]
            opt.zero_grad()
            F.cross_entropy(id_modell(Xt[j]), yt[j]).backward()
            opt.step()
    id_modell.eval()
    with torch.no_grad():
        gjett = torch.cat([id_modell(X[i : i + 4096]).argmax(1) for i in range(0, len(X), 4096)]).numpy()
    riktig = (gjett == Lm[:, rel])[gyldig]
    rn, rse = klynge_se(riktig.astype(float), kamp)
    print(f"\n  identitet i rel sete {rel} truffet paa {pp(rn, rse)} % av de myke radene", flush=True)
    resultat["identitet_treff"] = [rn, rse]

    for merke, m in [("hele utvalget", numpy.ones(len(riktig), bool)), ("budvinner", rolle == 0), ("ikke budvinner", rolle != 0)]:
        for tm, tmerke in [(riktig & m, "type TRUFFET"), (~riktig & m, "type BOMMET")]:
            if tm.sum() < 20:
                print(f"    {merke:15s} {tmerke:13s} n={int(tm.sum()):4d}  - for faa rader til aa konkludere", flush=True)
                resultat["identitet"].append({"del": merke, "traff": tmerke, "n": int(tm.sum()), "gap": None})
                continue
            gn_, gse_ = klynge_se(gap[tm], kamp[tm])
            nn_, _ = klynge_se(nett_tap[tm], kamp[tm])
            tn_, _ = klynge_se(tak_tap[tm], kamp[tm])
            print(f"    {merke:15s} {tmerke:13s} n={int(tm.sum()):4d}  nett {nn_:.4f}  tak {tn_:.4f}  gap {gn_:.4f} +/- {gse_:.4f}", flush=True)
            resultat["identitet"].append({"del": merke, "traff": tmerke, "n": int(tm.sum()), "nett": nn_, "tak": tn_, "gap": [gn_, gse_]})

    with open(args.ut, "w", encoding="utf-8") as fh:
        json.dump(resultat, fh, indent=1)
    print(f"\n  -> {args.ut}", flush=True)


# ===========================================================================
# SONDE D
# ===========================================================================


def k8_enhot(logits, Fa):
    """Én-hot-K8 per rad: -log q3 for kortene som ER paa en haand, renormalisert over de tre setene.

    Samme form som `mlb-tro-tren.py --> maal()['k8']`, som er maaltallet loekka doemmer troen paa.
    Retur: (radsnitt, gyldig) - rader uten et eneste kort paa haand er ikke tap, de er tomme.
    """
    mal = torch.from_numpy(Fa.astype(numpy.int64))
    maske = mal > 0
    t = (mal - 1).clamp(min=0)
    m3 = maske & (mal <= 3)
    lp = F.log_softmax(logits[:, :, :3].float(), dim=2)
    valgt = lp.gather(2, t.clamp(max=2).unsqueeze(2)).squeeze(2)
    tap = (-valgt * m3.float()).sum(dim=1)
    ant = m3.float().sum(dim=1)
    gyldig = (ant > 0).numpy()
    rad = numpy.zeros(len(Fa), dtype=numpy.float64)
    rad[gyldig] = (tap[torch.from_numpy(gyldig)] / ant[torch.from_numpy(gyldig)]).numpy()
    return rad, gyldig


def sonde_d(args, trener):
    """BRUKES identiteten? Sonde A viste at den er LESBAR - av en egen klassifikator med bare den jobben.

    Det er en OEVRE grense for hva trohodet faktisk henter ut, ikke et maal paa det. Her trenes selve
    trooppgaven (52 x 4) tre ganger paa samme rader og samme budsjett:

      alle 996                dagens inngang
      996 uten hukommelse     hukommelsesblokken nullet. Faller K8 ikke, brukes identiteten ikke.
      996 + sann identitet    fasitidentiteten for rel 1 og rel 3 servert som én-hot. Loefter DET ikke
                              K8, er mer motstanderlesing feil medisin - da er flaskehalsen ikke hvem
                              motstanderen er.

    Den siste armen er et ORAKEL og skal aldri inn i boten; den staar her for aa sette taket paa hva
    identitetskunnskap i det hele tatt kan vaere verdt for troen.
    """
    print("== SONDE D: BRUKER trohodet identiteten, og hva er den verdt? ==", flush=True)
    navn = les_typer(args.typer)
    dt = les_korpus(args.tren)
    dh = les_korpus(args.hold)
    Lt, Kt, typenavn = etiketter(dt, navn)
    Lh, Kh, _ = etiketter(dh, navn)
    print(f"  trening {len(Lt)} rader, holdout {len(Lh)} rader", flush=True)

    kap_treff, kap_k8 = trener.kapasitetsreferanse(dh["F"])
    print(f"  referanser: gulv (uniform over 3) 1,0986   kapasitetstelleren {kap_k8:.4f}", flush=True)

    Ft = torch.from_numpy(dt["F"].astype(numpy.int64))
    idt = numpy.concatenate([numpy.eye(len(typenavn), dtype=numpy.float32)[Lt[:, r]] for r in (1, 3)], axis=1)
    idh = numpy.concatenate([numpy.eye(len(typenavn), dtype=numpy.float32)[Lh[:, r]] for r in (1, 3)], axis=1)

    resultat = {"gulv": 1.0986, "kapasitet": kap_k8, "armer": []}
    for merke in ["alle 996", "996 uten hukommelse", "996 + sann identitet"]:
        Xt, Xh = dt["X"].copy(), dh["X"].copy()
        if merke == "996 uten hukommelse":
            Xt[:, 660:804] = 0
            Xh[:, 660:804] = 0
        if merke == "996 + sann identitet":
            Xt = numpy.concatenate([Xt, idt], axis=1)
            Xh = numpy.concatenate([Xh, idh], axis=1)
        Xt_t, Xh_t = torch.from_numpy(Xt), torch.from_numpy(Xh)
        torch.manual_seed(20260912)
        modell = trener.Tronett([Xt.shape[1], 512, 256, KORT * KLASSER])
        opt = torch.optim.Adam(modell.parameters(), lr=1e-3)
        for e in range(args.epoker):
            modell.train()
            perm = torch.randperm(len(Xt_t))
            for i in range(0, len(perm), args.batch):
                j = perm[i : i + args.batch]
                opt.zero_grad()
                ut = modell(Xt_t[j])
                mal = Ft[j]
                maske = mal > 0
                F.cross_entropy(ut[maske], (mal - 1).clamp(min=0)[maske]).backward()
                opt.step()
            modell.eval()
            with torch.no_grad():
                logits = torch.cat([modell(Xh_t[i : i + 4096]) for i in range(0, len(Xh_t), 4096)])
            rad, gyldig = k8_enhot(logits, dh["F"])
            print(f"    {merke} epoke {e + 1}/{args.epoker}: holdout-K8 {rad[gyldig].mean():.4f}", flush=True)
        sn, se = klynge_se(rad[gyldig], Kh[gyldig])
        print(f"    {merke:22s} K8 {sn:.4f} +/- {se:.4f}  (n={int(gyldig.sum())} rader)", flush=True)
        arm = {"arm": merke, "k8": sn, "se": se, "n": int(gyldig.sum()), "perRolle": {}}
        # PER ROLLE: hele fenomenet er budvinnerspesifikt (13 % av veien til taket mot 41-48 %),
        # saa et pooled tall kan skjule at hukommelsen betyr noe i NOEYAKTIG den stolen og ingen andre.
        for r in range(3):
            m = gyldig & (dh["ROLLE"] == r)
            if m.sum() < 50:
                continue
            rn, rse = klynge_se(rad[m], Kh[m])
            arm["perRolle"][ROLLER[r]] = [rn, rse, int(m.sum())]
            print(f"      {ROLLER[r]:11s} K8 {rn:.4f} +/- {rse:.4f}  (n={int(m.sum())})", flush=True)
        resultat["armer"].append(arm)
        del Xt, Xh, Xt_t, Xh_t

    with open(args.ut, "w", encoding="utf-8") as fh:
        json.dump(resultat, fh, indent=1)
    print(f"\n  -> {args.ut}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sonde", required=True, choices=["a", "b", "c", "d"])
    ap.add_argument("--tren", default="_agT/data/trening-*.bin")
    ap.add_argument("--hold", default="_agT/data/holdout-*.bin")
    ap.add_argument("--myk", default="_agT/myk/*.bin")
    ap.add_argument("--typer", default="_agT/typer.tsv")
    ap.add_argument("--nett", default="e1-modell/tro-6.bin")
    ap.add_argument("--ut", default="analyse/agT-sonde.json")
    ap.add_argument("--rel", type=int, nargs="+", default=[1, 3], help="hvilke relative seter (2 er makkeren = kandidaten)")
    ap.add_argument("--epoker", type=int, default=4)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--bredde", type=int, default=256)
    ap.add_argument("--maks-tren", type=int, default=25000, dest="maks_tren")
    ap.add_argument("--maks-hold", type=int, default=8000, dest="maks_hold")
    ap.add_argument("--felle", action="store_true", help="kjoer felle-armen: etiketten som inngang maa gi ~100 %%")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    trener = last_trener()
    {"a": sonde_a, "b": sonde_b, "c": sonde_c, "d": sonde_d}[args.sonde](args, trener)


if __name__ == "__main__":
    main()
