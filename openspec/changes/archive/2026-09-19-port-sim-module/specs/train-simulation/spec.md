# Spec Delta

## Purpose

Turns a published GTFS timetable into the position, heading and status of every train running at a
given moment in Kuala Lumpur time, so the map can draw a scheduled network without any live vehicle
feed.

## ADDED Requirements

### Requirement: Positions are derived from the timetable alone

The simulation SHALL compute train positions solely from the published timetable, and SHALL NOT
invent, smooth over, or interpolate around missing or malformed data. Where the feed says nothing
runs, the simulation SHALL report that nothing runs.

#### Scenario: A time of day with no scheduled service

- **WHEN** the simulation is asked for the trains running at 03:00 on a weekday
- **THEN** it returns an empty list, rather than the nearest service or a fallback

#### Scenario: A train whose scheduled trip has finished

- **WHEN** a train's elapsed time since departure exceeds the full duration of its trip
- **THEN** that train is excluded from the running trains, rather than held at its final stop

### Requirement: Time is always supplied by the caller

No part of the simulation SHALL read the system clock, the browser's time zone, the DOM, or any
mutable state held outside the call. Every function SHALL be a pure function of its arguments, so
that any moment in time can be simulated and any result reproduced exactly.

#### Scenario: The same inputs twice

- **WHEN** the simulation is called twice with identical arguments, at different real-world moments,
  in any order, and interleaved with other calls
- **THEN** both calls return identical results

#### Scenario: A viewer outside Malaysia

- **WHEN** the simulation runs on a machine whose local time zone is not UTC+8
- **THEN** results are identical to those on a machine in Kuala Lumpur, because Kuala Lumpur time is
  computed explicitly from a supplied UTC timestamp rather than read from the host

### Requirement: Preparing a network does not modify it

Deriving the values the simulation needs from a network SHALL produce a new prepared network and
SHALL leave the supplied network unchanged, so that a network shared between callers cannot be
altered by one of them.

#### Scenario: Preparing the same network twice

- **WHEN** a network is prepared, and then the original network is prepared again
- **THEN** the second preparation yields the same result as the first, and the original network is
  indistinguishable from its state before either call

### Requirement: Running trains are reported for a moment in Kuala Lumpur time

Given a prepared network, a number of seconds after Kuala Lumpur midnight, and the day types in
force today and yesterday, the simulation SHALL report every train currently running. Each SHALL
carry its line, its direction, the second within its own service day at which it departed its origin
terminal, its distance in metres along the line, whether it is stopped at a platform, which stop it
is at or heading for, the seconds until its next event, and an identifier stable for that train.

The moment SHALL accept fractional seconds.

#### Scenario: Weekday morning peak

- **WHEN** the trains running at 08:00 on a weekday are requested
- **THEN** every line reports the number of trains its timetable implies, and each train's reported
  position matches the timetable to within the tolerance recorded in the golden file

#### Scenario: A fractional moment

- **WHEN** the moment requested is 64770.5 seconds after midnight
- **THEN** the result is computed at that exact moment, and the fraction is not discarded

### Requirement: Trains running past midnight belong to the previous service day

A trip that departs before midnight and is still running afterwards SHALL be reported using the
previous day's timetable and day type, and SHALL report the departure second within that previous
service day rather than a negative or wrapped value.

#### Scenario: Early on a Sunday morning

- **WHEN** the trains running at 00:40 on a Sunday are requested, with Saturday as the previous day
- **THEN** the trains reported are those still finishing their Saturday trips, each reporting the
  second of the Saturday service day at which it departed

#### Scenario: Yesterday's service has ended

- **WHEN** the moment requested is late enough that no trip from the previous service day is still
  running
- **THEN** no train is attributed to the previous day

### Requirement: A position on a line is reported in longitude, latitude and compass bearing

Given a line and a distance in metres along it, the simulation SHALL report the corresponding
position as a longitude and a latitude, and the direction of travel as a compass bearing in degrees
where 0 is north, 90 is east, and values increase clockwise, constrained to the range 0 inclusive to
360 exclusive.

The bearing SHALL reflect the direction the train is actually travelling, so that the two directions
of the same line report bearings that differ by 180 degrees at the same point.

Distances SHALL remain in metres throughout, measured in the network's own planar projection, so
that a distance reported by the simulation is the same quantity the timetable was built against.

#### Scenario: A point on a northbound stretch of track

- **WHEN** a position is requested on a stretch of track running due north
- **THEN** the reported bearing is 0 degrees, not 180

#### Scenario: The same point in the opposite direction

- **WHEN** the same distance along the same line is requested for the reverse direction
- **THEN** the reported longitude and latitude describe the same stretch of track, and the bearing
  differs by 180 degrees

#### Scenario: A distance beyond the end of the line

- **WHEN** a distance less than zero or greater than the line's length is requested
- **THEN** the position is clamped to the line's ends rather than extrapolated past them

### Requirement: Trains stopped at a platform are distinguishable from trains in motion

A train between its scheduled arrival and departure at a stop SHALL be reported as stopped, at that
platform's exact position, with the seconds remaining until it departs. A train between two stops
SHALL be reported as in motion, with the seconds remaining until it arrives at the next one.

#### Scenario: A train dwelling at a platform

- **WHEN** a train's elapsed time is at or after its arrival at a stop but before its departure
- **THEN** it is reported as stopped, positioned exactly at that platform rather than near it

#### Scenario: A train that has just begun its trip

- **WHEN** a train's elapsed time is within the dwell at its origin terminal
- **THEN** it is reported as stopped at that terminal

### Requirement: Departures from a platform can be listed

Given a direction of a line, one of its stops, a moment, and the day types in force, the simulation
SHALL report up to a requested number of upcoming departures from that stop, as seconds from the
given moment, in ascending order, none of them negative.

#### Scenario: Departures at a busy stop

- **WHEN** the next three departures are requested at a stop during the morning peak
- **THEN** three values are returned, ascending, each the seconds until a scheduled departure

#### Scenario: No further departures today

- **WHEN** the next departures are requested after the last scheduled departure of the service day
- **THEN** fewer values than requested are returned, rather than negative or fabricated ones

### Requirement: The first departure of a service day can be found

The simulation SHALL report the earliest scheduled departure across the whole network for a given
day type, and SHALL signal unambiguously when a day type has no service at all, so that callers do
not format an absent value as a time.

#### Scenario: A day type with service

- **WHEN** the earliest departure for a weekday is requested
- **THEN** the second of the day at which the first train anywhere on the network departs is
  returned

#### Scenario: A day type with no service

- **WHEN** the earliest departure is requested for a day type no line runs on
- **THEN** the absence is reported as such, and not as a number a caller would format as a clock
  time

### Requirement: Results reproduce the recorded golden output exactly

For the network snapshot shipped with the project, the simulation SHALL reproduce every case
recorded in the golden file: the total number of trains running, the count per line, the count
stopped at platforms, and for the cases that enumerate trains, each train's distance along the line
to 0.1 metres, its longitude and latitude to six decimal places, and its bearing to 0.1 degrees,
compared in the order the simulation reports them.

#### Scenario: Every recorded case

- **WHEN** the simulation is run for each moment recorded in the golden file
- **THEN** every recorded value matches

#### Scenario: The feed is refreshed

- **WHEN** the timetable is later refreshed and the recorded numbers no longer match
- **THEN** this is understood as the timetable having changed, not as a defect in the simulation,
  and the golden comparison is run against the saved snapshot rather than the refreshed feed
