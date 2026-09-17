# Residualen skal være stakk-relativ, ikke en global konstant

Gren: `koblinger-2026-09-13` i **`D:\amb-kobling`** (base `9a5677a`). 13. sep.
`D:\amb-krav` og `D:\amb-loop` er ikke rørt (iterasjon 9 kjører der). Maks 3 kjerner.
Ingen K1-måling startet.

Forløper: `D:\amb-grp\loop\okt-sonde.md`.

---

## DEFEKTEN, i én setning

`BEFOLKNING_RESIDUAL = −0,0976` (`stilbias.ts:321`) ble målt på stakken
`abmpf`+`d7alle` og brukes som nullpunkt på ALLE stakker. Løkkas hale ligger
0,014–0,025 over den. Et systematisk avvik krymper ikke med `n` mens SE gjør, så

    z = |snitt − konstant| / SE  ->  vokser uten grense

og detektoren konkluderer til slutt med at fire IDENTISKE kopier av boten har
hver sin spillestil.

| hale | snitt per sete (~700 obs) | seter over porten (z ≥ 2,0) |
|---|---|---|
| `abmpf`+`d7alle` (der konstanten ble målt) | −0,1055 | 0 av 4 |
| `abmp`+`kort-7` (løkka) | −0,0721 | **2 av 4** |
| `abmp`+`kort-8` (løkka) | −0,0836 | 1 av 4 |

Bifunn: `stilvri` har ingen rundeterskel, mens `aggressivitet` har
`MIN_RUNDER = 4`. `stilvri` kan derfor fyre i runde 1 på ~9 observasjoner der
SE kollapser — målt topp z = 7,13 (`abmpf`) og 13,19 (`abmp`+`kort-8`).

---

## Kartet: hvor endringen hører hjemme

Hele detektoren går gjennom ÉN funksjon, og den tar allerede imot bordet:

```
stilbias.ts:323   stilForskjell(eget, andre)     <- «andre» er der, men «void»-et
stilbias.ts:328     void andre;
stilbias.ts:329     const forskjell = snitt(eget) - BEFOLKNING_RESIDUAL;
```

Kallerne, hele settet (`grep stilForskjell`):

| kaller | fil |
|---|---|
| `Profilbok.stil(sete)` — bygger alt `andre` = de tre andre setene | `profilagent.ts:117-121` |
| `utslag()` i prøven | `test/stilbias.test.ts:121` |

Og `stil()` leses av nøyaktig én produksjonssti: `Økt.stilvri` (`okt.ts:142`),
som igjen leses av `motpartFor` (A2), `atferdFor` (K8) og `sum:`-stilleddet.

**Det betyr at rettingen er én funksjonskropp.** Ingen ny sti, ingen ny leser,
ingen ny datakilde — `andre` er allerede regnet ut og kastet.

---

## 1. MÅLINGEN: de to formene, regnet i SAMME gjennomløp

`examples/oktsonde2.ts --del d` regner begge nullpunktene på hvert eneste punkt,
på samme bokføring, i samme kamp. To separate kjøringer ville skilt lag på
kortstokk og runder — da måler man alt annet enn formelen.

Fire IDENTISKE agenter, 5 frø × 3 kamper × 26 runder per hale (390 runder, 74 880
punkter). Rådata: `D:\amb-grp\loop\residual\D*.txt`.

| hale | form | over porten | maks krympet | snitt z runde 5 → 25 |
|---|---|---|---|---|
| `abmpf`+`d7alle` *(der konstanten ble målt)* | global | 3,1 % | 0,0236 | 0,83 → 0,82 **flat** |
| | **bord** | 4,1 % | 0,0283 | 0,95 → 0,90 **flat** |
| `abmp`+`kort-7` *(løkka)* | global | **31,1 %** | 0,1055 | 1,31 → **1,69 STIGER** |
| | **bord** | **2,2 %** | 0,0667 | 0,96 → 0,89 **flat** |
| `abmp`+`kort-8` *(løkka)* | global | **19,6 %** | 0,0609 | 1,15 → **1,41 STIGER** |
| | **bord** | **4,5 %** | 0,0155 | 0,86 → 0,93 **flat** |

(«over porten» og «maks krympet» med rundegulvet `r ≥ 4` på; se del 3.)

**Det er hele saken i to kolonner.** Med den globale konstanten avhenger
detektorens oppførsel av hvilken stakk som spiller — 3 % på den ene halen, 31 %
på den andre — og på løkkas haler VOKSER z med antall observasjoner. Med bordet
som nullpunkt ligger alle tre halene på 2–5 % og z er flat. Formen oppfører seg
likt uansett stakk, som er hele poenget.

### Klonprøven, seter flagget ved siste avlesning (av 4 per frø)

| hale | global | bord |
|---|---|---|
| `abmpf`+`d7alle` | 1 av 20 | **1 av 20** |
| `abmp`+`kort-7` | **10 av 20** | **1 av 20** |
| `abmp`+`kort-8` | **6 av 20** | **1 av 20** |

## 2. VALGET: (a) bordets egen grunnlinje — og hvorfor ikke (b)

Formen som er valgt:

    forskjell = snitt(eget) − snitt(de tre andre setene slått sammen)
    SE        = √(SE_eget² + SE_andre²)
    sikker    = |forskjell| ≥ 2·SE

**Hvorfor ikke (b), en konstant per hale:** målingen avliver den selv. På den
halen konstanten ER kalibrert for (`abmpf`+`d7alle`) er de to formene like —
3,1 % mot 4,1 %, begge flate. En kalibrert konstant per hale kjøper altså
**ingenting bord ikke allerede gir**, og betaler for det med et kalibreringssteg
per stakk.

Og det steget har allerede sviktet én gang, stille. Løkka byttet fra `kort-7`
til `kort-8` mellom iterasjoner, og de to halene måler ulikt nullpunkt
(−0,0721 mot −0,0836). En konstant kalibrert på `kort-7` er altså **allerede
feil for `kort-8`** — med 0,0115, som er nøyaktig der de 19,6 % kommer fra.
Iterasjon 10 får et nytt nett. (b) er en form som må vedlikeholdes hver gang
noe endres, og som ikke sier fra når den er utdatert.

Bordet kan ikke bli foreldet: bytter stakken, flytter både setet og referansen
seg sammen, og differansen er uendret.

**Prisen, ærlig:** bord betaler for at referansen selv er anslått —
`SE_andre` er med i nevneren. På `abmpf` koster det 3,1 % → 4,1 %. Det er
riktig retning å betale i: konstanten lot som om nullpunktet var kjent uten
feilmargin.

## 3. Rundeterskelen — `stilvri` trenger den, og tallet er målt

`aggressivitet` har `MIN_RUNDER = 4`; `stilvri` hadde ingenting. Maks z uten og
med gulvet, fire identiske agenter:

| hale | form | maks z uten gulv | maks z med `r ≥ 4` |
|---|---|---|---|
| `abmpf` | global | **7,13** | 2,88 |
| `abmp`+`kort-7` | global | 6,48 | 4,00 |
| `abmp`+`kort-8` | global | **13,19** | 4,27 |
| `abmp`+`kort-8` | bord | 5,86 | **2,61** |

Alle toppene ligger i runde 0–1 ved n ≈ 9–10, der `standardfeil` bruker `n − 1`
og kollapser. Gulvet koster fire runder og fjerner hele klassen. Det gjelder
BEGGE former — det er en uavhengig feil, ikke en del av nullpunktet.

## 4. Fyrer den fortsatt mot en EKTE forskjell?

Tre trumftrekkere, 3 frø × 2 kamper × 26 runder (`D4-trumftrekker.txt`):

| form | punkter over porten | maks krympet (utslaget som vrir søket) |
|---|---|---|
| global | 89,9 % | 0,6521 |
| **bord** | **97,3 %** (100,0 % med gulvet) | **0,6585** |

Bord fyrer **mer**, ikke mindre, og utslaget er bevart. z faller fra 122 til 44
— ventet, fordi tre av fire seter ER trumftrekkere og trekker referansen med
seg — men det er ikke i nærheten av porten på 2,0.

Og forholdet mellom vane og støy, som er det som avgjør om vridningen er
meningsfull: klonenes maks utslag er 0,0155–0,0667 mot vanens 0,6585. Vanen
dominerer med en faktor på **10 til 42**.

## 5. AV ER AV — grunnlinjen, tatt FØR endringen

`--del e` hasher hele handlingsrekken (FNV-1a over hvert bud, vrak og kort i
rekkefølge). En teller som ser på sluttstillingen ville oversett ett flyttet
kort i runde 19; hashen kan ikke det.

Målt med `NULLFORM = global`, altså dagens bot:

| spek | uten `okt:` | med `okt:` |
|---|---|---|
| `loopnaer` (12 r × 2 k, 1314 handlinger) | `571f0a9f` | `571f0a9f` |
| `usokt`/`abmpf` (12 r × 2 k, 1314 handlinger) | `52bcf25d` | `52bcf25d` |
| `full` (10 r × 1 k, 547 handlinger) | `adc18b13` | `adc18b13` |

**Kolonnen som betyr noe er «uten `okt:`».** Den skal være bit-identisk etter
byttet. (At «med `okt:`» er lik «uten» i disse tre er et eget, kjent funn:
hukommelsen endrer ~0,4 % av valgene, og i disse korte løpene ingen — det er
nettopp derfor kandidaten trenger en K1-dom og ikke en øyemåling.)

**Bekreftet etter byttet — alle tre bit-identiske:**

| spek | uten `okt:` før | uten `okt:` etter |
|---|---|---|
| `loopnaer` | `571f0a9f` | **`571f0a9f`** |
| `usokt`/`abmpf` | `52bcf25d` | **`52bcf25d`** |
| `full` | `adc18b13` | **`adc18b13`** |

## 6. PRISEN — og den skal stå synlig

Dette er det ene stedet kandidaten er **verre** enn i dag, og det er en ekte
kostnad, ikke en opprydding.

Med **nøyaktig én** avviker ved bordet er tilskuernes referanse de tre andre
setene — og ett av dem ER avvikeren. Referansen forskyves med ~1/3 av avviket,
så tilskuerne leses som avvikende motsatt vei. Målt (`--del d --mot envane`,
`D5-envane.txt`), største utslag per sete:

| sete | global | bord |
|---|---|---|
| 0 (klone) | 0,0000 | **0,1842** |
| 1 (VANEN) | 0,5953 | 0,6052 |
| 2 (klone) | 0,0100 | **0,2129** |
| 3 (klone) | 0,0222 | **0,1782** |
| **forhold vane/tilskuer** | **27×** | **2,8×** |

Årsaken er aritmetisk og strukturell, ikke en innstilling som kan skrus på:
avvikeren måles mot tre rene kloner og får hele utslaget, tilskuerne måles mot
en referanse som inneholder henne. Forholdet er ~3:1 når én av fire avviker,
uansett hvor porten står.

**Følgen:** terskelen i den eksisterende prøven «vanen blir funnet» er senket
fra 5× til 2,5×. Det er en reell svekkelse av en eksisterende vakt, og jeg har
ikke villet gjøre det stille.

**Hvorfor jeg likevel mener bytte er riktig:** den motsatte feilen er verre, og
det er den vi faktisk har. Fire IDENTISKE kloner får i dag opptil 0,1055 i vri
**uten at noen avviker i det hele tatt**, og andelen vokser mot 31 % med
kamplengden. En ensom stilisert trumftrekker er en prøvefikstur; fire like
seter er det løkka og appen faktisk spiller — og det er nullarmen i K6.

Vil du ikke betale den prisen, er alternativet (b): konstant per hale, med et
kalibreringssteg per stakk som må huskes hver iterasjon. Tallene for den står i
del 2.

## 7. K2 — ingen ny sti leser skjulte kort

Endringene regner utelukkende på `Biasanslag` (`sum`, `kvadrat`, `n`) og på
`bydde.n` (antall observerte runder):

- `stilForskjellForm` / `slåSammen` — ren aritmetikk på tre tall.
- `Økt.stilvri` — leser `bok.runder(sete)`, en rundeteller. Ingen kort.

Rekonstruksjonen som faktisk leser hender (`rundensResidualer`,
`stilbias.ts:258`) er **uendret** og kjører der den alltid har kjørt: på
`RUNDE_SLUTT`, når alle kort er avdekket. Valgene i runde `r` ser fortsatt bare
residualer fra runde `< r`.

`test/k2-aldri-jukse.test.ts` og `test/k2-alle-faser.test.ts` er kjørt.

## 8. SPEKEN DU SKAL K1-MÅLE

Jeg har **ikke** startet noen K1-måling (2,5 t per arm, kjernene er opptatt av
iterasjon 9). Kandidaten endrer botens atferd og kan ikke dømmes på at sonden
ser penere ut.

**Parret K1, to armer som skiller seg på ÉN commit:**

| | |
|---|---|
| arm A (i dag) | `9a5677a` — `NULLFORM = "global"`, `stilvri` uten rundegulv |
| arm B (kandidat) | denne grenens HEAD |
| spek | løkkas ordrette, `adams-max-loop-v9.sh:161` (under) |
| parring | samme frø i begge armer |

```
okt:vr:e1-modell/vrak-8.bin@e1-modell/etterlyst-8.bin:telrd:eks:3Lt2000:profil:
sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-8.bin:budq:e1-modell/budq-8.bin:
vakt:abmp:e1:e1-modell/kort-8.bin
```

**Hvorfor nettopp den speken:** `M` binder `økt.motpartFor` (`agentspek.ts:1344`
/`1491`), så det er den eneste av speкene her der endringen i det hele tatt kan
nå et valg. Uten `M` er kandidaten bit-identisk med i dag — verifisert i del 5.

**Hva du bør vente deg:** et lite tall. `okt:` endrer ~0,4 % av valgene, så
effekten er liten uansett fortegn, og målingen trenger den vanlige parrede
styrken. Det som ER stort er at nullarmen blir ærlig: 35,9 % av punktene
passerte porten mot kloner i løkkas hale, nå 2,2 %.

## 9. Prøvene som er kjørt

- `test/stilbias.test.ts` — **8 prøver, alle grønne**, hvorav 5 nye:
  klonprøven i alle tre haler, «z vokser ikke med n», «vanen fyrer fortsatt»,
  «NULLFORM er bordets», og rundegulvet.
- **Regresjonssveip over de 27 prøvefilene som nevner `okt:`/`Økt`/`profil:`/
  `stilbias`/`Profilbok`: 175 prøver, 174 bestått, 0 feil, 1 hoppet over.**
  Kjørt med `--test-concurrency=2` for å holde meg under kjernetaket.
- Enkeltvis grønne: `okt`, `profilagent`, `sum-nullpunkt`, `sik-okt`,
  `utrullet-sik-okt`, `k2-aldri-jukse`, `utensok`, `amu-bitidentisk`,
  `k6-vaner`, `k4-hukommelse`.
- `tsc --noEmit`: eneste feil er `src/mlb/fargebytte.ts` TS6133, som er eldre
  enn grenen og ført som forhåndseksisterende i to tidligere rapporter.

Rådataene i `D:\amb-grp\loop\residual\D*.txt` er alle produsert på nytt med den
FERDIGE sonden, etter at en feil i verktøyet ble rettet: den globale kolonnen
leste `bok.stil`, som følger `NULLFORM`, så begge kolonnene målte det samme i
det øyeblikket produksjonen byttet form. `D2` reproduserer tallene fra før
byttet eksakt (31,1 % mot 2,2 %), så sammenligningen står.

## Status

- [x] Lest sonderapporten og rådataene
- [x] Kartlagt kallgrafen
- [x] Måle formene mot hverandre — **(a) bord valgt, med tall**
- [x] Rundeterskelen — **målt til å høre hjemme, i begge former**
- [x] Klonprøven som test — `test/stilbias.test.ts`, 5 nye prøver
- [x] Fyrer fortsatt mot ekte forskjeller — 97,3 %
- [x] AV ER AV — bekreftet, tre speker, bit-identisk
- [x] K2-gjennomgang
- [ ] **K1-dom — din, ikke min**
