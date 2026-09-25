# Tasks

## 1. Group stops into places

- [x] 1.1 Add the `Place` type to `src/sim/types.ts` and a `places(net: PreparedNetwork)` function in
      `src/sim/places.ts` that groups every stop by exact `name`, with the name as the id, and no
      station, stop or line id written into the code. Export it from `src/sim/index.ts`. Verify with
      tests in `src/sim/places.test.ts`: 160 places cover all 187 stops with each stop in exactly one;
      22 places hold more than one stop; Titiwangsa holds exactly `AG3`, `SP3`, `PY17`, `MR11`; and
      the existing purity test now lists `./places.ts` and passes.
- [x] 1.2 Verify that differently-named stops are never merged: a test that Plaza Rakyat (`AG8`) and
      Merdeka (`KG17`), the closest differently-named pair at 230 m, are in different places, and
      that every stop in every place carries that place's name.
- [x] 1.3 Verify the grouping follows the data rather than a list: a test that renames one Titiwangsa
      stop on a deep copy of the network and gets 161 places, with that stop alone in its own.

## 2. What a place knows

- [x] 2.1 Record each place's lines from the timetable (the lines whose direction stop lists contain
      one of its stops), and order places by name and stops and lines by network line order then
      direction-0 stop order. Verify with tests that Masjid Jamek's lines are `AG`, `KJ` and `PH`,
      and that deriving twice gives deep-equal results.
- [x] 2.2 Give each place a position: the mean of its stops' `pointAt(line, stop.at, reversed)`
      points, using direction 0. Verify with tests that a one-stop place sits exactly on its stop's
      `pointAt`, and that Sentul Timur's position is the shared point of `AG1` and `SP1` to within 0.1 m (the rounding of `at`).
- [x] 2.3 List transfer distances for every unordered pair of a place's stops, from published
      coordinates in the flat projection (`origin.kx`, `ky`), never haversine. Verify with tests:
      Sentul Timur `AG1`–`SP1` is 0 m; Ampang Park `KJ9`–`PY20` is 293.6 m to 0.1 m; Titiwangsa lists
      6 distances; one-stop places list none.
- [x] 2.4 Verify `places` leaves its input alone: a test that the prepared network deep-equals a
      `structuredClone` taken before the call.

## 3. Feed checks

- [x] 3.1 Add a `name-spread:` check to `scripts/check_feed.py`: fail when two stops sharing a name
      are more than 500 m apart, naming both stops and the distance, and add a note reporting the
      widest spread and its headroom. Verify `npm run check:feed` passes and prints Ampang Park at
      about 293.6 m with about 206 m headroom.
- [x] 3.2 Add a `name-split:` check: fail when two differently-named stops are less than 100 m apart,
      naming both, with a note reporting the closest pair and its headroom. Verify `npm run check:feed`
      prints Plaza Rakyat and Merdeka at about 230.1 m with about 130 m headroom.
- [x] 3.3 Prove both can fail: add two `CASES`, chosen from the data and not by name — move one stop
      of any multi-stop group about 5 km away, and rename one stop of the closest same-name pair.
      Verify the self-test prints `caught` for both, eight cases in all, and that temporarily
      disabling either check makes its case print `MISSED`.

## 4. Close out

- [x] 4.1 Run `npm test` and `npm run build`; both pass, with every existing test still green.
- [x] 4.2 Run `npm run check:feed`; it passes, with all eight self-test cases caught.
- [x] 4.3 Browser check: there is nothing visual to see. This change draws nothing and nothing in the
      app reads places yet. Say so in the pull request rather than inventing a visual check; confirm
      only that the app still loads and draws as before.
- [x] 4.4 Update `CLAUDE.md`: the Status section (places exist in `src/sim`, grouped by exact name,
      transfer distances from published coordinates, position on the true alignment without the
      shared-track offset, time left to #26), and "breaks the data six ways" becomes eight. Commit on
      `feat/interchange-places` and open a pull request with `Closes #23`.
