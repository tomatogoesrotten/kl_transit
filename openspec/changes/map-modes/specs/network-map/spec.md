# Spec Delta

## MODIFIED Requirements

### Requirement: The network is drawn among the city, not over it

Where a basemap is shown, network layers SHALL be rendered into the map's own three-dimensional
scene, so that the city's buildings and the network occupy the same space and obscure each other
correctly, rather than the network being painted flat on top of the finished map image.

Where the viewer has chosen to hide the basemap, there is no city to compose with, and this
requirement is satisfied trivially. The rendering path SHALL NOT change between the two: hiding the
basemap hides basemap content, and does not switch the network to a different way of being drawn.

#### Scenario: A tilted view with buildings

- **WHEN** the map is tilted at a zoom where buildings are drawn
- **THEN** the network and the buildings are composed as one scene, with depth respected between
  them

#### Scenario: Rendering is unavailable

- **WHEN** the viewer's browser cannot provide the graphics capability this requires
- **THEN** the map still loads and remains usable, and the failure is evident rather than silent

#### Scenario: The basemap is hidden

- **WHEN** the viewer hides the basemap
- **THEN** the network is drawn by the same means as before, over an empty ground

## ADDED Requirements

### Requirement: The viewer can hide the basemap and see the network alone

The viewer SHALL be able to choose between seeing the network over the map of the city, and seeing
the network alone. When the basemap is hidden, no basemap content SHALL remain: no roads, water,
land use, buildings, place names or point-of-interest markers.

#### Scenario: Hiding the city

- **WHEN** the viewer switches to the network-only view
- **THEN** only the lines, the stations and a plain ground remain, with nothing of the city visible

#### Scenario: Bringing the city back

- **WHEN** the viewer switches back
- **THEN** the map of the city returns exactly as it was, with the network over it

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

- **WHEN** the viewer chooses the network-only view and later reloads
- **THEN** the network-only view is shown

#### Scenario: A first-time viewer

- **WHEN** someone opens the page with no previous choice recorded
- **THEN** the map of the city is shown, because "where is this" is the first question a newcomer has

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

#### Scenario: In the network-only view

- **WHEN** the basemap is hidden
- **THEN** the statement that positions are scheduled, not live, is still on screen
