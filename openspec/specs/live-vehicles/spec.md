# live-vehicles Specification

## Purpose
Shows Rapid KL buses and KTMB trains at the positions their live GPS feeds report, beside the
scheduled rail network, and is honest about how old each position is and when a feed has failed.

## Requirements

### Requirement: Live vehicles are drawn where their feed last reported them

Each bus and KTM vehicle SHALL be drawn at the position its feed most recently reported for it, and
nowhere else. Its position SHALL NOT be extrapolated, interpolated or smoothed between reports: when
a newer report arrives the vehicle moves to it in one step.

A vehicle SHALL show the direction it is heading only where its feed reports a real bearing. A feed
whose bearing is a placeholder SHALL have its vehicles drawn without a direction.

#### Scenario: Between two reports

- **WHEN** a bus has been reported once and no newer report has arrived
- **THEN** it stays exactly where it was reported, however long ago that was

#### Scenario: A newer report arrives

- **WHEN** the feed reports a bus somewhere new
- **THEN** it is drawn at the new position at once, without gliding there

#### Scenario: An older report arrives late

- **WHEN** a response carries a report for a vehicle that is older than the one already held
- **THEN** the newer report is kept and the vehicle does not move backwards

#### Scenario: A feed with placeholder bearings

- **WHEN** every vehicle in the KTM feed reports the same bearing of zero
- **THEN** KTM ETS trains are drawn with no direction arrow rather than all pointing north

### Requirement: KTM trains are named for what the feed carries

The KTMB live feed currently carries ETS intercity trains only. Everywhere the viewer meets this mode
— its visibility switch, its status, the hover description, the card and any legend — it SHALL be
named "KTM ETS (intercity)", not "KTM" or "Komuter", so that nothing implies Komuter trains are
being shown.

#### Scenario: The switch in the lines panel

- **WHEN** the viewer looks for the KTM switch
- **THEN** it is labelled "KTM ETS (intercity)"

#### Scenario: Selecting an ETS train

- **WHEN** an ETS train is selected
- **THEN** the card names its mode as "KTM ETS (intercity)", with the words live GPS, its label such
  as ETS304, its trip id and the age of its report

### Requirement: The explanation of the data says Komuter is absent from the feed

The application's explanation of its data SHALL state that the KTMB live feed currently carries only
ETS intercity trains and no KTM Komuter trains, so that the absence of Komuter from the map is read
as a gap in the feed and not as Komuter not running.

#### Scenario: A viewer looking for Komuter

- **WHEN** the viewer reads the explanation of the data, wondering why no Komuter trains are shown
- **THEN** it says the KTMB live feed carries only ETS intercity trains and no Komuter, and that
  Komuter trains may well be running

### Requirement: Every live vehicle says how old its position is

Each live vehicle SHALL carry the age of its last report, measured from the report's own timestamp
to the present moment. A report older than 4 minutes SHALL be drawn so that it is visibly stale. A
report older than 10 minutes SHALL no longer be drawn.

An age SHALL never be shown as negative. A report timestamped slightly in the future, because the
viewer's clock or the feed's is off, SHALL be treated as just received.

#### Scenario: A current report

- **WHEN** a bus was reported 45 seconds ago
- **THEN** it is drawn normally and its age is available as 45 seconds

#### Scenario: A vehicle that has stopped reporting

- **WHEN** a vehicle's most recent report is more than 4 minutes old
- **THEN** it is still drawn where it was reported, but visibly marked as stale

#### Scenario: A vehicle that has been silent a long time

- **WHEN** a vehicle's most recent report is more than 10 minutes old
- **THEN** it is no longer drawn

#### Scenario: A report from the future

- **WHEN** a report's timestamp is a few seconds ahead of the viewer's clock
- **THEN** its age is shown as zero, not as a negative number

### Requirement: A position that cannot be real is not drawn, and is counted

A report SHALL NOT be drawn when its position is clearly invalid:

- its latitude or longitude is missing or not a finite number;
- it lies at or near latitude 0, longitude 0 — the value an unset position decodes to — which SHALL
  be treated as invalid on its own account, whatever bounding box is in force;
- it lies outside a bounding box around Peninsular Malaysia, where every station both operators
  serve lies, the KTM shuttle's Woodlands terminus included.

Each such report SHALL be counted, and the count SHALL be shown with that mode's feed status for as
long as the latest response contains any, naming the reason. An invalid report SHALL NOT be dropped
silently, moved to a plausible place, or allowed to replace a valid report already held for the same
vehicle.

#### Scenario: A train reported in the Gulf of Guinea

- **WHEN** the KTM feed reports a vehicle at latitude 0.0027, longitude 0.0155
- **THEN** it is not drawn, and the KTM ETS status says one position was unusable because it was
  reported at 0,0

#### Scenario: A position outside the bounding box

- **WHEN** a feed reports a vehicle at a valid-looking coordinate outside Peninsular Malaysia, such as
  one in Borneo or Europe
- **THEN** it is not drawn and is counted as unusable in that feed's status

#### Scenario: A missing coordinate

- **WHEN** a report carries no latitude, or one that is not a number
- **THEN** it is not drawn and is counted as unusable

#### Scenario: An invalid report for a vehicle already on the map

- **WHEN** a vehicle held at a valid position is next reported at 0,0
- **THEN** it stays at its last valid position, ageing, and the invalid report is counted

#### Scenario: A feed with no invalid positions

- **WHEN** every position in the latest response is valid
- **THEN** the status mentions no unusable positions

#### Scenario: A train reported far from Kuala Lumpur

- **WHEN** the KTM feed reports a train in Johor or Kedah
- **THEN** it is drawn there, because that is where it is

### Requirement: A feed's condition is always stated

For each live mode the display SHALL say whether its feed is working, and when it is not, what is
wrong: the request failed, the API refused it for rate, the response could not be read, or the
response held no vehicles. A failure SHALL NOT present as an empty map.

An empty or failed response SHALL NOT erase reports already held. Those vehicles SHALL remain drawn,
ageing, until the age rules remove them.

#### Scenario: The request fails

- **WHEN** a feed cannot be fetched
- **THEN** the display says that mode's feed is unavailable and when it last answered, and the
  vehicles already held keep ageing towards stale

#### Scenario: The API refuses for rate

- **WHEN** the API answers that too many requests have been made
- **THEN** the display says the feed is rate-limited, and the next request waits at least one full
  interval

#### Scenario: An empty response

- **WHEN** the KTM feed answers with no vehicles
- **THEN** the display says the latest response was empty, and the KTM trains reported shortly
  before are still drawn with their real ages

#### Scenario: A healthy feed

- **WHEN** a feed answers with vehicles
- **THEN** the display says how many of that mode are shown

### Requirement: Live vehicles appear only while the clock follows the present

Live vehicles SHALL be shown only while the clock is following real time. While the clock is paused,
running faster than real time, or set to any other moment, live vehicles SHALL be hidden and the
display SHALL say that they are hidden and why.

A selected live vehicle SHALL cease to be selected when the clock stops following the present.

#### Scenario: Scrubbing to the morning peak

- **WHEN** the viewer moves the clock to 07:45 while buses are shown
- **THEN** every bus and KTM vehicle disappears, and the display says live vehicles are only shown at
  the present moment

#### Scenario: Returning to the present

- **WHEN** the viewer asks for the present moment again
- **THEN** live vehicles are shown again from the reports held, with their true ages, and fresh
  reports are fetched as soon as the rate allows

#### Scenario: Pausing

- **WHEN** the viewer pauses the clock
- **THEN** live vehicles are hidden, because the clock no longer shows the present

### Requirement: Feeds are fetched within the API's limits

Each live feed SHALL be requested no more than once a minute. Requests SHALL stop while the page is
hidden, while the clock is not following the present, and for a mode the viewer has switched off,
and SHALL resume, still no sooner than a minute after that feed's previous request, when all three
allow it again.

#### Scenario: A page left in a background tab

- **WHEN** the page is hidden
- **THEN** no feed is requested until it is visible again

#### Scenario: Pressing Now repeatedly

- **WHEN** the viewer leaves and returns to the present several times within a minute
- **THEN** each feed is still requested at most once in that minute

#### Scenario: Both modes switched off

- **WHEN** the viewer hides both buses and KTM
- **THEN** neither feed is requested

### Requirement: Live and scheduled vehicles cannot be mistaken for each other

Buses and KTM vehicles SHALL look different from each other and from the scheduled rail trains, so
that no live vehicle can be taken for a scheduled one or the reverse. The display SHALL state in
plain words that rail positions are scheduled and bus and KTM positions are live GPS.

#### Scenario: A bus beside an LRT train

- **WHEN** a bus is drawn near a rail train
- **THEN** the two are plainly different kinds of marker

#### Scenario: Reading what the map shows

- **WHEN** the viewer reads the explanation of the data
- **THEN** it says trains are placed by the timetable and buses and KTM by live GPS, with each fix's
  age shown

### Requirement: Buses do not overwhelm the rail network

At a zoom where the whole city is in view, bus markers SHALL remain visible without obscuring the
rail lines, stations or trains. The rail network SHALL be drawn above the buses where they overlap.

#### Scenario: The whole city in view

- **WHEN** the map is zoomed out to show all of Kuala Lumpur with over a hundred buses reporting
- **THEN** every rail line and train is still plainly visible among them

### Requirement: A live vehicle can be inspected

Pointing at a live vehicle SHALL identify it briefly, and selecting it SHALL show its mode, its route
or trip exactly as the feed identifies it, its vehicle id or label, and the age of its report. Feed
identifiers SHALL be shown as the feed gives them and labelled as such, never replaced by a guessed
name.

While a live vehicle is selected its card SHALL stay current: its age SHALL advance, a newer report
SHALL be reflected, and when the vehicle is no longer drawn the card SHALL say it has stopped
reporting rather than showing its last details as current.

#### Scenario: Pointing at a bus

- **WHEN** the pointer rests on a bus
- **THEN** its mode, route id and the age of its report are shown

#### Scenario: The selected bus goes silent

- **WHEN** the selected bus's report passes 10 minutes old
- **THEN** the card says it has stopped reporting, and since when

#### Scenario: A live vehicle beside a train

- **WHEN** one click lands on a live vehicle and a rail train together
- **THEN** the viewer is offered both, as with any other crowded pick

### Requirement: Each live mode can be hidden

The viewer SHALL be able to hide buses and KTM vehicles separately, alongside the rail lines, and
hiding a mode SHALL hide all of its vehicles and stop its feed being requested. A selected vehicle
of a hidden mode SHALL cease to be selected.

#### Scenario: Hiding buses

- **WHEN** the viewer switches buses off
- **THEN** every bus disappears, KTM and rail are unaffected, and the bus feed is not requested

#### Scenario: Hiding the selected vehicle's mode

- **WHEN** the viewer hides the mode of a selected live vehicle
- **THEN** the selection is cleared

### Requirement: Live updates do not slow the map

Receiving a feed, ageing reports and updating the counts and card SHALL NOT cause the user-interface
framework to re-render at the rate the map animates.

#### Scenario: A hundred buses and a running card

- **WHEN** over a hundred buses are drawn and a live vehicle's card is open
- **THEN** the map animates as smoothly as it does without them
