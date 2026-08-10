#!/usr/bin/env python3
"""
MLB fase 0.5 — EN GRADIENTRUNDE. Tre hoder, og bare ETT av dem er selvtrent.

    ~/Arvind-Lora/.venv/bin/python verktoy/mlb-gradient.py \
        --inn "mlb-epoke-data/erf-s*.bin" \
        --vekter e1-modell/mlb-arbeid.bin \
        --ut e1-modell/mlb-kandidat.bin \
        --epoke 3 --logg analyse/mlb-gradient.jsonl

============================ SIGNALENE ==================================

  tro      kryssentropi mot `troFasit` — hvor kortene FAKTISK laa. Perfekt
           etikett, ingen sirkularitet.
  verdi    MSE mot RESTEN AV KAMPEN (`sluttpoeng[sete] - poengFoer`). Perfekt
           etikett. Se `examples/mlb-erfaring.ts` om hvorfor det er resten og
           ikke sluttpoengene selv.
  policy   FORDELEN: `A = r + V(s') - V(s)`, regnet i TS-siden. Dette er det
           ENESTE selvtrente leddet, og det er hele poenget med MLB.
           `docs/sandkassen.md` §6: «Flytt policyen mot handlinger som ga MER
           enn ventet.»

Verdi og tro er hjelpeoppgaver som former stammen. Ingen mester, ingen orakel,
ingen dobbeltdummy, ingen ekspertimitasjon — etikettene er utfallet og fortiden.

============================ MASKEN MAA INN I TAPET =====================

Policyen er `log_softmax` over de LOVLIGE plassene alene. De stengte plassene
fylles med -1e30 FOER softmax, og da er gradienten mot dem eksakt null:
d(log p_a)/d(logit_j) = -softmax_j = 0. Uten dette lærer nettet aa fordele
sannsynlighet paa trekk det aldri kan ta — masken redder lovligheten i
`velgKode`, men den lekkede sannsynligheten stjeler fra de trekkene som FINNES.

Rader med bare EN lovlig plass baerer per definisjon ingen policygradient
(log p = 0 identisk). De holdes utenfor policysnittet, ellers ville de bare
utvannet det.

============================ FORMEN ER IKKE GJENTATT HER ================

`Sandkassenett`, `skriv_vekter` og `les_vekter` importeres fra
`verktoy/mlb-tren.py`. To definisjoner av det samme nettet er feilklassen §122
punkt 6 kaller «stillaset ble en andre sannhet», og den farligste varianten er
at begge ville kjoert.

============================ ADAMS MOMENTER OVERLEVER EPOKEN ============

Hver epoke er en ny prosess. Uten `--opt-tilstand` ville Adam startet fra null
hver gang, og med ETT gjennomloep per epoke rekker momentene aldri aa varme
opp — da er ti epoker ti foerste steg, ikke ti steg.
"""

import argparse
import glob
import importlib.util
import json
import os
import struct
import time

import numpy
import torch
import torch.nn.functional as F

HER = os.path.dirname(os.path.abspath(__file__))


def _last_mlb_tren():
    """Henter nettformen fra `mlb-tren.py`. Bindestreken hindrer vanlig import."""
    sti = os.path.join(HER, "mlb-tren.py")
    spec = importlib.util.spec_from_file_location("mlb_tren", sti)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


MLBT = _last_mlb_tren()
Sandkassenett = MLBT.Sandkassenett
skriv_vekter = MLBT.skriv_vekter
les_vekter = MLBT.les_vekter
VERDI_SKALA = MLBT.VERDI_SKALA
KORT = MLBT.KORT
KLASSER = MLBT.KLASSER


def post_dtype(dim, mdim):
    """En rad slik `examples/mlb-erfaring.ts` skriver den. Pakket, ikke justert."""
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


def les_erfaring(monster, maks=None):
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen erfaringsfiler for «{monster}»")
    deler = []
    dim = mdim = None
    n = 0
    for sti in filer:
        with open(sti, "rb") as fh:
            magi = fh.read(4)
            if magi != b"MLBE":
                raise SystemExit(f"{sti}: ikke en MLBE-fil (fikk {magi!r})")
            (versjon,) = struct.unpack("<i", fh.read(4))
            (d,) = struct.unpack("<i", fh.read(4))
            (md,) = struct.unpack("<i", fh.read(4))
            (post,) = struct.unpack("<i", fh.read(4))
            if versjon != 1:
                raise SystemExit(f"{sti}: ukjent versjon {versjon}")
            # BREDDEN MAA VAERE EN. Blandes to bredder, hoppes halve korpuset
            # over i stillhet - samme felle som i sd-tren og mlb-tren.
            if dim is None:
                dim, mdim = d, md
            elif (d, md) != (dim, mdim):
                raise SystemExit(f"{sti}: {d}x{md}, ventet {dim}x{mdim}")
            dt = post_dtype(d, md)
            # RADSTOERRELSEN FRA HODET MOT VAAR EGEN dtype. Er de uenige, leser
            # `fromfile` forskjoevet og gir et korpus som SER ut som tall.
            if dt.itemsize != post:
                raise SystemExit(
                    f"{sti}: skriveren sier {post} byte per rad, leseren regner {dt.itemsize}. "
                    f"Et felt er lagt til paa den ene siden."
                )
            a = numpy.fromfile(fh, dtype=dt)
        if maks is not None and n + len(a) > maks:
            a = a[: max(0, maks - n)]
        deler.append(a)
        n += len(a)
        print(f"  {sti}: {len(a)} rader", flush=True)
        if maks is not None and n >= maks:
            break
    return numpy.concatenate(deler), dim, mdim


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inn", default="mlb-epoke-data/erf-s*.bin")
    ap.add_argument("--vekter", required=True, help="vektene gradienten tas FRA")
    ap.add_argument("--ut", required=True, help="kandidatvektene")
    ap.add_argument("--skjult", default="1024,768,512")
    ap.add_argument("--pass", dest="gjennomlop", type=int, default=1)
    ap.add_argument("--batch", type=int, default=1024)
    # LR: 3e-4 sprengte policyen paa FOERSTE steg (loep 1). Med PPO-klippet og
    # KL-bremsen er 1e-4 trygt, og bremsen sier fra om det ikke er det.
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--eps", type=float, default=0.2, help="PPO-klippet")
    ap.add_argument("--kl-maal", type=float, default=0.03, help="0 = ingen brems")
    ap.add_argument("--vekt-policy", type=float, default=1.0)
    ap.add_argument("--vekt-verdi", type=float, default=1.0)
    ap.add_argument("--vekt-tro", type=float, default=1.0)
    ap.add_argument("--entropi", type=float, default=0.01)
    ap.add_argument("--klipp-a", type=float, default=5.0, help="|A| etter standardisering")
    ap.add_argument("--klipp-grad", type=float, default=1.0)
    ap.add_argument("--maks-rader", type=int, default=0, help="0 = alt")
    ap.add_argument("--froe", type=int, default=20260809)
    ap.add_argument("--epoke", type=int, default=0)
    ap.add_argument("--opt-tilstand", default="e1-modell/mlb-adam.pt")
    ap.add_argument("--logg", default="analyse/mlb-gradient.jsonl")
    ap.add_argument("--rapport", default="analyse/mlb-gradient.txt")
    ap.add_argument("--kl-rader", type=int, default=8192)
    ap.add_argument("--maks-logit", type=float, default=1e4)
    args = ap.parse_args()

    t0 = time.time()
    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    skjult = [int(x) for x in args.skjult.split(",")]

    print("ERFARING:", flush=True)
    rad, dim, mdim = les_erfaring(args.inn, maks=(args.maks_rader or None))
    n = len(rad)
    if n == 0:
        raise SystemExit("Ingen rader — epoken har ingen gradient aa ta")

    # ------------------------------------------------------------------ til GPU
    X = torch.from_numpy(numpy.ascontiguousarray(rad["t"])).to(enhet)
    M = torch.from_numpy(numpy.ascontiguousarray(rad["m"])).to(enhet).bool()
    Fa = torch.from_numpy(numpy.ascontiguousarray(rad["f"])).to(enhet).long()
    KODE = torch.from_numpy(numpy.ascontiguousarray(rad["kode"])).to(enhet).long()
    LOV = torch.from_numpy(numpy.ascontiguousarray(rad["lovlige"])).to(enhet).long()
    G = torch.from_numpy(numpy.ascontiguousarray(rad["G"])).to(enhet).float()
    A = torch.from_numpy(numpy.ascontiguousarray(rad["A"])).to(enhet).float()
    del rad

    # FORDELEN STANDARDISERES OVER HELE EPOKEN, ikke per batch.
    # Per batch ville skalaen svingt med utvalget, og et lite batch med lav
    # spredning hadde faatt et kunstig stort steg. Snittet trekkes fra fordi
    # policygradienten er invariant under et konstant skift i A - det er
    # nettopp det verdihodet som grunnlinje handler om.
    a_snitt = float(A.mean())
    a_std = float(A.std(unbiased=False))
    An = ((A - a_snitt) / max(a_std, 1e-6)).clamp(-args.klipp_a, args.klipp_a)

    MED_VALG = LOV > 1
    andel_valg = float(MED_VALG.float().mean())

    # VERDISKALAEN MAA MAALES, IKKE ANTAS.
    #
    # `mlb-tren.py` bruker 10,0, fordi der var etiketten RUNDENS poeng. Her er
    # den RESTEN AV KAMPEN, og med en tilfeldig policy er den brutal: amerikaner
    # og solo ligger i masken, en utrent policy tar dem, og de koster
    # maalPoeng/2 og maalPoeng hver gang de ryker. Foerste maaling ga snitt
    # -115 og spredning 107 poeng.
    #
    # Med en fast skala paa 10 blir verditapet (107/10)^2 = 114 mot tro-CE ~1,4
    # — aatti ganger stoerre — og de to andre hodene ville faatt gradienten sin
    # spist av det ene. Skalaen settes derfor av dataene, og UTGANGEN er
    # fortsatt poeng: dette er en vekt i tapet, ikke en enhet paa V.
    g_std = float(G.std(unbiased=False))
    verdi_skala = max(VERDI_SKALA, g_std)

    modell = Sandkassenett(dim, skjult).to(enhet)
    les_vekter(args.vekter, modell)
    par = sum(p.numel() for p in modell.parameters())
    opt = torch.optim.AdamW(modell.parameters(), lr=args.lr)
    lastet_opt = False
    if args.opt_tilstand and os.path.exists(args.opt_tilstand):
        try:
            opt.load_state_dict(torch.load(args.opt_tilstand, map_location=enhet))
            lastet_opt = True
        except Exception as e:  # en oedelagt tilstandsfil skal ikke drepe epoken
            print(f"ADVARSEL: kunne ikke lese {args.opt_tilstand}: {e}", flush=True)

    print(
        f"{n} rader, {dim} trekk, {mdim} plasser, {par} parametre, enhet {enhet}, "
        f"Adam {'lastet' if lastet_opt else 'fersk'} ({time.time() - t0:.0f}s)",
        flush=True,
    )

    def maskerte_logits(p, m):
        return p.masked_fill(~m, -1e30)

    @torch.no_grad()
    def maal(idx):
        """Tap per hode og diagnostikk paa de samme radene, uten gradient."""
        modell.eval()
        s = {k: 0.0 for k in ("pol", "ent", "tro", "verdi", "treff", "kvad", "kvadG")}
        nt = np_ = nv = 0
        lp_alle = []
        for i in range(0, len(idx), args.batch):
            j = idx[i : i + args.batch]
            p, v, t = modell(X[j].float())
            lg = F.log_softmax(maskerte_logits(p, M[j]), dim=1)
            lp_alle.append(lg)
            valg = MED_VALG[j]
            if valg.any():
                lpa = lg.gather(1, KODE[j].unsqueeze(1)).squeeze(1)
                s["pol"] += float((-An[j] * lpa)[valg].sum())
                pr = lg.exp()
                ent = -(pr * lg.masked_fill(~M[j], 0.0)).sum(1)
                s["ent"] += float(ent[valg].sum())
                np_ += int(valg.sum())
            s["kvad"] += float(((v - G[j]) ** 2).sum())
            s["kvadG"] += float((G[j] ** 2).sum())
            nv += len(j)
            mal = Fa[j]
            mk = mal > 0
            if mk.any():
                m3 = (mal - 1).clamp(min=0)
                s["tro"] += float(F.cross_entropy(t[mk], m3[mk], reduction="sum"))
                s["treff"] += float(((t.argmax(dim=2) == m3) & mk).sum())
                nt += int(mk.sum())
        modell.train()
        g_snitt = float(G[idx].mean())
        var_g = s["kvadG"] / max(1, nv) - g_snitt**2
        return {
            "pol": s["pol"] / max(1, np_),
            "ent": s["ent"] / max(1, np_),
            "tro": s["tro"] / max(1, nt),
            "treff": s["treff"] / max(1, nt),
            "rmse": (s["kvad"] / max(1, nv)) ** 0.5,
            "forklart": 1.0 - (s["kvad"] / max(1, nv)) / max(var_g, 1e-9),
        }, torch.cat(lp_alle)

    g = torch.Generator(device="cpu").manual_seed(args.froe + args.epoke)
    # KL-RADENE ER FASTE, og de trekkes FOER foerste steg: uten dem er det
    # ingen maate aa se at et steg SPRENGTE policyen paa - bare at tapet falt.
    kl_idx = torch.randperm(n, generator=g)[: min(args.kl_rader, n)].to(enhet)
    foer, lp_foer = maal(kl_idx)

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(
        json.dumps(
            {
                "epoke": args.epoke,
                "start": time.strftime("%Y-%m-%d %H:%M"),
                "rader": n,
                "andel_med_valg": round(andel_valg, 4),
                "a_snitt": round(a_snitt, 4),
                "a_std": round(a_std, 4),
                "g_snitt": round(float(G.mean()), 3),
                "g_std": round(g_std, 3),
                "verdi_skala": round(verdi_skala, 3),
                "foer": {k: round(v, 5) for k, v in foer.items()},
            }
        )
        + "\n"
    )

    # ===================== ATFERDSPOLICYENS log p, MAALT FOER FOERSTE STEG ===
    #
    # ================ DET SOM VAR GALT, OG DET DREPTE HELE FOERSTE LOEPET ===
    #
    # `-A * log p` er UBUNDET nedover. For A > 0 lever tapet paa aa presse
    # log p mot 0, for A < 0 paa aa presse det mot -uendelig, og ingenting
    # stopper det. `clip_grad_norm_` hjelper ikke: Adam normaliserer bort
    # gradientens STOERRELSE, saa steget per parameter er ~lr uansett hvor
    # liten normen er. Med 286 batcher per epoke og lr 3e-4 flytter en «epoke»
    # hver vekt ~0,086 - det DOBBELTE av He-skalaen sqrt(2/1032) = 0,044.
    #
    # Maalt i loep 1 (arkivert i `analyse/mlb-gradient-loep1.txt`): FOERSTE
    # gradientsteg tok entropien fra 1,4035 til 0,0013 nat og KL til 5 299.
    # Etter seks epoker var policylogitene +-4,7 millioner, entropien eksakt
    # 0, og alle ti epokene maalte en saturert konstant. Porten ADOPTERTE den
    # to ganger, fordi «spill alltid laveste lovlige kode» aldri byr
    # amerikaner og derfor scorer bra mot vanene.
    #
    # ================ RETTELSEN: ET BUNDET MAAL, OG EN NOEDBREMS ============
    #
    # PPO-klippet forhold. `lp_gammel` er log p under vektene som FAKTISK
    # spilte kampene - de samme vektene vi starter fra, saa de kan maales her
    # i stedet for aa baeres gjennom filformatet:
    #
    #     forhold = exp(log p_ny - log p_gammel)
    #     maal    = min(forhold * A, klipp(forhold, 1+-eps) * A)
    #
    # Naar policyen har flyttet seg mer enn eps i en retning som hjelper, er
    # gradienten NULL. Maalet kan ikke lenger betale for aa flykte.
    #
    # I tillegg stopper gjennomloepet naar KL mot atferdspolicyen passerer
    # `--kl-maal`. Det er den samme grensen sett fra utsiden, og den fanger
    # ogsaa en eksplosjon som klippet ikke rakk aa stoppe.
    with torch.no_grad():
        lp_gammel = torch.empty(n, device=enhet)
        for i in range(0, n, args.batch):
            sl = slice(i, min(i + args.batch, n))
            p0, _, _ = modell(X[sl].float())
            lg0 = F.log_softmax(maskerte_logits(p0, M[sl]), dim=1)
            lp_gammel[sl] = lg0.gather(1, KODE[sl].unsqueeze(1)).squeeze(1)

    stoppet_paa_kl = -1
    modell.train()
    for runde in range(args.gjennomlop):
        perm = torch.randperm(n, generator=g).to(enhet)
        for i in range(0, n, args.batch):
            j = perm[i : i + args.batch]
            p, v, t = modell(X[j].float())

            lg = F.log_softmax(maskerte_logits(p, M[j]), dim=1)
            valg = MED_VALG[j]
            if valg.any():
                lpa = lg.gather(1, KODE[j].unsqueeze(1)).squeeze(1)
                forhold = (lpa - lp_gammel[j]).clamp(max=20.0).exp()
                a = An[j]
                tap_pol = -torch.min(
                    forhold * a, forhold.clamp(1 - args.eps, 1 + args.eps) * a
                )[valg].mean()
                pr = lg.exp()
                ent = -(pr * lg.masked_fill(~M[j], 0.0)).sum(1)[valg].mean()
            else:
                tap_pol = torch.zeros((), device=enhet)
                ent = torch.zeros((), device=enhet)

            tap_verdi = F.mse_loss(v / verdi_skala, G[j] / verdi_skala)

            mal = Fa[j]
            mk = mal > 0
            if mk.any():
                m3 = (mal - 1).clamp(min=0)
                tap_tro = F.cross_entropy(t[mk], m3[mk], reduction="mean")
            else:
                tap_tro = torch.zeros((), device=enhet)

            tap = (
                args.vekt_policy * tap_pol
                - args.entropi * ent
                + args.vekt_verdi * tap_verdi
                + args.vekt_tro * tap_tro
            )
            opt.zero_grad(set_to_none=True)
            tap.backward()
            torch.nn.utils.clip_grad_norm_(modell.parameters(), args.klipp_grad)
            opt.step()

            # NOEDBREMSEN. Maales sjelden nok til aa vaere gratis, ofte nok til
            # aa ta en eksplosjon FOER epoken er over.
            if args.kl_maal > 0 and (i // args.batch) % 16 == 15:
                with torch.no_grad():
                    _, lp_na = maal(kl_idx)
                    pg0 = lp_foer.exp()
                    kl_na = float(
                        (pg0 * (lp_foer - lp_na)).masked_fill(~M[kl_idx], 0.0).sum(1).mean()
                    )
                if kl_na > args.kl_maal:
                    stoppet_paa_kl = i // args.batch
                    break
        if stoppet_paa_kl >= 0:
            break

    etter, lp_etter = maal(kl_idx)
    # KL(gammel || ny) paa de faste radene. Et steg som sprenger policyen viser
    # seg HER, ikke i tapet: tapet kan falle fordi fordelingen kollapset.
    with torch.no_grad():
        pg = lp_foer.exp()
        kl = float((pg * (lp_foer - lp_etter)).masked_fill(~M[kl_idx], 0.0).sum(1).mean())

    # ================= VEKTENE MAA VAERE ENDELIGE, OG LOGITENE SMAA =========
    #
    # Loep 1 skrev vekter som ga policylogits paa +-4,7 millioner, og ingenting
    # sa fra. Et nett med saturerte logits ER en konstant funksjon: entropien
    # er null, `velgKode` gir alltid samme kode, og porten kan ikke se
    # forskjell paa «laert» og «doed». Her maales det, og det stopper epoken.
    with torch.no_grad():
        ikke_endelige = sum(int((~torch.isfinite(q)).sum()) for q in modell.parameters())
        pk, _, _ = modell(X[: min(4096, n)].float())
        logitskala = float(pk.abs().max())
    if ikke_endelige > 0:
        raise SystemExit(
            f"{ikke_endelige} ikke-endelige vekter etter steget - epoken skrives IKKE. "
            f"Senk --lr eller --kl-maal."
        )
    if logitskala > args.maks_logit:
        raise SystemExit(
            f"policylogitene naadde {logitskala:.3e} (tak {args.maks_logit:.0f}). Det er en "
            f"saturert konstant, ikke en policy - epoken skrives IKKE. Senk --lr."
        )

    skriv_vekter(args.ut, modell)
    if args.opt_tilstand:
        os.makedirs(os.path.dirname(args.opt_tilstand) or ".", exist_ok=True)
        torch.save(opt.state_dict(), args.opt_tilstand)

    rad_ut = {
        "epoke": args.epoke,
        "sek": round(time.time() - t0, 1),
        "kl": round(kl, 6),
        "logitskala": round(logitskala, 2),
        "stoppet_paa_kl": stoppet_paa_kl,
        "etter": {k: round(v, 5) for k, v in etter.items()},
        "d_pol": round(etter["pol"] - foer["pol"], 5),
        "d_tro": round(etter["tro"] - foer["tro"], 5),
        "d_rmse": round(etter["rmse"] - foer["rmse"], 5),
        "d_ent": round(etter["ent"] - foer["ent"], 5),
        "ut": args.ut,
    }
    logg.write(json.dumps(rad_ut) + "\n")
    logg.close()

    os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
    with open(args.rapport, "a", encoding="utf-8") as f:
        f.write(
            f"epoke {args.epoke}: n={n} A={a_snitt:+.3f}+-{a_std:.3f} "
            f"G={float(G.mean()):+.1f}+-{g_std:.1f} "
            f"| policy {foer['pol']:.4f} -> {etter['pol']:.4f} "
            f"| entropi {foer['ent']:.4f} -> {etter['ent']:.4f} "
            f"| tro {foer['tro']:.4f} -> {etter['tro']:.4f} "
            f"(treff {etter['treff'] * 100:.1f} %) "
            f"| verdi-RMSE {foer['rmse']:.3f} -> {etter['rmse']:.3f} "
            f"(forklart {etter['forklart']:+.4f}) | KL={kl:.5f} "
            f"| {time.time() - t0:.0f}s\n"
        )
    print(json.dumps(rad_ut), flush=True)


if __name__ == "__main__":
    main()
