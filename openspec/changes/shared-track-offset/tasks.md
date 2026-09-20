# Tasks

## 1. Find the shared corridors

- [x] 1.1 Write a pure function that indexes every line's path vertices by coordinate and returns,
      per line, the range of distance along it that is shared with another line, and which lines
      share it. Exact coordinate equality is enough — the 89 shared vertices are byte-identical.
      **No line ids hardcoded.** Verify with a test that Ampang and Sri Petaling are found, that
      their ranges are about 6,405–14,893 m and 28,762–37,250 m, and that no other pair is reported.
- [x] 1.2 Assign each line in a corridor a slot, ordered deterministically by line id, spread
      symmetrically about the true alignment. Verify with a test that the ordering is stable across
      calls — if it is not, the two lines swap sides between reloads.

## 2. The offset itself

- [x] 2.1 Write `offsetAt(lineId, atMetres)` returning the perpendicular offset in **slot units**,
      zero outside a corridor, tapering linearly to zero over a few hundred metres at an open end.
      Verify with tests: full offset in the middle of the corridor, zero outside it, and a taper
      that is monotonic and reaches exactly zero at the boundary.
- [x] 2.2 Convert slot units to metres for the current camera:
      `metres = pixels * 156543.03392 * cos(lat) / 2 ** zoom`. Reuse the relation already in
      `src/map/trains.ts` rather than writing a second copy. Verify the same zoom gives the same
      metres as the train sizing uses.
- [x] 2.3 Apply the offset perpendicular to the line's direction of travel, in the network's own
      flat projection with `origin.kx` / `origin.ky` — never haversine. Verify with a test that a
      corridor running due north offsets due east or west, and that the two lines land on opposite
      sides.

## 3. Draw it

- [x] 3.1 Build offset path geometry for lines that share track, and rebuild it when the zoom
      changes — **not** every frame. Verify by checking the rebuild happens on zoom change and not
      otherwise.
- [x] 3.2 Split lines that share track into their own `PathLayer`, so the other six never
      re-tessellate. Verify the untouched lines' layer instance is unchanged across a zoom change.
- [x] 3.3 Give every line a small distinct elevation so coincident geometry has a defined order
      instead of contending for the depth buffer. Verify two lines crossing no longer flicker.

## 4. Keep everything on its own line

- [x] 4.1 Apply the same offset to station markers, at each stop's distance along the line. Verify
      with a test that a marker on the shared stretch sits on its own line's offset path, not on the
      centre line.
- [x] 4.2 Apply the same offset to trains, **added to** the existing keep-left shift rather than
      replacing it. Both are perpendicular offsets in the same frame, so they compose by addition.
      Verify with a test that a train on the shared stretch is offset by both, and that a sign error
      in either is caught.
- [x] 4.3 Verify keep-left still holds on an offset stretch: a train is still to the left of its own
      direction of travel relative to its own drawn track.

## 5. Close out

- [x] 5.1 Run `npm test` and `npm run build`; both must pass with the existing 112 tests green.
- [x] 5.2 Record in `CLAUDE.md` that offsetting interlined lines is a drawing convention and not a
      claim that they run on separate rails, and that the separation is in pixels because a ground
      distance cannot be legible at both ends of the zoom range.
- [ ] 5.3 **Look at it in a browser** — the shared stretch at street zoom and at city zoom, station
      markers on it, and trains on it. Not done until a human has seen it.
- [x] 5.4 Update `CLAUDE.md`'s Status, and open a pull request referencing issue #18 with
      `Closes #18`.
