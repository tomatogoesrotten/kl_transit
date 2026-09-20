import { useEffect, useRef } from 'react'
import { hhmm } from '../sim'
import type { DayType } from '../sim'
import { readout } from './readout'
import { useClock } from './store'
import type { Speed } from './store'

const SPEEDS: Speed[] = [1, 10, 60]

/**
 * The time bar: what moment is being shown, and every control that changes it.
 *
 * Native `<input type="range">`, `<button aria-pressed>` and `<select>`, for
 * the reason `ModeSwitch` already gives - keyboard operation, focus rings and
 * screen-reader announcements come from the browser, and hand-rolling them is
 * how they get missed.
 *
 * Nothing here re-renders as time passes. The clock, date, timetable line and
 * slider position are written straight to the DOM by the frame loop in
 * `MapView`, through the refs collected in `readout`. This component re-renders
 * only when a person presses something.
 */
export function TimeBar() {
  const mode = useClock((s) => s.mode)
  const speed = useClock((s) => s.speed)
  const override = useClock((s) => s.override)
  const trainsRunning = useClock((s) => s.trainsRunning)
  // Actions are created once with the store and never change identity, so they
  // are read rather than subscribed to.
  const { now, togglePause, setSpeed, setOverride, scrubTo, jumpToPeak } = useClock.getState()

  const slider = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = slider.current
    if (!el) return
    readout.slider = el

    // React's `onChange` on an input is the `input` event, which fires
    // throughout a drag. The native `change` event is the one that fires when
    // the user lets go, so it is the only thing that can clear the flag - a
    // flag set by `onChange` and cleared by `onInput` would never clear, and
    // the slider would stop following the clock after the first drag. Hence a
    // listener attached by hand rather than a JSX prop.
    const release = () => {
      readout.dragging = false
    }
    el.addEventListener('change', release)
    return () => {
      el.removeEventListener('change', release)
      readout.slider = null
      readout.dragging = false
    }
  }, [])

  return (
    <footer className="timebar">
      {/* Rendered always and hidden with `hidden`, so the frame loop always has
          an element to write the wording into. */}
      <p className="no-trains" hidden={trainsRunning}>
        <span
          ref={(el) => {
            readout.notice = el
          }}
        />
        <button
          className="btn"
          ref={(el) => {
            readout.jump = el
          }}
          onClick={jumpToPeak}
        >
          <span className="hide-s">Jump to the morning peak</span>
          <span className="show-s">Morning peak</span>
        </button>
      </p>

      <div className="clock">
        <time
          ref={(el) => {
            readout.time = el
          }}
        >
          --:--:--
        </time>
        <div className="dim">
          <span
            className="hide-s"
            ref={(el) => {
              readout.dateLong = el
            }}
          />
          <span
            className="show-s"
            ref={(el) => {
              readout.dateShort = el
            }}
          />
        </div>
        <div
          className="dim"
          ref={(el) => {
            readout.state = el
          }}
        />
      </div>

      <div className="scrub">
        {/* Uncontrolled. A `value` fed from state updated once a second yanks
            the thumb out from under a drag - exactly the fight the drag flag
            exists to prevent, reintroduced by React's own render. The loop
            writes `.value` when nobody is holding it. */}
        <input
          ref={slider}
          type="range"
          min={0}
          max={86399}
          step={20}
          defaultValue={0}
          aria-label="Time of day in Kuala Lumpur"
          onChange={(e) => {
            readout.dragging = true
            const sec = Number(e.currentTarget.value)
            e.currentTarget.setAttribute('aria-valuetext', hhmm(sec))
            scrubTo(sec)
          }}
        />
        <div className="ticks" aria-hidden="true">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      <div className="row">
        <button className="btn" aria-pressed={mode === 'live'} onClick={now}>
          Now
        </button>
        <button className="btn" aria-pressed={mode === 'paused'} onClick={togglePause}>
          {mode === 'paused' ? 'Play' : 'Pause'}
        </button>
        <div className="seg" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className="btn"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <select
          className="btn"
          aria-label="Timetable"
          value={override}
          onChange={(e) => setOverride(e.currentTarget.value as 'auto' | DayType)}
        >
          <option value="auto">Timetable: by date</option>
          <option value="MonFri">Timetable: weekday</option>
          <option value="Sat">Timetable: Saturday</option>
          <option value="Sun">Timetable: Sunday</option>
        </select>
      </div>
    </footer>
  )
}
