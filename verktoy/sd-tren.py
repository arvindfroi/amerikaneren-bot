#!/usr/bin/env python3
"""
SD-TRENER MED GIV-DELT HOLDOUT – DAgger-runde 2 (sd-r2).

    ~/Arvind-Lora/.venv/bin/python verktoy/sd-tren.py \
        --data sd-data,sd-data2 --holdoutmappe sd-data2 \
        --kjor "r2a:sd-data2:384,256" --kjor "r2b:sd-data,sd-data2:384,256" \
        --utmappe e1-modell --logg analyse/sd-r2-tren.jsonl

HVORFOR DENNE FINNES OG IKKE BARE `verktoy/e1-tren.py`. Tre ting skiller.

1. HOLDOUT DELES PÅ GIV, IKKE PÅ STILLING. e1-tren.py tar de siste 5 % av
   linjene. To stillinger fra samme parti deler alle fire hender, hele
   budrunden og hele kontrakten – en stillingsdeling lekker derfor giv-nivå
   informasjon inn i «holdout». Prosjektet har allerede fått ett falskt
   positivt av nettopp det (et ferskt, utrent nett målte «bedre enn
   NevroHjerne» på en lekk holdout). Her hashes `frø` – partifrøet, altså det
   groveste og dermed sikreste grupperingsnivået som finnes i linjene – og
   hele partier havner enten i trening eller i holdout. Skriptet STOPPER hvis
   ett eneste frø havner i begge.

2. MINNET. e1-tren.py bygger Python-lister av lister og lager tensoren til
   slutt; 273 Python-floats per rad er ~8,8 kB, altså ~27 GB for 3,1 mill.
   stillinger. Her telles linjene først, numpy-arrayene allokeres én gang, og
   hver linje skrives rett inn. Toppen blir da ~4,7 GB for hele settet.

3. FLERE KJØRINGER PÅ ÉN INNLESING. Å parse 3,1 mill. JSON-linjer tar
   minutter; å trene et 200k-parameters nett på GPU tar sekunder. Derfor
   leses dataene ÉN gang, legges på GPU ÉN gang, og hver `--kjor` velger sine
   rader med et indekstensor. Datablandinger og arkitekturer kan dermed
   sammenlignes uten at innlesingen gjentas – og, viktigere, uten at de kan
   komme til å se ulike holdouts.

TAPET, VEKTINGEN, KRITERIET OG VEKTFORMATET ER UENDRET fra e1-tren.py, med
vilje: sd-r2 skal kunne settes rett mot sd-r1 der eneste forskjell er dataene.

TAPSKURVENE. Hver epoke logges FIRE tall, ikke bare det beste:
`tren_tap_vektet` (det optimalisereren faktisk ser), `tren_tap` og `hold_tap`
(samme UVEKTEDE tap på et fast treningsutvalg og på hele holdouten, så de kan
settes i samme graf), og `hold_anger`. En kurve som skiller lag er det vi
leter etter, og den kan ikke ses hvis bare det beste tallet rapporteres.
"""

import argparse
import glob
import hashlib
import json
import os
import struct
import time

import numpy
import torch
import torch.nn as nn

# Der det parsede korpuset mellomlagres. Egen mappe, gitignorert.
#
# SETT `SD_BUFFER` TIL EN STI I WSLs EGET FILSYSTEM naar treningen kjoeres
# derfra. Maalt 4. august paa dette korpuset:
#
#     totalt         21m51s
#     CPU-arbeid      3m15s
#     resten          I/O-venting mot /mnt/c
#
# Aatte av ni deler av kjoeringen var Windows-filsystemet gjennom WSL, ikke
# trening. Saa lenge innlesingen dominerer med en faktor sju, spiller
# batchstoerrelse og GPU-utnyttelse nesten ingen rolle - da er det HER tiden
# skal hentes, ikke i optimalisereren.
BUFFERMAPPE = os.environ.get("SD_BUFFER", "sd-buffer")
import torch.nn.functional as F

# BREDDEN LESES AV DATAENE, den er ikke hardkodet lenger.
#
# `src/e1/trekk.ts` har to lovlige bredder:
#   v1  273 = 238 fra appen + 35 egne
#   v2  340 = v1 + minneblokken (eget vrak, korrigert «hva er ute»)
#
# Den hardkodede 273-en var en STUM FELLE: innlesingen hopper over hver rad
# der `len(t)` ikke stemmer, så et v2-datasett ville gitt «0 gyldige rader»
# etter timer med generering – eller, om noen senere fjernet sjekken, trent
# på feiljusterte kolonner uten å feile.
# HOLDES I TAKT AV `test/e1-bredder.test.ts`, som leser denne linja og
# sammenlikner med `LOVLIGE_BREDDER` i src/e1/agent.ts. Det er den eneste
# koblingen mellom TypeScript og Python som ingen typesjekk dekker, og den
# driftet to ganger 4.-5. august foer testen fantes.
LOVLIGE_DIM = (273, 340, 356, 364, 376, 428, 458, 470, 558, 714)
# KORTNETTET MED MOTSTANDERBOKA (11. sep, `src/e1/kortbok.ts`): 273 | hukommelse 144 | stilling 36 |
# valgt bort 40 = 493. IKKE et prefiks av kjeden over - kolonne 273 er bok her og minneblokk (v2)
# der - og derfor en EGEN liste. Det eneste lovlige prefikset (--klipp, varmstart, --policy) er 273:
# et 340-nett startet paa 493-rader ville lest boka som minneblokk uten aa feile.
# `test/e1-bredder.test.ts` holder lista i takt med `E1_KORT_BOK_BREDDER`.
KORTBOK_DIM = (493,)
TREKK_DIM = None  # settes av `finn_dim()` ved innlesing
KORT = 52
# ANGEREN PER FASE (11. sep): K7 (de fem siste stikkene) ble VERRE etter foerste ekspertiterasjon
# mens totalangeren ble bedre. Porten maa derfor kunne se sluttspillet for seg. Fasen er `stikk`
# (stikk spilt foer beslutningen) i kort-data-radene; rader uten feltet teller ikke i noen fase.
FASER = (("TIDLIG", 0, 2), ("MIDT", 3, 6), ("SENT", 7, 11))


def prefiks_lovlig(smal: int, bred: int) -> bool:
    """Er de `smal` foerste kolonnene i en rad paa `bred` NOEYAKTIG et `smal`-nett sine trekk?

    Kjeden er strengt prefiks-utvidende (e1-bredder-proeven), saa der er svaret ja for alt smalere.
    Bokbredden er det ikke: der er bare grunnen (273) et prefiks. Avgjoeres av DATAENES bredde, saa
    et kutt (`:417` i --kjor) av 493-rader fortsatt foelger bokregelen.
    """
    if smal == bred:
        return True
    if TREKK_DIM in KORTBOK_DIM:
        return smal == 273
    return smal < bred


# --- Innlesing --------------------------------------------------------------


def tell_linjer(fil: str) -> int:
    """Antall linjeskift i filen. Trengs for å allokere numpy-arrayene én gang."""
    n = 0
    with open(fil, "rb") as f:
        while True:
            blokk = f.read(1 << 26)
            if not blokk:
                return n
            n += blokk.count(b"\n")


def voks(a, rader: int):
    """`a` kopiert inn i et NULLSTILT array med `rader` rader.

    IKKE `numpy.resize`. Den fyller de nye radene med GJENTATT gammelt
    innhold i stedet for nuller, og `M` er en maske som bare skrives der
    `v` faktisk har nøkler. Gjenbrukt søppel der ville slått på tapsledd
    for kort som aldri ble målt – en feil som ikke krasjer, og derfor er
    verre enn IndexError-en den skulle fjerne.
    """
    b = numpy.zeros((rader,) + a.shape[1:], dtype=a.dtype)
    b[: a.shape[0]] = a
    return b


def sig64(linje: str) -> int:
    """De første 8 bytene av md5 som uint64 – linjesignatur for duplikat- og
    overlappsjekk. Samme rolle som hexdigest[:16] i e1-tren.py, bare som tall,
    fordi 3 mill. Python-strenger koster et par hundre megabyte mer enn 3 mill.
    heltall."""
    return int.from_bytes(hashlib.md5(linje.encode("utf-8")).digest()[:8], "big")


def hurtigbuffer_navn(filer: list[tuple[int, str]]) -> str:
    """Bufferfil bestemt av NØYAKTIG hvilke filer som leses, og av innholdet.

    Nøkkelen tar med sti, størrelse og endringstidspunkt for hver fil. Vokser
    en skardfil mens generatoren kjører, endres størrelsen og bufferet
    forkastes. Uten den sjekken ville treningen kunnet lese et gammelt buffer
    og rapportere full suksess på et korpus som ikke lenger finnes – nøyaktig
    den klassen stille feil som resten av denne fila er skrevet for å unngå.
    """
    h = hashlib.md5()
    for kilde, f in filer:
        st = os.stat(f)
        h.update(f"{kilde}:{f}:{st.st_size}:{int(st.st_mtime)}|".encode("utf-8"))
    return os.path.join(BUFFERMAPPE, f"korpus-{h.hexdigest()[:16]}.npz")


def les(mapper: list[str], klipp: int = 0, bruk_buffer: bool = True):
    """Alle `*.jsonl` i `mapper` → (X, V, M, FRO, KILDE, SIG).

    KILDE er indeksen inn i `mapper`, så en kjøring kan velge sin egen
    delmengde uten at noe leses om igjen. SIG brukes til duplikatfjerning og
    til overlappsrapporten.

    MØNSTERET ER `*.jsonl`, IKKE `skard-*.jsonl`. Det sto `skard-*` før, og
    det var en stillegående datatapsfeil: `sd-spredt/` inneholder både
    `skard-*.jsonl` og `b-*.jsonl`, og b-filene er de STØRSTE – 152 000 av
    170 000 rader. Med `skard-*` ble de utelatt uten et eneste varsel, fordi
    «fant ingen filer»-vakten under er fornøyd så lenge ETT mønstertreff
    finnes i mappen. Treningen ville altså kjørt på en tredel av dataene og
    rapportert full suksess.
    """
    filer: list[tuple[int, str]] = []
    for i, mappe in enumerate(mapper):
        f = sorted(glob.glob(os.path.join(mappe, "*.jsonl")))
        if not f:
            raise SystemExit(f"Fant ingen *.jsonl i {mappe}")
        filer += [(i, x) for x in f]

    global TREKK_DIM
    buffer = hurtigbuffer_navn(filer)
    if bruk_buffer and os.path.exists(buffer):
        t0 = time.time()
        d = numpy.load(buffer)
        TREKK_DIM = int(d["X"].shape[1])
        print(
            f"Buffer: {d['X'].shape[0]} stillinger a {TREKK_DIM} trekk fra {buffer} "
            f"({time.time() - t0:.0f}s)",
            flush=True,
        )
        # Buffere fra foer fasene fantes har ingen STIKK: da teller ingen rad i noen fase.
        stikk = d["STIKK"] if "STIKK" in d.files else numpy.full(d["X"].shape[0], -1, dtype=numpy.int8)
        return d["X"], d["V"], d["M"], d["FRO"], d["KILDE"], d["SIG"], stikk

    t0 = time.time()
    tak = 0
    for _, f in filer:
        tak += tell_linjer(f)
    print(f"Teller {tak} linjer i {len(filer)} filer ({time.time() - t0:.0f}s)", flush=True)

    # BREDDEN AVGJOERES AV DATAENE, og den maa vaere ÉN. Blandes 273 og 340 i
    # samme trening, ville halvparten av radene blitt hoppet over i stillhet -
    # nettopp den fellen den hardkodede konstanten var.
    bredder: dict[int, int] = {}
    for _, f in filer:
        with open(f, "r", encoding="utf-8") as fh:
            for linje in fh:
                linje = linje.strip()
                if not linje:
                    continue
                try:
                    t = json.loads(linje).get("t")
                except json.JSONDecodeError:
                    continue
                if t:
                    bredder[len(t)] = bredder.get(len(t), 0) + 1
                    break
    if not bredder:
        raise SystemExit("Fant ingen lesbare rader med «t» i datamappene")
    # BLANDEDE BREDDER: forbudt som foer, MED ETT UNNTAK.
    #
    # Aa PADDE en smal rad opp til en bred bredde er en loegn: de manglende
    # blokkene ville staatt som nuller uten at nettet fikk vite at de MANGLER.
    # Det er grunnen til at denne sperren finnes, og den er riktig.
    #
    # Aa KLIPPE en bred rad ned til en smal er noe helt annet. Kodingene er
    # strengt prefiks-utvidende, og det er VERIFISERT 6. august over 1 043 424
    # sammenlikninger paa tvers av alle ti breddene: `e1SpillTrekk(s, i, bred)`
    # er bit-identisk med `e1SpillTrekk(s, i, smal)` paa de foerste `smal`
    # indeksene. En klippet rad er derfor ikke en tilnaerming - den er den
    # samme raden.
    #
    # Det laaser opp 2,41 millioner dyrt merkede rader (sd-nevro, sd-v4, v5,
    # v7, v8, v8b, v9, v10) som fram til naa ble FORKASTET I STILLHET av
    # `len(t) != TREKK_DIM` naar man trente paa 273 - der mesteren `d7alle`
    # bor. Etiketten er den dyre delen (30x trekkene), og den er uendret.
    if klipp:
        if klipp not in LOVLIGE_DIM:
            raise SystemExit(f"--klipp {klipp} er ikke en lovlig bredde: {LOVLIGE_DIM}")
        for b in bredder:
            if b < klipp:
                raise SystemExit(
                    f"--klipp {klipp}, men datasettet har rader paa {b}. "
                    "Aa PADDE opp er en loegn - bruk en lavere --klipp, eller "
                    "del settene."
                )
            # Bokrader (493) er ikke et kjedeprefiks: bare grunnen (273) kan klippes ut.
            if b in KORTBOK_DIM and klipp != 273:
                raise SystemExit(
                    f"--klipp {klipp} paa bokrader ({b}): kolonne 273 og utover er motstanderboka, "
                    "ikke kjedens blokker. Bare --klipp 273 er et prefiks."
                )
        TREKK_DIM = klipp
        print(f"KLIPPER til {TREKK_DIM}. Bredder funnet: {bredder}", flush=True)
    else:
        if len(bredder) > 1:
            raise SystemExit(
                f"BLANDEDE TREKKBREDDER i datasettet: {bredder}. "
                "273 (v1) og 340 (v2) kan ikke trenes sammen - de 273 foerste "
                "indeksene betyr riktignok det samme, men resten ville vaert "
                "nuller uten at nettet fikk vite at de MANGLER. Del settene, "
                "eller bruk --klipp <bredde> for aa KLIPPE ned til en felles."
            )
        TREKK_DIM = next(iter(bredder))
    if TREKK_DIM not in LOVLIGE_DIM and TREKK_DIM not in KORTBOK_DIM:
        raise SystemExit(f"Ukjent trekkbredde {TREKK_DIM}, forventet en av {LOVLIGE_DIM} eller bokbredden {KORTBOK_DIM}")
    # .get, ikke [], og med 364 med: oppslaget ville ellers kastet KeyError
    # ETTER at hele datasettet er lest inn - altsaa minutter kastet bort paa en
    # manglende ordbokoppfoering. Nettopp den klassen feil (hardkodet bredde)
    # er kommentert som «stum felle» over.
    navn_dim = {273: "v1", 340: "v2 minneblokk", 356: "v3 telleblokk", 364: "v4 auksjonsblokk", 376: "v5 planblokk", 428: "v6 troblokk", 458: "v7 verdiblokk", 470: "v8 doedeblokk", 558: "v9 sanseblokk", 714: "v10 hvem-la-hva", 493: "bok: 273 | hukommelse | stilling | valgt bort"}.get(
        TREKK_DIM, "ukjent"
    )
    print(f"Trekkbredde: {TREKK_DIM} ({navn_dim})", flush=True)

    X = numpy.zeros((tak, TREKK_DIM), dtype=numpy.float32)
    V = numpy.zeros((tak, KORT), dtype=numpy.float32)
    M = numpy.zeros((tak, KORT), dtype=numpy.float32)
    FRO = numpy.zeros(tak, dtype=numpy.int64)
    KILDE = numpy.zeros(tak, dtype=numpy.int8)
    SIG = numpy.zeros(tak, dtype=numpy.uint64)
    # Stikk spilt foer beslutningen (kort-data `stikk`), -1 der raden ikke har feltet.
    STIKK = numpy.full(tak, -1, dtype=numpy.int8)

    sett: set[int] = set()
    klippet = 0
    n = 0
    dublett = 0
    ugyldig = 0
    for kilde, fil in filer:
        foer = n
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                linje = linje.strip()
                if not linje:
                    continue
                s = sig64(linje)
                if s in sett:
                    dublett += 1
                    continue
                try:
                    r = json.loads(linje)
                except json.JSONDecodeError:
                    ugyldig += 1  # siste linje kan være halvskrevet
                    continue
                t = r.get("t")
                v = r.get("v")
                if not t or not v or len(t) < TREKK_DIM:
                    ugyldig += 1
                    continue
                if len(t) != TREKK_DIM:
                    # Bare naar --klipp er satt kan dette skje; breddesjekken
                    # over har allerede avvist alt annet.
                    t = t[:TREKK_DIM]
                    klippet += 1
                if len(v) < 2:
                    ugyldig += 1
                    continue
                sett.add(s)
                # RADENE KAN VÆRE FLERE ENN TELLINGEN FANT. Skardene skriver
                # fortsatt mens treningen leser, så filene vokser mellom
                # `tell_linjer` og denne løkken. Uten dette blir det en
                # IndexError etter flere minutters innlesing – eller, om noen
                # «fikser» det med en break, stille tap av de nyeste radene.
                if n >= X.shape[0]:
                    ny = int(X.shape[0] * 1.2) + 4096
                    print(f"  (utvider {X.shape[0]} → {ny} rader; filene vokser)", flush=True)
                    X, V, M, FRO, KILDE, SIG, STIKK = (voks(a, ny) for a in (X, V, M, FRO, KILDE, SIG, STIKK))
                X[n] = t
                for k, val in v.items():
                    i = int(k)
                    V[n, i] = val
                    M[n, i] = 1.0
                FRO[n] = r["frø"]
                KILDE[n] = kilde
                SIG[n] = s
                st = r.get("stikk")
                STIKK[n] = st if isinstance(st, int) and 0 <= st < 128 else -1
                n += 1
        print(f"  {fil}: {n - foer} stillinger (totalt {n})", flush=True)

    print(
        f"Leste {n} stillinger, hoppet over {dublett} dubletter og {ugyldig} ugyldige"
        + (f", KLIPPET {klippet} bredere rader ned til {TREKK_DIM}" if klippet else "")
        + f" ({time.time() - t0:.0f}s)",
        flush=True,
    )
    ut = (X[:n], V[:n], M[:n], FRO[:n], KILDE[:n], SIG[:n], STIKK[:n])
    # SKRIV BUFFERET. JSON-parsing av et millionkorpus tar minutter og gjentas
    # for hver arm, hver ablasjon og hver replikering. Det er den storste
    # enkeltkostnaden i treningen og den eneste som er ren sloesing.
    if not bruk_buffer:
        return ut
    try:
        os.makedirs(BUFFERMAPPE, exist_ok=True)
        numpy.savez(
            buffer, X=ut[0], V=ut[1], M=ut[2], FRO=ut[3], KILDE=ut[4], SIG=ut[5], STIKK=ut[6]
        )
        print(f"Buffer skrevet: {buffer}", flush=True)
    except OSError as e:
        print(f"  (kunne ikke skrive buffer: {e})", flush=True)
    return ut


def er_holdout(froe: int, hfroe: int, andel: float) -> bool:
    """Holdout-regelen, ETT sted. Hashen tas av (holdoutfrø, partifrø), så
    avgjørelsen for ett parti er uavhengig av hvilke andre partier som finnes –
    delingen blir da den samme enten den regnes under trening eller senere når
    holdouten skal skrives ut som en målebenk. Hadde regelen vært «de siste 5 %»
    eller «hver 20. unike frø», ville de to passene kunnet gi ulike svar."""
    h = hashlib.md5(f"{hfroe}:{froe}".encode("utf-8")).digest()[:4]
    return int.from_bytes(h, "big") < int(andel * (1 << 32))


def dump_holdout(mappe: str, ut: str, hfroe: int, andel: float) -> None:
    """Skriv holdout-linjene ut som en egen benkemappe.

    Poenget er å kunne kjøre `examples/e1-frysmaal.ts` på nøyaktig de samme
    stillingene treneren holdt utenfor. Da får holdouten GULV (uniformt lovlig
    valg) og TAK (NevroHjerne) målt på samme utvalg, som målekontrakten i
    docs/moe2.md krever – noe denne treneren ikke kan gjøre selv, fordi
    NevroHjerne ikke finnes på Python-siden.

    Linjene kopieres RÅTT. Ingen parsing, ingen reserialisering: en linje som
    endrer seg på veien er ikke lenger den samme stillingen, og md5-signaturene
    ville sluttet å stemme med treningssettets.
    """
    import re

    os.makedirs(ut, exist_ok=True)
    monster = re.compile(r'"frø":(\d+)')
    n = 0
    for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
        beholdt = []
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                m = monster.search(linje)
                if m is None:
                    continue
                if er_holdout(int(m.group(1)), hfroe, andel):
                    beholdt.append(linje if linje.endswith("\n") else linje + "\n")
        with open(os.path.join(ut, os.path.basename(fil)), "w", encoding="utf-8") as f:
            f.writelines(beholdt)
        n += len(beholdt)
        print(f"  {fil}: {len(beholdt)} holdout-linjer", flush=True)
    print(f"Skrev {n} holdout-stillinger til {ut}/", flush=True)


def signaturer(mappe: str) -> set:
    """Linjesignaturene i en mappe – for overlappsrapporten mot benker."""
    ut = set()
    for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                linje = linje.strip()
                if linje:
                    ut.add(sig64(linje))
    return ut


def froe_i(mappe: str) -> set:
    """Frøene i en mappe. Frø = parti; to stillinger med samme frø deler hender."""
    ut = set()
    for fil in sorted(glob.glob(os.path.join(mappe, "skard-*.jsonl"))):
        with open(fil, "r", encoding="utf-8") as f:
            for linje in f:
                linje = linje.strip()
                if not linje:
                    continue
                try:
                    ut.add(json.loads(linje)["frø"])
                except (json.JSONDecodeError, KeyError):
                    pass
    return ut


# --- Nett, tap og mål (identisk med e1-tren.py) -----------------------------


class E1Nett(nn.Module):
    """MLP, ReLU på alle lag unntatt det siste – samme form appens loader forventer.

    DROPOUT er KUN aktiv under trening og er en ren identitet i eval-modus, så
    eksportformatet er uroert – `skriv_vekter` ser de samme tette lagene.

    Den finnes fordi 441 ekstra innganger paa 292k rader overtilpasser dobbelt
    saa fort som kjernen alene: gapet mellom tren- og holdout-tap vokste
    +0,025 mot +0,013 ved epoke 12. BEN-foredraget (PyData Berlin 2018) sier
    det rett ut: «Overfitting was a huge problem (dropout worked best)».
    """

    def __init__(self, dims: list[int], dropout: float = 0.0):
        super().__init__()
        self.lag = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])
        self.dropout = nn.Dropout(dropout) if dropout > 0 else None

    def forward(self, x):
        for i, l in enumerate(self.lag):
            x = l(x)
            # Dropout MELLOM lagene, ikke paa utgangen: det siste laget er
            # logitene, og aa slippe dem tilfeldig ville vaert stoey paa fasiten.
            if self.dropout is not None and i < len(self.lag) - 1:
                x = self.dropout(x)
            if i < len(self.lag) - 1:
                x = F.relu(x)
        return x


def maskert_tap(logits, verdi, maske, tau: float, vekt=None):
    """Myk kryssentropi mot softmax(v/τ), begge maskert til lovlige kort."""
    stor_negativ = torch.finfo(logits.dtype).min
    logits = logits.masked_fill(maske == 0, stor_negativ)
    maal = (verdi / tau).masked_fill(maske == 0, stor_negativ)
    maal = F.softmax(maal, dim=1)
    logp = F.log_softmax(logits, dim=1)
    per = -(maal * logp).sum(dim=1)
    if vekt is None:
        return per.mean()
    return (per * vekt).sum() / vekt.sum().clamp(min=1e-6)


def stillingsvekt(verdi, maske, tak: float = 8.0):
    """Vekt = spennet mellom beste og verste lovlige kort, klippet."""
    stor_negativ = torch.finfo(verdi.dtype).min
    beste = verdi.masked_fill(maske == 0, stor_negativ).max(dim=1).values
    verst = verdi.masked_fill(maske == 0, -stor_negativ).min(dim=1).values
    return (beste - verst).clamp(min=0.0, max=tak) + 0.05


def rolle_av(X):
    """0 = spillefører, 1 = makker, 2 = forsvar. Utledet av trekkene.

    Indeks 208 er «budvinneren er meg» (relativ koding, r=0), 227 er «jeg er på
    budvinnerens side». Kontrakten står i src/nevro/trekk.ts.
    """
    er_forer = X[:, 208] > 0.5
    pa_laget = X[:, 227] > 0.5
    return torch.where(er_forer, 0, torch.where(pa_laget, 1, 2))


def rollebalanser(vekt, rolle):
    """Skalerer vekten så HVER ROLLE bidrar proporsjonalt med sin radandel.

    MÅLT PÅ sd-v3 (112 894 rader) FØR denne fantes:

        rolle          andel rader    andel VEKT   vekt/rad
        spillefører        28,2 %        44,3 %      3,223
        makker             22,5 %         8,2 %      0,744
        forsvar            49,4 %        47,5 %      1,971

    `stillingsvekt` er spennet mellom beste og verste lovlige kort. Makkerens
    valg har lite spenn, så treneren forteller nettet at makkerstillinger
    knapt betyr noe – de får 8,2 % av vekten for 22,5 % av radene.

    OG MAKKER ER DET STØRSTE MÅLTE HULLET: −0,22 mot MesterAI, mot forsvarets
    −0,12 som får 47,5 % av vekten. Vekten er feilfordelt i forhold til hvor
    poengene faktisk tapes. Rollens `fanget` er også lavest av alle: 0,262 mot
    spillefører 0,432 (`verktoy/forsvarsprofil.py`).

    ARGUMENTET FOR DEN GAMLE VEKTEN STÅR LIKEVEL: er spennet lite, er det lite
    å hente per beslutning, og kapasitet brukt der er kapasitet tatt fra
    spillefører. Derfor er dette et FLAGG og ikke en ny standard – gate 2
    avgjør, som alt annet.
    """
    ut = vekt.clone()
    for r in (0, 1, 2):
        m = rolle == r
        n = int(m.sum())
        if n == 0:
            continue
        # Mål: samme snittvekt i hver rolle, med det globale snittet bevart,
        # så det samlede tapsnivået (og dermed lærings­raten) ikke flyttes.
        ut[m] = vekt[m] / vekt[m].mean() * vekt.mean()
    return ut


@torch.no_grad()
def maal_i_biter(modell, X, V, M, tau: float, idx, batch: int = 65536):
    """Uvektet tap, treffrate og anger over `idx` – i biter, så 3 mill. rader
    ikke krever et 3 mill. × 52 logit-tensor på GPU-en samtidig."""
    stor_negativ = torch.finfo(torch.float32).min
    sum_tap = 0.0
    sum_treff = 0.0
    sum_anger = 0.0
    n = idx.numel()
    for i in range(0, n, batch):
        j = idx[i : i + batch]
        logits = modell(X[j])
        v, m = V[j], M[j]
        sum_tap += maskert_tap(logits, v, m, tau).item() * j.numel()
        valgt = logits.masked_fill(m == 0, stor_negativ).argmax(dim=1)
        best = v.masked_fill(m == 0, stor_negativ).max(dim=1).values
        fikk = v.gather(1, valgt.unsqueeze(1)).squeeze(1)
        sum_treff += (fikk >= best - 1e-6).float().sum().item()
        sum_anger += (best - fikk).sum().item()
    return sum_tap / n, sum_treff / n, sum_anger / n


def skriv_vekter(sti: str, modell: E1Nett) -> None:
    """Appens format: antall nett, per nett antall lag, per lag inn/ut/vekter/bias."""
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "wb") as f:
        f.write(struct.pack("<i", 1))
        f.write(struct.pack("<i", len(modell.lag)))
        for l in modell.lag:
            f.write(struct.pack("<ii", l.in_features, l.out_features))
            f.write(l.weight.detach().cpu().float().numpy().astype("<f4").tobytes())
            f.write(l.bias.detach().cpu().float().numpy().astype("<f4").tobytes())



def les_vekter(sti: str):
    """Inversen av `skriv_vekter`: appens format -> liste av (W, b) som numpy.

    FINJUSTERING ER GRUNNEN TIL AT DEN FINNES. Maalt 2026-08-03: sd-r2 er trent
    paa 4 824 794 stillinger, mens alt vi rakk aa generere paa ett doegn er
    410 645 - 8,5 %. Seks nett trent fra bunnen paa den mengden strauk gate 2
    med -0,35 til -0,69, uansett trekkbredde, arkitektur, froe og
    rollout-policy. Datamengden var flaskehalsen, ikke designet.

    Aa generere 4,4 mill. rader til tar ~19 timer. Men sd-r2 HAR allerede de
    4,8 millionene bakt inn i vektene sine. Starter vi derfra og lar de nye
    radene JUSTERE dem, arver vi hele det gamle datagrunnlaget gratis - og de
    nye radene faar bidra med det de er gode for: spredte kontrakter, DAgger-
    stillinger og riktig rollout-policy.

    Det er en annen operasjon enn aa trene fra bunnen, og den kan feile paa sin
    egen maate: for hoey laeringsrate glemmer det gamle («catastrophic
    forgetting»). Derfor er --startlr satt lavt som standard, og resultatet maa
    gjennom gate 2 som alt annet.
    """
    with open(sti, "rb") as f:
        antall_nett = struct.unpack("<i", f.read(4))[0]
        if antall_nett != 1:
            raise SystemExit(f"{sti}: forventet 1 nett, fant {antall_nett}")
        n_lag = struct.unpack("<i", f.read(4))[0]
        lag = []
        for _ in range(n_lag):
            inn, ut = struct.unpack("<ii", f.read(8))
            W = numpy.frombuffer(f.read(inn * ut * 4), dtype="<f4").reshape(ut, inn).copy()
            b = numpy.frombuffer(f.read(ut * 4), dtype="<f4").copy()
            lag.append((W, b))
        rest = f.read()
        if rest:
            raise SystemExit(f"{sti}: {len(rest)} byte til overs - feil format?")
    return lag


# --- Hovedløkke -------------------------------------------------------------


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="sd-data,sd-data2", help="alle mapper som skal leses inn")
    p.add_argument(
        "--holdoutmappe",
        # None, ikke "sd-data2": `--vekter` tar da foerste --data-mappe. Uten --vekter settes
        # den til "sd-data2" rett etter parse_args, som foer.
        default=None,
        help="holdouten trekkes BARE herfra, så kandidater som ikke har sett denne mappen "
        "(f.eks. sd-r1) kan måles på nøyaktig samme utvalg",
    )
    p.add_argument("--holdoutandel", type=float, default=0.05, help="andel GIVER i holdout")
    p.add_argument("--holdoutfroe", type=int, default=20260726, help="frø for giv-delingen")
    p.add_argument(
        "--kjor",
        action="append",
        default=[],
        help="«navn:mappe[,mappe]:skjult[,skjult]» – én treningskjøring. Kan gjentas.",
    )
    p.add_argument(
        "--klipp",
        type=int,
        default=0,
        help=(
            "Tren paa bredde N ved aa KLIPPE bredere rader ned til N. Uten "
            "flagget avvises blandede bredder, som foer."
        ),
    )
    p.add_argument("--utmappe", default="e1-modell")
    p.add_argument("--logg", default="analyse/sd-r2-tren.jsonl")
    p.add_argument("--epoker", type=int, default=40)
    p.add_argument("--batch", type=int, default=1024)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--wd", type=float, default=0.0)
    p.add_argument("--dropout", type=float, default=0.0, help="dropout mellom lagene under trening")
    p.add_argument("--taal", type=int, default=6)
    p.add_argument("--tau", type=float, default=1.0)
    p.add_argument("--tremaal", type=int, default=200000, help="rader treningstapet måles på")
    p.add_argument(
        "--start",
        default="",
        help="FINJUSTER fra en eksisterende vektfil i stedet for tilfeldig start. "
        "sd-r2 har 4,8 mill. stillinger bakt inn i vektene; de nye radene faar da "
        "JUSTERE dem i stedet for aa konkurrere med dem fra bunnen.",
    )
    p.add_argument(
        "--startlr",
        type=float,
        default=1e-4,
        help="laeringsrate naar --start brukes. Lav med vilje: for hoey rate "
        "glemmer nettet det gamle datagrunnlaget (catastrophic forgetting), og "
        "da er finjusteringen bare en daarlig omtrening.",
    )
    p.add_argument(
        "--laerroller",
        default="",
        help="ROLLESTYRT DESTILLASJON: bare rader i disse rollene (foerer,makker,"
        "forsvar) laerer av orakelets etiketter. Alle andre rader faar STARTNETTETS "
        "EGNE valg som maal - et anker, ikke en laerer. Krever --start.",
    )
    p.add_argument(
        "--rollebalanse",
        action="store_true",
        help="skaler stillingsvekten saa hver ROLLE bidrar proporsjonalt med sin "
        "radandel. Uten den faar makker 8,2 %% av vekten for 22,5 %% av radene, "
        "fordi makkervalg har lite spenn - og makker er det stoerste maalte hullet.",
    )
    p.add_argument(
        "--nyepoker",
        type=int,
        default=0,
        help="epoker der BARE de nye inngangskolonnene trenes, med resten frosset. "
        "Nullstilte kolonner starter paa 0 og maa naa skalaen resten av nettet "
        "ligger paa; ved startlr rekker de ikke fram foer tidlig stopp slaar inn.",
    )
    p.add_argument(
        "--nylr",
        type=float,
        default=1e-3,
        help="laeringsrate under oppvarmingen. Kan vaere hoey uten fare: alt annet "
        "enn de nye kolonnene er frosset, saa nettet KAN ikke glemme noe.",
    )
    p.add_argument(
        "--initfroe",
        type=int,
        default=1,
        help="frø for VEKTINITIALISERINGEN, nullstilt før hver modell. Var useedet "
        "til 2026-08-03, slik at armene i en ablasjon skilte seg på startvekter "
        "i tillegg til det som skulle måles. Kjør samme ablasjon på flere frø "
        "for å skille effekt fra initialiseringsflaks.",
    )
    p.add_argument(
        "--overlappmot",
        default="",
        help="mapper det skal rapporteres overlapp mot (f.eks. e1-frys,sd-frys)",
    )
    p.add_argument(
        "--dumpholdout",
        default="",
        help="skriv holdout-linjene til denne mappen og avslutt (rask vei, ingen parsing)",
    )
    # ============ KORTNETTET I ADAMS MAX-LOEKKA (11. sep) ============================
    #
    # `--vekter` er ÉN kjoering uten `--kjor`: finjuster forrige iterasjons kortnett paa
    # soekets etiketter (`examples/kort-data.ts`) og avslutt med linjene loekka doemmer
    # etter, BAKERST (tidlige linjer forsvinner i WSL-roeret):
    #
    #     MODELL-ANGER-HOLDOUT x    angeren til nettet som ble skrevet til --ut
    #     POLICY-ANGER-HOLDOUT y    angeren til --policy (standard --vekter) paa SAMME holdout
    #
    # EPOKE 0 ER ET SJEKKPUNKT. Startvektene skrives til --ut foer foerste epoke, og en epoke
    # lagres bare om den er STRENGT bedre. Da er modell <= policy per konstruksjon naar
    # policyen er startnettet, og `modell < policy` i loekka betyr at treningen faktisk flyttet
    # nettet mot soeket. `--epoker 0` skriver startnettet byte for byte
    # (`test/kort-data.test.ts`). Uten --vekter er alt som foer.
    p.add_argument("--vekter", default="", help="ÉN kjoering: finjuster fra denne vektfila (appformat)")
    p.add_argument("--ut", default="", help="vektfila --vekter-kjoeringen skriver")
    p.add_argument("--policy", default="", help="referansenettet for POLICY-ANGER-HOLDOUT (standard --vekter)")
    p.add_argument("--enhet", default="", choices=["", "cpu", "cuda"], help="tving enhet (standard: cuda om mulig)")
    p.add_argument("--ingenbuffer", action="store_true", help="ikke les eller skriv npz-bufferet")
    p.add_argument("--minrader", type=int, default=1000, help="faerre leste rader stopper kjoeringen")
    args = p.parse_args()

    vekter_modus = bool(args.vekter)
    if vekter_modus:
        if args.kjor:
            raise SystemExit("--vekter er én kjoering; bruk --start med --kjor for flere")
        if not args.ut.endswith(".bin"):
            raise SystemExit("--vekter krever --ut <fil>.bin")
        if args.start:
            raise SystemExit("--vekter ER starten; ikke oppgi --start i tillegg")
        args.start = args.vekter
        args.policy = args.policy or args.vekter
        vekter_data = [m for m in args.data.split(",") if m]
        if args.holdoutmappe is None:
            args.holdoutmappe = vekter_data[0] if vekter_data else ""
        start_lag = les_vekter(args.vekter)
        skjult = ",".join(str(W.shape[0]) for W, _ in start_lag[:-1])
        args.utmappe = os.path.dirname(args.ut) or "."
        args.kjor = [f"{os.path.basename(args.ut)[:-4]}:{','.join(vekter_data)}:{skjult}"]
    elif args.holdoutmappe is None:
        args.holdoutmappe = "sd-data2"
    sluttlinjer: list[str] = []

    # Rask vei: bare skrive ut benken. Den skal kunne kjøres uten GPU og uten
    # å lese hele treningssettet på nytt.
    if args.dumpholdout and not args.kjor:
        dump_holdout(args.holdoutmappe, args.dumpholdout, args.holdoutfroe, args.holdoutandel)
        return

    enhet = args.enhet or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Enhet: {enhet}" + (f" ({torch.cuda.get_device_name(0)})" if enhet == "cuda" else ""))

    mapper = [m for m in args.data.split(",") if m]
    if args.holdoutmappe not in mapper:
        raise SystemExit(f"--holdoutmappe {args.holdoutmappe} er ikke blant --data {mapper}")

    # ALLE --kjor-MAPPER SJEKKES FOER INNLESINGEN, ikke etter.
    #
    # Uten dette gaar `mapper.index(m)` lenger nede paa en ValueError, og den
    # kommer FOERST etter at hele korpuset er lest inn. Maalt 4. august: 22
    # minutter for aa oppdage en skrivefeil paa fire tegn, fordi 18 av dem gikk
    # med til aa parse JSON som deretter ble kastet. En sjekk som kan gjoeres
    # paa ett sekund skal ikke koste tjueto minutter.
    for spek in args.kjor:
        deler = spek.split(":")
        if len(deler) < 3:
            raise SystemExit(f"Ugyldig --kjor «{spek}»: forventet navn:mapper:skjult[…]")
        for m in (x for x in deler[1].split(",") if x):
            if m not in mapper:
                raise SystemExit(
                    f"--kjor «{spek}» viser til mappen «{m}», som ikke er i "
                    f"--data {mapper}. Legg den til i --data."
                )

    X, V, M, FRO, KILDE, SIG, STIKK = les(mapper, args.klipp, not args.ingenbuffer)
    n = X.shape[0]
    if n < args.minrader:
        raise SystemExit(f"For lite data ({n} stillinger)")

    # --- OVERLAPPSRAPPORT ---------------------------------------------------
    # Rapporteres eksplisitt også når den er null. Å ikke se etter er ikke det
    # samme som at det ikke finnes, og dette prosjektet har allerede betalt for
    # den forskjellen én gang.
    rapport: dict = {"mapper": {}, "overlapp": {}, "froebaand": {}}
    for i, m in enumerate(mapper):
        idx = KILDE == i
        rapport["mapper"][m] = {
            "stillinger": int(idx.sum()),
            "givere": int(len(numpy.unique(FRO[idx]))),
        }
        rapport["froebaand"][m] = [int(FRO[idx].min()), int(FRO[idx].max())]
    for i in range(len(mapper)):
        for j in range(i + 1, len(mapper)):
            a, b = KILDE == i, KILDE == j
            felles_froe = numpy.intersect1d(FRO[a], FRO[b])
            felles_sig = numpy.intersect1d(SIG[a], SIG[b])
            rapport["overlapp"][f"{mapper[i]} ∩ {mapper[j]}"] = {
                "givere": int(len(felles_froe)),
                "linjer": int(len(felles_sig)),
            }
    for benk in [m for m in args.overlappmot.split(",") if m]:
        if not os.path.isdir(benk):
            rapport["overlapp"][f"data ∩ {benk}"] = "mappen finnes ikke"
            continue
        bs, bf = signaturer(benk), froe_i(benk)
        for i, m in enumerate(mapper):
            idx = KILDE == i
            rapport["overlapp"][f"{m} ∩ {benk}"] = {
                "givere": len(bf & set(FRO[idx].tolist())),
                "linjer": len(bs & set(SIG[idx].tolist())),
            }
    print("\n=== OVERLAPP ===")
    print(json.dumps(rapport, ensure_ascii=False, indent=2))

    # --- GIV-DELING ---------------------------------------------------------
    # Regelen ligger i `er_holdout` – ett sted, så treningen og benkeutskriften
    # ikke kan komme til å dele ulikt.
    hm = mapper.index(args.holdoutmappe)
    kandidatfroe = numpy.unique(FRO[KILDE == hm])
    hold_froe = {f for f in kandidatfroe.tolist() if er_holdout(f, args.holdoutfroe, args.holdoutandel)}
    er_hold = numpy.isin(FRO, numpy.fromiter(hold_froe, dtype=numpy.int64, count=len(hold_froe)))
    # Bare holdoutmappens rader kan være holdout; en annen mappe med samme frø
    # ville vært en lekkasje uansett, og den er allerede rapportert over.
    er_hold &= KILDE == hm
    hold_idx_np = numpy.flatnonzero(er_hold)

    # SAMME GIV I EN ANNEN MAPPE ER LEKKASJE, og den må kastes ut av
    # treningen – ikke flyttes inn i holdouten.
    #
    # Generatorene kjører på frøbånd som kan overlappe: sd-spredt spenner
    # 80–91 mill. og sd-dagger 85–98 mill., med 58 givere felles. En giv som
    # havner i holdouten via sd-spredt ligger da også i sd-daggers
    # treningsrader, og holdout-tapet ville målt på stillinger nettet har
    # sett. Alternativet – å la dem bli holdout også – er utelukket med vilje:
    # holdouten skal være NØYAKTIG det samme utvalget for kandidater som ikke
    # har sett alle mappene, ellers er to målinger ikke sammenlignbare.
    hold_arr = numpy.fromiter(hold_froe, dtype=numpy.int64, count=len(hold_froe))
    lekk = numpy.isin(FRO, hold_arr) & (KILDE != hm)
    if lekk.any():
        tapt = {}
        for i, m in enumerate(mapper):
            c = int((lekk & (KILDE == i)).sum())
            if c:
                tapt[m] = c
        print(
            f"\nLEKKASJE LUKET: {int(lekk.sum())} treningsrader kastet fordi giva "
            f"ligger i holdouten via {args.holdoutmappe} – {tapt}"
        )
        rapport["lekkasje_luket"] = {"rader": int(lekk.sum()), "per_mappe": tapt}

    # INVARIANTEN: ingen giver i to deler. Sjekkes, ikke antas.
    tren_froe = set(FRO[~er_hold & ~lekk].tolist())
    krysning = hold_froe & tren_froe
    if krysning:
        raise SystemExit(
            f"GIV-LEKKASJE: {len(krysning)} frø ligger i både trening og holdout "
            f"(f.eks. {sorted(krysning)[:5]}). Avbryter."
        )
    print(
        f"\nGiv-deling: {len(hold_froe)} av {len(kandidatfroe)} givere i {args.holdoutmappe} "
        f"→ holdout ({len(hold_idx_np)} stillinger). Ingen giver i to deler."
    )
    rapport["holdout"] = {
        "mappe": args.holdoutmappe,
        "givere": len(hold_froe),
        "givere_totalt": int(len(kandidatfroe)),
        "stillinger": int(len(hold_idx_np)),
        "andel": args.holdoutandel,
        "froe": args.holdoutfroe,
        "krysning": 0,
    }

    # --- På GPU én gang -----------------------------------------------------
    Xg = torch.from_numpy(X).to(enhet)
    Vg = torch.from_numpy(V).to(enhet)
    Mg = torch.from_numpy(M).to(enhet)
    del X, V, M
    hold_idx = torch.from_numpy(hold_idx_np).to(enhet)
    # Holdoutradene per fase (FASER, etter stikk spilt). En tom fase gir nan i sluttlinjene, ikke en krasj.
    fase_idx = {}
    for fnavn, fa, fb in FASER:
        st = STIKK[hold_idx_np]
        fase_idx[fnavn] = torch.from_numpy(hold_idx_np[(st >= fa) & (st <= fb)]).to(enhet)

    os.makedirs(os.path.dirname(args.logg) or ".", exist_ok=True)
    logg = open(args.logg, "a", encoding="utf-8", buffering=1)
    logg.write(json.dumps({"type": "overlapp", "tid": time.strftime("%Y-%m-%d %H:%M:%S"), **rapport}, ensure_ascii=False) + "\n")

    for spek in args.kjor:
        # VALGFRITT FJERDE LEDD: «navn:mapper:skjult:bredde» kutter trekkene til
        # de første `bredde` kolonnene.
        #
        # Dette er ablasjonen som isolerer minneblokken. Indeks 0-272 i v2 er
        # BIT-IDENTISKE med v1 (se src/e1/trekk.ts), så «:273» gir nøyaktig et
        # v1-nett trent på nøyaktig de samme radene og samme holdout.
        #
        # RETTELSE 2026-08-03. Her sto det tidligere «og samme initialisering.
        # Forskjellen mellom de to kjøringene kan da bare komme fra de 67
        # minnetrekkene – ikke fra data, splitt eller flaks.» Det var USANT:
        # vektene ble aldri seedet. `E1Nett(dims)` trakk fra den globale
        # RNG-tilstanden, som flyttet seg mellom kjøringene, så armene skilte
        # seg på initialisering I TILLEGG til trekkbredde – og vi kjørte n=1
        # av hver.
        #
        # Konklusjonen «minneblokken er skadelig» (−0,27 i spill) hvilte på
        # den påstanden og er derfor IKKE belagt. Arvind fant feilen ved å
        # nekte å godta at strengt mer informasjon kan gjøre et nett dårligere.
        #
        # `--initfroe` nullstiller nå frøet før HVER modell, så to armer i
        # samme kjøring trekker fra samme tilstand. Det fjerner drift mellom
        # armene, men ikke variansen mellom FRØ: ulike former kan ikke få
        # identiske vekter. Skal en arkitektur- eller trekkforskjell avgjøres,
        # må ablasjonen kjøres på flere `--initfroe` og fordelingene
        # sammenliknes.
        # VALGFRITT FEMTE LEDD: «…:bredde:a-b» NULLSTILLER kolonne a til og med
        # b, uten å endre bredden.
        #
        # HVORFOR DET IKKE HOLDER Å KUTTE. `:bredde` tar et PREFIKS. Trekkene
        # ligger i lag: v1 er 0-272, minneblokken 273-339, telleblokken
        # 340-355. Vil vi måle telleblokken ALENE, finnes det ikke noe prefiks
        # som gir den – den ligger bakerst, bak 67 minnekolonner.
        #
        # Det ble oppdaget 2026-08-03: ftf1.bin, nettet som faktisk spiller,
        # er 273 bredt. Minneblokken er aldri tatt i bruk. En «--start» til
        # 356 legger derfor på 83 nye kolonner, ikke 16, og en gate 2 på den
        # ville målt minneblokk OG telleblokk som én pakke. Passerer den, vet
        # vi ikke hvilken halvdel som virket; stryker den, vet vi ikke hvilken
        # som skadet. Maskering gjør de to skillbare.
        # Flere soner skilles med «+»: «277-328+340-355» nullstiller begge.
        # Trengs fordi blokkene ligger i lag og det som skal isoleres ikke
        # alltid er sammenhengende - f.eks. «minneblokken UTEN de 52
        # en-av-kolonnene, og uten telleblokken».
        nullsone = None
        deler = spek.split(":")
        if len(deler) == 5:
            *deler, sone = deler
            nullsone = []
            for bit in sone.split("+"):
                a, _, b2 = bit.partition("-")
                nullsone.append((int(a), int(b2)))
        if len(deler) == 3:
            navn, mix, skjult = deler
            bredde = TREKK_DIM
        elif len(deler) == 4:
            navn, mix, skjult, b = deler
            bredde = int(b)
            if bredde > TREKK_DIM:
                raise SystemExit(f"{navn}: bredde {bredde} > trekkbredden {TREKK_DIM}")
        else:
            raise SystemExit(
                f"Ugyldig --kjor «{spek}»: forventet navn:mapper:skjult[:bredde[:a-b]]"
            )
        for a, b2 in nullsone or []:
            if b2 >= bredde or a > b2:
                raise SystemExit(f"{navn}: nullsone {a}-{b2} er ugyldig for bredden {bredde}")
        mix_mapper = [m for m in mix.split(",") if m]
        mix_idx = [mapper.index(m) for m in mix_mapper]
        tren_maske = numpy.isin(KILDE, numpy.array(mix_idx, dtype=numpy.int8)) & ~er_hold & ~lekk
        tren_idx = torch.from_numpy(numpy.flatnonzero(tren_maske)).to(enhet)
        # Utsnitt, ikke kopi – Xg ligger allerede på GPU-en og er flere hundre MB.
        Xk = Xg if bredde == TREKK_DIM else Xg[:, :bredde]
        if nullsone is not None:
            # KOPI, ikke utsnitt. Å nulle inn i Xg ville stjålet kolonnene fra
            # armene som kommer etter i samme kjøring – stille, og først synlig
            # som et uforklarlig dårlig nett.
            Xk = Xk.clone()
            for a, b2 in nullsone:
                Xk[:, a : b2 + 1] = 0
            vist = ", ".join(f"{a}-{b2} ({b2 - a + 1} trekk)" for a, b2 in nullsone)
            print(f"  nullstiller kolonne {vist} i en KOPI av dataen", flush=True)
        dims = [bredde] + [int(x) for x in skjult.split(",")] + [KORT]
        # Nullstilles FØR hver modell, ikke én gang for hele kjøringen: ellers
        # arver arm nr. 2 en RNG-tilstand som arm nr. 1 har flyttet på.
        torch.manual_seed(args.initfroe)
        if enhet == "cuda":
            torch.cuda.manual_seed_all(args.initfroe)
        modell = E1Nett(dims, args.dropout).to(enhet)
        if args.start:
            # Formene maa stemme, med ÉN tillatt avvikelse: FOERSTE lag kan
            # vaere BREDERE enn startvekten. Alt annet avvises.
            #
            # HVORFOR DEN AVVIKELSEN FINNES. Telleblokken (v3, 340-355) gir
            # nettet informasjon det aldri har hatt: hvem som spilte hvilke
            # farger. Aa legge til trekk betyr normalt aa trene fra bunnen -
            # og seks nett trent fra bunnen paa 410k rader strauk gate 2 med
            # -0,35 til -0,69, fordi sd-r2 har 4,8 millioner stillinger i
            # vektene sine.
            #
            # Med NULLSTILTE nye kolonner starter nettet noeyaktig der
            # startvekten er: de nye trekkene ganges med 0 og kan ikke endre
            # ett eneste kortvalg. Nettet arver hele det gamle datagrunnlaget
            # og kan bare vinne paa aa ta den nye informasjonen i bruk.
            #
            # DE OEVRIGE LAGENE MAA STEMME EKSAKT. En stille delvis lasting
            # der ville gitt et halvt tilfeldig nett som saa ferdigtrent ut.
            start_lag = les_vekter(args.start)
            if len(start_lag) != len(modell.lag):
                raise SystemExit(
                    f"{args.start} har {len(start_lag)} lag, {navn} har {len(modell.lag)}"
                )
            for i, (W, b) in enumerate(start_lag):
                mål = tuple(modell.lag[i].weight.shape)
                if mål != W.shape:
                    utvider = i == 0 and mål[0] == W.shape[0] and mål[1] > W.shape[1]
                    if utvider and not prefiks_lovlig(W.shape[1], mål[1]):
                        raise SystemExit(
                            f"{args.start} tar {W.shape[1]} trekk, men de {W.shape[1]} foerste kolonnene i "
                            f"{TREKK_DIM}-radene er ikke et prefiks av dem (bokbredden: bare 273). "
                            "Nullutvidelsen ville lagt nettets vekter paa trekk som betyr noe annet."
                        )
                    if not utvider:
                        raise SystemExit(
                            f"{args.start} lag {i} er {W.shape}, {navn} venter {mål}. "
                            "Bare FOERSTE lag kan utvides, og bare i bredden."
                        )
                    nye = mål[1] - W.shape[1]
                    W = numpy.concatenate([W, numpy.zeros((W.shape[0], nye), dtype=W.dtype)], axis=1)
                    print(
                        f"  utvider inngangen {mål[1] - nye} → {mål[1]}: "
                        f"{nye} nye kolonner NULLSTILT, saa nettet starter identisk",
                        flush=True,
                    )
                with torch.no_grad():
                    modell.lag[i].weight.copy_(torch.from_numpy(W))
                    modell.lag[i].bias.copy_(torch.from_numpy(b))
            print(f"  finjusterer fra {args.start} (lr {args.startlr})", flush=True)
        antall = sum(q.numel() for q in modell.parameters())
        ut = os.path.join(args.utmappe, f"{navn}.bin")
        print(
            f"\n=== {navn}: {'+'.join(mix_mapper)}, {' → '.join(str(d) for d in dims)} "
            f"({antall} parametre) – trening {tren_idx.numel()}, holdout {hold_idx.numel()} ==="
        )
        logg.write(
            json.dumps(
                {
                    "type": "start",
                    "navn": navn,
                    "mix": mix_mapper,
                    "dims": dims,
                    "parametre": antall,
                    "trening": int(tren_idx.numel()),
                    "holdout": int(hold_idx.numel()),
                    "tid": time.strftime("%Y-%m-%d %H:%M:%S"),
                },
                ensure_ascii=False,
            )
            + "\n"
        )

        # --- ROLLESTYRT DESTILLASJON ------------------------------------------
        #
        # MAALT 3./4. august med `ork:`-benken, orakelet mot nettet per rolle:
        #
        #     spillefoerer  +1,656 (24 verdener)
        #     makker        +0,009
        #     forsvar       -0,130
        #
        # Destillerer vi fra orakelet i ALLE roller, laerer nettet bort
        # forsvarsspillet sitt - det er beviselig bedre enn laereren der.
        # Arvind: «det boer destilleres der vi vet den spiller bedre, men hvis
        # vi er bedre andre plasser som i forsvar/makker, saa bevarer vi det.»
        #
        # WARM START ALENE ER IKKE NOK. Den setter STARTPUNKTET, ikke retningen:
        # vektene er delte, saa finjustering paa foererrader kan dra forsvaret
        # med seg uten at en eneste rad ber om det. Derfor faar de oevrige
        # rollene STARTNETTETS EGNE utganger som maal - selvdestillasjon, som
        # holder atferden fast i stedet for aa la den drive.
        #
        # Maalet byttes i en KOPI av V, ikke i Vg: holdout-maalingene skal
        # fortsatt vaere mot orakelet, ellers maaler vi hvor godt nettet
        # imiterer seg selv.
        Vt = Vg
        if args.laerroller:
            if not args.start:
                raise SystemExit("--laerroller krever --start (ankeret er STARTNETTETS valg)")
            navn_til_kode = {"foerer": 0, "makker": 1, "forsvar": 2}
            laer = {navn_til_kode[x] for x in args.laerroller.split(",") if x}
            if not laer:
                raise SystemExit(f"Ugyldig --laerroller «{args.laerroller}»")
            R_alle = rolle_av(Xg)
            anker = ~torch.isin(R_alle, torch.tensor(sorted(laer), device=enhet))
            Vt = Vg.clone()
            with torch.no_grad():
                stor_neg = torch.finfo(torch.float32).min
                idx = torch.nonzero(anker, as_tuple=False).squeeze(1)
                for i in range(0, idx.numel(), 16384):
                    j = idx[i : i + 16384]
                    logits = modell(Xk[j]).masked_fill(Mg[j] == 0, stor_neg)
                    # Startnettets egen fordeling som maal. Samme skala som
                    # orakelverdiene, saa `tau` betyr det samme for begge.
                    Vt[j] = torch.softmax(logits / args.tau, dim=1) * Mg[j]
            print(
                f"  rollestyrt: {int((~anker).sum())} rader laerer av orakelet "
                f"({args.laerroller}), {int(anker.sum())} rader ankres til startnettet",
                flush=True,
            )

        Wt = stillingsvekt(Vg[tren_idx], Mg[tren_idx])
        if args.rollebalanse:
            Rt = rolle_av(Xg[tren_idx])
            # IKKE `navn` som loekkevariabel: den er KJOERINGENS navn, og ble
            # skygget her - loggen sa «forsvar ferdig» i stedet for «mbal
            # ferdig». Filnavnet var riktig fordi `ut` regnes ut foer, saa feilen
            # var usynlig i alt annet enn teksten.
            for r, rollenavn in ((0, "spillefoerer"), (1, "makker"), (2, "forsvar")):
                m = Rt == r
                if int(m.sum()) > 0:
                    print(
                        f"  {rollenavn:13} {int(m.sum()):7d} rader, snittvekt {float(Wt[m].mean()):.3f}"
                        f" -> andel av vekt {float(Wt[m].sum() / Wt.sum()) * 100:5.1f} %",
                        flush=True,
                    )
            Wt = rollebalanser(Wt, Rt)
            print("  rollebalansert: hver rolle bidrar naa proporsjonalt med radandelen", flush=True)
        # Fast utvalg for treningstapet. Må være FAST gjennom kjøringen, ellers
        # måler kurven utvalgsstøy i stedet for tilpasning.
        g = torch.Generator(device="cpu").manual_seed(7)
        tm = tren_idx[torch.randperm(tren_idx.numel(), generator=g)[: args.tremaal].to(enhet)]

        # --- OPPVARMING AV DE NYE KOLONNENE ------------------------------------
        #
        # HVORFOR DEN MAA FINNES. Nullstilte nye kolonner gjoer at nettet starter
        # identisk med startvekten - det er hele poenget - men det gjoer ogsaa at
        # de nye vektene skal fra 0 til den skalaen resten av nettet ligger paa.
        #
        # MAALT 3. august, etter at telleblokken strauk gate 2 med +0,0008:
        #
        #   snitt |vekt|  v1-kolonnene      0,0895
        #   snitt |vekt|  telleblokken      0,0028      <- 33x for smaa
        #   bidrag til lag 0s foeraktivering, nye blokker som andel av v1: 2,1 %
        #
        # Nettet SAA dem knapt. Og det er ikke tilfeldig, det er aritmetikk:
        # AdamW flytter hver vekt med omtrent lr per steg uansett gradient. Med
        # 105k rader er det ~104 batcher per epoke, og tidlig stopp kom paa
        # epoke 6:
        #
        #   625 steg x 7,5e-5 (cosinus-snitt) = 0,047 maksimal forflytning
        #   0,0895                            = skalaen de skulle naa
        #
        # De KUNNE ikke komme fram, selv med perfekt konsistente gradienter.
        # Nullstillingen som skulle gjoere forsoeket trygt, gjorde det umulig.
        # Konklusjonen «telleblokken hjelper ikke» maalte altsaa treneren, ikke
        # trekket.
        #
        # KUREN er en fase der BARE de nye kolonnene laerer, med hoey nok rate
        # til aa naa skalaen. Alt annet er frosset, saa katastrofal glemsel er
        # utelukket ved konstruksjon - ikke bare gjort usannsynlig med lav rate.
        # Gradienten maskeres til null paa de gamle kolonnene; med wd=0 og et
        # ferskt AdamW-moment betyr null gradient noeyaktig null oppdatering.
        nye_fra = None
        if args.start and args.nyepoker > 0:
            start_bredde = les_vekter(args.start)[0][0].shape[1]
            if bredde > start_bredde:
                nye_fra = start_bredde
        if nye_fra is not None:
            for p in modell.parameters():
                p.requires_grad_(False)
            W0 = modell.lag[0].weight
            W0.requires_grad_(True)
            kolonnemaske = torch.zeros_like(W0)
            kolonnemaske[:, nye_fra:] = 1.0
            hake = W0.register_hook(lambda g: g * kolonnemaske)
            oppv = torch.optim.AdamW([W0], lr=args.nylr, weight_decay=0.0)
            print(
                f"  varmer opp kolonne {nye_fra}-{bredde - 1} alene i {args.nyepoker} epoker "
                f"(lr {args.nylr}), resten frosset",
                flush=True,
            )
            for e in range(args.nyepoker):
                modell.train()
                perm = torch.randperm(tren_idx.numel(), device=enhet)
                for i in range(0, tren_idx.numel(), args.batch):
                    j = tren_idx[perm[i : i + args.batch]]
                    w = Wt[perm[i : i + args.batch]]
                    tap = maskert_tap(modell(Xk[j]), Vt[j], Mg[j], args.tau, w)
                    oppv.zero_grad(set_to_none=True)
                    tap.backward()
                    oppv.step()
                with torch.no_grad():
                    ny_skala = W0[:, nye_fra:].abs().mean().item()
                    gml_skala = W0[:, :nye_fra].abs().mean().item()
                print(
                    f"    oppvarming {e + 1}/{args.nyepoker}: snitt |vekt| ny {ny_skala:.5f} "
                    f"vs gammel {gml_skala:.5f} ({ny_skala / max(1e-12, gml_skala) * 100:.1f} %)",
                    flush=True,
                )
            hake.remove()
            for p in modell.parameters():
                p.requires_grad_(True)

        opt = torch.optim.AdamW(
            modell.parameters(), lr=args.startlr if args.start else args.lr, weight_decay=args.wd
        )
        plan = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epoker)
        beste = float("inf")
        beste_epoke = 0
        siden = 0
        if vekter_modus:
            if hold_idx.numel() == 0:
                raise SystemExit("Tom holdout: for faa kamper (frø) for --holdoutandel - porten har ingenting aa doemme paa")
            # REFERANSEN: --policy (standard startnettet) paa NOEYAKTIG denne holdouten, med samme
            # anger som modellen. Formen leses av fila, saa en policy med andre skjulte lag kan maales.
            pol_lag = les_vekter(args.policy)
            pol_bredde = pol_lag[0][0].shape[1]
            if pol_bredde != bredde:
                # Et 273-nett som policy paa bokrader (forrige iterasjons kort-K.bin foer 493 kom):
                # nullutvidet er det NOEYAKTIG nettet som spilte, saa angeren er dens egen.
                if not (TREKK_DIM in KORTBOK_DIM and pol_bredde < bredde and prefiks_lovlig(pol_bredde, bredde)):
                    raise SystemExit(f"--policy {args.policy} tar {pol_bredde} trekk, dataene har {bredde}")
                W0p, b0p = pol_lag[0]
                pol_lag[0] = (numpy.concatenate([W0p, numpy.zeros((W0p.shape[0], bredde - pol_bredde), dtype=W0p.dtype)], axis=1), b0p)
                print(f"  policy {args.policy}: {pol_bredde} -> {bredde} med nullkolonner bakerst", flush=True)
            pol = E1Nett([bredde] + [W.shape[0] for W, _ in pol_lag]).to(enhet)
            with torch.no_grad():
                for l, (W, b) in zip(pol.lag, pol_lag):
                    l.weight.copy_(torch.from_numpy(W))
                    l.bias.copy_(torch.from_numpy(b))
            pol.eval()
            _, pol_treff, pol_anger = maal_i_biter(pol, Xk, Vg, Mg, args.tau, hold_idx)

            def anger_per_fase(nett):
                return {
                    fnavn: (maal_i_biter(nett, Xk, Vg, Mg, args.tau, idx)[2] if idx.numel() > 0 else float("nan"))
                    for fnavn, idx in fase_idx.items()
                }

            pol_fase = anger_per_fase(pol)
            del pol
            # START-AVVIK: torch-nettet mot en ren numpy-framoverregning av vektfila. Et lag lastet
            # skjevt (feil akse, feil rekkefoelge) krasjer ikke - det gir bare et daarlig nett.
            n_sjekk = min(4096, hold_idx.numel())
            x = Xk[hold_idx[:n_sjekk]].detach().cpu().numpy().astype(numpy.float64)
            start_np = les_vekter(args.start)
            for i, (W, b) in enumerate(start_np):
                if i == 0 and W.shape[1] < x.shape[1]:
                    # Nullutvidet start (273 -> 493): de nye kolonnene ganges med null, altsaa er det de 273 foerste.
                    x = x[:, : W.shape[1]]
                x = x @ W.T.astype(numpy.float64) + b.astype(numpy.float64)
                if i < len(start_np) - 1:
                    x = numpy.maximum(x, 0.0)
            modell.eval()
            with torch.no_grad():
                y = modell(Xk[hold_idx[:n_sjekk]]).detach().cpu().numpy().astype(numpy.float64)
            start_avvik = float(numpy.abs(y - x).max())
            _, _, start_anger = maal_i_biter(modell, Xk, Vg, Mg, args.tau, hold_idx)
            print(
                f"START: hold-anger {start_anger:.4f}, policy {pol_anger:.4f} (treff {100 * pol_treff:.1f} %), "
                f"avvik mot vektfila {start_avvik:.2e}",
                flush=True,
            )
            # EPOKE 0 ER ET SJEKKPUNKT: startvektene skrives, og en epoke maa slaa dem strengt.
            beste = start_anger
            skriv_vekter(ut, modell)
        for epoke in range(args.epoker):
            modell.train()
            perm = torch.randperm(tren_idx.numel(), device=enhet)
            sum_tap = 0.0
            biter = 0
            for i in range(0, tren_idx.numel(), args.batch):
                j = tren_idx[perm[i : i + args.batch]]
                w = Wt[perm[i : i + args.batch]]
                tap = maskert_tap(modell(Xk[j]), Vt[j], Mg[j], args.tau, w)
                opt.zero_grad(set_to_none=True)
                tap.backward()
                opt.step()
                sum_tap += tap.item()
                biter += 1
            plan.step()
            modell.eval()
            tr_tap, tr_treff, tr_anger = maal_i_biter(modell, Xk, Vg, Mg, args.tau, tm)
            ho_tap, ho_treff, ho_anger = maal_i_biter(modell, Xk, Vg, Mg, args.tau, hold_idx)
            # ============ ANGEREN PER FASE HVER EPOKE (12. sep) =====================
            #
            # PORTEN i loekka krever BEGGE: totalangeren OG SENT-angeren bedre enn policyen.
            # Utvalget under har likevel bare sett `ho_anger` - totalen - saa epoken som lagres
            # er valgt paa HALVE kriteriet den doemmes etter. Iter 5 og 6 falt nettopp der:
            # totalen ble bedre (0.8447/0.8504, 0.8147/0.8221) mens SENT ble verre
            # (0.3147/0.3098, 0.2891/0.2872). Uten fasene per epoke er det umulig aa se OM en
            # epoke fantes som klarte begge, eller om ingen gjorde det - de to sier helt
            # forskjellige ting om trekket.
            #
            # GRATIS: holdouten ligger alt paa GPU, og fasene er delmengder av den. Utvalget
            # ROERES IKKE her; dette er maaling, ikke en ny port. Skulle porten flyttes inn i
            # utvalget, er det en egen avgjoerelse med sin egen felle.
            fase_naa = anger_per_fase(modell) if vekter_modus else {}
            rad = {
                "type": "epoke",
                "navn": navn,
                "epoke": epoke + 1,
                "tren_tap_vektet": round(sum_tap / max(1, biter), 5),
                "tren_tap": round(tr_tap, 5),
                "hold_tap": round(ho_tap, 5),
                "gap": round(ho_tap - tr_tap, 5),
                "tren_anger": round(tr_anger, 5),
                "hold_anger": round(ho_anger, 5),
                "tren_treff": round(tr_treff, 5),
                "hold_treff": round(ho_treff, 5),
                **{f"hold_anger_{f.lower()}": round(v, 5) for f, v in fase_naa.items()},
            }
            print(
                f"epoke {epoke + 1}/{args.epoker}: tren-tap {tr_tap:.4f} hold-tap {ho_tap:.4f} "
                f"(gap {ho_tap - tr_tap:+.4f})  tren-anger {tr_anger:.4f} hold-anger {ho_anger:.4f} "
                f"hold-treff {100 * ho_treff:.1f} %",
                flush=True,
            )
            if fase_naa:
                # Ikke prefikset MODELL-/POLICY-: loekka griper `^MODELL-ANGER-HOLDOUT`, og en
                # epokelinje med det prefikset ville blitt lest som sluttdommen.
                print("  fase-anger " + " ".join(f"{f.lower()} {v:.4f}" for f, v in fase_naa.items()), flush=True)
            # ============ UTVALGET DOEMMER PAA BEGGE TALLENE (12. sep) ==============
            #
            # Agent Z: porten i loekka krever total anger OG SENT-anger bedre enn policyen, men
            # utvalget saa bare totalen. Iterasjon 5 og 6 lagret epoker som strauk paa SENT
            # (0.8447/0.8504 med SENT 0.3147/0.3098, og 0.8147/0.8221 med SENT 0.2891/0.2872),
            # mens epoke 2 i iterasjon 6 BESTO begge (0.8171, SENT 0.2789). Det godkjente nettet
            # fantes hver gang; utvalget kastet det. Naa maa en epoke slaa den beste totalen OG
            # policyens SENT for aa bli skrevet.
            #
            # `fase_naa` er tom uten `--vekter` (ingen policy aa maale mot) - da er dette den
            # gamle kodeveien, uendret.
            sent_ok = (not fase_naa) or fase_naa["SENT"] <= pol_fase["SENT"]
            if ho_anger < beste and sent_ok:
                beste = ho_anger
                beste_epoke = epoke + 1
                siden = 0
                skriv_vekter(ut, modell)
                rad["lagret"] = True
            else:
                if ho_anger < beste and not sent_ok:
                    rad["forkastet_sent"] = round(fase_naa["SENT"], 5)
                siden += 1
            logg.write(json.dumps(rad, ensure_ascii=False) + "\n")
            if siden >= args.taal:
                print(f"tidlig stopp: {args.taal} epoker uten framgang (beste {beste:.4f})")
                break
        print(f"{navn} ferdig: beste hold-anger {beste:.4f} på epoke {beste_epoke} → {ut}")
        if vekter_modus:
            # ANGEREN PER FASE for nettet som faktisk ble SKREVET (beste epoke, ellers startvektene):
            # «modell» i minnet er siste epoke, ikke noedvendigvis den lagrede.
            skrevet_lag = les_vekter(ut)
            skrevet = E1Nett([bredde] + [W.shape[0] for W, _ in skrevet_lag]).to(enhet)
            with torch.no_grad():
                for l, (W, b) in zip(skrevet.lag, skrevet_lag):
                    l.weight.copy_(torch.from_numpy(W))
                    l.bias.copy_(torch.from_numpy(b))
            skrevet.eval()
            mod_fase = anger_per_fase(skrevet)
            del skrevet
            sluttlinjer += [
                f"RADER tren {tren_idx.numel()} holdout {hold_idx.numel()} holdoutkamper {len(hold_froe)}",
                "FASE-RADER-HOLDOUT " + " ".join(f"{fnavn.lower()} {int(fase_idx[fnavn].numel())}" for fnavn, _, _ in FASER),
                f"BESTE-EPOKE {beste_epoke}",
                f"START-AVVIK {start_avvik:.2e}",
                f"POLICY-TREFF-HOLDOUT {pol_treff:.4f}",
            ]
            sluttlinjer += [f"MODELL-ANGER-HOLDOUT-{fnavn} {mod_fase[fnavn]:.4f}" for fnavn, _, _ in FASER]
            sluttlinjer += [f"POLICY-ANGER-HOLDOUT-{fnavn} {pol_fase[fnavn]:.4f}" for fnavn, _, _ in FASER]
            # TOTALEN SIST, med vilje: loekka leser «grep '^MODELL-ANGER-HOLDOUT' | tail -1», som ogsaa
            # treffer -SENT. Staar fasene bakerst, doemmer den gamle porten paa sluttspillet i stillhet.
            sluttlinjer += [
                f"MODELL-ANGER-HOLDOUT {beste:.4f}",
                f"POLICY-ANGER-HOLDOUT {pol_anger:.4f}",
            ]
        logg.write(
            json.dumps(
                {
                    "type": "ferdig",
                    "navn": navn,
                    "beste_hold_anger": round(beste, 5),
                    "beste_epoke": beste_epoke,
                    "fil": ut,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        del modell, opt, Wt
        torch.cuda.empty_cache() if enhet == "cuda" else None

    logg.close()
    # BAKERST, etter alt annet: linjene foer foerste epoke kom ikke gjennom WSL-roeret i push-runden.
    for linje in sluttlinjer:
        print(linje, flush=True)


if __name__ == "__main__":
    main()
