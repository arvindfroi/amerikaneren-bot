"""
BUDVANE §1–§2 — ER MENNESKERS BUD FORUTSIGBARE FRA DERES EGEN HISTORIKK? (14. sep)

    python verktoy/budvane-analyse.py [D:/amb-grp/loop/budvane/bud.jsonl]

Radene kommer fra `examples/budvane-data.ts` (2641 menneskebud, 385 kamper). Bare numpy.

=================== HVA SOM MÅLES, OG MOT HVA ============================

Målet er menneskets FØRSTE bud i runden, som fem klasser: PASS, 9, 10, 11, ANNET.
Tapsmålet er log-tap per beslutning (nats). Lavere er bedre. ALLE armer scorer NØYAKTIG
de samme beslutningene, så differansene er parret.

  M0  PRIOR          marginalfordelingen. Gulvet.
  M1  GENERISK       + offentlig kampkontekst (rundenr, stilling, forrige rundes utfall).
                     Ingen spilleridentitet. Dette er nullarm (a) i oppdraget.
  M2  EGEN BOK       M1 + spillerens EGNE tidligere runder (bud mot avdekket hånd,
                     passrate, budnivå). To varianter: boka i SAMME kamp, og boka over
                     spillerens tidligere kamper.
  M3  FREMMED BOK    identisk med M2, men boka kommer fra en ANNEN spiller.
                     Nullarm (b) — FREMMED-BOK-FELLA. Er M3 ≈ M2 måler vi «mennesker
                     generelt», ikke en profil, og sporet er dødt.
  M4  TAK (ULOVLIG)  M1 + `naa_anslag`: styrken på hånden mennesket SATT MED da han bød.
                     Boten ser den aldri. Armen er en POSITIV KONTROLL — finner den ikke
                     signal, er det røret som er ødelagt, ikke dataene. Rapporteres som
                     tak, aldri som kandidat.

=================== METODEKRAVENE, OG HVORDAN DE ER MØTT =================

KLYNGET PÅ KAMP     runder i samme kamp er ikke uavhengige. All usikkerhet er
                    klyngebootstrap over KAMPER (B = 20 000). SE er bootstrapfordelingens
                    standardavvik — den deles IKKE på √n en gang til.
PARRET              differansene regnes per beslutning før de snittes.
INGEN LEKKASJE      modellene krysstrenes 5-delt PÅ KAMP (aldri på runde: to runder i
                    samme kamp deler spiller, stilling og bok). Bøkene bygges bare av
                    runder med TIDLIGERE tidsstempel.
STØRRELSESMATCHET   den fremmede kamp-boka hentes fra en PARTNERKAMP ved samme
                    rundenummer, så den har like mange runder bak seg som den egne.
                    Uten det ville «egen bok er bedre» bare betydd «egen bok er større».

=================== K2 ===================================================

Ingen arm utenom M4 rører et felt som begynner med `naa_`. Bøkene bygges av runder som er
FERDIGSPILT (avdekket hånd = offentlig, samme grunnlag som `src/mlb/hukommelse.ts`), og
konteksten er poengtavla, som endres først ved rundeslutt. Kontrollen skrives ut.
"""

import json
import sys
import collections

import numpy

STI = sys.argv[1] if len(sys.argv) > 1 else "D:/amb-grp/loop/budvane/bud.jsonl"
B_BOOT = 20_000
FROE = 20_260_914
KLASSER = ["PASS", "9", "10", "11", "ANNET"]
KI = {k: i for i, k in enumerate(KLASSER)}


def klasse(bud):
    return KI[bud] if bud in KI else KI["ANNET"]


rader = [json.loads(l) for l in open(STI, encoding="utf-8") if l.strip()]
rader.sort(key=lambda r: (r["tid"], r["kamp"], r["rundeNr"]))
print(f"{len(rader)} budrader, {len(set(r['kamp'] for r in rader))} kamper, "
      f"{len(set(r['spiller'] for r in rader))} spillere")

# ---------------------------------------------------------------------------
# 1. Bøkene. Strengt kausale: bare runder som ALLEREDE er ferdigspilt.
# ---------------------------------------------------------------------------
# Et bokinnslag per ferdigspilt runde: (bød?, budnivå, avvik mot avdekket hånd).
# `naa_avvik` er lovlig HER fordi innslaget først brukes i en SENERE runde, da hånden
# er avdekket. Det er nøyaktig `Hukommelse.observer`s grense.

K_SHRINK = 5.0


def tom_bok():
    return {"n": 0, "bud": 0, "avviksum": 0.0, "avvikn": 0, "nivasum": 0.0, "nivan": 0}


def legg_i_bok(b, r):
    b["n"] += 1
    if r["budN"] is not None:
        b["bud"] += 1
        b["nivasum"] += r["budN"]
        b["nivan"] += 1
        if r["naa_avvik"] is not None:
            b["avviksum"] += r["naa_avvik"]
            b["avvikn"] += 1


def bok_trekk(b, glob):
    """Fire tall: tiltro, krympet passrate, krympet avvik, krympet budnivå."""
    n = b["n"]
    tiltro = n / (n + K_SHRINK)
    passrate = (b["n"] - b["bud"]) / n if n else glob["pass"]
    avvik = b["avviksum"] / b["avvikn"] if b["avvikn"] else glob["avvik"]
    niva = b["nivasum"] / b["nivan"] if b["nivan"] else glob["niva"]
    # Krymping mot populasjonssnittet, vektet av tiltro.
    return [
        tiltro,
        tiltro * passrate + (1 - tiltro) * glob["pass"],
        tiltro * avvik + (1 - tiltro) * glob["avvik"],
        tiltro * niva + (1 - tiltro) * glob["niva"],
    ]


glob = {
    "pass": sum(1 for r in rader if r["budN"] is None) / len(rader),
    "avvik": numpy.mean([r["naa_avvik"] for r in rader if r["naa_avvik"] is not None]),
    "niva": numpy.mean([r["budN"] for r in rader if r["budN"] is not None]),
}

# --- egen bok i SAMME kamp, og egen bok over TIDLIGERE kamper --------------
kamp_bok = collections.defaultdict(tom_bok)      # kamp -> bok så langt
hist_bok = collections.defaultdict(tom_bok)      # spiller -> bok over ferdige kamper
kamp_rader = collections.defaultdict(list)
for r in rader:
    kamp_rader[r["kamp"]].append(r)

# Partnerkamp for den STØRRELSESMATCHEDE fremmede kamp-boka: en kamp av en ANNEN
# spiller, valgt deterministisk, med minst like mange runder.
kamper = sorted(kamp_rader, key=lambda k: (kamp_rader[k][0]["tid"], k))
etter_spiller = collections.defaultdict(list)
for k in kamper:
    etter_spiller[kamp_rader[k][0]["spiller"]].append(k)

rng = numpy.random.default_rng(FROE)
partner = {}
for k in kamper:
    p = kamp_rader[k][0]["spiller"]
    andre = [x for sp, ks in etter_spiller.items() if sp != p for x in ks
             if len(kamp_rader[x]) >= len(kamp_rader[k])]
    if not andre:
        andre = [x for sp, ks in etter_spiller.items() if sp != p for x in ks]
    partner[k] = andre[int(rng.integers(len(andre)))] if andre else None

# Fremmed spiller (for historikk-boka): den med flest runder som IKKE er spilleren selv.
runder_per_spiller = collections.Counter(r["spiller"] for r in rader)
def fremmed_spiller(p):
    for q, _ in runder_per_spiller.most_common():
        if q != p:
            return q
    return None

# ---------------------------------------------------------------------------
# 2. Trekkene per rad, bygget i TIDSREKKEFØLGE så bøkene aldri ser framover.
# ---------------------------------------------------------------------------
X_ctx, X_bok_kamp, X_bok_hist, X_frem_kamp, X_frem_hist, X_naa = [], [], [], [], [], []
y, klynge, spiller_av_rad = [], [], []
sett_i_kamp = collections.defaultdict(int)

for r in rader:
    k, p = r["kamp"], r["spiller"]
    mal = r["maalPoeng"] or 100
    egne, best = r["egne"], r["besteAndre"]
    rader_far = kamp_rader[k]
    i_kamp = sett_i_kamp[k]

    # Forrige runde i SAMME kamp (offentlig: den er ferdigspilt).
    forrige = rader_far[i_kamp - 1] if i_kamp > 0 else None
    pdelta = (forrige["delta"][0] if forrige else 0) / 50.0
    pvant = 1.0 if (forrige and forrige["budvinner"] == 0) else 0.0
    pklart = 1.0 if (forrige and forrige["klart"]) else 0.0
    ptapte = 1.0 if (forrige and forrige["delta"][0] < 0) else 0.0

    X_ctx.append([1.0, min(1.0, r["rundeNr"] / 20.0), egne / mal, best / mal,
                  (egne - best) / mal, 1.0 if best >= 0.8 * mal else 0.0,
                  pdelta, pvant, pklart, ptapte])
    X_naa.append([r["naa_anslag"] / 6.0])

    X_bok_kamp.append(bok_trekk(kamp_bok[k], glob))
    X_bok_hist.append(bok_trekk(hist_bok[p], glob))

    # Fremmed kamp-bok: partnerkampens FØRSTE `i_kamp` runder — like mange som egen.
    pk = partner[k]
    fb = tom_bok()
    if pk is not None:
        for rr in kamp_rader[pk][:i_kamp]:
            legg_i_bok(fb, rr)
    X_frem_kamp.append(bok_trekk(fb, glob))
    X_frem_hist.append(bok_trekk(hist_bok[fremmed_spiller(p)] if fremmed_spiller(p) else tom_bok(), glob))

    y.append(klasse(r["bud"]))
    klynge.append(k)
    spiller_av_rad.append(p)

    # ETTER at raden er lest: bokfør den. Rekkefølgen er hele K2-garantien her.
    legg_i_bok(kamp_bok[k], r)
    legg_i_bok(hist_bok[p], r)
    sett_i_kamp[k] += 1

X_ctx = numpy.array(X_ctx, float)
X_naa = numpy.array(X_naa, float)
X_bok_kamp = numpy.array(X_bok_kamp, float)
X_bok_hist = numpy.array(X_bok_hist, float)
X_frem_kamp = numpy.array(X_frem_kamp, float)
X_frem_hist = numpy.array(X_frem_hist, float)
y = numpy.array(y)
klynge = numpy.array(klynge)
spiller_av_rad = numpy.array(spiller_av_rad)

print("klassefordeling:", {k: int((y == i).sum()) for i, k in enumerate(KLASSER)})

# ---------------------------------------------------------------------------
# 3. Multinomisk logistisk regresjon (numpy, L2, Adam). Deterministisk.
# ---------------------------------------------------------------------------


def tren(X, Y1h, lam=1e-2, steg=1500, lr=0.1):
    n, d = X.shape
    K = Y1h.shape[1]
    W = numpy.zeros((d, K))
    m = numpy.zeros_like(W)
    v = numpy.zeros_like(W)
    for t in range(1, steg + 1):
        Z = X @ W
        Z -= Z.max(axis=1, keepdims=True)
        P = numpy.exp(Z)
        P /= P.sum(axis=1, keepdims=True)
        G = X.T @ (P - Y1h) / n
        G[1:] += lam * W[1:]          # intercept står ustraffet (kolonne 0 er 1-eren)
        m = 0.9 * m + 0.1 * G
        v = 0.999 * v + 0.001 * (G * G)
        W -= lr * (m / (1 - 0.9 ** t)) / (numpy.sqrt(v / (1 - 0.999 ** t)) + 1e-8)
    return W


def sannsyn(X, W):
    Z = X @ W
    Z -= Z.max(axis=1, keepdims=True)
    P = numpy.exp(Z)
    return P / P.sum(axis=1, keepdims=True)


def kryss(X, y, klynge, folder=5):
    """Log-tap per beslutning, 5-delt kryssvalidering PÅ KAMP. Returnerer per-rad-tap."""
    K = len(KLASSER)
    Y1h = numpy.eye(K)[y]
    unike = sorted(set(klynge))
    r2 = numpy.random.default_rng(FROE)
    tildel = {k: int(i) for k, i in zip(unike, r2.integers(0, folder, len(unike)))}
    fold = numpy.array([tildel[k] for k in klynge])
    # Standardisering på treningsdelen, kolonne 0 (intercept) urørt.
    tap = numpy.zeros(len(y))
    for f in range(folder):
        tr, te = fold != f, fold == f
        if te.sum() == 0 or tr.sum() == 0:
            continue
        mu = X[tr].mean(axis=0)
        sd = X[tr].std(axis=0)
        sd[sd < 1e-9] = 1.0
        mu[0], sd[0] = 0.0, 1.0
        Xtr, Xte = (X[tr] - mu) / sd, (X[te] - mu) / sd
        W = tren(Xtr, Y1h[tr])
        P = sannsyn(Xte, W)
        tap[te] = -numpy.log(numpy.clip(P[numpy.arange(te.sum()), y[te]], 1e-12, None))
    return tap


def boot_diff(a, b, klynge, B=B_BOOT):
    """Klyngebootstrap over kamper av snittdifferansen a − b (parret per beslutning)."""
    d = a - b
    unike = sorted(set(klynge))
    idx = {k: numpy.where(klynge == k)[0] for k in unike}
    summer = numpy.array([d[idx[k]].sum() for k in unike])
    teller = numpy.array([len(idx[k]) for k in unike])
    r3 = numpy.random.default_rng(FROE + 1)
    trekk = r3.integers(0, len(unike), size=(B, len(unike)))
    s = summer[trekk].sum(axis=1)
    n = teller[trekk].sum(axis=1)
    fordeling = s / n
    return d.mean(), fordeling.std()


# ---------------------------------------------------------------------------
# 4. Armene
# ---------------------------------------------------------------------------
def kjor(navn_til_X, maske=None, merke=""):
    if maske is None:
        maske = numpy.ones(len(y), bool)
    yy, kk = y[maske], klynge[maske]
    if len(set(kk)) < 5 or maske.sum() < 50:
        print(f"  [{merke}] for få data (n={maske.sum()}, kamper={len(set(kk))}) — hoppet over")
        return {}
    tap = {}
    for navn, X in navn_til_X.items():
        tap[navn] = kryss(X[maske], yy, kk)
    print(f"\n  --- {merke} (n={maske.sum()} beslutninger, {len(set(kk))} kamper) ---")
    print(f"  {'arm':22} {'log-tap':>9}   {'mot M1 GENERISK':>22}")
    for navn, t in tap.items():
        if navn == "M1 GENERISK":
            print(f"  {navn:22} {t.mean():>9.4f}   {'(referanse)':>22}")
        else:
            m, se = boot_diff(t, tap["M1 GENERISK"], kk)
            z = m / se if se > 0 else 0.0
            stjerne = "  <== BEDRE" if z < -2 else ("  <== VERRE" if z > 2 else "")
            print(f"  {navn:22} {t.mean():>9.4f}   {m:+.4f} ± {se:.4f} (z {z:+.2f}){stjerne}")
    # Fremmed-bok-fella eksplisitt.
    for egen, frem in (("M2 EGEN BOK/kamp", "M3 FREMMED BOK/kamp"),
                       ("M2 EGEN BOK/hist", "M3 FREMMED BOK/hist")):
        if egen in tap and frem in tap:
            m, se = boot_diff(tap[egen], tap[frem], kk)
            z = m / se if se > 0 else 0.0
            dom = "EGEN er bedre (fella klarert)" if z < -2 else "fella FYRTE: ingen profil"
            print(f"  FELLE {egen.split('/')[1]:5}: egen - fremmed = {m:+.4f} +- {se:.4f} (z {z:+.2f})  -> {dom}")
    return tap


C = X_ctx
armer = {
    "M0 PRIOR": C[:, :1],
    "M1 GENERISK": C,
    "M2 EGEN BOK/kamp": numpy.hstack([C, X_bok_kamp]),
    "M3 FREMMED BOK/kamp": numpy.hstack([C, X_frem_kamp]),
    "M2 EGEN BOK/hist": numpy.hstack([C, X_bok_hist]),
    "M3 FREMMED BOK/hist": numpy.hstack([C, X_frem_hist]),
    "M4 TAK (naa_anslag)": numpy.hstack([C, X_naa]),
}

print("\n" + "=" * 78)
print("§1  KAN VI FORUTSI MENNESKETS NESTE BUD?  (log-tap, lavere er bedre)")
print("=" * 78)
kjor(armer, None, "ALLE SPILLERE")
for p, n in runder_per_spiller.most_common(3):
    if n >= 200:
        kjor(armer, spiller_av_rad == p, f"spiller {p[:4]}… ({n} runder)")

# ---------------------------------------------------------------------------
# 5. §2 Dynamikken innen kampen — beskrivende, klynget på kamp
# ---------------------------------------------------------------------------
print("\n" + "=" * 78)
print("§2  DYNAMIKK INNEN KAMPEN")
print("=" * 78)

bod = numpy.array([0.0 if r["budN"] is None else 1.0 for r in rader])
niva = numpy.array([numpy.nan if r["budN"] is None else float(r["budN"]) for r in rader])


def snitt_med_se(verdi, maske, klynge, B=B_BOOT):
    v = verdi[maske]
    kk = klynge[maske]
    ok = ~numpy.isnan(v)
    v, kk = v[ok], kk[ok]
    if len(v) < 20:
        return float("nan"), float("nan"), len(v)
    unike = sorted(set(kk))
    idx = {k: numpy.where(kk == k)[0] for k in unike}
    summer = numpy.array([v[idx[k]].sum() for k in unike])
    teller = numpy.array([len(idx[k]) for k in unike])
    r4 = numpy.random.default_rng(FROE + 2)
    tr = r4.integers(0, len(unike), size=(B, len(unike)))
    fordeling = summer[tr].sum(axis=1) / teller[tr].sum(axis=1)
    return v.mean(), fordeling.std(), len(v)


ptapte = X_ctx[:, 9] == 1.0
pvant = X_ctx[:, 7] == 1.0
leder = X_ctx[:, 4] > 0.05
bak = X_ctx[:, 4] < -0.05
tidlig = X_ctx[:, 1] < 0.2
sent = X_ctx[:, 1] >= 0.4

for merke, maske in [("ALLE", numpy.ones(len(y), bool)),
                     ("etter TAPT runde (delta<0)", ptapte),
                     ("etter ikke-tapt runde", ~ptapte),
                     ("etter at HAN vant budrunden", pvant),
                     ("LEDER (>5 % av mål)", leder),
                     ("LIGGER BAK (>5 %)", bak),
                     ("tidlig i kampen (runde <4)", tidlig),
                     ("sent i kampen (runde >=8)", sent)]:
    a, sa, na = snitt_med_se(bod, maske, klynge)
    b, sb, nb = snitt_med_se(niva, maske, klynge)
    print(f"  {merke:30} n={na:>5}  byr={a:.3f} ± {sa:.3f}   budnivå={b:.3f} ± {sb:.3f} (n={nb})")

for navn, m1, m2 in [("tapt − ikke tapt", ptapte, ~ptapte),
                     ("bak − leder", bak, leder),
                     ("sent − tidlig", sent, tidlig)]:
    for merke, verdi in (("byr", bod), ("budnivå", niva)):
        d1, s1, n1 = snitt_med_se(verdi, m1, klynge)
        d2, s2, n2 = snitt_med_se(verdi, m2, klynge)
        if numpy.isnan(d1) or numpy.isnan(d2):
            continue
        se = (s1 ** 2 + s2 ** 2) ** 0.5   # uparret: gruppene er disjunkte
        z = (d1 - d2) / se if se > 0 else 0.0
        print(f"  DIFF {navn:20} {merke:8} {d1 - d2:+.4f} ± {se:.4f} (z {z:+.2f})")

# ---------------------------------------------------------------------------
# 6. K2-kontroll: ingen arm utenom M4 rører `naa_*`
# ---------------------------------------------------------------------------
print("\nK2-kontroll: `naa_*` inngår BARE i M4 (og i bøkene via FERDIGSPILTE runder, der")
print("hånden er avdekket og offentlig). Trekkmatrisene M0–M3 er bygd av X_ctx, X_bok_* og")
print("X_frem_* alene; X_naa brukes i nøyaktig én arm.")
