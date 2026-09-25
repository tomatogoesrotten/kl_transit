# Proposal

## Why

Six milestones are built and nobody can see any of them. The project is a thing you can send someone
a link to, or it is a folder on one laptop.

And the timetable it draws is a snapshot taken once. Left alone it goes stale quietly — which is the
worst way for a project whose whole claim is that it shows what the published schedule says.

## What Changes

- The site is deployed and has a public URL.
- A daily job refreshes the timetable, and **fails loudly rather than committing a broken feed**.
- A README saying what this is, what it does not know, how to run it, and crediting the data
  correctly.
- An "About this data" explanation in the app, in plain language.
- The speed check in #7, which would fail on correct data, written against the timetable instead.

## Capabilities

### New Capabilities

- `data-freshness`: keeping the timetable current without letting a broken or truncated feed reach
  the site, and telling a viewer what the data does and does not cover.

## Impact

- **New**: a workflow, a feed-check script, a README, and the about panel's content.
- **Modified**: `package.json` gains a script for the feed checks; the caption's collapsed panel
  becomes the about text.
- **No change** to `src/sim/`, the layers, or the data itself.
- **Dependencies**: none in the app. The workflow needs Python, which the data script already uses.

## The test split, corrected

This change was framed as "separate the golden tests from the general ones". Checking the suite
rather than assuming shows that is too narrow: five files beyond the golden one carry assertions
measured from this feed — the shared-corridor ranges, a station's 105 m offset, Ampang's length,
train counts.

That is not a fault. Those numbers are what make the tests mean anything.

So the split is not "run some unit tests against new data". It is:

- **The unit suite describes the snapshot** and stays pinned to it. When a refresh changes those
  numbers, a person updates them deliberately, in a pull request, having looked.
- **The refresh has its own checks**, describing what *any* valid feed must look like, and never
  mentions a specific distance or count.

Two different jobs. Conflating them gives either a refresh that fails on every legitimate change, or
unit tests so vague they assert nothing.

## What the refresh must catch

A feed that is broken, truncated, or quietly wrong:

- fewer lines or stations than before
- a line with no departures, or missing a day type
- nothing running at the weekday morning peak
- something running at three in the morning
- a timetabled segment faster than any train on this network travels

**That last one is #7, and the naive version fails on correct data.** The animation eases trains
between stops, and that easing peaks at 1.5× the average speed for the run. The fastest legitimate
segment in the feed is 89.9 km/h, which renders as about 135 km/h. A check sampling the drawn
position would reject a perfectly good timetable. It has to measure the timetable.

## Honesty, collected in one place

The app has accumulated real limitations, each recorded where it arose. They belong somewhere a
viewer can find them:

- Positions are computed from a published timetable. Rapid Rail has no live vehicle feed.
- Track height is not in the feed, so trains are drawn at one assumed height — right for the
  elevated majority, wrong under the tunnels.
- Every first train starts at a terminal at 06:00, so early mornings look emptier than real life.
- Public holidays are treated as ordinary days; the feed has no holiday data.
- Lines sharing track are drawn apart as a map convention. They run on the same rails.
- Interchanges are one marker per line, because the feed gives one stop id per line.

## Credits, checked rather than assumed

The data is published under the **Terms of Use for Government Open Data Malaysia 1.0**. It requires
attribution, disclaims warranties, and grants no rights to logos, emblems or official symbols —
which is a licence condition behind the project's existing rule about not using operator branding,
not merely good manners.

Also due: OpenStreetMap for the map data, OpenFreeMap for the tiles. And it must say plainly that
this is unofficial.

## Non-goals

Live buses, KTM, and everything else on the after-version-1 list, including the four features in
issues #23 to #26.
