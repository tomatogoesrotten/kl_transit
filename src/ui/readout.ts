import { firstDeparture, hhmm } from '../sim'
import type { KlTime, PreparedNetwork } from '../sim'
import { dateLine, hhmmss, shortDateLine, stateLine } from './format'
import { useClock } from './store'

/**
 * The parts of the time bar that the frame loop writes to directly.
 *
 * React renders the bar when something a person changed changes. The clock, the
 * date, the timetable line and the slider's position change a few times a
 * second and would each be a re-render, which is what "keep React out of the
 * frame loop" rules out. `TimeBar` fills these in with ref callbacks, and React
 * sets them back to null when it unmounts - so every write below is guarded.
 */
export const readout = {
  time: null as HTMLElement | null,
  dateLong: null as HTMLElement | null,
  dateShort: null as HTMLElement | null,
  state: null as HTMLElement | null,
  slider: null as HTMLInputElement | null,
  notice: null as HTMLElement | null,
  jump: null as HTMLButtonElement | null,
  /**
   * True while a person is holding the slider. A plain mutable field rather
   * than React state: it is read every frame and written on every drag pixel,
   * and the slider must not be re-rendered out from under the thumb.
   */
  dragging: false,
}

/**
 * Paints the whole readout. The caller decides how often - a few times a
 * second, never once a frame.
 */
export function paintReadout(net: PreparedNetwork, t: KlTime, anyTrains: boolean) {
  const { mode, speed } = useClock.getState()

  if (readout.time) readout.time.textContent = hhmmss(t.sec)
  // Both lengths are written and CSS shows one of them, so nothing here reads
  // innerWidth - which would then be read inside the frame loop.
  if (readout.dateLong) readout.dateLong.textContent = dateLine(t)
  if (readout.dateShort) readout.dateShort.textContent = shortDateLine(t)
  if (readout.state) readout.state.textContent = stateLine(t.today, mode, speed)

  if (readout.slider && !readout.dragging) {
    const whole = Math.floor(t.sec)
    readout.slider.value = String(whole)
    // So a screen reader says "07:45" rather than "27900".
    readout.slider.setAttribute('aria-valuetext', hhmm(whole))
  }

  // The panel is shown and hidden by React; only its wording depends on time.
  if (!anyTrains && readout.notice) {
    const first = firstDeparture(net, t.today)
    readout.notice.textContent =
      first === null
        ? `No trains are scheduled at ${hhmm(t.sec)}, and this timetable has no service at any hour.`
        : `No trains are scheduled at ${hhmm(t.sec)}. The first ones leave at ${hhmm(first)}, and the last ones finish their runs after midnight.`
    // Nothing to jump to if the timetable never runs.
    if (readout.jump) readout.jump.hidden = first === null
  }
}
