# Gir mer tenketid bedre spill? — parret K1 på budsjett (loop-15-nettene)

Skrevet 17. sep FØR måling. Gren `fart-2026-09-17` i `D:\amb-fart`. Driver `examples/fart-k1.mjs --konfig
D:/amb-grp/loop/budsjettk1/konfig.json`. Resultatet skrives av prosessen til `D:\amb-grp\loop\budsjett-k1-resultat.md`
(denne fila er forhåndsregistreringen og røres ikke av driveren).

## Nettene
Loop-15, `D:\amb-grp\loop\nett\*-15.bin` = `beste/` = appens `D:\amb-ab\web\dist\max-*.b64` (md5 likt for alle fem:
budq 8f0d777d, etterlyst 8dbcec81, kort 4df2a3c7, tro a0c4e1c2, vrak d250e1f2). Kopiert til `D:\amb-fart\e1-modell\*-15.bin`.
`D:\amb-ab` bare lest.

## Armene (alle S1-knotter: `~ekv=1~topp=0.1~flat=8`, ny kjerne)
| arm | verdensfelt | tanke | anslått kostnad |
|---|---|---|---|
| **arm0** | `48k32e3LMD` | S1 slik appen spiller i dag | 1× |
| **arm1** | `192k32e3LMD` | 4× BREDDE: 4× verdener | ~4× |
| **arm2** | `48k32e5LMD` | DYBDE: eksakt sluttspill fra 5 stikk igjen i stedet for 3 | ~4–5× (knottriggen: E5 var 0,21× fart = 4,8× kostnad) |

**Om `k`:** `k32` er antall KANDIDATVERDENER trohodet velger mellom per trukne verden (importance sampling), ikke
kandidatkort. Det er ikke en bredde i søket, og troledd fant at skarpere tro ikke flytter kortet. Det holdes på 32.
Flere kandidatKORT er `~topp`, som holdes på 0,1 for å isolere én knott per arm.
**Om dybdeknotten:** e4 koster bare ~1,07× (ikke et 4×-budsjett); e5 er den eksisterende dybdeknotten som bruker
~4×. Med SIMD er eksaktløseren dyrere enn nettet, så e5 kjøper eksakthet, ikke fart. Dypere utspilling finnes ikke
(utspillingen går allerede til e-bladet).

## Beslutningsregel (før måling)
En arm tas i bruk hvis **arm − arm0 ≥ +0,15 pp OG z > +1,96** (100·ΔP(seier) per runde, parret, SE klynget på kamp).
Ellers er dommen **«mer tenketid hjelper ikke målbart»**. Krav: ≥ 2000 runder per arm, lik nøkkelmengde, ingen NaN.

## Forsjekk (før K1)
Knottriggen med loop-15 (`--nett 15`), 3 arbeidere × 4 kamper × 2 runder, armer arm0, arm0+STOY (støygulv),
arm0+V192, arm0+E5. Resultat skrives til `D:\amb-grp\loop\budsjettk1\forsjekk.txt` før K1 starter.

## Spådommer
- Forsjekk: V192 endrer spilt kort i 15–25 % mot arm0 (støygulv ~30 %), koster 3,5–4×. E5 endrer 20–30 %, koster 4–5×.
- K1: arm1 − arm0 = 0 til +0,10 pp (ikke over regelen). arm2 − arm0 = −0,10 til +0,10.
- Min dom-spådom: **«mer tenketid hjelper ikke målbart»**.

## Rekkefølge og ressurser
Kjeden venter på S1-K1-driveren (pid 40036) så totalen aldri går over 3 prosesser. BelowNormal. Anslått varighet
etter start: forsjekk ~10 min, K1 ~11 t (arm0 ~1 700 s per skard, arm1/arm2 ~6 000–8 000 s).

## Tidsbruk i nettleseren
Rapporteres fra forsjekken (ms per vurdert kortvalg i Node, parret) og skaleres mot appens S1-median 17 ms.
