# Design

## Context

The frame loop holds the simulated clock in a private ref and nothing can reach it. `?t=HH:MM` was
scaffolding, always meant to be deleted here.

Everything below was read out of `reference/prototype.html` and checked against the ported `src/sim`
API. Where the port must differ from the prototype, it says why — and several of those differences
are places where a literal transliteration compiles and then misbehaves.

## Goals / Non-Goals

**Goals**

- Every control from the prototype, working, at phone width, by keyboard.
- No `setState` at sixty frames a second.
- A state model in which the prototype's contradictory combinations cannot be expressed.

**Non-Goals**

- Selection, cards, follow-camera, per-line visibility. Milestone 6.
- A calendar. The override picks a day *type*; the feed has no holiday data and the app must not
  imply otherwise.

## Decisions

### Three modes and a speed, not five booleans

The substance of this change.

The prototype's whole use of its clock record is one line:

```js
if (clock.live) clock.ms = Date.now(); else if (!clock.paused) clock.ms += dt * clock.speed;
```

`live` shadows everything. When it is set, `paused` and `speed` are dead — the timestamp is replaced
with wall time every frame. That is why every speed button and the pause button clear it.

Carried over as five independent values, `live && paused` and `live && speed === 60` become
representable, and the loop honours only half of each while the display confidently reports the
other. So:

```ts
mode: 'live' | 'running' | 'paused'
speed: 1 | 10 | 60        // meaningless while live, remembered across a pause
override: 'auto' | DayType
ms: number                // the simulated moment
```

Transitions, as the prototype actually implements them — worth stating because two are easy to get
wrong:

- **Now** → `live`, speed 1, **and `override` back to `auto`**. It is the only full reset, and the
  override part is easy to miss.
- **Pause** → `paused`. **Play** → `running` at the remembered speed, and **never back to `live`**.
  Only Now returns to live.
- **1×** → from `live`, stay `live` (real speed *is* live speed); otherwise `running` at 1×.
- **10× / 60×** → `running` at that speed, from any mode.
- **Slider** → sets `ms`; `live` becomes `running`; `paused` **stays paused**, because scrubbing a
  frozen clock is the useful behaviour.
- **Jump to the peak** → 07:45, and un-pauses.

### Zustand, and specifically why

`GUIDE.md` asks that this be proposed and agreed. A ref plus a throttled update, with no dependency,
was proposed; the owner chose Zustand. It is a good fit for one specific reason worth writing down.

The frame loop is created once inside an effect that runs on mount. Anything it reads from React
state is **captured at mount and frozen** — press 60× and the loop keeps using 1× forever. The usual
fixes are both bad: adding the state to the effect's dependencies tears down and rebuilds the map on
every click, and mirroring state into refs means writing the same value twice and keeping them in
step by hand.

`useStore.getState()` inside the loop reads the current value with no subscription, no dependency and
no mirror. Components use the hook and re-render; the loop uses `getState()` and does not.

`ms` lives in the store too, written by the loop each frame. That is a mutation the store does not
notify on — deliberately: nothing may subscribe to `ms`, because it changes sixty times a second.

### What updates, and how often

`CLAUDE.md`: "Keep React out of the frame loop." Applied here:

| What | How | Rate |
|---|---|---|
| Trains | `overlay.setProps` | 60 Hz |
| Clock text, date, timetable line, slider position | the loop writes the DOM through refs | at most a few times a second |
| Whether anything is running at all | store, written **only when it changes** | a handful of times a day of scrubbing |
| Mode, speed, override | store, written by clicks | per click |

The prototype gates its clock text on `whole !== lastSecond`. Note that is a **simulated** second:
at 60× it fires about sixty times a real second. Harmless for three `textContent` writes, a
re-render storm if it drives React state. The port gates on real time as well.

### The slider is uncontrolled, and its drag flag is a ref

Two traps that both compile.

**React's `onChange` on an input is the `input` event.** The prototype distinguishes `input` (fires
throughout a drag) from `change` (fires on release) to know when the user has let go. In JSX both
`onChange` and `onInput` fire on every drag pixel, so a flag set by one and cleared by the other
never clears — and the slider stops following the clock forever after the first drag. Pointer
events, or a native `change` listener attached through a ref.

**A controlled slider fights the drag.** Feeding `value` from state updated once a second yanks the
thumb out from under the user — exactly the fight the drag flag exists to prevent, reintroduced by
React's own render. So: uncontrolled, with the loop writing `.value` when the user is not holding it.

The flag itself is a ref, not state: it is read at 60 Hz and written on every pointer move.

### Ported API differences that will bite

Each of these is a place where the prototype's code transliterates cleanly and then misbehaves.

- **`setTimeOfDay` returns a number and mutates nothing.** The prototype's version also set
  `live = false` and called `syncButtons()`. Every call site must now do both itself. Forget the drop
  out of live and the slider appears dead, because the next frame overwrites the time with the real
  clock.
- **`firstDeparture` returns `number | null`.** The notice needs a branch. `hhmm(null)` does not
  compile, which is the point of the change.
- **`klNow` no longer returns the shifted `Date`.** Build the date from `t.day` and
  `MONTHS[t.month - 1]` — **`t.month` is 1-based** where `getUTCMonth()` was 0-based. Off by one
  shifts every month and looks plausible. And never reconstruct a `Date` to call
  `toLocaleDateString`: that re-introduces the host time zone the whole design exists to avoid.
- **`hhmm` is minutes only and `pad` is not exported.** The `HH:MM:SS` readout formats itself in the
  UI. Adding to `src/sim` would need a test and would have to satisfy its purity suite, for two lines
  of formatting.

### Layout

A bottom bar, full width, collapsing to two rows at phone width. Top-left is the caption, top-right
is MapLibre's navigation control with the mode switch beneath it, and the left side below the caption
is **reserved for Milestone 6's lines panel** — do not take it.

The bar must not cover MapLibre's attribution in the bottom right. `CLAUDE.md` requires crediting
OpenStreetMap, so the bar sits above it or stops short of it.

Existing conventions, from `src/index.css`: absolute positioning, `z-index: 1`, 10 px from the
viewport edge, `rgba(17,17,17,0.8)` with a 4 px backdrop blur, 8 px radius, no borders or shadows.
The responsive text variants are done with the existing `.hide-s` / `.show-s` media-query pattern
rather than by reading `innerWidth`, which would otherwise happen inside the frame loop.

`.notice` is **already taken** by the red no-WebGL2 message. The no-trains panel needs its own class.

### Native elements, for the reason `ModeSwitch` already gives

`<input type="range">`, `<button aria-pressed>`, `<select>`. Keyboard operation, focus rings and
screen-reader announcements come from the browser, and hand-rolling them is how they get missed.

One addition the prototype lacks: `aria-valuetext` on the slider, so a screen reader says "07:45"
rather than "27900".

## Risks / Trade-offs

**The clock text is written imperatively.** Deliberate, and the reason is in the table above, but it
means those elements are outside React's model and must be cleaned up with the loop.

**A backgrounded tab at 60× falls behind.** The frame delta stays clamped at 250 ms, so a clamped
frame is still fifteen simulated seconds. The alternative is a tab that returns and teleports every
train. The prototype made the same trade; it is correct, and it should not be "fixed".

**The display is quiet about one state.** After a scrub at 1×, the prototype shows no suffix at all —
the only hint the clock is no longer live is Now losing its pressed state. Defensible and minimal.
Changing it is a choice, not a fix.

**The override tells the truth about itself.** Forcing Saturday on a Tuesday makes the panel read
"Saturday timetable" while the date still reads Tuesday. That is honest and should stay.

## Migration Plan

`FORCED_START` and `?t=HH:MM` are deleted in this change. Leaving them would give two things a claim
on the starting time.

## Open Questions

None.
