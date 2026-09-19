# Building KL Rail as a real web app with Claude Code

This guide takes the single-file prototype and turns it into a proper project: a real map with 3D
buildings, typed and tested code, a public URL, and data that refreshes itself. It is written as
seven milestones. Each one is sized for a single sitting of two to three hours, and each one ends
with something you can see working.

## What version 1 is, and what it isn't

Version 1 is the rail network only: LRT, MRT, monorail and BRT Sunway, moving by the timetable on a
real map, with the clock controls and the train and station cards from the prototype, live on a
public URL.

Left for later on purpose: live buses, KTM, merged interchange stations, ridership layers, fancy
train models. They are listed at the end in the order I'd do them. Buses need a small server, and
it's better to have a finished, deployed thing before adding one.

## What's in this folder

| Path | What it is |
|---|---|
| `CLAUDE.md` | Project context. Claude Code reads it at the start of every session. Keep it current. |
| `GUIDE.md` | This file. |
| `reference/prototype.html` | The working prototype. The `Sim` section inside it is the part we keep. |
| `reference/sim-golden.json` | Expected simulation results (train counts, exact positions). The port must reproduce them. |
| `scripts/build_network_json.py` | Turns the raw GTFS feed into `data/network.json`. |
| `data/gtfs/` | Snapshot of the feed you downloaded. |
| `data/network.json` | The compact file the app loads: lines, paths, stations, stop times, headways. |

One thing to know up front: the prototype draws with Three.js on an empty grid. The real app draws
with deck.gl on a MapLibre map. So the drawing code gets rewritten, and the simulation code (timetable
in, positions out) gets ported almost line for line. That split is why the prototype was written in
separate parts.

## One-time setup

1. Install **Node.js** (the current LTS) from nodejs.org, and **Git** from git-scm.com.
2. Install **Python 3**, then the two packages the data script needs:
   `pip install -r scripts/requirements.txt`
3. Install **Claude Code**. You need a Claude subscription (Pro, Max, Team or Enterprise) or a
   Claude Console account.
   - macOS, Linux, WSL: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
   - Check it with `claude --version`. On Windows, installing Git for Windows first is recommended.
   - If you'd rather not live in a terminal, Claude Code also runs in VS Code and as a desktop app.
     Everything below works the same way there.
4. Unzip this folder somewhere sensible, then in a terminal:
   ```
   cd kl-rail
   git init
   git add .
   git commit -m "Starter kit: prototype, data script, feed snapshot"
   claude
   ```
5. First message to Claude Code, just to check it has its bearings:
   ```
   Read CLAUDE.md and GUIDE.md, then tell me in your own words what we're building, what the
   honesty rule is, and what Milestone 1 involves. Don't change anything yet.
   ```

## How to work with Claude Code on this project

These six habits matter more than any prompt wording.

1. **Plan before building.** Press `Shift+Tab` to cycle permission modes until you're in plan mode.
   Claude reads and proposes but doesn't edit. Read the plan, ask about anything you don't follow,
   then switch back and let it build.
2. **One milestone per session.** When a milestone is done and committed, type `/clear` (or start a
   fresh session) before the next. Long sessions drift, and `CLAUDE.md` carries what matters forward.
3. **Give it a way to check itself.** This project has three: `npm test` (the golden file),
   `npm run build` (the type checker), and you looking at the browser. When something looks wrong,
   say exactly what you see, or paste a screenshot.
4. **Commit at every green state.** `commit this with a clear message` is a fine prompt. If a session
   goes wrong, `git status` and `git diff` show what changed, and you can always go back.
5. **Make it teach you.** After each milestone ask: `Walk me through the three most important files
   you wrote, as if I'm new to TypeScript.` Be strict about understanding `src/sim`, since that's
   the heart of the project. It's fine to be looser about UI code.
6. **Feed the memory.** When Claude gets the same thing wrong twice, add one line to `CLAUDE.md` so
   it never happens a third time. When a milestone ends, have it update the Status section.

Useful keys and commands: `Esc` stops Claude mid-action. `claude -c` continues your last session in
this folder. `/help` lists everything else.

## The stack, and why

| Piece | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript | Standard, fast, and the type checker catches mistakes you won't. |
| Map | MapLibre GL JS | Free and open source. Tilt, rotate and 3D buildings built in. |
| Map tiles | OpenFreeMap, "liberty" style | No account, no API key, includes building heights. It's a best-effort public service, so see the pitfalls section for a plan B. |
| Trains, tracks, stations | deck.gl over MapLibre | Works in longitude and latitude, has click and hover picking built in, and will handle thousands of buses later. |
| Tests | Vitest | Same toolchain as Vite, nothing extra to configure. |
| Data step | The existing Python script | Already written and verified. Runs locally and in GitHub Actions. |
| Hosting | Any static host | Version 1 is just files. I'd pick Cloudflare Pages, because the bus feed proxy in version 2 can live in the same place as a Worker. |

## Milestones

Paste each prompt as the first message of a fresh session, in plan mode.

### Milestone 1: A tilted 3D map of KL in the browser

```
We're doing Milestone 1 from GUIDE.md and nothing else.

Scaffold a Vite + React + TypeScript app in this folder without disturbing the existing files
(CLAUDE.md, GUIDE.md, reference/, scripts/, data/). TypeScript strict mode on. Add Vitest.

Show a full-window MapLibre map using the OpenFreeMap liberty style, centred near
[101.699, 3.146], zoom 12.5, pitch 55, bearing about -18, with 3D building extrusions switched on
and the attribution control visible. Put the map code under src/map/.

Make data/network.json available to the app at runtime (tell me how you chose to do it).

Show me your plan first. Done means: npm run dev shows the tilted map with buildings,
npm run build passes, and the Commands and Status sections of CLAUDE.md are updated.
```

**Done when:** you can drag, tilt and zoom around a 3D Kuala Lumpur.

### Milestone 2: Port the simulation, and prove it

This is the most important milestone. No pixels change, and that's the point.

```
We're doing Milestone 2 from GUIDE.md and nothing else.

Port the Sim module from reference/prototype.html (the code between //SIM-START and //SIM-END)
and the Kuala Lumpur clock helpers (klNow, svcOf, setTimeOfDay) into typed TypeScript under
src/sim/. Follow the architecture rules in CLAUDE.md: pure functions, time passed in as an
argument, no DOM, no Date.now().

One deliberate change from the prototype: pointAt should return { lon, lat, bearingDeg } instead
of local x/z, because the map works in longitude and latitude. Keep distances in metres.

Write types for the network.json shape. Then write Vitest tests that load data/network.json and
reproduce every case in reference/sim-golden.json: totals, per-line counts, trains at a platform,
and for the cases that list trains, each train's alongMetres (to 0.1 m), lon/lat (to 6 decimals),
bearing (to 0.1 degree), plus the nextDepartures case.

Show me your plan first. Done means npm test and npm run build pass.
```

**Done when:** the tests pass, and you've asked it to explain `progress()` and `activeTrains()` until
you could explain them to someone else.

### Milestone 3: Draw the network on the map

```
We're doing Milestone 3 from GUIDE.md and nothing else.

Add deck.gl on top of the MapLibre map using MapboxOverlay in interleaved mode, so layers sit
among the 3D buildings properly. Check the installed versions' docs for the current integration.

Draw every line from network.json as a path in its official colour, with a width in pixels that
stays readable at any zoom. Draw every station as a small ring in its line colour, placed ON the
track using the simulation's pointAt and the station's distance along the line, not the raw
stop coordinates.

Show me your plan first. Done means the whole network is visible over the map, tests and build pass.
```

**Done when:** it looks like the Klang Valley transit map laid over the real city.

### Milestone 4: Trains that move

```
We're doing Milestone 4 from GUIDE.md and nothing else.

Add an animation loop in src/map/ that, every frame, gets the current Kuala Lumpur time, calls
activeTrains, and draws each train as a small 3D box pointing along its bearing, with the roof in
the line colour. Follow the CLAUDE.md rule: update deck.gl directly each frame, keep React out of it.

Details that matter, all visible in reference/prototype.html:
- Trains keep left: shift each one to the left of its direction of travel so the two directions
  don't overlap.
- Size: real-world size when zoomed in, but never smaller than about 20 px long on screen, so
  trains stay visible when zoomed out.
- A station's ring fills with its line colour while a train is stopped there.

Show me your plan first. Done means trains are moving right now on the map (or I can see them by
temporarily forcing the time to 08:00 on a weekday), and tests and build pass.
```

**Done when:** you can zoom into Pasar Seni and watch a train pull in, pause, and leave.

### Milestone 5: The clock and time controls

```
We're doing Milestone 5 from GUIDE.md and nothing else.

Build the time controls from the prototype as React components under src/ui/: the clock panel
(KL time, date, which timetable is in use), a time-of-day slider, Now / Pause / 1x 10x 60x, and
the timetable override (by date, weekday, Saturday, Sunday). Add the notice shown when no trains
are scheduled, with its button to jump to the morning peak. Add the short honest explanation that
positions come from the schedule, not GPS.

Propose the simplest way to share this state between React and the animation loop, and ask me
before adding a dependency for it. Must work on a phone-width screen.

Show me your plan first. Done means I can scrub through a whole day and watch service build up
and wind down, and tests and build pass.
```

### Milestone 6: Select, inspect, follow

```
We're doing Milestone 6 from GUIDE.md and nothing else.

Using deck.gl picking: hovering a train or station shows a small tooltip. Clicking a train opens a
card with its line, destination, where it started and when, what it's doing now, and its next
five stops with clock times. Clicking a station opens a card with the next three departures in
each direction (nextDepartures in src/sim). A Follow button keeps the map centred on the selected
train and cancels as soon as I drag the map.

Add the lines panel: one row per line with its colour, name, a count of trains running, and a
toggle that hides the line, its stations and its trains.

Show me your plan first. Done means all of that works with mouse and touch, tests and build pass.
```

### Milestone 7: Ship it, and keep the data fresh

```
We're doing Milestone 7 from GUIDE.md and nothing else.

1. Help me put this on GitHub and deploy it as a static site (I'm leaning towards Cloudflare
   Pages; tell me if something else is simpler). Walk me through the steps I have to do by hand.
2. Add a GitHub Actions workflow that runs daily at 20:00 UTC (04:00 in Kuala Lumpur, before
   service starts): download the GTFS zip from the official API URL in CLAUDE.md, run
   scripts/build_network_json.py, run the tests that don't depend on the golden file, and commit
   network.json only if it changed. Make the script fail loudly, without committing, if the feed
   looks broken: fewer lines or stations than before, or a line with no departures.
3. Write a README: what this is, the scheduled-not-live explanation, known limits, how to run it,
   and credits for data.gov.my / Prasarana, OpenStreetMap and OpenFreeMap. Check the data licence
   terms on data.gov.my and word the credit accordingly. State that the project is unofficial.
4. Add an "About this data" link in the app that says the same in plain language.

Show me your plan first.
```

**Done when:** you can send someone a link.

## After version 1, in the order I'd do it

1. **Live buses.** A small proxy (a Cloudflare Worker is enough) that fetches the GTFS-Realtime
   vehicle positions every 30 seconds, decodes the protobuf, and serves JSON to the app. Then a bus
   layer that glides between GPS pings instead of jumping. Design for an empty feed from day one:
   the Rapid Bus KL feed has been reported returning zero vehicles at times.
2. **KTM Komuter and ETS.** These have a real GPS feed, so they reuse the bus pipeline.
3. **Interchanges and shared track.** Merge the per-line stops at places like KL Sentral into one
   station marker, and offset the Ampang and Sri Petaling lines where they share track.
4. **Ridership.** The daily origin-destination dataset you spotted can drive station pillars whose
   height shows how busy each station is.
5. **Height.** Elevated versus underground sections, from OpenStreetMap tags, since GTFS has none.
6. **Polish.** Real train models, night lighting, rain.
7. **More cities.** Penang, Johor Bahru and the other BAS.MY networks use the same API.

## Pitfalls specific to this project

- **Time zones.** The app must show Kuala Lumpur time no matter where the viewer is. The simulation
  already handles this. Don't let a date library quietly reintroduce local time.
- **React in the frame loop.** If trains ever stutter, check first whether something is calling
  `setState` sixty times a second.
- **The golden file is tied to this feed snapshot.** When the daily refresh changes the timetable,
  those exact numbers will stop matching, and that's correct. Keep golden tests pinned to a saved
  copy of `network.json`, and write the refresh checks as general rules (every line has trains at
  08:00 on a weekday, no train moves faster than 120 km/h, nothing runs at 03:00).
- **The feed's calendar ends on 31 December 2026.** The daily refresh should pick up the renewal,
  but it's worth a calendar reminder to look.
- **Map tiles are a free public service.** If OpenFreeMap is slow or changes, the swap is a single
  style URL. MapTiler has a free tier with a key, and Protomaps lets you host one tiles file yourself.
- **Stick to the official API.** Some people pull positions from the operator's own tracking site.
  It's unofficial, can break without notice, and isn't yours to build a public site on.
- **Early mornings look thin.** The feed starts every train from a terminal at 06:00. Real trains
  enter from depots along the line. Say so in "About this data" and move on.

## Links

- Claude Code docs: https://code.claude.com/docs/en/quickstart
- Malaysia open API, GTFS static: https://developer.data.gov.my/realtime-api/gtfs-static
- Malaysia open API, GTFS realtime: https://developer.data.gov.my/realtime-api/gtfs-realtime
- MapLibre GL JS: https://maplibre.org
- deck.gl: https://deck.gl
- OpenFreeMap: https://openfreemap.org
- Inspiration: https://github.com/nagix/mini-tokyo-3d and https://github.com/ianlkl11234s/mini-taiwan-pulse
