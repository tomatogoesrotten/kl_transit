import network from '../data/network.json'
import { MapView } from './map/MapView'
import { TimeBar } from './ui/TimeBar'

export function App() {
  return (
    <>
      <MapView />
      <TimeBar />
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
    </>
  )
}
