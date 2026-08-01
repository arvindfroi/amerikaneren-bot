# Samspillet: hvorfor rollemålingene våre løy – 2026-08-01

Arvind spurte om vi hadde prøvd regler for forsvar og makker, og pekte på at
samspillet mellom budvinner og makker er det som avgjør. Spørsmålet avdekket
en systematisk feil i hvordan vi har målt roller.

## Feilen

Alle rollebenkene våre setter NevroHjerne i de tre andre setene. Det virker
nøytralt, men det er det ikke: **en medspiller som ikke kan utnytte støtten,
maskerer verdien av setet vi måler.**

Samme kandidat, samme sete, eneste forskjell er hvem som sitter rundt:

| sete | medspillere = nevro | medspillere = vakt:ab |
|---|---|---|
| **makker** (sd-r2 mot nevro) | +0,021 ± 0,035 | **+0,120 ± 0,030** |
| **forsvar** (sd-r2 mot nevro) | +0,005 ± 0,042 | **−0,055 ± 0,024** |
| **forsvar** (vakt:ab mot nevro) | −0,012 ± 0,043 | **−0,076 ± 0,024** |

(Forsvar måles i stikk til budlaget, så negativt = bedre forsvar.)

Makkerens dyktighet er verdt **seks ganger mer** bak en kompetent spillefører.
Forsvaret vårt gikk fra «ikke målbart» til 3,2 SE bedre enn nevro bare ved å
gi det en medforsvarer som kan følge opp.

## To konklusjoner jeg må trekke tilbake

Tidligere i dag skrev jeg, og committet, at

1. «forsvaret er ikke problemet – sd-r2 forsvarer identisk med nevro
   (+0,005 ± 0,042)», og
2. makkerrollen var nøytral (+0,021 ± 0,035).

**Begge var artefakter av benken.** Med sterke medspillere forsvarer sd-r2
bedre enn nevro (−0,055 ± 0,024) og støtter bedre som makker
(+0,120 ± 0,030). Tallene var riktige; slutningen var det ikke.

Det som fortsatt står er at hele *gapet mot MesterAI* ligger i
spillefører­rollen (fasegapet, 115 %). Det er en annen måling, gjort i hele
kamper der begge sider har sine egne medspillere, og den rammes ikke av
maskeringen.

## Hva det betyr

**Gevinstene er super-additive.** Et bedre kortspill er verdt mer jo bedre
resten av laget er, fordi støtten faktisk blir utnyttet. Det er den
mekaniske grunnen til at menneskedataene ser ut som de gjør: et menneske på
budlaget løfter kontraktprosenten fra 0,274 til 0,833, ikke fordi mennesket
er magisk, men fordi to kompetente spillere sammen henter mer enn summen av
hva hver av dem henter ved siden av en svak makker.

**Og alle rollemålinger i prosjektet som bruker nevro-medspillere,
undervurderer setet de måler.** Det gjelder `moe-roller.ts`, den opprinnelige
`forsvarsprofil.ts` og senat-ekspertene. Begge benkene har nå `--andre`.

## Takprøven i makkersetet

PIMC med 24 verdener i makkersetet: **−0,101 ± 0,053** mot nevro, altså
DÅRLIGERE. Et mye sterkere søk spiller makkeren verre enn nettet.

Det er ikke nødvendigvis metning. PIMC determiniserer verdener uten å
modellere at makkeren har en skjult, bunden rolle (makkerplikten i stikk 1,
og at budvinneren fører planen). Sannsynligere er det at søket løser feil
problem i det setet. Uansett gir det ikke noe brukbart tak, så headroom i
makkersetet er fortsatt ukjent.

## Neste steg

Regeljakten skal gjentas i makker- og forsvarssetet, men **på benker med
sterke medspillere** – ellers vil enhver regel der se verdiløs ut av samme
grunn som over. Regel `a` er spillefører-only ved konstruksjon
(`sete !== s.budvinner` → false); den symmetriske makkerregelen «legg deg
aldri over budvinnerens vinnende kort» er ikke skrevet.
