# Tasks

## 1. Feed checks that describe any valid feed

- [x] 1.1 Write a feed-check script that takes a built `network.json` and reports what is wrong with
      it, exiting non-zero on any failure. It MUST NOT assert distances, counts or durations
      measured from the current snapshot — only rules any correct timetable satisfies.
- [x] 1.2 Implement the structural checks: lines and stations not fewer than the data being
      replaced; every line has departures in both directions; every direction has all three day
      types.
- [x] 1.3 Implement the service checks: trains running at the weekday morning peak, and nothing
      running at three in the morning.
- [x] 1.4 **Implement #7's speed check against the timetable**, as
      `(stop[i+1].at - stop[i].at) / (stop[i+1].arr - stop[i].dep)` per consecutive pair. Do **not**
      sample the drawn position: the animation eases between stops and peaks at 1.5× the average, so
      the fastest legitimate segment (89.9 km/h) renders as ~135 km/h and a naive check would reject
      a valid feed. Verify it passes on the shipped data with headroom, and reports the fastest
      segment it found so the margin is visible.
- [x] 1.5 Verify each check actually fails when it should: run it against deliberately broken copies
      — a line removed, a line's departures emptied, a segment's time shortened — and confirm each is
      caught. A check nobody has seen fail is not a check.
- [x] 1.6 Add an npm script for it, distinct from `npm test`, and say in `package.json` or a comment
      what each is for: the test suite describes the snapshot, the feed check describes any feed.

## 2. The daily refresh

- [x] 2.1 Add a GitHub Actions workflow running daily at 20:00 UTC — 04:00 in Kuala Lumpur, before
      service starts — and manually triggerable.
- [x] 2.2 Download the GTFS zip from the official API and rebuild `network.json` with the existing
      script. A fetch failure must fail the run visibly and commit nothing.
- [x] 2.3 Run the feed checks against the rebuilt data, comparing counts against the committed file.
      On failure: commit nothing, leave the existing data in place, and make the failure visible.
- [x] 2.4 Commit only when the data actually changed. An unchanged feed must leave no trace — no
      empty commit, no churn.
- [x] 2.5 Give the workflow the minimum permissions that let it commit, and pin the actions it uses.
      It is an unattended job with write access to the default branch.

## 3. Deploy

- [x] 3.1 Pin the Node version in the repository so the build is reproducible, and record the build
      command and output directory there too — not only in a hosting dashboard, which nobody else
      can see or review.
- [x] 3.2 Confirm the production build is genuinely static and self-contained: no server, no runtime
      environment variables, no absolute paths that assume a domain.
- [x] 3.3 Record the production bundle size, so what a first visit costs is stated rather than
      discovered on a phone connection.

## 4. Saying what this is

- [x] 4.1 Expand the caption's collapsible panel into the "about this data" explanation: positions
      computed from a published timetable and not observed; track height assumed because the feed has
      none; early mornings thinner than reality because every trip starts at a terminal; public
      holidays treated as ordinary days; lines sharing track drawn apart by convention; interchanges
      appearing once per line. Each of these is something a viewer could otherwise reasonably read as
      a defect.
- [x] 4.2 Write the README: what this is, the scheduled-not-live explanation, the known limits, how
      to run it, and how to rebuild the data.
- [x] 4.3 Credit the data under the **Terms of Use for Government Open Data Malaysia 1.0**, which
      requires attribution and grants no rights to logos, emblems or official symbols — so the
      project's no-operator-branding rule is a licence condition, not just good manners. Credit
      OpenStreetMap and OpenFreeMap, and state plainly that the project is unofficial.
- [x] 4.4 Note in the README that the tiles come from a best-effort free service, and that the
      fallback is a single style URL change.

## 5. Close out

- [x] 5.1 Run `npm test`, `npm run build` and the feed check; all must pass, with the existing 223
      tests green and `npm audit` at 0.
- [x] 5.2 Trigger the refresh workflow manually and confirm it does the right thing on a feed that
      has not changed: checks pass, nothing committed.
- [x] 5.3 **Deploy, and look at the deployed URL** — not at localhost. Per `CLAUDE.md`, a visual
      criterion is not met until a human has seen it, and a thing that works locally and not when
      deployed is the classic case.
- [x] 5.4 Update `CLAUDE.md`'s Status and Commands, and open a pull request referencing issue #27
      with `Closes #27` and `Closes #7`.
