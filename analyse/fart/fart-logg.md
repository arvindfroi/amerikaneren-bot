# Fart: 7× billigere søk uten å tape styrke

Gren `fart-2026-09-17` i **`D:\amb-fart`** (fra `krav-2026-09-11` @ 092cd00, + cherry-pick av
`cac2b6e` = `~stikk=`-mønsteret og `sokfokus-kostnad.ts`). 17. sep, maks 3 kjerner.
**Ingen K1-måling startet herfra.** All tidsmåling er PARRET (samme stillinger, armene rett etter
hverandre i samme prosess), fordi maskinen er belastet.

`e1-modell/` kopiert fra `D:\amb-krav\e1-modell\`: **27 filer** (talt).

## Logg

- Oppsett ferdig. Kode lest: `sikkerorakel.ts`, `sdpar.ts`, `sdkort.ts`, `agentspek.ts` (sik-grenen).

## 0. Strukturfunn fra kodelesning (før måling)

1. **Kortekvivalens finnes IKKE.** `vurderPar` evaluerer hvert lovlige kort (`lovligeKort`) i hver
   verden. Ingen sammenslåing av sekvenskort.
2. **Utvalget av det endelige kortet** = nettets kort med mindre parret σ ≥ 0,5 OG søkets beste er et
   annet kort. Søket bestemmer altså bare kortet når det er «sikkert nok».
3. **Kandidatverdener:** 48 verdener × 32 kandidater, hver kandidat vektet av trohodet (`~mlbu=`).
   Det er 1 536 trohode-oppslag per beslutning, i tillegg til utspillingene. Må profileres.
4. **Utspilling:** motparten = `utenSøk(indre)` = `budq:…:vakt:abmp:e1:kort-8.bin`, med `M` (økta
   vrir policyen per motstandersete). `e3`: løses eksakt fra 3 stikk igjen.

## 1. PROFILEN (1 runde helbot, 3 botseter, `--cpu-prof`, `examples/fart-profil.mjs`)

Rådata: `D:\amb-grp\loop\fart\profil-P1.txt`. Total 10,0 s.

| hvor | andel |
|---|---|
| **`forover` (nevro/nett.ts), selvtid** | **75,5 %** |
| `spillFerdigEksakt` inkl. (utspillingene) | 91,9 % |
| `trekkVerdener` inkl. (32 kandidater × 48, trohodet) | **2,4 %** |
| `poengRotVerdier` inkl. (e3-bladet) | 0,6 % |
| trekkbygging (e1SpillTrekk, kortbok, valgtBort, synlig) | ~8 % |

Framoverkall per kortvalg (`fart-fang.ts`, én runde): **~2 300 i snitt**, opptil 13 355 i stikk 2.
Stikk 10–12: 1–2 kall (e3 tar over). ~83 700 kall per runde, alle på `kort-8` (493×512×384×256×52).

**Konklusjon:** tiden ligger der oppdraget antok — i utspillingene — og inni dem nesten bare i
nettets framoverpass. Verdenstrekkingen (trohodet) er ikke verdt å røre.

## 2. KNOTT 0: raskere `forover`, BIT-IDENTISK (ingen atferdsendring)

`nett-kolonne.ts` sier kolonnevis summering «endrer summeringsrekkefølgen». **Det stemmer ikke:**
for hver utgang r er leddene fortsatt bias, så kolonnene stigende. Avviket kom av at mellomlagene
ble holdt i Float64 i stedet for å rundes til Float32 per lag, slik `forover` gjør. `nett-rask.ts`
akkumulerer i Float64 og runder ved lagslutt.

`examples/fart-kjernebenk.ts` på 16 735 ekte innganger fra søket (`fart/fang-493.bin`), 6 omganger
vekselvis:

| kjerne | bit-avvik | µs/kall | fart |
|---|---|---|---|
| `forover` (i dag) | 0 | 85,6 | 1,00 |
| `foroverKolonne` (Float64 mellom lag) | **16 735 / 16 735** | 60,1 | 1,42 |
| **`foroverRask`** | **0 / 16 735** | 59,8 | **1,43** |
| **`foroverSimd`** (WASM f64x2, `nett-simd.ts`) | **0 / 16 735** | 20,2 | **4,25** |

`forover` går nå gjennom SIMD (JS-kolonnekjernen som reserve); den gamle radkjernen heter
`foroverRef` og kan velges med `settForoverKjerne("ref")` — bare for å bevise identiteten.
`test/nett-glissen.test.ts` og `test/amu-bitidentisk.test.ts`: 9/9 grønne med ny kjerne.

### SPÅDOM (skrevet FØR målingen i hele søket)
- Fingeravtrykket (alle handlinger + alle per-verden-verdier) er **identisk** ref mot auto.
- Parret fart per kortvalg: Amdahl med 75 % i `forover` og 4,25× gir 2,35×; minus kopiering inn/ut
  av WASM-minnet. **Spår 1,9–2,4×.**

### UTFALL i hele søket (`examples/fart-avtrykk.ts`, låstrinn, 5 runder, frø 1250000000)

| | |
|---|---|
| kortvalg (botseter) | 180, hvorav **138 vurderte søk** |
| avtrykk ref / auto | `037e4460` / `037e4460` — **identisk** |
| ms per kortvalg ref → auto | 370,8 → 127,4 |
| **parret fart** | **2,91 ± 0,02×** (spådd 1,9–2,4 — bedre, trolig fordi trohodet også bruker `forover`) |

Rådata: `D:\amb-grp\loop\fart\avtrykk.jsonl`. Prøve: `test/fart-kjerne.test.ts` (4/4).
Commit `forover gaar gjennom en WASM-SIMD-kjerne`.

## 3. KNOTTENE — implementert (commit c61d7da), av er av VERIFISERT

| felt | hva | av |
|---|---|---|
| `~ekv=1` | kortekvivalens: én representant (laveste) per klasse; ingen levende kort mellom (bordet teller som levende, etterlyst står alene); porten regner nettets kort som enig hvis det er i beste klasse | nøkkel utelatt |
| `~topp=<p>` | bare kort med nettets prior ≥ p (softmax over lovlige) + argmaks + det indre valget | nøkkel utelatt |
| `~flat=<n0>` | stopp etter n0 verdener hvis alle kandidater er like i hver verden (σ blir 0, nettet står) | nøkkel utelatt |

**Kodelesning før knott 1 — finnes kortekvivalens alt?** Nei. `vurderPar` spiller ut hvert lovlige kort.
(Den eksakte løseren `poengdds` slår sammen sekvenser internt, men den brukes bare i e3-bladet.)

**Av er av, fingeravtrykk:** helbotspeken, 5 runder, frø 1250000000, i `cdf2ce0` (før knottene) og
`c61d7da` (etter): **`037e4460` = `037e4460`**, 138 vurderte søk / 180 kortvalg. Prøver:
`test/fart-knotter.test.ts` 6/6 (av er av, ingen kollisjon, kaster, knottene BITER, klassene, topp).
Hele pakken etter SIMD: 1040 prøver, 4 røde — SKRALLE-lista (ingen av mine filer), to `web/dist`-alderprøver
og `mlb-tro-signal.bin` som mangler. Ingen berører søket.

**Røyk (1 kamp, 35 stillinger):** `E5` er **0,21×** — med SIMD er eksaktløseren på 5 kort dyrere enn
8 framoverpass. e<T> er altså ikke en fartsknott lenger; den tas ut (E4 får én arm).

## 4. HOVEDMÅLINGEN AV KNOTTENE (`examples/fart-knott.ts`, 3 arbeidere)

Armene på samme stilling, samme verdensfrø, rotert rekkefølge. Fasit (`poengRotVerdier`) ved ≤ 7
kort, anger bare der fasiten skiller. Klynge = kamp (eget frø per kamp, 3 runder hver).
Frø: arbeider 0 = 17090001.., 1 = 17091001.., 2 = 17092001...

### SPÅDOMMER (skrevet før kjøringen)
Støygulv (`STOY`, spilt kort): **~35–45 %** (troledd: argmaks 43,8 %, spilt lavere).

| arm | fart | endret spilt | anger (lag) mot REF |
|---|---|---|---|
| EKV | 1,3–1,5× | 5–15 % (mest innen klasse) | 0 ± støy |
| TOPP05 | 1,1–1,3× | < 5 % | 0 |
| TOPP15 | 1,4–1,8× | 5–15 % | 0 til +0,02 |
| TOPP30 | 1,8–2,5× | 10–25 % | +0,01 til +0,05 |
| FLAT6 / FLAT16 | 1,05–1,15× | 2–6 % / 1–3 % | 0 |
| E4 | 0,6–1,0× | 10–25 % | usikker |
| V24 | ~1,9× | 25–35 % | +0 til +0,05 (troledd: V12 hadde nesten samme støygulv) |
| V24+S35 | ~1,9× | 25–35 % | som V24 |
| V32 | ~1,45× | 20–30 % | 0 til +0,03 |
| EKV+TOPP15+FLAT8 | 2,0–2,6× | 15–25 % | 0 til +0,02 |
| …+V32 | 3–3,8× | 25–35 % | 0 til +0,04 |
| …+V24 | 4–5× | 30–40 % | +0,01 til +0,06 |

### KJØRING 1 (uten dommer), stoppet etter 341 stillinger / 5 kamper — `fart/kjoring1/analyse.txt`

Stoppet fordi fasit-angeren bare finnes ved ≤ 7 kort (47 skillende rader), mens beskjæringen virker
mest i stikk 1–4. Farts- og endringstallene er likevel solide (klynget på kamp, K = 5):

| arm | fart (i riggen) | endret spilt | endret klasse | anger lag, fasit (n=47) |
|---|---|---|---|---|
| **STOY (støygulv)** | 1,00 | **37,0 ± 4,8 %** | 30,5 % | +0,043 ± 0,037 |
| EKV | 1,34 ± 0,03 | 12,3 % | 5,6 % | 0,000 |
| TOPP05 | 1,10 | 0,6 % | 0,3 % | 0,000 |
| **TOPP15** | **2,88 ± 0,29** | 12,6 % | 10,3 % | +0,011 ± 0,009 |
| TOPP30 | 8,03 ± 0,54 | 21,4 % | 18,8 % | +0,032 ± 0,028 |
| FLAT6 / FLAT16 | 1,05 / 1,02 | 3,5 / 0,3 % | | 0,000 |
| E4 | **0,93** | 24,9 % | | +0,000 ± 0,018 |
| V24 | 2,01 | 19,1 % | | **+0,021 ± 0,007** |
| V32 | 1,51 | 14,1 % | | +0,032 ± 0,015 |
| EKV+TOPP15+FLAT8 | 4,48 ± 0,68 | 20,2 % | 14,4 % | +0,011 ± 0,009 |
| …+V32 | 6,59 ± 0,98 | 22,6 % | | +0,032 ± 0,015 |
| …+V24 | 8,70 ± 1,25 | 24,6 % | | +0,032 ± 0,015 |

Mot spådommene: **TOPP er langt kraftigere enn spådd** (TOPP15 2,9× mot spådd 1,4–1,8; TOPP30 8× mot
1,8–2,5) — nettets prior er skarp, så de fleste stillinger har 1–2 kort over 15 %. I stikk 1–4 er TOPP15
3,9× og stabelen 6,3×. EKV som spådd (1,34×). FLAT svakere enn spådd og nesten gratis. E4 er
tregere, ikke raskere (spådd 0,6–1,0: innenfor). V24/V32 som spådd i fart; **V24 har den eneste
angerøkningen som er ≥ 2 SE** (+0,021 ± 0,007, n = 47 — lite).

## 5. KJØRING 2 — med DOMMER (uavhengig 192-verdenssøk på alle lovlige kort)

Anger mot dommeren = maks Q − Q(spilt) i HELE runden. Dommeren har eget frø, så REF-støy og
dommerstøy er uavhengige, og differansen arm − REF er forventningsrett for «bommer armen mer på
det 192-verdenssøket ville valgt». Utløses bare når en arm (utenom STOY) avviker fra REF; ellers er
differansen 0 for alle armer. 2 runder per kamp for flere klynger.
Armer: REF, STOY, EKV, TOPP10, TOPP15, TOPP20, TOPP30, FLAT8, V32, EKV+TOPP10+FLAT8, EKV+TOPP15+FLAT8,
EKV+TOPP20+FLAT8, EKV+TOPP15+FLAT8+V32. Frø 1709{0,1,2}5001…

### SPÅDOMMER (før kjøring 2), dommeranger arm − REF
- STOY: 0 ± støy (nullsjekk; bare på utløst utvalg).
- EKV: ≤ +0,005. FLAT8: ~0.
- TOPP10: 0 til +0,01. TOPP15: 0 til +0,02. TOPP20: +0,005 til +0,03. TOPP30: +0,02 til +0,06.
- V32: +0,005 til +0,02 (færre verdener er en dårligere tilnærming av dommeren).
- Stablene: omtrent summen av delene.
- REF sin egen dommeranger (skala): 0,05–0,15.

### KJØRING 2, MELLOMSTAND (765 stillinger, 12 kamper) — `fart/knott2-mellom.txt`

Dommeranger arm − REF (hele runden, n = 765, klynget på kamp); REF sin egen dommeranger 0,49.

| arm | fart | endret | dommeranger | fasitanger lag (n=101) |
|---|---|---|---|---|
| STOY | 1,00 | **33,7 %** | −0,002 ± 0,052 (utløst utvalg) | −0,020 ± 0,013 |
| EKV | 1,39 | 15,4 % | −0,009 ± 0,009 | −0,005 ± 0,005 |
| **TOPP10** | 1,47 | 6,0 % | −0,007 ± 0,015 | −0,005 ± 0,011 |
| TOPP15 | 2,48 | 12,3 % | +0,015 ± 0,017 | **+0,594 ± 0,370** |
| TOPP20 | 3,67 | 16,3 % | **+0,036 ± 0,015** | +0,29 ± 0,31 |
| TOPP30 | 6,42 | 21,0 % | **+0,095 ± 0,033** | +0,30 ± 0,30 |
| FLAT8 | 1,04 | 2,6 % | +0,002 ± 0,001 | 0 |
| V32 | 1,50 | 16,9 % | **+0,048 ± 0,015** | +0,31 ± 0,27 |
| **EKV+TOPP10+FLAT8** | **2,24** | 19,2 % | **−0,002 ± 0,014** | −0,005 ± 0,011 |
| EKV+TOPP15+FLAT8 | 4,35 | 21,0 % | +0,028 ± 0,020 | +0,59 ± 0,37 |
| EKV+TOPP20+FLAT8 | 6,66 | 22,0 % | +0,045 ± 0,019 | +0,29 ± 0,31 |
| EKV+TOPP15+FLAT8+V32 | 6,43 | 23,9 % | +0,039 ± 0,024 | +0,33 ± 0,33 |

**Halen i TOPP15 er ekte, ikke støy.** Fasitangeren er drevet av to stillinger (kamp 170915002 stikk 6,
kamp 170915003 stikk 6) der nettets kort koster **30–31 poeng** (kontrakten ryker) og REF-søket fant
redningskortet — som hadde prior under 15 %, men over 10 %. Dommeren er enig i den ene (Q-anger 6,98).
Det er nøyaktig risikoen oppdraget advarte om: beskjæring er gratis nesten alltid og katastrofal sjelden.
**TOPP10 beholdt begge kortene.** V32 og TOPP ≥ 20 øker dommerangeren med ≥ 2,4 SE.

### KJØRING 2, SLUTT (1 536 stillinger, 23 kamper) — `fart/knott2-analyse.txt`, `…-rolle.txt`

Dommeranger arm − REF, klynget på kamp (K = 23). REF sin egen dommeranger: 0,475. STOY-nullsjekken
holder (−0,002 ± 0,033 på 623 utløste).

| arm | fart (rigg) | endret spilt | endret klasse | **dommeranger** | stikk 1–4 | stikk 5–8 |
|---|---|---|---|---|---|---|
| STOY (støygulv) | 1,00 | **34,1 ± 1,3 %** | 26,3 % | −0,002 ± 0,033* | | |
| EKV | 1,36 ± 0,02 | 15,0 % | 8,2 % | −0,005 ± 0,010 | +0,021 ± 0,013 | −0,015 ± 0,016 |
| TOPP10 | 1,49 ± 0,01 | 5,6 % | 5,1 % | +0,005 ± 0,008 | +0,003 ± 0,022 | +0,009 ± 0,009 |
| TOPP15 | 2,56 ± 0,07 | 12,1 % | 10,2 % | +0,012 ± 0,010 | +0,019 ± 0,016 | +0,012 ± 0,019 |
| TOPP20 | 3,73 ± 0,18 | 16,4 % | 14,1 % | **+0,049 ± 0,011** ✘ | +0,038 ± 0,019 | **+0,092 ± 0,029** |
| TOPP30 | 6,63 ± 0,39 | 20,7 % | 17,6 % | **+0,106 ± 0,023** ✘ | +0,053 ± 0,026 | **+0,207 ± 0,045** |
| FLAT8 | 1,04 ± 0,01 | 2,9 % | 2,1 % | +0,001 ± 0,002 | −0,003 ± 0,002 | +0,002 ± 0,002 |
| V32 | 1,50 | 17,9 % | 14,6 % | **+0,033 ± 0,010** ✘ | +0,030 ± 0,019 | +0,053 ± 0,025 |
| **EKV+TOPP10+FLAT8** | **2,19 ± 0,05** | 19,8 % | 13,1 % | **+0,008 ± 0,011** ✔ | +0,017 ± 0,020 | +0,017 ± 0,018 |
| EKV+TOPP15+FLAT8 | 4,28 ± 0,16 | 21,8 % | 15,2 % | +0,018 ± 0,014 (?) | +0,031 ± 0,016 | +0,031 ± 0,027 |
| EKV+TOPP20+FLAT8 | 6,74 ± 0,40 | 23,4 % | 17,0 % | **+0,050 ± 0,016** ✘ | | |
| EKV+TOPP15+FLAT8+V32 | 6,34 ± 0,23 | 25,3 % | 18,6 % | +0,025 ± 0,014 | | |

**Fasitangeren (≤ 7 kort, 192 skillende rader) kan ikke skille armene:** den er dominert av 30-poengs
utslag (kontrakten ryker eller berges), og de går begge veier for alle armer — også STOY (0 verre,
2 bedre). Tellingen verre/bedre med |Δ| > 10: EKV 0/2, TOPP10 0/1, **EKV+TOPP10+FLAT8 0/3**,
TOPP15 2/2, EKV+TOPP15+FLAT8 2/2, TOPP30 3/4. Uten utslagene er alle armer innenfor ±0,011.

**Mot spådommene:** EKV, FLAT8, TOPP10 og STOY traff. TOPP15 (+0,012) innenfor spådd 0–0,02.
TOPP20 (+0,049) og V32 (+0,033) over spådd tak. TOPP30 innenfor. Stablene litt under summen.

**DOM:**
- **Trygge å stable:** EKV, TOPP10, FLAT8 — alle langt under støygulvet i endring, ingen målbar anger.
- **Grenseland:** TOPP15 (+0,012 ± 0,010, 2,6×). Ikke etablert skade, men to katastrofeutslag i fasiten
  var nettopp «søket fant redningskortet med prior 10–15 %».
- **Forkastet:** TOPP ≥ 20, V32 (og dermed V24): ≥ 3 SE verre mot dommeren.

## 6. HELE BOTEN: dagens kode mot stablet spek (sidevogn, parret per stilling)

A = helbotspeken med GAMMEL sti (radkjernen + `e1SpillTrekk`-grunnen, `--ka ref`). B = stablet spek med
ny kjerne. B tar sin beslutning på A sin stilling, med sin egen økt som ser de samme tilstandene.
8 runder, frø 1250000000 (S1 = EKV+TOPP10+FLAT8) og 1250000001 (S2 = EKV+TOPP15+FLAT8), parallelt.

### SPÅDOM (før kjøring)
Kjernen 2,91× × grunntrekk ~1,05 × knotter (rigg: 2,19 / 4,28; fast kostnad per beslutning demper) →
**S1: 5,5–7×**, **S2: 9–12×**. Endret kortvalg mot A: S1 ~20 %, S2 ~22 % (riggen), pluss okt/M/eks-effekter.

### UTFALL — hele boten, 8 runder hver (`fart/stabel.jsonl`)

| spek | kortvalg | vurderte søk A / B | ulikt kortvalg mot A | ms A → B | **fart** |
|---|---|---|---|---|---|
| **S1** EKV+TOPP10+FLAT8 | 288 | 222 / 179 | 33 (11,5 %) | 452,1 → 65,9 | **6,86 ± 0,35×** |
| S2 EKV+TOPP15+FLAT8 | 288 | 227 / 141 | 43 (14,9 %) | 503,4 → 39,7 | 12,67 ± 1,31× |

(SE over beslutninger i ett parti — dette er en tidsmåling, ikke en styrkemåling.) Spådd S1 5,5–7×,
S2 9–12×: begge innenfor/på kanten. Oversatt til A6-målingen (580 ms): **S1 ≈ 85 ms, S2 ≈ 46 ms**.

Sidenotat: SIMD med Float32-lagring (`foroverSimd(…, true)`) er bit-identisk, men ikke raskere
(≈ 0,95× av f64-lagringen) — minnebåndbredden er ikke flaskehalsen. Står som valgfri variant, ikke i bruk.

## 7. LEVERANSE

**Speken til K1-måling (S1):**
```
okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin
```
**7× er nådd med S1** (6,86 ± 0,35), der ~2,9× er bit-identisk ingeniørarbeid og ~2,2× er knotter
uten målbar anger. **S2 (`~topp=0.15`) er 12,7×**, men har en ikke-etablert anger (+0,018 ± 0,014)
og halerisikoen fra de to redningsstillingene — mål den bare etter S1, som et eget steg.
Ikke gjort: avkortet utspilling + verdihode (grep 4) — det finnes ikke noe stillingsverdinett
(`seier-g0.bin` tar 9 poengtall, ikke en stilling), og S1 når målet uten.

## 8. K1 PARRET: S1 mot base (bestilt av koordinatoren 17. sep)

Driver `examples/fart-k1.mjs`, startet frakoblet via WMI, BelowNormal, maks 3 prosesser.
base = helbotspeken uten fartsknotter, S1 = samme + `~ekv=1~topp=0.1~flat=8`. Begge har ny kjerne og
iter-8-nettene. Duplikat over alle menneskekampene, 8 skarder per arm, parret på (spill, runde),
SE klynget på kamp (bootstrap). Krav: ≥ 2000 runder per arm, lik nøkkelmengde, ingen NaN.
Resultatet skrives av prosessen til `D:\amb-grp\loop\fart-k1.md`.

**BESLUTNINGSREGEL (skrevet før måling):** S1 godkjennes hvis S1 − base ≥ −0,15 pp (ca. 1 SE)
og ikke signifikant negativ (z > −1,96).
**SPÅDOM:** S1 − base ≈ 0 (−0,10 til +0,10); forrige parrede K1-differanse hadde SE ≈ 0,085.
- 15:21 (maskintid): S1 skard 0 ferdig (470 runder, 1 717 s). Base går ~2,8× tregere; hele K1 anslått til ~5 t.

### K1-UTFALL S1 mot base (ferdig 21:35 maskintid) — `D:\amb-grp\loop\fart-k1.md`
**S1 − base = −0,070 ± 0,136 pp (z −0,52), 3 276 parrede runder i 309 kamper → GODKJENT etter regelen.**
Rundepoeng −0,119 ± 0,194. Ulikt rundepoeng i 1 095 av 3 276 runder. Veggtid (BelowNormal, belastet):
base 803 min, S1 361 min (2,2× — skardtid inkluderer bud/vrak og alle fire seter).
**Forbehold:** SE ble 0,136, ikke ~0,085 som regelen antok, så −0,15 er ~1,1 SE. 95 %-intervallet er
[−0,34, +0,20]: målingen utelukker ikke et tap på ~0,3 pp. Spådd −0,10 til +0,10: traff.
Datagrunnlaget har vokst (309 kamper mot 273), så base − menneske (+0,05 ± 0,20) kan ikke sammenliknes
direkte med eldre K1-tall.
