# Troleddet: hvor blir troens informasjon av?

Gren `troledd-2026-09-13` i **`D:\amb-krav`** (fra `kanal2-sik-2026-09-13` @ 75126f3).
13. sep, maks 6 kjerner. **Ingen K1-målinger startet herfra.**

## Svaret i én setning

**Informasjonen kastes ikke i vektingen og ikke i kriteriet — den kastes i argmaks.**
Trovekten er skarp (effektivt utvalg 5,7 av 32 kandidatverdener), men søkets beste kort
skifter i **43,8 %** av beslutningene når man BARE trekker verdenene på nytt. Troens netto
virkning på kortet er **+2,7 ± 1,1 pp** over det gulvet, og de endringene den gjør er ikke
bedre enn de den erstatter (20 bedre mot 14 verre).

---

## 0. To strukturfunn fra kodelesning

### 0a. `budvekt` drukner IKKE trovekten — hypotesen er strukturelt utelukket

```
agentspek.ts:1280     budvekt = art === "mlb";
```

Den utrullede speken bruker `~mlbu=`, altså `budvekt = false`. Trovekten er den ENESTE
vekten på kandidatverdenene. Kjeden er lest hele veien og er ubrutt:
`agentspek.ts:1279-1280` → `1479-1486` → `sikkerorakel.ts:343` → `sdpar.ts:275-291` →
`sampler.ts:468-481` (`logW = budW + ekstraVekt(v) + vrakLogVekt(...)`, og `budW = 0`).

### 0b. `eks:3Lt2000` ligger UTENFOR `sik:`

`EksaktSluttspill.velgHandling` (`eksaktagent.ts:180-187`) spør det indre laget og
**erstatter** kortet. I de tre siste stikkene er det `eks:`, ikke søket, som har siste ord.

---

## 1. Kostnadsrammene (målt)

**Fasiten** (`poengRotVerdier`, `diff`), median ms: 5 kort 0,4 · 6 kort 14,2 · 7 kort 111 ·
8 kort 2 609 · 9 kort 15 942 (maks **178 317**). Fasit felles ved **≤ 7 kort igjen**.
**Utrullet spek:** 581 ms per kortvalg, 28 s per runde.
Verktøy: `troledd-kostnad.ts`, `troledd-royk.ts`.

## 2. Fasiten er FLAT i 88 % av sluttspillstillingene

37 av 42 stillinger i vinduet har spredning **0** — kontrakten er avgjort, og hvert lovlig
kort gir samme rundepoeng. Gjelder `diff` og `egen`, alle roller. Regret regnes derfor bare
der fasiten skiller: 268 skillende, 1215 flate forkastet, 1170 utenfor vinduet.
Dette er også en dom over `eks:3Lt2000`: der den virker, er det meste alt avgjort.
Verktøy: `troledd-fasitspredning.ts`.

---

## 3. HOVEDMÅLINGEN — 2653 beslutninger, 72 runder, 6 arbeidere

Armene deler stilling OG RNG-strøm, så de trekker de SAMME kandidatverdenene og skiller
seg bare i vekten. **A** = `~mlbu=` på (budvekt av). **B** = `~mlbu=` av (budvekt på).
**C** = A, men annet instansfrø → **rent støygulv**. `M` utelatt i alle tre.

### 3a. Endrer troen kortvalget?

| gruppe | n | A−B argmaks | A−B spilt | **STØYGULV A−C** | netto |
|---|---|---|---|---|---|
| **ALLE** | 2653 | 46,6 % ± 1,0 | 36,9 % ± 0,9 | **43,8 % ± 1,0** | **+2,7 ± 1,1 pp** |
| foerer | 753 | 40,5 % ± 1,8 | 32,1 % ± 1,7 | 40,5 % ± 1,8 | **+0,0 ± 1,9 pp** |
| makker | 601 | 51,7 % ± 2,0 | 40,3 % ± 2,0 | 48,3 % ± 2,0 | +3,5 ± 2,3 pp |
| forsvar | 1299 | 47,7 % ± 1,4 | 38,2 % ± 1,3 | 43,7 % ± 1,4 | +3,9 ± 1,6 pp |
| stikk 0–3 | 917 | 61,2 % ± 1,6 | 49,2 % ± 1,7 | 64,1 % ± 1,6 | −2,9 ± 2,0 pp |
| stikk 4–7 | 1010 | 54,2 % ± 1,6 | 45,9 % ± 1,6 | 51,8 % ± 1,6 | +2,4 ± 1,8 pp |
| **stikk 8+** | 726 | 17,5 % ± 1,4 | 9,0 % ± 1,1 | **7,2 % ± 1,0** | **+10,3 ± 1,5 pp** |

Gjetningen var «få prosent». Rå-tallet er 46,6 %, men 43,8 av dem er ren resampling-støy:
**under 6 % av endringene bærer informasjon.** I førersetet er nettoen **nøyaktig null**.
Det ene stedet troen biter er sent i runden — der støygulvet kollapser til 7,2 %.

### 3b. Er endringene BEDRE? (eksakt poengløser på den virkelige given)

Parret A−B på `snitt`: **+0,062 ± 0,309 (z = 0,20)** — null.
**Bare der troen endret kortet (n = 98):** +0,170 ± 0,849; bedre i **20**, verre i **14**,
likt i 64. Endringene er en myntkast.

### 3c. Er `verdenKombi` feilen? NEI — `snitt` er BEST

Parret mot `snitt` innenfor arm A (samme tro, samme verdener). Positiv = **verre**:

| kriterium | mot snitt | z |
|---|---|---|
| `min` | **+1,853 ± 0,544** | 3,41 |
| `kvantil` | **+1,187 ± 0,448** | 2,65 |
| `flest` | +0,496 ± 0,263 | 1,89 |

**Alle tre alpha-mu-kriteriene er målbart DÅRLIGERE enn PIMC-snittet.** Hypotesen er
forkastet på sitt eget mål. **Ingen `a<krit>`-spek er verdt en K1-måling.**

---

## 4. Vekten er IKKE flat — den er skarp

`troledd-vektspredning.ts`, 10 752 trekninger, ingen utspillinger. ESS/K = 1,00 = helt flat.

| gruppe | ESS/K | maks p | log-spenn |
|---|---|---|---|
| **ALLE** | **0,179** | 0,547 | 19,13 |
| foerer | 0,459 | 0,180 | 4,96 |
| forsvar | 0,067 | 0,696 | 24,75 |
| makker | 0,069 | 0,690 | 24,92 |

Effektivt utvalg **5,7 av 32**. Hypotesen «vekten er nesten flat» er **forkastet** — troen
velger hardt. Og den forklarer førersetet: ESS/K 0,459 med log-spenn 4,96 mot forsvarets
24,75. Budvinneren kjenner egen hånd og eget vrak, så det er lite skjult å vekte på — og
det er nøyaktig setet der troens virkning på kortet er +0,0 pp.

---

## 5. Flere verdener er en dyr og svak kur

Samme sonde, bare `--verdener` endret (driveren står på 48, så stillingene er like):

| verdener | støygulv A−C | netto troeffekt |
|---|---|---|
| 12 | 44,6 % ± 2,1 | +0,0 ± 2,1 pp |
| **48 (dagens)** | **43,8 % ± 1,0** | **+2,7 ± 1,1 pp** |
| 96 | 41,0 % ± 2,3 | +2,5 ± 2,6 pp |
| 192 | 37,1 % ± 3,2 | +7,2 ± 3,8 pp |

**16× flere verdener kjøper 7,5 pp lavere støygulv.** Netto troeffekt peker oppover, men
forskjellen 48 → 192 er +4,5 ± 4,0 pp — *ikke* etablert. Og 192 er 4× søketid på en spek
som alt er 8,8× over appens budsjett. Denne veien er stengt av kostnad.

---

## 6. PORTEN ER DEN BILLIGE KNOTTEN — og den står på feil verdi

Ren reanalyse av de samme 2653 radene (`troledd-sigma.ts`), ingen ny beregning:

| σ-bånd | n | **støygulv A−C** | snitt regret A |
|---|---|---|---|
| σ < 0,5 (porten holder) | 1326 | 38,6 % ± 1,3 | 1,258 (n=106) |
| **0,5 ≤ σ < 1,0** | 468 | **67,7 % ± 2,2** | 1,345 (n=28) |
| 1,0 ≤ σ < 1,5 | 498 | 54,0 % ± 2,2 | 0,253 (n=50) |
| 1,5 ≤ σ < 2,5 | 206 | 29,6 % ± 3,2 | 1,413 (n=25) |
| **σ ≥ 2,5** | 155 | **2,6 % ± 1,3** | **0,028 (n=59)** |

**σ er et ekte stabilitetsfilter i toppen** — ved σ ≥ 2,5 er valget praktisk talt
deterministisk (2,6 % støy) og nesten fasitoptimalt (regret 0,028). Men terskelen står på
**0,5, og slipper dermed inn nøyaktig det mest ustabile båndet** (0,5–1,0: 67,7 % støy).
Porten slipper gjennom halvparten av alle beslutninger, og **49,1 %** av dem er ustabile
under et rent nytt verdenstrekk — altså verre enn de den holder tilbake (38,6 %).

Porten gjør i dag det motsatte av jobben sin.

**Forbehold:** regret-kolonnen er på små n (25–59) og er ikke monoton (1,5–2,5-båndet er
ute av rekka). Støygulv-kolonnen er på full n og er den som bærer konklusjonen.

---

## 7. SPEKEN JEG BER OM Å FÅ MÅLT

Én knott, ingen ny kode, **ingen ekstra søketid** (færre overstyringer = marginalt raskere).
Begge parser (`lagIndre`, verifisert):

```
sik:alle:1.5:   okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:1.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin

sik:alle:2.5:   okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:sik:alle:2.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:vakt:abmp:e1:e1-modell/kort-8.bin
```

Grunnlaget: σ ≥ 2,5 har 2,6 % støy og regret 0,028; dagens 0,5 slipper inn et bånd med
67,7 % støy. **1,5** er klassens egen standard (`sikkerorakel.ts:273`) og et forsiktig
mellomsteg; **2,5** er der tallene er sterkest.

**Risikoen, sagt ærlig:** høyere σ betyr færre overstyringer, altså mer nett og mindre søk.
Ved σ ≥ 2,5 overstyrer søket bare ~6 % av beslutningene. Er nettet svakere enn søket i snitt,
kan det koste selv om hver enkelt overstyring blir bedre. Det er nettopp derfor det er en
K1-måling og ikke en endring.

---

## 8. Dommen

1. Troen vekter skarpt (ESS 5,7 av 32). ✔ virker
2. Verdenene blir bedre (+5,88 pp, målt tidligere). ✔ virker
3. **Argmaks over 48 verdensutfall skifter kort i 43,8 % av tilfellene av ren støy.** ✘ her forsvinner det
4. Netto på kortet: 2,7 pp, og de endringene er en myntkast.

Det forklarer ablasjonen: med 2,7 pp endrede kort der halvparten er feil vei, **kan** ikke
K1 flytte seg målbart. +1,02 mot +1,01 er hva den aritmetikken forutsier.

Kuren er ikke et skarpere trohode og ikke et annet kriterium — begge er målt her og begge
er blindveier. Kuren er å slutte å la et støyete argmaks overstyre nettet.
