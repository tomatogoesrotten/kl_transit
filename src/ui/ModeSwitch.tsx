import type { MapMode } from '../map/modes'

/**
 * Chooses between the ordinary map of the city and the wireframe view of it.
 *
 * A real `<input type="checkbox" role="switch">`, not a styled div: keyboard
 * operation, the focus ring and the screen-reader announcement come for free,
 * and hand-rolling them is how they get missed. The `<label>` wraps the input,
 * so the whole chip is a click and touch target.
 *
 * It knows nothing about MapLibre, so Milestone 5 can move it into the controls
 * panel unchanged.
 */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: MapMode
  onChange: (mode: MapMode) => void
}) {
  return (
    <label className="mode-switch">
      <input
        type="checkbox"
        role="switch"
        checked={mode === 'wireframe'}
        onChange={(e) => onChange(e.target.checked ? 'wireframe' : 'city')}
      />
      Wireframe
    </label>
  )
}
