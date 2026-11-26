"""Lakhey mask (original design, built procedurally; no image is traced or projected).

Shell: a broad superellipsoid MASK (flat forehead/face planes, square jaw, sides that fall back
sharply), parametrised by (theta, phi), displaced along its normal by sculpted forms.
Face-space design coordinates are the TRUE FRONT PROJECTION of the base surface:
    s = x            (+ = character's left)
    t = z - Z0       (height above the mask centre)
so contour lines can follow the mask outline and stay symmetric.
One design (design()) drives BOTH the geometry (sculpt + paint relief) and the 2048 paint.
UVs are the (theta, phi) parameters -> the paint needs no bake; the high-poly is baked to a
tangent normal map, AO is baked on the low poly and also multiplied into the base colour.
Real geometry: lip band (clean swept bevel around the grin), teeth row, two tusks rising from
the lower corners, almond eye domes (painted matte pupils), third eye (green + gold rings),
ear ornaments (green ring + gold centre), golden teardrop on the nose.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import common as C

# ---------------------------------------------------------------- frame (fits the MPFB head)
Z0 = 1.636            # mask centre height
CY = -0.012           # mask centre depth (front is -Y)
A_SIDE, B_DEPTH, C_UP, C_DN = 0.150, 0.150, 0.196, 0.180
TH = math.radians(104)                 # shell spans theta in [-TH, TH] (open at the back; hair covers)
PH_LO, PH_HI = math.radians(-66), math.radians(84)
U_SHELL = 0.94                         # shell UVs use u in [0, U_SHELL]; the column right of it holds swatches
TEX = 2048


def srgb(r, g, b):
    c = np.array([r, g, b], dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


COL = {
    "red": srgb(138, 8, 13), "red_dark": srgb(88, 6, 9), "cavity": srgb(40, 6, 8),
    "lip": srgb(150, 22, 30), "white": srgb(238, 232, 218), "black": srgb(14, 11, 11),
    "orange": srgb(238, 92, 6), "orange_deep": srgb(214, 52, 4), "flame_tip": srgb(246, 158, 18), "yellow": srgb(246, 188, 46), "gold": srgb(222, 160, 44),
    "green": srgb(16, 112, 72), "teal": srgb(18, 132, 124), "blue": srgb(28, 46, 120),
    "ivory": srgb(236, 228, 206), "wood": srgb(150, 62, 40), "eyewhite": srgb(238, 236, 226),
    "iris": srgb(60, 30, 12),
}
SWATCH_ROWS = {"ivory": 0, "green": 1, "gold": 2, "eye": 3, "black": 4, "lip": 5}
SWATCH_ROUGH = {"ivory": 0.38, "green": 0.24, "gold": 0.3, "eye": 0.3, "black": 0.35, "lip": 0.26}
N_SWATCH = 8


# ---------------------------------------------------------------- parametrisation
def warp(x):
    return 0.55 * x + 0.45 * x ** 3


def inv_warp(w):
    x = np.clip(np.asarray(w, dtype=np.float64), -1.2, 1.2)
    for _ in range(30):
        x = x - (warp(x) - w) / (0.55 + 1.35 * x * x)
    return x


PH_MID, PH_HALF = (PH_HI + PH_LO) / 2, (PH_HI - PH_LO) / 2


def uv_to_angles(u, v):
    """u, v in [-1, 1] -> theta, phi (denser sampling at the front)."""
    return TH * warp(u), PH_MID + PH_HALF * warp(v)


def ss(e0, e1, x):
    return C.smoothstep(e0, e1, x)


def _base(theta, phi):
    """Superellipsoid mask: radius along the direction (theta, phi) from the centre."""
    theta = np.asarray(theta, dtype=np.float64)
    phi = np.asarray(phi, dtype=np.float64)
    cp = np.cos(phi)
    dx, dy, dz = cp * np.sin(theta), -cp * np.cos(theta), np.sin(phi)
    # wide cheekbones/jaw, narrower crown; squarer jaw (higher exponent low down)
    A = A_SIDE * (1.0 + 0.085 * np.exp(-((dz + 0.30) / 0.38) ** 2) - 0.16 * ss(0.30, 0.95, dz))
    Cz = np.where(dz > 0, C_UP, C_DN)
    n = 3.5 + 0.7 * ss(-0.15, -0.75, dz)
    # the back half is deeper and rounder (hidden under the hair)
    B = np.where(dy < 0, B_DEPTH, B_DEPTH * 1.05)
    r = (np.abs(dx / A) ** n + np.abs(dy / B) ** n + np.abs(dz / Cz) ** n) ** (-1.0 / n)
    return np.stack([r * dx, CY + r * dy, Z0 + r * dz], -1)


def ellipsoid(theta, phi):
    """Base surface point + (numerical) outward normal."""
    P = _base(theta, phi)
    e = 1e-4
    dt = _base(theta + e, phi) - _base(theta - e, phi)
    dp = _base(theta, phi + e) - _base(theta, phi - e)
    N = np.cross(dt, dp)
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-12)
    out = P - np.array([0, CY, Z0])
    N *= np.sign(np.sum(N * out, axis=-1, keepdims=True) + 1e-12)
    return P, N


def st_of(theta, phi):
    P = _base(theta, phi)
    return P[..., 0], P[..., 2] - Z0


def angles_of_st(s, t):
    """Invert the front projection (Newton); valid on the front-facing part of the mask."""
    s = np.atleast_1d(np.asarray(s, dtype=np.float64))
    t = np.atleast_1d(np.asarray(t, dtype=np.float64))
    th = np.arctan2(s, B_DEPTH)
    ph = np.arcsin(np.clip(t / 0.21, -0.99, 0.99))
    e = 1e-5
    for _ in range(40):
        P = _base(th, ph)
        fx, fz = P[..., 0] - s, P[..., 2] - Z0 - t
        Pt = _base(th + e, ph)
        Pp = _base(th, ph + e)
        a, b = (Pt[..., 0] - P[..., 0]) / e, (Pp[..., 0] - P[..., 0]) / e
        c, d = (Pt[..., 2] - P[..., 2]) / e, (Pp[..., 2] - P[..., 2]) / e
        det = a * d - b * c
        det = np.where(np.abs(det) < 1e-9, 1e-9, det)
        dth = (d * fx - b * fz) / det
        dph = (-c * fx + a * fz) / det
        th = np.clip(th - np.clip(dth, -0.2, 0.2), -TH, TH)
        ph = np.clip(ph - np.clip(dph, -0.2, 0.2), PH_LO, PH_HI)
    return th, ph


def _outline():
    """Front-view silhouette of the base mask: half-width x_max(t)."""
    th = np.linspace(0, TH, 400)
    ph = np.linspace(PH_LO, PH_HI, 600)
    TT, PP = np.meshgrid(th, ph)
    P = _base(TT, PP)
    tz = P[..., 2] - Z0
    bins = np.linspace(tz.min(), tz.max(), 160)
    xs = np.zeros(len(bins) - 1)
    for i in range(len(bins) - 1):
        m = (tz >= bins[i]) & (tz < bins[i + 1])
        xs[i] = P[..., 0][m].max() if m.any() else 0
    return (bins[:-1] + bins[1:]) / 2, xs


OUT_T, OUT_X = _outline()


def _face_loop(turn_deg=52.0, bins=180):
    """Closed loop where the front planes turn away (normal > turn_deg from -Y): the face border."""
    th = np.linspace(-TH, TH, 420)
    ph = np.linspace(PH_LO, PH_HI, 420)
    TT, PP = np.meshgrid(th, ph)
    P, N = ellipsoid(TT, PP)
    m = N[..., 1] < -math.cos(math.radians(turn_deg))
    S, T = P[..., 0][m], P[..., 2][m] - Z0
    ang = np.arctan2(T, S)
    rad = np.hypot(S, T)
    edges = np.linspace(-np.pi, np.pi, bins + 1)
    r = np.full(bins, np.nan)
    for i in range(bins):
        k = (ang >= edges[i]) & (ang < edges[i + 1])
        if k.any():
            r[i] = rad[k].max()
    good = ~np.isnan(r)
    a = (edges[:-1] + edges[1:]) / 2
    r = np.interp(a, a[good], r[good], period=2 * np.pi)
    for _ in range(4):
        r = 0.25 * np.roll(r, 1) + 0.5 * r + 0.25 * np.roll(r, -1)
    r = 0.5 * (r + np.interp(np.pi - a, a, r, period=2 * np.pi))      # exactly symmetric
    return np.stack([r * np.cos(a), r * np.sin(a)], -1)


def half_width(t):
    return np.interp(t, OUT_T, OUT_X)


def face_contour(inset, a0_deg, a1_deg, n=60):
    """Part of the face border, `inset` metres inside it, between polar angles a0 -> a1 (degrees)."""
    loop = FACE_LOOP - loop_normals(FACE_LOOP) * inset
    a = np.degrees(np.arctan2(loop[:, 1], loop[:, 0]))
    order = np.argsort(a)
    a, loop = a[order], loop[order]
    want = np.linspace(a0_deg, a1_deg, n)
    return np.stack([np.interp(want, a, loop[:, 0]), np.interp(want, a, loop[:, 1])], -1)


# ---------------------------------------------------------------- 2D shape helpers (vectorised)
def gauss(S, T, cs, ct, rs, rt=None):
    rt = rs if rt is None else rt
    return np.exp(-((S - cs) / rs) ** 2 - ((T - ct) / rt) ** 2)


def ell_sd(S, T, cs, ct, rs, rt):
    k = np.sqrt(((S - cs) / rs) ** 2 + ((T - ct) / rt) ** 2)
    return (k - 1.0) * min(rs, rt)


def polyline_dist(S, T, pts):
    """Distance to a polyline + normalised arc parameter of the closest point."""
    pts = np.asarray(pts, dtype=np.float64)
    seg = pts[1:] - pts[:-1]
    seglen = np.linalg.norm(seg, axis=1)
    cum = np.concatenate([[0], np.cumsum(seglen)])
    total = max(cum[-1], 1e-9)
    best = np.full(S.shape, 1e9)
    par = np.zeros(S.shape)
    for i in range(len(seg)):
        a = pts[i]
        d = seg[i]
        L2 = max(seglen[i] ** 2, 1e-12)
        tt = np.clip(((S - a[0]) * d[0] + (T - a[1]) * d[1]) / L2, 0, 1)
        ds = np.hypot(S - (a[0] + tt * d[0]), T - (a[1] + tt * d[1]))
        m = ds < best
        best = np.where(m, ds, best)
        par = np.where(m, (cum[i] + tt * seglen[i]) / total, par)
    return best, par


def inside_polygon(S, T, poly):
    """Even-odd test against a closed polygon (last point == first point not required)."""
    poly = np.asarray(poly)
    x0, y0 = poly[:, 0], poly[:, 1]
    x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
    inside = np.zeros(S.shape, dtype=bool)
    for i in range(len(poly)):
        cond = (y0[i] > T) != (y1[i] > T)
        xint = x0[i] + (T - y0[i]) * (x1[i] - x0[i]) / (y1[i] - y0[i] + 1e-12)
        inside ^= cond & (S < xint)
    return inside


def bezier(p0, p1, p2, p3=None, n=24):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(np.asarray, (p0, p1, p2))
    if p3 is None:
        return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
    p3 = np.asarray(p3)
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3


def spiral(center, r0, r1, a0, a1, n=40, sx=1.0, st=1.0):
    a = np.linspace(a0, a1, n)
    r = np.linspace(r0, r1, n)
    return np.stack([center[0] + sx * r * np.cos(a), center[1] + st * r * np.sin(a)], -1)


def mirror(pts):
    q = np.array(pts, dtype=np.float64).copy()
    q[:, 0] *= -1
    return q


def chaikin(loop, iterations=4):
    p = np.asarray(loop, dtype=np.float64)
    for _ in range(iterations):
        q = np.roll(p, -1, axis=0)
        p = np.stack([0.75 * p + 0.25 * q, 0.25 * p + 0.75 * q], 1).reshape(-1, 2)
    return p


def resample_closed(loop, n):
    p = np.asarray(loop)
    q = np.vstack([p, p[:1]])
    seg = np.linalg.norm(q[1:] - q[:-1], axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    tt = np.linspace(0, cum[-1], n, endpoint=False)
    return np.stack([np.interp(tt, cum, q[:, 0]), np.interp(tt, cum, q[:, 1])], -1)


def loop_normals(p):
    """Outward 2D normals of a closed polygon."""
    tang = np.roll(p, -1, axis=0) - np.roll(p, 1, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    nrm = np.stack([tang[:, 1], -tang[:, 0]], -1)
    area = 0.5 * np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1])
    return nrm if area > 0 else -nrm       # counter-clockwise -> (ty, -tx) points outward


FACE_LOOP = _face_loop()


# ---------------------------------------------------------------- the design (front projection)
EYE = (0.060, 0.030)
EYE_A, EYE_B, EYE_TILT = 0.036, 0.0180, math.radians(14)     # almond half-length/half-height, outer corner up
THIRD = (0.0, 0.118)
CHEEK = (0.098, -0.032)
CHIN = (0.0, -0.150)
MOUTH_W = 0.090
MOUTH_C = (0.0, -0.096)
NOSE_TIP = (0.0, -0.014)
EAR_ANG = (math.radians(74), -0.040)        # (theta, t) of the ear ornaments (on the side planes)


def mouth_up(s):
    return -0.074 + 0.012 * (s / MOUTH_W) ** 2


def mouth_lo(s):
    return -0.106 + 0.040 * (s / MOUTH_W) ** 2


def _mouth_loop():
    s = np.linspace(-MOUTH_W, MOUTH_W, 61)
    top = np.stack([s, mouth_up(s)], -1)
    bot = np.stack([s[::-1], mouth_lo(s[::-1])], -1)[1:-1]
    loop = chaikin(np.concatenate([top, bot]), 4)
    return resample_closed(loop, 240)


MOUTH_LOOP = _mouth_loop()                   # rounded-corner grin opening (closed polygon)
MOUTH_NRM = loop_normals(MOUTH_LOOP)


def mouth_sd(S, T):
    """Exact signed distance to the grin opening (negative inside); far points get a cheap bound."""
    out = np.full(S.shape, 0.2)
    m = (np.abs(S) < MOUTH_W + 0.06) & (T > -0.18) & (T < -0.02)
    if m.any():
        d, _ = polyline_dist(S[m], T[m], np.vstack([MOUTH_LOOP, MOUTH_LOOP[:1]]))
        ins = inside_polygon(S[m], T[m], MOUTH_LOOP)
        out[m] = np.where(ins, -d, d)
    return out


def almond_pts(n=48, scale=1.0, side=1):
    """Almond (lens) outline of an eye, counter-clockwise, in face coords."""
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    x = np.cos(a)
    y = np.sin(a) * (1 - x * x) ** 0.25 * (1 - 0.0 * x)
    # upper lid fuller than lower, slight droop at the inner corner
    y = np.where(y > 0, y * 1.0, y * 0.78)
    lx, ly = x * EYE_A * scale, y * EYE_B * scale
    c, s_ = math.cos(EYE_TILT), math.sin(EYE_TILT)
    rx, ry = lx * c - ly * s_, lx * s_ + ly * c
    return np.stack([side * (EYE[0] + rx), EYE[1] + ry], -1)


EYE_LOOP = almond_pts(96)
PUPIL_R = 0.0135                     # painted pupil radius (m)
PUPIL_DY = 0.11 * EYE_B              # visual centre of the almond (upper lid fuller than lower)


def eye_sd(aS, T):
    """Signed distance to the almond (negative inside), exact near the eye, bounded elsewhere."""
    out = np.full(aS.shape, 0.2)
    m = (np.abs(aS - EYE[0]) < EYE_A + 0.04) & (np.abs(T - EYE[1]) < EYE_B + 0.04)
    if m.any():
        d, _ = polyline_dist(aS[m], T[m], np.vstack([EYE_LOOP, EYE_LOOP[:1]]))
        out[m] = np.where(inside_polygon(aS[m], T[m], EYE_LOOP), -d, d)
    return out


def brow_base(n=20):
    return bezier((0.020, 0.064), (0.048, 0.088), (0.086, 0.088), (0.110, 0.064), n)


class Canvas:
    """Accumulates paint + height for arrays of face-space samples (any shape)."""

    def __init__(self, S, T, theta, want_color=True):
        self.S, self.T, self.theta = S, T, theta
        n = S.shape
        self.want_color = want_color
        self.geo = np.zeros(n)          # sculpted forms (low + high poly), without the mouth recess
        self.mouth = np.zeros(n)        # mouth recess (kept separate: the lip band sits on geo only)
        self.relief = np.zeros(n)       # paint relief (high poly only)
        # paint only on the front-facing planes, fading out on the side walls
        self.front = 1.0 - ss(1.25, 1.60, np.abs(theta))
        if want_color:
            self.col = np.tile(COL["red"], n + (1,)).astype(np.float64)
            self.rough = np.full(n, 0.26)
        self.px = 0.00035

    def fill(self, sd, color, relief=0.0, rough=None, mask=None):
        a = np.clip(0.5 - sd / self.px, 0, 1) * self.front
        if mask is not None:
            a = a * mask
        if self.want_color:
            col = np.asarray(color)
            self.col = self.col * (1 - a[..., None]) + col * a[..., None]
            if rough is not None:
                self.rough = self.rough * (1 - a) + rough * a
        if relief:
            self.relief += relief * np.clip(-sd / 0.0012 + 0.5, 0, 1) * self.front * (1 if mask is None else mask)
        return a

    def stroke(self, pts, width, color, relief=0.0004, rough=0.28, taper=None, both=True, bbox_pad=0.01):
        for q in ([pts, mirror(pts)] if both else [pts]):
            q = np.asarray(q)
            lo = q.min(axis=0) - width - bbox_pad
            hi = q.max(axis=0) + width + bbox_pad
            m = (self.S > lo[0]) & (self.S < hi[0]) & (self.T > lo[1]) & (self.T < hi[1])
            if not m.any():
                continue
            d, par = polyline_dist(self.S[m], self.T[m], q)
            w = width * 0.5
            if taper is not None:
                w = w * taper(par)
            self._apply_sub(m, d - w, color(par) if callable(color) else color, relief, rough)

    def _apply_sub(self, m, sd, color, relief, rough):
        a = np.clip(0.5 - sd / self.px, 0, 1) * self.front[m]
        if self.want_color:
            col = np.asarray(color)
            if col.ndim == 1:
                col = np.broadcast_to(col, a.shape + (3,))
            self.col[m] = self.col[m] * (1 - a[:, None]) + col * a[:, None]
            if rough is not None:
                self.rough[m] = self.rough[m] * (1 - a) + rough * a
        if relief:
            self.relief[m] += relief * np.clip(-sd / 0.0010 + 0.5, 0, 1) * self.front[m]

    def flame(self, base_pts, n, length, width, angle_fn, curl=0.35, color_fn=None, relief=0.0007, both=True,
              length_fn=None):
        """Row of tapered flame tongues rooted on base_pts."""
        base = np.asarray(base_pts)
        idx = np.linspace(0, len(base) - 1, n).astype(int)
        for k, i in enumerate(idx):
            f = k / max(n - 1, 1)
            ang = angle_fn(f)
            L = length * (length_fn(f) if length_fn else 1.0)
            p0 = base[i]
            d = np.array([math.cos(ang), math.sin(ang)])
            nrm = np.array([-d[1], d[0]])
            p1 = p0 + d * L * 0.5 + nrm * L * curl * 0.5
            p2 = p0 + d * L + nrm * L * curl * 0.15
            pts = bezier(p0, p1, p2, n=14)
            col = color_fn or (lambda par: COL["orange"])
            self.stroke(pts, width, col, relief=relief, rough=0.30,
                        taper=lambda par: np.clip(1.0 - par, 0, 1) ** 0.7, both=both)


def lerp_col(c0, c1):
    c0, c1 = np.asarray(c0), np.asarray(c1)
    return lambda par: c0[None] * (1 - par[:, None]) + c1[None] * par[:, None]


def design(cv):
    S, T = cv.S, cv.T
    aS = np.abs(S)
    fr = cv.front
    # ------------------------------------------------ sculpted forms (geometry)
    g = np.zeros(S.shape)
    g += 0.006 * gauss(S, T, 0, 0.11, 0.10, 0.05)                      # low forehead plane swell
    g += 0.009 * gauss(S, T, *THIRD, 0.032)                             # third-eye mound
    bd, bpar = polyline_dist(aS, T, brow_base())                      # pronounced brow ridge
    g += 0.025 * np.exp(-(bd / 0.021) ** 2) * (0.65 + 0.35 * np.sin(np.pi * bpar))
    # eye: soft socket plane under the brow + a small lid rim around the almond
    e_sd = eye_sd(aS, T)
    g += -0.004 * gauss(aS, T, EYE[0], EYE[1] - 0.004, 0.05, 0.03)
    g += 0.0045 * np.exp(-((e_sd - 0.004) / 0.004) ** 2)
    # nose: bridge + bulb + wings
    bridge = np.exp(-(S / 0.016) ** 2) * ss(0.072, 0.045, T) * ss(-0.03, 0.0, T)
    g += 0.026 * bridge
    g += 0.036 * gauss(S, T, NOSE_TIP[0], NOSE_TIP[1], 0.024, 0.022)
    g += 0.017 * gauss(aS, T, 0.026, -0.026, 0.014, 0.012)
    # raised cheekbone masses (they carry the flame patches)
    g += 0.036 * gauss(aS, T, *CHEEK, 0.052, 0.044)
    # square jaw shelf + chin
    g += 0.010 * gauss(aS, T, 0.10, -0.120, 0.05, 0.03)
    g += 0.016 * gauss(S, T, *CHIN, 0.050, 0.032)
    cv.geo = g * fr
    # grin: deep, smooth recess (the lip band covers its edge)
    m_sd = mouth_sd(S, T)
    cv.mouth = -0.030 * ss(0.004, -0.020, m_sd) * fr

    if cv.want_color:
        inside = ss(0.002, -0.004, m_sd)
        cv.col = cv.col * (1 - inside[..., None]) + COL["cavity"] * inside[..., None]
        cv.rough = cv.rough * (1 - inside) + 0.75 * inside

    # ---- white outline just outside the lip band, then a thin gold one
    cv.fill(np.abs(m_sd - 0.0175) - 0.0018, COL["white"], relief=0.0005, rough=0.32)
    cv.fill(np.abs(m_sd - 0.0235) - 0.0009, COL["gold"], relief=0.0003, rough=0.34)

    # ---- cheekbone masses: orange flame patch + flames licking outward, framed by symmetric contours
    # flame tongues rooted above the lip outline, licking up and out over the cheekbone
    rs = np.linspace(0.046, 0.104, 24)
    root = np.stack([rs, mouth_up(rs) + 0.031 + 0.010 * ((rs - 0.046) / 0.058)], -1)
    cv.flame(root, 8, 0.046, 0.0105, lambda f: math.radians(78 - 50 * f), curl=-0.45,
             color_fn=lerp_col(COL["orange_deep"], COL["orange"]), relief=0.0006,
             length_fn=lambda f: 0.75 + 0.35 * math.sin(math.pi * f))
    cv.flame(root[2:-2] + [0.004, 0.003], 6, 0.026, 0.0070, lambda f: math.radians(74 - 46 * f), curl=-0.40,
             color_fn=lerp_col(COL["orange"], COL["flame_tip"]), relief=0.0007)
    # cheek contour: frames the outer side and underside of each cheekbone mass (stays on the front plane)
    cheek_arc = spiral(CHEEK, 0.034, 0.034, math.radians(70), math.radians(-95), 40, 1.0, 1.25)
    cv.stroke(cheek_arc, 0.0034, COL["white"], relief=0.0006)
    cv.stroke(spiral(CHEEK, 0.027, 0.027, math.radians(60), math.radians(-85), 36, 1.0, 1.25), 0.0016,
              COL["gold"], relief=0.0004)

    # ---- brows: pronounced ridge painted with orange-gold flames
    cv.flame(brow_base(24), 11, 0.028, 0.0085, lambda f: math.radians(112 - 40 * f), curl=-0.30,
             color_fn=lerp_col(COL["orange"], COL["flame_tip"]), relief=0.0008,
             length_fn=lambda f: (0.7 + 0.6 * math.sin(math.pi * f)) * (1.0 - 0.45 * f * f))
    cv.stroke(brow_base(24), 0.0050, COL["orange"], relief=0.0006)
    cv.stroke(brow_base(24) + [0, -0.0070], 0.0022, COL["blue"], relief=0.0003)

    # ---- eyes: painted upper-lid line (thick, flicks up at the outer corner), thin lower line, gold arc
    up_lid = almond_pts(96, 1.10)
    up_lid = up_lid[(np.arange(96) <= 48)]                   # upper half: outer corner -> inner corner
    flick = np.array([up_lid[0], up_lid[0] + [0.006, 0.003], up_lid[0] + [0.010, 0.006]])
    cv.stroke(np.vstack([flick[::-1], up_lid]), 0.0042, COL["black"], relief=0.0005, rough=0.30,
              taper=lambda par: 0.35 + 0.65 * np.sin(np.pi * np.clip(par * 1.1, 0, 1)) ** 0.5)
    lo_lid = almond_pts(96, 1.12)[48:]
    cv.stroke(lo_lid, 0.0018, COL["black"], relief=0.0003)
    cv.stroke(almond_pts(96, 1.45)[6:44], 0.0024, COL["gold"], relief=0.0004)
    cv.stroke(almond_pts(96, 1.40)[52:92], 0.0030, COL["white"], relief=0.0005)

    # ---- third eye: white ring + gold ring
    r = np.hypot(S - THIRD[0], T - THIRD[1])
    cv.fill(np.abs(r - 0.0315) - 0.0040, COL["white"], relief=0.0006, rough=0.28)
    cv.fill(np.abs(r - 0.0395) - 0.0014, COL["gold"], relief=0.0004)

    # ---- nose: teal chevron on the bridge, gold under the teardrop ornament
    chev = np.array([(-0.019, 0.070), (0.0, 0.051), (0.019, 0.070)])
    cv.stroke(chev, 0.0065, COL["teal"], relief=0.0006, both=False)
    cv.stroke(chev + [0, 0.008], 0.0022, COL["white"], relief=0.0004, both=False)
    tear = teardrop_sd(S, T)
    cv.fill(tear + 0.0015, COL["gold"], rough=0.3)
    cv.fill(np.abs(tear - 0.002) - 0.0012, COL["white"], relief=0.0003)

    # ---- chin: downward flame "beard" under the lip band + white curls
    cb = mouth_lo(0.0) - 0.034
    chin_base = bezier((-0.040, cb + 0.004), (-0.016, cb), (0.016, cb), (0.040, cb + 0.004), 18)
    cv.flame(chin_base, 9, 0.020, 0.0068, lambda f: math.radians(-90 - 36 * (f - 0.5)), curl=0.0,
             color_fn=lerp_col(COL["orange"], COL["yellow"]), relief=0.0006, both=False,
             length_fn=lambda f: 0.6 + 0.4 * math.sin(math.pi * f))

    # ---- symmetric contour lines following the mask's forms
    fore = face_contour(0.012, 42, 74)             # forehead border: above the brow flames -> crown
    start = fore[0]
    curl0 = spiral((start[0] - 0.010, start[1]), 0.010, 0.0035, math.radians(0), math.radians(-250), 26)
    cv.stroke(np.vstack([curl0[::-1], fore]), 0.0036, COL["white"], relief=0.0006)
    cv.stroke(face_contour(0.023, 47, 72), 0.0016, COL["gold"], relief=0.0004)
    jaw = face_contour(0.012, -10, -64)            # jaw border: below the ear, ends in an inward curl
    end = jaw[-1]
    curl = spiral((end[0], end[1] + 0.011), 0.011, 0.0035, math.radians(-90), math.radians(-330), 30)
    cv.stroke(np.vstack([jaw, curl[1:]]), 0.0036, COL["white"], relief=0.0006)
    jaw2 = face_contour(0.022, -14, -60)
    cv.stroke(jaw2, 0.0016, COL["gold"], relief=0.0004)

    if cv.want_color:
        # crevices a touch darker (the baked AO is multiplied in later as well)
        cv.col *= np.clip(1.0 + 9.0 * np.minimum(g * fr, 0.0), 0.75, 1.0)[..., None]
    return cv


def teardrop_sd(S, T):
    """Teardrop on the nose: point up at t=0.046, round bottom."""
    c = np.array([0.0, -0.004])
    r = 0.0125
    top = np.array([0.0, 0.046])
    d_circle = np.hypot(S - c[0], T - c[1]) - r
    half = math.asin(r / (top[1] - c[1]))
    cone = np.maximum(np.abs(S) * math.cos(half) + (T - top[1]) * math.sin(half), c[1] - T)
    return np.minimum(d_circle, cone)


def wear_maps(geo, col, rough):
    """Lacquer wear on convex edges (lighter, rougher), on a 2D (rows, cols) sample grid."""
    lap = (np.roll(geo, 1, 0) + np.roll(geo, -1, 0) + np.roll(geo, 1, 1) + np.roll(geo, -1, 1) - 4 * geo)
    k = np.percentile(np.abs(lap), 99.5) + 1e-12
    convex = np.clip(-lap / k, 0, 1)
    rng = np.random.default_rng(7)
    noise = rng.random(geo.shape)
    for _ in range(3):
        noise = 0.25 * (np.roll(noise, 1, 0) + np.roll(noise, -1, 0) + np.roll(noise, 1, 1) + np.roll(noise, -1, 1))
    noise = (noise - noise.min()) / (np.ptp(noise) + 1e-9)
    w = np.clip(convex * 1.6 * (0.4 + 0.9 * noise), 0, 1)
    col = col * (1 - 0.20 * w[..., None]) + COL["wood"] * (0.20 * w[..., None])
    rough = np.clip(rough + (0.46 - rough) * w + 0.05 * (noise - 0.5), 0.15, 0.9)
    return col, rough


# ---------------------------------------------------------------- geometry
def shell_fields(theta, phi, relief=True, mouth=True):
    S, T = st_of(theta, phi)
    cv = design(Canvas(S, T, theta, want_color=False))
    h = cv.geo + (cv.mouth if mouth else 0) + (cv.relief if relief else 0)
    return h


def surface(theta, phi, relief=False, mouth=True):
    P, N = ellipsoid(theta, phi)
    h = shell_fields(theta, phi, relief, mouth)
    return P + N * h[..., None]


def surface_st(s, t, mouth=False):
    """Displaced surface points + normals at face coords (arrays)."""
    th, ph = angles_of_st(s, t)
    e = 0.0006
    p = surface(th, ph, mouth=mouth)
    ths, phs = angles_of_st(np.asarray(s) + e, t)
    tht, pht = angles_of_st(s, np.asarray(t) + e)
    ps = surface(ths, phs, mouth=mouth)
    pt = surface(tht, pht, mouth=mouth)
    n = np.cross(ps - p, pt - p)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n *= np.sign(np.sum(n * (p - np.array([0, CY, Z0])), axis=-1, keepdims=True))
    return p, n


def surface_frame(s, t, mouth=False):
    p, n = surface_st(np.array([s]), np.array([t]), mouth)
    return Vector(p[0]), Vector(n[0])


def surface_frame_angles(theta, phi):
    th, ph = np.array([theta]), np.array([phi])
    e = 1e-3
    p = surface(th, ph)[0]
    n = np.cross(surface(th + e, ph)[0] - p, surface(th, ph + e)[0] - p)
    n /= np.linalg.norm(n)
    if np.dot(n, p - np.array([0, CY, Z0])) < 0:
        n = -n
    return Vector(p), Vector(n)


def grid_arrays(nu, nv, relief):
    u = np.linspace(-1, 1, nu)
    v = np.linspace(-1, 1, nv)
    U, V = np.meshgrid(u, v)                  # (nv, nu)
    th, ph = uv_to_angles(U, V)
    P = surface(th, ph, relief=relief)
    return U, V, th, ph, P


def grid_mesh(name, nu, nv, relief):
    U, V, th, ph, P = grid_arrays(nu, nv, relief)
    P = P.reshape(-1, 3)
    faces = []
    for j in range(nv - 1):
        for i in range(nu - 1):
            a = j * nu + i
            faces.append((a, a + 1, a + nu + 1, a + nu))
    me = bpy.data.meshes.new(name)
    me.from_pydata(P.tolist(), [], faces)
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    loops = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loops)
    uvv = np.stack([(U.ravel() + 1) / 2 * U_SHELL, (V.ravel() + 1) / 2], -1)
    uv.data.foreach_set("uv", uvv[loops].ravel())
    ob = bpy.data.objects.new(name, me)
    C.link(ob)
    C.shade_smooth(ob)
    _outward(ob)
    return ob


def _outward(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    f0 = bm.faces[len(bm.faces) // 2]
    if (f0.calc_center_median() - Vector((0, CY, Z0))).dot(f0.normal) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data)
    bm.free()


def _set_uv(ob, uvv_per_vertex):
    me = ob.data
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    loops = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loops)
    uv.data.foreach_set("uv", np.asarray(uvv_per_vertex)[loops].ravel())


def swatch_cell(key, margin=0.010):
    row = SWATCH_ROWS[key]
    return (U_SHELL + margin, 1.0 - margin, row / N_SWATCH + margin, (row + 1) / N_SWATCH - margin)


def swatch_uv(ob, key):
    """Map a part into its solid-colour swatch cell (right-hand column of the texture)."""
    co = C.get_co(ob.data)
    u0, u1, v0, v1 = swatch_cell(key)
    a = co[:, [0, 2]] + co[:, [1, 1]] * 0.5
    a = (a - a.min(0)) / max(np.ptp(a, axis=0).max(), 1e-6)
    _set_uv(ob, np.stack([u0 + a[:, 0] * (u1 - u0), v0 + a[:, 1] * (v1 - v0)], -1))


def eye_cell_uv(local):
    """local (N,2) in [-1, 1] (x along the almond, y up) -> UVs of the painted eye cell (square)."""
    u0, u1, v0, v1 = swatch_cell("eye")
    side = min(u1 - u0, v1 - v0)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    return np.stack([uc + local[:, 0] * side / 2, vc + local[:, 1] * side / 2], -1)


def frame_matrix(p, n, up=Vector((0, 0, 1))):
    z = n.normalized()
    x = up.cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = p
    return m


def bm_to_obj(bm, name, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    C.link(ob)
    if mat is not None:
        ob.matrix_world = mat
        C.apply_transform(ob)
    C.shade_smooth(ob)
    return ob


def mesh_from_grid(name, P, closed_u=False):
    """Quad mesh from a (rows, cols, 3) point grid."""
    rows, cols = P.shape[:2]
    faces = []
    cu = cols if closed_u else cols - 1
    for j in range(rows - 1):
        for i in range(cu):
            i2 = (i + 1) % cols
            faces.append((j * cols + i, j * cols + i2, (j + 1) * cols + i2, (j + 1) * cols + i))
    me = bpy.data.meshes.new(name)
    me.from_pydata(P.reshape(-1, 3).tolist(), [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    C.link(ob)
    C.shade_smooth(ob)
    return ob


def make_dome(rs, rt, depth, segs, rings):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.25], context="VERTS")
    for v in bm.verts:
        v.co = Vector((v.co.x * rs, v.co.y * rt, v.co.z * depth))
    return bm


def make_torus_bm(major, minor, seg_major=24, seg_minor=8, flat=1.0):
    bm = bmesh.new()
    rings = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        ring = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, minor * flat * math.sin(b))))
        rings.append(ring)
    for i in range(seg_major):
        for j in range(seg_minor):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % seg_minor],
                          rings[(i + 1) % seg_major][(j + 1) % seg_minor], rings[(i + 1) % seg_major][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def make_tube(path, radii, segs=8):
    """Tapered tube along a 3D polyline (list of Vector); radius 0 = pointed tip."""
    bm = bmesh.new()
    rings = []
    prev_x = None
    for i, p in enumerate(path):
        tang = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        x = prev_x or tang.orthogonal()
        x = x - tang * x.dot(tang)
        x.normalize()
        prev_x = x
        y = tang.cross(x)
        r = radii[i]
        if r <= 1e-5:
            rings.append([bm.verts.new(p)])
            continue
        rings.append([bm.verts.new(p + (x * math.cos(2 * math.pi * k / segs) + y * math.sin(2 * math.pi * k / segs)) * r)
                      for k in range(segs)])
    for a, b in zip(rings[:-1], rings[1:]):
        if len(b) == 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        else:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    if len(rings[0]) > 1:
        bm.faces.new(rings[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def make_rounded_box(size, bevel, segs=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, profile=0.6, affect="EDGES")
    return bm


# ---------------------------------------------------------------- part geometry (numpy first, so it can be previewed)
LIP_PROFILE = [(0.0, -0.003), (0.0010, 0.0040), (0.0034, 0.0070), (0.0066, 0.0080),
               (0.0098, 0.0070), (0.0122, 0.0040), (0.0132, -0.003)]


def lip_band_points(n=64):
    """(n, len(LIP_PROFILE), 3): a clean bevelled band swept around the rounded grin opening."""
    loop = resample_closed(MOUTH_LOOP, n)
    nrm = loop_normals(loop)
    rows = []
    for o, h in LIP_PROFILE:
        q = loop + nrm * o
        p, nn = surface_st(q[:, 0], q[:, 1], mouth=False)
        rows.append(p + nn * h)
    return np.stack(rows, 1)          # (n, profile, 3)


def almond_dome_points(rings=5, segs=24, depth=0.0115, side=1):
    """Eye-white dome over the almond: (rings+1, segs, 3) points + local (x,y) in [-1,1]."""
    a = np.linspace(0, 2 * np.pi, segs, endpoint=False)
    x = np.cos(a)
    y = np.sin(a) * (1 - x * x) ** 0.25
    y = np.where(y > 0, y, y * 0.78)
    pts, loc = [], []
    for k in range(rings + 1):
        rho = 1.0 - k / rings
        rho = max(rho, 0.0)
        lx, ly = x * rho, y * rho
        c, s_ = math.cos(EYE_TILT), math.sin(EYE_TILT)
        rx, ry = lx * EYE_A * c - ly * EYE_B * s_, lx * EYE_A * s_ + ly * EYE_B * c
        S = side * (EYE[0] + rx)
        T = EYE[1] + ry
        p, nn = surface_st(S, T, mouth=False)
        h = np.full(segs, depth * math.sqrt(max(1 - rho * rho, 0.0)) + 0.0006)
        pts.append(p + nn * h[:, None])
        loc.append(np.stack([side * lx, ly * EYE_B / EYE_A], -1))
    return np.stack(pts, 0), np.stack(loc, 0)


def fang_path(side, n=10):
    """Tusk rising up and out from a lower mouth corner; tip at mid-cheek (inside the outline).
    The path hugs the face: clearance above the local surface grows from the lip to the tip."""
    f = np.linspace(0, 1, n + 1)
    s0 = 0.064
    s = side * (s0 + 0.016 * f * f)
    t0 = mouth_lo(s0) + 0.005
    t = t0 + (-0.026 - t0) * f
    p, nn = surface_st(s, t, mouth=False)
    clear = 0.005 + 0.011 * ss(0.0, 0.35, f) - 0.004 * f
    path = p + nn * clear[:, None]
    radii = 0.0078 * (1 - f) ** 0.8
    radii[-1] = 0.0
    return path, radii


# ---------------------------------------------------------------- parts (Blender objects)
def lip_band():
    P = lip_band_points()
    ob = mesh_from_grid("LipBand", np.transpose(P, (1, 0, 2)), closed_u=True)
    _outward(ob)
    swatch_uv(ob, "lip")
    return ob


def eye_domes():
    out = []
    for side in (1, -1):
        P, L = almond_dome_points(side=side)
        rings, segs = P.shape[:2]
        bm = bmesh.new()
        verts = [[bm.verts.new(P[k, i]) for i in range(segs)] for k in range(rings - 1)]
        apex = bm.verts.new(P[-1].mean(axis=0))
        for k in range(rings - 2):
            for i in range(segs):
                i2 = (i + 1) % segs
                bm.faces.new((verts[k][i], verts[k][i2], verts[k + 1][i2], verts[k + 1][i]))
        for i in range(segs):
            bm.faces.new((verts[-1][i], verts[-1][(i + 1) % segs], apex))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        ob = bm_to_obj(bm, f"Eye{'L' if side > 0 else 'R'}")
        loc = np.vstack([L[:-1].reshape(-1, 2), [[0.0, 0.0]]])
        _set_uv(ob, eye_cell_uv(loc))
        out.append(ob)
    return out


def teeth():
    """One tight row hanging flush behind the upper lip band."""
    parts = []
    xs = np.linspace(-0.0525, 0.0525, 8)
    for x in xs:
        p, n = surface_frame(x, mouth_up(x) - 0.009, mouth=False)
        bm = make_rounded_box((0.0148, 0.020, 0.012), 0.0022, 1)
        parts.append(bm_to_obj(bm, "Tooth", frame_matrix(p - n * 0.0085, n)))
    return parts


def fangs(segs=8):
    out = []
    for side in (1, -1):
        path, radii = fang_path(side)
        out.append(bm_to_obj(make_tube([Vector(q) for q in path], list(radii), segs),
                             f"Fang{'L' if side > 0 else 'R'}"))
    return out


def third_eye():
    p, n = surface_frame(*THIRD)
    m = frame_matrix(p + n * 0.003, n)
    green = bm_to_obj(make_torus_bm(0.0205, 0.0058, 18, 5, 0.8), "ThirdEyeGreen", m)
    gold = bm_to_obj(make_torus_bm(0.0120, 0.0042, 16, 5, 0.9), "ThirdEyeGold", m)
    gem = bm_to_obj(make_dome(0.0085, 0.0105, 0.0075, 12, 6), "ThirdEyeGem", m)
    return green, [gold, gem]


def ear_ornaments():
    greens, golds = [], []
    for side in (1, -1):
        th, ph = angles_of_st(np.array([0.0]), np.array([EAR_ANG[1]]))
        p, n = surface_frame_angles(side * EAR_ANG[0], ph[0])
        m = frame_matrix(p + n * 0.004, n)
        greens.append(bm_to_obj(make_torus_bm(0.0215, 0.0078, 18, 5, 0.75), "EarGreen", m))
        golds.append(bm_to_obj(make_dome(0.0135, 0.0135, 0.010, 12, 6), "EarGold", m))
    return greens, golds


def decal(name, sd_fn, bbox, height, n=24):
    """Thin relief that sits on the shell: sample a 2D shape on the surface and puff it up."""
    s = np.linspace(bbox[0], bbox[1], n)
    t = np.linspace(bbox[2], bbox[3], int(n * (bbox[3] - bbox[2]) / (bbox[1] - bbox[0])) + 2)
    Sg, Tg = np.meshgrid(s, t)
    sd = sd_fn(Sg, Tg).ravel()
    P, N = surface_st(Sg.ravel(), Tg.ravel(), mouth=False)
    prof = np.sqrt(np.clip(-sd / 0.006, 0, 1))
    P = P + N * (0.0012 + height * prof)[:, None]
    nu = len(s)
    inside = sd < 0.0015
    bm = bmesh.new()
    vs = [bm.verts.new(q) for q in P]
    for j in range(len(t) - 1):
        for i in range(nu - 1):
            a = j * nu + i
            q = (a, a + 1, a + nu + 1, a + nu)
            if all(inside[k] for k in q):
                bm.faces.new([vs[k] for k in q])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm_to_obj(bm, name)


def nose_ornament():
    return decal("NoseTeardrop", teardrop_sd, (-0.016, 0.016, -0.020, 0.050), 0.0035, n=18)


# ---------------------------------------------------------------- textures
def paint_arrays(size=TEX):
    """Base colour (linear) + roughness for the whole texture, numpy only."""
    us = (np.arange(size) + 0.5) / size
    U, V = np.meshgrid(us, us)                      # image rows = v
    shell = U < U_SHELL
    u = U / U_SHELL * 2 - 1
    v = V * 2 - 1
    th, ph = uv_to_angles(np.clip(u, -1, 1), v)
    S, T = st_of(th, ph)
    cv = design(Canvas(S, T, th, want_color=True))
    col, rough = wear_maps(cv.geo, cv.col, cv.rough)
    # swatch column
    col[~shell] = COL["red"]
    rough[~shell] = 0.3
    for key in SWATCH_ROWS:
        u0, u1, v0, v1 = swatch_cell(key, margin=0.0)
        m = (~shell) & (V >= v0) & (V < v1)
        col[m] = COL["eyewhite"] if key == "eye" else COL[key]
        rough[m] = SWATCH_ROUGH[key]
    # painted eye cell: white, dark iris ring, matte black pupil
    u0, u1, v0, v1 = swatch_cell("eye")
    side = min(u1 - u0, v1 - v0)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    lx = (U - uc) / (side / 2) * EYE_A
    ly = (V - vc) / (side / 2) * EYE_A
    cell = (~shell) & (np.abs(U - uc) < side / 2 + 0.01) & (np.abs(V - vc) < side / 2 + 0.01)
    r = np.hypot(lx, ly - PUPIL_DY)
    a_iris = np.clip((PUPIL_R + 0.0028 - r) / 0.0006, 0, 1) * cell
    a_pupil = np.clip((PUPIL_R - r) / 0.0006, 0, 1) * cell
    col = col * (1 - a_iris[..., None]) + COL["iris"] * a_iris[..., None]
    col = col * (1 - a_pupil[..., None]) + COL["black"] * a_pupil[..., None]
    rough = rough * (1 - a_iris) + 0.35 * a_iris
    return np.clip(col, 0, 1), np.clip(rough, 0.05, 1), shell


def paint_textures(size=TEX):
    col, rough, shell = paint_arrays(size)
    base = np.ones((size, size, 4), dtype=np.float32)
    base[..., :3] = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(col, 1 / 2.4) - 0.055)
    img = bpy.data.images.new("Mask_basecolor", size, size, alpha=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(base.ravel())
    r = np.ones((size, size, 4), dtype=np.float32)
    r[..., 0] = r[..., 1] = r[..., 2] = rough
    rimg = bpy.data.images.new("Mask_rough", size, size, alpha=False)
    rimg.colorspace_settings.name = "Non-Color"
    rimg.pixels.foreach_set(r.ravel())
    return img, rimg, shell


def flatten_swatch_column(img, value):
    px = C.img_pixels(img).copy()
    size = px.shape[1]
    col0 = int(U_SHELL * size)
    px[:, col0:, :3] = value
    img.pixels.foreach_set(px.ravel())


def multiply_ao_into_base(base_img, ao_img, amount=0.45):
    """Darker red in the crevices: base *= mix(1, ao, amount) on the shell part (sRGB image)."""
    b = C.img_pixels(base_img).copy()
    a = C.img_pixels(ao_img)[..., 0]
    lin = np.where(b[..., :3] <= 0.04045, b[..., :3] / 12.92, ((b[..., :3] + 0.055) / 1.055) ** 2.4)
    f = 1 - amount * (1 - a)
    lin *= f[..., None]
    b[..., :3] = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    base_img.pixels.foreach_set(b.ravel())


# ---------------------------------------------------------------- build
def gold_material():
    return C.new_material("Metal", base=tuple(srgb(232, 176, 70)), rough=0.28, metal=1.0)


def build_mask(out_dir, tex_size=TEX, hi_res=(900, 640), lo_res=(46, 38)):
    """Returns (mask_obj [Mask material], metal_obj [Metal material]) at the head position."""
    C.log("mask: high poly")
    hi = grid_mesh("MaskHi", hi_res[0], hi_res[1], relief=True)
    C.log("mask: low poly")
    lo = grid_mesh("MaskLo", lo_res[0], lo_res[1], relief=False)
    eyes = eye_domes()
    lips = lip_band()
    ivory = teeth() + fangs()
    for o in ivory:
        swatch_uv(o, "ivory")
    green3, gold3 = third_eye()
    ear_g, ear_au = ear_ornaments()
    for o in [green3] + ear_g:
        swatch_uv(o, "green")
    nose = nose_ornament()
    metal_parts = gold3 + ear_au + [nose]

    lo_all = C.join_objects([lo] + eyes + [lips] + ivory + [green3] + ear_g, "Mask")
    hi_all = C.join_objects([hi], "MaskHiAll")
    metal = C.join_objects(metal_parts, "MaskMetal")
    C.shade_smooth(lo_all)

    C.log("mask: paint")
    base_img, rough_img, _ = paint_textures(tex_size)
    lo_all.data.materials.append(C.new_material("MaskBake"))
    hi_all.data.materials.append(C.new_material("MaskHiMat"))
    C.gpu_cycles(1)
    nrm = C.new_image("Mask_normal", tex_size, (0.5, 0.5, 1, 1), non_color=True)
    # the shell low/high differ only by paint relief + sampling: a small cage is enough
    C.bake(lo_all, "NORMAL", nrm, sources=[hi_all], extrusion=0.012, max_ray=0.03, samples=1, margin=8)
    flatten_swatch_column(nrm, (0.5, 0.5, 1.0))
    hi_all.hide_render = True
    ao = C.new_image("Mask_ao", tex_size, (1, 1, 1, 1), non_color=True)
    sc = bpy.context.scene
    sc.world = sc.world or bpy.data.worlds.new("World")
    sc.world.light_settings.distance = 0.05
    C.bake(lo_all, "AO", ao, samples=96, margin=8)
    flatten_swatch_column(ao, (1.0, 1.0, 1.0))
    multiply_ao_into_base(base_img, ao, 0.45)
    px = C.img_pixels(ao).copy()
    px[..., :3] = 1 - 0.6 * (1 - px[..., :3])
    ao.pixels.foreach_set(px.ravel())
    orm = C.pack_orm("Mask_orm", tex_size, ao_img=ao, rough_img=rough_img)
    for img, nm in ((base_img, "lakhey_mask_basecolor"), (orm, "lakhey_mask_orm"), (nrm, "lakhey_mask_normal")):
        C.save_image(img, f"{out_dir}/{nm}.png")
    mat = C.final_pbr_material("Mask", base_img, orm, nrm, normal_strength=1.0)
    lo_all.data.materials.clear()
    lo_all.data.materials.append(mat)
    metal.data.materials.append(gold_material())
    bpy.data.objects.remove(hi_all)
    for img in (ao, rough_img):
        bpy.data.images.remove(img)
    C.log("mask tris:", C.count_tris([lo_all]), "+ metal", C.count_tris([metal]))
    return lo_all, metal
