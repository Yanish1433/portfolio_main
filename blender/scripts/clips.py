"""Animation clips for the Lakhey rig (Mixamo-named MPFB skeleton).

  Idle  : 2 s loop, arms relaxed, breathing + slight sway
  Walk  : 1.2 s in-place loop (heel -> toe, hip sway, counter-rotation, arm swing)
  Run   : 0.8 s in-place loop (contact -> down -> passing -> up, flight phases, forward lean)
  Dance : ~7.2 s masked-dancer routine (low wide stance, stomps, weight shifts, a half-turn and back,
          broad arm sweeps, wrist flicks, head tilts, small hops); starts and ends upright

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


def apply_pose(arm, pose, sway=0.0, lift=0.0, ground=True):
    """Set every bone's rotation from `pose`, then move the hips so the lowest sole point rests on the
    ground (+`lift` metres of air, +`sway` metres to the character's left)."""
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
        else:
            Rl = rots_to_R(v)
        acc[pb.name] = P @ Rl
        pb.rotation_quaternion = q_from_R(arm, pb, Rl)
    hips = C.pbone(arm, "Hips")
    bpy.context.view_layer.update()
    drop = sole_drop(arm) if ground else 0.0
    m3 = (arm.matrix_world.to_3x3() @ hips.bone.matrix_local.to_3x3()).inverted()
    hips.location = m3 @ Vector((sway, 0.0, -drop + lift))
    bpy.context.view_layer.update()


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    C.pbone(arm, "Hips").keyframe_insert("location", frame=frame)


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
)


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
        pose[side + "Hand"] = [("Z", -sg * p["wz" + s]), ("Y", p["wy" + s]), ("X", p["wx" + s])]
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
    "Run": dict(frames=21, legs=RUN_LEG, stance=0.38, thmax=40, lean=15, spine_lean=5, hyaw=10, cyaw=8,
                arm=50, elbow=95, elbow_var=14, sway=0.016, roll=2.5, air=0.06, air_win=(0.38, 0.50),
                head_pitch=1.0, abd=26),
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


def make_gait(arm, name, g):
    arm.animation_data.action = None
    n = g["frames"]
    foot_y = {"L": [], "R": []}
    foot_low = {"L": [], "R": []}
    hips_z = []
    for f in range(n + 1):
        p = f / n
        prm, sw = gait_params(g, p)
        apply_pose(arm, body_pose(prm), sway=g["sway"] * sw, lift=air_lift(g, p), ground=True)
        key_all(arm, f)
        hips_z.append((arm.matrix_world @ C.pbone(arm, "Hips").head).z)
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
    GAIT_INFO[name] = dict(frames=n, duration=n / FPS, ground_speed=v, stride=v * n / FPS,
                           hips_z_min=min(hips_z), hips_z_max=max(hips_z), planted_frames=len(speeds))
    C.log(name, GAIT_INFO[name])
    return act


# ----------------------------------------------------------------------------- Dance
def dp(**kw):
    return kw


# Stances. Left = +X side of the character.
WIDE = dict(thL=-24, thR=-24, knL=58, knR=58, abL=30, abR=30, twL=20, twR=20, lean=5, cpt=7,
            aabL=48, aabR=48, aswL=8, aswR=8, aflL=32, aflR=32, npt=-3)


def wide(**kw):
    p = dict(WIDE)
    p.update(kw)
    return p


def dance_keys():
    """[(frame, params, lift metres, sway metres, (interp, easing) for the segment that follows)]"""
    K = []

    def key(f, P, lift=0.0, sway=0.0, seg=("BEZIER", "AUTO")):
        K.append((f, P, lift, sway, seg))

    # count length: 18 frames (0.6 s, 100 bpm); 12 counts -> 216 frames
    key(0, dict())                                                                   # upright
    key(8, dp(lean=-1, aabL=20, aabR=20, aflL=8, aflR=8, knL=0, knR=0, npt=2, cpt=-2))  # anticipation: tall
    key(18, wide(nrl=-9, nyaw=8), seg=("SINE", "EASE_OUT"))                          # 1 sink into the low wide stance
    # 2: stomp right (lift, hold, strike)
    key(27, wide(thR=-62, knR=108, abR=20, thL=-22, knL=62, lean=4, nrl=10, hrl=-3, crl=5,
                 aabR=125, aflR=55, aswR=-10, aabL=78, aflL=22, wzR=-10, nyaw=-8), sway=0.05,
        seg=("QUAD", "EASE_IN"))
    key(35, wide(thR=-24, knR=64, lean=7, aabL=92, aabR=92, aflL=10, aflR=10, aswL=22, aswR=22,
                 wxL=30, wxR=30, nrl=-4), sway=0.0, seg=("QUAD", "EASE_OUT"))        # STOMP (compressed)
    key(42, wide(lean=4, aabL=86, aabR=86, aflL=18, aflR=18, wxL=-14, wxR=-14, nrl=-8, nyaw=6))  # recoil
    # 3: weight over the left leg, right toe taps, left arm sweeps over the head
    key(54, wide(thL=-20, knL=72, thR=-16, knR=28, abR=40, fpR=18, lean=6, hrl=4, crl=-5,
                 aabL=150, aabR=34, aflL=30, aflR=40, aswL=20, nrl=-12, nyaw=10), sway=0.075)
    key(63, wide(thL=-20, knL=68, thR=-30, knR=92, abR=22, lean=5, aabL=128, aabR=62, aflL=26, nrl=-9),
        sway=0.06, seg=("QUAD", "EASE_IN"))
    key(72, wide(thL=-22, knL=62, thR=-24, knR=62, lean=7, aabL=92, aabR=92, aflL=10, aflR=10, aswL=20,
                 aswR=20, wxL=28, wxR=28), sway=0.02, seg=("QUAD", "EASE_OUT"))      # 4: STOMP
    key(80, wide(lean=4, aabL=70, aabR=70, aflL=24, aflR=24, wxL=-12, wxR=-12))
    # 5: squat, arms swing back (anticipation), then a small hop with a tuck
    key(90, wide(thL=-34, thR=-34, knL=88, knR=88, lean=14, cpt=18, aabL=22, aabR=22, aswL=-30, aswR=-30,
                 aflL=16, aflR=16, npt=-8), seg=("QUAD", "EASE_IN"))
    key(98, wide(thL=-30, thR=-30, knL=70, knR=70, abL=26, abR=26, lean=2, cpt=-2, aabL=100, aabR=100,
                 aswL=45, aswR=45, aflL=20, aflR=20, npt=-2), lift=0.12, seg=("QUAD", "EASE_OUT"))   # in the air
    key(107, wide(thL=-26, thR=-26, knL=74, knR=74, lean=9, cpt=10, aabL=60, aabR=60, aswL=10, aswR=10,
                  fpL=0, fpR=0), seg=("QUAD", "EASE_OUT"))                                 # 6: land, soft
    # twist: pelvis, chest and head open to the left over planted feet (the half-turn)
    key(120, wide(hyaw=38, cyaw=74, nyaw=118, thL=-24, knL=58, lean=5, aabL=88, aabR=108, aswL=-20,
                  aswR=50, aflL=14, aflR=30, wxR=-20, wzR=15, nrl=8, npt=-4), sway=-0.02)
    key(130, wide(hyaw=52, cyaw=98, nyaw=148, thL=-30, knL=64, thR=-18, knR=50, abR=36, lean=6,
                  aabL=70, aabR=150, aswL=-35, aswR=30, aflL=40, aflR=20, wxR=30, wzR=-20, nrl=-8, npt=-6),
        sway=-0.03, seg=("QUAD", "EASE_IN"))                                              # 7: facing back
    key(138, wide(hyaw=50, cyaw=96, nyaw=146, thL=-26, knL=70, thR=-24, knR=64, lean=9, aabL=92, aabR=92,
                  aswL=10, aswR=10, aflL=10, aflR=10, wxL=32, wxR=32), seg=("QUAD", "EASE_OUT"))   # stomp
    key(146, wide(hyaw=48, cyaw=92, nyaw=140, aabL=80, aabR=80, aflL=22, aflR=22, wxL=-18, wxR=-18))
    # 8: unwind with a hop back to the front
    key(158, wide(hyaw=8, cyaw=14, nyaw=18, thL=-30, thR=-30, knL=84, knR=84, lean=12, cpt=14, aabL=30,
                  aabR=30, aswL=-25, aswR=-25), seg=("QUAD", "EASE_IN"))
    key(165, wide(hyaw=0, cyaw=0, nyaw=0, thL=-28, thR=-28, knL=64, knR=64, lean=2, cpt=-2, aabL=150,
                  aabR=150, aflL=18, aflR=18, npt=3), lift=0.11, seg=("QUAD", "EASE_OUT"))    # 9: arms overhead
    key(173, wide(lean=8, aabL=135, aabR=135, aflL=14, aflR=14, thL=-24, thR=-24, knL=62, knR=62), seg=("QUAD", "EASE_OUT"))
    # 10-11: quick stomps right, left with big sweeps
    key(184, wide(thR=-56, knR=100, abR=22, thL=-22, knL=66, aabR=170, aabL=60, aflR=20, aflL=30, nrl=10,
                  lean=5), sway=0.05, seg=("QUAD", "EASE_IN"))
    key(190, wide(thR=-24, knR=66, lean=8, aabL=95, aabR=95, aflL=10, aflR=10, aswL=22, aswR=22, wxL=26,
                  wxR=26), seg=("QUAD", "EASE_OUT"))
    key(198, wide(thL=-56, knL=100, abL=22, thR=-22, knR=66, aabL=170, aabR=60, aflL=20, aflR=30, nrl=-10,
                  lean=5), sway=-0.05, seg=("QUAD", "EASE_IN"))
    key(204, wide(thL=-24, knL=66, lean=8, aabL=95, aabR=95, aflL=10, aflR=10, aswL=22, aswR=22, wxL=26, wxR=26),
        seg=("QUAD", "EASE_OUT"))
    key(212, dp(thL=-8, thR=-8, knL=24, knR=24, abL=10, abR=10, lean=2, aabL=40, aabR=40, aflL=18, aflR=18, npt=4))  # rise
    key(224, dict())                                                                  # settle upright
    return K


def make_dance(arm):
    arm.animation_data.action = None
    K = dance_keys()
    for f, P, lift, sway, seg in K:
        apply_pose(arm, body_pose(P), sway=sway, lift=lift, ground=True)
        key_all(arm, f)
    act = arm.animation_data.action
    act.name = "Dance"
    act.use_fake_user = True
    segs = {f: seg for f, _, _, _, seg in K}
    for fc in act.fcurves if hasattr(act, "fcurves") else _fcurves(act):
        for kp in fc.keyframe_points:
            interp, ease = segs.get(int(round(kp.co[0])), ("BEZIER", "AUTO"))
            kp.interpolation = interp
            kp.easing = ease
    C.log("Dance frames", K[-1][0], "seconds", K[-1][0] / FPS)
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
    dance = make_dance(arm)
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.animation_data.action = idle
    sc.frame_start, sc.frame_end = 0, 60
    sc.frame_set(0)
    C.reset_pose(arm)
    return idle, walk, run, dance
