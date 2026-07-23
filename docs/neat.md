# NEAT: nevroevolusjon for Amerikaner

Dette er den evolusjonære AI-linjen i repoet (parallell til PIMC-boten):
et nevralt nettverk som lærer HELE spillet – budrunde, vraking, trumfvalg
og kortspill – gjennom NEAT (NeuroEvolution of Augmenting Topologies),
med flakskontrollerte cupturneringer som seleksjonstrykk og anger
(regret) som ekstra læringssignal.

Alt bor i `src/neat/` og er, som resten av repoet, avhengighetsfritt og
deterministisk gitt frø.

## Kjøring

```bash
npm run neat-tren                    # 50 generasjoner, populasjon 32, frø 42
node examples/neat-tren.ts 200 64 7  # generasjoner populasjon frø
node examples/neat-tren.ts 100 64 7 --fra trening/mester.json   # gjenoppta
npm run neat-vakt                    # LANG trening under vakt (se under)
node examples/neat-vakt.ts 8000 64 7 --maks-timer 10
```

Mesteren lagres fortløpende i `trening/mester.json` og benkes hvert
10. generasjon mot en grådig heuristisk bot i duplikatkamper.

### Feilsikring for lange kjøringer (`neat-vakt.ts`)

For natt-trening kjøres `neat-tren.ts` under en vakt som gjør økten
selvhelbredende:

- **Atomisk lagring**: mester/status skrives som tmp + rename – et krasj
  midt i en skriving kan aldri korrumpere mestergenomet.
- **Hjerteslag**: treneren skriver `trening/status.json` hver generasjon
  (siste generasjon, tidsstempel, fitness, anger, benk).
- **Krasj**: dør treneren, starter vakten den om fra siste mester med
  gjenstående generasjoner, videreført generasjonsnummerering
  (`--gen-start`) og forskjøvet frø (et deterministisk krasj skal ikke
  reproduseres i evighet). Eksponentiell pause, maks 100 omstarter.
- **Heng**: står hjerteslaget stille i 10 min, drepes og omstartes barnet.
- **Tidstak**: `--maks-timer` gjelder hele økten; treneren avslutter pent
  (lagrer alt, kode 0) når tiden er ute.

## Arkitekturen

### Ett nett, hele spillet (`trekk.ts`, `agent.ts`)

Ett og samme NEAT-nett tar alle beslutningene. Inngangene (253 stk.)
koder KUN spillerens lovlige informasjon – de bygges fra `spillerVisning`,
som redigerer bort andres hender, talongen og uavslørt makker. Nettet får
det en menneskelig spiller med perfekt hukommelse vet: egen hånd, alle
spilte kort (stikkhistorikken er offentlig og eksponeres nå i
`spillerVisning.historikk`), bordet, budrunden, roller (budvinner/makker,
relative seter – rotert så nettet er posisjonsuavhengig), kontrakten,
stikkstillingen, kamppoengene og det etterlyste kortet. Et
beslutnings-flagg sier hvilken fase som spørres.

Utgangene (60 stk.) er hoder for hver deloppgave:

| Hode | Bruk |
|------|------|
| **xT** (forventede stikk) | budrunden: nettets verdivurdering av hånden |
| margin | lært budaggressivitet, legges til xT |
| Amerikaner / solo | tilbøyelighet til å melde de store meldingene |
| 4 trumfverdier | trumfvalg |
| 52 kortverdier | vraking (lavest vrakes), etterlysning og kortspill (høyest spilles) |

Budlogikken følger xT: agenten byr `⌊xT + margin⌋` (poengene følger
budet – 2n til budvinneren – så man byr det man regner med å ta), passer
under minste lovlige bud, og melder Amerikaner/solo bare når både det
egne hodet og xT sier ja.

### Genom og nettverk (`genom.ts`, `nett.ts`)

Standard NEAT (Stanley & Miikkulainen 2002): koblingsgener med historiske
innovasjonsnumre (felles `Innovasjonsbok` for hele populasjonen), slik at
vilkårlige genomer kan linjeres opp for kryssing og artsavstand.
Populasjonen starter minimal (bias + noen få tilfeldige koblinger per
utgang) og topologien VOKSER via mutasjoner: vektperturbasjon, ny kobling
(også rekurrente og selvsløyfer), ny node (splitter en kobling), av/på.

Fenotypen aktiveres iterativt og synkront: i hvert pass beregnes ny verdi
for SAMTLIGE ikke-inngangsnoder – alle nevroner tas med i beregningen,
også «dinglende» skjulte noder uten sti til en utgang (som senere
mutasjoner kan koble videre) og rekurrente sløyfer, som leser forrige
pass' verdi. Antall pass skalerer med antall skjulte noder, så signaler
rekker gjennom kjeder.

### Flakskontroll (`turnering.ts`)

Amerikaner er et spill med stor kortflaks. Seleksjon på rå poeng ville
premiert flaks, ikke ferdighet. Derfor spilles hver gruppekamp som
DUPLIKAT (som i turneringsbridge): 4 hele kamper med nøyaktig samme
kortgiving (samme frø), der de 4 agentene roterer syklisk gjennom setene.
Hver agent spiller hver hånd fra hver posisjon – god- og dårlig-kort
jevnes ut, og differansen som står igjen er ferdighet.

### Cup i grupper på 4 og fitness

Feltet deles i grupper på 4; gruppevinneren (flest kampseire, deretter
flest duplikatpoeng) går videre, resten er slått ut. Går ikke antallet
opp i 4, fylles gruppene med «lucky losers» (beste utslåtte). Hvor langt
en agent når – **cupdybden** – er grunnlaget for fitness:

- **Første turnering:** fitness følger dybden direkte.
- **Senere:** den regjerende mesteren står alltid som UENDRET kopi i
  populasjonen (plass 0) og må forsvare tittelen i samme cup. Fitness er
  da dybden **relativt til mesterens dybde** – slår du mesteren, får du
  mer enn den; når du kortere, får du mindre.

Duplikatpoengene skiller agenter på samme dybde (utslaget er < ett
dybdesteg, dybden dominerer alltid), og angeren trekkes fra.

### Anger/regret

For hver kontrakt bokfører agenten xT-estimatet den bød på. Etter runden
beregnes angeren:

- **kalibrering**: |xT − faktiske lagstikk| – hvor feil var estimatet?
- **utfall**: falt kontrakt koster (bud − stikk); klart med slakk koster
  0,25 · overskuddet (poeng lagt igjen på bordet – man kunne budt høyere).

Snittangeren per kontrakt trekkes fra i fitness (vekt `lambdaRegret`,
standard 0,5). To agenter som når like langt i cupen rangeres altså etter
hvem som byr mest presist – populasjonen lærer på regret, ikke bare på
plassering.

### Evolusjon (`evolusjon.ts`)

- **Artsdeling** på kompatibilitetsavstand (δ = c1·E/N + c2·D/N + c3·Ŵ),
  med terskel som justeres mot et måltall arter, og eksplisitt
  fitness-deling så nye topologier får tid til å modnes.
- **De dårlige lukes bort**: bare toppandelen (standard 40 %) i hver art
  får bli foreldre; stagnerte arter (12 generasjoner uten framgang) dør –
  med mindre turneringsvinneren bor der.
- **Avl**: 75 % NEAT-kryssing (matchende gener tilfeldig, disjunkte/
  overskytende fra den sterkeste, 1 % på tvers av arter) + mutasjon;
  resten klon + mutasjon. Artens beste kopieres uendret (elitisme), og
  mesteren overlever alltid.

## Determinisme og reproduserbarhet

Alt – kortgiving, turneringsoppsett, mutasjoner, kryssing – drives av én
seedbar RNG (`lagRng`). Samme frø gir identisk treningsforløp (testet).
Mestergenomer serialiseres til JSON og kan lastes for videre trening
(`--fra`); `Innovasjonsbok.hoppOver` sørger for at nye innovasjonsnumre
aldri kolliderer med de gamle.

## Filer

```
src/neat/genom.ts      gener, innovasjonsbok, mutasjon, kryssing, artsavstand
src/neat/nett.ts       kjørbart nett (alle nevroner, rekurrens, N pass)
src/neat/trekk.ts      spillerVisning → 253 innganger; 60 utganger definert
src/neat/agent.ts      NeatAgent – hele spillet fra ett nett
src/neat/turnering.ts  duplikatkamper, cup i grupper på 4, regret, fitness
src/neat/evolusjon.ts  artsdeling, seleksjon, avl
examples/neat-tren.ts  treningsløkke med lagring og benkemåling
```
