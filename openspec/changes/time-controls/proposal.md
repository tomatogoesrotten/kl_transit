# Proposal

## Why

The simulation can compute any moment of any service day, and the map can draw it. There is no way
to ask for one. The only route to the morning peak today is a URL parameter added as temporary
scaffolding, which nobody would find and which was always meant to be deleted here.

This is the milestone that makes everything already built usable: a clock, and the controls to move
it.

It is also the first substantial user interface in the project, so it sets the conventions the
remaining milestones follow.

## What Changes

- A clock panel: the time in Kuala Lumpur, the date, and which timetable is in force.
- A time-of-day slider that follows the clock and can be dragged to any moment of the day.
- Now, Pause, and speeds of 1×, 10× and 60×.
- A timetable override: by date, or forced to weekday, Saturday or Sunday.
- A notice when nothing is running, saying when the first trains leave, with a button that jumps to
  the morning peak.
- The honest statement that positions come from a published schedule rather than a live feed, given
  room to say so properly rather than as a caption fragment.
- **Removed**: the `?t=HH:MM` parameter and its constant. The real controls replace it, and leaving
  it would give two things a claim on the starting time.

## Capabilities

### New Capabilities

- `time-controls`: choosing which moment of which service day the map shows — the clock, how fast it
  runs, which timetable it follows, and what the display says when nothing is scheduled.

### Modified Capabilities

None. `train-simulation`, `network-map` and `train-rendering` are all consumed unchanged.

## Impact

- **New code**: the control components under `src/ui/`, and a store holding the clock state.
- **Modified**: `src/map/MapView.tsx`, whose frame loop reads the clock from the store instead of a
  private ref, and whose `FORCED_START` scaffolding is deleted. `src/App.tsx`, which gains the
  controls.
- **No change** to `src/sim/`. It already takes time as an argument, which is the whole reason this
  milestone is a matter of wiring rather than surgery.
- **Dependency added**: `zustand` 5.0.15. `GUIDE.md` asks that the state-sharing approach be proposed
  and agreed before adding one. A ref plus a throttled update, with no dependency, was proposed; the
  owner chose Zustand. It earns its place by letting the frame loop read current values without a
  subscription and without capturing them in a closure.
- **Downstream**: Milestone 6's selection and line visibility are the same shape of problem — state a
  person changes, read by a loop that must not re-render — and will use the same store.

## The state model is the substance of this change

The prototype keeps `{ live, paused, speed, ms, override }`, and those fields are **not orthogonal**.
When `live` is set, `speed` and `paused` are dead: the timestamp is overwritten with wall time every
frame. Every speed button and the pause button clear `live` precisely because of this.

Carried over literally, that record makes contradictory states representable — running and paused at
once, or live at sixty times speed — and the loop silently honours only half of each. So the state
is modelled as a three-way mode with one remembered parameter, and the contradictions cease to exist
rather than being guarded against.

## Non-goals

- No selection, tooltips, cards, follow-camera or per-line visibility. Milestone 6.
- No calendar. The override picks a day *type*, not a date; the feed treats public holidays as
  ordinary days and the app should not imply otherwise.
- No persistence of the chosen time. Someone returning to the page wants now, not the moment they
  last looked at.
