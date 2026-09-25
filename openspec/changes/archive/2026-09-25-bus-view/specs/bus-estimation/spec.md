# Spec Delta

## Purpose

Moves a live bus along its own route between GPS reports, so that it does not stand still for a minute
and then jump, while keeping every estimate honest: anchored to a real report, bounded in time, never
shown going backwards, and never invented where the route is unknown.

## ADDED Requirements

### Requirement: An estimate follows the bus's own route, from its own reports

In either view, once the route shapes have loaded, a live bus SHALL be drawn at an estimate: its most recent report's place along the
route shape of the trip it reports, advanced along that shape at a speed measured from its own recent
reports, for the time elapsed since that report. The route shape SHALL be the one the published
timetable gives for the reported trip. The speed SHALL be the distance along the shape between the
bus's last two distinct reports on the same trip, divided by the time between them, multiplied by a
stated factor below one. The factor is chosen to make pauses rare at the cost of lag: a bus drawn
ahead of the truth must wait for a new report to catch it up, and buses stop at lights and at stops.
It SHALL be a single named value, tunable by eye, and is 0.7 at the outset. The feed's own speed field SHALL NOT be used.

An estimate SHALL never be drawn off the shape, SHALL never move backwards along it, and SHALL never
run past the shape's end.

#### Scenario: A bus between two reports

- **WHEN** a bus reported 20 s ago, and its last two reports on this trip were 300 m apart along its
  route and 60 s apart in time
- **THEN** it is drawn on its route, 70 m ahead of its last report at the outset factor of 0.7, and
  still moving forward

#### Scenario: A bus nearing the end of its route

- **WHEN** a bus's estimate would pass the last point of its route shape
- **THEN** it is drawn at the end of the shape and moves no further

#### Scenario: The feed's speed field says something different

- **WHEN** the feed reports a speed for a bus
- **THEN** the estimate ignores it and uses only the distance and time between the bus's reports

### Requirement: A bus with nothing to estimate from stays at its report

A bus SHALL be drawn at its last report, not moving, when any of the conditions below holds. "At its
last report" means the reported place on the route shape where the report can be placed on it (within
50 m, and on one pass of the street only), and otherwise the reported coordinates exactly.

The conditions:

- its reported trip is not in the published timetable, or its route shape is not loaded;
- its report lies more than 50 m from its route shape;
- it has only one report on its current trip, so no speed can be measured;
- its place on a shape that passes the same street twice cannot be decided, because its bearing
  matches neither or both passes and no earlier report on the trip settles it;
- the measured speed is more than 90 km/h, which no bus in the samples approached and which means the
  reports were matched to the wrong part of the shape.

#### Scenario: A trip the timetable does not have

- **WHEN** a bus reports trip `weekday_T7890_T789002_2`, which is not in the published trips
- **THEN** it is drawn at its reported position, not moving, and no shape is guessed from its route
  or from the trip id's spelling

#### Scenario: A bus off its route

- **WHEN** a bus reports a position 1.9 km from its route shape
- **THEN** it is drawn at that reported position, not moving

#### Scenario: A bus's first report

- **WHEN** a bus has reported once on its current trip
- **THEN** it is drawn at its reported place on the route, not moving, until a second report gives a
  speed

#### Scenario: A round-trip route

- **WHEN** a bus reports from a street its route runs along in both directions, heading the way the
  outbound leg runs
- **THEN** its place is taken on the outbound leg, not the return

#### Scenario: A round-trip route and a bearing that settles nothing

- **WHEN** a bus's first report on a trip lies on a street its route runs along both ways, and its
  bearing is within 60 degrees of both passes or of neither
- **THEN** it is drawn at its reported coordinates, not moving, until a later report settles its place

### Requirement: An estimate stops after a stated time

An estimate SHALL advance for at most 150 s after the report it starts from. After that the bus SHALL
stand still where the estimate stopped until a new report arrives, and SHALL age and turn stale and
disappear by the same rules as every live vehicle.

#### Scenario: A bus that stops reporting

- **WHEN** a bus's last report was 200 s ago and no newer one has arrived
- **THEN** it stands where its estimate was 150 s after that report, and moves no further

#### Scenario: The same bus five minutes on

- **WHEN** that bus's last report passes 4 minutes old
- **THEN** it is drawn as stale, still standing, and past 10 minutes it is no longer drawn

### Requirement: A new report corrects the estimate without driving backwards

When a newer report arrives for a bus already moving on an estimate, the estimate SHALL restart from
the new report. What is drawn SHALL then move from where it was to the new estimate:

- **new estimate ahead**: the bus SHALL catch up by moving forward faster for a few seconds, not by
  jumping;
- **new estimate behind by at most 250 m**: the bus SHALL stand still until the new estimate reaches
  it, then continue from there; if the new estimate stops, by its time limit, before reaching it, the
  bus SHALL be moved back to the new estimate in one step;
- **new estimate behind by more than 250 m**, or a report that starts a different trip: the bus SHALL
  be moved to the new estimate in one step.

A bus SHALL never be drawn gliding backwards along its route.

#### Scenario: The bus had stopped at a light

- **WHEN** a new report places a bus 130 m behind where it is drawn
- **THEN** it stands still until its new estimate catches up with it, then moves on

#### Scenario: The bus was faster than estimated

- **WHEN** a new report places a bus 200 m ahead of where it is drawn
- **THEN** it moves forward to the new estimate over a few seconds

#### Scenario: A large correction backwards

- **WHEN** a new report places a bus 600 m behind where it is drawn
- **THEN** it is moved there in one step, and does not glide back along the road

#### Scenario: A new trip

- **WHEN** a bus's report names a different trip from its previous one
- **THEN** it is moved to its new reported place in one step, and stands there until a second report
  on the new trip gives a speed

### Requirement: The route an estimate follows can be seen

When a bus is selected and its estimate follows a route shape, that shape SHALL be
drawn, so that the viewer can see which path the estimate assumes.

#### Scenario: Selecting a moving bus

- **WHEN** the viewer selects a bus that is moving on an estimate
- **THEN** its route shape is drawn on the map until it is deselected

#### Scenario: Selecting a bus with no usable shape

- **WHEN** the viewer selects a bus drawn at its report because it has no usable shape
- **THEN** no route is drawn, and the card says the bus is shown at its last report because its route
  is unknown or it is off it

### Requirement: Estimates are computed from supplied time alone

Every decision about where an estimated bus is drawn SHALL be a function of the reports, the route
shapes, the previously drawn state and a supplied present moment. It SHALL NOT read a clock, the page,
or any state held between calls, so that each rule above can be tested with fixed inputs.

#### Scenario: The same inputs twice

- **WHEN** the estimate for a bus is computed twice from the same reports, shapes, previous state and
  moment
- **THEN** both results are identical
