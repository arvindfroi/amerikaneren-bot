# Utrullingskandidat — Adams Max innenfor appens tidsbudsjett

FORARBEID TIL GODKJENNING. **Ingenting er rullet ut.** Ingen prod-gren, Val Town eller Vercel rørt.
Målt 13. sep (maskintid, Tokyo) ved siden av treningsløkka (iterasjon 7 → 8), maks 4 kjerner.

Verktøy: `D:\amb-krav\examples\tidsprofil.ts` (nytt, ucommittet, i en ledig arbeidskopi).
Rådata: `D:\amb-grp\loop\tidsprofil4.jsonl` (autoritativ) og `tidsprofil.jsonl` (første runde).

---

## 0. Oppgaven i tall

Harnesket er appens bord: **tre botseter** med speken, ett billig sete (mennesket/klonen).
Bare botsetenes tid telles. 36 kortvalg per runde (3 seter × 12 kort) — bekreftet av harnesket.
Framskriving: `botarbeid per runde × 26,6 runder per løp` (agent S, 200 løp).

**KORREKSJON AV PREMISSET: dagens spek er 8,8× for treg, ikke 15×.**
De 15× kom av å sammenligne to tall målt under ULIK maskinlast. De dokumenterte tallene
(107 s og 15–27 min) ble målt mens løkka eide alle 20 kjernene; mine er målt på en nesten
tom maskin. Harnesket er validert mot BEGGE ankere:

| anker | dokumentert | målt her | faktor |
|---|---|---|---|
| prod-grunnlinja per løp | 107 s | 83 s | 1,29 |
| full spek per løp | 15–27 min | 726 s × 1,29 = **15,6 min** | ✔ treffer |

**Budsjettet er derfor 86 ms per kortvalg** (= prod-grunnlinja i samme harnesk).

Dagens fulle spek:
`okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin`

---

## 1. TIDSPROFIL — hvor går tiden?

Alle armer `--runder 4`, samme frø ⇒ **parrede giv**. Bare armer i samme tabell er sammenlignbare.

### 1a. Hvert ledd i speken

| arm | ms/kortvalg | s/løp | mot prod |
|---|---|---|---|
| **P0 prod-grunnlinje (BUDSJETTET)** | **86** | **83** | **1,00** |
| S0 dagens fulle spek | 758 | 726 | **8,8** |
| S0 med `sik:foerer` i stedet for `sik:alle` | 115 | 110 | 1,34 |
| S0 med 12 verdener i stedet for 48 | 78 | 75 | 0,91 |
| S0 med **273-kortnettet** i stedet for 493 (24 verdener, fører) | 87 | 84 | 1,01 |
| hele kjeden UTEN søk (rene nett) | **0,2** | ~0,5 | 0,002 |

### 1b. Kostnad per ledd (egne ablasjoner, `--runder 2`, egen parret blokk)

| ledd som fjernes | virkning på tid |
|---|---|
| MLB-troen (`~mlbu=`) | −17 % (351 → 290 ms) — **billig** |
| `eks:3Lt2000` | **+18 % (351 → 416) — å fjerne den gjør boten TREGERE** |
| `k32` → `k3` kandidatverdener | **+60 % (351 → 562) — å spare her koster dyrt** |
| `L`/`M`/`D`-flaggene | −35 % (78 → 51 ms ved 12 verdener) |

### 1c. Hvor i runden tiden ligger (S0)

| | ms per kortvalg |
|---|---|
| stikk 0–3 | **667** |
| stikk 4–6 | 421 |
| stikk 7+ | 55 |
| fører | 348 |
| ikke fører | 352 |
| bud + vrak + trumf, HELE runden | **< 1 ms** |

### Fem funn som styrer kandidatene

1. **Alt ligger i søket.** Hele kjeden uten søk koster 0,2 ms per kortvalg. BudQ, vrak,
   etterlyst og kortnettet koster til sammen under 1 ms per runde. **Å spare tid ved å fjerne
   nett er meningsløst** — nettene er gratis, og de er der styrken sitter.
2. **`sik:alle` er den dyreste enkeltknappen** (2,8×): ikke-førersetene faller fra 352 til
   1,1 ms med `sik:foerer`. Prod søker allerede bare som fører, og forsvarssøk er MÅLT til
   −0,027 (z −0,55), altså verdiløst. Agent V målte gevinsten konsentrert hos budvinneren
   (+3,05 pp mot makker +1,22 / forsvar +0,63). **Å begrense til fører koster nesten ingen styrke.**
3. **Kostnaden er TIDLIG, ikke sent.** stikk 7+ koster 55 ms, stikk 0–3 koster 667. En
   «søk bare i kritiske stikk sent»-knapp sparer nesten ingenting.
4. **273-kortnettet er ~2× raskere enn 493** (fører-16: 102 → 55 ms). De 220
   hukommelseskolonnene regnes i HVER rollout-node. Dette faller sammen med K1-dommen 01:43,
   som allerede droppet dem — **bedre K1, halv pris, og den eneste bredden appen kan laste.**
5. **To knapper må IKKE vris:** `eks:` og `k32` gjør boten *tregere* når de fjernes.

---

## 2. KANDIDATSPEKER — rangert

Alle bruker `kort-7.bin` (273, = `nett/beste/kort.bin`). Alle er MÅLT, ikke anslått.

| # | kandidat | ms/kortvalg | s/løp | mot budsjett | kodeendring |
|---|---|---|---|---|---|
| **1** | **K3 — fører, 24 verdener** | **87** | 84 | **1,01×** | stor |
| **2** | **K1 — fører, 16 verdener** | **55** | 52 | **0,64×** | stor |
| **3** | **K2 — fører, 12 verdener + MLB-tro** | **41** | 39 | **0,48×** | stor + 12 MB |
| **4** | **F0 — rent filbytte, 24 verdener** | **64** | 61 | **0,74×** | **INGEN** |
| **5** | **A5 — rene nett, søket AV** | **0,2** | ~0,5 | 0,002× | liten |

**1. K3 — mest søk innenfor budsjettet.** Alle iterasjon-8-nettene, hele slutningen, akkurat på
budsjett (1,01×).
`okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:foerer:0.5:24k32e3LMD:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-7.bin`

**2. K1 — samme, 16 verdener.** 36 % billigere enn budsjettet; margin for trege telefoner.
Bytt `24k32e3LMD` → `16k32e3LMD`. **Dette er den jeg vil anbefale** hvis eieren vil ha
sikkerhetsmargin framfor siste dråpe styrke.

**3. K2 — 12 verdener + trohodet.** Billigst av de sterke (0,48×) fordi troen bare koster
17 %. **Blokkert av nedlastingsstørrelse, ikke av tid:** `tro-8.bin` er 9,2 MB ⇒ ~12,3 MB som
base64. Arbeidsplanen krever kvantisering/destillering først. Legg til
`~mlbu=e1-modell/tro-8.bin` etter verdensfeltet.

**4. F0 — rent filbytte, INGEN kodeendring.** Bytter bare `adams-kort.b64` (273-nettet fra
iterasjon 8), `adams-vrak.b64` (vrak-8, 27 — klassen godtar den bredden) og konstanten
`SØKVERDENER` 24. Mister BudQ, økt/profil, `eks:`, etterlyst og e3/L/M/D. Kan rulles ut i dag.
`vr:e1-modell/vrak-8.bin:telrd:sik:foerer:0.5:24:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/kort-7.bin`
*(Merk: 48 verdener i samme form koster 137 ms = 1,59× — for dyrt.)*

**5. A5 — søket av.** Nullrisiko og gratis, men gir fra seg hele søkegevinsten (målt +1,7 til
+2,2 poeng per runde i førersetet). Bare som reserve.

---

## 3. KOMPATIBILITETSNOTAT — hva appens kjede kan laste i dag

Funnet i koden. Prod = `claude/lokal-trening-oppsett` (363ae4b,
`C:\Users\arvin\Documents\Claude\Projects\amerikaneren-bot`). Den nyere, IKKE utrullede
appfiksen ligger i `D:\amb-app` (`app-fiks`, 7d0ccf6) og samler begge tråder i
`web/adamskjede.ts` → `byggUtrullet`.

| nett | appens grense | i appen i dag | iterasjon 8 | lastbart? |
|---|---|---|---|---|
| kortnett (E1) | `LOVLIGE_BREDDER` v1–v10; **493 avvises** (`tillatBok` er AV som standard, bare `e1:` i speken slår den på) | `adams-kort.b64` = 273 | `kort-8.bin` = **493** | **NEI** |
| kortnett 273 | samme | 273 | `kort-7.bin` = 273 | **JA** |
| vrakrangerer | `VRAK_DIM` 24 **eller** `VRAK_DIM_K` 27 | `adams-vrak.b64` = 24 | `vrak-8.bin` = 27 | **JA** |
| etterlyst | — | ingen | `etterlyst-8.bin` = 25 | **NEI** — `byggUtrullet` sender aldri 4. argument til `Vrakrangerer` |
| bud | `tolkBudmodell(JSON)` | `bud-menneske.json` | `budq-8.bin` = 323 | **NEI** — `BudQagent` er ikke importert |
| MLB-tro i søket | finnes ikke | `TROFIL = null` | `tro-8.bin` = 996/208 | **NEI** — ingen `MlbSøketro` i appkjeden |

To ULIKE «tro»: `Trosnett` (`TRO_INN` = 470, krever kortnett ≥ 558) er den appen har et tomt
felt for; MLB-trohodet (996) brukes via `~mlbu=` inne i `Sikkerorakel`. Ingen har vei inn i dag.

**Søkelaget:** `Søkspek.sik` i `src/moe2/utrullet.ts` bærer **`{verdener, sigma}` og ingenting
mer**, og `byggUtrullet` hardkoder `roller: ["foerer"]`. Utenfor rekkevidde i dag: `k32`, `e3`,
`L`, `M`, `D`, `~mlbu=`, `~lik=`, `sik:alle` og hele `eks:`-laget. `okt:`/`profil:` er BYGD og
bare slått av — `økt: false` står hardkodet begge steder (én-ords endring).

### Filer som må endres

| # | fil | endring | omfang |
|---|---|---|---|
| 1 | `src/moe2/utrullet.ts` | `Søkspek.sik` utvides (kandidater, e/L/M/D, roller, tro); `EksaktSluttspill` utenpå; `BudQagent`-gren; `etterlystnett` videre | **~80–120 linjer** — størst, men delt av begge tråder |
| 2 | `web/adamskjede.ts` | `AdamsKonfig`, `søkspek()` og `RåAdamsVekter` bærer de nye feltene | ~40–60 |
| 3 | `web/worker.ts` | `adams-init` får de nye b64-feltene | ~20–30 |
| 4 | `web/app.ts` | filnavn-konstanter, `hentB64`-kall, `TROFIL`, `oppløst`-logging | ~30–40 |
| 5 | spillsløyfa (`app.ts` + `worker.ts`) | **`observer(s)` ved RUNDE_SLUTT** — kreves av økt (K4/K6), BudQ ≥ 287 og trohodets bok. Appkjeden kaller den ALDRI i dag | ~20–30, men rører løkka |
| 6 | `verktoy/` + opplasting | nye `.b64`-filer eksporteres og lastes opp | mekanisk |

**Samlet: én reell fil (`utrullet.ts`) pluss gjennomstikking.** For K3/K1 trengs punkt 1–6 uten
tro-feltet. For **F0 trengs INGEN av dem** — bare to nye `.b64`-filer og én konstant.

---

## 4. DET SOM IKKE ER MÅLT — må gjøres før utrulling

**Jeg har målt TID, ikke STYRKE.** Ingen K1-måling er kjørt på noen kandidat (det krever en
lang flerkjernekjøring, utenfor CPU-rammen for dette forarbeidet). Rangeringen over hviler på
tidsmålingene mine pluss EKSISTERENDE styrkebevis (forsvarssøk verdiløst, gevinsten hos
budvinneren, 273 > 493 på K1, flere verdener bedre).

Før utrulling bør hver kandidat få en K1-dom, f.eks.:

```
node examples/mlb-krav.ts --bare k1 --kjerner 4 --spek "<kandidatspek>" --ut D:/amb-grp/loop/k1-K3
```

Åpne spørsmål eieren bør ta stilling til:
1. Skal budsjettet være prod-grunnlinja (86 ms), eller tåler appen mer? Workeren pondrer
   allerede i UI-pausene, og hovedtråden har 4,5 s frist — **det reelle taket kan være høyere
   enn prod-grunnlinja**, og da er K3 med 24 verdener konservativ.
2. Skal `tro-8` kvantiseres nå (åpner K2, den billigste av de sterke), eller vente?
3. Skal F0 rulles ut med én gang som et billig mellomsteg mens 1–6 bygges?
