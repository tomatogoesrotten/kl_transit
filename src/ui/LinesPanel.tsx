import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { PLACES } from '../rail'
import { network } from '../sim'
import { LIVE_MODES, MODE_NAME } from '../live/feed'
import { LIVE_STYLE } from '../map/live'
import { ink } from './format'
import { panels } from './readout'
import { findPlaces, firstShownStop } from './search'
import { useView } from './store'

/** The width below which the layout is one column and this panel starts closed. */
const PHONE = 760

/** "LRT Ampang Line" -> "LRT Ampang". The word is the same on every row. */
const shortName = (name: string) => name.replace(/ Line$/, '')

const lineById = new Map(network.lines.map((line) => [line.id, line]))

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
  const liveOff = useView((s) => s.liveOff)
  const { toggleLine, toggleLive, goToStation } = useView.getState()
  // Read once, at first render, and never in the frame loop.
  const [open, setOpen] = useState(() => window.innerWidth > PHONE)
  // What the viewer typed. React state: a person changes it, and nothing in the
  // frame loop reads it.
  const [query, setQuery] = useState('')
  const found = findPlaces(PLACES, query)
  // For tying each live switch to its status line, so a screen reader reads the
  // status when the switch is focused.
  const ids = useId()

  useEffect(() => {
    return () => {
      panels.counts.clear()
      panels.total = null
      panels.liveCounts.clear()
      panels.liveStatus.clear()
      panels.liveNote = null
      panels.stopsStatus = null
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

      {/* Find a station by name. One entry per place, not per line: Titiwangsa
          is one result with four pills. Choosing one does what a station button
          below does, via the same action, so the map, the card and the label
          highlight all follow from the selection. */}
      <div className="search">
        <input
          type="search"
          aria-label="Find a station by name"
          placeholder="Find a station"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() !== '' && (
          // Polite: the count of results is worth hearing, not worth interrupting for.
          <div aria-live="polite">
            {found.length === 0 ? (
              <p className="no-match">No station matches</p>
            ) : (
              <ul className="results">
                {found.map((place) => {
                  const target = firstShownStop(place, network.lines, hidden)
                  return (
                    <li key={place.id}>
                      <button
                        className="stop result"
                        // Every line serving it is hidden, so there is nothing
                        // drawn to go to — as a hidden line's stop buttons.
                        disabled={!target}
                        onClick={() => target && goToStation({ kind: 'station', ...target })}
                      >
                        <span>{place.name}</span>
                        <span className="result-lines">
                          {place.lines.map((id) => {
                            const line = lineById.get(id)
                            return line ? (
                              <span
                                key={id}
                                className="pill"
                                style={{ background: line.color, color: ink(line.color) }}
                              >
                                {line.code}
                              </span>
                            ) : null
                          })}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

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

      {/* The live group. Not lines: these are vehicles the feeds report, drawn
          where they last reported. The count, the status and the note are
          written by the frame loop through `panels`, like the counts above. */}
      <h3 className="live-head">Live GPS</h3>
      <p
        className="live-note"
        hidden
        ref={(el) => {
          panels.liveNote = el
        }}
      >
        Buses and KTM ETS trains are hidden: live positions are only shown at the present moment. Press Now to
        see them.
      </p>
      <ul className="line-list">
        {LIVE_MODES.map((mode) => (
          <li key={mode}>
            <label>
              <input
                type="checkbox"
                checked={!liveOff.has(mode)}
                onChange={() => toggleLive(mode)}
                aria-label={`Show ${MODE_NAME[mode]}`}
                // The status line below, read out after the switch's name. It
                // is empty whenever it is hidden, so a hidden one adds nothing.
                aria-describedby={`${ids}-${mode}-status`}
              />
              {/* The legend: the colour this mode is drawn in. */}
              <span
                className="swatch swatch-live"
                aria-hidden="true"
                // Both views' colours; the stylesheet picks the one on screen.
                style={
                  {
                    '--live-city': `rgb(${LIVE_STYLE.color.city[mode].join(',')})`,
                    '--live-wireframe': `rgb(${LIVE_STYLE.color.wireframe[mode].join(',')})`,
                  } as CSSProperties
                }
              />
              <span className="line-name">{MODE_NAME[mode]}</span>
              <span
                className="n"
                title="Shown"
                ref={(el) => {
                  if (el) panels.liveCounts.set(mode, el)
                  else panels.liveCounts.delete(mode)
                }}
              />
            </label>
            <p
              id={`${ids}-${mode}-status`}
              className="live-status"
              hidden
              ref={(el) => {
                if (el) panels.liveStatus.set(mode, el)
                else panels.liveStatus.delete(mode)
              }}
            />
          </li>
        ))}
      </ul>
      {/* The bus stops' download, said only in the bus view and only while it is
          not simply done. A polite status region: it changes at most twice a
          visit, and "unavailable" is worth hearing. Written by the frame loop. */}
      <p
        className="live-status stops-status"
        role="status"
        ref={(el) => {
          panels.stopsStatus = el
        }}
      />
    </details>
  )
}
