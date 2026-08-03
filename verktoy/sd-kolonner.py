"""KOLONNEANALYSE: hva bærer hver enkelt av de 356/364 inngangene?

    python verktoy/sd-kolonner.py --data sd-v3 --nett e1-modell/wred.bin \
        --ut analyse/kolonner-wred

HVORFOR DEN FINNES. Minneblokken strauk gate 2 med −0,38, og totalen skjulte
årsaken bak et snitt over fire seter. Rolledekomponeringen viste at HELE tapet
lå i spillefører (−1,475) — det eneste setet blokken informerer — og at 52
én-av-kolonner (277–328) var en memoreringsfelle. Den feilen var usynlig i alle
aggregerte tall vi hadde.

Denne fila gjør den analysen systematisk, for HVER kolonne, PER ROLLE.

TRE MÅL, som svarer på tre ulike spørsmål:

1. DEKNING og KARDINALITET — «kan denne kolonnen i det hele tatt bære noe, og
   er den en memoreringsfelle?» En kolonne som er nesten alltid null bærer
   lite. En kolonne med svært mange distinkte verdier, sett av bare ÉN rolle,
   er nøyaktig mønsteret som brakk minneblokken.

2. PERMUTASJONSVIKTIGHET — «hvor mye taper nettet på at denne kolonnen
   stokkes?» Stokking, ikke nullstilling: nullstilling flytter raden ut av
   fordelingen nettet er trent på, og måler da en blanding av viktighet og
   fordelingsskift. Stokking beholder kolonnens marginalfordeling og bryter
   bare koblingen til raden.

3. GRADIENTSALIENS — «hvor følsom er tapet for små endringer her?» Ett
   bakoverpass, og fanger opp kolonner som betyr mye lokalt selv om
   permutasjonen tilfeldigvis traff likt.

ROLLE UTLEDES AV TREKKENE SELV, siden radene ikke lagrer den:
  indeks 208 = 1  ->  budvinneren er meg           -> foerer
  indeks 227 = 1  ->  jeg er paa budvinnerens side -> makker (naar 208 != 1)
  ellers                                           -> forsvar

ALT SKRIVES TIL FIL. En kjoering som tar minutter skal aldri ha resultatene
sine i et roer.
"""

import argparse
import json
import os
import struct

import numpy
import torch
import torch.nn.functional as F

KORT = 52
# Grensene mellom blokkene i src/e1/trekk.ts. Brukes bare til merkelapper.
BLOKKER = [
    (0, 238, "app (nevro)"),
    (238, 273, "v1 egne"),
    (273, 277, "v2 vrak/farge"),
    (277, 329, "v2 vrak EN-AV"),
    (329, 340, "v2 korrigert"),
    (340, 356, "v3 telling"),
    (356, 364, "v4 auksjon"),
]


def blokknavn(i: int) -> str:
    for a, b, navn in BLOKKER:
        if a <= i < b:
            return navn
    return "?"


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


def les_nett(sti: str) -> E1Nett:
    lag = []
    with open(sti, "rb") as f:
        if struct.unpack("<i", f.read(4))[0] != 1:
            raise SystemExit(f"{sti}: forventet ett nett")
        for _ in range(struct.unpack("<i", f.read(4))[0]):
            inn, ut = struct.unpack("<ii", f.read(8))
            W = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn).copy()
            b = numpy.frombuffer(f.read(ut * 4), dtype="<f4").copy()
            lag.append((W, b))
    dims = [lag[0][0].shape[1]] + [W.shape[0] for W, _ in lag]
    m = E1Nett(dims)
    with torch.no_grad():
        for i, (W, b) in enumerate(lag):
            m.lag[i].weight.copy_(torch.from_numpy(W))
            m.lag[i].bias.copy_(torch.from_numpy(b))
    return m


def les_data(mapper: list[str], tak: int):
    X, V, M = [], [], []
    for mappe in mapper:
        for navn in sorted(os.listdir(mappe)):
            if not navn.endswith(".jsonl"):
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
                    if not t or not v:
                        continue
                    verdi = numpy.zeros(KORT, dtype=numpy.float32)
                    maske = numpy.zeros(KORT, dtype=numpy.float32)
                    for k, x in v.items():
                        verdi[int(k)] = x
                        maske[int(k)] = 1
                    if maske.sum() < 2:
                        continue  # ingen valg aa ta - baerer ingen informasjon
                    X.append(t)
                    V.append(verdi)
                    M.append(maske)
            if len(X) >= tak:
                break
    return (
        numpy.array(X, dtype=numpy.float32),
        numpy.array(V, dtype=numpy.float32),
        numpy.array(M, dtype=numpy.float32),
    )


def anger(modell, X, V, M, bit=16384):
    """Snittlig ANGER: verdien av det beste lovlige kortet minus det valgte."""
    ut = []
    neg = torch.finfo(torch.float32).min
    for i in range(0, X.shape[0], bit):
        x, v, m = X[i : i + bit], V[i : i + bit], M[i : i + bit]
        logits = modell(x).masked_fill(m == 0, neg)
        valgt = v.gather(1, logits.argmax(dim=1, keepdim=True)).squeeze(1)
        beste = v.masked_fill(m == 0, neg).max(dim=1).values
        ut.append(beste - valgt)
    return torch.cat(ut)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="sd-v3")
    p.add_argument("--nett", default="e1-modell/wred.bin")
    p.add_argument("--ut", default="analyse/kolonner")
    p.add_argument("--tak", type=int, default=200_000)
    p.add_argument("--gjentak", type=int, default=5, help="stokkinger per kolonne")
    p.add_argument("--froe", type=int, default=20260803)
    args = p.parse_args()

    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Enhet: {enhet}", flush=True)

    Xn, Vn, Mn = les_data([m for m in args.data.split(",") if m], args.tak)
    print(f"Leste {len(Xn)} stillinger a {Xn.shape[1]} trekk", flush=True)

    modell = les_nett(args.nett).to(enhet).eval()
    bredde = modell.lag[0].in_features
    if bredde > Xn.shape[1]:
        raise SystemExit(f"nettet vil ha {bredde} trekk, dataen har {Xn.shape[1]}")
    Xn = Xn[:, :bredde]

    X = torch.from_numpy(Xn).to(enhet)
    V = torch.from_numpy(Vn).to(enhet)
    M = torch.from_numpy(Mn).to(enhet)

    # --- ROLLE, utledet av trekkene (se modulkommentaren) --------------------
    er_foerer = X[:, 208] > 0.5
    paa_laget = X[:, 227] > 0.5
    rolle = torch.where(er_foerer, 0, torch.where(paa_laget, 1, 2))  # 0 f, 1 m, 2 fo
    roller = {"foerer": 0, "makker": 1, "forsvar": 2}
    for navn, kode in roller.items():
        print(f"  {navn}: {int((rolle == kode).sum())}", flush=True)

    with torch.no_grad():
        grunn = anger(modell, X, V, M)
    grunnsnitt = {n: float(grunn[rolle == k].mean()) for n, k in roller.items()}
    grunnsnitt["alle"] = float(grunn.mean())
    print("Grunn-anger: " + "  ".join(f"{n} {v:.5f}" for n, v in grunnsnitt.items()), flush=True)

    # --- GRADIENTSALIENS: ett bakoverpass ------------------------------------
    saliens = torch.zeros(bredde, device=enhet)
    neg = torch.finfo(torch.float32).min
    bit = 8192
    for i in range(0, X.shape[0], bit):
        x = X[i : i + bit].clone().requires_grad_(True)
        v, m = V[i : i + bit], M[i : i + bit]
        logits = modell(x).masked_fill(m == 0, neg)
        maal = F.softmax(v.masked_fill(m == 0, neg), dim=1)
        tap = -(maal * F.log_softmax(logits, dim=1)).sum(dim=1).mean()
        (g,) = torch.autograd.grad(tap, x)
        saliens += g.abs().sum(dim=0)
    saliens /= X.shape[0]

    # --- PERMUTASJONSVIKTIGHET, per kolonne og per rolle ---------------------
    g = torch.Generator(device=enhet).manual_seed(args.froe)
    rader = []
    with torch.no_grad():
        for j in range(bredde):
            kol = X[:, j]
            unike = int(torch.unique(kol).numel())
            dekning = float((kol != 0).float().mean())
            if dekning == 0.0:
                # Alltid null: stokking kan ikke endre noe. Hopp over arbeidet,
                # men ta med raden - en tom kolonne er i seg selv et funn.
                rader.append(
                    {
                        "i": j,
                        "blokk": blokknavn(j),
                        "dekning": 0.0,
                        "unike": unike,
                        "saliens": float(saliens[j]),
                        "delta": {n: 0.0 for n in list(roller) + ["alle"]},
                    }
                )
                continue
            akk = {n: 0.0 for n in list(roller) + ["alle"]}
            original = kol.clone()
            for _ in range(args.gjentak):
                X[:, j] = original[torch.randperm(X.shape[0], generator=g, device=enhet)]
                ny = anger(modell, X, V, M)
                d = ny - grunn
                akk["alle"] += float(d.mean())
                for n, k in roller.items():
                    akk[n] += float(d[rolle == k].mean())
            X[:, j] = original
            rader.append(
                {
                    "i": j,
                    "blokk": blokknavn(j),
                    "dekning": dekning,
                    "unike": unike,
                    "saliens": float(saliens[j]),
                    "delta": {n: akk[n] / args.gjentak for n in akk},
                }
            )
            if (j + 1) % 40 == 0:
                print(f"  {j + 1}/{bredde} kolonner", flush=True)

    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    with open(args.ut + ".json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "nett": args.nett,
                "data": args.data,
                "stillinger": int(X.shape[0]),
                "grunnanger": grunnsnitt,
                "kolonner": rader,
            },
            f,
            ensure_ascii=False,
            indent=1,
        )

    # --- Menneskelesbart sammendrag ------------------------------------------
    with open(args.ut + ".txt", "w", encoding="utf-8") as f:
        f.write(f"KOLONNEANALYSE  nett={args.nett}  data={args.data}  n={X.shape[0]}\n")
        f.write("delta = oekning i anger naar kolonnen stokkes (hoeyere = viktigere)\n\n")
        f.write("PER BLOKK\n")
        f.write(f"{'blokk':16}{'kol':>6}{'alle':>10}{'foerer':>10}{'makker':>10}{'forsvar':>10}\n")
        for a, b, navn in BLOKKER:
            i_blokk = [r for r in rader if a <= r["i"] < b]
            if not i_blokk:
                continue
            f.write(f"{navn:16}{len(i_blokk):>6}")
            for n in ["alle", "foerer", "makker", "forsvar"]:
                f.write(f"{sum(r['delta'][n] for r in i_blokk):>10.5f}")
            f.write("\n")
        f.write("\nDE 40 VIKTIGSTE KOLONNENE\n")
        f.write(
            f"{'i':>5}{'blokk':16}{'dekn':>7}{'unike':>7}{'saliens':>10}"
            f"{'alle':>10}{'foerer':>10}{'makker':>10}{'forsvar':>10}\n"
        )
        for r in sorted(rader, key=lambda r: -r["delta"]["alle"])[:40]:
            f.write(
                f"{r['i']:>5}{r['blokk']:16}{r['dekning']:>7.3f}{r['unike']:>7}"
                f"{r['saliens']:>10.6f}"
                + "".join(f"{r['delta'][n]:>10.5f}" for n in ["alle", "foerer", "makker", "forsvar"])
                + "\n"
            )
        f.write("\nKOLONNER SOM SKADER (negativ delta = nettet blir BEDRE av aa miste dem)\n")
        f.write(
            f"{'i':>5}{'blokk':16}{'dekn':>7}{'unike':>7}"
            f"{'alle':>10}{'foerer':>10}{'makker':>10}{'forsvar':>10}\n"
        )
        for r in sorted(rader, key=lambda r: r["delta"]["alle"])[:25]:
            if r["delta"]["alle"] >= 0:
                break
            f.write(
                f"{r['i']:>5}{r['blokk']:16}{r['dekning']:>7.3f}{r['unike']:>7}"
                + "".join(f"{r['delta'][n]:>10.5f}" for n in ["alle", "foerer", "makker", "forsvar"])
                + "\n"
            )
    print(f"\nSkrevet til {args.ut}.json og {args.ut}.txt", flush=True)


if __name__ == "__main__":
    main()
