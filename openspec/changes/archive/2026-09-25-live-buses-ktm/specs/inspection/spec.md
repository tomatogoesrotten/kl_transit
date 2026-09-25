# Spec Delta

## MODIFIED Requirements

### Requirement: Pointing at something says what it is

Moving the pointer over a train, a station or a live bus or KTM vehicle SHALL identify it briefly,
without the viewer having to click. The pointer SHALL indicate that the thing under it can be
selected.

Only trains, stations and live vehicles SHALL answer. The drawn track is not a thing to inspect, and
if it answered it would do so everywhere near a line, leaving nothing else reachable.

#### Scenario: Over a train

- **WHEN** the pointer rests on a train
- **THEN** its line and where it is going are shown, and the pointer indicates it can be selected

#### Scenario: Over a station

- **WHEN** the pointer rests on a station
- **THEN** the station's name is shown

#### Scenario: Over a live vehicle

- **WHEN** the pointer rests on a bus or KTM vehicle
- **THEN** its mode, its route or label as the feed gives it, and the age of its report are shown

#### Scenario: Over empty map or over the track

- **WHEN** the pointer is over empty map, or over a line between stations
- **THEN** nothing is identified, and the pointer indicates the map can be dragged

#### Scenario: A train standing at a platform

- **WHEN** the pointer is over a train stopped at a station, so the two overlap
- **THEN** the train answers, not the station beneath it
