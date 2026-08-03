"""Slår sammen gate 2-resultater PER ROLLE over flere frøbånd.

    python verktoy/roller.py wred "analyse/red-g*.jsonl" "analyse/redrep-g*.jsonl"

HVORFOR PER ROLLE. Totalen er et snitt over fire seter der spillefører har fire
ganger makkerens anger. En kandidat kan derfor se ut som en klar gevinst i
totalen mens den bare er bedre i ett sete – og det er nøyaktig det som skjedde
med `wred`. Skal påstanden være «bedre i alle deler av spillet», må hver rolle
stå på egne bein, i mer enn ett frøbånd.

Sammenslåingen er invers-varians-vektet. Fortegnsskifte mellom bånd rapporteres
eksplisitt: det er tegnet på at rollen IKKE er avgjort, uansett hva den
sammenslåtte verdien blir.
"""

import glob
import json
import math
import sys

ROLLER = ["foerer", "makker", "forsvar"]


def les(monster, arm):
    ut = {}
    for sti in sorted(glob.glob(monster)):
        with open(sti, encoding="utf-8") as f:
            for linje in f:
                try:
                    r = json.loads(linje)
                except Exception:
                    continue
                d = r.get("d") or {}
                rr = r.get("r") or {}
                if "KONTROLL" not in d:
                    continue
                for k, v in d.items():
                    if k.split("/")[-1] == arm + ".bin":
                        ut.setdefault(rr.get("KONTROLL", "?"), []).append(v - d["KONTROLL"])
    return ut


def stat(xs):
    n = len(xs)
    m = sum(xs) / n
    se = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1) / n) if n > 1 else float("nan")
    return n, m, se


def main() -> None:
    arm = sys.argv[1]
    band = [(m, les(m, arm)) for m in sys.argv[2:]]
    for m, b in band:
        if not b:
            raise SystemExit(f"ingen rader for «{arm}» i {m}")

    print(f"ARM: {arm}\n")
    kolonner = "".join(f"{m.split('/')[-1].split('-')[0]:>22}" for m, _ in band)
    print(f"{'rolle':9}{kolonner}{'SLAATT SAMMEN':>26}")

    for rolle in ROLLER + ["TOTALT"]:
        rad = f"{rolle:9}"
        vekt = 0.0
        sum_mv = 0.0
        fortegn = set()
        mangler = False
        for _, b in band:
            xs = [x for v in b.values() for x in v] if rolle == "TOTALT" else b.get(rolle, [])
            if len(xs) < 2:
                mangler = True
                rad += f"{'-':>22}"
                continue
            n, m, se = stat(xs)
            rad += f"{m:+9.4f} +/-{se:.4f}"
            fortegn.add(m > 0)
            w = 1 / se**2
            vekt += w
            sum_mv += m * w
        if not mangler and vekt > 0:
            m = sum_mv / vekt
            se = math.sqrt(1 / vekt)
            rad += f"{m:+12.4f} +/-{se:.4f} = {m / se:+5.2f} SE"
            if len(fortegn) > 1:
                rad += "   FORTEGNSSKIFTE"
        print(rad)

    print(
        "\nEn rolle med fortegnsskifte mellom baand er IKKE avgjort, uansett\n"
        "hva den sammenslaatte verdien viser."
    )


if __name__ == "__main__":
    main()
