"""SAMSPILLET, SOM ET TALL.

ARVIND: «alle deler skal fungere i samspill og gjøre hverandre bedre. ingen
bottlenecks.»

Det kravet kan ikke besvares med ett samlet tall, og det kan ikke besvares med
en vurdering. Det er et REGNESTYKKE, og dette skriptet gjør det.

================= HVA SUPERADDITIVITET ER HER ==========================

Med hvert ledd målt for seg mot samme miljø, på samme frø:

    forventet(V7)  =  sum av de enkelte leddenes effekt

Er den MÅLTE V7 større enn det, forsterker leddene hverandre — de gjør
hverandre bedre, som er kravet. Er den mindre, konkurrerer de om det samme.

================= OG DET SISTE ER IKKE TEORETISK ======================

Tre ganger i dette prosjektet har to deler kjempet om samme ressurs, og hver
gang var det samme form: **et lokalt optimum som ødelegger en avtale.**

    A6 mot A7          begge ville eie de frie kortvalgene (§70: 36,2 %)
    sender mot leser   signalkoden var to ULIKE koder
    søket mot vakten   søket overstyrte konvensjonene i 68 % av valgene

Superadditivitet er derfor ikke en formalitet å hake av. Det er den ene tingen
prosjektet gjentatte ganger IKKE har hatt.

================= STANDARDFEILEN PÅ DIFFERANSEN =======================

Leddene måles på SAMME giv, så de er positivt korrelerte, og SE på summen er
IKKE roten av summen av kvadrater. Uten parvise kovarianser kan vi ikke regne
den eksakt fra en rapportfil.

Skriptet oppgir derfor to grenser i stedet for å late som:

    ØVRE   SE hvis leddene var uavhengige     sqrt(sum SE^2)
    NEDRE  SE hvis de var perfekt korrelerte  sum SE

Er superadditiviteten større enn to ØVRE SE, holder konklusjonen uansett
korrelasjon. Ligger den mellom, sier skriptet at den ikke er avgjort — og det
er et ærligere svar enn et tall som later som.
"""

from __future__ import annotations

import argparse
import re
import sys


def les_armer(sti: str) -> dict[str, tuple[float, float, int, int]]:
    """Armnavn -> (effekt, SE, positive par, totale par) fra en gate2-rapport.

    Leser den PARREDE blokken, ikke armtabellen: den parrede er differansen mot
    kontrollarmen på samme giv og sete, og det er den som har mening.
    """
    ut: dict[str, tuple[float, float, int, int]] = {}
    iBlokk = False
    with open(sti, encoding="utf8") as f:
        for linje in f:
            if linje.startswith("PARRET mot KONTROLL"):
                iBlokk = True
                continue
            if iBlokk and (linje.startswith("PER ROLLE") or linje.startswith("KONTROLLARMEN")):
                break
            if not iBlokk:
                continue
            m = re.match(
                r"\s+(\S+)\s+([+-][\d.]+)\s+±\s+([\d.]+)\s+\([^)]*\)\s+(\d+)/(\d+)", linje
            )
            if m is not None:
                ut[m.group(1)] = (float(m.group(2)), float(m.group(3)), int(m.group(4)), int(m.group(5)))
    return ut


def kort(navn: str) -> str:
    """Armnavnet uten stakken, så tabellen er lesbar."""
    m = re.search(r"amu:\w+:([\w.]+)", navn)
    sok = "sok" if "sok" in navn else ""
    return f"{m.group(1) if m else navn[:24]}{'+' + sok if sok else ''}"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("rapport", help="gate2 .txt-rapport fra mvp-dom.sh")
    p.add_argument("--helhet", required=True, help="delstreng som identifiserer V7-armen")
    p.add_argument("--ledd", required=True, action="append", help="delstreng per enkeltledd")
    p.add_argument("--ut", default="analyse/samspill.txt")
    a = p.parse_args()

    armer = les_armer(a.rapport)
    if not armer:
        raise SystemExit(f"fant ingen parrede armer i {a.rapport} - er kjoeringen ferdig?")

    def finn(nål: str) -> tuple[str, tuple[float, float, int, int]]:
        treff = [(k, v) for k, v in armer.items() if nål in k]
        if len(treff) != 1:
            raise SystemExit(
                f"«{nål}» traff {len(treff)} armer. Maa treffe noeyaktig én:\n  "
                + "\n  ".join(armer)
            )
        return treff[0]

    hNavn, (hEff, hSe, hPos, hTot) = finn(a.helhet)
    ledd = [finn(x) for x in a.ledd]

    L: list[str] = []
    L.append("# SAMSPILLET, SOM ET TALL")
    L.append("")
    L.append(f"{'arm':<26}{'effekt':>10}{'SE':>10}{'tegntest':>18}")
    L.append("-" * 64)
    for navn, (e, se, pos, tot) in ledd:
        andel = 100 * pos / max(1, tot)
        L.append(f"{kort(navn):<26}{e:>+10.4f}{se:>10.4f}{f'{pos}/{tot} ({andel:.1f}%)':>18}")
    L.append("-" * 64)
    andelH = 100 * hPos / max(1, hTot)
    L.append(f"{'HELHETEN (V7)':<26}{hEff:>+10.4f}{hSe:>10.4f}{f'{hPos}/{hTot} ({andelH:.1f}%)':>18}")
    L.append("")

    sum_ledd = sum(e for _, (e, _, _, _) in ledd)
    se_uavh = sum(se * se for _, (_, se, _, _) in ledd) ** 0.5
    se_korr = sum(se for _, (_, se, _, _) in ledd)
    delta = hEff - sum_ledd
    # Helhetens egen SE hoerer med i differansen.
    øvre = (se_uavh * se_uavh + hSe * hSe) ** 0.5
    nedre = se_korr + hSe

    L.append(f"sum av leddene           {sum_ledd:+.4f}")
    L.append(f"helheten                 {hEff:+.4f}")
    L.append(f"SUPERADDITIVITET         {delta:+.4f}")
    L.append(f"  SE hvis uavhengige     ±{øvre:.4f}   (oevre grense paa presisjonen)")
    L.append(f"  SE hvis fullt korrelert ±{nedre:.4f}  (nedre grense)")
    L.append("")

    if delta > 2 * nedre:
        dom = "SYNERGI, og den holder uansett korrelasjon mellom leddene."
    elif delta > 2 * øvre:
        dom = "SYNERGI hvis leddene er omtrent uavhengige. Ikke avgjort ellers."
    elif delta < -2 * nedre:
        dom = "LEDDENE KONKURRERER om det samme - helheten er mindre enn summen."
    elif delta < -2 * øvre:
        dom = "KONKURRANSE hvis leddene er omtrent uavhengige. Ikke avgjort ellers."
    else:
        dom = "IKKE AVGJORT. Leddene er verken paavist forsterkende eller konkurrerende."
    L.append(f"DOM: {dom}")
    L.append("")
    L.append("Merk at superadditivitet ikke er nok alene: helheten maa OGSAA vaere")
    L.append("positiv. En sum av tre negative ledd kan vaere superadditiv og likevel")
    L.append("gjoere boten daarligere.")
    if hEff <= 0:
        L.append("")
        L.append(f"  ADVARSEL: helheten er {hEff:+.4f}, altsaa ikke bedre enn grunnlinja.")

    tekst = "\n".join(L)
    with open(a.ut, "w", encoding="utf8") as f:
        f.write(tekst + "\n")
    print(tekst)
    print(f"\n-> {a.ut}", file=sys.stderr)


if __name__ == "__main__":
    main()
