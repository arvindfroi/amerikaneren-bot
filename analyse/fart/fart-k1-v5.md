# K1 med BATTERIETS BORD: S1 og tenketidsarmene mot fast v5-motstand (loop-15)

Skrevet 18. sep FØR måling (forhåndsregistrering). Gren `fart-2026-09-17` i `D:\amb-fart`.
Driveren skriver resultatet selv til `D:\amb-grp\loop\fart-k1-v5-resultat.md`; denne fila er planen.
Bakgrunn: `k1-avstemming.md` — forrige runde satte armen i alle fire seter, som gjorde tallet mot mennesket
meningsløst og dempet følsomheten for en jevn styrkeendring.

## Oppsettet (batteriets, ordrett)
- `--motstander` = v5-kjeden mennesket faktisk møtte: `vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin`
- `--etter 2026-08-10` (batteriets `K1_FRA`)
- **Port: kampsett = utvalg**; `alle` og `holdout` rapporteres ved siden av og går ALDRI inn i dommen.
- **Nettene: loop-15** (det appen spiller med), ikke iter-8.
- 8 skarder per arm, maks 3 prosesser, BelowNormal. Treningskjeden har førsteprioritet; EPIMC-K1 kjører med samme bord.

## Armene
| arm | verdensfelt | knotter |
|---|---|---|
| base | `48k32e3LMD` | ingen |
| **S1** (referanse — det bestemor spiller mot) | `48k32e3LMD` | `~ekv=1~topp=0.1~flat=8` |
| arm1 | `192k32e3LMD` | S1-knottene |
| arm2 | `48k32e5LMD` | S1-knottene |

## Beslutningsregler (skrevet på nytt, før måling)
1. **S1 mot base (fartsknottene):** S1 − base ≥ −0,15 pp OG ikke signifikant negativ (z > −1,96) ⇒ S1 står.
   I driverens tabell står raden som `base − S1`; snu fortegnet.
2. **Tenketid (arm1, arm2):** en arm tas i bruk hvis arm − S1 ≥ +0,15 pp OG z > +1,96. Ellers:
   «mer tenketid hjelper ikke målbart».
Krav for at det i det hele tatt felles dom: ≥ 2000 runder per arm, lik nøkkelmengde, ingen NaN.

## Spådommer
- **arm − menneske** med riktig bord: base og S1 rundt **+1,0 til +1,6 pp** på utvalg (batteriet: +1,11 ± 0,27;
  krysstesten min på 304 utvalgsrunder: +1,61 ± 0,49).
- S1 − base: −0,2 til +0,2 (fortsatt ingen målbar forskjell, men nå med full følsomhet).
- arm1 − S1 og arm2 − S1: −0,1 til +0,2. Dom-spådom: fortsatt «mer tenketid hjelper ikke målbart».
