# Research: læringsbasert spill-AI med skjult informasjon, mot Adams Max sine målte problemer

Startet 2026-09-17 (maskintid, UTC+9). Skrives fortløpende.
Merking: **[KILDE]** = står i kilden, **[TOLKNING]** = min lesing/overføring til Amerikaner.

## Kildelogg (fylles på)

### DouZero (Zha et al. 2021, Dou Dizhu) — https://arxiv.org/abs/2106.06135 (ar5iv: https://ar5iv.labs.arxiv.org/html/2106.06135), kode: https://github.com/kwai/DouZero
- [KILDE] Deep Monte-Carlo (DMC): Q(s,a) regresseres med MSE direkte mot **episodens faktiske utfall**, gamma = 1, ingen bootstrapping, ingen søk. Belønning bare ved slutt.
- [KILDE] Nøkkelen er **handlingen som inndata**: Q-nettet tar (tilstand, kandidathandling) og gir én skalar — ingen fast utgangsvektor. Kort kodes som 4x15 en-hot-matriser (antall x rang). Historikk: LSTM over de 15 siste trekkene; deretter 6 lag MLP à 512. Tre separate nett (én per rolle).
- [KILDE] Epsilon-grådig utforsking, 45 parallelle aktører på 3 GPU + 1 learner-GPU, én server (48 kjerner, 4x1080Ti), 30 dager totalt. Aktørene synkroniserer med siste nett hver iterasjon => **selvspill mot seg selv (nyeste)**, ikke mot en pool. Ca. 10 mrd. prøver totalt (tall fra PerfectDou-artikkelen).
- [KILDE] Slo supervised-baseline (226 230 menneskepartier, ~84 % treffsikkerhet på menneskets trekk) etter **2 dager** (WP) / 10 dager (ADP). Slo søkeboten DeltaDou (PIMC/MCTS-basert) etter ~10 dager: 58,6 % WP, +0,258 ADP over 10 000 given. Nr. 1 av 344 på Botzone.
- [KILDE] Ablasjoner: flere aktører gir samme prøveeffektivitet men raskere veggklokke. DQN divergerer ofte (overestimering i stort handlingsrom); SARSA omtrent likt DMC; actor-critic "feiler". **Målet betyr noe**: WP-trent (vinn/tap) og ADP-trent (poeng) spiller ulikt (bomber).
- [KILDE] Inferens: én fremoverpassering, størrelsesordener raskere enn DeltaDou.
- [TOLKNING] Det overførbare: (a) MC-mål fra *faktisk utfall* er upartisk og krever ingen søk, men har høy varians — DouZero kompenserte med enorme prøvemengder (10^10). Amerikaner har 12–13 stikk og 4 spillere, så variansen per utfall er trolig lavere enn ved Dou Dizhu-poeng med doblinger, men vi har ikke 10^10 partier på én 5080 med små nett i Python... eller har vi? Små MLP-er på GPU med batchet selvspill kan nå 10^4–10^5 partier/min hvis spillmotoren er rask; det er motoren, ikke nettet, som er flaskehalsen. (b) Handling-som-inndata passer godt for kortvalg (≤13 lovlige kort). (c) Supervised på menneskedata var *svakere* enn RL-selvspill etter kort tid — samsvarer med vårt «nett = menneske»-tak.

### PerfectDou (Yang et al. 2022, NeurIPS) — https://arxiv.org/abs/2203.16406
- [KILDE] Perfect-Training-Imperfect-Execution (PTIE): PPO+GAE der **verdinettet (critic) ser alle kort**, mens policy-nettet bare ser egen informasjon. Kun policyen brukes ved spill. I tillegg belønningsforming ("oracle reward") fra minste antall trekk for å spille ut hånden (DP-beregnet), som differanse mellom påfølgende steg.
- [KILDE] Policy: LSTM + action-attention, MLP [256,256,256,512]; verdi: MLP 4x256. Handlingsrom abstrahert til 621.
- [KILDE] Prøveeffektivitet: ~2,5 mrd. prøver mot DouZeros ~10 mrd.; ved 1 mrd. allerede bedre enn DouZero trent på 10 mrd. Mot offentlig DouZero: WP 0,543, ADP +0,143.
- [KILDE] Ablasjon: vanilla PPO feiler (WP ~0,51); uten perfekt info i critic eller uten belønningsforming blir særlig ADP dårligere. (Ablasjonstabellen er vanskelig å lese entydig fra HTML-utgaven — tallene bør sjekkes i PDF før de siteres videre.)
- [KILDE] ~6 ms per beslutning på CPU. Selvspill mot nyeste motstandermodeller (maks 1 versjon etterslep).
- [TOLKNING] Den billigste overføringen for oss: en **perfekt-info verdi/baseline** (ser alle 52 kort) som reduserer variansen i RL-målet, mens policyen forblir imperfekt. Vi har allerede et trohode; en critic med full info er et naturlig tillegg.

### Suphx (Li et al. 2020, Microsoft, Riichi mahjong) — https://arxiv.org/abs/2003.13590
- [KILDE] Pipeline: supervised på Tenhou-toppspillere (discard-modell 15 M prøver, andre 4–10 M) -> RL (policy gradient m/ importance sampling, entropi-regulering med adaptiv koeffisient) -> run-time tilpasning. Dype CNN uten pooling.
- [KILDE] **Global reward prediction**: en 2-lags GRU predikerer *sluttresultatet av hele partiet* (8–12 runder) fra rundenes poeng/tilstand; rundebelønningen settes til Phi(x_k) - Phi(x_{k-1}), altså endring i predikert sluttresultat. Motivasjon: toppspillere taper runder bevisst for å sikre plassering.
- [KILDE] **Oracle guiding**: start RL med agent som ser motstandernes brikker og muren; perfekte trekk droppes gradvis ut (Bernoulli-maske, sannsynlighet fra 1 til 0), deretter videre trening med lr/10 og avvisning av prøver med for store importance-vekter.
- [KILDE] **pMCPA** (run-time policy adaptation): per utdelt hånd simuleres 100K baner og nettet finjusteres mot dem; vinner 66 % mot ikke-tilpasset versjon (få hundre runder — stor usikkerhet, og for dyrt for 86 ms).
- [KILDE] Compute: 44 GPU (4 Titan XP + 40 K80), 1,5 M partier per agent, 2 dager.
- [KILDE] Ablasjon (Fig. 8, 1 M partier, hver agent mot 3 SL-weak): "RL-basic leads to good improvement over SL, RL-1 [global reward] outperforms RL-basic, and RL-2 [oracle guiding] brings additional gains". Eksakte dan-tall per variant står bare i figuren (jeg har ikke lest dem av; tall jeg først fikk oppgitt av et oppsummeringsverktøy er strøket som uverifiserte). Endelig Suphx: 8,74 stable dan på Tenhou.
- [TOLKNING] Merk rekkefølgen: RL over SL er det første og (ut fra figuren, min lesing) største hoppet; global reward og oracle guiding ga mindre, men positive steg. For oss: målt uenighet runde vs. løp er bare 1,5 % av stillingene, så global reward er trolig et lite grep; men den koster lite hvis vi uansett går over til RL (en liten verdifunksjon V(stilling i løpet) som gjør rundepoeng om til endring i vinnsjanse).

### Skat: Rebstock, Solinas, Buro et al. (2019) — nett fra menneskedata vs. PIMC-boten Kermit
- Learning Policies from Human Data for Skat — https://arxiv.org/abs/1905.10907
- Improving Search with Supervised Learning in Trick-Based Card Games (AAAI 2019) — https://arxiv.org/abs/1903.09604
- Policy Based Inference in Trick-Taking Card Games — https://www.semanticscholar.org/paper/c8e58b8a019dbebad13d108ba49b77ac349cfe69
- [KILDE] Data: 23,2 M eksempler for budfasen, **146–289 M** for kortspill (fra skat-server, millioner av menneskepartier). Nett: 5 fullkoblede lag, ~2,3–2,4 M vekter, dropout 0,6. Imitasjonstreff 72–87 % for kortspill.
- [KILDE] Budnett alene (med verdibasert valg, "MLV") **slår** Kermit sitt bud: +1,17 turneringspoeng/spill. Men **imitasjons-kortspill er 2,79 TP/spill svakere enn søkebasert kortspill**. Nett: ~2,5 ms/beslutning vs. Kermit ~650 ms.
- [KILDE] RL oppå SL nevnes bare som fremtidig arbeid.
- [KILDE] Solinas et al.: et nett som predikerer *hvor hvert enkelt kort ligger* (trenet på menneskedata) brukes til å vekte/trekke verdener i PIMC -> "substantial increase in cardplay strength". Dette er vårt trohode.
- [TOLKNING] Dette er nesten nøyaktig vår situasjon: nett ≈ menneske, søk mye sterkere, søk ~600 ms. Selv med ~1000x så mye menneskedata som oss nådde SL-kortspill ikke søkets nivå. **Konklusjon: mer/bedre menneskedata løser ikke problem 1; man må lære fra noe sterkere enn mennesket (søket selv, eller RL-utfall).**

### Skat: Outer-Learning Framework (Edelkamp, des. 2025) — https://arxiv.org/abs/2512.15435
- [KILDE] Ikke nevrale nett: tabeller med vinnsannsynlighet indeksert på håndtrekk, startet fra 200+ M menneskepartier, deretter selvspill (30 M partier, >1 måned på 16 kjerner) flettes inn og tabellene kompileres på nytt. PIMC + paranoia-søk 1–3 s/trekk.
- [KILDE] Gevinsten av løkka er liten: treff mot åpen-korts-løser 84,5 % -> 84,73 % (20 M) -> 84,78 % (30 M). Å gjeninnsette resultatet enda en gang *senket* treffet til 84,70 %. Uten menneskelig basetabell: 83,76 %.
- [TOLKNING] Et datapunkt for at en «selvspill -> statistikk -> ny bot»-løkke som lærer fra sine egne *søkeresultater/utfall* uten et sterkere mål metter fort. Samme mønster som vår stagnasjon.

### Expert Iteration (Anthony, Tian, Barber 2017, Hex) — https://arxiv.org/abs/1705.08439
- [KILDE] Løkke: lærlingnett imiterer eksperten (MCTS); eksperten bruker lærlingen som prior (UCT + w·pi(a|s)/(n+1)); gjenta. N-MCTS med policy-nett vant 97 % mot MCTS uten, tross 2x tregere søk.
- [KILDE] **Måltype**: Chosen-Action Target (kun valgt trekk) vs Tree-Policy Target (hele besøksfordelingen n(s,a)/n(s)). Nesten lik top-1-feil (47,0 vs 47,7 %), men **TPT-nettet var 50 ± 13 Elo sterkere**, fordi målet er kostnadssensitivt: når søket er usikkert mellom to trekk, straffes feil valg mindre.
- [KILDE] Data: 243 000 trekk per iterasjon (batch) / 24 300 (online); online-varianten **aggregerer alle tidligere datasett** (DAgger-stil) i stedet for å kaste dem. 10 000 MCTS-iterasjoner per trekk.
- [KILDE] **Det endelige nettet alene var like sterkt som MCTS-en det imiterte (87/162 partier).** ExIt slo MoHex 1.0: 75,3 % (like mange iterasjoner), 59,3 % mot 10x så mange.
- [TOLKNING] Direkte svar på «nett = menneske, søk = +0,7»: ExIt-teorien sier at et nett kan nå søkets nivå *hvis* målene er gode og løkka lukkes (neste søk bruker det nye nettet som policy i utspillingene, så søket blir sterkere, så målene blir bedre). Hos oss er løkka formelt lukket, men målet er CAT fra ett støyete 24-verdenssøk — nøyaktig den svakere varianten. Merk også at Hex er perfekt informasjon; i PIMC har «ekspert»-søket kjente systematiske feil (strategy fusion), så lærlingen arver et tak (se AlphaZe** nedenfor).

### Destillasjon av støyete søk: myke mål
- **Gumbel AlphaZero/MuZero** (Danihelka, Guez, Schrittwieser, Silver, ICLR 2022) — https://iclr.cc/virtual/2022/spotlight/6419, slides https://iclr.cc/media/iclr-2022/Slides/6418.pdf, avhandling https://discovery.ucl.ac.uk/id/eprint/10167022/
  - [KILDE] AlphaZero kan unnlate å forbedre policyen når ikke alle rot-handlinger besøkes; Gumbel-variantene "significantly improve prior performance when planning with few simulations". Policy-målet er ikke besøkstall, men en forbedret policy bygget fra nettets logits + en monoton transformasjon av (fullførte) Q-verdier, med bevist policy-forbedring.
  - [KILDE, fra min hukommelse av artikkelen — ikke verifisert i denne økten] målet er softmax(logits + sigma(completedQ)), sigma(q) = (c_visit + max_b N(b))·c_scale·q, med c_visit=50, c_scale=1 som standard; med 2 simuleringer lærte Gumbel MuZero fortsatt 9x9 Go der vanlig AlphaZero feilet.
  - [TOLKNING] **Dette er den mest direkte kuren for problem 3.** Vårt PIMC gir per kandidatkort en gjennomsnittlig verdi over verdener (Q-estimat) — ikke bare et valg. Å bruke softmax(logits + skala·Q̂) (eller softmax(Q̂/T)) som mål gjør at kort med nesten lik verdi får nesten lik sannsynlighet, og vippingen i 43 % av beslutningene slutter å være «støy i etiketten» og blir «riktig usikkerhet i målet». Kostnad: ingen ekstra søk, bare lagre Q-vektoren i stedet for argmax.
- **KataGo** (Wu 2019) — https://arxiv.org/abs/1902.10565
  - [KILDE] *Playout cap randomization*: 25 % av trekkene får full søk (600–1000 noder) og **bare disse lagres som policy-mål**; 75 % får raskt søk (100–200) for å produsere flere partier/utfall til verdimålet. *Policy target pruning*: fjerner utforsknings-besøk fra målet så nettet ikke lærer støy. Hjelpemål (eierskap, poengfordeling, motstanderens neste trekk) gir finere kredittfordeling. Samlet ~50x mindre compute enn ELF OpenGo; enkeltteknikker 1,25–1,65x, kombinert ~9,1x i ablasjon.
  - [TOLKNING] Overført: bruk *få* beslutninger med *dyrt* søk (f.eks. 96–192 verdener, eller samme 24 verdener gjentatt med ulike trekk og snittet) som policy-mål, og resten av selvspillet raskt (nett-only eller lite søk). Da får vi både mindre støyete policy-mål og flere utfall til et verdimål. Hjelpemål (stikkfordeling, hvem makker er, poengfordeling per runde) er billige å legge til.

### AlphaZe** (Blüml, Czech, Kersting 2023) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10213697/
- [KILDE] AlphaZero-trening der MCTS byttes med PIMC: trekk verdener, kjør MCTS i hver, og **snitt policyene** over verdener (PC-PIMC, pi = Σ pi_w / n) som policy-mål; verdimål = faktisk sluttresultat z. Få determiniseringer per trekk (3 i Stratego, 12 i DarkHex). 3x V100; Stratego 32 M prøver / 16 dager.
- [KILDE] Strategy fusion og "strategy hopping" (omtrekking av verdener gir inkonsistent oppførsel mellom trekk) nevnes som uløst. Ingen ablasjon nett-alene vs. søk.
- [TOLKNING] "Strategy hopping" er deres navn på vårt problem 3. Deres mål er *fordelinger* snittet over verdener, ikke argmax — samme retning som Gumbel/TPT.

### ReBeL, Student of Games, DeepStack, Pluribus (søk + læring, spillteoretisk)
- ReBeL (Brown et al. 2020) — https://arxiv.org/abs/2007.13544 ; Student of Games (Schmid et al. 2023) — https://www.science.org/doi/10.1126/sciadv.adg3256 / https://arxiv.org/abs/2112.03178 ; DeepStack (Moravčík et al. 2017) — https://arxiv.org/abs/1701.01724 ; Pluribus (Brown & Sandholm 2019) — https://www.science.org/doi/10.1126/science.aay2400
- [KILDE] ReBeL/SoG lærer en verdifunksjon over *offentlige trostilstander* (fordeling over alle mulige private tilstander) og løser delspill med CFR under spill. ReBeL skriver selv at inndata "grows linearly with the number of infostates in a public state", uhåndterlig når det er lite felles kunnskap. SoG spiller poker og Scotland Yard; policy-nettet er en varmstart for søket, styrken ligger i søket.
- [KILDE, fra hukommelse] Pluribus: blueprint via MCCFR (~8 dager på én 64-kjerners server, ingen GPU), sanntids dybdebegrenset søk i spill; 6-spiller poker.
- [TOLKNING] **Passer dårlig for oss.** Alle disse har søk som *kjernen* ved spill — det motsatte av det 86 ms-budsjettet krever. Et Amerikaner-deal har C(39,13)·C(26,13) ≈ 8·10^16 mulige fordelinger av de skjulte kortene fra én spillers side; PBS-representasjon er urealistisk. Nash-garantier gjelder to-spiller nullsum, ikke 4 spillere med skiftende lag. Det nyttige er idéen om å trene verdi på *søkeutdata* med kjent feilgrense — men det dekkes enklere av ExIt/Gumbel.

### Hanabi: SPARTA, Learned Belief Search, human-regularisert RL
- SPARTA — https://arxiv.org/abs/1912.02318 ; LBS — https://arxiv.org/abs/2106.09086 ; piKL-Hanabi — https://arxiv.org/abs/2210.05125
- [KILDE] SPARTA: enkel-agent-søk oppå en blueprint-policy ga 24,08 -> 24,61/25. LBS: lærer en autoregressiv tromodell (supervised) og trekker verdener fra den i stedet for eksakt tro; 55–91 % av gevinsten ved 4,6–35,8x mindre compute.
- [KILDE] piKL-varianten: RL-policy regulariseres mot en behavior-cloning-policy fra menneskedata (KL-straff), og søk ved spill regulariseres likt; bedre i lag med ukjente mennesker enn ren best-response.
- [TOLKNING] LBS er i praksis det vi gjør (trohode -> verdener). piKL er relevant for problem 5/6: tynne menneskedata brukes best som *regularisering/anker* (og for makker-kompatibilitet), ikke som hovedmål.

### DouZero+ (Zhao et al. 2022) og DouRN (2024)
- DouZero+ — https://arxiv.org/abs/2204.02558 ; DouRN — https://arxiv.org/html/2403.14102
- [KILDE] DouZero+: et eget nett predikerer neste spillers hånd (kortantall per rang, cross-entropy), og **prediksjonen konkateneres inn i Q-nettets inndata**. "Coach"-nett predikerer landlords vinnsjanse fra startkortene og hopper over svært skjeve given, så treningen brukes på jevne partier. Bedre enn DouZero og topp på Botzone (tall bare i figurer).
- [KILDE] DouRN: residualblokker oppå DouZeros MLP; 4 blokker ≈ 6 blokker i styrke (~57 % mot DouZero), 272–462 GPU-timer. Avtakende utbytte av dybde.
- [TOLKNING] Trohode-utdata som inndata til kortnettet (hvis vi ikke allerede gjør det) er et DouZero+-grep med belegg. Coach-filtrering: i Amerikaner er budvinnerens given ofte avgjort; å vekte ned utfallstrivielle given kan redusere varians i RL-mål.

### DanZero / DanZero+ (GuanDan, 4 spillere i to lag, løp opp gjennom nivåer) — https://arxiv.org/abs/2210.17087 , https://arxiv.org/abs/2312.02561
- [KILDE] DanZero: DMC + distribuert selvspill, hvert parti gir 4 baner. DanZero+: policy-basert RL (PPO) varmstartet fra den forhåndstrente DMC-modellen for å takle stort handlingsrom; bedre enn DanZero og heuristiske boter. (Tall for compute/prøver fikk jeg ikke hentet ut i denne økten.)
- [TOLKNING] Nærmeste slektning av Amerikaner i litteraturen: 4 spillere, samarbeid + konkurranse, lang flerrunders progresjon. At DMC fungerte der uten søk er det beste belegget for at DMC-veien er gangbar for oss.

### Selvspill-motstandere: nyeste vs. eldre
- [KILDE] DouZero, PerfectDou (maks 1 versjon etterslep) og Suphx trener alle mot **nyeste** nett. OpenAI Five (https://arxiv.org/abs/1912.06680): "play the latest policy against itself for 80% of games, and play against older policies for 20% of games", for robusthet/mot strategikollaps.
- [TOLKNING] Ren trening mot eldre boter (vår løkke) gir et fast mål: når nettet har lært best-response mot blandingen, er det ingenting nytt å lære — konsistent med bit-identisk kortnett. 80/20 nyeste/eldre er en billig standard.

### Bridge (Ben, NooK) — https://github.com/lorserker/ben , https://www.imperial.ac.uk/news/235238/ai-based-imperial-research-beats-world/
- [KILDE] Ben: nett brukes til budgivning, trekking av skjulte hender, forslag og tie-breaks, men "the card to play is mostly decided by double dummy analysis" — dvs. PIMC-dominert, som oss. NooK (NukkAI) slo 8 verdensmestere i en forenklet deklarant-oppgave (67/80 sett) med symbolsk AI (PILP) + små nett for motstandermodellering.
- [TOLKNING] Bridge-feltet har ikke vist at et rent nett slår søk i kortspill; der er søk fortsatt kjernen. Belegget for «nett alene sterkt» kommer fra klatrespill (Dou Dizhu, GuanDan) og mahjong, ikke fra klassiske stikkspill. Det er en reell usikkerhet for oss: stikkspill har mer «beregnbar» sluttspillstruktur der søk er uvanlig sterkt.


---

## Per målt problem

### 1. Nett = menneske, søk = +0,72 pp. Hvordan få et sterkt nett alene?
- [KILDE] To veier har gitt et nett som alene er på eller over søkenivå:
  - **Expert Iteration**: nettet nådde MCTS-nivået det imiterte (87/162 partier). Det krevde fordelingsmål (TPT) og data samlet over alle iterasjoner.
  - **DMC/RL på utfall**: DouZero slo søkeboten DeltaDou etter ~10 dager på 4 GPU-er. PerfectDou gjorde det med 4x færre prøver, takket være en critic som ser alle kort. DanZero viser det samme i et lagspill for 4 spillere.
- [KILDE] Moteksempel fra Skat: et kortnett som imiterer mennesker nådde ikke PIMC-nivå (−2,79 TP/spill), selv med 146–289 M eksempler. Mer menneskedata løser altså ikke problemet.
- [TOLKNING] Vi står i Skat-situasjonen og må over i ExIt- eller DMC-situasjonen.
  - ExIt ligger nærmest det vi har, men nettet arver PIMC-søkets skjevheter (strategy fusion).
  - RL på utfall er den eneste veien som *kan* gå forbi søket. Den koster mer og er ikke vist for klassiske stikkspill.

### 2. Søket er for tregt (580 ms mot 86 ms)
- [KILDE] Alle systemene uten søk bruker 2–6 ms per beslutning på CPU: DouZero ~2 ms, PerfectDou ~6 ms, Skat-nettet 2,5 ms. Nettene deres er 1–2 størrelsesordener større enn våre (6x512 MLP + LSTM, eller 5 lag med ~2,3 M vekter).
- [TOLKNING] Kortnettet kan bli 10–30x større innenfor 86 ms, også i Node/JS.
  - Kapasitet er trolig ikke flaskehalsen i dag, siden nettet står stille. Den blir det når målene blir bedre.
  - Et mulig mellomsteg er et lite restsøk i appen (4–8 verdener med nettet som utspillingspolicy). Det har jeg ikke kilde på.

### 3. Søket er støyete (43 % vipping), og etiketten kommer fra ETT søk med 24 verdener
- [KILDE] Fire funn peker samme vei:
  - **ExIt**: å trene på valgt trekk (CAT) er dårligere enn å trene på søkets fordeling (TPT). Forskjellen var +50 ± 13 Elo, med lik top-1-feil.
  - **Gumbel AZ/MuZero**: laget for få simuleringer. Policy-målet bygges fra nettets logits og Q-verdiene.
  - **AlphaZe\*\***: snitter policyene over alle verdenene.
  - **KataGo**: dyrt søk på bare 25 % av trekkene, og bare disse blir policy-mål. Utforskningsstøy fjernes fra målet.
- [TOLKNING] Når valget vipper i 43 % av beslutningene, er kortene trolig nesten like gode i de fleste av dem. Et argmax-mål lærer da nettet en tilfeldig preferanse, og porten ser ingen forbedring. Forslaget har tre deler:
  - Lagre hele Q-vektoren: snittverdien per lovlig kort over verdenene.
  - Tren mot softmax(Q/T) eller softmax(logits + c·Q).
  - Bruk flere verdener (96+) på en delmengde av beslutningene.

  Dette er det billigste grepet, og det har best belegg.

### 4. Løpet til 100 mot rundepoeng (1,5 % uenighet)
- [KILDE] Suphx fikk en positiv, men mindre gevinst av å bruke endringen i predikert sluttresultat, Phi(k) − Phi(k−1), som rundebelønning. Der er målet en plassering over 8–12 runder, og toppspillere ofrer runder bevisst.
- [KILDE] DouZero viser at måltypen endrer spillestilen merkbart: vinn/tap gir en annen stil enn poeng.
- [TOLKNING] Med 1,5 % uenighet er gevinsten liten, så grepet bør vente til det finnes en RL-løkke. Da er det billig:
  - Tren en liten V(stilling i løpet, poeng for alle fire) på utfallet av hele løpet.
  - Bruk ΔV som rundebelønning.

  Forskjellen er trolig størst i budet (hvor høyt man byr ved 90+ poeng), ikke i kortspillet.

### 5. Tynne menneskedata (~273 kamper, 87 % fra én spiller)
- [KILDE] Suphx og Skat brukte millioner til hundrevis av millioner menneskeeksempler. DouZero slo en SL-baseline trent på 226 000 partier etter 2 dager, uten menneskedata.
- [KILDE] piKL bruker menneskedata som KL-anker for RL, ikke som mål.
- [KILDE] I Skat ga selvspill oppå 200 M menneskepartier bare +0,23–0,27 pp.
- [TOLKNING] 273 kamper er et altfor tynt treningssignal til å gi styrke, og det stemmer med at vanemodellering målte null.
  - Bruk menneskedataene til evaluering, som sanity check, og eventuelt til piKL-regularisering (kompatibilitet med menneskelig makker).
  - Styrken må komme fra selvspill.

### 6. Selvspill mot eldre boter, og en port som dømmer på duplikat mot menneskekamper
- [KILDE] De sterke systemene uten søk trener mot nyeste versjon av seg selv. OpenAI Five spiller 80 % mot nyeste og 20 % mot eldre. Suphx evaluerte på 1 M partier, og OpenAI Five brukte automatiske turneringer mellom versjoner.
- [TOLKNING] To forklaringer på at kortnettet står stille:
  - **Fast mål**: nettet er allerede godt tilpasset motstanderblandingen og sine egne støyete etiketter, så det er lite nytt å lære.
  - **Svak port**: ~273 menneskekamper i duplikat har trolig en standardfeil på rundt ±0,2 pp. Da kan porten ikke skille forbedringer under ~0,4 pp. Reelle små steg avvises, og nettet forblir bit-identisk. Dette er min hypotese og må sjekkes mot portens faktiske varians.

  Forslag: gjør nett-mot-nett-duplikat over titusener av given til hovedport (billig uten søk), og behold menneskeduplikatet som sekundær kontroll.

---

## Rangerte grep

**1. Myke søkemål i stedet for argmax, og flere verdener på en delmengde av beslutningene**
- *Hva:* gjør Q-vektoren om til softmax-mål i stedet for å trene på valgt kort.
- *Forventet effekt:* fjerner hovedkilden til støy i kortnettets mål. ExIt målte +50 Elo for fordelingsmål mot valgt trekk (Hex). Jeg forventer at kortnettet begynner å bevege seg igjen og tar igjen en del av de 0,72 pp, men ikke alt, fordi PIMC setter et tak.
- *Kostnad:* lavt ingeniørarbeid (lagre verdien per kort og bytte tapsfunksjon). Moderat compute hvis 25 % av beslutningene får 4x så mange verdener og resten av selvspillet kjører raskere.
- *Kilder:* ExIt, Gumbel AZ, KataGo, AlphaZe\*\*.
- *Usikkerhet:* mekanismen er godt belagt, men i spill med perfekt informasjon. Gevinsten i Amerikaner er ikke målt.

**2. Lukk ExIt-løkka ordentlig**
- *Hva:* samle data over alle iterasjoner, tren mot nyeste nett (80/20 med eldre), og gi porten nok statistisk styrke.
- *Forventet effekt:* løkka slutter å stagnere av prosessgrunner. I beste fall når nettet søkets nivå, slik ExIt-nettet gjorde (87/162).
- *Kostnad:* lavt til middels ingeniørarbeid. En større nett-mot-nett-port er billig i compute uten søk.
- *Kilder:* ExIt (datasett samlet over iterasjoner, DAgger-stil), OpenAI Five (80/20), DouZero og PerfectDou (trener mot nyeste). Kritikken av porten er min tolkning.

**3. RL-finjustering på utfall, med start i dagens nett**
- *Hva:* DMC eller PPO, med en critic som ser alle kort, og søkets policy som KL-anker i starten.
- *Forventet effekt:* dette er den eneste veien i litteraturen som har gått forbi et søk uten selv å søke ved spill (DouZero mot DeltaDou). Det kan gi mer enn +0,7 pp, men det er usikkert for stikkspill, der jeg ikke fant noen publisert parallell.
- *Kostnad:* høyt ingeniørarbeid (rask batchet spillmotor, oppsett med aktører og lærer). Referansesystemene brukte 10^9–10^10 prøver, men med mye større handlingsrom og lengre partier. På én RTX 5080 blir det dager til uker, og motorens hastighet avgjør.
- *Kilder:* DouZero; PerfectDou (critic med full info, 4x bedre prøveeffektivitet); DanZero+ (PPO som starter fra den forhåndstrente DMC-modellen); piKL (KL-anker).

**4. Større kortnett, med trohodets prediksjon som inndata**
- *Forventet effekt:* mest nyttig etter grep 1–3, når målene er gode nok til at kapasitet blir flaskehalsen. Trohodets utdata som inndata er belagt i DouZero+.
- *Kostnad:* lav. Latensen tåler det: 6x512-nettene i kildene bruker 2–6 ms.
- *Kilder:* DouZero, DouZero+, DouRN (avtakende utbytte etter ~4 residualblokker).

**5. Belønning for hele løpet (Suphx-stil ΔV), men først når RL er på plass**
- *Forventet effekt:* liten for kortspillet (1,5 % uenighet), muligens større for budet ved høy stilling.
- *Kostnad:* lav når RL-løkka finnes; meningsløs uten den.
- *Kilde:* Suphx.

**Frarådes nå:**
- **ReBeL, SoG og Pluribus**: søket er kjernen, og de er laget for tospill nullsum.
- **Oracle-dropout à la Suphx**: liten gevinst, og PIMC er allerede et snitt over orakelstillinger.
- **pMCPA**: for dyrt innenfor 86 ms.
- **Mer vane- og profilmodellering på menneskedata**: har målt null fem ganger.

## Åpne punkter jeg ikke fikk verifisert i denne økten
- Eksakte dan-tall i Suphx-ablasjonen. De står bare i figur 8.
- Konstantene i Gumbel-formelen og resultatet med 2 simuleringer. De er gjengitt fra hukommelsen og må sjekkes i https://discovery.ucl.ac.uk/id/eprint/10167022/.
- Tall for compute og prøver i DanZero/DanZero+. De krever PDF-en.
- Ablasjonstabellen i PerfectDou. Den er uklar i HTML-utgaven.
- Pluribus-tallene. De er fra hukommelsen.
