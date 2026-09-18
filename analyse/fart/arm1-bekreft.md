# Bekreftelse av arm1 (192 verdener) mot S1 — friske giv, forhåndsregistrert

Skrevet 18. sep FØR kjøring. Gren `fart-2026-09-17` i `D:\amb-fart`. Driveren skriver resultatet selv til
`D:\amb-grp\loop\arm1-bekreft-resultat.md`; denne fila er planen og røres ikke av driveren.

## Hvorfor
`fart-k1-v5-resultat.md` ga arm1 − S1 = +0,031 ± 0,150 på porten (kampsett utvalg), men +0,213 ± 0,113 på
alle kamper og +0,446 ± 0,165 på holdout. De ni tallene der deler de samme 2 641 rundene, så et av dem kan
være stort av ren støy. Denne målingen deler ingen støy med dem: **friske giv, ikke menneskekorpuset**.

## Oppsettet
- `examples/fart-friskgiv.ts`: fersk kamp per giv (poengtavle 0–0–0–0), **én runde** spilt fullt ut,
  armen i sete 0 og **v5-kjeden** (`vr:vrakrang:telrd:budm:bud-menneske@-3.0:vakt:abmp:e1:d7alle`) i de tre andre.
- Begge armene spiller **nøyaktig samme giv** mot samme motstand; paret er given, og rekkefølgen byttes
  annenhver giv. Egen agentinstans per arm per giv, så hukommelse ikke lekker.
- Mål: **100·ΔP(seier) for sete 0**, samme definisjon og samme `seier-g0.bin` som K1-duplikatet
  (`P(vinner | tavla etter runden) − P(vinner | 0–0–0–0)`, motorens vinnerregel når kampen er avgjort).
- Nettene er **loop-15** (appens). Armene skiller seg bare i verdensfeltet: `192k32e3` mot `48k32e3`,
  begge med `~ekv=1~topp=0.1~flat=8`.
- 12 000 giv, 3 skarder, BelowNormal, startet frakoblet via WMI. Treningskjeden har førsteprioritet.

## Frøbånd (hygiene)
**1 777 000 000–1 777 011 999.** Kontrollert disjunkt fra:
- **K1-korpuset:** de 575 kampfrøene i `D:\amb-grp\menneske\hendelser.jsonl` (min 16 579 432, maks
  4 293 081 417) har ingen frø i båndet.
- **Repoets frø:** ingen av frøkonstantene i `examples/`, `verktoy/`, `docs/` ligger i båndet (nærmeste
  i bruk: 1 250 000 000 og 1 000 000 000).
- **Løkkas kalibreringsdata:** de 7 unike 17xxxxxxxx-frøene i `D:\amb-loop\maal-d7-2\dd-kalibrering.json`
  ligger utenfor båndet.

## Regel (skrevet før kjøring)
**arm1 tas i bruk hvis arm1 − S1 ≥ +0,15 pp OG z > +1,96.** Ellers er den ikke bekreftet.
Tegntest over de givene der armene skilte lag rapporteres ved siden av (tunge haler), men avgjør ikke.
Krav: ≥ 10 000 par, ingen NaN, ingen dupliserte giv.

## Spådom
SE ≈ 0,05 pp ved 12 000 giv (målt spredning i røyktesten tilsier SD ≈ 5–6 pp per giv).
**Jeg spår arm1 − S1 mellom −0,05 og +0,10, altså IKKE bekreftet** — holdout-utslaget på +0,45 var
sannsynligvis støy i ett av ni tall. Armene skiller lag i ~20–25 % av givene.

---

# UTFALL (ferdig 18. sep 01:50 maskintid) — `arm1-bekreft-resultat.md`

12 000 parrede giv, ingen feil, ingen NaN, ingen dupliserte giv. Skardene tok ~7 t hver (de startet først
kl. 18:31 maskintid, etter at driveren hadde ventet på at treningskjeden ga fra seg maskinen).

| mål | verdi |
|---|---|
| **arm1 − S1, 100·ΔP(seier) per runde** | **+0,135 ± 0,037 pp, z +3,63** |
| arm1 − S1, rundepoeng | +0,099 ± 0,065, z +1,53 |
| giv der armene skilte lag | 3 936 av 12 000 (32,8 %) |
| tegntest på de givene | arm1 bedre i 2 066, verre i 1 870, z +3,12 |

## DOM etter regelen: **ikke bekreftet** (+0,135 < +0,15)

Men dette er en **knapp** avvisning, og det viktigste funnet er ikke «nei», det er **hvor presist tallet nå er**:

1. **Effekten er ekte, men liten.** z = +3,63 med SE 0,037 og en uavhengig tegntest som peker samme vei.
   192 verdener spiller *litt* bedre enn 48 — omtrent **+0,14 pp ΔP(seier) per runde**. Det er første gang
   dette prosjektet har målt en gevinst av flere verdener som ikke drukner i støy.
2. **Terskelen ble satt til +0,15, og tallet havnet rett under.** Regelen ble skrevet før kjøringen og følges.
   Avstanden til terskelen (0,015) er under halvparten av én SE, så «over» og «under» skilles ikke her —
   det som er avgjort er at effekten er **liten**, ikke at den er null.
3. **Holdout-utslaget fra K1 var støy.** Der sto arm1 − S1 = +0,446 ± 0,165; her, på 12 000 friske giv,
   er svaret +0,135 ± 0,037. Forbeholdet jeg tok i `fart-k1-v5.md` §3 var altså berettiget.
4. **Spådommen bommet litt:** jeg spådde −0,05 til +0,10 og «ikke bekreftet». Dommen traff, intervallet ikke
   (fasit +0,135). Spådd 20–25 % giv der armene skiller lag; målt 32,8 %.

## Hva det betyr for prisen
arm1 koster **3,85×** S1 per kortvalg (~65 ms median i appen mot 17 ms) for **+0,14 pp per runde**.
Til sammenlikning er hele S1-botens forsprang på mennesket +1,22 ± 0,23 pp per runde, så 4× regnetid kjøper
drøyt en tiendedel av det forspranget. Det er eierens avgjørelse om det er verdt det; regelen som ble avtalt
sier nei, og jeg har ikke tatt den i bruk.
