# Tasks

## 1. The store

- [x] 1.1 Create a Zustand store in `src/ui/` holding `mode: 'live' | 'running' | 'paused'`,
      `speed: 1 | 10 | 60`, `override: 'auto' | DayType` and `ms`. Model the mode as one value, not
      as independent booleans, so `live && paused` cannot be expressed. Verify with `npm run build`.
- [x] 1.2 Implement the transitions as actions: `now()` (live, speed 1, **and override back to
      auto**), `togglePause()` (Play returns to `running` at the remembered speed, never to `live`),
      `setSpeed(n)` (1× keeps `live` if already live, otherwise `running`), `setOverride(v)`,
      `scrubTo(sec)` (`live` becomes `running`, `paused` stays paused), `jumpToPeak()`. Verify with
      unit tests over every transition in design.md's list — the store is pure, so this is ordinary
      testing.
- [x] 1.3 Verify `ms` is written without notifying subscribers: nothing may subscribe to a value that
      changes 60 times a second.

## 2. The frame loop reads the store

- [x] 2.1 Replace the loop's private clock ref with `useStore.getState()`. Do **not** add store
      values to the effect's dependencies — that would tear down and rebuild the map on every click —
      and do not mirror them into refs. Verify pressing 60× changes the speed without remounting the
      map.
- [x] 2.2 Implement the three modes in the loop: `live` snaps to real time, `running` advances by
      `delta * speed`, `paused` does nothing. Keep the 250 ms delta clamp. Verify each mode by eye.
- [x] 2.3 Delete `FORCED_START` and the `?t=HH:MM` parameter. The real controls replace it, and two
      things with a claim on the starting time is one too many. Verify the constant is gone.
- [x] 2.4 Publish "is anything running" to the store **only when it changes**, not every frame.
      Verify with a check that the store is not written on a frame where the answer is unchanged.

## 3. The clock panel

- [x] 3.1 Render the time as `HH:MM:SS`, formatted in the UI — `hhmm` is minutes only and `pad` is
      not exported from `src/sim`. Have the frame loop write it through a ref rather than through
      React state, gated on the whole second **and on real time**, because the simulated-second gate
      fires ~60 times a real second at 60×.
- [x] 3.2 Render the date from `t.day` and `MONTHS[t.month - 1]`. **`t.month` is 1-based** where the
      prototype's `getUTCMonth()` was 0-based; off by one shifts every month and looks plausible.
      Never reconstruct a `Date` to format it — that re-introduces the host time zone. Verify with a
      test on the formatting helper.
- [x] 3.3 Render which timetable is in force, plus the clock's mode. Use the existing
      `.hide-s`/`.show-s` media-query pattern for the short and long forms rather than reading
      `innerWidth`, which would otherwise happen inside the frame loop.

## 4. The controls

- [x] 4.1 Time-of-day slider as an **uncontrolled** `<input type="range">` — a controlled value fed
      from 1 Hz state yanks the thumb out from under a drag. The loop writes `.value` when the user
      is not holding it. Add `aria-valuetext` so a screen reader says "07:45" rather than "27900".
- [x] 4.2 Track the drag with a **ref, not state** — it is read at 60 Hz and written on every pointer
      move. Note React's `onChange` on an input is the `input` event, so the prototype's
      `input`/`change` pair does not port: use pointer events or a native `change` listener via a
      ref. Verify the slider still follows the clock after a drag, which is what breaks if this is
      wrong.
- [x] 4.3 Now / Pause buttons with `aria-pressed`, and 1× / 10× / 60× as a labelled group. Native
      `<button>`s, for the reason `ModeSwitch.tsx` already gives. Verify by keyboard.
- [x] 4.4 Timetable override as a `<select>`, controlled from the same state `now()` resets — or
      pressing Now will leave the visible option disagreeing with the actual override.

## 5. The notice and the honesty line

- [x] 5.1 Show a notice when nothing is running, saying when the first trains of that timetable
      leave, with a button that jumps to the morning peak and un-pauses. Give it its own class —
      **`.notice` is already taken** by the red no-WebGL2 message.
- [x] 5.2 Handle `firstDeparture` returning `null`: the notice needs a branch saying the timetable
      has no service at all. `hhmm(null)` will not compile, which is the point.
- [x] 5.3 Give the scheduled-not-live explanation room to say what it means, rather than a caption
      fragment. It must stay visible without the viewer looking for it.

## 6. Layout and close out

- [x] 6.1 Lay the controls out as a bottom bar, collapsing to two rows at phone width, following the
      conventions in `src/index.css`. Do not cover MapLibre's attribution — `CLAUDE.md` requires
      crediting OpenStreetMap. Leave the left side below the caption free: it is Milestone 6's lines
      panel. Verify at 400 px wide.
- [x] 6.2 Run `npm test` and `npm run build`; both must pass with the existing 141 tests green, and
      `npm audit` must stay at 0.
- [ ] 6.3 **Look at it in a browser**: scrub through a whole day and watch service build up and wind
      down, check each speed, check the notice appears in the small hours, and check it at phone
      width. Not done until a human has seen it.
- [x] 6.4 Update `CLAUDE.md`'s Status and Commands, and open a pull request referencing issue #20
      with `Closes #20`.
