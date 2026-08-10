# MLB-arkitekturen — hvilke evner finnes, og hvilke er koblet?

Arvind, 10. august:

> «du må heller se i arkitekturen for å se om den har alle evnene og blokkene
> den trenger for å bli bedre. ofte så er det noe koblet opp eller så er det en
> evne vi ikke har tenkt på som den burde hatt.»

Dette er svaret. Det er sortert etter **hva det koster å mangle**, ikke etter
modul, og hver rad sier hvordan den ble avgjort.

**Ingenting her er en gjetning fra kildekoden.** Alle tall under er målt på
`e1-modell/mlb-g05-beste.bin` — vektene som står på −3,43 mot `rask`.

---

## Sammendrag: ti evner, og hvor de står

| # | evne | tilstand | koster å mangle |
|---|---|---|---|
| 1 | **velge trumf** | **FRAVÆRENDE — 0,000 bit policy** | hver eneste kontrakt |
| 2 | **by gradert** | **DELVIS — 2 av 11 trinn brukes** | K3s 41,8 % gap |
| 3 | **utforskning i treningen** | **FRAVÆRENDE — ingen entropibonus** | kollapsen i 1 og 2 |
| 4 | **tilpasse seg løpslengde og stilling (K5)** | inngangen finnes, men er KONSTANT | K5, og «tren kort, døm langt» |
| 5 | **hukommelse med dybde (K4, K6)** | koblet, men kampen er 5 runder lang | K4, K6 |
| 6 | **se troen når valget tas (K8 → K7)** | **BYGD, IKKE KOBLET — 209 døde innganger** | K7s +0,947 |
| 7 | **hukommelsen inn i BUDET** | koblet i vektoren, død i valget | K6s sterkeste signal |
| 8 | **eksakt sluttspill (K7)** | FRAVÆRENDE, og kan ikke bygges der potten er | ~4,9 % av taket |
| 9 | **planlegge framover (K4-B)** | FRAVÆRENDE — én framoverpassering, intet søk | umålt |
| 10 | **konvensjonene som råd** | KOBLET, smalt og etter hensikten | — |

**Fire av ti er ikke koblet til ende.** Og den dyreste — nummer 1 — er en evne
ingen har lett etter, fordi den *finnes* i arkitekturen: inngangene når fram,
masken er riktig, hodet har fire utganger. Det er **policyen som er borte**.

---

## Instrumentene, og hvorfor de svarer på noe en gjennomlesning ikke gjør

Tre prøver, alle i `examples/mlb-arkitektur.ts`. De skriver løpende til fil.

### `--vekt` — har vektene bak en inngang i det hele tatt flyttet seg?

Stammens første lag er `[ut][inn]`; kolonne `c` er alt inngang `c` kan påvirke.
Tre utfall, og de betyr helt ulike ting:

| kolonnen | hva det betyr |
|---|---|
| **bit-identisk** | inngangen fikk aldri gradient |
| **bare krympet — samme forhold i hver rad** | inngangen var EKSAKT NULL i hver eneste treningsrad. Det som er igjen er AdamWs vektnedbrytning på He-initialiseringen |
| **flyttet seg fritt** | inngangen varierte |

Og en fjerde, som er den listige: en inngang som er **konstant ≠ 0** gir
gradienten `c · δ` — nøyaktig proporsjonal med biasens `δ`. Kolonnen blir da en
**omskalert bias**, og korrelasjonen mellom kolonnens endring og biasens endring
er 1 til femte desimal. Det er den eneste måten å finne slike innganger uten å
vite hvilke de er på forhånd.

### `--valg` — endrer en forstyrrelse i en blokk faktisk et VALG?

Samme prøve `docs/krav-status.md` §K5 kjørte på den gamle stakken («0 av 20»),
flyttet til sandkassen: bygg ekte trekkvektorer fra ekte selvspill, forstyrr én
blokk, og tell hvor mange argmaks-valg som snur. Den skiller «inngangen finnes»
fra «inngangen betyr noe».

### `--fordeling` — hva velger nettet egentlig?

En blokk som ikke endrer et valg kan enten være uviktig, **eller valget kan være
en konstant som ingenting kan flytte**. De to ser like ut i en
forstyrrelsesprøve og er helt forskjellige ting. Denne prøven skiller dem, og
det var den som fant det største.

---

## 1. Å VELGE TRUMF — evnen er borte, ikke bare svak

`--fordeling`, 138 ekte trumfvalg med den utrullede boten (argmaks):

```
VELG_TRUMF   n=138   ulike koder=1   entropi=0.000 bit   trumf:R = 100.0 %
```

**Nettet velger ruter. Alltid. Uansett hånd.**

Og `--valg` sier det samme fra den andre siden. Tolv ulike forstyrrelser, og
VELG_TRUMF står på **0 av 217** i hver eneste av dem — inkludert den der **hele
MIKRO-blokken på 273 tall, altså hånden selv, nulles**:

```
MIKRO-blokken nullet   BUD 50/868   VRAK 154/868   VELG_TRUMF 0/217   ETTERLYS 19/217   SPILL 1012/7605
```

Det er ikke en insensitiv policy. Det er **ingen policy**.

### Hva det koster, målt

Målestokken er hånden selv — å telle kort er ingen mester:

> **Den valgte fargen er den lengste i hånden i 30,4 % av tilfellene.**
> Tilfeldig valg gir ~25–35 %. Snittlengde i valgt farge: **3,12**. Snittlengde
> i den lengste: **4,75.**

Boten spiller altså hver eneste kontrakt med **1,6 trumf for lite**, og
etterlysningen arver feilen: 100 % av de etterlyste kortene er i ruter, fordi
trumfen alltid er ruter.

### Det er en KOLLAPS, og den er progressiv

Samme prøve på vektfilene bakover:

| vekter | BUD, ulike koder | BUD entropi | VELG_TRUMF, ulike | trumf-entropi |
|---|---|---|---|---|
| epoke 1 | 5 | 1,683 bit | 3 | 1,184 bit |
| epoke 5 | 4 | 0,819 bit | 4 | 1,590 bit |
| epoke 9 | 2 | 0,736 bit | 2 | 0,379 bit (spar 92,6 %) |
| epoke 10 | 2 | 0,747 bit | 2 | 0,454 bit (spar 90,5 %) |
| **g05-beste** | **2** | **0,811 bit** | **1** | **0,000 bit (ruter 100 %)** |

**Og fargen er ikke den samme mellom vektlinjene** — epoke 9/10 kollapser på
spar, `g05` på ruter. Det er beviset på at det er en vilkårlig kollaps og ikke
«ruter er best».

Dette er den samme kurven §124 så flate ut, med en mekanisme under.

---

## 2. Å BY GRADERT — 2 av 11 trinn

```
BUD   n=868   ulike koder=2   bud:pass = 75,0 %   bud:6 = 25,0 %
```

Handlingsrommet har `pass`, `bud:5` … `bud:13`, `amerikaner` og `solo` — elleve
lovlige trinn ved fire spillere (`bud:13` er aldri lovlig, se §J). Den utrullede
boten bruker **to**: den byr 6, eller passer. Epoke 9 og 10 byr 5, eller passer.
Det ene tallet er ikke en funksjon av hånden — det er et fast trinn.

25,0 % er nøyaktig ¼: én av fire byr, resten passer. Det forklarer også
kontraktfordelingen du målte — 100 % `tall`, 0 % `amerikaner`/`solo`.

Og budet er nesten immunt mot alt:

| forstyrrelse | BUD endret |
|---|---|
| hele MIKRO-blokken (hånden!) nullet | **50 / 868 (5,8 %)** |
| hele MAKRO-blokken nullet | 14 / 868 |
| hele HUKOMMELSE-blokken nullet | 9 / 868 |
| TRO-blokken fylt med nettets eget trohode | 11 / 868 |
| løpslengde 30 → 100 | 4 / 868 |
| K5: «bak 70–90» ved mål 100 | 5 / 868 |

**94 % av budvalgene er uendret når hele hånden nulles.** Budrunden er der
`budm`-ablasjonen målte **+0,8116 (5,4 SE) — 72 % av alt stakken tilfører**, og
i sandkassen er den nesten en konstant.

---

## 3. UTFORSKNING — evnen ingen har tenkt på

Dette er svaret på Arvinds «en evne vi ikke har tenkt på som den burde hatt».

**`verktoy/mlb-tren.py` har ingen entropibonus.** Eneste `cross_entropy` i fila
er trohodets etikett (linje 441 og 501). Policytapet er PPO-klipp med KL-brems
og logitvakt — §123 la dem inn mot *saturasjon*, som er en annen sykdom. Ingen
av dem holder entropien oppe; en KL-brems mot forrige epoke bremser bare
hastigheten mot kollaps.

Og kollapsen er ikke i utforskningen, den er i **argmaksen**. Softmax-entropien
ved T = 1, som er den treningen sampler med:

| fase | normalisert entropi (1 = uniform) |
|---|---|
| BUD | 0,169 |
| VRAK_KORT | 0,619 |
| VELG_TRUMF | 0,300 |
| VELG_ETTERLYST | 0,446 |
| SPILL_KORT | 0,622 |

**Selvspillet ser altså fortsatt andre trumffarger — den utrullede boten gjør
ikke.** AVGJØRELSE 4 («samplet i trening, argmaks i måling») er riktig og
standard, men den har en konsekvens ingen har skrevet ned: *porten, STYRKE og
stigen dømmer en annen bot enn gradienten trente.* Og gapet er størst nøyaktig i
fasene med færrest handlinger — der én logit kan legge seg over de tre andre
uten at samplingen merker det.

Det er den samme feilklassen som resten av lista, i ny drakt: **det målte var
ikke det som ble trent.**

---

## 4. LØPSLENGDE OG KAMPSTILLING (K5) — inngangen er en bias

Du fant at seks innganger er konstante. Vektrevisjonen bekrefter det og går
lenger — den viser **hvorfor** det er verre enn null:

```
KONSTANTE INNGANGER — korrelasjon mellom kolonnens endring og BIASENS endring
  meso.talong                  r = 1.0000
  meso.antallStikk             r = 1.0000
  makro.antallStikk            r = 1.0000
  makro.antallSpillere         r = 1.0000
  makro.målPoeng.per100        r = 1.0000
  makro.målPoeng.trettiDelt    r = 1.0000
  --- til sammenlikning ---
  mikro.hånd.S14               r = 0.4496
  makro.racepress              r = -0.5472
```

`r = 1,0000` betyr at kolonnen er **en omskalert kopi av biasen**. Den har fått
gradient i ti epoker, og alt den har lært er et konstantledd. Å endre inngangen
etterpå flytter hver nevron med den samme faste vektoren — uavhengig av
stillingen.

**Derfor er de 2,06 % endrede valg ved «løpslengde 30 → 100» ikke K5 som virker
litt.** Det er et vilkårlig konstant dytt som snur de nærmeste vippene:

| | endret |
|---|---|
| løpslengde 30 → 100 (Δ = 0,70) | 201 / 9 775 |
| løpslengde 30 → 15 (Δ = 0,15) | 19 / 9 775 |

Effekten skalerer med |Δx| og ingenting annet. Det er signaturen til et
biasledd, ikke til kunnskap. Og i BUD og VELG_TRUMF — de to fasene der
løpslengden faktisk skal bety noe — er den 4/868 og **0/217**.

### To konstanter til, som ikke sto på lista

Prøven finner konstantene av vektene og ikke av en liste, og fant **åtte**, ikke
seks. De to nye:

- **`meso.iTur.rel0`** — alltid 1. Trekkvektoren bygges for setet som
  bestemmer, så «hvem er i tur» er per konstruksjon alltid meg selv.
- **`mikro.bias`** — et konstantledd som allerede er der med vilje.

Nettet har altså **to bias-innganger**, og en fire-blokk (`meso.iTur`) der én
plass alltid er 1 og de tre andre alltid er 0.

Skillet er skarpt og etterlater ingen tvil: de åtte ligger på r ≈ 0,99998, og
den neste er `mikro.høyesteUte.H` på **0,967**.

---

## 5. HUKOMMELSEN (K4, K6) — koblet, men kampen er for kort til å ha en

**Den gode nyheten først, og den er ekte.** `docs/krav-status.md` §K6 sier at
den utrullede `ADAMS` endret **0 av 87 valg** på hukommelsen. I sandkassen:

```
HUKOMMELSE-blokken nullet          612/9775 (6,26 %)
HUKOMMELSE, bare MESO-leddene      331/9775 (3,39 %)
```

**Ledningen K6 manglet er lagt.** De 144 tallene går inn i policyen, ikke bare i
verdenstrekkingen, og de endrer valg.

**Den dårlige nyheten er at det ikke finnes noe å huske.** Målt, fire kopier av
det beste nettet:

| temperatur | målPoeng | runder per kamp |
|---|---|---|
| 0 (måling) | 30 | **4,60** |
| **1 (trening)** | **30** | **5,68** |
| 1 (trening) | 60 | 12,88 |
| 0 (måling) | 100 | 19,76 |
| 1 (trening) | 100 | **27,16** |

`Hukommelse.observer` bokfører bare ved `RUNDE_SLUTT`, og hukommelsen dør med
kampen. I trening ser den altså **høyst fire–fem ferdigspilte runder** før siste
beslutning, og null i første runde.

`docs/sandkassen.md` §3 skriver:

> «nettet lærer selv når fire observasjoner er for lite og når tjue er nok»

**Den får aldri tjue.** Og de nitten MAKRO-leddene i hukommelsen — hele
`…MotStilling` og `…MotTid`, altså «endrer hun seg gjennom løpet» — er
korrelasjoner over høyst fire punkter. Det er ikke et svakt signal, det er et
udefinert et. Det er nøyaktig det nivået `sandkassen.md` kaller «det ingen har
rørt, og det er nettopp det Arvind ber om».

**Og K6-prøven måler «vekst med rundenummer» over det samme fem-runders
vinduet.** `z = 0,23` er da ikke overraskende — den er nesten uunngåelig.

---

## 6. TROEN SOM INNGANG (K8 → K7) — 209 døde, og de er verre enn tomme

Vektrevisjonen bekrefter og utvider din måling:

```
kolonner uendret (bit-identiske):        0
kolonner BARE krympet (samme forhold):   214
kolonner som har flyttet seg fritt:      818
  krympefaktoren er 0,999561 — ren AdamW-vektnedbrytning, ingen læring
  TRO: 209   MESO: 4   LOVLIG: 1
```

Alle 209 tro-kolonnene har **nøyaktig samme forhold** mellom epoke 1 og
g05-beste, i hver eneste av de 1 024 radene. De har fått null gradient; det som
gjenstår er He-initialiseringen krympet med 0,9996.

**Datastien er fulgt til ende, og den stopper tre steder:**

1. `Sandkasseagent.velgHandling` (`spekagent.ts:133`) sender `tronett: null`.
2. `spillKamp` sender `opts.tronett ?? null`, og **ingen driver setter det** —
   `examples/mlb-spill.ts` gjør det bare bak et flagg som ikke brukes i
   epokedriveren, og `examples/mlb-erfaring.ts` sender det ikke i det hele tatt.
   Trening og spill er altså enige, så det er ingen skjevhet — bare en tom blokk
   begge steder.
3. **Trohodets utgang leses aldri når et valg tas.** `framover().tro` har
   nøyaktig én leser i hele kodebasen: `Sandkassenett.troFordeling`, som bare
   brukes av måleskript. Beslutteren i `selvspill.ts` bruker `framover.policy`
   og ingenting annet.

Troen påvirker altså policyen bare gjennom **den delte stammen** — hodet tvinger
representasjonen, og det er en ekte mekanisme, men den er indirekte og har aldri
vært isolert målt.

### Og derfor kan de 209 ikke bare «kobles på igjen»

Fordi vektene er tilfeldige. Å fylle blokken nå betyr å mate 209 innganger inn i
He-initialiserte vekter. Målt:

```
TRO-blokken: nettets EGET trohode    549/9775 (5,62 %)
TRO-blokken: p ~ uniform (0,25)      505/9775 (5,17 %)
```

At **uniform støy flytter nesten like mange valg som nettets egen tro** er hele
poenget: de 5,6 % er ikke informasjon, det er 214 000 tilfeldige vekter som
våkner. En påkobling er derfor ikke en bryter — den krever trening fra det
punktet, og §121 målte prisen til **1,84× per beslutning**.

---

## 7. HUKOMMELSEN NÅR IKKE BUDET

`docs/sandkassen.md` §3 peker ut det sterkeste hukommelsessignalet ordrett:

> «budet hun ga MOT HÅNDEN HUN VISTE SEG Å HA. Det er den sterkeste: vi vet i
> etterkant nøyaktig hva hun bød på, så vi kan måle om hun overbyr eller
> underbyr, og med hvor mye»

Det er bygd. `hukommelse.ts` har `meso.budavvik.verdi` og `.tiltro` på indeks
11–12 av 48 per motstander, og de ligger i vektoren.

Målt effekt på budvalget: **9 av 868**, og med bare MESO-leddene nullet **5 av
868**.

Det sterkeste signalet vi har om en motstander når fram til den beslutningen der
det betyr mest — og gjør ingenting. Det er ikke en ledningsfeil denne gangen; det
er punkt 2 og 3 over: budpolicyen er en konstant, så ingen inngang kan flytte
den.

---

## 8. EKSAKT SLUTTSPILL (K7) — fraværende, og forslaget holder ikke

Oppdraget foreslo dette som den ene kandidaten, med begrunnelsen at en eksakt
løser «bare bruker kort som allerede er synlige eller utledbare fra spillets
gang». **Jeg sjekket det, og det stemmer ikke ved fem stikk.**

### Målt: hvor mange fordelinger er forenlige med lovlig informasjon?

`--slutt`, 200 giv, telt med og uten renonsene følgeplikten avslører:

| stikk igjen | forenlige fordelinger (median log₁₀) | med renons | §117s pott |
|---|---|---|---|
| 1 | 1,90 (≈ 80) | **1,43 (≈ 27)** | **0,0000** (tvunget) |
| 2 | 3,66 | **2,99 (≈ 980)** | +0,064 |
| 3 | 5,34 | **4,54 (≈ 35 000)** | — |
| 4 | 7,03 | **6,23 (≈ 1,7 mill.)** | — |
| **5** | 8,44 | **7,74 (≈ 55 mill.)** | **+0,947** |
| 6 | 10,07 | 9,51 | — |

**Eksakt oppregning er billig nøyaktig der potten er null, og umulig nøyaktig der
+0,947 ligger.** Ved fem stikk er det 55 millioner fordelinger per beslutning, og
hver av dem må løses eksakt — ganger de ~fem kandidatkortene.

Det er samme svar §117 alt ga med en annen metode: *«gapet er informasjon, ikke
dybde»*, og `d4`/`d5` målte +0,049 og −0,024 mot porten. En sandkasseløser vil
møte nøyaktig den veggen, fordi veggen ikke er søkedybde — den er at 55
millioner verdener må **vektes**, og det er trohodets jobb.

### Og herkomstgrensen sier nei til den enkle veien

`test/mlb-herkomst.test.ts` forbyr `src/solver/` **i sin helhet**, med regelen
`/[\\/]src[\\/]solver[\\/]/`. `poengdds` ligger i `src/solver/poengdds.ts`. En
import fra `src/mlb/` gjør prøven rød — og det er riktig, for `poengdds` er
dobbeltdummy: den ser alle fire hender.

Det finnes en lovlig konstruksjon — en løser under `src/mlb/` som regner over
verdener sandkassens **egen** tro trekker — men den er identisk i form med
`alphamu`, den er dyr, og den forutsetter at troen er koblet på og god. Altså:
**den hører hjemme etter punkt 6, ikke før.**

**Dommen: dette er ikke det billigste løftet, og den delen som ER billig
(ett og to stikk igjen) er allerede målt til null.**

---

## 9. PLANLEGGE FRAMOVER (K4-B) — fraværende, og det er et bevisst valg

Sandkassen har **ingen søk**. Én framoverpassering per delsteg, og valget tas av
`velgKode` på policyens logits. Det følger av AVGJØRELSE 7 (kvalitet, ikke
mekanisme) og er ikke i seg selv galt. Men det står ingen steder at det er
umålt, så det står her: **ingen prøve i repoet viser at nettet spiller ULIKT når
et framtidig eget valg står på spill.**

---

## 10. KONVENSJONENE — koblet, smalt, etter hensikten

```
KONVENSJON-blokken nullet   121/9775 (1,24 %)   BUD 0   VRAK 0   SPILL 121/7605
```

Blokken fylles bare i SPILL med ≥ 2 lovlige kort, ved konstruksjon, og den
endrer 1,6 % av kortvalgene. Det er lite, men det er ærlig lite: 17 regler som
oftest peker på samme kort. Ingen feil her.

---

## J. Fem innganger som er strukturelt umulige, og en handlingskode som ikke finnes

Vektrevisjonen fant fem døde utenfor TRO som **ikke sto i din måling** — de er
funnet av gradienten, ikke av variansen:

| inngang | hvorfor den er permanent null |
|---|---|
| `meso.iTur.rel1/2/3` | trekkvektoren bygges for setet som bestemmer, så `rel(iTur)` er alltid 0 |
| `meso.utspiller.rel0` | er det min tur, kan jeg ikke selv ha ledet stikket |
| `lovlig.bud:13` | fire spillere gir **12 stikk**. Bud 13 er aldri lovlig |

`bud:13` er verdt et eget ord: det er en plass i **handlingsrommet**, ikke bare i
trekkvektoren. Policyhodet har 68 utganger, og én av dem kan aldri velges ved
fire spillere. Ufarlig — masken stenger den — men det er en logit som trenes mot
ingenting.

**Regnskapet: 214 døde + 8 konstante = 222 av 1 032 innganger (21,5 %) bærer
ingen informasjon.** Det er ~227 000 vekter i første lag.

---

## Hva jeg ville gjort først, og hvorfor

**Rekkefølgen følger av hva som blokkerer hva.** Merk: ingen av disse er målt
med stigen ennå — alt over er diagnostikk, ikke resultat.

### 1. Entropibonus i `verktoy/mlb-tren.py`. Først, og alene.

Det er én term i tapet. Uten den kollapser policyen i lavarietetsfasene, og
**alt annet på lista er blokkert av det**:

- Å koble på troen hjelper ikke et trumfvalg som ikke er et valg.
- Å variere løpslengden hjelper ikke et bud som har to trinn.
- Å bygge en sluttspillsløser hjelper ikke når kontrakten alt er spilt i feil
  farge.

Måles på tre tall som allerede finnes og ikke krever en stige: **antall ulike
argmaks-koder i VELG_TRUMF, entropien i BUD, og andelen der valgt trumf er
lengste farge (30,4 % i dag).** Er de tre uendret, virket det ikke — og det er
et svar på en kveld, ikke i uke fire.

Deretter stigen mot `rask`, fra −3,43.

### 2. Blandede løpslengder i selvspillet. Én endring, to krav.

`examples/mlb-spill.ts` tar `--maalpoeng` som ett tall for hele kjøringen. Trekk
det per kamp i stedet — 30 / 60 / 100.

Det er den eneste endringen på hele lista som treffer **to** krav samtidig:

- **K5:** `makro.målPoeng.*` slutter å være en omskalert bias og blir en
  funksjon nettet kan lære. I dag kan den ikke være det, uansett antall epoker.
- **K4 og K6:** kampen går fra 5,68 til 27,16 runder. Hukommelsen får for
  første gang de «tjue observasjonene» `sandkassen.md` forutsetter, og de
  nitten MAKRO-leddene får flere enn fire punkter å korrelere over.

Og den fjerner en ærlig risiko som står i `krav-status.md`: «at vi trener på løp
til 30 og dømmer på 100 gjør dette til noe som må etterprøves, ikke antas.» I
dag er det ikke etterprøvd — det er **utelukket**, fordi inngangen ikke varierer.

Prisen er ærlig og må sies, og den er målt og ikke anslått: i trening gir
målPoeng 30 / 60 / 100 henholdsvis **5,68 / 12,88 / 27,16 runder per kamp**. En
lik blanding koster derfor **~2,7× mer maskintid per kamp** enn dagens rene
30-løp. Budsjettet i `mlb.md` §5b må regnes om, og det er en avgjørelse for
Arvind og ikke for meg.

### 3. De 209: **fjern dem, ikke koble dem på.**

Målingen er klar: å fylle blokken i dag er å slippe 214 000 tilfeldige vekter
løs, og uniform støy flytter nesten like mange valg (5,17 %) som nettets egen
tro (5,62 %). Det er ikke en hypotese som er prøvd og virket — det er en
hypotese som ikke KAN prøves på disse vektene.

Fjernes blokken, blir stammen 209 innganger smalere og en anelse raskere, og
`tro.tilgjengelig`-flagget forsvinner sammen med den. **Ingen evne går tapt** —
troen er et hode, og hodet blir stående.

Skal spørsmålet «tilfører en eksplisitt tro noe utover hodet?» avgjøres, må det
avgjøres av en **egen treningslinje fra epoke 0 med blokken påslått**, målt mot
den samme linjen uten. Det er en ordentlig ablasjon, og den koster 1,84× i tid.
Den er verdt å kjøre — men etter punkt 1 og 2, ikke før.

Ta samtidig med de fem strukturelt umulige (`meso.iTur.rel1/2/3`,
`meso.utspiller.rel0`, `lovlig.bud:13`) og den ene overflødige bias-inngangen
(`meso.iTur.rel0` eller `mikro.bias` — én av dem, ikke begge).

### 4. Deretter, i denne rekkefølgen

- **Budstigen**, når entropien holder. K3s 41,8 % er det største enkelte gapet,
  og `budm` var 72 % av alt den gamle stakken tilførte.
- **En ordentlig troablasjon** (punkt 3, andre halvdel).
- **Sluttspillet sist**, og bare som en verdensvektet løser over sandkassens
  egen tro — aldri som en import fra `src/solver/`.

---

## Det som var galt — kort liste

1. **Trumfvalget er en konstant.** 217/217 samme farge, 0,000 bit, lengste farge
   i 30,4 % av tilfellene. Ingen har målt det fordi arkitekturen ser riktig ut.
2. **Budstigen er kollapset til to trinn**, og 94 % av budvalgene overlever at
   hele hånden nulles.
3. **Det finnes ingen entropibonus**, og kollapsen er progressiv over epokene —
   med ulik kollapsfarge i ulike vektlinjer, som beviser at den er vilkårlig.
4. **De seks konstante inngangene er ikke bare konstante — de er omskalerte
   bias-ledd**, med r = 1,0000 mot biasen. De 2,06 % endrede valg ved
   «løpslengde 30 → 100» er et konstant dytt, ikke K5.
5. **To konstanter til som ingen hadde navngitt**: `meso.iTur.rel0` og
   `mikro.bias` — nettet har to bias-innganger.
6. **Fem døde innganger til som varianseprøven ikke fant**, funnet av gradienten:
   `meso.iTur.rel1/2/3`, `meso.utspiller.rel0`, `lovlig.bud:13`. Totalen er
   **214 døde, ikke 209**.
7. **Kampen er 5,68 runder lang i trening.** Hukommelsen kan strukturelt aldri
   få den dybden `sandkassen.md` forutsetter, og K6s nullresultat følger av det.
8. **Argmaks-boten og gradient-boten er ikke samme bot**, og gapet er størst i
   fasene med færrest handlinger. Porten dømmer den ene, treningen former den
   andre.
9. **Forslaget om en eksakt sluttspillsløser holder ikke** ved fem stikk: 55
   millioner forenlige fordelinger, og herkomstgrensen forbyr `src/solver/`
   uansett.

---

## Filer

| fil | hva |
|---|---|
| `examples/mlb-arkitektur.ts` | de tre prøvene: `--vekt`, `--valg`, `--fordeling`, `--slutt` |
| `analyse/mlb-ark-vekt.txt` | vektrevisjonen |
| `analyse/mlb-ark-valg.txt` | 9 775 beslutninger × 12 forstyrrelser |
| `analyse/mlb-ark-fordeling.txt` | handlingsfordeling, entropi, trumfkvalitet |
| `analyse/mlb-ark-fordeling-mlb-e{1,5,9,10}.txt` | kollapsen over epokene |
| `analyse/mlb-ark-slutt.txt` | forenlige kortfordelinger per stikk igjen |

`npm test`: **622 grønne, 0 røde.** `npm run typecheck` ren.
`test/mlb-herkomst.test.ts` passerer uendret — ingenting under `src/mlb/` er
rørt.
