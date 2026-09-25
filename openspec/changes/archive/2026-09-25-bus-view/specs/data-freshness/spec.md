# Spec Delta

## MODIFIED Requirements

### Requirement: The viewer can find out what the data does not cover

The application SHALL provide, in plain language and reachable from the map, an explanation of where
its data comes from and what it does not know.

It SHALL state that positions are computed from a published timetable rather than observed; that
track height is not in the feed and has been assumed; that service before the morning peak appears
thinner than reality because every trip begins at a terminal; that public holidays are treated as
ordinary days; that lines sharing track are drawn apart by convention; and that a station serving
several lines appears once per line.

For buses it SHALL also state: that a bus is moved along its published route between
GPS reports at a speed measured from its own reports, that this is an estimate which stops after a
stated time, and that a bus off its route or on a trip the timetable does not know is shown at its
report instead; that the bus feed refreshes about once a minute; and that bus stops and route numbers
come from the published bus timetable, refreshed daily.

#### Scenario: A viewer wonders whether this is live

- **WHEN** a viewer looks for where the data comes from
- **THEN** they find a plain statement that it is a published schedule, not a live feed

#### Scenario: A viewer notices something odd

- **WHEN** a viewer notices trains passing through buildings, or an empty map at half past six
- **THEN** the explanation covers it, rather than leaving them to conclude the app is broken

#### Scenario: A viewer sees a bus stand still, then carry on

- **WHEN** a viewer sees a bus stop for a while and then move on, or jump
- **THEN** the explanation says bus positions there are estimates corrected by each report, which is
  why they pause or jump

## ADDED Requirements

### Requirement: The bus data is refreshed and checked with the timetable

The bus stops, route names and route shapes SHALL be rebuilt from the official published bus timetable
by the same scheduled refresh as the rail timetable, and recorded only when they change. Before they
are accepted they SHALL pass checks that any correct bus timetable satisfies, which name no count,
distance or other value measured from the current snapshot. At least these SHALL be refused, with the
existing data kept and the failure reported:

- far fewer routes or stops than the data being replaced, as a truncated download would give;
- a stop or shape point that is missing a coordinate, lies at or near 0,0, or lies outside Peninsular
  Malaysia;
- a route with no public name;
- a trip whose route or shape is not in the data;
- a shape with fewer than two points.

Every one of these checks SHALL be shown, on every run, to fail on data broken to trigger it.

#### Scenario: A truncated bus download

- **WHEN** the refreshed bus data has under half the stops of the data it would replace
- **THEN** it is refused, the existing bus data is kept, and the failure is reported

#### Scenario: A stop at null island

- **WHEN** a stop in the refreshed bus data lies at 0,0
- **THEN** it is refused and the failure names the stop

#### Scenario: A legitimate change in the bus network

- **WHEN** a route is added, a route withdrawn or stops are moved in the published bus timetable
- **THEN** the checks still pass and the new data is recorded

#### Scenario: Proving the checks

- **WHEN** the refresh runs
- **THEN** its log shows each bus check catching data deliberately broken to trigger it
