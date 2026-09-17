# Er de fire andre evnene ogsaa frakoblet? — koblingssjekkens gjenstaaende nuller

Gren: `koblinger-2026-09-13` i **`D:\amb-kobling`** (ny arbeidskopi, basert paa
`krav-2026-09-11` @ 3c4e0b6). Startet 13. sep.

**Hvorfor egen arbeidskopi og ikke `D:\amb-krav`:** kanal 2-grenen har en
K1-maaling gaaende mot seg der. Et grenbytte ville byttet kildefiler under en
maaling som loeper. Basen er `krav-2026-09-11` med vilje: det er grenen
`analyse/koblingssjekk.txt` (11. sep) ble maalt paa, saa foer/etter er direkte
sammenlignbart. **Kanal 2-grenen er ikke roert.**

## Oppdraget

Kanal 2 var **strukturelt frakoblet**: én hardkodet `undefined` i `sdpar.ts:276`,
og `sik:`-grenen leste aldri `W`. Fem rader staar fortsatt paa 0 ulike. For hver:

- **(a)** strukturelt frakoblet i botstien — som kanal 2
- **(b)** koblet, men sjekken maaler den i en stilling der den ikke KAN fyre
- **(c)** koblet og fyrer, men flytter tilfeldigvis ingen av disse 219 valgene

## Verktoeyet som skiller dem: `examples/koblingssonde.ts`

Sjekken kan si at tallet er 0. Den kan ikke si HVORFOR. Sonden maaler, i
NOEYAKTIG de samme 219 valgene, hvor mange ganger hver knott i det hele tatt har
en stilling aa virke i. En knott som aldri faar sjansen kan ikke leses som
«virkningsloes». Den driver spillet med ÉN arm og koster ~1/32 av sjekken.

---

## DOMMEN

| rad | dom | beviset |
|---|---|---|
| `okt:` hukommelsen | **(b)** stum her | stilen er sikker i **0 av 41** amu-valg; maks \|forskjell\|/SE = **0,47**, porten er 2,0 (`okt.ts:142`, `stilbias.ts:331`) |
| `profil:` motstandermodellen | **(c)** i sjekkens form, **(a) i helbotens** | justeringen er ulik null i **6 av 19** budvalg (maks 0,154) — den fyrer. Men i `…:profil:sik:…` naar den aldri budet |
| `r` kampstilling | **(c)** fyrer | `racepress != 0` i **10 av 41** amu-valg; maks framdrift 50 %, porten er 30 % (`race.ts:64`) |
| `d4` sluttspilldybde | **(c)** fyrer | `stikkIgjen <= 4` i **11 av 41** amu-valg (`amuagent.ts:344`) |
| `B4` soekebredde | **(b)** stum her | med `m1` returnerer `alphamu.ts:166` FOER breddeblokka paa `:204` — koden er unaaelig |

**Ingen av de fem er en ren (a) slik kanal 2 var.** Men to funn av samme
feilklasse falt ut av sporingen, og begge er ekte:

1. **`profil:` naar ikke budet i helbotens form** — budagenten finnes, den ligger
   ett lag for dypt, og `bud` blir `null` uten et pip.
2. **`sik:` svelger amu-knottene og slaar av HELE soeket i stillhet.**

---

## 0. Alle fem radene maaler `amu:`, ikke `sik:` — den er den samme blindsonen

`examples/koblingssjekk.ts:61` bygger `FULL` av `AMU(...)` = `amu:foerer:…`. Alle
ti ablasjonsradene og alle seks paaslagsradene henger paa den speken. Helboten
kjoerer `sik:` (`D:\amb-grp\loop\utrullingskandidat.md:30`):

```
okt:vr:…:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=…:budq:…:vakt:abmp:e1:…
```

Og `r`, `d` og `B` **finnes ikke i `sik:`-grenen i det hele tatt**: `ParOpts`
(`sdpar.ts`) og `SikkerOpts` (`sikkerorakel.ts`) har verken lambda, dybde eller
bredde. K5-mikro, K7-sluttdybden og soekebredden er altsaa amu-only knotter, maalt
i en gren boten ikke kjoerer. Det er ikke en feil i seg selv — `sik:` har `e<T>`
og `eks:`-laget for sluttspillet, og `vurderPar` ER alpha-mu med M=1, saa bredde
under roten er meningsloest der. Men det betyr at **tre av de fem radene ikke kan
si noe om helboten**, uansett hva de viser.

---

## 1. `okt:` — (b), og porten er maalt

`Økt.stilvri` (`okt.ts:142`) returnerer `null` til `bok.stil(sete).sikker`, og
`stilbias.ts:331` setter `sikker = |forskjell| >= 2·SE`. Med fire like agenter
finnes det ingen stil aa finne.

**Maalt av sonden:** sikker i **0 av 41** amu-valg, maks \|forskjell\|/SE = 0,47.
Den naar ikke halvveis til porten.

Dette er ikke nytt, men det er nå maalt i selve sjekkens stilling:
`analyse/koblingssjekk3.txt` (8. aug) viste 0 av 657 med fire like og **2 av 548
mot tre trumftrekkere**. Kanalen er koblet og nesten stum.

**Stillingen som trengs:** et bord der minst ett sete har en ekte, avlesbar vane.

## 2. `profil:` — (c) i sjekken, (a) i helboten

`agentspek.ts:1613` leser `settForsvarsjustering` paa laget RETT UNDER `profil:`.
`budmodell.ts:253` er det ENESTE stedet metoden finnes.

**Maalt av sonden, del 1:**

```
koblingssjekkens form   profil:budm:…        budagent paa dybde 1   KOBLET
helbotens form          profil:sik:…:budm:…  budagent paa dybde 2   JUSTERINGEN ER IKKE SATT
```

I sjekkens egen form fyrer kanalen: justeringen er ulik null i **6 av 19**
budvalg, maks 0,154. Den flytter bare ikke et bud — 0,154 mot en terskel rundt
2,5–3,0. Det er **(c)**.

I helbotens form naar den aldri fram. `utrullet.ts:180-188` beskriver formen som
en foelge man kjenner, men den er ikke maalt noe sted, og en koblingssjekk som
bare kjoerer `profil:budm:` kan aldri se den.

**Og den er doed av TO grunner i dagens helbot:** dybden, og at `budq:`
(BudQagent) ikke er `Budjusterbar` i det hele tatt. Aa gi BudQ en
forsvarsjustering er en modellbeslutning, ikke et ledningsarbeid — den hoerer til
eieren.

## 3. `r` — (c), ikke (b)

`race.ts:64`: `if (framdrift < 0.3) return 0`. Filhodet i `koblingssjekk.ts:32`
foerer `r` som «BENKEGRENSE», altsaa (b). **Det er en presisering verdt aa gjoere:
sonden maaler `racepress != 0` i 10 av 41 amu-valg, med maks framdrift 50 %.**
Knotten FYRER i de 219 valgene — den flytter bare ingen argmax. Det er (c).

## 4. `d4` — (c)

`amuagent.ts:344-348` hever `M` til `stikkIgjen` naar `stikkIgjen <= terskel`.
Sonden: **11 av 41** amu-valg staar i en slik stilling. Knotten fyrer.
`analyse/koblingssjekk2.txt` maalte `d5` til 1 av 657, og gate 2 maalte `d4` til
4 endrede utfall av 1396 par. Sjeldenhet, ikke frakobling.

## 5. `B4` — (b), strukturelt uNAAELIG med `m1`

`alphamu.ts:229` kaller `søk(etter, opts.M - 1)`. Med `M = 1` er `dybde = 0`, og
`:166` returnerer FOER breddeblokka paa `:204-211`. Koden kan ikke naas.
`koblingssjekk2.txt` maalte 0 ogsaa med `M=2`, fordi `:210` krever
`kandidater.length > bredde`, altsaa mer enn 4 FELLES lovlige kort under roten.

**Stillingen som trengs:** `M >= 2` OG mer enn `bredde` felles lovlige kort under
roten. Raden som kan SE ledningen er derfor `m2B2`, ikke `m2B4`.

---

## 6. Funnet ved siden av: `sik:` svelger amu-knotter og slaar av soeket

`agentspek.ts:1392` leste kandidatfeltet uten aa validere det. Skriver noen
`sik:…:12k16d4`, blir `Number("16d4")` = `NaN`, og i `solver/sampler.ts`:

```
if (!harInfo || kandidater <= 1) return trekkVerden(...)   // NaN <= 1 er FALSE
for (let i = 0; i < kandidater; i++)                        // 0 < NaN er FALSE
```

Loekka gaar null runder, `utvalg` blir tom, og hver verdenstrekning returnerer
`null`. **Hele soeket er stille av.**

**Maalt (sonden, del 2b), avvik fra den SOEKLOESE basen over 115 valg:**

```
sik:…12k16    (ren)        23   soeket lever
sik:…12k16d4  (svelget)     0   SOEKET ER HELT AV - speken ser ut som den soeker
```

En spek som ser ut som den soeker, og en maaling som ser ferdig ut. Ingen
eksisterende spek i repoet har et slikt felt (sjekket: alle sik-felt er
kombinasjoner av siffer, `k`, `e`, `a<krit>`, `s`, `L`, `M`, `D`, `~`).

---

## 7. Ledningene som er lagt

| fil | endring |
|---|---|
| `src/moe2/agentspek.ts` | `profild:` — som `profil:`, men finner budlaget gjennom soekelaget. Uten «d» staar uttrykket ORDRETT som foer, og det dype oppslaget bygges ikke. |
| `src/moe2/agentspek.ts` | kandidatfeltet i `sik:` valideres: `r`/`d`/`B` kaster i stedet for aa bli `NaN`. |
| `examples/koblingssonde.ts` | ny — skiller (a)/(b)/(c) for en hvilken som helst null-rad. |
| `test/profild-sikkandidater.test.ts` | ny — «av er av», koblet, og at knottene kaster. |

**AV ER AV, STRUKTURELT:** uten «d» kjoeres ikke det dype oppslaget i det hele
tatt. «Av» er ikke en dybde satt til 1 — det er en kodesti som ikke besoekes.
Proeven `profil: uten «d» er uendret` haandhever at `…:profil:sik:…` fortsatt har
`forsvarsjustering === null`, saa hver maaling som er gjort med den formen staar.

**K2:** `profild:` legger ingen ny lesning til. `Profilbok.justering` leser
`state.budrunde.sisteBud` (offentlig) og profilen, som bokfoeres paa
`RUNDE_SLUTT` naar alle kort er avdekket — `profilagent.ts:190` foerer allerede
hvorfor det er lovlig. Kanalen flytter bare hvor justeringen LEVERES, ikke hva
den ser.

**Typesjekk:** `src` rent. Eneste feil er `src/mlb/fargebytte.ts` TS6133, som er
eldre enn denne grenen, staar i en fil jeg ikke har roert, og som ogsaa
kanal 2-rapporten foerer som forhaandseksisterende.

## 8. Grunnlinja er reprodusert FOER noe ble endret

`node examples/koblingssjekk.ts > analyse/koblingssjekk-foer.txt` paa den
uroerte `krav-2026-09-11`-grenen ga alle 16 radene **identisk med 11. sep, tall
for tall** (0, 0, 2, 15, 4, 9, 0, 12, 7, 27 / 11, 0, 0, 0, 1, 5). Riggen har ikke
flyttet seg, saa en endring i tabellen under kan ikke forklares med at selve
sjekken har beveget seg.

## 9. Proevene

### De nye — `test/profild-sikkandidater.test.ts`, 7 av 7 groenne

| proeve | resultat |
|---|---|
| `profil:` uten «d» er uendret — fester seg naert, IKKE gjennom soekelaget | **groenn** |
| `profil:` og `profild:` er samme bot naar budlaget ligger rett under | **groenn** — 0 avvik |
| `profild:` naar budlaget gjennom soekelaget, med og uten oekt | **groenn** |
| `profild:` finner ingenting naar det ikke FINNES noe budlag | **groenn** |
| `sik:` avviser `r`/`d`/`B` i stedet for aa svelge dem | **groenn** |
| gyldige sik-speker bygger fortsatt, med og uten «k» | **groenn** |
| kandidatfeltet maa vaere et helt tall ≥ 1 | **groenn** |

**Den viktigste er den foerste.** Den haandhever at `…:profil:sik:…` FORTSATT
har `forsvarsjustering === null`. Slaar den om til `true`, er `profild:` ikke
lenger opt-in — da har hver eneste maaling gjort med den formen stille faatt en
ny budkanal.

### Regresjon: 79 av 79 groenne paa den EKSISTERENDE proevemassen

`node --test --test-concurrency=1` over `profilagent`, `moe2-profil`, `okt`,
`k6-vaner`, `stilbias`, `sik-okt`, `utrullet-sik-okt`, `k2-spek`, `k4-spek`,
`amu-bitidentisk`, `agentspek-en-parser` (+ de nye): **79 proever, 79 groenne,
0 roede** (109 s).

Dette er sterkere bevis enn mine egne proever, fordi de ble skrevet FOER
endringen og uten kjennskap til den:

- **`utrullet-sik-okt` «PARITET»** (22,2 s, levende hukommelse) kjoerer
  `okt:…:profil:sik:alle:0.5:4LMD:…` — NOEYAKTIG topologien jeg roerte — og
  krever at byggeren og speken velger identisk. Groenn.
- **`amu-bitidentisk`** er fasitlisten: kortvalg maalt 8. august og limt inn.
- **`k2-spek`** og **`k4-spek`** bygger begge helbotformen `profil:sik:…`.

Ingen av dem kjenner «d». At de staar uendret er noeyaktig paastanden om at
speker uten «d» er den samme boten som i gaar.

## 10. K2: ingen ny sti ser skjulte kort

`profild:` flytter HVOR justeringen leveres, ikke HVA den ser. Sporet i sin
helhet:

| ledd | hva den leser |
|---|---|
| `Profilbok.justering` (`profilagent.ts:294`) | `state.fase`, `state.iTur`, `state.antallSpillere`, `state.budrunde.sisteBud` — alt offentlig ved bordet |
| `evForsvarMot` (`profil.ts:328-331`) | `p.klarte` (en teller) og `kontrakt` (et bud). **Tar ingen `GameState` i det hele tatt.** |
| `Profilbok.observer` | bokfoerer paa `RUNDE_SLUTT`, naar alle kort er avdekket. `profilagent.ts:190` foerer allerede hvorfor det er lovlig: «det er slik mennesker leser hverandre mellom runder», og valgene i runde `r` ser bare residualer fra runde `< r`. |

Kontrollert eksplisitt: `grep 'state\.hender\|state\.vrak\|\.giving' src/moe2/profilagent.ts`
gir **null treff**. Profilboka har ingen tilgang til skjulte kort aa videreformidle,
saa en kanal som bare endrer mottakeren av tallet kan ikke lekke noe nytt.

Den andre endringen (kandidatfeltet) er en ren avvisning av en ugyldig streng og
leser ingenting.

(Fortsettes: foer/etter-tabell.)
