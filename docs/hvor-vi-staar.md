# Hvor vi står — 11. august, morgen

Skrevet ved en ryddig stopp, så neste økt ikke må lete.

## Måltallet

**MLB taper 3,24 ± 0,44 poeng per runde mot `rask`** (= `ADAMS_MAALT`,
tegn for tegn — de er samme spekstreng).

| | mot `rask` |
|---|---|
| startvektene | −90,88 |
| epoke 5, natt til 10. | −3,63 |
| g05, 10. august | −3,43 |
| **127b epoke 11, 11. august** | **−3,24** |

Fra −90,88 til −3,6 skjedde på **fem epoker**. De neste ~40 epokene over tre
døgn har flyttet det **0,4 poeng**, altså innenfor støyen.

## Det som er bevist, og som ikke må måles på nytt

- **Kredittildelingen:** 99,68 % av fordelens varians ligger MELLOM runder,
  0,32 % innenfor. Nettet kan lære at en runde gikk dårlig, ikke hvilket kort.
- **Policykollaps:** 174 av 174 trumfvalg var ruter, entropi 0,000 bit, og
  tolv forstyrrelser — også å nulle hele hånden — endret null av dem.
  Årsak: entropien ble målt som ETT SNITT, og VELG_TRUMF er én rad per runde
  mot ~12 kortvalg.
- **Stikkhodet virker:** +0,6045 forklart varians på holdout etter ÉN epoke,
  mot ridge-taket på +0,60. Det eneste i prosjektet som har truffet taket sitt
  umiddelbart. **Det er aldri kjørt til konvergens i et fullt løp.**
- **`rask` ER `ADAMS_MAALT`.** Avbruddskriteriets punkt 2 var avgjort før det
  ble skrevet.
- **K4 og K6 er ulærbare ved målPoeng 30** — kampen varer 5,68 runder, så
  hukommelsen ser fire–fem ferdigspilte runder.

## Mønsteret som betyr mest

**Tre løp på rad har gitt sterk intern framgang og null ytre.**

| | internt | mot `rask` |
|---|---|---|
| epoke 5 → 9 | +20 poeng | 0 |
| g05 | raskere kurve | 0 |
| 127b | port z ≈ 6 | 0 |

`--motstander naa` (nåværende policy, litteraturens anbefaling) gjorde den
interne kurven BRATTERE og overføringen uendret — altså forsterket
selvrefereringen i stedet for å bryte den.

## Tre hypoteser som står igjen

1. **Skala.** Litteraturen oppdaterer på 50 000–100 000 kamper per gradient-
   runde; vi bruker 5 000. Det nærmeste prosjektet (SchafkopfRL, samme
   makkermekanikk) brukte **femten døgn** og var fortsatt i bedring.
   Godt underbygd utenfra, og **ikke prøvd**.
2. **Stikkhodet til konvergens.** Slått av i armen som kjørte sist.
3. **Taket er ekte** for ren selvtrening uten veiledet oppstart i et spill med
   bud og makkerskap. Bridge-toppsystemene bruker veiledet + selvspill + søk;
   vi har forbudt oss den første.

## Løpende arbeid

- `analyse/mlb-epoker-127b*` — 13 epoker, stoppet ryddig. Resumelinje i §127.
- **Tre endringer ble slått på samtidig i 127b** (λ=0,95, `--motstander naa`,
  `--sjanse 0.5`) og er IKKE skilt. Oppgave #10.
- `examples/mlb-krav.ts` — hele K2–K8-batteriet, apparattestet. **Ingen
  MLB-vektfil eldre enn §126 kan lastes** (1 032 mot 1 031 trekk).
- Frontend står på **v11**, utrullet og verifisert. Vercel deployer ved push;
  Val Town-pinnen i `main.ts` må flyttes til samme commit etterpå.
