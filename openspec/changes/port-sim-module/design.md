# Design

## Context

The simulation exists and is correct. `reference/prototype.html` holds it between `//SIM-START`
(line 217) and `//SIM-END` (line 306), with the clock helpers at lines 311–326.
`reference/sim-golden.json` records its exact output for the network snapshot in `data/network.json`.

Before writing this design, the whole module was re-implemented independently in Python and run
against the golden file. All seven cases and all 210 enumerated trains matched exactly. Everything
below about rounding, ordering and the coordinate maths is therefore verified rather than assumed.

The port is mostly mechanical. The decisions worth writing down are the four places where it must
deliberately *not* be mechanical, and the traps that strict TypeScript will spring.

## Goals / Non-Goals

**Goals**

- Reproduce the golden file exactly.
- A `src/sim/` that obeys the architecture rules in `CLAUDE.md`: pure, no DOM, no `Date.now()`, time
  as an argument.
- Signatures that Milestones 3 and 4 can build on without rework.

**Non-Goals**

- Drawing anything. No deck.gl, no React, no change to `src/map/`.
- Improving the simulation. Where the prototype has a quirk, the quirk is ported and documented.
- Performance work. The prototype already does a binary search per direction per frame and is fast
  enough; measure before changing anything.

## Decisions

### The bearing convention changes, and must be computed in metre space

The prototype's only heading maths is at line 686:

```js
dummy.rotation.set(0, Math.atan2(P.tx, P.tz), 0);
```

That is a Three.js Y-rotation measured from `+z`, which in this projection points south. A
northbound train comes out at ±180°, not 0°. There is no compass bearing anywhere in the prototype;
`bearingDeg` in the golden file is a new convention introduced by this port.

The correct computation is:

```ts
const bearingDeg = (Math.atan2(tx, -tz) * 180 / Math.PI + 360) % 360
```

where `tx` and `tz` are the components of the unit tangent in the network's local metre space.
`tx` is the eastward component and `-tz` the northward one, so `atan2(east, north)` is exactly the
compass convention: 0 = north, 90 = east, clockwise.

**This must be computed from the metre-space tangent, not from longitude and latitude deltas.** A
degree of longitude at this latitude is 111,155 m; a degree of latitude is 110,574 m. Using
`atan2(dLon, dLat)` tilts every bearing by up to about 0.15°, which is more than the 0.1° tolerance
the golden file is compared at. Equivalently, scale the longitude delta by `kx` and the latitude
delta by `ky` before taking the arctangent.

**Alternative rejected:** computing bearing with a geodesic formula from a library such as turf.js.
It would be more "correct" in a global sense, disagree with the golden file, and add a dependency to
solve a problem the flat projection does not have over a 50 km network.

### `prepare` returns a new network instead of mutating its argument

The prototype does this:

```js
line.xs = new Float64Array(n); line.zs = new Float64Array(n); line.cum = new Float64Array(n);
```

— monkey-patching derived fields onto the line objects it was handed. That is fine in a single-file
page that owns the only copy. It is not fine here: `data/network.json` is imported as an ES module,
so every importer shares one object. Mutating it would leak across test files in the same Vitest
worker, and under `resolveJsonModule` the imported type has none of those fields, so every write is
a type error.

`prepare(net: Network): PreparedNetwork` therefore builds and returns new objects. The spec states
this as a requirement because a caller can observe the difference.

### Distances stay Euclidean in the network's own flat projection

`data/network.json` carries its projection:

```json
"origin": { "lat": 3.12, "lon": 101.62, "kx": 111154.99397359774, "ky": 110574.0 }
```

and `scripts/build_network_json.py` (lines 23–25) generated it as
`kx = cos(radians(3.12)) * 111320.0`, `ky = 110574.0`. The forward transform is

```
x =  (lon - lon0) * kx      // metres east
z = -(lat - lat0) * ky      // metres south, so north is -z
```

The cumulative-distance table and every `at` value in the timetable are Euclidean distances in that
space. `alongMetres` in the golden file is that quantity — Ampang's computed total is 14,892.7 m
against the feed's stated `length_m` of 14,893.

**Do not substitute haversine or a geodesic length.** It would move every `alongMetres` value and
break the golden comparison, to gain accuracy the timetable was never built with.

`kx` and `ky` are read from the data. There is no second copy to hardcode.

The inverse, for `pointAt`, is:

```ts
const lon = origin.lon + x / origin.kx
const lat = origin.lat - z / origin.ky   // minus, because z runs south
```

Because the projection is affine, interpolating in x/z and then converting gives the same answer as
interpolating longitude and latitude directly. The x/z route is the one that was verified to six
decimal places on all 210 golden trains, so it is the one to use.

### The bug in `nextDepartures` is ported as written

```js
for (const [svc, shift] of [[svcYesterday, DAY], [svcToday, 0]]) {
  const deps = dir.deps[svc]; if (!deps) continue;
  const t = nowSec + shift;
  for (let k = lowerBound(deps, t - lead); k < deps.length && out.length < count; k++) ...
}
```

The yesterday pass runs first and is capped by `out.length < count`. If yesterday fills the quota,
today's pass never runs, and one of today's departures could in principle be earlier than the last
value returned. It never bites on the shipped feed: near-midnight leftovers are few, and outside the
small hours the lower bound lands past the end of yesterday's array.

It is ported unchanged, with a comment naming it. `CLAUDE.md`'s honesty rule is about data, but the
same reasoning applies here: silently "fixing" it would still pass the single golden case while
changing undocumented behaviour. If it should be fixed, that is its own change, with its own spec
delta and its own golden regeneration.

### The clock helpers split: arithmetic stays, state leaves

`klNow` reads a module-level mutable `clock` object and `Date.now()`. `setTimeOfDay` mutates that
object and calls `syncButtons()`, which touches the DOM. Neither may exist in `src/sim`.

The arithmetic is worth keeping exactly:

```js
const k = new Date(clock.ms + KL_OFFSET), dow = k.getUTCDay();
const sec = k.getUTCHours()*3600 + k.getUTCMinutes()*60 + k.getUTCSeconds() + k.getUTCMilliseconds()/1000;
```

Shifting the epoch by eight hours and then reading only `getUTC*` fields gives Kuala Lumpur wall
clock on any host, in any time zone, with no date library. That trick is the whole reason the
project has no time-zone bug.

It is also a trap: the shifted `Date` is a deliberate lie, and calling `getHours()`, `getDate()` or
`toLocaleDateString()` on it mixes the browser's own offset back in and gives a wrong answer on
every machine that is not on UTC. The port therefore returns plain numbers — `{ dow, sec, today,
yesterday }` plus explicit date parts read via `getUTC*` — rather than handing a booby-trapped
`Date` to callers.

Signatures become `klNow(epochMs, override = 'auto')` and
`setTimeOfDay(epochMs, sec): number`. The `clock.live`, `clock.paused`, `clock.speed` and
`clock.override` fields become React state in Milestone 5.

Note that when `override` is not `'auto'`, *both* today and yesterday take the forced day type. That
is why golden case 0 reads `serviceYesterday: "MonFri"`.

### Ordering is part of the contract

The golden `trains` arrays are compared positionally, so the iteration order is load-bearing: lines
in `network.json` order (AG, KJ, PH, KGL, PYL, MR, BRT, SA), direction 0 then 1, today's pass then
yesterday's, each ascending by departure. No sorting, no reordering, no parallelising.

`nextDepartures` scans in the opposite order — yesterday then today — and then sorts, so its pass
order is not observable except through the quota bug above. Keep both as they are.

### Tests compare by rounding, not `toBeCloseTo`

The golden values were produced by rounding, so the test should round identically and use `toBe`:

```ts
expect(Math.round(train.at * 10) / 10).toBe(expected.alongMetres)
expect(Math.round(point.lon * 1e6) / 1e6).toBe(expected.lon)
expect(Math.round(point.bearingDeg * 10) / 10).toBe(expected.bearingDeg)
```

`toBeCloseTo(x, 1)` passes when the difference is under 0.05 — which is exactly the worst-case
rounding error, so a value landing on a boundary can flake. Round-then-`toBe` is both stricter and
stable.

## Risks / Trade-offs

**The golden file is pinned to this feed snapshot.** When Milestone 7's daily refresh changes the
timetable, these numbers stop matching, and that is correct. Mitigation: the golden test imports
`data/network.json` as shipped, and the refresh job gets general rules instead (every line has
trains at 08:00 on a weekday, nothing runs at 03:00, no train exceeds 120 km/h). `GUIDE.md` already
calls this out.

**Literal union types make the build brittle to feed changes.** Typing `mode` as
`'LRT' | 'MRT' | 'MRL' | 'BRT'` gives exhaustive switches, but a refreshed feed adding a mode breaks
`npm run build` rather than degrading in the UI. Taken deliberately: for this project a loud build
failure is better than a silently unstyled line. `dir` stays `0 | 1`, which the feed structure
guarantees.

**`Record<DayType, …>` asserts all three day types exist.** True for all 16 directions today. The
prototype's `if (!deps) continue` guard becomes dead code under that type. Resolution: type the
expanded departures as `Partial<Record<DayType, number[]>>` and keep the guard meaningful, rather
than deleting a guard that protects against a feed that drops a day type.

**`progress` indexes `s[i - 1]` without a bound check.** Safe only because `stops[0].arr === 0` on
every direction (verified on all 16), so `i === 0` always takes the dwelling branch first. The port
adds one explicit guard rather than a non-null assertion, so the invariant is stated rather than
assumed.

**`(b.arr - a.dep)` could be zero**, giving `Infinity` or `NaN` that would propagate silently into
rendered positions. Never zero in the shipped feed (verified), but one guard costs nothing and a
refresh could introduce it.

## Migration Plan

None. Nothing consumes `src/sim` yet; this change creates it. `src/network.test.ts` continues to
pass untouched.

## Open Questions

None outstanding.

**Resolved: `firstDeparture` returns `number | null`, not `Infinity`.** The prototype returns
`Infinity` for a day type with no service, and `hhmm(Infinity)` renders `"NaN:NaN"`. `Infinity` is a
perfectly good `number` as far as the type checker is concerned, so nothing would catch that at
build time. Returning `null` makes the absence part of the type, and every call site has to handle
it before formatting. This is a deliberate divergence from the prototype; the golden file does not
cover this function, so nothing is broken by it.
