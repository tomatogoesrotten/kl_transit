"""
GTFS (Prasarana rapid-rail-kl)  ->  compact network.json for the 3D viewer.

What it does
  1. One track shape per line (the feed's direction-1 shape is the exact reverse of direction-0).
  2. Projects every station onto its line's shape to get "metres along the track".
  3. Keeps one stop-time template per direction (weekday/Sat/Sun templates are identical in this feed).
  4. Keeps the headway windows per direction and day type (MonFri / Sat / Sun).
"""
import json, math, re, sys
import pandas as pd
import numpy as np

G = (sys.argv[1] if len(sys.argv) > 1 else 'gtfs').rstrip('/') + '/'     # folder with the unzipped GTFS .txt files
OUT = sys.argv[2] if len(sys.argv) > 2 else 'network.json'
routes = pd.read_csv(G + 'routes.txt')
trips = pd.read_csv(G + 'trips.txt')
stops = pd.read_csv(G + 'stops.txt')
st = pd.read_csv(G + 'stop_times.txt')
shapes = pd.read_csv(G + 'shapes.txt')
freq = pd.read_csv(G + 'frequencies.txt')

LAT0, LON0 = 3.12, 101.62           # local projection origin (roughly the middle of the network)
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110574.0


def to_xy(lon, lat):
    return (lon - LON0) * KX, (lat - LAT0) * KY


def secs(t):
    h, m, s = (int(x) for x in t.split(':'))
    return h * 3600 + m * 60 + s


# ---------- station names: the feed is ALL CAPS; make them readable ----------
KEEP = {'KL': 'KL', 'KLCC': 'KLCC', 'PWTC': 'PWTC', 'UPM': 'UPM', 'USJ': 'USJ', 'USJ7': 'USJ 7', 'SS': 'SS',
        'IOI': 'IOI', 'UITM': 'UiTM', 'CBP': 'CBP', 'UOB': 'UOB', 'SA': 'SA', 'SUNMED': 'SunMed',
        'REDONE': 'redONE', 'SunU-Monash': 'SunU-Monash', 'DR': 'Dr'}


def pretty(name):
    name = re.sub(r'\s+', ' ', name.strip())
    out = []
    for w in name.split(' '):
        if w in KEEP:
            out.append(KEEP[w])
        elif '-' in w and len(w) > 1:
            out.append('-'.join(KEEP.get(p, p.capitalize()) for p in w.split('-')))
        else:
            out.append(w.capitalize())
    return ' '.join(out)


# ---------- geometry helpers ----------
def rdp(pts, eps):
    """Douglas-Peucker simplification on local-metre coordinates. Returns kept indices."""
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        seg = q - p
        L = np.hypot(*seg)
        mid = pts[a + 1:b]
        if L == 0:
            d = np.hypot(*(mid - p).T)
        else:
            d = np.abs(seg[0] * (mid[:, 1] - p[1]) - seg[1] * (mid[:, 0] - p[0])) / L
        i = int(np.argmax(d))
        if d[i] > eps:
            k = a + 1 + i
            keep[k] = True
            stack += [(a, k), (k, b)]
    return np.where(keep)[0]


def project(pt, xy, cum, min_along):
    """Nearest point on the polyline at or after `min_along` metres. Returns (along, perpendicular distance)."""
    best = (None, 1e18)
    for i in range(len(xy) - 1):
        if cum[i + 1] < min_along:
            continue
        a, b = xy[i], xy[i + 1]
        ab = b - a
        L2 = float(ab @ ab)
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, float((pt - a) @ ab) / L2))
        along = cum[i] + t * math.sqrt(L2)
        if along < min_along:
            along, t = min_along, (min_along - cum[i]) / math.sqrt(L2)
        c = a + t * ab
        d = float(np.hypot(*(pt - c)))
        if d < best[1]:
            best = (along, d)
    return best


stop_info = stops.set_index('stop_id')
out = {'origin': {'lat': LAT0, 'lon': LON0, 'kx': KX, 'ky': KY}, 'generated_from': 'Prasarana GTFS static, category=rapid-rail-kl',
       'lines': []}

for _, r in routes.iterrows():
    rid = r.route_id
    rt = trips[trips.route_id == rid]
    prefix = rt.trip_id.iloc[0].split('_')[0]
    shape_id0 = rt[rt.direction_id == 0].shape_id.iloc[0]
    sp = shapes[shapes.shape_id == shape_id0].sort_values('shape_pt_sequence')
    lonlat = np.round(sp[['shape_pt_lon', 'shape_pt_lat']].values, 5)
    xy = np.array([to_xy(lo, la) for lo, la in lonlat])
    idx = rdp(xy, 2.0)
    lonlat, xy = lonlat[idx], xy[idx]
    # drop consecutive duplicates
    ok = np.r_[True, np.hypot(*np.diff(xy, axis=0).T) > 0.01]
    lonlat, xy = lonlat[ok], xy[ok]
    cum = np.r_[0, np.cumsum(np.hypot(*np.diff(xy, axis=0).T))]
    total = float(cum[-1])

    line = {'id': rid, 'code': r.route_short_name, 'name': r.route_long_name, 'mode': r.category,
            'color': '#' + r.route_color.upper(), 'length_m': round(total),
            'path': [[round(float(lo), 5), round(float(la), 5)] for lo, la in lonlat], 'directions': []}

    worst = 0
    for d in (0, 1):
        tid = f'{prefix}_MonFri_{d}'
        tt = st[st.trip_id == tid].sort_values('stop_sequence')
        t0 = secs(tt.arrival_time.iloc[0])
        stops_out, prev = [], 0.0
        order = list(tt.itertuples())
        # project on the direction-0 shape in direction-0 order, then flip for direction 1
        seq = order if d == 0 else order[::-1]
        alongs = {}
        for row in seq:
            s = stop_info.loc[row.stop_id]
            a, perp = project(np.array(to_xy(s.stop_lon, s.stop_lat)), xy, cum, prev)
            alongs[row.stop_id] = a
            prev = a
            worst = max(worst, perp)
        for row in order:
            a = alongs[row.stop_id] if d == 0 else total - alongs[row.stop_id]
            stops_out.append({'id': row.stop_id, 'arr': secs(row.arrival_time) - t0,
                              'dep': secs(row.departure_time) - t0, 'at': round(a, 1)})
        assert all(b['at'] >= a['at'] for a, b in zip(stops_out, stops_out[1:])), (rid, d, 'not monotonic')
        assert all(b['arr'] >= a['dep'] for a, b in zip(stops_out, stops_out[1:])), (rid, d, 'time order')
        hw = {}
        for svc in ('MonFri', 'Sat', 'Sun'):
            f = freq[freq.trip_id == f'{prefix}_{svc}_{d}']
            hw[svc] = [[secs(x.start_time), secs(x.end_time), int(x.headway_secs)] for x in f.itertuples()]
        line['directions'].append({'dir': d, 'to': pretty(stop_info.loc[order[-1].stop_id].stop_name).split(' - ')[0],
                                   'reversed': d == 1, 'stops': stops_out, 'headways': hw})
    print(f'{rid:4s} {r.route_long_name:24s} pts {len(sp):4d}->{len(xy):4d}  length {total/1000:5.1f} km  '
          f'stops {len(line["directions"][0]["stops"]):2d}  worst stop-to-track gap {worst:5.0f} m')
    out['lines'].append(line)

out['stations'] = {}
line_of = {s['id']: l['id'] for l in out['lines'] for s in l['directions'][0]['stops']}
for s in stops.itertuples():
    full = pretty(s.stop_name)
    out['stations'][s.stop_id] = {'name': full.split(' - ')[0], 'full': full.replace(' - ', ' – '),
                                  'lon': round(s.stop_lon, 5), 'lat': round(s.stop_lat, 5), 'line': line_of[s.stop_id]}

line_ids = {l['id'] for l in out['lines']}
bad = {v['line'] for v in out['stations'].values()} - line_ids
print('station line ids not in routes:', bad)

js = json.dumps(out, separators=(',', ':'))
open(OUT, 'w').write(js)
print(OUT, len(js) // 1024, 'KB;', len(out['stations']), 'stations')
