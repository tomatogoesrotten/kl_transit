# Spec Delta

## Purpose

Shows the rail network on the map of Kuala Lumpur: each line drawn in its own official colour, each
station drawn on the track it serves, rendered among the city's buildings rather than pasted flat
over them.

## ADDED Requirements

### Requirement: Every line in the network is drawn in its own colour

Every line the data describes SHALL be drawn as a continuous path following its recorded geometry,
filled with the colour that line's operator uses. No line SHALL be omitted, and no colour SHALL be
substituted for one not in the data.

#### Scenario: The whole network is visible

- **WHEN** the map is opened at a zoom showing the Klang Valley
- **THEN** all eight lines are visible, each in its own colour, forming the shape of the network

#### Scenario: A line is added to the feed

- **WHEN** a refreshed timetable contains a line the app has never seen
- **THEN** that line is drawn like any other, without code changes, because lines are read from the
  data rather than listed in the app

### Requirement: Lines stay legible at every zoom

Line width SHALL be expressed so that a line remains visible and distinguishable when the whole
network is in view, and does not grow into an unreadable band when zoomed to a single street.

#### Scenario: Zoomed out to the whole Klang Valley

- **WHEN** the map shows the entire network at once
- **THEN** each line is still thick enough to see and to tell apart from its neighbours

#### Scenario: Zoomed in to a single station

- **WHEN** the map is zoomed to street level
- **THEN** the line is still a line, not a band wider than the street it runs along

### Requirement: Stations are drawn on the track, not at their published coordinates

Every station SHALL be drawn at the point where it has been projected onto its line's path, using
its recorded distance along that line, and SHALL NOT be drawn at the raw coordinate the feed gives
for it.

The feed's station coordinates sit up to about 105 metres from the track. Drawing them raw would
show stations floating beside their own line.

#### Scenario: A station whose published coordinate is off the track

- **WHEN** a station's published coordinate lies some distance from its line's path
- **THEN** the station is drawn where it meets the track, touching the line, not beside it

#### Scenario: Every station on every line

- **WHEN** the network is drawn
- **THEN** every station of every line is visible, in the colour of the line it belongs to

### Requirement: Stations sharing a name are each drawn on their own line

Where one physical station serves several lines, or where two lines share track, the data holds one
station per line. Each SHALL be drawn on its own line. The app SHALL NOT merge them, and SHALL NOT
hide the duplication.

This is honest to the feed as it stands. Merging interchanges is later work, and until then the
duplication is visible rather than papered over.

#### Scenario: An interchange served by two lines

- **WHEN** a station such as KL Sentral is drawn
- **THEN** a marker appears for each line that serves it, in that line's colour

#### Scenario: Two lines sharing track

- **WHEN** the stretch shared by the Ampang and Sri Petaling lines is drawn
- **THEN** both lines and both sets of stations are drawn, overlapping, rather than one being
  suppressed

### Requirement: The network is drawn among the city, not over it

Network layers SHALL be rendered into the map's own three-dimensional scene, so that the city's
buildings and the network occupy the same space and obscure each other correctly, rather than the
network being painted flat on top of the finished map image.

#### Scenario: A tilted view with buildings

- **WHEN** the map is tilted at a zoom where buildings are drawn
- **THEN** the network and the buildings are composed as one scene, with depth respected between
  them

#### Scenario: Rendering is unavailable

- **WHEN** the viewer's browser cannot provide the graphics capability this requires
- **THEN** the map still loads and remains usable, and the failure is evident rather than silent

### Requirement: The drawn network can be updated without rebuilding the map

The rendering layer SHALL expose a way to replace what is drawn, at any time, without recreating the
map or causing the application's user-interface framework to re-render.

This exists so that moving trains, added later, can be redrawn sixty times a second without the cost
of a framework update on every frame.

#### Scenario: Replacing what is drawn

- **WHEN** a new set of layers is supplied to the rendering layer
- **THEN** the map shows them, keeping its current position, zoom, pitch and bearing

#### Scenario: The map is torn down

- **WHEN** the map is removed
- **THEN** the rendering layer releases its graphics resources, leaving nothing running

### Requirement: The display states that positions come from a timetable

Wherever the app presents the network, it SHALL remain apparent to the viewer that what is shown is
derived from a published schedule and is not a live feed of vehicle positions.

#### Scenario: A viewer looks at the map

- **WHEN** the network is on screen
- **THEN** a plainly worded statement that positions are scheduled rather than live is visible
  without the viewer having to look for it
