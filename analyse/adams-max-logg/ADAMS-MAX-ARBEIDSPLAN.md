# Adams Max — arbeidsplan (levende fil, oppdateres underveis)

Mål satt av Arvind 2026-09-10 (/goal): **nå alle Adams Max-kravene** (`AdamsMax.md`).
K1 = menneskene vinner < 5 % av kampene til 100 (retning). K2–K8 = portene.
Arvinds rekkefølge (9. aug): K2–K8 innfris → intern testing → deploy. Budmodellen sist.
Planen i repoet: `docs/krav-status.md` «Hva som må skje» (K8 → K7 → K4-6 → K3) med MLB som motor.

## Status 2026-09-11 (maskintid, Tokyo)

Tider i MASKINENS tidssone (Tokyo, UTC+9), ikke UTC — Arvind 11. sep.

Arvinds direktiver 11. sep: søk er et must · trosnettet oppdatert og koblet riktig,
run-time-tilpasning · alt koden ikke innfrir skal bygges · beste rimelige nettsidebot, ≤ 5 s tenketid,
riktig koblet (varsle med tall før utrulling).

- **Hukommelse → trosnett (K6→K8) VIRKER** (6a39e34): R1 e6 s0–s3, 245 holdoutkamper, parvis per kamp.
  uten 0,93483 · med 0,92933 (−0,0055 ± 0,0007, 7,6 SE) · stokket hukommelse 0,93502 (placebo = null).
  Holdout-feil rettet: `froe % 10` = skardnummer → hash av frøet (R2 i D:\amb-r2 har fortsatt den
  gamle; gyldig holdout, men bare to av fire kandidatseter).
  K8-batteriet bruker stillinger fra runde 1 → kan ikke se hukommelse (K8.4: mål per runde).
- **Søk med MLB-trohodet (S1)** (06240b6): `sik:…:24k32~mlbu=e1-modell/mlb-tro.bin`, `budvekt`,
  `fristMs`, `siste`. Paritet 492/492 mot 6a39e34, 131 + 8 prøver grønne.
  Verdenskvalitet (5223 stillinger): app 32,72 % · mlbu32 +6,14 ± 0,13 pp (fører +2,4, makker +7,0,
  forsvar +7,6) · mlbu8 +3,98 · trekning ~16 ms.
- **Kampbenk startet** fra `D:\amb-sok` (06240b6, ikke rør): miljø = app-kjeden uten søk
  (bud-menneske), `app-d` = utrullet søk, `app-a` = søk med trohodet; 400 frø, 6 skard hver,
  frø 700000000 → parres per frø. Logg `D:\amb-grp\kp-app.log`.
- **R2 e1:** porten AVVIST (z +0,42); tro GODTATT 0,9548 → 0,9202. Dommer (maal-r2): mot i2
  −0,0256 ± 0,0086 (−2,98 SE), tegn 60/109. Stoppregel (forhåndsregistrert): 6 epoker.
- **Appfiks** (bakgrunnsagent, worktree `D:\amb-app`, gren app-fiks, ingen push): feil-svar,
  frist/forespørsels-id, ack-gjenoppretting, byggUtrullet i hovedtråden, nyKamp, logging, paritetsprøve,
  byggkommando, observer-kanal for hukommelse.
- **Hukommelse i søket BYGD** (arbeid-2026-09-11): `MlbSøketro` (kampens bok, kaster hvis RUNDE_SLUTT
  aldri kom), `Sikkerorakel.observer`, `L` = lagmål i sik-speken, `--tro-hukommelse` i mlb-epoke.py.
  Paritet 492/492. Verdenskvalitet i hele Adams-kamper (11818 stillinger): huk−uten +0,118 ± 0,017 pp,
  placebo +0,016 ± 0,010 → ekte men liten med likt spillende motstandere; befolkningsmatch betyr mer
  (Adams-trent mlb-tro.bin +0,25 over R1-trent). `rundeNr` er 0-basert.
- **Appfiks FERDIG** (D:\amb-app, app-fiks 4dad54e + 7d0ccf6, ikke pushet): hovedtrådsfrist 4,5 s,
  id/utløpt/feil løses, ack-gjenoppretting, én kjede (`web/adamskjede.ts`), nyKamp, logging (`bottrekk`),
  paritetsprøve `test/app-lik-spek.test.ts`, `npm run bygg-web`. Tenketid søk (Node) median 433 ms,
  p90 1,3 s, maks 2,5 s; Chromium maks 3,2 s. BESLUTNING FOR ARVIND: workeren lastes nå fra samme
  nettsted først (Val Town som reserve); Val Town-pinnen må flyttes ved utrulling.
- **Storleik:** mlb-tro.bin er 7,9 MB (d7alle 1,8 MB) → må kvantiseres/destilleres før appen kan få
  troen i søket.
- **App koblet** (863801b merge, 127357c): `fristMs` 4000 inn i søket, σ/n per trekk i `soek`-raden,
  `troISøk` (av), `rundeslutt` → søketroens hukommelse, SØKEPROTOKOLL 3, dist bygd. 60/60 prøver.
  IKKE utrullet.
- **K8.4-verktøy** (25d146f): `mlb-k8 --kamp --nett2 --drivere a|b|c|d --armer ingen`; standardstien
  byte-identisk. Kjøring startet: blandet bord (bud-vant@-3, bud-menneske, @2,5, @-8) og Adams-bord,
  huk mot uten og placebo mot uten → `D:\amb-grp\k8kamp\rapport.txt`.
- **R1 K5 (rettet rad):** «BUD bak høyere» vokser med epokene: budgap e1–e6 b0 opp til +0,196 ± 0,037,
  b1 +0,139 ± 0,033 → seiersmålet driver K5-retningen selv om R1 feilet på styrke.
- **K8.4-DOM (02:13): hukommelsen gir INGEN K8-gevinst på Adams-drevne kamper.** Hele kamper,
  24 per bord, tro-uten mot tro-huk (samme R1-data): blandet bord −0,00008 ± 0,00040, Adams-bord
  −0,00016 ± 0,00040, ingen trend over runder (11+: −0,0003 ± 0,0004); placebo null. K8-tapet her
  er ~1,00 mot 0,93 på R1-holdout → nettene er trent på en annen befolkning (MLB mot vaner), og
  hukommelsesgevinsten (−0,0055 der) OVERFØRES IKKE. Budterskel-variantene er for like til å gi
  hukommelsen noe å lære. Følge: run-time-tilpasning må trenes på den befolkningen den skal
  brukes mot (menneskekamper fra appen / tydelig ulike motstandere), ellers er den pynt.
- **02:15: fulle kravbatterier for R1 e1–e6 STOPPET** (R1 er dømt FEILET, K5/K8-radene rettet og
  ferdige; batteriene tok CPU fra R2, kampbenken og i2-grunnlinja). Delresultater i
  `D:\amb-imit\krav-r1-e*.log`. Venteren `brhapsuqk` stoppet; `maal-r2.sh 1 6` (PID 22336) og
  `krav-r2-e1` lever videre.
- **ARVIND 03:00 — KURSEN:** (1) gjør Adams sterkere direkte (søk + tro + destillert budsøk), MLB
  fortsetter som forskning; (2) menneskekravene (K1, K6) sjekkes først etter utrulling, men vi har mye
  menneskedata å bygge strategier mot mennesker fra; (3) FOR MYE BENKING — trening driver framover;
  (4) iPad-tid måles når ny Adams er ute; (5) git er mitt valg (AI-ledet); (6) ok.
  Gjort: kravbatterier stoppet (i2, R2 e1, R2 e2); `maal-r2.sh` erstattet av `maal-r2-lett.sh 3 6`
  (bare den forhåndsregistrerte kampporten). Grenvalg: arbeid-2026-09-11 skyves til
  `claude/bot-performance-demo-doc3ue` (fast-forward, navnesjekk ren; bare Val Town-håndtaket i bunten).
- **R2 e2:** port AVVIST (z −1,52); tro 0,9217 → 0,9179 og seier-prediktor CE 1,0452 → 1,0305 godtatt.
  Dommer mot i2: −0,0125 ± 0,0090 (−1,38 SE), tegn 75/105 — bedre enn e1 (−2,98), fortsatt under i2.
- **BudQ BYGD og i trening (03:10–):** `src/moe2/budq.ts` + `budq:`-lag, `examples/budq-data.ts`
  (6 skard, 600 kamper, K=4 verdener, sjanse 0,5 → `D:\amb-grp\budq\d0\`), `verktoy/budq-tren.py`.
  12/12 prøver. Data ~15k budstillinger/time. Plan: tren v1 → kampbenk mot ADAMS (én dom) →
  ekspertiterasjon (generer på nytt med `budq:` som policy).
- **Mellomlesning kampbenk 03:21 (IKKE dom, 1108 par):** app-a − app-d −0,003 ± 0,012 — troen i
  førersøket flytter foreløpig ingenting målbart. (Søket selv: app-d 0,313 mot miljøets 0,249.)
- **Appen logger nå hele budrunden** (`budrunde` i `runde`-raden) — fra neste utrulling.
- **Menneskedata:** 3 251 runder med full historikk i Val Town, ingen eksportvei (bare lokal dump
  23. jul–1. aug). Krever en eksport (f.eks. privat endepunkt i valen) — eierens valg, gjøres ikke
  uten ja fordi det endrer en ekstern tjeneste.
- **03:30 — to treningsspor for Adams, køet:**
  1. **Kortnettet destillert fra søket med troen:** `sd-orakel --orakel par --mlbtro` (93af0ed,
     standardradene byte-identiske). `D:\amb-imit\start-sdpar.sh 8 400` starter AUTOMATISK når
     kampbenken er ferdig → `D:\amb-grp\sdpar\v1\`. `D:\amb-imit\d7par-kjede.sh 60000` venter på
     60k rader, tar øyeblikksbilde, finjusterer d7alle → `d7par1` (sd-tren.py, lr 1e-4, 6 ep,
     --klipp 273) og kjører ÉN gate 2 (4000 giv × 8) mot d7alle. Logg `D:\amb-grp\sdpar\kjede.log`.
  2. **BudQ v1 (03:40):** 21 558 stillinger → holdout-gevinst mot Adams' bud **+0,171 ± 0,060
     poeng per budbeslutning** (2,8 SE), enig 89,7 %, fortsatt stigende ved epoke 60. (6k ga −0,43.)
     Kampbenk startet fra `D:\amb-budq` (HEAD, budq-v1.bin kopiert): ADAMS med `budq:` mot ADAMS,
     400 frø × 8 skard → `D:\amb-grp\budq\kp-status.txt` (startet 03:42 etter et stille feil i
     worktree-oppsettet). Lengre trening (160 ep, 22 599 stillinger) → `budq-v2.bin`: beste epoke
     123, +0,189 ± 0,067 (maks-av-160-valg, litt optimistisk), holdout-mse flater ut på ~0,265 →
     DATABEGRENSET. Neste: mer data, K=8 verdener (mindre etikettstøy), ekspertiterasjon med
     `budq:` som utspillingspolicy når kampbenken har dømt v1.
     **UGYLDIG kjøring 03:42–03:47:** første oppstart startet kampporten likevel (feilen var bare i
     utskriften), og andre oppstart skrev til SAMME filer → ~380 rader per skard i stedet for 200.
     Tallene (−0,034 / −0,032) er forkastet. Ren omkjøring v1 og v2 med merke `budq-v1b`/`budq-v2b`.
     Lærdom: sjekk alltid løpende prosesser på merket før en omstart.
     **DOM (ren, 03:55):** v1 mot ADAMS −0,0088 ± 0,0082 (−1,07 SE), margin +1,24 ± 0,88;
     v2 −0,0063 ± 0,0085 (−0,73 SE), margin −0,37 ± 1,00. **Nøytral — ikke adoptert.**
     Holdout-gevinsten +0,17/budbeslutning ble ikke til seire. Sannsynlig årsak: målet er
     RUNDEPOENG (egne − snitt andre), K1 er å VINNE KAMPEN. Neste: etiketter med hele
     poengtavla per utspilling, omregnet til ΔP(seier) med seier-g0 (som i R-løpene).
     **04:00: `budq-data --seier` bygd og i gang** (commit etter 93af0ed): etikett = 100·ΔP(seier)
     for setet (fasit 0/1 når runden avslutter kampen), rundepoeng i `qp`. d2: ADAMS-policy, K=8,
     6 skard × 600 kamper, frø 18M → `D:\amb-grp\budq\d2`. Røyk: SOLO −100 poeng → −24 pp sjanse,
     rekkefølgen beholdt, avvegingene endret. Venter på 20k → trener `budq-s1` (120 ep) → ÉN
     kampbenk mot ADAMS (merke budq-s1) → `kp-status.txt`. d0b (K=8, poengmål) stoppet ved 1208 rader.
- **DOM 05:02 — troen i førersøket (app-a mot app-d, 400 frø parvis):** −0,0019 ± 0,0098, margin
  +0,11 ± 0,95. **Ingen virkning — ikke adoptert**, `troISøk` står av. Søket selv mot søkfri kjede:
  +0,0525 ± 0,0095 (5,55 SE). Verdenskvalitet +2,4 pp for føreren ble ikke til seire.
- **R2 e3:** dom mot i2 −0,0213 ± 0,0084 (−2,52 SE), tegn 62/102; port avvist. e1–e3 alle under i2.
- **BudQ-s1 (rent seiersmål, 21 028 stillinger):** holdout +0,235 ± 0,066; kampbenk vinnerandel
  +0,0019 ± 0,0091, men **margin −407 ± 12 og 50 runder per kamp** → patologisk: vågale bud
  (amerikaner 2,6 %) der seier-g0 ekstrapolerer utenfor vanlige poengområder. Ikke adoptert.
  Neste: `budq-tren --blanding λ` (seiersmål + λ·rundepoeng), samme d2-data.
  Kandidatens sluttpoeng p10/p50/p90: −942 / −39 / 107 (miljøet 4 / 62 / 107), 30 mot 17 runder.
  05:05: s2 med λ = 0,3 trenes og kampbenkes (merke budq-s2).
- **BudQ-s2 (seier + 0,3·rundepoeng, 25 020 stillinger, 05:05):** holdout +0,223 ± 0,058; kampbenk
  mot ADAMS (frø 720M) **vinnerandel +0,0194 ± 0,0088 (+2,21 SE)**, tegn 89/71, margin −5,15 ± 1,12,
  20,1 runder per kamp (normalt). Første Adams-kandidat over 2 SE på seire. Vinner oftere med lavere
  margin (mer risiko der det betaler seg for seieren). REPLIKASJON i disjunkt bånd (frø 730M,
  merke budq-s2r) kjører før noe adopteres.
  **REPLIKERT 05:07:** frø 730M +0,0294 ± 0,0091 (+3,21 SE), tegn 102/70 (z +2,44), margin −4,25 ±
  1,10. Samlet to bånd ≈ +0,024 ± 0,006 (~3,8 SE). **Første replikerte Adams-forbedring målt på
  seire (K3.1/K3.8/K5 i budet).** Kandidat for Adams-v6-budet.
  Neste (05:08): (a) ekspertiterasjon d3 — `start-budq-iter.sh budq-s2.bin d3 6 600 8` (policy
  = budq-s2, seier + qp, K=8), d2 stoppet ved ~26,6k; (b) nettsidens kjede: appkjeden (sik fører)
  med budq-s2 i stedet for bud-menneske, frø 700M, 4 skard, merke app-q i D:\amb-budq → parres med
  app-d. MERK: bud-menneske er kalibrert mot mennesker; BudQ er lært mot Adams — dom mot mennesker
  kommer først etter utrulling.
  Parvis dom når app-q er ferdig: `node <scratchpad>/kp-par.mjs D:/amb-sok/analyse app-d
  D:/amb-budq/analyse app-q` (samme frø 700M og samme søkfrie miljø).
  (c) **budq-s3** køet: når d3 har 20k rader (eller er ferdig) → tren på d2+d3 med `--blanding 0.3`
  (100 ep) → ÉN kampbenk mot ADAMS, frø 720M (samme bånd som s2) → `kp-status.txt`.
  **budq-s3 (05:48):** 47 353 stillinger (d2 + d3), holdout +0,198 ± 0,039; kampbenk mot ADAMS
  frø 720M **+0,0275 ± 0,0088 (+3,13 SE)**, tegn 101/68, margin −5,74 ± 1,16. Replikasjon frø 730M
  (merke budq-s3r) og parvis s2→s3 kjører. Neste iterasjon d4 (policy budq-s3, frø 19M) starter
  automatisk når d3 er ferdig.
  **REPLIKERT 05:54:** s3 frø 730M +0,0333 ± 0,0094 (+3,54 SE), tegn 106/71, margin −5,44 ± 1,19
  (398 frø / 1598 rader — to rader mangler, kontroll 0,2503). Samlet to bånd ≈ +0,030 ± 0,006.
  **Parvis s2 → s3:** frø 720M +0,0081 ± 0,0093, frø 730M +0,0038 ± 0,0108 → iterasjonen ga
  ingen sikker gevinst utover s2 (samlet ~+0,006). s2 og s3 er begge replikert over ADAMS; s3 er
  valgt som budkandidat for Adams-v6 (høyest punktestimat, flest data). Margin ~−5 i begge: vinner
  oftere, taper mer når den taper.
  **BudQ koblet inn i appens kjede (06:00, AV):** `UtrulletSpek.budq` (kaster på bud + budq),
  `AdamsKonfig.budqPå` / `RåAdamsVekter.budq` / `Bygd.budq` i `web/adamskjede.ts` (feil form → faller
  tilbake til budmodellen), gjelder begge tråder. Ny prøve i `test/budq.test.ts`: byggUtrullet med
  budq velger identisk med `lagIndre("budq:…")`. Dist bygges og prøvene kjøres (bf3j00p7s). budq-s3.bin
  er 422 KB. Ingen utrulling — slås på først når Arvind har sett tallene.
  Prøvene: 48/48 grønne, tsc rent → commit b2dc18c (lokalt; push blokkert av innlogging).
- **06:05 — CPU-prioritering:** R2 e4 dom mot i2 −0,0150 ± 0,0086 (−1,75 SE), tegn 67/99; port
  avvist; epoken tok 127 min pga. trengsel. app-q (appkjeden med BudQ) bare 172/1600 rader etter 1 t.
  Ekspertiterasjonen ga ingen sikker gevinst (s2→s3 ~+0,006), så **d3 stoppet ved ~26,8k og d4 IKKE
  startet** (venteren stoppet først). Frigjort CPU går til app-q og kortetikettene. R2 fortsetter
  til 6 epoker som forhåndsregistrert.
- **d7par1 GATE 2 (07:12):** 62 860 par-etiketter, finjustert fra d7alle (lr 1e-4, 6 ep, hold-anger
  0,6323). Mot d7alle: **−0,054 ± 0,043 (−1,3 SE)** — ikke forfremmet. Per rolle: **makker +0,065 ±
  0,021 (+3,1 SE)**, forsvar −0,082 ± 0,046, fører −0,118 ± 0,146. Makker er rollen der troen
  skjerpet verdenene mest (+7,0 pp). 07:13: **d7par2 = `--laerroller makker`** (bare makkerrader lærer
  av par-etikettene, resten ankret til d7alle), gate 2 på samme giv (frø 3,7M).
  **d7par2 GATE 2 (07:15): −0,397 ± 0,051 (−7,8 SE)** — fører −1,16, makker −0,064, forsvar −0,179;
  hold-anger 0,7179 (beste epoke 1, verre enn d7par1). Ankringen skader mer enn den skåner. Forkastet.
  Neste: (a) replikasjon av d7par1 i disjunkt giv-bånd (frø 4,7M) for å se om makker +3,1 SE holder;
  (b) holder den: et rolleruter-lag som bruker d7par1 BARE som makker og d7alle ellers
  (forventet ~+0,016/runde samlet, andre roller bit-identiske).
  **REPLIKASJON (07:20, frø 4,7M): samlet −0,016 ± 0,043, makker +0,0007 ± 0,021** → makker-
  gevinsten var støy. d7par1 forkastet. Rolleruteren (`e1r:`, 12/12 prøver) er committet som verktøy
  men brukes ikke. Kortetikett-genereringen stoppet ved ~65k rader for å gi CPU til app-q.
  Konklusjon for kortnettet i natt: par-etiketter med troen i verdenene flytter ikke d7alle.
- **DOM 10:07 — nettsidens kjede med BudQ-s2 (app-q) mot dagens kjede (app-d), 400 frø parvis,
  samme søkfrie miljø (bud-menneske):** vinnerandel 0,3025 → **0,3775, +0,0750 ± 0,0129 (5,81 SE)**,
  tegn 158/77, margin +0,14 ± 1,23. Mot miljøet alene: +0,1275 ± 0,0107 (11,9 SE). Større enn mot
  ADAMS (+0,03) fordi miljøet byr med bud-menneske. Ett bånd — rask replikasjon uten søk i frø
  740M og 750M for s2 og s3 kjører (merker appq-s2-74/75, appq-s3-74/75). Mot mennesker: ukjent
  til utrulling.
- **Replikasjon uten søk (10:09):** søkfri appkjede med budq-s2 mot søkfri appkjede (bud-menneske),
  frø 740M: **+0,0575 ± 0,0091 (+6,30 SE)**, tegn 120/49, margin −3,41 ± 1,09;
  frø 750M: **+0,0494 ± 0,0087 (+5,67 SE)**, tegn 117/51, margin −4,33 ± 1,15.
  budq-s3: frø 740M **+0,0702 ± 0,0093 (+7,53 SE)**, frø 750M **+0,0441 ± 0,0093 (+4,76 SE)**.
  Parvis s2 → s3 på samme frø: +0,0125 ± 0,0103 og −0,0056 ± 0,0094 → **s2 og s3 er likeverdige**.
  **KONKLUSJON 10:12:** BudQ i appens kjede slår dagens budmodell i tre frøbånd (+0,075 med søk,
  +0,050–0,070 uten), marginen ~−4. Alle jobber ferdige, CPU ledig. Gjenstår for eieren: utrulling
  av BudQ (bryteren `budqPå`), push-innlogging, eksport av menneskedata (K1/K6/K8.4 mot mennesker).
- **10:15 — søk i ALLE roller (K3.6, K4.3):** stoppkroken sier målet ikke er nådd; K1 krever
  utrulling (eierens ja + innlogging), så arbeidet går videre der det kan. To kandidater parvis mot
  app-q (appkjede + budq-s2, søk bare fører), frø 700M, søkfritt miljø, 12 skard hver:
  `app-alle-tro` = `sik:alle:0.5:24k32L~mlbu=mlb-tro.bin` + budq-s2; `app-alle` = `sik:alle:0.5:24L`
  + budq-s2. Begrunnelse: førersøket er verdt +0,05; troen skjerpet verdenene mest i forsvar (+7,6)
  og makker (+7,0); lagmålet retter feilen som gjorde tidligere makker-/forsvarssøk negativt.
  **Tenketid (10:18, maskinen full av kampbenker, fokussete 0, 12 giv):** fører-søk median 1,1 s /
  p90 2,3 s / maks 2,5 s (11 beslutninger); alle roller median 0,56 s / p90 2,3 s / maks 3,1 s (112);
  alle roller med tro median 0,54 s / p90 2,5 s / maks 3,4 s (109); ingen over 4 s. Søk i alle roller
  passer i 5 s-budsjettet her; iPad ukjent (søket kutter selv på 4 s). Kampbenkene går tregt
  (~18/1600 etter 5 min) → dom i løpet av kvelden.
- **K8 — ny trening av trohodet på Adams-korpuset IKKE startet (10:20):** korpuset finnes
  (`D:\amb-k8\full\mlb-tro-data`, 44 filer, 7,5 GB), men samme oppskrift ga 10. sep 12,37 % mot
  12,34 % (parret −0,00028 ± 0,00091) — mettet på disse dataene. Hukommelsen hjelper bare i egen
  befolkning. K8-løftet krever nye innganger eller menneskedata, ikke flere epoker. D:\amb-k8 røres
  ikke (K8-resultatene committes ikke før resten er ferdig).
- 10:20: forbereder BudQ-utrullingen i appen bak bryteren (nedlasting av vektene, init til workeren,
  sjekkliste), så en utrulling er ett steg når eieren sier ja. Ingen utrulling.
  **Gjort 10:25:** `web/dist/adams-budq.b64` (563 KB, base64 av budq-s2.bin, sha1 91a8d6bdd8b7,
  rundtur byte-identisk); `web/app.ts`: `BUDQVEKTER`, `BUDQ_PÅ = false`, henting bare når på,
  `budq` til `byggAdams` og til workeren (`Initmelding.budq`), `oppløst.budq` → `start.modeller`;
  `docs/utrulling-v5.md`: BudQ-avsnitt med fil, bryter, tall og sjekk etter utrulling.
  Bygg + prøver kjører (bkjw2cvdh). Å slå på = sett `BUDQ_PÅ = true`, bygg, last opp fila, rull ut.
  **Prøvene 49/49, tsc rent → commit 9e73060** (lokalt; 10 commits foran fjerngrenen 93af0ed,
  push blokkert av innlogging).
- **ARVIND 10:30: «du bestemmer. naturligvis skal vi ha en budmodell som er bedre enn mennesker til å
  by … det kan jo trolig bli bedre».** Mine valg: (1) BudQ på nettsiden JA — forhåndsvisning i
  nettleser først, så produksjon + Val Town-pinne; (2) menneskedata: bud først, etter mer BudQ-trening;
  (3) fornavn: ryddes senere (noen er funksjonelle stier); (4) budmodellen er hovedsporet nå.
  **Push lyktes 10:31** (93af0ed..9e73060 til claude/bot-performance-demo-doc3ue).
  app-alle (uten tro) stoppet ved ~45 rader for å gi 12 kjerner til d5: policy budq-s3, K=12,
  seier+qp, frø 21M, 12 skard × 100 kamper → `D:\amb-grp\budq\d5`. app-alle-tro fortsetter.
- **Utrullingsveien (10:35, lest):** Vercel-status for 9e73060 = success (forhåndsvisning bygd).
  Produksjon `claude/lokal-trening-oppsett` = 9b04182, forfar til HEAD → fast-forward mulig.
  Val Town-valen `arvindfroi/amerikaneren-data` (main.ts): `PINNE = "2605163"`; `PROXY` har IKKE
  `/adams-budq.b64` → må legges inn, ellers faller forespørselen gjennom til HTML-svaret og BudQ
  faller stille tilbake. Modellfilene ellers byte-like mellom pinnen og HEAD (kort, vrak, bud-*).
  Rekkefølge: (1) lokal nettlesersjekk, (2) commit BUDQ_PÅ=true + bygg, push, (3) fast-forward
  produksjonsgrenen, (4) STRAKS etter: valen får `/adams-budq.b64` i PROXY og ny PINNE,
  (5) nettlesersjekk av produksjon + `start`-rad med `modeller.budq`.
  **PERSONVERN-FUNN:** valen er offentlig (kode og HTTP), og `GET /?format=json` / `GET /` viser de
  1000 siste hendelsene med `navn` til hvem som helst med URL-en. Ikke endret — meldes eieren.
- **10:24 — søk i alle roller:** app-alle-tro 44/1600, app-alle 41/1600 etter 11 min (~3 rader/min
  hver) → dom rundt kl. 19. CPU-en er full av de to benkene; ingen andre jobber startes til de er ferdige.
- **BUDQ-s2 RULLET UT 10:40 (maskintid) som fac2ec0** (v12-2026-09-11). Lokal nettleserprøve først
  (`spill-lokal.ts` holder nå logg-POST tilbake og henter *.b64 fra web/dist — ellers havnet prøven i
  menneskedataene og brukte gamle vekter): hel runde, `start.modeller.budq = true`, worker protokoll 3,
  søk 1 ms–3,3 s. Så: prod-grenen 9b04182 → fac2ec0, valen fikk `/adams-budq.b64` i PROXY og
  `PINNE = "fac2ec0"`. Verifisert byte for byte (Vercel dist/app.js, valens app.js/worker.js/budq = commit;
  VENTET = bundel). **BEKREFTET 10:55 i en ekte kamp** (Val Town id 97116–97145, lest uten navn): `start.modeller.budq
  = true`, bundel v12-2026-09-11, worker klar 467 ms protokoll 3, søk 555–974 ms, runden fullført.
- **11:05 — «fikk du kodet inn alt som manglet fra lista?» Nei.** Gjenstår (krav-delkrav-2026-09-11.md): K7.1 eksakt
  sluttspill i spill, K8 kanal 2 (vrak) og 5 (makkers signal relativt til alternativene), søk oppå MLB (K4.3/K7.2/
  kanal 6), eksportvei for menneskedata. Kodes i egen arbeidskopi `D:\amb-krav` (gren krav-2026-09-11, fra 8d544e6;
  node_modules som junction, modellfilene kopiert) — d5/s4 kjører fra D:\amb-seier, app-alle-tro fra D:\amb-budq.
  Eksportveien krever endring i valen (nøkkel/miljøvariabel) → eierens ja, sammen med personvernfunnet.
- **K7.1 BYGD 11:40 (commit 4d8f5ce, gren krav-2026-09-11):** `eksakt.ts` hadde to feil – makkeren lekket
  (`state.makker` før avsløring, K2) og det etterlyste kortet kunne ligge hos budvinneren. Begge rettet;
  løseren byttet fra budlagets stikk (dds) til spillernes poeng (poengdds) med klasseutvidelse; mål
  diff/egen/lag; spek `eks:<t>[L][t<tak>]`; `utenSøk` stripper eks; `byggUtrullet`/`byggAdams` har `eksakt`
  (av). 38/38 målrettede prøver grønne, tre mutanter tatt. Tid under full last: 3 stikk igjen median 12 ms /
  maks 288 ms; 4 stikk median 181 ms men maks 83 s → appen må bruke `t2000`.
  **Dom køet:** `start-k7-benk.sh` (D:\amb-k7benk @4d8f5ce) venter på d5, så app-q-speken med `eks:3Lt2000:`
  mot app-q-miljøet, frø 700M, parres med app-q. Regel: inn i appen bare ved > 0 med ≥ 2 SE.
- **K8 kanal 5 og 2 BYGD (ucommittet, D:\amb-krav):** `src/mlb/signaltrekk.ts` (116 offentlige trekk: per rel
  sete × farge utspill/høyde, fulgte under + tak, tok over, kastet; trumfet; budvinnerblokk trumf/etterlyst/
  renons/spilt), bredder 776 og 920 i `trotrekk`/`tronett`, `mlb-trodata --signal`. Prøver: K2 bit-identisk,
  tellinger, rotasjon, nullpunkt (utvidet nett = samme tro), felle (koblet kolonne endrer troen).
  **Dom klar:** `start-k8-signal.sh` – nøyaktig 10. sep-oppskriften med `--signal`, parret mot mlb-tro-fase0a
  (12,37 %). Regel: inn bare ved lavere tap med ≥ 2 SE.
  **Committet 619927b**, arbeidskopi `D:\amb-k8sig`; løpet startet 11:30, data ferdig 11:34 (44 filer, 8,7 GB),
  trening i gang → `D:\amb-grp\k8-signal-status.txt`.
- **K7.2 BYGD 11:42 (commit a2eeddf):** `sik:…:<V>e<T>` – søkets utspillinger løses eksakt i hver verden fra T
  stikk igjen (poengdds) i stedet for policy-utspilling. Av = bit-identisk. 35/35 prøver (verdiene = likevekten
  regnet uavhengig fra roten; bygger = spek), to mutanter tatt. `AdamsKonfig.eksaktBlad` (av).
  **Dom køet:** `start-k72-benk.sh` (D:\amb-k72benk @a2eeddf) venter på K7.1-benken, så app-q med `24e3` mot
  app-q-miljøet, frø 700M. Regel: inn bare ved > 0 med ≥ 2 SE. Grenen `claude/krav-2026-09-11` er pushet.
- **MLB-søk ved spilletid (K4.3/K7.2/K8 kanal 6) 11:46:** ingen ny kode i src/mlb – herkomstprøven forbyr
  løseren der, og sok.ts-kroken er for søk i treningen (AVGJØRELSE 5). Søk ved spilletid = komposisjon
  (`sik:…e3L:mlb:…`, `eks:3L:mlb:…`); `test/mlb-spilletidsok.test.ts` 6/6 med herkomst. Gevinst umålt (MLB < Adams).
  Tidsmåling eks ved 5 stikk igjen gikk ut på tid (25 min) – t5 er uaktuelt i appen.
  **ALLE KODEPUNKTER I LISTA ER NÅ BYGD.** Åpent: eksportvei menneskedata (eierens ja), og dommene.
- **EIEREN 12:10:** dataene i Val Town er ikke sensitive – de kan ligge åpne. Eksport = sidevisning på den offentlige
  JSON-lista (samme data, uten 1000-grensen). Spurte om compute alene gir Adams Max: svart nei – ekspertiterasjon med
  seiersmål (BudQ-oppskriften) skalerer, mer epoker på samme data gjør ikke (R1/R2, K8 mettet). Foreslått: mål K1-TAKET
  først (tre klarsynte likevektsboter mot én Adams), så en kontinuerlig løkke BudQ → VrakQ/TrumfQ → benk → utrulling.
- **K8 KANAL 5 OG 2 – DOM 12:26: BESTÅTT etter regelen.** 10. sep-oppskriften + `--signal` (776 inn), parret på K8
  (1 200 giv × 64 verdener, 9 600 stillinger): **nett2 13,43 % mot 12,37 %** av veien gulv → tak; parret
  −0,0117 ± 0,0011 i log-tap (z ≈ 10) i signalnettets favør, bånd A −0,0106 / B −0,0128. Støyreferanse samme
  oppskrift to ganger ±0,0009. Gevinsten vokser med stikket (stikk 3 −0,002 … stikk 9 −0,040) – signalene hoper
  seg opp. Både observatør ≠ budvinner (0,8235 → 0,8110) og = budvinner (1,0417 → 1,0304). Treningens holdout
  K8-tap 0,90624 (10. sep: 0,91566). OBS: dommeskriptet merker nett2 som MC-arm og skriver «SVAR: NEI» – det
  er en etikettfeil; kontrasten «nett mot nett2» er dommen. Nettet: `D:\amb-grp\k8sig\mlb-tro-signal.bin`
  (kopi av D:\amb-k8sig), ikke committet (K8-resultater committes ikke før resten er ferdig).
  K8.2-terskelen (forslag 25 %) er fortsatt langt unna. Neste for K8: signalnettet i søkets verdener
  (`~mlbu=`) på kampbenken, og hukommelse + signal (920) trent på blandet befolkning.
- **EKSPORTVEI FERDIG 12:29:** valen fikk sidevisning (`?format=json&etter=<id>&grense=<n>`, verifisert `[]` etter
  siste id); `examples/menneske-eksport.ts` hentet 97 145 hendelser → `D:\amb-grp\menneske\hendelser.jsonl`
  (21 MB, 25 pseudonymer, saltet sha256; salt i samme mappe, utenfor repoet). Lik databasens telling per type.
  Neste med dataene: menneskenes budvaner (11 byr de 3× så ofte) → K6.6, og K1-tallet per bundel.
- **VRAKQ RUNDE 1 STARTET 12:40 (meso-treningsspor, commit 27acd03, D:\amb-vrakq):** `examples/vrakq-data.ts` merker
  (trumf, vrak)-par mot 100·ΔP(seier) + 0,3·rundepoeng med appens kjede som policy i kamper til 100, kandidatene =
  nøyaktig `Vrakrangerer`-settet, policyens eget par som referanse. `start-vrakq.sh`: 8 skard × 1 200 kamper, 12 verdener
  → `vrak-tren.py` (samme 24→64→32→1-form, byttes inn uten kodeendring) → benk app-q med `vr:vrakq-s1.bin` mot app-q,
  frø 700M. Regler: benkes bare hvis holdout-angeren slår policyens; inn i appen bare ved ≥ 2 SE.
  Status: `D:\amb-grp\vrakq\status.txt`. Begrensning: vraktrekk har ingen kampstilling (K5) – VrakQ v2 legger den til.
- **VRAKQ V2 BYGD OG KØET 12:45 (commit 2cd1201, D:\amb-vrakq2):** `vraktrekkK` = 24 + kampstilling (egne/beste andres
  poeng, runde), `Vrakrangerer` godtar 24|27, `vrakq-data --kampstilling`, `vrak-tren.py --dim`. 9/9 prøver (nullpunkt
  24→27 velger likt, felle tatt), bygger = spek grønn. `start-vrakq2.sh` venter på runde 1-dataene, frø 24M, trener
  `--dim 27` etter runde 1s trening, benker `app-q-vrakq2`. Status `D:\amb-grp\vrakq\status-v2.txt`.
- 12:36: d5 FERDIG (bkexfegb0 exit 0) → s4-venteren og K7.1-benken starter av seg selv.
- **BUDQ-s4 TRENT 12:49** (d2+d3+d5, 129 730 stillinger): s4a (256,256) holdout-gevinst +0,134 ± 0,020 mot policyen
  (d5-policyen er budq-s3, så tallet er IKKE sammenliknbart med s3s +0,198), s4b (512,512) +0,123. `bench-budq-s4.sh`
  (velger s4a) køet etter VrakQ runde 1-dataene; regel: > 0 i begge bånd og samlet ≥ 2 SE mot s2.
- **EIEREN 12:55 om K1:** tror ikke taket-målingen virker; 5 % er vilkårlig og kanske umulig med kortflaksen – «kunne vel
  heller regnes ut»; poenget er OVERMENNESKELIG nivå, i dag PAR. Løkka er mitt valg.
- **K1 SOM DUPLIKAT BYGD OG KJØRT 13:05 (commit aca46e0):** hver menneskerunde gjenskapt fra frø + rundeNr + poengtavle
  (0 av 3 276 avvist av givkontrollen; 1 172 runder uten spilte kort i loggen), boten i sete 0, de tre andre = v5-kjeden
  mennesket møtte (uten søk). Bot − menneske per runde, klyngebootstrap over 309 kamper:
  | sete 0 | ΔP(seier), alle | ΔP fra 10. aug | rundepoeng fra 10. aug |
  |---|---|---|---|
  | v5 uten søk | +0,16 ± 0,17 | +0,32 ± 0,17 (z 1,9) | +1,35 ± 0,24 (z 5,6; fører +3,07) |
  | BudQ-s2 uten søk | +0,19 ± 0,17 | **+0,44 ± 0,17 (z 2,5)** | +0,69 ± 0,27 |
  | BudQ-s2 + eks:3L | +0,19 ± 0,17 | +0,41 ± 0,17 (z 2,4) | +0,63 ± 0,28 |
  Lesning: boten henter mer RUNDEPOENG ut av menneskets kort (særlig som fører), men i VINNERSJANSE er den bare
  svakt foran (+0,4 pp per runde ≈ +8 pp over en kamp på ~19 runder). Det er «par» i praksis. Forslag til K1-kriterium
  for «overmenneskelig»: duplikat-ΔP ≥ +1,0 pp per runde med z ≥ 3 (≈ +20 pp kampvinnersjanse), på runder fra etter
  utrullingen. Forbehold: søket er av i duplikatet (appen søker som fører) – tallene er nedre grenser for appen.
- **EIEREN 13:10:** kriteriet er greit («det samme for meg»); spør om flaksandelen kan regnes ut med matte. Svar
  (varianstall fra duplikatet, fra 10. aug, 2 641 runder): to ulike spillere på samme kort korrelerer 0,51 i ΔP(seier)
  per runde → kortene forklarer ~51 % av variansen i én runde (0,41 i rundepoeng); resten er beslutninger OG stiavvik.
  Dagens ferdighetsforskjell (+0,44 pp, sd 9,2 pp) forklarer 0,2 % av én runde og ~4 % av én kamp (17 runder i snitt).
  Eksakt identitet: Σ ΔP over en kamp = utfall − 25 %, så menneskets vinnerandel ≈ 25 % − 17 × underskudd per runde;
  5 % krever ~1,2 pp per runde (≈ kriteriet). Ren teori uten data går ikke: flaksandelen er ikke en egenskap ved
  spillet alene, den avhenger av hvor ulike spillerne er, og verdien av perfekt spill er ikke regnbar for et spill
  av denne størrelsen.
- **VRAKQ RUNDE 1 – IKKE BESTÅTT 13:08:** 8 134 vrakstillinger (9,5 kandidater i snitt, 12 verdener). Nett trent fra null:
  holdout-anger 2,1505 (treff 47,1 %). Dagens vrakrangerer på SAMME etiketter (regnet fra dataene): anger 2,050, velger
  beste kandidat i 49,8 %. Nettet slår ikke det bestående → ikke benket (riktig utfall; porten i skriptet leste ikke
  referansetallet og ga tomt – konklusjonen står, men v2-porten har samme svakhet: vurderes for hånd).
  Lærdom: 8k stillinger med 12 verdener er for lite til å lære fra null over et nett som allerede er godt. Neste:
  `vrak-tren.py --vekter` (start fra vrakrang.bin, 24→27 med nullkolonner) + mer data / flere verdener.
- **13:20 – rettet og køet:** `vrak-tren.py --vekter` + `POLICY-/MODELL-ANGER-HOLDOUT`-linjer (commit 979684e, pushet;
  røyk: varm start gir holdout 2,055 ≈ policyens nivå, men anger 1,82 på trening → overtilpasser på 8k stillinger).
  `start-vrakq-varm.sh` venter på v2-treningen, trener 27-nettet på v2-dataene fra vrakrang.bin (60 epoker, lr 3e-4),
  benker bare hvis modellens holdout-anger slår policyens. BudQ-s4-benken feilet først (rapporten er tekst, ikke JSON –
  rettet i `bench-budq-s4.sh`) og kjører nå (s4a). Neste VrakQ-data: flere verdener (24) og 3× så mange stillinger,
  når CPU-en er fri (nå ~44 prosesser på 24 kjerner: K7.1-benk, s4-benk, v2-data, app-alle-tro).
- **BUDQ-s4a DOM 13:23 – BESTÅTT etter regelen** (søkfri appkjede, samme miljø og frø som appq-s2): parret mot s2
  bånd 740M +0,0206 ± 0,0100, bånd 750M +0,0094 ± 0,0101 → begge > 0, samlet +0,0150 ± 0,0071 (z 2,11).
  Sluttmargin lavere: −1,9 / −4,2 (samlet ≈ −3,1, z ≈ −3,6) – seiersmålet bytter poeng mot kampseire.
  Mot s3: +0,008 / +0,015 (ikke signifikant). Kandidatens vinnerandel mot miljøet 0,3281 / 0,3088.
  Før utrulling: duplikatsjekk mot menneskerundene (s4a i sete 0, v5 rundt bordet) – ΔP skal ikke være lavere enn s2s.
  **Duplikat: s4a +0,50 ± 0,19 pp/runde fra 10. aug (z 2,7) mot s2 +0,44 → bestått.** Rundepoeng lavere (+0,14; forsvar −1,14).
- **BUDQ-s4a RULLET UT ~13:40:** `web/dist/adams-budq.b64` = s4a (sha1 242a4dbd8e5c), commit 5da28e9 på arbeidsgrenen og
  prod (`claude/lokal-trening-oppsett`, fra fac2ec0; første push brutt av nettet, andre gikk), Val Town `PINNE = "5da28e9"`.
  Samme filnavn og form → app og PROXY uendret. Loggens `modeller.budq = true` skiller ikke s2/s4a – tidspunktet gjør.
  **Verifisert byte for byte 13:44:** valens adams-budq.b64 = s4a (242a4dbd8e5c); app.js/worker.js (val og Vercel) = commiten.
- **LØKKA VIDERE (13:45):** `start-budq-d6.sh` venter på K7.1-benken → d6 med s4a som policy (frø 26M, 12 × 100 kamper,
  12 verdener) → s5 på d2+d3+d5+d6 → benk parret mot appq-s4a-74/75. Regel: > 0 i begge bånd, samlet ≥ 2 SE, og
  duplikat mot menneskerundene ikke under s4a (+0,50). Status `D:\amb-grp\budq\d6-status.txt`.
- **EIEREN ~13:30 – KURSENDRING: ikke benk én og én modul.** «Kast alt inn i modellen, tren den og juster den» – modulene
  avhenger av hverandre, så delbenker sier lite. STOPPET ~13:31: K7.1-benk, K7.2-venter, VrakQ-varm-venter, d6/s5-kjeden,
  søk-i-alle-roller-benken (16 skript + 24 benkprosesser). BEHOLDT: VrakQ v2-dataene (treningsdata med kampstilling).
  NY LØKKE («Adams Max-løkka»): én bot med ALT på (BudQ, VrakQ m/kampstilling, søk i alle roller m/lagmål + eksakt blad,
  eksakt sluttspill, signal-trosnett i søket); hver iterasjon spiller hele boten kamper til 100, de SAMME kampene gir
  data til alle lærte delene (bud, vrak/trumf, tro) med seiersmålet, alle nett trenes videre fra forrige versjon, og
  bare HELHETEN måles: duplikat mot menneskerundene (K1-kriteriet) + én parret sjekk mot forrige iterasjon så løkka ikke
  går baklengs (R1-lærdommen). Knottene justeres på helheten.
- **EIEREN ~13:34: «ikke konstant venting – one big push».** STARTET 13:37: `adams-max-push.sh` (D:\amb-push @979684e,
  status `D:\amb-grp\push\status.txt`). Tre spor SAMTIDIG, rett fra data til trening: BUD (8 skard × 1 200 kamper, frø 26M →
  budq-tren d2+d3+d5+ny), VRAK (6 skard × 900 kamper m/kampstilling, frø 25M, + v2-dataene → vrak-tren --dim 27 fra
  vrakrang.bin; brukes bare hvis holdout-angeren slår dagens), TRO (--signal, 30k+6k giv, samme policy → mlb-tro-tren fra
  signalnettet, 8 epoker, lr 3e-4). Så HELHETEN B1 (alt på: nye nett + eks:3L + sik:alle e3L ~mlbu) mot B0 (appen ute):
  duplikat mot menneskerundene for begge, og 100 frø B1 mot tre B0.
  **STIFEIL 13:39, rettet ~13:40:** skriptet eksporterte MSYS_NO_PATHCONV=1 og ga node «/d/amb-grp/…» → trosdataene havnet i
  D:\d\amb-grp\… (komplette: 6+6 filer, 2,8 GB – flyttet på plass), trostreningen startet uten data, og dommen over
  helheten ville lest feil mappe. Toppskriptet stoppet (bud- og vraksporene går videre som egne prosesser);
  `adams-max-push-2.sh` trener trosnettet nå, venter på bud/vrak og kjører helheten med eksplisitte D:/- og /mnt/d/-stier.
  VrakQ v2 fra null (13:39): holdout-anger 2,1586 – samme bilde som runde 1; varm start er i push-sporet.
  **~13:41 – ingen venting på budsporet:** buddataene tar ~2 t (4 av 150 kamper per skard på 3 min; hver budbeslutning =
  12 verdener × kandidater × runde). Helhet 1 bruker derfor budq-s4a (trent på d2+d3+d5) så snart vrak- og trosnettet er
  ferdige (~30 min); de nye buddataene trenes inn i runde 2. En liten venter (b25ez2592) skriver s4a som budq-push.bin og
  «BUD trent»-linja når vrak-valg.txt og mlb-tro-push.bin finnes, så avslutningsskriptet går videre.
- **13:55 – treningene i push-runden:** VRAK (varm start, 27 inn, 6 592 nye + 8 149 v2-stillinger): holdout-anger 1,7746;
  policyen (vrakrang) på de samme dataene 2,0029, beste kandidat 48,6 % → nettet er klart bedre. Porten så likevel en tom
  referanse (utskriftene før første epoke forsvinner i WSL-røret – bare MODELL-linja kom fram), og helheten startet med
  vrakrang.bin. STOPPET 13:57 og startet på nytt: `adams-max-helhet.sh vrakq-push.bin budq-push.bin mlb-tro-push.bin`.
  TRO (varm start fra signalnettet, 8 epoker lr 3e-4 på 2,8 GB fra s4a-policyen): K8-tap 0,910 på egen holdout (annet
  korpus enn 10. sep – ikke sammenliknbart). BUD: budq-push.bin = s4a i helhet 1; nye buddata (d6) går videre.
  Å RETTE i vrak-tren.py: skriv POLICY-linja også på slutten (etter treningen), så den overlever røret. (Rettet ca09d50.)
- **EIEREN 14:05 – REKKEFØLGEN:** «først passer du på at alt er på plass før trening og justering, så utfallet innfrir
  kravene. Tror du det er et mulig utfall, kjør på. Først Adams Max, SÅ destillere og optimalisere.» → I denne fasen er
  5 s-tenketiden ikke et krav for Adams Max-boten (den kommer ved destilleringen). Neste: inventar over hva som mangler
  før «alt er på» (K4/K6-lagene okt/profil sammen med sik, trosnett med hukommelse + signal (920), kravbatteri som tar
  en vilkårlig spek, K2-prøve på hele boten, etterlysning som lært valg) – agent kartlegger nå.
- **INVENTAR ~14:15 (agent):** B1 bygger, men (1) `okt:`/`profil:` lærer uten å påvirke noe – `sik:` leser aldri Økt, BudQ har
  ingen motstanderinngang; (2) trosnettet i B1 er 776 (ingen hukommelse), og ingen generator lager 804/920-rader fra hele
  kamper med vilkårlig spek; (3) kravverktøyene tar ikke en vilkårlig spek (bare tak-kart, kamp, k6-vaner, duplikat);
  K2-prøven feiler på søkets vedvarende RNG; ingen K5-retningsprøve for spek; (4) flere drivere kaller aldri observer ved
  rundeslutt (throw med hukommelsesnett); (5) appkjeden kan ikke uttrykke sik:alle…L; (6) etterlysningen er en håndregel.
  **LUKKES PARALLELT ~14:18 – fem agenter, hver i egen arbeidskopi og egne filer, commit uten push, jeg fletter:**
  A (D:\amb-agA) sik bruker Økt (motpartFor), K2-trygg stillingsbundet RNG, appkjede = helbot (roller/lagmål/økt);
  B (agB) BudQ med motstanderblokk (Hukommelse, 287 inn) + budq-data --hukommelse + budq-tren --vekter;
  C (agC) mlb-trodata --kamp med hukommelse (920) + observer i mlb-k8/k6-vaner/mlb-spill;
  E (agE) kravbatteri for vilkårlig spek (k2-spek, k5-retning, k4 --spek, billigere tak-kart, mlb-krav --spek);
  F (agF) lært etterlysning (etterlystTrekk, vrakq-data --etterlyst, Vrakrangerer med etterlystnett).
  Deretter: flette → målrettede prøver → helbot med alt på → kravbatteri som baseline → løkke (data fra helboten →
  tren alle nett → kravbatteri på helheten).
- **HELHET 1 – DUPLIKAT MOT MENNESKERUNDENE 14:20** (v5 rundt bordet, samme kort og poengtavle, 2 641 runder fra 10. aug):
  | sete 0 | ΔP(seier) pp/runde | rundepoeng |
  |---|---|---|
  | **B1** helbot (vrakq-push, eks:3L, sik:alle e3L ~tro-push, budq-s4a) | **+1,08 ± 0,18 (z 6,2)** | +1,20 ± 0,28 |
  | B0 appen som er ute (vrakrang, førersøk 24, s4a) | +0,86 ± 0,19 (z 4,6) | +0,89 ± 0,27 |
  Parret B1 − B0 på samme runder: ΔP +0,23 ± 0,14 (z 1,6), rundepoeng +0,31 ± 0,20. B1 per rolle: fører +1,07, makker +0,42,
  forsvar +0,84. Alle runder (også før 10. aug, andre boter rundt bordet): B1 +0,84 ± 0,18.
  → **K1-kriteriet (≥ +1,0 pp/runde, z ≥ 3) er nådd i punktanslaget fra 10. aug**, men nedre grense (~+0,72) ligger under,
  og ~1,2 trengs for 5 %-tolkningen. Søket (alle roller) + eksakt + nytt vraknett løftet fra +0,44 (s2 uten søk) til +1,08.
- 14:35: agent B ferdig (30d9cc4: BudQ 287 inn med Hukommelse, budq-data --hukommelse, budq-tren --vekter/--dim) – flettet.
- ~14:39: agent A ferdig (16e7f54) – flettet som 1daf5b6 (én importkonflikt i web/adamskjede.ts løst), tsc rent.
  `sik:` fikk `M` (hvert motstandersete spiller utspillingene med økta sin policy, krever `okt:`) og `D` (frø per
  beslutning av en hash av spillerVisning – samme stilling samme valg, K2-trygt). Appbyggeren kan bygge helboten
  (`roller`, `lagmål`, `brukØkt`, `visningsfrø`, `profilOverSøk`) og fikk en feilretting: økta fikk aldri policyen
  (`settAtferd`) i byggeren, så K4/K6 var stum i appen. 17/17 nye prøver + regresjoner, fire mutanter tatt.
  HELBOT-SPEK nå: `okt:vr:<vrak>:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=<tro>:budq:<bud>:vakt:abmp:e1:e1-modell/d7alle.bin`.
  Bayes-vekting av verdener fra økta droppet med vilje: tro-nettet i verdenene leser samme bevis (dobbelttelling).
- ~14:43: agent C ferdig (54619f7) – flettet som f791c84. `mlb-trodata --kamp [--hukommelse] [--signal]` gir 660/776/804/920
  fra HELE kamper med vilkårlig spek (egne frøbånd 1,950 G / 1,985 G), default byte-identisk; observer ved rundeslutt i
  mlb-k8 --kamp og k6-vaner (mlb-spill kan ikke – dokumentert + vakt). 9 nye prøver. Funn: mlb-tro-tren --vekter fra 776
  til 920 la nullkolonnene bakerst (feil: 920 = 660 | hukommelse | signal) – RETTET i trenerens les_vekter (innsetting på 660).
- ~14:45: agent F ferdig (a519dce) – flettet som 3b72dbf etter trenerrettingen (4ea8597). Lært etterlysning:
  `etterlystTrekk` (25 inn), kandidater = tre høyeste + laveste lovlige, `Vrakrangerer` med valgfritt etterlystnett,
  spek `vr:<vrak>@<etterlyst>:<flagg>:…`, `vrakq-data --etterlyst [--etterlystpar k]`, `vrak-tren --type etterlyst`.
  Prøver etter fletting: A+B 32/32, C+F 27/27, tsc rent. Gjenstår: agent E (kravbatteri).
- ~14:48: WSL startet ikke (CreateVm 0x800705b4, CPU full, .wslconfig 24 GB/22 kjerner) – `wsl --shutdown` + omstart
  virket (53 s, CUDA ok). Merk for løkka: sjekk WSL før hver GPU-fase.
- ITERASJON 0-NETT (D:\amb-grp\loop\nett): tro-0.bin = mlb-tro-push 776→920 (nullkolonner på 660), budq-0.bin = s4a
  143→287 (nullkolonner bakerst), vrak-0.bin = vrakq-push (27). Helbot-spek for løkka:
  `okt:vr:e1-modell/vrak-0.bin:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/tro-0.bin:budq:e1-modell/budq-0.bin:vakt:abmp:e1:e1-modell/d7alle.bin`
  Kontroll: utvidede nett = originalene med tom hukommelse (tro 288/288 fordelinger, budq 45/45 Q-vektorer, avvik 0).
- **LØKKA KLAR ~14:51:** arbeidskopi `D:\amb-loop` @3b72dbf, `D:\amb-imit\adams-max-loop.sh <k>`: DATA samtidig (bud --hukommelse
  8×800 kamper, vrak+kall --kampstilling --etterlyst 6×900, tro --kamp --hukommelse --signal 6×300 + 2×60 holdout; policy
  = helboten uten søk) → TRENING på GPU (budq 287 fra budq-k; vrak 27 og kall 25 med anger-port; tro 920 fra tro-k) →
  kravbatteri på helheten (kobles inn når agent E er flettet). Frøbånd per iterasjon: bud 100M+k·10M, vrak 300M+k·10M,
  tro kamp-båndene med --fra k·300 / k·60. WSL sjekkes (og startes på nytt) før GPU-fasen. Flaggene er verifisert.
  Stoppet push-budsporet (143-brede buddata med s4a) – erstattet av 287-brede data med hukommelse i løkka.
- **RØYK HELBOT ~14:52:** helbot-speken med iterasjon 0-nett bygger og spiller 2 runder i alle seter med observer (hukommelse
  fylles): 108 beslutninger, median 59 ms, p90 989 ms, maks 2 001 ms under full CPU. **ITERASJON 0 STARTET 14:53**
  (`adams-max-loop.sh 0`, status `D:\amb-grp\loop\status.txt`).
  Småfeil sett under prøven (fra før, ikke BudQ): dobbeltklikk på «Neste» før tegningen gir uncaught
  «Kan ikke gå videre nå» fra `krev` i motor.ts — ingen tilstand endres; rettes i neste frontendrunde.
- **BUDQ-s4 KØET (10:50):** `bash /d/amb-imit/start-budq-s4.sh` venter til d5-prosessene er borte (d5-starteren
  skriver ingen FERDIG-linje), skriver FERDIG i d5/status.txt, og trener s4a (256,256) og s4b (512,512) på
  d2+d3+d5 med `--blanding 0.3`, 100 epoker → `D:\amb-grp\budq\s4-status.txt`, `tren-s4a/b.log`. Dom: søkfri
  appkjede parvis mot budq-s2 (det som er utrullet) i to frøbånd; bare den beste av s4a/s4b benkes, og bare hvis
  holdout-gevinsten ikke er lavere enn s3s. app-alle-tro 10:45: ~150/1600 rader (CPU delt med d5).
- **Fornavn i repoet (10:12):** eneste navn lagt til i natt var venv-stien i `verktoy/budq-tren.py`
  (allerede pushet i e4eabaf) — fjernet i e167714, sammen med et eldre sitat i
  r2-forhaandsregistrering.md. **272 sporede filer har navnet fra før** (mest «ARVIND:»-sitater i
  kommentarer: examples 78, verktoy 35, src/moe2 31, analyse 25, test 19). Ikke skrevet om — eierens
  valg om det skal gjøres (og om historikken skal renses).
- **R2 FERDIG (08:36): FEILET.** e5 −0,0169 ± 0,0088 (−1,91 SE), e6 +0,0025 ± 0,0089 (+0,28 SE);
  alle seks porter avvist; ingen epoke over i2 med ≥ 2 SE (stoppregelen). 7,9 timer. MLB er fortsatt
  under Adams; BudQ-sporet (Adams direkte) er det som flytter seire.
- **FEIL I VENTEREN 03:30–05:03:** sdpar-starten ventet på 2000 kampbenkrader, men 400 frø × 4
  kandidatrader = 1600 → startet aldri, og d7par-kjeden ventet på den. Venteren stoppet, sdpar
  startet for hånd 05:04. Lærdom: vent på «alle skard ferdige» i loggen, ikke på et regnet radtall.
- **PUSH STOPPET 04:05:** fjerngrenen står på 93af0ed; lokalt ligger 2ceeab2 (budq-data --seier) og
  senere. `gh auth git-credential` ber nå om /dev/tty, og Git Credential Manager henger på en
  innloggingsdialog. Ikke forsøkt mer (ingen innlogging uten eieren). Commitene er trygge på
  `arbeid-2026-09-11` i D:\amb-seier — push når innloggingen er fornyet.
- `D:\amb-sok2` (25d146f, modellfiler kopiert) står klar for neste kampbenk: `sik:alle:0.5:24k32L~mlbu=…`.
- Neste: dom app-a mot app-d (~04:45); K8.4-dom; trohode-storleik (kvantisering/destillering) hvis
  troen i søket vinner; tall til Arvind før noen utrulling.

## Status 2026-09-10 kveld

| krav | status | kilde |
|---|---|---|
| K1 | menneskene 22/83 = 26,5 % mot v5 siden 10. aug (mål < 5 %) | Val Town `type='kamp'` |
| K2 | BEVIST (dagens stakk); MLB-røyk 11/11 grønne | test/k2-*, mlb-krav |
| K3 | ikke innfridd — budrunden 41,8 % igjen | krav-status |
| K4 | ubevist på dagens stakk | krav-status |
| K5 | DELVIS — retning vist n=576 (53ab8e1) | analyse/k5-2026-09-02.md |
| K6 | ikke innfridd (z = 0,23) | krav-status |
| K7 | ikke innfridd (+0,947 ved fem stikk) | §117 |
| K8 | 12,34 % (reprodusert 12,37 % 10. sep, parret null forskjell) | §119, D:\amb-k8\full |

## Løpende jobber

1. **MLB-skalatest** `D:\amb-mlb-skala` — forhåndsregistrert (c7e5a40). Start 10. sep 18:07,
   ~4,5 t/epoke (spill ~2,7 t CPU, erfaring ~0,8 t, trening ~1 t GPU), 6 epoker → ferdig
   ~11. sep 21:00. Gjenoppta: `powershell -File D:\amb-mlb-skala\start-skala.ps1`.
   Minnetest trening: GPU-topp 10,8/16,3 GB, WSL-RAM 16,3/24 GB ved 1,88 M rader — OK.
   Dom: stigen mot ADAMS_MAALT, frø 8300000 + 9300000, 150 giv, siste godkjente vekt mot e12.
2. **Kravbatteri på e12 (grunnlinje)** — `amb-n14-merge/analyse/krav-e12/`, --to-band, 1 kjerne.
   Logg: scratchpad `krav-e12-full.log`. Røyk (--kjapp) OK: K3/K7 STUM kun pga liten n.
3. **Profilering av spillsteget** — avgjør om GPU-bunket selvspill lønner seg.

## Verifisert underveis (skal ikke gjøres på nytt)

- `--sjanse` er trygt å senke: `examples/mlb-erfaring.ts` regner `gaeFordel` over HELE kampen
  (linje 400) og trekker rader først etterpå (linje 462). Utvalget endrer ikke fordelene.
- Kravbatteriet (`examples/mlb-krav.ts`) kjører ende til ende på ekte 127b-vekter (røyk 6 min).
  K3/K7 STUM i røyk = fella under 2 SE ved n=8/24 (`mlb-krav.ts:317`), ikke apparatfeil.
- Budsøk (A4, `src/moe2/budsok.ts`, `examples/k3-budgap.ts`): K=12 ikke etablert; K=240 +2,0
  for åpneren i begge bånd, men koster ~240 utspillinger per kandidatbud → må destilleres.

- Holdout i treneren er trygg ved 10× kamper: `kamp` = kampens frø (i32), `|frø| % 10 == 0`;
  største frø i skalatesten ~1,68e9 < 2,147e9.
- **PROFIL AV SPILLSTEGET (10 kamper, 1 kjerne, 136 s, 2026-09-10):** 52 % `src/nevro/nett.ts`
  `forover`, 41 % `src/mlb/tronett.ts` `fordeling`, 2,7 % MLB-nettet selv, < 3 % motor/trekk.
  ~93 % er tett matrisemultiplikasjon i TS → bit-identisk glissen/tett-løkke-optimalisering
  (som d7alle 428→138 ms) eller GPU-bunking kan kutte epoken kraftig.

- **KJERNEBENK (4000 ekte innganger, e12 + mlb-tro.bin, 2026-09-10):** tidens `forover`
  (radvis, bit-identisk) mot kolonnevis kjerne: MLB-nett 2,44 → 1,47 ms (1,66×), trohode
  1,51 → 0,57 ms (2,67×), per beslutning 3,95 → 2,04 ms (**1,94×**). Maks logit-avvik 4e-7 /
  2e-6, argmaks lik 1000/1000. Nett: stamme 1031→1024→768→512, hoder 512→68/1/1/208/13/32;
  trohode 660→1024→768→512→208. Ikke-null innganger: MLB 34 %, trohode 21 %.
  REGEL: rask kjerne KUN i treningsdata (spill/erfaring), eksplisitt flagg som står i
  rapporten; all måling (stigen, kravbatteri, spekagent) beholder bit-identisk `forover`.
  Skalatesten endres ikke.
- **KOLONNEKJERNEN BYGD** i `D:\amb-kjerne` (egen arbeidskopi, fordi kravbatteriet kjørte fra
  amb-n14-merge): `src/nevro/nett-kolonne.ts`, `brukKolonnekjerne()` på Sandkassenett/MlbTronett,
  `--rask-kjerne` i mlb-spill/mlb-erfaring/mlb-epoke.py (bare SPILL+ERFARING, aldri K2/port).
  Ende til ende 10 kamper/1 kjerne: 143 s → 76 s (**1,88×**), 10/10 kamplogger identiske.
  Test `test/mlb-kolonnekjerne.test.ts` vist å kunne feile (no-op-mutant → 2 røde).
  Bruk `--rask-kjerne` i ALLE MLB-løp etter skalatesten.
  **Committet 687811c** (arbeidsgrenen), hele suiten 651 tester: 649 grønne, 0 røde, 2 hoppet over.
- **TRENINGSSTEGET PROFILERT (cProfile, 200k rader, 1 pass):** 64 % innlesing over /mnt (kald
  cache), 18 % `maal(...)` — kalt per batch av KL-bremsen, som bare bruker `lp`. Selve
  framover+bakover ~3 %. `kl_logp` (ny, i `D:\amb-kjerne\verktoy\mlb-gradient.py`) gjør bare
  `lp`-delen med samme ops. **Treningssteget er deterministisk** (A1 = A2 sha1 9c739a861dfd5cb0),
  og ny kode gir **samme sha1** (B). **Full størrelse (1,88 M rader, 1 pass):** gammel 309 s
  (trening ~208 s), ny 118 s (trening ~53 s) → **3,9×**, sha1 5db094d1e7e54e8a i begge.
  16 pass: ~55 → ~14 min. Samlet med kolonnekjernen: epoke ~4,5 t → **~2,2 t**.

- **Kravbatteriet på e12 (startvektene), bånd 0, underveis:** K2 ja · K4 ja (+0,36 av valgene
  endres av hukommelsen, n=36) · K5 NEI — valgene endres (18 %), men V(bak) LAVERE i 129 av 360:
  nettet tar mindre risiko bak, feil retning · K6 nei (z = 1,43). K3, K7, K8 og bånd 1 gjenstår.
  Grunnlinje for kandidaten etter skalatesten.

- **STRUKTURELT FUNN (lest 2026-09-10): MLB trenes mot POENG, ikke mot å VINNE KAMPEN.**
  `docs/mlb.md` §2 sier «Verdi ← KAMPENS utfall» og at K5 ellers «aldri kunne blitt lært».
  Koden: `G_t = sluttpoeng[sete] − poengFør` (selvspill.ts:301/412/445/459/529), diskontert per
  runde (γ 0,5), via `diskontertRetur`/`delteRetur` i mlb-erfaring.ts:402/405. `fasit.vinner`
  finnes (selvspill.ts:211) men leses ALDRI i målet. Ingen doc drøfter poeng-vs-seier som valg.
  Følge: målet er risikonøytralt → ingen gradient mot «bak ⇒ mer risiko» (K5) eller mot
  kampseier (K1). Stemmer med kravbatteriet: e12 tar MINDRE risiko bak (129/360).
  I tillegg: stigen/porten måler POENG i gate 2, mens K1 måles i KAMPER til 100 — et nett som
  lærer å vinne kan se dårligere ut på stigen. → Neste MLB-løp bør ha et seiersledd i målet og
  dømmes også på kampbenken. Skalatesten røres ikke.

- **ARVIND 2026-09-10: ja til å starte MLB fra Adams (unntak fra «ingen mester») og til
  seiersmål (makro) med meso/mikro som hjelpesignaler. «Bare prøv å nå målet så fort som mulig.»**
- **ADAMS-ADAPTEREN VIRKER:** Adams velger identisk på MLBs redigerte stat (`visningTilState`)
  som på ekte stat: 10 kamper til 100, 9 876 beslutninger, 0 avvik, 0 unntak. Adams som
  `egen`-sete i `spillKamp` gir IDENTISK kamp som direkte motorløkke: 8/8 (vinner, poeng,
  runder). Adams uten søk ≈ 0,1 ms/beslutning. Skript: scratchpad `adams-adapter-likhet.mjs`.
  PLAN: (1) `mlb-spill.ts --laerer adams` → (2) `mlb-erfaring.ts` gir rader med Adams' valg
  som etikett → (3) `mlb-gradient.py --imitasjon` (CE på koden, andre hoder som før) fra e12 →
  (4) stigen + kampbenk mot Adams → (5) ettertrening med seiersmål.
  Skalatesten: la epoke 14 bli ferdig, så stopp (dokumentert som avbrutt pga feil mål).
- **IMITASJONSKJEDEN BYGD (D:\amb-kjerne, ucommittet):** `mlb-spill.ts --laerer adams`
  (lærerbord, rapportlinja sier det), `mlb-gradient.py --imitasjon` (NLL mot lærerens kode,
  andre hoder som før) + `pol_treff` i `maal` (samsvar argmaks == kode). Røyktest 40 kamper:
  spill 1,4 s (29 kamper/s på 4 kjerner, 679 beslutninger/kamp), erfaring 27 150 rader,
  imitasjonspass OK (KL 0,10), 0 feil. Typesjekk grønn.
  DATA: 2 700 Adams-kamper (frø 950 000 000 + k·7717, båndet er ledig) → `D:\amb-imit\data`,
  sjanse 1,0 (~1,8 M rader). TRENING: `D:\amb-imit\tren.sh <label> <pass>` fra e12, KL/entropi av.
  Må ikke overlappe skalatestens TREN på GPU (~21:45–22:45).
- Skalatestens ERFARING (epoke 14) diffet mot 127b: bare `--sjanse` 0,5→0,15 og stier. OK.
- **COMMITTET a05366b** (lærerbord + `--imitasjon` + `pol_treff`), 31/31 målrettede tester grønne.
  Data: 2 700 Adams-kamper spilt på 119 s (4 kjerner). Vakt (bakgrunn) starter
  `tren.sh i1 6` når erfaringen er ferdig OG skalatesten fortsatt står i ERFARING.
  MÅLING etter trening: `bash /d/amb-imit/maal-imit.sh i1 [skard] [kamper]` — stigen på
  127b-panelet + kampport mot ADAMS (kontroll 0,2500). Kjør når CPU er ledig (skalatestens TREN).
  `nohup` FINNES i Git Bash (/usr/bin/nohup) — kampport.sh virker; CR strippet i D:\amb-kjerne.

- **10. sep kveld — LINJEN LAGT OM (Arvind: «ikke heng deg opp i gammelkode»).**
  Skalatesten STOPPET i epoke 14 ERFARING (21:10), ikke fullført: den måler gammel linje
  (fra null, poengmål). d7alle/Adams er lærer + målestokk, ingenting vi bygger videre på.
  Forhåndsregistrering med avbruddskriterium: `D:\amb-seier\analyse\seier-forhaandsregistrering.md`.
- **SEIERSMÅLET BYGD i `D:\amb-seier`** (ucommittet): `src/mlb/seier.ts` (GRP: P(seier | tavla, mål),
  `somSeiersmål` bytter poengFør/sluttpoeng mot 100·P), `poengAlleFør` i Beslutningsrad,
  `examples/seier-data.ts`, `verktoy/seier-tren.py`, `examples/seier-paritet.ts`,
  `mlb-erfaring.ts --seier` (MLBE v4: målkode i hodet), `mlb-epoke.py --seier`, gradient krever lik målkode.
  Test `test/mlb-seier.test.ts` 9/9, fem mutanter tatt (etter at «nøkkel uten sete» slapp gjennom først).
  Prediktor `D:\amb-grp\seier-g0.bin`: n=24 000 kamper, holdout CE 1,0867 (uniform 1,3863, stokket 1,3856),
  binært 0,4579 vs rangtabell 0,4934; kalibrert; paritet TS/PyTorch 1,2e-7.
- **i1** (imitasjon fra e12, lr 1e-4, 6 pass, 2 700 kamper): pol_treff holdout 31,9 → 67,4 %.
  Stigen mot ADAMS_MAALT **−1,17 ± 0,43** (e12: −3,24), n=600, 10. sep. Kampport mot ADAMS kjører.
  **i1b** (lr 3e-4, 20 pass) trener. **i2-data**: 8 000 Adams-kamper i `D:\amb-imit\data2` (frø 2e9+).
- **i1 KAMPBENK mot ADAMS: 0,100** (n=100 kandidatkamper, 25 frø, −6,0 SE, tegn 0/15), 10. sep 21:31.
  Imitasjon med 67 % samsvar er langt unna. i1b: samsvar holdout 73,9 % (trening 82,5 %).
- **i1b: stigen mot Adams −0,34 ± 0,41 (n=600); KAMPBENK 0,190** (n=100, −1,44 SE, margin −4,9 ± 5,2), 10. sep 21:41.
  Ikke skillbart fra paritet på n=100 → 1 600-kampers benk (`D:\amb-imit\maal-i1b-1600.log`) for sammenlikning med i2.
  R1 venter på i2: i1b har verdihoder i POENG, og epoke 1s fordel ville blitt regnet mot feil enhet.
- **FEILFUNN (gjennomgang 10. sep): KAMPPORTEN LESTE BARE SKARD 0.** Ukvotert glob i kampport.sh +
  `sys.argv[1]` i kamp-les.py. Rettet i kamp-les.py (leser alle argumenter) + test, commit etter c39973c/0cb6646.
  Omlest: **i1 0,086 (−25,6 SE), i1b 0,204 (−0,046 ± 0,009, −5,19 SE)** på 400 frø. Eldre kampporter omlest i
  `D:\amb-seier\analyse\kampport-omlesing-2026-09-10.md` (eks3-rettet snur fortegn, ikke signifikant).
  Måleskriptene `maal-imit.sh`/`maal-r1.sh` leser nå alle skard selv (kvotert glob mot gammel leser i amb-kjerne).
- Hele suiten på 0cb6646: 658 grønne, 0 røde, 2 hoppet over.
- i1b kravbatteri (kjører): K2 b0 ja; **K3 b0 +8,70 ± 1,32** poeng/runde igjen i budet (e12: +10,64);
  K4 b0 ja (0,17, n=36); **K5 b0 JA** (V(bak) lavere i 230 av 360; e12: 129, nei).
- **GJENNOMGANG 10. sep (Arvind: «sjekk bit for bit»), resultater:**
  - FEIL rettet: kampporten leste skard 0 (f57cbfb). Adams-vrakets rekkefølge var vilkårlig (263/82/1 865
    av 2 210) → kanonisk i læreren, 24/24 kamper identiske (507b8b9). Gjelder data fra og med neste sett.
  - VERIFISERT: Adams-lærer = Adams-dommer (ingen observer i ADAMS-lagene). γ=0,5 riktig også under seier
    (γ=1: rundens andel 13,9 % mot 78,7 %, n=20 kamper). Giverposisjon i seiersprediktoren: CE 1,0860 mot
    1,0867 — innenfor støy, IKKE tatt inn (ville brutt forhåndsregistrert g0). Hele suiten 658/0/2.
  - AVVIK notert: appen menneskene møter er IKKE `ADAMS`-speken (bud-menneske.json + sik-søk 24 verdener i
    førersetet). Å slå ADAMS på benken er nødvendig, ikke tilstrekkelig for K1 — sluttkandidaten må måles mot
    appens kjede.
  - APPENS KJEDE SOM SPEK (fra test/utrullet-lik-spek.test.ts, med appens 24 verdener og bud-menneske):
    `vr:e1-modell/vrakrang.bin:telrd:sik:foerer:0.5:24:budm:e1-modell/bud-menneske.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin`
    Tidsmålt: 1 frø (4 kandidatkamper + kontroll) = 481 s på én kjerne under CPU-last → 100 frø ≈ 50 min,
    400 frø ≈ 3,3 t på 16 kjerner. Laster og spiller uten feil (D:\amb-grp\app-tid.log).
- **COMMITTET c39973c** (seiersmålet) og pushet til arbeidsgrenen.
- Nye flagg (D:\amb-seier, ucommittet ved skriving): `pol_treff_<FASE>` i gradient, `mlb-spill.ts --adams-andel p`
  (kandidat mot tre Adams, bare kandidaten samles — røyk 8/8 riktige bord), `mlb-epoke.py --adams-andel`.
- **i2**: vakt (bakgrunn) venter på data2-erfaringen (`--seier`), røyker treneren, trener i2 fra i1b
  (lr 3e-4, 12 pass, --nullstill-verdi), og måler (`maal-imit.sh i2`).
- **R1-plan**: egen arbeidskopi `D:\amb-rl`. `mlb-epoke.py` som 127b, men `--seier`, `--adams-andel 0.5`,
  `--rask-kjerne`, vekt-stikk/kvantil 1.0, og **INGEN entropigulv** (127b-gulvene 0,55–0,85 ville blåst opp
  en imitert policy med normert entropi 0,04 i budet). KL-bremsen 0,06/0,12 beholdes.

- **i2 (10. sep 22:22): kampbenk 0,225** (400 frø, −2,91 SE), stigen mot Adams +0,18 ± 0,36, samsvar holdout
  75,8 % (SPILL 73,7 % er gapet), verdi i vinnersjanse forklart +0,25. **R1 STARTET fra i2** i `D:\amb-rl`
  (`start-r1.ps1 -Start D:\amb-imit\imit-i2.bin`; fortsett: `-Fortsett`). Dommer: `bash /d/amb-imit/maal-r1.sh 1 6`
  (kampport alle skard + kravbatteri per epoke). Kravbatteri på i2 (grunnlinje) kjører: `D:\amb-imit\krav-i2.log`.
- Kravregel + sansekontroll: se forhåndsregistreringen og `D:\amb-grp\sansekontroll.log`.
- **SANSEKONTROLL (10. sep 22:24, i2-vekter, tro + hukommelse på):** selvspill = Sandkasseagent = `mlb:`-spek i
  kampbenkløkka **6/6 kamper, 5 170 koder** (mål 30/60/100); felle «uten trohode» tatt 6/6. Døde trekk over
  5 979 beslutninger: bare strukturelle konstanter (bias, antall spillere/stikk, talong, iTur) OG to
  DATAHULL: **amerikaner/solo forekommer aldri** (mikro.amerikaner/solo, meso.bud.*.amerikaner/solo …), og
  **etterlyst er alltid et høyt kort** (lave etterlyst-trekk alltid 0). K3/K1-risiko: nettet har aldri øvd på
  de kontraktene, og et menneske som byr dem eller etterlyser lavt gir innganger nettet aldri har sett.
  Eksisterende paritetstest (`mlb-spekagent.test.ts`) kjører UTEN trohode og til 30 → utvidet (ny test med tro,
  kamp til 100, mutant «tronett: null» gir rødt), committet.
- **HULL I TRENINGSFORDELINGEN: INGEN BYR AMERIKANER ELLER SOLO.** Adams: 0 av 2,74 M budvalg i 50 700 kamper
  (i1/i2/i3/seier-data). Ligaens vaner: aldri (`liga.ts:170`). Imitasjonen lærer derfor sannsynlighet ≈ 0, og R1
  vil nesten aldri utforske dem. Solo = ta alle stikk alene, ±100 (= kampen ved mål 100) — nettopp K5-verktøyet
  «bak ⇒ ta risiko». Plan: etter R1 epoke 1, egen arm med utforsking i BUD (entropi bare i budfasen) + mål hvor
  ofte mennesker byr dem (Val Town) før prioritet settes. Nettet må minst FORSVARE riktig mot dem.

- **13:48Z: kravbatteriene på e12 og i1b STOPPET** (ikke lenger kandidater; kravregelen dømmer mot i2).
  Delresultater står i `scratchpad/krav-e12-full.log` (b0 alt, b1 K2–K6) og `D:\amb-imit\krav-i1b.log` (b0 K2–K6).
  i2-batteriet fortsetter (grunnlinjen): b0 K2 ja, K3 +7,90 ± 1,19, K4 ja, K6 kjører.

- **R1 epoke 1 ferdig på 28,5 min** (22:51): KL 0,036, verdi holdout +0,24, stikk +0,87. Porten (gate 2) FORKASTET
  (+0,137 ± 0,379) — styrer bare ligaens «beste», ikke læringen. Kampbenkdom på e1 kjører. Epoke 2 i gang.
- i2-batteri b0: K5 «nei» (150/360), K6 nei (z 1,41). **K5-raden er ugyldig under seiersmålet** — se under.
- **KRAVENES SAMSPILL** (Arvind: upstream/downstream): `D:\amb-seier\analyse\krav-samspill-2026-09-10.md`.
  Tre målekollisjoner: (A) K5-raden dømmer på V(bak)<V(foran), men under ΔP-målet spår V endringen fra tavla → ≈0;
  (B) K8-raden måler den FASTE `mlb-tro.bin`, som R1 aldri endrer; (C) porten dømmer på gate 2-poeng. Pluss:
  trosnettet er trent på ADAMS_MAALT og har ingen hukommelsesinngang (K6→K8 mangler); vaner bare i 15 % av R1-kampene.
  Neste kodeoppgaver (mens R1 går): K5 på policyen, K8 på nettets eget trohode.
- **R1 e1 KAMPBENK 0,2331** (−0,0169 ± 0,0084, −2,00 SE; i2 var 0,2250, −2,91 SE), 10. sep 23:01.
- **K5/K8-MÅLINGENE RETTET** (commit etter a672bf0): K5-retning = forventet budnivå bak − foran på policyen, med
  PLANTET+BUD / PLANTET-BUD som felle (mutant «budgap snudd» tatt); K8 `--sandkasse` = nettets eget trohode.
  Sjekk 16 giv: i2 eget trohode 10,03 % (fila 13,45 %, gulv+ 7,57 %, tilfeldig −7,19 %).
  Nye rader kjøres fra egen målekopi `D:\amb-maal` (amb-kjerne brukes av dommer og gamle batterier).
  Vakter: `maal-r1-k5k8.sh 2 6` (nye K5/K8 per epoke), `krav-ny-i2.log` og `krav-ny-r1-e1.log` (grunnlinje + e1).
- **i3-DATA FERDIG** (14:15Z): 16 000 Adams-kamper, kanonisk vrak, 1 791 676 rader, mål seier, kontroll 0,00 %.
  Vakt trener i3 fra i2 (lr 3e-4, 12 pass) når R1 står i PORT/K2/SPILL (GPU ledig ≥ 20 min), og måler (`maal-i3.log`).
  R1 startes på nytt fra i3 KUN hvis i3 slår R1-epokene på kampbenken.
- **i3 (14:29Z):** samsvar 78,9 % (VRAK 85,0 %), stigen mot Adams +0,01, **kampbenk 0,2131**; parret mot i2
  −0,012 ± 0,011 → IKKE bedre, R1 fortsetter fra i2. Imitasjonstaket er nådd: samsvar ≠ seire.
- **R1 e2: kampbenk 0,2338** (−1,81 SE), port forkastet (gate 2), 27,8 min.
- **PARRET på samme 400 frø:** e1 − i2 +0,008 ± 0,009 (0,9 SE); e2 − i2 +0,009 ± 0,010; e2 − e1 +0,0006;
  i2 − i1b +0,021 ± 0,011 (1,8 SE). R1 har ikke flyttet kampandelen signifikant etter 2 av 6 epoker.
- **NYE K5/K8-RADER** (`D:\amb-maal`, 5eb6857):
  | | K5 b0 (bud bak høyere) | K5 b1 | K8 b0 eget trohode |
  |---|---|---|---|
  | i2 | ja, 280/476, gap −0,010 ± 0,028 | **nei**, 260/478 (p 0,061) | 10,54 % |
  | R1 e1 | ja, 300/476, gap +0,046 ± 0,020 | **ja**, 270/478 (p 0,005), gap +0,035 | 10,79 % |
  Fellene tatt i begge (ingen «stum»). Seiersmålet flytter K5 i riktig retning allerede etter én epoke.
- **MENNESKEDATA (Val Town `hendelser`, lest 10. sep, hele historikken):** menneskenes budvalg (`valg-bud`, n=5 576):
  PASS 2 896, 10: 1 132, 9: 603, 8: 439, 11: 253, 7: 215, 6: 20, 12: 7, 5: 6, **AMERIKANER 3, SOLO 2 (0,09 %)**.
  Vunne budrunder (`budvinner`): menneske 1 732 (10: 61 %, 9: 18 %, **11: 14,5 %**, 8: 5 %, 12: 6, amerikaner 3, solo 2),
  bot 2 896 (10: 64 %, 9: 26 %, 11: 4,7 %, amerikaner 1). → **Amerikaner/solo-armen NEDPRIORITERT** (K3-fullstendighet,
  ikke K1-hastverk). Nytt: mennesker byr 11 tre ganger så ofte som botene — et K4/K6 → K3-signal (les motstanderen).
- **KRAVREGELEN, R1 e1 mot i2 (bånd 0, delvis — 14:43Z):** K2 ja/ja; K3 +8,83 ± 1,22 mot +7,90 ± 1,19 (differanse
  +0,93, ~0,5 SE, innenfor 2 SE); K4 ja/ja; K5 (ny, bud) ja+ja mot ja+nei → BEDRE; K6 stigning 0,061 ± 0,056 mot
  0,069 ± 0,049 → innenfor; K8 eget trohode b0 10,79 % mot 10,54 %, **b1 10,03 % mot 10,03 % → UENDRET** (rettet
  14:46Z: «bedre» var lest på ett bånd). K7 og bånd 1 for K3/K4/K6 gjenstår.
  e1 bryter ingen krav så langt. R1 e3 ferdig på 20,0 min (CPU frigjort etter i3); e3-dom og e2 K5/K8 kjører.

- **ARVIND 10. sep: «klarer du å trene alt samtidig? man klarer ikke å gå med 1 ben».** Svar: nei i dag —
  policy/verdi/stikk/kvantil/eget trohode lærer sammen, men trosnettet (K8), seiersprediktoren (belønningen),
  hukommelse→tro (K6→K8), vaner i befolkningen (K6) og søk (K7) står fast/mangler. **R2 = alt i samme epokeløkke.**
- **R2 KOMPONENT 1 BYGD: trosnettet trenes sammen med policyen** (`mlb-trodata-logg.ts`, `mlb-tro-tren.py --vekter
  --hold-del`, `mlb-epoke.py --tro-tren`). Røyk på R1 e3-logger (2/20 skard): K8-tap på R1-befolkningen
  **0,9531 → 0,9375** etter 2 pass (13,2 % → 14,7 %). Troen VAR foreldet. Test med paringsmutant tatt.
  Merk: holdout `frø % 10 == 0` henger sammen med skard (k ≡ 0 mod 10) → kandidatsete 0/2 i holdout; liten skjevhet.
- **R1 e3: kampbenk 0,2200**, e4 ferdig (17,1 min). e2 nye rader: K5 b0 ja (281/480), **b1 nei (p 0,361)**; K8 eget
  trohode 10,81 % / 10,10 % (flatt). R1 flytter verken kampandel eller K8; K5 svinger mellom epoker.
- **R1 e3 0,2200 (−3,44 SE), e4 0,2169 (−3,76 SE).** Parret: e4 − i2 −0,008 ± 0,010; e4 − e1 −0,016 ± 0,010 (−1,6 SE).
  R1 er på vei NED fra e1. Avbruddskriteriet (6 epoker uten > 0,25) slår etter all sannsynlighet inn ved e6.
- **R2 KOMPONENT 2 og 4 BYGD og committet (56e89dc):** `--seier-tren-hver N` (SEIERDATA → SEIERTREN med
  `--sammenlikn` → SEIERPARITET; godtas bare ved lavere holdout-CE + paritet), `--ligavekter b,t,v`.
  Røyk på R1 e3 (1 200 kamper): seier-g0 CE 1,0678 på R1-kampene mot 1,0720 for ny prediktor på 600 → forkastes,
  som den skal. Belønningen har knapt drevet — lav prioritet. `--ligavekter 0.5,0.5,0.5` kaster (exit 1).
- **DIAGNOSE AV R1 (gradientlogg + erfaringsrapporter e1–e4):** KL ~0,03/epoke (under målet 0,06), entropi flat
  (0,530 → 0,545), norm. budentropi 0,037 → 0,045; verdi forklart på holdout 0,24–0,31 (runde 0,30–0,38, HALE ~0,01),
  |A| ≈ 5,7. → Fordelen er mest støy, policyen tar små UTILFELDIGE steg, og KL-bremsen er relativ til FORRIGE
  epoke, så driften fra i2 akkumuleres uten retning (e1 → e4: −0,016 parret). R2 må ha: (a) mye mer data per
  oppdatering (sjanse 1,0 / flere kamper), (b) lavere λ (mindre varians i fordelen), (c) KL-ANKER mot i2 (straff for
  å forlate imitasjonen uten støtte i fordelen — AlphaStar-formen), ikke bare brems mot forrige epoke.
- **R2 KLAR (11. sep natt):** KL-anker committet (943bd04; kontroll KL før 0,000000, drift 0,0557 → 0,0123 med vekt 5).
  Forhåndsregistrering `D:\amb-seier\analyse\r2-forhaandsregistrering.md` (committet før første kamp). Arbeidskopi
  `D:\amb-r2`. Start `D:\amb-imit\start-r2.ps1` (24 000 kamper, sjanse 0,4, λ 0,8, lr 1e-4, 4 pass, anker i2 vekt 1,
  --tro-tren, --seier-tren-hver 2, ligavekter 0,3/0,2/0,5, mål 60,100,100). Dommer `D:\amb-imit\maal-r2.sh` (leser
  `tro.brukt` fra epokeloggen; kjører fra `D:\amb-maal`). VAKT i bakgrunnen starter R2 + dommer når R1 har epoke 6.
  R1s avbruddskriterium STÅR og rapporteres som det slår.
- **R2 GJENSTÅR:** (2) ~~seiersprediktoren~~ bygd, (3) hukommelse inn i trosnettet (K6→K8, nullvekter
  for nye innganger), (4) vaneandel i ligaen, (5) sterkere RL-signal (flere kamper per epoke) — R1 viser at 12 000
  kamper/epoke ved lr 5e-5 ikke flytter kampandelen.

- **R1 FERDIG (15:35Z, 2,19 t): FEILET etter forhåndsregistreringen.** e5 0,2112 (−4,74 SE), e6 0,2206 (−3,45 SE);
  ingen epoke over 0,25, ingen signifikant over i2. Ført inn i `seier-forhaandsregistrering.md`.
- **R2-VAKTEN STARTET IKKE R2** (bakstreker i `D:\\amb-imit\\start-r2.ps1` ble spist av bash) — startet for hånd
  med PowerShell-verktøyet etter at R1-prosessen var borte. `maal-r2.sh` venter allerede riktig på e1.
- Delkravslista: `D:\amb-seier\analyse\krav-delkrav-2026-09-11.md` (703f714). Agent kjører på menneskedataene.

- **MENNESKENE MOT ADAMS-v5 (agent, Val Town, 23. jul–10. sep, lest 11. sep):** fullførte kamper fra 10. aug
  22/83 = 26,5 % [18,2–36,9] (23/84 med 10. sep). Forlatte: 294 av 376 starter (84,6 % av de forlatte lå BAK,
  51 % sist) → modellanslag med forlatte 23,0 % [18,3–28,4], gulv (alle forlatte = tap) 8,3 % [5,5–12,2].
  Poeng/runde menneske − botsnitt −1,18 [−1,65; −0,70] (2 570 runder). **Budrunden:** mennesket vinner budet 39 %,
  klarer bare 56 % (botene 75 %); bud 11: 36 % klart, −6,2 i snitt (botene 66 %, +7,0). Mennesket henter igjen som
  makker (+5,1) og i motspill (+0,9). **Grunnlaget er i praksis ÉN person** (79 % av v5-kampene fra 10. aug, 100 %
  fra 17. aug). Ingen læring over tid (31 % → 24 %, innenfor støy). `modeller` logget i 1 kamp: bud-menneske, tro av.
  For å VISE < 5 % (95 %): 0 seire i ≥ 74 kamper, eller ≤ 1 i ~110.
  → K1-lever som følger av dataene: straffe menneskets overbud (forsvare hardt mot bud 11 = K6 → K3), og
  motspill/makkerspill der mennesket i dag henter poengene sine.

- **R2 STARTET 15:38Z** (00:38 lokal på maskinen). Tider skrives heretter i UTC (Arvind 11. sep).
- **ARVIND 11. sep, fem føringer:** (1) ikke norsk tid; (2) **søk er et must**; (3) **trosnettet må utvikles:
  oppdatert, koblet opp skikkelig, run-time adaptering**; (4) **alt koden ikke innfrir skal jobbes med og
  legges til rette for**; (5) **nettsiden skal ha den beste boten det er rimelig å tilby — ikke for stor/treg,
  inntil 5 s tenketid per trekk, alt koblet riktig.**
  SPOR: S1 søk ved spilletid på MLB (verdener fra trosnettet, policy-utspilling, verdiblad, tidsramme) → K4.3,
  K7.2, K8 kanal 6. S2 trosnett: R2-trening (pågår) + hukommelse som inngang (K6→K8) + trosnett inn i søkets
  verdener (MLB og Adams `sik`) + RUN-TIME-TILPASNING per motstander per kamp (steg på avslørte kort ved
  rundeslutt, ingen lagring). S3 nettsidens bot ≤ 5 s: kandidater målt parret mot dagens appbot med tid per trekk
  (Adams+trosnett i verdener, søk i flere seter, budsøk, MLB+søk) + rette koblingsfeil (N2 byggUtrullet, N5 nyKamp
  til workeren, N6 stoppeklokke 20 s → 5 s med logget reserve, logge hvilket lag som besluttet); varsle med tall
  før utrulling. S4 alt NEI/DELVIS i `krav-delkrav-2026-09-11.md` som egne oppgaver.
  Kartleggingsagenter i gang: appens koblinger/tid, og søk/verdenstrekking/budsøk.

## Beslutningspunkter

- **Etter skalatesten:** BESTÅTT → MLB er motoren: kjør kravbatteriet på kandidaten (--to-band),
  skaler videre (vurder GPU-bunket spill hvis profilen tilsier det), så K8-hode → K7 → K4-6 → K3.
  IKKE BESTÅTT → mlb.md §8 (nuclear-beslutning). Alternativer: veiledet oppstart fra Adams
  (bryter «ingen mester» — krever Arvinds ja) eller bygge K-kravene på dagens moe2-stakk.
- K1-lever på dagens stakk som er MÅLT: budsøk K=240 +2,004 ± 0,586 (z 2,83, begge bånd),
  89 % av gevinsten er «by 9 i stedet for 10» (AdamsMax.md, revisjon 8. aug). Budmodellen sist
  etter Arvinds rekkefølge.

## Regler som gjelder (repoets egne)

Parret, disjunkte frøbånd, tegntest, kontrollarm 0,0000/0,2500. Resultater til varige filer.
Aldri les en kjøring før den er ferdig. Målt = utrullet. Én arbeidskopi per langløp.
Windows-feller: CRLF i .sh (core.autocrlf=true), MSYS_NO_PATHCONV=1 for wsl.exe fra Git Bash,
spekstrenger tåler ikke absolutte stier med «D:».

- **MERK (14:55):** flere tidsstempler 13:50–15:26 over var skrevet foran maskinklokka; rettet til faktisk tid (≈).
- **~15:05: agent E ferdig (e5ad5f1) – flettet som 09c6567**, tsc rent. `examples/mlb-krav.ts --spek <helbot> [--to-band]
  [--kjapp] [--bare k1,…]` kjører K1 (duplikat mot menneskerundene), K2 (`k2-spek.ts`, kontroll + jukserfelle), K3.1/K3.4/
  K3.6/K7 (`tak-kart.ts` med gjenbruk og nodetak), K4 (`k4-hukommelse --spek`), K5 (`k5-retning.ts`, plantede feller),
  K6 (`k6-vaner`), K8 (`mlb-k8` + `sok-verdener`) → én rapport (.tsv/.txt/.json). Anslått ~17 CPU-timer per bånd.
  Røyk (bitte liten): K2 0 avvik, K5 BudQ byr +1,5 høyere bak (p 0,125), K8 12 % av veien.
- 15:15: `duplikat-menneske.ts` rettet – hukommelseslesere kastet når en logg-runde ble hoppet over; nå spilles slike
  runder uten å bli rader, og `--etter <dato>` (K1-raden sender 10. aug). Røyk med helboten: ingen kast.
  `adams-max-krav.sh <k>` venter på «[iter k] FERDIG» og kjører batteriet på helboten med nettene k+1 fra en egen
  arbeidskopi `D:\amb-krav-batteri` (løkkekopien røres ikke mens den kjører).
- Løkka iter 0 kl. 15:09: tro-data ferdig (950 MB, 920 bredt), vrak+kall 67/150 kamper per skard, bud 12/100 per skard
  (flaskehalsen, ~2 t). Kampbenken helbot mot tre B0: 242/400.
- 15:20: E-prøvene etter fletting 35/35; grenen pushet (88b34c8). `adams-max-krav.sh 0` startet i bakgrunnen – venter på
  iterasjon 0 og kjører så hele kravbatteriet (K1–K8, to frøbånd) på helboten med nettene fra iterasjon 1.
- **EIEREN ~15:30:** «tenke mens de andre spiller» – ikke bygd; tas i app-/destilleringsfasen (eieren enig). Spør om troen
  skiller mellom det den VET og det den TROR, og om hukommelse → tro (K6 → K8) er i boks. Svar (sjekket i koden):
  (1) i søket JA – verdenene trekkes med harde fakta (renonser, kort igjen, dødt vrak, etterlyst aldri hos budvinneren,
  sampler.ts), troen vekter bare mellom lovlige verdener; men trosnettets EGEN fordeling er ikke maskert med faktaene, så
  K8-tallet (13,4 %) teller sannsynlighet på umulige plasser – gratis forbedring. (2) Kablingen hukommelse → tro er på
  plass (920-nett i søket, bokføring ved rundeslutt, K2-trygg), MEN hukommelseskolonnene starter på null og trenes først
  nå, og løkkas data har SAMME bot i alle seter – få vaner å lære (målt før: gevinst bare i blandet befolkning).
  **Agent G startet (D:\amb-agG):** faktamaske for troen (`fordelingMedFakta`, `nett_fakta` i mlb-k8, renonser i sok.ts) +
  motstanderbefolkning med ulike vaner i datagenereringen (`--drivere`/`--motstandere` i budq-/vrakq-/mlb-trodata).
- **EIEREN ~15:35 – VISJON (senere fase, men del av Adams Max):** tro/læring/hukommelse skal også tilpasse seg motstanderens
  vaner PÅ TVERS AV KAMPER ut fra en spillerprofil – «som en amiibo i Smash Bros som blir bedre og lærer vaner». Finnes ikke.
  KONFLIKT med dagens krav: K2.5 og K6.7 («ingen lagring på tvers av økter», testhåndhevet) – må endres av eieren før det
  bygges. Kontakten finnes: hukommelsesblokken (144/motstander) som budq 287 og tro 804/920 leser kan fylles fra en lagret
  profil ved kampstart. K2 holder så lenge profilen bare bygges av ferdige kamper.
- **15:57 KAMPPORT B1 (push-helbot) mot 3×B0 (prod), 100 frø × 4 seter:** vinnerandel 0,2250 mot 0,2500,
  −0,025 ± 0,015 (−1,64 SE), tegntest 12 opp/23 ned (z −1,86), sluttmargin −2,9 ± 2,5. Ikke signifikant, men samme retning som
  mellomtallet (−0,020). Mot MENNESKER er B1 bedre (duplikat +1,08 mot +0,86, parret +0,23 ± 0,14).
  Tolkning: B1 er trent på data der alle seter spiller som den selv; sammen med/mot bots som spiller annerledes
  (B0) treffer lagmålet og troen dårligere. Det er nøyaktig hullet motstanderbefolkningen (agent G) skal tette → iterasjon 1
  bruker befolkningen. B1 rulles IKKE ut. Kampporten mot prod tas med som lett sjekk etter hver iterasjon (ikke modulbenk).
- **16:03 ITERASJON 0 FERDIG** (nett 1 skrevet, alle tre nye sha1):
  - bud: gevinst mot policy +0,026 ± 0,017 poeng/budbeslutning, enig 91 % → budq-1.
  - vrak: anger 1,5638 < policy 1,7308 → vrak-1. Etterlyst: modell = regel (0,5246) → regelen beholdes.
  - tro: K8-tap 0,9117 → 0,9107 (beste epoke 1; holdout blir verre fra epoke 2 = overtilpasning, dataene fra likespill
    har lite nytt). Statuslinja «TRENT tro:» ble tom fordi grep leter etter «beste epoke», men tro-loggen skriver «beste holdout».
  - TIL ITERASJON 1 (kopi av skriptet): rett grep-en; tro 3 epoker / lr 1e-4 eller mer data; befolkning fra agent G.
- 16:05 kravbatteriet på helboten med nett 1 starter (adams-max-krav.sh 0), deretter kampsjekk mot prod.
  16:07 bekreftet: 21 node-prosesser (K1-duplikatet først) fra D:\amb-krav-batteri.
- 16:06 D:\amb-loop spolt fram til 88b34c8 (bare CRLF-støy lokalt, ingen innholdsendring). Skriptet for iterasjon 1 er
  D:\amb-imit\adams-max-loop-v2.sh: `BEFOLK="<flagg fra agent G>"`, tro 4 epoker/lr 1e-4, riktig grep, batteri +
  kampsjekk til slutt i samme skript. Startes når agent G er flettet inn i krav og D:\amb-loop, og etter at
  batteri + kampsjekk for iterasjon 0 er ferdige (kjernene).
- **~16:30 AGENT G FLETTET** (krav c73a414, pushet; D:\amb-loop spolt fram). Byte-identisk uten flagg (6 røyker).
  - Del 1 «vet/tror»: `src/mlb/trofakta.ts` + `maskerFordeling`, `MlbTronett.fordelingMedFakta`, `sok.ts {fakta}`,
    `mlb-k8 --fakta`. To fakta sampleren manglet: bydder uten trumf når hun leder stikk 1 uten trumf; makkerplikt i stikk 1.
    Effekt på tronettet: tap 0,9377 → 0,9372 (z 2,4) – nettet har lært nesten alt; masken er en garanti. Ikke brukt i trening/spek ennå.
  - Del 2 befolkning: `--drivere "A|B|C|D"` (`@` = kandidaten, bare @-seter registreres) + `--rotasjon` i budq-/vrakq-/mlb-trodata.
  - FUNNET: `mlb-trodata --kamp --kamper` er SLUTTINDEKS → v1-løkka ville gitt 0 trokamper fra iterasjon 1. Rettet i v2.
  - Tester i D:\amb-loop: populasjon 5/5; trofakta feilet bare på manglende e1-modell/mlb-tro-signal.bin (kopiert inn).
- v2 nå: 3 bord `@|ADAMS|@|MENN`, `@|GBT|@|SPAR`, `@|HOY|@|MENN` (nevro utelatt), tro [k·450,(k+1)·450), stopp ved tom datafil.
  Iterasjon 1 starter automatisk når «[kampsjekk 1] FERDIG» står i status.
- Åpent fra G: maske i tro-treningen, parvise «bare dette setet kan»-fakta, K8-raden med `--fakta`.
- **16:30 KRAVBATTERIET, helbot med nett 1 (D:\amb-grp\loop\iter0\krav.txt): 5 av 19 rader lukket, 7 stumme.**
  - K1 +1,01 ± 0,24 pp/runde (halvdeler +0,84/+1,20) – men STUM: 10 av 20 skard krasjet (Søketro: runde N aldri
    vist som RUNDE_SLUTT i duplikatet), så bare 1764 runder/197 kamper. Fella (nevro) tatt.
  - K2 JA/JA. K5 JA/JA (bak byr +2,3 høyere, 227/2).
  - K3.1 NEI: +10,8 / +11,2 poeng/runde igjen i budet (Adams +9,9 / +8,8 i samme vindu – ikke bedre).
  - K3.4 trumfvalg +0,67 (JA bånd 1, stum bånd 0). K3.6 midtspill stum/NEI (trær kappet). K7 stum (157/160 trær kappet).
  - K4 STUM: nullarmen krasjet (sik-speken beholdt «M» uten «okt:»).
  - K6 NEI: stigning z 0,31 / 0,18.
  - K8 NEI: 15,4 % av veien (terskel 25 %); søkets verdener +6,5 pp riktige kort mot appens.
  → Agent H (D:\amb-agH, fra c73a414) retter K1-krasjet, K4-nullarmen og kappingen i K7/K3.6.
  → v2 kjører nå batteriet fra D:\amb-krav-batteri etter `git merge --ff-only krav-2026-09-11` der.
- **16:56 AGENT H FLETTET** (krav b82c1ae, pushet): K1-krasj = rundeslutt som ble FERDIG når boten passerte 100
  (vises nå som RUNDE_SLUTT, hull gir ny bok); K4-nullarm: `utenØktmotstander` fjerner M. OBS: K6-nullarmen målte
  før bare profil:+tronett, ikke M. K3.4 60 giv, K7 120 giv ukappet (250 noder), K3.6 ukappet 12 giv (fortsatt svak).
  Batteriet ≈ 34 min. v2 spoler batterikopien fram til dette før batteriet i iterasjon 1.
- **EIEREN ~16:45 om hvert krav:** K1 = resultatet av alle de andre. K3.1: bygg på Adams, vi skal ikke ligge bak;
  nok data → matematisk optimal budmodell. K3.4 + vrak: skal løses. K3.6/K7: jobb videre. K4: spent. K5: pass på at det
  faktisk virker (ikke bare retning). K6: starter svakt, blir bedre utover kampen; PRIORITET MOT MENNESKER. Profil =
  bygges i løpet til 100 + historikk fra appens spillerprofil (finnes ikke lenger, bare nevnt). K8: spurte hvilke sanser som mangler.
- FUNNET: K3.1-taket er KLARSYNT (tak-kart forgreiner på den ekte given) → porten kan aldri lukkes; gapet +10,8 er
  mest informasjon. Bot vs Adams i samme vindu 10,8 vs 9,9 på 8 giv = støy, ikke «bak».
- **16:58 agent I** (D:\amb-agI): menneskedata → tro. `menneske-tro.ts` (K8 og K6-signaturen på ekte menneskekamper,
  ren prediksjon), `mlb-trodata --menneske` (treningsrader), rader K8-/K6-menneske i batteriet.
- **16:58 agent J** (D:\amb-agJ): informasjonsrettferdig budtak (Bayes-optimalt bud over verdener fra setets syn) +
  parret bot-bud mot Adams-bud med likt kortspill; K3.1-porten flyttes til det rettferdige taket.
- K5 «virker det»: splitt K1-duplikatets ΔP(seier) på bak/foran når K1 har fulle data (etter iterasjon 1-batteriet).
- **~17:40 AGENT J** (agJ 4bb3d13; agenten stoppet mens jobbene gikk, tallene regnet av meg fra D:\agJ-ut\maal2):
  `examples/naabart-bud.ts` + tak-kart `--naabart W --naabart-spek --mot-spek --seier --uten-tak`; K3.1 dømmes mot
  det NÅBARE taket (ensidig), ny rad K3.1-Adams (budduell). 30 giv × 4 seter per bånd, W=32, fortsettelse = policy uten søk:
  | | bånd 0 | bånd 1 |
  |---|---|---|
  | nåbart gap (bot under beste bud over 32 verdener) | −0,72 ± 0,67 | +0,08 ± 0,79 |
  | felle alltid-pass | +1,83 ± 0,60 TATT | −0,23 ± 0,72 SLAPP UNNA |
  | W=8 → W=32 (12 giv) | −2,40 → −1,46 | −1,23 → −0,52 (taket blir sterkere med W, ikke konvergert) |
  | bot − Adams-bud, poeng/runde | +0,95 ± 0,47 | −0,30 ± 0,59 |
  | bot − Adams-bud, seiersmål (pp) | +0,73 ± 0,29 | +0,26 ± 0,36 |
  | duellfelle (uten søk − pass) | +2,59 ± 0,66 TATT | +0,08 ± 0,98 SLAPP UNNA |
  Lesning: boten ligger IKKE bak Adams i budet (samlet ≈ +0,3 poeng, +0,5 pp seier). Det nåbare taket med 32 verdener er
  ennå svakere enn BudQ, så «ja» betyr «ikke slått av dette taket», ikke «optimalt». Bånd 1 har for lite styrke (fella slapp).
  maal3 (eksakt fortsettelse, ~12 min/giv) kjører fortsatt i D:\amb-agJ.
- **~17:50 J ferdig, krav db49e6d pushet** (tester 20/20). Samlet 60 giv: nåbart gap −0,32 ± 0,51; bot − Adams
  +0,33 ± 0,39 poeng, **+0,49 ± 0,23 pp seier**. Fella er nå en OVERBYDER (`budm@-99`: gap +7,6 / +12,2, duell +9,0 / +12,7);
  «alltid pass» bare kontekst (koster bare +0,80 ± 0,48, porten ser ikke så små feil). Batteriet: 48 giv × W=32 ≈ 5 min,
  porten sier «nei» først over ~1,0–1,2 poeng/runde. Forbehold: verdenene spilles av helboten uten søk; ΔP bare fra 0-0
  (K5-budene mot stillingen øves ikke i denne raden). Full helbot i verdenene ~700 s/giv – stoppet.
- **17:48 KAMPSJEKK helbot (nett 1, okt/profil/M/D) mot 3× prod:** vinnerandel 0,2700 (+0,020 ± 0,020, +0,98 SE),
  tegntest 31/26, sluttmargin **+6,2 ± 2,9 (+2,17 SE)**. Snudd fra push-helboten 15:57 (0,225, −1,64 SE).
- 17:48 ITERASJON 1 startet (v2, befolkning 3 bord).
- **~17:48 AGENT I FLETTET** (krav 4e52287, pushet, 32/32 tester; konflikt i krav-helbot.ts løst: J sine budlag + I sin
  menneske-logg). Menneskedata: 2640/2641 runder gjenskapt (budrunden spilles om med v5-byderne og menneskets tvungne bud).
  tro-1 på 273 menneskekamper: K8 menneskets kort 18,07 ± 0,53 % (null 18,00, fakta 18,18); alle seter 19,85 %.
  K6-MENNESKE NEI: minnegevinst +0,077 ± 0,014 pp, stigning z 1,27 (halvdeler 1,21/0,45). Fella (minne fra annen kamp) tatt.
  Finjustering (lr 1e-4, menneskerader + én botfil): menneske-holdout K8 **+1,26 ± 0,22 pp**, bot-holdout uendret, MEN
  minnegevinsten ble negativ (−0,22 ± 0,07) = minnet overtilpasser på én hovedspiller.
  Rader: trening 95 283 (213 kamper), holdout 31 258 (60 kamper). Nye rader: K8-menneske (rapportert), K6-menneske.
- PLAN ITERASJON 2 (v3): K sine sanser (nye bredder) + menneskerader regenerert i ny bredde + tiltak mot minne-
  overtilpasning (minne-dropout på menneskeradene i mlb-tro-tren, eller vekting) + tro-holdout som også dømmer på menneske-holdout.
  Ikke i iterasjon 1: v2 kjører allerede, og K endrer bredden.
- **17:52 UTRULLET v13 (tenketid-logging, agent L 67dc9d7):** `claude/lokal-trening-oppsett` 5da28e9 → 67dc9d7 (fast-forward),
  Val Town-pinnen flyttet til 67dc9d7, GitHub raw har v13 i både app.js og index.html. Bare logging: `valg-*` får
  skjultMs/ufokusMs/angre (> 0), `runde` får `tempo` [{fase B/V/T/S, stikk?, ms, …}]; botenes tid står fortsatt i `bottrekk`.
  Klokka starter når kontrollene er tegnet (ikke ved forrige handling; fella fanget i ekte nettleser). K2: tempo.ts
  importeres bare av app.ts (test). 46/46 tester. Å SJEKKE ved neste ekte kamp: `runde`-rader med `tempo`, `start.bundel` v13.
  Kjent gammel feil (ikke rettet): to trykk på «Neste runde» i stikkpausen gir en konsollfeil.
  Tempo-SANSEN bygges først når det finnes nok logget menneskespill (bots har ikke tempo).
- 17:55 iterasjon 1 helsesjekk: 0 feil; tro 450 kamper (75/skard, ~20 k rader/skard – halve rader per kamp med 2 @-seter).
- **~18:00 EIEREN: «hvordan kan vi jobbe enda videre, gjøre oss enda bedre?»** Prioritert svar:
  1. KORTSPILLET I LØKKA (ekspertiterasjon): d7alle (e1-laget) er ALDRI trent om i løkka; laget av e1-orakel
     (24 verdener × eksakt 7 stikk, egenpoeng, NevroHjerne-partier). Helbotens søk (tro, lagmål, M) merker kortvalg →
     nytt kortnett → sterkere grunnpolicy for søket og utspillingene. → **agent M startet** (D:\amb-agM, fra 4e52287).
  2. Menneskedata i løkka (iterasjon 2, etter K) + en MENNESKEKLON (imitasjon fra 2640 runder) i befolkningen.
  3. Sterkere søk ved spilletid (Adams Max får bruke regnekraft): flere verdener, eksakt sluttspill 3 → 5 stikk,
     budsøk; dømmes på helheten (duplikat + kampsjekk) etter iterasjon 1.
  4. Budetiketter fra fortsettelse MED søk/eksakt sluttspill (i dag POL uten søk undervurderer kontrakter helboten klarer).
  5. Profil på tvers av kamper (amiibo) – krever at eieren endrer K2.5/K6.7.
  6. Flere menneskekamper (K1-tallet og menneskedata).
- **17:59 AGENT K FLETTET** (krav 6852e83, 49/49): tro 996 = 920 | stilling A (36, 9 per sete) | valgt bort B (40,
  10 per sete); BudQ 323 = 287 | A. K2-test bytter hender + vrak + talong for alle ikke-budvinnere (+ feller for vrak,
  talong, ekte makker). Trenerne utvider 920→996 / 287→323 med nuller bakerst. VrakQ ikke utvidet.
- KOBLINGSFEIL funnet og rettet: `--sanser2` krevde `--kamp`, `--menneske` avviser `--kamp` → menneskerader kunne ikke
  skrives i 996. Rettet + mlb-tro-tren `--tren-menneske --hold-menneske --minne-dropout` (epoken velges på snittet av
  bot- og menneske-holdout; TRO-*-linjer sist). Røyk OK i WSL.
- 18:03 BATTERIKOPIEN hadde CRLF-støy i verktoy/ som STOPPET `merge --ff-only` (budq-tren/mlb-tro-tren endret av
  commiten) → iterasjon 1-batteriet ville målt med 88b34c8. Ryddet (bare linjeslutt) og spolt til fae4074.
  v3 rydder og spoler både D:\amb-loop og batterikopien selv (`spol`), stopper ved ekte lokale endringer.
- 18:05 MENNESKERADER 996 ferdige (D:\amb-grp\menneske\rader996): trening 48 563 rader (213 kamper, 1 runde avvist),
  holdout 15 936 (60 kamper). Standard `--sjanse` gir ~halvparten av agent I sine 95 k.
- **v3 (D:\amb-imit\adams-max-loop-v3.sh) startes automatisk når «[iter 1] FERDIG» står**: sanser2 i bud/tro,
  budq-tren --dim 323, tro med menneskerader + --minne-dropout 0.5 (epoke på snitt bot/menneske), batteri + kampsjekk.
- **18:13 ITERASJON 1 TRENT:** bud +0,063 (start 0,0015) → budq-2; vrak 1,77 < 2,02 → vrak-2; etterlyst regel;
  tro 0,9236 → 0,9214 (epoke 1) → tro-2. 18:13 batteriet startet på fae4074 (UTEN K2-fiksen under).
- **~18:35 AGENT M FLETTET** (krav fb82d97, pushet; 44/44 + 1 hoppet over):
  - **K2-LEKK FUNNET OG RETTET** (381df73): `medVerden` (src/moe2/sdkort.ts) lot det EKTE vraket stå ved siden av
    verdenens hender; budvinnerens konvensjonsvakt leser vraket i utspillingen → en forsvarers/makkers søk spilte
    budvinneren med de ekte byttekortene. Nå er vraket i verdenen «kortene til overs» for ikke-budvinnere. Traff 1 av 24
    sammenlikninger. **Prod er IKKE rammet**: appen søker bare når aktør === budvinner (`børSøke`). Helbotens tall
    (K1 +1,08/+1,01, kampsjekk 27 %) er målt MED lekken (liten effekt, men iterasjon 1-batteriet også) – iterasjon 2 måles uten.
  - Hukommelsens vrakvaner leses ved RUNDE_SLUTT: da er alle 48 spilte kort offentlige, så de 4 uspilte ER vraket
    (utledbart ved korttelling) – ikke juks.
  - Kortspill-ekspertiterasjon: d7alle = sd-tren (273 → 512/384/256 → 52, appformat). `examples/kort-data.ts` merker @-setenes
    kortvalg med søkets lagverdi per kort; `sd-tren --vekter`; port = anger mot søkets beste kort. Røyk (12 kamper):
    anger 0,8837 → 0,8632 (for lite til å stole på), spilte uten feil. Kostnad ~0,37 s per merkelapp.
  - Legges i v3 (iterasjon 2): 20 skard × 25 kamper etter de andre generatorene (~60 min), sd-tren etter tro, helboten
    i batteriet får kort-K+1. Befolkningen og B0 beholder d7alle.
- **18:56 BATTERI ITERASJON 1** (nett 2, kode fae4074 = alle målefikser, MEN med K2-lekken i medVerden): 10 av 23 lukket, 2 stumme.
  | rad | bånd 0 | bånd 1 | dom |
  |---|---|---|---|
  | K1 duplikat (2641 runder, 273 kamper) | +0,86 ± 0,20 pp (halvdeler +0,65/+1,10) | – | raden sa JA, men avtalt port ≥ +1,0 z ≥ 3 → NEI |
  | K2 | 0 avvik | 0 avvik | JA |
  | K3.1 nåbart gap | −0,16 ± 0,47 | −0,20 ± 0,56 | JA (overbyfella tatt) |
  | K3.1-Adams (poeng / pp) | +0,45 / +0,38 | −0,22 / +0,02 | JA |
  | K3.4 trumf (klarsyn) | +1,18 (Adams +1,37) | +1,33 (Adams +1,37) | NEI |
  | K3.6 midt (klarsyn) | +1,46 (fella slapp) | +5,31 (Adams +4,98) | STUM/NEI |
  | K4 prøve A | 8,2 % endret | 5,2 %, nullarm 1/174 ulik | JA/STUM |
  | K5 | +1,95 | +1,86 | JA |
  | K6 bot | z 1,05 | z −0,36 | NEI |
  | K6-menneske (troen) | stigning z 2,19 (halvdeler under 2 SE) | – | NEI (nær) |
  | K7 slutt (klarsyn) | +0,31 ± 0,14 (Adams +0,64) | +0,50 ± 0,20 (Adams +1,55) | NEI, men klart bedre enn Adams |
  | K8 | 15,35 % | 15,51 % | NEI (terskel 25 %) |
  | K8-menneske | 18,44 % (null 18,32) | – | rapportert |
- **20:12 KAMPSJEKK ITERASJON 1** (nett 2 mot 3× prod): vinnerandel 0,2625 (+0,013 ± 0,019, +0,65 SE), tegntest 25/23,
  sluttmargin +5,5 ± 2,6 (+2,11 SE). Omtrent som nett 1 (0,270, +6,2). Iterasjon 1 FERDIG 20:12 → v3 (iterasjon 2) starter.
- **22:06 ITERASJON 2 TRENT** (v3, alt samlet): bud 323 +0,047 → budq-3; vrak 1,86 < 2,04 → vrak-3; etterlyst regel;
  tro 996 med menneskerader + minne-dropout: bot-K8 0,9174 → 0,9167, MENNESKE-K8 0,9320 → 0,9284 (−0,0036) → tro-3;
  KORTNETT anger 0,8077 < 0,8195 (d7alle) → kort-3 (første kortnett fra søket). 22:06 batteri startet på fb82d97
  (K2-fiksen med, men GAMLE porter for K1/K3.4/K3.6/K7 og K4-nullarmen).
- **22:13 AGENT N FLETTET** (krav 1ef96d8, pushet, 45/45 + 1 hoppet over): K1-port ≥ +1,0 pp og z ≥ 3; K4-nullarm skrur av
  BudQ-nettets egen motstanderbok (`budq:<fil>h0`, 1/174 → 0/173); nåbare tak K3.4/K3.6/K7 (`examples/naabart-handling.ts`,
  feller: korteste farge som trumf, lavest kort, `verst`). Moderat utvalg: K3.4 bot +0,63/+1,88 (Adams +0,63/+1,25),
  K3.6 +0,46/+0,77 (svak styrke, ser bare grove feil > ~1,3), K7 +0,30/0,00. Batteriet +~8 min.
- **22:51 BATTERI ITERASJON 2** (nett 3 inkl. kort-3 og tro-3 996, kode fb82d97 = K2-fiks, gamle porter): 9 av 23 lukket, 4 stumme.
  | rad | it. 1 (nett 2) | it. 2 (nett 3) | lesning |
  |---|---|---|---|
  | K1 duplikat | +0,86 ± 0,20 | +0,82 ± 0,18 | flatt, under +1,0 |
  | K3.1 nåbart / mot Adams pp | −0,16/−0,20; +0,38/+0,02 | +0,71/+0,16; +0,18/+0,22 | JA |
  | K3.4 klarsyn | +1,18/+1,33 | +1,18/+0,83 | NEI (gammel port) |
  | K3.6 klarsyn | +1,46/+5,31 | +0,31/+4,17 | stum/NEI |
  | K4 | JA/stum | stum/stum | BudQ-boka i nullarmen (N har rettet) |
  | K5 | +1,95/+1,86 | **+2,76/+2,79** | JA |
  | K6 bot | z 1,05/−0,36 | z 0,31/0,20 | NEI |
  | **K6-menneske** | stigning z +2,19, nivå +0,12 pp | **stigning z −5,34, nivå −0,23 pp, fremmed bok bedre** | TILBAKEGANG: minnet skader nå |
  | **K7 klarsyn** | +0,31/+0,50 | **+0,78/+0,81** | verre (kort-3 eller støy) |
  | **K8 selvspill** | 15,35/15,51 % | **13,89/14,15 %** | verre (−1,5 pp) |
  | K8-menneske | 18,44 % (null 18,32) | 19,76 % (null 19,99) | bedre totalt, men null > med minne |
  Lesning: menneskeradene hjelper prediksjonen av mennesker (+1,3 pp), men minne-dropout 0,5 lærte nettet å bruke minnet
  feil på mennesker. K8-fallet på selvspill kan delvis være fordelingsskift: tro-3 er trent på data spilt med d7alle, men
  batteriet spiller med kort-3 (iterasjon 3 genererer data med kort-3). K7-økningen må følges – kortnettets port er anger
  mot søkets merkelapper, ikke sluttspillet.
  → **v4** (iterasjon 3): `--minne-dropout 1.0` = minnet alltid nullet i menneskeradene (minnet læres bare der det er
  riktig merket, i selvspillet; nett 2 hadde positiv K6-menneske). v3 endres ikke (kjører iterasjon 2).
- 23:35 gammel iterasjon 3-venter (v3) stoppet; ny venter starter **v4** når «[iter 2] FERDIG» og «[nyeporter 3] FERDIG» står.
- **23:45 EIEREN: «ikke der vi ville ende opp, men det er fremgang 🙂 jobb videre og la oss prøve å komme oss i mål.»**
- 23:47 maskinen: 24 logiske kjerner, 100 % last (kampsjekk 22 + nyeporter 10), 13,5 GB fritt av 31 GB.
- 23:50 v4 endret FØR start: kampsjekken (~100 min/iterasjon, flatt 0,270 → 0,2625) byttes mot K1-duplikat på to
  søkevarianter av hele boten: W48 (48 verdener) og E4 (eksakt sluttspill fra 4 stikk, blad e4). Kortere iterasjoner.
- 23:50 **agent O** (D:\amb-agO): kortnettet leser hukommelsen + sanser 2 (K6), per-fase anger og port som krever at
  SENT-angeren (stikk 7–11) ikke blir verre (K7-fallet etter kort-3).
- 23:50 **agent P** (D:\amb-agP): informasjonsrettferdig K8-tak = Bayes-posterior med kjente policyer (SMC over
  verdener), K8 som % av veien gulv → rettferdig tak; forslag til port (eieren bestemmer terskelen).
- **00:16 (12. sep) AGENT O FLETTET lokalt** (09179f8): kortnett-bredde 493 = 273 | hukommelse 144 | stilling 36 |
  valgt bort 40 (egen liste utenfor 273→714-kjeden; ≥ 558 betyr sanseblokk der). `e1:` velger trekk etter bredde;
  `Konvensjonsvakt` sender nå `observer` videre (ellers nådde boka aldri kortlaget). `kort-data --bredde 493`,
  sd-tren per-fase anger (TIDLIG/MIDT/SENT). Røyk 493: total 0,9045 mot 0,9047, SENT likt. 5 tester feilet bare på
  manglende e1-modell/kort-3.bin i krav-kopien.
  RISIKO før 493 i løkka: alle benker som spiller et 493-nett må kalle `observer` ved RUNDE_SLUTT (ellers kast i runde 2);
  K4-nullarmen har ingen bryter for kortnettets bok (samme feil som BudQ hadde). → iterasjon 3 beholder 273.
- 00:16 v4 (før start): kortporten krever total anger bedre OG SENT-anger ikke verre (K7-fallet etter kort-3).
- **00:26 KAMPSJEKK ITERASJON 2** (nett 3 med kort-3, K2-fiksen): vinnerandel **0,2850** (+0,035 ± 0,021, +1,64 SE), tegntest
  31/23, sluttmargin +5,9 ± 2,9 (+2,02 SE). Beste mot prod hittil (0,270 → 0,2625 → 0,2850). Iterasjon 2 FERDIG 00:26.
- 00:27 v4-venteren stoppet (ventet også på nyeporter, som bare bruker 10 kjerner) → iterasjon 3 (v4) startes med én gang.
- **00:46 NYE PORTER PÅ NETT 3** (N sin kode, D:\amb-agN, iter2/krav-nyeporter.txt): **11 av 13 lukket**.
  | rad | bånd 0 | bånd 1 | dom |
  |---|---|---|---|
  | K1 (port ≥ +1,0 og z ≥ 3) | +0,82 ± 0,18, z 4,56 | – | NEI |
  | K3.1 nåbart / Adams-duell | JA / JA | JA / JA | JA |
  | K3.4 nåbart | +0,33 ± 0,24 (Adams −0,33) | −0,17 ± 0,37 | **JA** |
  | K3.6 nåbart | −0,39 ± 0,58, felle «lav» +0,99 ± 0,67 slapp | +0,65 ± 0,48 (Adams +0,82) | STUM / JA |
  | K4 prøve A (nullarm 0/172) | 15,5 % endret | 8,7 % | **JA** |
  | K7 nåbart | **+0,02 ± 0,01** (Adams +0,34) | +0,42 ± 0,36 (Adams +0,51) | **JA** |
  Samlet for nett 3 med nye porter: K2 JA, K3.1/K3.4/K7 JA, K3.6 halvt (styrke), K4 A JA, K5 JA; NEI: **K1, K6, K8**.
- **01:05 Q FLETTET** (krav faeb385, pushet, 63/63 + 2 hoppet over): `e1:<fil>h0` i nullarmen, observer videresendt i
  budm:/ork:/vv:/vv2:/etl:/juks:, sok-verdener --kamp viser driverne hver tilstand (K8-søkeverden-tallet endres: BudQ/profil i
  driverne spilte før på tomme bøker). Standardveier byte-identiske, også med kort-3 nullutvidet til 493.
- 01:02 **v5** (iterasjon 4): som v4 + `kort-data --bredde 493`. K3.6-fella byttes fra «lav» til «verst» i krav-helbot.
- 01:04 K3.6-fella pushet (krav 3582f71, mlb-krav-spek + naabart-handling 22/22). Iterasjon 3-batteriet spoler batterikopien
  fram før start, så det får Q sin kode og «verst»-fella.
- **~01:35 AGENT P2 FERDIG** (agP 928b771, 722cf01): EKSAKT rettferdig K8-tak sent i runden (faktorisert telling: deler som
  ikke gjenskaper bud/kort kastes; talongvalget summeres som vekt for ikke-budvinnere). Kutt 1e6 fordelinger → dekker
  budvinner stikk 7–9 og alle stikk 8–9 = 128 av 384 K8-stillinger. Drivere i kanonisk form (sorterte hender, frø 0),
  ellers var den ekte given «inkonsistent» i 5 av 24 kamper (likhet brutt på plass i hånden).
  | stikk | nett-tap | rettferdig tak | nett → perfekt | nett → rettferdig tak | taket → perfekt |
  |---|---|---|---|---|---|
  | 7 (budvinner) | 1,000 | 0,557 | 9,0 % | 18,2 % | 49 % |
  | 8 | 0,911 | 0,289 | 17,0 % | 23,1 % | 74 % |
  | 9 | 0,825 | 0,153 | 24,9 % | 29,0 % | 86 % |
  | alle dekket | 0,901 | 0,305 | 18,0 ± 1,7 % | **24,9 ± 2,3 %** | 72 % |
  Budvinner alene **15,7 ± 2,2 %** av veien (en policyblind posterior 1,034 ≈ gulvet: nesten all informasjon ligger i å
  kjenne policyene); andre seter 44,2 ± 4,0 %. PORTFORSLAG (ikke innført, eieren bestemmer): dekkede stillinger,
  nett → rettferdig tak − 2 SE ≥ 35 % (= 25 % mot perfekt skalert med 72 %). I dag 20,3 % → NEI. Tidlig i runden ukjent.
- 02:35 agent R (myke etiketter): røyk viser gapet direkte – tro-3 har K8-tap **1,049 som budvinner** (1,000 selv i stikk 8,
  nær gulvet 1,0986), mot 0,69 som makker/forsvarer. Det rettferdige taket for budvinneren i stikk 7 er 0,557, så
  informasjonen finnes (i å lese policyene), men nettet bruker den ikke. R sammenligner én-hot / myke / myke + budvinnervekt 2.
- **~02:50 AGENT R FERDIG** (agR bd860ed, c95ca33): `mlb-trodata --myk` (posterior som etikett, post v2 med rollefelt),
  treneren `--etikett myk --myk-vekt --rolle-vekt --velg`, k8-tak med rolle, flere nett og parvis før/etter. 16/16 tester.
  Dekning 37 % myke rader (budvinner fra stikk 6–7, andre fra 7–8), 0,27 s/rad.
  **Resultat (48 kamper, 256 dekkede stillinger, andel av veien til rettferdig tak):** tro-3 alle 24,0 ± 1,7 %,
  **budvinner 12,9 ± 1,7 %**, makker 41,2 %, forsvarer 47,9 %. Ingen finjustering slår tro-3; myk = hard ved mild trening
  (0,0 ± 0,1), myk hjelper bare ved overtilpasning (+1,6 / budvinner +2,1); budvinnervekt 2 skader. → IKKE i løkka.
  INNSIKT: budvinnerens tro ≈ den policyblinde (bare renonser/kapasitet). Taket forutsetter KJENTE policyer; i løkka
  varierer forsvarernes policy mellom bordene → budvinneren må først kjenne igjen motstanderen (hukommelse/profil = K6↔K8,
  eierens poeng). K8-raden måler med `--maksrunder 3` (lite hukommelse). Neste grep for K8: lengre kamper i målingen og
  hukommelse som faktisk skiller policyer; kortnett 493 (iterasjon 4) er første steg.
  OBS: treningsbåndet for tro går tomt ved iterasjon 8 (--kamper 4050 > 4000).
- **02:36 ITERASJON 3 TRENT** (v4): bud +0,060 → budq-4; vrak 1,88 < 2,08 → vrak-4; etterlyst regel; tro bot-K8 0,9220 →
  0,9205, menneske 0,9284 → 0,9282 (epoke 4) → tro-4; **kort 0,7954 < 0,7997 OG SENT 0,2688 ≤ 0,2769 → kort-4**.
- **03:58 ITERASJON 3 FERDIG – BATTERI MED ALLE NYE PORTER (nett 4, kode 4c49883): 16 av 23 lukket, alle likt i begge bånd.**
  | rad | bånd 0 | bånd 1 | dom |
  |---|---|---|---|
  | K1 helbot (24 verdener) | +1,00 ± 0,19, z 5,34 | – | NEI (på grensa) |
  | **K1 søkevariant W48** | **+1,12 ± 0,19, z 5,79** (halvdeler +0,79/+1,51) | – | **JA etter porten** |
  | K1 søkevariant E4 | +1,00 ± 0,19, z 5,26 | – | på grensa |
  | K2 | 0 avvik | 0 avvik | JA |
  | K3.1 nåbart / Adams-duell | +0,27 / +0,05 pp | −0,06 / +0,04 pp | JA |
  | K3.4 nåbart | −0,02 | −0,17 | JA |
  | K3.6 nåbart (felle verst) | −0,04 | −0,02 | **JA** |
  | K4 prøve A | 9,9 % | 13,1 % | JA |
  | K5 | +2,56 | +2,55 | JA |
  | K6 bot | z 0,38 | z −0,15 | NEI |
  | K6-menneske | stigning z −5,40, nivå −0,29 pp, fella slapp | – | STUM (minnet skader fortsatt) |
  | K7 nåbart | +0,20 ± 0,19 (Adams +0,09) | −0,03 (Adams −0,22) | JA |
  | K8 | 13,44 % | 13,65 % | NEI (fallende: 15,4 → 14,0 → 13,4) |
  | K8-menneske | 20,84 % (null 21,13) | – | rapportert |
  → K1 NÅDD med 48 verdener. Gjenstår: **K6** (bot og menneske) og **K8** (terskel hos eieren).
  K6-menneske-hypotese: med minne-dropout 1,0 har menneskeradene ALLTID nullet minne, bot-radene aldri → «minnet er null» blir
  en menneske/bot-indikator, og i menneskekampene (med minne) tror nettet det ser en bot. Retting: dropout SYMMETRISK på alle rader.
- 03:58 ITERASJON 4 startet (v5, kortnett 493, kode d69fdc8).
- 04:00 `--minne-dropout-bot` pushet (krav 5d4b8d3; røyk i WSL OK). **v6** (iterasjon 5): tro med symmetrisk dropout
  0,5/0,5, helboten i batteriet med **48 verdener** (K1-varianten som lukket), søkevarianter W96 og W48+E4.
- **07:51 ITERASJON 4 FERDIG (nett 5, første med kortnett 493 som leser hukommelsen): 16 av 23 lukket, men K1 FALT.**
  Trening: bud +0,090 → budq-5; vrak 1,53 < 1,76 → vrak-5; **etterlyst 0,8659 < 0,8729 → første etterlystnett**;
  tro bot-K8 0,9249 → 0,9239 (roller: budvinner 1,036 / makker 0,871 / motspiller 0,873); kort 0,8226 < 0,8306, SENT 0,3038 ≤ 0,3128.
  | K1 | nett 4 (it. 3) | nett 5 (it. 4) |
  |---|---|---|
  | helbot 24 verdener | +1,00 ± 0,19 | **+0,70 ± 0,18** |
  | W48 | **+1,12 ± 0,19** | +0,88 ± 0,19 |
  | E4 | +1,00 ± 0,19 | +0,72 ± 0,20 |
  Resten: K2/K3.1/K3.1-Adams/K3.4/K3.6/K4/K7 JA i begge bånd; K5 **+3,34** (opp fra +2,56); K6 NEI (z −0,43/−0,91);
  K6-menneske STUM (z −4,99, nivå −0,26 pp – rettes i iterasjon 5 med symmetrisk dropout); K8 13,40/13,54 %;
  K8-menneske 21,16 % (null 21,42).
  **DIAGNOSE:** alle delportene ble bedre, men HELHETEN mot mennesker ble verre. Kortnett 493 er trent mot løkkas
  befolkning; K1 måles mot v5-kjeden menneskene faktisk møtte. Sannsynlig overtilpasning til befolkningen.
  **TILTAK (v7, iterasjon 6):** port på HELHETEN – nye nett beholdes bare hvis K1 (W48) ikke er dårligere enn beste
  hittil (−2 SE), ellers rulles nettsettet tilbake, og neste runde genererer data fra det BESTE nettsettet.
- 07:51 ITERASJON 5 startet (v6, bekreftet: 24 delprosesser av adams-max-loop-v6.sh; startlinja sier «v5» bare fordi
  teksten ikke ble endret). Symmetrisk minne-dropout 0,5/0,5 og helbot med 48 verdener i batteriet.
- **07:54 v7 KLAR (iterasjon 6): PORT PÅ HELHETEN.** Etter batteriet leses K1-raden; er den under beste hittil minus
  **0,15 pp** (fast margin – begge målinger spiller de SAMME 2641 menneskerundene, så «2 SE av summen» = 0,52 pp ville
  sluppet fallet +1,12 → +0,70 rett gjennom), skrives beste nettsett tilbake i K+1-slottet, ellers oppdateres beste.
  Beste-nettene ligger i D:\amb-grp\loop\nett\beste\ (satt til nett 4 = iterasjon 3), beste.txt = «4 1.12 0.19».
  Tørrkjørt: 0,70 → tilbakerulling, 1,05 → beholdes, 1,20 → nytt beste.
- **12:35 EIEREN: kan K1-tallet oversettes til hvor ofte et menneske vinner et løp til 100?** Regnestykket:
  et løp er ~24 runder, så +1,12 pp/runde ≈ +27 pp over løpet; fire like spillere vinner 25 % hver, altså
  menneske ≈ 25 − 27 ≈ 0 %. MEN konsistenssjekken feiler: samme regnestykke på den UTRULLEDE boten (+0,86)
  gir mennesket ~4 %, mens menneskene faktisk vant 26,5 % av de FULLFØRTE kampene mot nettopp den boten.
  Årsaker: 69 % av kampene ble forlatt (oftest når mennesket lå under), duplikatet måler 9,7 runder per kamp
  (ikke 24), og ΔP kommer fra seiersprediktoren, ikke fra ekte løp. → tallet kan IKKE oversettes ennå.
  **12:36 agent S** (D:\amb-agS): MENNESKEKOPI (imitasjon av bud, vrak, trumf og kortspill fra de 2640 loggede
  rundene) + `examples/lop-menneske.ts`: N løp til 100 med én menneskekopi mot tre helboter, rotasjon, bootstrap-CI,
  kontroll: fire like seter må gi 25 %. Det er eierens opprinnelige K1-formulering målt direkte.
- **13:21 BATTERI ITERASJON 5 (nett 6, symmetrisk minne-dropout, helbot 48 verdener): 15 av 23 lukket, K7 spriker.**
  K1 **+0,92 ± 0,19** (z 4,89) – under beste +1,12 (nett 4). K6 bot z −0,56 / +1,23. **K6-menneske stigning −0,010
  (z −2,87), opp fra −0,018**: symmetrisk dropout hjalp, men minnet skader fortsatt mot mennesker.
  K8 13,59/13,82 % (litt opp fra 13,40/13,54). K8-menneske 21,62 % (null 21,81).
  Trening: bud +0,034, vrak 1,68 < 2,00, etterlyst 0,80 < 0,83 (nytt), tro bot 0,9281 → 0,9266, **kortnettet AVVIST**
  av SENT-porten (0,3147 > 0,3098) – porten fanget nettopp den feilen som dro helheten ned i iterasjon 4.
  → 0,92 < 1,12 − 0,15: nettsettet skal RULLES TILBAKE til beste før iterasjon 6 genererer data. Porten i v7 virker
  først etter iterasjon 6 sitt eget batteri, så tilbakerullingen gjøres manuelt i vinduet mellom «[iter 5] FERDIG»
  og starten av v7 (venteren for iterasjon 6 stoppet 13:2x for å få det vinduet).
- **13:5x AGENT S underveis** (agS fe8d9c8): menneskeklon (`src/moe2/menneskeklon.ts`, spek-token `menn:`; fire hoder,
  varmstartet fra botens egne nett) + `examples/lop-menneske.ts` (løp til 100, roterte seter, bootstrap-CI).
  Validert på 60 holdout-kamper: kortspill **63,8 ± 0,6 % treff mot menneskets valg** (botene 50,3 ± 0,7); bud/trumf
  marginalt svakere enn botene (~1–1,5 SE). Rigg-kontroll: 2000 løp med fire like seter = 23,5 % [21,6–25,4].
  Kostnad per løp: v5-kjeden 0,28 s, prod-grunnlinja 107 s, **helboten 14m29s** → helbot-armen må skardes (20 skard
  ≈ 1,2 t) og kjøres når løkka gir plass. Arm B (klon mot 3× prod) kjører, ETA ~14:42.
- **14:1x EIEREN: trenger boten flere sanser?** Vurdering: sannsynligvis ikke rå sanser. Budvinnerens tro ligger på
  1,05 mens 0,56 er nåbart FRA HENNES EGNE INNGANGER, så informasjonen finnes allerede; sanser 2 (iterasjon 2) løftet
  ikke K8. Tre reelle hull: (1) REKKEFØLGEN – nettet ser summer/tellinger, ikke sekvensen av trekk (modellform, ikke sans);
  (2) HVEM den spiller mot – ingen eksplisitt motstandertype, og det rettferdige taket forutsetter kjent policy;
  (3) betenkningstid (logges fra v13, ingen data ennå). Fjerde: profil på tvers av kamper (krever at eieren endrer K2.5).
  → **agent T** (D:\amb-agT): tre sonderinger – A: kan motstandertypen leses av dagens 996 trekk (per stikk, per rolle,
  og per blokk: hukommelse / signal / grunn)? B: gir REKKEFØLGEN noe utover tellingene (GRU/attention mot samme budsjett)?
  C: ligger budvinnerens gap der typen IKKE gjenkjennes? Anbefaling skal være én av: ny sans, ny modellform, nytt treningsmål.
- **14:20 SØKEVARIANT W96 PÅ NETT 6: K1 +1,05 ± 0,18, z 5,93, halvdeler +1,04 / +1,07 → INNFRIDD.** Altså: med 96
  verdener klarer selv det SVAKERE nettsettet (som ga +0,92 med 48) K1-porten, og halvdelene er nesten like – mer søk
  henter inn hele tapet fra nettene. Kostnad: W96-raden tok ~59 min mot ~28 for 48. Tilbakerullingen står likevel,
  fordi porten sammenligner ved samme søkestyrke (48). v7 måler begge: batteriet 48, variantene W96 og W48E4.
- **14:3x EIEREN GODKJENNER SPILLERPROFIL PÅ TVERS AV KAMPER:** «når botten starter en kamp mot en spiller så lastes den
  spilleren sine vaner inn i botten sitt minne basert på tidligere matches, også oppdateres den videre under kampen.»
  **KRAVENDRING:** K2.5/K6.7 «ingen lagring på tvers av økter» → lagring lov, men profilen inneholder BARE det som var
  offentlig ved bordet i FERDIGE runder. K2 uendret. Testene skjerpes til den nye regelen, ikke slettes.
  → **agent U** (D:\amb-agU): profilbutikk (per spiller-id, samme statistikk som hukommelsen, med tiltro/antall),
  spek-form, byte-identisk uten profil, doc/test-endring for K2.5/K6.7, og TO målinger: (a) predikerer troen menneskets
  kort bedre fra runde 1 når hukommelsen er seedet fra spillerens TIDLIGERE kamper, (b) løp til 100 mot menneskeklonen
  med og uten profil. Appen (hente ved kampstart, lagre ved kampslutt) krever utrulling – varsles eieren, ikke gjort av U.
- 14:3x BESLUTNING: Adams Max-speken bruker **96 verdener** (stabilest K1: +1,05 ± 0,18 med svake nett, +1,12 med de beste
  ved 48). Batteriet beholder 48 for sammenlignbarhet mellom iterasjoner og for tid; W96 måles som variant hver iterasjon.
- **14:45 ITERASJON 5 FERDIG.** Søkevarianter på nett 6: W48 (batteriet) +0,92, **W96 +1,05 ✅**, W48E4 **+0,66**.
  E4 er verre for TREDJE gang (+1,00 → +0,72 → +0,66): eksakt sluttspill fra 4 stikk tas ut av variantene i v8,
  plassen brukes på flere verdener (W96/W144).
- **14:46 TILBAKERULLING UTFØRT** (manuell, samme regel som v7-porten): K1 0,92 < beste 1,12 (nett 4) − 0,15 →
  nett 6 = beste nettsett; etterlyst-6 fjernet (beste har ingen). **Iterasjon 6 startet 14:46 med v7 og porten på helheten.**
- **~14:45 AGENT T, SONDERING A:** motstandertypen er lesbar 56,2 ± 2,7 % mot grunnrate 29,8 %, og **hele signalet ligger i
  hukommelsesblokken** (144 tall alene: 57,2 ± 3,2 %). Grunnblokken 660, signalblokken 116 og «valgt bort» 40 ligger alle
  på grunnraten. Treffet er FLATT fra stikk 0 til 11 → boten kjenner igjen hvem som har sittet der i tidligere runder,
  ikke hvem som spiller slik nå; i runde 1 er boka tom og typen ulesbar (= nøyaktig det profilen fikser).
  Budvinneren svakest også her (53,6 % mot 57–58 %). MANGLENDE SANS FUNNET: **budrekkefølgen finnes ikke** – `Budrunde`
  har bare `{passet, høyeste, sisteBud}`, så rekkefølgen på budene er borte i både `SpillerVisning` og `GameState`.
- **14:37 K1 SOM LØP (agent S):** menneskeklonen vant **11 av 100 løp** til 100 mot 3× utrullet bot (Wilson 95 %: 6,3–18,6 %),
  28,8 runder per løp, roterte seter. Mot Adams Max koster hvert løp 14,5 min → må skardes.
- **~14:55 AGENT T, SONDERING B og D – NEGATIVE, og de omdefinerer hva som mangler:**
  | sondering | tall |
  |---|---|
  | B: kortrekkefølgen alene | 33,2 ± 1,8 % (≈ grunnrate 29,8) ; agg+sekvens 52,1 ± 2,7 mot agg 50,7 ± 2,9 |
  | D: troen med identitet som ORAKEL | 0,9502 ± 0,0021 – dvs. IKKE bedre enn grunnlinja 0,9445 |
  | D: troen med hukommelsen NULLET | **0,9412 ± 0,0021 – bedre enn grunnlinja** |
  Lesning: å VITE hvem motstanderen er hjelper ikke; hukommelsesblokken er netto skadelig for trohodet slik det trenes nå
  (samme retning som K6-menneske). Det rettferdige taket kommer ikke av identiteten, men av å SIMULERE policyen og
  forkaste kortfordelinger som ikke forklarer de faktiske trekkene (P: 0,30 mot nettets 0,90 sent i runden).
  Forbehold fra T: A er en egen klassifikator (øvre grense for hva en delt trunk bruker), D er små MLP-er i 3 epoker.
  → **agent V** (D:\amb-agV): LIKELIHOOD-VEKTING i søkets verdener – hver trukket verden vektes etter hvor godt den
  forklarer motstandernes faktiske trekk under en antatt policy (`~lik=selv` i spill, `~lik=<spek>` som tak-måling).
  Måles på riktig plasserte kort, K8-metrikken per rolle, kostnad per beslutning, og K1 hvis den er billig nok.
- **15:00 AGENT T FERDIG – ANBEFALING: (b) NY MODELLFORM, IKKE NYE SANSER** (agT 43a30f0, c809397, 6d0ff8d, 88e400c, bf482b5;
  91 875 treningsrader / 300 kamper, 29 125 holdout / 90 kamper, disjunkte bånd, korpus byte-identisk, mlb-sekvens 6/6).
  Sondering C (764 sene rader med eksakt posterior): nett 0,6969 mot tak 0,1283; **budvinner 0,8872 mot 0,2104 = 0,68 nats**.
  Splittet på om identiteten var riktig gjettet: ingen effekt (men underpowered – boka har ≤ 3 runder ved MAKSRUNDER=4).
  Bærende bevis er sondering D: identitet som ORAKEL gjør troen verre, og å nulle hukommelsen gjør den bedre, i ALLE roller.
  T: «distillering av et mål arkitekturen ikke kan uttrykke er begrenset av arkitekturen» – forklarer hvorfor agent R sine
  myke etiketter bare flyttet K8 0,92485 → 0,92392. Eneste genuint fraværende sans: budrekkefølgen (ingen måling på verdi).
  → agent V bygger nettopp inferensen (likelihood-vekting i søkets verdener).
- **15:06 AGENT S FERDIG** (agS fe8d9c8, e0c656a, a5bd207; flettet som krav e20802b, tester 8/8 + 2 hoppet over).
  Klonen (`menn:` – fire hoder som varmstarter fra botens egne nett og lærer avviket) treffer menneskets valg:
  **kort 63,8 ± 0,6 % mot botenes 50,3** (n=6177), bud 76,4 mot 78,4, vrak 58,4 = 58,4, trumf 84,0 mot 86,4, kall 84,0 mot 86,3.
  Altså bedre BARE på kortspill; kortvalg er 6177 av ~7400 beslutninger. Vraket er tak-begrenset: 35 % av menneskets
  (trumf, vrak)-par finnes ikke i `telrd`-kandidatsettet.
  | løp til 100 | klonens seiersandel |
  |---|---|
  | mot 3× utrullet bot (100 løp) | **11,0 % [5,0–17,0]** |
  | mot 3× v5-kjeden (200 løp) | 18,0 % [13,0–23,5] |
  | kontroll: fire like seter (2000 løp) | 23,5 % [21,6–25,4] ✔ |
  Kostnad: v5 0,28 s/løp, prod 107 s, **helbot 15–27 min** → 100 løp = 45 t på én prosess.
  → **15:06 startet helbot-armen: 100 løp, 6 skard, MED DE BESTE NETTENE** (nett/beste, K1 +1,12), spek
  `okt:vr:beste-vrak:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=beste-tro:budq:beste-budq:vakt:abmp:e1:beste-kort`.
  Ventet 8–12 t under samtidig løkke. Dette er eierens opprinnelige K1: «hvor ofte vinner et menneske et løp til 100».
- **15:2x AGENT V FLETTET** (krav 2c8751a, agV 4799d64 + 96f622c; tester 36/36; av som standard, helbot uten `~lik=`
  byte-identisk over 109 handlinger). `sik:…~mlbu=<fil>~lik=selv|@<fil>[,t<temp>][,v<vindu>]` – hver trukket verden
  vektes etter hvor godt den forklarer motstandernes FAKTISKE trekk under en antatt policy (`selv` = vår egen policy
  uten søk, det ærlige anslaget i spill). Tildereeglene er nå `~art=verdi`-par (rettet en bug der `~mlbu=fil~lik` ble lest som filnavn).
  429 stillinger, 40 giv, paret per giv:
  | arm | riktig plasserte kort | K8-tap (andel av veien til klarsyn) |
  |---|---|---|
  | appen i dag | 32,47 % | 1,0294 (6,3 %) |
  | tro (dagens helbot) | 38,64 % | 0,9281 (15,5 %) |
  | **tro + lik** | **39,95 %** | **0,8922 (18,8 %)** |
  | bare lik | 37,47 % | 0,9308 (15,3 %) |
  Per rolle (tro+lik − tro): **budvinner +3,05 ± 0,54 pp / K8 −0,059**, makker +1,22, forsvar +0,63.
  Per stikk: 0–3 **−0,34**, 4–6 +0,44, **7+ +3,83 ± 0,65 / K8 −0,096**. Gevinsten ligger altså der taket sa den var:
  sent, og mest hos budvinneren. Likelihood ALENE slår ikke tronettet – de er komplementære.
  KOSTNAD: 2,5× søketid (469 → 1155 ms per beslutning). V anbefaler: gate den til sene stikk (`v<vindu>`) og måle K1 på
  den gatede varianten, ikke på full-tid-varianten – samme veggtid kjøper ellers flere verdener (W96 ga +1,05 pp ΔP).
  Fella som tjente til livets opphold: «fasit-sjekken» tok to felt som ble båret fra nåtid inn i reprisen
  (`makkerAvslørt`, `utspiller`) – bomraten mot et ekte bord falt fra 5,0 % til 0,7 %.
- **15:4x GATEN `~lik=selv,f<stikk>` bygd og pushet** (krav 88ad822, lik-vekt + sik-tro 23/23). `v<vindu>` viste seg å
  være en KOSTNADSGRENSE (antall fullførte stikk som spilles om, standard 1), ikke en bryter – bryteren manglet.
  `f7` = vekten er av til sju stikk er fullført, altså på fra og med det åttende, der agent V målte hele gevinsten.
  Test med felle: uten gaten må vekten finnes allerede tidlig, ellers måler prøven ingenting; ukjent knott kastes.
  **v8 (iterasjon 7):** søkevariantene er nå **W96** og **LIK7** (E4 ute etter tre tap på rad). Ventejobb armert.
- **15:47 AGENT U FERDIG OG FLETTET** (krav 88d7d95, agU a240cff; konflikt i agentspek løst: U sin `bokfrø` inn i
  `~mlbu=`-grenen som V skrev om; tester lik-vekt/profil/økt/sik-tro/sik-okt 49/49). Profilen (`src/mlb/profil.ts`,
  `okt:profil=<sti>@<sete>:`) bærer MIKRO/MESO/makrokorrelasjonene, IKKE ferskvektene (halveringstid tre runder – ville
  plantet et driftsignal i runde 1). Boka seedes rabattert: `n_start = min(0,5·n, 24)`, snittet beholdt – taket er én
  kamps bevis, så en 2000-runders profil kan ikke gjøre dagens tjue runder usynlige (ville drept K4).
  Byte-identisk uten `profil=` (5 sha1). **K2.5/K6.7 endret i AdamsMax.md og delkravdokumentet; testene STRAMMET,
  ikke slettet** (økta er fortsatt disk-fri, treningsløkka lagrer ingen profil, ny mlb-profil.test.ts 12/12 med feller).
  MÅLING (a) prediksjon, 46 holdoutkamper, profil bare fra TIDLIGERE kamper: +0,06 ± 0,02 pp, **men fella stryker** –
  en ANNEN spillers profil gir det samme (z 1,30), og i runde 1 er det +0,09 ± 0,10 (z 0,85). Kanalen er nær taus mot
  mennesker: null-armen 20,73 % ligger OVER kampens egen bok 20,59 %.
  MÅLING (b) spill, 240 løp mot klonen, samme frø og seter: fersk 12,5 %, bærer 12,9 %, parret **+0,42 pp, z 0,23**
  (følsomhet ±3,7 pp). Anbefaling fra U, som jeg følger: IKKE koble profiler inn i treningsløkka nå.
  Forbehold: bare én spiller har nok historikk (211 kamper; nest mest er 30), så (a) hviler på én person.
- **15:47 → agent W:** profilen som en MODELL AV SPILLEREN, brukt som antatt policy i likelihood-vekten
  (`~lik=@<spillerens klon>` mot `~lik=selv`). Det er den formen målingene støtter: T viste at aggregerte vanetall er
  feil form, V viste at inferens virker, S har allerede en klon som treffer menneskets kortvalg 63,8 %.
  Fella er obligatorisk: en ANNEN spillers modell må gjøre det målbart dårligere, ellers viser målingen bare at «vekting hjelper».
- **16:25 AGENT W FERDIG OG FLETTET** (krav 16c0fcb, agW 2cc0897; lik-per-sete + lik-vekt + menneskeklon + profil 35/35).
  `~lik=selv,<fil>@<sete>` – én antatt policy PER SETE. Spillermodell trent på tidsdelte data (153 kamper før 1. sep,
  58 etter, 25 kamper som krysser skillet kastet fra begge sider), varmstartet fra d7alle (IKKE fra agent S sin
  menneske-kort.bin, som har sett de senere kampene): treff 67,1 % mot botnettets 43,6 %.
  MÅLING A, 1270 stillinger i 19 holdoutkamper, mot «ingen vekt», på MENNESKETS kort:
  | arm | treff | K8 |
  |---|---|---|
  | selv (de spiller som oss) | +0,81 ± 0,25 pp | +0,007 ± 0,013 |
  | riktig persons klon | +1,55 ± 0,27 pp | −0,016 ± 0,011 |
  | **FEIL person (fella)** | +1,46 ± 0,25 pp | −0,021 ± 0,008 |
  | riktig klon, feil sete | +0,76 ± 0,25 pp | +0,016 ± 0,013 |
  **Fella slås ikke noe sted** (riktig − feil: +0,09 ± 0,28 pp totalt, +0,18 ± 0,72 ved stikk 7+). Det som SKILLER er
  `selv − feil` −0,64 ± 0,27 pp og `feil sete − feil person` −0,69 ± 0,29 pp: mekanismen virker og setefeltet treffer,
  men det den fanger er GENERISK menneskespill, ikke personen. Samme dom som agent U, av en annen grunn.
  **ANBEFALING (W, og jeg følger den):** ship mekanismen, ikke personen – ÉN delt menneskeklon på menneskets sete,
  bak `f7`-gaten. Ingen profillagring, ingen personvernflate, ingen kryss-kamp-tilstand → K2.5/K6.7-spørsmålet
  forsvinner for denne delen. Per-spiller-modeller holdes UTE av både appen og løkka.
  Forbehold: hviler på én spiller (211 kamper; nest mest 30) – bevis MOT en stor personeffekt, ikke bevis for null.
  NESTE (ikke startet): i APPEN kjenner boten de tre andre setenes policy NØYAKTIG (det er dens egne boter), og agent V
  målte +4,63 ± 0,73 pp med motstandernes SANNE spek. Det er den sterkeste konfigurasjonen og bør måles som variant
  (LIKV5) i løkka og forberedes for appen – utrulling krever varsel til eieren.
- **17:35 EIEREN: «fiks disse er du snill – og hvis du har prøvd én gang og blitt motbevist, prøv på nytt med alt på
  plass og sjekk om koden var riktig implementert.»** Alle fire manglene satt i arbeid, hver med AUDIT før ny måling:
  - **agent Y** (D:\amb-agY): BUDREKKEFØLGEN inn i motoren (`Budrunde` har bare `{passet, høyeste, sisteBud}`) og som
    sans bakerst i tro (996) og BudQ (323); sjekker også om rekkefølgen kan gjenskapes fra menneskeloggen, og skriver
    ned nøyaktig hvilken app-endring som trengs (rører ikke web/).
  - **agent Z** (D:\amb-agZ): AUDIT av kortnett 493 – er hukommelsesblokken i det hele tatt fylt i treningsradene, når
    den kortlaget i SPILL, er varmstarten riktig, og måler SENT-porten det vi tror? Deretter ny trening med det auditen
    viser, dømt som løkka gjør + K1 på helheten om det er råd.
  - **agent Æ** (D:\amb-agAE): BETENKNINGSTID gjennom røret (eksport → menneske-logg → trekk), sans bakerst, K2-test med
    felle for å bruke setets EGEN tid, og et konkret svar på «hvor mange kamper til trengs».
  - **agent Ø** (D:\amb-agOE): NY TEST av kortrekkefølgen – først audit av at `sekvens.ts` faktisk koder rekkefølgen
    riktig (en forskjøvet/avkortet sekvens ville alene forklart nullresultatet), så tre armer på selve trooppgaven
    (aggregater / aggregater+sekvens / bare sekvens) med nok epoker og begge motstandersetene.
  - **agent X** (D:\amb-agX, startet 17:1x): FARGESYMMETRIEN – eierens idé. Setene er relative, fargene er ikke.
    Symmetrien er eksakt men liten (bare de to fargene som verken er trumf eller etterlyst kan byttes ≈ 2×), måler
    symmetribruddet i dagens nett, så augmentering, så kanonisering.
- **17:35 TEMPO-DATA FINNES ALLEREDE:** 5 kamper / 38 runder med `tempo` siden v13 ble rullet ut, nyeste spilt i dag
  (eksempel: 19,8 s på budet, 3,6 s på første utspill, ~1,2 s videre). Nok til å bygge røret, altfor lite til å lære av.
- **17:45 BRUKERGRENSEN traff igjen** (nullstilt 17:50). Agent X, Y og Ø stoppet midt i; INGENTING tapt – alt arbeid
  ligger i arbeidskopiene: agX 3 ufilte filer (fargebytte.ts + test + måleskript), agY 13 endrede filer (motoren,
  generatorene, trekk.ts), agØ hadde committet revisjonen (`ab3ceca`).
  **agØ sin REVISJON ER GRØNN: `sekvens.ts` koder kortrekkefølgen RIKTIG** – verifisert på 121 000 ekte rader, alle
  feller fyrer, K2 holder. Agent T sitt nullresultat er altså IKKE en målefeil i kodingen; det gjenstår å se om en
  ordentlig trent leser finner noe.
  agY-funn: bare agentens EGEN nye fil hadde typefeil – ingen annen byggeplass brøt, så `medVerden` og de andre
  gjenoppbyggingsveiene bærer det nye feltet automatisk.
  17:51 startet Ø2 (fullfører de tre armene på trooppgaven) og Y2 (fullfører budrekkefølgen), begge med beskjed om å
  committe tidlig. Agent X (fargesymmetrien) står i kø til en plass blir ledig – fire samtidige agenter var det som
  sprengte grensen.
- **18:0x AGENT Æ FERDIG** (agAE 121470e): betenkningstiden går nå gjennom hele røret. Eksportøren bærer feltet
  (verifisert, ikke antatt), `menneske-logg` gir `tempo` per gjenskapt beslutning med `null` = «ikke målt» (alle 4 448
  runder før v13). Sansen `src/mlb/tempotrekk.ts` er **32 trekk bakerst: 996 → 1028**, per relativt sete log-ms, avvik
  fra setets eget snitt i kampen, antall, skjult, ufokus, angre, pluss dekningsgrad. **Setets EGEN tid er strukturelt
  umulig** (sete 0 har ingen celle), og bottiden kan ikke komme inn (leser aldri `bottrekk`). Byte-identisk uten
  `--tempo` (3 sha1 + 1 484 ekte rader med 0 avvik), tester 9/9 med feller som alle fyrer.
  KORRIGERT PREMISS: den lokale dumpen hadde NULL tempo-rader (den er fra før v13). Etter ny eksport: **67 runder i 7
  kamper, 911 tidsatte beslutninger**, alt fra ÉN spiller. Median 2 046 ms.
  HVOR MYE MER TRENGS: ~36 flere kamper for å se en effekt på 1 pp (optimistisk anker), ~121 med det dokumenterte;
  under 0,5 pp er utenfor rekkevidde i år.
  Antydninger (n=612 kortvalg, 7 klynger): flere lovlige kort → lengre tid (r +0,27 ± 0,04), senere stikk → kortere
  (r −0,42 ± 0,03). Klokka måler altså betenkning, ikke venting – en nyttig kontroll på appens logging.
- **⚠ VIKTIG SIDEFUNN (agent Æ): appens boter byr ikke lenger som `V5_KJEDE`.** 22 av 86 nye runder ble avvist som
  `budrundefelt` og 26 av 64 gjenskapte trengte et budavvik, mot 2 636/2 641 den 11. sep. Årsak: appen kjører BudQ nå,
  mens gjenskapingen (duplikat-menneske, menneske-logg, K1-raden) spiller budrunden om med v5-kjeden. Det koster
  brukbare menneskerunder OG betyr at K1 måler mot feil motstander for kamper spilt etter BudQ-utrullingen.
  FIKS (køet): gjenskap med den kjeden som FAKTISK var utrullet da kampen ble spilt – `start`-raden logger `modeller`
  og `bundel`, så epoken kan leses av loggen.
- **18:2x AGENT Y2 FERDIG** (agY f005926, 9602f64, b4ad518 – IKKE flettet ennå, se breddekonflikten under).
  `Budrunde.rekke` (`{sete, bud}` per melding, PASS med) skrives av `utførBud`, tømmes av `nyGivning`, går ucensurert
  i `spillerVisning` (auksjonen er offentlig) og bæres av ALLE gjenoppbyggingssteder (motor ×3, `visningTilState`,
  singledummy, d7-liga2, `medVerden` og K2-hjelperne via spread). `src/mlb/auksjonsrekke.ts`: 44 trekk (per relativt
  sete: deltok, bød, første/siste posisjon, antall bud, største/første hopp, passet etter bud, før/etter lederen;
  + lengde, budandel, lederposisjon, omganger). Referansen er DAGENS leder, ikke den endelige vinneren – BudQ leser
  blokken midt i auksjonen og ville ellers lest framtiden.
  **MÅLING: ingen effekt.** 300 kamper trening / 100 holdout, match-disjunkt, 15 epoker: K8 0,95720 → 0,95722,
  **parret +0,00001 ± 0,00029 (z 0,04)**; per rolle: budvinner +0,00065 (z +1,39, feil vei), makker −0,00035, motspiller −0,00014.
  **TO FUNN SOM ER VERDT MER ENN SELVE SANSEN:**
  1. `medBok` i mlb-trodata valgte hukommelsesblokken PÅ BREDDE og kjente ikke 1040 → et 1040-korpus fikk **144 nuller
     der hukommelsen skulle stått**, uten at noe feilet. En per-stilling-test er grønn; bare en korpus-sammenlikning
     tar det. Nå er den sammenlikningen en test, med felle.
  2. **Loggen har IKKE budrekkefølgen**: av 4 448 `runde`-rader har ÉN et `budrunde`-felt, og det er aggregater.
     Menneskerader med `--auksjon` ville lært V5-kjedens budvaner, ikke menneskets. App-endringen er skrevet ned
     (legg `rekke` i `logg("runde", …)`-nyttelasten i web/app.ts ~1405) – krever utrulling, altså varsel til eieren.
  Y2 rettet også to typefeil som fantes i basen, og en felle som var blind (`arg()` leser første forekomst).
  ANBEFALING (fulgt): ikke slå på `--auksjon` i løkka. BudQ – laget som faktisk svarer på en auksjon – er ikke målt ennå.
- **18:2x BREDDEKONFLIKT:** Æ (tempo, 996 → 1028) og Y2 (auksjon, 996 → 1040) la begge sin blokk bakerst; 10 hunker i
  5 filer. Krav-kopien er ryddet (merge --abort, ren på 0236404), og **agent BM** (D:\amb-agBM) slår dem sammen til ett
  stigespoR: 996 | tempo 32 | auksjon 44, med breddene 996/1028/1040/1072 og BudQ 323/367 registrert overalt, begge
  flagg uavhengige, nullutvidelse bit-identisk i hvert trinn, og korpus-sammenlikningen som test.
- **18:3x AGENT Ø2 FERDIG – KORTREKKEFØLGEN AVVIST, MED KAPASITETSKONTROLL** (agOE 35186f3, 9e409cb, d82c84b, a53a5e3, ad62364).
  Revisjonen først: `sekvens.ts` koder rekkefølgen RIKTIG – 0 brudd på ~121 000 ekte rader, fire uavhengige sjekker,
  alle tre feller fyrer. T sitt nullresultat var altså ikke en kodefeil.
  Holdout 29 125 rader / 90 kamper, match-disjunkt, begge motstanderseter, tidlig stopp, 3 frø per arm:
  | arm | K8 ± SE | vekter |
  |---|---|---|
  | (a) aggregater | 0,99715 ± 0,00171 | 2,31 M |
  | (d) aggregater, BRED (kontroll) | 0,99776 ± 0,00174 | 3,17 M |
  | (b) aggregater + sekvens | 0,99810 ± 0,00174 | 3,16 M |
  | (c) bare sekvens | 1,00427 ± 0,00180 | 0,85 M |
  **(b) − (d) = +0,00034 ± 0,00051 (z 0,67)** – med kapasiteten holdt fast er rekkefølgen ikke til å skille fra null,
  fortegnet mot skade. (b) − (a) = +0,00095 (z 2,02) er altså 37 % flere vekter, ikke informasjon.
  Ø2 la selv til kontrollarmen (d); uten den ville lesningen vært motsatt. To metodefunn å ta med videre:
  **røyken løy fordi den ikke var konvergert** (ved én epoke så sekvensen ut til å hjelpe, fortegnet snudde ved tidlig
  stopp – en ukonvergert forskjell måler konvergenshastighet, ikke informasjon), og cuDNNs GRU er ikke-deterministisk
  med samme størrelsesorden som effekten. ETT ekte unntak: i stikk 11 vinner sekvensen −0,075 ± 0,005 og det overlever
  kontrollen – men det er 0,73 % av kortene. ANBEFALING (fulgt): dropp blokken.
- **18:24 K1 SOM LØP MOT ADAMS MAX (beste nett, 48 verdener, 6 skard, 3 t 18 min): klonen vant 10 av 100,
  ANDEL 0,100 [0,050–0,160], 26,7 runder per løp.** Per sete 12/20/4/4 (25 løp hver, støyete).
  | motstander | klonen vinner |
  |---|---|
  | v5-kjeden | 18,0 % |
  | utrullet bot | 11,0 % [5,0–17,0] |
  | **Adams Max** | **10,0 % [5,0–16,0]** |
  | kontroll, fire like | 23,5 % [21,6–25,4] ✔ |
  LESNING: retningen stemmer, men Adams Max er bare marginalt foran den utrullede boten på dette målet, og n=100 kan
  ikke skille 10 % fra 5 % (nedre kant treffer 5 %). Forbehold: klonen spiller kort som mennesket (63,8 % treff) men
  byr litt svakere enn botene, og løpene brukte 48 verdener – ikke 96, som ga det beste K1-duplikatet.
  NESTE: 100 nye løp på et disjunkt frøbånd → n=200 (CI ≈ ±4 pp). Deretter, hvis tid: samme mot 96 verdener.
- **18:4x AGENT X2 FERDIG – FARGESYMMETRIEN ER DAGENS STØRSTE FUNN, OG DET VAR EIERENS IDÉ** (agX 4a26dfe, 6fbf438,
  e457722, 99c2662, 317536b, 5421b75, 5bd16f7).
  KORRIGERT PREMISS: `src/motor.ts:497` krever at det etterlyste kortet er i TRUMF, så trumf og etterlyst farge faller
  alltid sammen → gruppa er **3! = 6** i hver eneste nåbar stilling (målt: nøyaktig 5,00 ikke-identiske bytter per stilling),
  ikke 2 som jeg antok.
  **BRUDD I DAG** (7 067 stillinger, tro-7 + kort-7): troen TV/kort 0,0978 ± 0,0005, argmax skifter 31,7 %;
  **kortnettet bytter VALGT KORT i 37,5 % ± 0,4 av stillingene** når fargene døpes om. Et nett som hadde lært
  symmetrien ville vist 0. Bruddet vokser utover runden (TV 0,039 i stikk 0 → 0,124 i stikk 9).
  | tiltak | parret K8 | z |
  |---|---|---|
  | augmentering, full data + tvillinger | −0,00053 ± 0,00026 | −2,0 |
  | augmentering, halv data + tvillinger | −0,00045 ± 0,00018 | −2,4 |
  | dobling av EKTE data (referanse) | −0,00072 ± 0,00019 | −3,8 |
  | **kanonisering (fra bunnen, samme data/epoker)** | **−0,02493 ± 0,00098** | **−25,5** |
  Halv data + tvillinger ≈ full data uten (z +1,34) → ~50 % datasparing; én tvilling ≈ 0,6 ekte rad.
  52,1 % av troens 996 innganger, 67,0 % av kortnettets 273 og 75 % av utgangene bærer farge.
  Tie-break er beregnelig fra `SpillerVisning` alene (trumf → etterlyst → offentlig spill → fast orden), men IKKE fra
  den ferdige trekkvektoren (`SETT` blander historikk+bord+eget vrak), så `--kanonisk` må virke ved trekkbygging.
  25,7 % av stillingene har fortsatt et offentlig uskillbart fargepar der den faste ordenen avgjør.
  FORBEHOLD: den kanoniske armen er trent FRA BUNNEN på 200 023 stillinger og ligger på 0,925 mot tro-7 sine 0,898 –
  gevinsten må gjentas ved produksjonsvolum før vi bygger om. Det er neste steg.
- **18:5x AGENT BM FLETTET** (krav b676327, agBM 0f4291f; 50/50 i stigetestene, typecheck 0). Stigen er nå
  996 | tempo 32 | auksjon 44, med breddene 996/1028/1040/1072 og BudQ 323/367. Tempo ligger FØRST med vilje: da er
  996→1028/1040/1072 og 1028→1072 rene nulltillegg, og bare 1040→1072 flytter en blokk – gjort på NAVN via
  `troKolonnekart`, samme mekanisme som 776→920. Ville vi lagt nuller bakerst der, hadde auksjonsvektene lest
  tempoblokken: 776→920-feilen om igjen, og den eneste i stigen som ikke krasjer.
  BM ryddet også: `harBlokk(navn)` i stedet for tre ELLER-kjeder, offsets slås opp i `MLB_TRO_LAYOUT` (hardkodet offset
  ville vært riktig for 1040 og stille galt for 1072), og én `MED_BOK` utledet av layouten.
  **⚠ ANDRE FUNN AV SAMME FEILKLASSE, OG DENNE GJØR VONDT:** `medBok` fantes TO steder i mlb-trodata, og menneskegrenen
  stoppet på 920. Alle **menneskerader skrevet i 996 hadde tom hukommelsesblokk** – 144 av «de urørte» 996 trekkene
  borte, uten feilmelding. Konsekvens: botrader hadde hukommelse, menneskerader aldri → nettet kunne lære
  «tom hukommelse = menneske». **K6-menneske-tallene fra iterasjon 2–6 (og agent I sin +1,26 pp) er derfor suspekte**,
  og min «symmetrisk minne-dropout»-forklaring var trolig en halv sannhet: dropouten maskerte en bug.
  BM fikset også en typefeil i `tempotrekk.ts` (importerte `Fase` fra `regler.ts`, som aldri eksporterte den) –
  `npm run typecheck` har vært rød siden 121470e, og `node --test` stripper typer uten å sjekke dem.
- **18:5x MENNESKERADENE GENERERT PÅ NYTT OG VERIFISERT.** Samme radantall og filstørrelse, men annen sha1, og
  innholdssjekken er entydig: gamle `trening-0.bin` hadde **0 av 4000 rader med fylt hukommelsesblokk (0,0 %)**,
  nye har **3362 av 4000 (84,0 %)**, snittsum 41,6 – resten er runde 1, der boka SKAL være tom. Feilen var altså
  reell, og rettingen virker. Byttet inn i D:\amb-grp\menneske\rader996 (gamle: `rader996-gammel-tomtminne`) før
  iterasjon 7 trener troen. **K6-menneske må måles om**, og agent I sin +1,26 pp og alle K6-menneske-radene fra
  iterasjon 2–6 er målt på rader uten hukommelse.
- 18:5x AGENT Z, første kryss-kontroll: 493 med skånsom oppvarming **0,8246 mot policy 0,8410, SENT 0,3115 mot 0,3135 –
  består begge porter på en uavhengig splitt**. 273-ablasjonen på samme splitt er det som avgjør keep-versus-drop.
- **19:15 AGENT Z FERDIG – REVISJONEN FRIKJENNER TREKKET, PORTEN FALT PÅ UTVALGET** (agZ a87beb1, 1310992).
  1. Hukommelsesblokken ER fylt: 96,0 % av 22 840 ekte 493-rader, 0 % i runde 0, **100 % fra runde 1**, 129,6 av 144
     verdier ulik null når fylt, stigende 65,7 → 143,5 utover kampen.
  2. Den NÅR nettet i spill: 0,0 % ulike valg i runde 0 (tom bok, som den skal), 1,8 % i runde 1, 4,5–6,3 % fra runde 3;
     `h0` slår den korrekt av.
  3. Varmstarten er riktig i testen, men **i nettene løkka faktisk trente nådde de 220 nye kolonnene aldri skala**:
     |W| 0,0019–0,0028 mot basens 0,0896 – **33–46× for lite, 1,97 % av vektmassen i lag 0**. Flagget `--nyepoker`
     ble skrevet for nettopp dette i august, og løkka har aldri brukt det.
  4. **PORTEN MÅLER RIKTIG, UTVALGET GJØR IKKE:** treneren lagrer epoken med best TOTAL anger, mens porten krever total
     OG sluttspill. Kontrollen gjenskaper iterasjon 6 bit for bit (0,8147/0,8221, SENT 0,2891/0,2872, beste epoke 5) –
     og **epoke 2 besto begge (0,8171, SENT 0,2789)**. Det godkjente nettet fantes hver gang; porten så det aldri.
  RETRENING (policy 0,8221 / SENT 0,2872): skånsom oppvarming **0,8143 / 0,2857 består**; 273-ablasjon 0,8159 / 0,2858
  består også; aggressiv oppvarming 0,8259 / 0,2985 stryker (blokken FÅR innflytelse, 13,8 % vektmasse, og det gjør vondt).
  Tre kryss-splitter: 493 slår 273 på alle tre (+0,0016, +0,0046, +0,0067), SENT er uavgjort (+0,0001, −0,0005, +0,0037),
  og på én splitt **stryker BEGGE armer på SENT – også 273 uten hukommelse i det hele tatt**. Sluttspillporten er altså
  splittstøy ved denne effektstørrelsen, ikke en dom om hukommelse.
  ANBEFALING (fulgt): (a) **rett utvalget** – lagre beste totale epoke BLANT dem som også slår policy på SENT; det er
  en ekte feil uavhengig av denne sansen. (b) Ikke gjeninnfør 493 på anger alene; kandidatnettet `kort-agZ-myk.bin`
  ligger klart og dømmes på K1 når kjernene er ledige (iterasjon 4 viste at anger har feilpredikert helheten før).
- **19:20 UTVALGSFIKSEN SKREVET** (verktoy/sd-tren.py, etter agent Z sin anbefaling): en epoke lagres nå bare hvis den
  slår beste TOTALE anger OG har SENT-anger ≤ policyens. Alt som trengs lå allerede i løkka – `fase_naa` er epokens
  fasetall, `pol_fase` regnes før treningen – så ingenting måtte flyttes. Uten `--vekter` (ingen policy å måle mot) er
  det den gamle kodeveien, uendret. Forkastede epoker logges med `forkastet_sent`, så det er synlig at de fantes.
  Syntaks OK i WSL. Verifiseres ved å gjenskape iterasjon 6: treneren lagret epoke 5, mens epoke 2 besto begge – med
  fiksen skal den lagrede epoken endre seg. Commit først når den prøven er lest.
- **19:22 AGENT KA FERDIG – KANONISERING VINNER FRA BUNNEN, TAPER FRA VARMSTART: IKKE ADOPTERT NÅ**
  (agKA b80bba1, e65f297, a596325, 7d69f41, 8d620d3). Matchet korpuspar: 512 712 trenings- og 34 242 holdoutrader
  PER ARM, samme frø, samme befolkning, bare fargenavn skiller. Holdout 621 823 kort, SE klynget på 100 kamper:
  | nett | K8 |
  |---|---|
  | tro-7 (produksjon) | 0,92272 |
  | A1 varmstart, absolutt | **0,92117** |
  | B1 varmstart, kanonisk | 0,92508 |
  | A0 fra bunnen, absolutt | 0,96462 |
  | B0 fra bunnen, kanonisk | 0,93808 |
  **B0−A0 = −0,02630 ± 0,00083 (z −31,6)** – agent X sin gevinst reproduserer ved 2,6× data og krympet IKKE.
  **B1−A1 = +0,00430 ± 0,00061 (z +7,0)** – ved produksjonspunktet taper den. Hele den kanoniske gevinsten
  (0,96462 → 0,93808) henter mindre enn stigen alt har: tro-7 er 0,0154 BEDRE enn beste kanoniske fra bunnen.
  Kortnettet: full angermåling priset ut (~11 t), men strukturtallet er der – **kortbyttene faller fra 37,5 % til 7,7 %**
  (TV 0,0720 → 0,0099), og til 0,0 % fra stikk 5. Restbruddet i det kanoniske nettet er 7,63 %, ALT i stikk 0–4, altså
  nøyaktig de 25,7 % av stillingene der for få kort er spilt til at den offentlige nøkkelen skiller fargene.
  TO NYE FEIL AV SAMME KLASSE: `--menneske`-grenen kanoniserte aldri (et «kanonisk» korpus ville vært halvt kanonisk
  uten at noe krasjet), og `kort-data` hadde ikke `--kanonisk` i det hele tatt. Begge rettet. Flagget, ikke rettet:
  adopsjon krever kanonisering også ved SPILLETID tre steder (`src/e1/agent.ts`, `src/mlb/trekk.ts:707`,
  `src/moe2/troprior.ts:136` – de to siste dekoder tronettets 52×4 mot absolutte kortindekser).
  ANBEFALING (fulgt): ikke adopter, ikke restart stigen for dette. ÉN ærlig motvekt: fordelen fra bunnen forfalt ikke
  fra 200k til 512k rader, så en full kanonisk stige kan ikke UTELUKKES – den kan bare ikke kjøpes billig nå.
  **BESLUTNING: neste gang noe trenes fra bunnen (ny arkitektur, ny bredde-stige), kanoniser fra dag én.**
- **19:21 BATTERI ITERASJON 6 – BESTE HITTIL: 17 av 23 rader lukket, alle likt i begge bånd, 1 stum.**
  | rad | it. 5 | it. 6 |
  |---|---|---|
  | **K1** | +0,92 | **+1,10 ± 0,19, z 5,79** ✅ |
  | K8 bot | 13,59/13,82 % | 13,67/13,89 % |
  | K8-menneske | 21,62 % (null 21,81) | 21,08 % (null 21,33) |
  | K6 bot | z −0,56 / +1,23 | z +1,19 / −0,49 ❌ |
  | K6-menneske | −0,010 (z −2,87) | −0,014 (z −4,76) ❌ |
  **HELPORTEN VIRKET FOR FØRSTE GANG I DRIFT:** «K1 1,10 ± 0,19 er ikke signifikant dårligere enn beste 1,12 (nett 4)
  → nettene beholdes». Tilbakerullingen fra i går ga altså tilbake tapet: 1,12 → 0,92 → 1,10.
  **VIKTIG FORBEHOLD:** K6-radene her er målt med de DEFEKTE menneskeradene (tom hukommelsesblokk); rettingen kom
  etter at runden startet. **Iterasjon 7 er den første som både trener og måler på riktige rader.**
- **19:35 UTVALGSFIKSEN VERIFISERT OG PUSHET.** Gjenskaping av iterasjon 6 på samme data, med fiksen:
  | epoke | total | SENT | utfall |
  |---|---|---|---|
  | 2 | **0,8171** | **0,2789** | LAGRET (slår policy 0,8221 / 0,2872 på begge) |
  | 4 | 0,8161 | 0,2881 | forkastet_sent |
  | 5 | 0,8147 | 0,2891 | forkastet_sent ← denne lagret treneren FØR |
  Altså: runde 6 forkastet kortnettet fordi treneren hadde lagret epoke 5; med fiksen godkjennes runden i stedet,
  med et BEDRE sluttspill (0,2789 mot policyens 0,2872). Iterasjon 7 får dette automatisk gjennom `spol`.
- **20:19 ITERASJON 6 HELT FERDIG – ALLE TRE SØKESTYRKENE OVER K1-KRAVET FOR FØRSTE GANG:**
  | variant | K1 | halvdeler |
  |---|---|---|
  | helbot, 48 verdener (batteriet) | +1,10 ± 0,19, z 5,79 | – |
  | **W96** | **+1,10 ± 0,17, z 6,52** | +1,02 / +1,18 |
  | W48E4 | +1,04 ± 0,19, z 5,52 | +1,03 / +1,05 |
  W96 er det stødigste tallet vi har (minst SE, halvdelene tettest). E4 er fortsatt svakest av de tre, men over kravet
  nå som nettene er bedre – tidligere +1,00 → +0,72 → +0,66.
  MERK: runde 6 ble kjørt av **v7**, så LIK7 (likelihood-vektingen på hele boten) er IKKE målt ennå – den ligger i v8
  og måles først i iterasjon 7. Vaktjobben min ventet på en LIK7-linje i iterasjon 6 som aldri kunne komme; den
  avsluttet seg selv på «FERDIG».
- **20:19 ITERASJON 7 STARTET (v8, kode 3c4e0b6).** Første runde med ALT rettet samtidig:
  menneskerader MED hukommelse (0 % → 84 % fylt), epokeutvelgelsen som dømmer på begge tallene, K2-lekken i søket,
  og søkevariantene W96 + **LIK7** (likelihood-vektingen på hele boten, første måling mot mennesker).
  Derfor er iterasjon 7 den første RENE målingen av K6 – alle K6-tall fra iterasjon 2–6 er målt på rader uten hukommelse.
  Vaktjobb armert på kravrapporten, helporten og LIK7-linja.
- **20:4x K1 SOM LØP, 200 LØP SAMLET (beste nett, 48 verdener): klonen vant 20 av 200 = 10,0 %, 95 % [6,0–14,5],
  SE 2,1 pp, 26,6 runder per løp, per sete 10/14/10/6 (ingen seteskjevhet).**
  | motstander | klonen vinner |
  |---|---|
  | v5-kjeden | 18,0 % |
  | utrullet bot | 11,0 % [5,0–17,0] |
  | **Adams Max, n=200** | **10,0 % [6,0–14,5]** |
  | kontroll, fire like | 23,5 % [21,6–25,4] ✔ |
  **5 % ligger nå UTENFOR intervallet**: eierens ideal er ikke nådd, og forskjellen er statistisk reell, ikke støy.
  Et menneskelikt spill vinner ~1 av 10 mot Adams Max; målet er 1 av 20. Forbehold uendret: klonen treffer menneskets
  kortvalg 63,8 % men byr litt svakere enn botene, og løpene brukte 48 verdener – ikke 96, som gir det stødigste K1.
  NESTE (ikke startet): samme løp mot 96 verdener, og K1-dommen over agent Z sitt kandidatnett `kort-agZ-myk.bin`.
- **22:36 ITERASJON 7 TRENT – UTVALGSFIKSEN VIRKET MED EN GANG:** «TRENT kort: modell 0,8468 < policy 0,8546,
  **SENT 0,3075 ≤ 0,3082 → nytt nett**». Første gang kortnettet godkjennes siden iterasjon 4, og nøyaktig det fiksen
  skulle gi: epoken som lagres må nå slå policyen på BEGGE tallene, så porten ser den.
  Resten: bud **+0,1018** (beste gevinst hittil, mot +0,023 i iterasjon 6), vrak 2,05 < 2,22 → nytt nett,
  etterlyst 1,08 < 1,13 → nytt nett, tro bot-K8 0,92946 → 0,92894 (roller 1,0356 / 0,8777 / 0,8781),
  menneske-K8 start 0,92970. 226 381 kortvalg i dataene. Batteriet startet 22:36 på kode 3c4e0b6.
- **01:10 (13. sep) BATTERI ITERASJON 7 – FØRSTE RENE MÅLING (menneskerader MED hukommelse, rettet epokeutvelgelse):
  17 av 23 lukket, alle likt i begge bånd.** HELPORTEN: K1 1,01 ± 0,19 ikke signifikant dårligere enn beste 1,12 → nettene beholdes.
  | rad | it. 6 | it. 7 | retning |
  |---|---|---|---|
  | K1 | +1,10 ± 0,19 | +1,01 ± 0,19 (z 5,32) | flatt, over kravet |
  | K6 bot | z +1,19 / −0,49 | z −0,44 / +0,18 | fortsatt null |
  | **K6-menneske stigning** | −0,014 (z −4,76), nivå −0,246 | **−0,008 (z −2,97), nivå −0,116** | **skaden halvert** |
  | K8 bot | 13,67 / 13,89 % | 13,13 / 13,50 % | litt ned |
  | **K8-menneske** | 21,08 % (null 21,33, gap 0,25) | **21,56 % (null 21,68, gap 0,12)** | **gapet nesten lukket** |
  LESNING: rettingen av menneskeradene flyttet begge menneskeradene i riktig retning – serien for K6-menneske er
  −0,018 → −0,014 → **−0,008**, og K8-menneske er nå nesten på nivå med null-armen i stedet for bak den. Hukommelsen
  skader altså mindre når den faktisk finnes i treningsdataene. Men den HJELPER fortsatt ikke: K6 er ikke innfridd,
  og K8 står stille. Ett rettet grunnlag var nødvendig, men ikke tilstrekkelig.
- 01:12 K1-DOMMEN OVER KORTNETTET, første arm: kandidaten `kort-agZ-myk.bin` (493, med hukommelse) gir
  **K1 +0,98 ± 0,19 (z 5,01)**, halvdeler +0,83 / +1,14. Sammenligningsarmen (dagens `kort-7.bin`, samme spek og frø)
  kjører – uten den er tallet ikke tolkbart, siden nettene rundt også er byttet siden agent Z sin måling.
- **01:43 KORTNETT-DOMMEN: HUKOMMELSEN I KORTSPILLET DROPPES.** Samme spek, samme frø, samme 2641 runder, bare
  kortnettet byttet:
  | kortnett | K1 |
  |---|---|
  | kandidat 493 MED hukommelse (`kort-agZ-myk.bin`) | +0,98 ± 0,19 (z 5,01), halvdeler +0,83 / +1,14 |
  | **dagens 273 UTEN hukommelse (`kort-7.bin`)** | **+1,10 ± 0,19 (z 5,76)** |
  Helheten blir altså DÅRLIGERE av sansen, selv om anger-porten godkjente den. Andre gang holdout-anger feilpredikerer
  helheten (iterasjon 4: +1,00 → +0,70). Agent Z sin advarsel var riktig, og terskelen «dømmes på K1» reddet oss.
  **BESLUTNING: de 220 hukommelseskolonnene i kortnettet droppes.** Treningsgevinsten beholdes i 273-nettet, som
  ablasjonen viste fanger nesten alt (0,8159 mot 0,8143). Bredden 493 blir stående i koden – av som standard, testet,
  gratis – i tilfelle den skal prøves igjen med et annet treningsmål enn anger.
- **02:05 SØKEVARIANT W96 FALT: FLERE VERDENER HJELPER IKKE.** 96 verdener i stedet for 48, alt annet likt,
  samme 2641 runder: **K1 +0,94 ± 0,20 (z 4,80)** mot +1,01 for 48 i samme iterasjon (og +1,10 for beste nettsett).
  Halvdeler +0,84 / +1,05. Kostnad 3275 s vegg / 49 521 prosess-sekunder — mer enn dobbelt av 48-kjøringen, for et
  tall som er FLATT ELLER LAVERE. Fella tok (nevro i menneskets sete −1,02), kontrollen var ren (0 av 2641 ulike),
  så målingen er gyldig; det er gevinsten som ikke finnes.
  LESNING: søkebredde er mettet. Verdenene vi trekker er ikke bedre av å bli flere – de er begrenset av HVOR GODE
  de er, altså av troen som foreslår dem. Det er nøyaktig argumentet for LIK7 (vekt verdenene etter hvor godt de
  forklarer motstandernes faktiske trekk) framfor W96 (trekk flere av de samme). W96 tas ut av søkevariantene.
- **10:45 EIEREN SNUDDE SPØRSMÅLET, OG HAN HAR TRolig RETT: «troen BURDE gjøre den bedre til å spille».**
  Setter man nattens tall sammen, er kjeden tredelt og vi har bare målt to ledd:
  | ledd | målt |
  |---|---|
  | tro → bedre verdener | **JA: +5,88 ± 0,07 pp riktig plasserte kort**, og `~lik=` ga +3,83 pp til |
  | **bedre verdener → bedre kortvalg** | **ALDRI MÅLT** ← her må feilen ligge |
  | bedre kortvalg → flere vunne runder | delvis: K3.4/K3.6/K7 innfridd mot nåbart tak |
  Vi har altså bevis for at troen virker, og bevis for at det ikke kommer ut i andre enden – men ingen måling av
  leddet imellom. Min tolkning «troen bidrar ikke» var forhastet: det riktige utsagnet er at **troens informasjon
  ikke overlever søket**.
  **HYPOTESEN MED NAVN OG KUR I VÅR EGEN KODE:** helbotspeken er `sik:alle:0.5:48k32e3LMD`, altså `verdenKombi`
  = **`snitt`** (ren PIMC). Snittet midler utfallet over 48 verdener – og **en bedre FORDELING over verdener er
  nesten verdiløs for et snitt.** Troen flytter sannsynlighetsmasse mellom verdener; snittet bryr seg bare om
  gjennomsnittsutfallet. Det er lærebokformen strategifusjon + ikke-lokalitet, ført i AdamsMax.md som målt to
  ganger (§56, §58), med alpha-mu-kriteriene oppført som «den ene formen som angriper den».
  `SDOpts.verdenKombi` støtter alt `min`/`kvantil`/`flest`, og speken tar dem som `a<krit>` – **vi har aldri brukt
  dem i helboten.** Vi midler altså vekk nettopp den informasjonen troen skaffer.
  Agent satt 10:45 på tre ting, i rekkefølge: (1) måle hvor ofte troen endrer det VALGTE kortet og om endringen er
  riktig mot EKSAKT fasit (ikke mot søkets egen verdi – den er jo mistenkt), per stikk og per rolle; (2) `snitt`
  mot `amin`/`akvantil`/`aflest` på samme mål; (3) koblingssjekke at trovekten i det hele tatt når `trekkVerdener`
  i botstien, og at `budvekt` (standard PÅ) ikke drukner den – fire slike frakoblinger er funnet i natt.
- **11:27 TROLEDDET, TRE FUNN FØR NOEN MÅLING – OG ETT AV DEM KAN VELTE HELE SPØRSMÅLET.**
  1. **`budvekt` drukner IKKE trovekten** – hypotesen min er strukturelt utelukket: `agentspek.ts:1280` setter
     `budvekt = art === "mlb"`, og den utrullede speken bruker `~mlbu=`, altså `budvekt = false`. Kjeden er lest
     ubrutt spek → orakel → `sdpar` → `sampler`, og `budW` er identisk 0. **Trovekten er den ENESTE vekten på
     kandidatverdenene.** Den kan ikke drukne, og den er beviselig koblet – i motsetning til de fire frakoblingene
     natta ellers har funnet.
  2. **FASITEN ER FLAT I 79 % AV SLUTTSPILLSTILLINGENE.** 37 av 42 stillinger har spredning **nøyaktig 0** –
     kontrakten er allerede avgjort ved stikk 5–10, og hvert lovlig kort gir da samme rundepoeng. Gjelder begge
     målformer og alle tre roller. De fem som skiller, skiller voldsomt (spredning 33,67 = kontrakten hjem eller ei).
     Konsekvens: regret må regnes BARE der fasiten skiller, ellers fortynnes tallet mot null uansett hva armene
     gjør. Og det er samtidig et funn om `eks:3Lt2000`: i de siste stikkene er det meste avgjort, så det laget kan
     sjelden ha en mening heller.
  3. **STØYGULVET, og dette er det som kan velte spørsmålet:** første kjøring viser at troen endrer søkets argmaks
     i **56 % av beslutningene** – langt over de «få prosent» jeg gjettet. Men `sd-stoy.ts` har målt at to
     UAVHENGIGE verdenstrekk er uenige om beste kort i **92,5 % av tilfellene ved 12 verdener** (signal/støy 0,27).
     Agenten la derfor til **arm C**: identisk med A i alt, bare et annet instansfrø. A-mot-C er da ren
     samplingsstøy. **Er A-mot-B av samme størrelsesorden som A-mot-C, måler «troen endret kortet» ingenting annet
     enn at argmaks over 48 støyete anslag er ustabil** – og da KAN ikke en bedre verdensfordeling nå fram til
     kortet, uansett hvor god troen blir. Det ville forklare alt: frosset trohode, LIK7, kanal 2.
- **13:20 OVERKONFIDENS-HYPOTESEN ER AVKREFTET – TROEN ER VELKALIBRERT, OG KONTROLLEN BEVISER AT SONDEN KAN FEILE.**
  5 016 beslutninger: troen sier favorittverdenen er riktig **66,7 %**, den er riktig **63,9 % ± 0,7**.
  Kurven ligger på diagonalen; eneste avvik er båndet 50–70 % (−8,3 pp, n = 475).
  Optimal temperatur **T\* = 1,20 felles / 1,00 marginalt** – verdt 0,0119 nat av 1,2184. Altså ingenting å hente.
  **KONTROLLARMEN ER DET SOM GJØR DETTE STERKT:** roteres seteklassene ett hakk, blir troen LIKE selvsikker
  (påstår 60,5 %) og nesten aldri riktig (**6,1 %**), log-tap 10,27. Slik ser overkonfidens ut når den finnes.
  Sonden rekonstruerte dessuten vektfunksjonen uavhengig og traff den levende på alle 5 016.
  **OG DEN GA FORKLARINGEN VI MANGLET – DET HANDLER OM SETENE, IKKE OM KALIBRERING:**
  | sete | log-tap | favoritt riktig | ESS/K |
  |---|---|---|---|
  | **budvinner** | **3,00** (uniformt gulv 3,50) | **15,8 %** | 0,439 |
  | forsvar/makker | **0,49** | **83 %** | 0,068 |
  Budvinnerens tro er flat fordi hun **ikke vet noe**, ikke fordi hun er forsiktig – hun kjenner egen hånd og eget
  vrak, så det er lite skjult igjen å slutte om. Det forklarer `troledd.md`s +0,0 ± 1,9 pp i hennes sete uten at
  overkonfidens trengs som forklaring.
  Å temperere ville SKADET: ESS/K 0,4–0,6 krever T ≈ 4–5, og da påstår boten 32,8 % for en favoritt som er riktig
  63,9 % – vi ville laget UNDERkonfidens og betalt +0,45 nat. **Knotten er bygd og T = 1 er bit-identisk
  (`~mlbu=<fil>,T<temp>`, 7 prøver + 49 regresjonsprøver), men den skal stå på 1.**
  Eierens prinsipp var riktig – en bot som later som den vet, hallusinerer – men denne boten gjør det ikke, og nå
  er det målt med kontroll i stedet for antatt.
- **20:15 KJEDEFEIL, MIN: iterasjon 10 startet FOR TIDLIG og har delt kjerner med σ-armene i to timer.**
  Jeg lenket iterasjon 10 bak σ-jobben med `until grep -qa "FERDIG\|STOPP" boo871u9a.output`. Men σ-jobbens
  FØRSTE utskrift er linja `=== RESIDUAL-K1 FERDIG, SIGMA-ARMENE START 18:05:17 ===` – som inneholder ordet
  FERDIG. Kjeden fyrte dermed 18:06:34, ett minutt etter at σ hadde STARTET.
  **Samme familie som nattens øvrige stille feil: en sjekk som ser riktig ut, men stiller feil spørsmål.**
  Riktig form ville vært å matche på jobbens EGEN sluttlinje (`=== FERDIG` med tidsstempel på egen linje), eller
  enda bedre å vente på at prosessen avsluttes framfor å lete i teksten den skriver.
  **KONSEKVENS: ingen for gyldigheten, bare for tiden.** Valgene er en ren funksjon av frø og stilling (verifisert
  13. sep av kanal 2-agenten: `fristMs` settes ikke av noen spek, og `t2000` er en konfigurasjonsgrense, ikke
  millisekunder), så last kan ikke skjeve en parret måling – bare veggklokka. σ = 1,5 tok 1 t 32 min i stedet for
  ~50 min, og σ = 2,5 ligger an til det samme. Begge jobber lever og skriver (34 prosesser, filer 20:15).
  Jeg lar dem gå framfor å drepe noe midt i en måling – gevinsten ved å gripe inn er null, og natta har vist at
  jeg oftere tar feil når jeg griper inn i noe som kjører enn når jeg lar det være.
- **17. sep: KJEDEN DØDE 15. sep ~10:05 midt i iterasjon 16** (trolig drept da Claude-økta lukket) – maskinen sto
  tom i >2 døgn. Startet på nytt 17. sep 13:39 via WMI (forelder `WmiPrvSE.exe`), iterasjon 16–22. Halvferdig
  iter16 flyttet til `iter16-avbrutt-15sep`. Holdout så langt: 1,03 → 0,73 → 0,73 → 0,85 (iter 12–15).
- **17. sep RESEARCHRUNDE (eierens idé) – to agenter, `research-stikkspill.md` og `research-laering.md`.**
  Begge lander på samme grep: **tren kortnettet mot søkets verdier (myke mål), ikke valgt kort.**
  **MEN DET ER ALLEREDE GJORT:** `sd-tren.py` `maskert_tap` = kryssentropi mot `softmax(v/τ)`, τ = 1, og v er i
  poeng. Målt på iter15-etikettene (6000 rader): beste = nest beste i **36,9 %**, gap < 0,25 i 65,8 %, median gap
  0,042 (→ målet 51/49), p90 gap 2,54 (→ 93 % på beste). **Målene er ekte myke der kortene er likeverdige.**
  **DET DET AVDEKKER I STEDET:** treningsporten måler anger mot de SAMME støyete 24-verdens-etikettene. Er
  etikettene støy, kan nettet ikke bli bedre mot dem, og en ekte forbedring er usynlig for porten – forklarer at
  `kort-10…14` er md5-like og `kort-15 = kort-16`. Destillasjonsmålingen (`D:\amb-destill`) tester nettopp dette.
  Litteraturen bekrefter tre av våre egne funn: flere verdener flater ut (bridge ~100, skat ~160); bedre tro gir
  ikke bedre spill (skat: en variant som SÅ de sanne kortene spilte −3,25/−8,49 TP dårligere); flipping skjer
  mellom likeverdige kort, så riktig mål er ANGER, ikke skiftefrekvens.
  **Nytt spor startet: FART** (`D:\amb-fart`) – 580 → 86 ms uten å kutte søk: slå sammen likeverdige kort,
  beskjær håpløse kandidater, tidlig stopp i flate stillinger, avkortet utspilling + verdihode.
- **21:11 (14. sep) FALSIFIKASJONSTESTEN FYRTE: SØKEFOKUS TAPER, OG JEG LESTE DEKOMPONERINGEN FEIL.**
  | arm | K1 | parret mot grunnlinjen | endret utfall |
  |---|---|---|---|
  | grunnlinje: 48 verdener HELE runden | +0,99 ± 0,19 | – | – |
  | **B: 48 verdener, kun stikk 1–4** | +0,64 ± 0,21 | **−0,349 ± 0,118 (z −2,97)** | 823 av 2641 |
  | E: 72 verdener, kun stikk 1–4 | +0,70 ± 0,22 | −0,288 ± 0,130 (z −2,21) | 1030 av 2641 |
  Kontroll ren (0 ulike av 2641 på menneskesiden). **Å slå av søket utenfor stikk 1–4 koster 0,35 pp – nesten
  halvparten av hele det ærlige forspranget på +0,72.**
  **FEILEN ER MIN LESNING AV DEKOMPONERINGEN, IKKE AGENTENS ARBEID.** Den tilskrev ΔP til stikket der bot og
  menneske **FØRST SKILTE LAG** – ikke til hvor søket skapte verdien. En runde der uenigheten starter i stikk 2
  kan likevel avgjøres av søk i stikk 7. **«Stikk 5–8 bidrar +0,06» betyr IKKE «søk i stikk 5–8 er verdt 0,06».**
  Jeg brukte den likhetstegnet som premiss for hele søkefokus-sporet, og for påstanden om at sluttspillet kunne
  nedprioriteres i søket.
  **HVA SOM STÅR OG HVA SOM FALLER:**
  - STÅR: sluttspillets FASIT er flat i 79 % og bidrar +0,00 pp til utfallet (målt to uavhengige veier).
  - FALLER: at søket derfor kan skrus av der. Søket trengs i HELE runden – det er ikke bare der forskjellen
    OPPSTÅR at det betaler, men der den avgjøres.
  - FALLER: utrullingskandidaten. Søkefokus var 28 % billigere, men koster 0,35 pp. **Utrullingsproblemet er
    uløst, og destillasjon er nå den eneste veien til appens 86 ms.**
  Arm B var eksplisitt definert som falsifikasjonstest av dekomponeringen, og den gjorde jobben sin. Det er
  tredje gang i dag at en forhåndsdefinert test har stoppet en konklusjon jeg var i ferd med å bygge videre på.
  `STATUS-TIL-ARVIND.md` er rettet, siden den anbefalte søkefokus som utrullingsform.
- **14:20 (14. sep) TO RETTELSER AV MEG SELV – ETT TALL JEG HAR SITERT HELE DØGNET VAR FEIL.**
  1. **«Flat i 88 %» er egentlig 79,0 ± 0,2 %.** Tallet kom fra **37 av 42 stillinger i to runder av ÉN kamp**
     (reprodusert eksakt av agenten). Målt på **74 968 stillinger i 180 kamper** er det 79,0 %. Jeg har brukt 88 %
     som premiss ni steder i denne planen og i den varige hukommelsen; alle er nå rettet til 79 % (kopi av gammel
     plan: `plan.foer-79fiks.md`). **Konklusjonen «sluttspillet er dødt» står – tallet var for høyt.**
     Lærdom: et tall fra 42 observasjoner ble til et premiss uten at noen spurte hvor det kom fra.
  2. **Mekanismen jeg beskrev i oppdraget var begrepsmessig feil.** Jeg skrev «samme poeng, ulik varians» – men
     den eksakte løseren gir **ett deterministisk utfall per kort**, så det finnes ingen varians der å utnytte.
     Den eneste reelle mekanismen var at `diff = egne − snitt(andre)` skjuler vektorforskjeller når to ANDRE
     seter bytter et stikk. Den er reell, men nesten tom: 1,33 % av de flate stillingene.
  **DEN OVERLEVENDE VARIANTEN, skarpere enn min egen og IKKE avkreftet:** søkets blad er ikke fasiten, men et
  **snitt over 48 trukne verdener der utfallene FAKTISK varierer**. Siden P(seier) er S-formet i poeng, er
  **E[P] ≠ P(E)** – et seiersblad kan endre valg gjennom risikoholdning selv der fasiten er flat. Det er en annen
  hypotese med egen forhåndsregistrering, og innstikkspunktet er kartlagt: én funksjonsbytte i
  `sikkerorakel.ts:267` inn i `SDOpts.mål` via `sdpar.ts:280`, pluss en `~mål=seier`-art i tilde-løkka.
  Instrumentet er dessuten bevist levende: H3-formkontrollen passerer (spredning 1,055 → 1,622 pp og anger
  0,755 → 1,514 pp når lederen nærmer seg 100), så nullet er troverdig.
- **14:16 (14. sep) SEIERSMÅLET AVGJORT PÅ 74 968 STILLINGER: hypotesen død, men et lite ekte funn ligger under.**
  | linjal | flate | andel |
  |---|---|---|
  | POENG (spredning 0) | 59 241 | **79,0 ± 0,2 %** |
  | SEIER (< 0,01 pp) | 59 225 | **79,0 ± 0,3 %** |
  | parret (seier − poeng) | | **−0,02 ± 0,07 pp** |
  Ingen forskjell, og terskelsensitiviteten er flat (78,6 % ved 1e-7, 79,0 % ved 0,01). **Sluttspillet er ikke
  feilmålt.** Min forhåndsregistrerte hypotese OG agentens (78 %) er begge avkreftet.
  **DET SOM OVERLEVER, og det er ekte:** de to linjalene er uenige om beste kort i **1,5 ± 0,1 %** av alle
  stillinger, og **4,9 ± 0,2 %** der poengfasiten i det hele tatt skiller. Uenigheten er konsentrert der jeg
  gjettet: **ledende ≥ 85 gir 3,6 ± 0,3 % argmaks-bytte**, mot 0,9 % under 40. Målfunksjonsfeilen er reell og
  verst nær mållinja.
  **MEN STØRRELSEN DREPER DEN:** der seiersfasiten skiller uten at poengfasiten gjør det (716 av 74 968, 0,96 %),
  er botens anger **0,089 ± 0,006 pp** og den velger alt seiersoptimalt i 49,4 %. Vektet over alle beslutninger:
  **~0,001 pp**. K1 skiller ned til ±0,19 – **to størrelsesordener under målbarhet.**
  **BESLUTNING: ingen K1-arm.** Ideen er riktig i prinsippet – boten optimerer beviselig feil størrelse – men
  effekten kan ikke måles, og etter i dag brukes ikke maskinen på grep vi ikke kan dømme.
  Nyttig sidetall: anger der fasiten skiller er **1,278 poeng/runde** mot **0,862 pp** i seier – og flat-andelen
  faller jevnt med kort igjen (89,5 % ved ≤3 igjen, 68,0 % ved 7 igjen), som bekrefter at rommet ligger tidlig.
- **14:00 (14. sep) SEIERSMÅL-HYPOTESEN FALLER – og den faller på en måte som STYRKER «sluttspillet er dødt».**
  Foreløpig tall (kalibrering på 3 fulle kamper, poengtavle 0→99): **962 flate i poeng mot 964 i
  seiersannsynlighet.** Andelen faller ikke, den stiger marginalt. Agenten forhåndsregistrerte 78 % før måling og
  melder selv at spådommen ser feil ut – riktig håndtert.
  **MEKANISMEN, og den er avgjørende:** av de 962 flate stillingene har bare **10** en poeng*vektor* som i det
  hele tatt skiller seg. Der poengfasiten er flat, er **utfallet nesten alltid fullstendig identisk** – 952 av 962
  gir bokstavelig talt samme sluttresultat uansett hvilket lovlig kort som spilles. Da kan ingen linjal skille
  dem: seiersannsynlighet er ikke en finere målestokk der, den er en funksjon av det samme utfallet.
  **KONSEKVENS: «sluttspillet bærer +0,00 pp» står nå på TO uavhengige bein** – dekomponeringen (17 av 2640
  runder, +0,00 pp) og dette (utfallet er identisk, ikke bare poengsummen). En tredjedel av spillet kan avskrives
  med bedre grunnlag enn før. Full kjøring på 180 kamper pågår (vakt `bw6t2otrv`) og avgjør tallet endelig.
  MERK OGSÅ EN OPPSETTSFELLE VERDT Å HUSKE: `hent-vekter.mjs` pakker **bare 2 filer** ut – etter å ha kjørt den
  hadde den nye kopien 7 av 27 modellfiler, og `seier-g0.bin` manglet fortsatt. Resten må kopieres fra
  `D:\amb-krav`. Det er andre gang i dag samme mangel har ødelagt en kjøring (søkefokus-armene, 13:31).
- **13:45 (14. sep) NY HYPOTESE, OG DEN KAN OMGJØRE ET AV PROSJEKTETS MEST BRUKTE FUNN: SØKET OPTIMERER FEIL STØRRELSE.**
  Eieren spurte rett ut om jeg klarer å innovere. Ærlig svar: fem forslag i dag, fire målt null, ett utestet.
  Denne er den beste jeg har hatt på tre døgn, og den burde vært sett tidligere.
  **Søket maksimerer forventede POENG per runde** (`standardMål` = egne minus snittet av de tre andre, eller
  `lagmål`). **Målet er å vinne LØPET TIL 100.** De to divergerer skarpt mot slutten: ved 40–40 er det trygge
  valget best, ved 95–90 kan et valg som taper poeng i snitt være den eneste veien til å ta igjen. Boten regner
  poeng uansett kampstilling.
  **KOBLINGEN SOM GJØR DETTE MER ENN EN PEN TANKE:** «fasiten er flat i 79 % av sluttspillstillingene» er målt
  **i poeng**. To kort med like mange poeng kan gi **ulik P(vinne løpet)**, fordi de gir ulik varians. Faller
  flat-andelen når de SAMME stillingene måles i seiersannsynlighet, er sluttspillet ikke dødt – **vi har målt det
  med feil linjal**, og konklusjonen «stikk 9–12 bærer +0,00 pp» må leses på nytt.
  Maskineriet finnes alt: **`e1-modell/seier-g0.bin`** (`Seiersprediktor`, `src/mlb/seier.ts`), brukt i
  `budq-data.ts` – **aldri brukt som søkets bladevaluering.**
  Agent satt 13:45 med rekkefølgen MÅL FØRST: del 1 er å telle flat-andelen i poeng (kjent: 79 %) mot i
  seiersannsynlighet, på nøyaktig de samme stillingene. Bygging (`~mål=seier`) bare hvis den faller.
  Forhåndsregistrert spådom kreves, som siden `strata.md`.
- **13:31 (14. sep) SØKEFOKUS-ARMENE MÅLTE 0 RUNDER – og MIN sikring slapp det gjennom.**
  Begge armer «fullførte» på ett sekund med `n/a ± NaN, 0 runder i 0 kamper`. Årsaken var triviell og min:
  `D:\amb-sokfokus` hadde **12 av 27 modellfiler** (`hent-vekter` er aldri kjørt der), og `seier-g0.bin` manglet –
  `ENOENT` i alle 17 delkjøringer.
  **BATTERIET GJORDE ALT RIKTIG:** det meldte «0 av 1 rader lukket porten», «KONTROLL … [BOMMET]»,
  «FELLE … [SLAPP UNNA]», «INNFRIDD STUM», og listet alle 17 feilede jobber med filnavn.
  **DET VAR SIKRINGEN MIN SOM VAR FOR SLAPP:** jeg sjekket at en `MÅLT`-linje FANTES, ikke at den inneholdt tall.
  Samme feilform jeg har fanget hos andre i to døgn – en kontroll som består fordi den ikke måler noe. (Tredje
  gang i dag: duplikatsjekken min på 0 rader, `find`-sjekken på utsjekkingsartefakter, og nå denne.)
  **RETTET:** 15 manglende modellfiler kopiert inn (27 av 27 nå), og omkjøringen lenket bak iterasjon 13 med
  **strammet sikring** – avviser `NaN`/`n/a` OG krever ≥ 2000 runder, ikke bare at linja finnes.
- **13:28 (14. sep) FØRSTE ÆRLIGE PORT – OG DEN AVSLØRTE EN SKALAFEIL SOM VILLE FROSSET LØKKA FOR ALLTID.**
  ```
  HOLDOUT (ren rapport, ingen beslutning): +1,03 ± 0,27
  HELPORT: K1 0,91 ± 0,27 er dårligere enn beste 1,24 ± 0,21 (nett 11) → RULLET TILBAKE
  ```
  **FEILEN:** `beste.txt` inneholdt `11 1.24 0.21`, målt på **ALLE 273 kampene** i iterasjon 10. Porten målte
  iterasjon 12 på **UTVALGET (150 kamper)** og sammenliknet mot det. Epler mot pærer.
  **To konsekvenser, den andre verre enn den første:**
  1. Tilbakerullingen skjedde på ugyldig grunnlag. **Iterasjon 12s nett er TAPT** – slott 13 er nå bit-identisk
     med `beste/` for vrak, tro, kort og budq. Kortnettet som ble godkjent på BEGGE tall (0,7898 < 0,8081,
     SENT 0,2694 ≤ 0,2914) finnes ikke lenger. Reell kostnad.
  2. **Hver framtidige iterasjon ville blitt målt mot 1,24 og rullet tilbake** – løkka ville stått fast på nett 11
     for alltid, og hver runde ville sett ut som «ingen framgang» uten at noe var galt med treningen.
  **RETTET:** `adams-max-loop-v12.sh` med feilen dokumentert i hodet, og `beste.txt` flyttet til
  `beste.txt.ugyldig-alle-kamper` så første iterasjon under v12 setter en **utvalgs-grunnlinje**. `beste/`-nettene
  beholdes. Sikkerhetskopi: `beste.txt.foer-skalafiks`.
  **MERK AT TALLENE SELV ER OPPMUNTRENDE:** holdout **+1,03 ± 0,27** er det første K1-tallet i prosjektets
  historie målt på kamper porten aldri har sett – og det ligger over utvalgets 0,91. Med SE 0,27 er de to ikke
  til å skille, men holdouten viser ingen tegn til at de tidligere tallene var oppblåst av seleksjon.
- **12:38 (14. sep) FELLES PULJE GJØR DET VERRE – SIGNIFIKANT, OG SPÅDD PÅ FORHÅND. PROGRAMMET MOT ARGMAKS-STØYEN ER UTTØMT.**
  | gruppe | i.i.d. | felles pulje | parret |
  |---|---|---|---|
  | **ALLE (forhåndsregistrert)** | 43,0 % ± 1,4 | 45,0 % ± 1,4 | **+2,0 ± 1,0 pp (z 2,05)** |
  | **stikk 0–3** | 60,5 % ± 2,3 | 66,6 % ± 2,2 | **+6,1 ± 1,5 pp (z 4,06)** |
  | stikk 8+ | 8,7 % | 6,5 % | −2,2 ± 1,8 |
  Verst nøyaktig der forspranget ligger. **Sonden forutsa det FØR målingen:** distinkte verdener 48,0 → 27,4,
  spredning mellom trekk SD 0,059 → 0,138. Deler man puljen blir verdenene KORRELERTE, og korrelerte verdener gir
  MER varians i argmaks. Fordelingen ble riktigere (RMS-skjevhet 0,0946 → 0,0789) – og det hjalp ikke.
  **FEM ANGREP, FEM NEDERLAG – hele programmet er nå uttømt:**
  | grep | endret | resultat |
  |---|---|---|
  | flere verdener 12→192 | antall | gulvet 44,6 → 37,1 % (16× for 7,5 pp) |
  | σ-porten 1,5 / 2,5 | når nettet overstyrer | K1 −0,060 ± 0,125 / −0,155 ± 0,128 |
  | adaptiv fordeling | budsjettfordeling | −0,8 ± 1,1 (stramt null) |
  | stratifisering | utvalgsrekkefølge | +1,2 ± 1,5 (spådd null, truffet) |
  | **felles pulje** | **puljenes innhold** | **+2,0 ± 1,0 – VERRE, spådd** |
  **KONKLUSJONEN: støyen er ikke en feil som kan fikses – den er PRISEN for en skarp tro og 48 verdener.**
  Referansepuljens ESS er median **~52 av 16 384**: troen konsentrerer nesten all vekt på noen få titalls
  verdener. Å trekke 48 ganger fra en så spiss fordeling ER ustabilt, og hver smartere trekning er enten
  virkningsløs eller verre.
  **KORREKSJON AV MIN EGEN KONKLUSJON (agentens sluttrapport):** «støyen er prisen for en skarp tro» er for
  pessimistisk. **De 48 UAVHENGIGE puljene ER variansreduksjonen** – hver beslutning midler over 48 uavhengige
  trekk, og det er derfor argmaks er så stabil som 43 %. Felles pulje FJERNET den midlingen (distinkte verdener
  45,3 → 25,5, spredning 2,3×). Uavhengigheten er altså en styrke å bevare, ikke en svakhet å fjerne.
  **ÉN RUTE JEG FEILAKTIG ERKLÆRTE LUKKET STÅR FORTSATT:** stratifiser på en størrelse som er **DELT på tvers av
  puljene** – hvor et bestemt kort ligger, hvordan trumfen er fordelt – og **behold de 48 puljene og midlingen**.
  Det er den ene uprøvde varianten, og den er nå godt spesifisert.
  Angeret mot fasit ble også verre (**+0,31 ± 0,13 diff, +0,38 ± 0,18 lag**) – sterkere bevis enn gulvet, fordi
  det måler kvalitet og ikke bare ustabilitet. Kostnad: 0 av 1320 rader ulike i verdener/utspillinger, +1,67 ±
  4,64 ms. Ingen K1-spek levert, i tråd med agentens egen forhåndsregistrerte regel.
  **AVKLART 12:45 – TESTTALLENE STÅR, TYPESJEKKENE GJØR DET IKKE.** Motoren er «avhengighetsfri» (package.json)
  og `npm test` er `node --test test/*.test.ts`, altså TypeScript direkte uten pakker – **alle prøvekjøringer i
  dag er gyldige**, og det er de som bærer «av er av», budsjettlikhet og bit-identitet. Men `devDependencies`
  lister `typescript` og `@types/node`, og `node_modules` er tom i **alle** arbeidskopier: `amb-krav`,
  `amb-loop` og `amb-krav-batteri` er alle lenker til den tomme `amb-seier/node_modules`. **Dagens
  «typesjekk ren»-påstander er derfor uten dekning**, unntatt pulje-agentens, som lånte typer read-only.
  Endrer ingen konklusjon – de hviler på målinger og prøver – men det er en stille svikt av samme familie som
  resten av døgnet. Tiltak når maskinen er ledig: `npm ci` i `amb-seier`, så gjenopprettes alle lenkene samtidig.
  **OPPRINNELIG FORBEHOLD: `D:\amb-seier\node_modules` er TOM**, og flere agenter kobler («junction») dit
  for typesjekk. Dagens «typesjekk ren»-påstander kan ha kjørt uten `@types/node`. Pulje-agenten lånte typer
  read-only fra hovedarbeidskopien i stedet. Merk også at `tsconfig.json` ekskluderer `test`/`examples`, så
  tidligere notaters «én feil i hele repoet» egentlig er «én feil i `src`».
  **DET ETTERLATER TO VEIER: den delte stratifiseringen over, og – større – ikke bruke argmaks over utspillinger.** Destiller søket ned i en lært funksjon, så
  valget kommer fra et nett i stedet for fra 48 støyete simuleringer. Det er innovasjonsspor 2, det eneste
  uprøvde – og `dekomp.md` gjør det ekstra interessant: nettene ALENE er par med mennesket, mens søket gir +0,72.
  Klarer destillasjonen å fange det søket vet, får vi både styrken og ~100× farten.
- **12:05 (14. sep) FELLES PULJE BYGD – og sonden peker mot at gulvet kan STIGE.**
  `~pulje=felles` på `pulje-2026-09-14` (`e97a6a5`, `3820e72`): én felles pulje på V·k = 1536 kandidater,
  verdenene valgt med en rist over den DELTE kumulative vekten. Fem kildefiler.
  **TO KORREKSJONER AV MITT OPPDRAG, begge bærende:**
  1. **Trekningen blir ikke dyrere.** Dagens kode trekker alt 48 puljer × 32 = **1536** kandidater og vekter alle.
     Felles pulje er samme antall; det nye er én sortering og et binærsøk per verden.
  2. **RNG-strømmen måtte bevares med vilje.** Dagens strøm er `[32 trekk][1 rng][32 trekk][1 rng]…`. En naiv
     felles pulje som trekker alle 1536 først ville fått ANDRE kandidater fra nr. 33 og ut – to endringer i én
     arm, nøyaktig fella jeg advarte mot 11:40. Løsningen beholder blokkstrukturen og slår sammen bare UTVALGET,
     så kandidatpuljene er bit-identiske med i.i.d. på samme frø.
  **SONDEN TALER MOT HYPOTESEN, og mekanismen er reell:** fordelingen ble RIKTIGERE (RMS-skjevhet 0,0946 →
  0,0789), men **spredningen mellom trekk mer enn doblet seg (SD 0,059 → 0,138)**, og distinkte verdener falt
  **48,0 → 27,4**. En felles pulje betyr at verdenene deles fra samme endelige mengde – de blir KORRELERTE.
  Støygulvet måler nøyaktig den spredningen, så det kan stige. Spådom og A/B/C-beslutningsregel skrevet til
  `pulje-spaadom.txt` FØR måling.
  Sidefunn på mye større utvalg: referansepuljens ESS kollapser til median **~52 av 16 384** – uavhengig
  bekreftelse av at troen er ekstremt skarp (`troledd.md` målte ESS/K 0,179).
  Av er av verifisert i to ledd: tom fingeravtrykk-diff over 120 stillinger (~28 320 flyttall) i to atskilte
  arbeidskopier, OG `~pulje=blokk` (samme nye kodesti, blokkvis utvalg) bit-identisk med av i 0/240 repetisjoner –
  som isolerer selve velgeren som eneste forskjell.
- **11:40 (14. sep) STRATA-AGENTENS SLUTTRAPPORT ADVARER MOT DET JEG NETTOPP BESTILTE.**
  **Å slå de 48 puljene sammen til én på 1536 er IKKE ren variansreduksjon** – det flytter SIR-skjevheten fra
  M=32 til M=1536, altså **to endringer i én arm**, nøyaktig fella `bandit.md` §3 beskriver. Strata-agenten valgte
  derfor bevisst å stratifisere INNE i hver pulje: RNG-nøytralt (én `rng()`-kall i begge grener), beviselig
  forventningsrett, kandidatpuljene bit-identiske mellom armene.
  **Jeg lar pulje-agenten gå likevel**, fordi (a) den er instruert til å lese `strata.md` først, og (b) den er
  pålagt forventningsretthetstest mot i.i.d. – som vil FANGE en distribusjonsendring, ikke skjule den. Agentene
  har korrigert mine premisser fire ganger i dag. Men risikoen er notert: blir svaret «gulvet falt», må det
  kontrolleres om fallet kommer fra variansen eller fra at fordelingen ble en annen.
  **DEN LUKKEDE FAMILIEN:** systematisk resampling, antitetiske uniformer og lavdiskrepans-sekvenser over `u`
  angriper alle et ledd som bærer **0,3 %**. Klumpingen ligger i puljenes INNHOLD, ikke i utvalget fra dem.
  Alt som endrer innholdet endrer fordelingen – og kan da ikke selges som variansreduksjon.
- **11:35 (14. sep) STRATA MÅLT: null, og den FORHÅNDSREGISTRERTE spådommen traff.**
  | gruppe | i.i.d. | strata | parret |
  |---|---|---|---|
  | **ALLE (forhåndsregistrert)** | 43,0 % ± 1,4 | 44,2 % ± 1,4 | **+1,2 ± 1,5 pp (z 0,81)** |
  | stikk 0–3 | 60,5 % | 62,7 % | +2,2 ± 2,5 |
  | stikk 8+ | 8,7 % | 7,6 % | −1,1 ± 1,5 |
  | 2 lovlige | 17,0 % | 21,1 % | +4,1 ± 2,0 (z 2,08) – én av ni ekstra, og med to kort er det knapt noe å stratifisere |
  Ingen bevegelse, om noe nominelt verre. **Det sterke her er at mekanismeanalysen (variansreduksjon 0,997)
  SPÅDDE nullet før målingen, og spådommen ble skrevet til disk på forhånd.** Når en strukturell analyse
  forutsier utfallet, er diagnosen sterk – og da peker den på nøyaktig én gjenstående fiks: **felles
  kandidatpulje**. Bygging startet 11:35.
- **11:15 (14. sep) STRATIFISERING KAN IKKE VIRKE SLIK SAMPLEREN ER BYGD – og DET er funnet, ikke nullet.**
  `~trekk=strata` bygd på `strata-2026-09-14` (`ef0ec33`, `f2c0e75`, `202b063`), fem kildefiler.
  **Variansreduksjon: 0,997 – altså ingen.** Agenten **forhåndsregistrerte** spådommen om null til disk FØR
  kjøringen, så den ikke kunne justeres etterpå.
  **DEN STRUKTURELLE ÅRSAKEN:** `trekkVerdener` trekker hver av de 48 verdenene fra sin **EGEN UAVHENGIGE
  kandidatpulje**. «Rangering 0,9 i pulje A» og «rangering 0,9 i pulje B» er urelaterte verdener – risten man
  stratifiserer langs bærer **ingen felles struktur**. Stratifisering på vekt-kvantil kan derfor ikke fungere,
  uansett hvordan den stilles inn.
  **HVA DEN EKTE FIKSEN MÅ VÆRE: én FELLES kandidatpulje for alle 48 verdenene**, i stedet for 48 uavhengige.
  Først da får risten en akse å virke langs, og først da kan antitetiske par også kansellere. Det er en
  ombygging av `trekkVerdener`, ikke en knott – og det er nå den eneste gjenstående hypotesen om argmaks-støyen.
  Verifikasjonene er sterke: **av er av** med tom fingeravtrykk-diff over 120 stillinger × 48 verdener (hver
  verdi per kandidat per verden, σ og margin, 9 desimaler), kjørt i to atskilte arbeidskopier så ingen redigering
  kunne blande dem. **Forventningsretthet** ren: snitt |skjevhet| 0,0033 mot MC-SE 0,0044, 0 av 1297 celler over
  3 SE, 0 avvik i RNG-kall. Prøver 1028→1036, 4 røde før og etter, navn for navn.
  To prosessnotater verdt å beholde: agenten **forkastet sin første grunnlinjekjøring** fordi `node --test`
  importerer filer progressivt, så en «før»-kjøring delvis ville lest «etter»-kode – tok den om igjen i en isolert
  arbeidskopi på `092cd00`. Og en syntetisk kontroll av oppsummereren fanget at den skrev `z=1,6e16` der den
  klyngede SE-en kansellerer til flyttallsrester – rettet før de ekte tallene landet, ikke etter.
- **11:05 (14. sep) ADAPTIV FORDELING AVGJORT PÅ FULL STYRKE: STRAMT NULL – og diagnosen er skarpere enn tallet.**
  1320 beslutninger, 12 klynger (mot 150 og 2 i pilotkjøringen):
  | | jevn | halv | parret |
  |---|---|---|---|
  | **støygulvet** | 43,0 % | 42,2 % | **−0,8 ± 1,1 pp (z −0,71)** |
  | anger mot eksakt løser | – | – | −0,05 ± 0,11 poeng |
  | **kortet som SPILLES** | 53,8 % åpen port | 64,2 % | **+5,5 ± 1,3 pp – FEIL VEI** |
  **Dette er et STRAMT null, ikke et underdimensjonert:** SE på 1,1 pp ville fanget et fall større enn ~2,2 pp.
  Riggen reproduserer grunnlinjen uavhengig (43,0 % mot `troledd.md`s 43,8 %).
  **HVOR VARIANSEN FAKTISK SKAPES – dette er funnet:** omfordelingen gjorde alt den lovet (finalistene får 78,9
  verdener mot 48, knotten endrer kortet i 24,6 % av stillinger med ≥3 lovlige). Men **variansen skapes i RUNDE 1,
  der utsilingen skjer på 16 verdener.** Det som spares på slutten, legges tilbake i starten. Sekvensiell
  halvering kan derfor ikke løse dette uansett hvordan den stilles inn.
  **OG KNOTTEN ER TO ENDRINGER I ÉN ARM:** σ måles over ~2× verdener, så porten åpner oftere (53,8 → 64,2 %) og
  det spilte kortet blir MER ustabilt. En framtidig prøve må holde σ-effekten fast.
  Kostnad som designet: identiske utspillinger (0 av 1320 rader brukte flere), veggtid +1,3 % fra ekstra
  verdenstrekk – rapportert som en reell om liten kostnad, ikke rundet til «uendret».
  **Ingen spek levert til K1 – med rett.** Oppdraget gjorde det betinget av at gulvet falt.
  Utfyllende tall fra sluttrapporten: `5+ lovlige` – raden som skulle bære alt – er **−1,2 ± 2,0**. Anger n=166
  skillende (569 flate forkastet), −0,05 ± 0,11 diff og −0,00 ± 0,13 lag. «Av er av» på to uavhengige bein: tom
  diff over 120 stillinger (fingeravtrykk over hver verdi per kandidat per verden, σ og margin) **og** 0 avvik i
  alle 342 målte k=2-beslutninger.
  **BILLIGSTE NESTE PRØVE, agentens forslag og et godt et:** én kolonne til i samme rigg – *hvor ofte kastes den
  jevne fordelingens beste kort allerede i runde 1?* Det ville bekrefte eller avkrefte runde-1-diagnosen direkte,
  uten en ny mekanisme.
  **HENDELSE:** første kjøring startet **seks** arbeidere i stedet for tre (to sett med samme frø som appendet til
  samme filer). Det ville doblet hver rad og krympet den klyngede SE-en lydløst. Fanget av en prosessjekk, alt
  drept, delresultater slettet, omstartet med vakt mot dobbeltstart. Duplikatkontroll på sluttdataene: 0.
  Og: `git worktree add` sjekket først ut STAMMEN direkte i bandit-kopien (den var ikke utsjekket noe annet sted);
  rettet umiddelbart med `git switch -c`. Stammen verifisert urørt på `092cd00` etterpå.
  **KONSEKVENS FOR RETNINGEN:** tre uavhengige forsøk har nå angrepet argmaks-støyen (flere verdener 12→192,
  σ-porten, adaptiv fordeling) og alle er null. Variansen sitter i **selve verdenstrekningen**, ikke i hvor mange
  verdener hvert kort får eller når nettet får overstyre. Neste form er felles tilfeldighet på tvers av trekk
  eller stratifisert verdensutvalg – en ombygging av sampleren, ikke en knott.
- **10:12 (14. sep) KOLLISJON MELLOM MIN EGEN KJØRING OG AGENTENS – rådataene er borte, tallet står.**
  Agenten armerte en venter FØR den avsluttet. Jeg visste ikke det, startet `bandit-kjor.sh 4 4` manuelt 10:02,
  og fikk sammendraget 10:08. Kl. 10:10 fyrte agentens venter og startet sin egen kjøring (4 kamper × 3 runder),
  som begynner med `rm -f` på `analyse/bandit-w*.jsonl` – **rådataene bak 10:08-tallene er slettet.**
  Sammendragsfila er intakt, så tallene i forrige punkt står, men de kan ikke etterprøves mot rådata.
  **DUPLIKATSJEKKEN MIN VAR VERDILØS OG BESTO:** jeg kjørte den mot en glob som ikke matchet noe, og den meldte
  «REN – ingen dobbeltskriving» på **0 rader**. Samme feilform jeg har fanget hos andre i to døgn – en kontroll
  som består fordi den ikke måler noe. Rettet ved å telle filer først.
  **TILTAK:** stoppet den store kjøringen jeg selv hadde lenket bak K1-armene (`bcj70qvyg`) – den ville skrevet
  til de samme filnavnene som den pågående og doblet radene, nøyaktig den forurensningen agenten selv fanget
  tidligere i dag (seks arbeidere i stedet for tre). Den ventet ennå, så ingen måling ble avbrutt.
  Agentens kjøring får gå: 4×3 er sammenliknbart med mitt 4×4, og å drepe en tredje kjørende måling i dag ville
  gjentatt feilen jeg alt har lagret som lærdom. Vakt `b7ohq3ofq` armert på den.
  **REGELEN JEG MANGLET:** før jeg starter en rigg en agent har bygd, må jeg sjekke om agenten selv har køet den.
  Samme klasse som lenkefeilen 20:15 i går, der `grep FERDIG` traff en STARTLINJE.
- **10:08 (14. sep) ADAPTIV FORDELING: INGEN EFFEKT PÅ STØYGULVET – men målingen er for liten til å avgjøre.**
  | gruppe | jevn | halv | parret |
  |---|---|---|---|
  | **alle (n=150)** | 45,3 % ± 4,1 | 43,3 % ± 4,0 | **−2,0 ± 2,5 pp (z −0,80)** |
  | kortet som FAKTISK spilles | 37,3 % | 41,3 % | **+4,0 ± 3,8 pp** (feil vei) |
  | stikk 4–7 | 54,2 % | 47,9 % | −6,3 ± 2,9 (z −2,19) |
  | 3–4 lovlige | 23,7 % | 28,9 % | **+5,3 ± 2,1 (z +2,54)** |
  | 5+ lovlige | 72,6 % | 65,8 % | −6,8 ± 3,8 (z −1,80) |
  Hovedtallet er null. De to signifikante undergruppene peker i HVER SIN RETNING og er beste-av-ti – ingen av dem
  skal leses som funn uten egen forhåndsregistrert prøve.
  **MEKANISMEN VIRKER SOM KONSTRUERT, det er ikke der feilen ligger:** budsjettet er uendret (255,3 mot 255,4
  utspillinger, 0 av 150 rader brukte flere), tiden er uendret (+0,4 %), og **beste kort vurderes nå i 84,5
  verdener mot 48**. Omfordelingen skjer; den hjelper bare ikke.
  **GRUNNLAGET ER FOR TYNT TIL Å KONKLUDERE:** 150 beslutninger i 3 kamper, og angeret hviler på **13 skillende
  stillinger i 2 klynger** (jevn 1,321 mot halv 0,026, z −1,53 – et stort tall på et grunnlag som ikke bærer det).
  En SE klynget på to kamper er ikke en SE. Større kjøring køet bak iterasjon 12.
  **HYPOTESEN ER IKKE AVKREFTET, MEN DEN ER SVEKKET PÅ ET PRESIST PUNKT:** at argmaks er støydominert er målt
  (43,8 %), og at halveringen konsentrerer budsjettet er målt (48 → 84,5 verdener på beste kort). Likevel faller
  ikke skiftefrekvensen. Det peker mot at variansen ikke ligger i HVOR MANGE verdener hvert kort vurderes i, men i
  HVILKE verdener som trekkes – altså i selve trekningen, ikke i fordelingen. Det er en annen og dyrere fiks
  (felles tilfeldighet på tvers av trekk, eller stratifisert verdensutvalg).
- **10:02 (14. sep) ADAPTIV BUDSJETTERING BYGD OG VERIFISERT – støygulvsmålingen startet.**
  `~fordel=halv` (sekvensiell halvering) på gren `bandit-2026-09-14` i `D:\amb-bandit`, to commits
  (`e87864d` implementasjon, `72971ce` prøver + målerigg). Arbeidskopien er ren, kildene hele.
  **NI PRØVER, ALLE GRØNNE** – og tre av dem er de som gjør resten troverdig:
  - **BUDSJETTET HOLDER:** over 40+ stillinger bruker halveringen *aldri* flere utspillinger enn den jevne, og
    aldri mer enn `k` færre. Dette er en OMFORDELING, ikke en fordyrelse – og heller ingen stille innsparing.
  - **PARRINGEN HOLDER:** finalistene har like lange `perVerden`, `n > K`. Uten dette ville vi innført nettopp
    den variansen knotten skal fjerne.
  - **k = 2 ER BIT-IDENTISK:** samme `n`, `utspillinger`, `sigma` og verdi per verden. Med to kandidater er det
    ingenting å halvere, og da skal den ikke røre noe.
  Dessuten: av er av strukturelt (`fordeling` er `null` uten feltet), `~fordel=` og `~mlbu=` kan stå i begge
  rekkefølger uten kollisjon, ugyldige verdier kaster, `utenSøk` urørt, og knotten BITER ved ≥ 3 kandidater.
  Grunnlinje av prøvene tatt først: 1028 tester, 4 røde, alle fire pre-eksisterende og utenfor `sik:`-grenen.
  **MÅLTALLET ER STØYGULVET, IKKE K1** – dagens 43,8 % argmaks-skifte ved ren omtrekking skal FALLE. Målbart på
  minutter i stedet for 2,5 t per arm. Riggen (`verktoy/bandit-kjor.sh`, 3 arbeidere × 4 kamper × 4 runder)
  skriver fra prosessen selv til `analyse/bandit-w*.jsonl` – ikke gjennom et stdout-rør, med eksplisitt henvisning
  til at den feilen har kostet prosjektet en hel kjøring før. Startet 10:02, vakt `bsg4dm04l`.
- **09:45 (14. sep) BUDVANE-SPORET ER DØDT – og det korrigerte to premisser jeg selv ga agenten.**
  **MINE FEIL, begge verifisert i koden:**
  1. «Hele budrunden er logget i `budrunde`» – **nei, feltet står i 1 av 4448 runder.** Botenes mellombud og
     auksjonsrekka finnes ikke i loggen. Agenten bygde i stedet fra menneskets egne `valg-bud` + determinstisk
     giv: 2641 rader, 0 avviste, nøyaktig K1s rundetall.
  2. «K6 er aldri testet på budet» – **nei.** `budq-8.bin` og `budq-12.bin` er begge **inn=323 = 143 budtrekk +
     144 HUKOMMELSESKOLONNER + 36 stilling**, løkka trener med `--hukommelse --sanser2`, og `hukommelse.ts`
     bokfører budavvik/passtyrke/budandel (MESO) og budavvikMotStilling/budavvikMotTid (MAKRO). Vanene i
     budrunden ER koblet, og fella fyrte alt i iterasjon 2 («fremmed bok bedre enn egen», z −5,3).
  **MÅLINGEN** (log-tap over 5 klasser, 5-delt kryssvalidering på kamp, klyngebootstrap B=20 000):
  | arm | resultat |
  |---|---|
  | positiv kontroll: skjult hånd (ulovlig) | **−0,179 ± 0,010 nats (z −18,2)** – instrumentet ser signal |
  | **egen bok − fremmed bok** | **+0,0105 ± 0,0040 (z +2,62)** – egen bok er DÅRLIGERE |
  | fremmed KAMP-bok ved samme rundenummer | **−0,0167 (z −4,97)** – beste lovlige arm |
  **KONFUNDEN SOM FORKLARER FIRE TIDLIGERE «PROFIL»-RESULTATER:** «egen historikk» så lovende ut over alle
  spillere (−0,0180, z −3,66) og forsvant innen spiller A (z −1,03). **A er 87 % av korpuset (2298 av 2641
  runder), så «As egen historikk» ≈ «alle mennesker».** Det målte at boka er STOR, ikke at den er riktig.
  **SIDEFUNNET ER VIKTIGERE ENN HOVEDRESULTATET: boka bærer «hvor er vi i kampen», ikke «hvem er dette»** – og
  rundenummeret er allerede en BudQ-inngang (`v[BUD_DIM_V2+2] = min(1, rundeNr/20)`). Det lukker også
  innovasjonsspor 4 (modeller mennesket over løpet) et godt stykke: kampfasen er alt fanget.
  Dynamikk innen kampen: hypotesen har FEIL FORTEGN – han byr **lavere** etter tap (−0,10, z −2,16, beste-av-seks).
  Leder/ligger bak: null. Del 2 ikke utført, i tråd med stoppregelen. Budets nåbare gap er dessuten alt målt til
  −0,43 ± 0,51 poeng/runde – **budet er på taket**, så det finnes ingen positiv størrelse å konvertere.
  Forbehold: to spillere med reell vekt. Bevis mot en STOR utnyttbar budprofil i disse dataene, ikke mot null.
- **08:00 (14. sep) EIEREN BA OM INNOVASJON, IKKE FLERE TESTER – FEM SPOR, TO STARTET.**
  Han har rett i kritikken: vi har målt mye og bygd lite nytt. Fem retninger som er NYE MEKANISMER, ikke knotter,
  og som alle følger av det som er målt:
  1. **Adaptiv fordeling av utspillinger (STARTET 08:00, `D:\amb-bandit`).** Søket bruker 48 verdener likt på alle
     lovlige kort, og argmaks skifter i **43,8 %** av valgene av ren omtrekking. I en typisk stilling er 2–3 av 6
     kort reelle kandidater. **Sekvensiell halvering**: gi alle noen få verdener, kast de dårligste, doble for
     resten. Samme totalbudsjett, oppløsningen havner der to kort faktisk konkurrerer. **Dette er det eneste
     grepet som angriper variansen som variansproblem** – de syv foregående forsøkene ga bedre INFORMASJON til en
     mekanisme som kaster den. Måltall er støygulvet (43,8 % skal falle), ikke K1 – målbart på minutter.
  2. **Destiller søket ned i nettet, og finn ut hvorfor det ikke virker (ikke startet).** Løkka trener alt
     kortnettet på søkets etiketter, likevel er nettet alene PAR med mennesket mens søket gir +0,72. Noe søket vet
     kan nettet ikke representere. Lykkes dette, blir boten ~100× raskere uten å tape styrke.
  3. **Utnytt motstanderens BUD, ikke kortene (STARTET 08:00, `D:\amb-budvane`).** Budet bærer +0,62 av +1,24, og
     K6 er ALDRI testet der – alle seks vaneforsøk har handlet om å gjette kort, og alle målte null. Mennesker byr
     forutsigbart: for høyt etter tap, for lavt når de leder. Fremmed-bok-fella er obligatorisk.
  4. **Modeller mennesket i LØPET, ikke i runden (ikke startet).** Over 26 runder tilter folk og blir forsiktige.
     Ingenting i Adams Max ser den dynamikken.
  5. **Mål utnyttbarhet, ikke styrke (ikke startet).** Boten er deterministisk (`D`). Mot et menneske som lærer
     over et løp er det en svakhet ingen av målingene våre kan se – alle måler styrke mot en FAST motstander.
- **07:35 (14. sep) SØKEFOKUS BYGD – og den korrigerer en antakelse i mitt eget oppdrag.**
  Implementert og committet (`cac2b6e` på `sokfokus-2026-09-14`): **`~stikk=<fra>-<til>`** som `~`-felt, 1-basert
  og inklusive, portet i `Sikkerorakel.velgHandling` rett etter rolleporten og før `tellere.beslutninger++`.
  **AV ER AV strukturelt** – nøkkelen utelates helt fra opsjonsobjektet, og `~stikk=1-12` er målt bit-identisk
  med ingen knott over 120 stillinger. Regresjon: 1013 → 1021 prøver, **22 feil før og etter med identisk
  feilmengde** (SKRALLE var alt rød på `9aaed8e`). Vinduet fyrer ende-til-ende i den ekte produksjonsspeken:
  `vindu5-8` koster 0,2–0,3 ms per beslutning mot arm A-s 501 ms, med stikk 1–4 til full pris.
  **KORREKSJONEN: 96 VERDENER ER IKKE KOSTNADSNØYTRALT.** Jeg antok at å slå av sluttspillet frigjorde nok tid til
  å doble verdenene. Feil – **stikk 9–12 er bare 2,3 % av botens arbeid**. Den virkelige besparelsen ligger i
  **stikk 5–8, som er 37 %**.
  | arm | kostnad per runde | mot A |
  |---|---|---|
  | A – dagens, 48 verdener hele runden | 16,2 s | – |
  | **B – 48 verdener, bare stikk 1–4** | **10,6 s** | −35 % |
  | C – 96 verdener, stikk 1–4 | 21,7 s | +34 % |
  | D – 192 verdener, stikk 1–4 | 44,7 s | +176 % |
  **6-RUNDERS REPRISEN LANDET 07:37 – OG OPPGRADERINGEN ER GRATIS:**
  | arm | per kortvalg | per runde | framskrevet per løp |
  |---|---|---|---|
  | A6 – dagens, 48 verdener hele runden | 579 ms | 20,8 s | 554 s |
  | **B6 – 48 verdener, kun stikk 1–4** | 413 ms | **14,9 s** | **396 s** (−28 %) |
  | **E6 – 72 verdener, kun stikk 1–4** | 530 ms | **19,1 s** | **508 s** (−8 %) |
  **E6 gir 50 % FLERE verdener der forspranget ligger og koster likevel MINDRE enn dagens bot.**
  **KOSTNADSMODELLEN, som retter to av mine egne påstander:** kostnaden er IKKE proporsjonal med verdener – det er
  et fast ledd per beslutning, **≈ 6,35 + 0,177·V sekunder per runde**. Break-even er derfor **V ≈ 82**, ikke 72;
  vi kan gå til 82 verdener før vi er tilbake på dagens pris. Og besparelsen ved vinduet er **28 %**, ikke to
  tredjedeler: sluttspillet er bare **1,5 %** av botarbeidet, mens det frigjorte ligger i stikk 5–8 (31,6 %).
  **STØYEN ER REELL:** samme arm A ga 16,2 s/runde over 2 runder og 20,8 over 6 – ~25 % sprik på en maskin som
  samtidig kjører iterasjon 12. Rangeringen hviler bare på A6/B6/E6 målt rett etter hverandre.
  **ARM B ER EN FALSIFIKASJONSTEST, ikke bare en billigere variant:** 48 verdener i stikk 1–4 forventes å gi
  UENDRET styrke. **Faller den signifikant, er dekomponeringen feil** – og det ville vært like verdifullt.
  Fordelingen bekrefter at vinduet virker som tiltenkt: **99,8 % av botarbeidet ligger nå i stikk 1–4**, mot
  0,0 % i stikk 5–8 og 0,1 % i stikk 9–12.
  **K1-dommen over B og E er lenket bak iterasjon 12** (`bj97k91ly`), med den eksisterende grunnlinjen
  (+0,99 ± 0,19, samme nett og frø) som arm A – sparer 2,5 t.
  **`eks:3Lt2000` skal IKKE slås av i samme arm.** Agenten avviste det med rett begrunnelse: da måler kjøringen
  to endringer og kan ikke tilskrive noen av dem. Men den noterer at saken blir LETTERE å tolke etterpå – med
  vinduet på er søket av i stikk 5–12, så `eks:` blir det eneste laget som fortsatt griper inn i et bånd målt til
  +0,00 pp, og effekten er ikke lenger maskert av søket. Egen arm senere.
  MERK for utrullingen: arm B er **35 % billigere enn dagens** og legger all sparing i ledd som bærer 0,06 og
  0,00 pp. Det er den formen en utrullingskandidat bør ha – flytte søket, ikke kutte det.
- **07:12 (14. sep) SØKEFOKUS-AGENTEN FORSVANT – men designet er landet og skal ikke gjøres om igjen.**
  Null prosesser, null commits, null ukommitterte filer, `sokfokus.md` frosset midt i en setning kl. 04:51
  (2 t 20 min stille). Arbeidskopi `D:\amb-sokfokus` og gren `sokfokus-2026-09-14` finnes, tomme.
  **DESIGNET SOM ER BESTEMT (fra `sokfokus.md`, gjenbrukes ved relansering):**
  - Formen er **`~stikk=<fra>-<til>`**, plassert blant `~`-feltene i verdensfeltet, IKKE som bokstavknott.
  - Begrunnelsen er sterk: `agentspek.ts:1246-1251` plukker `~`-feltene FØRST, før all bokstavparsing, fordi en
    filsti kan inneholde `a`, `k` og `s`. Feltet er dermed strippet før `D`/`M`/`L`/`s`/`a`/`e`/`k` leses –
    **ingen kollisjon i det hele tatt**.
  - `utenSøk` er urørt: den splitter på `:` og hopper tre felt, og `~stikk=1-4` inneholder ikke kolon, så
    feltantallet er uendret og rollout-motparten strippes bit for bit som før.
  - Parser-løkken for `~`-arter kaster allerede på ukjent art, så feilskriving fanges.
  - **1-basert, inklusive i begge ender.** `~stikk=1-4` = de fire første stikkene = nøyaktig raden «kortspill
    stikk 1–4» i `dekomp.md`. Internt er `state.stikkSpilt` 0-basert (fullførte stikk), så porten er
    `stikkSpilt + 1` mot intervallet. Valgt så speken kan leses side om side med dekomponeringstabellen.
  Agenten stoppet 07:12 for å unngå to agenter på samme gren; relanseres med designet overlevert.
- **07:08 (14. sep) ITERASJON 11: K1 1,19 ± 0,20, 17 rader, nettene beholdt. MAGRESTE TRENING HITTIL.**
  | nett | resultat |
  |---|---|
  | tro | **beste epoke 0** – ingen forbedring i det hele tatt (0,92715 → 0,92715) |
  | kort | 0,7985 mot 0,7985 → **forrige nett beholdes** |
  Første gang BEGGE står stille samtidig. Passer med at sluttspillet bærer 0,00 pp og at troen har flatet ut på
  tre uavhengige mål (skaleringskurven, beste-epoke 1 i it. 9, beste-epoke 0 nå).
  **VIKTIG FORBEHOLD JEG NESTEN MISSET:** K6-menneske og K8-menneske er BIT-IDENTISKE med iterasjon 10
  (stigning −0,003, felle +0,022 ± 0,011). Det er **ikke en replikasjon** – trohodet ble ikke oppdatert, så
  `tro-12` = `tro-11`, og radene er regnet på nøyaktig samme vekter. **Amiibo-signalet er fortsatt målt én gang.**
  Holdouten flettet inn i stammen etter at iterasjonen var ferdig: `9aaed8e → 092cd00`. Iterasjon 12 startet på
  **v11**, altså med porten på `utvalg` og holdout som ren rapport – første iterasjon der porten ikke ser alt.
- **02:10 (14. sep) HOLDOUTEN: JEG OVERTOLKET HALVDELENE – men konklusjonen står av en annen grunn.**
  **RETTELSE AV MEG SELV:** jeg leste «halvdel A flat, halvdel B stiger» som signaturen på seleksjon. Agenten
  kjørte **200 tilfeldige 50/50-delinger**: median +0,234, p10 +0,043, **p90 +0,441**. «+0,50 mot +0,03» er en
  helt ordinær trekning. Jeg leste et mønster inn i støy – samme feil jeg har advart agentene mot hele døgnet.
  | parret | alle | utvalg | holdout |
  |---|---|---|---|
  | iter10 − iter7 | +0,232 ± 0,149 (z 1,5) | +0,026 ± 0,200 | +0,496 ± 0,223 |
  | iter10 − iter1 | +0,388 ± 0,157 (z 2,5) | +0,205 ± 0,207 | +0,622 ± 0,242 |
  **Konklusjonen står likevel: iter7 → iter10 er ikke signifikant (z 1,5).** Oppgangen er UBEKREFTET, ikke
  motbevist. iter1 → iter10 (z 2,5) er maksimum over ti målinger valgt på nettopp disse dataene.
  **HISTORIEN KAN IKKE SVARE PÅ SPØRSMÅLET:** porten så alle 273 kampene i hver iterasjon 1–11. En retrospektiv
  deling er bare en oppdeling av det samme selekterte settet. **Delingen biter først fra iterasjon 12.**
  **HOLDOUTEN ER FOR LITEN FOR 0,3 pp:** parret SE ~0,20–0,24 på 123 kamper, så 0,3 pp gir forventet z ≈ 1,3 –
  under 30 % sjanse for å sees. Den skiller først fra ~0,45–0,50 pp, og **skal leses over flere iterasjoner**
  (iter12 mot iter16), ikke iterasjon for iterasjon.
  **PORTENS MARGIN PÅ 0,15 pp LIGGER UNDER SIN EGEN STØY (~0,20).** Porten tar beslutninger den ikke har
  oppløsning til å ta. Agenten lot den stå med vilje – endrer man målesettet og porten samtidig, ser man ikke hva
  som virket – men den bør tas opp for seg.
  Levert: `D:\amb-holdout` gren `holdout-2026-09-14`, låst deling i `analyse/k1-kampsett.tsv` (150 utvalg / 123
  holdout), `--kampsett`-flagg der `alle` er bit-identisk (verifisert to veier: samme SHA-256 som innsjekket
  dom-fil, og K1-raden tegn for tegn lik), og `adams-max-loop-v11.sh`. **CRLF-fella ble tatt før den smalt:** uten
  `.gitattributes` ville `"utvalg\r"` matchet null kamper og porten målt på tomt.
  **IKKE FLETTET INN ENNÅ – med vilje.** Iterasjon 11 kjører, og batteriets `spol()` skjer ved KRAV START som
  ennå ikke er nådd; å flytte stammen nå ville byttet kode midt i en iterasjon. v11 trengs uansett ikke før
  iterasjon 12. Flettes når iterasjon 11 er ferdig.
- **01:55 (14. sep) DEKOMPONERINGEN: FORSPRANGET ER HALVT BUD (på taket) OG HALVT STIKK 1–4 (mest rom).**
  2640 runder, ΔP fordelt på leddet der bot og menneske FØRST skilte lag, SE = klyngebootstrap på kamp B=20 000.
  Bootstrapen replikerer batteriets egen dom eksakt (+1,243 ± 0,209 mot +1,24 ± 0,21).
  | ledd | runder | bidrag til +1,24 | rom (nåbart tak) |
  |---|---|---|---|
  | **budet** | 595 (22,5 %) | **+0,62 pp** | ≤ +0,58 – **PÅ TAKET** |
  | vrak | 306 | +0,05 | på taket |
  | trumf + etterlyst | 56 | +0,03 | på taket |
  | **kortspill stikk 1–4** | 1496 (56,7 %) | **+0,49 pp** | **≤ +1,31 – MEST ROM** |
  | stikk 5–8 | 163 | +0,06 | – |
  | **stikk 9–12** | 17 (0,6 %) | **+0,00 pp** | ≤ +0,45 – **FERDIG** |
  **SLUTTSPILLET BÆRER NULL – nå målt tre uavhengige ganger** (0,6 % av rundene, +0,00 pp, boten enig med
  mennesket i 3 av 4 sluttspillvalg, fasiten flat i 79 %). To døgn med tro/søk/vekting/kriterium/temperatur/port
  ble brukt der utfallet er låst. Mistanken fra 01:35 er bekreftet.
  **DUPLIKATET ER IKKE RETTFERDIG I 23 % AV RUNDENE.** Byr boten annerledes, spilles runden på en annen kontrakt.
  55 % av forspranget (0,68 av 1,24) kommer derfra: ulik rolle 440 runder (+3,74 ± 0,83), samme rolle ulikt bud
  173 runder (+0,99 ± 1,00). **Den ekte samme-situasjon-K1 er +0,72 ± 0,19 på 2027 runder.** Fortsatt
  signifikant, men litt over halvparten av det batteriet rapporterer. Fellearmen bekrefter med motsatt fortegn
  (nevro −2,58 ulik rolle mot −0,29 samme).
  **DET MEST URODVEKKENDE TALLET: på de 2027 rettferdige rundene er nettene UTEN SØK PAR MED MENNESKET**
  (+0,21 ± 0,18, ikke signifikant). **Hele det rettferdige forspranget er søkets +0,51.**
  **KONSEKVENS FOR UTRULLINGEN, og den er alvorlig:** begge kandidatene fra i natt (F0, K3) kutter nettopp SØK for
  å komme innenfor appens 86 ms. Vi var i ferd med å rulle ut en versjon som skjærer bort det ene som virker.
  Ny retning for en utrullingskandidat: behold søket, men bruk det BARE der det betaler – stikk 1–4 – i stedet for
  jevnt utover. Søket flytter dessuten kontrakten i bare 24 av 2641 runder, så budsøk kan kuttes nesten gratis.
  Åpent forbehold agenten selv flagger: artefaktgulvet er ikke bundet (bare 7 runder hadde null uenighet), så
  motstanderbyttets bidrag kan ikke tallfestes. Bøtte-etikettene er målt uten søk; ΔP-tallene er søkearmens egne.
- **01:35 (14. sep) EIEREN SPURTE OM Å TENKE UTENFOR BOKSEN – OG ETT FUNN FRA I GÅR HAR VI IKKE TATT INNOVER OSS.**
  **Fasiten er flat i 79 % av sluttspillstillingene.** Kontrakten er avgjort når vi kommer dit. Vi har brukt to
  døgn på troen, søket, verdensvektingen, kriteriet, tempereringen og σ-porten – **alt sammen i den delen av
  spillet der utfallet stort sett er låst.** Det forklarer alle nullresultatene bedre enn noen av forklaringene
  jeg har gitt underveis. Runden avgjøres tidligere: i budet, vraket og de første stikkene.
  **FIRE TING SOM KANSKJE IKKE ER DET VI TROR:**
  1. **Vi vet ikke hvor K1-forspranget kommer fra.** ~1,1 pp per runde, men aldri dekomponert på bud / trumf /
     vrak / etterlyst / kortspill. Uten det jager vi i blinde. **Agent satt 01:35** (ren reanalyse, 3 kjerner).
  2. **Er duplikatet rettferdig?** Byr boten annerledes enn mennesket, spilles resten av runden på en ANNEN
     kontrakt – da sammenliknes ikke samme situasjon. Ligger hele forspranget i de rundene, måler K1 i praksis
     budmodellen, ikke spillet. Inngår i dekomponeringsoppdraget.
  3. **Boten er DETERMINISTISK** (`D` i speken). Mot et menneske over et løp til 100 er forutsigbarhet en reell
     svakhet – mennesket kan lære den. Vi har målt STYRKE i tusenvis av runder og **aldri UTNYTTBARHET**. Ikke
     startet.
  4. **Menneskeklonen treffer 63,8 % av menneskets kortvalg**, og ALLE løpstall – inkludert «mennesket vinner
     1 av 10» – er mot klonen, ikke mot et menneske. Ikke startet.
  Punkt 3 er den mest utenfor boksen: alle våre mål er nullsum-styrke mot en fast motstander, mens eierens mål
  («mennesket skal vinne 1 av 20») er mot en motstander som LÆRER underveis.
- **01:00 (14. sep) ADVARSEL, ETTER EIERENS SPØRSMÅL OM OVERFITTING: OPPGANGEN 1,01 → 1,24 ER IKKE ETABLERT.**
  Eieren spurte om vi bare kaster compute på boten og ser den bli «tilsynelatende» bedre. Sjekket parret på
  NØYAKTIG samme 2641 runder (samme menneskearm, kontroll 0 ulike i alle tre):
  | parret | totalt | halvdel A | halvdel B |
  |---|---|---|---|
  | iter 10 − iter 7 | **+0,232 ± 0,150 (z 1,55)** | +0,055 ± 0,217 | +0,435 ± 0,200 |
  | iter 10 − iter 9 | +0,125 ± 0,137 (z 0,91) | +0,047 ± 0,208 | +0,215 ± 0,173 |
  | iter 9 − iter 7 | +0,107 ± 0,159 (z 0,67) | +0,009 ± 0,217 | +0,220 ± 0,232 |
  **Ingen av dem er signifikante, heller ikke parret – som er den strammeste testen vi har.** Og hele effekten
  ligger i halvdel B i ALLE TRE: halvdel A gir +0,055, +0,047, +0,009. Halvdel A har ikke rørt seg siden
  iterasjon 3 (0,85 → 0,86 → 0,84 → 0,86 → 0,91) mens B har gått 1,17 → 1,63.
  **HVOR LEKKASJEN ER – ikke i treningen, i UTVELGELSEN:** nettene trenes på selvspill med egne frøbånd og ser
  aldri menneskerundene. Men helporten velger hvilke nett som overlever ved å måle K1 på de samme 2641 rundene,
  iterasjon etter iterasjon. Elleve porter + ~15 K1-målinger i dag på samme sett, med SE ±0,20: forventet maksimum
  av ren støy er ca. **+0,3**. Det er størrelsesordenen på hele «forbedringen».
  Tredje ledd: K1 måles mot ÉN fast motstander (menneskeklonen på v5-kjeden), så boten kan bli god på akkurat den.
  **TILTAK (agent satt 01:00): LÅST HOLDOUT.** Del de 273 kampene i en utvalgshalvdel som porten får se og en
  låst halvdel den ALDRI ser. Fra iterasjon 12. Rører ikke v10 mens iterasjon 11 kjører den.
  **Inntil holdouten finnes, skal ingen K1-forbedring mellom iterasjoner refereres som et funn.** Det gjelder også
  det jeg selv skrev under: «nytt beste» er en maks-statistikk, ikke en måling.
- **00:42 (14. sep) ITERASJON 10: K1 = +1,24 ± 0,21 – NYTT BESTE (forrige 1,12). 17 rader lukket.**
  Første iterasjon med den rettede vanedetektoren i stammen (`9aaed8e`), og rettingen leverte det den lovet:
  | rad | it. 9 | **it. 10** |
  |---|---|---|
  | K1 | +1,12 ± 0,19 | **+1,24 ± 0,21** (z 5,96), rundepoeng +1,56 |
  | K6 bot | z −0,40 / −0,55 | z +0,14 / −1,08 – NEI, felle TATT (g(null) +7,80 ± 0,65) |
  | **K6-menneske** | **STUM** (fella slapp unna) | **NEI – men LESBAR** |
  | K8 bot | 12,93 / 13,16 % | 12,91 / 13,17 % – flatt |
  | K8-menneske | 21,90 (null 21,96) | 22,13 (null 22,16) |
  **DET VIKTIGSTE STÅR I FELLE-LINJA, og fortegnet snudde:**
  | | før | nå |
  |---|---|---|
  | «fremmed bok»: tro − fremmed | **−0,023 ± 0,011** → SLAPP UNNA | **+0,022 ± 0,011** → **TATT** |
  Tidligere var en FREMMED spillers bok like god som spillerens egen – derfor kunne raden ikke avkrefte noe.
  Nå er spillerens EGEN bok målbart bedre, med 2 SE. **Det er første positive bevis for at profil per spiller
  bærer informasjon i det hele tatt** – amiibo-ideen, som har målt null i fire uavhengige forsøk før dette.
  FORBEHOLD: 2 SE er akkurat på terskelen, det er ÉN måling, og endringen faller sammen med at målingen selv ble
  rettet – så det kan like gjerne være at vi endelig måler riktig som at noe ble bedre. Iterasjon 11 (startet
  00:42:40, samme stamme) er replikasjonen. Ikke skriv om profil-konklusjonen i hukommelsen før den er inne.
  Skaden krymper dessuten jevnt over iterasjonene: stigning −0,018 → −0,014 → −0,008 → −0,005 → **−0,003**
  (z −1,54), nivå −0,116 → **−0,038**.
- **21:24 σ-PORTEN AVKREFTET PÅ BEGGE ARMER – OG DERMED ER HELE KORTSPILL-SIDEN UTTØMT.**
  | arm | K1 | parret mot σ0,5 | endret utfall |
  |---|---|---|---|
  | σ = 0,5 (dagens) | +0,99 ± 0,19 | referanse | – |
  | σ = 1,5 | +0,93 ± 0,19 | −0,060 ± 0,125 (z −0,48) | 963 av 2641 |
  | σ = 2,5 | +0,84 ± 0,19 | **−0,155 ± 0,128 (z −1,21)** | 1015 av 2641 |
  Kontroll ren i begge (0 ulike av 2641). **Monoton trend NEDOVER med høyere port** – ingen av dem signifikant,
  men retningen er entydig og motsatt av det reanalysen antydet. Lesningen: søket er bedre enn nettet SELV der
  søket er ustabilt, så å la nettet vinne oftere koster. Reanalysen så at porten slipper inn ustabile valg; den
  så ikke at de ustabile valgene likevel er bedre enn nettets stabile.
  **DERMED ER LISTEN OVER KORTSPILL-GREP TOM:** bedre tro (6 sanser), bedre verdensvekting (LIK7, kanal 2),
  annen kombinasjonsregel (min/kvantil/flest), temperering (6 T-verdier + forhåndsregistrert prøve), flere
  verdener (12→192), og nå porten (2 verdier). **Alle null.** Fire av dem endret 25–38 % av alle runder.
  **HVOR ROMMET ER: budrunden og vraket.** Det er de eneste stedene fasiten faktisk skiller (kortfasiten er flat i
  79 % av sluttspillstillingene), og de er de eneste leddene som ikke er systematisk gjennomsøkt i dag.
  Støtte i tallene: iterasjon 9 løftet K1 fra 1,02 til 1,12 mens K8 sto helt stille – gevinsten kom fra kort, bud
  og vrak, ikke fra troen. BudQ ga +0,0771 holdout-gevinst i iterasjon 9 og +0,0726 i 8, og vraknettet 1,4327
  mot policyens 1,6872. Der er det fortsatt bevegelse.
- **19:38 σ = 1,5 GIR INGENTING – og signaturen er nå et mønster, ikke et enkelttilfelle.**
  | arm | K1 | z |
  |---|---|---|
  | σ = 0,5 (grunnlinje) | +0,99 ± 0,19 | 5,21 |
  | σ = 1,5 | +0,93 ± 0,19 | 4,88 |
  | **parret σ1,5 − σ0,5** | **−0,060 ± 0,125** | **−0,48** |
  Kontroll ren (0 ulike av 2641). Men porten endret utfallet i **963 av 2641 runder – 36 %.**
  **MØNSTERET, tredje gang i dag:** et grep flytter 25–36 % av alle runder og lander på null netto.
  Kanal 2: 25 % endret, +0,038 ± 0,085. Troen selv: 46,6 % endrede kort mot et støygulv på 43,8 %.
  Nå porten: 36 % endret, −0,060 ± 0,125.
  Det er ikke tre uavhengige skuffelser – det er tre målinger av **samme underliggende faktum**: søkets kandidater
  er i stor grad LIKEVERDIGE i verdi, så hvilket av dem man havner på betyr lite. Det stemmer med at fasiten er
  flat i 79 % av sluttspillstillingene, og med at anger-forskjellene mellom armene har vært null hele veien.
  σ = 2,5 startet 19:37:38 (~1,5 t). Den er den siste kandidaten i kø som angriper verdistøyen direkte; om den òg
  lander på null, er det ikke lenger en åpen hypotese om at porten er feilplassert – da er porten bare enda et
  sted der valget ikke betyr noe.
- **18:15 RESIDUALRETTINGEN TATT INN I STAMMEN: `krav-2026-09-11` 3c4e0b6 → 9aaed8e (ren framspoling).**
  Beslutningen er min, og grunnlaget er at den er **gratis på styrke og nødvendig for målingen**: K1-nøytral
  (−0,001 ± 0,011), mens falske vanedeteksjoner mot kloner faller 31,1 % → 2,2 % og klonprøven 10/20 → 1/20.
  Uten den kan K6 ikke avkreftes, fordi nullarmen selv «oppdager vaner».
  **FORHÅNDSSJEKKENE FØR SAMMENSLÅING – tre, og den andre var den som betydde noe:**
  1. Framspoling mulig: koblinger er etterkommer av stammen, og stammen var **ikke utsjekket** i noen av de 57
     arbeidskopiene, så referansen kunne flyttes direkte.
  2. **Alle ni speker løkka bruker parser under den nye koden** (POL, HELK, HEL, P_ADAMS, P_MENN, P_GBT, P_SPAR,
     P_HOY, s4a). Dette var ikke pedanteri: sammenslåingen innfører validering som nå KASTER på `r`/`d`/`B` i
     `sik:`-kandidatfeltet i stedet for å bli `NaN`, og `P_SPAR`/`P_HOY` har bokstaver i vakt-feltet. Hadde én
     spek feilet, ville iterasjon 10 stoppet med parsefeil i stedet for å måle.
     MERK: første kjøring av sjekken meldte 3 feil – men det var `ENOENT` på nettfiler som ikke fantes i den
     arbeidskopien, ikke syntaksfeil. **Sjekken min blandet «ugyldig spek» med «fil finnes ikke».** Kjørt om med
     nettene midlertidig kopiert inn: alle ni OK, ryddet etterpå.
  3. Ingen av de åtte endrede filene rører `examples/mlb-trodata.ts`, så løkkas ukommitterte båndretting overlever
     framspolingen.
  Stammen inneholder nå også `profild:` (av som standard, strukturelt) og valideringen av `sik:`-kandidatfeltet.
- **18:05 RESIDUALDOMMEN: RETTINGEN ER GRATIS PÅ K1 – og det er nøyaktig det vi ville ha.**
  | arm | K1 | z |
  |---|---|---|
  | bord (kandidat, stakk-relativ) | +0,99 ± 0,19 | 5,14 |
  | global (dagens konstant) | +0,99 ± 0,19 | 5,16 |
  | **parret bord − global** | **−0,001 ± 0,011** | **−0,05** |
  Kontroll ren (0 ulike av 2641 på menneskesiden), og bare **13 av 2641 runder** endret utfall. Bevis-sjekken
  bestod før start: 51 linjers forskjell over to filer, hashene logget – en nulldifferanse kan altså ikke komme av
  at armene var like. Armene ble kjørt etter hverandre på samme arbeidskopi via `git checkout` av BEGGE kildefiler
  (`stilbias.ts` OG `okt.ts`) – den første versjonen min sjekket bare ut den ene og ville gitt en blandet arm.
  **BETYDNINGEN:** rettingen fjerner at boten ser vaner hos identiske kopier av seg selv (falske deteksjoner
  31,1 % → 2,2 %, klonprøven 10/20 → 1/20) **uten å koste spillestyrke**. Det gjør K6-målingen gyldig for første
  gang – nullarmen kan endelig være stille. Dette er en MÅLEFIKS, ikke en styrkefiks, og den skal dømmes deretter.
  MERK EN FEIL JEG GJORDE OG RETTET: første aggregering leste bare skår s0–s3 av 8 og ga n = 1409 med
  −0,008 ± 0,010. Full lesning (alle 8 skår, n = 2641) gir −0,001 ± 0,011. Konklusjonen er den samme, men tallet
  var feil, og en halv sele er en sele som lyver.
- **15:47 BATTERI ITERASJON 9: K1 = +1,12 ± 0,19 (z 5,96) – HØYESTE MÅLTE, likt beste nettsett (it. 4).**
  17 av 23 rader, alle likt i begge bånd. Helporten beholdt nettene. Halvdeler +0,86 / +1,41, rundepoeng +1,33.
  | rad | it. 8 (tro frosset) | it. 9 (tro nytrent) |
  |---|---|---|
  | **K1** | +1,02 ± 0,20 | **+1,12 ± 0,19** |
  | K6 bot | z −0,82 / −0,39 | z −0,40 / −0,55 — NEI |
  | K6-menneske | STUM | **STUM**, men stigning −0,008 → **−0,005** (z −1,92) og nivå −0,116 → **−0,065** |
  | K8 bot | 12,94 / 13,17 % | **12,93 / 13,16 %** — flatt |
  | K8-menneske | 21,56 (null 21,68) | 21,90 (null 21,96) — fortsatt UNDER null |
  **LESNINGEN, og den bekrefter dagens diagnose:** trohodet ble trent for første gang på tre iterasjoner, K1 steg
  10 punkter – og **K8 rørte seg ikke**. Gevinsten kom fra kort, bud og vrak. Troen ble bedre på sitt eget mål
  (0,92913 → 0,92779) uten at det vises i K8-raden, og K1 steg uten at troen bidro. Nøyaktig det
  `troledd.md` forutsier: søkets verdianslag bærer ikke det troen leverer.
  K6-menneske-skaden halveres jevnt over iterasjonene (−0,018 → −0,014 → −0,008 → −0,005), men raden er STUM
  fordi fella slipper unna – den kan ikke leses som dom før residualrettingen er inne.
  Iterasjon 10 lenket bak K1-køen (residual + σ) så de ikke slåss om kjernene.
- **13:45 TEMPERATURDOMMEN: INGEN T ER VERDT EN K1-SLOT – OG ARGUMENTET ER MEKANISK, IKKE BARE STATISTISK.**
  Anger mot eksakt fasit, n = 441 stillinger (sveipet logget BARE skillende stillinger – verifisert: 0 flate):
  | T | anger | mot T1 | z |
  |---|---|---|---|
  | 1 | 0,564 | referanse | |
  | 1,5 | 0,738 | +0,175 ± 0,150 | 1,17 |
  | 2 | 0,718 | +0,154 ± 0,219 | 0,71 |
  | 3 | 0,700 | +0,136 ± 0,222 | 0,61 |
  | 5 | 0,453 | −0,111 ± 0,193 | −0,58 |
  | 8 | 0,553 | −0,011 ± 0,193 | −0,05 |
  | **tro AV (B)** | **0,816** | **T1 − B = −0,252 ± 0,195** | **−1,29** |
  | støyarm (C) | 0,685 | T1 − C = −0,121 ± 0,163 | −0,74 |
  **DET MEKANISKE ARGUMENTET, som er sterkere enn z-verdiene:** temperering til T = 5 endrer det spilte kortet
  **sjeldnere (26,3 %) enn å bare trekke nye verdener gjør (29,0 %)**. Knotten sitter ikke på leddet som svikter.
  Agentens formulering, som er skarpere enn min: **usikkerheten ligger i VERDIEN, ikke i TROEN** – argmaks over 48
  støyete utspillingsanslag – og ingen temperatur på trovekten kan nå dit.
  Knotten er bygd og committet (`~mlbu=<fil>,T<temp>`, T = 1 bit-identisk, 7 + 49 prøver), men **den skal stå på 1**.
  **DEN ENE SVAKE POSITIVE FALT BORT MED BATCH 2 – den var støy.** Samlet n = 914 (12 filer; batch 2 skrev til
  `troanger2-*`, som min første glob ikke fanget – enda en stille no-op, fanget ved at n ikke endret seg):
  | | batch 1 (n=441) | begge (n=914) |
  |---|---|---|
  | tro PÅ mot AV | −0,252 ± 0,195 | **−0,107 ± 0,171 (z −0,63)** |
  | tro PÅ mot STØYARM | −0,121 ± 0,163 | **+0,097 ± 0,142** |
  Troen er altså **ikke bedre enn å trekke tilfeldige verdener**, målt på anger mot eksakt fasit. Det var riktig
  å ikke gjøre noe ut av batch 1s tall.
  T5 var nærmest terskel (−0,291 ± 0,159, z −1,83; lagmål z −2,29), men som **beste av seks** fikk den en
  FORHÅNDSREGISTRERT egen prøve – batch 3, bare T1 mot T5, dobbel styrke:
  | | n | T5 − T1 | z | støyarm C − T1 |
  |---|---|---|---|---|
  | batch 1 | 441 | −0,111 ± 0,193 | −0,58 | +0,121 ± 0,163 |
  | batch 2 | 473 | −0,459 ± 0,248 | −1,85 | **−0,300 ± 0,229** |
  | **batch 3 (forhåndsregistrert)** | **769** | **+0,153 ± 0,131** | **+1,16** | −0,034 ± 0,113 |
  | alle | 1 683 | −0,089 ± 0,105 | −0,84 | −0,068 ± 0,093 |
  **T5 FALT – motsatt fortegn på sin egen prøve.** Og batch 2 avslører seg selv: STØYARMEN ga der −0,300, nesten
  like stort som T5s −0,459 uten at noe var endret. Batch 2 var en støyete batch, og «funnet» var dens skygge.
  **BESLUTNING: temperaturen står på T = 1.** Knotten beholdes som testet, bit-identisk kode.
  **RETTELSE AV MEG SELV (n = 1683, alle tre batcher):** jeg sa tidligere at «troen ikke er bedre enn å trekke
  tilfeldige verdener». Det var en sammenblanding – støyarm C er IKKE tro av, den er SAMME tro med nytt frø.
  | arm | anger | mot T1 (tro på) |
  |---|---|---|
  | **tro AV (B)** | 0,970 | **+0,159 ± 0,115 (z 1,38)**, lagmål **+0,247 ± 0,149 (z 1,66)** |
  | støyarm C (samme tro, nytt frø) | 0,743 | −0,068 ± 0,093 |
  | **tro PÅ (T1)** | **0,811** | – |
  Å skru troen AV gjør boten dårligere, konsistent på begge mål (ikke signifikant, men samme retning). Men HVILKE
  verdener som trekkes betyr ingenting. **Troen bærer verdi; den tåler bare ikke å bli spurt om detaljene.**
  Det er en presisering av hele dagens diagnose: det er ikke troen som er verdiløs, det er oppløsningen i søkets
  verdianslag som ikke kan bære detaljene troen leverer.
  Metodisk verdt å beholde: agenten nektet å levere spek på et beste-av-tolv-tall og krevde egen prøve. Det er
  tredje gang i dag den disiplinen sparer oss for en falsk positiv (de to andre: kortnett-hukommelsen og LIK7).
  **MIN EGEN FEIL, notert:** første aggregering delte på √n TO ganger (`sd()` returnerte alt standardfeilen), så
  feilmarginene var 21× for små og alt så signifikant ut. Fanget før rapportering, men samme klasse feil jeg har
  bedt agentene passe på hele natta. Rettet skript: `scratchpad/troanger2.mjs`.
- **13:08 `DATA-SJEKK OK` FYRTE FOR FØRSTE GANG – rettingen fra 05:25 virker i praksis.**
  «alle generatorfiler til stede, ingen krasj i loggene». Det er nøyaktig linja som manglet da iterasjon 8 trente
  troen på null rader og logget det som suksess. Nå bekreftes det POSITIVT, så fravær av feilmelding aldri igjen
  forveksles med bekreftet suksess.
  Trening iterasjon 9: bud **+0,0771** holdout-gevinst (mot +0,0726 i it. 8), vrak 1,4327 < 1,6872 → nytt nett,
  etterlyst 0,8770 = 0,8770 → beholdes. Trotreningen er neste, og første på tre iterasjoner med rader å trene på.
- **12:50 EIEREN NAVNGA SYKDOMMEN: «den må spille som om den ikke egentlig vet – ellers hallusinerer den bare.»**
  Det er ikke en metafor, det er et kalibreringsutsagn, og vi har tallet:
  | | målt |
  |---|---|
  | trovektens skarphet | **ESS/K = 0,179** – effektivt 5,7 av 32 kandidatverdener |
  | troens faktiske kunnskap | **21,9 ± 2,5 %** av veien til det NÅBARE taket |
  **Boten konsentrerer massen på 18 % av verdenene på grunnlag av en tro som er 22 % framme.** Den handler langt
  mer skråsikkert enn den vet, og velger da kort som bare er gode hvis gjetningen stemmer. Det stemmer med at
  endringene troen gjør er myntkast (bedre i 20, verre i 14) – en bot som gjettet forsiktigere ville tapt mindre
  på å gjette feil.
  **STØTTEBEVIS FRA VÅRE EGNE TALL:** i budvinnerens sete er vekten alt flatere (ESS/K 0,459) – og der er troens
  netto effekt **+0,0 ± 1,9 pp**, altså ingen skade. Der vekten ER flat, hallusinerer den ikke.
  σ-porten er samme sykdom i et annet ledd: den lar søket overstyre nettet nettopp der søket er mest ustabilt.
  **To gratis knotter mot dette, begge i måling nå:** temperering av trovekten (`logW_tro / T`, agent satt 12:50,
  T = 1 skal være bit-identisk) og σ = 1,5/2,5 (lenket, `boo871u9a`).
  Den avgjørende delmålingen er KALIBRERINGSKURVEN: gir troen 30 % til den sanne verdenen, skal den ha rett
  30 % av gangene. **Det tallet svarer på eierens spørsmål uavhengig av om det flytter K1.**
- **12:40 σ-PORTEN STÅR PÅ FEIL VERDI – DEN BILLIGSTE KNOTTEN VI HAR, OG DEN GJØR MOTSATT JOBB.**
  Ren reanalyse av troledd-dataene (ingen ny kjøring): søket overstyrer nettet når parret σ ≥ terskelen, som i dag
  er **0,5**. Men båndet 0,5–1,0 er det MEST ustabile av alle: **67,7 % støy**. Av det porten slipper gjennom er
  **49,1 % ustabilt**, mot **38,6 %** av det den holder tilbake – porten slipper altså inn verre valg enn den
  stopper. Ved σ ≥ 2,5: **2,6 % støy, anger 0,028**.
  Kandidater: dagens spek med `sik:alle:1.5:` og `sik:alle:2.5:` i stedet for `0.5`. **Ingen ny kode, ingen ekstra
  søketid** – bare et tall. Begge parser (verifisert med `lagIndre`).
  **Grunnlinjen finnes allerede:** kanal 2-målingens «uten»-arm brukte NØYAKTIG samme nett, frø og spek med
  σ = 0,5 (+0,99 ± 0,19). De to armene kan derfor måles parret mot den uten å kjøre grunnlinjen på nytt – sparer
  2,5 timer. Lenket bak residual-K1 (`boo871u9a`).
  **Ærlig risiko:** høyere σ betyr mer nett og mindre søk – ved 2,5 overstyrer søket bare ~6 % av valgene. Er
  nettet svakere i snitt enn søket, koster det. Derfor en MÅLING, ikke en endring.
  Sidefunn fra samme reanalyse: `sigA` median 0,51 – halvparten av alle beslutninger ligger altså på vippen av
  dagens terskel, hvilket forklarer hvorfor porten er så virksom og så feilplassert.
- **12:30 VERDENSSVEIPET: TROENS SIGNAL VOKSER MED ANTALL VERDENER, MEN STØYGULVET FALLER KNAPT.**
  | verdener | n | støygulv (A−C) | tro (A−B) | netto |
  |---|---|---|---|---|
  | 12 | 581 | 44,6 % ± 2,1 | 44,6 % ± 2,1 | **+0,0 pp** |
  | 96 | 442 | 41,0 % ± 2,3 | 43,4 % ± 2,4 | +2,5 pp |
  | 192 | 221 | 37,1 % ± 3,2 | 44,3 % ± 3,3 | **+7,2 pp** |
  Bare stikk ≥ 8: netto +1,9 → +6,5 → **+13,1 pp**.
  **Lesningen:** flere verdener slipper mer av troen fram til kortet – men støyen faller SVÆRT sakte (44,6 → 37,1
  ved 16× flere verdener). Argmaks er altså ikke bare litt ustabil; den er fundamentalt ustabil, og å kjøpe seg ut
  av det med regnekraft er urealistisk. Ved 192 verdener skifter fortsatt **37 % av kortene** av ren omtrekking.
  **ANGERTALLENE PER VERDENSTALL KAN IKKE LESES SOM KVALITET – jeg noterer det framfor å overtolke:** armene har
  spilt ULIKE stillinger (n = 79 / 72 / 24), og angeret spretter 1,03 → 0,08 → 3,26. Det er stillingsvariasjon,
  ikke at 96 verdener skulle være 13× bedre enn 12. Den ENESTE gyldige lesningen er parret A−B innen hvert
  verdenstall, og der er alt null: 12 → −1,101 ± 0,902, 96 → +0,019 ± 0,021, 192 → +0,014 ± 0,014.
  **Dette forklarer også W96-paradokset:** at 96 verdener ga K1 +0,94 mot 48-basisens +1,01 er ikke i strid med at
  signalet vokser – mer tro slipper fram, men det troen velger er ikke bedre (myntkast: bedre i 20, verre i 14).
  Mer gjennomslag for en tro som ikke forbedrer valget, gir ingen gevinst – bare dyrere søk.
- **12:05 MIN EGEN HYPOTESE ER AVKREFTET, OG I FEIL RETNING: `snitt` ER DET BESTE KRITERIET, IKKE DET VERSTE.**
  Anger mot EKSAKT fasit på de 268 beslutningene der fasiten skiller kort:
  | kriterium | anger A (tro PÅ) | anger B (tro AV) | parret A−B |
  |---|---|---|---|
  | **snitt (dagens)** | **0,823** | **0,761** | +0,062 ± 0,309 (z 0,20) |
  | min | 2,677 | 2,812 | −0,136 ± 0,212 (z −0,64) |
  | kvantil | 2,010 | 2,327 | −0,317 ± 0,353 (z −0,90) |
  | flest | 1,320 | 1,091 | +0,229 ± 0,190 (z 1,20) |
  **Kriteriene mot hverandre, samme arm:** `min` er **+1,853 ± 0,543 DÅRLIGERE** enn snitt (z 3,41), `kvantil`
  +1,187 ± 0,447 (z 2,66), `flest` +0,496 ± 0,263 (z 1,89). Alle tre alpha-mu-kriteriene er altså verre, og de to
  første signifikant. **Påstanden min om at «PIMC-snittet kaster troens informasjon» er feil** – snittet er den
  beste av de fire formene vi har, og å kreve robusthet på tvers av verdener straffer seg her.
  **OG TROEN FORBEDRER IKKE KORTVALGET SELV DER FASITEN SKILLER:** +0,062 ± 0,309 med snitt, altså null.
  Delt på tid: stikk < 8 gir +0,225 ± 0,444 (litt verre), stikk ≥ 8 gir −0,266 ± 0,258 (litt bedre) – begge godt
  innenfor støy. Troen når fram til kortet sent (målt: +12,4 pp over støygulvet i stikk 10), men det den velger
  er ikke bedre.
  **FORBEHOLD SOM ER STORT: n = 268, og SE er ±0,2–0,35 på en anger rundt 0,8.** Dette utelukker en STOR effekt,
  ikke en liten. Flere stillinger med skillende fasit ville strammet det – men fasiten er flat i 79 % av
  sluttspillet, så det koster mye å samle dem.
  **HVA DET ETTERLATER:** kortspillet er trolig nær sitt nåbare tak alt (K3.4/K3.6/K7 er innfridd mot nåbart tak),
  og da er det ikke der marginen ligger. Videre troarbeid bør ikke forventes å flytte K1.
- **12:00 TROLEDDET SVARTE (n = 2653 beslutninger): TROEN NÅR FRAM – MEN BARE SENT, OG BARE DER FASITEN ER FLAT.**
  | | andel beslutninger der argmaks endres |
  |---|---|
  | A mot B (tro PÅ vs AV) | **46,6 % ± 1,0** |
  | A mot C (samme tro, nytt verdensfrø) | **43,8 % ± 1,0** ← STØYGULVET |
  | netto | **+2,7 pp** |
  Samlet drukner troen altså nesten helt i samplingsstøy. Men per stikk er bildet delt i to:
  | stikk | A-B | A-C | netto |
  |---|---|---|---|
  | 1–4 | 56–64 % | 58–68 % | **negativ** |
  | 5 | 60,7 % | 50,2 % | +10,5 |
  | 6–7 | 44–56 % | 42–56 % | ~0 |
  | 8 | 24,2 % | 13,3 % | +10,8 |
  | 9 | 14,0 % | 6,4 % | +7,6 |
  | 10 | 14,4 % | **2,0 %** | **+12,4** |
  **Tidlig i runden er argmaks FULLSTENDIG støydominert:** å trekke nye verdener med samme tro endrer kortet like
  ofte (58–68 %) som å skru troen av og på. Sent faller støyen til 2 % og troen får gjennomslag.
  **OG DET ER DER DEN IKKE BETYR NOE: bare 268 av 2653 beslutninger (10,1 %) har en fasit som skiller kortene** –
  resten er stillinger der hvert lovlig kort gir samme rundepoeng. Troen virker altså presis der kontrakten som
  regel alt er avgjort, og drukner der den kunne avgjort noe.
  **DETTE FORKLARER ALLE TRE NULLRESULTATENE:** frosset trohode (+1,02 mot +1,01), LIK7 – som var gated til
  stikk **7 og utover**, altså nøyaktig i det flate området – og kanal 2 (25 % endrede runder, +0,038 ± 0,085).
  Søkets egen sikkerhet: `sigA` median **0,51**, p90 1,79 – med σ-terskel 0,5 i speken betyr det at halvparten av
  beslutningene ligger på vippen.
  Kriteriene har en mening å ha: `min` skiller seg fra `snitt` i 52,3 % av beslutningene, `kvantil` 51,0 %,
  `flest` 26,5 %. Om noen av dem er BEDRE avgjøres på de 268 stillingene med fasit – regnes nå.
  **11:50 FORELØPIG TALL, OG DET PEKER RETT MOT SVARET:** troen endrer argmaks i **56 %** av beslutningene –
  men **støyarmen (identisk tro, bare et annet verdenstrekk-frø) endrer den alt i 43,6 %.** Samme
  størrelsesorden. Holder det ved full n, er argmaks **støydominert**, og da kan en bedre verdensfordeling ikke
  overleve fram til kortet uansett hvor god troen blir. Det ville forklare alle tre nullresultatene på én gang:
  frosset trohode (+1,02 mot +1,01), LIK7 (+0,91) og kanal 2 (+0,038 ± 0,085 med 25 % endrede runder).
  Seks arbeidere kjører nå (`examples/troledd.ts`, 12 runder hver, egne frø → `analyse/troledd-w0..w5.jsonl`);
  vakt armert siden agenten avsluttet mens kjøringen er i flukt – åttende gang i natt at en agents egen venter dør
  med den. **Merk hva dette IKKE er: det er ikke enda et nullresultat om en sans. Det er en mulig forklaring på
  hvorfor alle sansene har målt null**, og den peker på en fiks som er gratis (`min`/`kvantil`/`flest` regnes på
  `perVerden`, som alt finnes).
  Kostnadsrammer målt: eksakt fasit koster 111 ms ved 7 kort igjen, 2,6 s ved 8 og 16 s ved 9 – fasiten felles
  derfor ved ≤ 7 kort. Den utrullede speken bruker 581 ms per kortvalg i denne arbeidskopien.
  `verdenKombi`-kriteriene (`min`/`kvantil`/`flest`) er ferdig implementert på `perVerden`, som alt er regnet ut –
  de koster **null ekstra utspillinger**. Speken vår har ingen `a`, altså `snitt`.
- **10:26 RESIDUALEN GJORT STAKK-RELATIV – KLONPRØVEN FALLER FRA 10/20 TIL 1/20, OG z BLIR FLAT.**
  Begge nullpunkt regnet på HVERT punkt i SAMME gjennomløp (to separate kjøringer ville skilt lag på kortstokk og
  runder – da måler man alt annet enn formelen). Fire identiske agenter, 5 frø × 3 kamper × 26 runder per hale:
  | hale | form | over porten | snitt z runde 5 → 25 |
  |---|---|---|---|
  | `abmpf`+`d7alle` (der konstanten ble målt) | global | 3,1 % | 0,83 → 0,82 flat |
  | | **bord** | 4,1 % | 0,95 → 0,90 flat |
  | `abmp`+`kort-7` (løkka) | global | **31,1 %** | 1,31 → **1,69 STIGER** |
  | | **bord** | **2,2 %** | 0,96 → 0,89 flat |
  | `abmp`+`kort-8` (løkka) | global | **19,6 %** | 1,15 → **1,41 STIGER** |
  | | **bord** | **4,5 %** | 0,86 → 0,93 flat |
  Klonprøven (seter flagget ved siste avlesning, av 20): `kort-7` **10 → 1**, `kort-8` **6 → 1**.
  **Og den er ikke gjort blind: mot trumftrekkere fyrer bord i 97,3 % av punktene mot globals 89,9 %** – den er
  altså BEDRE til å se ekte forskjeller samtidig som den slutter å se innbilte.
  **Formen:** `forskjell = snitt(eget) − snitt(de tre andre setene)`, `SE = √(SE_eget² + SE_andre²)`.
  Rettingen er **én funksjonskropp**: `stilbias.ts:328` gjorde `void andre;` – bordet var allerede regnet ut og
  kastet. Ingen ny sti, ingen ny leser, ingen ny datakilde. K2 uberørt.
  **HVORFOR IKKE «en kalibrert konstant per hale»:** målingen avliver den selv. På halen konstanten ER kalibrert
  for, er formene like (3,1 % mot 4,1 %) – en per-hale-konstant kjøper ingenting bordet ikke gir, og betaler med
  et kalibreringssteg per stakk. Det steget har alt sviktet stille én gang: løkka byttet `kort-7` → `kort-8`
  mellom iterasjoner, nullpunktene skiller 0,0115, og det er nøyaktig der de 19,6 % kommer fra. **Bordet kan ikke
  bli foreldet** – bytter stakken, flytter sete og referanse seg sammen.
  Prisen, ærlig: referansen er selv anslått, så `SE_andre` er med i nevneren; på `abmpf` koster det 3,1 → 4,1 %.
  Riktig retning å betale i – konstanten lot som om nullpunktet var kjent uten feilmargin.
  `stilvri` fikk `MIN_RUNDER = 4` som `aggressivitet`: maks z faller 7,13 → 2,88 (`abmpf`), 13,19 → 4,27 (`kort-8`).
  AV ER AV bekreftet med hash over HELE handlingsrekken før/etter (`571f0a9f`, `52bcf25d`, `adc18b13`).
  Prøver: 175 i sveipet over 27 filer, 174 bestått, 0 feil, 1 hoppet over.
  **PRISEN, OG DEN SKAL IKKE GJEMMES – HER ER KANDIDATEN DÅRLIGERE:** med NØYAKTIG ÉN avviker ved bordet forskyves
  tilskuernes referanse med ~⅓ av avviket, så de tre andre leses som avvikende MOTSATT vei (0,18–0,21 mot vanens
  0,61). Forholdet vane/tilskuer faller fra **27× til 2,8×**, og agenten senket derfor terskelen i den eksisterende
  prøven «vanen blir funnet» fra 5× til **2,5×**. Det er en reell svekkelse av en vakt, og den er STRUKTURELL –
  en konsekvens av at referansen er bordet, ikke en innstilling som kan skrus tilbake. Byttet er trolig riktig
  (den motsatte feilen er den vi faktisk HAR: fire kloner får 0,1055 i vri uten at noen avviker), men dette er
  stedet å se nøye etter, og det er verdt eierens blikk.
  Agenten avvek dessuten bevisst fra én instruks: jeg ba om «null deteksjon» i klonprøven, men en port på 2 SE
  slipper per definisjon gjennom ~1 av 20 – selv den globale formen krysser 6 av 20 på sin egen hale. Testen måler
  derfor RATEN (2,2–4,5 %, ikke 31 %), at z ikke vokser med n, og at klonenes utslag drukner i vanens. Det er
  riktig gjort: mitt krav var strengere enn statistikken tillater.
  **GJENSTÅR: parret K1-dom (min), lenket bak iterasjon 9, ~5 t for to armer.**
- **10:05 `okt:` ER (c), IKKE (b) – OG UNDER DEN LÅ EN EKTE DEFEKT: BOTEN FLAGGER SINE EGNE KLONER.**
  Ny `examples/oktsonde2.ts` logger z = |forskjell|/SE for ALLE fire seter ved hvert kortvalg (koblingssonden så
  bare setet i tur, i førerrollen – 41 punkter mot 15 000).
  | arm | punkter | sikre (z ≥ 2,0) | p99 | maks |
  |---|---|---|---|---|
  | 4 runder (sjekkens vindu) | 768 | **0** | 1,62 | 1,62 |
  | 26 runder | 4 992 | 240 (4,8 %) | 2,08 | 2,19 |
  | løkkas hale (`abmp`+`kort-7`) | 14 976 | **5 376 (35,9 %)** | 3,47 | 3,69 |
  | mot trumftrekkere | 9 984 | 8 640 (86,5 %) | 114,4 | 116,0 |
  **Porten passeres først rundt runde 6 (~54 observasjoner per sete). Sjekkens fire runder stopper to–tre runder
  for tidlig.** Raden sto altså på 0 fordi vinduet var for kort – ikke fordi porten er en av-bryter.
  **DEFEKTEN, og den er verre enn en manglende ledning:** `BEFOLKNING_RESIDUAL = −0,0976` ble målt på
  `abmpf`+`d7alle` og brukes på ALLE stakker. Målt residual per hale:
  | hale | snitt per sete | seter over porten |
  |---|---|---|
  | `abmpf`+`d7alle` (der konstanten ble målt) | −0,1055 | 0 av 4 |
  | **`abmp`+`kort-7` (løkka)** | **−0,0721** | **2 av 4** |
  | `abmp`+`kort-8` (løkka) | −0,0836 | 1 av 4 |
  Et systematisk avvik krymper IKKE med n, mens SE gjør – så **z vokser uten grense**, og boten konkluderer med
  at fire identiske kopier av seg selv har hver sin stil. Bekreftet med løkkas ORDRETTE spek: ett av fire like
  seter passerer porten og vrien fyrer (`krympet` 0,0125).
  Bifunn: `stilvri` har ingen rundeterskel (`aggressivitet` har `MIN_RUNDER = 4`), så den kan fyre i runde 1 på
  ~9 observasjoner der SE kollapser – målt topp z = 7,13.
  **KONSEKVENS FOR K6, og den er metodisk:** K6 er ikke umålt, men **nullarmen «uten vane» er ikke stille** –
  35,9 % av punktene passerer porten mot kloner. En K6-måling der nullarmen selv oppdager vaner, måler ikke det
  den tror. Og en koblingsrad for hukommelsen må være **minst 8 runder** for i det hele tatt å kunne avkrefte noe.
  Forrige rad («0 av 89 mot tre som ikke drar trumf») var dessuten feil vane: `vakt:abmpd` er en
  konvensjonsjustering, ikke den vanen detektoren måles mot – og porten BLE passert der (14 av 178 valg,
  maks z 3,38) uten å flytte noen argmax, samme lesning som `r` og `d4`.
  Ingen terskel er endret; agenten leverte forslag med tall. Retting satt i gang 10:07.
- **09:42 BÅNDRETTINGEN VIRKET – VERIFISERT I PRAKSIS, IKKE BARE I KODEN.** Iterasjon 9, samme sted der
  iterasjon 8 mistet alt:
  | | iterasjon 8 | iterasjon 9 |
  |---|---|---|
  | loggmelding | «DATA tro: **2** filer, 74M» | «DATA tro: **8** filer, 574M» |
  | `trening-*.bin` | 0 | **6** (73–120 MB, 529 MB totalt) |
  | `log-t*.txt` | 557 B (stackspor) | ~4 700 B (ekte logger) |
  | `grep '^Error:'` i generatorloggene | 6 treff | **0** |
  Diagnosen fra 05:20 er dermed bekreftet fra begge sider: båndet var årsaken, og hevingen løser den.
  Iterasjon 9 blir første runde siden iterasjon 7 der trohodet faktisk trenes. `DATA-SJEKK OK` skrives først etter
  kortmerkingen – den nye kontrollen er fortsatt ubevist, men grunnlaget den skal verifisere er nå på plass.
- **09:30 KANAL 2-DOMMEN: LEDNINGEN VIRKER, GEVINSTEN FINNES IKKE. Parret W2 − AV = +0,038 ± 0,085 pp, z 0,45.**
  | arm | K1 | z |
  |---|---|---|
  | AV (grunnlinje) | +0,99 ± 0,19 | 5,21 |
  | W2 (kanal 2 på) | +1,03 ± 0,21 | 5,00 |
  | **parret differanse** | **+0,038 ± 0,085** | **0,45** |
  Kontroll ren: **0 ulike av 2641** på menneskesiden, så duplikatet er ekte parret.
  **IKKE LES VERDIKTVIPPET.** Uparret ser det ut som kanalen løftet boten over porten (+0,99 → +1,03, altså fra
  «NEI» til «JA»). Det er en illusjon: begge tallene ligger innenfor én SE av porten, og den parrede differansen
  – den eneste som fjerner variasjonen mellom giv – er null. Agenten som bygde kanalen advarte mot nøyaktig denne
  feillesningen før tallene fantes, og hadde rett.
  **OG KANALEN ER IKKE STUM: den endret utfallet i 674 av 2641 runder (25 %).** Det er den mest informative delen
  av resultatet. Vi har ikke målt «en bryter som ikke gjør noe» – vi har målt en slutning som flytter en fjerdedel
  av alle runder og ender på null netto. Budvinnerens vrak BÆRER informasjon (+0,0046 nat i riggen, og K8-tapet
  hennes er 0,15 nat verre enn de andres), men å bruke den til å vekte verdenene gjør ikke boten bedre til å vinne.
  Samme mønster som LIK7: bedre verdener, uendret utfall.
  **UAVHENGIG GJENSKAPING, TO ESTIMATORER, SAMME SVAR:** jeg regnet parret differanse med klynget SE
  (`scratchpad/parret-kanal2.mjs`), agenten med **klyngebootstrap B=20 000** (`analyse/kanal2-parret.mjs`, samme
  estimator som `duplikat-dom.mjs`). Begge gir **+0,038 ± 0,085, z 0,45**, og begge fikk 0 avvik på menneskesiden.
  Agenten fikk i tillegg rundepoeng +0,047 ± 0,124 (z 0,38) – samme null.
  Én liten forskjell verdt å forklare framfor å glatte over: agenten teller **676** runder der boten SPILTE ulikt,
  jeg teller **674** der UTFALLET endret seg. To ulike definisjoner (valg mot resultat), begge riktige – i to
  runder spilte boten annerledes uten at det endret rundens bidrag.
  **BESLUTNING: kanal 2 blir stående AV som standard.** Koden beholdes – den er testet, bit-identisk når av, og
  ledningen er nå riktig lagt (`kanal2-sik-2026-09-13`, 4 commits). Verdien av arbeidet er ikke gevinsten, men at
  en av prosjektets fem «IKKE KOBLET»-rader er lukket og at blindsonen i koblingssjekken ble avdekket.
- **09:15 BATTERI ITERASJON 8: 17/23, K1 +1,02 ± 0,20 (z 5,15) – MED TROEN STÅENDE HELT STILLE.**
  Helporten: 1,02 ikke signifikant dårligere enn beste 1,12 → nettene beholdes. Rundepoeng +1,44 ± 0,28.
  **Dette er en utilsiktet, men ren ABLASJON:** `tro-9` = `tro-8` bit for bit, så kort, bud og vrak alene bar
  resultatet. K1 er uendret fra +1,01 (it. 7) og +1,10 (beste). **Troen bidrar altså ikke målbart til K1 i det
  hele tatt** – et sterkere utsagn enn noen enkeltmåling i natt, og det kom gratis av en feil.
  | rad | it. 7 | it. 8 (troen frosset) |
  |---|---|---|
  | K1 | +1,01 ± 0,19 | **+1,02 ± 0,20** |
  | K8 bot | 13,13 / 13,50 % | 12,94 / 13,17 % |
  | K8-menneske | 21,56 % (null 21,68) | 21,56 % (null 21,68) – identisk |
  | K6 bot | z −0,44 / +0,18 | z −0,82 / −0,39 |
  | K6-menneske | −0,008 (z −2,97) | **STUM** |
  **K6-MENNESKE ER STUM, OG GRUNNEN ER VERDT MER ENN TALLET:** kontrollen var ren (null mot null2: 0 ulike rader),
  men **fella SLAPP UNNA** – «fremmed bok» gir tro − fremmed **−0,023 ± 0,011 pp**, altså er en FREMMED spillers
  bok like god som spillerens egen (rotert +0,040 ± 0,010). Raden er ikke ødelagt; den er ugyldig som dom, og
  −0,008/−0,116 skal ikke leses. Dette er batteriet som selv bekrefter profilfunnet fra 12. sep: det er ikke
  personen som bæres av boka, bare mengden runder. Fjerde uavhengige bekreftelse på at aggregerte vanetall om en
  navngitt spiller ikke bærer noe. Se [[adams-max-spillerprofil-visjon]].
- **09:17 ITERASJON 9 STARTET under v10** (bekreftet i prosesslista: `adams-max-loop-v10.sh 9`), på nettene fra
  iterasjon 8 og med hevet bånd. Dette er første iterasjon på flere runder som faktisk vil trene trohodet.
  Framspolingen var trygg: `krav-2026-09-11` peker på samme commit som løkkas løsrevne HEAD (3c4e0b6), så
  `merge --ff-only` er en nulloperasjon og båndrettingen i `examples/mlb-trodata.ts` overlever den.
  `DATA-SJEKK OK` kommer først etter datagenereringen – den nye kontrollen er ennå ubevist i praksis.
- **07:00 TO RETTELSER OM MÅLEKOSTNAD OG KOORDINERING, begge mine feil.**
  1. **K1-armene koster 2,5 TIMER, ikke 15–35 minutter.** Hver arm er 8 832 s vegg / 29 518 prosess-sekunder på
     4 kjerner. Med kjernetaket som tvinger armene etter hverandre er en parret K1-sammenlikning en **~5-timers**
     måling. Jeg anslo den til under én time da jeg køet F0/K3/P0 – fem ganger for lavt. Konsekvens for planlegging:
     én parret K1 er en natt-jobb, ikke noe man skyter inn mellom to andre ting.
  2. **DUPLIKAT: to identiske W2-armer kjørte samtidig.** Agenten startet sin egen (`kanal2-k1-med*`) mens min
     lenkede jobb startet en til (`kanal2ut/k1-W2*`) – begge på de samme 4 kjernene, altså halv fart for begge.
     Min ble stoppet 07:00; agentens beholdt fordi den skriver ved siden av grunnlinja i samme katalog og
     navnekonvensjon (`kanal2-k1-uten` / `kanal2-k1-med`), som gjør parringen mindre utsatt for forveksling.
     **Lærdommen:** når jeg lenker en oppfølgingsjobb til en agents måling, må jeg først sjekke om agenten selv
     har køet den. Jeg lenket i god tro fordi agenten hadde avsluttet – men den var ikke ferdig, bare taus.
     Samme feilslutning som da jeg stoppet koblingsagenten: **taushet er ikke stillstand.**
- **06:58 KANAL 2, GRUNNLINJEN (UTEN W): K1 +0,99 ± 0,19, z 5,21.** Halvdeler +0,83 / +1,18, rundepoeng +1,26 ± 0,27.
  Målt på `kanal2-sik-2026-09-13` med dagens nett (vrak-8/tro-8/budq-8/kort-8), 2641 runder, 4 kjerner.
  Dette er referansen W2-armen skal måles mot – og den er praktisk talt lik iterasjon 7s +1,01, som den skal være:
  samme nett, samme spek, bare ledningen lagt og bryteren AV. **At grunnlinjen reproduserer +1,01 er i seg selv
  bekreftelsen på at «av er av»** – 103 linjer ny kode over fire filer flyttet ingenting når W er 0.
  W2-armen startet 06:58:19, samme sekund som grunnlinjen avsluttet (lenket jobb, ingen død tid).
- **05:07 KOBLINGSGJENNOMGANGEN: HELE SJEKKEN HAR MÅLT FEIL GREN – OG TO NYE STILLE FEIL FALT UT.**
  Dommen over de fem gjenstående nullradene, med en ny `examples/koblingssonde.ts` som skiller (a) frakoblet /
  (b) stum her / (c) fyrer, målt i nøyaktig de samme 219 valgene:
  | rad | dom | beviset |
  |---|---|---|
  | `okt:` hukommelsen | **(b) stum her** | stilen sikker i 0 av 41 amu-valg; maks \|forskjell\|/SE = 0,47, porten er 2,0 |
  | `profil:` | **(c) i sjekken, (a) i helboten** | justeringen ≠ 0 i 6 av 19 budvalg – men i `…:profil:sik:…` når den aldri budet |
  | `r` kampstilling | (c) fyrer | `racepress ≠ 0` i 10 av 41; maks framdrift 50 %, porten 30 % |
  | `d4` sluttspilldybde | (c) fyrer | `stikkIgjen ≤ 4` i 11 av 41 |
  | `B4` søkebredde | **(b) stum her** | med `m1` returnerer `alphamu.ts:166` FØR breddeblokka på :204 – koden er unåelig |
  **BLINDSONEN ER STØRRE ENN KANAL 2:** `koblingssjekk.ts:61` bygger HELE tabellen på `amu:foerer:…`, mens helboten
  kjører `sik:`. `r`, `d` og `B` **finnes ikke i `sik:`-grenen i det hele tatt** – verken `ParOpts` eller
  `SikkerOpts` har lambda, dybde eller bredde. **Tre av fem rader kan altså ikke si noe om helboten, uansett hva
  de viser.** Det er ikke en feil i seg selv (`sik:` har `e<T>` og `eks:`-laget, og `vurderPar` ER alpha-mu med
  M=1), men det betyr at koblingstabellen vår i ukevis har beskrevet en bot vi ikke kjører.
  **TO NYE STILLE FEIL, begge av kanal 2-klassen:**
  1. **`profil:` når ikke budet i helbotens form.** `agentspek.ts` leser `settForsvarsjustering` i laget RETT
     UNDER seg. `…:profil:budm:…` virker; `…:profil:sik:…:budm:…` gjør ikke – budagenten finnes, ligger ett lag
     for dypt, og `bud` blir null uten et pip. Målt: dybde 1 KOBLET, dybde 2 IKKE SATT. `profild:` legger
     ledningen. Fikser IKKE dagens helbot, som byr med `budq:` – BudQagent er ikke Budjusterbar i det hele tatt.
  2. **`sik:` svelger amu-knotter og slår av HELE søket i stillhet.** `agentspek.ts:1392` validerte ikke
     kandidatfeltet: `sik:…:12k16d4` gir `Number("16d4")` = `NaN`, og i `sampler.ts` er både `NaN <= 1` og
     `0 < NaN` FALSE – løkka går null runder, hver verdenstrekning returnerer `null`.
     Målt mot søkløs base over 115 valg: `12k16` → 23 avvik (søket lever), `12k16d4` → **0 (søket helt av)**.
     **En spek som ser ut som den søker, og en måling som ser ferdig ut.** Ingen spek i repoet har et slikt felt
     i dag, men det er flaks, ikke vern. Nå kaster `r`/`d`/`B` i `sik:` i stedet for å bli `NaN`.
  **FØR/ETTER-TABELLEN (`/d/amb-kobling/analyse/koblingssjekk-etter-2026-09-13.txt`):** de 16 gamle radene står
  UENDRET – som de skal, siden ingen av dem måler `sik:`. Det nye er de tre radene nederst, der knottene får en
  stilling de KAN fyre i:
  ```
  STILLINGEN SOM TRENGS (samme knotter, et sted de KAN fyre):
  okt:  mot tre som ikke drar trumf    89    0   *** IKKE KOBLET ***
    m2B2   soekebredde, M=2           219    4   KOBLET
    m2B4   soekebredde, M=2           219    2   KOBLET
  ```
  **`B4` er dermed bekreftet (b):** knotten var aldri ødelagt, raden var umulig. Med `m1` returnerer
  `alphamu.ts:166` før breddeblokka; med `m2` fyrer den, og `m2B2` gir flere avvik enn `m2B4` – som er riktig vei,
  siden smalere bredde kutter mer.
  **MEN `okt:` STÅR PÅ 0 OGSÅ I DEN NYE STILLINGEN** (0 av 89 valg mot tre som ikke drar trumf). Dommen (b) hviler
  altså på portmålingen (maks |forskjell|/SE = 0,47 mot port 2,0), ikke på at en bedre rad fikk den til å fyre.
  Det er et ÅPENT punkt, ikke et løst: hukommelsen K4/K6 kan være riktig kalibrert-men-stum, eller den kan ha et
  eget brudd som denne stillingen heller ikke avdekker. Verdt en egen runde med sonden.
  Grunnlinja ble reprodusert FØR noe ble endret: alle 16 rader identiske med 11. sep, tall for tall.
  Arbeidet ligger i egen arbeidskopi `D:\amb-kobling` nettopp fordi kanal 2-grenen har en K1-måling gående.
- **06:37 ITERASJON 8 TRENT – OG «TRENT tro:» ER TOM, NØYAKTIG SOM FORUTSAGT.**
  ```
  TRENT bud: MODELL-DIM 323 MODELL-GEVINST-HOLDOUT 0.0726 START-GEVINST-HOLDOUT 0.0000
  TRENT vrak: modell 1.8578 < policy 1.9868 → nytt nett
  TRENT etterlyst: modell 1.0587, policy 1.0587 → forrige nett beholdes
  TRENT tro:                                    ← TOM. Ingen rader å trene på.
  TRENT kort: modell 0.8240 < policy 0.8302, SENT 0.3085 <= 0.3134 → nytt nett
  ```
  Den tomme tro-linja er BEKREFTELSEN på diagnosen fra 05:20: båndet var oppbrukt, alle seks treningsskår døde,
  og trohodet fikk null nye rader. Merk at linja ikke sier «feilet» – den er bare tom, og i en logg full av
  grønne linjer er det nesten usynlig. Det er nøyaktig derfor v10 nå krever en positiv `DATA-SJEKK OK`.
  Resten er ekte framgang: **bud +0,0726 holdout-gevinst** (mot +0,1018 i iterasjon 7), vrak 1,8578 < 1,9868 → nytt
  nett, kortnettet godkjent på begge tall for andre iterasjon på rad (0,8240 < 0,8302 OG SENT 0,3085 ≤ 0,3134)
  – utvalgsfiksen fra 3c4e0b6 holder. Etterlyst uendret (1,0587 = 1,0587), som er en ærlig «ingen framgang».
  Batteriet startet; K1 fra denne iterasjonen skal leses som «troen sto stille», ikke som at troen har stagnert.
- **05:20 ALVORLIGSTE FUNN I NATT: ITERASJON 8 TRENTE TROEN PÅ NULL NYE RADER, OG LØKKA MELDTE SUKSESS.**
  Funnet som biprodukt av strømmeagenten. Verifisert direkte i `iter8/tro/`:
  | | iterasjon 7 | iterasjon 8 |
  |---|---|---|
  | `trening-*.bin` | 6 filer, ~540 MB | **0 filer** |
  | `holdout-*.bin` | 2 filer | 2 filer |
  | `log-t*.txt` | 4 690 B (ekte logg) | **557 B (stackspor)** |
  Alle seks treningsskår døde på `Error: kamp-trening-båndet er avsatt til 4000 kamper`
  (`/d/amb-loop/examples/mlb-trodata.ts:245`). Båndet var rett og slett OPPBRUKT etter iterasjon 0–7.
  **ROTFEILEN ER IKKE BÅNDET – DET ER AT SJEKKEN VAR BLIND FOR MANGLENDE FILER:**
  `for f in "$D"/tro/*.bin; do [ -s "$f" ] ...` itererer over filene som FINNES. Med seks filer borte utvidet
  globben seg til de to holdout-filene, begge ikke-tomme, og løkka logget «DATA tro: 2 filer, 74M» som suksess.
  **En sjekk over en tom mengde er alltid grønn.** Samme form fantes for bud, vrak og kort.
  **RETTET 05:25 (begge deler):**
  1. `/d/amb-loop`: `KAMP_BÅND.trening.maks` 4 000 → 16 000 000 (gammel fil tatt vare på først).
  2. `adams-max-loop-v9.sh`: ny `sjekk_antall` krever riktig ANTALL per type (bud 8, vrak 6, tro trening 6,
     tro holdout 2, kort 20), og hver generatorlogg gjennomsøkes for `^Error:`/stackspor – en krasj skal STOPPE
     iterasjonen, ikke telles som data. Ny linje `DATA-SJEKK OK` bekrefter positivt. `bash -n` grønn.
  **NESTEN-ULYKKE 05:25 – JEG REDIGERTE ET SKRIPT SOM KJØRTE.** Rettelsen ble skrevet rett inn i
  `adams-max-loop-v9.sh` mens iterasjon 8 kjørte NETTOPP den fila (bekreftet i prosesslista:
  `bash.exe /d/amb-imit/adams-max-loop-v9.sh 8`). **Bash leser skript inkrementelt fra en byteposisjon**, og jeg la
  til 1 332 byte rett ETTER utførelsespunktet (kortmerking ~byte 6146) og FØR treningen (~byte 8579) – tolkeren
  ville lest videre fra en forskjøvet posisjon og kunne utført en avkortet eller sammenklippet kommando midt i en
  iterasjon som hadde kjørt i 2,5 time. Dessuten ville den nye `sjekk_antall` stoppet iterasjon 8, som har 0 av 6
  `trening-*.bin`, og dermed kastet kort/bud/vrak-arbeidet som ER gyldig.
  **GJORT OM 05:26:** `v9` tilbakestilt BYTE FOR BYTE (`cmp` grønn mot kopien løkka startet med), rettelsen flyttet
  til `adams-max-loop-v10.sh` for neste iterasjon. Begge `bash -n` grønne.
  **REGELEN, som jeg skulle fulgt uten å bli minnet på den:** et skript som kjører, redigeres aldri – ny fil, nytt
  versjonsnummer. Samme klasse som CRLF-fella i batteri-arbeidskopien.
  **KONSEKVENS FOR ITERASJON 8:** trohodet får ingen ny læring denne runden; `tro-8.bin` blir stående. Kort, bud
  og vrak er upåvirket (egne bånd, data generert som normalt). Batteriet vil måle en iterasjon der troen står
  stille – det skal leses slik, ikke som at troen har sluttet å forbedre seg.
  **OG EN NY KONTAMINASJONSFELLE, funnet samtidig:** `blandeSeed` er LINEÆR, så to ULIKE frø gir IDENTISK giv når
  de skiller `m·2654435761 mod 2³²`. «0 delte frø» har aldri vært tilstrekkelig som kontroll – det gamle
  treningsbåndet deler **8 giv med K8-dommens bånd**. Minste slike avstand er 21 581 449 (m=89) ved
  maksrunder ≤ 128. Nytt bånd er tettpakket (steg 1, bredde 16 mill. < 21,58 mill.), så to kamper i båndet kan
  ikke dele giv, og `delerGiv` hopper over forgiftede frø (~0,7 % tap) framfor å forurense selve målet.
  Steg 7717 var dessuten målt verdiløst: naboenighet 0,21885 (steg 1) mot 0,21995 (steg 7717) mot 0,21893 for
  uavhengige giv.
- **04:37 KANAL 2 KOBLET – OG ROTÅRSAKEN VAR ÉN HARDKODET `undefined`.**
  Agenten fant et sjette bruddpunkt jeg ikke hadde sett, og det er DET som gjorde kanalen stum i den målte boten:
  **`src/moe2/sdpar.ts:276` sendte en hardkodet `undefined` i vrakvekt-plassen til `trekkVerdener`.** `sik:` går
  gjennom `vurderPar`, ikke `vurderSD`, så den ene literalen var hele bruddet. `vurderSD`-bruddet jeg fant er et
  ANDRE, uavhengig brudd på `vv:`/`vr:`-stien.
  **DOKUMENTKONFLIKTEN ER OPPKLART:** AdamsMax.md:543 «kanal 2 er koblet siden §117» gjaldt MÅLEAPPARATET
  (`tro-noyaktighet.ts`/`mlb-k8.ts` kaller `monteTro(..., arm.vrakvekt)` direkte – der ble +0,0046 målt), mens
  linje 1106 «nådde aldri fram fra speken» gjaldt BOTEN og var den riktige. To sannheter om to kodestier.
  Rettelse skrevet inn i AdamsMax.md.
  **AV-TILFELLET ER GJORT STRUKTURELT, IKKE NUMERISK:** ved alfa 0 er nøkkelen FRAVÆRENDE i hvert opsjonsobjekt
  (`...(x > 0 ? {v} : {})`), så argumentet forblir samme `undefined` som før – bit-identiteten hviler ikke på at
  det å legge til null ikke endrer noe.
  **TESTER 42/42 GRØNNE**, inkludert de tre som betyr noe: W0 mot ingen W gir **0 avvikende valg**; K2-asymmetrien
  holder i BEGGE retninger (0 i budvinnerens eget sete per konstruksjon, fyrer i de andre), og testen sjekker
  eksplisitt at den gjettede talongen ALDRI reproduserer det ekte vraket i noen verden – ellers ville sampleren
  sett fasiten. W2 flytter valg utenfor førersetet og 0 innenfor.
  **OG EN MÅLETEKNISK OPPKLARING VERDT Å HA:** `fristMs` settes ikke av noen spek, og `t2000` i `eks:3Lt2000` er
  `maksKonfigurasjoner`, ikke millisekunder. Valgene er en ren funksjon av frø og stilling, så iterasjon 8s CPU-last
  kan IKKE skjeve den parrede K1-sammenlikningen – bare veggklokka. Det fjerner en bekymring jeg hadde om å måle
  under last.
  K1 uten W kjører (4 kjerner); W2-armen må vente på den fordi kjernebudsjettet ikke tar begge samtidig.
- **04:45 KOBLINGSSJEKKEN BEKREFTER DET I PROSJEKTETS EGET FORMAT — «IKKE KOBLET» → «KOBLET».**
  | knott | valg | ulike | status før | status nå |
  |---|---|---|---|---|
  | **W2** kanal 2, vraket (K8) | 219 | **9** | *** IKKE KOBLET *** (0 ulike) | **KOBLET** |
  | **W1** kanal 2, halv alfa | 219 | **5** | fantes ikke som rad | **KOBLET** |
  Samme sele, samme 219 valg som 11. sep-sjekken. Fra 0 til 9 avvikende valg er beviset på at bryteren nå når fram;
  at W1 gir færre (5) enn W2 (9) er dessuten det man skal se – halv alfa flytter færre valg, ikke tilfeldig mange.
  **DEN STRUKTURELLE LÆRDOMMEN, og den er større enn kanal 2:** `amu:`-raden som viste 0 var **RIKTIG**.
  `amu:foerer` er strukturelt STUM for kanal 2 – budvinneren kjenner sitt eget vrak, så vekten er 0 per
  konstruksjon. Den gamle tabellen kunne derfor ALDRI ha fanget dette: den målte en gren der kanalen ikke kan fyre.
  **En knott kan være levende i én gren og død i en annen, og en rad pekt mot feil gren ser identisk ut i begge
  tilfellene.** Det er en målefeil av samme familie som «stum, ikke svak» (§117) og som Jensen-straffen – tallet
  er riktig, spørsmålet var feil. Full tabell nå:
  ```
  PAASLAG (amu-stien, som foer):  W2  219   0  *** IKKE KOBLET ***   ← riktig: amu:foerer er stum
  SIK-STIEN (sik:alle:0.5:12k16MD): W2  219   9  KOBLET
                                    W1  219   5  KOBLET
                                    W0  219   0  AV ER AV (0 forventet)
  ```
  De ti baseradene og seks gamle påslagsrader reproduserer 11. sep tall for tall, så riggen selv har ikke flyttet
  seg – bare sik-seksjonen er ny. Skrevet til `analyse/koblingssjekk-kanal2.txt`; den gamle fila er urørt som
  historisk kilde. Agent satt 04:47 på de fem gjenstående radene med nettopp dette skillet som mandat.
  Dette er første gang en av de fire «IKKE KOBLET»-radene fra 11. sep er lukket. De tre andre står igjen:
  `okt:` hukommelsen, `profil:` motstandermodellen, `r` kampstilling, `d4` sluttspilldybde, `B4` søkebredde –
  verdt en egen gjennomgang, for kanal 2 viser at en «bygd og målt» evne kan være strukturelt frakoblet i boten
  uten at noe feiler. **Neste: er 9 av 219 endrede valg nok til å flytte K1?** Grunnlinje kjører, W2 lenket etter.
- **04:40 FLASKEHALSEN FOR 360× ER IKKE MASKINTID – DET ER AT TRENEREN LESER ALT I MINNET.**
  Agenten anslo «~2 døgn på 6 skard, en helg med maskinen». Maskintiden stemmer; lagringen og minnet gjør ikke:
  | størrelse | tall | mot det vi har |
  |---|---|---|
  | rad på disk (MLBT v1: 996×f4 + 52 i1 + fro/stikk/sete) | **4 044 B** | – |
  | 3,5·10⁸ rader på disk | **1,43 TB** | **628 GB ledig på D:** ✗ |
  | samme i minnet (X som fp16, 1 992 B/rad) | **~705 GB RAM** | **23 GB i WSL** ✗✗ |
  | dagens tak i RAM | **~12 mill. rader = 12×** | trengs 360× |
  `les_mlbt` gjør `numpy.fromfile` per fil og `numpy.concatenate` over alle – ingen `mmap`, ingen strømming.
  Datamengden er altså ikke begrenset av hvor fort vi kan SPILLE, men av at hele korpuset må ligge i RAM samtidig.
  **DET ELEGANTE SVARET ER Å IKKE LAGRE RADENE:** ved 3,5·10⁸ rader trengs ikke 10 epoker over samme data – én
  gjennomgang av en strøm er nok, og da forsvinner både 1,43 TB og 705 GB. Generator → trener direkte.
  Agent satt på dette 04:42. Sekundært: int8-kvantiserte trekk ville tatt raden fra 4 044 til ~1 056 B (374 GB),
  men strømming trengs uansett, så kvantisering er en optimalisering, ikke en løsning.
  `KAMP_BÅND.trening.maks` = 4 000 kamper må dessuten heves (examples/mlb-trodata.ts:206) – ren kodeendring.
- **04:25 TAKDOMMEN: VI ER PÅ ~22 % AV DET RETTFERDIGE TAKET, IKKE 13 % — OG KURVEN FLATER UT.**
  Alle åtte armene + løkkas driftsnett scoret på NØYAKTIG de samme stillingene, ett tak regnet én gang:
  | nett | rader | nett→klarsyn % | **nett→rettferdig %** |
  |---|---|---|---|
  | 1/8 | ~124 k | 8,7 / 7,9 | 11,9 ± 2,0 / 10,8 ± 1,9 |
  | 1/4 | ~251 k | 10,7 / 10,7 | 14,7 ± 2,0 / 14,8 ± 2,0 |
  | 1/2 | ~493 k | 11,9 / 11,2 | 16,4 ± 2,0 / 15,4 ± 2,0 |
  | 1/1 | 984 k | 11,5 / 11,8 | 15,9 ± 2,3 / 16,3 ± 2,3 |
  | **tro-8 (løkkas nett i drift)** | hele løkkas korpus, varmstartet i 8 iterasjoner | **15,9** | **21,9 ± 2,5** |
  Taket selv: 0,3008 mot gulv 1,0986; tak→klarsyn 72,6 ± 3,1 % (altså er 27 % av veien til klarsyn IKKE nåbar ærlig).
  **TRE TING Å LESE UT, og de trekker i hver sin retning:**
  1. **Terskelen min var satt mot feil grunnlag.** Batteriets «13,1–13,5 %» er mot KLARSYN. Mot det rettferdige taket
     ligger driftsnettet på **21,9 %**. Avstanden til 35 % er altså mye kortere enn jeg skrev i natt.
  2. ~~Men skaleringskurven FLATER UT mot dette taket~~ **← DENNE LESNINGEN VAR FEIL, RETTET 04:35.**
     Jeg leste 1/2 → 1/1 (16,4 → 15,9) som metning. Det er ett støyende par på 24 kamper. Den PARVISE
     sammenlikningen, som fjerner variasjon mellom stillinger, gir **1/8 → 1/1 = +3,9 ± 1,7 og +5,4 ± 1,7 pp**,
     altså **1,55 pp per dobling** – som treffer den frie tilpasningen (1,54) nesten eksakt. Én enkelt dobling
     drukner i støy her; takmålingen BEKREFTER stigningen og kan ikke brukes til å påstå metning.
     Lærdommen for min egen del: jeg trakk en konklusjon av to tall som lå innenfor hverandres feilmargin,
     nøyaktig den feilen jeg har advart agentene mot hele natta.
  3. **Løkkas eget nett slår alle skaleringsarmene** (21,9 mot 15,9–16,4). Forskjellen er varmstart over åtte
     iterasjoner og hele korpuset – ikke arkitektur. Det er det sterkeste argumentet for å bare fortsette å kjøre løkka.
  **FORBEHOLD SOM ER STORT:** bare **130 av 384 stillinger er dekket**, alle i stikk 7–9, fordi den eksakte tellingen
  bare er nåbar sent i runden. SE er ±2,0–2,5 pp. Dette er en dom om SENT SPILL på et tynt utvalg, ikke om hele runden.
  Den parvise armsammenlikningen ga tom utskrift – `--par`-grenen i k8-tak.ts skrev ingenting; ikke feilsøkt.
- **04:20 KAPASITETSARMENE FERDIGE – OG ROLLENEDBRYTNINGEN PEKER PÅ ET ÅPENT GREP.**
  Begge brede armer (2048,1536,1024) bekrefter: bredere nett hjelper ikke. Men per rolle:
  | rolle | K8-tap | kort i holdout |
  |---|---|---|
  | **budvinner** | **1,0522 / 1,0498** | 107 344 |
  | makker | 0,8974 / 0,8964 | 80 338 |
  | motspiller | 0,8991 / 0,8999 | 156 586 |
  **Troen om BUDVINNERENS kort er 0,15 nat dårligere enn om de to andre** – og det er ikke tilfeldig: budvinneren
  tar talongen og VRAKER fire kort, så hånden hennes er valgt, ikke delt. Nettopp den slutningen er kanal 2 i
  kravdokumentet («budvinner vraker for å skape renons», `vrakLogVekt` i sampler.ts, bryter `W<alfa>`) – **bygd,
  målt til +0,0046 ± 0,0004 mot «av» (z +10,8), og AV SOM STANDARD.** Dagens helbotspek har ingen W.
  Per stikk faller tapet jevnt (1,044 i stikk 1 → 0,587 i stikk 12), så informasjonen kommer sent – som ventet.
- **04:15 SKALERINGSKURVEN: K8 ER EN DATAOPPGAVE, IKKE EN KAPASITETSOPPGAVE — OG IKKE EN VEGG.**
  Åtte armer, identisk holdout (18 981 rader, 344 268 kortprediksjoner), skrevet punkt for punkt:
  | arm | rader | K8-tap | % gulv → klarsyn |
  |---|---|---|---|
  | 1/8 | 125 751 / 121 345 | 0,98798 / 0,98823 | 10,07 / 10,05 |
  | 1/4 | 251 928 / 250 493 | 0,97089 / 0,97022 | 11,63 / 11,69 |
  | 1/2 | 490 175 / 495 937 | 0,95841 / 0,95610 | 12,76 / 12,97 |
  | 1/1 | 983 819 | 0,94436 / 0,94415 | 14,06 / 14,06 |
  **`tap = 1,23648 − 0,021274 · ln(N)`, R² = 0,9932. Hver DOBLING gir −0,0147 nat/kort = +1,34 pp.**
  INGEN METNING i det målte området – 1/1 ligger like pent på linja som 1/8. Parrede armer med ulike initfrø OG
  ulike kamper skiller 0,0002–0,0003, femti ganger mindre enn én dobling: trenden er ikke frøstøy.
  **KAPASITET BINDER IKKE:** det bredere nettet (2048,1536,1024) på identiske data er **0,0021 DÅRLIGERE** og
  topper på epoke 7 i stedet for 10 – det overtilpasser, det lærer ikke mer. Å gjøre nettet større er altså feil svar.
  **EKSTRAPOLASJONEN AVHENGER HELT AV HVILKET TAK:** mot klarsyn krever 35 % ~4,7·10⁴× dagens datamengde (en vegg);
  mot det NÅBARE taket ~310× (interim, tak 0,3050). Forskjellen er hele forskjellen mellom «umulig» og «noen døgn
  med generering og trening». Fersk takmåling på alle åtte armenes nett i samme `k8-tak.ts`-kjøring er i gang
  (startet 04:12, vakt armert) og erstatter interimtallet – det gamle er målt på sene stikk, holdoutet spenner alle 12.
  MERK OGSÅ: batteriets «13,1–13,5 %» er aritmetisk nett → KLARSYN, ikke mot det nåbare taket som terskelen på 35 %
  er skrevet mot. De to tallene må ikke blandes; det er samme feil som å måle mot klarsyn i utgangspunktet.
- **03:59 P0 — DAGENS UTRULLEDE KJEDE MÅLT I SAMME SELE: K1 +0,43 ± 0,17 (z 2,51).**
  Spek: `vr:vrakrang.bin:telrd:sik:foerer:0.5:24:budm:bud-menneske.json@-3.0:vakt:abmp:e1:d7alle.bin`
  (SØKVERDENER=24 lest ut av `web/app.ts:373`, 273-kortnettet d7alle, 24-brei vrakrangerer – appens faktiske kjede).
  | arm | K1 | z | rundepoeng |
  |---|---|---|---|
  | **P0 dagens app** | **+0,43 ± 0,17** | 2,51 | **+1,55 ± 0,25** |
  | F0 rent filbytte | +0,57 ± 0,17 | 3,45 | – |
  | K3 fører + slutning | +0,76 ± 0,19 | 3,92 | – |
  | full Adams Max | +1,01–1,10 | 5,3–5,8 | +1,17–1,27 |
  **ADVARSEL MOT Å LESE DENNE TABELLEN NAIVT:** F0 ligger +0,14 og K3 +0,33 over P0, men med ±0,17 på hver arm er
  ingen av differansene signifikante regnet UPARRET (F0−P0: z≈0,6; K3−P0: z≈1,3). Armene deler frø, runder og
  motstander, så den PARREDE differansen er den riktige og langt strammere – den regnes nå fra rundedataene.
  Før den finnes skal ingen påstå at et filbytte er en forbedring.
  MERK ET PUZZLE: P0 har HØYEST rundepoeng av alle (+1,55 mot +1,17–1,27 for Adams Max) men lavest ΔP(seier).
  Samme mønster som LIK7 viste omvendt. Poeng per runde og sannsynlighet for å vinne løpet er altså ikke samme
  størrelse, og K1 måler den siste. Verdt å forstå før vi optimerer på feil tall.
- **03:52 OVERRASKELSE FORSØK 2 (STERK REFERANSEPOLICY) — NULL IGJEN, OG NÅ ER NULLET INFORMATIVT.**
  Kun referansepolicyen byttet: grådig ordning → `kort-7.bin` @ T=2. Premisset ble sjekket FØRST, og det holdt:
  på 2304 ekte stillinger scorer grådig NLL **1,6679** på kortene som faktisk ble spilt, kortnettet **1,3287**
  – **0,34 nat/valg bedre**, treff 39,3 → 43,2 %. Referansen var altså virkelig mye sterkere.
  | frø | arm A 996 (uten) | arm B 1044 (med, sterk ref) | diff |
  |---|---|---|---|
  | 20260913 | 0,95790 | 0,95885 | +0,00095 |
  | 20260914 | 0,95772 | 0,95842 | +0,00070 |
  | 20260915 | 0,95889 | 0,95737 | −0,00152 |
  | **snitt** | **0,95817** | **0,95821** | **+0,00004** |
  Per-frø-forskjellene er store og KANSELLERER – lærebokbildet på frøstøy. Forsøk 1 (svak ref) ga +0,00002.
  To referanser, den ene målbart 0,34 nat bedre til å forutsi faktisk spill, gir NØYAKTIG samme null.
  **HVA DETTE UTELUKKER, og det er verdt mer enn tallet:** ekvivalens/overraskelse som INNGANGSTREKK er dødt.
  Forklaringen som står igjen er at nettet allerede ser hele den offentlige historikken og selv kan regne ut hvor
  overraskende et valg var – vi ga det en avledet størrelse av noe det hadde fra før. Determinisme verifisert
  (arm A reprodusert til siste siffer), korpus bit-identisk i de 996 første trekkene, blokka fylt 97,9 %.
  Kostnad, for ordens skyld: 1,44 ms/rad mot 21,5 µs for grådig – 67× dyrere, 40× alle 996 andre trekk til sammen.
  **KONSEKVENS FOR STRATEGIEN: sansebygging til trohodet har nå feilet i seks forsøk** (identitet, kortrekkefølge,
  auksjonsrekke, profil, kortnett-hukommelse, overraskelse × 2 referanser). Det som IKKE er prøvd er DATA og
  KAPASITET. Neste eksperiment (startet 03:55): en dataskaleringskurve for trohodet – blir K8 bedre log-lineært med
  antall rader? Svarer det på om veien fra 13 % til 35 % går gjennom mer data (som vi kan lage) eller ikke går i det
  hele tatt. Eierens egen setning om budmodellen – «nok data bør være nok» – prøves nå på troen.
- **03:42 K1 PÅ UTRULLINGSKANDIDATENE — BEGGE UNDER PORTEN, MEN PORTEN ER FEIL SAMMENLIKNING.**
  Samme 2641 runder, 4 kjerner, samme menneskemotstander som alltid:
  | kandidat | K1 | z | halvdeler |
  |---|---|---|---|
  | F0 (rent filbytte, 24 verdener, ingen kodeendring) | **+0,57 ± 0,17** | 3,45 | +0,38 / +0,80 |
  | K3 (fører, 24 verdener, hele slutningen) | **+0,76 ± 0,19** | 3,92 | +0,49 / +1,07 |
  | full Adams Max (48 verdener, sik:alle), til sammenlikning | +1,01 til +1,10 | 5,3–5,8 | – |
  Begge er altså reelt svakere enn full Adams Max – som forventet, siden de gir fra seg forsvarssøk og halve
  verdensutvalget for å komme innenfor 86 ms. Men **porten (≥ +1,0) er kravet til Adams Max, ikke til en utrulling.**
  Spørsmålet for en utrulling er om kandidaten er bedre enn DET SOM STÅR I APPEN I DAG. Det tallet mangler, og uten
  det er +0,57 verken godt eller dårlig – det er ukalibrert. P0-grunnlinja måles nå i samme sele, samme frø.
  MERK at K3 sin andre halvdel er +1,07: forskjellen mellom kandidatene er nesten helt forsvarssøk og slutningslaget,
  ikke verdenstallet (begge har 24).
- **03:18 OVERRASKELSESBLOKKA (kanal 5, ekvivalens) MÅLTE NULL — men håndverket var riktig, og diagnosen er brukbar.**
  48 trekk, bredde 1044, gren `overraskelse-2026-09-13`: for hvert av de siste offentlige kortvalgene log-sannsynlighet
  for det spilte kortet, spredning over alternativene, rang. Holdout over TRE frø:
  | frø | 996 uten | 1044 med |
  |---|---|---|
  | snitt | **0,95817** | **0,95819** |
  Forskjell 0,00002 nat/kort; spennet mellom frø innenfor hver arm er 0,0012 – seksti ganger større. Treff 44,59 → 44,67 %.
  Per stikk like til tredje desimal HELE veien, også sent i runden der likelihood-vektingen hentet sine +3,83 pp.
  ALT ER VERIFISERT, ikke antatt: blokka fylt i 97,8 % av radene (100 % fra stikk 1), medBok-fella strukturelt lukket
  OG målt (alle 2213 rader bit-identiske med et 996-korpus i de 996 første trekkene), nullpunktprøve viser at blokka
  når fram. Kostnad 21,5 µs/rad. Ingenting skrudd på: løkka trener fortsatt 996.
  **DIAGNOSEN, og grunnen til forsøk 2:** referansepolicyen var motorens GRÅDIGE trekkordning («vinn billigst / kast
  billigst»), som trolig er så forutsigbar at overraskelsen blir en funksjon av kortrangene nettet ser fra før. Vi målte
  altså overraskelse mot en dum spiller. `~lik=selv` – den ene tingen som HAR båret informasjon (+3,83 pp) – bruker
  botens egen søkepolicy som referanse. Forsøk 2 (startet 03:22) bytter KUN referansepolicyen til kortnettet
  `kort-7.bin`, alt annet likt, tre frø. Det gjør målingen til en ren sammenlikning av de to referansene.
- **03:05 UTRULLINGSANALYSEN SNUDDE PREMISSET — «15× for treg» var feil, og det finnes en kandidat UTEN kodeendring.**
  Ny profiler `examples/tidsprofil.ts` spiller appens faktiske bord og er validert mot begge ankere (prod måler 83 s
  der 107 s er dokumentert, ×1,29; full spek 726 s × 1,29 ≈ 15,6 min, som matcher «15–27 min»).
  **Budsjettet er 86 ms per kortvalg.** Dagens spek er 8,8× for treg – ikke 15×.
  | # | kandidat | ms/valg | s/løp | mot budsjett | kodeendring |
  |---|---|---|---|---|---|
  | 1 | K3 fører, 24 verdener, alt av slutning | 87 | 84 | 1,01× | stor |
  | 2 | K1 fører, 16 verdener | 55 | 52 | 0,64× | stor |
  | 3 | K2 fører, 12 + MLB-tro | 41 | 39 | 0,48× | stor + 12 MB |
  | **4** | **F0 rent filbytte** | **64** | **61** | **0,74×** | **INGEN** |
  | 5 | A5 rene nett, søk av | 0,2 | ~0,5 | 0,002× | liten |
  **ALT UTENOM SØKET ER GRATIS: hele kjeden uten søk koster 0,2 ms per kortvalg**, BudQ + vrak + etterlyst + kortnett
  under 1 ms PER RUNDE. Å fjerne nett for å spare tid er altså meningsløst. To knotter er INVERTERTE: å fjerne
  `eks:3Lt2000` gjør boten 18 % TREGERE, og `k32`→`k3` gjør den 60 % tregere. Ingen av dem skal røres.
  **STØRSTE ENKELTFUNN: 493-kortnettet koster ~2× av 273 (102 → 55 ms)** fordi de 220 hukommelseskolonnene regnes i
  hver rollout-node. Det faller sammen med K1-dommen 01:43: **273-nettet er samtidig bedre på K1, halve prisen, og den
  eneste bredden appen kan laste.** Tre uavhengige grunner til samme valg.
  Spaken som virker er `sik:alle`→`sik:foerer` (2,8×) – forsvarssøk er allerede målt verdiløst (−0,027, z −0,55).
  FORBEHOLD: agenten målte TID, ikke STYRKE. K1 på F0 og K3 startet 03:08 med 4 kjerner.
- **02:50 LIK7 FALT OGSÅ — OG DET ER DEN TREDJE DELMÅLINGEN SOM IKKE OVERSETTES.** Likelihood-vekting av verdenene
  fra åttende stikk, alt annet likt: **K1 +0,91 ± 0,20 (z 4,45)** mot +1,01 for samme nettsett uten. Halvdeler
  +0,78 / +1,06. Agent V målte isolert +3,83 pp riktig plasserte kort sent i runden og K8 −0,096 nat/kort — ekte
  gevinster, som IKKE ble til seire.
  MERK ÉN NYANSE: **rundepoeng +1,27 ± 0,29 er det HØYESTE av de tre** (48-basis, W96 +1,17). LIK7 vinner altså flere
  poeng per runde, men ikke flere runder. Det er signaturen til en bot som spiller bedre kort i runder den likevel
  taper/vinner — bedre kortspill, uten at det treffer der marginen avgjøres.
  KONSEKVENS FOR K8-ARBEIDET: begge søkespakene (bredde og vekting) er nå prøvd og gir ingenting på K1. Det som er
  igjen er ikke å søke bedre, men å GI TROEN NY INFORMASJON. Se kanalanalysen under.
- **02:45 K8-TERSKELEN SATT (min beslutning, eieren sov): ≥ 35 % av veien fra gulv til det NÅBARE taket**, skrevet inn
  i D:\amb-krav\AdamsMax.md under K8. Begrunnelse: kravet sa «et tall mellom gulvet og taket» men lot tallet stå
  åpent, og et åpent krav kan ikke innfris. 35 % ≈ tredobling av dagens 13,1–13,5 % mot boter – krever en ny
  informasjonskanal, ikke bare mer trening. Tilleggsvilkår: menneskeraden må ligge målbart over sin null-arm
  (i dag 21,56 mot 21,68 – altså under), ellers måler vi bare at kortene er forutsigbare.
- 01:01 AGENTENE P og Q stoppet av brukergrensen (resets 01:00). Q rakk commit d10406c; P har bare ucommittede filer
  (k8-tak.ts, naabart-tro.ts, test) og et blandingsproblem i SMC tidlig i runden.
- 00:17 O pushet (krav 85725fc; e1-kortbok + kort-data 15/15 + 2 hoppet over etter at kort-3.bin ble kopiert inn).
- 00:17 **agent Q** (D:\amb-agQ): gjør batteriet og alle benker trygge for kortnett 493 (observer ved RUNDE_SLUTT overalt,
  `e1:<fil>h0`-bryter for kortnettets bok i nullarmen, `--kjapp`-batteri 273 mot nullutvidet 493 skal være bit-identisk),
  og gir v5-linjene. Plan: iterasjon 4 bytter kortnettet til 493 (hukommelse i kortspillet → K6).
- 22:15: v3 for iterasjon 3 settes i kø etter «[iter 2] FERDIG»; de endrede radene (K1, K3.4, K3.6, K7, K4) kjøres på nett 3
  med N sin kode fra D:\amb-agN når iterasjon 2-batteriet er ferdig.
- 19:30 **agent N** (D:\amb-agN): nåbare tak for K3.4/K3.6/K7 (som K3.1), K1-porten til avtalt ≥ +1,0 z ≥ 3, K4-nullarmens 1/174.
- (gammel linje) NESTE: menneskerader 996 genereres fra D:\amb-krav-batteri til D:\amb-grp\menneske\rader996\; v3-løkke for iterasjon 2:
  `--sanser2` i trodata/budq-data, budq-tren `--dim 323`, tro med menneskerader + `--minne-dropout 0.5`, + kortnett (M) når klart.
- SVAR TIL EIEREN 16:35: nei, ikke i mål etter iterasjon 1. Reelt nær: K1 (på grensa), K2, K5. Langt unna: K3.1 bud,
  K6 vaner, K8 tro. Må treffes av flere iterasjoner + målefiksene; K6/K8 er de som krever mest.
