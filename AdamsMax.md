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

## Hva som mangler, oppsummert

| krav | prøven finnes | innfridd |
|---|---|---|
| K1 bedre enn mennesker | ja | **nei** — 15,83 % mot < 5,0 % |
| K2 aldri jukse | ja | **ja** (kortspill) — men se talonghullet |
| K3 SOTA i alle faser | ja | delvis — **≥ 87 % av budtaket er klarsyn** |
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
