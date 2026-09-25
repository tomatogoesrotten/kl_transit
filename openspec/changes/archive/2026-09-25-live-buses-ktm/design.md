# Design

## Context

See proposal.md for why, and for the measured feed facts this design leans on. The code it joins:

- `MapView.tsx` runs one `requestAnimationFrame` loop that reads the stores with `getState()`,
  computes this frame's trains and hands every layer to the deck.gl overlay with `setProps`. Static
  layers are passed back as the same instances so deck.gl knows they have not changed.
- `useClock` holds `mode: 'live' | 'running' | 'paused'`. While live, the loop sets `ms` to
  `Date.now()` every frame.
- `useView` holds the selection (`train` or `station`, both keyed by `lineId`), the card, following,
  crowded-pick choices and the hidden line set.
- Counts and the open card are painted into the DOM through refs in `readout.ts`, on a quarter-second
  gate. React renders only the shells.
- Picks go through `hoverText` and `pickToSelection` in `MapView.tsx`; `selectionKey` in
  `inspect.ts` deduplicates a crowded pick.
- The deploy is a static-assets Cloudflare Worker. The feeds send `Access-Control-Allow-Origin: *`,
  so nothing changes there.

## Goals / Non-Goals

**Goals**

- Everything that decides what a live vehicle is and how old it is lives in pure functions with time
  as an argument, tested against real recorded feed bytes.
- Live vehicles add no per-frame React work and no per-frame layer rebuilds.
- At most two requests a minute, from one poller, however the components mount.

**Non-Goals**

- Any change to `src/sim`. Live vehicles have no timetable; they do not belong there.
- Static GTFS. See "Feed identifiers, not route names".
- A server, proxy or cache of our own.

## Decisions

### `src/live/`: a pure core and a thin poller

Two source files, split along the purity line:

- `src/live/feed.ts` — pure. `decodeFeed(bytes, mode)` turns a response body into
  `{ headerSec, vehicles, rejected }`. `mergeFixes(held, vehicles)` returns the new held set.
  `ageSec(fixSec, nowMs)` and `freshness(fixSec, nowMs)` classify a fix as `fresh`, `stale` or
  `gone`. No DOM, no `Date.now()`, no top-level `let` — `src/sim/purity.test.ts`'s rules, applied to
  this file by widening that test's glob rather than copying it.
- `src/live/poll.ts` — the side effects: `fetch`, the timer, the page's visibility. It calls the pure
  functions and writes the results to the store. Small enough to check by reading and by eye.

A live vehicle, after decoding:

```ts
type LiveMode = 'bus' | 'ktm'
interface LiveVehicle {
  mode: LiveMode
  id: string              // vehicle.id — a plate for buses, a trip number for KTM
  label: string | null    // KTM's set, e.g. ETS304. Buses send none.
  routeId: string | null  // buses only. KTM sends none.
  tripId: string | null
  position: [number, number]  // [lon, lat]
  bearing: number | null  // null where the mode's bearings are placeholders
  fixSec: number          // the entity's own timestamp, epoch seconds
}
```

**Why not `src/sim`**: `src/sim` is "timetable in, positions out". Putting observed positions there
would blur the one line this change most needs to keep sharp — scheduled against observed.

### Decoding: presence, not defaults, and `Long` made explicit

`gtfs-realtime-bindings` (owner-approved) is the decoder. It is generated protobufjs code for the
GTFS-Realtime schema, and it is what the feed's own specification points to. Two traps were found in
the samples, and both compile cleanly:

- **An absent string decodes as `""`**, not `undefined`. KTM sends no `route_id`, and
  `vehicle.trip.routeId` reads `""`. Every optional field is therefore read through a presence check
  and becomes `null` when absent, so "the feed did not say" cannot turn into a route named nothing.
- **Timestamps are `Long` objects**, because the bindings pull in `long`. They are converted with
  `Number()` once, in `decodeFeed`, and tested. Seconds since 1970 fit a double for millennia.

A body that fails to decode is a feed condition (`unreadable`), not an exception that escapes into the
frame loop.

### Positions that cannot be real

`decodeFeed` sorts every entity into a vehicle or a reject, and each reject carries its reason:

- `missing` — latitude or longitude absent or not finite;
- `null-island` — both within 0.1 degrees (about 11 km) of 0,0. That is what an unset position
  decodes to, and the samples' KTM train at 0.0027, 0.0155 is exactly this. It is its own check, not
  left to the box, so the rule survives if the box is ever widened — to Borneo, say, for another
  Prasarana feed;
- `outside` — outside latitude 0.5–7.5, longitude 99–105. That box holds all of Peninsular Malaysia
  and the Woodlands terminus of the KTM shuttle, and neither operator runs anywhere else.

The result is `rejected: { missing, nullIsland, outside }` counts for the latest response, published
in the feed status and shown by the panel whenever any is non-zero ("1 position unusable:
reported at 0,0"). Rejects never reach `mergeFixes`, so an invalid report cannot replace a valid fix already
held for the same vehicle: that vehicle stays at its last valid position, ageing, until a valid
report or the age rules move it on.

A train in Johor is inside the box and is drawn in Johor. Filtering to the Klang Valley would be
deciding for the feed where its trains ought to be.

### Naming the KTM mode: "KTM ETS (intercity)"

Every KTMB entity sampled was an ETS intercity set, and none was a Komuter train, although Komuter
runs in the Klang Valley all day. Calling the mode "KTM" would let a viewer read an empty Komuter
line as a line with nothing running. So the user-facing name is one constant, `MODE_NAME.ktm =
'KTM ETS (intercity)'` (and `MODE_NAME.bus = 'Rapid KL bus'`), used by the switch, the status line,
the hover text, the card and any legend, so the name cannot differ between them. The explanation of
the data says the KTMB feed carries only ETS and no Komuter. Internal identifiers stay `ktm`: they
name the feed, not what is in it. If Komuter appears in the feed, the name and that sentence change
together — task 7.1's re-sample checks for it.

### Headings: per mode, from what was measured

Every KTM entity in every sample had bearing 0 and speed 90. That is a placeholder, and drawing nine
trains all pointing north would present it as fact. So headings are a per-mode setting: buses carry
theirs, KTM's decode to `null` and KTM is drawn with a directionless marker. The setting is one
constant with the measurement beside it, so if KTM starts sending real bearings the change is one
line and a re-sample.

Speed is not decoded at all. See proposal.md.

### Holding fixes: newest per vehicle, until they age out

The poller keeps, per mode, a map from vehicle id to its newest fix. `mergeFixes` replaces a held fix
only with a strictly newer one, so a late or repeated response never moves a vehicle backwards.
Fixes are dropped when `freshness` says `gone`.

This is also how an empty response is handled honestly. The KTM feed alternated between nine
vehicles and none (proposal.md), so wiping the map on each empty response would make trains blink
out for a minute at a time — reporting the feed's hiccup as the trains' disappearance. Instead the
held fixes stay, **showing their true and growing ages**, and the status line says the latest
response was empty. Nothing is invented: every vehicle drawn is one the feed reported, where it
reported it, with the time it reported it.

### Thresholds: stale at 4 minutes, gone at 10

Ages are `max(0, nowMs / 1000 - fixSec)`, measured from the vehicle's own timestamp. From the
samples, polling as this design does (each feed once a minute):

- A bus fix is up to about 140 s old when fetched, and the next fetch comes up to 60 s later, so a
  bus that is reporting normally reaches about 200 s just before it is refreshed. KTM fixes advance
  every 120 s and arrived up to about 90 s old, which lands in the same range.
- **Stale at 240 s** sits just above that ceiling. Below it, a vehicle is behaving as the feed
  normally does; above it, it has missed at least one report it would ordinarily have sent. The
  longest single gap seen, 270 s, is one vehicle that went stale briefly — which is correct.
- **Gone at 600 s** is long enough that a bus passing through a GPS shadow — a tunnel, a covered
  interchange — comes back rather than vanishing and reappearing, and short enough that a bus that
  has ended its shift leaves the map within minutes.

Both come from one four-minute midday sample, so the task list re-samples at a peak and late at
night before they are final. They are two named constants, and the age itself is always shown, so a
threshold that is slightly off misleads nobody about any particular vehicle.

**Clamping at zero** handles a viewer's clock running behind the feed's — seen at 3 s in sampling.
A page cannot correct its clock from the server: `Date` is not exposed to it under CORS.

### Polling: once a minute per feed, staggered, from one timer

One `setInterval` of a few seconds. On each tick, per mode, a request is made only when **all** hold:
the page is visible, the clock mode is `live`, the viewer has the mode switched on, no request for
it is in flight, and at least 60 s have passed since its last request. KTM's first request is offset
30 s from the bus feed's, so the API sees one request every 30 s.

**Why 60 s, when the docs say the feeds update every 30**: the documented rate limit is 4 requests a
minute, and two feeds at 30 s is exactly 4 — no room for a reload, a second tab, or React's
development double-mount. The measured content changes once a minute for buses and once every two
for KTM vehicles, so polling faster would fetch the same bytes. The decision was "never faster than
the update interval"; this is slower, on the documented limit's say-so.

**Why a polling tick, not a scheduled `setTimeout` per feed**: every condition above can change at
any moment — the tab is shown, Now is pressed, a mode is switched on — and a tick that re-checks them
all needs no listener for any of them. It also keeps the last-request times in the module, not in a
component, so a remount cannot trigger an early request.

Each request uses `AbortSignal.timeout` so a hung connection frees the slot. A `429` is reported as
rate-limited; any other non-2xx or network failure as unavailable. The next attempt still waits the
full minute.

### State: one small store, read by the loop, subscribed to by the panel

`useLive` (Zustand, beside `useClock` and `useView`) holds per mode the held fixes, a version number
bumped when they change, and a status:

```ts
interface LiveStatus {
  state: 'waiting' | 'ok' | 'empty' | 'unavailable' | 'rate-limited' | 'unreadable'
  lastOkMs: number | null   // when the feed last answered with something decodable
  rejected: { missing: number; nullIsland: number; outside: number }  // latest response
}
```

It is written once per response — at most twice a minute. The lines panel subscribes to `status`;
nothing subscribes to the fixes. The frame loop reads both with `getState()`.

`useView` gains `liveOff: ReadonlySet<LiveMode>` with `toggleLive(mode)`, following `hidden` and
`toggleLine`, and a third selection kind:

```ts
interface VehicleSelection { kind: 'vehicle'; mode: LiveMode; id: string }
```

It has no `lineId`, so `toggleLine`, `Card` and the follow code narrow on `kind` before reading one.
`toggleLive` clears a selected vehicle of the mode it hides.

### Drawing: one layer per mode, rebuilt only when something visible changed

`src/map/live.ts` builds the layers. Per mode an `IconLayer` from the installed `@deck.gl/layers` —
no new dependency — with a mask icon so colour comes from `getColor`: an arrowhead for buses,
rotated by bearing, and a disc with no direction arrow for KTM ETS. Sizes are in pixels.

- **Buses under rail**: the live layers go first in the overlay's layer list, so lines, stations and
  trains all draw over them where they cross.
- **Not drowning the network**: buses are small (about 4 px zoomed out, rising to 9 px close in) and
  translucent at city zoom, and they take no line colour — a single neutral colour for all buses, a
  different one for KTM, neither used by any rail line. The values live in one `LIVE_STYLE` object
  beside `WIREFRAME`, taste to be tuned by eye, not contract.
- **Stale**: drawn faded and hollow, so the difference survives in the wireframe view too.
- **The angle**: `IconLayer`'s `getAngle` is not a compass bearing. Its sign and zero, with
  `billboard: false`, are read from the installed layer's source and pinned by a test, exactly as
  `yawFor` was — a wrong sign looks right for a bus going north and wrong for one going east.
- **Cost**: freshness changes only at the thresholds, so the loop recomputes it on the existing
  quarter-second gate and rebuilds a layer only when the fixes' version, the set of stale ids, the
  zoom band or the mode's visibility changed. Otherwise the same instances go back to `setProps`.
- **Not live, not drawn**: when `useClock` is not `live`, the live layers are left out of the list
  entirely, and the loop clears a vehicle selection once.

### Picking and the card

Layers `live-bus` and `live-ktm` are pickable. `hoverText` answers "Bus U6000 · 45 s ago" or
"KTM ETS (intercity) ETS304 · 1 min ago". `pickToSelection` returns a `VehicleSelection`, `selectionKey` gains a
`vehicle:` case, and crowded picks work unchanged.

`Card` gains a vehicle branch: a chip with the mode's `MODE_NAME` and the words **Live GPS**, then rows for route id or
trip id (labelled "feed id"), vehicle id or label, and the age of the report, which `paintCard`
writes through refs like every other ticking value. When the vehicle is no longer held, the card says
it stopped reporting and gives the age of its last report. No follow button: a vehicle that moves
once a minute, in a jump, is not something to follow.

### Feed identifiers, not route names

Bus route ids are internal (`U3000` is the public route `300`). The public numbers are in static GTFS
and every id seen is there, but using them means a generated lookup, a new step in the daily refresh,
and a fallback for ids the lookup has not caught up with. Version 1 ships the fallback alone: the id
as the feed gives it, labelled as a feed id. Route names are a follow-up issue. KTM needs nothing:
its `label` (`ETS304`) already says what the train is.

KTM track is not drawn: KTMB's static feed has no `shapes.txt`, so there is no geometry to draw
without inventing one.

### Tests against recorded bytes

The four responses in `samples/` are copied to `src/live/fixtures/` and become the test fixtures: a
full bus response, a second one a minute later, a KTM response containing the Gulf of Guinea train,
and an empty KTM response. The project has no `@types/node`, which is why `purity.test.ts` reads
sources through Vite; the fixtures are loaded the same way, with `?inline`, and decoded from the
resulting base64. Like the rest of the repository they are a snapshot, and their tests pin values
measured from them: 121 buses, 9 KTM entities of which 8 are usable, 0 in the empty one.

## Risks / Trade-offs

- [The rate limit is shared by everyone behind one address — a mobile carrier's shared NAT, an
  office] → Two requests a minute per tab leaves room, `429` is stated rather than hidden, and
  vehicles already held keep ageing honestly through it. A proxy with a cache would solve it
  properly; it is not in version 1.
- [A `429` or error page may lack the CORS header, so the browser reports a network failure instead
  of a status] → Reported as unavailable, which is still true. Accepted.
- [The viewer's clock is wrong] → Ages are measured against it and cannot be corrected from the
  page. Clamping handles small skews; a clock minutes out would mark everything stale or fresh. The
  explanation of the data says ages are measured by the device's clock.
- [The feeds change — Komuter appears in the KTMB feed, bearings become real, speed changes unit] →
  Nothing hardcodes the nine ETS sets; heading is one constant; speed is not shown. The re-sample
  task records the feed again before release.
- [The decoder is large: about 520 KB of generated code, unminified] → Measured in the build task.
  If it adds more than about 60 KB gzipped to the first load, it is loaded with a dynamic `import()`
  on the first poll instead, which the map does not wait for.
- [Thresholds rest on one midday sample] → Re-sampled at a peak and at night before release; both
  are named constants.
- [A bus at 60 s old is labelled "live"] → That is why the age is on every vehicle, and why the
  explanation says what live means here: the position the vehicle last reported, and when.

## Migration Plan

None. Additive, behind no flag. Rollback is reverting the pull request; nothing is stored or
deployed server-side.

## Open Questions

- Bus route names from static GTFS — a follow-up issue, not needed for this change.
