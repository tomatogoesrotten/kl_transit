import { useEffect, useState } from 'react'
import { network } from '../sim'
import { ink } from './format'
import { panels } from './readout'
import { useView } from './store'

/** The width below which the layout is one column and this panel starts closed. */
const PHONE = 760

/** "LRT Ampang Line" -> "LRT Ampang". The word is the same on every row. */
const shortName = (name: string) => name.replace(/ Line$/, '')

/**
 * One row per line: its colour, its name, how many of its trains are running,
 * and a switch that hides it.
 *
 * Native `<details>` and real checkboxes, for the reason `ModeSwitch` and
 * `TimeBar` both give — keyboard operation, focus rings and screen-reader
 * announcements come from the browser, and hand-rolling them is how they get
 * missed.
 *
 * The nested station list is also the keyboard route onto the map. A canvas
 * cannot be tabbed through, and building a roving focus over one would be a lot
 * of machinery for a worse result than a list of buttons that has to exist
 * anyway.
 *
 * The running counts are NOT React state. They are derived in the frame loop
 * and written into the `<span>`s below through `panels.counts`, four times a
 * second — a `setState` at that rate is still a React render driven by the
 * animation.
 */
export function LinesPanel() {
  const hidden = useView((s) => s.hidden)
  const { toggleLine, goToStation } = useView.getState()
  // Read once, at first render, and never in the frame loop.
  const [open, setOpen] = useState(() => window.innerWidth > PHONE)

  useEffect(() => {
    return () => {
      panels.counts.clear()
      panels.total = null
    }
  }, [])

  return (
    <details className="lines" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Lines{' '}
        <span
          className="dim"
          ref={(el) => {
            panels.total = el
          }}
        />
      </summary>
      <ul className="line-list">
        {network.lines.map((line) => {
          const off = hidden.has(line.id)
          // Direction 0's stop list; direction 1 is the same stations reversed.
          const stops = line.directions.find((d) => d.dir === 0)?.stops ?? []
          return (
            <li key={line.id}>
              <label>
                <input
                  type="checkbox"
                  checked={!off}
                  onChange={() => toggleLine(line.id)}
                  aria-label={`Show ${line.name}`}
                />
                <span className="pill" style={{ background: line.color, color: ink(line.color) }}>
                  {line.code}
                </span>
                <span className="line-name">{shortName(line.name)}</span>
                <span
                  className="n"
                  title="Trains running"
                  ref={(el) => {
                    if (el) panels.counts.set(line.id, el)
                    else panels.counts.delete(line.id)
                  }}
                />
              </label>

              <details className="stops">
                <summary>{stops.length} stations</summary>
                <ul>
                  {stops.map((stop) => (
                    <li key={stop.id}>
                      <button
                        className="stop"
                        // A hidden line has no markers on the map, so selecting
                        // one would describe something invisible.
                        disabled={off}
                        // Selects it AND sends the map to it. Reaching a
                        // station from a list and then being left looking at
                        // the other side of the city is not arriving anywhere.
                        onClick={() =>
                          goToStation({ kind: 'station', lineId: line.id, stopId: stop.id })
                        }
                      >
                        {network.stations[stop.id]?.name ?? stop.id}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
