# Tasks

## 1. Places

- [ ] 1.1 Group stops into places by station name, as a pure function. Exact equality is enough: no
      two differently-named stops are within 150 m. Verify with a test that 187 stops give 160
      places, 22 of them serving more than one line, and that two differently-named stops are never
      merged.
- [ ] 1.2 Give each place a position taken from the **drawn** positions of its stops — not the
      feed's coordinates, which are up to 105 m out, and not a fresh `pointAt`, which would miss the
      corridor offset and the camera-dependent gap. Computed in the same pass that builds the
      station dots, so it moves with them. Verify a place on the shared corridor sits with its
      stations.
- [ ] 1.3 Record which lines serve each place, and its colour: one line's colour where there is one
      line, a neutral where there are several — which also marks interchanges at a glance.

## 2. The models

- [ ] 2.1 Extend the model generator to emit a station model per mode: LRT and MRT platforms,
      the monorail's narrower beam station, and a BRT stop. **Spend the most effort on the LRT
      model** — the feed has four LRT lines against two MRT, one monorail and one BRT, so it is seen
      four times as often as any other.
- [ ] 2.2 Bake the shading into a texture, not into material colours. `getColor` **replaces** a
      material's base colour factor and **multiplies** a base-colour texture — this cost one design
      iteration on the trains and must not be rediscovered.
- [ ] 2.3 Keep the model axes **+X forward, +Y left, +Z up, in metres**. Not glTF's usual Y-up:
      deck.gl applies no axis conversion. Extend the existing model test so a hand-replaced station
      model is checked the same way the train models are.
- [ ] 2.4 Exaggerate width deliberately, as the trains do. A real platform is 150 m by 10 m, which
      at the zoom where the model appears is a sliver. Record the dimensions chosen so they can be
      judged.

## 3. The beacons

- [ ] 3.1 Draw a translucent column per place, in the place's colour, rising **above the roofline** —
      a beacon shorter than the buildings solves nothing, since being hidden by them is the problem
      it exists for.
- [ ] 3.2 Size from the camera, using the relation already in `src/map/trains.ts` rather than a
      second copy. Neither layer has a pixel-size floor.
- [ ] 3.3 Keep them from becoming a forest: narrow, translucent, and fading where stations are
      dense. Record the values chosen; this is taste and will be adjusted by eye.

## 4. The crossfade

- [ ] 4.1 Fade between model and beacon across a zoom band. **The sum must not dip**: two layers at
      half opacity read as one faint thing, not as a transition, so the beacon should reach full
      opacity before the model has fully gone.
- [ ] 4.2 Verify with a test on the opacity curve that neither reaches zero while the other is still
      faint, and that the transition is monotonic.

## 5. Not breaking what works

- [ ] 5.1 Leave the per-line rings exactly as they are. They carry which line a station belongs to
      and whether a train is standing at it — the second is a Milestone 4 feature and must not
      regress. Verify station fill still works with a train dwelling.
- [ ] 5.2 Confirm trains remain clearly visible against the new furniture. Stations are fixed and
      trains are the thing that changes; furniture that dominates defeats the point of the map.
- [ ] 5.3 Measure the frame rate with everything on at the weekday peak, and say what it is. 160
      places with a model and a beacon, on top of 187 rings and ~200 trains, wants measuring rather
      than assuming.

## 6. Close out

- [ ] 6.1 Run `npm test`, `npm run build` and `npm audit`; all must pass, with the existing 223
      tests green. Confirm `ls dist/assets | grep worker` still lists a worker chunk of roughly half
      a megabyte — the check for #32.
- [ ] 6.2 **Look at it in a browser**, in both map modes: the city centre close up, the whole
      network zoomed out, the crossfade in between, an interchange, and a train arriving at a
      platform. Not done until a human has seen it.
- [ ] 6.3 Update `CLAUDE.md`'s Status, and open a pull request referencing issue #24 with
      `Closes #24`.
