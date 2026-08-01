# Hva menneskedataene sier – 2026-08-01

Kilde: Val Town-valen `arvindfroi/amerikaneren-data`, tabellen `hendelser`.
13 563 hendelser, 117 startede partier, 813 ferdigspilte runder, 27 fullførte
kamper. Perioden 2026-07-23 → 2026-08-01. Mennesket sitter alltid i **sete 0**
(`MENNESKE = 0` i `web/app.ts`), botene i 1–3.

Alle tallene under kommer fra SQL mot valen; spørringene står nederst.

---

## 1. Hovedfunnet: hele forskjellen ligger i FORSVAR og MAKKERSPILL, ikke i utspill

Bare runder med tallmelding (n=812). Laget til budvinneren finnes ved at
`delta` har samme fortegn som budvinnerens egen `delta`.

| rolle for mennesket | runder | snittbud | kontrakt klart | slakk (lagStikk − bud) |
|---|---|---|---|---|
| mennesket melder selv | 303 | 8,95 | **0,832** | +0,75 |
| bot melder, mennesket er MAKKER | 323 | 8,87 | **0,833** | +0,38 |
| bot melder, mennesket FORSVARER | 186 | 8,99 | **0,274** | −0,86 |

**Kontraktprosenten er identisk (0,832 mot 0,833) om mennesket melder selv
eller bare er makker til en bot.** Botens utspill er altså ikke problemet.
Men når mennesket sitter på motsatt side, faller den samme botens kontrakt
fra 0,833 til 0,274 – på samme budnivå (8,87 mot 8,99).

Forskjell 0,559, SE 0,039 → **14,4 SE**. Det er ikke støy.

Sammenlikningen makker-mot-forsvar er ren: begge er bot-meldte kontrakter,
samme budhøyde, tilfeldig giv. Det eneste som varierer er hvilken side
mennesket sitter på.

Funnet holder for hver enkelt spiller og begge motstandere:

| spiller | klart når menneske er makker | klart når menneske forsvarer |
|---|---|---|
| familien vs PIMC/MAKS | 0,816 (n=103) | 0,154 (n=65) |
| spiller-G vs PIMC/MAKS | 0,826 (n=115) | 0,250 (n=48) |
| familien vs Nevro | 0,841 (n=44) | 0,548 (n=31) |
| spiller-C vs PIMC/MAKS | 0,929 (n=28) | 0,267 (n=15) |
| spiller-G vs Nevro | 0,765 (n=17) | 0,231 (n=13) |

(Spillernavnene er byttet med stabile etiketter før commit – repoet er
offentlig. Koblingen ligger bare i valen, som er Arvinds egen.)

Dette er nøyaktig hullet i målemetodikken vår: alle benkene holder «alt annet
er NevroHjerne», og grådigbenken kan ikke måle forsvar i det hele tatt.

## 2. PIMC/MAKS ser SVAKERE ut enn Nevro mot mennesker – motsatt av benken

Samme spørring, delt på motstander:

| motstander | menneske forsvarer: n | snittbud | kontrakt klart |
|---|---|---|---|
| Nevro | 53 | 9,32 | **0,434** |
| PIMC/MAKS | 132 | 8,86 | **0,205** |

Nevro byr høyere og klarer likevel kontrakten dobbelt så ofte mot menneskelig
forsvar. Forskjell 0,229, SE 0,077 → 3,0 SE.

**Advarsel – ikke adopter på dette.** Det er ukontrollert: ulike økter, ulike
datoer, og «familien» kan være ulike personer fra gang til gang. Heterogent
mellom spillere: familien 0,548 mot Nevro vs 0,154 mot PIMC (stor forskjell),
men G 0,231 mot 0,250 (ingen forskjell). Skal dette avgjøres, må det måles
parret – samme spiller, samme økt, vekslende motstander.

Hvis det holder, er det den direkte bekreftelsen på «endgame er å slå oss, ikke
mesterAI»: styrke målt mot Nevro overføres ikke til mennesker.

## 3. Menneskene vinner – men fullføringstallene er skjeve

| motstander | kamper fullført | mennesket vant | snittpoeng menneske | runder |
|---|---|---|---|---|
| PIMC/MAKS | 16 | 12 | 93,8 | 13,5 |
| Nevro | 11 | 6 | 87,1 | 14,8 |

Én av fire spillere skal vinne 25 % av tiden. **Advarsel:** bare 27 av 117
startede partier ble fullført. Om folk oftere forlater partier de taper, er
seiersandelen overvurdert. Rundetallene i punkt 1 og 2 rammes ikke av dette –
de teller hver ferdigspilte runde uansett om kampen ble fullført.

## 4. Mennesket byr oftere og treffer bedre på samme budhøyde

Mennesket vinner 303 av 812 budrunder = **37 %** (mot 25 % ved likhet), og
klarer likevel kontrakten oftere enn boten på hvert eneste budnivå:

| bud | menneske n | klart | slakk | bot n | klart | slakk |
|---|---|---|---|---|---|---|
| 8 | 67 | 0,97 | +1,48 | 116 | 0,75 | +0,51 |
| 9 | 183 | 0,82 | +0,67 | 314 | 0,61 | −0,16 |
| 10 | 41 | 0,71 | +0,15 | 74 | 0,51 | −0,59 |
| 11 | 9 | 0,56 | −0,89 | 2 | 0,00 | −1,50 |

Merk at «bot»-kolonnen her blander de to rollene fra punkt 1, så mye av
forskjellen er menneskets forsvar og ikke botens budvalg. Boten på bud 9 tar i
snitt 8,84 stikk – den overbyr systematisk med 0,16 – mens mennesket på bud 9
tar 9,67.

Menneskets budhandlinger (n=1196): PASS 522, 8→244, 9→238, 7→123, 10→45,
11→10, 6→10, AMERIKANER→2, 5→2.

## 5. Menneskeklokka peker på de to beslutningene vi ikke har løst

Betenkningstid per beslutning:

| beslutning | n | snitt | maks | total |
|---|---|---|---|---|
| vrak | 323 | **33,4 s** | 179 s | 3,0 t |
| trumfvalg | 386 | **27,0 s** | 308 s | 2,9 t |
| bud | 1196 | 11,2 s | – | 3,7 t |
| kortvalg | 9843 | 4,1 s | 395 s | 11,1 t |

Vrak og trumfvalg er der mennesket bruker klart mest tid per beslutning – og
det er nøyaktig de to beslutningene der vi ikke har noen målt vinner
(«vrak: ingen målt vinner – nevro står»; trumf: bare lengste farge + høyest
etterlys). Menneskeklokka er et gratis vanskelighetsorakel.

Kortvalg fordelt på stikk:

| stikk | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sek | 4,28 | 4,74 | 4,88 | 4,65 | 4,77 | 4,94 | 4,29 | 4,08 | 3,80 | 3,22 | 2,83 | 2,09 |

Tenketiden er flat gjennom stikk 0–5 og faller så jevnt. Mennesket mener altså
at første halvdel av runden er den vanskelige – som stemmer både med Arvinds
egen observasjon («de spiller meget dårlig i de første stikkene») og med den
målte obduksjonen der E1 var DÅRLIGERE enn nevro i stikk 1–4 og bedre i 5–9.

---

## 6. ATFERDSPROFIL – menneskene mot NevroHjerne på NØYAKTIG samme stillinger

`examples/menneske-atferd.ts` gjenskaper hver runde og måler de samme radene som
`examples/mesterai-atferd.ts`. Full utskrift i `analyse/menneske-atferd.txt`.

**KORREKTHETSPORTEN: 0 av 813 runder forkastet.** De fire vrakede kortene
faller ut av de 16 i hver eneste budvinnerrunde. Frø-koblingen er verifisert.

### Utspillet i stikk 1 – den store forskjellen

Motoren tvinger trumfutspill for budvinneren, så begge er på 100 % «trumf ut».
Det frie valget er hvilken trumf. 304 parrede stillinger:

| mål | menneske | NevroHjerne | SD (12 verdener) |
|---|---|---|---|
| **laveste trumf på hånd** | **0,993** | **0,447** | **0,224** |
| høyeste trumf på hånd | 0,000 | 0,069 | 0,089 |
| lav trumf ut (≤7) | 0,987 | 0,770 | 0,589 |
| valør på utspillet | 3,17 | 5,14 | 6,91 |

Menneskene følger lavtrumf-konvensjonen i 302 av 304 kontrakter. NevroHjerne
gjør det i under halvparten, og SD-orakelet i bare én av fem.

**Dette er IKKE i motstrid med den tidligere målingen** (docs/moe2.md: «SD
foretrekker laveste trumf 33 av 50, +1,041 ± 0,429»). Den var en BINÆR test —
laveste mot høyeste. Den nye er et argmax over alle lovlige kort. Begge kan
stemme samtidig, og gjør det: alle tre er enige om at den HØYESTE trumfen er
feil (menneske 0,0 %, nevro 6,9 %, SD 8,9 %). Uenigheten gjelder hvor lavt man
skal gå, og der er menneskene langt mer ytterliggående enn både boten og
solveren.

Rangeringen er monoton: menneske 3,17 < nevro 5,14 < SD 6,91.

**Og det er nettopp her «endgame er å slå oss, ikke mesterAI» biter.** SDs
rollout bruker NevroHjerne som motstandermodell. SD svarer derfor på «hva er
best mot nevro», ikke «hva er best mot et menneske». Konvensjonens påståtte
verdi — å tvinge forsvaret til et valg — forutsetter en motstander som kan
presses. En regel «spill alltid laveste trumf» ville flytte boten BORT fra SD,
og vil sannsynligvis tape en måling mot nevro selv om den vinner mot mennesker.
Den hypotesen kan ikke avgjøres på benken vår; den må måles på nettsiden.

### Etterlysning og trumfvalg – her er de enige

| mål | menneske | NevroHjerne |
|---|---|---|
| etterlyste høyeste lovlige | **1,000** (304/304) | – |
| etterlyst valør | 12,99 | 12,92 |
| valgte lengste farge | 0,931 | 0,947 |
| trumflengde | 5,99 | 6,00 |
| enighet om trumffargen | \- | 0,911 |

Arvinds hypotese om at budvinneren skal velge den **sterkeste** og ikke bare
den **lengste** fargen får ikke støtte her: menneskene velger lengste farge
93,1 % av gangene, nevro 94,7 %. Menneskene gjør altså ikke det Arvind
beskriver – de gjør stort sett det samme som boten.

### Vrak

| mål | menneske | NevroHjerne |
|---|---|---|
| vraket i senere trumf | **0,000** | 0,005 |
| vraket ess/konge | 0,018 | 0,042 |
| snittvalør på vraket kort | 6,10 | 6,31 |
| farger tømt av vraket | 0,83 | – |
| enighet (kort av 4) | \- | 0,758 (3,03 av 4) |

Menneskene vraker aldri trumf og halvparten så ofte honnører. Nevro er nesten
enig – 3 av 4 kort er de samme.

### Bud – mennesket er MINDRE nøyaktig enn SD, men bommer på riktig side

| mål | verdi | SE | n |
|---|---|---|---|
| SD-estimat for menneskets hånd | 8,85 | 0,06 | 813 |
| menneskets høyeste bud | 8,29 | 0,04 | 619 |
| **avvik menneske − SD** | **−0,67** | 0,07 | 619 |
| passandel (bød aldri tall) | 0,24 | 0,02 | 813 |

På kontraktene mennesket faktisk vant (n=303):

| mål | verdi |
|---|---|
| SD ville sagt | 9,40 |
| mennesket meldte | 8,95 |
| laget tok | 9,70 |
| bom mennesket \|bud − fasit\| | **1,29** |
| bom SD \|sd − fasit\| | **1,01** |

SD er altså en **bedre** håndevaluator enn mennesket – men mennesket bommer
systematisk NED (melder 8,95, tar 9,70). Det er nøyaktig den asymmetrien vi
allerede har målt: overbud koster 14,75 poeng per stikk, underbud 1,51. Å være
unøyaktig og forsiktig slår å være nøyaktig og nøytral.

Det er samtidig en advarsel mot å trene budet mot SD-fasiten rått: SD sier 9,40
der menneskene sier 8,95 og vinner. Fasiten må ha rund-ned-leddet med seg.

---

## Det som ikke er brukt ennå: givene kan rekonstrueres eksakt

`start`-hendelsen lagrer `frø`, og motoren deler ut med
`delUt(frø, rundeNr)` (`src/motor.ts:159`) – rent deterministisk. Hver
`valg-*`-hendelse bærer `rundeNr`. **Alle 813 rundene kan derfor deles ut på
nytt kort for kort**, og da kjenner vi menneskets nøyaktige hånd i hvert eneste
valg som er logget.

Det gjør disse målingene mulige uten å samle inn noe nytt:

1. **Budet mot SD-orakelet.** 1196 menneskebud med kjent hånd. Byr mennesket
   over eller under SD? Og – siden `runde` gir faktisk `lagStikk` – hvem av
   mennesket, nevro og SD treffer best på de *samme* hendene? Det er et ferdig
   fasitsett for håndevaluatoren.
2. **Trumfvalget.** 386 menneskevalg der de 16 kortene (hånd + talong) er
   kjent. Tester Arvinds hypotese direkte: velger mennesket den *sterkeste*
   fargen eller bare den *lengste*?
3. **Etterlysningen.** Hvilken valør kaller mennesket? Vi målte at høyest er
   verdt et helt poeng for boten.
4. **Utspillet i stikk 0 når mennesket er budvinner.** Den stillingen er fullt
   rekonstruerbar (ingen kort er spilt ennå) – direkte test av
   makker-trumfkonvensjonen.

Det som *ikke* kan rekonstrueres: botenes egne kort underveis (bare
budvinneren logges), hvilke fire kort som ble vraket (bare antallet), og
bordet midt i et stikk.

---

## Spørringene

Lagmedlemskap:
```sql
CASE json_extract(data,'$.budvinner')
  WHEN 0 THEN json_extract(data,'$.delta[0]') WHEN 1 THEN json_extract(data,'$.delta[1]')
  WHEN 2 THEN json_extract(data,'$.delta[2]') ELSE json_extract(data,'$.delta[3]') END AS dbv
-- mennesket er på budvinnerens lag  <=>  (delta[0] > 0) = (dbv > 0)
```
Fortegnet virker fordi taperlaget får −2n/−n og forsvarerne får +egne stikk;
ved klart får laget +2n/+n og forsvarerne 0.

Rollefordelingen (punkt 1):
```sql
WITH r AS (SELECT json_extract(data,'$.budvinner') bv, json_extract(data,'$.melding.bud') bud,
  json_extract(data,'$.klart') klart, json_extract(data,'$.lagStikk') lag,
  json_extract(data,'$.delta[0]') d0, /* dbv som over */ ...
  FROM hendelser WHERE type='runde' AND json_extract(data,'$.melding.type')='tall')
SELECT CASE WHEN bv=0 THEN 'melder' WHEN (d0>0)=(dbv>0) THEN 'makker' ELSE 'forsvarer' END rolle,
  COUNT(*), AVG(bud), AVG(klart), AVG(lag-bud) FROM r GROUP BY rolle;
```
