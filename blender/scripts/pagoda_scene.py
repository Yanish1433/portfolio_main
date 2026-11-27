"""
Newari-style three-roof pagoda, day / night variants, seamless looping animation.

Original model, built from nothing but primitives and bmesh. Run headless (Blender 5.2):

  B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  # one still (frame 0 by default) at full size:
  "$B" --background --python blender/scripts/pagoda_scene.py -- --variant night --still 0 --out OUT_DIR
  # a chunk of the loop (frames 0..47 of 168):
  "$B" --background --python blender/scripts/pagoda_scene.py -- --variant night --start 0 --end 47 --out OUT_DIR

Loop: the cycle is N = 168 frames (7 s at 24 fps). Render frames 0..N-1. Every animated channel
(camera drift, flame flicker, bells, flags, haze) is a sum of sin/cos with a WHOLE number of cycles per N,
so frame N would equal frame 0. See pagoda_encode.py for the ffmpeg step.
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

N = 168
TAU = math.tau


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = {"variant": "day", "start": 0, "end": N - 1, "still": None, "out": "pagoda_frames",
         "samples": 32, "scale": 100}
    i = 0
    while i < len(argv):
        k = argv[i].lstrip("-")
        a[k] = argv[i + 1]
        i += 2
    for k in ("start", "end", "samples", "scale"):
        a[k] = int(a[k])
    if a["still"] is not None:
        a["still"] = int(a["still"])
    return a


ARGS = parse_args()
NIGHT = ARGS["variant"] == "night"

# ───────────────────────── helpers ─────────────────────────


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hexc(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [(c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


def mat_principled(name, color, rough=0.7, metal=0.0, emit=None, emit_strength=0.0, spec=0.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hexc(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    if emit:
        bsdf.inputs["Emission Color"].default_value = hexc(emit)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return m


def mat_emission(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hexc(color)
    em.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def mat_brick(name, c1, c2, mortar, scale=5.0, bump=0.6, rough=0.85):
    m = mat_principled(name, c1, rough)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = hexc(c1)
    br.inputs["Color2"].default_value = hexc(c2)
    br.inputs["Mortar"].default_value = hexc(mortar)
    br.inputs["Scale"].default_value = scale
    br.inputs["Mortar Size"].default_value = 0.02
    br.inputs["Brick Width"].default_value = 0.5
    br.inputs["Row Height"].default_value = 0.25
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 6.0
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 0.35
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.03
    nt.links.new(tc.outputs["Object"], br.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(br.outputs["Color"], mix.inputs[6])
    nt.links.new(nz.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(br.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def link_obj(o, coll=None):
    (coll or bpy.context.scene.collection).objects.link(o)
    return o


def mesh_obj(name, bm, mat=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    link_obj(o)
    if mat is not None:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                me.materials.append(m)
        else:
            me.materials.append(mat)
    return o


def box(name, center, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    return mesh_obj(name, bm, mat, center)


def cyl_between(name, p0, p1, r, mat, verts=8):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=d.length)
    o = mesh_obj(name, bm, mat, (p0 + p1) / 2)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    return o


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def aim(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


# ───────────────────────── materials ─────────────────────────

brick = mat_brick("brick", "#7a2f1f", "#96442a", "#2a1c16", scale=5.0)
brick_dark = mat_brick("brick_stone", "#6d5f55", "#857465", "#2b2622", scale=3.5, bump=0.5)
wood = mat_principled("carved_wood", "#2a160d", rough=0.55, spec=0.5)
roof_tile = mat_brick("roof_tile", "#4b2417", "#613020", "#22110b", scale=9.0, bump=0.9, rough=0.7)
gold = mat_principled("gold", "#e0a52a", rough=0.28, metal=1.0,
                      emit="#ffb43a" if NIGHT else None, emit_strength=0.9 if NIGHT else 0.0)
clay = mat_principled("diyo_clay", "#a5532f", rough=0.8)
ground_mat = mat_brick("courtyard", *(("#4a4440", "#5a524c", "#1c1815") if NIGHT else ("#9b8470", "#b09a84", "#5a4636")), scale=2.2, bump=0.4)
window_glow = mat_principled("window", "#150b06", rough=0.8, emit="#ff9a3c",
                             emit_strength=7.0 if NIGHT else 0.25)
door_glow = mat_principled("doorway", "#110905", rough=0.8, emit="#ff8a2c",
                           emit_strength=9.0 if NIGHT else 0.35)
FLAG_COLORS = ["#2f6fd0", "#f4f1e8", "#d6342b", "#2f9a52", "#f2c02b"]
flag_mats = [mat_principled(f"flag{i}", c, rough=0.9, emit=c, emit_strength=0.55 if NIGHT else 0.05)
             for i, c in enumerate(FLAG_COLORS)]
flame_mats = []
for gi in range(4):
    m = mat_emission(f"flame{gi}", "#ffb347", 10.0 if NIGHT else 3.0)
    flame_mats.append(m)
string_mat = mat_principled("string", "#1a120c", rough=0.9)

# ───────────────────────── geometry ─────────────────────────

COLL_LIGHTS = []
flame_base = []  # (material, base strength)

# courtyard ground
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=60)
ground = mesh_obj("ground", bm, ground_mat, (0, 0, -0.02))
_gn = ground_mat.node_tree
_pos = _gn.nodes.new("ShaderNodeNewGeometry")
_len = _gn.nodes.new("ShaderNodeVectorMath")
_len.operation = "LENGTH"
_mr = _gn.nodes.new("ShaderNodeMapRange")
_mr.inputs["From Min"].default_value = 14.0
_mr.inputs["From Max"].default_value = 50.0
_hz = _gn.nodes.new("ShaderNodeEmission")
_hz.inputs["Color"].default_value = hexc("#1a2c5e" if NIGHT else "#e9b69b")
_mx = _gn.nodes.new("ShaderNodeMixShader")
_old = _gn.nodes["Material Output"]
_gn.links.new(_pos.outputs["Position"], _len.inputs[0])
_gn.links.new(_len.outputs["Value"], _mr.inputs["Value"])
_gn.links.new(_mr.outputs["Result"], _mx.inputs[0])
_gn.links.new(_gn.nodes["Principled BSDF"].outputs[0], _mx.inputs[1])
_gn.links.new(_hz.outputs[0], _mx.inputs[2])
_gn.links.new(_mx.outputs[0], _old.inputs["Surface"])

# stepped plinth
STEP_H = 0.38
steps = [(6.0, 0), (5.1, 1), (4.3, 2)]
for half, i in steps:
    box(f"plinth{i}", (0, 0, STEP_H * i + STEP_H / 2), (half * 2, half * 2, STEP_H), brick_dark)
    # lip trim
    box(f"plinthlip{i}", (0, 0, STEP_H * (i + 1) - 0.03), (half * 2 + 0.16, half * 2 + 0.16, 0.08), wood)
Z0 = STEP_H * 3  # top of plinth


def make_roof(name, half_eave, half_top, z0, z1, lift=0.45, rings=4):
    bm = bmesh.new()
    ring_verts = []
    for r in range(rings):
        t = r / (rings - 1)
        h = half_eave + (half_top - half_eave) * t
        z = z0 + (z1 - z0) * (0.55 * t + 0.45 * t * t) - 0.0
        up = lift * (1 - t) ** 1.6
        pts = []
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for ci in range(4):
            c0, c1 = corners[ci], corners[(ci + 1) % 4]
            pts.append((c0[0] * h, c0[1] * h, z + up))  # corner, lifted
            mid = ((c0[0] + c1[0]) / 2 * h, (c0[1] + c1[1]) / 2 * h, z - 0.06 * (1 - t))  # sagging mid
            pts.append(mid)
        ring_verts.append([bm.verts.new(p) for p in pts])
    nv = 8
    for r in range(rings - 1):
        a, b = ring_verts[r], ring_verts[r + 1]
        for i in range(nv):
            bm.faces.new((a[i], a[(i + 1) % nv], b[(i + 1) % nv], b[i]))
    bm.faces.new(list(reversed(ring_verts[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = mesh_obj(name, bm, [roof_tile, gold if True else wood])
    mod = o.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.16
    mod.offset = -1.0
    mod.use_rim = True
    mod.material_offset_rim = 1
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier="solid")
    o.select_set(False)
    return o


# tier table: wall half, wall height, eave half, roof rise
TIERS = [
    dict(wall=2.55, wh=2.15, eave=4.35, rise=1.75, top=1.95),
    dict(wall=1.85, wh=1.7, eave=3.4, rise=1.55, top=1.45),
    dict(wall=1.3, wh=1.5, eave=2.6, rise=1.5, top=0.35),
]
z = Z0
eave_corners = []  # (x, y, z) of lifted eave corners for bells / lamps
tier_tops = []
for ti, t in enumerate(TIERS):
    w, wh = t["wall"], t["wh"]
    box(f"wall{ti}", (0, 0, z + wh / 2), (w * 2, w * 2, wh), brick)
    # corner pillars (dark wood)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f"pillar{ti}", (sx * w, sy * w, z + wh / 2), (0.34, 0.34, wh + 0.1), wood)
    # window panels with warm glow, one per face
    for face in range(4):
        ang = face * math.pi / 2
        c, s = math.cos(ang), math.sin(ang)
        px, py = -s * (w + 0.02), -c * (w + 0.02)
        # frame
        fr = box(f"winframe{ti}_{face}", (px, py, z + wh * 0.52), (0.9 + 0.1 * (2 - ti) * 0.3, 0.16, wh * 0.52), wood)
        fr.rotation_euler = (0, 0, ang)
        gl = box(f"win{ti}_{face}", (px - s * 0.08, py - c * 0.08, z + wh * 0.52),
                 (0.68 + 0.08 * (2 - ti) * 0.3, 0.06, wh * 0.38),
                 door_glow if (ti == 0 and face == 0) else window_glow)
        gl.rotation_euler = (0, 0, ang)
        # mullions
        for k in (-1, 0, 1):
            mu = box(f"mullion{ti}_{face}_{k}", (px - s * 0.12 + c * k * 0.2, py - c * 0.12 - s * k * 0.2, z + wh * 0.52),
                     (0.05, 0.05, wh * 0.4), wood)
            mu.rotation_euler = (0, 0, ang)
    # base beam
    box(f"beam{ti}", (0, 0, z + 0.07), (w * 2 + 0.3, w * 2 + 0.3, 0.16), wood)
    # roof
    zr0 = z + wh - 0.05
    zr1 = zr0 + t["rise"]
    make_roof(f"roof{ti}", t["eave"], t["top"], zr0, zr1)
    # carved struts
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = (sx * (w + 0.04), sy * (w + 0.04), zr0 - 0.12)
            p1 = (sx * (t["eave"] - 0.35), sy * (t["eave"] - 0.35), zr0 + 0.28 - 0.5)
            cyl_between(f"strut{ti}", p0, p1, 0.1, wood, 6)
            eave_corners.append((sx * (t["eave"] - 0.15), sy * (t["eave"] - 0.15), zr0 + 0.45 - 0.18))
    tier_tops.append(zr1)
    z = zr1 - 0.25
    if ti < 2:
        # little square base for the next tier hides the roof cap
        box(f"cap{ti}", (0, 0, zr1 - 0.1), (t["top"] * 2 + 0.2, t["top"] * 2 + 0.2, 0.4), wood)

# gajur finial
fz = z + 0.35
for i, (r, h) in enumerate([(0.55, 0.28), (0.4, 0.22), (0.3, 0.22), (0.22, 0.22)]):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r * 0.78, depth=h)
    o = mesh_obj(f"finial{i}", bm, gold, (0, 0, fz + i * 0.26))
    smooth(o)
fz += 4 * 0.26
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.2, radius2=0.0, depth=1.5)
smooth(mesh_obj("finial_spire", bm, gold, (0, 0, fz + 0.75)))
FINIAL_TOP = Vector((0, 0, fz + 0.2))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.17)
smooth(mesh_obj("finial_ball", bm, gold, (0, 0, fz + 1.55)))

# ───────────────────────── diyos (butter lamps) ─────────────────────────

rng = random.Random(7)
lamp_list = []


def add_diyo(pos, scale=1.0, hang=False):
    gi = len(lamp_list) % 4
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.1 * scale)
    for v in bm.verts:
        v.co.z = max(v.co.z, -0.0) * 0.0 + (v.co.z if v.co.z < 0 else 0.0)
        v.co.z *= 0.55
    bowl = mesh_obj("diyo", bm, clay, pos)
    smooth(bowl)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.055 * scale)
    for v in bm.verts:
        v.co.z *= 1.9
    fl = mesh_obj("flame", bm, flame_mats[gi], (pos[0], pos[1], pos[2] + 0.1 * scale))
    smooth(fl)
    lamp_list.append(fl)


# along the second and third plinth step edges (front faces are what the camera sees)
for half, zt in ((5.1 - 0.25, STEP_H * 2 + 0.04), (6.0 - 0.25, STEP_H + 0.04)):
    n = 9 if half > 5.2 else 8
    for i in range(n):
        u = -half + (2 * half) * i / (n - 1)
        for pos in ((u, -half, zt), (u, half, zt), (-half, u, zt), (half, u, zt)):
            add_diyo(pos)
# hanging lamps at eave corners
for ec in eave_corners:
    add_diyo((ec[0], ec[1], ec[2] - 0.55), 0.9)
    cyl_between("lampcord", (ec[0], ec[1], ec[2] - 0.05), (ec[0], ec[1], ec[2] - 0.5), 0.012, string_mat, 4)

# ───────────────────────── bells ─────────────────────────

bells = []
for ec in eave_corners:
    for off in ((0, 0), ):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=0.17, radius2=0.07, depth=0.3)
        for v in bm.verts:
            v.co.z -= 0.15  # top of the bell at the pivot origin
        b = mesh_obj("bell", bm, gold, (ec[0] * 1.0, ec[1] * 1.0, ec[2] - 0.05))
        smooth(b)
        bells.append((b, rng.uniform(0, TAU), rng.choice([1, 2, 3])))

# ───────────────────────── prayer flags ─────────────────────────

POLE_H = 7.0
poles = [(-9.2, 3.0), (9.0, -4.5), (9.6, 5.5)]
for i, (px, py) in enumerate(poles):
    cyl_between(f"pole{i}", (px, py, 0), (px, py, POLE_H), 0.07, wood, 6)


def string_pts(a, b, sag, n):
    a, b = Vector(a), Vector(b)
    pts = []
    for i in range(n + 1):
        s = i / n
        p = a.lerp(b, s)
        p.z -= sag * 4 * s * (1 - s)
        pts.append(p)
    return pts


flag_strings = [
    (FINIAL_TOP + Vector((0, 0, 0.9)), (poles[0][0], poles[0][1], POLE_H), 1.3),
    (FINIAL_TOP + Vector((0, 0, 0.9)), (poles[1][0], poles[1][1], POLE_H), 1.3),
    (FINIAL_TOP + Vector((0, 0, 0.9)), (poles[2][0], poles[2][1], POLE_H), 1.3),
]
flag_data = []  # per vertex: (base co, nrm, v_frac, phase_s)
flag_bm = bmesh.new()
fi = 0
for a, b, sag in flag_strings:
    pts = string_pts(a, b, sag, 22)
    for i in range(len(pts) - 1):
        cyl_between("string", pts[i], pts[i + 1], 0.014, string_mat, 4)
    nflags = 14
    ab = Vector(b) - Vector(a)
    nrm = ab.cross(Vector((0, 0, 1))).normalized()
    for k in range(nflags):
        s0 = (k + 0.12) / nflags
        s1 = (k + 0.88) / nflags
        h = 0.62
        grid = []
        for iu in range(4):
            su = s0 + (s1 - s0) * iu / 3
            idx = su * 22
            lo = int(min(idx, 21))
            p = pts[lo].lerp(pts[lo + 1], idx - lo)
            row = []
            for iv in range(3):
                vf = iv / 2
                co = Vector((p.x, p.y, p.z - 0.02 - h * vf))
                v = flag_bm.verts.new(co)
                flag_data.append((co.copy(), nrm.copy(), vf, su * 9.0 + fi))
                row.append(v)
            grid.append(row)
        for iu in range(3):
            for iv in range(2):
                f = flag_bm.faces.new((grid[iu][iv], grid[iu + 1][iv], grid[iu + 1][iv + 1], grid[iu][iv + 1]))
                f.material_index = (k + fi) % 5
    fi += 3
flag_obj = mesh_obj("flags", flag_bm, flag_mats)
for p in flag_obj.data.polygons:
    p.use_smooth = True

# ───────────────────────── background: mountains, haze ─────────────────────────


def ridge(name, y, width, hmax, seed, color, strength, z0=-2.0):
    r = random.Random(seed)
    ph = [r.uniform(0, TAU) for _ in range(4)]
    cols = 120
    bm = bmesh.new()
    top, bot = [], []
    for i in range(cols + 1):
        x = -width / 2 + width * i / cols
        u = i / cols
        h = (0.5 + 0.28 * math.sin(u * 9 + ph[0]) + 0.18 * math.sin(u * 23 + ph[1]) +
             0.1 * math.sin(u * 51 + ph[2]) + 0.05 * math.sin(u * 97 + ph[3])) * hmax
        top.append(bm.verts.new((x, y, z0 + max(h, 1.0))))
        bot.append(bm.verts.new((x, y, z0 - 4)))
    for i in range(cols):
        bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    return mesh_obj(name, bm, mat_emission(name, color, strength))


if NIGHT:
    ridge("mtn_far", 260, 900, 120, 3, "#16255a", 0.9, z0=-6)
    ridge("mtn_mid", 175, 640, 70, 5, "#101c48", 0.8, z0=-5)
    ridge("mtn_near", 105, 460, 26, 9, "#0a1236", 0.7, z0=-4)
else:
    ridge("mtn_far", 260, 900, 120, 3, "#e8bba8", 1.0, z0=-6)
    ridge("mtn_mid", 175, 640, 70, 5, "#d79a92", 1.0, z0=-5)
    ridge("mtn_near", 105, 460, 26, 9, "#a8706c", 1.0, z0=-4)

haze_planes = []
for i, (y, w, hh, a) in enumerate([(40, 200, 22, 0.55), (72, 320, 40, 0.5)]):
    m = bpy.data.materials.new(f"haze{i}")
    m.use_nodes = True
    m.surface_render_method = "BLENDED"
    nt = m.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 1.0
    mr.inputs["To Min"].default_value = a
    mr.inputs["To Max"].default_value = 0.0
    mr.clamp = True
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.5
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hexc("#2a3f8c" if NIGHT else "#ffd8a8")
    em.inputs["Strength"].default_value = 0.9 if NIGHT else 1.3
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mx = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(mr.outputs["Result"], mul.inputs[0])
    nt.links.new(nz.outputs["Fac"], mul.inputs[1])
    nt.links.new(mul.outputs[0], mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, 0, v.co.y * hh + hh / 2 - 2))
    ho = mesh_obj(f"haze{i}", bm, m, (0, y, 0))
    # generated coords on a plane: ensure Y maps to height by rotating UV-free: use object mapping via bbox
    haze_planes.append((ho, i))

# ───────────────────────── world ─────────────────────────

world = bpy.data.worlds.new("sky")
bpy.context.scene.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes.clear()
tc = wn.nodes.new("ShaderNodeTexCoord")
sep = wn.nodes.new("ShaderNodeSeparateXYZ")
nrm = wn.nodes.new("ShaderNodeVectorMath")
nrm.operation = "NORMALIZE"
mr = wn.nodes.new("ShaderNodeMapRange")
mr.clamp = True
mr.inputs["From Min"].default_value = -0.05
mr.inputs["From Max"].default_value = 0.75
ramp = wn.nodes.new("ShaderNodeValToRGB")
if NIGHT:
    stops = [(0.0, "#1a2c5e"), (0.25, "#12214d"), (0.6, "#080f2b"), (1.0, "#03061a")]
else:
    stops = [(0.0, "#ffc98a"), (0.16, "#f9a98a"), (0.45, "#b9a6c4"), (1.0, "#4f7fc0")]
ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = stops[0][0], hexc(stops[0][1])
ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = stops[-1][0], hexc(stops[-1][1])
for pos, col in stops[1:-1]:
    e = ramp.color_ramp.elements.new(pos)
    e.color = hexc(col)
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 1.0 if NIGHT else 1.0
wout = wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(tc.outputs["Generated"], nrm.inputs[0])
wn.links.new(nrm.outputs[0], sep.inputs[0])
wn.links.new(sep.outputs["Z"], mr.inputs["Value"])
wn.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
if NIGHT:
    # stars: tiny bright cells from a voronoi, strongest high in the sky
    vor = wn.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 260.0
    vor.inputs["Randomness"].default_value = 1.0
    cr = wn.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].position = 0.0
    cr.color_ramp.elements[1].position = 0.04
    cr.color_ramp.elements[0].color = (1, 1, 1, 1)
    cr.color_ramp.elements[1].color = (0, 0, 0, 1)
    sm = wn.nodes.new("ShaderNodeMath")
    sm.operation = "MULTIPLY"
    sm.inputs[1].default_value = 6.0
    add = wn.nodes.new("ShaderNodeMix")
    add.data_type = "RGBA"
    add.blend_type = "ADD"
    add.inputs[0].default_value = 1.0
    mask = wn.nodes.new("ShaderNodeMapRange")
    mask.inputs["From Min"].default_value = 0.1
    mask.inputs["From Max"].default_value = 0.5
    wn.links.new(nrm.outputs[0], vor.inputs["Vector"])
    wn.links.new(vor.outputs["Distance"], cr.inputs["Fac"])
    wn.links.new(sep.outputs["Z"], mask.inputs["Value"])
    wn.links.new(cr.outputs["Color"], sm.inputs[0])
    wn.links.new(mask.outputs["Result"], sm.inputs[1])
    wn.links.new(ramp.outputs["Color"], add.inputs[6])
    wn.links.new(sm.outputs[0], add.inputs[7])
    wn.links.new(add.outputs[2], bg.inputs["Color"])
else:
    wn.links.new(ramp.outputs["Color"], bg.inputs["Color"])
wn.links.new(bg.outputs[0], wout.inputs[0])

# ───────────────────────── lights ─────────────────────────

TARGET = Vector((0.0, 0.0, 6.0))
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
link_obj(sun)
sun.location = (-24, -20, 12 if not NIGHT else 40)
aim(sun, (0, 0, 4))
if NIGHT:
    sun.data.energy = 0.9
    sun.data.color = hexc("#6f8cff")[:3]
    sun.data.angle = math.radians(8)
else:
    sun.data.energy = 7.0
    sun.data.color = hexc("#ffb06a")[:3]
    sun.data.angle = math.radians(3)

# soft fill from the sky side
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
link_obj(fill)
fill.location = (22, -14, 30)
aim(fill, (0, 0, 4))
fill.data.energy = 0.5 if NIGHT else 0.9
fill.data.color = hexc("#7d95ff" if NIGHT else "#a9c4ff")[:3]
fill.data.use_shadow = False

point_lights = []
if NIGHT:
    spots = [(0, -5.5, 1.4), (-5.6, -3.0, 1.4), (5.6, -3.0, 1.4),
             (0, -4.0, 4.0), (-4.2, 0.0, 4.4), (4.2, 0.0, 4.4),
             (0, -2.8, 6.8), (0, -2.0, 9.3)]
    for i, p in enumerate(spots):
        ld = bpy.data.lights.new(f"warm{i}", "POINT")
        ld.energy = 900 if p[2] < 3 else 650
        ld.color = hexc("#ff9a3a")[:3]
        ld.shadow_soft_size = 0.5
        ld.use_shadow = False
        lo = bpy.data.objects.new(f"warm{i}", ld)
        lo.location = p
        link_obj(lo)
        point_lights.append((ld, ld.energy, i * 0.9))
else:
    for i, p in enumerate([(0, -5.5, 1.4), (0, -4.0, 4.0)]):
        ld = bpy.data.lights.new(f"warm{i}", "POINT")
        ld.energy = 120
        ld.color = hexc("#ff9a3a")[:3]
        ld.use_shadow = False
        lo = bpy.data.objects.new(f"warm{i}", ld)
        lo.location = p
        link_obj(lo)
        point_lights.append((ld, ld.energy, i * 1.3))

# ───────────────────────── camera ─────────────────────────

cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 38
cam_d.sensor_width = 36
cam_d.shift_x = -0.17
cam_d.shift_y = -0.03
cam_d.clip_end = 900
cam = bpy.data.objects.new("cam", cam_d)
link_obj(cam)
tgt = bpy.data.objects.new("camtarget", None)
link_obj(tgt)
tgt.location = TARGET
con = cam.constraints.new("TRACK_TO")
con.target = tgt
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
bpy.context.scene.camera = cam

R0, PHI0 = 33.0, math.radians(-33)

# ───────────────────────── animation (pure function of frame) ─────────────────────────


def flick(f, ph):
    return (1.0 + 0.16 * math.sin(TAU * 3 * f / N + ph) + 0.11 * math.sin(TAU * 7 * f / N + 1.7 * ph + 0.4)
            + 0.07 * math.sin(TAU * 13 * f / N + 2.3 * ph + 1.1))


def animate(frame):
    f = frame % N
    th = TAU * f / N
    # camera: slow orbit + gentle dolly and bob (1 cycle per loop)
    phi = PHI0 + math.radians(5.5) * math.sin(th)
    r = R0 + 1.2 * math.cos(th)
    cam.location = (TARGET.x + r * math.sin(phi), TARGET.y - r * math.cos(phi), 3.2 + 0.5 * math.sin(2 * th + 1.0))
    # flames
    for gi, m in enumerate(flame_mats):
        val = (10.0 if NIGHT else 3.0) * flick(f, gi * 1.7)
        m.node_tree.nodes["Emission"].inputs["Strength"].default_value = val
    for ld, base, ph in point_lights:
        ld.energy = base * flick(f, ph)
    # bells
    for b, ph, k in bells:
        b.rotation_euler = (0.16 * math.sin(k * th + ph), 0.16 * math.sin(k * th + ph + 1.3), 0)
    # flags
    me = flag_obj.data
    co = []
    for base, nrm_v, vf, ps in flag_data:
        amp = 0.22 * (0.15 + vf)
        d = amp * (math.sin(ps * 2.4 - 3 * th) + 0.45 * math.sin(ps * 5.1 - 6 * th + 1.0))
        # flags also lift a little from the wind
        co.extend((base.x + nrm_v.x * d, base.y + nrm_v.y * d, base.z + 0.04 * vf * math.sin(2 * th + ps)))
    me.vertices.foreach_set("co", co)
    me.update()
    # haze drift
    for ho, i in haze_planes:
        ho.location.x = (3.0 + 2 * i) * math.sin(th + i)


def on_frame(scene, *_):
    animate(scene.frame_current)


# ───────────────────────── render setup ─────────────────────────

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.eevee.taa_render_samples = ARGS["samples"]
sc.eevee.use_raytracing = False
sc.eevee.use_shadows = True
sc.eevee.shadow_ray_count = 1
sc.eevee.shadow_step_count = 6
sc.render.resolution_x = 1280
sc.render.resolution_y = 720
sc.render.resolution_percentage = ARGS["scale"]
sc.render.fps = 24
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGB"
sc.render.film_transparent = False
try:
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast" if NIGHT else "AgX - Base Contrast"
except Exception as e:  # noqa
    print("view transform:", e)
sc.view_settings.exposure = 0.0 if NIGHT else 0.0


def setup_bloom():
    """Night glow: compositor Glare (Bloom). Blender 5: the compositor tree is a node group."""
    try:
        g = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
        g.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = g.nodes.new("CompositorNodeRLayers")
        gl = g.nodes.new("CompositorNodeGlare")
        out = g.nodes.new("NodeGroupOutput")
        gl.inputs["Type"].default_value = "Bloom"
        gl.inputs["Quality"].default_value = "High"
        gl.inputs["Threshold"].default_value = 0.9
        gl.inputs["Strength"].default_value = 0.55
        gl.inputs["Size"].default_value = 0.55
        gl.inputs["Smoothness"].default_value = 0.5
        g.links.new(rl.outputs["Image"], gl.inputs["Image"])
        g.links.new(gl.outputs["Image"], out.inputs[0])
        sc.compositing_node_group = g
        sc.render.use_compositing = True
        print("BLOOM compositor ready")
    except Exception as e:  # noqa
        print("BLOOM setup failed:", repr(e))


if NIGHT:
    setup_bloom()

bpy.app.handlers.frame_change_pre.append(on_frame)

os.makedirs(ARGS["out"], exist_ok=True)
if ARGS["still"] is not None:
    sc.frame_set(ARGS["still"])
    animate(ARGS["still"])
    sc.render.filepath = os.path.join(ARGS["out"], f"still_{ARGS['variant']}_{ARGS['still']:03d}.png")
    bpy.ops.render.render(write_still=True)
else:
    sc.frame_start, sc.frame_end = ARGS["start"], ARGS["end"]
    sc.render.filepath = os.path.join(ARGS["out"], f"{ARGS['variant']}_")
    bpy.ops.render.render(animation=True)
print("DONE")
