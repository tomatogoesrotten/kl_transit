// What the camera needs to know about the rest of the interface.
//
// Plain arithmetic, kept here rather than inside MapView so that it has tests:
// everything else about the camera needs a real map in a real browser.

/**
 * The largest share of the viewport the panels are allowed to claim.
 *
 * Padding as tall as the viewport leaves the camera no box to centre anything
 * in, and on a phone held sideways the panels really can be most of the screen.
 * Half means a followed train sits in the middle of whatever is left over.
 */
const MAX_SHARE = 0.5

/**
 * Camera padding, in pixels, for the panels along the bottom of the viewport.
 *
 * MapLibre centres the map on the middle of what is left after the padding, so
 * telling it how tall the bottom panels are is exactly what stops a followed
 * train being centred behind them.
 *
 * `covered` is measured, never assumed: the time bar wraps at narrow widths,
 * the no-trains notice adds a whole row, and at phone width the card joins the
 * same column. Any number written here would be wrong for most of those.
 */
export function panelPadding(viewportHeight: number, covered: number): number {
  if (!(viewportHeight > 0)) return 0
  return Math.round(Math.max(0, Math.min(covered, viewportHeight * MAX_SHARE)))
}

/**
 * How close the map goes when it is sent to a station.
 *
 * 14 is where the base map starts extruding buildings, so arriving here puts
 * the station in the 3D city rather than on a flat plan of it.
 */
export const STATION_ZOOM = 14

/**
 * The zoom to arrive at, given where the viewer already is.
 *
 * Never pulls them back out. Somebody studying one platform from close up who
 * asks for another station wants to go there, not to leave the neighbourhood.
 */
export function arrivalZoom(current: number, target: number = STATION_ZOOM): number {
  return Math.max(current, target)
}
