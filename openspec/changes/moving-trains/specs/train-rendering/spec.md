# Spec Delta

## Purpose

Shows the trains the simulation computes: where each one is on the map at this moment, which way it
is facing, which side of the track it runs on, and what a station looks like while a train is
standing at it.

## ADDED Requirements

### Requirement: Trains are shown where the timetable says they are

Every train the simulation reports as running SHALL be drawn at its computed position, and no train
SHALL be drawn that the simulation does not report. The display SHALL NOT cap, sample or thin the
set of trains: if the timetable implies two hundred trains, two hundred are drawn.

#### Scenario: A weekday morning peak

- **WHEN** the simulated time is 08:00 on a weekday
- **THEN** every train the timetable implies is on screen, positioned as the simulation computes it

#### Scenario: A time with no service

- **WHEN** the simulated time is one at which nothing runs
- **THEN** no trains are drawn, and the map is otherwise unchanged

### Requirement: Trains move continuously as time passes

The display SHALL update often enough that a train reads as moving rather than stepping, and SHALL
keep doing so without the application's user-interface framework re-rendering on each update.

#### Scenario: Watching a train between stations

- **WHEN** a train is running between two stations
- **THEN** it advances smoothly along the track rather than jumping between positions

#### Scenario: A long-running session

- **WHEN** the display has been running for a long time
- **THEN** it is still smooth, because the update path does not accumulate work per frame

#### Scenario: The tab is left in the background

- **WHEN** the page is hidden for a long period and then shown again
- **THEN** simulated time does not lurch forward by the whole elapsed period in a single update,
  which would teleport every train

### Requirement: Trains keep to the left of their direction of travel

Each train SHALL be drawn offset to the left of the direction it is travelling, far enough that
trains running in opposite directions on the same stretch of track do not overlap.

Trains keep left in Malaysia. Offsetting to the right would be a plausible-looking picture of the
wrong country.

#### Scenario: A northbound train

- **WHEN** a train is travelling due north
- **THEN** it is drawn to the west of the track's centre line

#### Scenario: An eastbound train

- **WHEN** a train is travelling due east
- **THEN** it is drawn to the north of the track's centre line

#### Scenario: Both directions on one stretch

- **WHEN** trains are running in both directions along the same piece of track
- **THEN** they are drawn on opposite sides of it and do not overlap

### Requirement: Trains stay visible at every zoom

A train SHALL be drawn at its real size when the camera is close enough for that to be visible, and
SHALL never shrink below a size at which it can still be seen and its direction made out when the
whole network is in view.

#### Scenario: Zoomed in to a station

- **WHEN** the camera is close to the track
- **THEN** the train is drawn at a plausible real-world size against the buildings around it

#### Scenario: Zoomed out to the whole network

- **WHEN** the whole Klang Valley is in view
- **THEN** trains are still visible, rather than having shrunk to nothing

### Requirement: A train shows which line it belongs to

Each train SHALL carry its line's colour, so that a train can be attributed to a line without
tracing the track it is on.

#### Scenario: Trains of different lines nearby

- **WHEN** trains from two lines are near each other
- **THEN** each carries its own line's colour and the two can be told apart

### Requirement: A train faces the way it is going

Each train SHALL be oriented along its direction of travel, using the bearing the simulation
reports.

#### Scenario: A train on a curve

- **WHEN** a train runs through a curve
- **THEN** its orientation follows the track around the curve

#### Scenario: The two directions of one line

- **WHEN** two trains on the same line travel in opposite directions
- **THEN** they face opposite ways

### Requirement: A station shows when a train is standing at it

While a train is stopped at a platform, that station's marker SHALL be filled with its line's
colour, and SHALL return to its unfilled state once the train departs.

A train that is merely approaching a station SHALL NOT fill it. The simulation reports the stop a
moving train is heading for as well as the one a stopped train is at, and treating those alike would
light up the whole network.

#### Scenario: A train pulls in and leaves

- **WHEN** a train arrives at a platform, waits, and departs
- **THEN** the station's marker fills while it waits and empties when it goes

#### Scenario: A train approaching a station

- **WHEN** a train is running towards its next stop but has not arrived
- **THEN** that station's marker is not filled

#### Scenario: A station served by two lines

- **WHEN** a train stands at one line's platform of an interchange
- **THEN** that line's marker fills, and the other line's marker at the same place does not

### Requirement: Trains are part of the scene, not painted over it

Trains SHALL be drawn within the map's three-dimensional scene at a height representing the elevated
track most of this network runs on, so that they compose with the city rather than floating over it
as a flat overlay.

#### Scenario: A tilted view in the city centre

- **WHEN** the map is tilted at a zoom where buildings are drawn
- **THEN** trains are composed into the same scene as the buildings, and depth between them is
  respected

### Requirement: The display is honest about what it does not know

The feed carries no information about which sections of line are elevated, at grade, or in tunnel.
Where the display assumes a height, the application SHALL say so in its explanation of its data,
rather than presenting the assumption as fact.

#### Scenario: A line that is actually underground

- **WHEN** a train runs along a section that is in reality in a tunnel
- **THEN** it is drawn at the same assumed height as the rest, and the explanation of the data
  states that track height is not in the feed and has been assumed

### Requirement: Trains are visible in every view of the map

Trains SHALL be drawn in each of the map's views, so that choosing how to see the city does not
change whether the service can be seen.

#### Scenario: Switching views while trains are running

- **WHEN** the viewer switches between the views of the map
- **THEN** trains continue to be drawn, in the same positions, in both
