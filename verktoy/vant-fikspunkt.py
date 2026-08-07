#!/usr/bin/env python3
"""
ITERERER `vant[N]` TIL FIKSPUNKT.

    python verktoy/vant-fikspunkt.py --runder 4 --giver 3000

`vant[N]` er sannsynligheten for at bud N vinner budrunden. Den staar som en
FAST tabell i bud-gbt.json, maalt med den gamle budgivningen - og maalt paa
nytt 5. august ved dagens bord er bud 9 nede i 11,9 % mot tabellens 66,2 %.

TILBAKEKOBLINGEN ER HELE PROBLEMET. Endrer man tabellen, endres budgivningen,
som endrer tabellen. Et enkelt maal-og-erstatt ville hoppet forbi loesningen.
Derfor itereres det, med DEMPING: den nye verdien er et vektet snitt av maalt
og forrige, saa svingninger doer ut i stedet for aa vokse.

Ingen trening. Bare telling og et fikspunkt.
"""
import argparse, json, subprocess, sys, shutil, os, re

def maal(spek, giver, froe):
    r = subprocess.run(["node","examples/vanttabell.ts","--spek",spek,"--giver",str(giver),"--froe",str(froe)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    ut = {}
    for l in r.stdout.splitlines():
        m = re.match(r"\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+) %", l)
        if m: ut[int(m.group(1))] = (int(m.group(2)), int(m.group(3)))
    return ut

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--modell", default="e1-modell/bud-gbt.json")
    p.add_argument("--ut", default="e1-modell/bud-vant.json")
    p.add_argument("--runder", type=int, default=4)
    p.add_argument("--giver", type=int, default=3000)
    p.add_argument("--demping", type=float, default=0.5)
    p.add_argument("--minst", type=int, default=40, help="faerre observasjoner enn dette -> behold gammel verdi")
    a = p.parse_args()

    # Fortsetter man fra en alt oppdatert modell, er kilde og maal samme fil.
    # Det er en LOVLIG bruk - iterasjonen skal kunne gjenopptas - saa kopien
    # hoppes over i stedet for aa krasje.
    if os.path.abspath(a.modell) != os.path.abspath(a.ut):
        shutil.copy(a.modell, a.ut)
    m = json.load(open(a.ut, encoding="utf-8"))
    print("start:", {k: round(v,3) for k,v in m["vant"].items()}, flush=True)

    for it in range(a.runder):
        spek = (f"vr:e1-modell/vrakrang.bin:telrd:budm:{a.ut}@-3.0:"
                f"vakt:abmp:e1:e1-modell/d7alle.bin")
        obs = maal(spek, a.giver, 820_000_000 + it * 11_000_000)
        if not obs:
            print("ingen observasjoner - stopper", flush=True); return
        ny = dict(m["vant"])
        endring = 0.0
        for n,(avgitt,vant) in sorted(obs.items()):
            if avgitt < a.minst:
                # FOR FAA OBSERVASJONER. Aa sette 0/3 = 0 % ville laast budet ute
                # for godt, og da ville det aldri bli maalt igjen - en absorberende
                # tilstand skapt av stoey.
                continue
            gammel = ny.get(str(n), 0.5)
            maalt = vant / avgitt
            oppdatert = (1 - a.demping) * gammel + a.demping * maalt
            endring = max(endring, abs(oppdatert - gammel))
            ny[str(n)] = oppdatert
        m["vant"] = ny
        json.dump(m, open(a.ut,"w",encoding="utf-8"), ensure_ascii=False)
        print(f"runde {it+1}: " + ", ".join(f"{k}={v:.3f}" for k,v in sorted(ny.items(), key=lambda x:int(x[0])))
              + f"   stoerste endring {endring:.4f}", flush=True)
        if endring < 0.01:
            print("fikspunkt naadd", flush=True); break

if __name__ == "__main__":
    main()
