/**
 * Web Worker for Adams med søk i førersetet.
 *
 * Søket koster hundrevis av millisekunder til sekunder per kort NÅR BOTEN ER
 * SPILLEFØRER. På hovedtråden ville det frosset UI-et — ikke tregt, men umulig å
 * skille fra en krasj. Derfor bor søket her: hovedtråden spør, workeren svarer,
 * og siden svarer på klikk hele veien.
 *
 * All logikk ligger i `web/sokekjerne.ts`, der prøvene når den. Denne fila er
 * bare limet mot `self`.
 *
 * PIMC-EN ER BORTE. Her lå `BotAgent` med pondering («init», «pondre»,
 * «beslutt») for en motstander som er fjernet fra appen. Ingen kallsti i
 * `web/app.ts` nådde den lenger, og det var nettopp den grenen den gamle
 * workeren falt gjennom til når den fikk en melding den ikke kjente.
 */

import { lagSøkekjerne, type FraWorker, type TilWorker } from "./sokekjerne.ts";

const post = (m: FraWorker): void => (self as unknown as Worker).postMessage(m);
const håndter = lagSøkekjerne(post);

self.onmessage = (e: MessageEvent<TilWorker>) => håndter(e.data);
