# Forhåndsregistrering — er sluttspillsfasiten flat i SEIERSANNSYNLIGHET?

Skrevet 14. september 2026, **før** `examples/seiersmaal-fasit.ts` har vært kjørt én gang på
mer enn de 42 grunnlinjestillingene. Husregel siden `strata.md` §4d: spådommen skal stå på
disk så den ikke kan justeres etterpå.

## Det som var kjent da dette ble skrevet

- `troledd.md` §2: **37 av 42** sluttspillstillinger (88,1 %) har spredning **0** i
  rundepoeng — hvert lovlig kort gir samme `diff`. Reprodusert uavhengig i
  `D:\amb-seiersmaal` i dag: `FLATE (diff): 37 av 42`.
- `dekomp.md` §6: sluttspillet er «dødt» — 0,6 % av rundene har det som skillepunkt, de
  bærer +0,00 pp, og K7-taket sier ≤ +0,45 poeng/runde. Konklusjonen hviler blant annet
  på de 88 %.
- `seier-g0.bin` (`src/mlb/seier.ts`, 9→64→64→4), holdout CE 1,0867 mot uniform 1,3863,
  kalibrert i alle ti desiler (`analyse/seier-forhaandsregistrering.md`).
- Egen sonde i dag: prediktorens marginalverdi av 10 poeng for setet stiger fra
  **6,3 pp** ved 0–0 til **10,5 pp** ved 40–40 til **18,9 pp** ved 90–85. Ikke-lineariteten
  hele ideen hviler på finnes altså i prediktoren.

## Mekanismen jeg tror på, sagt presist

`måltall` (`poengdds.ts:167`) komprimerer hele poengvektoren til én skalar:

```
diff = egne − (Σ alle − egne) / (N − 1)
```

**To kort kan gi samme `diff` og likevel ULIK poengvektor.** Bytter to ANDRE seter ett stikk
seg imellom, står `egne` stille og `Σ andre` står stille — `diff` er bit-identisk, mens
vektoren er en annen. Seiersannsynligheten bryr seg om vektoren, fordi det betyr noe HVEM av
motstanderne som nærmer seg 100.

Det er den eneste veien fasiten kan være flat i poeng og skillende i seier. Derfor måler
verktøyet begge deler eksplisitt, og rapporterer også hvor ofte selve **vektoren** er flat —
mellomleddet som avgjør om mekanismen i det hele tatt har noe å jobbe med.

## Hypotesen

**H1 — flat-andelen faller, men beskjedent.** De 88 % er dominert av stillinger der
kontrakten er avgjort og hele stikkfordelingen er tvunget; da er vektoren identisk, og
seiersfasiten er like flat som poengfasiten. Mekanismen over biter bare der de to ANDRE
setene fortsatt kan bytte stikk seg imellom uten å røre setet i tur.

**Punktanslag: flat-andelen faller fra 88 % til ~78 %, altså et fall på ~10 pp.**
**Intervallet jeg forplikter meg på: fallet ligger mellom 3 og 18 pp.**

- Faller den **under 70 %** (fall > 18 pp), er spådommen min for konservativ, og funnet er
  sterkere enn jeg tror.
- Faller den **under 2 pp**, er ideen tom på dette leddet: fasiten er flat fordi utfallet er
  tvunget, ikke fordi linjalen komprimerer.

**H2 — kortvalget endrer seg sjelden.** Selv der seiersfasiten skiller, venter jeg at
spredningen er liten (median under 0,5 pp) og at dagens bot velger et kort som er
seiersoptimalt eller nær det i de aller fleste tilfellene. **Anslag: argmaks flytter seg i
under 10 % av de stillingene der poengfasiten var flat.**

**H3 — det som skiller, sitter sent i kampen.** Spredningen i seiersannsynlighet skal være
større når kampstillingen er nær 100 enn tidlig, fordi prediktorens marginalverdi er større
der (6,3 pp mot 18,9 pp i sonden over). Dette er en formkontroll på at det jeg måler er ekte
og ikke aritmetisk støy.

## Måltallet, låst nå

- **Flat i poeng:** `max(diff) − min(diff) < 1e-9` over lovlige kort. Nøyaktig `troledd.md`
  sin regel, uendret.
- **Flat i seier:** `max(P) − min(P) < 0,01 pp`. Under det kan intet kortvalg bety noe.
  Sensitivitet rapporteres også ved **0,1 pp** og **1,0 pp**, og hele fordelingen av
  spredninger skrives til disk, så terskelen kan etterprøves.
- **Anger** regnes **bare** der den aktuelle fasiten skiller. Ingen anger i flate stillinger.
  `anger_P = max(P) − P(botens kort)` i prosentpoeng.
- **SE:** klyngebootstrap over **kamper**, B = 20 000, SE = bootstrapfordelingens
  standardavvik. **Ikke delt på √n en gang til.**
- Undergrupper (rolle, stikk, kampstilling, antall lovlige) er **beste-av-mange** og
  rapporteres som det. De kan ikke bære en konklusjon alene.

## K2

Prediktorens inngang er `seierTrekk(poeng, sete, målPoeng)` — poengtavla og målet.
**Den ser ikke ett eneste kort**, verken skjult eller åpent. Kravet er strukturelt oppfylt,
ikke bare i praksis.

## Det jeg IKKE måler, sagt høyt før tallene kommer

Fasiten er en **poeng-likevekt**: `poengRotVerdier` lar hvert sete maksimere `diff`/`egen`.
Jeg leser sluttvektoren fra det treet om til seiersannsynlighet. Det er **ikke** det samme
som å løse spillet for seiersannsynlighet — en ekte seierslikevekt kunne gitt andre linjer.
Denne målingen svarer derfor presist på: *«er utfallene som poengfasiten kaller likeverdige,
også likeverdige i seier?»* Det er nøyaktig spørsmålet `troledd.md` §2 avgjorde med feil
linjal, og det er nok til å omgjøre eller bekrefte den konklusjonen. Det er ikke nok til å
si hva et seierssøk ville spilt.
