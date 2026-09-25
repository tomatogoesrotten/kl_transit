# network-map Specification

## Purpose
Shows the rail network on the map of Kuala Lumpur: each line drawn in its own official colour, each
station drawn on the track it serves, rendered among the city's buildings rather than pasted flat
over them.

## Requirements

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

Wherever the app presents the network, it SHALL remain apparent to the viewer that rail train
positions are derived from a published schedule and are not a live feed of vehicle positions.

Where live bus or KTM vehicles are also shown, the same statement SHALL say that those, unlike the
trains, are live GPS positions, so that the viewer never has to guess which kind of position they
are looking at.

#### Scenario: A viewer looks at the map

- **WHEN** the network is on screen
- **THEN** a plainly worded statement that train positions are scheduled rather than live is visible
  without the viewer having to look for it

#### Scenario: Live vehicles on the map as well

- **WHEN** buses or KTM vehicles are shown beside the rail network
- **THEN** the statement says the trains are scheduled and the buses and KTM are live GPS, rather
  than that everything shown is scheduled

### Requirement: The viewer can switch the city to a schematic view

The viewer SHALL be able to choose between the ordinary map of the city and a schematic view of the
same place: a dark ground, streets reduced to thin dim lines, buildings as translucent volumes with
their footprints picked out in light, and the rail network unchanged and bright over all of it.

The schematic view SHALL show the city's structure — its street grid, its water, and where its
buildings stand — while removing everything that competes with the network for attention: land-use
and land-cover fills, points of interest, place names, and the ordinary map's colour.

#### Scenario: Switching to the schematic view

- **WHEN** the viewer switches to the schematic view
- **THEN** the ground is dark, streets and water are dim, buildings read as translucent volumes with
  lit footprints, and the rail network is the brightest thing on screen

#### Scenario: Returning to the city

- **WHEN** the viewer switches back
- **THEN** the ordinary map returns exactly as it was, with every colour it had before

#### Scenario: The network is unaffected

- **WHEN** the viewer switches in either direction
- **THEN** the lines and stations are drawn exactly as before, in the same colours, by the same
  means

### Requirement: Switching does not move the camera

Changing what is shown SHALL NOT change where the viewer is looking. The position, zoom, tilt and
rotation SHALL be preserved across a switch.

#### Scenario: Switching while zoomed in

- **WHEN** the viewer has zoomed and tilted to a particular station and then switches view
- **THEN** they are looking at the same place, from the same angle, at the same zoom

### Requirement: The chosen view is remembered

The viewer's choice SHALL survive reloading the page, so that someone who prefers one view is not
returned to the other every time.

#### Scenario: Returning to the page

- **WHEN** the viewer chooses the schematic view and later reloads
- **THEN** the schematic view is shown

#### Scenario: A first-time viewer

- **WHEN** someone opens the page with no previous choice recorded
- **THEN** the ordinary map is shown, because "where is this" is the first question a newcomer has

#### Scenario: The choice cannot be stored

- **WHEN** the browser refuses to store the preference, for example in a private window
- **THEN** the map still works and simply does not remember the choice

### Requirement: The switch is usable by hand and by touch

The control that changes the view SHALL be operable with a mouse, with a finger, and by keyboard,
and SHALL be legible at the width of a phone screen. Its current state SHALL be apparent without
interacting with it.

#### Scenario: On a phone

- **WHEN** the page is viewed at phone width
- **THEN** the switch is reachable and readable, and does not overlap the map's other controls

#### Scenario: Reading the current state

- **WHEN** the viewer looks at the switch
- **THEN** which of the two views is active is apparent from the control itself

### Requirement: The scheduled-not-live statement survives both views

The statement that positions come from a published schedule rather than a live feed SHALL remain
visible in both views.

#### Scenario: In the schematic view

- **WHEN** the schematic view is shown
- **THEN** the statement that positions are scheduled, not live, is still on screen

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
