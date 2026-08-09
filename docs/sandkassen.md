# Sandkassen — fresh start

Arvind, 9. august:

> «nei nei nei. det skal ikke låses. du kaster alle evnene, verktøyene, og
> variablene i en sandkasse også lar du det nye nettverket finne ut av resten.
> da inkluderer vi også budmodellen. alle variabler fra mikro meso og makro skal
> inn her. og den skal kunne se hvem har hvilket som helst kort når som helst i
> makro-spillet. bare da kan den bli best i et langt løp. dette blir en fresh
> start.»

Dette dokumentet erstatter lagtenkningen. Ikke en stabel, ikke en sum — **ett
nett som tar alle beslutninger, med alt vi har bygd som INNGANGER.**

---

## 1. Hva som faktisk endres

| | før | sandkassen |
|---|---|---|
| hvem bestemmer | en stabel av lag der siste skriver vinner | **ett nett** |
| budet | egen GBT-modell, utenfor | **samme nett, egen handlingsmengde** |
| modulene | lag som overkjører hverandre | **trekk inn** |
| konstantene | sju håndsatte tall | **lærte, og stillingsavhengige** |
| treningen | korpus fra en orakelpolicy | **selvspill, utfall som signal** |

Kollisjonsklassen som har rammet prosjektet fire ganger — to deler som optimerer
ulike mål over samme beslutning — kan ikke oppstå. Det finnes bare én
beslutningstaker.

---

## 2. K2 ER SKRANKEN, OG DEN BYGGES INN STRUKTURELT

Dette er det ene som ikke kan rettes senere, så det står først.

**Under spill ser nettet bare lovlig informasjon.** K2-prøven er absolutt: to
stillinger som er like i alt boten lovlig ser, men ulike i de skjulte kortene,
må gi nøyaktig samme valg. Ett avvik er juks.

Garantien skal være STRUKTURELL, ikke en konvensjon:

> Trekkbyggeren tar `spillerVisning(state, sete)`, ikke `state`. Da FINNES ikke
> de skjulte kortene i det nettet ser, og K2 kan ikke brytes ved et uhell.

**Under trening brukes de sanne posisjonene som FASIT** — det er nettopp derfor
den lærer å gjette hvor kortene er. Målet er ikke en inngang. Det er forskjellen
mellom å se fasiten og å bli rettet etter prøven.

`test/k2-aldri-jukse.test.ts` kjøres etter HVER epoke, ikke bare til slutt.
Prøven er falsifiserbar — en jukser ble tatt med 6 avvik av 9 — og den er den
ene i prosjektet som kan avgjøres absolutt.

---

## 3. Alt som skal inn i sandkassen

### Mikro — stikket

- dagens 273 trekk: egen hånd, spilte kort, renonser, budrunde, hvem som leder
- **troen**: for hvert usett kort, P(det ligger hos hvert sete) — sanseblokken
- **konvensjonene**: hva hver vaktregel ville valgt, som flagg
- lovlige kort (masken — nettet skal aldri kunne velge ulovlig)

### Meso — kontrakten

- budrunden så langt: hvem bød hva, hvem passet
- **budmodellens egne tall**: μ og σ per bud, `vant[N]` — som TREKK, ikke som
  beslutningstaker
- vraket og trumfvalget som er gjort
- kontrakten som spilles, og hvor mange stikk laget har

### Makro — kampen

- alle fires poeng, runder spilt, `racepress`
- **stilen per motstander**: residualet fra `stilbias.ts` med sin standardfeil
- hvor mange runder som er sett av hver motstander (tiltroen)

### Verktøyene som trekk

Alt vi har bygd blir en KILDE, ikke en dommer:

| verktøy | blir |
|---|---|
| `amu` søket | valgt kort + utfallsvektor som trekk |
| `eks`/`poengdds` | eksakt poengverdi når treet er lite nok |
| `vaktKort` | konvensjonsflagg |
| `stilbias` | residual per sete |
| `race` | presset |
| budmodellen | μ, σ, `vant[N]` |

Nettet lærer selv hvilke som er verdt å lytte til, i hvilke stillinger. Det er
det de sju håndsatte konstantene forsøkte å uttrykke — og som en konstant ikke
kan uttrykke, fordi sannheten er en funksjon av stillingen.

---

## 4. Handlingsrommet — ETT nett, fire faser

Budet inn i samme nett var Arvinds krav, og det løser noe summeformen ikke
kunne: bud og spill henger sammen, og verdien av en kontrakt ER hvor mange stikk
vi tar.

| fase | handlinger |
|---|---|
| BUDRUNDE | pass, bud 5–13, amerikaner, solo |
| VRAK | hvilke kort som kastes |
| VELG | trumffarge × etterlyst valør |
| SPILL | hvilket kort |

Ett policyhode over en samlet handlingsmengde, maskert per fase. Da kan nettet
lære at et bud er verdt noe FORDI spillet etterpå går bra — ikke gjennom en
formel som antar det.

---

## 5. Hodene

| hode | mål | etikett |
|---|---|---|
| **policy** | hva som skal gjøres | **utfallet** — selvtrent |
| **verdi** | hva stillingen er verdt | rundens faktiske poeng |
| **tro** | hvor hvert usett kort er | hvor de FAKTISK lå |

Verdi og tro har perfekte etiketter og ingen sirkularitet. Bare policyen læres
av hva som virket, og det er nettopp den delen som skal være selvtrent.

**Trohodet er svaret på «se hvem som har hvilket kort når som helst»:** det er
trent på fasit, så det lærer å gjette godt — uten noen gang å se fasiten når det
spiller.

---

## 6. Treningen — selvspill i liga

```
1. Spill kamper mot BEFOLKNINGEN
2. Se hva som faktisk ga poeng
3. Flytt policyen mot handlinger som ga MER enn ventet
4. Verdi og tro læres av fakta
5. Ny epoke inn i befolkningen bare om den slår forrige PARRET, over 2 SE
```

Befolkningen: nåværende beste, tidligere epoker, `rask`, og **stiliserte vaner**.
Den siste er ikke pynt — K6 krever at boten UTNYTTER vaner, og møter den bare
seg selv finnes det ingen vane å utnytte.

**Utgangsbetingelsen er de åtte prøvene, ikke tapskurven.**

---

## 7. Hva vi beholder fra i dag

Ikke av sentimentalitet — fordi det er MÅLT:

- **motoren og reglene** — de er fasiten
- **prøvene** for K1–K8 — de definerer målet
- **benkene** (gate 2, kampbenken, matrisen) med kontrollarmene
- **`poengdds`** — eksakt poengløsning, verifisert mot en uavhengig råsøker
- **`stilbias`** — residualet, som nå blir et trekk i stedet for en vri
- **konvensjonene** — de slår nettet også når nettet er sikkert (vaktvektsveipen)

Og vi beholder disiplinen: parret måling, disjunkte frøbånd, kontrollarmer som
må treffe eksakt, aldri adoptere på støy.

---

## 8. Den ærlige risikoen

**Sandkassen er sultnere på data enn noe vi har gjort.** Ett nett som lærer bud,
vrak, trumf og spill fra utfall alene trenger mange flere kamper enn et korpus
merket av et orakel. Og §46 sier at korpuset allerede er den bindende skranken.

Det betyr ikke at det er feil vei. Det betyr at ligaen må være billig nok til å
kjøre i dager, og at vi må måle framgang underveis i stedet for å håpe.

**Og det er verdt å si høyt:** hvis den nye veien ikke slår `rask` etter rimelig
tid, er det et resultat — ikke et argument for å prøve lenger.
