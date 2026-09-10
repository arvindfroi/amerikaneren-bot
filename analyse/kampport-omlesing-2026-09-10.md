# Kampporten leste bare ett skard — omlesing 10. september 2026

## Feilen

`verktoy/kampport.sh` kalte leseren slik:

    python verktoy/kamp-les.py analyse/kp-${MERKE}s*.jsonl --ut ...

Globben var UKVOTERT, så bash ekspanderte den til ett filnavn per skard, og
`kamp-les.py` leste bare `sys.argv[1]`, altså **skard 0**. Hver kampport ble
dømt på 1/SKARD av kampene som faktisk var spilt. `verktoy/mvp-dom.sh` kalte
leseren på samme måte. (`verktoy/neste-adams.sh` kvoterte og var riktig.)

Funnet ved at rapporten sa «25 froe, 100 rader» mens loggen sa «alle skard
ferdige - 1600 rader».

## Rettingen

`kamp-les.py` leser nå ALLE posisjonsargumenter og globber hvert av dem, og
skriver antall filer i første linje. Det gamle ukvoterte kallet gir dermed
riktig svar uten at skriptene må endres. `test/kamp-les.test.ts` gir leseren
to filer på begge måter og krever alle frøene; den gamle leseren feiler den.

## Omlest på alle skard (rådataene lå på disk hele tiden)

| kampport | committet rapport (skard 0) | alle skard |
|---|---|---|
| eks3-rettet | 100 frø, 0,2400, **−0,0100 ± 0,0061 (−1,65 SE)** | 600 frø, 0,2550, **+0,0050 ± 0,0033 (+1,50 SE)** — fortegnet snur, ingen av dem signifikant |
| gulv | 100 frø, 0,1100, −0,1400 (−10,41 SE) | 600 frø, 0,1125, −0,1375 ± 0,0055 (−25,10 SE) |
| juks6-rettet | 100 frø, 0,2925, +0,0425 (+2,81 SE) | 600 frø, 0,3021, +0,0521 ± 0,0067 (+7,73 SE) |
| juks6p | 100 frø, 0,3175, +0,0675 (+4,37 SE) | 600 frø, 0,3196, +0,0696 ± 0,0065 (+10,71 SE) |
| juks6p-mot-6dd | 100 frø, 0,2550, +0,0050 (+1,42 SE) | 600 frø, 0,2550, **+0,0050 ± 0,0017 (+3,02 SE)** — nå signifikant |
| nevro | 100 frø, 0,7875, +0,5375 (+25,43 SE) | 400 frø, 0,7837, +0,5337 ± 0,0106 (+50,55 SE) |
| imit-i1 (10. sep) | 25 frø, 0,1000, −0,1500 (−6,00 SE) | 400 frø, 0,0862, −0,1638 ± 0,0064 (−25,61 SE) |
| imit-i1b (10. sep) | 25 frø, 0,1900, −0,0600 (−1,44 SE) | 400 frø, **0,2044, −0,0456 ± 0,0088 (−5,19 SE)** |

Kontrollarmen er 0,2500 i alle. Ingen av de seks eldre tallene er sitert i
`docs/` eller `AdamsMax.md` under disse navnene (søkt 10. sep), så ingen
dokumentert konklusjon hviler direkte på dem. Den ene som snur (eks3-rettet,
eksakt sluttspill) er ikke signifikant i noen av lesningene, og §116 sier
allerede at `eks:` ikke skal slås på uten ny måling.
