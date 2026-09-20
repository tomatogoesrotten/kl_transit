# Spec Delta

## MODIFIED Requirements

### Requirement: Every line in the network is drawn in its own colour

Every line the data describes SHALL be drawn as a continuous path following its recorded geometry,
filled with the colour that line's operator uses. No line SHALL be omitted, and no colour SHALL be
substituted for one not in the data.

Where two or more lines are recorded as running along the same alignment, each SHALL be drawn beside
that alignment rather than on it, so that every line on a shared stretch remains separately visible
and separately identifiable by its colour. This is a drawing convention: such lines share the same
physical track, and the display SHALL NOT be read as asserting that they run on separate ones.

#### Scenario: The whole network is visible

- **WHEN** the map is opened at a zoom showing the Klang Valley
- **THEN** all eight lines are visible, each in its own colour, forming the shape of the network

#### Scenario: A line is added to the feed

- **WHEN** a refreshed timetable contains a line the app has never seen
- **THEN** that line is drawn like any other, without code changes, because lines are read from the
  data rather than listed in the app

#### Scenario: Two lines sharing an alignment

- **WHEN** two lines run along the same recorded geometry
- **THEN** each is drawn to one side of it, and both colours can be told apart along the whole
  shared stretch

#### Scenario: A different pair of lines is interlined by a later feed

- **WHEN** a refreshed timetable makes two other lines share an alignment
- **THEN** they are separated in the same way, without code changes, because shared alignments are
  found in the data rather than listed in the app

### Requirement: Stations are drawn on the track, not at their published coordinates

Every station SHALL be drawn at the point where it has been projected onto its line's path, using
its recorded distance along that line, and SHALL NOT be drawn at the raw coordinate the feed gives
for it.

The feed's station coordinates sit up to about 105 metres from the track. Drawing them raw would
show stations floating beside their own line.

Where a line is drawn beside a shared alignment rather than on it, its stations SHALL be drawn
beside it too, by the same amount. Whatever is drawn as a line and whatever is drawn as standing on
that line SHALL NOT come apart.

#### Scenario: A station whose published coordinate is off the track

- **WHEN** a station's published coordinate lies some distance from its line's path
- **THEN** the station is drawn where it meets the track, touching the line, not beside it

#### Scenario: Every station on every line

- **WHEN** the network is drawn
- **THEN** every station of every line is visible, in the colour of the line it belongs to

#### Scenario: A station on a shared stretch

- **WHEN** a station stands on a stretch its line shares with another
- **THEN** it is drawn on its own line's drawn path, not between the two

## ADDED Requirements

### Requirement: Lines sharing an alignment stay separated at every zoom

The separation between lines sharing an alignment SHALL remain legible at every zoom, so that two
services never merge into one stripe when the camera pulls back, and never appear as two railways a
street apart when it moves in.

A separation fixed as a distance on the ground cannot satisfy both ends: one large enough to read
when zoomed out is absurd at street level, and one that looks right at street level vanishes when
zoomed out.

#### Scenario: Zoomed out to the whole network

- **WHEN** the whole Klang Valley is in view
- **THEN** the two lines on a shared stretch are still separately visible as two colours

#### Scenario: Zoomed in to street level

- **WHEN** the camera is close to a shared stretch
- **THEN** the two lines read as running alongside each other, not as being far apart

### Requirement: A line joins and leaves a shared alignment smoothly

Where a shared stretch begins or ends at a junction, the drawn line SHALL return to the true
alignment gradually rather than stepping sideways.

#### Scenario: The open end of a shared stretch

- **WHEN** a line reaches the point where it stops sharing an alignment
- **THEN** its drawn path converges on the true alignment over a distance, without a visible kink

### Requirement: Coincident geometry cannot interfere

Two pieces of geometry occupying the same place SHALL NOT be left to contend for which is drawn in
front, at any zoom or camera angle.

#### Scenario: Any two lines crossing or touching

- **WHEN** two lines cross, touch, or run over the same ground
- **THEN** one is consistently in front of the other, and neither flickers nor breaks into stripes

### Requirement: Trains run on their own line's drawn track

A train SHALL be drawn on the track drawn for its own line, including where that line is offset from
a shared alignment, and SHALL still keep to the left of its direction of travel.

#### Scenario: A train on a shared stretch

- **WHEN** a train runs along a stretch its line shares with another
- **THEN** it is drawn on its own line's drawn path, and not on the other line's or between them

#### Scenario: Keeping left is preserved

- **WHEN** a train runs on an offset stretch
- **THEN** it is still drawn to the left of its direction of travel relative to its own drawn track
