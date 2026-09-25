import { useView } from './store'
import type { TransitView } from './store'

const VIEWS: { value: TransitView; label: string }[] = [
  { value: 'rail', label: 'Rail' },
  { value: 'bus', label: 'Bus' },
]

/**
 * Chooses what the map is of: the rail network, or the buses and their stops.
 *
 * A `<fieldset>` of two native radios, for the reason `ModeSwitch` gives: Tab
 * reaches the group, the arrow keys move between the two, and a screen reader
 * says "Map view, group, Rail, radio button, selected" without any of it being
 * hand-rolled. Beside the map style rather than in the lines panel, because it
 * is a whole-map choice and the panel starts closed on a phone.
 */
export function ViewSwitch() {
  const view = useView((s) => s.transitView)
  const setTransitView = useView((s) => s.setTransitView)
  return (
    <fieldset className="view-switch">
      <legend>Map view</legend>
      {VIEWS.map(({ value, label }) => (
        <label key={value}>
          <input
            type="radio"
            name="transit-view"
            value={value}
            checked={view === value}
            onChange={() => setTransitView(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
