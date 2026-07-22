# Amerikaneren-motor

En **lettvekts, avhengighetsfri spillmotor** for det norske kortspillet
**Amerikaner**. Motoren er ren logikk – ingen I/O, ingen server, ingen UI –
og er ment å være en backend som kan drive alle slags klienter: web, mobil
eller en autoritativ spillserver.

Reglene er implementert nøyaktig etter [`REGLER.md`](./REGLER.md)
(byttekort-varianten som standard, mål på 100 poeng, Amerikaner med
hemmelig makker og egen solo-melding).

## Hvorfor denne formen

- **Ren og deterministisk.** `utfør(state, handling)` tar en tilstand og en
  spillerhandling og returnerer en **ny** tilstand pluss en liste hendelser.
  Ingenting muteres på tvers av kall.
- **Serialiserbar.** Hele `GameState` er vanlige data (ingen klasser, ingen
  funksjoner). `JSON.stringify(state)` fungerer rett fram – lett å lagre i en
  database eller sende over nett.
- **Seedbar.** Kortstokking styres av en `frø`-verdi, så spill er
  reproduserbare (replays, testing, server-autoritet).
- **Null runtime-avhengigheter.** Skrevet i TypeScript, kompilerer til ren
  ESM som kjører i Node, nettleser og React Native.
- **Skjult informasjon håndteres.** `spillerVisning(state, spiller)` gir en
  redigert tilstand der andres hender, talong, andres vrak og makkerens
  identitet (før avsløring) er skjult – trygt å sende til den enkelte klient.

## Kom i gang

```bash
npm install        # kun for TypeScript-kompilatoren (dev)
npm test           # kjører hele testsuiten (node:test)
npm run build      # kompilerer src/ -> dist/ (ren ESM + typer)
npm run selvspill  # fire enkle boter spiller en hel kamp
```

Krever Node ≥ 20. Testene og eksempelet kjøres direkte fra `.ts`-kilden via
Nodes innebygde type-stripping – ingen byggesteg nødvendig for å prøve dem.

## API i korte trekk

```ts
import { opprettSpill, lovligeHandlinger, utfør, spillerVisning } from "amerikaneren-motor";

// 1) Start en kamp (valgfritt seed for reproduserbarhet)
let state = opprettSpill({ antallSpillere: 4 }, 12345);

// 2) Spør hva spilleren i tur kan gjøre
const valg = lovligeHandlinger(state);
//   BUDRUNDE -> { spiller, bud: Bud[] }
//   VRAK     -> { spiller, antall, hånd }
//   VELG     -> { spiller, trumf, måEtterlyse }
//   SPILL    -> { spiller, kort: Kort[] }   (allerede filtrert for lovlighet)

// 3) Utfør en handling -> ny tilstand + hendelser
const { state: neste, hendelser } = utfør(state, {
  type: "BUD",
  spiller: valg.spiller,
  bud: 5,
});
state = neste;

// 4) Send en redigert visning til hver klient
const forSpiller2 = spillerVisning(state, 2);
```

### Handlinger (`Handling`)

| `type`   | Felt                                  | Når |
|----------|---------------------------------------|-----|
| `BUD`    | `spiller`, `bud` (tall / `"AMERIKANER"` / `"SOLO"` / `"PASS"`) | budrunden |
| `VRAK`   | `spiller`, `kort: Kort[]` (nøyaktig talong-antall) | byttefasen |
| `VELG`   | `spiller`, `trumf`, `etterlyst: Kort \| null` | velg trumf + etterlys |
| `SPILL`  | `spiller`, `kort`                     | stikkspillet |
| `NESTE`  | –                                     | gå fra `RUNDE_SLUTT` til neste giver |

Ugyldige handlinger kaster en feil med forklarende melding; motoren
validerer tur, lovlige kort, budrangering, byttekort-antall og
etterlysningsregler.

### Faser (`state.fase`)

```
BUDRUNDE ──► VRAK ──► VELG ──► SPILL ──► RUNDE_SLUTT ──► (ny giver) ──► BUDRUNDE
   │  (uten byttekort hoppes VRAK over)                     │
   └── alle passer: ny giver                                └── noen ≥ målPoeng: FERDIG
```

### Hendelser (`Hendelse`)

`utfør` returnerer en liste hendelser som beskriver hva som skjedde:
`KORT_GITT`, `BUD`, `PASS`, `ALLE_PASSET`, `BUDVINNER`, `VRAKET`,
`TRUMF_VALGT`, `KORT_SPILT`, `MAKKER_AVSLØRT`, `STIKK_FERDIG`,
`RUNDE_SLUTT` (med poeng), `NY_RUNDE`, `KAMP_SLUTT`. Klienter kan drive
animasjoner og logg direkte av disse.

## Regelhøydepunkter som er kodet inn

- **Utspillsplikt:** budvinneren må åpne første stikk i trumf (`lovligeKort`
  returnerer da kun trumfkort).
- **Makkerplikt:** den som sitter med det etterlyste kortet må legge nettopp
  det i første stikk – makkeren avsløres dermed for alle
  (`MAKKER_AVSLØRT`).
- **Etterlysning:** kortet må være i trumffargen, og det er ikke lov å
  etterlyse et kort man selv har eller har vraket (`lovligeEtterlys`).
- **Poeng:** budvinner får dobbelt av makkeren; Amerikaner ±mål/2 og ±mål/4,
  solo ±mål; øvrige +1 per eget stikk. Først til `målPoeng` (100) vinner.
- **Spillerantall:** 3–6 støttes (`antallSpillere`), med kortfordelingen fra
  reglene. Klassiske regler uten byttekort via `{ medByttekort: false }`.

## Filstruktur

```
src/
  kort.ts     Kort, farger, stokk, seedbar RNG
  regler.ts   GameRules, kortgiving, budrangering, poengberegning
  motor.ts    Tilstandsmaskin: lovligeHandlinger, utfør, lovligeKort, visning
  index.ts    Offentlig API (re-eksport)
test/         node:test-suite (kort, regler, motor)
examples/
  selvspill.ts  Fire heuristikk-boter spiller en hel kamp
```

Motoren tar ingen avgjørelser på spillernes vegne – den avgjør bare hva som
er lovlig og hva som skjer. En AI/bot er et lag oppå (se `examples/`).

## Lisens

MIT.
