# Research: stikkspill-litteratur mot Adams Max sine målte problemer

Startet 2026-09-17 (maskintid). Skrives fortløpende. Merking: **[KILDE]** = står i kilden, **[TOLKNING]** = min lesing/overføring til oss.

**Kort sagt:** (1) Flere verdener hjelper ikke etter et lavt platå (20–160 i bridge og skat), og bedre tro, til og med *perfekt* tro, har gitt null eller dårligere spill også i skat. Deres målinger er typiske. (2) At 16× verdener bare tok flippingen fra 43 % til 37 % tyder sterkt på at flippene stort sett står mellom nesten likeverdige kort, og da koster de lite. Mål regret før dere jager mer støy. (3) Destillasjonen står trolig stille fordi one-hot-etiketter fra et støyete 24-verdenssøk mest er tilfeldige trekninger blant likeverdige kort. Tren mot myke, Q-vektede mål (Gumbel/ExIt-stil). (4) Fart: verdihode i bladene etter avkortet utspilling, kortekvivalens, kandidatbeskjæring og tidlig stopp ved flate stillinger. Se den rangerte listen nederst.

## Logg over kilder (fylles på)

### K1. Long, Sturtevant, Buro, Furtak (2010), AAAI — "Understanding the Success of PIMC"
Lenke: https://webdocs.cs.ualberta.ca/~nathanst/papers/pimc.pdf (lest i full tekst)

**[KILDE]**
- Tre treegenskaper: *leaf correlation* lc (sannsynlighet for at alle søsken-bladnoder har samme verdi), *bias* b (andel korrelerte noder som favoriserer én side), *disambiguation factor* df (hvor fort informasjonsmengden krymper hver gang spilleren er i trekket).
- Måling i ekte spill: tilfeldige utspillinger fra start av kortspillet; gå ned treet og unngå trekk som går rett til terminal; ved "pre-terminale" noder (alle trekk fører til terminal) er noden korrelert hvis alle trekkverdiene er like; bias = andel korrelerte noder som er spilførers seier. df = endring i antall konsistente verdener siden spilleren sist var i trekket. 10 000 spill per skat-type, 1000 målinger nær bladene per spill; hearts 3000 spill × 500 punkter.
- Tall: skat og hearts har lc 0,8 til nesten 1,0, df ≈ 0,6 (tett klynget), bias varierer. Kuhn poker: lc 0,5, b 0,5, df 0.
- Syntetiske trær (dybde 8, 8 verdener per spiller, 10 000 trær per parametertrippel, mot CFR-likevekt): PIMC er verst ved lav lc; med skat-parametre taper PIMC ca. 0,1 poeng/spill (skala −1..1) mot likevekt og vinner ca. 0,4 over tilfeldig.
- Sluttspill i skat: ~15 % av spillene er uavgjort med 3 stikk igjen; der taper PIMC 0,42 TP/spill mot CFR, dvs. 0,063 TP per spill totalt — ubetydelig mot TP-standardavvik 778 over en 180-spills turnering. "the advantage over PIMC in the endgame hardly matters".
- Nevnt: Ginsbergs lattice-søk (mengder av verdener) ga bare +0,1 IMP/spill i GIB.
- Konklusjon/åpent: skat er ikke ett punkt, men en *skybane* av parametre per hånd; foreslår å analysere hver hånd og velge teknikk per hånd.

**[TOLKNING] mot oss**
- Målene er *om PIMC er riktig verktøy* (lav strategisk feil), ikke om *PIMC-valget er stabilt*. De forklarer vårt punkt 1 (søket gir mye) og punkt 5 (sluttspillet er avgjort: høy lc nær bladene = mange flate stillinger; vår 79 % flat med ≤7 kort er i praksis en lc-måling og stemmer med deres 0,8–1,0). De sier ingenting direkte om vår 43 %-flipping.
- Men: høy lc betyr at mange kandidatkort har *nesten lik* verdi. Da er argmaks-flipping forventet og ufarlig: når Q-verdiene til topp-2 er innenfor støyen, koster et bytte lite. **Vår 43 % er derfor ikke i seg selv et mål på tap** — det riktige målet er *forventet regret av flippingen* (verdiforskjell mellom valgt kort og "sant" beste kort, målt med mange verdener), ikke flip-frekvens.
- Amerikaner har skjult makker → df og non-locality er annerledes enn skat (lagene er ukjente til makkerkortet vises). Det kan gjøre stikk 1–4 til "lav df"-sone der PIMC er svakest — konsistent med 60 % flipping der. Dette kan måles med deres metode (antall konsistente verdener før/etter).
- Konkret målegrep: regn ut lc/b/df for Amerikaner per stikk-fase med deres prosedyre. Billig, og gir et teoretisk kart over hvor søket kan gjøre strategiske feil.

### K2. Solinas, Rebstock, Buro (2019), AAAI — "Improving Search with Supervised Learning in Trick-Based Card Games"
Lenke: https://arxiv.org/abs/1903.09604 (lest i full tekst)

**[KILDE]**
- PIMC-algoritmen (Alg. 1): for i=1..n trekk tilstand s fra p(s|h); **for hver kandidat m på samme s**: v[m] += PerfectInfoVal(s,m). Dvs. alle trekk evalueres på *de samme* verdenene (felles tilfeldige tall), og evaluatoren er en perfekt-informasjonsløser (Kermit), ikke en stokastisk utspilling.
- Tro: nett forutsier plassering for hvert av 32 kort (32×4 softmax), p(s|h) ∝ Π_c L(h)_{c,loc(c,s)} (uavhengighetsantakelse). Trent på 20 mill. menneskespill. Poeng: tren på *full* 32-korts fordeling, ikke bare ukjente kort. Bare trent for stikk 1–8 ("inference in the last tricks is minimal beyond ... void suits").
- Beregner p for *hele* informasjonsmengden (opptil 42 mill. tilstander, ~2 s) og sampler derfra.
- Mål på tro: TSSR = p(sann tilstand) · |I| (hvor mange ganger mer sannsynlig enn uniform å trekke sann tilstand).
- Resultater (2500 kamper à 2 spill, TP/spill, std ≈ 1,0–1,4): BDCI (kortspillhistorikk) slår Kermits inferens KI med +4,0/+3,4/+4,7 (suit, 80/160/320 verdener), +0,9..2,1 grand, +4,1..4,8 null. **Merk: antall verdener 80→160→320 endrer nesten ingenting i deltaene.**
- "KI was shown to reach a performance saturation point after sampling 160 states per move (Furtak and Buro 2013)".
- Tid: 320 tilstander per trekk: BDCI 0,286 s, KI 0,093 s per trekk.

**[TOLKNING]**
- Bekrefter vårt punkt 3: flere verdener hjelper ikke i skat heller (metning ved ~160 med *eksakt* bladløser). Hos dem er da restfeilen ikke utvalgsstøy i evalueringen, men modellfeil (tro, strategy fusion).
- Viktig forskjell: de evaluerer med **deterministisk perfekt-informasjonsløser**; vi evaluerer med **nettet som policy i utspilling**. Hvis vår utspilling er stokastisk (samplet policy), har vi en ekstra støykilde de ikke har. Hvis den er grådig/deterministisk, har vi i stedet *policy-bias* (verdien er "hva nettet ville fått", ikke "hva som er mulig").

### K3. Rebstock, Solinas, Buro, Sturtevant (2019), CoG — "Policy Based Inference in Trick-Taking Card Games"
Lenke: https://arxiv.org/abs/1905.10911 (lest i full tekst)

**[KILDE]**
- Policy Inference (PI): vekt per samplet verden = produkt av menneskepolicyens sannsynlighet for alle observerte handlinger gitt verdenen (reach probability). Sampler k = 20 000 (PI20) eller 100 000 (PI100) kortkonfigurasjoner, normaliserer over utvalget. Ca. 5× tregere enn CLI.
- TSSR: PI er mye høyere enn CLI og KI (f.eks. forsvarer i suit ~600–900 mot ~100–150).
- Turnering (5000 kamper): PI slår CLI med +2,32 (suit), +0,64 (grand, ikke sign.), +1,57 (null) TP/spill. **Nesten hele gevinsten kommer fra forsvarerne** (ΔDef ≫ ΔSol) — der er informasjonsmengden størst.
- **Tabell IV — nøkkelfunn for vårt punkt 4:**
  - PI100 (høyere TSSR) er *dårligere* enn PI20 i null (1,03 mot 1,57): "This result contradicts the idea that a higher TSSR value corresponds to better cardplay performance."
  - **Juksende inferens C (all masse på sann tilstand) spiller DÅRLIGERE enn CLI**: −3,25 (suit), −8,49 (grand); bare bedre i null (+9,82). Forfatterne: "further investigation into the exact role inference quality has within the context of PIMC is required."
  - PI20 (sampler konfigurasjoner) slår PIF20 (sampler fulle tilstander) under begrenset budsjett.
- Blandet forsvar (PI+CLI som makkere) gir mindre effekt — inferens-kompatibilitet mellom makkere kan spille inn.

**[TOLKNING]**
- Direkte relevant for vårt punkt 4: også her gir "bedre tro" ikke automatisk bedre spill, og *perfekt* tro kan være verre. Mest sannsynlige forklaring (min, ikke deres): PIMC-spilleren med perfekt tro spiller dobbelt-dummy *mot motstandere som også antas å se alt*, og mister den naturlige "hedgingen" som spredte verdener gir; i tillegg trekker den mot linjer som bare fungerer i én verden (strategy fusion blir ekstrem med én verden). Dvs. en viss spredning i troen virker som regularisering.
- For oss: velkalibrert og skarp tro (effektivt utvalg ~52) er sannsynligvis allerede i den sonen der mer skarphet ikke hjelper. Dette støtter å slutte å jobbe med troen.
- Gevinsten deres sitter hos forsvarerne (størst informasjonsmengde). Hos oss tilsvarer det trolig de som ikke vet hvem makker er i stikk 1–4.

### K4. Buro, Long, Furtak, Sturtevant (2009), IJCAI — Kermit (skat)
Lenke: https://www.ijcai.org/Proceedings/09/Papers/236.pdf (lest i full tekst)

**[KILDE]**
- PIMC i Kermit: per verden løses spillet med alfa-beta (perfekt informasjon), og **trekket som oftest var best velges ("most frequently recorded as the best move")** — dvs. *stemming*, ikke snittverdi.
- Fart i bladløseren: transposisjonstabell, grunne søk for trekksortering, "fastest-cut-first" (−40 % søkeinnsats), og **kortekvivalens**: kort med samme styrke (f.eks. 7-8 i samme farge, eller 7-9 når 8 er spilt) søkes som én representant. Tidlig i spillet grupperes også D med K og 10 med E "at the cost of small score differences".
- Inferens fra bud/kontrakt via tabellfunksjoner, P(world|move) ∝ Π P(f_i)P(f_i|move), trent på 22 mill. menneskespill. Inferens ga store gevinster: Kermit(SD) 996 mot Kermit(NI) 779 poeng per 36 spill (std ~50); mest fra forsvarerinferens.
- Poeng om deterministiske botter: P(move|world) blir 0/1 → sprø inferens mot spillere som ikke spiller som boten selv. Løst ved å lære fra data i stedet.
- Budgivning: statisk tilstandsevaluering lært fra menneskedata (logistisk regresjon på tabellfunksjoner), fordi dobbelt-dummy systematisk undervurderer f.eks. null-spill (forsvarerne "ser" svakheten).

**[TOLKNING]**
- Stemming vs. snitt: når verdiene er nesten like (høy lc), kan stemming og snitt gi forskjellige valg; ingen av delene fjerner støyen. Vi har allerede testet snitt mot min/kvantil/flest-over-verdener (alpha-mu-kriterier) — "flest" er i praksis stemming, og ga ikke bedre. Konsistent.
- **Kortekvivalens er et direkte fartsgrep for oss**: færre kandidater å evaluere per verden (og mindre skinn-flipping mellom ekvivalente kort som uansett er like). Hvis vår 43 % flip-måling teller bytte mellom *ekvivalente* kort (f.eks. 7 vs 8 i samme farge) som flip, er tallet oppblåst. **Sjekk dette først** — det er billig.
- Påpekningen om at dobbelt-dummy-verdier er skjeve (null-spill) er et argument for at vår *policy-utspilling* (nettet, ikke DDS) kan være bedre enn DDS som blad for visse kontrakter — vi bør ikke bytte ukritisk til ren DDS.

### K5. Arjonilla, Saffidine, Cazenave (2024), CoG — "PIMC with Postponing Reasoning" (EPIMC)
Lenke: https://arxiv.org/abs/2408.02380 (lest i full tekst)

**[KILDE]**
- EPIMC: trekk verden, spill tilfeldige handlinger ned til dybde d, bygg et subspill U over infostates, evaluer blad med perfekt-info-evaluator, løs U med en metode uten strategy fusion (Information Set Search eller CFR+). d=1 er PIMC.
- Teori: økt d øker aldri strategy fusion (målt som antall infostates med ulik policy), og det finnes en d som reduserer den strengt.
- Eksperimenter (OpenSpiel, 500 spill, mot PIMC med 1 s): **i stikkspillet ("Card Game", 2 spillere, mest offentlig informasjon) og Battleship gir dybde 2–3 ingen forbedring** — alle ~50 %. Store gevinster bare i spill med *private observasjoner* (Dark Chess: 80/65/45 % ved d=3/2/1 på 100 s).
- Mot IS-MCTS i Dark Chess ble d=2 dårligere enn d=1: "the fused strategy at depth 1 may have been advantageous".

**[TOLKNING]**
- For stikkspill der alle kort som spilles er offentlige, viser kilden selv at EPIMC ikke hjelper. Amerikaner har én ekstra privat komponent (hvem som er makker), men den avsløres offentlig når makkerkortet spilles. Jeg forventer liten gevinst; kostnaden (subspill-løsning i 86 ms) er høy. **Lav prioritet.**

### K6. Cazenave & Ventos (2019/2021) — "The αμ Search Algorithm for the Game of Bridge"
Lenke: https://arxiv.org/abs/1911.07960 (lest i full tekst)

**[KILDE]**
- αμ: spilleren spiller *samme* trekk i alle verdener (fjerner strategy fusion for Max), Min antas å se alt; verdier er vektorer av vinn/tap per verden, Pareto-fronter; M = antall Max-trekk før DDS i bladene. M=1 er PIMC.
- Resultater, 3NT spillefører, 500 utvalgte "uavgjorte" spill (PIMC vinner 30–70 %), **samme seed per spill**: 52 kort, 20 verdener: PIMC 60,2 %, M=2 63,0 %, M=3 62,0 %. 40 verdener: PIMC 62,4 %, M=3 63,2 %. 36 kort: 46,4 → 48,2 %. **Avvik fra PIMC-trekket bare 169–388 av 13 000 trekk (1–3 %).**
- Tid: M=1 0,096 s/trekk; M=3 18,7 s uten, 1,23 s med transposisjonstabell + kutt.
- Ekvivalente kort (normalisert tilstand som i partition search) hoppes over før søket; worlds genereres ved forkastning (constraints fra bud og kjente "sluffs").
- Merk: 20→40 verdener gir +2,2 pp for PIMC her — i bridge med 3NT hjelper flere verdener litt.

**[TOLKNING]**
- Metodisk poeng vi kan kopiere: **evaluér bare på "avgjørende" stillinger** (filtrer bort spill som alltid vinnes/tapes) og bruk samme seed per spill for begge varianter. Det gir mye mer statistisk styrke per kjøring.
- αμ-gevinsten er liten (+1–3 pp i utvalgte uavgjorte spill), og den krever DDS som blad. Vår måling "alpha-mu-kriterier ga null" er konsistent med at gevinsten er liten og ligger i de få beslutningene der αμ avviker.
- **Deres PIMC avviker fra αμ i bare 1–3 % av trekkene, med 20 verdener.** Det antyder at deres PIMC-valg er langt mer stabile enn våre 43 %. Viktig forskjell: DDS-blad er deterministisk og eksakt; vårt blad er en policy-utspilling. [TOLKNING, ikke målt av dem:] dette peker på at **mye av vår flipping kan komme fra bladevaluatoren, ikke fra verdenstrekningen.**

### K7. Ben (lorserker/ben, bridge, åpen kildekode) + Ben på BBO
Lenker: https://github.com/lorserker/ben · konfig: https://raw.githubusercontent.com/lorserker/ben/main/src/config/default.conf · https://news.bridgebase.com/about-ben-on-bbo/ · PyData 2018: https://pydata.org/berlin2018/schedule/presentation/35/

**[KILDE]**
- Kortspill: nett for utspill og spill, sampling av skjulte hender, DDS (dds3). Konfig (default.conf): `sample_hands_play = 200`, `min_sample_hands_play = 20`, `sample_boards_for_play = 5000` (genererte kandidater for å finne 200 aksepterte), `max_unknown_cards_for_sampling = 14` (under dette: generer alle kombinasjoner).
- **Sampling er forkastning med policy-terskler**, ikke vekting: `bid_accept_play_threshold = 0.40`, `play_accept_threshold_opponents = 0.03`, `play_accept_threshold_partner = 0.1`, `lead_accept_threshold = 0.10` — en hånd forkastes hvis nettet ville gitt den observerte handlingen lavere sannsynlighet enn terskelen.
- PIMC-seksjon: `pimc_start_trick_declarer = 1`, `pimc_stop_trick_declarer = 8`, `pimc_max_playouts = 200`, `pimc_trust_NN = 0.00`, `pimc_bidding_quality = 0.1` (søk brukes bare når budkvaliteten i utvalget er god nok).
- `use_biddingquality_in_eval = True` — utvalgets kvalitet påvirker hvor mye nettet stoles på.
- PyData 2018 (Dali): DDS er dyrt, så botter kan sjelden bruke mer enn ~100 utvalg, og "the small sample sizes have too high variance"; foreslår et nett som approksimerer DDS-verdien slik at man kan bruke langt flere utvalg.
- **Ben på BBO**: kortspillmotoren "does not rely on double dummy analysis", er trent på 100 mill. menneskespill; DDS brukes *bare i visse situasjoner* — sent i spillet, når en motspiller ikke følger farge, eller etter svært beskrivende budgivning.

**[TOLKNING]**
- To relevante mønstre for oss:
  1. **Lært verdifunksjon i bladene** som variansreduksjon/fartsgrep (flere verdener per ms). Vi har allerede et nett; en *verdi*-hode (forventet rundeutfall gitt full informasjon) kan erstatte hele utspillingen per verden. Det fjerner utspillingsstøy og gjør hver verden ~12 ganger billigere (én forward-pass mot ~12 stikk × 4 spillere policy-pass).
  2. **Port for når søket brukes** basert på hvor mye informasjonen er avslørt / hvor skarp troen er. Ben-produksjon bruker policy som standard og søk bare der det er trygt. For oss er dette målt motsatt (søket trengs i hele runden), så porten må være *verdibasert* (Q-gap), ikke fasebasert.
- Forkastning med terskel i stedet for vekting gir *likevektede* verdener → ingen vektvarians i snittet. Vi har importance sampling med vekter; effektivt utvalg 52 av 16 384 tyder på at vektene er svært ujevne. [TOLKNING] Hvis de 48 verdenene *resamples* fra 32 kandidater hver (én verden valgt per pulje), er dette allerede i praksis likevektet — da er dette ikke en støykilde.

### K8. Cowling, Powley, Whitehouse (2012) — ISMCTS; Whitehouse et al. (2011) — Dou Di Zhu
Lenker: https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf · https://www.researchgate.net/publication/224259865 · http://orangehelicopter.com/academic/papers/cig11.pdf
(Fulltekst kunne ikke leses her — PDF-gjengivelse manglet. Tallene under er fra sammendrag/sitater i søkeresultater, **ikke verifisert i fulltekst**.)

**[KILDE, sekundært]**
- Determinisert UCT i Dou Di Zhu: 40 determiniseringer × 250 iterasjoner som standardoppsett. Avvegningen mellom antall determiniseringer og iterasjoner per determinisering "does not significantly affect the performance ... as long as both quantities are sufficiently large".
- ISMCTS slår determinisert UCT i Lord of the Rings og Phantom 4,4,4, men er **omtrent likt i Dou Di Zhu** (kortspill der skjult informasjon betyr mindre for algoritmevalget).
- Å se motstandernes kort er en betydelig fordel i Dou Di Zhu → inferens har potensial.
- Furtak & Buro (2013) kritiserer ISMCTS for informasjonslekkasje (motspillerne i søket tilpasser seg på tvers av utspillinger).

**[TOLKNING]**
- ISMCTS løser strategy fusion, ikke utvalgsstøy. For kortspill ga den ikke mer enn determinisering. Lav prioritet for oss.

### K9. Rebstock et al. / GO-MCTS (2024) — "Transformer Based Planning in the Observation Space ... Trick Taking Card Games"
Lenke: https://arxiv.org/abs/2404.13150 (HTML-versjon lest via oppsummering)

**[KILDE]**
- MCTS i observasjonsrommet med en GPT-2-lignende generativ modell (ingen tilstandssampling → ingen strategy fusion/non-locality i PIMC-forstand). Trent iterativt i selvspill (Hearts 10 iterasjoner × 500k spill; skat 20 iterasjoner, startet fra svak bot fordi ren tilfeldig start var ustabil).
- Hearts: ny state of the art (+1,74 poeng/hånd mot PIMC-boten xinxin). **Skat: 9,84 poeng dårligere enn Kermit (PIMC)**, men 6,47 bedre enn egen grådig policy.
- Tid: Hearts 25,6 s/trekk (grådig policy 71 ms, xinxin 2,9 s); skat 42 s/trekk (grådig 72 ms, **Kermit 0,55 s/trekk**).

**[TOLKNING]**
- I skat, som ligner Amerikaner mest (trumf, lag, poengkort), slår godt PIMC fortsatt den tyngre nevrale planleggeren. Støtter at PIMC er riktig kjerne for oss.
- Kermit bruker ~0,5 s/trekk — samme størrelsesorden som våre 580 ms. Ingen i skat-litteraturen jeg fant kjører full PIMC på < 100 ms.

### K10. Blüml, Czech, Kersting (2023) — AlphaZe** (PIMC + AlphaZero)
Lenke: https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2023.1014561/full · https://pmc.ncbi.nlm.nih.gov/articles/PMC10213697/

**[KILDE]**
- PC-PIMC ("policy combining"): per samplet verden kjøres MCTS med nettet; i stedet for å snitte *verdiene* snittes *policyene* per verden. Begrunnelse: verdier er ikke normaliserte, og "samples in which the agent is in a better position are considered more important" ved verdisnitt; policysnitt gir hver verden lik vekt.
- Treningsmål: policy = kombinert PC-PIMC-policy (myk fordeling over alle utvalg), verdi = spillutfall (AlphaZero-tap).
- **"Strategy hopping"**: skifte mellom strategier fra trekk til trekk, "mainly caused by resampling between different moves and not reusing the old search tree or samples" — uløst, anbefalt fremtidig arbeid.
- 3 utvalg (Stratego), 12 (DarkHex), 800 noder per utvalg. Barrage Stratego: 3 utvalg bedre enn 6–12; forskjeller mellom PIMC og PC-PIMC små ved få utvalg, tydelig ved 20.
- TrueSight Learning (trene med synlige kort) hjelper bare marginalt.

**[TOLKNING] — to direkte relevante ideer**
1. *Policy combining* = normaliser per verden før aggregering. Hos oss varierer rundeverdiene mye mellom verdener (noen verdener er "store" gevinster/tap). Et rent snitt lar de verdenene med størst verdispredning dominere argmaks. Per-verden-normalisering (softmax av Q/τ per verden, eller rang, eller Q delt på verdens spredning over kandidatene) gir lik stemmevekt per verden. Dette er **ikke** det samme som "flest over verdener" (hard stemme), som vi testet; det er en myk mellomting mellom snitt og stemme. Kan testes offline på lagrede Q-matriser (48 × kandidater) uten nye utspillinger.
2. *Strategy hopping* er samme fenomen som vår 43 %-flipping, sett fra et annet spill. Deres diagnose: nye utvalg hvert trekk uten gjenbruk. **Gjenbruk av verdener mellom trekk** (fortsett med samme 48 verdener, filtrer dem mot det som er observert siden, fyll på bare de som ble inkonsistente) gir *korrelerte* beslutninger over runden og dermed en konsistent plan. Dette er common random numbers over tid, ikke over kandidater.

### K11. Bouzy, Rimbaud, Ventos (NukkAI, 2020), CoG — "Recursive Monte Carlo Search for Bridge Card Play"
Lenke: https://ieee-cog.org/2020/papers/paper_82.pdf (lest i full tekst)

**[KILDE]**
- "When increasing the computing resources, the MC approach reaches a plateau" — PIMC med DDS (MC-D) platåer ved **NCD = 100** fordelinger (13 kort) og **20** (5 kort). Tabell I: 3 mot 1 +1,3 stikk, 10 mot 3 +0,8, 30 mot 10 +0,25, 100 mot 30 −0,05, 300 mot 100 +0,10, 1k mot 300 −0,15.
- **Bladevaluatorens kvalitet dominerer:** PIMC med *tilfeldig* utspilling (MC-R) platåer ved ~3000 fordelinger og er da **2,7 stikk dårligere** enn MC-D-100. Flere utvalg kan ikke kompensere for et dårlig blad.
- Rekursiv MC (nivå 1, PIMC som simulator i PIMC): MC2-D-300-100 er +0,58 stikk bedre enn MC-D-100 (49 seire, 35 uavgjort, 16 tap på 100 fordelinger) — men én fordeling tar **12 timer**. MC2-R (tilfeldig blad, rekursiv) når MC-D-nivå ("DDS is not necessary"). Flere rekursjonsnivåer hjelper ikke.
- Med 5 kort: beste NCD1 i intervallet 20–30; **større NCD ble dårligere** — "the rule 'the greater the NCD, the better' seems to be wrong for RMC ... Rule G is perhaps wrong with simple MC as well."
- Metode: duplikat (samme fordeling spilt av begge sider) reduserer standardavviket ~10× (fra 5–10 til ~1 stikk) → 100 fordelinger i stedet for 10 000.
- Fremtid: approksimere MC-R/MC-D med et nett som simulator og iterere som Expert Iteration (ExIt).

**[TOLKNING]**
- Sterkeste støtte i litteraturen for vårt punkt 3: flere verdener hjelper ikke etter et platå, og platået ligger lavt (20–100). Våre 48 er i det området.
- Sterkeste hint om *hvor* forbedring ligger: bladevaluatoren. Hos oss er bladet "nettet spiller ut". Forskjellen tilfeldig→DDS er 2,7 stikk; forskjellen DDS→rekursiv PIMC er 0,58 stikk. **Et bedre (eller mindre støyete) blad er sannsynligvis verdt mer enn noe grep på verdenstrekningen.** Destillasjonen (K-seksjon under) forbedrer bladet automatisk hvis kortnettet blir bedre — men kortnettet har stått stille.
- Rekursiv PIMC er utenfor tidsbudsjettet med mange størrelsesordener; bare aktuell *offline* som lærer for destillasjon.

### K12. Veness, Lanctot, Bowling (2011), NIPS — "Variance Reduction in Monte-Carlo Tree Search"
Lenke: https://bowlingmh.github.io/papers/11nips-vrmcts.pdf (lest i full tekst). Ikke stikkspill (Pig, Can't Stop, Dominion), men den eneste kilden jeg fant som systematisk tester klassisk variansreduksjon i spillsøk.

**[KILDE]**
- Tre teknikker: **kontrollvariater** (CV), **felles tilfeldige tall** (CRN), **antitetiske variater** (AV).
- CV-form som ikke krever kjent forventning: Y = Σ ( I[b(S_{i+1})] − P[b(S_{i+1}) | S_i, A_i] ) — summen av "flaks" langs utspillingen (indikator minus sannsynligheten for den). Forventning 0 per konstruksjon. Koeffisient c = −Cov(X,Y)/Var(Y), estimert offline (konstant) når få utvalg, online når ≥ 50. Variansreduksjon = 100·Corr(X,Y)² %.
  - Dominion: b = "trakk en hånd med ≥ 8 penger" (flaks i kortstokken).
- CRN: del de samme tilfeldige hendelsene (terningkast / forhåndsstokkede kortstokker) mellom *alle handlinger* i en node, "to reduce the chance of one action appearing better than another simply because of 'luckier' shuffles". Brukes på *differansen* mellom handlinger, som er det argmaks bryr seg om.
- **Pig-analyse: MSE på selve verdien domineres av bias, men MSE på *differansen* mellom handlingene domineres av varians** (under 1024 simuleringer). Det er differansen som bestemmer valget.
- Resultater: Pig — beste kombinasjon slår basis med dobbelt så mange simuleringer. Can't Stop — tilsvarer 50–60 % flere simuleringer. Dominion — tilsvarer 25–40 % flere. CV mest effektivt; best kombinert med CRN. AV svakest (og virket ikke i Dominion).

**[TOLKNING] — overføring til Amerikaner**
- Vår analogi: "sjansehendelsene" i en utspilling er (a) verdenen (hvem har hvilke kort) og (b) eventuelle tilfeldige policy-trekk i utspillingen. CRN på (a) har vi trolig allerede (alle kandidater på samme 48 verdener). CRN på (b) — **samme tilfeldige tall for hver kandidats utspilling i samme verden** — er bare relevant hvis utspillingen sampler fra policyen. Hvis den er grådig (argmaks), er (b) null og alt ligger i (a).
- **Kontrollvariat for (a) — dette er det mest lovende nye grepet:** Verdiene varierer mye mellom verdener fordi noen verdener er "flaksverdener" (sterke kort hos makker / trumf sitter bra). Det meste av dette påvirker *alle* kandidater likt og kanselleres av CRN. Men hvis kandidatenes verdi-*differanse* også korrelerer med en observerbar verdensegenskap (f.eks. hvor mange trumf / honnører motspiller i trekket har, eller trohodets log-sannsynlighet for verdenen), kan vi trekke den ut: D̂_cv = D̄ − c·(Ȳ − E[Y]), der E[Y] kan regnes *eksakt fra troen* (marginalene for kortplassering er kjent fra trohodet!). Dette er en ren etterbehandling av Q-matrisen og kan testes offline.
- Mer konkret og billigere variant ("stratifisering etter faktum"): Vi har testet stratifisert trekning (feilet). En kontrollvariat er ikke det samme — den krever ingen endring i trekningen, bare en regresjonsjustering etterpå, og kan ikke gjøre det verre asymptotisk hvis c estimeres riktig (men kan gjøre det verre med 48 punkter og online-c; bruk offline-c per fase, som i kilden).
- Deres funn om at varians dominerer *differansen* er et argument for å måle vår flipping som "varians i Q-differansen topp-1 vs topp-2", ikke som flip-frekvens.

### K13. Danihelka, Guez, Schrittwieser, Silver (2022), ICLR — "Policy improvement by planning with Gumbel"
Lenke: https://openreview.net/pdf?id=bERaNdoegnO (ikke lest i fulltekst; fra sammendrag)

**[KILDE, sekundært]**
- AlphaZero kan mislykkes i å forbedre policyen når ikke alle rot-handlinger besøkes. Gumbel AlphaZero: sampler handlinger uten tilbakelegging (Gumbel-top-k), bruker sekvensiell halvering, og trener policyen mot en **forbedret policy = softmax(logits + σ(completed Q))**, som garanterer policyforbedring også med svært få simuleringer. Eksperimenter med n = 200 simuleringer og m = 16 samplede handlinger.

**[TOLKNING]**
- Relevant for destillasjon (punkt 6), ikke for søket selv (vi prøvde sekvensiell halvering — feilet, konsistent med at halvering sparer budsjett men ikke fjerner verdensstøy).
- Treningsmålet er poenget: mykt mål = policy-prior justert med Q-fordeler, ikke one-hot argmaks. Se syntese under.

### K14. Ginsberg — GIB (IJCAI 1999; JAIR 2001) og GIBBO (BBO, des. 2025)
Lenker: https://www.ijcai.org/Proceedings/99-1/Papers/084.pdf (lest i full tekst) · https://arxiv.org/abs/1106.0669 · https://news.bridgebase.com/2025/12/18/introducing-gibbo/

**[KILDE]**
- GIB-kortspill: PIMC med DDS, **50 deals** som standard ("a good compromise between speed of play and accuracy"); 100 deals + mer tid + forklaringer av motpartens bud løste 16 flere av 180 testproblemer (55,6 % → 64,4 %), "each of the three factors appeared to contribute equally". I turnering mot eksperter: 500 deals, ~10 min per spill.
- **Nye deals trekkes for hver beslutning** ("New deals were generated each time a play decision needed to be made").
- Kortspill-inferens: Bayes-oppdatering fra "feil motspilleren ville gjort" → vekt w_d per deal, velg argmaks Σ w_d s(m,d). (Samme struktur som vår importance sampling.)
- Fart: partition search (transposisjonstabell over *mengder* av posisjoner) — 10⁶ → 18 000 noder per deal; beskjærer trekk m hvis Σ_d s(d,m) ≤ Σ_d s(d,m') er bevist; iterative broadening som gir svar når tiden går ut.
- Kjent svakhet: **når to linjer har samme DD-verdi (en som utsetter gjetningen og en som faktisk løser begge tilfeller), "GIB chooses randomly between the third and fourth possibilities"** — de fleste GIB-feil var av denne typen.
- GIBBO (2025): nevrale nett for "single dummy"-simuleringer på mye større utvalg; DDS fortsatt sentralt; **"common-sense logic" (andremann lavt, tredjemann høyt) brukes når DD-analysen viser flere likeverdige valg**; inferens fra spilte kort. +0,4 IMP/spill for Advanced GIBBO mot GIB.

**[TOLKNING]**
- GIB-mønsteret "tilfeldig valg mellom likeverdige" er nøyaktig vår flipping: når PIMC-verdiene er like (vår 79 % flate sluttspill, og sikkert mange midtspillstillinger), er argmaks bestemt av støy. Både GIBBO og Ben løser dette med **en konsistent tie-breaker fra policy/regel** når søkeverdiene er innenfor en margin. For oss: velg nettets foretrukne kort blant kandidater hvis Q-verdi er innenfor ε av beste. Dette endrer ikke spillstyrken i de flate stillingene (per definisjon), men fjerner skinn-flipping og gjør *destillasjonsetikettene* mye renere.
- Merk: "søket overstyrer nettet når parret σ ≥ 0,5" er allerede en slik port. Spørsmålet er om ε er satt der verdiene *faktisk* er like, og om samme regel brukes når etikettene til destillasjonen lages.

### K15. Supplerende (ikke lest i fulltekst — brukt bare som støtte)
- Anthony, Tian, Barber (2017), "Thinking Fast and Slow with Deep Learning and Tree Search" (Expert Iteration): lærlingen trenes mot søkets besøksfordeling (tree-policy target, mykt) i stedet for bare valgt trekk (chosen-action target, one-hot). [Fra hukommelse: TPT ga sterkere spillere enn CAT i Hex — **ikke verifisert i denne økten**.] https://www.researchgate.net/publication/317088029
- Smith & Winkler (2006), "The Optimizer's Curse", Management Science 52(3): å velge argmaks over støyete, forventningsrette estimater gir systematisk overvurdert verdi for det valgte; Bayesiansk krymping som motgift. https://jimsmith.host.dartmouth.edu/wp-content/uploads/2022/04/The_Optimizers_Curse.pdf
- Schafkopf: SchafkopfRL (GitHub) har en "Hand-Prediction PIMC"-agent der hånd-prediksjonsnettet trenes iterativt i selvspill. https://github.com/tobiasemrich/SchafkopfRL
- NooK (NukkAI, 2022): slo 8 verdensmestere i 3NT som spillefører; nevrosymbolsk; offentlige detaljer er tynne. Samme miljø står bak αμ (K6) og rekursiv MC (K11). https://challenge.nukk.ai/

---

# SYNTESE: våre målte problemer mot litteraturen

## Problem 1 — "Søket er hele forspranget"
**Litteraturen:** Samme bilde overalt. Kermit (skat), GIB/WBridge5/Ben (bridge) og xinxin (hearts) er PIMC-baserte. Ingen rent nevral planlegger har slått god PIMC i skat (GO-MCTS taper 9,84 poeng mot Kermit, K9). Long et al. (K1) forklarer hvorfor: stikkspill har høy leaf correlation (0,8–1,0) og rask disambiguering (df ≈ 0,6), så PIMC gjør få strategiske feil. Ben på BBO er unntaket: policy trent på 100 mill. menneskespill, søk bare i utvalgte situasjoner (K7).
**Passer for oss:** Ja. Ingen grunn til å forlate PIMC. Ben viser at en *svært* godt trent policy kan bære mye av spillet, men det bygger på menneskedata i et omfang vi ikke har.

## Problem 2 — Valget er støydominert (43 % flipping; 37 % med 16× verdener)
**Litteraturen:**
- AlphaZe** (K10) navngir fenomenet: "strategy hopping", forårsaket av ny sampling hvert trekk uten gjenbruk. Uløst hos dem.
- GIB (K14): de fleste feil var tilfeldig valg mellom linjer med lik DD-verdi. GIBBO løser likhetene med regelbasert tie-breaker; Ben lar nettet bryte likheter (K7).
- αμ-artikkelen (K6): med DDS-blad og 20 verdener avviker PIMC fra αμ i bare 1–3 % av trekkene.
- Veness et al. (K12): det er variansen i *differansen* mellom handlinger som styrer valget, ikke variansen i verdien.

**[TOLKNING] — det viktigste i rapporten:** 16× flere verdener gir 1/4 av standardfeilen, men flippingen falt bare fra 43 % til 37 %. Hadde topp-2-kortene haft en reell forskjell på mer enn omtrent én standardfeil (48 verdener), ville 16× fjernet de fleste av de flippene. **De fleste flippene er altså mellom kort som er tilnærmet likeverdige** (innenfor ~¼ standardfeil av 48-verdenssøket). Det er akkurat det Long et al. forutsier ved høy leaf correlation. Da **koster flippingen nesten ingenting i spillestyrke**, og flip-frekvens er feil mål. Riktig mål er *regret*: Q_ref(beste) − Q_ref(valgt), der Q_ref kommer fra et stort søk (f.eks. 768-verdenssøkene dere allerede har kjørt). Det er ren reanalyse av eksisterende data.
- Sjekk i samme slengen om kandidatene i samme verden deler tilfeldige tall i utspillingen (CRN, K12), og om flip-tallet teller bytte mellom strengt ekvivalente kort (K4).

## Problem 3 — Fem støyreduksjonsforsøk feilet
**Litteraturen:** Platåer ved lave tall er standard: MC-D platåer ved 100 fordelinger i bridge (K11), Kermit ved 160 (K2), GIB bruker 50 (K14), Ben 200 (K7). NukkAI fant at *større* utvalg kan bli verre i rekursiv MC. Stratifisert trekning og felles pulje er ikke rapportert noe sted jeg fant.
**Ikke prøvd hos dere, men med støtte i litteraturen:**
- **Kontrollvariat** på Q-differansen (K12): etterjustering med en verdensegenskap med kjent forventning under troen. I kildens spill tilsvarte det 25–100 % flere simuleringer. Usikkert for Amerikaner; billig å teste offline.
- **Per-verden-normalisering / policy combining** (K10): mykt snitt av per-verden-rangering i stedet for rått verdisnitt. Forskjellig fra både "snitt" og "flest over verdener".
- **Gjenbruk av verdener mellom trekk** (K10-diagnosen): gir konsistens over runden, men ikke mindre varians per beslutning.
- **Lært blad / verdihode** (K7, K11): fjerner utspillingsstøy og gjør hver verden mye billigere.
**Passer for oss:** Etter tolkningen under problem 2 er forventet spillestyrkegevinst av *enhver* ytterligere støyreduksjon liten, med mindre regret-målingen viser noe annet.

## Problem 4 — Bedre tro / likelihood-vekting / αμ-kriterier ga null eller verre
**Litteraturen — ja, dette er rapportert:**
- Rebstock et al. (K3): **juksende inferens (all masse på sann tilstand) spiller dårligere** enn vanlig inferens i suit (−3,25) og grand (−8,49 TP/spill). PI100 (høyere TSSR) er dårligere enn PI20 i null. Forfatterne kaller det uforklart.
- EPIMC (K5): dypere resonnering hjelper ikke i stikkspill med offentlige observasjoner.
- AlphaZe** (K10): smartere aggregering (PC-PIMC) hjelper lite med få utvalg; Barrage Stratego ble bedre med 3 enn med 6–12 utvalg.
- αμ (K6): +1–3 pp, bare i utvalgte uavgjorte spill, med 1–3 % avvikende trekk.

**Hvorfor [TOLKNING]:** (a) PIMC lar motspillerne i utspillingen spille som om de ser alt. En skarpere tro gjør ikke den antakelsen mer riktig, og spredning i troen virker som en form for robusthet. (b) Når de fleste beslutninger er nesten uavgjort (problem 2), er det lite å hente på bedre tro. (c) Inferens hjelper mest der informasjonsmengden er størst (forsvarerne i skat, K3); hos oss trolig stikk 1–4. **Konklusjon: slutt å investere i troen.**

## Problem 5 — Sluttspillet er avgjort (79 % flatt med ≤ 7 kort)
**Litteraturen:** Long et al. (K1): i skat er 15 % av spillene uavgjort med 3 stikk igjen; PIMC mister der bare 0,063 TP per spill totalt, "hardly matters". αμ og GIB samsvarer.
**Passer for oss:** Ja. **Bruk ikke søketid der stillingen er flat.** Stopp tidlig og spill policyens kort (GIBBO/Ben-mønsteret). Dette strider ikke mot at "søket trengs i hele runden": søket trengs i de *ikke-flate* sluttspillstillingene, og flathet kan oppdages etter få verdener.

## Problem 6 — Destillasjon på etiketter fra ÉN 24-verdenssøk; kortnettet står stille
**Litteraturen:**
- AlphaZero/ExIt/AlphaZe** trener mot **myke** mål (besøksfordeling eller kombinert policy over alle utvalg), ikke mot valgt trekk (K10, K15).
- Gumbel AlphaZero (K13): mål = softmax(prior-logits + σ(Q)), med garantert forbedring også ved få simuleringer.
- Ben/Kermit-familien: policy fra menneskedata; søket destilleres ikke direkte.
- NukkAI (K11) peker på ExIt som veien videre, med søket som lærer.

**[TOLKNING] — hvorfor kortnettet står stille:**
1. Etiketten er argmaks av et søk der topp-kortene ofte er nesten likeverdige (problem 2). En one-hot-etikett fra et 24-verdenssøk er da i praksis en *tilfeldig trekning* blant likeverdige kort. Nettet lærer å fordele sannsynligheten over dem, og det gjør det trolig allerede. Ingen ny informasjon gir ingen endring.
2. Det nyttige signalet sitter i de få beslutningene der søket finner en **stor** Q-fordel; det er der +0,72 pp kommer fra. I et one-hot-tap veier de like mye som alle de nesten uavgjorte, så signalet drukner.
3. Argmaks av støyete estimater er skjevt (optimizer's curse, K15). En *regresjon* mot Q-verdier er forventningsrett, og støyen midles bort over mange eksempler.

**Konkret:** tren mot et mykt mål π* ∝ π_net · exp(Â/τ), der Â er søkets fordel (Q minus snitt-Q) og τ skaleres med målt standardfeil (Gumbel-stil), og/eller vekt tapet med |Q-gap|/SE. Et alternativ er å trene et Q-/fordelshode direkte på alle kandidatenes Q fra 24-verdenssøket (MSE). Hvis etikettene allerede lagrer Q for alle kandidater, er dette bare en endring i tapsfunksjonen.

## Problem 7 — 580 ms per kortvalg; appen har 86 ms (6,7× for tregt)
**Litteraturen:** Ingen full PIMC i skat under ~100 ms: Kermit 0,09 s (320 verdener, K2) til 0,55 s (K9). GIB brukte 90 s på et helt bridgespill. Fartsgrepene som finnes:
- **Kortekvivalens** (Kermit K4, αμ K6): søk én representant per gruppe likeverdige kort.
- **Dominansbeskjæring** av kandidater (GIB K14) og tidlig stopp når utfallet er avgjort (αμs stop-funksjon).
- **Lært bladevaluator** i stedet for DDS/utspilling, slik at man har råd til flere utvalg (Ben/PyData K7, GIBBO K14).
- **Søk bare der det trengs** (Ben: `pimc_start/stop_trick`, `pimc_bidding_quality`, K7).
- Anytime-søk (GIB iterative broadening; αμ iterativ fordypning) og tenking i motstandernes tid (GIB, fremtidig arbeid).
- Tråder (Ben `pimc_max_threads = 12`).

**[TOLKNING]:** Den eneste realistiske veien til 6,7× uten å miste søket er en kombinasjon: (i) avkortet utspilling + verdihode (størst gevinst, grovt 3–10× avhengig av avkortingen), (ii) kortekvivalens + policy-beskjæring av kandidater (typisk 1,5–2×), (iii) tidlig stopp når flatt/avgjort. På sikt: destillasjon (problem 6), slik at søket kan begrenses til få beslutninger.

---

# RANGERT LISTE: grep vi bør prøve

Rangert etter forventet nytte per kostnad. Kostnadene er grove anslag.

### 1. Mål *regret*, ikke flip-frekvens — på data dere allerede har
- **Hva:** For beslutninger der dere har både 48- og 768-verdenssøk: la Q_ref komme fra 768, og mål E[Q_ref(beste) − Q_ref(valgt av 48)], fordelt på stikkfase. Skill ut flipper mellom strengt ekvivalente kort (K4). Sjekk også om kandidater i samme verden deler tilfeldige tall i utspillingen.
- **Forventet effekt:** Ingen direkte spillestyrke, men avgjør om mer støyreduksjon er verdt noe. Min forventning [tolkning]: regret er liten og konsentrert i en minoritet av beslutninger med stor Q-spredning.
- **Kostnad:** Timer. Ingen nye kjøringer hvis Q-matrisene er lagret.
- **Kilder:** Long et al. 2010 (K1); Veness et al. 2011 (K12: differansen er det som teller); Smith & Winkler 2006 (K15).

### 2. Myke, Q-vektede destillasjonsmål i stedet for one-hot fra ett 24-verdenssøk
- **Hva:** Bytt tapsfunksjonen i kortnett-treningen. Bruk målet π* ∝ π_net·exp(Â/τ) med τ ∝ standardfeilen til Â (Gumbel-stil), eller CE vektet med |gap|/SE, gjerne pluss et fordelshode trent med MSE på alle kandidatenes Q. Bruk samme tie-breaker (nettets prior innen ε) når etikettene lages.
- **Forventet effekt:** Det grepet som mest sannsynlig får kortnettet til å bevege seg igjen. Tar nettet opp selv en tredjedel av søkets +0,72 pp, gir det ~+0,2 pp uten søk, og det forbedrer bladet i alle utspillinger. Usikkerheten er høy på størrelsen, middels på retningen.
- **Kostnad:** Lav–middels (endring i treningskode; etikettene finnes). Krever en ny treningsrunde.
- **Kilder:** Danihelka et al. 2022 (K13); Anthony et al. 2017 (K15); Blüml et al. 2023 (K10); Bouzy et al. 2020 om bladkvalitet (K11).

### 3. Avkortet utspilling + verdihode i bladene (fart og støy på én gang)
- **Hva:** Spill ut k stikk med policyen (f.eks. ut inneværende stikk, eller 1–2 stikk til), og evaluer deretter med et verdihode trent på selvspillsutfall (eventuelt på søkets Q). Behold full utspilling som referanse, og A/B-test med samme seed per runde (duplikat, K11).
- **Forventet effekt:** Stor fartsgevinst (anslagsvis 3–10× avhengig av k). Dette er det eneste enkeltgrepet som plausibelt tar 580 ms ned mot 86 ms, og det gir mindre utspillingsstøy. **Risiko:** bladkvaliteten avgjør PIMC-styrken (K11: tilfeldig blad var 2,7 stikk dårligere enn DDS), så et svakt verdihode kan spise opp forspranget. Må måles.
- **Kostnad:** Middels–høy (nytt hode, trening, validering).
- **Kilder:** Ben/Dali PyData 2018 (K7); GIBBO 2025 (K14); Bouzy et al. 2020 (K11); Buro et al. 2009 om lært tilstandsevaluering (K4).

### 4. Billige fartsgrep: kortekvivalens, kandidatbeskjæring, tidlig stopp ved flat stilling, konsistent tie-breaker
- **Hva:** (a) Slå sammen kort som er strengt ekvivalente gitt spilte kort (Kermit/αμ). (b) Evaluer bare kandidater med policy-prior over en terskel, eller topp-k, og ta alltid med nettets førstevalg. (c) Etter f.eks. 12 verdener: er alle kandidater identiske i alle verdener (flat stilling), eller dominerer én kandidat i alle, så stopp og spill. (d) Tie-breaker = nettets prior innenfor ε.
- **Forventet effekt:** Anslagsvis 1,5–3× fart samlet [tolkning]. (a) og (d) fjerner skinn-flipping og renser etikettene. Nær null tap i spillestyrke så lenge terskelen i (b) er konservativ.
- **Kostnad:** Lav.
- **Kilder:** Buro et al. 2009 (K4); Cazenave & Ventos 2019 (K6); Ginsberg 1999 (K14: dominans og tilfeldige likhetsvalg); Long et al. 2010 (K1: flate sluttspill).

### 5. Kontrollvariat / per-verden-normalisering på Q-matrisen (offline først)
- **Hva:** På lagrede Q-matriser (verdener × kandidater): (a) kontrollvariat — juster fordelene med en verdensegenskap Y med kjent forventning under troen (f.eks. antall trumf/honnører hos neste spiller), med c estimert offline per stikkfase; (b) policy combining — snitt av softmax(Q_w/τ) per verden. Mål effekten som regret mot 768-referansen (grep 1).
- **Forventet effekt:** Usikker. Kilden (K12) viser gevinst tilsvarende 25–100 % flere simuleringer i andre spill, men korrelasjonen kan være svak hos oss. Etter tolkningen under problem 2 er spillestyrkegevinsten uansett begrenset.
- **Kostnad:** Lav (ren etterbehandling). Bare verdt det hvis grep 1 viser betydelig regret.
- **Kilder:** Veness, Lanctot, Bowling 2011 (K12); Blüml et al. 2023 (K10).

### Ikke anbefalt nå
- **EPIMC / αμ / ISMCTS / rekursiv PIMC:** små eller ingen gevinster i stikkspill med offentlige observasjoner (K5, K6, K8), og mange størrelsesordener for dyrt (K11: 12 timer per fordeling). Kan bli aktuelt *offline* som lærer for destillasjon.
- **Mer arbeid på troen:** litteraturen og deres egne målinger peker samme vei (K3).
- **Flere verdener:** vi er forbi platået (K2, K11).

---

## Usikkerheter og det som ikke kunne verifiseres
- ISMCTS/Dou Di Zhu-tallene (K8) og Expert Iteration TPT mot CAT (K15) er fra sekundærkilder/hukommelse, ikke fulltekst.
- Furtak & Buro 2013 (rekursiv PIMC i skat, "metning ved 160 tilstander") er bare sitert via Solinas et al. (K2).
- Frank & Basin 1998 er ikke lest direkte; beskrivelsen av strategy fusion og non-locality er fra Long et al. og Cazenave & Ventos, som gjengir dem.
- NooK og WBridge5 har ikke publisert nok detaljer til å si noe konkret om metodene.
- Tolkningen under problem 2 (at flippingen i hovedsak er mellom likeverdige kort) er min slutning fra målingen 43 % → 37 %, ikke noe en kilde har vist for Amerikaner. Grep 1 tester den direkte.
- Jeg har antatt at alle kandidater evalueres på de samme 48 verdenene, og at "32 kandidater per verden" betyr 32 kandidatfordelinger som resamples til én verden. Stemmer ikke det, endres vurderingen av CRN (K12) og vektvarians (K7).
