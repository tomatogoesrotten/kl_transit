# Tasks

## 1. Shared data

- [x] 1.1 Compute the prepared network and `places()` once, in one module that both `MapView` and
      `LinesPanel` import, and make `MapView` use it instead of its own `prepare(network)`. Verify
      `npm test` stays green and `grep -rn "prepare(" src` finds one call outside tests.

## 2. Label logic, pure and tested (`src/map/labels.ts`)

- [x] 2.1 `labelAnchors(places, dots, index)`: per place, the mean of the drawn positions of those
      of its stops that have a ring; no entry when none has. Verify with tests that a corridor place
      at a non-zero gap sits at the mean of its OFFSET rings, centred between them (with both lines
      shown this coincides with the true alignment, within 0.3 m of `Place.lon/lat` on all 11
      corridor places, because the offset is symmetric); that hiding one line of a two-line place
      moves its anchor onto the remaining ring, off the true alignment; and that hiding every line
      of a place leaves it without an anchor.
- [x] 2.2 `labelPriority`: 1 for a place served by more than one line or holding the first or last
      stop of any line's direction 0, 2 otherwise, 0 when it holds the selected stop. Found from the
      data, no names listed. Verify with tests on the shipped network: Titiwangsa and Gombak are 1,
      an ordinary stop such as Imbi is 2, and exactly 28 places are 1.
- [x] 2.3 `chooseLabels(candidates, options)`: zoom gate, off-screen cull, total sort (priority,
      shorter name, name), greedy box collision with padding, priority 0 always kept, ceiling of 40.
      Verify with tests that no two kept boxes overlap; that of two colliding labels the higher
      priority wins; that below the gate zoom no priority-2 label is kept; that a selected label is
      kept even when it collides; that the ceiling holds; and that the same input twice gives the
      same output.

## 3. Drawing the labels (`src/map`)

- [x] 3.1 A label layer builder: `TextLayer` with the app's font at weight 600, 12 px (14 px for the
      highlighted place), SDF outline as halo in per-mode colours, anchored bottom-centre above the
      ring by `stationRadius(zoom)` plus 10 px (`LIFT_PX`), `characterSet: 'auto'`, depth test off and no
      depth write, not pickable — each non-obvious setting with a one-line reason. Verify with a
      test that it builds from a chosen list and carries the parameters the design names.
- [x] 3.2 In the frame loop: recompute anchors when `cam.dots` changes identity; set a dirty flag on
      MapLibre `move`, and when the hidden set, the selection, the mode or the anchors change; run
      the choose pass only when dirty and 200 ms since the last; measure each place's width once
      with a canvas `measureText` in the label font. Read the mode through a ref kept in step by the
      mode effect. Verify in the browser that holding the camera still stops the choose pass (a
      temporary counter, removed after) and, with temporary render counters on `MapView` and
      `LinesPanel`, that a 5 s pan and zoom with a still selection renders neither. (Counters rather
      than the React DevTools profiler: they run in a headless browser, give a number to report,
      and are removed after, with `git diff` confirming no trace.)
- [x] 3.3 Put the label layer last in `setProps`, after the trains, and hand back the same instance
      until the chosen ids, the anchors or the mode change. (First built before the trains; the
      owner reversed that on sight so names stay readable.) Verify in the browser that a name stays
      readable over a passing train, and that the train is still clickable under it.

- [x] 3.4 Take OpenStreetMap's own rail-station names off the base map: add
      `!= class "railway"` to the filter of every POI symbol layer (`poi_r1`, `poi_r7`, `poi_r20`;
      harmless on `poi_transit`, whose class list never admits `railway`), with `setFilter`, once,
      at load, before the overlay is added. Keep `poi_transit` visible: in KL it is bus stops. Verify
      with a unit test that the exclusion is combined with each layer's own filter and that no mode
      op carries a filter; and in the browser, over central KL at z15, z16 and z17, that no
      railway-class name renders while bus-stop names still do, in the city view, in the wireframe,
      and after switching back; and that restoring liberty's own filter brings the railway names
      back (so the check can fail).

## 4. Station search in the lines panel

- [x] 4.1 `src/ui/search.ts`: `normaliseName`, `findPlaces` (prefix matches before contains, name
      order within each, empty query finds nothing, limit 8) and `firstShownStop`. Verify with tests
      that "sunway setia" finds "Sunway-Setia Jaya", "titi" finds Titiwangsa once, a prefix match
      outranks a contains match, an accented query finds the unaccented name, and `firstShownStop`
      skips hidden lines and returns none when all are hidden.
- [x] 4.2 In `LinesPanel`, a labelled `type="search"` box at the top of the existing `<details>`,
      then up to 8 result buttons (name and line pills), disabled when no line is shown, and "No
      station matches" when empty. Pressing a result calls `goToStation` with `firstShownStop`.
      Verify by keyboard alone: Tab to the box, type, Tab to a result, Enter — the camera moves, the
      card opens and the name is on the map, larger.
- [x] 4.3 Styles in `src/index.css` for the box and results, matching the panel in both map modes,
      with the results list capped in height and scrolling. Verify at 400 px wide that the panel
      opens, the box is usable, and the time bar is not pushed off screen.

## 5. Look at it, and close out

- [x] 5.1 Run `npm test` and `npm run build`; both pass, and `ls dist/assets | grep worker` still
      lists a worker chunk of about half a megabyte.
- [x] 5.2 **The owner looks at the map in a browser.** Not done until a human has seen it. Check, and
      tune the figures in `labels.ts` by eye where they are wrong:
      - Whole network in view: only interchanges and terminals named, none overlapping.
      - Zooming into the city centre, then to street level: more names appear, never overlapping,
        never a wall of text; each floats just above its own rings.
      - The shared corridor (Chan Sow Lin to Sentul Timur), zooming in and out: every name stays
        with its rings as the offset changes, printed once; Titiwangsa printed once.
      - City view and wireframe view: names readable in both; text sharp enough at 12 px.
      - A train passing a label: the name stays readable over it, and the train is still clickable.
        A name near the caption goes under it, and the "scheduled, not live" sentence stays whole.
      - Hide Ampang: shared-corridor names stay, beside the Sri Petaling rings; hide every line of a
        station and its name goes; no line or ring moves.
      - Search "masjid", choose it: the camera goes there, the card opens, the name is highlighted.
      - Phone width (about 400 px): names do not swamp the screen; the panel still works.
      - Near Masjid Jamek at about z16 (city view): no OpenStreetMap station name beside ours; bus
        stops still shown. Note whether the
        panel should move to the right or into the time bar — both are the owner's call.
- [x] 5.3 Update `CLAUDE.md`'s Status with what was learned (the rendering choice and why, anchors
      from drawn rings, the choose/place split, the tuned figures), and open a pull request from
      `feat/station-labels` with a full description and `Closes #25`.
