# Tasks

## 1. The keep-left offset

- [x] 1.1 Write a pure helper that, given a `Point` from `pointAt`, a line's `origin`, and a distance
      in metres, returns the position offset to the **left** of the direction of travel:
      `left = (−cos B, +sin B)` in (east, north), converted to degrees with `origin.kx` / `origin.ky`
      and never with haversine. Note the latitude sign is `+`.
- [x] 1.2 **Test the sign**, because nothing else can catch it: a train at bearing 0 must land west
      of the centre line, and a train at bearing 90 must land north of it. Getting this backwards
      moves both directions symmetrically and still looks plausible.

## 2. Size from the camera

- [x] 2.1 Write a pure helper returning the train half-width `W` in metres from the current zoom and
      latitude: `mpp = 156543.03392 * cos(lat) / 2 ** zoom`, then
      `W = clamp(3.05 * mpp, 4, 420)`. Verify with a test that `W` floors at 4 m when zoomed in and
      grows with zoom-out.
- [x] 2.2 Derive the box dimensions from `W` as the prototype does — body `2W` wide, `1.7W` tall,
      `10W` long — so the on-screen size stays roughly constant while the camera is far, and becomes
      a fixed real-world size when close. Record the numbers chosen.

## 3. Drawing a train

- [x] 3.1 Build the four corner coordinates of a train's footprint from its keep-left position, its
      bearing and `W`: nose and tail along the bearing, sides along the left normal. Verify with a
      test that the footprint is the expected size and oriented along the bearing.
- [x] 3.2 Draw the body as a `SolidPolygonLayer` with `extruded: true`, in a neutral colour, at
      viaduct height. Verify by eye.
- [x] 3.3 Draw the roof as a second `SolidPolygonLayer`, slightly narrower and shorter, sitting on
      top of the body, in the line's colour. Precompute the line colours once — do not call
      `hexToRgb` per train per frame. Verify by eye that each train carries its line's colour.

## 4. The animation loop

- [x] 4.1 Add a mutable clock record in `src/map` (NOT `src/sim`, whose purity test fails the build
      on mutable state or `Date.now()`), holding the simulated epoch and the day-type override.
- [x] 4.2 Add a `requestAnimationFrame` loop that re-arms **first**, clamps its delta to 250 ms,
      advances the clock, calls `klNow` then `activeTrains`, and calls `overlay.setProps` directly.
      No React state. Verify trains move on screen.
- [x] 4.3 Hold the static network layers in a ref, built once, and pass the **same instances** back
      each frame so deck.gl knows they are unchanged. Verify the path layer is not re-tessellated
      per frame.
- [x] 4.4 Cancel the frame in the same cleanup that removes the map, or React's development
      double-mount leaves two loops racing on one overlay. Tolerate a null overlay — it is
      legitimately absent without WebGL2 or when no label layer was found.

## 5. Stations that fill

- [x] 5.1 Change the station layer from `filled: false` to `filled: true` with a fill colour that is
      transparent when idle and the line's colour when busy. `filled` is layer-level and cannot be
      set per marker. Transparent, not a background colour — there is a real map underneath.
- [x] 5.2 Resolve a dwelling train to its marker **by stop id**, not by index: `train.stop` indexes
      that direction's list, and direction 1's is the reverse of direction 0's, which the markers are
      built from. Build the id-to-index map once. Verify with a test that a direction-1 dwelling
      train resolves to the same marker as the direction-0 train at that station.
- [x] 5.3 Gate on `train.dwelling`. The simulation reports the stop a moving train is *heading for*
      as well as the one a stopped train is at; without the guard every station lights up
      permanently. Verify with a test that a moving train marks nothing busy.
- [x] 5.4 Bump `updateTriggers` when the busy set changes, or deck.gl will never notice a mutation
      inside a stable data array. Do not bump it when nothing changed.

## 6. Close out

- [x] 6.1 Run `npm test` and `npm run build`; both must pass with the existing 71 tests green.
- [x] 6.2 Add the track-height limitation to the app's explanation of its data: the feed carries no
      elevated-or-underground information, and a height has been assumed. An assumption stated is a
      limitation; an assumption hidden is a lie.
- [ ] 6.3 **Look at it in a browser** — zoom into Pasar Seni and watch a train pull in, pause and
      leave; check trains keep left on a shared stretch; check both map views. Not done until a
      human has seen it.
- [x] 6.4 Update `CLAUDE.md`'s Status, and open a pull request referencing issue #14 with
      `Closes #14`.
