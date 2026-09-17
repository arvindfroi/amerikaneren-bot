# Destillasjon: kan støyen som ikke kan fjernes ved spilletid, fjernes ved treningstid?

Gren `destill-2026-09-17` i **`D:\amb-destill`** (fra `krav-2026-09-11` @ 092cd00).
17. sep, maks 3 kjerner. **Ingen K1-måling startet.** Løkka (iterasjon 16–22) kjører i
`D:\amb-loop` / `D:\amb-krav-batteri` — ikke rørt.

## Logg (fortløpende, maskintid)

- **Arbeidskopi:** `git worktree add -b destill-2026-09-17 D:\amb-destill krav-2026-09-11` (med `-b`).
- **Modellfiler:** hele `D:\amb-krav\e1-modell\` kopiert inn — **27 filer talt** — og i tillegg
  iter-16-settet fra `D:\amb-grp\loop\nett\` (`vrak/budq/tro/kort/etterlyst-16.bin`), totalt 32.
  `kort-16.bin` er md5-lik `nett/beste/kort.bin` (4df2a3c7…) og `kort-15.bin`.
- **Bakgrunn lest:** `dekomp.md`, `troledd.md`, `pulje.md`, `sokfokus.md` (del), arbeidsplanen.
  Riggen er portert fra `D:\amb-pulje\examples\pulje.ts` (samme fasit, samme to verdensfrø).

### Et bakgrunnstall som peker samme vei som hypotesen (fra `status.txt`, ingen ny måling)

Kortnettets holdout-anger i løkka — målt mot **søkets egen støyete etikett** — har stått på
0,79–0,85 i femten iterasjoner, og porten ble passert med 0,006–0,018 der den ble passert.
`kort-10` … `kort-14` er md5-like, og `kort-15 = kort-16`. Kortnettet har i praksis stått stille
siden iterasjon 12. Det er forenlig med at etikettstøyen setter et gulv — men beviser det ikke.

### Riggen (commit 3431595)

`examples/destill.ts` — HELK (løkkas etikettspek, 24 verdener, iter-16-nett) i alle fire seter.
For hver kortbeslutning med ≥ 2 lovlige kort fanges driverens EGET søk (`settParlytter`, som
`kort-data.ts`) — det er løkkas etikett L0 — og med **driverens eget sikkerorakel** (samme
motpart, samme `M`-økt, samme tro, k32, e3, L) kjøres i tillegg: L1 (24 verdener, annet frø) og
16 uavhengige 48-verdenssøk G0…G15 (gruppe 1 = G0–G7, gruppe 2 = G8–G15; G0 og G8 har nøyaktig
frøene troledd/bandit/pulje brukte). Råverdiene per lovlig kort skrives; all tolkning skjer i
`examples/destill-sum.ts`. Fasit (`poengRotVerdier`) lagres per kort når ≤ 7 kort er igjen.
`--data` skriver i tillegg kortnettets 493-trekk `t`, så radene kan brukes som
**evalueringssett for nett trent i del 2** (nettets rå argmaks regnes fra `t`).

Røykprøve: 13 rader på 47 s, riktig format; 4 × 48-søk i stikk 1 tok 9 s (≈ 2,2 s per søk
tidlig i runden, med løkka på 94 % CPU samtidig).

**Forhåndsregistrert spådom + beslutningsregel for del 2:** `D:\amb-grp\loop\destill-spaadom.txt`
(skrevet før start).

- 13:45 startet 3 arbeidere (6 kamper × 2 runder hver = 18 klynger). 13:47 stoppet (bare mine
  tre prosesser, funnet på kommandolinja) og startet på nytt MED `--data`, så del 1-radene kan
  bli evalueringssettet for del 2 uten å spille kampene om igjen. Ingen rader var skrevet.
  Nøyaktig 3 arbeidere verifisert etter omstart.
- ~14:00 **helsesjekk (IKKE et resultat, n = 270, 6 kamper):** analyseskriptene kjører ende til ende
  på ekte rader, 0 duplikater, 0 rader uten par. `destill-nett.ts`: kort-16 sin rå argmaks (fra `t`)
  = spekens indre lag i 90,7 % av radene — trekkene i radene er altså de nettet faktisk ser, og
  vakta endrer ~9 % av valgene. G0≠G8 ligger på 41,9 % (kjent: 43 %). Dommen felles på full n.
- Klargjort for del 2 (bygges bare hvis regelen slipper den gjennom): `examples/destill-korpus.ts`
  (rader → kort-data-format, `--kilde S|L0|G0`, samme `t`/`frø`/`stikk` i alle armer),
  `examples/destill-nett.ts` (måler nett på lagrede trekk mot S og fasit, parret mot første nett),
  `--halv` i riggen, og `--epokemappe` i `sd-tren.py` (vekter etter hver epoke; av = uendret).
  Rørtest i WSL på 270 rader: laster 493-radene, varmstarter kort-16, skriver e1/e2.bin.
