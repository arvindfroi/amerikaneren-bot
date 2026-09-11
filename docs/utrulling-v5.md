# Adams-v5 — utrullingssjekkliste

> **10. AUGUST: LISTA ER HALVVEIS UTFØRT, OG DET ER VERRE ENN IKKE UTFØRT.**
> Se «Målt mot det levende endepunktet» nederst. Steg 1 og halve steg 2 ER
> gjort — `app.js` ute er bit-identisk med `web/dist/app.js` — mens
> `worker.js` og budmodellene aldri ble lastet opp. Setningen under, om at
> familien «møter fortsatt v3», er derfor **feil siden 6. august**.

Alt i denne lista er **forberedt, ikke utført**. `web/dist/app.js` er urørt, så
familien møter fortsatt v3 til noen kjører stegene under.

## Hva v5 er

    v5 = v4 + soek i foerersetet, med trosvektede verdener

    vr:vrakrang.bin:telrd : budm:bud-vant.json@-3.0 : vakt:abmp : e1:d7alle.bin
      + Rolleorakel("foerer", 24 verdener, trosnett, 32 kandidater)

## Målt

| | i førersetet | tegntest |
|---|---|---|
| søk, 24 verdener | +1,667 | z = +4,91 |
| **søk, 24 verdener + tro** | **+2,009** | z = +5,14 |
| søk, 48 verdener | +1,962 | z = +6,44 |

Førersøket er replikert over fire uavhengige frøbånd. Trosvektingen gir +0,34
oppå, og gjør samme nytte som å doble verdenstallet.

På kampbenken flyttet førersøket alene en menneske-ekvivalent motstander fra
**20,21 % til 15,83 %** vinnerandel.

**FORSVARSSØK ER IKKE MED**, og det er målt: −0,027 med z = −0,55.

## RETTET 6. august: v5 sendte den SVAKERE søkevarianten

Workeren bygde `Rolleorakel` — alltid-søk — mens målingen viste at
konfidensporten er både sterkere og billigere:

| variant | i førersetet | pris |
|---|---|---|
| **`sik` σ=0,5** | **+1,78 / +1,68** (to bånd) | **198 ms** |
| `ork` (alltid) | +1,25 | 329 ms |

Jeg målte den bedre og sendte den dårligere. Nå bygger workeren `Sikkerorakel`
med σ = 0,5, begrenset til førersetet.

## Trosnettet er DROPPET, og det er en målt beslutning

Trosvektingen ga +0,34 poeng per runde i førersetet i ett frøbånd og **−0,12 i
det disjunkte**. Fortegnet snur, altså er den ikke etablert. Den ville kostet
4,6 MB nedlasting og en ny feilmodus for en gevinst vi ikke kan vise.

`TROFIL = null` i `web/app.ts`. Fila trenger ikke lastes opp.

## BudQ — budet som et lært valg (11. september, PÅ)

**Rullet ut 11. september kl. 10:40 (maskintid, Tokyo) som fac2ec0**, v12-2026-09-11.
Slått av/på med `BUDQ_PÅ` i `web/app.ts`. Utrullingen var tre ting, i denne rekkefølgen:
fast-forward av `claude/lokal-trening-oppsett` (Vercel), `/adams-budq.b64` inn i
valens `PROXY`-tabell, og `PINNE` flyttet til commiten. Uten PROXY-raden svarer valen
HTML med status 200, og appen faller stille tilbake til budmodellen.
Verifisert byte for byte etter utrullingen: Vercels `dist/app.js` og valens `app.js`,
`worker.js` og `adams-budq.b64` er lik commiten, og `VENTET` i index.html = bundelen.
Prøvd lokalt først med `examples/spill-lokal.ts` (vektene fra `web/dist`, logg-POST holdt
tilbake): hel runde, `start` med `modeller.budq = true`, søket 1 ms–3,3 s under full CPU-last.

- **Fil:** `web/dist/adams-budq.b64` (563 KB) = base64 av `budq-s2.bin` (sha1 91a8d6bdd8b7).
  Den må ligge der appen henter modeller (samme sted som `adams-kort.b64`).
- **Hva som endres:** `budm:bud-menneske.json@-3.0` byttes mot `budq:` i BEGGE tråder
  (`byggAdams` med `budqPå`). Søket, vakten og kortnettet er uendret.
- **Målt:** appens kjede med BudQ mot dagens på samme 400 frø +0,075 ± 0,013 i vinnerandel;
  søkfritt i to disjunkte bånd +0,058 og +0,049. Lært mot Adams, ikke mot mennesker.
- **Sjekk etter utrulling:** `start`-raden skal ha `modeller.budq = true`; `bottrekk`/`runde`
  viser budene. Følg menneskenes vinnerandel og marginen (BudQ taper med ~4 poeng mer når den taper).

## Rekkefølgen

> **OMSKREVET 10. august.** Steg 2 sa «last opp», og det var feil premiss:
> `main.ts` i Val Town-valen PROXYER fra GitHub raw. `/app.js` sto i den
> tabellen, `/worker.js` ikke, og de to budmodellene sto i ingen. Derfor
> deployet `app.js` seg selv ved push i ukevis, mens workeren ble servert fra
> en statisk fil fra 24. juli og budmodellene falt gjennom til datasidens
> HTML-svar — 209 kB `<!doctype html` med status **200**.
>
> Rutene er lagt inn nå. **Utrulling er en push**, ikke en opplasting.

1. **Bump versjonsstrengen BEGGE steder, i samme commit:**
   `BUNDELVERSJON` i `web/app.ts` og `VENTET` i `web/index.html`.

   De er et håndtrykk: står de ulikt, skriver siden avviket på skjermen i
   stedet for å vise en halvgammel utgave i stillhet. Bumper du bare den ene,
   varsler siden om en feil som ikke finnes. Bumper du ingen, er den blind.

2. **Bygg buntene på nytt:**
   ```
   npm run bygg-web
   ```
   Det er `verktoy/bygg-web.mjs`: esbuild `--bundle --format=esm
   --charset=utf8 --minify` for BEGGE buntene. **Rettet 11. september:** her sto
   «uten `--minify`», men de committede buntene var minifisert (reprodusert
   byte for byte med esbuild 0.28.1). Lista beskrev en annen artefakt enn den
   som lå i repoet. Sammenlikn alltid bygg med SAMME kommando.

3. **Commit og push.** Da er `app.js`, `worker.js` og begge budmodellene ute:
   valen henter dem fra GitHub raw ved neste forespørsel.

4. **Kjør sjekken:**
   ```
   node verktoy/sjekk-utrulling.ts --ut analyse/utrulling-sjekk.txt
   ```
   Den validerer INNHOLDET, ikke statuskoden, og sammenlikner hash mot lokal
   kopi. En 200 betyr ingenting her — det var nettopp en 200 med HTML som
   skjulte at budmodellen hadde vært av siden 6. august.

5. **Spillsiden (`index.html`) ligger på Vercel**, ikke i valen. Den følger
   git-koblingen til prosjektet `project-a9l2n` med `web` som rot.

6. **Bekreft i en nettleser** at logg-ID-en melder riktig versjon. Uten den
   blandes familiens runder mot ulike versjoner i samme rad i basen, og da
   kan INGEN av dem måles.

## FORELDET AVSNITT — RETTET 6. august

Her sto det at soekevidden var satt til null, og at bunten derfor var trygg.
Det var sant da avsnittet ble skrevet, og det er ikke sant naa.

`SØKVERDENER` står på **24**, og workeren finnes.

Avsnittet var farlig nettopp fordi resten av dokumentet var riktig: den som
leste toppen fikk vite at workeren var på plass, og den som leste bunnen fikk
vite at søket var av. Begge kunne ikke stemme.

`test/utrullet-lik-maalt.test.ts` håndhever nå at tallet i denne fila er det
samme som i `web/app.ts`. Driver de fra hverandre igjen, feiler testen.

De fire kravene under er OPPFYLT, og står igjen som beskrivelse av hva som ble
gjort — ikke som gjenstående arbeid:

1. **Workeren bygger Adams selv.** `web/worker.ts` bygger `E1Agent`,
   `Konvensjonsvakt`, `Budagent`, `Vrakrangerer` og `Sikkerorakel`. Buntbart
   siden barrel-importen i `sdkort.ts` ble fjernet.
2. **Vektene sendes som `ArrayBuffer`** via `postMessage` fra hovedtråden, som
   allerede har hentet dem. Ingen dobbel nedlasting.
3. **`adams-init` / `adams-trekk`** er meldingstypene for kortvalg.
4. **Spillsløyfen avventer workeren** for førerens kortvalg.

### Og den må testes I EN NETTLESER

Ingen av dette er kjørt utenfor Node. Bunting og typesjekk sier ingenting om
hvordan 4,6 MB base64, `Trosnett`-konstruksjonen og søket oppfører seg i en
nettlesermotor på familiens maskiner.

Måltallet å sikte mot: **under 1 sekund per kort**, målt på den tregeste
maskinen familien faktisk bruker – ikke på utviklingsmaskinen.

## Det som IKKE er gjort, og som bør gjøres

**Tempoet er ikke målt på familiens maskiner.** 24 verdener koster ~1,3 s per
kort i Node på en rask maskin. På en telefon kan det bli 4–8 s, og tolv kort i
førersetet blir da et helt minutt per runde — uten frys, men fortsatt
uspillbart. `SØKVERDENER` bør settes etter en måling på den TREGESTE maskinen
familien faktisk bruker, ikke på utviklingsmaskinen.

**Ingen «tenker…»-indikator.** Flere sekunders pause uten tilbakemelding ser ut
som at spillet henger, selv når det ikke gjør det.

**`bud-menneske.json` er fortsatt ubesluttet** (§47, §50).

## Priser og forbehold

**~1,3 sekund per kort NÅR BOTEN ER SPILLEFØRER**, altså i én av fire runder,
målt i Node på en rask maskin. I en nettleser må det ventes 2–5x. Sett
sett soekevidden til null i `web/app.ts` for å slå søket av uten andre endringer.

**Nedlastingen dobles:** 2,4 MB kortvekter + 4,6 MB trosnett. Det finnes
allerede en `.gz.b64`-variant i `web/dist` som presedens hvis det blir for
tungt på mobil.

## MÅLT MOT DET LEVENDE ENDEPUNKTET — 10. august

Ikke lest av lista, ikke antatt: hentet med `curl` og prøvd i en nettleser.

| fil | ute | lokalt | dom |
|---|---|---|---|
| `app.js` | 692 461 B, md5 `9a8ff21a…` | **identisk** | v5 ER ute |
| `worker.js` | 20 761 B | 598 836 B | **gammel** |
| `bud-menneske.json` | HTML-fallback | finnes | **aldri lastet opp** |
| `bud-vant.json` | HTML-fallback | finnes | **aldri lastet opp** |
| `bud-gbt.json` | 322 134 B | finnes | ute (v3-modellen) |
| `adams-kort.b64`, `adams-vrak.b64` | riktig | — | ute |

### 1. Workeren svarer på meldinger den ikke kjenner — med feil bot

Den utrullede `worker.js` inneholder verken `"adams-init"` eller
`"adams-trekk"`. `onmessage` er en kjede av `if (m.type === …) return;` som
ender i en **ukommentert felle**: alt som ikke er `init` eller `pondre` faller
gjennom til `beslutt`-grenen.

Prøvd i en nettleser (`scratchpad/worker-probe.mjs`):

```
adams-init   -> {"feil":"TypeError: … undefined (reading 'fase')"}
adams-trekk  -> {"id":4242,"feil":"TypeError: … undefined (reading 'antallStikk')"}
```

Begge feilene kommer fra `beslutt`-grenen, og `adams-trekk` svarer **med
forespørselens id**. Med en EKTE stilling kaster den ikke — den returnerer
`{ id, handling }`, altså et lovlig kort valgt av den gamle PIMC-agenten med
tomme opsjoner (`init` sendes aldri i «Vaar»-løypa). Appen kan ikke se
forskjell, godtar det, og logger `soek: { brukt: true }`.

**Førersetets kortvalg — tre av fire runder — har vært tatt av PIMC**, som
taper 72,6 ± 8,5 poeng per kamp mot MesterAI der Adams taper 5,0 ± 1,5. Ikke
et stille fall tilbake: et stille BYTTE.

Rettet i `web/app.ts` med en **kvittering**: workeren svarer `{ klar: true }`
på `adams-init`, og `adams-trekk` sendes ikke før den er kommet. En eldre
worker kjenner ikke feltet og faller ut av veien i stedet. Uteblir
kvitteringen, spiller hovedtrådens søkfrie Adams — svakere enn Adams med søk,
mye sterkere enn PIMC. **Dette gjør ikke søket levende igjen; det krever at
`web/dist/worker.js` faktisk lastes opp.**

### 2. Budmodellen har ikke vært i bruk siden 6. august

Konstanten ble 6. august flyttet fra `bud-gbt.json` til `bud-menneske.json`
med `bud-vant.json` som reserve. **Ingen av de to er lastet opp.** Val Town
svarer 200 med HTML, `hentBudmodell` gjør riktig og returnerer `null` for
begge, og kjeden hadde ikke noe tredje ledd — så appen falt helt ned på
NevroHjernes budgivning. Konsollen sa det hver eneste gang; ingen leser en
nettleserkonsoll på en iPad i sofaen.

Målt kostnad: `bud-gbt` mot ingen budmodell er **+0,618 ± 0,166 poeng per
runde (3,7 SE)** parret mot MesterAI. Det er det familien har spilt uten.

`web/app.ts` har nå `BUDMODELL_SISTE_UTVEI = "bud-gbt.json"` som tredje ledd.
Det er en **nødbrems, ikke rettelsen** — rettelsen er å laste opp
`bud-menneske.json`.

### 3. Testhullet

`test/utrullet-lik-maalt.test.ts` håndhever at reserven er en ANNEN fil enn
hovedmodellen, med begrunnelsen «feiler den ene, feiler den andre likedan».
Nøyaktig det skjedde — og testen var grønn, fordi den sjekker at navnene er
ulike, ikke at filene er UTLAGT. En test som sjekker det levende endepunktet
er det som mangler.

### 4. Byggekommandoen i denne lista stemmer ikke med artefakten

Lista sier `--minify`. Den utrullede `app.js` begynner med `// src/kort.ts`,
altså esbuilds filgrense-kommentar — **den er ikke minifisert**. `worker.js`
er det. To artefakter, to byggekommandoer, én dokumentert.

Det er ikke uskyldig: første forsøk på å måle `src/`-driften sammenlignet en
minifisert ny bunt mot den umminifiserte utrullede og «fant» 70 KB forskjell.
Målt riktig, begge umminifisert:

| | byte |
|---|---|
| utrullet `app.js` | 692 461 |
| gammel `web/app.ts` + dagens `src/` | 700 804 |
| ny `web/app.ts` + dagens `src/` | 705 304 |

**`src/`-driften er 8 343 B, ikke 70 000.** Frontend-endringene er 4 500 B.
Fjortende-og-litt-til utgave av «det målte var ikke det jeg mente» — fanget
før det rakk inn i en beslutning, men bare så vidt.

`web/dist/app.js` bygges nå UTEN `--minify`, slik den utrullede er, så en
opplasting endrer én ting av gangen. Skal den minifiseres, er det en egen
beslutning.

MLB, sumvelgeren og vaktendringene fra 8.–10. august følger uansett med i
enhver ny bunt, og de er ikke målt i appens miljø. Det er lite kode, men det
er ikke null.

**`bud-menneske.json` er IKKE med i v5.** Den er kalibrert mot familiens
faktiske budgivning (§47, §50) og er trolig riktigere for appen enn
selvspilltabellen — men den kan ikke måles på benkene våre, som spiller fire
bots. Den står som et eget, ubesluttet valg.

---

## 10. august: utrullingen av frontend, og hvorfor den stoppet

**Produksjon står på v8** (82 700 byte, verifisert). Runde 5 er bygd og klar,
men ikke live.

### Rørgata virker — bortsett fra ett felt

Git-koblingen fyrer: hver push til `claude/lokal-trening-oppsett` bygger, og
byggingen er grønn. Men **hver eneste bygging lander som `target: null`**,
altså forhåndsvisning.

Testet: en push til `claude/game-solving-8ttl69` (den gamle standardgrenen)
bygde også, og også den ble `target: null`. **Ingen av grenene er
produksjonsgrenen.** Vercel peker på noe tredje — sannsynligvis `main`, som
ikke finnes i dette repoet. Derfor kan ingen push bli produksjon, uansett gren.

Feltet ligger under *Settings → Environments → Production → Branch Tracking* i
dagens Vercel-grensesnitt, og kan ikke settes gjennom API-et jeg har.

### Metoden vi brukte for v8 er IKKE trygg, og skal ikke gjentas

v8 ble rullet ut ved å skrive `index.html` av inn i et `deploy_to_vercel`-kall.
Det gikk bra. **Neste forsøk gjorde det ikke:** payloaden som ble bygget var en
stump med tomt `<style>` og tom `<body>`, og bare tillatelseskontrollen hindret
at produksjon ble en blank side.

Grunnen er strukturell, ikke uflaks: metoden krever at ~95 kB skrives av ordrett
av en språkmodell. Verifisering etterpå fanger feilen — men først etter at
produksjon er ødelagt, og en tilbakerulling ville krevd nok en avskrift.

Fila har dessuten CRLF, og et verktøykall kan ikke bære CR. Byte-eksakt
gjengivelse er umulig i utgangspunktet.

### De to trygge veiene

1. **Forfrem den ferdige byggingen** i Vercel-panelet. Byte-eksakt, allerede
   bygd, ett klikk. Runde 5 er `dpl_CAPbBi4ew9wgFhVRxHXAkBVGn3BT`.
2. **Sett produksjonsgrenen** til `claude/lokal-trening-oppsett`. Da blir
   utrulling en push, for alltid, uten avskrift.

Nummer to er den varige. Nummer én løser dagen.
