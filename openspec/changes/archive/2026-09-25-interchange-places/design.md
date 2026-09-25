# Design

## Context

`data/network.json` holds 187 stops in `stations`, keyed by stop id, each with a `name` (the
build script's title-cased name with any sponsor suffix after " - " removed), published `lon`/`lat`,
and a `line` copied from `stops.route_id`. Every stop is called at by exactly one line's timetable.
`src/sim/prepare.ts` projects lines into the network's flat metre space with `origin.kx`/`ky`;
`pointAt(line, at, reversed)` turns a distance along a line back into `[lon, lat]`.

See proposal.md for why places are needed and for the measured facts.

## Goals / Non-Goals

**Goals**

- One pure function, called once, that a later change (#25, #26) can hold on to.
- Every value a place carries is derived from the feed, with the derivation written down.

**Non-Goals**

- Wiring places into the app. Nothing reads them until #25 or #26 needs them; adding a consumer now
  would be the first pixel this change promised not to add.
- Walking time, walking speed, or any transfer penalty. #26 owns turning metres into seconds.
- Grouping stations that are linked in real life but named differently (Muzium Negara and
  KL Sentral, Bukit Nanas and Dang Wangi). The feed does not say they are linked, so we do not.

## Decisions

### A place, and where it lives

`src/sim/places.ts` exports `places(net: PreparedNetwork): Place[]`; `Place` joins the other types
in `src/sim/types.ts`:

```ts
interface Place {
  id: string        // = name
  name: string
  stops: string[]   // stop ids
  lines: string[]   // line ids
  lon: number
  lat: number
  transfers: { from: string; to: string; metres: number }[]
}
```

It takes the prepared network because the representative position needs `pointAt`, which needs a
prepared line. The purity test already scans every non-test file in `src/sim`, so the new module is
held to the no-clock, no-DOM, no-top-level-`let` rule without touching the test.

### The id is the name

The name is already the grouping key, so it is unique among places by construction and stable for as
long as the feed keeps the name. A slug (`kl-sentral`) was considered and rejected: it is a
presentation choice for whoever puts an id in a URL, and it brings a collision case ("USJ 7" and
"USJ-7") that the name itself cannot have.

### Group by exact name, after the build script's normalisation

Exact equality on `stations[id].name`. It is exact only because `build_network_json.py` has already
collapsed whitespace, fixed the ALL-CAPS and cut the sponsor suffix; that is where name
normalisation belongs, and a second fuzzy pass here would be a heuristic hiding behind a key.

Proximity was rejected as a key, and not only as a tie-breaker: Ampang Park's two stops are 293.6 m
apart while Plaza Rakyat and Merdeka, different stations, are 230.1 m apart. No distance threshold
separates those two cases.

### Lines come from the timetable

A place's lines are the lines whose direction stop lists contain one of its stop ids, per CLAUDE.md's
rule to map stations to lines through the timetable rather than `stops.route_id`. Ordering, for
determinism: places by name; within a place, stops and lines in the network's line order, then by
each line's direction-0 stop order.

### Transfer distance uses the published coordinates

Distance is Euclidean in the flat projection, `x = (lon - origin.lon) * kx`,
`z = -(lat - origin.lat) * ky`, the same formula `prepare.ts` uses. Never haversine: every length in
the network is measured this way, and a second metric would make a transfer distance incomparable
with the track it joins.

The two candidate positions per stop disagree, sometimes a lot:

| Place          | Published | On-track |
|----------------|----------:|---------:|
| Putra Heights  |    24.2 m |  123.8 m |
| USJ 7          |    49.5 m |  107.3 m |
| KL Sentral     |   246.2 m |  209.8 m |
| Ampang Park    |   293.6 m |  287.8 m |

Published coordinates win. They are the operator's own statement of where each stop is; the on-track
point is our projection of it onto a path, which slides a stop along or across the track by up to
105 m (`KJ37`, Putra Heights) and so invents distance between platforms that stand side by side.
Putra Heights is a cross-platform interchange; 24 m is the honest figure and 124 m is an artefact.
`check_feed.py` measures from the same coordinates, so the check and the data it protects agree.

Neither is a walking distance. It is a straight line between two points, and the place records it as
such; #26 decides what that means in seconds.

### Representative position is the mean of on-track points

For labels (#25), a place's position is the mean of its stops' `pointAt(line, stop.at, reversed)`
positions, using direction 0 of the stop's line (both directions project a stop to the same point to
within a metre; measured). Taken from the track because that is where the markers are drawn;
published coordinates would put a label up to 105 m from the ring it names. Averaging `lon`/`lat`
directly is exact, not an approximation, because the flat projection is affine.

**Known limit:** the map draws the Ampang and Sri Petaling lines offset beside their shared
alignment by a pixel amount that depends on the camera (`src/map`, issue #18). `src/sim` cannot know
the camera, so a place on that corridor sits on the true alignment, between the two drawn rings.
If that matters for labels, #25 resolves it in `src/map`, where the offset is known.

### Two feed checks, both failing

The grouping rests on two assumptions about the feed. `check_feed.py` states each as a rule, measured
on published coordinates in the flat projection, with no station named:

- **name-spread**: stops sharing a name lie within **500 m** of each other. Measured widest is
  293.6 m (Ampang Park), so 206 m of headroom. Real interchanges joined by a walkway run to a few
  hundred metres; a name reused for a different station is kilometres away. A failure means the
  place would merge two stations, which is exactly the silent fix the honesty rule forbids.
- **name-split**: differently-named stops lie at least **100 m** apart. Measured closest is 230.1 m
  (Plaza Rakyat and Merdeka), so 130 m of headroom. It catches one station spelled two ways, which
  would silently leave an interchange as two places: 16 of today's 22 interchanges have every stop
  within 100 m, including all seven 0 m shared-track pairs.

Near-duplicates are a failure, not a note. A note in a daily log does not stop the data shipping,
and a split interchange breaks the planner as surely as a merged one. The cost is that a feed with
two genuinely distinct stations under 100 m apart would stop the refresh until a person looks; no
two stations on a railway are that close, so that is the right trade.

Each gets a self-test case in `CASES`, found from the data rather than by name: move one stop of any
multi-stop group ~5 km away (spread), and rename one stop of the closest same-name pair (split).
`check:feed` then breaks the data eight ways instead of six.

## Risks / Trade-offs

- [A split interchange wider than 100 m, such as KL Sentral renamed on one line, passes both checks]
  → Accepted. No threshold catches it without also rejecting Plaza Rakyat and Merdeka. The pinned
  `npm test` counts (160 places, 22 interchanges) turn red on the next deliberate snapshot update,
  and a person sees it there.
- [Pinned numbers move when the feed changes] → By design. `npm test` pins this snapshot and a
  person updates it in a pull request; `check:feed` names no measured value.
- [A place position between two offset rings on the shared corridor] → Recorded above as a known
  limit for #25, not hidden.
