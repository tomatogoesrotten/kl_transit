# Spec Delta

## ADDED Requirements

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
