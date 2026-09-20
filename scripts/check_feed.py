"""
Does a rebuilt network.json describe a working railway?

This is NOT the unit test suite. `npm test` asserts values measured from the
shipped feed - Ampang is 14,892.7 m, 196 trains run at the weekday peak - and
those numbers are the point of it: they caught a mirrored station layout and a
bearing off by a reflection. But they are pinned to one snapshot, so a
legitimate timetable change turns them red, and a person is meant to look at
what moved and update them.

These checks are the other kind. They are rules any correct timetable
satisfies, so the daily refresh can run them unattended without ever being
tempted to loosen them. Nothing here asserts a distance, a count or a duration
measured from the current data.

  python scripts/check_feed.py NEW [--against OLD] [--self-test]

Exits non-zero if anything is wrong, and prints what.
"""
import argparse
import copy
import json
import sys

PEAK = 8 * 3600      # 08:00 on a weekday: the network should be full of trains
NIGHT = 3 * 3600     # 03:00: nothing should be running
MAX_KMH = 120.0      # no train on this network goes faster than this
DAY = 86400
DAY_TYPES = ('MonFri', 'Sat', 'Sun')


def departures(windows):
    """Headway windows -> the departure seconds they mean. End-exclusive."""
    return [t for start, end, headway in windows for t in range(start, end, headway)]


def running(net, now, day_type):
    """How many trains are somewhere on the network `now` seconds after midnight.

    A train that left before midnight is still running on yesterday's timetable,
    so departures are counted a day back as well. Yesterday is treated as the
    same day type, which is true on the days this matters (a weekday after a
    weekday) and only ever makes the night check stricter.
    """
    n = 0
    for line in net['lines']:
        for d in line['directions']:
            duration = d['stops'][-1]['dep']
            deps = departures(d['headways'].get(day_type, []))
            for shift in (0, DAY):
                n += sum(1 for dep in deps if 0 <= now + shift - dep < duration)
    return n


def check(net, old=None):
    """Returns (failures, notes). No failures means the feed is usable."""
    fail, note = [], []

    # --- a truncated download -------------------------------------------------
    lines, stations = len(net['lines']), len(net['stations'])
    note.append(f'{lines} lines, {stations} stations')
    if old is not None:
        if lines < len(old['lines']):
            fail.append(f"lines: {lines}, fewer than the {len(old['lines'])} already stored")
        if stations < len(old['stations']):
            fail.append(f"stations: {stations}, fewer than the {len(old['stations'])} already stored")

    # --- a partial parse ------------------------------------------------------
    for line in net['lines']:
        if len(line['directions']) != 2:
            fail.append(f"service: {line['id']} has {len(line['directions'])} directions, expected 2")
        for d in line['directions']:
            if len(d['stops']) < 2:
                fail.append(f"service: {line['id']} direction {d['dir']} has {len(d['stops'])} stops")
            for svc in DAY_TYPES:
                if not departures(d['headways'].get(svc, [])):
                    fail.append(f"service: {line['id']} direction {d['dir']} has no {svc} departures")

    # --- a feed that produces nothing, or produces it at the wrong time --------
    peak = running(net, PEAK, 'MonFri')
    note.append(f'{peak} trains running at 08:00 on a weekday')
    if peak == 0:
        fail.append('peak: no trains running at 08:00 on a weekday')

    night = running(net, NIGHT, 'MonFri')
    if night:
        fail.append(f'night: {night} trains running at 03:00, when nothing is scheduled')
    else:
        note.append('nothing running at 03:00')

    # --- mangled coordinates or times -----------------------------------------
    # Measured from the timetable, never from the drawn position. The animation
    # eases between stops and that easing peaks at 1.5x the average speed of the
    # run, so the fastest legitimate segment in this feed (about 90 km/h) is
    # drawn at about 135 km/h. A check on the drawn position would reject a
    # perfectly good timetable, and a check that cries wolf gets switched off.
    fastest, where = 0.0, 'nothing'
    for line in net['lines']:
        for d in line['directions']:
            for a, b in zip(d['stops'], d['stops'][1:]):
                metres = abs(b['at'] - a['at'])
                seconds = b['arr'] - a['dep']
                if seconds <= 0:
                    if metres > 0:
                        fail.append(f"speed: {line['id']} {a['id']}->{b['id']} covers "
                                    f"{metres:.0f} m in no time at all")
                    continue
                kmh = metres / seconds * 3.6
                if kmh > fastest:
                    fastest = kmh
                    where = f"{line['id']} {a['id']}->{b['id']} ({metres:.0f} m in {seconds} s)"
    if fastest > MAX_KMH:
        fail.append(f'speed: {where} is {fastest:.1f} km/h, over the {MAX_KMH:.0f} km/h limit')
    note.append(f'fastest timetabled segment {fastest:.1f} km/h - {where}, '
                f'{MAX_KMH - fastest:.1f} km/h under the limit')

    return fail, note


# --- proving the checks can fail ------------------------------------------------
# A check nobody has seen fail is not a check. Each case below breaks the feed in
# one way and names the check that must notice it.

def break_a_line(net):
    net['lines'].pop()


def break_a_station(net):
    del net['stations'][next(iter(net['stations']))]


def break_departures(net):
    net['lines'][0]['directions'][0]['headways']['MonFri'] = []


def break_the_peak(net):
    for line in net['lines']:
        for d in line['directions']:
            d['headways']['MonFri'] = [[36000, 39600, 300]]   # 10:00 to 11:00 only


def break_the_night(net):
    net['lines'][0]['directions'][0]['headways']['MonFri'] = [[0, DAY, 300]]


def break_a_journey_time(net):
    s = net['lines'][0]['directions'][0]['stops']
    s[1]['arr'] = s[0]['dep'] + 5                             # a kilometre or so in five seconds
    s[1]['dep'] = s[1]['arr']


CASES = [
    ('a line removed', break_a_line, 'lines:'),
    ('a station removed', break_a_station, 'stations:'),
    ("a line's departures emptied", break_departures, 'service:'),
    ('every train moved to mid-morning', break_the_peak, 'peak:'),
    ('a headway window stretched across the night', break_the_night, 'night:'),
    ('a journey time cut to five seconds', break_a_journey_time, 'speed:'),
]


def self_test(net):
    print('Breaking the data on purpose, to prove each check can fail:')
    ok = True
    for name, mutate, expected in CASES:
        broken = copy.deepcopy(net)
        mutate(broken)
        failures, _ = check(broken, net)
        caught = [f for f in failures if f.startswith(expected)]
        if caught:
            print(f'  caught  {name}\n            -> {caught[0]}')
        else:
            ok = False
            print(f'  MISSED  {name}: nothing matching "{expected}" was reported')
    return ok


def main():
    p = argparse.ArgumentParser(description='Check a built network.json describes a working railway.')
    p.add_argument('network', help='the network.json to check')
    p.add_argument('--against', help='the network.json it would replace, for the count comparison')
    p.add_argument('--self-test', action='store_true', help='also prove each check fails on broken data')
    args = p.parse_args()

    with open(args.network, encoding='utf-8') as f:
        net = json.load(f)
    old = None
    if args.against:
        with open(args.against, encoding='utf-8') as f:
            old = json.load(f)

    failures, notes = check(net, old)
    print(f'{args.network}:')
    for n in notes:
        print(f'  {n}')
    for f in failures:
        print(f'  FAIL {f}')
    print('  all checks passed' if not failures else f'  {len(failures)} check(s) failed')

    proved = self_test(net) if args.self_test else True
    sys.exit(1 if failures or not proved else 0)


if __name__ == '__main__':
    main()
