# KL Rail

A 3D map of Kuala Lumpur with the trains on it: LRT, MRT, the monorail and BRT Sunway, moving along
their real tracks, at the times the published timetable says they move.

## Scheduled, not live

Nothing here is observed. Rapid Rail publishes no live vehicle positions, so every train on this map
is **computed from Prasarana's published GTFS timetable**. A train drawn between two stations is
where the schedule says a train should be at that moment, not where one is.

That distinction is the point of the project rather than a caveat bolted onto it. If a service is
delayed, cancelled or added, this map will not know. The app says so on its face, and it will keep
saying so: the honest version of "we don't have live data" is to show the schedule and label it, not
to imply more than the feed contains.

Buses and KTM Komuter do have live GPS feeds. They come later, and when they do they will be
labelled as live, because they will be.

## What this data does not know

Each of these looks like a bug until you know the feed. They are all in the app too, under "What
this data does not know".

- **Track height is not in the timetable.** Every train is drawn at one assumed viaduct height,
  which is about right for the elevated majority of the network and wrong wherever the line is in a
  tunnel. That is why trains sometimes pass through buildings.
- **Early mornings look emptier than they are.** Every trip in the feed starts from a terminal at
  06:00, so until roughly 07:30 there are fewer trains on the map than in the city. Real trains also
  enter service from depots partway along a line.
- **Public holidays run as ordinary days.** The feed has no holiday calendar at all, so a holiday
  gets whatever service its weekday would have had.
- **Lines that share track are drawn apart.** The Ampang and Sri Petaling lines run on the same
  rails between Chan Sow Lin and Sentul Timur. Drawing them side by side is a map convention; there
  is one railway there, not two.
- **An interchange appears once per line.** The feed gives a station a separate stop for each line
  it serves, so KL Sentral is several stations here rather than one.
- **Stations are drawn on the track, not at their published coordinates.** The feed has no measure
  of distance along a line, so the build script projects each station onto its line's path. Some
  published coordinates sit up to about 105 m from the rails; the projected point is the one that
  matches the timetable.
- **The feed's calendar ends on 31 December 2026.** The daily refresh should pick up the renewal
  when it is published. It is worth a note in a diary to check.

## Running it

You need [Node](https://nodejs.org) 22.12 or newer. The exact version this is built and tested with
is in `.node-version`, and most hosts and version managers read that file.

```
npm install        # once
npm run dev        # http://localhost:5173
npm test           # the unit tests
npm run build      # type-check, then build into dist/
npm run check:feed # check data/network.json describes a working railway
```

### Two kinds of check, and why they are not the same thing

`npm test` asserts values measured from the timetable that is committed here: the Ampang Line is
14,892.7 m long, 196 trains are running at the weekday morning peak, one station sits 105 m from its
published coordinate. Those numbers are what make the tests worth having — they caught a mirrored
station layout and a bearing that was off by a reflection.

They are also pinned to one snapshot, so when the published timetable legitimately changes, some of
them will fail. **That is correct, and the response is to look at what moved and update them — never
to loosen them until they assert nothing.**

`npm run check:feed` is the other kind. It asserts no measured value at all, only rules that any
correct timetable satisfies: no line missing its departures, trains running at the weekday peak,
nothing running at three in the morning, no timetabled journey faster than 120 km/h. That is what
the daily refresh runs, because it has to pass on a timetable nobody has looked at yet.

It also breaks the data on purpose, six ways, and prints whether each check noticed. A check nobody
has seen fail is not a check.

## Rebuilding the data

`data/network.json` is generated. Never edit it by hand.

```
curl -L -o feed.zip 'https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl'
unzip feed.zip -d data/gtfs
pip install -r scripts/requirements.txt
python scripts/build_network_json.py data/gtfs data/network.json
npm run check:feed
```

The script turns the GTFS feed into one compact file: one path per line, every station projected
onto it, one stop-time template per direction, and the headway windows per day type.

This also happens by itself. `.github/workflows/refresh-timetable.yml` runs daily at 20:00 UTC —
04:00 in Kuala Lumpur, after the last train and before the first — and it downloads the feed,
rebuilds the file, runs the feed checks, and commits **only if the checks pass and the data actually
changed.** An unchanged feed leaves no trace.

If the checks fail it commits nothing and the run goes red. The site then keeps drawing the
timetable it already has, which is a month-old schedule honestly labelled as a schedule. Half a
network would not be honest about anything.

## Deploying

The production build is a static site. No server, no runtime environment variables, no API called
from the browser: the timetable is compiled into the bundle at build time.

| | |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist`, declared in `wrangler.toml` |
| Deploy command | `npx wrangler deploy` |
| Node version | `.node-version` (currently 22.23.2) |

These live here rather than only in a hosting dashboard, which nobody else can see, nobody can
review, and which is gone with the account. A host should be pointed at these files, not configured
instead of them.

It deploys as a Cloudflare Worker serving static assets, rather than as a Pages project. Cloudflare
has merged the two, and this is the shape that has somewhere for version 2 to go: the bus-feed proxy
needs a small server, and on this platform it becomes a `main` script in the same Worker, serving
the same assets, instead of a second thing to deploy and keep in step.

Nothing here is Cloudflare-specific beyond that file. The build output is an ordinary static
directory and any host will serve it.

A first visit costs **2.7 MB of files, about 740 KB over the wire** once the server compresses them,
before any map tiles. Almost all of it is one JavaScript bundle: MapLibre, deck.gl, React, and the
78 KB timetable compiled in. That is a second or two on a decent phone connection, and it is stated
here so it is not discovered on a bad one.

Map tiles come from [OpenFreeMap](https://openfreemap.org), which is free, keyless and best-effort.
If it slows down or goes away, the fix is one line: `STYLE_URL` in `src/map/MapView.tsx`. MapTiler
has a free tier that needs a key, and Protomaps lets you host a single tiles file yourself.

## Credits and licence

**The timetable** is Prasarana's GTFS static feed for `rapid-rail-kl`, published through Malaysia's
official open data API at [data.gov.my](https://data.gov.my), and used under the **Terms of Use for
Government Open Data Malaysia 1.0**. Those terms require attribution, disclaim all warranties as to
the data's accuracy or completeness, and **grant no rights to any logo, emblem or official symbol**.

That last clause is why this project uses no Rapid KL or Prasarana branding anywhere. It is a
condition of using the data, not merely good manners.

Only the official API is used. Positions are not scraped from the operator's own tracking pages:
that would be unofficial, could break without notice, and is not ours to build a public site on.

**The map** is [OpenFreeMap](https://openfreemap.org) serving the "liberty" style, built from
[OpenStreetMap](https://www.openstreetmap.org/copyright) data, © OpenStreetMap contributors. Both
are credited in the map's own attribution control, bottom right.

**This project is unofficial.** It is not connected to, endorsed by, or affiliated with Prasarana,
Rapid Rail, Rapid KL or any Malaysian government body.
