"""
GTFS (Prasarana rapid-bus-kl)  ->  the three bus data files the app loads.

  python scripts/build_bus_json.py FEED_DIR OUT_DIR

Writes, into OUT_DIR:
  bus-routes.json  route id -> [short name, long name]. Small; bundled, so route numbers show at once.
  bus-shapes.json  the flat projection, every route shape simplified to 5 m, and trip id -> shape id.
                   Fetched after the map has drawn; buses are moved along these (issue #43).
  bus-stops.json   [[stop id, name, lon, lat], ...]. Fetched only when the bus view is first opened.

Every column is read as text: stop ids look like numbers but are identifiers, and a route whose
short name is "300" must stay the string "300". Names are kept as published (ALL CAPS); the rail
script's prettifier is tuned to station names and would get street names wrong silently.

The trip-to-shape table is shipped rather than parsed out of the trip id. Today's ids spell their
shape (`weekday_U6000_U600001_9`), but nobody promised that.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

from geometry import LAT0, LON0, KX, KY, to_xy, rdp    # the same projection as network.json

SIMPLIFY_M = 5.0    # a bus drawn within 5 m of its road is on its road; keeps the file about 1/3 the size


def read(feed, name):
    # keep_default_na=False: an empty field stays "", so a missing name is visible, never NaN.
    return pd.read_csv(os.path.join(feed, name), dtype=str, keep_default_na=False)


def simplify(points):
    """One shape's [lon, lat] points, in sequence order -> simplified, rounded to 5 decimals."""
    lonlat = np.round(points, 5)
    xy = np.array([to_xy(lo, la) for lo, la in lonlat])
    idx = rdp(xy, SIMPLIFY_M)
    lonlat, xy = lonlat[idx], xy[idx]
    ok = np.r_[True, np.hypot(*np.diff(xy, axis=0).T) > 0.01]    # drop consecutive duplicates
    return [[round(float(lo), 5), round(float(la), 5)] for lo, la in lonlat[ok]]


def main(feed, out_dir):
    routes = read(feed, 'routes.txt')
    trips = read(feed, 'trips.txt')
    stops = read(feed, 'stops.txt')
    shapes = read(feed, 'shapes.txt')

    route_names = {r.route_id: [r.route_short_name, r.route_long_name] for r in routes.itertuples()}

    shapes['seq'] = shapes.shape_pt_sequence.astype(int)
    shapes = shapes.sort_values(['shape_id', 'seq'])
    simplified, raw_points = {}, 0
    for sid, pts in shapes.groupby('shape_id', sort=True):
        ll = pts[['shape_pt_lon', 'shape_pt_lat']].astype(float).values
        raw_points += len(ll)
        simplified[sid] = simplify(ll)
    trip_shape = {t.trip_id: t.shape_id for t in trips.itertuples()}
    shape_file = {'origin': {'lat': LAT0, 'lon': LON0, 'kx': KX, 'ky': KY},
                  'generated_from': 'Prasarana GTFS static, category=rapid-bus-kl',
                  'shapes': simplified, 'trips': trip_shape}

    stop_rows = [[s.stop_id, s.stop_name, round(float(s.stop_lon), 5), round(float(s.stop_lat), 5)]
                 for s in stops.itertuples()]

    for name, data in (('bus-routes.json', route_names), ('bus-shapes.json', shape_file),
                       ('bus-stops.json', stop_rows)):
        js = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8', newline='\n') as f:
            f.write(js)
        print(f'{name:16s} {len(js.encode("utf-8")) / 1024:6.1f} KB')
    kept = sum(len(p) for p in simplified.values())
    print(f'{len(route_names)} routes, {len(stop_rows)} stops, {len(simplified)} shapes '
          f'({raw_points} points -> {kept} at {SIMPLIFY_M:g} m), {len(trip_shape)} trips')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: build_bus_json.py FEED_DIR OUT_DIR')
    main(sys.argv[1], sys.argv[2])
