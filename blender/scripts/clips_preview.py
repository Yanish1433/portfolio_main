"""Render contact sheets of the Lakhey clips for motion review (Workbench, low res).

  blender.exe --background --python blender/scripts/clips_preview.py -- --clip Run --view 90 --out run.png
  options: --clip Idle|Walk|Run|Dance   --view azimuth degrees (0 = front, 90 = character's left side)
           --n frames in the strip      --t0/--t1 frame range (default: whole clip)   --size px
Opens blender/characters/lakhey.blend, regenerates the clips in memory (nothing is saved).
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common as C  # noqa: E402
import clips as CL  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--clip", default="Run")
ap.add_argument("--view", type=float, default=90.0)
ap.add_argument("--n", type=int, default=8)
ap.add_argument("--t0", type=int, default=-1)
ap.add_argument("--t1", type=int, default=-1)
ap.add_argument("--size", type=int, default=400)
ap.add_argument("--frames", default="")        # explicit comma-separated frames (overrides --n/--t0/--t1)
ap.add_argument("--pole", action="store_true")  # draw the 3 cm x 1.6 m pole in the right grip (checks the hand offset)
ap.add_argument("--zoom", type=float, default=2.35)  # orthographic scale (m)
ap.add_argument("--camz", type=float, default=0.98)
ap.add_argument("--out", default="strip.png")
args = ap.parse_args(C.script_args())

bpy.ops.wm.open_mainfile(filepath=C.p("blender", "characters", "lakhey.blend"))
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Lakhey")
arm.animation_data_create()
arm.animation_data.action = None
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
CL.make_clips(arm)
act = bpy.data.actions[args.clip]
arm.animation_data.action = act
if hasattr(arm.animation_data, "action_slot") and act.slots:
    arm.animation_data.action_slot = act.slots[0]

sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = "STUDIO", "TEXTURE", False, False
sc.render.resolution_x = sc.render.resolution_y = args.size
sc.render.film_transparent = False
sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("W") if not sc.world else sc.world
sc.world = w
w.use_nodes = False
w.color = (0.78, 0.82, 0.86)
# ground plane
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -0.005))
plane = bpy.context.object
mat = bpy.data.materials.new("Ground")
mat.diffuse_color = (0.42, 0.45, 0.42, 1)
plane.data.materials.append(mat)
# vertical reference lines every 0.5 m help to read foot sliding
for i in range(-4, 5):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, i * 0.5, 0.0))
    ln = bpy.context.object
    ln.scale = (6, 0.004, 1)
    ln.data.materials.append(bpy.data.materials.new("L%d" % i))
    ln.data.materials[0].diffuse_color = (0.12, 0.12, 0.12, 1)
cam_d = bpy.data.cameras.new("Cam")
cam_d.type = "ORTHO"
cam_d.ortho_scale = args.zoom
cam = bpy.data.objects.new("Cam", cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
az = math.radians(args.view)
dist = 8.0
cam.location = Vector((math.sin(az) * dist, -math.cos(az) * dist, args.camz))
cam.rotation_euler = (math.radians(90), 0, az)

f0 = act.frame_range[0] if args.t0 < 0 else args.t0
f1 = act.frame_range[1] if args.t1 < 0 else args.t1
span = f1 - f0
n = args.n
frames = [round(f0 + span * i / n) for i in range(n)]  # whole cycle, last frame not repeated
if args.frames:
    frames = [int(x) for x in args.frames.split(",")]
    n = len(frames)
pole = None
if args.pole:
    g = CL.GAIT_INFO["Grip"]
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=1.6, location=(0, 0, 0))
    pole = bpy.context.object
    pm = bpy.data.materials.new("Pole")
    pm.diffuse_color = (0.95, 0.75, 0.1, 1)
    pole.data.materials.append(pm)
tiles = []
tmp = os.path.dirname(os.path.abspath(args.out))
for i, f in enumerate(frames):
    sc.frame_set(f)
    if pole is not None:
        hb = arm.evaluated_get(bpy.context.evaluated_depsgraph_get()).pose.bones[C.pbone(arm, "RightHand").name]
        up = Vector(g["pole_up"]).normalized()
        T = Matrix.Translation(Vector(g["centre"])) @ Vector((0, 0, 1)).rotation_difference(up).to_matrix().to_4x4()
        pole.matrix_world = arm.matrix_world @ hb.matrix @ T
    path = os.path.join(tmp, "_tile%d.png" % i)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(args.size, args.size, 4)
    bpy.data.images.remove(img)
    os.remove(path)
    tiles.append(a)
cols = 4 if n > 4 else n
rows = [np.concatenate(tiles[i:i + cols], axis=1) for i in range(0, n, cols)]
strip = np.concatenate(rows[::-1], axis=0)  # image rows are bottom-up
out = bpy.data.images.new("strip", strip.shape[1], strip.shape[0], alpha=True)
out.pixels = strip.ravel().tolist()
out.filepath_raw = args.out
out.file_format = "PNG"
out.save()
C.log("strip", args.out, frames)
