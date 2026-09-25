# bus-view Specification

## Purpose
Lets the viewer switch between a rail view, where the timetabled network is the subject, and a bus
view, where live buses and the bus stops are, without either burying the other.

## Requirements

### Requirement: The viewer can switch between a rail view and a bus view

The display SHALL offer a choice of two views, Rail and Bus, beside the choice of map style, visible
without opening any panel. Exactly one view SHALL be in force at a time. The choice SHALL be operable
by pointer, touch and keyboard, SHALL announce which view is chosen to assistive technology, and SHALL
be remembered for the viewer's next visit. Switching SHALL NOT move the camera, change the clock,
change the map style, or change which lines and modes are switched on.

#### Scenario: Opening the app for the first time

- **WHEN** a viewer opens the app with no remembered choice
- **THEN** the rail view is shown

#### Scenario: Switching to the bus view

- **WHEN** the viewer chooses Bus
- **THEN** the bus view is shown, the camera stays where it was, and the clock keeps its time

#### Scenario: Coming back later

- **WHEN** a viewer who left the app in the bus view opens it again
- **THEN** it opens in the bus view

#### Scenario: By keyboard

- **WHEN** the viewer tabs to the view choice and changes it with the keyboard
- **THEN** the view changes and the new choice is announced

### Requirement: The rail view keeps rail in front

In the rail view the map SHALL look and behave as it did before the bus view existed, with one
exception: live buses, still small flat markers beneath the network, SHALL move between reports by the
rules of the bus-estimation capability once the route shapes have loaded. Before then, and for any bus
that cannot be estimated, a bus SHALL be drawn at its last reported position, as before. KTM ETS
trains SHALL be drawn where the feed last put them. Public route numbers SHALL be shown for buses in
the rail view too, because they are a fact about the route, not about the view.

#### Scenario: A bus in the rail view

- **WHEN** the rail view is shown, the route shapes have loaded, and a bus has reported twice on its
  trip
- **THEN** it is a small flat marker beneath the rail network, moving along its route on an estimate

#### Scenario: Stops are never downloaded for the rail view

- **WHEN** a viewer uses only the rail view
- **THEN** the bus stops are never downloaded

### Requirement: The bus view brings buses and stops forward and dims the rail network

In the bus view, live buses SHALL be drawn as 3D models and bus stops SHALL be shown. The rail lines,
stations, station names and trains SHALL remain drawn and remain selectable, but SHALL be visibly
dimmed so that buses and stops read first. The rail network SHALL NOT be hidden, so that interchanges
between bus and rail stay visible.

#### Scenario: A bus beside an LRT line in the bus view

- **WHEN** the bus view is shown and a bus runs beside a rail line
- **THEN** the bus is drawn at full strength and the rail line behind it is drawn dimmed but visible

#### Scenario: Selecting a train in the bus view

- **WHEN** the viewer clicks a dimmed train in the bus view
- **THEN** it is selected and its card opens as in the rail view

### Requirement: Bus stops are shown in the bus view when close enough to read

The bus view SHALL show every stop in the published Rapid KL bus timetable at its published position,
but only once the map is zoomed in far enough that the stops can be told apart (zoom 14 or closer).
Farther out no stop SHALL be drawn. Pointing at a stop SHALL show its name. Stops SHALL NOT appear in
the rail view.

The base map's own bus-stop symbols SHALL be hidden in the bus view, so that one stop is not marked
twice from two sources, and SHALL be shown again in the rail view exactly as before.

#### Scenario: Zoomed out over the city

- **WHEN** the bus view is shown at a zoom where the whole city is in view
- **THEN** no bus stop is drawn

#### Scenario: Zoomed in on a street

- **WHEN** the bus view is shown at zoom 14 or closer
- **THEN** the stops in view are drawn, and pointing at one shows its name

#### Scenario: Back to the rail view

- **WHEN** the viewer switches from the bus view to the rail view
- **THEN** no bus stop from the timetable is drawn, and the base map's own stop symbols are back

### Requirement: Route shapes load after the map has drawn, and stops only for the bus view

The first drawing of the map SHALL NOT wait for any bus data beyond the route-name table. The route
shapes that estimation needs SHALL be downloaded in the background after the map has first drawn, in
either view, while buses are switched on. The bus stops SHALL be downloaded the first time the bus view
is shown in a visit, and not before.

Until the route shapes arrive, every bus SHALL be drawn at its last reported position and nothing SHALL
describe any bus as estimated. If the route shapes cannot be downloaded, the display SHALL say that
estimated movement is unavailable, and buses SHALL stay at their last reported positions. While the
stops are loading the bus view SHALL say so, and if they cannot be downloaded it SHALL say that stops
are unavailable.

#### Scenario: Opening the app

- **WHEN** a viewer opens the app, in either view
- **THEN** the map draws first, the route shapes are downloaded after it, and until they arrive buses
  are drawn at their reports and described as live GPS, not estimated

#### Scenario: The first switch to the bus view

- **WHEN** the viewer opens the bus view for the first time in a visit
- **THEN** the stops are downloaded, and the view says they are loading until they arrive

#### Scenario: The shapes cannot be downloaded

- **WHEN** the route shapes fail to download
- **THEN** the display says estimated movement is unavailable, and buses are drawn at their last
  reported positions, not moving

#### Scenario: Buses switched off

- **WHEN** the viewer has buses switched off
- **THEN** the route shapes are not downloaded until buses are switched on

### Requirement: Both views are legible in both map styles

Buses, stops, the dimmed rail network and KTM ETS trains SHALL each be distinguishable from the base
map and from each other in the city style and in the wireframe style, in both views.

#### Scenario: The bus view in the wireframe style

- **WHEN** the bus view is shown in the wireframe style
- **THEN** buses, stops and the dimmed rail lines are each plainly visible against the dark ground

#### Scenario: The bus view in the city style

- **WHEN** the bus view is shown in the city style
- **THEN** buses, stops and the dimmed rail lines are each plainly visible against the pale map

### Requirement: Switching views does not slow the map

Changing view SHALL NOT cause the user-interface framework to re-render at the rate the map animates.
The frame loop SHALL learn the chosen view without being recreated.

#### Scenario: Switching while a hundred buses are drawn

- **WHEN** the viewer switches views with over a hundred buses on the map
- **THEN** the map keeps animating smoothly and the change takes effect on the next frame
