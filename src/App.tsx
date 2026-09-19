import network from '../data/network.json'
import { MapView } from './map/MapView'

export function App() {
  return (
    <>
      <MapView />
      <div className="caption">
        <strong>KL Rail</strong>
        <span>
          {network.lines.length} lines · {Object.keys(network.stations).length} stations ·
          positions are scheduled, not live
        </span>
        {/* The feed has no elevated-or-underground data, so every train is drawn at one
            assumed viaduct height. Say so rather than let the picture imply we know. */}
        <span>track height is not in the timetable, so trains are drawn at an assumed height</span>
      </div>
    </>
  )
}
