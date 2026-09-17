# Strata: å TREKKE verdenene bedre, ikke å bruke budsjettet bedre

Gren `strata-2026-09-14` i **`D:\amb-strata`** (fra `krav-2026-09-11` @ 092cd00).
14. sep, maks 3 kjerner. **BYGGEOPPDRAG — ingen K1-måling startet.**

## Logg (fortløpende)

- **Arbeidskopi opprettet uten å røre eierens gren.** `git worktree add -b strata-2026-09-14
  D:/amb-strata krav-2026-09-11` — altså med `-b`, så eierens `krav-2026-09-11` aldri ble
  sjekket ut noe sted. (Bandit-agenten sjekket den ut direkte og måtte rette etterpå;
  `-b` gjør feilen umulig.) `krav-2026-09-11` står urørt på `092cd00`.
- Oppsett: `node_modules` som junction til `D:\amb-seier\node_modules` (samme som
  `D:\amb-krav` gjør), og `e1-modell\*` kopiert fra `D:\amb-krav\e1-modell`
  (`tro-8.bin`, `vrak-8.bin`, `etterlyst-8.bin`, `budq-8.bin`, `kort-8.bin` på plass).
  Modellfilene er `.gitignore`-t og følger ikke med utsjekken — bandit-agenten målte en
  grunnlinje uten dem én gang og måtte kaste den.
- Lest: `bandit.md`, `troledd.md`, `dekomp.md`, `sokfokus.md`.

### Kodelesning: HVOR i.i.d.-trekket faktisk skjer

Kjeden er `vurderPar` (`src/moe2/sdpar.ts:268`) → `trekkVerdener`
(`src/moe2/sdkort.ts:347`) → `trekkVerdenBelief` (`src/solver/sampler.ts:434`).

**Strukturen er ikke det oppdraget antok, og det endrer hva som er riktig kur.**
Oppdraget beskriver «48 uavhengige trekk fra vektfordelingen» over ett kandidatsett.
Koden gjør noe annet:

```
trekkVerdener:      for v = 0..47:  w = trekkVerdenBelief(...)      ← 48 SLOTTER
trekkVerdenBelief:    for i = 0..31:  utvalg[i] = trekkVerden(...)  ← EGEN pool på 32
                      logW = budW + trovekt + vrakvekt
                      r = rng() * Σ exp(logW − maks)                ← ÉN kategorisk trekning
                      returner den kandidaten r faller på
```

Hver av de 48 verdenene har altså sin **egen ferske pool på 32 kandidater**, og velges
med **ett** `rng()`-kall fra den poolen. Det finnes ingen felles kumulativ vektfordeling
over ett kandidatsett å legge en rist over — den finnes 48 ganger, uavhengig.

Det har to konsekvenser:

1. **Den naive «pool alle 48×32 = 1536 kandidater og systematisk-resample 48»
   er FEIL her.** Den ville også byttet SIR-approksimasjonen fra M=32 til M=1536, altså
   endret selve fordelingen (mindre SIR-skjevhet), ikke bare utvalget. Det er to endringer
   i én arm — nøyaktig fella `bandit.md` §3 beskriver, der `~fordel=halv` utilsiktet også
   løsnet σ-porten. Kravet «stratifisering endrer utvalget, ikke fordelingen» utelukker den.
2. **Det finnes en variant som er eksakt forventningsrett for NØYAKTIG dagens fordeling.**
   De 48 slottene er utbyttbare: hver trekker 32 kandidater i.i.d. fra samme forslag med
   samme vekt. Sorterer man hver pool etter vekt og bruker invers-CDF med
   `u_v ∈ [v/48, (v+1)/48)` i stedet for `u_v ~ U(0,1)`, er

       E[(1/48) Σ_v f(W_v)] = ∫₀¹ E_pool[f(W(pool,u))] du = E_iid[f(W)]

   fordi poolene er identisk fordelt over v. Utvalget blir stratifisert på
   **vektkvantil** — garantert én verden fra hvert bånd av «hvor typisk» verdenen er —
   mens fordelingen står helt stille. Sorteringen er gratis og eksakt: en kategorisk
   fordeling er permutasjonsinvariant, så invers-CDF over sortert pool har samme
   marginalfordeling som over usortert.

**Og den er RNG-nøytral.** I dag: 32 `trekkVerden` + **1** `rng()` til utvelgelsen.
Med strata: 32 `trekkVerden` + **1** `rng()` til `u_v`. Samme antall kall, samme
rekkefølge. Kandidatpoolene blir derfor **bit-identiske** med i.i.d.-armen på samme frø,
og bare utvelgelsen skiller. Det gjør både «av er av» og selve målingen skarpere enn
den kunne blitt med et grep som forskyver strømmen.

Hvorfor dette biter her: `troledd.md` §4 målte effektivt utvalg **5,7 av 32** (ESS/K
0,179) — vekten er skarp, så hvilken vektkvantil den ene valgte kandidaten havner i
varierer voldsomt og dominerer hvilken verden man får. Det er den variasjonen strata
fjerner.

**Valg av variant: stratifisert (egen `U_v` per slott), ikke systematisk (én delt `U`).**
Systematisk resampling vinner når det finnes én felles sortert populasjon å legge risten
over. Her er poolene uavhengige på tvers av slott, så en delt forskyvning har ingen felles
struktur å justere mot — den kjøper ingenting, og systematisk resampling er ikke
konsistent generelt. Stratifisert er alltid ≤ i.i.d. i varians og trivielt forventningsrett.

### Valget mellom oppdragets to alternativer

**Grep 1 (stratifisert utvalg) bygges, ikke grep 2 (antitetiske par).** Begrunnelse:
kandidatvekting og invers-CDF finnes alt i koden, så grep 1 er tre linjer på selve
utvelgelsen og kan gjøres **eksakt** forventningsrett med et bevis på to linjer.
Antitetiske par krever en definisjon av «speilvending» i et rom der en verden er en
fordeling av 52 kort på fire hender + vrak under renons-/følgeplikt-skranker: å bytte to
skjulte hender mellom seter gir som regel en **ulovlig** verden (setene har ulikt antall
kort igjen, og observatørens egne kort er låst), og å invertere uniformtallene før
inversjonssamplingen treffer `trekkVerden`s sekvensielle plassering kort for kort, der
`1−u` ikke er noen meningsfull speiling. Grep 2 er altså ikke gratis her, og verre: det
er ikke opplagt forventningsrett. Oppdraget helte mot 1; kodelesningen gjør valget entydig.

### Bygget (commit `ef0ec33`)

Fem filer, og ikke én mer:

| fil | endring |
|---|---|
| `src/solver/sampler.ts` | `strata?: [slott, slotter]` på `trekkVerdenBelief`; ny gren med sortert pool + rist |
| `src/moe2/sdkort.ts` | `trekk?: "strata"` på `trekkVerdener`; sender `[v, antall]` som celle |
| `src/moe2/sdpar.ts` | `ParOpts.trekk`, ført videre til `trekkVerdener` |
| `src/moe2/sikkerorakel.ts` | `SikkerOpts.trekk` + offentlig `Sikkerorakel.trekk` (så prøvene kan bevise kobling) |
| `src/moe2/agentspek.ts` | `~trekk=strata` som ny art i `~`-løkka; kaster på alt annet |

Nøkkelen finnes ikke i opsjonsobjektet uten feltet — «av er av» strukturelt, samme
form som `~stikk=` og `~fordel=` bruker.

**Typesjekk** (`npx tsc -p tsconfig.json --noEmit`, typene fra `D:\amb-seier\node_modules`):
**én** feil i hele repoet, `src/mlb/fargebytte.ts(60,1): 'kortIndeks' er deklarert men aldri
brukt` — nøyaktig den pre-eksisterende feilen `sokfokus.md` §5 og `bandit.md` også fant.
**De fem endrede filene er rene.**

### HENDELSE: den første grunnlinjeprøven ble forkastet

Jeg startet `npm test` som grunnlinje og begynte å redigere kildene mens den kjørte.
`node --test` importerer testfilene fortløpende, så filer som ble lastet ETTER den første
redigeringen leste de nye kildene: en «før»-måling delvis tatt på «etter»-koden. Den ville
ikke krasjet — den ville bare vært litt gal, og forskjellen ville blitt tilskrevet knotten.
Kjøringen er kastet.

Grunnlinja er i stedet tatt i en **egen arbeidskopi**, `D:\amb-strata-foer`, sjekket ut på
`092cd00` (detached), med egen `node_modules`-junction og egne modellfiler. Da kan ingen
redigering i `D:\amb-strata` nå den, uansett hva jeg gjør mens den kjører. Den koster en
utsjekk til på D:, og det er en billig pris for at før og etter ikke kan blande seg.

### Måleriggen (portert fra bandit, egne filnavn)

- `examples/strata.ts` — fire armer: `I1`/`I2` i.i.d. på de to verdensfrøene, `S1`/`S2`
  strata på de samme to. STØYGULV(iid) = I1≠I2, STØYGULV(strata) = S1≠S2, målt over de
  SAMME to trekningene. Skriver `analyse/strata-w*.jsonl` fra prosessen selv.
- `examples/strata-sum.ts` — klynget SE på kamp, `SE(d̄) = √(Σ_c (Σ_{i∈c}(d_i − d̄))²)/n`,
  ikke delt på √n en gang til. **Egen duplikatkontroll** som avviser og avslutter hvis to
  arbeidersett har skrevet til de samme filene — feilen bandit-kjøringen gikk i.
- `examples/strata-identitet.ts` — fingeravtrykk for «av er av» PÅ TVERS av commitene, med
  per-verden-verdier, σ og margin på 9 desimaler. **48 verdener, ikke 16**: stratifiseringen
  er en funksjon av K (cellene er 1/K brede), så et fingeravtrykk på et annet K ville latt en
  feil som bare slår inn ved det virkelige K slippe gjennom.
- `examples/strata-forventning.ts` — forventningsretthet og variansreduksjon på troens egen
  marginal `M[kort][sete]`, uten en eneste utspilling. Sjekker også RNG-nøytraliteten med en
  teller rundt `rng`.
- `verktoy/strata-kjor.sh` — tre arbeidere, egne kamper per arbeider, og en **vakt som nekter
  å starte** hvis det alt kjører en `examples/strata.ts`-prosess.
- `test/strata-trekk.test.ts` — åtte prøver.

---

## 1. «AV ER AV» — BEVIST PÅ TVERS AV KODEENDRINGEN

En prøve inne i grenen kan bare vise at knotten AV oppfører seg som knotten AV. Den kan
ikke vise at den oppfører seg som **koden før knotten fantes**, og det er det «av er av»
betyr. `examples/strata-identitet.ts` er derfor kjørt på BEGGE commitene og sammenliknet
med `diff`:

| | commit | arbeidskopi | stillinger | verdener | fil |
|---|---|---|---|---|---|
| FØR | `092cd00` (knotten finnes ikke i koden) | `D:\amb-strata-foer` | 120 | 48 | `strata-id-foer.txt` |
| ETTER | `ef0ec33` (knotten i koden, feltet ikke i kallet) | `D:\amb-strata` | 120 | 48 | `strata-id-etter.txt` |

**`diff` ER TOM** — `strata-id-diff.txt`, 0 linjer, exit 0.

Fingeravtrykket dekker, per stilling: valgt kort, `n`, σ (9 desimaler), margin
(9 desimaler) **og hver enkelt verdi for hver kandidat i hver enkelt verden**. Det siste
er ikke pynt her: en trekkeendring virker nettopp ved å bytte ut verdener, så den ville
flyttet per-verden-verdiene lenge før den snudde en argmaks. Bare kortet ville sluppet en
slik endring gjennom. 120 stillinger × ~4 kandidater × 48 verdener er i størrelsesorden
23 000 flyttall som alle er bit-like.

To ting er verdt å merke seg om oppsettet:

- **48 verdener, ikke 16.** Stratifiseringen er en funksjon AV K — cellene er 1/K brede —
  så et fingeravtrykk tatt ved et annet K enn det speken bruker ville hatt et hull.
- **Kjørt i to ULIKE arbeidskopier**, ikke ved å tilbakestille kildene i samme mappe.
  Da kan ingen redigering, ingen halvskrevet fil og ingen glemt `git checkout` blande de to.

## 2. Grunnlinje av prøvene FØR endringen

`npm test` på `092cd00` i `D:\amb-strata-foer`, med alle modellfilene på plass:

```
tests 1028 | pass 1018 | fail 4 | skipped 6 | duration 97,3 s
```

Det er **nøyaktig** de samme fire tallene `bandit.md` rapporterte på samme commit, målt
uavhengig i en annen arbeidskopi. De fire røde er `web/dist/app.js`- og
`worker.js`-byggeartefaktene, `mlb-tro-signal.bin`-tapsprøven og SKRALLE i
`spek-en-kilde` — alle pre-eksisterende, og ingen av dem rører `sdpar.ts`,
`sikkerorakel.ts`, `sdkort.ts`, `solver/sampler.ts` eller `agentspek.ts` sin `sik:`-gren.

SKRALLE lister 25 pre-eksisterende filer. Mønsteret den ser etter er `vrakrang\.bin|d7alle\.bin`
(`test/spek-en-kilde.test.ts:57`); mine nye filer bruker `e1-modell/*-8.bin` og importerer
`ADAMS_MAALT` i prøvefila, så de gir skrallen ingen ny rad å klage på.

## 3. DE ÅTTE PRØVENE — alle grønne (6,2 s)

`test/strata-trekk.test.ts`, `node --test`: **tests 8 | pass 8 | fail 0**.

1. **AV ER AV STRUKTURELT** — uten feltet er `Sikkerorakel.trekk` `null`, ikke «iid».
   Nøkkelen finnes ikke i opsjonsobjektet i det hele tatt.
2. **INGEN KOLLISJON** — `48k32e3LD~trekk=strata` gir fortsatt V=48, k=32, e=3, L og D.
   `~lik=` og `~trekk=` kommuterer: begge rekkefølger gir samme resultat på alle fire feltene.
3. **UGYLDIG KASTER HØYLYTT** — `""`, `iid`, `Strata`, `strata2`, `sys`, `stratifisert`,
   `1` og `systematic` kaster alle. Ukjent art kaster fortsatt, og meldingen nevner den nye formen.
4. **`utenSøk` URØRT** — strippes til basen, og feltantallet er tegn for tegn uendret
   (`~trekk=strata` inneholder ikke kolon).
5. **SAMME ANTALL VERDENER OG UTSPILLINGER** — over 30 stillinger er `n` og antall kandidater
   identiske, altså er `n × kandidater` identisk. Det ER utspillingene: `vurderPar` går
   verden-for-verden × kandidat-for-kandidat, så produktet er ikke et anslag.
6. **RNG-NØYTRAL** — en teller rundt `rng` viser NØYAKTIG like mange kall i begge modusene
   over 20 stillinger. Det er den harde formen av «samme budsjett»: ikke bare like mange
   utspillinger, men like mange trekninger og like mange tilfeldige tall.
7. **KNOTTEN BITER** — med ≥ 3 lovlige kort og samme frø velger strata noen ganger et annet
   kort. Uten denne kunne knotten vært død i strengen, som `12k16d4` var.
8. **FORVENTNINGSRETT** — over 120 repetisjoner på tre stillinger står troens marginal
   `M[kort][sete]` stille (snitt |Δ| under MC-nivå), mens SD over repetisjoner er lavere
   for strata. Begge halvdelene i én prøve: fordelingen uendret, utvalget strammere.

---

## 4. FORVENTNINGSRETTHET: BESTÅTT. VARIANSREDUKSJON: NESTEN INGEN.

`examples/strata-forventning.ts`, 12 stillinger × 200 repetisjoner × K=48 × 32 kandidater,
null utspillinger. Rådata/logg: `strata-forventning.log`.

### 4a. RNG-nøytraliteten holder — parringen er eksakt

| kontroll | resultat |
|---|---|
| repetisjoner der modusene brukte ULIKT antall `rng()`-kall | **0** |
| repetisjoner der modusene ga ULIKT antall verdener | **0** |

Kandidatpoolene er altså bit-identiske mellom modusene på samme frø. Alt som skiller er
hvilken kandidat som plukkes ut. Det gjør differansen under til en ekte parret differanse.

### 4b. Troen er fortsatt riktig representert ✔

`M[kort][sete] = P(kortet ligger hos setet)`, parret per repetisjon:

| | celler | snitt skjevhet | snitt \|skjevhet\| | snitt MC-SE | \|z\| > 2 | \|z\| > 3 |
|---|---|---|---|---|---|---|
| alle | 1297 | −0,000000 | 0,00330 | 0,00437 | 2,7 % | **0,0 %** |
| informative | 1172 | −0,000000 | 0,00365 | 0,00484 | 3,0 % | **0,0 %** |

Skjevheten ligger **under** MC-støyen, andelen `|z| > 2` er 2,7–3,0 % mot de ~4,6 % rene
tilfeldigheter gir, og **ingen** av 1297 celler er over 3 SE. Kravet «stratifisering endrer
utvalget, ikke fordelingen» er innfridd, målt celle for celle og ikke bare på ett snitt.
Beviset i koden og målingen er enige.

### 4c. MEN: variansforholdet er 0,997

| | SD i.i.d. | SD strata | variansforhold |
|---|---|---|---|
| alle celler | 0,05899 | 0,05866 | **0,9970** |
| informative | 0,06528 | 0,06491 | **0,9966** |

**0,3 % variansreduksjon.** Ikke null, men så nær null at det ikke kan bære et støygulv
som skal falle merkbart.

**HVORFOR, og dette er den nye informasjonen.** Stratifiseringen legger risten over
*vektkvantilen innenfor hver pool*. Den fjerner bare den delen av variansen som
u-koordinaten FORKLARER. Og fordi de 48 poolene er **uavhengige** — hver med sine egne 32
kandidatverdener — er «rang 0,9 i pool A» og «rang 0,9 i pool B» to helt urelaterte
verdener. u indekserer altså ikke noe felles på tvers av slottene, og da er det nesten
ingenting å stratifisere PÅ. Klumpingen oppdraget beskriver er ekte, men den sitter ikke i
u; den sitter i at hver pool bare har 32 forslag å velge mellom.

Det følger at det finnes nøyaktig to veier videre, og begge er utenfor denne knotten:

1. **Stratifiser på en STØRRELSE SOM DELES på tvers av poolene** — f.eks. hvor et bestemt
   kort ligger, eller trumffordelingen — i stedet for på vektrangen. Da har risten en akse
   som betyr det samme i hvert slott.
2. **Pool kandidatene** (48×32 = 1536 i ett sett, systematisk resampling av 48). Det ville
   virke, men det bytter samtidig SIR-approksimasjonen fra M=32 til M=1536 og endrer altså
   fordelingen. To endringer i én arm, og dermed utenfor dette oppdragets krav.

### 4d. FORHÅNDSREGISTRERT PREDIKSJON, skrevet FØR støygulvsmålingen startet

Med 0,3 % variansreduksjon på selve utvalget **venter jeg at støygulvet ikke faller
målbart**: anslagsvis 0 til −1 pp, altså innenfor den ~1,1 pp SE-en bandit-riggen har på
en parret differanse av denne størrelsen. Jeg måler den likevel, av to grunner: den er
måltallet oppdraget ba om, og dette prosjektet har allerede sett minst én
kodelesnings-basert spådom om samplingen bli forkastet av tallene («vekten er nesten flat»,
`troledd.md` §4). Prediksjonen står her på disk så den ikke kan justeres etterpå.

## 5. SPEKEN BYGGER, OG FELTANTALLET ER UENDRET

Kontroll av kandidatspeken før den eventuelt køes (`lagIndre` + `utenSøk`, verifisert):

```
felt A: 17 | felt S: 17
begge bygger: true
```

Kandidaten er grunnlinja med **ett** felt lagt til, `~trekk=strata`, rett etter `~mlbu=`-stien.
Begge har **17 kolonfelt**, som er invarianten `sokfokus.md` §7 hviler på — `~trekk=strata`
inneholder ikke kolon, så ingen feltteller flytter seg.

**Én presisering, sagt fordi den er lett å overselge:** `utenSøk` på den HELE `okt:`-pakkede
speken er en identitet — den stripper ikke søket der, verken for grunnlinja eller for
kandidaten. Det er pre-eksisterende oppførsel jeg ikke har rørt (`utenSøk` river gjennom
`eks:`, men ikke gjennom `okt:`). Det som betyr noe for denne knotten er strippingen INNE i
`sik:`, der rollout-motparten bygges av `utenSøk(innSpek)` — og `innSpek` er delen etter
verdensfeltet, som `~trekk=` ikke rører. Prøve 4 i `test/strata-trekk.test.ts` låser nettopp
det: `utenSøk("sik:alle:0.5:48k32e3LD~trekk=strata:<base>") === <base>`.

## 6. PRØVENE FØR OG ETTER — null nye røde

| | tester | pass | fail | skipped | varighet |
|---|---|---|---|---|---|
| **før** (`092cd00`, egen arbeidskopi `D:\amb-strata-foer`) | 1028 | 1018 | **4** | 6 | 97 s |
| **etter** (`f2c0e75`, `D:\amb-strata`) | 1036 | 1026 | **4** | 6 | 211 s |

+8 tester og +8 pass — nøyaktig `test/strata-trekk.test.ts`, og alle åtte grønne.

**Feilmengden er identisk før og etter, navn for navn:**

1. `«web/dist/app.js» er ikke bygd fra en eldre «web/adamskjede.ts»`
2. `«web/dist/worker.js» er ikke bygd fra en eldre «web/adamskjede.ts»`
3. `tapet: med mlb-tro-signal.bin (776) er maskert tap ≤ umaskert …`
4. `SKRALLE: ingen NYE haandbygde speker i examples/ og test/`

Ingen ny rød, ingen som forsvant. **SKRALLE-lista er 25 filer i BEGGE kjøringene**, og
**ingen av dem er mine** (søk etter `strata*.ts` i lista: tomt). De fire nye
`examples/strata*.ts` og `test/strata-trekk.test.ts` gir altså skrallen ingen ny rad.

(Etter-kjøringen tok lengre tid fordi forventningssonden delte maskinen med den i starten.
Pass/fail påvirkes ikke av det; bare veggtiden.)

Arbeidskopien er **ren** (`git status` tom), HEAD på `f2c0e75`, og `krav-2026-09-11` står
fortsatt urørt på `092cd00`.

## 7. Støygulvsmålingen er startet

`bash verktoy/strata-kjor.sh 4 3` — 3 arbeidere × 4 kamper × 3 runder = 12 kamper
(= 12 klynger), samme form som bandit brukte. Prosessjekk rett etter start:
**nøyaktig 3** `node`-prosesser med `examples/strata.ts`, altså innenfor 3-kjerners-taket
og ingen dobbeltstart. Den ble køet BAK `npm test` (ventet 78 s) nettopp for ikke å bryte
taket mens prøvene kjørte.

---

# RESULTATET: STØYGULVET FALT IKKE. Hypotesen er forkastet.

1320 beslutninger, 12 kamper (= 12 klynger), 3 arbeidere à 4 kamper × 3 runder, ~30 min.
Rådata `D:\amb-strata\analyse\strata-w{0,1,2}.jsonl`, sammendrag `strata-sammendrag.txt`.
Duplikatkontrollen i `strata-sum.ts` kjørte og slapp gjennom: **0 dupliserte rader**.

## 1. Hovedtallet — det oppdraget ba om

| | n | I.I.D. (i dag) | STRATA | **PARRET STRATA − IID** |
|---|---|---|---|---|
| **ALLE** | 1320 | **43,0 % ± 1,4** | 44,2 % ± 1,4 | **+1,2 ± 1,5 pp (z = 0,81)** |

**Riggen reproduserer det kjente tallet på desimalen:** 43,0 % ± 1,4, nøyaktig `bandit.md`
sitt 43,0 % ± 1,4 og i tråd med `troledd.md` sine 43,8 % ± 1,0. Grunnlinja er ikke feilmålt.

**Gulvet falt ikke. Det peker om noe svakt oppover.** +1,2 ± 1,5 pp er ikke en etablert
forverring — z = 0,81 — men det er utvetydig ikke fallet hypotesen forutsa. SE-en på
1,5 pp betyr at et fall på mer enn ~3 pp ville slått ut. Dette er et ganske stramt null,
ikke en underpowered skuldertrekning.

**Den forhåndsregistrerte prediksjonen fra §4d traff.** Jeg skrev «0 til −1 pp, innenfor
støyen» til disk før målingen startet, på grunnlag av variansforholdet 0,997. Målt:
+1,2 ± 1,5. Sonden i §4 forutsa altså utfallet av en 30-minutters måling på 3 kjerner — og
den kostet ingen utspillinger. Det er verdt å merke seg som metode, uavhengig av dommen.

### Undergrupper (parret, klynget) — INGEN av disse er funn

Ni sammenlikninger uten forhåndsregistrering:

| gruppe | n | iid | strata | parret |
|---|---|---|---|---|
| stikk 0–3 | 461 | 60,5 % | 62,7 % | +2,2 ± 2,5 pp |
| stikk 4–7 | 491 | 52,1 % | 54,2 % | +2,0 ± 2,9 pp |
| stikk 8+ | 368 | 8,7 % | 7,6 % | −1,1 ± 1,5 pp |
| foerer | 378 | 39,2 % | 40,2 % | +1,1 ± 2,3 pp |
| makker | 301 | 44,5 % | 46,5 % | +2,0 ± 3,9 pp |
| forsvar | 641 | 44,5 % | 45,4 % | +0,9 ± 1,8 pp |
| **2 lovlige** | 342 | 17,0 % | 21,1 % | **+4,1 ± 2,0 pp (z = 2,08)** |
| 3–4 lovlige | 417 | 33,1 % | 33,1 % | +0,0 ± 2,9 pp |
| 5+ lovlige | 561 | 66,1 % | 66,5 % | +0,4 ± 1,6 pp |

**Stikk 0–3 — båndet `dekomp.md` legger rommet i — er +2,2 ± 2,5 pp.** Feil vei, ikke
etablert. Der hypotesen skulle bitt hardest, biter den ikke i det hele tatt.

**Om raden «2 lovlige»:** z = 2,08 er den største av ni, og med ni trekninger er minst én
|z| over 2 omtrent hva man skal vente av seg selv (~37 % sjanse). Den er **ikke et funn**, og
jeg ber ikke om at den behandles som ett. Men den er mekanistisk interessant: med to lovlige
kort kollapset `~fordel=halv` til å være *definisjonsmessig* identisk med grunnlinja (bandit
målte 0 av 342 ulike). Strata gjør IKKE det — risten legges over kandidatpoolen, ikke over
kortene, så den er like aktiv ved k = 2 som ved k = 6. At det største utslaget dukker opp
nettopp der, passer med at strata bytter ut hvilke verdener man får uten å gjøre dem mer
representative. Skal noen forfølge den, må det være med en egen forhåndsregistrert prøve.

## 2. Kortet som SPILLES — og her er en positiv forskjell fra bandit

| | iid | strata | parret |
|---|---|---|---|
| støygulv for kortet som spilles (σ ≥ 0,5 anvendt) | 32,3 % ± 1,3 | 32,6 % ± 1,3 | **+0,2 ± 1,4 pp** |

`bandit.md` §3 måtte melde en **bivirkning**: `~fordel=halv` løsnet σ-porten (+5,5 ± 1,3 pp
på det spilte kortet, fordi flere verdener på finaleparet krympet SE-en og blåste opp σ), og
armen ble dermed to endringer i én som ikke kunne tilskrives hver for seg.

**Strata har ikke den bivirkningen.** +0,2 ± 1,4 pp. σ-skalaen står stille, fordi antall
verdener bak marginen er uendret. Knotten er altså ÉN endring, slik en arm skal være — den
endringen virker bare ikke.

## 3. Anger mot eksakt fasit — peker feil vei, ikke etablert

166 skillende stillinger (569 flate forkastet, 585 utenfor fasitvinduet), begge verdensfrø
talt, klynget på kamp:

| mål | iid | strata | parret strata − iid |
|---|---|---|---|
| diff | 0,475 | 0,679 | **+0,20 ± 0,18 poeng (z = 1,13)** |
| lag | 0,508 | 0,699 | **+0,19 ± 0,21 poeng (z = 0,92)** |

Begge er positive = strata er verre, og begge er innenfor støyen. Ingen av dem etablerer en
forverring, men ingen av dem gir grunn til håp heller. `bandit.md` fikk −0,05 ± 0,11 her;
mitt tall er dårligere, og på 12 klynger.

## 4. Kostnaden — den ENE delen som holdt hele veien

| | iid | strata |
|---|---|---|
| verdener per vurdering | 48,00 | 48,00 |
| **rader med ULIKT antall verdener** | — | **0 av 1320** |
| utspillinger per beslutning | 229,0 | 229,0 |
| **rader med ULIKT antall utspillinger** | — | **0 av 1320** |
| ms per beslutning | 818 | 819 (**+0,1 %**, +0,50 ± 2,91 ms) |

**«Samme budsjett» er bevist, ikke hevdet** — rad for rad, i alle 1320. Og strata er
billigere enn halveringen var: bandit måtte melde +1,3 % veggtid fordi den trakk 78,9
verdener i stedet for 48. Strata trekker nøyaktig 48, bruker nøyaktig like mange
`rng()`-kall (prøve 6), og koster +0,1 % — innenfor målestøyen. Variansreduksjonen var
gratis. Den var bare ikke der.

## 5. Knotten er i live

| | andel |
|---|---|
| ulikt kort på samme frø, alle rader | **32,0 % ± 1,3** |
| … med ≥ 3 lovlige kort | **39,3 % ± 1,6** |

Strata velger et annet kort enn i.i.d. i nesten hver tredje beslutning. Knotten er altså
ikke død i strengen (jf. `12k16d4`, som slo hele søket av i stillhet) — den gjør en stor,
målbar endring i hvilke kort som velges, og den endringen gjør valget **verken mer eller
mindre stabilt**. Det er selve dommen: den bytter ut verdener uten å gjøre utvalget bedre.

---

# HVA JEG LEVERER, OG HVA JEG IKKE LEVERER

1. **Knotten:** `~trekk=strata`, av som standard. ✔
2. **Av er av:** tom `diff` over 120 stillinger × 48 verdener, per-verden-verdier + σ +
   margin, PÅ TVERS av commitene, kjørt i to ulike arbeidskopier. ✔
3. **Forventningsretthet:** troens marginal står stille — snitt |Δ| 0,0033 mot MC-SE 0,0044,
   0 av 1297 celler over 3 SE, 0 avvik i `rng()`-kall. ✔ **Kravet er innfridd.**
4. **Samme antall verdener og utspillinger:** 0 av 1320 rader avviker; +0,1 % veggtid. ✔
5. **Støygulvet med og uten:** **+1,2 ± 1,5 pp. DET FALT IKKE.** ✔ (målt, ikke ønsket)
6. **Spek til K1-måling: LEVERES IKKE.** Oppdraget sa «faller det, virker det». Det falt ikke.

## Hvorfor jeg IKKE ber om en K1-måling

Speken finnes og er verifisert byggbar (§5 over, 17 kolonfelt som grunnlinja):

```
okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin~trekk=strata:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin
```

Men å køe den ville brukt 2,5 timer på en arm som er målt til null på sitt eget
forhåndsregistrerte mål, som peker svakt feil vei på både støygulv og anger, og der
mekanismen er *forstått* og forklarer hvorfor den ikke kan virke (§4c). **Min anbefaling er
å ikke måle denne.** Knotten blir stående i grenen: den er gratis, den er av som standard,
den er bevist av-når-av, og den gjør en framtidig stratifisering på en annen akse billig å
prøve uten å bygge alt på nytt.

## DEN NYE INFORMASJONEN — hvor variansen IKKE bor

Dette er det oppdraget faktisk kjøpte, og det er ikke det samme som «strata virket ikke».

`bandit.md` sin sluttdiagnose var at variansen skapes i runde 1, og at ingen hadde rørt
hvordan verdenene TREKKES. Nå er trekket rørt, med et grep som er **eksakt forventningsrett**
og **eksakt gratis**, og gulvet står stille. Sonden i §4 sier presist hvorfor:

**Klumpingen sitter ikke i utvelgelsen. Den sitter i at hver av de 48 verdenene bare har 32
forslag å velge mellom, og at de 32 er ferske hver gang.** En rist over vektkvantilen kan
bare fjerne den variansen u-koordinaten forklarer, og u indekserer ingenting felles på tvers
av 48 uavhengige pooler. Variansforholdet 0,997 er ikke en skuffelse — det er et måletall som
sier at *hele* variansen ligger i pool-innholdet, ikke i pool-uttrekket.

Det gjør to ting klart for den neste som prøver:

1. **Enhver variansreduksjon som bare omfordeler ETT uttrekk per pool er dømt på forhånd.**
   Det gjelder systematisk resampling, antitetiske uniformtall i utvelgelsen og
   lav-diskrepans-sekvenser over u. De angriper alle et ledd som bærer 0,3 %.
2. **Det som gjenstår er å endre POOLENE selv** — enten ved å dele kandidatene mellom
   slottene (48×32 i ett sett), eller ved å stratifisere på en størrelse som betyr det samme
   i hvert slott (hvor et bestemt kort ligger, trumffordelingen). **Begge endrer fordelingen**,
   ikke bare utvalget: den første bytter SIR-approksimasjonen fra M=32 til M=1536. Det er
   fortsatt lovlig å prøve — men da må armen måles som «annen fordeling», og
   forventningsrettheten kan ikke loves på forhånd slik den kunne her.

Med andre ord: oppdragets grep 1 er nå ferdig undersøkt og lukket, og grunnen er målt, ikke
gjettet. Kuren mot de 43 % ligger ikke i hvordan de 48 verdenene plukkes ut av poolene sine.

## Status

Gren `strata-2026-09-14` @ `202b063`, arbeidskopien ren (bare `analyse/strata-w*.jsonl` er
untracked måledata). `krav-2026-09-11` står urørt på `092cd00`. Ingen K1-måling er startet.
Ingen av de fredede arbeidskopiene er rørt. Hjelpekopien `D:\amb-strata-foer` (detached
`092cd00`) står igjen med fingeravtrykket; den kan fjernes med
`git worktree remove D:/amb-strata-foer` når notatet er lest.
