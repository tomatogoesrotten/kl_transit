# Spec Delta

## ADDED Requirements

### Requirement: A station can be found by name

The lines panel SHALL let the viewer type part of a station's name and see the stations that match,
one entry per place rather than one per line. Matching SHALL ignore letter case, spaces, hyphens and
apostrophes, so that what a person types need not reproduce the feed's punctuation. Names that begin
with what was typed SHALL be listed before names that merely contain it.

Choosing a result SHALL move the camera to that station, select it, and give its label the highest
priority. A station none of whose lines is shown SHALL be listed but SHALL NOT be choosable, because
there would be nothing drawn to go to. The search SHALL live in the existing lines panel, not in a
second one, and SHALL work by keyboard and at phone width.

Searching SHALL NOT change which lines are shown, and SHALL NOT move any drawn line or marker.

#### Scenario: Typing without the punctuation

- **WHEN** the viewer types "sunway setia"
- **THEN** "Sunway-Setia Jaya" is listed

#### Scenario: An interchange

- **WHEN** the viewer types "titi"
- **THEN** Titiwangsa is listed once, with the lines that serve it

#### Scenario: Choosing a result

- **WHEN** the viewer chooses a listed station
- **THEN** the camera moves to it, it is selected, and its name is shown on the map

#### Scenario: A station on hidden lines only

- **WHEN** a matching station is served only by hidden lines
- **THEN** it is listed but cannot be chosen

#### Scenario: Nothing matches

- **WHEN** the typed text matches no station
- **THEN** the panel says that nothing matches, rather than showing an empty list

#### Scenario: By keyboard alone

- **WHEN** the viewer uses only a keyboard
- **THEN** the search box and its results can be reached, and a result chosen
