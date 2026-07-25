# MoE2 – ny NEAT-arkitektur bygget på det vi målte

Alt her er begrunnet i målinger fra 2026-07-25. Ingen designvalg står uten et
tall bak seg. Det eneste som arves fra den gamle koden er **spillereglene**
(`src/motor.ts`, `src/regler.ts`, `src/kort.ts`) og orakelet (`src/solver/`,
`src/e1/`). Alt annet bygges på nytt.

## De syv feilene arkitekturen må gjøre umulige

| # | Målt problem | Tall | Hva MoE2 gjør |
|---|---|---|---|
| 1 | Poeng kan ikke rangere genom | parret SE 3,05 mot typisk forskjell 1,37 → 67 % riktig rangering. Splittkorrelasjon −0,08 selv med 800 runder/genom | Poeng er **aldri** fitness. Bare benk. |
| 2 | Relativ fitness inflaterer | Elo-snittet steg 1520→4119 på 1500 gen med uendret spredning; +1,98/gen ren aritmetikk | Ingen populasjonsintern rangering. Alt måles mot frosne referanser. |
| 3 | Agenten unnviker rollen sin | spillefører i 6 % → 2 % → 0,3 % av rundene | Hver ekspert måles **bare** på beslutninger den eier, med rollen påtvunget. |
| 4 | Genene forklarer ingenting | R² holdout 0,018; agenteffekt 0,1 % av angervarians, stilling 68 % | Ingen per-gen-redigering. Ingen ablasjonsbasert arv. |
| 5 | Beslutningen er aggregert | 1 skalar (margin) slår 400 ablasjonsprediktorer med faktor 31 | Eksperten vurderes på utfall, ikke på indre struktur. |
| 6 | Trening ødela kortspillet | trente genom anger 1,07–1,15 mot tilfeldig 1,035; ferskt utrent 1,040 | Hver ekspert har **gulv- og takreferanse** målt på samme utvalg. Faller den under gulvet, stoppes den. |
| 7 | Ett genom, mange hoder → indre bytteforhold | budhodet kunne senke anger ved å spille dårligere | Én populasjon, ett nett, egne vekter **per ekspert**. Ingen delte hoder. |

## Portvakten er ikke lært

Amerikaneren har eksplisitte faser. Hvilken ekspert som skal svare er gitt av
`state.fase` og av rollen (budvinner / makker / forsvarer), som begge er
observerbare. En lært gating ville brukt kapasitet på å gjenoppdage noe
reglene allerede sier, og lagt til en feilkilde vi ikke kan måle separat.

Rutingen er derfor **deterministisk**. Det lærte ligger i ekspertene.

Unntaket er ett sted der rollen ikke er kjent: forsvareren vet ikke hvem
makkeren er før avsløringen. Det håndteres av at forsvarseksperten får
`makkerAvslørt` som sensor – ikke av en gating.

## Ekspertene

Hver ekspert er en **egen NEAT-populasjon** med egen innovasjonsbok, egne
sensorer, eget utgangslag og eget mål. De deler ingenting.

| Ekspert | Fase | Utgang | Fasit (deterministisk) |
|---|---|---|---|
| `bud` | BUDRUNDE | forventet lagstikk (1 skalar) | SD-orakel: hva hånden faktisk henter hjem, målt over alle fire seter |
| `vrak` | VRAK | behold-score per kort (52) | DD-verdi av hånden etter vrak |
| `trumf` | VELG | score per farge (4) + etterlyst valør | DD-verdi av kontrakten under hvert trumfvalg |
| `spill-fører` | SPILL, budvinner | score per kort (52) | DD-orakel: `max(v) − v(valgt)` |
| `spill-forsvar` | SPILL, forsvarer | score per kort (52) | samme, men bare i forsvarsstillinger |
| `spill-makker` | SPILL, makker | score per kort (52) | samme, i makkerstillinger |

At spilleksperten deles i tre er ikke kosmetikk: poengtap-dekomponeringen
viste at spillefører taper 16–32 poeng per runde mens forsvar taper 2,2–2,6,
og forsvarsprofilen viste at feilene er kvalitativt ulike (trumfe inn når
renons: 23 % mot nevros 68 %; ta stikket når budlaget leder: 69 % mot 85 %).
Ett felles korthode må veie disse mot hverandre gjennom delte vekter. Det er
nøyaktig mekanismen som gjorde `lærForsvar` verre enn ingenting: å sette et
mål for hvert lovlige kort dyttet n−1 ned per beslutning, og det delte
52-korts hodet flatet ut.

## Målekontrakten

Dette er den delen som har sviktet flest ganger i dag, så den er en
**invariant i koden**, ikke en vane.

Hver ekspert leverer `Maaling { verdi, gulv, tak, n, holdout }` der:

- `gulv` = tilfeldig lovlig valg, målt **på nøyaktig samme stillinger**
- `tak` = NevroHjerne, målt **på nøyaktig samme stillinger**
- `holdout` = stillingene har aldri vært brukt til seleksjon

Grunnen: benken er ikke homogen. NevroHjerne måler 0,9431 på de første 2000
stillingene, 0,8848 på annenhver og 0,8179 på 21 000. Tre ganger i dag ble en
konklusjon feil fordi et referansetall ble lånt fra et annet utvalg. En
`Maaling` uten gulv og tak fra samme utvalg skal ikke kunne konstrueres.

## Godkjenningsporten

En ekspert får **ikke** tas i bruk før dens fasit er vist å henge sammen med
det vi faktisk vil ha. Testen er:

1. Skaff kandidater med **kjent stor** forskjell i den egenskapen vi bryr oss om.
2. Mål referansens egen pålitelighet (splitt-halv over uavhengige sett).
3. Er påliteligheten < 0,3, er testen ugyldig – ikke negativ. Skaff mer data.
4. Først når referansen er pålitelig, tolkes korrelasjonen.

Dette står her fordi jeg byttet D8 fra poeng til anger uten å gjøre det, og
fordi den første korrelasjonsmålingen trykket «henger sammen» på et `NaN`.
Porten er implementert i `src/moe2/port.ts` og kalles av treningsløkka.

## Motoren: læring først, topologi etterpå

Målt: seleksjon på støyete fitness ga −4,4 til −24,6 poeng over 525–1525
generasjoner. Fasit-læring ga d5-gull 1,0691 → 1,0374 på 7 700 korreksjoner.
Læringen virker svakt, seleksjonen virker ikke i det hele tatt.

MoE2 snur derfor rekkefølgen:

1. **Læring** (lamarckisk kalibrering mot fasit) er hovedmotoren og kjører
   hver generasjon på hele populasjonen.
2. **Topologi-evolusjon** (nye noder og koblinger) er det NEAT bidrar med, og
   vurderes på holdout etter at læringen har konvergert – ikke før.
3. **Vektmutasjon** er av som standard. Den var hovedkilden til driften.

Det bevarer NEATs styrke (den finner strukturen selv) og fjerner den delen
som målingene sier skader.
