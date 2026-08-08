# AdamsMax

**Hva Adams skal kunne gjøre, og hvordan vi vet at han gjør det.**

Arvind: «jeg stiller ikke krav til hvordan du gjør det men til hva som skal være
resultatet.»

Derfor er denne fila organisert rundt **evner**, ikke rundt metode. Hvert krav er
hans ord. Under hvert står én ting: **prøven** — den målingen som avgjør om
kravet er innfridd. Et krav uten en prøve er en mening, og en prøve som ikke kan
feile er ikke en prøve.

Arbeidsmetodene mine ligger i vedlegget til slutt, der de hører hjemme.

---

## K1 — Spille bedre enn mennesker og aldri tape i lange løp

> «spille bedre enn mennesker og aldri tape i lange løp»

**Prøven.** Kampbenken (`examples/kamp.ts`), kamper til 100 poeng, en
menneske-ekvivalent motstander i tre seter. Andelen kamper motstanderen vinner
mot Adams skal være **under 5,0 %**, replikert i disjunkte frøbånd.
Kontrollarmen (fire like agenter) må måle 0,2500.

*Hvorfor kampbenken og ikke rundedifferanse:* «aldri tape i lange løp» er et
utsagn om KAMPER. Rundepoeng er en proxy, og proxyen har en dårlig
vekslingskurs — se under.

| motstander | vinnerandel mot Adams |
|---|---|
| NevroHjerne | 3,65 % |
| sd-r2 | 6,77 % |
| ftf1 | 7,29 % |
| **familien (19 ekte kamper)** | **15,8 %** |
| **der vi står (v5)** | **15,83 %** |
| **KRAVET** | **< 5,0 %** |

**Status: ikke innfridd. 10,8 prosentpoeng igjen.**

Vekslingskursen er målt og flater ut: `+0,127 poeng/runde → −4,79 pp`, men
`+0,3 → −2,88 pp`. Å komme dit er et generasjonssprang, ikke en finjustering.

*Nådd underveis:* NevroHjerne slått. MesterAI slått (+0,14 poeng/runde over
879 runder) — men smalt, og med en stakk uten søkelag mot en MesterAI som søker
i alle fire seter.

---

## K2 — Aldri jukse

> «aldri jukse»

**Prøven.** Dette er det eneste kravet som kan avgjøres HELT, uten statistikk:

> Konstruér to spilltilstander som er **identiske i alt Adams lovlig kan se**
> (egen hånd, bordet, historikken, budrunden) men **ulike i de skjulte
> kortene**. Adams må velge nøyaktig samme kort i begge. Over tusenvis av
> stillinger. **Ett eneste avvik er juks.**

Ingen statistikk, ingen frøbånd, ingen tolkning. Enten er valget invariant
under skjult informasjon, eller så er det ikke.

**Status: BEVIST.** `test/k2-aldri-jukse.test.ts`, 8 giv × 3 stillinger × 3
forenlige verdener: **null avvik.**

Og prøven er vist å kunne feile — det er den viktigste halvdelen. En jukser
(`juks:6`, som ser de virkelige hendene) ble tatt med **6 avvik av 9**. Uten
den halvdelen ville den grønne testen betydd «måler ingenting» like gjerne som
«ærlig».

*Grensen på beviset, sagt høyt:* de alternative verdenene lages av VÅR EGEN
sampler. Beviset sier «Adams bruker ikke informasjon utover det samplerens
forenlighetsbegrep tillater». Er samplerens begrep feil, arver prøven feilen.

**Og den grensen bet med én gang.** K3-agenten fant at `medVerden` byttet
hendene men lot `state.talong` stå — 100 % av verdenene hadde duplikatkort, og
budvinneren fikk de EKTE byttekortene i hver rollout. Aktivt i `ADAMS_V7`, som
kjører `sok…b0.5`.

**K2-prøven kunne ikke se det:** den prøver kortvalg fra stikk 7, der talongen
for lengst er tatt opp. Lærdommen er generell — *en invariansprøve dekker bare
de fasene den faktisk besøker.* Rettet og voktet av
`test/talonglekkasje.test.ts`, verifisert ved å gjeninnføre lekkasjen.

Risikoen var reell og konkret: `medVerden`, `spillerVisning` og
verdenstrekningen håndterer skjulte kort hver eneste beslutning. En lekkasje
der ville ikke krasjet — den ville bare gjort Adams uforklarlig god, og hvert
tall i fila her verdiløst. Nå er den utelukket.

---

## K3 — Spille optimalt med SOTA-komponenter i alle faser

> «spille optimalt med SOTA komponenter i alle faser og deler av spillet»

**Prøven.** For hver fase: (a) beslutningen tas av et **søk eller en løser**,
ikke av en håndskrevet regel, og (b) gapet til fasens tak er målt.

| fase | komponent | gap til taket |
|---|---|---|
| Budrunde | GBT (μ, σ) + budsøk A4 | **41,8 % av alt som er å hente** |
| Vrak | lært vrakrangerer | målt |
| Trumfvalg | vrakvelger | målt |
| Utspill stikk 1 | konvensjonsvakt + søk | §73: regelen målte null |
| Midtspill | alpha-mu, alle roller | måles nå |
| Sluttspill | eksakt løser | 0,3 % av taket — **lukket** |

**Status: delvis.** Budrunden er det store hullet — og det eneste vinduet stort
nok til å nå K1. Tre forsøk der har målt null (terskelen er optimal;
auksjonskorreksjonen replikerte ikke).

> «fokuser på å gjøre spillet hans optimalt så BAM legger vi på en siste
> budmodell som gir max poeng»

Rekkefølgen er hans, og den er riktig: budmodellen skal legges på et spill som
allerede er optimalt, ikke brukes til å dekke over at det ikke er det.

---

## K4 — Hukommelse over hele spillet, og planlegge framover

> «ha hukommelse over hele spill, og evnen til å planlegge framover»

**Prøve A — hukommelsen.** Spill samme runde to ganger: én gang som runde 1 i en
kamp, én gang som runde 8 etter sju spilte runder mot de samme motstanderne.
Valgene må **avvike**. Gjør de ikke det, er hukommelsen dekorasjon.

**Prøve B — framoverblikket.** Alpha-mu med `M ≥ 2` søker over egne FRAMTIDIGE
valg. Gevinsten ved M=2 mot M=1 må være målt og positiv.

**Status: ubevist, og benken har skylden.** Gate 2 lager friske agenter per giv
og stopper etter én runde, så hukommelsen får aldri mer enn én runde å huske.
Kravet krever kampbenken. M står på 1 i V7 fordi M=2 koster 5,3×.

---

## K5 — Forstå konteksten i spillet og tilpasse seg

> «forstå konteksten i spillet og tilpasse seg»

**Prøven.** Samme kort, samme stikk, **ulik kampstilling** (20 poeng bak mot 20
foran ved 70–90). Adams må velge ulikt. Å ligge under skal gi mer risiko, å lede
mindre.

**Status: MÅLT, og halve knotten var død.**

`test/k5-kontekst.test.ts` målte det for første gang: 4 av 20 valg endrer seg
med kampstillingen, kontrollarmen på eksakt 0. Men med stillingen holdt fast:

| stilling | endrede valg |
|---|---|
| **bak** 70–90 | **0 av 20** |
| foran 90–70 | 4 av 20 |

Årsaken var strukturell. `snitt + λ·press·spredning` kan bare velte et valg med
et NEGATIVT ledd — grenen med høyest snitt har som regel også størst spredning.
Kravet «å ligge under skal gi mer risiko» var altså aldri demonstrert.

**Fikset:** formen er nå en kvantilblanding over alpha-muens fulle
utfallsvektor. Låst som enhetstest: den TRYGGE grenen har høyest snitt (2,0 mot
1,6), og likevel velges den risikable når vi ligger bak. λ hevet 0,4 → 1,5,
siden den nye formen vekter |λ·press| i stedet for et additivt ledd.

**Gjenstår:** en ny atferdsmåling med den rettede formen. Retningen er bevist i
enhetstest, ikke i spill.

```ts
const framdrift = Math.min(1, Math.max(egne, beste) / mål);
if (framdrift < 0.3) return 0;
```

Hver gate2-giv starter på 0–0, så `framdrift = 0` og **racepresset returnerer
eksakt null i hver eneste måling prosjektet har gjort.** Parameteren `r0.4` har
aldri gjort noe i noe tall vi har sett på.

---

## K6 — Lære andre spilleres vaner underveis og utnytte dem

> «lære seg andre spillere sine vaner ila spillet og tilpasse seg og utnytte de»

**Prøven.** Sett Adams mot en **stilisert** motstander med en utnyttbar vane
(alltid aggressiv i budrunden, eller alltid trekker trumf). Over en kamp skal:

1. Adams tjene mer mot den stiliserte enn mot en nøytral motstander, og
2. **gevinsten vokse med rundenummeret** — det er signaturen på læring, ikke på
   at motstanderen bare er dårlig.

Punkt 2 er det som skiller «utnytter» fra «møter en svakere motpart».

**Status: MÅLT, ikke innfridd — og tre brudd funnet.**

| | okt-matet | uten læring |
|---|---|---|
| gevinst mot stilisert vs nøytral | +7,26 ± 1,53 | **+4,74 ± 1,52** |
| vekst med rundenummer | +0,71 ± 3,12 (z = 0,23) | −4,08 ± 3,13 |

Punkt 1 er «innfridd» men beviser ingenting: gevinsten er nesten like stor uten
læring. Det er «motparten er dårligere», ikke «vi utnytter ham». Punkt 2 er ikke
innfridd.

**Tre uavhengige brudd gjorde øktminnet eksakt null i den utrullede Adams:**

1. `vr:` kuttet kontekstkjeden — økten ble laget og kastet. Sju `lagIndre`-kall
   droppet `ctx`.
2. Kampbenken fylte aldri profilboka — `Profilbok.observer` bokfører bare på
   `RUNDE_SLUTT`, og `kamp.ts` spør aldri en agent der. Målt 25/24/24/27
   bokførte runder med tikk, 0/0/0/0 uten.
3. `MIN_RUNDER` telte **bud, ikke runder** — med budandel ~0,33 inntraff
   terskelen rundt runde tolv, altså når kampen er over.

Alle tre er rettet. **Målingen over ble gjort før fiksene og må kjøres om.**

*Begrensning du selv satte:* «det skal bare lære per økt for nå.» Ingen
kryssøkt-lagring. Håndhevet i test: `okt.ts` har ingen `fs`, `localStorage`
eller `fetch`.

---

## K7 — Matematisk optimale løsninger i sluttspillet

> «finne matematiske optimale løsninger i sluttspillet (kombineres med å
> planlegge frem i tid)»

**Prøven.** I stillinger der en eksakt løsning finnes, må Adams velge den —
**100 % samsvar**, ikke 95 %. Og løsningen må mates inn i søket over det, slik
at planen fram dit vet hva sluttspillet er verdt.

**Status: innfridd for selve sluttspillet, og det er målt.**

| | |
|---|---|
| siste stikk | eksakt **0,0000** over 1000 målinger — tvunget |
| stikk 10–11 | +0,064 |
| hele sluttspillet | **0,3 % av taket** |

Sluttspillet er lukket som gevinstkilde. Den andre halvdelen av kravet —
«kombineres med å planlegge frem i tid» — er det alpha-muens `M` gjør, og den
står på 1.

---

## K8 — Predikere motstandernes kort på veldig høyt nivå, uten juks

> «kunne predikere motstandere sine kort på et veldig høyt nivå (uten å jukse)»

**Prøven — og den finnes heller ikke ennå.** For hvert skjult kort: hvilken
sannsynlighet gir Adams det setet kortet **faktisk** ligger på? Måles mot to
referanser, per stikk:

```
GULVET   uniform fordeling over de forenlige setene
ADAMS    det montetro/verdenstrekningen faktisk sier
TAKET    klarsyn (1,0 på riktig sete)
```

Rapporteres som log-loss eller Brier-skår. **«Veldig høyt nivå» må bli et tall
mellom gulvet og taket**, ellers er kravet ikke etterprøvbart.

**Status: MÅLT for første gang.** `examples/tro-noyaktighet.ts`.

| arm | log-tap (n=1 280) |
|---|---|
| gulv (uniform over 3) | 1,0986 |
| gulv+ (uniform over ikke-renons) | 1,0304 |
| av | 1,0279 |
| regel (A1) | 1,0278 |
| **bayes (A5)** | **1,0253** |
| bayes+g (A6) | 1,0345 |

**A5 er den eneste slutningen som gjør troen bedre.** A1 er nøytral. A6 skadet
— og to årsaker er funnet og rettet siden: senderen manglet helt, og deretter
leste mottakeren kortet ABSOLUTT mens avsenderen valgte relativt. Ny måling
kjører.

To feil i selve målingen ble fanget underveis: Monte-Carlo-oppløsningen (V=12
måler oppløsning, ikke tro) og manglende renormalisering (troens rader summerer
ikke til 1 — resten er talongen). Uten den siste «viste» første kjøring at
Adams var verre enn uniform.

---

## K8 utvidet — hvert offentlig valg skal oppdatere alles tro

> Arvind, 8. august: «hver gang en spiller gjør et valg som er offentlig så vil
> jeg at alle sin tro om hva de andre sine kort er skal oppdatere seg. […] det
> er ikke ja eller nei på hvor man tror, men at troen er spredd over de ukjente
> på bordet basert på tidligere spill og atferd som vi kjenner til.»

Dette er kjernen i K8, og det er en STRENGERE prøve enn den over. Log-tapet
måler hvor god troen er *til slutt*. Kravet her er at den skal oppdatere seg
**ved hvert offentlig valg** — og et offentlig valg er mer enn et spilt kort.

Merk hva slags størrelse dette er. Troen er en **fordeling over de ukjente
kortene**, ikke en liste med ja/nei. «Han har ikke hjerter» er hardt og sjeldent;
«han har trolig ikke både konge og ess» er mykt og vanlig, og det er den myke
typen det er flest av.

### De seks kanalene, og hvor de står i koden

Arvinds eksempler, hvert mappet til den kanalen som må bære det:

| # | eksempelet | kanalen | bygd? | i den målte Adams? |
|---|---|---|---|---|
| 1 | «han byr 11 — da har han gode kort» | `handtrekk.ts` koder budene som felt 93–103 inn i `Trosnett` | **ja** | **NEI — låst** |
| 2 | budvinner får ekstra verdi, og vraker for å skape renons | ingen | **nei** | nei |
| 3 | «han ber om konge — da har han nok essen selv» | `Etterlysvelger` er BARE en beslutning | **nei** | nei |
| 4 | «han trumfet — da har han ikke den sorten» | `hvemla-slutning.ts`, renons-settet | **ja** | **ja** |
| 5 | makker la dame på mitt lave — K/A-fordelingen skifter | A5 `troverdighet.ts` + A6 `signal.ts` | delvis | ja, men svakt |
| 6 | «enten bare trumf igjen, ellers denne fargen — jeg sparer kongen» | A8, forgreining over EGNE framtidige valg (`M`) | delvis | **nei — `M=1`** |

**Kanal 4 alene står for 92,7 % av all K8-informasjon i dag** (§105). A1, A5 og
A6 til sammen bidrar 1,3 %. Det er ikke fordi de andre kanalene er verdiløse —
det er fordi fem av seks ikke er koblet.

### Hvorfor kanal 1 er låst, og hva som åpner den

Budet er allerede kodet som trekk til trosnettet: felt 95–97 hvem som passet,
98–100 hvem som bød, 101–103 budets størrelse skalert mot antall stikk. Modellen
finnes. Men `Trosnett` og `montetro` krever et nett med **≥ 558 trekk**, og
Adams kjører `d7alle` på **273**. Det eneste brede nettet vi har (`b714gammel`)
måler **−1,15** mot `d7alle` — å bytte ville gjort Adams verre for å slå på en
evne.

**Låsen åpnes av et bedre 714-nett, ikke av en spekendring.** Det er GPU-arbeid,
ikke kodearbeid, og det er den enkeltstående viktigste hardware-oppgaven i hele
Adams Max.

### Ekvivalens er ikke en detalj

Arvind sa det selv: «med mindre han har ekvivelens». Et spilt kort er bevis bare
i forhold til **alternativene spilleren hadde**. Legger makker dame fra K‑D
blanke, betyr damen noe helt annet enn fra D‑J‑10. En tro som leser kortet
absolutt i stedet for relativt, slutter feil — og det er nøyaktig feilen A6
hadde da avsenderen valgte relativt og mottakeren leste absolutt (§ signal).

`troverdighet.ts` er den ene mekanismen som kan gjøre dette ærlig, fordi den
regner `P(observasjon | verden)` under en policy og dermed normaliserer mot det
spilleren KUNNE gjort. Kanal 5 hviler på den.

### Og dette er K4 og K8 i samme sak

«hver gang noen tar et offentlig valg så husker man det» — hukommelsen er
premisset for slutningen. K4 lærer PÅ TVERS av runder hvordan dette setet
oppfører seg; K8 slutter INNENFOR runden hva hun har. Uten koblingen vektes
verdenene med feil modell: søket ruller ut en motstander økten har lært å kjenne,
mens troen leser observasjonene som om hun spilte som oss.

Den koblingen ER bygd (`Økt.atferdFor`, se `okt.ts`). Den er bare ikke utrullet.

---

## K5 utvidet — de tre nivåene

> Arvind: «amerikaneren er et spill med 3 nivåer […] alle 3 nivåer må forstås
> for å danne et bilde over spillet og tilpasse atferd på en passelig måte.»

| nivå | hva det er | hvem eier det i dag | status |
|---|---|---|---|
| **makro** | sammenlagt ledelse og løpet mot 100 | `race.ts` — kvantilblanding vektet av `\|λ·press\|` | virker i SØKET, **ikke i budet** |
| **meso** | selve kontrakten som spilles | `budm:` — μ, `vant[N]`, terskelen | kalibrert mot feil bord (se budplanen) |
| **mikro** | hvert enkelt stikk | alpha-mu + konvensjonsvakten | sterkest av de tre |

**Hullet er makro → meso.** Kampstillingen styrer hvor mye risiko søket tar i et
stikk, men den påvirker ikke om Adams BYR. En bot som ligger 30 poeng bak med
tre runder igjen må by annerledes enn en som leder — og i dag byr den likt. Det
er steg 4 i budplanen, og det er koblingen K5 → K3.

**Og makro er nettopp derfor kampbenken er den eneste prøven på K1.** Gate 2
spiller én runde med friske agenter: `press` er strukturelt EKSAKT 0 der, så
hele makronivået er usynlig. En måling som ikke kan se et nivå, kan ikke dømme
det.

### Hva dette betyr for MVP-en

Arvind: «alt det jeg sier skal være i mvp for adams max.» Da er dette
arbeidslista, og den er ærlig om hva som er kode og hva som er timer:

1. **Kanal 3** — etterlysningen som bevis. Ren kode, liten.
2. **Kanal 2** — vraket som bevis. Ren kode; budvinnerens vrak er offentlig
   informasjon om hva hun IKKE ville beholde.
3. **Kanal 6** — `M ≥ 2`. Bygd, men 5,3× dyrere enn `M=1`. Kostnadsspørsmål,
   ikke byggespørsmål.
4. **Kanal 5** — A6 er rettet, ny måling gjenstår.
5. **Kanal 1** — krever 714-nettet. GPU.
6. **Makro → meso** — budplanens fire steg.

---

## Hva som mangler, oppsummert

| krav | prøven finnes | innfridd |
|---|---|---|
| K1 bedre enn mennesker | ja | **nei** — 15,83 % mot < 5,0 % |
| K2 aldri jukse | ja | **ja** (kortspill) — men se talonghullet |
| K3 SOTA i alle faser | ja | delvis — **~21 % av budtaket er nåbart** (revidert) |
| K4 hukommelse + planlegging | ja | **nei** — kortkanalen virker, budkanalen 2× for svak |
| K5 kontekst og tilpasning | ja | halvveis — fikset, ny måling gjenstår |
| K6 lære vaner og utnytte | ja | **nei** — tre brudd rettet, ommåling gjenstår |
| K7 optimalt sluttspill | ja | **ja** — 0,3 % av taket |
| K8 predikere kort | ja | delvis — A5 virker, A1 nøytral, A6 fikset |

**Alle åtte har nå en prøve.** Det var fire uten da fila ble skrevet.

**Seks av åtte krav er ubeviste, og tre av dem har ingen prøve.** Det er den
ærlige tilstanden. Komponentene er bygd og koblet; det som mangler er å vise at
de gjør det de skal.

### Rekkefølgen

1. ~~K2-prøven~~ — **ferdig.**
2. **K8-prøven** — trosnøyaktighet mot gulv og tak.
3. **Kampbenken som port** — låser opp K4, K5 og K6, som er umålbare uten den.
4. **K6-prøven** — stilisert motstander, gevinst som vokser med rundenummer.
5. **K3 budrunden** — 41,8 % av taket, det eneste vinduet stort nok for K1.
6. **K1** — følger av de andre, ikke av seg selv.

---

## Vedlegg: hvordan jeg jobber

Dette er ikke krav fra Arvind. Det er reglene jeg holder meg til fordi hver av
dem finnes etter at noe gikk galt uten den.

1. Aldri adoptere på støy: parret på giv, replikert i disjunkte frøbånd,
   tegntest ved siden av snittet. Kontrollarmen må måle eksakt 0,0000 (gate 2)
   eller 0,2500 (kampbenken).
2. Alle måleresultater til varige filer, aldri stdout-rør.
3. Aldri lese en gate2-fil før kjøringen er ferdig — delresultater løy fire
   ganger på én natt.
4. Det målte og det utrullede må være samme ting. Funnet feil **tretten**
   ganger; håndheves av `test/utrullet-lik-maalt.test.ts`.
5. En knott må ha et nullpunkt som er bit-identisk med «av».
6. En test skal måle at noe **fyrer**, ikke at det finnes — fire døde moduler
   hadde grønne enhetstester hele tiden.
7. Alt logges i `docs/plan.md`, også det som feilet.

Og de rammene som ER dine: offentlig repo uten fornavn, ingen utrulling uten
beskjed, ingen kryssøkt-lagring.

---

## Planen for de to manglende koblingene

Arvind: «da får du lage en plan for dette. vi skal ha alt på plass for AdamsMax.»

To koblinger mangler, og de er ulike i natur. Den ene er en **manglende
inngang** (budet ser ikke kampstillingen). Den andre er en **frossen
kalibrering** (budet er stilt inn mot en spillestyrke vi har forlatt).

Den andre må komme først. Rekalibrerer man ikke μ, måler man den nye
kampstillings-knotten oppå en modell som allerede systematisk bommer — og da
vet man ikke hvilken av dem tallet kommer fra.

### Hva budmodellen faktisk består av

```
dim   128            v1-trekk: EGEN HÅND alene
mμ    GBT-skog       anslår LAGSTIKK          → en påstand om SPILLESTYRKE
mσ    GBT-skog       anslår usikkerheten
vant  {9: 0,097, 10: 0,940, 11: 1,000}  P(bud N vinner auksjonen)
                                         → en påstand om MOTSTANDERNE
```

Beslutningen er `ev = p·2N(2P−1) + (1−p)·fv`, der `P = P(lagstikk ≥ N)` fra
(μ, σ) og `p = vant[N]`.

**Begge de to påstandene er frosne filer.** Blir spillet bedre, flytter μ seg.
Endres motstanderne, flytter `vant` seg. Ingen av delene oppdager det selv.

---

### Steg 1 — rekalibrer μ mot dagens spillestyrke

**Fellen først, for den har bitt før.** μ-skiftet ble målt som residualen
(faktisk lagstikk − μ) blant dem som VANT budrunden. Man vinner budrunden
nettopp når modellen anslår høyt, så utvalget er valgt PÅ den størrelsen som
måles. Sveipet ga −0,090 og −0,393 da det ble prøvd.

**Målingen som unngår den:** TVING en kontrakt på hvert sete uavhengig av
auksjonen, spill den ut med dagens stakk, og sammenlikn faktisk lagstikk med
GBT-ens μ. Da er utvalget alle hender, ikke vinnerne.

*Godkjent når:* residualen er sentrert innenfor 2 SE etter korreksjon, og
korreksjonen replikerer i to disjunkte frøbånd. Er residualen allerede
sentrert, er modellen fortsatt riktig kalibrert — og det er et like gyldig
svar.

### Steg 2 — rekalibrer `vant[N]` mot dagens motstandere

`vant` sier at bud 9 vinner auksjonen i 9,7 % av tilfellene og bud 10 i 94,0 %.
Det er en påstand om hvem som sitter ved bordet, ikke om kortene.

*Målingen:* spill auksjoner med dagens stakk i alle fire seter og tell hvor
ofte hvert bud vinner.

*Godkjent når:* de målte andelene ligger innenfor SE av fila, eller fila er
oppdatert. Merk at `vant` allerede er navngitt riktig: den heter `bud-vant`
fordi den er **riktig når bordet er fire Adams** — mot familien er den en annen
fordeling, og det er derfor appen bruker en annen fil.

### Steg 3 — gjenåpne terskelen

§63 målte terskelen optimal i fire retninger. Det er sant — **for den
spillestyrken den ble målt mot.** Etter steg 1–2 er den påstanden ikke lenger
etablert.

*Målingen:* sveip `evForsvar` på nytt, i to disjunkte bånd, med tegntest ved
siden av snittet.

*Godkjent når:* enten er den gamle verdien fortsatt optimal (og da vet vi det
igjen), eller en ny er positiv og replikert. **Aldri adopter på ett bånd** —
auksjonskorreksjonen (§65) hadde z = 0,71 i ett og 0,54 i det neste.

### Steg 4 — koble kampstillingen inn i budet (K5 → K3)

`totalPoeng` har i dag **null treff** i `budmodell.ts` og `budagent.ts`.

Formen skal være den samme som i kortspillet, av en grunn: der ble
`snitt + λ·press·spredning` målt ASYMMETRISK — bare det negative leddet kunne
velte et valg. Kvantilformen erstattet den. Budet har samme struktur (en
fordeling over lagstikk), så det er samme fiks:

```
ligger BAK   → verdsett budet etter en ØVRE kvantil av lagstikkfordelingen
leder        → etter en NEDRE
```

*Nullpunkt:* `racepress` er allerede eksakt 0 når `framdrift < 0,3`, så en
kamp fra 0–0 er bit-identisk med i dag. Det kravet er ikke til pynt — uten det
kan ingen sveip starte fra noe kjent.

*Målingen kan IKKE være gate 2.* Hver giv der starter på 0–0, så presset er
null per konstruksjon. **Kampbenken er den eneste porten som kan se dette**, og
`verktoy/kampport.sh` finnes allerede.

*Godkjent når:* effekten er positiv på kampbenken, replikert i disjunkte bånd,
med kontrollarmen på 0,2500.

---

### Rekkefølgen er ikke valgfri

```
1. rekalibrer μ      →  2. rekalibrer vant  →  3. gjenåpne terskelen  →  4. kampstilling
   (spillestyrke)        (motstanderne)         (nå målbar igjen)        (ny inngang)
```

Steg 3 er meningsløst før 1 og 2: en terskel sveipet mot en skjev μ finner
optimum for skjevheten. Og steg 4 lagt oppå en feilkalibrert modell måler to
ting samtidig.

### Og den ærlige risikoen

Steg 1–3 kan ende med at **ingenting flytter seg** — at μ allerede er sentrert
og terskelen fortsatt optimal. Da er budrunden informasjonsbegrenset og ikke
kalibreringsbegrenset, og det stemmer med det K3-agenten allerede målte:
**≥ 87 % av åpningsbudets tak er klarsyn**, og de resterende 13 % er ikke
etablert (z = +0,27).

Skulle det bli utfallet, er planen likevel riktig utført: den erstatter en
antakelse med et tall.

---

## Revisjon 8. august — budtaket var ikke der vi trodde

K-kurven er målt: n = 114 giv per bånd, to disjunkte bånd, alle K på samme giv
og et prefiks av de samme verdenene.

| K | begge bånd ± SE | tegntest |
|---|---|---|
| 6 | −0,741 ± 0,794 | negativ i BEGGE bånd |
| 12 | +1,246 ± 0,735 | 0,00 / −0,19 |
| 240 | **+2,004 ± 0,586** (z 2,83) | **2,06 / 1,94 — positiv i begge** |
| klarsyn | +9,627 ± 0,859 | — |

**«≥ 87 % av budtaket er klarsyn» var et artefakt.** Tallet ble lest ved
K = 12, som ligger under vippepunktet. Ved K = 240 er andelen **~79 % klarsyn,
~21 % nåbart** — dobbelt så stort vindu som antatt.

Det nye ved K = 240 er ikke snittet (det lå på +1,2 alt ved K = 12), men at
**tegntesten snur positiv i begge bånd**. Gevinsten bæres av et flertall giv i
stedet for noen få utslag. Det er nøyaktig skillet §65 falt på.

**Vinnerens forbannelse er ekte og snur mellom K = 6 og K = 24.** K = 6 er
negativt i begge bånd. Den konservative varianten blir også positiv
(+1,228 ± 0,428) og ligger UNDER argmax ved K = 240 — forbannelsen er ikke
lenger den bindende skranken.

### Og den viktigste setningen

**Budrunden er MODELLBEGRENSET, ikke informasjonsbegrenset.**

Et søk som bare bruker lovlig informasjon henter ~21 % av klarsynstaket og
~25 % av PASS-bøtta (+0,95 ± 0,33). μ (GBT-en) når **aldri over null** i noen
bøtte, i noe bånd: −0,01 til −0,13, kryssvalidert −0,057. Informasjonen er ved
bordet. Dagens budmodell kan ikke representere den.

Det flytter budplanens tyngdepunkt: å rekalibrere μ er å finpusse en modell som
ikke har uttrykkskraften. Søket har den.

### Hva som er destillerbart, og hvor smalt

**89 % av hele K = 240-gevinsten er ÉN binær beslutning: by 9 i stedet for 10**
(29 giv, +1,785). Alt annet søket finner — 9→PASS, 9→5, 8→PASS — summerer til
nøyaktig null.

Etikettstabiliteten følger samme mønster: 65,8 % for hele budvalget, men
**83,5 % for nettopp «by 9 i stedet for 10»**. Målet er derfor én binær
klassifiserer på de ~42 % av givene der policyen byr 10 — ikke etiketter for
hele budvalget. Og den kan ikke bygges på `budTrekk` alene: μ skiller de to
klassene med bare −0,433 ± 0,303. Hendene ser nesten like ut for GBT-en.

*Forbehold som må stå:* kurven er ikke monoton (K = 120 < K = 48), og fire
disjunkte 60-blokker måler 1,40–2,11 — altså ±0,4 ren valgstøy. Platået fra
K ≈ 48 er ETT platå, ikke en kurve med struktur. Den billige varianten («byr 10
med svak μ, by 9») måler +0,301 ± 0,109, men tegntest +0,78/−0,25 og
kryssvalidert −0,011 (z −3,17) — **ikke etablert**.

*En feil ble funnet av kontrollene:* `JSON.parse` sorterer heltallsliknende
nøkler først, så kandidatrekkefølgen snudde og uavgjorte argmax-valg ble brutt
motsatt vei — 1 av 3 giv feil merket. Rekkefølgen hentes nå fra
`lovligeHandlinger`. Kontrollen som fanget den: K = 12-valget skal være
identisk med `k3-budgap.ts`, og er det nå på alle 194 felles giv.
