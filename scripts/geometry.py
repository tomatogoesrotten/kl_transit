"""
The flat projection and the line simplifier both data scripts share.

build_network_json.py writes these projection constants into network.json's `origin`, and
build_bus_json.py writes the same ones into bus-shapes.json, so rail and bus distances are measured
in one metric. Never swap in haversine: see CLAUDE.md.
"""
import math

import numpy as np

LAT0, LON0 = 3.12, 101.62           # local projection origin (roughly the middle of the network)
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110574.0


def to_xy(lon, lat):
    return (lon - LON0) * KX, (lat - LAT0) * KY


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
