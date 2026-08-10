# MLB — planen (revisjon 2)

> **REVIDERT 9. august etter ekstern gjennomgang.** Tre ting holdt ikke, og to av
> dem kunne ikke rettes etterpå. Revisjonen ligger i `docs/mlb-revisjon.md`;
> endringene er arbeidet inn under. De opprinnelige feilene står igjen som
> merknader, fordi de er lærdommen.

**Formålet: lage Adams Max UTEN å trene med en mester eller et orakel.**

Arvind, 9. august: «lag en plan og revider den. så får du en agent til å revidere
den også kommer vi i gang.»

---

## 0. Hva «uten mester eller orakel» utelukker

Dette er den bindende betingelsen, og den er skarpere enn den ser ut. Den
utelukker tre ting vi bruker i dag:

| forbudt | hvorfor det er et orakel |
|---|---|
| `sd-orakel`-korpuset | et SD-søk merket hver stilling. Hele `d7alle` er trent på det |
| DD-fasit som etikett | dobbeltdummy ser alle hender |
| «policy = søkets valg» | søket er en sterkere lærer enn nettet — en mester |

**Og det utelukker å starte fra E1.** `d7alle` ER orakelets kunnskap i vektform.
Initialiserer vi fra den, kan vi aldri påstå at resultatet er orakelfritt.

### REVISJON: forbudet var ikke håndhevbart, og lakk fem steder

Utkastet forbød orakelet i GRADIENTEN og slapp det inn gjennom INNGANGENE og
LIGAEN. Funnet ved lesning:

| snikvei | hvor |
|---|---|
| `vrakrang.bin` | laget av `vrakorakel.ts`, 60 verdener per kandidat — «policy = søkets valg», lagret som fil |
| budmodellens `μ` som TREKK | `hand-tren.py`: fasiten er «SD-orakelets lagstikk» |
| `rask` i ligaen | inneholder både `vrakrang.bin` og `d7alle` |
| stiliserte vaner | `lagTrumftrekker(spek)` er en kappe utenpå hele Adams-stakken |
| `d7alle` i det hele tatt | orakeltrent |

**En orakeletikett som INNGANG er strengere enn E1-initialisering** — den kan
aldri trenes bort.

> **AVGJØRELSE 1b (ny): herkomstregelen.**
>
> *Ingen gradient og ingen INNGANG skal avhenge av `sd-orakel`, dobbeltdummy
> eller `d7alle`. MÅLINGER kan.*
>
> `rask` flyttes ut av treningsligaen og inn i målestokken — den er referansen
> MLB skal slå, ikke en motstander den skal lære av. Stiliserte vaner bygges på
> en MLB-epoke eller en ren regelagent. `μ`, `σ` og `vrakrang` ut av
> trekkmengden. `test/mlb-herkomst.test.ts` håndhever importgrensen, så den ikke
> kan brytes ved et uhell.

> **AVGJØRELSE 1: MLB starter fra tilfeldige vekter.**
>
> Kostnaden er reell — selvspill fra null i et firespillerspill med imperfekt
> informasjon er tregt. Men alternativet er å bygge Adams Max på en påstand vi
> ikke kan forsvare. Vi kjører i tillegg E1-initialisering som en SIDEARM, bare
> for å vite hvor mye starten var verdt.

**Det som IKKE er et orakel**, og som derfor er lov:

- **rundens faktiske poeng** — det er utfallet, ikke en dom
- **hvor kortene faktisk lå**, kjent ved rundeslutt — fasit om fortiden
- **reglene** (`lovligeKort`, `regler.ts`) — det er spillet, ikke en mening
- **søket som SPILLEKOMPONENT** i sanntid — det tenker, men det underviser ikke

Grensen er: *lærer nettet av noe som er sterkere enn det selv?* Da er det en
mester. Lærer det av **hva som skjedde**, er det selvtrening.

---

## 0b. De to beslutningene, tatt 9. august

Arvind: «det er sykt vanskelig å velge. jeg vil jo ha visjonen til Adams max, og
bryr meg ikke nødvendigvis over hvordan vi får den, men jeg vil få den etter
idéen. for min del så kan det være en black box som spiller spillet slik jeg ser
for meg at Adams skal gjøre.»

Da er begge mine, og begge følger av visjonen — ikke av teknikken.

### AVGJØRELSE 6: ingen privilegert kritiker

Revisjonen foreslo et verdihode som under trening ser alle fire hender. Det
ville kuttet variansen, og det er ikke en «mester» i vanlig forstand.

**Men ånden i «uten mester» er at boten blir sterk AV SEG SELV**, ikke ved å bli
formet av noe den aldri kan se. En kritiker med privilegert syn verdsetter
stillinger på måter aktøren ikke kan handle på — en kjent felle i seg selv.

Verdihodet ser derfor **bare lovlig informasjon**, akkurat som policyen. TD med
en vanlig kritiker er standard og virker. Blir variansen en reell sperre, kommer
vi tilbake med en MÅLING, ikke med en antakelse.

Bieffekt: `spillerVisning`-garantien gjelder da hele nettet, ikke bare halve.
K2 blir enklere å håndheve, ikke vanskeligere.

### AVGJØRELSE 7: prøvene måler KVALITETEN, ikke mekanismen

Revisjonen fant at K3, K4-B og K7 krever ordrett «et søk eller en løser» og
«gevinsten ved M=2». Et rent nett kan da aldri innfri dem, uansett hvor godt det
spiller.

**Det er min feil i formuleringen av prøvene.** Arvinds krav var:

> «spille optimalt med SOTA komponenter i alle faser» · «evnen til å planlegge
> framover» · «finne matematisk optimale løsninger i sluttspillet»

Det er KVALITETER. Jeg oversatte dem til MEKANISMER, og låste dermed en
arkitektur han uttrykkelig ikke bryr seg om.

Prøvene skrives om:

| krav | før (mekanisme) | nå (kvalitet) |
|---|---|---|
| K3 | «beslutningen tas av et søk eller en løser» | avstanden til fasens tak |
| K4-B | «gevinsten ved M=2 mot M=1» | spiller den ULIKT når et framtidig eget valg står på spill? |
| K7 | «100 % samsvar med løseren» | avstanden til sluttspillets tak (+0,947 ved fem stikk i dag) |

Takene er allerede målt med klarsyn og uavhengig av mekanisme, så tallene er
sammenlignbare på tvers av arkitekturer.

**Og det fjerner den siste «trent ≠ utrullet»-risikoen:** ingenting legges oppå
etterpå. Det som trenes er det som spiller.

---

## 1. Faser

### Fase 0a — TROHODET ALENE. ✅ KJØRT 9. august, og hypotesen holdt.

> **REVISJON: dette manglet helt, og det er den beste delen av planen.**

> **RESULTAT (§119).** Trohodet trent alene, veiledet, på 2,45 M rader fra
> `spillerVisning` og etiketten «hvor kortene faktisk lå»:
>
> | arm | log-tap | % av veien gulv → tak |
> |---|---|---|
> | gulv+ | 1,0347 | 5,82 % |
> | dagens beste (`bayes+W`, V=64) | 1,0506 | 4,37 % |
> | **MLB-trohodet** | **0,9630** | **12,34 %** |
>
> `+0,0875 ± 0,0020` mot dagens beste (z = +44,3), `+0,0717 ± 0,0016` mot
> `gulv+`, replikert i to disjunkte frøbånd. Første arm som slår `gulv+`.
> Nettet lærte i tillegg Arvinds egen slutningskjede uten at noen kodet den:
> P(kortet er dødt) faller fra 26,2 % for en toer til 0,48 % for et ess, og
> modellen treffer kalibreringen på hver rang.
>
> **OG DEN VIKTIGSTE MÅLINGEN: troen er MOTSTANDERSPESIFIKK.** Mot
> `nevro`-stillinger, som nettet ikke er trent på, faller det til 5,09 % og slår
> **ikke** `gulv+`. Trent på `nevro` og målt på `nevro`: **16,43 %**. Metoden
> overføres, vektene ikke. Det binder fase 0a til ligaen — trohodet må trenes på
> befolkningen det spiller mot, og trenes om når den flytter seg. I ligaen er det
> gratis, for stillingene finnes allerede og etiketten er fasit om fortiden.
>
> Filer: `src/mlb/trotrekk.ts`, `src/mlb/tronett.ts`,
> `examples/mlb-trodata.ts`, `verktoy/mlb-tro-tren.py`, `examples/mlb-k8.ts`,
> `analyse/mlb-k8-dom.mjs`, `test/mlb-k2-tro.test.ts`,
> `test/mlb-herkomst.test.ts`. Hele kjeden er en drøy time maskintid.
>
> **Fase 0.1 og 0.4 er dermed delvis bygd**, og K2-garantien er håndhevet med
> en bit-identitetsprøve som har en kontroll som kan feile.

Før én time brukes på policyen: **tren trohodet alene, veiledet, og kjør
K8-prøven.**

- perfekte etiketter (hvor kortene faktisk lå)
- ingen liga, ingen kredittilordning, ingen utforskning
- ingen mester — fasit om fortiden er ikke en dom

Og §117 gir gevinsten på forhånd: dagens tro taper **0,0211 mot `gulv+`
utelukkende på Monte-Carlo-oppløsning** (Jensen-straff på variansen). **Et nett
har ingen slik straff.** K8 står i dag på 4,20 % av veien gulv → tak.

Det er den eneste delen av MLB som kan gi et **falsifiserbart svar på én dag** i
stedet for i uke fire — og samtidig den som mest sannsynlig flytter et krav fra
nei til ja.

Går den ikke, har vi lært noe stort for én dag. Går den, har vi K8 og en
sanseblokk resten av planen kan bygge på.

### Fase 0 — grunnmuren (kode, ingen trening)

| # | hva | fil |
|---|---|---|
| 0.1 | **Trekkbygger** fra `spillerVisning` alene — K2 strukturelt | `src/mlb/trekk.ts` |
| 0.2 | **Hukommelsen**: mikro/meso/makro per motstander, bokført ved rundeslutt | `src/mlb/hukommelse.ts` |
| 0.3 | **Handlingsrom** med maske per fase (bud, vrak, velg, spill) | `src/mlb/handling.ts` |
| 0.4 | **Nettet**: felles kropp + policy/verdi/tro | `src/mlb/nett.ts` |
| 0.5 | **Selvspilløkke** + erfaringsbuffer | `src/mlb/selvspill.ts` |
| 0.6 | **Ligaen** + porten mellom epoker | `src/mlb/liga.ts` |

### Fase 1 — fornuftssjekk (før én time med trening)

- et TILFELDIG nett spiller lovlig i 1000 kamper uten å krasje
- **K2-prøven passerer** på det tilfeldige nettet
- trekkbyggeren er bevist blind for skjulte kort — bytt ut de skjulte hendene og
  krev bit-identisk trekkvektor
- verdihodet lærer noe trivielt (f.eks. «hvor mange stikk har laget tatt»)
- én epoke kjører ende til ende på en time

### Fase 2 — ligaen. ✅ FØRSTE TI EPOKER KJØRT 10. august (§123).

> **RESULTAT (§123).** Epokedriveren finnes (`verktoy/mlb-epoke.py`), og ti
> epoker à 5 000 kamper er kjørt på 5,35 timer. Mot de tre TESTVANENE — fast
> referanse, argmaks, 600 giv parret på kortene:
>
> | | epoke 0 (tilfeldig) | epoke 10 |
> |---|---|---|
> | poeng | −279,7 | **+22,8** |
> | seiersandel | 2,8 % | **43,0 %** (fair share er 25 %) |
> | `amerikaner`/`solo` | 8,49 % | **0,00 %** |
> | verdihodets forklarte varians | −0,30 | **+0,14** |
> | tro-CE | 1,491 | 1,218 |
>
> Porten godkjente 6 av 10, kontrollarmen traff 0,0000 hver gang, og K2 var
> grønn 20 av 20 på epokenes EGNE vekter. **Kurven beveger seg.**
>
> To ting måtte rettes underveis, og begge er skrevet ut i §123: TD alene
> (AVGJØRELSE 3) drev policyen mot MER `amerikaner`/`solo` fordi verdihodet
> ennå forklarte −0,97 av variansen — rettet med GAE(λ), der λ = 1 er
> «faktisk minus ventet» og λ = 0 er TD-en AVGJØRELSE 3 vil ha tilbake når
> verdihodet duger. Og `−A·log π` er ubundet: første ti-epokersløp saturerte
> policyen på FØRSTE gradientsteg, og porten adopterte den saturerte
> konstanten to ganger. Rettet med PPO-klipp, KL-brems og en logitvakt.
>
> **`rask` er fortsatt ikke målt mot**, så avbruddskriteriets punkt 2 er
> uavgjort. Det er neste steg.

```
for hver epoke:
    spill N kamper mot befolkningen
    tren policy (utfall), verdi (poeng), tro (fasit)
    K2-prøven MÅ passere
    port: slår den et PANEL av tidligere epoker, parret, over 2 SE,
          MED tegntest og kontrollarm, replikert i disjunkt frøbånd?
    ellers: forkast, og prøv med flere kamper
```

> **REVISJON: porten min brøt prosjektets egen adopsjonsregel.** «Over 2 SE»
> uten replikering, tegntest og kontrollarm er nøyaktig fella §65 og §109 falt i
> — og her skulle den brukes titalls ganger. Den porter dessuten mot ETT panel,
> ikke bare forrige epoke: ligaspill er intransitivt, så A kan slå B som slår C
> som slår A.

### Fase 3 — kravene

Kjør alle åtte prøvene. **Utgangsbetingelsen er at de passerer**, ikke at tapet
flater ut.

---

## 2. Læringssignalet, presist

**Verdi** ← KAMPENS utfall, ikke rundens.

> **REVISJON, og den var alvorlig:** utkastet skrev «rundens faktiske poeng».
> Da får makrotrekkene — kampstillingen, hukommelsen over løpet, racepresset —
> **eksakt null gradient**. Det er nøyaktig den strukturelle blindheten gate 2
> har, den som felte `r0.4` og gjør `kamp1.5` umålbar der.
>
> **K5 kunne aldri blitt lært.** Uansett antall epoker.
>
> Episoden er derfor KAMPEN. Rundens poeng er en delbelønning underveis, ikke
> målet.

**Tro** ← hvor hvert usett kort faktisk lå. Ren klassifikasjon, fasit.

**Policy** ← fordelen. Og HER lå det første alvorlige hullet i utkastet mitt.

### Kredittproblemet, som utkastet gikk rett forbi

En runde har ~12 kortvalg og ett utfall. Skriver vi `A = rundens poeng −
verdianslaget` og bruker samme `A` på alle tolv valgene, får det ene gode
kortet og de elleve likegyldige nøyaktig samme forsterkning. Da lærer nettet
korrelasjon, ikke årsak — og i et spill der ett kort avgjør kontrakten er det
meste av variansen ikke vår fortjeneste i det hele tatt.

Målt i dette prosjektet: da versjonene ble sammenlignet på identiske kort,
skilte de lag i **9,4 % av valgene**, og når de gjorde det svingte utfallet
**11,6 poeng i snitt**. Det er signal-til-støy-forholdet policyen skal lære fra.

**Løsningen er TD, ikke sluttutfallet:**

    A(s, a)  =  r  +  V(s')  −  V(s)

der `s'` er neste stilling DENNE agenten står i, og `r` er poengene som falt
imellom. Verdihodet bærer da alt som skjer etterpå, og fordelen måler bare det
DETTE valget flyttet.

Det er fortsatt ren selvtrening: `V` er lært av faktiske utfall, ikke av en
lærer. Men variansen faller dramatisk, og krediten havner på handlingen som
faktisk flyttet noe.

> **AVGJØRELSE 3: TD med verdihodet som grunnlinje, ikke sluttutfall på alle
> handlinger.** Uten den tror jeg ikke treningen konvergerer i det hele tatt.

### Utforskning — det andre hullet

Et nett som spiller sin egen argmax i selvspill ser aldri noe annet enn det den
alt tror. Da kan den ikke oppdage at noe bedre finnes, og ligaen fryser.

Under selvspill **trekkes handlingen fra policyen**, ikke argmax, med en
entropibonus i tapet som holder fordelingen fra å kollapse. Under MÅLING spilles
argmax — ellers kan ikke to armer parres.

> **AVGJØRELSE 4: samplet handling i trening, argmax i måling.** Parringen i
> alle benkene våre forutsetter determinisme.

### Og ingen mester noe sted

> **AVGJØRELSE 2: ingen «policy = søkets valg».** Det er den ene snarveien som
> ville gjort dette til ekspert-iterasjon, og den er utelukket av formålet.

---

## 3. Ligaen

| motstander | andel | hvorfor |
|---|---|---|
| nåværende beste | 40 % | driver framgangen |
| tidligere epoker | 30 % | hindrer at vi glemmer |
| `rask` | 15 % | den beste stakken i matrisen i dag — ingen stråmann |
| **stiliserte vaner** | 15 % | uten dem finnes ingen vane å utnytte, og K6 kan ikke innfris |

Den siste raden er en KRAV-avhengighet, ikke en detalj: koblingssjekken målte
0 av 657 mot fire like agenter. *Ingenting å lære er ikke det samme som ikke å
kunne lære.*

---

## 4. Agentene

> **REVISJON: rekkefølgen min var feil.** Jeg skrev at A og B er uavhengige.
> De er de ikke — hukommelsen (B) DEFINERER omtrent 84 av trekkene som A skal
> sette sammen. Riktig rekkefølge er **B → A → C**.

| agent | eier | avhenger av |
|---|---|---|
| **B** | `src/mlb/hukommelse.ts` — hva som bokføres, per nivå | — |
| **A** | `src/mlb/trekk.ts` + K2-garantien | B |
| **C** | `src/mlb/nett.ts` + `selvspill.ts` | A |
| **D** | `src/mlb/liga.ts` + målerigg + herkomsttesten | — |

D er uavhengig av alle tre og kan gå parallelt fra start.

Ingen agent rører `src/moe2/`, `src/e1/` eller `web/`. Dagens bot skal fortsatt
virke og fortsatt være målbar.

---

## 5. Det som må låses før første kamp genereres

- [ ] **trekklayout** — antall og rekkefølge. Ett trekk lagt til senere gjør
      hele erfaringsbufferet ubrukelig
- [ ] **handlingsrommets indeksering** — det samme
- [ ] **hva hukommelsen bokfører**, og at den BARE ser ferdigspilte runder
- [ ] **holdout-frøbånd** avsatt før første kamp
- [ ] **hvem som sitter i ligaen** ved epoke 0

---

## 5a. Bufferet lagrer KAMPER, ikke trekkvektorer

> **REVISJON:** utkastet ville fryse trekklayouten før første kamp, fordi
> bufferet skulle inneholde ferdige trekkvektorer. Det er 17–67 GB per epoke —
> og låsen var min tyngste selvpålagte begrensning.
>
> Lagrer vi i stedet `(frø, handlingslogg, hvem som satt hvor)`, er en epoke
> **~36 MB**, og kampen kan spilles om igjen deterministisk. Da kan trekklayouten
> ENDRES senere uten at noe blir ubrukelig: vi bygger trekkene på nytt fra
> kampen.
>
> Låsen forsvinner. Det er den enkleste og største forenklingen i hele
> revisjonen.

---

## 5b. Størrelsesorden — hva dette faktisk koster

Grovt, med dagens maskin (24 kjerner):

| | anslag |
|---|---|
| kamp, rent nett (~1 400 beslutninger × 0,5 ms) | ~2 s |
| kamp MED `amu` som trekk (138 ms/beslutning) | **~193 s** |
| kamper per epoke | 5 000–20 000 |
| epoketid, 20 skard | **10–40 min spilling** |
| trening per epoke (GPU) | minutter |
| epoker til noe kan leses | titalls |

> **REVISJON: mine to dokumenter motsa hverandre.** `mlb.md` sa at et søk per
> beslutning er 100× for dyrt; `sandkassen.md` bestilte likevel `amu` som TREKK.
> Med søket inne blir én epoke på 5 000 kamper **~268 kjernetimer**, ikke 10–40
> minutter.
>
> **AVGJØRELSE 5 (ny): søket er IKKE et trekk under trening.** Det er en
> spillekomponent i sanntid, og bare det. Skal det evalueres som trekk, skjer
> det i en egen liten kjøring etterpå.

Med søket ute er tallene over farbare: dager, ikke timer.

**Måletid kommer i tillegg**, og den er ikke liten: porten mellom epoker krever
en parret måling over 2 SE.

---

## 6. Ærlige risikoer

**Datasult.** Selvspill fra tilfeldig i et firespillerspill med imperfekt
informasjon er den dyreste varianten vi kunne valgt. §46: korpuset er allerede
den bindende skranken.

**Utfallsstøy.** Én kamp gir noen få poengtall. Fordelen (`A`) er derfor støyende
per handling, og verdihodet må være rimelig før policyen kan lære noe.

**Ligakollaps.** Uten porten mellom epoker fylles befolkningen med versjoner som
ikke er bedre, og «beste» blir et snitt av støy.

**K6 trener på testmotstanderen.** Vanene i ligaen er de samme som K6-prøven
måler mot. Da måler prøven gjenkjenning i vektene, ikke læring i løpet. Vanene
må deles i DISJUNKTE trenings- og testsett.

**K2-prøven dekker bare én av fire faser.** Den prøver kortvalg fra stikk 7.
BUD, VRAK og VELG er uprøvd — og vrakfasen er nettopp der talonglekkasjen bet
(§ talonglekkasje: prøven kunne ikke se den, fordi den aldri besøkte fasen).
Prøven må utvides før MLB spiller en eneste kamp.

**Og den viktigste:** hvis MLB ikke slår `rask` etter rimelig tid, er DET
resultatet. Ikke et argument for å trene lenger.

---

## 7. Hva som skjer med dagens Adams

Ingenting. Den er målbar, den er utrullet, og den er referansen MLB må slå.
`rask` er med i ligaen nettopp derfor.

---

## 8. Avbruddskriteriet — skrevet FØR vi ser tallene

Arvind, 9. august: «hvis dette ikke går så må vi hitte nuclear-knappen. da må vi
bygge alle delene helt på nytt … vi har hatt en veldig patchwork-ordning med
gamle deler og mye svikt. sunken cost. MEN det er bare hvis dette feiler.»

**Da må «feiler» stå her, nå.** Skrives det etterpå, blir det en diskusjon i
stedet for en måling — og i en diskusjon vinner sunk cost hver gang.

### Tre ulike feil, tre ulike svar

| hva som feiler | hva det betyr | hva vi gjør |
|---|---|---|
| **Fase 0a** — trohodet slår ikke dagens tro | sanseblokk-hypotesen er død | MLB fortsetter. K8 må komme et annet sted fra |
| **Fase 1** — tilfeldig nett spiller ulovlig, eller K2 ryker | ingeniørfeil | fiks den. Ikke et argument om noe som helst |
| **Fase 2** — MLB slår ikke `rask` | **selvspill uten mester når ikke fram her** | nuclear |

Bare den tredje er en dom over veien.

### RASKERE: kort løp i trening, langt løp i dom

Arvind, 9. august: «jeg gidder ikke å vente i 5 dager.»

Rimelig — og 5 døgn var padding fra min side. `målPoeng` er allerede en
parameter, og et løp til **30** i stedet for 100 er ~3× raskere per kamp med
alle tre nivåene i behold: makro finnes så lenge det ER et løp.

| | løp til 100 | løp til 30 |
|---|---|---|
| kamp, rent nett | ~2 s | **~0,6 s** |
| 5 000 kamper, 20 skard | ~8 min | **~2,5 min** |
| 10 epoker, spilling | ~80 min | **~25 min** |

**Første lesning kommer på timer, ikke døgn.**

Vi TRENER på korte løp og DØMMER på lange. Risikoen er at makroatferden lært
for et 30-løp ikke er den samme som for et 100-løp — den skal derfor etterprøves
på 100 før noe konkluderes, og avviket mellom de to er i seg selv et tall verdt
å ha.

### Tidsplan, revidert

| når | hva | hva vi lærer |
|---|---|---|
| **time 0–4** | fase 0a, trohodet alene | flytter et nett K8? |
| **time 4–8** | fase 1, fornuftssjekk | spiller et tilfeldig nett lovlig? Holder K2? |
| **time 8–14** | 10 epoker, korte løp | **beveger kurven seg i det hele tatt?** |
| **døgn 1–2** | flere epoker, mot `rask` | er den på vei mot noe? |

Det er **ikke** en garanti om at MLB er ferdig på to døgn. Det er en garanti om
at vi VET om den er på feil spor innen ett.

### Fase 2s kriterium, konkret

MLB har feilet når **alle tre** holder:

1. **≥ 30 epoker** er kjørt, ELLER **48 timer** maskintid er brukt — det som
   kommer først. (Var 5 døgn; med korte løp i trening er 30 epoker en dagsjobb,
   ikke en ukesjobb.)
2. Beste epoke slår ikke `rask` **parret, over 2 SE, med tegntesten med seg**
3. Kurven over epoker er **flat eller fallende** de siste ti

Punkt 3 er med fordi «ikke framme ennå» og «kommer ikke fram» er ulike ting, og
bare kurven skiller dem.

### Et tidlig varsel, som ikke er et avbrudd

Etter **10 epoker** skal MLB slå et TILFELDIG nett klart. Gjør den ikke det, er
noe strukturelt galt — kredittilordningen, utforskningen eller
belønningsformen — og da skal jeg lete etter feilen, ikke kjøre flere epoker.

Det er den samme lærdommen som fra `løsDD`: en feil sprer seg langs kall, ikke
langs tid. Flere epoker fikser ikke en gal gradient.

### Hva «nuclear» faktisk ville være

Arvind: «hver del og modul må skrives helt fra starten.» Da er det verdt å si
presist hva som er patchwork og hva som er grunnfjell — ellers river vi feil
vegg.

**Rives:**

| | hvorfor |
|---|---|
| hele `src/moe2/` | stabelen av overstyringer. Fire kollisjoner, alle samme form |
| spek-språket | posisjonsfelt, flagg som kolliderer, `utenSøk` som glemte `amu:` |
| `d7alle` og korpuset | orakeltrent, feil målestokk, fordelingsskift |
| budmodellen som egen GBT | skal inn i nettet uansett |

**Beholdes, og det er ikke sentimentalitet:**

| | hvorfor |
|---|---|
| `src/motor.ts`, `src/regler.ts` | det ER spillet. Å skrive det om endrer reglene, ikke boten |
| prøvene for K1–K8 | de definerer målet. Uten dem vet vi ikke hva «bedre» betyr |
| benkene med kontrollarmene | gate 2 må måle 0,0000, kampbenken 0,2500. Det er infrastrukturen som har fanget hver eneste feil |
| `poengdds` | eksakt, verifisert mot en uavhengig råsøker |
| disiplinen | parret måling, disjunkte bånd, aldri adoptere på støy |

**Og det som IKKE er en grunn til å rive:** at det er gammelt, eller at det tok
lang tid å bygge. Det er nettopp sunk cost med motsatt fortegn.

### Merk hva som allerede ER revet

A7 og A6-avsenderen er parkert. `d5`, `B4` og `kamp1.5` er slått av etter at de
målte −0,8. Summeformen er bygd og deretter satt til side fordi sveipen sa at
overstyringen var optimum.

Det er ikke tegn på at vi holder fast i ting. Det er tegn på at porten virker.
