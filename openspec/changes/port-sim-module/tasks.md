# Tasks

## 1. Types

- [x] 1.1 Create `src/sim/types.ts` with the `network.json` shape: `DayType`, `HeadwayWindow`,
      `Origin`, `LonLat`, `Stop`, `Direction`, `Mode`, `Line`, `Station`, `Network`. Verify by
      running `npm run build` — it must type-check with no `any`.
- [x] 1.2 Add the prepared and result types: `PreparedDirection` (adds `duration` and a
      `Partial<Record<DayType, number[]>>` of expanded departures), `PreparedLine` (adds `xs`, `zs`,
      `cum`, `total`), `PreparedNetwork`, `Progress`, `ActiveTrain`, and `Point`
      (`{ lon, lat, bearingDeg }`). Verify with `npm run build`.
- [x] 1.3 Add a single typed entry point for the imported JSON (the inferred type of
      `import network from '../../data/network.json'` is not assignable to `Network` — `number[][]`
      is not `[number, number][]`), so exactly one `as unknown as Network` exists in the codebase.
      Verify `npm run build` passes and `src/network.test.ts` still compiles untouched.

## 2. Preparing the network

- [x] 2.1 Implement `prepare(net: Network): PreparedNetwork` in `src/sim/prepare.ts`: project each
      path vertex to local metres (`x = (lon - lon0) * kx`, `z = -(lat - lat0) * ky`), build the
      cumulative distance table, and set `total`. Verify with a test asserting the Ampang line's
      computed `total` is 14892.7 m to one decimal.
- [x] 2.2 Expand each direction's headway windows into a sorted list of departure seconds, using
      `for (t = start; t < end; t += headway)` — **end-exclusive**. Verify with a test asserting the
      Ampang line's direction 0 has 249 `MonFri` departures and 209 on `Sat`.
- [x] 2.3 Set each direction's `duration` to its last stop's `dep`. Verify with a test that every
      direction's duration is greater than zero and less than 7200 s.
- [x] 2.4 Verify `prepare` does not mutate its argument: a test that snapshots
      `JSON.stringify(network)` before and after preparing, and asserts they are identical.

## 3. The simulation core

- [x] 3.1 Implement `lowerBound(arr, x)` in `src/sim/` — first index where `arr[i] >= x`. Verify
      with a unit test covering an empty array, a value below all elements, above all elements, and
      an exact match on a duplicate.
- [x] 3.2 Implement `progress(dir, offset)`, keeping the smoothstep easing `f * f * (3 - 2 * f)`
      exactly. Add the explicit guard for `i === 0` rather than a non-null assertion, and a guard
      against a zero-length `(b.arr - a.dep)` interval. Verify with a test that a train at offset 0
      is dwelling at stop 0, and one past the trip duration returns `null`.
- [x] 3.3 Implement `pointAt(line, at, reversed): Point` — binary-search the segment, interpolate in
      metre space, keep the `|| 1` guard for zero-length segments (not `??`), then invert the
      projection to `lon`/`lat` and compute `bearingDeg` as
      `(Math.atan2(tx, -tz) * 180 / Math.PI + 360) % 360`. Verify with a test that a distance below
      0 and above `total` clamp to the line's endpoints, and that the two directions at the same
      point differ by 180°.
- [x] 3.4 Implement `activeTrains(net, nowSec, svcToday, svcYesterday)`, preserving the iteration
      order exactly: lines in file order, direction 0 then 1, today's pass then yesterday's. Keep
      the train id format `` `${line.id}${dir.dir}${svc}${shift}_${k}` `` byte-for-byte, since
      Milestone 4 will use it as a React/deck.gl key. Verify with the one-line sanity check:
      `activeTrains(prepared, 28800, 'MonFri', 'MonFri').length === 196` and 33 of them dwelling.
- [x] 3.5 Implement `nextDepartures(dir, j, nowSec, svcToday, svcYesterday, count)` **as written in
      the prototype**, including the yesterday-first pass and the `out.length < count` cap. Add a
      comment naming the latent bug and pointing at design.md. Verify against the golden
      `nextDepartures` case.
- [x] 3.6 Implement `firstDeparture(net, svc): number | null`, returning `null` where the prototype
      returns `Infinity`. Verify with a test asserting 21600 for `MonFri` on the shipped feed.

## 4. The Kuala Lumpur clock

- [x] 4.1 Implement `svcOf(dow)` and `klNow(epochMs, override = 'auto')` in `src/sim/clock.ts`,
      returning plain numbers (`dow`, `sec`, date parts read via `getUTC*`, `today`, `yesterday`)
      rather than a shifted `Date`. Verify with a test that a known UTC epoch yields the expected KL
      date and `sec`.
- [x] 4.2 Verify time-zone independence: a test that runs `klNow` for a fixed epoch and asserts the
      result, run under `TZ=America/New_York` as well as the default, proving nothing reads the host
      zone.
- [x] 4.3 Implement `setTimeOfDay(epochMs, sec): number` as a pure function returning the new epoch.
      Leave `clock.live` and `syncButtons()` behind — they belong to React in Milestone 5. Verify
      with a test that the returned epoch has the same KL date and the requested `sec`.
- [x] 4.4 Verify `override` forces both today and yesterday to the same day type (this is why golden
      case 0 reads `serviceYesterday: "MonFri"`).

## 5. Golden tests

- [x] 5.1 Write `src/sim/golden.test.ts` loading `data/network.json` and `reference/sim-golden.json`,
      iterating all seven cases and asserting `total`, `byLine` (with `toEqual`, since lines with
      zero trains are omitted) and `atPlatform`. Verify all seven pass.
- [x] 5.2 Extend it to the two cases that enumerate trains, comparing positionally and rounding
      identically to the golden file — `Math.round(v * 10) / 10` for `alongMetres` and `bearingDeg`,
      `Math.round(v * 1e6) / 1e6` for `lon`/`lat` — with `toBe`, not `toBeCloseTo`. Verify all 210
      trains match.
- [x] 5.3 Add the `nextDepartures` golden case, resolving `stopId` `KJ14` to its index via
      `findIndex` rather than hardcoding 23. Verify it returns `[77, 317, 557]`.
- [x] 5.4 Add a purity test: assert `src/sim` source files contain no `Date.now`, no `document`, no
      `window`, and no top-level `let`/`var`. Verify it fails if a violation is introduced.

## 6. Close out

- [x] 6.1 Run `npm test` and `npm run build`; both must pass with no warnings introduced.
- [x] 6.2 Update the Status section of `CLAUDE.md` for Milestone 2, and add anything learned about
      the feed to the "What we learned about this feed" section. Verify by reading it back.
- [x] 6.3 Write `docs/decisions/0002-sim-port-conventions.md` recording the bearing convention flip,
      the non-mutating `prepare`, the metre-space distance decision, the ported `nextDepartures`
      bug, and `firstDeparture` returning `null`. Verify the file exists and is linked from
      `docs/decisions/README.md`.
- [x] 6.4 Open a pull request referencing issue #5 with `Closes #5`, explaining `progress()` and
      `activeTrains()` in plain English in the description.
