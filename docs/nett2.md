# Nett 2 — designet, før vi trener

Arvind, 9. august: «ta en helhetlig sjekk om hva du vil inkludere og sånn, slik
at vi ikke må gjøre det igjen. … ikke bygg oppå e1, bygg noe nytt. …
budmodellen tar vi helst til slutt. hvordan skal du trene et nett når vi ikke
har noe bedre enn oss å trene med?»

Denne fila er svaret, og den skal være ferdig FØR en eneste time med trening
brukes. Grunnen står i prosjektets egen historie: korpuset er den bindende
skranken (§46: «306k rader mot d7alles millioner»), og et korpus laget på feil
premiss må lages om.

---

## 1. Hvorfor et nytt nett og ikke E1 videre

E1 (`d7alle`) er 273 trekk bredt, har **ett hode** (verdi), og er trent på en
fordeling boten ikke lenger produserer. Tre ting må endres samtidig, og hver av
dem endrer formen:

| | E1 i dag | Nett 2 |
|---|---|---|
| bredde | 273 | ≥ 558 — sanseblokken krever det |
| hoder | verdi | **policy + verdi + tro** |
| målestokk | SD-orakelets `standardMål` | søkets valg (policy) og faktisk utfall (verdi) |

Å utvide bredden OG legge til hoder OG bytte etikett er å bygge et nytt nett.
Da skal det bygges som ett.

---

## 2. Den strukturelle endringen: MODULENE BLIR INNGANGER

Dette er kjernen, og det er Arvinds egen formulering fra 9. august: «tanken var
at modulene var en utvidelse av nettet.»

I dag er modulene **lag rundt** nettet, og de kolliderer — fire ganger, alle med
samme form: to deler som optimerer ulike mål over samme beslutning. Summeformen
(`sumvelger.ts`) gjør konflikten målbar, men vaktvektsveipen 9. august sa at
optimum ligger på grensen: overstyringen slår avveiningen.

**Tredje form, og den riktige: modulene blir TREKK inn i nettet.**

```
                 ┌─ kort, stikk, renonser, budrunde   (dagens 273)
                 ├─ TROEN: P(kort hos sete) per usett kort   ← K8
   Nett 2  ←─────┼─ STILEN: residualet per motstander        ← K4/K6
                 ├─ KAMPSTILLINGEN: poeng, runder igjen      ← K5 makro
                 └─ KONVENSJONSFLAGG: hva vakten ville valgt ← K3
```

Da kan to moduler **aldri** kollidere: de er ikke to beslutningstakere, de er to
kilder til informasjon. Nettet lærer selv hvor mye hver er verdt, i hver
stilling — i stedet for at vi setter en rekkefølge eller sveiper en vekt.

Og det løser noe summeformen ikke kunne: vektene trenger ikke være konstante.
Troen er mye verdt sent i runden og lite verdt i stikk 1; en skalar vekt kan
ikke uttrykke det, et nett kan.

---

## 3. Inngangene, i detalj

**Dagens 273** beholdes uendret. De er målt og de virker.

**Sanseblokken (troen).** For hvert usett kort: sannsynligheten for at det ligger
hos hvert av de tre andre setene. Det er blokken som krever ≥ 558 trekk, og som
har vært låst siden `montetro` ble bygd. Kanal 1 i K8 — «han byr 11, da har han
gode kort» — kommer inn her, fordi budene alt er kodet i `handtrekk.ts` (felt
93–103) og mater trosnettet.

**Stilen.** Residualet per motstander fra `stilbias.ts`, med sin standardfeil.
Tre tall, og de er allerede målt til å skille en stilisert vane på 17 SE med
null falske positive. Som INNGANG trenger de ingen terskel: nettet lærer selv
når et usikkert residual skal ignoreres.

**Kampstillingen.** Egne poeng, de andres poeng, runder igjen, `racepress`. Det
er K5s makronivå, og som inngang gjelder det for både kortvalg og — senere —
budet.

**Konvensjonsflagget.** Hva `vaktKort` ville valgt, som en indikator. Vakten har
målt +0,12 og slår nettet også når nettet er sikkert; da skal nettet få vite hva
den mener i stedet for å bli overkjørt av den.

---

## 4. Hodene

| hode | mål | hvorfor |
|---|---|---|
| **policy** | hvilket kort ble valgt | modulene trenger SANNSYNLIGHETER. Softmax over verdier er ikke kalibrert — skarpheten er en fri parameter vi gjetter i dag |
| **verdi** | rundens faktiske poeng for setet | det søket trenger som bladvurdering |
| **tro** | hvor kortene FAKTISK lå | hjelpeoppgave med perfekte etiketter |

Trohodet er gratis presisjon: ved rundeslutt vet vi nøyaktig hvor hvert kort lå,
så etiketten er fasit. Det tvinger fellesnettet til å representere
korfordelingen, og det er nettopp representasjonen K8 mangler.

---

## 5. Hvordan trene uten en sterkere lærer

Arvinds spørsmål, og det er det viktigste i fila.

**Søket er læreren.** Et søk over N verdener spiller bedre enn nettet det bruker
som prior — det ER hva det vil si at søket virker. Så:

```
1. Spill med søk på dagens nett
2. Etiketter:  policy = søkets valg
               verdi  = rundens faktiske poeng
               tro    = hvor kortene faktisk lå
3. Tren nett 2
4. Søk på nett 2 er sterkere enn søk på nett 1
5. Gjenta
```

Det er ekspert-iterasjon, og den løser «vi har ingenting bedre enn oss selv»:
**søket gjør deg bedre enn deg selv.**

### PREMISSET MÅ SJEKKES FØRST, og det er ikke gitt

Er ikke søket bedre enn nettet, har løkka ingen motor. Og målingene spriker:

| måling | søkets verdi |
|---|---|
| §46, førersetet, to disjunkte bånd | **+0,95 til +1,55** (z ≈ 3) |
| ablasjonen 8. august, i selskap | +0,167 (1,5 SE) |
| matrisen 9. august | `maks` **taper** mot `rask` |

De to siste er forurenset — matrisens `maks` hadde `d5`/`B4`/`kamp` påslått, og
de kostet 0,8 poeng/runde alene. Men det må måles rent:

> **Port 0: søket alene mot nettet alene, på gate 2, parret, replikert i
> disjunkte bånd.** Er det ikke klart positivt, skal ingen ekspert-iterasjon
> starte — da er læreren ikke bedre enn eleven, og løkka forsterker bare støy.

### To lærere til, som ikke avhenger av premisset

**Faktisk utfall** for verdihodet. Alltid sant, ingen sirkularitet.

**Eksakt poengløsning i sluttspillet.** `poengdds.ts` maksimerer spillerens
faktiske poeng, og den er nå verifisert mot en uavhengig råsøker (`løsDD` var
feil i 86 av 400 givinger før 8. august). I de siste 3–4 stikkene er den en
FASIT, ikke et anslag — og K7 målte at gapet der er +0,947 poeng/runde ved fem
stikk. Det er ekte lærersignal på stillinger vi vet vi spiller dårlig.

---

## 6. Rekkefølgen

Arvind: «jeg vil liksom at hele adams max skal være klart, også trener nettet en
siste gang før vi tar budmodellen.»

1. **K2–K8 låses.** Alle moduler bestemt, alt som ikke bærer sin vekt parkert.
2. **Port 0:** er søket bedre enn nettet? Uten et ja stopper det her.
3. **Korpus** genereres med den låste stakken — fordelingsskiftet forsvinner,
   fordi korpuset lages av policyen som faktisk spiller.
4. **Nett 2 trenes** med tre hoder.
5. **Iterér** til gevinsten flater ut.
6. **Budmodellen sist**, mot den endelige spillestyrken. `μ` er forventet
   stikktall, altså en funksjon av hvor godt vi spiller — kalibreres den før,
   må den kalibreres om.

---

## 7. Hva som må være bestemt FØR steg 3

Dette er lista som gjør at vi slipper å gjøre det om igjen:

- [ ] **Trekkbredde og layout** låst. Å legge til ett trekk senere gjør hele
      korpuset ubrukelig.
- [ ] **Hvilke moduler som er inngang** — og dermed hvilke som IKKE lenger er
      lag. En modul som er begge deler telles to ganger.
- [ ] **Etikettdefinisjonene** låst: hvilket søk, hvor mange verdener, hvilken
      rolle. Korpuset arver lærerens styrke.
- [ ] **Hvem som sitter ved bordet** når korpuset lages. `sd-orakel` rullet en
      gang ut med NevroHjerne mens bordet spilte som Adams — samme feilklasse.
- [ ] **Holdout-bånd** avsatt før første rad genereres.
- [ ] **A1 er parkert** — den målte −0,0019 på troen (z = −2,10) og er fortsatt
      på i `ADAMS_V6`.

---

## 8. Og svaret på «er det additivt nå?»

Delvis, og det er ærlig sagt en mellomstasjon.

`sumvelger.ts` finnes: én poengsum, ett argmax, målbare vekter, og vakten er
skrevet om så overstyringen er et **spesialtilfelle** (vekt = ∞). Null-punktet
er håndhevet kort for kort.

Men vaktvektsveipen 9. august (3600 par, kontrollarm eksakt 0,000) sa:

    vekt 0,05   −0,2031  (−3,0 SE)
    vekt 0,15   −0,1225  (−2,1 SE)
    vekt 0,40   −0,0106  (−0,3 SE)
    vekt 1,00   +0,0000  (identisk med overstyringen)

**Monotont. Optimum ligger på grensen.** Hver gang nettet fikk vinne over
konvensjonen, tapte vi poeng.

Det er ikke et argument mot summeformen — det er et argument for at **nettet er
for svakt i nettopp de stillingene**. Og det er den samme konklusjonen K7 og K8
kom til fra hver sin kant samme dag.

Derfor er nett 2 svaret, ikke enda en vektform: når modulene blir INNGANGER,
forsvinner spørsmålet om hvem som overstyrer hvem.

---

## 9. Ligaen — epoker, og hvorfor ikke bare selvspill

Arvind, 9. august: «eventuelt så burde vi sette opp sånn liga-oppsett med epoker
og trening sånn at nettet blir nevralt. … La nettet trene alle sine variabler.»

### Hvorfor liga og ikke ren selvspill

Ekspert-iterasjon mot seg selv har en kjent svakhet: den **kollapser mot én smal
strategi**. Nettet blir godt mot sin egen forrige versjon og mister bredden —
og et bord med familien er ikke en kopi av oss selv.

Ligaen er motgiften. Hver epoke spiller mot en BEFOLKNING:

| motstander | andel | hvorfor |
|---|---|---|
| nåværende beste | ~40 % | driver framgangen |
| tidligere epoker | ~30 % | hindrer at vi glemmer det vi kunne |
| `rask` (uten søk) | ~15 % | den er faktisk best i matrisen i dag — den er ikke en stråmann |
| stiliserte vaner | ~15 % | trumftrekkeren og slektninger: tvinger K6 til å bety noe |

Den siste raden er ikke pynt. K6 krever at boten UTNYTTER vaner. Møter den bare
seg selv, finnes det ingen vane å utnytte — og vi ville trent bort nettopp den
evnen kravet ber om. Det er samme fella som gjorde at koblingssjekken målte
0 av 657 mot fire like agenter: **ingenting å lære er ikke det samme som ikke å
kunne lære.**

### Epoken

```
1. SPILL      ligaen, N kamper, søk på gjeldende nett
2. ETIKETT    policy = søkets valg · verdi = faktisk utfall · tro = fasit
3. TREN       alle tre hoder, felles kropp
4. PORT       ny epoke må slå forrige PARRET, i disjunkt frøbånd, over 2 SE
5. LIGA       består den, går den inn i befolkningen. Ellers forkastes den
```

Steg 4 er ikke en formalitet. Uten en port vokser ligaen med versjoner som ikke
er bedre, og «beste» blir et gjennomsnitt av støy.

### «La nettet trene alle sine variabler»

Dette er den delen jeg ikke hadde tenkt ferdig, og den er stor.

**Hver konstant jeg har målt for hånd denne uka er en parameter nettet kunne
lært selv:**

| konstant | dagens verdi | hvordan den ble til |
|---|---|---|
| `BEFOLKNING_RESIDUAL` | −0,0976 | målt over 8812 valg, hardkodet |
| `BEFOLKNING.trumfutspill` | 0,2524 | målt over 1874 utspill, hardkodet |
| vaktens veto | 0,5 | sveipet, replikerte ikke |
| `MAKS_VRI` | 0,35 | satt, aldri målt |
| signifikansporten | 2 SE | valgt fordi gate 2 bruker den |
| søkets `lambda` | 1,5 | sveipet |
| konvensjonsvekten | ∞ | sveipet 9. august, optimum på grensen |

Sju tall, hvert av dem en dags arbeid å måle, og hvert av dem en KONSTANT der
sannheten er en FUNKSJON av stillingen. `MAKS_VRI` bør være liten når vi har
sett lite og stor når vi har sett mye. Troen bør veie tungt sent i runden og
lite i stikk 1.

Blir modulene INNGANGER, forsvinner hele lista: nettet lærer vektingen selv, og
den blir stillingsavhengig gratis. **Det er den egentlige gevinsten ved nett 2 —
ikke bredden, men at vi slutter å håndsette ting som burde vært lært.**

### Utgangsbetingelsen er KRAVENE, ikke tapskurven

Arvind: «det er viktig at når all denne treningen er ferdig så har adams max
sine krav 2–8 blitt innfridd (utenom budmodellen) og den spiller helt optimalt
med sine sensorer.»

Da er utgangsbetingelsen ikke «tapet flater ut». Den er **at de åtte prøvene
passerer**, og hver av dem finnes allerede:

| krav | prøven | hva ligaen må levere |
|---|---|---|
| K2 | `k2-aldri-jukse.test.ts` | invarians under skjult informasjon — må HOLDE gjennom hele treningen |
| K3 | fasegapene | ingen fase svak. Budrunden unntatt, den kommer sist |
| K4 | hukommelsen endrer valg + `M ≥ 2` | trenes inn som INNGANG, ikke som lag |
| K5 | samme kort, ulik kampstilling → ulikt valg | kampstillingen er en inngang |
| K6 | gevinsten VOKSER med rundenummeret | derfor må stiliserte vaner være i ligaen |
| K7 | avstand til taket i sluttspillet | +0,947 ved fem stikk i dag |
| K8 | log-tap mellom gulv og tak | 4,20 % i dag. Trohodet angriper dette direkte |

**K2 er den som må voktes hardest.** En liga med søk og tro er nettopp der
lekkasjer sniker seg inn — og prøven er den ene i prosjektet som kan avgjøres
absolutt. Den skal kjøres etter HVER epoke, ikke bare til slutt.

### Ærlig om kostnaden

Ligaen multipliserer antall kamper: fire motstandertyper, hver epoke, med søk.
Korpuset er allerede den bindende skranken (§46). Så dette er ikke en kveldsjobb
— det er GPU-arbeid over dager, og det er grunnen til at steg 1–2 (låse
modulene, og Port 0) må være ferdige først.

Å starte ligaen før modulene er låst er å generere et korpus vi må kaste.
