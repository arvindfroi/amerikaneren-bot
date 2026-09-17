# Overraskelsesblokka, ANDRE forsøk — sterk referansepolicy i stedet for grådig ordning

Gren: `overraskelse2-2026-09-13` i `D:\amb-krav` (fra `overraskelse-2026-09-13`, commit 8507838).
Startet 13. sep.

## Hvorfor det gjøres om igjen

Første forsøk (`overraskelse.md`) målte NULL: holdout **0,95817** uten blokka mot **0,95819**
med, snitt over tre frø, mens spennet mellom frø innenfor hver arm var 0,0012 — seksti ganger
større enn forskjellen. Håndverket var i orden: blokka fylt i 97,8 % av radene, prefikset
bit-identisk med et 996-korpus, nullpunktprøven grønn.

Diagnosen fra første agent, og hele grunnen til dette oppdraget:

> referansepolicyen var motorens grådige trekkordning fra `genererOgOrdne` («vinn billigst /
> kast billigst / ikke overtrumf makkeren»), og den er trolig SÅ FORUTSIGBAR at overraskelsen
> nesten blir en funksjon av kortrangene, som nettet allerede ser.

Det som VIRKET (likelihood-vekting ved søketid, `~lik=selv`, +3,83 pp riktig plasserte kort sent
i runden) bruker botens EGEN policy som referanse. Andre forsøk bytter ut referansen og BARE
den: samme 48 trekk, samme ekvivalensklasser, samme vindu (12 kort), samme layout, samme
klemming, samme bredde 1044.

## Problemet ingen av de to andre målingene har: nettet vil ha en HÅND

Den grådige ordningen er en funksjon av (kortet, kortet som holder stikket, trumf, ledfarge,
lag) — alt offentlig. `likvekt` slipper unna fordi den har en TRUKKET VERDEN, altså en konkret
hånd å spille i. Et kortnett har ingen av delene: `e1SpillTrekk` tar setets EGEN hånd, og en
tilskuer har den ikke.

Løsningen er **skyggevisningen** (`src/mlb/refpolicy.ts`): nettet får den offentlige
kandidatmengden — «kortene hun KUNNE hatt», utledet med nøyaktig samme regel som blokka alt
bruker — som hånd, og stillingen spoles tilbake til tidspunktet valget ble tatt. Ingen skjulte
kort kommer inn, og K2-prøven (bytt de skjulte hendene, krev bit-identisk 1044-vektor) dekker
den nye kodeveien uendret.

To varianter, fordi dette er en approksimasjon og ikke en sannhet:

* **HARD** — hånden er kandidatmengden, ett-hot. Nettet ser da en hånd på 15–30 kort.
* **MYK** — hvert kandidatkort veies med `w = håndstørrelse / antall kandidater`, altså den
  marginale sannsynligheten for at hun har det. Håndblokka får da riktig L1-masse, og for
  første lineære lag er det EKSAKT snittet av nettet over alle forenlige hender (mean field).
  Etter ReLU er det en approksimasjon.

Valget mellom dem tas ikke av meg, men av en måling (under).

## Status

- [x] `src/mlb/refpolicy.ts`: referansepolicyen som grensesnitt, den grådige som `GRÅDIG`,
      nettreferansen med skyggevisning (hard/myk), spekform `nett:<fil>[@temp][:myk]`
- [x] `src/mlb/overraskelse.ts`: policyen er et argument; softmax, entropi, rang og klemming er
      FELLES for alle referanser (bare poengfunksjonen skiller dem). Sondekrok for de rå valgene.
- [x] `src/mlb/trotrekk.ts`: generatoren bruker `aktivReferanse()`
- [x] kalibrering og valg av referanse (`_probe-ref2.ts`) — se under
- [x] første forsøks ni prøver er fortsatt grønne (9/9) med den grådige som standard i et
      kall med ett argument
- [x] verifikasjon: blokka fylt, prefikset bit-identisk, nullpunktprøven — se under
- [x] holdout uten/med, tre frø — **NULL igjen**, se nederst

## VERIFIKASJONEN, de samme tre prøvene som sist

Korpuset: `--kamp --hukommelse --signal --sanser2 --overraskelse --kamper 350 --skard i/2`,
`AMB_OVERRASKELSE_REF="nett:e1-modell/kort-7.bin@2"`. 88 190 + 87 617 = **175 807 rader**, altså
nøyaktig samme antall og samme filstørrelse som første forsøks armer.

**1. Prefikset — rad for rad, bit for bit, over ALLE radene (ikke tre kamper).**

| skard | rader | de 996 første trekkene | etikett | frø |
|---|---|---|---|---|
| 0 (mot `a996-0`) | 88 190 | **BIT-IDENTISK** | identisk | identisk |
| 1 (mot `a996-1`) | 87 617 | **BIT-IDENTISK** | identisk | identisk |

Arm A og arm B står dermed på nøyaktig de samme radene, med nøyaktig de samme etikettene, og
arm A-tallene fra første forsøk gjelder disse radene.

**2. Blokka er FYLT** (skard 0; skard 1 er lik til første desimal):

| blokk | kolonner | rader med noe ≠ 0 | \|sum\| per rad |
|---|---|---|---|
| grunn | 0–659 | 88 190 (100,0 %) | 117,906 |
| hukommelse | 660–803 | 83 892 (95,1 %) | 53,871 |
| signal | 804–919 | 88 190 (100,0 %) | 25,616 |
| stilling | 920–955 | 88 190 (100,0 %) | 12,451 |
| valgtbort | 956–995 | 79 944 (90,6 %) | 2,696 |
| **overraskelse** | **996–1043** | **86 361 (97,9 %)** | **18,974** |

Per stikk er den nye blokka fylt i **100 % av radene fra stikk 1 og ut**; i stikk 0 er den fylt
i 5 545 av 7 374, som er riktig av samme grunn som sist (vinduet består der bare av stikk 0s
egne kort, og noen av dem er observatørens egne eller tvungne). `medBok`-fella er lukket: også
hukommelsen er fylt i 95,1 % av radene i 1044.

**3. Nullpunktet:** `test/mlb-overraskelse.test.ts` er grønn 9/9 — og nullpunktprøven går nå
gjennom `troTrekkForBredde`, som bruker den AKTIVE (nett)referansen. Et 996-nett utvidet med
nuller bakerst gir nøyaktig samme tro, og én koblet kolonne i den nye blokka endrer den. Blokka
når altså fram.

**4. Og blokka er FAKTISK en annen enn første forsøks.** `b1044-0` (grådig referanse) mot
`c1044-0` (nettreferanse), alle 1044 kolonnene: **86 117 av 88 190 rader skiller seg**, og det
første avviket står i post 1011 — inne i blokka (0,2908 mot 0,1406). De 996 første trekkene er
like i alle radene. Det er ikke to kjøringer av det samme; det er to referanser.

## PREMISSET ER MÅLT FØRST: er nettet virkelig en sterkere referanse?

Hele oppdraget hviler på at den grådige ordningen er en for svak modell av spilleren. Det er
målbart FØR et korpus lages: hvor godt forklarer referansen kortene som FAKTISK ble spilt?
`_probe-ref2.ts` regner −log π(det spilte kortet) over nøyaktig de valgene blokka scorer, på
2 304 stillinger fra 12 kamper ved det bordet korpuset spilles av (`ADAMS_MAALT`), gjennom
samme kodevei som generatoren (sondekroken i `overraskelseTrekk`).

| referanse | NLL (nat/valg) | NLL stikk ≥ 6 | topp1 | H | µs/rad |
|---|---|---|---|---|---|
| **grådig** (første forsøk) | **1,6679** | 1,4621 | 39,3 % | 1,1167 | 21 |
| d7alle @0,5 | 1,4871 | 1,3660 | 43,0 % | 1,0860 | 739 |
| d7alle @1 | 1,3395 | 1,2255 | 43,0 % | 1,2667 | 835 |
| d7alle @2 | 1,3364 | 1,2300 | 43,0 % | 1,3747 | 884 |
| d7alle @4 | 1,3696 | 1,2683 | 43,0 % | 1,4183 | 917 |
| d7alle @1 myk | 1,3616 | 1,2413 | 43,0 % | 1,2744 | 855 |
| d7alle @2 myk | 1,3498 | 1,2398 | 43,0 % | 1,3776 | 837 |
| kort-7 @1 | 1,3455 | 1,2367 | 43,2 % | 1,2323 | 819 |
| **kort-7 @2** | **1,3287** | **1,2247** | **43,2 %** | 1,3617 | 881 |
| kort-7 @2 myk | 1,3393 | 1,2275 | 43,9 % | 1,3682 | 869 |

**Premisset holder.** Nettet forklarer de faktiske kortene 0,34 nat/valg bedre enn den grådige
ordningen og treffer toppvalget 4 pp oftere. Det er ikke en marginal forskjell — det er en
tredel av en nat per valg, målt på 15 240 frie valg.

Tre ting er verdt å merke seg, fordi de begrenser hva målingen kan bety:

* **MYK skyggehånd taper.** Mean field-varianten er jevnt over litt DÅRLIGERE enn den harde
  (1,3393 mot 1,3287 for kort-7 @2). Den harde velges — ikke fordi den er penere, men fordi
  den er målt bedre. At forskjellen er liten sier at nettet ikke er så følsomt for
  håndstørrelsen som fryktet.
* **kort-7 slår d7alle**, selv om det er d7alle som SPILLER kortene i korpuset. Referansen
  trenger altså ikke være bordets egen policy for å forklare den — de to nettene er nære
  slektninger, og kort-7 er den nyere.
* **Temperaturen er kalibrert, ikke gjettet**: T = 2 minimerer NLL for kort-7 (1,3287 mot
  1,3455 ved T = 1 og 1,3696-nivået ved T = 4).

**Valgt referanse: `nett:e1-modell/kort-7.bin@2`** (hard skyggehånd, T = 2), satt som
`STANDARD_REFERANSE` og overstyrbar med `AMB_OVERRASKELSE_REF`.

**Prisen:** 881 µs per rad mot 21 µs for den grådige — 42 ganger dyrere, og ~0,86 ms av det er
selve blokka. Det er ~9 foroverganger gjennom 273→512→384→256→52 per rad (én per scoret valg i
vinduet, ikke én per lovlig kort — nettet gir alle 52 logitene på én gang).

## Måleoppsettet — og hvorfor armene her er STRENGERE like enn i første forsøk

Første forsøk genererte to korpus fra samme frøbånd og verifiserte at de var like. Her er
kravet lukket i stedet for verifisert: **referansepolicyen rører bare kolonnene 996–1043.**
Utvalget av rader (`tilfeldig() < 0,5`), kampene, agentene og de 996 første trekkene kan ikke
påvirkes av den. Derfor er arm A det EKSISTERENDE 996-korpuset fra første forsøk
(`_korpus/a996-*.bin`, samme kommando, samme frø, samme skard), og arm B det nye 1044-korpuset
— og prefikset sammenliknes rad for rad, bit for bit, over alle 175 807 radene, ikke over
tre kamper.

Det gir samtidig en gratis, sterk kontroll: hvis prefikset er bit-identisk med første forsøks
arm A, er arm A-tallene fra første forsøk MÅLT PÅ NØYAKTIG DE SAMME RADENE, og de kan gjenbrukes
i stedet for å trenes om. Det er ikke en snarvei uten pris, så den betales: seed 20260913 for
arm A kjøres på nytt og må reprodusere 0,95790 til femte desimal. Gjør den ikke det, er
treningen ikke deterministisk, og da trenes begge armene om fra bunnen.

Trening (identisk med første forsøk): `--hold-del 8` (hash på kampens frø, hele kamper holdes
ut), dims [dim, 1024, 768, 512, 208], 10 epoker, batch 2048, lr 1e-3, `--tapsform ce4`,
frø 20260913 / 20260914 / 20260915. CUDA (RTX 5080), så treningen tar ikke av CPU-budsjettet.

**Reproduksjonen er kjørt, og den er EKSAKT.** Arm A, frø 20260913, trent på nytt på
`_korpus/a996-*.bin`:

| | første forsøk (03:14) | reprodusert (03:42) |
|---|---|---|
| K8-tap | 0,95790 | **0,95790** |
| CE4 | 1,09470 | 1,09470 |
| treff | 44,59 % | 44,59 % |
| per stikk 11 | 0,69781 | 0,69781 |
| per rolle | 1,0746 / 0,9149 / 0,9182 | 1,0746 / 0,9149 / 0,9182 |

Hvert eneste tall i rapporten er likt, ned til per rolle × stikk. Treningen er altså
deterministisk gitt data og frø, og hyperparameterne over er de samme som første forsøk brukte.
Arm A-tallene kan dermed gjenbrukes — forutsatt at prefikssjekken under står.

## HVA DEN NYE REFERANSEN KOSTER I TID PER RAD

Målt på ekte spillestillinger med `_tid-overraskelse.ts` (912 stillinger, tre gjentak), altså
samme sonde og samme form som første forsøk:

| | µs per rad | første forsøk (grådig) |
|---|---|---|
| `troTrekkForBredde` 996 | 35,9 | 35,8 |
| `troTrekkForBredde` 1044 | **1 477,6** | 57,3 |
| differansen = blokka | **1 441,6** | 21,5 |

**Blokka koster ~1,44 ms per rad mot 21,5 µs i første forsøk — 67 ganger dyrere**, og 40 ganger
kostnaden av alle de 996 andre trekkene til sammen. `_probe-ref2.ts` målte 0,88 ms/rad på et
annet stillingsutvalg, så 0,9–1,5 ms er spennet; forskjellen er hvor mange kandidater vinduets
valg har.

Prisen er ~9 foroverganger gjennom 273→512→384→256→52 per rad — én per scoret valg i vinduet.
(Linja «bare overraskelseTrekk 16,9 µs» i sondens utskrift er den GRÅDIGE: et kall med ett
argument gir fortsatt `GRÅDIG`, og det er den linja som måles der.)

I generatoren druknet blokka i spillingen sist; nå gjør den ikke det. Genereringen av 175 807
rader tok ~13 minutter på to kjerner mot ~2 minutter for 996-korpuset. Det er fortsatt billig
nok til en måling, men det er IKKE gratis nok til å stå i en søkeløkke uten at noen regner på
det først.

## Nettet: hvilket, og hvorfor det ikke er et fritt valg

`kort-7.bin` er 273 → 512 → 384 → 256 → 52 og passer skyggevisningen. `kort-8.bin` er 493 trekk
bredt og er AVVIST i kode: fra 273 og oppover leser kodingen `state.vrak`, talongstørrelsen og
troen — felt en skygge ikke kan fylle ærlig, og nuller der ville gitt et nett som spiller etter
noe annet enn det det ble trent på, uten at noe feilet.

## HOLDOUT: med og uten blokka, tre frø

152 831 treningsrader, 22 976 holdoutrader (412 592 kort), dims [dim, 1024, 768, 512, 208],
10 epoker, batch 2048, lr 1e-3. Alt likt i de to armene bortsett fra de 48 kolonnene — og her
er «likt» ikke en påstand om frø, men bit-identiske rader (se verifikasjonen).

| frø | **996 (uten)** | **1044 (med, nettreferanse)** | forskjell |
|---|---|---|---|
| 20260913 | 0,95790 | 0,95885 | +0,00095 (verre) |
| 20260914 | 0,95772 | 0,95842 | +0,00070 (verre) |
| 20260915 | 0,95889 | **0,95737** | −0,00152 (bedre) |
| **snitt** | **0,95817** | **0,95821** | **+0,00004 (verre)** |
| spenn | 0,00117 | 0,00148 | |

Arm A frø 20260913 er kjørt på nytt her (0,95790, identisk med første forsøk); de to andre
arm A-tallene er gjenbrukt fra første forsøk, som er lovlig fordi radene er bit-identiske og
treningen er verifisert deterministisk.

Andre tall, snitt over de tre frøene:

| | 996 (uten) | 1044 (med) |
|---|---|---|
| CE4 | 1,09548 | 1,09492 |
| treff | 44,61 % | 44,64 % |
| K8 budvinner | — (1,0746 v/frø 1) | 1,0748 |
| K8 makker | — (0,9149 v/frø 1) | 0,9145 |
| K8 motspiller | — (0,9182 v/frø 1) | 0,9189 |

**Dette er ingen gevinst.** Snittene skiller seg med 0,00004 nat/kort, mens spennet mellom frø
innenfor hver arm er 0,0012–0,0015 — tretti ganger større. På to frø er 996 best, på det tredje
er 1044 best. Det er mønsteret man ser når det ikke er noen effekt.

**Og sent i runden er det heller ikke noe.** Stikk 11: 0,69781 (uten, frø 1) mot 0,70798 /
0,70201 / 0,70442 (med) — altså om noe VERRE der likelihood-vektingen hentet sine +3,83 pp.

### Sammenlikningen som er hele poenget med andre forsøk

| referanse | NLL på de faktiske kortene | topp1 | holdout K8 (snitt, tre frø) |
|---|---|---|---|
| ingen blokk | — | — | **0,95817** |
| grådig ordning (første forsøk) | 1,6679 | 39,3 % | 0,95819 |
| **kortnett @2 (andre forsøk)** | **1,3287** | **43,2 %** | **0,95821** |

Referansen ble 0,34 nat/valg og 4 pp bedre til å forklare de faktiske kortene. Holdouten flyttet
seg 0,00002 nat/kort — altså ingenting, og i feil retning av de to. **Diagnosen fra første
forsøk er dermed prøvd og forkastet:** det var ikke referansepolicyens styrke som gjorde at
kanalen målte null.

### Hva jeg mener dette UTELUKKER — og hva det ikke gjør

Utelukket, innenfor dette treningsregimet: at nullresultatet skyldtes en for svak eller for
forutsigbar referansepolicy. Det var den eneste konkrete forklaringen første forsøk etterlot,
den var testbar, og den er testet med den sterkeste referansen som er tilgjengelig uten å bryte
K2. To referanser som er svært ulikt gode som SPILLERMODELLER gir samme holdout til fjerde
desimal. Da ligger ikke problemet i referansen.

Det peker videre på to ting som IKKE er utelukket, og som er ulike i art:

1. **KODINGEN, ikke kanalen.** De 48 tallene er aggregater (siste, snitt, maks, andeler) over et
   vindu på 12 kort. Om signalet finnes per VALG og ikke per sete-snitt, kan blokka være riktig
   regnet og likevel bære lite. Sonde B (`src/mlb/sekvens.ts`) stilte samme spørsmål.
2. **REDUNDANS.** Trohodet har alt `valgtbort` (hvilke kort som var alternativer), hvem-la-hva
   og kortrangene. Om nettet klarer å gjenskape det overraskelsen tilfører fra dem, er kanalen
   ekte og likevel usynlig — og da er dette et svar om hva nettet ALLEREDE kan, ikke om kanalen.

Forbeholdene fra første forsøk står uendret: 10 epoker på 153 k rader, ingen varmstart, ingen
menneskerader. En kanal kan være ekte og usynlig her.

**Jeg påstår ikke at kanalen virker, og heller ikke at den er død.** Fem–seks delmålinger på rad
i dette prosjektet har sett bra ut isolert uten å oversette seg til hele boten; denne ser ikke
engang bra ut på holdout. K1-dommen tas av Arvind.

## Nettet: hvilket, og hvorfor det ikke er et fritt valg

Men korpuset spilles av `ADAMS_MAALT`, som er
`vr:…:budm:…:vakt:abmpf:e1:e1-modell/d7alle.bin` — altså **d7alle.bin**, ikke kort-7. Skal
referansen være «en sterk modell av spilleren», er det spillerne ved DETTE bordet den skal
modellere. Begge måles.
