# KL Rail, by the timetable

A web app that shows Klang Valley trains (LRT, MRT, monorail, BRT Sunway) moving on a 3D map of
Kuala Lumpur. Train positions are **calculated from Prasarana's published GTFS timetable**, because
Rapid Rail has no live vehicle-position feed. Rapid KL buses and KTM ETS trains, which do have live
GPS feeds, are drawn beside them at their reported positions (issue #40).

Honesty rule: the UI must always say which positions are scheduled (rail) and which are live GPS
(buses, KTM ETS), and every live position says how old it is. Never invent, smooth over,
or "fix" data silently. If the feed is wrong or missing, show that.

## About the owner

I'm newer to software development and I'm learning as I build. So:
- Plan first, then build one milestone from GUIDE.md at a time. Don't run ahead.
- Prefer simple, readable code over clever code. Explain non-obvious choices in a sentence or two.
- After each change, tell me what changed, why, and how I can see it working.
- Ask before adding a dependency, and say what it's for.

## How we work

Three rules, and the reasons they exist.

1. **Spec first, with OpenSpec.** Before any task or change, run `/opsx:propose`. It writes the
   proposal, spec, design and task list under `openspec/changes/`, so there is something to read and
   argue with before a line of code exists. Read the plan, push back on it, then build it with
   `/opsx:apply` and close it out with `/opsx:archive`. Use `/opsx:explore` when the shape of the work
   isn't clear yet. No code before there is a spec: a wrong plan is cheap to throw away, a wrong
   afternoon of code is not.
2. **Delegate to subagents.** Code traversal (finding and reading code), implementation and document
   writing all go to subagents. The main session stays for planning, review and decisions. Reading
   twenty files fills a session with detail nobody needs to remember, and a session that has forgotten
   the point starts making bad calls.
3. **A branch per job.** Never commit to `main`. Every piece of work gets a GitHub issue, a branch
   named after it, and a pull request that references the issue. Issues, PRs and wiki pages get proper
   descriptions, not one-liners. This is how the industry works, and the habit is worth more than the
   paperwork: `main` always builds, and in six months the history explains itself.

Conventions:

- Branches are `<type>/<short-kebab-description>`, where type is one of `feat`, `fix`, `chore`,
  `docs`, `refactor`, `test`. For example `feat/sim-port`.
- Commit subjects are conventional and in the imperative: `feat:`, `fix:`, `chore:`, `docs:`,
  `test:`, `refactor:`. The body wraps, and explains why the change was made. The diff already
  says what changed.
- A pull request closes its issue with `Closes #N` in the description.
- The wiki holds long-lived explanation: architecture, data-feed quirks, decisions and how things
  came to be. `docs/` in the repo holds writing that must version alongside the code, so it changes
  in the same commit as the code it describes. GUIDE.md stays the plan. CLAUDE.md stays the rules.

## Stack

- Vite + React + TypeScript (strict)
- MapLibre GL JS v6 for the map (v5 and below carry a critical XSS advisory), OpenFreeMap "liberty"
  style (`https://tiles.openfreemap.org/styles/liberty`, no key). Liberty already ships a `building-3d`
  fill-extrusion layer at minzoom 14, so we don't add our own.
- deck.gl on top of MapLibre for tracks, stations and trains: `MapLibreOverlay` from
  `@deck.gl/maplibre`, interleaved. NOT `MapboxOverlay` — that module declares no `maplibre-gl` peer
  dependency and duck-types the map. See `docs/decisions/0003`.
- Vitest for tests
- Python 3 (pandas, numpy) only for `scripts/build_network_json.py`
- Library APIs move. Check the installed version's docs before using MapLibre or deck.gl APIs from memory.
- MapLibre's tile worker needs TWO separate fixes, one per build. Remove either and the map paints
  the style's background colour and nothing else, with NO error anywhere — the style, the sprite and
  the tile index all load fine, so it looks like a broken map with a clean console. MapLibre parses
  every vector tile in that worker.
  - DEV: `maplibre-gl` is in `optimizeDeps.exclude`. The dep optimizer would move the module away
    from the worker sitting beside it. See issue #10.
  - BUILD: `setWorkerUrl()` is called with a `?worker&url` import, and `worker.format` is `'es'` in
    the Vite config because MapLibre constructs it with `{ type: 'module' }`. MapLibre picks its
    worker file by name at runtime — production or development build — so the name never appears as
    something a bundler can follow and Vite emits nothing. See issue #32.
  - The check that catches this: `ls dist/assets | grep worker` must list a worker chunk of roughly
    half a megabyte. It bundles a shared chunk, so a small file means it was copied, not bundled.

## Commands

- `npm install`  once, to get dependencies
- `npm run dev`  dev server on http://localhost:5173
- `npm test`  Vitest
- `npm run build`  type-check (`tsc --noEmit`) then production build into `dist/`
- `python scripts/build_network_json.py data/gtfs data/network.json`  rebuild the data file from the raw feed
- `npm run check:feed`  check a rebuilt `network.json` against rules any valid feed must satisfy,
  and prove each check can fail. NOT the same job as `npm test`: see below.

## Architecture

```
src/sim/   pure TypeScript. Timetable in, train positions out. No DOM, no map, no Date.now().
src/map/   MapLibre + deck.gl. Owns the animation loop and the layers.
src/live/  live buses and KTM. feed.ts is pure (decode, validate, merge, age); poll.ts fetches.
src/ui/    React components: clock, time controls, line list, train and station cards.
data/      raw GTFS snapshot and the generated network.json (never edit network.json by hand)
reference/ the working single-file prototype and golden test data. Read-only. Port from it, don't import it.
```

- Time is always an argument. `src/sim` never reads the clock itself, so every function is testable.
- Kuala Lumpur is UTC+8 all year. Compute KL time explicitly from a UTC timestamp. Never rely on the
  browser's local time zone.
- Keep React out of the frame loop. Trains update 60 times a second through deck.gl directly
  (`overlay.setProps`). React state is for things a person changes: selection, speed, visible lines.
- Units: metres, seconds, degrees (compass bearing, 0 = north, clockwise). Coordinates are `[lon, lat]`.
- Any change to `src/sim` needs a test. `reference/sim-golden.json` holds expected results for the shipped data.

## What we learned about this feed (rapid-rail-kl)

- It is headway-based. `frequencies.txt` says "a train every N seconds between A and B". `stop_times.txt`
  holds ONE template trip per line, direction and day type. Weekday, Saturday and Sunday templates are
  identical; only the headways differ. Day types in use: `MonFri`, `Sat`, `Sun`.
- Windows can end at `24:00:00` and trips run past midnight. A train at 00:30 belongs to YESTERDAY's
  day type. Always check both today's and yesterday's departures.
- Direction-1 shapes are the exact reverse of direction-0 shapes, so we store one path per line.
- There is no `shape_dist_traveled`. The script projects each station onto its line's path.
  Stations can sit up to about 100 m from the track, so draw them at the projected point, not the raw lat/lon.
- `stops.txt` has quirks: `route_id` says `MRT` where `routes.txt` says `KGL`, a junk `geometry` column,
  ALL-CAPS names, sponsor names after " - ". Map stations to lines through the timetable, not `stops.route_id`.
- Interchange stations have one stop id per line (KJ15, MR1 and so on are all KL Sentral).
- Ampang and Sri Petaling lines share track between Chan Sow Lin and Sentul Timur.
- Trains keep left in Malaysia.
- Every first train starts at a terminal at 06:00, so roughly 06:00 to 07:30 looks emptier than real life.
- No `calendar_dates.txt`: public holidays are treated as ordinary days. `calendar.txt` ends 2026-12-31.
- Include whatever lines the feed marks valid (it currently includes the Shah Alam Line and BRT Sunway).
- Headway windows are END-EXCLUSIVE. `[21600, 32400, 180]` means a train every 180 s from 06:00 up
  to but not including 09:00. Ampang direction 0 yields 249 weekday departures, 209 on Sat and Sun.
- Every direction's first stop has `arr` of 0, on all 16 directions. `progress()` leans on this.
- Distances are Euclidean in the flat projection `network.json` carries in `origin` (`kx`, `ky`),
  not geodesic. Ampang computes to 14892.7 m against the feed's stated 14893. Never swap in
  haversine or turf.js: it would move every distance away from the timetable it was built against.
- A degree of longitude here is 111,155 m; a degree of latitude is 110,574 m. Bearings must be
  computed from the metre-space tangent, never from raw lon/lat deltas, or they tilt by up to 0.15
  degrees.

## Sources and limits

- Data: Malaysia's official open API, `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`.
  Use only the official API. Do not scrape operator websites or private endpoints.
- This is an unofficial project. No Rapid KL or Prasarana logos. Credit the data source and OpenStreetMap.
- Never commit secrets. There are none in v1.

## Definition of done for any task

1. `npm test` and `npm run build` pass.
2. I've been told how to check it in the browser, **and somebody has actually looked**. HTTP 200 is
   not a screenshot: a blank canvas serves exactly like a working one. A milestone whose done
   criterion is visual is not done until a human has seen it. This rule exists because Milestone 1
   shipped, and two more were built on top of it, while the map had never drawn a single tile.
3. The Status section below is updated, and the work is committed with a clear message.

## Status

- Milestone 0 (starter kit unpacked) done.
- Milestone 1 done: Vite + React + TS strict app, full-window MapLibre map of KL, tilted with 3D
  buildings. `data/network.json` is imported directly by `src/App.tsx` (Vite inlines it; no fetch,
  no copy in `public/` to go stale). `src/network.test.ts` guards its shape.
- Milestone 2 done: `src/sim/` is a pure TypeScript port of the prototype's Sim module, proved
  against `reference/sim-golden.json` — all 7 cases and all 210 enumerated trains. 49 tests pass.
  `src/sim/purity.test.ts` fails the build if anything in `src/sim` ever reads the clock, the DOM,
  or top-level mutable state. Decisions recorded in `docs/decisions/0002`.
- Milestone 3 done: the network is drawn over the map with deck.gl, interleaved so it composes with
  the 3D buildings. Lines from `line.path` in `line.color`; stations placed ON the track via
  `pointAt`, not at their published coordinates (which sit up to 105 m off). The ADR 0001 risk is
  closed: maplibre-gl v6 is explicitly supported, via `MapLibreOverlay`. See `docs/decisions/0003`.
- Two map modes (issue #12, not a GUIDE.md milestone): a switch toggles between the city and a
  wireframe view — dark ground, streets as thin dim lines, buildings as translucent volumes with
  their footprints lit. Recoloured per layer with `setPaintProperty`, never by `map.setStyle`: that
  rebuilds the style and destroys the layer the deck.gl overlay targets with `beforeId`. The layer
  list is snapshotted at load, BEFORE the overlay is added — deck.gl inserts its own layers into the
  style, so iterating the live list would restyle the network along with the city. MapLibre's
  `fill-extrusion` has no outline property, so building edges cannot be stroked; the lit footprints
  are a `line` layer we add on the same `building` source-layer. The palette lives in `WIREFRAME` in
  `src/map/modes.ts` and is taste, not contract — tune it freely.
- Milestone 4 done: trains move on the timetable. A `requestAnimationFrame` loop in `MapView`
  advances a clock held in a ref, calls `activeTrains`, and writes to the overlay directly — React
  is never involved. Each train is two `SolidPolygonLayer`s: a neutral body and a line-coloured
  roof. Trains keep left (`left = (-cos B, +sin B)` in east/north — the one sign no type checker can
  catch, so it has its own test), are sized as multiples of a camera-derived `W` so they hold a
  constant pixel size until they floor at real-world metres, and sit at an assumed viaduct height.
  Station markers fill while a train dwells, resolved BY STOP ID — `train.stop` indexes that
  direction's list, and direction 1's is the reverse of direction 0's, which the markers are built
  from.
- The feed has no elevated-or-underground data. Trains are drawn at one assumed height, which is
  right for the elevated majority, wrong under the tunnels, and occluded by tall buildings in the
  city centre. The caption says so. Deriving real heights from OpenStreetMap is after-version-1.
- Trains are glTF models, one per mode, in `src/map/models/*.gltf`, generated by
  `npm run models` (`scripts/build_train_models.mjs`) and replaceable by hand.
  Model axes are **+X forward, +Y left, +Z up, metres** — NOT glTF's usual Y-up, because deck.gl
  applies no axis conversion. A Blender export needs "+Y Up" turned OFF. `src/map/models.test.ts`
  fails if a dropped-in model breaks that.
- `ScenegraphLayer`'s `getColor` **replaces** a material's `baseColorFactor` and **multiplies** a
  base-colour texture. So per-train tinting only works if the shading is baked into a texture, which
  is why each model carries an embedded 8x1 PNG palette. Shading put in material factors would be
  thrown away and every train would be one flat colour.
- Yaw for a compass bearing is `90 - bearingDeg`. Like the prototype's `180 - B`, it is a mirror and
  not a turn, so a wrong sign looks right on straight track and wrong only on curves.
- Shared track (issue #18): where two lines run the same alignment, each is drawn beside it rather
  than on it. Corridors are FOUND IN THE DATA by exact vertex equality, never hardcoded. The
  separation is in PIXELS, not metres — a ground distance cannot be legible at both ends of the zoom
  range, so the offset geometry is rebuilt on zoom change (not per frame), and the two shared lines
  live in their own layer so the other six never re-tessellate.
- Offsetting interlined lines is a DRAWING CONVENTION. Ampang and Sri Petaling run on the same
  physical rails; drawing them apart is what every transit map does, and is not a claim that they
  have separate track.
- A corridor's shared vertices are NOT contiguous — Ampang shares 89 of 99 positions, with unshared
  gaps up to 371 m where one line carries curve detail the other lacks. A corridor therefore runs
  from the first to the last vertex shared with the same partner set; an unshared vertex in between
  does not end it. Splitting on gaps would snap the line back to centre ten times along the stretch.
- `Progress.at` for a reversed direction counts from THAT direction's terminal, so it must be turned
  round (`line.total - at`) before being looked up against a corridor, which is recorded along the
  stored path. This is separate from, and in addition to, the `reversed` flag `pointAt` already
  takes.
- Milestone 5 done: the clock and time controls. A Zustand store in `src/ui/store.ts` holds the
  clock; the frame loop reads it with `useClock.getState()` — never a hook, because the loop is
  created once on mount and a captured value would freeze there. `ms` is written by `setMs`, which
  mutates in place and notifies nobody: nothing may subscribe to a value that changes 60 times a
  second. `?t=HH:MM` is gone; the real controls replace it.
- The clock is ONE MODE plus a remembered speed — `'live' | 'running' | 'paused'` — never separate
  booleans. In the prototype `live` shadowed `paused` and `speed`, so five independent fields made
  "live and paused" and "live at 60x" representable while the loop honoured half of each.
- Beware: `setTimeOfDay` returns a number and no longer sets `live = false` — every call site must do
  that itself, or the slider looks dead because the next frame overwrites the time. React's
  `onChange` on an input is the `input` event, so the drag flag is cleared by a NATIVE `change`
  listener attached through a ref; the slider is uncontrolled, or a re-render yanks the thumb out of
  the drag. `KlTime.month` is 1-based where `getUTCMonth()` was 0-based.
- Milestone 6 done: hover, cards, follow and the lines panel, on deck.gl picking. `getCursor` and
  `pickingRadius` are OVERLAY props, not layer props — without an explicit `getCursor`, deck.gl
  writes `grab` onto MapLibre's own canvas every frame in interleaved mode and MapLibre's pointer
  states never appear. Track layers are deliberately NOT pickable: they are everywhere near a line
  and would answer instead of the train standing on them. `pickingRadius` is Deck-level only, so
  there is no per-layer radius; trains beat stations by DEPTH, which makes `VIADUCT_M` being above
  every station marker's elevation load-bearing.
- A train selection is `{lineId, dir, dep, departedMs}`, NOT the train's `id`. The id embeds the day
  type and the today/yesterday shift, so midnight and a forced timetable both rename every running
  train. `departedMs` is an absolute anchor, which `svc + dep` is not: those cannot tell "finished"
  from "scrubbed back" whenever today and yesterday share a day type — Tuesday to Friday, and always
  under a forced timetable. When a train cannot be found the app says WHICH of finished, scrubbed-back
  or lost-to-a-timetable-change it was, and never claims a trip ended when it does not know that.
- Per-line visibility filters the layers' data and the frame's trains. It must NEVER recompute the
  shared-track corridors from the visible subset — that would snap 8.5 km of line sideways for a
  checkbox.
- Milestone 7 done: a daily GitHub Actions refresh, the deploy config, the README and the app's
  "about this data". Issue #27, and #7 fixed with it.
- THERE ARE TWO KINDS OF CHECK AND THEY MUST NOT BE CONFUSED. `npm test` describes THIS SNAPSHOT —
  six files assert values measured from it (corridor ranges, a station's 105 m offset, Ampang's
  14,892.7 m, 196 trains at the peak) and that is what makes them mean anything. `npm run check:feed`
  describes ANY VALID FEED and names no measured value. The refresh runs the second, never the first:
  running the first would fail on every legitimate timetable change, and the response would be to
  loosen the assertions until they asserted nothing. When a refresh moves the pinned numbers, a
  person updates them in a pull request, having looked.
- A check that rejects valid data is worse than no check, because it gets switched off. `GUIDE.md`'s
  "no train faster than 120 km/h" measured against the DRAWN position does exactly that: smoothstep
  peaks at 1.5x the average, so the fastest legitimate segment (89.9 km/h, PH SP24->SP25) renders as
  ~135 km/h. It is measured against the timetable instead. Headroom today is 30.1 km/h.
- Every feed check is proven to fail: `check:feed` breaks the data twenty ways (eight rail, twelve bus) on every run and asserts
  each specific check fires. The daily log carries that evidence.
- Deployed as a Cloudflare Worker serving static assets. Two fixes keep the map drawing at all, one
  per build — see the MapLibre worker note in the stack section. `ls dist/assets | grep worker` must
  list a chunk of roughly half a megabyte.
- Stations are per-line RINGS and nothing else. They carry which line a platform belongs to and
  whether a train is standing at it (Milestone 4), and they are the pick target. They GROW as the
  camera pulls back — 4 px zoomed in, 9 px zoomed out — because zoomed out the line has shrunk to
  nothing and there is nothing else marking a station, while zoomed in a big ring is a blot over the
  platform it marks.
- WE DRAW NO STATION GEOMETRY, AND WE DO NOT TINT THE CITY'S BUILDINGS. Four attempts were made and
  rejected: 3D models (three rounds of shape, size and colour), beacons above the roofline, and
  colouring the real OSM buildings near each station. The last is worth knowing about, because the
  idea is a good one and the data defeats it: the `building` layer has minzoom 13 so nothing shows
  when zoomed out, and its only fields are `colour`, `hide_3d`, `render_height` and
  `render_min_height` — NOTHING says which building is a station. Proximity lit up whole
  neighbourhoods.
- Clickability is NOT the marker's size. The pick radius is 12 px for fine pointers and 18 for
  coarse. Growing a marker to make it easier to hit was tried and rejected — the visible marker and
  the hit target are different things.
- Places (issue #23): `places()` in `src/sim/places.ts` groups the per-line stops into 160 places,
  22 of them interchanges, by EXACT NAME and nothing else. Distance cannot do it: Ampang Park's two
  stops are 293.6 m apart, while the closest two different stations (Plaza Rakyat, Merdeka) are
  230.1 m apart. `check:feed` guards the name instead — `name-spread` fails at over 500 m between
  same-named stops, `name-split` at under 100 m between differently-named ones.
- A place's transfer distances come from the PUBLISHED coordinates, not the on-track points, which
  would make Putra Heights' cross-platform change 124 m instead of 24 m. They are straight lines,
  not walks; turning them into a time belongs to the journey planner (#26). A place's position is
  the mean of its stops' on-track points — the true alignment, WITHOUT the shared-track pixel
  offset, which only `src/map` knows. Labels (#25) must resolve that there. Nothing draws places yet.
- Live buses and KTM (issue #40) done, and seen by the owner at midday. `src/live/feed.ts`
  is pure and scanned by `purity.test.ts`; `poll.ts` is the fetching half. Tested against four
  recorded responses in `src/live/fixtures/` (`*.pb` is `binary` in `.gitattributes`, and
  `assetsInclude` lets Vite inline them for tests). Live vehicles are drawn where the feed last put
  them and NEVER extrapolated or smoothed; they show only while the clock is live.
- Each feed is requested at most once a minute, never within 30 s of the other, so two requests a
  minute against a documented limit of 4 (GTFS Realtime, 429 beyond it). Polling every 30 s each
  would sit exactly on the limit; the bus content only changes every ~60 s and KTM fixes every 120 s.
  Polling stops while the tab is hidden, the clock is not live, or the mode is switched off. The
  request times live in the module so a remount cannot fetch early.
- A fix is stale past 240 s (drawn faded and hollow) and gone past 600 s. Both from ONE midday
  sample; re-sample at a peak and late at night before trusting them. Ages are clamped at zero
  because the device clock can run behind the feed, and cannot be corrected: CORS hides `Date`.
- The bindings put field defaults on the PROTOTYPE, so an absent string reads `""` (KTM's
  `route_id`) and an absent number `0`. Presence is `hasOwnProperty`, never the value. Timestamps are
  `Long`s, converted once with `Number()`. Latitude and longitude are proto2 REQUIRED, so the
  generated `FeedMessage.decode` throws the WHOLE response away for one position missing either;
  `decodeFeed` splits the message and decodes each entity alone, so that one is counted `missing`.
- The KTMB feed carries only ETS intercity sets, no Komuter, so the mode is named
  "KTM ETS (intercity)" everywhere via `MODE_NAME`, and the data notes say Komuter may be running.
  Its bearings (all 0) and speeds (all 90) are placeholders: KTM is drawn as a directionless disc.
  One sampled KTM train sat at 0.0027, 0.0155; positions within 0.1 degrees of 0,0 or outside
  Peninsular Malaysia are not drawn and are COUNTED in the panel's status line, never dropped
  silently. An empty KTM response (they alternate with full ones) keeps the held trains, ageing.
- `IconLayer`'s `getAngle` turns ANTICLOCKWISE, so `angleFor(bearing)` is `360 - bearing` — read from
  the installed vertex shader, pinned by a test.
- Bus routes are shown as "300 · feed id U3000", looked up in `data/bus-routes.json` by
  `routeName` in `src/ui/inspect.ts`. An id the lookup lacks is "U9999 (feed id)" — never read off
  its spelling: `T3048` is T304 and `S6060` is PAVILION BUKIT JALIL (PAVBJ).
- Live markers are small and FLAT: at the map's pitch a ground-lying icon is foreshortened to about
  half its height, so they were first drawn at 4-9 px and nobody could find them. They are 10-18 px
  now, and coloured PER MAP VIEW (`LIVE_STYLE.color[view]`) - one dark slate vanished on the
  wireframe. The legend swatch follows the view through CSS variables, not React.
- `liveLayers` must FORGET a mode's instance when that mode is left out, including while the clock
  is not live (the loop passes every mode as off then). deck.gl finalizes a layer the moment it
  leaves the list; handing it back failed an assertion and left the vehicles unpickable.
- Not yet done: the 08:00 and 23:30 re-samples that would confirm the 240 s / 600 s thresholds, the
  panel at phone width and by keyboard, and a hover tooltip whose age freezes while the pointer
  stays still. Carried into #43, which also replaces the arrows with 3D models and moves buses
  between fixes - the owner relaxed "never extrapolate" for buses only, with the card saying the
  position is estimated.
- Station labels (issue #25): one name per PLACE, a deck.gl `TextLayer` in the overlay, not DOM.
  Choosing which names show (priority, then no overlap, at most 40) runs at most every 200 ms and
  only when something changed; placing them is the renderer's job. A name sits at the mean of its
  place's DRAWN rings, so on the shared corridor it is centred between them and moves onto the
  remaining ring when a line is hidden. `Place.lon/lat` is never used for drawing.
- Names are drawn OVER the lines and the trains, last in `setProps`, depth ignored — the owner's
  call on sight, reversing the plan's "beneath the trains": a name you cannot read is no use. They
  are NOT pickable, so a train under a name still answers. Lifted `stationRadius + 10` px above the
  ring; 4 px let lines run through the text.
- Ours are the only STATION names. OpenFreeMap's rail stations are `class: "railway"` in the `poi`
  source-layer, printed by `poi_r1`/`poi_r7`/`poi_r20` from zoom 15 — NOT `poi_transit`, which in
  KL is bus stops (kept, deliberately). They are filtered out once at load with `setFilter`; the
  mode switch writes only paint and visibility, never filters, and a test holds it to that. The
  base map's other labels (place names, bus stops) still draw over ours in the city view.
- `src/rail.ts` prepares the network and derives places ONCE for the map and the panel. The
  station search is in the lines panel; matching ignores case, spaces, hyphens, apostrophes and
  accents, and choosing a result reuses `goToStation`.
- Bus view (issue #43), stage 1: the merged `interchange-places`, `live-buses-ktm` and
  `station-labels` changes are archived, so `places`, `live-vehicles` and `station-labels` are in
  `openspec/specs/`. `scripts/build_bus_json.py FEED_DIR OUT_DIR` builds three files from the
  `rapid-bus-kl` static feed (URL needs the slash after `prasarana`, and redirects): route names
  (bundled), shapes simplified to 5 m with each trip's route and shape (for stage 4's motion; the route so `check_feed` can prove it exists) and stops (for
  stage 2). `src/bus.test.ts` pins this snapshot; `check_feed.py --bus` holds the rules for any
  feed, each proved to fail, and the daily refresh rebuilds and commits all four data files
  together. The Douglas-Peucker and the flat projection live in `scripts/geometry.py`, shared by
  both scripts. The hover tip's age now advances while the pointer rests: the hovered vehicle is
  kept in a ref and repainted on the quarter-second gate.
- Next: #43 (bus view, stages 2 to 4), #26 (the journey planner), and #35, where rotating while following still
  does not work on touch.
