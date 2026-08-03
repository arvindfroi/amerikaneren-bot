"""FORSVARSPROFIL: hvor i forsvarsspillet taper vi, og hvor mye.

    python verktoy/forsvarsprofil.py --data sd-v3 --nett e1-modell/ftf1.bin \
        --ut analyse/forsvarsprofil

HVORFOR IKKE BARE «ANGER I FORSVARSSETET». Fordi et høyt tall der kan bety to
helt ulike ting: at vi spiller dårlig, eller at beslutningene er vanskelige.
De krever motsatt handling. Derfor måles alt mot GULVET – angeren et tilfeldig
lovlig kort ville gitt i nøyaktig samme stilling.

    fanget = (gulv − vår) / gulv

«fanget» er andelen av den tilgjengelige ferdigheten vi faktisk henter ut.
1,0 = spiller som orakelet. 0,0 = like god som å kaste terning. Tallet er
sammenlignbart PÅ TVERS av situasjoner selv når vanskelighetsgraden ikke er
det, og det er hele poenget.

AKSENE ER VALGT ETTER ARVINDS BESKRIVELSE AV HVA FORSVAR ER:

  «jobbe med den andre forsvareren»  -> HAR MAKKERFORSVAREREN SPILT ALT?
      Å legge etter sin medforsvarer er en annen oppgave enn å legge før:
      man vet hva han har vist, og kan spare eller ta over. Er `fanget`
      lavere der, ligger hullet i samspillet og ikke i kortvurderingen.

  «ta stikk selv»                    -> POSISJON I STIKKET, og om spillefører
      alt har spilt. Fjerdehånd etter spillefører er stedet et stikk kan tas
      billig; førstehånd er stedet det gis bort.

  trumf                              -> spiller vi trumf eller ikke

  tidspunkt                          -> stikknummer

ROLLE OG SITUASJON UTLEDES AV TREKKENE, som i sd-kolonner.py. Indeksene er
kontrakten i src/nevro/trekk.ts:
  208+r  budvinneren ligger r seter fram   (r = 0 -> det er meg)
  212+r  utspilleren i dette stikket
  227    jeg er paa budvinnerens side
  104-155 kortene som ligger paa bordet NAA  (antall = min posisjon i stikket)
  220-223 trumffargen, 224 = ingen trumf
"""

import argparse
import json
import os
import struct

import numpy
import torch
import torch.nn.functional as F

KORT = 52


class E1Nett(torch.nn.Module):
    def __init__(self, dims):
        super().__init__()
        self.lag = torch.nn.ModuleList(
            [torch.nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)]
        )

    def forward(self, x):
        for i, l in enumerate(self.lag):
            x = l(x)
            if i < len(self.lag) - 1:
                x = F.relu(x)
        return x


def les_nett(sti):
    lag = []
    with open(sti, "rb") as f:
        if struct.unpack("<i", f.read(4))[0] != 1:
            raise SystemExit(f"{sti}: forventet ett nett")
        for _ in range(struct.unpack("<i", f.read(4))[0]):
            inn, ut = struct.unpack("<ii", f.read(8))
            W = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn).copy()
            b = numpy.frombuffer(f.read(ut * 4), dtype="<f4").copy()
            lag.append((W, b))
    m = E1Nett([lag[0][0].shape[1]] + [W.shape[0] for W, _ in lag])
    with torch.no_grad():
        for i, (W, b) in enumerate(lag):
            m.lag[i].weight.copy_(torch.from_numpy(W))
            m.lag[i].bias.copy_(torch.from_numpy(b))
    return m


def les_data(mapper, tak):
    X, V, M = [], [], []
    for mappe in mapper:
        for navn in sorted(os.listdir(mappe)):
            if not navn.endswith(".jsonl") or len(X) >= tak:
                continue
            with open(os.path.join(mappe, navn), encoding="utf-8") as f:
                for linje in f:
                    if len(X) >= tak:
                        break
                    try:
                        r = json.loads(linje)
                    except Exception:
                        continue
                    t, v = r.get("t"), r.get("v")
                    if not t or not v or len(v) < 2:
                        continue
                    verdi = numpy.zeros(KORT, dtype=numpy.float32)
                    maske = numpy.zeros(KORT, dtype=numpy.float32)
                    for k, x in v.items():
                        verdi[int(k)] = x
                        maske[int(k)] = 1
                    X.append(t)
                    V.append(verdi)
                    M.append(maske)
    return (
        numpy.array(X, dtype=numpy.float32),
        numpy.array(V, dtype=numpy.float32),
        numpy.array(M, dtype=numpy.float32),
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="sd-v3")
    p.add_argument("--nett", default="e1-modell/ftf1.bin")
    p.add_argument("--ut", default="analyse/forsvarsprofil")
    p.add_argument("--tak", type=int, default=200_000)
    args = p.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    Xn, Vn, Mn = les_data([m for m in args.data.split(",") if m], args.tak)
    print(f"Enhet: {enhet}. Leste {len(Xn)} stillinger a {Xn.shape[1]} trekk", flush=True)

    modell = les_nett(args.nett).to(enhet).eval()
    bredde = modell.lag[0].in_features
    X = torch.from_numpy(Xn[:, :bredde]).to(enhet)
    Xfull = torch.from_numpy(Xn).to(enhet)
    V = torch.from_numpy(Vn).to(enhet)
    M = torch.from_numpy(Mn).to(enhet)

    neg = torch.finfo(torch.float32).min
    with torch.no_grad():
        vaar, gulv = [], []
        for i in range(0, X.shape[0], 16384):
            x, v, m = X[i : i + 16384], V[i : i + 16384], M[i : i + 16384]
            logits = modell(x).masked_fill(m == 0, neg)
            valgt = v.gather(1, logits.argmax(dim=1, keepdim=True)).squeeze(1)
            beste = v.masked_fill(m == 0, neg).max(dim=1).values
            # GULVET: forventet anger ved tilfeldig LOVLIG kort.
            snitt_lovlig = (v * m).sum(dim=1) / m.sum(dim=1).clamp(min=1)
            vaar.append(beste - valgt)
            gulv.append(beste - snitt_lovlig)
        vaar = torch.cat(vaar)
        gulv = torch.cat(gulv)

    # --- Situasjon, utledet av trekkene --------------------------------------
    er_foerer = Xfull[:, 208] > 0.5
    paa_laget = Xfull[:, 227] > 0.5
    forsvar = (~er_foerer) & (~paa_laget)
    # Posisjon i stikket = antall kort paa bordet naa (blokk 104-155).
    posisjon = (Xfull[:, 104:156] > 0.5).sum(dim=1).clamp(max=3)
    # Relativ plass til budvinner og utspiller.
    rel_foerer = Xfull[:, 208:212].argmax(dim=1)
    rel_leder = Xfull[:, 212:216].argmax(dim=1)
    # Har spillefoereren alt lagt i dette stikket? Han ligger `rel_foerer` seter
    # fram fra meg; utspilleren `rel_leder`. Spilte foer meg = hans plass i
    # stikket er lavere enn min.
    plass_foerer = (rel_foerer - rel_leder) % 4
    min_plass = (0 - rel_leder) % 4
    foerer_ute = plass_foerer < min_plass
    # Medforsvareren sitter to seter fra budvinneren, altsaa rel_foerer+2.
    rel_med = (rel_foerer + 2) % 4
    plass_med = (rel_med - rel_leder) % 4
    med_ute = plass_med < min_plass
    # STIKKNUMMER EKSAKT, av kortene som ligger. Indeks 228 er
    # stikkSpilt/kortPerSpiller, og kortPerSpiller er 12 naar det er talong -
    # aa gange med 13 ga et hoppende og delvis feil stikknummer (stikk 7
    # forsvant helt). Blokk 52-103 er alle aapent spilte kort inkludert
    # bordet, saa (antall - min posisjon) / 4 er stikket vi er inne i.
    spilte = (Xfull[:, 52:104] > 0.5).sum(dim=1)
    stikk = ((spilte - posisjon) // 4).clamp(0, 12)
    har_trumf_i_spill = Xfull[:, 224] < 0.5

    def rapporter(f, tittel, nokler):
        f.write(f"\n{tittel}\n")
        f.write(f"{'situasjon':32}{'n':>8}{'gulv':>9}{'vaar':>9}{'fanget':>9}\n")
        for navn, maske in nokler:
            m = maske & forsvar
            n = int(m.sum())
            if n < 200:
                continue
            g = float(gulv[m].mean())
            v = float(vaar[m].mean())
            f.write(f"{navn:32}{n:>8}{g:>9.4f}{v:>9.4f}{(g - v) / g:>9.3f}\n")

    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    with open(args.ut + ".txt", "w", encoding="utf-8") as f:
        f.write(f"FORSVARSPROFIL  nett={args.nett}  data={args.data}\n")
        f.write("fanget = (gulv - vaar) / gulv. 1,0 = som orakelet, 0,0 = som terningkast.\n")
        for navn, m in [
            ("spillefoerer", er_foerer),
            ("makker", paa_laget & ~er_foerer),
            ("forsvar", forsvar),
        ]:
            n = int(m.sum())
            g, v = float(gulv[m].mean()), float(vaar[m].mean())
            f.write(f"\nROLLE {navn:14} n={n:6d}  gulv {g:.4f}  vaar {v:.4f}  fanget {(g - v) / g:.3f}")
        f.write("\n")

        rapporter(
            f,
            "SAMSPILL: har medforsvareren alt lagt i dette stikket?",
            [
                ("medforsvarer har lagt", med_ute),
                ("medforsvarer har IKKE lagt", ~med_ute),
            ],
        )
        rapporter(
            f,
            "AA TA STIKK: har spillefoereren alt lagt?",
            [
                ("spillefoerer har lagt", foerer_ute),
                ("spillefoerer har IKKE lagt", ~foerer_ute),
            ],
        )
        rapporter(
            f,
            "POSISJON I STIKKET",
            [(f"{i + 1}. haand", posisjon == i) for i in range(4)],
        )
        rapporter(
            f,
            "TRUMF I SPILL",
            [("trumf finnes", har_trumf_i_spill), ("ingen trumf (grand)", ~har_trumf_i_spill)],
        )
        rapporter(
            f,
            "STIKKNUMMER",
            [(f"stikk {i}", stikk == i) for i in range(13)],
        )
        rapporter(
            f,
            "KRYSS: posisjon x medforsvarer",
            [
                (f"{i + 1}. haand, med {'etter' if not u else 'foer'} meg", (posisjon == i) & (med_ute == u))
                for i in range(4)
                for u in (False, True)
            ],
        )
    with open(args.ut + ".txt", encoding="utf-8") as f:
        print(f.read())
    print(f"Skrevet til {args.ut}.txt", flush=True)


if __name__ == "__main__":
    main()
