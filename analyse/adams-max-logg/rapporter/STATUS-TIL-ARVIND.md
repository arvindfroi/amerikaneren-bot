# ADAMS MAX — STATUS 14. SEP 14:30, mens Arvind er borte

## Hva som kjører uten tilsyn
1. **Iterasjon 13** (v12, ærlig port) — pågår.
2. **Søkefokus-armene B og E** — lenket bak den. Måler om søket konsentrert i stikk 1–4
   gir uendret styrke til 28 % lavere kostnad. Arm B er en FALSIFIKASJONSTEST av
   dekomponeringen: faller den signifikant, er hele dagens analyse feil.
3. **Lang kjede: iterasjon 14 → 22** — lenket bak armene. Stopper av seg selv ved feil.
   Én linje per iterasjon i `LANG-SAMMENDRAG.txt`.

Diskplass ved start: 611 GB ledig, ca. 1,5 GB per iterasjon.

## Hvor vi står mot kravene
- 17 av 23 batterirader grønne. K1 over porten. **K6 og K8 gjenstår.**
- **Ærlig K1 (samme situasjon): +0,72 ± 0,19** — ikke +1,24. 55 % av det høyere tallet
  kom fra runder der boten bød annerledes og dermed spilte en annen kontrakt.
- **Uten søk er nettene PAR med et menneske.** Hele forspranget er søkets.
- Første holdout-tall (kamper porten aldri har sett): **+1,03 ± 0,27**. Ingen tegn til
  at tidligere tall var oppblåst av seleksjon.

## Hvor rommet er
| ledd | bidrag | rom |
|---|---|---|
| budet | +0,62 pp | PÅ TAKET |
| **stikk 1–4** | **+0,49 pp** | **eneste ledd med rom** |
| sluttspillet | +0,00 pp | dødt, målt to uavhengige veier |

## Det som er prøvd og avvist 13.–14. sep
Seks sanser til trohodet, likelihood-vekting, kanal 2, tre alpha-mu-kriterier, seks
temperaturer, verdener 12→192, σ-porten, adaptiv fordeling, stratifisering, felles
kandidatpulje, budvaner, seiersmål. **Alle null eller verre.**

Diagnosen: søket er forspranget, det er støydominert (argmaks skifter i 43 % av valgene
av ren omtrekking), og støyen kan ikke fikses med smartere trekning — de 48 uavhengige
puljene ER variansreduksjonen.

## Tre ting som venter på deg
1. **Utrulling — RETTET 14. sep 21:15, søkefokus er IKKE svaret.**
   Falsifikasjonstesten fyrte: å slå av søket utenfor stikk 1–4 koster **−0,349 ± 0,118 pp
   (z −2,97)**, altså halvparten av hele det ærlige forspranget på +0,72. Arm E (72 verdener)
   taper også: −0,288 ± 0,130.
   **Min feil:** dekomponeringen tilskrev ΔP til stikket der bot og menneske FØRST skilte lag,
   ikke til hvor søket skapte verdien. En runde som starter å avvike i stikk 2 kan likevel
   avgjøres av søk i stikk 7. «Stikk 5–8 bidrar +0,06» betyr IKKE «søk i stikk 5–8 er verdt 0,06».
   **Følgen: søket trengs i HELE runden, og utrullingsproblemet er uløst.** Ingen kandidat
   er klar. Destillasjon er nå den eneste veien til appens 86 ms.
2. **K8-terskelen** på 35 % — satt av meg mens du sov. Kan overprøves.
3. **Flere spillere i appen.** Én spiller er 87 % av menneskedataene. «Spillerprofil» har
   derfor i praksis målt «mennesker generelt» fem ganger. Amiibo-ideen er ikke avkreftet —
   den er utestet, og bare du kan skaffe dataene.

## Det eneste uprøvde sporet
**Destillasjon:** erstatt 48 støyete simuleringer med en lært funksjon. Eneste grep som
kan gi både styrke og ~100× fart — og dermed også løse utrullingen.
