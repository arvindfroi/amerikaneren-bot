# Forhåndsregistrering — R2: alle kravene trenes i samme løkke

Skrevet 11. september 2026 (natt), **før R2 har spilt én kamp**. R1 er ikke
ferdig når dette skrives (epoke 5 av 6 kjører); tallene under er fra epoke 1–4.

## Hvorfor R2 finnes — og hva som skjer med R1s avbruddskriterium

`analyse/seier-forhaandsregistrering.md` sier at MLB-linjen stoppes hvis ingen
kandidat har kampandel over 0,25 etter beste imitasjon og inntil 6 RL-epoker.
**Det kriteriet gjelder R1, og det står.** Med e1–e4 på 0,2331 / 0,2338 / 0,2200 /
0,2169 mot tre Adams (parret mot i2: +0,008 / +0,009 / −0,005 / −0,008) er det
ventet å slå inn ved e6. R1 skal rapporteres som FEILET slik det står skrevet.

R2 er ikke en omforhandling av det. Den er en NY arm, med to grunner som ikke
fantes da R1 ble registrert:

1. **Arvind, 10. sep:** «klarer du å trene alt samtidig? man klarer ikke å gå med
   1 ben». I R1 lærte policyen alene; trosnettet (K8) og belønningen sto fast,
   trent på Adams. `analyse/krav-samspill-2026-09-10.md` beskriver koblingene.
2. **Diagnosen av R1** (gradientlogg e1–e4): KL ~0,03 per epoke, entropi flat,
   verdien forklarer 0,24–0,31 på holdout (halen ~0,01), |A| ≈ 5,7. Fordelen er
   mest støy, og KL-bremsen måler mot FORRIGE epoke, så policyen driver bort fra
   imitasjonen uten retning.

## Hva som er annerledes enn R1 — og hva hver endring er målt til FØR start

| endring | krav | målt før start (10. sep) |
|---|---|---|
| **trosnettet trenes hver epoke** på epokens kamper (`--tro-tren`), godtas bare ved lavere K8-tap på holdout | K8 → K7, K3 | fast trosnett på R1-befolkningen: K8-tap 0,9531 → 0,9375 etter 2 pass på ~95 000 rader |
| **seiersprediktoren tilpasses hver 2. epoke** (`--seier-tren-hver 2`), godtas bare ved lavere CE + paritet | K1, K5 | seier-g0 1,0678 på R1-kamper mot 1,0720 for ny på 600 kamper → forkastes, som den skal |
| **KL-anker mot i2** (`--anker imit-i2.bin --vekt-anker 1.0`) | alle (hindrer retningsløs drift) | kontroll KL «før» = 0,000000; drift uten vekt 0,0557, med vekt 5 0,0123 |
| **mer data per oppdatering**: 24 000 kamper, sjanse 0,4 (~1,7 M rader), 4 pass, lr 1e-4 | signal/støy | R1: 12 000 kamper, sjanse 0,15 (~320 000 rader), 16 pass, lr 5e-5 |
| **λ 0,8** (R1: 0,95) | mindre varians i fordelen | — |
| **flere vaner**: `--ligavekter 0.3,0.2,0.5` (R1: 0,4/0,3/0,3 i ligahalvdelen) | K6 | vaner i 25 % av kampene mot 15 % |
| **lengre løp**: `--maalpoeng 60,100,100` (R1: 30,60,100) | K4, K6 | mål 30 gir 4,5 runder — for kort for hukommelse |
| uendret: seiersmål (γ 0,5), halvparten mot tre Adams, kolonnekjerne, vekt stikk/kvantil 1 | | |

## Dommen

Per epoke, med **epokens eget trosnett** (`D:\amb-imit\maal-r2.sh`, som leser
`tro.brukt` fra epokeloggen):

- **Kampbenken:** kandidaten i ett sete mot tre `ADAMS`, 400 frø, alle skard,
  og PARRET mot i2 på de samme frøene.
- **Kravbatteriet**, begge bånd, med de rettede radene (K5 retning i budet, K8
  fila OG nettets eget trohode). Kravregelen fra R1 gjelder: K2 ja; K3–K8 ikke
  mer enn 2 SE verre enn i2.

## Suksess og stopp — skrevet nå

- **Bedre enn i2:** parret kampandel over i2 med ≥ 2 SE, og kravregelen holdt.
- **Bedre enn Adams:** kampandel > 0,25 med nedre 95 %-grense over 0,25,
  replikert i frøbånd 800 000 000.
- **R2 STOPPES** hvis ingen av 6 epoker er bedre enn i2 med ≥ 2 SE parret.
  Da er det ikke flere RL-arme på samme ramme. Neste steg er å flytte kraften:
  søk ved spilletid oppå i2 (K7) og budsøket på Adams-stakken (+2,0 målt).

## Oppsett

Arbeidskopi `D:\amb-r2` på commiten med KL-ankeret. Start:
`powershell -File D:\amb-imit\start-r2.ps1` (etter at R1 er ferdig, så de to ikke
deler CPU). Dommer: `bash /d/amb-imit/maal-r2.sh 1 6`.
