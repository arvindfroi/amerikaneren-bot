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

## Kjør

```bash
bash examples/lokal-tren.sh          # auto-kjerner, populasjon 128, begge linjer
bash examples/lokal-tren.sh 192      # større populasjon (mer mangfold, tregere gen)
POPP=160 TRAADER=10 bash examples/lokal-tren.sh   # full overstyring
```

Skriptet starter **begge** linjer (C4 og D1), fordeler kjernene mellom dem,
og har en innebygd babysitter som relanserer en linje som skulle krasje.
Treningen tåler at maskinen sover eller starter på nytt – befolkningen
lagres hver 5. generasjon, og et nytt kjør gjenopptar automatisk.

**Windows**: kjør i WSL2 (Ubuntu) eller Git Bash. Native PowerShell kan
starte linjene hver for seg med kommandoene inni `lokal-tren.sh`.

### Følg med

```bash
tail -f trening-c4.log            # C4-generasjoner + benk
tail -f trening-d1.log            # D1
node examples/neat-budstat.ts trening-d1/mester.json   # bud/innfrielse/overskudd
node examples/neat-forklar.ts trening-d1 999999 0      # R²/sensorbruk
```

Stopp med **Ctrl-C** (dreper begge linjer + babysitteren).

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
