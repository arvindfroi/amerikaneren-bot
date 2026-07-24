# MesterAI på nettsidene

Den ekte MesterAI (appens President-nivå: PIMC-søk + NevroHjerne-nettet) er
skrevet i Swift. I stedet for å skrive den om til JavaScript (risikabelt og
umulig å verifisere) kjører vi **appens egen kode** via arena-adapteren, og
kobler nettsidene til den. To leveranser:

1. **Dashboard-streken** – MesterAIs styrke målt mot grådig, tegnet som
   referanselinje ved siden av PIMC-streken.
2. **Spillbar motstander** – nettspillet spør en lokal MesterAI-tjeneste
   («broen») om trekk, så familien kan spille mot den.

Begge krever at arena-adapteren er bygget – det trenger **Swift 5.9+**
([swift.org/download](https://swift.org/download/), kjører fint på laptopen).

## Steg 1: Bygg adapteren (én gang)

```bash
bash arena/hent-appkode.sh /sti/til/Amerikaneren-App   # henter appens Swift-kilde
cd arena/adapter && swift build -c release             # bygger adapteren
cd ../..
```

Se `arena/README.md` for detaljer. Resultatet er
`arena/adapter/.build/release/adapter`.

### På Windows-laptopen: bygg i WSL, kjør fra Windows

Windows har ingen Swift-toolchain, men WSL-en har (Swift 6.3.3 via swiftly, og
app-repoet ligger i `~/Amerikaneren-App`). Bygg adapteren **inne i WSL** – ikke
under `/mnt/c`, det er både tregt og unødvendig:

```bash
wsl -e bash -c 'mkdir -p ~/arena-adapter/Sources/adapter && \
  cp /mnt/c/.../amerikaneren-bot/arena/adapter/Package.swift ~/arena-adapter/ && \
  cp /mnt/c/.../amerikaneren-bot/arena/adapter/Sources/adapter/main.swift ~/arena-adapter/Sources/adapter/ && \
  D=~/arena-adapter/Sources/adapter/appkode; mkdir -p $D; A=~/Amerikaneren-App/Amerikaneren; \
  for f in Engine/GameEngine.swift Engine/Bid.swift Engine/Card.swift AI/MesterAI.swift \
           AI/MesterSolver.swift AI/MesterVerden.swift AI/MesterVekter.swift AI/AIPlayer.swift \
           AI/AIPersonality.swift AI/NevroNett.swift AI/NevroVekter.swift; do cp "$A/$f" "$D/"; done && \
  export PATH=$HOME/.local/share/swiftly/bin:$PATH && \
  export LD_LIBRARY_PATH=$HOME/.local/syslibs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH && \
  cd ~/arena-adapter && swift build -c release'
```

Node kjører fortsatt på Windows: begge verktøyene under tar
`--adapter wsl:<sti-i-wsl>` og starter binæren gjennom `wsl.exe` (NDJSON går
like fint over de rørene):

```
--adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
```

> Mangler `AI/MesterVekter.swift` i kopilisten, feiler bygget med et vell av
> «unable to type-check this expression in reasonable time» – det er Swift som
> sier «jeg mangler en type», ikke at koden er for komplisert.

## Steg 2: Dashboard-streken

Mål MesterAI mot tre grådige – samme oppsett og metrikk som PIMC-streken:

```bash
node examples/mesterai-referanse.ts 8       # 8 frø × 4 seter = 32 kamper
# Windows: ... --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
# Prøvekjøring? Legg på --ut prove.json så dashbordtallet ikke overskrives.
```

Skriver `trening-felles/mesterai-referanse.json`. Neste graf-oppdatering
(`node examples/neat-graf.ts --pages`, eller graf-puls-løkka) tegner en grønn
**MesterAI**-strek på dashbordet automatisk. Kjør den gjerne på nytt av og til
– streken oppdaterer seg.

## Steg 3: Farmor spiller mot MesterAI på iPad-en

Broen serverer **hele spillet** over HTTP – så iPad-en åpner ÉN adresse, og
MesterAI (`/mester`) er samme opphav som spillet. Det unngår HTTPS/mixed-
content-blokkeringen iPad-ens Safari ellers ville gitt.

1. Bygg spill-bundelen (én gang, eller etter kodeendring):

   ```bash
   npx esbuild web/app.ts --bundle --format=esm --charset=utf8 --minify --outfile=web/dist/app.js
   npx esbuild web/worker.ts --bundle --format=esm --charset=utf8 --minify --outfile=web/dist/worker.js
   ```

2. Start broen på laptopen (fra repo-roten):

   ```bash
   node arena/mesterai-bro.ts --port 8787 --ms 450
   # Windows: ... --adapter wsl:/home/arvind/arena-adapter/.build/release/adapter
   ```

3. Finn laptopens LAN-IP:

   ```bash
   # macOS:   ipconfig getifaddr en0
   # Linux:   hostname -I | awk '{print $1}'
   # Windows: (Get-NetIPAddress -AddressFamily IPv4 | ? IPAddress -like '192.168.*').IPAddress
   ```

   På Windows må brannmuren slippe inn porten én gang (kjør som administrator).
   `-Profile Any` fordi hjemme-wifien er klassifisert som *Public* – en regel
   for bare *Private* ville aldri slått inn:

   ```powershell
   New-NetFirewallRule -DisplayName "MesterAI-bro 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow -Profile Any
   ```

4. På farmors iPad (samme wifi): åpne **`http://<LAN-IP>:8787`** i Safari –
   f.eks. `http://192.168.1.42:8787`. Legg den gjerne til på Hjem-skjermen én
   gang, så er det bare å trykke på ikonet neste gang.

I motstander-velgeren dukker nå **MesterAI 🏆** opp. Velg den, og farmor spiller
mot appens ekte mester. (PIMC/C4/D1 virker fortsatt – de laster fra nettet.)

> Laptopen må stå på og være på samme wifi mens hun spiller. Broen holder én
> kamp om gangen – rikelig for én iPad.

## Hvordan det henger sammen

```
iPad (Safari, http://laptop:8787)     Laptop
┌────────────────────────────┐        ┌─────────────────────────────┐
│ spillet (servert av broen) │  HTTP  │ mesterai-bro.ts (Node)      │
│ motoren fører spillet      │ ─────► │   ├─ serverer spillet        │
│ speiler hver handling      │        │   └─ spawner adapteren      │
│ spør «beslutt» på          │ ◄───── │      (Swift, appens kode)   │
│ MesterAIs tur → /mester    │  trekk │      MesterAI + NevroHjerne  │
└────────────────────────────┘        └─────────────────────────────┘
```

Motoren i nettleseren er autoritet (den deler kortene og fører spillet);
broen holder appens `GameEngine` i synk og svarer med MesterAIs trekk. Nøyaktig
samme mekanikk som arena-benchmarken, bare over HTTP i stedet for stdin/stdout.
Alle bro-kall serialiseres i rekkefølge, så adapterens motor aldri kommer ut
av synk.

## Status

- ✅ `arena/adapterklient.ts` – delt, testet adapterprotokoll
- ✅ `examples/mesterai-referanse.ts` – måler dashboard-streken
- ✅ `arena/mesterai-bro.ts` – serverer spillet + MesterAI-trekk over HTTP
- ✅ Nettspillets MesterAI-motstander (vises i bro-modus, `/mester` same-origin)
- ⏳ Ende-til-ende-validering mot en kjørende bro (krever Swift – kjøres på
  laptopen; deploy er trygg fordi MesterAI kun vises når spillet serveres
  lokalt over HTTP)
