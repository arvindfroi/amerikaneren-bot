# Arena: PIMC-boten mot appens MesterAI

Hode-mot-hode-testing av **denne motorens PIMC-bot** mot **MesterAI**
(«President»-nivået, inkludert NevroHjerne-nettet) fra
[Amerikaneren-App](https://github.com/arvindfroi/Amerikaneren-App), i hele
kamper til 100 poeng.

## Slik henger det sammen

```
examples/arena.ts  (Node, autoritet)          arena/adapter  (Swift, speil)
┌───────────────────────────────┐   NDJSON    ┌─────────────────────────────┐
│ vår motor: deler ut, validerer │ ◄────────► │ appens GameEngine i synk    │
│ og fører poeng                 │  stdin/out │ + AIPlayer(.president):     │
│ våre seter: velgHandling()     │            │   MesterAI + NevroHjerne    │
└───────────────────────────────┘             └─────────────────────────────┘
```

- **Vår motor er dommer.** Den deler ut kortene (seedet), validerer hver
  handling og fører poeng. Adapteren får tilsendt hver utførte handling og
  holder appens `GameEngine` identisk i synk; når et MesterAI-sete er i tur,
  spør driveren adapteren om beslutningen. Ingen av botene ser noensinne
  skjulte kort – hver side bruker sin egen informasjonsmodell, som i appen.
- **Synk verifiseres** etter hver handling (fase + poengsummer). Et avvik
  stopper kjøringen med feilmelding i stedet for å gi et ugyldig resultat.
- **Speilede par:** kamp 2k og 2k+1 bruker samme frø (samme givere), men
  MesterAI bytter fra setene {0,2} til {1,3}, slik at kort- og
  posisjonsflaks nulles ut.
- Regelverkene i de to motorene er verifisert identiske (4 spillere, 12 kort
  + 4 byttekort, bud 5–12, Amerikaner/solo, poeng 2n/n, ±50/±25, ±100,
  først til 100).

## Bygging

Krever Swift 5.9+ ([swift.org](https://swift.org/download/), kjører fint på
Linux) og en klone av app-repoet. Appkilden kopieres inn (den sjekkes ikke
inn her) og adapteren bygges:

```bash
./arena/hent-appkode.sh /sti/til/Amerikaneren-App
cd arena/adapter && swift build -c release && cd ../..
```

## Kjøring

```bash
npm run arena                       # 2 kamper (ett speilet par), 450 ms/kortvalg
node examples/arena.ts --kamper 8 --ms 450 --froe 2026
```

| Flagg | Standard | Betydning |
|---|---|---|
| `--kamper` | 2 | Antall kamper (partall gir hele speilede par) |
| `--ms` | 450 | Tidsbudsjett per kortvalg for **begge** botene (MesterAIs `tidsbudsjett` og vår `tidsbudsjettMs`); 450 ms er appens standard |
| `--froe` | 20260724 | Frø for kortgivingen (par 2k/2k+1 deler frø) |
| `--adapter` | `arena/adapter/.build/release/adapter` | Sti til adapterbinæren |

Utskrift per kamp: vinner, seter, rundetall, sluttpoeng og tidsbruk – og til
slutt kampseire, snittpoeng per kamp og budstatistikk per bot.

## Benchmark: alle botene i begge repoene

`npm run benchmark` (`examples/benchmark.ts`) måler **hver bot i begge
repoene** på app-harnessens egen målestokk: én bot mot **3× Vanskelig**
(appens heuristikk-anker) i hele kamper til 100 poeng, med kandidaten
roterende gjennom alle fire seter og alle kandidater mot de samme giverne
(delte frø). Metrikk: snittpoeng per kamp, vinnerandel og budtreff.

```bash
npm run benchmark                                   # standard oppsett
node examples/benchmark.ts --instant 48 --sok 16 --ms 50
node examples/benchmark.ts --kun pimc,mester --sok 24 --ms 300
```

| Flagg | Standard | Betydning |
|---|---|---|
| `--instant` | 40 | Kamper for de raske botene (heuristikk + nett) |
| `--sok` | 12 | Kamper for søkebotene (pimc, pimc-rask, mester) |
| `--ms` | 50 | Tidsbudsjett per kortvalg for søkebotene |
| `--froe` | 90000 | Frø-base (alle botene deler giverne) |
| `--kun` | – | Kommaliste, f.eks. `--kun pimc,mester` |

### Resultat (48 instant / 16 søk-kamper, søkebudsjett 50 ms/kortvalg)

| # | Bot | Kilde | Snittpoeng | Vinn% | Budtreff |
|---|-----|-------|-----------:|------:|---------:|
| 1 | **MesterAI (President)** | app | **105,3** | 94 % | 86 % |
| 2 | NevroHjerne (rent nett) | app | 90,1 | 52 % | 76 % |
| 3 | **PIMC-rask** (denne motoren) | motor | 78,7 | 56 % | 72 % |
| 4 | Middels | app | 72,7 | 23 % | 86 % |
| 5 | Vanskelig *(anker)* | app | 71,9 | 17 % | 86 % |
| 6 | Lett | app | 67,7 | 17 % | 77 % |
| 7 | PIMC, 50 ms *(se under)* | motor | 43,1 | 13 % | 60 % |
| 8 | Heuristikk uten søk | motor | 40,8 | 0 % | – |

Å lese ut av tabellen:

- **MesterAI er klart sterkest** – 105 poeng og 94 % kampseier mot feltet.
  Det bekreftes av det direkte oppgjøret (under), der MesterAI slår vår
  PIMC 4–0.
- **Det nevrale nettet alene** (uten søk, bare tre små MLP-er) er nest best
  og slår alle heuristikkene – imponerende for mikrosekunder per trekk.
- **PIMC-algoritmen vår er solid:** `pimc-rask` (fast antall verdener) lander
  på 3.-plass, over hele Vanskelig/Middels/Lett-feltet.
- **Anker-kalibreringen stemmer:** Vanskelig mot 3× Vanskelig gir ~72 poeng,
  omtrent det en gjennomsnittsspiller i feltet skal få. Lett ligger under,
  Middels/Vanskelig likt (innenfor støyen på 48 kamper).
- **Heuristikken uten søk** melder aldri (for konservativ budterskel), så den
  lever kun av forsvarsstikk og havner sist.

**Det viktige forbeholdet – wall-clock på tvers av språk.** Benchmarken gir
begge motorene samme tidsbudsjett i millisekunder, men Swift rekker langt
flere samplede verdener per millisekund enn Node. Ved 50 ms er derfor vår
**tidsbudsjetterte** PIMC verdenssultet (rekker bare noen få verdener med
`terskel: 7`) og faller under sitt eget raske faste-verden-oppsett. Gir man
den et realistisk budsjett løfter den seg kraftig:

| PIMC-oppsett | Snittpoeng mot 3× Vanskelig |
|---|--:|
| `--ms 50` (verdenssultet) | 43,1 |
| `pimc-rask` (10 faste verdener) | 78,7 |

Med andre ord: PIMC-**algoritmen** er sterk (3.-plass som `pimc-rask`); det er
Node-ved-50 ms som straffer den tidsbudsjetterte varianten. For en rettferdig
sammenlikning av selve spillstyrken, bruk `pimc-rask` eller et større `--ms`.

### Direkte oppgjør: PIMC mot MesterAI (2 mot 2, speilede par)

`npm run arena` setter de to søkebotene rett mot hverandre. Ved 300 ms per
kortvalg (appens standard) over fire speilede kamper:

```
Kampseire:      MesterAI 4 – 0 PIMC
Snittpoeng/kamp (2 seter): MesterAI 175,8, PIMC 90,8
Budrunder vunnet: MesterAI 46 (klarte 85 %), PIMC 11 (klarte 64 %)
```

MesterAI vinner både flere budrunder og innfrir dem oftere. De største
forskjellene som forklarer gapet – budvekting av verdener, ekstra
sampler-slutninger, matchbevisst og pass-simulerende budgivning – er
analysert i topp-nivå-sammenlikningen (se prosjektets hovednotat).

## Kontrollert benchmark: støy- og driftstyrt rangering

`npm run benchmark-kontrollert` (`examples/benchmark-kontrollert.ts`) svarer på
det samme spørsmålet som benchmarken over – nevronett vs. PIMC vs. MesterAI –
men med feilkildene styrt i stedet for antatt bort. Tre ting er forskjellige:

1. **Duplikatblokker.** Hvert frø spilles fire ganger, med kandidaten i sete
   0, 1, 2 og 3. Analyse-enheten er blokken, ikke enkeltkampen (de fire
   kampene deler kort og er korrelerte). Alle kandidater møter de samme
   blokkene, så sammenlikningen mot ankeret er paret.
2. **Verdensmatchet søk.** MesterAI får et tidsbudsjett som aldri biter, og
   begge søkebotene får samme antall verdener per kortvalg og samme eksakte
   sluttspillsdybde. Å gi begge like mange millisekunder måler Swift mot
   Node, ikke algoritme mot algoritme.
3. **En metrikk som ikke driver.** Se poengdrift-avsnittet under.

```bash
npm run benchmark-kontrollert
node examples/benchmark-kontrollert.ts --blokker 16 --verdener 28 --terskel 6
node examples/benchmark-kontrollert.ts --kun mester,pimc --gjenta   # støygulv
node examples/benchmark-kontrollert.ts --nett e1=trening/e1.json    # egne nett
node examples/benchmark-kontrollert.ts --fra kjoering.json          # reanalyse
```

| Flagg | Standard | Betydning |
|---|---|---|
| `--blokker` | 8 | Duplikatblokker (1 blokk = 4 kamper, ett frø) |
| `--froe` | 90000 | Frøbase; blokk b bruker frø `froe+b` |
| `--verdener` | 28 | Verdensmatchet søk: verdener per kortvalg |
| `--terskel` | 6 | Stikk som løses eksakt (begge søkebotene) |
| `--ms` | 0 | > 0: mål i millisekunder i stedet for verdener |
| `--anker` | `vanskelig` | Motstanderen kandidaten måles mot |
| `--nett` | – | `navn=sti,navn=sti` – NEAT-genomer som kandidater |
| `--gjenta` | av | Kjør rutenettet to ganger (måler støygulvet) |
| `--fra` | – | Regn rapporten om fra en tidligere `--json`-fil |

### Resultat (16 blokker × 4 seter = 64 kamper per bot, 28 verdener)

Metrikken er **diff/runde** = (egne poeng − snitt av de tre motstanderne) /
runder, og **diff@7r** er den samme differansen avkortet til de 7 første
rundene av hver kamp (felles nevner – kan ikke drive med kamplengden).

| # | Bot | Kilde | diff/runde (95 % KI) | diff@7r | Vinn% | Budtreff |
|---|---|---|---:|---:|---:|---:|
| 1 | **MesterAI (President)** | app | **+4,17 ± 0,57** | +3,68 | 88 % | 86 % |
| 2 | **NevroHjerne (appens nett)** | app | **+1,45 ± 0,67** | +1,35 | 39 % | 71 % |
| 3 | PIMC (denne motoren) | motor | +0,24 ± 0,71 | −0,13 | 30 % | 73 % |
| 4 | Middels | app | −0,03 ± 0,51 | −0,07 | 23 % | 85 % |
| 5 | Vanskelig *(anker)* | app | −0,32 ± 0,47 | −0,16 | 23 % | 81 % |
| 6 | Lett | app | −1,06 ± 0,58 | −0,94 | 17 % | 76 % |
| 7 | Grådig heuristikk | motor | −2,72 ± 0,33 | −2,55 | 0 % | – |
| 8 | D1 (NEAT-nett) | motor | −3,48 ± 0,42 | −3,08 | 0 % | (10 bud) |
| 9 | C4 (NEAT-nett) | motor | −3,65 ± 0,27 | −3,46 | 0 % | (9 bud) |

Paret mot ankeret (samme blokker, derfor mye strammere KI):

| Bot | Δ diff/runde vs. anker | t | Signifikant? |
|---|---:|---:|:--|
| MesterAI | +4,49 ± 0,66 | 14,50 | ja |
| NevroHjerne | +1,77 ± 0,80 | 4,68 | ja |
| **PIMC** | **+0,56 ± 0,76** | **1,57** | **nei** |
| Middels | +0,29 ± 0,78 | 0,78 | nei |
| Lett | −0,74 ± 0,70 | −2,25 | ja |
| Grådig | −2,40 ± 0,63 | −8,17 | ja |
| D1 | −3,17 ± 0,58 | −11,71 | ja |
| C4 | −3,33 ± 0,54 | −13,06 | ja |

Å lese ut av tabellene:

- **MesterAI er klart best**, med god margin til alt annet. Det bekrefter
  bildet fra den eldre benchmarken, nå med feilmargin.
- **Nettene er ikke én kategori.** Appens NevroHjerne er nest best og slår
  ankeret signifikant – for mikrosekunder per trekk. Repoets egne NEAT-nett
  (C4/D1) ligger derimot i BUNN av feltet, under grådig heuristikk. Det er den
  største enkeltoverraskelsen i kjøringen.
- **Og hele gapet ligger i budrunden, ikke i kortspillet.** Antall budrunder
  vunnet, av runder spilt (nøytralt nivå er 25 %):

  | Bot | Budrunder vunnet | Andel | Innfridd |
  |---|---:|---:|---:|
  | NevroHjerne | 550 av 1075 | 51 % | 71 % |
  | MesterAI | 442 av 877 | 50 % | 86 % |
  | PIMC | 417 av 1073 | 38 % | 73 % |
  | Lett | 265 av 973 | 27 % | 76 % |
  | Vanskelig | 251 av 978 | 25 % | 81 % |
  | Middels | 238 av 934 | 25 % | 85 % |
  | **D1** | **10 av 876** | **1 %** | – |
  | **C4** | **9 av 846** | **1 %** | – |
  | Grådig | 0 av 892 | 0 % | – |

  C4 og D1 **melder praktisk talt aldri** – 9 og 10 bud på over 800 runder
  hver. Siden poengene i hovedsak kommer fra å være budvinner (2n), lever de
  da bare på forsvarsstikk, akkurat som den grådige heuristikken som aldri
  melder. Kortspillet deres er ikke målt her i det hele tatt: budhodet
  slipper dem aldri til. Det er der en retrening bør begynne – ikke i
  spillehodet. (Budtreff-tallene for C4/D1 hviler på 9–10 bud og betyr
  ingenting; derfor står bare antallet i tabellen over.)
- **PIMC skiller seg ikke fra ankeret** (t = 1,57). PIMC, Middels og Vanskelig
  er statistisk uskillelige på 64 kamper. Den eldre benchmarkens rangering av
  nettopp de tre lå innenfor støyen.
- **Vinn% er ikke rangeringen.** Nøytralt nivå er 25 % (kandidaten er ett av
  fire seter).

### Støygulvet: hvor små forskjeller er ekte?

`--gjenta` kjører hele rutenettet to ganger med nøyaktig samme frø. Over 8
blokker:

| Bot | kjøring 1 | kjøring 2 | \|Δ\| |
|---|---:|---:|---:|
| C4 (deterministisk) | −4,010 | −4,025 | **0,015** |
| NevroHjerne | +2,334 | +2,075 | 0,259 |
| MesterAI | +3,862 | +3,368 | 0,494 |
| **Vanskelig (ankeret selv)** | −0,249 | +0,439 | **0,688** |

Den deterministiske kandidaten reproduserer seg selv til 0,015 – harnessen
lekker ikke støy. Det som svinger mest er **ankeret**, og grunnen står i
appkoden: `AIDifficulty.vanskelig` har `feilspillSjanse = 0,04` og
`budStøy = 0,5`, trukket fra useedet RNG. Målestokken spiller altså et
tilfeldig lovlig kort i 4 % av trekkene, med vilje.

Praktisk regel: **forskjeller under ~0,7 diff/runde er ikke reelle** ved 8
blokker. Vil man skille tettere, må man opp i blokker – eller bruke et anker
uten innebygd tilfeldighet (`--anker graadig` er helt deterministisk og gir
eksakt 0,000 ± 0,000 mot seg selv, som er harnessens nullkontroll).

### Poengdrift: hvorfor «snittpoeng per kamp» ikke holder

En kamp går til 100 poeng, så den slutter nettopp når noen når 100 – og
dermed er `runder ≈ 100 / egen poengrate`. Sluttpoengsummen er derfor låst til
kamplengden: den metter i toppen (enhver vinner lander på ~100–110, uansett
hvor mye bedre den er) og belønner tapere som drar kampen ut i mange runder.

Målt innenfor hver bot, der variasjonen i kamplengde er ren flaks, er
snittkorrelasjonen mot antall runder:

| Metrikk | korr. med kamplengde |
|---|---:|
| Sluttpoeng | **+0,107** ← driver med lengden |
| diff/runde | +0,003 |
| diff@7r | +0,007 |

Og det har konsekvenser: i denne kjøringen **bytter to boter plass** avhengig
av om man rangerer på sluttpoeng eller på diff/runde. `diff@Kr` avkorter hver
kamp til de K første rundene (K = korteste kamp i kjøringen), så nevneren er
identisk for alle kamper og alle boter, ingen kamp forkastes, og målstreken på
100 rekker aldri å påvirke tallet.

Kjøringen rapporterer også **tidsdrift** (OLS-helling mot blokknummer – ingen
bot slo ut her, så tallene er stasjonære) og **setedrift** (snitt per sete –
duplikatblokken jevner den ut, spennet lå på 0,2–1,7).

### Om tidsbudsjett vs. verdener

Ved 28 verdener per kortvalg brukte vår PIMC **125 ms per beslutning** og
MesterAI **104 ms** – altså er Node bare ~20 % tregere enn Swift per verden i
dette oppsettet. Advarselen i benchmarken over gjelder derfor små `--ms`, der
vår tidsbudsjetterte PIMC blir verdenssultet før den rekker noe som helst; den
er ikke et generelt språkhandikap. Vil man likevel måle i millisekunder, gir
`--ms N` det tidsmatchede oppsettet, med advarsel i utskriften.

### Egne NEAT-nett (e1, d5, d8h …)

Mestergenomene fra treningen ligger under `trening*/`, som er gitignored – de
følger altså ikke med repoet, og bare C4 og D1 er publisert (via val-en som
nettspillet laster fra). Nett som finnes lokalt måles slik:

```bash
node examples/benchmark-kontrollert.ts \
  --nett e1=trening/e1.json,d5=trening/d5.json,d8h=trening/d8h.json \
  --kun mester,pimc,vanskelig,e1,d5,d8h --blokker 16
```

## Verdt å vite

- **MesterAI er ikke deterministisk** mellom kjøringer (egen tilfeldig
  RNG-seed per kamp, som i appen); vår bot seedes per kamp. Giverne er
  alltid reproduserbare fra `--froe`.
- Poengsynk over runder løses ved at adapteren **spiller av alle ferdige
  runder på nytt** for hver rundestart (appens motor tillater ikke å sette
  poengsummer direkte). Det er billig og gjør at MesterAIs matchbevisste
  budgivning ser riktig stilling.
- Tidsbudsjettet gjelder kortvalg; bud-, bytte- og trumfvalg bruker faste
  antall samplede verdener hos begge (48/20 hos MesterAI, ~10 hos vår).
  Swift er raskere enn Node per verden, så ved små `--ms` får MesterAI
  reelt flere verdener per valg – bruk 300 ms+ for mest mulig rettferdig
  sammenlikning.
