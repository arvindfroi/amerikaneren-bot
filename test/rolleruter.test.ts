/**
 * ROLLERUTEREN — ett kortnett per rolle (11. sep). Fire ting må holde:
 *
 *   1. UTEN ROLLER er `e1r:<fil>` nøyaktig `e1:<fil>` — i alle faser, bit for bit.
 *   2. RUTINGEN: kortvalg i den navngitte rollen tas av det andre nettet, alle andre valg av
 *      standardnettet. Prøven bruker et nett som velger ANNERLEDES, så rutingen synes.
 *   3. K2: å bytte de andre setenes hender endrer ikke valget (rollen er setets egen).
 *   4. En ukjent rolle kastes.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, test } from "node:test";

import { opprettSpill, utfør, type GameState } from "../src/index.ts";
import { lagIndre, ADAMS } from "../src/moe2/agentspek.ts";
import { rolleFor } from "../src/moe2/rolleorakel.ts";
import { nettFraBytes, type NevroNett } from "../src/nevro/nett.ts";

const KORT = ADAMS.slice(ADAMS.lastIndexOf("e1:") + 3);
const KATALOG = "node_modules/.cache";
const OMVENDT = `${KATALOG}/e1-omvendt.bin`;

/** Appformatet `src/nevro/nett.ts` leser. */
const tilBytes = (n: NevroNett): Buffer => {
  const deler: Buffer[] = [];
  const i32 = (x: number): void => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(x);
    deler.push(b);
  };
  i32(1);
  i32(n.lag.length);
  for (const l of n.lag) {
    i32(l.inn);
    i32(l.ut);
    deler.push(Buffer.from(new Float32Array(l.vekter).buffer));
    deler.push(Buffer.from(new Float32Array(l.bias).buffer));
  }
  return Buffer.concat(deler);
};

// Et nett som velger ANNERLEDES: kortnettet med siste lag snudd, så det liker det
// standardnettet liker minst.
{
  const rå = nettFraBytes(new Uint8Array(readFileSync(KORT)))[0]!;
  const lag = rå.lag.map((l, i) =>
    i === rå.lag.length - 1
      ? { ...l, vekter: Float32Array.from(l.vekter, (x) => -x), bias: Float32Array.from(l.bias, (x) => -x) }
      : l,
  );
  mkdirSync(KATALOG, { recursive: true });
  writeFileSync(OMVENDT, tilBytes({ lag }));
}
after(() => rmSync(OMVENDT, { force: true }));

/** Spiller noen giv med Adams og samler hver tilstand der noen står for tur. */
function tilstander(frøer: readonly number[]): GameState[] {
  const ut: GameState[] = [];
  const agenter = [0, 1, 2, 3].map(() => lagIndre(ADAMS));
  for (const frø of frøer) {
    let s = opprettSpill({ antallSpillere: 4 }, frø);
    for (let vakt = 0; vakt < 400 && s.fase !== "RUNDE_SLUTT" && s.fase !== "FERDIG"; vakt++) {
      const sete = s.fase === "VRAK" || s.fase === "VELG" ? s.budvinner : s.iTur;
      if (sete === null || sete === undefined) break;
      ut.push(s);
      s = utfør(s, agenter[sete]!.velgHandling(s)).state;
    }
  }
  return ut;
}

const STILLINGER = tilstander([8_100_001, 8_100_002, 8_100_003, 8_100_004]);

test("uten roller er e1r nøyaktig e1, i alle faser", () => {
  const ruter = lagIndre(`vakt:abmp:e1r:${KORT}`);
  const vanlig = lagIndre(`vakt:abmp:e1:${KORT}`);
  let n = 0;
  for (const s of STILLINGER) {
    assert.deepEqual(ruter.velgHandling(s), vanlig.velgHandling(s), `fase ${s.fase}`);
    n++;
  }
  assert.ok(n > 100, `bare ${n} stillinger`);
});

test("makkerrollen rutes til det andre nettet, alt annet står", () => {
  const ruter = lagIndre(`vakt:abmp:e1r:${KORT}:makker=${OMVENDT}`);
  const vanlig = lagIndre(`vakt:abmp:e1:${KORT}`);
  const omvendt = lagIndre(`vakt:abmp:e1:${OMVENDT}`);
  let makker = 0;
  let andre = 0;
  let ulikeMakker = 0;
  for (const s of STILLINGER) {
    const h = ruter.velgHandling(s);
    const erMakker = s.fase === "SPILL" && s.iTur !== null && rolleFor(s, s.iTur) === "makker";
    if (erMakker) {
      assert.deepEqual(h, omvendt.velgHandling(s));
      if (JSON.stringify(h) !== JSON.stringify(vanlig.velgHandling(s))) ulikeMakker++;
      makker++;
    } else {
      assert.deepEqual(h, vanlig.velgHandling(s), `fase ${s.fase}`);
      andre++;
    }
  }
  assert.ok(makker > 5 && andre > 50, `for få valg: makker ${makker}, andre ${andre}`);
  assert.ok(ulikeMakker > 0, "det omvendte nettet valgte som standardnettet overalt — prøven ser ingenting");
});

test("K2: de andre setenes hender endrer ikke valget", () => {
  const ruter = lagIndre(`vakt:abmp:e1r:${KORT}:makker=${OMVENDT}`);
  let prøvd = 0;
  for (const s of STILLINGER) {
    if (s.fase !== "SPILL" || s.iTur === null) continue;
    const sete = s.iTur;
    const a = (sete + 1) % 4;
    const b = (sete + 2) % 4;
    if (s.hender[a]!.length !== s.hender[b]!.length) continue;
    const hender = s.hender.map((h) => [...h]);
    [hender[a], hender[b]] = [hender[b]!, hender[a]!];
    assert.deepEqual(ruter.velgHandling({ ...s, hender }), ruter.velgHandling(s));
    prøvd++;
  }
  assert.ok(prøvd > 20, `bare ${prøvd} stillinger prøvd`);
});

test("en ukjent rolle kastes", () => {
  assert.throws(() => lagIndre(`vakt:abmp:e1r:${KORT}:keeper=${OMVENDT}`), /rolle/);
});
