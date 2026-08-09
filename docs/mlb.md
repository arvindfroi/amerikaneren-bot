# MLB — planen

**Formålet: lage Adams Max UTEN å trene med en mester eller et orakel.**

Arvind, 9. august: «lag en plan og revider den. så får du en agent til å revidere
den også kommer vi i gang.»

---

## 0. Hva «uten mester eller orakel» utelukker

Dette er den bindende betingelsen, og den er skarpere enn den ser ut. Den
utelukker tre ting vi bruker i dag:

| forbudt | hvorfor det er et orakel |
|---|---|
| `sd-orakel`-korpuset | et SD-søk merket hver stilling. Hele `d7alle` er trent på det |
| DD-fasit som etikett | dobbeltdummy ser alle hender |
| «policy = søkets valg» | søket er en sterkere lærer enn nettet — en mester |

**Og det utelukker å starte fra E1.** `d7alle` ER orakelets kunnskap i vektform.
Initialiserer vi fra den, kan vi aldri påstå at resultatet er orakelfritt.

> **AVGJØRELSE 1: MLB starter fra tilfeldige vekter.**
>
> Kostnaden er reell — selvspill fra null i et firespillerspill med imperfekt
> informasjon er tregt. Men alternativet er å bygge Adams Max på en påstand vi
> ikke kan forsvare. Vi kjører i tillegg E1-initialisering som en SIDEARM, bare
> for å vite hvor mye starten var verdt.

**Det som IKKE er et orakel**, og som derfor er lov:

- **rundens faktiske poeng** — det er utfallet, ikke en dom
- **hvor kortene faktisk lå**, kjent ved rundeslutt — fasit om fortiden
- **reglene** (`lovligeKort`, `regler.ts`) — det er spillet, ikke en mening
- **søket som SPILLEKOMPONENT** i sanntid — det tenker, men det underviser ikke

Grensen er: *lærer nettet av noe som er sterkere enn det selv?* Da er det en
mester. Lærer det av **hva som skjedde**, er det selvtrening.

---

## 1. Faser

### Fase 0 — grunnmuren (kode, ingen trening)

| # | hva | fil |
|---|---|---|
| 0.1 | **Trekkbygger** fra `spillerVisning` alene — K2 strukturelt | `src/mlb/trekk.ts` |
| 0.2 | **Hukommelsen**: mikro/meso/makro per motstander, bokført ved rundeslutt | `src/mlb/hukommelse.ts` |
| 0.3 | **Handlingsrom** med maske per fase (bud, vrak, velg, spill) | `src/mlb/handling.ts` |
| 0.4 | **Nettet**: felles kropp + policy/verdi/tro | `src/mlb/nett.ts` |
| 0.5 | **Selvspilløkke** + erfaringsbuffer | `src/mlb/selvspill.ts` |
| 0.6 | **Ligaen** + porten mellom epoker | `src/mlb/liga.ts` |

### Fase 1 — fornuftssjekk (før én time med trening)

- et TILFELDIG nett spiller lovlig i 1000 kamper uten å krasje
- **K2-prøven passerer** på det tilfeldige nettet
- trekkbyggeren er bevist blind for skjulte kort — bytt ut de skjulte hendene og
  krev bit-identisk trekkvektor
- verdihodet lærer noe trivielt (f.eks. «hvor mange stikk har laget tatt»)
- én epoke kjører ende til ende på en time

### Fase 2 — ligaen

```
for hver epoke:
    spill N kamper mot befolkningen
    tren policy (utfall), verdi (poeng), tro (fasit)
    K2-prøven MÅ passere
    port: slår den forrige epoke PARRET, over 2 SE?  → inn i befolkningen
    ellers: forkast, og prøv med flere kamper
```

### Fase 3 — kravene

Kjør alle åtte prøvene. **Utgangsbetingelsen er at de passerer**, ikke at tapet
flater ut.

---

## 2. Læringssignalet, presist

**Verdi** ← rundens faktiske poeng for setet. Ren regresjon, alltid sant.

**Tro** ← hvor hvert usett kort faktisk lå. Ren klassifikasjon, fasit.

**Policy** ← fordelen. Og HER lå det første alvorlige hullet i utkastet mitt.

### Kredittproblemet, som utkastet gikk rett forbi

En runde har ~12 kortvalg og ett utfall. Skriver vi `A = rundens poeng −
verdianslaget` og bruker samme `A` på alle tolv valgene, får det ene gode
kortet og de elleve likegyldige nøyaktig samme forsterkning. Da lærer nettet
korrelasjon, ikke årsak — og i et spill der ett kort avgjør kontrakten er det
meste av variansen ikke vår fortjeneste i det hele tatt.

Målt i dette prosjektet: da versjonene ble sammenlignet på identiske kort,
skilte de lag i **9,4 % av valgene**, og når de gjorde det svingte utfallet
**11,6 poeng i snitt**. Det er signal-til-støy-forholdet policyen skal lære fra.

**Løsningen er TD, ikke sluttutfallet:**

    A(s, a)  =  r  +  V(s')  −  V(s)

der `s'` er neste stilling DENNE agenten står i, og `r` er poengene som falt
imellom. Verdihodet bærer da alt som skjer etterpå, og fordelen måler bare det
DETTE valget flyttet.

Det er fortsatt ren selvtrening: `V` er lært av faktiske utfall, ikke av en
lærer. Men variansen faller dramatisk, og krediten havner på handlingen som
faktisk flyttet noe.

> **AVGJØRELSE 3: TD med verdihodet som grunnlinje, ikke sluttutfall på alle
> handlinger.** Uten den tror jeg ikke treningen konvergerer i det hele tatt.

### Utforskning — det andre hullet

Et nett som spiller sin egen argmax i selvspill ser aldri noe annet enn det den
alt tror. Da kan den ikke oppdage at noe bedre finnes, og ligaen fryser.

Under selvspill **trekkes handlingen fra policyen**, ikke argmax, med en
entropibonus i tapet som holder fordelingen fra å kollapse. Under MÅLING spilles
argmax — ellers kan ikke to armer parres.

> **AVGJØRELSE 4: samplet handling i trening, argmax i måling.** Parringen i
> alle benkene våre forutsetter determinisme.

### Og ingen mester noe sted

> **AVGJØRELSE 2: ingen «policy = søkets valg».** Det er den ene snarveien som
> ville gjort dette til ekspert-iterasjon, og den er utelukket av formålet.

---

## 3. Ligaen

| motstander | andel | hvorfor |
|---|---|---|
| nåværende beste | 40 % | driver framgangen |
| tidligere epoker | 30 % | hindrer at vi glemmer |
| `rask` | 15 % | den beste stakken i matrisen i dag — ingen stråmann |
| **stiliserte vaner** | 15 % | uten dem finnes ingen vane å utnytte, og K6 kan ikke innfris |

Den siste raden er en KRAV-avhengighet, ikke en detalj: koblingssjekken målte
0 av 657 mot fire like agenter. *Ingenting å lære er ikke det samme som ikke å
kunne lære.*

---

## 4. Agentene, og hvorfor de ikke kolliderer

| agent | eier | avhenger av |
|---|---|---|
| **A** | `src/mlb/trekk.ts` + K2-garantien | — |
| **B** | `src/mlb/hukommelse.ts` | — |
| **C** | `src/mlb/nett.ts` + `selvspill.ts` | A sitt trekkoppsett |
| **D** | `src/mlb/liga.ts` + målerigg | — |

A og B er helt uavhengige (ulike filer, ulike data). C venter på A sin
trekklayout — den låses FØRST, som ett tall og ett dokument, så C kan begynne
mot en kontrakt i stedet for mot kode.

Ingen agent rører `src/moe2/`, `src/e1/` eller `web/`. Dagens bot skal fortsatt
virke og fortsatt være målbar.

---

## 5. Det som må låses før første kamp genereres

- [ ] **trekklayout** — antall og rekkefølge. Ett trekk lagt til senere gjør
      hele erfaringsbufferet ubrukelig
- [ ] **handlingsrommets indeksering** — det samme
- [ ] **hva hukommelsen bokfører**, og at den BARE ser ferdigspilte runder
- [ ] **holdout-frøbånd** avsatt før første kamp
- [ ] **hvem som sitter i ligaen** ved epoke 0

---

## 5b. Størrelsesorden — hva dette faktisk koster

Grovt, med dagens maskin (24 kjerner):

| | anslag |
|---|---|
| kamp uten søk (`rask` mot `rask`) | ~2 s |
| kamper per epoke | 5 000–20 000 |
| epoketid, 20 skard | **10–40 min spilling** |
| trening per epoke (GPU) | minutter |
| epoker til noe kan leses | titalls |

Det er dager, ikke timer — men det er FARBART, og det er billigere enn ligaen
med søk. Derfor er søket en spillekomponent og ikke en del av treningsløkka:
et søk per beslutning ville gjort epoken 100× dyrere.

**Måletid kommer i tillegg**, og den er ikke liten: porten mellom epoker krever
en parret måling over 2 SE.

---

## 6. Ærlige risikoer

**Datasult.** Selvspill fra tilfeldig i et firespillerspill med imperfekt
informasjon er den dyreste varianten vi kunne valgt. §46: korpuset er allerede
den bindende skranken.

**Utfallsstøy.** Én kamp gir noen få poengtall. Fordelen (`A`) er derfor støyende
per handling, og verdihodet må være rimelig før policyen kan lære noe.

**Ligakollaps.** Uten porten mellom epoker fylles befolkningen med versjoner som
ikke er bedre, og «beste» blir et snitt av støy.

**Og den viktigste:** hvis MLB ikke slår `rask` etter rimelig tid, er DET
resultatet. Ikke et argument for å trene lenger.

---

## 7. Hva som skjer med dagens Adams

Ingenting. Den er målbar, den er utrullet, og den er referansen MLB må slå.
`rask` er med i ligaen nettopp derfor.
