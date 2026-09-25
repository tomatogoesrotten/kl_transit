# Proposal

## Why

Nothing on the map says which station is which. A viewer has to hover a ring or open the lines
panel to learn that the ring in front of them is Masjid Jamek, and at phone width there is no hover
at all. The owner asked for station names floating above the stations without obstructing the view,
and for the lines panel to find stations by name. #23 has landed, so every station can now be named
once rather than once per line: Titiwangsa is one place, not four stops.

This implements issue #25.

## What Changes

- **Station names on the map**, one per place from `places()`, never one per stop. A label sits with
  the rings that are actually drawn, including on the Ampang/Sri Petaling corridor where the rings
  are offset by a number of pixels that changes with the zoom.
- **Not all of them.** Which labels show is chosen by priority (the selected place, then
  interchanges and terminals, then the rest as the camera comes closer) and by collision: no two
  labels ever overlap, and there is a ceiling on how many show at once.
- **The prototype's split, kept.** Choosing which labels show is throttled to about five times a
  second and only runs when something that affects it has changed. Placing them is done by the
  renderer every frame. React is not involved in either.
- **Names are drawn over the lines and the trains.** The owner's decision after seeing it: a name
  hidden by a passing train, or crossed by a line, cannot be read. They are still beneath every
  panel, so they cannot cover the "scheduled, not live" statement, and they are not a pick target,
  so a train under a name still answers a hover or a click.
- **Labels follow line visibility.** A place disappears from the map when every line serving it is
  hidden, and stays labelled while any of them is shown.
- **The lines panel gains a station search**: a text box that finds places by name. Choosing a
  result flies the camera there, selects it, and gives its label the highest priority so it is
  always shown. One panel, not two; it stays where it is.
- **OpenStreetMap's own station names are taken off the base map**, so ours are the only ones.
  Bus stops stay.
- No new dependency. `TextLayer` is part of the already-installed `@deck.gl/layers`.

## What the data says

Measured from `data/network.json`:

- 187 stops, **160 places**. 22 places are served by more than one line and 13 are terminals, 7 of
  them both, so 28 places carry the top priority.
- **Every name is plain ASCII.** The whole set of characters used is letters, digits `1 2 5 6 7 8`,
  space, hyphen and apostrophe. A daily refresh could still bring an accented name, so the label
  font's character set is taken from the data rather than assumed.
- Names are short on average (11.6 characters) with a long tail: the longest is
  "Taman Perindustrian Puchong" (27), then "Pusat Bandar Damansara" and "Bandar Tun Hussein Onn"
  (22). The shortest are "UPM", "Imbi", "KLCC", "PWTC", "Pudu". Collision must measure each label,
  not assume a width.
- In the city view the base map carries its own rail-station names from OpenStreetMap. In
  OpenFreeMap's tiles a station is a POI of class `railway` (subclass `station` or `subway`), and
  liberty prints it through its rank-banded POI layers (`poi_r1`, `poi_r7`, `poi_r20`) from zoom
  15, with codes in the name ("AG7 SP7 KJ13 Masjid Jamek"). It is NOT liberty's `poi_transit`
  layer: that one admits the classes `airport`, `bus` and `rail`, never `railway`, so in Kuala
  Lumpur it draws bus stops, some named after the station they serve ("LRT Masjid Jamek").
  Measured by decoding the live tiles for central KL. OSM names printed beside ours, spelled
  differently, would name one station twice. The owner decided ours should be the only
  station names: the railway class is filtered out of those layers. Bus stops stay, because they
  are real stops and live buses are coming to this map (#40).

## Capabilities

### New Capabilities

- `station-labels`: which stations are named on the map, where each name sits, how names avoid
  each other and the honesty statement, how they sit over the trains without taking their clicks, and how they follow visibility and selection.

### Modified Capabilities

- `inspection`: the lines panel gains a way to find a station by name and go to it.

## Impact

- **New code**: `src/map/labels.ts` (label anchors, priority, the collision choice and the layer) and
  its test; `src/ui/search.ts` (name normalisation and matching) and its test.
- **Changed**: `src/map/MapView.tsx` (the throttled choose pass and the label layer in the layer
  list, and the station-name filters at load), `src/map/modes.ts` (`stationNameFilters`),
  `src/ui/LinesPanel.tsx` (the search box and its results), `src/index.css`.
- `places()` is computed once and shared by the map and the panel rather than per component.
- `src/sim` is untouched and stays pure.
- Bundle: `TextLayer` adds about 68 KB minified, 17 KB gzipped (measured with esbuild on the
  installed deck.gl 9.4.0). The MapLibre worker chunk is unaffected and must still be about half a
  megabyte.
