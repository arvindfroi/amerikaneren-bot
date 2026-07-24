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
