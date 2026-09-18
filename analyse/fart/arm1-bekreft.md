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
