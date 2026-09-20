# Proposal

## Why

Stations are four-pixel rings drawn on the track. In the city centre they are lost among the 3D
buildings, and from a distance they are indistinguishable from the line itself. There is no way to
scan the map and see where the stations are — which, on a map of a rail network, is most of what a
person came to find out.

## What Changes

- **Close: a station model.** A platform structure, varying by mode, so an LRT platform, an MRT
  platform, the monorail's narrow beam station and a BRT stop each look like themselves.
- **Far: a beacon.** A translucent column in the line's colour rising above the roofline, so
  stations read instantly at any zoom and from any angle.
- **A crossfade between them**, so neither pops in.
- One model and one beacon **per place**, not per line — four models stacked at Titiwangsa would be
  worse than the four rings already there.

## Capabilities

### Modified Capabilities

- `network-map`: the requirement that stations are drawn on the track gains what a station now looks
  like — that it is findable among buildings and from a distance, and that a place served by several
  lines is marked once rather than once per line.

## Impact

- **New**: the station models and their generator, the beacon layer, and a grouping of stops into
  places.
- **Modified**: the station layer in `src/map/`, which keeps its per-line rings.
- **No change** to `src/sim/`. Grouping is a drawing concern here; the fuller treatment is #23.
- **Dependencies**: none added. `@deck.gl/mesh-layers` is already installed for the trains.

## What stays exactly as it is

**The per-line rings.** They carry two things the models must not swallow: which line a station
belongs to, and whether a train is standing at it. A place serving four lines still shows four
rings, because four lines really do stop there and one of them might have a train in it.

So the division is: **the model and the beacon say "there is a station here"; the rings say which
lines and which of them is busy.** That keeps a feature built in Milestone 4 working, and it is why
merging the markers is not part of this change.

## What the data says

Checked rather than assumed:

- 187 stops group into **160 places** by name, 22 of them served by more than one line.
- No two differently-named stops are within 150 m, so grouping by name is exact here rather than a
  heuristic that happens to work.
- Four modes, unevenly: **LRT 4 lines, MRT 2, monorail 1, BRT 1**. So the LRT model is seen four
  times as often as the others and deserves the most care.

## Constraints carried from the train models

Learned the hard way in #16, and expensive to rediscover:

- `ScenegraphLayer`'s `getColor` **replaces** a material's base colour factor and **multiplies** a
  base-colour texture. Per-instance tinting therefore only works if the shading lives in a texture.
- Model axes are **+X forward, +Y left, +Z up, in metres** — deliberately not glTF's usual Y-up,
  because deck.gl applies no axis conversion.
- `ScenegraphLayer` has no pixel-size floor, so sizing uses the camera-derived relation already in
  `src/map/trains.ts`.
- Stations sit at their **drawn** position — on the track, and offset where a line shares an
  alignment — not at the feed's coordinates, which are up to 105 m out.

## The honest limit, again

The feed carries no elevated-or-underground data. A platform model at an assumed height will be
wrong wherever the line is in a tunnel, exactly as the trains already are, and the app's "about this
data" already says so. This change does not make that worse, and must not imply otherwise.

## Non-goals

- Merging the per-line rings. See above — that is #23, and doing it here would break the station
  fill.
- Station labels. #25.
- Real architectural models of actual stations. These are generated, replaceable, and representative
  of a mode rather than of a building.
