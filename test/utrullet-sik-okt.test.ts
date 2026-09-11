/**
 * APPENS BYGGER KAN NÅ VÆRE DEN HELE BOTEN — `sik:alle…L` med hukommelsen (11. sep).
 *
 * `byggUtrullet` kunne bare bygge `sik:foerer`: rollen var hardkodet, lagmålet fantes
 * ikke, og økta ble aldri gitt til søket. Kjeden den hele boten måles med,
 *
 *     okt:vr:…:eks:…:profil:sik:alle:…L…:budq:…:vakt:abmp:e1:…
 *
 * hadde altså ingen vei ut i appen. Og det var verre enn det så ut: byggeren satte aldri
 * atferdsmodellen på økta, så med `økt: true` var hukommelsen STUM i appen mens den var
 * levende i speken. Paritetsprøvene for `amu:` merket ingenting, fordi de verken viser
 * agentene `RUNDE_SLUTT` eller kommer forbi `MIN_RUNDER` — boka var tom på begge sider.
 *
 * Denne fila driver begge veier slik en ekte driver gjør (`observer` på HVER tilstand,
 * også `RUNDE_SLUTT`), med en PLANTET stil i økta så hukommelsen faktisk vrir
 * utspillingene. Og den har en kontrollarm uten «M», som må skille seg — ellers er
 * likheten bare to stumme hukommelser som er enige.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { opprettSpill, utfør } from "../src/index.ts";
import type { GameState } from "../src/motor.ts";
import { nettFraBytes } from "../src/nevro/nett.ts";
import { E1Agent } from "../src/e1/agent.ts";
import { tolkBudmodell } from "../src/moe2/budmodell.ts";
import { lagIndre } from "../src/moe2/agentspek.ts";
import { Økt } from "../src/moe2/okt.ts";
import { byggUtrullet, type Søkspek, type UtrulletSpek, type Velger } from "../src/moe2/utrullet.ts";
import { byggAdams, børSøke, søkspek, type AdamsKonfig } from "../web/adamskjede.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";

const KORTFIL = "e1-modell/d7alle.bin";
const kortBytes = new Uint8Array(readFileSync(KORTFIL));
const vrakBytes = new Uint8Array(readFileSync("e1-modell/vrakrang.bin"));
const budJson: unknown = JSON.parse(readFileSync("e1-modell/bud-vant.json", "utf8"));

const SPEK =
  "okt:vr:e1-modell/vrakrang.bin:telrd:profil:sik:alle:0.5:4LMD:" +
  "budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin";

const SØK: Søkspek = { type: "sik", verdener: 4, sigma: 0.5, roller: [], lagmål: true, brukØkt: true, visningsfrø: true };

const grunnlag = (søk: Søkspek | null, ekstra: Partial<UtrulletSpek> = {}): UtrulletSpek => ({
  kortnett: nettFraBytes(kortBytes)[0]!,
  kort: E1Agent.fraBytes(kortBytes),
  vaktflagg: "abmp",
  bud: tolkBudmodell(budJson),
  budterskel: -3.0,
  vraknett: nettFraBytes(vrakBytes)[0]!,
  vrakflagg: "telrd",
  søk,
  ...ekstra,
});

/** Samme plantede stil i hver økt: partallsseter spiller høyt, oddetallsseter lavt. */
const plant = (ø: Økt): Økt => {
  ø.stilvri = (sete: number): number => (sete % 2 === 0 ? 0.6 : -0.6);
  return ø;
};

test("byggeren gir økta nettets atferdsmodell, som speken gjør i «e1:»", () => {
  const bygd = byggUtrullet(grunnlag(SØK, { økt: true, profilOverSøk: true }));
  assert.ok(bygd.økt !== null && bygd.økt.bok.harAtferd(), "byggerens økt har ingen atferdsmodell – hukommelsen er stum");
  const spekØkt = new Økt();
  lagIndre(SPEK, { økt: spekØkt });
  assert.ok(spekØkt.bok.harAtferd());
  let s: GameState = opprettSpill({ antallSpillere: 4 }, 61_300_001);
  const agent = lagIndre("vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin");
  let sjekket = 0;
  for (let vakt = 0; vakt < 400 && s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG"; vakt++) {
    if (s.fase === "SPILL" && s.iTur !== null) {
      assert.deepEqual(
        Array.from(bygd.økt.bok.atferdModell()!.logits(s, s.iTur)),
        Array.from(spekØkt.bok.atferdModell()!.logits(s, s.iTur)),
      );
      sjekket++;
    }
    s = utfør(s, agent.velgHandling(s)).state;
  }
  assert.ok(sjekket > 10);
});

test("byggeren kaster på brukØkt uten økt, og byggAdams på søkØkt uten økt", () => {
  assert.throws(() => byggUtrullet(grunnlag(SØK)), /brukØkt krever økt/);
  const k: AdamsKonfig = { vaktflagg: "abmp", vrakflagg: "telrd", budterskel: -3, verdener: 4, sigma: 0.5, søkØkt: true };
  assert.throws(() => byggAdams({ kort: "", bud: null, vrak: null }, k, true), /søkØkt krever økt/);
});

test("søkspek og børSøke: uten de nye feltene nøyaktig som før, med dem som speken", () => {
  const gammel: AdamsKonfig = { vaktflagg: "abmp", vrakflagg: "telrd", budterskel: -3, verdener: 24, sigma: 0.5 };
  assert.deepEqual(søkspek(gammel), { type: "sik", verdener: 24, sigma: 0.5 });
  assert.deepEqual(
    søkspek({ ...gammel, verdener: 4, søkRoller: [], søkLagmål: true, økt: true, søkØkt: true, visningsfrø: true }),
    SØK,
  );

  let s: GameState = opprettSpill({ antallSpillere: 4 }, 61_300_002);
  const agent = lagIndre("vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmp:e1:e1-modell/d7alle.bin");
  let spill = 0;
  let ikkeFører = 0;
  for (let vakt = 0; vakt < 400 && s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG"; vakt++) {
    const aktør = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (aktør === null || aktør === undefined) break;
    // STANDARDEN er den gamle regelen, ordrett.
    assert.equal(børSøke(s, aktør, 24), 24 > 0 && s.fase === "SPILL" && aktør === s.budvinner);
    assert.equal(børSøke(s, aktør, 24, ["foerer"]), børSøke(s, aktør, 24));
    assert.equal(børSøke(s, aktør, 24, []), s.fase === "SPILL");
    assert.equal(børSøke(s, aktør, 0, []), false);
    if (s.fase === "SPILL") {
      spill++;
      if (rolleFor(s, aktør) !== "foerer") {
        ikkeFører++;
        assert.equal(børSøke(s, aktør, 24, ["makker", "forsvar"]), true);
      }
    }
    s = utfør(s, agent.velgHandling(s)).state;
  }
  assert.ok(spill > 20 && ikkeFører > 10);
});

test("PARITET: byggeren og «okt:…:profil:sik:alle:0.5:4LMD:…» velger identisk med levende hukommelse", () => {
  const spek = [0, 1, 2, 3].map(() => lagIndre(SPEK, { økt: plant(new Økt()) }) as unknown as Velger);
  const bygde = [0, 1, 2, 3].map(() => {
    const b = byggUtrullet(grunnlag(SØK, { økt: true, profilOverSøk: true }));
    plant(b.økt!);
    return b;
  });
  // KONTROLLARMEN: samme kjede uten «M». Den spørres på hvert punkt, men driver ingenting.
  const kontroll = [0, 1, 2, 3].map(() => {
    const b = byggUtrullet(grunnlag({ ...SØK, brukØkt: false }, { økt: true, profilOverSøk: true }));
    plant(b.økt!);
    return b;
  });

  let s: GameState = opprettSpill({ antallSpillere: 4 }, 61_300_003);
  let valg = 0;
  let søk = 0;
  let skilte = 0;
  const alle: Velger[] = [...spek, ...bygde.map((b) => b.agent), ...kontroll.map((b) => b.agent)];
  for (let vakt = 0; vakt < 20_000 && s.fase !== "FERDIG" && s.rundeNr < 2; vakt++) {
    // Som en ekte driver: hver agent ser hver tilstand, også rundeslutten.
    for (const a of alle) a.observer?.(s);
    if (s.fase === "RUNDE_SLUTT") {
      s = utfør(s, { type: "NESTE" }).state;
      continue;
    }
    const iTur = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
    if (iTur === null || iTur === undefined) break;
    const ha = spek[iTur]!.velgHandling(s);
    const hb = bygde[iTur]!.agent.velgHandling(s);
    assert.deepEqual(hb, ha, `divergens i runde ${s.rundeNr}, fase ${s.fase}, sete ${iTur} etter ${valg} valg`);
    kontroll[iTur]!.agent.velgHandling(s);
    const σb = bygde[iTur]!.sik?.siste;
    const σk = kontroll[iTur]!.sik?.siste;
    if (σb !== null && σb !== undefined && σb.n > 0) {
      søk++;
      if (σb.sigma !== σk?.sigma) skilte++;
    }
    valg++;
    s = utfør(s, ha).state;
  }
  assert.ok(valg > 60, `for få valg sammenlignet (${valg})`);
  assert.ok(søk > 30, `for få søk (${søk}) – sik:alle ble ikke prøvd`);
  assert.ok(skilte > 0, "kontrollarmen uten «M» ga samme σ overalt – hukommelsen var stum, og likheten beviser ingenting");
});
