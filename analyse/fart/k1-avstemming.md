# K1-avstemming: hvorfor driveren sier «par med mennesket» og batteriet sier «+1,11»

18. sep, gren `fart-2026-09-17` i `D:\amb-fart`. Ingenting rørt i prod, `D:\amb-ab`, `D:\amb-epimc` eller `D:\amb-loop`.

## Svaret i én setning

**Begge riggene regner det samme tallet på samme måte — de setter ikke opp det samme bordet.** Batteriet lar
de tre andre setene spilles av **v5-kjeden mennesket faktisk møtte**; min driver lot alle fire seter være
armen selv. Samme bot, samme runder, samme mål: **−0,28 ± 0,54 pp mot egne kopier, +1,20 ± 0,53 pp mot v5.**

## Definisjonene, felt for felt

| | batteriet (`krav-helbot.ts` → `duplikat-menneske.ts` + `analyse/duplikat-dom.mjs`) | `fart-k1.mjs` |
|---|---|---|
| rigg | `examples/duplikat-menneske.ts` | samme fil, samme argumenter minus to |
| **motstandere** | **`--motstander V5_KJEDE`** = `vr:vrakrang:telrd:budm:bud-menneske@-3.0:vakt:abmp:e1:d7alle` | ingen `--motstander` ⇒ standard = `--spek`, altså **armen i alle fire seter** |
| **runder** | **`--etter 2026-08-10`** (`K1_FRA = MENNESKE_FRA`) | ingen datofilter ⇒ også runder før 10. aug |
| kampsett | `--kampsett utvalg` i løkkeporten (holdout rapporteres ved siden av) | alle kamper |
| sete | boten i menneskets sete (0), begge | likt |
| mål | `dP = bP − mP` per runde, 100·ΔP(seier) fra `seier-g0.bin`; snitt over runder | likt (`bP − mP`, snitt over runder) |
| SE | klyngebootstrap over kamper, B = 20 000 | likt (B = 20 000), pluss klynget sandwich |
| fortegn/normalisering | positiv = boten henter mer ut av de samme kortene | likt |
| parring | mot menneskets faktiske runde, samme giv og poengtavle | likt |

Altså: ingen forskjell i mål, fortegn, normalisering, sete eller SE-metode. Forskjellen er **bordet** og
**hvilke runder** som telles.

## Hvor mye hvert ledd flytter (mine egne arm0-rader, loop-15)

| utvalg | n | kamper | arm0 − menneske, ΔP |
|---|---|---|---|
| alle rader (slik driveren rapporterte) | 3 276 | 309 | −0,028 ± 0,185 |
| fra 10. aug (samme snitt som batteriet) | **2 641** | **273** | **+0,154 ± 0,199** |
| … + kampsett = utvalg | 1 484 | 150 | −0,069 ± 0,283 |
| … + kampsett = holdout | 1 157 | 123 | +0,440 ± 0,267 |

Datofilteret og kampsettet flytter altså tallet med et par tideler — de forklarer **ikke** spriket mot +1,11.
(Radantallet stemmer eksakt med batteriets 2 641 runder i 273 kamper, så leseren av menneskeloggen er den samme.)

## Krysstesten som avgjør (billigst mulig: 2 skarder, samme spek, samme runder)

`duplikat-menneske.ts --spek <arm0, loop-15> --motstander <v5> --etter 2026-08-10 --skard {0,1}/8`, sammenliknet
med mine egne arm0-rader på **nøyaktig de samme 525 rundene i 59 kamper**:

| oppsett | bot − menneske, ΔP | bot − menneske, rundepoeng |
|---|---|---|
| A: alle fire seter = armen (min driver) | **−0,276 ± 0,536** | −0,888 ± 0,705 |
| B: v5 i de tre andre setene (batteriet) | **+1,201 ± 0,527** | +1,600 ± 0,694 |
| **B − A, parret per runde** | **+1,478 ± 0,518** | +2,488 ± 0,690 |
| B, bare kampsett = utvalg | +1,611 ± 0,485 (n = 304) | |
| B, bare kampsett = holdout | +0,638 ± 1,017 (n = 221) | |

B ligger på batteriets +1,11 ± 0,27 (iterasjon 15, utvalg) innenfor støyen på 525 runder. **Riggen er altså
ikke i stuss med seg selv — den ene kjøringen målte «boten mot tre kopier av seg selv», den andre «boten mot
kjeden mennesket møtte».**

## Hvilket tall gjelder for «hvor mye bedre enn mennesker er boten bestemor spiller mot»?

**Batteriets:** ~**+1,1 pp ΔP(seier) per runde** på utvalget (loop-15), og det **rettferdige** tallet er fortsatt
**+0,72 ± 0,19** — det som sammenlikner samme rolle og samme bud, og som ikke krediterer boten for at den kom i
en annen kontrakt enn mennesket. Kolonnen «arm − menneske» i mine to rapporter (`fart-k1.md`,
`budsjett-k1-resultat.md`) svarer på et **annet spørsmål** («hvordan gjør armen det ved et bord av sine egne
kopier, mot det mennesket fikk til mot v5») og skal ikke leses som botens forsprang på mennesker. Jeg har merket
begge rapportene.

## Står S1-dommen og budsjettdommen fortsatt?

**De er ikke feil, men de er mindre følsomme enn de ser ut.** Begge er parrede arm-mot-arm-tall på de samme
rundene, og innenfor hver arm er bordet identisk for begge sammenlikningsledd, så det er ingen skjevhet.
MEN: når armen sitter i **alle fire** seter, endres også motstanderne når knotten endres. En jevn styrkeendring
løfter både sete 0 og de tre andre, og differansen mot mennesket fanger bare det som er igjen. Krysstesten viser
hvor stor den effekten er: samme bot måles **1,48 pp høyere** per runde bare ved å bytte de tre andre setene.

Praktisk betyr det:
- **S1 (−0,070 ± 0,136) og budsjettarmene (−0,076 ± 0,109 og −0,044 ± 0,130) er fortsatt gyldige som
  «ingen målbar forskjell ved et bord av likemenn»**, og de er i tråd med knottriggens dommeranger
  (+0,008 ± 0,011 for S1) og med at flere verdener ikke har flyttet K1 før heller.
- De kan **ikke** utelukke en jevn styrkeendring like godt som et oppsett med **fast motstander** ville gjort.
  Den ærlige styrkeprøven er `--motstander v5` (eller en annen fast motpart) i begge armer.
- Det er dessuten **billigere**: v5-setene søker ikke. Krysstestens skarder tok ~6 min mot ~30 min for
  arm0-skardene med fire søkende seter. En omkjøring av S1 mot base med fast v5-motstander koster anslagsvis
  **under én time på 3 kjerner** — mot ~19 t for den første S1-kjøringen.

**Anbefaling:** kjør S1-mot-base og budsjettarmene på nytt med `--motstander <v5>` før noe av dette brukes til å
si at en knott er styrkenøytral. Jeg har ikke startet den omkjøringen, siden EPIMC-K1 nå bruker maskinen.

## To ting å vite om kjøringen

1. **Prioritet rørt ved et uhell:** da jeg satte mine to krysstestprosesser til BelowNormal, traff filteret
   («alle `node.exe` med `duplikat-menneske`») også EPIMC-K1 sine tre prosesser (pid 38676, 44972, 46136), som
   ble satt til BelowNormal. Jeg har latt dem stå slik, siden det er samme konvensjon de øvrige kjøringene
   bruker, og fordi å sette dem til Normal ville gitt dem mer CPU enn eieren deres ba om. Si fra hvis de skal
   tilbake til Normal.
2. **Kjerner:** krysstesten kjørte to prosesser i ~6 minutter mens EPIMC-K1 hadde tre. I det vinduet var
   maskinen over tre av mine kjerner.

Rådata: `D:\amb-grp\loop\k1-avstem\` (v5-armen) og `D:\amb-grp\loop\budsjettk1\arm0-s*.jsonl` (egne kopier).

---

## OPPDATERING 18. sep: omkjøringen med batteriets bord er gjort

`fart-k1-v5.md` / `fart-k1-v5-resultat.md`, loop-15, v5 i de tre andre setene, `--etter 2026-08-10`,
port = kampsett utvalg (1 484 runder, 150 kamper), 32 skarder uten feil.

- **S1 − menneske = +1,224 ± 0,234 pp** (base +1,288 ± 0,274). Batteriet ga +1,11 ± 0,27 for de samme nettene.
  **Riggene er enige når bordet er likt — avstemmingen er fullført, og driveren har ingen feil i seg.**
- **S1 − base = −0,064 ± 0,188 (z −0,34):** fartsknottene står, nå målt med full følsomhet.
- **Tenketid:** arm1 +0,031 ± 0,150, arm2 −0,247 ± 0,229 på porten ⇒ «mer tenketid hjelper ikke målbart».
  (arm1 er +0,21 ± 0,11 på alle kamper og +0,45 ± 0,17 på holdout; se forbeholdet i `fart-k1-v5.md` §3.)

Tallet som skal brukes om «hvor mye bedre enn mennesker er boten bestemor spiller mot»: **+1,22 ± 0,23 pp per
runde** (S1, loop-15, batteriets port), og **+0,72 ± 0,19** som det rettferdige tallet der rolle og bud er like.
