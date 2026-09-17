# Kanal 2 inn i sik:-stien — budvinnerens vrak som bevis

Gren: `kanal2-sik-2026-09-13` i `D:\amb-krav`. Startet 13. sep.

## Oppdraget

Kanal 2 (`W<alfa>`, budvinnerens vrak som bevis i verdenstrekningen) er bygd,
maalt positiv og STRUKTURELT FRAKOBLET fra den stien helboten faktisk bruker.
Dette er en ledningsjobb: ingen ny idé, ingen ny sans.

## 1. Verifisert at den er frakoblet (13. sep)

Alle fem punktene i oppdraget er ettergaatt i koden og stemmer:

| # | paastand | funn |
|---|---|---|
| 1 | `vrakalfa = les("W", 0)` bare i `amu:` | `src/moe2/agentspek.ts:1046`, sendt videre 1173. BEKREFTET |
| 2 | `amuagent.ts` er eneste sted vekten bygges | `src/moe2/amuagent.ts:296` `{ alfa: this.o.vrakalfa!, beta: 0 }`. BEKREFTET |
| 3 | `sik:`-grenen leser aldri `W` | `SikkerOpts` (sikkerorakel.ts:66-123) har ikke noe vrakfelt; opsjonsobjektet ved 310 sender ikke noe. BEKREFTET |
| 4 | `vurderSD` slipper `vrakvekt` | `sdkort.ts:406` kaller `trekkVerdener(...)` uten vrakvekt-argumentet, selv om signaturen (347-358) har det. BEKREFTET |
| 5 | koblingssjekken sier IKKE KOBLET | `analyse/koblingssjekk.txt`: `W2 kanal 2, vraket (K8)  219 valg  0 ulike  *** IKKE KOBLET ***`. BEKREFTET |

Og en sjette, funnet underveis: `vurderPar` (`src/moe2/sdpar.ts:275-283`) sender
eksplisitt `undefined` i vrakvekt-sporet til `trekkVerdener`. Det er DEN linja
som gjoer kanal 2 stum i helboten, siden `sik:` gaar gjennom `vurderPar` og ikke
gjennom `vurderSD`.

Dagens helbotspek bruker `sik:alle:0.5:48k32e3LMD~mlbu=...`. Kanal 2 er derfor
stum i alt vi maaler.

### Merknad om kravdokumentet

`AdamsMax.md:543` paastaar «Kanal 2 er koblet siden §117». Det er sant om
MAALERIGGEN (`examples/tro-noyaktighet.ts` og `examples/mlb-k8.ts` kaller
`monteTro(..., arm.vrakvekt)` direkte, og det er der +0,0046 nat ble maalt),
men usant om BOTEN. Linje 1106 i samme dokument foerer «kanal 2 naadde aldri
fram fra speken» som en kjent feilklasse. De to utsagnene beskriver hver sin
sti; maalestien var koblet, spillestien var det ikke.

## 2. Ledningen som ble lagt (13. sep)

Gren `kanal2-sik-2026-09-13`. Fire ledd, ett per fil:

| fil | endring |
|---|---|
| `src/moe2/agentspek.ts` | `sik:`-grenen leser `W<alfa>` fra soekefeltet, samme form som amu-grenen. Leses FOER `D`/`M`/`L` (de plukkes med `endsWith`, og W staar bakerst i «…LMDW2»); `indexOf` saa rekkefoelgen mot de andre knottene ikke spiller noen rolle. Trygt fordi `~<art>=<fil>` alt er skilt ut — en filsti er det eneste som kunne inneholdt en W. |
| `src/moe2/sikkerorakel.ts` | `SikkerOpts.vrakalfa` -> feltet `vrakvekt: {alfa, beta:0} \| null`, offentlig saa proevene kan BEVISE at speken er koblet. |
| `src/moe2/sdpar.ts` | `ParOpts.vrakvekt`, og den hardkodede `undefined` i `trekkVerdener`-kallet er erstattet. DETTE er selve fiksen. |
| `src/moe2/sdkort.ts` | `SDOpts.vrakvekt`, og `vurderSD` sender den videre — det leddet slapp ogsaa argumentet. |

`beta` (inversjonsstraffen) staar paa 0. Den er maalt og IKKE adoptert, og et
felt som bare kan settes fra spek-bokstaven kan ikke stille faa en verdi ingen
har maalt. Samme valg som `amu:`-grenen tok.

### Hvordan «av» er gjort til virkelig av

Naar alfa er 0 er noekkelen FRAVAERENDE i hvert opsjonsobjekt (`...(x > 0 ? {v} : {})`),
ikke satt til `{alfa: 0}`. Et nulledd i log-summen ville vaert matematisk det
samme, men ikke strukturelt: da er argumentet til `trekkVerdener` ikke lenger
`undefined`, og «bit-identisk» ville hvilt paa en flyttallsantakelse i stedet
for paa at koden gjoer noeyaktig som foer.

Typesjekk: `src` rent (eneste feil er `src/mlb/fargebytte.ts` TS6133, som er
eldre enn denne grenen og ikke roert her).

## 3. Proevene (13. sep) — alle seks groenne

`test/sik-kanal2.test.ts`, `node --test`:

| proeve | resultat |
|---|---|
| «W0» og ingen «W» gir NOEYAKTIG samme valg | **groenn** (26,2 s) — 0 avvik over 2 froe x 2 runder |
| speken bygger vekten, «W0» bygger INGEN | **groenn** — `vrakvekt` er `null` uten W og med W0, `{alfa:2,beta:0}` med W2 |
| «W» avviser tull | **groenn** — `W` uten tall og `W-1` kaster |
| K2: budvinnerens EGET sete | **groenn** — bingen tom, `vrakLogVekt` = 0 per konstruksjon |
| K2: de ANDRE setene | **groenn** — bingen har talongens stoerrelse, vekten fyrer, og den gjenskaper ALDRI det ekte vraket i alle verdener |
| kanal 2 er KOBLET i sik-stien | **groenn** (43,8 s) — «W2» flytter valg utenfor foerersetet, og **0 av N i budvinnerens eget sete** |

### Det viktigste av dem

**AV ER AV.** Den foerste raden er hele forutsetningen for at dette er en
ledningsjobb og ikke en ny bot: uten `W`, og med `W0`, er hvert eneste valg
uendret. Uten den raden ville ingen av K1-tallene under kunne leses.

### K2-asymmetrien holder, og den holder i BEGGE ender

Maalt paa vekten direkte: i budvinnerens sete er `vrakVerden` tom og
`vrakLogVekt` returnerer 0 per konstruksjon — hun kjenner sitt eget vrak, saa
`trekkVerden` setter `doedKapasitet = 0` og det finnes ingen doed binge aa
vekte. Maalt paa VALGENE: `W2` flyttet 0 valg i hennes sete og flere utenfor.

Dette er noeyaktig formen paa lekkasjen som en gang ble funnet i `medVerden`
(en soekende agent som saa budvinnerens ekte kort), og derfor staar den som
proeve og ikke som kommentar. Vekten leser `verden.vrakVerden` — de fire
kortene SAMPLEREN la i den innbilte verdenen — aldri `state.vrak`. Proeven
sjekker ogsaa eksplisitt at den gjettede bingen ikke gjenskaper det ekte
vraket hver gang; gjorde den det, saa sampleren fasiten.

## 4. Maalingene (paagaar)

- K1 uten W (dagens spek): startet 04:31, 4 kjerner.
- Koblingssjekk med sik-seksjon: paagaar.
- K1 med W2: koeet etter baseline (CPU-taket er 4 kjerner, iterasjon 8 eier resten).

### Er maalingen foelsom for CPU-last? Nei — sjekket, ikke antatt

Iterasjon 8 eier de fleste kjernene, saa spoersmaalet maatte stilles: kan
last endre botens VALG og dermed K1-tallet?

- `fristMs` (tidsbudsjettet i `Sikkerorakel`/`vurderPar`) settes ALDRI fra en
  spek — `grep frist src/moe2/agentspek.ts` gir null treff. Uten frist blir
  `klokke()` aldri konsultert paa en maate som kan kutte en verden.
- `t2000` i `eks:3Lt2000` er `maksKonfigurasjoner` (`delEksaktSpek`,
  `eksaktagent.ts:74-83`) — et TAK PAA KONFIGURASJONER, ikke millisekunder.
- De eneste `performance.now()` i botlagene (`eksaktagent.ts:133/144`,
  `juksagent.ts:96/99`) akkumulerer bare `msTotalt` i tellerne. De er
  regnskap, ikke inngang til noe valg.

Valgene er altsaa en ren funksjon av froe og stilling. Parringen holder selv
om de to armene kjoerer under ulik last.

### Preflight foer 30 minutters maaling

Begge spekstrengene bygger:
- UTEN: `...sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin...` -> OK
- MED:  `...sik:alle:0.5:48k32e3LMDW2~mlbu=e1-modell/tro-8.bin...` -> OK

`W2` staar etter `D` og foer `~`, noeyaktig der lesningen forventer den.

## 5. Regresjon: 42 av 42 groenne paa den EKSISTERENDE proevemassen

`node --test --test-concurrency=1` over `sik-tro`, `sik-okt`, `sik-eksaktblad`,
`sik-visningsfro`, `utrullet-sik-okt`, `agentspek-en-parser`, `amu-bitidentisk`:
**42 proever, 42 groenne, 0 roede** (80,8 s).

Dette er sterkere bevis for «av er av» enn min egen proeve alene, fordi det er
proever som ble skrevet FOER endringen og uten kjennskap til den:

- `amu-bitidentisk` er FASITLISTEN — kortvalg maalt 8. august og limt inn. Den
  feiler paa ethvert flyttet kortvalg, og den daekker `vurderSD`-stien jeg roerte
  i `sdkort.ts`. Groenn.
- `sik-eksaktblad`: «av (udefinert eller 0) er bit-identisk» — groenn.
- `sik-visningsfro`: «AV: instansens stroem gaar som foer over en hel sekvens» og
  «K2 FOR VALGET: et soekende Sikkerorakel velger likt i alle forenlige verdener» — groenne.
- `sik-tro`: «verden for verden gir noeyaktig verdiene fra den gamle loekka» — groenn.
- `utrullet-sik-okt` «PARITET» (26,5 s, levende hukommelse) — groenn.

Ingen av dem ser `W`. At de staar uendret er noeyaktig paastanden om at speker
uten `W` er den samme boten som i gaar.

## 6. Koblingssjekken reproduserer riggen foer de nye radene

De aatte foerste radene er identiske med `analyse/koblingssjekk.txt` fra 11. sep,
tall for tall (219 valg; 0, 0, 2, 15, 4, 9, 0, 12). Riggen maaler altsaa det
samme som den gjorde, og en endring i sik-radene under kan ikke forklares med at
selve sjekken har flyttet seg.

## 7. KOBLINGSSJEKKEN: W2 gir naa KOBLET (13. sep)

`node examples/koblingssjekk.ts > analyse/koblingssjekk-kanal2.txt`
(det gamle `analyse/koblingssjekk.txt` fra 11. sep staar uroert som referanse).

De ti foerste radene og de seks paaslagene er IDENTISKE med 11. sep, tall for
tall. Riggen har ikke flyttet seg; det eneste nye er sik-seksjonen.

```
PAASLAG (amu-stien, som foer):
  W2      kanal 2, vraket (K8)      219       0   *** IKKE KOBLET ***

SIK-STIEN (helbotens eget soek; basen er sik:alle:0.5:12k16MD):
  W2      kanal 2, vraket (K8)      219       9   KOBLET
  W1      kanal 2, halv alfa        219       5   KOBLET
  W0      kanal 2 AV (maa gi 0)     219       0   AV ER AV (0 forventet)
```

**Tre ting staar i de fire linjene.**

1. **`W2` er KOBLET i sik-stien.** 9 av 219 valg flytter seg. Foer i dag flyttet
   den 0, uansett spek.
2. **`W0` gir 0.** Nullpunktet holder ogsaa i den store speken, ikke bare i
   enhetsproeven. En rad som bare kan bekrefte er ingen rad, saa begge
   retningene staar i samme tabell.
3. **`amu:`-raden staar fortsatt paa 0, og det er RIKTIG.** `amu:foerer` er
   strukturelt stum: budvinneren kjenner sitt eget vrak. Nettopp derfor kunne
   den gamle tabellen aldri ha oppdaget at sik-stien manglet ledningen — den
   maalte en gren der kanal 2 ikke KAN fyre. Det er lesningen aa ta med videre:
   en knott kan vaere koblet i den ene grenen og doed i den andre, og en rad
   som maaler feil gren ser likt ut i begge tilfeller.

`W1` (5 av 219) endrer faerre valg enn `W2` (9), som forventet av en svakere
alfa — vekten er monoton i alfa, ikke en av/paa-bryter.

## 8. K1 UTEN W (grunnlinjen, dagens spek) — ferdig 13. sep

`node examples/mlb-krav.ts --spek "<dagens spek>" --bare k1 --kjerner 4 --ut analyse/kanal2-k1-uten`

```
MÅLT      ΔP(seier) bot − menneske +0,99 ± 0,19 pp per runde, z = 5,21
          (2641 runder i 273 kamper fra 2026-08-10)
          halvdeler +0,83 / +1,18 ; rundepoeng +1,26 ± 0,27
KONTROLL  menneskesiden identisk i begge armene: 2641 parret, 0 ulike   [OK]
FELLE     nevro i menneskets sete: ΔP −1,02 ± 0,20                      [TATT]
INNFRIDD  NEI   (porten er ≥ +1,0 pp OG z ≥ 3)
KOSTNAD   8832 s vegg, 29518 prosess-sekunder, 4 kjerner
```

Kontrollen og fella staar begge riktig vei, saa raden kan leses.

**MERK KOSTNADEN.** 2,5 TIMER vegg per arm paa 4 kjerner, ikke 15-35 minutter.
Anslaget i oppdraget var for lavt med en faktor ~5. Begge armene maa kjoere
etter hverandre (4-kjernetaket), saa den parrede maalingen er en ~5 timers jobb.

**MERK OGSAA HVOR GRUNNLINJEN LIGGER.** +0,99 ± 0,19 mot en port paa +1,0 —
boten ligger 0,01 pp under terskelen, altsaa godt innenfor én SE av aa lukke
K1. Det gjoer denne maalingen uvanlig godt egnet til aa se en liten effekt:
kanal 2 trenger ikke flytte mye for aa flytte DOMMEN. Men det skjaerer begge
veier — en tilfeldig svingning paa 0,2 pp gjoer ogsaa det, og derfor er det
den PARREDE differansen mot W2-armen som skal leses, ikke om «ja/nei» snur.

## 9. K1 MED W2, OG DEN PARREDE DIFFERANSEN — svaret

```
                    dP(seier) bot - menneske      dom
uten W (i dag)      +0,99 +/- 0,19 pp, z 5,21     NEI
med W2              +1,03 +/- 0,21 pp, z 5,00     JA
```

Dommen snudde. **Det er ikke resultatet, og det maa ikke leses som et.**
Porten er en TERSKEL paa +1,0 pp, og grunnlinjen laa 0,01 pp under den. Da
snur dommen paa en bevegelse som er en femdel av sin egen stoey. Begge armenes
SE er ~0,20; bevegelsen er 0,04.

Det tallet som skal leses er den PARREDE differansen. Armene er parret rad for
rad — samme froebaand, samme menneskedata, samme kort, samme poengtavler — saa
giv-effekten kansellerer, noeyaktig argumentet `sdpar.ts` selv hviler paa.
`analyse/kanal2-parret.mjs` (klyngebootstrap over kamper, B=20000, samme
estimator som `duplikat-dom.mjs`):

```
KONTROLL
  menneskesiden identisk i de to armene:  0 avvik av 2641   [OK]
  runder der BOTEN spilte ulikt:        676 av 2641 (25,6 %)

DIFFERANSEN (positiv = kanal 2 hjelper)
  dP(seier)   +0,038 +/- 0,085 pp per runde   z +0,45   (2641 runder, 273 kamper)
  rundepoeng  +0,047 +/- 0,124 per runde      z +0,38

BARE runder der boten spilte ulikt
  dP(seier)   +0,148 +/- 0,329 pp             z +0,45   (674 runder, 198 kamper)
```

**INGEN MAALBAR EFFEKT PAA K1.** +0,038 +/- 0,085, z = 0,45.

Parringen gjorde jobben sin: SE falt fra ~0,20 per arm til 0,085 paa
differansen, 2,4 ganger skarpere. Effekten er likevel ikke skilt fra null.

### Og dette er IKKE «ledningen naadde ikke fram» om igjen

**Boten spilte ulikt i 676 av 2641 runder — 25,6 %.** Kanal 2 er hoeylytt
koblet; den endrer en fjerdedel av alle runder i den hele boten. Den flytter
bare ikke utfallet. Det er en helt annen tilstand enn 11. sep, da den endret
0 av 219 valg.

Det er verdt aa merke seg som funn i seg selv: en slutning kan vaere den nest
sterkeste vi har PAA TROEN (+0,0046 nat, z = 10,8), naa fram til en fjerdedel
av rundene, og likevel ikke maales paa K1. Avstanden fra «bedre tro om hvor
kortene ligger» til «flere vunne runder» er stoerre enn troen alene antyder.

### W1 ble ikke maalt, og hvorfor

`W1` endrer FAERRE valg enn `W2` (5 mot 9 av 219 i koblingssjekken) — vekten er
monoton i alfa. Den parrede effekten av W1 er derfor noedvendigvis mindre enn
en effekt som alt ligger paa z = 0,45. Nok en arm koster 2,5 timer og kan ikke
endre konklusjonen. Ikke maalt, med vilje.

## 10. Konklusjon

| spoersmaal | svar |
|---|---|
| Er den koblet? | **JA.** 9 av 219 valg i koblingssjekken (var 0), 676 av 2641 runder i K1 (25,6 %). |
| Holder K2-asymmetrien? | **JA.** Vekten er 0 per konstruksjon i budvinnerens sete, maalt paa baade vekten og valgene. 42/42 eksisterende proever groenne. |
| Hva ble K1? | **+0,038 +/- 0,085 pp parret, z = 0,45. Ingen maalbar effekt.** Dommen flippet NEI->JA, men det er terskelstoey, ikke et funn. |

Anbefaling: ledningen boer BLI staaende koblet (den er riktig, den er gratis
naar av, og K2 holder), men `W` boer staa AV i produksjonsspeken inntil noen
kan vise en effekt. Aa slaa den paa fordi dommen flippet ville vaere aa adoptere
stoey — og det er den feilen prosjektet alt har gjort fem-seks ganger.
