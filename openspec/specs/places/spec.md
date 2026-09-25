# places Specification

## Purpose
Knows which of the feed's per-line stops are one physical station, so that features reasoning about
the network as a network (labels, journey planning) can treat an interchange as one place with a
known distance between its platforms, without changing how anything is drawn.

## Requirements

### Requirement: Stops are grouped into places by exact name

Every stop in the network SHALL belong to exactly one place. Two stops SHALL share a place if and
only if their station names are exactly equal. The grouping SHALL be derived from the network alone:
no station name, stop id or line id SHALL be written into it.

#### Scenario: The shipped feed

- **WHEN** places are derived from the shipped network
- **THEN** there are 160 places covering all 187 stops, and 22 of them hold more than one stop

#### Scenario: An interchange of four lines

- **WHEN** the place named Titiwangsa is looked up
- **THEN** it holds exactly the stops `AG3`, `SP3`, `PY17` and `MR11`

#### Scenario: A renamed stop in a future feed

- **WHEN** one stop of the shipped Titiwangsa group is given a name no other stop has
- **THEN** that stop becomes a place of its own and there are 161 places, with no code change

### Requirement: Differently-named stops are never merged

Stops with different names SHALL NOT share a place, however close together they are. Proximity SHALL
NOT be used to group stops, because in this feed same-named stops can lie further apart than
differently-named ones.

#### Scenario: The closest differently-named pair

- **WHEN** places are derived from the shipped network
- **THEN** Plaza Rakyat (`AG8`) and Merdeka (`KG17`), 230 m apart, are in different places

#### Scenario: No place mixes names

- **WHEN** any place is inspected
- **THEN** every one of its stops carries the place's name

### Requirement: A place knows its stops and the lines that serve it

Each place SHALL carry an id, its name, its stop ids and the ids of the lines that serve it. The id
SHALL be derived from the name alone, so that it is the same on every derivation and every rebuild
of a feed in which that name is unchanged, and SHALL be unique among places by construction. The lines serving a
place SHALL be those whose timetabled trips call at one of its stops, not the line the feed's stop
record claims. The order of places, of stops and of lines SHALL be deterministic.

#### Scenario: Lines come from the timetable

- **WHEN** the place named Masjid Jamek is looked up
- **THEN** its lines are the Ampang, Kelana Jaya and Sri Petaling lines, because trips of those three
  lines call at its stops

#### Scenario: Derived twice

- **WHEN** places are derived twice from the same network
- **THEN** both results are identical, including ids and every ordering

### Requirement: A place has a representative position on the track

Each place SHALL have one position, the average of its stops' points on the track their lines run
along, in the network's own flat projection. It SHALL NOT be derived from the published stop
coordinates, which can sit over 100 m from the track.

This is the position of the true alignment. Where two lines share track the map draws each line
offset beside it by a camera-dependent amount; a place's position does not include that offset.

#### Scenario: A single-line place

- **WHEN** a place has one stop
- **THEN** its position is that stop's point on the track

#### Scenario: Two stops on one shared platform

- **THEN** its position is that point, to within 0.1 m — the precision of `at` in `network.json`, which rounds each stop's distance along its own line path
- **THEN** its position is that point

### Requirement: Transfer distances between a place's stops are derived, not guessed

Each place SHALL list the straight-line distance, in metres, between every pair of its stops. The
distance SHALL be computed from the feed's published stop coordinates in the network's own flat
projection, the one its line lengths are measured in, and SHALL NOT use a geodesic formula. A place
with one stop SHALL list no distances. Distances SHALL NOT be turned into times here.

#### Scenario: One platform serving two services

- **WHEN** the place named Sentul Timur is looked up
- **THEN** the distance between `AG1` and `SP1` is 0 m

#### Scenario: A walking interchange

- **WHEN** the place named Ampang Park is looked up
- **THEN** the distance between `KJ9` and `PY20` is about 294 m

#### Scenario: Every pair, once

- **WHEN** a place holds n stops
- **THEN** it lists n × (n − 1) / 2 distances, one per unordered pair

### Requirement: Deriving places is pure and leaves the network unchanged

Deriving places SHALL be a pure function of the network: it SHALL NOT read the clock, the DOM or any
state held between calls, and SHALL NOT modify the network it is given.

#### Scenario: The network afterwards

- **WHEN** places are derived from a network
- **THEN** the network is identical to what it was before

### Requirement: The feed checks guard the grouping on any feed

The refresh checks SHALL reject a feed in which two stops sharing a name lie more than 500 m apart,
naming the stops and the distance, so that a name reused across town is caught rather than silently
merged into one place. They SHALL also reject a feed in which two differently-named stops lie within
100 m of each other, naming both, so that one station spelled two ways is caught rather than silently
left as two places. Both SHALL be measured between published coordinates in the network's own flat
projection, and neither SHALL name a station or a value measured from the current feed. Each SHALL be
proven, on every run, to fire on data broken to trigger it.

#### Scenario: A name reused far away

- **WHEN** a checked feed moves one of two same-named stops several kilometres from the other
- **THEN** the check fails and names that pair and their distance

#### Scenario: One station under two names

- **WHEN** a checked feed renames one stop of a 0 m pair, so the two stops have different names
- **THEN** the check fails and names both stops

#### Scenario: The shipped feed

- **WHEN** the shipped feed is checked
- **THEN** both checks pass, and the output reports the widest same-name spread and the closest
  differently-named pair with their headroom
