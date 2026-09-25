# Spec Delta

## MODIFIED Requirements

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
