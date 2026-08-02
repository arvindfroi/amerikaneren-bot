/**
 * KONVENSJONSVAKTEN – to deterministiske regler lagt utenpå en vilkårlig agent.
 *
 * HVORFOR EN VAKT OG IKKE MER TRENING. Atferdsprofilen mot MesterAI
 * (`analyse/mesterai-atferd2.txt`, 320 kontrakter) fant to hull i
 * SPILLEFØRERSETET som begge er REGELFORMEDE – de handler om konvensjoner en
 * per-beslutning-evaluering ikke kan se, fordi gevinsten ligger utenfor det
 * ett kortvalg måler:
 *
 *   A) ÅPNINGSUTSPILLET. sd-r1 spiller ut sin høyeste trumf i 44 % av
 *      kontraktene. Det etterlyste kortet tar da stikket i bare 47 % av
 *      rundene, mot NevroHjernes 99 % og MesterAIs 93 % (|z| = 14,9).
 *      Regelen MesterAI følger er ikke «spill lavest» – den gjør det bare
 *      23 % – men «IKKE SLÅ DITT EGET ETTERLYSTE KORT».
 *
 *   B) GARANTERTE STIKK. Der stikket alt er sikret for laget brenner sd-r1
 *      trumf i 34 % av tilfellene mot MesterAIs 2 %: 0,39 unødvendige trumf
 *      per runde mot 0,03. Der stikket IKKE er garantert ligger alle likt
 *      (82/86/87 %), så det er bare de garanterte som lekker.
 *
 * FORBEHOLDET SOM HOLDER TALLET ÆRLIG. Å ta et garantert stikk gir deg
 * UTSPILLET, og det har verdi for spilleføreren. MesterAI legger selv «ikke
 * billigste kort» i 41 % av de garanterte – den kjøper utspillet med et
 * SIDEKORT. Skillet 41 % mot 66 % er altså diskutabelt; skillet 2 % mot 34 %
 * er det ikke. Derfor er vakt 2 delt i to flagg som kan måles hver for seg:
 * «aldri trumf» (`t`) og den strengere «alltid billigst» (`b`).
 *
 * INFORMASJONSDISIPLIN. Vakten er en SPILLER, ikke en måling. Den ser bare det
 * setet selv kan se: egen hånd, bordet, historikken, eget vrak og avslørte
 * renonser (`garantertSynlig`/`lagetSynlig` i `synlig.ts`). Den rører aldri
 * `garantertFasit` eller `state.makker` før makkeren er avslørt.
 *
 * MINIMALT INNGREP. Vakten overstyrer BARE når den indre agentens kort bryter
 * regelen. Gjør agenten allerede det riktige, står valget hennes urørt – alt
 * annet enn de to reglene er fortsatt agentens eget spill.
 *
 * SPESIFIKASJON: «vakt:<flagg>:<indre kandidat>», f.eks.
 *   vakt:a:e1:e1-modell/sd-r2.bin     bare åpningsvakten (billigste under)
 *   vakt:h:e1:e1-modell/sd-r2.bin     åpningsvakten, men HØYESTE under
 *   vakt:l:e1:e1-modell/sd-r2.bin     laveste trumf ut NAAR etterlysningen er garantert
 *   vakt:t:e1:e1-modell/sd-r2.bin     bare «garantert: aldri trumf»
 *   vakt:b:e1:e1-modell/sd-r2.bin     bare «garantert: alltid billigst»
 *   vakt:at:e1:e1-modell/sd-r2.bin    begge (billigst-varianten av vakt 2 er b)
 */

import { likeKort, type Farge, type Kort } from "../kort.ts";
import { lovligeKort, stikkvinner, type GameState, type Handling } from "../motor.ts";
import { billigste, dyreste, garantertSynlig, lagetSynlig, ukjenteKort } from "./synlig.ts";
import { minstBrukFor } from "./nytte.ts";

/** Hvilke av reglene som er slått på. */
export interface Vaktvalg {
  /** Vakt 1: slå aldri ditt eget etterlyste kort. */
  readonly åpning: boolean;
  /**
   * Vakt 1, variant: velg det HØYESTE utspillet som lar det etterlyste stå, i
   * stedet for det billigste. Atferdskontrollen viste at billigst-varianten
   * åpner med valør 3,85 mot MesterAIs 7,16 – konvensjonen krever bare at man
   * legger UNDER kortet, ikke at man legger lavest. Måles for seg.
   */
  readonly åpningHøyest?: boolean;
  /**
   * Vakt 3: som budvinner i stikk 1, spill laveste trumf – MEN BARE når det
   * etterlyste kortet er garantert.
   *
   * BETINGELSEN ER HELE REGELEN. Arvind formulerte konvensjonen presist: man
   * spiller ut laveste trumf når man har etterlyst den høyeste trumfen man
   * ikke selv har, altså når stikket er sikret. Sitter en forsvarer med en
   * trumf over etterlysningen, kan kortet slås, og da er utspillet et ekte
   * valg – det kan lønne seg å presse den høye trumfen ut.
   *
   * Er stikket derimot garantert, gir ENHVER trumf under etterlysningen
   * nøyaktig samme utfall: makkeren tar stikket med det etterlyste kortet.
   * Da er alt over den laveste ren sløsing – et kort brent uten å kjøpe noe.
   * Det er samme form som vakt 1: den forbyr en tabbe der utfallet er kjent,
   * i stedet for å gjette i en stilling der det ikke er det.
   *
   * FØRSTE FORSØK VAR UBETINGET, og målte null: −0,009 stikk på 1092
   * kontrakter og +0,00 ± 0,02 poeng på grådigbenken. Den versjonen fyrte
   * også i stillingene der etterlysningen kunne slås, altså der utspillet
   * betyr noe. Det er en annen regel enn denne, og den er forkastet.
   *
   * Menneskedataene (analyse/menneskedata-2026-08-01.md) sier at menneskene
   * spiller laveste trumf i 99,3 % av kontraktene og etterlyser høyeste
   * lovlige i 304 av 304 – de to henger sammen: å kalle høyest er nettopp det
   * som gjør stikket garantert så ofte som mulig.
   */
  readonly åpningLavest?: boolean;
  /**
   * Vakt 4: kan ingen av kortene dine TA stikket, legg det billigste.
   *
   * Kriteriet er «ingen av mine lovlige kort vinner stikket slik bordet står»,
   * og det dekker to stillinger som ser ulike ut men er samme sak:
   *
   *   MOTSTANDEREN leder og jeg nås ikke opp. Kortet er tapt uansett.
   *   MEDSPILLEREN leder og jeg kan ikke ta det fra ham. Da avgjøres stikket
   *   mellom ham og motstanderne bak meg, og mitt kort er uten innflytelse.
   *
   * I begge tilfeller er valget mitt likegyldig for hvem som vinner, så alt
   * over det billigste er dødvekt. Kan jeg derimot ta stikket, er valget ekte,
   * og regelen holder seg unna.
   *
   * FORBEHOLD, og grunnen til at dette er en hypotese og ikke et bevis: å
   * kaste seg tom i en farge for å kunne trumfe senere har verdi, og
   * `billigste` velger ikke kortet som best tømmer en farge. Regelen er derfor
   * bare gratis innenfor ETT stikk. Empirisk gjør `garantiBilligst` det samme
   * på garanterte stikk og måler positivt (+0,059), så utvidelsen er verdt å
   * prøve – men den skal måles, ikke antas.
   *
   * Signalering finnes ikke i denne motoren – ingen medspiller leser valøren
   * på et tapt kort – så der er det ingen skjult verdi å ødelegge.
   */
  readonly kastBilligst?: boolean;
  /**
   * Vakt 4, variant: samme betingelse som `k`, men kast kortet vi har MINST
   * BRUK FOR i stedet for det med lavest valør.
   *
   * ARVINDS INNVENDING MOT `k`, ordrett: «dette burde gi utslag hvis den vet
   * hva "billigste" betyr i denne sammenhengen. Det bør enten være å legge på
   * det laveste man har i serien / forsøke å bli kvitt en annen serie (hvis
   * man har trumf) / spare på kort med høy valør eller serier som tvinger frem
   * trumfen til motstandere. billig her betyr egentlig "jeg kan ikke ta
   * stikket så hvilket lovlige kort har jeg minst bruk for"»
   *
   * Han har rett i at `billigste` ikke gjør noe av dette – den er en ren
   * valørregel og ser ikke hånden. Se `nytte.ts` for de fire kravene og
   * vektene.
   *
   * DETTE SKILLER «NÅR» FRA «HVA», nøyaktig som `e` gjorde for `d`. `k` med
   * `billigste` måler −0,048 ± 0,031 over 11 200 giv. Måler `n` positivt, var
   * det kortvalget som var feil. Måler den også negativt, er det betingelsen,
   * og da er hele vakt 4 død.
   */
  readonly kastNytte?: boolean;
  /**
   * Vakt 5: som budvinner, IKKE spill trumf ut når mange trumf står ute.
   *
   * FUNNET, og hvordan det ble funnet. `examples/tap-per-stikk.ts` måler anger
   * mot taket per beslutning; `examples/regelgraving.ts` leter i den etter
   * kjennetegn. Spilleførerens dyreste vane er å trumfe: i 254 av 511
   * trumfvalg var det beste kortet IKKE trumf, og de bar 57 % av hele tapet.
   * Motsatt vei fantes ingen feil – undertrumfing målte −0,02.
   *
   * ATFERDSPROFILEN SIER UAVHENGIG DET SAMME: vi spiller trumf ut i 58 % av
   * utspillene, MesterAI i 51 %.
   *
   * MIN FØRSTE HYPOTESE VAR FEIL. Jeg trodde skillet var mestertrumfen – at
   * man drar trumf når man selv har den høyeste. Dataene sier nei: «trumf ut
   * MED høyeste» måler +0,29, og den DYRESTE cellen er nettopp «≥3 ute OG vi
   * har høyeste» (+0,56). Skillet går på HVOR MANGE trumf som står ute, ikke
   * på hvem som har den øverste.
   *
   * KONTROLLERT FOR FORVEKSLING. «≥3 ute» opptrer tidlig, og tidlige stikk har
   * høyere anger uansett; mange lovlige kort gir også høyere anger. Begge er
   * egenskaper ved stillingen, ikke ved valget. `examples/trumfutspill.ts`
   * sammenligner derfor bare innenfor samme stikknummer OG samme antall
   * lovlige kort. Signalet svekkes og står:
   *
   *   gruppe                    rå          stratifisert
   *   alle trumfutspill      +0,239        +0,172 ± 0,059
   *   ≥3 trumf ute           +0,657        +0,451 ± 0,130
   *   ≤2 trumf ute           +0,122        +0,094 ± 0,058
   *
   * DENNE REGELEN HAR EN ANNEN FORM ENN «a», og det er en risiko som skal stå
   * her. «a» forbyr en tabbe med kjent utfall – å slå sitt eget etterlyste
   * kort kan aldri lønne seg. Å dra trumf KAN være riktig; dette er et
   * forskjøvet skjønn, ikke et forbud. Prosjektets egen erfaring er at bare
   * forbudsformen har målt positivt («k» døde, «a» levde). Regelen kan derfor
   * godt måle null, og den er ikke adoptert før en parret måling på et FRISKT
   * frøbånd sier noe annet.
   *
   * MÅLES PÅ POENG, IKKE PÅ ANGER. Angeren er målt mot et dobbelt-dummy-tak,
   * og å FØLGE dobbelt dummy er allerede målt skadelig (−0,609 gjennom
   * godkjenningsporten). At en regel senker DD-anger er derfor ikke i seg selv
   * et argument for den.
   *
   * ======================= FORKASTET. MÅLT, IKKE ANTATT. ===================
   *
   * Parret mot `vakt:ab` på 2 000 givere, tvungen kontrakt 9, alle tre andre
   * seter spilt av kontrollen:
   *
   *   kandidat     lagstikk   lagstikk − SD   mot kontrollen
   *   vakt:ab        9,840        +0,311            –
   *   vakt:abd       9,669        +0,140      −0,171 ± 0,028
   *   vakt:abD       9,734        +0,204      −0,106 ± 0,022
   *   vakt:abe       9,629        +0,099      −0,211 ± 0,029
   *
   * BEGGE erstatningene taper, og `d` og `e` spiller motsatt kort. Da er det
   * ikke valget av kort som er feil – det er BETINGELSEN. Regelen er død.
   *
   * HVORFOR SIGNALET LØY, og dette er lærdommen som er verdt mer enn regelen:
   * angeren ble målt mot DOBBELT DUMMY. Kjørt på nytt mot SD-fasiten – den
   * som faktisk bestod porten, +0,718 – snur fortegnet fullstendig:
   *
   *   situasjon                         DD-anger        SD-anger
   *   vi spilte trumf                  +0,217          −0,222 ± 0,103
   *   vi trumfet, beste ikke trumf     +0,723          +1,199
   *   vi trumfet ikke, beste trumf     −0,019          +0,939
   *
   * Under SD er det INGEN overtrumfing: å spille trumf måler bedre enn
   * snittet, og de to feilretningene er like store. «Spilleføreren trumfer
   * for mye» var et artefakt av å måle avstand til en policy vi allerede
   * hadde målt som dårligere enn vår egen.
   *
   * Flaggene beholdes som `k` beholdes: et forkastet forsøk med tallet sitt
   * er billigere å ha stående enn å finne på igjen om et halvt år.
   */
  readonly ikkeDraTrumf?: boolean;
  /** Terskel for vakt 5: hvor mange trumf ute som gjør utspillet forbudt. */
  readonly draTerskel?: number;
  /**
   * Vakt 5, variant: legg det BILLIGSTE sidekortet i stedet for det dyreste.
   *
   * Førsteversjonen spilte `dyreste`, og målte −0,171 ± 0,028. Regelen har to
   * uavhengige deler – NÅR den slår inn, og HVA den spiller i stedet – og et
   * negativt tall på den ene kombinasjonen skiller dem ikke. Denne prøver
   * samme betingelse med motsatt erstatning. Slår begge negativt ut, er det
   * betingelsen som er feil, og da er hele vakt 5 død.
   */
  readonly draBilligst?: boolean;
  /**
   * Vakt 6: som MAKKER, spill laveste trumf tilbake i stikk 2.
   *
   * STILLINGEN er nesten obligatorisk i Amerikaneren: budvinneren spiller ut
   * lav trumf og etterlyser den høyeste trumfen han ikke har, makkeren legger
   * det etterlyste kortet og tar stikket. Så sitter makkeren – nå avslørt –
   * med utspillet, og det er hans første frie valg i runden.
   *
   * MÅLT PÅ UTFALLET, ikke mot et orakel. Arvind foreslo det: «er det mulig å
   * gjøre regret basert på om kontrakten ble felt i stedet for å bruke en
   * løsning?» Det er både mulig og bedre. DD ble avvist av porten (−0,609) og
   * er skadelig å følge; SD er godkjent men så støyete at argmax over den blir
   * vinnerens forbannelse – den blåste opp budtaket mitt fra ingenting til
   * «+1,18». Her legges kortet i den EKTE giva og runden spilles ferdig.
   * Agentene er deterministiske, så hver differanse er EKSAKT for den giva.
   * Ingen sampling, ingen antakelse om perfekt spill.
   *
   * 4 360 giver, kontrakt 9, parret på giv, mot det boten faktisk spilte:
   *
   *   regel                        poengdiff        innfridd
   *   laveste trumf              +0,084 ± 0,031      85,0 %
   *   høyeste trumf              +0,061 ± 0,032      84,7 %
   *   BOTEN I DAG                      –            83,8 %
   *   laveste sidekort           −0,063 ± 0,033      83,1 %
   *   høyeste sidekort           −0,066 ± 0,032      82,9 %
   *   lengste sidefarge, høyest  −0,088 ± 0,033      82,6 %
   *
   * Alle fire sidefargereglene er negative, begge trumfreglene positive.
   * Boten spiller selv trumf her i bare 24 % av stillingene.
   *
   * IKKE HINDSIGHT-SKJEVT, selv om den ekte giva er kjent: regelen velger kort
   * ut fra egen hånd og trumffargen alene og ser aldri giva. Snittet over
   * mange giver er derfor forventningsrett for regelen. Det målingen IKKE
   * dekker er at kortet der bare byttes inn i ETT stikk – derfor må flagget
   * måles i full kamp før det adopteres.
   *
   * HVORFOR LAVESTE OG IKKE HØYESTE: de to er innenfor en standardfeil av
   * hverandre (+0,084 mot +0,061), så rangeringen mellom dem er ikke avgjort.
   * Laveste velges fordi den er billigere – den brenner ikke en høy trumf – og
   * fordi det er konvensjonen menneskene faktisk spiller.
   *
   * ===================== BEKREFTET I FULL KAMP. ADOPTERT. ==================
   *
   * Rollebenken «makker», tvungen kontrakt 9, ti DISJUNKTE frøbånd kjørt hver
   * for seg og poolet – ikke ett langt løp, så skardene er uavhengige:
   *
   *   per skard:  +0,044  +0,067  +0,027  +0,037  +0,013
   *               +0,089  +0,007  +0,040  +0,029  +0,051
   *
   *   POOLET      +0,0404 ± 0,0075   (5,4 SE), 11 060 kontrakter
   *   tegntest    positiv i 10 av 10 skard
   *
   * Effekten er mindre enn den enkeltstikksmålingen antydet (+0,084), og det
   * er ventet: der byttes kortet bare i ETT stikk, mens vakten spiller hele
   * runden etterpå og noe av gevinsten tas tilbake. Retningen og fortegnet
   * står, og 10 av 10 skard er strengere enn SE-en alene.
   *
   * RISIKOEN FOR SKADE ANDRE STEDER ER STRUKTURELT NULL: betingelsen krever
   * at setet ER makkeren, at nøyaktig ett stikk er spilt, at bordet er tomt
   * og at makkeren tok stikk 1. Regelen kan ikke fyre i noen annen stilling,
   * så den kan ikke røre spilleføring eller forsvar.
   *
   * FØRSTE MÅLTE FORBEDRING PÅ DENNE ØKTEN, og den kom av Arvinds egen idé om
   * å måle på utfallet i stedet for mot et orakel. Tre forsøk målt mot
   * orakler i samme økt endte alle negativt.
   */
  readonly makkerTrumfTilbake?: boolean;
  /**
   * Vakt 7: som MAKKER, trumf før budvinneren når det vinner stikket.
   *
   * ARVINDS HYPOTESE, ordrett: «det er bedre at makker trumfer et kort enn
   * budvinner hvis det gir de et stikk. dette forutsetter at noen andre
   * spiller ut og at budvinner spiller ut etter makkeren. siden da kan
   * budvinner spare en trumf OG kvitte seg med et svakt kort.»
   *
   * MEKANISMEN ER MÅLT, ikke bare utfallet – og det er forskjellen på å vite
   * AT noe virker og å vite HVORFOR. `examples/makkertrumf.ts`, 3 920
   * stillinger, hvert kandidatkort lagt i den EKTE giva og runden spilt
   * ferdig med deterministiske agenter:
   *
   *   arm            poengdiff       laget vant   FØRER BRUKTE   innfridd
   *                  mot boten       stikket      TRUMF
   *   trumf        +0,115 ± 0,021      98,1 %        9,3 %        75,8 %
   *   ikke trumf   −0,438 ± 0,037      67,7 %       41,6 %        68,0 %
   *   BOTEN              –             92,0 %       15,9 %        74,1 %
   *
   * Kolonnen i midten ER hypotesen: trumfer makkeren, må budvinneren bruke
   * trumf i 9,3 % av tilfellene. Lar makkeren være, må han det i 41,6 % –
   * 4,5 ganger så ofte. Laget vinner stikket for én trumf i stedet for to,
   * og budvinneren kaster et svakt kort i stedet.
   *
   * Boten gjør allerede det riktige i 81 % av stillingene. Regelen dekker de
   * siste 19 %, og de koster: 74,1 % innfrielse mot regelens 75,8 %.
   *
   * TRUMFEN MÅ VINNE. Å trumfe under en høyere trumf gir ikke laget stikket,
   * det brenner bare et kort. Uten den betingelsen er dette en annen regel
   * enn den som ble målt.
   */
  readonly makkerTrumferFørst?: boolean;
  /**
   * Vakt 8 (`A`): makkeren spiller ESS i sidefarge i stikk 2 – ellers HØYESTE
   * trumf.
   *
   * ARVINDS BESKRIVELSE AV ÅPNINGSFLYTEN, som denne og `C`/`S` kommer av:
   * «i neste stikk er det makker sin tur å spille ut, også spiller den ut
   * enten en ess eller den høyeste trumfen den har.»
   *
   * DEN MOTSIER `m`, SOM ER ADOPTERT. `m` spiller LAVESTE trumf. Begrunnelsen
   * i koden var at laveste og høyeste lå innenfor én standardfeil av hverandre
   * (+0,084 mot +0,061) og at laveste «er konvensjonen menneskene faktisk
   * spiller». Den siste halvdelen var min antakelse, og Arvind sier nå at den
   * er feil. Da står valget på et tall som aldri skilte dem.
   *
   * ESS-VARIANTEN ER ALDRI TESTET. De fem armene som ble målt var: laveste
   * trumf, høyeste trumf, laveste sidekort, høyeste sidekort, lengste
   * sidefarge/høyest. «Høyeste sidekort» er ikke det samme som «ess HVIS du
   * har et» – den spiller en konge eller en dame når esset mangler, og det er
   * et helt annet kort.
   *
   * MEKANISMEN ER FØLGEPLIKTEN, og Arvind har rett i den: `lovligeKort` gir
   * `følg.length > 0 ? følg : hånd.slice()`, altså MÅ man følge farge når man
   * kan – også når fargen er trumf. Spilles høyeste trumf ut, må derfor alle
   * som HAR trumf legge trumf. Det er hele verdien: ett kort trekker to eller
   * tre av motpartens ut. (Bare den som er RENONS står fritt, og han kan velge
   * å ikke trumfe.)
   *
   * ESSET virker på en beslektet, svakere måte: det kan bare slås ved at noen
   * er renons i fargen OG velger å trumfe, og sjansen for renons er lavest
   * TIDLIG. Derfor er esset tryggest i stikk 2.
   */
  readonly makkerEssFørst?: boolean;
  /**
   * Vakt 9 (`C`): budvinneren spiller HØYESTE trumf ut etter å ha tatt et
   * stikk – men bare mens forsvaret fortsatt har trumf.
   *
   * Arvind: «Hvis budvinner måtte ta stikket så plasserer den ut den høyeste
   * trumfen ut for å kontrollere spillet ... når man har muligheten til å bli
   * kvitt 3/2 trumf med 1 så skaper man verdi.»
   *
   * REGNESTYKKET ER FØLGEPLIKTEN: alle som har trumf MÅ legge trumf på et
   * trumfutspill. Ett kort ut trekker altså opptil tre inn. Det er derfor
   * høyeste og ikke laveste – den skal også VINNE stikket, ellers betaler man
   * for uttrekket med utspillet.
   *
   * DETTE ER DET MOTSATTE AV `d`, som er forkastet. `d` sa «ikke dra trumf når
   * ≥3 står ute» og målte −0,171. Vi har aldri testet den andre retningen, og
   * det er den retningen dataene peker: menneskene spiller 0,443 av trumfene
   * sine i stikk 1–4 mot botens 0,382 (+0,061 ± 0,010, 5,9 SE), med like mange
   * trumf å begynne med.
   *
   * BETINGELSEN ER ARVINDS, ikke et antall: har forsvaret ingen trumf igjen,
   * er det ingenting å trekke ut, og da er en høy trumf bortkastet. Se `S`.
   */
  readonly førerTrumfKontroll?: boolean;
  /**
   * Vakt 10 (`S`): slutt å dra trumf når forsvaret er tomt for trumf.
   *
   * Arvind: «Hadde kortene vært sjevt fordelt og B og M satt igjen med resten
   * av trumf ... så hadde man ikke trengt å hive på mer trumf, siden da
   * spiller man bare ut sin egen.»
   *
   * PROXYEN ER OBSERVERBAR, og det er grunnen til at akkurat denne
   * formuleringen er valgt: vi kan ikke se forsvarets hender, men vi kan se om
   * en FORSVARER la trumf i forrige stikk. Arvind bruker selv det kriteriet:
   * «hvis makker vinner stikket og det ikke bare var han og budvinner som
   * plasserte trumf på forrige stikk så repeterer han det.»
   *
   * Proxyen er ikke perfekt – en forsvarer kan ha trumf og la være å bruke den
   * – men den bruker bare informasjon setet faktisk har.
   */
  readonly stoppTrumfNårTomt?: boolean;
  /** Vakt 2, mild: på et garantert stikk, aldri trumf når et avkast er lovlig. */
  readonly garantiIkkeTrumf: boolean;
  /** Vakt 2, streng: på et garantert stikk, alltid det billigste lovlige kortet. */
  readonly garantiBilligst: boolean;
  /**
   * Vakt 2, variant: på et garantert stikk, kast kortet vi har MINST BRUK FOR
   * i stedet for det med lavest valør.
   *
   * DETTE ER STEDET INNVENDINGEN BITER HARDEST, og det er en regel jeg
   * foreslår – ikke en Arvind ba om. Hans innvending gjaldt `k`, men den er
   * sterkere her: på et garantert stikk er stikket ALLEREDE vårt, så kortet
   * er fullstendig fritt. Nettopp der burde «hvilket kort har jeg minst bruk
   * for» avgjøre. I stedet legger vi laveste valør.
   *
   * Og `b` fyrer langt oftere enn `k`, så den samme feilen koster mer.
   *
   * Arvind om `t`: «i utgangspunktet så har man jo [et valg], og da hiver man
   * det som blir et tilsynelatende sikkert stikk senere.» Et fritt avkast er
   * nettopp anledningen til å tømme en farge man vil trumfe i.
   */
  readonly garantiNytte?: boolean;
}

export const INGEN_VAKT: Vaktvalg = { åpning: false, garantiIkkeTrumf: false, garantiBilligst: false };

/** Leser flaggstrengen «a», «t», «b» eller kombinasjoner av dem. */
export function lesVaktflagg(flagg: string): Vaktvalg {
  let valg = INGEN_VAKT;
  for (const tegn of flagg) {
    if (tegn === "a") valg = { ...valg, åpning: true };
    else if (tegn === "h") valg = { ...valg, åpning: true, åpningHøyest: true };
    else if (tegn === "l") valg = { ...valg, åpningLavest: true };
    else if (tegn === "k") valg = { ...valg, kastBilligst: true };
    else if (tegn === "n") valg = { ...valg, kastNytte: true };
    else if (tegn === "N") valg = { ...valg, garantiNytte: true };
    else if (tegn === "A") valg = { ...valg, makkerEssFørst: true };
    else if (tegn === "C") valg = { ...valg, førerTrumfKontroll: true };
    else if (tegn === "S") valg = { ...valg, stoppTrumfNårTomt: true };
    else if (tegn === "t") valg = { ...valg, garantiIkkeTrumf: true };
    else if (tegn === "b") valg = { ...valg, garantiBilligst: true };
    else if (tegn === "d") valg = { ...valg, ikkeDraTrumf: true, draTerskel: 3 };
    else if (tegn === "D") valg = { ...valg, ikkeDraTrumf: true, draTerskel: 4 };
    else if (tegn === "e") valg = { ...valg, ikkeDraTrumf: true, draTerskel: 3, draBilligst: true };
    else if (tegn === "m") valg = { ...valg, makkerTrumfTilbake: true };
    else if (tegn === "p") valg = { ...valg, makkerTrumferFørst: true };
    else {
      throw new Error(
        `Ukjent vaktflagg «${tegn}» (a = åpning/billigst, h = åpning/høyest, ` +
          `l = åpning/alltid lavest, t = ikke trumf, b = billigst)`,
      );
    }
  }
  if (valg === INGEN_VAKT) throw new Error("Tom vaktspesifikasjon – oppgi minst ett av a, t, b");
  return valg;
}

/** Deler «vakt:<flagg>:<resten>» i flagg og indre kandidatspesifikasjon. */
export function delVaktspek(spec: string): { valg: Vaktvalg; flagg: string; indre: string } | null {
  if (!spec.startsWith("vakt:")) return null;
  const rest = spec.slice(5);
  const skille = rest.indexOf(":");
  if (skille <= 0) throw new Error(`Vaktspesifikasjonen mangler indre kandidat: «${spec}»`);
  const flagg = rest.slice(0, skille);
  return { valg: lesVaktflagg(flagg), flagg, indre: rest.slice(skille + 1) };
}

// --- Regel 1: slå aldri ditt eget etterlyste kort ---------------------------

/**
 * Ville `kort` slått vårt EGET etterlyste kort?
 *
 * Bare BUDVINNEREN kan komme i den situasjonen: det etterlyste kortet ligger
 * per definisjon hos en annen (motoren forbyr å etterlyse et kort man selv har
 * eller har vraket), og den som sitter med det er makkeren. Makkeren selv kan
 * ikke slå kortet – han er den som legger det. En forsvarer SKAL slå det.
 *
 * To situasjoner:
 *   UTSPILL i stikk 1 – makkerplikten tvinger kortet ned, så et utspill som
 *   slår det tar stikket fra vår egen makker. (I senere stikk finnes ingen
 *   makkerplikt, og da er ikke en høy trumf noe konvensjonsbrudd.)
 *   PÅLEGG – det etterlyste kortet ligger på bordet og vinner stikket akkurat
 *   nå. Da er stikket vårt allerede, og å legge over er å slå eget kort.
 */
export function slårEgetEtterlyst(s: GameState, sete: number, kort: Kort): boolean {
  const etterlyst = s.etterlyst;
  if (etterlyst === null || s.trumf === null) return false;
  if (sete !== s.budvinner) return false;
  const trumf = s.trumf;
  const MERKE = -1;

  if (s.bord.length === 0) {
    if (s.stikkSpilt !== 0) return false;
    return stikkvinner(
      [
        { spiller: sete, kort },
        { spiller: MERKE, kort: etterlyst },
      ],
      trumf,
    ) === sete;
  }

  const påBordet = s.bord.find((b) => likeKort(b.kort, etterlyst));
  if (påBordet === undefined) return false;
  if (stikkvinner(s.bord, trumf) !== påBordet.spiller) return false; // vinner ikke nå uansett
  return stikkvinner(s.bord.concat({ spiller: sete, kort }), trumf) === sete;
}

// --- Regel 2: garantert stikk ------------------------------------------------

/**
 * Er stikket alt sikret for VÅRT lag, ut fra det `sete` selv kan se, og er det
 * en MEDSPILLER som leder det? (Leder en motstander, er det ikke vårt stikk;
 * er bordet tomt, er det ikke noe stikk å sikre ennå.)
 */
export function garantertVårt(s: GameState, sete: number): boolean {
  if (s.fase !== "SPILL" || s.trumf === null || s.bord.length === 0) return false;
  const våre = lagetSynlig(s, sete);
  if (våre === null) return false;
  const leder = stikkvinner(s.bord, s.trumf);
  if (leder === sete || !våre.includes(leder)) return false;
  return garantertSynlig(s, sete, våre);
}

/**
 * Er det etterlyste kortet garantert å ta stikk 1?
 *
 * Det holder at ingen ukjent trumf ligger OVER etterlysningen. Ukjent vil si
 * verken på egen hånd, i eget vrak eller spilt – `ukjenteKort` regner alle
 * tre. Ligger de høye trumfene hos oss selv eller i vraket, kan ingen forsvarer
 * slå kortet, og makkeren tar stikket med det (makkerplikten tvinger det ned).
 *
 * Merk at etterlysningen selv er «ukjent» for oss – den ligger jo hos makkeren
 * – men den er ikke høyere enn seg selv, så den teller ikke som trussel.
 */
function etterlystGarantert(s: GameState, sete: number): boolean {
  const e = s.etterlyst;
  if (e === null || s.trumf === null) return false;
  const trumf = s.trumf;
  return !ukjenteKort(s, sete).some((k) => k.farge === trumf && k.verdi > e.verdi);
}

/** Ville `kort` tatt stikket slik bordet står nå? */
function vinnerMed(s: GameState, sete: number, kort: Kort): boolean {
  return stikkvinner(s.bord.concat({ spiller: sete, kort }), s.trumf!) === sete;
}

// --- Selve vakten ------------------------------------------------------------

/**
 * Kortet vakten ville lagt i stedet for `valgt`. Returnerer `valgt` uendret
 * når ingen regel slår inn – det er hovedtilfellet.
 */
/**
 * Hvor mange trumf setet IKKE kan se – altså står ute hos de andre.
 *
 * `ukjenteKort` er allerede vrak-bevisst: budvinneren vet at hans egne fire
 * vrakede kort er døde, en forsvarer vet det ikke. Det er nøyaktig riktig
 * her, og grunnen til at regelen ikke bygger sin egen telling.
 */
function trumfUte(s: GameState, sete: number): number {
  if (s.trumf === null) return 0;
  const trumf = s.trumf;
  return ukjenteKort(s, sete).filter((k) => k.farge === trumf).length;
}

/**
 * La en FORSVARER trumf i forrige stikk?
 *
 * Proxyen for «har forsvaret trumf igjen», og Arvinds eget kriterium: «det
 * ikke bare var han og budvinner som plasserte trumf på forrige stikk».
 *
 * INFORMASJONSDISIPLIN: laget leses gjennom `lagetSynlig`, som ikke røper
 * makkeren før det etterlyste kortet er lagt. Vet vi ikke hvem som er
 * forsvarer, svarer vi `null` og reglene som spør holder seg unna.
 */
function forsvarerLaTrumf(s: GameState, sete: number, trumf: Farge): boolean | null {
  if (s.stikkSpilt === 0) return null;
  const forrige = s.historikk[s.stikkSpilt - 1];
  if (forrige === undefined) return null;
  const vårt = lagetSynlig(s, sete);
  if (vårt === null) return null;
  return forrige.kort.some((kp) => !vårt.includes(kp.spiller) && kp.kort.farge === trumf);
}

export function vaktKort(s: GameState, sete: number, valgt: Kort, valg: Vaktvalg): Kort {
  if (s.fase !== "SPILL" || s.trumf === null) return valgt;
  const trumf = s.trumf;
  const lovlige = lovligeKort(s, sete);
  if (lovlige.length <= 1) return valgt;

  /**
   * Vakt 7: makkeren trumfer FØR budvinneren, når det vinner stikket.
   *
   * Betingelsene er nøyaktig de målingen ble gjort på: en FORSVARER spilte ut,
   * budvinneren har ikke lagt kort ennå i dette stikket, og setet er makkeren.
   * Da spilles den billigste trumfen som faktisk VINNER stikket slik bordet
   * står. At den må vinne er en del av regelen: å trumfe under en høyere
   * trumf gir ikke laget stikket, det brenner bare et kort.
   */
  if (
    valg.makkerTrumferFørst === true && s.makker === sete && sete !== s.budvinner &&
    s.bord.length > 0 && s.bord[0]!.spiller !== s.budvinner && s.bord[0]!.spiller !== s.makker &&
    s.bord.every((kp) => kp.spiller !== s.budvinner)
  ) {
    const vinnende = lovlige.filter(
      (k) => stikkvinner([...s.bord, { spiller: sete, kort: k }], trumf) === sete && k.farge === trumf,
    );
    if (vinnende.length > 0) return billigste(vinnende, trumf);
  }

  /**
   * Vakt 8 (`A`): makkeren i stikk 2 – ess i sidefarge, ellers HØYESTE trumf.
   * Samme betingelse som vakt 6, og den står FØR den, så `A` overstyrer `m`
   * når begge er på. Det er med vilje: de er to svar på samme spørsmål, og et
   * flagg som stille tapte mot et annet ville vært umulig å tolke.
   */
  if (
    valg.makkerEssFørst === true && s.bord.length === 0 && s.stikkSpilt === 1 &&
    s.makker === sete && s.historikk[0]?.vinner === sete
  ) {
    const ess = lovlige.filter((k) => k.farge !== trumf && k.verdi === 14);
    // Flere ess: ta det i den KORTESTE sidefargen. Den er nærmest renons, og
    // et ess som ikke tas nå kan bli trumfet senere.
    if (ess.length > 0) {
      const hånd = s.hender[sete] ?? lovlige;
      return ess.reduce((a, b) =>
        hånd.filter((x) => x.farge === b.farge).length < hånd.filter((x) => x.farge === a.farge).length ? b : a,
      );
    }
    const trumfKort = lovlige.filter((k) => k.farge === trumf);
    if (trumfKort.length > 0) return dyreste(trumfKort, trumf);
  }

  /**
   * Vakt 10 (`S`): forsvaret er tomt for trumf – slutt å dra trumf.
   *
   * Står FØR vakt 9, for den er en BREMS på den. Er forsvaret tomt, er en høy
   * trumf ut bortkastet: det finnes ingenting å trekke ut, og kortet kunne
   * tatt et stikk senere uansett.
   */
  if (
    valg.stoppTrumfNårTomt === true && s.bord.length === 0 && s.stikkSpilt > 0 &&
    valgt.farge === trumf && forsvarerLaTrumf(s, sete, trumf) === false
  ) {
    const andre = lovlige.filter((k) => k.farge !== trumf);
    if (andre.length > 0) return dyreste(andre, trumf);
  }

  /**
   * Vakt 9 (`C`): budvinneren tok forrige stikk og forsvaret har trumf igjen –
   * spill HØYESTE trumf for å ta kontrollen.
   */
  if (
    valg.førerTrumfKontroll === true && s.bord.length === 0 && s.stikkSpilt > 0 &&
    sete === s.budvinner && s.historikk[s.stikkSpilt - 1]?.vinner === sete &&
    forsvarerLaTrumf(s, sete, trumf) === true
  ) {
    const trumfKort = lovlige.filter((k) => k.farge === trumf);
    if (trumfKort.length > 0) return dyreste(trumfKort, trumf);
  }

  /**
   * Vakt 6: makkeren har tatt stikk 1 og sitter med utspillet i stikk 2.
   * Betingelsene er nøyaktig de målingen ble gjort på – ett stikk spilt,
   * tomt bord, setet ER makkeren, og makkeren tok forrige stikk.
   */
  if (
    valg.makkerTrumfTilbake === true && s.bord.length === 0 && s.stikkSpilt === 1 &&
    s.makker === sete && s.historikk[0]?.vinner === sete
  ) {
    const trumfKort = lovlige.filter((k) => k.farge === trumf);
    if (trumfKort.length > 0) return billigste(trumfKort, trumf);
  }

  /**
   * Vakt 5 står FØRST fordi den bare gjelder utspill der bordet er tomt og
   * stikk 1 er unnagjort – altså stillinger ingen av de andre vaktene rører.
   * Skulle de likevel overlappe en dag, er rekkefølgen dokumentert her og
   * ikke tilfeldig: vakt 3 gjelder BARE stikk 1, og vakt 5 gjelder aldri der.
   */
  if (
    valg.ikkeDraTrumf === true && s.bord.length === 0 && s.stikkSpilt > 0 &&
    sete === s.budvinner && valgt.farge === trumf &&
    trumfUte(s, sete) >= (valg.draTerskel ?? 3)
  ) {
    const andre = lovlige.filter((k) => k.farge !== trumf);
    // Har vi bare trumf igjen, er det ikke noe valg å ta og regelen tier.
    if (andre.length > 0) return valg.draBilligst === true ? billigste(andre, trumf) : dyreste(andre, trumf);
  }

  // Vakt 3 må stå FØR vakt 1: der den slår inn, er vakt 1 automatisk oppfylt –
  // den laveste trumfen kan ikke slå det etterlyste kortet.
  if (
    valg.åpningLavest === true && s.bord.length === 0 && s.stikkSpilt === 0 &&
    sete === s.budvinner && etterlystGarantert(s, sete)
  ) {
    const trumfKort = lovlige.filter((k) => k.farge === trumf);
    if (trumfKort.length > 0) return billigste(trumfKort, trumf);
  }

  if (valg.åpning && slårEgetEtterlyst(s, sete, valgt)) {
    const trygge = lovlige.filter((k) => !slårEgetEtterlyst(s, sete, k));
    // Finnes ikke et lovlig kort som lar det etterlyste stå, spilles det
    // billigste lovlige: da er skaden uunngåelig, og da skal den være minst.
    if (trygge.length === 0) return billigste(lovlige, trumf);
    // Varianten «høyest under» gjelder bare utspillet. På et pålegg er kortet
    // uansett bortkastet, og da er billigst det eneste rimelige.
    if (valg.åpningHøyest === true && s.bord.length === 0) return dyreste(trygge, trumf);
    return billigste(trygge, trumf);
  }

  // Vakt 4: stikket kan ikke tas av oss. Står bordet tomt, er det ikke noe
  // stikk å tape ennå. Ellers gjelder regelen uansett hvem som leder – se
  // kommentaren over `kastBilligst` for hvorfor de to tilfellene er samme sak.
  if ((valg.kastBilligst === true || valg.kastNytte === true) && s.bord.length > 0) {
    if (!lovlige.some((k) => vinnerMed(s, sete, k))) {
      // `n` ser HELE hånden, ikke bare utvalget: hvor mange kort vi har igjen
      // i fargen avgjør om kastet bringer oss nærmere renons, og det kan ikke
      // leses av de lovlige kortene alene.
      if (valg.kastNytte === true) return minstBrukFor(lovlige, s.hender[sete] ?? lovlige, trumf);
      return billigste(lovlige, trumf);
    }
  }

  if (
    (valg.garantiIkkeTrumf || valg.garantiBilligst || valg.garantiNytte) &&
    garantertVårt(s, sete)
  ) {
    const hånd = s.hender[sete] ?? lovlige;
    const velg = (utvalg: readonly Kort[]): Kort =>
      valg.garantiNytte === true ? minstBrukFor(utvalg, hånd, trumf) : billigste(utvalg, trumf);
    if (valg.garantiBilligst || valg.garantiNytte) return velg(lovlige);
    if (valgt.farge === trumf) {
      const avkast = lovlige.filter((k) => k.farge !== trumf);
      if (avkast.length > 0) return velg(avkast);
    }
  }

  return valgt;
}

/** Det en vakt trenger av den innpakkede agenten. */
export interface Innagent {
  velgHandling(state: GameState): Handling;
  nyKamp?(): void;
}

/** Legger vaktreglene utenpå en vilkårlig agent uten å røre resten av spillet. */
export class Konvensjonsvakt implements Innagent {
  private readonly indre: Innagent;
  private readonly valg: Vaktvalg;
  /** Hvor mange kortvalg vakten har overstyrt – kontroll på at den virker. */
  overstyrt = 0;
  valgTotalt = 0;

  constructor(indre: Innagent, valg: Vaktvalg) {
    this.indre = indre;
    this.valg = valg;
  }

  nyKamp(): void {
    this.indre.nyKamp?.();
  }

  velgHandling(state: GameState): Handling {
    const h = this.indre.velgHandling(state);
    if (h.type !== "SPILL") return h;
    this.valgTotalt++;
    const kort = vaktKort(state, h.spiller, h.kort, this.valg);
    if (likeKort(kort, h.kort)) return h;
    this.overstyrt++;
    return { type: "SPILL", spiller: h.spiller, kort };
  }
}
