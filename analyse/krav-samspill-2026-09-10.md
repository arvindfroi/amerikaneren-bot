# Kravenes samspill i den modellen vi faktisk trener — 10. september 2026

Arvind: «se hvordan de ulike kravene påvirker hverandre upstream og downstream …
vi må passe på at alle fungerer bra sammen og at alt går bra når vi jobber videre.»

`AdamsMax.md` («Sammenhengen mellom kravene») laget kartet for Adams-stakken, der
modulene lå som overstyringer utenpå et nett. MLB er ett nett: sansene er
innganger, evnene er hoder, og målet er ett. Kartet er derfor tegnet på nytt her,
med det som er MÅLT i dag ved hver kobling.

## 1. Hvor hvert krav bor i modellen

```
 OFFENTLIG INFO (K2-grensen: SpillerVisning, aldri GameState)
   │
   ├─ MIKRO 273 ─────────────── kort, stikk, renonser            → K3 spill, K7
   ├─ TRO 261 ◄── trosnett (FAST fil, trent på ADAMS_MAALT)       → K8 → K7, K3
   ├─ HUKOMMELSE 144 ◄── bokført per ferdig runde, dør med kampen → K4 → K6
   ├─ MESO 186 ──────────────── bud, kontrakt, roller, vrak      → K3 bud, K5 meso
   ├─ MAKRO 23 ──────────────── stilling, racepress, målPoeng     → K5 makro
   ├─ KONVENSJON 71, LOVLIG 73
   ▼
 STAMME 1031→1024→768→512
   ├─ policy 68 (bud + vrak + trumf + etterlys + kort, ÉN argmax)   K3 alle faser
   ├─ verdi (runde + hale + 32 kvantiler) ← ΔP(seier)              K1/K5 makro, meso
   ├─ stikkhode 13 ← lagets stikk resten av runden                 mikro → K3 bud
   └─ trohode 208 ← hvor kortene lå (hjelpetap)                    K8 (internt)
 MÅL: 100·ΔP(seier) per runde (seiersprediktor g0, trent på Adams-mot-Adams), γ 0,5
 BEFOLKNING (R1): 50 % tre Adams · 50 % liga (nå-policy / tidligere / VANER 30 %)
 DOM: kampbenk mot ADAMS (alle skard) + kravbatteri per epoke
```

Formen er den `AdamsMax.md` kalte riktig («modulene UTVIDER nettet»): ingen lag
overstyrer et annet, alt går inn i én argmax. Overstyringskollisjonene fra august
(vakt mot søk, avsender mot leser) kan ikke oppstå her. De kollisjonene som KAN
oppstå, er av en annen form: **et ledd som er fryst eller målt på feil befolkning,
og et måleinstrument som ikke lenger måler det det sier.**

## 2. Koblingene, oppstrøms → nedstrøms

| kobling | hvorfor den finnes | målt i dag | risiko framover | vakt |
|---|---|---|---|---|
| **K2 → alt** | skranke: ingen sans kan se skjult info | K2 ja i alle batterier; likhet med tro 6/6 kamper | DAgger/orakelveiledning kan lekke via etiketter | skjult info KUN i etiketter; `mlb-k2-*`, `mlb-herkomst` |
| **K8 → K7** | sluttspillgapet er informasjon, ikke dybde (§117) | K7 +0,99 igjen (e12); trosnettet er fast | K7 kan ikke flytte seg før troen gjør det | ikke vent K7-fremgang av R1 alene |
| **K8 → K3 midtspill** | kortvalg hviler på hvor kortene ligger | trosnettet trent på ADAMS_MAALT; motstanderspesifikt (12,34 % → 5,09 % på annen motstander, §119) | **R1-policyen og mennesker er ikke Adams → troen blir stille dårligere** | tren trosnettet på nytt på R1-befolkningen |
| **K4 → K6** | vaner krever minne over runder | K4 ja (hukommelsen endrer 17–36 % av valg); K6 nei (z −1,3…+1,4) | hukommelsen FYRER uten å gi gevinst | K6-raden per epoke |
| **K6 → K8** | tro uten motstandermodell er énmodell-antakelse | **trosnettets innganger har INGEN hukommelse** (`trotrekk.ts`: lagInn + troblokk) | K8 kan ikke bli motstanderspesifikk i dagens arkitektur | hukommelsen inn i trosnettet ved omtrening |
| **K6 ← befolkning og kamplengde** | ingen vane å utnytte uten vaner; ingen læring på 4,5 runder | R1: vaner i 15 % av kampene (30 % av ligahalvdelen); mål 30 gir 4,5 runder | R1 optimerer mot Adams, som ikke HAR vaner → K6 står stille | K6-rad per epoke; egen arm med flere vaner/lange kamper |
| **K5 makro → K3 bud** | stillingen skal styre risiko i budet | seiersmålet gir gradienten; i1b K5 ja, i2 K5 nei (se §3) | **amerikaner/solo byes ALDRI** (0 av 2,74 M budvalg): K5s sterkeste risikoverktøy finnes ikke i dataene | utforsking i budfasen (egen arm) |
| **K3 bud ↔ mikro** | kontraktens verdi er stikkene vi tar (budmodellen «sist») | ett nett lærer begge; BUD-samsvar 95,8 %, SPILL 73,7 %; budgap +7,9 (i2) | imitasjonen arvet Adams' budkalibrering; blir kortspillet bedre, er budet feilkalibrert → **budtall kan falle før de stiger** | K3-raden + budfordeling per epoke; ikke les et budfall som feil |
| **stikkhode → K3 bud** | «hvor mange stikk tar laget» er det et bud skal spå | stikk forklart +0,87 holdout | ingen | — |
| **K7/K4-planlegging ← søk** | framoverblikk er søk | søket står av (AVGJØRELSE 5) | — | eget steg etter R1 |
| **alt → K1** | K1 er utfallet, bygges aldri direkte | i2 0,225 mot ADAMS (−2,9 SE) | **ADAMS ≠ appen** (bud-menneske + sik-søk); mennesker ≠ Adams; R1 ser Adams i 50 % → kan lære å utnytte Adams, ikke mennesker | appdom for finalister (~50 min/100 frø); menneskedata |

## 3. Tre nye kollisjoner funnet i kveld — alle i MÅLINGEN

**A. K5-raden måler noe annet under seiersmålet.** `mlb-k5.ts` dømmer retningen på
VERDIHODET: V(bak) skal være lavere enn V(foran). Med poeng som mål er det en
meningsfull prøve. Med seiersmålet er belønningen `100·(P_etter − P_før)` der P
allerede har priset inn stillingen, så V spår *endringen* i vinnersjanse fra nå —
og den er ≈ 0 enten man ligger bak eller foran. Radens «nei» for i2 (V(bak) lavere
i 150 av 360, nær tilfeldig) mot «ja» for i1b (230 av 360, poengenheter) er
nettopp dette skiftet, ikke en forverring. **Raden kan ikke brukes i kravregelen
for R1 slik den står.** Retningen må måles på policyen (risiko i valget bak mot
foran) eller på `V + 100·P(tavla)`.

**B. K8-raden kan ikke se R1.** `mlb-krav.ts` måler K8 med `mlb-k8.ts --nett
e1-modell/mlb-tro.bin` — den FASTE trosnettfila. R1 endrer den aldri, så K8-raden
er identisk for hver epoke uansett hva som skjer. Nettets eget trohode (208 ut,
trent hver epoke som hjelpetap) er umålt. Kravregelen for K8 er dermed tom.

**C. Porten dømmer fortsatt på gate 2-poeng.** R1 epoke 1 ble «FORKASTET» av porten
(+0,137 ± 0,379, z 0,36) — én runde, der makronivået er usynlig. Porten styrer bare
hvem som er «beste» i ligaen (arbeidsvektene trenes videre uansett), så den
blokkerer ikke læringen. Men den er ikke dommen: kampbenken er.

## 4. Kravregelen, rettet

| rad | status for R1 | hva som gjøres |
|---|---|---|
| K2, K3, K4, K6, K7 | gyldige som de står | brukes |
| **K5** | ugyldig under seiersmålet (§3A) | ny K5-måling på policyen før den brukes; til da rapporteres TV/endrede valg, ikke retningen |
| **K8** | kan ikke se R1 (§3B) | mål nettets eget trohode på samme stillinger; trosnettfila omtrenes på R1-befolkningen senere |

## 5. Rekkefølgen som respekterer koblingene

1. **R1** (K1 og K5-gradient), dømt per epoke på kampbenk + K2/K3/K4/K6/K7.
2. **Rett målingene** (K5 på policyen, K8 på nettets eget trohode) — mens R1 går.
3. **Budarmen**: utforsking bare i budfasen (amerikaner/solo). K3 og K5.
4. **Trosnettet på nytt**, på R1-befolkningen og MED hukommelse som inngang (K6 → K8).
   Da først kan K7 og K3-midtspill forventes å flytte seg.
5. **Søk oppå nettet** (K7, K4-planlegging), med troen fra steg 4.
6. **Appdom og menneskedata** for K1 — ADAMS-benken er nødvendig, ikke tilstrekkelig.

Hvert steg endrer noe oppstrøms for de neste, og kravbatteriet kjøres på nytt etter
hvert av dem — ikke bare på slutten.
