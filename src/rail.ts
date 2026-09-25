import { network, places, prepare } from './sim'

/**
 * The prepared network and its places, computed once for the whole app.
 *
 * Both the map and the lines panel need them. Computing them here, once, means
 * the panel does not prepare the network a second time, and the two can never
 * disagree about which places exist.
 */
export const rail = prepare(network)
export const PLACES = places(rail)
