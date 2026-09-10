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
STIKK_UT = MLBT.STIKK_UT
KVANTIL_UT = MLBT.KVANTIL_UT


def post_dtype(dim, mdim, versjon):
    """En rad slik `examples/mlb-erfaring.ts` skriver den. Pakket, ikke justert.

    VERSJON 2 (§125) la til tre felt bakerst:

        Gr     f32   det som gjenstaar av DENNE runden
        Gh     f32   den ALLEREDE DISKONTERTE halen. `Gr + Gh == G` eksakt
        kamp   i32   kampens froe - saa holdout kan splittes paa KAMP og ikke
                     paa RAD. §124: forklart varians ble lest i utvalget den
                     nettopp trente paa, +0,1286 mot +0,0751 paa holdout, og ti
                     epoker ble lest med det optimistiske tallet.

    Versjon 1 leses fortsatt, men da finnes ikke de tre feltene, og verken det
    delte verdimaalet eller kamp-holdouten kan regnes. Det sies HOEYT i stedet
    for aa bli en stille nedgradering.
    """
    felt = [
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
    if versjon >= 2:
        felt += [("Gr", "<f4"), ("Gh", "<f4"), ("kamp", "<i4")]
    if versjon >= 3:
        # STIKKETIKETTEN (§127): hvor mange stikk setets LAG tar i RESTEN av
        # runden. -1 = UKJENT (runden ble aldri ferdigspilt), og den skal
        # maskeres bort - ikke leses som «null stikk».
        felt += [("stikk", "<i2")]
    return numpy.dtype(felt)


def les_erfaring(monster, maks=None):
    filer = []
    for m in monster.split(","):
        filer += sorted(glob.glob(m))
    if not filer:
        raise SystemExit(f"Fant ingen erfaringsfiler for «{monster}»")
    deler = []
    dim = mdim = versjon0 = None
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
            if versjon not in (1, 2, 3):
                raise SystemExit(f"{sti}: ukjent versjon {versjon}")
            # BREDDEN MAA VAERE EN. Blandes to bredder, hoppes halve korpuset
            # over i stillhet - samme felle som i sd-tren og mlb-tren.
            #
            # OG VERSJONEN MAA VAERE EN. To epokers filer med hver sin versjon
            # ville gitt to ulike dtype-er over samme `concatenate`, og numpy
            # hadde da laget et objektarray i stedet for aa si fra.
            if dim is None:
                dim, mdim, versjon0 = d, md, versjon
            elif (d, md, versjon) != (dim, mdim, versjon0):
                raise SystemExit(
                    f"{sti}: {d}x{md} v{versjon}, ventet {dim}x{mdim} v{versjon0}"
                )
            dt = post_dtype(d, md, versjon)
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
    return numpy.concatenate(deler), dim, mdim, versjon0


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
    ap.add_argument("--lr-verdi", type=float, default=0.0, help="0 = samme som --lr")
    ap.add_argument("--eps", type=float, default=0.2, help="PPO-klippet")
    ap.add_argument("--kl-maal", type=float, default=0.03, help="0 = ingen brems")
    ap.add_argument("--vekt-policy", type=float, default=1.0)
    ap.add_argument("--vekt-verdi", type=float, default=1.0)
    ap.add_argument("--vekt-tro", type=float, default=1.0)
    ap.add_argument("--entropi", type=float, default=0.01)
    # =============== ENTROPIEN MAA REGNES PER FASE (§126) ================
    #
    # ============ DET SOM VAR GALT, OG DET KOSTET HELE POLICYEN =========
    #
    # `--entropi` fantes fra §123, den var ALDRI null, og loggen viste at den
    # virket: snittentropien steg 0,5983 -> 0,8561 over fjorten epoker i v125.
    # Den var likevel maalt paa feil ting. Snittet tas over ALLE rader med mer
    # enn en lovlig plass, og radene fordeler seg slik:
    #
    #     SPILL_KORT     7 605 av 9 775   (77,8 %)
    #     BUD              868            ( 8,9 %)
    #     VRAK_KORT        868            ( 8,9 %)
    #     VELG_ETTERLYST   217            ( 2,2 %)
    #     VELG_TRUMF       217            ( 2,2 %)   EN rad per runde
    #
    # Ett snitt over de fem er 78 % kortspill. Entropien i kortspillet steg,
    # snittet steg med den, og de to fasene med faerrest rader kollapset
    # samtidig UNDER det stigende snittet. Maalt paa v125 etter fjorten epoker
    # med `--entropi 0.01` slaatt paa hele veien:
    #
    #     VELG_TRUMF   2 av 4 koder, ruter 97,7 %, 0,157 bit
    #     BUD          2 av 12 koder, pass 75 % / bud:6 25 %
    #
    # En bonus som maales paa gjennomsnittet av fem faser beskytter den fasen
    # som har flest rader. Det er nøyaktig den fasen som ikke trengte den.
    #
    # ============ RETTELSEN: ETT LEDD PER FASE, MED SIN EGEN VEKT =======
    #
    # `--entropi-fase "b,v,t,e,s"` gir fem koeffisienter, en per fase, hver paa
    # fasens EGET snitt. Da er vekten paa VELG_TRUMF uavhengig av hvor mange
    # kortvalg som ligger rundt den. Tom streng = §125s oppfoersel, saa en
    # kjoering uten flagget er bit-identisk med foer.
    #
    # Fasene finnes ikke i filformatet med den oppdelingen vi trenger: `fase`
    # er 0 bud, 1 vrak, 2 velg, 3 spill, og VELG lumper trumfvalget sammen med
    # etterlysningen. De skilles derfor paa MASKEN — er en trumfkode lovlig, er
    # raden et trumfvalg. Det er utledet av data og ikke av et nytt felt, saa
    # gamle erfaringsfiler leses uendret.
    ap.add_argument(
        "--entropi-fase",
        default="",
        help="fem koeffisienter «bud,vrak,trumf,etterlys,spill» paa hver fases EGET "
        "entropisnitt. Tom = ett snitt over alle rader (§125).",
    )
    # ENTROPIGULV PER FASE, som andel av ln(antall lovlige) i raden.
    #
    # Et lineaert ledd er ubundet: er koeffisienten stor nok til aa loefte en
    # kollapset fase, presser den ogsaa en fase som alt er sunn mot uniform.
    # Med et gulv er leddet en hengsel — `relu(gulv - H/ln L)` — og det slutter
    # aa dytte i det oeyeblikket fasen er over gulvet. Da kan koeffisienten
    # settes hoeyt nok til aa virke uten aa vaere en pris resten av loepet.
    # 0 per fase = rent lineaert ledd for den fasen.
    ap.add_argument(
        "--entropi-gulv",
        default="",
        help="fem gulv «bud,vrak,trumf,etterlys,spill» paa NORMALISERT entropi "
        "(H / ln L). 0 = ingen hengsel for den fasen.",
    )
    ap.add_argument("--klipp-a", type=float, default=5.0, help="|A| etter standardisering")
    ap.add_argument("--klipp-grad", type=float, default=1.0)
    ap.add_argument("--maks-rader", type=int, default=0, help="0 = alt")
    ap.add_argument("--froe", type=int, default=20260809)
    ap.add_argument("--epoke", type=int, default=0)
    ap.add_argument("--opt-tilstand", default="e1-modell/mlb-adam.pt")
    ap.add_argument("--logg", default="analyse/mlb-gradient.jsonl")
    ap.add_argument("--rapport", default="analyse/mlb-gradient.txt")
    ap.add_argument("--kl-rader", type=int, default=8192)
    # NULLSTILLER VERDIHODET: W = 0, b = snittet av maalet.
    #
    # ============ DET SOM VAR GALT, OG DET KOSTET EN EPOKE ==============
    #
    # Da gamma (§124) endret verdimaalet fra snitt -50 / sd 63 til -13 / sd 15,
    # matte hodet korrigere en RMSE paa 87 ned til 13. Foerste forsoek var en
    # VARMEEPOKE med `--vekt-policy 0 --entropi 0`: la verdi og tro trene, la
    # policyen staa. Den gjorde det motsatte av aa beskytte policyen.
    #
    # STAMMEN ER DELT. Verdihodets korreksjon gikk rett gjennom den, og
    # policyen fulgte med: entropien STEG 1,3508 -> 1,4149, KL naadde 0,187
    # (seks ganger bremsen), grovbudandelen gikk fra 0,00 % til 10,75 %, og
    # styrken fra +16 til -760 poeng. Porten avviste den, men arbeidsvektene
    # flyttes uansett — en epoke tapt.
    #
    # Med W = 0 er `d(tap_verdi)/d(stamme)` EKSAKT null ved foerste steg: hodet
    # maa laere sine egne vekter foer det kan dytte stammen i det hele tatt.
    # Skalaskiftet blir da hodets problem og ikke policyens.
    ap.add_argument("--nullstill-verdi", action="store_true")
    ap.add_argument("--maks-logit", type=float, default=1e4)
    # ============ HVA BREMSEN SKAL GJOERE NAAR DEN FYRER (§125) ==========
    #
    # `stopp` er §124s oppfoersel: hele gjennomloepet avsluttes. Maalt over sju
    # epoker fyrte bremsen i HVER epoke etter 4-16 batcher av 76-228 - sju
    # epoker ga rundt FOERTI gradientsteg til sammen, og verdihodet, som var
    # hele poenget med gamma, forklarte aldri noe.
    #
    # `frys` er rettelsen: naar KL passerer maalet, fryses STAMMEN og
    # POLICYHODET, og resten av gjennomloepet trener bare verdi- og trohodet.
    # De to har perfekte, faste etiketter og ingen grunn til aa stoppe.
    #
    # Hvorfor STAMMEN og ikke bare policyhodet: §124 FUNN 5. Stammen er DELT, og
    # et forsoek med `--vekt-policy 0` lot verdihodets skalakorreksjon gaa rett
    # gjennom den - entropien STEG, KL naadde 0,187, og styrken falt fra +16 til
    # -760 poeng. Aa slaa av policytapet beskytter ingenting saa lenge stammen
    # kan flytte seg. Med stammen frosset er policyen en KONSTANT funksjon, og
    # det er ikke et loefte: `kl_drift` under maaler det, og en drift over
    # 1e-6 stopper epoken.
    ap.add_argument("--kl-handling", choices=("frys", "stopp"), default="frys")
    # TAKET FOR TRINN 2. 0 = to ganger `--kl-maal`. Mellom maalet og taket
    # trener stammen videre paa verdi og tro, og policyen driver med den.
    # §124s ubundne drift naadde 0,187; dette er den samme mekanismen med et tak.
    ap.add_argument("--kl-tak", type=float, default=0.0)
    # HVOR OFTE KL MAALES. §124 satte den fra 16 til 4 fordi «en brems som foerst
    # maaler etter at skaden har skjedd er en logg, ikke en brems». Den var
    # fortsatt for grov: paa 86 k rader naadde KL **0,45** ved foerste maaling
    # etter fire batcher - femten ganger maalet. Standarden er derfor 1.
    ap.add_argument("--kl-intervall", type=int, default=1)
    # ============ IMITASJON AV ADAMS (Arvind 10. september) ================
    #
    # MLB startes fra Adams-v5 i stedet for fra egen plateau: policyleddet blir
    # kryssentropi mot KODEN laereren valgte (`examples/mlb-spill.ts --laerer
    # adams`), ikke PPO mot en fordel. Verdi, tro, stikk og kvantiler trenes paa
    # sine egne, perfekte etiketter som foer. KL-bremsen og entropien skal staa
    # AV i en slik kjoering (`--kl-maal 0 --entropi 0`, ingen `--entropi-fase`):
    # meningen er aa flytte policyen HELT til laereren, og en brems mot det er
    # en brems mot oppgaven.
    ap.add_argument("--imitasjon", action="store_true")
    # HOLDOUT PAA KAMP, ikke paa rad. Rader fra samme kamp deler bade kortene og
    # halen, saa en radsplitt maaler hukommelse. 0 = ingen holdout.
    ap.add_argument("--holdout-del", type=int, default=10, help="1 av N KAMPER holdes utenfor")
    ap.add_argument("--vekt-verdi-hale", type=float, default=1.0)
    # ============ §127s TO BRYTERE, HVER FOR SEG ========================
    #
    # De to endringene bygges og trenes SAMMEN fra epoke 0 - hver for seg koster
    # timer - men de skal kunne SKILLES etterpaa uten aa gjette. Derfor en bryter
    # hver, og begge er eksakte i null:
    #
    #   --vekt-stikk 0          stikkhodet faar ingen gradient. Det staar paa
    #                           W = 0 fra `__init__`, saa det kan heller ikke
    #                           dytte stammen. Ablasjonen er en IDENTITET, ikke
    #                           en tilnaermelse.
    #   --vekt-verdi-kvantil 0  kvantilhodet faar ingen gradient, snittet er
    #                           eksakt 0, og `V_runde` er skalaren alene - altsaa
    #                           §125/§126 bit for bit.
    ap.add_argument(
        "--vekt-stikk",
        type=float,
        default=1.0,
        help="STIKKHODET (§127). 0 = ablasjon, og den er eksakt.",
    )
    ap.add_argument(
        "--vekt-verdi-kvantil",
        type=float,
        default=1.0,
        help="FORDELINGSVERDIEN (§127). 0 = skalaren alene, bit-identisk med §126.",
    )
    ap.add_argument(
        "--kvantil-huber",
        type=float,
        default=1.0,
        help="kappa i kvantil-Huber, i enheter av --verdi-skala",
    )
    args = ap.parse_args()

    t0 = time.time()
    enhet = "cuda" if torch.cuda.is_available() else "cpu"
    skjult = [int(x) for x in args.skjult.split(",")]

    print("ERFARING:", flush=True)
    rad, dim, mdim, versjon = les_erfaring(args.inn, maks=(args.maks_rader or None))
    n = len(rad)
    if n == 0:
        raise SystemExit("Ingen rader — epoken har ingen gradient aa ta")
    delt = versjon >= 2

    # ------------------------------------------------------------------ til GPU
    X = torch.from_numpy(numpy.ascontiguousarray(rad["t"])).to(enhet)
    M = torch.from_numpy(numpy.ascontiguousarray(rad["m"])).to(enhet).bool()
    Fa = torch.from_numpy(numpy.ascontiguousarray(rad["f"])).to(enhet).long()
    KODE = torch.from_numpy(numpy.ascontiguousarray(rad["kode"])).to(enhet).long()
    LOV = torch.from_numpy(numpy.ascontiguousarray(rad["lovlige"])).to(enhet).long()
    RAD_FASE = torch.from_numpy(numpy.ascontiguousarray(rad["fase"])).to(enhet).long()
    G = torch.from_numpy(numpy.ascontiguousarray(rad["G"])).to(enhet).float()
    A = torch.from_numpy(numpy.ascontiguousarray(rad["A"])).to(enhet).float()
    if delt:
        GR = torch.from_numpy(numpy.ascontiguousarray(rad["Gr"])).to(enhet).float()
        GH = torch.from_numpy(numpy.ascontiguousarray(rad["Gh"])).to(enhet).float()
        # IDENTITETEN PROEVES HER OGSAA, ikke bare i `test/mlb-epoke.test.ts`.
        # Skriveren og leseren er to filer i to spraak; en avvikende sum ville
        # betydd at halen ble talt to ganger, og fordelen `A = G - V` ville hatt
        # en skjevhet uten at noe feilet.
        avvik = float((GR + GH - G).abs().max())
        if avvik > 1e-3:
            raise SystemExit(
                f"Gr + Gh avviker fra G med {avvik:.6f} paa den verste raden. "
                f"Verdimaalet er ikke delt konsistent - epoken tas IKKE."
            )
        kamp = numpy.ascontiguousarray(rad["kamp"])
    else:
        GR = GH = None
        kamp = None

    # ===================== STIKKETIKETTEN (§127) =========================
    #
    # -1 betyr UKJENT: runden ble aldri ferdigspilt, saa laget er ikke kjent.
    # Den maskeres bort noeyaktig som `troFasit`s nullklasse. Et 0 der ville
    # laert nettet at laget tar null stikk i nettopp de rundene ingen fikk
    # spilt ferdig - og de rundene er systematisk de lengste.
    har_stikk = versjon >= 3
    if har_stikk:
        ST = torch.from_numpy(numpy.ascontiguousarray(rad["stikk"])).to(enhet).long()
        ST_KJENT = ST >= 0
        # ETIKETTEN MAA VAERE INNENFOR HODET. Et sete som tok 13 stikk finnes
        # ikke ved fire spillere; skulle det dukke opp, er enten motoren eller
        # `fyllStikkIgjen` uenig med `STIKK_UT`, og et `cross_entropy` med en
        # klasse utenfor rekkevidde gir udefinert oppfoersel og ikke en feil.
        maks_st = int(ST.max()) if len(ST) else 0
        if maks_st >= STIKK_UT:
            raise SystemExit(
                f"stikkfasit {maks_st} >= STIKK_UT {STIKK_UT}. Hodet har ikke en plass "
                f"til etiketten - se STIKK_UT i src/mlb/nett.ts og verktoy/mlb-tren.py."
            )
        andel_stikk = float(ST_KJENT.float().mean())
        print(
            f"STIKKFASIT: {int(ST_KJENT.sum())} av {n} rader kjent ({andel_stikk * 100:.1f} %), "
            f"snitt {float(ST[ST_KJENT].float().mean()):.3f} stikk igjen",
            flush=True,
        )
    else:
        ST = ST_KJENT = None
        andel_stikk = 0.0
        if args.vekt_stikk > 0:
            print(
                f"ADVARSEL: erfaringsfilene er versjon {versjon} og har ingen stikkfasit. "
                f"--vekt-stikk {args.vekt_stikk} slaas AV. Spill epoken om igjen med "
                f"examples/mlb-erfaring.ts fra §127 hvis stikkhodet skal trenes.",
                flush=True,
            )
            args.vekt_stikk = 0.0
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

    # ===================== FEM FASER, UTLEDET OG IKKE LEST ================
    #
    # Filformatets `fase` har fire verdier (0 bud, 1 vrak, 2 velg, 3 spill), og
    # 2 lumper trumfvalget sammen med etterlysningen. De to er helt ulike valg —
    # fire farger mot opptil tretten kort — og det er trumfvalget som er
    # kollapset. Skillet tas paa MASKEN: trumfkodene er de FIRE SISTE plassene i
    # handlingsrommet (`TRUMF_FRA = HANDLING_LENGDE - ANTALL_TRUMF` i
    # `src/mlb/handling.ts`), saa er en av dem lovlig, er raden et trumfvalg.
    #
    # Utledet, ikke lest: gamle erfaringsfiler virker uendret, og det finnes
    # ingen ny sannhet som kan komme i utakt med TS-siden.
    if mdim != 68:
        raise SystemExit(
            f"handlingsrommet er {mdim} plasser, ikke 68. Fasedelingen paa masken "
            f"antar at de FIRE SISTE er trumfkodene - se src/mlb/handling.ts."
        )
    FASE_NAVN = ["BUD", "VRAK", "TRUMF", "ETTERLYS", "SPILL"]
    _er_trumf = M[:, mdim - 4 :].any(dim=1)
    # 3 (spill) flyttes til 4 FOERST, saa 2 (velg) deles i 2 trumf / 3 etterlys.
    # Motsatt rekkefoelge ville flyttet de nye 3-ene til 4 i samme slengen.
    FASEF = torch.where(RAD_FASE == 3, torch.full_like(RAD_FASE, 4), RAD_FASE)
    FASEF = torch.where(
        FASEF == 2,
        torch.where(_er_trumf, torch.full_like(FASEF, 2), torch.full_like(FASEF, 3)),
        FASEF,
    )
    # ln(antall lovlige) — nevneren i den NORMALISERTE entropien. Rader med en
    # lovlig plass baerer ingen policygradient og er uansett utenfor snittet.
    LNL = torch.log(LOV.clamp(min=2).float())
    fase_antall = [int(((FASEF == f) & MED_VALG).sum()) for f in range(5)]
    print(
        "FASER (rader med valg): "
        + "  ".join(f"{FASE_NAVN[f]} {fase_antall[f]}" for f in range(5)),
        flush=True,
    )

    def _fem(s, navn):
        if s.strip() == "":
            return None
        d = [float(x) for x in s.split(",")]
        if len(d) != 5:
            raise SystemExit(
                f"{navn} trenger fem tall «bud,vrak,trumf,etterlys,spill», fikk {len(d)}"
            )
        return torch.tensor(d, device=enhet, dtype=torch.float32)

    ENT_C = _fem(args.entropi_fase, "--entropi-fase")
    ENT_GULV = _fem(args.entropi_gulv, "--entropi-gulv")
    if ENT_GULV is not None and ENT_C is None:
        raise SystemExit(
            "--entropi-gulv uten --entropi-fase: gulvet har ingen koeffisient aa henge paa"
        )
    # ============ `--entropi` ER INERT NAAR `--entropi-fase` ER SATT =======
    #
    # Og det MAA sies hoeyt. En leser som ser «--entropi 0.01» i kommandolinja
    # og i loggen konkluderer med at entropikoeffisienten er 0,01 - mens den
    # faktisk brukte er 0,5 per fase, altsaa femti ganger mer. Det skjedde:
    # en ekstern gjennomgang leste flagget og foreslo aa femdoble «0,01».
    #
    # Dette er prosjektets mest gjentatte feilklasse i en ny drakt - ikke «det
    # maalte var ikke det jeg mente», men **det leste var ikke det som virket**.
    if ENT_C is not None and args.entropi != 0:
        print(
            f"MERK: --entropi {args.entropi} er INERT. Med --entropi-fase satt regnes "
            f"entropileddet BARE per fase (koeffisienter {[float(x) for x in ENT_C]}"
            + (f", gulv {[float(x) for x in ENT_GULV]}" if ENT_GULV is not None else "")
            + "). Det gamle snittleddet er ikke lagt til.",
            flush=True,
        )

    def entropitapet(ent_rad, norm_rad, valg, fase):
        """Entropileddet slik det LEGGES TIL tapet — altsaa med fortegnet inne.

        `ENT_C is None` er §125 bit-for-bit: `-entropi * snitt(H)` over alle
        rader med valg. Ellers ett ledd per fase paa fasens EGET snitt, saa
        vekten paa en fase ikke henger av hvor mange rader de andre har.

        Fravaerende faser hoppes over. Et snitt over null rader er `nan`, og en
        `nan` i tapet forplanter seg til hver eneste vekt i ETT steg.
        """
        if not bool(valg.any()):
            return torch.zeros((), device=enhet)
        if ENT_C is None:
            return -args.entropi * ent_rad[valg].mean()
        tap_ = torch.zeros((), device=enhet)
        for f in range(5):
            m = valg & (fase == f)
            if not bool(m.any()):
                continue
            if ENT_GULV is not None and float(ENT_GULV[f]) > 0:
                # HENGSELEN. Under gulvet dyttes fasen opp; over det er leddet
                # eksakt null, og gradienten med det.
                tap_ = tap_ + ENT_C[f] * (ENT_GULV[f] - norm_rad[m].mean()).clamp(min=0.0)
            else:
                tap_ = tap_ - ENT_C[f] * ent_rad[m].mean()
        return tap_

    # ===================== HOLDOUT PAA KAMP, IKKE PAA RAD =================
    #
    # §124 FUNN 2: «forklart varians» ble maalt paa `kl_idx`, som ble trukket
    # fra de SAMME radene steget ble tatt paa. Epoke 10 sto paa +0,1286 i
    # utvalget og +0,0751 paa holdout-KAMPER, og ti epokers rapporter leste det
    # optimistiske tallet.
    #
    # Rader fra samme kamp deler bade kortene, motstanderne og HALEN - en splitt
    # paa rad maaler derfor hukommelse og ikke generalisering. Splitten gaar paa
    # kampens froe, og den er deterministisk: samme epoke gir samme holdout.
    if delt and args.holdout_del > 1:
        er_hold = (numpy.abs(kamp) % args.holdout_del) == 0
        tren_idx = torch.from_numpy(numpy.nonzero(~er_hold)[0].astype("<i8")).to(enhet)
        hold_idx = torch.from_numpy(numpy.nonzero(er_hold)[0].astype("<i8")).to(enhet)
        if len(hold_idx) < 1000 or len(tren_idx) < 1000:
            raise SystemExit(
                f"holdout ga {len(tren_idx)} trenings- og {len(hold_idx)} holdoutrader - "
                f"for skjevt til aa lese. Senk --holdout-del eller oek --kamper."
            )
    else:
        tren_idx = torch.arange(n, device=enhet)
        hold_idx = None
    n_tren = len(tren_idx)

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

    # ===================== FORDELINGSVERDIEN (§127) ======================
    #
    # ============ IDENTITETEN `A = G - V` SKAL IKKE ROERES ==============
    #
    # `V_runde = verdi(skalar) + snitt(kvantiler)`. Med kvantilhodet PAA vil vi
    # at fordelingens forventning skal VAERE `V_runde`, ikke et tillegg til en
    # skalar som ogsaa trenes mot det samme maalet - da ville de to delt paa
    # etiketten uidentifiserbart, akkurat som §124 fant for det todelte
    # verdihodet trent mot summen alene.
    #
    # Derfor: skalaren settes til NULL og fryses. `V_runde` er da EKSAKT
    # fordelingens forventning, og `A = G^y - V` er urort i formen.
    #
    # Og motsatt vei er ablasjonen eksakt: med `--vekt-verdi-kvantil 0` faar
    # kvantilhodet ingen gradient, det staar paa W = 0 fra `__init__`, snittet er
    # eksakt 0, og `V_runde` er skalaren alene - §125/§126 bit for bit.
    KVANTIL_PAA = args.vekt_verdi_kvantil > 0
    TAU = ((torch.arange(KVANTIL_UT, device=enhet).float() + 0.5) / KVANTIL_UT).view(1, -1)
    if KVANTIL_PAA:
        with torch.no_grad():
            modell.verdi.weight.zero_()
            modell.verdi.bias.zero_()
        for p_ in modell.verdi.parameters():
            p_.requires_grad_(False)
        if args.vekt_verdi > 0:
            print(
                f"--vekt-verdi {args.vekt_verdi} settes til 0: med kvantilhodet paa ER "
                f"V_runde fordelingens forventning, og to hoder mot samme etikett er "
                f"uidentifiserbart (§124).",
                flush=True,
            )
            args.vekt_verdi = 0.0

    if args.nullstill_verdi:
        # BEGGE verdihodene, hvert med SITT snitt. Nullstilles bare det ene, er
        # summen `V` feil med snittet av det andre fra foerste steg, og
        # fordelen `G^y - V` faar en skjevhet paa nettopp den differansen.
        mal_runde = GR if delt else G
        with torch.no_grad():
            modell.verdi_hale.weight.zero_()
            modell.verdi_hale.bias.fill_(float(GH.mean()) if delt else 0.0)
            if KVANTIL_PAA:
                # ============ KVANTILHODET NULLSTILLES MED KVANTILENE ========
                #
                # W = 0 og b_i = den EMPIRISKE tau_i-kvantilen av maalet. Da er
                # `d(kvantiltap)/d(stamme)` eksakt null ved foerste steg - hodet
                # maa laere sine egne vekter foer det kan dytte den DELTE stammen
                # - og forventningen starter paa maalets snitt i stedet for paa 0.
                #
                # Med `b_i = 0` for alle i ville hodet spaadd en degenerert
                # fordeling i punktet 0, og hele skalaskiftet ville gaatt gjennom
                # stammen. Det er noeyaktig §124 FUNN 5, med et nytt hode.
                kv = torch.quantile(mal_runde.float(), TAU.view(-1).clamp(1e-6, 1 - 1e-6))
                modell.verdi_kvantil.weight.zero_()
                modell.verdi_kvantil.bias.copy_(kv)
            else:
                modell.verdi.weight.zero_()
                modell.verdi.bias.fill_(float(mal_runde.mean()))
        print(
            f"VERDIHODENE NULLSTILT: W = 0, "
            + (
                f"kvantilene b = [{float(kv[0]):+.2f} … {float(kv[-1]):+.2f}] "
                f"(forventning {float(kv.mean()):+.3f})"
                if KVANTIL_PAA
                else f"b(runde) = {float(mal_runde.mean()):+.3f}"
            )
            + f", b(hale) = {float(GH.mean()) if delt else 0.0:+.3f}. "
            f"Gradienten inn i stammen fra verdileddene er null ved foerste steg.",
            flush=True,
        )
    par = sum(p.numel() for p in modell.parameters())
    # ============ VERDIHODENE FAAR SIN EGEN SKRITTLENGDE (§125) ==========
    #
    # Adam flytter hver parameter ~lr per steg, uansett hvor stor gradienten er.
    # Det er en STYRKE for policyen, der logitene lever paa skala 1-25, og en
    # svakhet for et lineaert verdihode over stammens 512 ReLU-utganger: er de
    # optimale vektene av stoerrelsesorden 1e-3, sprer et steg paa 3e-4 seg like
    # mye som svaret selv, og hodet oscillerer i stedet for aa konvergere.
    #
    # Maalt paa 18 130 roeykproeverader: med felles lr 3e-4 og 2 400 steg paa den
    # FROSNE stammen naadde rundehodet +0,011 forklart i utvalget, mens en
    # regularisert ridge paa de SAMME 512 utgangene naadde +0,090. Taket laa
    # altsaa aatte ganger hoeyere enn det optimeringen fant.
    #
    # KVANTILHODET HOERER TIL I VERDIGRUPPEN. Det er et verdihode i alt som
    # betyr noe for skrittlengden: lineaert over stammens 512 ReLU-utganger, med
    # optimale vekter av stoerrelsesorden 1e-3. Stikkhodet staar derimot paa
    # `--lr`, som trohodet — begge er kryssentropi over logits paa skala 1.
    verdipar = [
        p
        for m in (modell.verdi, modell.verdi_hale, modell.verdi_kvantil)
        for p in m.parameters()
    ]
    verdi_id = {id(p) for p in verdipar}
    opt = torch.optim.AdamW(
        [
            {"params": [p for p in modell.parameters() if id(p) not in verdi_id], "lr": args.lr},
            {"params": verdipar, "lr": (args.lr_verdi or args.lr)},
        ],
        lr=args.lr,
    )
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
        s = {
            k: 0.0
            for k in (
                "pol",
                "ent",
                "tro",
                "treff",
                "kvad",
                "kvadG",
                "kvadR",
                "kvadH",
                # §127: stikkhodets kryssentropi, treffandel og KVADRATFEIL paa
                # forventningen. Den siste er den som kan leses ved siden av
                # verdihodets «forklart» - samme form, samme nevner-regel.
                "st_ce",
                "st_treff",
                "st_kvad",
                "st_sum",
                # SAMSVAR MED KODEN I RADEN: andel ekte valg der nettets argmaks
                # er den koden som faktisk ble valgt. Under `--imitasjon` er det
                # hvor naer laereren nettet er; i selvspill er det bare en
                # beskrivelse av hvor ofte samplet valg == argmaks.
                "pol_treff",
            )
        }
        nt = np_ = nv = ns = 0
        lp_alle = []
        # ============ DIAGNOSTIKKEN SOM MANGLET (§126) ======================
        #
        # `ent` alene er ETT snitt over fem faser, og 78 % av radene er
        # kortspill. v125 loggfoerte at det snittet STEG 0,5983 -> 0,8561 over
        # fjorten epoker mens trumfvalget kollapset til en farge under det.
        # Et snitt som kan stige mens delene faller er ikke en maaling, det er
        # en gjennomsnittsfelle — saa her staar hver fase for seg.
        #
        # `ulike` er den harde varianten: hvor mange ULIKE argmaks-koder fasen
        # faktisk bruker. Det er tallet `examples/mlb-arkitektur.ts --fordeling`
        # leser paa den utrullede boten, maalt her paa treningsradene, og det er
        # det som gaar til null naar policyen kollapser.
        f_ent = [0.0] * 5
        f_norm = [0.0] * 5
        f_n = [0] * 5
        f_kode = [torch.zeros(mdim, device=enhet, dtype=torch.long) for _ in range(5)]
        for i in range(0, len(idx), args.batch):
            j = idx[i : i + args.batch]
            p, v, t, vr, vh, sl_, _kv = modell.alt(X[j].float())
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
                fase_j = FASEF[j]
                argmaks = lg.argmax(dim=1)
                s["pol_treff"] += float((argmaks == KODE[j])[valg].sum())
                for f in range(5):
                    mf = valg & (fase_j == f)
                    if not bool(mf.any()):
                        continue
                    f_ent[f] += float(ent[mf].sum())
                    f_norm[f] += float((ent[mf] / LNL[j][mf]).sum())
                    f_n[f] += int(mf.sum())
                    f_kode[f] += torch.bincount(argmaks[mf], minlength=mdim)
            s["kvad"] += float(((v - G[j]) ** 2).sum())
            s["kvadG"] += float((G[j] ** 2).sum())
            if delt:
                s["kvadR"] += float(((vr - GR[j]) ** 2).sum())
                s["kvadH"] += float(((vh - GH[j]) ** 2).sum())
            nv += len(j)
            mal = Fa[j]
            mk = mal > 0
            if mk.any():
                m3 = (mal - 1).clamp(min=0)
                s["tro"] += float(F.cross_entropy(t[mk], m3[mk], reduction="sum"))
                s["treff"] += float(((t.argmax(dim=2) == m3) & mk).sum())
                nt += int(mk.sum())
            # ============ STIKKHODET (§127) ==============================
            #
            # `st_kvad` er kvadratfeilen paa FORVENTNINGEN `E[stikk] = sum k·p_k`,
            # og ikke paa argmaksen. Det er den formen som kan leses ved siden av
            # verdihodets «forklart varians»: samme regnestykke, samme nevner.
            # Argmaksen ville gitt et heltall og en kunstig daarlig RMSE for et
            # hode som spaar en fordeling helt riktig.
            if ST_KJENT is not None:
                mst = ST_KJENT[j]
                if mst.any():
                    y = ST[j][mst]
                    lo = sl_[mst]
                    s["st_ce"] += float(F.cross_entropy(lo, y, reduction="sum"))
                    s["st_treff"] += float((lo.argmax(dim=1) == y).sum())
                    kl_ = torch.arange(STIKK_UT, device=enhet).float()
                    e = (F.softmax(lo, dim=1) * kl_).sum(1)
                    s["st_kvad"] += float(((e - y.float()) ** 2).sum())
                    s["st_sum"] += float(e.sum())
                    ns += int(mst.sum())
        modell.train()

        def forklart(kvad, maal_):
            """1 - MSE/Var. Variansen regnes paa NOEYAKTIG de samme radene."""
            mse = kvad / max(1, nv)
            var = float(maal_[idx].var(unbiased=False))
            return 1.0 - mse / max(var, 1e-9)

        ut = {
            "pol": s["pol"] / max(1, np_),
            "pol_treff": s["pol_treff"] / max(1, np_),
            "ent": s["ent"] / max(1, np_),
            "tro": s["tro"] / max(1, nt),
            "treff": s["treff"] / max(1, nt),
            "rmse": (s["kvad"] / max(1, nv)) ** 0.5,
            "forklart": forklart(s["kvad"], G),
        }
        # PER FASE, og med navn i noekkelen — en liste med fem tall uten navn er
        # nettopp den slags som blir lest i feil rekkefoelge et halvt aar senere.
        for f in range(5):
            nf = max(1, f_n[f])
            ut[f"ent_{FASE_NAVN[f]}"] = f_ent[f] / nf
            ut[f"norment_{FASE_NAVN[f]}"] = f_norm[f] / nf
            ut[f"ulike_{FASE_NAVN[f]}"] = float(int((f_kode[f] > 0).sum()))
        if delt:
            # HVER DEL MED SITT EGET NEVNER. `forklart_runde` mot Var(Gr) og
            # `forklart_hale` mot Var(Gh) - deles de paa Var(G), ser den ene
            # delen kunstig god ut bare fordi den er den store.
            ut["forklart_runde"] = forklart(s["kvadR"], GR)
            ut["forklart_hale"] = forklart(s["kvadH"], GH)
        if ns > 0:
            # ============ STIKKHODETS FORKLARTE VARIANS ==================
            #
            # Nevneren er variansen til stikketiketten PAA DE SAMME RADENE, og
            # bare de kjente. Regnes den mot variansen over alle rader, ser
            # hodet bedre ut jo flere ukjente etiketter epoken hadde - og de
            # ukjente er systematisk de lengste rundene.
            y = ST[idx]
            y = y[y >= 0].float()
            ut["st_ce"] = s["st_ce"] / ns
            ut["st_treff"] = s["st_treff"] / ns
            ut["st_rmse"] = (s["st_kvad"] / ns) ** 0.5
            ut["st_forklart"] = 1.0 - (s["st_kvad"] / ns) / max(float(y.var(unbiased=False)), 1e-9)
            ut["st_snitt"] = s["st_sum"] / ns
        return ut, torch.cat(lp_alle)

    @torch.no_grad()
    def kl_logp(idx):
        """BARE policyens log-sannsynligheter paa `idx` - det KL-bremsen leser.

        KL-sjekken per batch kalte `maal(kl_idx)` og kastet alt utenom `lp`:
        ~20 diagnostikktall, hvert med sin egen synkronisering til CPU. Profilen
        10. september (200 000 rader, en passering): `maal` 20,2 s mot ~3 s for
        selve framover+bakover - omtrent fem ganger treningen, per batch.

        Samme oppdeling i batcher, samme `eval()`, samme `modell.alt`, samme
        maskering og samme `log_softmax` som i `maal`. `lp` er derfor den samme
        tensoren, og treningen den samme: proevd med sha1 paa vektene etter en
        passering, gammel sti mot ny.
        """
        modell.eval()
        lp_alle = []
        for i in range(0, len(idx), args.batch):
            j = idx[i : i + args.batch]
            p, *_ = modell.alt(X[j].float())
            lp_alle.append(F.log_softmax(maskerte_logits(p, M[j]), dim=1))
        modell.train()
        return torch.cat(lp_alle)

    g = torch.Generator(device="cpu").manual_seed(args.froe + args.epoke)
    # KL-RADENE ER FASTE, og de trekkes FOER foerste steg: uten dem er det
    # ingen maate aa se at et steg SPRENGTE policyen paa - bare at tapet falt.
    # De trekkes fra TRENINGSradene: KL maaler drift der gradienten tas.
    kl_idx = tren_idx[torch.randperm(n_tren, generator=g)[: min(args.kl_rader, n_tren)].to(enhet)]
    foer, lp_foer = maal(kl_idx)
    # GRUNNLINJEN SLIK DEN FAKTISK VAR: `hold_foer` er maalt paa vekter som
    # aldri har sett noen av disse radene, paa KAMPER som ikke trenes paa i det
    # hele tatt. Det er tallet §124 FUNN 2 sier skal staa i rapporten.
    hold_foer = maal(hold_idx)[0] if hold_idx is not None else None

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(
        json.dumps(
            {
                "epoke": args.epoke,
                "start": time.strftime("%Y-%m-%d %H:%M"),
                "rader": n,
                "versjon": versjon,
                "rader_tren": int(n_tren),
                "rader_hold": 0 if hold_idx is None else int(len(hold_idx)),
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

    # ===================== BREMSEN STOPPET FOR MYE (§125) =================
    #
    # ============ DET SOM VAR GALT, OG DET KOSTET SJU EPOKER ============
    #
    # Bremsen fyrte i HVER epoke etter 4-16 batcher av 76-228. Sju epoker ga
    # rundt FOERTI gradientsteg til sammen, og verdihodet - som var hele poenget
    # med gamma - forklarte aldri noe, fordi det ble nullstilt i epoke 1 og
    # deretter aldri fikk nok steg til aa laere seg noe igjen.
    #
    # Det er en INTERAKSJON ingen av delene har alene:
    #
    #   Bremsen finnes for aa beskytte POLICYEN. Den stoppet HELE gjennomloepet.
    #   Verdi- og trohodet har perfekte, faste etiketter og ingen grunn til aa
    #   stoppe - men de stoppet likevel, fordi de deler loekke med policyen.
    #
    # ============ RETTELSEN: FRYS STAMMEN, IKKE STOPP LOEKKA ============
    #
    # Naar KL passerer maalet, settes `requires_grad = False` paa stammen OG
    # policyhodet. Da er policyen en KONSTANT funksjon resten av gjennomloepet -
    # ikke «omtrent uendret», men bit-identisk, fordi ingen parameter den leser
    # kan flytte seg. Verdi- og trohodet trener videre paa den frosne
    # representasjonen og faar de hundrevis av stegene grunnlinjen trenger.
    #
    # ============ MEN EN FROSSEN STAMME HAR EN MAALT PRIS ===============
    #
    # `verktoy/mlb-verdi-tak.py` regner den LUKKEDE loesningen - regularisert
    # ridge, ingen optimeringsvalg - for hva et lineaert hode kan naa. Paa 86 k
    # rader fra denne riggen, holdout splittet paa KAMP:
    #
    #     maal                       1032 raa trekk    512 stammeutganger
    #     Gr (rundens gjenstaaende)      +0,231              +0,107
    #     G  (hele det diskonterte)      +0,165              +0,074
    #
    # Stammen baerer altsaa under HALVPARTEN av det trekkene selv baerer, og
    # taket for ethvert lineaert hode over en FROSSEN stamme er +0,107. Ingen
    # mengde steg kommer forbi det. Stammen maa faa trene, ellers er
    # grunnlinjen doemt til aa vaere daarlig uansett hvor mange epoker vi kjoerer.
    #
    # ============ DERFOR ER BREMSEN TOTRINNS =============================
    #
    #   TRINN 1, ved `--kl-maal`:  POLICYHODET fryses og policyleddet faller ut.
    #                              Stammen trener videre paa verdi og tro, og
    #                              representasjonen fortsetter aa utvikle seg.
    #   TRINN 2, ved `--kl-tak`:   STAMMEN fryses ogsaa. Etter det er policyen en
    #                              KONSTANT funksjon, og `kl_drift` maaler at den
    #                              er det.
    #
    # Mellom de to trinnene DRIVER policyen - stammen er delt, saa den maa. Det
    # er ikke gratis, og det er nettopp §124 FUNN 5: `--vekt-policy 0` lot
    # verdihodets skalakorreksjon gaa rett gjennom stammen, KL naadde 0,187, og
    # styrken falt fra +16 til -760 poeng. Forskjellen her er at driften er
    # BUNDET og MAALT: `--kl-tak` er taket, KL maales hver fjerde batch helt til
    # trinn 2 slaar inn, og bade `kl_ved_frys` og `kl` staar i den varige loggen.
    # En ubundet drift var feilen; en bundet drift er en pris.
    def frys(moduler):
        for m in moduler:
            for p_ in m.parameters():
                p_.requires_grad_(False)

    stoppet_paa_kl = -1
    frosset_paa = -1
    frosset_stamme_paa = -1
    kl_ved_frys = None
    frosset = False
    frosset_stamme = False
    kl_tak = args.kl_tak if args.kl_tak > 0 else 2.0 * args.kl_maal
    modell.train()
    for runde in range(args.gjennomlop):
        perm = tren_idx[torch.randperm(n_tren, generator=g).to(enhet)]
        for i in range(0, n_tren, args.batch):
            j = perm[i : i + args.batch]
            p, v, t, vr, vh, sl_, kv_ = modell.alt(X[j].float())

            if frosset:
                # Policyleddet hoppes over HELT. Gradienten inn i det ville
                # vaert null uansett (alt det leser er frosset), men et ledd som
                # regnes og ikke virker er et ledd noen leser i tapet og tror
                # betyr noe.
                tap_pol = torch.zeros((), device=enhet)
                tap_ent = torch.zeros((), device=enhet)
            else:
                lg = F.log_softmax(maskerte_logits(p, M[j]), dim=1)
                valg = MED_VALG[j]
                if valg.any() and args.imitasjon:
                    # Kryssentropi mot LAERERENS kode, bare paa rader med et
                    # ekte valg. Ingen fordel, intet PPO-klipp: raden sier hva
                    # Adams valgte, og det er etiketten.
                    tap_pol = F.nll_loss(lg[valg], KODE[j][valg])
                    pr = lg.exp()
                    ent_rad = -(pr * lg.masked_fill(~M[j], 0.0)).sum(1)
                    tap_ent = entropitapet(ent_rad, ent_rad / LNL[j], valg, FASEF[j])
                elif valg.any():
                    lpa = lg.gather(1, KODE[j].unsqueeze(1)).squeeze(1)
                    forhold = (lpa - lp_gammel[j]).clamp(max=20.0).exp()
                    a = An[j]
                    tap_pol = -torch.min(
                        forhold * a, forhold.clamp(1 - args.eps, 1 + args.eps) * a
                    )[valg].mean()
                    pr = lg.exp()
                    ent_rad = -(pr * lg.masked_fill(~M[j], 0.0)).sum(1)
                    tap_ent = entropitapet(ent_rad, ent_rad / LNL[j], valg, FASEF[j])
                else:
                    tap_pol = torch.zeros((), device=enhet)
                    tap_ent = torch.zeros((), device=enhet)

            if delt:
                # HVERT HODE MOT SITT EGET MAAL. Trenes summen mot `G` alene, er
                # delingen uidentifiserbar - nettet kan legge alt i den ene, og
                # da er to hoder bare ett hode med flere parametre (§124).
                tap_verdi = F.mse_loss(vr / verdi_skala, GR[j] / verdi_skala)
                tap_hale = F.mse_loss(vh / verdi_skala, GH[j] / verdi_skala)
            else:
                tap_verdi = F.mse_loss(v / verdi_skala, G[j] / verdi_skala)
                tap_hale = torch.zeros((), device=enhet)

            # ============ FORDELINGSVERDIEN: KVANTIL-HUBER (§127) ==========
            #
            # `u_i = (y - theta_i)/skala`, Huber paa `u`, vektet med
            # `|tau_i - 1[u < 0]|`. Det er QR-tapet: minimum ligger i den ekte
            # tau_i-kvantilen, ikke i snittet, saa hodet BESKRIVER fordelingen i
            # stedet for aa sikte mellom klumpene.
            #
            # `u.detach()` i vekten er ikke en detalj: `1[u < 0]` er en trinnfunksjon
            # med gradient null nesten overalt og udefinert i null, og en gradient
            # gjennom den ville vaert stoey.
            #
            # SKALAEN er den samme som MSE-leddet bruker, saa de to modusene er
            # sammenliknbare og `--vekt-verdi-kvantil` betyr det samme som
            # `--vekt-verdi` gjorde.
            if KVANTIL_PAA:
                y_ = (GR[j] if delt else G[j]).unsqueeze(1)
                u = (y_ - kv_) / verdi_skala
                au = u.abs()
                k_ = args.kvantil_huber
                huber = torch.where(au <= k_, 0.5 * u * u, k_ * (au - 0.5 * k_))
                vekt_q = (TAU - (u.detach() < 0).float()).abs()
                tap_kvantil = (vekt_q * huber).sum(dim=1).mean()
            else:
                tap_kvantil = torch.zeros((), device=enhet)

            mal = Fa[j]
            mk = mal > 0
            if mk.any():
                m3 = (mal - 1).clamp(min=0)
                tap_tro = F.cross_entropy(t[mk], m3[mk], reduction="mean")
            else:
                tap_tro = torch.zeros((), device=enhet)

            # ============ STIKKHODET (§127) ================================
            #
            # Kryssentropi mot «hvor mange stikk tar laget mitt i RESTEN av
            # runden», med de ukjente maskert bort. Perfekt etikett, kjent ved
            # rundeslutt, akkurat som troens - og signalet er TETT: etiketten
            # flytter seg for hvert stikk, mens verdien foerst faller ved
            # rundeslutt.
            if args.vekt_stikk > 0 and ST_KJENT is not None:
                mst = ST_KJENT[j]
                if mst.any():
                    tap_stikk = F.cross_entropy(sl_[mst], ST[j][mst], reduction="mean")
                else:
                    tap_stikk = torch.zeros((), device=enhet)
            else:
                tap_stikk = torch.zeros((), device=enhet)

            # `tap_ent` baerer fortegnet SITT SELV — se `entropitapet`. Med
            # `--entropi-fase` tom er den eksakt `-args.entropi * ent`, altsaa
            # §125s ledd, bit for bit.
            tap = (
                args.vekt_policy * tap_pol
                + tap_ent
                + args.vekt_verdi * tap_verdi
                + args.vekt_verdi_hale * tap_hale
                + args.vekt_verdi_kvantil * tap_kvantil
                + args.vekt_tro * tap_tro
                + args.vekt_stikk * tap_stikk
            )
            opt.zero_grad(set_to_none=True)
            tap.backward()
            torch.nn.utils.clip_grad_norm_(
                [q for q in modell.parameters() if q.grad is not None], args.klipp_grad
            )
            opt.step()

            # NOEDBREMSEN. Maales sjelden nok til aa vaere gratis, ofte nok til
            # aa ta en eksplosjon FOER epoken er over.
            #
            # INTERVALLET VAR 16, OG DET VAR FOR GROVT. §124: en epoke stoppet
            # paa bremsen ved batch 15 med KL alt paa 0,187 — seks ganger
            # `--kl-maal`. En brems som foerst maaler etter at skaden har
            # skjedd er en logg, ikke en brems. GPU-en er 1 % av epoketiden, saa
            # fire ganger hyppigere maaling koster ingenting vi merker.
            #
            # ETTER TRINN 2 maales den ikke lenger: policyen kan ikke flytte
            # seg, og en maaling som per konstruksjon gir samme svar er en
            # maaling som gjoemmer at den ikke maaler. Den ENE etterproeven staar
            # til slutt.
            if (
                args.kl_maal > 0
                and not frosset_stamme
                and (i // args.batch) % args.kl_intervall == args.kl_intervall - 1
            ):
                with torch.no_grad():
                    lp_na = kl_logp(kl_idx)
                    pg0 = lp_foer.exp()
                    kl_na = float(
                        (pg0 * (lp_foer - lp_na)).masked_fill(~M[kl_idx], 0.0).sum(1).mean()
                    )
                steg = runde * ((n_tren + args.batch - 1) // args.batch) + i // args.batch
                if kl_na > args.kl_maal and not frosset:
                    if args.kl_handling == "stopp":
                        stoppet_paa_kl = i // args.batch
                        break
                    frosset_paa = steg
                    frosset = True
                    frys([modell.policy])
                    print(
                        f"KL {kl_na:.5f} > {args.kl_maal} paa batch {steg}: POLICYHODET FROSSET. "
                        f"Stammen trener videre paa verdi og tro (tak {kl_tak:.4f}).",
                        flush=True,
                    )
                if kl_na > kl_tak:
                    frosset_stamme_paa = steg
                    kl_ved_frys = kl_na
                    frosset_stamme = True
                    frys([modell.stamme])
                    print(
                        f"KL {kl_na:.5f} > tak {kl_tak:.4f} paa batch {steg}: STAMMEN FROSSET. "
                        f"Policyen er naa en konstant funksjon - `kl_drift` maaler at den er det.",
                        flush=True,
                    )
        if stoppet_paa_kl >= 0:
            break

    etter, lp_etter = maal(kl_idx)
    hold_etter = maal(hold_idx)[0] if hold_idx is not None else None
    # KL(gammel || ny) paa de faste radene. Et steg som sprenger policyen viser
    # seg HER, ikke i tapet: tapet kan falle fordi fordelingen kollapset.
    with torch.no_grad():
        pg = lp_foer.exp()
        kl = float((pg * (lp_foer - lp_etter)).masked_fill(~M[kl_idx], 0.0).sum(1).mean())

    # ============ PROEVEN PAA AT FRYSEN FAKTISK FROES (§125) =============
    #
    # «Stammen er frosset, saa policyen kan ikke drive» er en paastand om koden,
    # og paastander om koden er nettopp det dette prosjektet har tatt feil av
    # femten ganger. Her maales den: KL etter hele gjennomloepet mot KL i det
    # oeyeblikket frysen slo inn. Er de ikke SAMME TALL, har noe policyen leser
    # flyttet seg likevel - og da er epoken ugyldig, ikke bare interessant.
    kl_drift = None if kl_ved_frys is None else abs(kl - kl_ved_frys)
    if kl_drift is not None and kl_drift > 1e-6:
        raise SystemExit(
            f"POLICYEN DREV ETTER FRYSEN: KL {kl_ved_frys:.8f} -> {kl:.8f} "
            f"(drift {kl_drift:.3e}). Da er ikke stammen frosset, og epoken skrives IKKE."
        )

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
    # Frysen tas AV foer vektene skrives. `requires_grad` foelger ikke med i
    # vektfila, men den foelger med i modellobjektet, og en fremtidig kaller som
    # gjenbruker det ville arvet en frossen stamme uten aa vite det.
    for q in modell.parameters():
        q.requires_grad_(True)
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

    # =============== «FORKLART» ETTER STEGET ER MAALT I UTVALGET ==========
    #
    # `etter` maales paa `kl_idx`, som er trukket fra de SAMME radene modellen
    # nettopp trente paa. Det er et I-UTVALGET-tall, og §124 fant at det er
    # optimistisk: epoke 10 rapporterte forklart +0,1286, mens de samme vektene
    # paa HOLDOUT-KAMPER maalte +0,0751.
    #
    # `foer` er derimot maalt paa vekter som ALDRI har sett disse radene — det
    # er nettopp vektene som spilte kampene og regnet fordelene. Det er det
    # aerlige tallet for «hvor god var grunnlinjen da gradienten ble tatt», og
    # det er derfor med i resultatlinja og ikke bare i aapningslinja.
    rad_ut = {
        "epoke": args.epoke,
        "sek": round(time.time() - t0, 1),
        # §127s TO BRYTERE I HVER ENESTE RAD. To epoker med ulike brytere gir
        # tall som ikke er sammenliknbare, og uten dem i loggen er de heller
        # ikke gjenkjennelige som ulike - samme regel som lambda og gamma.
        "vekt_stikk": args.vekt_stikk,
        "vekt_verdi_kvantil": args.vekt_verdi_kvantil,
        "andel_stikk_kjent": round(andel_stikk, 4),
        "kl": round(kl, 6),
        "logitskala": round(logitskala, 2),
        "stoppet_paa_kl": stoppet_paa_kl,
        "frosset_paa": frosset_paa,
        "frosset_stamme_paa": frosset_stamme_paa,
        "kl_tak": round(kl_tak, 6),
        "batcher": int((n_tren + args.batch - 1) // args.batch) * args.gjennomlop,
        "kl_ved_frys": None if kl_ved_frys is None else round(kl_ved_frys, 6),
        "kl_drift": None if kl_drift is None else float(f"{kl_drift:.3e}"),
        "foer": {k: round(v, 5) for k, v in foer.items()},
        "etter": {k: round(v, 5) for k, v in etter.items()},
        # HOLDOUT PAA KAMP — det ENE tallet som faktisk sier om verdihodet
        # generaliserer. `hold_foer` er vektene som spilte kampene, `hold_etter`
        # er vektene etter steget; ingen av dem har trent paa disse kampene.
        "hold_foer": None if hold_foer is None else {k: round(v, 5) for k, v in hold_foer.items()},
        "hold_etter": None if hold_etter is None else {k: round(v, 5) for k, v in hold_etter.items()},
        "d_pol": round(etter["pol"] - foer["pol"], 5),
        "d_tro": round(etter["tro"] - foer["tro"], 5),
        "d_rmse": round(etter["rmse"] - foer["rmse"], 5),
        "d_ent": round(etter["ent"] - foer["ent"], 5),
        "ut": args.ut,
    }
    logg.write(json.dumps(rad_ut) + "\n")
    logg.close()

    def hold(navn):
        return "n/a" if hold_etter is None else f"{hold_etter[navn]:+.4f}"

    os.makedirs(os.path.dirname(args.rapport) or ".", exist_ok=True)
    with open(args.rapport, "a", encoding="utf-8") as f:
        f.write(
            f"epoke {args.epoke}: n={n} (tren {n_tren}) A={a_snitt:+.3f}+-{a_std:.3f} "
            f"G={float(G.mean()):+.1f}+-{g_std:.1f} "
            f"| policy {foer['pol']:.4f} -> {etter['pol']:.4f} "
            f"| entropi {foer['ent']:.4f} -> {etter['ent']:.4f} "
            f"| tro {foer['tro']:.4f} -> {etter['tro']:.4f} "
            f"(treff {etter['treff'] * 100:.1f} %) "
            f"| verdi-RMSE {foer['rmse']:.3f} -> {etter['rmse']:.3f} "
            f"| FORKLART PAA HOLDOUT-KAMPER: sum {hold('forklart')}"
            + (
                f", runde {hold('forklart_runde')}, hale {hold('forklart_hale')}"
                if delt and hold_etter is not None
                else ""
            )
            + f" (i utvalget {etter['forklart']:+.4f}) "
            # ============ STIKKHODET PAA HOLDOUT (§127) ====================
            #
            # Det ENE tallet som sier om stikkhodet laerer noe som generaliserer,
            # ved siden av verdiens. Begge er «forklart varians paa
            # holdout-KAMPER», med hvert sitt maal og hver sin nevner - §124
            # FUNN 2 kostet ti epoker paa aa lese det i-utvalget-tallet.
            + (
                f"| STIKK forklart {hold('st_forklart')} "
                f"(RMSE {hold_etter['st_rmse']:.3f}, treff "
                f"{hold_etter['st_treff'] * 100:.1f} %) "
                if hold_etter is not None and "st_forklart" in hold_etter
                else "| STIKK n/a "
            )
            + f"| KL={kl:.5f} "
            # ============ DE TRE TALLENE §126 STAAR OG FALLER PAA ==========
            #
            # Snittentropien over alle rader kan STIGE mens en fase kollapser
            # under den - det er maalt, over fjorten epoker. Fasene staar derfor
            # her, hver for seg, i den varige fila og ikke bare i jsonl-en:
            # normalisert entropi, og hvor mange ULIKE koder fasen bruker.
            + "| FASER "
            + "  ".join(
                f"{FASE_NAVN[f][:4]} {etter[f'norment_{FASE_NAVN[f]}']:.3f}"
                f"/{int(etter[f'ulike_{FASE_NAVN[f]}'])}k"
                for f in range(5)
            )
            + " "
            + (
                f"| FRYS: policy paa batch {frosset_paa}, stamme paa {frosset_stamme_paa} "
                f"av {rad_ut['batcher']}"
                + (f", drift {kl_drift:.1e} " if kl_drift is not None else " ")
                if frosset_paa >= 0
                else "| ingen frys "
            )
            + f"| {time.time() - t0:.0f}s\n"
        )
    print(json.dumps(rad_ut), flush=True)


if __name__ == "__main__":
    main()
