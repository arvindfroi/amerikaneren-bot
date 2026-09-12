#!/usr/bin/env python3
"""
REVISJON AV SONDE B PAA EKTE RADER (agent OE, 12. sep).

    python verktoy/agOE-revisjon.py --korpus "_agOE/data/*.bin" --ut analyse/agOE-revisjon.json

============================ HVORFOR ====================================

Agent T maalte at den ordnede kortrekka ikke bar noe aggregatene manglet. En slik NULL er bare
verdt noe hvis inngangen var riktig. En rekke som er forskjoevet, avkortet eller ute av takt med
korpuset, er ikke en rekkefoelge - den er stoey med riktig form, og en modell som ikke finner noe
i den, har ikke maalt paastanden. `test/mlb-sekvens-orden.test.ts` proever ordenen mot
hendelsesstroemmen paa spilte kamper. Denne fila proever de SAMME FILENE sonde B faktisk leste.

============================ HVA SOM SJEKKES ============================

  C1 TAKT       n // 4 == korpusets eget `stikk`-felt, rad for rad. Sekvensfila og korpuset er
                to filer skrevet i samme loekke; kommer de ut av takt med én rad, faar hver rad
                en annen rads rekke, og B maalte da rekka til feil stilling. Dette er den
                billigste og skarpeste taktproeven som finnes, fordi `stikk` staar i den ANDRE fila.
  C2 FORM       padding er -1 fra n og ut, ingen -1 foer n, sete 0-3, kort 0-51, og feltene
                STIKK/POSISJON foelger stegindeksen.
  C3 MED SOLA   innen hvert FULLE stikk maa de relative setene vaere (l, l+1, l+2, l+3) mod 4.
                Spillet gaar med sola, saa enhver omstokking INNEN et stikk bryter dette - og det
                er nettopp den ordensinformasjonen aggregatene ikke har. C1 og C4 kan begge vaere
                groenne med et stokket stikk; C3 kan ikke.
  C4 SAMME SETE rekkas (kort -> sete) maa stemme med korpusets EGEN `HVEM_LA`-blokk
                (trotrekk.ts: 318 + kortIndeks*4 + rel). To uavhengige kodinger av det samme;
                er de uenige, er «relativt sete» to forskjellige ting i de to armene til B.
  C5 METNING    hvor mye av rekka er faktisk fylt? En rekke som er 90 % padding er ikke gal, men
                da er «ingen maalt gevinst» et utsagn om nesten-tomme vektorer.

============================ FELLENE ====================================

Hver sjekk kjoeres OGSAA paa en med vilje oedelagt kopi, og MAA slaa ut der:
  rullet       radene rullet ett hakk (takten broetet)      -> C1 og C4 maa falle
  stokket      to kort byttet innen hvert fulle stikk       -> C3 maa falle
  avkortet     siste stikk fjernet fra hver rad             -> C1 maa falle
Slaar en felle ikke ut, er den tilhoerende sjekken blind, og da sier den groenne kjoeringen
ingenting. Rapporten skrives av prosessen selv, aldri gjennom et stdout-roer.
"""

import argparse
import glob
import json
import os
import struct
import sys

import numpy

KORT = 52
KLASSER = 4
HODE = 12
SEKV_MAKS = 48
SEKV_FELT = 4
SEKV_TOM = -1
# `src/neat/trekk.ts` ANTALL_INN = 318; `src/mlb/trotrekk.ts` HVEM_LA = 0 i troblokken.
NEAT_INN = 318
HVEM_LA = NEAT_INN + 0
DIM = 996


def les_korpus(sti):
    """MLBT versjon 1: (X, F, FRO, STIKK, SETE). Bare bredde 996 - sonde B leste ingen annen."""
    with open(sti, "rb") as fh:
        if fh.read(4) != b"MLBT":
            raise SystemExit("%s: ikke en MLBT-fil" % sti)
        (versjon,) = struct.unpack("<i", fh.read(4))
        (dim,) = struct.unpack("<i", fh.read(4))
        if versjon != 1:
            raise SystemExit("%s: versjon %d, revisjonen er skrevet for 1" % (sti, versjon))
        if dim != DIM:
            raise SystemExit("%s: dim %d, ventet %d" % (sti, dim, DIM))
        felt = [("t", "<f4", (dim,)), ("f", "i1", (KORT,)), ("fro", "<i4"), ("stikk", "<i2"), ("sete", "<i2")]
        a = numpy.fromfile(fh, dtype=numpy.dtype(felt))
    return a


def les_sekvens(sti):
    """`<fil>.sekv.bin` -> (N, 48, 4) int16 og lengder (N,)."""
    with open(sti, "rb") as fh:
        if fh.read(4) != b"MLBS":
            raise SystemExit("%s: ikke en MLBS-fil" % sti)
        versjon, maks, felt = struct.unpack("<iii", fh.read(12))
        if versjon != 1 or maks != SEKV_MAKS or felt != SEKV_FELT:
            raise SystemExit("%s: uventet hode %d/%d/%d" % (sti, versjon, maks, felt))
        a = numpy.fromfile(fh, dtype=numpy.dtype([("n", "<i2"), ("v", "<i2", (maks * felt,))]))
    return a["v"].reshape(-1, maks, felt).astype(numpy.int32), a["n"].astype(numpy.int32)


# ===========================================================================
# Sjekkene. Hver returnerer antall RADER som bryter, og en kort forklaring.
# ===========================================================================


def c1_takt(V, N, STIKK):
    """n // 4 == korpusets stikkfelt, og n % 4 er 0-3 (setet i tur har ikke lagt enda)."""
    brudd = (N // 4) != STIKK
    return int(brudd.sum()), "n//4 != korpusets stikk"


def c2_form(V, N, STIKK):
    """Padding fra n og ut, ingen padding foer n, lovlige omraader, og STIKK/POSISJON per steg."""
    n_rader, maks, _ = V.shape
    steg = numpy.arange(maks)[None, :]
    fylt = steg < N[:, None]
    sete, kort, stikk, pos = V[:, :, 0], V[:, :, 1], V[:, :, 2], V[:, :, 3]
    d = numpy.zeros(n_rader, dtype=bool)
    # Padding: alle fire feltene skal vaere SEKV_TOM der raden ikke er fylt.
    d |= (~fylt & ((sete != SEKV_TOM) | (kort != SEKV_TOM) | (stikk != SEKV_TOM) | (pos != SEKV_TOM))).any(axis=1)
    # Fylt: lovlige omraader og feltene som foelger stegindeksen.
    d |= (fylt & ((sete < 0) | (sete > 3))).any(axis=1)
    d |= (fylt & ((kort < 0) | (kort > 51))).any(axis=1)
    d |= (fylt & (stikk != (steg // 4))).any(axis=1)
    d |= (fylt & (pos != (steg % 4))).any(axis=1)
    return int(d.sum()), "padding, omraade eller STIKK/POSISJON feil"


def c3_med_sola(V, N, STIKK):
    """Innen hvert FULLE stikk: relative seter (l, l+1, l+2, l+3) mod 4. Spillet gaar med sola."""
    n_rader, maks, _ = V.shape
    sete = V[:, :, 0]
    steg = numpy.arange(maks)[None, :]
    # Bare stikk der alle fire kortene er lagt: et paagaaende stikk kan ha 1-3 kort, og de er
    # fortsatt med sola, men det siste kortet mangler - kravet gjelder like fullt per lagt kort.
    fylt = steg < N[:, None]
    leder = sete[:, (steg[0] // 4) * 4]  # lederens sete for stikket hvert steg tilhoerer
    ventet = (leder + (steg % 4)) % 4
    d = (fylt & (sete != ventet)).any(axis=1)
    return int(d.sum()), "et kortlegg bryter rekkefoelgen med sola innen stikket"


def c4_samme_sete(X, V, N):
    """Rekkas (kort -> sete) mot korpusets egen HVEM_LA-blokk. To uavhengige kodinger."""
    n_rader, maks, _ = V.shape
    steg = numpy.arange(maks)[None, :]
    fylt = steg < N[:, None]
    sete, kort = V[:, :, 0], V[:, :, 1]
    idx = HVEM_LA + numpy.clip(kort, 0, 51) * 4 + numpy.clip(sete, 0, 3)
    rad = numpy.arange(n_rader)[:, None]
    traff = X[rad, idx] > 0.5
    d = (fylt & ~traff).any(axis=1)
    # Og motsatt vei: HVEM_LA skal ikke ha FLERE kort enn rekka har steg (ellers mangler rekka noe).
    blokk = X[:, HVEM_LA : HVEM_LA + 52 * 4].reshape(n_rader, 52, 4)
    antall = (blokk > 0.5).sum(axis=(1, 2))
    d |= antall != N
    return int(d.sum()), "rekkas sete/kort stemmer ikke med HVEM_LA i korpuset"


def metning(V, N, STIKK):
    """C5: hvor fylt er rekka egentlig? Tall, ikke inntrykk."""
    ut = {
        "rader": int(len(N)),
        "n_snitt": round(float(N.mean()), 2),
        "n_median": int(numpy.median(N)),
        "n_maks": int(N.max()),
        "andel_tom": round(float((N == 0).mean()), 4),
        "andel_minst_20": round(float((N >= 20).mean()), 4),
        "andel_minst_40": round(float((N >= 40).mean()), 4),
        "fyllgrad_snitt": round(float((N / (SEKV_MAKS * 1.0)).mean()), 4),
    }
    # Per stikk: hvor mange rader, og hvor lang rekka er der. Sent i runden er det ordenen skal telle.
    per = {}
    for s in range(0, 13):
        m = STIKK == s
        if not bool(m.any()):
            continue
        per[str(s)] = {"rader": int(m.sum()), "n_snitt": round(float(N[m].mean()), 1)}
    ut["per_stikk"] = per
    return ut


# ===========================================================================
# Fellene: de oedelagte kopiene
# ===========================================================================


def felle_rullet(V, N):
    return numpy.roll(V, 1, axis=0), numpy.roll(N, 1, axis=0)


def felle_stokket(V, N):
    """Bytt kortlegg 1 og 2 innen hvert fulle stikk. Kortene er de samme; ORDENEN er ikke."""
    V2 = V.copy()
    for t in range(SEKV_MAKS // 4):
        a, b = t * 4 + 1, t * 4 + 2
        helt = N >= (t + 1) * 4
        if not bool(helt.any()):
            continue
        tmp = V2[helt, a, :].copy()
        V2[helt, a, :] = V2[helt, b, :]
        V2[helt, b, :] = tmp
        # Feltene STIKK/POSISJON foelger plassen, ikke kortet: en ekte omstokking ville beholdt dem.
        V2[helt, a, 2], V2[helt, a, 3] = V[helt, a, 2], V[helt, a, 3]
        V2[helt, b, 2], V2[helt, b, 3] = V[helt, b, 2], V[helt, b, 3]
    return V2, N


def felle_avkortet(V, N):
    """Fjern det siste FULLE stikket: rekka er sann, men fire kort for gammel."""
    N2 = numpy.maximum(0, (N // 4) * 4 - 4)
    V2 = V.copy()
    steg = numpy.arange(SEKV_MAKS)[None, :]
    tom = steg >= N2[:, None]
    V2[numpy.broadcast_to(tom[:, :, None], V2.shape)] = SEKV_TOM
    return V2, N2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--korpus", default="_agOE/data/*.bin")
    ap.add_argument("--ut", default="analyse/agOE-revisjon.json")
    args = ap.parse_args()

    filer = [f for f in sorted(glob.glob(args.korpus)) if not f.endswith(".sekv.bin")]
    if not filer:
        raise SystemExit("fant ingen korpusfiler for «%s»" % args.korpus)

    rapport = {"filer": [], "sum": {}, "feller": {}}
    Xa, Va, Na, STa = [], [], [], []
    for sti in filer:
        a = les_korpus(sti)
        V, N = les_sekvens(sti + ".sekv.bin")
        if len(V) != len(a):
            raise SystemExit("%s: korpuset har %d rader, sekvensfila %d - de er ute av takt" % (sti, len(a), len(V)))
        X = a["t"]
        ST = a["stikk"].astype(numpy.int32)
        f = {"fil": os.path.basename(sti), "rader": int(len(a))}
        for navn, (brudd, hva) in [
            ("C1_takt", c1_takt(V, N, ST)),
            ("C2_form", c2_form(V, N, ST)),
            ("C3_med_sola", c3_med_sola(V, N, ST)),
            ("C4_samme_sete", c4_samme_sete(X, V, N)),
        ]:
            f[navn] = {"brudd": brudd, "hva": hva}
        f["C5_metning"] = metning(V, N, ST)
        rapport["filer"].append(f)
        print("%-16s %6d rader  C1 %d  C2 %d  C3 %d  C4 %d  n-snitt %.1f  tom %.1f %%"
              % (f["fil"], f["rader"], f["C1_takt"]["brudd"], f["C2_form"]["brudd"],
                 f["C3_med_sola"]["brudd"], f["C4_samme_sete"]["brudd"],
                 f["C5_metning"]["n_snitt"], 100 * f["C5_metning"]["andel_tom"]))
        sys.stdout.flush()
        Xa.append(X)
        Va.append(V)
        Na.append(N)
        STa.append(ST)

    X = numpy.concatenate(Xa)
    V = numpy.concatenate(Va)
    N = numpy.concatenate(Na)
    ST = numpy.concatenate(STa)
    del Xa, Va, Na, STa

    sum_brudd = {}
    for navn, (brudd, hva) in [
        ("C1_takt", c1_takt(V, N, ST)),
        ("C2_form", c2_form(V, N, ST)),
        ("C3_med_sola", c3_med_sola(V, N, ST)),
        ("C4_samme_sete", c4_samme_sete(X, V, N)),
    ]:
        sum_brudd[navn] = {"brudd": brudd, "hva": hva}
    rapport["sum"] = {"rader": int(len(N)), "brudd": sum_brudd, "C5_metning": metning(V, N, ST)}

    print("\n== TOTALT %d rader ==" % len(N))
    for k, v in sum_brudd.items():
        print("  %-14s %d brudd  (%s)" % (k, v["brudd"], v["hva"]))
    m = rapport["sum"]["C5_metning"]
    print("  metning: n snitt %.2f av 48, median %d, maks %d, tom %.2f %%, >=20 steg %.1f %%, >=40 steg %.1f %%"
          % (m["n_snitt"], m["n_median"], m["n_maks"], 100 * m["andel_tom"],
             100 * m["andel_minst_20"], 100 * m["andel_minst_40"]))
    sys.stdout.flush()

    # ===================== FELLENE =====================
    # Hver oedelagte kopi maa bli tatt av sin sjekk. Blir den ikke det, er sjekken blind.
    print("\n== FELLER (hver MAA slaa ut) ==")
    Vr, Nr = felle_rullet(V, N)
    Vs, Ns = felle_stokket(V, N)
    Va_, Na_ = felle_avkortet(V, N)
    feller = {
        "rullet_C1": c1_takt(Vr, Nr, ST)[0],
        "rullet_C4": c4_samme_sete(X, Vr, Nr)[0],
        "stokket_C3": c3_med_sola(Vs, Ns, ST)[0],
        "avkortet_C1": c1_takt(Va_, Na_, ST)[0],
    }
    rapport["feller"] = feller
    alle_tatt = True
    for k, v in feller.items():
        tatt = v > 0
        alle_tatt = alle_tatt and tatt
        print("  %-14s %8d brudd   %s" % (k, v, "TATT" if tatt else "SLAPP UNNA - SJEKKEN ER BLIND"))
    sys.stdout.flush()

    rapport["dom"] = {
        "alle_sjekker_groenne": all(v["brudd"] == 0 for v in sum_brudd.values()),
        "alle_feller_tatt": alle_tatt,
    }
    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    with open(args.ut, "w", encoding="utf-8") as fh:
        json.dump(rapport, fh, indent=1)
    print("\n-> %s" % args.ut)
    if not alle_tatt:
        raise SystemExit("en felle slapp unna: revisjonen kan ikke stoles paa")


if __name__ == "__main__":
    main()
