# Bør appen oppdateres til nett-21? — forhåndsregistrering

Skrevet 19. sep FØR kjøring. Gren `fart-2026-09-17` i `D:\amb-fart`. Driveren skriver dommen selv til
`D:\amb-grp\loop\nett21-app-resultat.md`; denne fila er planen.

## Armene (identiske bortsett fra nettgenerasjonen — verifisert tegn for tegn)
- **arm A (nett21):** `okt:vr:vrak-21@etterlyst-21:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=tro-21~ekv=1~topp=0.1~flat=8:budq:budq-21:vakt:abmp:e1:kort-21`
- **arm B (nett15, referanse):** samme spek med `-15`-nettene — det bestemor spiller mot nå.
- Nett-21-filene er kopiert fra `D:\amb-grp\loop\nett\*-21.bin` og er identiske (md5) med `nett\beste\`.

## Oppsett
Batteriets bord: `--motstander` = v5-kjeden mennesket møtte, `--etter 2026-08-10`, port = kampsett **utvalg**
(`alle` og `holdout` rapporteres ved siden av, aldri som port). 8 skarder per arm, parret på (spill, runde),
SE = klyngebootstrap over kamper (B = 20 000). Maks 3 prosesser, BelowNormal, frakoblet via WMI.

## Regel (skrevet før kjøring)
**nett-21 anbefales til appen hvis nett21 − nett15 ≥ 0 pp OG ikke signifikant negativ (z > −1,96).**
Krav: ≥ 2000 runder per arm, lik nøkkelmengde, ingen NaN. Hver arm rapporteres også mot mennesket.

## Spådom
Porten i løkka ga K1 1,50 ± 0,24 (nett-21) mot 1,29 (nett-15) — men de to tallene er ikke parret, og min
egen måling ga nett-15 = +1,224 ± 0,234 mot menneske på samme port. Parret spår jeg
**nett21 − nett15 mellom −0,1 og +0,4**, altså anbefalt, men med en gevinst som er mindre enn differansen
mellom de to uparrede porttallene (0,21).
