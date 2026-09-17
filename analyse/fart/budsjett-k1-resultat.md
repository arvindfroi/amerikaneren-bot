# K1 PARRET: tenketidsbudsjett (loop-15, S1)

Ferdig 2026-09-17T23:39:11.230Z. Gren `fart-2026-09-17` i `D:/amb-fart`. Rådata: `D:/amb-grp/loop/budsjettk1`.

- arm0 (referanse): `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-15.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`
- arm1: `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:192k32e3LMD~mlbu=e1-modell/tro-15.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`
- arm2: `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e5LMD~mlbu=e1-modell/tro-15.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`

Duplikat på menneskekampene, 8 skarder per arm, alle fire seter = armen, BelowNormal. SE: klyngebootstrap over kamper (B = 20 000); klynget sandwich i parentes.

**Beslutningsregel (skrevet før måling):** en arm tas i bruk hvis arm − ref ≥ +0,15 pp OG z > +1,96; ellers «mer tenketid hjelper ikke målbart».

## Resultat (3276 parrede runder i 309 kamper)

| arm | arm − menneske, ΔP (pp) | arm − arm0, ΔP (pp) | z | arm − arm0, rundepoeng | runder med ulikt rundepoeng | veggtid (sum skarder) | dom |
|---|---|---|---|---|---|---|---|
| arm0 | −0,028 ± 0,185 | – | – | – | – | 223 min | referanse |
| arm1 | −0,103 ± 0,184 | **−0,076 ± 0,109** (0,109) | −0,69 | +0,095 ± 0,179 | 945 | 841 min | ikke målbart bedre |
| arm2 | −0,072 ± 0,188 | **−0,044 ± 0,130** (0,129) | −0,34 | −0,102 ± 0,177 | 988 | 722 min | ikke målbart bedre |

Veggtid gjelder bare skarder kjørt i denne prosessen, på en belastet maskin i BelowNormal.

## DOM: **mer tenketid hjelper ikke målbart**

> **MERK (18. sep, `k1-avstemming.md`):** kolonnen «arm − menneske» er IKKE botens forsprang på mennesker.
> Her spiller armen i alle fire seter, mens mennesket møtte v5-kjeden. Samme bot måles 1,48 ± 0,52 pp høyere
> per runde med v5 i de tre andre setene (batteriets oppsett). Tallet for «hvor mye bedre enn mennesker» er
> batteriets ~+1,1 pp (utvalg), og det rettferdige +0,72 ± 0,19. De parrede arm-mot-arm-tallene står, men er
> mindre følsomme for en JEVN styrkeendring enn et oppsett med fast motstander ville vært.
