# Tasks

## 1. Picking

- [ ] 1.1 Give the train and station layers `pickable: true`, and set the cursor and picking radius
      **on the renderer, not on a layer** — without an explicit cursor, deck.gl writes `grab` onto
      MapLibre's canvas every frame and MapLibre's own pointer states never appear. Verify the
      cursor changes over a train and reverts over empty map.
- [ ] 1.2 Leave the track layers **not** pickable. They are everywhere near a line and would answer
      instead of the train standing on them. Verify hovering a line between stations identifies
      nothing.
- [ ] 1.3 Give train instances an identity. They currently carry position, orientation and colour
      only, so a picked train reports nothing about which train it is. Pass an id, **not** the whole
      train record — that holds references the renderer would keep alive for the frame.
- [ ] 1.4 Confirm a train standing at a platform wins the pick over the marker beneath it. This
      works today because trains are drawn at viaduct height and markers at a fraction of a metre —
      verify it rather than assume it, and note in a comment that the elevation is load-bearing.

## 2. Hover

- [ ] 2.1 Show the line and destination for a train, the name for a station, following the pointer.
      Write it **through a ref, not React state** — hover fires on every pointer move, and a
      `setState` per event re-renders the tree mid-drag.
- [ ] 2.2 Suppress hover for touch, or a tap flashes a description before opening the card. Verify
      by tapping.

## 3. The train card

- [ ] 3.1 Show the line, where the train is going, where it started and at what time. The start time
      is the departure second within that train's own service day, so a train that left at 23:50
      yesterday must read 23:50.
- [ ] 3.2 Show what it is doing: standing at a station with time until it leaves, or approaching one
      with time until it arrives. The reported stop means different things in those two cases — it
      is the one it is at, or the one it is heading for.
- [ ] 3.3 List the stops still to come with their scheduled times, computed from the trip's start
      plus each stop's arrival offset. Exclude the stop a standing train is at; show fewer than the
      full number near the end of a trip. Verify with a test on the time arithmetic.
- [ ] 3.4 Add a duration formatter to the UI formatters, with a test. It does not exist in the port.

## 4. The station card

- [ ] 4.1 Show the next departures per direction, labelled by destination. Resolve the stop's index
      **within each direction separately** — direction 1's stop list is direction 0's reversed, so
      the same station has two different indices. Verify with a test that both resolve to the same
      station.
- [ ] 4.2 Do not advertise departures at a terminal in the direction nothing leaves in. Verify with
      a test at both ends of a line.
- [ ] 4.3 Where a train already running will call at this station, derive the time from that train's
      progress rather than from the timetable, so the card cannot claim a train is further away than
      the one visibly approaching. Fall back to the timetable beyond what is running. Verify with a
      test comparing both sources for the same station.
- [ ] 4.4 Show both a clock time and a wait, and say plainly when there are no more trains today.

## 5. Follow

- [ ] 5.1 Move the camera every frame with a jump, not an animation — an animation started each
      frame is cancelled by the next, never completes, and emits a start and end pair each time.
      Smooth by closing a fraction of the gap per frame.
- [ ] 5.2 Centre on the train's **drawn** position, which carries the keep-left shift and the
      corridor offset, using this frame's camera values. Recomputing from the simulation puts the
      camera metres away and drifting as the zoom changes.
- [ ] 5.3 Stop following when the viewer drags the map, using the map's own signal that a person
      caused the move — we move the camera constantly, so anything that cannot tell ours from theirs
      cancels immediately. Zoom must **not** cancel.
- [ ] 5.4 Stop following when the train's trip ends or it is no longer shown, including because its
      line was hidden.

## 6. The lines panel

- [ ] 6.1 One row per line: colour, name, running count, and a switch. Native `<details>` and native
      checkboxes, for the reason the existing components give.
- [ ] 6.2 Hiding a line hides its track, its stations and its trains, by filtering the layers' data
      and this frame's trains. **Never recompute the shared-track corridors from the visible subset**
      — that would snap 8.5 km of line sideways for a checkbox. Verify the partner line does not
      move when one of the pair is hidden.
- [ ] 6.3 Rebuild the line and station layers only when the hidden set changes, following the
      existing pattern for rebuilding on camera change.
- [ ] 6.4 Clear the selection when its line is hidden — including for a train whose trip has already
      ended, which means carrying the line id alongside the selection.
- [ ] 6.5 Write the running counts to the DOM **through refs**, a few times a second, following the
      clock readout. A `setState` four times a second is still a React render driven by the frame
      loop.

## 7. Selection that does not lie

- [ ] 7.1 Hold the selection as a train id or a stop id, with the line id alongside. Not an array
      index — those are rebuilt whenever the camera changes.
- [ ] 7.2 Recognise the same train under a changed identity. A train's id is composed from its day
      type and which departure of that day it is, so midnight and a forced timetable both rename
      every train on screen while the trains themselves keep running.
- [ ] 7.3 Distinguish "this trip has ended" from "I can no longer find this", and say the second
      honestly rather than dressing it as the first. Verify by selecting a train and forcing a
      different timetable.

## 8. Layout, keyboard and close out

- [ ] 8.1 Lines panel bottom-left above the time bar, card on the right below the mode switch. The
      time bar's height changes with wrapping and with the no-trains notice, so **do not position by
      a fixed offset** — one bottom-left column laid out by the browser replaces the prototype's
      measuring code entirely.
- [ ] 8.2 At phone width, one column with the lines panel collapsed by default. Verify at 400 px.
- [ ] 8.3 Keyboard: reachable stations via the panel rather than a roving focus over a canvas, a
      real close button, and dismissal by keyboard. Keep the canvas focusable so MapLibre's own
      keyboard panning works — which finally makes the prototype's aria-label true.
- [ ] 8.4 Run `npm test` and `npm run build`; both must pass with the existing 164 tests green, and
      `npm audit` at 0.
- [ ] 8.5 **Look at it in a browser**: hover and click trains and stations, follow one and drag to
      cancel, hide a line that shares track, and check it at phone width. Not done until a human has
      seen it.
- [ ] 8.6 Update `CLAUDE.md`'s Status, and open a pull request referencing issue #22 with
      `Closes #22`.
