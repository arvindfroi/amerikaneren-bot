# STRØMMENDE TRENING AV TROHODET (13. sep)

Oppdraget: gjør det MULIG å trene trohodet på 100–400× dagens datamengde. Skaleringskurven
(`skalering.md`) viste at DATA binder — log-lineært, R² = 0,9943, ingen metning — og at veien
fra 21,9 % til 35 % er ~8,5 doblinger ≈ 3,5·10⁸ rader ≈ 360× dagens basseng. Denne fila er
målingene og endringene som gjør det tallet nåbart. Skrives fortløpende.

Ingenting her er en påstand om at trohodet BLIR bedre. Det er en påstand om hva som er mulig
å kjøre, og hver påstand står med tallet den hviler på.

## 1. HVORFOR DET ER UMULIG I DAG — regnet etterpå, ikke antatt

`verktoy/mlb-tro-tren.py`, `les_mlbt`: `numpy.fromfile` per fil og `numpy.concatenate` over
alle. Hele korpuset ligger i RAM samtidig, og X lagres som fp16.

| post | byte per rad |
|---|---|
| 996 × f4 (trekk) | 3 984 |
| 52 × i1 (etikett) | 52 |
| frø i4 + stikk i2 + sete i2 | 8 |
| **rad på disk (MLBT v1, dim 996)** | **4 044** |
| rad i minnet (X som fp16) | 1 992 |

Bekreftet mot fila: `_korpus/a996-0.bin` er 356 640 372 B = 12 + 88 190 × 4 044. Postlengden
stemmer på byten.

| ressurs | 3,5·10⁸ rader krever | maskinen har | forhold |
|---|---|---|---|
| disk | 1,43 TB (374 GB int8-kvantisert) | 628 GB ledig på D: | **2,3× for lite** |
| RAM | ~705 GB (X som fp16) | 23 GB i WSL | **31× for lite** |

Dagens tak er ~12 millioner rader (12×), ikke 360×. **RAM er den bindende veggen, ikke maskintid.**

## 2. EN VEGG TIL, OG DEN ER ALLEREDE TRUFFET: FRØBÅNDET

Dette var ikke en del av bestillingen som noe akutt, men målingen viser at det er det.

`KAMP_BÅND.trening` (`examples/mlb-trodata.ts:206`) er avsatt til 4 000 kamper. Løkka har
brukt av båndet hver iterasjon, og i natt tok det slutt:

```
iter0: trening-filer=6  baandfeil=0   950M
iter1..iter7: trening-filer=6  baandfeil=0   ~600M hver
iter8: trening-filer=0  baandfeil=6    74M   <-- bare holdout
```

Alle seks treningsskardene i iterasjon 8 døde på

```
Error: kamp-trening-båndet er avsatt til 4000 kamper
    at file:///D:/amb-loop/examples/mlb-trodata.ts:245:31
```

og løkkas egen statuslinje bokførte det som suksess: `[iter 8] DATA tro: 2 filer, 74M`. De to
filene er holdout. **Iterasjon 8 trener altså trohodet uten en eneste ny treningsrad**, og
ingenting i loggen sier fra. Å heve båndet er derfor ikke bare forberedelse til 360× — det er
en reparasjon av noe som ryker nå.

## 3. BASISLINJEN FOR BIT-IDENTITET

Kravet er at den nye stien gir samme tall som i dag på et korpus som får plass i RAM. Det
forutsetter at dagens trener i det hele tatt er reproduserbar. Målt først:

Korpus `_pr/liten-tren.bin` (11 654 rader, 24 kamper) mot `_pr/liten-hold.bin` (4 924 rader,
8 kamper), delt på KAMP så ingen giv deles. To kjøringer, samme frø:

```
kjoring 1: ce4 1.272409005087797  treff 0.32655281296930955  k8 1.0984832249677183
kjoring 2: ce4 1.272409005087797  treff 0.32655281296930955  k8 1.0984832249677183
```

Identisk til siste siffer, GPU og alt. Dagens sti er deterministisk, og bit-identitet er
dermed en prøvbar påstand og ikke en omtrentlig en.

Det lille korpuset lærer nesten ingenting (K8 1,0985 mot gulvet 1,0986) — for få kamper. Det
gjør det uegnet som eneste prøve, fordi et nett som ikke lærer heller ikke merker at
radrekkefølgen er en annen. Derfor er det bygd et større referansekorpus i tillegg:
`_pr/ref-tren.bin` (71 198 rader, 140 kamper) mot `_pr/ref-hold.bin` (16 992 rader, 35 kamper),
0 delte frø.

## 4. RØRET HOLDER — generator til trener er ikke flaskehalsen

Treneren kjører i WSL (CUDA), generatoren er Node på Windows (`node` finnes ikke i WSL).
Strømmen må derfor krysse WSL-grensa. Målt med `node.exe` som skriver til stdout og WSL-Python
som leser:

```
419 MB paa 1,353 s = 310 MB/s
```

Ved 4 044 B per rad er det **~77 000 rader/s gjennom røret**. Generatoren målte 295 rader/s
per skard i iterasjon 8. Røret har altså to størrelsesordener å gå på, og valget mellom disk
og strøm avgjøres ikke av båndbredden.

## 5. VALGET: (b) GENERATOR → TRENER, OG HVORFOR

Valgt vei **(b)**, strøm uten lagring. Argumentet er ikke at (a) er umulig, men at (a) betaler
for noe den ikke får bruk for:

1. **GENERATOREN ER FLASKEHALSEN, IKKE TRENEREN.** 295 rader/s per skard målt i iterasjon 8.
   Med 22 kjerner er det ~6 500 rader/s. Uansett hvilken vei man velger, må de 3,5·10⁸ radene
   *spilles*, og det tar ~15 timer med hele maskinen. Treneren på en 5080 ligger flere
   størrelsesordener over det. Med (b) venter GPU-en på generatoren — som den skal.
2. **EPOKER ER IKKE VERDT NOE VED DEN DATAMENGDEN.** (a) beholder epoker, men ti runder over
   de samme 3,5·10⁸ radene er ti ganger den samme informasjonen. Skaleringskurven sier at det
   som virker er FLERE FORSKJELLIGE rader. Én gjennomgang av en strøm på 3,5·10⁸ er nettopp det.
   Epoker er en måte å gjenbruke et lite korpus på; her er korpuset ikke lite.
3. **PRISEN FOR (a) ER 1,43 TB SOM ALDRI TRENGS.** Og disken har 628 GB. Selv int8-kvantisert
   (374 GB) må hver rad skrives og leses igjen — I/O for data som brukes én gang uansett.
4. **RAM-VEGGEN FORSVINNER HELT.** (b) holder bare et blandebuffer. 262 144 rader ≈ 520 MB.

Det (b) IKKE gir, og det skal stå tydelig: **global blanding**. `--tren` permuterer hele
korpuset per epoke; en strøm kan ikke det. Strømmen blandes blokkvis. Derfor er ikke
strømstien bit-identisk med filstien — samme kode for tap og mål, annen radrekkefølge.

Filstien er derfor **ikke rørt**. Den er fortsatt der, uendret, og det er DEN bit-identiteten
prøves på (§7). (a) er heller ikke stengt: `--tren` virker som før for korpus som får plass.

## 6. HVA SOM ER BYGD

| fil | endring |
|---|---|
| `examples/mlb-trodata.ts` | `--ut -` skriver MLBT til stdout; nytt frøbånd; frøfilter |
| `verktoy/mlb-tro-tren.py` | `StromKilde` + `--strom*`-flaggene; filstien urørt |
| `verktoy/mlb-tro-strom.sh` | generator-innpakning for ett skard (krysser WSL-grensa) |
| `src/mlb/froebaand.ts` | vernede bånd, forbudte frøavstander, `delerGiv` |
| `verktoy/mlb-baand-sjekk.ts` | kontrollen: 0 delte frø **og** 0 delte giv |
| `test/mlb-trodata-strom.test.ts` | sha256: stdout ≡ fil |

Treneren startes slik:

```
python verktoy/mlb-tro-tren.py \
  --strom "bash verktoy/mlb-tro-strom.sh {skard} {skard_n}" --strom-skard 6 \
  --hold <holdout.bin> --ut e1-modell/tro-ny.bin
```

## 7. BIT-IDENTITET — VERIFISERT

Kravet: den nye stien gir samme tall som i dag på et korpus som får plass i RAM, samme frø.

Metoden er valgt så påstanden er sterk: **filstien er ikke endret med én linje.** Strømmen er
en egen gren (`--strom`), og uten flagget kjører `range(0 if args.strom else args.epoker)` og
`les_mlbt` nøyaktig som før. Bit-identitet er da sant ved konstruksjon — og målt likevel:

Samme korpus (`ref-tren` 71 198 rader / 140 kamper, `ref-hold` 16 992 rader / 35 kamper),
samme frø, gammel trener mot ny:

```
stdout:  ingen avvik utenom --ut/--rapport-stiene jeg selv ga, og lastetiden (43s mot 46s)
jsonl:   IDENTISK (alle 10 epoker)
vektfil: sha256 78e03591b54ef5be11db6f649f771d2ba8cda9d5038916ee708c15624759155d  (BEGGE)
```

Vektfila er **byte-identisk**. Og dagens trener er reproduserbar i utgangspunktet — to kjøringer
før noen endring ga `ce4 1.272409005087797` begge ganger — så sammenlikningen betyr noe.

Den andre bit-identiteten, den strømmen faktisk hviler på: **bytene i røret er fila.**
`test/mlb-trodata-strom.test.ts` kjører samme kommando til fil og til stdout og sammenlikner
sha256. Grønn. Fella er armert: prøven krever at framdriftslinjene FAKTISK ble skrevet (til
stderr), for en eneste av dem på stdout ville forskjøvet hver post etter seg — uten å krasje,
siden en forskjøvet MLBT-post fortsatt er lovlige flyttall.

## 8. FRØBÅNDET — OG EN KONTROLL SOM VAR FOR SVAK

`KAMP_BÅND.trening` er hevet fra **4 000 til 16 000 000 kamper**, og steget fra **7717 til 1**.

**Steget måtte vekk, ikke bare taket.** 1,1 millioner kamper × 7717 = 8,5·10⁹, fire ganger 2³¹,
og frøet skrives som `frø | 0`. **Steget bar heller ingenting** — målt, ikke antatt
(`_pr/stride.ts`, 2 000 giv per arm, andel kortposisjoner der nabogiv har samme eier):

| arm | nabolikhet | dubletter |
|---|---|---|
| steg 1 | 0,21885 | 0 |
| steg 16 | 0,21825 | 0 |
| steg 7717 (dagens) | 0,21995 | 0 |
| tilfeldige frø | 0,21906 | 0 |
| *uavhengige giv (teori)* | *0,21893* | — |

`blandeSeed` + mulberry32 avalancher frøet. Nabofrø gir like uavhengige giv som fremmede.

### «0 DELTE FRØ» ER IKKE NOK

Dette er funnet jeg ikke lette etter. `blandeSeed(frø, r) = (frø + (r+1)·2654435761) mod 2³²`
er **lineær**. Runde r i kamp A og runde s i kamp B får derfor identisk kortgiving når

```
frøA − frøB ≡ (s − r) · 2654435761   (mod 2³²)
```

To **ulike** frø, samme 52 kort i samme hender. En frøkontroll ser ingenting. Med
`maksrunder ≤ 128` er den minste slike avstanden **21 581 449** (m = 89).

Skaleringsagentens kontroll («0 delte frø mellom treningsbassenget og holdout») er altså
nødvendig, men ikke tilstrekkelig. Den overlever hevingen — og er nå **skjerpet til å telle
delte GIV**, i `verktoy/mlb-baand-sjekk.ts`.

Målt på dagens bånd: `kamp-holdout` er ren, men **det utgåtte treningsbåndet deler alt 8 giv
med K8-prøvebåndet** — båndet dommen faller på. Det har aldri vært oppdaget.

### DERFOR FILTRERES FRØENE

Et TETT bånd (steg 1) treffer mye oftere ved uhell enn et med steg 7717: 45 837 av 16 000 000
mot K8-prøven. Å forurense selve måltallet dette arbeidet finnes for, er ikke akseptabelt, så
`delerGiv` (`src/mlb/froebaand.ts`) hopper over hvert frø som deler giv med et vernet bånd
(`kamp-holdout`, K8-prøven, `trodata-holdout`). Kontrollen, skannet over 500 000 frø:

```
496 491 frø overlever, 3 509 hoppes over (0,702 %)
    kamp-holdout 65     K8-proeven 2 925     trodata-holdout 519
FELLE: konstruert kollisjonsfrø 2006635468 -> filteret sier «kamp-holdout»
BAANDENE ER I ORDEN: 0 delte froe, og 0 delte giv mot kamp-holdout, K8-proeven, trodata-holdout
```

Fella er med fordi en kontroll som ikke tar en konstruert kollisjon ikke beviser noe.

**Det nye båndet:** `950 000 000 + k·1, k < 16 000 000` (topp 965 999 999, godt under 2³¹).
Bredden 15 999 999 er **mindre enn 21 581 449**, så to kamper i båndet kan aldri dele en giv,
uansett runde. Basen er søkt fram slik at ingen av de 255 forskjøvne holdout-spennene treffer.
`--maksrunder` er nå vaktet mot taket 128, siden beviset er ført for nettopp det taket.

Det gamle båndet er **utgått, men fortsatt reservert**: iterasjon 0–7 ligger i det, og et nytt
bånd som tok det i bruk ville duplisert de radene i stedet for å legge nye til.

16 000 000 kamper ≈ 5,2 milliarder rader — **15× målet på 3,5·10⁸**, og 4 000× dagens tak.

## 9. PRØVENE

```
✔ --kamp --hukommelse --signal: 920-rader er 660 | bok | signal, og boka er matet
✔ standarden uten --kamp er uendret: én runde per giv, 660 trekk, samme utvalg
✔ frøbåndene: kamp k har frø base + k·steg, toppen er inne i int32, og ut over båndet avvises
✔ K2/--kamp: 920-raden er bit-identisk når bare de skjulte hendene byttes — og en lekk blir tatt
✔ --ut - gir byte for byte det samme som --ut <fil>
✔ --ut - avviser sidefil-flaggene i stedet for å skrive «-.sekv.bin»
pass 6, fail 0
```

De fire første er prøvene som alt fantes — K2, hukommelsen, og at standarden uten `--kamp` er
uendret. De er grønne etter både båndbyttet og `--ut -`.

`tsc --noEmit`: én feil i hele repoet, `src/mlb/fargebytte.ts(60,1) 'kortIndeks' … never read`,
som er pre-eksisterende (den fila er ikke rørt). **Null feil i noen fil dette arbeidet endrer.**

## 10. STRØMMEN KJØRER ENDE-TIL-ENDE

Første fulle kjøring, 2 skard, 8 000 rader:

```
STROEM: 2 skard, versjon 1, 996 trekk, 4044 B per rad
0 treningsrader (0 menneske), 16992 holdoutrader, 996 trekk
strom 4096 rader (1186/s): tren 1.3862  CE4 1.3734  treff 28.8 %  K8-tap 1.0993
STROEM FERDIG: 8000 rader paa 8s = 1011 rader/s ende-til-ende
```

Legg merke til **`0 treningsrader`**: filstien leste ingenting, slik den skal med `--strom`.
Holdout kom fra fil som før, og de 8 000 radene kom fra generatorprosessene.

K8 gikk marginalt OPP (1,09895 → 1,09929). Det er ikke et resultat — 8 000 rader er ingenting,
og et nett fra bunnen av ligger på gulvet uansett. Kjøringen viser at røret virker, ikke at
noe blir bedre.

### RAM-VEGGEN ER BORTE — MÅLT, IKKE BARE TEGNET

Treneren ble målt mens den spiste rader (`ps`, RSS, hvert 4. sekund):

```
t=1  773 MB    t=3  1358 MB    t=5  1364 MB
t=2  1235 MB   t=4  1362 MB    t=6  1368 MB
```

**~1,37 GB, og flat mens radene renner gjennom.** Den vokser ikke med antall rader — det er
hele poenget. Filstien ville trengt ~705 GB for 3,5·10⁸ rader; her er forbruket torch + CUDA +
holdout (17 k rader ≈ 34 MB) + blandebufferet, og ingenting av det skalerer med korpuset.

## 11. GJENNOMSTRØMNING

**Alle tallene under er målt mens iterasjon 8 kjørte ~22 node-prosesser på de samme 22 kjernene.**
Det er ikke en fotnote — det er trolig en halvering. Jeg har holdt meg til 2–3 kjerner som avtalt,
så dette er et gulv, ikke et tak.

Generator alene, ett skard, 12 kamper:

| driverkonfig | rader/s (ett skard) |
|---|---|
| standard `ADAMS_MAALT` (billig) | **1 089** |
| løkkas egen konfig (`--drivere`, søk) | **185** (generatorens eget stødige tall: 201/s) |
| *iter8s måling på roligere maskin* | *295* |

Søket i løkkas policy koster altså ~6× per rad. Det er den konfigurasjonen som teller.

Ende-til-ende gjennom hele strømmen (generator → rør → GPU), løkkas konfig, 2 skard:

```
STROEM FERDIG: 40000 rader paa 169s = 237 rader/s ende-til-ende
STROEM-RADER-PER-S 236.5
```

237 rader/s på 2 skard = ~118 rader/s per skard. Sammenliknet med 185/s for generatoren alene
er tapet CPU-strid, ikke røret: røret måler 77 000 rader/s (§4), og GPU-en er ikke i nærheten
av å være metta.

### HVOR MANGE RADER GIR ET DØGN?

Skalert på per-skard-raten, siden generatoren er flaskehalsen:

| per skard | 6 skard | 20 skard | rader/døgn (20 skard) | 3,5·10⁸ rader tar |
|---|---|---|---|---|
| 118/s (målt her, maskinen opptatt) | 708/s | 2 360/s | **204 mill** | 1,7 døgn |
| 185/s (målt her, generator alene) | 1 110/s | 3 700/s | **320 mill** | 1,1 døgn |
| 295/s (iter8, roligere maskin) | 1 770/s | 5 900/s | **510 mill** | 0,7 døgn |

**Realistisk tak i dag: 2–5·10⁸ rader per døgn med hele maskinen.** Målet på 3,5·10⁸ er altså
under to døgn sammenhengende, og med en billigere datapolicy vesentlig mindre.

Det er verdt å si rett ut: **det er ikke lenger noen vegg — det er kjøretid.** Før dette
arbeidet var taket ~1,2·10⁷ rader (RAM), og 3,5·10⁸ var umulig uansett hvor lenge man ventet.

## 12. VARMSTART VIRKER — og det er slik løkka faktisk kaller treneren

Løkka trener aldri fra bunnen; den varmstarter fra forrige iterasjons nett (`--vekter`, R2).
Virker ikke det gjennom strømmen, er strømmen ubrukelig for løkka. Prøvd:

```
--strom … --vekter _pr/ref-gammel.bin
{"tro_foer": { … "k8": 1.0056148980876722 … }}      ← nøyaktig ref-gammel.bin sin verdi
STROEM FERDIG: 6000 rader paa 5s = 1270 rader/s
TRO-BESTE-EPOKE 0     TRO-BOT-K8-START 1.00561     TRO-BOT-K8-BESTE 1.00561
```

Startvektene måles først og skrives med én gang, og 6 000 rader slo dem ikke — så nettet ble
stående. Det er nettopp R2-semantikken løkka leser (`tro_foer`/`tro_etter`), uendret.

Kjøringen dobbeltsjekker også gjennomstrømningen: 1 270 rader/s her mot 237 i §11, fordi denne
brukte standard-speken. Forholdet 5,4× stemmer med 1 089/185 = 5,9× målt på ett skard alene.

### SLIK BØR LØKKA KALLE DEN

```
SPEK="<kandidatens spek>" DRIVERE="@|B|@|C" FRA=<forrige iterasjons slutt> \
python verktoy/mlb-tro-tren.py \
  --strom "bash verktoy/mlb-tro-strom.sh {skard} {skard_n}" --strom-skard 20 \
  --vekter e1-modell/tro-<N>.bin --hold <holdout.bin> --ut e1-modell/tro-<N+1>.bin \
  --strom-rader <budsjett> --strom-mal-hver 2000000
```

`FRA` er den eneste nye bokføringen: båndet har 16 millioner kamper, og hver iterasjon bør
starte der forrige sluttet, ellers spilles de samme kampene om igjen.

## 13. DET SOM IKKE ER VIST

* **Strømmen er ikke bit-identisk med filstien, og skal ikke være det.** Blokkvis blanding mot
  global permutasjon. Bit-identiteten som ER vist, er at filstien er uendret (§7) og at bytene
  i røret er fila (sha256).
* **Ingenting her sier at trohodet blir bedre.** Ikke ett tall i denne fila er en kvalitetspåstand.
  Kjøringene er på 6 000–40 000 rader og ligger på gulvet. Om 3,5·10⁸ rader faktisk gir 35 %,
  hviler fortsatt helt på ekstrapolasjonen i `skalering.md` — som selv sier at kurven er målt over
  én tierpotens og strekkes 2–3 videre.
* **20-skard-tallene er skalert fra per-skard, ikke målt.** Jeg holdt meg til 2–3 kjerner mens
  iterasjon 8 kjørte. Ved 20 skard kan minnebåndbredde og I/O gi mindre enn lineært.
* **De gamle radene beholder sin feil.** Iterasjon 0–7 ligger i det utgåtte båndet, som deler 8
  giv med K8-prøven. Det kan ikke rettes i ettertid — dataene finnes. Filteret gjelder nye rader.
* **Strømstien tar ikke myke etiketter (versjon 2) eller menneskerader.** Begge ville blitt
  kastet i stillhet, så begge er nå harde feil i stedet (`--strom` avviser versjon 2-strømmer,
  `--tren-menneske` og `--minne-dropout`). Det er en reell mangel, meldt i stedet for skjult.
  `--tren` tar dem som før.
* **`--strom-buffer` er ikke tunet.** 262 144 rader er valgt som «mye større enn en kamp»
  (~322 rader), ikke målt fram. For små blokker legger naborader fra samme giv i samme batch.

## 14. SLUTTKONTROLL

Vaktene fra forrige punkt er prøvd, ikke bare skrevet:

```
VAKT 1  versjon 2-stroem   -> «MLBT versjon 2 (myke etiketter) er ikke stoettet av --strom …»
VAKT 2  --tren-menneske    -> «… menneskeradene ville blitt lastet og aldri trent paa …»
VAKT 3  --hold-del         -> «… en stroem har ingen fil aa dele eller lese om igjen»
```

Og bit-identiteten er målt **på nytt etter** at vaktene ble lagt inn, siden de rører samme fil:

```
78e03591b54ef5be11db6f649f771d2ba8cda9d5038916ee708c15624759155d  ref-gammel.bin   (gammel trener)
78e03591b54ef5be11db6f649f771d2ba8cda9d5038916ee708c15624759155d  ref-ny2.bin      (etter vaktene)
JSONL IDENTISK
```

v1-strømmen kjører fortsatt etterpå (2 000 rader, 1 skard, 536 rader/s).

**Gren:** `stroem-2026-09-13` i egen worktree `D:\amb-stroem` — `edc2374` (strøm + bånd) og
`e4dfe98` (vaktene). `D:\amb-krav` og `krav-2026-09-11` er ikke rørt; iterasjon 8 kjørte hele
veien (25 av prosessene dens var i live ved slutten).

### DET SOM HASTER MEST AV DETTE

Ikke strømmen — **frøbåndet**. Iterasjon 8 trente trohodet på null nye rader i natt, og
iterasjon 9 vil gjøre det samme, helt til båndet i `/d/amb-loop` heves. Strømmen er
muligheten; båndet er en lekkasje i drift akkurat nå.
