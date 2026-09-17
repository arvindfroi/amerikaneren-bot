# DATASKALERINGSKURVE FOR TROHODET (13. sep)

Spørsmålet: **blir trohodet bedre log-lineært med antall treningsrader, og hvor mange rader
trengs for 35 %?** Seks forsøk på å gi troen nye SANSER har målt null eller skade. Data og
kapasitet er ikke prøvd systematisk. Dette er den målingen.

Skrives fortløpende, punkt for punkt. Ingenting her er en påstand om at noe virker; det er tall.

## OPPSETTET (låst før første arm)

**Treningsbassenget** (996 trekk, alt i kamp-trening-frøbåndet 1,950–1,981 G):

| kilde | rader | kamper |
|---|---|---|
| `D:\amb-krav\_korpus\a996-0/1.bin` | 175 807 | 350 |
| `D:\amb-grp\loop\iter2..7\tro\trening-*.bin` | 808 012 | 2 700 |
| **sum** | **983 819** | **3 050** |

**Holdout, den samme i ALLE armene, aldri skalert:** `D:\amb-grp\loop\iter8\tro\holdout-0/1.bin`
— 18 981 rader, 60 kamper, kamp-holdout-båndet (1,985–1,997 G).

**Frøbåndene er kontrollert, ikke antatt.** Alle unike frø i hver gruppe er talt og krysset:
0 delte frø mellom treningsbassenget og holdout (og båndene er strukturelt disjunkte:
trening < 1,981 G, holdout ≥ 1,985 G). To rader fra samme giv deler hele kortfordelingen, så en
radvis deling ville lekket fasiten — derfor deles det på KAMP, aldri på rad.

**Skaleringen deler på KAMP, ikke på rad.** `--andel` i
`D:\amb-grp\loop\skalering\skaler-tren.py` (kopi av `verktoy/mlb-tro-tren.py` med to nye flagg,
resten ordrett samme kode) beholder en andel av treningskampene etter en hash av frøet.
Delmengdene er nestede for et gitt salt: 1/8 ⊂ 1/4 ⊂ 1/2 ⊂ 1/1. Radvis deling ville latt 1/8 se
nesten alle kampene og målt noe annet enn «mindre data».

**Alt annet er likt:** 10 epoker (som a996-grunnlinja), lr 1e-3, batch 4096, nett 1024,768,512,
beste epoke valgt på holdout. Frø 2 bruker både et annet init-frø og et annet salt (altså andre
kamper), fordi begge deler er den ekte variasjonen i «mer data».

## TO PROSENTTALL — DE ER IKKE DET SAMME

Dette må stå eksplisitt, for prosjektets egne tall blander dem:

* **gulv → klarsyn** `(ln 3 − tap) / ln 3`. Dette er tallet batteriets K8-rad faktisk regner:
  iterasjon 7 hadde log-tap 0,9544 → 13,13 %, og 0,9503 → 13,50 %. Altså er **«13,1–13,5 %»
  målt mot KLARSYN**, tross etiketten «gulv → tak» i rapporten.
* **gulv → nåbart tak** `(ln 3 − nett) / (ln 3 − tak)` (`k8-tak-dom.ts`, `andelRettferdig`).
  Dette er taket terskelen på 35 % er skrevet mot (AdamsMax.md). Det finnes bare der den eksakte
  tellingen er nåbar (sene stikk); på de dekkede stillingene lå et tidligere nett på 18,0 %
  klarsyn mot 24,9 % rettferdig.

Holdout-tapet fra treneren gir det FØRSTE tallet direkte på alle 12 stikk. Det andre tallet
krever `k8-tak.ts` på dens egne stillinger, og kjøres til slutt med alle armenes nett i samme
`--nett`, så taket regnes én gang og alle armene måles på nøyaktig de samme stillingene.

## RESULTATER

Fylles ut punkt for punkt etter hvert som armene blir ferdige.

Referanser på nøyaktig den samme holdouten (18 981 rader, 344 268 kortprediksjoner):

| referanse | K8-tap | treff % | gulv → klarsyn % |
|---|---|---|---|
| gulv (uniform over 3) | 1,09861 | 25,0 | 0,00 |
| kapasitet (teller bare plasser igjen) | 1,0945 | 31,8 | 0,37 |
| **ANKER: løkkas nett i drift `tro-8.bin`** | **0,92660** | **46,45** | **15,66** |

Ankeret er ikke en arm i kurven: `tro-8.bin` er varmstartet gjennom åtte iterasjoner og har
dermed sett langt mer data enn noen enkelt arm her. Det står der for å vise hvor kurven må
komme for å være relevant.

| arm | treningsrader | kamper | K8-tap (holdout) | treff % | gulv → klarsyn % | beste epoke |
|---|---|---|---|---|---|---|
| 1/8 frø 1 | 125 751 | 386 | 0,98798 | 43,57 | 10,07 | 10 |
| 1/4 frø 1 | 251 928 | 779 | 0,97089 | 44,17 | 11,63 | 10 |
| 1/2 frø 1 | 490 175 | 1 520 | 0,95841 | 44,59 | 12,76 | 10 |
| 1/1 frø 1 | 983 819 | 3 050 | 0,94436 | 45,62 | 14,06 | 10 |
| 1/8 frø 2 | 121 345 | 384 | 0,98823 | 43,50 | 10,05 | 10 |
| 1/4 frø 2 | 250 493 | 784 | 0,97022 | 44,12 | 11,69 | 10 |
| 1/2 frø 2 | 495 937 | 1 520 | 0,95610 | 44,70 | 12,97 | 10 |
| 1/1 frø 2 | 983 819 | 3 050 | 0,94415 | 45,50 | 14,06 | 10 |
| 1/1 bredt nett frø 1 | 983 819 | 3 050 | 0,94642 | 45,49 | 13,85 | 7 |
| 1/1 bredt nett frø 2 | 983 819 | 3 050 | 0,94583 | 45,48 | 13,91 | 6 |

## KAPASITET ELLER DATA? (begge frø inne)

Samme 983 819 rader, samme alt, bare et bredere/dypere nett (2048,1536,1024 mot 1024,768,512):

| nett | K8-tap (2 frø) | snitt | treff % | beste epoke |
|---|---|---|---|---|
| 1024,768,512 (dagens) | 0,94436 / 0,94415 | **0,94426** | 45,62 / 45,50 | 10 / 10 |
| 2048,1536,1024 (bredt) | 0,94642 / 0,94583 | **0,94613** | 45,49 / 45,48 | **7 / 6** |

Det brede nettet er **ikke bedre — det er 0,0019 dårligere** enn det smale på nøyaktig de samme
dataene. Det er ni ganger frøstøyen mellom to identiske armer (0,0002), og de to brede armene er
enige seg imellom. Legg merke til epokevalget: det brede nettet topper på epoke 6–7, det smale
kjører helt til 10. Den ekstra kapasiteten brukes til å OVERTILPASSE, ikke til å lære mer.

**Svaret på kapasitetsspørsmålet er dermed entydig i den retningen det ble stilt: det er DATA som
binder, ikke kapasitet.** Et dobbelt så bredt nett hjelper ikke; det skader litt. Å lete etter
gevinst i større nett på dagens datamengde er å lete på feil sted.

## STØYEN, MÅLT PÅ DISSE ARMENE

De to 1/8-armene har ULIKT init-frø OG ulike kamper (salt 0 mot salt 1, 386 mot 384 kamper):
0,98798 mot 0,98823 — **0,00025 fra hverandre**. Det er langt under de 0,0012 som er sitert som
frøstøy andre steder, og ~58 ganger mindre enn effekten av én dobling av data (0,0145). Signalet
i denne kurven er altså ikke i nærheten av å drukne i støy.

## TILPASNINGEN (alle 8 kurvearmer)

```
tap = 1,23322 − 0,021007 · ln(N)     R² = 0,9943   (8 armer, 2 frø per punkt)
residualer: 1/8 f1 +0,00142  1/4 f1 −0,00108  1/2 f1 +0,00043  1/1 f1 +0,00101
            1/8 f2 +0,00092  1/4 f2 −0,00187  1/2 f2 −0,00164  1/1 f2 +0,00080
```

Kurven er **log-lineær**, og det er ikke noe man må myse for å se: residualene (±0,0019) er
på størrelse med frøstøyen. Hver DOBLING av treningsdata gir **−0,01456 nat/kort**, altså
**+1,33 pp** av veien gulv → klarsyn. Ingen metning i det målte området — 1/1 ligger like pent
på linja som 1/8, og de to frøene i hvert punkt faller praktisk talt oppå hverandre.

**Ekstrapolasjonen avhenger helt av HVILKET tak man regner mot**, og det er derfor de to
prosenttallene måtte skilles først:

| mål | mot KLARSYN (tak 0) | mot NÅBART TAK (interim, tak 0,3050) |
|---|---|---|
| 20 % | 2,1 · 10⁷ rader = 22 × | 1,2 · 10⁶ rader = **1,2 ×** |
| 25 % | 2,9 · 10⁸ rader = 294 × | 7,7 · 10⁶ rader = **7,8 ×** |
| **35 %** | 5,4 · 10¹⁰ rader = 5,5 · 10⁴ × | 3,4 · 10⁸ rader = **341 ×** |

Tak 0,3050 er den eksakte tellingen fra `analyse/k8-tak-eksakt-dom.txt` (alle seter, dekkede
stillinger). **FORBEHOLD, og det er ikke lite:** det taket er målt på SENE stikk (7–9), der den
eksakte tellingen er nåbar, mens holdout-tapet her er over alle 12 stikkene. Tallene i høyre
kolonne er derfor en interimregning, ikke dommen — se den ferske målingen under, som gir et
vesentlig HØYERE tall.

## DEN FERSKE TAKMÅLINGEN (alle 8 nett i samme `k8-tak.ts`-kjøring)

`k8-tak.ts --nett tro-8.bin,<alle 8 armer> --kamp --maksrunder 3 --giver 24`, drivere som
iterasjon 8. Taket regnes ÉN gang, og alle nettene scorer nøyaktig de samme stillingene:
**384 stillinger, 130 dekket av den eksakte tellingen, tak = 0,3008** (taket selv når 72,6 % av
veien til klarsyn).

| nett | log-tap (dekkede) | gulv → nåbart tak % |
|---|---|---|
| **`tro-8.bin` (løkkas nett i drift)** | 0,9237 | **21,9** |
| 1/8 frø 1 / frø 2 | 1,0033 / 1,0123 | 11,95 / 10,82 |
| 1/4 frø 1 / frø 2 | 0,9812 / 0,9807 | 14,71 / 14,78 |
| 1/2 frø 1 / frø 2 | 0,9674 / 0,9759 | 16,45 / 15,39 |
| 1/1 frø 1 / frø 2 | 0,9720 / 0,9689 | 15,87 / 16,26 |

```
tap = 1,20828 − 0,017669 · ln(N)     R² = 0,7856   (8 armer)
per dobling: −0,01225 nat/kort = +1,54 pp av veien til taket
  20 %:  4,1 · 10⁶ rader =    4,2 × dagens basseng
  25 %:  4,0 · 10⁷ rader =     40 × dagens basseng
  35 %:  3,6 · 10⁹ rader = 3,7 · 10³ × dagens basseng
```

**Denne kurven er MYE mer støyete enn holdout-kurven** (R² 0,79 mot 0,9943), og det er ikke
overraskende: den hviler på 130 stillinger i 24 kamper, mot 344 268 kortprediksjoner på holdout.
Punktene 1/2 og 1/1 er ikke engang monotone (16,45 → 15,87 i frø 1, 15,39 → 16,26 i frø 2).
Med SE på ~2,5 pp per arm kan disse 130 stillingene ikke skille 1/2 fra 1/1.

### PARVIS, som fjerner variasjonen mellom stillinger

`--par` sammenlikner to nett på nøyaktig de samme stillingene, med SE klynget på kamp:

| par | doblinger | d nett→rettferdig (pp) | d log-tap, ALLE rader |
|---|---|---|---|
| 1/8 → 1/1, frø 1 | 3 | **+3,9 ± 1,7** | −0,0348 ± 0,0061 |
| 1/8 → 1/1, frø 2 | 3 | **+5,4 ± 1,7** | −0,0348 ± 0,0070 |
| 1/4 → 1/1, frø 1 | 2 | +1,2 ± 1,5 | −0,0163 ± 0,0055 |
| 1/2 → 1/1, frø 1 | 1 | −0,6 ± 1,6 | −0,0044 ± 0,0061 |

**Over tre doblinger står gevinsten** (+3,9 og +5,4 pp, begge over 2 SE), og snittet 4,65 pp / 3
doblinger = **1,55 pp per dobling** treffer den frie tilpasningens 1,54 pp nesten eksakt. Én enkelt
dobling drukner derimot i støyen på 24 kamper (−0,6 ± 1,6). Så: takmålingen bekrefter stigningen,
men bare når man måler over en stor nok avstand. Den kan ikke brukes til å påstå metning.

## SVARET

**1. Ja, kurven er log-lineær — påfallende rent.** På holdout, der målingen er presis
(344 268 kortprediksjoner), er R² = 0,9943 over åtte armer og to frø, med residualer på
størrelse med frøstøyen. Ingen metning noe sted i det målte området. Hver dobling av data:
−0,0146 nat/kort. I takets egen metrikk: +1,55 pp av veien gulv → nåbart tak per dobling,
bekreftet parvis.

**2. Hvor mange rader for 35 %?** Det avhenger av hvor man starter, og det viktigste
startpunktet er ikke armene mine — det er løkkas nett i drift:

| fra | nivå i dag | doblinger til 35 % | rader | mot dagens basseng |
|---|---|---|---|---|
| min beste arm (1/1, fra bunnen av) | 16,1 % | 12,2 | ~4 · 10⁹ | ~4 000 × |
| **`tro-8.bin`, løkkas faktiske nett** | **21,9 %** | **8,5** | **~3,5 · 10⁸** | **~360 ×** |

**Svaret på spørsmålet «10×, 100× eller 10⁶×» er altså: ~10²–10³ ×, ikke 10⁶ ×.** Fra der
løkka faktisk står trengs størrelsesorden 350 ganger dagens basseng — ~3,5 · 10⁸ rader, som
med 3 050 kamper per 984 000 rader svarer til ~1,1 millioner selvspillkamper.

**3. Er det realistisk?** Datagenereringen målte 295 rader/s per skard i iterasjon 8. Med 6
skard (~1 800 rader/s) er 3,5 · 10⁸ rader ~2,2 døgn sammenhengende; med alle 24 kjernene i
skard er det under ett døgn. **Det er ikke en vegg — det er en helg med maskinen.** To
praktiske hindre står likevel i veien, og de er ekte:

* **Frøbåndet er for lite.** `KAMP_BÅND.trening` i `mlb-trodata.ts` er avsatt til 4 000 kamper
  (1,950–1,981 G). 1,1 millioner kamper krever et nytt, større bånd — en kodeendring, ikke bare
  mer kjøretid.
* **Diskplass.** ~4 kB per rad × 3,5 · 10⁸ = ~1,4 TB i dagens format. Det må enten strømmes
  (tren mens du genererer, kast radene) eller komprimeres.

**4. Kapasitet binder ikke.** Dobbelt så bredt nett (2048,1536,1024) på nøyaktig de samme
dataene er 0,0019 DÅRLIGERE, med begge frø enige, og topper på epoke 6–7 mot 10. Det er data
som binder.

### DET SOM IKKE ER VIST

* **Ekstrapolasjonen er en ekstrapolasjon.** Kurven er målt over én tierpotens (1,2 · 10⁵ →
  9,8 · 10⁵ rader) og strekkes 2–3 tierpotenser videre. Log-lineær vekst kan flate ut når som
  helst utenfor det målte vinduet; ingenting her utelukker det. Det eneste som er MÅLT, er at
  den ikke har flatet ut ennå.
* **Bassenget er blandet.** Radene kommer fra iterasjon 2–7, spilt av ulike nettgenerasjoner.
  Mer data fra ÉN generasjon oppfører seg ikke nødvendigvis likt.
* **Alt er målt mot boter.** Menneskeraden er ikke rørt i dette forsøket.
* **Armene her er trent fra bunnen av**, mens `tro-8.bin` er varmstartet gjennom åtte
  iterasjoner. Derfor er anker-raden brukt som startpunkt i regnestykket over, ikke 1/1-armen.
