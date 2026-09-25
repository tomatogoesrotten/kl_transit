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

  python scripts/check_feed.py NEW [--against OLD] [--bus DIR [--against-bus DIR]] [--self-test]

--bus checks the three files build_bus_json.py writes (bus-routes.json,
bus-shapes.json, bus-stops.json) in DIR, on the same principle.

Exits non-zero if anything is wrong, and prints what.
"""
import argparse
import copy
import json
import math
import os
import sys

PEAK = 8 * 3600      # 08:00 on a weekday: the network should be full of trains
NIGHT = 3 * 3600     # 03:00: nothing should be running
MAX_KMH = 120.0      # no train on this network goes faster than this
MAX_SPREAD_M = 500.0 # stops sharing a name are one interchange, a walk apart at most
MIN_SPLIT_M = 100.0  # two different stations are never this close
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

    # --- station names that no longer mean one place ---------------------------
    # src/sim/places.ts groups stops into one place when, and only when, their
    # names are equal. Distance cannot do that job - a walking interchange can be
    # wider than the gap between two neighbouring stations - so these two rules
    # guard the names instead: a shared name reused across town would merge two
    # stations, and one station spelled two ways would split an interchange.
    # Measured between published coordinates in the network's flat projection,
    # the same metric as the track, never haversine.
    kx, ky = net['origin']['kx'], net['origin']['ky']
    ids = list(net['stations'])
    widest, widest_where = 0.0, 'no shared names'
    closest, closest_where = float('inf'), 'fewer than two stations'
    for i, a in enumerate(ids):
        sa = net['stations'][a]
        for b in ids[i + 1:]:
            sb = net['stations'][b]
            metres = (((sa['lon'] - sb['lon']) * kx) ** 2 + ((sa['lat'] - sb['lat']) * ky) ** 2) ** 0.5
            if sa['name'] == sb['name']:
                if metres > MAX_SPREAD_M:
                    fail.append(f"name-spread: {a} and {b} are both \"{sa['name']}\" but "
                                f"{metres:.0f} m apart, over the {MAX_SPREAD_M:.0f} m limit")
                if metres > widest:
                    widest, widest_where = metres, f"{sa['name']} {a}-{b}"
            else:
                if metres < MIN_SPLIT_M:
                    fail.append(f"name-split: {a} \"{sa['name']}\" and {b} \"{sb['name']}\" "
                                f"are {metres:.0f} m apart, under the {MIN_SPLIT_M:.0f} m minimum")
                if metres < closest:
                    closest, closest_where = metres, f"{sa['name']} {a} and {sb['name']} {b}"
    note.append(f'widest same-name spread {widest:.1f} m - {widest_where}, '
                f'{MAX_SPREAD_M - widest:.1f} m under the limit')
    note.append(f'closest differently-named stops {closest:.1f} m - {closest_where}, '
                f'{closest - MIN_SPLIT_M:.1f} m over the minimum')

    return fail, note


# --- the bus data ---------------------------------------------------------------
# The same principle: rules any correct bus timetable satisfies, no measured
# value. A bus network does lose and gain routes and stops, so rail's "fewer
# than before" would reject a real change; "under half" catches a truncated
# download without tripping on one.

BUS_FILES = {'routes': 'bus-routes.json', 'shapes': 'bus-shapes.json', 'stops': 'bus-stops.json'}

# The live feed's own limits, duplicated from src/live/feed.ts (NULL_ISLAND_DEG
# and BOX): a stop or route where the app would refuse to draw a bus is not a
# usable stop or route either. Keep the two in step.
NULL_ISLAND_DEG = 0.1
BOX = {'min_lat': 0.5, 'max_lat': 7.5, 'min_lon': 99.0, 'max_lon': 105.0}


def load_bus(folder):
    bus = {}
    for key, name in BUS_FILES.items():
        with open(os.path.join(folder, name), encoding='utf-8') as f:
            bus[key] = json.load(f)
    return bus


def bad_position(lon, lat):
    """Why a coordinate cannot be a place on this network, or None when it can."""
    def number(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if not number(lon) or not number(lat):
        return 'missing'
    if abs(lat) < NULL_ISLAND_DEG and abs(lon) < NULL_ISLAND_DEG:
        return 'null-island'
    if not (BOX['min_lat'] <= lat <= BOX['max_lat'] and BOX['min_lon'] <= lon <= BOX['max_lon']):
        return 'outside'
    return None


def check_bus(bus, old=None):
    """Returns (failures, notes) for the bus data. No failures means it is usable."""
    fail, note = [], []
    routes, stops = bus['routes'], bus['stops']
    shapes, trips = bus['shapes']['shapes'], bus['shapes']['trips']
    note.append(f'{len(routes)} bus routes, {len(stops)} stops, {len(shapes)} shapes, {len(trips)} trips')

    # --- a truncated download -------------------------------------------------
    if old is not None:
        for key in ('routes', 'stops'):
            new_n, old_n = len(bus[key]), len(old[key])
            if new_n * 2 < old_n:
                fail.append(f'bus-{key}: {new_n}, under half the {old_n} already stored')

    # --- a route nobody could name --------------------------------------------
    for rid, names in routes.items():
        short = names[0] if isinstance(names, list) and names else None
        if not isinstance(short, str) or not short.strip():
            fail.append(f'bus-route-name: route {rid} has no public name')

    # --- positions that are not on this network -------------------------------
    for row in stops:
        sid, name, lon, lat = (list(row) + [None] * 4)[:4]
        why = bad_position(lon, lat)
        if why:
            fail.append(f'bus-stop-{why}: stop {sid} "{name}" at {lon}, {lat}')
    for sid, points in shapes.items():
        if len(points) < 2:
            fail.append(f'bus-shape-points: shape {sid} has {len(points)} point(s), a route needs two')
        for i, pt in enumerate(points):
            why = bad_position(*(list(pt) + [None, None])[:2])
            if why:
                fail.append(f'bus-shape-{why}: shape {sid} point {i} at {pt}')
                break                                   # one per shape is enough to refuse it

    # --- trips that lead nowhere ----------------------------------------------
    for tid, (rid, sid) in trips.items():
        if rid not in routes:
            fail.append(f'bus-trip-route: trip {tid} names route {rid}, which is not in the data')
        if sid not in shapes:
            fail.append(f'bus-trip-shape: trip {tid} names shape {sid}, which is not in the data')

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


def same_name_pairs(net):
    """Every pair of stops sharing a name, closest first. Found in the data, never named."""
    kx, ky = net['origin']['kx'], net['origin']['ky']
    st = net['stations']
    ids = list(st)
    pairs = [(((st[a]['lon'] - st[b]['lon']) * kx) ** 2 + ((st[a]['lat'] - st[b]['lat']) * ky) ** 2, a, b)
             for i, a in enumerate(ids) for b in ids[i + 1:] if st[a]['name'] == st[b]['name']]
    return sorted(pairs)


def break_a_name_spread(net):
    _, _, b = same_name_pairs(net)[0]
    net['stations'][b]['lat'] += 5000 / net['origin']['ky']    # about 5 km north


def break_a_name_split(net):
    _, _, b = same_name_pairs(net)[0]
    net['stations'][b]['name'] += ' (renamed)'


CASES = [
    ('a line removed', break_a_line, 'lines:'),
    ('a station removed', break_a_station, 'stations:'),
    ("a line's departures emptied", break_departures, 'service:'),
    ('every train moved to mid-morning', break_the_peak, 'peak:'),
    ('a headway window stretched across the night', break_the_night, 'night:'),
    ('a journey time cut to five seconds', break_a_journey_time, 'speed:'),
    ('one stop of a shared name moved 5 km away', break_a_name_spread, 'name-spread:'),
    ('one stop of the closest same-name pair renamed', break_a_name_split, 'name-split:'),
]


def first_stop(bus):
    return bus['stops'][0]


def first_shape(bus):
    return next(iter(bus['shapes']['shapes'].values()))


def first_trip(bus):
    return next(iter(bus['shapes']['trips'].values()))


def truncate_routes(bus):
    keep = list(bus['routes'])[:(len(bus['routes']) - 1) // 2]
    bus['routes'] = {k: bus['routes'][k] for k in keep}


def truncate_stops(bus):
    del bus['stops'][(len(bus['stops']) - 1) // 2:]


def unname_a_route(bus):
    bus['routes'][next(iter(bus['routes']))][0] = ''


CASES_BUS = [
    ('bus routes cut to under half', truncate_routes, 'bus-routes:'),
    ('bus stops cut to under half', truncate_stops, 'bus-stops:'),
    ("a route's public name emptied", unname_a_route, 'bus-route-name:'),
    ("a stop's latitude removed", lambda b: first_stop(b).__setitem__(3, None), 'bus-stop-missing:'),
    ('a stop moved to 0,0', lambda b: first_stop(b).__setitem__(slice(2, 4), [0.0, 0.0]),
     'bus-stop-null-island:'),
    # 110 E is Borneo: a real place, but not one this network reaches.
    ('a stop moved to Borneo', lambda b: first_stop(b).__setitem__(slice(2, 4), [110.0, 3.0]),
     'bus-stop-outside:'),
    ("a shape point's longitude removed", lambda b: first_shape(b).__setitem__(-1, [None, 3.0]),
     'bus-shape-missing:'),
    ('a shape point moved to 0,0', lambda b: first_shape(b).__setitem__(-1, [0.0, 0.0]),
     'bus-shape-null-island:'),
    ('a shape point moved to Borneo', lambda b: first_shape(b).__setitem__(-1, [110.0, 3.0]),
     'bus-shape-outside:'),
    ('a shape cut to one point', lambda b: first_shape(b).__delitem__(slice(1, None)), 'bus-shape-points:'),
    ("a trip's route pointed at nothing", lambda b: first_trip(b).__setitem__(0, 'NO-SUCH-ROUTE'),
     'bus-trip-route:'),
    ("a trip's shape pointed at nothing", lambda b: first_trip(b).__setitem__(1, 'NO-SUCH-SHAPE'),
     'bus-trip-shape:'),
]


def self_test(data, cases=CASES, checker=check):
    """Break `data` once per case, and require that case's own check to fire."""
    print('Breaking the data on purpose, to prove each check can fail:')
    ok = True
    for name, mutate, expected in cases:
        broken = copy.deepcopy(data)
        mutate(broken)
        failures, _ = checker(broken, data)
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
    p.add_argument('--bus', metavar='DIR', help='also check the bus files build_bus_json.py wrote in DIR')
    p.add_argument('--against-bus', metavar='DIR', help='the bus files they would replace, for the count comparison')
    p.add_argument('--self-test', action='store_true', help='also prove each check fails on broken data')
    args = p.parse_args()

    with open(args.network, encoding='utf-8') as f:
        net = json.load(f)
    old = None
    if args.against:
        with open(args.against, encoding='utf-8') as f:
            old = json.load(f)

    failures = report(args.network, *check(net, old))
    proved = self_test(net) if args.self_test else True

    if args.bus:
        bus = load_bus(args.bus)
        old_bus = load_bus(args.against_bus) if args.against_bus else None
        failures += report(f'bus data in {args.bus}', *check_bus(bus, old_bus))
        if args.self_test:
            proved = self_test(bus, CASES_BUS, check_bus) and proved

    sys.exit(1 if failures or not proved else 0)


def report(what, failures, notes):
    print(f'{what}:')
    for n in notes:
        print(f'  {n}')
    for f in failures:
        print(f'  FAIL {f}')
    print('  all checks passed' if not failures else f'  {len(failures)} check(s) failed')
    return failures


if __name__ == '__main__':
    main()
