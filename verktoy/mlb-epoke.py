#!/usr/bin/env python3
"""
MLB fase 0.5 — EPOKEDRIVEREN. Leddet som binder delene sammen.

    py -3 verktoy/mlb-epoke.py --epoker 10 --kamper 5000 --kjerner 20

Alle delene fantes fra foer (§120-§122). Ingen gradient var tatt. Dette er
loekka:

    K2  ->  SPILL  ->  ERFARING  ->  TREN  ->  K2  ->  PORT  ->  ADOPTER/FORKAST

============================ TO VEKTFILER, IKKE EN ======================

  arbeid.bin   ARBEIDSVEKTENE. Gradienten tas fra dem hver epoke, og de er
               kandidatsetet i selvspillet. De rulles ALDRI tilbake.
  beste.bin    LIGAENS BESTE. Flyttes BARE av porten.

`docs/mlb.md` fase 2 skriver «ellers: forkast». Lest bokstavelig ville en
avvist epoke kastet gradienten OG datagrunnlaget, og med en port som krever
z>=2 + tegntest + to enige baand ville ti epoker lett blitt ti kopier av epoke
0 — vi hadde da ikke maalt om kurven beveger seg, bare om ETT steg er stort nok
til aa passere porten.

Skillet loeser begge: TRENINGEN loeper videre (arbeid), mens BEFOLKNINGEN er
portet (beste). Den nye epoken moeter alltid en motstander som har bestaatt
porten, dataene er alltid paa-policy for vektene som trenes, og «adopter» betyr
fortsatt noeyaktig det samme: du kom inn i ligaen bare om du slo forrige,
parret, over 2 SE, med tegntesten og to disjunkte baand med deg.

============================ K2 KJOERES TO GANGER =======================

Foer spillet, paa vektene som skal SPILLE, og etter treningen, paa vektene som
skal PORTES. Roedt stopper epoken paa stedet — ikke logges og fortsettes.

============================ ALT TIL VARIGE FILER =======================

`docs/plan.md`: aldri stol paa stdout-roer for flertimers maalinger. Hvert steg
skriver sin egen fil, og driveren legger til EN linje per epoke i
`analyse/mlb-epoker.jsonl` og `.txt` med en gang epoken er ferdig — ikke til
slutt.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def wsl_sti(sti):
    """C:\\Users\\... -> /mnt/c/Users/..."""
    p = os.path.abspath(sti).replace("\\", "/")
    if len(p) > 1 and p[1] == ":":
        return "/mnt/" + p[0].lower() + p[2:]
    return p


def tallstr(x, form="+.2f"):
    """NaN/None serialiseres som `null` i JSON og sprenger en formatstreng.

    Loep 1 doede noeyaktig der: LIGA-H2H fikk spredning 0 fordi to saturerte
    nett spilte BIT-LIKT, z ble NaN -> null, og driveren krasjet i epoke 8
    etter halvannen time. En maalerigg skal kunne rapportere «vet ikke».
    """
    return "n/a" if x is None else format(x, form)


def logg_linje(sti, tekst):
    os.makedirs(os.path.dirname(sti) or ".", exist_ok=True)
    with open(sti, "a", encoding="utf-8") as f:
        f.write(tekst if tekst.endswith("\n") else tekst + "\n")
        f.flush()


class Driver:
    def __init__(self, args):
        self.a = args
        self.node = shutil.which("node") or "node"
        self.txt = args.rapport
        self.jsonl = args.jsonl
        self.tilstand = args.tilstand

    # ------------------------------------------------------------------ kjoer
    def kjor(self, navn, cmd, logfil, miljo=None):
        """Kjoerer et steg og TAR VARE PAA UTGANGEN I EN FIL.

        `capture_output` her er ikke et stdout-roer i den forbudte forstand:
        stegene skriver sine egne maalinger til sine egne filer underveis.
        Dette er bare krasjsporet, og det skrives foer unntaket kastes.
        """
        t = time.time()
        self.si(f"    -> {navn}")
        env = dict(os.environ)
        if miljo:
            env.update(miljo)
        r = subprocess.run(cmd, cwd=ROT, capture_output=True, text=True, env=env, errors="replace")
        sek = time.time() - t
        os.makedirs(os.path.dirname(logfil) or ".", exist_ok=True)
        with open(logfil, "w", encoding="utf-8") as f:
            f.write(" ".join(cmd) + f"\n--- kode {r.returncode} etter {sek:.1f} s ---\n")
            f.write(r.stdout or "")
            f.write("\n--- stderr ---\n")
            f.write(r.stderr or "")
        if r.returncode != 0:
            raise RuntimeError(f"{navn} feilet (kode {r.returncode}). Se {logfil}")
        return sek, r.stdout or ""

    def si(self, s):
        sys.stderr.write(s + "\n")
        sys.stderr.flush()
        logg_linje(self.txt, s)

    # ------------------------------------------------------------------ steg
    def k2(self, vekter, merke, e):
        """Blindhetsproeven. ROEDT STOPPER EPOKEN."""
        cmd = [
            self.node,
            "--test",
            "test/mlb-k2-selvspill.test.ts",
            "test/mlb-k2-nett.test.ts",
            "test/mlb-k2-trekk.test.ts",
        ]
        sek, _ = self.kjor(
            f"K2 ({merke})",
            cmd,
            f"{self.a.logkatalog}/e{e}-k2-{merke}.txt",
            miljo={"MLB_K2_NETT": os.path.abspath(vekter)},
        )
        return sek

    def spill(self, e, arbeid, beste, tidligere):
        ut = f"{self.a.datakatalog}/e{e}"
        cmd = [
            self.node,
            "examples/mlb-spill.ts",
            "--kamper", str(self.a.kamper),
            "--kjerner", str(self.a.kjerner),
            "--ut", ut,
            "--maalpoeng", str(self.a.maalpoeng),
            "--maksrunder", str(self.a.maksrunder),
            "--temperatur", str(self.a.temperatur),
            "--tro", self.a.tro,
            "--nett", arbeid,
            "--froe", str(self.a.froe_spill + e * 20_000_000),
            "--uten-k2",
        ]
        if self.a.rask_kjerne:
            cmd.append("--rask-kjerne")
        if self.a.adams_andel > 0:
            cmd += ["--adams-andel", str(self.a.adams_andel)]
        if self.a.ligavekter:
            cmd += ["--ligavekter", self.a.ligavekter]
        # ===================== HVEM ER 40-PROSENTEN? (§127) ==================
        #
        # `TRENINGSVEKTER` i src/mlb/liga.ts er beste 0,4 / tidligere 0,3 /
        # vaner 0,3, og `examples/mlb-spill.ts` setter KANDIDATEN i beste-sporet
        # naar `beste == arbeid` - altsaa i epoke 0 og etter hver godkjent epoke.
        #
        # ============ MEN NAAR PORTEN AVVISER, RAATNER SPORET ==============
        #
        # `beste` flyttes BARE av porten, mens `arbeid` trenes hver epoke. Avviser
        # porten to ganger paa rad, trener kandidaten i 40 % av setene mot vekter
        # som er to epoker gamle - og i et loep der porten aldri godkjenner, mot
        # EPOKE 0, altsaa mot tilfeldige vekter.
        #
        # Det er ikke en teoretisk risiko: v127 epoke 1 og v126 epoke 1 ble begge
        # avvist, saa i epoke 2 var 40 % av motstanderne det tilfeldige nettet.
        #
        #   `beste`  dagens oppfoersel: befolkningen er ligaens beste
        #   `naa`    beste-sporet fylles av KANDIDATEN, altsaa naavaerende policy
        #
        # `naa` er en BEVEGELIG laereplan; `beste` er et fast snitt av spilltreet.
        # Vanene staar uroert i begge (30 %) - K6 krever dem, og selvspill mot seg
        # selv gir per definisjon ingen vane aa utnytte.
        #
        # PORTEN ER IKKE ROERT. Den doemmer fortsatt kandidat mot ligaens beste;
        # dette gjelder bare hvem det TRENES mot.
        if self.a.motstander == "naa":
            pass
        elif beste != arbeid:
            cmd += ["--beste", beste]
        if tidligere:
            cmd += ["--tidligere", ",".join(tidligere)]
        return self.kjor("SPILL", cmd, f"{self.a.logkatalog}/e{e}-spill.txt")[0], ut

    def erfaring(self, e, arbeid, kilde):
        ut = f"{self.a.datakatalog}/erf"
        cmd = [
            self.node,
            "examples/mlb-erfaring.ts",
            "--inn", f"{kilde}-s*.jsonl",
            "--nett", arbeid,
            "--ut", ut,
            "--kjerner", str(self.a.kjerner),
            "--sjanse", str(self.a.sjanse),
            "--maksrunder", str(self.a.maksrunder),
            "--lambda", str(self.a.lam),
            "--gamma", str(self.a.gamma),
            "--tro", self.a.tro,
            "--rapport", f"{self.a.logkatalog}/e{e}-erfaring.txt",
        ]
        if self.a.rask_kjerne:
            cmd.append("--rask-kjerne")
        if self.a.seier:
            cmd += ["--seier", self.a.seier]
        return self.kjor("ERFARING", cmd, f"{self.a.logkatalog}/e{e}-erfaring-kjor.txt")[0], ut

    def tren(self, e, arbeid, erf, kandidat):
        py = self.a.wsl_python
        indre = (
            f"cd {wsl_sti(ROT)} && {py} verktoy/mlb-gradient.py "
            f"--inn '{erf}-s*.bin' --vekter {arbeid} --ut {kandidat} "
            f"--epoke {e} --lr {self.a.lr} --pass {self.a.gjennomlop} "
            f"--lr-verdi {self.a.lr_verdi} --kl-intervall {self.a.kl_intervall} "
            f"--kl-maal {self.a.kl_maal} --kl-tak {self.a.kl_tak} "
            f"--holdout-del {self.a.holdout_del} "
            f"--entropi {self.a.entropi} --batch {self.a.batch} "
            f"{f'--entropi-fase {self.a.entropi_fase} ' if self.a.entropi_fase else ''}"
            f"{f'--entropi-gulv {self.a.entropi_gulv} ' if self.a.entropi_gulv else ''}"
            f"--vekt-policy {self.a.vekt_policy} "
            # §127s TO BRYTERE. Sendes ALLTID eksplisitt, ogsaa naar de er 0:
            # en bryter som bare staar i treneren er en bryter man maa gjette
            # verdien paa naar man leser epokeloggen et halvt aar senere.
            f"--vekt-stikk {self.a.vekt_stikk} "
            f"--vekt-verdi-kvantil {self.a.vekt_verdi_kvantil} "
            # KL-ANKERET (R2): fast ankerpolicy for hele loepet, ikke forrige epoke.
            f"{('--anker ' + self.a.anker + ' --vekt-anker ' + str(self.a.vekt_anker) + ' ') if self.a.anker else ''}"
            # BARE FOERSTE EPOKE. Nullstilles hodet hver epoke, laerer det aldri.
            f"{'--nullstill-verdi ' if (self.a.nullstill_verdi and e == 1) else ''}"
            f"--opt-tilstand {self.a.optimalisator} "
            f"--logg {self.a.gradientlogg} --rapport {self.a.gradientrapport}"
        )
        cmd = ["wsl.exe", "-e", "bash", "-lc", indre]
        sek, ut = self.kjor("TREN (GPU)", cmd, f"{self.a.logkatalog}/e{e}-tren.txt")
        siste = None
        for linje in ut.splitlines():
            linje = linje.strip()
            if linje.startswith("{") and '"etter"' in linje:
                siste = json.loads(linje)
        return sek, siste

    def port(self, e, kandidat, beste):
        ut = f"{self.a.logkatalog}/e{e}-port"
        cmd = [
            self.node,
            "examples/mlb-port.ts",
            "--kandidat", kandidat,
            "--forrige", beste,
            "--kamper", str(self.a.portkamper),
            "--band", ",".join(str(b) for b in self.a.portband),
            "--ligaband", str(self.a.styrkeband),
            "--ligakamper", str(self.a.styrkekamper),
            "--kjerner", str(self.a.kjerner),
            "--maalpoeng", str(self.a.portmaalpoeng),
            "--maksrunder", str(self.a.maksrunder),
            "--tro", self.a.tro,
            "--epoke", str(e),
            "--ut", ut,
        ]
        sek, _ = self.kjor("PORT", cmd, f"{self.a.logkatalog}/e{e}-port-kjor.txt")
        with open(f"{ut}-dom.jsonl", encoding="utf-8") as f:
            dom = json.loads([l for l in f if l.strip()][-1])
        return sek, dom

    def tro_steg(self, e, kilde, tro_naa):
        """R2: TROSNETTET TRENES SAMMEN MED POLICYEN, paa epokens egne kamper.

        Trosnettet var fast og trent paa ADAMS_MAALT mot seg selv, mens policyen
        laerte. Troen er motstanderspesifikk (§119), saa jo mer spillet flyttet seg,
        jo mer feil ble den om nettopp de spillerne den ble brukt mot - og
        kortspillet (K7, K3) bygger paa den. Se analyse/krav-samspill-2026-09-10.md.

        Rekkefoelgen i epoken er valgt: dette steget kjoerer ETTER porten, og et
        godtatt trosnett tas i bruk fra NESTE epoke. Kandidaten i denne epoken er
        trent paa data spilt med det gamle trosnettet og skal maales med det samme -
        samme regel som §126 (samme fil i SPILL, ERFARING og PORT).

        GODTAS BARE hvis K8-tapet paa epokens holdout (froe % 10 == 0) faller.
        """
        ut = f"{self.a.datakatalog}/tro-e{e}"
        cmd = [
            self.node,
            "examples/mlb-trodata-logg.ts",
            "--inn", f"{kilde}-s*.jsonl",
            "--ut", ut,
            "--kjerner", str(self.a.kjerner),
            "--sjanse", str(self.a.tro_sjanse),
            "--maksrunder", str(self.a.maksrunder),
        ]
        if self.a.tro_hukommelse:
            # K6 -> K8 (11. sep): hukommelsen bakerst i trotrekkene. Treneren utvider et
            # 660-nett med nullkolonner, saa foerste epoke starter paa noeyaktig samme tro.
            # Maalt paa R1-kamper: -0.0055 +/- 0.0007 i K8-tap, stokket hukommelse null.
            cmd.append("--hukommelse")
        sek_data, _ = self.kjor("TRODATA", cmd, f"{self.a.logkatalog}/e{e}-trodata.txt")
        kandidat = f"{self.a.katalog}/mlb-tro-e{e}.bin"
        py = self.a.wsl_python
        indre = (
            f"cd {wsl_sti(ROT)} && {py} verktoy/mlb-tro-tren.py "
            f"--tren '{ut}-s*.bin' --hold-del 10 --vekter {tro_naa} --ut {kandidat} "
            f"--epoker {self.a.tro_epoker} --lr {self.a.tro_lr} "
            f"--logg {self.a.logkatalog}/e{e}-trotren.jsonl --rapport {self.a.logkatalog}/e{e}-trotren-rapport.txt"
        )
        sek_tren, utskrift = self.kjor("TROTREN (GPU)", ["wsl.exe", "-e", "bash", "-lc", indre], f"{self.a.logkatalog}/e{e}-trotren.txt")
        foer = etter = None
        for linje in utskrift.splitlines():
            linje = linje.strip()
            if linje.startswith("{") and '"tro_foer"' in linje:
                foer = json.loads(linje)["tro_foer"]
            if linje.startswith("{") and '"tro_etter"' in linje:
                etter = json.loads(linje)["tro_etter"]
        godtatt = foer is not None and etter is not None and etter["k8"] < foer["k8"] - 1e-4
        self.si(
            f"    TRO e{e}: K8-tap holdout "
            f"{tallstr(None if foer is None else foer['k8'], '.5f')} -> "
            f"{tallstr(None if etter is None else etter['k8'], '.5f')}  "
            f"{'GODTATT -> ' + kandidat if godtatt else 'FORKASTET, beholder ' + tro_naa}"
        )
        return sek_data, sek_tren, (kandidat if godtatt else tro_naa), foer, etter, godtatt

    def seier_steg(self, e, kilde, seier_naa):
        """R2: SEIERSPREDIKTOREN TILPASSES PAA NYTT, paa epokens egne kamper.

        Belonningen (src/mlb/seier.ts) er P(seier | tavla) laert paa Adams mot seg
        selv. Naar spillestyrken ved bordet endrer seg, endrer sjansen for aa vinne
        fra en gitt tavle seg ogsaa - og en fast prediktor gir da en belonning som er
        kalibrert mot et annet bord. Se analyse/krav-samspill-2026-09-10.md.

        GODTAS BARE hvis holdout-CE paa epokens kamper faller mot den gamle, OG
        TS/PyTorch-pariteten (examples/seier-paritet.ts) holder. Tas i bruk fra
        neste epoke, av samme grunn som trosnettet.
        """
        ut = f"{self.a.datakatalog}/seier-e{e}"
        cmd = [self.node, "examples/seier-data.ts", "--ut", ut, "--kjerner", str(self.a.kjerner), f"{kilde}-s*.jsonl"]
        sek_data, _ = self.kjor("SEIERDATA", cmd, f"{self.a.logkatalog}/e{e}-seierdata.txt")
        kandidat = f"{self.a.katalog}/seier-e{e}"
        indre = (
            f"cd {wsl_sti(ROT)} && {self.a.wsl_python} verktoy/seier-tren.py "
            f"--inn '{ut}-s*.csv' --ut {kandidat} --sammenlikn {seier_naa} --traader 8"
        )
        sek_tren, utskrift = self.kjor("SEIERTREN", ["wsl.exe", "-e", "bash", "-lc", indre], f"{self.a.logkatalog}/e{e}-seiertren.txt")
        foer = etter = None
        for linje in utskrift.splitlines():
            linje = linje.strip()
            if linje.startswith("{") and '"seier_foer"' in linje:
                d = json.loads(linje)
                foer, etter = d["seier_foer"], d["seier_etter"]
        bedre = foer is not None and etter is not None and etter < foer - 1e-3
        paritet = False
        if bedre:
            try:
                self.kjor("SEIERPARITET", [self.node, "examples/seier-paritet.ts", kandidat], f"{self.a.logkatalog}/e{e}-seierparitet.txt")
                paritet = True
            except RuntimeError:
                paritet = False
        godtatt = bedre and paritet
        self.si(
            f"    SEIER e{e}: holdout CE {tallstr(foer, '.4f')} -> {tallstr(etter, '.4f')}  "
            f"{'GODTATT -> ' + kandidat + '.bin' if godtatt else ('FORKASTET (paritet)' if bedre else 'FORKASTET') + ', beholder ' + seier_naa}"
        )
        return sek_data, sek_tren, (kandidat + ".bin" if godtatt else seier_naa), foer, etter, godtatt

    # ------------------------------------------------------------------ loekka
    def gå(self):
        a = self.a
        os.makedirs(a.logkatalog, exist_ok=True)
        os.makedirs(a.datakatalog, exist_ok=True)
        os.makedirs(a.katalog, exist_ok=True)
        os.makedirs(os.path.dirname(a.arbeid) or ".", exist_ok=True)

        tilstand = {"epoke": 0, "beste": a.beste, "tidligere": [], "adoptert": 0, "tro": a.tro, "seier": a.seier}
        if a.fortsett and os.path.exists(self.tilstand):
            with open(self.tilstand, encoding="utf-8") as f:
                tilstand = json.load(f)
            self.si(f"FORTSETTER fra epoke {tilstand['epoke']}")
            # R2: trosnettet som sist ble GODTATT, ikke flaggets standard.
            if a.tro_tren and tilstand.get("tro"):
                a.tro = tilstand["tro"]
                self.si(f"  trosnett fra tilstanden: {a.tro}")
            if tilstand.get("seier"):
                a.seier = tilstand["seier"]
                self.si(f"  seiersprediktor fra tilstanden: {a.seier}")
        else:
            if not os.path.exists(a.arbeid):
                raise SystemExit(f"Arbeidsvektene mangler: {a.arbeid}")
            shutil.copyfile(a.arbeid, a.beste)
            for f in (a.optimalisator,):
                if os.path.exists(f):
                    os.remove(f)
            # LAMBDA OG GAMMA I HODET PAA DEN VARIGE FILA. To loep med ulik
            # gamma gir tall som ikke er sammenliknbare, og uten dem her er de
            # heller ikke gjenkjennelige som ulike naar noen leser fila senere.
            self.si(
                f"START {time.strftime('%Y-%m-%d %H:%M')}  arbeid={a.arbeid} -> beste={a.beste}"
                f"  lambda={a.lam} gamma={a.gamma} lr={a.lr} kamper={a.kamper}"
                f"  vekt-stikk={a.vekt_stikk} vekt-verdi-kvantil={a.vekt_verdi_kvantil}"
                f"  motstander={a.motstander}"
                f"  maal={('seier ' + a.seier) if a.seier else 'poeng'}"
                f"  adams-andel={a.adams_andel}"
                f"  anker={(a.anker + ' vekt ' + str(a.vekt_anker)) if a.anker else 'ingen'}"
                f"  seier-tren-hver={a.seier_tren_hver}  ligavekter={a.ligavekter or 'standard'}"
                f"  tro-tren={('ja, ' + str(a.tro_epoker) + ' pass, lr ' + str(a.tro_lr)) if a.tro_tren else 'nei (fast trosnett)'}"
                # KJERNEN I TRENINGSDATAENE. Kolonnekjernen er ikke bit-identisk;
                # et loep som bruker den skal vaere gjenkjennelig i den varige fila.
                + (f"  kjerne=kolonne (--rask-kjerne)" if a.rask_kjerne else "  kjerne=rad")
                # ENTROPIEN SLIK DEN FAKTISK VIRKER. `--entropi` er INERT naar
                # `--entropi-fase` er satt, og et flagg som staar i loggen uten
                # aa virke er verre enn ingen logg: en ekstern gjennomgang leste
                # «0,01» og foreslo aa femdoble det, mens den faktiske
                # koeffisienten var 0,5 per fase.
                + (
                    f"  entropi=PER FASE {a.entropi_fase}"
                    + (f" gulv {a.entropi_gulv}" if a.entropi_gulv else "")
                    + f" (--entropi {a.entropi} er INERT)"
                    if a.entropi_fase
                    else f"  entropi={a.entropi} (ett snitt over alle rader)"
                )
            )

        t_start = time.time()
        for i in range(a.epoker):
            e = tilstand["epoke"] + 1
            t0 = time.time()
            self.si(f"\n=== EPOKE {e} ({time.strftime('%H:%M:%S')}) ===")
            tider = {}

            tider["k2_for"] = self.k2(a.arbeid, "for", e)
            tider["spill"], kilde = self.spill(e, a.arbeid, tilstand["beste"], tilstand["tidligere"])
            tider["erfaring"], erf = self.erfaring(e, a.arbeid, kilde)

            kandidat = f"{a.katalog}/mlb-e{e}.bin"
            tider["tren"], gradrad = self.tren(e, a.arbeid, erf, kandidat)
            tider["k2_etter"] = self.k2(kandidat, "etter", e)
            tider["port"], dom = self.port(e, kandidat, tilstand["beste"])
            tro_brukt = a.tro
            tro_info = {"brukt": tro_brukt}
            if a.tro_tren:
                sd, st, ny_tro, foer, etter, godtatt = self.tro_steg(e, kilde, a.tro)
                tider["trodata"], tider["trotren"] = sd, st
                tro_info.update({
                    "kandidat": f"{a.katalog}/mlb-tro-e{e}.bin",
                    "godtatt": godtatt,
                    "k8_foer": None if foer is None else round(foer["k8"], 5),
                    "k8_etter": None if etter is None else round(etter["k8"], 5),
                    "neste": ny_tro,
                })
                a.tro = ny_tro
                tilstand["tro"] = a.tro
            seier_info = {"brukt": a.seier}
            if a.seier and a.seier_tren_hver > 0 and e % a.seier_tren_hver == 0:
                sd2, st2, ny_seier, sf, se2, sg = self.seier_steg(e, kilde, a.seier)
                tider["seierdata"], tider["seiertren"] = sd2, st2
                seier_info.update({"godtatt": sg, "ce_foer": sf, "ce_etter": se2, "neste": ny_seier})
                a.seier = ny_seier
                tilstand["seier"] = a.seier

            adoptert = dom["dom"] == "godkjent"
            if adoptert:
                if tilstand["beste"] != a.beste:
                    pass
                arkiv = f"{a.katalog}/mlb-beste-e{e}.bin"
                shutil.copyfile(kandidat, arkiv)
                tidligere = list(tilstand["tidligere"])
                if tilstand["beste"] not in tidligere:
                    tidligere.append(tilstand["beste"])
                tilstand["tidligere"] = tidligere[-a.tidligere_vindu :]
                tilstand["beste"] = arkiv
                tilstand["adoptert"] = tilstand.get("adoptert", 0) + 1

            # ARBEIDSVEKTENE FLYTTES UANSETT — se toppen.
            shutil.copyfile(kandidat, a.arbeid)
            tilstand["epoke"] = e
            with open(self.tilstand, "w", encoding="utf-8") as f:
                json.dump(tilstand, f, indent=1)

            rad = {
                "epoke": e,
                "tid": time.strftime("%Y-%m-%d %H:%M:%S"),
                "sek": round(time.time() - t0, 1),
                "tider": {k: round(v, 1) for k, v in tider.items()},
                "dom": dom["dom"],
                "port_snitt": round(dom["snitt"], 4),
                "port_se": round(dom["se"], 4),
                "port_z": round(dom["z"], 3),
                "tegn": f"{dom['tegnFor']}/{dom['tegnFor'] + dom['tegnMot']}",
                "tegn_z": round(dom["tegnZ"], 2),
                "kontroll_z": None if dom["kontroll"] is None else round(dom["kontroll"]["z"], 3),
                "styrke": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in dom["styrke"].items()},
                "liga_h2h": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in dom["ligaH2H"].items()},
                "adoptert": adoptert,
                "beste": tilstand["beste"],
                "begrunnelse": dom["begrunnelse"],
                "gradient": gradrad,
                # HVILKET TROSNETT KANDIDATEN BLE TRENT OG PORTET MED. Dommeren maa bruke
                # det samme, ellers maales en annen bot enn den som ble trent.
                "tro": tro_info,
                "seier": seier_info,
            }
            logg_linje(self.jsonl, json.dumps(rad))
            s = dom["styrke"]
            self.si(
                f"EPOKE {e} FERDIG paa {rad['sek'] / 60:.1f} min  "
                f"| PORT {dom['dom'].upper()} snitt={dom['snitt']:+.3f}+-{dom['se']:.3f} "
                f"z={dom['z']:+.2f} tegn={rad['tegn']} (z={dom['tegnZ']:+.2f}) "
                f"kontroll={rad['kontroll_z']}  "
                f"| STYRKE {s['kandidatPoeng']:+.3f} poeng, seier {s['kandidatSeier'] * 100:.1f} %, "
                f"grovbud {s['grovbudAndel'] * 100:.2f} %, avbrutt {s['avbrutt'] * 100:.1f} %  "
                f"| LIGA-H2H {tallstr(dom['ligaH2H']['diff'])} (z={tallstr(dom['ligaH2H']['z'])})  "
                f"| {'ADOPTERT' if adoptert else 'FORKASTET'}: {dom['begrunnelse']}"
            )
            if gradrad:
                g = gradrad["etter"]
                h = gradrad.get("hold_etter") or {}
                # FORKLART VARIANS TO GANGER, OG DET ER IKKE PYNT.
                #
                # `foer` er maalt paa vekter som aldri har sett disse radene —
                # det er grunnlinjen slik den FAKTISK var da fordelene ble
                # regnet. `etter` er maalt i utvalget modellen nettopp trente
                # paa. §124: epoke 10 sto paa +0,1286 i utvalget og +0,0751 paa
                # holdout-kamper. Ti epoker ble lest med det optimistiske
                # tallet, og «verdihodet forklarer 13 %» var derfor for hoeyt.
                self.si(
                    f"   tap: policy {g['pol']:.4f}  tro {g['tro']:.4f} (treff {g['treff'] * 100:.1f} %)  "
                    f"verdi-RMSE {g['rmse']:.3f}  entropi {g['ent']:.4f}  KL={gradrad['kl']:.5f}  "
                    f"frys p={gradrad.get('frosset_paa')} s={gradrad.get('frosset_stamme_paa')} "
                    f"av {gradrad.get('batcher')}"
                )
                # HOLDOUT-KAMPER, og bare det. §124 FUNN 2: ti epoker ble lest
                # med et tall maalt i utvalget modellen nettopp trente paa
                # (+0,1286 der mot +0,0751 paa holdout). Tallet i utvalget staar
                # i `mlb-gradient.jsonl` for den som vil se det; her staar det
                # som faktisk sier om grunnlinjen generaliserer.
                self.si(
                    f"   HOLDOUT (kamper): verdi sum {tallstr(h.get('forklart'), '+.4f')}  "
                    f"runde {tallstr(h.get('forklart_runde'), '+.4f')}  "
                    f"hale {tallstr(h.get('forklart_hale'), '+.4f')}  "
                    f"tro {tallstr(h.get('tro'), '.4f')}  "
                    # STIKKHODET PAA HOLDOUT (§127) — ved siden av verdiens, med
                    # samme regnestykke og hver sin nevner. Det er de to tallene
                    # oppdraget ber om, og de skal leses i samme linje.
                    f"STIKK {tallstr(h.get('st_forklart'), '+.4f')} "
                    f"(treff {tallstr((h.get('st_treff') or 0) * 100, '.1f')} %)"
                )
            if a.timer > 0 and (time.time() - t_start) / 3600 > a.timer:
                self.si(f"TIDSTAKET paa {a.timer} timer er naadd — stopper etter epoke {e}")
                break

        self.si(f"\nALLE EPOKER FERDIG paa {(time.time() - t_start) / 3600:.2f} timer")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--epoker", type=int, default=10)
    p.add_argument("--kamper", type=int, default=5000)
    p.add_argument("--kjerner", type=int, default=20)
    # ===================== BLANDEDE LOEPSLENGDER (§126) ==================
    #
    # Ett tall gjorde `makro.maalPoeng.per100` og `.trettiDelt` til KONSTANTE
    # innganger, og en konstant inngang er en omskalert bias: korrelasjonen mot
    # biasens egen endring er r = 1,0000 over ti epoker. K5 kunne ikke laeres.
    #
    # Og ved maal 30 varer kampen 5,68 runder i trening. `Hukommelse.observer`
    # bokfoerer ved RUNDE_SLUTT, saa hukommelsen ser hoeyst fire-fem ferdigspilte
    # runder - mens `sandkassen.md` §3 forutsetter «naar tjue er nok». K4 og K6
    # er derfor strukturelt ulaerbare ved 30. Ved 100 er kampen 27,16 runder.
    #
    # PRISEN: 30/60/100 gir 5,68/12,88/27,16 runder, altsaa ~2,7x maskintid.
    p.add_argument("--maalpoeng", default="30,60,100", help="ett tall, eller «30,60,100»")
    # PORTEN doemmer paa ETT tall, med vilje: epoke 3 og epoke 9 skal vaere
    # sammenliknbare, og de faste froebaandene gir parrede giv bare hvis
    # loepslengden ogsaa er fast.
    p.add_argument("--portmaalpoeng", type=int, default=30)
    # TROEN SOM INNGANG (§126). Samme fil i SPILL, ERFARING og PORT - er de tre
    # uenige, er det maalte ikke det som ble trent.
    p.add_argument("--tro", default="e1-modell/mlb-tro.bin")
    p.add_argument("--maksrunder", type=int, default=60)
    p.add_argument("--temperatur", type=float, default=1.0)
    p.add_argument("--sjanse", type=float, default=0.2)
    # HORISONTEN I FORDELEN. 1 = «faktisk minus ventet» (G - V), 0 = ren TD.
    # Se `gaeFordel` i `src/mlb/selvspill.ts`: ren TD drev policyen med stoey
    # fra et verdihode som forklarte -0,97 av variansen, og andelen
    # amerikaner/solo STEG fra 46,6 % til 58,0 % paa en epoke.
    p.add_argument("--lambda", dest="lam", type=float, default=1.0)
    # DISKONTERINGEN PER RUNDE (§124). 1 er noeyaktig §123s form.
    #
    # Maalt paa epoke 10s egne 371 652 rader: med gamma = 1 ligger 99,68 % av
    # Var(A) MELLOM runder og bare 0,32 % innenfor, og 96,5 % av rundene gir
    # IDENTISK fortegn paa fordelen til alle sine ~15 valg. Kredittilordningen
    # var altsaa borte. sd paa rundens poeng er 9,9, sd paa resten av kampen
    # 61,5 — og en regularisert ridge paa de SAMME trekkene forklarer bare
    # +0,19 av den halen, saa den kan ikke baselines bort.
    #
    # Med gamma = 0,5 blir signal/stoey 1,76 i stedet for 0,16, og
    # makrotrekkene beholder gradient (neste runde 0,5, den etter 0,25). Aa
    # gjoere RUNDEN til episoden ville gitt dem null, og K5 kunne aldri blitt
    # laert — `docs/mlb.md` §2.
    #
    # SAMME STANDARD SOM `examples/mlb-erfaring.ts`. Ett tall, ett sted.
    p.add_argument("--gamma", type=float, default=0.5)
    # ===================== SKRITTLENGDEN, MAALT OG IKKE VALGT (§125) =====
    #
    # §123 satte 3e-4 paa et nett som knapt hadde en mening. Paa en TRENT policy
    # er den katastrofalt stor, og det ble maalt paa 86 k rader fra denne riggen
    # (`analyse/mlb-sveip125.txt`), med KL maalt etter HVER batch:
    #
    #   | lr    | pass | KL etter loepet | frys      | verdi paa HOLDOUT (runde) |
    #   |-------|------|-----------------|-----------|---------------------------|
    #   | 3e-4  |  8   | 0,197 etter ETT steg | batch 0 | -0,005 |
    #   | 1e-4  |  8   | 0,060           | batch 1   | +0,046 |
    #   | 5e-5  |  8   | 0,018           | ingen     | +0,163 |
    #   | 5e-5  | 16   | **0,021**       | **ingen** | **+0,248** |
    #   | 5e-5  | 32   | 0,028           | ingen     | +0,153 (i utvalget +0,76) |
    #
    # Bremsen fyrte altsaa ikke fordi policyen trengte foerti steg - den fyrte
    # fordi ETT steg var femten ganger stoerre enn tillitsomraadet. Med 5e-5 og
    # 16 gjennomloep faar hele nettet 1 216 gradientsteg per epoke INNENFOR
    # tillitsomraadet, mot §124s foerti paa sju epoker.
    #
    # 32 gjennomloep er for mye: forklart varians i utvalget stiger til +0,76
    # mens holdout FALLER til +0,153. Det er overtilpasning, og den er maalt.
    p.add_argument("--lr", type=float, default=5e-5)
    p.add_argument("--pass", dest="gjennomlop", type=int, default=16)
    # VERDIHODENE HAR SIN EGEN SKRITTLENGDE. De er lineaere hoder over stammens
    # 512 ReLU-utganger, og Adam flytter hver parameter ~lr per steg uansett
    # gradient - en skrittlengde kalibrert for policylogitene er for kort her.
    p.add_argument("--lr-verdi", type=float, default=1e-3)
    p.add_argument("--kl-maal", type=float, default=0.03)
    p.add_argument("--kl-tak", type=float, default=0.06)
    p.add_argument("--kl-intervall", type=int, default=1)
    p.add_argument("--holdout-del", type=int, default=10)
    p.add_argument("--entropi", type=float, default=0.01)
    # ===================== ENTROPIEN PER FASE (§126) =====================
    #
    # `--entropi` var ALDRI null og den VIRKET — snittentropien steg 0,5983 ->
    # 0,8561 over v125s fjorten epoker. Den var maalt paa feil ting: snittet
    # tas over alle rader med valg, og 78 % av dem er kortspill. VELG_TRUMF har
    # EN rad per runde mot kortspillets tolv, saa de to fasene som faktisk
    # kollapset - trumfvalget og budet - er 2,2 % og 8,9 % av det snittet som
    # steg. Etter fjorten epoker med bonusen paa sto trumfvalget paa 2 av 4
    # koder og ruter 97,7 %, og budet paa 2 av 12.
    #
    # Med `--entropi-fase` faar hver fase sitt eget snitt og sin egen vekt, saa
    # trumfvalget ikke lenger kan drukne i kortvalgene. Tom = §125s ledd.
    p.add_argument("--entropi-fase", default="", help="«bud,vrak,trumf,etterlys,spill»")
    p.add_argument("--entropi-gulv", default="", help="«bud,vrak,trumf,etterlys,spill», normalisert H")
    # VEKTEN PAA POLICYTAPET. 0 gir en VARMEEPOKE: bare verdi og tro trenes.
    #
    # Den finnes fordi gamma FLYTTER VERDIMAALET. Med gamma = 1 hadde `G` snitt
    # -50 og spredning 63; med 0,5 er den -5,6 og 12. Et verdihode som er trent
    # paa den gamle skalaen spaar da systematisk feil, og fordelen `G^y - V`
    # ville vaert dominert av hodets egen skalafeil i den foerste epoken —
    # policyen ville tatt et fullt steg paa stoey foer grunnlinjen rakk aa
    # flytte seg. En varmeepoke koster en epoke og fjerner hele den risikoen.
    p.add_argument("--vekt-policy", type=float, default=1.0)
    # NULLSTILL VERDIHODET I FOERSTE EPOKE (§124). Se `mlb-gradient.py`.
    #
    # Trengs naar `--gamma` endres, fordi maalets SKALA da flytter seg og
    # korreksjonen ellers gaar gjennom den DELTE stammen og river policyen med
    # seg. Foerste forsoek brukte `--vekt-policy 0` i stedet, og det gjorde
    # nettopp det: styrken falt fra +16 til -760 poeng paa en epoke.
    p.add_argument("--nullstill-verdi", action="store_true")
    # ===================== §127s TO BRYTERE ==============================
    #
    # STIKKHODET og FORDELINGSVERDIEN bygges og trenes SAMMEN fra epoke 0 - hver
    # for seg koster timer - men de skal kunne SKILLES etterpaa uten aa gjette.
    # Derfor en bryter hver, og begge er EKSAKTE i null: hodene staar paa W = 0
    # fra `__init__`, saa uten gradient kan de heller ikke dytte den delte
    # stammen. `--vekt-stikk 0 --vekt-verdi-kvantil 0` er §126 bit for bit.
    #
    # SAMME STANDARD SOM `verktoy/mlb-gradient.py`. Ett tall, ett sted.
    p.add_argument("--vekt-stikk", type=float, default=1.0)
    p.add_argument("--vekt-verdi-kvantil", type=float, default=1.0)
    # HVEM 40-PROSENTEN ER. Se `spill()` over. `beste` er dagens oppfoersel.
    p.add_argument("--motstander", choices=("beste", "naa"), default="beste")
    # KOLONNEKJERNEN (`src/nevro/nett-kolonne.ts`), bare i SPILL og ERFARING.
    # Treningsdata taaler numerisk stoey (maks |d| 4e-7 paa policy-logitene, samme
    # argmaks i 1000/1000 ekte stillinger); maaling gjoer det ikke, saa K2 og
    # porten kjoerer alltid den bit-identiske `forover`. 1,94x per beslutning.
    p.add_argument("--rask-kjerne", action="store_true")
    # SEIERSMAALET (src/mlb/seier.ts): seiersprediktorens vektfil. Tom = poeng,
    # som foer. Gjelder ERFARING - det er der belonningen regnes.
    p.add_argument("--seier", default="")
    # ADAMS SOM MOTSTANDER: andelen kamper med kandidaten mot tre Adams-v5 (kampbenkens
    # bord). 0 = bare ligaen, som foer.
    p.add_argument("--adams-andel", type=float, default=0.0)
    # R2: TROSNETTET TRENES SAMMEN MED POLICYEN (se Driver.tro_steg).
    p.add_argument("--tro-tren", action="store_true")
    p.add_argument("--tro-epoker", type=int, default=3)
    p.add_argument("--tro-lr", type=float, default=3e-4)
    p.add_argument("--tro-sjanse", type=float, default=0.3)
    p.add_argument("--tro-hukommelse", action="store_true",
                   help="K6->K8: trosnettet trenes med hukommelsen som inngang (660 -> 804)")
    # R2: SEIERSPREDIKTOREN TILPASSES PAA NYTT hvert N-te epoke (0 = fast). Se Driver.seier_steg.
    p.add_argument("--seier-tren-hver", type=int, default=0)
    # R2: VANEANDELEN I LIGAEN, «beste,tidligere,vaner» (tom = TRENINGSVEKTER 0,4/0,3/0,3).
    p.add_argument("--ligavekter", default="")
    # R2: KL-ANKERET mot en fast policy (typisk imitasjonen loepet startet fra).
    p.add_argument("--anker", default="")
    p.add_argument("--vekt-anker", type=float, default=0.0)
    p.add_argument("--batch", type=int, default=1024)
    # ===================== FROEBAANDENE, AVSATT FOER FOERSTE KAMP =========
    #
    # `docs/mlb.md` §5: «holdout-froebaand avsatt foer foerste kamp». Baandene
    # som ALLEREDE er i bruk i prosjektet:
    #
    #   12,0 M ...        K8-proeven (`tro-noyaktighet.ts`)
    #    4,1 M ...        `mlb-spill.ts` sin standard (§122s e0-kjoeringer)
    #   41,0 M ... 812,7M trodata trening
    #   1,100 G ... 1,254G trodata holdout
    #   2,000 G ... 2,772G mlb-data trening
    #   3,000 G ... 3,154G mlb-data holdout
    #
    # Hullet mellom 1,254 G og 2,000 G er ledig, og epokene bor der:
    #
    #   selvspill  1,300 G + e·20 M + k·7717,  k < 5 000  -> 1,300 G ... 1,500 G
    #   port baand 0                                      -> 1,800 G ...
    #   port baand 1                                      -> 1,850 G ...
    #   styrke (FAST hver epoke)                          -> 1,900 G ...
    #
    # PORT- OG STYRKEBAANDENE FLYTTER SEG IKKE MELLOM EPOKER. De trenes aldri
    # paa, saa det er ingen lekkasje — og faste giv gjoer at styrketallet fra
    # epoke 3 og epoke 9 er PARRET paa kortene og ikke bare sammenliknbart.
    p.add_argument("--portkamper", type=int, default=300)
    p.add_argument("--portband", default="1800000000,1850000000")
    p.add_argument("--styrkeband", type=int, default=1900000000)
    p.add_argument("--styrkekamper", type=int, default=200)
    p.add_argument("--froe-spill", type=int, default=1300000000)
    p.add_argument("--tidligere-vindu", type=int, default=6)
    p.add_argument("--timer", type=float, default=0, help="0 = ingen grense")
    p.add_argument("--katalog", default="e1-modell")
    p.add_argument("--arbeid", default="e1-modell/mlb-arbeid.bin")
    p.add_argument("--beste", default="e1-modell/mlb-beste.bin")
    p.add_argument("--optimalisator", default="e1-modell/mlb-adam.pt")
    p.add_argument("--datakatalog", default="mlb-epoke-data")
    p.add_argument("--logkatalog", default="analyse/mlb-epoke")
    p.add_argument("--rapport", default="analyse/mlb-epoker.txt")
    p.add_argument("--jsonl", default="analyse/mlb-epoker.jsonl")
    p.add_argument("--tilstand", default="analyse/mlb-epoker-tilstand.json")
    p.add_argument("--gradientlogg", default="analyse/mlb-gradient.jsonl")
    p.add_argument("--gradientrapport", default="analyse/mlb-gradient.txt")
    p.add_argument("--wsl-python", default="~/Arvind-Lora/.venv/bin/python")
    p.add_argument("--fortsett", action="store_true")
    a = p.parse_args()
    a.portband = [int(x) for x in a.portband.split(",")]
    Driver(a).gå()


if __name__ == "__main__":
    main()
