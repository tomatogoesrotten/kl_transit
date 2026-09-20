# Design

## Context

`src/sim` computes train positions and `src/map` draws the network. This change joins them with an
animation loop.

The prototype already does all of this in Three.js, on an empty grid, in local metres. Everything
below was read out of `reference/prototype.html` and checked against the installed deck.gl and the
live liberty style. Where the port differs from the prototype, it says why.

## Goals / Non-Goals

**Goals**

- Trains moving on the timetable, at 60 fps, with React uninvolved.
- Keep-left, the size floor, and station fill, all as `GUIDE.md` describes them.
- No new dependency.

**Non-Goals**

- Time controls, picking, cards, follow-camera, per-line visibility. Milestones 5 and 6.
- Real train models. Polish list, and the moment to reconsider `@deck.gl/mesh-layers`.

## Decisions

### Two extruded polygon layers, not an icon and not a mesh

`GUIDE.md` asks for "a small 3D box pointing along its bearing, with the roof in the line colour".
Of the installed packages:

| Layer | Oriented | 3D | Separate roof colour | Pixel floor |
|---|---|---|---|---|
| `IconLayer` | yes | no | no | **yes** |
| `SolidPolygonLayer` | yes, you build the corners | **yes** | no, one colour per polygon | **no** |
| `ColumnLayer` | no — angle is layer-level | yes | no | no |

So: **two `SolidPolygonLayer`s**, a neutral body and a line-coloured roof slab above it. That is the
only way to get an oriented box with a differently coloured roof out of what is installed, and it
matches the prototype, whose roof carries the only per-train colour.

`IconLayer` was the lazier option and was rejected on looks: it is flat, so "roof in the line colour"
would collapse to "the whole sprite is the line colour". It would also have given the 20-pixel floor
for free. The owner chose the box knowing that cost.

`SimpleMeshLayer` from `@deck.gl/mesh-layers` would be the exact analogue of the prototype's
instanced boxes, but the package is not installed, ADR 0003 records the deliberate choice to install
deck.gl piecemeal, and it would still need a second layer for the roof and still have no pixel floor.
Not worth a dependency here.

### Size: the prototype's trick, ported

`SolidPolygonLayer` has no `sizeMinPixels`, so the size floor has to be computed. The prototype's
approach works and is worth understanding rather than reinventing:

```js
const W = Math.max(4, Math.min(420, camDist * 0.0021));   // metres
const len = W * (10 - 4.5 * far);
```

`W` is proportional to camera distance, so any length expressed as a multiple of `W` has a
**constant pixel size** — the distance cancels. That is the whole trick. With the prototype's 38°
field of view, `10 × W` works out at about 21 px on a 700 px-tall canvas.

The `Math.max(4, …)` floor is what gives real-world size up close: below about 1.9 km the train
becomes a fixed 40 m × 8 m × 6.8 m object that grows as you zoom in.

In deck.gl there is no `camDist`; the equivalent is metres-per-pixel:

```ts
const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
const W = Math.max(4, Math.min(420, 3.05 * mpp))
```

`mpp` here is the Mercator ground resolution and ignores pitch, where the prototype's `camDist` was
the true eye-to-target distance. Close enough for sizing; it is not exact and should not be reused
for anything that must be.

### Keep left, and the sign that will be got wrong

The prototype, in local metres where x is east and z is south:

```js
const x = P.x + P.tz * W * 1.15, z = P.z - P.tx * W * 1.15;
```

`(tz, −tx)` is the left-hand normal in that frame. Checked: heading north `(0, −1)` gives an offset
due west; heading east `(1, 0)` gives an offset due north. Both correct.

The port has no tangent — `pointAt` returns `bearingDeg` only. Re-derived, the left-hand direction
in (east, north) components at compass bearing `B` is:

```
left = (−cos B, +sin B)
```

which is the unit vector at bearing `B − 90°`. Sanity checks that must both hold: north (B = 0)
gives due west; east (B = 90) gives due north.

Converted to degrees with the network's own projection constants, never haversine:

```ts
const b = (point.bearingDeg * Math.PI) / 180
const d = W * 1.15
const lon = point.lon + (-Math.cos(b) * d) / line.origin.kx
const lat = point.lat + (Math.sin(b) * d) / line.origin.ky
```

The latitude sign is `+`: `pointAt` writes `lat − z / ky` because its `z` runs south, but this offset
is already expressed as a northward component.

**This is the one thing here the type checker cannot catch.** Getting the sign backwards moves both
directions symmetrically, so the picture still looks plausible — it just shows trains running on the
wrong side. It gets a unit test: a train at bearing 0 must land west of the centre line, and a train
at bearing 90 must land north of it.

### Height: an assumption, declared as one

The overlay's `beforeId` resolves to a label layer *after* `building-3d`, so deck.gl's layers are
depth-tested against the building extrusions. Trains at ground level would be occluded by buildings
exactly where the network is busiest.

Trains are drawn at roughly viaduct height. That is right for the elevated majority of this network
and wrong twice over: they will still be hidden by tall buildings in the city centre, and they will
float above ground where the line is in a tunnel.

The feed has no elevated-or-underground data — `GUIDE.md` lists deriving it from OpenStreetMap as
after-version-1 work. The alternative, `depthTest: false`, would make trains always visible and throw
away the three-dimensional composition Milestone 3 was built for.

So the assumption stays, and the honesty rule applies: the app's explanation of its data must say
that track height is not in the feed and has been assumed. An assumption that is stated is a
limitation; an assumption that is hidden is a lie.

### The station fill needs the layer changed

`src/map/layers.ts` currently draws station markers with `filled: false, stroked: true`. `filled` is
a **layer-level** property — it cannot be set per marker. So the layer becomes `filled: true` with a
fill colour that is transparent when idle and the line colour when busy.

Transparent, not a background colour: the prototype filled with the page background because it drew
on a flat shader ground. Here there is a real map underneath, and a hardcoded fill would punch a
hole in the city.

### Resolving a dwelling train to its station marker

`train.stop` is an index into **that direction's** stop list, and direction 1's list is the reverse
of direction 0's — which is what the markers are built from. Indexing directly would light the wrong
station for every direction-1 train.

The prototype resolves by **stop id**, which sidesteps the reversal entirely, and that is what to
port. Checked against the data: all 187 stop ids are unique across the network, and no line visits
the same id twice.

`stationDots` already carries `id`, so a `Map` from id to index, built once, is all that is needed.

**The `dwelling` guard is not optional.** `Progress.stop` is documented as "the one it is at, or the
one it is heading for". Without the guard, every station on the network lights up permanently.

### The clock lives in `src/map`

The prototype's `clock` is a mutable module-level object that calls `Date.now()` every frame. Neither
can exist under `src/sim` — `purity.test.ts` fails the build on exactly that. It becomes a ref in
`src/map`, and the loop calls `klNow(clock.ms, clock.override)`.

Its fields are not orthogonal, which is worth knowing before Milestone 5 builds controls on them: in
the `live` branch `speed` is ignored entirely, which is why the prototype's speed buttons force
`live = false`.

### What the loop must not do sixty times a second

- **Rebuild the static layers.** `networkLayers` walks 187 stops calling `pointAt`, and the path
  layer re-tessellates thousands of vertices when its `data` reference changes. Build once, hold in
  a ref, and pass the *same* layer instances back each frame — that is how deck.gl is told nothing
  changed.
- **Re-parse colours.** `hexToRgb` does a `parseInt` on a string. Precompute per line.
- **Call `pointAt` twice per train.** Once gives both the position and the keep-left offset.
- **Recompute when nothing moved.** While paused, the simulated second is unchanged and so is the
  whole answer.

Rebuilding the *train* layers every frame is fine and is the intended pattern: deck.gl layers are
immutable descriptors, not GPU state, and a new `data` array regenerates attributes without needing
`updateTriggers`. At 196 trains that is a few thousand float writes.

The station markers are the opposite case — a stable `data` array mutated in place — so they *do*
need an `updateTriggers` bump, or deck.gl will never notice a marker became busy.

`_dataDiff` is the wrong tool: it pays off for a large, mostly-stable array, and ours is entirely new
each frame and only 196 rows. It would be right for the future bus layer.

### Frame loop hygiene

- Re-arm `requestAnimationFrame` **first**, so an exception kills one frame rather than the loop.
- Clamp the delta to 250 ms. Without it a backgrounded tab returning after thirty seconds advances
  simulated time by half an hour at 60× and teleports every train.
- Cancel the frame in the same cleanup that removes the map, or React's development double-mount
  leaves two loops racing on one overlay.
- Tolerate a null overlay: it is legitimately absent without WebGL2, or when no label layer was
  found.

## Risks / Trade-offs

**Per-frame trigonometry.** Two polygons × four corners × 196 trains is a few thousand trig calls per
frame. The prototype did comparable work and held 60 fps. Measure before optimising.

**The size constants are taste.** The 40 m length and the pixel floor are starting points; they want
looking at, and they are not in the spec, which fixes only that trains stay visible.

**Trains will disappear behind tall buildings.** Deliberate, per the height decision. If it proves
too annoying in the city centre, the options are raising the height further or `depthTest: false`,
and either is a new decision rather than a quiet tweak.

**Coplanar z-fighting.** The tracks and markers sit at ground level. Trains need a height anyway,
which incidentally avoids it.

## Migration Plan

None. Additive.

## Open Questions

None.
