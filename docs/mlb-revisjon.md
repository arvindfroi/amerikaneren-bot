# Revisjon av MLB-planen

**Oppdrag:** finne det den forrige revisjonen ikke fant. Ingen målinger er kjørt;
alt under er lesning av `docs/mlb.md`, `docs/sandkassen.md`, `AdamsMax.md`,
`docs/plan.md` §104–§118 og koden de viser til.

---

## Dommen, i tre setninger

Planen er **ikke grunnleggende feil** — retningen er riktig og «start fra
tilfeldige vekter» er det ærlige valget. Men tre ting i den holder ikke som
skrevet: **«uten mester eller orakel» er ikke håndhevbart** mot sandkassens egen
inngangsliste, **læringsmålet er definert på runde mens K1 og K5 lever på kamp**,
og **kostnadsanslaget gjelder en bot planen ikke har tenkt å bygge.**

Hver av de tre ville kostet dager til uker hvis de ikke ble fanget nå. De to
første kan ikke rettes etterpå — de er valg som støpes inn i erfaringsbufferet og
i vektene.

---

# DE TRE ALVORLIGSTE

## R1 — «Uten orakel» holder ikke. Snikveiene er fem, og tre av dem er i sandkassen

Planen forbyr tre ting og forbyr E1-initialisering med en skarp begrunnelse:
«`d7alle` ER orakelets kunnskap i vektform.» Den begrunnelsen er riktig. Men den
er ikke anvendt konsekvent, og hvis den anvendes konsekvent, faller flere ting i
sandkassen ut.

### Herkomstregnskapet, lest i koden

| ting | hvor | herkomst | er det en mester? |
|---|---|---|---|
| `rask` i ligaen, 15 % | `examples/matrise.ts:100` | `vr:vrakrang.bin:telrd` + `budm:bud-vant.json` + `vakt:abmpf` + `e1:d7alle.bin` | **ja, dobbelt** |
| `d7alle.bin` | `rask` og alt annet | destillert fra `sd-orakel`-korpuset | **ja — planen sier det selv** |
| `vrakrang.bin` | inne i `rask` | `examples/vrakorakel.ts`: 60 verdener per kandidat, offline. Filhodet kaller den et orakel | **ja — dette ER «policy = søkets valg», lagret som fil** |
| budmodellens `μ` | sandkassen: «budmodellens egne tall … som TREKK» | `verktoy/hand-tren.py`: «Målet er **SD-orakelets lagstikk** for setet (`analyserGiv().sd[sete]`)» | **ja — som permanent INNGANG, ikke som startpunkt** |
| stiliserte vaner, 15 % | `examples/k6-vaner.ts:175` `lagTrumftrekker(spek)` | en kappe utenpå `lagIndre(spek)` — bud, vrak og trumfvalg tas av **hele Adams-stakken** | **ja, arvet** |
| `amu` som trekk | sandkassen §«Verktøyene som trekk» | `alphamu.ts` tar `prior` = nettets policy og ruller ut med nettet | avhenger av hvilket nett |
| `stilbias` som trekk | samme | residual mot `P_nett` | avhenger av hvilket nett |

**Fem av sju er orakelavledet slik de står i dag.** Og to av dem er verre enn
E1-initialisering, ikke bedre:

* **`vrakrang.bin` er ekspert-iterasjon i ferdig form.** AVGJØRELSE 2 forbyr
  «policy = søkets valg». `vrakorakel.ts` gjør nøyaktig det — søket merker, en
  modell lærer merkelappene — og resultatet ligger inne i `rask`, som planen
  setter i treningsligaen.
* **`μ` som trekk er permanent.** En E1-initialisering kan i prinsippet trenes
  bort. En orakeletikett som INNGANG kan aldri trenes bort: nettet får
  SD-orakelets håndvurdering gratis ved hver eneste budbeslutning, for alltid.

### Er det å SPILLE MOT et orakelnett det samme som å lære av det?

Ikke direkte, men skillet planen trekker («lærer nettet av noe sterkere enn det
selv?») fanger det likevel. Gradienten til MLB regnes på baner der tre av fire
seter er `rask`. Fordelsestimatet blir «bedre enn det som skjedde da d7alle
spilte», og policyen konvergerer mot et **beste svar på d7alle**. Informasjonen
går inn, den går bare inn gjennom miljøet i stedet for gjennom vektene. Å forby
E1-init og samtidig la 15 % av gradienten komme fra E1 er ikke en linje man kan
forsvare i en setning — og hele poenget med planen er at påstanden skal kunne
forsvares i én setning.

### Hva som er riktig i stedet

**Regelen som faktisk kan håndheves, og som bør stå i planen ordrett:**

> Ingen gradient og ingen INNGANG i MLB skal avhenge — direkte eller via en
> lagret fil — av `sd-orakel`, av dobbeltdummy, eller av `d7alle`. Målinger og
> rapportering kan bruke dem fritt.

Det gir en klar todeling, og den er lett å teste:

| lov | ikke lov |
|---|---|
| `rask` som MÅLESTOKK på kampbenken | `rask` som motstander i treningsligaen |
| `poengdds` som fasit i en rapport | `eks:` som trekk |
| konvensjonsvakten som flagg (menneskekunnskap, ikke orakel — men si det høyt) | `vrakrang.bin`, `μ`, `σ` som trekk |
| `amu`/`stilbias` med **MLBs eget nett** som prior | `amu`/`stilbias` med `d7alle` som prior |

**Konkrete erstatninger:**

1. **Treningsligaen får ingen `rask`.** Erstatt de 15 % med flere tidligere
   epoker og med regelbaserte motstandere (tilfeldig-lovlig, grådig-høyest,
   grådig-lavest, alltid-pass-over-9). De er svake, men de er orakelfrie og de
   gir bredde i fordelingen. `rask` flyttes til målestokken, der den hører
   hjemme — og der planen selv sier den hører hjemme («referansen MLB må slå»).
2. **De stiliserte vanene bygges på nytt uten `lagIndre(spek)`.** Kappa i
   `k6-vaner.ts` er riktig idé, feil basis. Basisen må være en MLB-epoke eller en
   ren regelagent. Dette er lite kodearbeid og det er en forutsetning for at K6
   i det hele tatt kan påstås innfridd orakelfritt.
3. **`μ`, `σ`, `vant[N]` og `vrakrang` ut av trekkmengden.** Nettet skal lære
   håndvurderingen selv — det er nettopp det hele øvelsen går ut på. (De koster
   dessuten mer enn de er verdt, se R3.)
4. **En herkomsttest, ikke en konvensjon.** `test/mlb-herkomst.test.ts`:
   `src/mlb/**` skal ikke importere fra `src/e1/`, `src/solver/dds.ts` eller
   `src/moe2/` bortsett fra rene regel-/motormoduler, og ingen `.bin`/`.json`
   fra `e1-modell/` skal kunne lastes fra treningsstien. Prosjektets egen
   arbeidsregel 6 gjelder: en test skal måle at noe **fyrer**, ikke at det
   finnes. Her: at importen faktisk er umulig, ikke at ingen har gjort den ennå.

**Og én ting til, som er ubehagelig:** hvis regelen over holdes, kan MLB heller
ikke bruke `montetro`-baserte sanser fra et orakeltrent trosnett. Det er greit —
trohodet skal jo lære det selv — men det betyr at sanseblokken er tom i epoke 0
og fylles av MLBs eget trohode. Det bør stå eksplisitt, for det er en ekstra
runde med bootstrapping som planen i dag ikke nevner.

---

## R2 — Læringsmålet er definert på RUNDE. K1 og K5 lever på KAMP. Da kan de ikke innfris

Planen sier, presist:

> **Verdi** ← rundens faktiske poeng for setet.
> `A(s, a) = r + V(s') − V(s)`

Dette gjør episoden til én runde. Tre konsekvenser følger, og alle tre er
alvorlige.

### 2a. Makronivået får eksakt null gradient — samme blindhet som gate 2

Sandkassen legger `racepress`, alles poeng og runder spilt inn som trekk. Men
hvis avkastningen stopper ved rundeslutt, er kampstillingen **strukturelt uten
signal**: to stillinger som er like i alt annet, men ulike i poengstillingen, har
identisk forventet rundepoeng. Nettet lærer da at makrotrekkene er støy — og det
er en riktig konklusjon gitt målet det får.

Dette er nøyaktig feilen prosjektet allerede har gjort to ganger og skrevet ned
begge:

* `r0.4` målte null i hver eneste måling fordi `framdrift = 0` på gate 2
  (`AdamsMax.md`, K5).
* `budm:kamp1.5` er «strukturelt usynlig på gate 2» (§112), og §113 skriver
  «porten kan bevislig ikke se modulen» i rapporten for ikke å la nullen bli
  lest som verdiløs.

**Arbeidsregel 3 fra kravkartet sier det selv: «spør hvilken benk som kan se
kravet».** Planen har ikke stilt det spørsmålet om sin egen treningsløkke. En
TRENING som ikke kan se et nivå, kan ikke lære det — og K5 er halve K5-utvidelsen
og hele koblingen K5 → K3.

### 2b. K1 er formulert i KAMPER, og «maksimer egne rundepoeng» er ikke det samme

Amerikaneren er et løp til 100. Å maksimere forventede egne poeng per runde er en
proxy for å maksimere P(vinne kampen), og de to skiller lag nøyaktig der K5 bor:
når du ligger 20 bak med tre runder igjen, er et bud med lavere forventning og
høyere spredning **riktig**. En agent trent på rundepoeng vil aldri velge det.

Matrisen bruker allerede poeng per runde som målestokk fordi den er 2,2× mer
presis enn vinnerandel (`matrise.ts`) — det er riktig for **måling**. Det er ikke
et argument for at det skal være **treningsmålet**.

### 2c. Verdihodet er skalart. Prosjektet har allerede bevist at det ikke holder

K5-fiksen i `AdamsMax.md` er utvetydig:

> `snitt + λ·press·spredning` kan bare velte et valg med et NEGATIVT ledd …
> **Fikset:** formen er nå en kvantilblanding over alpha-muens fulle
> utfallsvektor.

Og `budrace.ts` (§112) gjør det samme i budet, med `μ` og `σ`. **Begge stedene
måtte prosjektet gå fra et punktestimat til en fordeling for at
risikotilpasningen skulle kunne uttrykkes i det hele tatt.** MLBs verdihode er
ett tall. Det kan per konstruksjon ikke bære K5.

Og det er verre enn bare K5, på grunn av utbetalingsstrukturen i `regler.ts`:

```
tallbud n   ±2n / ±n          (opptil ±24 / ±12)
amerikaner  ±mål/2 og ±mål/4  = ±50 / ±25
solo        ±mål              = ±100
```

Med en tilfeldig initialisert policy er ~2 av 11 lovlige åpningshandlinger
`AMERIKANER` eller `SOLO` (`erHøyereBud` + `MINSTE_TALLBUD = 5` med
`antallStikk = 12`). **~18 % av budhandlingene tidlig i treningen er ±50/±100.**
Et middelverdi-verdihode trent med kvadratfeil på en så tunghalet fordeling er
ustabilt fra første epoke, og TD-fordelen arver hele halen.

### Hva som er riktig i stedet

1. **Episoden er en KAMP, ikke en runde.** Avkastningen er poengene til
   kampslutt, med rundepoengene som mellomliggende belønning. Terminalbelønning
   kan i tillegg være ±1 for vunnet/tapt kamp — da er verdihodet direkte tolkbart
   som «sannsynlighet for å vinne løpet», som er K1 sitt eget språk, og K5 blir
   en KONSEKVENS av å maksimere det i stedet for en knott som må måles inn.
2. **Verdihodet er fordelingsbærende.** Enten kvantiler (f.eks. 9 kvantiler av
   avkastningen) eller `(μ, σ)`. Kvantiler er å foretrekke: de er samme form som
   `racescore` allerede bruker, og de er robuste mot ±100-halen på en måte
   kvadratfeil mot et snitt ikke er.
3. **Skaler eller klipp belønningen.** Enten normaliser avkastningen med et
   løpende standardavvik, eller bruk et fortegns-symmetrisk transform. Si hvilket,
   og mål det — en uspesifisert reward-skala er en håndsatt konstant, og
   sandkassens hele premiss er at de skal bort.
4. **Bruk en PRIVILEGERT kritiker.** Dette er det største enkeltløftet planen
   ikke har med. Fordelsestimatet trenger ikke å være blind: `V` brukes BARE
   under trening, aldri ved spill. Et eget verdinett som ser **alle fire hender,
   hvem som er makker, og hvem motstanderne er**, gir dramatisk lavere varians i
   `A` uten å røre K2 med et fingertupp — fordi det aldri spørres når boten
   spiller. Planen tillater dette allerede etter sin egen liste over hva som ikke
   er et orakel («hvor kortene faktisk lå, kjent ved rundeslutt»).
   **Men det krever at kritikeren har EGEN kropp.** Planens «felles kropp +
   policy/verdi/tro» gjør det umulig: en felles kropp som fôres med skjult
   informasjon ville lekke inn i policyen. Arkitekturen må derfor være:
   *policy + tro deler kropp (bare `spillerVisning`), kritikeren er et eget nett
   med full stilling.* Dette er standard sentralisert-kritiker/desentralisert-
   aktør, og det er den ene endringen som mest sannsynlig avgjør om treningen
   konvergerer i det hele tatt.

---

## R3 — Kostnadsanslaget gjelder `rask`, men planen skal bygge sandkassen. Avviket er ~100×

Planen anslår:

| | anslag |
|---|---|
| kamp uten søk (`rask` mot `rask`) | ~2 s |
| kamper per epoke | 5 000–20 000 |
| epoketid, 20 skard | 10–40 min spilling |

**Anslaget på 2 s er riktig for `rask`.** `rask` er ren nettframoverpassering
(~0,5 ms per trekk, §«uten 0,5 ms per trekk»), og med ~1 400 beslutninger per
kamp (25 runder × [48 kortvalg + ~6 bud + vrak + trumfvalg]) gir det ~1,4 s.
Regnestykket henger sammen.

**Men sandkassen sier at verktøyene skal inn som TREKK:**

> | `amu` søket | valgt kort + utfallsvektor som trekk |
> | `eks`/`poengdds` | eksakt poengverdi når treet er lite nok |
> | budmodellen | μ, σ, `vant[N]` |

Målte kostnader fra prosjektets egne tall:

| trekk-kilde | målt kostnad per beslutning | per kamp (1 400 beslutninger) |
|---|---|---|
| bare nettet | ~0,5 ms | ~0,7 s |
| `amu 12k16` M=1 | **138 ms** (`AdamsMax.md`, K4) | **193 s** |
| `eks:5` | **118,7 ms** (§«uten 0,5 ms per trekk»-tabellen) | 166 s |
| gate2-replay med full stakk | 5,1 s per giv (§113) | ~127 s per kamp |

**Med `amu` som trekk koster en epoke på 5 000 kamper ~268 kjernetimer — 11
timer på 24 kjerner for ÉN epoke, og ~45 timer for 20 000 kamper.** «Titalls
epoker» blir da måneder, ikke dager.

Og planen sier det selv, én avsnitt lenger ned: *«et søk per beslutning ville
gjort epoken 100× dyrere»*. Det er riktig — og det er derfor `mlb.md` og
`sandkassen.md` **motsier hverandre**. Den ene fjerner søket fra treningsløkka
for å ha råd; den andre setter søkets svar inn som en inngang, som koster det
samme.

### Hva som er riktig i stedet

**Sett et eksplisitt trekk-budsjett: ≤ 2 ms per beslutning ved trening.** Da
sorterer inngangene seg selv:

| inn | ut |
|---|---|
| egen visning, bord, historikk, budrunde | `amu` valgt kort / utfallsvektor (138 ms) |
| hukommelsen (rene tellinger fra ferdige runder) | `eks:`/`poengdds` (119 ms ved 5 kort) |
| konvensjonsflagg (regelevaluering, mikrosekunder) | `μ`/`σ`/`vant` (også R1) |
| `racepress` (aritmetikk) | |
| eget trohode (én framoverpassering, ikke `monteTro`) | `monteTro` med V=64 per beslutning |

Merk den siste linjen: **MLBs trohode er BILLIGERE enn `monteTro`, ikke dyrere.**
Det er samme framoverpassering som policyen allerede gjør. Det er et av
planens sterkeste kort, og det er ikke sagt noe sted.

### Og det som gjør at trekklayouten ikke trenger å fryses i det hele tatt

Planen sier under «Det som må låses før første kamp genereres»:

> **trekklayout** — antall og rekkefølge. Ett trekk lagt til senere gjør hele
> erfaringsbufferet ubrukelig.

Det er bare sant hvis bufferet lagrer **trekkvektorer**. Regn på det:

| lagringsform | per epoke (7 M beslutninger) |
|---|---|
| ~600 trekk som float32 | **~17 GB** (og 67 GB ved 20 000 kamper) |
| samme som int8 | ~4 GB |
| **(frø, handlingslogg) per runde** | **~36 MB for 20 000 kamper** |

Én runde er ett frø (8 B) + ~60 handlinger à 1 byte. Hele epoken blir mindre
enn en logg-fil. Trekkene regenereres ved treningstid ved å spille runden om
igjen fra frøet — deterministisk, og med **samme** trekkbygger som spilte.

Tre ting løsner samtidig:

1. **Trekklayouten trenger ikke være låst for alltid**, bare innenfor én epoke.
   Det fjerner planens tyngste selvpålagte begrensning.
2. **Agent C trenger ikke vente på agent A** i samme forstand — jf. R8.
3. Diskbudsjettet forsvinner som problem på en laptop.

*Vrien:* regenereringen må skje med Node-trekkbyggeren, mens treningen er
Python/torch. Løsningen er å la Node regenerere og strømme int8-batcher til
treneren, **ikke** å skrive trekkbyggeren en gang til i Python. To
implementasjoner av én kode er `signal.ts`-feilen (avsender og leser hadde hver
sin kode), og den har prosjektet allerede betalt for.

### Epokebudsjettet bør telles i BESLUTNINGER, ikke i kamper

Kamplengden varierer med en størrelsesorden mellom tilfeldig og trent spill (en
tilfeldig policy melder solo, taper 100, og alle andre får ~4 poeng per runde).
«5 000 kamper» betyr derfor forskjellige ting i epoke 0 og epoke 20. Sett
gulvet i beslutninger: **≥ 10⁷ per epoke** er der jeg ville lagt det, som er
den øvre enden av planens intervall (20 000 kamper ≈ 28 M beslutninger) og ikke
den nedre.

### Og §46 er sitert feil

Planen skriver under «Ærlige risikoer»: *«§46: korpuset er allerede den bindende
skranken.»* Det er en sammenligning av epler og pærer:

* `sd-orakel` produserer **0,22 rader/s** (§86) fordi hver rad koster et SD-søk.
* Selvspill produserer **~700 rader/s** (1 400 beslutninger / 2 s).

Radene er altså **3 000× billigere**, og 306k er ikke skranken. Skranken er
**informasjon per rad**: en orakelrad bærer en full verdivektor over kortene, en
selvspillrad bærer én støyende skalar. Planens egne tall sier hvor ille: to
versjoner skiller lag i 9,4 % av valgene, og utfallet svinger 11,6 poeng når de
gjør det. Det er signal-til-støy per rad, og det er der regnestykket hører
hjemme — ikke i radtellingen. Formuleringen bør rettes, ellers forsvarer man
senere en feil beslutning med et riktig tall.

---

# RESTEN, SORTERT ETTER HVA DET KOSTER Å OPPDAGE SENT

## R4 — K2-prøven kan ikke se tre av de fire nye fasene

Planen skriver «K2-prøven MÅ passere» etter hver epoke. Men prøven slik den står
er `test/k2-aldri-jukse.test.ts`: **8 giv × 3 stillinger × 3 verdener, kortvalg
fra stikk 7.** `AdamsMax.md` har allerede skrevet ned hvorfor det er utilstrekkelig:

> **K2-prøven kunne ikke se det:** den prøver kortvalg fra stikk 7, der talongen
> for lengst er tatt opp. Lærdommen er generell — *en invariansprøve dekker bare
> de fasene den faktisk besøker.*

MLB utvider handlingsrommet fra én fase til fire. **Prøven dekker fortsatt én.**
BUD, VRAK og VELG er helt uprøvd, og vrakfasen er nettopp der talonglekkasjen
bet.

**Riktig i stedet, før Fase 1 erklæres bestått:**

* Prøven utvides til alle fire faser og til stikk 1–11, ikke bare fra stikk 7.
* **Én falsifiseringsarm per fase.** Den grønne halvdelen er verdiløs uten den —
  det er hele lærdommen fra `juks:6`, som ble tatt med 6 avvik av 9.
* Trekk-blindhetsprøven i 0.1 må dekke **hukommelsestrekkene og trostrekkene**,
  ikke bare korttrekkene. Merk hvorfor: `monteTro(state, sete, …)` tar hele
  `GameState` og stoler på at `trekkVerdener` filtrerer riktig — det er nøyaktig
  lekkasjeflaten talongfeilen bodde i. Bygger MLB sitt eget trohode fra
  `spillerVisning`, forsvinner flaten; gjenbrukes `monteTro`, gjør den det ikke.

## R5 — K3, K4-B og K7 kan IKKE innfris av et rent nett. Det må avgjøres før Fase 0

Dette er den mest oversette konflikten i planen, og den er formell:

| krav | prøven, ordrett | kan et nett bestå den? |
|---|---|---|
| **K3** | «beslutningen tas av et **søk eller en løser**, ikke av en håndskrevet regel» | **nei** — et nett er ingen av delene |
| **K4-B** | «Alpha-mu med `M ≥ 2` … gevinsten ved M=2 mot M=1 må være målt og positiv» | **nei** — det finnes ingen `M` |
| **K7** | «i stillinger der en eksakt løsning finnes, må Adams velge den — **100 % samsvar**, ikke 95 %» | **nei** — et nett gir aldri 100 % |

Planen tillater «søket som SPILLEKOMPONENT i sanntid». Da kan MLB rulles ut MED
`amu` og `poengdds` oppå. **Men da er det trente og det utrullede ikke samme
ting**, og det er prosjektets arbeidsregel 4, funnet brutt **tretten ganger** og
håndhevet av `test/utrullet-lik-maalt.test.ts`. Verre: hele epokeporten måler da
en annen bot enn den som lærte, og §113s egen lærdom slår inn — «en modul måles
i det selskapet den står i», og `amu:alle` snudde fortegn fra −0,28 til +0,48 av
nettopp det.

**Riktig i stedet:** avgjør dette FØR Fase 0, ikke etter, for det bestemmer om
søket må være i treningsløkka (som R3 sier vi ikke har råd til):

* **Alternativ A — ren MLB.** K3, K4-B og K7 sine prøver må formuleres om
  sammen med Arvind. K3 blir «beslutningen er lært eller søkt, ikke en
  håndskrevet regel»; K7 blir «i tvungne stillinger 100 % samsvar, ellers gapet
  til den eksakte løsningen målt og under X». Det er en kravendring og krever
  hans ja.
* **Alternativ B — MLB som bunnlag, søk oppå ved spill.** Da må minst PORTEN
  og alle epokemålinger kjøres med søket på, selv om treningen ikke har det, og
  kostnaden i R3 gjelder da for målingen i stedet for for spillingen. Det er
  fortsatt N ganger dyrere, bare på en annen post.

Planen tar ikke dette valget noe sted, og det er ikke et detaljvalg — det
avgjør budsjettet.

*Merk også:* K7 er den delen §117 avgjorde som **ikke søkebegrenset** —
«dypere eksakt søk kjøper ikke informasjon», potten ligger i kontraktvipp der
kortet må gjettes. Det er et argument FOR at MLBs trohode er riktig vei mot K7.
Det argumentet bør stå i planen; det er et av dens beste, og det står ikke der.

## R6 — Ligaen trener på testmotstanderen. K6 blir da ikke etterprøvbar

K6-prøven er: sett Adams mot en **stilisert** motstander med en utnyttbar vane,
gevinsten må vokse med rundenummeret. Planen setter **den samme stiliserte
motstanderen i treningsligaen med 15 %.**

Da beviser en bestått K6-prøve ingenting om evnen kravet handler om. Arvinds ord
er «lære seg andre spillere sine vaner **ila spillet**». Et nett som har møtt
trumftrekkeren i tjue epoker har vanen bakt inn i vektene og trenger ingen
hukommelse i det hele tatt. Punkt 2 (vekst med rundenummer) diskriminerer
delvis — men bare delvis, for et nett kan lære «trumfutspill tidlig i runden ⇒
oppfør deg slik senere» uten at noe læres i løpet.

**Riktig i stedet:**

* **Del vanene i to disjunkte sett.** Tren mot sett A (f.eks. alltid-lavest,
  alltid-pass-under-10, aldri-trumf-utspill). Test K6 på sett B (trumftrekkeren,
  som er den prøven bruker i dag). Holdout på MOTSTANDERE, ikke bare på frø. Det
  er samme prinsipp som `sd-tren.py` allerede håndhever på giv, og det er det
  eneste som gjør K6 til en evne-prøve i stedet for en gjenkjenningsprøve.
* **Legg til en «ukjent vane»-arm** som ingen epoke har møtt. Det er den ekte
  prøven på generalisering, og den koster ingenting ekstra.

**Og ligaandelene er tvetydige.** 40/30/15/15 — per SETE eller per BORD? I
Amerikaneren avgjøres laget av budet, så et bord med tre stiliserte og én MLB er
en fordeling den utrullede boten aldri møter. `matrise.ts` har allerede løst
dette og skriver at speilingen «ikke er valgfri»: to av hver, hver giv speilvendt,
så seteeffekten faller ut. **Ligaen bør arve den strukturen**, både for
treningsbordene og for porten.

## R7 — Porten bryter prosjektets egen adopsjonsregel, og gjør det titalls ganger

Planen: *«port: slår den forrige epoke PARRET, over 2 SE? → inn i befolkningen»*.

Sammenlign med arbeidsregel 1 i `AdamsMax.md`:

> Aldri adoptere på støy: **parret på giv, replikert i disjunkte frøbånd,
> tegntest ved siden av snittet.** Kontrollarmen må måle eksakt 0,0000 (gate 2)
> eller 0,2500 (kampbenken).

Porten har parringen. Den mangler **replikeringen, tegntesten og kontrollarmen** —
alle tre. Og prosjektet har blitt tatt av nøyaktig dette to ganger:

* §65: auksjonskorreksjonen, z = 0,71 i ett bånd og 0,54 i det neste.
* §109: vetoen, +0,4809 i ett bånd og +0,1742 i det neste. *«Ett bånd er ikke et
  funn.»*

I tillegg: en 2-SE-port anvendt **titalls ganger** har en falsk-positiv-rate
rundt 2–5 % per epoke, altså flere falske forfremmelser over et løp. Det er
mekanismen bak «ligakollaps», som planen nevner som risiko uten å koble den til
sin egen port.

**Riktig i stedet:**

1. To disjunkte frøbånd + tegntest + kontrollarm, som overalt ellers.
2. **Forfremmelsesbåndet må være disjunkt fra treningsfrøene.** Planen har
   «holdout-frøbånd avsatt før første kamp» i låselisten, men sier ikke at
   porten skal bruke det. Hard påstand i koden, som `er_holdout` i `sd-tren.py`.
3. **Ikke port mot forrige epoke alene.** Liga-spill er intransitivt: A slår B,
   B slår C, C slår A. En kjede av «slår forrige» kan gå i ring i det uendelige
   mens absolutt styrke står stille. Port mot et **panel**: forrige epoke + to
   tilfeldig trukne eldre epoker + et frosset epoke-0-anker, og loggfør en
   Elo/Bayeselo mot `rask` som fast skala. Da ser man forskjellen på framgang og
   sirkling — som er den ene tingen man ikke kan se etterpå.

## R8 — Avhengighetsgrafen mellom agentene er feil

Planen sier: *«A og B er helt uavhengige (ulike filer, ulike data).»*

Det stemmer ikke. Agent B eier hukommelsen, og sandkassen lister ~14 statistikker
× 3 motstandere × (verdi + `n`) ≈ **84 trekk** som B definerer. De trekkene ER en
del av trekklayouten som agent A skal låse før C kan begynne. Riktig graf:

```
B (hukommelse: hvilke tall, hvor mange)  →  A (layout, indeksering)  →  C (nett, selvspill)
                                          ↘  D (liga, målerigg: trenger handlingsindeksering)
```

D er heller ikke uavhengig: porten må kjenne handlingsrommets indeksering og
agentspekformatet for MLB.

**Riktig i stedet:** enten lander B før A låser, eller — bedre — A reserverer en
blokk med fast størrelse og et versjonsnummer for hukommelsen, og bufferet lagrer
frø + handlingslogg (R3) slik at layouten kan endres mellom epoker uten å kaste
noe. Da er A og B faktisk uavhengige, og påstanden i planen blir sann i stedet
for antatt.

## R9 — TD-formen er underspesifisert, og ett ledd er direkte feil

Spørsmålene i oppdraget besvart konkret:

**Hva er `s'`?** Agentens EGEN neste beslutningsstilling — ikke «neste stilling».
Mellom `s` og `s'` handler tre andre, og overgangen er derfor ikke en
Markov-overgang agenten kontrollerer, men en **fordeling over ligaens policyer**.
Det er velformet så lenge ligaen er frosset innenfor en epoke, og planen bør si
det uttrykkelig: *ligaen fryses ved epokestart; `V` refittes on-policy mot
nøyaktig den blandingen.* Gjenbrukes `V` eller baner på tvers av ligaskifter uten
viktighetsvekting, er TD-målet skjevt, og skjevheten ser ut som framgang.

**Hva er `r`?** Planen skriver *«`r` er poengene som falt imellom»*. **Det er
feil for dette spillet.** `beregnPoeng` deler ut poeng bare ved rundeslutt.
`r = 0` for hvert eneste kortvalg innenfor runden; det eneste ikke-null-leddet er
ved rundegrensen (og ved kampslutt, hvis R2 følges). Formuleringen bør rettes,
ellers bygger noen inn en mellomliggende belønning som ikke finnes.

Følgen er verdt å si: TD(0) gjennom ~12 egne steg med null belønning og et
tilfeldig initialisert `V` er den tregeste varianten som finnes. **Bruk n-steg
eller λ-avkastninger** (GAE), og vær ærlig om at `V` i epoke 0 er støy, så de
første epokene i praksis er ren Monte Carlo uansett.

**Er verdihodet veldefinert når laget skifter?** Ja — hvis målet er **egne**
poeng, som er den faktiske individuelle utbetalingen i et løp til 100. Laget
påvirker bare fordelingen, ikke definisjonen. Men to ting kompliserer:

* **Makkeren er skjult** til det etterlyste kortet faller (`makker: number | null`
  i `PoengInput`, og `null` hvis ingen fant kortet). `V` er derfor en
  **trostilstandsverdi**, ikke en tilstandsverdi. Variansen er tilsvarende høy.
  Dette er det sterkeste enkeltargumentet for den privilegerte kritikeren i R2.
* **`standardMål` («egne minus snittet av de tre andre») er IKKE det samme som
  egne poeng**, og §115 lot dette stå åpent for ETIKETTER, ikke bare for søket.
  Planen sier «rundens faktiske poeng for setet» — det er råpoeng, ikke
  `standardMål`. Godt valg, men det bør stå eksplisitt at det er et bevisst
  brudd med `standardMål`, ellers gjenoppfinner noen `standardMål` i uke to. Og
  merk at råpoeng gjør miljøet ikke-nullsum, så kontrollarmens «summen over fire
  seter er eksakt null» **gjelder ikke lenger**. Det er et reelt tap: den
  kontrollen er den beste benken prosjektet har. Porten må da bruke en annen
  identitet (speiling), jf. R6.

**Off-policy-korreksjon mangler helt.** Planen har en «erfaringsbuffer», men
ingen av: viktighetsvekting, PPO-klipping, V-trace, eller «strengt on-policy per
epoke». Med en buffer som spenner over flere policyoppdateringer og en liga som
skifter, divergerer vanlig policygradient. **Og dette er en FORMATBESLUTNING som
må tas før første kamp:** atferdspolicyens log-sannsynlighet for den valgte
handlingen må lagres sammen med handlingen. Den mangler i planens låseliste i §5,
og den kan ikke legges til etterpå uten å kaste bufferet.

**Entropibonusen trenger et gulv og en nedtrapping.** Planen sier «entropibonus
i tapet som holder fordelingen fra å kollapse» uten koeffisient og uten plan for
hvordan den avtar. En fast entropibonus setter et gulv på hvor skarp policyen kan
bli, og det gulvet vises som en permanent styrkekostnad ved måling. Si hvordan
den avtar, og mål det.

## R10 — Argmax ved måling har en pris planen ikke nevner

AVGJØRELSE 4 er riktig begrunnet — parringen forutsetter determinisme. Men
konsekvensen er at den **utrullede** boten er deterministisk, og i et spill med
imperfekt informasjon er en deterministisk policy per definisjon utnyttbar. K1
måles mot MENNESKER som spiller mange kamper mot samme bot over en kveld. Og K6
sier at Adams skal utnytte andres vaner — den samme mekanismen virker begge veier.

I tillegg er det et trene/teste-avvik: nettet trenes under sampling og rulles ut
under argmax, altså i en annen fordeling enn den lærte.

**Riktig i stedet:** sample, men med en RNG frøet av en hash av den **synlige**
stillingen. Da er valget:

* deterministisk gitt stillingen ⇒ parret måling virker, K2-prøven virker;
* men blandet over stillinger ⇒ policyen forblir en blandet strategi, og
  trene/teste-avviket forsvinner.

Frøet må komme fra `spillerVisning`, ikke fra `state` — ellers er hashen selv en
K2-lekkasje.

## R11 — Tapsvekting mellom de tre hodene er ikke nevnt, og trohodet vil spise alt

Trohodet har 52 × 3 = **156 utganger med perfekte etiketter ved hver eneste
beslutning**. Policyhodet har én støyende skalar. Uten eksplisitt vekting
dominerer trotapet kroppens gradient fullstendig, og policyen blir en passasjer.

Det er ikke bare negativt — et sterkt hjelpetap er nettopp det som gjør at
kroppen lærer en god representasjon av skjult informasjon, og det er sannsynligvis
den viktigste grunnen til at denne arkitekturen kan virke. Men vektene må stå i
planen som **målte hyperparametre**, ikke som noe som «finner seg selv». Og
trotapet må normaliseres per beslutning (antall usette kort varierer fra 39 til 3
gjennom runden), ellers vektes tidlige stikk 13× tyngre enn sene — som er motsatt
av der troen er verdt noe.

## R12 — Kaldstarten i budrunden er en egen patologi

Med tilfeldige vekter er policyen ≈ uniform over lovlige handlinger:

* **~18 % av budhandlingene er `AMERIKANER` eller `SOLO`** (2 av 11 lovlige ved
  åpning). Begge feiler praktisk talt alltid, begge gir ±50/±100, og `SOLO`
  avslutter auksjonen umiddelbart (`motor.ts:420`).
* De første epokene blir dermed dominert av auksjonsstøy, og **kortspillet får
  nesten ingen data** — det er den delen som trenger mest.
* `ALLE_PASSET` gir ny giving uten poeng (`motor.ts:429`). Sjelden (~0,01 %) med
  uniform policy, men det bør logges: en policy som lærer «pass er trygt» kan
  drive dit, og da produserer epoken runder uten læringssignal.

**Riktig i stedet:** masker `AMERIKANER`/`SOLO` bort i de første epokene og åpne
dem når policyen har en verdifunksjon som kan vurdere dem, og logg tre
helsetall per epoke: andel amerikaner/solo, andel `ALLE_PASSET`, og
budfordelingen. Å oppdage dette på epoke 12 i stedet for på epoke 0 er en uke.

## R13 — Toveis-runden mellom Python og Node er ikke nevnt, og den har bitt fjorten ganger

Treningen skjer i Python/torch (`verktoy/*-tren.py`), spillingen i Node
(`src/e1/nett.ts` leser `.bin`). Det betyr at hver epoke har en eksport-runde der
det trente og det spilte kan skille lag. Prosjektets mest gjentatte feilklasse er
nettopp **«det målte var ikke det jeg mente»** — funnet fjorten ganger, sist i
§118.

**Riktig i stedet:** en bit-identitetsprøve i Fase 1, før første epoke: samme
inngangsvektor gjennom torch-modellen og gjennom Node-loaderen, avvik = 0 (eller
under en oppgitt flyttallstoleranse, sagt høyt). Prosjektet har allerede
`test/nett-glissen.test.ts` og `test/amu-bitidentisk.test.ts` som mal. Uten den
måler hver epokeport en annen bot enn den som ble trent, og feilen ser ut som
manglende framgang.

## R14 — Småting som likevel må rettes før layouten låses

* **`sandkassen.md` sier «BUDRUNDE | pass, bud 5–13, amerikaner, solo».** Med
  fire spillere og byttekort er `antallStikk = 12`, så lovlige tallbud er
  **5–12**. Bud 13 finnes bare i klassiske regler uten talong. Handlingsrommets
  indeksering er én av de fem tingene som skal låses før første kamp — da må den
  være riktig.
* **`mlb.md` §Fase 2 sier «tren policy (utfall)»**, men AVGJØRELSE 3 sier TD.
  Sandkassens hodetabell sier også «policy ← utfallet». Tre steder, to
  forskjellige signaler. Rett dem til samme.
* **Trohodets etiketter summerer ikke til 1.** §117 nevner det som en av tre
  fanget målefeil: «troens rader summerer ikke til 1 — resten er talongen». MLBs
  trohode må ha en **fjerde klasse (talong/død binge)**, ellers lærer det en
  systematisk skjev fordeling. Det står ikke i planen, og det er en
  arkitekturdetalj som ikke kan legges til etterpå uten å trene om.
* **Ingen holdout for trohodet** som er atskilt fra policyens.

---

# HVA SOM MANGLER HELT, OG SOM JEG VILLE LAGT INN FØRST

## M1 — Trohodet alene, som første milepæl. Dette er planens billigste sannhet

Trohodet er **ren veiledet læring med perfekte etiketter**. Ingen
kredittilordning, ingen liga, ingen policygradient, ingen konvergensspørsmål. Det
kan trenes på selvspill fra en hvilken som helst lovlig policy — også en
tilfeldig — og prøves med `examples/tro-noyaktighet.ts`, som allerede finnes.

Og §117 gir oss en **forhåndsberegnet gevinst**: dagens tro taper 0,0211 i
log-tap mot `gulv+` ved V=64 utelukkende på Monte-Carlo-oppløsning
(Jensen-straffen). **Et nett har ingen slik straff — det er en analytisk
fordeling.** Bare ved å fjerne oppløsningsstraffen bør et trohode lande over
`gulv+` uten å ha lært en eneste slutning.

Derfor: **tren trohodet først, og kjør K8-prøven, før én time brukes på
policyen.**

* Passerer det `gulv+` og beveger seg mot de 5,86 %: arkitekturen er sunn, og vi
  har det første nye tallet på K8 siden §117 — for en dags arbeid.
* Klarer det ikke `gulv+`: kroppen, trekkene eller treningsoppsettet er galt, og
  vi vet det på dag én i stedet for i uke fire.

Dette er den eneste delen av planen som kan gi et **falsifiserbart resultat før
ligaen i det hele tatt bygges**, og den mangler.

## M2 — En avbruddsstige med veggklokke

Planen sier riktig at «hvis MLB ikke slår `rask` etter rimelig tid, er DET
resultatet». Men «rimelig tid» er ikke et tall, og uten et tall blir svaret
alltid «én epoke til». Sett stigen nå, mens ingen er investert:

| milepæl | mot | budsjett |
|---|---|---|
| slår tilfeldig-lovlig | frosset anker | 1 epoke |
| slår grådig-høyest | regelagent | 3 epoker |
| slår NevroHjerne | eksisterende benk | 10 epoker |
| slår `rask` | matrisen, speilvendt | oppgitt tak |

Med tall ved siden av, og «hva vi gjør hvis den ikke nås» skrevet før vi vet
svaret.

## M3 — Andre ting som ikke står noe sted

* **Determinisme i selvspillgeneratoren.** Samme giv må kunne spilles av to armer
  — hele måledisiplinen hviler på det. Frøstrømmens struktur må låses sammen med
  de fem andre tingene i §5.
* **Hard påstand om at treningsfrø og målebånd er disjunkte** (`er_holdout`-mønsteret).
* **Korrelasjon innenfor giv.** Alle fire seter i samme runde produserer data
  fra samme kortfordeling. SE-en i porten må parres på giv, ikke på rad —
  prosjektet vet dette, men planen sier det ikke.
* **Hva det koster å måle.** Planen sier «måletid kommer i tillegg, og den er
  ikke liten» uten et tall. Med panelport (R7), to bånd og speiling er porten
  sannsynligvis i samme størrelsesorden som spillingen. Da er halve budsjettet
  måling, og det bør stå.
* **Utrullingen.** Et nett med sanseblokk og hukommelsestrekk er langt større
  enn `d7alle`. Appen og webarbeideren laster nettet i nettleseren. Ingen har
  sjekket om det er mulig.

---

# HVA JEG ER USIKKER PÅ, OG HVA SOM VILLE AVGJORT DET

| usikkerhet | hva som avgjør den |
|---|---|
| Om selvspill-policygradient konvergerer i det hele tatt i et firespillerspill med imperfekt informasjon og skjult makker. Det finnes ingen garanti; ligaen med tidligere epoker er en form for fiktivt spill, som hjelper, men beviser ingenting | M1 (trohodet) + en kurve fra epoke 0 til 3 mot et frosset anker. Hvis kurven er flat etter tre epoker med 10⁷ beslutninger hver, er formen feil, ikke budsjettet |
| Om størrelsesordenen 10⁷ beslutninger per epoke er riktig. Jeg stoler ikke på den bedre enn en faktor 3 | Mål gradientstøyen direkte: SNR over økende batchstørrelse i epoke 1. Det er en times arbeid og det erstatter gjetningen med et tall |
| Om verktøy-trekkene er verdt kostnaden. Jeg tror ikke det, men jeg har ikke målt det | En ablasjon med `amu`-trekk av/på etter epoke ~5 — mulig BARE hvis bufferet lagrer frø og ikke trekkvektorer (R3) |
| Om den privilegerte kritikeren faktisk senker variansen nok til å betale for et ekstra nett | To kritikere trent parallelt på samme baner i epoke 1–2, sammenlign forklart varians. Ingen policyendring, ingen risiko |

---

# ÉN TING PLANEN HAR HELT RETT I

**Å starte fra tilfeldige vekter er riktig**, og begrunnelsen er den beste
setningen i dokumentet: alternativet er å bygge Adams Max på en påstand vi ikke
kan forsvare. Sidearmen med E1-initialisering, bare for å vite hva starten var
verdt, er også riktig — den koster lite og den svarer på et spørsmål vi ellers
ville kranglet om.

**Og trohodet er den delen av planen som mest sannsynlig virker.** §117 sa at
veien videre for K8 «ikke går gjennom flere slutningsregler». Et lært trohode er
nøyaktig det motsatte av en slutningsregel, og det slipper unna Jensen-straffen
som i dag koster mer enn alle slutningene til sammen gir. Hvis noe i denne
planen kommer til å flytte et krav fra nei til ja, er det den.
