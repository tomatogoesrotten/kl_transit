# Spec Delta

## Purpose

Lets a person choose which moment of which service day the map is showing — the clock, how fast it
runs, which timetable it follows — and says plainly what is happening when nothing is scheduled.

## ADDED Requirements

### Requirement: The clock shows Kuala Lumpur time

The display SHALL show the time of day, the date, and which timetable is in force, all in Kuala
Lumpur terms, regardless of where the viewer is or how their computer is configured.

#### Scenario: A viewer outside Malaysia

- **WHEN** the page is opened on a machine set to another time zone
- **THEN** the clock and date shown are Kuala Lumpur's, not the machine's

#### Scenario: The timetable in force

- **WHEN** any moment is shown
- **THEN** the display names the timetable being used to compute it

### Requirement: The clock runs, and can be stopped and hurried

The viewer SHALL be able to follow the present moment, to stop the clock, to restart it, and to run
it faster than real time.

These SHALL behave as one setting with one mode at a time, so that the display can never claim to be
following the present moment while also running at a multiple of real speed, or be stopped and
running at once.

#### Scenario: Following the present

- **WHEN** the viewer asks for the present moment
- **THEN** the clock tracks real Kuala Lumpur time, and the display says that is what it is doing

#### Scenario: Stopping

- **WHEN** the viewer stops the clock
- **THEN** time ceases to advance, the trains hold their positions, and the display says it is
  stopped

#### Scenario: Restarting after stopping

- **WHEN** the viewer restarts a stopped clock
- **THEN** it continues from where it was stopped at the speed it was set to, rather than jumping
  back to the present moment

#### Scenario: Running faster than real time

- **WHEN** the viewer chooses a speed greater than real time
- **THEN** the clock advances at that multiple, the display says so, and it is no longer following
  the present moment

#### Scenario: Returning to the present

- **WHEN** the viewer asks for the present moment after any other state
- **THEN** the clock follows real time again, at real speed, with the timetable chosen by date

### Requirement: Any moment of the day can be chosen directly

The viewer SHALL be able to move directly to any time of day, and the control offering this SHALL
show the current time when they are not using it.

Moving to a moment SHALL NOT change which day it is, so that a viewer exploring one service day
stays within it.

#### Scenario: Moving to the morning peak

- **WHEN** the viewer moves the control to a morning time
- **THEN** the map shows that moment, and the clock is no longer following the present

#### Scenario: The control while the clock runs

- **WHEN** the clock is running and the viewer is not touching the control
- **THEN** the control follows the time

#### Scenario: Using the control while the clock runs

- **WHEN** the viewer is moving the control while the clock is running
- **THEN** the control stays where they put it and does not jump back under them

#### Scenario: Moving the control while stopped

- **WHEN** the clock is stopped and the viewer moves the control
- **THEN** the moment changes and the clock remains stopped

### Requirement: The timetable can be chosen instead of derived

The viewer SHALL be able to force a weekday, Saturday or Sunday timetable rather than the one the
date implies, and SHALL be able to return to deriving it from the date.

A forced timetable SHALL apply to the service that carried over from the previous day as well as to
the current one, so that trains running after midnight come from the same timetable as the rest.

#### Scenario: Forcing a Sunday timetable on a weekday

- **WHEN** the viewer forces the Sunday timetable
- **THEN** the trains shown are those the Sunday timetable implies, and the display says Sunday
  while the date still says what day it really is

#### Scenario: After midnight under a forced timetable

- **WHEN** a forced timetable is in effect and the moment shown is shortly after midnight
- **THEN** the trains carried over from the previous day also come from the forced timetable

### Requirement: The display says when nothing is running

When no trains are scheduled at the moment shown, the display SHALL say so plainly, SHALL say when
the first trains of that timetable leave, and SHALL offer to move to a time when service is running.

An empty map with no explanation is indistinguishable from a broken one.

#### Scenario: The small hours

- **WHEN** the moment shown is one at which nothing runs
- **THEN** the display says nothing is scheduled, says when the first trains leave, and offers to
  move to the morning peak

#### Scenario: Taking the offer

- **WHEN** the viewer accepts the offer to move
- **THEN** the map shows the morning peak with service running, and the clock is not left stopped

#### Scenario: A timetable with no service at all

- **WHEN** the timetable in force has no service at any hour
- **THEN** the display says that, rather than naming a first departure that does not exist

### Requirement: The display says positions are scheduled, not observed

The display SHALL state, in plain language and without the viewer having to look for it, that train
positions are calculated from a published timetable and are not a live feed of where trains actually
are.

#### Scenario: A viewer forms an impression of what they are seeing

- **WHEN** the map is on screen with trains moving
- **THEN** a plainly worded statement that positions come from the schedule rather than from
  tracking is visible

### Requirement: The controls work by hand, by touch and by keyboard

Every control SHALL be operable with a mouse, with a finger, and by keyboard, and SHALL be legible
and usable at the width of a phone screen. The state of each control SHALL be apparent without
interacting with it.

#### Scenario: On a phone

- **WHEN** the page is viewed at phone width
- **THEN** every control is reachable and usable, and nothing overlaps the map's other controls or
  its attribution

#### Scenario: By keyboard alone

- **WHEN** the viewer navigates with a keyboard
- **THEN** every control can be reached and operated, and the focused control is visibly marked

#### Scenario: With a screen reader

- **WHEN** the viewer moves to the time-of-day control with a screen reader
- **THEN** the current value is announced as a time of day rather than as a count of seconds

### Requirement: Moving the clock does not slow the map

Updating what the controls display SHALL NOT cause the map to be redrawn or the application's
user-interface framework to re-render at the rate the map animates.

#### Scenario: The clock running at the highest speed

- **WHEN** the clock runs at its fastest setting
- **THEN** the map continues to animate smoothly, and the controls update at a rate a person can
  read rather than at the rate of animation
