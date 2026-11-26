"""Astro v2: the neutral MPFB body wearing a realistic explorer suit (genderless; face never visible).

  blender.exe --background --python blender/scripts/make_astro.py > blender/logs/make_astro.log 2>&1

* suit = the body pushed outward and smoothed (fabric shell), gloves (fingers kept) and boots from the same
  surface; the head is replaced by a helmet with a dark, opaque visor (no face geometry inside)
* high poly = subdivided suit + numpy detail: cloth wrinkle rings at the joints, stitched seams, centre
  zipper, quilted chest padding, knee/elbow pads; colour (white fabric, teal stripes, grey gloves/boots,
  grime in creases) and roughness are point attributes -> baked
* hard parts: helmet shell, metal neck ring, chest unit + emissive screen, backpack, wrist/ankle connectors, soles
* materials: Suit, Trim (share one 2048 baked atlas -> 1024 WebP), Visor, Metal, Screen (factors)
* same rig and clips as every v2 character (Idle, Dance)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import base_body as BB  # noqa: E402
import common as C  # noqa: E402
import lakhey_costume as LC  # noqa: E402
import lakhey_mask as LM  # noqa: E402
import sculpt as SC  # noqa: E402
from clips import make_clips  # noqa: E402

srgb = LM.srgb
TEX = 2048
SUIT_TRIS = 13200
WHITE = srgb(232, 232, 224)
TEAL = srgb(0, 136, 150)
GREY = srgb(88, 92, 100)
DARK = srgb(46, 48, 54)
HEAD_C = np.array([0.0, -0.012, 1.615])


# ------------------------------------------------------------------ suit shell
def build_suit(body, arm):
    dom, _ = LC.dominant(body)
    co = C.get_co(body.data)
    is_head = (dom == "Head") | ((dom == "Neck") & (co[:, 2] > 1.50))
    hands = np.array(["Hand" in d for d in dom])
    feet = np.isin(dom, ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) | \
        (np.isin(dom, ["LeftLeg", "RightLeg"]) & (co[:, 2] < 0.16))
    suit = C.duplicate(body, "AstroSuit")
    LC.keep_vertices(suit, ~is_head)
    me = suit.data
    me.update()
    dom2, _ = LC.dominant(suit)
    co = C.get_co(me)
    nrm = C.get_normals(me)
    hands = np.array(["Hand" in d for d in dom2])
    feet = np.isin(dom2, ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) | \
        (np.isin(dom2, ["LeftLeg", "RightLeg"]) & (co[:, 2] < 0.16))
    torso = np.isin(dom2, ["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"])
    off = np.where(torso, 0.026, 0.021)
    off = np.where(hands, 0.0045, off)
    off = np.where(feet, 0.022, off)
    edges = C.get_edges(me)
    off = C.smooth_scalar(off, edges, 6)
    co = co + nrm * off[:, None]
    smooth_w = np.where(hands, 0.05, 0.75)
    smooth_w = C.smooth_scalar(smooth_w, edges, 4)
    co = C.smooth_weighted(co, edges, smooth_w, iterations=26)
    # boots: no toes; a smooth bulky boot shape
    fw = C.smooth_scalar(feet.astype(float), edges, 3)
    co = C.smooth_weighted(co, edges, fw, iterations=180, taubin=False, lam=0.6)
    co = C.smooth_weighted(co, edges, fw, iterations=20)
    C.set_co(me, co)
    me.update()
    nrm2 = C.get_normals(me)                           # re-inflate the smoothed boots
    C.set_co(me, co + nrm2 * (0.020 * fw)[:, None])
    # region attribute (1 = trim: gloves + boots), carried through decimation
    trim = C.smooth_scalar((hands | feet).astype(float), edges, 1)
    attr = me.attributes.new("trim", "FLOAT", "POINT")
    attr.data.foreach_set("value", trim)
    gw = {k[len(C.PREFIX):]: v for k, v in C.all_group_weights(suit).items() if k.startswith(C.PREFIX)}
    gw = {k: C.smooth_scalar(v, edges, 6) for k, v in gw.items() if v.max() > 0.01}
    LC.set_weights(suit, gw)
    return suit


def joints(arm):
    J = []
    for s in ("Left", "Right"):
        J.append((LC.bone_head(arm, s + "ForeArm"), LC.bone_head(arm, s + "Hand") - LC.bone_head(arm, s + "ForeArm"), 0.07))
        J.append((LC.bone_head(arm, s + "Arm"), LC.bone_head(arm, s + "ForeArm") - LC.bone_head(arm, s + "Arm"), 0.06))
        J.append((LC.bone_head(arm, s + "Leg"), LC.bone_head(arm, s + "Foot") - LC.bone_head(arm, s + "Leg"), 0.08))
        J.append((LC.bone_head(arm, s + "UpLeg"), LC.bone_head(arm, s + "Leg") - LC.bone_head(arm, s + "UpLeg"), 0.06))
    J.append((LC.bone_head(arm, "Spine1") - np.array([0, 0, 0.05]), np.array([0, 0, 1.0]), 0.06))
    return J


def suit_detail(hi, arm):
    me = hi.data
    co = C.get_co(me)
    trim = np.empty(len(co))
    me.attributes["trim"].data.foreach_get("value", trim)
    fabric = 1 - np.clip(trim, 0, 1)
    conc = SC.concavity(hi)
    h = np.zeros(len(co))
    col = np.tile(WHITE, (len(co), 1))
    # --- cloth wrinkle rings at the joints (compression folds across the limb axis)
    for p, a, width in joints(arm):
        a = a / np.linalg.norm(a)
        d = co - p
        s = d @ a
        radial = np.linalg.norm(d - s[:, None] * a, axis=1)
        ang = np.arctan2(*(np.stack([d @ np.cross(a, [0, 1, 0.0]), d @ np.cross(a, np.cross(a, [0, 1, 0.0]))], 0)))
        m = np.exp(-(s / width) ** 2) * (radial < 0.16)
        h += 0.0032 * m * np.sin(s * 2 * np.pi / 0.026 + 1.8 * np.sin(ang * 3 + s * 40)) * fabric
    # --- quilted chest/back padding: horizontal channels on the torso
    torso = (co[:, 2] > 1.06) & (co[:, 2] < 1.40) & (np.abs(co[:, 0]) < 0.17)
    q = np.abs(np.sin(co[:, 2] * 2 * np.pi / 0.045)) ** 0.5
    h += 0.0024 * q * torso * fabric
    # --- knee + elbow pads (puffy ovals with a stitched edge)
    seams = np.zeros(len(co))
    for s in ("Left", "Right"):
        for bone, rs, out in (("Leg", 0.055, np.array([0, -1.0, 0])), ("ForeArm", 0.045, np.array([0, 1.0, 0]))):
            c = LC.bone_head(arm, s + bone) + out * 0.05
            dist = np.linalg.norm((co - c) / np.array([1, 1.4, 1]), axis=1)
            pad = 1 - C.smoothstep(rs * 0.8, rs, dist)
            h += 0.004 * pad * fabric
            seams = np.maximum(seams, np.exp(-((dist - rs) / 0.0022) ** 2))
            col = col * (1 - 0.5 * pad[:, None]) + srgb(206, 206, 200) * (0.5 * pad[:, None])
    # --- seams: centre zipper, waist belt ring, upper-arm and thigh rings, inner leg seams
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    zip_m = (np.abs(x) < 0.006) & (y < -0.05) & (z > 0.98) & (z < 1.48)
    seams = np.maximum(seams, zip_m * 1.0)
    seams = np.maximum(seams, np.exp(-((z - 1.02) / 0.003) ** 2) * (np.abs(x) < 0.25))
    for s, sx in (("Left", 1), ("Right", -1)):
        sh = LC.bone_head(arm, s + "Arm")
        el = LC.bone_head(arm, s + "ForeArm")
        for f in (0.15, 0.55):
            xr = sh[0] + (el[0] - sh[0]) * f
            seams = np.maximum(seams, np.exp(-((x - xr) / 0.0025) ** 2) * (np.abs(z - sh[2]) < 0.12) * (np.sign(x) == sx))
        kn = LC.bone_head(arm, s + "Leg")
        hip = LC.bone_head(arm, s + "UpLeg")
        zr = hip[2] - 0.12
        seams = np.maximum(seams, np.exp(-((z - zr) / 0.0025) ** 2) * (np.abs(x - hip[0]) < 0.14))
        inner = (np.abs(x - kn[0]) < 0.10) & (z < hip[2] - 0.05) & (z > 0.2)
        seams = np.maximum(seams, np.exp(-((x - (kn[0] - sx * 0.055)) / 0.0025) ** 2) * inner)
        # teal accent bands on the upper arms and shins
        xr = sh[0] + (el[0] - sh[0]) * 0.35
        band = (1 - C.smoothstep(0.015, 0.027, np.abs(x - xr))) * (np.abs(z - sh[2]) < 0.12) * (np.sign(x) == sx)
        band = np.maximum(band, (1 - C.smoothstep(0.015, 0.027, np.abs(z - (kn[2] - 0.12)))) * (np.abs(x - kn[0]) < 0.12))
        col = col * (1 - band[:, None]) + TEAL * band[:, None]
    stitches = (np.sin((x + y + z) * 2 * np.pi / 0.006) > 0.3)
    h -= 0.0012 * np.clip(seams, 0, 1) * fabric
    h -= 0.00035 * np.clip(seams, 0, 1) * stitches * fabric
    # trims (gloves, boots): grey, slight rubbery texture
    tr = np.clip(trim, 0, 1)[:, None]
    col = col * (1 - tr) + np.where(co[:, 2:3] < 0.2, DARK, GREY) * tr
    # grime in creases + seam shadows
    grime = np.clip(0.45 * np.clip(conc, 0, 1) + 0.35 * np.clip(seams, 0, 1), 0, 0.6)
    col = col * (1 - 0.35 * grime[:, None])
    SC.displace(hi, h)
    SC.point_color(hi, "col", col)
    rough = np.clip(0.78 - 0.30 * tr[:, 0] + 0.05 * np.clip(seams, 0, 1), 0.3, 0.95)
    SC.point_color(hi, "rough", np.repeat(rough[:, None], 3, 1))


# ------------------------------------------------------------------ hard parts
def obj_from_bm(bm, name):
    return LM.bm_to_obj(bm, name)


def helmet_parts():
    """Shell (with a visor opening), visor glass, neck ring.  Returns (shell, visor, ring)."""
    R = np.array([0.168, 0.172, 0.178])
    th = np.radians(np.linspace(-180, 180, 49))
    ph = np.radians(np.linspace(-58, 90, 22))

    def pt(t, p, scale=1.0):
        cp = math.cos(p)
        return HEAD_C + np.array([cp * math.sin(t), -cp * math.cos(t), math.sin(p)]) * R * scale

    def in_visor(t, p):
        return abs(t) < math.radians(62) and math.radians(-30) < p < math.radians(36)

    bm = bmesh.new()
    V = [[bm.verts.new(pt(t, p)) for t in th[:-1]] for p in ph]
    n = len(th) - 1
    for j in range(len(ph) - 1):
        for i in range(n):
            tc = (th[i] + th[i + 1]) / 2
            pc = (ph[j] + ph[j + 1]) / 2
            if in_visor(tc, pc):
                continue
            bm.faces.new((V[j][i], V[j][(i + 1) % n], V[j + 1][(i + 1) % n], V[j + 1][i]))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # give the shell thickness inward so the visor rim reads as hard edge
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    shell = obj_from_bm(bm, "Helmet")
    mod = shell.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.012
    mod.offset = -1
    C.apply_modifier(shell, mod)
    # visor: a slightly inset, darker cap filling the opening
    vt = np.radians(np.linspace(-64, 64, 24))
    vp = np.radians(np.linspace(-32, 38, 12))
    G = np.array([[pt(t, p, 0.975) for t in vt] for p in vp])
    visor = LC.grid_obj("Visor", G)
    # neck ring (metal) where the helmet meets the suit collar
    a = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    rows = []
    for dz, rr in ((-0.035, 0.112), (-0.030, 0.124), (-0.012, 0.128), (0.006, 0.124), (0.010, 0.112)):
        z = HEAD_C[2] - R[2] * math.sin(math.radians(58)) + dz
        rows.append(np.stack([np.sin(a) * rr, HEAD_C[1] + 0.01 - np.cos(a) * rr * 0.95, np.full_like(a, z)], -1))
    ring = LC.grid_obj("NeckRing", np.stack(rows, 0), closed_u=True)
    return shell, visor, ring


def rounded(name, size, loc, bevel=0.02, segs=3):
    ob = obj_from_bm(LM.make_rounded_box(size, bevel, segs), name)
    ob.location = loc
    C.apply_transform(ob)
    return ob


def ring_at(name, centre, axis, radius, minor=0.010, seg=20):
    bm = LM.make_torus_bm(radius, minor, seg, 6)
    ob = obj_from_bm(bm, name)
    ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(axis)).to_euler()
    ob.location = centre
    C.apply_transform(ob)
    return ob


# ------------------------------------------------------------------ main
def main():
    C.reset_scene()
    bpy.context.scene.world = bpy.data.worlds.new("World")
    C.gpu_cycles(1)
    body, arm, info = BB.build_base(mannequin_face=False, head_scale=1.0)
    suit_full = build_suit(body, arm)
    bpy.data.objects.remove(body)
    co = C.get_co(suit_full.data)

    # --- hard parts
    shell, visor, neck_ring = helmet_parts()
    chest_y = co[(np.abs(co[:, 0]) < 0.05) & (np.abs(co[:, 2] - 1.30) < 0.02)][:, 1].min()
    back_y = co[(np.abs(co[:, 0]) < 0.08) & (np.abs(co[:, 2] - 1.30) < 0.03)][:, 1].max()
    chest = rounded("ChestUnit", (0.17, 0.045, 0.11), (0, chest_y - 0.018, 1.29), 0.012)
    screen = rounded("Screen", (0.10, 0.006, 0.055), (0.0, chest_y - 0.042, 1.30), 0.004, 2)
    knobs = [ring_at(f"Knob{i}", (sx * 0.065, chest_y - 0.042, 1.30), (0, 1, 0), 0.010, 0.004, 12) for i, sx in enumerate((1, -1))]
    pack = rounded("Backpack", (0.30, 0.14, 0.40), (0, back_y + 0.075, 1.27), 0.035, 3)
    tank = rounded("PackTop", (0.22, 0.10, 0.05), (0, back_y + 0.075, 1.49), 0.02, 2)
    rings = []
    for s, sx in (("Left", 1), ("Right", -1)):
        wr = LC.bone_head(arm, s + "Hand")
        m = (np.abs(co[:, 0] - (wr[0] - sx * 0.02)) < 0.008)
        rr = np.linalg.norm(co[m][:, 1:] - co[m][:, 1:].mean(0), axis=1).mean() + 0.009
        rings.append(ring_at(f"Wrist{s}", (wr[0] - sx * 0.02, *co[m][:, 1:].mean(0)), (1, 0, 0), rr, 0.009))
        an = LC.bone_head(arm, s + "Foot")
        zr = 0.165
        m = (np.abs(co[:, 2] - zr) < 0.008) & (np.sign(co[:, 0]) == sx)
        c2 = co[m][:, :2].mean(0)
        rr = np.linalg.norm(co[m][:, :2] - c2, axis=1).mean() + 0.010
        rings.append(ring_at(f"Ankle{s}", (c2[0], c2[1], zr), (0, 0, 1), rr, 0.010))
    soles = []
    for s, sx in (("Left", 1), ("Right", -1)):
        m = (np.sign(co[:, 0]) == sx) & (co[:, 2] < 0.05)
        fp = co[m]
        soles.append(rounded(f"Sole{s}", (np.ptp(fp[:, 0]) + 0.012, np.ptp(fp[:, 1]) + 0.016, 0.03),
                             ((fp[:, 0].max() + fp[:, 0].min()) / 2, (fp[:, 1].max() + fp[:, 1].min()) / 2, 0.006), 0.008, 2))

    # --- low + high for the baked (Suit/Trim) atlas
    low_suit = SC.make_low(suit_full, "AstroLowSuit", SUIT_TRIS)
    hi_suit = SC.make_high(suit_full, "AstroHiSuit", levels=2)
    suit_detail(hi_suit, arm)
    hard = [shell, chest, pack, tank] + soles
    hard_hi = []
    for o in hard:
        h = SC.make_high(o, o.name + "_hi", levels=1)
        n = len(h.data.vertices)
        cc = WHITE if o.name in ("Helmet", "ChestUnit", "Backpack") else (GREY if o.name == "PackTop" else DARK)
        SC.point_color(h, "col", np.tile(cc, (n, 1)))
        SC.point_color(h, "rough", np.full((n, 3), 0.32 if o.name == "Helmet" else 0.5))
        hard_hi.append(h)
        LC.set_weights(o, {"Spine2" if o.name in ("ChestUnit", "Backpack", "PackTop") else
                           ("Head" if o.name == "Helmet" else ("LeftFoot" if o.name.endswith("Left") else "RightFoot")):
                           np.ones(len(o.data.vertices))})
        o.data.attributes.new("trim", "FLOAT", "POINT").data.foreach_set("value", np.ones(len(o.data.vertices)))
    hi_suit.data.attributes.remove(hi_suit.data.attributes["trim"])
    hi_all = C.join_objects([hi_suit] + hard_hi, "AstroHi")
    low = C.join_objects([low_suit] + hard, "Astro")
    C.smart_uv(low, margin=0.004)
    C.shade_smooth(low)
    imgs = SC.bake_set(low, hi_all, "Astro", TEX, ao_distance=0.08)
    bpy.data.objects.remove(hi_all)
    tex_dir = os.path.dirname(C.p("blender", "export", "textures", "x"))
    for k, img in imgs.items():
        C.save_image(img, os.path.join(tex_dir, f"astro_v2_{k}.png"))
    suit_mat = C.final_pbr_material("Suit", imgs["base"], imgs["orm"], imgs["normal"])
    # slightly softer normals on gloves/boots/hard parts; also keeps "Trim" a separate glTF material
    trim_mat = C.final_pbr_material("Trim", imgs["base"], imgs["orm"], imgs["normal"], normal_strength=0.85)
    low.data.materials.clear()
    low.data.materials.append(suit_mat)
    low.data.materials.append(trim_mat)
    tv = np.empty(len(low.data.vertices))
    low.data.attributes["trim"].data.foreach_get("value", tv)
    for pl in low.data.polygons:
        pl.material_index = 1 if tv[list(pl.vertices)].mean() > 0.5 else 0
    low.data.attributes.remove(low.data.attributes["trim"])

    # --- factor-only parts
    visor_mat = C.new_material("Visor", base=(0.012, 0.014, 0.018), rough=0.06, metal=0.85)
    metal_mat = C.new_material("Metal", base=(0.72, 0.74, 0.78), rough=0.28, metal=1.0)
    screen_mat = C.new_material("Screen", base=(0.02, 0.05, 0.05), rough=0.3, emit=(0.15, 0.95, 0.85), emit_strength=3.0)
    for o, mat, bone in [(visor, visor_mat, "Head"), (neck_ring, metal_mat, "Spine2"), (screen, screen_mat, "Spine2")] + \
            [(k, metal_mat, "Spine2") for k in knobs] + \
            [(r, metal_mat, ("LeftForeArm" if "WristLeft" in r.name else "RightForeArm" if "WristRight" in r.name
                             else "LeftLeg" if "AnkleLeft" in r.name else "RightLeg")) for r in rings]:
        o.data.materials.clear()
        o.data.materials.append(mat)
        C.shade_smooth(o)
        LC.set_weights(o, {bone: np.ones(len(o.data.vertices))})
    for m in (suit_mat, trim_mat, metal_mat, screen_mat, visor_mat):
        m.use_backface_culling = True
    parts = [low, visor, neck_ring, screen] + knobs + rings
    for o in parts:
        for md in list(o.modifiers):
            o.modifiers.remove(md)
    astro = C.join_objects(parts, "Astro")
    C.ensure_armature_modifier(astro, arm)
    C.limit_weights(astro, 4)
    make_clips(arm)
    C.log("TRIS", C.count_tris([astro]), "materials", [m.name for m in astro.data.materials])
    C.save_blend(C.p("blender", "characters", "astro.blend"))
    C.export_glb(C.p("blender", "export", "astro_raw.glb"), objects=[arm, astro])


main()
