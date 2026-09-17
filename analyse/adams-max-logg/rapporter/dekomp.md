# Dekomponering av K1-forspranget: hvor kommer det fra?

Gren `dekomp-2026-09-14` i **`D:\amb-dekomp`** (fra `krav-2026-09-11` @ 9aaed8e).
14. sep, maks 3 kjerner. **Ingen K1-måling startet** (armene koster 2,5 t; iterasjon 11 eier kjernene).
Alt i §1–§3 er ren reanalyse av LAGREDE rundedata. §4 er ny, billig instrumentering.

---

## 0. Metode, og hvorfor tallene her kan sammenliknes med batteriets

Klyngebootstrap over **kamper** (`spill`), B = 20 000, parret innen runde: menneskesiden er
identisk i alle armer, så `bP − mP` er en parret differanse per runde og SE-en er
bootstrap-fordelingens standardavvik — **ikke** delt på √n en gang til.

**Replikasjonskontroll:** min bootstrap gir på iter10 `ΔP = +1,243 ± 0,209` (z 5,9) mot
batteriets publiserte `+1,24 ± 0,21` (z +6,0) på de samme 2641 rundene i 273 kamper.
Samme tall, uavhengig kode. Alt under bruker den samme rutinen.

---

## 1. HOVEDFUNNET: halve forspranget ligger i runder der kontrakten BLE EN ANNEN

Rundedataene bærer `mRolle` og `bRolle` — menneskets og botens rolle i DEN SAMME runden.
Er de ulike, har budrunden endt et annet sted: boten sitter som fører der mennesket forsvarte,
eller motsatt. **Da spilles ikke resten av runden på samme kontrakt, og duplikatet
sammenlikner ikke lenger samme situasjon.**

| iter10 | runder | kamper | ΔP(seier) pp/runde | bidrag til totalen |
|---|---|---|---|---|
| **alle** | 2641 | 273 | **+1,24 ± 0,21** | +1,24 |
| samme rolle (a) | 2201 (83,3 %) | 247 | **+0,75 ± 0,19** | **+0,62** |
| ulik rolle (b) | 440 (16,7 %) | 200 | **+3,74 ± 0,83** | **+0,62** |

**16,7 % av rundene bærer 50 % av forspranget.** I dem er boten 5× så mye bedre per runde.

Samme bilde i rundepoeng: alle +1,56 ± 0,29 · samme rolle +0,96 ± 0,27 (bidrag +0,80) ·
ulik rolle +4,57 ± 1,03 (bidrag +0,76).

### 1a. Det er ikke en tilfeldighet i én iterasjon

| iter | n ulik | ΔP samme rolle | bidrag | ΔP ulik rolle | bidrag | total |
|---|---|---|---|---|---|---|
| 1 | 451 | +0,58 ± 0,19 | +0,48 | +2,19 ± 0,66 | +0,37 | +0,86 |
| 3 | 456 | +0,68 ± 0,17 | +0,56 | +2,52 ± 0,69 | +0,43 | +1,00 |
| 5 | 449 | +0,69 ± 0,18 | +0,58 | +2,02 ± 0,72 | +0,34 | +0,92 |
| 7 | 461 | +0,58 ± 0,18 | +0,48 | +3,06 ± 0,76 | +0,53 | +1,01 |
| 9 | 446 | +0,62 ± 0,18 | +0,52 | +3,55 ± 0,77 | +0,60 | +1,12 |
| 10 | 440 | +0,74 ± 0,19 | +0,62 | +3,74 ± 0,82 | +0,62 | +1,24 |

Andelen ulike roller står stille på 17 ± 1 %, og bidraget deres vokser fra +0,37 til +0,62 —
**hele veksten i K1 gjennom løkka (+0,86 → +1,24) ligger i den delen som ikke er samme
kontrakt.** Samme-rolle-delen har stått nesten stille (+0,48 → +0,62).

### 1b. Hvilke rolleskifter, og hvor mye

| overgang (menneske → bot) | n | kamper | ΔP | bidrag |
|---|---|---|---|---|
| forsvar → forsvar | 959 | 220 | +0,92 ± 0,17 | +0,334 |
| fører → fører | 780 | 208 | +0,99 ± 0,50 | +0,291 |
| makker → makker | 462 | 182 | −0,02 ± 0,13 | −0,004 |
| **forsvar → fører** | 127 | 91 | **+6,47 ± 1,80** | +0,311 |
| **fører → forsvar** | 148 | 110 | +3,04 ± 1,04 | +0,170 |
| **makker → fører** | 54 | 43 | +5,00 ± 2,51 | +0,102 |
| fører → makker | 104 | 81 | +1,02 ± 1,18 | +0,040 |
| forsvar → makker | 4 | 4 | +0,31 ± 3,05 | +0,000 |
| makker → forsvar | 3 | 3 | −1,68 ± 2,70 | −0,002 |

Det største enkeltbidraget fra en rolleendring er **forsvar → fører**: boten tar en kontrakt
mennesket lot gå, og henter +6,5 pp per slik runde. Motsatt vei (fører → forsvar, boten lar
være å by der mennesket bød) gir +3,0 pp. **Begge retninger er positive** — det er ikke bare
«boten byr mer», det er «boten byr annerledes, og begge veier lønner seg».

Merk også: `makker → makker` er **null** (−0,02 ± 0,13). Der boten ikke er fører og ikke
skifter rolle, finnes det ikke noe forsprang i det hele tatt.

---

## 2. ER DUPLIKATET RETTFERDIG? Nei — ikke i de 16,7 %

Svaret på spørsmål 2 er **at K1 er to mål i ett**:

* **(a) samme rolle, 83 % av rundene: +0,75 ± 0,19 pp.** Nærmest en ren spillsammenlikning,
  men se forbeholdet under — «samme rolle» er IKKE det samme som «samme kontrakt».
* **(b) ulik rolle, 17 % av rundene: +3,74 ± 0,83 pp.** Her er kontrakten en annen. Tallet er
  ekte — det er lov å by bedre — men det måler **budmodellen**, ikke kortspillet.

Forbeholdet den andre veien, og det er viktig: **rolle er en GROV markør for kontrakt.**
Boten kan by et annet tall, en annen trumf eller et annet etterlyst kort og fortsatt ende som
fører. Slike runder ligger i (a) og gjør +0,75 til et **øvre anslag** på den delen av
forspranget som er «samme situasjon». Den sanne rene spilldelen er ≤ 0,75 pp. §4 måler hvor
mye lavere.

### 2a. Fellearmen sier det samme, med motsatt fortegn

Batteriets K1-felle er `--spek nevro` (et rent nett i menneskets sete; porten krever at den
måler < −2 SE). Den er kjørt på **nøyaktig de samme 2641 rundene**, så den er en gratis
kontroll:

| arm | alle | samme rolle | ulik rolle |
|---|---|---|---|
| kandidaten (med søk) | **+1,24 ± 0,21** | +0,75 ± 0,19 (n 2201) | **+3,74 ± 0,83** (n 440) |
| nevro (fella) | **−1,02 ± 0,20** | −0,29 ± 0,16 (n 1803) | **−2,58 ± 0,50** (n 838) |

Rolleavviket **forsterker fortegnet i begge retninger**: en god bot henter mest der den byr
seg til en annen kontrakt, en dårlig bot taper mest samme sted. Det er nøyaktig signaturen til
at **budet er der armene faktisk skiller lag** — ikke kortspillet. Legg også merke til at
nevro havner i en annen rolle enn mennesket i 31,7 % av rundene mot kandidatens 16,7 %:
**en bedre bot byr likere mennesket**, og forspranget dens ligger likevel i avvikene.

---

## 3. HVOR MYE ER IGJEN Å HENTE PER LEDD? (nåbare tak, iter10, begge bånd)

Fra `iter10/krav.tsv` — `tak-kart.ts --naabart 32`, ett-stegs informasjonsrettferdig tak.
Positivt gap = taket ligger over boten = rom igjen. Enheten er **poeng/runde**.

| ledd | krav | nåbart gap, bånd 0 | bånd 1 | øvre grense for rom (+2 SE) |
|---|---|---|---|---|
| bud | K3.1 | **−0,43 ± 0,51** | −0,93 ± 0,66 | ≤ +0,58 |
| trumfvalg/vrak | K3.4 | **+0,00 ± 0,24** | +0,17 ± 0,29 | ≤ +0,48 |
| midtspill (stikk 3–5) | K3.6 | **+0,41 ± 0,45** | +0,10 ± 0,59 | ≤ +1,31 |
| sluttspill (siste fem) | K7 | **−0,25 ± 0,35** | −0,15 ± 0,38 | ≤ +0,45 |

**Ingen av leddene har målbart rom igjen under det nåbare taket.** Alle fire gapene er innenfor
2 SE av null, og to av dem er negative (boten slår sitt eget ett-stegs tak, som er ventet: valg
og score er disjunkte, så gapet er en nedre grense).

Klarsynstakene er store (bud +13,25 ± 3,30) men uoppnåelige ved bordet — de krever skjulte
hender. Adams ligger like langt unna i alle fire (K3.1-Adams-duellen: bot − Adams
−0,36 ± 0,41 poeng/runde i bånd 0, +0,65 ± 0,45 i bånd 1).

**Konsekvensen for prioritering:** spørsmålet «hvilket ledd har mest rom» kan ikke besvares
med dette instrumentet, fordi instrumentet ikke ser noe rom noe sted. SE-ene (0,24–0,66
poeng/runde) er av samme størrelse som HELE K1-forspranget i rundepoeng (+1,56 ± 0,29).
Takmålingene er for butte til å styre arbeidet videre.

---

## 4. SKILLEPUNKTSONDEN — ny, billig instrumentering

`examples/dekomp-probe.ts` (ny) går menneskets EGEN gjenskapte runde steg for steg
(`kamprunder` fra `menneske-logg.ts`) og spør boten hva DEN ville gjort i hver stilling der
mennesket handlet. Første stilling de er uenige i er rundens **skillepunkt**.

Lærertvang, ikke friløp: hver sammenlikning er i nøyaktig samme stilling, så skillepunktet er
veldefinert. Det er det samme punktet som i friløpet, fordi banene er identiske fram til det.
Rundens hele ΔP tilskrives så det leddet — standard «første avvik»-attribusjon.

**Kostnad:** 2640 av 2641 runder på 56 s, én kjerne (1 runde avvist: budrunden lot seg ikke
gjenskape med ≤ 2 avvik). Friløpsarmen uten søk: 2641 runder på 73 s. **Ingen K1-måling
startet** — begge kjøringene er ett minutt på én kjerne, ikke 2,5 t per arm.

**Hvorfor to armer:** skillepunktet må måles med en bot som er rask nok til alle 2641 runder,
altså speken UTEN søk (`okt:vr:…:profil:budq:…:vakt:abmp:e1:kort-11.bin`). Søkearmen er alt
kjørt av batteriet (`iter10/krav-b0-k1-spek-s*.jsonl`), og de to er parret på runde, så
søkets bidrag leses direkte. **Etiketten «hvor skilte de lag» kommer fra boten uten søk** —
det er gyldig fordi søket flytter kontrakten i bare **24 av 2641 runder** (§4b).

### 4a. TABELLEN — ΔP(seier) fordelt på skillepunkt, søkearmen (den målte boten, iter10)

| ledd de først skilte lag | runder | andel | ΔP i disse rundene | **bidrag til +1,24** | rundepoeng-bidrag |
|---|---|---|---|---|---|
| **budet** | 595 | 22,5 % | +2,76 ± 0,67 | **+0,62 pp** | +0,78 |
| vraket | 306 | 11,6 % | +0,42 ± 0,84 | +0,05 pp | +0,28 |
| trumf + etterlyst kort | 56 | 2,1 % | +1,44 ± 2,01 | +0,03 pp | +0,09 |
| **kortspill stikk 1–4** | 1496 | 56,7 % | +0,86 ± 0,19 | **+0,49 pp** | +0,40 |
| kortspill stikk 5–8 | 163 | 6,2 % | +0,96 ± 0,49 | +0,06 pp | +0,02 |
| kortspill stikk 9–12 | 17 | 0,6 % | +0,49 ± 0,95 | +0,00 pp | +0,00 |
| ingen uenighet i runden | 7 | 0,3 % | −3,10 ± 3,15 | −0,01 pp | −0,01 |
| **SUM** | **2640** | | | **+1,24 pp** | **+1,56** |

Summen er eksakt totalen (+1,24 ± 0,21), fordi bøttene er en partisjon av rundene.

**Grovt sagt: av de ~1,2 pp ligger 0,62 i BUDET, 0,08 i vrak + trumfvalg, og 0,55 i
KORTSPILLET — og 0,49 av kortspillets 0,55 ligger i de fire FØRSTE stikkene.**

### 4b. Hva søket alene gjør (søkearmen minus samme nett uten søk, parret på runde)

Menneskesiden er bit-identisk i begge armene (kontroll: 2641/2641), så differansen er parret.

| | ΔP |
|---|---|
| boten uten søk mot mennesket | **+0,74 ± 0,21** |
| søkearmen mot mennesket | **+1,24 ± 0,21** |
| **søk − uten søk** | **+0,50 ± 0,13** (z 3,8) |

Søket flytter kontrakten i bare **24 av 2641 runder**, og bidraget ligger der man skulle tro:
kortspill stikk 1–4 **+0,27** av de +0,50, vrak +0,08, trumfvalg +0,06, budet +0,07.

### 4c. Hvor ofte er de uenige i det hele tatt (ikke bare første gang)

| ledd | beslutninger | uenige | andel | runder leddet fantes i |
|---|---|---|---|---|
| budet | 2858 | 600 | 21,0 % | 2640 |
| vraket | 1032 | 450 | **43,6 %** | 1032 (bare som fører) |
| trumf + etterlyst | 1032 | 204 | 19,8 % | 1032 (bare som fører) |
| kortspill stikk 1–4 | 10 560 | 4802 | 45,5 % | 2640 |
| kortspill stikk 5–8 | 10 560 | 4991 | 47,3 % | 2640 |
| kortspill stikk 9–12 | 10 560 | 2564 | **24,3 %** | 2640 |

Boten spiller altså et annet kort enn mennesket i nesten halvparten av alle kortvalg — men
uenigheten er verdt +0,86 pp per runde bare når den kommer FØRST, i stikk 1–4. I sluttspillet
er de enige i 3 av 4 valg, og de 17 rundene der sluttspillet er skillepunktet bærer +0,00 pp.

---

## 5. SVARET PÅ «ER DUPLIKATET RETTFERDIG?» — tredelt

Rolle er en grov markør (§2). Sonden gir den fine: skilte budet lag, uansett om rollen endret seg?

| søkearmen | runder | andel | ΔP | bidrag |
|---|---|---|---|---|
| **ulik rolle** — kontrakten ble en annen | 440 | 16,7 % | +3,74 ± 0,83 | **+0,62** |
| **samme rolle, men budet skilte** | 173 | 6,6 % | +0,99 ± 1,00 | +0,06 |
| **samme rolle OG samme bud** — ekte samme situasjon | 2027 | 76,8 % | **+0,72 ± 0,19** | **+0,56** |

**Dommen: 55 % av K1-forspranget (0,68 av 1,24 pp) kommer fra runder der boten bød annerledes
enn mennesket.** I dem er kontrakten en annen, og K1 måler budmodellen, ikke kortspillet.
Det som står igjen som en ekte sammenlikning av samme situasjon er **+0,72 ± 0,19 pp**
(2027 runder, 247 kamper, z 3,8) — fortsatt signifikant, men litt over halvparten av tallet
batteriet rapporterer.

### 5a. Og på de 2027 ekte like rundene er det SØKET som gjør hele jobben

| på «samme rolle OG samme bud» (n = 2027) | ΔP |
|---|---|
| boten uten søk | **+0,21 ± 0,18** (ikke signifikant) |
| søkearmen | **+0,72 ± 0,19** |

Nettene alene er altså omtrent **par med mennesket** når kontrakten er den samme. Hele
forspranget i den rene sammenlikningen er søkets +0,51. Det er verdt å merke seg ved siden av
§3: troledd-arbeidet fant at søkets argmaks er 43,8 % støy — den støyen sitter altså på det
eneste leddet som faktisk bærer den rettferdige delen av K1.

---

## 6. DOMMEN, OG HVOR ROMMET ER

| ledd | bærer av K1 (pp) | andel | nåbart tak sier rom igjen | dom |
|---|---|---|---|---|
| **budet** | **+0,62** | 50 % | ≤ +0,58 poeng/runde (målt −0,43 ± 0,51) | bærer mest, men er PÅ taket |
| vrak + trumfvalg | +0,08 | 6 % | ≤ +0,48 poeng/runde (målt +0,00 ± 0,24) | bærer lite, er på taket |
| **kortspill stikk 1–4** | **+0,49** | 40 % | K3.6 (stikk 3–5) ≤ +1,31 poeng/runde | **mest ROM igjen** |
| kortspill stikk 5–8 | +0,06 | 5 % | — (ikke målt eget tak) | lite |
| kortspill stikk 9–12 | +0,00 | 0 % | K7 ≤ +0,45 poeng/runde (målt −0,25 ± 0,35) | **ferdig** |

**Leddet med mest rom igjen er de tidlige stikkene (1–4).** Det bærer 40 % av forspranget,
det er der søket alt betaler mest (+0,27 av søkets +0,50), det er leddet med flest
beslutninger (10 560), og det er det eneste leddet der takmålingen ikke klarer å utelukke
ekte rom (K3.6 sin øvre grense +1,31 poeng/runde er nesten hele K1 i rundepoeng).

**Budet bærer mest, men er ferdig:** +0,62 pp av forspranget, og det nåbare budtaket er alt
nådd (gapet er negativt i begge bånd). Å forbedre budmodellen videre krever informasjon som
ikke finnes ved bordet.

**Sluttspillet er dødt, og det er nå målt tre ganger.** 0,6 % av rundene har sluttspillet som
skillepunkt, de bærer +0,00 pp, boten er enig med mennesket i 3 av 4 sluttspillvalg, fasiten
er flat i 88 % av stillingene (`troledd.md` §2), og K7-taket sier ≤ +0,45 poeng/runde.
De to døgnene i troen, søket, verdensvektingen, kriteriet, temperaturen og σ-porten sto på det
leddet som bærer minst av alt. **Mistanken i oppdraget var riktig.**

---

## 7. FORBEHOLD, SAGT HØYT

1. **Etiketten er målt med boten uten søk.** Skillepunktet krevde en bot rask nok til alle
   2641 runder. Overføringen er forsvart av at søket flytter kontrakten i 24 av 2641 runder,
   men bøttegrensene for søkearmen er strengt tatt et ANSLAG. ΔP-tallene i tabellen er
   derimot søkearmens egne, målte tall.
2. **Artefaktgulvet er IKKE bundet.** Bare 7 runder hadde null uenighet i sete 0, og de bærer
   −3,10 ± 3,15 pp. Med n = 7 kan motstanderbyttet (v5-kjeden mot de botene mennesket faktisk
   møtte) ikke tallfestes. Det er den ene delen av «er duplikatet rettferdig» som forblir åpen.
3. **Ingen anger er regnet noe sted i dette notatet**, så regelen om flate fasitstillinger
   biter ikke: null stillinger er forkastet på det grunnlaget.
4. **1 av 2641 runder** falt ut av sonden (budrunden lot seg ikke gjenskape med ≤ 2 avvik).
   Friløpsarmene har alle 2641. Ingen andre runder er forkastet.
5. **SE er bootstrapfordelingens standardavvik**, klynget på kamp, B = 20 000 — ikke delt på
   √n en gang til. Rutinen er replikert mot batteriets egen dom (§0).
6. **Takene i §3 og §6 er målt på ANDRE giv** (48–60 giv fra batteriet), ikke på K1-rundene,
   og i poeng/runde. De kan ikke legges rett sammen med pp-kolonnen; de brukes bare som en
   øvre grense per ledd.

## 8. HVA JEG VILLE MÅLT NESTE GANG

1. **Kjør skillepunktsonden med søkearmen** på et utvalg kamper (f.eks. 40 av 273) for å
   feste bøttegrensene på den målte boten i stedet for anslaget. ~20 min på 3 kjerner.
2. **Bind artefaktgulvet:** kjør duplikatet med sete 0 TVUNGET til menneskets kort hele runden.
   Da er ΔP rent motstanderbytte, på alle 2641 runder i stedet for 7.
3. **Legg arbeidet i stikk 1–4.** Det er der forspranget og rommet møtes.

