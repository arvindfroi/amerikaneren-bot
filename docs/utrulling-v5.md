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
