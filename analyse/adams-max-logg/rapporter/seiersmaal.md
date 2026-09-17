# Seiersmålet: måler vi sluttspillet med feil linjal?

Gren `seiersmaal-2026-09-14` i **`D:\amb-seiersmaal`** (fra `krav-2026-09-11` @ 092cd00).
14. sep, maks 3 kjerner. **Ingen K1-måling startet.**

Ideen: søket maksimerer forventede POENG per runde (`standardMål`/`lagMål`, `src/moe2/sdkort.ts`),
men målet er å vinne løpet til 100. `troledd.md` §2 fant at fasiten er **flat i 88 %** av
sluttspillstillingene og konkluderte at sluttspillet er dødt. To kort med like mange poeng kan
likevel gi ulik **sannsynlighet for å vinne løpet**. Del 1 måler de samme stillingene med den
linjalen i stedet.

## Logg (fortløpende)

### Oppsett (13:40–13:50)

- **Arbeidskopi opprettet med `-b`**, så eierens gren aldri ble sjekket ut noe sted:
  `git worktree add -b seiersmaal-2026-09-14 D:\amb-seiersmaal krav-2026-09-11`.
  `krav-2026-09-11` står urørt på `092cd00`. Ikke rørt: `D:\amb-loop`,
  `D:\amb-krav-batteri` (iterasjon 13 kjører), eller noen annen `D:\amb-*`.

- **`node verktoy/hent-vekter.mjs` kjørt FØR alt annet**, som pålagt. Den skrev **2** filer
  (`d7alle.bin`, `vrakrang.bin`) — og det er alt den er ment å gjøre: filhodet sier den pakker
  ut nettopp de to fra `web/dist/*.b64`. **Den er ikke nok alene.** Resten av `e1-modell/` er
  `.gitignore`-t og følger ikke med en utsjekk.

  **Etter `hent-vekter.mjs` hadde kopien 7 av 27 modellfiler, og `seier-g0.bin` manglet** —
  nøyaktig fella oppdraget advarte om. Rettet ved å kopiere fra `D:\amb-krav\e1-modell`
  (`cp -n`, så de to nettopp utpakkede ikke ble overskrevet). Filsettet er nå **identisk med
  `D:\amb-krav`, 27 av 27**, `seier-g0.bin` (20 272 byte) på plass.

  **Lærdom verdt å skrive ned:** «kjør `hent-vekter.mjs`» er en nødvendig, men ikke
  tilstrekkelig, oppskrift. Sjekken som faktisk fanger feilen er
  `diff <(ls /d/amb-krav/e1-modell) <(ls e1-modell)` — antallet, ikke at kommandoen gikk bra.

- `node_modules` er **tom** i alle søsterkopiene (`D:\amb-krav` er en junction til
  `D:\amb-seier\node_modules`, som har 0 filer). Det er ikke et problem her: Node **v24.13.0**
  stripper typer selv, og verktøyene importerer bare relative `.ts`-filer. Verifisert ved at
  målingen under faktisk kjørte.

### Verktøyet Del 1 skal måle på fantes ikke i denne grenen

`examples/troledd-fasitspredning.ts` lå bare på `troledd-2026-09-13`. Hentet tilbake med
`git show 21acca9:examples/troledd-fasitspredning.ts` og committet.

### GRUNNLINJA ER REPRODUSERT — 88 % bekreftet uavhengig

`node examples/troledd-fasitspredning.ts --runder 2 --tak 7` i denne arbeidskopien:

```
FLATE (diff): 37 av 42 stillinger har spredning 0
```

**37 av 42 = 88,1 %**, identisk med `troledd.md` §2. Riggen er altså den samme, og et fall i
flat-andelen under kan ikke skyldes at jeg måler andre stillinger.

### Kodelesning: konverteringen finnes allerede, og den er billig

`poengRotVerdier` (`src/solver/poengdds.ts:332`) returnerer per lovlig kort ikke bare en
skalar, men **hele rundepoengvektoren**:

```
export interface Poengverdi {
  readonly kort: number;
  readonly poeng: readonly number[];   // rundepoeng PER SPILLER ved likevektsspill
  readonly verdi: number;              // måltallet (egen/diff) sett fra setet i tur
}
```

`verdi` er `måltall(poeng, spiller, N, mål)` — det er `poeng`-vektoren komprimert til den ene
skalaren `troledd.md` målte spredning i. **`poeng` er den fulle informasjonen, og den er alt
regnet.** Å måle i seiersannsynlighet er derfor ikke en ny løsning av spillet, bare en annen
avlesning av det samme treet:

```
P_kort = Seiersprediktor.sjanse(totalPoeng + poeng_kort, sete, målPoeng)
```

med `seier-g0.bin` (`src/mlb/seier.ts`, 9→64→64→4). **K2 er trivielt oppfylt:** prediktorens
inngang er `seierTrekk(poeng, sete, målPoeng)` — kampstillingen og målet, ingenting annet.
Den ser ikke ett kort, verken skjult eller åpent.

**Kostnaden er null ekstra søk.** Fasiten er alt regnet i grunnlinja; prediktoren er ett
framoverpass gjennom et 9→64→64→4-nett per kandidatkort.

### MEKANISMEN, presist — og den er ikke den oppdraget beskriver

Oppdraget sier «to kort med like mange poeng kan gi ulik sannsynlighet for å vinne løpet,
fordi de gir ulik varians». Fasiten her har **ingen varians**: den eksakte løseren gir ett
deterministisk utfall per kort. Så den formuleringen kan ikke være veien.

Veien som finnes er en annen, og den er skarpere. `måltall` (`poengdds.ts:167`) komprimerer
hele poengvektoren til én skalar:

```
diff = egne − (Σ alle − egne) / (N − 1)
```

**Bytter to ANDRE seter ett stikk seg imellom, står `egne` stille OG `Σ andre` stille.**
`diff` er da bit-identisk mens vektoren er en annen — og seiersannsynligheten bryr seg om
vektoren, fordi det betyr noe HVEM av motstanderne som nærmer seg 100. Det er den eneste
veien fasiten kan være flat i poeng og skillende i seier, og verktøyet måler derfor også
hvor ofte selve **vektoren** er flat: mellomleddet som avgjør om mekanismen i det hele tatt
har noe å jobbe med.

### Sonde: prediktoren har ikke-lineariteten ideen hviler på

`seier-g0.bin`, marginalverdien av +10 poeng for setet:

| tavle | P før | P etter | ΔP |
|---|---|---|---|
| 0–0–0–0 | 0,2400 | 0,3026 | **+6,3 pp** |
| 40–40–40–40 | 0,2501 | 0,3551 | +10,5 pp |
| 70–70–70–70 | 0,2745 | 0,4199 | +14,5 pp |
| 90–85–85–85 | 0,3407 | 0,5300 | **+18,9 pp** |

Samme ti poeng er verdt **tre ganger** så mye ved 90–85 som ved 0–0. Premisset i oppdraget
er altså riktig på prediktornivå.

*Forbehold:* de fire setenes P summerer til 0,96–1,05, ikke eksakt 1. Hvert sete er et eget
framoverpass over en rotert inngang, så koherens på tvers er ikke håndhevet. Målingen bruker
bare setets egen P, så det biter ikke her — men det er verdt å vite at prediktoren ikke er
en felles fordeling.

### Mekaniske detaljer som måtte leses før noe kunne måles

1. **Ekvivalensklasser.** `poengRotVerdier` returnerer **bare det høyeste kortet** i hver
   rekke av egne kort som er naboer blant kortene i spill. I dataene over ses det direkte:
   «igjen2 lovlige2 :: H12=10.00» — to lovlige kort, **én** verdi. Uten å utvide
   representantene til hele klassen ville botens kort ofte stått uten verdi, og en anger
   regnet på resten ville vært en stille skjevhet. Utvidelsen er portert fra
   `utvidRepresentanter` i `src/solver/eksakt.ts` (skanner oppover i fargen, hopper over kort
   ute av spill, brytes av et motstander- eller bordkort).
2. **Rundepoeng er DELTA.** `rundepoeng` gir rundens poeng per sete, så tavla etter runden er
   `totalPoeng + poeng`. Bekreftet mot `avsluttRunde` (`motor.ts:646-648`).
3. **Kampslutt er fasit, ikke prediksjon.** Når et sete når 100, er P eksakt 1 eller 0.
   `kampvinner`-regelen er kopiert eksakt (`motor.ts`): ved likhet vinner budgiversiden —
   først budvinner, så makker, ellers høyest.
4. **Begge speker bygger i denne kopien:** `ADAMS_MAALT` (9 felt) og søkegrunnlinja fra
   `troledd.md` §7 (17 felt).

### FORHÅNDSREGISTRERING SKREVET TIL DISK FØR MÅLINGEN

`analyse/seiersmaal-forhaandsregistrering.md`, committet før verktøyet ble kjørt på mer enn
grunnlinjas 42 stillinger. Kort: **flat-andelen ventes å falle fra 88 % til ~78 %
(intervall 3–18 pp fall)**; argmaks ventes å flytte seg i **under 10 %** av de tidligere
flate stillingene; og spredningen ventes å være større nær 100 enn tidlig (formkontroll).

### Reproduksjonskontrollen består — riggen måler de samme stillingene

```
node examples/seiersmaal-fasit.ts --kamper 1 --runder 2 --tak 7 --froe 13000777

FLATE (diff):  37 av 42 stillinger har spredning 0
FLATE (seier): 37 av 42 stillinger har spredning < 0,01 pp
```

**37 av 42 i poeng er bit-likt `troledd.md` §2 og bit-likt det gamle verktøyet.** Det nye
verktøyet ser altså nøyaktig de samme stillingene; et fall i flat-andelen kan ikke skyldes
at jeg måler noe annet.

Merk allerede her: på grunnlinjas egne 42 stillinger er seiersfasiten flat i **de samme 37**.
Men de 42 kommer fra runde 0–1 i én kamp, altså med tavla nær 0–0 — nettopp der prediktoren
er flatest (+6,3 pp per 10 poeng). Målingen som betyr noe må gå HELE kamper til 100, så
tavla spenner over hele løpet.

### Kalibrering på HELE kamper (3 kamper, 42 s, 1 kjerne) — og den peker mot at jeg tok feil

```
1197 stillinger, tavla spenner 0 → 99, runder per kamp: 14, 8, 34
FLATE (diff):  962 av 1197   (80,4 %)
FLATE (seier): 964 av 1197   (80,5 %)
poengvektoren identisk:  952
```

Tre ting, og de er alle mot min egen forhåndsregistrerte spådom:

1. **Flat-andelen faller ikke. Den står stille** (80,4 % mot 80,5 %) — og den peker om noe
   marginalt *oppover*, ikke nedover.
2. **Mekanismens takhøyde er nesten tom.** 952 av 1197 har identisk poengVEKTOR, og 962 er
   flate i `diff`. Bare **10 av de 962** flate stillingene har en vektor som i det hele tatt
   skiller — altså ~1 %. Der fasiten er flat i poeng, er utfallet så godt som alltid *helt*
   identisk, ikke bare like i den komprimerte skalaren. Da har ingen linjal noe å skille på.
3. Seiersfasiten er flat i litt *flere* stillinger enn poengfasiten. Det er ventet i motsatt
   retning: en poengforskjell som ikke flytter vinnersjansen målbart (f.eks. når kampen alt
   er avgjort) gjør en poeng-skillende stilling seiers-flat.

Dette er kalibrering på 3 kamper, ikke dommen. Hovedmålingen (180 kamper, 3 arbeidere) kjører.

**De 9 stillingene der seiersfasiten faktisk skiller mens poengfasiten er flat**, er likevel
verdt å se på: spredningen er median **0,155 pp** (maks 0,314), argmaks flytter seg i 7 av 9,
og botens anger er 0,117 ± 0,033 pp. Altså ekte, men bittesmå utslag på ~1 % av stillingene.

### En feil jeg fanget i mitt eget verktøy før den kostet noe

Den første bootstrappen filtrerte alle radene på nytt i hver av de 20 000 runddene — altså
O(B × rader) per tabellrad, 20 000 × 60 000 rader. Den ville tatt timer per linje i tabellen,
og jeg ville trolig ha kuttet B for å komme i mål. Alle statistikkene her er **snitt** (en
andel er snittet av en 0/1-indikator), så bootstrappen resampler nå **per-kamp-aggregater**:
O(B × klynger). Samme tall, sekunder i stedet for timer. Røykprøven på kalibreringsfila står
over.

### Del 2: innstikkspunktet for `~mål=seier` er lest opp, og det er rent

Skal knotten bygges, er det **ett funksjonsbytte**, ikke ny kode i søket:

| sted | hva som finnes i dag |
|---|---|
| `src/moe2/sdkort.ts:115` | `SDOpts.mål?: (sluttState: GameState, spiller: number) => number` |
| `src/moe2/sdpar.ts:280` | `const mål = opts.mål ?? standardMål;` … `:304` `verdier[i].push(mål(slutt, spiller))` |
| `src/moe2/sikkerorakel.ts:267` | `this.mål = opts.lagmål === true ? lagMål : undefined;` … `:317` `mål: this.mål` |
| `src/moe2/agentspek.ts:1265-1290` | `~`-løkka, arter `mlb`/`mlbu`/`lik`; kaster på ukjent art |

Bladverdien er alt en funksjon `(sluttState, spiller) => number` som byttes ett sted.
`~mål=seier` ville satt den til `100 · P(vinne | sluttState.totalPoeng, sete, målPoeng)`.
**«Av er av» er strukturelt gratis** her, på nøyaktig samme form som `lagmål`: uten feltet er
`this.mål` `undefined`, og `sdpar` faller tilbake på `standardMål` — nøkkelen finnes ikke i
opsjonsobjektet i det hele tatt.

**K2 holder også her:** bladet er en simulert sluttstilling, og prediktoren leser bare
`totalPoeng` og `målPoeng` fra den. Ikke ett kort.

### FORBEHOLD om mitt eget måltall «argmaks flytter seg», sagt før tallene brukes

`argmaksPoeng` er det FØRSTE kortet som når maks i poeng. I en stilling der poengfasiten er
**flat**, er alle kort maks, så «argmaks i poeng» er en vilkårlig tie-break — ikke et valg
noen bot faktisk tar. Derfor betyr «argmaks flytter seg i 7 av 9» i §2 over **ikke** at
linjalen endrer et reelt kortvalg; det betyr bare at seierslinjalen peker på et annet kort
enn den vilkårlige første.

**Det ærlige tallet i flate stillinger er botens egen anger** (`angerP` mot dagens faktiske
kort), og det er det tallet som rapporteres som dommen. `byttet` brukes bare der poengfasiten
faktisk skiller, der argmaks i poeng er et ekte valg.

---

# DEL 1 — RESULTATET: FASITEN ER LIKE FLAT I SEIERSANNSYNLIGHET. Hypotesen er forkastet.

**74 968 stillinger, 180 kamper (= 180 klynger), 3 arbeidere, 18 min.** Tavla spenner
−24 → 99. Rådata `D:\amb-seiersmaal\analyse\seiersmaal-w{0,1,2}.jsonl` (40 MB, holdt utenfor
repoet), sammendrag `seiersmaal-sammendrag.txt` (også kopiert hit).
Duplikatkontrollen kjørte: **0 dupliserte rader**.

## 1. Hovedtallet — det oppdraget ba om

| linjal | flate | andel (klynget SE) |
|---|---|---|
| **POENG** (diff, spredning 0) | 59 241 | **79,0 ± 0,2 %** |
| poengVEKTOR identisk | 58 454 | 78,0 ± 0,2 % |
| **SEIER** (< 0,01 pp) | 59 225 | **79,0 ± 0,3 %** |

**PARRET (seier − poeng), samme stillinger: −0,02 ± 0,07 pp.**

Andelen faller ikke. Den står bom stille, og SE-en på 0,07 pp betyr at et fall på mer enn
~0,2 pp ville slått ut. Dette er et **meget stramt null**, ikke en underpowered skuldertrekning.

**Min forhåndsregistrerte spådom (fall på 3–18 pp, punktanslag 10 pp) er FORKASTET.** Jeg skrev
også ned utfallet som ville gjort ideen tom på dette leddet: «faller den under 2 pp». Målt: 0,02.

Terskelen bærer ikke konklusjonen — flat-andelen er 78,6 % ved 1e-7 pp og 79,0 % ved 0,01 pp.

## 2. HVORFOR — og dette er den egentlige informasjonen

**78,0 % av alle stillingene har IDENTISK poengvektor.** Ikke «lik i den komprimerte
skalaren» — bit-likt utfall for hvert eneste sete. Der er det ingenting for noen linjal å
skille på, uansett hvor god den er.

| av de 59 241 poeng-flate stillingene | n | andel |
|---|---|---|
| har ULIK poengvektor (der en annen linjal *kan* skille) | 787 | **1,33 ± 0,07 %** |
| skiller faktisk i seier (> 0,01 pp) | 716 | **1,21 ± 0,06 %** |

Mekanismen jeg identifiserte er altså **ekte, men nesten tom**. Den finnes i 1,3 % av de
flate stillingene, ikke i «mye av de 88 %».

Og der den finnes, er den liten: spredning **median 0,116 pp**, snitt 0,236 ± 0,048 pp,
og **dagens bots anger er 0,089 ± 0,006 pp**. Botens kort er allerede seiersoptimalt i 49,4 %.

**Hele det skjulte potensialet, summert:** 63,9 pp anger fordelt på 74 968 stillinger =
**0,0009 pp per stilling**. Til sammenlikning bærer stillingene der seiersfasiten skiller i
det hele tatt 0,181 pp per stilling. Det skjulte laget er **0,5 % av det som alt er synlig**.

Halen er sjekket: bare **11 av 74 968** poeng-flate stillinger har spredning ≥ 1 pp, og den
ene ekstreme (33,8 pp, tavle [35, 99, 78, 99]) har anger **0,00** — boten spilte alt riktig.

## 3. Der poengfasiten SKILLER — der er det derimot noe

| fasit skiller i | n | snitt anger | argmaks byttet |
|---|---|---|---|
| POENG (poeng/runde) | 15 727 | 1,278 ± 0,053 | — |
| **SEIER (pp)** | 15 743 | **0,862 ± 0,044** | 5,7 ± 0,2 % |

De to linjalene er uenige om beste kort i **4,9 ± 0,2 %** av stillingene der poengfasiten
faktisk skiller (764 av 15 727). Det er ikke null — men det er i de **ikke-flate** stillingene,
altså ikke funnet oppdraget lette etter.

## 4. H3-formkontrollen BESTÅR — og den viser at prediktoren virker

| kampstilling (ledende) | n | snitt spredning i seier (pp) | snitt anger (pp) |
|---|---|---|---|
| < 40 | 28 962 | 1,055 ± 0,042 | 0,755 ± 0,055 |
| 40–69 | 25 329 | 1,225 ± 0,051 | 0,830 ± 0,061 |
| 70–84 | 11 978 | 1,268 ± 0,094 | 0,796 ± 0,120 |
| **≥ 85** | 8 699 | **1,622 ± 0,159** | **1,514 ± 0,230** |

Seierslinjalen skiller mer, og boten angrer dobbelt så mye, nær 100. **Nullresultatet i §1 er
altså ikke et dødt instrument** — prediktoren biter der teorien sier den skal. Den biter bare
ikke i de flate stillingene, fordi de er flate i utfall og ikke i linjal.

Merk også raden `ledende ≥ 85`: fasiten er **mer** flat i seier (82,2 %) enn i poeng (78,0 %).
Når kampen er avgjort, er P eksakt 1 eller 0 uansett hvilket kort som spilles.

## 5. En korreksjon på tallet som er sitert: 88 % er 79 %

`troledd.md` §2 sitt «88 %» er **37 av 42 stillinger fra to runder i én kamp**. Reprodusert
nøyaktig her. På 74 968 stillinger fra 180 kamper er den samme andelen **79,0 ± 0,2 %**.
De 88 % er altså et småutvalgstall med ±5 pp usikkerhet, ikke en konstant. Konklusjonen det
brukes til å bære («sluttspillet er dødt») endres ikke av korreksjonen — men tallet bør
siteres som 79 %.

---

# DOMMEN, og hva jeg IKKE bygger

**Del 1 bærer ikke, og oppdraget sa «bygg bare hvis del 1 bærer». `~mål=seier` er derfor
IKKE bygget.** Å bygge den ville vært å bruke 3 kjerner og en K1-kø på et ledd der det
skjulte potensialet er målt til 0,0009 pp per stilling.

Det er dommen på **fasiten**. Det som IKKE er målt her, og som er den ene veien videre hvis
noen vil forfølge ideen: **søkets blad er ikke fasiten.** Søket snitter over 48 samplede
verdener, og der *varierer* utfallet mellom verdener. Fordi P(seier) er en konkav/S-formet
funksjon av poeng, er `E[P(poeng)] ≠ P(E[poeng])` — så et seiersblad kan endre valget selv
der fasiten er helt flat, gjennom risikoholdning over verdener. Det er en **annen hypotese**
enn den oppdraget stilte, og oppdragets egen begrunnelse («to kort med like mange poeng kan
gi ulik varians») passer faktisk bedre på den: fasiten har ingen varians, men verdenssnittet
har det. Den ville krevd sin egen forhåndsregistrering.

**Innstikkspunktet er kartlagt og rent** (se over): ett funksjonsbytte i
`sikkerorakel.ts:267` + `~mål=seier` i `agentspek.ts`-løkka, «av er av» strukturelt gratis.
Skulle noen ville måle risikoholdnings-hypotesen, er veien klar — men den skal ikke køes på
grunnlag av denne målingen.

## Metodenotat

- SE er **klyngebootstrapfordelingens standardavvik** over 180 kamper, B = 20 000.
  **Ikke delt på √n en gang til.**
- **Ingen anger regnet i flate stillinger** — `angerP` er `null` der, og `null` faller ut av snittet.
- Undergruppene i §4 og sammendragets §4 er **beste-av-mange** og er ikke funn.
- **Ingen K1-måling startet.** Taket på 3 kjerner er holdt hele veien (verifisert: nøyaktig
  3 `seiersmaal-fasit`-prosesser under kjøringen).
- Ingen kildefil ble redigert mens målingen kjørte (`strata.md` sin HENDELSE-lærdom).
