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
      </div>
    </>
  )
}
