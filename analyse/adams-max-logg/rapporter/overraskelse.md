# Overraskelsesblokka — K8 kanal 5, ekvivalens gjort eksplisitt

Gren: `overraskelse-2026-09-13` i `D:\amb-krav` (fra `krav-2026-09-11`).
Startet 13. sep.

## Oppdraget

Kanal 5 i «De seks kanalene» (`AdamsMax.md`): et spilt kort er bevis BARE i
forhold til alternativene spilleren hadde. I dag får trohodet `valgtbort` (40
trekk) = HVILKE kort som ble valgt bort. Det målte null. Hypotesen: rå
alternativer er for svakt — nettet må selv gjenoppdage hvor overraskende valget
var. Vi gir tallet direkte.

Grunnen til at det er verdt å prøve: likelihood-vektingen (`~lik=selv,f7`,
`src/moe2/likvekt.ts`) ga +3,83 pp riktig plasserte kort sent i runden og K8
−0,096 nat/kort. Informasjonen FINNES. Men den koster 2,5x i søk, virker bare i
de siste stikkene, og falt på K1 (+0,91 mot +1,01). Ideen: samme informasjon som
et TREKK i stedet — gratis, i hvert valg, hele runden.

## Designet

Ny fil `src/mlb/overraskelse.ts`, 48 trekk, ny bredde **1044 = 996 + 48**.

### Referansepolicyen: motorens EGEN trekkordning

Ingen ny håndskrevet heuristikk. `genererOgOrdne` i `src/solver/dds.ts` er
søkets egen deterministiske ordning — «vinn så billig som mulig, ellers kast
billigst, men ikke overtrumf makkeren» — og den er alt policyen `grådigTilSlutt`
spiller etter. Nøkkelen der er:

    utspill:   nøkkel = 12 − rang(c)                    (høyt kort først)
    følge:     vil    = makkerVinner ? !vinner : vinner
               nøkkel = (vil ? 0 : 100) + rang(c)

Den nøkkelen er en funksjon av (kortet, kortet som holder stikket, trumf,
ledfarge, om holderen er lagkamerat) — alt OFFENTLIG. Ingen hånd, ingen fasit.
Blokka bruker nøyaktig samme regel, med to endringer:

* **100 → 13.** 13 er én hel rangstige, altså den MINSTE verdien som bevarer
  dds-ordningen fullstendig. 100 ville gjort et gruppebrudd uendelig
  overraskende (−log p ≈ 25 med temp 4) og mettet hele skalaen. 13 gjør det
  overraskende, men endelig.
* **softmax med temperatur 4.** Én fri konstant. `RANG`, `FRIHET` og `TVUNGET`
  er temperaturfrie, så blokka bærer signal selv om temperaturen er feil.

### Alternativmengden — den offentlige, og bare den

For hvert valg: mengden kort setet KUNNE ha spilt, utledet med nøyaktig samme
regel som `valgtbort.ts` sin `kunneHa` (spilt før — nei; spilt senere av en
annen — nei; spilt senere av henne selv — ja; i min hånd eller mitt vrak — nei;
renons vist i fargen — nei; ellers kanskje), snevret av lovlighetsreglene slik
de kan LESES av en tilskuer:

* fulgte farge → mengden er ledfargen (hun hadde den, altså måtte hun følge)
* renons → mengden er alt utenom ledfargen (hun hadde den ikke)
* utspill i stikk 1 fra budvinneren → trumfplikten leses av kortet hun la
* stikk 1, makkerplikten: la hun det etterlyste kortet, var valget TVUNGET;
  la hun noe annet mens kortet ville vært i basis, HADDE hun det ikke

### Ekvivalens er ikke pynt her — den er hele kanalen

`genererOgOrdne` sender bare ut toppen av hver ekvivalensrekke. Blokka gjør det
samme, med den offentlige masken: to kort i samme farge er ekvivalente om alle
kort strengt imellom er spilt. Dame fra K-D blanke og dame fra D-J-10 får
dermed ulik rang, ulik entropi og ulik log-sannsynlighet — som er nøyaktig det
eieren ba om.

### Layouten (3 relative seter × 14 + 6 = 48)

Relativt sete 0 (meg) har ingen plass: mitt eget kortvalg er ikke bevis om hvor
kortene ligger — nettet ser hånden min allerede. Samme grep som tempoblokka.

Per sete: SETT, SISTE_LOGP, SISTE_ENTROPI, SISTE_RANG, SISTE_FRIHET,
SISTE_TOPP, SISTE_TVUNGET, SNITT_LOGP, SNITT_ENTROPI, SNITT_RANG, MAKS_LOGP,
ANDEL_TOPP, ANDEL_FRI, N_OBS.
Felles: DEKNING, NOEN, SNITT_LOGP, SNITT_ENTROPI, SUM_LOGP, ANDEL_TVUNGET.

Vinduet er de 12 siste offentlige kortene (tre stikk).

## Status

- [x] design
- [x] blokka skrevet — `src/mlb/overraskelse.ts`, 48 trekk
- [x] koblet: `trotrekk.ts` (bredde/layout/dispatch), `tronett.ts`
      (`brukerOverraskelse`), `examples/mlb-trodata.ts` (`--overraskelse`),
      `verktoy/mlb-tro-tren.py` (LAYOUT 1044)
- [x] egen test (`test/mlb-overraskelse.test.ts`) — 9 prøver, alle grønne;
      `mlb-sanser2`, `mlb-tempo`, `mlb-auksjonsrekke`, `mlb-sanser-stigen`
      og `mlb-k2-tro` er fortsatt grønne (48 prøver til sammen)
- [x] **korpus generert og BLOKKA VERIFISERT FYLT** — se under
- [x] holdout med og uten — **ingen gevinst**, se nederst

## medBok-fella: eksplisitt avkreftet

Feilen som er gjort to ganger (en ny bredde legges til, generatoren nuller
stille en hel blokk) er sjekket direkte, ikke antatt. På et 2 213-raders
korpus (`--kamp --hukommelse --signal --sanser2 --overraskelse`, 6 kamper):

| blokk | kolonner | rader med noe ≠ 0 | |sum| per rad |
|---|---|---|---|
| grunn | 0–659 | 2 213 (100,0 %) | 117,748 |
| hukommelse | 660–803 | 2 078 (93,9 %) | 49,408 |
| signal | 804–919 | 2 213 (100,0 %) | 25,516 |
| stilling | 920–955 | 2 213 (100,0 %) | 12,625 |
| valgtbort | 956–995 | 2 010 (90,8 %) | 2,667 |
| **overraskelse** | **996–1043** | **2 164 (97,8 %)** | **19,022** |

Hukommelsen er altså også fylt i 1044 (det var den som ble nullet sist).
Per stikk er overraskelsesblokka fylt i 100 % av radene fra stikk 1 og ut;
i stikk 0 er den fylt i 134 av 183, som er riktig — der består vinduet bare
av stikk 0s egne kort, og noen av dem er observatørens egne eller tvungne.

**Prefikset er urørt:** alle 2 213 radene er bit-identiske med et
996-korpus fra samme frø i de 996 første trekkene. Samme frø gir samme
utvalg, så radene står 1:1 — dette er korpussammenlikningen, ikke bare én
stilling.

Vakten mot `--overraskelse --auksjon` / `--tempo` er prøvd og stopper.

## Ekvivalensen virker som den skal (håndregnet)

Samme dame (H12), samme sete, samme stikk, to ulike alternativmengder:

| | K‑D blanke | D‑J‑10, esset ute |
|---|---|---|
| ekvivalensklasser | **1** (K og D henger sammen) | **2** ({A} og {D,J,10}) |
| SISTE_TVUNGET | **1** | 0 |
| SISTE_FRIHET | 1/13 | 2/13 |
| SISTE_LOGP | 0 (null bevis) | 0,05926 |
| SISTE_ENTROPI | 0 | 0,258426 |
| SISTE_TOPP | 0 | 1 (vinn billigst) |

Tallene er regnet for hånd og står i prøven: nøklene er 0 + rang (dama 10,
esset 12, begge slår toeren), p(dama) = 1/(1 + e^−0,5) = 0,62246, −log p =
0,47408 → /8 = 0,05926, og H = 0,66284 → /ln 13 = 0,258426. Koden treffer
begge til fjerde desimal.

## Hva blokka koster

Målt på 912 ekte spillestillinger, tre gjentak (`_tid-overraskelse.ts`):

| | µs per rad |
|---|---|
| `troTrekkForBredde` 996 | 35,8 |
| `troTrekkForBredde` 1044 | 57,3 |
| bare `overraskelseTrekk` | 21,8 |

**Blokka koster 21,5 µs per rad**, altså +60 % oppå 996-trekkene. Sent i
runden (stikk ≥ 6, fullt vindu) er den 22,4 µs — kostnaden vokser ikke,
fordi vinduet er fast på 12 kort. Til sammenlikning koster likelihood-
vektingen 2,5× i SØK. I generatoren drukner blokka i spillingen: begge
armene skrev ~1 600 rader/s per kjerne.

## Datasettet for målingen

175 807 rader per arm (350 kamper, 2 skard), NØYAKTIG samme rader i begge
armene — samme frøbånd, samme utvalg, verifisert rad for rad. Holdout er
`--hold-del 8`, altså hash på kampens frø: hele kamper holdes ut, aldri
halve, og de to armene får dermed identiske holdout-rader.

## HOLDOUT: med og uten blokka

152 831 treningsrader, 22 976 holdoutrader (412 592 kort), dims
[dim, 1024, 768, 512, 208], 10 epoker, batch 2048, lr 1e-3, frø 20260913.
Alt likt i de to armene bortsett fra de 48 kolonnene.

| | **996 (uten)** | **1044 (med)** | forskjell |
|---|---|---|---|
| **K8-tap** (nat/kort) | **0,95790** | **0,95852** | **+0,00062 (verre)** |
| CE4 | 1,09470 | 1,09506 | +0,00036 (verre) |
| treff | 44,59 % | 44,67 % | +0,08 pp (bedre) |
| honnørtreff | 46,73 % | 46,81 % | +0,08 pp (bedre) |
| K8 budvinner | 1,0746 | 1,0743 | −0,0003 (bedre) |
| K8 makker | 0,9149 | 0,9152 | +0,0003 (verre) |
| K8 motspiller | 0,9182 | 0,9195 | +0,0013 (verre) |

Referanser: gulv 1,0986, kapasitetsteller 1,0944, kapasitet-treff 31,5 %.

**Dette er ingen gevinst.** Hovedtallet — K8-tap — er marginalt VERRE med
blokka, og treff er marginalt bedre. Begge forskjellene er i fjerde
desimal, og de peker hver sin vei.

### Og forskjellen er mindre enn støyen

Ett frø sier ingenting om en forskjell i fjerde desimal, så begge armene er
kjørt på tre frø (samme rader, samme holdout — bare vektinitialisering og
batch-rekkefølge skiller):

| frø | 996 (uten) | 1044 (med) |
|---|---|---|
| 20260913 | 0,95790 | 0,95852 |
| 20260914 | 0,95772 | 0,95865 |
| 20260915 | 0,95889 | **0,95740** |
| **snitt** | **0,95817** | **0,95819** |
| spenn | 0,00117 | 0,00125 |

Snittene skiller seg med **0,00002 nat/kort**. Spennet mellom frø innenfor
hver arm er 0,0012 — altså tjue ganger større enn forskjellen mellom
armene, og dobbelt så stort som det «funnet» ett enkelt frø ga. På det
tredje frøet er 1044 best; på de to andre er 996 best. Det er akkurat
mønsteret man ser når det ikke er noen effekt.

Blokka når fram til nettet (nullpunkt-prøven viser at én koblet kolonne
endrer troen), den er fylt i 97,8 % av radene, og den koder det den skal —
den bærer bare ikke noe nettet ikke allerede har, på dette datasettet.

Verken sent i runden er det noe å se: per stikk er de to kurvene like til
tredje desimal hele veien (stikk 11: 0,6978 mot 0,7059 — der er 996 BEST).
Det er verdt å merke seg, fordi det var nettopp sent i runden likelihood-
vektingen hentet sine +3,83 pp.

### Forbehold, så tallet ikke leses for sterkt

* 10 epoker på 153 k rader; begge armene falt fortsatt i K8 ved epoke 10.
  Dette er et lite budsjett, ikke løkkas produksjonsregime.
* Ingen varmstart, ingen menneskerader, ingen myke etiketter.
* En kanal kan være ekte og likevel usynlig her, om nettet trenger mer data
  for å lære å bruke den. Det er en hypotese, ikke en unnskyldning.

**Og K1-dommen er ikke tatt.** Fire delmålinger på rad har sett bra ut på
holdout uten å oversette seg til hele boten. Her ser den ikke engang bra ut
på holdout, så det er ingenting å påstå. Dommen om kanalen tas av Arvind
på K1.

## Hva som står igjen, om noen vil videre

Blokka er bygd, koblet, prøvd og målt — den er ikke skrudd på noe sted i
produksjon. Ingen spek peker på 1044, løkka trener fortsatt 996, og
`troKolonnekart(996, 1044)` er nuller bakerst, så ingenting endrer seg for
dagens nett. Å forlate den koster ingenting; å prøve videre kunne vært:

* produksjonsregime i stedet for 10 epoker på 153 k rader (varmstart fra et
  996-nett, menneskerader, myke etiketter),
* et større vindu enn 12 kort, eller per-stikk-oppløsning i stedet for
  aggregatene — sonde B (`src/mlb/sekvens.ts`) stilte det samme spørsmålet,
* en RIKERE referansepolicy enn motorens grådige ordning. Det er den mest
  sannsynlige forklaringen på nullresultatet: «vinn billigst / kast
  billigst» er så forutsigbar at overraskelsen den måler er nesten en
  funksjon av kortrangene, og de ser nettet allerede.

## Prøvestatus

| prøve | |
|---|---|
| `mlb-overraskelse` (ny) | 9/9 ✔ |
| `mlb-sanser2` + `mlb-tempo` + `mlb-auksjonsrekke` | 40/40 ✔ |
| `mlb-sanser-stigen` + `mlb-k2-tro` | 8/8 ✔ |
| `mlb-sanser2-utvid` | 4/4 ✔ |
| `mlb-trohukommelse` | 5/5 ✔ |
| `mlb-trofakta` | 12/13 (se under) |

`mlb-sanser2-utvid` er den viktigste av de gamle: den krever at
`verktoy/mlb-tro-tren.py --bare-utvid` og `utvidTronett` i TS gir
BYTE-IDENTISKE vektfiler. Den står grønn etter at LAYOUT-tabellen i
Python fikk 1044, altså er de to tabellene fortsatt enige.

## Kjente feil som IKKE er mine

Én prøve faller: `mlb-trofakta.test.ts`, deltesten «tapet: med
mlb-tro-signal.bin (776) …», på `ENOENT e1-modell/mlb-tro-signal.bin`.
Den fila finnes ikke i arbeidsmappa, er ikke sporet i git, og hentes ikke
av `verktoy/hent-vekter.mjs`; `test/k2-spek.test.ts` og
`test/sik-okt.test.ts` leser den samme fila og vil trolig falle likt (ikke
kjørt). Verken prøvene eller noen vektfil er rørt av dette arbeidet.

`npm run typecheck` melder én feil, i `src/mlb/fargebytte.ts` (ubrukt
import `kortIndeks`). Den fila er urørt, og importen står ubrukt i HEAD.

*(Sondene `_probe-overraskelse.ts` og `_tid-overraskelse.ts` og mappa
`_korpus/` ligger i arbeidsmappa og er git-ignorert av `/_*`; korpus, nett
og treningsrapporter for begge armene ligger i `_korpus/`.)*
