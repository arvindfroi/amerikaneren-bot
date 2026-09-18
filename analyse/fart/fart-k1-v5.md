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

---

# UTFALL (ferdig 18. sep 16:24 maskintid) — `fart-k1-v5-resultat.md`

Port: kampsett = utvalg, 1 484 parrede runder i 150 kamper. 32 skarder, ingen feil, ingen NaN.

## 1. K1 for det bestemor faktisk spiller mot — med riktig bord

| arm | mot menneske (utvalg) | mot menneske (alle) | mot menneske (holdout) |
|---|---|---|---|
| base (uten fartsknotter) | **+1,288 ± 0,274** | +1,045 ± 0,197 | +0,732 ± 0,280 |
| **S1 (det som er ute)** | **+1,224 ± 0,234** | +1,026 ± 0,185 | +0,772 ± 0,293 |
| arm1 (192 verdener) | +1,255 ± 0,269 | +1,239 ± 0,197 | +1,218 ± 0,289 |
| arm2 (e5) | +0,976 ± 0,304 | +0,857 ± 0,206 | +0,703 ± 0,258 |

**Dette er tallet som gjelder:** S1 med loop-15 henter **+1,22 ± 0,23 pp ΔP(seier) per runde** mer ut av
menneskets kort enn mennesket, på batteriets port. Det ligger på batteriets +1,11 ± 0,27 for de samme nettene,
og avstemmingen er dermed fullført: riggene er enige når bordet er likt. (Det rettferdige tallet — samme rolle
OG samme bud — er fortsatt et annet og lavere tall, +0,72 ± 0,19 fra dekomponeringen.)

## 2. Fartsknottene (regel 1): S1 − base = **−0,064 ± 0,188** (z −0,34)
≥ −0,15 og ikke signifikant negativ ⇒ **S1 STÅR**, nå med full følsomhet (fast motstand).
På alle kamper: −0,019 ± 0,123. På holdout: +0,039 ± 0,138. Rundepoeng (utvalg): −0,313 ± 0,229.
Spådd −0,2 til +0,2: traff. Sammen med den gamle selvbordsmålingen (−0,070 ± 0,136) og knottriggens
dommeranger (+0,008 ± 0,011) er dette tredje uavhengige oppsett som ikke finner skade.

## 3. Tenketid (regel 2): ingen arm når +0,15 med z > +1,96

| arm | arm − S1 (utvalg, PORT) | z | alle | holdout | kostnad |
|---|---|---|---|---|---|
| arm1 (192 verdener) | +0,031 ± 0,150 | +0,21 | +0,213 ± 0,113 | +0,446 ± 0,165 | 3,85× (~65 ms i appen) |
| arm2 (e5) | −0,247 ± 0,229 | −1,08 | −0,169 ± 0,146 | −0,069 ± 0,157 | 3,32× (~50 ms i appen) |

**DOM: mer tenketid hjelper ikke målbart.** Spådd: samme. Spådd intervall −0,1 til +0,2 for begge: arm1 traff,
arm2 lå like under.

**Ett ærlig forbehold som ikke endrer dommen:** arm1 er positiv i de to settene som IKKE er porten
(+0,213 ± 0,113 på alle, z 1,9; +0,446 ± 0,165 på holdout, z 2,7), mens porten viser +0,031. Med tre kampsett
× tre armer er det ni tall, og et enkelt z 2,7 blant dem er ikke overraskende under nullhypotesen — og
kampsettdelingen ble laget nettopp for at porten skal være det som teller. Skal spørsmålet avgjøres, må arm1
måles på nytt i et forhåndsregistrert oppsett med holdout som port (eller på nye kamper). Jeg har ikke gjort
det, og dommen over står slik regelen ble skrevet.

## 4. Kostnaden i nettleseren
Fra forsjekken: arm1 3,85× og arm2 3,32× av S1 per kortvalg, altså ~65 ms og ~50 ms median mot S1s 17 ms.
Ingen av dem er i nærheten av 5 s-taket — det er altså ikke prisen som stopper dem, det er at de ikke virker.
