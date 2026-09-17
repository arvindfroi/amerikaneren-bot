# `okt:` — er porten på 2 SE noensinne passert i ekte spill?

Gren: `koblinger-2026-09-13` i **`D:\amb-kobling`** (base `a2e69bb`). 13. sep.
`D:\amb-krav` og `D:\amb-loop` er ikke rørt. Maks 4 kjerner; ingen K1-måling startet.
Verktøy: `examples/oktsonde2.ts` (ny). Rådata: `D:\amb-grp\loop\okt-sonde\*.txt`.

**Ingen terskel er endret.** Sonden leser; den tvinger ikke.

---

## SVARET, kort

| spørsmål | svar |
|---|---|
| 1. Passeres porten på 2,0 SE i ekte spill? | **JA.** Rutinemessig. Mot en ekte vane i 86,5 % av punktene, mot `abmpd` i 30,8 %, og **mot fire IDENTISKE agenter i løkkas egen konvensjonshale i 35,9 %** — bekreftet med løkkas ORDRETTE spek: 6,3 %, og vrien fyrer mot en klone. |
| 2. Er 2,0 riktig valgt? | Tallet er **antatt, ikke kalibrert** — lånt fra gate 2. Men det er ikke 2,0 som er feil: **nullpunktet `−0,0976` er målt på en annen stakk enn den som spiller.** |
| 3. Finnes en stilling der hukommelsen endrer et valg? | **JA.** Tre runder mot tre trumftrekkere gir **2 endrede valg av 43**. Første avvik i runde 2. |

**Dommen på raden endres: `okt:` er (c), ikke (b).** Den er koblet, den fyrer, og
den flytter ingen av de 219 valgene. Det er samme klasse som `r` og `d4` — et ekte
tall, ikke en blind rad.

---

## 0. Kartet: hvor porten står, og hvem som leser den

To porter på rad, ikke én:

```
stilbias.ts:331   sikker  = |forskjell| >= 2·SE                 HARD DØR
okt.ts:169        krympet = max(0, |forskjell| − 2·SE)          MYK TERSKEL
okt.ts:170        if (krympet === 0) return null
```

`forskjell = snitt(eget) − BEFOLKNING_RESIDUAL`, `BEFOLKNING_RESIDUAL = −0.0976`
(`stilbias.ts:321`). Nullpunktet er **en målt konstant**, ikke bordet.

Leserne av `stilvri`:

| leser | fil | gjelder |
|---|---|---|
| `motpartFor` (A2, rollout-policyen) | `okt.ts:181` | `amu:` alltid; `sik:` bare med flagget **`M`** |
| `atferdFor` (K8, troens likelihood) | `okt.ts:288` | via `agentspek.ts:1147` |
| `sum:`-stilleddet | `sumledd.ts:258` | bare i summeformen |

**Helboten HAR flagget.** Løkkas spek (`adams-max-loop-v9.sh:161`) er
`okt:vr:…:profil:sik:alle:0.5:48k32e3L**M**D~mlbu=…:budq:…:vakt:abmp:e1:…`, og
`agentspek.ts:1344/1491` binder `M` til `økt.motpartFor`. `okt:` er altså
strukturelt koblet i den boten løkka faktisk kjører — i motsetning til `profil:`.

**Og `stilvri` har ingen rundeterskel.** `Økt.aggressivitet` krever
`MIN_RUNDER = 4` (`okt.ts:82`); `stilvri` krever bare `d.sikker`. Hukommelsen kan
altså vri søket fra runde 0 på ni observasjoner. Det er målt under.

---

## 1. Porten PASSERES — fordelingen av z = |forskjell|/SE

`examples/oktsonde2.ts --del a` logger z for alle fire seter ved hvert eneste
kortvalg, ikke bare for setet i tur i førerrollen. Det er forskjellen fra
`koblingssonde.ts`, som samplet 41 punkter.

| arm | motstander | runder | punkter | **sikre (z ≥ 2,0)** | p50 | p90 | p99 | maks |
|---|---|---|---|---|---|---|---|---|
| `full` (koblingssjekkens spek) | fire like | 4 | 768 | **0 (0,0 %)** | 0,74 | 1,57 | 1,62 | 1,62 |
| `full` | fire like | 26 | 4 992 | **240 (4,8 %)** | 0,89 | 1,83 | 2,08 | 2,19 |
| `usokt` | fire like | 78 | 14 976 | 48 (0,3 %) | 0,70 | 1,40 | 1,77 | 7,13 |
| **`loopnaer`** (`vakt:abmp`, `kort-7`) | **fire like** | 78 | 14 976 | **5 376 (35,9 %)** | 1,56 | 3,04 | 3,47 | 3,69 |
| `usokt` | `abmpd` ×3 | 52 | 9 984 | **3 072 (30,8 %)** | 1,01 | 3,38 | 4,05 | 4,25 |
| `usokt` | trumftrekker ×3 | 52 | 9 984 | **8 640 (86,5 %)** | 65,96 | 104,57 | 114,44 | 115,99 |

### 1a. Hvorfor forrige måling så 0,47 og denne ser 2,19 i samme bot

Ikke uenighet — **ulik nevner og ulik lengde**. `koblingssonde.ts` teller bare
amu-valg (fase SPILL, rolle fører, >1 lovlig kort): 41 punkter over 4 runder, og
bare for setet i tur. Med de samme 4 rundene måler jeg maks **1,62** over 768
punkter — samme størrelsesorden, samme konklusjon: **innenfor sjekkens fire runder
passeres porten ikke.**

Men det er et vindu, ikke en egenskap. Den samme boten over en hel kamp:

```
runde  n/sete  maks z   sikre        (full, fire like, 26 runder)
    3      27    1.57       0
    5      45    1.71       0
    6      54    2.19      48   <-- porten passeres FØRSTE gang
   10      91    2.08      48
   20     182    2.00      48
```

**Porten passeres først rundt runde 6**, ved ~54 observasjoner per sete. Sjekkens
4-rundersvindu stopper to til tre runder for tidlig. Det er derfor raden står på 0:
ikke fordi porten er en av-bryter, men fordi **sjekken måler kortere enn
hukommelsen trenger**.

### 1b. Toppen på 7,13 er småutvalgsstøy, ikke et signal

I `usokt`/fire like ligger alle 48 treffene i **runde 1**, ved ~9 observasjoner per
sete, og forsvinner så helt (maks 1,79 i runde 0, aldri over 1,8 i rundene 2–25).
`standardfeil` bruker `n − 1` og er ustabil for små `n`: klumper residualene seg
tilfeldig, kollapser SE og z eksploderer. Med `stilvri` uten rundeterskel er dette
**en falsk positiv som kan fyre i runde 1**. Den myke terskelen demper den — men
den demper den bare, den stenger den ikke.

### 1c. FUNNET SOM BETYR MEST: løkkas egen bot flagger sine egne kloner

`loopnaer` er samme kjede med **løkkas konvensjonshale** — `vakt:abmp` og
`kort-7.bin` i stedet for `vakt:abmpf` og `d7alle.bin`. Fire IDENTISKE agenter:

```
sete    n   middel   forskjell      SE       z   sikker  krympet
   0  708  -0.0742      0.0234  0.0123    1.90   nei    0.0000
   1  710  -0.0722      0.0254  0.0125    2.04   JA     0.0004
   2  701  -0.0799      0.0177  0.0132    1.34   nei    0.0000
   3  719  -0.0619      0.0357  0.0128    2.79   JA     0.0101
```

**To av fire kloner leses som «særegne».** Til sammenlikning ligger `abmpf`-kjeden
på middel −0,1045 / −0,1100 / −0,1097 / −0,0976 — praktisk talt oppå nullpunktet,
og z faller mot 0 med n.

Mekanismen er entydig: `BEFOLKNING_RESIDUAL = −0,0976` ble målt over 8 812 valg med
`ADAMS_MAALT`, som ender på `vakt:abmpf:e1:…d7alle.bin` (`agentspek.ts:178`).
Løkka kjører `vakt:abmp` og et annet kortnett. Den kjeden har et residual rundt
**−0,072**, altså et systematisk avvik på ~0,025 fra konstanten. Et systematisk
avvik forsvinner ikke med flere observasjoner — **SE krymper som 1/√n, så z VOKSER
uten grense.** Porten passeres da til slutt for alle fire setene, uansett om noen
har en vane.

Det er en falsk positiv som blir mer sikker jo lenger man spiller.

### 1d. Bekreftet med LØKKAS EKTE SPEK, ikke en stedfortreder

`loopnaer` er løkkas hale, ikke løkkas bot. Derfor er det samme målt en gang til
med speken `adams-max-loop-v9.sh:161` bygger, ordrett — `eks:3Lt2000`,
`sik:alle:0.5:48k32e3LMD~mlbu=tro-8.bin`, `budq:`, `vakt:abmp:e1:kort-8.bin` —
fire like agenter, 8 runder (215 s, ett kjerne):

```
  sikre (z >= 2,0)   96 av 1536 punkter (6,3 %),  foerste i runde 1
  sete    n   middel   forskjell      SE       z   sikker  krympet
     0   64  -0.0404      0.0572  0.0508    1.13   nei    0.0000
     1   67  -0.1000     -0.0024  0.0421    0.06   nei    0.0000
     2   64  -0.1071     -0.0095  0.0451    0.21   nei    0.0000
     3   63   0.0177      0.1153  0.0514    2.24   JA     0.0125
```

**Ett av fire identiske seter passerer porten, og vrien fyrer** (`krympet` 0,0125,
ikke null). Dette er boten løkka faktisk kjører, med `M` bundet til
`økt.motpartFor` — altså ikke en konstruert stilling.

Åtte runder gir bare ~64 observasjoner per sete, så spredningen her er dels støy.
Det som IKKE er støy er retningen, og den holder i alle tre halene:

| hale | middel per sete (n ≈ 700, tre kamper) | snitt | seter over porten |
|---|---|---|---|
| `abmpf` + `d7alle` (konstanten ble målt her) | −0,1045 / −0,1100 / −0,1097 / −0,0976 | **−0,1055** | 0 av 4 |
| `abmp` + `kort-7` | −0,0742 / −0,0722 / −0,0799 / −0,0619 | **−0,0721** | 2 av 4 |
| `abmp` + `kort-8` | −0,1015 / −0,0871 / −0,0786 / −0,0670 | **−0,0836** | 1 av 4 |

`abmpf`-kjeden ligger oppå `−0,0976` og z faller mot 0 med n. Begge `abmp`-halene
ligger over den, og seter krysser. Avviket er altså **stakk-drevet, ikke
kortnett-spesifikt** — og det er nøyaktig den halen løkka og appen kjører.

---

## 2. Hvor 2,0 kommer fra — og hvorfor det ikke er 2,0 som er problemet

Begge portene ble innført **8. august**, i to commiter:

- `a1e501e` «K4+K8: stilbias — hukommelsen som RESIDUAL» innfører
  `sikker: … >= 2 * se` (`stilbias.ts:331`).
- `9c21511` «K6-kanalen bygd om» innfører `max(0, |d| − 2·SE)` og bytter
  nullpunktet fra bordets median til `−0,0976`.

Begrunnelsen i koden er **ikke en kalibrering**. Den er en analogi og en
risikobetraktning:

> «Porten er 2 SE på DIFFERANSEN, **samme krav som gate 2 stiller til en vekt**.»
> (`stilbias.ts:292`)
>
> «En port på 2 SE slipper gjennom omtrent én av tjue ved ren tilfeldighet.»
> (`okt.ts:154`)

Det som ER målt er hva porten gjør i to punkter: fire like agenter (0 av 4 flagget,
16 runder) og en stilisert trumftrekker (+0,629 ± 0,036 = 17 SE). Begge er tatt
**med `abmpf`-stakken**, som er nøyaktig den stakken nullpunktet ble målt på. De
viser at 2,0 ligger et sted mellom «ingen vane» og «maksimal vane» — de kalibrerer
ikke tallet, og de sier ingenting om en annen hale.

**Dom: 2,0 er ANTATT, lånt fra gate 2.** Men målingen over sier at det ikke er 2,0
som er feil størrelse. Porten passeres rikelig. Feilen ligger ett ledd før:
**nullpunktet er en konstant målt på én stakk og brukt på alle.**

### Forslag (tall, ikke commit — porten er urørt)

Tre veier, i den rekkefølgen jeg ville prøvd dem:

1. **Bind nullpunktet til stakken, ikke til en konstant.** `−0,0976` gjelder
   `abmpf`+`d7alle`, og der treffer den: fire kloner måler **−0,1055** i snitt
   (~700 obs per sete, SE 0,013) og ingen krysser. Løkkas hale måler
   **−0,0721** (`kort-7`) og **−0,0836** (`kort-8`) — 0,014 til 0,025 over
   konstanten. En konstant per hale, eller et nullpunkt estimert fra bordets
   egne seter når alle fire er samme bot, fjerner den voksende falske positiven.
   Dette er den eneste av de tre som treffer årsaken.
2. **Gulv på `n` i `stilvri`.** `aggressivitet` har `MIN_RUNDER = 4`; `stilvri` har
   ingenting. Toppen på z = 7,13 i runde 1 ved n ≈ 9 er ren SE-kollaps. Et gulv på
   f.eks. 40 observasjoner ville fjernet alle 48 treffene i `usokt`/fire like uten
   å røre noe av det som fyrer mot en ekte vane (n ≈ 28 alt i runde 3 der).
3. **Ikke rør noe.** Den myke terskelen gjør et grensetilfelle nesten gratis:
   krympet er 0,0004 og 0,0101 for de to flaggede klonene, mot 0,557 for
   trumftrekkeren. Skaden er liten i dag. Men den vokser med kamplengden, og den
   gjør K6-målinger mot egen bot systematisk skitne.

Ingen av dem er gjort. Eieren ser begrunnelsen først.

---

## 3. Stillingen der hukommelsen ENDRER et valg

`--del c` er `koblingssjekk.ts:ulikeMot` med to forskjeller: motstanderen er den
vanen detektoren faktisk er målt mot, og økten leses ut underveis, så «fyrte ikke»
kan skilles fra «fyrte og flyttet ingenting».

| stilling (sete 0 = armen, `full`-speken) | runder | valg | **ulike** | valg der `stilvri ≠ null` | maks z |
|---|---|---|---|---|---|
| tre **trumftrekkere** | **3** | 43 | **2** | 28 | 60,34 |
| tre trumftrekkere | 4 | 57 | **2** | 42 | 60,34 |
| tre trumftrekkere | 8 | 113 | **5** | 98 | 60,34 |
| tre trumftrekkere | 12 | 169 | **9** | 154 | 60,34 |
| tre `abmpd` («drar ikke trumf») | 12 | 178 | **0** | 14 | 3,38 |
| tre nøytrale (samme bot, ingen vane) | 12 | 169 | **0** | **0** | 1,57 |

**Den enkleste stillingen som gir minst ett endret valg: tre runder mot tre
trumftrekkere — 2 av 43 valg. Første avvik i runde 2.**

Nullarmen holder: mot tre nøytrale er `stilvri` null i alle 169 valg og armene er
bit-identiske. Kanalen fyrer på vane, ikke på støy — i `abmpf`-stakken.

### 3a. Hvorfor forrige rad ga 0 av 89 — og hva den egentlig viste

`koblingssjekk.ts:138` bruker `VANE = "vakt:abmpd:e1:…"`. `konvensjonsvakt.ts:486`:
flagget `d` er `ikkeDraTrumf, draTerskel: 3`. Det er en **konvensjonsjustering**,
ikke den stiliserte vanen. Målt residual: middel −0,0338 mot befolkningens −0,0976,
altså **forskjell 0,0638 og z opp i 4,25** — mot trumftrekkerens z på 60–116.

Og her er poenget som endrer dommen: **porten BLE passert i den raden.** Med 12
runder er `stilvri ≠ null` i 14 av 178 valg. Hukommelsen fyrte, vred
rollout-policyen, og søkets argmax flippet likevel ikke én eneste gang.

Det er **(c)**, ikke (b) — nøyaktig samme lesning som `r` og `d4` fikk. Forrige
gjennomgang leste 0 av 89 som «kunne ikke fyre»; sonden viser at den fyrte og ikke
flyttet noe. Raden var ikke blind, den var ekte.

---

## 4. K2 — ingen sti jeg rørte leser skjulte kort

`examples/oktsonde2.ts` er en ny fil og endrer ingen eksisterende kodesti. Den
leser bare øktens egen bokføring (`bok.biasFor`, `bok.stil`, `økt.stilvri`) og
offentlige felt (`fase`, `iTur`, `rundeNr`, `budvinner`).

```
grep 'state\.hender|\.hender|\.vrak|giving' examples/oktsonde2.ts
  -> ett treff, og det er kommentaren som sier at den ikke gjør det
```

Bokføringen skjer der den alltid har skjedd: `Profilbok.observer` på `RUNDE_SLUTT`
når alle kort er avdekket (`profilagent.ts:188`, `stilbias.ts:170`). Sonden kaller
`observer` gjennom stakken — samme krok som `kamp.ts` og `k6-vaner.ts` bruker —
ikke rett inn i boka.

**Typesjekk:** `oktsonde2.ts` er ren. Eneste feil i `src` er
`src/mlb/fargebytte.ts` TS6133, som er eldre enn grenen og ført som
forhåndseksisterende i både kanal 2- og koblingsrapporten.

---

## 5. Hva dette betyr for K4 og K6

K6 er **ikke umålt**. Hukommelsen fyrer, og den endrer valg mot en ekte vane
(2 av 43 alt etter tre runder). K6-målingens `0,007 ± 0,494` står derfor som et
ekte resultat: kanalen virker og betaler seg ikke — den flytter for få valg.

To ting bør likevel med i neste K6-måling:

1. **Mot vår egen bot er kanalen ikke stille i løkkas hale.** 35,9 % av punktene
   passerer porten med fire kloner. En «uten vane»-nullarm målt i den stakken
   måler da ikke null, og dobbeltdifferansen får støy fra en detektor som fyrer på
   et feilkalibrert nullpunkt.
2. **Sjekkens fire runder er for kort for `okt:`.** Porten passeres først rundt
   runde 6 i `abmpf`-stakken. En koblingsrad for hukommelsen må være minst 8 runder
   for i det hele tatt å kunne avkrefte noe.
