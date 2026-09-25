# Tasks

Four stages, confirmed by the owner (design.md, "One change, four stages"). Each stage is built on its
own branch, looked at by the owner, and merged before the next stage starts, so each group of tasks
ends with an owner look and a pull request. Stage 1 is groups 1–4, stage 2 groups 5–7, stage 3 group
8, stage 4 groups 9–12.

Every stage's pull request needs `npm test`, `npm run build` (with `ls dist/assets | grep worker`
still listing the roughly half-megabyte MapLibre worker) and `npm run check:feed` to pass, a CLAUDE.md
Status line for what the stage did, and `Refs #43`. The last one says `Closes #43`.

## 1. Stage 1: archive the merged changes

- [x] 1.1 In `live-buses-ktm/tasks.md`, note that open tasks 5.4 (phone width and keyboard only) and
      7.1 (re-sample) moved to this change's 7.2 and 12.1. Verify by reading it.
- [x] 1.2 Archive, in merge order, `interchange-places` (#42), `live-buses-ktm` (#44) and
      `station-labels` (#45), from this branch's committed files (the owner's main checkout has
      `station-labels`' spec files deleted but uncommitted; leave that alone and mention it in the pull
      request). Do NOT archive `station-models`. Run `npx openspec validate <change> --strict` on each
      first. Verify `openspec/specs/` now has `places`, `live-vehicles` and `station-labels`;
      `inspection` holds both "Pointing at something says what it is" as `live-buses-ktm` left it and
      "A station can be found by name"; and `npx openspec validate bus-view --strict` no longer reports
      "target spec does not exist" for `live-vehicles`.

## 2. Stage 1: static bus data

- [x] 2.1 Write `scripts/build_bus_json.py FEED_DIR OUT_DIR` with pandas, writing
      `data/bus-routes.json` (route id to `[short name, long name]`), `data/bus-shapes.json` (`origin`
      copied from `network.json`'s projection constants, shapes simplified with the rail script's
      Douglas-Peucker at 5 m and rounded to 5 decimals, trip id to `[route id, shape id]`, the route so the checks can verify it exists) and `data/bus-stops.json`
      (`[id, name, lon, lat]` to 5 decimals). Read CSVs with pandas so quoted commas parse. Verify by
      running it on the feed from `https://api.data.gov.my/gtfs-static/prasarana/?category=rapid-bus-kl`
      (follow redirects): 137 routes, 4,053 stops, 171 shapes, 2,097 trips; shapes near 515 KB raw and
      126 KB gzipped, stops near 232 KB and 73 KB. Record the actual sizes in the pull request.
- [x] 2.2 Add `src/bus.test.ts` (beside `network.test.ts`) pinning values measured from this snapshot:
      the counts above, `U3000` is `300`, `T3048` is `T304`, every stop inside the Peninsular box, every
      trip's shape present with at least two points. Verify `npm test` passes and fails if a count is
      edited.

## 3. Stage 1: checks and the daily refresh

- [x] 3.1 Add `check_bus` to `scripts/check_feed.py` with the rules in the data-freshness spec (under
      half the stored routes or stops; stop or shape point missing, near 0,0 or outside the box; a
      route with no short name; a trip whose route or shape is missing; a shape under two points),
      naming no measured value, and `--bus DIR [--against-bus DIR]`. Verify
      `python scripts/check_feed.py data/network.json --bus data --self-test` passes.
- [x] 3.2 Add one break-it case per bus rule to the self-test, each asserting its own check fires.
      Verify the log prints "caught" for every bus case, and that deleting any one rule makes the
      self-test fail.
- [x] 3.3 Update `npm run check:feed` to include the bus arguments, and the workflow to download the
      bus feed (with `--location`), build into `$RUNNER_TEMP`, check against the committed files, and
      commit the four data files in one commit only when any changed. Verify by a `workflow_dispatch`
      run's log that it passes and commits nothing when nothing changed.

## 4. Stage 1: route numbers, the frozen hover, and the stage's look

- [x] 4.1 Add a pure `routeName(routeId)` beside the inspection formatting, using
      `data/bus-routes.json`: `{ number: '300', feedId: 'U3000' }`, or `{ number: null, feedId }` for an
      unknown id. Verify tests for a known id, a name-type short name (`S6060`), and `U9999`.
- [x] 4.2 Show it in the existing hover and card: "300 · feed id U3000", or "U9999 (feed id)". Verify
      by `inspect.test.ts` cases.
- [ ] 4.3 Fix the frozen hover age: record the hovered vehicle in a ref in `onHover` and repaint the
      tip on the quarter-second gate. Verify by resting the pointer on a bus for 30 s: the age advances.
- [ ] 4.4 **Owner looks, during service hours**, in both map styles: bus hovers and cards show route
      numbers with feed ids, the hover age advances with the pointer still, and nothing else changed.
      Not done until somebody has seen it.
- [ ] 4.5 CLAUDE.md Status for stage 1 (the archives, the three data files, the bus checks), then the
      pull request (`Refs #43`) with the three checks' output. Merge before starting stage 2.

## 5. Stage 2: the view switch and rail dimming

- [x] 5.1 Add `transitView: 'rail' | 'bus'` and `setTransitView` to `useView`, persisted in
      `localStorage` with try/catch like the map style, and written to
      `document.documentElement.dataset.transitView`. Verify with `store.test.ts`: defaults to rail,
      and switching changes no clock, camera, style, `hidden` or `liveOff` state.
- [ ] 5.2 Add a `ViewSwitch` component: a `<fieldset>` with two native radios, Rail and Bus, beside
      `ModeSwitch`. Verify by keyboard (Tab, arrow keys) and at 360 px width that both are reachable,
      readable and announced.
- [ ] 5.3 In the frame loop, read the view from `useView.getState()`; rebuild the static rail layers
      with `opacity: BUS_VIEW_RAIL_OPACITY` when it changes (as for `hidden`), pass it to the train
      layers, and order layers per design.md. Verify rail stays clickable in the bus view, and that
      React DevTools' profiler shows no renders per frame while switching.
- [x] 5.4 Hide the base map's `poi_transit` layer in the bus view through `layerOps` (visibility
      only). Verify `modes.test.ts` still passes its "paint and visibility only" test and a new case
      for the bus view.

## 6. Stage 2: bus stops

- [ ] 6.1 Add `src/live/busdata.ts` with the stops loader: on the first `transitView === 'bus'`,
      `fetch` the `?url` of `data/bus-stops.json`; state `idle | loading | ready | failed` in
      `useLive`. Verify in a production build (`vite preview`, not the dev server) that no request for
      the stops file is made until Bus is chosen.
- [ ] 6.2 Paint the stops' load state in the lines panel's live group ("Loading bus stops…", "Bus stops
      are unavailable"). Verify by blocking the file's URL in developer tools.
- [x] 6.3 Draw stops as one `ScatterplotLayer`, built once when the data arrives, `visible` only in
      the bus view at zoom 14 or closer, colours per map style in `LIVE_STYLE`, pickable for a hover
      that shows the stop's name, and ignored by `pickToSelection`. Verify with a test of the zoom and
      view gate.

## 7. Stage 2: the panel, and the stage's look

- [x] 7.1 Make the caption in `App.tsx` and the canvas `aria-label` name the views correctly (buses are
      still live GPS at this stage). Verify by reading both views' text.
- [ ] 7.2 Carried from #40: the lines panel's live group at 360 px width and by keyboard and screen
      reader. Verify every switch, count and status line is reachable, readable and announced, with no
      sideways scroll.
- [ ] 7.3 **Owner looks, during service hours**, both views in both map styles: the switch keeps the
      camera, rail is dimmed but readable and clickable in the bus view, stops appear from zoom 14,
      the base map's own bus stops are gone in the bus view and back in the rail view. Tune
      `BUS_VIEW_RAIL_OPACITY` and the stop colours here.
- [ ] 7.4 CLAUDE.md Status for stage 2, then the pull request (`Refs #43`). Merge before stage 3.

## 8. Stage 3: models

- [x] 8.1 Extend `scripts/build_train_models.mjs` with a rigid bus (about 9 × 3.4 × 3.4 m, front
      tapered with the cab shade) and an octagonal ETS puck (about 7 m across, 3 m tall, banded), both
      using the palette texture. Run `npm run models`. Verify the console sizes and that the other four
      models are byte-identical.
- [x] 8.2 Extend `src/map/models.test.ts` with both: texture, indices, documented size, z = 0; the bus
      lies along +X; the ETS model's X and Y extents are equal. Verify `npm test`.
- [x] 8.3 Draw buses as a `ScenegraphLayer` at ground level in the bus view, and ETS as a
      `ScenegraphLayer` in both views (dimmed with rail in the bus view), coloured per map style,
      stale as lower alpha and grey-shifted. Rail view buses keep #40's arrows. Keep `liveLayers`'
      forget-when-off rule. Verify `live.test.ts` for which layer each view builds.
- [ ] 8.4 **Owner looks, during service hours**, both views in both map styles: a live bus and a BRT
      Sunway bus cannot be confused, ETS pucks imply no direction, stale models read as stale. Tune
      `LIVE_STYLE` here.
- [ ] 8.5 CLAUDE.md Status for stage 3 (the two models, why ETS is directionless), then the pull
      request (`Refs #43`). Merge before stage 4.

## 9. Stage 4: loading what motion needs

- [ ] 9.1 Add the shapes loader to `src/live/busdata.ts`: on MapLibre's first `idle` after the overlay
      is added, while buses are on (otherwise when they are first switched on), `fetch` the `?url` of
      `data/bus-shapes.json`, prepare each shape into `{ origin, xs, zs, cum, total }`, index trips, and
      state `idle | loading | ready | failed` in `useLive`. Verify with a test on the prepare step,
      and in a production build that the request starts only after the map has drawn, in either view.
- [ ] 9.2 Paint "Estimated movement is unavailable" in the live group when the shapes fail. Verify by
      blocking the URL: buses stay at their reports and nothing says estimated.

## 10. Stage 4: the pure core

- [x] 10.1 Narrow `pointAt`'s first parameter to the fields it reads. Verify the golden tests pass
      unchanged.
- [x] 10.2 Write `src/live/estimate.ts` with `onFix` and `drawnAt` and the constants in design.md's
      table (`SPEED_FACTOR` 0.5), and add it to `purity.test.ts`'s glob. Verify the purity test scans
      it.
- [x] 10.3 Test every rule in the bus-estimation spec with fixed inputs: advancing at `SPEED_FACTOR` of
      the measured speed; the 150 s stop; the end of the shape; catch-up forward over 4 s; hold for up
      to 250 m then continue; hold ending in a jump when the new estimate stops short; jump beyond
      250 m; a new trip; unknown trip, over 50 m off, one fix only, over 90 km/h; a loop shape settled
      by bearing, and one left unsettled; the same inputs giving the same result. Include one case
      built from a real bus in `src/live/fixtures/`. Verify `npm test`.
- [x] 10.4 Add a replay test: copy the responses in this change's `samples/` to `src/live/fixtures/`,
      replay them with the two existing bus fixtures through `onFix` and `drawnAt` at 60 frames a
      second against `data/bus-shapes.json`, and assert no drawn position ever moves backwards along
      its shape between frames. Verify `npm test`.

## 11. Stage 4: on the map and in the card

- [ ] 11.1 Change polling to `{ bus: 30_000, ktm: 120_000 }` with a 10 s minimum gap between any two
      requests. Verify with a test that ten simulated minutes of ticks give about 20 bus and 5 KTM
      requests and never more than 3 in any 60 s window.
- [ ] 11.2 Export `untilNextMs(mode)` from `poll.ts`, and give `mergeFixes` a `receivedMs` so each held
      fix records when it arrived. Verify `feed.test.ts` for the new field.
- [ ] 11.3 In BOTH views, keep tracks and drawn states inside `liveLayers`' closure, call `onFix` on a
      version change and `drawnAt` every frame, and place and turn bus arrows (rail view) and models
      (bus view) with `pointAt`. Count buses that cannot be estimated (unknown trip, off route) in the
      bus status line. Verify with `live.test.ts` that switching view does not reset a bus's drawn
      state.
- [ ] 11.4 Card for an estimated bus: "Position estimated", the last GPS report's age, "Next update in
      N s", and "No newer report at the last check" when true; a bus drawn at its report says why and
      never says estimated. Hover says estimated and the age for a moving bus only. Draw the selected
      bus's shape as a thin path. Verify `inspect.test.ts` for each wording.
- [ ] 11.5 Caption, `aria-label` and guide (`Guide.tsx`): buses estimated between live GPS reports once
      shapes have loaded, live GPS before; estimation and its limits; that the bus feed refreshes about
      once a minute so 30 s polling gets fixes sooner but not fresher; where stops and route numbers
      come from. Verify with `grep -ri "scheduled\|live gps\|estimated" src`, reading every hit against
      the specs.

## 12. Stage 4: calibration, the final look, and close-out

- [ ] 12.1 Carried from #40. **Needs to be done at about 08:00 KL on a weekday and again at about
      23:30 KL.** Re-sample both feeds (at most 4 requests a minute): vehicle counts, fix ages, KTM
      bearings, any Komuter in KTMB. Re-run the speed-factor backtest from design.md on the bus samples.
      If a normally reporting vehicle exceeds 240 s, or the backtest moves a constant, update the
      constant and design.md in the same commit. Verify the numbers are recorded in the pull request.
- [ ] 12.2 **Owner looks, during service hours (about 06:00 to 23:00 KL), and ticks this list.** Both
      views, both map styles. Before the shapes arrive (throttle the network), buses sit at their fixes
      and nothing says estimated. After: buses glide, pause at lights now and then, occasionally
      jump, never reverse, in both views; switching view does not move them; a selected bus's card
      says estimated, gives the fix age and counts down, and its route is drawn; the hover says
      estimated; a stale bus is faded; ETS pucks stay where the feed puts them. Tune `SPEED_FACTOR` by
      eye here (fewer pauses against more lag). Not done until somebody has seen it.
- [ ] 12.3 Update `CLAUDE.md`: the honesty rule's text (bus positions are estimated between live
      reports wherever an estimate is drawn, and say so; KTM, and buses without a usable shape, are
      never estimated), the Status section (motion in both views, what loads when and why, the
      estimation constants and the correction rules, polling at 30 s and 120 s), the architecture block
      (`src/live/estimate.ts`, `busdata.ts`), and the commands (`build_bus_json.py`). Verify by reading
      it against this change.
- [ ] 12.4 Final `npm test`, `npm run build` (worker chunk about 0.5 MB) and `npm run check:feed`, the
      pull request with `Closes #43`, and after merge `/opsx:archive bus-view`. Verify all three pass
      in the pull request's description.
