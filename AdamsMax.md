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
| *menneskene mot før-v5-linja (19 ekte kamper, 1.–4. aug)* | *15,8 %* |
| **menneskene mot v5 (78 ekte kamper, 5. aug–1. sep)** | **32,1 %** |
| **der vi står (v5, mot STEDFORTREDEREN)** | **15,83 %** |
| **KRAVET** | **< 5,0 %** |

**Status: ikke innfridd, og avstanden er STØRRE enn denne fila har hevdet.**

De to menneskeradene måler ikke samme bot. 15,8 % er før-v5-linja (Vaar, v1,
v2, v3) og slutter 4. august — den beskriver ingen bot som er utrullet i dag.
v5 har stått på nettsidene siden 5. august, og der har menneskene 78
ferdigspilte kamper.

### < 5 % ER ET STREKKMÅL, og grunnlaget er tynnere enn overskriften

Arvind, 8. august: «at mennesker skal bare kunne slå oss i 5% av kamper i et
race til hundre er noe jeg tror er mulig, MEN det er bare et strekkmål.»

De 15,8 % var **3 av 19 kamper**, og intervallet sto i `docs/plan.md`:

    MÅLT 15,8 %      95 %-intervall  5,5 % – 37,5 %

**Her sto det tidligere «den nedre enden er allerede på målet». Det stemmer
ikke lenger.** Med v5 og 78 kamper (1. september) er målingen:

    MÅLT 32,1 %      95 %-intervall (Wilson)  22,7 % – 43,0 %

Hele intervallet ligger over kravet, og den nedre enden er nå 4,5 ganger
målet — ikke på det. Nitten kamper var rett og slett for få: punktestimatet
doblet seg da grunnlaget ble firedoblet, akkurat slik det brede intervallet
advarte om.

**Og det feller stedfortrederen.** «Der vi står (v5) = 15,83 %» er målt mot en
STEDFORTREDER — en bot valgt fordi den vant omtrent like ofte mot Adams som
menneskene gjorde i de 19 kampene. Den kalibreringen er nå motsagt, og stigen er
kjørt om mot dagens utrullede v5 med 800 kamper per arm
(`analyse/stedfortreder-2026-09-01.md`):

| kandidat | andel mot v5 | 95 %-KI |
|---|---|---|
| nevro | 3,5 % | 2,4–5,0 |
| d7alle bart | 6,8 % | 5,2–8,7 |
| ftf1 | 6,9 % | 5,3–8,8 |
| Adams uten budmodell | 7,1 % | 5,5–9,1 |
| Adams uten vrakrangerer | 22,9 % | 20,1–25,9 |
| **KONTROLL: v5 mot seg selv** | **25,3 %** | 22,4–28,4 |
| **MENNESKENE** | **32,1 %** | 22,7–43,0 |

Kontrollarmen omslutter 0,2500, slik prøven over krever. Og da faller premisset
stigen ble bygd på: **menneskenes intervall inneholder kontrollarmen — de kan
ikke skilles fra enda en kopi av Adams-v5 selv.** `docs/plan.md` §41 skrev
«menneskene ligger på 15,8 %, altså SVAKERE enn Adams-v3». De er ikke svakere
enn Adams. Det finnes ikke noe trinn mellom 7,1 % og 22,9 %, og altså ingen
stedfortreder å velge: til K1 må v5 selv brukes inntil menneskedataene er
tykkere.

Det har tre konsekvenser:

1. **Å si «10,8 prosentpoeng igjen» var å behandle 15,83 som et faktum.** Målt
   mot mennesker er avstanden 32,1 → 5,0, og mot kontrollarmen 25,3 → 5,0.
   Kravet ber om at Adams skal slå et menneske omtrent så klart som han i dag
   slår NevroHjerne (3,5 %) — ikke en finjustering av dagens stakk.
2. **Den bindende usikkerheten er ikke hvor sterk Adams er, men hvor godt vi
   har målt menneskene.** Flere ekte familiekamper er derfor verdt mer enn
   flere modulmålinger, og de koster ingen CPU — de koster kvelder. Det rådet
   var riktig, og det er nettopp det som avslørte feilen.
3. **Samme kjøring replikerer K3 uavhengig.** Å fjerne budmodellen koster
   18,2 pp, å fjerne vrakrangereren 2,4 pp. `budm` bærer stakken — nå målt på
   kamper til 100 poeng, ikke på rundedifferanse. To benker, samme svar.

**Forbehold ved de 32,1 %.** Bare 78 av 248 startede v5-kamper ble fullført.
Av de forlatte som rakk ≥ 8 runder (n=56) lå mennesket bak i 84 % — folk
forlater kamper de taper. Menneskenes ekte andel er derfor trolig LAVERE enn
32,1 %; tallet er et tak, ikke et punkt. Samme skjevhet lå i de 19 kampene
(fullføringsgrad 41,3 % for før-v5-linja mot v5-linjas 31,5 %), så 15,8 → 32,1
skal ikke leses som at v5 er svakere enn v1–v3: spillersammensetningen er også
ulik mellom de to vinduene. Det som står igjen uansett er nivået mot v5 og at
kravet er langt unna.

K1 behandles derfor som en RETNING, ikke som en port. K2–K8 er portene.

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
| Sluttspill | alpha-mu, full dybde tilgjengelig | 0,3 % av taket ved to stikk, **~4,9 % ved fem** (§117) |

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
Kravet krever kampbenken.

**Men KOSTNADSLÅSEN på prøve B er borte (8. august).** `M=2` sto ikke på fordi
den kostet 5,3× — det tallet var målt med CPU-en mettet av 18 andre jobber.
`examples/amu-kostnad.ts` måler nå M=1 og M=2 i samme kjøring på samme
stillinger, og profilen sa hvor tiden gikk: **95 % var ett kall**, nettets
framoverpassering i rolloutene. Verdenstrekningen var 0,1 %, motoren 0,4 %.
Aktiveringene i `d7alle` er 78–89 % nuller, så `forover` hopper nå over ledd der
inngangen er eksakt null — i stigende rekkefølge, altså **bit-identisk**, holdt
av `test/nett-glissen.test.ts` og `test/amu-bitidentisk.test.ts`.

| | før | etter |
|---|---|---|
| `amu 12k16` M=1, per beslutning | 428 ms | **138 ms** |
| `amu 12k16` M=2, per beslutning | 1 375 ms | **439 ms** |
| M=2-arm, 16 000 gate2-par, én kjerne | 15,3 t | **4,9 t** |

Med `--skard` over åtte kjerner er M=2-armen under en time. **`M=2` er ikke
lenger en hypotese — den er en kandidat som kan måles.** Selve gevinsten er
fortsatt umålt; det er neste steg, ikke dette.

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

*Begrensningen du satte 6. august* var «det skal bare lære per økt for nå», og
den ble **flyttet 12. september**: «når botten starter en kamp mot en spiller så
lastes den spilleren sine vaner inn i botten sitt minne basert på tidligere
matches, også oppdateres den videre under kampen. så en spiller sine vaner og
spillerstil følger brukeren, også kan botten trekke fra den.»

**Den nye grensen er smalere enn «alt er lov».** Lagring på tvers av kamper er
lov, men en profil kan bare inneholde **det som var offentlig ved bordet i
FERDIGSPILTE runder** — ingen skjulte kort, ingen talong, og ingen annen
spillers vrak ut over det som er utledbart ved rundeslutt. **K2 er uendret:**
valgene skal fortsatt være invariante for skjult informasjon.

Håndhevet i test, på to steder som gjør hver sin jobb: `okt.ts` har fortsatt
ingen `fs`, `localStorage` eller `fetch` (økta er kveldens, ikke historien,
`test/okt.test.ts`), og `src/mlb/profil.ts` — det ene stedet som lagrer — kan
bare bygges av `Hukommelse`, som ikke bokfører før `RUNDE_SLUTT`. Prøven mater
en pågående runde og krever en tom profil, bytter de skjulte hendene og krever
bit-identisk profil, og har en felle for hver av de to
(`test/mlb-profil.test.ts`).

---

## K7 — Matematisk optimale løsninger i sluttspillet

> «finne matematiske optimale løsninger i sluttspillet (kombineres med å
> planlegge frem i tid)»

**Prøven.** I stillinger der en eksakt løsning finnes, må Adams velge den —
**100 % samsvar**, ikke 95 %. Og løsningen må mates inn i søket over det, slik
at planen fram dit vet hva sluttspillet er verdt.

**Status: IKKE INNFRIDD — men avstanden er målt, og den er ikke et søkeproblem
(§117).**

| vindu | poeng per runde igjen | fører | av alt som er å hente |
|---|---|---|---|
| siste stikk | eksakt **0,0000** over 1000 målinger — tvunget | 0,0000 | 0 % |
| stikk 10–11 | +0,0640 | +0,1600 | **0,3 %** |
| stikk 8–9 | +0,477 | +1,584 | 2,5 % |
| **siste FEM stikk** | **+0,9470** | **+2,5440** | **~4,9 %** |

### Taket sto aldri i fare — §116 tok feil om det

§116 satte K7 tilbake til umålt fordi taket «ble regnet med den ødelagte
DD-løseren». **Det gjorde det ikke.** `tak-kart.ts` setter `lagIndre(ADAMS)` i
alle fire seter og lar bladet være rundens faktiske poeng — ingen `løsDD`,
ingen `rotVerdier`, ingen `evaluerHybrid` i den stien.

Vinduet ble kjørt om på HEAD med identisk frø-rekke: **592 rader, 0 avvik mot
arkivet fra før fiksen** — både Adams' eget spill og beste svar, rad for rad,
gjennom hele runden. Feilen spredte seg langs kall, ikke langs tema.

### Og den snevre lesningen var det som bar «innfridd»

«0,3 % av taket» gjelder de siste TO stikkene. De siste FEM er **+0,947 poeng
per runde**, femten ganger så mye. K7 hvilte på den trangeste mulige lesningen
av sitt eget ord.

### Riktig algoritme målt mot den store lesningen — og den ga null

`d<stikk>` gir full alpha-mu-dybde når få stikk gjenstår, altså `M ≥`
gjenstående stikk, der alpha-mu er eksakt for verdensutvalget. Gate 2, full
stakk i alle fire seter, 349 giver × 4 seter = 1 396 par, frø 900 000:

| arm | poeng/runde | tegntest | dom |
|---|---|---|---|
| **KONTROLL** | **0,0000** | — | **benken er frisk** |
| `d4` | +0,0489 ± 0,0343 (1,4 SE) | 4 opp / 0 ned, p = 0,125 | under porten |
| `d5` | −0,0236 ± 0,0725 (−0,3 SE) | 10 opp / 10 ned, p = 1,000 | flat |

Makker og forsvar målte **eksakt 0,0000** i begge armene — speken er
`amu:foerer:`, så flagget kan bare bite i førersetet. Det er koblingssjekken
innebygd i selve målingen.

Og tallene er tynnere enn de ser ut: `d4` endret utfallet i **4 av 1 396 par**,
`d5` i 20. Fire hendelser er en anekdote.

### Hvorfor dypere søk ikke hjelper

Taket er målt MED KLARSYN. To tredeler av de +0,947 ligger i **16 giver av
1 000**, og +39,8 per treff er kontraktvipp. Det er stillinger der ett kort
avgjør kontrakten — og hvilket kort det er, må gjettes. Dypere eksakt søk
kjøper ikke informasjon. **Resten av sluttspillet er K8s problem, ikke K7s.**

Flagget er parkert, ikke fjernet: `d0` er standard og bit-identisk, og
måletallene står i doc-kommentaren til `sluttdybde` i `amuagent.ts`.

Den andre halvdelen av kravet — «kombineres med å planlegge frem i tid» — er
det alpha-muens `M` gjør, og den står fortsatt på 1. Forsøket på å heve den der
den er billigst målte null.

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

**Status: MÅLT, og kravet er IKKE innfridd.** `examples/tro-noyaktighet.ts`,
siste kjøring §117: **2 832 stillinger, 354 giv, 55 224 skjulte kort, V=64**,
ett sete per stikk fra 2 til 9 — 354 i hvert stikk. Den forrige kjøringen lå i
stikk 4 (688 av 800 rader) og kunne ikke se runden.

| arm | log-tap (n=2 832) | SE |
|---|---|---|
| gulv (uniform over 3) | 1,0986 | — |
| **gulv+** (uniform over ikke-renons) | **1,0342** | ±0,0020 |
| av | 1,0571 | ±0,0034 |
| regel (A1) | 1,0590 | ±0,0033 |
| bayes (A5) | 1,0546 | ±0,0034 |
| g (A6-leser) | 1,0554 | ±0,0034 |
| bayes+g | 1,0534 | ±0,0034 |
| **bayes+W** (A5 + kanal 2) | **1,0525** | ±0,0033 |
| klarsyn | 0 | tak |

**Kanal 2 er den sterkeste slutningen vi har på troen:** +0,0046 ± 0,0004 mot
«av» (z = +10,8), og +0,0056 ± 0,0007 regnet bare der den KAN fyre. A5 gir
+0,0025, A6-leseren +0,0017, og **A1 er fortsatt målbart skadelig** (−0,0019).

**Tallet mellom gulvet og taket, som kravet ba om:**

| | log-tap | andel av veien gulv → tak |
|---|---|---|
| gulv+ (bare renonser) | 1,0342 | 5,86 % |
| beste Monte-Carlo-arm (bayes+W) | 1,0525 | 4,20 % |
| **MLB-trohodet** (§119) | **0,9630** | **12,34 %** |
| klarsyn | 0 | 100 % |

**§119 FLYTTET TALLET, OG IKKE MED EN SLUTNINGSREGEL.** Et rent nett trent
veiledet på «hvor kortene faktisk lå» — ingen mester, ingen orakel, ingen søk —
måler 0,9630 mot 1,0506 for den beste Monte-Carlo-armen på nøyaktig de samme
9 600 stillingene (+0,0875 ± 0,0020, z = +44,3, best i 1 089 av 1 200 giv,
replikert i to disjunkte frøbånd). Det er den første armen som slår `gulv+`, og
den er nesten tre ganger så langt oppe som alt vi hadde. Se §119.

**MEN TALLET GJELDER ÉN MOTSTANDER.** Målt mot `nevro`-stillinger, som nettet
ikke er trent på, faller det til 5,09 % og slår **ikke** `gulv+`
(−0,0014 ± 0,0022). Trent på `nevro` og målt mot `nevro` går det til **16,43 %**.
Metoden overføres, vektene gjør det ikke — og prisen for å ta feil om
motstanderen er ~7 prosentpoeng av veien til taket. Det er «K8 uten K6 er en
énmodell-antakelse», nå med et tall på.

**Avstanden til taket er ~95 %.** Alle slutningene til sammen flytter troen
0,42 % av veien fra uvitenhet til klarsyn. Renonsene alene flytter tretten
ganger så mye — og de er en hard regel, ikke en slutning.

**Hver arm måler dårligere enn gulv+, og det er OPPLØSNING, ikke tro.** Gulvene
er analytiske og har ingen V; troen er et Monte-Carlo-estimat, og log-tap
straffer den variansen systematisk (Jensen: `E[−log p̂] ≥ −log E[p̂]`).
V-sveipen på nøyaktig samme 982 stillinger: underskuddet for «av» er −0,0859
ved V=16, −0,0211 ved V=64 og −0,0079 ved V=256; for «bayes» −0,0840, −0,0191
og **−0,0053 (z = −1,5), der det ikke lenger er signifikant**. Serien har ikke
konvergert — skrittet 64 → 256 er fortsatt z = +11 — så det sanne nivået ligger
under tallene i tabellen over. Å heve V så derfor ut som det billigste kjente
løftet på troen. **§119 viste at det ikke var det:** hele Jensen-straffen er
verdt ~0,02, mens nettet henter +0,0875. Straffen var ekte, men den var ikke
der pengene lå.

Tre feil i selve målingen er fanget underveis, og alle tre er fortsatt
gjeldende advarsler: Monte-Carlo-oppløsningen (V=12 måler oppløsning, ikke
tro), manglende renormalisering (troens rader summerer ikke til 1 — resten er
talongen), og nå Jensen-straffen, som `gulvbandt` ikke kan se: den måler
**0,0 % på hver eneste arm** samtidig som straffen er der.

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
| 2 | budvinner får ekstra verdi, og vraker for å skape renons | `vrakLogVekt` i `sampler.ts`, bryter `W<alfa>` | **ja** | **målt, av som standard** |
| 3 | «han ber om konge — da har han nok essen selv» | `Etterlysvelger` er BARE en beslutning | **nei** | nei |
| 4 | «han trumfet — da har han ikke den sorten» | `hvemla-slutning.ts`, renons-settet | **ja** | **ja** |
| 5 | makker la dame på mitt lave — K/A-fordelingen skifter | A5 `troverdighet.ts` + A6 `signal.ts` | delvis | ja, men svakt |
| 6 | «enten bare trumf igjen, ellers denne fargen — jeg sparer kongen» | A8, forgreining over EGNE framtidige valg (`M`) | delvis | **nei — `M=1`** |

**Kanal 4 alene står for 92,7 % av all K8-informasjon i dag** (§105). A1, A5 og
A6 til sammen bidrar 1,3 %. Det er ikke fordi de andre kanalene er verdiløse —
det er fordi fem av seks ikke er koblet.

**Kanal 2 er koblet siden §117, og den er nummer to.** +0,0046 ± 0,0004 mot
«av» der alle setene telles, +0,0056 ± 0,0007 der den kan fyre. Forskjellen på
de to tallene er hele poenget: er observatøren SELV budvinneren, kjenner hun
sitt eget vrak, `dødKapasitet` settes til 0, og vekten returnerer 0 **per
konstruksjon**. Målt: 681 avvik av 1 055 rader i de andre setene, **0 av 1 777**
i hennes eget. En slutning kan altså være stum uten å være svak, og de to må
aldri slås sammen i samme tall.

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
| **makro** | sammenlagt ledelse og løpet mot 100 | `race.ts` — kvantilblanding vektet av `\|λ·press\|` | i søket, og siden §112 også i budet (`budm:...kamp<λ>`) — **av i standard, umålt** |
| **meso** | selve kontrakten som spilles | `budm:` — μ, `vant[N]`, terskelen | kalibrert mot feil bord (se budplanen) |
| **mikro** | hvert enkelt stikk | alpha-mu + konvensjonsvakten | sterkest av de tre |

**Hullet var makro → meso.** Kampstillingen styrte hvor mye risiko søket tar i
et stikk, men påvirket ikke om Adams BYR. En bot som ligger 30 poeng bak med tre
runder igjen må by annerledes enn en som leder — og den bød likt. Det er steg 4
i budplanen, og det er koblingen K5 → K3.

**Koblingen finnes nå** (`src/moe2/budrace.ts`, §112): budet verdsettes etter en
øvre kvantil av lagstikkfordelingen når vi ligger bak og en nedre når vi leder,
med `racepress` GJENBRUKT og ikke gjenoppfunnet. Retningen er låst i
`test/makro-meso.test.ts` (87 opp / 0 ned på 183 beslutninger), og nullpunktet
er bit-identisk. **Men den er av i standard og ikke målt** — og den kan bare
måles på kampbenken, av grunnen rett under.

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
6. **Makro → meso** — steg 4 er BYGD og koblet (§112), av i standard og umålt.
   Steg 1–3 (rekalibrering av μ, `vant`, terskelen) står igjen.

---

## Hva som mangler, oppsummert

| krav | prøven finnes | innfridd |
|---|---|---|
| K1 bedre enn mennesker | ja | **nei** — **32,1 %** mot < 5,0 % (78 ekte v5-kamper; 15,83 % var stedfortrederen) |
| K2 aldri jukse | ja | **ja** (kortspill) — men se talonghullet |
| K3 SOTA i alle faser | ja | delvis — **~21 % av budtaket er nåbart** (revidert) |
| K4 hukommelse + planlegging | ja | **nei** — hviler på samme tall som K6, se §108. `M=1`, så framoverblikket er av |
| K5 kontekst og tilpasning | ja | **nei** — alfa-mu i alle roller MÅLT: makker og forsvar ≤ 0 i alle armer (§109) |
| K6 lære vaner og utnytte | ja | **nei** — detektoren målt og felt: den finner ikke en stilisert vane (§108) |
| K7 optimalt sluttspill | ja | **nei** — +0,064 igjen ved to stikk, +0,947 ved fem. Full alpha-mu-dybde målte null (§117) |
| K8 predikere kort | ja | **nei** — men 4,20 % → **12,34 %** av veien gulv → tak med MLB-trohodet (§119). Første arm som slår `gulv+` — og bare mot den motstanderen den er trent på |

**Alle åtte har nå en prøve.** Det var fire uten da fila ble skrevet.

**Sju av åtte krav er ubeviste.** K7 var det sjuende. Det falt til umålt
8. august, og 9. august ble det avgjort: taket sto aldri i fare — `tak-kart.ts`
kaller ikke løseren, og 592 rader kjørt om er bit-identiske med arkivet fra før
fiksen. Men kravet er **ikke innfridd**, for «0,3 %» gjaldt bare de to siste
stikkene; de fem siste rommer +0,947 poeng per runde, og full alpha-mu-dybde
(`d4`, `d5`) klarte ikke å hente noe av det (§117). Det er den ærlige
tilstanden.

### Hvor det står 8. august, etter en natt med målinger

Tre hypoteser gikk inn i natten. **Alle tre er felt av sine egne målinger:**

| hypotese | dom |
|---|---|
| vakt-vetoen løfter alfa-mu i alle roller (+0,4809) | **halverte til +0,1742 ± 0,0970 (1,8 SE)** — under porten |
| lagmålet løfter makker og forsvar | **motbevist:** −0,4185 (−5,2 SE), og verst i nettopp de to rollene |
| K6-detektoren trengte bare kalibrering | **felt:** den leser en stilisert trumftrekker som mindre aggressiv enn snittet |

Det som BLE flyttet er av en annen type — feil som ikke krevde en hypotese:

* **22,7 % av verdenene i stikk 1 var regelstridige** (§107). Budvinneren fikk
  det kortet hun umulig kan ha, og 1742 av 1742 slike verdener gjorde henne til
  sin egen makker — med feil poengregler i rolloutene.
* **Den utrullede boten hadde ingen av evnene.** Ingen `okt:`, `profil:` eller
  `amu:`, feil vaktflagg, og et trosnett appen laster ned og workeren aldri
  leser. Broen finnes nå og er testhåndhevet.
* **Budtaket var dobbelt så stort som antatt** — ~21 % nåbart, ikke ~13 %. Og
  budrunden er **modellbegrenset, ikke informasjonsbegrenset**.

### Den ene setningen

Ingen av de åtte kravene flyttet seg fra nei til ja i natt. Men tre blindveier
er stengt med tall, og tre ekte feil er borte. **Det er slik avstanden til K1
faktisk krymper** — ikke ved at en god idé virker, men ved at de dårlige blir
avvist billig.

### Rekkefølgen

1. ~~K2-prøven~~ — **ferdig.**
2. ~~K8-prøven~~ — **ferdig** (§117), og **besvart på nytt** (§119). Et
   trohode trent veiledet på «hvor kortene faktisk lå» står på **12,34 %** av
   veien til taket mot dagens 4,20 %, og er den første armen som slår `gulv+`.
   K8 er en DATAOPPGAVE, ikke en slutningsoppgave — verken flere
   slutningsregler eller høyere V var svaret.
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
beskjed, og — fra 12. september — lagring på tvers av kamper bare av det som var
offentlig ved bordet i ferdigspilte runder.

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

---

## Sammenhengen mellom kravene — kartet jeg skulle hatt fra starten

Arvind, 8. august: «det er en øvelse for at du skal forstå hvordan du kan møte
prosjektet og ta høyde for sammenhengen.»

### De åtte er ikke samme slags ting

Det var den første feilen. Jeg behandlet dem som åtte sidestilte evner.

| type | krav | hva det betyr |
|---|---|---|
| **Utfall** | K1 | Ikke en komponent. Summen, målt i kamper. Kan aldri bygges direkte |
| **Skranke** | K2 | Hjelper deg ikke å vinne. Den definerer rommet de andre må virke i |
| **Bredde** | K3 | Ikke én evne, men kravet om at *ingen fase er svak* |
| **Evner** | K4–K8 | De faktiske mekanismene |

Å jage K1 direkte er meningsløst, og å «måle K2 opp» er en kategorifeil.

### Avhengighetskjeden

```
        K4 hukommelse ──► K6 vaner ──► K8 tro ──► K3 midtspill
             │                            │
             └──► K4 planlegging ─────────┴──► K7 sluttspill
                        ▲
        K5 kontekst ────┘  (og K5 makro ──► K3 budrunde)
```

**K8 uten K6 er en énmodell-antakelse.** A5 regner `P(observasjon | verden)`
under VÅRT EGET nett. Uten korreksjon per motstander vektes verdenene med feil
modell for alle andre enn oss selv. Derfor er `stilbias` ikke en K6-ting med en
K8-bieffekt — den er **leddet mellom dem**.

**K7 og K4s planlegging er samme mekanisme på ulik dybde.** Alpha-mu med
`M ≥ 2` søker over egne framtidige valg; den eksakte løseren gjør det perfekt
når treet er lite. Overgangspunktet er en parameter, ikke en arkitekturgrense.

**K3 er begrenset ovenfra av K8, som er begrenset av K4.** «K3 er delvis
innfridd» er derfor ikke en uavhengig observasjon — det er en konsekvens.

### Spenningen: K2 mot K8

Jo bedre du predikerer kort, jo mer LIGNER det på juks. Det eneste som skiller
dem er **når** informasjonen kan påvirke et valg.

Det bet konkret: `stilbias` trenger hendene for å regne residualet, så den kan
bare lære VED RUNDESLUTT — ikke fordi det er ryddig, men fordi valgene i runde
`r` da bare ser residualer fra runde `< r`. K2 setter altså grensen for hvordan
K4 og K8 får lov å være implementert.

### Mønsteret: fire kollisjoner, samme form

Hver gang to komponenter har kollidert, var det **to deler som optimerer ulike
mål over samme beslutning.**

| kollisjon | krav | beslutningen de sloss om |
|---|---|---|
| A6 avsender mot A7 leser | K8 vs K3 | de frie kortvalgene (36,2 %) |
| avsender mot leser | K8 internt | signalkoden var to koder |
| søket mot vakten | K3 vs konvensjonene | 68 % av valgene |
| **DD-fasit mot poeng** | **K7 vs K1** | **−0,609 korrelasjon** |

Den siste er den styggeste: den satt i MÅLESTOKKEN. En løser som er «eksakt» på
stikk er ikke eksakt på poeng — og da er alt den har målt, målt mot feil linjal.

### Fire arbeidsregler som følger

1. **Aldri mål en komponent mot en grunnlinje som mangler dens avhengigheter.**
   `amu:alle` målte −0,2837 uten vetoen og +0,1742 med. Derfor ABLASJON NEDOVER
   fra full stakk, ikke addisjon oppover fra grunnlinja.
2. **Sjekk alltid hvilket mål hver del optimerer.** Fire av fire kollisjoner var
   dette. Feilen er usynlig i kode som kompilerer.
3. **Spør hvilken benk som kan se kravet.** K5s makro er strukturelt usynlig på
   gate 2 (`press` er eksakt 0). En modul målt der den ikke kan sees, blir
   feilaktig avskrevet — det skjedde med `r0.4`.
4. **K1 bygges aldri direkte.** Den følger, eller den følger ikke. Det som kan
   bygges er K2–K8 og koblingene mellom dem.

Den siste er Arvinds egen setning fra 7. august: «K3–K8 er midlene, K1 er
målet.» Setningen var forstått med én gang. **Hvorfor** den er sann, først nå.

---

## Må nettet trenes til å bruke modulene?

Arvind, 9. august: «jeg lurer litt på om når alle modulene er klare og satt opp
korrekt inni adams max så må den trenes til å bruke de, eller er det ikke
nødvendig? er nettet inni adams trent til å bruke alle sansene og evnene?»

### Nei — og bildet er snudd

**Modulene bruker nettet. Nettet bruker ikke modulene.**

```
okt: / profil:   vrir rollout-policyen          → bruker nettet
amu:             prior og rollouts              → bruker nettet
vakt:            overstyrer nettets valg
budm:            egen GBT-modell, helt separat
      ↓
   E1-nettet     ser kort, stikk, renonser, budrunde — og ikke noe mer
```

Nettet er BUNNLAGET. Det ser ikke motstandermodellen, ikke trosfordelingen, ikke
søkets svar. Så det finnes ingen «lære å bruke dem» — de er lag rundt det.

### Med ett ekte unntak: sanseblokken

Et nett på **≥ 558 trekk** tar trosfordelingen inn som TREKK. Da ser nettet
faktisk troen, og da gjelder spørsmålet fullt ut. `d7alle` har **273**.

Det er kanal 1 i K8, og den er låst av NETTBREDDE — ikke av kode. Åpnes bare av
GPU-trening av et bredere nett på et større korpus.

### Men det finnes et ekte treningsproblem: FORDELINGSSKIFTET

Korpuset ble laget av en orakelpolicy (`sd-orakel`, mål `standardMål`). I dag
spiller boten med søk, konvensjonsvakt, hukommelse og veto — **en annen policy
enn den som lagde treningsdataene.**

Nettet er altså trent på stillinger det ikke lenger selv produserer. Det er
klassisk fordelingsskift, og det blir VERRE jo mer stakken forbedres: hver ny
modul flytter spillet lenger fra korpuset.

**Fiksen er iterert trening.** Lag korpuset på nytt med DAGENS fulle stakk,
tren, gjenta. Det er der «trene den til å bruke evnene» faktisk betyr noe — ikke
som en ny inngang i nettet, men som at nettet blir en god komponent i NETTOPP
denne stakken.

Rekkefølgen er ikke fri: korpuset må lages av den stakken vi faktisk skal rulle
ut. Lages det før modulene er avgjort, må det lages om.

---

## Budmodellen — sist, og med tre innganger

Arvind: «vi må også ikke glemme budmodellen og å tilpasse de ulike delene for å
trene den til å by perfekt etter adams sin evne. OG den må også ta hensyn til
konteksten og tilpassingen til motstandere.»

### Hvorfor den må være sist

`μ` er FORVENTET STIKKTALL — en funksjon av hvor godt vi spiller. Kalibreres den
nå og mikrospillet så forbedres, har vi kalibrert mot en spiller vi har forlatt.
Budplanens eget steg 1 sier det: «rekalibrer μ mot dagens spillestyrke».

Arvind, 8. august: «bud ligger mellom meso og makro, og ja det preger mikro, men
bud er helt avhengig av at mikro skal være på plass.» Det stemmer: budet avgjør
kontrakten (meso) og styres av stillingen (makro), men VERDIEN av en kontrakt er
hvor mange stikk vi faktisk tar — som er mikro.

**Advarsel som må stå:** når mikrospillet blir bedre, kan tallene FALLE før de
stiger. Budmodellen er kalibrert mot en svakere spiller, så et sterkere spill
gjør den mer feilkalibrert — den byr for forsiktig i forhold til hva vi klarer.
En regresjon etter en mikroforbedring er sannsynligvis dette, ikke en feil.

### De tre inngangene budmodellen må ha

| inngang | krav | status |
|---|---|---|
| **egen styrke** (μ mot dagens spill) | K3 | budplanens steg 1–3, ikke gjort |
| **kontekst** (kampstillingen) | K5→K3 | `kamp<λ>` bygd 8. august, umålt |
| **motstanderne** (hvem vi byr mot) | K4/K6→K3 | `forsvarsjustering` finnes, målte **−1,25 pp** |

Den tredje er den svakeste. `Profilagent` påvirker i dag budet gjennom ÉN
konstant (`forsvarsverdi`), og den koblingen målte negativt. K4-prøven fant
dessuten at justeringen ber om maks 0,649 budpoeng mens det trengs 1,0 for å snu
ett eneste valg — **budkanalen er en målt grense, ikke en bug.**

Og K3-agenten fant hvor verdien faktisk ligger: **89 % av hele gevinsten er ÉN
binær beslutning — by 9 i stedet for 10.** Målet er derfor ikke en bedre
budmodell i sin alminnelighet, men én klassifiserer på de ~42 % av givene der
policyen byr 10.

### Rekkefølgen

1. Mikro låses (K4, K5-mikro, K6, K7, K8)
2. Korpus lages på nytt med den stakken → nettet trenes → fordelingsskiftet borte
3. `μ` og `vant[N]` kalibreres mot DEN spillestyrken
4. Terskelen gjenåpnes
5. Kontekst og motstandermodell kobles inn i budet
6. K1 måles til slutt — den følger, eller den følger ikke

---

## Arbeidsform: lete i koden er billigere enn å benke

Arvind, 9. august: «vi finner veldig mange feil og mangler ved å lete manuelt
gjennom koden og det burde du fortsette med å gjøre. Jeg forstår jo at vi må
sjekke og benke underveis, men jeg vil ikke gjøre det konstant.»

Han har rett, og regnskapet støtter det. Funnene fra manuell lesning 8.–9.
august:

| funn | hvordan |
|---|---|
| DD-løseren feil i 86 av 400 givinger | lesning + råsøker som orakel |
| 22,7 % av verdenene i stikk 1 regelstridige | lesning av `lovligeEtterlys` |
| kanal 2 nådde aldri fram fra speken | lesning av parameterkjeden |
| ruteren vred vårt EGET sete | lesning av `motpartFor` |
| `tro` sendes til workeren og leses aldri | lesning av meldingstypen |
| søket hadde ingen beskjæring i det hele tatt | lesning av `alphamu.ts` |

Seks feil, ingen benk. Til sammenligning har nattens målinger felt tre
hypoteser og bekreftet én.

**Lesning finner FEIL. Benking avgjør VERDI.** De svarer på ulike spørsmål, og
lesningen er hundre ganger billigere. Standarden er derfor: les koden
kontinuerlig, benk når noe skal avgjøres.

---

## Bærende prinsipp: modulene UTVIDER nettet, de overkjører det ikke

Arvind, 9. august: «det er ikke bra at det er konflikt mellom nettet og
modulene, fordi tanken var at modulene var en utvidelse av nettet og gjør det
slik at nettet kan ta mer informerte valg gjennom en hel kamp — som å maksimere
nytte.»

Det er en annen arkitektur enn den vi har, og den forklarer kollisjonene bedre
enn min egen diagnose gjorde.

### Forskjellen, sagt presist

|  | overstyring | **utvidelse** |
|---|---|---|
| hva laget sier | «jeg vet bedre, ignorer nettet» | «her er noe nettet ikke kunne se» |
| hvem bestemmer | siste lag som skriver | ÉN argmax over summen |
| ved uenighet | den ytterste vinner | begge bidrag teller |
| kollisjoner | uunngåelige | strukturelt umulige |

I dag er kjeden en stabel av overstyringer: `vakt` erstatter nettets valg,
`amu` erstatter vaktens, `vr` ligger utenpå igjen. Siste skriver vinner. Det er
**derfor** vi har hatt fire kollisjoner med identisk form — to deler som
optimerer ulike mål over samme beslutning:

    A6 avsender mot A7 leser      de frie kortvalgene, 36,2 %
    avsender mot leser            signalkoden var to koder
    søket mot vakten              68 % av valgene, ble til vetoen
    DD-fasit mot poeng            −0,609 korrelasjon

Vetoen (`v0.5`) var et halvt skritt i riktig retning: søket får bare overkjøre
vakten når marginen er stor nok. Men det er fortsatt en overstyring med en
terskel — ikke en sum.

### Formen vi skal ha

Hvert lag bidrar med et **tillegg til samme poengsum**, og beslutningen er én
argmax over totalen:

    score(kort) =  nettets verdi
                 + konvensjonsbonus      (vakt vet noe om åpningsutspill)
                 + søkets korreksjon     (amu vet noe om framtiden)
                 + stilkorreksjon        (okt vet noe om DENNE motstanderen)
                 + stillingskorreksjon   (race vet noe om kampen)

Da kan to lag aldri «vinne over» hverandre — de veier hverandre. Og hvert
tillegg har en vekt som kan **måles**, i stedet for en rekkefølge som avgjør alt.

Det er også nøyaktig det Arvind beskriver: nettet tar mer informerte valg
gjennom en hel kamp, fordi lagene gir det informasjon det ikke selv har.

### Og budmodellen skal til slutt virke likedan

«etterhvert må vi jo trene en budmodell som også funker på samme måte og byr
det aller beste basert på valg.»

Samme form: budet skal være én argmax over en sum av bidrag — egen styrke,
kampstillingen, og hvem vi byr mot — ikke en formel med unntak lagt oppå.

### Rekkefølgen, bestemt 9. august

1. **K2–K8 innfris.** Ingen destillering før det. Arvind: «jeg tenker ikke på
   distillering nå før adams max har nådd kravene.»
2. **Intern testing** når kravene står.
3. **Deploy.**

Destillering og ekspert-iterasjon er riktige verktøy, men de hører til ETTER at
kravene er innfridd — ellers destillerer vi en stakk vi ikke har validert.
