# Langsiktig plan: å lære å regne godt på budet

Skrevet 2026-08-02. Erstatter premissene i `cfr-budrunde-plan.md`, som fortsatt
er gyldig på CFR-mekanikken men bygger utbetalingen sin på et orakel vi siden
har målt som ubrukelig.

Arvinds formulering av målet: **optimal spilling + optimalt bud = optimale poeng
per runde.** Denne planen handler om det andre leddet.

---

## 0. Utgangspunktet, og en premiss som må rettes

Arvind: «helt til nå så har vi slått alle konkurrentene våres ved å by litt
høyere enn våres motstandere.»

Det stemmer ikke, og det er godt nytt. Målt på 1 666 budbeslutninger mot
MesterAI:

| | snittbud | passandel | andel ≥ 9 |
|---|---|---|---|
| MesterAI | 7,21 | 36 % | 25 % |
| vår bot | 7,17 | 37 % | 24 % |
| NevroHjerne | 7,17 | 37 % | 24 % |

Vi byr ikke høyere. Vi byr **identisk** – vår budgivning ER NevroHjerne, og
`Konvensjonsvakt.velgHandling` slipper budet rett gjennom urørt
(`if (h.type !== "SPILL") return h`). Mot menneskene er det samme bildet: de
melder 8,95, vi melder 8,87.

Vi lener oss altså ikke på en budkant som snart ryker. **Vi har ingen budkant i
noen retning.** Hele flaten er uåpnet, og det er en bedre utgangsposisjon enn
den Arvind beskrev.

---

## 1. Hva premien er, ærlig regnet

Det eneste tallet som er målt uten etterpåklokskap er fra `budregner.ts`:
120 trekninger å velge på, 120 **helt andre** å måle på.

| K trekninger | mot «by alltid 9» |
|---|---|
| 12 | −0,527 |
| 24 | −0,395 |
| 48 | +0,082 |
| 120 | **+0,177 ± 0,080** |
| ∞ med etterpåklokskap | +0,306 ← *ikke oppnåelig* |

Så: **~+0,18 poengdifferanse per budgiverrunde**, for åpningsbudet alene, fra
første budgiverposisjon.

Til sammenlikning er hele gapet MesterAI − NevroHjerne **+1,068 per
runde/sete**. Åpningsbudet alene er altså rundt en sjettedel av det.

Hele budflaten er større enn åpningsbudet – alle fire seter melder, og en
budrunde har flere beslutninger. En rimelig, men **udokumentert**, gjetning er
2–4× åpningsbudets verdi. Det ville gjort budet til den største enkeltposten vi
har igjen. Gjetningen er ikke målt, og skal ikke siteres som noe annet.

---

## 2. Hvorfor det opplagte ikke virker

Fire ting er prøvd og målt i denne runden. Alle fire må planen ta hensyn til.

**Vinnerens forbannelse er hovedfienden.** Å velge argmax over støyete anslag
plukker den heldigste MÅLINGEN like mye som det beste BUDET. Målt: en regner
med 12 trekninger er −0,825 mot en konstant. Kurven over snur først et sted
mellom 24 og 48 trekninger. *Enhver* metode som ender i et argmax over
estimater må håndtere dette, inkludert CFR.

**Orakler duger ikke som fasit her.** Dobbelt dummy er avvist av
godkjenningsporten (−0,609) og er målt skadelig å følge. Single dummy er
godkjent (+0,718) men for støyete til per-beslutning-argmax. Arvinds egen
løsning er den riktige: **mål på utfallet** – legg kortet eller budet, spill
runden ferdig i den ekte giva, les av poengene. Agentene er deterministiske, så
differansen er eksakt og ikke et estimat.

**Regning er dyrt på kjøretid.** K=120 er 840 fulle runder for ETT bud, med
handlingsrommet utvidet til ni. Det er sekunder per beslutning.

**Destillasjon er billig, men vi henter for lite ennå.** Ridge-regresjon på
105 håndtrekk over 12 000 hender: +0,041 ± 0,012 på mikrosekunder. Ekte, men
bare ~23 % av det regneren på K=120 klarer. Gapet er modellkapasitet og
datamengde, ikke prinsipp.

---

## 3. Avhengigheten ingen kan hoppe over

**Et bedre bud er verdiløst hvis kortspillet ikke kan spille kontrakten.**

Målt på 22 544 treningsstillinger: 92 % av dem er bud 9 eller 10. Bud 7 er
0,03 %. Nettet får kontrakten som trekk, men har aldri sett en niendedel av
dem. Byr vi 7 eller 12, spiller vi den som om den var 9.

Det er en selvforsterkende felle, og den binder de to leddene i Arvinds
likning sammen: **vi tør ikke by lavere fordi nettet ikke kan spille lavere, og
nettet lærer aldri å spille lavere fordi vi ikke byr lavere.**

`sd-orakel.ts --budspredning` er skrevet for å bryte den (bud 7 fra 0,03 % til
4,2 %, bud 11 fra 1,6 % til 12,3 %), men **kortnettet er ikke trent på nytt
ennå.** Det er fase 0 og det er ikke valgfritt.

---

## 4. Fasene

Hver fase har en utgangsprøve. Består den ikke, går vi ikke videre – vi
skriver ned hvorfor.

### Fase 0 — gjør kontraktrommet spillbart
Regenerer SD-orakeldata med `--budspredning 0.5`, tren kortnettet på nytt,
og mål parret. **Utgangsprøve:** `lagstikk − SD` skal ikke falle på kontrakt
9–10, og skal stige på 7–8 og 11–12.

Uten dette måler alle senere faser et bud vi ikke kan spille.

### Fase 0b — fullfør handlingsrommet
Amerikaner og solo inn i alle budmålinger. Boten melder dem i 0 % av 1 409
beslutninger, mens innsatsene er ±50 og ±100 mot et tallbuds ±18.
**Utgangsprøve:** vet vi hvor stor andel av hendene der de er den beste
handlingen. Er det 0 %, er dagens oppførsel riktig og saken er lukket.
*(Kjører nå.)*

### Fase 1 — utvid beslutningsrommet
Dagens datasett dekker bare **åpningsbudet fra første budgiver**, med policyen
«åpne på N, pass resten». Det utelater den beslutningen Arvind peker på: «den
står i 9, skal jeg si 10?».

`handTrekk` koder allerede budrunden så langt, så representasjonen holder – det
er utvalget som må utvides til alle budbeslutninger i alle seter.
**Utgangsprøve:** modellen skal måles på begge beslutningstyper hver for seg.

### Fase 2 — bedre etiketter til samme pris
Vinnerens forbannelse er et støyproblem, og støy kan reduseres billigere enn
ved å firedoble trekningene:

- **Felles tilfeldighet** på tvers av handlinger. *Gjort* – alle handlinger
  deler trekninger, så differansene er parret.
- **Kontrollvariat**: trekk fra et anslag på håndstyrke som er felles for alle
  handlingene. Det er sentreringen i `budtren.ts`, og den hjalp ikke alene –
  men som *variansreduksjon i etiketten* er den ikke prøvd.
- **Antitetiske trekninger**: par hver utdeling med sin speiling.
- **Krymping mot modellen**: bruk en tidlig modell som prior og trekk hver
  etikett mot den. Det er James–Stein, og det angriper forbannelsen direkte.

**Utgangsprøve:** argmax på K=24 skal bli positiv mot «by alltid 9». I dag er
den −0,395.

### Fase 3 — destillasjon
Tren en modell som svarer momentant. Ridge henter 23 % av regneren; prøv
gradient boosting og et lite MLP på samme data og samme holdout.
**Utgangsprøve:** slå regneren på det K vi har råd til på kjøretid. Klarer
modellen +0,15 der en K=24-regner gir −0,40, er saken avgjort til modellens
fordel.

### Fase 4 — iterert beste svar
Budrunden er konkurransepreget. Alle tallene over er målt mot motstandere som
byr som NevroHjerne. Regenerer dataene med budmodellen i alle fire seter, tren
på nytt, gjenta. Det er fiktivt spill, og det er den samme kuren som lukket
96 % av fordelingsgapet på kortspillet med DAgger.
**Utgangsprøve:** budfordelingen skal være stabil mellom to iterasjoner.

### Fase 5 — beste svar mot familien
CFR gir **likevekt** – uutnyttbar, men ikke maksimalt vinnende. Målet er å slå
dere, og mot en fast motstanderpopulasjon er det maksimale et **beste svar**,
ikke en likevekt. Vi har 813 loggede runder med deres faktiske bud.

Dette er et *valg*, ikke et steg: likevekt er tryggere mot MesterAI og ukjente,
beste svar er sterkere mot dere. Det bør tas bevisst når fase 4 er i mål.

---

## 5. Hvor CFR hører hjemme

`cfr-budrunde-plan.md` er ikke feil om CFR – den er feil om utbetalingen. §2
der bruker `evaluerHybrid`, altså dobbelt dummy, som §0 i samme dokument
allerede har strøket over som motbevist.

CFR trenger et utbetalingsorakel som er **både raskt og riktig**:

| orakel | kostnad | riktig? |
|---|---|---|
| `evaluerHybrid` (DD) | 1–2 ms | nei, målt −0,609 |
| ekte utspilling | ~2,5 s per hånd | ja |
| **lært modell (fase 3)** | mikrosekunder | ja, hvis trent på ekte utspillinger |

Fase 3 er altså ikke et alternativ til CFR – **den er brikken CFR mangler.**
CFR hører hjemme etter fase 4, ikke før.

---

## 6. Når vi skal gi opp

Skrives ned nå, mens vi ikke vet svaret:

- Hvis fase 0b viser at Amerikaner/solo er best på under 1 % av hendene, er den
  delen lukket.
- Hvis fase 2 ikke får K=24 positiv, er etikettstøyen for stor til at metoden
  bærer, og vi må enten firedoble regnekraften eller legge bort argmax-formen
  helt.
- Hvis fase 3 ikke slår +0,10, er hele budflaten under en tiendedel av gapet
  til MesterAI, og innsatsen hører hjemme i kortspillet i stedet.

---

## 7. Målestokken, som ikke endres underveis

Gjelder hver eneste fase:

1. **Mål på utfallet**, ikke mot et orakel. Arvinds idé, og den som ga den
   eneste bekreftede forbedringen i denne runden (+0,040, 5,4 SE).
2. **Parret** på giv, med samme kort i begge armene.
3. **Disjunkte frøbånd** og tegntest over skardene, ikke bare SE. Regel `m` var
   positiv i 10 av 10 skard – det er strengere enn 5,4 SE alene.
4. **Poengdifferanse**, egne minus snittet av de tre andre. Å straffe
   motstanderne teller like mye som å score selv.
5. **Aldri adoptere på støy.** Tre av fire tiltak i denne runden ble forkastet
   på måling, og to av mine egne tall ble trukket tilbake. Det er metoden som
   virker, ikke et uhell.
