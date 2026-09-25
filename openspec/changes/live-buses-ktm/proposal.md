# Proposal

## Why

Every vehicle on the map today is a Rapid Rail train placed by the published timetable, because Rapid
Rail has no live position feed. Rapid KL buses and KTMB trains do publish live GPS positions through
Malaysia's official open API. Adding them shows more of the network, and they are the first vehicles
on the map that are actually tracked (issue #40).

That is also the risk. Until now the honesty rule was one sentence: everything is scheduled. From
here the map carries two kinds of position side by side, and every vehicle has to say which kind it
is, how old it is, and when the feed behind it has failed.

## What the feeds say

Measured, not assumed. Sampled 2026-09-25 from 12:09:11 to 12:12:58 KL time (a Friday, midday):
twelve fetches of each feed about 20 s apart, decoded with `gtfs-realtime-bindings`. The raw bytes of
four of them are kept in `samples/` beside this proposal, and become the test fixtures.

**Rapid KL bus** (`/gtfs-realtime/vehicle-position/prasarana/?category=rapid-bus-kl`)

- 117 to 128 vehicles per response, 138 distinct vehicles over four minutes, on 57 routes. All inside
  the Klang Valley (lat 2.98 to 3.25, lon 101.44 to 101.85).
- Every entity populates: trip id, route id, start time and date, latitude, longitude, bearing,
  speed, a per-vehicle timestamp, vehicle id and licence plate (the id IS the plate, e.g. `VFB2440`).
  No `label`.
- **The feed content changes about every 60 to 65 s, not every 30.** Header timestamps in the
  window: 12:08:16, 12:09:20, 12:10:25, 12:11:29, 12:12:30 KL. A fetch between those returns the
  same bytes.
- A vehicle's own fix is 20 to 140 s old when fetched (median about 60 s). Between consecutive
  snapshots, 449 of 472 vehicle pairs had moved. Fix-to-fix gap per vehicle: median 60 s, 90th
  percentile 90 s, longest 270 s.
- Route ids are internal (`U6000`, `T7860`). The public route number is in static GTFS
  (`U3000` is route `300`). Every route id seen is present in the static `routes.txt`.
- `speed` reaches 65.6. GTFS-Realtime defines speed in metres per second, which would make that
  236 km/h, so the feed is almost certainly sending km/h. We do not display speed.

**KTMB** (`/gtfs-realtime/vehicle-position/ktmb/`)

- **9 vehicles, and all 9 are ETS intercity trains** (labels `ETS301` to `ETS310`), not Komuter.
  They are spread across the peninsula, from Kedah to Johor; about one was in the Klang Valley.
- **One reported latitude 0.0027, longitude 0.0155**, in the Gulf of Guinea. A position that is
  plainly not a position.
- Populated: trip id, latitude, longitude, bearing, speed, timestamp, vehicle id (equal to the trip
  id) and label. **No route id.** The static `trips.txt` maps each trip id to route `ETS`.
- **Bearing is 0 and speed is 90 on every entity in every sample**, and all nine share one
  timestamp. These are placeholders, not measurements.
- The header timestamp advances about every 30 s, but vehicle timestamps advance only every 120 s.
- **4 of the 12 responses were empty** (a valid 15-byte message with zero entities), interleaved
  with full ones: 9, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9. An empty response here does not mean no trains.

**Both**

- HTTP 200, `Access-Control-Allow-Origin: *` when an `Origin` is sent, protobuf body,
  `cache-control: private`. No `Access-Control-Expose-Headers`, so a page cannot read the server's
  `Date` header to correct its own clock.
- The sampling machine's clock ran about 3 s behind the server's `Date` header, so one header came
  back "from the future". A browser's clock can be wrong, and the age of a fix is computed from it.

**The API's own limits** (developer.data.gov.my, read 2026-09-25): "All Vehicle Position feeds are
updated every 30 seconds", and the rate-limit page lists **GTFS Realtime at 4 requests per minute**,
answering `429 Too Many Requests` beyond it. It does not say per what (address, endpoint). Our own
sampling ran at 6 a minute across the two endpoints for four minutes without a 429, so the limit is
either per endpoint or loosely enforced; we plan to the documented figure regardless.

## What Changes

- The browser polls both feeds directly (no proxy), **each once a minute, staggered by 30 s**. That
  is 2 requests a minute against a documented 4, and it loses nothing: bus content only changes
  every minute, KTM vehicle fixes every two. Polling each at 30 s would sit exactly on the limit with
  no room for a reload or a second tab. Polling stops while the tab is hidden, while the clock is not
  live, and for a mode the viewer has switched off.
- Bus and KTM vehicles are drawn where the feed last put them, with the bus's bearing. **Never
  extrapolated, never smoothed between polls**: a vehicle jumps when a new fix arrives.
- Every live vehicle shows the age of its fix. Older than **4 minutes** it is visibly stale; older
  than **10 minutes** it is removed. Reasons in design.md.
- A position that is clearly invalid — missing or not a number, at or near 0,0 (checked on its
  own, not left to the box), or outside a box around Peninsular Malaysia that neither operator leaves
  (the KTM shuttle to Woodlands included) — is not drawn. Such reports are counted by reason and the
  count is shown with the feed's status, never dropped silently.
- **The KTM mode is named "KTM ETS (intercity)"** on its switch, status, hover, card and legend,
  because the feed carries ETS sets and no Komuter. ETS trains are drawn with no direction arrow:
  the feed's bearing is a placeholder. The explanation of the data states that the KTMB feed
  currently carries only ETS intercity trains and no Komuter, so a map without Komuter is not read as
  Komuter not running.
- **Live vehicles show only while the clock is live.** Scrubbed, sped up or paused, they are hidden
  and the display says why. Present-day GPS drawn against 07:45 on a forced Sunday would be a lie.
- Feed failure, rate limiting and empty responses are stated per mode in the lines panel.
- Hovering and selecting a bus or KTM vehicle: mode, route (as the feed gives it), vehicle id or
  label, and age of fix.
- Per-mode visibility switches for Bus and KTM in the existing lines panel.
- The honesty statement changes from "everything is scheduled" to "trains are scheduled; buses and
  KTM are live GPS", in the caption and the guide. The rail card keeps its "scheduled" footnote,
  which stays true.
- **Dependency added**: `gtfs-realtime-bindings` (owner-approved), to decode the protobuf.

## Capabilities

### New Capabilities

- `live-vehicles`: showing Rapid KL buses and KTMB trains at the positions their live feeds report —
  fetching within the API's limits, how old a fix may be before it is marked stale or removed, what
  is shown when a feed fails or is empty, when live vehicles are shown at all, how they look beside
  the rail network, and how they are inspected and hidden.

### Modified Capabilities

- `network-map`: "The display states that positions come from a timetable" becomes a statement of
  which positions are scheduled and which are live, because "not a live feed" stops being true of
  everything on screen.
- `inspection`: "Pointing at something says what it is" says only trains and stations answer; live
  vehicles now answer too. Hiding, cards and crowded picks otherwise apply to them as written, with
  their own rules in `live-vehicles`.

## Impact

- **New code**: `src/live/` — decoding, validation, merging of fixes and age classification, pure
  and tested against the recorded feed bytes; a thin polling layer beside it.
- **Modified**: `src/map/MapView.tsx` (a live layer in the overlay, picking), `src/ui/store.ts`
  (per-mode visibility, a vehicle selection), `src/ui/LinesPanel.tsx`, `src/ui/Card.tsx`,
  `src/ui/readout.ts`, `src/App.tsx` and `src/ui/Guide.tsx` (the wording).
- **No change** to `src/sim/`, `data/network.json`, the refresh workflow or `check:feed`.
- **Nothing here depends on `places()`** (`src/sim/places.ts`, merged to main in #42 since this was
  first drafted). Places group rail stops by name; live vehicles have no stops, so it is irrelevant
  to this change, and noted only so that no task reaches for it. Live data
  is fetched by the browser at run time, never committed except as test fixtures.
- **No static GTFS in version 1.** Bus routes are shown by their feed id, labelled as such, and KTM
  trains by their label. Public route numbers (`300` for `U3000`) need a generated lookup from static
  GTFS and a place in the daily refresh; that is a follow-up issue. KTM track is out of scope: the
  KTMB static feed has no `shapes.txt`, so there is no track geometry to draw.
- **Deploy**: none. The feeds allow any origin, so the Cloudflare Worker stays static assets only.
- **Bundle**: the bindings' generated module is about 520 KB unminified. Measured in the build task.

## Non-goals

- Drawing bus routes, trip updates or arrival predictions.
- MRT feeder buses (`rapid-bus-mrtfeeder` is a separate feed). The `T`-prefixed routes that appear in
  `rapid-bus-kl` are LRT feeders and are shown, because that feed contains them.
- Merging live vehicles with the rail timetable, or with each other.
- Following a live vehicle with the camera. Its position changes once a minute, in a jump.
- Displaying speed. Its unit is contradicted by its own values on the bus feed and constant on KTM.
