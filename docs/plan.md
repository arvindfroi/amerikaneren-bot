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
| ~~trekk~~ | ~~v2 (340) med minneblokken~~ — **MÅLT SKADELIG, se under** |
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

To uavhengige mål, samme fortegn, p = 0,000 i spill: **minneblokken er ikke
nøytral, den er skadelig.** Historien bak den var god — budvinneren bør huske
sitt eget vrak — og det holdt ikke. Aksen strykes.

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

### Om noe ikke rekker

Da settes den delen ikke ut. En Adams med nye vekter og gamle bud er fortsatt
et framskritt; en Adams med et ubekreftet budnett er et eksperiment på
familien.
