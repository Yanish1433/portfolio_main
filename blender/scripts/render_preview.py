"""v2 previews: studio look-dev, rendered from the (compressed) .glb so they show what the web shows.

  blender.exe --background --python blender/scripts/render_preview.py -- \
      --glb public/models/lakhey.glb --shots mask_closeup --prefix lakhey [--samples 128] [--quick]

Studio: dark seamless cove, big soft key, cool fill/bounce, warm rim, AgX view transform,
slight depth of field. Cycles on the GPU when available (OptiX/CUDA), OIDN/OptiX denoise.
Shots implemented: mask_closeup (more shots are added with the full character).
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--glb", required=True)
ap.add_argument("--shots", default="mask_closeup")
ap.add_argument("--prefix", default="lakhey")
ap.add_argument("--outdir", default=os.path.join(C.ROOT, "blender", "previews"))
ap.add_argument("--samples", type=int, default=128)
ap.add_argument("--quick", action="store_true")
ap.add_argument("--exposure", type=float, default=-0.5)
ap.add_argument("--lineup", default="public/models/clay.glb,public/models/lakhey.glb,public/models/astro.glb")
args = ap.parse_args(C.script_args())
args.outdir = os.path.abspath(args.outdir)
os.makedirs(args.outdir, exist_ok=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    return [o for o in bpy.data.objects if o not in before]


def cove(color=(0.045, 0.040, 0.040), floor=0.0):
    bm = bmesh.new()
    prof = [(-12.0, floor), (1.5, floor)]
    R, cz = 3.0, floor + 3.0
    for i in range(1, 25):
        a = (math.pi / 2) * i / 24
        prof.append((1.5 + R * math.sin(a), cz - R * math.cos(a)))
    prof.append((1.5 + R, 12.0))
    rows = [(bm.verts.new((-12, y, z)), bm.verts.new((12, y, z))) for y, z in prof]
    for (a0, a1), (b0, b1) in zip(rows[:-1], rows[1:]):
        bm.faces.new((a0, a1, b1, b0))
    me = bpy.data.meshes.new("Cove")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Cove", me)
    C.link(ob)
    C.shade_smooth(ob)
    ob.data.materials.append(C.new_material("CoveMat", color, rough=0.7))
    return ob


def area(name, loc, target, size, energy, color=(1, 1, 1), shape="RECTANGLE", size_y=None, glossy=True):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    ob.visible_glossy = glossy
    C.link(ob)
    return ob


def studio(target, scale=1.0, warm_rim=False):
    """Big soft key (left-front), soft fill (right), warm rim (back-right), floor bounce via world."""
    t = Vector(target)
    s = scale
    area("Key", t + Vector((-1.6, -2.0, 1.4)) * s, t, 1.8 * s, 260 * s * s, (1.0, 0.94, 0.86), size_y=2.4 * s)
    area("Fill", t + Vector((2.2, -1.6, 0.3)) * s, t, 2.5 * s, 55 * s * s, (0.86, 0.92, 1.0), glossy=False)
    rim_col = (1.0, 0.45, 0.2) if warm_rim else (1.0, 0.86, 0.72)
    area("Rim", t + Vector((1.3, 1.6, 0.9)) * s, t, 0.8 * s, 160 * s * s, rim_col, size_y=1.6 * s)
    area("Rim2", t + Vector((-1.5, 1.4, 0.6)) * s, t, 0.6 * s, 70 * s * s, rim_col)
    w = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = w
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.20, 0.19, 0.18, 1)
    bg.inputs["Strength"].default_value = 0.35


def camera(loc, target, lens=85, fstop=None, focus=None):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cam = bpy.data.objects.new("Cam", cd)
    C.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus or (Vector(target) - Vector(loc)).length
    bpy.context.scene.camera = cam
    return cam


def configure(w, h, samples):
    sc = bpy.context.scene
    C.gpu_cycles(samples)
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.cycles.max_bounces = 8
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
        sc.view_settings.exposure = args.exposure
    except Exception:
        pass


def render(name):
    path = os.path.join(args.outdir, f"{args.prefix}_{name}.png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    C.log("RENDERED", path)


def armature(objs):
    return next((o for o in objs if o.type == "ARMATURE"), None)


def set_clip(arm, name, seconds):
    """Show an imported action at a time in seconds (NLA muted so only this clip plays)."""
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    act = next(a for a in bpy.data.actions if a.name.startswith(name))
    ad.action = act
    try:
        if getattr(act, "slots", None) and len(act.slots):
            ad.action_slot = act.slots[0]
    except Exception:
        pass
    sc = bpy.context.scene
    sc.frame_set(int(round(seconds * sc.render.fps)))


def clear_clip(arm):
    ad = arm.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
        ad.action = None
    C.reset_pose(arm)


def walk_pose(arm):
    clear_clip(arm)
    for b, ax, d in (("LeftUpLeg", "X", -32), ("LeftLeg", "X", 14), ("RightUpLeg", "X", 22), ("RightLeg", "X", 34),
                     ("RightFoot", "X", -10), ("LeftArm", "Y", 70), ("LeftArm", "X", 22), ("RightArm", "Y", -70),
                     ("RightArm", "X", -22), ("LeftForeArm", "Z", -20), ("RightForeArm", "Z", 20)):
        C.rotate_bone_world(arm, b, ax, d)


def roots(objs):
    return [o for o in objs if o.parent is None]


def body_shot(objs, name, az, clip=("Idle", 0.0), warm=False, lens=85, dist=5.4, el=1.15, tgt_z=0.95):
    arm = armature(objs)
    set_clip(arm, *clip)
    cove(floor=0.0, color=(0.06, 0.05, 0.05) if not warm else (0.03, 0.02, 0.02))
    tgt = (0, 0, tgt_z)
    studio(tgt, scale=1.0, warm_rim=warm)
    if az >= 150:                      # turn the character, not the camera (the cove wall is behind)
        rz = Matrix.Rotation(math.radians(az), 4, "Z")
        for o in roots(objs):
            o.matrix_world = rz @ o.matrix_world
        az = 0
    a = math.radians(az)
    camera((math.sin(a) * dist, -math.cos(a) * dist, el), tgt, lens=lens, fstop=5.6 if not args.quick else None)
    s = 640 if args.quick else 1280
    configure(s, s, 16 if args.quick else args.samples)
    render(name)


def shot_front(objs):
    body_shot(objs, "front", 0)


def shot_34(objs):
    body_shot(objs, "34", 36)


def shot_back(objs):
    body_shot(objs, "back", 180)


def shot_dance(objs):
    body_shot(objs, "dance", 28, clip=("Dance", 0.0), warm=True, dist=5.0, el=0.75, tgt_z=0.85)


def shot_testpose(objs):
    """Two copies: walk extreme (left) and the low dance stance mid-sweep (right)."""
    objs2 = import_glb(args.glb)
    for o in roots(objs):
        o.location.x -= 0.75
    for o in roots(objs2):
        o.location.x += 0.75
    walk_pose(armature(objs))
    set_clip(armature(objs2), "Dance", 22 / 30)
    cove(floor=0.0)
    tgt = (0, 0, 0.9)
    studio(tgt, scale=1.25)
    camera((1.6, -5.6, 1.1), tgt, lens=50)
    w, h = (800, 450) if args.quick else (1600, 900)
    configure(w, h, 16 if args.quick else args.samples)
    render("testpose")


def head_closeup(objs, name):
    arm = armature(objs)
    set_clip(arm, "Idle", 0.0)
    tgt = (0, -0.10, 1.62)
    cove(floor=0.0)
    studio(tgt, scale=0.55)
    camera((0.42, -1.05, 1.70), tgt, lens=85, fstop=4.0, focus=1.05)
    s = 640 if args.quick else 1280
    configure(s, s, 16 if args.quick else args.samples)
    render(name)


def shot_face(objs):
    head_closeup(objs, "face")


def shot_visor(objs):
    head_closeup(objs, "visor")


def shot_hand(objs):
    arm = armature(objs)
    set_clip(arm, "Idle", 0.0)
    bpy.context.view_layer.update()
    hb = C.pbone(arm, "LeftHand")
    p = arm.matrix_world @ ((hb.head + hb.tail) / 2)
    tgt = (p.x, p.y, p.z - 0.03)
    cove(floor=0.0)
    studio(tgt, scale=0.45)
    camera((p.x + 0.38, p.y - 0.42, p.z + 0.12), tgt, lens=85, fstop=4.0)
    s = 640 if args.quick else 1280
    configure(s, s, 16 if args.quick else args.samples)
    render("hand")


def shot_lineup3(objs):
    """All three characters side by side (Idle frame 0); objs (from --glb) are discarded."""
    for o in objs:
        bpy.data.objects.remove(o)
    xs = (-1.15, 0.0, 1.15)
    for path, x in zip(args.lineup.split(","), xs):
        os_ = import_glb(os.path.join(C.ROOT, path))
        set_clip(armature(os_), "Idle", 0.0)
        for o in roots(os_):
            o.location.x += x
    cove(floor=0.0)
    tgt = (0, 0, 0.95)
    studio(tgt, scale=1.4)
    camera((0.0, -7.2, 1.15), tgt, lens=55)
    w, h = (800, 450) if args.quick else (1600, 900)
    configure(w, h, 16 if args.quick else args.samples)
    bpy.context.scene.render.filepath = os.path.join(args.outdir, "lineup3.png")
    bpy.ops.render.render(write_still=True)
    C.log("RENDERED lineup3")


def shot_mask_closeup(objs):
    arm = armature(objs)
    meshes = [o for o in objs if o.type == "MESH"]
    zs = [(o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box]
    if arm is not None:
        set_clip(arm, "Idle", 0.0)
        zc = 1.64
        floor = 0.0
    else:
        zc = (min(zs) + max(zs)) / 2
        floor = min(zs) - 0.6
    tgt = (0, -0.12, zc)
    cove(floor=floor)
    studio(tgt, scale=0.55)
    camera((0.42, -1.05, zc + 0.08), tgt, lens=85, fstop=4.0, focus=1.05)
    s = 640 if args.quick else 1400
    configure(s, s, 16 if args.quick else args.samples)
    render("mask_closeup")


def main():
    for shot in args.shots.split(","):
        C.reset_scene()
        objs = import_glb(args.glb)
        globals()["shot_" + shot](objs)


main()
