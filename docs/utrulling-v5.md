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

## Rekkefølgen, og den er ikke valgfri

1. **Last opp `web/dist/tro.b64` til DATA_URL.** 4,6 MB.
   Gjør dette FØRST. Feiler hentingen, logger boten en advarsel og søker
   uvektet — den mister +0,34 uten at noe ser galt ut.

2. **Bekreft at den serveres** før noe annet. Samme grunn.

3. **Bygg bunten på nytt:**
   ```
   npx esbuild web/app.ts --bundle --format=esm --charset=utf8 --minify \
     --outfile=web/dist/app.js
   ```

4. **Last opp `web/dist/app.js`.**

5. **Bekreft at appen melder «Adams-v5»** i logg-ID-en. Versjonsstrengen er
   allerede bumpet i kilden. Uten den blandes familiens runder mot v3 og v5 i
   samme rad i basen, og da kan INGEN av dem måles.

6. **Bekreft md5 av serverte vekter mot lokale**, som ved v3.

## BLOKKERT: søket kan ikke rulles ut ennå

`SØKVERDENER` står på **0**, og bunten er derfor trygg — den er v4 med bumpet
versjonsnavn.

`velgHandling` kalles SYNKRONT på hovedtråden. Workeren finnes, men ingen
motstander bruker den lenger. Slås søket på nå:

    12 kort x ~4 s i nettleser  =  ~50 sekunder frosset UI per runde
    og boten er foerer i tre av fire runder (tre botseter)

Siden ville ikke sett treg ut. Den ville sett ut som en krasj, hver runde.

**Søket må inn i Web Workeren før det kan rulles ut.** Gevinsten er ekte og
målt; den er bare ikke leverbar på hovedtråden.

### Hva det konkret krever

`web/worker.ts` holder i dag `BotAgent` (PIMC) og kjenner ikke Adams-stakken.
Fire ting må på plass:

1. **Workeren må bygge Adams selv.** Den trenger `E1Agent`, `Konvensjonsvakt`,
   `Budagent`, `Vrakrangerer`, `Rolleorakel` og `Trosnett` – alle er
   bunlbare (verifisert 6. august etter at barrel-importen i `sdkort.ts` ble
   fjernet).

2. **Vektene må dit.** Enten sendes som `ArrayBuffer` via `postMessage` fra
   hovedtråden, som allerede har hentet dem, eller hentes på nytt i workeren.
   Det første unngår dobbel nedlasting av 7 MB.

3. **En meldingstype for kortvalg**, i samme form som `beslutt` for PIMC.

4. **Spillsløyfen må avvente workeren.** Linje ~710 kaller
   `nettAgenter[...].velgHandling(state)` SYNKRONT. Det er det ene stedet som
   må bli asynkront, og det er også der UI-frysen oppstår.

### Og den må testes I EN NETTLESER

Ingen av dette er kjørt utenfor Node. Bunting og typesjekk sier ingenting om
hvordan 4,6 MB base64, `Trosnett`-konstruksjonen og søket oppfører seg i en
nettlesermotor på familiens maskiner.

Måltallet å sikte mot: **under 1 sekund per kort**, målt på den tregeste
maskinen familien faktisk bruker – ikke på utviklingsmaskinen.

## Priser og forbehold

**~1,3 sekund per kort NÅR BOTEN ER SPILLEFØRER**, altså i én av fire runder,
målt i Node på en rask maskin. I en nettleser må det ventes 2–5x. Sett
`SØKVERDENER = 0` i `web/app.ts` for å slå søket av uten andre endringer.

**Nedlastingen dobles:** 2,4 MB kortvekter + 4,6 MB trosnett. Det finnes
allerede en `.gz.b64`-variant i `web/dist` som presedens hvis det blir for
tungt på mobil.

**`bud-menneske.json` er IKKE med i v5.** Den er kalibrert mot familiens
faktiske budgivning (§47, §50) og er trolig riktigere for appen enn
selvspilltabellen — men den kan ikke måles på benkene våre, som spiller fire
bots. Den står som et eget, ubesluttet valg.
