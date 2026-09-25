import { useRef, useState } from 'react'
import network from '../data/network.json'
import { MapView } from './map/MapView'
import { Card, Chooser, FollowTag } from './ui/Card'
import { Guide } from './ui/Guide'
import { LinesPanel } from './ui/LinesPanel'
import { TimeBar } from './ui/TimeBar'

export function App() {
  // The panels along the bottom, handed to the map so the camera knows how much
  // of the viewport they cover. See `panelPadding` in src/map/camera.ts.
  const panels = useRef<HTMLDivElement>(null)
  // Open on first sight, so the honesty rule is read before it can be put away.
  // A native <details>, for the reason LinesPanel and ModeSwitch both give:
  // keyboard operation, the focus ring and the screen-reader announcement come
  // from the browser.
  const [about, setAbout] = useState(true)
  // The guide's own <dialog>, so the caption below can open it again. Held here
  // rather than as a second piece of state: `showModal()` is the browser's, and
  // a boolean mirroring whether a dialog is open is a boolean that can be wrong.
  const guide = useRef<HTMLDialogElement>(null)

  return (
    <>
      {/* Before the map, so the card and the panels below paint over it. */}
      <details
        className="caption"
        open={about}
        onToggle={(e) => setAbout(e.currentTarget.open)}
      >
        {/* Collapsed, this is all that is left: an information mark, whose
            label carries the honesty rule for anyone who reads labels. */}
        <summary aria-label="About KL Rail. Train positions are scheduled, not live. Bus and KTM ETS positions are live GPS.">
          <span className="i" aria-hidden="true">
            i
          </span>
          <strong>KL Rail</strong>
        </summary>
        <span>
          {network.lines.length} lines · {Object.keys(network.stations).length} stations
        </span>
        {/* The honesty rule, in a sentence rather than a fragment: a reader who
            skims "scheduled, not live" can still think it means a delayed feed. */}
        <span>
          Every rail train here is placed by Prasarana&rsquo;s published timetable, not by GPS.
          Rapid Rail has no live position feed, so this shows where trains are scheduled to be, not
          where they are.
        </span>
        {/* The other half, since issue #40: two kinds of position side by side,
            and the viewer must never have to guess which one is which. */}
        <span>
          Rapid KL buses and KTM ETS trains are different: they are live GPS, drawn where each last
          reported itself, and each shows how old its position is. They appear only while the
          clock is at the present moment.
        </span>
        {/* The way back into the guide, which is otherwise shown once and never
            again. A guide nobody can see twice is a guide nobody can recommend. */}
        <button className="guide-link" onClick={() => guide.current?.showModal()}>
          How to use this map
        </button>

        {/* Everything below is something a viewer could otherwise reasonably read
            as a defect: a train through a building, an empty map at half past six,
            KL Sentral appearing more than once. Each was found while building this,
            and each is a limit of the feed rather than a bug.

            Folded away, and shut to begin with, for two reasons. Open, the list is
            most of a phone screen, and it would push the honesty sentence above it
            out of sight — which is the one line that must be read first. */}
        <details className="limits">
          <summary>What this data does not know</summary>
          <ul>
            <li>
              <strong>Track height is not in the timetable.</strong> Every train is drawn at one
              assumed viaduct height — about right for the elevated majority, wrong wherever the
              line is in a tunnel. That is why trains sometimes pass through buildings.
            </li>
            <li>
              <strong>Early mornings look emptier than they are.</strong> Every trip in the feed
              starts from a terminal at 06:00, so until about 07:30 the map shows fewer trains
              than really run. Real trains also enter service from depots along the line.
            </li>
            <li>
              <strong>Public holidays run as ordinary days.</strong> The feed carries no holiday
              calendar, so a holiday is drawn with whatever service its weekday would have.
            </li>
            <li>
              <strong>Lines sharing track are drawn apart.</strong> Ampang and Sri Petaling run on
              the same rails between Chan Sow Lin and Sentul Timur. Separating them here is a map
              convention, not a second railway.
            </li>
            <li>
              <strong>The KTMB live feed carries only ETS intercity trains.</strong> It has no KTM
              Komuter trains in it at all, so Komuter trains may well be running although none are
              shown here.
            </li>
            <li>
              <strong>Live ages are measured by this device&rsquo;s clock.</strong> A clock that is
              a few minutes out makes every bus look fresher or staler than it is. A &ldquo;live&rdquo;
              position is the one the vehicle last reported, usually a minute or two ago, and it
              jumps when the next one arrives &mdash; nothing is predicted in between.
            </li>
            <li>
              <strong>Buses are named by the feed&rsquo;s route id.</strong> The feed says{' '}
              <code>U3000</code>, not the route number 300 on the bus. Looking the numbers up is a
              later change.
            </li>
            <li>
              <strong>KTM ETS speed and heading are placeholders in the feed.</strong> Every ETS train
              reports heading north at 90, so they are drawn as discs with no direction, and no
              speed is shown for anything.
            </li>
            <li>
              <strong>An interchange appears once per line.</strong> The feed gives a station its
              own stop for each line it serves, so KL Sentral is several stations here rather than
              one.
            </li>
          </ul>
          {/* The licence requires attribution, and grants no rights to logos,
              emblems or official symbols — which is why there is no operator
              branding anywhere in this app. The map's own credit to OpenFreeMap
              and OpenStreetMap is in MapLibre's attribution control, bottom right. */}
          <p className="credit">
            Timetable from data.gov.my (Prasarana, rapid-rail-kl). Live positions from data.gov.my
            GTFS Realtime (Prasarana, rapid-bus-kl; KTMB). Under the Terms of Use for Government
            Open Data Malaysia 1.0. An unofficial project, not connected to Prasarana, Rapid Rail,
            Rapid KL or KTMB.
          </p>
        </details>
      </details>

      <MapView panels={panels} />

      {/* One absolutely positioned column, laid out by the browser.
          The time bar's height is not fixed — it wraps at narrow widths, and it
          grows a whole row when the no-trains notice appears — so nothing above
          it can be placed by a hardcoded offset from the bottom. Putting them in
          one column replaces the prototype's `getBoundingClientRect` measuring
          and its resize listener with nothing at all.
          At phone width the card joins the column; on a wide screen the
          stylesheet lifts it out to the right, below the mode switch. */}
      <div className="bottom-left" ref={panels}>
        <Chooser />
        <FollowTag />
        <Card />
        <LinesPanel />
        <TimeBar />
      </div>

      {/* Last, and outside the column: a modal <dialog> lives in the browser's
          top layer, so where it sits in the document does not affect what it
          covers. It opens from an effect, after the map has been told to load. */}
      <Guide ref={guide} />
    </>
  )
}
