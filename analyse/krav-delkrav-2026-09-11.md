# Adams Max — alle kravene, delt opp, og om dagens kode kan innfri dem

11. september 2026. Kilde: `AdamsMax.md` (kravene og prøvene i Arvinds ord),
`docs/krav-status.md`, `analyse/krav-samspill-2026-09-10.md` og målingene 10.–11. sep.
Hvert tall har n og dato; står det ikke et tall, er det ikke målt.

**Kan dagens kode innfri delkravet?**

- **JA** — bevist og voktet av test
- **BYGD** — koden finnes og måles; om den innfrir er et spørsmål om trening/måling, ikke om kode
- **DELVIS** — en del finnes, en navngitt del mangler
- **NEI** — må bygges

Kandidatene: **Adams-v5** (utrullet) · **i2** (MLB, imitasjon av Adams med seiersmål) ·
**R1 e1–e6** (RL fra i2) · **R2** (alt trenes sammen, starter når R1 er ferdig).

---

## K1 — Spille bedre enn mennesker og aldri tape i lange løp

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K1.1 | Menneskene vinner **< 5 %** av kampene til 100 (strekkmål, retning) | fullførte kamper fra 10. aug 22/83 = 26,5 % [18,2–36,9]; med forlatte kamper anslått 23,0 % [18,3–28,4], gulv 8,3 %. I praksis ÉN spiller (88 % av kampene). Mennesket taper budrunden (klarer 56 % mot botenes 75 %, bud 11: −6,2) og henter igjen som makker og i motspill. For å vise < 5 %: 0 seire i ≥ 74 kamper (gjennomgang 11. sep) | **NEI** — ingen kandidat er sterkere enn Adams: i2 0,225 mot tre Adams (400 frø, −2,9 SE), R1 e1–e4 0,233 / 0,234 / 0,220 / 0,217 |
| K1.2 | Målt mot boten menneskene FAKTISK møter | appen kjører `bud-menneske` + `sik`-søk (24 verdener) i førersetet; benken dømmer mot `ADAMS`-speken | **BYGD** — appspeken finnes og er tidsmålt (1 frø 481 s → 100 frø ≈ 50 min), ikke kjørt som dom |
| K1.3 | Nok menneskedata til at intervallet sier noe | 32,1 % var et TAK (69 % forlatt, de fleste bak) | **BYGD** — loggingen finnes; flaskehalsen er kvelder med spill |
| K1.4 | Proxy-benk: kontroll 0,2500, disjunkte frøbånd, alle skard | kampbenken leste bare skard 0 fram til 10. sep — rettet, alt omlest | **JA** (`test/kamp-les.test.ts`) |

## K2 — Aldri jukse

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K2.1 | Valget er invariant når bare skjulte kort endres — i ALLE faser | 0 avvik (Adams); MLB: tro, trekk, nett, selvspill 11/11 i hvert batteri og før/etter hver RL-epoke | **JA** |
| K2.2 | Prøven kan feile (jukser tatt) | `juks:6` tatt 6 av 9; MLB-armene lekker én bit og tas | **JA** |
| K2.3 | Samplerens verdener er lovlige (talongen) | lekkasje funnet og rettet | **JA** (`test/talonglekkasje.test.ts`) |
| K2.4 | Skjult info bare i ETIKETTER i trening, aldri i innganger | troFasit, stikkfasit; seiersmålet leser bare poengtavla | **JA** (`mlb-herkomst`, sansekontrollen 10. sep) |
| K2.5 | Ingen lagring på tvers av økter | hukommelsen dør med kampen | **JA** (test) |

## K3 — Spille optimalt med SOTA-komponenter i alle faser

Prøven: hver fase avgjøres av et søk eller en lært modell, ikke en håndregel, og gapet til fasens tak er målt.

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K3.1 | **Budrunden** nær taket | Adams 41,8 % av taket igjen; i2 +7,90 ± 1,19 poeng/runde igjen (bånd 0, n=120, 11. sep), R1 e1 +8,83 ± 1,22, e12 +10,6 | **DELVIS** — budet læres i samme nett; budsøket (K=240, +2,0 poeng/runde målt) finnes, men er for dyrt i spill og ikke destillert |
| K3.2 | Amerikaner og solo som ekte valg | **0 av 2,74 M** budvalg hos Adams; mennesker 5 av 5 576 (0,09 %) | **DELVIS** — i handlingsrommet, aldri øvd (nedprioritert) |
| K3.3 | **Vrak** | Adams: lært vrakrangerer; i3 85 % samsvar etter kanonisk rekkefølge | **BYGD** |
| K3.4 | **Trumfvalg** | i2 93,7 % samsvar med Adams | **BYGD** |
| K3.5 | **Etterlysning** | «høyeste lovlige» målt best (nest høyeste −0,911); nettet 99,9 % | **BYGD** — lave etterlysninger aldri sett |
| K3.6 | **Midtspill** (utspill, makker, forsvar) | ingen egen takmåling på MLB; Adams: søk bare i førersetet | **DELVIS** — tak-kart finnes; søk ved spilletid mangler i MLB |
| K3.7 | **Sluttspill** | se K7 | se K7 |
| K3.8 | Beslutninger fra søk/lært modell, ikke håndregler | MLB: ett nett, ingen terskler; Adams: `BUDTERSKEL −3,0`, konvensjonsvetoer | **BYGD** i MLB |
| K3.9 | Budmodellen SIST, med tre innganger: egen styrke, kontekst (K5), motstander (K4/K6) | MLB lærer bud og spill sammen; kontekst via MAKRO + seiersmål; motstander via hukommelsen | **BYGD** — innslaget er ikke vist |

## K4 — Hukommelse over hele spillet, og planlegge framover

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K4.1 | Prøve A: samme runde spilt som runde 1 og runde 8 gir ULIKE valg | «ja» i alle batterier: hukommelsen endrer 17–36 % av valgene (n=36 per bånd — lite) | **JA** (144 innganger, kampbenken bokfører) |
| K4.2 | Hukommelsen gir GEVINST, ikke bare endring | umålt som eget tall — se K6.3 | **BYGD** |
| K4.3 | Prøve B: framoverblikk (`M ≥ 2`) gir målt gevinst | Adams: `amu` M=2 kostnad løst, gevinst umålt; MLB: søket står av | **NEI** for MLB — søk ved spilletid må kobles på (`src/mlb/sok.ts` finnes) |

## K5 — Forstå konteksten og tilpasse seg

Arvind: tre nivåer — makro (race mot 100), meso (kontrakten), mikro (stikket).

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K5.1 | Samme kort, ulik kampstilling → ulike valg | 11–15 % endrede kortvalg (n=360 per bånd), kontroll 0,0000 | **JA** |
| K5.2 | RETNING: bak ⇒ mer risiko (målt på budet fra 10. sep) | i2 ja / **nei** (p 0,061); R1 e1 ja / ja; e2 ja / **nei** (p 0,361) | **BYGD** — seiersmålet gir gradienten; ikke stabilt |
| K5.3 | Makro: stillingen og løpslengden er sanser | MAKRO 23 trekk inkl. racepress og to målPoeng-skalaer | **JA** |
| K5.4 | Meso: kontrakten tilpasses stillingen | seiersmål + kvantilhode; amerikaner/solo mangler | **DELVIS** (K3.2) |
| K5.5 | Mikro: stikkene | stikkhode forklart +0,87 på holdout | **BYGD** |
| K5.6 | Målt der det kan sees (kamper, ikke én runde) | kampbenk + batteri; porten er fortsatt gate 2 (styrer bare ligaen) | **JA** |

## K6 — Lære andre spilleres vaner underveis og utnytte dem

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K6.1 | Oppdage vanen i løpet av kampen | hukommelsens residualer tar innøvde vaner (enhetstester) | **JA** |
| K6.2 | Mer gevinst mot stilisert enn nøytral | nivå dd −0,56 ± 0,40 (i2 b0) — ikke positivt | **BYGD**, ikke innfridd |
| K6.3 | Gevinsten VOKSER med rundenummer (signaturen) | «nei» i alle: e12 z 1,43/0,48, i2 z 1,41, R1 e1 z 1,08 | **BYGD**, ikke innfridd |
| K6.4 | Prøvd mot vaner nettet ALDRI trenes mot (VANER_TEST) | håndhevet | **JA** |
| K6.5 | Befolkningen i trening HAR vaner å lære | R1: vaner i 15 % av kampene, Adams har ingen | **BYGD** — R2 `--ligavekter 0.3,0.2,0.5` → 25 % |
| K6.6 | Lese budvanene til DENNE motstanderen (Arvinds «byr 11 → gode kort») | mennesker byr 11 i 14,5 % av vunne budrunder mot 4,7 % for botene | **DELVIS** — hukommelsen har MESO-budavvik; trosnettet leser den ikke (K8.4) |
| K6.7 | Per økt, ingen lagring | håndhevet | **JA** |

## K7 — Matematisk optimale løsninger i sluttspillet

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K7.1 | I stillinger med eksakt løsning: velg den (100 %) | gap siste fem stikk: Adams +0,947, e12 +0,99 ± 0,16 poeng/runde (n=480); i2 måles | **DELVIS** — `poengdds` verifisert, men ikke brukt av MLB i spill |
| K7.2 | Løsningen mates inn i planen over (M ≥ 2) | alpha-mu `d4`/`d5` målt null; MLB-søk av | **NEI** for MLB |
| K7.3 | Gapet er INFORMASJON (§117) → avhenger av K8 | diagnose: to tredeler i 16 av 1 000 giv, kontraktvipp som krever riktig tro | følger K8 |

## K8 — Predikere motstandernes kort på veldig høyt nivå, uten juks

| # | delkrav | status i dag | kode? |
|---|---|---|---|
| K8.1 | Et tall mellom gulv og tak | trosnettfila 13,65 % / 13,15 % (n=960 per bånd); nettets eget trohode i2 10,54 % / 10,03 % | **JA** (målingen) |
| K8.2 | «Veldig høyt nivå» | ingen terskel definert; ~13–15 % av veien | **BYGD** — terskelen er ikke satt |
| K8.3 | Uten juks | `mlb-k2-tro` | **JA** |
| K8.4 | Motstanderspesifikk: troen om DENNE spilleren | trent på Adams: 12,34 % → 5,09 % mot annen motstander; trosnettet har INGEN hukommelsesinngang | **DELVIS** — R2 trener trosnettet på dagens befolkning (røyk 13,2 % → 14,7 %); hukommelse inn i troen ikke bygd |
| K8.5 | Hvert offentlig valg oppdaterer troen — kanal 1 bud | budhistorikk per spiller i trosnettets innganger | **JA** (MLB) |
| | kanal 2 vrak | bare budvinnerens eget vrak er synlig; indirekte for andre | **DELVIS** |
| | kanal 3 etterlysning | etterlyst kort og om det er ute | **JA** |
| | kanal 4 renons/trumfet | hvem la hvert kort, spilt per farge | **JA** |
| | kanal 5 makkers signal (relativt til alternativene) | bare implisitt via historikken | **DELVIS** |
| | kanal 6 egne framtidige valg (M ≥ 2) | krever søk | **NEI** |
| K8.6 | Troen er en fordeling, ikke ja/nei | 4 klasser per kort (3 seter + talong) | **JA** |

## Tverrgående

| # | krav | status | kode? |
|---|---|---|---|
| X1 | Modulene UTVIDER nettet (én beslutning over summen), overstyrer det ikke | MLB er ett nett | **JA** |
| X2 | Målt = utrullet | MLB er ikke utrullet; appens kjede ≠ benkens spek | **DELVIS** (K1.2) |
| X3 | Kravene trenes SAMMEN («man går ikke på ett ben») | R1: bare policyen lærte; R2: trosnett + belønning + vaner i samme løkke | **BYGD** (R2) — hukommelse → tro og søk mangler |
| X4 | Rekkefølge: K2–K8 → intern test → deploy; offentlig repo uten fornavn; ikke deploy uten varsel | følges | **JA** |

---

## Oppsummert

| krav | innfridd i dag? | kan dagens kode innfri det? | det som mangler |
|---|---|---|---|
| K1 | nei | ikke vist | en bot sterkere enn Adams, dom mot appens kjede, flere menneskekamper |
| K2 | **ja** | **ja** | — |
| K3 | nei | delvis | budgapet (+7,9), budsøk destillert, søk ved spilletid, amerikaner/solo |
| K4 | halvt (A ja, B nei) | delvis | søk ved spilletid (framoverblikk) |
| K5 | delvis (retning ustabil) | bygd | stabil retning på tvers av bånd; amerikaner/solo |
| K6 | nei | bygd | vaner i treningsbefolkningen (R2), hukommelse → tro |
| K7 | nei | delvis | K8 først, deretter søk/eksakt løser ved spilletid |
| K8 | nei (ingen terskel, ~13–15 %) | delvis | trosnett på dagens befolkning (R2), hukommelse som inngang, terskel for «veldig høyt» |

**Det som ikke finnes i koden i dag, og som tre krav venter på:** søk ved
spilletid oppå MLB-nettet (K4.3, K7.2, K8 kanal 6), og hukommelse som inngang til
trosnettet (K8.4, K6.6). Resten er bygd; spørsmålet der er om trening og måling
når tallene.

---

## Oppdatering natten til 11. sep (maskintid, Tokyo)

Kursen fra eieren kl. 03: gjør Adams sterkere DIREKTE (søk, tro, lærte bud); MLB fortsetter
som forskning; trening foran benking; menneskekravene (K1, K6) sjekkes etter utrulling.

| # | før | nå | hva som ble gjort |
|---|---|---|---|
| K8.4 / K6.6 | hukommelse → tro ikke bygd | **BYGD hele veien**, gevinst bare i treningsbefolkningen | 804-inngang, `--tro-hukommelse`, `MlbSøketro` i søket, `rundeslutt` i appen. R1-holdout −0,0055 ± 0,0007 (7,6 SE, placebo null); i Adams-drevne kamper null (K8 per runde, 24+24 kamper). Må trenes på motstanderne den skal brukes mot. |
| K8.4 måling | batteriet så bare runde 1 | **JA** (verktøy) | `mlb-k8 --kamp --nett2 --drivere`, standardstien byte-identisk |
| K3.6 / K8 | søket trakk verdener etter budet alene | **BYGD** | MLB-trohodet i Adams-søket: +6,1 pp riktig plasserte kort (forsvar +7,6, makker +7,0). Kampbenk mot appens kjede kjører. |
| K3.6 | søk bare som fører, med feil mål for makker/forsvar | **BYGD** | `sik:alle…L` — lagmålet i utspillingene |
| K3.1 / K3.2 / K3.8 / K5.4 | håndregel over GBT-μ, amerikaner/solo aldri valgt | **BYGD, trenes nå** | `BudQagent` (`budq:`): Q(stilling, bud) lært fra utspillinger, argmax over lovlige bud inkl. amerikaner/solo, kampstillingen i trekkene. Data genereres (`examples/budq-data.ts`), trener `verktoy/budq-tren.py`. |
| K1.2 / X2 | appen ≠ benken | **BYGD** | appen bygger kjeden via `byggUtrullet`; `test/app-lik-spek.test.ts` spiller appens oppdeling mot speken |
| nettside | frys, 20 s frist, søket av for økten | **JA** | frist < 5 s med søket selv på 4 s, feil løses, gjenoppretting, logging av lag/σ/verdener. Ikke utrullet. |
| K6.6-data | botenes bud ikke logget | **BYGD** | `runde`-raden logger `budrunde` for alle seter (virker fra neste utrulling) |
| K8.2 | ingen terskel | **FORSLAG** | «veldig høyt nivå» = **≥ 25 % av veien gulv → tak** på K8-batteriet (log-tap ≤ 0,824 med gulv 1,0986). I dag 13,65 % (trosnettfila), R2-trosnettet 0,918 på egen holdout ≈ 16 %. |

Fortsatt NEI: K4.3/K7.2/K8 kanal 6 (søk oppå MLB-nettet), K7.1 (eksakt sluttspill i spill),
K8 kanal 2 og 5. Menneskedata: 3 251 runder med full historikk ligger i Val Town, men det
finnes ingen eksportvei — eksisterende skript leser en lokal dump fra 23. jul–1. aug.

---

## Oppdatering formiddag 11. sep (maskintid, Tokyo)

Eieren spurte om alt som manglet i lista var kodet inn. Svaret var nei; dette er gjort siden.

| # | før | nå | hva som ble gjort |
|---|---|---|---|
| K3.1 / K3.2 / K5.4 | BudQ bygd, ikke utrullet | **UTRULLET** | BudQ-s2 på nettsiden fra 10:40 (fac2ec0); første ekte kamp 10:55 logget `modeller.budq = true`, søk 0,55–0,97 s. |
| K7.1 | eksakt sluttspill ikke brukt i spill; `eksakt.ts` målt negativ | **BYGD, dom køet** | To feil rettet: makkeren lekket før avsløring (K2) og det etterlyste kortet kunne ligge hos budvinneren. Løser byttet til spillernes poeng (`poengdds`) med klasseutvidelse, lagmål. `eks:` i appens bygger for alle roller. 3 stikk igjen: maks 288 ms. Kampbenk mot appens kjede startes når d5 er ferdig. |
| K8 kanal 5 | bare implisitt via historikken | **BYGD, dom klar** | `src/mlb/signaltrekk.ts`: per sete og farge utspill og høyde, fulgte under (og taket det ikke slo), tok over, kastet; trumfet. Bygd av offentlig informasjon alene (K2 bit-identisk prøvd). |
| K8 kanal 2 | bare budvinnerens eget vrak | **BYGD, dom klar** | Budvinnerblokk: trumffarge, etterlyst farge, budvinnerens viste renonser og spilte kort per farge – det de andre kan slutte vraket fra. |
| K8 måling | – | **klar** | Trohoder med 776/920 innganger; et gammelt nett utvidet med nullkolonner gir samme tro. Omtrening med nøyaktig 10. sep-oppskriften pluss `--signal`, parret mot 12,37 %-nettet. |

| K7.2 | alpha-mu d4/d5 målt null; eksakt løsning ikke i planen | **BYGD, dom køet** | `sik:…:<V>e<T>`: søkets utspillinger løses eksakt i hver verden fra T stikk igjen (poengdds). Verdiene er prøvd lik likevekten regnet fra roten; av er bit-identisk. Kampbenk (app-q + `24e3`) køet etter K7.1. |
| K4.3 / K7.2 / K8 kanal 6 for MLB | «søk ved spilletid må kobles på» | **BYGD** | Ingen ny søkekode i `src/mlb/` – herkomstprøven forbyr løseren der, og `sok.ts`-kroken er for søk i treningen (AVGJØRELSE 5). Søk ved spilletid er komposisjon: `sik:…e3L:mlb:…` og `eks:3L:mlb:…`. `test/mlb-spilletidsok.test.ts` viser at det bygger, vurderer, slår til og er K2-invariant. Gevinsten er umålt til MLB-nettet er sterkere enn Adams. |

| K1.3 / K6-data | ingen eksportvei; skriptene leste en dump fra 23. jul–1. aug | **BYGD** | Valen har sidevisning (`?format=json&etter=<id>&grense=<n>`, samme offentlige data – eieren: ikke sensitivt). `examples/menneske-eksport.ts` henter hele historikken: 97 145 hendelser, lik tellingen i databasen. Navn byttes mot saltet pseudonym før noe skrives; saltet ligger utenfor repoet. |

Fortsatt åpent: DOMMENE over K7.1 og K7.2 (kampbenk mot appens kjede) – bygd er ikke innfridd.
