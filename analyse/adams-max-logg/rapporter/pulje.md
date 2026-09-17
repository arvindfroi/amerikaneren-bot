# Felles kandidatpulje: å gi risten en EKTE akse

Gren `pulje-2026-09-14` i **`D:\amb-pulje`** (fra `krav-2026-09-11` @ 092cd00).
14. sep, maks 3 kjerner. **BYGGEOPPDRAG — ingen K1-måling startet.**

## Logg (fortløpende)

- **Arbeidskopi opprettet uten å røre eierens gren.**
  `git worktree add -b pulje-2026-09-14 D:/amb-pulje 092cd00` — med `-b`, så
  `krav-2026-09-11` aldri ble sjekket ut noe sted. Oppdraget ba om `add` + `switch -c`;
  `-b` gjør samme jobb og gjør feilen strukturelt umulig i stedet for å rette den
  etterpå (bandit-agenten måtte rette; strata-agenten brukte `-b`).
  `krav-2026-09-11` står urørt på `092cd00`.
- Oppsett: `node_modules` som junction til `D:\amb-seier\node_modules`, og
  `e1-modell\*` kopiert fra `D:\amb-krav\e1-modell` (`tro-8.bin`, `vrak-8.bin`,
  `etterlyst-8.bin`, `budq-8.bin`, `kort-8.bin` verifisert på plass — modellfilene er
  `.gitignore`-t, og bandit-agenten måtte kaste en grunnlinje som manglet dem).
- **Egen grunnlinje-arbeidskopi `D:\amb-pulje-foer`** på `092cd00` (detached), med egen
  junction og egne modellfiler. Grunnlinjeprøven kjøres DER, så ingen redigering i
  `D:\amb-pulje` kan nå den mens den kjører. Det er strata-agentens hendelse (§«den
  første grunnlinjeprøven ble forkastet»), og den koster bare en utsjekk til.
- Lest hele kjeden: `troledd.md`, `bandit.md`, `strata.md`, `dekomp.md`, `sokfokus.md`.
  Rigg lest: `D:\amb-strata\examples\strata{,-sum,-identitet,-forventning}.ts`,
  `verktoy\strata-kjor.sh`, `test\strata-trekk.test.ts`.

---

## 1. KODELESNINGEN — og den ene tingen oppdraget tar feil om

Kjeden er `vurderPar` (`sdpar.ts:268`) → `trekkVerdener` (`sdkort.ts:347`) →
`trekkVerdenBelief` (`sampler.ts:434`).

```
trekkVerdener:      for v = 0..47:  w = trekkVerdenBelief(...)      ← 48 SLOTTER
trekkVerdenBelief:    for i = 0..31:  utvalg[i] = trekkVerden(...)  ← EGEN pulje på 32
                      logW = budW + trovekt + vrakvekt
                      r = rng() * Σ exp(logW − maks)                ← ÉN kategorisk trekning
```

**Oppdraget sier trekningen blir dyrere. Det stemmer ikke.** I dag trekkes
48 × 32 = **1536** kandidater per beslutning, og alle 1536 vektes. En felles pulje på
`48·k` = 1536 trekker og vekter **nøyaktig like mange**. Den eneste nye kostnaden er
én sortering av 1536 elementer per beslutning — mot 1536 nettoppslag er det støv.
Kostnaden måles likevel, ærlig, per rad.

### 1a. Rekkefølgen i RNG-strømmen er ikke likegyldig

Dagens strøm er `[32 trekk][1 rng][32 trekk][1 rng]…`. En naiv felles pulje som
trekker 1536 i ett strekk og DERETTER trekker 48 utvalgstall ville fått **andre
kandidater** fra og med nr. 33, fordi i.i.d.-armen har brukt et `rng()` på utvelgelsen
før den. Da ville armen målt «andre verdener» i tillegg til «bedre fordelte verdener»
— to endringer i én, som er nøyaktig fella `bandit.md` §3 beskriver.

**Løsningen er å beholde blokkstrukturen i STRØMMEN og bare slå sammen UTVELGELSEN:**
trekk 32 kandidater, forbruk ett `rng()` (som blir `u_v`), gjenta 48 ganger, og velg
så alle 48 verdenene fra den samlede puljen på 1536.

Da er
- antall `trekkVerden`-kall identisk og i **samme rekkefølge**,
- antall `rng()`-kall identisk, på **samme sted** i strømmen,
- **kandidatpuljen bit-identisk** med i.i.d.-armen på samme frø.

Bare utvelgelsen skiller. Det er den samme egenskapen strata-agenten hadde, og den er
det som gjør både «av er av» og selve målingen skarp.

## 2. DEN STRUKTURELLE PRISEN, SAGT FØR JEG MÅLER

Dette er hovedforbeholdet, og det følger av matematikken, ikke av en måling:

Dagens utvalg er **SIR med M = 32** — hver verden er trukket ved importance-resampling
fra en pulje på 32. En felles pulje gjør hver verden til **SIR med M = 1536**. SIR er
bare asymptotisk riktig; med endelig M er den skjev mot forslagsfordelingen, og
skjevheten krymper med M. **Fordelingen står altså IKKE stille — den flytter seg mot
målfordelingen `p ∝ q·w`.**

Strata-agenten så dette (§4c, «det bytter samtidig SIR-approksimasjonen fra M=32 til
M=1536») og la veien til side av den grunn. Oppdraget her ber om den likevel, og ber
samtidig om at fordelingen skal stå stille. **De to kan ikke begge oppfylles.** Å
sortere puljen og legge en rist over den felles kumulative vekten er nettopp det som
gir risten en akse — og en felles akse finnes bare fordi kandidatene nå konkurrerer
mot hverandre på tvers av slottene.

Jeg leverer derfor ikke et «bestått/strøket» på forventningsretthet, men et **skille**:

1. `blokk`-modus (felles pulje, men utvelgelse blokk for blokk som i dag) er
   **bit-identisk med i.i.d.** Den beviser at den felles kodestien er en tro
   omskriving, og isolerer utvelgelsen som den eneste forskjellen.
2. `felles`-modus måles mot i.i.d. **og** mot en høy-M referanse. Flytter marginalen
   seg MOT referansen, er det SIR-skjevhet som forsvinner, ikke skjevhet som innføres.
   Flytter den seg bort, er knotten ødelagt.

Det er den ærlige formen av kravet, og den er sterkere enn et rent nullsvar ville vært.

## 3. RISIKOEN JEG VENTER MEST PÅ — mangfoldet kan kollapse

`troledd.md` §4 målte vekten som **skarp**: ESS/K = 0,179, maks p = 0,547, log-spenn
19,13 (24,75 i forsvar). I dag beskytter de 48 uavhengige puljene mangfoldet: hver
pulje har sin egen vinner, så de 48 verdenene er 48 FORSKJELLIGE «beste i sin pulje».

Med én felles pulje og en rist over den kumulative vekten får en kandidat som holder
mer enn 1/48 = 2,08 % av totalvekten **flere slott**. Er vekten så skarp som troledd
målte, kan noen få kandidater ta halvparten av de 48 slottene, og da vurderes
kortene i langt færre DISTINKTE verdener enn 48.

Et støygulv som faller fordi de 48 verdenene har kollapset til 5 er ikke seieren
oppdraget er ute etter. **Antall distinkte verdener og største multiplisitet logges
derfor i hver rad**, og de står i rapporten ved siden av gulvet — ikke i en fotnote.

## 4. BYGGET (commit `e97a6a5`)

Fem kildefiler, og ikke én mer:

| fil | endring |
|---|---|
| `src/solver/sampler.ts` | ny `trekkVerdenerFellesPulje` — felles pulje, sortert, rist over kumulativ vekt |
| `src/moe2/sdkort.ts` | `pulje?: "felles" \| "blokk"` på `trekkVerdener`; dispatcher til den nye fila |
| `src/moe2/sdpar.ts` | `ParOpts.pulje`, ført videre til `trekkVerdener` |
| `src/moe2/sikkerorakel.ts` | `SikkerOpts.pulje` + offentlig `Sikkerorakel.pulje` (så prøvene kan bevise kobling) |
| `src/moe2/agentspek.ts` | `~pulje=felles` / `~pulje=blokk` som ny art i `~`-løkka; kaster på alt annet |

Nøkkelen finnes ikke i opsjonsobjektet uten feltet (`...(pulje === undefined ? {} : { pulje })`)
— «av er av» strukturelt, samme form som `~stikk=`, `~fordel=` og `~trekk=` bruker.

Måleriggen, portert fra strata med egne filnavn: `examples/pulje.ts` (fire armer),
`examples/pulje-sum.ts` (klynget SE + duplikatkontroll), `examples/pulje-identitet.ts`
(fingeravtrykk på tvers av commitene), `examples/pulje-forventning.ts`
(forventningsretthet + mangfold), `verktoy/pulje-kjor.sh` (tre arbeidere + vakt),
`test/pulje-trekk.test.ts`.

### 4a. Hvorfor `blokk` finnes i tillegg til `felles`

`felles` kan lyve på to måter samtidig: utvelgelsen kan virke, ELLER den felles
kodestien kan bygge/vekte puljen litt annerledes enn `trekkVerdenBelief` gjør.
`blokk` kjører **nøyaktig samme nye kode**, men velger blokk for blokk med blokkens
egen `maks`-normalisering — altså tegn for tegn regnestykket i `trekkVerdenBelief`.
Er `blokk` bit-identisk med av, er den ENESTE forskjellen i `felles` selve utvelgelsen.
Det er en negativ kontroll oppdraget ikke ba om, og den er billig.

## 5. GRUNNLINJE AV PRØVENE FØR ENDRINGEN

`npm test` på `092cd00` i **`D:\amb-pulje-foer`** (egen arbeidskopi, egne modellfiler,
utenfor rekkevidde for enhver redigering i `D:\amb-pulje`):

```
tests 1028 | pass 1018 | fail 4 | skipped 6 | duration 221,8 s
```

Det er **nøyaktig** de samme fire tallene `bandit.md` og `strata.md` rapporterte på
samme commit, målt uavhengig i en tredje arbeidskopi. De fire røde, navn for navn:

1. `«web/dist/app.js» er ikke bygd fra en eldre «web/adamskjede.ts»`
2. `«web/dist/worker.js» er ikke bygd fra en eldre «web/adamskjede.ts»`
3. `tapet: med mlb-tro-signal.bin (776) er maskert tap ≤ umaskert …`
4. `SKRALLE: ingen NYE haandbygde speker i examples/ og test/`

Alle fire er pre-eksisterende, og ingen av dem rører `sdpar.ts`, `sikkerorakel.ts`,
`sdkort.ts`, `solver/sampler.ts` eller `agentspek.ts` sin `sik:`-gren. SKRALLE lister
**25** filer, de samme 25 strata så, og ingen av dem er mine — mine nye filer importerer
`ADAMS_MAALT` i stedet for å hardkode vektstier.

(Veggtiden er 222 s mot strata sine 97 s på samme prøvesett. Maskinen kjører iterasjon
12 sitt batteri samtidig; pass/fail påvirkes ikke, bare veggtiden.)

## 6. DE NI PRØVENE — alle grønne (6,5 s)

`test/pulje-trekk.test.ts`, `node --test`: **tests 9 | pass 9 | fail 0**.

1. **AV ER AV STRUKTURELT** — uten feltet er `Sikkerorakel.pulje` `null`, ikke «iid».
   Nøkkelen finnes ikke i opsjonsobjektet i det hele tatt.
2. **INGEN KOLLISJON** — `48k32e3LD~pulje=felles` gir fortsatt V=48, k=32, e=3, L og D.
   `~lik=` og `~pulje=` kommuterer: begge rekkefølger gir samme resultat på alle fire feltene.
3. **UGYLDIG KASTER HØYLYTT** — `""`, `iid`, `Felles`, `felles2`, `pool`, `1`, `systematic`,
   `Blokk` og `blokker` kaster alle. Ukjent art kaster fortsatt, og meldingen nevner den nye formen.
4. **`utenSøk` URØRT** — strippes til basen, og feltantallet er tegn for tegn uendret
   (`~pulje=felles` inneholder ikke kolon).
5. **`blokk` ER BIT-IDENTISK MED AV** — over 30 stillinger gir `~pulje=blokk` *nøyaktig*
   de samme 16 verdenene som ingen knott, verden for verden, kort for kort.
   **Dette er den viktigste prøven i fila:** den beviser at den felles kodestien bygger og
   vekter puljen tegn for tegn som `trekkVerdenBelief`, så alt som skiller i `felles`
   kommer fra UTVELGELSEN og ikke fra en utilsiktet endring på veien.
6. **SAMME ANTALL VERDENER OG UTSPILLINGER** — over 30 stillinger er `n` og antall
   kandidater identiske, altså er `n × kandidater` identisk. Det ER utspillingene:
   `vurderPar` går verden-for-verden × kandidat-for-kandidat, så produktet er ikke et anslag.
7. **RNG-NØYTRAL** — en teller rundt `rng` viser NØYAKTIG like mange kall i begge modusene.
   Det er den harde formen av «samme budsjett», og den er det som gjør kandidatpuljene
   bit-identiske mellom armene.
8. **KNOTTEN BITER** — med ≥ 3 lovlige kort og samme frø velger felles pulje noen ganger et
   annet kort. Uten denne kunne knotten vært død i strengen, som `12k16d4` var.
9. **MANGFOLDET ER MÅLBART** — en ærlighetsprøve, ikke en kvalitetsprøve: antall distinkte
   verdener er hentbart fra riggen og ligger i `[1, K]`. Uten den kunne et gulv som faller
   av ensemblekollaps blitt rapportert som en seier.

## 7. TYPESJEKK — null nye feil, og null i mine filer

`tsc --noEmit` kjørt på **begge** commitene med samme typebibliotek, og feilmengdene
sammenliknet med `comm`:

| | commit | arbeidskopi | feil |
|---|---|---|---|
| FØR | `092cd00` | `D:\amb-pulje-foer` | **1** |
| ETTER | `e97a6a5` | `D:\amb-pulje` | **1** |

Begge er den samme: `src/mlb/fargebytte.ts(60,1): 'kortIndeks' er deklarert men aldri
brukt` — nøyaktig den pre-eksisterende feilen `sokfokus.md` §5, `bandit.md` og
`strata.md` også fant. **Diffen av feilmengdene er tom, og ingen av de fem endrede
filene har én eneste feil.**

**To ærlige merknader om verktøyet, og den andre gjelder også de andre notatene:**

1. `D:\amb-seier\node_modules` — som de andre agentene junctionet til — er nå **tom**.
   Typene er derfor lånt fra `…\Projects\amerikaneren-bot\node_modules` (kun lest).
   Uten `@types/node` gir repoet 27 falske feil av typen «Cannot find module 'node:fs'»;
   med typene på plass står det igjen én ekte.
2. **`tsconfig.json` dekker bare `src` — den EKSKLUDERER `test` og `examples`.** Tabellen
   over sier derfor ingenting om riggfilene mine. Repoet har `tsconfig.kontroll.json`
   (`include: ["src", "examples", "test"]`) nettopp for det, og den er kjørt separat i §7a.
   Formuleringen «én feil i hele repoet» i `bandit.md` og `strata.md` er strengt tatt
   «én feil i `src`».

### 7a. Riggfilene, sjekket med `tsconfig.kontroll.json` (src + examples + test)

| | commit | feil totalt | feil i MINE filer | nye feil i delte filer |
|---|---|---|---|---|
| FØR | `092cd00` | 169 | – | – |
| ETTER | `e97a6a5` | **169** | **0** | **0** |

Nøyaktig like mange, og `comm` på de to sorterte feilmengdene gir **tom** differanse i
begge retninger. De 169 er pre-eksisterende `noUnusedLocals`-feil og
`ChildProcess`-typekonflikter i eldre `examples/`. **Ingen av mine seks nye filer
(`examples/pulje*.ts`, `test/pulje-trekk.test.ts`) har én eneste feil** under den strenge
konfigurasjonen.

## 8. «AV ER AV» — BEVIST PÅ TVERS AV KODEENDRINGEN

En prøve inne i grenen kan bare vise at knotten AV oppfører seg som knotten AV. Den kan
ikke vise at den oppfører seg som **koden før knotten fantes**.
`examples/pulje-identitet.ts` er derfor kjørt på BEGGE commitene og sammenliknet med `diff`:

| | commit | arbeidskopi | stillinger | verdener | fil |
|---|---|---|---|---|---|
| FØR | `092cd00` (knotten finnes ikke i koden) | `D:\amb-pulje-foer` | 120 | 48 | `pulje-id-foer.txt` |
| ETTER | `e97a6a5` (knotten i koden, feltet ikke i kallet) | `D:\amb-pulje` | 120 | 48 | `pulje-id-etter.txt` |

**`diff` ER TOM** — `pulje-id-diff.txt`, 0 linjer, exit 0.

Fingeravtrykket dekker per stilling: valgt kort, `n`, σ (9 desimaler), margin (9 desimaler)
**og hver enkelt verdi for hver kandidat i hver enkelt verden** — **ca. 28 320 flyttall**
som alle er bit-like. 48 verdener (ikke 16), fordi utvelgelsen er en funksjon AV K. Kjørt i
to ULIKE arbeidskopier, så ingen redigering kan ha blandet de to.

**Og «av er av» står på et bein til:** `~pulje=blokk` — samme nye kodesti, utvelgelse
blokk for blokk — er bit-identisk med i.i.d. i **0 av 240** sjekkede repetisjoner (§9) og
i alle 30 stillingene i prøve 5. Det beviser at den felles stien bygger og vekter puljen
tegn for tegn som `trekkVerdenBelief`, så alt som skiller i `felles` kommer fra
UTVELGELSEN.

## 9. FORVENTNINGSRETTHET OG MANGFOLD — og et funn som snur forventningen

`examples/pulje-forventning.ts`, 12 stillinger × 120 repetisjoner × K=48 × k=32, null
utspillinger, 50 s. Rådata: `pulje-forventning.log`.

### 9a. Strukturen holder — parringen er eksakt

| kontroll | resultat |
|---|---|
| repetisjoner med ULIKT antall `rng()`-kall | **0** |
| repetisjoner med ULIKT antall verdener | **0** |
| `blokk` ULIK i.i.d. | **0 av 240** |

Kandidatpuljene er bit-identiske mellom armene. Alt som skiller er utvelgelsen.

### 9b. Fordelingen flyttet seg MOT målet — men mindre enn jeg spådde

| | RMS \|marginal − p̂\| i.i.d. | felles | forhold |
|---|---|---|---|
| alle celler (1297) | 0,09458 | **0,07893** | **0,83** |
| informative (1149) | 0,09860 | **0,08358** | **0,85** |

Retningen er som forutsagt: felles pulje ligger nærmere målfordelingen `p ∝ q·w`, altså er
SIR-skjevhet **fjernet** (M gikk fra 32 til 1536), ikke innført. Men den
forhåndsregistrerte spådommen var **0,4–0,8 ×**, og målt ble det **0,83–0,85** — utenfor,
og i den svake enden. Det står her fordi spådommen står på disk.

### 9c. MEN SPREDNINGEN DOBLET SEG — og det peker motsatt vei av hypotesen

| | SD over repetisjoner, i.i.d. | felles |
|---|---|---|
| alle celler | 0,05903 | **0,13798** |
| informative | 0,06567 | **0,15461** |

**Dette er det viktigste tallet i notatet så langt, og det var ikke ventet.** Felles pulje
har lavere SKJEVHET men **2,3× høyere SPREDNING** fra trekning til trekning.

Mekanismen er hel: med 48 uavhengige puljer midles 48 separate «beste i sin pulje» innenfor
ÉN beslutning, og ensemblet er stabilt fra trekning til trekning. Med én felles pulje
avgjøres hele ensemblet av hvilke få kandidater som tilfeldigvis dominerer den ene puljen —
så hele ensemblet svinger sammen.

**Og støygulvet er nettopp et mål på hvor mye argmaks svinger mellom to trekninger.**
Kodelesningen min sa gulvet skulle falle; dette tallet sier det kan STIGE. Jeg måler det
likevel — det er måltallet oppdraget ba om, og spådommen står på disk.

### 9d. Mangfoldet: 48 → 27,4 distinkte

| | distinkte verdener av 48 | største multiplisitet |
|---|---|---|
| i.i.d. | **48,0** | 1 |
| felles | **27,4** | 12,5 i snitt |

Kollaps, men moderat — 27,4 ligger **over** terskelen 24 i den forhåndsregistrerte
beslutningsregelen (regel A), så et fall i gulvet ville ikke bare vært ensemblekollaps.

### 9e. REFERANSEN ER SVAK I 7 AV 12 STILLINGER, og det er i seg selv et funn

`ref-ESS` per stilling, av 16 384 kandidater:

```
14907 · 66 · 44 · 38 · 8806 · 11994 · 29 · 14 · 25 · 6659 · 6 · 39
```

Snittet er 3552, men **medianen er ~52**. I sju av tolv stillinger har en pulje på 16 384
kandidater et effektivt utvalg under 70 — i én av dem **6**. Trovekten er altså så skarp at
posterioren er konsentrert på en håndfull verdener av 16 384.

Det bekrefter `troledd.md` §4 (log-spenn 19,13; 24,75 i forsvar) på et mye større utvalg, og
det har to konsekvenser:

1. **Tallene i 9b er svakere enn de ser ut.** Der ESS er 6–40 er `p̂` selv dominert av noen
   få kandidater, så «avstand til p̂» er en støyete størrelse. Retningen er konsistent på
   tvers av alle 12 stillinger, men forholdet 0,83 skal ikke leses med tre siffer.
2. **Det forklarer 9c og 9d mekanisk.** Med ESS ~50 i en pulje på 16 384 er ESS innenfor en
   pulje på 1536 av størrelsesorden 5. En rist over 48 celler lagt på en fordeling med
   effektivt ~5 bærere MÅ gi både multiplisitet og store svingninger mellom trekninger.

## 10. KANDIDATSPEKEN BYGGER, OG FELTANTALLET ER UENDRET

```
felt A: 17 | felt P: 17 | begge bygger: true
```

Kandidaten er grunnlinja med **ett** felt lagt til, `~pulje=felles`, rett etter
`~mlbu=`-stien. Begge har **17 kolonfelt**, invarianten `sokfokus.md` §7 hviler på —
`~pulje=felles` inneholder ikke kolon, så ingen feltteller flytter seg.

**En kontroll som så feil ut og ikke er det:** `utenSøk(A) === utenSøk(P)` er `false`.
Det er fordi `utenSøk` på den HELE `okt:`-pakkede speken er en **identitet** — den river
gjennom `eks:`, men ikke gjennom `okt:` — så begge sider returnerer seg selv, og de to
strengene er per definisjon ulike. Pre-eksisterende oppførsel, dokumentert av
`strata.md` §5, og ikke noe jeg har rørt. Det som betyr noe for knotten er strippingen
INNE i `sik:`, der rollout-motparten bygges av `utenSøk(innSpek)` — og den er låst av
prøve 4: `utenSøk("sik:alle:0.5:48k32e3LMD~pulje=felles:<base>") === <base>`.

## 11. STØYGULVSMÅLINGEN ER STARTET

`bash verktoy/pulje-kjor.sh 4 3` — 3 arbeidere × 4 kamper × 3 runder = 12 kamper
(= 12 klynger), samme form som bandit og strata brukte, så tallet er direkte
sammenliknbart med de 43,0 % / 43,8 %.

**Vakten er skrevet om før start.** Den opprinnelige (portert fra strata) brukte `wmic`
og `tasklist`. Begge sviktet på denne maskinen i dag: `wmic` er fjernet i nyere
Windows 11, og en `tasklist | grep -c`-telling rapporterte **0 mens 28 node-prosesser
faktisk kjørte**. En vakt som svarer «ingen kjører» når det kjører 28 er verre enn ingen
vakt — den er falsk trygghet foran nøyaktig den dobbeltstarten den skal stanse
(`bandit.md`, «HENDELSE»). Den bruker nå `Get-CimInstance`, som er verifisert å virke
her, og den **nekter å starte hvis vakten ikke svarer i det hele tatt**: «vet ikke» må
behandles som «kanskje» når prisen er en lydløst doblet måling.

### 11a. Helsesjekk rett etter start (IKKE et resultat)

`examples/pulje.ts` hadde aldri kjørt ende-til-ende før denne starten, så en
oppstartskrasj ville vært lydløs i førti minutter. Sjekket eksplisitt:

- **nøyaktig 3** arbeidere lever (ingen dobbeltstart),
- ingen `Error`/stacktrace i noen av de tre loggene,
- w0 skriver framdrift: 25 beslutninger på 112 s (≈ 4,5 s per beslutning, fire armer
  pluss mangfoldstellingen, på en maskin som samtidig kjører iterasjon 12).

Første framdriftslinje leser `gulv iid 48,0 % mot pulje 56,0 %`. **Det er n = 25 og skal
ikke leses som noe som helst** — binomisk SE alene er ~10 pp der. Den står her bare fordi
loggen skal være fortløpende, og fordi retningen er den §9c advarte om: felles pulje har
2,3× høyere spredning fra trekning til trekning, og støygulvet måler nettopp den
spredningen. Dommen felles i `pulje-sum.ts` på full n, klynget på kamp.

---

# 12. RESULTATET: STØYGULVET STEG. Hypotesen er forkastet.

1320 beslutninger, 12 kamper (= 12 klynger), 3 arbeidere à 4 kamper × 3 runder, ~35 min.
Rådata `D:\amb-pulje\analyse\pulje-w{0,1,2}.jsonl`, sammendrag `pulje-sammendrag.txt`.
Duplikatkontroll: **0** dupliserte rader. Arbeiderne hadde tre distinkte frø og merker,
verifisert fra de faktiske kommandolinjene mens de kjørte.

## 12.1 Hovedtallet — det forhåndsregistrerte

| | n | I.I.D. (i dag) | FELLES PULJE | **PARRET PULJE − IID** |
|---|---|---|---|---|
| **ALLE** | 1320 | 43,0 % ± 1,4 | 45,0 % ± 1,4 | **+2,0 ± 1,0 pp (z = +2,05)** |

**Riggen reproduserer det kjente tallet på desimalen:** 43,0 % mot `bandit.md` sine
43,0 % ± 1,4 og `troledd.md` sine 43,8 % ± 1,0 — på andre giv og andre kamper.
Grunnlinja er ikke feilmålt her.

**Spådommen min var −8 til −20 pp. Målt ble +2,0 pp.** Ikke bare utenfor intervallet, men
med **motsatt fortegn**, og marginalt signifikant i feil retning. Det er femte grep på rad
som ikke senker gulvet, og det første som gjør det målbart **verre**.

Og det gikk verst nøyaktig der det betyr noe:

| gruppe | n | iid | pulje | parret |
|---|---|---|---|---|
| **stikk 0–3** | 461 | 60,5 % | 66,6 % | **+6,1 ± 1,5 pp (z = 4,06)** |
| stikk 4–7 | 491 | 52,1 % | 53,6 % | +1,4 ± 2,4 pp |
| stikk 8+ | 368 | 8,7 % | 6,5 % | −2,2 ± 1,8 pp |

Stikk 0–3 er den ene undergruppa som var **nevnt på forhånd** (`dekomp.md` legger +0,49 av
K1s +1,24 der). Den reproduserer også bandit sitt 60,5 % eksakt, og der er forverringen
størst og klarest. De åtte andre undergruppene er ikke funn.

## 12.2 HVORFOR — og forventningssonden hadde sagt det på forhånd

Dette er ikke et mysterium; §9c forutsa det før målingen startet:

| | i.i.d. | felles | |
|---|---|---|---|
| RMS skjevhet mot målet `p` | 0,0946 | **0,0789** | felles er **nærmere** målet |
| SD over trekninger | 0,0590 | **0,1380** | felles svinger **2,3×** mer |

**Felles pulje har lavere skjevhet og mye høyere varians.** Støygulvet måler ikke
skjevhet — det måler nøyaktig hvor mye argmaks svinger mellom to trekninger. Vi byttet
altså den størrelsen gulvet IKKE måler mot den det MÅLER, og fikk regningen.

Mekanismen, målt:

| | distinkte verdener av 48 | parret |
|---|---|---|
| i.i.d. | **45,3** | |
| felles | **25,5** | **−19,8 ± 0,55 (z = −35,9)** |

I **50,2 %** av beslutningene har felles pulje halvparten eller færre distinkte verdener.
Med 48 uavhengige puljer midles 48 separate «beste i sin pulje» innenfor ÉN beslutning, og
ensemblet er stabilt fra trekning til trekning. Med én felles pulje avgjøres hele ensemblet
av hvilke få kandidater som tilfeldigvis dominerer den ene puljen — så alle 48 svinger
SAMMEN. Referanse-ESS på ~52 av 16 384 (§9e) sier hvor lite som skal til.

**De 48 uavhengige puljene var ikke en feil. De var en variansreduksjon** — 48 uavhengige
trekninger midlet innenfor hver beslutning. Å slå dem sammen fjernet nettopp den midlingen.
Det er det motsatte av premisset oppdraget hviler på, og det er nå målt.

## 12.3 ANGER MOT EKSAKT FASIT — også verre, og dette er det avgjørende

166 skillende stillinger (569 flate forkastet, 585 utenfor fasitvinduet), begge
verdensfrø talt, klynget på kamp:

| mål | iid | pulje | parret pulje − iid |
|---|---|---|---|
| diff | 0,475 | 0,785 | **+0,31 ± 0,13 poeng (z = 2,35)** |
| lag | 0,508 | 0,892 | **+0,38 ± 0,18 poeng (z = 2,08)** |

**Dette er sterkere enn støygulvet.** Gulvet måler bare ustabilitet; angeren måler om
kortet faktisk er dårligere mot en eksakt fasit. Begge peker samme vei, og begge er
signifikante. `bandit.md` sin nullarm hadde anger −0,05 ± 0,11 — altså ekte null. Her er
det ikke null; det er verre. Merk at iid-tallet 0,475 er identisk med bandits 0,475.

## 12.4 Kostnaden — knotten er gratis, og det er den eneste gode nyheten

| | iid | pulje |
|---|---|---|
| verdener per vurdering | 48,00 | 48,00 |
| rader med ULIKT antall verdener | — | **0 av 1320** |
| utspillinger per beslutning | 229,0 | 229,0 |
| rader med ULIKT antall utspillinger | — | **0 av 1320** |
| ms per beslutning | 923 | 925 (**+0,2 %**) |
| parret | | **+1,67 ± 4,64 ms (z = 0,36)** |

«Samme antall verdener og utspillinger» er **bevist rad for rad**, ikke hevdet. Sorteringen
av 1536 elementer og binærsøket er ikke målbare ved siden av 229 utspillinger.
**Oppdragets antakelse om at trekningen ville bli dyrere var feil**, og det er nå målt:
begge armene trekker og vekter nøyaktig 1536 kandidater.

## 12.5 Bivirkningen jeg forhåndsregistrerte, og som slo til

| | iid | pulje |
|---|---|---|
| σ i snitt | 2,453 | **3,049** |
| porten (σ ≥ 0,5) åpner | 51,0 % | 52,4 % |
| støygulv for kortet som SPILLES | 32,3 % ± 1,3 | 37,0 % ± 1,3 (**+4,6 ± 1,4 pp**) |

σ steg som spådd (færre distinkte verdener → mindre SE på marginen). Portåpningen flyttet
seg bare +1,4 pp, altså **under** det forhåndsregistrerte +3 til +15 pp — porten er ikke
den store historien her. Men det SPILTE kortet ble 4,6 pp mer ustabilt, altså verre enn
argmaks alene.

## 12.6 Knotten biter

Ulikt kort på samme frø: **39,8 %** over alle rader, **46,9 %** med ≥ 3 lovlige kort.
Knotten er ikke død i strengen — den er levende, og den gjør skade.

## 12.7 Den forhåndsregistrerte beslutningsregelen

`pulje-spaadom.txt` slo fast: faller gulvet ikke ≥ 2 SE, er hypotesen forkastet og **ingen
K1-spek leveres**. Gulvet falt ikke — det steg, +2,0 ± 1,0 pp. Mangfoldstallet (25,5) ville
plassert oss i regel A, men regel A forutsetter at gulvet FALLER. **Regelen er entydig:
ingen K1-spek.**

## 13. PRØVENE FØR OG ETTER — null nye røde

| | tester | pass | fail | skipped |
|---|---|---|---|---|
| **før** (`092cd00`, egen arbeidskopi `D:\amb-pulje-foer`) | 1028 | 1018 | **4** | 6 |
| **etter** (`3820e72`, `D:\amb-pulje`) | 1037 | 1027 | **4** | 6 |

**+9 tester og +9 pass** — nøyaktig `test/pulje-trekk.test.ts`, og alle ni grønne.
Feilmengden er **identisk før og etter, navn for navn** (`comm` i begge retninger: tom):

1. `«web/dist/app.js» er ikke bygd fra en eldre «web/adamskjede.ts»`
2. `«web/dist/worker.js» er ikke bygd fra en eldre «web/adamskjede.ts»`
3. `tapet: med mlb-tro-signal.bin (776) er maskert tap ≤ umaskert …`
4. `SKRALLE: ingen NYE haandbygde speker i examples/ og test/`

**SKRALLE-lista er 25 filer i BEGGE kjøringene, byte-identisk**, og **ingen av dem er
mine** — mine seks nye filer importerer `ADAMS_MAALT` i stedet for å hardkode vektstier.

Arbeidskopien har ingen endret SPORET kildefil (`git diff HEAD -- src/ examples/ test/
verktoy/` er tom); det som står igjen er de tre uspora `analyse/pulje-w*.jsonl` og
`analyse/k5-kontekst-test.txt`, som prøvesuiten selv skriver om — den er også endret i
`D:\amb-pulje-foer`, der jeg bare har kjørt suiten. Ingen av dem er committet.

`krav-2026-09-11` står urørt på `092cd00` og er utsjekket **ingen steder**. Alle de
fredede arbeidskopiene har samme HEAD som da jeg startet.

---

# 14. HVA JEG LEVERER, OG HVA JEG IKKE LEVERER

1. **Knotten:** `~pulje=felles` (+ `~pulje=blokk` som kontroll). «Av er av» verifisert på
   to uavhengige bein: tom `diff` over 120 stillinger × 48 verdener på tvers av
   commitene i to arbeidskopier, og `blokk` bit-identisk med av i 0 av 240 repetisjoner. ✔
2. **Forventningsretthet:** fordelingen står **ikke** stille — den kan ikke det når risten
   skal ha en felles akse — men den flytter seg MOT målet (RMS 0,0946 → 0,0789). ✔ målt,
   ikke påstått
3. **Kostnaden:** utspillinger og verdener identiske i **0 av 1320** avvikende rader;
   veggtid **+0,2 %** (+1,67 ± 4,64 ms, z = 0,36). Knotten er gratis. ✔
4. **Støygulvet med og uten, parret:** **+2,0 ± 1,0 pp. DET STEG.** ✔ (målt, ikke ønsket)
5. **Anger mot fasit:** **+0,31 ± 0,13 poeng (diff)**, **+0,38 ± 0,18 (lag)** — også verre,
   og dette er det sterkeste beviset, fordi det måler kvalitet og ikke bare ustabilitet. ✔
6. **Spek til K1-måling: LEVERES IKKE.** Den forhåndsregistrerte regelen var entydig, og
   den er fulgt. Speken er verifisert byggbar (17 kolonfelt, `~pulje=felles` etter
   `~mlbu=`-stien) og står i §10 hvis noen vil se den — men **min anbefaling er å ikke
   måle den.** To armer à 2,5 t på en knott som er målt verre på både gulv og anger ville
   vært en dyr måte å bekrefte et nei på.

Knotten blir stående i grenen: den er av som standard, bevist av-når-av, gratis, og gjør
det mulig å prøve en mellomform senere uten å bygge alt på nytt.

## 15. DEN NYE INFORMASJONEN, OG DEN ER VERDT MER ENN ET JA

Fire grep hadde målt null. Dette er det femte, og det er det første som måler **verre** —
og det forteller noe de fire nullene ikke kunne:

> **De 48 uavhengige kandidatpuljene er ikke en svakhet. De er en variansreduksjon.**

Hver beslutning midler i dag 48 uavhengige trekninger, og den midlingen er selve grunnen
til at argmaks er så stabilt som 43 %. Å slå puljene sammen fjernet midlingen: skjevheten
ble mindre, men spredningen 2,3× større, og gulvet måler spredningen.

`strata.md` §4c pekte på pooling som den ene av to gjenværende veier. **Den veien er nå
målt, og den er stengt.** Det står igjen ett forslag fra det notatet som IKKE er prøvd:
stratifiser på en størrelse som DELES på tvers av puljene — hvor et bestemt kort ligger,
eller trumffordelingen — i stedet for på vektrangen. Den beholder de 48 uavhengige
puljene, og dermed midlingen, og gir likevel risten en felles akse. Det er den eneste av
de opprinnelige veiene som fortsatt står.

En mellomform finnes også, og jeg har **ikke** målt den: del de 48 slottene i grupper på
2–4 med hver sin felles pulje, eller legg et tak på multiplisiteten. Det ville byttet litt
skjevhet mot litt varians i stedet for å gi opp all midlingen på én gang. Tallene her sier
hvor kurven ligger (48 uavhengige: gulv 43,0 %, 45,3 distinkte · 1 felles: 45,0 %, 25,5
distinkte), men to punkter er ikke en kurve, og jeg vil ikke late som de er det.

**Og ett tall til, som gjelder uansett hvem som jobber videre:** referansepuljen på 16 384
kandidater har **median ESS ~52** (§9e). Troens posterior sitter på en håndfull verdener
av seksten tusen. Enhver plan som forutsetter at 32 eller 48 kandidater dekker
fordelingen, arbeider mot det tallet.
