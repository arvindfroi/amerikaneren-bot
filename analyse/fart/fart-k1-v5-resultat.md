# K1 med batteriets bord: S1, base og tenketidsarmene (loop-15, v5-motstand)

Ferdig 2026-09-18T07:24:37.497Z. Gren `fart-2026-09-17` i `D:/amb-fart`. Rådata: `D:/amb-grp/loop/fartk1v5`.

- base: `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-15.bin:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`
- S1 (referanse): `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-15.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`
- arm1: `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:192k32e3LMD~mlbu=e1-modell/tro-15.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`
- arm2: `okt:vr:e1-modell/vrak-15.bin@e1-modell/etterlyst-15.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e5LMD~mlbu=e1-modell/tro-15.bin~ekv=1~topp=0.1~flat=8:budq:e1-modell/budq-15.bin:vakt:abmp:e1:e1-modell/kort-15.bin`

Duplikat på menneskekampene, 8 skarder per arm, BelowNormal. De tre andre setene: `vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin`. Bare runder fra 2026-08-10. SE: klyngebootstrap over kamper (B = 20 000); klynget sandwich i parentes.

**Beslutningsregel (skrevet før måling):** en arm tas i bruk hvis arm − ref ≥ +0,15 pp OG z > +1,96; ellers «mer tenketid hjelper ikke målbart».

## Resultat — PORTEN: kampsett = utvalg (1484 parrede runder i 150 kamper)

| arm | arm − menneske, ΔP (pp) | arm − S1, ΔP (pp) | z | arm − S1, rundepoeng | runder med ulikt rundepoeng | veggtid (sum skarder) | dom |
|---|---|---|---|---|---|---|---|
| base | +1,288 ± 0,274 | **+0,064 ± 0,188** (0,189) | +0,34 | +0,313 ± 0,229 | 241 | 329 min | ikke målbart bedre |
| S1 | +1,224 ± 0,234 | – | – | – | – | 137 min | referanse |
| arm1 | +1,255 ± 0,269 | **+0,031 ± 0,150** (0,150) | +0,21 | −0,146 ± 0,225 | 242 | 506 min | ikke målbart bedre |
| arm2 | +0,976 ± 0,304 | **−0,247 ± 0,229** (0,229) | −1,08 | −0,490 ± 0,267 | 260 | 295 min | ikke målbart bedre |

Veggtid gjelder bare skarder kjørt i denne prosessen, på en belastet maskin i BelowNormal.

### Ved siden av porten (kontekst, går ALDRI inn i dommen)

| kampsett | n | base − menneske | S1 − menneske | arm1 − menneske | arm2 − menneske | base − S1 | arm1 − S1 | arm2 − S1 |
|---|---|---|---|---|---|---|---|---|
| alle | 2641 | +1,045 ± 0,197 | +1,026 ± 0,185 | +1,239 ± 0,197 | +0,857 ± 0,206 | +0,019 ± 0,123 | +0,213 ± 0,113 | −0,169 ± 0,146 |
| utvalg | 1484 | +1,288 ± 0,274 | +1,224 ± 0,234 | +1,255 ± 0,269 | +0,976 ± 0,304 | +0,064 ± 0,188 | +0,031 ± 0,150 | −0,247 ± 0,229 |
| holdout | 1157 | +0,732 ± 0,280 | +0,772 ± 0,293 | +1,218 ± 0,289 | +0,703 ± 0,258 | −0,039 ± 0,138 | +0,446 ± 0,165 | −0,069 ± 0,157 |

## DOM: **mer tenketid hjelper ikke målbart**
