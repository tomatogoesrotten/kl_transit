import { useEffect } from 'react'
import type { RefObject } from 'react'
import { PREDICT_S } from '../live/estimate'

const SEEN_KEY = 'kl-rail.guide-seen'

/**
 * Whether this browser has been shown the guide before.
 *
 * Wrapped, for the reason the map mode's and the time bar's reads both give: a
 * browser that refuses storage must still work. It just forgets, and forgetting
 * here means showing the guide again — which is the harmless way round.
 */
function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'yes'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'yes')
  } catch {
    // A private window or blocked site data. Nothing to tell anybody about.
  }
}

/**
 * The short guide, shown once on a first visit and reachable afterwards from
 * the caption panel.
 *
 * A native `<dialog>` opened with `showModal()`, for the reason `ModeSwitch`
 * and `TimeBar` both give and which matters more here than anywhere else: the
 * top layer, the dimmed backdrop, moving focus in, keeping it in, giving it
 * back on close, and Escape all come from the browser. A modal is where
 * accessibility is most often missed, and hand-rolling one is how it gets
 * missed.
 *
 * It opens from an effect, after the first paint, so the map behind it starts
 * loading either way — and closing it reveals a map that is already there
 * rather than a blank canvas.
 *
 * The dialog is handed in by `App`, which needs it to open the guide again from
 * the caption. React 19 passes `ref` as an ordinary prop, so there is no
 * forwardRef and no second piece of state anywhere.
 */
export function Guide({ ref }: { ref: RefObject<HTMLDialogElement | null> }) {
  useEffect(() => {
    if (readSeen()) return
    ref.current?.showModal()
    // Marked on opening rather than on closing: a visit where it was shown is a
    // visit, whether or not it was read to the end.
    markSeen()
  }, [ref])

  return (
    <dialog
      className="guide"
      ref={ref}
      aria-labelledby="guide-title"
      // Clicking away. A click on the backdrop is reported against the dialog
      // itself, and every click inside lands on `.guide-body` or something in
      // it — which is exactly why the padding is on that inner box and not on
      // the dialog. Without it, clicking the dialog's own margin of whitespace
      // would close the guide from inside.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="guide-body">
        <h2 id="guide-title">KL Rail, by the timetable</h2>

        {/* The honesty rule, first and in full. It lives in the caption panel
            too, but a first-time viewer has no particular reason to read that,
            and this is the one thing they must not leave without. */}
        <p className="lead">
          Klang Valley trains, drawn on a map of Kuala Lumpur. They are placed by Prasarana&rsquo;s
          published timetable, <strong>not tracked</strong>: Rapid Rail has no live position feed,
          so every rail train here is where it is <em>scheduled</em> to be, not where it is.
        </p>
        <p>
          Rapid KL buses and KTM ETS intercity trains are the exception. They <strong>are</strong>{' '}
          live GPS: each says how old its last report is, and they are shown only while the clock
          is at the present moment. A KTM ETS train is drawn where it last reported itself. A bus
          is <em>estimated</em> between reports: once the route shapes have loaded, it is moved
          along its published route from its last report, at a speed measured from its own
          reports, for at most {PREDICT_S} seconds, and each new report corrects it. So a bus may pause,
          or now and then jump, but it never drives backwards. A bus off its route, or on a trip
          the timetable does not know, stays at its report.
        </p>
        <p>
          The bus feed refreshes about once a minute; checking it every 30 seconds picks up a new
          report sooner, not a fresher one. Bus stops and route numbers come from the published
          bus timetable, refreshed daily.
        </p>

        <ul>
          <li>
            <strong>The clock runs the day.</strong> Drag the slider to any time, or run it at 10&times;
            or 60&times;. &ldquo;Now&rdquo; comes back to real Kuala Lumpur time.
          </li>
          <li>
            <strong>Trains, stations, buses and KTM ETS trains can be clicked.</strong> A card opens
            with the journey, the next departures, or a live vehicle&rsquo;s last report. A train can
            also be followed, and the camera keeps up with it.
          </li>
          <li>
            <strong>Wireframe</strong>, on the right, strips the city back to the shape of its
            buildings.
          </li>
          <li>
            <strong>What this data does not know</strong> is listed in the information panel, top
            left &mdash; empty early mornings, trains drawn through buildings, and the rest.
          </li>
        </ul>

        {/* `method="dialog"` closes the dialog with no JavaScript at all, and
            the browser focuses this button when the guide opens. */}
        <form method="dialog">
          <button className="btn">Start exploring</button>
        </form>
      </div>
    </dialog>
  )
}
