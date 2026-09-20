import network from '../data/network.json'
import { MapView } from './map/MapView'
import { Card } from './ui/Card'
import { LinesPanel } from './ui/LinesPanel'
import { TimeBar } from './ui/TimeBar'

export function App() {
  return (
    <>
      {/* Before the map, so the card and the panels below paint over it. */}
      <div className="caption">
        <strong>KL Rail</strong>
        <span>
          {network.lines.length} lines · {Object.keys(network.stations).length} stations
        </span>
        {/* The honesty rule, in a sentence rather than a fragment: a reader who
            skims "scheduled, not live" can still think it means a delayed feed. */}
        <span>
          Every train here is placed by Prasarana&rsquo;s published timetable, not by GPS. Rapid
          Rail has no live position feed, so this shows where trains are scheduled to be, not
          where they are.
        </span>
        {/* The feed has no elevated-or-underground data, so every train is drawn at one
            assumed viaduct height. Say so rather than let the picture imply we know. */}
        <span>track height is not in the timetable, so trains are drawn at an assumed height</span>
      </div>

      <MapView />

      {/* One absolutely positioned column, laid out by the browser.
          The time bar's height is not fixed — it wraps at narrow widths, and it
          grows a whole row when the no-trains notice appears — so nothing above
          it can be placed by a hardcoded offset from the bottom. Putting them in
          one column replaces the prototype's `getBoundingClientRect` measuring
          and its resize listener with nothing at all.
          At phone width the card joins the column; on a wide screen the
          stylesheet lifts it out to the right, below the mode switch. */}
      <div className="bottom-left">
        <Card />
        <LinesPanel />
        <TimeBar />
      </div>
    </>
  )
}
