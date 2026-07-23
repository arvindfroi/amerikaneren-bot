/**
 * Web Worker for PIMC-boten: lange tenketider (opptil minutter ved MAKS-
 * styrke) uten å fryse UI-tråden. Mottar {id, state, opts}, svarer
 * {id, handling} – GameState og Handling er rene data og kan postes.
 */
import { velgHandling } from "../src/bot/bot.ts";

self.onmessage = (e: MessageEvent<{ id: number; state: never; opts: never }>) => {
  const { id, state, opts } = e.data;
  try {
    const handling = velgHandling(state, opts);
    (self as unknown as Worker).postMessage({ id, handling });
  } catch (feil) {
    (self as unknown as Worker).postMessage({ id, feil: String(feil) });
  }
};
