# Amerikaneren-motor

En **lettvekts, avhengighetsfri spillmotor** for det norske kortspillet
**Amerikaner**. Motoren er ren logikk – ingen I/O, ingen server, ingen UI –
og er ment å være en backend som kan drive alle slags klienter: web, mobil
eller en autoritativ spillserver.

Reglene er implementert nøyaktig etter [`REGLER.md`](./REGLER.md)
(byttekort-varianten som standard, mål på 100 poeng, Amerikaner med
hemmelig makker og egen solo-melding).

Pakken inneholder også en **bot** som spiller så nær optimalt som den
skjulte informasjonen tillater – bygd på en eksakt dobbelt-dummy-løser og
Monte-Carlo over mulige kortfordelinger (PIMC). Se [Bot](#bot-nær-optimal-spilling-med-den-informasjonen-som-finnes).

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
npm install         # kun for TypeScript-kompilatoren (dev)
npm test            # kjører hele testsuiten (node:test)
npm run build       # kompilerer src/ -> dist/ (ren ESM + typer)
npm run selvspill   # fire enkle heuristikk-boter spiller en hel kamp
npm run styrketest  # måler PIMC-botens stikk-fordel mot tilfeldig spill
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

## Bot: nær-optimal spilling med den informasjonen som finnes

Motoren avgjør bare hva som er *lovlig*. Oppå ligger en **bot** som avgjør
hva som er *lurt* – så nær optimalt som den skjulte informasjonen tillater.

```ts
import { opprettSpill, velgHandling, utfør } from "amerikaneren-motor";

let state = opprettSpill({ antallSpillere: 4 }, 12345);
while (state.fase !== "FERDIG") {
  const handling = velgHandling(state, { verdener: 20, terskel: 7 });
  state = utfør(state, handling).state;
}
```

`velgHandling(state, opts)` velger for spilleren i tur i alle faser (bud,
byttekort, trumf/etterlys, kortspill). Den bruker **bare** informasjonen den
spilleren faktisk har.

### Metode: determinisert dobbelt-dummy (PIMC)

Stikkspillet er et perfekt-informasjons nullsumspill *når alle hender er
kjent*. Det utnytter boten:

1. **Dobbelt-dummy-løser** (`src/solver/dds.ts`) – en eksakt alpha-beta-
   søker (bitmaske-hender, ekvivalensreduksjon, null-vindu/MTD,
   transposisjonstabell med Zobrist-hash). Den regner ut det spillteoretisk
   korrekte antallet stikk budlaget tar.
2. **Verdenssampler** (`src/solver/sampler.ts`) – trekker mange komplette
   kortfordelinger som er forenlige med alt boten vet (egen hånd, spilte
   kort, renonce-inferens, at det etterlyste kortet ligger hos en
   motspiller, budvinnerens eget vrak).
3. **PIMC-bot** (`src/bot/bot.ts`) – for hver mulig handling: løs mange
   sampla verdener, og velg handlingen med best **forventet egen-poeng**
   (budlaget maksimerer stikk, forsvaret minimerer – standard erklærer-mot-
   forsvar). Budrunden, trumf/etterlys og vraking styres av det samme
   sampling-drevne estimatet.

Fordi en eksakt 12-stikks løsning er tung i ren JS, spilles de første
stikkene med en grei grådig policy og **sluttspillet (de siste `terskel`
stikkene) løses eksakt** – der presisjon teller mest. `terskel` og `verdener`
styrer avveiningen styrke/hastighet.

### Styrke, hastighet og tenketid

Målt på identiske givere (`npm run styrketest`). Tilfeldig spill tar ~7.1
stikk som budlag; høyere angrep og lavere forsvar = sterkere:

| Innstilling | Angrep | Forsvar | Tid/kort (snitt) | Tid/kort (verst) |
|-------------|--------|---------|------------------|------------------|
| `verdener:10, terskel:6` (rask) | 7.5 | 6.5 | 38 ms | 0.4 s |
| `verdener:20, terskel:7` (**standard**) | **8.0** | **6.1** | ~0.5 s | ~4 s |
| `verdener:30, terskel:7` | 7.6 | 5.9 | 0.7 s | 6.5 s |

Mer tenking hjelper opp til et punkt: fra rask til standard vinner boten
~0.5 stikk mer som angrep og gir ~0.4 mindre som forsvar. Utover standard er
gevinsten innenfor støyen mens kostnaden øker – **`verdener:20, terskel:7` er
et godt balansepunkt**. Åpningsutspillet er det dyre kortet (flest kort igjen
å løse); resten går raskt når sluttspillet løses eksakt.

**Vil du la den tenke lenger?** Sett et tidsbudsjett per kortvalg, så trekker
den stadig nye verdener til tiden er ute (anytime):

```ts
velgHandling(state, { tidsbudsjettMs: 1500, terskel: 7 });
```

`terskel` styrer hvor dypt sluttspillet løses **eksakt** (og skrus automatisk
til `min(terskel, gjenstående stikk)`, så de siste stikkene alltid er uten
grådig skjevhet). `verdener` styrer antall determiniseringer (lavere varians).

### `BotAgent`: anytime, med hardt tidstak og pondering

For en app/server som spiller mot mennesker: en spillende agent per plass som
**aldri blokkerer over et tidstak på sin egen tur** (standard 1,7 s, trygt
under 2 s), men kan **pondre** – tenke på sitt eget kortvalg i ledige porsjoner
mens den venter – slik at ekstra tid faktisk teller (flere verdener = sterkere).

```ts
import { BotAgent } from "amerikaneren-motor";

const agent = new BotAgent(minPlass, { terskel: 7 });

// Mens du har ledig tid på agentens beslutning (trygt å kalle gjentatte ganger):
agent.pondre(state, 300);           // banker verdener, blokkerer bare 300 ms

// Når svaret trengs – blokkerer aldri mer enn maksMs:
const handling = agent.beslutt(state, 1700);
```

Garantien er hard: tiden sjekkes **mellom hver kandidat**, en halvferdig verden
forkastes, og hvert enkelt-søk har et **nodetak** som faller til grådig hvis en
giv er patologisk tung. Målt verste blokkering over åpnings- og midtspill-valg:
**~1,8 s** (aldri ≥ 2 s). Pondering akkumuleres på tvers av kall så lenge
stillingen er den samme, så en driver kan gi agenten vilkårlig mye tenketid
utenfor den kritiske turen og likevel holde selve turen under taket.

### `KVALITET_3S`: sterkest mulig under 3 s per tur (anbefalt)

Ferdig innstilling for «mest mulig eksakt innenfor et hardt 3-sekunderstak, med
pondering». Sluttspillet løses uansett eksakt; den ekstra tiden (og all
pondering) går til **flere verdener** – som er det som faktisk hjelper tidlig,
ikke et dypere søk:

```ts
import { BotAgent, KVALITET_3S, MAKS_MS_3S } from "amerikaneren-motor";

const agent = new BotAgent(minPlass, KVALITET_3S);
agent.pondre(state, ledigTid);        // tenk mens du venter (banker verdener)
const handling = agent.beslutt(state, MAKS_MS_3S); // blokkerer < 3 s
```

Målt: verste blokkering **~2,7 s** (aldri ≥ 3 s), og **~38 verdener** på et
åpningsutspill – mot bare ~4 hvis man (fristende, men feil) skrur terskelen
opp til 9. Dypere eksaktsøk tidlig kaster bort tid på giver som uansett faller
til grådig; flere verdener gir lavere varians og bedre valg.

### `MAKS_STYRKE`: alltid det virkelig beste kortet (uten forenklinger)

Standardmodus tar to snarveier for å holde 2-sekundersgrensen: en **grådig
åpning** (tidlige stikk løses ikke eksakt) og et **nodetak** (tunge giver
faller til grådig). `MAKS_STYRKE` skrur begge av – hver sampla verden løses
**eksakt hele veien** (`terskel: 13`, `nodeTak: 0`), så boten alltid velger
det virkelig beste kortet ut fra informasjonen den har:

```ts
import { MAKS_STYRKE, velgHandling } from "amerikaneren-motor";

velgHandling(state, { ...MAKS_STYRKE, tidsbudsjettMs: 5000 });
```

Boten spiller alltid **argmax** over de sampla verdenene; `MAKS_STYRKE` gjør
at hver verdi er *eksakt* i stedet for tilnærmet. Målt i sluttspillet (4 stikk
igjen) spilte den et **klarsynt-optimalt** kort i **73 %** av valgene – resten
er ikke feil, men den iboende kostnaden ved skjult info: den kan ikke se
motstandernes kort, så den spiller det beste kortet *i snitt over det den vet*.

**Pris:** ingen tidsgaranti. Eksakt 12-stikks løsning er tung, så et
åpningsutspill kan ta flere sekunder per verden. Bruk `MAKS_STYRKE` med et
romslig `tidsbudsjettMs` eller pondering når kvalitet går foran hastighet;
bruk standard `BotAgent` når svaret må komme under 2 s.

**Sampling:** verdenene trekkes tilfeldig (seedet) og *uniformt* blant de
fordelingene som er forenlige med det boten vet (harde skranker: renonce,
etterlyst-plassering, håndstørrelser). Boten vekter dem **ikke** etter
sannsynlighet – den slutter f.eks. ikke «denne meldte Amerikaner, så hun har
nok høy trumf». Flere `verdener` = lavere varians, ikke større søk.

**Kjente begrensninger** (iboende i PIMC): «strategifusjon» (antar at skjulte
kort blir kjent neste trekk), at boten ikke skjuler egen informasjon, og
uniform sampling uten motstander-inferens. Disse rammer tidlig spill mer enn
sluttspillet, som er eksakt. Motstander-inferens (viktighetssampling / et
partikkelfilter) er den mest lovende videreutviklingen.

## Designnotat: hvorfor ikke nevrale nett / CFR?

En lærd stakk (Deep CFR for budrunden, verdinett for talong/trumf,
ISMCTS/ReBeL for stikkspillet) er den «maksimale» tilnærmingen, men feil for
*dette* målet: en lettvekts, avhengighetsfri motor som kjører overalt og er
deterministisk. Den ville krevd trening, data, GPU og et rammeverk.

For et spill så lite som Amerikaner (12 stikk) er **eksakt dobbelt-dummy
løsbart**, og da gir **PIMC nær-optimalt stikkspill uten trening** – eksakt
per verden, ikke en rollout-approksimasjon slik ISMCTS er. ISMCTS/ReBeL
lønner seg først når perfekt-info-delspillet er for stort til å løses eksakt,
eller når man vil håndtere PIMC-svakhetene (strategifusjon, informasjons-
lekkasje) direkte. Talong/trumf trenger heller ikke et *verdinett*: hver
kandidat kan evalueres direkte med sampling + eksakt løser. Budrunden er den
delen der CFR ville tilført mest (motstandermodellering, bløff), men et
sampling-basert EV-estimat er mer enn nok for husbruk – og kan senere byttes
ut bak `velgHandling` uten å røre resten.

## Filstruktur

```
src/
  kort.ts            Kort, farger, stokk, seedbar RNG
  regler.ts          GameRules, kortgiving, budrangering, poengberegning
  motor.ts           Tilstandsmaskin: lovligeHandlinger, utfør, lovligeKort, visning
  solver/dds.ts      Eksakt dobbelt-dummy-løser (alpha-beta + TT)
  solver/sampler.ts  Determinisering av skjult informasjon
  bot/bot.ts         PIMC-bot: velgHandling for alle faser
  index.ts           Offentlig API (re-eksport)
test/                node:test-suite (kort, regler, motor, dds, sampler, bot)
examples/
  selvspill.ts       Fire heuristikk-boter spiller en hel kamp
  styrketest.ts      Måler PIMC-botens stikk-fordel mot tilfeldig spill
```

Skillet er bevisst: **motoren** er ren regel-logikk (avgjør lovlighet og
utfall), **boten** er et frittstående lag oppå (avgjør hva som er lurt). Vil
du bruke en annen strategi, bytt ut `velgHandling` – motoren er uendret.

## Lisens

MIT.
