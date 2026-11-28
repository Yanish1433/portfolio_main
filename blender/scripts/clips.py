"""Animation clips for the Lakhey rig (Mixamo-named MPFB skeleton).

  Idle  : 2 s loop, arms relaxed, breathing + slight sway
  Walk  : 1.2 s in-place loop (heel -> toe, hip sway, counter-rotation, arm swing)
  Run   : 0.8 s in-place loop (contact -> down -> passing -> up, flight phases, forward lean)
  Dance : 15 s flag dance (stomps + half-turn, overhead flag wave, one-foot spin, FLAG BANG (3 pole strikes on the beat, frames 306/324/342), step-together
          + deep bow); right hand grips a 3 cm pole throughout; first/last frame = Idle t=0

Poses are WORLD-axis rotations (degrees) of each bone relative to the T-pose rest. A bone's pose is either
a list of (axis, degrees) applied in order (relative to its parent), or `World(R)`, an absolute world
rotation (used for thighs, feet, trunk and head so they can be set independently of the parent's lean).
Every pose bone is keyed in every clip, so blends never leave offsets stuck on bones a clip doesn't touch.

Gait clips are generated from small phase tables (`RUN_LEG`, `WALK_LEG`): a periodic cubic through the key
poses, sampled every frame. The measured ground speed of each gait is printed by `make_clips` (see
GAIT_INFO) and copied into src/components/world/characters.ts.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

import common as C

FPS = 30
GAIT_INFO = {}


# ----------------------------------------------------------------------------- rotation helpers
def Rm(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def rots_to_R(rots):
    R = Matrix.Identity(3)
    for axis, deg in rots:
        R = Rm(axis, deg) @ R
    return R


class World:
    """An absolute world rotation (relative to rest) for a bone, independent of its parent's pose."""

    def __init__(self, R):
        self.R = R


class Pole:
    """Right hand holding a vertical-ish pole: the knuckle axis is aligned with the pole (tilted `side` degrees
    toward the character's left and `fwd` degrees forward from vertical, then turned with the body by `spin`),
    and the palm faces the pole. The wrist takes up the difference to the forearm. `w` blends it with the plain
    wrist pose (0 = plain, 1 = pole)."""

    def __init__(self, side, fwd, spin, w, plain):
        self.side, self.fwd, self.spin, self.w, self.plain = side, fwd, spin, w, plain


def q_from_R(arm, pb, R):
    m3 = arm.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()
    return (m3.inverted() @ R @ m3).to_quaternion()


def q_world(arm, short, rots):
    """Local quaternion for a sequence of WORLD-axis rotations of the bone at rest."""
    return q_from_R(arm, C.pbone(arm, short), rots_to_R(rots))


def slerp_R(Ra, Rb, t):
    return Ra.to_quaternion().slerp(Rb.to_quaternion(), t).to_matrix()


# ----------------------------------------------------------------------------- posing + grounding
_SOLE = {}


def _sole_points(arm):
    """Heel / ball / toe-tip contact points at rest, each tied to its bone: [(pose bone, rest point)]."""
    if arm.name in _SOLE:
        return _SOLE[arm.name]
    C.reset_pose(arm)
    mw = arm.matrix_world
    pts, z0 = [], None
    for side in ("Left", "Right"):
        foot, toe = C.pbone(arm, side + "Foot"), C.pbone(arm, side + "ToeBase")
        ankle, ball, tip = mw @ foot.bone.head_local, mw @ toe.bone.head_local, mw @ toe.bone.tail_local
        z0 = tip.z if z0 is None else min(z0, tip.z)
        pts += [(foot, Vector((ankle.x, ankle.y + 0.07, 0))), (foot, Vector((ball.x, ball.y, 0))),
                (toe, Vector((tip.x, tip.y, 0)))]
    pts = [(pb, Vector((p.x, p.y, z0))) for pb, p in pts]
    _SOLE[arm.name] = (pts, z0)
    return _SOLE[arm.name]


def sole_drop(arm):
    """Height of the lowest sole point above its rest height (ground = rest height)."""
    pts, z0 = _sole_points(arm)
    mw = arm.matrix_world
    low = 9.0
    for pb, p in pts:
        rest = mw @ pb.bone.matrix_local
        cur = mw @ pb.matrix
        low = min(low, (cur @ rest.inverted() @ p).z - z0)
    return low


def pole_R(arm, pb, v, P):
    """World rotation (relative to rest) of the right hand that puts the grip axis along the pole."""
    b = pb.bone
    L0 = (b.tail_local - b.head_local).normalized()
    K0 = Vector((0.0, 1.0, 0.0))
    N0 = L0.cross(K0)
    pw = Vector((math.tan(math.radians(v.side)), -math.tan(math.radians(v.fwd)), 1.0)).normalized()
    pw = Rm("Z", v.spin) @ pw
    a = P @ L0
    Kp = -pw
    Lp = a - a.dot(Kp) * Kp
    if Lp.length < 0.15:
        Lp = Vector((0.0, -1.0, 0.0)) - Vector((0.0, -1.0, 0.0)).dot(Kp) * Kp
    Lp.normalize()
    Np = Lp.cross(Kp)
    Mt = Matrix(((Lp.x, Kp.x, Np.x), (Lp.y, Kp.y, Np.y), (Lp.z, Kp.z, Np.z)))
    Mr = Matrix(((L0.x, K0.x, N0.x), (L0.y, K0.y, N0.y), (L0.z, K0.z, N0.z)))
    Rp = Mt @ Mr.transposed()
    if v.w >= 0.999:
        return Rp
    Rn = P @ rots_to_R(v.plain)
    return slerp_R(Rn, Rp, v.w)


def apply_pose(arm, pose, sway=0.0, lift=0.0, ground=True, off=(0.0, 0.0), drop=None):
    """Set every bone's rotation from `pose`, then move the hips so the lowest sole point rests on the
    ground (+`lift` metres of air, +`sway` metres to the character's left, `off` = extra world XY offset).
    `drop` overrides the grounding drop (used by the foot-lock solver)."""
    C.reset_pose(arm)
    want = {C.pbone(arm, k).name: v for k, v in pose.items()}

    def depth(pb):
        d = 0
        while pb.parent:
            pb, d = pb.parent, d + 1
        return d

    acc = {}
    for pb in sorted(arm.pose.bones, key=depth):
        pb.rotation_mode = "QUATERNION"
        P = acc[pb.parent.name] if pb.parent else Matrix.Identity(3)
        v = want.get(pb.name)
        if v is None:
            Rl = Matrix.Identity(3)
        elif isinstance(v, World):
            Rl = P.inverted() @ v.R
        elif isinstance(v, Pole):
            Rl = P.inverted() @ pole_R(arm, pb, v, P)
        else:
            Rl = rots_to_R(v)
        acc[pb.name] = P @ Rl
        pb.rotation_quaternion = q_from_R(arm, pb, Rl)
    hips = C.pbone(arm, "Hips")
    bpy.context.view_layer.update()
    if drop is None:
        drop = sole_drop(arm) if ground else 0.0
    m3 = (arm.matrix_world.to_3x3() @ hips.bone.matrix_local.to_3x3()).inverted()
    hips.location = m3 @ Vector((sway + off[0], off[1], -drop + lift))
    bpy.context.view_layer.update()
    return drop


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    C.pbone(arm, "Hips").keyframe_insert("location", frame=frame)


# ----------------------------------------------------------------------------- grip measurement
def grip_info(arm):
    """Fit the fist cavity of the right hand at full curl: centre + pole axis in RightHand BONE-LOCAL space (m).
    Circle fitted to the finger joints in the plane perpendicular to the knuckle axis."""
    C.reset_pose(arm)
    apply_pose(arm, body_pose({"curlR": 1.0}), ground=False)
    hand = C.pbone(arm, "RightHand")
    Minv = hand.matrix.inverted()
    K = Minv.to_3x3() @ Vector((0.0, 1.0, 0.0))   # knuckle axis in hand-local (pole axis; thumb side is -K)
    K.normalize()
    pts = []
    for fn in FINGER_FULL:
        for j in (1, 2, 3):
            pb = C.pbone(arm, f"RightHand{fn}{j}")
            pts.append(Minv @ pb.head)
        pts.append(Minv @ C.pbone(arm, f"RightHand{fn}3").tail)
    # plane basis
    u = (Vector((1.0, 0.0, 0.0)) - K * K.x).normalized()
    v = K.cross(u)
    P2 = [(p.dot(u), p.dot(v)) for p in pts]
    # algebraic least-squares circle (Kasa)
    import numpy as np
    A = np.array([[2 * x, 2 * y, 1.0] for x, y in P2])
    bb = np.array([x * x + y * y for x, y in P2])
    cx, cy, c0 = np.linalg.lstsq(A, bb, rcond=None)[0]
    r = math.sqrt(max(c0 + cx * cx + cy * cy, 0.0))
    kmid = sum(p.dot(K) for p in pts) / len(pts)
    centre = u * cx + v * cy + K * kmid
    up = -K  # pole "up" (thumb side) in hand-local
    return dict(centre=tuple(round(x, 4) for x in centre), radius=round(r, 4), pole_up=tuple(round(x, 4) for x in up),
                hand_bone_len=round(hand.bone.length, 4))



# ----------------------------------------------------------------------------- flag-bang phrase
BANG_IMPACTS = (306, 324, 342)             # frames (30 fps) where the pole tip hits the floor; 18 frames = 100 bpm
POLE_BELOW = 1.0 / 1.22                    # pole length below the grip in MODEL metres (web: 1.0 m / AVATAR_SCALE)
BANG_TIP_XY = (-0.45, -0.30)               # planted tip: world X (character's right = -X), Y (-Y = forward)
BANG_PRIOR = dict(aabR=48, aswR=10, afwR=30, aflR=32)   # relaxed arm the IK stays near
BANG_W = (278, 290, 362, 374)              # IK weight: 0 at [0], 1 over [1]..[2], back to 0 at [3]
# tip height above the floor: (frame, metres, ease into the NEXT point)
BANG_TIPZ = [(278, 0.80, "S"), (297, 0.82, "I"), (306, 0.0, "O"), (310, 0.10, "S"), (315, 0.62, "I"),
             (324, 0.0, "O"), (328, 0.10, "S"), (333, 0.62, "I"), (342, 0.0, "O"), (346, 0.08, "O"),
             (351, 0.0, "S"), (374, 0.0, "S")]
GRIP = {}
BANG_LOG = {}


def _sstep(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def bang_w(f):
    a, b, c, d = BANG_W
    return _sstep((f - a) / (b - a)) if f < c else 1.0 - _sstep((f - c) / (d - c))


def bang_tipz(f):
    pts = BANG_TIPZ
    for (f0, z0, e), (f1, z1, _) in zip(pts, pts[1:]):
        if f0 <= f <= f1:
            u = (f - f0) / (f1 - f0)
            k = {"I": u * u, "O": 1 - (1 - u) ** 2}.get(e, _sstep(u))
            return z0 + (z1 - z0) * k
    return pts[-1][1]


def grip_world(arm):
    """(grip centre, pole-up unit vector) in world metres, from the fist-cavity fit in GRIP."""
    M = arm.matrix_world @ C.pbone(arm, "RightHand").matrix
    return M @ Vector(GRIP["centre"]), (M.to_3x3() @ Vector(GRIP["pole_up"])).normalized()


_WARM = {}


def solve_bang_arm(arm, P, w, posefn):
    """Move the right-arm params + wrist so the grip centre sits on the planted pole tip (+ POLE_BELOW along the
    pole) and the GRIP pole axis (what the web draws) points at the wanted tilt, blended by w with the keyed arm
    pose. Returns (P, tip position, tilt deg, grip error m)."""
    import numpy as np
    names = ["aabR", "aswR", "afwR", "aflR", "pside", "pfwd"]
    nat = [P[n] for n in names]
    posefn(P)
    c_nat, _ = grip_world(arm)
    tz = bang_tipz(P["_f"])
    fwd = 2.0 + 6.0 * min(tz / 0.82, 1.0)
    pw = Rm("Z", P["spin"]) @ Vector((0.0, -math.tan(math.radians(fwd)), 1.0)).normalized()
    tip = Vector((BANG_TIP_XY[0], BANG_TIP_XY[1], _sole_points(arm)[1] + tz))
    target = c_nat.lerp(tip + pw * POLE_BELOW, w)
    prior = np.array([(1 - w) * a + w * BANG_PRIOR.get(n, 0.0) for a, n in zip(nat, names)], float)
    x = np.array(_WARM.get("x", prior), float) if w > 0.5 and "x" in _WARM else prior.copy()
    wt = np.array([0.0008] * 4 + [0.001] * 2)

    def resid(x):
        for n, v in zip(names, x):
            P[n] = float(v)
        posefn(P)
        c, up = grip_world(arm)
        return np.array(list(c - target) + list((up - (pw if w > 0.5 else up)) * 0.6 * w) + list(wt * (x - prior)))

    lam = 1e-3
    for _ in range(12):
        r0 = resid(x)
        J = np.zeros((len(r0), 6))
        for i in range(6):
            xi = x.copy()
            xi[i] += 1.0
            J[:, i] = resid(xi) - r0
        dx = -np.linalg.solve(J.T @ J + lam * np.eye(6), J.T @ r0)
        dx = np.clip(dx, -25, 25)
        xn = x + dx
        xn[0], xn[3] = min(max(xn[0], 0), 180), min(max(xn[3], 0), 140)
        if np.linalg.norm(resid(xn)) < np.linalg.norm(r0):
            x, lam = xn, lam * 0.5
        else:
            lam *= 4
    r0 = resid(x)
    _WARM["x"] = x
    c, up = grip_world(arm)
    tip_w = c - up * POLE_BELOW
    return P, tip_w, math.degrees(math.acos(min(up.z, 1.0))), float(np.linalg.norm((c - target)))


# ----------------------------------------------------------------------------- Idle
ARMS_DOWN = {
    "LeftArm": [("Y", 70), ("Z", -6)], "RightArm": [("Y", -70), ("Z", 6)],
    "LeftForeArm": [("Z", -14)], "RightForeArm": [("Z", 14)],
}


def idle_pose(ph):
    """Breathing + slight sway; ph in [-1, 1]."""
    p = {k: list(v) for k, v in ARMS_DOWN.items()}
    p["Spine1"] = [("X", -1.2 * max(ph, 0)), ("Y", 0.8 * ph)]
    p["Spine2"] = [("X", -1.6 * max(ph, 0))]
    p["Neck"] = [("X", 0.6 * max(ph, 0))]
    p["Head"] = [("X", 1.0 * max(ph, 0)), ("Y", -0.8 * ph)]
    p["Hips"] = [("Z", 1.5 * ph)]
    p["LeftShoulder"] = [("Y", 1.4 * max(ph, 0))]
    p["RightShoulder"] = [("Y", -1.4 * max(ph, 0))]
    p["LeftArm"].append(("X", 2.0 * ph))
    p["RightArm"].append(("X", -2.0 * ph))
    return p


# ----------------------------------------------------------------------------- body pose builder
# One parameter dict -> a full pose. Angles in degrees. Sides: L / R (the character's own left / right).
#   thX  thigh pitch in the world (negative = forward)   knX  knee flexion   abX  leg abduction (outward +)
#   twX  leg turn-out (knee + foot point outward)        fpX  foot pitch (+ toes down)   toeX toe bend (- up)
#   lean hips pitch (+ forward)  hyaw hips yaw (+ turns left)  hrl hips roll (+ left side down)
#   cyaw / cpt / crl  chest world yaw / pitch / roll       nyaw / npt / nrl  head world yaw / pitch / roll
#   aabX arm angle from hanging (90 = out to the side, 180 = overhead)  aswX forward sweep  afwX forward pitch
#   aflX elbow flexion   wx/wy/wz wrist
STAND = dict(
    thL=0, thR=0, knL=3, knR=3, abL=3, abR=3, twL=6, twR=6, fpL=0, fpR=0, toeL=0, toeR=0,
    lean=0, hyaw=0, hrl=0, cyaw=0, cpt=0, crl=0, nyaw=0, npt=0, nrl=0,
    aabL=24, aabR=24, aswL=0, aswR=0, afwL=0, afwR=0, aflL=14, aflR=14,
    wxL=0, wxR=0, wyL=0, wyR=0, wzL=0, wzR=0,
    curlL=0, curlR=0,             # finger curl 0 (flat) .. 1 (full fist / pole grip)
    polew=0, pside=0, pfwd=45,    # right hand on the pole: blend, pole tilt toward the left / forward (deg)
    spin=0,                       # whole-body yaw (deg) about the vertical, for the spin
)

# finger joint angles (deg: knuckle, middle, tip) at full curl; the right-hand grip is sized for a 3 cm pole
FINGER_FULL = {"Index": (58, 80, 52), "Middle": (62, 82, 52), "Ring": (66, 82, 50), "Pinky": (70, 80, 48)}
THUMB_FULL = ((28, 40), (42, 0), (35, 0))   # per joint: (about Z, about Y) degrees at full curl


def finger_pose(side, curl):
    """Finger + thumb entries for one hand. Curl is about the knuckle axis (world Y at rest); sign flips per side."""
    sg = 1 if side == "Left" else -1
    out = {}
    for fn, angs in FINGER_FULL.items():
        for j, a in enumerate(angs, 1):
            out[f"{side}Hand{fn}{j}"] = [("Y", sg * a * curl)]
    for j, (az, ay) in enumerate(THUMB_FULL, 1):
        out[f"{side}HandThumb{j}"] = [("Z", sg * az * curl), ("Y", sg * ay * curl)]
    return out


def body_pose(P):
    p = dict(STAND)
    p.update(P)
    Rh = rots_to_R([("X", p["lean"]), ("Y", p["hrl"]), ("Z", p["hyaw"])])
    Rc = rots_to_R([("X", p["cpt"]), ("Y", p["crl"]), ("Z", p["cyaw"])])
    Rn = rots_to_R([("X", p["npt"]), ("Y", p["nrl"]), ("Z", p["nyaw"])])
    pose = {
        "Hips": World(Rh),
        "Spine": World(slerp_R(Rh, Rc, 0.34)), "Spine1": World(slerp_R(Rh, Rc, 0.67)), "Spine2": World(Rc),
        "Neck": World(slerp_R(Rc, Rn, 0.45)), "Head": World(Rn),
    }
    for side, sg in (("Left", 1), ("Right", -1)):
        s = side[0]  # "L" / "R"
        th, kn, ab, tw = p["th" + s], p["kn" + s], p["ab" + s], p["tw" + s]
        # twist about the leg's own axis first (toes out), then abduct (left outward = -Y), then pitch
        Rt = rots_to_R([("Z", sg * tw), ("Y", -sg * ab), ("X", th)])
        pose[side + "UpLeg"] = World(Rt)
        pose[side + "Leg"] = [("X", kn)]
        pose[side + "Foot"] = World(rots_to_R([("X", p["fp" + s]), ("Z", sg * tw)]))
        pose[side + "ToeBase"] = [("X", p["toe" + s])]
        # arm: sweep forward (horizontal), then raise from hanging, then pitch forward
        pose[side + "Arm"] = [("Z", -sg * p["asw" + s]), ("Y", sg * (90 - p["aab" + s])), ("X", -p["afw" + s])]
        pose[side + "ForeArm"] = [("Z", -sg * p["afl" + s])]
        plain = [("Z", -sg * p["wz" + s]), ("Y", p["wy" + s]), ("X", p["wx" + s])]
        pose[side + "Hand"] = plain
        if p["curl" + s] > 0:
            pose.update(finger_pose(side, p["curl" + s]))
        if s == "R" and p["polew"] > 0:
            pose["RightHand"] = Pole(p["pside"], p["pfwd"], p["spin"], p["polew"], plain)
    if p["spin"]:
        Rs = Rm("Z", p["spin"])
        for k, v in pose.items():
            if isinstance(v, World):
                v.R = Rs @ v.R
    return pose


# ----------------------------------------------------------------------------- periodic tables
def cyc(rows, q):
    """Periodic cubic Hermite through rows[(phase, v0, v1, ...)]; phases ascend over [0, 1) and row 0 is phase 0."""
    q %= 1.0
    n = len(rows)
    ks = [r[0] for r in rows] + [1.0]
    vs = [r[1:] for r in rows] + [rows[0][1:]]
    i = max(j for j in range(n) if ks[j] <= q + 1e-9)
    t0, t1 = ks[i], ks[i + 1]
    u = (q - t0) / (t1 - t0)
    out = []
    for c in range(len(vs[0])):
        v = [vs[j][c] for j in range(n + 1)]
        prev_k, prev_v = (ks[i - 1] if i > 0 else ks[n - 1] - 1.0), (v[i - 1] if i > 0 else v[n - 1])
        nxt_k, nxt_v = (ks[i + 2] if i + 2 <= n else ks[1] + 1.0), (v[i + 2] if i + 2 <= n else v[1])
        m0 = (v[i + 1] - prev_v) / (t1 - prev_k) * (t1 - t0)
        m1 = (nxt_v - v[i]) / (nxt_k - t0) * (t1 - t0)
        h00, h10, h01, h11 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u, -2 * u**3 + 3 * u**2, u**3 - u**2
        out.append(h00 * v[i] + h10 * m0 + h01 * v[i + 1] + h11 * m1)
    return out


# (leg phase, thigh pitch, knee flexion, world foot pitch). Phase 0 = this foot's contact.
RUN_LEG = [
    (0.00, -40, 14, -6), (0.09, -25, 32, 0), (0.19, -3, 43, 2), (0.30, 21, 22, 16), (0.38, 35, 8, 34),
    (0.48, 34, 46, 38), (0.58, 16, 88, 34), (0.70, -12, 86, 26), (0.80, -34, 62, 16), (0.90, -42, 32, 4),
]
WALK_LEG = [
    (0.00, -26, 4, -12), (0.12, -14, 14, 0), (0.25, 0, 10, 0), (0.40, 16, 6, 6), (0.52, 24, 18, 22),
    (0.60, 24, 36, 35), (0.70, 12, 58, 30), (0.80, -4, 46, 18), (0.90, -18, 22, 6),
]

GAITS = {
    "Run": dict(frames=21, legs=RUN_LEG, stance=0.38, thmax=40, lean=6.5, spine_lean=3, hyaw=9, cyaw=13,
                arm=52, elbow=92, elbow_var=16, sway=0.016, roll=2.5, air=0.06, air_win=(0.38, 0.50),
                head_pitch=3.0, abd=22, fist=0.55, lock_v=4.2811),
    "Walk": dict(frames=32, legs=WALK_LEG, stance=0.62, thmax=26, lean=1.5, spine_lean=1, hyaw=5, cyaw=5,
                 arm=17, elbow=20, elbow_var=6, sway=0.026, roll=2.0, air=0.0, air_win=(0, 0),
                 head_pitch=0.0, abd=24),
}


def gait_params(g, p):
    """Body parameters for gait phase p in [0, 1) (left foot contact at 0, right at 0.5)."""
    qL, qR = p % 1.0, (p + 0.5) % 1.0
    out = {}
    th = {}
    for s, q in (("L", qL), ("R", qR)):
        t, k, fp = cyc(g["legs"], q)
        th[s] = t
        toe = 0.0
        if q < g["stance"] + 0.04:  # toes bend up as the heel rises, before toe-off
            toe = -0.85 * max(0.0, fp - 5) * min(1.0, (g["stance"] + 0.04 - q) * 25)
        else:
            toe = 6.0
        out.update({"th" + s: t, "kn" + s: k, "fp" + s: fp, "toe" + s: toe, "ab" + s: 3.5, "tw" + s: 3})
    u = (th["L"] - th["R"]) / (2.0 * g["thmax"])  # +1 = right leg fully forward
    sw = math.sin(2 * math.pi * (p + 0.13))  # +1 = weight over the left foot
    out["hyaw"] = g["hyaw"] * u
    out["cyaw"] = -g["cyaw"] * u
    out["lean"] = g["lean"]
    out["cpt"] = g["lean"] + g["spine_lean"]
    out["hrl"] = -g["roll"] * sw  # swing-side hip drops
    out["crl"] = 0.55 * g["roll"] * sw
    out["nyaw"] = 0.0
    out["npt"] = g["head_pitch"]
    out["nrl"] = 0.0
    # arms swing opposite the legs, with a slight lag; the elbow bends more as the hand comes forward
    ua = cyc_u(g, p - 0.04)
    for s, sign in (("L", 1), ("R", -1)):
        fwd = sign * ua  # +1 = this hand forward
        out["asw" + s] = g["arm"] * fwd
        out["aab" + s] = g["abd"]
        out["afl" + s] = g["elbow"] + g["elbow_var"] * fwd
        out["wx" + s] = -6 * fwd
        if g.get("fist"):
            out["curl" + s] = g["fist"]
    return out, sw


def cyc_u(g, p):
    qL, qR = p % 1.0, (p + 0.5) % 1.0
    return (cyc(g["legs"], qL)[0] - cyc(g["legs"], qR)[0]) / (2.0 * g["thmax"])


def air_lift(g, p):
    a, b = g["air_win"]
    if g["air"] <= 0:
        return 0.0
    amount = 0.0
    for off in (0.0, 0.5):
        q = (p + off) % 1.0
        if a <= q <= b:
            amount = max(amount, math.sin(math.pi * (q - a) / (b - a)))
    return g["air"] * amount


def foot_state(arm, side):
    """(ball xy, lowest sole point height above the ground) of one foot at the current pose."""
    pts, z0 = _sole_points(arm)
    mw = arm.matrix_world
    ps = pts[0:3] if side == "L" else pts[3:6]
    zs, ball = [], None
    for k, (pb, p) in enumerate(ps):
        q = (mw @ pb.matrix) @ (mw @ pb.bone.matrix_local).inverted() @ p
        zs.append(q.z - z0)
        if k == 1:
            ball = Vector((q.x, q.y))
    return ball, min(zs)


LEG_VARS = ("th", "ab", "kn")


def solve_foot(arm, P, s, target, w, drop, lift, off, sway, use_z=True):
    """Adjust this leg's thigh pitch / abduction / knee so the ball sits on `target` and the sole on the floor."""
    import numpy as np

    def res(PP):
        apply_pose(arm, body_pose(PP), sway=sway, lift=lift, drop=drop, off=off)
        b, z = foot_state(arm, s)
        return np.array([b.x - target.x, b.y - target.y, (z - lift) if use_z else 0.0])

    r = res(P)
    for _ in range(8):
        if np.abs(r).max() < 3e-4 or w <= 0:
            break
        J = np.zeros((3, 3))
        for c, v in enumerate(LEG_VARS):
            PP = dict(P)
            PP[v + s] = P[v + s] + 1.0
            J[:, c] = res(PP) - r
        dx = np.linalg.solve(J.T @ J + 1e-5 * np.eye(3), -J.T @ (r * w))
        step, ok = 1.0, False
        for _t in range(4):                                   # damped step: accept only if the error shrinks
            Q = dict(P)
            for c, v in enumerate(LEG_VARS):
                Q[v + s] = P[v + s] + float(np.clip(dx[c] * step, -15, 15))
            rq = res(Q)
            if np.linalg.norm(rq) < np.linalg.norm(r):
                P, r, ok = Q, rq, True
                break
            step *= 0.5
        if not ok:
            res(P)
            break
    return P, r


def sole_world(arm):
    """World positions of the 6 sole points (heel/ball/toe, left then right) at the current pose."""
    pts, z0 = _sole_points(arm)
    mw = arm.matrix_world
    return [(mw @ pb.matrix) @ (mw @ pb.bone.matrix_local).inverted() @ p for pb, p in pts], z0


def make_gait(arm, name, g):
    arm.animation_data.action = None
    n = g["frames"]
    foot_y = {"L": [], "R": []}
    foot_low = {"L": [], "R": []}
    hips_z, sole_tr = [], []
    lock_v = g.get("lock_v")
    td = {}
    if lock_v:   # touchdown ball position of each foot (left at phase 0, right at 0.5)
        for sd, ph in (("L", 0.0), ("R", 0.5)):
            prm0, sw0 = gait_params(g, ph)
            apply_pose(arm, body_pose(prm0), sway=g["sway"] * sw0, lift=0.0, ground=True)
            td[sd] = foot_state(arm, sd)[0]
    for f in range(n + 1):
        p = f / n
        prm, sw = gait_params(g, p)
        lift, sway = air_lift(g, p), g["sway"] * sw
        drop = apply_pose(arm, body_pose(prm), sway=sway, lift=lift, ground=True)
        if lock_v:   # stance foot: ball travels back at exactly the ground speed (no sliding), others free
            for sd, off in (("L", 0.0), ("R", 0.5)):
                q = (p + off) % 1.0
                if q < g["stance"]:
                    ss = lambda x: (lambda u: u * u * (3 - 2 * u))(min(max(x, 0.0), 1.0))
                    w = ss(q / 0.05) * ss((g["stance"] - q) / 0.06)
                    tgt = Vector((td[sd].x, td[sd].y + lock_v * q * n / FPS))
                    prm, _ = solve_foot(arm, prm, sd, tgt, w, drop, lift, (0.0, 0.0), sway, use_z=False)
            apply_pose(arm, body_pose(prm), sway=sway, lift=lift, ground=True)
        key_all(arm, f)
        hips_z.append((arm.matrix_world @ C.pbone(arm, "Hips").head).z)
        sole_tr.append(sole_world(arm))
        for s, side in (("L", "Left"), ("R", "Right")):
            foot = C.pbone(arm, side + "Foot")
            foot_y[s].append((arm.matrix_world @ foot.head).y)
            foot_low[s].append((arm.matrix_world @ foot.head).z)
    act = arm.animation_data.action
    act.name = name
    act.use_fake_user = True
    # ground speed: slope of the planted foot's ankle (it moves backward, +Y, at the ground speed)
    speeds = []
    for s in ("L", "R"):
        zmin = min(foot_low[s])
        planted = [i for i in range(n) if foot_low[s][i] < zmin + 0.045 and foot_low[s][i + 1] < zmin + 0.045]
        for i in planted:
            speeds.append((foot_y[s][i + 1] - foot_y[s][i]) * FPS)
    speeds.sort()
    v = speeds[len(speeds) // 2] if speeds else 0.0
    # sole points in contact (< 1.2 cm above the floor in two successive frames) must travel back at the ground speed
    cs = []
    for i in range(n):
        for k in range(6):
            (a, z0), (b, _) = sole_tr[i], sole_tr[i + 1]
            if a[k].z - z0 < 0.012 and b[k].z - z0 < 0.012:
                cs.append((b[k].y - a[k].y) * FPS)
    cs.sort()
    cv = cs[len(cs) // 2] if cs else 0.0
    slide = max((abs(x - cv) for x in cs), default=0.0)
    C.log(name, "contact point speeds (m/s):", [round(x, 2) for x in cs])
    GAIT_INFO[name] = dict(frames=n, duration=n / FPS, ground_speed=v, stride=v * n / FPS,
                           hips_z_min=min(hips_z), hips_z_max=max(hips_z), planted_frames=len(speeds),
                           contact_speed=cv, contact_speed_dev=slide, contact_samples=len(cs))
    C.log(name, GAIT_INFO[name])
    return act


# ----------------------------------------------------------------------------- Dance (15 s, v2)
# A joyful guardian dance in 25 counts of 18 frames (100 bpm), 450 frames = 15.0 s. Frame 0 and the last frame are
# EXACTLY Idle's t=0 pose (the web plays Dance once and eases back to Idle). Phrases:
#   1  stomps and a half-turn (counts 0-9)        2  FLAG WAVE overhead (9-13.5)       3  one-foot SPIN (13.5-15.5)
#   4  big side-to-side FLAG SWEEP (15.5-19.3)    5  step-together + DEEP BOW (19.3-24)  6  settle to Idle
# The right hand holds a pole (fist closed around a 3 cm cylinder, `Pole` + `curlR`) from frame ~8 to ~441.
# Everything is sampled per frame from a key table (params, not bones), then planted feet are locked to the floor.
def dp(**kw):
    return kw


def _idle_arm_params():
    """Dance-style arm parameters (aab, asw, afw) that reproduce Idle's t=0 arm rotations exactly."""
    out = {}
    for s, sg, rots in (("L", 1, ARMS_DOWN["LeftArm"]), ("R", -1, ARMS_DOWN["RightArm"])):
        e = rots_to_R(rots).to_euler("ZYX")
        out["aab" + s] = 90 - sg * math.degrees(e.y)
        out["asw" + s] = -sg * math.degrees(e.z)
        out["afw" + s] = -math.degrees(e.x)
    return out


IDLE_BASE = dict(knL=0, knR=0, abL=0, abR=0, twL=0, twR=0, aflL=14, aflR=14, **_idle_arm_params())
DANCE_BASE = dict(IDLE_BASE, curlL=0.22, curlR=1.0, polew=1.0, pside=-25, pfwd=40)
IDLE_KEY = dict(curlL=0, curlR=0, polew=0)

# Stances. Left = +X side of the character.
WIDE = dict(thL=-24, thR=-24, knL=58, knR=58, abL=30, abR=30, twL=20, twR=20, lean=5, cpt=7,
            aabL=48, aabR=48, aswL=8, aswR=8, aflL=32, aflR=32, npt=-3)


def wide(**kw):
    p = dict(WIDE)
    p.update(kw)
    return p


def flag(**kw):
    """A medium, bouncy stance for the flag phrases (right arm high, pole up)."""
    p = wide(thL=-20, thR=-20, knL=40, knR=40, abL=22, abR=22, twL=14, twR=14, lean=3, cpt=2,
             aabL=88, aflL=22, aswL=0, aswR=0, aabR=160, aflR=34, npt=-5, pside=0, pfwd=4)
    p.update(kw)
    return p


def idle_stand(**kw):
    p = dict(IDLE_BASE)
    p.update(kw)
    return p


def dance_keys():
    """[dict(f, P, lift, sway, hy, seg, plant)]. plant = feet on the floor for the segment that FOLLOWS the key."""
    K = []

    def key(f, P, lift=0.0, sway=0.0, hy=0.0, seg=("BEZIER", "AUTO"), plant="LR"):
        K.append(dict(f=f, P=P, lift=lift, sway=sway, hy=hy, seg=seg, plant=plant))

    # ---- 1: stomp and turn (counts 0-9)
    key(0, dict(IDLE_KEY))                                                            # exact Idle t=0
    key(8, dp(lean=-1, aabL=20, aabR=20, aflL=8, aflR=8, npt=2, cpt=-2))                # anticipation: tall, grip closes
    key(18, wide(nrl=-9, nyaw=8), seg=("SINE", "EASE_OUT"), plant="L")                  # sink; right foot starts to lift
    key(27, wide(thR=-62, knR=108, abR=20, thL=-22, knL=62, lean=4, nrl=10, hrl=-3, crl=5,
                 aabR=125, aflR=55, aswR=-10, aabL=78, aflL=22, wzR=-10, nyaw=-8, pfwd=15), sway=0.05,
        seg=("QUAD", "EASE_IN"), plant="L")                                            # stomp right: lift
    key(35, wide(thR=-24, knR=64, lean=7, aabL=92, aabR=92, aflL=10, aflR=10, aswL=22, aswR=22,
                 wxL=30, wxR=30, nrl=-4), seg=("QUAD", "EASE_OUT"))                   # STOMP
    key(42, wide(lean=4, aabL=86, aabR=86, aflL=18, aflR=18, wxL=-14, wxR=-14, nrl=-8, nyaw=6), plant="L")
    key(54, wide(thL=-20, knL=72, thR=-16, knR=28, abR=40, fpR=18, lean=6, hrl=4, crl=-5,
                 aabL=150, aabR=34, aflL=30, aflR=40, aswL=20, nrl=-12, nyaw=10), sway=0.075, plant="L")
    key(63, wide(thL=-20, knL=68, thR=-30, knR=92, abR=22, lean=5, aabL=128, aabR=62, aflL=26, nrl=-9),
        sway=0.06, seg=("QUAD", "EASE_IN"), plant="L")
    key(72, wide(thL=-22, knL=62, thR=-24, knR=62, lean=7, aabL=92, aabR=92, aflL=10, aflR=10, aswL=20,
                 aswR=20, wxL=28, wxR=28), sway=0.02, seg=("QUAD", "EASE_OUT"))      # STOMP
    key(80, wide(lean=4, aabL=70, aabR=70, aflL=24, aflR=24, wxL=-12, wxR=-12))
    key(90, wide(thL=-34, thR=-34, knL=88, knR=88, lean=14, cpt=18, aabL=22, aabR=22, aswL=-30, aswR=-30,
                 aflL=16, aflR=16, npt=-8), seg=("QUAD", "EASE_IN"), plant="")
    key(98, wide(thL=-30, thR=-30, knL=70, knR=70, abL=26, abR=26, lean=2, cpt=-2, aabL=100, aabR=100,
                 aswL=45, aswR=45, aflL=20, aflR=20, npt=-2), lift=0.12, seg=("QUAD", "EASE_OUT"), plant="")  # hop
    key(107, wide(thL=-26, thR=-26, knL=74, knR=74, lean=9, cpt=10, aabL=60, aabR=60, aswL=10, aswR=10))  # land, soft
    key(120, wide(hyaw=38, cyaw=74, nyaw=118, thL=-24, knL=58, lean=5, aabL=88, aabR=108, aswL=-20,
                  aswR=50, aflL=14, aflR=30, wxR=-20, wzR=15, nrl=8, npt=-4), sway=-0.02)   # half-turn: pelvis, chest, head
    key(130, wide(hyaw=52, cyaw=98, nyaw=148, thL=-30, knL=64, thR=-18, knR=50, abR=36, lean=6,
                  aabL=70, aabR=150, aswL=-35, aswR=30, aflL=40, aflR=20, wxR=30, wzR=-20, nrl=-8, npt=-6),
        sway=-0.03, seg=("QUAD", "EASE_IN"))                                              # facing back
    key(138, wide(hyaw=50, cyaw=96, nyaw=146, thL=-26, knL=70, thR=-24, knR=64, lean=9, aabL=92, aabR=92,
                  aswL=10, aswR=10, aflL=10, aflR=10, wxL=32, wxR=32), seg=("QUAD", "EASE_OUT"))   # stomp
    key(146, wide(hyaw=48, cyaw=92, nyaw=140, aabL=80, aabR=80, aflL=22, aflR=22, wxL=-18, wxR=-18))
    key(158, wide(hyaw=8, cyaw=14, nyaw=18, thL=-30, thR=-30, knL=84, knR=84, lean=12, cpt=14, aabL=30,
                  aabR=30, aswL=-25, aswR=-25), seg=("QUAD", "EASE_IN"), plant="")        # unwind, load the hop
    key(165, flag(thL=-28, thR=-28, knL=64, knR=64, abL=30, abR=30, lean=2, cpt=-2, aabL=150, aabR=165,
                  aflL=18, aflR=20, npt=3), lift=0.11, seg=("QUAD", "EASE_OUT"), plant="")  # hop: FLAG UP
    # ---- 2: FLAG WAVE overhead (frames 173-245): seven half-count waves, hips sway and knees bounce on the beat
    key(173, flag(knL=44, knR=44), seg=("QUAD", "EASE_OUT"))                              # land, flag high
    for k in range(1, 8):
        s = 1 if k % 2 else -1
        key(173 + 9 * k, flag(aabR=158 + 20 * s, aflR=36 - 10 * s, pside=32 * s, pfwd=6, aabL=90 - 18 * s,
                              aflL=22, wxL=16 * s, knL=36 + 8 * s, knR=36 - 8 * s, hrl=-3 * s, crl=-5 * s,
                              cyaw=8 * s, nyaw=10 * s, nrl=-6 * s, npt=-6), sway=0.03 * s)
    # ---- 3: SPIN on the left foot (frames 245-278), right foot in passe, flag overhead
    sa = dict(aabR=170, aflR=20, pside=0, pfwd=0, aabL=100, aflL=12, aswL=0, npt=-2)
    key(245, flag(spin=-32, knL=60, knR=48, **sa), plant="L")                            # coil, right foot lifts
    key(252, idle_stand(spin=40, thL=-4, knL=16, fpL=38, thR=-74, knR=124, abR=36, twR=40, **sa), plant="L")
    key(259, idle_stand(spin=140, thL=-2, knL=8, fpL=40, thR=-76, knR=126, abR=38, twR=42, **sa), plant="L")
    key(266, idle_stand(spin=250, thL=-2, knL=8, fpL=40, thR=-70, knR=120, abR=34, twR=40, **sa), plant="L")
    key(272, idle_stand(spin=335, thL=-14, knL=34, fpL=14, thR=-36, knR=58, abR=26, twR=24, lean=3, **sa),
        plant="L")
    key(278, wide(spin=360, knL=62, knR=62, aabR=120, aflR=30, pside=-30, pfwd=8, aabL=60, aflL=22),
        seg=("QUAD", "EASE_OUT"))                                                         # land wide
    # ---- 4: FLAG BANG (frames 278-374): raise the pole, then drive its tip into the floor 3 times on the beat
    # (impacts at BANG_IMPACTS, 100 bpm = 18 frames). Legs/torso are keyed here; the right arm is solved per frame
    # by `solve_bang_arm` so the grip follows a planted pole tip (see BANG_TIPZ).
    SW = dict(spin=360)
    dip = dict(thL=-34, thR=-32, knL=84, knR=80, abL=30, abR=28, twL=20, twR=20, lean=20, cpt=16, npt=-9,
               aabL=64, aflL=30, aswL=0, aswR=0, **SW)
    for n, F in enumerate(BANG_IMPACTS):
        key(F - 9, wide(thL=-20, thR=-20, knL=40, knR=40, abL=22, abR=22, twL=14, twR=14, lean=0, cpt=-3,
                        aabL=125, aflL=18, aswL=0, aswR=0, npt=-4, **SW), plant="L")     # tall, right foot starts up
        key(F - 5, wide(thR=-58, knR=100, abR=20, thL=-24, knL=50, abL=26, lean=3, cpt=0, aabL=100, aflL=20,
                        aswL=0, aswR=0, npt=-4, **SW), seg=("QUAD", "EASE_IN"), plant="L")   # right knee up
        key(F, wide(**dip), seg=("QUAD", "EASE_OUT"))                                       # STRIKE + stomp
        key(F + 4, wide(thL=-28, thR=-27, knL=66, knR=64, abL=28, abR=26, lean=9, cpt=7, npt=-5, aabL=80,
                        aflL=24, aswL=0, aswR=0, **SW))                                     # rebound
    F = BANG_IMPACTS[-1]
    key(F + 9, wide(**dip), seg=("SINE", "EASE_OUT"))                                      # back on the last strike
    key(F + 20, wide(**dip), seg=("SINE", "EASE_OUT"))                                     # hold
    key(374, flag(knL=60, knR=60, aabR=165, aflR=24, **SW), seg=("QUAD", "EASE_OUT"))   # rise: flag up, land
    # ---- 5: two closing steps, then the DEEP BOW
    key(383, flag(knL=56, knR=70, thL=-22, thR=-18, abL=16, abR=20, aabR=90, aflR=50, pside=-20, pfwd=30,
                  aabL=70, **SW), sway=-0.08, plant="R")                                  # weight right, left foot lifts
    key(391, idle_stand(knL=16, knR=40, abR=24, thR=-16, twR=14, aabR=70, aflR=60, pside=-20, pfwd=45,
                        aabL=60, aflL=40, **SW), sway=-0.10)                              # left foot placed in
    key(398, idle_stand(knL=22, knR=30, abR=16, thR=-10, twR=8, aabR=60, aflR=60, pside=-20, pfwd=45,
                        aabL=60, aflL=40, **SW), sway=-0.02, plant="L")                                                                         # weight left, right foot lifts
    key(405, idle_stand(knL=8, knR=8, aabR=52, aflR=44, pside=-30, pfwd=40, aabL=38, aswL=70, aflL=100, **SW))
    key(418, idle_stand(knL=8, knR=8, lean=76, cpt=26, npt=52, aabR=40, aswR=-20, aflR=24, pside=-55,
                        pfwd=-10, aabL=38, aswL=70, aflL=104, **SW), hy=0.15, seg=("SINE", "EASE_OUT"))  # DEEP BOW
    key(428, idle_stand(knL=8, knR=8, lean=78, cpt=26, npt=54, aabR=40, aswR=-20, aflR=24, pside=-55,
                        pfwd=-10, aabL=38, aswL=70, aflL=104, **SW), hy=0.15)             # hold
    key(441, dict(IDLE_KEY, **SW))                                                        # rise and settle: Idle
    key(450, dict(IDLE_KEY, **SW))
    return K


# per-parameter lag (frames) for follow-through: the head, forearms and wrists trail the body
LAG = {"nyaw": 4, "npt": 4, "nrl": 4, "aflL": 3, "aflR": 3, "wxL": 3, "wxR": 3, "wyL": 3, "wyR": 3, "wzL": 3,
       "wzR": 3, "pside": 2, "pfwd": 2}


class ParamTable:
    """Per-frame parameter sampling from a key table (monotone cubic between keys, easing on QUAD/SINE segments)."""

    def __init__(self, keys):
        self.keys = keys
        self.f = [k["f"] for k in keys]
        base = dict(STAND)
        base.update(DANCE_BASE)
        names = set(base) | {"lift", "sway", "hy"}
        for k in keys:
            names |= set(k["P"])
        self.vals = {}
        for n in names:
            col = []
            for k in keys:
                if n in ("lift", "sway", "hy"):
                    col.append(k[n])
                else:
                    col.append(k["P"].get(n, base.get(n, 0.0)))
            self.vals[n] = col
        self.tan = {n: self._tangents(col) for n, col in self.vals.items()}

    def _tangents(self, v):
        t, n = self.f, len(self.f)
        m = [0.0] * n
        for i in range(1, n - 1):
            d0, d1 = (v[i] - v[i - 1]) / (t[i] - t[i - 1]), (v[i + 1] - v[i]) / (t[i + 1] - t[i])
            m[i] = 0.0 if d0 * d1 <= 0 else 2 * d0 * d1 / (d0 + d1)
        return m

    def seg_index(self, f):
        i = 0
        while i < len(self.f) - 2 and f >= self.f[i + 1]:
            i += 1
        return i

    def value(self, n, f):
        f = min(max(f, 0), self.f[-1])
        i = self.seg_index(f)
        t0, t1 = self.f[i], self.f[i + 1]
        u = (f - t0) / (t1 - t0)
        v0, v1 = self.vals[n][i], self.vals[n][i + 1]
        interp, ease = self.keys[i]["seg"]
        if interp == "QUAD":
            e = u * u if ease == "EASE_IN" else 1 - (1 - u) ** 2
            return v0 + (v1 - v0) * e
        if interp == "SINE":
            return v0 + (v1 - v0) * math.sin(u * math.pi / 2)
        h = t1 - t0
        m0, m1 = self.tan[n][i] * h, self.tan[n][i + 1] * h
        h00, h10, h01, h11 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u, -2 * u**3 + 3 * u**2, u**3 - u**2
        return h00 * v0 + h10 * m0 + h01 * v1 + h11 * m1

    def sample(self, f):
        P = {n: self.value(n, f - LAG.get(n, 0)) for n in self.vals if n not in ("lift", "sway", "hy")}
        return P, self.value("lift", f), self.value("sway", f), self.value("hy", f)

    def plant_at(self, f):
        """(planted set, {side: lock weight}); a foot leaving the floor is released over 6 frames."""
        i = self.seg_index(f)
        cur = set(self.keys[i]["plant"])
        w = {s: 1.0 for s in cur}
        if i > 0:
            gone = set(self.keys[i - 1]["plant"]) - cur
            k = (f - self.f[i]) / 6.0
            if k < 1.0:
                for s in gone:
                    w[s] = 1.0 - (k * k * (3 - 2 * k))
        return cur, w


def make_dance(arm):
    import numpy as np
    arm.animation_data.action = None
    keys = dance_keys()
    T = ParamTable(keys)
    N = keys[-1]["f"]
    targets, drift = {}, {"L": 0.0, "R": 0.0}
    hips_h = Vector(C.pbone(arm, "Hips").bone.head_local.xy)
    for f in range(N + 1):
        P, lift, sway, hy = T.sample(f)
        cur, wts = T.plant_at(f)
        spin = P["spin"]
        off = (0.0, hy)
        drop = apply_pose(arm, body_pose(P), sway=sway, lift=lift, off=off)   # natural pose, grounded
        for s in "LR":
            if wts.get(s, 0) > 0:
                if s not in targets:
                    targets[s] = foot_state(arm, s)[0]
            else:
                targets.pop(s, None)
        if abs(spin) > 1e-3 and "L" in targets:                                  # pivot the body about the left ball
            for _ in range(3):
                e = targets["L"] - foot_state(arm, "L")[0]
                off = (off[0] + e.x, off[1] + e.y)
                drop = apply_pose(arm, body_pose(P), sway=sway, lift=lift, off=off)
        for s in "LR":
            if s in targets and wts.get(s, 0) > 0:
                P, r = solve_foot(arm, P, s, targets[s], wts[s], drop, lift, off, sway)
                if wts[s] >= 1.0:
                    e = float(np.abs(r[:2]).max())
                    drift[s] = max(drift[s], e)
                    if e > 0.012:
                        C.log("lock miss f", f, s, "xy err", round(e, 3), "z err", round(float(r[2]), 3))
        def posefn(Q):
            apply_pose(arm, body_pose(Q), sway=sway, lift=lift, drop=drop, off=off)

        wb = bang_w(f)
        if wb > 0.0:
            P["_f"] = f
            P, tipw, tilt, err = solve_bang_arm(arm, dict(P), wb, posefn)
            sw_, z0_ = sole_world(arm)
            dR = min(math.hypot(q.x - tipw.x, q.y - tipw.y) for q in sw_[3:])
            dL = min(math.hypot(q.x - tipw.x, q.y - tipw.y) for q in sw_[:3])
            BANG_LOG[f] = dict(w=wb, tipz=tipw.z - z0_, tipxy=(tipw.x, tipw.y), tilt=tilt, err=err,
                               gripz=grip_world(arm)[0].z - z0_, dR=dR, dL=dL)
        posefn(P)
        key_all(arm, f)
    act = arm.animation_data.action
    act.name = "Dance"
    act.use_fake_user = True
    for f in sorted(BANG_LOG):
        if f in BANG_IMPACTS or f % 6 == 0:
            C.log("BANG", f, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in BANG_LOG[f].items()})
    C.log("Dance frames", N, "seconds", N / FPS, "max planted-foot residual (m)", drift)
    return act


def _fcurves(act):
    """fcurves of an action on Blender 4.4+ layered actions."""
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


# ----------------------------------------------------------------------------- entry point
def make_clips(arm):
    sc = bpy.context.scene
    sc.render.fps = FPS
    arm.animation_data_create()
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_viewport]
    for o in meshes:
        o.hide_viewport = True          # skinning is not needed while solving poses (much faster)
    C.select_only(arm)
    bpy.ops.object.mode_set(mode="POSE")
    # ---- Idle: 2 s loop, arms relaxed down, breathing + slight sway
    arm.animation_data.action = None
    for f, ph in ((0, 0.0), (15, 1.0), (30, 0.0), (45, -1.0), (60, 0.0)):
        C.reset_pose(arm)
        apply_pose(arm, idle_pose(ph), lift=0.003 * max(ph, 0), ground=False)
        key_all(arm, f)
    idle = arm.animation_data.action
    idle.name = "Idle"
    idle.use_fake_user = True
    walk = make_gait(arm, "Walk", GAITS["Walk"])
    run = make_gait(arm, "Run", GAITS["Run"])
    GAIT_INFO["Grip"] = GRIP.update(grip_info(arm)) or dict(GRIP)
    dance = make_dance(arm)
    C.log("Grip", GAIT_INFO["Grip"])
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in meshes:
        o.hide_viewport = False
    arm.animation_data.action = idle
    sc.frame_start, sc.frame_end = 0, 60
    sc.frame_set(0)
    C.reset_pose(arm)
    return idle, walk, run, dance
