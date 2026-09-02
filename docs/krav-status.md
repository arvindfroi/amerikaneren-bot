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
| **K5** forstå kontekst | **ikke innfridd** | 7,3 % endret — men **den vendte knotten gir 7,3 % òg** (n=192) | endrer valg der det betyr noe | `analyse/k5-2026-09-02.md` |
| **K6** lære og utnytte vaner | ikke innfridd | vekst med rundenr **z = 0,23** | vekst > 2 SE | §K6 |
| **K7** optimalt sluttspill | ikke innfridd | **+0,947** poeng/runde igjen ved fem stikk | ~0 | §117 |
| **K8** predikere kort | ikke innfridd | **12,34 %** av veien gulv → tak | vesentlig høyere | §119 |
| *K1* slå mennesker | retning | **32,1 %** menneskeseier mot v5 (n=78, KI 22,7–43,0) | < 5 % | Val Town, `type='kamp'` |

**Én port er lukket av sju.** Det er den ærlige stillingen.

---

## K1 — slå mennesker (retning, ikke port)

**Oppdatert 1. september fra Val Town-basen, `type='kamp'`.** Grunnlinja er
25 %: ett menneske mot tre bots.

| motstander | kamper | mennesket vant | andel |
|---|---|---|---|
| PIMC/MAKS | 16 | 12 | 75,0 % |
| NevroHjerne | 13 | 8 | 61,5 % |
| før-v5-linja (Vaar, v1–v3) | 19 | 3 | 15,8 % |
| **Adams-v5 (utrullet 5. aug)** | **78** | **25** | **32,1 %** |
| **KRAVET** | | | **< 5 %** |

95 %-intervall (Wilson) for v5: **22,7 % – 43,0 %**. Hele intervallet ligger
over kravet.

**De 15,8 % som `AdamsMax.md` har sitert er før-v5-linja**, målt 1.–4. august.
Den beskriver ingen bot som er utrullet i dag. Tallet er korrekt regnet for sitt
eget vindu — `docs/plan.md:2979` summerer Vaar 10/2, v1 6/1, v2 1/0, v3 2/0 —
men det er ikke en måling av v5.

**Stedfortrederen er feilkalibrert, og stigen er målt på nytt.** «15,83 % (v5)»
er v5 mot en menneske-ekvivalent bot kalibrert til de 19 kampenes 15,8 %. Hele
stigen er nå kjørt om mot dagens utrullede v5, 800 kamper per arm
(`analyse/stedfortreder-2026-09-01.md`):

| kandidat | andel | 95 %-KI |
|---|---|---|
| nevro | 3,5 % | 2,4–5,0 |
| d7alle bart | 6,8 % | 5,2–8,7 |
| ftf1 | 6,9 % | 5,3–8,8 |
| Adams uten budmodell | 7,1 % | 5,5–9,1 |
| Adams uten vrakrangerer | 22,9 % | 20,1–25,9 |
| **KONTROLL: v5 mot seg selv** | **25,3 %** | 22,4–28,4 |
| **MENNESKENE mot v5** | **32,1 %** | 22,7–43,0 |

Kontrollarmen omslutter 0,2500 slik K1-benken krever. **Menneskenes intervall
inneholder kontrollarmens punktestimat: de kan ikke skilles fra enda en kopi av
Adams-v5.** Det snur premisset stigen ble bygget på (§41: «menneskene ligger på
15,8 %, altså SVAKERE enn Adams-v3»). Det finnes ikke noe trinn mellom 7,1 % og
22,9 %, og altså **ingen stedfortreder å velge** — til K1 må v5 selv brukes
inntil menneskedataene er tykkere.

Samme kjøring replikerer K3 uavhengig: å fjerne budmodellen koster 18,2 pp, å
fjerne vrakrangereren 2,4 pp. `budm` bærer stakken, målt på kamper denne gangen
og ikke på rundedifferanse.

**Forbehold.** Bare 78 av 248 startede v5-kamper ble fullført, og av de
forlatte med ≥ 8 spilte runder (n=56) lå mennesket bak i 84 %. Folk forlater
kamper de taper, så 32,1 % er et TAK på menneskenes andel, ikke et punktanslag.
Fullføringsgraden var dessuten ulik (før-v5 41,3 %, v5 31,5 %) og
spillersammensetningen skiftet mellom vinduene, så 15,8 → 32,1 skal ikke leses
som at v5 er svakere enn v1–v3.

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

### Prøven kunne ikke kjøres fra en fersk klone — funnet og rettet 1. september

`e1-modell/` står i `.gitignore` (linje 15), og **to vektfiler spekstrengen
krever lå ingen steder i repoet**: `vrakrang.bin` og `d7alle.bin`. Uten dem
kastet `lagIndre` (`src/moe2/agentspek.ts:520`) ENOENT, og i en fersk klone falt
**114 av 607 prøver — deriblant alle tretten K2-prøvene**. K2 er det ene kravet
som er erklært BEVIST, og beviset kunne altså ikke etterprøves av noen andre enn
den maskinen filene tilfeldigvis lå på.

**Rettingen:** vektene lå i repoet hele tiden, som base64 i
`web/dist/adams-kort.b64` og `web/dist/adams-vrak.b64` — nøyaktig det
nettleseren laster ned, sporet fordi Vercel serverer `web/`.
`verktoy/hent-vekter.mjs` pakker dem ut til `e1-modell/` og kjøres som
`pretest`. Formatet parses før noe treffer disk, og skrivingen er idempotent.

At de pakkes ut FRA nettleserfilene er ikke en detalj: da er «målt = utrullet»
ikke lenger noe som må håndheves i ettertid — det følger av at det er de samme
bytene. Å spore `e1-modell/*.bin` i tillegg ville lagret de samme vektene to
ganger, og to kopier kan komme i utakt. Det er nøyaktig feilklassen
`test/utrullet-lik-spek.test.ts` finnes for å fange.

Verifisert: `utrullet-lik-spek` 3 av 3, K2 13 av 13, og **hele `npm test` 616 av
617 grønne, 0 røde** — fra 492 av 607 med 114 røde.

### Den 114. var en ekte feil, og den var Windows-spesifikk

`test/mlb-selvspill.test.ts:333` bygde stien slik:

```ts
const rot = new URL("..", import.meta.url).pathname;
readFileSync(`${rot}${fil}`.replace(/^\//, ""), "utf8")
```

På Windows gir `pathname` `/C:/...`, og da er `.replace(/^\//, "")` riktig. På
Linux og macOS gir den `/home/...`, og å stryke skråstreken gjorde stien
relativ. Testen — den som håndhever at selvspillet aldri rører disk — kunne
altså **bare kjøre på Windows**, og feilet i det stille overalt ellers. Rettet
med `fileURLToPath` + `join`.

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

**Målt på nytt 2. september ved n=192, og RETNINGEN HOLDT IKKE.**
(`analyse/k5-2026-09-02.md`. Fire disjunkte frøbånd à 48 stillinger mot 16–20 i
alle tidligere kjøringer.)

| arm | endret | av | andel |
|---|---|---|---|
| KONTROLL (bit-identiske armer) | 0 | 192 | **0,0 %** |
| **BAK-retningen** (λ=0 mot λ=1,5) | 14 | 192 | **7,3 %** |
| **samme knott VENDT FEIL VEI** | 14 | 192 | **7,3 %** |
| UTRULLET (`amu:foerer`) bak | 1 | 78 | **1,3 %** |

**Den vendte knotten endrer nøyaktig like mange valg som den riktige.**
Antallet endrede valg bærer altså ingen informasjon om at knotten peker riktig
vei — bare retningen blant de endrede kunne gjort det, og den replikerer ikke:
tegntesten er 10 opp / 3 ned samlet, men **2 opp / 2 ned når frøbånd 5 100 000
tas ut**. Åtte av de ti «opp» ligger i det ene båndet — som tilfeldigvis er
standardverdien i `examples/k5-kontekst.ts` og dermed båndet alle tidligere
K5-kjøringer har brukt.

Og i den utrullede boten (`amu:foerer`) er effekten 1,3 %: fiksen fyrer bare i
seter der søket er avslått.

Dette er en NEDGRADERING fra «retningen er bevist, størrelsen ikke», gjort på
12x datagrunnlaget. Det som ikke er vist er at racepresset er verdiløst — ved
n=192 ville en ekte effekt på et par prosentpoeng ikke kunne skilles fra null.
Funnet er at effekten ikke kan skilles fra å vri knotten feil vei.

**Neste steg er måling og konfigurasjon, ikke trening:** flere bånd før noe
endres i koden, og så spørsmålet om `amu:` skal kjøre i flere seter enn
føreren.

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
