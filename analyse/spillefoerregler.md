# Hva som faktisk flytter spilleføringen – 2026-08-01

Benk: `examples/spillefoerprofil.ts`, tvungen kontrakt 9, 3000 givere →
1092 kontrakter, kandidaten fører, NevroHjerne i de tre andre setene, parret
på giver. Rådata i `analyse/spillefoerprofil-stor.txt`.

## Dekomponeringen

| kandidat | lagstikk | lagstikk − SD | innfridd | mot nevro |
|---|---|---|---|---|
| NevroHjerne | 9,542 | −0,001 | 78 % | – |
| sd-r2 (rent nett) | 9,674 | +0,131 | 82 % | **+0,132 ± 0,036** |
| vakt:a | 9,889 | +0,346 | 86 % | +0,347 ± 0,035 |
| vakt:t | 9,708 | +0,165 | 83 % | +0,166 ± 0,036 |
| **vakt:at** | **9,933** | **+0,390** | **87 %** | **+0,391 ± 0,035** |
| vakt:atl | 9,924 | +0,381 | 86 % | +0,382 ± 0,035 |

Regnet som tillegg over det rene nettet:

| ledd | verdi i stikk |
|---|---|
| treningen (nevro → sd-r2) | +0,132 |
| regel `a` (slå aldri eget etterlyst kort) | **+0,215** |
| regel `t` (aldri trumf på garantert stikk) | +0,034 |
| begge (`at`) | +0,259 |
| regel `l` (alltid laveste trumf ut) | **−0,009** |

`a` + `t` = 0,249 mot faktisk 0,259, altså i praksis additive.

## RETTELSE av et tall jeg oppga for høyt

I en tidligere melding skrev jeg at vakten var verdt «fem ganger så mye som
all treningen». Det bygget på en kjøring med n=124 kontrakter, der nettet
alene lå på +0,105 ± 0,104 – ett standardavvik, som jeg leste som «null».

På 1092 kontrakter er nettet +0,132 ± 0,036, altså 3,7 SE og reelt. Riktig
forhold er at **vakten er verdt omtrent det dobbelte av treningen**
(+0,259 mot +0,132), ikke fem ganger.

Poenget står likevel: to håndskrevne regler slår et helt GPU-treningsløp i
spillefører­setet, og `a` alene bærer 83 % av vaktens gevinst.

## `l`-regelen er død mot boter

Menneskeregelen «alltid laveste trumf ut» er nå målt på to uavhengige benker:

| benk | resultat | n |
|---|---|---|
| grådigbenken (poeng/kamp) | +0,00 ± 0,02 | 1200 givere |
| spillefører­benken (lagstikk) | −0,009 | 1092 kontrakter |

Tegntesten på grådigbenken viste at regelen endret spillet i 1135 av 1200
givere – den biter, den er bare verdt null. MesterAI-A/B-en ble stoppet
etter 7 par: å bruke 20 timer CPU på å bekrefte det samme en tredje gang er
dårlig bruk av maskinen. Delvise data ligger i `analyse/h2h-L-*.jsonl`.

**Det ubesvarte spørsmålet står fortsatt:** menneskene spiller laveste trumf
i 99,3 % av kontraktene, og ingen av benkene våre kan måle om det er verdt
noe mot et MENNESKE. Nettsiden kjører `vakt:at` (den målt beste), ikke `atl`.

## Hvorfor dette peker videre

Regel `a` er verdt +0,215 fordi makkeren er TVUNGET til å legge det
etterlyste kortet i stikk 1 (makkerplikten), så stikket er gratis – å slå det
kaster bort både stikket og en egen honnør. Nettet gjør det likevel.

Den samme feilformen kan finnes andre steder: fra stikk 2 er makkeren
AVSLØRT, og spilleføreren vet hvem som er på laget. Regel `t`/`b` dekker bare
stikk der laget alt har GARANTERT stikket. Å legge seg over makkerens
vinnende kort når stikket ikke er garantert, er ikke dekket av noen regel.
Det er neste kandidat.
