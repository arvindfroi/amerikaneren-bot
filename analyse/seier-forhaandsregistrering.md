# Forhåndsregistrering — MLB fra Adams, med kampseier som mål

Skrevet 10. september 2026, **før** noen av kandidatene under er dømt på
kampbenken. Tall som allerede var kjent da dette ble skrevet står merket med n
og dato.

## Hvorfor linjen er lagt om

Arvind, 10. september: MLB kan startes fra Adams-v5, og målet skal være å vinne
kampen (makro), med meso og mikro som hjelpesignaler. «Bare prøv å nå målet så
fort som mulig.» Og: ikke heng deg opp i gamle konsepter.

Det som er lagt bort, og hvorfor:

| gammelt | hvorfor det er lagt bort |
|---|---|
| selvtrening fra null uten lærer | 127b sto på −3,24 poeng/giv mot Adams i ~40 epoker (`docs/hvor-vi-staar.md`) |
| poeng som belønning | K1 dømmes i kamper til 100; poeng er risikonøytralt, og e12 tok MINDRE risiko bak (129 av 360, kravbatteriet 10. sep) |
| skalatesten (`analyse/mlb-skala-forhaandsregistrering.md`) | stoppet i epoke 14 10. sep 21:10 — den måler den gamle linjen, og utfallet kan ikke endre beslutningen |
| gate 2-poeng som dom | makronivået er usynlig der (`press` er eksakt 0 i én runde) |

`d7alle`/Adams-v5 er ikke noe vi bygger videre på. Den er **læreren** og
**målestokken**, ingenting mer.

## Det som var målt da dette ble skrevet

**Seiersprediktoren** `seier-g0` (`verktoy/seier-tren.py`, 9→64→64→4), n = 24 000
Adams-mot-Adams-kamper (frø 1 800 000 000 + k·7717, mål 30/60/100), holdout
2 400 kamper splittet på kamp, 10. sep:

| arm | holdout |
|---|---|
| uniform | CE 1,3863 |
| stokkede etiketter (kontroll) | CE 1,3856 — ingen lekkasje |
| **prediktoren** | **CE 1,0867** |
| konstant 0,25 / rangtabell / **prediktoren** (binært, eget sete) | 0,5623 / 0,4934 / **0,4579** |

Kalibrert i alle ti desiler (verste avvik 0,013). TS mot PyTorch på 64
holdout-tavler: inngang eksakt lik, fordeling maks 1,2e-7
(`examples/seier-paritet.ts`), og en rotasjonsmutant gir AVVIK.

**i1** (imitasjon av Adams fra e12, lr 1e-4, 6 pass, 2 700 kamper / 1,83 M rader):
samsvar med Adams' valg på holdout-kamper 31,9 % → **67,4 %**. Stigen (giver
150, frø 8 300 000, samme panel som 127b), n = 600 per motstander, 10. sep:

| motstander | e12 (127b) | **i1** |
|---|---|---|
| Adams (`ADAMS_MAALT`) | −3,24 | **−1,17 ± 0,43** |
| nevro | — | −2,17 ± 0,66 |
| tilfeldig | — | +7,74 ± 0,75 |

## Hypotesene

1. **H1 — imitasjonen lukker gapet.** En ren imitasjon av Adams når ≥ 0,25 på
   kampbenken mot tre Adams (paritet). Blir den ikke det, er nettet for lite
   eller læreren for vanskelig å etterligne, og det avgjøres FØR RL.
2. **H2 — seiersmålet slår poengmålet i kamper.** RL-epoker med `--seier` gir
   høyere kampandel mot Adams enn de samme epokene med poeng, fra samme start.
3. **H3 — K5 retter seg.** Med seiersmål tar nettet MER risiko bak (kravbatteriet
   K5-armen), der e12 tok mindre.

## Dommen

**Kampbenken er den eneste dommen.** `verktoy/kampport.sh`, kandidaten i ett
sete mot tre `ADAMS` (utrullet spek), 400 kamper til 100, 16 skard, frø
710 000 000, parret. Kontrollarmen skal omslutte 0,2500. Stigen og intern kurve
rapporteres, men avgjør ingenting.

- **Bedre enn Adams:** kampandel > 0,25 med nedre 95 %-grense over 0,25.
- **Adopteres** først når det er replikert i et disjunkt frøbånd (800 000 000).

## Kravregelen — lagt til 10. sep 22:20, før R1 har produsert én epoke

Arvind: treningen skal jobbe mot KRAVENE, ikke bare mot kampandel. En kandidat
som slår Adams på kampbenken, men gjør et krav verre, adopteres IKKE.

Hver R1-epoke kjøres gjennom kravbatteriet (`examples/mlb-krav.ts --to-band`)
ved siden av kampbenken (`D:\amb-imit\maal-r1.sh`). Adopsjon krever i begge bånd:

| krav | regel |
|---|---|
| K2 | «ja» — ingen unntak |
| K3 | budgapet (poeng/runde igjen) ikke over startvektenes med mer enn 2 SE |
| K4 | «ja» |
| K5 | ikke verre enn startvektenes V(bak)-andel med mer enn 2 SE |
| K6 | stigningen ikke under startvektenes med mer enn 2 SE |
| K7 | sluttspillgapet ikke over startvektenes med mer enn 2 SE |
| K8 | andelen av veien gulv → tak ikke under startvektenes med mer enn 2 SE |

Startvektenes rader måles med samme batteri før R1 dømmes. K7 og K4-framoverblikk
krever søk i spillet og er ikke ventet å bevege seg av R1 alene — de har egen
plan (søk oppå nettet), men de skal ikke bli VERRE.

## Avbruddskriteriet — skrevet ned nå, så det ikke forhandles senere

MLB-linjen **stoppes** hvis ingen kandidat har kampandel over 0,25 (nedre
grense over 0,25) etter:

- beste imitasjon (i1 / i1b / i2), **og**
- inntil 6 RL-epoker med seiersmål fra den beste imitasjonen,

altså senest når de seks epokene er dømt. Da skrives det ned, og arbeidet går
til Adams-stakken direkte (budsøk K=240 er målt +2,0, `ADAMS-MAX-ARBEIDSPLAN`).

## Armene i rekkefølge

| arm | hva | status 10. sep |
|---|---|---|
| i1 | imitasjon, lr 1e-4, 6 pass | **kampbenk 0,086** (400 frø / 1 600 kandidatkamper, −25,6 SE, 7 opp / 269 ned), 10. sep. *Først lest som 0,100 på 25 frø: `kampport.sh` leste bare skard 0 — se under.* |
| i1b | imitasjon, lr 3e-4, 20 pass, samme data | samsvar holdout 73,9 % (trening 82,5 %, verdihodet overtilpasset: forklart −0,02 holdout). Stigen mot Adams −0,34 ± 0,41 (n=600). **Kampbenk 0,204** (400 frø / 1 600 kandidatkamper, differanse −0,046 ± 0,009, **−5,19 SE**, 55 opp / 135 ned, margin −6,7 ± 1,2), 10. sep. *Først lest som 0,190, −1,44 SE på 25 frø.* |
| i2 | imitasjon + verdihoder mot SEIER, 8 000 nye kamper (frø 2 000 000 000 +), sjanse ~0,33, fra i1b | samsvar holdout 75,8 % (BUD 95,8 / VRAK 60,6 / TRUMF 93,7 / ETTERLYS 99,9 / SPILL 73,7), verdi forklart +0,25. Stigen mot Adams +0,18 ± 0,36 (n=600). **Kampbenk 0,225** (400 frø, −0,025 ± 0,009, −2,91 SE, 62 opp / 109 ned, margin −3,8 ± 1,1), 10. sep. **Beste imitasjon → R1 startet fra i2** |
| i3 | som i2, men KANONISK vrak og 16 000 kamper (frø 300 000 000 +), sjanse 0,165, fra i2 | samsvar holdout **78,9 %** (VRAK 60,6 → **85,0 %**, SPILL 75,0), verdi forklart +0,29. Stigen mot Adams +0,01 ± 0,34. **Kampbenk 0,2131** (−4,32 SE). Parret mot i2 på samme 400 frø: **−0,012 ± 0,011** (−1,1 SE), margin −3,3 ± 1,2. Ikke bedre → R1 startes IKKE på nytt. Høyere samsvar ga ikke flere seire |
| R1–R6 | `mlb-epoke.py --seier --adams-andel 0.5`, fra i2 | **e1: 0,2331** (400 frø, −0,0169 ± 0,0084, −2,00 SE, 66 opp / 99 ned, margin −2,8 ± 1,1), 10. sep 23:01. Porten (gate 2) forkastet, KL 0,036. Kravbatteri e1 kjører. K5- og K8-radene er ugyldige for R1 — se `krav-samspill-2026-09-10.md` §3 |

## DOM OVER R1 (11. sep, alle 6 epoker)

| epoke | kampbenk mot tre Adams (400 frø) |
|---|---|
| e1 | 0,2331 (−2,00 SE) |
| e2 | 0,2338 (−1,81 SE) |
| e3 | 0,2200 (−3,44 SE) |
| e4 | 0,2169 (−3,76 SE) |
| e5 | 0,2112 (−4,74 SE) |
| e6 | 0,2206 (−3,45 SE) |

**Avbruddskriteriet er innfridd: ingen epoke over 0,25. R1 er FEILET, slik det står
skrevet over.** Beste imitasjon (i2, 0,2250) ble ikke slått av noen epoke med
signifikans, og e3–e6 ligger under i2. Diagnosen (gradientloggen): fordelen er mest
støy (verdien forklarer ~0,27 på holdout, halen ~0,01) og KL-bremsen mot forrige epoke
lar policyen drive uten retning. Videre arbeid på MLB skjer bare i R2, som har egen
forhåndsregistrering og egen stopp (`analyse/r2-forhaandsregistrering.md`).

**Lest av i1 (skrevet etter målingen, ikke en ny hypotese):** 67 % samsvar gir
−1,17 poeng/giv på stigen men bare 0,10 av kampene. Små avvik hoper seg opp over
en kamp til 100, så samsvarstallet alene sier lite. Derfor måles samsvaret nå PER
FASE (`pol_treff_BUD` … i `mlb-gradient.py`), og RL-epokene spiller halvparten av
kampene mot tre Adams (`--adams-andel`) — det bordet dommen tas på.
