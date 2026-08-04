# Planen: hvordan vi blir bedre enn menneskene og MesterAI

Skrevet 2026-08-02, etter en dag med målinger som flyttet flere premisser.
Erstatter `budplan.md` som hoveddokument; den står fortsatt for detaljene om
budet.

Arvinds mål, uendret: **slå familien.** MesterAI er mellomstasjonen.

---

## 1. Hvor vi står, målt

Alle tall er poeng per runde per sete, mot MesterAI på samme benk med
MesterAI låst til 40 verdener (så maskinlast ikke påvirker styrken):

| bot | mot MesterAI | n |
|---|---|---|
| NevroHjerne | −1,038 ± 0,137 | 249 |
| **`vakt:abmp:e1:sd-r2`** — dagens beste | **−0,273 ± 0,130** | 257 |
| samme + budmodellen | −0,218 ± 0,322 | 38 *(løper)* |

Og mot menneskene, fra 988 loggede runder på nettsiden:

| motstander | runder | differanse i menneskenes favør |
|---|---|---|
| PIMC/MAKS | 617 | **+3,35** |
| Nevro | 227 | **+3,60** |
| **vår beste bot** | 136 | **−0,04** |

**Vi har tatt igjen ~3,5 poeng per runde mot familien.** Kontraktprosenten gikk
fra 69–71 % til 80,1 %. Med SE på ±1,4 per spiller er «jevnt» her *ikke til å
skille*, ikke *bevist likt* — 136 runder er lite.

---

## 2. Hva som er avklart, og ikke skal prøves igjen

**Søk slår ikke nettet.** Fire uavhengige former, alle målt:

| form | resultat |
|---|---|
| dobbelt dummy, eksakt | −0,29 … −0,78, monotont verre med dybde |
| SD fra stikk 9 / 7 / 5 | −0,32 / −0,17 / +0,02 |
| ISMCTS mot MesterAI | trimmet snitt +0,03, tegntest p=0,29 |
| PIMC | målt verre |

Grunnen er ikke budsjett eller dybde: **nettet er nå bedre enn læreren sin**
(`lagstikk − SD` = +0,26 som spillefører), så et SD-søk erstatter en god policy
med en dårligere. Og DD løser feil spill.

To forklaringer jeg har brukt og som IKKE holder:
- *Strategifusjon* er ikke påvist her. Egen test, n=2665, kurven flat
  (+0,14 ± 0,19). Det opprinnelige funnet var støy fra n=50.
- *ISMCTS er uprøvd* — den er bygget og målt, og replikerte ikke.

**Regelåren er tynn, men ikke tom.** Kontekstjakten over 231 stillinger fant
ingenting signifikant. Men to regler ble funnet i dag ved å teste Arvinds egne
hypoteser med utfallsmålingen, og begge holdt. Forskjellen er at nøkkelen i
kontekstjakten er for grov til å uttrykke dem — den mangler stikknummer,
«tok jeg forrige stikk» og «har budvinneren spilt ennå».

**Amerikaner og solo skal aldri meldes.** 0 av 410 hender. Solo måler −101,9.

---

## 3. Målestokken, som ikke endres

Arvinds idé, og den som ga begge de bekreftede forbedringene i dag:

> **Mål på utfallet, ikke mot et orakel.** Legg kortet i den EKTE giva, spill
> runden ferdig, les av poengene.

Den slipper unna begge orakelfeilene: DD er målt skadelig å følge, SD er så
støyete at argmax over den blir vinnerens forbannelse. Og siden agentene er
deterministiske er hver differanse **eksakt** for den giva, ikke et estimat.

Kravene ellers: parret på giv, **disjunkte frøbånd** med tegntest over skard
(regel `m` var positiv i 10 av 10 — strengere enn 5,4 SE alene), og
poengdifferanse som måltall så det teller å holde motparten nede.

**Aldri adoptere på støy.** Tre av fire tiltak i dag ble forkastet på måling,
og to av mine egne tall ble trukket tilbake.

---

## 4. Rekkefølgen

### Nå: fullfør treningen
Alle seks aksene i oppsettet er riktige for første gang:

| akse | rettet i dag |
|---|---|
| trekk | v2 (340) med minneblokken — **nøytral**, ikke skadelig (retting 03.08) |
| kontrakter | spredt, ikke 92 % bud 9–10 |
| rollout-policy | `vakt:abmp`, ikke nevro |
| stillingskilde | nettet selv (DAgger), ikke nevro |
| rollevekt | 3× spillefører — den bærer 100 % av gapet |
| verdener | 12, det målte nivået |

### Minneblokken er forkastet, og det første nettet strøk utgangsprøven

Ablasjonen: to nett, samme 245 569 rader, samme holdout, samme form
512→384→256. Eneste forskjell er om kolonne 273–339 finnes. Så begge målt i
spill mot dagens vekter, 400 givere × 4 seter, friskt frøbånd 900 000.

| | holdout-anger | poeng/kamp | parret mot v1 |
|---|---|---|---|
| sd-r2 (dagens) | — | **+76,61 ± 0,07** | **+0,76 ± 0,05**, 326/394 |
| ablasjon-v1 (273) | 0,9693 | +75,85 ± 0,07 | — |
| ablasjon-v2 (340) | 0,9898 | +75,56 ± 0,07 | −0,29 ± 0,05, 141/388 |

**TRUKKET TILBAKE 2026-08-03.** Påstanden over var feil, og feilen var i
treneren: vektinitialiseringen var aldri seedet, så de to armene skilte seg på
startvekter i tillegg til trekkbredde — og vi kjørte n=1 av hver.

Kjørt på nytt med tre seedede frø per arm, målt i spill på 6 000 (giv, sete):

| frø | v1 | v2 | v2 − v1 |
|---|---|---|---|
| 11 | −0,572 | −0,508 | **+0,064** |
| 22 | −0,353 | −0,615 | −0,262 |
| 33 | −0,523 | −0,557 | −0,034 |

Ett frø favoriserer v2, to favoriserer v1. Og variasjonen INNENFOR v1 er
0,219 — nesten like stor som den største forskjellen mellom armene. Den
opprinnelige −0,27 er nøyaktig frø 22s flaks.

**Minneblokken er ikke skadelig. Den er ikke målbart noe.** Den kan bli
stående. Arvind pekte på feilen: «vrak og utetelling burde ikke være skadelig,
da er det noe annet som må være galt.»

Og dagens vekter slår begge de nye med 0,76 poeng, positivt i 326 av 394
givere. Det er ikke støy, og det er utgangsprøven i §4 som feiler.

**Hva det IKKE beviser:** at spredte kontrakter, DAgger-stillinger eller
rollevekten er feil. De nettene er trent på ~400 partier og overtilpasser fra
epoke 5 — treningsangeren faller til 0,59 mens holdout stiger, og gapet vokser
monotont. Det er en datamengdefeil, ikke en aksefeil. Minneblokken er den
eneste aksen som er isolert og felt.

**Den underliggende lærdommen:** vi har telt rader når statistikken lever på
partier. 255 000 rader, noen hundre partier, holdout på 14 av dem. Målet
«300 000 rader» er formulert i feil enhet.

De tre gjenstående aksene er fortsatt utestående. **Utgangsprøve:**
parret måling mot dagens nett på friskt frøbånd. `lagstikk − SD` skal ikke
falle på kontrakt 9–10 og skal stige på 7–8 og 11–12.

### Så: budmodellen avgjort
Den henter **+2,138 ± 0,090** mot nevro-byding, og 95 % av det er kontrakter
nevro **passer på** (verdt +8 hver). MesterAI byr 94 % likt med nevro.

Foreløpig mot MesterAI: −0,218 ± 0,322 på n=38, vinner budrunden 54 % mot
46 %. Aggresjonen overføres; om den blir poeng er uavklart.

**Utgangsprøve:** n ≥ 200 par. Holder halvparten av +2,14, går vi forbi
MesterAI (gapet er 0,273).

### Så: alpha-mu
Den eneste søkeformen utenfor mønsteret som har feilet fire ganger. DD, SD og
ISMCTS **midler** alle over verdener; alpha-mu holder en **Pareto-front av
vektorer** og midler ikke. Den er designet nettopp for PIMCs patologier i
stikkspill (Cazenave).

Byggeklossene finnes: DD-løseren, verdenssampleren, ekvivalensklassene i
`src/solver/eksakt.ts`.

**Utgangsprøve:** samme benk som SD-søket, `lagstikk` mot bare nettet. Blir den
negativ som de fire andre, er søk avsluttet som linje.

### Så: motstandermodellering
Vi spiller likt mot MesterAI, nevro og familien. Vi har **988 loggede runder**
med familiens faktiske spill som ligger ubrukt.

Og dette er ikke en detalj: målet er å slå *dem*, og mot en fast
motstanderpopulasjon er det maksimale et **beste svar**, ikke en likevekt. En
likevektsstrategi gir bevisst fra seg gevinst mot utnyttbare motstandere.

Budmodellen er alt et beste svar mot nevro-byding — +2,14 kommer av å utnytte
at motparten passer for mye. Det samme prinsippet på kortspillet er umålt.

### Parallelt: utplassering
Arvind: *«etterhvert må vi oppdatere nettsiden med modellen og se hvordan den
klarer seg mot mennesker. vi må også legge den i arena benk.»*

Arenabenken kjører alt (`budm:`-spec er lagt inn i `mesterai-h2h.ts`).
Nettsiden **venter til budmodellen har et tall mot MesterAI** — å sette den ut
mot familien før den er validert ville gjort dem til benken.

---

## 5. Prøvd, ikke prøvd

| | status |
|---|---|
| bayesiansk håndestimering | **✅ finnes** — `trekkVerdenBelief`, importance sampling med budrunden som likelihood. Svakhet: bare 3 kandidater, og likelihooden bruker ikke kortspillet |
| kortekvivalens / isomorfi | **✅ finnes** — `src/solver/eksakt.ts` enumererer konfigurasjoner og vekter dem, med DP-telling som kontroll. Men brukes bare der, ikke til å redusere forgrening generelt |
| nevrosymbolsk | **✅ er arkitekturen** — konvensjonsvakten er regelbasert abstraksjon utenpå et nett, og den er det som virker |
| ISMCTS | ✅ bygget og målt, replikerte ikke |
| **alpha-mu** | ❌ ikke prøvd — høyest prioritet av de uprøvde |
| **motstandermodellering** | ❌ ikke prøvd — dataene ligger klare |
| CFR i sluttspillet | ❌ ikke prøvd. Eneste form som gir randomiserte strategier |
| aktiv informasjonsinnhenting | ❌ ikke prøvd. Vi velger aldri et kort *for å lære noe* |

---

## 6. Åpne spørsmål jeg ikke har svar på

**Menneskekoeffisienten på +3,7** fra regresjonsbroen. Den ville betydd at
familien er over to poeng bedre enn boten, og det motsier at differansen mot
dagens bot er −0,04. Broens menneskerad er et *logget* utfall; hver botrad er
en *replay* fra nullstilt tilstand. Hele den asymmetrien lander på den ene
koeffisienten. Budregnestykket forklarer omtrent halvparten.

**Om kontraktbevisst spilleføring trenger separate hoder.** En spillefører på 8
og en på 11 skal spille kvalitativt ulikt. Ett nett med kontrakten som ett av
340 trekk lærer neppe to policyer. Fase 0 tester datasiden; om arkitekturen
holder er umålt.

**Hvor mye av budmodellens +2,14 som overlever mot en motstander som også byr
godt.** Det er fase 4 i `budplan.md` — iterert beste svar — og det er umålt.

---

## 6b. Natten 2. → 3. august: hva som ble avgjort

**ADAMS ER SATT UT.** `budm:bud-gbt.json : vakt:abmp : e1:ftf1.bin` ligger på
nettsiden fra 03.08. Alle tre lagene er målt hver for seg og adoptert etter
prosjektets egne krav. Val Town proxyer bundelen og budmodellen fra GitHub raw,
så framtidige utplasseringer bare er en commit — med fallback til den gamle
bundelen om GitHub svikter.

**Budmodellen passerte porten:** +0,618 ± 0,166 (3,7 SE) parret over 203 par,
trimmet snitt +0,545. Marginalt **+0,357 ± 0,129 mot MesterAI**, der `vakt:abmp`
ligger −0,268. Første gang noe vi har måler positivt mot Washington.

**Seks nye kortnett strøk gate 2**, og forklaringen er verken trekk,
arkitektur, frø eller rollout-policy:

| | rader |
|---|---|
| sd-r2 er trent på | **4 824 794** |
| alt vi rakk å generere | **410 645** (8,5 %) |

Det forklarer alle seks på én gang, og alle mine teorier om «ødelagte
etiketter» var feil spor.

**Finjustering løser det uten 19 timers generering, og den er ADOPTERT.**
`sd-tren.py --start` arver sd-r2s vekter og lar de nye radene justere dem.
Målt i spill mot sd-r2:

| frøbånd | ftf1 mot sd-r2 |
|---|---|
| 7,3 mill. | +0,206 ± 0,065 (3,2 SE), 1721/3117, p=0,000 |
| 9,1 mill. | +0,079 ± 0,067 (1,2 SE), 1740/3134, p=0,000 |
| 11,7 mill. | +0,123 ± 0,068 (1,8 SE), 1704/3174, p=0,000 |
| **samlet** | **+0,136 ± 0,038 (3,5 SE)** |

Positiv i 3 av 3 disjunkte bånd, tegntest p=0,000 i hver. Det første nye
kortnettet som slår sd-r2 i hele prosjektet.

**Læringsraten er en målt grense, ikke et valg.** Ved 3e-3 måler nettet
−0,171: det glemmer det gamle datagrunnlaget. Vendepunktet ligger rundt 1e-3.
Og `ftf1` har HØYERE hold-anger enn `ftf3` (0,8974 mot 0,8673) men spiller
bedre — anti-korrelasjonen mellom orakelanger og spillestyrke holdt hele
natten, så alle fire ble rangert i SPILL.

**Fasegapet har flyttet seg.** Spilleføringen er nå jevn med MesterAI (+8,45
mot +8,45 poeng per kontrakt). De to hullene som står igjen er makker (−86) og
**forsvar (−110)** — og forsvaret vårt er målt til **−0,051 ± 0,063** mot
NevroHjernes, altså ikke bedre.

**`--rollevekt 3` er kalibrert mot en død bot.** Den ble valgt da spilleføreren
bar 104 % av tapet. Den bærer 0 % nå. All videre generering bruker `1`.

### Feil i metoden som ble funnet og rettet

Alle av samme slag: de krasjer ikke, de rapporterer suksess.

| feil | virkning |
|---|---|
| `glob("skard-*")` | 143 491 av 174 414 rader usynlige for treneren |
| `numpy.resize` som vekst | masken fylt med gjenbrukt søppel |
| overlappende frøbånd | holdout-giv i treningen |
| **useedet vektinitialisering** | **ablasjoner målte ett frøs flaks** |
| **`FileShare.Read` i tellingen** | **overvåkingen drepte generatorene (EBUSY)** |
| `neat-evaluer` mot `grådig` | kortnett målt ved et bord vi aldri møter |

Den fjerde felte konklusjonen «minneblokken er skadelig». Kjørt på tre seedede
frø er den ikke målbart noe. **Trukket tilbake.**

---

## 6c. Mønsteret, med tolv datapunkter bak seg

Det tydeligste som kom ut av 2.–3. august er ikke et enkelttall, men en
sortering. Alt vi har prøvd faller i to bunker, og de har motsatt fortegn.

**Bedre ØYNE virker.** Å gi boten informasjon eller kalibrering den ikke hadde:

| tiltak | målt |
|---|---|
| budmodellen | **+0,618 ± 0,166** mot MesterAI |
| finjustering av kortnettet | **+0,146**, positiv i 4 av 4 frøbånd |
| vaktflagg `m` og `p` | +0,040 og +0,004 |
| telleblokken (v3) | uprøvd — genererer |

**Maskineri utenpå virker ikke.** Ti søkeforsøk og ni av elleve regelforsøk:

| | |
|---|---|
| DD-søk | −0,29 … −0,78 |
| SD fra stikk 9/7/5 | −0,32 / −0,17 / +0,02 |
| ISMCTS | replikerte ikke |
| eksakt enumerasjon | −0,017 … −0,778 |
| PIMC i kortspill | verre |
| **PIMC i VRAK/VELG** | **−0,256 ± 0,089** |
| `d`/`D`/`e`, `h`, `k`, `l` | alle negative eller null |
| ensembler av 31 nett | ikke målt bedre |
| PBS | regnbar bare der spillet er avgjort |

Arvind: *«man regner bedre hvis man har bedre øyne.»* Det er nøyaktig det
tallene sier, og rekkefølgen betyr noe: et regnestykke på feil premiss blir
bare presist feil.

**Og en advarsel som gjelder begge bunkene.** Sju tall ble målt to ganger i
døgnet, og oppdagelsestallet var oppblåst hver eneste gang:

| | oppdaget | replikert |
|---|---|---|
| minneblokken «skadelig» | −0,27 | −0,077 (ett frøs flaks) |
| finjustering `ftf1` | +0,206 | +0,136 poolet |
| fjerne flagg `a` | +0,017 | +0,005 |
| **rekalibrert budmodell** | **+0,061** | **−0,005** |

Ingenting adopteres på ett frøbånd. Ikke én gang har det holdt.

---

## 7. Adams på banen

**Adams er kodenavnet på boten vi bygger. MesterAI er Washington.** Navnet er
valgt: John Adams etterfulgte George Washington, og det er nøyaktig oppdraget.

Arvind: *«imorgen så vil jeg at Adams skal være på banen.»* Det betyr
utplassering — nettsiden og arenabenken — ikke en ny komponent.

### Hva som må stå før Adams settes ut

| krav | status | hvorfor det er et krav |
|---|---|---|
| kortnettet trent på spredte kontrakter + DAgger | **v2-aksen forkastet**; data samles videre | tre gjenstående defekter i dagens vekter |
| den nye vekten målt parret mot dagens | **STRØK: −0,76 ± 0,05, 326/394** | et nett kan bli verre; nå ni ganger |
| budmodellen har et MesterAI-tall | n=34 av 200 par | +2,14 er målt mot nevro-byding, ikke mot en som kan straffe overbud |

**Budtallet krympet da det ble målt riktig.** Den ad hoc-regnede differansen var på
dobbelt skala – `kandidatPoeng` er summen over BEGGE kandidatsetene. Rettet, og
med flere par:

| n par | budm − abmp | tegntest |
|---|---|---|
| 27 | +0,723 ± 0,330 (2,2 SE) | p = 0,44 |
| 34 | **+0,373 ± 0,414 (0,9 SE)** | p = 0,61 |

Halvert på syv par og ikke lenger til å skille fra null. Verktøyet er nå
`examples/h2h-parret.ts`, ikke et engangsregnestykke.

Og mekanismen er ikke den samme som mot nevro. Der kom 95 % av +2,14 fra å ta
kontrakter nevro **passet** på. Mot MesterAI vinner budm **færre** budrunder
(8,52 mot 8,63) og klarer flere (77,4 % mot 72,5 %). +2,14 er derfor ingen
spådom for denne benken.

### Tre defekter i treneren, funnet ved å røykteste før GPU-kjøringen

Alle tre er av samme slag: de krasjer ikke, de lyver.

| defekt | virkning |
|---|---|
| `glob("skard-*.jsonl")` | `sd-spredt/b-*.jsonl` – **143 491 av 174 414 rader** – var usynlige. «Fant ingen filer»-vakten tier så lenge ett mønstertreff finnes i mappen |
| telling før innlesing | skardene skriver mens treneren leser, så arrayene renner over. En «fiks» med `break` ville tapt de nyeste radene i stillhet |
| `numpy.resize` som vekst | fyller nye rader med gjentatt gammelt innhold, ikke nuller. `M` er en maske – søppel der slår på tapsledd for kort som aldri ble målt |

Den fjerde stoppet kjøringen som den skulle: **giv-lekkasje**. Generatorene ble
startet på overlappende frøbånd – sd-spredt 80–91 mill., sd-dagger 85–98 mill.,
58 givere felles – så fire holdout-givere lå i treningen via den andre mappen.
Holdout-tapet ville målt på stillinger nettet hadde sett. Rettingen kaster de
radene ut av treningen i stedet for å flytte dem inn i holdouten, fordi
holdouten må være nøyaktig samme utvalg for kandidater som ikke har sett alle
mappene.

**For neste generasjonsrunde: gi hver generator sitt eget frøbånd.** Overlappet
her var en ren oppstartsfeil fra min side, ikke noe ved metoden.

**Rekkefølgen er ikke forhandlingsbar, og grunnen er ikke forsiktighet.**
Familien er den eneste kilden vi har til menneskedata. Setter vi ut en
uvalidert Adams, bruker vi opp runder vi ikke får igjen på å måle noe vi ikke
vet hva er — og 136 runder mot dagens bot er allerede for lite til å skille
±1 poeng per runde.

### Det som utplasseres

Nettsiden bygger i dag `Konvensjonsvakt(E1Agent.fraBytes(bytes, {}), flagg)` —
altså nett + regler, ingen søk. Adams v1 er samme form med fire endringer:

1. ~~nye vekter~~ — **utgår.** De strøk utgangsprøven med −0,76. Adams v1
   bruker `sd-r2`, altså dagens vekter.
2. vaktflaggene `abmp` i stedet for `at` — `m` og `p` er målt i dag
3. budmodellen (`bud-gbt.json`) lagt utenpå, hvis MesterAI-tallet holder
4. ingen søk — fire former er målt, ingen slår nettet

**Adams v1 er da `vakt:abmp:e1:sd-r2`.** Punkt 2 alene er en ekte forbedring
over det som står ute nå (`vakt:at`): `m` måler +0,0404 ± 0,0075 og var
positiv i 10 av 10 disjunkte frøbånd, `p` +0,0039 ± 0,0010 i 9 av 10. Det er
mindre enn vi håpet i går, men det er målt, og det er mer enn null.

### Hva som går akkurat nå (3. august, ettermiddag)

**`sd-v4/` — auksjonsblokken.** 8 skard genererer 364-brede data i frøbåndet
260 M. `sd-v3` ble stoppet på 105 813 rader og er brukt opp (se under).

### Tre ting som ble oppdaget 3. august ettermiddag

**1. Nettet som spiller er v1.** `ftf1.bin` og `sd-r2.bin` har begge 273
innganger. Minneblokken (v2) er ALDRI tatt i bruk. Det betyr at en
`--start`-utvidelse til 356 legger på 83 nye kolonner, ikke 16 — minneblokk og
telleblokk som én pakke. Gate 2 på den ville ikke kunne si hvilken halvdel som
virket. `verktoy/sd-tren.py` fikk derfor et femte `--kjor`-ledd `a-b` som
nullstiller et kolonneintervall i en KOPI av dataen, så blokkene kan måles hver
for seg. Verifisert: den maskerte armen har `|W[:,273:340]| = 0.000000`.

**2. Telleblokken ga ingen gevinst på 105k rader.** Tre armer, samme rader,
samme holdout, samme init-frø — det eneste som skilte dem var hvilke kolonner
de så:

| arm | ser | hold-anger |
|---|---|---|
| `v3n` (kontroll) | ingenting nytt | **0,6380** |
| `v3k` | telleblokk | 0,6403 |
| `v3m` | minne + telling | 0,6412 |

Monotont dårligere jo mer informasjon. Det er mønsteret for at datamengden ikke
betaler for ekstra kapasitet — 105k rader mot de 4,8 mill. som ligger i `ftf1`.

**Gate 2 sa det samme** (n=1600, `analyse/telleblokk-gate2.txt`):

| arm | n | snitt | SE | σ |
|---|---|---|---|---|
| `ftf1` (KONTROLL) | 1600 | **+0,0000** | 0,0000 | — |
| `v3k` telleblokk | 1600 | +0,0062 | 0,1288 | +0,05 |
| `v3n` ingen ny info | 1600 | +0,0054 | 0,1266 | +0,04 |

Kontrollarmen måler eksakt 0,0000, så tabellen kan leses. Telleblokkens
isolerte bidrag er `v3k − v3n = +0,0008`. Med SE 0,13 ville alt over ~0,26
blitt sett — dette er et ekte null, ikke et knivsegg.

**Det viktigste tallet står i kontrollarmen.** `v3n` er ren ekstra finjustering
på 105k ferske rader, uten én ny informasjonskilde: **+0,005**. Finjusteringen
som LAGET `ftf1` ga **+0,136**, replikert i fire frøbånd. Avkastningen på mer
data av samme slag er i praksis uttømt.

### 4. Nullstillingen gjorde forsøket umulig — en ekte implementasjonsfeil

Arvind nektet å godta nullresultatet: *«det må være dårlig implementert, fordi
det skal funke.»* Det stemte, og feilen var aritmetisk:

| | |
|---|---|
| snitt \|vekt\| v1-kolonnene | 0,0895 |
| snitt \|vekt\| telleblokken | 0,0028 — **33× for små** |
| nye blokkers bidrag til lag 0 | **2,1 %** av v1s |

AdamW flytter hver vekt med omtrent `lr` per steg uansett gradient. Med 105k
rader er det ~104 batcher per epoke, og tidlig stopp kom på epoke 6:

- `625 steg × 7,5e-5 (cosinus-snitt) = 0,047` maksimal forflytning
- `0,0895` = skalaen de skulle nå

**Kolonnene kunne ikke komme fram.** Nullstillingen som gjør at nettet starter
identisk med startvekten — selve tryggheten i forsøket — gjorde det samtidig
umulig å vinne. Den forrige konklusjonen målte treneren, ikke trekket.

`--nyepoker`/`--nylr` retter det: en fase der BARE de nye kolonnene lærer, alt
annet frosset, så raten kan være høy uten at nettet kan glemme noe. Bidraget
gikk til 8,3 % (telling) og 17,4 % (minne+telling); vektene til 98,5 % av
riktig skala.

### 5. Med feilen ute svarer målingen fortsatt nei — men mønsteret peker et sted

| arm | bånd 900k | bånd 2,5M | trimmet |
|---|---|---|---|
| `w3m` minne+telling, 8 ep. | **+0,1631** | **−0,1654** | −0,0303 |
| `wm24` samme, 24 ep. | — | −0,2467 | −0,0192 |
| `wmm` minne alene, full skala | — | −0,3821 (−2,24 SE) | −0,0315 |

`w3m` slått sammen over begge bånd: **−0,001 ± 0,104**. Null. Åttende gang et
oppdagelsestall ikke replikerer — denne gangen snudde det fortegn.

**Men jo mer de nye kolonnene brukes, jo verre går det:**

| bidrag | resultat |
|---|---|
| 0,4 % | +0,006 |
| 8,3 % | −0,032 |
| 17,4 % | −0,165 |
| 24,4 % | −0,382 |

Det er signaturen til **overtilpasning**, ikke til ubrukelig informasjon. Ren
støy ville gitt null uansett vekt. 105 813 rader skal her bære 42 496 nye
vekter.

**Det er en testbar påstand, ikke en unnskyldning:** med flere rader skal
kurven flate ut og snu.

### 6. Overtilpasningsforklaringen var feil — og rollen avslørte den ekte feilen

Halvering av treningssettet endret ingenting: `wmmh` på 56 485 rader ga
**−0,3648 ± 0,1809** mot `wmm` på 105 813 raders **−0,3821 ± 0,1707**. Var
datamengden variabelen, skulle halvering gjort det klart verre.

Rolledekomponeringen sa hvor tapet lå:

| `wmm` | | |
|---|---|---|
| **fører** | **−1,4750 ± 0,5740 (−2,57 SE)** | hele tapet |
| forsvar | +0,0329 | |
| makker | −0,1191 | |

Spillefører er det **eneste** setet minneblokken bærer informasjon for — de
andre har nuller der. En blokk som skader presis det setet den informerer, er
ikke støy. Da er kodingen feil.

**Indeks 277–328 er 52 én-av-kolonner** som sier nøyaktig hvilke fire kort
føreren vraket. `C(52,4) = 270 725` kombinasjoner mot ~30k førerrader: nær unik
signatur per giver. Nettet memorerer giverspesifikke svar, og på en ny giver
bidrar de 52 kolonnene med en tilfeldig vektet sum rett inn i førerens logits.
Det forklarer også hvorfor mer data ikke hjalp — memorering av nær-unike
mønstre er ikke datamengdebegrenset her.

### 7. Minneblokken uten de 52 kolonnene — REPLIKERT POSITIV

`wred` beholder 273–276, 329–336, 337 og flaggene; bare 277–328 er maskert.

| frøbånd | n | snitt | SE |
|---|---|---|---|
| 2 500 000 (oppdagelse) | 1600 | +0,1788 | 0,1468 |
| 4 100 000 (replikering) | 4400 | +0,1642 | 0,0902 |
| **5 600 000 (andre replikering)** | 2800 | **−0,0602** | 0,1179 |
| **slått sammen** | **8800** | **+0,1001** | **0,0644 = 1,55 SE** |

**TRUKKET TILBAKE 3. august, senere samme dag.** Etter to bånd skrev jeg
«første gang et oppdagelsestall i dette prosjektet ikke krympet ved
replikering». Et tredje bånd motsier det: −0,0602, og totalen faller fra
2,19 til 1,55 SE. **`wred` er ikke etablert, og skal ikke settes ut.**

Verre for tolkningen: HVER rolle skifter fortegn mellom bånd.

| rolle | 2,5M | 4,1M | 5,6M | slått sammen |
|---|---|---|---|---|
| fører | +0,598 | +0,459 | **−0,312** | +0,268 ± 0,209 |
| makker | **−0,091** | +0,070 | +0,105 | +0,050 ± 0,030 |
| forsvar | +0,104 | +0,064 | **−0,017** | +0,045 ± 0,073 |

Førersetet har SE rundt 0,3–0,47 per bånd fordi førerutfall svinger mest. Med
n=400–1100 per bånd er «+0,60» og «−0,31» ikke i konflikt — de er begge
forenlige med null. Historien om at de 52 én-av-kolonnene skader føreren står
fortsatt (spranget −1,475 → +0,598 var 2,8 SE INNENFOR ett bånd, altså parret
på samme givere), men **at `wred` er en gevinst, er det ikke belegg for.**

Førersetet gikk fra **−1,4750 til +0,5984** — et sprang på +2,07 ± 0,74. Og i
replikeringen er **alle tre roller positive**, inkludert makker (+0,0703,
+1,67 SE) som er det største dokumenterte hullet (−0,22).

**Dette er første gang et oppdagelsestall i dette prosjektet ikke krympet ved
replikering.** De sju foregående gjorde det hver gang.

**Forbeholdet skal stå:** trimmet snitt er +0,0106 og tegntesten 615/594. Altså
er gevinsten konsentrert i givere med store utslag — i praksis førersetet. Her
er trimming trolig et dårlig kriterium: 5 % av hver hale er nettopp de giverne
der spillefører avgjør mye, så trimmingen fjerner signalet, ikke støyen. Og
poeng summeres over runder, så det er snittet som bestemmer i lengden.

Telleblokken hjelper fortsatt ikke: `wredt` (samme, men med telling synlig) ga
+0,0717 mot `wred`s +0,1788.

**Lærdommen som generaliserer:** høy kardinalitet i et trekk som bare ÉTT sete
ser, er en memoreringsfelle. Se alltid rolledekomponeringen — totalen skjulte
dette bak et snitt over fire seter.

**3. Auksjonen er et større hull enn tellingen — og generatoren ødela den.**
Fra hele budrunden kodet spillfasen bare hvem som vant (208–211), tallbudet
(225) og Amerikaner/solo. Hva de andre bød fantes ikke, selv om
`budrunde.sisteBud` ligger i staten hele spillet.

`examples/budhull.ts` målte det først, stratifisert på vinnerbudet så alle
forsvarerne i et stratum møter samme kontrakt:

| innen samme kontrakt, høyt eget bud minus lavt | effekt |
|---|---|
| **honnører på hånd** | **+0,288 ± 0,022 (13,3 SE)** |
| stikk faktisk tatt | +0,065 ± 0,026 (2,5 SE) |

Signalet om håndstyrke er sterkt og vokser med kontrakten (+0,026 ved vinnerbud
8, +0,275 ved 9, +0,477 ved 10). Omsetningen i stikk er nesten borte. **Den
sprekken kan målingen ikke lukke:** enten er informasjonen lite handlingsbar,
eller så er den handlingsbar og agenten klarte ikke bruke den fordi den ikke
kan se den. Gate 2 avgjør.

**FELLEN, funnet før to timers generering.** `--budspredning` tvinger
kontrakten ved å la ett sete by og PASSE de tre andre
(`examples/sd-orakel.ts:356`). Med 0,5 ville halvparten av radene vist «tre
passet med en gang» som et artefakt av generatoren, ikke av hendene. `sd-v4`
genereres derfor med `--budspredning 0`, og det er verifisert i dataen: 80 % av
rundene har alle fire bydd, 20 % har tre — som stemmer med de 94,9 % `budhull`
målte. Prisen er at kontraktsdekningen faller tilbake til den naturlige
fordelingen; det er en bevisst byttehandel for ÉN ærlig auksjon per rad.

En rikere variant finnes og er ikke prøvd: tving bare ÅPNINGSBUDET og la de
andre setene by naturlig oppå. Da beholdes både dekning og ekte auksjon.

**Ferdig og forkastet i dag:** rekalibrert budmodell (−0,005 ved replikering,
og −0,143 som spillefører). Feilspesifikasjonen er ekte — `bud-gbt.json` er
trent mot en spillefører som klarer 89 % av niere mens Adams klarer 85 % — men
å rette den gjør modellen mer forsiktig, og forsiktighet er feil retning.
Hele gevinsten kommer av å ta kontrakter motparten lar ligge.

### Køen, rangert etter målt hull

| | hull mot MesterAI | status |
|---|---|---|
| **makker** | **−0,22** | urørt. To regler verdt 0,007 til sammen |
| **forsvar** | **−0,12** | ingen regler. Forsvaret er målt likt NevroHjernes (−0,051 ± 0,063) |
| spillefører | jevnt (+8,45 mot +8,45) | ingenting uten noe kvalitativt nytt |
| budets μ/σ | taket usynlig herfra | rekalibrering prøvd og forkastet |

### Måleevnen er den ikke-tekniske flaskehalsen

Familiebenken har SD ≈ 9–11 poeng per runde. Det gir:

- **~400 runder** for å oppdage en effekt på 1,0
- **~1 600 runder** for 0,5

De 136 rundene som ga «−0,04» hadde SE rundt ±1,2. Det tallet kunne aldri
skilt en jevn bot fra en som er ett poeng bedre. **Å bevise overmenneskelig
spill krever flere runder, ikke bare en bedre bot** — og det er derfor
MesterAI-benken må bære dommen i mellomtiden.

### Om noe ikke rekker

Da settes den delen ikke ut. En Adams med nye vekter og gamle bud er fortsatt
et framskritt; en Adams med et ubekreftet budnett er et eksperiment på
familien.

## 8. Forsvar og makker — oppdraget, og hvor hullet faktisk er

### Arvinds krav, 3. august (skal stå som spesifikasjon, ikke parafrase)

**Forsvar.** Må bli veldig god til å **felle kontrakter** — både ved å jobbe
sammen med den andre forsvareren, og ved å **ta stikk selv** (det gir poeng).
Krevende.

**Makker.** Også vanskelig, men må bli mye bedre. Spiller stikkene sånn passe
allerede. Må kunne spille optimalt **rundt trumf og renonse**. Viktig: hvordan
man **sparer på kort og bruker kort optimalt**, og erkjenne at **budvinnerens
kort generelt er mer verdifulle**. **Lagstikk ligger i bunnen.**

**Tvers over.** Vraking og trumfvalg må være veldig bra — aldri hive ut trumf,
alltid ta det inn. Budet må justeres når spillet blir bedre. Og: blir vi veldig
gode i forsvar, kan det bli lønnsomt å **la motparten få kontrakter vi kan
felle**.

### «Aldri hiv ut trumf» — RETTET 3. august, det ER et hull

Vraking skjer FØR trumfvalg (`motor.ts`), så regelen er egentlig et krav om
kobling mellom to beslutninger. Adams tar dem uavhengig: `velgVrak` bruker et
nett hvis inngang (`byttTrekk`) ikke har trumf, og `velgTrumfOgEtterlys` velger
trumf av hånden som ble igjen. Likevel, målt over 2000 runder
(`examples/vraktrumf.ts`):

| | |
|---|---|
| runder der et vraket kort ble trumffargen | 36 (1,8 %) |
| trumfkort vraket totalt | **37 brudd** |

**MIN FØRSTE LESNING VAR FEIL OG ER TRUKKET.** Jeg rapporterte «ingen knekt
eller høyere» som om verdien på det vrakede trumfkortet gjorde bruddet mildere,
og konkluderte «ikke et hull». Arvind: *«jeg snakker ikke om knekt og høyere.
jeg snakker om å hive ut det som blir trumffarge. man hiver aldri ut der. ikke
en 2er engang.»* Regelen er absolutt. Da er alle 37 brudd, ikke null.

Kontrafaktualen i samme skript (+0,97 «stikk») skal fortsatt ignoreres —
`estimerStikk` belønner trumflengde, så enhver bytting som legger til et
trumfkort hever tallet uansett.

### VRAKDOKTRINEN (Arvind, 3. august) — spesifikasjon, ikke parafrase

1. **Trumf og vrak er ÉN beslutning.** «Trumfvalg skjer etter vrak, men det
   henger sammen, og vi bestemmer oss for det når vi har 16 kort og skal hive
   ut 4. Det er da vi tar de beslutningene.»
2. **Aldri vrak i fargen som blir trumf — ikke en toer engang.**
3. **Heller vrak en urelatert knekt, dame eller til og med konge** enn et lavt
   trumfkort.
4. **RENONSE ER MÅLET, og det er derfor en knekt kan ofres.** «Knekt kan jeg
   ofte hive pga jeg vil bli kvitt suits fordi renonse er bra for spillefører —
   da kan man bruke trumf.» Å vrake seg TOM i en farge er en gevinst i seg
   selv, ikke et tap av kortverdi.

**Hva det betyr for koden.** `velgVrak` scorer kort uten å vite hva trumfen
blir, og `besteTrumf` velger etterpå av det som ble igjen. Doktrinen krever det
motsatte: velg paret (trumf, vrak) sammen. Kandidatrommet er lite nok til å
enumereres — 4 trumffarger × C(16,4) = 7 280 par, og `estimerStikk` koster
ingenting. `src/moe2/eksperter/vrak.ts` gjør alt halve jobben (den fikser
trumfen av hånden som BLIR IGJEN), men den er ikke i det som spiller.

**Uprøvd og billig å måle før noe bygges:**
- Hvor ofte gjør vraket oss RENONSE i minst én farge?
- Hvor ofte etterlater vraket en singleton vi kunne blitt kvitt? (Å la ett kort
  stå igjen i en farge er etter doktrinen bortkastet — enten tøm den eller la
  den være.)
- Hvor ofte vraker vi ned i en farge uten å tømme den?

### Hvor ferdigheten faktisk mangler (`verktoy/forsvarsprofil.py`)

Målt som **fanget = (gulv − vår) / gulv**, der gulvet er angeren et tilfeldig
lovlig kort ville gitt i nøyaktig samme stilling. Det kontrollerer for
vanskelighetsgrad: et høyt angertall kan bety dårlig spill ELLER vanskelige
valg, og de krever motsatt handling.

| rolle | n | gulv | vår | **fanget** |
|---|---|---|---|---|
| spillefører | 31 796 | 2,0100 | 1,1414 | 0,432 |
| forsvar | 55 748 | 0,9130 | 0,5908 | 0,353 |
| **makker** | 25 350 | 0,3358 | 0,2477 | **0,262** |

Makker henter ut minst av tilgjengelig ferdighet — uavhengig bekreftelse på at
−0,22 mot MesterAI er det største hullet.

**Forsvaret dekomponert. Posisjon dominerer:**

| posisjon i stikket | n | fanget |
|---|---|---|
| **1. hånd (utspill)** | 7 190 | **0,208** |
| 2. hånd | 15 983 | 0,313 |
| 3. hånd | 16 187 | 0,398 |
| 4. hånd | 16 388 | 0,434 |

| | fanget |
|---|---|
| spillefører har alt lagt | 0,400 |
| **spillefører har IKKE lagt** | **0,244** |
| medforsvarer har alt lagt | 0,398 |
| medforsvarer har IKKE lagt | 0,331 |

**Og tidlig spill er langt verre enn sent:** stikk 0–4 ligger på 0,23–0,29,
stikk 10 på 0,830. Sent spill er nesten tvunget og lar seg regne ut; tidlig
spill krever en plan.

### Hva det peker på

Forsvarets hull er **utspillet og de første stikkene**, ikke sluttspillet.
Samspillet med medforsvareren er en ekte men mindre akse (0,398 mot 0,331) enn
posisjon (0,434 mot 0,208).

Det er også en advarsel mot søk som kur: PIMC ble prøvd i VRAK/VELG og strøk
med −0,256. Men søk i FORSVARETS TIDLIGE STIKK er aldri prøvd, og det er der
gulvet er høyest (1,20 i 1. hånd mot 0,87 i 4.) — altså der det er mest å hente.

## 9. Øyne-linjen er avsluttet på et velmålt nei (3. august, kveld)

Fem armer, nøyaktig samme 278 798 rader (`sd-v4`), samme holdout, samme
init-frø, samme 24 oppvarmingsepoker. Gate 2 på **n=8000** — prosjektets
største kjøring og beste oppløsning.

| blokk, isolert og parret mot kontrollarmen | bidrag | SE | σ |
|---|---|---|---|
| auksjon | +0,0453 | 0,0519 | +0,87 |
| telling | −0,0058 | 0,0460 | −0,13 |
| **alle tre sammen** | **−0,0777** | 0,0620 | −1,25 |
| kontroll (ren ekstra finjustering) | +0,0317 | 0,0649 | +0,49 |

Ingen når signifikans. Med SE ~0,05 utelukkes effekter over ~0,10 ved 2 SE.

**Datamengden var en ekte del av forklaringen, men ikke nok.** På 105k rader
var alle informasjonsarmer verre enn kontrollen på holdout; på 278k er to av
tre bedre. Retningen snudde. Poengene fulgte ikke etter.

**Kombinasjonen er verre enn delene** (−0,078 mot auksjonens +0,045). Arvinds
hypotese var at blokkene ville virke sammen; målingen peker motsatt vei.

**Det som står igjen fra linjen, og som er verdt mer enn resultatet:** to ekte
implementasjonsfeil ble funnet fordi Arvind nektet å godta nullresultatene —
oppvarmingen av nullstilte kolonner, og de 52 én-av-kolonnene som lærte nettet
runde-ID i stedet for spill (fører −1,475 → +0,598, 2,8 SE innenfor samme
bånd). Begge er generelle: **høy kardinalitet i et trekk som bare ÉTT sete ser,
er en memoreringsfelle**, og **nullstilte kolonner må varmes opp eller de kommer
aldri fram**.

### Køen etter dette, rangert etter målt styrke

| | signal | målt i poeng? |
|---|---|---|
| **makker: for gjerrig med honnør** | 7,5 % mot orakelets 23,1 % — **~19 SE** | nei |
| **makker: for ivrig etter stikk** | 6,0 % mot orakelets 16,1 % — **~5,4 SE** | nei |
| **forsvarets utspill** | fanget 0,208 mot 0,434 i 4. hånd | nei |
| vrak+trumf som ÉTT valg | 37 doktrinebrudd per 2 000 runder | nei |

Alle fire er sterkere signaler enn noe i øyne-linjen. **Benken kan nå skille
dem:** SE 0,05 parret ved n=8000, mot hull på 0,12–0,22. Prisen er ~40 min per
måling, og det er den reelle budsjettgrensen framover.

## 10. Orakelets tak — målt per rolle, og det er nådd

Arvind: *«hvor god er orakelet? vet vi at den er så god? hva er taket der?»*

Spørsmålet felte dagens sterkeste funn. Makkerdiagnosen hvilte på at orakelet
har rett i makkerstillinger — aldri vist. Godkjenningen var **aggregert**
(korrelasjon mot poeng, SD +0,718 mot DD −0,609), «12 verdener holder» var
aggregert, og rollout-policyen er NevroHjerne, boten vi slår med over ett poeng.

`src/moe2/rolleorakel.ts` + spekken `ork:<rolle>:<indre>`: orakelet spiller ÉN
rolle, `ftf1` alt annet. Frøbånd 9 900 000, n=2800. **Designet validerer seg
selv** — hver arm måler eksakt 0,0000 i rollene den ikke rører.

| orakelet spiller | n | effekt | SE | σ |
|---|---|---|---|---|
| spillefører | 700 | −0,3571 | 0,4427 | −0,81 |
| makker | 700 | −0,0781 | 0,0754 | −1,04 |
| forsvar | 1400 | −0,1529 | 0,1792 | −0,85 |
| **vektet til hele spillet** | | **−0,1852** | 0,1436 | −1,29 |

**Alle tre er negative.** Å følge orakelet er dårligere enn det nettet alt gjør,
i hver eneste rolle. Førertallet har riktig fortegn og størrelsesorden mot den
uavhengige +0,26 som alt sto i §2.

### Konsekvens 1: makkerdiagnosen er falt

De −15,6 pp og −10,1 pp måler at vi er **ulike** orakelet, ikke at vi tar feil.
Spiller orakelet makkerrollen selv, taper det 0,078. Å trene nettet *nærmere*
orakelet der — τ-sporet jeg foreslo — ville trolig gjort makkeren dårligere.
**Eksperimentet er avlyst.**

### Konsekvens 2: læreren er uttømt, og det forklarer hele dagen

| | |
|---|---|
| finjusteringen som LAGET `ftf1` | +0,136 |
| ekstra finjustering, 105k ferske rader | +0,005 |
| ekstra finjustering, 278k ferske rader | +0,032 |

Mer destillasjon gir mindre og mindre fordi **eleven har passert læreren**. Det
er ikke en datamengdefeil og ikke en trekkfeil — det er taket i metoden. Alle
tre trekk-blokkene i §9 ble målt mot nettopp dette taket, og det er derfor de
alle måler null.

### Hva som må til nå

Ikke flere trekk, ikke mer data av samme slag. **En bedre fasit.** I den
rekkefølgen de er billigst å prøve:

1. **Flere verdener, målt PER ROLLE.** «32 gir ikke mer enn 12» ble målt
   aggregert, og makkerstillinger har det minste spennet (gulv 0,336) — altså
   der samplingsstøy biter hardest. Samme `ork:`-benk, bare skru opp tallet.
2. **Bedre rollout-policy.** Orakelet spiller verdenene ferdig med NevroHjerne.
   Bytt til `vakt:abmp:e1` og se om taket løfter seg.
3. **Selvspill mot egen policy** i stedet for destillasjon fra et fast orakel —
   den strukturelle kuren når eleven har passert læreren.

Punkt 1 og 2 er timer, ikke dager, og bruker benken som alt er bygget.

## 11. Benken framover (Arvinds beslutning, 3. august)

*«jeg vil bevege meg vekk fra mesterAI benk fordi det tar for lang tid, og vi
har vel slått den.»*

**Gate 2 er arbeidsbenken.** SE 0,05 parret ved n=8000, minutter per måling.
MesterAI-benken brukes **én gang før noe settes ut**, som anker — ikke i løkka.

### Men «slått den» er ikke målt, og det skal stå

| måling | resultat | n |
|---|---|---|
| `vakt:abmp:e1:sd-r2` mot MesterAI | −0,273 ± 0,130 | 257 |
| samme + budmodellen | −0,218 ± 0,322 | **38** |
| budmodellens marginale bidrag | +0,357 ± 0,129 | — |

Legger man bidraget oppå, havner man rundt null til svakt positivt. Men det er
en **sammensetning av tre målinger**, ikke én måling. Den eneste direkte
målingen av hele Adams-stakken har n=38 og er ikke til å konkludere fra.
Sannsynligvis jevnt, muligens litt foran. **Ikke bevist slått.**

### Risikoen ved å bare bruke gate 2

Gate 2 måler forbedring **mot oss selv**. En bot kan bli bedre til å slå sin
egen forgjenger uten å bli bedre mot andre — særlig når kandidaten er finjustert
fra miljøet den måles mot. Derfor ankeret før utplassering.

### Feil i min egen orakelmåling, funnet 3. august kveld

`ork:`-benken i §10 brukte **NevroHjerne** som rollout-policy. Men `sd-v4` ble
generert med `--motpart vakt:abmp:e1:ftf1.bin`. Jeg målte altså et **svakere
orakel enn det som faktisk lager fasiten**, og konklusjonen «orakelet er
uttømt» kan være et artefakt av det. Spekken er rettet til
`ork:<rolle>:<verdener>:<indre>` der `indre` ER rollout-policyen, og §10 må
leses med det forbeholdet til den nye målingen er inne.


## 12. Orakelet var ikke uttømt — det var feilspesifisert (3. august, sen kveld)

`ork:`-benken i §10 brukte **NevroHjerne** som rollout-policy, mens `sd-v4` ble
generert med `--motpart vakt:abmp:e1:ftf1.bin`. Jeg målte altså et svakere
orakel enn det som lager fasiten, og konkluderte «uttømt» på det.

Kjørt på nytt med `indre` som rollout-policy, samme frøbånd, n=2800:

| orakelet spiller | feil policy (nevro) | **korrekt policy (oss)** |
|---|---|---|
| **spillefører** | −0,357 | **+0,896 ± 0,418 (+2,14 SE)** |
| makker | −0,078 | +0,009 ± 0,082 |
| forsvar | −0,153 | −0,130 ± 0,171 |

Førersetet svinger **+1,25** bare av å rette hvem orakelet forestiller seg
sitter ved bordet. Totalt per runde **+0,2240 ± 0,1047**, tegntest **205/145**
(z = 3,2). Trimmet snitt er +0,0079, altså drevet av store utslag — men to av
tre kriterier peker samme vei, og det er første gang tegntesten er klart
positiv.

**Mekanismen er ren:** `vurderSD` lar motparten spille verdenene ferdig i ALLE
seter. Er den modellen svakere enn bordet, undervurderes systematisk de linjene
som krever god oppfølging — og spillefører er nettopp setet som har flest slike
linjer å planlegge. Med riktig modell blir evalueringen korrekt spesifisert.

**Hva det betyr:** ett-plys framoverblikk ER en fungerende forbedringsoperator
for spillefører. Da er selvspill farbart, og §9s «øyne-linjen er avsluttet» må
leses om: de fem armene ble alle destillert fra et feilspesifisert orakel.

**Ikke adoptert.** +2,14 SE er et oppdagelsestall, og åtte av dem har krympet i
dag. Replikering kjører i frøbånd 14 400 000 med 900 givere × 6, sammen med to
akser: 24 verdener, og `sik:`-operatoren som bare overstyrer når den parrede
marginen overstiger støyen.

## 13. Køen etter 3. august, med begrunnelse

### 13.1 Søk er IKKE avgjort — de ti forsøkene delte en feilkobling

`ork:`-benken viste at rollout-policyen er alt: førersetet gikk fra **−0,357
til +0,896** bare av å bytte hvem orakelet forestiller seg spiller resten.

De ti søkeforsøkene i §2 brukte enten:

- **DD inne i hver verden** (`src/bot/bot.ts` løser eksakt) — og DD er målt til
  korrelasjon **−0,609** mot poeng, avvist gjennom godkjenningsporten, eller
- **SD med NevroHjerne som utspiller** — `sdagent.ts` sier det selv: *«Til nå
  har det alltid vært NevroHjerne»*.

**Ingen av dem testet søk med korrekt spesifisert utspilling.** «Søk er
avsluttet som linje» hviler derfor på ti målinger som alle hadde feil modell av
hvordan hånden ville bli spilt ferdig. Skal linjen lukkes, må den lukkes på
nytt.

### 13.2 Vrak og trumfvalg — urørt, og den dyreste beslutningen

`E1Agent` sender VRAK og VELG til `estimerStikk`, en håndlagd formel, i BEGGE
armer av hver måling gjort til nå. Fasedelingen på D1 målte trumfvalget til
**32,4 ± 3,0 poeng per kamp** — den dyreste enkeltbeslutningen i spillet.

Og Arvinds vrakdoktrin (§8) er ikke implementert: trumf og vrak skal velges som
ÉN beslutning med 16 kort på hånd. Kandidatrommet er `4 × C(16,4) = 7 280` par
— lite nok til å enumereres eksakt. `src/moe2/eksperter/vrak.ts` gjør allerede
halve jobben (fikser trumfen av hånden som BLIR IGJEN), men den er ikke i det
som spiller.

### 13.3 Motstandermodellering over runder (Arvinds design, 4. august)

> *«det skal skje over mange runder med samme motstander. at den adapterer
> gjennom mange runder for å bli bedre med/mot de andre. byr de høyt eller
> lavt, hvordan spiller de ut. jeg ser for meg at den husker hvor lang
> trumfserie du hadde siste gangene du bød 9, og tar det i betraktning når den
> gjetter hva hånden din er nå.»*

**Kroken finnes allerede.** `src/solver/sampler.ts` har `trekkVerdenBelief`,
som vekter samplede verdener etter `budForenlighet` — men den er en HÅNDLAGD
BEFOLKNINGSFORMEL: «bud n ⇒ forvent styrke rundt X». Den vet ikke *hvem* som
bød. Å bytte den mot en lært, per-motstander-tabell er hele tiltaket, og det
rører ingenting annet.

**Fasiten er gratis og perfekt.** Når en runde er ferdig, er alle kort spilt —
altså er HELE giva kjent i ettertid. For hver runde kan vi derfor logge, per
spiller: hva de bød, og hva de faktisk hadde (trumflengde i egen lengste farge,
honnører, fordeling). Det er et fullverdig veiledet signal uten noen ekstra
kostnad.

**Estimatoren må krympe mot befolkningen.** Etter tre runder mot en ny
motstander finnes det ikke nok observasjoner til et individuelt anslag. Riktig
form er derfor et krympingsestimat: start på befolkningssnittet (dagens
`budForenlighet`), og flytt mot individet i takt med antall observasjoner. Da
kan modellen slås på fra første runde uten å skade.

**Hvorfor dette er den riktige linjen, og ikke bare en til:** målet er å slå
FAMILIEN, ikke å finne en likevekt. Mot en fast motstanderpopulasjon er det
maksimale et **beste svar**. Budmodellen er allerede et beste svar mot passiv
byding — de +2,138 kommer av å utnytte at motparten passer for mye. Vi har
**988 loggede runder** med familiens faktiske spill som ligger ubrukt.

**Rekkefølge:** (1) logg giv + bud per spiller ved rundeslutt, (2) bygg
krympingsestimatoren, (3) bytt `budForenlighet` mot den, (4) mål med `ork:`- og
`sik:`-benkene, som allerede finnes.

### 13.4 Budet og kortspillet er aldri ko-optimert

Budmodellen er verdt **+1,072 i situ** (§ lagdekomponering) og er trent mot en
FAST kortspiller. Blir kortnettet bedre på bud 10, bør budmodellen by
annerledes — og omvendt. De to er halvparten av boten hver, og de er aldri
optimert sammen.

### 13.5 Alt må kunne destilleres

`ork:foerer` koster sekunder per trekk. Nettsiden kjører i nettleseren og kan
ikke søke. **En gevinst som ikke lar seg destillere inn i vektene er en gevinst
familien aldri møter.** Enhver søkebasert forbedring må derfor ha et
destillasjonssteg i planen fra starten, ikke som et etterpåheng.

## 14. FØRERORAKELET REPLIKERTE — og ble sterkere (3./4. august)

| bånd | snitt | SE |
|---|---|---|
| 11 100 000 | +0,2240 | 0,1047 |
| 14 400 000 (disjunkt) | +0,2330 | 0,0917 |
| **slått sammen, n=6400** | **+0,2291** | **0,0690 = 3,32 SE** |

**Første gang i dette prosjektet et oppdagelsestall ikke krympet**, og det sies
etter TO bånd, ikke ett.

| arm | totalt | fører | tegntest |
|---|---|---|---|
| `ork:foerer:12` | +0,2330 ± 0,0917 | +0,932 | 269/179 — 60,0 %, z = 4,3 |
| **`ork:foerer:24`** | **+0,4141 ± 0,0936** | **+1,656** | **286/148 — 65,9 %, z = 6,6** |
| `sik:foerer:1.5:12` | +0,1108 ± 0,0484 | +0,443 | 72/26 — **73,5 %**, z = 4,6 |

**Å doble verdenene nesten dobler gevinsten.** Det motsier «32 verdener gir
ingenting utover 12» — som ble målt AGGREGERT, ikke per rolle.

**Konfidensterskelen virker som designet:** griper inn i 98 av 434 givere, men
treffer i 73,5 % av dem. Halv effekt, minste feilmargin av alle tre.

Trimmet snitt er lite (+0,009), men medianforskjellen ER null fordi agentene
ofte velger likt. Tegntesten er riktig statistikk her, og z = 6,6 er ingen
haleeffekt.

### 14.1 ROLLESTYRT DESTILLASJON — Arvinds krav, og en designkonsekvens

> *«det bør destilleres der vi vet den spiller bedre, men hvis vi er bedre
> andre plasser som i forsvar/makker, så bevarer vi det.»*

Orakelet med korrekt rollout-policy, per rolle:

| rolle | orakelet mot nettet |
|---|---|
| **spillefører** | **+1,656** (24 verdener) |
| makker | +0,009 |
| **forsvar** | **−0,130** |

Destillerer vi fra orakelet i ALLE roller, lærer nettet bort forsvarsspillet
sitt. Treningen må derfor ha to slags rader:

- **førerrader → orakelets etiketter.** Der er læreren beviselig bedre.
- **makker- og forsvarsrader → NETTETS EGNE valg som mål.** Et anker, ikke en
  lærer. Uten det kan finjusteringen drive de rollene selv om ingen rad ber om
  det — vektene er delte.

Warm start alene er ikke nok: den setter startpunktet, ikke retningen.

### 14.2 `sd-v7` genererer nå, med ALT som er rettet i dag

| akse | verdi | hvorfor |
|---|---|---|
| bredde | 428 (v6) | plan- og troblokken med |
| verdener | **24** | +0,414 mot 12-verdeners +0,233 |
| stillingskilde | `budm:bud-gbt.json:vakt:abmp:e1:ftf1` | bud 10 er 47 % av det Adams spiller, 24 % av det den var trent på |
| rollout-policy | `vakt:abmp:e1:ftf1` | den feilen kostet −1,25 i førersetet |
| budspredning | 0 | ekte auksjoner, ellers er v4-blokken et generatorartefakt |
| rollevekt | 5 | føreren er der læreren har noe å lære bort |
| frøbånd | 280 M | disjunkt fra alt |

### 14.3 Rangerte mangler, per 4. august

| # | mangel | målt innsats | status |
|---|---|---|---|
| 1 | **vrak + trumfvalg som ÉN beslutning** | trumfvalg 32,4 ± 3,0 poeng/kamp | urørt, håndlagd formel i begge armer |
| 2 | **søk i vrak/velg med korrekt rollout** | ti forsøk, alle feilspesifisert | må gjøres om |
| 3 | **motstandermodellering over runder** | 988 loggede familierunder ubrukt | krok finnes (`trekkVerdenBelief`) |
| 4 | **destillasjon av `ork:foerer:24`** | +0,414/runde | `sd-v7` genererer |
| 5 | **bud × kortspill ko-optimering** | hver ~halve boten | aldri gjort |
| 6 | **forsvarets utspill** | fanget 0,208 mot 0,434 i 4. hånd | uprøvd |
| 7 | makkerens mål | differanse gjør makker lunken (7 mot 18 ved bud 9) | design, ikke feil |
| 8 | vaktene | +0,024 ± 0,060 med alt annet på | kandidat for FJERNING |

## 15. Adams-v1 mot familien — første tall, 3. august

| bot | runder | menneskets differanse | SE | tegn (menneske/bot) |
|---|---|---|---|---|
| **Adams-v1** | 107 | **−1,813** | 1,113 | 42 / **65** |
| forrige bot | 1 065 | **+2,798** | 0,324 | 652 / 413 |

Sete 0 er mennesket (`web/app.ts: const MENNESKE = 0`), så negativt betyr at
boten vinner. **Adams slår mennesket med 1,81 per runde; forgjengeren tapte med
2,80.** Et sprang på **4,61 poeng per runde**.

**Forbeholdet:** SE ±1,11 på 107 runder, altså 1,63 SE — ikke signifikant
alene. Tegntesten (65/42, z = 2,2) er sterkere. Det som overbeviser er avstanden
til forgjengeren, som ER solid målt (1 065 runder, SE 0,32). Og tallet gjelder
ÉN motstander, ikke hele familien.

## 16. Hva som går inn i botens vurdering — og de sju hullene

### Det som spiller i dag (`ftf1`, 273 trekk)

| indeks | hva |
|---|---|
| 0–51 | egen hånd |
| 52–103 | alle spilte kort — **uten hvem som spilte dem** |
| 104–155 | kortene på bordet nå |
| 156–207 | det etterlyste kortet, hvis ikke lagt |
| 208–219 | budvinner, utspiller, makker (relativt) |
| 220–227 | trumf, vinnerbud, amerikaner, er jeg på budlaget |
| 228–237 | stikk spilt/egne/lagets, poengandeler, stikk per sete, solo |
| 238–245 | egen fargefordeling, spilte kort per farge (summert) |
| 246–261 | renonse per sete × farge — **binært** |
| 262–272 | høyeste ute, antall ute, stikk igjen, har utspillet, bias |

### Bygget natt til 4. august, ikke satt ut

| blokk | trekk | legger til |
|---|---|---|
| v2 minne | 273–339 | budvinnerens vrak |
| v3 telling | 340–355 | antall per sete × farge |
| v4 auksjon | 356–363 | hva hvert sete bød |
| v5 plan | 364–375 | mangler, sikret, tapt, slakk |
| v6 tro | 376–427 | ytterpunkter spilt per sete × farge, **øvre grense** |
| v7 verdi | 428–457 | sikre stikk, sikre tapere, **tvingning** |

### DE SJU HULLENE SOM FORTSATT STÅR

1. **Hvilke SPESIFIKKE kort hvert sete har spilt.** v6 gir ytterpunktene.
   Full tilordning er 4 × 52 = 208 trekk — eneste eksakte koding, og dyr.
2. **Rekkefølgen i stikket.** Vi ser hva som ligger, ikke i hvilken orden.
   «Andre hånd lavt, tredje hånd høyt» er signaler som ikke finnes i kodingen.
3. **Budsekvensen**, ikke bare sluttbudet per sete. Hvem åpnet, hvem hoppet,
   hvem ga seg først — borte.
4. **Forsvarernes side av talongen.** v2 dekker budvinneren. Forsvarerne vet at
   fire kort er døde, men ikke hvilke — og at budvinneren VET det. Asymmetrien
   er ukodet.
5. **Motstandermodell over runder.** Ingenting. Kroken (`trekkVerdenBelief`)
   står ubrukt. Se §13.3.
6. **KAMPSITUASJONEN.** 231–232 gir poengandeler mot 100, men ikke «hvem kan
   vinne KAMPEN denne runden». Nær 100 endrer det optimal risiko fullstendig —
   å felle lederen kan være verdt mer enn egne poeng. **Undervurdert:** de andre
   hullene er informasjon om hånden; dette er informasjon om hva som er verdt å
   gjøre. En bot som spiller likt på 20–20–20–20 og på 95–40–40–40 spiller feil
   i minst én av dem, og familien spiller alltid til 100.
7. **Hvem som får utspillet neste stikk.** Utledbart, men ikke eksplisitt — og
   det styrer hele planleggingen.

## 17. Vrak+trumf som ett valg — på hylla, med en forklaring som gjelder bredt

Frøbånd 19 900 000, n=3600, mot `ftf1`:

| arm | totalt | SE | σ | tegn |
|---|---|---|---|---|
| `vv:12` | +0,0758 | 0,1038 | +0,73 | 207/212 |
| `vv:24` | +0,1889 | 0,1040 | +1,82 | 212/198 |

Skalerer med verdener som førerorakelet, men tegntesten er jevn (z = 0,69) mot
førerorakelets z = 6,6. **Ikke etablert. På hylla, ikke forkastet.**

**FORKLARINGEN GJELDER MER ENN DETTE FORSØKET.** Ved vrak er ingenting spilt
ennå, så verdensrommet er på sitt aller største og 24 utvalg er nesten
ingenting. Førerorakelet virker fordi det står midt i runden, der hvert spilt
kort og hver renonse har skåret bort muligheter.

> **Verdien av samplet søk vokser når verdensrommet krymper. De tidligste
> beslutningene er de vanskeligste å søke i.**

Det forklarer også hvorfor de ti tidligere søkeforsøkene i VRAK/VELG feilet, og
det peker på hva som må til for å lykkes der: enten mange flere verdener, eller
en bedre prior over hva motparten har — altså **motstandermodellen** (§13.3),
som er nettopp et middel til å krympe verdensrommet.

**Tre ting som ikke er utelukket her:** kandidatgenereringen er doktrinstyrt og
prøver ~6 vrak per trumffarge, ikke alle C(16,4); verdenstallet er ikke drevet
høyere enn 24; og `estimerStikk` kan allerede være nær optimal.

### Ordbruk rettet, 4. august

Arvind: *«ikke gi opp på konsepter, men du kan legge de på hylla.»* Planen har
brukt «forkastet» om ting som er målt mot enten et feilspesifisert orakel eller
en ødelagt trener. Det er for hardt. **Telleblokken, minneblokken, de ni
regelforsøkene og de ti søkeforsøkene er UTESTÅENDE, ikke døde** — alle ble
målt før 3. august, da rollout-policyen og oppvarmingen ble rettet.

## 18. Planblokken konverterer ikke — og mønsteret er nå entydig

Frøbånd 21 200 000, n=6000:

| | mot `ftf1` | isolert mot kontrollarmen `p5n` |
|---|---|---|
| `p5p` plan | +0,0826 ± 0,0776 | **−0,0187 ± 0,0707** |
| `p5alt` alle blokker | +0,0841 ± 0,0837 | −0,0172 ± 0,0777 |
| `p5n` ingen ny info | +0,1013 ± 0,0746 | — |

Kontrollarmen er BEST. Planblokken hadde 4× viktigheten til noen annen ny
blokk (kryssindeksen) og gir null i poeng. Skjermen er nå bekreftet to ganger:
**høy viktighet i fordelingen ≠ gevinst utenfor den.**

### Fem blokker, samme svar

| blokk | isolert bidrag |
|---|---|
| v2 minne | +0,100 ± 0,064 (tre bånd, fortegnsskifte) |
| v3 telling | −0,006 ± 0,046 |
| v4 auksjon | +0,045 ± 0,052 |
| v5 plan | −0,019 ± 0,071 |
| v6 tro / v7 verdi | ikke målt ennå (`sd-v7`) |

### DEN VIKTIGSTE KONKLUSJONEN I HELE ØKTA

Fem blokker med ny informasjon eller nytt regnestykke: **alle null.**
Ett-plys framoverblikk med korrekt rollout-policy: **+0,414, z = 6,6.**

> **Flaskehalsen er ikke hva nettet kan SE. Den er hva nettet kan REGNE UT.**

Avledede trekk (plan, verdi) hjelper ikke, fordi de er funksjoner av det nettet
allerede ser — et nett med 500 000 parametre kan regne dem selv. Ny informasjon
(minne, telling, auksjon) hjelper ikke, fordi nettet allerede henter ut det
datamengden tillater.

Men et framoverblikk er ikke en ny inngang — det er en ny BEREGNING, og det er
den eneste som har betalt.

**Det setter ikke blokkene på båten**, det setter dem på hylla: alle fem ble
målt på data generert med 12 verdener og uten budmodell i stillingskilden.
`sd-v7` retter begge. Men prioren er nå svak, og maskintiden bør gå til søk.

## 19. Hva kan optimeres 100 % matematisk — målt svar

Arvind spurte hvilke deler av spillet som lar seg optimere eksakt.
`examples/verdensrom.ts` teller forenlige verdener per stikk, 120 runder:

| stikk | median forenlige verdener | andel under 100k |
|---|---|---|
| 0 | 3,8 × 10¹⁴ | 0 % |
| 5 | 4,2 × 10⁹ | 0 % |
| 7 | 1,1 × 10⁷ | 11 % |
| 8 | 2,5 × 10⁵ | 40 % |
| **9** | **6 300** | **92 %** |
| **10** | **130** | **100 %** |
| 11 | 5 | 100 % |

**Uttømmende enumerering er råd fra stikk 9, triviell fra stikk 10.**

### Og det er nøyaktig der vi allerede spiller godt

Forsvarsprofilen (`verktoy/forsvarsprofil.py`) målte `fanget`:

| stikk | fanget |
|---|---|
| 0–4 | 0,23 – 0,29 |
| 9 | 0,662 |
| 10 | **0,830** |

**Eksaktheten er tilgjengelig presis der den trengs minst.** Der vi er svake —
de fire første stikkene — er rommet 10⁹ til 10¹⁴ verdener, altså håpløst.

Det forklarer `eksaktagent`s −0,29 … −0,78: den løser eksakt i sluttspillet, der
det ikke er mye å hente, og faller tilbake på dobbelt-dummy der det er.

**Linjen lukkes, og den lukkes med et tall.** Ikke fordi eksakt regning er feil,
men fordi den bare er tilgjengelig i den delen av spillet vi alt behersker.

Det eneste som kan flytte den grensen, er en bedre PRIOR over hva motparten har
— altså motstandermodellen (§13.3). Den krymper ikke rommet matematisk, men den
gjør at få samplede verdener bærer mer. Samme konklusjon som §17 nådde fra en
annen kant.

## 20. DESTILLASJONEN VIRKER — og rollestyringen var feil

Frøbånd 23 500 000, n=6000, mot `ftf1`. Alle tre armene er destillert fra
`sd-v7`: 544 573 rader, 24-verdeners orakel, korrekt rollout-policy,
budmodellen som stillingskilde.

| arm | totalt | SE | σ | trimmet | tegn |
|---|---|---|---|---|---|
| **`d7alle`** lærer overalt | **+0,2264** | 0,0826 | **+2,74** | +0,0186 | 987/920 |
| `d7a` rollestyrt | −0,0554 | 0,0860 | −0,64 | −0,0532 | 1013/1260 |
| `d7b` rollestyrt + blokker | −0,0541 | 0,0899 | −0,60 | −0,0985 | 1115/1437 |

### `d7alle` per rolle

| rolle | effekt | σ |
|---|---|---|
| fører | +0,3889 | +1,48 |
| makker | −0,0369 | −0,89 |
| **forsvar** | **+0,2768** | **+2,81** |

### FEILEN, OG DEN ER PRINSIPIELL

Jeg sluttet fra **«orakelet SPILLER dårlig i forsvar» (−0,130, `ork:`-benken)**
til **«orakelet LÆRER BORT dårlig i forsvar»**. Det er to helt ulike ting:

- **Å spille** orakelets valg er `argmax` over 12 støyete verdener. Støyen
  treffer hver eneste beslutning. Atferdsmålingen viste at orakelet var SIKKERT
  i bare 1,3 % av uenighetene.
- **Å lære av** orakelets verdier lar nettet midle over tusenvis av liknende
  stillinger. Støyen kanselleres.

> **Destillasjon er en støydemper. En dårlig spiller kan være en god lærer.**

Det forklarer også hvorfor ankeret SKADET: `d7a`s makker måler −0,1911
(−3,72 SE). Selvdestillasjon mot startnettets egne logits er et langt svakere
signal enn orakelets verdier, så ankeret erstattet god læring med ingen læring.

Arvinds prinsipp — bevar der vi er bedre — var riktig. Jeg brukte feil måling
til å avgjøre HVOR, og `ork:`-benken svarer på et annet spørsmål enn den jeg
stilte den.

**IKKE ADOPTERT ENNÅ.** +2,74 SE på ett bånd, med tegntest 987/920 (z = 1,53)
og trimmet +0,019. Replikering kjører i frøbånd 25 800 000 med n=8000.

## 21. Motstandermodellen har data allerede — målt 4. august

Arvind: *«jeg ser for meg at den husker hvor lang trumfserie du hadde siste
gangene du bød 9.»*

**DATAEN FANTES, og det var ikke åpenbart.** Val Town-loggen har ingen hender —
men den har HVERT kortvalg mennesket gjør, og kortene et menneske spiller ER
hånden. 1 172 runder har nøyaktig 12 `valg-kort`, altså en fullstendig hånd.

Den ene komplikasjonen: er mennesket budvinner, tok det opp talongen og vraket
fire, så de spilte kortene er ikke den utdelte hånden. Derfor brukes bare
runder der mennesket IKKE vant budet — 768 av dem.

| bud | runder | lengste farge | honnører | ess |
|---|---|---|---|---|
| passet | 298 | 4,40 | 1,27 | 0,60 |
| bød 7 | 161 | 4,32 | 1,18 | 0,47 |
| bød 8 | 226 | 4,51 | 1,79 | 0,87 |
| **bød 9** | 67 | **5,00** | **2,31** | **1,24** |

**Signalet er sterkt og er nøyaktig det Arvind beskrev.** Bud 9 mot bud 7:
+0,68 i lengste farge, **+1,13 honnører (≈ 7,5 SE)**, +0,77 ess.

**OG EN TING TIL SOM ER BRUKBAR VED BORDET:** å passe og å by 7 ser helt like
ut (1,27 mot 1,18 honnører). Informasjonen ligger i de HØYE budene; de lave
skiller ikke mellom «svak hånd» og «forsiktig spiller».

### Hva som gjenstår for å ta det i bruk

1. `budForenlighet` i `src/solver/sampler.ts` er i dag en HÅNDLAGD
   befolkningsformel som ikke vet hvem som bød. Den skal byttes mot disse
   målte tallene.
2. Krympingsestimator: start på befolkningstallene over, flytt mot individet
   etter antall observasjoner. Da kan modellen stå på fra runde 1.
3. Per spiller er tallene tilgjengelige i samme logg — navnene ligger BARE i
   Val Town-basen og skal aldri i dette repoet.

**Hvorfor dette er den riktige linjen:** både §17 (vrakvelgeren feilet fordi
verdensrommet er størst tidlig) og §19 (eksakthet er bare råd fra stikk 9)
ender samme sted — det som mangler er en bedre PRIOR over hva motparten har.
Dette er den prioren, og den er målt.
