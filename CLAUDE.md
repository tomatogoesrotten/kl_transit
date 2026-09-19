# KL Rail, by the timetable

A web app that shows Klang Valley trains (LRT, MRT, monorail, BRT Sunway) moving on a 3D map of
Kuala Lumpur. Train positions are **calculated from Prasarana's published GTFS timetable**, because
Rapid Rail has no live vehicle-position feed. Buses and KTM, which do have live GPS feeds, come later.

Honesty rule: the UI must always say positions are scheduled, not live. Never invent, smooth over,
or "fix" data silently. If the feed is wrong or missing, show that.

## About the owner

I'm newer to software development and I'm learning as I build. So:
- Plan first, then build one milestone from GUIDE.md at a time. Don't run ahead.
- Prefer simple, readable code over clever code. Explain non-obvious choices in a sentence or two.
- After each change, tell me what changed, why, and how I can see it working.
- Ask before adding a dependency, and say what it's for.

## Stack

- Vite + React + TypeScript (strict)
- MapLibre GL JS v6 for the map (v5 and below carry a critical XSS advisory), OpenFreeMap "liberty"
  style (`https://tiles.openfreemap.org/styles/liberty`, no key). Liberty already ships a `building-3d`
  fill-extrusion layer at minzoom 14, so we don't add our own.
- deck.gl on top of MapLibre (`MapboxOverlay`, interleaved) for tracks, stations and trains
- Vitest for tests
- Python 3 (pandas, numpy) only for `scripts/build_network_json.py`
- Library APIs move. Check the installed version's docs before using MapLibre or deck.gl APIs from memory.

## Commands

- `npm install`  once, to get dependencies
- `npm run dev`  dev server on http://localhost:5173
- `npm test`  Vitest
- `npm run build`  type-check (`tsc --noEmit`) then production build into `dist/`
- `python scripts/build_network_json.py data/gtfs data/network.json`  rebuild the data file from the raw feed

## Architecture

```
src/sim/   pure TypeScript. Timetable in, train positions out. No DOM, no map, no Date.now().
src/map/   MapLibre + deck.gl. Owns the animation loop and the layers.
src/ui/    React components: clock, time controls, line list, train and station cards.
data/      raw GTFS snapshot and the generated network.json (never edit network.json by hand)
reference/ the working single-file prototype and golden test data. Read-only. Port from it, don't import it.
```

- Time is always an argument. `src/sim` never reads the clock itself, so every function is testable.
- Kuala Lumpur is UTC+8 all year. Compute KL time explicitly from a UTC timestamp. Never rely on the
  browser's local time zone.
- Keep React out of the frame loop. Trains update 60 times a second through deck.gl directly
  (`overlay.setProps`). React state is for things a person changes: selection, speed, visible lines.
- Units: metres, seconds, degrees (compass bearing, 0 = north, clockwise). Coordinates are `[lon, lat]`.
- Any change to `src/sim` needs a test. `reference/sim-golden.json` holds expected results for the shipped data.

## What we learned about this feed (rapid-rail-kl)

- It is headway-based. `frequencies.txt` says "a train every N seconds between A and B". `stop_times.txt`
  holds ONE template trip per line, direction and day type. Weekday, Saturday and Sunday templates are
  identical; only the headways differ. Day types in use: `MonFri`, `Sat`, `Sun`.
- Windows can end at `24:00:00` and trips run past midnight. A train at 00:30 belongs to YESTERDAY's
  day type. Always check both today's and yesterday's departures.
- Direction-1 shapes are the exact reverse of direction-0 shapes, so we store one path per line.
- There is no `shape_dist_traveled`. The script projects each station onto its line's path.
  Stations can sit up to about 100 m from the track, so draw them at the projected point, not the raw lat/lon.
- `stops.txt` has quirks: `route_id` says `MRT` where `routes.txt` says `KGL`, a junk `geometry` column,
  ALL-CAPS names, sponsor names after " - ". Map stations to lines through the timetable, not `stops.route_id`.
- Interchange stations have one stop id per line (KJ15, MR1 and so on are all KL Sentral).
- Ampang and Sri Petaling lines share track between Chan Sow Lin and Sentul Timur.
- Trains keep left in Malaysia.
- Every first train starts at a terminal at 06:00, so roughly 06:00 to 07:30 looks emptier than real life.
- No `calendar_dates.txt`: public holidays are treated as ordinary days. `calendar.txt` ends 2026-12-31.
- Include whatever lines the feed marks valid (it currently includes the Shah Alam Line and BRT Sunway).

## Sources and limits

- Data: Malaysia's official open API, `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`.
  Use only the official API. Do not scrape operator websites or private endpoints.
- This is an unofficial project. No Rapid KL or Prasarana logos. Credit the data source and OpenStreetMap.
- Never commit secrets. There are none in v1.

## Definition of done for any task

1. `npm test` and `npm run build` pass.
2. I've been told how to check it in the browser.
3. The Status section below is updated, and the work is committed with a clear message.

## Status

- Milestone 0 (starter kit unpacked) done.
- Milestone 1 done: Vite + React + TS strict app, full-window MapLibre map of KL, tilted with 3D
  buildings. `data/network.json` is imported directly by `src/App.tsx` (Vite inlines it; no fetch,
  no copy in `public/` to go stale). `src/network.test.ts` guards its shape.
- Next: Milestone 2 in GUIDE.md (port the Sim module).
