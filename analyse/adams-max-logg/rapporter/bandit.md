# Bandit: adaptiv budsjettering i søket (sekvensiell halvering)

Gren `bandit-2026-09-14` i **`D:\amb-bandit`** (fra `krav-2026-09-11` @ 092cd00).
14. sep, maks 3 kjerner. **BYGGEOPPDRAG — ingen K1-måling startet.**

## Logg (fortløpende)

- **Arbeidskopi opprettet.** `git worktree add D:\amb-bandit krav-2026-09-11` sjekket ut
  eierens gren DIREKTE (den var ikke utsjekket noe annet sted). Rettet umiddelbart med
  `git switch -c bandit-2026-09-14`; `krav-2026-09-11` står urørt på 092cd00.
- Kartlegging: `vurderPar` (`src/moe2/sdpar.ts:247-369`), `~`-feltløkka
  (`agentspek.ts:1265-1320`), `sik:`-porten (`sikkerorakel.ts`).
- Riggen fra `troledd` ligger på gren `troledd-2026-09-13` (7 filer under `examples/`),
  IKKE på `krav-2026-09-11`. Må hentes/porteres.

- **Knotten bygget** (`~fordel=halv`), tre steder: `sdpar.ts` (selve omfordelingen),
  `sikkerorakel.ts` (gjennomstikk + offentlig felt for prøvene), `agentspek.ts` (`~`-feltet).
- **Valget: sekvensiell halvering, ikke UCB.** To grunner, den andre avgjørende:
  (1) UCB trenger en utforskningskonstant mot en belønningsskala som varierer sterkt med
  stillingen (σ fra <0,5 til >2,5 i samme kjøring, `troledd.md` §6) — en ny knott å ta feil
  av; halvering har ingen konstant. (2) **UCB ØDELEGGER PARRINGEN**: den trekker ett og ett
  armvalg, så to kandidater ender med ULIKE verdenssett, og differansen får verden-effekten
  tilbake — nøyaktig variansen oppdraget vil fjerne. Halvering lar hele det levende feltet
  dele hver eneste verden.
- Budsjettregnskapet: `k·K` utspillinger, `⌈log2 k⌉` runder, per runde
  `⌊(budsjett − brukt)/(levende · gjenstående runder)⌋` verdener per kandidat, med et hardt
  tak som ikke starter en verden den ikke har råd til. `ParResultat.utspillinger` er lagt
  til så «samme kostnad» kan ETTERPRØVES og ikke bare hevdes.
- For k=6, K=48: runde 1 gir 16 verdener til 6 kort (96 utsp.), runde 2 32 nye til 3 (96),
  runde 3 48 nye til 2 (96) = 288 = 6·48. Finalistene sammenliknes over **96** verdener
  mot dagens 48, og margin/σ regnes på det paret.

- Filer lagt til: `test/bandit-fordeling.test.ts` (8 prøver), `examples/bandit.ts` (måleriggen,
  gjenbruker fasit-/regretkoden fra `troledd.ts`), `examples/bandit-sum.ts` (klynget SE),
  `examples/bandit-identitet.ts` (fingeravtrykk for «av er av» PÅ TVERS av commiten).
- Grunnlinjeprøven kjøres på TILBAKESTILTE kilder (`git checkout HEAD~1 -- src/moe2/…`) med
  alle modellfilene på plass, så før/etter er sammenliknbare. Første kjøring (før
  modellfilene ble kopiert fra `D:\amb-krav\e1-modell`) var 1018/975/22 og hadde ENOENT-feil
  som ikke hører hjemme i grunnlinja.

## Prøvene

**Grunnlinje** (`092cd00`, kilder tilbakestilt, alle modellfiler på plass):
`tests 1028 | pass 1018 | fail 4 | skipped 6` — logg: `bandit-test-foer.log`.
De fire røde er `web/dist/app.js`- og `worker.js`-byggeartefaktene, `mlb-tro-signal.bin`-
tapsprøven og SKRALLE i `spek-en-kilde`. Alle fire er pre-eksisterende og rører ikke
`sdpar.ts`/`sikkerorakel.ts`/`agentspek.ts` sin `sik:`-gren.

**Typesjekk** (`tsc --noEmit`, typene lånt fra `D:\amb-krav\node_modules`): én feil i hele
repoet, `src/mlb/fargebytte.ts(60,1): 'kortIndeks' er deklarert men aldri brukt` — samme
pre-eksisterende feil `sokfokus.md` §5 fant. **De tre endrede filene er rene.**

**Ni nye prøver, alle grønne** (`test/bandit-fordeling.test.ts`, 63 s):
1. AV ER AV strukturelt — uten feltet er `fordeling` `null`, ikke «jevn».
2. INGEN KOLLISJON — `e3`, `L`, `D`, `k32` og verdenstallet overlever `~fordel=halv`, og
   `~mlbu=`/`~fordel=` kan stå i begge rekkefølger.
3. UGYLDIG KASTER — `""`, `jevn`, `ucb`, `Halv`, `halv2`, `halvering` kaster alle.
4. `utenSøk` URØRT — feltantallet uendret, motparten strippes til `ADAMS`.
5. **BUDSJETTET HOLDER** — over 40+ stillinger bruker halveringen *aldri* flere
   utspillinger enn den jevne, og aldri mer enn `k` færre (ingen stille innsparing).
6. **PARRINGEN HOLDER** — finalistene har like lange `perVerden`, og `n > K`.
7. **k = 2 ER BIT-IDENTISK** — samme `n`, samme `utspillinger`, samme `sigma`, samme verdi
   i hver verden for hver kandidat.
8. KNOTTEN BITER — med ≥ 3 kandidater velger den noen ganger annerledes.

De nye filene treffer ikke SKRALLE-mønsteret (`vrakrang.bin|d7alle.bin`) — verifisert både med
`grep` og i grunnlinjekjøringen, der SKRALLE lister elleve pre-eksisterende filer
(`duplikat-menneske`, `koblingssonde`, `kort-data`, `menneske-logg`, `oktsonde2`,
`vrakq-data`, `eksakt-k7`, `etterlyst-laert`, `k2-spek`, `k4-spek`, …) og **ingen av mine**.

## «AV ER AV» — bevist PÅ TVERS AV KODEENDRINGEN, ikke bare innenfor den

En prøve inne i grenen kan bare vise at knotten AV oppfører seg som knotten AV. Den kan ikke
vise at den oppfører seg som **koden før knotten fantes** — og det er det «av er av» betyr.
`examples/bandit-identitet.ts` skriver derfor et fingeravtrykk som er regnet ut på BEGGE
commitene og sammenliknet med `diff`:

| | commit | stillinger | fil |
|---|---|---|---|
| FØR | `092cd00` (knotten finnes ikke i koden) | 120 | `bandit-id-foer.txt` |
| ETTER | `e87864d` (knotten i koden, feltet ikke i kallet) | 120 | `bandit-id-etter.txt` |

**`diff` er TOM** (`bandit-id-diff.txt`, 0 linjer, exit 0). Fingeravtrykket dekker valgt kort,
`n`, σ (9 desimaler), margin (9 desimaler) **og hver enkelt verdi per kandidat per verden** —
bare kortet ville sluppet gjennom en endring som flyttet verdiene uten å snu argmaks. Feltet
`utspillinger` er utelatt med vilje: det finnes ikke på grunnlinja, og et fingeravtrykk som er
ulikt fordi det har et nytt felt beviser ingenting.

## Måleoppsettet (støygulvet, ikke K1)

`examples/bandit.ts`, fire armer per stilling, alle på samme `state` og sete:

| arm | fordeling | verdensfrø |
|---|---|---|
| J1 | jevn (dagens) | `SIK_FRØ` |
| J2 | jevn | `SIK_FRØ ^ 0x5bf03635` |
| H1 | halv | `SIK_FRØ` |
| H2 | halv | `SIK_FRØ ^ 0x5bf03635` |

STØYGULV(jevn) = J1≠J2, STØYGULV(halv) = H1≠H2, målt over **de samme to trekningene**, så en
«heldig» stilling teller likt for begge. De to frøene er nøyaktig de `troledd.ts` brukte til
arm A og arm C, så tallet er direkte sammenliknbart med de 43,8 %.
**Forhåndsregistrert hypotese: STØYGULV(halv) < STØYGULV(jevn).** Alt annet er sekundært.

3 arbeidere × 4 kamper × 3 runder = 12 kamper (= 12 klynger). SE klynget på kamp,
`SE(d̄) = √(Σ_c (Σ_{i∈c}(d_i − d̄))²) / n` — allerede SE-en til gjennomsnittet, ikke delt på
√n en gang til. Formelen er kontrollert mot den vanlige SE-en på syntetiske rader med én rad
per klynge (0,05725 mot 0,05749 — forskjellen er bare `n` mot `n−1`).

## HENDELSE: målingen ble startet TO ganger, og det ble fanget

Første kjøring ble startet med `nohup bash verktoy/bandit-kjor.sh … &`. En prosessjekk viste
**seks** arbeidere, ikke tre: to komplette sett, startet 10:02:27 og 10:05:50, mens
kjøreloggen bare hadde ÉN «arbeider 0/1/2»-linje. Begge settene hadde samme frø og skrev med
`appendFileSync` til de samme `analyse/bandit-w*.jsonl`.

Hadde dette fått stå, ville hver rad kommet **to ganger**: `n` doblet, hver klynge fylt med
eksakte kopier av seg selv, og den klyngede SE-en systematisk for liten. Nøyaktig en slik
lydløs dobling er den typen feil som gjør et støytall til et «funn». Det brøt også
3-kjerners-taket (seks tunge prosesser).

Alle seks ble drept, delresultatene slettet, og målingen startet på nytt med `Start-Process`
per arbeider — én prosess per arbeider, PID-ene skrevet ned, og en vakt som **nekter** å
starte hvis det allerede finnes en `bandit`-prosess. Verifisert: 3 prosesser etter start.

---

# RESULTATET: STØYGULVET FALT IKKE. Hypotesen er forkastet.

1320 beslutninger, 12 kamper (= 12 klynger), 3 arbeidere à 4 kamper × 3 runder, ~24 min.
Rådata `D:\amb-bandit\analyse\bandit-w{0,1,2}.jsonl`, sammendrag `bandit-sammendrag.txt`.
Duplikatkontroll etter omstarten: **0** dupliserte rader.

## 1. Hovedtallet — det oppdraget ba om

| | n | JEVN (i dag) | HALV | **PARRET HALV − JEVN** |
|---|---|---|---|---|
| **ALLE** | 1320 | 43,0 % ± 1,4 | 42,2 % ± 1,4 | **−0,8 ± 1,1 pp (z = −0,71)** |

**Riggen reproduserer det kjente tallet:** 43,0 % mot `troledd.md` sine 43,8 % ± 1,0, på
andre giv og andre kamper. Grunnlinja er altså ikke feilmålt her.

Målingen er sterk nok til å ha sett en ekte forbedring: SE-en på differansen er 1,1 pp, så et
fall på mer enn ~2,2 pp ville slått ut. **Det er ikke en underpowered skuldertrekning — det er
et ganske stramt null.**

Undergrupper (parret, klynget). **Ingen av disse er funn** — de er ti sammenlikninger uten
forhåndsregistrering, og den største er godt innenfor det ti trekninger gir av seg selv:

| gruppe | n | jevn | halv | parret |
|---|---|---|---|---|
| foerer | 378 | 39,2 % | 37,3 % | −1,9 ± 1,8 pp |
| makker | 301 | 44,5 % | 47,8 % | +3,3 ± 2,0 pp |
| forsvar | 641 | 44,5 % | 42,4 % | −2,0 ± 1,2 pp |
| stikk 0–3 | 461 | 60,5 % | 60,1 % | −0,4 ± 1,3 pp |
| stikk 8+ | 368 | 8,7 % | 8,2 % | −0,5 ± 0,9 pp |
| 3–4 lovlige | 417 | 33,1 % | 32,4 % | −0,7 ± 1,6 pp |
| **5+ lovlige** | 561 | 66,1 % | 64,9 % | −1,2 ± 2,0 pp |

Raden `5+ lovlige` er den som skulle båret hele effekten — det er der omfordelingen har noe å
omfordele. Den er null.

## 2. HVORFOR DET IKKE VIRKET — og det er ny informasjon

Omfordelingen gjør nøyaktig det den lovet. Målt:

- finalistene vurderes i **78,9 verdener i snitt** mot 48 (108,1 ved 5+ lovlige kort),
- **σ stiger** tilsvarende: 0,65 → 0,93 ved 5+ lovlige, fordi den parrede marginen nå måles
  over dobbelt så mange verdener og SE-en krymper,
- knotten biter: med ≥ 3 lovlige kort velger halveringen et annet kort enn den jevne i
  **24,6 %** av beslutningene (samme frø).

Og likevel står gulvet stille. **Da ligger ikke variansen der oppdraget antok.** Premisset var
at budsjettet sløses på kort som ikke konkurrerer, og at finaleparet er underfinansiert. Men
argmaks-ustabiliteten skapes ikke i finalen — den skapes i **runde 1**, der utsilingen skjer på
`K/⌈log2 k⌉` = 16 verdener. Med et støygulv på 66 % blant stillinger med 5+ kandidater blir det
virkelig beste kortet ofte kastet før den ekstra budsjettet noen gang når fram til det.
Variansen fjernet på slutten legges tilbake i starten.

Det er en målt uttalelse om HVOR variansen bor, og den er verdt å ta med videre: en snillere
plan (kast bare den dårligste ÉN per runde — «successive rejects» — eller et gulv på runde 1)
angriper et annet ledd enn denne gjorde. Jeg har ikke målt en slik variant.

## 3. EN BIVIRKNING SOM MÅ SIES HØYT: σ-PORTEN BLIR EN ANNEN PORT

Dette er det ene tallet som flyttet seg klart, og det gikk **feil vei**:

| | jevn | halv | parret |
|---|---|---|---|
| støygulv for **kortet som SPILLES** (σ ≥ 0,5 anvendt) | 32,3 % ± 1,3 | 37,9 % ± 1,3 | **+5,5 ± 1,3 pp** |
| andel der porten åpner | 51,0 % | 56,1 % | |
| … ved 5+ lovlige | 53,8 % | **64,2 %** | |

Mekanismen er hel: flere verdener på finaleparet → mindre SE på marginen → **større σ** →
porten åpner oftere → søket overstyrer nettet oftere → og siden søkets argmaks fortsatt er
like ustabilt, blir det SPILTE kortet mer ustabilt enn før.

**Konsekvens for enhver framtidig K1-måling:** `~fordel=halv` ved σ 0,5 er **ikke én endring**.
Den er «omfordel budsjettet» OG «løsne porten» i samme arm, og de to kan ikke tilskrives hver
for seg. σ er ikke lenger sammenliknbar på tvers av fordelinger — samme terskel betyr noe annet.
Det er nøyaktig fella `sokfokus.md` §8 pekte på for `eks:`.

## 4. Anger mot eksakt fasit — også null

166 skillende stillinger (569 flate forkastet, 585 utenfor fasitvinduet), begge verdensfrø
talt, klynget på kamp:

| mål | jevn | halv | parret halv − jevn |
|---|---|---|---|
| diff | 0,475 | 0,428 | −0,05 ± 0,11 poeng (z = −0,41) |
| lag | 0,508 | 0,503 | −0,00 ± 0,13 poeng (z = −0,04) |

## 5. Kostnaden — utspillingene står stille, trekningene ikke

| | jevn | halv |
|---|---|---|
| **utspillinger per beslutning** | **229,0** | **228,9** |
| rader der halv brukte FLERE | — | **0 av 1320** |
| ms per beslutning | 644 | 653 (**+1,3 %**, +8,26 ± 1,83 ms) |
| verdener beste kort ble vurdert i | 48,0 | 78,9 |

Budsjettet holder eksakt slik det ble konstruert: differansen er −0,05 utspillinger per
beslutning, altså resten som ikke rekker en hel verden til. **Men kostnaden er ikke helt
uendret:** halveringen trekker 78,9 verdener i stedet for 48, og trekning koster (32
kandidatverdener med et nett-oppslag hver). Det er +1,3 % i veggtid — lite, men ærlig sagt
ikke null, og det er den eneste posten som ikke er gratis.

## 6. Av er av, målt i selve kjøringen

342 beslutninger hadde nøyaktig to lovlige kort. Med k = 2 er halveringen én runde over hele
budsjettet, altså definisjonsmessig den jevne fordelingen. **Ulike kort: 0 av 342.**
Sammen med den tomme `diff`-en over 120 stillinger på tvers av commitene står «av er av» på to
uavhengige bein.

---

# HVA JEG LEVERER, OG HVA JEG IKKE LEVERER

1. **Knotten:** `~fordel=halv`, «av er av» verifisert to ganger. ✔
2. **Støygulvet med og uten, parret:** −0,8 ± 1,1 pp. **Det falt ikke.** ✔ (målt, ikke ønsket)
3. **Anger mot fasit:** −0,05 ± 0,11 poeng. Null. ✔
4. **Kostnaden:** utspillingene uendret (0 av 1320 rader over), veggtid +1,3 %. ✔
5. **Spek til K1-måling: LEVERES IKKE.** Oppdraget sa «hvis støygulvet faller». Det falt ikke,
   og K1 er 2,5 t per arm. Å køe den nå ville brukt de timene på en arm som er målt til null på
   sitt eget forhåndsregistrerte mål — og som i tillegg blander inn en utilsiktet
   port-løsning (§3). **Min anbefaling er å ikke måle denne.**

Knotten blir stående i grenen: den er billig, den er av som standard, den er bevist av-når-av,
og den gjør det mulig å prøve en annen plan senere uten å bygge alt på nytt.

## Om jeg fikk fortsette (ikke gjort, ikke målt)

Det ene tallet som peker et sted er §2: variansen skapes i runde 1, ikke i finalen. Den
billigste neste prøven er derfor ikke en ny fordeling, men å måle **hvor ofte den jevne
fordelingens beste kort blir kastet i runde 1** — én kolonne til i samme rigg, samme kjøretid.
Er det tallet høyt, er hele halveringsfamilien feil vei her, og det er verdt å vite før noen
prøver «successive rejects».

## Prøvene etter endringen — null nye røde

| | tester | pass | fail | skipped |
|---|---|---|---|---|
| før (`092cd00`, kilder tilbakestilt) | 1028 | 1018 | **4** | 6 |
| etter (`72971ce`) | 1037 | 1027 | **4** | 6 |

De ni nye er nøyaktig `test/bandit-fordeling.test.ts`, og alle ni er grønne. Feilmengden er
**identisk før og etter, navn for navn**: `web/dist/app.js`, `web/dist/worker.js`,
`mlb-tro-signal.bin`-tapsprøven og SKRALLE. Ingen ny rød, ingen som forsvant.

Arbeidskopien er ren, `krav-2026-09-11` står urørt på `092cd00`, og ingen av de fredede
arbeidskopiene (`amb-loop`, `amb-krav-batteri`, `amb-sokfokus`, `amb-holdout`, `amb-dekomp`,
`amb-imit`) er rørt. **Ingen K1-måling er startet.**
