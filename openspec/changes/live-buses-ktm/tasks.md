# Tasks

## 1. Dependency and fixtures

- [x] 1.1 Add `gtfs-realtime-bindings` to `dependencies` with `npm install gtfs-realtime-bindings`.
      It decodes the GTFS-Realtime protobuf the two live feeds send; the owner approved it in issue
      #40. Verify `npm audit` reports 0 vulnerabilities and `npm run build` still passes.
- [x] 1.2 Copy the four files in `openspec/changes/live-buses-ktm/samples/` to `src/live/fixtures/`
      unchanged. Verify a throwaway test can import one with `?inline` and decode it with
      `transit_realtime.FeedMessage.decode` — this proves the no-`node:fs` loading route before
      anything is built on it.

## 2. The pure core (`src/live/feed.ts`)

- [x] 2.1 Implement `decodeFeed(bytes, mode)` returning `{ headerSec, vehicles, rejected }` with the
      `LiveVehicle` shape in design.md. Read every optional field through a presence check, so KTM's
      absent `route_id` becomes `null` and not `""`; convert `Long` timestamps with `Number()`.
      Verify with tests on the fixtures: the first bus file yields 121 vehicles, every one with a
      route id, a plate as its id and no label; the KTM file yields 8 vehicles with labels
      `ETS30x`, null route ids, and 1 reject; the empty KTM file yields 0 vehicles, 0 rejects and a
      header timestamp.
- [x] 2.2 Reject clearly invalid positions and count them by reason: `missing` (absent or not
      finite), `nullIsland` (both within 0.1 degrees of 0,0, checked on its own and before the box),
      `outside` (outside latitude 0.5–7.5, longitude 99–105). Verify the fixture's Gulf of Guinea
      train counts as `nullIsland`, a KTM train in Johor is kept, and hand-built entities with `NaN`,
      with no latitude, and at a point in Borneo are each rejected under the right reason.
- [x] 2.3 Make heading a per-mode constant: bus bearings kept, KTM bearings decoded as `null`, with
      the measurement (bearing 0 and speed 90 on every KTM entity, 2026-09-25) in a comment beside
      it. Verify every KTM vehicle from the fixture has `bearing === null` and every bus a number.
- [x] 2.4 Make an undecodable body a result, not a throw: `decodeFeed` reports it as unreadable.
      Verify with a test on a few garbage bytes.
- [x] 2.5 Implement `mergeFixes(held, vehicles)`: newest fix per vehicle id, never replaced by an
      older or equal one, returning a new map. Verify merging the second bus file over the first
      moves vehicles that reported again, keeps those that did not, and that merging the first file
      back over the result changes nothing. Also verify that a vehicle held at a valid position and
      next reported at 0,0 stays where it was, because rejects never reach `mergeFixes`.
- [x] 2.6 Implement `ageSec` and `freshness` with `STALE_S = 240` and `GONE_S = 600`, time passed in
      as epoch ms. Verify: 45 s is fresh, 241 s stale, 601 s gone, and a fix 3 s in the future has
      age 0.
- [x] 2.7 Widen `src/sim/purity.test.ts`'s glob to include `src/live/feed.ts`, not `poll.ts`. Verify
      the test fails when a `Date.now()` is temporarily added to `feed.ts`, then passes without it.

## 3. The poller and the store

- [x] 3.1 Add `useLive` in `src/ui/store.ts`: per mode the held fixes, a version, and a `LiveStatus`.
      Written once per response. Verify with a store test that a response writes once and that
      nothing subscribes to the fixes.
- [x] 3.2 Add `liveOff` and `toggleLive(mode)` to `useView`, and `VehicleSelection` to `Selection`.
      Narrow on `kind` wherever `lineId` is read (`toggleLine`, `Card`, follow). `toggleLive` clears
      a selected vehicle of the hidden mode. Verify with store tests, and with `npm run build`
      catching every unnarrowed `lineId`.
- [x] 3.3 Write `src/live/poll.ts`: one interval of a few seconds; per mode, request only when the
      page is visible, the clock is `live`, the mode is on, nothing is in flight and 60 s have passed
      since that feed's last request; KTM offset 30 s from the bus feed. Last-request times live in
      the module so a remount cannot fetch early. Use `AbortSignal.timeout`. Map `429` to
      `rate-limited`, other failures to `unavailable`, empty responses to `empty`. Verify in the
      browser's network panel: one request every 30 s alternating between the two feeds, none while
      the tab is hidden, none after scrubbing, none for a mode switched off, and pressing Now five
      times in a minute adds no request.
- [x] 3.4 Start the poller from `MapView`'s mount effect and stop it in the cleanup. Verify React's
      development double-mount leaves one interval, not two, by the request cadence above.

## 4. Drawing

- [x] 4.1 Write `src/map/live.ts`: an `IconLayer` per mode with a mask icon — arrowhead for buses,
      disc for KTM — pixel sizes, and a `LIVE_STYLE` object holding the colours, sizes, opacities and
      stale look. Neither colour may be a rail line's. Verify with a test that neither mode colour
      equals any line colour in `network.json`.
- [x] 4.2 Write the bearing-to-`getAngle` helper after reading the installed `IconLayer` source for
      its sign and zero with `billboard: false`. Pin it with a test: bearing 90 (east) and bearing 0
      (north) give the angles that source implies. Record in the helper's comment where the sign was
      read from, as `yawFor` does.
- [x] 4.3 Add the live layers to the frame loop's `setProps` list **before** the rail layers, only
      while the clock is `live` and per the mode switches. Rebuild a layer only when the fixes'
      version, the stale set (checked on the quarter-second gate), the zoom band or visibility
      changed. Verify with a test on the rebuild decision, and in the browser that rail draws over
      buses where they cross.
- [x] 4.4 When the clock leaves `live`, clear a vehicle selection once from the frame loop. Verify by
      selecting a bus and dragging the slider: the card closes and the buses disappear.

## 5. Inspection and the panel

- [x] 5.1 Add `MODE_NAME` (`bus: 'Rapid KL bus'`, `ktm: 'KTM ETS (intercity)'`) as the one source
      of each mode's user-facing name. Verify with `grep -rn "'KTM" src` that no other user-facing
      string names the KTM mode.
- [x] 5.2 Extend `hoverText`, `pickToSelection` and `selectionKey` for `live-bus` and `live-ktm`.
      Verify with tests in `inspect.test.ts` for the key, and by hovering a bus in the browser.
- [x] 5.3 Add the vehicle branch to `Card`: a chip with the mode's `MODE_NAME` and **Live GPS**,
      the route or trip as a labelled feed id, vehicle id or label, and the age written by `paintCard`. When the vehicle is
      no longer held, say it stopped reporting and how long ago its last report was. No follow
      button. Verify with a formatting test for the age text, and in the browser by watching a card's
      age tick and reset when a new fix lands.
- [ ] 5.4 Add a Live group to `LinesPanel`: a switch labelled with `MODE_NAME`, a count and a status
      line per mode, from `useLive` status; counts and ages painted through refs, not state. When the clock is not live,
      say live vehicles are only shown at the present moment. State rejects when there are any, with
      the reason ("1 position unusable: reported at 0,0"), and nothing when there are none.
      Verify at phone width, and by keyboard.
- [x] 5.5 Check each failure is stated, by blocking each feed's URL in the browser's developer tools
      and by the empty KTM responses that occur on their own: the panel says unavailable or empty,
      and held vehicles keep ageing rather than vanishing.

## 6. Honesty wording

- [x] 6.1 Change the caption in `App.tsx`, the guide in `Guide.tsx` and
      the canvas `aria-label` from "everything is scheduled" to "trains are scheduled; buses and KTM
      are live GPS, each showing how old its position is". Add to "What this data does not know":
      live ages are measured by the device's clock, bus routes are shown by feed id, KTM speed and
      heading are placeholders in the feed, and **the KTMB live feed currently carries only ETS
      intercity trains and no Komuter, so Komuter trains may be running although none are shown**. Add
      rapid-bus-kl and KTMB to the data credit. Verify by reading every place `grep -ri scheduled
      src` finds.

## 7. Before release

- [ ] 7.1 Re-sample both feeds at a weekday peak (about 08:00 KL) and late at night (about 23:30),
      recording vehicle counts, fix ages, whether KTM still sends placeholder bearings, and whether any
      Komuter train has appeared in the KTMB feed (if so, `MODE_NAME.ktm` and the Komuter sentence
      change together). If a
      normally-reporting vehicle exceeds 240 s, or KTM bearings vary, update the constants and
      design.md in the same commit. Verify the numbers are recorded in the pull request.
- [x] 7.2 Run `npm test`, `npm run build` and `npm audit`: all pass, 0 vulnerabilities. Report the
      bundle's growth from the decoder; if over about 60 KB gzipped, move it behind a dynamic
      `import()` per design.md and re-measure. Verify `ls dist/assets | grep worker` still lists the
      half-megabyte MapLibre worker.
- [x] 7.3 **A human looks at it during service hours** (about 06:00 to 23:00 KL): buses spread across
      the city and moving between polls in jumps, KTM trains where the feed puts them, ages on hover
      and in cards, a stale vehicle faded, rail still legible over the buses at city zoom, and the
      live vehicles vanishing with the reason stated when the clock is scrubbed. Tune `LIVE_STYLE`
      by eye here. Not done until somebody has seen it.
- [x] 7.4 Update `CLAUDE.md`: the Status section (live vehicles, the two thresholds, the rate limit
      and why polling is once a minute, the KTM placeholders, the `""`-for-absent trap), the stack
      line that says buses and KTM come later, and the architecture block with `src/live/`. Open an
      issue for bus route names from static GTFS. Open the pull request with `Closes #40`.
