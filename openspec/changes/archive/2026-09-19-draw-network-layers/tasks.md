# Tasks

## 1. Wire the overlay in

- [x] 1.1 Add `MapLibreOverlay` from `@deck.gl/maplibre` to `src/map/MapView.tsx` with
      `interleaved: true`, added via `map.addControl`, and removed on teardown alongside
      `map.remove()`. Verify with `npm run build` and by seeing the map still load with no console
      errors.
- [x] 1.2 Determine the `beforeId` insertion point by reading the live style's layers at runtime
      rather than hardcoding a name, so a style change fails visibly instead of silently appending
      on top. Verify by logging the chosen id once and confirming it exists in the loaded style.
- [x] 1.3 Expose the overlay so Milestone 4 can call `overlay.setProps({ layers })` from an
      animation loop without a React re-render. Verify the type-checker accepts a `setProps` call
      from outside the component's render path.

## 2. Draw the lines

- [x] 2.1 Build one `PathLayer` over all eight lines, taking each path from `line.path` and its
      colour from `line.color`, converting the hex string to the RGB array deck.gl expects. Verify
      with a unit test on the hex-to-RGB helper, including a lowercase and an uppercase input.
- [x] 2.2 Set width in pixels so lines stay legible from city-wide zoom to street level. A constant
      pixel width needs no min or max, so those props were dropped rather than left in doing
      nothing. Verify by eye at zoom 10 and zoom 17, and record the value chosen.
- [x] 2.3 Confirm no line is omitted and no colour is hardcoded: a test asserting the layer's data
      length equals `network.lines.length` and that every colour came from the data.

## 3. Draw the stations

- [x] 3.1 Build the station positions from `pointAt(line, stop.at, false)` over direction 0's stop
      list — **not** from `stations[id].lon/lat`. Verify with a test asserting a known station's
      drawn position differs from its raw coordinate by the expected distance, and that KJ37 Putra
      Heights moves by about 105 m.
- [x] 3.2 Draw each station as a small ring in its line's colour, sized in pixels so it stays
      visible when zoomed out. Verify by eye, and with a test that the station layer's data length
      equals the total number of stops across all lines' direction 0.
- [x] 3.3 Confirm the direction-0 convention is right: a test asserting that
      `pointAt(line, stop.at, false)` for a direction-0 stop and the equivalent direction-1 call
      agree to within a metre. This is the subtle mirroring bug design.md warns about.

## 4. Honesty and failure

- [x] 4.1 Keep a plainly worded statement that positions are scheduled, not live, visible on screen.
      Verify by loading the app and reading it without looking for it.
- [x] 4.2 Handle the absence of WebGL2 visibly rather than silently: the map still loads, and the
      viewer is told why there is no network on it. Verify by forcing the failure path and reading
      what appears.

## 5. Close out

- [x] 5.1 Run `npm test` and `npm run build`; both must pass, and `src/sim`'s 49 existing tests must
      be untouched and still green.
- [x] 5.2 Record the production bundle size before and after deck.gl, so Milestone 7 knows what it
      is deploying.
- [x] 5.3 Correct the `MapboxOverlay` references in `CLAUDE.md` and `GUIDE.md`, and update
      `CLAUDE.md`'s Status for Milestone 3.
- [x] 5.4 Write `docs/decisions/0003-maplibre-overlay.md` recording that `MapLibreOverlay` from
      `@deck.gl/maplibre` supersedes `MapboxOverlay`, that this resolves the open risk in ADR 0001,
      and the interleaved-mode trade-offs. Link it from `docs/decisions/README.md`.
- [x] 5.5 Open a pull request referencing issue #8 with `Closes #8`, including what to look at in
      the browser.
