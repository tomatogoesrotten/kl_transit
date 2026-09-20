# Spec Delta

## ADDED Requirements

### Requirement: A station is findable among the buildings and from a distance

Stations SHALL be marked in a way that can be picked out at a glance — in the city centre, where
three-dimensional buildings surround and hide things at ground level, and from far enough away that
the whole network is in view.

A marker lying flat on the ground at the scale of the track it sits on satisfies neither: it is
occluded close up and indistinguishable from the line far away.

#### Scenario: A station in the dense city centre

- **WHEN** the camera is tilted among the tall buildings of the city centre
- **THEN** the stations there can still be picked out

#### Scenario: The whole network in view

- **WHEN** the camera is far enough back to show the whole network
- **THEN** stations can be distinguished from the lines they sit on

#### Scenario: Close enough to see a station

- **WHEN** the camera is close to a station
- **THEN** what is drawn reads as a station rather than as an abstract marker

### Requirement: What marks a station suits how far away the viewer is

What is drawn for a station SHALL differ with distance: something structural when close enough for
structure to be legible, and something that carries at a distance when it is not. The change between
them SHALL be gradual, so neither appears or vanishes abruptly.

#### Scenario: Moving the camera in and out

- **WHEN** the viewer zooms from the whole network down to a single station and back
- **THEN** what marks the station changes without either representation popping in or out

### Requirement: A station tells you which kind of railway it serves

What is drawn close up SHALL differ by mode, so that a monorail station is not drawn as a heavy rail
platform and a bus stop is not drawn as either.

#### Scenario: Comparing stations of different modes

- **WHEN** a monorail station and an MRT station are both in view
- **THEN** they are visibly different kinds of structure

### Requirement: A place served by several lines is marked once

Where several lines serve the same place, that place SHALL be marked once, not once per line.

Marking it repeatedly would pile several structures on one spot, which is worse than what it
replaces — and a person reads one station there, because there is one station there.

#### Scenario: An interchange served by several lines

- **WHEN** a place served by four lines is drawn
- **THEN** one structure marks it, not four

### Requirement: Which lines serve a station, and which is busy, remain visible

Marking a place SHALL NOT replace or obscure the existing per-line markers, which carry two things
the structural marking does not: which line each platform belongs to, and whether a train is
standing at it.

#### Scenario: A train standing at one platform of an interchange

- **WHEN** a train stands at one line's platform of a place served by several
- **THEN** that line's marker shows it, and the others do not

#### Scenario: Reading which lines serve a place

- **WHEN** a place served by several lines is drawn
- **THEN** each line that serves it is still individually apparent

### Requirement: Station markings do not claim to know the track's height

The feed carries no information about which sections of line are elevated, at grade or in tunnel.
Station markings SHALL be drawn on the same assumption the trains already use, and the application's
explanation of its data SHALL continue to say that the height is assumed.

Nothing drawn SHALL imply a precision about height that the data does not contain.

#### Scenario: A station on an underground section

- **WHEN** a station on a section that is in reality underground is drawn
- **THEN** it is drawn at the same assumed height as the rest, and the explanation of the data still
  says height is not in the feed

### Requirement: Station markings do not overwhelm the trains

What marks a station SHALL remain subordinate to the trains moving between them. Stations are fixed
and trains are the thing that changes; a marking that dominates the map defeats the point of
drawing a moving network.

#### Scenario: A train arriving at a station

- **WHEN** a train arrives at a station and stands at the platform
- **THEN** the train remains clearly visible against whatever marks the station

## MODIFIED Requirements

### Requirement: Stations are drawn on the track, not at their published coordinates

Every station SHALL be drawn at the point where it has been projected onto its line's path, using
its recorded distance along that line, and SHALL NOT be drawn at the raw coordinate the feed gives
for it.

The feed's station coordinates sit up to about 105 metres from the track. Drawing them raw would
show stations floating beside their own line.

Where a line is drawn beside a shared alignment rather than on it, its stations SHALL be drawn
beside it too, by the same amount. Whatever is drawn as a line and whatever is drawn as standing on
that line SHALL NOT come apart.

Anything drawn for a place rather than for a single line SHALL be positioned from the drawn
positions of the stations it stands for, so that it too sits on the track rather than beside it.

#### Scenario: A station whose published coordinate is off the track

- **WHEN** a station's published coordinate lies some distance from its line's path
- **THEN** the station is drawn where it meets the track, touching the line, not beside it

#### Scenario: Every station on every line

- **WHEN** the network is drawn
- **THEN** every station of every line is visible, in the colour of the line it belongs to

#### Scenario: A station on a shared stretch

- **WHEN** a station stands on a stretch its line shares with another
- **THEN** it is drawn on its own line's drawn path, not between the two

#### Scenario: A place marking on a shared stretch

- **WHEN** a place is marked whose stations sit on an offset stretch
- **THEN** the marking sits with them, and moves with them as the offset changes with the camera
