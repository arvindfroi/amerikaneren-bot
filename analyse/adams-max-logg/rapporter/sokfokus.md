# Søkfokus: å konsentrere søket der det betaler

Gren `sokfokus-2026-09-14` i **`D:\amb-sokfokus`** (fra `krav-2026-09-11` @ 9aaed8e).
14. sep, maks 3 kjerner. **BYGGEOPPDRAG — ingen K1-måling startet.** Tidsprofilering på få
runder er det eneste som er kjørt.

---

## 0. Premisset, hentet fra to målinger jeg ikke har gjort selv

Fra `dekomp.md` §4a/§5a:

| ledd | runder | bidrag til +1,24 | rom |
|---|---|---|---|
| budet | 595 | +0,62 pp | PÅ TAKET |
| vrak/trumf/etterlyst | 362 | +0,08 pp | på taket |
| **stikk 1–4** | **1496 (56,7 %)** | **+0,49 pp** | **≤ +1,31 — eneste ledd med rom** |
| stikk 5–8 | 163 | +0,06 pp | – |
| stikk 9–12 | 17 (0,6 %) | +0,00 pp | FERDIG |

Og §5a: på de 2027 rundene med samme rolle OG samme bud er nettene **par med mennesket**
(+0,21 ± 0,18, ikke signifikant). Hele det rettferdige forspranget (+0,72 ± 0,19) er **søkets**.

**Konklusjonen oppdraget hviler på:** søket er det eneste som virker, men det brukes jevnt
utover hele runden — også i sluttspillet, som bærer 0,00 pp.

---

## 1. HVOR SØKET FAKTISK SLÅS AV I DAG — kodelesning

`Sikkerorakel.velgHandling` (`src/moe2/sikkerorakel.ts:298-306`) har allerede nøyaktig én
port, og den er rollebasert:

```
velgHandling(state) {
  this.siste = null;
  this.tro?.observer?.(state);
  if (state.fase !== "SPILL" || state.iTur === null) return this.indre.velgHandling(state);
  const sete = state.iTur;
  if (this.roller.length > 0) {
    const r = rolleFor(state, sete);
    if (r === null || !this.roller.includes(r)) return this.indre.velgHandling(state);
  }
  this.tellere.beslutninger++;
  ...
```

Det er DENNE stien `børSøke = false` speiler i appen (`web/adamskjede.ts:308-324`). Et
stikkvindu hører hjemme på samme sted, **før `tellere.beslutninger++`**, så en beslutning
utenfor vinduet ser ut nøyaktig som en beslutning i feil rolle: ingen teller rører seg,
`siste` blir stående `null`, og `lesUtfall` rapporterer `"ikke-rolle"`.

Merk at `sik:alle` betyr `roller: []`, altså **porten står helt åpen** i dagens grunnlinje —
søket kjøres i hver eneste kortbeslutning i alle tolv stikk, i alle tre roller.

---

## 2. SYNTAKSEN — hvorfor ikke `t1-4`, og hvorfor ikke `s<fra>-<til>`

Verdensfeltet i `sik:<rolle>:<sigma>:<V>…` leses **BAKFRA** (`agentspek.ts:1321-1392`):

```
<V>[k<K>][e<T>][a<krit>][s][L][M][D][~<art>=<fil>]
```

Rekkefølgen er `~` → `D` → `M` → `L` → `s` → `a<krit>` → `e<T>` → `k<K>`, og de tre
boolske er STORE bokstaver med vilje: kriterienavnene (`min`, `kvantil`, `flest`) er små og
inneholder både `e`, `k`, `s` og `a`.

**`t1-4` kolliderer, og den kolliderer STILLE.** Grunnlinjas felt er `48k32e3LMD`. Med
knotten bakerst blir det `48k32e3t1-4`. Stripping av `D`/`M`/`L` treffer ikke, `s` treffer
ikke, `a` finnes ikke — og så kommer:

```
const ePos = vFelt.indexOf("e");        // treffer «e» i «e3»
eksaktBlad = Number(vFelt.slice(ePos + 1));   // Number("3t1-4") === NaN
```

Her redder kastet oss riktignok (`e<T>` valideres med `Number.isInteger`), så `48k32e3t1-4`
ville kastet høylytt. Men `48k32t1-4` (uten `e`) gjør det ikke:

```
const kPos = vFelt.indexOf("k");
verdenKandidater = Number(vFelt.slice(kPos + 1));   // Number("32t1-4") === NaN
```

…og det er **nøyaktig felleklassen `agentspek.ts:1396-1424` ble skrevet for**: `12k16d4` ga
`NaN` kandidater, `sampler.ts` gikk null runder, og **hele søket sto stille av i en spek som
så ut som den søkte** — målt til 115 av 115 like valg med den søkløse basen. Kandidatfeltet
har nå en `Number.isInteger`-vakt, så den ville også kastet i dag. Men poenget står: en
knott av små bokstaver + tall inne i verdensfeltet må plasseres i en presis posisjon i en
bakfra-lest kjede, og hver ny slik knott gjør de neste farligere.

**`s<fra>-<til>` er verre:** `s` er ALT tatt — `vFelt.endsWith("s")` slår på A1-spillvekten.

### Valget: et `~`-felt, `~stikk=<fra>-<til>`

`~lik=` løste nøyaktig dette problemet én gang før, og løsningen er dokumentert i
`agentspek.ts:1246-1251`: `~`-feltene plukkes **FØRST**, før all bokstavparsing, fordi en
filsti kan inneholde `a`, `k` og `s`. Feltene leses som `~<art>=<verdi>`-par delt på `~`.

Å legge stikkvinduet der gir fire ting gratis:

1. **Ingen kollisjon i det hele tatt.** Feltet er strippet av `vFelt` før `D`/`M`/`L`/`s`/
   `a`/`e`/`k` i det hele tatt leses.
2. **`utenSøk` er urørt.** Den splitter på `:` og hopper tre felt (`agentspek.ts:499-502`).
   `~stikk=1-4` inneholder ikke kolon, så feltantallet er uendret — rollout-motparten
   strippes bit for bit som før.
3. **Formen finnes alt** og har en parser-løkke som allerede kaster på ukjent art.
4. **Den er selvforklarende i en spekstreng** som ellers er tettpakket med enkeltbokstaver.

Kostnaden er at den er lengre å skrive. Det er en pris verdt å betale for en knott hvis hele
formål er at «av er av».

**1-BASERT, INKLUSIVE i begge ender.** `~stikk=1-4` = de fire første stikkene = nøyaktig
raden `kortspill stikk 1–4` i `dekomp.md` §4a. Internt er `state.stikkSpilt` 0-basert
(antall FULLFØRTE stikk), så porten er `stikkSpilt + 1` mot intervallet. Valget er tatt for
at speken skal kunne leses side om side med dekomponeringstabellen uten omregning — den
tabellen er hele grunnen til at knotten finnes.

---

## 3. GRUNNLINJE AV PRØVENE FØR JEG RØRTE NOE (14. sep)

`npm test` på `9aaed8e`, FØR endringen — så det er skrevet ned hva som var rødt fra før:

```
tests 1013 | pass 970 | fail 22 | skipped 21 | duration 119,5 s
```

**`spek-en-kilde` (SKRALLE) er blant de 22.** Det er den forgjengeren min rapporterte:
25 filer under `examples/` og `test/` hardkoder vektnavn uten å stå på den 71-linjers
tillatelseslista. Pre-eksisterende, ikke innført her. Konsekvensen tas likevel på alvor:
**alle nye filer i dette arbeidet importerer `ADAMS`/`ADAMS_MAALT`** i stedet for å skrive
vektstier, så skrallen ikke får én ny rad å klage på.

De andre 21 røde er de samme byggeartefakt-, 493-bredde- og nåbart-prøvene som sto røde på
grenspissen. Ingen av dem rører `sikkerorakel.ts` eller `agentspek.ts` sin `sik:`-gren.

---

## 4. IMPLEMENTASJONEN

Tre steder, og ikke ett mer:

**`src/moe2/sikkerorakel.ts`**
- `SikkerOpts.stikkvindu?: readonly [number, number]` — 1-basert, inklusive.
- `Sikkerorakel.stikkvindu: readonly [number, number] | null` (offentlig, så prøvene kan
  bevise at knotten er koblet), satt med `opts.stikkvindu ?? null`.
- Validering i konstruktøren, ikke ved første trekk midt i en kamp: hele stikk, `1 ≤ fra ≤ til`.
- Porten i `velgHandling`, **rett etter rolleporten og FØR `tellere.beslutninger++`**:
  `stikkSpilt + 1` mot intervallet. Utenfor vinduet returnerer den `indre.velgHandling(state)`
  — nøyaktig samme sti som en beslutning i feil rolle.

**`src/moe2/agentspek.ts`**
- `~stikk=<fra>-<til>` som en ny art i `~`-løkka, ved siden av `mlb`/`mlbu`/`lik`.
- Kaster høylytt på alt som ikke er to hele stikk i stigende rekkefølge.
- Meldingen for ukjent art nevner nå den nye formen.
- `...(stikkvindu === undefined ? {} : { stikkvindu })` — **nøkkelen finnes ikke i
  opsjonsobjektet uten feltet.**

**`test/sokfokus-stikkvindu.test.ts`** (ny) og **`examples/sokfokus-kostnad.ts`** (ny).
Begge importerer speken; ingen hardkodede vektstier.

### Hvorfor `sokfokus-kostnad.ts` og ikke `tidsprofil.ts`

Eierens `examples/tidsprofil.ts` finnes, men som en **ucommittet fil i `D:\amb-krav`** — den
er ikke på noen gren. `d31df7a` tok den ut av denne grenen med nøyaktig den begrunnelsen.
Å committe min egen fil på det navnet ville kollidert med eierens untrackede fil ved neste
utsjekk. Mitt verktøy er derfor et eget navn, med én forskjell som betyr noe: **bøttene er
1-baserte per stikk**, samme akse som `~stikk=` og samme akse som radene i `dekomp.md`.

## 5. PRØVENE ETTER ENDRINGEN — null nye røde

`npm test` på `cac2b6e`, mot grunnlinja i §3:

| | tester | pass | fail | skipped |
|---|---|---|---|---|
| før (`9aaed8e`) | 1013 | 970 | **22** | 21 |
| etter (`cac2b6e`) | 1021 | 978 | **22** | 21 |

De åtte nye testene er nøyaktig `test/sokfokus-stikkvindu.test.ts`, og alle åtte er grønne.
Feilmengden er **identisk** før og etter, navn for navn (normalisert diff uten tidsstempler:
tom i begge retninger). Ingen ny rød, ingen som forsvant.

**Typesjekk:** `node_modules` i denne arbeidskopien er TOM, så `npm run typecheck` kan ikke
kjøre her — den var umulig på grunnlinja også, og det er ikke noe jeg har innført. Kjørt med
en søsterarbeidskopis `tsc` (`/d/amb-krav/node_modules`) mot dette prosjektets `tsconfig.json`
gjenstår **én** feil: `src/mlb/fargebytte.ts(60,1): 'kortIndeks' er deklarert men aldri brukt`
— en fil jeg ikke har rørt. `sikkerorakel.ts` og `agentspek.ts` er rene.

### De åtte prøvene, og hva hver av dem faktisk holder fast

1. **AV ER AV** — uten feltet er `stikkvindu` `null`, ikke `[1, 12]`.
2. **INGEN KOLLISJON** — `48k32e3LD~stikk=1-4` gir fortsatt e=3, L og D, og `~lik=`/`~stikk=`
   kan stå i begge rekkefølger.
3. **UGYLDIG KASTER** — ti former (`4-1`, `0-4`, `a-b`, `1-4-7`, `1.5-4`, …) kaster alle.
4. **`utenSøk` URØRT** — strippingen gir `ADAMS` tilbake, og feltantallet er uendret.
5. **BIT-IDENTISK** — `~stikk=1-12` velger *nøyaktig* samme kort som ingen knott over 120
   stillinger. Porten rører altså ikke tilfeldighetsstrømmen; «av» er gratis.
6. **VINDUET BITER** — `~stikk=1-4` velger annerledes enn ingen knott. Uten denne kunne
   knotten vært død i strengen, som `12k16d4`.
7. **RIKTIG STIKK** — for vinduene 1-4, 5-8, 9-12 og 3-3 rører telleren seg presis i
   stikkene i vinduet, 1-basert og inklusive i begge ender.
8. **UTENFOR VINDUET RØRER INGENTING SEG** — ingen teller, og `siste` blir stående `null`,
   så `lesUtfall` rapporterer `"ikke-rolle"` slik rolleporten alltid har gjort.

## 8. `eks:3Lt2000` — BØR DEN SLÅS AV? (kodelesning + arm A, ikke egen måling)

Bedt om å nevne, ikke å måle. Her er det jeg kan si uten å bruke en kjerne på det.

**Hva den er.** `eks:<terskel>[L][t<tak>]` (`src/moe2/eksaktagent.ts`): `3` = de siste **tre**
stikkene (altså stikk 10–12 i en tolvstikksrunde), `L` = lagmålet, og `t2000` er et tak på
antall **klassekonfigurasjoner** — ikke millisekunder. `STANDARD_TAK` er `200_000`, så `t2000`
er **1 % av standardtaket**. Ærlighetsregelen i den fila sier at blir rommet større enn taket,
gjør agenten *ingenting* og lar det indre laget bestemme. Med et så lavt tak avstår den altså
ofte — hvor ofte er et måletall, og det er ikke mitt å hente.

**Hvor den ligger.** I grunnlinja står den `okt:vr:…:telrd:**eks:3Lt2000**:profil:sik:alle:…`,
altså **UTENFOR og OVER `sik:`**. Filhodet er eksplisitt på at det er med vilje: «Terskelen står
YTTERST med vilje: fra terskelen og ut skal enumerasjonen bestemme, også der konvensjonsvakten
ville overstyrt.» Den kan derfor **overskrive søkets kort** i stikk 10–12. Oppdragsteksten har
altså rett i premisset.

**Hva båndet er verdt, og hva det koster.** Dekomponeringen: stikk 9–12 = **+0,00 pp på 17
runder (0,6 %)**. Arm A måler kostnaden i samme bånd:

| stikk | snitt per kortvalg (arm A) | andel av botarbeidet |
|---|---|---|
| 10 | 25,3 ms | 0,5 % |
| 11 | 12,2 ms | 0,2 % |
| 12 | 2,2 ms | 0,0 % |
| **9–12 samlet (2 runder)** | **31,6 ms** | **2,3 %** |
| **9–12 samlet (6 runder, A6 — gjelder)** | **25,7 ms** | **1,5 %** |

**Konklusjon.** Å slå av `eks:3Lt2000` er **ikke en kostnadssak** — hele båndet er 1,5 % av
botarbeidet (6-runders A6), og `eks:` er bare en del av det. Grunnen til å prøve den er en annen, og den
blir *sterkere* med `~stikk=1-4`: i grunnlinja deler `eks:` og søket det båndet, mens med
vinduet er **søket av i stikk 5–12, så `eks:` blir det ENESTE laget som fortsatt griper inn i
et bånd målt til +0,00 pp**. Effekten er ikke lenger maskert av søket, og en `eks:`-av-arm blir
dermed lettere å tolke enn den var før.

Men den hører til i sin **egen** arm. Legges «eks: av» oppå «~stikk=1-4» i samme spek, måler
kjøringen to endringer og kan ikke tilskrive noen av dem. Jeg har derfor **ikke** slått den av
i noen av de leverte armene.

## 6. KOSTNADEN, MÅLT (`examples/sokfokus-kostnad.ts`, 3 botseter + 1 motpart)

**6-runders kjøring, tre armer rett etter hverandre** (n=72 kortvalg per vindu). Dette er
tallene som gjelder; 2-runderskjøringen under står bare for per-stikk-profilen.

| arm | verdener | vindu | s botarbeid/runde | mot A6 |
|---|---|---|---|---|
| **A6** | 48 | ingen (dagens) | **20,8** | – |
| **B6** | 48 | `~stikk=1-4` | **14,9** | **−28 %** |
| **E6** | 72 | `~stikk=1-4` | **19,1** | **−8 %** |

Hvor tiden går i dagens grunnlinje (A6):

| bånd | s/runde | andel | bidrag (dekomp) |
|---|---|---|---|
| stikk 1–4 | 13,95 | **66,9 %** | +0,49 pp ← eneste ledd med rom |
| stikk 5–8 | 6,58 | 31,6 % | +0,06 pp |
| stikk 9–12 | 0,30 | **1,5 %** | **+0,00 pp** |

**DET VIKTIGSTE FUNNET, OG DET MOTSIER PREMISSET I OPPDRAGET.** «96 eller 192 verdener for
omtrent samme kostnad» går ikke opp. Sluttspillet er nemlig *allerede* nesten gratis: stikk
9–12 er **1,5 %** av botarbeidet. Å slå av søket der frigjør altså nesten ingen tid — det
frigjorte ligger i stikk 5–8 (31,6 %). Hele besparelsen ved `~stikk=1-4` er derfor 28 %, ikke
de ~67 % en naiv «8 av 12 stikk»-regning ville gitt.

Kostnaden i vinduet er **ikke** proporsjonal med verdener — det er et fast ledd per beslutning:

```
vindukostnad (s/runde) ≈ 6,35 + 0,177 × V      (tilpasset B6 og E6)
```

Break-even mot A6 (20,8) ligger da på **V ≈ 82**. Målt kom 72 verdener inn på 19,1 s/runde,
altså **under** grunnlinja. **72 er derfor det trygge kostnadsnøytrale valget**, og 96 lander
rundt +12 %.

**Støyen er ærlig oppgitt:** samme arm A målt i to omganger ga 16,2 (2 runder) og 20,8
(6 runder) s/runde — ~25 % variasjon mellom kjøringer på en maskin som også kjører iterasjon
12. Sammenlikninger *innenfor* 6-runders-batchen (A6/B6/E6, rett etter hverandre) er til å
stole på; absolutte tall på tvers av batcher er det ikke. Rangeringen under hviler bare på
det første.

---

## 7. DE TRE SPEKENE TIL K1-MÅLING — rangert

Arm A er den eksisterende grunnlinja (+0,99 ± 0,19), **byte-identisk verifisert** mot
oppdragsteksten, og kan gjenbrukes med samme nett og frø (sparer 2,5 t).

Alle tre er A med **ett** tegnbytte hver, så avviket er entydig. Felles prefiks
`okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:`
og suffiks `:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin`. Alle har 17
kolonfelt, som A — `utenSøk` teller likt.

### 1. KOSTNADSNØYTRAL, 72 verdener i stikk 1–4 ← mål denne først

```
…:sik:alle:0.5:72k32e3LMD~mlbu=e1-modell/tro-8.bin~stikk=1-4:budq:…
```
**19,1 s/runde (−8 % mot A).** Samme budsjett, 50 % flere verdener der de 56,7 % av
beslutningene og +0,49 pp ligger. Dette er selve hypotesen oppdraget er bygget på.
**Forventning:** dekomponeringen gir stikk 1–4 et nåbart tak på ≤ +1,31 mot dagens +0,49, så
det *finnes* rom. Men verdener gir avtakende avkastning, og 48→72 er en beskjeden økning.
Jeg venter **+0,1 til +0,3 pp**, og vil ikke bli overrasket om det er innenfor støyen.

### 2. GRATIS-LUNSJEN, 48 verdener i stikk 1–4

```
…:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin~stikk=1-4:budq:…
```
**14,9 s/runde (−28 %).** Identisk søk i stikk 1–4 som i dag, søket AV i stikk 5–12.
**Forventning: uendret styrke, 28 % billigere.** Dekomponeringen sier stikk 5–8 bærer +0,06 pp
og 9–12 +0,00. Er dette flatt, er 28 % av regnetiden ren gevinst — og da er #1 og #3 de riktige
måtene å bruke den på. **Faller den derimot signifikant, er dekomponeringen feil**, og det er
minst like verdifullt å vite.

### 3. DYRERE, 96 verdener i stikk 1–4

```
…:sik:alle:0.5:96k32e3LMD~mlbu=e1-modell/tro-8.bin~stikk=1-4:budq:…
```
**~23 s/runde (+12 %).** Bare hvis #1 viser stigning og du vil se om kurven fortsatt går opp.
Mål den **etter** #1, ikke parallelt — ellers vet du ikke hvilken av dem som bar effekten.

**192 verdener (arm D) frarådes:** 44,7 s/runde, **+176 %** mot grunnlinja. Prisen står ikke i
noe forhold til rommet som er igjen i båndet.

---

## 9. STATUS

**Byggeoppdraget er ferdig.** Gren `sokfokus-2026-09-14` @ `cac2b6e`, arbeidskopien ren.
Ingen K1-måling er startet — de tre spekene i §7 ligger klare til å køes, rangert.

Rådata: `D:\amb-grp\loop\sokfokus-kostnad.jsonl` (én rad per arm) og
`D:\amb-grp\loop\sokfokus-kostnad.log` (full konsollogg, per-stikk-bøtter).
