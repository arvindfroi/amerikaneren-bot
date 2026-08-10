#!/usr/bin/env python3
"""
MLB §124 — HVOR MYE AV FORDELEN ER SIGNAL? Diagnosen, ikke en ny epoke.

    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-fordel-diagnose.py \
        --inn "mlb-epoke-data/erf-s*.bin" --ut analyse/mlb-fordel-diagnose.txt

============================ SPOERSMAALET ===============================

Ti epoker lukket 96 % av gapet mot det ytre panelet paa fem, og saa ingenting
paa fire. To hypoteser:

  A  GRUNNLINJEN ER FOR DAARLIG. Verdihodet forklarer 13 % av variansen, saa
     87 % av fordelen er stoey.
  B  BEFOLKNINGEN ER METTET. Det finnes ikke mer signal aa hente.

Denne fila avgjoer A, og den gjoer det paa DATA SOM ALLEREDE FINNES — epoke 10s
egen erfaringsfil. Ingen nye kamper spilles.

============================ DEN ENE IDENTITETEN ========================

Med `--lambda 1` er `gaeFordel` en teleskopsum, og fordelen er EKSAKT

    A_t = G_t - V(s_t)

der `G_t = sluttpoeng[sete] - poengFoer(t)` er resten av kampen. Og `poengFoer`
er den SAMME for hver beslutning i samme runde. Altsaa:

    to beslutninger i samme runde, samme sete  =>  G er BIT-IDENTISK
    forskjellen i fordel mellom dem er DERFOR bare V(s_2) - V(s_1)

Det er hele kredittilordningen i ett ledd. Er `V` naer konstant innenfor en
runde, faar alle ~15 kortvalgene i runden samme dytt — og gradienten kan ikke
skille kortet som avgjorde kontrakten fra de elleve likegyldige.

`docs/mlb.md` §2 skrev nettopp dette som «kredittproblemet, som utkastet gikk
rett forbi», og loeste det med TD. §123 satte lambda til 1 for aa redde
budrunden, og TOK DERMED KREDITTILORDNINGEN UT IGJEN. Denne fila maaler prisen.

============================ HVA SOM MAALES =============================

  1. forklart varians for V, totalt og per fase
  2. identiteten A = G - V, som en proeve paa at lambda faktisk var 1
  3. VARIANSOPPDELINGEN av A: mellom runder mot innenfor runder
  4. LINEAER PROBE fra de samme 1 032 trekkene til G, paa holdout.
     Slaar en ridge-regresjon 2,4 M-parameternettet, er hodet UNDERTRENT og
     ikke ved taket — og da er fiksen trening, ikke et nytt maal.
  5. ALTERNATIVE VERDIMAAL paa samme trekk og samme holdout:
     rundens poeng (avledet av G-differansen mellom paafoelgende runder),
     klippet G, og resten-etter-runden.

Rundegrupperingen er eksakt: `makro.rundeNr` (trekk 876) er
`klipp01(rundeNr/60)`, altsaa ikke-avtakende innenfor en kamp og fallende ved
kampskifte. Radene ligger i kamprekkefoelge i fila.
"""

import argparse
import glob
import os
import struct
import time

import numpy
import torch

KORT = 52
IDX_RUNDENR = 876  # makro.rundeNr = klipp01(rundeNr / 60)
FASENAVN = {0: "bud", 1: "vrak", 2: "velg", 3: "spill"}


def post_dtype(dim, mdim):
    return numpy.dtype(
        [
            ("t", "<f4", (dim,)),
            ("m", "u1", (mdim,)),
            ("f", "i1", (KORT,)),
            ("kode", "<i2"),
            ("lovlige", "<i2"),
            ("fase", "<i2"),
            ("sete", "<i2"),
            ("A", "<f4"),
            ("G", "<f4"),
            ("v", "<f4"),
        ]
    )


def les_fil(sti):
    with open(sti, "rb") as fh:
        if fh.read(4) != b"MLBE":
            raise SystemExit(f"{sti}: ikke MLBE")
        (versjon,) = struct.unpack("<i", fh.read(4))
        (d,) = struct.unpack("<i", fh.read(4))
        (md,) = struct.unpack("<i", fh.read(4))
        (post,) = struct.unpack("<i", fh.read(4))
        if versjon != 1:
            raise SystemExit(f"{sti}: versjon {versjon}")
        dt = post_dtype(d, md)
        if dt.itemsize != post:
            raise SystemExit(f"{sti}: {post} byte per rad, leseren regner {dt.itemsize}")
        return numpy.fromfile(fh, dtype=dt), d, md


def gruppene(rundenr, sete, G):
    """(kamp, runde, sete)-gruppe per rad, i filrekkefoelge.

    Ny KAMP naar `rundeNr` faller for et sete. Ny GRUPPE naar rundeNr eller
    setet skifter innenfor kampen. Returnerer ogsaa kamp-id per rad, slik at
    holdout kan splittes paa KAMP og ikke paa rad — ellers ligger to
    beslutninger fra samme runde paa hver sin side av splitten, og proben faar
    fasiten servert.
    """
    n = len(rundenr)
    gruppe = numpy.empty(n, dtype=numpy.int64)
    kamp = numpy.empty(n, dtype=numpy.int64)
    sist_runde = {}
    sist_gruppe = {}
    g = -1
    k = 0
    for i in range(n):
        s = int(sete[i])
        r = float(rundenr[i])
        forrige = sist_runde.get(s)
        if forrige is None:
            g += 1
            sist_gruppe[s] = g
        elif r < forrige - 1e-9:
            # rundetallet FALT for dette setet: en ny kamp har begynt
            k += 1
            sist_runde.clear()
            sist_gruppe.clear()
            g += 1
            sist_gruppe[s] = g
        elif r > forrige + 1e-9:
            g += 1
            sist_gruppe[s] = g
        sist_runde[s] = r
        gruppe[i] = sist_gruppe[s]
        kamp[i] = k
    return gruppe, kamp


def r2(y, p):
    y = y.double()
    p = p.double()
    ss = float(((y - p) ** 2).mean())
    v = float(y.var(unbiased=False))
    return 1.0 - ss / max(v, 1e-12)


class Ridge:
    """Lukket form, med `XtX` REGNET EN GANG.

    `XtX` avhenger bare av trekkene, ikke av maalet. Elleve maal delte foerste
    utgave paa elleve like store float64-akkumuleringer over 300 000 rader —
    det var mesteparten av kjoeretiden, og hele den er unoedvendig.
    """

    def __init__(self, X, idx_tren, idx_test, lam, enhet, batch=8192):
        self.X, self.idx_tren, self.idx_test = X, idx_tren, idx_test
        self.enhet, self.batch = enhet, batch
        d = X.shape[1]
        self.d = d
        XtX = torch.zeros(d + 1, d + 1, dtype=torch.float64, device=enhet)
        for i in range(0, len(idx_tren), batch):
            xb = self._blokk(idx_tren[i : i + batch])
            XtX += xb.T @ xb
        reg = lam * torch.eye(d + 1, dtype=torch.float64, device=enhet)
        reg[d, d] = 0.0
        self.LU = torch.linalg.lu_factor(XtX + reg)

    def _blokk(self, j):
        xb = self.X[j].to(self.enhet).double()
        return torch.cat([xb, torch.ones(len(j), 1, dtype=torch.float64, device=self.enhet)], dim=1)

    def __call__(self, y):
        Xty = torch.zeros(self.d + 1, dtype=torch.float64, device=self.enhet)
        for i in range(0, len(self.idx_tren), self.batch):
            j = self.idx_tren[i : i + self.batch]
            Xty += self._blokk(j).T @ y[j].to(self.enhet).double()
        w = torch.linalg.lu_solve(*self.LU, Xty.unsqueeze(1)).squeeze(1)
        ut = []
        for i in range(0, len(self.idx_test), self.batch):
            ut.append(self._blokk(self.idx_test[i : i + self.batch]) @ w)
        return torch.cat(ut).float().cpu()


def mlp_probe(X, y, idx_tren, idx_test, enhet, skjult=(512, 256), epoker=8, lr=1e-3, batch=1024):
    """Et LITE nett paa de samme trekkene. Taket for hva formen kan gi, omtrent."""
    import torch.nn as nn

    d = X.shape[1]
    lag = []
    inn = d
    for h in skjult:
        lag += [nn.Linear(inn, h), nn.ReLU()]
        inn = h
    lag += [nn.Linear(inn, 1)]
    modell = nn.Sequential(*lag).to(enhet)
    opt = torch.optim.AdamW(modell.parameters(), lr=lr)
    ys = float(y[idx_tren].std()) or 1.0
    ym = float(y[idx_tren].mean())
    for _ in range(epoker):
        perm = idx_tren[torch.randperm(len(idx_tren))]
        for i in range(0, len(perm), batch):
            j = perm[i : i + batch]
            xb = X[j].to(enhet)
            yb = (y[j].to(enhet) - ym) / ys
            tap = torch.nn.functional.mse_loss(modell(xb).squeeze(-1), yb)
            opt.zero_grad(set_to_none=True)
            tap.backward()
            torch.nn.utils.clip_grad_norm_(modell.parameters(), 1.0)
            opt.step()
    modell.eval()
    ut = []
    with torch.no_grad():
        for i in range(0, len(idx_test), batch):
            j = idx_test[i : i + batch]
            ut.append(modell(X[j].to(enhet)).squeeze(-1).cpu() * ys + ym)
    return torch.cat(ut)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inn", default="mlb-epoke-data/erf-s*.bin")
    ap.add_argument("--ut", default="analyse/mlb-fordel-diagnose.txt")
    ap.add_argument("--maks-rader", type=int, default=0)
    ap.add_argument("--ridge", type=float, default=100.0)
    ap.add_argument("--mlp-epoker", type=int, default=8)
    ap.add_argument("--froe", type=int, default=20260810)
    args = ap.parse_args()

    t0 = time.time()
    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(args.froe)

    os.makedirs(os.path.dirname(args.ut) or ".", exist_ok=True)
    # LOEPENDE SKRIVING. En diagnose som bare skriver til slutt er en diagnose
    # som kan gaa tapt — det har skjedd i dette prosjektet foer.
    f = open(args.ut, "w", encoding="utf-8", buffering=1)

    def si(s=""):
        f.write(s + "\n")
        print(s, flush=True)

    si(f"MLB FORDELSDIAGNOSE  {time.strftime('%Y-%m-%d %H:%M')}  enhet={enhet}")
    si(f"inn={args.inn}")
    si("")

    filer = []
    for m in args.inn.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen filer for {args.inn}")

    deler = []
    n = 0
    for sti in filer:
        a, d, md = les_fil(sti)
        deler.append(a)
        n += len(a)
        if args.maks_rader and n >= args.maks_rader:
            break
    rad = numpy.concatenate(deler)
    del deler
    if args.maks_rader:
        rad = rad[: args.maks_rader]
    n = len(rad)
    si(f"{len(filer)} filer, {n} rader, {d} trekk")

    G = torch.from_numpy(numpy.ascontiguousarray(rad["G"])).float()
    V = torch.from_numpy(numpy.ascontiguousarray(rad["v"])).float()
    A = torch.from_numpy(numpy.ascontiguousarray(rad["A"])).float()
    fase = torch.from_numpy(numpy.ascontiguousarray(rad["fase"])).long()
    lovlige = torch.from_numpy(numpy.ascontiguousarray(rad["lovlige"])).long()
    sete = numpy.ascontiguousarray(rad["sete"])
    rundenr = numpy.ascontiguousarray(rad["t"][:, IDX_RUNDENR])

    # ================================================================ 1. V
    si("")
    si("=== 1. VERDIHODET ===")
    varG = float(G.var(unbiased=False))
    mse = float(((G - V) ** 2).mean())
    si(f"G:  snitt {float(G.mean()):+8.3f}  sd {varG ** 0.5:8.3f}  "
       f"min {float(G.min()):+.1f}  maks {float(G.max()):+.1f}")
    si(f"V:  snitt {float(V.mean()):+8.3f}  sd {float(V.std()):8.3f}")
    si(f"RMSE {mse ** 0.5:.3f}   forklart varians {1 - mse / varG:+.4f}")
    si(f"korr(V, G) = {float(torch.corrcoef(torch.stack([V.double(), G.double()]))[0, 1]):+.4f}")
    si(f"korr(A, G) = {float(torch.corrcoef(torch.stack([A.double(), G.double()]))[0, 1]):+.4f}")
    si("")
    si("per fase:")
    for k in sorted(FASENAVN):
        m = fase == k
        if not bool(m.any()):
            continue
        vg = float(G[m].var(unbiased=False))
        ms = float(((G[m] - V[m]) ** 2).mean())
        si(f"  {FASENAVN[k]:6s} n={int(m.sum()):8d}  sd(G)={vg ** 0.5:8.2f}  "
           f"RMSE={ms ** 0.5:8.2f}  forklart={1 - ms / max(vg, 1e-9):+.4f}")

    # ================================================================ 2. A=G-V
    si("")
    si("=== 2. IDENTITETEN A = G - V (proeve paa at lambda var 1) ===")
    avvik = (A - (G - V)).abs()
    si(f"maks |A - (G - V)| = {float(avvik.max()):.4f}   snitt = {float(avvik.mean()):.6f}")
    si("Er den ~0, baerer fordelen INGEN kredittilordning utover V-differansen.")

    # ================================================================ 3. oppdeling
    si("")
    si("=== 3. VARIANSOPPDELINGEN AV FORDELEN ===")
    tg = time.time()
    gruppe, kamp = gruppene(rundenr, sete, G)
    ng = int(gruppe.max()) + 1
    nk = int(kamp.max()) + 1
    si(f"{nk} kamper, {ng} (kamp,runde,sete)-grupper, "
       f"{n / max(ng, 1):.2f} rader per gruppe  ({time.time() - tg:.0f}s)")

    gt = torch.from_numpy(gruppe)
    sum_g = torch.zeros(ng, dtype=torch.float64).index_add_(0, gt, A.double())
    ant_g = torch.zeros(ng, dtype=torch.float64).index_add_(0, gt, torch.ones(n, dtype=torch.float64))
    snitt_g = sum_g / ant_g
    innen = A.double() - snitt_g[gt]
    var_tot = float(A.double().var(unbiased=False))
    var_innen = float((innen ** 2).mean())
    var_mellom = var_tot - var_innen
    si(f"Var(A) totalt      {var_tot:12.3f}")
    si(f"  MELLOM runder    {var_mellom:12.3f}   {100 * var_mellom / var_tot:6.2f} %")
    si(f"  INNENFOR runder  {var_innen:12.3f}   {100 * var_innen / var_tot:6.2f} %")
    si("")
    si("Andelen INNENFOR er all kreditt som skiller ett kortvalg fra et annet i")
    si("samme runde. Resten dytter hele runden i samme retning.")

    # bare radene som faktisk BAERER en policygradient
    mv = lovlige > 1
    if bool(mv.any()):
        Am = A[mv].double()
        gm = gt[mv]
        # ny, tett gruppeindeks
        uniq, inv = torch.unique(gm, return_inverse=True)
        ngm = len(uniq)
        s2 = torch.zeros(ngm, dtype=torch.float64).index_add_(0, inv, Am)
        a2 = torch.zeros(ngm, dtype=torch.float64).index_add_(0, inv, torch.ones(len(Am), dtype=torch.float64))
        inn2 = Am - (s2 / a2)[inv]
        vt = float(Am.var(unbiased=False))
        vi = float((inn2 ** 2).mean())
        si("")
        si(f"bare rader med >1 lovlig valg (n={int(mv.sum())}):")
        si(f"  INNENFOR runder {100 * vi / vt:6.2f} %   MELLOM {100 * (vt - vi) / vt:6.2f} %")

    # ================================================================ 3b. tegnet
    #
    # «Hvor stor andel av `An` peker samme vei som utfallet?» er det naturlige
    # spoersmaalet, men svaret paa det er misvisende: med lambda = 1 ER fordelen
    # utfallet minus en naer-konstant, saa tegnet stemmer nesten alltid. Det
    # SKARPE spoersmaalet er om tegnet skiller ETT VALG fra et annet — altsaa om
    # to beslutninger i SAMME runde noen gang faar motsatt dytt.
    si("")
    si("=== 3b. KAN TEGNET I FORDELEN SKILLE TO VALG I SAMME RUNDE? ===")
    tegn_A = torch.sign(A.double())
    tegn_G = torch.sign((G - float(G.mean())).double())
    si(f"tegn(A) = tegn(G - snitt G) paa  {100 * float((tegn_A == tegn_G).float().mean()):.2f} % av radene")
    pos_g = torch.zeros(ng, dtype=torch.float64).index_add_(0, gt, (A > 0).double())
    blandet = ((pos_g > 0) & (pos_g < ant_g)).double()
    fler = ant_g > 1
    si(f"grupper med mer enn en rad: {int(fler.sum())}")
    si(f"  ... der ikke alle radene har SAMME fortegn paa A: "
       f"{int((blandet * fler).sum())}  "
       f"({100 * float((blandet * fler).sum()) / max(float(fler.sum()), 1):.2f} %)")
    si("Er den andelen naer null, faar hvert eneste valg i runden samme dytt, og")
    si("gradienten kan ikke skille kortet som avgjorde kontrakten fra de elleve")
    si("likegyldige. Det er kredittproblemet i `docs/mlb.md` §2, tilbake.")

    # ================================================================ 4/5. prober
    si("")
    si("=== 4. HVOR MYE ER I DET HELE TATT FORUTSIGBART? ===")
    si("Proben ser NOEYAKTIG de samme 1 032 trekkene som verdihodet. Holdout er")
    si("splittet paa KAMP, ikke paa rad.")

    X = torch.from_numpy(numpy.ascontiguousarray(rad["t"]))
    del rad

    kt = torch.from_numpy(kamp)
    grense = int(nk * 0.8)
    idx_tren = torch.nonzero(kt < grense, as_tuple=False).squeeze(1)
    idx_test = torch.nonzero(kt >= grense, as_tuple=False).squeeze(1)
    si(f"tren {len(idx_tren)} rader ({grense} kamper), holdout {len(idx_test)} rader "
       f"({nk - grense} kamper)")
    tr = time.time()
    reg = Ridge(X, idx_tren, idx_test, args.ridge, enhet)
    si(f"XtX regnet paa {time.time() - tr:.0f} s (en gang, delt av alle maal)")

    # --- avledede maal -----------------------------------------------------
    # RUNDENS POENG. G(runde k) - G(runde k+1) = poengene som falt i runde k,
    # fordi G = slutt - poengFoer og poengFoer(k+1) = poengFoer(k) + r_k.
    # Siste runde i en kamp har ingen etterfoelger; der er r = G.
    g_gruppe = torch.zeros(ng, dtype=torch.float64).index_add_(0, gt, G.double()) / ant_g
    sete_g = numpy.zeros(ng, dtype=numpy.int64)
    kamp_g = numpy.zeros(ng, dtype=numpy.int64)
    sete_g[gruppe] = sete
    kamp_g[gruppe] = kamp
    r_gruppe = torch.zeros(ng, dtype=torch.float64)
    # neste gruppe for SAMME sete i SAMME kamp er den neste i gruppeindeksen
    # som deler (kamp, sete) — gruppene er tildelt i filrekkefoelge.
    neste = {}
    for gi in range(ng - 1, -1, -1):
        nøkkel = (int(kamp_g[gi]), int(sete_g[gi]))
        j = neste.get(nøkkel)
        r_gruppe[gi] = g_gruppe[gi] - (g_gruppe[j] if j is not None else 0.0)
        neste[nøkkel] = gi
    y_r = r_gruppe[gt].float()
    y_rest = (G.double() - r_gruppe[gt]).float()
    sd = float(G.std())
    y_klipp = G.clamp(-2 * sd, 2 * sd)

    maal = [
        ("G  (resten av kampen)", G),
        ("G klippet paa +-2 sd", y_klipp),
        ("r  (rundens poeng)", y_r),
        ("resten ETTER runden", y_rest),
    ]

    si("")
    si(f"{'maal':26s} {'sd':>9s} {'ridge R2':>10s} {'MLP R2':>9s} {'V-hodet R2':>11s}")
    for navn, y in maal:
        p = reg(y)
        r_ridge = r2(y[idx_test], p)
        p2 = mlp_probe(X, y, idx_tren, idx_test, enhet, epoker=args.mlp_epoker)
        r_mlp = r2(y[idx_test], p2)
        if navn.startswith("G  "):
            yt = y[idx_test].double()
            vt_ = V[idx_test].double()
            r_v = 1.0 - float(((yt - vt_) ** 2).mean()) / max(float(yt.var(unbiased=False)), 1e-12)
            rv = f"{r_v:+11.4f}"
        else:
            rv = f"{'-':>11s}"
        si(f"{navn:26s} {float(y.std()):9.2f} {r_ridge:+10.4f} {r_mlp:+9.4f} {rv}")
        f.flush()

    # ============================================ 5b. kontrakt mot forsvar
    #
    # «Separate hoder for kontrakt og forsvar» er en av kandidatene. Proeven er
    # om de to gruppene i det hele tatt er ULIKE nok til at et delt hode taper
    # noe: her maales R2 for hver gruppe med EN felles ridge mot en egen.
    si("")
    si("=== 5b. KONTRAKT MOT FORSVAR: ville to hoder hjulpet? ===")
    erBudvinner = X[:, 714] > 0.5
    p_felles = reg(G)
    for navn, mask in (("kontrakt", erBudvinner), ("forsvar", ~erBudvinner)):
        it = idx_tren[mask[idx_tren]]
        ie = idx_test[mask[idx_test]]
        if len(it) < 1000 or len(ie) < 200:
            si(f"  {navn:9s} for faa rader ({len(it)}/{len(ie)})")
            continue
        felles = r2(G[ie], p_felles[mask[idx_test]])
        egen = Ridge(X, it, ie, args.ridge, enhet)
        si(f"  {navn:9s} n_tren={len(it):7d} n_test={len(ie):6d}  "
           f"sd(G)={float(G[ie].std()):7.2f}  felles ridge R2={felles:+.4f}  "
           f"eget hode R2={r2(G[ie], egen(G)):+.4f}")
        f.flush()

    # ================================================================ 6. gamma
    #
    # STOEYEN ER ADDITIV OG KONSTANT INNENFOR RUNDEN. Signalet for et kortvalg i
    # runde k er `r_k`; alt etter runden er den SAMME talen for alle valgene i
    # runden, og proben over sier at den nesten ikke lar seg forutsi. En
    # DISKONTERING demper halen uten aa kutte den — makrotrekkene faar fortsatt
    # gradient (K5 overlever), men stoeyen skrumper.
    #
    # Diskonteringen er per RUNDE, ikke per beslutning: poeng faller bare ved
    # rundeslutt, saa runden er den naturlige enheten.
    si("")
    si("=== 6. DISKONTERINGEN: hvor mye hale taaler signalet? ===")
    kamp_g_t = torch.from_numpy(kamp_g)
    sete_g_t = torch.from_numpy(sete_g)
    ordn = numpy.lexsort((numpy.arange(ng), sete_g, kamp_g))  # stabil, per (kamp,sete)
    si(f"{'gamma':>6s} {'sd(r_k)':>9s} {'sd(hale)':>10s} {'signal/stoey':>13s} "
       f"{'innenfor %':>11s} {'ridge R2':>10s}")
    for gamma in (1.0, 0.9, 0.8, 0.7, 0.5, 0.3, 0.0):
        # G^gamma per gruppe, baklengs over (kamp, sete)-kjeden
        Gg = torch.zeros(ng, dtype=torch.float64)
        hale = torch.zeros(ng, dtype=torch.float64)
        etter = {}
        for pos in range(ng - 1, -1, -1):
            gi = int(ordn[pos])
            nk_ = (int(kamp_g[gi]), int(sete_g[gi]))
            j = etter.get(nk_)
            h = gamma * (Gg[j] if j is not None else 0.0)
            hale[gi] = h
            Gg[gi] = r_gruppe[gi] + h
            etter[nk_] = gi
        y = Gg[gt].float()
        p = reg(y)
        sd_r = float(r_gruppe.std())
        sd_h = float(hale.std())
        si(f"{gamma:6.2f} {sd_r:9.2f} {sd_h:10.2f} {sd_r / max(sd_h, 1e-9):13.2f} "
           f"{'-':>11s} {r2(y[idx_test], p):+10.4f}")
        f.flush()
    si("")
    si("`signal/stoey` er sd(rundens poeng) delt paa sd(den diskonterte halen).")
    si("Ved gamma = 1 er halen alt som skiller kredittene fra hverandre — og den")
    si("er den SAMME for hver beslutning i runden.")

    si("")
    si("LES DEN SLIK: slaar en ridge-regresjon paa de samme trekkene verdihodets")
    si("egne 13 %, er hodet UNDERTRENT og ikke ved taket. Er rundens poeng mye")
    si("mer forutsigbart enn resten av kampen, ligger fiksen i MAALET.")
    si("")
    si(f"ferdig paa {time.time() - t0:.0f} s")
    f.close()


if __name__ == "__main__":
    main()
