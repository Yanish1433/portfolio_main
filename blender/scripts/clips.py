"""Shared animation clips for every v2 character (same rig, same clip names).

  Idle  : 2 s loop, arms relaxed, breathing + slight sway
  Dance : 2.5 s in-place loop (low wide stance, stomps, arm sweeps); feet re-grounded per key
Poses are given as WORLD-axis rotations (degrees) per bone at the T-pose rest.
"""
import math

import bpy
from mathutils import Matrix, Vector

import common as C

FPS = 30


def q_world(arm, short, rots):
    """Local quaternion for a sequence of WORLD-axis rotations of the bone at rest."""
    b = C.pbone(arm, short).bone
    m3 = arm.matrix_world.to_3x3() @ b.matrix_local.to_3x3()
    R = Matrix.Identity(3)
    for axis, deg in rots:
        R = Matrix.Rotation(math.radians(deg), 3, axis) @ R
    return (m3.inverted() @ R @ m3).to_quaternion()


def mirror_pose(pose):
    """Left <-> right; rotations about Y and Z flip sign (sagittal mirror)."""
    out = {}
    for b, rots in pose.items():
        nb = b.replace("Left", "#").replace("Right", "Left").replace("#", "Right")
        out[nb] = [(ax, deg if ax == "X" else -deg) for ax, deg in rots]
    return out


def apply_pose(arm, pose, hips_lift=0.0, ground=True):
    """Set rotations, then move the hips vertically so the lowest ankle rests at its rest height."""
    C.reset_pose(arm)
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for b, rots in pose.items():
        C.pbone(arm, b).rotation_quaternion = q_world(arm, b, rots)
    hips = C.pbone(arm, "Hips")
    up_local = (hips.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))).normalized()
    bpy.context.view_layer.update()
    if ground:
        rest = min((arm.matrix_world @ C.pbone(arm, s + "Foot").bone.head_local).z for s in ("Left", "Right"))
        cur = min((arm.matrix_world @ C.pbone(arm, s + "Foot").head).z for s in ("Left", "Right"))
        drop = cur - rest
    else:
        drop = 0.0
    hips.location = up_local * (-drop + hips_lift)
    bpy.context.view_layer.update()


def key_all(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    C.pbone(arm, "Hips").keyframe_insert("location", frame=frame)


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


def dance_pose(lift_right=0.0, lift_left=0.0, sweep=0.0):
    """Low wide stance, right hand raised over the head, left arm out with an open palm."""
    p = {
        "LeftUpLeg": [("Y", -30), ("X", -24 - 26 * lift_left)],
        "RightUpLeg": [("Y", 30), ("X", -24 - 26 * lift_right)],
        "LeftLeg": [("X", 58 + 34 * lift_left)], "RightLeg": [("X", 58 + 34 * lift_right)],
        "LeftFoot": [("X", -30 - 10 * lift_left), ("Y", 22)], "RightFoot": [("X", -30 - 10 * lift_right), ("Y", -22)],
        "Spine": [("X", 5)], "Spine1": [("Y", -3 - 2 * sweep)], "Spine2": [("Y", -2 - 2 * sweep), ("X", 3)],
        "Neck": [("Y", 4)], "Head": [("Y", 7), ("Z", 12 + 6 * sweep), ("X", -4)],
        "RightShoulder": [("Y", 10)],
        "RightArm": [("Y", 84 + 6 * sweep), ("X", 22)], "RightForeArm": [("Y", 28 - 6 * sweep)],
        "RightHand": [("Z", 25), ("Y", -10)],
        "LeftArm": [("Y", 22 - 10 * sweep), ("Z", -28 + 18 * sweep)], "LeftForeArm": [("Z", -22)],
        "LeftHand": [("Y", -38), ("X", 8)],
    }
    return p


def make_clips(arm):
    sc = bpy.context.scene
    sc.render.fps = FPS
    arm.animation_data_create()
    C.select_only(arm)
    bpy.ops.object.mode_set(mode="POSE")
    # ---- Idle: 2 s loop, arms relaxed down, breathing + slight sway
    arm.animation_data.action = None
    for f, ph in ((0, 0.0), (15, 1.0), (30, 0.0), (45, -1.0), (60, 0.0)):
        apply_pose(arm, idle_pose(ph), hips_lift=0.003 * max(ph, 0), ground=False)
        key_all(arm, f)
    idle = arm.animation_data.action
    idle.name = "Idle"
    idle.use_fake_user = True
    # ---- Dance: 2.5 s loop (75 frames): stomp right -> mirror -> stomp left, in place
    arm.animation_data.action = None
    A = dance_pose()
    B = mirror_pose(dance_pose())
    keys = [
        (0, A, -0.012), (12, dance_pose(lift_right=1.0, sweep=0.6), 0.0), (22, dance_pose(sweep=1.0), -0.028),
        (37, B, -0.012), (49, mirror_pose(dance_pose(lift_right=1.0, sweep=0.6)), 0.0),
        (59, mirror_pose(dance_pose(sweep=1.0)), -0.028), (75, A, -0.012),
    ]
    for f, pose, dip in keys:
        apply_pose(arm, pose, hips_lift=dip, ground=True)
        key_all(arm, f)
    dance = arm.animation_data.action
    dance.name = "Dance"
    dance.use_fake_user = True
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.animation_data.action = idle
    sc.frame_start, sc.frame_end = 0, 60
    sc.frame_set(0)
    C.reset_pose(arm)
    return idle, dance


