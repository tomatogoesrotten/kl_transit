import { useEffect } from 'react'
import { network } from '../sim'
import { LIVE_STYLE } from '../map/live'
import { ink } from './format'
import { selectionKey, selectionLabel } from './inspect'
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
  const cardOpen = useView((s) => s.cardOpen)
  const following = useView((s) => s.following)
  const { closeCard, toggleFollow } = useView.getState()

  useEffect(() => {
    if (!selection || !cardOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCard()
    }
    // On the window, not the card: the pointer selects things on a canvas that
    // never takes focus, so the key has to work wherever focus happens to be.
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, cardOpen, closeCard])

  // The rows are registered by index. Cleared here rather than in each ref
  // callback, so it does not matter whether React detaches refs before or after
  // this cleanup runs.
  useEffect(() => {
    return () => {
      panels.rows.length = 0
    }
  }, [])

  if (!selection || !cardOpen) return null

  const vehicle = selection.kind === 'vehicle'
  // A live vehicle is on no line; its chip takes the colour it is drawn in on
  // the city map. The chip is filled with white text, so the darker city
  // colour reads on either panel, where the wireframe's pale one would not.
  const color = vehicle
    ? `rgb(${LIVE_STYLE.color.city[selection.mode].join(',')})`
    : (network.lines.find((l) => l.id === selection.lineId)?.color ?? '#6e7a8a')

  return (
    <aside className="card" aria-label="Details">
      <button className="x" aria-label="Close details" onClick={closeCard}>
        ×
      </button>

      <span
        className="pill"
        style={{ background: color, color: vehicle ? '#ffffff' : ink(color) }}
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

      {/* The card's primary action, directly under what the train is doing. It
          used to sit below the five-row table, which on a short card meant
          scrolling to reach the one button most people want. */}
      {/* No follow for a live vehicle: a KTM train moves every two minutes in a
          jump, and following a bus is a follow-up design.md leaves open. */}
      {!vehicle && (
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
      )}

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

      {/* The honesty rule, on the one panel that gives times to the second.
          It differs by kind, because the kinds of position differ - and for a
          bus it turns on whether the map is drawing it at an estimate, which
          only the frame loop knows, so it is painted there (`cardNote`). */}
      <p
        className="sched"
        ref={(el) => {
          panels.note = el
        }}
      />

    </aside>
  )
}

/**
 * The strip that says the camera is still following a train, while its card is
 * shut.
 *
 * It exists because following used to depend on the card being open, and on a
 * phone the card covers the bottom of the screen — which is where the camera
 * had just centred the train. The only way to SEE the train was to stop
 * following it. Closing the card now leaves the camera alone, and this says so
 * and offers both ways out of it.
 *
 * Nothing here changes as the train moves. The line and where it is going come
 * from the selection, which only a person changes, so this never re-renders
 * from the frame loop.
 */
export function FollowTag() {
  const selection = useView((s) => s.selection)
  const cardOpen = useView((s) => s.cardOpen)
  const following = useView((s) => s.following)
  const { showCard, stopFollowing } = useView.getState()

  if (!following || cardOpen || !selection) return null

  return (
    <div className="following" role="status">
      <span className="eye" aria-hidden="true" />
      <span className="what">Following {selectionLabel(network, selection)}</span>
      <button className="btn" onClick={showCard}>
        Details
      </button>
      <button className="btn" onClick={stopFollowing}>
        Stop
      </button>
    </div>
  )
}

/**
 * What one click found, when it found more than one thing.
 *
 * Trains keep left, so both directions of a line run a few pixels apart by
 * design, and along the shared corridor there are four tracks' worth of them
 * within a fingertip. A wider hit radius on its own only picks the topmost more
 * often, which is not a choice — so the click offers the candidates instead of
 * guessing between them.
 *
 * A list of real buttons: it works by pointer, by finger and by keyboard, and
 * it is far easier to hit than the trains it is asking about.
 */
export function Chooser() {
  const choices = useView((s) => s.choices)
  const { select, clearChoices } = useView.getState()

  useEffect(() => {
    if (choices.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearChoices()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choices, clearChoices])

  if (choices.length === 0) return null

  return (
    <div className="chooser" role="group" aria-label="More than one thing here">
      <p>{choices.length} things here. Which one?</p>
      <ul>
        {choices.map((sel) => (
          <li key={selectionKey(sel)}>
            {/* `.stop`, the same full-width list button the lines panel uses. */}
            <button className="stop" onClick={() => select(sel)}>
              {selectionLabel(network, sel)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
