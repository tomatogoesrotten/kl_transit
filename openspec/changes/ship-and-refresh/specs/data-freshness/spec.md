# Spec Delta

## Purpose

Keeps the timetable current without letting a broken or truncated feed reach the site, and tells a
viewer plainly what the data does and does not cover.

## ADDED Requirements

### Requirement: The timetable is refreshed without a person doing it

The published timetable SHALL be fetched and rebuilt on a schedule, at a time of day when no service
is running, so that a change to the timetable reaches the site without anyone remembering to do it.

The refreshed data SHALL be recorded only when it differs from what is already there, so that an
unchanged feed leaves no trace.

#### Scenario: The timetable has changed

- **WHEN** the scheduled refresh runs and the published timetable differs from the stored one
- **THEN** the stored timetable is updated

#### Scenario: The timetable has not changed

- **WHEN** the scheduled refresh runs and the published timetable is the same
- **THEN** nothing is recorded

### Requirement: A broken feed is refused, loudly

Refreshed data SHALL be checked before it is accepted, and SHALL be rejected — with the failure made
visible rather than silent — if it is smaller, emptier or less plausible than what it replaces.

Refusing SHALL leave the existing data in place. A site drawing a month-old timetable is honest
about being a schedule; a site drawing half a network is not.

#### Scenario: The feed has fewer lines or stations

- **WHEN** refreshed data contains fewer lines or fewer stations than the data it would replace
- **THEN** it is refused, the existing data is kept, and the failure is reported

#### Scenario: A line has no service

- **WHEN** a line in the refreshed data has no departures, or is missing a day type it should have
- **THEN** the refresh is refused and the failure is reported

#### Scenario: The network is empty when it should be busy

- **WHEN** the refreshed data implies no trains running at a weekday morning peak
- **THEN** the refresh is refused

#### Scenario: The network is busy when it should be empty

- **WHEN** the refreshed data implies trains running in the middle of the night
- **THEN** the refresh is refused

#### Scenario: A journey is impossibly fast

- **WHEN** the refreshed data schedules a journey between two stops faster than any train on this
  network travels
- **THEN** the refresh is refused

### Requirement: The checks describe any valid feed, not this one

The checks applied to refreshed data SHALL be expressed as rules that any correct timetable
satisfies, and SHALL NOT assert particular distances, counts or durations measured from the current
snapshot.

The project's other tests do assert those measured values, deliberately, and are pinned to the
stored snapshot. When a refresh changes them, they SHALL be updated by a person who has looked, not
relaxed so that a refresh can pass them.

#### Scenario: A legitimate timetable change

- **WHEN** the published timetable legitimately changes a journey time or adds a station
- **THEN** the refresh checks still pass, because they assert no specific value

#### Scenario: The pinned tests after a refresh

- **WHEN** refreshed data has been accepted and the tests pinned to the snapshot no longer match
- **THEN** that is understood as the timetable having changed, and is resolved by a person updating
  them rather than by the checks being loosened

### Requirement: A check must not fail on correct data

A check SHALL measure the quantity it is about. In particular, a limit on how fast a train travels
SHALL be measured against the timetable and SHALL NOT be measured against the animated position,
which is eased between stops and therefore exceeds the average speed of the journey it is drawing.

A check that rejects valid data is worse than no check, because it will be switched off.

#### Scenario: The fastest legitimate journey in the feed

- **WHEN** the checks are applied to a timetable containing its fastest real journey
- **THEN** they pass, notwithstanding that the drawn train momentarily appears to exceed that speed

### Requirement: The site is published at an address that can be shared

The application SHALL be built and served as a static site at a public address, and the settings
needed to build it SHALL live in the repository rather than only in a hosting provider's
configuration.

#### Scenario: Someone is sent the link

- **WHEN** a person opens the published address
- **THEN** they see the map, with trains running to the timetable

#### Scenario: The site is rebuilt elsewhere

- **WHEN** the site is built by someone other than its author, or on another provider
- **THEN** the build succeeds using settings recorded in the repository

### Requirement: The viewer can find out what the data does not cover

The application SHALL provide, in plain language and reachable from the map, an explanation of where
its data comes from and what it does not know.

It SHALL state that positions are computed from a published timetable rather than observed; that
track height is not in the feed and has been assumed; that service before the morning peak appears
thinner than reality because every trip begins at a terminal; that public holidays are treated as
ordinary days; that lines sharing track are drawn apart by convention; and that a station serving
several lines appears once per line.

#### Scenario: A viewer wonders whether this is live

- **WHEN** a viewer looks for where the data comes from
- **THEN** they find a plain statement that it is a published schedule, not a live feed

#### Scenario: A viewer notices something odd

- **WHEN** a viewer notices trains passing through buildings, or an empty map at half past six
- **THEN** the explanation covers it, rather than leaving them to conclude the app is broken

### Requirement: The data's source and licence are credited

The application and its repository SHALL credit the sources of the data and the map, on the terms
those sources require, and SHALL state that the project is unofficial and not connected to the
operator.

#### Scenario: Meeting the data licence

- **WHEN** the credits are shown
- **THEN** the timetable's publisher and its licence are named, as that licence requires

#### Scenario: Operator branding

- **WHEN** the application presents lines and stations
- **THEN** it uses no operator logo, emblem or official symbol, which the licence does not grant and
  which an unofficial project has no claim to
