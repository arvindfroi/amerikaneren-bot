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
            "--nett", arbeid,
            "--froe", str(self.a.froe_spill + e * 20_000_000),
            "--uten-k2",
        ]
        if beste != arbeid:
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
            "--rapport", f"{self.a.logkatalog}/e{e}-erfaring.txt",
        ]
        return self.kjor("ERFARING", cmd, f"{self.a.logkatalog}/e{e}-erfaring-kjor.txt")[0], ut

    def tren(self, e, arbeid, erf, kandidat):
        py = self.a.wsl_python
        indre = (
            f"cd {wsl_sti(ROT)} && {py} verktoy/mlb-gradient.py "
            f"--inn '{erf}-s*.bin' --vekter {arbeid} --ut {kandidat} "
            f"--epoke {e} --lr {self.a.lr} --pass {self.a.gjennomlop} "
            f"--entropi {self.a.entropi} --batch {self.a.batch} "
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
            "--maalpoeng", str(self.a.maalpoeng),
            "--maksrunder", str(self.a.maksrunder),
            "--epoke", str(e),
            "--ut", ut,
        ]
        sek, _ = self.kjor("PORT", cmd, f"{self.a.logkatalog}/e{e}-port-kjor.txt")
        with open(f"{ut}-dom.jsonl", encoding="utf-8") as f:
            dom = json.loads([l for l in f if l.strip()][-1])
        return sek, dom

    # ------------------------------------------------------------------ loekka
    def gå(self):
        a = self.a
        os.makedirs(a.logkatalog, exist_ok=True)
        os.makedirs(a.datakatalog, exist_ok=True)
        os.makedirs(a.katalog, exist_ok=True)
        os.makedirs(os.path.dirname(a.arbeid) or ".", exist_ok=True)

        tilstand = {"epoke": 0, "beste": a.beste, "tidligere": [], "adoptert": 0}
        if a.fortsett and os.path.exists(self.tilstand):
            with open(self.tilstand, encoding="utf-8") as f:
                tilstand = json.load(f)
            self.si(f"FORTSETTER fra epoke {tilstand['epoke']}")
        else:
            if not os.path.exists(a.arbeid):
                raise SystemExit(f"Arbeidsvektene mangler: {a.arbeid}")
            shutil.copyfile(a.arbeid, a.beste)
            for f in (a.optimalisator,):
                if os.path.exists(f):
                    os.remove(f)
            self.si(f"START {time.strftime('%Y-%m-%d %H:%M')}  arbeid={a.arbeid} -> beste={a.beste}")

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
                self.si(
                    f"   tap: policy {g['pol']:.4f}  tro {g['tro']:.4f} (treff {g['treff'] * 100:.1f} %)  "
                    f"verdi-RMSE {g['rmse']:.3f} (forklart {g['forklart']:+.4f})  "
                    f"entropi {g['ent']:.4f}  KL={gradrad['kl']:.5f}"
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
    p.add_argument("--maalpoeng", type=int, default=30)
    p.add_argument("--maksrunder", type=int, default=60)
    p.add_argument("--temperatur", type=float, default=1.0)
    p.add_argument("--sjanse", type=float, default=0.2)
    # HORISONTEN I FORDELEN. 1 = «faktisk minus ventet» (G - V), 0 = ren TD.
    # Se `gaeFordel` i `src/mlb/selvspill.ts`: ren TD drev policyen med stoey
    # fra et verdihode som forklarte -0,97 av variansen, og andelen
    # amerikaner/solo STEG fra 46,6 % til 58,0 % paa en epoke.
    p.add_argument("--lambda", dest="lam", type=float, default=1.0)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--pass", dest="gjennomlop", type=int, default=1)
    p.add_argument("--entropi", type=float, default=0.01)
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
