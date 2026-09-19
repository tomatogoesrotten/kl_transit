# Design

## Context

Milestone 1 put a MapLibre map on screen. Milestone 2 built `src/sim/`, which can already answer
"where on the map is a point N metres along this line, and which way does it face". This change is
the wiring between them.

`GUIDE.md` told us to check the installed versions' docs rather than write deck.gl from memory. That
turned out to matter: the plan named the wrong class.

## Goals / Non-Goals

**Goals**

- The network visible over the real city, correct and legible.
- An overlay Milestone 4 can drive at sixty frames a second without React.
- Stations drawn where the track is, not where the feed says.

**Non-Goals**

- Trains, animation, picking, tooltips, panels. Later milestones.
- Merging interchanges or offsetting shared track. After version 1, and deliberately left visible.
- Performance tuning. Eight paths and 187 rings is nothing; measure before optimising.

## Decisions

### `MapLibreOverlay`, not `MapboxOverlay`

`CLAUDE.md` and `GUIDE.md` both say to use `MapboxOverlay` from `@deck.gl/mapbox` in interleaved
mode. That was right when the plan was written and is wrong now.

deck.gl 9.4.0 ships a dedicated `@deck.gl/maplibre` module. Its `MapLibreOverlay` declares

```
"maplibre-gl": "^4.5.1 || ^5.0.0 || ^6.0.0"
```

as a peer dependency, and the
[official guide](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) states that
"MapLibre GL JS v4.5.1, v5, and v6 applications should use `MapLibreOverlay` from
`@deck.gl/maplibre`".

`@deck.gl/mapbox`, by contrast, declares **no** `maplibre-gl` peer dependency at all. It duck-types
the map object it is handed, which is precisely why it drifts out of compatibility without anything
failing loudly.

This resolves the open risk recorded in `docs/decisions/0001`: taking maplibre-gl v6 for the
critical XSS fix does **not** cost us deck.gl integration, and no downgrade is needed. Both
`CLAUDE.md` and `GUIDE.md` must be corrected, and a new ADR records the finding so the next person
reading the old advice is not misled.

```ts
import { MapLibreOverlay } from '@deck.gl/maplibre'

const overlay = new MapLibreOverlay({ interleaved: true, layers })
map.addControl(overlay)
overlay.setProps({ layers })   // Milestone 4's frame loop calls this
```

### Interleaved, and what that costs

`interleaved: true` renders deck.gl into MapLibre's own WebGL2 context, so buildings and network
layers share one depth buffer and occlude each other correctly. The alternative, overlaid mode,
paints deck.gl on top of the finished map image — cheaper, more forgiving, and wrong the moment the
camera tilts near a tall building.

Two consequences:

- **It requires WebGL2.** Overlaid mode does not. Rather than silently downgrading, the app should
  let the failure be evident, per the honesty rule: a map with no network on it and an explanation
  beats a map that quietly looks flat.
- **Layer order is controlled by `beforeId`**, naming the MapLibre layer to insert beneath. The
  liberty style's own layer ids are the vocabulary here. Paths want to sit above the base map and
  below labels; the exact id has to be read from the live style rather than guessed, because a style
  update can rename it. If the named layer is missing, deck.gl appends on top — a silent
  degradation, so the chosen id should be verified at runtime rather than assumed.

### Stations come from `pointAt`, not from `stations[id]`

Each station carries a raw `lon`/`lat` in `network.json`, and each stop in a direction's timetable
carries `at`, its distance in metres along the line. These disagree: the build script projected
stations onto the line geometry, and the worst case is **105.3 m** (KJ37 Putra Heights), with BRT7
at 71.3 m and every other line under 45 m.

Drawing the raw coordinate would show stations floating beside their own track. So stations are
drawn at `pointAt(line, stop.at, false).lon/lat`.

Direction 0's stop list is used, with `reversed: false`, because `at` is recorded in the direction-0
sense and `pointAt` handles the reversal internally. Using direction 1 with `reversed: true` gives
the same points; using direction 1 with `reversed: false` does not, and would place every station
mirrored along its line. This is the easiest thing in the change to get subtly wrong, so it wants a
test asserting a known station lands within a metre or two of a known coordinate.

### Line width in pixels, not metres

A width in metres is physically honest and useless: at city-wide zoom every line collapses to
nothing. deck.gl's `PathLayer` supports `widthUnits: 'pixels'` with `widthMinPixels` and
`widthMaxPixels`, which keeps a line readable across the whole zoom range.

The spec states the requirement in terms of legibility rather than pixel counts, because the exact
numbers are a matter of taste that will be adjusted by eye. Taste is not a contract.

### React stays out

`MapView` owns the map in a `useEffect` and will own the overlay the same way. React renders the
container and nothing else. This is the architecture rule in `CLAUDE.md`, and it exists so that
Milestone 4 can call `overlay.setProps` from a `requestAnimationFrame` loop without a re-render on
every frame.

Consequence for this change: the layers are constructed once, outside React's render path. If lines
later need toggling (Milestone 6), that toggle is React state feeding a rebuild of the layer list —
not React owning the layers.

## Risks / Trade-offs

**`beforeId` is a string naming someone else's layer.** OpenFreeMap's liberty style is a
best-effort public service and can change. If the named layer disappears, deck.gl appends on top and
the interleaving quietly stops working. Mitigation: read the style's layers at runtime and pick the
insertion point from what is actually there, failing visibly rather than silently.

**Duplicate stations will look like a bug.** Eleven stations between Sentul Timur and Chan Sow Lin
belong to both the Ampang and Sri Petaling lines and will draw twice, and interchanges like KL
Sentral and Titiwangsa (four stops) will stack markers. This is the feed being honest about
per-line stop ids. It is a non-goal to fix here, but it should be written down so it is not
"discovered" as a defect later.

**Bundle size.** The app is already 1.3 MB from MapLibre. deck.gl adds meaningfully more. Individual
packages were chosen over the umbrella to limit it. Worth measuring after this change and recording
the number, so Milestone 7 knows what it is deploying.

**WebGL2 on old hardware.** Interleaved mode needs it. The honest failure mode is a visible message,
not a silent fallback that makes the 3D look subtly wrong with no explanation.

## Migration Plan

None. This is additive. `src/sim/` is untouched and its 49 tests must keep passing unchanged.

## Open Questions

None.
