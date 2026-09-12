#!/usr/bin/env python3
"""
BAERER DEN ORDNEDE KORTREKKA NOE PAA SELVE TROOPPGAVEN? (agent OE, 12. sep)

    bash /d/amb-k8/py-wsl.sh verktoy/agOE-rekke-k8.py \
        --tren "_agOE/data/trening-*.bin" --hold "_agOE/data/holdout-*.bin" \
        --epoker 60 --froe 3 --ut analyse/agOE-rekke-k8.json

============================ HVORFOR EN NY MAALING ======================

Agent T (sonde B) maalte rekka paa en STEDFORTREDER: kan en liten GRU gjette motstanderens
TYPE? Svaret var «nei, ikke utover aggregatene», men med tre forbehold agent T selv skrev ned:
to CPU-traader, tre epoker, og «GRU-en er en svak leser». En svak leser som ikke finner noe,
har ikke vist at det ikke er noe der. Og typegjettingen er dessuten ikke oppgaven: boten skal
ikke navngi motstanderen, den skal vite HVOR KORTENE LIGGER.

Her maales derfor selve trooppgaven, K8 paa holdout - det samme maaltallet `mlb-tro-tren.py`
optimerer og kravet stiller - med tre armer paa NOEYAKTIG de samme radene:

    (a) aggregat        de 996 trekkene alene (produksjonens egen inngang)
    (b) aggregat+rekke  de 996 OG den ordnede kortrekka
    (c) rekke           bare rekka
    (d) aggregat+       de 996 alene, men BRED - like mange vekter som (b)

Vinner (b) ikke over (a) med et gap som er stoert mot den PARREDE spredningen, baerer ordenen
ingenting for troen - og da skal blokken ikke inn i boten, uansett hvor riktig den foeles.

HVORFOR (d) FINNES: (b) er stoerre enn (a) - 3,16 M vekter mot 2,31 M - fordi rekkeleseren
selv er vekter. Et negativt gap (b) - (a) kan derfor bety to helt ulike ting: at ORDENEN
baerer, eller bare at den armen fikk mer aa regne med. Roeyken (én epoke) viste nettopp et
saant gap, og det er ikke lesbart som en dom uten (d). Slaar (d) det samme gapet uten aa se
ett eneste kort i rekkefoelge, var svaret kapasitet - og da er den riktige laerdommen for
loekka «gjoer trostammen bredere», ikke «bygg en sekvensblokk».

============================ HVA SOM ER RETTET FRA SONDE B ==============

  KAPASITET   GRU-en er 2 x 256 (ikke 96), med bade siste steg og maskert middel inn i hodet.
  BUDSJETT    alle radene (~92 000 trening), ikke 25 000; opptil --epoker med tidlig stopp paa
              holdout-K8, ikke tre faste epoker. Armene deler epoketak, optimerer og laeringsrate.
  BEGGE SETER trooppgaven har alle tre relative setene i utgangen per konstruksjon; agent T
              maalte bare rel sete 1. Rapporten her er per ROLLE (budvinner, makker, motspiller)
              og per stikk, som er de skillene kravet faktisk bryr seg om.
  FROE        hver arm trenes med --froe ulike startvekter. Uten det kan et gap paa 0,003 nat
              vaere hvilken tilfeldig start som traff best.

============================ SPREDNINGEN ================================

SE-en er en BOOTSTRAP OVER KAMPER, ikke over rader: to rader fra samme kamp deler kortfordeling
og bok, og en radvis SE ville vaert altfor optimistisk. Og dommen leses av den PARREDE
forskjellen (b) - (a) paa de samme radene i de samme kampene, som fjerner det meste av stoeyen
som rammer begge armene likt. En arm-SE paa 0,02 kan skjule en parret forskjell paa 0,002.

Resultatet skrives av prosessen selv til --ut, aldri gjennom et stdout-roer.
"""

import argparse
import glob
import json
import os
import struct
import sys
import time

import numpy
import torch
import torch.nn as nn
import torch.nn.functional as F

KORT = 52
KLASSER = 4
DIM = 996
SEKV_MAKS = 48
SEKV_FELT = 4
ROLLER = ["budvinner", "makker", "motspiller"]
# `src/neat/trekk.ts`: ER_BUDVINNER 184, ER_HEMMELIG_MAKKER 280 - samme avlesning som mlb-tro-tren.py.
TREKK_ER_BUDVINNER = 184
TREKK_ER_MAKKER = 280


def rolle_fra_trekk(t):
    bv = t[:, TREKK_ER_BUDVINNER] > 0.5
    mk = (t[:, TREKK_ER_MAKKER] > 0.5) & ~bv
    return numpy.where(bv, 0, numpy.where(mk, 1, 2)).astype(numpy.int8)


def les(monster):
    """Korpus + sekvensfil, i takt. Returnerer dict med X, F, FRO, ST, ROLLE, V, N."""
    filer = []
    for m in monster.split(","):
        filer += [f for f in sorted(glob.glob(m)) if not f.endswith(".sekv.bin")]
    if not filer:
        raise SystemExit("fant ingen filer for «%s»" % monster)
    Xs, Fs, FROs, STs, Vs, Ns = [], [], [], [], [], []
    for sti in filer:
        with open(sti, "rb") as fh:
            if fh.read(4) != b"MLBT":
                raise SystemExit("%s: ikke en MLBT-fil" % sti)
            (versjon,) = struct.unpack("<i", fh.read(4))
            (dim,) = struct.unpack("<i", fh.read(4))
            if versjon != 1:
                raise SystemExit("%s: versjon %d, ventet 1" % (sti, versjon))
            if dim != DIM:
                raise SystemExit("%s: dim %d, ventet %d" % (sti, dim, DIM))
            felt = [("t", "<f4", (dim,)), ("f", "i1", (KORT,)), ("fro", "<i4"), ("stikk", "<i2"), ("sete", "<i2")]
            a = numpy.fromfile(fh, dtype=numpy.dtype(felt))
        with open(sti + ".sekv.bin", "rb") as fh:
            if fh.read(4) != b"MLBS":
                raise SystemExit("%s.sekv.bin: ikke en MLBS-fil" % sti)
            versjon, maks, sfelt = struct.unpack("<iii", fh.read(12))
            if versjon != 1 or maks != SEKV_MAKS or sfelt != SEKV_FELT:
                raise SystemExit("%s.sekv.bin: uventet hode" % sti)
            b = numpy.fromfile(fh, dtype=numpy.dtype([("n", "<i2"), ("v", "<i2", (maks * sfelt,))]))
        if len(b) != len(a):
            raise SystemExit("%s: korpuset har %d rader, sekvensfila %d" % (sti, len(a), len(b)))
        V = b["v"].reshape(-1, maks, sfelt).astype(numpy.int16)
        N = b["n"].astype(numpy.int16)
        # TAKTEN PROEVES HER OGSAA, ikke bare i revisjonen: en treningskjoering som leser en
        # forskjoevet sekvensfil ville maalt rekka til feil stilling og rapportert det som en null.
        ute = int(((N // 4) != a["stikk"]).sum())
        if ute:
            raise SystemExit("%s: %d rader der n//4 != stikk - sekvensfila er ute av takt" % (sti, ute))
        Xs.append(a["t"])
        Fs.append(a["f"])
        FROs.append(a["fro"])
        STs.append(a["stikk"])
        Vs.append(V)
        Ns.append(N)
    X = numpy.concatenate(Xs)
    return {
        "X": X,
        "F": numpy.concatenate(Fs),
        "FRO": numpy.concatenate(FROs),
        "ST": numpy.concatenate(STs),
        "ROLLE": rolle_fra_trekk(X),
        "V": numpy.concatenate(Vs),
        "N": numpy.concatenate(Ns),
    }


# ===========================================================================
# Modellene. Felles hode, saa armene skiller seg i HVA de ser - ikke i hvordan
# utgangen er formet.
# ===========================================================================


class AggStamme(nn.Module):
    """Produksjonens egen form: 996 -> 1024 -> 768 -> 512.

    `skjulte` finnes for KAPASITETSARMEN (`agg+`): den samme inngangen, men bredere, saa
    parametertallet moeter agg+rekke. Uten den kan ikke et negativt gap skilles fra at den
    ene armen rett og slett er stoerre."""

    def __init__(self, inn=DIM, ut=512, skjulte=(1024, 768)):
        super().__init__()
        h1, h2 = skjulte
        self.n = nn.Sequential(nn.Linear(inn, h1), nn.ReLU(), nn.Linear(h1, h2), nn.ReLU(), nn.Linear(h2, ut), nn.ReLU())
        self.ut = ut

    def forward(self, x, s=None, n=None):
        return self.n(x)


class RekkeStamme(nn.Module):
    """GRU over den ordnede kortrekka. Padding (-1) blir indeks 0 i hver embedding og maskeres
    bort i middelet; siste GYLDIGE steg og det maskerte middelet gaar begge inn i hodet, saa
    leseren ikke er avhengig av at alt maa gjennom én siste tilstand."""

    def __init__(self, emb=32, skjult=256, ut=256, lag=2):
        super().__init__()
        self.e_sete = nn.Embedding(5, emb)
        self.e_kort = nn.Embedding(53, emb)
        self.e_stikk = nn.Embedding(14, emb // 2)
        self.e_pos = nn.Embedding(5, emb // 2)
        self.gru = nn.GRU(emb * 3, skjult, num_layers=lag, batch_first=True)
        self.ned = nn.Sequential(nn.Linear(skjult * 2, ut), nn.ReLU())
        self.ut = ut

    def forward(self, x, s, n):
        sete, kort, stikk, pos = s[:, :, 0] + 1, s[:, :, 1] + 1, s[:, :, 2] + 1, s[:, :, 3] + 1
        z = torch.cat([self.e_sete(sete), self.e_kort(kort), self.e_stikk(stikk), self.e_pos(pos)], dim=2)
        h, _ = self.gru(z)
        gyldig = (s[:, :, 0] >= 0).float().unsqueeze(2)
        lengde = gyldig.sum(dim=1).clamp(min=1)
        siste = h[torch.arange(len(h), device=h.device), (lengde.squeeze(1).long() - 1).clamp(min=0)]
        middel = (h * gyldig).sum(dim=1) / lengde
        return self.ned(torch.cat([siste, middel], dim=1))


class BeggeStamme(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = AggStamme()
        self.r = RekkeStamme()
        self.ut = self.a.ut + self.r.ut

    def forward(self, x, s, n):
        return torch.cat([self.a(x), self.r(x, s, n)], dim=1)


class Tronett(nn.Module):
    """Stamme + det samme 52x4-hodet for alle armene."""

    def __init__(self, stamme):
        super().__init__()
        self.stamme = stamme
        self.hode = nn.Linear(stamme.ut, KORT * KLASSER)

    def forward(self, x, s, n):
        return self.hode(self.stamme(x, s, n)).view(-1, KORT, KLASSER)


# ===========================================================================
# K8: log-tap over de TRE setene, renormalisert, betinget paa at kortet ER paa
# en haand. Samme broek som mlb-tro-tren.py - ellers maaler armene noe annet
# enn kravet.
# ===========================================================================


@torch.no_grad()
def k8_per_rad(modell, X, S, N, Fa, batch):
    """(sum -log q per rad, antall kort per rad). Per rad, saa bootstrap over kamper kan gjoeres."""
    sums, ants = [], []
    for i in range(0, len(X), batch):
        ut = modell(X[i : i + batch].float(), S[i : i + batch].long(), N[i : i + batch])
        mal = Fa[i : i + batch]
        m3 = (mal > 0) & (mal <= 3)
        t = (mal - 1).clamp(min=0, max=2)
        lp = F.log_softmax(ut[:, :, :3].float(), dim=2)
        valgt = lp.gather(2, t.unsqueeze(2)).squeeze(2)
        sums.append((-valgt * m3.float()).sum(dim=1).cpu().numpy())
        ants.append(m3.sum(dim=1).cpu().numpy())
    return numpy.concatenate(sums).astype(numpy.float64), numpy.concatenate(ants).astype(numpy.float64)


def forhold(sum_, ant):
    a = ant.sum()
    return float(sum_.sum() / a) if a > 0 else float("nan")


def klynge_bootstrap(sum_, ant, klynge, B=500, froe=20260912):
    """SE for K8 = sum/ant, der KAMPEN trekkes med tilbakelegging. Rader i samme kamp henger sammen."""
    if len(sum_) == 0 or ant.sum() == 0:
        return float("nan"), float("nan")
    rng = numpy.random.default_rng(froe)
    unike, inv = numpy.unique(klynge, return_inverse=True)
    if len(unike) < 2:
        return forhold(sum_, ant), float("nan")
    orden = numpy.argsort(inv, kind="stable")
    grenser = numpy.searchsorted(inv[orden], numpy.arange(len(unike) + 1))
    gs = numpy.add.reduceat(sum_[orden], grenser[:-1])
    ga = numpy.add.reduceat(ant[orden], grenser[:-1])
    trekk = rng.integers(0, len(unike), (B, len(unike)))
    bs = gs[trekk].sum(axis=1)
    ba = ga[trekk].sum(axis=1)
    ba[ba == 0] = 1
    return forhold(sum_, ant), float((bs / ba).std(ddof=1))


def parret_bootstrap(sA, aA, sB, aB, klynge, B=500, froe=20260912):
    """SE for forskjellen K8(B) - K8(A) paa de SAMME radene. Fjerner stoeyen som rammer begge likt."""
    rng = numpy.random.default_rng(froe)
    unike, inv = numpy.unique(klynge, return_inverse=True)
    if len(unike) < 2:
        return forhold(sB, aB) - forhold(sA, aA), float("nan")
    orden = numpy.argsort(inv, kind="stable")
    grenser = numpy.searchsorted(inv[orden], numpy.arange(len(unike) + 1))
    gsA = numpy.add.reduceat(sA[orden], grenser[:-1])
    gsB = numpy.add.reduceat(sB[orden], grenser[:-1])
    ga = numpy.add.reduceat(aA[orden], grenser[:-1])
    trekk = rng.integers(0, len(unike), (B, len(unike)))
    na = ga[trekk].sum(axis=1)
    na[na == 0] = 1
    d = gsB[trekk].sum(axis=1) / na - gsA[trekk].sum(axis=1) / na
    return forhold(sB, aB) - forhold(sA, aA), float(d.std(ddof=1))


def tren_arm(navn, lag_stamme, d_tr, d_ho, args, enhet, froe):
    """Trener én arm og gir per-rad-K8 paa holdout for den BESTE epoken (tidlig stopp)."""
    torch.manual_seed(froe)
    modell = Tronett(lag_stamme()).to(enhet)
    par = sum(p.numel() for p in modell.parameters())
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)
    Xt, St, Nt, Ft = d_tr["Xt"], d_tr["St"], d_tr["Nt"], d_tr["Ft"]
    Xh, Sh, Nh, Fh = d_ho["Xt"], d_ho["St"], d_ho["Nt"], d_ho["Ft"]
    n = len(Xt)
    beste, beste_epoke, taalmod = float("inf"), 0, 0
    beste_sum, beste_ant = None, None
    t0 = time.time()
    for e in range(args.epoker):
        modell.train()
        perm = torch.randperm(n, device=enhet)
        sum_tap, n_tap = 0.0, 0
        for i in range(0, n, args.batch):
            j = perm[i : i + args.batch]
            ut = modell(Xt[j].float(), St[j].long(), Nt[j])
            mal = Ft[j]
            maske = mal > 0
            if not bool(maske.any()):
                continue
            t = (mal - 1).clamp(min=0)
            tap = F.cross_entropy(ut[maske], t[maske], reduction="mean")
            opt.zero_grad(set_to_none=True)
            tap.backward()
            opt.step()
            sum_tap += float(tap.detach())
            n_tap += 1
        plan.step()
        modell.eval()
        s_, a_ = k8_per_rad(modell, Xh, Sh, Nh, Fh, args.batch)
        k8 = forhold(s_, a_)
        merke = ""
        if k8 < beste - 1e-6:
            beste, beste_epoke, taalmod = k8, e + 1, 0
            beste_sum, beste_ant = s_, a_
            merke = "  <- beste"
        else:
            taalmod += 1
        print("    %-16s froe %d epoke %2d/%d: tren %.4f  holdout-K8 %.5f%s"
              % (navn, froe, e + 1, args.epoker, sum_tap / max(1, n_tap), k8, merke), flush=True)
        if taalmod >= args.taalmod:
            print("    %-16s froe %d: tidlig stopp etter %d epoker uten framgang" % (navn, froe, taalmod), flush=True)
            break
    print("    %-16s froe %d FERDIG: beste K8 %.5f (epoke %d), %d parametre, %.0f s"
          % (navn, froe, beste, beste_epoke, par, time.time() - t0), flush=True)
    return {"k8": beste, "epoke": beste_epoke, "par": par, "sum": beste_sum, "ant": beste_ant}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tren", default="_agOE/data/trening-*.bin")
    ap.add_argument("--hold", default="_agOE/data/holdout-*.bin")
    ap.add_argument("--ut", default="analyse/agOE-rekke-k8.json")
    ap.add_argument("--rapport", default="analyse/agOE-rekke-k8.txt")
    ap.add_argument("--epoker", type=int, default=60)
    ap.add_argument("--taalmod", type=int, default=8, help="epoker uten framgang paa holdout-K8 foer stopp")
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--froe", type=int, default=3, help="antall startvekter per arm")
    ap.add_argument("--armer", default="agg,agg+,agg+rekke,rekke")
    args = ap.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    t0 = time.time()
    d_tr = les(args.tren)
    d_ho = les(args.hold)
    print("%d treningsrader, %d holdoutrader, %d trekk, enhet %s (%.0f s)"
          % (len(d_tr["X"]), len(d_ho["X"]), DIM, enhet, time.time() - t0), flush=True)
    print("holdout: %d kamper, rekkelengde snitt %.1f av 48 (%.1f %% av radene har >= 20 steg)"
          % (len(numpy.unique(d_ho["FRO"])), d_ho["N"].mean(), 100 * (d_ho["N"] >= 20).mean()), flush=True)

    for d in (d_tr, d_ho):
        d["Xt"] = torch.from_numpy(d["X"]).to(enhet)
        d["St"] = torch.from_numpy(d["V"].astype(numpy.int32)).to(enhet)
        d["Nt"] = torch.from_numpy(d["N"].astype(numpy.int32)).to(enhet)
        d["Ft"] = torch.from_numpy(d["F"]).to(enhet).long()

    stammer = {
        "agg": lambda: AggStamme(),
        # 1312/960 er valgt saa parametertallet lander paa agg+rekke sitt - se kapasitetsfella under.
        "agg+": lambda: AggStamme(skjulte=(1312, 960)),
        "agg+rekke": lambda: BeggeStamme(),
        "rekke": lambda: RekkeStamme(),
    }
    navn_armer = [a for a in args.armer.split(",") if a]
    for a in navn_armer:
        if a not in stammer:
            raise SystemExit("ukjent arm «%s»" % a)

    # FELLE: KAPASITETSARMEN MAA FAKTISK MOETE agg+rekke.
    # `agg+` har én oppgave - aa svare paa om gevinsten er ORDEN eller bare FLERE VEKTER. Er den
    # merkbart mindre enn (b), frikjenner den rekka gratis; er den stoerre, doemmer den rekka
    # gratis. Begge deler ser like fornuftige ut i rapporten. Proeves paa CPU foer det brukes
    # timer paa trening, for en felle som slaar ut etter maalingen er ingen felle.
    if "agg+" in navn_armer and "agg+rekke" in navn_armer:
        p_stor = sum(p.numel() for p in Tronett(stammer["agg+"]()).parameters())
        p_begge = sum(p.numel() for p in Tronett(stammer["agg+rekke"]()).parameters())
        avvik = abs(p_stor - p_begge) / p_begge
        if avvik > 0.01:
            raise SystemExit("kapasitetsarmen bommer: agg+ %d vekter mot agg+rekke %d (%.1f %% avvik, taaler 1 %%)"
                             % (p_stor, p_begge, 100 * avvik))
        print("kapasitetsfelle godkjent: agg+ %d vekter mot agg+rekke %d (%.2f %% avvik)"
              % (p_stor, p_begge, 100 * avvik), flush=True)

    KL = d_ho["FRO"]
    RO = d_ho["ROLLE"]
    ST = d_ho["ST"]
    resultat = {
        "rader": {"tren": int(len(d_tr["X"])), "hold": int(len(d_ho["X"]))},
        "kamper_hold": int(len(numpy.unique(KL))),
        "epoker": args.epoker,
        "froe": args.froe,
        "armer": {},
    }

    # Beste froe per arm, valgt paa holdout-K8. Alle armene faar samme antall forsoek.
    valgt = {}
    for navn in navn_armer:
        print("\n== ARM: %s ==" % navn, flush=True)
        kjoringer = [tren_arm(navn, stammer[navn], d_tr, d_ho, args, enhet, 20260912 + 101 * f) for f in range(args.froe)]
        beste = min(kjoringer, key=lambda r: r["k8"])
        valgt[navn] = beste
        k8, se = klynge_bootstrap(beste["sum"], beste["ant"], KL)
        arm = {
            "k8": round(k8, 5),
            "se": round(se, 5),
            "epoke": beste["epoke"],
            "parametre": beste["par"],
            "k8_per_froe": [round(r["k8"], 5) for r in kjoringer],
            "per_rolle": {},
            "per_stikk": {},
        }
        for r in range(3):
            m = RO == r
            if not bool(m.any()):
                continue
            v, s = klynge_bootstrap(beste["sum"][m], beste["ant"][m], KL[m])
            arm["per_rolle"][ROLLER[r]] = {"k8": round(v, 5), "se": round(s, 5), "kort": int(beste["ant"][m].sum())}
        for s_ in range(13):
            m = ST == s_
            if not bool(m.any()) or beste["ant"][m].sum() == 0:
                continue
            v, s = klynge_bootstrap(beste["sum"][m], beste["ant"][m], KL[m])
            arm["per_stikk"][str(s_)] = {"k8": round(v, 5), "se": round(s, 5), "kort": int(beste["ant"][m].sum())}
        resultat["armer"][navn] = arm
        print("  %s: K8 %.5f +/- %.5f  (beste av %d froe: %s)"
              % (navn, k8, se, args.froe, arm["k8_per_froe"]), flush=True)
        sys.stdout.flush()

    # ===================== DEN PARREDE DOMMEN =====================
    # Negativ forskjell = rekka HJELPER (K8 er et tap). Alt leses mot den parrede SE-en.
    resultat["parret"] = {}
    if "agg" in valgt:
        for navn in navn_armer:
            if navn == "agg":
                continue
            d, se = parret_bootstrap(valgt["agg"]["sum"], valgt["agg"]["ant"], valgt[navn]["sum"], valgt[navn]["ant"], KL)
            post = {"diff": round(d, 5), "se": round(se, 5), "z": round(d / se, 2) if se and se == se and se > 0 else None,
                    "per_rolle": {}, "per_stikk": {}}
            for r in range(3):
                m = RO == r
                if not bool(m.any()):
                    continue
                dd, ss = parret_bootstrap(valgt["agg"]["sum"][m], valgt["agg"]["ant"][m], valgt[navn]["sum"][m], valgt[navn]["ant"][m], KL[m])
                post["per_rolle"][ROLLER[r]] = {"diff": round(dd, 5), "se": round(ss, 5)}
            for s_ in range(13):
                m = ST == s_
                if not bool(m.any()) or valgt["agg"]["ant"][m].sum() == 0:
                    continue
                dd, ss = parret_bootstrap(valgt["agg"]["sum"][m], valgt["agg"]["ant"][m], valgt[navn]["sum"][m], valgt[navn]["ant"][m], KL[m])
                post["per_stikk"][str(s_)] = {"diff": round(dd, 5), "se": round(ss, 5)}
            resultat["parret"]["%s - agg" % navn] = post
            print("\nPARRET %s - agg: %.5f +/- %.5f nat  (negativt = rekka hjelper)" % (navn, d, se), flush=True)

    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    with open(args.ut, "w", encoding="utf-8") as fh:
        json.dump(resultat, fh, indent=1)
    # RAPPORTEN SKRIVES AV PROSESSEN SELV (langkjoeringer skal ikke leve i et stdout-roer).
    os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
    with open(args.rapport, "a", encoding="utf-8") as fh:
        fh.write("\n=== agOE: baerer den ordnede kortrekka noe paa K8? (%s) ===\n" % time.strftime("%Y-%m-%d %H:%M"))
        fh.write("trening %d rader, holdout %d rader i %d kamper, %d froe per arm, opptil %d epoker\n"
                 % (len(d_tr["X"]), len(d_ho["X"]), resultat["kamper_hold"], args.froe, args.epoker))
        for navn in navn_armer:
            a = resultat["armer"][navn]
            fh.write("  %-12s K8 %.5f +/- %.5f  (epoke %d, %d parametre, froe %s)\n"
                     % (navn, a["k8"], a["se"], a["epoke"], a["parametre"], a["k8_per_froe"]))
            fh.write("      per rolle: %s\n" % "  ".join("%s %.5f +/- %.5f" % (k, v["k8"], v["se"]) for k, v in a["per_rolle"].items()))
        for k, v in resultat.get("parret", {}).items():
            fh.write("  PARRET %-18s %.5f +/- %.5f nat (negativt = rekka hjelper)\n" % (k, v["diff"], v["se"]))
    print("\n-> %s  og  %s" % (args.ut, args.rapport), flush=True)


if __name__ == "__main__":
    main()
