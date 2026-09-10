# MLB skalatest — forhåndsregistrert 10. september 2026

Skrevet FØR første kamp i testen er spilt, slik `docs/mlb.md` §8 krever:
«Skrives det etterpå, blir det en diskusjon i stedet for en måling.»

Arvind valgte 10. september: test skalahypotesen først, nuclear-beslutningen
tas på resultatet.

## Hypotesen

Fra commit `363ae4b` («Hvor vi står ved en ryddig stopp»), den første av tre:
MLB står stille fordi hver oppdatering ser for få kamper. Litteraturen oppdaterer
på 50–100 000; MLB-løpene brukte 1 200 (127b) til 5 000.

Status før testen, målt på stigen (gate 2, kontroll 0,0000 i alle):
47 epoker i seks løp, beste checkpoints mot `ADAMS_MAALT` −3,63 / −3,59 / −3,43
/ −3,22 / **−3,2439 ± 0,4395** (127b `mlb-beste-e11`, n=600).

## Hva som endres, og ingenting annet

Fortsetter NØYAKTIG fra 127b sin sluttilstand: epoke 13, beste
`v127b/mlb-beste-e12.bin`, samme seks tidligere motstandere, samme
Adam-tilstand, samme arbeidsvekter (sha1 `873cae7acb72`). Koden er `53ab8e1`;
MLB-koden er identisk med `363ae4b`, som 127b kjørte.

| flagg | 127b | skalatest | hvorfor |
|---|---|---|---|
| `--kamper` | 1 200 | **12 000** | selve hypotesen: 10× kamper per oppdatering |
| `--sjanse` | 0,5 | **0,15** | treneren legger ALLE rader på GPU-en; 127b ga 627 129 rader på 1 200 kamper. 12 000 × 1 044 × 0,15 ≈ 1,9 M rader ≈ 8 GB — får plass i 13,7 GB fri VRAM og 24 GB WSL-RAM |
| katalog/data/logg | `v127b` / `-127b` | `vskala` / `-skala` | egne filer, egen arbeidskopi (`D:\amb-mlb-skala`, jf. §127: kodeendringer dreper løp som deler arbeidskopi) |

Alt annet er kopiert fra 127b sine loggede underkommandoer: målpoeng 30,60,100,
maksrunder 100, temperatur 1,0, tro `e1-modell/mlb-tro.bin`, λ 0,95, γ 0,5,
lr 5e-5, 16 pass, lr-verdi 1e-3, KL-mål 0,06 / tak 0,12, holdout-del 10,
batch 1 024, entropi PER FASE 0,5×5 med gulv 0,75/0,55/0,85/0,65/0,55,
vekt-stikk 0, vekt-verdi-kvantil 0, motstander `naa`, port 300 kamper til 30,
liga 200, 20 kjerner. Epoker 14–19 (seks epoker), spillfrø etter driverens
standard (nye giv i forhold til 127b).

Antatt kostnad: ~3,8 timer per epoke, ~23 timer totalt.

## Dommen

**Måles etter at alle seks epoker er ferdige, ikke underveis** (`AdamsMax.md`,
vedlegg regel 3: delresultater løy fire ganger på én natt).

Stigen (`examples/mlb-stigen.ts`), fast panel, samme som 127b-tallet:

- **Primærbånd:** `--giver 150 --froe 8300000` (n = 600 per motstander)
- **Bekreftelsesbånd:** `--giver 150 --froe 9300000`, disjunkt

Målt på:

1. **KANDIDATEN:** den SISTE godkjente vekten ved slutt (`beste` i
   `analyse/mlb-epoker-skala-tilstand.json`). Én kandidat, valgt av porten og ikke
   av stigen — å plukke beste av seks på stigen ville vært nøyaktig
   «beste noensinne»-skjevheten fra gullstandard-feilen.
2. **GRUNNLINJA:** `v127b/mlb-beste-e12.bin` (startvektene), samme panel.
3. Til orientering, ikke til dom: alle andre godkjente vekter i testen, og
   `v127b/mlb-beste-e11.bin` som kontroll på at panelet reproduserer −3,2439.

**BESTÅTT** hvis ett av disse holder i primærbåndet, OG bekreftelsesbåndet har
samme fortegn med z ≥ 1:

- **(a) slår Adams:** kandidat mot `adams` har snitt > 0 med z ≥ 2 og flere
  positive enn negative giv; eller
- **(b) tydelig framgang:** kandidat − grunnlinje mot `adams` er større enn
  **+1,0 poeng per giv**, og større enn 2 × √(se_kandidat² + se_grunnlinje²).

**IKKE BESTÅTT** ellers. Da gjelder `docs/mlb.md` §8, og nuclear-beslutningen går
tilbake til Arvind. **Ingen ekstra epoker som redning** — «ikke framme ennå» var
det avbruddskriteriets punkt 3 skulle skille ut, og 47 epoker har svart på det.

Kontrollarmene må stå: 0,0000 i hver stigenrad. Står en ikke, er målingen
ugyldig, ikke negativ.

**Teknisk feil er ingen dom.** Går minnet tomt eller et steg krasjer, rettes det
og løpet fortsetter med `--fortsett` fra siste fullførte epoke.
