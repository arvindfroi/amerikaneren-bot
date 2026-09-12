"""PARVIS K8 mellom to trosnett paa de SAMME holdoutradene, med klyngerobust SE.

    bash /d/amb-k8/py-wsl.sh verktoy/agX-k8-par.py \
      --hold mlb-tro-data/holdout-0.bin \
      --nett start=e1-modell/tro-7.bin --nett A2=analyse/agX-tro-A2.bin \
      --nett B2=analyse/agX-tro-B2.bin \
      --par B2-A2 --ut analyse/agX-k8-par.txt

HVORFOR: treneren skriver ETT tall per arm («beste holdout K8-tap 0.89757»). Armene
her skiller seg med ~0,0005 paa et tap rundt 0,898, og et blott tall kan ikke si om
det er en gevinst eller stoey. Forskjellen maa maales PARVIS - samme rader, samme
kort, samme rekkefoelge - og med en SE som tar hoeyde for at radene ikke er
uavhengige.

KLYNGEN ER KAMPEN (froeet). Alle rader fra samme giv deler kortene; naborader i et
stikk er nesten samme stilling. En SE over RADER ville vaert flere ganger for liten
og gjort enhver arm «signifikant». Vi regner K8 per kamp for hvert nett, tar
differansen per kamp, og lar SE-en vaere over kampene.

TRUSSELEN, OG HVORFOR SKRIPTET LESER TRENERENS EGNE FUNKSJONER: en egen MLBT-leser
eller en egen K8-formel som er en tanke ulik trenerens ville gitt tall som ser
riktige ut og ikke er sammenliknbare med noe annet i repoet. Derfor importeres
`verktoy/mlb-tro-tren.py` som modul (den har `if __name__ == "__main__"`, saa
`main()` kjoerer ikke), og K8 regnes med NOEYAKTIG samme maske og samme
renormalisering over de tre setene.

FELLA: for hvert nett sammenliknes det SAMLEDE K8-tapet her med det treneren
rapporterte. Er avviket stoerre enn --toleranse, stopper skriptet. Da leser vi
enten andre rader, andre vekter eller en annen K8 enn treningen gjorde, og hvert
tall under er verdiloest.
"""

import argparse
import importlib.util
import os
import sys

import numpy
import torch
import torch.nn.functional as F

HER = os.path.dirname(os.path.abspath(__file__))


def last_trener():
    """Importer mlb-tro-tren.py som modul. Bindestreken gjoer vanlig import umulig."""
    sti = os.path.join(HER, "mlb-tro-tren.py")
    spec = importlib.util.spec_from_file_location("agX_trotren", sti)
    if spec is None or spec.loader is None:
        raise SystemExit(f"fikk ikke lastet {sti}")
    mod = importlib.util.module_from_spec(spec)
    # Navnet er IKKE __main__, saa vakten nederst i fila holder main() i ro.
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hold", default="mlb-tro-data/holdout-0.bin")
    ap.add_argument("--nett", action="append", default=[], help="navn=sti, kan gjentas")
    ap.add_argument("--par", action="append", default=[], help="B-A: differansen B minus A, kan gjentas")
    ap.add_argument("--ut", default="analyse/agX-k8-par.txt")
    ap.add_argument("--fasit", action="append", default=[], help="navn=k8 treneren rapporterte (fella)")
    ap.add_argument(
        "--hold-for",
        action="append",
        default=[],
        help="navn=sti: eget holdoutkorpus for dette nettet (f.eks. kanoniske rader). "
        "Radene MAA vaere de samme stillingene i samme rekkefoelge som --hold.",
    )
    ap.add_argument("--toleranse", type=float, default=2e-4)
    ap.add_argument("--batch", type=int, default=4096)
    args = ap.parse_args()

    t = last_trener()
    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    d = t.les_mlbt(args.hold)
    X, Fa, FRO, ST, ROLLE = d["X"], d["F"], d["FRO"], d["ST"], d["ROLLE"]
    n = len(X)
    print(f"{n} holdoutrader, dim {d['dim']}, enhet {enhet}", flush=True)

    # Kampindeks: én klynge per froe.
    kamper, kamp_i = numpy.unique(FRO, return_inverse=True)
    print(f"{len(kamper)} kamper (klynger)", flush=True)

    Xt = torch.from_numpy(X).to(enhet)
    Ft = torch.from_numpy(Fa.astype(numpy.int64)).to(enhet)

    hold_for = {}
    for h in args.hold_for:
        k, v = h.split("=", 1)
        hold_for[k] = v
    ekstra = {}

    def tensorer(navn):
        """Radene dette nettet skal leses paa. Kanoniske nett ser kanoniske rader.

        FELLA: et kanonisk korpus er de SAMME stillingene med andre fargenavn. Er de
        ikke rad-for-rad de samme givene, stikkene og setene - og med like mange
        usette kort per rad - er «parvis» en loegn, og differansen sammenlikner to
        ulike utvalg i stedet for to nett.
        """
        if navn not in hold_for:
            return Xt, Ft
        if navn not in ekstra:
            sti = hold_for[navn]
            dh = t.les_mlbt(sti)
            if dh["dim"] != d["dim"]:
                raise SystemExit(f"{sti}: dim {dh['dim']} != {d['dim']}")
            if len(dh["X"]) != n:
                raise SystemExit(f"{sti}: {len(dh['X'])} rader != {n}")
            for felt in ("FRO", "ST", "ROLLE"):
                if not numpy.array_equal(dh[felt], d[felt]):
                    raise SystemExit(f"{sti}: {felt} er ikke rad-for-rad lik {args.hold}")
            # Etiketten er permutert, saa den kan ikke sammenliknes direkte - men
            # ANTALLET usette kort per rad maa staa, ellers er det ikke samme stilling.
            if not numpy.array_equal((dh["F"] > 0).sum(axis=1), (Fa > 0).sum(axis=1)):
                raise SystemExit(f"{sti}: ulikt antall usette kort per rad mot {args.hold}")
            print(f"  {navn}: egne rader fra {sti} (rad-for-rad like stillinger)", flush=True)
            ekstra[navn] = (
                torch.from_numpy(dh["X"]).to(enhet),
                torch.from_numpy(dh["F"].astype(numpy.int64)).to(enhet),
            )
        return ekstra[navn]

    def per_kort_tap(sti, navn):
        """(sum K8-tap, antall kort) per rad - nøyaktig trenerens maske og renormalisering."""
        X_, F_ = tensorer(navn)
        dims = t.les_dims(sti)
        modell = t.Tronett(dims).to(enhet)
        t.les_vekter(sti, modell)
        modell.eval()
        s = numpy.zeros(n, dtype=numpy.float64)
        c = numpy.zeros(n, dtype=numpy.int64)
        with torch.no_grad():
            for i in range(0, n, args.batch):
                x = X_[i : i + args.batch].float()
                mal = F_[i : i + args.batch]
                ut = modell(x)
                maske = mal > 0
                m3 = maske & (mal <= 3)
                mm = (mal - 1).clamp(min=0)
                lp = F.log_softmax(ut[:, :, :3], dim=2)
                valgt = lp.gather(2, mm.clamp(max=2).unsqueeze(2)).squeeze(2)
                tap = (-valgt) * m3.float()
                s[i : i + args.batch] = tap.sum(dim=1).double().cpu().numpy()
                c[i : i + args.batch] = m3.sum(dim=1).cpu().numpy()
        return s, c

    fasit = {}
    for f in args.fasit:
        k, v = f.split("=", 1)
        fasit[k] = float(v)

    tap = {}
    L = []
    L.append(f"PARVIS K8 - {args.hold}, {n} rader, {len(kamper)} kamper")
    L.append("")
    for spek in args.nett:
        navn, sti = spek.split("=", 1)
        s, c = per_kort_tap(sti, navn)
        tap[navn] = (s, c)
        samlet = s.sum() / max(1, c.sum())
        linje = f"  {navn:8s} K8 {samlet:.5f}  ({int(c.sum())} kort)  {sti}"
        if navn in fasit:
            avvik = abs(samlet - fasit[navn])
            linje += f"   treneren sa {fasit[navn]:.5f}, avvik {avvik:.2e}"
            # FELLA: leser vi det samme som treningen gjorde?
            if avvik > args.toleranse:
                raise SystemExit(
                    f"{navn}: K8 her {samlet:.6f} mot trenerens {fasit[navn]:.6f} "
                    f"(avvik {avvik:.2e} > {args.toleranse:.0e}). Skriptet maaler noe annet enn treningen."
                )
        L.append(linje)
        print(linje, flush=True)

    def per_kamp(navn, utvalg=None):
        s, c = tap[navn]
        if utvalg is not None:
            s, c = s * utvalg, c * utvalg
        ss = numpy.bincount(kamp_i, weights=s, minlength=len(kamper))
        cc = numpy.bincount(kamp_i, weights=c, minlength=len(kamper))
        god = cc > 0
        return ss[god] / cc[god], god

    L.append("")
    L.append("PARVISE DIFFERANSER (negativ = den foerste er BEDRE), SE klynget paa kamp:")
    for p in args.par:
        b, a = p.split("-", 1)
        for navn, utvalg in [("alle", None)] + [
            (r, (ROLLE == i).astype(numpy.float64)) for i, r in enumerate(t.ROLLER)
        ]:
            kb, gb = per_kamp(b, utvalg)
            ka, ga = per_kamp(a, utvalg)
            if not numpy.array_equal(gb, ga):
                raise SystemExit(f"{p}/{navn}: ulike kamper i de to armene")
            dd = kb - ka
            m = float(dd.mean())
            se = float(dd.std(ddof=1) / numpy.sqrt(len(dd))) if len(dd) > 1 else float("nan")
            z = m / se if se > 0 else float("nan")
            linje = f"  {p:10s} {navn:11s} {m:+.5f} ± {se:.5f}  z = {z:+.2f}  ({len(dd)} kamper)"
            L.append(linje)
            print(linje, flush=True)
        L.append("")

    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    with open(args.ut, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"\nSkrevet: {args.ut}", flush=True)


if __name__ == "__main__":
    main()
