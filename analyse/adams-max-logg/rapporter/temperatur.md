# Temperatur på trovekten: er troen overkonfident?

Gren `troledd-2026-09-13` i **`D:\amb-krav`** (fortsettelse av `troledd.md`).
13. sep, maks 6 kjerner. **Ingen K1-målinger startet herfra.**

## Svaret i én setning

**Troen er ikke overkonfident — den er nesten perfekt kalibrert, og skarpheten er fortjent.**
Den sier at favorittverdenen gjelder i 66,7 % av tilfellene, og den gjelder i **63,9 ± 0,7 %**.
Optimal temperatur er **T\* = 1,20** (felles) og **T\* = 1,00** (marginalt). Hypotesen om at
ESS/K = 0,179 er «for skarpt for en tro som er 22 % av veien til taket» er **forkastet på sitt
eget mål**: de to tallene måler ikke det samme, og konsentrasjonen er dekket av bevis.

Angeret mot eksakt fasit sier det samme over **1 683 skillende stillinger**: ingen temperatur
slår T = 1, og den ene armen som så lovende ut (T = 5, z = −2,29 på n = 914) **snudde fortegn**
på en uavhengig batch. **Innstillingen er: ingen T-spek til K1.**

---

## 1. Knotten: `~mlbu=<fil>,T<temp>`

`logW_tro / T`, lagt inn i `sdpar.ts` (`grunnvekt`), båret av `SikkerOpts.trotemp` og parset
i `agentspek.ts` etter mønsteret til `~lik=`: **komma** fordi en filsti kan slutte på «T3», og
**stor T** fordi `~lik=…,t<temp>` alt eier den lille.

**T = 1 er bit-identisk**, og det er prøvd, ikke påstått (`test/trotemp.test.ts`, 7 prøver):

- `~mlbu=<fil>,T1` gir samme kort, samme σ, samme n og samme lag som speken uten knotten,
  i hver stilling. Nøkkelen er FRAVÆRENDE ved T = 1, så `vurderPar` får samme funksjonsobjekt
  som før — ikke en lukning som deler på 1.
- **Formen er prøvd**: `trotemp: T` gir nøyaktig samme verdier som en trovekt kalleren selv
  har delt på T, for T ∈ {1,5; 3; 8}. Knotten gjør det den sier.
- Kontrollarm: T8 endrer σ et sted, ellers ville knotten stått frakoblet (feilklassen kanal 2
  sto i fra §111 til 13. sep).

## 2. Målingen: 5 016 beslutninger, 6 arbeidere, ingen utspillinger

`examples/trotemp-kalibrering.ts` + `trotemp-kal-sum.ts`. Settet er nøyaktig det sampleren
bruker: K = 32 kandidater fra `trekkVerden` med den ekte rng-strømmen (`visningsfrø`), pluss
den SANNE verdenen. Proben koster ingen utspillinger, så den dekker mange stillinger billig.

### 2a. Kalibreringskurven, FELLES (over kandidatverdenene, T = 1)

«Troen sier at DENNE verdenen gjelder med p. Gjelder den p av gangene?»

| predikert p | n | predikert | **FAKTISK** | avvik |
|---|---|---|---|---|
| 0–2 % | 135 398 | 0,2 % | 0,3 % ± 0,0 | +0,1 pp |
| 2–5 % | 16 522 | 3,2 % | 4,1 % ± 0,2 | +0,9 pp |
| 5–10 % | 5 822 | 6,9 % | 7,7 % ± 0,3 | +0,8 pp |
| 10–15 % | 1 856 | 12,1 % | 12,3 % ± 0,8 | +0,2 pp |
| 15–20 % | 882 | 17,2 % | 15,6 % ± 1,2 | −1,5 pp |
| 20–30 % | 839 | 24,3 % | 19,8 % ± 1,4 | −4,5 pp |
| 30–40 % | 458 | 34,5 % | 34,9 % ± 2,2 | +0,4 pp |
| 40–50 % | 284 | 44,9 % | 41,2 % ± 2,9 | −3,7 pp |
| **50–70 %** | 475 | 59,8 % | 51,6 % ± 2,3 | **−8,3 pp** |
| 70–100 % | 2 845 | 95,0 % | 93,8 % ± 0,5 | −1,2 pp |

Kurven ligger på diagonalen. Det eneste båndet med reell overkonfidens er 50–70 % (−8,3 pp),
og det er 475 av 165 000 oppføringer. Marginalt (per skjulte kort) er avviket enda mindre:
største utslag er −2,7 pp i 50–70-båndet, resten under 2 pp.

### 2b. Temperatursveipet

| T | marg. log-tap | felles log-tap | ESS/K | troen sier topp | **FAKTISK topp** |
|---|---|---|---|---|---|
| **1** | **1,0408** | 1,2184 | **0,175** | 66,7 % | **63,9 % ± 0,7** |
| 1,25 | 1,0446 | **1,2070** | 0,209 | 62,9 % | 63,9 % |
| 1,5 | 1,0533 | 1,2221 | 0,240 | 59,5 % | 63,9 % |
| 2 | 1,0747 | 1,2884 | 0,294 | 53,2 % | 63,9 % |
| 3 | 1,1170 | 1,4724 | 0,387 | 42,0 % | 63,9 % |
| **4** | 1,1525 | 1,6682 | **0,467** | 32,8 % | 63,9 % |
| **5** | 1,1809 | 1,8507 | **0,540** | 25,8 % | 63,9 % |
| 8 | 1,2377 | 2,2691 | 0,706 | 14,4 % | 63,9 % |

Gulv: uniformt over settet er felles log-tap ln 33 = 3,496 og topp-p 3,0 %.

**T som gir ESS/K i 0,4–0,6 (oppdragets spørsmål 2) er T ≈ 4–5.** Men se hva det koster:
ved T = 4 sier troen 32,8 % om favoritten sin, mens den favoritten er riktig 63,9 % av
gangene. Temperaturen fjerner ikke overkonfidens — **den lager underkonfidens**, og felles
log-tap stiger 0,45 nat over T = 1.

### 2c. Den optimale temperaturen

- **Marginalt: T\* = 1,00.** Ingenting å hente. Trohodets kategoriske utgang er kalibrert.
- **Felles: T\* = 1,20**, som sparer 0,0119 nat av 1,2184. Et halvt prosent av tapet.

Forholdet T\*_felles / T\*_marginalt = 1,20. Produktantakelsen (kortene summeres som
uavhengige, mens håndstørrelsene kobler dem) koster altså **noe**, men bare 20 % i
temperatur — ikke den faktoren hypotesen trengte.

### 2d. Per rolle — og her ligger det egentlige funnet

| gruppe | n | ESS/K | felles log-tap | T\* | topp: sier / faktisk |
|---|---|---|---|---|---|
| ALLE | 5 016 | 0,175 | 1,2184 | 1,2 | 66,7 % / 63,9 % |
| **foerer** | 1 449 | **0,439** | **3,0000** | 1,3 | 20,1 % / 15,8 % |
| makker | 1 120 | 0,068 | 0,4967 | 1,1 | 85,7 % / 83,3 % |
| forsvar | 2 447 | 0,068 | 0,4937 | 1,2 | 85,7 % / 83,5 % |
| stikk 0–3 | 1 762 | 0,235 | 1,2450 | 1,1 | 65,8 % / 64,0 % |
| stikk 4–7 | 1 853 | 0,131 | 1,0396 | 1,2 | 72,8 % / 69,8 % |
| stikk 8+ | 1 401 | 0,160 | 1,4214 | 1,3 | 59,8 % / 56,0 % |

Dette snur lesningen i `troledd.md` §4. Budvinnersetet er ikke flatt fordi troen er ydmyk
der — det er flatt fordi den **ikke vet noe** der: felles log-tap 3,00 mot det uniforme
gulvet 3,50, og favoritten treffer 15,8 %. Forsvar og makker er skarpe fordi de **faktisk
vet**: log-tap 0,49 og favoritten treffer 83 %.

Og det forklarer `troledd.md` §3a uten å trenge overkonfidens: troens netto virkning på
kortet er +0,0 ± 1,9 pp i førersetet fordi det ikke finnes informasjon å bære dit — ikke
fordi flat vekt er sunt.

### 2e. KONTROLLARMEN — måler proben i det hele tatt troen?

En høy treffrate er ikke et funn før den kan feile. Kontrollen er den SAMME fordelingen med
seteklassene rotert ett hakk (0→1→2→0, vraket urørt): samme form, samme skarphet, samme
gulv — bare feil sete.

| arm | log-tap | troen sier topp | **FAKTISK topp** | p(sann) |
|---|---|---|---|---|
| **EKTE tro** | 1,2184 | 66,7 % | **63,9 %** | 59,1 % |
| **ROTERT (kontroll)** | 10,2707 | 60,5 % | **6,1 %** | 6,1 % |
| uniformt gulv | 3,4956 | 3,0 % | 3,0 % | 3,0 % |

Den roterte troen er **like skråsikker** (sier 60,5 % om favoritten sin) og **nesten aldri
riktig** (6,1 %). Det er nøyaktig slik overkonfidens ser ut når den finnes — og proben ser
den umiddelbart. Den ekte troen viser ikke spor av det. Målingen kan altså feile, og den
gjør det ikke her.

I tillegg gjenskaper proben vektfunksjonen uavhengig og **sammenlikner** med den ekte for
hver eneste beslutning (kaster ved avvik > 1e-9). Alle 5 016 passerte, så kontrollarmen og
vekten er bygd av samme fordeling.

Forbeholdet er prøvd separat: på delmengden der rng-strømmen ikke selv trakk den sanne
verdenen (n = 4 869, altså 97,1 %) er tallene 67,8 % sagt mot 64,6 % faktisk — uendret.

### 2f. Hvorfor «22 % av veien til taket» og «ESS/K 0,179» ikke er i strid

Hypotesen i oppdraget var: *en tro som er 22 % av veien til taket bør ikke konsentrere massen
på 18 % av verdenene.* Målingen sier at den bør nettopp det, og grunnen er at de to tallene
måler to forskjellige egenskaper:

- **Skarphet / informasjon** — hvor mye troen tør å si. Det er 22 %-tallet og ESS-tallet.
- **Kalibrering** — om det den sier stemmer. Det er dette oppdraget faktisk spurte om.

En tro kan være langt fra taket og likevel perfekt kalibrert: da vet den lite, men den vet
hvor lite den vet. Det er tilstanden vi måler. Overkonfidens ville sett ut som kontrollarmen
i §2e — høy påstand, lav treffrate — og ingenting i den ekte troen ligner på det.

Den marginale kurven sier det samme (største avvik −2,7 pp, i 50–70-båndet):

| predikert p | n | predikert | FAKTISK | avvik |
|---|---|---|---|---|
| 0–2 % | 83 199 | 0,2 % | 0,1 % | −0,2 pp |
| 5–10 % | 22 032 | 7,6 % | 7,4 % | −0,1 pp |
| 15–20 % | 28 831 | 17,6 % | 18,5 % | +1,0 pp |
| 20–30 % | 78 683 | 25,6 % | 27,0 % | +1,4 pp |
| 30–40 % | 129 861 | 34,2 % | 34,1 % | −0,1 pp |
| 40–50 % | 29 635 | 44,0 % | 42,2 % | −1,8 pp |
| 50–70 % | 18 675 | 58,1 % | 55,4 % | −2,7 pp |
| 70–100 % | 13 598 | 86,8 % | 86,5 % | −0,4 pp |

**Eierens observasjon er altså riktig som prinsipp og feil som diagnose for dette leddet.**
«Spill som om du er usikker» er nøyaktig hva en kalibrert vekt allerede gjør — og trovekten
ER kalibrert. Hallusineringen `troledd.md` fant ligger ikke i vekten; den ligger i argmaks
over 48 støyete utspillingsanslag (43,8 % av kortbyttene er ren resamplingsstøy). Det er
usikkerhet i VERDIEN, ikke i TROEN, og en temperatur på trovekten kan ikke nå den.

## 3. Angeret mot eksakt fasit, per T

`examples/trotemp-anger.ts` + `trotemp-anger-sum.ts`. Armene deler stilling OG RNG-strøm, så
de trekker de SAMME 32 kandidatene og skiller seg bare i vektens skarphet. Fasiten er
`poengRotVerdier` på den virkelige given ved ≤ 7 kort igjen, og **bare der fasiten skiller**
(`troledd.md` §2: 88 % er flate). Armene evalueres først etter at fasiten er felt, så de
flate koster ingen utspillinger — det er det som gjør åtte armer mulig.

**914 skillende stillinger** (to batcher à 6 arbeidere, ~2 900 flate forkastet, ~45 min).

| arm | snitt anger | traff fasit | **PARRET mot T=1 (diff)** | bedre/verre | PARRET (lag) |
|---|---|---|---|---|---|
| **T1 (dagens bot)** | 1,0839 | 83,8 % ± 1,2 | (referanse) | – | (referanse) |
| T1,5 | 0,9442 | 84,6 % | −0,140 ± 0,125 (z = −1,12) | 27/21 | −0,245 ± 0,155 (z = −1,58) |
| T2 | 1,0518 | 83,4 % | −0,032 ± 0,144 (z = −0,22) | 28/34 | −0,044 ± 0,169 (z = −0,26) |
| T3 | 0,9949 | 84,8 % | −0,089 ± 0,152 (z = −0,59) | 38/30 | −0,120 ± 0,188 (z = −0,64) |
| **T5** | **0,7925** | 84,8 % | **−0,291 ± 0,159 (z = −1,83)** | 48/41 | **−0,455 ± 0,198 (z = −2,29)** |
| T8 | 1,0933 | 83,8 % | +0,010 ± 0,155 (z = 0,06) | 46/48 | ±0,000 ± 0,197 (z = 0,00) |
| C (støygulv) | 0,9868 | 83,5 % | −0,097 ± 0,143 (z = −0,68) | 45/49 | −0,181 ± 0,189 (z = −0,96) |
| B (uten tro) | 1,1907 | 83,0 % | +0,107 ± 0,171 (z = 0,63) | 53/60 | +0,138 ± 0,225 (z = 0,61) |

**Fem av seks temperaturer er null.** Den sjette, T = 5, er nominelt bedre: z = −1,83 på
diff og −2,29 på lagmålet. Fire grunner til at det foreløpig leses som støy, ikke som funn:

1. **Seks armer er testet**, på to mål. Med den familien kreves |z| ≈ 2,6 for 5 %, ikke 2,0.
2. **Støygulvet C er også nominelt bedre** (−0,097, z = −0,68) — og C har ingen
   informasjonsgrunn til å være det. Den samme troen, bare et annet verdenstrekk. Det er
   størrelsen på armstøyen i denne målingen, målt direkte.
3. **Kurven er ikke en kurve.** 1,5 → −0,14, 2 → −0,03, 3 → −0,09, 5 → −0,29, 8 → 0,00.
   Hjalp temperering, skulle effekten vokse glatt og så avta. Dette er sagtenner.
4. **Kalibreringen motsier den.** Ved T = 5 sier troen 25,8 % om favoritten sin, som er
   riktig 63,9 %. At en så grovt UNDERkonfident vekt skulle spille bedre, er ikke en
   mekanisme — det er det mønsteret man ser når man plukker maksimum av seks støyende armer.

Batch 1 alene ga T5 = −0,111 ± 0,193; batch 2 må da ha gitt rundt −0,47. Armen er ustabil
mellom batcher. **Derfor ble en tredje batch kjørt med BARE T1 mot T5** (tre armer i stedet
for åtte, altså dobbelt så mange stillinger per time).

### 3a. Knotten er svakere enn støyen den skulle dempe

Andel endrede kort, samlet over alle tre batchene:

| sammenlikning | andel endrede kort |
|---|---|
| **STØYGULV** (T=1 mot annet verdenstrekk) | **29,0 % ± 1,5** |
| T=1 mot T1,5 | 16,8 % ± 1,2 |
| T=1 mot T2 | 20,6 % ± 1,3 |
| T=1 mot T3 | 24,8 % ± 1,4 |
| T=1 mot T5 | 27,9 % ± 1,5 |
| T=1 mot T8 | 30,1 % ± 1,5 |

Å temperere hele veien til T = 5 endrer kortet SJELDNERE (27,9 %) enn å trekke verdenene på
nytt gjør (29,0 %). Temperaturen er altså en mindre forstyrrelse enn den støyen `troledd.md`
utpekte som problemet. Først ved T = 8 — der troen er praktisk talt slått av (ESS/K 0,71) —
er den på nivå med støygulvet. Det er den mekaniske grunnen til at ingen T kan hjelpe: den
knotten står ikke på det leddet som svikter.

### 3b. Batch 3 avgjorde det: T5 SNUDDE FORTEGN

**769 nye, uavhengige skillende stillinger**, bare T1 mot T5 og støygulvet:

| arm | snitt anger | PARRET mot T=1 (diff) | PARRET (lag) |
|---|---|---|---|
| **T1** | 0,4872 | (referanse) | (referanse) |
| **T5** | 0,6398 | **+0,153 ± 0,131 (z = +1,16)** | **+0,173 ± 0,163 (z = +1,06)** |
| C (støygulv) | 0,4534 | −0,034 ± 0,113 (z = −0,30) | +0,046 ± 0,147 |
| B (uten tro) | 0,7083 | +0,221 ± 0,151 (z = 1,47) | +0,376 ± 0,187 (z = 2,01) |

Fortegnet snudde. Den «lovende» armen er nominelt **verre** på uavhengige data, og
diagnosen fra §3 punkt 1–4 er bekreftet: −0,29 var maksimum av seks støyende armer.

### 3c. Alt samlet: 1 683 skillende stillinger

| arm | snitt anger | PARRET mot T=1 (diff) | PARRET (lag) |
|---|---|---|---|
| **T1 (dagens bot)** | 0,8112 | (referanse) | (referanse) |
| T5 | 0,7227 | −0,089 ± 0,105 (z = −0,84) | −0,168 ± 0,131 (z = −1,28) |
| **C (støygulv)** | 0,7431 | **−0,068 ± 0,093 (z = −0,73)** | −0,077 ± 0,122 (z = −0,63) |
| B (uten tro) | 0,9703 | +0,159 ± 0,115 (z = 1,38) | +0,247 ± 0,149 (z = 1,66) |

**T5 er ikke til å skille fra støygulvet.** −0,089 mot C-armens −0,068: den samme troen med
bare et annet verdenstrekk henter like mye. Det er definisjonen på null effekt.

Verdt å merke seg ved siden av: **arm B, uten troen i det hele tatt, er verst** (+0,159 diff,
+0,247 lag). Troen betaler altså — den betaler bare best ved T = 1.

## 4. Arbeidslogg

- [x] T-knotten i speken, T = 1 bit-identisk (prøvd, 7 prøver)
- [x] ESS/K som funksjon av T — 0,4–0,6 krever T ≈ 4–5
- [x] KALIBRERINGEN: troen er **ikke** overkonfident (T\* = 1,20 felles, 1,00 marginalt)
- [x] Kontrollarm (rotert tro): sier 60,5 %, treffer 6,1 % — proben KAN feile, og gjør det ikke
- [x] Anger mot eksakt fasit per T — **n = 1 683** over tre batcher: ingen T slår T = 1;
      T = 5 snudde fortegn på uavhengige data og er ikke til å skille fra støygulvet
- [x] Speken som skal K1-måles: **INGEN.** Se under.

## 5. Dommen — og hvilken spek jeg IKKE ber om

**Ingen T-spek er verdt en K1-måling.** Tre uavhengige grunner, i styrkerekkefølge:

1. **Troen er kalibrert** (n = 5 016, kontrollarm bestått). Sier 66,7 %, treffer 63,9 %.
   Det er ingen overkonfidens å rette. T\* = 1,20 er verdt 0,5 % av log-tapet.
2. **Angeret ser ingenting** (n = 1 683). T = 5 henter −0,089 ± 0,105 der det rene
   støygulvet henter −0,068 ± 0,093.
3. **Knotten står på feil ledd.** Å temperere helt til T = 5 endrer kortet i 27,9 % av
   tilfellene; å bare trekke verdenene på nytt endrer det i 29,0 %. Temperaturen er en
   mindre forstyrrelse enn støyen den skulle dempe.

Knotten BLIR STÅENDE i koden, av to grunner: den er bit-identisk ved T = 1 (prøvd, så den
koster ingenting), og den gjør spørsmålet målbart for ettertiden i stedet for å måtte bygges
på nytt. Skulle et senere, skarpere trohode bli overkonfident, er måleutstyret på plass:
`examples/trotemp-kalibrering.ts` + `trotemp-kal-sum.ts` svarer på 25 sekunder.

**Den speken jeg fortsatt ber om å få målt er den fra `troledd.md` §7 — σ-porten**, ikke en
temperatur. Den står allerede i kø, og denne målingen har ikke rørt den.

### Hva eieren hadde rett i, og hva tallene flytter

«Den må spille som om den ikke egentlig vet» er riktig som prinsipp — og det er nettopp det
en kalibrert vekt gjør. Trovekten ER kalibrert, så hallusineringen han så, kommer ikke
derfra. Den kommer fra leddet `troledd.md` pekte på: **argmaks over 48 støyete
utspillingsanslag bytter kort i 43,8 % av tilfellene uten at noe informasjonsbærende er
endret.** Det er usikkerhet i VERDIEN av et kort, ikke i TROEN om hvor kortene ligger, og
ingen temperatur på trovekten kan nå den. Kuren hører hjemme på verdisiden: σ-porten, eller
å slutte å la et støyete argmaks overstyre nettet.

Ett funn til, som ikke var bestilt: **budvinnersetets flate vekt (ESS/K 0,439) er ikke
ydmykhet, det er uvitenhet.** Felles log-tap 3,00 mot det uniforme gulvet 3,50, og
favoritten treffer 15,8 %. Forsvar og makker har log-tap 0,49 og treffer 83 %. Det forklarer
`troledd.md` §3a — troens netto er +0,0 ± 1,9 pp i førersetet fordi det ikke finnes
informasjon å bære dit — uten å måtte anta at flat vekt er sunt.
