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
bash arena/hent-appkode.sh                 # henter appens Swift-kilde
cd arena/adapter && swift build -c release # bygger adapteren
cd ../..
```

Se `arena/README.md` for detaljer. Resultatet er
`arena/adapter/.build/release/adapter`.

## Steg 2: Dashboard-streken

Mål MesterAI mot tre grådige – samme oppsett og metrikk som PIMC-streken:

```bash
node examples/mesterai-referanse.ts 8       # 8 frø × 4 seter = 32 kamper
```

Skriver `trening-felles/mesterai-referanse.json`. Neste graf-oppdatering
(`node examples/neat-graf.ts --pages`, eller graf-puls-løkka) tegner en grønn
**MesterAI**-strek på dashbordet automatisk. Kjør den gjerne på nytt av og til
– streken oppdaterer seg.

## Steg 3: Spillbar motstander (broen)

Start MesterAI-tjenesten på laptopen:

```bash
node arena/mesterai-bro.ts --port 8787 --ms 450
```

Den skriver ut laptopens adresse. Finn LAN-IP-en (f.eks. `192.168.1.42`):

```bash
# macOS:   ipconfig getifaddr en0
# Linux:   hostname -I | awk '{print $1}'
```

Åpne så nettspillet med bro-adressen som parameter:

```
https://project-a9l2n.vercel.app/?mester=http://192.168.1.42:8787
```

Chromecast/telefoner på samme wifi når laptopen på den IP-en. Med parameteren
satt dukker **MesterAI** opp i motstander-velgeren; uten den er spillet
uendret (PIMC/C4/D1 som før).

> **Merk:** klient-koblingen i nettspillet (motstander-valget som ruter til
> broen) er den siste biten som kobles opp og valideres mot en kjørende bro –
> se «Status» nederst. Broen, adapteren og protokollen (`arena/adapterklient.ts`)
> er ferdige og testet mot motoren.

## Hvordan det henger sammen

```
Nettleser (nettspillet)            Laptop
┌────────────────────────┐        ┌─────────────────────────────┐
│ motoren kjører spillet │  HTTP  │ mesterai-bro.ts (Node)      │
│ speiler hver handling  │ ─────► │   └─ spawner adapteren      │
│ spør «beslutt» på      │ ◄───── │      (Swift, appens kode)   │
│ MesterAIs tur          │  trekk │      MesterAI + NevroHjerne  │
└────────────────────────┘        └─────────────────────────────┘
```

Motoren i nettleseren er autoritet (den deler kortene og fører spillet);
broen holder appens `GameEngine` i synk og svarer med MesterAIs trekk. Nøyaktig
samme mekanikk som arena-benchmarken, bare over HTTP i stedet for stdin/stdout.

## Status

- ✅ `arena/adapterklient.ts` – delt, testet adapterprotokoll
- ✅ `examples/mesterai-referanse.ts` – måler dashboard-streken
- ✅ `arena/mesterai-bro.ts` – HTTP-tjenesten nettspillet kaller
- ⏳ Nettspillets MesterAI-motstander (guardet av `?mester=`) – kobles opp og
  valideres mot en kjørende bro på laptopen
