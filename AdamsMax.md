# AdamsMax

Den komplette Adams-modellen — kravene, målene, og hva som faktisk står igjen.

Dette er ikke en plan for hva som skal bygges. `docs/plan.md` er loggen over hva
som er målt. **Denne fila er fasiten: hva Adams skal være når han er ferdig, og
hvordan vi vet at han er det.**

Hvert krav under er hentet fra noe Arvind faktisk har bedt om. Der ordlyden er
hans, står den i sitat. Der et tall er målt, står målingen ved siden av — et
krav uten en måling er en mening.

---

## 1. Målet, i tall

Det finnes ett tall som avgjør om Adams er ferdig.

> **En menneske-ekvivalent motstander skal vinne under 5,0 % av kampene mot
> Adams.**

| motstander | vinnerandel mot Adams | |
|---|---|---|
| NevroHjerne | 3,65 % | |
| sd-r2 | 6,77 % | |
| ftf1 | 7,29 % | |
| **familien (19 ekte kamper)** | **15,8 %** | ← det vi skal slå |
| Adams-v3 (stedfortreder) | 20,21 % | |
| **stedfortreder mot v5** | **15,83 %** | ← der vi står |
| **MÅL** | **5,0 %** | ← 10,8 pp igjen |

Familien spiller omtrent på Adams-v3-nivå. For å presse dem til 5 % må Adams slå
dem med den marginen han i dag slår **sd-r2** med. Det er ikke en finjustering.

**Vekslingskursen er målt, og den flater ut:**

```
+0,127 poeng/runde  →  −4,79 pp
+0,3   poeng/runde  →  −2,88 pp      2,4× mer arbeid, 40 % mindre effekt
```

De 4,4 prosentpoengene fra v3 til v5 kostet søket i førersetet — prosjektets
største enkeltgevinst (+2,170 i det setet, z = +5,52 over fire bånd).

### Delmål med kjent status

| delmål | status |
|---|---|
| Slå NevroHjerne | **nådd** |
| Slå MesterAI | **nådd** — +0,14 poeng/runde over 879 runder |
| Slå familien med margin | 15,83 % → 5,0 % gjenstår |

**MesterAI-seieren er ekte, men smal.** +0,14 per runde er ikke mye, og den ble
målt med en stakk **uten søkelag i det hele tatt**, mot en MesterAI som søker i
alle fire seter.

---

## 2. Hva Adams skal kunne

> «lag en komplett modell som kan forbedres av seg selv med **alle egenskaper og
> evner en menneske og en maskin kan ha**»

> «har den samme evner som mennesker har nå i et spill til 100 (eller mer) poeng?
> hukommelse, strategi, optimalt valg, etc etc»

### 2.1 Hukommelse og slutning

| evne | krav | status |
|---|---|---|
| **Hvem la hva** | «hvem la hva er et must. det må funke og det må påvirke hvordan han forutser spillet og predikerer hva kort andre har på hånden» | koblet (A1/A5) |
| Renonser | harde forbud i verdenstrekningen | koblet |
| Bayesiansk motstandertro | «prediksjonen burde ikke være normale regler men enten læring over tid eller matematiske formler» | koblet i V7 (`b`) |
| Kortelling | `telrd` | koblet |
| Sanseblokk (441 ekstra trekk) | fordeling over hvor kortene sitter | **IKKE i Adams** — se §5 |

### 2.2 Strategi og valg

| evne | krav | status |
|---|---|---|
| Søk uten strategifusjon | alpha-mu, Pareto over utfallsvektorer | koblet |
| Søk i **alle roller** | fasegapet ligger i makker (−0,22) og forsvar (−0,12) | koblet i V7, **måles nå** |
| Motstandermodell i rollouts | A2 — ikke anta at alle spiller som oss | koblet, men se §6 |
| Kampstillingsbevissthet | varians er verdt noe når man ligger bak | koblet, men se §6 |
| Uleselighet | ikke være forutsigbar blant likeverdige kort | koblet |
| Eksakt sluttspill | siste stikk er tvunget | målt: **0,3 % av taket** — lukket |
| Signalering | «ikke like viktig … tett evnebegrensningene først» | koblet i V7 (`g`) |

### 2.3 Budgivning

> «fokuser på å gjøre spillet hans optimalt så BAM legger vi på en siste
> budmodell som gir max poeng»

**Budrunden er 41,8 % av alt som er å hente** (+8,06 av taket, §60). Det er det
eneste vinduet som er stort nok til å nå 5 %.

| evne | status |
|---|---|
| GBT-modell for (μ, σ) | koblet |
| Kalibrert terskel | koblet, målt optimal (fire retninger, alle ≤ 0) |
| Budsøk (A4) — spør spillet, ikke regresjonen | koblet i V7 (`sok`), umålt |
| Auksjonskorreksjon | målt, **replikerte ikke** (z = 0,71 og 0,54) |

### 2.4 Forklarbarhet

> «si vi får et dårlig resultat så må vi kunne se hva som slår godt ut og hvor vi
> har gjort feil»

Alpha-muens utfallsvektor **er** regnskapet valget ble tatt på, så forklaringen
kan ikke lyve om sin egen årsak. Koblet, av som standard (kostnad).

### 2.5 Læring

| krav | status |
|---|---|
| «det skal bare lære per økt for nå» | `okt:` — ingen `fs`, ingen `localStorage`, ingen `fetch`. Testhåndhevet. |
| Selvtrening: nytt nett tilbake i generatoren | `verktoy/generasjon.sh` |
| «pass deg for overfitting» | `verktoy/kollaps.py` — fremmede prober, kurve over generasjoner |
| «pass på at den lærer av seg selv» | forfremmelse bare ved bestått port |

---

## 3. Reglene som ikke får brytes

Disse er ikke stil. Hver av dem finnes fordi noe gikk galt uten den.

1. **Aldri adopter på støy.** Parret på giv, replikert i **disjunkte frøbånd**,
   tegntest ved siden av snittet. Kontrollarmen må måle **eksakt 0,0000** på
   gate 2 (eller 0,2500 på kampbenken). Gjør den ikke det, er benken i stykker
   og ingen andre tall kan leses.

2. **Alle måleresultater skrives til varige filer.** Aldri stdout-rør på
   flertimers arbeid.

3. **Les aldri en gate2-fil før kjøringen er ferdig.** Delresultater løy fire
   ganger på én natt — forsvarssøket så ut som +0,255, så +0,125, og endte på
   −0,027.

4. **Det målte og det utrullede må være samme ting.** Prosjektets mest gjentatte
   feil, funnet **tretten** ganger. Håndheves av
   `test/utrullet-lik-maalt.test.ts`.

5. **Repoet er offentlig.** Ingen fornavn fra familien i kode, logger eller
   commit-meldinger. Navnene finnes bare i Val Town-databasen.

6. **Ingen utrulling uten eksplisitt beskjed.**

7. **Ingen kryssøkt-lagring av spillerprofiler.** Per økt, aldri til disk.

8. **Alt logges i `docs/plan.md`** — også det som feilet, og hvorfor.

9. **En knott skal ha et nullpunkt som er bit-identisk med «av».** Ellers kan
   ingen sveip starte fra noe kjent.

10. **En test skal måle at noe FYRER, ikke at det finnes.** Fire døde moduler
    hadde grønne enhetstester hele tiden.

---

## 4. Det som er koblet nå: ADAMS_V7

```
okt: vr:vrakrang.bin:telrd : amu:alle:12k16bgm1e0.25r0.4
   : profil : budm:bud-vant.json@-3.0/…/sok12k8b0.5
   : vakt:abmpf : e1:d7alle.bin
```

| ledd | evne |
|---|---|
| `okt:` | øktminne, motstandermodell |
| `vr:` | vrak og trumfvalg |
| `telrd` | kortelling |
| `amu:alle` | søk i **alle tre roller** |
| `b` | A5 — bayesiansk verdensvekt |
| `g` | A6 — signalforenlighet |
| `m1 e0.25 r0.4` | Pareto-dybde, uleselighet, kampstilling |
| `profil:` | motstanderprofil |
| `sok12k8b0.5` | A4 — budsøk, blandet 50/50 |
| `vakt:abmpf` | konvensjoner, inkl. `f` (+0,031, z = +2,95) |
| `e1:d7alle` | kortnettet |

**Ingenting i V7 er målt ennå.** `alle`, `b`, `g` og `sok` kan alle vise seg
negative — `ork:`-forsvarssøket målte −0,027. Poenget med V7 er at de nå *kan*
måles. Før 7. august var de ikke i boten i det hele tatt.

---

## 5. Det som fortsatt mangler

### 5.1 Sanseblokken er utenfor Adams

`montetro` krever et nett på **≥ 558 trekk**. Adams kjører `d7alle` på **273**.
Det eneste brede nettet vi har, `b714gammel`, måler **−1,15** mot `d7alle`.

Å bytte ville gjort Adams verre for å slå på en evne. **Låsen åpnes av et bedre
714-nett, ikke av en spekendring.** `sd-natt-a` (52 271 rader, 714 bredt, med
montetro) trener mot nettopp det.

### 5.2 Korpuset er en størrelsesorden for lite

`ftf1` ga +0,136 fra **410 000** rader. Største arm har 52 271.

| måling | rader | resultat |
|---|---|---|
| §91 `cny1` | 7 516 | −0,277 ± 0,348 (10,0 % avgjorte) |
| §94 `any25000` | 25 727 | −0,152 ± 0,163 (25,3 % avgjorte) |

Begge null. Det er et **styrkeproblem**, ikke et gyldighetsproblem.

### 5.3 Dyp prøveeffektivitet

Å lære av **én** hånd, slik et menneske gjør. Ingen kjent tilnærming. Åpent.

---

## 6. Benken er smalere enn boten

**Tre evner kan ikke måles av gate 2, uansett hvor mange giv vi kjører.**

Gate 2 lager friske agenter per giv og stopper ved `RUNDE_SLUTT`:

| evne | krav | i gate 2 |
|---|---|---|
| A2 / `okt:` | ≥ 4 observerte runder | får **1**, med nullstilling |
| `profil:` | fyller boka over tid | samme |
| `race` (`r0.4`) | `framdrift ≥ 0,3` | **eksakt 0**, alltid |

Korpusgenereringen spiller *hele* kamper, så de tre er **aktive når etikettene
lages** og **avslått når vi bedømmer**.

**Krav:** forfremmelsesporten kan ikke være gate 2 alene. `examples/kamp.ts`
spiller fem kamper til 100 poeng per frø med agenter som husker. Den må være
andre port.

---

## 7. Veien videre, i rekkefølge

1. **`amu:alle` mot `amu:foerer`** — kjører nå, 4 000 giv, SE ±0,052.
   Avgjør om søket i makker og forsvar er verdt kostnaden.
2. **Kampbenken som andre port** — så `okt:`, `profil:` og `r0.4` kan måles i
   det hele tatt.
3. **V7 ledd for ledd** — `b`, `g`, `sok` hver for seg mot V6.
4. **Et 714-nett som slår `d7alle`** — åpner sanseblokken.
5. **Budmodellen til slutt** — 41,8 % av taket, og den skal legges på et spill
   som allerede er optimalt.

---

## 8. Når er Adams ferdig?

Når **alle** disse holder samtidig:

- [ ] Menneske-ekvivalent motstander under **5,0 %** mot Adams
- [ ] Hver evne i §2 er koblet **og** målt — ingen med ukjent fortegn
- [ ] Ingen modul importeres av bare sin egen test
- [ ] Ingen evne er usynlig for portene den bedømmes av
- [ ] `ADAMS` == `ADAMS_MAALT` (alt målt er rullet ut)
- [ ] Kollapskurven er flat over minst tre generasjoner
- [ ] Boten kan gjøre rede for valgene sine med tall den faktisk valgte på

Kryss av bare med en måling ved siden av.
