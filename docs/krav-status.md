# Kravstatus — hvor hvert krav faktisk står

Arvind, 9. august: «husk målet ditt. du er ikke i mål enda.»

Denne fila finnes fordi jeg har sitert disse tallene fra hukommelsen flere
ganger, og det er ikke godt nok når det er dem som avgjør når vi er ferdige.
Hver rad har et paragrafnummer i `docs/plan.md`. Står det ikke et tall her, er
det ikke målt — og da skal det ikke påstås.

**K1 er en RETNING, ikke en port** (`AdamsMax.md:64`). K2–K8 er portene.

---

## Sammendrag

| krav | status | målt i dag | mål | kilde |
|---|---|---|---|---|
| **K2** aldri jukse | **BEVIST** | 0 avvik, falsifiserbar | 0 avvik | `test/k2-aldri-jukse.test.ts` |
| **K3** optimalt i alle faser | ikke innfridd | budrunden: **41,8 %** av det som er å hente står igjen | ~0 | §K3 |
| **K4** hukommelse + planlegging | **ubevist** | benken kan ikke vise det | målbar effekt | §K4 |
| **K5** forstå kontekst | delvis | **0 av 20** valg endret i «bak 70–90» | endrer valg der det betyr noe | §K5 |
| **K6** lære og utnytte vaner | ikke innfridd | vekst med rundenr **z = 0,23** | vekst > 2 SE | §K6 |
| **K7** optimalt sluttspill | ikke innfridd | **+0,947** poeng/runde igjen ved fem stikk | ~0 | §117 |
| **K8** predikere kort | ikke innfridd | **12,34 %** av veien gulv → tak | vesentlig høyere | §119 |
| *K1* slå mennesker | retning | 15,83 % menneskeseier | < 5 % | menneskestigen |

**Én port er lukket av sju.** Det er den ærlige stillingen.

---

## K2 — aldri jukse

**BEVIST**, og den eneste porten som kan avgjøres absolutt.

Prøven er falsifiserbar: en konstruert jukser ble tatt med 6 avvik av 9. Den er
utvidet til alle fire faser (`test/k2-alle-faser.test.ts`), og MLB har fått
egne strukturelle varianter for troen, trekkene og handlingsrommet — hver med
en kontrollarm som lekker én bit og blir tatt.

**Det som holder den lukket:** i sandkassen leser alt `spillerVisning`, aldri
`GameState`. De skjulte kortene *finnes ikke* i det nettet ser. Garantien er en
typegrense, ikke en konvensjon.

---

## K3 — optimalt i alle faser

| fase | gap til taket |
|---|---|
| **budrunde** | **41,8 % av alt som er å hente** |
| vrak | målt |
| trumfvalg | målt |
| utspill stikk 1 | §73: regelen målte null |
| midtspill | alpha-mu i alle roller |

Budrunden er både det største gapet og den største verdien: ablasjonen ga
`budm` **+0,8116 (5,4 SE)** — **72 % av alt stakken tilfører**.

**MLB-svaret:** budet er inne i samme nett som spillet, med egen del av
handlingsrommet (plass 52–63). Da kan nettet lære at et bud er verdt noe FORDI
spillet etterpå går bra, i stedet for gjennom en formel som antar det.

Arvind har vært tydelig på at **budmodellen kommer sist** — «bud er helt
avhengig av at mikro skal være på plass».

---

## K4 — hukommelse over hele spillet, og planlegging

**Ubevist, og benken har skylden.** Gate 2 lager friske agenter per giv, så en
hukommelse som bygger seg opp over en kamp kan strukturelt ikke vise seg der.
Kravet er ikke motbevist — det er umålt.

**MLB-svaret:** 144 hukommelsestall per stilling (48 per motstander × 3), inne
i trekkvektoren. Ingen terskel: nettet lærer selv når fire observasjoner er for
lite og når tjue er nok, og tiltroen (`n`) går inn ved siden av hvert tall.

Og målingen som gjør dette til mer enn en gjetning: troen er
**motstanderspesifikk** (§119). Trent på én motstander og målt på en annen
faller den fra 12,34 % til 5,09 % — under `gulv+`. Prisen for å ta feil om
motstanderen er mange ganger alt regelbasert slutning gir.

---

## K5 — forstå konteksten og tilpasse seg

**Målt, og halve knotten var død.**

| stilling | endrede valg |
|---|---|
| **bak** 70–90 | **0 av 20** |
| foran 90–70 | 4 av 20 |

Å ligge under endret ingenting. Formen er rettet, men **den nye
atferdsmålingen gjenstår** — retningen er bevist, størrelsen ikke.

**MLB-svaret:** `målPoeng` og `racepress` er trekk, i to skalaer. Nettet kan
ikke unngå å se stillingen. At vi trener på løp til 30 og dømmer på 100 gjør
dette til noe som må etterprøves, ikke antas.

---

## K6 — lære andre spilleres vaner og utnytte dem

**Målt, ikke innfridd.** Tre brudd funnet.

| | med læring | uten læring |
|---|---|---|
| gevinst mot stilisert vs nøytral | +7,26 ± 1,53 | **+4,74 ± 1,52** |
| vekst med rundenummer | +0,71 ± 3,12 (**z = 0,23**) | −4,08 ± 3,13 |

Første rad ser ut som en seier og er det ikke: gevinsten er nesten like stor
**uten** læring, altså kommer den fra at motstanderen er dårlig, ikke fra at vi
lærer henne. Andre rad er den egentlige prøven, og den er null.

**Det som virker:** `stilbias.ts` — residualet mot nettets egen forventning.
Kontroll ga 0 falske positive, en innøvd vane ble tatt på 17 SE.

### Hvorfor en detektor som VIRKER ikke gir vekst (funnet 9. august)

Detektoren er ikke problemet. **Ledningen er.** Det oppdagede tiltet `beta`
(`okt.ts:306`) går til nøyaktig to steder, og begge ligger inne i *søkets
modell av de andre*:

| bane | hva den gjør |
|---|---|
| `atferdFor` | vekter hvilke verdener vi trekker — altså **troen** |
| `motpartFor` | hvem søket ruller ut som motstander |

**Ingen av dem endrer vårt eget valg direkte.** Begge går inn i søkets modell
av de andre. Har stakken ikke søk, har vanen ingen vei inn i det hele tatt.

Og det er nøyaktig hva `analyse/k4-hukommelse.txt` måler:

| stakk | hva hukommelsen endret |
|---|---|
| `ADAMS`, `ADAMS_MAALT` (uten `amu:`) | **0 av 87 valg** |
| `V6`/`V7` (med `amu:`), kortkanalen A2 | **58 % av kortvalgene** |

På de søkfrie stakkene er eneste kanal `Profilbok.justering`, som ba om maks
**0,5075** budpoeng mot en terskel på **−3,0**. Minste forskyvning som snur et
valg er 1,0. Den kan altså ikke endre noe, uansett hvor mye den lærer.

**Men i V6/V7 fyrer kortkanalen hardt — 58 %.** Den er ikke frakoblet, og
`test/k4-hukommelse.test.ts` låser fast at `okt:` nå NÅR gjennom `vr:` (den
defekten er rettet). A2 krever at `aggressivitet` passerer `MIN_RUNDER = 4` per
sete; med to forkamper står tellerne på 25/24/24/27.

**Det gjør gåten skarpere, ikke løsere.** Hukommelsen endrer 58 % av valgene, og
K6 måler likevel ingen vekst med rundenummer (z = 0,23). Da er ikke problemet at
signalet mangler — det er at **endringene ikke er forbedringer**. Spørsmålet
flytter seg fra ledningen til kvaliteten på motstandermodellen.

**Og mekanismen som VILLE endret valget finnes:** `sumledd.ts:238` har et
`stil`-ledd som former vårt eget kortvalg direkte —
`mål = h(nettets kort) + stilvri(sete)`. Det er bygd og testet. Antall
navngitte stakker som bruker `sum:`: **null.**

| stakk | lag |
|---|---|
| `ADAMS`, `ADAMS_MAALT` | `vr: budm: vakt: e1:` — **ingen `okt:`, ingen `profil:`** |
| `ADAMS_V6`, `ADAMS_V7` | `okt: vr: amu: profil: budm: vakt: e1:` |

Altså: den utrullede og den mest målte stakken har **ikke noe vaneapparat i det
hele tatt**, og de to som har det, mater det bare inn i søkets motstandermodell.

Dette er samme mønster som gammelkode-revisjonen fant én etasje opp: **fiksen
blir skrevet, dokumentert og testet — og så ikke koblet inn til ende.**

**MLB-svaret:** de 144 hukommelsestallene går rett inn i **policyen**, ikke bare
i verdenstrekkingen. Da kan vanen endre valget, ikke bare troen. Og befolkningen
MÅ inneholde stiliserte vaner — møter nettet bare seg selv, finnes det ingen
vane å utnytte, og K6 kan ikke læres.

---

## K7 — matematisk optimalt sluttspill

**Ikke innfridd, men avstanden er målt — og det er ikke et søkeproblem.**

| vindu | poeng/runde igjen | av alt som er å hente |
|---|---|---|
| siste stikk | **0,0000** over 1000 målinger | 0 % (tvunget) |
| stikk 10–11 | +0,0640 | 0,3 % |
| stikk 8–9 | +0,477 | 2,5 % |
| **siste fem stikk** | **+0,9470** | **~4,9 %** |

Jeg nedgraderte dette én gang på feil grunnlag: 0,3 % gjaldt de **to** siste
stikkene, ikke de fem. Ved fem stikk er gapet nesten et helt poeng per runde.

**Diagnosen (§117): gapet er informasjon, ikke dybde.** Å søke dypere lukker
det ikke, fordi den som er usikker på hvor kortene ligger tar feil valg
uansett hvor langt hun regner. Det peker rett på K8.

**`poengdds` er verifisert** mot en uavhengig råsøker etter at `løsDD` viste
seg feil i 86 av 400 oppsett.

---

## K8 — predikere motstandernes kort, uten juks

**Ikke innfridd, men her har det faktisk beveget seg.**

| arm | % av veien gulv → tak |
|---|---|
| gulv+ (bare renonser) | 5,82 % |
| bayes + kanal 2 (forrige beste) | 4,37 % |
| **MLB-trohodet** | **12,34 %** |

Nesten tre ganger, og den første armen som slår `gulv+` i det hele tatt.
`+0,0875 ± 0,0020` (z = 44,3), best i 1 089 av 1 200 giv, replikert i to
disjunkte frøbånd.

Kontrollen som avviste min egen forklaring: firedobling av oppløsningen (V=256)
kjøper +0,013; nettet kjøper +0,090. Jensen-straffen var ekte, men ikke der
pengene lå.

**Fortsatt 88 % igjen til taket.** Og K7 sier at det er nettopp denne avstanden
som koster poeng i sluttspillet.

---

## Hva som må skje, i rekkefølge

1. **K8 videre** — trohodet blir et HODE på sandkassenettet, trent på
   befolkningen det møter. §119 sier at vekter ikke overføres mellom
   motstandere; metoden gjør.
2. **K7 følger K8** — gapet er informasjon. Lukkes troen, lukkes sluttspillet.
3. **K4, K5, K6** — evner nettet har inngangene til, men som må vises i poeng,
   ikke i at et tall beveger seg.
4. **K3 til slutt**, med budet inne i samme nett. Etter Arvinds rekkefølge.

**K2 skal holde gjennom hvert eneste steg**, ikke sjekkes til slutt.
