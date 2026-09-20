import { useEffect } from 'react'
import { network } from '../sim'
import { ink } from './format'
import { CARD_ROWS, panels } from './readout'
import { useView } from './store'

/**
 * The card describing whatever is selected: a train's journey, or a station's
 * next departures.
 *
 * React renders the shell — the chip, the headings, the close and follow
 * buttons, and an empty table of a fixed number of rows. Everything whose text
 * changes as the clock runs is written into those elements by the frame loop
 * through `paintCard`, so nothing here re-renders as time passes. This
 * component re-renders when a person selects something else, presses follow, or
 * closes it.
 *
 * Native `<button>` for close and follow, and a keydown listener for Escape:
 * between them there is a way out by pointer, by touch and by keyboard.
 */
export function Card() {
  const selection = useView((s) => s.selection)
  const following = useView((s) => s.following)
  const { select, toggleFollow } = useView.getState()

  useEffect(() => {
    if (!selection) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null)
    }
    // On the window, not the card: the pointer selects things on a canvas that
    // never takes focus, so the key has to work wherever focus happens to be.
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, select])

  // The rows are registered by index. Cleared here rather than in each ref
  // callback, so it does not matter whether React detaches refs before or after
  // this cleanup runs.
  useEffect(() => {
    return () => {
      panels.rows.length = 0
    }
  }, [])

  if (!selection) return null

  const line = network.lines.find((l) => l.id === selection.lineId)
  const color = line?.color ?? '#6e7a8a'

  return (
    <aside className="card" aria-label="Details">
      <button className="x" aria-label="Close details" onClick={() => select(null)}>
        ×
      </button>

      <span
        className="pill"
        style={{ background: color, color: ink(color) }}
        ref={(el) => {
          panels.pill = el
        }}
      />
      <h2
        ref={(el) => {
          panels.title = el
        }}
      />
      <p
        className="sub"
        ref={(el) => {
          panels.sub = el
        }}
      />
      <p
        className="status"
        ref={(el) => {
          panels.status = el
        }}
      />

      <table
        ref={(el) => {
          panels.table = el
        }}
      >
        <thead>
          <tr>
            <th
              colSpan={2}
              ref={(el) => {
                panels.head = el
              }}
            />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: CARD_ROWS }, (_, i) => (
            <tr
              key={i}
              ref={(el) => {
                if (el) panels.rows[i] = { row: el, label: el.cells[0], value: el.cells[1] }
              }}
            >
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      {/* The honesty rule, on the one panel that gives times to the second. */}
      <p className="sched">Scheduled from the published timetable, not a live feed.</p>

      <button
        className="btn"
        aria-pressed={following}
        onClick={toggleFollow}
        ref={(el) => {
          panels.follow = el
        }}
      >
        {following ? 'Stop following' : 'Follow this train'}
      </button>
    </aside>
  )
}
