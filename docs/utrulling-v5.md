# Adams-v5 — utrullingssjekkliste

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

## Rekkefølgen

1. **Bygg buntene på nytt:**
   ```
   npx esbuild web/app.ts --bundle --format=esm --charset=utf8 --minify \
     --outfile=web/dist/app.js
   ```

2. **Last opp `web/dist/app.js` OG `web/dist/worker.js`.** Begge, og
   workeren er ny — uten den faller boten tilbake til spill uten søk.

3. **Bekreft at appen melder «Adams-v5»** i logg-ID-en. Versjonsstrengen er
   allerede bumpet i kilden. Uten den blandes familiens runder mot v3 og v5 i
   samme rad i basen, og da kan INGEN av dem måles.

4. **Bekreft md5 av serverte vekter mot lokale**, som ved v3.

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

**`bud-menneske.json` er IKKE med i v5.** Den er kalibrert mot familiens
faktiske budgivning (§47, §50) og er trolig riktigere for appen enn
selvspilltabellen — men den kan ikke måles på benkene våre, som spiller fire
bots. Den står som et eget, ubesluttet valg.
