# Proposal

## Why

Issue #40 put live Rapid KL buses and KTM ETS trains on the map as small flat markers, drawn under
the rail network so that about 120 buses would not bury eight lines. That works for a rail map, but it
makes buses hard to find, says nothing about where you would catch one, and a bus sits still for a
minute and then jumps a few hundred metres. The owner asked for a proper bus view (issue #43): 3D bus
and ETS models, the bus stops, public route numbers, a switch between a rail view and a bus view, and
buses that move between GPS reports.

## What the data says

Measured, not assumed, on 2026-09-25 (a Friday). Static feed downloaded 14:42 KL. Live positions: the
two recorded fixtures from 12:08 and 12:10 KL (`src/live/fixtures/`), plus eight fresh fetches 30 s
apart from 14:42 to 14:46 KL, which held four distinct responses. A second set of ten fetches from 15:00 to
15:05 KL (five distinct responses) was taken for the speed-factor backtest. Those nine responses are
kept in `samples/` beside this proposal and become test fixtures.

**Static GTFS, `rapid-bus-kl`.** The URL is `https://api.data.gov.my/gtfs-static/prasarana/?category=rapid-bus-kl`.
Without the slash after `prasarana` it answers 301 to that address, then 302 to the file, so a
download must follow redirects (the rail refresh already does). A 1.68 MB zip.

- **It has `shapes.txt`**: 171 shapes, 69,246 points, 2.2 km to 71 km long (median 16.9 km). Every one
  of the 2,097 trips names a shape. A route has one or two.
- **103 of the 171 shapes end within 300 m of where they begin**: a round trip or loop drawn as one
  shape. The same street is on the shape twice, once each way, so a position alone does not say where
  along it a bus is. 37% of fixes (89 of 241 in the fixtures, 132 of 444 fresh) lie within 50 m of two
  or more places more than 300 m apart along their shape.
- 137 routes, every one with a `route_short_name`. Most are numbers (`U3000` is `300`), feeders keep
  their code (`T3048` is `T304`), and a few are names (`S6060` is `PAVILION BUKIT JALIL (PAVBJ)`,
  `B1000` is `SUNWAY LINE`). Every route id seen live, 58 and 52 distinct in the two sets, is in
  `routes.txt`.
- 4,053 stops, all used by some trip, inside lat 2.745–3.337, lon 101.409–101.876. Names are ALL CAPS
  and 11 contain commas inside quotes, so the file needs a real CSV parser.
- Sizes, as compact JSON: stops (id, name, lon, lat to 5 decimals) **232 KB, 73 KB gzipped**. All 171
  shapes simplified to 5 m: 22,108 points, **439 KB, 119 KB gzipped** (the 70 seen live alone: 199 KB,
  53 KB). The trip-to-shape table: 76 KB, 7 KB gzipped. Unsimplified shapes would be 1.37 MB.
- Trip ids in the live feed name static trips exactly (`weekday_U6000_U600001_9`): 241 of 241 in the
  fixtures and 444 of 448 fresh. The four misses were one trip, `weekday_T7890_T789002_2`, which
  `trips.txt` does not have.

**How well buses lie on their shapes.** Distance from each fix to its own trip's shape: median 4.7 m,
90th percentile 17 to 20 m, 95th 25 to 38 m. 26 of 444 fresh fixes were more than 30 m off and 12 more
than 100 m, the worst 1.9 km: a bus off its route, whatever the reason.

**How far buses move between fixes.** A vehicle's fix is 11 to 88 s older than the response header
(median 27 s), and a new response appears about every 60 to 80 s. Between consecutive fixes of one bus
on one trip, tracked along the shape: median 265 m (fresh, gaps median 60 s) to 601 m (fixtures, gaps
median 120 s); 99th percentile 1.1 to 2.2 km. Median 17 km/h, 90th percentile 37 to 41 km/h. The feed's
own `speed` reaches 81.7, which only makes sense as km/h; it is not used.

**Is prediction sound? Tested against the fresh fixes** (200 triples of consecutive fixes on one
shape): predicting each third fix from the speed between the two before it misses by a median of
131 m (90th percentile 501 m). Holding the last fix, which is what #40 does, misses by 343 m (734 m).
So prediction roughly halves the jump. But **the real fix lands more than 5 m behind the estimate
in 46% of cases**, because buses stop at lights and at stops, and a bus drawn ahead of the truth has to
wait for it. Moving buses at a fraction of their measured speed trades those pauses for lag: at 0.5 the
share landing behind falls to 16 to 21%, and the median error is still about half of holding still.
design.md, "How fast an estimate moves", has the table across factors and both samples.

**Bearing resolves the round-trip shapes.** Where a fix has several candidate places on its shape,
keeping only those whose shape direction is within 60 degrees of the bus's reported bearing leaves
exactly one in 83 of 89 (fixtures) and 124 of 132 (fresh). For a moving bus with one candidate, bearing
and shape direction differ by a median of 3.3 degrees.

## What Changes

- **A Rail/Bus view switch**, beside the City/Wireframe switch. Rail view is today's map, with buses
  that move. Bus view brings buses and stops forward and dims the rail network without hiding it.
  Remembered like the map style.
- **Buses move between reports, in both views: predict, then correct.** This relaxes #40's "never
  extrapolate" **for live buses only**, on the owner's terms (issue #43, decisions of 2026-09-25, and
  the owner's review of this plan): a bus moves forward along its own trip's shape at a fraction of the
  speed measured from its recent fixes (0.5, tunable by eye), chosen for fewer pauses at the cost of
  more lag; each new fix corrects it without driving backwards; the estimate stops after a cap rather
  than driving on; a bus with no usable shape stays at its fix.
- **What motion needs loads in the background after the map has first drawn**, in both views: the
  simplified route shapes and the trip-to-shape table. Until they arrive buses are drawn at their fix
  exactly as #40 draws them, and nothing claims "estimated".
- **The card and hover say it is an estimate.** Selecting a moving bus says the position is
  **estimated**, gives the age of the last real GPS fix, and counts down to the next check of the
  feed. No GPS dot is drawn on the map.
- **3D models**: a rigid bus, and a directionless marker for KTM ETS, generated by the existing model
  script and held to the same axis and texture rules. ETS positions carry placeholder bearings, so the
  ETS model is rotationally symmetric and claims no heading.
- **Bus stops** from static GTFS, in the bus view only, from zoom 14.
- **Public route numbers** ("300", with feed id `U3000` alongside) in both views. An id the lookup does
  not know is shown as the feed id, labelled as such. Never guessed.
- **Generated bus data files**, built by a script, refreshed daily with the timetable, checked by
  rules that name no measured value, each proved able to fail: a small route-name table in the main
  bundle, route shapes fetched in the background after first paint, and stops fetched only when the
  bus view is first opened.
- **Polling**: buses every 30 s, KTM every 120 s, 2.5 requests a minute against the documented 4. The
  bus feed itself refreshes about once a minute server-side, so 30 s polling picks a new fix up sooner;
  it does not make fixes fresher.
- **Carried over from #40**: re-sample the feeds at about 08:00 and 23:30 KL to confirm the 240 s and
  600 s thresholds; the Live panel at phone width and by keyboard; a hover tooltip whose age no longer
  freezes while the pointer is still.
- **The honesty rule in CLAUDE.md changes**, as the owner decided: bus positions are estimated between
  live reports, and say so, wherever an estimate is drawn.
- **Delivered in four stages**, each built, looked at by the owner and merged before the next: data and
  route numbers; view switch and stops; models; motion. Stage 1 first archives the merged changes
  `live-buses-ktm`, `interchange-places` and `station-labels`, so their specs reach `openspec/specs/`.

## Capabilities

### New Capabilities

- `bus-view`: the Rail/Bus switch, what each view draws and how prominently, bus stops, and legibility
  in both map styles.
- `bus-estimation`: moving a live bus along its route between GPS reports — where the estimate comes
  from, how a new report corrects it, when it stops, and what happens without a usable shape.

### Modified Capabilities

- `live-vehicles`: buses are no longer only drawn where last reported (both views estimate them once
  shapes have loaded); the
  bus feed is polled every 30 s and KTM every 120 s; live vehicles are 3D models in the bus view and ETS
  everywhere; inspection shows public route numbers and, for an estimate, the fix age and a countdown;
  the stated difference between live and scheduled. **This capability exists only in the unarchived
  change `live-buses-ktm`; that change is archived first, in stage 1** (its two open tasks move into
  this change), or these deltas have nothing to modify.
- `network-map`: the statement of which positions are scheduled and which are live gains a third kind,
  estimated. Also a delta on `live-buses-ktm`'s wording, so it too needs that archive first.
- `data-freshness`: the daily refresh also rebuilds and checks the bus data, and the explanation of the
  data covers bus estimation and bus stops.

## Impact

- **New code**: `src/live/estimate.ts` (pure, scanned by `purity.test.ts`) and its tests;
  `src/live/busdata.ts` (loads and prepares the bus data); `scripts/build_bus_json.py`.
- **New data**, all generated and never edited by hand: `data/bus-routes.json` (route id to public
  name, about 10 KB, bundled); `data/bus-shapes.json` (origin, shapes simplified to 5 m, trip to route and shape
  table: about 515 KB raw, 126 KB gzipped, fetched in the background after first paint, in both views);
  `data/bus-stops.json` (about 232 KB raw, 73 KB gzipped, fetched on first entry to the bus view).
- **Modified**: `src/live/feed.ts` (polling intervals), `src/live/poll.ts` (next-request time readable
  for the countdown), `src/map/live.ts` (model layers, estimated positions, stops), `src/map/MapView.tsx`
  (view state, dimming, the tooltip fix), `src/map/modes.ts` (hide the base map's bus stops in the bus
  view), `src/ui/` (the switch, card, hover, route numbers, guide), `src/sim/sim.ts` (only `pointAt`'s
  parameter type narrowed so bus shapes can use it), `scripts/build_train_models.mjs` and
  `src/map/models.test.ts` (two models), `scripts/check_feed.py`, `.github/workflows/refresh-timetable.yml`,
  `package.json` (`check:feed` covers the bus file).
- **Dependencies**: none.
- **First paint**: unchanged. The main bundle grows by the route lookup only; shapes load after the map
  has drawn, and stops only in the bus view.
- **Delivery**: four stages, one pull request each, each looked at by the owner and merged before the
  next. See design.md, "One change, four stages".
