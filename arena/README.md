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
