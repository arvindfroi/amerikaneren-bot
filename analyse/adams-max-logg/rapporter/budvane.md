# Budvaner: er menneskers bud forutsigbare fra deres egen historikk?

Gren `budvane-2026-09-14` i **`D:\amb-budvane`** (fra `krav-2026-09-11` @ 092cd00).
14. sep, maks 3 kjerner. **Ingen K1-måling startet.** Kjernene eies av iterasjon 12.

## Oppdraget

UNDERSØKELSE FØRST. Hypotese: K6 («lære motstandernes vaner») har alltid vært prøvd på
KORT og målt null seks ganger. Men `dekomp.md` §4a viser at **budet bærer +0,62 pp av
K1s +1,24** — det største enkeltleddet. Vanene som er verdt å utnytte kan ligge i
budrunden, ikke i kortspillet.

Tre spørsmål med tall før noe produksjonskode røres:
1. Er menneskers bud forutsigbare fra deres EGEN historikk, mot (a) generisk menneskemodell
   og (b) en FREMMED spillers historikk (fremmed-bok-fella)?
2. Finnes det dynamikk innen kampen (rundenr, poengstilling, forrige rundes utfall)?
3. Hva er taket? Under 0,1 pp ⇒ sporet er dødt, si det rett ut.

## Logg

- **09:4x** Arbeidskopi opprettet. Datagrunnlag lokalisert:
  `D:\amb-grp\menneske\hendelser.jsonl` (21,3 MB, eksportert 11. sep).
  Verktøy funnet i worktreet: `examples/menneske-eksport.ts`, `menneske-logg.ts`,
  `naabart-bud.ts`, `budq-data.ts`, `verktoy/budq-tren.py`.

### §0 TELLINGEN (`verktoy/budvane-census.py`) — datagrunnlaget er SKJEVT

Kamper der HELE kampen ligger etter `MENNESKE_FRA` = 2026-08-10: **385 kamper, 2641 runder,
3041 menneskebud**. Men de fordeler seg ikke jevnt:

| spiller | kamper | runder | bud | budfordeling |
|---|---|---|---|---|
| A (957f…) | 224 | **2298** | 2551 | PASS 1431, 10:838, 11:135, 9:117, 8:22, 12:5, 7:1, 5:1 |
| B (39d0…) | 101 | **22** | 92 | 11:77, 10:15 — *ingen PASS, nesten ingen fullførte runder* |
| C (91d8…) | 37 | **281** | 336 | PASS 197, 10:90, 9:26, 11:15, 8:7, 12:1 |
| 9 andre | 23 | 40 | 62 | — |

**87 % av alle runder er ÉN spiller (A).** Bare 3 spillere har ≥ 20 kamper, og bare
2 har mer enn 40 gjenskapbare runder. Det er den samme skjevheten profilnotatet
advarte om («alt hviler i stor grad på én spiller»), og den setter taket for hva
fremmed-bok-fella kan avgjøre — se §1.

Merk B: 101 kamper, 22 runder, og bud bare i {10, 11}. Det er avbrutte kamper
(åpnet, bød, sluttet), ikke en spillestil. B kan ikke bære en profil.

### §0b PREMISSKONTROLL — «K6 er aldri testet på budet» STEMMER IKKE

Oppdraget sier at alle K6-forsøk har handlet om å gjette KORT. Kodelesning viser noe annet:

1. **Budmodellen leser alt en motstanderbok.** Løkka kjører
   `examples/budq-data.ts … --hukommelse --sanser2` og trener `budq-tren.py --dim 323`.
   323 = 143 budtrekk + **144 hukommelse (3 motstandere × 48)** + 36 stillingsblokk.
   Målt på binærfilene: `iter0/iter1` = 287, `iter2`–`iter11` = **323**. Den utrullede
   `budq-8.bin` og iterasjon 12s `budq-12.bin` er i samme familie.
2. **Boka bokfører nettopp budvaner.** `src/mlb/hukommelse.ts` har MESO `budavvik`
   (bud − `besteAnslag` av hånden hun VISTE SEG å ha), `passtyrke` og `budandel`, og MAKRO
   `budavvikMotStilling`, `budavvikMotTid`, `budavvikdrift` — altså nøyaktig «byr hun høyere
   etter en tapt runde / når hun ligger under / utover i kampen», spørsmål 2 i oppdraget.
3. **Og fella har alt fyrt én gang på budsiden.** Løkke-v4s eget hode:
   «hukommelsen er ALLTID nullet i menneskeradene (`--minne-dropout 1.0`): i iterasjon 2 ga
   0,5 negativ minnegevinst mot mennesker (K6-menneske stigning z −5,3, **fremmed bok bedre
   enn egen**)». Kravlista fører K6.6 som **DELVIS**.

**Hva som likevel står ubesvart, og som er verdt å måle:** alt over sier om NETTET klarer å
bruke boka. Ingenting sier om SIGNALET finnes — om menneskers bud i det hele tatt er
forutsigbare fra deres egen historikk. Det er et rent spørsmål om dataene, det koster
minutter, og svaret avgjør om nettsiden er verdt flere forsøk. Del 1 måler det.

### §0c K2-SKILLET SOM MÅ STÅ I DETTE DATASETTET

Mennesket sitt eget kort er **skjult for boten når budet faller**. Håndstyrke er derfor:

* **lovlig retrospektivt** — ved rundeslutt er hver hånd avdekket, så `bud − anslag` fra en
  TIDLIGERE runde er offentlig (det er akkurat det `Hukommelse` bokfører), og
* **ulovlig i inneværende runde** — `anslag` for runden som bys nå er klarsyn.

`examples/budvane-data.ts` bygger skillet inn i radnavnene: alt som gjelder den PÅGÅENDE
runden er prefikset `naa_`. En arm som leser `naa_*` er per definisjon uspillbar og
rapporteres som TAK, aldri som kandidat.

### §1 FØRSTE KJØRING — fremmed-bok-fella FYRTE med én gang

2641 beslutninger, 273 kamper, 7 spillere. Klasser: PASS 1394, 10:906, 11:166, 9:141,
ANNET 34. Log-tap per beslutning, 5-delt kryssvalidering på KAMP, klyngebootstrap
B = 20 000 over kamper, parret per beslutning.

| arm | log-tap | mot M1 GENERISK |
|---|---|---|
| M0 PRIOR (marginal) | 1,0928 | +0,0080 ± 0,0036 (z +2,22) |
| **M1 GENERISK** (offentlig kontekst, ingen identitet) | **1,0848** | referanse |
| M2 EGEN BOK / samme kamp | 1,0768 | −0,0080 ± 0,0025 (z −3,23) |
| **M3 FREMMED BOK / samme kamp** | **1,0717** | **−0,0131 ± 0,0035 (z −3,79)** |
| M2 EGEN BOK / historikk | 1,0692 | −0,0156 ± 0,0042 (z −3,69) |
| M3 FREMMED BOK / historikk | 1,0872 | +0,0024 ± 0,0035 (z +0,68) |
| **M4 TAK — `naa_anslag`, ULOVLIG** | **0,9063** | **−0,1785 ± 0,0098 (z −18,15)** |

To ting leses rett av tabellen:

1. **Den positive kontrollen fyrer.** Hånden mennesket satt med — den boten ALDRI ser —
   er verdt **0,179 nats**, elleve ganger mer enn noe vaneledd. Røret kan altså måle
   signal når det finnes. En null under er en ekte null, ikke et ødelagt instrument.
2. **Fella fyrte på det størrelsesmatchede leddet.** Den FREMMEDE kamp-boka (−0,0131) er
   **bedre enn spillerens EGEN** (−0,0080). Boka fanger «hvor er vi i kampen», ikke «hvem
   er dette». Historikk-leddet peker motsatt vei, men der er fella ikke størrelsesmatchet:
   spiller A er 87 % av korpuset, så «As egen historikk» ≈ «alle mennesker», og den
   fremmede boka for A er Cs lille. Det leddet kan ikke skille profil fra prøvestørrelse.

Kjøringen stoppet i utskriften av felle-linjene (cp1252 kan ikke skrive U+2212). Fikset;
full kjøring med per-spiller-oppdeling og §2 følger.

### §1b FULL KJØRING — per spiller, og dommen over fella

Full utskrift: `D:\amb-grp\loop\budvane\analyse.txt`. Per-spiller-oppdelingen avgjør
hist-leddet som §1 ikke kunne lese, og den snur konklusjonen der.

**Spiller A (957f…, 2298 runder, 211 kamper) — den eneste med reell styrke:**

| arm | log-tap | mot M1 GENERISK |
|---|---|---|
| M0 PRIOR | 1,0691 | +0,0019 ± 0,0033 (z +0,57) |
| **M1 GENERISK** | **1,0672** | referanse |
| M2 EGEN BOK / kamp | 1,0610 | −0,0062 ± 0,0029 (z −2,14) |
| **M3 FREMMED BOK / kamp** | **1,0505** | **−0,0167 ± 0,0034 (z −4,97)** |
| M2 EGEN BOK / historikk | 1,0720 | +0,0047 ± 0,0034 (z +1,41) |
| M3 FREMMED BOK / historikk | 1,0798 | +0,0126 ± 0,0099 (z +1,27) |
| M4 TAK (`naa_anslag`, ULOVLIG) | 0,8704 | −0,1969 ± 0,0104 (z −18,98) |

> **FELLE kamp (størrelsesmatchet): egen − fremmed = +0,0105 ± 0,0040 (z +2,62).**
> Spillerens EGEN bok er *målbart DÅRLIGERE* enn en fremmed spillers bok med like mange
> runder bak seg.
> **FELLE hist: egen − fremmed = −0,0079 ± 0,0076 (z −1,03)** — null. Og As egen
> historikk-bok slår ikke engang den generiske modellen (+0,0047, z +1,41).

**Spiller C (91d8…, 281 runder, 30 kamper):** M4 fyrer (−0,1713, z −5,16), men *ingen*
bok-arm slår den generiske; egen kamp-bok er **verre** (+0,0724, z +2,36), og begge feller
er null (z +1,21 og −0,44). Med 30 kamper er den generiske modellen selv dårligere enn
marginalfordelingen (1,2021 mot 1,1596) — den overtilpasser.

**Hva som skjedde med det lovende hist-tallet i §1.** Over ALLE spillere så «egen historikk»
ut som en gevinst (−0,0180, z −3,66). Den forsvinner helt innen spiller A (z −1,03). Grunnen
er prøvestørrelse, ikke profil: A er 87 % av korpuset, så «As egen historikk» ≈ «alle
mennesker», mens «fremmed historikk» for A er Cs mye mindre bok. Det leddet målte at boka
er STOR, ikke at den er RIKTIG — nøyaktig samme forveksling profilnotatet tok 12. sep
(«noe av det lille som vokser, er bare at blokken fylles»). Det er derfor den fremmede
kamp-boka er størrelsesmatchet, og det er den som gjelder.

**Og legg merke til hva som FAKTISK hjelper:** en FREMMED kamps bok ved samme rundenummer
er den beste lovlige armen av alle (−0,0167, z −4,97 hos A). Boka bærer «hvor er vi i en
kamp», ikke «hvem er dette». Det er informasjon om spillets forløp, tilgjengelig uten å
vite noe som helst om personen.

### §2 DYNAMIKK INNEN KAMPEN — én effekt, og den er alt en inngang

| deling | n | byr (andel) | budnivå |
|---|---|---|---|
| alle | 2641 | 0,472 ± 0,009 | 9,976 ± 0,019 |
| etter TAPT runde | 493 | 0,497 ± 0,021 | 9,894 ± 0,043 |
| etter ikke-tapt | 2148 | 0,466 ± 0,011 | 9,996 ± 0,020 |
| leder (>5 % av mål) | 389 | 0,514 ± 0,022 | 9,925 ± 0,044 |
| ligger bak (>5 %) | 1752 | 0,490 ± 0,012 | 9,935 ± 0,023 |
| tidlig (runde <4) | 894 | 0,498 ± 0,016 | 9,993 ± 0,028 |
| sent (runde ≥8) | 1079 | 0,435 ± 0,015 | 9,977 ± 0,028 |

| differanse | byr | budnivå |
|---|---|---|
| tapt − ikke tapt | +0,0305 ± 0,0234 (z +1,30) | **−0,1021 ± 0,0473 (z −2,16)** |
| bak − leder | −0,0238 ± 0,0251 (z −0,95) | +0,0098 ± 0,0497 (z +0,20) |
| **sent − tidlig** | **−0,0631 ± 0,0217 (z −2,91)** | −0,0167 ± 0,0394 (z −0,42) |

* **«Byr høyere etter en tapt runde» er FEIL.** Han byr marginalt oftere (z +1,30, ikke
  signifikant), og når han byr, byr han **lavere**, ikke høyere (−0,10, z −2,16).
  Fortegnet er motsatt av hypotesen. Og det er beste-av-seks sammenlikninger — etter
  metodekravet er det en kandidat for en egen forhåndsregistrert prøve, ikke et funn.
* **«Byr lavere når han leder / høyere når han ligger under» er null** i begge mål.
* **Den ene reelle effekten er tid:** han byr sjeldnere sent i kampen (−0,063, z −2,91).
  **Men rundenummeret er allerede en inngang i BudQ** — `budq.ts` setter
  `v[BUD_DIM_V2+2] = min(1, rundeNr/20)`, og stillingsblokken (36 tall) ligger bak den.
  Effekten er altså alt eksponert for modellen. (Forbehold: sent/tidlig er en uparret
  sammenlikning mellom grupper; lange kamper er ikke et tilfeldig utvalg av kamper.)

### §3 HVA ER DET VERDT? — under grensen, og sporet er dødt

Oppdraget: «er svaret under 0,1 pp, si det rett ut og stopp». **Det er det. Jeg stopper,
og jeg bygger ikke.** Fire uavhengige grunner, i styrkerekkefølge:

1. **Det finnes ingen positiv størrelse å konvertere.** På den eneste størrelsesmatchede
   fella, hos den eneste spilleren med styrke, er egen bok **+0,0105 ± 0,0040 dårligere**
   enn en fremmeds. En profil kan ikke være verdt mer enn null når den taper mot en bok
   som ikke handler om personen.
2. **Instrumentet virker.** M4 henter 0,179–0,197 nats fra hånden — 11–19 ganger alt noe
   vaneledd rører. Nullen er ekte, ikke et dødt rør. Og den peker på hvor forutsigbarheten
   faktisk ligger: i kortene boten ALDRI får se, ikke i personen.
3. **Kanalen er allerede bygd og allerede full.** Utrullet `budq-8.bin` og iterasjon 12s
   `budq-12.bin` er **323 innganger** = 143 + **144 hukommelse** + 36 stilling.
   Hukommelsen bokfører nøyaktig MESO-`budavvik`/`passtyrke`/`budandel` og MAKRO
   `budavvikMotStilling`/`budavvikMotTid`. Alt §2 spurte om er alt en inngang.
4. **Taket er alt målt, og det er nådd.** `dekomp.md` §3/§6: budets nåbare gap er
   **−0,43 ± 0,51 poeng/runde** (bånd 0), øvre grense ≤ +0,58 — «budet bærer mest, men er
   PÅ taket». Å hente mer krever informasjon som ikke finnes ved bordet, og §1 sier at
   motstanderens identitet ikke er den informasjonen.

**Forbeholdet, sagt høyt:** korpuset er 2 spillere med reell vekt (2298 og 281 runder).
Dette er bevis mot en STOR utnyttbar budprofil i DISSE dataene — samme forbehold
profilnotatet tok — ikke bevis for at ingen menneskegruppe noensinne har en. Boka er
også bare 4 krympede tall mot hukommelsens 48; et rikere parameterval kunne bære mer, men
fellas RETNING (fremmed ≥ egen) er et utsagn om dataene, ikke om parameteriseringen.

**Det som derimot står igjen som en ekte, billig observasjon:** den fremmede kamp-boka ved
samme rundenummer er den beste lovlige armen (−0,0167, z −4,97). Forløpsinformasjon slår
personinformasjon. Om noe skal prøves på budsiden, er det den — og den krever ingen profil,
ingen lagring, og ingen ny K2-vurdering.

### §4 REGNSKAP

Alt er ren reanalyse av lagrede loggdata. **Ingen K1-måling startet.** Én kjerne, sekunder
til minutter per kjøring (eksport 2641 rader, analyse ~2 min inkl. 20 000 bootstrap).
Ingen av de vernede mappene rørt. Kode: `examples/budvane-data.ts`,
`verktoy/budvane-census.py`, `verktoy/budvane-analyse.py` på gren `budvane-2026-09-14`.
Data: `D:\amb-grp\loop\budvane\bud.jsonl`, utskrift `…\analyse.txt`.
