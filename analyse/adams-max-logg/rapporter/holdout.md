# HOLDOUT: å slutte å velge på testsettet

Arbeidsnotat, 14. sep 2026. Skrives fortløpende.
Arbeidskopi: `D:\amb-holdout` (git worktree, gren `holdout-2026-09-14`, fra `krav-2026-09-11` @ `9aaed8e`).
Iterasjon 11 eier maskinen i `D:\amb-loop` + `D:\amb-krav-batteri`; ingenting her rører dem, og
**ingen K1-måling er startet** — all reanalyse går på de lagrede rundene.

## Problemet

Helporten i løkka (v10, linje 194–220) velger hvilke nettsett som overlever ved å måle K1 på de
**samme 2641 rundene i 273 menneskekamper fra 10. aug**, iterasjon etter iterasjon. Det er
seleksjon på testsettet. Med SE ±0,20 og elleve iterasjoner pluss ~15 løsrevne K1-målinger er
forventet maksimum av ren støy ~+0,3 pp — nøyaktig størrelsen på «forbedringen» 1,01 → 1,24.

## Det som ble slått fast før noe ble endret

1. **Rundedataene er nok.** `analyse/duplikat-dom.mjs` leser de lagrede
   `krav-b0-k1-spek-s*.jsonl` og produserer hele K1-dommen. Kjørt på nytt på iter10s lagrede
   runder gir den `krav-b0-k1-dom.txt` **bit-identisk** (SHA-256 `37C25778…AB050492`, 3367 byte
   begge). Hele reanalysen kan gjøres uten én eneste ny kamp.
2. **Kampene er de samme i alle iterasjonene.** iter1–iter10 har nøyaktig samme 273 kamp-id-er
   og 2641 runder (0 avvik mot iter10). iter0 har bare 197 kamper (krasjede K1-skard, se
   `test/duplikat-menneske.test.ts`) og holdes utenfor de parrede tabellene.
3. **Menneskesiden er identisk i alle iterasjonene.** Kontrollert par for par: 2641 parret,
   0 manglende, 0 ulike, for hver av iter2…iter10 mot iter1. Derfor er parrede sammenlikninger
   mellom iterasjoner gyldige, og bare de brukes under.
4. **Reanalysen gjenskaper historien.** Nivåene regnet ut på nytt fra rundedataene er identiske
   med tallene i hver `krav.txt`: iter1 +0,86 ± 0,20, iter4 +0,70 ± 0,18, iter7 +1,01 ± 0,19,
   iter9 +1,12 ± 0,19, iter10 +1,24 ± 0,21. Apparatet under måler altså det samme som porten gjorde.

## Delingen

**50/50 på KAMP, låst i `analyse/k1-kampsett.tsv`** (273 linjer, `spill<TAB>sett`, under
versjonskontroll — en fil, ikke en hash-regel som kan endres i stillhet).

| sett | kamper | runder | nivå iter10 |
|---|---|---|---|
| utvalg (porten ser) | 150 | 1484 | +1,09 ± 0,28 |
| holdout (porten ser ALDRI) | 123 | 1157 | +1,45 ± 0,32 |

Regelen som laget lista, kjørt **én gang**: `bland(fnv("k1sett:" + spill)) % 100 < 50 → utvalg`.
`bland` (murmur3 fmix32) er ikke pynt: `examples/menneske-logg.ts` dokumenterer at rå FNV ikke
blander de lave bitene, og at et tidligere forsøk (`fnv("hold:"+id) % 4`) la **alle** 76
holdout-kampene i halvdel 1. Kryss mot den eksisterende halvdelsdelingen `fnv(id)%2` her:
83/67 i utvalg, 54/69 i holdout — ingen sammenfall.

**Hvorfor 50/50 og ikke 60/40.** Målt på de lagrede rundene, parret iter10−iter7:
holdout-SE er **0,22 med 50/50** mot **0,26 med 60/40** (utvalg-SE 0,20 mot 0,18). Porten tåler
et litt mindre utvalg bedre enn rapporten tåler en blind holdout, og holdouten er den som skal
kunne se noe. Balansen ellers er jevn: roller (fører/makker/forsvar) 586/296/602 mot 446/223/488,
og storspilleren `957f6f` 1295 mot 1003 runder.

## Er `alle` bit-identisk? JA — verifisert to steder

* **Rapporten:** `analyse/duplikat-dom.mjs` uten `--kampsett`, kjørt på iter10s lagrede runder
  etter endringen, gir SHA-256 `37C25778…AB050492` — identisk med den innsjekkede
  `krav-b0-k1-dom.txt` fra kjøringen 14. sep 00:42.
* **Selve K1-raden:** MÅLT-strengen bygd av `domK1` + `iKampsett("alle")` er tegn for tegn lik
  raden i `iter10/krav.txt` (se `_sjekk-k1-rad.ts`).

Uten flagget legges det ikke engang på kommandolinja til dom-skriptet, og filteret for `alle`
er `() => true`. Det er ingen sti der `alle` kan flytte seg.

### Prøvd, ikke antatt

| kontroll | resultat |
|---|---|
| `duplikat-dom.mjs` uten flagg på iter10s runder | SHA-256 identisk med innsjekket `krav-b0-k1-dom.txt` |
| K1-raden bygd av `domK1` + `iKampsett("alle")` | tegn for tegn lik `iter10/krav.txt` (`_sjekk-k1-rad.ts`) |
| `node --test test/mlb-krav-spek.test.ts` (de fire nye) | 4 av 4 passerer |
| `npm run typecheck` | ingen feil i mine filer; én feil fra før i `src/mlb/fargebytte.ts` (urørt, TS6133) |
| ende-til-ende-prøven `mlb-krav --spek` (K5) | feiler — men feiler **likt på pristine `9aaed8e`** i samme mappe, altså ikke min. Arbeidskopien har bare 5 filer i `e1-modell` (gitignorert). Parseren min er likevel dekket: ugyldig `--kampsett tull` stopper med «ukjent --kampsett», gyldig `--kampsett utvalg` gir exit 0 |
| `node analyse/k1-historie.mjs` uten argumenter | gjenskaper tabellen fra egne standardstier, samme tall |
| `bash -n adams-max-loop-v11.sh` | OK, og diffen mot v10 er nøyaktig de seks tiltenkte endringene |
| v11s port-sed mot den ekte raden | `+1.09 0.28` = utvalget (porten), holdout-sed `+1.45 ± 0.32` separat |
| v11s port-sed mot en `alle`-rad | `+1.24 0.21`, holdout-sed tom — v10-oppførselen er urørt |
| kampsett-fila med CRLF | alle lesere deler på `/\r?\n/` og trimmer — se under |

### CRLF-fella, tatt før den smalt

Repoet har ingen `.gitattributes`, og git meldte «LF will be replaced by CRLF» da lista ble
sjekket inn. En leser som deler på `"\n"` ville da fått settet `"utvalg\r"`, som matcher
**null** kamper — porten ville målt på et tomt sett, eller kastet, uten at noen hadde bedt om
det. Alle fire leserne (`duplikat-dom.mjs`, `krav-helbot.ts`, `k1-historie.mjs` og prøven)
deler nå på `/\r?\n/` og trimmer begge feltene, og en egen prøve krever at hver linje har
formen `id<TAB>(utvalg|holdout)` med eller uten `\r`. Prøvd ved å konvertere fila til CRLF og
kjøre alt på nytt.

## Hva som er endret

| fil | endring |
|---|---|
| `analyse/k1-kampsett.tsv` | NY. Den låste lista, 150 utvalg / 123 holdout. |
| `analyse/duplikat-dom.mjs` | `--kampsett alle\|utvalg\|holdout`; uten flagget nøyaktig som før. Med flagg: egen «UTVALG OG HOLDOUT SIDE OM SIDE»-blokk. |
| `examples/krav-helbot.ts` | `--kampsett` i parseren, `Kampsett`/`iKampsett`, K1-raden måler porten på settet og rapporterer det motsatte i samme rad. |
| `examples/mlb-krav.ts` | Flagget dokumentert i filhodet (inngangen som tar `--spek`). |
| `test/mlb-krav-spek.test.ts` | Fire nye prøver: lista er komplett og disjunkt, `alle` filtrerer ingenting, ukjent kamp er en STOPP, og `alle` gir nøyaktig samme dom som ufiltrerte rader. |
| `D:\amb-imit\adams-max-loop-v11.sh` | NY (kopi av v10). Porten måler på `utvalg`; holdout logges som ren rapport. Stopper hvis `analyse/k1-kampsett.tsv` mangler i batterikopien. |

En kamp som ikke står i lista **stopper** kjøringen. En ukjent kamp som stille faller ut av
tallet er nettopp feilklassen delingen skal hindre.

## Historien regnet om

Alle tall er ΔP(seier) i prosentpoeng per runde, klyngebootstrap over kamp (B=20000).
Full tabell: `D:\amb-grp\loop\holdout-tabell.txt`.

**Nivå per iterasjon**

| iter | alle | utvalg | holdout |
|---|---|---|---|
| 1 | +0,86 ± 0,20 | +0,88 ± 0,26 | +0,82 ± 0,31 |
| 2 | +0,82 ± 0,18 | +0,83 ± 0,23 | +0,80 ± 0,29 |
| 3 | +1,00 ± 0,19 | +0,95 ± 0,26 | +1,06 ± 0,27 |
| 4 | +0,70 ± 0,18 | +0,74 ± 0,23 | +0,64 ± 0,29 |
| 5 | +0,92 ± 0,19 | +0,92 ± 0,24 | +0,92 ± 0,30 |
| 6 | +1,10 ± 0,19 | +0,92 ± 0,29 | +1,34 ± 0,24 |
| 7 | +1,01 ± 0,19 | +1,06 ± 0,26 | +0,95 ± 0,28 |
| 8 | +1,02 ± 0,20 | +0,85 ± 0,28 | +1,24 ± 0,27 |
| 9 | +1,12 ± 0,19 | +1,17 ± 0,24 | +1,05 ± 0,31 |
| 10 | +1,24 ± 0,21 | +1,09 ± 0,28 | +1,45 ± 0,32 |

**Parret mot iter1** (samme kamper, samme runder, samme menneskeside)

| iter | alle | utvalg | holdout |
|---|---|---|---|
| 7 | +0,156 ± 0,151 (z 1,0) | +0,179 ± 0,216 (z 0,8) | +0,126 ± 0,207 (z 0,6) |
| 8 | +0,162 ± 0,150 (z 1,1) | −0,035 ± 0,219 (z −0,2) | +0,414 ± 0,201 (z 2,1) |
| 9 | +0,263 ± 0,165 (z 1,6) | +0,294 ± 0,221 (z 1,3) | +0,224 ± 0,255 (z 0,9) |
| 10 | **+0,388 ± 0,157 (z 2,5)** | +0,205 ± 0,207 (z 1,0) | +0,622 ± 0,242 (z 2,6) |

**Parret mot iter7** — spørsmålet «ble 1,01 → 1,24 reell?»

| iter | alle | utvalg | holdout |
|---|---|---|---|
| 8 | +0,005 ± 0,149 (z 0,0) | −0,215 ± 0,214 (z −1,0) | +0,288 ± 0,199 (z 1,4) |
| 9 | +0,107 ± 0,158 (z 0,7) | +0,114 ± 0,221 (z 0,5) | +0,097 ± 0,227 (z 0,4) |
| 10 | +0,232 ± 0,149 (z 1,5) | **+0,026 ± 0,200 (z 0,1)** | +0,496 ± 0,223 (z 2,2) |

## Svaret

**Historien kan ikke svare på om boten er blitt bedre på kamper porten aldri har sett — for
det finnes ingen slike kamper.** Porten så alle 273 kampene i hver eneste iterasjon 1–11.
Delingen virker fra og med iterasjon 12; brukt bakover er den en *oppdeling av det samme
selekterte settet*, ikke en holdout. Det er den viktigste setningen i notatet.

Det tabellen likevel sier, og det er ikke lite:

1. **Steget porten feiret er ikke der.** iter7 → iter10 er +0,232 ± 0,149 (z 1,5) på alle
   kampene — ikke signifikant. På den halvdelen jeg frøs som utvalg er det **+0,026 ± 0,200**,
   altså null. Hele bevegelsen ligger i den andre halvdelen (+0,496 ± 0,223).
2. **Og den oppsplittingen er i seg selv støy.** 200 tilfeldige 50/50-delinger av de samme
   kampene gir for iter10−iter7 en fordeling med median +0,234, p10 +0,043 og p90 +0,441
   (min −0,095, maks +0,686). «+0,50 på den ene halvdelen og +0,03 på den andre» er altså en
   helt ordinær trekning — ikke et funn om at holdouten er spesiell.
3. **Det eneste som nærmer seg et reelt løft er hele veien fra iter1:** +0,388 ± 0,157 (z 2,5)
   over ni iterasjoner. Det er nominelt ~2,5 SE, men det er også maksimum over ti målinger
   valgt på nettopp disse dataene, så den nominelle z-en er for høy. En ærlig lesning er
   «trolig et lite reelt løft på i størrelsesorden 0,2–0,4 pp over ni iterasjoner», ikke
   +0,38 med to desimalers selvtillit.

## Er holdouten stor nok? NEI — ikke for 0,3 pp

Dette er et gyldig svar, og det er bedre enn et tall som ikke tåler vekten.

* Parret SE mellom to iterasjoner er **~0,20–0,24 pp på holdouten** (123 kamper). En forskjell
  på 0,3 pp gir da forventet z ≈ 1,3 — under 30 % sjanse for å se den som signifikant.
  Holdouten kan først skille ut forskjeller fra **~0,45–0,50 pp** og oppover.
* Selv på **alle** 273 kampene er parret SE ~0,15, så 0,3 pp ligger akkurat på 2 SE. Hele
  målestokken er altså i underkant for størrelsen løkka jager per iterasjon — og portens
  faste margin på 0,15 pp ligger et godt stykke **under sin egen støy**.
* Praktisk følge: holdout-tallet skal ikke leses iterasjon for iterasjon. Det skal leses over
  flere iterasjoner (iter12 mot iter16, ikke iter12 mot iter13), eller som en trend.

## Én ting jeg IKKE endret, og som bør tas opp for seg

Helportens margin er fast **0,15 pp**. Den ligger under sin egen støy: parret SE mellom to
iterasjoner er ~0,15 pp på alle kampene og **~0,20 pp på utvalget** porten nå måler på. Porten
kaller altså «signifikant dårligere» oftere enn tallet bærer. Slik var det i v10 også — det er
bare tydeligere nå. Jeg har latt terskelen stå urørt med vilje: denne endringen skulle flytte
*målesettet*, og endrer man begge samtidig, kan man ikke se hva som virket. Men den bør vurderes.

## Å ta i bruk

`v11` krever at denne grena er slått sammen i `krav-2026-09-11` — løkkas `spol` spoler
arbeidskopiene fram dit, og batterikopien må ha `analyse/k1-kampsett.tsv`. Skriptet stopper med
en tydelig melding hvis fila mangler, i stedet for å måle på alt igjen uten å si fra.
