# 0001. MapLibre v6, and importing network.json directly

Status: Accepted
Date: 2026-09-19

## Context

Milestone 1 scaffolded the Vite + React + TypeScript app and put a tilted 3D map of Kuala Lumpur on
the screen. Two choices had to be made before any of that could be written, and a third turned out
not to need a choice at all.

The map library came first. GUIDE.md says MapLibre GL JS without naming a version, and most
tutorials and examples online are still written against v5. But `npm audit` on a v5 install reports
a critical advisory, GHSA-jrc7-96c5-q579, "XSS Sanitizer Bypass in DOM.sanitize()", affecting
`maplibre-gl` up to and including 6.4.0. The fix is in a later 6.x release, and there is no patched
v5. This is a public site that will render names and attribution text from a third-party feed, so an
XSS hole in the map's own DOM handling is not something to carry.

Second, the app needs `data/network.json`, an 80 KB file the Python script generates. Vite offers
three ways to get it into the browser: `fetch()` it at runtime from `public/`, copy it into
`public/` and import the URL, or import the file directly as a module and let the bundler inline it.
TypeScript's `resolveJsonModule` makes the third option type-checked for free, which matters because
`src/network.test.ts` and later `src/sim` both need to know the file's shape.

Third, the 3D buildings. The plan assumed we'd write a `fill-extrusion` layer by hand.

## Decision

Use `maplibre-gl` v6 (currently `^6.10.0`), not v5.

Import `data/network.json` directly in `src/App.tsx` with `resolveJsonModule` turned on in
`tsconfig.json`. No fetch, no copy in `public/`.

Write no custom 3D building layer. The OpenFreeMap "liberty" style already ships a `building-3d`
fill-extrusion layer at minzoom 14, so `src/map/MapView.tsx` only sets pitch and bearing and lets the
style do the rest. A comment in that file says so, in case someone later wonders where the buildings
came from.

## Consequences

MapLibre v6 has breaking changes from v5, so examples found online may not apply, and the installed
version's documentation has to be checked rather than remembered. More concretely: Milestone 3 adds
deck.gl on top of MapLibre through `MapboxOverlay` in interleaved mode, and deck.gl's MapLibre
support has historically tracked v4 and v5. Before writing that code, check that the installed
deck.gl release supports maplibre-gl v6. If it doesn't, the choice is between waiting for a deck.gl
release, pinning an older MapLibre and accepting the advisory, or drawing without interleaving.
Deciding that is a new record, not an edit to this one.

Importing the JSON directly means there's no loading state to design, no error path for a failed
fetch, and no second copy of the data in `public/` that can drift out of date. The type checker reads
the real file, so a malformed `network.json` fails `npm run build` instead of failing in a user's
browser.

The cost is that the 80 KB is inlined into the JavaScript bundle, and refreshing the data means
rebuilding the site rather than replacing a file. That's acceptable here: the site is statically
hosted, and the daily GitHub Actions refresh in Milestone 7 commits the new `network.json` and
triggers a redeploy anyway. If the file grows much past a few hundred kilobytes, or if the data ever
needs to update without a deploy, revisit this.

Not writing a building layer means the buildings are whatever OpenFreeMap decides to ship. If the
liberty style drops or renames `building-3d`, the buildings vanish with no error in the console. The
plan B for tiles in GUIDE.md is a single style URL swap, and that swap would also mean checking for
an equivalent extrusion layer.
