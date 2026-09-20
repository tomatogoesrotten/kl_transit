# Design

## Context

The app is a static build with no server. Deploying it is copying files. The interesting part of this
milestone is the refresh: a job that changes committed data on a schedule, with nobody watching.

## Goals / Non-Goals

**Goals**

- A public URL, with the build settings in the repository.
- A daily refresh that cannot quietly commit a broken feed.
- Checks that pass on any valid timetable and fail on a broken one.
- An honest account of the data's limits, in the app and in the README.

**Non-Goals**

- Anything on the after-version-1 list, including issues #23 to #26.
- A server. Version 2's bus proxy is why Cloudflare was chosen, but it is not this change.

## Decisions

### Two kinds of test, and they must not be confused

The project's tests assert values measured from the shipped feed: the shared corridor runs
6,405–14,893 m, a station is 105 m from its published coordinate, Ampang is 14,892.7 m, 196 trains
run at the weekday peak. Six files carry assertions like these.

That is correct. Those numbers are what make the tests mean anything — they caught a mirrored
station layout and a bearing off by a reflection.

But they are pinned to a snapshot, so a legitimate timetable change turns them red. That is also
correct, and `GUIDE.md` says so.

The mistake to avoid is making the refresh run them. It would fail on every real change, and the
response would be to loosen the assertions until they assert nothing.

So: **the unit suite describes the snapshot; the refresh has its own checks describing any valid
feed.** When a refresh changes the pinned numbers, a person updates them in a pull request, having
looked at what moved. That is a feature — it forces someone to notice.

### The checks, and the one that would have been wrong

Rules, not measurements:

| Check | Catches |
|---|---|
| Lines and stations not fewer than before | A truncated download |
| Every line has departures, in both directions, for every day type | A partial parse |
| Trains running at the weekday morning peak | A feed that produces nothing |
| Nothing running at three in the morning | Day-type or window corruption |
| No timetabled segment faster than 120 km/h | Mangled coordinates or times |

**The last one, written naively, fails on correct data.** `GUIDE.md` suggests it, and the obvious
implementation samples the drawn position over time. But the animation eases between stops, and
that easing peaks at **1.5×** the average speed of the run. The fastest legitimate segment in the
feed is Sri Petaling SP24→SP25 at **89.9 km/h**, which renders as about **135 km/h**.

So a naive check rejects a perfectly good timetable. It must measure the timetable:

```
speed = (stop[i+1].at - stop[i].at) / (stop[i+1].arr - stop[i].dep)
```

That is the quantity the feed actually asserts, it is independent of the easing curve, and it
genuinely catches corrupted geometry or times. This is issue #7.

**The general principle is worth stating: a check that rejects valid data is worse than no check,
because it gets switched off.** The first time it cries wolf on a good feed, someone disables it, and
then nothing is checked at all.

### Refusing leaves the old data in place

If the checks fail, nothing is committed and the failure is visible. The site keeps drawing the
previous timetable.

That is the right trade for this project. A month-old schedule is still honestly a schedule, and the
app says everywhere that it is showing a schedule. Half a network is not honest about anything.

### The build settings live in the repository

A hosting provider's dashboard is configuration nobody else can see, that nobody can review, and
that is lost when the account is. The build command, the output directory and the Node version go in
the repository; the dashboard should only point at it.

Pinning Node matters more than it looks: the build runs `tsc` and Vite, and a major version drift
can change the output or fail outright, months later, with nothing in the diff to explain it.

### Where the "about this data" text goes

The caption is already a collapsible panel holding the honesty line. That is where this belongs —
one place, already discoverable, already open on first load.

The limits to state have all been found during the work and recorded where they arose. Collecting
them is a matter of gathering, not inventing. Each is a real thing a viewer could otherwise
reasonably read as a defect:

trains passing through buildings; an empty map at 06:30; a station appearing several times; two
lines drawn apart that share rails; no special treatment of public holidays.

### Crediting the data

The licence is **Terms of Use for Government Open Data Malaysia 1.0** — checked, not assumed. It
requires attribution, disclaims warranties, and grants no rights to logos, emblems or official
symbols.

That last clause is why the project's no-operator-branding rule is a licence condition rather than
merely good manners, and the README should say so in those terms.

OpenStreetMap and OpenFreeMap are credited on the map already, through the attribution control. The
README should repeat them, because a reader of the repository never sees the map.

## Risks / Trade-offs

**The refresh commits to the default branch unattended.** It is narrow — one generated file, only
when the checks pass — but it is a job with write access running on a schedule. Its permissions
should be the minimum that allows it.

**The daily run depends on an external API.** A fetch failure should fail the run visibly rather than
committing anything, and should not be retried into a loop.

**Tiles come from a best-effort free service.** Nothing in this change depends on that, but a public
URL makes it a public dependency. `GUIDE.md`'s plan B is a single style URL swap; the README should
say so.

**The bundle is about 2.5 MB.** Fine for a static host, and it is what a first visit costs. It should
be stated rather than discovered on a phone connection.

## Migration Plan

None. Everything is additive, except the caption's panel gaining the fuller text.

## Open Questions

None. The one external dependency — the Cloudflare account and connecting the repository — is the
owner's to do, and is documented rather than decided here.
