# station-labels Specification

## Purpose
Names stations on the map so a viewer can tell where they are looking, at a density that helps
rather than obscures, without ever covering the statement that positions are scheduled or taking a
click meant for a train.

## Requirements

### Requirement: A station is named once, however many lines serve it

The map SHALL name each place, meaning every stop that carries the same station name, with exactly
one label. A station served by several lines, or by two lines sharing track, SHALL NOT be named more
than once. The markers themselves stay one per line, as `network-map` requires.

#### Scenario: A four-line interchange

- **WHEN** Titiwangsa, which is a stop on four lines, is on screen and labelled
- **THEN** its name appears once

#### Scenario: A station on shared track

- **WHEN** a station on the stretch shared by the Ampang and Sri Petaling lines is labelled
- **THEN** its name appears once, and both lines' markers are still drawn

### Requirement: A name sits with the markers that are drawn

A label SHALL be placed by where its station's markers are actually drawn, not by the true track
position. Where markers are drawn beside a shared alignment, the label SHALL sit with them, and SHALL
stay with them as the zoom changes the offset. Where a place's markers are spread apart, the label
SHALL sit among them.

#### Scenario: On the shared corridor, zooming

- **WHEN** the viewer zooms in and out over the stretch the Ampang and Sri Petaling lines share
- **THEN** each label stays centred between its own station's two markers as the offset between
  them changes

#### Scenario: On the shared corridor, one line hidden

- **WHEN** one of the two lines sharing the corridor is hidden
- **THEN** each corridor label moves onto the marker still drawn, off the true alignment

#### Scenario: One of a pair of lines hidden

- **WHEN** one of two lines serving a place is hidden
- **THEN** the label sits with the markers still drawn

### Requirement: Which names show depends on importance and on zoom

Names SHALL be offered in priority order: first the selected station, then interchanges and
terminals, then every other station. Zoomed out, only the selected station, interchanges and
terminals SHALL be named. Closer in, other stations SHALL be named as room allows. The number of
names shown at once SHALL be capped, so that no zoom produces a wall of text.

#### Scenario: The whole network in view

- **WHEN** the camera is pulled back far enough to show the whole network
- **THEN** only interchanges, terminals and any selected station are named

#### Scenario: Zooming into the city centre

- **WHEN** the viewer zooms in on the city centre
- **THEN** further stations are named as they gain room, without any name overlapping another

#### Scenario: A selected station

- **WHEN** a station is selected
- **THEN** its name is shown and distinguished from the others, whatever the zoom and whatever
  else is near it

### Requirement: Names never overlap

No two labels SHALL overlap on screen. Where two would collide, the one of lower priority SHALL be
left out. A missing name is better than two names on top of each other.

#### Scenario: Two close stations

- **WHEN** two stations are so close on screen that their names would overlap
- **THEN** only the more important of the two is named

### Requirement: Names do not obstruct the view

Labels SHALL be an aid to reading the map, not its content. They SHALL be drawn over the lines and
the trains, so that a name stays readable when a train passes it or a line crosses it. They SHALL
NOT cover any panel, and in
particular never the statement that positions are scheduled rather than live. They SHALL NOT answer
a pointer or a tap: pointing at a label identifies whatever lies beneath it, exactly as if the label
were not there. They SHALL be legible against the city view and against the schematic view.

#### Scenario: A train passes a label

- **WHEN** a train's drawn position crosses a station's label
- **THEN** the label is drawn over the train, and pointing at or clicking the train where the label
  covers it still picks the train

#### Scenario: A label near the caption

- **WHEN** a station whose label would fall under a panel is labelled
- **THEN** the panel covers the label, and the statement that positions are scheduled stays fully
  visible

#### Scenario: Clicking where a label is

- **WHEN** the viewer clicks on a label over empty map
- **THEN** nothing is selected, as if the label were not there

#### Scenario: Both views

- **WHEN** the viewer switches between the city and the schematic view
- **THEN** labels remain readable in both

### Requirement: Names follow which lines are shown

A place SHALL be labelled only while at least one line serving it is shown. Hiding a line SHALL NOT
hide the name of a station that another shown line still serves, and SHALL NOT move any other name
or marker.

#### Scenario: Hiding a line with an interchange

- **WHEN** the viewer hides one line of an interchange served by two
- **THEN** the interchange stays named, beside the markers still drawn

#### Scenario: Hiding every line of a station

- **WHEN** every line serving a station is hidden
- **THEN** that station is not named

### Requirement: Ours are the only station names on the map

The base map SHALL NOT print its own names for rail stations, so that a station is never named twice
in two spellings. The base map's bus stops SHALL remain visible. Switching between the city and the
schematic view SHALL NOT bring the base map's station names back.

#### Scenario: Close in over the city centre

- **WHEN** the viewer looks at Masjid Jamek from close in, in the city view
- **THEN** the station is named once, by this app, and nearby bus stops are still marked

#### Scenario: After switching views

- **WHEN** the viewer switches to the schematic view and back to the city view
- **THEN** the base map's station names are still absent and its bus stops still present

### Requirement: Labelling does not slow the map

Deciding which names show SHALL happen at most a few times a second, and only when something that
affects it has changed: the camera, the shown lines, the selection or the view. Keeping names in
place as the camera moves SHALL NOT cause the user-interface framework to re-render.

#### Scenario: Panning across the city

- **WHEN** the viewer pans and zooms continuously
- **THEN** the names move with the map without lagging behind it, and the map keeps animating
  smoothly

#### Scenario: A still camera

- **WHEN** the camera, the shown lines, the selection and the view are all unchanged
- **THEN** the choice of names is not recomputed
