# Lokal langtidstrening (Lenovo Legion Pro 7i / kraftig maskin)

Denne guiden flytter NEAT-treningen fra sky-containeren (som resirkuleres
med jevne mellomrom) til din egen maskin, der den kan kjøre uavbrutt og
utnytte alle kjernene.

## Ærlig om maskinvaren

- **Core Ultra 9**: dette er gullet her. Treningen er CPU-bundet og
  parallelliseres over kjernene via arbeidstråder. Flere kjerner = flere
  gruppekamper i parallell = raskere generasjoner. `lokal-tren.sh`
  auto-detekterer kjernene og setter trådtallet.
- **RTX 5080 mobile**: hjelper **ikke** i dagens kode. Nettene er bittesmå
  (hundrevis av noder) og evalueres i ren TypeScript på CPU – en GPU-runde
  ville tapt mer på overhead enn den vant. GPU blir først relevant om vi
  senere bytter til store batch-evaluerte nett (planlagt, ikke nå).
- **RAM**: hver linje bruker ~1–2 GB. Rikelig på en Legion.

## Oppsett (én gang)

```bash
git clone https://github.com/arvindfroi/amerikaneren-bot
cd amerikaneren-bot
git checkout claude/amerikaneren-ai-neat-80stom   # utviklingsgrenen
npm ci                                             # installer avhengigheter
```

Krever **Node 22+** (`node --version`). Last ned fra nodejs.org om nødvendig.

### Gjenoppta skyens framgang (anbefalt)

Sky-treningen er lagret som et øyeblikksbilde på grenen `trening-snapshot`.
Hent og pakk ut, så fortsetter du der skyen slapp (gull C4 +51.9, D1 +50.8,
297-koding):

```bash
git fetch origin trening-snapshot
git show origin/trening-snapshot:trening-c4.tar.gz > /tmp/c4.tar.gz && tar xzf /tmp/c4.tar.gz
git show origin/trening-snapshot:trening-d1.tar.gz > /tmp/d1.tar.gz && tar xzf /tmp/d1.tar.gz
```

Hopper du over dette, starter treningen friskt fra `start.json` (mister
skyens gull, men koden og sensorene er de samme).

Øyeblikksbildet inneholder befolkning, gull og mester – men ikke
generasjonstelleren eller loggene. Skriv derfor en `status.json` per linje
med generasjonen skyen hadde nådd, så teller loggen videre i stedet for å
begynne på null:

```bash
node -e 'require("fs").writeFileSync("trening-c4/status.json",JSON.stringify({generasjon:1649,tidsstempel:Date.now(),sisteBenk:"overtatt fra sky"}))'
node -e 'require("fs").writeFileSync("trening-d1/status.json",JSON.stringify({generasjon:399,tidsstempel:Date.now(),sisteBenk:"overtatt fra sky"}))'
```

Selve kurven fra skyperioden ligger frosset i `trening-historikk.json` (hentet
fra sidens egen `data.json`), og `neat-graf.ts` legger de lokale målingene
oppå den. Derfor er grafen sammenhengende selv om skyloggene ble igjen i
containeren.

## Fremgangsgrafen

Supervisoren kjører `node examples/neat-graf.ts --pages` hvert 2. minutt.
Den vedlikeholder en git-worktree på grenen `gh-pages` (søskenmappa
`../amerikaneren-pages`), skriver `data.json` + `index.html` og pusher.
Krever at `git push` virker uten passordledetekst – på Windows ordner
`gh auth setup-git` det (GitHub CLI som legitimasjonshjelper).

Taper vi kappløpet mot en annen publisist (f.eks. en sky-container som
fortsatt kjører), hentes deres commit, filene skrives på nytt og pushen
prøves igjen – opptil tre ganger. **Men to samtidige publisister får grafen
til å hoppe fram og tilbake mellom to virkelighetsbilder: stopp skyens
graf-puls når treningen er flyttet lokalt.**

## Kjør

### Windows (PowerShell) – anbefalt på Legion-en

```powershell
.\verktoy\start-trening.ps1                        # auto-kjerner, populasjon 128
.\verktoy\start-trening.ps1 -Populasjon 192        # større populasjon
.\verktoy\start-trening.ps1 -Traader 8             # færre tråder per linje
.\verktoy\start-trening.ps1 -UtenGraf              # tren uten å publisere grafen

.\verktoy\status-trening.ps1                       # prosesser, generasjon, benk, siste push
.\verktoy\stopp-trening.ps1                        # pen stopp (STOPP-fil)
.\verktoy\stopp-trening.ps1 -Hardt                 # nødbrems
```

Treningen løsrives fra terminalen, så den fortsetter når vinduet lukkes.
Alt kjører **native på Windows** – ingen WSL nødvendig.

### Linux / macOS

```bash
node examples/lokal-tren.ts          # samme supervisor, kryssplattform
POPP=160 TRAADER=10 node examples/lokal-tren.ts
bash examples/lokal-tren.sh          # eldre bash-variant (nohup/pgrep)
```

Supervisoren starter **begge** linjer (C4 og D1), fordeler kjernene mellom
dem, relanserer en linje som skulle krasje, og pusher fremgangsgrafen til
GitHub Pages hvert 2. minutt. Treningen tåler at maskinen sover eller
starter på nytt – befolkningen lagres hver 5. generasjon, og et nytt kjør
gjenopptar automatisk fra `trening-*/befolkning.json`.

Tre lag med feilsikring: treneren lagrer atomisk hver 5. generasjon →
`neat-vakt.ts` starter treneren om ved krasj og heng (hjerteslag i
`status.json`) → supervisoren starter vakten om hvis den selv dør.

### Følg med

Grafen er den enkleste: **<https://arvindfroi.github.io/amerikaneren-bot/>**
oppdateres hvert 2. minutt fra din egen maskin (siden viser hvilken maskin
som trener, og et loddrett merke der treningen flyttet fra sky til lokalt).

```bash
tail -f trening-c4.log            # C4-generasjoner + benk
tail -f trening-d1.log            # D1
tail -f lokal-tren.log            # supervisoren: omstarter + publiseringer
node examples/neat-budstat.ts trening-d1/mester.json   # bud/innfrielse/overskudd
node examples/neat-forklar.ts trening-d1 999999 0      # R²/sensorbruk
```

## Lever framgangen tilbake

For å oppdatere skyens graf / dele resultatet, dytt et nytt øyeblikksbilde:

```bash
tar czf /tmp/c4.tar.gz trening-c4/befolkning.json trening-c4/gull.json trening-c4/start.json trening-c4/mester.json
tar czf /tmp/d1.tar.gz trening-d1/befolkning.json trening-d1/gull.json trening-d1/start.json trening-d1/mester.json
# så: legg dem på trening-snapshot-grenen (se scratchpad-skriptet eller be Claude gjøre det)
```

Eller bare del `trening-*/gull.json` (104 KB) – det er linjens beste genom.

## Hvor mye raskere?

Sky-containeren gir 2 tråder. En Core Ultra 9 med ~14 brukbare tråder kjører
grovt **5–7× flere gruppekamper i sekundet**, og uten container-restarter
mister du ikke 5 generasjoner + nedetid hver time. I praksis: fra ~hundre
generasjoner i timen til mange hundre, døgnet rundt.
