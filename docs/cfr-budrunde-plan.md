# Plan: CFR-trent budrunde (kjør lokalt)

Mål: erstatte den EV-heuristiske budgivningen (`velgBud`) med en **CFR-trent
politikk** som nærmer seg spillteoretisk optimal (uutnyttbar) budgivning.
Kortspillet beholdes uendret – det er allerede nær optimalt via eksakt
dobbelt-dummy + PIMC. Vi lærer **bare budrunden**, med den eksisterende
motoren som **utbetalings-orakel**.

Dette dokumentet er selvstendig: alt kjøres lokalt med Node, ingen GPU, ingen
nye avhengigheter. Regn med minutter til noen timer trening avhengig av
oppløsning.

---

## 0. Hvorfor dette virker (og hvorfor bare budrunden)

- **Stikkspillet** er et perfekt-informasjons delspill når hendene er kjent →
  løses eksakt av `løsDD`/`evaluerHybrid`. CFR/nevrale nett kan ikke slå
  eksakt løsning her. La det være.
- **Budrunden** er et ekte imperfekt-info, konkurrerende delspill (signalering,
  posisjon, risiko). Her ligger den reelle gevinsten. CFR konvergerer mot en
  likevekt.
- **Orakel**: for enhver full giv kan motoren si nøyaktig hvor mange stikk
  budlaget tar. Det gir CFR en presis utbetaling uten å simulere hele PIMC.

Begrensning å være obs på: fler-spiller-CFR (4 spillere) har ikke samme
Nash-garanti som to-spiller null-sum, men konvergerer i praksis til sterk,
robust spilling. Det holder her.

---

## 1. Avgrens spillet som skal løses

**Handlinger:** `PASS, 5, 6, 7, 8, 9, 10, 11, 12`.
Utelat Amerikaner/Solo i første versjon – de meldes nesten aldri (+EV krever
alle stikk), og de kompliserer utbetalingen (solo har ingen makker). La den
gamle EV-logikken håndtere dem som fallback, eller dropp dem.

**Budregler (speil av motoren):** start hos spiller til venstre for giver,
med klokka; hvert bud må være strengt høyere enn forrige (min 5, maks 12);
pass tar deg ut; når bare én aktiv gjenstår med et høyeste bud → den vinner;
passer alle → omdeling (utbetaling 0 til alle).

---

## 2. Utbetalings-orakel (bygg og test dette FØRST)

For en full giv (4×12 kort + 4 talong) og en tenkt budvinner `w`:

1. `w` tar opp talongen (16 kort), vraker 4 (behold trumf + ess, kast lavt fra
   korte sidefarger – speil `heuristiskVrak`).
2. Velg trumf = lengste farge i den beholdte hånden.
3. Etterlys høyeste manglende trumf → **makker** = spilleren blant de tre andre
   (deres utdelte hender) som sitter med kortet.
4. Regn ut budlagets stikk `T` eksakt-nok med motoren:

```ts
import { evaluerHybrid, kortTilInt, type DDOppsett } from "amerikaneren-motor";
import { FARGER } from "amerikaneren-motor";

// live-hender: w har den beholdte 12-korts hånden, de andre sine utdelte 12.
const o: DDOppsett = {
  N: 4,
  trump: FARGER.indexOf(trumf),
  declLag: [0,1,2,3].map(i => i === w || i === makker),
  hender: live.map(h => h.map(kortTilInt)),
  iTur: w,
  totalStikk: 12,
};
const T = evaluerHybrid(o, /*terskel*/ 4, /*nodeTak*/ 300_000); // ~1–2 ms
```

`terskel: 4` gir et raskt, litt grovt estimat (bra nok for trening; bruk 7–8
for en sluttvalidering). **Forhåndsregn `T_w` og `makker_w` for alle fire
mulige vinnere per giv** (~4×1.5 ms) og gjenbruk dem i hele budtreet for den
given.

**Utbetalingsvektor** (per spiller) ved terminal med vinner `w` og tallbud `n`:

```
klart   = T_w >= n
util[w]        = klart ? +2n : -2n           // budvinner (dobbel sats)
util[makker_w] = klart ? +n  : -n            // makker
util[andre]    = (12 - T_w) / antallForsvar  // forsvarernes stikk-andel
alle-pass      => util[*] = 0
```

(Dette er nok for budinsentivene. Vil du ha eksakt forsvarer-poeng, må du løse
per-spiller-stikk, men det er andre-ordens for budbeslutningen.)

**Test orakelet:** sterke hender skal gi høy `T`, meld = `T` skal gi positiv
`util[w]`; sjekk noen håndlagde hender.

---

## 3. Håndabstraksjon (infosett)

CFR trenger et lite tilstandsrom. Bøtt hånden (12 utdelte kort, FØR talong)
på trekk som forutsier budstyrke:

```ts
function håndBøtte(hånd: Kort[]): number {
  const tel = fargeTelling(hånd);
  const beste = (["S","H","R","K"] as Farge[]).sort((a,b)=>tel[b]-tel[a])[0];
  const lengde = Math.min(tel[beste], 8);                     // 0..8
  const honnør = hånd.filter(k => k.farge===beste && k.verdi>=12).length; // 0..3 (Q,K,A)
  const sideEss = hånd.filter(k => k.farge!==beste && k.verdi===14).length; // 0..3
  return (lengde*4 + Math.min(honnør,3))*4 + Math.min(sideEss,3);   // ~144 bøtter
}
```

Start grovt (færre bøtter = raskere konvergens), forfin senere. Vurder å bytte
denne mot ett skalar-«forventet stikk»-tall hvis du vil ha færre bøtter.

**Infosett-nøkkel** (det spilleren vet når den skal melde):

```
key = `${håndBøtte}|${høyesteBudNå}|${antallPassert}`
```

(Grov historikk-abstraksjon; utvid med posisjon/hvem som meldte hvis du vil.)

---

## 4. CFR-kjernen (chance-sampled vanilla CFR, fler-spiller)

Sample én giv per iterasjon (det er «chance»-samplingen), traverser HELE
budtreet (det er lite pga. monotone bud), returner en utbetalings**vektor**.

```ts
// tabeller: regret[infoset][action], stratSum[infoset][action]
function cfr(node, reach: number[/*4*/]): number[/*4*/] {
  if (node.terminal) return utbetaling(node);        // fra §2
  const p = node.iTur;
  const I = infosetKey(p, node);
  const strat = regretMatch(I, node.lovligeBud());   // normaliser positive regrets
  const nodeUtil = [0,0,0,0];
  const utilA: Record<Action, number[]> = {};
  for (const a of node.lovligeBud()) {
    const childReach = reach.slice(); childReach[p] *= strat[a];
    const ua = cfr(node.apply(a), childReach);
    utilA[a] = ua;
    for (let i=0;i<4;i++) nodeUtil[i] += strat[a]*ua[i];
  }
  const motReach = reach.reduce((acc,r,j)=> j===p ? acc : acc*r, 1); // ∏_{j≠p}
  for (const a of node.lovligeBud()) {
    regret[I][a] = (regret[I][a]||0) + motReach*(utilA[a][p] - nodeUtil[p]);
    stratSum[I][a] = (stratSum[I][a]||0) + reach[p]*strat[a];
  }
  return nodeUtil;
}
```

- **regretMatch**: `strat[a] = max(0, regret[a]) / Σ max(0, regret)`; hvis alt 0,
  uniform over lovlige.
- **Kjør**: for hver iterasjon, sample giv, forhåndsregn `T_w/makker_w`, kall
  `cfr(rot, [1,1,1,1])`. (Enkel variant: samme traversering oppdaterer alle
  spilleres regrets siden vi returnerer full vektor.)
- **Gjennomsnittsstrategi** (det som spilles): `avg[a] = stratSum[I][a] / Σ`.

Ytelse: budtreet per giv er lite (monotone bud, maks ~4 aktive). 10^5–10^6
iterasjoner er minutter–timer i Node. Logg gjennomsnittlig utnyttbarhet eller
bare spill-styrke (§6) med jevne mellomrom for å se konvergens.

---

## 5. Filstruktur (legg i repoet)

```
train/
  orakel.ts        // §2: delUt(rng), precompVinner(hender,talong,w) -> {T,makker}
  abstraksjon.ts   // §3: håndBøtte, infosetKey
  budtre.ts        // budnode: iTur, passet[], høyeste, lovligeBud(), apply(), terminal
  cfr.ts           // §4: regret/stratSum, cfr(), regretMatch()
  tren.ts          // hovedløkke: N iterasjoner -> skriv politikk.json
politikk/
  budpolitikk.json // ut: { infoset: { action: prob } }
```

`tren.ts` skriver `politikk.json` (gjennomsnittsstrategien). Kjør:
`node train/tren.ts 500000` (antall iterasjoner som argument).

---

## 6. Integrer og valider

**Integrasjon:** last politikken i en ny budstrategi. Legg til i `BotOpts` et
felt `budPolitikk?: Record<string, Record<string, number>>` og i `velgBud`:

```ts
if (opts.budPolitikk) {
  const key = infosetKey(spiller, state);         // samme funksjon som i trening
  const dist = opts.budPolitikk[key];
  if (dist) return { type:"BUD", spiller, bud: velgFra(dist, rng) }; // sample el. argmax
  // fallback: eksisterende EV-logikk
}
```

Sampling fra fordelingen gir ekte (uutnyttbar) likevektsspilling; `argmax` gir
deterministisk, litt mer utnyttbart spill.

**Valider (avgjørende):** A/B **CFR-budgiver mot den nåværende EV-budgiveren**,
hode mot hode, i fulle kamper – ikke mot den svake heuristikken. Gjenbruk
mønsteret fra `examples/turnering.ts`: plasser 0,2 = CFR, 1,3 = EV, bytt hver
kamp, mål ±poeng/kamp over ≥ 50 kamper. Behold CFR bare hvis den vinner klart.

Forventning: gevinsten viser seg mest **mot sterke/varierte motstandere**
(robusthet), siden EV-budet allerede er nær optimalt for symmetrisk ±2n-scoring.
Ikke bli overrasket om gevinsten er liten – da er læringen at EV-budet var bra.

---

## 7. Fallgruver

- **Treg terminal** dreper treningen. Bruk `terskel: 4` + `nodeTak` under
  trening; hev til 7–8 kun for sluttvalidering. Forhåndsregn `T_w` per giv.
- **For fin abstraksjon** = treg/ustabil konvergens. Start grovt.
- **Samme infoset-funksjon** i trening og i `velgBud` – ellers spiller boten på
  en politikk den ikke ble trent for.
- **Fler-spiller-CFR** kan svinge; bruk gjennomsnittsstrategien (ikke den
  momentane), og vurder CFR+ (nullstill negative regrets) for raskere/roligere
  konvergens.
- **Talong-avhengighet**: hånden ved bud (12 kort) er svakere enn etter bytte.
  Orakelet MÅ modellere at vinneren tar talongen (§2), ellers underestimerer du.

---

## 8. Senere utvidelser

- Legg til Amerikaner/Solo i handlingsrommet (egne utbetalingsrater).
- Finere hånd- og historikk-abstraksjon; eller bytt tabell → lite nevralt nett
  (**Deep CFR**) om tilstandsrommet vokser.
- Motstander-inferens i kortspillet krever egentlig samme maskineri (ISMCTS/
  CFR på stikk) – separat, større prosjekt.

---

### Byggeklosser som allerede finnes i motoren

| Trenger | Bruk |
|---|---|
| Stokk + seedbar RNG | `nyStokk`, `stokk`, `lagRng` |
| Kort ↔ heltall | `kortTilInt`, `intTilKort` |
| Rask stikk-verdi | `evaluerHybrid(o, terskel, nodeTak)` |
| Eksakt fasit (validering) | `løsDD(o)` |
| Poengsatser | `beregnPoeng(...)` (eller de enkle formlene i §2) |
| Budrangering/regler | `MINSTE_TALLBUD`, `budRang`, `erHøyereBud` |

Start med §2 (orakelet) – når det er testet og raskt, er resten standard CFR.
```
