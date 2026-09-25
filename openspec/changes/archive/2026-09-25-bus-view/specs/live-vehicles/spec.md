# Spec Delta

## MODIFIED Requirements

### Requirement: Live vehicles are drawn where their feed last reported them

Each KTM vehicle, and each bus that is not being estimated, SHALL be drawn at the position its feed
most recently reported for it, and nowhere else. Its position SHALL NOT be extrapolated, interpolated
or smoothed between reports: when a newer report arrives the vehicle moves to it in one step.

In either view, once the route shapes have loaded, buses SHALL instead be drawn at an estimate that
starts from their most recent report, by the rules of the bus-estimation capability, and a bus drawn
at an estimate SHALL be described as estimated wherever it is described. A bus not drawn at an
estimate SHALL NOT be described as estimated. No other live vehicle SHALL be estimated.

A vehicle SHALL show the direction it is heading only where its feed reports a real bearing. A feed
whose bearing is a placeholder SHALL have its vehicles drawn without a direction.

#### Scenario: Before the route shapes have loaded

- **WHEN** a bus has reported and the route shapes have not yet arrived
- **THEN** it stays exactly where it was reported, and nothing calls its position estimated

#### Scenario: Between two reports, once the shapes have loaded

- **WHEN** a bus is moving on an estimate, in either view
- **THEN** it is drawn at its estimate, and its card and hover say the position is estimated

#### Scenario: Between two reports

- **WHEN** a KTM ETS train has been reported and no newer report has arrived, in either view
- **THEN** it stays exactly where it was reported

#### Scenario: A newer report arrives

- **WHEN** the feed reports somewhere new a bus that is not being estimated
- **THEN** it is drawn at the new position at once, without gliding there

#### Scenario: An older report arrives late

- **WHEN** a response carries a report for a vehicle that is older than the one already held
- **THEN** the newer report is kept and the vehicle does not move backwards

#### Scenario: A feed with placeholder bearings

- **WHEN** every vehicle in the KTM feed reports the same bearing of zero
- **THEN** KTM ETS trains are drawn with nothing that indicates a direction, rather than all pointing
  north

### Requirement: Feeds are fetched within the API's limits

The bus feed SHALL be requested no more than once every 30 seconds, and the KTM feed no more than once
every 120 seconds. However the two fall, no 60-second window SHALL contain more than three requests
from one page, against the documented limit of four a minute. Requests SHALL stop while the page is
hidden, while the clock is not following the present, and for a mode the viewer has switched off,
and SHALL resume, still no sooner than that feed's interval after its previous request, when all three
allow it again.

The explanation of the data SHALL say that the bus feed itself refreshes about once a minute, so that
checking it every 30 seconds picks up a new report sooner but does not make reports fresher.

#### Scenario: A page left in a background tab

- **WHEN** the page is hidden
- **THEN** no feed is requested until it is visible again

#### Scenario: Pressing Now repeatedly

- **WHEN** the viewer leaves and returns to the present several times within 30 seconds
- **THEN** the bus feed is still requested at most once in those 30 seconds, and the KTM feed at most
  once in 120

#### Scenario: Both feeds running for ten minutes

- **WHEN** both modes are on and the clock is live for ten minutes
- **THEN** about twenty bus requests and five KTM requests are made, and no 60-second window holds more
  than three

#### Scenario: Both modes switched off

- **WHEN** the viewer hides both buses and KTM
- **THEN** neither feed is requested

### Requirement: Live and scheduled vehicles cannot be mistaken for each other

Buses, KTM ETS trains and the scheduled rail trains SHALL look different from one another, so that no
live vehicle can be taken for a scheduled one or the reverse. In particular a live bus SHALL NOT be
mistakable for a scheduled BRT Sunway bus: they differ in shape and colour, and the live bus is drawn
at street level where the BRT runs on its elevated busway.

The display SHALL state in plain words that rail positions are scheduled, that KTM ETS positions are
live GPS reports, and that bus positions are estimated between live GPS reports once estimation is
running, or live GPS reports before it is.

#### Scenario: A bus beside an LRT train

- **WHEN** a bus is drawn near a rail train
- **THEN** the two are plainly different kinds of vehicle

#### Scenario: A live bus beside a BRT Sunway bus in the bus view

- **WHEN** a live bus model is drawn near a BRT Sunway bus
- **THEN** the two differ in shape, colour and height, and each one's hover text says which it is

#### Scenario: Reading what the map shows

- **WHEN** the viewer reads the explanation of the data
- **THEN** it says trains are placed by the timetable, KTM ETS by live GPS, and buses by an estimate
  from live GPS along their published routes, with each report's age shown

### Requirement: Buses do not overwhelm the rail network

In the rail view, at a zoom where the whole city is in view, bus markers SHALL remain visible without
obscuring the rail lines, stations or trains, and the rail network SHALL be drawn above the buses where
they overlap. In the bus view the priority is reversed, as the bus-view capability says.

#### Scenario: The whole city in view

- **WHEN** the rail view is zoomed out to show all of Kuala Lumpur with over a hundred buses reporting
- **THEN** every rail line and train is still plainly visible among them

### Requirement: A live vehicle can be inspected

Pointing at a live vehicle SHALL identify it briefly, and selecting it SHALL show its mode, its route
or trip, its vehicle id or label, and the age of its report.

A bus's route SHALL be shown by its public route name from the published bus timetable, with the feed's
route id beside it (for example "300", feed id U3000). A route id the published timetable does not
contain SHALL be shown as the feed gives it, labelled as a feed id, and SHALL NOT be replaced by a name
guessed from its spelling. Other feed identifiers SHALL be shown as the feed gives them and labelled
as such.

A bus drawn at an estimate SHALL, on its card, say that its position is estimated, give the age of its
last real GPS report, and count down the seconds to the next check of the bus feed ("next update in
N s"). When that check brings no newer report for the bus, the card SHALL say so rather than implying
the position was refreshed. The hover text for such a bus SHALL also say it is estimated and give the
report's age.

While a live vehicle is selected its card SHALL stay current: its age and countdown SHALL advance, a
newer report SHALL be reflected, and when the vehicle is no longer drawn the card SHALL say it has
stopped reporting rather than showing its last details as current. The hover text SHALL also stay
current while the pointer rests still.

#### Scenario: Pointing at a bus

- **WHEN** the pointer rests on a bus drawn at its last report
- **THEN** its mode, its public route name and feed id, and the age of its report are shown

#### Scenario: Pointing at a moving bus

- **WHEN** the pointer rests on a bus drawn at an estimate, in either view
- **THEN** its public route name, the word estimated, and the age of its last GPS report are shown

#### Scenario: The pointer rests still

- **WHEN** the pointer rests without moving on a bus for 30 seconds
- **THEN** the age in the hover text advances with it rather than freezing

#### Scenario: Selecting a moving bus

- **WHEN** the viewer selects a bus moving on an estimate, in either view
- **THEN** the card says the position is estimated, gives the age of the last GPS report, and counts
  down to the next update

#### Scenario: A check with nothing new

- **WHEN** the countdown reaches zero and the feed's answer holds no newer report for the selected bus
- **THEN** the card says no newer report has arrived, and the countdown starts again

#### Scenario: A route id the timetable does not know

- **WHEN** a bus reports route id U9999, which is not in the published bus routes
- **THEN** it is shown as "U9999 (feed id)", with no route number

#### Scenario: The selected bus goes silent

- **WHEN** the selected bus's report passes 10 minutes old
- **THEN** the card says it has stopped reporting, and since when

#### Scenario: A live vehicle beside a train

- **WHEN** one click lands on a live vehicle and a rail train together
- **THEN** the viewer is offered both, as with any other crowded pick

## ADDED Requirements

### Requirement: The live controls work at phone width and by keyboard

The live group in the lines panel — each mode's switch, count and status line — SHALL be fully usable
on a phone-width screen without horizontal scrolling or clipped text, and SHALL be operable and
readable by keyboard and screen reader alone.

#### Scenario: A phone-width screen

- **WHEN** the panel is opened on a screen 360 px wide
- **THEN** every live switch, count and status line is visible and readable without scrolling sideways

#### Scenario: By keyboard

- **WHEN** the viewer tabs through the panel
- **THEN** each live switch can be reached and toggled, and its status is announced
