# Planen: en Amerikaneren-bot mennesker ikke kan slå i det lange løpet

Skrevet 2026-08-02, omstrukturert 2026-08-04 da målet ble skjerpet.
Erstatter `budplan.md` som hoveddokument; den står fortsatt for detaljene om
budet.

> **MÅLET, Arvinds ord 4. august: «lag en amerikaneren bot som er umulig for
> mennesker å vinne mot i det lange løpet.»**

Det er strengere enn «slå familien», og det er et annet slags mål: det handler
ikke om å vinne en kveld, men om at ingen mengde spilling skal snu regnskapet.

---

# DEL I — STRATEGIEN

## S1. Hva målet krever, i tall

**Målet, skjerpet 4. august.** Arvind: «jeg setter et mål om at vi ikke skal
kunne tape mot mennesker i et race til 100 poeng (med mindre et mirakel
skjer). klarer vi det så er jeg fornøyd!»

Det er et **skarpere** krav enn «i det lange løpet», ikke et mildere. Et race
varer ~17 runder. Snittet måler uendelig mange runder; racet måler halen over
sytten.

Spillet er allerede et race til 100 (`målPoeng: 100`), og 45 fullførte kamper
ligger i Val Town-basen. Utfallet følger samme vendepunkt som poengmålingen:

| periode | kamper | mennesket vant |
|---|---|---|
| 24. juli – 1. aug | 31 | 20 (65 %) |
| 2. august | 5 | 2 (40 %) |
| 3. august | 9 | **1 (11 %)** |

En jevn spiller i et firemannsrace vinner 25 %. Mennesket lå altså klart over
jevnt og ligger nå under.

`verktoy/race100.py` bootstrapper hele runde-vektoren fra 161 ekte runder — en
normaltilnærming duger ikke, fordi fordelingen er trimodal (budvinnerlaget
±18/9 eller ±20/10, forsvarerne 0–3). **Den spådde 11,68 % menneskeseier; det
observerte utfallet var 1 av 9 = 11,1 %.**

| skift i poeng/runde | mennesket vinner racet | |
|---|---|---|
| 0 (i dag) | 11,7 % | |
| **+1,0** | **4,8 %** | «kan ikke tape», 1 av 20 |
| +2,0 | 1,6 % | |
| **+2,5** | **0,9 %** | «med mindre et mirakel skjer» |
| +5,0 | 0,03 % | |

**Målet koster ~+2,5 poeng per runde over Adams slik han sto 3. august.** Hele
budmodellen er verdt +1,07 og hele kortnettet +1,24, så det er omtrent å doble
den samlede verdien av alt botten har.

### Den gamle formuleringen, som fortsatt gjelder for halvdel A

Med en ledelse på `m` poeng per runde og standardavvik `s` er sannsynligheten
for at mennesket ligger foran etter `N` runder `Φ(−m√N/s)`. Målt på Adams-v1:
**m = 1,813, s = 11,455.**

| runder | mennesket foran |
|---|---|
| 100 | 1 av 18 |
| 400 | 1 av 1 292 |
| 800 | 1 av 264 000 |
| 1600 | 1 av 8,2 milliarder |

**Botten er allerede god nok — hvis ledelsen er ekte.** Med 107 runder er den
1,64 SE. Ved 400 runder er den 3,17 SE, og da følger resten av aritmetikk.

**Derfor har målet to halvdeler, og bare den ene handler om botten:**

| | hva som trengs |
|---|---|
| **A. Vise ledelsen** | ~400 menneskerunder mot samme versjon |
| **B. Gjøre den større** | hver +1,0 i ledelse ≈ halverer rundene som trengs |

A kan ikke jobbes fram. Familien må spille. B er alt det andre.

### A og B slåss om det samme, og det avgjør rekkefølgen

**Hver utrulling nullstiller bevisklokka.** Runder spilt mot Adams-v1 sier
ingenting om Adams-v2 — det er en annen spiller. Vi har 107 runder mot v1 og
**0 mot v2**, som står ute nå.

Så B gjør ikke bare A lettere, den ødelegger også arbeidet A har lagt ned. Det
gir én riktig rekkefølge:

1. **Samle forbedringer, ikke rull ut hver for seg.** En utrulling per
   forbedring gir aldri mer enn en håndfull runder per versjon, og da får vi
   aldri de 400.
2. **Rull ut ÉN gang, når batchen er målt ferdig.**
3. **Så fryse.** Ikke rør den mens runder samler seg, uansett hvor fristende
   neste idé er.

Regnestykket for hvor lenge man skal samle før utrulling: ledelse 1,81 krever
~400 runder, 2,5 krever ~210, 3,0 krever ~145. Hver +0,5 i ledelse sparer
altså flere titalls kvelder med kortspill. Men gevinsten flater ut — fra 3,0
til 3,5 sparer bare ~25 runder. **Rundt en ledelse på 3 slutter det å lønne
seg å vente, og da skal den ut og stå i fred.**

## S2. Metoden som har vist seg å virke

Fire lærdommer, hver kjøpt med en måling som overrasket:

1. **Rollout-policyen er alt.** Å bytte NevroHjerne mot vår egen bot i
   SD-evalueringen flyttet førersetet fra −0,357 til **+0,896**. En modell som
   beskriver feil motpart er verre enn ingen modell.

2. **Destillasjon er en støydemper.** Orakelet SPILLER forsvar dårligere enn
   nettet (−0,09) og LÆRER det likevel bort med **+0,187**. En dårlig spiller
   kan være en god lærer. Det er nøkkelen overalt hvor sanntidsstøy ødelegger
   `argmax`.

3. **Flere kandidater gjør søk verre.** Vinnerens forbannelse vokser med
   antall trekninger. Ved vrak, der verdensrommet er 3,8 × 10¹⁴, koster søket
   −0,51 per budvinnerrunde.

4. **Høy viktighet i fordelingen ≠ gevinst utenfor den.** Planblokken hadde 4×
   viktigheten til noen annen ny blokk og ga −0,019.

**Og porten som ikke bøyes:** parret på giv, replikert i disjunkte frøbånd,
tegntest ved siden av snittet. Åtte oppdagelsestall er felt av den, og de to
som overlevde er de eneste som er satt ut.

## S3. De fire linjene, rangert etter forventet gevinst

| linje | status | anslag |
|---|---|---|
| **1. Menneskeklonen** | data låst opp 4. aug | den eneste som angriper målet DIREKTE |
| **2. Vrak/trumf-rangereren** | ✅ 3 bånd, adoptert | +0,49 per budvinnerrunde ≈ +0,12 totalt |
| **3. Skrallen (selvspill)** | konvergerer | +0,06 neste omdreining |
| **4. Bud × kortspill sammen** | 🔄 i gang, se under | +0,155 fra ÉN konstant |

### Hvor de resterende poengene MÅ komme fra

Blandet bord, to Adams-v3 mot to NevroHjerne, 6 000 parrede giver
(`examples/blandetbord.ts`, hver giv spilt to ganger med byttede seter):

| rolle | Adams | NevroHjerne | forskjell |
|---|---|---|---|
| **fører** | +8,557 | +5,111 | +3,447 ± 0,429 (8,0 SE) |
| makker | +3,827 | +4,003 | −0,176 ± 0,167 (−1,05 SE) |
| forsvar | +1,102 | +1,115 | −0,013 ± 0,013 (−0,93 SE) |

**Som makker og forsvarer er Adams ikke målbart bedre enn NevroHjerne.** Ved
et bord med fire Adams er hvert sete fører bare 25 % av tiden. **De øvrige
75 % av rundene spiller boten ikke bedre enn den gjorde før noen av
forbedringene.**

Førertallet er skjevt oppover — NevroHjerne vinner bare budrunden når Adams
passer, altså på hender Adams vurderte som ikke verdt å ta. Men makker- og
forsvarstallene har ikke det problemet: rollen tildeles av hvem som har det
etterlyste kortet, ikke av hvem som valgte å by.

Det følger direkte at målet på +2,5 **ikke kan nås fra førersetet alene**.
Selv en perfekt fører ville bare flytte 25 % av rundene. Forsvar og
makkerspill er tre firedeler av spillet og er urørt mark.

### Hvorfor lag-mot-lag-kalibrering er billigst av alt

Budmodellens beslutningsregel så ut som en avveining mot verdien av å forsvare:

    ev = p·2N(2P−1) + (1−p)·evForsvar,   by hvis ev > evForsvar

Men leddet `(1−p)·evForsvar` kansellerer mot terskelen:

    p·2N(2P−1) + (1−p)·e > e   ⟺   2N(2P−1) > e

**`evForsvar` er ikke verdien av å forsvare. Det er en ren terskel på
kontraktens forventningsverdi.** Boten har krevd at en kontrakt er verdt over
2,5 poeng før den byr, når risikonøytralt optimum er 0. Målt: `0,5` gir
**+0,1512** (bånd 93 M) og **+0,1577 ± 0,0425** (bånd 105 M, 602 avgjorte).

Lærdommen er større enn tallet: **konstanter som ble kalibrert mot en tidligere
versjon av en annen komponent, er gratis gevinst så lenge de finnes.** De
koster ingen trening — bare en sveip og to bånd. Hver gang kortnettet bedres,
er budterskelen igjen for høy.

### Den effektive n er antall AVGJORTE giver

`evForsvar` 1,5 målte +0,1786 ± 0,0499 (3,58 SE) i ett bånd og +0,0306 ±
0,0514 (0,59 SE) i det neste. Årsaken var ikke målingen, men lesningen: bare
**120 av 3 600** giver endret seg. Resten er eksakte nuller som presser SE-en
ned uten å tilføre informasjon. `verktoy/gate2-les.py` skriver nå ut avgjorte
giver og roper under 500.

### Hvorfor menneskeklonen er øverst

Mot en **fast motstanderpopulasjon** er det maksimale et **beste svar**, ikke
en likevekt — en likevektsstrategi gir bevisst fra seg gevinst mot utnyttbare
motstandere. Budmodellen er allerede beviset: de +2,138 den henter kommer av å
utnytte at motparten passer for mye.

Nash er derfor **feil mål** her, ikke bare upraktisk: i et firespillerspill med
skiftende, delvis skjulte partnerskap faller CFRs garanti bort uansett, og selv
en ekte likevekt ville gitt fra seg det vi er ute etter.

**Men Adams' kortspill er et rent nett som ikke sampler verdener**, så en
motstandermodell kan ikke settes inn ved spilletid. Den må bakes inn i
TRENINGSDATAEN: rull ut SD-verdenene med en klone av familien, og destiller.

### Hva som blokkerte den, og hva som er gjort

Klonen krever loggede runder gjenskapt. Av 1 172 lot bare **123** seg gjenskape:
replayen krever nøyaktig den boten som satt der, og divergerer ett kortvalg
forskyver hele turrekkefølgen. De eldste rundene ble spilt mot PIMC.

**Løsningen er ikke bedre gjenskaping — det er å logge giva.** `web/app.ts`
logger nå hele historikken, vraket, trumfen, etterlysningen og makkeren ved
rundeslutt. Hver framtidig runde er treningsdata uten et eneste
gjenskapingssteg.

## S3a. STØRSTE UUTNYTTEDE FUNN: risiko skal styres av STILLINGEN

**Vi måler alt i poeng per runde. Målet er å vinne kamper til 100. De er ikke
samme sak.**

### Først: en feil jeg gjorde, fordi den forklarer hva som er riktig

Første forsøk skalerte botsetenes avvik uten å bevare rundens poengsum, og ga
«mer varians er alltid bedre» i hver eneste stilling — s=3,0 vant overalt. Det
var ikke en innsikt, det var en advarsel. Poengene per runde er tilnærmet
bevart (ett lag får ~27, forsvarerne ~3), så modellen lagde runder der botlaget
fikk tre ganger mer enn fysisk mulig.

Den korrekte operasjonen skalerer avviket fra **rundens eget snitt**, som
bevarer summen eksakt: en risikabel runde er risikabel for ALLE ved bordet,
slik den er i virkeligheten. Boten kan ikke skru sin egen varians uten å skru
motpartens.

**Med den fiksen snudde svaret.** Det første tallet jeg skrev her (+0,55 for å
ta risiko når man ligger bak) var galt.

### Hva som faktisk gjelder

| stilling | beste variansfaktor |
|---|---|
| boten leder klart (>10 poeng) | **0,60** — kvel støyen, la forspranget tale |
| jevnt (±10) | 1,4 |
| boten ligger bak (>10) | **2,00** — ta sjansen |

Det er den klassiske regelen, og den følger av at **boten er favoritten**:
favoritten vil ha lite støy, underdogen vil ha mye. Utslagene er store — ved
(menneske 90, bot 60) gir lav varians 88,8 % menneskeseier og høy 61,8 %.

### Hele politikken målt

| | mennesket vinner racet |
|---|---|
| dagens spill (konstant) | 12,02 % |
| alltid lav varians | 10,90 % |
| **stillingsbevisst** | **6,27 %** |

Nesten en halvering, tilsvarende et skift på **~+0,7 poeng per runde** i
race-tabellen. Og det er en beslutningsregel, ikke en modell.

### Teorien har et navn: Dubins & Savage (1965)

Simuleringen gjenoppdaget et bevist resultat. Når målet er å NÅ ET MÅL FØRST
(ikke å maksimere vekst), er optimal strategi **dristig** når p ≤ ½ og
**forsiktig** når p ≥ ½. Boten har kanten, altså forsiktig — med mindre den
ligger bak, og da er den lokalt underdog.

**Ikke Kelly.** Kelly maksimerer veksttakten på lang sikt og satser aldri alt.
Vi bryr oss ikke om veksttakt, bare om å komme først, og der gir Kelly feil
svar.

### MÅLT MED EKTE GRENSER: gevinsten er +0,08, ikke +0,7

Vekslingskursen mellom snitt og varians ble hentet ut av budterskel-sveipene:

| evForsvar | snitt | SD |
|---|---|---|
| −8,0 | −0,071 | 13,658 |
| −3,0 *(i dag)* | +0,234 | 12,070 |
| −1,0 | **+0,350** | 11,448 |
| +3,0 | −0,081 | 10,317 |

Variansen kan bare skrus **0,855× til 1,13×**, ikke 0,6× til 2,0×, og begge
ytterpunkter koster ~0,31 i snitt. Med de faktiske tallene:

| politikk | mennesket vinner |
|---|---|
| dagens (alltid −3,0) | 11,95 % |
| alltid dristig | 13,98 % |
| alltid forsiktig | 14,49 % |
| **stillingsbevisst** | **11,26 %** |

**+0,69 prosentpoeng, altså ~+0,08 poeng per runde.** Begge faste ytterpunkter
er verre enn i dag — snittkostnaden dominerer helt.

### Men den peker på riktig knott

**Budterskelen er en dårlig variansknott** fordi den endrer snittet mye. En
GOD knott er et valg mellom handlinger med LIKT snitt og ulik varians:

> Blant handlinger hvis EV ligger innen ε av den beste, velg den med høyest
> varians når du ligger bak og lavest når du leder.

Da koster det ε per konstruksjon, og ε kan være vilkårlig liten. Budmodellen
regner allerede EV per bud, så tie-breaking på varians er noen få linjer.
**Aldri prøvd.** Det er forskjellen på å skru en knott som koster, og å plukke
gratis varians blant likeverdige valg.

## S3b. I KØEN: flerfortsettelses-orakelet (Brown & Sandholm 2019)

Pluribus søker til en dybdegrense, og der velger hver spiller mellom **fire
ulike fortsettelsesstrategier** eller en blanding av dem. Poenget er ikke å
spare regnekraft — det er å hindre at søkeren blir for optimistisk om linjene
mellom nåtilstanden og grensen. Forfatterne noterer at det virker **utenfor
tomanns nullsumspill**, altså i vårt regime.

**Vårt SD-orakel gjør det motsatte: hver verden rulles ut med ÉN policy —
Adams selv.** Verdien av en stilling er regnet under antakelsen om at alle
spiller nøyaktig som oss. Det er selvbekreftende, og skjevheten peker samme vei
hver gang.

Det kaster nytt lys på vårt eget spor: ti søkeforsøk i kortspillet målte
negativt, og alle ble ført på «feil rollout-policy». Diagnosen var for smal.
**Enhver ENKELT rollout-policy gjør søket selvbekreftende** — å bytte fra
NevroHjerne til Adams fjernet én feil, ikke mekanismen.

Og det biter hardest der hullet er: **forsvarsverdi regnet mot én bestemt
fører er optimistisk per konstruksjon.** Forsvaret lærer å slå VÅR fører, ikke
å spille mot spennet av førere det møter.

### Den effektive varianten, som koster det samme

Naiv flerfortsettelse ganger rollout-kostnaden med k. Det ville kuttet
korpuset til en tredjedel for å rette en skjevhet — og diagnosen vår er at de
tidligere blokkforsøkene var datamengdebegrenset, så den byttehandelen er ikke
åpenbart riktig.

Billigere, og nesten like riktig: **trekk fortsettelsen per verden i stedet for
å kjøre alle k i hver verden.** Verden *w* spilles ferdig med policy `c(w)`
trukket fra settet, og verdien aggregeres med en pessimistisk statistikk
(f.eks. snittet av den dårligste halvparten) i stedet for et rent snitt over
én policy. Samme antall rollouts, samme kostnad — men etikettene slutter å
anta at motparten spiller som oss.

Det er ikke identisk med Pluribus, som tar et eksplisitt minimum over
motpartens valg. Det fanger korreksjonen, ikke garantien.

### Fortsettelsessettet

Perturbasjoner av det vi har, ikke nye nett — da er kostnaden per framoverpass
uendret:

| | |
|---|---|
| Adams-v3 | blueprint |
| forsvarsaggressiv | tar stikk tidlig |
| forsvarspassiv | dukker |
| trumfgjerrig / trumfdragende | motsatte vaktflagg |

### Hva som IKKE overføres

Pluribus unngikk **bevisst** motstandermodellering: de møtte ukjente
motstandere, og å tilpasse seg er selv utnyttbart. Vi møter en fast familie, og
da er beste svar riktig mål. Der går vi motsatt vei, og det er et valg, ikke en
forglemmelse. Nash faller uansett bort i et firespillerspill med skiftende,
delvis skjulte makkerskap.

## S3bb. TROSMODELLEN: øyne som bare en maskin kan ha

Arvind, 4. august: *«jeg vet at john doe ikke har noen rutere igjen fordi i
runde 3 så hev han på en spar […] dermed tror jeg john doe har hjerter ess.»*

Det er en **slutningskjede**, og vi hadde bare første ledd. Troblokken (v6)
sier «John kan ha HØYST tre hjerter». Kjeden trenger «John har hjerter ess med
sannsynlighet 0,7». Forskjellen på å telle og å vite.

`examples/tro-data.ts` + `verktoy/tro-tren.py`. Fasiten er **gratis**: ved
rundeslutt vet vi hvor hvert kort lå. Ingen SD-evaluering, ingen rollouts —
bare spilling. Målt ~40× raskere per prosess enn SD-korpuset.

**Første kjøring, 187 000 rader:**

| | treffrate |
|---|---|
| uniform | 25,0 % |
| **kapasitet** *(alt en perfekt teller kan få til)* | **31,5 %** |
| **modellen** | **43,5 %** |
| **modellen, bare honnører** | **47,4 %** |

Kapasitetsreferansen er ikke en stråmann — den vekter hver plassering etter
hvor mange kort den har igjen, altså alt som følger av offentlig informasjon.

**Og den er bedre på honnørene enn på totalen.** Det er riktig vei: de fleste
usette kort er små og likegyldige, det er essene som avgjør stikk.

**Hvorfor dette er mer enn en trekkblokk.** Verdenstrekkeren vekter i dag
verdener bare etter BUDET (`budForenlighet`), ikke etter spillet. Det er
grunnen søket vårt ikke kunne virke — det samplet nesten tilfeldige verdener.
[Solinas et al. (AAAI-19)](https://arxiv.org/abs/1903.09604) rapporterer
«substantial increase in cardplay strength» i Skat av nettopp denne fiksen.

**IKKE VIST ENDA:** at bedre tro gir flere STIKK. Treffrate er forutsetningen,
ikke gevinsten.

## S3c. PARKERT: motstandermodellen (`src/moe2/profil.ts` er bygget)

Arvind, 4. august: *«jeg vil at john doe skal starte et spill mot botten og
etterhvert gjennom spillet så blir botten bedre og bedre til å slå han. ingen
data på forhånd.»*

Modulen står med 12 tester. Den er **ikke koblet inn** — den venter til
+1-målet er nådd, etter Arvinds prioritering.

**Slik den skal virke.** En løpende teori om hver enkelt ved bordet, bygget
utelukkende av det som skjer ved bordet. Starter på «gjennomsnittsmenneske»,
skjerpes hver runde. Boten spiller vanlig i starten og blir gradvis verre å
møte — ikke fordi den er sterkere, men fordi den er skreddersydd mot deg.

| | |
|---|---|
| **alt er bevis** | bud, vrak, trumfvalg, utspill, om han dukker — og betenkningstiden, som vi logger i ms |
| **tre ting skilles** | stil (hvordan han velger), ferdighet (hvor godt han utfører), flaks (hvordan kortene falt) |
| **tiltroen styrer** | tidlig nøytralt, senere utnyttende. Sikkerhet på to runder er verre enn ingen profil |
| **ved rundeslutt ser den kort** | alle tolv kort er spilt og står i historikken. Ikke lekkasje — slik leser mennesker hverandre |

**Det Arvind ikke sa, men som hører med:** makkeren må modelleres også (han
etterlyses per runde); motstanderne tilpasser seg tilbake, så nye runder må
veie tyngre enn gamle; og modellen må tåle å ta feil — møter den en som
spiller tilfeldig, skal den falle tilbake til nøytralt, ikke til noe verre.

**Farten er målt, ikke ønsket:** en som byr 10 med 4 trumf gir overbud +0,84
etter ti runder og +1,32 etter tretti (sant nivå +1,85). Krympingen er så treg
med vilje.

## S3d. FORSKNINGSAGENDAEN: hva vi ikke vet, rangert etter hva det ville endret

### α-μ retter nøyaktig de to feilene som felte søket vårt

[Cazenave & Ventos](https://arxiv.org/pdf/1911.07960) angriper PIMCs to kjente
teoretiske defekter:

| defekt | hva den gjør | deres fiks |
|---|---|---|
| **strategy fusion** | søket later som det kan spille ulikt i hver verden, men må velge ÉTT trekk | **spiller samme trekk i alle verdener under søket** |
| **non-locality** | lokalt beste trekk er globalt dårlig | Pareto-fronter som tilstandsevaluering |

Målt hos dem, 500 giver med 20 verdener: **62,0 % mot PIMCs 60,2 %** på fulle
kort, 48,2 % mot 46,4 % med 36 kort igjen.

**MEN KOSTNADEN ER AVGJØRENDE FOR OSS:** 1,2 sekunder per trekk selv med
transposisjonstabeller og kutt. Vår bot svarer umiddelbart i nettleseren. α-μ
er teoretisk riktig og praktisk utenfor rekkevidde slik den står — med mindre
den destilleres til et nett, som er det vi allerede gjør med SD-orakelet.

**Og merk hva sammenlikningen deres er:** α-μ mot PIMC, der begge søker. Vi har
INGEN søk. Spranget fra ingenting til PIMC er trolig større enn fra PIMC til
α-μ, og det er det spranget vi bør måle først.

### Det vi bør lete etter, i rekkefølge

1. **Skat-stigen.** Kermit er state of the art, og forbedringene kom i en
   rekkefølge. Å vite hvor mye hvert trinn var verdt DER ville erstattet
   gjetningene våre med tall. Vi anslår i dag at troen er verdt mest — det er
   en hypotese, ikke kunnskap.
2. **Hvordan lært tro SKAL brukes.** Som trekk i policy-nettet, eller som
   sampler for søk? ReBeL og «public belief states» kan ha en tredje vei.
   Dette avgjør neste steg og vi vet det ikke.
3. **Hvor dypt resonnementet skal gå.** Arvinds kjede inneholder «budvinneren
   hev lave kort FORDI det egnet han best» — resonnement om motpartens
   beslutningsprosess, ikke om kortene. Når koster nivå 2 mer enn det smaker?
4. **Race-optimalt spill.** Bridge-litteraturen sier at scoringsformen endrer
   optimal risiko (matchpoints → ta sjanser, IMPs → spill trygt). Vårt race er
   nærmere matchpoints. Men vi har målt effekten selv (S3a) og fant den større
   enn litteraturen ville antydet — der bør vi stole på egen måling.

## S4. Det som er lagt på hylla, og hvorfor det ikke er forkastet

Alle ble målt FØR 3. august, da rollout-policyen og oppvarmingen ble rettet.
De fortjener en ny sjanse med riktig oppsett, ikke en gravstein.

| | målt | hvorfor det kan snu |
|---|---|---|
| minneblokk, telling, auksjon, plan, verdi | alle ~0 | målt mot et feilspesifisert orakel |
| søk i vrak/velg | −0,51 | kandidatene var dårligere enn NevroHjernes eget |
| eksakt enumerering | −0,29…−0,78 | eksakt DD er feil modell av motparten |
| ti søkeforsøk i kortspillet | negative | alle med feil rollout-policy |

---

## S4b. AVHENGIGHETSREGNSKAPET — hva som blir gammelt når noe endres

Arvind, 4. august: *«budmodellen, burde ikke den spares til spillet er
optimalt? den byr ok for øyeblikket også blir den utdatert hvis spillferdighet
forbedres.»*

Han har rett, og innsikten er større enn budmodellen. **Hver eneste gevinst
hentet 4. august kom fra samme feil: en komponent kalibrert mot en tidligere
versjon av en annen.** Budterskelen, vrakvalget, dødeblokken — og budmodellen
selv, som er den største.

Feilen er ikke at komponentene blir gamle. Det er at **ingen prosess sier når
de skal fornyes.** Denne tabellen er den prosessen.

### Avhengighetsgrafen

Roten er **kortnettet**. Endres det, er alt under stale.

| komponent | kalibrert mot | må kjøres på nytt når |
|---|---|---|
| **budmodellen** (`bud-gbt.json`) | utspillingspolicyen i `buddata.ts` | kortnettet, vaktflaggene eller vrakrangereren endres |
| **budterskelen** (`evForsvar`) | budmodellens μ | budmodellen endres |
| **vrakrangereren** (`vrakrang.bin`) | rollout-policyen i `vrakorakel.ts` | hele stakken endres |
| **kortnettet** (`d7alle.bin`) | SD-orakelets stillingskilde OG rollout | seg selv — derfor iterasjon |
| **trosnettet** (`tro.bin`) | stillingene botens spill produserer | stakken endres merkbart |
| vaktflaggene (`abmp`) | kortnettet | målt 4. aug: fortsatt riktige |
| befolkningsprioren i profilen | familiens faktiske spill | populasjonen endres |

### Regelen

> **Endres kortnettet, rekalibreres budmodellen. Alltid.**

Det er billig nok til å gjentas: seks timer generering, og treningen er
ridge-regresjon i lukket form — bit-identisk, ingen hyperparametre som kan
settes feil. Det er vedlikehold, ikke et prosjekt.

### Hvorfor det ikke er et argument for å vente

Innvendingen «vent til spillet er optimalt» forutsetter at kortnettet snart
endrer seg. Det gjør det ikke: fire kandidater natt til 5. august tapte alle
mot `d7alle`, og nettet har stått uendret siden 3. august. Å vente betyr å
betale feilkalibreringen hver runde på ubestemt tid.

Og terskelen kan bare rette **nivået**. Skjevheten er hånd-avhengig — noen
hender undervurderes mer enn andre — og en global konstant kan ikke rette
formen. Det er residualen bare en retrening henter.

## S4c. HVA BOTEN SER — en gjennomgang mot reglene

Arvind, 5. august: *«gå veldig grundig over hva den ser og husker … les reglene
og tenk hvordan en bot hadde gjort dette optimalt, også se tilbake på vår
bot.»*

### Reglene, presist

| | |
|---|---|
| 4 spillere, 12 kort hver | talong på 4 |
| budvinneren tar talongen og vraker 4 | **4 kort er permanent døde** |
| det etterlyste kortet MÅ være trumf | og budvinneren kan ikke ha det selv |
| budvinneren MÅ åpne i trumf | i første stikk |
| makkerplikt | den som har det etterlyste kortet må legge det i stikk 1 |
| budlaget får ingenting for overstikk | forsvarerne får **+1 per eget stikk** |

**De tre reglene om trumf låser hverandre.** Føreren leder trumf, makkeren har
et trumfkort (det etterlyste ER trumf) og må følge farge — altså må han legge
nettopp det kortet. **Målt: makkeren avsløres i stikk 1 i 400 av 400 runder.**

Det forklarer et tidligere målt faktum: kolonneanalysen fant etterlyst-blokken
(156–207, 52 kolonner) «nær død». Den er ikke ødelagt — den er **levende i ett
stikk av tolv**. Det er ikke en feil, det er spillet.

### Overraskelsen: racet er kodet, men målet er det ikke

Indeks **231 og 232** er egne poeng og beste motstanders poeng, begge delt på
målet. **Boten SER stillingen i racet.**

Men den kan ikke bruke den, for **treningsmålet er per runde**. SD-orakelet
lærer den å maksimere poeng i DENNE runden; ingen del av læringen vet at det
finnes et race til 100.

Det snur konklusjonen i S3a: race-bevisst spill mangler ikke informasjon, det
mangler et **mål**. Å legge til trekk ville ikke hjulpet.

### De fire hullene, rangert

**1. «Vinner dette kortet stikket?» finnes ikke.**
Det mest beslutningsrelevante tallet i kortspill. Vektoren har *mesterkort* —
binært flagg for høyeste gjenværende i fargen — men ikke sannsynligheten for at
akkurat dette kortet tar stikket NÅ, gitt hvem som har hva. Trosnettet gir
P(kort → sete) for alle 52; derfra følger tolv tall, ett per lovlig kort.
Billig, og bygget på noe målt til 15,6 SE.

**2. Førerens form etter vraket.**
Dødeblokken sier «fire kort borte, ingen trumf». Den sier ikke det en forsvarer
trenger: føreren kastet fra sine svakeste farger, så han er kortere der enn en
tilfeldig hånd. *Hvilken farge er trygg å lede?* Trosnettet vet det implisitt —
forventet fargelengde per sete er en lært posterior i stedet for en
kombinatorisk grense.

**3. Sekvensering.**
Nettet velger ett kort om gangen uten representasjon av en plan over flere
stikk. «Trekk trumf to ganger, så løper kløveren» finnes ikke som en tanke den
kan ha. Strukturelt fraværende.

**4. Posisjon i stikket.**
Fjerdemann vet alt, andremann nesten ingenting. Utledbart av hvem som leder,
men ikke eksplisitt. Billig, trolig lite verdt.

## S4d. REVISJON AV ADAMS — komponenter, innganger, relasjoner

Arvind, 5. august: *«gå gjennom hele adams og planene rundt den og let etter
hull. se på alle komponentene og inputs og deres relasjon med hverandre.»*

### Hva hver del faktisk ser

| komponent | innganger | blindsone |
|---|---|---|
| **budmodellen** | 128 trekk, **alle om egen hånd** | ser ikke hva noen har bydd |
| **vrakrangereren** | 24: form + bud sortert | ser ikke *hvilke* kort, ikke stillingen |
| **vaktene** (`abmp`) | regler over tilstanden | statiske, målt 4. aug: fortsatt riktige |
| **kortnettet** (`d7alle`) | **273 av 714 tilgjengelige** | alt fra v2 og oppover |

### Hullene, etter alvorlighet

**1. Det utrullede nettet leser 273 av 714 trekk.** Minne, telling, auksjon,
plan, tro, verdi, døde, sanser og hvem-la-hva er alle UBRUKT i boten som
spiller nå. Ni etasjer over et hus ingen bor i.

**2. Budmodellen ser ikke budrunden.** Alle 128 trekk handler om egen hånd.
Auksjonen kommer bare inn gjennom `vant[N]`, en fast populasjonstabell.
Modellen kan derfor ikke vite at to spillere alt har bydd høyt, og at hånden
hennes er verdt færre stikk i det rommet enn i et der alle passet. Strukturelt
hull i komponenten som er verdt **+1,07**.

**3. Vrakrangereren ser form, ikke kort.** Trekkene beskriver hånden etter
vraket ved lengder, honnører og renonser. To vrak som gir samme form er
identiske for den — kløver 2 eller kløver 5 fra en femkortsfarge uten
honnører er samme tall.

**4. Ingenting som spiller ser troen.** Trosnettet treffer 50,2 % på honnører
og gjør orakelets verdener 4,86 pp bedre. Det mater bare trekk det utrullede
nettet ikke kan lese.

**5. Budmodellen og vrakrangereren ser ikke stillingen i racet.** Kortnettet
ser den (231–232); de to andre gjør ikke. Og det er nettopp budterskelen
race-analysen (S3a) pekte på som variansknotten.

**6. Budmodellen og kortnettet deler ingen representasjon.** μ er en
GBT-gjetning om håndens verdi; kortnettet er det som spiller den. Ingenting
binder dem utover at buddataene genereres ved å spille ut med kortstakken — og
da bare som et snitt.

**7. Verdenstrekkeren vekter bare etter budet.** Troen gir +4,86 pp bedre
verdener, ikke koblet inn. Og **vrakrangererens egne etiketter kom fra samme
orakel**, så den arver svakheten.

### Hva som er bygget mot hullene, natt til 5. august

| hull | tiltak | status |
|---|---|---|
| 4 | trosnettet (`tro.bin`) | trent, 50,2 % på honnører |
| 4 | sanseblokken v9 (stikksjanse, fargelengde, renonsanslag, posisjon) | bygget, 6 tester |
| — | **hvem-la-hva v10** | bygget, 4 tester, lekkasjevakt |
| 1 | — | **utestående: nettet må trenes på de nye breddene** |
| 2 | — | **utestående: budmodellen ser fortsatt ikke budrunden** |

### Og feilen v10 rettet, som er verdt å huske

`spillTrekk` kastet spillertilordningen: `settKort(v, 52, stikk.kort.map((k) =>
k.kort))`. Alt nettet visste om HVEM var avledet — renonsflagg, antall per
farge, høyeste og laveste rang. La sete 2 hjerter K, 7, 3 kunne det ikke
skilles fra K, 9, 3.

Det rammet TROSNETTET hardest, siden grunnlaget for å gjette hvor et kort
ligger nettopp ER hvem som la hva.

## S5. IDÉBEHOLDNINGEN — alt, ett sted

Arvind, 4. august: *«husk å logge alt samme plass.»* Denne tabellen er
fasiten. Står en idé ikke her, finnes den ikke — og ingenting skal leve bare i
en samtale.

**Anslag i poeng per runde.** «Målt» betyr replikert i disjunkte frøbånd.

### Banket

| | målt | hvor |
|---|---|---|
| vrak/trumf-rangereren | +0,123 ± 0,036 | `vrakrang.ts` |
| budterskelen −3,0 | +0,392 ± 0,056 | `budmodell.ts` |
| samspill mellom de to | +0,08 (2 bånd) | superadditivt |
| **Adams-v3 samlet** | **+0,598 ± 0,067** | ✅ ute 4. aug |

### AVGJORT natt til 5. august — tre nullresultater

| | målt på gate 2 | konklusjon |
|---|---|---|
| v8-trekkblokkene (D0) | +0,074 ± 0,082, trimmet 0, tegn −1,56 | **ikke avgjort** — se under |
| rollebalansering (RB) | +0,114 ± 0,085, trimmet 0, tegn 965/964 | **null**, men se forbeholdet |
| fra bunnen mot d7alle | −0,529 ± 0,111 | H2 bekreftet, verre enn anslått |

**HOLDOUT LYVER, og det er nattens viktigste funn.** D0 hadde hold-anger
**0,767** mot B273s **0,851** — en klar forbedring i å etterlikne orakelet — og
**null i poeng**. Blokkene gjør nettet flinkere til å gjette hva orakelet ville
gjort, uten å gjøre det flinkere til å spille. Det devaluerer enhver
holdout-basert beslutning tatt før dette.

**OPPVARMINGEN ER FORSTÅTT.** Ren dose-respons over sju punkter:

| oppvarming | skala | hold-anger |
|---|---|---|
| ingen | — | **0,7670** |
| 2 / 3 / 5 | 51 / 63 / 84 % | 0,787 / 0,788 / 0,792 |
| 8 / 11 / 24 | 110 / 134 / 219 % | 0,805 / 0,811 / 0,841 |

All oppvarming skader nå. Det motsier ikke 3. august — det forklarer den:
**oppvarming er en kur mot datamangel.** Med 105k rader nådde kolonnene 2,1 %
av skala og kom aldri fram; med 543k lærer de selv, og den høye
oppvarmingsraten river i de forhåndstrente vektene i stedet. Begge
konklusjoner var riktige for sitt datagrunnlag, og det må stå — ellers
gjeninnfører noen oppvarmingen på et lite korpus, eller fjerner den permanent
og taper der.

### «LINJA ER DØD» VAR FEIL, og korreksjonen er viktigere enn påstanden

Jeg skrev først at trekkblokk-linja var lagt ned. Arvind spurte hvorfor, gitt
hvor mange feil jeg hadde gjort med den underveis. Han hadde rett.

**Rolledekomponeringen sier noe annet enn totalen.** D0 mot d7alle:

| rolle | målt |
|---|---|
| makker | +0,032 ± 0,038 |
| forsvar | +0,059 ± 0,088 |

Ingen av dem er negative. De er for upresise til å si noe.

**Tre grunner til at «død» var feil ord:**

1. **Målingen var underpowered.** Med SE 0,082 kunne jeg ikke oppdaget +0,15
   pålitelig. Et nullresultat med den presisjonen er *fravær av bevis*, ikke
   *bevis på fravær*.
2. **Korpuset var skjevt mot feil rolle.** Dødeblokken er et FORSVARERTREKK –
   budvinneren vet hva han vraket, det er forsvarerne som må slutte seg til
   det. Den ble testet på et korpus med 52,8 % førerrader.
3. **Fem feil på rad i denne linja**, hvorav fire fikk et ekte signal til å se
   ut som null, og den femte ble funnet ETTER konklusjonen. Med den historikken
   er «denne gangen er det ekte null» en påstand uten belegg.

**Det som ER etablert:** fra bunnen på 543 000 rader taper mot d7alle, −0,529
± 0,111. Det er solid og en nyttig grense. Resten er uavklart, og linja
fortjener samme omkamp som forsvarsvektingen: riktig generert korpus, og nok
n til å skille +0,15 fra null.

**FORBEHOLD SOM RAMMER ROLLEBALANSEN:** korpuset ble generert med `rolleVekt`
= 3, standardverdien i koden, mens planen sa 1. Resultatet var **52,8 %
førerrader** mot naturlige 25 %. Å vekte opp forsvar i TAPET kan ikke reparere
et korpus som undersampler forsvar i DATAENE. Standardverdien er rettet, og
forsvarslinja fortjener en omkamp på et riktig generert korpus.

### Bygget, ikke koblet

| | målt | hva som mangler |
|---|---|---|
| race-bevisst varians | +0,08 | god variansknott (se under) |
| motstanderprofilen | — | parkert på Arvinds prioritering |
| trosnettet | +4,86 pp verdenskvalitet | ledd fra verdener til poeng |

### STATUS 5. august, 00:30

| | |
|---|---|
| **Adams-v3 ute** | +0,598 ± 0,067, familien spiller mot den |
| **budkorpuset genererer** | 220 000 hender bestilt, ~23 000/time, mot dagens kortstakk |
| **v9 sanseblokken** | bygget + 6 tester. Stikksjanse kalibrert på 19 200 trekk |
| **v10 hvem-la-hva** | bygget + 4 tester inkl. lekkasjevakt |
| **breddedriften** | kan ikke gjenta seg: `test/e1-bredder.test.ts` binder fem steder i to språk |
| 289 tester | grønne |

**Utestående før v9/v10 kan måles:** korpus må genereres med de nye breddene,
og trosnettet må retrenes med v10 (som er den blokken det trenger mest).

### OMSORTERT 5. august, etter gjennomgangen mot reglene

Rekkefølgen under er endret av tre funn: at racet er kodet men målet ikke er
det, at makkeren avsløres i stikk 1, og at «vinner dette kortet stikket» ikke
finnes i vektoren.

| # | idé | hvorfor der | koster |
|---|---|---|---|
| **0** | **budmodellen skal SE budrunden** | 128 trekk, alle om egen hånd. Komponenten er verdt +1,07 og vet ikke at noen har bydd 10 | timer |
| **1** | **P(kortet vinner stikket)** ✅ bygget | kalibrert på 19 200 trekk, Brier 28 % bedre enn uniform | ferdig |
| **2** | **budmodellen rekalibrert** | +1,07-komponent kalibrert mot en bot to generasjoner gammel | kjører |
| **3** | **race-bevisst MÅL**, ikke trekk | boten ser stillingen, læringen gjør ikke; å endre målet er den eneste veien | dager |
| **4** | **førerens form fra trosnettet** | forventet fargelengde per sete som lært posterior | timer |
| **5** | omkamp: blokker + forsvarsvekt på `rollevekt 1`-korpus | begge ble målt på 52,8 % førerrader | timer |
| **6** | troen inn i SD-orakelets verdenstrekker | +4,86 pp verdenskvalitet, aldri konvertert til poeng | timer |
| **7** | sekvensering / planlegging over flere stikk | strukturelt fraværende, men dyrt | dager |
| **8** | kampbenken | forutsetning for 3 og motstandermodellen | timer |
| 9 | variansvalg blant like gode bud | billig, usikkert | timer |
| 10 | posisjon i stikket | billig, trolig lite verdt | minutter |
| 11 | motstandermodellen | bygget, parkert på Arvinds prioritering | — |
| 12 | menneskeklonen | venter på runder, ikke på arbeid | — |

**Det som falt:** «trekkblokk-linja er død» er trukket tilbake (S4b). Den er
ikke avgjort, og står som punkt 5.

### Identifisert, ikke bygget — rangert etter forventet gevinst *(eldre liste, se omsorteringen over)*

**1. Retrene budmodellen mot dagens nett.** Den er verdt **+1,07** og er
kalibrert mot en bot som ikke finnes. Terskelfiksen hentet +0,39 av
feilkalibreringen som et *plaster*. Dette er den prinsipielle kuren, og den
største enkeltkomponenten som står stille. Anslag: +0,2 til +0,5.

**2. Vekte forsvar OPP i treningskorpuset.** 2v2-målingen: boten er ikke
målbart bedre enn NevroHjerne som makker (−1,05 SE) og forsvarer (−0,93 SE) —
**75 % av rundene**. Mistanken er mekanisk: førerens beslutninger flytter ±18
poeng, forsvarerens ±1–3, så forsvarsgradientene drukner i tapet.
`--rollevekt` finnes og står på 1; å vekte **motsatt vei** er aldri prøvd.
Anslag: +0,1 til +0,3, og det er den eneste ideen som treffer tre firedeler av
spillet.

**3. Variansvalg blant like gode handlinger.** Budterskelen er en *dårlig*
variansknott — den koster 0,31 i snitt for 13 % varians. En god knott er et
valg mellom handlinger med LIKT snitt: blant bud innen ε av beste EV, velg
høyest varians når du ligger bak. Koster ε per konstruksjon. Budmodellen
regner alt EV per bud. Anslag: opptil +0,3 hvis ε kan holdes lav.

**4. Flerfortsettelses-orakelet** (S3b). Fortsettelse trukket per verden, så
det koster det samme som i dag. Anslag: ukjent.

**5. Kampbenken.** Ikke en gevinst i seg selv — men forutsetningen for å måle
3, race-varians og motstandermodellen i det hele tatt. Vi har aldri målt Adams
på kampnivå, bare per runde, og målet er kamper.

**6. Menneskeklonen.** Den eneste linja som angriper målet direkte. Venter på
runder mot v3, ikke på arbeid.

### Tynt — plausibelt, uten anslag

Partnermodellering (makker etterlyses per runde, og en svak makker skal
spilles annerledes) · betenkningstid som tell (vi logger ms, og en lang
tenkepause betyr en jevn beslutning) · nivå-2-resonnement om HVORFOR de vraket
som de gjorde · α-μ destillert til et nett (S3d).

### Hvor det tar slutt, ærlig

**Vi går ikke tom for ideer. Vi går tom for BILLIGE ideer.**

Alt som er hentet 4. august kom fra samme mønster: *en konstant kalibrert mot
en tidligere versjon, eller et trekk som manglet.* Budterskelen, vrakvalget,
dødeblokken. Det mønsteret er nå høstet.

De gjenværende deler seg i to:

| | eksempler | egenskap |
|---|---|---|
| **dyre, trygge** | budmodell-retrening, forsvarsvekting, kampbenk | timer til dager, kjent metode, sannsynlig gevinst i tideler |
| **billige, usikre** | variansvalg, flerfortsettelse | timer, kan måle null |

**Ingen av dem er +1,0 alene.** Summen kan bli det — +0,3 fra budmodellen,
+0,2 fra forsvar, +0,2 fra troen, +0,1 fra varians — men det er fire
uavhengige gevinster som alle må lykkes. Historikken 4. august er at **én av
tre replikerer**.

Det ærligste anslaget: **+1,0 er nåbart, men ikke fra én idé.** Det krever at
fire til seks ting hver gir noen tideler.

# DEL II — MÅLEPROTOKOLLEN

Alt under er kronologisk, med tall. Del I er destillatet.

---

## 1. Hvor vi står, målt

Alle tall er poeng per runde per sete, mot MesterAI på samme benk med
MesterAI låst til 40 verdener (så maskinlast ikke påvirker styrken):

| bot | mot MesterAI | n |
|---|---|---|
| NevroHjerne | −1,038 ± 0,137 | 249 |
| **`vakt:abmp:e1:sd-r2`** — dagens beste | **−0,273 ± 0,130** | 257 |
| samme + budmodellen | −0,218 ± 0,322 | 38 *(løper)* |

Og mot menneskene, fra 988 loggede runder på nettsiden:

| motstander | runder | differanse i menneskenes favør |
|---|---|---|
| PIMC/MAKS | 617 | **+3,35** |
| Nevro | 227 | **+3,60** |
| **vår beste bot** | 136 | **−0,04** |

**Vi har tatt igjen ~3,5 poeng per runde mot familien.** Kontraktprosenten gikk
fra 69–71 % til 80,1 %. Med SE på ±1,4 per spiller er «jevnt» her *ikke til å
skille*, ikke *bevist likt* — 136 runder er lite.

---

## 2. Hva som er avklart, og ikke skal prøves igjen

**Søk slår ikke nettet.** Fire uavhengige former, alle målt:

| form | resultat |
|---|---|
| dobbelt dummy, eksakt | −0,29 … −0,78, monotont verre med dybde |
| SD fra stikk 9 / 7 / 5 | −0,32 / −0,17 / +0,02 |
| ISMCTS mot MesterAI | trimmet snitt +0,03, tegntest p=0,29 |
| PIMC | målt verre |

Grunnen er ikke budsjett eller dybde: **nettet er nå bedre enn læreren sin**
(`lagstikk − SD` = +0,26 som spillefører), så et SD-søk erstatter en god policy
med en dårligere. Og DD løser feil spill.

To forklaringer jeg har brukt og som IKKE holder:
- *Strategifusjon* er ikke påvist her. Egen test, n=2665, kurven flat
  (+0,14 ± 0,19). Det opprinnelige funnet var støy fra n=50.
- *ISMCTS er uprøvd* — den er bygget og målt, og replikerte ikke.

**Regelåren er tynn, men ikke tom.** Kontekstjakten over 231 stillinger fant
ingenting signifikant. Men to regler ble funnet i dag ved å teste Arvinds egne
hypoteser med utfallsmålingen, og begge holdt. Forskjellen er at nøkkelen i
kontekstjakten er for grov til å uttrykke dem — den mangler stikknummer,
«tok jeg forrige stikk» og «har budvinneren spilt ennå».

**Amerikaner og solo skal aldri meldes.** 0 av 410 hender. Solo måler −101,9.

---

## 3. Målestokken, som ikke endres

Arvinds idé, og den som ga begge de bekreftede forbedringene i dag:

> **Mål på utfallet, ikke mot et orakel.** Legg kortet i den EKTE giva, spill
> runden ferdig, les av poengene.

Den slipper unna begge orakelfeilene: DD er målt skadelig å følge, SD er så
støyete at argmax over den blir vinnerens forbannelse. Og siden agentene er
deterministiske er hver differanse **eksakt** for den giva, ikke et estimat.

Kravene ellers: parret på giv, **disjunkte frøbånd** med tegntest over skard
(regel `m` var positiv i 10 av 10 — strengere enn 5,4 SE alene), og
poengdifferanse som måltall så det teller å holde motparten nede.

**Aldri adoptere på støy.** Tre av fire tiltak i dag ble forkastet på måling,
og to av mine egne tall ble trukket tilbake.

---

## 4. Rekkefølgen

### Nå: fullfør treningen
Alle seks aksene i oppsettet er riktige for første gang:

| akse | rettet i dag |
|---|---|
| trekk | v2 (340) med minneblokken — **nøytral**, ikke skadelig (retting 03.08) |
| kontrakter | spredt, ikke 92 % bud 9–10 |
| rollout-policy | `vakt:abmp`, ikke nevro |
| stillingskilde | nettet selv (DAgger), ikke nevro |
| rollevekt | 3× spillefører — den bærer 100 % av gapet |
| verdener | 12, det målte nivået |

### Minneblokken er forkastet, og det første nettet strøk utgangsprøven

Ablasjonen: to nett, samme 245 569 rader, samme holdout, samme form
512→384→256. Eneste forskjell er om kolonne 273–339 finnes. Så begge målt i
spill mot dagens vekter, 400 givere × 4 seter, friskt frøbånd 900 000.

| | holdout-anger | poeng/kamp | parret mot v1 |
|---|---|---|---|
| sd-r2 (dagens) | — | **+76,61 ± 0,07** | **+0,76 ± 0,05**, 326/394 |
| ablasjon-v1 (273) | 0,9693 | +75,85 ± 0,07 | — |
| ablasjon-v2 (340) | 0,9898 | +75,56 ± 0,07 | −0,29 ± 0,05, 141/388 |

**TRUKKET TILBAKE 2026-08-03.** Påstanden over var feil, og feilen var i
treneren: vektinitialiseringen var aldri seedet, så de to armene skilte seg på
startvekter i tillegg til trekkbredde — og vi kjørte n=1 av hver.

Kjørt på nytt med tre seedede frø per arm, målt i spill på 6 000 (giv, sete):

| frø | v1 | v2 | v2 − v1 |
|---|---|---|---|
| 11 | −0,572 | −0,508 | **+0,064** |
| 22 | −0,353 | −0,615 | −0,262 |
| 33 | −0,523 | −0,557 | −0,034 |

Ett frø favoriserer v2, to favoriserer v1. Og variasjonen INNENFOR v1 er
0,219 — nesten like stor som den største forskjellen mellom armene. Den
opprinnelige −0,27 er nøyaktig frø 22s flaks.

**Minneblokken er ikke skadelig. Den er ikke målbart noe.** Den kan bli
stående. Arvind pekte på feilen: «vrak og utetelling burde ikke være skadelig,
da er det noe annet som må være galt.»

Og dagens vekter slår begge de nye med 0,76 poeng, positivt i 326 av 394
givere. Det er ikke støy, og det er utgangsprøven i §4 som feiler.

**Hva det IKKE beviser:** at spredte kontrakter, DAgger-stillinger eller
rollevekten er feil. De nettene er trent på ~400 partier og overtilpasser fra
epoke 5 — treningsangeren faller til 0,59 mens holdout stiger, og gapet vokser
monotont. Det er en datamengdefeil, ikke en aksefeil. Minneblokken er den
eneste aksen som er isolert og felt.

**Den underliggende lærdommen:** vi har telt rader når statistikken lever på
partier. 255 000 rader, noen hundre partier, holdout på 14 av dem. Målet
«300 000 rader» er formulert i feil enhet.

De tre gjenstående aksene er fortsatt utestående. **Utgangsprøve:**
parret måling mot dagens nett på friskt frøbånd. `lagstikk − SD` skal ikke
falle på kontrakt 9–10 og skal stige på 7–8 og 11–12.

### Så: budmodellen avgjort
Den henter **+2,138 ± 0,090** mot nevro-byding, og 95 % av det er kontrakter
nevro **passer på** (verdt +8 hver). MesterAI byr 94 % likt med nevro.

Foreløpig mot MesterAI: −0,218 ± 0,322 på n=38, vinner budrunden 54 % mot
46 %. Aggresjonen overføres; om den blir poeng er uavklart.

**Utgangsprøve:** n ≥ 200 par. Holder halvparten av +2,14, går vi forbi
MesterAI (gapet er 0,273).

### Så: alpha-mu
Den eneste søkeformen utenfor mønsteret som har feilet fire ganger. DD, SD og
ISMCTS **midler** alle over verdener; alpha-mu holder en **Pareto-front av
vektorer** og midler ikke. Den er designet nettopp for PIMCs patologier i
stikkspill (Cazenave).

Byggeklossene finnes: DD-løseren, verdenssampleren, ekvivalensklassene i
`src/solver/eksakt.ts`.

**Utgangsprøve:** samme benk som SD-søket, `lagstikk` mot bare nettet. Blir den
negativ som de fire andre, er søk avsluttet som linje.

### Så: motstandermodellering
Vi spiller likt mot MesterAI, nevro og familien. Vi har **988 loggede runder**
med familiens faktiske spill som ligger ubrukt.

Og dette er ikke en detalj: målet er å slå *dem*, og mot en fast
motstanderpopulasjon er det maksimale et **beste svar**, ikke en likevekt. En
likevektsstrategi gir bevisst fra seg gevinst mot utnyttbare motstandere.

Budmodellen er alt et beste svar mot nevro-byding — +2,14 kommer av å utnytte
at motparten passer for mye. Det samme prinsippet på kortspillet er umålt.

### Parallelt: utplassering
Arvind: *«etterhvert må vi oppdatere nettsiden med modellen og se hvordan den
klarer seg mot mennesker. vi må også legge den i arena benk.»*

Arenabenken kjører alt (`budm:`-spec er lagt inn i `mesterai-h2h.ts`).
Nettsiden **venter til budmodellen har et tall mot MesterAI** — å sette den ut
mot familien før den er validert ville gjort dem til benken.

---

## 5. Prøvd, ikke prøvd

| | status |
|---|---|
| bayesiansk håndestimering | **✅ finnes** — `trekkVerdenBelief`, importance sampling med budrunden som likelihood. Svakhet: bare 3 kandidater, og likelihooden bruker ikke kortspillet |
| kortekvivalens / isomorfi | **✅ finnes** — `src/solver/eksakt.ts` enumererer konfigurasjoner og vekter dem, med DP-telling som kontroll. Men brukes bare der, ikke til å redusere forgrening generelt |
| nevrosymbolsk | **✅ er arkitekturen** — konvensjonsvakten er regelbasert abstraksjon utenpå et nett, og den er det som virker |
| ISMCTS | ✅ bygget og målt, replikerte ikke |
| **alpha-mu** | ❌ ikke prøvd — høyest prioritet av de uprøvde |
| **motstandermodellering** | ❌ ikke prøvd — dataene ligger klare |
| CFR i sluttspillet | ❌ ikke prøvd. Eneste form som gir randomiserte strategier |
| aktiv informasjonsinnhenting | ❌ ikke prøvd. Vi velger aldri et kort *for å lære noe* |

---

## 6. Åpne spørsmål jeg ikke har svar på

**Menneskekoeffisienten på +3,7** fra regresjonsbroen. Den ville betydd at
familien er over to poeng bedre enn boten, og det motsier at differansen mot
dagens bot er −0,04. Broens menneskerad er et *logget* utfall; hver botrad er
en *replay* fra nullstilt tilstand. Hele den asymmetrien lander på den ene
koeffisienten. Budregnestykket forklarer omtrent halvparten.

**Om kontraktbevisst spilleføring trenger separate hoder.** En spillefører på 8
og en på 11 skal spille kvalitativt ulikt. Ett nett med kontrakten som ett av
340 trekk lærer neppe to policyer. Fase 0 tester datasiden; om arkitekturen
holder er umålt.

**Hvor mye av budmodellens +2,14 som overlever mot en motstander som også byr
godt.** Det er fase 4 i `budplan.md` — iterert beste svar — og det er umålt.

---

## 6b. Natten 2. → 3. august: hva som ble avgjort

**ADAMS ER SATT UT.** `budm:bud-gbt.json : vakt:abmp : e1:ftf1.bin` ligger på
nettsiden fra 03.08. Alle tre lagene er målt hver for seg og adoptert etter
prosjektets egne krav. Val Town proxyer bundelen og budmodellen fra GitHub raw,
så framtidige utplasseringer bare er en commit — med fallback til den gamle
bundelen om GitHub svikter.

**Budmodellen passerte porten:** +0,618 ± 0,166 (3,7 SE) parret over 203 par,
trimmet snitt +0,545. Marginalt **+0,357 ± 0,129 mot MesterAI**, der `vakt:abmp`
ligger −0,268. Første gang noe vi har måler positivt mot Washington.

**Seks nye kortnett strøk gate 2**, og forklaringen er verken trekk,
arkitektur, frø eller rollout-policy:

| | rader |
|---|---|
| sd-r2 er trent på | **4 824 794** |
| alt vi rakk å generere | **410 645** (8,5 %) |

Det forklarer alle seks på én gang, og alle mine teorier om «ødelagte
etiketter» var feil spor.

**Finjustering løser det uten 19 timers generering, og den er ADOPTERT.**
`sd-tren.py --start` arver sd-r2s vekter og lar de nye radene justere dem.
Målt i spill mot sd-r2:

| frøbånd | ftf1 mot sd-r2 |
|---|---|
| 7,3 mill. | +0,206 ± 0,065 (3,2 SE), 1721/3117, p=0,000 |
| 9,1 mill. | +0,079 ± 0,067 (1,2 SE), 1740/3134, p=0,000 |
| 11,7 mill. | +0,123 ± 0,068 (1,8 SE), 1704/3174, p=0,000 |
| **samlet** | **+0,136 ± 0,038 (3,5 SE)** |

Positiv i 3 av 3 disjunkte bånd, tegntest p=0,000 i hver. Det første nye
kortnettet som slår sd-r2 i hele prosjektet.

**Læringsraten er en målt grense, ikke et valg.** Ved 3e-3 måler nettet
−0,171: det glemmer det gamle datagrunnlaget. Vendepunktet ligger rundt 1e-3.
Og `ftf1` har HØYERE hold-anger enn `ftf3` (0,8974 mot 0,8673) men spiller
bedre — anti-korrelasjonen mellom orakelanger og spillestyrke holdt hele
natten, så alle fire ble rangert i SPILL.

**Fasegapet har flyttet seg.** Spilleføringen er nå jevn med MesterAI (+8,45
mot +8,45 poeng per kontrakt). De to hullene som står igjen er makker (−86) og
**forsvar (−110)** — og forsvaret vårt er målt til **−0,051 ± 0,063** mot
NevroHjernes, altså ikke bedre.

**`--rollevekt 3` er kalibrert mot en død bot.** Den ble valgt da spilleføreren
bar 104 % av tapet. Den bærer 0 % nå. All videre generering bruker `1`.

### Feil i metoden som ble funnet og rettet

Alle av samme slag: de krasjer ikke, de rapporterer suksess.

| feil | virkning |
|---|---|
| `glob("skard-*")` | 143 491 av 174 414 rader usynlige for treneren |
| `numpy.resize` som vekst | masken fylt med gjenbrukt søppel |
| overlappende frøbånd | holdout-giv i treningen |
| **useedet vektinitialisering** | **ablasjoner målte ett frøs flaks** |
| **`FileShare.Read` i tellingen** | **overvåkingen drepte generatorene (EBUSY)** |
| `neat-evaluer` mot `grådig` | kortnett målt ved et bord vi aldri møter |

Den fjerde felte konklusjonen «minneblokken er skadelig». Kjørt på tre seedede
frø er den ikke målbart noe. **Trukket tilbake.**

---

## 6c. Mønsteret, med tolv datapunkter bak seg

Det tydeligste som kom ut av 2.–3. august er ikke et enkelttall, men en
sortering. Alt vi har prøvd faller i to bunker, og de har motsatt fortegn.

**Bedre ØYNE virker.** Å gi boten informasjon eller kalibrering den ikke hadde:

| tiltak | målt |
|---|---|
| budmodellen | **+0,618 ± 0,166** mot MesterAI |
| finjustering av kortnettet | **+0,146**, positiv i 4 av 4 frøbånd |
| vaktflagg `m` og `p` | +0,040 og +0,004 |
| telleblokken (v3) | uprøvd — genererer |

**Maskineri utenpå virker ikke.** Ti søkeforsøk og ni av elleve regelforsøk:

| | |
|---|---|
| DD-søk | −0,29 … −0,78 |
| SD fra stikk 9/7/5 | −0,32 / −0,17 / +0,02 |
| ISMCTS | replikerte ikke |
| eksakt enumerasjon | −0,017 … −0,778 |
| PIMC i kortspill | verre |
| **PIMC i VRAK/VELG** | **−0,256 ± 0,089** |
| `d`/`D`/`e`, `h`, `k`, `l` | alle negative eller null |
| ensembler av 31 nett | ikke målt bedre |
| PBS | regnbar bare der spillet er avgjort |

Arvind: *«man regner bedre hvis man har bedre øyne.»* Det er nøyaktig det
tallene sier, og rekkefølgen betyr noe: et regnestykke på feil premiss blir
bare presist feil.

**Og en advarsel som gjelder begge bunkene.** Sju tall ble målt to ganger i
døgnet, og oppdagelsestallet var oppblåst hver eneste gang:

| | oppdaget | replikert |
|---|---|---|
| minneblokken «skadelig» | −0,27 | −0,077 (ett frøs flaks) |
| finjustering `ftf1` | +0,206 | +0,136 poolet |
| fjerne flagg `a` | +0,017 | +0,005 |
| **rekalibrert budmodell** | **+0,061** | **−0,005** |

Ingenting adopteres på ett frøbånd. Ikke én gang har det holdt.

---

## 7. Adams på banen

**Adams er kodenavnet på boten vi bygger. MesterAI er Washington.** Navnet er
valgt: John Adams etterfulgte George Washington, og det er nøyaktig oppdraget.

Arvind: *«imorgen så vil jeg at Adams skal være på banen.»* Det betyr
utplassering — nettsiden og arenabenken — ikke en ny komponent.

### Hva som må stå før Adams settes ut

| krav | status | hvorfor det er et krav |
|---|---|---|
| kortnettet trent på spredte kontrakter + DAgger | **v2-aksen forkastet**; data samles videre | tre gjenstående defekter i dagens vekter |
| den nye vekten målt parret mot dagens | **STRØK: −0,76 ± 0,05, 326/394** | et nett kan bli verre; nå ni ganger |
| budmodellen har et MesterAI-tall | n=34 av 200 par | +2,14 er målt mot nevro-byding, ikke mot en som kan straffe overbud |

**Budtallet krympet da det ble målt riktig.** Den ad hoc-regnede differansen var på
dobbelt skala – `kandidatPoeng` er summen over BEGGE kandidatsetene. Rettet, og
med flere par:

| n par | budm − abmp | tegntest |
|---|---|---|
| 27 | +0,723 ± 0,330 (2,2 SE) | p = 0,44 |
| 34 | **+0,373 ± 0,414 (0,9 SE)** | p = 0,61 |

Halvert på syv par og ikke lenger til å skille fra null. Verktøyet er nå
`examples/h2h-parret.ts`, ikke et engangsregnestykke.

Og mekanismen er ikke den samme som mot nevro. Der kom 95 % av +2,14 fra å ta
kontrakter nevro **passet** på. Mot MesterAI vinner budm **færre** budrunder
(8,52 mot 8,63) og klarer flere (77,4 % mot 72,5 %). +2,14 er derfor ingen
spådom for denne benken.

### Tre defekter i treneren, funnet ved å røykteste før GPU-kjøringen

Alle tre er av samme slag: de krasjer ikke, de lyver.

| defekt | virkning |
|---|---|
| `glob("skard-*.jsonl")` | `sd-spredt/b-*.jsonl` – **143 491 av 174 414 rader** – var usynlige. «Fant ingen filer»-vakten tier så lenge ett mønstertreff finnes i mappen |
| telling før innlesing | skardene skriver mens treneren leser, så arrayene renner over. En «fiks» med `break` ville tapt de nyeste radene i stillhet |
| `numpy.resize` som vekst | fyller nye rader med gjentatt gammelt innhold, ikke nuller. `M` er en maske – søppel der slår på tapsledd for kort som aldri ble målt |

Den fjerde stoppet kjøringen som den skulle: **giv-lekkasje**. Generatorene ble
startet på overlappende frøbånd – sd-spredt 80–91 mill., sd-dagger 85–98 mill.,
58 givere felles – så fire holdout-givere lå i treningen via den andre mappen.
Holdout-tapet ville målt på stillinger nettet hadde sett. Rettingen kaster de
radene ut av treningen i stedet for å flytte dem inn i holdouten, fordi
holdouten må være nøyaktig samme utvalg for kandidater som ikke har sett alle
mappene.

**For neste generasjonsrunde: gi hver generator sitt eget frøbånd.** Overlappet
her var en ren oppstartsfeil fra min side, ikke noe ved metoden.

**Rekkefølgen er ikke forhandlingsbar, og grunnen er ikke forsiktighet.**
Familien er den eneste kilden vi har til menneskedata. Setter vi ut en
uvalidert Adams, bruker vi opp runder vi ikke får igjen på å måle noe vi ikke
vet hva er — og 136 runder mot dagens bot er allerede for lite til å skille
±1 poeng per runde.

### Det som utplasseres

Nettsiden bygger i dag `Konvensjonsvakt(E1Agent.fraBytes(bytes, {}), flagg)` —
altså nett + regler, ingen søk. Adams v1 er samme form med fire endringer:

1. ~~nye vekter~~ — **utgår.** De strøk utgangsprøven med −0,76. Adams v1
   bruker `sd-r2`, altså dagens vekter.
2. vaktflaggene `abmp` i stedet for `at` — `m` og `p` er målt i dag
3. budmodellen (`bud-gbt.json`) lagt utenpå, hvis MesterAI-tallet holder
4. ingen søk — fire former er målt, ingen slår nettet

**Adams v1 er da `vakt:abmp:e1:sd-r2`.** Punkt 2 alene er en ekte forbedring
over det som står ute nå (`vakt:at`): `m` måler +0,0404 ± 0,0075 og var
positiv i 10 av 10 disjunkte frøbånd, `p` +0,0039 ± 0,0010 i 9 av 10. Det er
mindre enn vi håpet i går, men det er målt, og det er mer enn null.

### Hva som går akkurat nå (3. august, ettermiddag)

**`sd-v4/` — auksjonsblokken.** 8 skard genererer 364-brede data i frøbåndet
260 M. `sd-v3` ble stoppet på 105 813 rader og er brukt opp (se under).

### Tre ting som ble oppdaget 3. august ettermiddag

**1. Nettet som spiller er v1.** `ftf1.bin` og `sd-r2.bin` har begge 273
innganger. Minneblokken (v2) er ALDRI tatt i bruk. Det betyr at en
`--start`-utvidelse til 356 legger på 83 nye kolonner, ikke 16 — minneblokk og
telleblokk som én pakke. Gate 2 på den ville ikke kunne si hvilken halvdel som
virket. `verktoy/sd-tren.py` fikk derfor et femte `--kjor`-ledd `a-b` som
nullstiller et kolonneintervall i en KOPI av dataen, så blokkene kan måles hver
for seg. Verifisert: den maskerte armen har `|W[:,273:340]| = 0.000000`.

**2. Telleblokken ga ingen gevinst på 105k rader.** Tre armer, samme rader,
samme holdout, samme init-frø — det eneste som skilte dem var hvilke kolonner
de så:

| arm | ser | hold-anger |
|---|---|---|
| `v3n` (kontroll) | ingenting nytt | **0,6380** |
| `v3k` | telleblokk | 0,6403 |
| `v3m` | minne + telling | 0,6412 |

Monotont dårligere jo mer informasjon. Det er mønsteret for at datamengden ikke
betaler for ekstra kapasitet — 105k rader mot de 4,8 mill. som ligger i `ftf1`.

**Gate 2 sa det samme** (n=1600, `analyse/telleblokk-gate2.txt`):

| arm | n | snitt | SE | σ |
|---|---|---|---|---|
| `ftf1` (KONTROLL) | 1600 | **+0,0000** | 0,0000 | — |
| `v3k` telleblokk | 1600 | +0,0062 | 0,1288 | +0,05 |
| `v3n` ingen ny info | 1600 | +0,0054 | 0,1266 | +0,04 |

Kontrollarmen måler eksakt 0,0000, så tabellen kan leses. Telleblokkens
isolerte bidrag er `v3k − v3n = +0,0008`. Med SE 0,13 ville alt over ~0,26
blitt sett — dette er et ekte null, ikke et knivsegg.

**Det viktigste tallet står i kontrollarmen.** `v3n` er ren ekstra finjustering
på 105k ferske rader, uten én ny informasjonskilde: **+0,005**. Finjusteringen
som LAGET `ftf1` ga **+0,136**, replikert i fire frøbånd. Avkastningen på mer
data av samme slag er i praksis uttømt.

### 4. Nullstillingen gjorde forsøket umulig — en ekte implementasjonsfeil

Arvind nektet å godta nullresultatet: *«det må være dårlig implementert, fordi
det skal funke.»* Det stemte, og feilen var aritmetisk:

| | |
|---|---|
| snitt \|vekt\| v1-kolonnene | 0,0895 |
| snitt \|vekt\| telleblokken | 0,0028 — **33× for små** |
| nye blokkers bidrag til lag 0 | **2,1 %** av v1s |

AdamW flytter hver vekt med omtrent `lr` per steg uansett gradient. Med 105k
rader er det ~104 batcher per epoke, og tidlig stopp kom på epoke 6:

- `625 steg × 7,5e-5 (cosinus-snitt) = 0,047` maksimal forflytning
- `0,0895` = skalaen de skulle nå

**Kolonnene kunne ikke komme fram.** Nullstillingen som gjør at nettet starter
identisk med startvekten — selve tryggheten i forsøket — gjorde det samtidig
umulig å vinne. Den forrige konklusjonen målte treneren, ikke trekket.

`--nyepoker`/`--nylr` retter det: en fase der BARE de nye kolonnene lærer, alt
annet frosset, så raten kan være høy uten at nettet kan glemme noe. Bidraget
gikk til 8,3 % (telling) og 17,4 % (minne+telling); vektene til 98,5 % av
riktig skala.

### 5. Med feilen ute svarer målingen fortsatt nei — men mønsteret peker et sted

| arm | bånd 900k | bånd 2,5M | trimmet |
|---|---|---|---|
| `w3m` minne+telling, 8 ep. | **+0,1631** | **−0,1654** | −0,0303 |
| `wm24` samme, 24 ep. | — | −0,2467 | −0,0192 |
| `wmm` minne alene, full skala | — | −0,3821 (−2,24 SE) | −0,0315 |

`w3m` slått sammen over begge bånd: **−0,001 ± 0,104**. Null. Åttende gang et
oppdagelsestall ikke replikerer — denne gangen snudde det fortegn.

**Men jo mer de nye kolonnene brukes, jo verre går det:**

| bidrag | resultat |
|---|---|
| 0,4 % | +0,006 |
| 8,3 % | −0,032 |
| 17,4 % | −0,165 |
| 24,4 % | −0,382 |

Det er signaturen til **overtilpasning**, ikke til ubrukelig informasjon. Ren
støy ville gitt null uansett vekt. 105 813 rader skal her bære 42 496 nye
vekter.

**Det er en testbar påstand, ikke en unnskyldning:** med flere rader skal
kurven flate ut og snu.

### 6. Overtilpasningsforklaringen var feil — og rollen avslørte den ekte feilen

Halvering av treningssettet endret ingenting: `wmmh` på 56 485 rader ga
**−0,3648 ± 0,1809** mot `wmm` på 105 813 raders **−0,3821 ± 0,1707**. Var
datamengden variabelen, skulle halvering gjort det klart verre.

Rolledekomponeringen sa hvor tapet lå:

| `wmm` | | |
|---|---|---|
| **fører** | **−1,4750 ± 0,5740 (−2,57 SE)** | hele tapet |
| forsvar | +0,0329 | |
| makker | −0,1191 | |

Spillefører er det **eneste** setet minneblokken bærer informasjon for — de
andre har nuller der. En blokk som skader presis det setet den informerer, er
ikke støy. Da er kodingen feil.

**Indeks 277–328 er 52 én-av-kolonner** som sier nøyaktig hvilke fire kort
føreren vraket. `C(52,4) = 270 725` kombinasjoner mot ~30k førerrader: nær unik
signatur per giver. Nettet memorerer giverspesifikke svar, og på en ny giver
bidrar de 52 kolonnene med en tilfeldig vektet sum rett inn i førerens logits.
Det forklarer også hvorfor mer data ikke hjalp — memorering av nær-unike
mønstre er ikke datamengdebegrenset her.

### 7. Minneblokken uten de 52 kolonnene — REPLIKERT POSITIV

`wred` beholder 273–276, 329–336, 337 og flaggene; bare 277–328 er maskert.

| frøbånd | n | snitt | SE |
|---|---|---|---|
| 2 500 000 (oppdagelse) | 1600 | +0,1788 | 0,1468 |
| 4 100 000 (replikering) | 4400 | +0,1642 | 0,0902 |
| **5 600 000 (andre replikering)** | 2800 | **−0,0602** | 0,1179 |
| **slått sammen** | **8800** | **+0,1001** | **0,0644 = 1,55 SE** |

**TRUKKET TILBAKE 3. august, senere samme dag.** Etter to bånd skrev jeg
«første gang et oppdagelsestall i dette prosjektet ikke krympet ved
replikering». Et tredje bånd motsier det: −0,0602, og totalen faller fra
2,19 til 1,55 SE. **`wred` er ikke etablert, og skal ikke settes ut.**

Verre for tolkningen: HVER rolle skifter fortegn mellom bånd.

| rolle | 2,5M | 4,1M | 5,6M | slått sammen |
|---|---|---|---|---|
| fører | +0,598 | +0,459 | **−0,312** | +0,268 ± 0,209 |
| makker | **−0,091** | +0,070 | +0,105 | +0,050 ± 0,030 |
| forsvar | +0,104 | +0,064 | **−0,017** | +0,045 ± 0,073 |

Førersetet har SE rundt 0,3–0,47 per bånd fordi førerutfall svinger mest. Med
n=400–1100 per bånd er «+0,60» og «−0,31» ikke i konflikt — de er begge
forenlige med null. Historien om at de 52 én-av-kolonnene skader føreren står
fortsatt (spranget −1,475 → +0,598 var 2,8 SE INNENFOR ett bånd, altså parret
på samme givere), men **at `wred` er en gevinst, er det ikke belegg for.**

Førersetet gikk fra **−1,4750 til +0,5984** — et sprang på +2,07 ± 0,74. Og i
replikeringen er **alle tre roller positive**, inkludert makker (+0,0703,
+1,67 SE) som er det største dokumenterte hullet (−0,22).

**Dette er første gang et oppdagelsestall i dette prosjektet ikke krympet ved
replikering.** De sju foregående gjorde det hver gang.

**Forbeholdet skal stå:** trimmet snitt er +0,0106 og tegntesten 615/594. Altså
er gevinsten konsentrert i givere med store utslag — i praksis førersetet. Her
er trimming trolig et dårlig kriterium: 5 % av hver hale er nettopp de giverne
der spillefører avgjør mye, så trimmingen fjerner signalet, ikke støyen. Og
poeng summeres over runder, så det er snittet som bestemmer i lengden.

Telleblokken hjelper fortsatt ikke: `wredt` (samme, men med telling synlig) ga
+0,0717 mot `wred`s +0,1788.

**Lærdommen som generaliserer:** høy kardinalitet i et trekk som bare ÉTT sete
ser, er en memoreringsfelle. Se alltid rolledekomponeringen — totalen skjulte
dette bak et snitt over fire seter.

**3. Auksjonen er et større hull enn tellingen — og generatoren ødela den.**
Fra hele budrunden kodet spillfasen bare hvem som vant (208–211), tallbudet
(225) og Amerikaner/solo. Hva de andre bød fantes ikke, selv om
`budrunde.sisteBud` ligger i staten hele spillet.

`examples/budhull.ts` målte det først, stratifisert på vinnerbudet så alle
forsvarerne i et stratum møter samme kontrakt:

| innen samme kontrakt, høyt eget bud minus lavt | effekt |
|---|---|
| **honnører på hånd** | **+0,288 ± 0,022 (13,3 SE)** |
| stikk faktisk tatt | +0,065 ± 0,026 (2,5 SE) |

Signalet om håndstyrke er sterkt og vokser med kontrakten (+0,026 ved vinnerbud
8, +0,275 ved 9, +0,477 ved 10). Omsetningen i stikk er nesten borte. **Den
sprekken kan målingen ikke lukke:** enten er informasjonen lite handlingsbar,
eller så er den handlingsbar og agenten klarte ikke bruke den fordi den ikke
kan se den. Gate 2 avgjør.

**FELLEN, funnet før to timers generering.** `--budspredning` tvinger
kontrakten ved å la ett sete by og PASSE de tre andre
(`examples/sd-orakel.ts:356`). Med 0,5 ville halvparten av radene vist «tre
passet med en gang» som et artefakt av generatoren, ikke av hendene. `sd-v4`
genereres derfor med `--budspredning 0`, og det er verifisert i dataen: 80 % av
rundene har alle fire bydd, 20 % har tre — som stemmer med de 94,9 % `budhull`
målte. Prisen er at kontraktsdekningen faller tilbake til den naturlige
fordelingen; det er en bevisst byttehandel for ÉN ærlig auksjon per rad.

En rikere variant finnes og er ikke prøvd: tving bare ÅPNINGSBUDET og la de
andre setene by naturlig oppå. Da beholdes både dekning og ekte auksjon.

**Ferdig og forkastet i dag:** rekalibrert budmodell (−0,005 ved replikering,
og −0,143 som spillefører). Feilspesifikasjonen er ekte — `bud-gbt.json` er
trent mot en spillefører som klarer 89 % av niere mens Adams klarer 85 % — men
å rette den gjør modellen mer forsiktig, og forsiktighet er feil retning.
Hele gevinsten kommer av å ta kontrakter motparten lar ligge.

### Køen, rangert etter målt hull

| | hull mot MesterAI | status |
|---|---|---|
| **makker** | **−0,22** | urørt. To regler verdt 0,007 til sammen |
| **forsvar** | **−0,12** | ingen regler. Forsvaret er målt likt NevroHjernes (−0,051 ± 0,063) |
| spillefører | jevnt (+8,45 mot +8,45) | ingenting uten noe kvalitativt nytt |
| budets μ/σ | taket usynlig herfra | rekalibrering prøvd og forkastet |

### Måleevnen er den ikke-tekniske flaskehalsen

Familiebenken har SD ≈ 9–11 poeng per runde. Det gir:

- **~400 runder** for å oppdage en effekt på 1,0
- **~1 600 runder** for 0,5

De 136 rundene som ga «−0,04» hadde SE rundt ±1,2. Det tallet kunne aldri
skilt en jevn bot fra en som er ett poeng bedre. **Å bevise overmenneskelig
spill krever flere runder, ikke bare en bedre bot** — og det er derfor
MesterAI-benken må bære dommen i mellomtiden.

### Om noe ikke rekker

Da settes den delen ikke ut. En Adams med nye vekter og gamle bud er fortsatt
et framskritt; en Adams med et ubekreftet budnett er et eksperiment på
familien.

## 8. Forsvar og makker — oppdraget, og hvor hullet faktisk er

### Arvinds krav, 3. august (skal stå som spesifikasjon, ikke parafrase)

**Forsvar.** Må bli veldig god til å **felle kontrakter** — både ved å jobbe
sammen med den andre forsvareren, og ved å **ta stikk selv** (det gir poeng).
Krevende.

**Makker.** Også vanskelig, men må bli mye bedre. Spiller stikkene sånn passe
allerede. Må kunne spille optimalt **rundt trumf og renonse**. Viktig: hvordan
man **sparer på kort og bruker kort optimalt**, og erkjenne at **budvinnerens
kort generelt er mer verdifulle**. **Lagstikk ligger i bunnen.**

**Tvers over.** Vraking og trumfvalg må være veldig bra — aldri hive ut trumf,
alltid ta det inn. Budet må justeres når spillet blir bedre. Og: blir vi veldig
gode i forsvar, kan det bli lønnsomt å **la motparten få kontrakter vi kan
felle**.

### «Aldri hiv ut trumf» — RETTET 3. august, det ER et hull

Vraking skjer FØR trumfvalg (`motor.ts`), så regelen er egentlig et krav om
kobling mellom to beslutninger. Adams tar dem uavhengig: `velgVrak` bruker et
nett hvis inngang (`byttTrekk`) ikke har trumf, og `velgTrumfOgEtterlys` velger
trumf av hånden som ble igjen. Likevel, målt over 2000 runder
(`examples/vraktrumf.ts`):

| | |
|---|---|
| runder der et vraket kort ble trumffargen | 36 (1,8 %) |
| trumfkort vraket totalt | **37 brudd** |

**MIN FØRSTE LESNING VAR FEIL OG ER TRUKKET.** Jeg rapporterte «ingen knekt
eller høyere» som om verdien på det vrakede trumfkortet gjorde bruddet mildere,
og konkluderte «ikke et hull». Arvind: *«jeg snakker ikke om knekt og høyere.
jeg snakker om å hive ut det som blir trumffarge. man hiver aldri ut der. ikke
en 2er engang.»* Regelen er absolutt. Da er alle 37 brudd, ikke null.

Kontrafaktualen i samme skript (+0,97 «stikk») skal fortsatt ignoreres —
`estimerStikk` belønner trumflengde, så enhver bytting som legger til et
trumfkort hever tallet uansett.

### VRAKDOKTRINEN (Arvind, 3. august) — spesifikasjon, ikke parafrase

1. **Trumf og vrak er ÉN beslutning.** «Trumfvalg skjer etter vrak, men det
   henger sammen, og vi bestemmer oss for det når vi har 16 kort og skal hive
   ut 4. Det er da vi tar de beslutningene.»
2. **Aldri vrak i fargen som blir trumf — ikke en toer engang.**
3. **Heller vrak en urelatert knekt, dame eller til og med konge** enn et lavt
   trumfkort.
4. **RENONSE ER MÅLET, og det er derfor en knekt kan ofres.** «Knekt kan jeg
   ofte hive pga jeg vil bli kvitt suits fordi renonse er bra for spillefører —
   da kan man bruke trumf.» Å vrake seg TOM i en farge er en gevinst i seg
   selv, ikke et tap av kortverdi.

**Hva det betyr for koden.** `velgVrak` scorer kort uten å vite hva trumfen
blir, og `besteTrumf` velger etterpå av det som ble igjen. Doktrinen krever det
motsatte: velg paret (trumf, vrak) sammen. Kandidatrommet er lite nok til å
enumereres — 4 trumffarger × C(16,4) = 7 280 par, og `estimerStikk` koster
ingenting. `src/moe2/eksperter/vrak.ts` gjør alt halve jobben (den fikser
trumfen av hånden som BLIR IGJEN), men den er ikke i det som spiller.

**Uprøvd og billig å måle før noe bygges:**
- Hvor ofte gjør vraket oss RENONSE i minst én farge?
- Hvor ofte etterlater vraket en singleton vi kunne blitt kvitt? (Å la ett kort
  stå igjen i en farge er etter doktrinen bortkastet — enten tøm den eller la
  den være.)
- Hvor ofte vraker vi ned i en farge uten å tømme den?

### Hvor ferdigheten faktisk mangler (`verktoy/forsvarsprofil.py`)

Målt som **fanget = (gulv − vår) / gulv**, der gulvet er angeren et tilfeldig
lovlig kort ville gitt i nøyaktig samme stilling. Det kontrollerer for
vanskelighetsgrad: et høyt angertall kan bety dårlig spill ELLER vanskelige
valg, og de krever motsatt handling.

| rolle | n | gulv | vår | **fanget** |
|---|---|---|---|---|
| spillefører | 31 796 | 2,0100 | 1,1414 | 0,432 |
| forsvar | 55 748 | 0,9130 | 0,5908 | 0,353 |
| **makker** | 25 350 | 0,3358 | 0,2477 | **0,262** |

Makker henter ut minst av tilgjengelig ferdighet — uavhengig bekreftelse på at
−0,22 mot MesterAI er det største hullet.

**Forsvaret dekomponert. Posisjon dominerer:**

| posisjon i stikket | n | fanget |
|---|---|---|
| **1. hånd (utspill)** | 7 190 | **0,208** |
| 2. hånd | 15 983 | 0,313 |
| 3. hånd | 16 187 | 0,398 |
| 4. hånd | 16 388 | 0,434 |

| | fanget |
|---|---|
| spillefører har alt lagt | 0,400 |
| **spillefører har IKKE lagt** | **0,244** |
| medforsvarer har alt lagt | 0,398 |
| medforsvarer har IKKE lagt | 0,331 |

**Og tidlig spill er langt verre enn sent:** stikk 0–4 ligger på 0,23–0,29,
stikk 10 på 0,830. Sent spill er nesten tvunget og lar seg regne ut; tidlig
spill krever en plan.

### Hva det peker på

Forsvarets hull er **utspillet og de første stikkene**, ikke sluttspillet.
Samspillet med medforsvareren er en ekte men mindre akse (0,398 mot 0,331) enn
posisjon (0,434 mot 0,208).

Det er også en advarsel mot søk som kur: PIMC ble prøvd i VRAK/VELG og strøk
med −0,256. Men søk i FORSVARETS TIDLIGE STIKK er aldri prøvd, og det er der
gulvet er høyest (1,20 i 1. hånd mot 0,87 i 4.) — altså der det er mest å hente.

## 9. Øyne-linjen er avsluttet på et velmålt nei (3. august, kveld)

Fem armer, nøyaktig samme 278 798 rader (`sd-v4`), samme holdout, samme
init-frø, samme 24 oppvarmingsepoker. Gate 2 på **n=8000** — prosjektets
største kjøring og beste oppløsning.

| blokk, isolert og parret mot kontrollarmen | bidrag | SE | σ |
|---|---|---|---|
| auksjon | +0,0453 | 0,0519 | +0,87 |
| telling | −0,0058 | 0,0460 | −0,13 |
| **alle tre sammen** | **−0,0777** | 0,0620 | −1,25 |
| kontroll (ren ekstra finjustering) | +0,0317 | 0,0649 | +0,49 |

Ingen når signifikans. Med SE ~0,05 utelukkes effekter over ~0,10 ved 2 SE.

**Datamengden var en ekte del av forklaringen, men ikke nok.** På 105k rader
var alle informasjonsarmer verre enn kontrollen på holdout; på 278k er to av
tre bedre. Retningen snudde. Poengene fulgte ikke etter.

**Kombinasjonen er verre enn delene** (−0,078 mot auksjonens +0,045). Arvinds
hypotese var at blokkene ville virke sammen; målingen peker motsatt vei.

**Det som står igjen fra linjen, og som er verdt mer enn resultatet:** to ekte
implementasjonsfeil ble funnet fordi Arvind nektet å godta nullresultatene —
oppvarmingen av nullstilte kolonner, og de 52 én-av-kolonnene som lærte nettet
runde-ID i stedet for spill (fører −1,475 → +0,598, 2,8 SE innenfor samme
bånd). Begge er generelle: **høy kardinalitet i et trekk som bare ÉTT sete ser,
er en memoreringsfelle**, og **nullstilte kolonner må varmes opp eller de kommer
aldri fram**.

### Køen etter dette, rangert etter målt styrke

| | signal | målt i poeng? |
|---|---|---|
| **makker: for gjerrig med honnør** | 7,5 % mot orakelets 23,1 % — **~19 SE** | nei |
| **makker: for ivrig etter stikk** | 6,0 % mot orakelets 16,1 % — **~5,4 SE** | nei |
| **forsvarets utspill** | fanget 0,208 mot 0,434 i 4. hånd | nei |
| vrak+trumf som ÉTT valg | 37 doktrinebrudd per 2 000 runder | nei |

Alle fire er sterkere signaler enn noe i øyne-linjen. **Benken kan nå skille
dem:** SE 0,05 parret ved n=8000, mot hull på 0,12–0,22. Prisen er ~40 min per
måling, og det er den reelle budsjettgrensen framover.

## 10. Orakelets tak — målt per rolle, og det er nådd

Arvind: *«hvor god er orakelet? vet vi at den er så god? hva er taket der?»*

Spørsmålet felte dagens sterkeste funn. Makkerdiagnosen hvilte på at orakelet
har rett i makkerstillinger — aldri vist. Godkjenningen var **aggregert**
(korrelasjon mot poeng, SD +0,718 mot DD −0,609), «12 verdener holder» var
aggregert, og rollout-policyen er NevroHjerne, boten vi slår med over ett poeng.

`src/moe2/rolleorakel.ts` + spekken `ork:<rolle>:<indre>`: orakelet spiller ÉN
rolle, `ftf1` alt annet. Frøbånd 9 900 000, n=2800. **Designet validerer seg
selv** — hver arm måler eksakt 0,0000 i rollene den ikke rører.

| orakelet spiller | n | effekt | SE | σ |
|---|---|---|---|---|
| spillefører | 700 | −0,3571 | 0,4427 | −0,81 |
| makker | 700 | −0,0781 | 0,0754 | −1,04 |
| forsvar | 1400 | −0,1529 | 0,1792 | −0,85 |
| **vektet til hele spillet** | | **−0,1852** | 0,1436 | −1,29 |

**Alle tre er negative.** Å følge orakelet er dårligere enn det nettet alt gjør,
i hver eneste rolle. Førertallet har riktig fortegn og størrelsesorden mot den
uavhengige +0,26 som alt sto i §2.

### Konsekvens 1: makkerdiagnosen er falt

De −15,6 pp og −10,1 pp måler at vi er **ulike** orakelet, ikke at vi tar feil.
Spiller orakelet makkerrollen selv, taper det 0,078. Å trene nettet *nærmere*
orakelet der — τ-sporet jeg foreslo — ville trolig gjort makkeren dårligere.
**Eksperimentet er avlyst.**

### Konsekvens 2: læreren er uttømt, og det forklarer hele dagen

| | |
|---|---|
| finjusteringen som LAGET `ftf1` | +0,136 |
| ekstra finjustering, 105k ferske rader | +0,005 |
| ekstra finjustering, 278k ferske rader | +0,032 |

Mer destillasjon gir mindre og mindre fordi **eleven har passert læreren**. Det
er ikke en datamengdefeil og ikke en trekkfeil — det er taket i metoden. Alle
tre trekk-blokkene i §9 ble målt mot nettopp dette taket, og det er derfor de
alle måler null.

### Hva som må til nå

Ikke flere trekk, ikke mer data av samme slag. **En bedre fasit.** I den
rekkefølgen de er billigst å prøve:

1. **Flere verdener, målt PER ROLLE.** «32 gir ikke mer enn 12» ble målt
   aggregert, og makkerstillinger har det minste spennet (gulv 0,336) — altså
   der samplingsstøy biter hardest. Samme `ork:`-benk, bare skru opp tallet.
2. **Bedre rollout-policy.** Orakelet spiller verdenene ferdig med NevroHjerne.
   Bytt til `vakt:abmp:e1` og se om taket løfter seg.
3. **Selvspill mot egen policy** i stedet for destillasjon fra et fast orakel —
   den strukturelle kuren når eleven har passert læreren.

Punkt 1 og 2 er timer, ikke dager, og bruker benken som alt er bygget.

## 11. Benken framover (Arvinds beslutning, 3. august)

*«jeg vil bevege meg vekk fra mesterAI benk fordi det tar for lang tid, og vi
har vel slått den.»*

**Gate 2 er arbeidsbenken.** SE 0,05 parret ved n=8000, minutter per måling.
MesterAI-benken brukes **én gang før noe settes ut**, som anker — ikke i løkka.

### Men «slått den» er ikke målt, og det skal stå

| måling | resultat | n |
|---|---|---|
| `vakt:abmp:e1:sd-r2` mot MesterAI | −0,273 ± 0,130 | 257 |
| samme + budmodellen | −0,218 ± 0,322 | **38** |
| budmodellens marginale bidrag | +0,357 ± 0,129 | — |

Legger man bidraget oppå, havner man rundt null til svakt positivt. Men det er
en **sammensetning av tre målinger**, ikke én måling. Den eneste direkte
målingen av hele Adams-stakken har n=38 og er ikke til å konkludere fra.
Sannsynligvis jevnt, muligens litt foran. **Ikke bevist slått.**

### Risikoen ved å bare bruke gate 2

Gate 2 måler forbedring **mot oss selv**. En bot kan bli bedre til å slå sin
egen forgjenger uten å bli bedre mot andre — særlig når kandidaten er finjustert
fra miljøet den måles mot. Derfor ankeret før utplassering.

### Feil i min egen orakelmåling, funnet 3. august kveld

`ork:`-benken i §10 brukte **NevroHjerne** som rollout-policy. Men `sd-v4` ble
generert med `--motpart vakt:abmp:e1:ftf1.bin`. Jeg målte altså et **svakere
orakel enn det som faktisk lager fasiten**, og konklusjonen «orakelet er
uttømt» kan være et artefakt av det. Spekken er rettet til
`ork:<rolle>:<verdener>:<indre>` der `indre` ER rollout-policyen, og §10 må
leses med det forbeholdet til den nye målingen er inne.


## 12. Orakelet var ikke uttømt — det var feilspesifisert (3. august, sen kveld)

`ork:`-benken i §10 brukte **NevroHjerne** som rollout-policy, mens `sd-v4` ble
generert med `--motpart vakt:abmp:e1:ftf1.bin`. Jeg målte altså et svakere
orakel enn det som lager fasiten, og konkluderte «uttømt» på det.

Kjørt på nytt med `indre` som rollout-policy, samme frøbånd, n=2800:

| orakelet spiller | feil policy (nevro) | **korrekt policy (oss)** |
|---|---|---|
| **spillefører** | −0,357 | **+0,896 ± 0,418 (+2,14 SE)** |
| makker | −0,078 | +0,009 ± 0,082 |
| forsvar | −0,153 | −0,130 ± 0,171 |

Førersetet svinger **+1,25** bare av å rette hvem orakelet forestiller seg
sitter ved bordet. Totalt per runde **+0,2240 ± 0,1047**, tegntest **205/145**
(z = 3,2). Trimmet snitt er +0,0079, altså drevet av store utslag — men to av
tre kriterier peker samme vei, og det er første gang tegntesten er klart
positiv.

**Mekanismen er ren:** `vurderSD` lar motparten spille verdenene ferdig i ALLE
seter. Er den modellen svakere enn bordet, undervurderes systematisk de linjene
som krever god oppfølging — og spillefører er nettopp setet som har flest slike
linjer å planlegge. Med riktig modell blir evalueringen korrekt spesifisert.

**Hva det betyr:** ett-plys framoverblikk ER en fungerende forbedringsoperator
for spillefører. Da er selvspill farbart, og §9s «øyne-linjen er avsluttet» må
leses om: de fem armene ble alle destillert fra et feilspesifisert orakel.

**Ikke adoptert.** +2,14 SE er et oppdagelsestall, og åtte av dem har krympet i
dag. Replikering kjører i frøbånd 14 400 000 med 900 givere × 6, sammen med to
akser: 24 verdener, og `sik:`-operatoren som bare overstyrer når den parrede
marginen overstiger støyen.

## 13. Køen etter 3. august, med begrunnelse

### 13.1 Søk er IKKE avgjort — de ti forsøkene delte en feilkobling

`ork:`-benken viste at rollout-policyen er alt: førersetet gikk fra **−0,357
til +0,896** bare av å bytte hvem orakelet forestiller seg spiller resten.

De ti søkeforsøkene i §2 brukte enten:

- **DD inne i hver verden** (`src/bot/bot.ts` løser eksakt) — og DD er målt til
  korrelasjon **−0,609** mot poeng, avvist gjennom godkjenningsporten, eller
- **SD med NevroHjerne som utspiller** — `sdagent.ts` sier det selv: *«Til nå
  har det alltid vært NevroHjerne»*.

**Ingen av dem testet søk med korrekt spesifisert utspilling.** «Søk er
avsluttet som linje» hviler derfor på ti målinger som alle hadde feil modell av
hvordan hånden ville bli spilt ferdig. Skal linjen lukkes, må den lukkes på
nytt.

### 13.2 Vrak og trumfvalg — urørt, og den dyreste beslutningen

`E1Agent` sender VRAK og VELG til `estimerStikk`, en håndlagd formel, i BEGGE
armer av hver måling gjort til nå. Fasedelingen på D1 målte trumfvalget til
**32,4 ± 3,0 poeng per kamp** — den dyreste enkeltbeslutningen i spillet.

Og Arvinds vrakdoktrin (§8) er ikke implementert: trumf og vrak skal velges som
ÉN beslutning med 16 kort på hånd. Kandidatrommet er `4 × C(16,4) = 7 280` par
— lite nok til å enumereres eksakt. `src/moe2/eksperter/vrak.ts` gjør allerede
halve jobben (fikser trumfen av hånden som BLIR IGJEN), men den er ikke i det
som spiller.

### 13.3 Motstandermodellering over runder (Arvinds design, 4. august)

> *«det skal skje over mange runder med samme motstander. at den adapterer
> gjennom mange runder for å bli bedre med/mot de andre. byr de høyt eller
> lavt, hvordan spiller de ut. jeg ser for meg at den husker hvor lang
> trumfserie du hadde siste gangene du bød 9, og tar det i betraktning når den
> gjetter hva hånden din er nå.»*

**Kroken finnes allerede.** `src/solver/sampler.ts` har `trekkVerdenBelief`,
som vekter samplede verdener etter `budForenlighet` — men den er en HÅNDLAGD
BEFOLKNINGSFORMEL: «bud n ⇒ forvent styrke rundt X». Den vet ikke *hvem* som
bød. Å bytte den mot en lært, per-motstander-tabell er hele tiltaket, og det
rører ingenting annet.

**Fasiten er gratis og perfekt.** Når en runde er ferdig, er alle kort spilt —
altså er HELE giva kjent i ettertid. For hver runde kan vi derfor logge, per
spiller: hva de bød, og hva de faktisk hadde (trumflengde i egen lengste farge,
honnører, fordeling). Det er et fullverdig veiledet signal uten noen ekstra
kostnad.

**Estimatoren må krympe mot befolkningen.** Etter tre runder mot en ny
motstander finnes det ikke nok observasjoner til et individuelt anslag. Riktig
form er derfor et krympingsestimat: start på befolkningssnittet (dagens
`budForenlighet`), og flytt mot individet i takt med antall observasjoner. Da
kan modellen slås på fra første runde uten å skade.

**Hvorfor dette er den riktige linjen, og ikke bare en til:** målet er å slå
FAMILIEN, ikke å finne en likevekt. Mot en fast motstanderpopulasjon er det
maksimale et **beste svar**. Budmodellen er allerede et beste svar mot passiv
byding — de +2,138 kommer av å utnytte at motparten passer for mye. Vi har
**988 loggede runder** med familiens faktiske spill som ligger ubrukt.

**Rekkefølge:** (1) logg giv + bud per spiller ved rundeslutt, (2) bygg
krympingsestimatoren, (3) bytt `budForenlighet` mot den, (4) mål med `ork:`- og
`sik:`-benkene, som allerede finnes.

### 13.4 Budet og kortspillet er aldri ko-optimert

Budmodellen er verdt **+1,072 i situ** (§ lagdekomponering) og er trent mot en
FAST kortspiller. Blir kortnettet bedre på bud 10, bør budmodellen by
annerledes — og omvendt. De to er halvparten av boten hver, og de er aldri
optimert sammen.

### 13.5 Alt må kunne destilleres

`ork:foerer` koster sekunder per trekk. Nettsiden kjører i nettleseren og kan
ikke søke. **En gevinst som ikke lar seg destillere inn i vektene er en gevinst
familien aldri møter.** Enhver søkebasert forbedring må derfor ha et
destillasjonssteg i planen fra starten, ikke som et etterpåheng.

## 14. FØRERORAKELET REPLIKERTE — og ble sterkere (3./4. august)

| bånd | snitt | SE |
|---|---|---|
| 11 100 000 | +0,2240 | 0,1047 |
| 14 400 000 (disjunkt) | +0,2330 | 0,0917 |
| **slått sammen, n=6400** | **+0,2291** | **0,0690 = 3,32 SE** |

**Første gang i dette prosjektet et oppdagelsestall ikke krympet**, og det sies
etter TO bånd, ikke ett.

| arm | totalt | fører | tegntest |
|---|---|---|---|
| `ork:foerer:12` | +0,2330 ± 0,0917 | +0,932 | 269/179 — 60,0 %, z = 4,3 |
| **`ork:foerer:24`** | **+0,4141 ± 0,0936** | **+1,656** | **286/148 — 65,9 %, z = 6,6** |
| `sik:foerer:1.5:12` | +0,1108 ± 0,0484 | +0,443 | 72/26 — **73,5 %**, z = 4,6 |

**Å doble verdenene nesten dobler gevinsten.** Det motsier «32 verdener gir
ingenting utover 12» — som ble målt AGGREGERT, ikke per rolle.

**Konfidensterskelen virker som designet:** griper inn i 98 av 434 givere, men
treffer i 73,5 % av dem. Halv effekt, minste feilmargin av alle tre.

Trimmet snitt er lite (+0,009), men medianforskjellen ER null fordi agentene
ofte velger likt. Tegntesten er riktig statistikk her, og z = 6,6 er ingen
haleeffekt.

### 14.1 ROLLESTYRT DESTILLASJON — Arvinds krav, og en designkonsekvens

> *«det bør destilleres der vi vet den spiller bedre, men hvis vi er bedre
> andre plasser som i forsvar/makker, så bevarer vi det.»*

Orakelet med korrekt rollout-policy, per rolle:

| rolle | orakelet mot nettet |
|---|---|
| **spillefører** | **+1,656** (24 verdener) |
| makker | +0,009 |
| **forsvar** | **−0,130** |

Destillerer vi fra orakelet i ALLE roller, lærer nettet bort forsvarsspillet
sitt. Treningen må derfor ha to slags rader:

- **førerrader → orakelets etiketter.** Der er læreren beviselig bedre.
- **makker- og forsvarsrader → NETTETS EGNE valg som mål.** Et anker, ikke en
  lærer. Uten det kan finjusteringen drive de rollene selv om ingen rad ber om
  det — vektene er delte.

Warm start alene er ikke nok: den setter startpunktet, ikke retningen.

### 14.2 `sd-v7` genererer nå, med ALT som er rettet i dag

| akse | verdi | hvorfor |
|---|---|---|
| bredde | 428 (v6) | plan- og troblokken med |
| verdener | **24** | +0,414 mot 12-verdeners +0,233 |
| stillingskilde | `budm:bud-gbt.json:vakt:abmp:e1:ftf1` | bud 10 er 47 % av det Adams spiller, 24 % av det den var trent på |
| rollout-policy | `vakt:abmp:e1:ftf1` | den feilen kostet −1,25 i førersetet |
| budspredning | 0 | ekte auksjoner, ellers er v4-blokken et generatorartefakt |
| rollevekt | 5 | føreren er der læreren har noe å lære bort |
| frøbånd | 280 M | disjunkt fra alt |

### 14.3 Rangerte mangler, per 4. august

| # | mangel | målt innsats | status |
|---|---|---|---|
| 1 | **vrak + trumfvalg som ÉN beslutning** | trumfvalg 32,4 ± 3,0 poeng/kamp | urørt, håndlagd formel i begge armer |
| 2 | **søk i vrak/velg med korrekt rollout** | ti forsøk, alle feilspesifisert | må gjøres om |
| 3 | **motstandermodellering over runder** | 988 loggede familierunder ubrukt | krok finnes (`trekkVerdenBelief`) |
| 4 | **destillasjon av `ork:foerer:24`** | +0,414/runde | `sd-v7` genererer |
| 5 | **bud × kortspill ko-optimering** | hver ~halve boten | aldri gjort |
| 6 | **forsvarets utspill** | fanget 0,208 mot 0,434 i 4. hånd | uprøvd |
| 7 | makkerens mål | differanse gjør makker lunken (7 mot 18 ved bud 9) | design, ikke feil |
| 8 | vaktene | +0,024 ± 0,060 med alt annet på | kandidat for FJERNING |

## 15. Adams-v1 mot familien — første tall, 3. august

| bot | runder | menneskets differanse | SE | tegn (menneske/bot) |
|---|---|---|---|---|
| **Adams-v1** | 107 | **−1,813** | 1,113 | 42 / **65** |
| forrige bot | 1 065 | **+2,798** | 0,324 | 652 / 413 |

Sete 0 er mennesket (`web/app.ts: const MENNESKE = 0`), så negativt betyr at
boten vinner. **Adams slår mennesket med 1,81 per runde; forgjengeren tapte med
2,80.** Et sprang på **4,61 poeng per runde**.

**Forbeholdet:** SE ±1,11 på 107 runder, altså 1,63 SE — ikke signifikant
alene. Tegntesten (65/42, z = 2,2) er sterkere. Det som overbeviser er avstanden
til forgjengeren, som ER solid målt (1 065 runder, SE 0,32). Og tallet gjelder
ÉN motstander, ikke hele familien.

## 16. Hva som går inn i botens vurdering — og de sju hullene

### Det som spiller i dag (`ftf1`, 273 trekk)

| indeks | hva |
|---|---|
| 0–51 | egen hånd |
| 52–103 | alle spilte kort — **uten hvem som spilte dem** |
| 104–155 | kortene på bordet nå |
| 156–207 | det etterlyste kortet, hvis ikke lagt |
| 208–219 | budvinner, utspiller, makker (relativt) |
| 220–227 | trumf, vinnerbud, amerikaner, er jeg på budlaget |
| 228–237 | stikk spilt/egne/lagets, poengandeler, stikk per sete, solo |
| 238–245 | egen fargefordeling, spilte kort per farge (summert) |
| 246–261 | renonse per sete × farge — **binært** |
| 262–272 | høyeste ute, antall ute, stikk igjen, har utspillet, bias |

### Bygget natt til 4. august, ikke satt ut

| blokk | trekk | legger til |
|---|---|---|
| v2 minne | 273–339 | budvinnerens vrak |
| v3 telling | 340–355 | antall per sete × farge |
| v4 auksjon | 356–363 | hva hvert sete bød |
| v5 plan | 364–375 | mangler, sikret, tapt, slakk |
| v6 tro | 376–427 | ytterpunkter spilt per sete × farge, **øvre grense** |
| v7 verdi | 428–457 | sikre stikk, sikre tapere, **tvingning** |

### DE SJU HULLENE SOM FORTSATT STÅR

1. **Hvilke SPESIFIKKE kort hvert sete har spilt.** v6 gir ytterpunktene.
   Full tilordning er 4 × 52 = 208 trekk — eneste eksakte koding, og dyr.
2. **Rekkefølgen i stikket.** Vi ser hva som ligger, ikke i hvilken orden.
   «Andre hånd lavt, tredje hånd høyt» er signaler som ikke finnes i kodingen.
3. **Budsekvensen**, ikke bare sluttbudet per sete. Hvem åpnet, hvem hoppet,
   hvem ga seg først — borte.
4. **Forsvarernes side av talongen.** v2 dekker budvinneren. Forsvarerne vet at
   fire kort er døde, men ikke hvilke — og at budvinneren VET det. Asymmetrien
   er ukodet.
5. **Motstandermodell over runder.** Ingenting. Kroken (`trekkVerdenBelief`)
   står ubrukt. Se §13.3.
6. **KAMPSITUASJONEN.** 231–232 gir poengandeler mot 100, men ikke «hvem kan
   vinne KAMPEN denne runden». Nær 100 endrer det optimal risiko fullstendig —
   å felle lederen kan være verdt mer enn egne poeng. **Undervurdert:** de andre
   hullene er informasjon om hånden; dette er informasjon om hva som er verdt å
   gjøre. En bot som spiller likt på 20–20–20–20 og på 95–40–40–40 spiller feil
   i minst én av dem, og familien spiller alltid til 100.
7. **Hvem som får utspillet neste stikk.** Utledbart, men ikke eksplisitt — og
   det styrer hele planleggingen.

## 17. Vrak+trumf som ett valg — på hylla, med en forklaring som gjelder bredt

Frøbånd 19 900 000, n=3600, mot `ftf1`:

| arm | totalt | SE | σ | tegn |
|---|---|---|---|---|
| `vv:12` | +0,0758 | 0,1038 | +0,73 | 207/212 |
| `vv:24` | +0,1889 | 0,1040 | +1,82 | 212/198 |

Skalerer med verdener som førerorakelet, men tegntesten er jevn (z = 0,69) mot
førerorakelets z = 6,6. **Ikke etablert. På hylla, ikke forkastet.**

**FORKLARINGEN GJELDER MER ENN DETTE FORSØKET.** Ved vrak er ingenting spilt
ennå, så verdensrommet er på sitt aller største og 24 utvalg er nesten
ingenting. Førerorakelet virker fordi det står midt i runden, der hvert spilt
kort og hver renonse har skåret bort muligheter.

> **Verdien av samplet søk vokser når verdensrommet krymper. De tidligste
> beslutningene er de vanskeligste å søke i.**

Det forklarer også hvorfor de ti tidligere søkeforsøkene i VRAK/VELG feilet, og
det peker på hva som må til for å lykkes der: enten mange flere verdener, eller
en bedre prior over hva motparten har — altså **motstandermodellen** (§13.3),
som er nettopp et middel til å krympe verdensrommet.

**Tre ting som ikke er utelukket her:** kandidatgenereringen er doktrinstyrt og
prøver ~6 vrak per trumffarge, ikke alle C(16,4); verdenstallet er ikke drevet
høyere enn 24; og `estimerStikk` kan allerede være nær optimal.

### Ordbruk rettet, 4. august

Arvind: *«ikke gi opp på konsepter, men du kan legge de på hylla.»* Planen har
brukt «forkastet» om ting som er målt mot enten et feilspesifisert orakel eller
en ødelagt trener. Det er for hardt. **Telleblokken, minneblokken, de ni
regelforsøkene og de ti søkeforsøkene er UTESTÅENDE, ikke døde** — alle ble
målt før 3. august, da rollout-policyen og oppvarmingen ble rettet.

## 18. Planblokken konverterer ikke — og mønsteret er nå entydig

Frøbånd 21 200 000, n=6000:

| | mot `ftf1` | isolert mot kontrollarmen `p5n` |
|---|---|---|
| `p5p` plan | +0,0826 ± 0,0776 | **−0,0187 ± 0,0707** |
| `p5alt` alle blokker | +0,0841 ± 0,0837 | −0,0172 ± 0,0777 |
| `p5n` ingen ny info | +0,1013 ± 0,0746 | — |

Kontrollarmen er BEST. Planblokken hadde 4× viktigheten til noen annen ny
blokk (kryssindeksen) og gir null i poeng. Skjermen er nå bekreftet to ganger:
**høy viktighet i fordelingen ≠ gevinst utenfor den.**

### Fem blokker, samme svar

| blokk | isolert bidrag |
|---|---|
| v2 minne | +0,100 ± 0,064 (tre bånd, fortegnsskifte) |
| v3 telling | −0,006 ± 0,046 |
| v4 auksjon | +0,045 ± 0,052 |
| v5 plan | −0,019 ± 0,071 |
| v6 tro / v7 verdi | ikke målt ennå (`sd-v7`) |

### DEN VIKTIGSTE KONKLUSJONEN I HELE ØKTA

Fem blokker med ny informasjon eller nytt regnestykke: **alle null.**
Ett-plys framoverblikk med korrekt rollout-policy: **+0,414, z = 6,6.**

> **Flaskehalsen er ikke hva nettet kan SE. Den er hva nettet kan REGNE UT.**

Avledede trekk (plan, verdi) hjelper ikke, fordi de er funksjoner av det nettet
allerede ser — et nett med 500 000 parametre kan regne dem selv. Ny informasjon
(minne, telling, auksjon) hjelper ikke, fordi nettet allerede henter ut det
datamengden tillater.

Men et framoverblikk er ikke en ny inngang — det er en ny BEREGNING, og det er
den eneste som har betalt.

**Det setter ikke blokkene på båten**, det setter dem på hylla: alle fem ble
målt på data generert med 12 verdener og uten budmodell i stillingskilden.
`sd-v7` retter begge. Men prioren er nå svak, og maskintiden bør gå til søk.

## 19. Hva kan optimeres 100 % matematisk — målt svar

Arvind spurte hvilke deler av spillet som lar seg optimere eksakt.
`examples/verdensrom.ts` teller forenlige verdener per stikk, 120 runder:

| stikk | median forenlige verdener | andel under 100k |
|---|---|---|
| 0 | 3,8 × 10¹⁴ | 0 % |
| 5 | 4,2 × 10⁹ | 0 % |
| 7 | 1,1 × 10⁷ | 11 % |
| 8 | 2,5 × 10⁵ | 40 % |
| **9** | **6 300** | **92 %** |
| **10** | **130** | **100 %** |
| 11 | 5 | 100 % |

**Uttømmende enumerering er råd fra stikk 9, triviell fra stikk 10.**

### Og det er nøyaktig der vi allerede spiller godt

Forsvarsprofilen (`verktoy/forsvarsprofil.py`) målte `fanget`:

| stikk | fanget |
|---|---|
| 0–4 | 0,23 – 0,29 |
| 9 | 0,662 |
| 10 | **0,830** |

**Eksaktheten er tilgjengelig presis der den trengs minst.** Der vi er svake —
de fire første stikkene — er rommet 10⁹ til 10¹⁴ verdener, altså håpløst.

Det forklarer `eksaktagent`s −0,29 … −0,78: den løser eksakt i sluttspillet, der
det ikke er mye å hente, og faller tilbake på dobbelt-dummy der det er.

**Linjen lukkes, og den lukkes med et tall.** Ikke fordi eksakt regning er feil,
men fordi den bare er tilgjengelig i den delen av spillet vi alt behersker.

Det eneste som kan flytte den grensen, er en bedre PRIOR over hva motparten har
— altså motstandermodellen (§13.3). Den krymper ikke rommet matematisk, men den
gjør at få samplede verdener bærer mer. Samme konklusjon som §17 nådde fra en
annen kant.

## 20. DESTILLASJONEN VIRKER — og rollestyringen var feil

Frøbånd 23 500 000, n=6000, mot `ftf1`. Alle tre armene er destillert fra
`sd-v7`: 544 573 rader, 24-verdeners orakel, korrekt rollout-policy,
budmodellen som stillingskilde.

| arm | totalt | SE | σ | trimmet | tegn |
|---|---|---|---|---|---|
| **`d7alle`** lærer overalt | **+0,2264** | 0,0826 | **+2,74** | +0,0186 | 987/920 |
| `d7a` rollestyrt | −0,0554 | 0,0860 | −0,64 | −0,0532 | 1013/1260 |
| `d7b` rollestyrt + blokker | −0,0541 | 0,0899 | −0,60 | −0,0985 | 1115/1437 |

### `d7alle` per rolle

| rolle | effekt | σ |
|---|---|---|
| fører | +0,3889 | +1,48 |
| makker | −0,0369 | −0,89 |
| **forsvar** | **+0,2768** | **+2,81** |

### FEILEN, OG DEN ER PRINSIPIELL

Jeg sluttet fra **«orakelet SPILLER dårlig i forsvar» (−0,130, `ork:`-benken)**
til **«orakelet LÆRER BORT dårlig i forsvar»**. Det er to helt ulike ting:

- **Å spille** orakelets valg er `argmax` over 12 støyete verdener. Støyen
  treffer hver eneste beslutning. Atferdsmålingen viste at orakelet var SIKKERT
  i bare 1,3 % av uenighetene.
- **Å lære av** orakelets verdier lar nettet midle over tusenvis av liknende
  stillinger. Støyen kanselleres.

> **Destillasjon er en støydemper. En dårlig spiller kan være en god lærer.**

Det forklarer også hvorfor ankeret SKADET: `d7a`s makker måler −0,1911
(−3,72 SE). Selvdestillasjon mot startnettets egne logits er et langt svakere
signal enn orakelets verdier, så ankeret erstattet god læring med ingen læring.

Arvinds prinsipp — bevar der vi er bedre — var riktig. Jeg brukte feil måling
til å avgjøre HVOR, og `ork:`-benken svarer på et annet spørsmål enn den jeg
stilte den.

**IKKE ADOPTERT ENNÅ.** +2,74 SE på ett bånd, med tegntest 987/920 (z = 1,53)
og trimmet +0,019. Replikering kjører i frøbånd 25 800 000 med n=8000.

## 21. Motstandermodellen har data allerede — målt 4. august

Arvind: *«jeg ser for meg at den husker hvor lang trumfserie du hadde siste
gangene du bød 9.»*

**DATAEN FANTES, og det var ikke åpenbart.** Val Town-loggen har ingen hender —
men den har HVERT kortvalg mennesket gjør, og kortene et menneske spiller ER
hånden. 1 172 runder har nøyaktig 12 `valg-kort`, altså en fullstendig hånd.

Den ene komplikasjonen: er mennesket budvinner, tok det opp talongen og vraket
fire, så de spilte kortene er ikke den utdelte hånden. Derfor brukes bare
runder der mennesket IKKE vant budet — 768 av dem.

| bud | runder | lengste farge | honnører | ess |
|---|---|---|---|---|
| passet | 298 | 4,40 | 1,27 | 0,60 |
| bød 7 | 161 | 4,32 | 1,18 | 0,47 |
| bød 8 | 226 | 4,51 | 1,79 | 0,87 |
| **bød 9** | 67 | **5,00** | **2,31** | **1,24** |

**Signalet er sterkt og er nøyaktig det Arvind beskrev.** Bud 9 mot bud 7:
+0,68 i lengste farge, **+1,13 honnører (≈ 7,5 SE)**, +0,77 ess.

**OG EN TING TIL SOM ER BRUKBAR VED BORDET:** å passe og å by 7 ser helt like
ut (1,27 mot 1,18 honnører). Informasjonen ligger i de HØYE budene; de lave
skiller ikke mellom «svak hånd» og «forsiktig spiller».

### Hva som gjenstår for å ta det i bruk

1. `budForenlighet` i `src/solver/sampler.ts` er i dag en HÅNDLAGD
   befolkningsformel som ikke vet hvem som bød. Den skal byttes mot disse
   målte tallene.
2. Krympingsestimator: start på befolkningstallene over, flytt mot individet
   etter antall observasjoner. Da kan modellen stå på fra runde 1.
3. Per spiller er tallene tilgjengelige i samme logg — navnene ligger BARE i
   Val Town-basen og skal aldri i dette repoet.

**Hvorfor dette er den riktige linjen:** både §17 (vrakvelgeren feilet fordi
verdensrommet er størst tidlig) og §19 (eksakthet er bare råd fra stikk 9)
ender samme sted — det som mangler er en bedre PRIOR over hva motparten har.
Dette er den prioren, og den er målt.

## 22. Adams revidert top-down og bottom-up (4. august)

### Top-down: to av fire beslutninger er urørt

`examples/adams-revisjon.ts`, 400 runder:

| beslutning | hvem tar den |
|---|---|
| BUDRUNDE | budmodellen — endrer nevros valg i **29,0 %** |
| **VRAK** | **NevroHjerne, 100,0 %** |
| **VELG** | **NevroHjerne, 100,0 %** |
| SPILL | nettet — uenig med nevro i 56,9 %; vakten endrer 8,7 % |

**Hullet kunne aldri ha vist seg:** NevroHjerne tar VRAK og VELG i BEGGE armer
av hver måling prosjektet har gjort, så en forskjell kan per konstruksjon ikke
komme derfra.

### Bottom-up: to uundersøkte beslutninger, begge nå målt

Frøbånd 37 000 000, n=6000, miljø = Adams-v2:

| endring | effekt | σ | tegn |
|---|---|---|---|
| etterlys nest høyeste | −0,9111 ± 0,1105 | −8,24 | 304/669 |
| etterlys tredje høyeste | −1,6411 ± 0,1215 | −13,51 | 274/872 |
| fjern vaktene | −0,1563 ± 0,0495 | −3,16 | 566/455 |

**ETTERLYSNINGEN: dagens regel er riktig, med stor margin.** Reglene tillater
bare trumfkort (`lovligeEtterlys`), så valget er hvilken valør. NevroHjerne
kaller alltid den høyeste. Hypotesen om at et lavere kort er bedre — fordi det
holder partnerskapet skjult lenger — taper klart, og monotont: jo lavere, jo
verre. En uundersøkt heuristikk viste seg riktig, og nå står det et tall bak.

**VAKTENE SKAL IKKE FJERNES**, og tallet er lærerikt: tegntesten sier at det å
fjerne dem er BEDRE i 566 av 1 021 givere — men snittet er −0,156. Vaktene
koster små hyppige gevinster og forhindrer sjeldne katastrofer. Det er nøyaktig
det konvensjonsvakter er til for.

**Og jeg var i ferd med å rive dem ut** på en måling i et annet miljø (+0,024 ±
0,060 med `ftf1` og budmodellen på). Med det nye nettet er de verdt −0,156 å
miste. Et lag som måler null i én sammensetning kan være verdifullt i en annen.

## 23. Vrak/trumf: presist målt, og søket TAPER

### Den fokuserte benken var det som manglet

`examples/vrakbenk.ts` teller bare runder der kandidaten var budvinner, og
parrer på giv OG budvinner. Gate 2 dilutterer: valget tas i ~25 % av radene,
resten er varians rundt et valg som aldri ble tatt.

| måling | SE på førerbeslutningen |
|---|---|
| gate 2, n=2596 | ±0,507 |
| **vrakbenken, n=3000** | **±0,250** |

| | mot NevroHjerne | trimmet | tegn |
|---|---|---|---|
| `vv2` med policyer | **−0,5119 ± 0,2501** | −0,5714 | 711/849 |
| `vv` første forsøk | −0,6306 ± 0,2534 | −0,6925 | 728/835 |

Gate 2 sa −0,010 ± 0,126 og kunne ikke se det. **Søket koster en halv poeng
per budvinnerrunde**, og alle tre kriteriene er enige.

### Årsaken, med tall

Ved vrak er ingenting spilt, så verdensrommet er **3,8 × 10¹⁴** (§19).
`argmax` over 28 kandidater, hver anslått på 24 trukne verdener, plukker den
kandidaten som fikk de SNILLESTE verdenene.

> **Flere kandidater gjør det verre, ikke bedre.** Vinnerens forbannelse vokser
> med antall trekninger.

Policyene mine lager FLERE kandidater enn forrige forsøk, og forsterket dermed
problemet i stedet for å løse det. Det er en generell lærdom om
kandidatgenerering under støyete evaluering.

### Kuren er den som alt virket

`Vrakvelger2` har nå samme konfidensterskel som `sik:` fikk for kortspillet:
behold verdien PER VERDEN, regn den parrede differansen mellom beste og nest
beste, og la NevroHjerne bestemme når marginen ikke slår støyen.

## 24. Skrallen konvergerer, men er ikke ferdig

| orakelet mot | `ftf1` | Adams-v2 |
|---|---|---|
| fører | +1,656 | **+0,688 ± 0,389** (1,77 SE) |
| forsvar | −0,130 | −0,091 ± 0,156 |

Førergapet er krympet **60 %**. En tredje omdreining gir anslagsvis +0,06 mot
forrige rundes +0,143 — fortsatt positivt, men avtagende.

Og forsvarstallet bekrefter §20: orakelet SPILLER forsvar litt dårligere enn
Adams-v2, men å LÆRE av det ga +0,187 ± 0,061. Destillasjon er en støydemper.

## 25. Konfidensterskelen snur fortegnet — og avslører den ekte feilen

Vrakbenken, 3 000 budvinnerrunder mot NevroHjerne:

| | effekt | overstyringer av 3000 |
|---|---|---|
| uten terskel | −0,5119 ± 0,2501 | alle |
| **σ = 1,5** | **+0,0692 ± 0,0880** | 230 |
| **σ = 3** | **+0,0421 ± 0,0269** | 34 |
| `tel` med σ=2, 48 verdener | −0,5396 ± 0,1815 | 897 |

Terskelen snur fortegnet, så vinnerens forbannelse var riktig diagnose. Men
effekten er nå liten fordi den nesten aldri overstyrer.

### Den siste raden er den viktigste

`tel` er policyen med bare «kast de fire laveste». Den overstyrer 897 ganger og
taper stort — selv med σ = 2.

**Kandidatene var dårligere enn det de skulle slå.** NevroHjernes vrak er et
NETT som scorer hvert kort; «de fire laveste» er en grov regel. Terskelen kan
ikke redde en kandidatmengde som ikke inneholder noe bedre.

**Rettet:** det indre lagets EGET valg er nå alltid en kandidat, både i
`vrakorakel.ts` og i den lærte velgeren som kommer. En modell som ikke kan
velge det bestående kan bare gjøre det verre.

## 26. Vrak/trumf uten søk — Arvinds krav, og målingen er enig

*«Når det kommer til vrak og trumf komboen så bør det ikke være søk. Du må
finne noe bedre.»*

Søk ved vrak er strukturelt håpløst: verdensrommet er 3,8 × 10¹⁴, og skjevheten
i `argmax` vokser med antall kandidater. Men **støyen er et sanntidsproblem,
ikke et læringsproblem** — samme lærdom som §20: orakelet spiller forsvar
dårligere enn nettet (−0,09) og lærer det likevel bort med +0,187.

`examples/vrakorakel.ts` merker (trumf, vrak)-par **offline** med 40 verdener,
felles per stilling så kandidatene er parret, og skriver én linje per stilling
med ALLE kandidatene — så modellen lærer å RANGERE, som er det valget krever.

`src/moe2/vraktrekk.ts` gir 24 trekk: lengder og honnører sett fra trumfen,
renonser, trumftopp, kontrakten vi vant på, og **hva de tre andre bød** — fordi
Arvind ba om det.

**Første prøve: 8 kandidater per stilling, spenn 20,2 poeng mellom beste og
verste.** Valget betyr mye. Problemet var aldri at det ikke er noe å hente.

## 27. Hva «umulig å slå i det lange løpet» krever — regnet ut

Adams-v1 mot mennesket: **−1,8131 per runde, SD 11,455** (107 runder).

**Sannsynligheten for at mennesket ligger foran etter N runder:**

| runder | mennesket foran |
|---|---|
| 10 | 1 av 3 |
| 100 | 1 av 18 |
| 200 | 1 av 79 |
| **400** | **1 av 1 292** |
| 800 | 1 av 264 000 |
| 1600 | 1 av 8,2 milliarder |

**Boten er allerede god nok — hvis ledelsen er ekte.** Det er det eneste som
gjenstår å vise.

**Og det er et MÅLESPØRSMÅL, ikke et botspørsmål:**

| runder | ledelsens presisjon |
|---|---|
| 107 (i dag) | 1,64 SE |
| 200 | 2,24 SE |
| **400** | **3,17 SE** |
| 1000 | 5,01 SE |

Vi trenger ~400 menneskerunder for å feste ledelsen på 3 SE. Så følger resten
av aritmetikk.

**Konsekvens for prioritering:** familien må spille. 107 runder er ikke nok
uansett hvor mye botten forbedres, og null runder er logget mot Adams-v2. En
større ledelse kommer raskere dit — med 3,0 i stedet for 1,8 halveres antall
runder som trengs — men uten spilte runder kan ingenting vises.

### Hvorfor motstandermodellen ikke påvirker Adams i dag

Adams-v2s kortspill er et RENT NETT. Det sampler ikke verdener, så budprioren
i `trekkVerdenBelief` rører den ikke. Motstandermodellen hjelper bare agenter
som søker — og søk kan ikke kjøre i nettleseren.

**Veien er å bake den inn i TRENINGSDATAEN:** generer etiketter der verdenene
samples med menneskeprioren og rolloutene bruker en menneskeklone, og destiller.
Da lærer nettet å utnytte familiens tendenser, og gevinsten koster
millisekunder ved spilletid.

Byggeklossene finnes: `examples/menneske-atferd.ts` rekonstruerer hele giva fra
frøet (motoren deler ut deterministisk), `analyse/menneskedata/` har 813
loggede runder, og `src/moe2/mesterklone.ts` har mønsteret — bygg klonen som et
påbygg på NevroHjerne, som allerede er enig med målet i to av tre kortvalg.

---

# STATUS 4. august, ettermiddag — og veien videre

## Det som er ute og virker

**Adams-v2** = `budm:bud-gbt.json : vakt:abmp : e1:d7alle.bin`, verifisert live.
Destillert fra 544 573 rader med 24-verdeners framoverblikk og korrekt
rollout-policy. **+0,1434 ± 0,0526** over to disjunkte frøbånd, med forsvaret
som sterkeste komponent (+0,1866 ± 0,0609).

Mot mennesket leder forgjengeren **1,813 ± 1,107** per runde på 107 runder.
Null runder logget mot v2 ennå.

## De fire lærdommene som styrer alt videre

1. **Rollout-policyen er alt.** Å bytte NevroHjerne mot vår egen bot i
   SD-evalueringen flyttet førersetet fra −0,357 til +0,896. En modell som
   beskriver feil motpart er verre enn ingen modell.

2. **Destillasjon er en støydemper.** Orakelet SPILLER forsvar dårligere enn
   nettet (−0,09) og LÆRER det likevel bort med +0,187. En dårlig spiller kan
   være en god lærer. Det gjelder overalt hvor sanntidsstøy ødelegger argmax.

3. **Flere kandidater gjør søk verre, ikke bedre.** Vinnerens forbannelse
   vokser med antall trekninger. Ved vrak, der verdensrommet er 3,8 × 10¹⁴,
   koster søket −0,51 per budvinnerrunde.

4. **Høy viktighet i fordelingen ≠ gevinst utenfor den.** Planblokken hadde
   4× viktigheten til noen annen ny blokk og ga −0,019. De 52 én-av-kolonnene
   hadde 0,390 og kostet −1,475.

## Køen, rangert

| # | oppgave | status |
|---|---|---|
| 1 | **La familien spille mot v2** | blokkerer alt — se §27 |
| 2 | vrak/trumf-rangeringsmodell | data genererer |
| 3 | menneskeklonen | blokkert på data, nå fikset framover |
| 4 | tredje omdreining av skrallen | `sd-v8`, anslag +0,06 |
| 5 | bud × kortspill ko-optimering | aldri gjort |

## Menneskeklonen: hvorfor den var blokkert, og hva som er gjort

Klonen er den eneste linjen som angriper målet DIREKTE: mot en fast
motstanderpopulasjon er det maksimale et **beste svar**, ikke en likevekt.

Men den krever å gjenskape loggede runder, og det viste seg umulig i praksis:
av 1 172 loggede runder lot bare **123** seg gjenskape. Årsaken er at replayen
krever NØYAKTIG den boten som satt der — divergerer ett kortvalg, endres
stikkvinneren og hele turrekkefølgen forskyver seg. De eldste rundene ble
spilt mot PIMC (`"styrke":"MAKS"` i loggen), ikke mot nettet.

**Korrekthetsporten fanget to av mine egne feil underveis**, og ingen av dem
krasjet:

- CRLF i eksportfilen gjorde at siste kort i hver linje ikke matchet regexen;
  med `break` i parsingen ble 1 171 av 1 172 runder hoppet over i stillhet.
- `blandeSeed(frø, rn) = frø + (rn+1)·M`, så runde `rn` krever
  `opprettSpill(frø + rn·M)`. Jeg brukte `(rn+1)` og fikk feil giv i ALLE
  runder — de ga bare kort mennesket aldri hadde.

**Den varige løsningen er ikke bedre gjenskaping — det er å logge giva.**
`web/app.ts` logger nå hele historikken, vraket, trumfen, etterlysningen og
makkeren ved rundeslutt. Hver framtidig runde blir dermed treningsdata uten et
eneste gjenskapingssteg. Ingen ny lekkasje: klienten spiller runden lokalt og
har alt i minnet fra før.

## 28. De fire foreldede konstantene — målt, ikke gjettet (5. august)

Arvind: «ta hånd om disse. ikke gjett, men ta å finn nøyaktige mål.»

Fire konstanter i budmodellen var kalibrert mot eldre versjoner av andre
komponenter og aldri målt på nytt. Mønsteret er det samme som har gitt de
største gevinstene i prosjektet: *en konstant kalibrert mot en tidligere
versjon av en annen komponent er gratis penger som ligger og råtner.*

Men denne runden er også den beste påminnelsen om det motsatte: **«aldri målt»
er ikke det samme som «feil».** To av fire var i orden.

| konstant | forventning | MÅLT |
|---|---|---|
| `vant[N]` | skjev | **råtten** — bud 9 sto 0,662 mot faktiske 0,097. **+0,127 ± 0,043** |
| σ-gulvet 0,6 | binder for hardt | **inert** — 0,3 og 1,0 gir BIT-IDENTISK spill |
| μ | ukjent | **skjev +0,130 — men å rette den koster −0,09** |
| `evForsvar` | to roller i én | splittet, måles |

### σ er perfekt kalibrert, og det er derfor gulvet er dødt

`examples/budkalibrering.ts`, 3 000 runder, budvinnerens anslag i budøyeblikket:

    mu i snitt        9,804      faktisk lagstikk  9,934   SKJEVHET +0,130
    sigma modellen sier   1,227
    FAKTISK spredning     1,228   forhold 1,00x

Usikkerhetsanslaget er altså riktig på tredje desimal. Gulvet på 0,6 binder
nesten aldri, og når det først binder (1,8) koster det −0,083. **Ingenting å
hente.** Konstanten er verken feil eller viktig.

### μ-SKJEVHETEN ER ET SELEKSJONSARTEFAKT — og dette er den viktige lærdommen

Skjevheten på +0,130 ser ut som gratis penger: modellen undervurderer, altså er
boten for feig, altså legg til 0,130. Målingen sier det stikk motsatte:

| arm | poeng/runde | tegntest |
|---|---|---|
| μ − 0,13 | +0,037 ± 0,045 | z = −0,10 (støy) |
| μ + 0,13 | **−0,090 ± 0,046** | z = −1,97 |
| μ + 0,30 | **−0,393 ± 0,071** | z = −4,99 |

Monoton dose-respons, kontrollarmen nøyaktig 0,0000. Å legge til μ gjør det
verre, jevnt og trutt.

**Hvorfor?** Kalibreringen målte μ mot faktiske lagstikk *for budvinneren*. Men
budvinnerne er ikke et tilfeldig utvalg — det er nettopp de hvis hender slo
anslaget godt nok til å vinne auksjonen. Å betinge på «vant budrunden» velger
ut de heldige. Skjevheten ligger i UTVALGET, ikke i modellen.

Dette er vinnerens forbannelse med motsatt fortegn, og det er tredje gang i
prosjektet en betinget måling har pekt feil vei. **Regel: en skjevhet målt på
et utvalg som er selektert PÅ den størrelsen man måler, er ikke en skjevhet.**

μ står urørt. `μSkift` beholdes som parameter (standard 0) fordi den gjorde
målingen mulig og koster ingenting.

### `evForsvar` var to størrelser med ett navn

Konstanten tjente to roller samtidig:

  TERSKELEN        `bv`-startverdien — hvor godt et bud må være for å bys.
  FORSVARSVERDIEN  leddet `(1−p)·evForsvar` — hva vi får når vi IKKE vinner.

I spørsmålet «skal jeg by?» kansellerer de mot hverandre. I valget MELLOM to
bud gjør de det ikke:

    ev(N1) − ev(N2) = p1·2N1(2P1−1) − p2·2N2(2P2−1) + (p2−p1)·forsvarsverdi

Leddet overlever når p1 ≠ p2 — og etter at `vant[N]` ble rettet spriker de
voldsomt (bud 9: 0,097 mot bud 10: 0,940). Konstanten styrer altså valget
mellom 9 og 10 direkte, uten noen gang å ha vært målt i den rollen.
Nå splittet i `examples/gate2.ts` som `@<terskel>/<σgulv>/<μskift>/<forsvarsverdi>`;
utelates den, faller den tilbake på terskelen og alle gamle spesifikasjoner
spiller bit-identisk.

### AMERIKANER er lagt inn — og modellen har rett i å aldri melde den

Agenten løkket bare over TALLBUD og kunne derfor aldri melde Amerikaner
uansett hvor god hånden var. Nå er den med, med eksakt aritmetikk: den krever
NØYAKTIG det samme som bud 12 (alle stikk), men betaler mål/2 = 50 mot bud 12s
2 × 12 = 24. Samme P, dobbel innsats.

0 meldinger på 3 000 runder — og det er **riktig**, ikke en feil:

| μ | faktisk P(alle 12) | modellen sier |
|---|---|---|
| 10,5 | 20,4 % | 20,6 % |
| 11,0 | **39,7 %** | 34,2 % |

Selv på de beste hendene tar laget alle tolv i 40 % av tilfellene. Amerikaner
krever 47 % for å slå terskelen, og ved μ = 11 gir bud 11 en EV på **+7,0** mot
Amerikanerens **−10,3**. Tallbudet dominerer alltid. Situasjonen finnes (7,12 %
av virkelige runder tar alle 12), men den er ikke FORUTSIGBAR i budøyeblikket.

SOLO er fortsatt utelatt med vilje: μ anslår LAGETS stikk, og å bruke det for
et bud som krever at budvinneren alene tar alt ville systematisk overby.

### ETTERLYSNINGEN ER ENDELIG AVKLART — høyeste trumf, og det er ikke nære på

Avveiningen var ekte og verdt å teste: et lavere kall holder makkeren skjult
lenger, fordi et høyt kall er en vinner som spilles tidlig og røper
partnerskapet med en gang. Gate 2, 2 200 givere, 1 429 avgjorte:

| arm | poeng/runde | tegntest |
|---|---|---|
| nivå 1 (nest høyeste) | **−1,272 ± 0,105** | **z = −13,25** |

Den gamle målingen mot en svakere bot ga −0,911. Mot dagens stakk treffer det
**hardere**, ikke mykere — hemmeligholdet blir mindre verdt jo bedre resten av
laget spiller, fordi en svakere makker koster mer når makkeren faktisk kan
utnytte styrke.

EGENKONTROLLEN SOM GJØR TALLET TROVERDIG: makker- og forsvarsradene står på
NØYAKTIG 0,0000. Laget endrer bare budvinnerens VELG, så hele utslaget skal
ligge i spillførersetet — og det gjør det. En lekkasje til de andre setene
ville betydd at klassen gjorde noe den ikke skulle.

Spørsmålet er lukket. `Etterlysvelger` beholdes som måleinstrument, men nivå 0
er og blir regelen.

### Forsvarsverdien: gradienten peker NEDOVER, ikke oppover

Første sveip målte bare oppover fra dagens koblede −3,0:

| forsvarsverdi | poeng/runde | tegntest |
|---|---|---|
| −1,0 | −0,005 ± 0,032 | z = −2,01 |
| 0,0 | −0,017 ± 0,038 | z = −2,31 |
| +1,5 | −0,030 ± 0,044 | z = −2,98 |

Monotont, og alle tre tegntestene signifikant negative. Optimum ligger altså
på eller UNDER −3,0, og halve svaret manglet. Sveipen nedover gir:

| forsvarsverdi | poeng/runde | tegntest |
|---|---|---|
| −14,0 («meld aldri 9») | −0,095 ± 0,032 | z = −2,95 |
| −8,0 | −0,119 ± 0,031 | z = −2,82 |
| −5,0 | −0,115 ± 0,032 | z = −2,63 |

BEGGE RETNINGER TAPER. Den koblede verdien er et lokalt optimum til begge
sider, og hypotesen om to sammenblandede størrelser var FEIL.

Og grunnen er økonomisk, ikke tilfeldig: terskelen er «hva jeg kan få ved å
ikke by», forsvarsverdien er «hva jeg får når jeg ikke vinner». Å ikke vinne
auksjonen ER å forsvare. Det er **samme mengde per definisjon**, og da er det
riktig at de er like. Koblingen er også nettopp det som får `p` til å
kansellere i budspørsmålet og gir den rene algebraen `2N(2P−1) > e` som ga
+0,39 i utgangspunktet — å bryte den ville revet ned det resultatet.

Parameteren beholdes som MÅLEINSTRUMENT (standard = terskelen, altså
bit-identisk spill), ikke som en knapp som skal skrus på.

BUD 9 ER INGEN GEST. Ytterpunktet −14,0 gjør det aritmetisk umulig å melde 9:
leddet `(1−p)·fv` blir 0,903 × (−14) = −12,6, mens gevinstleddet på sitt beste
bare kan bidra +1,75. Å fjerne bud 9 koster **−0,095**. Det vinner auksjonen
bare 9,7 % av gangene, men de gangene er det riktig kontrakt.

Kurven er asymmetrisk: nedover koster ~0,11, oppover ~0,02. Boten tåler å være
litt for OPTIMISTISK om forsvaret langt bedre enn å være for pessimistisk.

MEKANISMEN, som gjør retningen forståelig og ikke bare empirisk: med
`vant[9] = 0,097` mot `vant[10] = 0,940` veier leddet `(1−p)·forsvarsverdi`
langt tyngre for bud 9 enn for bud 10. En lavere forsvarsverdi straffer derfor
bud 9 hardt og bud 10 nesten ikke — den skyver boten fra å avgi et bud som
stort sett bare er en gest, til å faktisk kjempe om kontrakten.

## 29. HULLET: trosnettet kan ikke betale seg i dag — Adams trekker ikke verdener

Trosnettet ble målt til **+4,86 prosentpoeng bedre verdenskvalitet** og sto i
køen som «en målt gevinst som aldri er omsatt i poeng». Det var feil
klassifisering, og revisjonen 5. august fant hvorfor.

`trekkVerdenBelief` kalles fra nøyaktig tre steder:

    src/bot/bot.ts        PIMC-boten        — IKKE i Adams
    src/moe2/sdkort.ts    SD-agenten        — IKKE i Adams
    src/e1/orakel.ts      E1-ORAKELET       — lager treningsetikettene

Adams-v3 er `vr:vrakrang.bin:telrd : budm:… : vakt:abmp : e1:d7alle.bin`, og
**både vrakrangereren og e1-nettet er rene fremovernett**. De trekker ikke en
eneste verden under spill. En bedre verdenstrekker kan derfor ikke flytte
Adams' poeng med en desimal i dag.

DET GJØR IKKE TROSNETTET VERDILØST — det flytter det fra «billig poeng» til
«treningsinvestering». Bedre verdener gir bedre orakeletiketter, som gir et
bedre e1-nett etter retrening. Gevinsten er ekte, men den er nedstrøms for en
treningskjøring og kan ikke høstes før.

LÆRDOMMEN, og den generaliserer: **et måltall på en komponent er verdiløst
hvis komponenten ikke ligger i stien den utrullede boten faktisk går.** +4,86
pp var et ekte tall på en ekte forbedring av en samler Adams aldri kaller.
Samme feilklasse som holdout-tallene som løy (D0: hold-anger 0,767 mot B273s
0,851, og null på poeng).

SJEKKEN SOM BURDE VÆRT GJORT FØRST, og som nå er billig å gjenta for enhver
kandidat: `grep` etter kallstedet og se om det ligger i Adams-stakken.

### Hva det betyr for køen

De BILLIGE poengene er i praksis uttømt. Konstantauditen ga +0,127 av fem
undersøkte konstanter, og de fire andre viste seg å være riktige. Det som står
igjen krever trening:

  1. Trosnettet inn i ORAKELETS sampler       (billig kode, betaler via 2–3)
  2. Korpus på v10-bredde med bedre etiketter (lang kjøring)
  3. Tren e1 på v9/v10 — sansene og hukommelsen som er bygd og testet,
     men som nettet aldri har sett  (lang kjøring)

Punkt 1 er en forutsetning for at 2 og 3 skal være verdt å kjøre, og bør gjøres
FØR korpuset genereres — ellers genereres 500k+ rader med etiketter fra den
gamle samleren, og hele kjøringen må gjøres om.

## 30. DØDREVISJONEN (5. august) — fem funn, to av dem store

Arvind: «finn andre døde/råttne ting i stakken!»

Verktøyet er `examples/dod-inngang.ts`, som måler to UAVHENGIGE ting per
inngang: VARIANS over ekte stillinger (bærer den informasjon i det hele tatt?)
og L1-VEKT inn i førstelaget (bruker nettet den?). De svarer på ulike
spørsmål, og kombinasjonen «høy varians, null vekt» er det dyreste utfallet.

### FUNN 1 (STØRST): den utrullede boten ser 273 av 714 trekk

`d7alle.bin` — nettet i Adams-v3 — har **inn = 273**. Det er v1-kjernen alene.

    v2-v4      91 trekk      USYNLIG
    plan       12            USYNLIG
    tro        52            USYNLIG
    verdi      30            USYNLIG
    døde       12            USYNLIG
    sanser     88            USYNLIG   (v9, bygd og testet)
    hvem la   156            USYNLIG   (v10, bygd og testet)

**441 trekk, 62 % av v10-vektoren, når aldri fram til boten som spiller.**
Sansene og hukommelsen er bygd, permutasjonstestet og lekkasjesikret — og den
utrullede boten er blind for hver eneste av dem.

Det er ikke en forglemmelse: de brede nettene ble trent og TAPTE mot det
destillerte 273-nettet. Men det gjør spørsmålet skarpere, ikke mindre viktig.

### FUNN 2: nettene BRUKER sansene når de får se dem

Hypotesen har vært at nettet «ikke vet hva det skal gjøre med» de nye blokkene.
Vektmålingen sier at det er feil for de fleste nettene:

| nett | kjerne \|w\| | ekstrablokker \|w\| |
|---|---|---|
| A470 | 26,9 | 18,8 – **41,8** |
| D3 | 45,9 | 18,9 – **45,8** |
| B273 | 29,9 | ~11,8 |
| RB | 45,8 | **1,6 – 7,9** |

I A470 og D3 får PLAN-blokken mer vekt enn kjernen. Blokkene blir altså brukt.
RB er det eneste nettet som kollapset tilbake på kjernen (18x mindre vekt), og
det er RB som er avviket, ikke regelen.

KONSEKVENS: at de brede nettene taper handler ikke om at trekkene ignoreres.
Det må ligge i etikettene, i korpusets sammensetning, eller i at 470 innganger
med samme datamengde bare er dårligere statistikk. Det er en annen diagnose enn
den vi har jobbet ut fra, og den peker mot MER DATA / bedre etiketter, ikke mot
å skrote blokkene.

### FUNN 3: 49 døde innganger fordi etterlysningsregelen er deterministisk

Indeks 156–207 er det etterlyste kortet som one-hot over 52 kort. Regelen tar
ALLTID høyeste lovlige trumf — målt riktig med z = −13,25 — og da fyres bare
~3 av de 52 lukene noen gang. **49 innganger er konstant null.**

Ikke en bug, men bortkastet kapasitet: en one-hot over 52 der utfallsrommet
reelt er 3. Bør kodes om til noe rangrelativt (hvor høyt kortet er blant de
gjenværende trumfene) i stedet for hvilket kort det er.

### FUNN 4: tre flagg som aldri fyrer i selvspill

    224   «ingen trumf»    trumf velges alltid
    226   erAmerikaner     meldes aldri (og det er MÅLT riktig)
    237   erSolo           meldes aldri

Sammen med funn 3 er det 52 av 273 kjerneinnganger — 19 % — som er konstante.
(272, 339, 375 er tilsiktede konstantledd og teller ikke med.)

### FUNN 5 (VIKTIGST FOR MÅLET): benken er blind for kampstillingen

Indeks 231/232 er egen og andres poengandel. De er konstant null i revisjonen —
og jeg antok først at nettet dermed aldri hadde sett en kampstilling. **Det var
feil, og sjekken avslørte det:** `examples/sd-orakel.ts` spiller til `FERDIG`,
altså HELE KAMPER, så poengandelen varierer i korpuset.

Det er MÅLINGEN som er blind. `examples/gate2.ts` stopper ved `RUNDE_SLUTT` —
én runde fra 0–0–0–0. Poengandelen er dermed pinnet til null i hvert eneste
tall dette prosjektet har produsert.

KONSEKVENSEN ER PRESIS OG ALVORLIG: enhver strategi som avhenger av stillingen
— dristig spill når man ligger under, forsiktig når man leder, hele
Dubins–Savage-linja — er USYNLIG for benken. Den kan verken oppdages,
kalibreres eller adopteres. Og den ligger nøyaktig på målet «vi skal ikke kunne
tape et race til 100».

Dette er samme feilklasse som funn 1 og som trosnettet i §29: **måltallet og
den utrullede stien er ikke den samme tingen.** Tre ganger på én dag.

KUR: en kampnivå-benk som spiller til 100 og måler kampandel, ikke
rundedifferanse. Den står allerede i køen; den er nå oppgradert fra «fint å ha»
til FORUTSETNING for å kunne måle det målet faktisk er formulert som.

### FUNN 6-8: måleverktøyene målte en annen bot enn den som spiller

`lagIndre` — agentspek-parseren — fantes i SJU kopier. Driften var ikke
kosmetisk:

| verktøy | spekformer | kan parse `vr:` | budterskel |
|---|---|---|---|
| `gate2.ts` | 11 | ja | `@`-parameter |
| de seks andre | 3 | **nei** | **standard 2,5** |

De seks kunne altså ikke engang uttrykke Adams-v3, som krever `vr:`. Og de
bygget `Budagent` UTEN terskelargument, altså standard **2,5** der Adams
bruker **−3,0** — den samme konstanten som ga **+0,392** da den ble flyttet.

To av dem hadde speken HARDKODET til `ftf1.bin`, et helt annet nett.

**Hver atferdsanalyse prosjektet har kjørt — føreratferd, makkeratferd,
kontraktskift, verdensrom, vraktrumf, budtabell — målte en bot uten
vrakrangereren og med den gamle budterskelen.** Noen av de tallene står sitert
i kodekommentarer som begrunnelse for designvalg.

FUNN 7: `tsconfig.json` har `"exclude": [..., "test", "examples"]`. Gate 2 —
harnisket hver eneste måling hviler på — har ALDRI vært typesjekket. Første
kjøring med `tsconfig.kontroll.json` ga 128 feil. Blant dem en ekte type-løgn:
`sik:`-grenen castet rollen til `Rolle`, som ikke inneholder `"alle"`, så
`rolle === "alle"` var statisk alltid usann.

FUNN 8: `Number(process.argv[n] ?? X)` uten validering. Sender du en spek der
et frø ventes, blir frøet `NaN` — og alle giverne blir IDENTISKE. Målingen ser
ferdig ut og er ren søppel. Det skjedde under selve migreringen.

### Kuren, og den er strukturell

  `src/moe2/agentspek.ts`            ÉN parser, pluss `ADAMS` (den utrullede
                                     stakken, ett sted) og `tall()` (fail-fast)
  `test/agentspek-en-parser.test.ts` håndhever at ingen fil lager sin egen
                                     kopi, at ADAMS har alle fire lagene OG en
                                     eksplisitt terskel, og at `tall()` kaster
  `tsconfig.kontroll.json`           typesjekker examples + test

Samme mønster som `test/e1-bredder.test.ts`: gjør driften umulig i stillhet i
stedet for å rette den én gang til. 128 → 79 typefeil; alle som gjensto i de
migrerte filene var ubrukte importer.

`tall()`-testen fant med én gang et hull i sin egen vakt: `Number("")` er 0 og
fullt endelig, så et tomt argument skled gjennom som et gyldig frø.

## 31. Flaggrevisjonen — hvilke bokstaver bærer noe (5. august)

Utelat-én på hver bokstav i `telrd` og `abmp`, mot den ekte Adams-stakken.
Makker- og forsvarsradene står på 0,0000 der laget bare endrer budvinnerens
valg — en egenkontroll på at hvert lag gjør nøyaktig det det skal.

| bokstav | betydning | å FJERNE koster | tegntest | avgjorte |
|---|---|---|---|---|
| r | renonse | **−0,097** | z = −3,31 | 5,0 % |
| e | ikke ess | **−0,091** | z = −3,48 | 2,1 % |
| t | ikke trumf | −0,035 | z = −2,01 | 1,9 % |
| d | dobbel renonse | −0,013 | z = −1,51 | 0,3 % |
| **l** | laveste | **støy** | se under | 0,4 % |
| b | garanti-billigst | −0,121 | **z = +1,96** | 9,4 % |
| m | makker-trumf-tilbake | **−0,034** | z = −3,11 | 7,4 % |
| a | åpning | +0,014 | z = +0,77 | 0,9 % |
| p | makker-trumfer-først | −0,002 | z = −1,39 | **0,1 %** |

`l` ER DØD, og det er replikasjonsregelen som avgjorde det: første frøbånd ga
+0,020 (z = +0,93), det disjunkte båndet ga −0,029 (z = −1,26). Fortegnet snur.
Hadde vi bare kjørt det første, ville vi «funnet» en gevinst.

`m` bærer verdien i vakten, og hele utslaget ligger i MAKKERSETET (−0,137) —
den er en makkerregel og oppfører seg som en.

`a` og `p` er inerte. `p` binder i 1 av 1 000 givere.

`b` ER DEN ENE EKTE KONFLIKTEN: snittet sier −0,121 (behold), tegntesten sier
+1,96 (fjern). Flere givere blir bedre uten den, men de sjeldne ±50-ene blir
dyrere. For et race til 100 er det snittet som teller, så den blir stående —
men den er IKKE avklart, og fortjener en egen måling med flere givere.

## 32. SANSENE VAR IKKE I TAKT — 95 % av blokken var død (5. august)

Arvind: «at alt funker og sanser er i takt … ingen rot».

Revisjonen kjørte `examples/dod-inngang.ts --bredde 714`, som måler VARIANS per
inngang uten å trenge et nett — altså om en blokk i det hele tatt bærer noe i
ekte stillinger. Svaret:

| blokk | trekk | døde | varians |
|---|---|---|---|
| tro 376–427 | 52 | 0 % | 9,6e-2 |
| verdi 428–457 | 30 | 0 % | 1,1e-1 |
| døde 458–469 | 12 | 0 % | 7,2e-2 |
| **sanser 470–557** | **88** | **95 %** | **8,5e-3** |
| hvem la 558–713 | 156 | 0 % | 1,0e-1 |

**84 av 88 sansetrekk var konstant null.** Stikksjansen (52), forventet
fargelengde (16) og renonssannsynligheten (16) — hele poenget med «gi nettet
øyne» — leverte ingenting. Bare de fire posisjonstrekkene levde.

### Årsaken er én standardverdi

    export function e1SpillTrekk(state, sete, dim, tro = null)

`tro` er VALGFRI. Og `fyllSanser` returnerer etter de fire posisjonstrekkene
når den er `null`:

    if (tro === null) return;

**OG INGEN KALLER SENDTE DEN INN.** Ikke `E1Agent`, ikke `Ensemble`, ikke
`sd-orakel`, ikke `e1-orakel`, ikke `mester-orakel`. Null av tolv kallsteder.

Blokken var korrekt implementert, permutasjonstestet, lekkasjesikret og
registrert i alle fem breddestedene som `test/e1-bredder.test.ts` håndhever.
Den var bare aldri KOBLET TIL.

Det er samme feilklasse som hele resten av revisjonen — trosnettet (§29), det
273-brede nettet, den stillingsblinde benken, de sju parserkopiene: **delen var
riktig, men lå ikke i stien.** Sjette gang på én dag.

DET FARLIGSTE VAR AT DEN VAR I FERD MED Å BLI USYNLIG PERMANENT: hadde vi
generert et v9-korpus og brukt timer på GPU, ville 88 av kolonnene vært nuller,
nettet ville lært ingenting av dem, og konklusjonen ville blitt «sansene virker
ikke» — nøyaktig den konklusjonen Arvind på forhånd advarte mot: «hvis det ikke
funker så er det noe feil med implementering/kompatibiliteten».

### Kuren

`e1SpillTrekkMedTro(state, sete, dim, trosnett)` bygger vektoren ÉN gang og
utnytter at de første `TRO_INN` (= 470) verdiene i en v9-vektor er nøyaktig
v8-vektoren, altså trosnettets egen inngang. Prefikset leses som troens
inngang, og sansene fylles på plass.

`test/e1-sanser-koblet.test.ts` fastholder BEGGE halvdelene:

  UTEN tro   høyst 4 trekk lever   (feilen, dokumentert så den ikke glemmes)
  MED tro    over 40 lever         (koblingen, håndhevet)
  og ikke ett eneste trekk UNDER blokken endrer seg

### Konsekvens for treningsplanen

v9 må IKKE brukes til korpusgenerering uten at trosnettet føres gjennom
orakelet. Det er nå mulig; før var det umulig uten å vite det.

## 33. ADAMS-V4 MOT V3 PÅ KAMPNIVÅ — og hva familietallene faktisk sier

### v4 vinner klart, og mer enn rundetallet lovet

24 000 parrede kamper til 100 poeng, `examples/kamp.ts`:

| | |
|---|---|
| v4s vinnerandel | **0,3083** |
| v3s vinnerandel (kontroll) | **0,2500** — nøyaktig som den skal |
| differanse | **+5,83 pp ± 0,21 (27,5 SE)** |
| tegntest | 1 765 opp / 560 ned (z = +25,0) |
| sluttmargin | **+4,49 poeng ± 0,22** |

Kontrollarmen traff 0,2500 på fire desimaler og det var 0 givavvik.

v4 er altså **23 % mer sannsynlig å vinne et race til 100** enn v3. Eneste
forskjell mellom dem er den rettede `vant[N]`-tabellen.

TO TING SOM IKKE STEMTE MED FORVENTNINGEN, og begge er verdt å notere:

  Jeg gjettet 27–28 % på forhånd. Det ble 30,8. Prediksjonen var for lav.

  18,1 runder x 0,127 poeng ≈ 2,3 poeng akkumulert, men målt sluttmargin er
  **+4,49** — omtrent det dobbelte. Årsaken er IKKE fastslått. To kandidater:
  enten undervurderer rundebenken fordi den måler én runde fra 0–0–0–0, eller
  så forsterker margin-mot-beste-motstander tallet fordi min gevinst også er
  de andres tap. Dette bør måles, ikke gjettes.

Uansett hvilken det er, peker begge samme vei: **rundedifferanse har
systematisk undervurdert hva forbedringene er verdt i et faktisk race.** Det
var hele begrunnelsen for §30 funn 5, og benken betalte seg umiddelbart.

### Familiens ekte kamper — svaret på «har mennesker sjanse?»

Fra Val Town-basen, `type='kamp'`. Grunnlinja er 25 %: ett menneske mot tre
bots. (Ingen navn her; repoet er offentlig.)

| motstander | kamper | mennesket vant | andel |
|---|---|---|---|
| PIMC/MAKS | 16 | 12 | **75 %** |
| NevroHjerne | 13 | 8 | **62 %** |
| Adams («Vaar») | 10 | 2 | 20 % |
| Adams-v1 | 6 | 1 | 17 % |
| Adams-v2 | 1 | 0 | — |
| Adams-v3 | 2 | 0 | — |

**Adams-linja samlet: 3 av 19 = 15,8 %.**

FRAMGANGEN ER DRAMATISK — fra at familien slo PIMC tre av fire ganger til at
de vinner under hver sjette mot Adams. Men vi er IKKE i mål:

  målet «kan ikke tape»   4,7 % menneskeseier
  målet «mirakel»         0,9 %
  MÅLT                    15,8 %, 95 %-intervall ca. 5,5 % – 37,5 %

Punktestimatet er rundt TRE GANGER for høyt, og intervallet er så bredt at vi
i praksis ikke vet hvor vi står. Mot v3 spesifikt: **to kamper**. Det er ingen
måling i det hele tatt.

### Konsekvens: rådet om å ikke rulle ut v4 er TATT TILBAKE

Jeg argumenterte mot å bruke en versjons-ID på +0,127 poeng/runde. Det var før
kampbenken. **+5,8 pp vinnerandel er en annen sak**, og viktigere: uten
familierunder mot v4 kan vi ikke måle om vi nærmer oss målet i det hele tatt.

48 fullførte kamper i HELE basen er dessuten tynt uansett hvor god botten blir.
Skal påstanden «mennesker har ikke sjanse» kunne tallfestes, må familien spille
mange flere kamper mot ÉN og samme versjon.

## 34. Policy-sveipen: alle avslåtte brytere målt inn igjen

Konvensjonsvakten har 16 policyer; bare 4 (`abmp`) er på. Tolv var
implementert og avslått, hver prøvd en gang mot en ELDRE stakk. Sveip A måler
dem inn én og én mot dagens.

| bryter | poeng/runde | tegntest | fyrer i |
|---|---|---|---|
| `t` garanti-ikke-trumf | **0,0000 eksakt** | — | **aldri** |
| `N` garanti-nytte | +0,005 | z = +0,93 | 0,3 % |
| `A` makker-ess-først | +0,003 | z = +0,41 | 9,0 % |
| `C` fører-trumfkontroll | −0,023 | z = −1,79 | 9,1 % |
| `k` kast-billigst | −0,025 | z = −1,17 | 14,8 % |
| `n` kast-nytte | −0,025 | z = −1,22 | 14,8 % |
| `S` stopp-trumf-når-tom | **−0,064** | z = −3,07 | 2,3 % |

INGEN AV DEM HJELPER. Tre observasjoner er likevel verdt å ta med:

  `t` er BIT-IDENTISK med dagens. Den er fullstendig skygget av `b`, som
  allerede er på — to regler der den ene aldri kan komme til orde.

  `A` fyrer i 9,0 % av giverne og lander likevel på +0,003. Den gjør noe ofte,
  og det den gjør er verdiløst.

  `k` og `n` gir nesten identiske tall (−0,0249 mot −0,0251, samme 1 418
  avgjorte givere) selv om de er ulike regler. De ender trolig på samme kort i
  praksis, og da er den ene overflødig.

### Sveip B: dra-trumf-familien er monotont skadelig

| bryter | poeng/runde | tegntest | fyrer i |
|---|---|---|---|
| `l` åpning-alltid-lavest | +0,006 | z = −0,45 | 5,1 % |
| `h` åpning-høyest | −0,003 | z = −0,49 | 0,7 % |
| `k` vrak: ikke konge | −0,036 | z = −1,08 | 1,3 % |
| `D` ikke-dra-trumf, terskel 4 | −0,075 | z = −3,20 | 0,9 % |
| `d` terskel 3 | **−0,237** | z = −7,67 | 3,1 % |
| `e` terskel 3 + billigst | **−0,315** | z = −8,96 | 3,3 % |

Dose-responsen er ren: jo mer boten holdes tilbake fra å dra trumf, jo verre
går det. «Ikke dra trumf» er feil råd for denne boten, og terskelen styrer bare
hvor feil.

## 35. ADAMS-V4 — ferdig definert og verifisert

    vr:e1-modell/vrakrang.bin:telrd
      : budm:e1-modell/bud-vant.json@-3.0
      : vakt:abmp
      : e1:e1-modell/d7alle.bin

Ett sted i koden: `ADAMS` i `src/moe2/agentspek.ts`.

### Hver del, med sin målte verdi

| del | verdi | målt mot |
|---|---|---|
| vrakrangereren `telrd` | +0,123 | v2-stakken |
| budterskelen `@-3.0` | +0,392 | v2-stakken |
| samspillet vrak x bud | superadditivt, samlet **+0,598 ± 0,067** | v2 |
| **`bud-vant.json`** | **+0,127 ± 0,043** per runde | v3 |
| — samme, på KAMPNIVÅ | **+5,83 pp vinnerandel** | v3, 24 000 kamper |
| vakten `abmp` | `b` og `m` bærer; `a` og `p` inerte | v4 |
| Amerikaner i budløkka | 0 meldinger, og det er RIKTIG | v4 |
| sansekoblingen | ingen effekt på v4 (nettet er 273 bredt) | — |

### Policykartet — komplett, ingenting utestet

VRAK (`telrd`, 6 mulige bokstaver). Utelat-én:

    r  renonse            −0,097 aa fjerne   BAERER
    e  ikke ess           −0,091              BAERER
    t  ikke trumf         −0,035              baerer litt
    d  dobbel renonse     −0,013              marginal
    l  laveste            STOEY (fortegn snur mellom froebaand)   DOED
    k  ikke konge         −0,036 aa LEGGE TIL                     avslaatt, riktig

VAKT (`abmp`, 16 mulige bokstaver). Utelat-én for de paa, legg-til-en for de av:

    b  garanti-billigst   −0,121 aa fjerne (men tegntest +1,96)   UAVKLART
    m  makker-trumf-tilb. −0,034, alt i makkersetet               BAERER
    a  aapning            +0,014 aa fjerne, 0,9 % avgjorte        inert
    p  makker-trumfer-f.  −0,002, 0,1 % avgjorte                  inert
    t  garanti-ikke-trumf BIT-IDENTISK - fullstendig skygget av b
    N  garanti-nytte      +0,005, 0,3 %
    A  makker-ess-foerst  +0,003, men fyrer i 9,0 %
    C  foerer-trumfkontr. −0,023
    k  kast-billigst      −0,025
    n  kast-nytte         −0,025 (nesten identisk med k - overfloedig?)
    S  stopp-trumf-tom    −0,064
    l  aapning-lavest     +0,006
    h  aapning-hoeyest    −0,003
    D  ikke-dra, terskel 4 −0,075
    d  ikke-dra, terskel 3 −0,237
    e  ikke-dra + billigst −0,315

**Ingen av de 13 avslåtte bryterne hjelper.** De ble slått av av en grunn, og
grunnen holder fortsatt mot en sterkere stakk. `a`, `p` og vrakens `l` er
inerte og blir stående — å fjerne dem gir ingen målbar gevinst og innebærer en
atferdsendring uten dekning.

### Verifisert som helhet

    300 tester groenne
    tsc ren paa src
    nettleserbunten bygger (598,9 kb)
    gate2 kontrollarm noeyaktig 0,0000
    kampbenken +5,83 pp mot v3, kontrollarm noeyaktig 0,2500

### Det som IKKE er på plass, og det er ærlig sagt det største

**Nettet er 273 bredt.** 441 trekk — sansene, hukommelsen, troen, planen — når
ikke fram. Sansekoblingen fra §32 virker og er testet, men den kan ikke betale
seg før et v9/v10-nett er TRENT. Det er en treningskjøring, ikke en kodeendring,
og det er den eneste gjenstående linja med stort utslag.

v4 er altså alt som kan hentes uten å trene. Det som gjenstår krever GPU-tid.

## 36. V10-KJØRINGEN — vurderingen, planen og vaktene (5. august)

Arvind: «droppet vi selvlæring, ved å gjøre en virkelig vurdering?»

Berettiget spørsmål: jeg startet generering FØR vurderingen var gjort. Her er
den, med tall fra prosjektet og ikke fra magefølelsen.

### VI HAR IKKE DROPPET SELVLÆRING — DET ER SELVLÆRING VI DRIVER MED

«Skrallen» ER selvspill. Orakelet spiller med dagens bot som modell, merker
stillinger, nettet lærer, syklusen gjentas. Det er AlphaZero-mønsteret: policy
→ søk forbedrer den → destiller → gjenta. Forskjellen fra NEAT er at
forbedringsoperatoren er SØK, ikke ren utfallsbasert RL.

    foerergapet mot orakelet   ftf1 +1,656  ->  Adams-v2 +0,688     krympet 60 %
    ren utfallsbasert RL       NEAT, proevd, ga svake nett
    planens egen konklusjon    «ett-plys framoverblikk ER en fungerende
                               forbedringsoperator ... da er selvspill farbart»

Valget står altså ikke mellom korpus og selvlæring. Korpuset ER skrallens
neste omdreining.

### SPØRSMÅLET OM ROLLOUT-MOTPARTEN VAR ALLEREDE BESVART

Jeg var i ferd med å be Arvind velge om riktig motstandermodell var verdt 4,9x
i genereringstid. Det var unødvendig — §13.1 hadde svaret:

> Førersetet gikk fra **−0,357 til +0,896** bare av å bytte hvem orakelet
> forestiller seg spiller resten.

**+1,25 poeng.** Alt jeg hentet 5. august til sammen er +0,127. Å spare fire
timer der ville vært å kaste de neste ti. Både `--spiller` og `--motpart` er
derfor Adams-v4.

### MEN BEGRUNNELSEN ER IKKE «ENDA EN OMDREINING»

Skrallen konvergerer: neste omdreining er anslått **+0,06**. Det bærer ikke en
flertimers kjøring alene.

Det som gjør DENNE kjøringen annerledes er **sansene** — 441 trekk nettet
aldri har sett, og som fram til i dag var 95 % konstant null selv når de var
med. Dette er en KAPASITETSENDRING, ikke en iterasjon, og den må stå eller
falle på seg selv.

### Kjøringen

    --bredde 714        v10: alle blokker, inkludert sanser og hvem-la
    --tro tro.bin       ellers er 84 av 88 sansetrekk null
    --spiller  Adams-v4 stillingene kommer fra policyen som faktisk spiller
    --motpart  Adams-v4 etikettene regnes mot riktig motstandermodell (+1,25)
    --verdener 12       12 av 12 trukket i hver rad, verifisert
    --rollevekt 1       planens regel; 3 ga 52,8 % foererrader

### FØRFLYVNINGSSJEKKENE — kjørt FØR den lange kjøringen

| sjekk | resultat |
|---|---|
| sansene i EKTE korpusrader | **0,0 % døde** (var 95 %) |
| etikettspenn beste–verste | 2,23 i snitt; 13,4 % flate stillinger |
| dekning over stikk 0–10 | jevn, 38–57 per stikk |
| verdener trukket vs bestilt | 12 av 12 i hver eneste rad |

### VAKTENE — hver av dem fra en feil som FAKTISK har skjedd

    --bredde validert mot LOVLIGE_BREDDER, FOER foerste rad
        (bredden var hardkodet; skrev 340 mens trekk.ts var 356 - timevis tapt)
    --tro paakrevd fra v9 og opp, FOER foerste rad
        (ellers 84 doede kolonner i hele korpuset, oppdaget foerst etter GPU-tid)
    E1Agent kaster hvis v9+ uten trosnett
        (samme feil, andre enden av roeret)
    test/e1-bredder.test.ts        fem steder enige, ogsaa over Python-grensa
    test/e1-sanser-koblet.test.ts  sansene fylles beviselig
    test/agentspek-en-parser.test.ts  ingen parserdrift
    sluttmeldingen rapporterer FAKTISK bredde
        (den sa 470 mens dataene var 714)

### Etter genereringen

  1. `head -1 skard-0.jsonl` og tell — planens egen regel, og den som fanget
     340-feilen i sin tid
  2. blokkvarians paa HELE korpuset, ikke bare en stikkproeve
  3. tren v10 mot d7alle som referanse, samme holdout
  4. gate2 mot Adams-v4
  5. KAMPBENKEN mot Adams-v4 — det er den som teller, siden rundebenken
     undervurderer med faktor 2,2

Punkt 5 er nytt siden i dag og er grunnen til at tallet vi ender med, blir til
å stole på.

## 37. LITTERATURSVEIP: hva feltet faktisk sier om søk i trekkspill (5. august)

Arvind: «er det vits med søk i det hele?» og «litt mer research om ML i kortspill».

### Det avgjørende måltallet vi manglet

`examples/sd-stoy.ts`: samme stilling vurdert to ganger med UAVHENGIGE
verdenstrekk. Er etiketten signal, skal de to være like.

| verdener | uenig om beste kort | spredning best–nest | støy | signal/støy |
|---|---|---|---|---|
| 4 | 90,0 % | 0,252 | 1,117 | 0,23 |
| **12** | **92,5 %** | 0,176 | 0,642 | **0,27** |
| 48 | 87,5 % | 0,108 | 0,326 | 0,33 |

**Ved dagens 12 verdener er etiketten mest støy.** Støyen er ~3,7x forskjellen
den skal måle, og faller som 1/√n — nøyaktig 2x fra 12 til 48, som ventet. For
signal/støy = 1 trengs ~165 verdener: 14x dagens kostnad.

Og spredningen best–nest KRYMPER med flere verdener (0,252 → 0,108): vinnerens
forbannelse i etikettene. Den ekte forskjellen mellom kortene er MINDRE enn vi
har trodd, og det forklarer hvorfor så mange målinger i dette prosjektet har
vært marginale.

### Hva litteraturen sier

  PIMC ER FORTSATT STATE-OF-THE-ART for trekkspill (Long, Sturtevant, Buro &
  Furtak, AAAI 2010). Tre egenskaper avgjoer: leaf correlation, bias,
  disambiguation. For Skat og Hearts maales leaf correlation 0,8-1,0 - noeyaktig
  regimet der PIMC gjoer det bra. Kritikken er teoretisk korrekt og biter lite her.

  ISMCTS ER IKKE EN OPPGRADERING. Furtak & Buro (2013): spilleren LEKKER privat
  informasjon til rollout-motstanderne, som far tilpasse seg pa tvers av
  rollouts. Trekkverdiene blir skjeve.

  GO-MCTS (arXiv 2404.13150, 2024) planlegger i OBSERVASJONSROMMET med en
  generativ transformer og unngaar bade strategifusjon og ikke-lokalitet. Ny
  SOTA i Hearts (+1,74 poeng mot xinxin). MEN i SKAT fortsatt 9,84 poeng UNDER
  Kermit, som er PIMC-basert. Skat er strukturelt naermest Amerikaneren.

  LAERT INFERENS (Solinas, Rebstock & Buro, arXiv 1903.09604): en laert modell
  for hvor kortene ligger gir REPRESENTATIVE verdener, og da trengs LANGT
  faerre av dem for samme kvalitet.

  LAERT EVALUERING (lorserker/BEN, PyData Berlin 2018): eksakt loesning er sa
  dyr at bridgeprogrammer ikke kommer over ~100 samples. Bytt den mot et raskt
  nett, og man har rad til mange flere. Konvolusjoner over kortlayouten var
  «very useful»; overtilpasning var hovedproblemet (dropout best).

  PARANOID SLAAR MAX^N i Hearts (Sturtevant). MEN Hearts har ingen makker.
  Amerikaneren har det, sa `min` over fortsettelser gjoer makkeren fiendtlig.
  Analogien baerer ikke hit - derfor er CFR-blandingen riktigere for oss.

### Konklusjonen: ikke skriv om. Fullfør det vi har.

De to litteraturlinjene angriper NØYAKTIG vårt støyproblem, fra hver sin ende:

    trosnett (inferens)   bedre verdener  -> FAERRE trengs
    verdinett (evaluering) billigere verden -> FLERE har vi raad til

Og regnestykket er entydig, ved identisk budsjett:

    i dag:          12 verdener x ~30 nettpass = 360 pass  ->  signal/stoey 0,27
    med verdinett: 360 verdener x   1 nettpass = 360 pass  ->  signal/stoey 1,48

**5,5x bedre signal til samme kostnad.** Det er en arkitekturendring, ikke en
optimalisering.

### Og §29 var feilklassifisert

Trosnettet ble avskrevet som «kan ikke betale seg foer et v9-nett er trent,
fordi Adams ikke trekker verdener i spill». Det er riktig for SPILL, men
irrelevant for ETIKETTENE: orakelet trekker verdener for hver eneste merkede
stilling. Bedre verdener der senker etikettstøyen direkte, uten noen retrening.

Det er den billigste av de to brikkene, og den er allerede trent.

### Rekkefølgen, med en port

  1. TROSNETTET inn i orakelets verdenstrekker      (har det, ikke koblet)
  2. VERDINETT: (verden, utfall) -> ett fremoverpass (mangler, maa trenes)
  3. PORT: kjoer `sd-stoy.ts` paa nytt. Gaar signal/stoey fra 0,27 mot ~1,5?
     Gjoer den ikke det, STOPP - ikke generer en million rader paa etiketter
     som ikke baerer.
  4. Fortsettelser + CFR-loeseren, som naa har raad til aa kjoere
  5. Det store korpuset
  6. Konvolusjoner over 4x13-rutenettet som egen akse paa treneren

Punkt 3 er porten. Den finnes fordi vi nå har et tall som kan si nei.

## 38. DD ER ALLEREDE AVVIST — og verdinettet arvet fellen (5. august)

Arvind: «hva er vitsen med en DD når vi ikke skal jukse.»

Svaret sto allerede i `src/moe2/sdkort.ts`, målt 25. juli:

| fasit | metode | korrigert korrelasjon mot poeng |
|---|---|---|
| bud | single dummy | **+0,925** godkjent |
| vrak | single dummy | +0,848 |
| trumf | single dummy | +0,831 |
| kortspill | single dummy | +0,718 |
| trumf | **double dummy** | +0,234 avvist |
| vrak | **double dummy** | +0,144 avvist |
| kortspill | **double dummy** | **−0,609 AVVIST, feil fortegn** |

DD på kortspill korrelerer NEGATIVT med faktiske poeng. Ikke svakere — motsatt.
Verifisert på nytt 5. august: etikett-stien rører ikke DD-løseren, og
rolloutene lar hvert sete spille med bare sin egen informasjon.

**OG DET AVSLØRTE EN FELLE I MITT EGET FORSLAG.** BENs verdinett er en
DD-prediktor. Hadde jeg kopiert den, ville jeg trent et nett til å forutsi
nøyaktig den fasiten som måler −0,609 her.

REGELEN: et verdinett må trenes på **SD-utfall** — hva som skjer når Adams
spiller verdenen ut — aldri på perfekt spill. Da er det en komprimering av vår
egen realistiske utspilling, ikke et fasitorakel.

## 39. STRATEGIEN MOT +1–2 POENG (5.–6. august)

Arvind ga 21 timer og et mål: +1–2 poeng.

### Hvorfor korpuset IKKE er førstevalget

Målt rate med alt på: 2,16 rader/s per kjerne, altså ~5 timer for 350k rader,
pluss trening og måling. Og utfallet er UKJENT — de brede nettene har
historisk tapt mot det destillerte 273-nettet.

Det er en dårlig bruk av 21 timer når det finnes noe med målt oppside.

### Det som HAR målt oppside: søk i selve spillet

Adams spiller i dag uten søk — rene fremovernett. §13.1: de ti søkeforsøkene
delte ÉN feilkobling, at rollout-policyen var feilspesifisert. Og `ork:`-benken
målte at med RIKTIG policy er orakelet **+0,896 i førersetet**.

Det tallet er i nøyaktig den størrelsesordenen målet krever. Og siden 5. august
har søket fått:

    riktig motstandermodell   (+1,25 i foerersetet, §13.1)
    trosvektede verdener      (+2,62 pp verdenskvalitet ved 32 kandidater)
    flere fortsettelser       (Brown & Sandholm)
    CFR-loesning ved beslutningspunktet

**Det krever null trening.** Alt er bygget og testet i dag.

### Rekkefølgen

  1. Mål søk per SETE mot Adams-v4 — hvilket sete betaler
  2. Tun det som betaler: verdener, fortsettelser, kombinasjonsmodus
  3. Bekreft på KAMPBENKEN, ikke bare rundebenken (den undervurderer 2,2x)
  4. Korpuset kjøres som langskudd i bakgrunnen hvis maskinen har plass

Punkt 3 er det som gjør at tallet er til å stole på.

## 40. SPILLETIDS-SØK: koblet, og tidsbudsjettet er porten (5.–6. august)

Adams spiller uten søk. `ork:`-benken målte +0,896 i førersetet med riktig
rollout-policy, og det tallet er i den størrelsesordenen målet krever — uten
en eneste treningstime.

### Søket var koblet svakere enn det vi har

`Rolleorakel` sendte ÉN motpart og ingen trosvekt til `besteKortSD`. Den målte
altså en dårligere versjon enn det som er bygget. Nå tar den trosnett (32
kandidater), fortsettelser og kombinasjonsmodus, og `ork:`-speken er utvidet:

    ork:<rolle>:<verdener>[@<trofil>][+<vaktflagg,vaktflagg>]:<indre>

Fortsettelsene bygges ved å bytte VAKTFLAGGET i den indre speken. Policysveipen
viste at `abmpd` (−0,237) og `abmpS` (−0,064) er merkbart forskjellige fra
`abmp` — altså plausible motstanderatferder, ikke bare svakere kopier.

### TIDSBUDSJETTET ER PORTEN, og det ble målt før noe annet

`examples/soketid.ts`, snitt over alle kortvalg (søket fyrer bare i førersetet,
altså ~1/4 av dem, så ekte kostnad per søk er ~4x snittet):

| oppsett | per kortvalg | per faktisk søk |
|---|---|---|
| uten søk | **0,5 ms** | — |
| `ork:foerer:24` | 329 ms | ~1,3 s |
| `+ tro + 3 fortsettelser` | **1 043 ms** | **~4,2 s** |

1,3 s er akseptabelt i en nettleser. 4,2 er det IKKE — familien spiller på
maskiner tregere enn denne, kanskje 2–5x, altså 10–20 sekunder per kort.

**Konsekvens:** tre fortsettelser koster 3,2x, så budsjettet må tas fra
verdenene. Den riktige sammenlikningen er **8 verdener x 3 fortsettelser** mot
**24 x 1** — likt budsjett, og litteraturen sier at fortsettelsesmangfold
fjerner skjevhet mens verdener bare demper varians.

Uten denne målingen ville vi målt en konfigurasjon som aldri kunne rulles ut.

## 41. NYTT MÅL: mennesket skal vinne 1 av 20 — og målestokken vi mangler

Arvind, 6. august: «et menneske skal bare kunne slå oss i et race til 100 poeng
1/20 ganger». Altså **5 %**.

    grunnlinje (fire like spillere)        25,0 %
    MÅLT mot Adams-linja (19 familiekamper) 15,8 %
    MÅL                                      5,0 %

Vi skal altså tredele menneskets sjanse fra der vi er.

### Problemet: vi kan ikke SE om vi nærmer oss

19 kamper gir et intervall fra 5,5 % til 37,5 %. Familien spiller ikke tusen
kamper på bestilling, og hver utrulling splitter dataene på nytt. Med den
målestokken kan vi ikke skille +0,1 fra +1,0.

### Løsningen: en MENNESKE-EKVIVALENT motstander

Finn en bot som vinner LIKE OFTE mot Adams som menneskene gjør — altså ~15,8 %
— og bruk den som stedfortreder. Da kan vi kjøre 24 000 kamper på en time i
stedet for å vente på familien.

Den måler ikke om boten slår MENNESKER. Den måler om boten har blitt sterkere
mot en motstander KALIBRERT til menneskelig styrke, og det er den eneste
størrelsen vi kan følge tett nok til å styre etter.

STIGEN som skal måles, hver i ett sete mot tre Adams-v4:

    nevro (NevroHjerne)   familien slaar den 62 % - altsaa for svak?
    mklon-512             menneskeklonen, trent paa 123 runder
    ftf1, sd-r2           eldre nett
    Adams-v3              vi VET denne: fikk 23,1 % mot v4

Menneskene ligger på 15,8 %, altså SVAKERE enn Adams-v3. Stedfortrederen skal
finnes mellom nevro og v3.

### Hvorfor dette endrer hva som er verdt å gjøre

Med en stedfortreder kan hver forbedring måles direkte i den valutaen målet er
formulert i: **hvor ofte taper vi et race**. Ikke poeng per runde, ikke
vinnerandel mot oss selv — den faktiske størrelsen.

### Og distillasjonen endrer søkets rolle fullstendig

Arvind: «ikke stress med at den bruker lang tid fordi vi distillerer det inn i
en mindre modell etterpå».

Da trenger søket ALDRI å rulles ut. Det er LÆREREN som lager etikettene, og det
destillerte nettet spiller fort. 4,2 sekunder per trekk er da en engangskostnad
i generering, ikke en byrde familien bærer.

Konsekvens: søket skal skrus HARDERE enn tidsbudsjettet i §40 tilsa. Grensen er
generatorens gjennomstrømning, ikke nettleserens tålmodighet.

## 42. SØK I FØRERSETET — replikert, og det sterkeste funnet i økta

Gate 2 mot Adams-v4, kontrollarm nøyaktig 0,0000 i begge bånd:

| frøbånd | snitt | tegntest | avgjorte |
|---|---|---|---|
| 316 000 000 | **+0,387 ± 0,141** (2,74 SE) | **z = +2,96** | 11,2 % |
| 947 000 000 (disjunkt) | **+0,239 ± 0,136** (1,75 SE) | **z = +3,27** | 12,0 % |

Snittet falt fra +0,39 til +0,24 da flere givere kom inn — regresjon mot midten,
som forventet av et oppdagelsestall. Men TEGNTESTEN BLE STERKERE, og den er den
pålitelige statistikken når bare 12 % av giverne avgjøres.

**Beste estimat ~+0,3 poeng per runde, replikert i to disjunkte bånd med z ≈ 3
i begge.** På kampskala (rundebenken undervurderer 2,2x) tilsvarer det ~+0,7.

Adams spiller i dag helt uten søk, så dette krever ingen treningstime.

FORSVARSSETET ga +0,110 (z = +1,69) med trimmet snitt +0,233 i forsvarsraden —
en BRED effekt over 23 % avgjorte givere, til forskjell fra førerens haledrevne.
De to har ulik natur og kan trolig legges sammen, men den kombinerte armen er
for dyr å måle direkte (søk i alle fire seter).

## 43. SANSENE: negativt på holdout — men holdout har løyet før

Korpus sd-v10: 306 040 rader, v10-bredde, trosvektede verdener over 32
kandidater, tre fortsettelser, CFR-kombinasjon, Adams-v4 som både stillingskilde
og rollout-motpart.

FØRSTE FORSØK PÅ KONTROLL VAR UGYLDIG. `--kjor "b273:...:512,384,256"` angir
SKJULTE lag, ikke inngangsbredde — begge nettene ble 714 brede og kom ut
bit-identiske. Jeg trente aldri et 273-nett.

Den ekte kontrollen bruker trenerens `nullsone`, som nullstiller kolonner i en
KOPI av dataen. Da er arkitektur og parametertall identiske, og bare
informasjonen skiller:

| nett | sanser | hold-anger | hold-treff |
|---|---|---|---|
| kjerne273 (273-713 nullstilt) | av | **0,9334** | 59,5 % |
| alt714 | på | 0,9618 | 59,3 % |

**Kjernen alene er bedre.** Det stemmer med hypotesen om at 441 flere innganger
på 292k treningsrader er dårligere statistikk.

MEN IKKE FORKAST DEM PÅ DETTE. Planen har den dokumenterte lærdommen: D0 hadde
hold-anger 0,767 mot B273s 0,851 og målte NULL på poeng. Holdout og poeng har
vært uenige før. Målingen på gate2 avgjør.

## 44. MÅLESTOKKEN ER KALIBRERT — og familien spiller på Adams-v3-nivå

Kampbenken, hver kandidat i ETT sete mot tre Adams-v4, 240 frø hver.
Kontrollarmen traff 0,2500 i alle fire.

| motstander | vinnerandel mot 3x Adams-v4 |
|---|---|
| NevroHjerne | **3,65 %** |
| sd-r2 | 6,77 % |
| ftf1 | 7,29 % |
| **Adams-v3** | **20,21 %** |
| *familien (19 ekte kamper)* | *15,8 %* |

**FAMILIEN SPILLER OMTRENT PÅ ADAMS-V3-NIVÅ**, litt svakere. Det henger sammen
med at de slår NevroHjerne 62 % av gangene mens NevroHjerne bare får 3,65 %
mot v4.

Adams-v3 er dermed en KONSERVATIV menneske-ekvivalent: litt sterkere enn
familien, altså et strengere krav enn virkeligheten stiller.

### Vekslingskursen mellom det vi måler og målet

v3 mot tre v3 er 25 % per definisjon. v3 mot tre v4 er 20,21 %. v4 er +0,127
poeng/runde bedre enn v3. Altså:

    +0,127 poeng/runde i feltet  ->  −4,79 prosentpoeng for en FAST motstander

Fra familiens 15,8 % til målet 5 % er −10,8 pp:

    −10,8 pp  ->  ~+0,29 poeng per runde

**Søket alene gir +0,3 replikert.** Til førsteordens rekker det.

FORBEHOLDET ER EKTE: kurven flater sannsynligvis ut jo nærmere null man kommer
— de siste prosentpoengene koster mer enn de første, fordi selv en perfekt bot
taper på kortfordelingen alene. Dette er et estimat, ikke et løfte.

Men det er FØRSTE GANG prosjektet har en vekslingskurs mellom rundepoeng og
den størrelsen målet faktisk er formulert i. Uten den kunne vi ikke vite om
+0,3 var mye eller lite.

### Den avgjørende målingen

Stedfortrederen (v3) mot tre Adams-v4 MED søk i førersetet. Faller den fra
20,21 % mot 5 %, er målet innen rekkevidde uten en eneste treningstime.

## 45. FØRERRADEN VAR USYNLIG — og søket er fire ganger sterkere enn rapportert

`examples/gate2.ts` skriver rollen som `foerer` (ASCII). `verktoy/gate2-les.py`
lette etter `fører` (med ø). De matchet aldri, så **en tredjedel av
rolledekomponeringen har vært stille utelatt fra hver eneste rapport** — i hele
denne økta, og trolig mye lenger. Ikke feilet. Bare borte.

Arvind spurte hvorfor sansene ikke gjelder for spillefører. Det gjorde de.

### Søket, sett i setet der det faktisk fyrer

| måling | i FØRERSETET | trimmet | tegntest |
|---|---|---|---|
| bånd 316M | **+1,546 ± 0,563** | **+1,702** | z = +2,96 |
| bånd 947M (disjunkt) | **+0,954 ± 0,545** | **+1,054** | z = +3,27 |
| forsvarssøk, bånd 316M | +0,220 (i forsvarsraden) | +0,233 | z = +1,69 |

De +0,24 til +0,39 jeg rapporterte hele natta var samme tall FORTYNNET over
fire seter. Boten er spillefører i én av fire runder.

OG DET TRIMMEDE SNITTET ER HØYERE ENN SNITTET i begge bånd. Effekten er BRED og
konsistent, ikke haledrevet — min tidligere tolkning var feil.

### Sansene per rolle

| rolle | kjerne | med sanser | bidrag |
|---|---|---|---|
| fører | −0,394 | −0,300 | **+0,094** |
| makker | +0,103 | +0,112 | +0,009 |
| forsvar | −0,575 | −0,467 | **+0,108** |

Både fører og forsvar henter nesten like mye. Makkeren knapt noe — og det gir
mening: begge de andre må resonnere om skjulte kort, mens makkeren kjenner seg
selv fra første stund.

## 46. STATUS MOT 1/20-MÅLET, ærlig

    grunnlinje (fire like)                       25,0 %
    familien mot Adams-linja (19 kamper)         15,8 %
    stedfortreder mot Adams-v4                   20,21 %
    stedfortreder mot Adams-v4 + førersøk        17,33 %
    MÅL                                           5,0 %

**Vi når ikke 5 % i denne omgangen.** Og vekslingskursen viste seg å flate
kraftig ut:

    +0,127 poeng  ->  −4,79 pp
    +0,3 poeng    ->  −2,88 pp      2,4x større forbedring, 40 % mindre effekt

### Hva som ER oppnådd, målt og replikert

  soek i foerersetet   +0,95 til +1,55 i setet, to disjunkte baand, z ~ 3
  sansene              +0,079 samlet paa POENG (holdout rangerte motsatt)
  dropout 0,1          −0,097 -> −0,065 mot d7alle, tegntest positiv
  v4 (vant-rettelsen)  +5,83 pp vinnerandel, 24 000 kamper

### Hva som blokkerer resten

  KORPUSET. 306k rader mot d7alles millioner. Alle nye nett ligger bak.
  KOSTNADEN. Soek i tre seter er ikke maalbart paa kampbenken i praksis -
    en kamp tar over tre minutter, og benken skriver foerst etter fem.
  KURVEN. De siste prosentpoengene koster langt mer enn de foerste, fordi
    selv en perfekt bot taper paa kortfordelingen alene.

### Neste bot

    Adams-v5 = v4 + soek i foerersetet

Det er den eneste replikerte gevinsten som ikke krever mer trening, og med
destillasjon planlagt trenger søket aldri å rulles ut — det kan være læreren.

## 47. BILLIGSTE MENNESKE-SPESIFIKKE FUNN: vant[N] var løst for feil bord

Arvind: «du finner billigere løsninger og får det til å funke. det skal funke
mot ekte mennesker.»

`vant[N]` er ikke en tuningparameter. Den er et FAKTUM om omgivelsene: hvor ofte
bud N vinner budrunden. Og den ble regnet ut med damped fikspunkt-iterasjon over
SELVSPILL — altså likevekten der fire Adams byr mot hverandre.

**Boten spiller aldri det bordet.** Den sitter med ett menneske og to bots.

### Målt mot Adams-linja i ekte familiekamper

| menneskets bud | ganger | vant | SANT | `bud-vant` (v4) | `bud-gbt` (v3) |
|---|---|---|---|---|---|
| 8 | 13 | 0 | 0 % | 0,1 % | 10,9 % |
| **9** | **34** | **12** | **35,3 %** | **9,7 %** | 66,2 % |
| 10 | 57 | 57 | 100 % | 94,0 % | 97,7 % |

Sannheten ligger MELLOM de to tabellene. `bud-vant` er 3,6x for lav på bud 9;
`bud-gbt` er nesten dobbelt for høy.

FØRSTE UTKAST AV DETTE FUNNET VAR OVERDREVET. Jeg regnet først på ALLE
botversjoner og fikk 75,1 % for bud 9 — men det snittet er dominert av
PIMC og NevroHjerne, som lar auksjonen ligge lavt. Adams-v3 har allerede løftet
den: 79 % av rundene mot v3 vinnes med bud 10, mot 9 % mot PIMC. Tallet som
gjelder er 35,3 %, ikke 75,1 %.

### `e1-modell/bud-menneske.json`

Krympet mot selvspilltabellen med K = 8, siden 34 observasjoner er ekte men
tynt: vant[9] = 0,304 i stedet for 0,097.

Atferden endres målbart – 32 tibud mot v4s 27 på 300 giv, altså 19 % flere –
uten å bli like løs som v3s 46.

### DEN SOM IKKE KAN MÅLES PÅ VÅRE BENKER, OG HVORFOR DET ER GREIT

gate2 og kampbenken spiller Adams mot Adams. Der ER selvspilltabellen riktig,
så benkene ville rangert `bud-menneske` som DÅRLIGERE — og de ville hatt rett,
om bordet var fire bots.

Det er ikke en måling som mangler; det er to ulike omgivelser:

    bud-vant.json      riktig naar bordet er fire Adams   -> BENKENE
    bud-menneske.json  riktig naar bordet er 1 menneske   -> APPEN

Planen har prinsippet fra før: «mot en fast motstanderpopulasjon er det
maksimale et BESTE SVAR, ikke en likevekt». Dette er den billigste mulige
anvendelsen av det — en tabell, ingen trening, målt på ekte runder.

FORBEHOLD SOM STÅR: n = 34 for bud 9. Krympingen tar høyde for det, og hver
framtidige familierunde forbedrer estimatet automatisk.

### RETTELSE: «boten byr aldri 9» var et måleartefakt

Jeg målte budfordelingen med boten i SETE 0 alene og fikk `{10, 11, PASS}` —
ingen niere — og konkluderte med at `vant[9]` styrer et bud boten ikke bruker.
Det var feil. Auksjonen går i tur, og sete 0 møter et helt annet sett lovlige
bud enn de tre andre.

Målt over ALLE fire seter, 400 giv, med fast miljø (Adams-v4):

| tabell | 7 | 8 | **9** | **10** | 11 | pass |
|---|---|---|---|---|---|---|
| `bud-vant` (v4) | 11 | 27 | **245** | **377** | 26 | 1200 |
| `bud-menneske` | 37 | 0 | **301** | **322** | 26 | 1238 |
| `bud-gbt` (v3) | 0 | 62 | **355** | **243** | 26 | 1299 |

Boten byr 9 hyppig, og tabellen endrer fordelingen materielt: 245 → 301 nier
med den målte tabellen, altså **23 % flere**, og tilsvarende færre tibud.

MEKANISMEN. Terskelen for å by er nesten lik for alle bud (P > 0,41 til 0,43),
så en hånd som kvalifiserer til 10 kvalifiserer også til 9. Valget mellom dem
styres av `vant`-forholdet alene. Med `vant[9] = 0,097` blir bud 9 strukturelt
uattraktivt, og boten hopper til 10 — en hardere kontrakt for to poeng mer.

Arvind: «det er helt normalt å by 9, 10, av og til 11 og 8». Det stemmer med
hva boten faktisk gjør; det var målingen min som var for smal.

LÆRDOM: jeg vinglet tre ganger på dette funnet — først overdrevet, så
nedgradert på et artefakt, så bekreftet. Nedgraderingen kom av å måle ETT SETE
og generalisere. En budfordeling må måles over alle seter, fordi turrekkefølgen
bestemmer hvilke bud som i det hele tatt er lovlige.

## 48. RESULTATET: søk i førersetet, målt i målets egen valuta

Stedfortrederen (Adams-v3, kalibrert til familiens nivå) i ett sete mot tre
Adams. Kontrollarm nøyaktig 0,2500 i alle kjøringer.

| miljø | stedfortrederens vinnerandel |
|---|---|
| Adams-v4 | 20,21 % |
| + søk, 12 verdener | 17,33 % |
| **+ søk, 24 verdener** | **15,83 %** |
| *mål* | *5,0 %* |

180 frø, tegntest z = −6,41, sluttmargin −12,44 (8,30 SE).

**Søket henter −4,38 prosentpoeng.** Vi trengte −15,2. Vi kom 29 % av veien.

### Skaleringen er den viktigste observasjonen

    12 verdener  ->  17,33 %
    24 verdener  ->  15,83 %      −1,50 pp for en dobling

Kurven flater, men den er ikke flat. Og siden Arvind planlegger DESTILLASJON,
koster flere verdener ingenting i utrulling — søket er LÆREREN, og det
destillerte nettet spiller fort.

48-verdeners måling ble startet, men kampbenken skriver først en rad når fem
hele kamper er spilt per frø, og med 48 verdener tar det timer. Den er ikke
avsluttet.

### DEN PRAKTISKE GRENSEN VI TRAFF, TO GANGER

Søk i TRE av fire seter (fører + forsvar) er ikke målbart på kampbenken slik
den er bygget: én kamp tar mange minutter, og benken skriver først etter fem.
To forsøk måtte brytes.

Det er ikke en styrkegrense, det er en MÅLEGRENSE. Kampbenken burde skrive
inkrementelt per kamp i stedet for per frø. Det er den enkleste endringen som
ville åpnet hele forsvarssøket for måling.

### Adams-v5

    v5 = v4 + soek i foerersetet (24 verdener)

Den eneste replikerte gevinsten som ikke krever mer trening, og den flytter en
menneske-ekvivalent motstander fra 20,21 % til 15,83 %.

## 49. SØK INNE I SØK — bugen som kostet natta, og det endelige tallet

### Bugen

`Rolleorakel`, `Sikkerorakel`, `Vrakvelger` og `Vrakvelger2` fikk alle sitt eget
INDRE lag som rollout-motpart (`inn as unknown as ...`). Nestes to søk, er det
indre laget selv et søk — så hver rollout i det ytre startet et nytt søk i det
indre. Eksponentielt.

TRE MÅLINGER AV SØK I FLERE SETER MÅTTE BRYTES, og jeg konkluderte hver gang
med at det var en KOSTNADSGRENSE i spillet. Det var en bug i speken.

    ork:foerer:24 alene                   329 ms per trekk
    ork:foerer:12 + ork:forsvar:12 (før)  umålbart
    ork:foerer:12 + ork:forsvar:12 (nå)   211 ms per trekk

Den kombinerte ble BILLIGERE enn den enkle. `utenSøk()` strimler nå ethvert
antall søkelag før motparten bygges, og `test/ingen-nestet-soek.test.ts` dekker
vilkårlig nesting.

### Det endelige tallet, 4 800 givere

| arm | samlet | fører | forsvar |
|---|---|---|---|
| **fører alene** | **+0,542** (5,14 SE) | **+2,170** (z = +5,52) | — |
| fører + forsvar | +0,529 (3,99 SE) | +2,170 | **−0,027** (z = −0,55) |

**FORSVARSSØKET ER NULL.** Å legge det til gjør den kombinerte armen marginalt
dårligere. Førersøket alene er den beste konfigurasjonen.

**FØRERSØKET: +2,170 poeng per runde i sitt sete**, z = +5,52, over FIRE
uavhengige frøbånd. Prosjektets sterkeste måling med god margin — `vant`-
rettelsen som ga v4 hele +5,83 pp målte +0,127.

### DELRESULTATER LØY FIRE GANGER I NATT

  soek skalerer ikke med verdener   (leste 1 994 av 3 840 rader) -> feil
  forsvarssoek +0,255                (leste 960 av 4 800)        -> feil
  forsvarssoek +0,125                (leste 4 422 av 4 800)      -> feil
  begge over: ferdig tall            −0,027, z = −0,55

Første gang var forsvarlig. Fjerde gang var det ikke. **Regel: les aldri en
gate2-fil før kjøringen er ferdig, uansett hvor fristende tallet ser ut.**

### Adams-v5

    v5 = v4 + ork:foerer:24

Replikert i fire bånd, +0,542 poeng/runde samlet, og den flytter en
menneske-ekvivalent motstander fra 20,21 % til 15,83 % på kampbenken.
