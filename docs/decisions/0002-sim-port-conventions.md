# 0002. Conventions fixed by the simulation port

Status: Accepted
Date: 2026-09-19

## Context

Milestone 2 ported the simulation out of `reference/prototype.html` into `src/sim/`. The prototype
is already correct — `reference/sim-golden.json` records its exact output for the shipped feed — so
most of the port was mechanical.

Five things were not mechanical. Each fixes a convention that Milestones 3 to 7 will build on, and
each would be expensive to change later, so they are recorded together here.

Before any of this was written, the whole module was independently re-implemented in Python and run
against the golden file, and afterwards the test suite was written by a second party working from
the spec rather than from the code. All five decisions below are therefore backed by a passing
comparison against 7 cases and 210 enumerated trains, not by reading alone.

## Decision

### 1. Bearings are compass bearings, computed in metre space

`pointAt` returns `bearingDeg` where 0 is north, 90 is east, increasing clockwise, in the range
`[0, 360)`. It is computed as `(Math.atan2(tx, -tz) * 180 / Math.PI + 360) % 360`, where `tx` and
`-tz` are the eastward and northward components of the unit tangent **in the network's local metre
space**.

The prototype had no compass bearing. Its only heading maths was `Math.atan2(P.tx, P.tz)`, a
Three.js Y-rotation measured from `+z`, which points south — 180° away. That convention is not
carried over.

The bearing must not be computed from longitude and latitude deltas. At this latitude a degree of
longitude is 111,155 m and a degree of latitude is 110,574 m, so `atan2(dLon, dLat)` tilts every
bearing by up to about 0.15°, which is more than the 0.1° the golden file is compared at.

### 2. `pointAt` returns longitude and latitude, and allocates

The prototype's signature was `pointAt(line, at, reversed, out)`, writing `{x, z, tx, tz}` into a
caller-owned scratch object to avoid allocating sixty times a second. The port is
`pointAt(line, at, reversed): { lon, lat, bearingDeg }`.

The map works in longitude and latitude, so the conversion belongs in one place rather than at every
call site. Three numbers per train per frame is not an allocation worth designing around, and a
function that does not write into its arguments is easier to reason about and to test.

### 3. `prepare` does not mutate its argument

The prototype monkey-patches `xs`, `zs`, `cum`, `total`, `duration` and `deps` onto the network
object it is handed. `prepare(net: Network): PreparedNetwork` builds and returns new objects
instead.

`data/network.json` is imported as an ES module, so every importer shares one object. Mutating it
would leak between test files in the same worker, and under `resolveJsonModule` the imported type
has none of those fields, so every write would be a type error.

### 4. Distances stay Euclidean in the feed's own flat projection

`data/network.json` carries its projection in `origin`: `kx = cos(radians(3.12)) * 111320`,
`ky = 110574`, about `lon0 = 101.62`, `lat0 = 3.12`. The forward transform is
`x = (lon - lon0) * kx`, `z = -(lat - lat0) * ky`, so north is `-z`.

Every distance in the simulation — the cumulative table, `alongMetres`, each stop's `at` — is a
plain Euclidean distance in that space. Ampang computes to 14,892.7 m against the feed's stated
`length_m` of 14,893.

Haversine or a geodesic length from a library would be more correct in a global sense, move every
distance, break the golden comparison, and add a dependency to solve a problem a 50 km network does
not have.

### 5. `firstDeparture` returns `number | null`

The prototype returns `Infinity` when a day type has no service, and `hhmm(Infinity)` renders
`"NaN:NaN"`. `Infinity` is a perfectly good `number`, so nothing would catch that at build time.
Returning `null` puts the absence in the type and forces every call site to handle it.

## The bug we chose to keep

`nextDepartures` scans yesterday's departures before today's, and both passes share one
`out.length < count` quota. If yesterday fills the quota, today's pass never runs, and one of
today's departures could in principle be earlier than the last value returned.

It is ported unchanged, with a comment naming it. It does not bite on the shipped feed: near-midnight
leftovers are few, and outside the small hours the lower bound lands past the end of yesterday's
array.

The reasoning is the project's honesty rule applied to behaviour rather than data. A quiet fix would
still pass the single golden case the file records, while changing behaviour nobody wrote down. If
it should be fixed, that is its own change, with its own spec delta and a regenerated golden file.

## Consequences

**Milestones 3 and 4 are bound to these signatures.** The drawing layer consumes `pointAt`'s
`{ lon, lat, bearingDeg }` directly, and the animation loop calls `activeTrains` every frame. The
train id format `` `${line.id}${dir.dir}${svc}${shift}_${k}` `` is kept byte-for-byte because
deck.gl will use it as an object key; changing it later would churn every layer's diffing.

**`src/sim` is enforced pure, not merely documented pure.** `src/sim/purity.test.ts` reads the
module's own source at test time and fails if any file contains `Date.now`, `document`, `window`, or
a top-level `let`/`var`. That test was itself verified by introducing each violation in turn and
confirming it failed. Time is an argument everywhere, so any moment can be simulated and any result
reproduced.

**The golden file is pinned to this feed snapshot.** When the daily refresh in Milestone 7 changes
the timetable, these numbers will stop matching, and that is correct rather than a regression. The
golden tests run against `data/network.json` as shipped; the refresh job needs general rules instead
— every line has trains at 08:00 on a weekday, nothing runs at 03:00, no train exceeds 120 km/h.

**One escape hatch exists in the type system.** `src/sim/network.ts` holds the single
`as unknown as Network` in the codebase, because TypeScript widens the JSON's fixed-length arrays
(`path` to `number[][]`, each headway triple likewise) and those are not assignable to the tuple
types the simulation uses. It is one line, commented, and `src/network.test.ts` checks the file's
real shape at runtime.

**A guard exists that protects nothing.** `progress` guards against a zero-length
`(b.arr - a.dep)` interval. Reaching that branch requires `offset >= a.dep` and `offset < b.arr`
simultaneously, so the condition is a contradiction rather than a rare input — the guard is
unreachable by construction on any feed. It is kept because it costs nothing and states the
invariant, and noted here so nobody later mistakes it for real protection.
