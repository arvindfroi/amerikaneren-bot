# Stedfortrederen rekalibrert — og stigen har ikke noe trinn der menneskene står

**1. september 2026.** Kilde for menneskeraden: Val Town-valen
`arvindfroi/amerikaneren-data`, `type='kamp'`. Kilde for botradene:
`examples/kamp.ts --uparret`, 800 kamper per arm, `--froe 810000000`, miljøet er
`ADAMS` (den utrullede speken, `src/moe2/agentspek.ts:72`). Rådata i
`analyse/stedfortreder-*.jsonl`.

---

## Hvorfor denne målingen ble gjort

`docs/plan.md` §41 innførte en **menneske-ekvivalent stedfortreder**: finn en bot
som vinner like ofte mot Adams som menneskene gjør, og bruk den til å måle K1
tett. Den ble kalibrert mot **15,8 %** — familiens andel i 19 kamper mot
før-v5-linja, 1.–4. august.

Med 78 ferdigspilte kamper mot Adams-v5 er menneskenes andel **32,1 %**
(KI 22,7–43,0). Kalibreringen hviler altså på et tall som er motsagt, og hele
stigen måtte måles på nytt mot den boten som faktisk står ute.

## Stigen, målt mot dagens utrullede Adams-v5

| stedfortreder-kandidat | n | vant | andel | 95 %-KI | snittmargin |
|---|---|---|---|---|---|
| nevro (NevroHjerne) | 800 | 28 | **3,5 %** | 2,4–5,0 | −70,8 |
| d7alle bart (bare kortnettet) | 800 | 54 | **6,8 %** | 5,2–8,7 | −56,8 |
| ftf1 (eldre nett) | 800 | 55 | **6,9 %** | 5,3–8,8 | −58,4 |
| Adams uten budmodell | 800 | 57 | **7,1 %** | 5,5–9,1 | −55,9 |
| Adams uten vrakrangerer | 800 | 183 | **22,9 %** | 20,1–25,9 | −42,4 |
| **KONTROLL: Adams-v5 mot seg selv** | 800 | 202 | **25,3 %** | 22,4–28,4 | −39,5 |
| **MENNESKENE mot v5** (ekte kamper) | **78** | **25** | **32,1 %** | **22,7–43,0** | — |
| **KRAVET K1** | | | **< 5,0 %** | | |

**Kontrollarmen måler 25,3 % med KI 22,4–28,4.** Den omslutter 0,2500, slik
`AdamsMax.md` krever av K1-benken. Uten den er ingen av de andre radene gyldige.

---

## Funn 1: menneskene kan ikke skilles fra en fjerde Adams-v5

Menneskenes intervall (22,7–43,0) inneholder kontrollarmens punktestimat
(25,3 %), og de to intervallene overlapper. **På dagens datagrunnlag er
menneskene statistisk umulige å skille fra enda en kopi av Adams-v5 selv.**

Det snur premisset stigen ble bygget på. §41 skrev:

> Menneskene ligger på 15,8 %, altså SVAKERE enn Adams-v3. Stedfortrederen skal
> finnes mellom nevro og v3.

Menneskene er ikke svakere enn Adams. De ligger på eller over selvspill-linja.

**Konsekvens: det finnes ingen stedfortreder å velge.** Alt under kontrollarmen
faller enten helt ned til 3,5–7,1 % eller ligger på 22,9 %, og ingenting sitter
i mellom. Nærmeste trinn under menneskene er «Adams uten vrakrangerer» (22,9 %);
nærmeste treff i det hele tatt er Adams-v5 selv.

Til K1 må derfor **Adams-v5 selv** brukes som menneske-ekvivalent inntil
menneskedataene er tykke nok til noe bedre. Den gamle stedfortrederen på 15,83 %
er ikke bare feilkalibrert — den ligger i et område av stigen der ingen bot og
ingen målt menneskeandel befinner seg.

## Funn 2: hele stakkens styrke ligger i budmodellen

Ablasjonene skiller seg skarpt i to grupper:

    uten budmodell    7,1 %      (−18,2 pp fra kontroll)
    uten vrakrangerer 22,9 %     (−2,4 pp fra kontroll)

Å ta bort budmodellen kollapser boten til omtrent nivået til det bare
kortnettet (6,8 %) og det gamle ftf1 (6,9 %). Å ta bort vrakrangereren koster
2,4 pp.

Dette er en **uavhengig replikasjon** av `docs/krav-status.md` §K3, som har
`budm` til **+0,8116 (5,4 SE) — 72 % av alt stakken tilfører**, målt på
rundedifferanse. Her er den samme rangeringen målt på kamper til 100 poeng, som
er det K1 faktisk er formulert som. To ulike benker, samme svar.

Det bekrefter også rekkefølgen Arvind har holdt på: budrunden er det store
vinduet. Men merk retningen — budmodellen er det som **bærer** boten i dag, og
K3 sier samtidig at 41,8 % av budtaket fortsatt står igjen.

## Funn 3: avstanden til K1 er større enn «10,8 prosentpoeng»

`AdamsMax.md` har regnet avstanden som 15,83 % → 5,0 %. Målt mot mennesker er
den 32,1 % → 5,0 %, og målt mot kontrollarmen 25,3 % → 5,0 %.

Kravet ber altså om at Adams skal slå et menneske **omtrent så klart som han i
dag slår NevroHjerne** (3,5 %). Det er ikke en finjustering av dagens stakk.

---

## Forbehold

1. **Fullføringsskjevhet i menneskeraden.** Bare 78 av 248 startede v5-kamper
   ble fullført, og av de forlatte med ≥ 8 spilte runder (n=56) lå mennesket bak
   i 84 %. 32,1 % er et **tak**, ikke et punktanslag. Den ekte andelen er trolig
   lavere — muligens nær kontrollarmens 25,3 %, som ikke endrer funn 1.
2. **Setet roterer på benken, ikke på nettsidene.** `--uparret` flytter
   kandidaten gjennom sete 0–3; mennesket sitter alltid i sete 0. Giverrotasjon
   kan gi en liten forskjell som ikke er målt her.
3. **n=78 er fortsatt tynt.** Intervallet er 20 prosentpoeng bredt. Funn 1 sier
   «kan ikke skilles», ikke «er lik».
4. **Ablasjonene er ikke en fullstendig stige.** De er de fire naturlige
   avskrellingene av dagens spek, ikke en søkt serie av jevnt fordelte
   styrkenivåer.

## Reproduksjon

```bash
npm run vekter                      # pakker ut e1-modell/ fra web/dist/*.b64
A="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin"
node examples/kamp.ts --kandidat "$A"    --miljo "$A" --kamper 800 --uparret \
  --froe 810000000 --ut analyse/stedfortreder-kontroll.jsonl
node examples/kamp.ts --kandidat "nevro" --miljo "$A" --kamper 800 --uparret \
  --froe 810000000 --ut analyse/stedfortreder-nevro.jsonl
# ...osv for de fire andre armene; kandidatspekene står i tabellen over.
```

Andelen er `mean(kandVant)` over radene, med Wilson-intervall.
