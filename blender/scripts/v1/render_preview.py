"""Render previews of the characters on a studio set (Cycles).

  blender.exe --background --factory-startup --python blender/scripts/render_preview.py -- \
      --chars clay,astro --src glb [--outdir DIR] [--quick] [--only front,34,lineup,testpose]

--src glb   : the compressed web files public/models/<name>.glb (what the site shows)  [default]
--src raw   : blender/export/<name>_raw.glb (uncompressed export)
--src blend : blender/characters/<name>.blend
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import common as C  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--chars", default="clay,astro")
ap.add_argument("--src", default="glb")
ap.add_argument("--outdir", default=C.p("blender", "previews", "x"))
ap.add_argument("--quick", action="store_true")
ap.add_argument("--only", default="front,34,lineup,testpose")
ap.add_argument("--samples", type=int, default=48)
args = ap.parse_args(C.script_args())
args.outdir = os.path.abspath(args.outdir)
os.makedirs(args.outdir, exist_ok=True)
CHARS = args.chars.split(",")
ONLY = args.only.split(",")
PREFIX = C.PREFIX


# ------------------------------------------------------------------ loading
def source_path(name):
    if args.src == "glb":
        return os.path.join(C.ROOT, "public", "models", name + ".glb")
    if args.src == "raw":
        return os.path.join(C.ROOT, "blender", "export", name + "_raw.glb")
    return os.path.join(C.ROOT, "blender", "characters", name + ".blend")


def load_character(name):
    path = source_path(name)
    before = set(bpy.data.objects)
    if path.endswith(".glb"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            if o is not None:
                bpy.context.scene.collection.objects.link(o)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    # drop any animation so posing sticks
    if arm.animation_data:
        arm.animation_data_clear()
    # an imported glTF may sit under an empty/root; keep only what we need
    return arm, new


def top_parent(o):
    while o.parent:
        o = o.parent
    return o


# ------------------------------------------------------------------ poses
def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()



def rot(arm, short, axis, deg):
    name = PREFIX + short
    if name not in arm.pose.bones:
        name = "mixamorig" + short
    pb = arm.pose.bones[name]
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    new = Matrix.Translation(m.translation) @ Matrix.Rotation(math.radians(deg), 4, axis) @ m.to_3x3().to_4x4()
    pb.matrix = new
    bpy.context.view_layer.update()


def pose_a(arm):
    reset_pose(arm)
    rot(arm, "LeftArm", "Y", 38)
    rot(arm, "RightArm", "Y", -38)
    rot(arm, "LeftForeArm", "Y", 4)
    rot(arm, "RightForeArm", "Y", -4)


def pose_test(arm):
    """Arms up, one knee bent: proves the weights deform sensibly."""
    reset_pose(arm)
    rot(arm, "LeftArm", "Y", -115)       # left arm up
    rot(arm, "RightArm", "X", -70)       # right arm forward (-Y)
    rot(arm, "RightForeArm", "Z", 0)
    rot(arm, "LeftLeg", "X", 0)
    rot(arm, "LeftUpLeg", "X", -65)      # thigh forward
    rot(arm, "LeftLeg", "X", 85)         # knee bent back
    rot(arm, "Spine1", "X", -10)
    rot(arm, "Head", "Z", 25)


# ------------------------------------------------------------------ set
def build_set():
    sc = bpy.context.scene
    FLOOR = -0.05
    # seamless cove: floor -> quarter arc -> wall
    prof = [(-9.0, FLOOR), (1.2, FLOOR)]
    R, cz = 2.6, FLOOR + 2.6
    for i in range(1, 25):
        a = (math.pi / 2) * i / 24
        prof.append((1.2 + R * math.sin(a), cz - R * math.cos(a)))
    prof.append((1.2 + R, 9.0))
    bm = bmesh.new()
    rows = []
    for y, z in prof:
        rows.append((bm.verts.new((-9, y, z)), bm.verts.new((9, y, z))))
    for (a0, a1), (b0, b1) in zip(rows[:-1], rows[1:]):
        bm.faces.new((a0, a1, b1, b0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("Backdrop")
    bm.to_mesh(me)
    bm.free()
    back = bpy.data.objects.new("Backdrop", me)
    C.link(back)
    for poly in me.polygons:
        poly.use_smooth = True
    back.data.materials.append(C.new_material("BackdropMat", (0.30, 0.36, 0.44), rough=0.85))

    # turntable stand(s): positioned per character later
    return back


def make_stand(x):
    st = C.make_cylinder("Stand", (x, 0, -0.025), 0.55, 0.05, segs=96, bevel=0.012)
    st.data.materials.append(C.new_material("StandMat", (0.18, 0.19, 0.22), rough=0.35, metal=0.0))
    for poly in st.data.polygons:
        poly.use_smooth = True
    ring = C.make_torus("StandRing", (x, 0, 0.001), 0.43, 0.006, seg_major=96, seg_minor=8)
    ring.data.materials.append(C.new_material("StandRingMat", (0.9, 0.9, 0.95), rough=0.25))
    return st


def area(name, loc, size, energy, target, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "DISK"
    ld.size = size
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    C.link(ob)
    tc = ob.constraints.new("TRACK_TO")
    tc.target = target
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    for attr in ("visible_camera", "visible_glossy"):  # no softbox ovals reflected in the visor
        try:
            setattr(ob, attr, False)
        except Exception:
            pass
    return ob


def setup_lights(center_x=0.0, spread=1.0):
    tgt = bpy.data.objects.new("LightTarget", None)
    tgt.location = (center_x, 0, 0.9)
    C.link(tgt)
    s = spread
    area("Key", (center_x - 2.6 * s, -3.4, 3.0), 2.4 * s, 125 * s, tgt, (1.0, 0.95, 0.9))
    area("Fill", (center_x + 3.4 * s, -2.6, 1.5), 3.2 * s, 30 * s, tgt, (0.85, 0.92, 1.0))
    rim = area("Rim", (center_x + 1.4, 2.4, 2.4), 1.4, 60, tgt, (1.0, 1.0, 1.0))
    rim.data.spread = math.radians(35)
    w = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.6, 0.68, 1)
    bg.inputs["Strength"].default_value = 0.2
    return tgt


def make_camera():
    cd = bpy.data.cameras.new("Cam")
    cd.lens = 85
    cam = bpy.data.objects.new("Cam", cd)
    C.link(cam)
    bpy.context.scene.camera = cam
    return cam


def aim(cam, loc, target):
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def configure_render(w, h, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    try:
        sc.view_settings.view_transform = "Khronos PBR Neutral"
    except Exception:
        pass
    sc.cycles.max_bounces = 6


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


# ------------------------------------------------------------------ main
def main():
    C.reset_scene()
    chars = {}
    for name in CHARS:
        arm, objs = load_character(name)
        chars[name] = (arm, top_parent(arm), objs)
    build_set()
    cam = make_camera()
    sc = bpy.context.scene
    samples = 16 if args.quick else args.samples
    sq = 640 if args.quick else 1280

    def show_only(names):
        for n, (arm, root, objs) in chars.items():
            vis = n in names
            for o in objs:
                o.hide_render = not vis
                o.hide_viewport = not vis

    stands = {}
    for n in CHARS:
        stands[n] = make_stand(0.0)
    tgt = setup_lights(0.0)

    def place(names, xs):
        # move characters + stands
        for n, x in zip(names, xs):
            arm, root, objs = chars[n]
            root.location = (x, 0, 0)

    ring_objs = [o for o in bpy.data.objects if o.name.startswith("StandRing")]
    stand_pairs = list(zip(stands.values(), ring_objs))

    def shot_single(name, azimuth, fname, pose="a"):
        configure_render(sq, sq, samples)
        show_only([name])
        place([name], [0.0])
        for i, (st, rg) in enumerate(stand_pairs):
            st.location.x = 0.0
            rg.location.x = 0.0
            vis = i == 0
            st.hide_render = not vis
            rg.hide_render = not vis
        arm = chars[name][0]
        (pose_a if pose == "a" else pose_test)(arm)
        d = 5.2
        a = math.radians(azimuth)
        tgt.location = (0, 0, 0.9)
        aim(cam, (math.sin(a) * d, -math.cos(a) * d, 1.05), (0, 0, 0.86))
        render_to(os.path.join(args.outdir, fname))

    if "front" in ONLY:
        for n in CHARS:
            shot_single(n, 0, f"{n}_front.png")
    if "34" in ONLY:
        for n in CHARS:
            shot_single(n, 38, f"{n}_34.png")
    if "testpose" in ONLY:
        for n in CHARS:
            cam.data.lens = 70
            shot_single(n, 25, f"{n}_testpose.png", pose="t")
            cam.data.lens = 85
    if "lineup" in ONLY and len(CHARS) >= 2:
        w, h = (800, 450) if args.quick else (1600, 900)
        configure_render(w, h, samples)
        xs = [-0.95, 0.95]
        show_only(CHARS[:2])
        place(CHARS[:2], xs)
        for (st, rg), x in zip(stand_pairs, xs):
            st.location.x = x
            rg.location.x = x
            st.hide_render = False
            rg.hide_render = False
        for n in CHARS[:2]:
            pose_a(chars[n][0])
        cam.data.lens = 55
        for lo in bpy.data.objects:
            if lo.type == "LIGHT":
                lo.data.energy *= 2.2
                lo.data.size *= 1.8
                lo.location.x *= 1.6
        tgt.location = (0, 0, 0.9)
        aim(cam, (0.0, -6.6, 1.05), (0, 0, 0.88))
        render_to(os.path.join(args.outdir, "lineup.png"))


main()
