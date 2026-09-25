# inspection Specification

## Purpose
Lets a person ask the map about what is on it: what a train or station is, what a train is doing,
what is coming next from a platform, and which parts of the network to show at all.

## Requirements

### Requirement: Pointing at something says what it is

Moving the pointer over a train, a station or a live bus or KTM vehicle SHALL identify it briefly,
without the viewer having to click. The pointer SHALL indicate that the thing under it can be
selected.

Only trains, stations and live vehicles SHALL answer. The drawn track is not a thing to inspect, and
if it answered it would do so everywhere near a line, leaving nothing else reachable.

#### Scenario: Over a train

- **WHEN** the pointer rests on a train
- **THEN** its line and where it is going are shown, and the pointer indicates it can be selected

#### Scenario: Over a station

- **WHEN** the pointer rests on a station
- **THEN** the station's name is shown

#### Scenario: Over a live vehicle

- **WHEN** the pointer rests on a bus or KTM vehicle
- **THEN** its mode, its route or label as the feed gives it, and the age of its report are shown

#### Scenario: Over empty map or over the track

- **WHEN** the pointer is over empty map, or over a line between stations
- **THEN** nothing is identified, and the pointer indicates the map can be dragged

#### Scenario: A train standing at a platform

- **WHEN** the pointer is over a train stopped at a station, so the two overlap
- **THEN** the train answers, not the station beneath it

### Requirement: Selecting a train describes its journey

Selecting a train SHALL show which line it belongs to, where it is going, where it began its trip
and at what time, what it is doing at this moment, and the stops it has still to make with the time
it is scheduled at each.

What it is doing SHALL distinguish standing at a platform from running between two, and SHALL say
which station is meant in each case — the one it is at, or the one it is approaching.

#### Scenario: A train between stations

- **WHEN** a running train is selected
- **THEN** the display names the station it is approaching and how long until it arrives

#### Scenario: A train at a platform

- **WHEN** a train standing at a station is selected
- **THEN** the display says it is at that station and how long until it leaves

#### Scenario: A train at its last stop

- **WHEN** the selected train is standing at the final stop of its trip
- **THEN** the display says so, rather than offering a departure that will not happen

#### Scenario: Stops still to come

- **WHEN** a train is selected
- **THEN** the stops it has yet to call at are listed with their scheduled times, the one it is
  currently standing at excluded, and fewer than the full number shown when its trip is nearly over

### Requirement: Selecting a station says what is coming

Selecting a station SHALL show the next departures from it, separately for each direction its line
serves, expressed so that a person can tell both when the train comes and how long they will wait.

A terminal SHALL NOT advertise departures in a direction nothing leaves in.

#### Scenario: A station in the middle of a line

- **WHEN** a station served in both directions is selected
- **THEN** the next departures are shown for each direction, labelled by where those trains are
  going

#### Scenario: A terminal

- **WHEN** a station at the end of a line is selected
- **THEN** only the direction trains actually leave in is shown

#### Scenario: After the last train

- **WHEN** a station is selected after its last departure of the service day
- **THEN** the display says there are no more trains, rather than showing nothing

### Requirement: Arrival times agree with what is on screen

Where a train that is already running will call at the selected station, the time given SHALL be
derived from that train's actual progress rather than from the timetable alone, so that the display
cannot claim a train is further away than the one visibly approaching.

Times beyond the trains currently running SHALL come from the timetable.

This remains a scheduled position and not an observed one, and the display SHALL continue to say so.

#### Scenario: A train visibly approaching

- **WHEN** a station is selected while a train is on its way to it
- **THEN** the time shown for that train matches its position on the map

#### Scenario: Beyond what is running

- **WHEN** the next departures include trains that have not yet started their trips
- **THEN** those times come from the timetable

### Requirement: The map can be kept on a moving train

The viewer SHALL be able to ask the map to stay with a selected train, and SHALL be able to stop it.

Following SHALL end as soon as the viewer moves the map themselves. It SHALL NOT end because the
map moved to keep up with the train, which it does continuously.

#### Scenario: Following a train

- **WHEN** the viewer asks to follow a selected train
- **THEN** the map stays with it as it moves, keeping the same zoom and angle

#### Scenario: Taking the map back

- **WHEN** the viewer drags the map while following
- **THEN** following stops, and the map stays where they put it

#### Scenario: Zooming while following

- **WHEN** the viewer zooms while following
- **THEN** following continues, because changing how close you are is not taking the map back

#### Scenario: The followed train finishes its trip

- **WHEN** a followed train reaches the end of its trip or is no longer shown
- **THEN** following stops, and the display says the train is no longer running

### Requirement: Each line can be hidden

The viewer SHALL be able to hide any line, which SHALL hide its track, its stations and its trains
together. Hiding a line SHALL NOT change where any other line is drawn.

Anything selected that belongs to a hidden line SHALL cease to be selected, rather than being
described while invisible.

#### Scenario: Hiding a line

- **WHEN** the viewer hides a line
- **THEN** its track, its stations and its trains all disappear, and every other line is drawn
  exactly where it was

#### Scenario: Hiding a line that shares track

- **WHEN** the viewer hides one of two lines that share an alignment
- **THEN** the other stays exactly where it was drawn, rather than moving onto the alignment it now
  has to itself

#### Scenario: Hiding the selected thing's line

- **WHEN** the viewer hides the line of a selected train or station
- **THEN** the selection is cleared

### Requirement: Each line reports how many of its trains are running

The display SHALL show, per line, how many of its trains are currently running, and a total across
the network. These SHALL update often enough to be current and rarely enough not to be distracting.

#### Scenario: Through the morning build-up

- **WHEN** the clock runs through the start of service
- **THEN** the counts rise as trains begin their trips, without flickering

#### Scenario: When nothing runs

- **WHEN** no trains are running
- **THEN** the counts say zero rather than showing nothing

### Requirement: A selection survives as long as the train does

A selection SHALL continue to describe the same train for as long as that train is running, and
SHALL NOT be lost because the day rolled over or because the timetable in force was changed.

Where a selection genuinely can no longer be resolved, the display SHALL say what it does not know
rather than asserting the trip has finished.

#### Scenario: Midnight passes while a train is selected

- **WHEN** the clock passes midnight while a running train is selected
- **THEN** the selection still describes that train

#### Scenario: The timetable in force is changed

- **WHEN** the viewer forces a different timetable while a train is selected
- **THEN** the display does not claim the trip finished, because it did not

#### Scenario: The trip genuinely ends

- **WHEN** a selected train reaches the end of its trip
- **THEN** the display says the trip has finished

### Requirement: Selection works by pointer, by touch and by keyboard

Selecting SHALL be possible with a mouse, with a finger, and by keyboard. Dragging the map SHALL NOT
select anything. Selecting SHALL be dismissable, and the panels SHALL remain usable at phone width.

#### Scenario: Tapping on a phone

- **WHEN** the viewer taps a train
- **THEN** it is selected, and no hover description flashes first

#### Scenario: Dragging rather than clicking

- **WHEN** the viewer presses on a train and drags the map
- **THEN** the map moves and nothing is selected

#### Scenario: By keyboard alone

- **WHEN** the viewer navigates with a keyboard
- **THEN** stations can be reached and selected, and the selection can be dismissed

#### Scenario: Dismissing

- **WHEN** the viewer dismisses the selection
- **THEN** the card closes and nothing remains selected

### Requirement: Inspecting does not slow the map

Describing what is under the pointer, updating a card, and counting running trains SHALL NOT cause
the map to be redrawn or the user-interface framework to re-render at the rate the map animates.

#### Scenario: Moving the pointer across the map

- **WHEN** the viewer sweeps the pointer over many trains
- **THEN** the map continues to animate smoothly

#### Scenario: A card open while the clock runs fast

- **WHEN** a card is open and the clock runs at its fastest setting
- **THEN** the card stays current without the map losing frames

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
