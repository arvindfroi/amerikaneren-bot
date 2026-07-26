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

---

## SD-generatoren: `examples/sd-orakel.ts`

Læreren er byttet. E1 er destillert fra DD-orakelet, treffer det 61,4 % mot
nevros 58,7 % og taper likevel 2,91 ± 0,06 poeng. SD-fasiten er den som bestod
porten (+0,718 mot DDs −0,609), så treningsdataene må komme derfra.

Skriptet spiller partier med NevroHjerne og merker et utvalg kortvalg med
`vurderKortSD` (12 verdener, NevroHjerne som utspiller i alle seter – nøyaktig
den konfigurasjonen porten godkjente).

**Formatet er identisk med `examples/e1-orakel.ts`**, med vilje: `t` (E1-vektoren,
273), `nt` (NEAT-vektoren, 318), `v` (kortindeks → verdi), `n`, `frø`, `stikk`.
Eneste forskjell er at `dybde` (som ikke finnes i SD) er byttet mot
`sdVerdener`. Dermed virker `verktoy/e1-tren.py` uendret, og SD-data kan trenes
og sammenlignes mot DD-data på samme trener. Låst av
`test/sd-orakel-format.test.ts`, som både kjører generatoren og sammenligner
nøklene mot en ekte e1-orakel-linje på disk. Testen er skrevet fordi `t` og
`nt` ble forvekslet tre ganger 25. juli.

Utmappen er `sd-data/`, ikke `e1-data*`. Treneren leser alle `skard-*.jsonl` i
en mappe og blander dem uten å se på innholdet; én SD-linje i `e1-data/` ville
ødelagt begge settene uten at noe feilet. Frørommet starter på 50 mill., langt
unna e1-orakelets (≤15,3 mill.) og portenes (8,1/8,6 mill.), så settene ikke
deler givere.

### Produksjonsraten – SD er BILLIGERE enn DD, ikke dyrere

| | stillinger/s per prosess | med 16 skard |
|---|---|---|
| e1-orakel (DD, 24 verdener, dybde 7, nodetak 400k) | ~0,6 | ~2,2/time × 10⁴ |
| **sd-orakel (SD, 12 verdener)** | **~16,6 alene** | se tabellen under |

Det motsier setningen lenger opp om at SD er «dyrere per beslutning enn
DD-oppslaget». Den gjaldt ett DD-*oppslag*; e1-orakelet gjør ikke ett oppslag,
det kjører et eksaktsøk med tak på 400 000 noder i 24 verdener. Én SD-verden er
en enkel utspilling med et lite nett – 12 av dem er billigere enn det.

### Den kjente skjevheten, som står her og ikke oppdages senere

Stillingene kommer fra **nevros** spilling, som resten av benken. En agent
trent på dem kommer til å møte andre stillinger enn den er trent på. Det er
samme distribution shift som gjorde anger-trening på nevro-stillinger 105 poeng
*svakere* for D5. `--utforsk 0.15` demper det; kuren er DAgger – runde to hentes
fra SD-agentens egen spilling, som `--spiller` allerede gjør for e1-orakel.

---

## SD-vrakfasiten og SD-trumffasiten GODKJENT – begge

De to siste DD-fasitene er nå bygget om etter samme oppskrift som budet og
kortspillet, og begge består porten. Skript:
`examples/moe2-port-vrak-sd.ts`, `examples/moe2-port-trumf-sd.ts`.
Tall: `analyse/moe2-port-{vrak,trumf}-sd.{txt,json}`.
Modulen er `src/moe2/sdkort.ts`, som nå dekker alle tre beslutningene gjennom
én felles `vurderSD` – kortspill, vrak og trumf deler verdenssampling og
utspilling, i stedet for tre kopier som kan gli fra hverandre.

| fasit | DD, opprinnelig kjøring | SD, denne kjøringen | pålitelighet (SD, smalt) |
|---|---|---|---|
| **vrak** | +0,144 avvist | **+0,848 GODKJENT** | 0,966 |
| **trumf** | +0,234 avvist | **+0,831 GODKJENT** | 0,969 |

**Fortegnet snudde ikke, for det trengte det ikke.** Kortfasiten gikk fra
−0,609 til +0,718 fordi DD der pekte MOTSATT vei. Vrak og trumf pekte allerede
riktig vei; de lå bare så nær null (+0,144, +0,234) at de ikke kunne bære en
seleksjon. Ombygd til SD flytter de seg til +0,85 og +0,83 – forbi terskelen
på 0,3 med god margin, med pålitelighet 0,97 i begge.

Alle sju fasitkjøringene, samlet:

| fasit | metode | korrigert (smalt) | dom |
|---|---|---|---|
| bud | single dummy | +0,925 | godkjent |
| **vrak** | **single dummy** | **+0,848** | **godkjent** |
| **trumf** | **single dummy** | **+0,831** | **godkjent** |
| kortspill | single dummy | +0,718 | godkjent |
| trumf | double dummy | +0,234 | avvist |
| vrak | double dummy | +0,144 | avvist |
| kortspill | double dummy | −0,609 | avvist |

**Fire single-dummy-fasiter, fire godkjenninger. Tre double-dummy-fasiter, tre
avvisninger.** Skillet holder i alle sju.

### Vrak: 1 400 giver, 64 verdener, forhåndsfilter topp-20 av DD

| vrakpolicy | SD-anger | snittvalør | renons | poeng/runde |
|---|---|---|---|---|
| SD nr. 2 | 3,934 | 6,70 | 0,44 | **+5,90** |
| **SD (fasiten)** | **2,916** | 6,65 | 0,53 | **+5,85** |
| nevro selv | 1,088 | 6,19 | 0,85 | +5,71 |
| korteste farge | 1,889 | 6,93 | 1,02 | +4,25 |
| SD nr. 5 | 5,869 | 6,96 | 0,37 | +3,88 |
| **DD (fasiten)** | 6,627 | 7,00 | 0,52 | **+3,73** |
| DD nr. 26 | 8,681 | 7,35 | 0,26 | +1,38 |
| lavest valør | 9,239 | 3,52 | 0,08 | −2,71 |
| tilfeldig | 12,671 | 8,42 | 0,10 | −5,35 |
| DD verste | 17,934 | 11,45 | 0,07 | −14,25 |

`mål()` med gulv og tak fra de samme 1 400 givene:

| | verdi | gulv (tilfeldig) | tak (nevro) | framdrift |
|---|---|---|---|---|
| **SD-vrak** | **5,846** | −5,346 | 5,713 | **101,2 %** |
| DD-vrak | 3,731 | −5,346 | 5,713 | 82,1 % |

I DD-kjøringen lå fasitens eget optimum 1,54 poeng UNDER NevroHjerne (+4,65 mot
+6,19). Her ligger det 0,13 over – innenfor støyen (halvdelene gir 6,06 og
5,63), så det riktige er å si at **SD-vraket når nevro, mens DD-vraket lå to
poeng under.** `SD nr. 2` (+5,90) er ikke til å skille fra fasiten (+5,85).

### Trumf: 1 998 giver, 32 verdener, hele tabellen enumerert

Her er det ikke behov for noe forhåndsfilter – søkerommet er ~36 par.

| trumfpolicy | SD-anger | trumflengde | etterlyst valør | poeng/runde |
|---|---|---|---|---|
| lengste farge, høyest | 1,104 | 6,01 | 12,9 | **+5,88** |
| SD-fargen, høyest | 0,722 | 5,93 | 13,1 | +5,72 |
| nevro selv | 1,233 | 6,01 | 12,9 | +5,58 |
| **SD (fasiten)** | **0,000** | 5,93 | **12,1** | **+5,28** |
| DD-fargen, høyest | 3,383 | 5,39 | 13,0 | +4,48 |
| lengde+serie | 2,162 | 5,87 | 12,6 | +4,42 |
| **DD (fasiten)** | 8,892 | 5,39 | **4,3** | **+4,37** |
| SD-fargen, lavest | 7,713 | 5,93 | 2,7 | −1,07 |
| tilfeldig | 15,510 | 2,58 | 7,9 | −9,64 |
| SD verste | 22,654 | 0,49 | 6,7 | −15,25 |

| | verdi | gulv | tak | framdrift |
|---|---|---|---|---|
| **SD-trumf** | **5,281** | −9,641 | 5,579 | **98,0 %** |
| DD-trumf | 4,371 | −9,641 | 5,579 | 92,1 % |

### Etterlysningen: 4,3 → 12,1, uten at noe annet ble endret

Dette er den ene raden hele hypotesen ble formulert på. Samme stilling, samme
kandidatliste, eneste forskjell er om kandidaten vurderes med alle hender åpne
eller ved å spilles ut i verdener agenten faktisk kan tenke seg:

| fasit | etterlyst valør, snitt | trumflengde | poeng/runde |
|---|---|---|---|
| DD | **4,3** | 5,39 | +4,37 |
| SD | **12,1** | 5,93 | +5,28 |

Dobbelt dummy kaller på en toer fordi den SER hvem som sitter med den. Single
dummy trekker 32 verdener der kortet ligger et tilfeldig sted, og da er en lav
etterlysning nøyaktig det sjansespillet den er. Fasiten oppdager det selv, uten
at noen har fortalt den at høy etterlysning er bra. **Den flytter seg 7,8
valørtrinn og henter +0,91 poeng.**

Trumffargen følger med: DD velger 5,39 kort lang trumf, SD 5,93 – nærmere
«lengste farge», som er policyen som scorer best av alle.

### Det som IKKE ble reparert, og som skal stå

SD-fasitens eget optimum er fortsatt ikke den beste policyen i trumf.
«Lengste farge, høyest etterlysning» (+5,88) og «SD-fargen, høyest» (+5,72) slår
den (+5,28). Forskjellen er halvdelsstabil (5,31/5,25 mot 5,82/5,62), altså
ekte, ikke støy.

Aksen er den samme som DD feilet på, bare mindre: fasiten etterlyser 12,1 der
det beste er 13,1. Asymmetritabellen sier det rett ut – å etterlyse HØYERE enn
fasiten, i samme farge, er verdt **+0,76 poeng per enhet anger**.

Er det bare for få verdener? Delvis. Med 96 verdener (500 giver,
`analyse/moe2-port-trumf-sd-k96.{txt,json}`) stiger fasitens etterlysning til
**12,7** og treffer «høyeste lovlige» i 84 % av stillingene mot 70 % ved 32.
Men gapet lukkes ikke: «SD-fargen, høyest» ligger fortsatt +0,60 over fasiten,
og «høyere valør» er fortsatt verdt +2,81 poeng per anger. Dommen er robust
(smalt +0,796 ved 96 verdener mot +0,831 ved 32), men **den siste
etterlysningsjusteringen bør legges inn som en regel, ikke ventes ut med flere
verdener.**

### Hva forhåndsfilteret koster i vrak – målt, ikke antatt

C(16,4) = 1 820 kandidater × 64 verdener × en hel utspilling er uoverkommelig,
så SD rangerer bare de `filter` DD-beste. Prisen er målt to ganger.

**Direkte filtertest**, 24 giver, valgt i verdenssett A og målt i et uavhengig
sett B – ellers ville maks-over-100 slått maks-over-20 av ren vinnerforbannelse:

| | |
|---|---|
| samme vrak valgt av topp-20 og topp-100 | 38 % |
| SD-gevinst ved topp-100 | **+0,690** |
| DD-rang til det SD-beste vraket i topp-100 | 37,4 av 100 |

Det SD-beste vraket ligger altså typisk rundt DD-rang 37 – godt utenfor topp-20.

**Hele porten kjørt om igjen med topp-100**, 500 giver
(`analyse/moe2-port-vrak-sd-f100.{txt,json}`):

| filter | SD-fasitens poeng | nevro, samme giver | differanse | framdrift | smal port |
|---|---|---|---|---|---|
| topp-20 | +5,85 | +5,71 | +0,14 | 101,2 % | +0,848 |
| **topp-100** | **+7,63** | +6,27 | **+1,36** | **112,5 %** | **+0,954** |

Med topp-100 slår SD-vraket NevroHjerne med 1,36 poeng, og fasitens egen
SD-anger faller fra 2,916 til 1,140. **Filteret var den bindende
begrensningen, ikke SD-idéen.** Kostnaden er lineær i `filter`: topp-100 tar
2,8 s per giv mot 0,9 s.

### DD dømt på nøyaktig samme datagrunnlag – og hvorfor det tallet ikke er +0,144

Begge skriptene regner ut DD-dommen av de SAMME givene, de SAMME policyene og
de SAMME poengmålingene, så kolonnene bare skiller seg på fasiten:

| | SD, smalt | DD, smalt, samme data |
|---|---|---|
| vrak (topp-20) | **+0,848** | +0,424 |
| vrak (topp-100) | **+0,954** | +0,502 |
| trumf (32 verdener) | **+0,831** | +0,610 |
| trumf (96 verdener) | **+0,796** | +0,565 |

SD slår DD i alle fire, men **DD-kolonnen her er høyere enn de +0,144 og +0,234
som felte fasiten første gang, og det er ikke en motsigelse – det er en annen
test.** Policylisten er nå bygget rundt SD-fasiten: nær-variantene er SD nr. 2 og
SD nr. 5, og de bevisst dårlige er valgt for å ligge langt fra SD. DD blir
dermed målt på et utvalg som ikke er konstruert for å skille DD-naboer fra
hverandre, og det er nettopp de nabolagene DD falt på. **Den gyldige DD-dommen
er fortsatt den fra `moe2-port-{vrak,trumf}.ts`**; kolonnen her er en kontroll
for at SD ikke bare har fått et lettere utvalg.

### Sensitivitet: dommen som funksjon av utvalget

Utvalgsregelen ble skrevet ned sammen med policyene, før tallene forelå:
*alle unntatt de som er konstruert for å være dårlige* – samme regel og samme
antall navn som i DD-kjøringene, så tallene kan settes rett mot hverandre.

| utvalg (vrak, topp-20) | n | pålitelighet | SD | DD |
|---|---|---|---|---|
| bredt – alle policyer | 13 | 0,986 | +0,941 | +0,808 |
| **SMALT – uten de bevisst dårlige** | 9 | 0,966 | **+0,848** | +0,424 |
| bare SD-rangfamilien | 3 | 0,667 | +0,612 | +0,612 |
| SD-familien + nevro | 4 | 0,571 | **+0,265 avvist** | +0,794 |
| bare ikke-SD | 10 | 0,994 | +0,967 | +0,809 |

| utvalg (trumf) | n | pålitelighet | SD | DD |
|---|---|---|---|---|
| bredt – alle policyer | 13 | 0,986 | +0,924 | +0,824 |
| **SMALT – uten de bevisst dårlige** | 10 | 0,969 | **+0,831** | +0,610 |
| bare SD-familien | 4 | 1,000 | +0,800 | +1,000 |
| SD-familien + nevro | 5 | 1,000 | +0,700 | +0,900 |
| bare ikke-SD | 7 | 0,943 | +0,956 | +0,552 |

Én rad avviker: «SD-familien + nevro» i vrak gir +0,265 AVVIST. Det er n=4 med
pålitelighet 0,571, altså fire policyer der tre ligger innenfor støyen av
hverandre (+5,90, +5,85, +5,71) – ikke et utvalg som kan bære en dom. Med
topp-100-filteret blir den samme raden +0,849. Den står her fordi
sensitivitetstabellen skal vise alt den viser, også det som ikke passer.

### Tapsfunksjonen: symmetrisk er nå forsvarlig i vrak, men ikke i trumf

Paret mot fasitens eget valg på samme giv, poeng per enhet anger:

| beslutning | retning fra fasiten | DD-kjøringen | SD-kjøringen |
|---|---|---|---|
| vrak | kastet høyere kort | −4,03 | −0,86 |
| vrak | kastet lavere kort | −1,78 | −0,61 |
| vrak | tømte færre farger | −4,64 | −0,90 |
| vrak | tømte **flere** farger | **+0,34** | **−0,71** |
| trumf | kortere trumffarge | −3,80 | −0,91 |
| trumf | **lengre** trumffarge | **+1,41** | **+0,14** |
| trumf | lavere etterlysning | −4,26 | −0,70 |
| trumf | **høyere** etterlysning | **+0,93** | **+0,76** |

Under DD tjente man poeng på å avvike fra fasiten i tre av fire retninger.
Under SD er **alle fire vrakretningene negative**: fasiten er ikke lenger
systematisk skjev, og et symmetrisk tap på SD-anger er forsvarlig i vrak.

I trumf gjenstår to positive: lengre farge (+0,14, marginalt) og høyere
etterlysning (+0,76, klart). Etterlysningsaksen må derfor fortsatt straffes
asymmetrisk, eller løses med regelen «etterlys det høyeste lovlige kortet i den
valgte fargen».

### Forbehold som må stå

1. **Porten er delvis selvbekreftende.** SD-fasiten estimerer forventet
   poengutfall mot NevroHjerne, og referansen MÅLER poengutfall mot
   NevroHjerne. Med K → ∞ ville den vært tautologisk. Det informative er at DD
   ikke består samme test, at et gjennomførbart K holder, og at fasitens eget
   optimum likevel IKKE er den beste policyen i trumf – hadde porten vært ren
   tautologi, ville den vært det.
2. **Porten testet policyer, ikke et trent nett.** Det er nøyaktig fellen
   budeksperten gikk i: en godkjent policy er ikke et godkjent treningsmål.
   Før vrak- eller trumfeksperten forfremmes, skal porten kjøres på nettet slik
   det faktisk skal brukes.
3. **Vrakfasiten er definert med et filter.** «SD-beste av de 20 DD-beste» og
   «SD-beste av de 100 DD-beste» er to ulike fasiter, og forskjellen er målt til
   +1,22 poeng. Fasiten må oppgi filteret sitt.
4. **Verdenstrekningen frøes per giv**, men rng-en forbrukes ulikt når
   policylisten endres. To kjøringer med ulik policyliste kan derfor ikke
   sammenlignes rad for rad; bruk differansene innen én kjøring.

---

## MoE-premisset feiler: gevinstene legger seg ikke sammen

200 givere × 4 seter, hver komponent slått på alene og i kombinasjon, alt
annet NevroHjerne:

| oppsett | poeng/runde | SE | mot nevro |
|---|---|---|---|
| **bud alene** | **4,25** | 0,44 | **+4,25** |
| bud+trumf | 3,66 | 0,45 | +3,66 |
| bud+spill | 2,18 | 0,46 | +2,18 |
| alle tre | 1,64 | 0,47 | +1,64 |
| trumf+spill | 1,01 | 0,35 | +1,01 |
| spill alene | 0,48 | 0,35 | +0,48 |
| nevro (baseline) | 0,00 | 0,35 | – |
| trumf alene | −0,07 | 0,35 | −0,07 |

Sum av enkeltgevinstene **+4,65**. Faktisk for «alle tre» **+1,64**.
**Komposisjonstap −3,01.**

Verre: **hver eneste tilføyelse til budet gjør det dårligere.** Bud alene er
+4,25; legg på trumf og det faller til +3,66; legg på spill og det faller til
+2,18; begge deler gir +1,64. Den beste agenten vi har er den enkleste.

### Hvorfor – og det var forutsagt i skriptets egen kommentar

Hver komponent ble målt med **alt annet på nevro**. Det er en LOKAL måling
rundt nevros policy. SD-budet flytter snittbudet fra 7,54 til 9,10, og da
havner man i en helt annen fordeling av kontrakter enn den kortspillet ble
validert i. SD-kortspillet ble målt til å være verdt +0,48 i nevros
stillinger; i de ambisiøse kontraktene budet skaper, er det ikke det.

**Porten måler lokale gradienter rundt nevro. Den kan ikke validere et
sammensatt sprang.**

Det er den tredje strukturelle svakheten i porten funnet på én dag, alle ved
måling:

1. Den godkjente en **policy**, treningen brukte et **per-beslutning-tap**.
2. Dommen **snudde med kandidatutvalget** (DD-trumf: 0,234 avvist → 0,610
   godkjent).
3. Den måler **lokalt**, og gevinstene komponerer ikke.

### Hva som likevel står

**SD-budpolicyen slår NevroHjerne med +4,25 ± 0,44** – 9,7 standardfeil fra
null, bekreftet på et annet frøsett enn den ble validert på (+3,89 der).
Det er den første komponenten i hele prosjektet som beviselig slår appens
nett på poeng.

Men den er en POLICY som spør SD-orakelet, ikke et trent nett. Budeksperten
som ble trent på samme fasit fikk +0,18 ± 0,32.

### Konsekvens

Arkitekturens antakelse om **uavhengige eksperter** er målt feil. Enten må
ekspertene valideres og trenes SAMMEN, eller så må vi akseptere at én god
komponent er bedre enn fire, og bygge derfra. Å legge til flere «validerte»
komponenter har målt negativ verdi.

Trumf alene måler her −0,07 ± 0,35, mot +0,30 i trumfporten. Gevinsten
replikerte altså ikke – den lå innenfor støy hele tiden.

---

## Lærerbyttet målt på POENG: +2,85 per kamp, 96 % av gapet til nevro lukket

Dette er den direkte testen av dagens hovedfunn. E1 er destillert fra
DD-orakelet; `sd-r1` er destillert fra SD-orakelet. **Samme trener
(`verktoy/e1-tren.py`), samme arkitektur (384–256), samme kriterium
(val-anger), samme målebenk, samme motstander. Eneste forskjell er hvem som
merket dataene.**

Tall: `analyse/sd-laerer-oppsummering.txt`, `analyse/sd-r1-parret.txt`,
`analyse/sd-r1-poeng-pergiver.jsonl`, `analyse/sd-arkitekturer-poeng.txt`,
`e1-maalinger.jsonl`, `e1-frysmaal.jsonl`.

### Poeng, 2000 givere × 4 seter, parret på giver

| kandidat | lærer | poeng/kamp mot grådig | parret mot nevro | tegntest |
|---|---|---|---|---|
| nevro | – | **+75,40 ± 0,03** | – | – |
| **sd-r1** | **single dummy** | **+75,28 ± 0,03** | **−0,115 ± 0,026** | 908/1964 |
| e1-r2 | double dummy | +72,44 ± 0,04 | −2,964 ± 0,034 | 31/1998 |

**sd-r1 − e1-r2 = +2,849 ± 0,034, tegntest 1959/1995 (98,2 %).**

Å bytte lærer er verdt **+2,85 poeng per kamp** og lukker **96 % av gapet**
E1 hadde ned til NevroHjerne. Frøbåndet (33 mill.) ligger utenfor sd-data
(50–65 mill.), e1-data (≤15,3 mill.) og portene (8,1/8,6 mill.), så ingen
kandidat måles på givere den er trent på.

**Men sd-r1 slår ikke nevro.** Restgapet −0,115 ± 0,026 er 4,5 standardfeil
fra null, og sd-r1 vinner bare 46,2 % av giverne. Det er den ærlige dommen:
platået er brutt, benken er ikke.

### Læringen: samme mønster, lite nett vinner

619 223 SD-stillinger, 12 verdener, tidlig stopp på val-anger.

| arkitektur | parametre | beste val-anger |
|---|---|---|
| **384–256 (sd-r1)** | 217 140 | **0,9206** |
| 512–384–256 | 449 204 | 0,9210 |
| 256–256 | 149 300 | 0,9253 |
| 640–512–384 | 720 564 | 0,9312 |

Kapasitet er ikke flaskehalsen her heller. Det største nettet er det dårligste,
akkurat som i DD-kjøringen.

Alle fire ble målt på poeng i samme kjøring, samme 2000 givere:

| arkitektur | SD-anger på `sd-frys` | rang | poeng mot nevro | rang |
|---|---|---|---|---|
| sdk-640-512-384 | **0,8762** | 1 | **−0,18 ± 0,03** | 4 |
| sdk-512-384-256 | 0,9043 | 2 | −0,13 ± 0,03 | 3 |
| sdk-256-256 | 0,9048 | 3 | −0,12 ± 0,03 | 2 |
| **sd-r1 (384–256)** | 0,9360 | 4 | **−0,11 ± 0,03** | 1 |

**Rangeringen er nøyaktig motsatt** – sjette gang på to dager, og denne gangen
med den GODKJENTE SD-fasiten på et rent holdout. Forbeholdet må stå: begge
spennene er små (0,06 anger, 0,07 poeng), og en perfekt inversjon av fire
elementer har sannsynlighet 1/24 = 0,042 under nullhypotesen. Det er
suggestivt, ikke avgjort.

Det som ER avgjort: **SD-anger kan ikke velge mellom nære kandidater.** Samme
dom som DD-anger fikk, bare på et mye mindre spenn. Trenerens eget
valideringssett (halen av ett skard) rangerte nesten som poeng, `sd-frys`
rangerte motsatt – to angermålinger på samme fasit som er uenige med hverandre
betyr at ingen av dem har oppløsning nok her.

### Lekkasjekontrollen: ingen overlapp, i motsetning til e1-data3

| mappe | linjer | frø-område |
|---|---|---|
| e1-frys | 42 088 | 700 000 – 9 700 015 |
| sd-data | 619 223+ | 50 000 000 – 65 000 142 |

Frørommene er disjunkte, og nøkkelsettene er ulike (`dybde` mot `sdVerdener`),
så md5-signaturene kan ikke kollidere. `--utelat e1-frys` ble satt likevel;
treneren rapporterte «hoppet over 0». Holdouten er ren.

### Målestokkene: DD-benken lyver fortsatt, SD-benken får riktig fortegn

**DD-benken `e1-frys`, holdout n=21 044:**

| kandidat | anger | gulv | tak (nevro) | framdrift | poeng mot nevro |
|---|---|---|---|---|---|
| e1-r2 | **0,4768** | 0,9321 | 0,8167 | 394,6 % | **−2,96** |
| nevro | 0,8167 | 0,9321 | 0,8167 | 100,0 % | 0,00 |
| **sd-r1** | 0,8233 | 0,9321 | 0,8167 | 94,3 % | **−0,12** |
| sdk-512-384-256 | 0,8370 | 0,9321 | 0,8167 | 82,4 % | – |
| sdk-256-256 | 0,8672 | 0,9321 | 0,8167 | 56,3 % | – |

**Målestokkene er fortsatt MOTSATTE her.** DD-anger kårer e1-r2 med god margin
og setter sd-r1 marginalt under nevro (+0,0066 ± 0,0175, ikke til å skille fra
null) – mens poeng skiller de to med 2,85. DD-benken er ikke bare feil rangert;
den er også blind for en forskjell poeng ser tydelig.

**SD-benken `sd-frys`, holdout n=4 191.** `sd-frys` er linjer skårene skrev
ETTER at treneren leste ferdig, klippet ut av `sd-data` – usett av alle
kandidatene. Den lages slik (`analyse/sd-grense.txt` er `wc -l sd-data/*.jsonl`
tatt i det treneren var ferdig å lese; siste linje i hvert skard droppes fordi
den kan være halvskrevet):

```sh
mkdir -p sd-frys
while read f n; do
  [ "$f" = total ] && continue
  tail -n +$((n+1)) "$f" | head -n -1 > "sd-frys/$(basename "$f")"
done < analyse/sd-grense.txt
```

Skårene skriver videre, så benken vokser hver gang kommandoen kjøres. Tallene
her er tatt på 8 382 linjer (holdout-halvdelen 4 191).

| kandidat | anger | gulv | tak (nevro) | framdrift |
|---|---|---|---|---|
| sdk-512-384-256 | **0,9043** | 1,4463 | 1,0971 | 155,2 % |
| sdk-256-256 | 0,9048 | 1,4463 | 1,0971 | 155,1 % |
| sd-r1 | 0,9360 | 1,4463 | 1,0971 | 146,2 % |
| nevro | 1,0971 | 1,4463 | 1,0971 | 100,0 % |
| **e1-r2** | **1,2306** | 1,4463 | 1,0971 | 61,8 % |

**Fortegnet stemmer.** SD-benken setter e1-r2 UNDER nevro – der poeng også
setter den (−2,96) – og sd-r1 over. Det er første gang på to dager at fasit og
poeng peker samme vei på den store forskjellen.

Den er likevel ikke kalibrert: SD-anger sier sd-r1 er 0,15 bedre enn nevro,
poeng sier 0,115 dårligere. **Retningen er riktig, nivået er det ikke** – samme
forbehold som i SD-kortporten (pålitelighet 0,688).

### Per stikk: speilbildet av E1-profilen

Anger på `sd-frys`, hele settet (n=8 382), gulv og tak fra samme utvalg:

| stikk | n | sd-r1 | e1-r2 | nevro | gulv |
|---|---|---|---|---|---|
| 0 | 592 | **1,2953** | 1,6412 | 2,0133 | 1,9252 |
| 1 | 848 | 1,2213 | 1,3253 | **1,2608** | 1,7090 |
| 2 | 808 | **1,3424** | 1,4693 | 1,3649 | 1,8633 |
| 3 | 791 | **1,1107** | 1,4390 | 1,3564 | 1,7567 |
| 4 | 800 | **1,1941** | 1,2898 | 1,3081 | 1,7022 |
| 5 | 786 | **1,0962** | 1,4367 | 1,3000 | 1,7207 |
| 6 | 721 | **1,0377** | 1,5040 | 1,1963 | 1,6701 |
| 7 | 768 | **0,7562** | 1,3488 | 0,9124 | 1,3935 |
| 8 | 760 | **0,5407** | 1,1709 | 0,6120 | 1,1730 |
| 9 | 763 | **0,5391** | 0,7980 | 0,5505 | 0,9357 |
| 10 | 745 | **0,0808** | 0,3106 | 0,1358 | 0,2849 |

sd-r1 er bedre enn nevro i ti av elleve stikk. e1-r2 er dårligere i ti av
elleve. På DD-benken lå E1s forsprang i stikk 5–9 og forsvant tidlig; her er
sd-r1s største forsprang i stikk 0 (0,72 anger), altså nøyaktig der kampen
avgjøres.

Legg også merke til at **nevro ligger over gulvet i stikk 0 også på SD-benken**
(2,0133 mot 1,9252) – dårligere enn tilfeldig i åpningsstikket, uten at det
hindrer den i å lede på poeng. Samme fenomen som DD-benken viste i stikk 4, 6
og 7.

### Dommen

1. **Læreren var flaskehalsen.** Hypotesen fra portene holdt, målt på det
   eneste som teller: +2,85 ± 0,03 poeng av å bytte fasit, med alt annet likt.
2. **Platået er brutt, men benken er ikke slått.** sd-r1 ligger 0,115 ± 0,026
   under NevroHjerne, og alle fire arkitekturene ligger 0,11–0,18 under. Det
   er ikke null, og skal ikke rapporteres som seier.
3. **DD-anger skal ikke brukes til noe mer.** Den kårer fortsatt e1-r2 (−2,96
   poeng) foran sd-r1 (−0,12), og ser ikke en forskjell på 2,85 poeng i det
   hele tatt (+0,0066 ± 0,0175).
4. **SD-anger har riktig fortegn på det store, feil på det små.** Den skiller
   lærere riktig og arkitekturer motsatt. Bruk den som gradient og til å velge
   fasit; ikke til å velge kandidat. Der gjelder poengbenken, som før.
5. **Neste steg, som følger av tallene og ikke av ønsketenkning:** DAgger –
   runde to av dataene fra sd-r1s EGEN spilling (`--spiller`), siden restgapet
   kan være distribution shift; stillingene er nevros, og det er den kjente
   skjevheten `sd-orakel.ts` selv advarer om. Og flere verdener i stikk 0–2,
   der sd-r1 allerede har sitt største forsprang (0,72 anger).

---

## MesterAI målt for første gang – og en feilslutning jeg gjorde

`trening-felles/mesterai-referanse.json` fantes ikke før 25. juli 2026. Hele
prosjektet hadde brukt NevroHjerne som stedfortreder uten å vite gapet.

### Head-to-head, hele kamper til 100 poeng, speilede par

| kandidat | kamper | poeng/kamp mot MesterAI | SE | vunnet |
|---|---|---|---|---|
| **sd-r1** | 100 | **−39,10** | 7,38 | 27/100 |
| NevroHjerne | 91 | **−47,79** | 7,36 | 21/91 |
| PIMC | 16 | −67,69 | 11,0 | 0/16 |

**MesterAI er milevis foran alt vi har.** NevroHjerne taper med 48 poeng per
kamp, ikke med et par.

### Feilslutningen

Jeg leste først MesterAI-referansen (+76,9 mot grådig) mot NevroHjernes
+75,40 mot grådig og konkluderte at gapet var «rundt 1,6 poeng per kamp –
ikke titallene jeg fryktet».

**Det var feil, og feil i optimistisk retning.** De to tallene kommer fra
ulike måleoppsett: MesterAI-referansen er HELE KAMPER til 100 poeng, mens
+75,40 er en enkeltrunde-differanse over 2000 givere. Å sette dem i samme
tabell er nøyaktig samme feilklasse som gjorde D7-kurven verdiløs, som fikk
«ferske genom slår nevro» til å se riktig ut, og som skjulte 30 % av
E1-dataene: **riktig tall, feil akse.**

Fjerde gang på to dager. Regelen som følger av det: to tall som ikke er
produsert av samme måleoppsett skal ikke stå i samme kolonne, uansett hvor
sammenlignbare enhetene ser ut.

### Det som faktisk er godt nytt

Parret på samme frø og samme sete er **sd-r1 8,86 ± 7,82 poeng bedre enn
NevroHjerne mot MesterAI** (bedre i 49 av 92 kamper). Det er bare 1,1
standardfeil – altså ikke etablert – men fortegnet peker riktig vei mot en
motstander SD-metoden IKKE ble finstilt mot. Overføringstapet er dermed ikke
totalt, og det var den største kjente risikoen.

Flere kamper trengs før dette er noe annet enn et hint.

## MesterAI målt for første gang: grådigbenken er mettet, og gapet er 5,8x større enn den viser

`trening-felles/mesterai-referanse.json` fantes ikke før nå. MesterAI – appens
President-nivå, det spillet familien faktisk møter – hadde **aldri** vært målt
i dette repoet. NevroHjerne har vært stedfortreder for den i hver eneste
måling, uten at noen kjente avstanden mellom de to.

Tall: `analyse/mesterai-maaling.txt`, `analyse/h2h-nevro.jsonl`,
`analyse/h2h-sdr1.jsonl`, `analyse/h2h-pimc.jsonl`,
`analyse/mesterai-referanse.json`. Harness: `examples/mesterai-h2h.ts` +
`examples/mesterai-h2h-rapport.ts` (nye), `examples/mesterai-referanse.ts`
(fantes, aldri fullført før nå – loggen stoppet på kamp 28/32).

### Oppsettet

MesterAI kjøres som **appens egen Swift-kode** gjennom arena-adapteren
(`arena/adapter`, bygget i WSL). Vår motor er dommer: den deler ut, validerer
hver handling og fører poeng; adapteren speiler appens `GameEngine` og
verifiseres etter **hver** handling. 244 kamper, null avvik.

To ulike målinger, og forskjellen mellom dem er hele poenget:

| | oppsett | hva den svarer på |
|---|---|---|
| grådigbenken | 1 bot mot 3× grådig, kamp til 100 | slår kandidaten grådig? |
| hode mot hode | MesterAI 2 seter mot kandidat 2 seter, speilede par | hvem er best? |

### Grådigbenken, samme 12 givere (frø 777000+), 48 kamper hver

| kandidat | poeng/kamp mot grådig |
|---|---|
| **MesterAI** | **+76,9** (102,5 mot 25,6, seire 48/48) |
| sd-r1 | +75,45 ± 0,38 |
| NevroHjerne | +75,35 ± 0,41 |

Streken på dashbordet kommer herfra (`{diff: 76.9, kamper: 48}`).

### Hode mot hode, speilede par, 450 ms per kortvalg

MesterAI minus kandidaten; positivt = MesterAI best.

| kandidat | par | poeng/runde/sete | poeng/kamp (2 seter) | kampseire |
|---|---|---|---|---|
| **NevroHjerne** | 53 | **+1,068 ± 0,163** | +44,8 ± 6,6 | 79/106 |
| **sd-r1** | 57 | **+1,135 ± 0,177** | +41,6 ± 6,6 | 85/114 |
| PIMC | 10 | +2,355 ± 0,292 | +72,6 ± 8,5 | 20/20 |

### Hovedfunnet: benken vi har brukt kan ikke se toppen av feltet

En grådigbenk-kamp varer **8,4 runder** i snitt (målt over 240 kamper) – den
sterke boten er i mål på 100 lenge før 40-runders taket. Mot MesterAI varer en
kamp ~21 runder, fordi den er jevn. Regnet om til samme enhet:

| | per kamp/sete | per runde/sete |
|---|---|---|
| MesterAI − nevro, **grådigbenk** | +1,55 | +0,185 |
| MesterAI − nevro, **direkte** | +22,4 | **+1,068 ± 0,163** |

**Det direkte oppgjøret gir et gap 5,8× større enn grådigbenken gjør.** Ikke
fordi det ene er støy, men fordi de ikke måler det samme: mot tre grådige når
alle kandidatene 100 poeng nesten hver gang, og differansen lander på 75–77
uansett hvor mye sterkere den beste er. Benken har ikke oppløsning igjen på
toppen. Den kan si at en kandidat slår grådig; den kan ikke si hvor langt det
er opp til MesterAI.

#### Rettelse til forrige avsnitt: det var ikke feil akse, det var et tak

Avsnittet over (commit `698a5da`) forklarte det samme misforholdet med at
+76,9 og +75,40 kom fra «ulike måleoppsett», og at +75,40 var «en
enkeltrunde-differanse over 2000 givere». **Den diagnosen er feil.**

`examples/mesterai-referanse.ts` og `examples/neat-evaluer.ts` kjører identisk
protokoll: `opprettSpill({antallSpillere: 4}, frø)`, kamp til 100 poeng med tak
på 40 runder, setene rotert 0–3, og differansen `egne − snitt(de tre andre)`
per kamp. Kjører man `mesterai-referanse.ts` sitt EGET regnskap med
NevroHjerne i setet, på de samme frøene:

```
nevro 102,3 mot grådig 27,0  →  diff +75,4   (48 kamper, 8,5 runder/kamp)
MesterAI 102,5 mot grådig 25,6 →  diff +76,9  (48 kamper)
```

+75,4 reproduseres på desimalen. De to tallene ligger altså på **samme akse**,
og det var riktig å sette dem i samme kolonne.

Den ekte årsaken står i tallene over: begge kandidatene lander på ~102 poeng.
Kampen stopper når noen passerer 100, så metrikken er **klemt mot taket** –
den kan ikke vise et større gap enn ~2 poeng uansett hvor mye sterkere
MesterAI er. Det er metning, ikke enhetsforveksling.

Forskjellen betyr noe for hva man gjør videre: en aksefeil fikser man ved å
lese tabellen riktig, et tak fikser man bare ved å bytte målestokk. Regelen
fra forrige avsnitt («to tall fra ulike måleoppsett skal ikke stå i samme
kolonne») er god og står ved lag – den var bare ikke det som gikk galt her.
Regelen som faktisk følger: **når to kandidater begge ligger på taket i en
metrikk, måler den ikke lenger forskjellen mellom dem.**

Det er verdt å si rett ut: **NevroHjerne er ikke i nærheten av MesterAI.**
1,07 poeng per runde per sete er 6,6 standardfeil fra null, og MesterAI tar 75 %
av kampene. Hele forbedringsløkka har siktet på en målestokk som ligger langt
under det den trodde den etterliknet.

### Overføringstapet: avgrenset oppad, ikke oppløst

sd-r1 er trent med single-dummy-evaluering der **NevroHjerne er
motstandermodell i rolloutene**. Er metoden finstilt mot nevros spillestil,
skal den falle sammen mot MesterAI. sd-r1 minus nevro i ytelse (positivt =
sd-r1 best), parret på de samme 53 giverne:

| motstander | enhet | sd-r1 − nevro |
|---|---|---|
| 3× grådig (1000 givere) | poeng/runde/sete | **−0,0167 ± 0,0048** |
| MesterAI, per runde | poeng/runde/sete | −0,050 ± 0,214 |
| MesterAI, per kamp | poeng/kamp/sete | +2,05 ± 4,25 |

De to MesterAI-tallene er **ikke engang enige om fortegnet**. Det er ikke en
motsetning som skal bortforklares – det er slik en måling ser ut når støyen er
mange ganger effekten, og det er i seg selv beviset for at oppløsningen ikke
strekker til.

Punktanslaget per runde (−0,050) er 3× grådigbenkens (−0,0167), i samme
retning og litt større. Men SE er 0,214 – fire ganger effekten. 95 %-intervallet
spenner −0,47 til +0,37.

**Dommen:** målingen kan ikke skille «samme lille tap som mot grådig» fra «3×
større tap». Den utelukker bare at overføringstapet er STORT – mer enn ~0,47
poeng/runde/sete er utelukket, under halvparten av gapet nevro har opp til
MesterAI (1,07). Den største kjente risikoen i tilnærmingen er verken
bekreftet eller avkreftet; den er **avgrenset oppad**.

Å oppløse den ville krevd ~100 000 par (SE 0,005), altså flere tusen CPU-timer
med MesterAI i den andre enden. Fin rangering av to nære kandidater hører
derfor fortsatt hjemme på en billig benk med parrede givere. MesterAI-oppgjøret
sier hva vi sikter **mot**, ikke hvem av to nesten like nett som er best.

### Forbeholdet som er viktigst

MesterAIs søk stopper når `verdener >= maksVerdener`, **eller** når
`verdener >= minVerdener` og tidsbudsjettet er brukt opp (`MesterAI.swift`).
Maskinen kjørte 16 `sd-orakel` + 2 `e1-orakel` gjennom hele målingen
(kølengde 26–34 på 24 kjerner), så MesterAI rakk færre verdener per kortvalg
enn den ville gjort på en ledig maskin.

**Alle MesterAI-tallene her er derfor NEDRE anslag.** Nettene er upåvirket –
de bruker mikrosekunder uansett last – så skjevheten går bare én vei, i
MesterAIs disfavør. Det ekte gapet er større enn 1,07.

`examples/mesterai-h2h.ts --verdener N` låser `minVerdener = maksVerdener` og
setter fristen så høyt at den aldri kutter søket. Da er arbeidsmengden per
kortvalg uavhengig av last, og tallet blir reproduserbart på tvers av maskiner.
Bruk det når målingen skal være en varig målestokk.

### Dommen

1. **MesterAI er målt.** +76,9 mot grådig; +1,068 ± 0,163 poeng/runde/sete mot
   NevroHjerne direkte. Dashbordet kan endelig tegne streken.
2. **Grådigbenken er mettet og undervurderer gapet 5,8×.** Den skal fortsatt
   brukes til å rangere nære kandidater billig, men aldri til å svare på «hvor
   langt er det opp til MesterAI».
3. **NevroHjerne er en dårlig stedfortreder for MesterAI.** Å nå nevro er ikke
   å nå appen. Delmålet «slå NevroHjerne» er et mellomsteg, ikke målstreken.
4. **Overføringstapet er ikke målt ferdig** – bare avgrenset oppad. Det er
   fortsatt den største kjente risikoen i SD-tilnærmingen.
5. **Neste steg som følger av tallene:** kjør h2h på nytt med `--verdener 36`
   på en ledig maskin for et lastuavhengig tall, og bruk MesterAI som
   motstandermodell i SD-rolloutene hvis overføringstapet skal fjernes ved
   roten i stedet for måles.

---

## DAgger-runde 2: sd-r2 SLÅR NevroHjerne – første gang i prosjektet

Hypotesen fra forrige avsnitt er testet direkte. sd-r1 er trent på stillinger
**nevro** spilte; når den spiller selv møter den andre stillinger. Runde 2 av
dataene er hentet fra sd-r1s EGEN spilling (`--spiller e1-modell/sd-r1.bin`,
frøbånd 80 mill., 16 skår), som er kuren `sd-orakel.ts` selv peker på.

**Den hjalp. +0,49 poeng per kamp, og NevroHjerne er passert.**

Skript: `verktoy/sd-tren.py` (ny), `examples/sd-parret-rapport.ts` (ny).
Tall: `analyse/sd-r2-oppsummering.txt`, `analyse/sd-r2-kurver.txt`,
`analyse/sd-r2-lekkasje.txt`, `analyse/sd-r2-poeng.{txt,json}`,
`analyse/sd-r2-bekreft.{txt,json}`, `analyse/sd-r2-tren.jsonl`,
`e1-maalinger.jsonl`, `e1-frysmaal.jsonl`.

### Poeng, 2000 givere × 4 seter, parret på giver – og bekreftet på et nytt bånd

| kandidat | data | arkitektur | mot nevro (frø 33M) | mot nevro (frø 34M) |
|---|---|---|---|---|
| sd-r1 | sd-data | 384–256 | −0,1150 ± 0,0257 | −0,1164 ± 0,0253 |
| sd-r2-d2-384 | sd-data2 | 384–256 | +0,0615 ± 0,0255 | – |
| sd-r2-d2-192 | sd-data2 | 192–128 | +0,1150 ± 0,0257 | – |
| sd-r2-d2-256 | sd-data2 | 256–256 | +0,1619 ± 0,0254 | – |
| sd-r2-begge-384 | begge | 384–256 | +0,2795 ± 0,0248 | +0,2858 ± 0,0242 |
| sd-r2-begge-256 | begge | 256–256 | +0,3456 ± 0,0245 | +0,3513 ± 0,0241 |
| **sd-r2-begge-512** | **begge** | **512–384–256** | **+0,3725 ± 0,0246** | **+0,3711 ± 0,0239** |

De fire kandidatene som ble målt på begge bånd reproduseres innenfor **0,007
poeng**, med samme rekkefølge. Vinneren ble plukket blant seks på det første
båndet, så bekreftelsen på ferske givere er ikke pynt – den er kontrollen mot
å ha valgt støy.

**DAgger-gevinsten:** `sd-r2 − sd-r1 = +0,4875 ± 0,0215` (tegntest 1411/1961)
på 33M og `+0,4875 ± 0,0214` (1426/1952) på 34M. Identisk til fjerde desimal
på to uavhengige frøbånd.

sd-r1s eget tall reproduseres på siste siffer mot målingen 25. juli
(−0,1150 ± 0,0257, tegntest 908/1964). Det er kontrollen på at den nye,
shardede måleveien via `sd-parret-rapport.ts` gir samme svar som den gamle.

### Behold de tidligere rundene – målt, ikke antatt

| parret, samme givere | differanse |
|---|---|
| begge − bare sd-data2, 384–256 | **+0,2180 ± 0,0212** |
| begge − bare sd-data2, 256–256 | **+0,1837 ± 0,0199** |

DAgger-litteraturen sier at man skal beholde runde 1. Her er det målt: 9–10
standardfeil. Og det er ikke bare datamengde – sd-data2 alene er 1,73 mill.
stillinger mot sd-r1s 619 000, altså 2,8× så mye data, og lander likevel på
+0,06 til +0,16. Det er **blandingen** som gir resten.

### Arkitektur: ingen vinner innenfor støyen, og «minst vinner» replikerer ikke

| | 33M | 34M | vektet |
|---|---|---|---|
| begge-512 − begge-256 | +0,0269 ± 0,0182 | +0,0198 ± 0,0187 | **+0,023 ± 0,013** |

1,8 SE – ikke etablert. Begge slår 384–256 med 4 SE, men effekten er
**ikke monoton i størrelse** (256 og 512 slår 384), og en ikke-monoton effekt
over tre størrelser er kjørevariasjon, ikke kapasitet. Mønsteret «det minste
nettet vinner» fra begge de foregående kjøringene holder innenfor
sd-data2-blandingen, men brytes i den blandede. `sd-r2` er satt til
`begge-512` fordi poeng avgjør; valget er ikke bærende.

### Overtilpasningskontrollen: holdout delt på GIV

`verktoy/e1-tren.py` tar de siste 5 % av LINJENE. To stillinger fra samme parti
deler alle fire hender, hele budrunden og hele kontrakten – en stillingsdeling
lekker på giv-nivå. `verktoy/sd-tren.py` hasher `frø` og legger hele partier i
én del; invarianten «ingen giv i to deler» **avbryter kjøringen** hvis den
brytes. Holdouten er trukket bare fra sd-data2, som sd-r1 aldri har sett, så
nøyaktig samme utvalg er rent for både sd-r1 og sd-r2.

Treneren leser dessuten strømmende inn i ferdigallokerte numpy-array: 3,1 mill.
stillinger som Python-lister ville vært ~27 GB, som numpy er de 4,7. Og alle
seks kjøringene deler ÉN innlesing, så to konfigurasjoner ikke kan komme til å
se ulike holdouts.

### Kurvene skiller lag fra epoke 2 – og de to kriteriene er uenige

Hele tabellen står i `analyse/sd-r2-kurver.txt`.

| kjøring | hold-tap bunner | hold-anger bunner | gap ved slutt |
|---|---|---|---|
| sd-r2-d2-384 | epoke 2 | epoke 8 | +0,0451 (ep 14) |
| sd-r2-d2-256 | epoke 1 | epoke 8 | +0,0315 (ep 14) |
| sd-r2-d2-192 | epoke 4 | epoke 9 | +0,0221 (ep 15) |
| sd-r2-begge-384 | epoke 2 | epoke 6 | +0,0258 (ep 12) |
| sd-r2-begge-256 | epoke 1 | epoke 7 | +0,0209 (ep 13) |
| sd-r2-begge-512 | epoke 3 | epoke 4 | +0,0309 (ep 10) |

Tre ting det beste tallet alene ikke ville sagt:

1. **Gapet vokser monotont fra epoke 2 i alle seks.** Overtilpasningen er i
   gang lenge før treningen stoppes.
2. **Hold-tapet bunner 4–6 epoker FØR hold-angeren.** De to kriteriene er ikke
   enige om når nettet er best. Sjekkpunktet velges på anger for å være
   sammenlignbart med sd-r1, men hvilket av dem som gir best POENG er ikke
   målt – og det er en åpen mulighet, ikke en avklart sak.
3. **Gapet vokser raskere med mindre data og med større nett**, begge deler i
   forventet retning: d2-384 når +0,045 på 14 epoker der begge-384 ligger på
   +0,026 på 12; begge-512 når +0,031 på 10 der begge-256 ligger på +0,016.

### Overlappet, rapportert også der det er null

| par | felles givere | felles linjer |
|---|---|---|
| sd-data ∩ sd-data2 | 0 | 0 |
| sd-data ∩ e1-frys | 0 | 0 |
| sd-data2 ∩ e1-frys | 0 | 0 |
| sd-data2 ∩ sd-frys | 0 | 0 |
| **sd-data ∩ sd-frys** | **48** | **8 382** |

Frøbåndene: e1-frys 0,7–9,7 mill., sd-data 50–65 mill., sd-data2 80–95 mill.,
målingene 33 og 34 mill. Disjunkte, og nøkkelsettene er dessuten ulike
(`dybde` mot `sdVerdener`), så md5-signaturene kan ikke kollidere.

**Den ene raden som ikke er null gjelder den gamle benken.** `sd-frys` er per
konstruksjon en delmengde av sd-data, og kontrollen mot `analyse/sd-grense.txt`
viser at **16 av dens 48 givere lå i sd-r1s treningssett** – ett frø per skard,
nøyaktig partiet som lå på lesegrensen. Linjene var nye, givene var det ikke.

To konsekvenser, begge i `analyse/sd-r2-lekkasje.txt`:

- Finrangeringen av nære kandidater på `sd-frys` i avsnittet over er ikke et
  rent holdout-tall. Det store funnet (sd-r1 langt foran e1-r2) tåler det;
  arkitekturrangeringen gjør det ikke.
- `sd-frys` har **48 uavhengige enheter**, ikke 8 382. «n = 4 191» leser langt
  flere frihetsgrader inn i benken enn den har, og det er en like viktig del av
  forklaringen på at SD-anger ikke kunne rangere de fire arkitekturene som
  lekkasjen er.

### For første gang på tre dager peker fasit og poeng samme vei

`examples/e1-frysmaal.ts --mappe sd-frys2`, 87 964 stillinger fra 335 partier
ingen kandidat har sett, gulv og tak fra samme utvalg.

| kandidat | anger | gulv | tak (nevro) | framdrift | poeng mot nevro |
|---|---|---|---|---|---|
| sd-r2-begge-256 | **0,8139** | 1,3809 | 1,0273 | 160,4 % | +0,346 |
| sd-r2-begge-512 | 0,8151 | 1,3809 | 1,0273 | 160,0 % | **+0,373** |
| sd-r2-begge-384 | 0,8159 | 1,3809 | 1,0273 | 159,8 % | +0,280 |
| sd-r2-d2-192 | 0,8400 | 1,3809 | 1,0273 | 153,0 % | +0,115 |
| sd-r2-d2-256 | 0,8410 | 1,3809 | 1,0273 | 152,7 % | +0,162 |
| sd-r2-d2-384 | 0,8425 | 1,3809 | 1,0273 | 152,3 % | +0,061 |
| sd-r1 | 0,9174 | 1,3809 | 1,0273 | 131,1 % | −0,115 |
| nevro | 1,0273 | 1,3809 | 1,0273 | 100,0 % | 0,000 |
| e1-r2 (DD-lærer) | 1,2211 | 1,3809 | 1,0273 | 45,2 % | −2,96 |

Spearman mellom anger og poeng over de seks sd-r2-nettene: **+0,886**. De to
eneste ombyttingene er nøyaktig de to parene som ikke er til å skille fra
hverandre på poeng. Seks ganger på to dager har de to målestokkene rangert par
motsatt; på en giv-delt holdout fra den fordelingen nettene faktisk møter, gjør
de det ikke.

**Men oppløsningen er fortsatt for grov for nære kandidater.** Halveres den
samme benken (`--del holdout`, n = 43 982, samme 335 partier), bytter d2-384 og
d2-256 plass – 0,8366 mot 0,8482, motsatt av på hele benken. Mikserforskjellen
(0,814 mot 0,841) er stabil i begge halvdeler. Presist sagt: **SD-anger på en
giv-delt holdout skiller DATABLANDINGER, ikke ARKITEKTURER.**

Kryssjekk verdt å notere: treneren (Python) og `e1-frysmaal.ts` (TypeScript)
regner samme anger på samme stillinger til fjerde desimal. To uavhengige
implementasjoner, samme tall.

### Dommen

1. **DAgger hjalp.** +0,49 ± 0,02 poeng per kamp, reprodusert på to uavhengige
   frøbånd. Fordelingsskiftet var en ekte del av restgapet.
2. **NevroHjerne er slått.** +0,371 ± 0,024, 15,5 SE, 67 % av giverne. Første
   gang i prosjektet et trent nett ligger over appens eget nett på
   poengbenken. Delmålet er nådd – men det er NevroHjerne, ikke MesterAI, og
   nevro taper selv 1,07 poeng/runde/sete til den.
3. **Behold de tidligere DAgger-rundene.** +0,18 til +0,22 poeng.
4. **Arkitektur er ikke flaskehalsen, fjerde gang.** Spennet mellom 84 000 og
   449 000 parametre er 0,09 poeng; mellom datablandingene 0,22; mellom
   DAgger-rundene 0,49.
5. **Restgapet er ikke uttømt.** Kurvene skiller lag fra epoke 2, og hold-tapet
   bunner før hold-angeren. Regularisering og valg av sjekkpunktkriterium er
   ikke prøvd, og runde 3 fra sd-r2s egen spilling er den neste åpenbare.

### sd-r2 mot MesterAI: gapet nesten halvert, men ikke etablert

`examples/mesterai-h2h.ts`, 36 speilede par per kandidat (72 kamper, ~1 400
runder hver), 450 ms per kortvalg, frøbase 550 000 – de samme parene som
nevro og sd-r1 ble målt på 25. juli. Tall: `analyse/mesterai-sd-r2.txt`,
`analyse/h2h-sdr2-b.jsonl`, `analyse/h2h-sdr1-b.jsonl`.

**sd-r1 er målt om igjen i SAMME kjøring**, ikke lånt fra i går. Grunnen står i
avsnittet over: MesterAIs søk er tidsbudsjettert, så styrken avhenger av hvor
travel maskinen er. To tall fra to ulike lastsituasjoner kan ikke settes mot
hverandre. Her kjørte begge kandidatene samtidig, med de samme 12 h2h-
prosessene og den samme bakgrunnslasten, så den parrede differansen er
lastmatchet.

| kandidat | par | MesterAI − kandidat, poeng/runde/sete | poeng/kamp | MesterAIs kampseire |
|---|---|---|---|---|
| **sd-r2** | 36 | **+0,536 ± 0,212** | +17,4 ± 8,0 | 46/72 (64 %) |
| sd-r1 | 36 | +0,956 ± 0,213 | +38,9 ± 8,7 | 55/72 (76 %) |
| *nevro (25. juli, annen last)* | *53* | *+1,068 ± 0,163* | *+44,8 ± 6,6* | *79/106 (75 %)* |

Parret på de samme 36 parene:

| | sd-r2 − sd-r1 |
|---|---|
| poeng/runde/sete | **−0,420 ± 0,284** (1,5 SE) |
| poeng/kamp | **−21,5 ± 10,9** (2,0 SE) |

Negativt betyr at sd-r2 taper MINDRE. Retningen er den samme som på
nevro-benken, og størrelsen er stor – gapet opp til MesterAI faller fra 0,96
til 0,54 poeng per runde per sete – men **1,5 SE er ikke etablert**, og de to
enhetene er ikke helt enige (1,5 mot 2,0 SE). Det er nøyaktig samme situasjon
som da sd-r1 skulle skilles fra nevro mot MesterAI: støyen er flere ganger
effekten, og oppløsningen holder ikke.

Det som ER verdt å merke seg: **den doblede måleusikkerheten peker samme vei
som den skarpe målingen.** På nevro-benken er sd-r2 − sd-r1 = +0,4875 ± 0,0215,
altså 23 SE. Mot MesterAI er punktanslaget +0,42 per runde per sete i samme
retning. Overføringstapet, som var den største kjente risikoen i
SD-tilnærmingen, ser altså ikke ut til å spise gevinsten – men det er fortsatt
avgrenset, ikke oppløst.

Forbeholdet fra forrige avsnitt gjelder uendret: maskinen kjørte 12
h2h-prosesser, 2 e1-orakel og 2 atferdsmålinger gjennom hele kjøringen, så
MesterAI rakk færre verdener per kortvalg enn på en ledig maskin. **Begge
absolutte tall er nedre anslag på MesterAIs styrke.** Den parrede differansen
er upåvirket, siden begge kandidatene møtte den samme MesterAI-en.

---

## Atferd mot MesterAI: to konkrete hull, begge store

**Ferdig kjøring: 320 kontrakter** (`analyse/mesterai-atferd2.txt`, 75,5 min,
450 ms per kortvalg). Tallene under erstatter delrapporten på 230 kontrakter
som ble committet mens kjøringen fortsatt gikk – retningen er den samme, men
`etterlyst tar stikket` for sd-r1 landet på 47 % og ikke 43 %.

Alle tre kandidatene svarer på NØYAKTIG samme stillinger. MesterAI driver
spillet; kandidatene svarer uten å utføre noe. Rader med n < 50 er merket `*`
i rapporten og skal ikke leses som funn.

### 1. Åpningsutspillet – konvensjonen er brutt, og den er brutt akkurat der

Arvind beskrev konvensjonen: har du etterlyst et kort, åpner du med en **lav
trumf**. Det etterlyste kortet er den høyeste trumfen du ikke selv har, så det
står. Makkeren må legge det (makkerplikten) og tar stikket – du har avslørt
makkeren uten å bruke opp én eneste egen honnør.

| stikk 1, som spillefører (n = 320) | MesterAI | sd-r1 | nevro |
|---|---|---|---|
| valør på utspillet | 7,38 | **9,47** | 5,67 |
| lav trumf (≤ 7) | 48 % | **40 %** | 70 % |
| spilte ut sin HØYESTE trumf | 18 % | **44 %** | 11 % |
| spilte ut sin LAVESTE trumf | 23 % | 21 % | 41 % |
| **etterlyst tar stikket** | **93 %** | **47 %** | **99 %** |

Motoren tvinger trumfutspill i stikk 1 for budvinneren som har trumf, så
«trumf ut» er 100 % for alle tre – det eneste som skiller dem er valøren.

**sd-r1 åpner med sin høyeste trumf i 44 % av kontraktene og river ned
konvensjonen: det etterlyste kortet tar stikket i bare 47 % av tilfellene, mot
NevroHjernes 99 %.** |z| = 14,9. Det er en REGRESJON – nevro gjør det riktig,
SD-treningen brøt det.

Merk hva MesterAI faktisk gjør: den spiller ikke sin laveste trumf (bare
23 %), men den spiller nesten alltid *under det etterlyste kortet* (93 %).
Konvensjonen handler altså ikke om å legge lavest mulig, men om å legge under
makkerens kort. Nevro er strengere enn MesterAI her, ikke bedre.

**Er det en åpningskonvensjon eller generell stil?** Stikk 2 og 3 svarer:

| stikk 3, som spillefører (n = 171) | MesterAI | sd-r1 | nevro |
|---|---|---|---|
| trumf ut (fritt valg her) | 33 % | 51 % | 37 % |
| valør på utspillet | 9,96 | 9,18 | 10,10 |
| høyeste trumf på hånd | 24 % | 29 % | 28 % |

I stikk 3 er sd-r1s «høyeste trumf ut» 29 % mot MesterAIs 24 % – innenfor
støy. **Defekten sitter i åpningen, ikke i stilen.** (Stikk 2 har bare n = 22
og er merket usikker: det etterlyste kortet tar stikk 1 i 93 % av rundene, så
det er makkeren og ikke spilleføreren som spiller ut i stikk 2.)

Sannsynlig mekanisme: SD-evalueringen maksimerer forventet utfall over
samplede verdener per beslutning. Å ta stikket selv med en høy trumf ser
lokalt bra ut; verdien av å avsløre makkeren billig er strukturell og ligger
utenfor det ett kortvalg måler. **Læreren er nærsynt om konvensjoner.**

### 2. Garanterte stikk – Arvinds presisering var riktig, og hullet består

Arvind påpekte at å slå medspillerens stikk ikke er dumt i seg selv –
seterekkefølgen betyr noe, spillere etter deg kan fortsatt overta – men at man
skal legge billigste kort når stikket alt er garantert. Målingen er delt
deretter, og delingen henger bare på stillingen, så nevnerne er identiske i
alle tre kolonnene.

| som spillefører, medspiller leder | MesterAI | sd-r1 | nevro | n |
|---|---|---|---|---|
| **garantert:** slo stikket | **26 %** | **75 %** | 63 % | 362 |
| **garantert:** la ikke billigste kort | 41 % | **66 %** | 64 % | 362 |
| **garantert:** brente trumf | **2 %** | **34 %** | 27 % | 362 |
| **garantert:** la honnør (≥13) | 10 % | 23 % | 24 % | 362 |
| garantert **og synlig for spilleren:** slo det | 28 % | 76 % | 65 % | 291 |
| *ikke* garantert: slo stikket | 82 % | 86 % | 87 % | 261 |

**Presiseringen var riktig, og den flytter hele funnet.** I stillinger der
stikket ikke er garantert ligger alle tre likt: 82 / 86 / 87 %, |z| = 1,3 for
sd-r1 – ren støy. Det var altså feil av meg å kalle «slo medspillerens stikk»
(80 % mot 49 %) et hull uten å dele det opp: *hele* forskjellen ligger i de
garanterte stillingene, ingen av den i de åpne.

Men der består hullet, og det er større enn det så ut: sd-r1 slår stikket i
75 % mot MesterAIs 26 % (|z| = 15,2). Omregnet til materiale per runde:

| som spillefører, per runde | MesterAI | sd-r1 | nevro |
|---|---|---|---|
| trumf brent på et stikk som alt var vårt | **0,03** | **0,39** | 0,30 |
| valør gitt bort over det billigste lovlige | 1,49 | 2,46 | 2,37 |

sd-r1 brenner **én unødvendig trumf hver 2,6. runde**; MesterAI én hver 33.
Det er den skarpeste enkeltraden i hele profilen, for den har ingen unnskyldning.

Én nyanse som holder tallet ærlig: å ta et garantert stikk gir deg *utspillet*,
og for spilleføreren er det en reell gevinst. Det er derfor MesterAI selv
ligger på 41 % «ikke billigste kort» – den kjøper utspillet med et sidekort den
ikke trenger. Men den betaler nesten aldri med trumf. Skillet mellom 41 % og
66 % er diskutabelt; skillet mellom 2 % og 34 % er det ikke.

Hullet er dessuten **seteavhengig**: som makker er avviket 9 % mot 13 %, som
forsvarer 17 % mot 23 %. Det er spilleførersetet som lekker.

### Hvordan «garantert» avgjøres, og hva som ikke lot seg klassifisere

To nivåer, nøstet:

- **fasit** – motorens fulle informasjon: ingen gjenstående motstander har et
  *lovlig* kort som slår det som ligger. Eksakt; 0 uklassifiserte stillinger.
- **synlig for spilleren** – bare egen hånd, alt som er spilt, eget vrak og
  renonser avslørt i tidligere stikk. Alt annet antas å kunne ligge hos en
  motstander (også vrakets fire kort, for alle andre enn budvinneren).

Som spillefører: 623 stillinger med medspiller i lederrollen, 362 garanterte i
fasit, 291 av dem synlige for spilleren, **71 «skjult garanti»** – stikk som
*var* sikret uten at spilleren hadde grunnlag for å se det. I dem er overtak
ikke en feil. Tallene endrer seg knapt når man begrenser seg til de synlige
(76 % mot 75 % for sd-r1), så funnet står uten å måtte påberope seg fasit.
