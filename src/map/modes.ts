export type MapMode = 'city' | 'skeleton'

/**
 * The one style layer skeleton mode keeps. Recoloured dark, it is the ground the
 * network floats over.
 */
export const GROUND_LAYER = 'background'

/** A layer as the style hands it to us. Only the two fields we care about. */
interface StyleLayer {
  id: string
  layout?: { visibility?: unknown }
}

/**
 * What every style layer's `visibility` should be in a given mode.
 *
 * Skeleton hides everything but the ground, so a layer liberty adds later is
 * hidden by default rather than leaking through. City restores each layer's own
 * original visibility rather than forcing `visible`, so a layer the style ships
 * switched off stays off after a round trip.
 *
 * Pass the layers captured when the style loaded, not the live ones: the live
 * ones carry whatever this function last set, and the originals would be lost.
 */
export function layerVisibility(
  layers: readonly StyleLayer[],
  mode: MapMode,
): { id: string; visibility: 'visible' | 'none' }[] {
  return layers.map((layer) => ({
    id: layer.id,
    visibility:
      mode === 'skeleton' && layer.id !== GROUND_LAYER
        ? 'none'
        : layer.layout?.visibility === 'none'
          ? 'none'
          : 'visible',
  }))
}
