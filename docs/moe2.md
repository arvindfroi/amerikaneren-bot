# MoE2 – ny NEAT-arkitektur bygget på det vi målte

Alt her er begrunnet i målinger fra 2026-07-25. Ingen designvalg står uten et
tall bak seg. Det eneste som arves fra den gamle koden er **spillereglene**
(`src/motor.ts`, `src/regler.ts`, `src/kort.ts`) og orakelet (`src/solver/`,
`src/e1/`). Alt annet bygges på nytt.

## De syv feilene arkitekturen må gjøre umulige

| # | Målt problem | Tall | Hva MoE2 gjør |
|---|---|---|---|
| 1 | Poeng kan ikke rangere genom | parret SE 3,05 mot typisk forskjell 1,37 → 67 % riktig rangering. Splittkorrelasjon −0,08 selv med 800 runder/genom | Poeng er **aldri** fitness. Bare benk. |
| 2 | Relativ fitness inflaterer | Elo-snittet steg 1520→4119 på 1500 gen med uendret spredning; +1,98/gen ren aritmetikk | Ingen populasjonsintern rangering. Alt måles mot frosne referanser. |
| 3 | Agenten unnviker rollen sin | spillefører i 6 % → 2 % → 0,3 % av rundene | Hver ekspert måles **bare** på beslutninger den eier, med rollen påtvunget. |
| 4 | Genene forklarer ingenting | R² holdout 0,018; agenteffekt 0,1 % av angervarians, stilling 68 % | Ingen per-gen-redigering. Ingen ablasjonsbasert arv. |
| 5 | Beslutningen er aggregert | 1 skalar (margin) slår 400 ablasjonsprediktorer med faktor 31 | Eksperten vurderes på utfall, ikke på indre struktur. |
| 6 | Trening ødela kortspillet | trente genom anger 1,07–1,15 mot tilfeldig 1,035; ferskt utrent 1,040 | Hver ekspert har **gulv- og takreferanse** målt på samme utvalg. Faller den under gulvet, stoppes den. |
| 7 | Ett genom, mange hoder → indre bytteforhold | budhodet kunne senke anger ved å spille dårligere | Én populasjon, ett nett, egne vekter **per ekspert**. Ingen delte hoder. |

## Portvakten er ikke lært

Amerikaneren har eksplisitte faser. Hvilken ekspert som skal svare er gitt av
`state.fase` og av rollen (budvinner / makker / forsvarer), som begge er
observerbare. En lært gating ville brukt kapasitet på å gjenoppdage noe
reglene allerede sier, og lagt til en feilkilde vi ikke kan måle separat.

Rutingen er derfor **deterministisk**. Det lærte ligger i ekspertene.

Unntaket er ett sted der rollen ikke er kjent: forsvareren vet ikke hvem
makkeren er før avsløringen. Det håndteres av at forsvarseksperten får
`makkerAvslørt` som sensor – ikke av en gating.

## Ekspertene

Hver ekspert er en **egen NEAT-populasjon** med egen innovasjonsbok, egne
sensorer, eget utgangslag og eget mål. De deler ingenting.

| Ekspert | Fase | Utgang | Fasit (deterministisk) |
|---|---|---|---|
| `bud` | BUDRUNDE | forventet lagstikk (1 skalar) | SD-orakel: hva hånden faktisk henter hjem, målt over alle fire seter |
| `vrak` | VRAK | behold-score per kort (52) | DD-verdi av hånden etter vrak |
| `trumf` | VELG | score per farge (4) + etterlyst valør | DD-verdi av kontrakten under hvert trumfvalg |
| `spill-fører` | SPILL, budvinner | score per kort (52) | DD-orakel: `max(v) − v(valgt)` |
| `spill-forsvar` | SPILL, forsvarer | score per kort (52) | samme, men bare i forsvarsstillinger |
| `spill-makker` | SPILL, makker | score per kort (52) | samme, i makkerstillinger |

At spilleksperten deles i tre er ikke kosmetikk: poengtap-dekomponeringen
viste at spillefører taper 16–32 poeng per runde mens forsvar taper 2,2–2,6,
og forsvarsprofilen viste at feilene er kvalitativt ulike (trumfe inn når
renons: 23 % mot nevros 68 %; ta stikket når budlaget leder: 69 % mot 85 %).
Ett felles korthode må veie disse mot hverandre gjennom delte vekter. Det er
nøyaktig mekanismen som gjorde `lærForsvar` verre enn ingenting: å sette et
mål for hvert lovlige kort dyttet n−1 ned per beslutning, og det delte
52-korts hodet flatet ut.

## Målekontrakten

Dette er den delen som har sviktet flest ganger i dag, så den er en
**invariant i koden**, ikke en vane.

Hver ekspert leverer `Maaling { verdi, gulv, tak, n, holdout }` der:

- `gulv` = tilfeldig lovlig valg, målt **på nøyaktig samme stillinger**
- `tak` = NevroHjerne, målt **på nøyaktig samme stillinger**
- `holdout` = stillingene har aldri vært brukt til seleksjon

Grunnen: benken er ikke homogen. NevroHjerne måler 0,9431 på de første 2000
stillingene, 0,8848 på annenhver og 0,8179 på 21 000. Tre ganger i dag ble en
konklusjon feil fordi et referansetall ble lånt fra et annet utvalg. En
`Maaling` uten gulv og tak fra samme utvalg skal ikke kunne konstrueres.

## Godkjenningsporten

En ekspert får **ikke** tas i bruk før dens fasit er vist å henge sammen med
det vi faktisk vil ha. Testen er:

1. Skaff kandidater med **kjent stor** forskjell i den egenskapen vi bryr oss om.
2. Mål referansens egen pålitelighet (splitt-halv over uavhengige sett).
3. Er påliteligheten < 0,3, er testen ugyldig – ikke negativ. Skaff mer data.
4. Først når referansen er pålitelig, tolkes korrelasjonen.

Dette står her fordi jeg byttet D8 fra poeng til anger uten å gjøre det, og
fordi den første korrelasjonsmålingen trykket «henger sammen» på et `NaN`.
Porten er implementert i `src/moe2/port.ts` og kalles av treningsløkka.

## Motoren: læring først, topologi etterpå

Målt: seleksjon på støyete fitness ga −4,4 til −24,6 poeng over 525–1525
generasjoner. Fasit-læring ga d5-gull 1,0691 → 1,0374 på 7 700 korreksjoner.
Læringen virker svakt, seleksjonen virker ikke i det hele tatt.

MoE2 snur derfor rekkefølgen:

1. **Læring** (lamarckisk kalibrering mot fasit) er hovedmotoren og kjører
   hver generasjon på hele populasjonen.
2. **Topologi-evolusjon** (nye noder og koblinger) er det NEAT bidrar med, og
   vurderes på holdout etter at læringen har konvergert – ikke før.
3. **Vektmutasjon** er av som standard. Den var hovedkilden til driften.

Det bevarer NEATs styrke (den finner strukturen selv) og fjerner den delen
som målingene sier skader.

---

## RETTELSE 2026-07-25, etter E1-målingen

Designet over lot hver ekspert selektere på **orakelenighet** (anger). Det er
nå målt til å være feil, og rettelsen er den viktigste enkeltendringen i
dokumentet.

### Målingen

| | anger på e1-frys holdout (n=21 044) | poeng mot grådig, 600 givere |
|---|---|---|
| gulv (tilfeldig kort) | 0,9321 | – |
| NevroHjerne | 0,8167 | **+75,37 ± 0,06** |
| E1-r1 | 0,5436 | +72,19 ± 0,08 |
| **E1-r2** | **0,4768** | +72,46 ± 0,07 |

E1-r2 er 0,34 anger **bedre** enn NevroHjerne – 2,4 ganger hele gulv-til-tak-
spennet – og taper likevel **2,91 ± 0,06 poeng** per kamp, tegntest 9 av 599.
Det er ikke støy. De to målestokkene rangerer paret **motsatt**.

Bekreftet uavhengig med `neat-anger.ts`: anger 0,4780 mot 0,8348, optimalt
valg 61,4 % mot 58,7 %.

### Hvorfor

Fordelen til E1 ligger i stikk 5–9, der dobbelt-dummy-solveren løser eksakt.
I stikk 1–4 er E1 **dårligere** enn nevro. NevroHjerne ligger til og med under
det tilfeldige gulvet i stikk 4, 6 og 7 uten at det hindrer den i å lede med
tre poeng.

Benken måler altså sluttspill. Kampen avgjøres tidlig. Orakelet er skarpt der
det betyr minst.

### Hva som endres

1. **Ingen ekspert promoteres på orakelenighet alene.** Anger er
   gradientsignal for læringen – den er billig, deterministisk og virker som
   retning – men forfremmelse krever poengbenken.
2. **Innen én arkitektur ser anger ut til å holde**: r2 slo r1 på begge
   målestokkene (12 % bedre anger ga +0,27 poeng, p<0,001). På tvers av
   arkitekturer holder den ikke. Fasiten er derfor merket som
   *relativ innen familie*, ikke absolutt.
3. **Godkjenningsporten skal kjøres per ekspert med kandidater fra ULIKE
   familier.** Kjøres den bare innen én, godkjenner den en fasit som ikke
   generaliserer – som her.
4. **Per-stikk-vekting må måles, ikke antas.** Om tidlige stikk avgjør
   kampen, skal fasiten vektes deretter, og vekten skal komme fra en måling
   av hvilke stikk som faktisk korrelerer med poeng.

Dette er nøyaktig det godkjenningsporten i `src/moe2/port.ts` ble skrevet
for å fange. Den ble bare ikke kjørt før arkitekturen ble skrevet. Porten
virket; jeg brukte den for sent.

### Andre bekreftelse, uavhengig av den første: budfasiten

Ekspertbyggingen målte NevroHjerne mot SD-orakelets bud og fant at **taket
ligger under gulvet**:

| | avvik fra SD-orakelets bud (stikk) |
|---|---|
| uniformt lovlig bud (gulv) | 2,2229 |
| NevroHjerne (tak) | 2,6090 |

Nevro er altså dårligere enn tilfeldig til å treffe SD-orakelets bud — og
nevro er den som vinner på poeng, med +75,37 mot alt vi har bygget.

Retningen stemmer med egne målinger tidligere samme dag: SD byr 8,78 i snitt,
nevros budnett 5,66. Nevro underbyr systematisk med over tre stikk, henter
hjem 8,92, og innfrir 97 % av kontraktene sine.

**Det er samme mønster som i E1-målingen, på en helt annen beslutning.**
Orakelet sier hva som er optimalt med informasjon man ikke har – dobbelt
dummy ser alle hender, og SD-budet forutsetter at man vinner budrunden. Å
ligne på orakelet er ikke det samme som å spille godt.

Konsekvens for arkitekturen: **ingen fasit i MoE2 er godkjent før porten er
kjørt på den, med kandidater fra ulike familier og en poengreferanse hvis
pålitelighet er målt.** To av seks fasiter ser allerede motbevist ut. De skal
ikke brukes til forfremmelse før det er avklart.

---

## RETTELSE 2026-07-25 (2): vrakfasiten og trumffasiten er AVVIST

Porten er nå kjørt på begge, med samme metode som ga budfasiten dom: **bare
den ene beslutningen varieres**, alt annet – budet, det andre kontraktvalget,
hele kortspillet, alle fire seter – er NevroHjerne. Budrunden (og for trumf
også vraket) er deterministisk og skjer før valget, så hver policy måles på
nøyaktig de samme stillingene. Poeng måles to ganger på uavhengige giversett.

Skript: `examples/moe2-port-vrak.ts`, `examples/moe2-port-trumf.ts`.
Tall: `analyse/moe2-port-{vrak,trumf}.{txt,json}`.

| fasit | n giver | pålitelighet | korrigert, BREDT | korrigert, SMALT | dom |
|---|---|---|---|---|---|
| bud (SD) | 240 | 0,947 | 0,485 godkjent | **0,925 godkjent** | godkjent |
| vrak (DD) | 700 | 0,982 | 0,784 godkjent | **0,144** | **avvist** |
| trumf (DD) | 4 000 | 0,992 | 0,680 godkjent | **0,234** | **avvist** |

Referansen er altså ikke problemet: påliteligheten er 0,98–0,99 i begge de
smale utvalgene. Fasiten er problemet.

### Utvalget avgjør dommen, så utvalget må være en regel

Begge fasiter passerer bredt og faller smalt. «Smalt» er her definert av en
regel skrevet ned sammen med policyene, ikke plukket etterpå: *alle policyer
unntatt de som er konstruert for å være dårlige*. Det er nødvendig, for
dommen er sterkt utvalgsavhengig:

| utvalg (vrak) | korrigert | dom |
|---|---|---|
| bare DD-rangfamilien (fasit, nr. 6, 26, 101) | 1,000 | godkjent |
| DD-familien + NevroHjerne | 0,000 | avvist |
| alle unntatt de bevisst dårlige | 0,144 | avvist |

Det er **nøyaktig mønsteret fra E1-målingen**: innen én familie rangerer
anger poeng perfekt; på tvers av familier faller den fra hverandre. En port
som bare kjøres innen én familie godkjenner en fasit som ikke generaliserer.

### Fasitens eget optimum taper mot enkle heuristikker

| vrakpolicy | DD-anger | poeng/runde |
|---|---|---|
| NevroHjerne | 1,156 | **+6,19** |
| tøm korteste farge | 1,261 | +6,03 |
| **DD (fasiten)** | **0,000** | +4,65 |
| DD nr. 101 av 1 820 | 0,883 | −0,03 |

| trumfpolicy | DD-anger | etterlyst valør | poeng/runde |
|---|---|---|---|
| lengste farge, høyeste etterlysning | 0,857 | 12,9 | **+6,02** |
| NevroHjerne | 0,860 | 12,9 | +5,93 |
| DD-fargen, men høyeste etterlysning | 0,749 | 13,0 | +4,83 |
| **DD (fasiten)** | **0,000** | **4,3** | +4,11 |

Mekanismen er synlig i én kolonne: **fasiten etterlyser valør 4,3 i snitt**,
nevro 12,9. Etterlysningen bestemmer hvem makkeren blir, og dobbelt dummy vet
hvor kortet ligger. Orakelet plukker en lav toer fordi det ser at den sitter
hos riktig mann; spilleren som gjør det samme uten å se, plukker en tilfeldig
makker og gir bort et trumfkort. Å beholde fargevalget fra fasiten og bare
bytte etterlysningen til det høyeste lovlige kortet er verdt **+0,72 poeng**.

### Asymmetrien, som er den praktiske gevinsten

Budfasiten viste at feilen er retningsbestemt (ett bud for mye koster 14,75,
ett for lite 1,51). Det gjentar seg, målt paret mot fasitens eget valg på
samme giv, i poeng per enhet DD-anger:

| beslutning | retning | poeng per anger |
|---|---|---|
| vrak | kastet høyere kort enn fasiten | −4,03 |
| vrak | kastet lavere kort enn fasiten | −1,78 |
| vrak | tømte færre farger enn fasiten | −4,64 |
| vrak | tømte flere farger enn fasiten | **+0,34** |
| trumf | kortere trumffarge enn fasiten | −3,80 |
| trumf | lengre trumffarge enn fasiten | **+1,41** |
| trumf | lavere etterlysning (samme farge) | −4,26 |
| trumf | høyere etterlysning (samme farge) | **+0,93** |

De positive tallene er poenget: i tre av fire retninger **tjener** man poeng
på å avvike fra fasiten. En kvadratisk tapsfunksjon på DD-anger straffer
begge retninger likt og er derfor feil i seg selv, uavhengig av om fasiten
hadde bestått porten.

### Hva som endres

1. **Vrakeksperten og trumfeksperten skal ikke selekteres på DD-verdi.** Fire
   av seks fasiter er nå prøvd: bud godkjent, kort motbevist, vrak avvist,
   trumf avvist.
2. **Anger kan fortsatt brukes som gradient innen familie** – rangeringen er
   perfekt der (1,000 på DD-rangfamilien) – men aldri til forfremmelse.
3. **Gulvet og taket må måles hver gang.** NevroHjerne er ikke automatisk et
   tak, men her er den det: den slår fasiten på poeng i begge beslutninger,
   samtidig som den ligger 1,16 og 0,86 anger *under* den. Tilfeldig vrak er
   et ekte gulv (−6,04); tilfeldig trumfvalg likeså (−9,34).
4. **Retningen skal inn i tapsfunksjonen, ikke bare størrelsen.** Konkret,
   målt her: tøm korte farger, ikke kast høye kort, velg den lange trumfen,
   og etterlys høyt.

---

## Portresultatene, og mønsteret de danner

| fasit | dom | pålitelighet | korrigert korrelasjon |
|---|---|---|---|
| **bud** (avvik fra SD-orakelet) | **godkjent** | 0,947 (smalt utvalg) | **+0,925** |
| **kortspill** (følge DD-solveren) | **avvist** | 0,880 | **−0,609** |
| **vrak** (DD-verdi etter vrak) | **avvist** | 0,982 (smalt utvalg) | **+0,144** |
| **trumf** (DD-verdi av kontrakten) | **avvist** | 0,992 (smalt utvalg) | **+0,234** |

### Skillet er ikke tilfeldig: SD mot DD

Budfasiten er **single dummy**. SD-estimatet framkommer ved å faktisk spille
giva ut med en realistisk motspiller (NevroHjerne) i alle fire seter. Ingen
ser skjulte kort. Den bestod med 0,925.

Kortfasiten er **double dummy**. Solveren løser stillingen med alle fire
hender åpne. Den strøk med −0,609 – å følge den gjør spillet *verre*, og
verre jo mer man følger den (stikk 0–5: −1,20 poeng per runde mot å la
NevroHjerne spille).

Vrak- og trumffasiten er **også double dummy**, og begge strøk. Fire fasiter
er nå prøvd, og skillet går rent: den ene SD-fasiten bestod, alle tre
DD-fasitene falt. Trumffasiten viser mekanismen tydeligst av alle – den
etterlyser valør 4,3 i snitt mot nevros 12,9, fordi solveren *ser* hvem som
sitter med toeren og dermed hvem som blir makker. Spilleren ser det ikke.

Det er den samme skillelinjen alle fire steder: **en fasit som forutsetter
informasjon du ikke har, er ikke et mål – den er en felle.** DD-kortet er
optimalt mot et motspill som ser like mye som deg selv. Mot en motstander med
skjult informasjon setter det opp linjer som bare virker mot perfekt forsvar,
og lar være å utnytte feil motstanderen faktisk gjør.

Det forklarer også E1: E1 er destillert fra DD-orakelet, treffer det 61,4 %
mot nevros 58,7 %, og taper likevel 2,91 poeng. Den har lært å ligne på en
fasit som ikke vinner.

### Konsekvens for de tre spillekspertene – og for vrak og trumf

De kan ikke trenes på DD-enighet. Fasiten må bygges om etter samme prinsipp
som budet: for hvert kandidatkort spilles resten ut med en realistisk
motstandermodell over verdener som er forenlige med agentens EGEN informasjon,
og kortet scores på det som faktisk skjer. Altså single-dummy kortevaluering,
ikke double-dummy.

Det er dyrere per beslutning enn DD-oppslaget. Til gjengjeld er det den eneste
av de to som har bestått porten.

**Det samme gjelder vrak og trumf.** `analyserGiv` i
`src/neat/singledummy.ts` gjør allerede nøyaktig dette for budet: den spiller
giva ut fra hvert sete med NevroHjerne i alle fire. Vrakfasiten kan bygges av
samme maskineri – spill giva ut etter hvert kandidatvrak i stedet for å slå
opp DD-verdien – og trumffasiten likeså. Kostnaden er den samme rolloutet
budet allerede betaler; C(16,4) = 1 820 rolloutene per vrakstilling er
derimot uoverkommelig, så vrakeksperten må enumerere færre kandidater
(for eksempel de 20 DD-beste, som er billige å finne) og rangere dem med SD.

### Hva som IKKE er avgjort

Vinduet «stikk 6–8» ga +0,15 poeng, det eneste positive. Det kan være ekte
(sent i runden nærmer DD seg sannheten fordi færre kort er skjult) eller ren
støy. Det er ikke avgjort her, og skal ikke brukes til noe før det er målt
med nok giver til å skilles fra null.


---

## Portresultatene komplett: fire fasiter, ett skille

| fasit | metode | pålitelighet (smalt) | korrigert (smalt) | dom |
|---|---|---|---|---|
| **bud** | **single dummy** | 0,947 | **+0,925** | **godkjent** |
| trumf | double dummy | 0,992 | +0,234 | avvist |
| vrak | double dummy | 0,982 | +0,144 | avvist |
| kortspill | double dummy | 0,880 | **−0,609** | avvist |

Fire uavhengige beslutninger, fire porter, samme svar hver gang: **den ene
SD-fasiten består, alle tre DD-fasitene faller.** Påliteligheten er 0,88–0,99
i alle fire, så referansen er ikke problemet noe sted.

### Den klareste enkeltillustrasjonen: etterlysningen

Trumfeksperten skal velge farge og etterlyse et kort. Etterlysningen avgjør
hvem makkeren blir.

| policy | etterlyst valør | poeng/runde |
|---|---|---|
| lengste farge, høyest etterlysning | 12,9 | **+6,02** |
| NevroHjerne | 12,9 | +5,93 |
| **DD (fasiten)** | **4,3** | +4,11 |

Dobbelt dummy etterlyser valør **4,3**. Den *ser* hvem som sitter med toeren,
så den kan trygt kalle på en lav valør og få akkurat den makkeren den vil ha.
Uten den informasjonen er det samme trekket et sjansespill. Beholder man
fasitens fargevalg og bare bytter til høyeste lovlige etterlysning, er det
verdt +0,72 poeng.

Det er hele feilen i én rad: fasiten utnytter kunnskap agenten ikke har, og
oppskriften den gir er derfor ikke overførbar.

### Tapsfunksjonen kan ikke være symmetrisk

Paret mot fasitens eget valg på samme giv, poeng per enhet DD-anger:

| beslutning | retning fra fasiten | poeng/anger |
|---|---|---|
| vrak | kastet høyere kort | −4,03 |
| vrak | tømte færre farger | −4,64 |
| vrak | tømte **flere** farger | **+0,34** |
| trumf | kortere trumffarge | −3,80 |
| trumf | **lengre** trumffarge | **+1,41** |
| trumf | lavere etterlysning | −4,26 |
| trumf | **høyere** etterlysning | **+0,93** |

I tre av fire retninger *tjener* man poeng på å avvike fra fasiten. Budet viste
samme sak motsatt vei: overbud koster 14,75, underbud 1,51. En kvadratisk
straff på avvik er feil i alle fire beslutninger.

### Metodisk advarsel som gjelder alle framtidige porter

Det første smale utvalget for vrak var **håndplukket** og ga +0,429 GODKJENT.
Med en regel skrevet ned sammen med policyene – «alle unntatt de som er
konstruert for å være dårlige» – ble svaret +0,144 AVVIST.

| utvalg (vrak) | korrigert | dom |
|---|---|---|
| bare DD-rangfamilien | 1,000 | godkjent |
| DD-familien + nevro | 0,000 | avvist |
| alle unntatt bevisst dårlige | 0,144 | avvist |

Perfekt innen familie, faller fra hverandre på tvers – nøyaktig E1-mønsteret.
**Utvalgsregelen skal skrives ned før tallene foreligger.** Sensitivitets-
tabellen står nå i utdataene til hver port, så et enkelt utvalg ikke kan
bære en konklusjon alene.

---

## Ressursrydding 2026-07-25

Da portene var kjørt, gikk 218 CPU-timer inn i mål som samme dag var målt
motbevist:

| kjørte | antall | CPU-timer | status |
|---|---|---|---|
| e1-orakel | 10 | 185,2 | DD-data; læringskurven flat fra 100k, vi har 400k+ |
| kontraktslinje | 2 | 24,2 | gammel poengfitness |
| d8-anker `anger` | 3 | 6,6 | kriteriet målt til −0,609 mot poeng |
| d8-anker `poeng` | 1 | 2,2 | kan ikke rangere: SE 3,05 > spredning 2,7 |

Alle stoppet, unntatt to orakelskår som holdes som tynn strøm. Stillingene
ligger på disk; ingenting er tapt, og generering kan startes igjen når som
helst.

Grunnen til at dette står dokumentert: å la maskinen jobbe føles som
framdrift, og gjorde det ikke. Tre av fire skår selekterte aktivt i feil
retning mens portene som motbeviste kriteriet allerede var kjørt.

---

## SD-kortfasiten GODKJENT – hypotesen holdt

Samme test, samme mal, eneste forskjell er hvordan kortet vurderes:

| vindu | DD (avvist) | SD (godkjent) | endring |
|---|---|---|---|
| aldri (nevro) | 0,00 | 0,00 | – |
| stikk 0–2 | −0,62 | −0,88 | −0,26 |
| stikk 3–5 | −0,10 | **+0,53** | +0,63 |
| stikk 6–8 | +0,15 | **+0,48** | +0,33 |
| stikk 9+ | −0,16 | **+0,26** | +0,42 |
| stikk 0–5 | −1,20 | **+0,63** | **+1,83** |
| stikk 6+ | −0,35 | **+0,78** | +1,13 |
| alltid | −0,95 | **+0,29** | +1,24 |

| | korrigert korrelasjon | pålitelighet | dom |
|---|---|---|---|
| DD | −0,609 | 0,880 | avvist |
| **SD** | **+0,718** | 0,688 | **godkjent** |

Fortegnet snur i syv av åtte vinduer. Det er den samme beslutningen,
evaluert med og uten informasjon agenten faktisk har.

### Men det finnes ett unntak, og det gjelder begge

**Stikk 0–2 er negativt for både DD (−0,62) og SD (−0,88).** Å følge en
orakelevaluering i de tre første stikkene koster poeng uansett metode. Det er
også derfor «alltid» (+0,29) er dårligere enn «stikk 6+» (+0,78): den drar med
seg de tidlige stikkene.

Tolkningen som passer med alt annet vi har målt: tidlig i runden er så mye
skjult at fire samplede verdener ikke dekker mulighetsrommet. Evalueringen
blir da et presist svar på feil spørsmål.

**Designkonsekvens:** spilleksperten bruker SD-fasit fra stikk 3 og utover.
I stikk 0–2 har vi ingen validert fasit, og det skal stå slik til noe består
porten – ikke fylles med DD fordi det er det vi har.

### Forbehold

Påliteligheten er 0,688, over terskelen på 0,3 men ikke høy, og effektene er
mindre i absoluttverdi enn i DD-kjøringen. Retningen er entydig; størrelsen
er det ikke. Før SD-fasiten brukes til å forfremme noe, skal den måles på
flere givere.

---

## Budeksperten trent – og den slår ikke nevros eget bud

Budfasiten er den eneste av seks som har bestått porten (korrigert +0,925,
pålitelighet 0,947 smalt), så den er den eneste det er lov å trene på. Det er
gjort. Skript: `examples/moe2-tren-bud.ts`, `examples/moe2-poeng-bud.ts`.
Tall: `analyse/moe2-tren-bud.{txt,json}`, `analyse/moe2-poeng-bud.{txt,json}`.

**Konklusjonen først: eksperten slår ikke NevroHjernes bud.** Den beste av
fire varianter lander på **+0,18 ± 0,32 poeng/runde** mot nevros 0,00 – altså
ikke til å skille fra null – mens SD-policyen den er trent mot ligger på
+3,89. Varianten som følger designet lengst (asymmetrisk gradient) taper
**−0,97 ± 0,27**.

### Tapsfunksjonen: asymmetrisk, konveks, i poeng

Fasiten er ikke lenger −|påstand − SD|, men **−budKostnad(påstand − SD)**,
målt i poeng per runde:

| retning | kostnad per stikk | kilde |
|---|---|---|
| overbud | **14,75** | SD+1 gir −10,86 mot SDs +3,89 |
| underbud, første stikk | **1,51** | SD−1 gir +2,38 |
| underbud, videre | 2,10 | SD−2 −0,18 og SD−3 −1,81 |

Ett stikk for mye koster **9,8 ganger** så mye som ett for lite. En kvadratisk
eller absolutt straff på |feil| setter det forholdet til 1,0 og ber dermed
eksperten balansere en risiko som ikke er balansert. De 2,10 er den konvekse
innhyllingen av de to målte marginalene (2,56 og 1,63); summen er bevart
(5,70), bare fordelingen mellom −2 og −3 er glattet, fordi en ikke-konveks
kostnad gjør «velg billigste lovlige bud» sprangvis.

Valget følger av kostnaden: **rund ned**. Terskelen for å runde opp er 0,093
stikk, ikke 0,5. Det er verdt +1,73 til +4,29 poeng målt (se tabellen under),
og er den ene delen av designet som poengbenken bekrefter.

### mål(), holdout n=1828, anger i poeng per runde

Taket er **SD-orakelet selv**, ikke NevroHjerne. Grunnen står i tallene: nevro
bommer 2,6090 stikk fra SD der et uniformt lovlig bud bommer 2,2229, så
`framdrift()` – som deler på (gulv − tak) – ga −278 % for et ferskt nett og
−379 % for et lært, altså et tall som ble mer negativt jo bedre eksperten var.
Med SD som tak er anger mot taket null per konstruksjon og framdriften leses
som «hvor langt fra tilfeldig mot orakelet», i [0, 1].

| policy | anger | gulv | tak | framdrift |
|---|---|---|---|---|
| SD (taket) | 0,000 | 25,176 | 0,000 | 100,0 % |
| **asymmetrisk gradient, lært** | **5,346** | 25,176 | 0,000 | 78,8 % |
| symmetrisk gradient, lært | 5,432 | 25,176 | 0,000 | 78,4 % |
| ferskt nett (begge armer) | 5,867 | 25,176 | 0,000 | 76,7 % |
| nevros bud | 5,588 | 25,176 | 0,000 | 77,8 % |
| konstant 8 | 8,801 | 25,176 | 0,000 | 65,0 % |
| konstant 9 | 11,264 | 25,176 | 0,000 | 55,3 % |

Delingen går på **giv**, ikke på stilling, og `moe2-tren-bud.ts` stopper hvis
en giv har havnet i to deler – 726/248/226 givere, sjekket i hver kjøring.

Merk at nevro her ligger 77,8 % oppe, ikke under gulvet. Det er ikke en
motsigelse av avsnittet over: nevro underbyr systematisk, og under en kostnad
som gjør underbud billig blir den systematiske feilen billig. Under |avvik| lå
den under gulvet. Samme policy, samme stillinger, to tapsfunksjoner, motsatt
dom – som er selve grunnen til at tapsfunksjonen måtte måles og ikke antas.

### Poengbenken, 240 givere × 4 seter, bare budet varieres

| policy | snittbud | byr% | skjevhet | spredning | over% | poeng | SE | mot nevro |
|---|---|---|---|---|---|---|---|---|
| SD (fasiten) | 9,10 | 92 % | 0,00 | 0,00 | 0 % | **+3,89** | 0,41 | +3,89 |
| SD − 1 | 8,32 | 82 % | −1,00 | 0,00 | 0 % | +2,38 | 0,34 | +2,38 |
| SD − 1 ± 1 (støykontroll) | 8,42 | 81 % | −0,85 | 0,99 | 0 % | +2,03 | 0,36 | +2,03 |
| **sym. gradient + rund ned** | 8,20 | 98 % | −0,71 | 1,52 | 21 % | **+0,18** | 0,32 | **+0,18** |
| nevro selv | 7,54 | 96 % | −1,38 | 1,87 | 16 % | −0,00 | 0,33 | 0,00 |
| asym. gradient + rund ned | 7,47 | 81 % | −1,57 | 1,55 | 10 % | −0,97 | 0,27 | −0,97 |
| asym. gradient + nærmeste | 9,17 | 99 % | +0,28 | 1,90 | 44 % | −2,70 | 0,49 | −2,70 |
| sym. gradient + nærmeste | 9,83 | 100 % | +0,96 | 1,83 | 56 % | −4,11 | 0,54 | −4,11 |

`skjevhet` = snitt(bud − SD), `spredning` = standardavviket rundt den,
`over%` = hvor ofte budet ligger over SD.

### Hvorfor den ikke slår nevro: nivået er lett, spredningen er dyr

Støykontrollen er hele svaret. «SD − 1 ± 1» sikter på samme nivå som SD − 1 og
legger på ren tilfeldig spredning som **aldri** går over SD. Det koster 0,35
poeng. Eksperten sikter BEDRE enn både SD − 1 og nevro (skjevhet −0,71 mot
−1,00 og −1,38) og har MINDRE spredning enn nevro (1,52 mot 1,87) – og henter
likevel bare +0,18.

Forskjellen ligger i én kolonne: **21 % av budene ligger over SD**. Med 14,75
poeng per overbudsstikk spiser den femtedelen hele gevinsten fra de fire
andre. Et estimat er ikke en forskyvning; det skjelver, og skjelvingen er
dyr bare i den ene retningen.

Det gir også oppskriften videre, som ikke er «tren lenger»: enten må
spredningen ned (bedre sensorer, ikke flere generasjoner – kurven flatet fra
generasjon 35), eller så må budet velges under en **fordeling** i stedet for
under et punktestimat, altså et nett som gir usikkerheten sin og et bud som
er kvantilen i den fordelingen.

### Og enda en gang: fasiten og poengbenken rangerer paret motsatt

Dette er den femte gangen på to dager.

| | holdout-anger (i poeng!) | poeng/runde |
|---|---|---|
| asymmetrisk gradient | **5,346** (best) | **−0,97** (verst) |
| symmetrisk gradient | 5,432 | +0,18 |

Angeren her er ikke et abstrakt fasitavvik – den er bygget av de MÅLTE
poengkostnadene, og rangerer likevel motsatt av poeng. Mekanismen er at
kostnadene ble målt på policyer som forskjøv **alle fire setene** samtidig,
mens angeren brukes per beslutning. Et lavt bud betyr som regel at man ikke
vinner budrunden i det hele tatt, og da påløper aldri de 1,51 – underbud er
derfor billigere per beslutning enn per policy, og den asymmetriske
gradienten dytter estimatet for langt ned (skjevhet −1,57, byr bare 81 %).

Asymmetrien er likevel riktig og bekreftet: den delen av den som ligger i
**valgregelen** – rund ned – er verdt +1,73 poeng for det asymmetrisk trente
nettet og +4,29 for det symmetrisk trente. Det er delen som ligger i
**gradienten** som overkorrigerer, og bare fordi den samme kostnaden brukes to
ganger på rad.

### Hva som IKKE hjalp, målt

Hypotesen om at eksperten var kapasitetsbegrenset (5 av 87 sensorer koblet til
utgangen) er prøvd og er feil, monotont:

| trekk til utgangen | anger, asym. | anger, sym. |
|---|---|---|
| 5 | **5,037** | 6,175 |
| 87 | 5,268 | 7,424 |
| 400 | 5,380 | 8,086 |

Grunnen er `bevarLengde`: kalibreringen får endre retning, aldri skala, så
L2-lengden 1,5 fordeles på flere koblinger og hver sensor får mindre å si.

---

## Budeksperten: porten godkjente en POLICY, treningen brukte et TAP

Budfasiten bestod porten med +0,925. Eksperten som ble trent på den slår
likevel ikke NevroHjernes bud: beste variant **+0,18 ± 0,32**, altså ikke til
å skille fra null, og varianten som følger designet lengst taper
**−0,97 ± 0,27**.

Og igjen rangerer de to målestokkene motsatt: den asymmetriske gradienten er
**best på anger (5,346) og verst på poeng (−0,97)**.

### Feilen er min, og den er strukturell

Porten testet **policyer**: «by det SD sier», «by SD − 1», «by konstant 9».
Den godkjente altså påstanden *å følge SD-policyen er verdt +3,89 poeng*.

Treningen brukte noe annet: et **per-beslutning-tap** på avviket fra SD, med
kostnadene 14,75 for overbud og 1,51 for underbud hentet fra policymålingen.

Det er ikke samme størrelse. Kostnadene ble målt på policyer som forskjøv
**alle fire setene samtidig**. Per beslutning er situasjonen en annen: et lavt
bud betyr som regel at man ikke vinner budrunden i det hele tatt, så
underbudskostnaden på 1,51 påløper aldri. Gradienten ser dermed en billigere
nedside enn den virkelige og dytter estimatet for langt ned – eksperten byr
81 % av SD-nivået.

**En godkjent policy er ikke et godkjent treningsmål.** Porten må kjøres på
objektet slik det faktisk skal brukes.

### Hva som likevel overlevde

Den delen av asymmetrien som ligger i **valgregelen** er bekreftet av poeng:
å runde ned i stedet for til nærmeste er verdt **+1,73 til +4,29 poeng**.
Terskelen er 0,093, ikke 0,5. Det er en ekte, målt gevinst.

Diagnosen er også skarp: eksperten sikter *bedre* enn både nevro og SD−1
(skjevhet −0,71 mot −1,38 og −1,00) og har *mindre* spredning enn nevro
(1,52 mot 1,87). Men 21 % av budene ligger over SD, og med 14,75 poeng per
stikk i overbud spiser den femtedelen hele gevinsten. Støykontrollen viser
det samme fra andre kanten: «SD − 1 ± 1», som aldri går over SD, koster bare
0,35 poeng for samme spredning.

**Nivået er lett å treffe. Spredningen over SD er det som koster.**

### Konsekvens for porten

Porten får et krav til: kandidatene skal være **det som faktisk skal brukes** –
et trent nett, ikke en håndlaget policy som bruker samme orakel. Ellers
validerer den orakelet i stedet for objektet.

---

## Hullet i stikk 0–2 var for få verdener – bekreftet

Forklaringen sto i forrige seksjon merket som **påstand**. Den er nå målt,
120 givere × 4 seter:

| vindu | poeng/runde |
|---|---|
| stikk 0–2, **4 verdener** | **−0,88** |
| stikk 0–2, **12 verdener** | **+0,22** |
| stikk 0–2, 32 verdener | +0,20 |
| stikk 6+, 4 verdener | +0,41 |
| stikk 6+, 32 verdener | +0,76 |

Å gå fra 4 til 12 verdener snur det tidlige vinduet fra −0,88 til +0,22 – en
endring på **1,10 poeng**. 32 verdener gir ingenting utover 12. Tidlig i runden
er mer skjult, så mulighetsrommet krever flere trekninger; når det er dekket,
er det dekket.

**Designkonsekvens:** spilleksperten bruker minst 12 verdener i stikk 0–2.
Forrige seksjons konklusjon om at vi «ikke har noen validert fasit tidlig» er
dermed opphevet – vi hadde en, den var bare underdimensjonert.

### Støygulvet, som må stå ved siden av tallene

Samme vindu målt i to kjøringer av samme skriptmal:

| | «stikk 6+, 4 verdener» |
|---|---|
| første kjøring | +0,78 |
| denne kjøringen | +0,41 |

Frøene er de samme, men rng-en forbrukes ulikt når policylisten endres, så
verdenene som trekkes blir andre. Forskjellen på **0,37 er ren samplingstøy**,
ikke en effekt.

Det gir et støygulv å lese alle disse tallene mot:

- `0–2: −0,88 → +0,22` er **1,10** – langt over gulvet, ekte.
- `6+: +0,41 → +0,76` er **0,35** – *på* gulvet, kan ikke leses som en effekt.

Verdenstrekningen bør frøes eksplisitt per (giv, sete, vindu) i neste versjon,
slik at to kjøringer av samme konfigurasjon gir identiske tall.

### Om portens dom her

Porten sier GODKJENT med korrigert korrelasjon **1,095**. En korrelasjon over
1 er ikke et sterkere resultat – det er et tegn på at dempingskorreksjonen
presses forbi sitt gyldighetsområde ved moderat pålitelighet (0,654).
Les den som «positiv», ikke som «svært sterk».
