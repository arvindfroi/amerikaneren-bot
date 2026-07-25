# MesterAI og nevronettet på nettsidene

Den ekte MesterAI (appens President-nivå: PIMC-søk + NevroHjerne-nettet) er
skrevet i Swift. I stedet for å skrive den om til JavaScript (risikabelt og
umulig å verifisere) kjører vi **appens egen kode** via arena-adapteren, og
kobler nettsidene til den. To leveranser:

1. **Dashboard-streken** – MesterAIs styrke målt mot grådig, tegnet som
   referanselinje ved siden av PIMC-streken.
2. **Spillbar motstander** – nettspillet spør en lokal MesterAI-tjeneste
   («broen») om trekk, så familien kan spille mot den.

**Nevronettet alene trenger ingenting av dette.** `NevroHjerne` er bare et
lite flerlags perseptron, så den delen er portert til TypeScript og ligger
rett i nettspillet – se [«Nevronettet i nettleseren»](#nevronettet-i-nettleseren)
nederst. Der spiller familien mot appens nevronett på den vanlige nettadressen,
uten Swift, uten laptop og uten bro. Bare fullversjonen av MesterAI (med
PIMC-søket) krever broa.

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
   ```

3. Finn laptopens LAN-IP:

   ```bash
   # macOS:   ipconfig getifaddr en0
   # Linux:   hostname -I | awk '{print $1}'
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

## Nevronettet i nettleseren

Appens `NevroHjerne` er tre tette nett (bud 64→64→48→12, vrak 59→96→64→52,
spill 238→192→128→52 – til sammen ~100 000 vekter). Ingen søk, ingen
avhengigheter: ett oppslag per beslutning, mikrosekunder. Derfor er den
portert rett til TypeScript i `src/nevro/`, og nettspillet har fått
motstanderen **NevroHjerne 🧠** ved siden av PIMC, C4 og D1. Den virker på den
vanlige (HTTPS-)adressen – ingen bro, ingen laptop.

```
src/nevro/nett.ts     MLP-inferens + appens binærformat (Int32/Float32 LE)
src/nevro/trekk.ts    Inngangsvektorene, eksakt som appens NevroTrekk
src/nevro/spiller.ts  Bud/vrak/kortvalg + appens trumfheuristikk (AIPlayer)
```

Vektene er appens egne, hentet ut av `NevroVekter.swift`:

```bash
node arena/hent-nevrovekter.ts /sti/til/Amerikaneren-App
# → web/nevro-vekter.b64.txt (~525 kB), serveres som /nevro.b64
```

### Hvorfor vi tør stole på porten

Regnestykket gjøres i float32 med `Math.fround` på hver multiplikasjon og hver
akkumulering – nøyaktig slik Swift-koden regner – så logitene er bit-identiske.
Og porten er testet mot fasiten, ikke bare mot magefølelsen:

```bash
node examples/nevro-paritet.ts 8    # krever den bygde adapteren
```

Den spiller kamper der HVER beslutning tas av både TS-porten og appens
Swift-nett (adapterens `nevro`-bot), og sammenlikner dem:

```
BUDRUNDE  305 like, 0 ulike
SPILL    3660 like, 0 ulike
VELG      305 like, 0 ulike
VRAK      305 like, 0 ulike
4575/4575 identiske (100.00 %) – PORTEN ER IDENTISK MED APPEN ✓
```

Styrken måles med `node examples/nevro-referanse.ts 8` (ingen Swift nødvendig):
**+74,9 poeng mot grådig, 32/32 kamper vunnet.**

## Status

- ✅ `src/nevro/` – appens nevronett i TypeScript, verifisert mot Swift-koden
- ✅ Nettspillets NevroHjerne-motstander (virker på den deployede siden)
- ✅ `arena/hent-nevrovekter.ts` – henter vektene ut av appen
- ✅ `examples/nevro-paritet.ts` / `nevro-referanse.ts` – paritet og styrke
- ✅ `arena/adapterklient.ts` – delt, testet adapterprotokoll
- ✅ `examples/mesterai-referanse.ts` – måler dashboard-streken
- ✅ `arena/mesterai-bro.ts` – serverer spillet + MesterAI-trekk over HTTP
- ✅ Nettspillets MesterAI-motstander (vises i bro-modus, `/mester` same-origin)
- ⏳ Ende-til-ende-validering mot en kjørende bro (krever Swift – kjøres på
  laptopen; deploy er trygg fordi MesterAI kun vises når spillet serveres
  lokalt over HTTP)
