# Gammelkode-revisjonen

Arvind, 9. august: «vi har hatt en veldig patchwork ordning med gamle deler og
mye svikt så det må vurderes. sunken cost.»

Presisert i dag: innvendingen er ikke modularitet. Den er **gammel, utdatert
kode og komponenter som vi bygger videre på**.

Dette er en REVISJON. Ingenting er slettet, ingen atferd er endret. Hvert punkt
under har en filreferanse eller et paragrafnummer. Der jeg er usikker, står det.

**Metode.** Importgrafen er bygd mekanisk fra de tre faktiske inngangene
(`web/worker.ts`, benkene `examples/gate2.ts` + `kamp.ts` + `matrise.ts`, og
`src/mlb/`), og resten er lest manuelt. 108 `.ts`-filer i `src/` + `web/`.
`docs/plan.md` er lest fra §1.

---

## SAMMENDRAG — de fem funnene som betyr noe

| # | funn | klasse | status |
|---|---|---|---|
| 1 | `web/dist/worker.js` er 57 commits gammel. Duplikatkjeden `utrullet.ts` fjernet er fortsatt den som KJØRER. | målt ≠ utrullet | **RETTET** (10. aug) |
| 2 | `web/app.ts` bygger kjeden FOR HÅND og tar flertallet av beslutningene. `byggUtrullet` fikset workeren, ikke appen. | målt ≠ utrullet | ikke etterprøvd |
| 3 | `examples/matrise.ts:100` kaller `rask` «den utrullede boten i dag». Det er den ikke. §118s hovedtall hviler på det. | målt ≠ utrullet | **RETTET** (2. sep) |
| 4 | Hovedtråd og worker er to ulike bots over samme beslutning, og oppløsningsregelen er en **stoppeklokke**. | lokalt optimum ødelegger avtale | ikke etterprøvd |
| 5 | `docs/utrulling-v5.md` sier `bud-menneske.json` ikke er med. `web/app.ts:147` laster den. | målt ≠ utrullet | **fortsatt live** |
| 6 | Vakten mot rivaliserende spek-parsere kan **ikke feile**, og det står 14 rivaler bak den. | målt ≠ utrullet | ikke etterprøvd |
| N14 | **Reservekjeden for budmodellen er usynlig i dataene.** Hvilken av tre modeller som faktisk kjørte sier ingen logget rad noe om. | målt ≠ utrullet | **RETTET** (10. sep) |

## N14 — reservekjeden er godt bygd, men utfallet havner ingen steder (ny 2. september)

**Dette er ikke en svelget feil.** `hentBudmodell` (`web/app.ts:321`) er en av de
bedre vaktpostene i repoet: den fanger Val Towns 200-med-HTML eksplisitt, kaller
`tolkBudmodell` med én gang så feil `dim` utløser reserven i stedet for å bli
avvist lenger nede, og roper `console.warn` på hvert trinn. Kjeden er

    bud-menneske.json  →  bud-vant.json  →  bud-gbt.json

**Problemet er hvor ropet havner.** `console.warn` går til nettleserkonsollen på
farmors iPad. Ingen leser den. Og `logg("start", …)` (`web/app.ts:1151`) skriver
`motstander` og `styrke` til Val Town — altså hvilken bot vi MENTE å kjøre —
men **ingen rad sier hvilken budmodell som faktisk vant kjeden**.

Hvorfor det betyr noe, konkret: stedfortrederstigen 1. september målte at å
fjerne budmodellen koster **18,2 prosentpoeng** vinnerandel — den klart største
enkeltkomponenten i stakken. `docs/utrulling-v5.md:167` sier samtidig at
`bud-menneske.json` «aldri [ble] lastet opp». I praksis faller kjeden altså
trolig til `bud-vant.json`, som er nettopp modellen `ADAMS`-speken navngir, og
alt stemmer. Men **det er en slutning, ikke en måling**: ingen logget rad kan
bekrefte den for noen enkelt økt.

Konsekvensen for K1: hver rad i Val Town-basen er merket «Adams-v5» uansett
hvilken av tre budmodeller som kjørte. Skulle `bud-menneske.json` bli lastet opp
en dag, ville den utrullede botens sterkeste komponent byttes ut i stillhet, og
menneskeandelen ville blande to populasjoner uten at én eneste rad viste det.
Det er samme feilklasse som resten av fila: ikke en feil som krasjer, men en
konfigurasjon som ikke kan etterprøves i ettertid.

**RETTET 10. september.** `oppløst` i `web/app.ts` noterer hvilke filer som
faktisk vant hver reservekjede, og `logg("start", …)` skriver dem til Val Town
som feltet `modeller`. `start` logges etter `await besteBot()`, så feltene er
alltid utfylt. `null` i `bud` betyr at alle tre falt bort og at NevroHjernes
budgivning kjørte — en helt annen bot, nå synlig som det.

Kilde og bunt er bygd og committet i samme steg, slik funnet selv krevde.

**Verifisert ende-til-ende i Chromium, på den bygde bunten — ikke på kilden.**
To armer, med alle Val Town-kall avskåret så ingen testrad nådde
produksjonsbasen:

| arm | `bud-menneske.json` | `modeller.bud` som ble logget |
|---|---|---|
| B (som i produksjon) | svarer 200 med HTML | **`bud-vant.json`** |
| A | finnes | **`bud-menneske.json`** |

Arm B er den som betyr noe: at kjeden faller til `bud-vant.json` var til nå en
SLUTNING fra `utrulling-v5.md`. Nå er den målt, og fra 10. september står den i
hver eneste loggede rad.

Merk at `tro` logges som `false`: trosnettet er av med vilje (`TROFIL === null`,
en målt beslutning — fortegnet snudde mellom frøbånd). Det er ikke en feil, men
det er nå synlig i stedet for å måtte leses ut av en kommentar.

### Sidefunn: de to buntene var bygd med ULIKE flagg

Ombyggingen avslørte det. Den utrullede `web/dist/app.js` var **ikke
minifisert** — 5 140 linjer, 721 kB, med `// src/kort.ts`-kommentarer i klartekst
— mens `web/dist/worker.js` var det (én linje). `MESTERAI-NETT.md` dokumenterer
`--minify` for **begge**.

Ingen har altså kjørt den dokumenterte kommandoen for `app.js`. Det er samme
familie som resten av fila: ikke en feil som krasjer, men et avvik mellom det
som står skrevet og det som er rullet ut, som ingen prøve kunne se.

`app.js` er nå bygd med den dokumenterte kommandoen: 110 linjer, 632 kB, **88 kB
mindre over mobilnett**. `--minify` i esbuild bevarer semantikk, og den
minifiserte bunten er den som ble kjørt i Chromium-verifiseringen over — så det
er den, ikke kilden, som er prøvd.

Dette er en endring i utrullet artefakt utover selve N14-fiksen, og den skal
leses som det. Vil du ha den gamle formen tilbake, er det å utelate `--minify`;
men da avviker `app.js` fra både `worker.js` og fra utrullingslista igjen.

---

## Etterprøving 2. september 2026

Denne fila hadde alle seks funn merket «live» i tre uker etter at minst ett av
dem var rettet. **En revisjon som ikke oppdateres blir selv til gammelkode**, og
overrapporterer gjelden akkurat som en foreldet måling overrapporterer styrken.
Tre av seks er etterprøvd nå; de tre andre er ærlig merket som ikke etterprøvd
heller enn å bli gjettet på.

- **N1 er rettet, og fra 10. september VOKTET.** `git log` viser 0 commits
  mellom `web/worker.ts` og `web/dist/worker.js`, og likeså for `app.ts`.
  Utrullingsrunden 10. august («UTRULLET: alle atte filer stemmer») lukket den.
  Men den kunne komme tilbake usett: `utrullet-lik-spek` og `spek-en-kilde`
  leser begge KILDEN, og en bunt bygd fra en eldre kilde består begge to — den
  er internt konsistent, bare foreldet. `test/bunt-ikke-foreldet.test.ts` spør
  nå git om det finnes commits som rører kilden etter siste bunt-commit, og
  gjør dermed N1 til en rød test i stedet for noe man må huske.
- **N3 er rettet 2. september.** `rask` er nå `ADAMS_MAALT` importert fra
  `agentspek.ts`, med strengen uendret så historiske matrise-tall fortsatt
  gjelder. Påstanden om at den var den utrullede boten er borte, og
  `test/spek-en-kilde.test.ts` pinner at `rask ≠ ADAMS`.
- **N5 står fortsatt.** `web/app.ts:168` setter `BUDMODELL =
  "bud-menneske.json"` og linje 416 laster den, mens `utrulling-v5.md:167` sier
  at fila «aldri [ble] lastet opp». I praksis faller kjeden gjennom til
  `bud-vant.json` — som er nettopp modellen `ADAMS`-speken navngir — så
  avviket er godartet i dag. Det er likevel to kilder som sier ulike ting om
  hvilken budmodell som kjører, og hvilken av dem som har rett avhenger av
  hva som ligger på CDN-en. Ikke rettet her: §147 kaller valget «ubesluttet»,
  og det er en produktbeslutning, ikke en opprydding.

---

# NYE FUNN — feilklasse 1: «det målte og det utrullede var ikke samme ting»

Planen teller 14 forekomster (§118). Her er de jeg fant ved lesning.

## N1. Bunten er aldri bygd på nytt — duplikatkjeden lever i produksjon

Dette er det viktigste funnet i revisjonen.

```
src/moe2/utrullet.ts       8. aug 03:49    (commit 10a95ed)
web/worker.ts              8. aug 17:24    (commit 6e3b5ac)
web/dist/worker.js         6. aug 04:48    (commit 10a95ed)   <-- 57 commits bak
```

Commit `6e3b5ac` heter **«Workeren bruker naa byggUtrullet - duplikatkjeden er
borte»**. Diffen rører nøyaktig to filer: `web/worker.ts` og
`test/utrullet-rekkefolge.test.ts`. `web/dist/worker.js` er ikke rørt siden
`10a95ed`, og `git log -- web/dist` viser ingen commit etter den.

Duplikatkjeden er altså **ikke** borte. Den er borte i kilden. Artefakten som
serveres er fortsatt den håndbygde:

```
Sikkerorakel(Vrakrangerer(Budagent(Konvensjonsvakt(E1Agent))))
```

med søket YTTERST — mens `src/moe2/utrullet.ts:44` slår fast at kjeden skal
være `Vrakrangerer ∘ Alphamuagent ∘ Profilagent ∘ Budagent ∘ Konvensjonsvakt ∘
E1`, altså med `vr:` ytterst.

`test/utrullet-rekkefolge.test.ts` målte de to rekkefølgene til identiske valg
over 80+ beslutninger, så den praktiske forskjellen i dag er trolig null.
**Men påstanden i commit-meldingen, i `utrullet.ts`-filhodet og i
`web/worker.ts:104-122` er usann om det som kjører.** Filhodet i `utrullet.ts`
lister fem ting som «IKKE i den utrullede boten» og presenterer seg som kuren.
Kuren er ikke rullet ut.

`docs/utrulling-v5.md` steg 1 er «Bygg buntene på nytt». Det er ikke gjort.

Samme fil påstår i første avsnitt: «`web/dist/app.js` er urørt, så familien
møter fortsatt v3». `git log -- web/dist/app.js` viser at den er bygd på nytt
minst to ganger siden (`5df2571`, `10a95ed`). Også den setningen er foreldet —
tredje foreldede påstand i den ene fila, etter §62 og §64.

**Ikke slett noe.** Kuren er å bygge buntene og verifisere i en nettleser, slik
lista allerede sier.

## N2. `web/app.ts` bygger kjeden for hånd — og tar de FLESTE beslutningene

`src/moe2/utrullet.ts` finnes for å ha ÉN byggefunksjon. Den er tatt i bruk i
`web/worker.ts:142`. Den er **ikke** tatt i bruk i `web/app.ts`:

```
web/app.ts:363-378    new Konvensjonsvakt(E1Agent.fraBytes(...), lesVaktflagg(VAKTFLAGG))
                      -> new Budagent(kort, tolkBudmodell(budRå), BUDTERSKEL)
                      -> medVrakrangerer(bot, vrakB64)     [linje 308-321]
```

Det er nøyaktig `byggUtrullet({... søk: null})`, skrevet en gang til. To kjeder
uten felles kode — den formen `utrullet.ts:9-11` selv utpeker som «selve
årsaken til prosjektets mest gjentatte feil».

Og appens kjede er ikke en reserve. Den er hovedveien:

```
web/app.ts:895-896
  const børSøke = SØKVERDENER > 0 && state.fase === "SPILL"
                  && aktør === state.budvinner && råVekter !== null;
```

Workerens Adams svarer altså BARE på kortvalg der boten er spillefører. Alt
annet — **hvert bud, hvert vrak, hvert trumfvalg, og hvert kortvalg i makker-
og forsvarssetet** — avgjøres av appens håndbygde kjede (`app.ts:917`).

Grovt regnet er det tre av fire kortvalg pluss hele budrunden og hele
vrak/trumf-beslutningen. Flertallet av botens beslutninger tas av kjeden som
ingen test binder til speken.

`test/utrullet-lik-spek.test.ts` binder `byggUtrullet` til `lagIndre`.
`test/utrullet-lik-maalt.test.ts` binder appens **strengkonstanter** til
`ADAMS`. Ingen av dem binder appens KJEDE til noe. Faller et lag ut av
`besteBot()`, er alle tester grønne.

**Kuren er å la `besteBot()` kalle `byggUtrullet` med `søk: null`.** Det er
ingen atferdsendring i dag; det er å fjerne den andre kopien.

## N3. `matrise.ts` kaller feil bot «den utrullede», og §118 hviler på det

```
examples/matrise.ts:99-100
  /** «Rask»: ingen søk, ingen hukommelse. Den utrullede boten i dag. */
  rask: `${VR}:${BUD}:${NETT}`,
```

Den utrullede boten i dag har søk. `web/app.ts:295` `SØKVERDENER = 24`,
`web/app.ts:302` `SØKSIGMA = 0.5`, og `web/worker.ts:153` bygger
`{type: "sik", verdener: 24, sigma: 0.5}` i førersetet. Det laget er målt til
**+1,78 / +1,68 poeng per runde i førersetet** (`utrulling-v5.md`, §48, §53).

I tillegg er `NETT` i matrisen `vakt:abmpf`, mens appen kjører `abmp`
(`app.ts:83`). `f` er +0,031 (`agentspek.ts:84-90`). Bevisst per
`ADAMS_MAALT`-konvensjonen — men da kan ikke armen samtidig hete «den utrullede
boten».

Følgen for §118: overskriften er «dagens tillegg koster 0,8 poeng/runde» og
«maks er verre enn rask». Rangeringen `maks-uten-nye > rask > maks` står — alle
fem armene er bygd med `lagIndre`, så de er sammenlignbare med hverandre. Det
som IKKE står er tolkningen «altså dårligere enn boten uten søk … i det hele
tatt» (§118, linje 8507-8508): grunnlinjen `rask` mangler det ene søkelaget som
faktisk er utrullet og målt positivt. Vi vet ikke fra §118 hvordan `maks`
ligger an mot **det som spiller**.

Femtende forekomst. Fanget ved lesning av en kommentar, ikke av et krasj.

**Kuren:** enten bygg armen fra `ADAMS` + `sik:foerer:0.5:24:` og la den hete
det, eller stryk påstanden «den utrullede boten i dag» fra kommentaren.

## N4. `docs/utrulling-v5.md` motsier `web/app.ts` om budmodellen

Lista sier to steder:

> «**`bud-menneske.json` er fortsatt ubesluttet** (§47, §50).»
> «**`bud-menneske.json` er IKKE med i v5.** … Den står som et eget, ubesluttet valg.»

Kilden:

```
web/app.ts:147   const BUDMODELL = "bud-menneske.json";
web/app.ts:148   const BUDMODELL_RESERVE = "bud-vant.json";
```

Valget ER tatt, og begrunnet grundig i `app.ts:107-146`. Lista er ikke
oppdatert. Nøyaktig samme form som «FORELDET AVSNITT» lenger opp i den samme
fila, som ble rettet 6. august (§62): den som leser toppen får ett svar, den som
leser bunnen får et annet.

`test/utrullet-lik-maalt.test.ts:137-142` sjekker at lista NAVNGIR hver fil
`ADAMS` bruker. `ADAMS` bruker `bud-vant.json`, så testen er grønn. Ingen test
ser at lista påstår noe FALSKT om en fil appen faktisk laster.

## N5. `nyKamp()` når aldri workerens Adams

`web/app.ts:770` kaller `nyKamp()` på `nettAgenter` — appens egen kjede.
`web/worker.ts:71-87` har fire meldingstyper (`init`, `adams-init`,
`adams-trekk`, `pondre`/`beslutt`). Ingen av dem er `nyKamp`.

`src/moe2/utrullet.ts:129-135` sier eksplisitt hvorfor `byggUtrullet` returnerer
`økt` ved siden av agenten: «fordi kalleren må kunne kalle `nyKamp()` på den
mellom kamper — det er DEN som skiller «én økt» fra «historie»».
`web/worker.ts:157` kaster den: `.agent`.

**I dag er dette ufarlig.** `økt: false` (`worker.ts:156`), så `Profilagent`
ligger ikke i kjeden (`utrullet.ts:151`), og `E1Agent.nyKamp` ender i
`src/nevro/agent.ts:90`, som er tom. Ingen målbar effekt nå.

**Det er en felle.** `worker.ts:154-156` inviterer til å slå på `økt: true` som
«den ene bryteren som slår dem på i appen». Gjør noen det, får K4/K6 aldri vite
at en kamp er slutt: `Økt.antallKamper()` blir stående på 0
(`src/moe2/okt.ts:61-63`), og `Profilagent.nyKamp` (`profilagent.ts:347-360`)
kjører aldri. Bryteren kan ikke slås på riktig slik workeren står.

## N11. Fjorten rivaliserende spek-parsere — og vakten mot dem kan ikke feile

Dette er det største enkeltfunnet etter N1.

`src/moe2/agentspek.ts:480` (`lagIndre`) er hovedparseren, og den kjenner 18
spekformer. Det finnes en test som skal håndheve at den er alene:

```
test/agentspek-en-parser.test.ts:26-38
  for (const mappe of ["examples", "src", "test"]) {
    for (const f of readdirSync(join(ROT, mappe))) {          // <-- IKKE rekursiv
      if (sti === join("src", "moe2", "agentspek.ts")) continue;   // <-- kan aldri treffe
      if (/function lagIndre\s*\(/.test(kilde)) skyldige.push(sti);  // <-- navnebundet
```

Tre grunner til at den er trivielt grønn:

1. `readdirSync` er ikke rekursiv. `src/` har bare fire filer på toppnivå
   (`index.ts`, `kort.ts`, `motor.ts`, `regler.ts`). **Hele `src/moe2/`,
   `src/e1/`, `src/neat/`, `src/nevro/`, `src/mlb/` og `src/solver/` skannes
   aldri.**
2. Beviset står i koden: hoppelinja sammenlikner `join("src", f)` med
   `join("src","moe2","agentspek.ts")`. Den grenen kan ikke treffe. Forfatteren
   trodde løkka gikk dypt.
3. Regexen krever navnet `lagIndre`. Ingen av rivalene heter det.

Bak vakten står minst fjorten filer med sin egen `lag(spek)`, hver med sitt eget
delsett av spekformene. Ingen av dem kjenner `okt:`, `amu:`, `profil:`, `sum:`
eller `eks:`:

```
examples/blandetbord.ts:78-107        vakt, vr, budm, e1
examples/vrakbenk.ts:71-105           vakt, budm, vr, vv2, vv
examples/menneskeklon-data.ts:55-69   vakt, budm, e1
examples/mesterai-konvensjoner.ts:226 vakt, budm, e1
examples/mesterai-fasegap.ts:188-225  e1, vakt, budm
examples/mesterai-h2h.ts:174, 219     budm, e1
examples/rolleanger.ts:88-112         vakt, vr, budm
examples/stikk-kalibrering.ts:69-92   vakt, vr, budm
examples/tro-data.ts:90-112           vakt, vr, budm
examples/tro-sampler.ts:81-104        vakt, vr, budm
examples/vanttabell.ts:29-39          vakt, vr, budm, e1
examples/vrakorakel.ts:69-80          vakt, budm
examples/sd-orakel.ts:380-405         vr, budm
examples/buddata.ts:115-130           vr, e1
```

Og de fleste av dem **taper budterskelen**. `agentspek.ts:522-533` deler hodet
på siste `@` og sender fila for seg. `examples/vrakbenk.ts:81` gjør ikke det:

```
return new Budagent(lag(rest.slice(i + 1)), lesBudmodell(rest.slice(0, i)));
```

`rest.slice(0, i)` er HELE hodet, `@`-halen inkludert, og
`lesBudmodell` (`src/moe2/budagent.ts:51-52`) gjør `readFileSync` på det. Med
`@-3.0` i speken kaster den. Uten `@` blir tredje argument til `Budagent`
udefinert, og `budmodell.ts:260` setter `evForsvar = 2.5`.

**Det er den samme konstanten som ga +0,3127 ± 0,0517 (6,05 SE) da den ble
flyttet fra 2,5 til −3,0** (`web/app.ts:161-166`).

Følgen er verdt å si høyt: `examples/vrakbenk.ts` er benken som produserte
tallene `web/app.ts:176-184` bruker som begrunnelse for å rulle ut
`Vrakrangerer` — inkludert «Adams-miljø, bånd 61 M +0,5752 ± 0,1925». Den
benken kan ikke uttrykke den utrullede budterskelen. Enten kjørte den uten
`budm:` i det hele tatt, eller den kjørte med 2,5.

**Usikkerhet:** jeg vet ikke hvilken spek den kjøringen faktisk brukte — det
står ikke i `web/app.ts` og jeg har ikke funnet kommandolinja. Påstanden her er
begrenset til at benkens parser ikke KAN uttrykke −3,0, ikke at et bestemt tall
er feil.

**Kuren er tredelt og billig:**
* gjør `readdirSync` rekursiv i `test/agentspek-en-parser.test.ts`, fjern den
  døde hoppelinja, og la regexen fange `function lag(` / `lagKandidat(` /
  `lagMotpart(` — ikke bare `lagIndre`
* la benkene importere `lagIndre` i stedet for å skrive sin egen
* ingenting slettes; parserne kan stå til de er byttet ut én for én

## N12. Verktøykjeden er delt mellom `abmp` og `abmpf`

`agentspek.ts:97` fastsetter regelen: «nye målinger og all korpusgenerering
bruker `ADAMS_MAALT`» (`abmpf`). `ADAMS` (`abmp`) er forbeholdt
utrullingsparitet. Skriptene er uenige:

```
abmpf:  verktoy/generasjon.sh:64,222    lagmaal-kjor.sh:31    mvp-dom.sh:84
        rollesok.sh:62                  milepael.sh:98-100
abmp:   verktoy/neste-adams.sh:26       verktoy/vant-fikspunkt.py:49
```

`vant-fikspunkt.py` er ikke et vilkårlig skript. Den itererer `vant[N]` til
fikspunkt og **skriver tabellen inn i `bud-vant.json`** — modellen alle
benkene måler med. Tabellen er altså funnet ved selvspill med `abmp`, og brukes
av `ADAMS_MAALT`-benker som kjører `abmpf`.

Forskjellen er ett vaktflagg verdt +0,031 ± 0,011 (`agentspek.ts:84-90`).
Effekten på `vant[N]` er sannsynligvis liten. Men det er nøyaktig den formen
`ADAMS`/`ADAMS_MAALT` ble innført for å hindre, og
`test/utrullet-lik-maalt.test.ts` dekker bare `web/app.ts` — **ingen test rører
`verktoy/`.**

Jeg er usikker på om `neste-adams.sh` bør ha `abmp` eller `abmpf`. Navnet tyder
på utrullingssiden, der `abmp` er riktig. `vant-fikspunkt.py` er derimot
korpus-/modellgenerering, og der sier regelen `abmpf`.

## N13. `558` er hardkodet der `HVEMLA_FRA` finnes

```
src/e1/hvemla.ts:60      export const HVEMLA_FRA = 558;
src/moe2/agentspek.ts:1264   if (n.lag[0]!.inn >= 558) { ... monteTro ... }
```

Literalen på `:1264` avgjør om `montetro` slås på for et nett. Drifter
`HVEMLA_FRA` uten at literalen følger med, laster nettet uten sin troblokk og
spiller på nuller — stille. Dette er den ene bredde-konstanten som styrer
oppførsel og ikke bare validering.

Andre bredder som står som uavhengige kopier: `273` i `verktoy/e1-tren.py:41`,
`kollaps.py:84`, `mester-tren.py:60`, `sd-kolonner.py:53`, `kryssindeks.py:42`
— bare `verktoy/sd-tren.py:86` (`LOVLIGE_DIM`) er voktet, av
`test/e1-bredder.test.ts:74-89`. Det er den kopien som en gang tok oss
(«`LOVLIGE_DIM` i Python kjente ikke 470 etter v8»,
`test/utrullet-lik-maalt.test.ts:12`); søsknene er fortsatt uvoktet.

---

# NYE FUNN — feilklasse 2: «et lokalt optimum ødelegger en avtale»

`src/moe2/sumvelger.ts:14-21` fører opp fire forekomster:

```
A6 avsender mot A7 leser    de frie kortvalgene, 36,2 %
avsender mot leser          signalkoden var to koder
søket mot vakten            68 % av valgene -> ble til vetoen
DD-fasit mot poeng          -0,609 korrelasjon
```

Følgende står ikke på den lista.

## N6. Oppløsningsregelen mellom hovedtråd og worker er en STOPPEKLOKKE

Samme beslutning — førerens kortvalg — har to optimerere i den utrullede boten:
workerens `sik`-søk og hovedtrådens søkfrie nett. Regelen for hvem som vinner
står her:

```
web/app.ts:536   const tid = setTimeout(() => { venterPåSvar.delete(id); løs(null); }, 20_000);
web/app.ts:912   gjørMedPause(h ?? nettAgenter![aktør - 1]!.velgHandling(state), 250);
```

Rekker ikke søket fram på 20 sekunder, spiller den andre boten. Det er ikke en
avveining mellom to mål — det er maskinvare som avgjør strategi.

Og det er ikke hypotetisk. `docs/utrulling-v5.md`, «Det som IKKE er gjort»:

> «24 verdener koster ~1,3 s per kort i Node på en rask maskin. På en telefon kan
> det bli 4–8 s … `SØKVERDENER` bør settes etter en måling på den TREGESTE
> maskinen familien faktisk bruker.»

Den målingen finnes ikke. På en treg enhet vil boten derfor bytte spillestil
midt i runden, uten at noe feiler. Loggen fanger det (`app.ts:905-911`,
`brukt: h !== null`) — men bare hvis noen leser den, og analysen grupperer på
`BOT_ID = "Adams-v5"` (`app.ts:649`), som er ÉN rad for begge botene.

Dette er samme form som §118s «to like bots ga eksakt 0,0000»: to armer blandet
i én rad. Her er de ulike bots i samme rad.

## N7. Budet og vraket optimerer to ulike mål over samme kontrakt — og lappen er en terskel

`Budagent` velger N ved å maksimere `p·2N(2P−1)`, med μ og σ fra budmodellen
(`src/moe2/budmodell.ts`). `Vrakrangerer` velger deretter (trumf, vrak) ved å
maksimere sitt eget lærte skår (`vrakrang.ts:181-187`). Kontrakten er ÉN av 24
innganger i den scoringen (`vraktrekk.ts:104-105`, `v[18]`), ikke en skranke.

Ingen oppløsningsregel finnes: `Vrakrangerer` ligger ytterst (`utrullet.ts:212`,
`app.ts:378`) og vinner uansett.

Verre: budet ble kalibrert mot en ANNEN vrakpolicy. `web/app.ts:157-159` sier
det rett ut:

> «fordi μ anslås av en modell trent på det GAMLE nettet (og derfor
> undervurderer hvor mange stikk dagens nett tar), ligger optimum under 0»

Kuren som ble valgt er `BUDTERSKEL = -3.0` — én skalar som kompenserer for at
modellen er kalibrert mot en bot som ikke finnes lenger. `agentspek.ts:499-504`
sier det samme om `evForsvar`: «det er ett bestemt ledd som er kalibrert mot en
bot som ikke finnes lenger».

`sumvelger.ts:23-24` navngir nettopp dette som den gjentatte feilkuren:

> «Og «løsningene» har alle vært samme type lapp: en terskel foran
> overstyringen. Vetoen (`v0.5`) er en dør, ikke en avveining.»

Her er lappen anvendt på bud↔vrak-grensen, og den står ikke på lista over fire.
Det treffer også Arvinds egen regel fra minnenotatet: kalibrering hører til i
læringen, ikke i en konstant utenfor den.

**Usikkerhet:** jeg har ikke verifisert hvilken vrakpolicy `bud-vant.json` sine
etiketter faktisk ble laget under. Påstanden om at μ er kalibrert mot en annen
policy er hentet fra `app.ts:157-159`, ikke målt av meg.

## N8. To uavhengige risikojusterere fra samme makrostørrelse

`src/moe2/race.ts` (`r1.5`) justerer SØKETS varians etter kampstillingen.
`src/moe2/budrace.ts` (`kamp1.5`) justerer BUDET etter den samme
kampstillingen. To deler leser samme makrosignal og skyver risiko i to koblede
beslutninger, uten en felles regel for hvor mye risiko kampstillingen skal
kjøpe totalt.

`sumvelger.ts:63` erkjenner hullet i forbifarten: «Og makroleddet går inn i
BEGGE, som er hullet K5→K3.» Men `sumvelger.ts:57-63` sier også at meso (budet)
**ikke** passer inn i summen og må ha sin egen. Kollisjonen overlever altså den
foreslåtte kuren.

Og den har en målt pris: §118 målte `kamp1.5` sammen med `d5` og `B4` til
**−0,805 poeng/runde, 4,2 SE**. §118 sier selv at `kamp1.5` aldri ble kjørt
alene, så andelen er ukjent. Begge er parkert i standard i dag
(`agentspek.ts:141-142`, `budrace.ts:56-60`).

## N9. Partnerskapskoden håndheves asymmetrisk

`Sikkerorakel.velgHandling` (`sikkerorakel.ts:113-125`) returnerer sitt eget
kort med mindre det indre laget er enig. Det indre laget er
`Konvensjonsvakt` — partnerskapets kode.

I den utrullede boten søker BARE førersetet (`utrullet.ts:165`,
`roller: ["foerer"]`). `m` (makker leder laveste trumf i stikk 2) og `p` (makker
trumfer først) er MAKKER-konvensjoner (`konvensjonsvakt.ts:489-490`). Følgen:

* makker holder avtalen alltid — han søker ikke
* fører bryter sin del hver gang σ passerer porten

De to tallene som bærer `abmp` — `m` +0,0404 ± 0,0075 (10 av 10 bånd) og `p`
+0,0039 ± 0,0010 (`app.ts:64-67`) — ble målt UTEN søk i noe sete. Kombinasjonen
som faktisk spilles er aldri målt som kombinasjon.

Planen kjenner den generelle formen: §103 fører opp «Søket overstyrer
konvensjonsvakten» som hypotese 2 for hvorfor `amu:alle` målte −0,2837, og
kaller den «den mest lovende». Det som ikke står noe sted jeg fant, er
**asymmetrien**: at koden i dag brytes av den ene parten og holdes av den
andre, og at det er den varianten som er utrullet.

## N10. `utenSøk` stripper bare fra posisjon 0 — `okt:` skjermer `amu:`

`src/moe2/agentspek.ts:424-469` er en løkke som ser på `s.startsWith(...)`. Er
det fremste laget IKKE et søkelag, returnerer den umiddelbart (linje 466).

`ADAMS_V6` og `ADAMS_V7` begynner med `okt:` (`agentspek.ts:171`, `:229`). Så:

```
utenSøk("okt:vr:...:amu:foerer:...:e1:...")  ==  seg selv, med amu: intakt
```

I dag er dette **ikke nåbart**, fordi alle nåværende kall får en RESTspek der
søkelaget er fjernet av parseren først. Men `sum:`-grenen (`agentspek.ts:832`)
kaller `utenSøk(innSpek)` på en vilkårlig indre spek, og det var akkurat den
grenen som gjorde `amu:`-hullet nåbart i utgangspunktet
(`test/utensok.test.ts`, filhodet). `sum:nett=1,sok=0.5:okt:amu:...` ville
bygget en rollout-motpart som selv søker.

`test/utensok.test.ts` prøver fem speker. Alle fem har søkelaget på posisjon 0.
Ingen av dem har et ikke-søkelag foran. Testen kan ikke se hullet den er skrevet
for å fange.

Samme klasse også: `eks:` (`agentspek.ts:1163`) og `juks:` (`:1200`) er ikke i
`SØKELAG`-lista. `eks:` gjør full enumerasjon; som rollout-motpart ville den
vært svært dyr. Jeg har ikke bekreftet at det er nåbart i dag.

**Kuren er å utvide `utenSøk` til å hoppe over ikke-søkende omslag (`okt:`,
`profil:`, `vr:`, `budm:`, `vakt:`) i stedet for å gi opp, og å legge en
`okt:`-prefikset spek i testen.**

---

# DØDT — nås av ingen inngang

Importgrafen fra `web/worker.ts`, `examples/{gate2,kamp,matrise}.ts` og
`src/mlb/*` når 87 av 108 `.ts`-filer i `src/` + `web/`. Tar man med `web/app.ts`
som fjerde inngang, faller ingen av de under bort — appen når ingen av dem.

Disse 24 nås av **ingen** av de fire inngangene:

| fil | hvem bruker den nå | hva som en gang brukte den |
|---|---|---|
| `src/moe2/eksperter/` (7 filer: `index`, `felles`, `sensorer`, `bud`, `vrak`, `trumf`, `spill`) | `vrakregler.ts`, `sdvrak.ts`, `examples/moe2-*` | MoE2 — seks separate NEAT-populasjoner med deterministisk portvakt (`docs/moe2.md`, 25. juli). Hele arkitekturen er erstattet av E1/Adams-stakken. |
| `src/moe2/port.ts` | `examples/moe2-port-*`, én test | Godkjenningsporten for D8-fasiter. Samme 25.-juli-generasjon. |
| `src/moe2/maaling.ts` | `eksperter/felles.ts`, `examples/moe2-*` | Målekontrakten fra 25. juli. **Denne er verdt å lese før noe fjernes** — filhodet er den beste beskrivelsen i repoet av hvorfor et referansetall uten sitt utvalg er meningsløst. |
| `src/moe2/handnett.ts` | `budvakt.ts`, fire examples | Håndvurderingsnettet. §78 svarte på spørsmålet det ble bygd for: budrunden hjelper stikkanslaget med 0,3 %. |
| `src/moe2/budvakt.ts` | fire examples | PASS→BUD-overstyring. Orakelvarianten er eksplisitt ikke en lovlig spiller (`budvakt.ts:26-36`). |
| `src/moe2/gbt.ts` | `examples/budmodell.ts`, `budmodell-v2.ts` | LEVENDE som offline trener. Ikke død — bare ikke i noen spillende kjede. |
| `src/moe2/regresjon.ts` | `examples/vrak-analyse.ts` | Vektene i `vrakregler.ts` kommer herfra. |
| `src/moe2/vrakregler.ts` | `examples/vrak-analyse.ts` | «INGEN eksplisitt regel her slår nevros vrak» (`vrakregler.ts:15-18`). Parkert som spiller, beholdt som målegrunnlag. |
| `src/moe2/mesterklone.ts` | `sdagent.ts`, `examples/menneskeklon-data.ts` | Mesterklonen. Orakelbundet, se under. |
| `src/moe2/sdagent.ts`, `src/moe2/sdvrak.ts` | tre/én example | SD-korpuslinja. Orakelbundet. |
| `src/e1/orakel.ts` | `examples/e1-orakel.ts`, `d1-obduksjon.ts` | Fasiten E1 destilleres fra. Dobbeltdummy. |
| `src/neat/elo.ts` | `examples/d7-liga.ts`, `d7-liga2.ts` | D7-ligaen. |
| `src/neat/anker.ts`, `angerfitness.ts`, `angerbenk.ts` | `eksperter/spill.ts` + examples | NEAT-fitnesslinja. |
| `src/neat/singledummy.ts` | `budvakt.ts`, `eksperter/bud.ts`, `anker.ts`, ti examples | SD-evaluering. |
| `web/app.ts` | — | Er selv en inngang. Nådd av ingen fordi den er toppen. |

**Merk hva som IKKE er dødt.** Hele `src/neat/`-treet (`evolusjon`, `genom`,
`senat`, `portvakt`, `turnering`, `pool`, `hybrid`, `agent`, `nett`, `trekk`)
nås av benkene, og `src/neat/agent.ts` + `genom.ts` + `nett.ts` + `trekk.ts` nås
av `web/app.ts`. `src/nevro/`-treet er ikke bare levende — `Vrakrangerer` har
en `NevroAgent` innebygd (`vrakrang.ts:102`, `:193-202`) som leverer en av
kandidatene i hvert eneste vrakvalg den utrullede boten tar. **Den eldste
nettgenerasjonen er bærende i dagens bot.**

I `examples/` er 111 av 191 filer ikke nevnt i noen `.md`, `.sh`, `.ps1`, `.py`
eller i `package.json`. For en mappe med engangsbenker er det ikke det samme som
dødt, og jeg har ikke lest dem alle. Tallet står her som et faktum, ikke som en
dom.

---

# DOBLET — to implementasjoner av samme idé

De ekte parene, med den levende først:

| levende | erstattet | hvor det står |
|---|---|---|
| `vrakrang.ts` | `vrakvelg.ts`, `vrakvelg2.ts` | `vrakpolicy.ts:13`; `vrakvelg2.ts:76-80` målte −0,5119 ± 0,2501 |
| `montetro.ts` | `trosnett.ts`, `troprior.ts` | `montetro.ts:19-21`: trosnettet replikerte ikke (+0,34 / −0,12) |
| `sikkerorakel.ts` | `rolleorakel.ts` | `sikkerorakel.ts:4-18`; det rå orakelet er dårligere enn nettet i alle tre roller |
| `stilbias.ts` | `Økt.aggressivitet` | `stilbias.ts:11-23`: «nullpunktet var ikke null» |
| E1/Adams-stakken | `moe2/eksperter/` + `port.ts` | ingen spek når dem |
| `poengdds.ts` (som fasit) | `dds.ts` (som fasit) | `poengdds.ts:19-32`. `dds.ts` lever videre som motor |
| **`byggUtrullet`** | **`web/app.ts:363-378`** | **ikke dokumentert noe sted — se N2** |

Alle de gamle er fortsatt parsebare fra spek (`vv:` `agentspek.ts:1081`, `vv2:`
`:1111`, `ork:` `:656`). Det er riktig — de er ikke slettet — men det betyr at
en spek fra en gammel logg fortsatt bygger en bot ingen lenger vedlikeholder,
uten en advarsel.

To par ser ut som dubletter og er det ikke: `budagent.ts`/`budmodell.ts` er delt
fordi `node:fs` ikke kan bunles til nettleseren (`budagent.ts:41-49`), og
`alphamu.ts`/`amuagent.ts` er algoritme mot agent. Begge halvdeler er levende.

Og to par er GENERASJONSSKIFTER under arbeid, ikke råte:
`mlb/tronett.ts` mot `montetro.ts` (`mlb/tronett.ts:12-22`, §119 målte 12,34 %
mot 4,20 % av veien til taket) og `mlb/hukommelse.ts` mot `stilbias.ts`
(`mlb/hukommelse.ts:8-13`).

Og én etterfølger er **bygd, ikke utrullet, og ikke i noen spek**:
`sumvelger.ts` + `sumledd.ts`. `agentspek.ts:462` sier det selv: «Ingen
eksisterende spek inneholder `sum:`».

---

# MOTBEVIST — hviler på en antakelse planen senere målte som feil

Rangert etter hvor mye kode som henger i det.

## M1. Håndsatte slutningsregler som vei til troen — §119

`hvemla-slutning.ts` (A1), `troverdighet.ts` (A5), `signal.ts` (A6),
`verdensvekt.ts` (kroken) og kanal 2 er bygd på premisset at bedre
slutningsREGLER gir bedre tro. §119 målte alternativet:

```
A1 + A5 + A6 + kanal 2, til sammen:   +0,0046
MLB-trohodet, alene:                  +0,0875 mot den beste av dem
```

§119: «Det betyr at K8 er en dataoppgave, ikke en slutningsoppgave.»

Modulene er ikke verdiløse — `troverdighet.ts` gjør fortsatt jobben i
etikettmakeren — men premisset for å bygge MER av dem er motbevist.

## M2. «Eksakt sluttspill» og klarsynssonden — §56, §58, §115, §116

§116: `rotVerdier` i `src/solver/dds.ts` svarte feil. Alt som kalte den ga
korrupte verdier. Det rammer:

* §56s −0,343 for `eks:` — «grunnlaget for −0,343 er borte» (§116)
* §58 «KLARSYN GJØR DET VERRE» — fortegnet snudde fra −0,14 til +0,04 da løseren
  begynte å svare riktig
* §114s forklaring — «forklarte bare 3 % av utslaget»
* K7s tak i `AdamsMax.md` — «et tak som er regnet feil er ikke et tak» (§116).
  §117-K7 målte det på nytt: taket sto aldri i fare.

`eksaktagent.ts` + `solver/eksakt.ts` er dermed ikke motbevist — de er
**umålte**, og §116 sier eksplisitt at `eks:` ikke skal slås på før en gate
2-kjøring med rettet løser finnes.

Og lærdommen §116 selv trekker er den viktigste i hele planen for dette
oppdraget: «Testmappa hadde 480 grønne tester og ingen av dem kunne se feilen,
fordi ingen av dem sammenlignet den optimerte løseren med en dum en.»

## M3. NEAT-evolusjonslinja — §95, `web/app.ts:606-614`

C4 og D1 er målt til å spille kort dårligere enn å velge tilfeldig (anger
1,07–1,15 mot gulvet 1,035). De er fjernet som motstandere i appen. Hele
`src/neat/evolusjon.ts`, `genom.ts`, `senat.ts`, `portvakt.ts`, `turnering.ts`,
`pool.ts`, `hybrid.ts`, `elo.ts`, `anker.ts`, `angerfitness.ts` bærer den linja.
Den er ikke død (benkene når den), men den er den eneste store klyngen i
`src/` hvis egen målestokk sier at produktet var svakere enn tilfeldig.

`src/neat/agent.ts`, `genom.ts`, `nett.ts` og `trekk.ts` er unntaket — de er
fortsatt lastet av `web/app.ts`.

## M4. `montetro` + sanseblokken kan ikke nås av dagens nett — §99, §100

`montetro.ts` er portet på nettbredde ≥ 558. `d7alle` er 273. Det eneste brede
nettet (`b714gammel`) måler −1,15 mot `d7alle`. Alt 714-arbeidet — 441 ekstra
trekk, hele sanseblokken — ligger derfor **utenfor den boten vi måler**.

Dette er ikke motbevist, det er blokkert. Men det har stått blokkert siden §99,
og §100 sier at låsen bare åpnes av et bedre 714-nett.

## M5. Håndsatte vrakregler — `vrakregler.ts:15-18`

Målt 2026-07-26 på 2 × 24 000 giver: «INGEN eksplisitt regel her slår nevros
vrak.» Filen er beholdt som målegrunnlag, ikke som spiller. Det er riktig
håndtert — nevnt her fordi den er lett å forveksle med noe levende.

---

# ORAKELBUNDET — overlever ikke selvtreningskravet

MLB-kravet er selvtrening uten mester eller orakel. Disse forutsetter det
motsatte:

| fil / linje | binding |
|---|---|
| `src/e1/orakel.ts` | Fasiten E1 destilleres fra. Sampler verdener og løser hver med den eksakte dobbeltdummy-søkeren. |
| `src/solver/dds.ts`, `eksakt.ts`, `poengdds.ts` | Dobbeltdummy og perfekt informasjon. `poengdds.ts:57-58` sier selv «en MÅLESTOKK og et tak, ikke en spiller». |
| `src/moe2/juksagent.ts` | Ser alle fire hender. `agentspek.ts:1172`: «ULOVLIG som spiller». `test/ingen-juks-i-appen.test.ts` vokter at den aldri når appen. |
| `src/moe2/mesterklone.ts`, `sdagent.ts`, `sdvrak.ts`, `sdpar.ts`, `sdkort.ts` | SD-korpuset. `mesterklone.ts` er destillert MesterAI. `e1/orakel.ts` sier selv hvorfor det er en blindvei: «en elev når ikke forbi læreren sin». |
| `src/moe2/sikkerorakel.ts`, `rolleorakel.ts` | Ikke orakelbundne i drift — de sampler lovlige verdener — men navnet og `sdpar.ts`-avhengigheten gjør dem lette å forveksle. **De ER lovlige.** |
| alt som leser `e1-modell/d7alle.bin` | `d7alle` er destillert fra SD-orakelet. Hele den utrullede boten hviler på det. |

Det siste punktet er det tunge: **den utrullede boten er destillert fra et
orakel.** `src/mlb/` er den eneste delen av repoet som ikke er det, og den er
voktet: `test/mlb-herkomst.test.ts` følger importgrafen fra `src/mlb/` og feiler
hvis den når `src/solver/`, noe med `orakel` i navnet, SD-agentene, alpha-mu,
`juksagent` eller `vrakrang` — med en kontroll som viser at regelsettet fanger en
konstruert forbudt sti (§119). Det er den beste vakten i repoet.

Én observasjon om MLB som ikke er en innvending, men verdt å vite:
`src/mlb/trotrekk.ts:52` bygger inngangen på `src/neat/trekk.ts` sin `lagInn`
(318 trekk) — den **eldste** av de tre trekkgeneratorene, ikke `src/e1/trekk.ts`
(nyest, 273→714). `trotrekk.ts:23` begrunner det. Det er et bevisst valg, men
det betyr at den ferskeste linja arver den eldste kodingen.

---

# ANDRE FUNN

## Konstanter og strenger som er duplisert

`test/utrullet-lik-maalt.test.ts` er en god vakt og fanger fire av dem
(vaktflagg, vrakflagg, budterskel, SØKVERDENER mot lista) — men bare mellom
`web/app.ts` og `ADAMS`. Utenfor det paret står de fritt:

**Budterskelen −3,0 finnes i 15 uavhengige kopier.** `agentspek.ts:71,106,173,231,259`
· `web/app.ts:170` · `examples/budtabell-kostnad.ts:75`, `budkalibrering.ts:43`,
`maxrigg.ts:296`, `matrise.ts:63-64`, `koblingssjekk.ts:59` ·
`verktoy/mvp-dom.sh:86`, `generasjon.sh:64`, `lagmaal-kjor.sh:32`,
`neste-adams.sh:26`, `rollesok.sh:62`, `vant-fikspunkt.py:48` ·
`docs/utrulling-v5.md:10`. Én av de 15 er voktet.

**`adams-kort.b64` mot `d7alle.bin` er den ene ekte utrullingskoblingen som er
helt uvoktet.** `docs/plan.md:4475` påstår at de er bit-identiske (sha256), og
`test/utrullet-lik-maalt.test.ts:131-136` innrømmer eksplisitt at den ikke kan
sjekke det — koblingen er et opplastingssteg utenfor koden. Det er der en
utrulling faktisk kan gå galt uten at noe feiler.

Den fanger heller ikke:

* **`SØKVERDENER` og `SØKSIGMA` mot noen målt spek.** Tallene 24 og 0,5 står i
  `web/app.ts:295,302`, sendes til `worker.ts:153`, og finnes ingen steder i
  `ADAMS`. Det er derfor N3 er mulig.
* **`VRAK_DIM = 24`** (`vraktrekk.ts:44`) mot vektfilas bredde — her KASTER
  `Vrakrangerer` riktignok (`vrakrang.ts:114-116`), som er den riktige formen.
* **`STANDARDNETT`** (`agentspek.ts:116`) mot `KORTVEKTER` (`app.ts:172`) —
  `.bin` mot `.b64`, koblingen er et opplastingssteg utenfor koden. Testen sier
  det selv (`utrullet-lik-maalt.test.ts:131-136`) og gjør det den kan.

## Tester som ikke kan feile

Planen kjenner formen. `§100`, «Testene måler at delene FYRER, ikke at de
finnes»: «Alle de døde modulene hadde grønne enhetstester hele tiden … Fire
ganger har den formen skjult en død komponent her.»

Ni funnet i denne revisjonen, sortert etter hva de skjuler:

1. **`test/agentspek-en-parser.test.ts:26-38`** — se N11. Ikke-rekursiv
   `readdirSync`, en hoppelinje som ikke kan treffe, og en navnebundet regex.
   Skjuler fjorten rivaliserende parsere. **Den alvorligste.**
2. **`test/ingen-nestet-soek.test.ts:50-57`** — bygger
   `ork:foerer:12:ork:forsvar:12:<base>`, sjekker at `velgHandling` er en
   funksjon, og at BYGGINGEN tok under fem sekunder. `velgHandling` kalles
   aldri. Bugen fila finnes for — søk inne i søk — er en kjøretidskostnad.
   Testen kan ikke fange regresjonen den er navngitt etter.
3. **`test/okt.test.ts:72-81`** — «MED oekt overlever profilen nyKamp». Kroppen
   kaller `nyKamp()` to ganger og avslutter med `assert.ok(true)`. Ingenting
   sjekker at boka overlevde. Nabotesten på `:63-70` gjør det riktig
   (`assert.notEqual(a.bok, før)`) for det motsatte tilfellet.
4. **`test/utensok.test.ts`** — se N10. Alle fem prøvespekene har søkelaget på
   posisjon 0, og `SØKELAG` lister `vv:`/`vv2:` som ingen av spekene inneholder.
   Assertionene på dem er trivielt sanne.
5. **`test/agentspek-en-parser.test.ts:72-89`** — «hver navngitt ADAMS-stakk
   lar seg bygge» dekker `ADAMS`, `ADAMS_MAALT`, `ADAMS_V6`, `ADAMS_V6_FULL`.
   **`ADAMS_V7` mangler** — den nyeste stakken, og nøyaktig den tilstanden
   `ADAMS_V6_FULL` var i før testen ble skrevet. Filhodet på `:63-71` beskriver
   problemet presist og lar så den nyeste stakken stå utenfor.
6. **`test/utrullet-lik-maalt.test.ts:149-162`** — `if (påstand !== null)`.
   Regexen er bundet til eksakt markdown-formatering i `utrulling-v5.md:72`.
   Omformuleres den linja, passerer testen med null assertions.
7. **`test/utrullet-lik-maalt.test.ts:75-85`** — `if (...) return;` hopper over
   hele testen når filnavnene er like. Tilsiktet og dokumentert, men den kan
   slutte å teste i stillhet.
8. **`test/ingen-juks-i-appen.test.ts:25-27`** — `assert.equal(KREVER_FASIT,
   true)` på en hardkodet `true`. Resten av fila er derimot en ekte
   falsifiseringsarm.
9. **`test/neat-hybrid.test.ts:31`** — `assert.ok(handlinger < 6000)` der løkka
   brytes ubetinget etter fire runder. Kan ikke feile.

Og tre spekformer har null dekning noe sted: `etl:` (`agentspek.ts:1097`),
`e1s:` (`:1287`), `ens:` (`:1293`) forekommer ikke i noen spek, benk eller test
utenfor sin egen parser.

---

# ÆRLIG VURDERING: skrive om, eller rydde?

## Hva jeg faktisk fant

Jeg gikk inn i dette forberedt på å finne råte. Det jeg fant var noe annet.

**Kodekvaliteten er høy og uvanlig godt dokumentert.** Nesten hver modul har et
filhode som sier hva den erstattet, hvilken måling som felte forgjengeren, og
hvorfor knotten står der den står. `src/moe2/maaling.ts`, `sumvelger.ts`,
`utrullet.ts` og `sikkerorakel.ts` er bedre begrunnet enn det meste jeg har
lest. Prosjektet vet hva det har gjort galt og har skrevet det ned.

**Det er ikke gammel kode som er problemet.** De virkelig døde klyngene —
`moe2/eksperter/`, `port.ts`, NEAT-evolusjonen — er små, isolerte, og de skader
ingenting. De koster lesetid, ikke poeng.

**Problemet er at kurene ikke kommer helt fram.** Alle hovedfunnene har samme
form — en riktig kur som stopper én meter fra mål:

* `utrullet.ts` er den riktige kuren mot duplikatkjeden — og bunten er ikke bygd (N1)
* `byggUtrullet` er tatt i bruk i workeren, som tar 25 % av beslutningene — og ikke i appen, som tar 75 % (N2)
* `ADAMS_MAALT` og likhetstesten er den riktige kuren mot spekdrift — og `matrise.ts` skriver sin egen streng ved siden av (N3)
* `utrulling-v5.md` er den riktige kuren mot glemte filer — og fila er selv foreldet (N4)
* `agentspek-en-parser.test.ts` er den riktige kuren mot rivaliserende parsere — og den skanner ikke mappene der de bor (N11)
* `sumvelger.ts` er den riktige kuren mot overstyringsstabelen — og ingen spek bruker den (`agentspek.ts:462`)

Og under det ligger et mønster som er verdt å nevne for seg: **flere av vaktene
er skrevet slik at de ikke kan feile.** Ni av dem er ført opp over. Det er ikke
slurv — hver av dem har et gjennomtenkt filhode som beskriver riktig problem.
Det er at en test som er grønn på skrivedagen aldri blir prøvd mot et ekte
brudd. §116 sa det allerede, om løseren: «480 grønne tester og ingen av dem
kunne se feilen, fordi ingen av dem sammenlignet den optimerte løseren med en
dum en.» Den lærdommen er ikke generalisert til resten av testmappa.

Dette er ikke sunken cost. Sunken cost er å bære på noe fordi man har investert
i det. Her er mønsteret det motsatte: **fiksen blir skrevet, dokumentert og
testet — og så blir den ikke koblet inn til ende.** Det er den samme diagnosen
§99 stilte om Adams selv («delene er ikke koblet til ham»), én etasje opp: nå er
det KUREN som ikke er koblet til.

## Dommen

**Dette skal ikke skrives om. Det skal ryddes — og oppryddingen er liten.**

Begrunnelsen er tre målte forhold:

1. **Grensesnittet holder allerede.** `Velger`-grensesnittet
   (`velgHandling` + `nyKamp`) bærer hele stakken, fra `NevroAgent` til
   `Alphamuagent`. `byggUtrullet` beviser at kjeden kan bygges ett sted. Et
   omskrevet system ville trengt det samme grensesnittet.
2. **Målekapitalen er den dyre delen, og den er intakt.** `docs/plan.md` er
   8 713 linjer måleprotokoll. Å skrive om koden kaster ikke bort koden — den
   kaster bort at vi VET at `f` er +0,031, at `m` er +0,0404, at forsvarssøk er
   −0,027, at `amu:alle` er −0,2837. Det er hundrevis av CPU-timer som ikke kan
   gjenskapes billig, og de er bundet til de nåværende komponentnavnene.
3. **Den ene arkitektoniske innvendingen som holder — overstyringsstabelen — har
   allerede en ferdig etterfølger i repoet.** `sumvelger.ts` + `sumledd.ts`
   løser feilklasse 2 strukturelt, med et null-punkt som er bit-identisk med
   dagens bot (`sumvelger.ts:65-70`). Det er en overgang som kan måles, ikke en
   omskriving.

Der jeg er villig til å gå den andre veien: **hvis N1-mønsteret gjentar seg
etter denne revisjonen**, altså hvis kurer fortsetter å bli skrevet uten å bli
koblet til ende, er ikke problemet arkitekturen. Da er det at systemet er større
enn det som kan holdes konsistent, og da er en mindre bot med færre lag det
riktige svaret. Men det er en beslutning som skal tas på en gjentakelse, ikke på
denne revisjonen.

## Rekkefølgen, hvis det skal ryddes

1. **Bygg buntene på nytt og verifiser i en nettleser** (N1). Alt annet er
   akademisk så lenge dette står.
2. **La `web/app.ts:besteBot()` kalle `byggUtrullet({søk: null})`** (N2). Én
   kopi mindre, null atferdsendring.
3. **Rett `matrise.ts:99-100`** og kjør §118 på nytt med en grunnlinje som
   faktisk er utrullet (N3).
4. **Rett `docs/utrulling-v5.md`** om `bud-menneske.json` og om `app.js` (N4).
5. **Gjør `test/agentspek-en-parser.test.ts` rekursiv** og la den fange
   `lag(`/`lagKandidat(`/`lagMotpart(`, ikke bare `lagIndre` (N11). Den vil
   feile med det samme, og fjorten filer på lista er nøyaktig svaret på Arvinds
   spørsmål om hva som er utdatert.
6. **Legg `nyKamp` inn som meldingstype i workeren** (N5). Uten den kan `økt`
   aldri slås på riktig.
7. **Legg `ADAMS_V7` inn i «hver navngitt stakk lar seg bygge»**, og få
   `test/ingen-nestet-soek.test.ts` til å faktisk kalle `velgHandling`.
8. **Mål tempoet på familiens tregeste maskin** og sett `SØKVERDENER` etter det
   (N6). Så lenge det ikke er gjort, er stoppeklokka en skjult armdeling.
9. **Utvid `utenSøk` til å hoppe over ikke-søkende omslag**, og legg en
   `okt:`-prefikset spek i `test/utensok.test.ts` (N10).

Punkt 1–7 er småting i timer. Ingen av dem krever en måling først. Alle sju
lukker en forekomst av prosjektets to dokumenterte feilklasser, eller en vakt
som ikke kan feile.

Punkt 5 er den jeg ville tatt aller først hvis bare én kunne tas. Den er ikke en
fiks — den er et **måleinstrument**. Den forteller på ett minutt hvor mye
utdatert parsing som faktisk står i repoet, i stedet for at noen må lese seg til
det. Det er den samme grunnen §99 var verdifull: en importanalyse, ikke
kodelesing.

---

*Revisjon 9. august 2026. Ingenting slettet, ingen atferd endret.*
