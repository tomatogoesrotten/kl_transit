# Spec Delta

## MODIFIED Requirements

### Requirement: The display states that positions come from a timetable

Wherever the app presents the network, it SHALL remain apparent to the viewer that rail train
positions are derived from a published schedule and are not a live feed of vehicle positions.

Where live bus or KTM vehicles are also shown, the same statement SHALL say which kind of position
each is: KTM ETS trains are live GPS reports; buses are estimated between live GPS reports once
estimation is running, and live GPS reports until then. The viewer SHALL never have to guess which
kind of position they are looking at.

#### Scenario: A viewer looks at the map

- **WHEN** the network is on screen
- **THEN** a plainly worded statement that train positions are scheduled rather than live is visible
  without the viewer having to look for it

#### Scenario: Live vehicles on the map as well

- **WHEN** buses or KTM vehicles are shown beside the rail network, before the route shapes have loaded
- **THEN** the statement says the trains are scheduled and the buses and KTM are live GPS, rather
  than that everything shown is scheduled

#### Scenario: Buses moving on estimates

- **WHEN** the route shapes have loaded and buses are moving, in either view
- **THEN** the statement says the trains are scheduled, KTM is live GPS, and bus positions are
  estimated between live GPS reports
