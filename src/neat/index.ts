/**
 * NEAT-pakka: nevroevolusjon (NeuroEvolution of Augmenting Topologies) for
 * Amerikaner. Se docs/neat.md for helheten.
 *
 * - genom.ts: gener, innovasjonsnumre, mutasjon, kryssing, artsavstand
 * - nett.ts: kjørbart nett med vilkårlig topologi (alle nevroner beregnes)
 * - trekk.ts: spillerVisning → inngangsvektor (kun lovlig informasjon)
 * - agent.ts: NeatAgent – byr etter xT, vraker/velger/spiller etter netthodene
 * - turnering.ts: flakskontrollert cup i grupper på 4 + regret + fitness
 * - evolusjon.ts: artsdeling, seleksjon og avl generasjon for generasjon
 */

export * from "./genom.ts";
export * from "./nett.ts";
export * from "./trekk.ts";
export * from "./agent.ts";
export * from "./turnering.ts";
export * from "./evolusjon.ts";
