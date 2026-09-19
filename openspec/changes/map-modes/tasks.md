# Tasks

## 1. Applying a mode to the map

- [x] 1.1 Write a pure helper in `src/map/` that, given the style's layers and a mode, returns which
      layer ids should be visible and which hidden — everything except `background` hidden in
      skeleton mode, everything visible in city mode. Verify with a unit test over an abridged
      liberty layer list, including that `background` is never hidden.
- [x] 1.2 Apply it with `map.setLayoutProperty(id, 'visibility', …)`. Do **not** use `map.setStyle`:
      it rebuilds the style, destroying the layer the deck.gl overlay targets with `beforeId`.
      Verify by switching modes and confirming the network stays drawn.
- [x] 1.3 Read liberty's original `background` colour once at load and keep it, so city mode can be
      restored exactly. Set a dark ground for skeleton mode. Verify the city's background is
      identical before and after a round trip.
- [x] 1.4 Confirm the camera is untouched: a test or a by-eye check that position, zoom, pitch and
      bearing are the same after switching.

## 2. The switch

- [x] 2.1 Create `src/ui/` and a switch component there. It takes the current mode and a change
      callback as props and knows nothing about MapLibre, so Milestone 5 can lift it into the
      controls panel. Verify with `npm run build`.
- [x] 2.2 Make it a real switch: operable by mouse, touch and keyboard, with its current state
      apparent without interacting. Use a native `<input type="checkbox" role="switch">` rather than
      a div with handlers, so keyboard and screen-reader behaviour come for free. Verify by tabbing
      to it and toggling with the keyboard.
- [x] 2.3 Position it so it does not collide with MapLibre's navigation control or the caption, and
      reads at phone width. Verify at 400 px wide.

## 3. Remembering the choice

- [x] 3.1 Persist the mode to `localStorage` and read it on mount, defaulting to city. Verify by
      switching, reloading, and seeing the same mode.
- [x] 3.2 Wrap both the read and the write so a browser that refuses storage — a private window, or
      site data blocked — still works and simply does not remember. Verify by forcing the failure.

## 4. Close out

- [x] 4.1 Keep the scheduled-not-live statement visible in both modes. Verify by eye in each.
- [x] 4.2 Run `npm test` and `npm run build`; both must pass with the existing 58 tests green.
- [ ] 4.3 **Look at it in a browser, in both modes**, and confirm. Per `CLAUDE.md`'s definition of
      done, this task is not complete until a human has actually seen it.
- [x] 4.4 Update `CLAUDE.md`'s Status, and open a pull request referencing issue #12 with
      `Closes #12`.
