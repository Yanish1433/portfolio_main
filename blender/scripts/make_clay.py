"""Clay v2: a sculptor's clay maquette of the neutral MPFB body (genderless, faceless mannequin).

  blender.exe --background --python blender/scripts/make_clay.py > blender/logs/make_clay.log 2>&1

* body: base_body.build_base(mannequin_face=True, head_scale=1.05), nose/lips softened further
* sculpted CLAY CLOTHING: kurta top with 3/4 sleeves + loose trousers (the body surface, anatomy smoothed away
  and pushed out), a flared kurta skirt to mid-thigh, belt, sleeve cuffs and trouser hems
* high poly = subdivided body + numpy sculpt detail: thumb presses, spatula/tool marks, hairline cracks in creases
* baked to the ~18k-tri low poly at 2048 (normal, base colour, roughness, AO) -> 1024 WebP for the web
* material `Clay`: matte terracotta, Principled + image textures only
* same rig and clips as every v2 character (Idle, Dance)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

from mathutils import Vector  # noqa: E402

import base_body as BB  # noqa: E402
import common as C  # noqa: E402
import lakhey_costume as LC  # noqa: E402
import lakhey_mask as LM  # noqa: E402
import sculpt as SC  # noqa: E402
from clips import make_clips  # noqa: E402
from lakhey_mask import srgb  # noqa: E402

TEX = 2048
LOW_TRIS = 18000
CLAY = srgb(196, 92, 44)          # orange terracotta: clearly fired clay, not a skin tone
CLAY_DARK = srgb(112, 46, 22)
CLAY_DUST = srgb(214, 146, 104)
GROG_DARK = srgb(162, 74, 36)
GROG_LIGHT = srgb(208, 120, 72)
TORSO = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"]


def soften_face(body, land):
    """Maquette face: soften the nose and what is left of the lips (no realistic features)."""
    me = body.data
    co = C.get_co(me)
    edges = C.get_edges(me)
    eye_y = (land["l_eye"][1] + land["r_eye"][1]) / 2
    eye_z = (land["l_eye"][2] + land["r_eye"][2]) / 2
    nose = np.array([0.0, eye_y - 0.022, eye_z - 0.034])
    w = np.maximum(0.8 * C.radial_mask(co, nose, 0.016, 0.034),
                   C.radial_mask(co, np.array(land["mouth"]) + np.array([0, -0.012, 0]), 0.02, 0.04))
    co = C.smooth_weighted(co, edges, w, iterations=30, taubin=False, lam=0.5)
    co = C.smooth_weighted(co, edges, C.radial_mask(co, nose, 0.03, 0.06), iterations=15)
    C.set_co(me, co)


def dress(body, arm):
    """Sculpt clay clothes onto the body: a kurta top with 3/4 sleeves and loose trousers.
    All anatomy under the garments is smoothed away first. Returns the per-vertex cloth mask."""
    dom, _ = LC.dominant(body)
    me = body.data
    co = C.get_co(me)
    edges = C.get_edges(me)
    wr_x = abs(LC.bone_head(arm, "LeftHand")[0])
    ax = np.abs(co[:, 0])
    torso = np.isin(dom, TORSO) & (co[:, 2] < 1.49)
    sleeves = np.isin(dom, ["LeftArm", "RightArm"]) | (np.isin(dom, ["LeftForeArm", "RightForeArm"]) & (ax < wr_x - 0.075))
    legs = np.isin(dom, ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]) & (co[:, 2] > 0.115)
    clothed = torso | sleeves | legs
    w = np.clip(C.smooth_scalar(clothed.astype(float), edges, 3) * 1.2, 0, 1)
    co = C.smooth_weighted(co, edges, w, iterations=25, taubin=False, lam=0.5)   # erase anatomy
    co = C.smooth_weighted(co, edges, w, iterations=30)
    C.set_co(me, co)
    me.update()
    nrm = C.get_normals(me)
    off = np.where(torso, 0.024, np.where(sleeves, 0.020, 0.028))
    off = C.smooth_scalar(off * clothed, edges, 4)
    co = co + nrm * off[:, None]
    co = C.smooth_weighted(co, edges, w, iterations=12)
    C.set_co(me, co)
    return w


def ring(name, centre, axis, radius, minor):
    ob = LM.bm_to_obj(LM.make_torus_bm(radius, minor, 22, 6, 0.8), name)
    ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(axis)).to_euler()
    ob.location = centre
    C.apply_transform(ob)
    return ob


def garments(body, arm):
    """Kurta skirt to mid-thigh, belt, sleeve + trouser cuffs (all clay, skinned)."""
    co = C.get_co(body.data)
    c, r = LC.cross_section(co, 1.00, 0.02)
    a = np.linspace(0, 2 * np.pi, 48, endpoint=False)
    rng = np.random.default_rng(4)
    jit = rng.normal(0, 0.4, 48)
    rows = []
    for j in range(10):
        f = j / 9
        z = 1.03 - 0.41 * f
        sec = LC.cross_section(co, z, 0.015, np.abs(co[:, 0]) < 0.30)
        rz = sec[1] if sec is not None else r
        rx = max(rz[0], r[0]) + 0.012 + 0.075 * f ** 1.3
        ry = max(rz[1], r[1]) + 0.012 + 0.060 * f ** 1.3
        wave = np.sin(a * 9 + jit * 1.5) * (0.002 + 0.013 * f)
        zz = np.full_like(a, z) + 0.008 * f * np.sin(a * 9 + 0.7)
        rows.append(np.stack([np.sin(a) * (rx + wave), c[1] - np.cos(a) * (ry + wave), zz], -1))
    skirt = LC.grid_obj("KurtaSkirt", np.stack(rows, 0), closed_u=True)
    LC.set_weights(skirt, LC.skirt_weights(C.get_co(skirt.data), top=1.03, hem=0.62))
    rows = []
    for z, d in ((0.985, 0.010), (0.995, 0.020), (1.02, 0.022), (1.045, 0.020), (1.055, 0.010)):
        rows.append(np.stack([np.sin(a) * (r[0] + 0.012 + d), c[1] - np.cos(a) * (r[1] + 0.012 + d), np.full_like(a, z)], -1))
    belt = LC.grid_obj("Belt", np.stack(rows, 0), closed_u=True)
    n = len(belt.data.vertices)
    LC.set_weights(belt, {"Hips": np.full(n, 0.7), "Spine": np.full(n, 0.3)})
    parts = [skirt, belt]
    wr_x = abs(LC.bone_head(arm, "LeftHand")[0])
    for s_, sx in (("Left", 1), ("Right", -1)):
        x0 = sx * (wr_x - 0.075)
        m = (np.abs(co[:, 0] - x0) < 0.006)
        yz = co[m][:, 1:]
        cyz = (yz.max(0) + yz.min(0)) / 2
        rr = np.linalg.norm(yz - cyz, axis=1).mean() + 0.004
        cuff = ring(f"Cuff{s_}", (x0, cyz[0], cyz[1]), (1, 0, 0), rr, 0.009)
        LC.set_weights(cuff, {s_ + "ForeArm": np.ones(len(cuff.data.vertices))})
        m = (np.abs(co[:, 2] - 0.125) < 0.006) & (np.sign(co[:, 0]) == sx)
        cxy = (co[m][:, :2].max(0) + co[m][:, :2].min(0)) / 2
        rr = np.linalg.norm(co[m][:, :2] - cxy, axis=1).mean() + 0.004
        hem = ring(f"TrouserHem{s_}", (cxy[0], cxy[1], 0.125), (0, 0, 1), rr, 0.011)
        LC.set_weights(hem, {s_ + "Leg": np.ones(len(hem.data.vertices))})
        parts += [cuff, hem]
    for o in parts:
        o.data.attributes.new("cloth", "FLOAT", "POINT").data.foreach_set("value", np.ones(len(o.data.vertices)))
    return parts


def clay_detail(hi):
    me = hi.data
    co = C.get_co(me)
    cloth = np.zeros(len(co))
    if "cloth" in me.attributes:
        me.attributes["cloth"].data.foreach_get("value", cloth)
    cloth = np.clip(cloth, 0, 1)
    nrm = C.get_normals(me)
    conc = SC.concavity(hi)
    rng = np.random.default_rng(5)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    # spatula / tool marks: short directional ripples in a few random directions, patchy
    h = np.zeros(len(co))
    for k in range(5):
        d = rng.normal(size=3)
        d /= np.linalg.norm(d)
        ph = rng.uniform(0, 6.28)
        patch = np.clip(np.sin(x * rng.uniform(9, 15) + ph) * np.sin(z * rng.uniform(7, 12) + 1.3 * ph) * 2.5 - 1.6, 0, 1)
        h += 0.00075 * patch * np.sin((co @ d) * rng.uniform(260, 420) + 2.5 * np.sin(z * 31 + ph))
    # thumb presses, more on the big convex forms
    hp = SC.presses(hi, 2600, (0.005, 0.012), (0.0005, 0.0012), seed=9, mask=np.clip(0.4 - conc, 0.05, 1.4))
    h += hp
    # hairline cracks in the creases (armpits, elbows, knees, neck, fingers)
    lines = np.abs(np.sin(x * 210 + 3 * np.sin(z * 55)) * np.sin(z * 180 + 4 * np.sin(y * 70)))
    crack = np.clip(conc - 0.25, 0, 1) * (lines < 0.06)
    h -= 0.0008 * crack
    # hand-pressed drapery on the garments: soft folds, slab seams, placket and side seams
    h += cloth * (0.0026 * np.sin(z * 55 + 3 * np.sin(x * 17 + y * 13)) * np.sin(x * 23 + z * 9)
                  + 0.0014 * np.sin((x * 0.6 + y * 0.8) * 70 + 4 * np.sin(z * 21)))
    seam = ((np.abs(x) < 0.0035) & (y < -0.05) & (z > 1.18) & (z < 1.46)).astype(float)      # kurta placket
    seam = np.maximum(seam, (np.abs(nrm[:, 0]) > 0.965) & (z > 0.13) & (z < 1.40))            # side seams
    for k in range(7):                                                                          # slab joins
        d = rng.normal(size=3)
        d /= np.linalg.norm(d)
        p0 = co[rng.integers(len(co))]
        seam = np.maximum(seam, (np.abs((co - p0) @ d) < 0.0012) * (np.linalg.norm(co - p0, axis=1) < 0.12))
    seam = seam * cloth
    h -= 0.0011 * seam
    SC.displace(hi, h)
    # colour: terracotta, darker in creases/cracks/presses, dusty on ridges, mottled
    mott = 0.5 + 0.5 * np.sin(x * 37 + np.sin(z * 23) * 2) * np.sin(y * 41 + z * 17)
    col = CLAY[None] * (0.92 + 0.12 * mott[:, None])
    dark = np.clip(0.55 * np.clip(conc, 0, 1) + 0.9 * crack + np.clip(-hp * 300, 0, 0.25), 0, 1)
    col = col * (1 - dark[:, None]) + CLAY_DARK[None] * dark[:, None]
    dust = np.clip(-conc - 0.2, 0, 1) * 0.5
    col = col * (1 - dust[:, None]) + CLAY_DUST[None] * dust[:, None]
    col = col * (1 - 0.6 * seam[:, None]) + CLAY_DARK[None] * (0.6 * seam[:, None])
    g = rng.random(len(co))                                                                      # grog speckle
    col[g > 0.9955] = GROG_DARK
    col[(g > 0.9925) & (g <= 0.9955)] = GROG_LIGHT
    SC.point_color(hi, "col", col)
    rough = np.clip(0.86 - 0.14 * np.clip(-conc, 0, 1) + 0.04 * mott, 0.6, 0.95)  # burnished ridges a bit smoother
    SC.point_color(hi, "rough", np.repeat(rough[:, None], 3, 1))


def main():
    C.reset_scene()
    bpy.context.scene.world = bpy.data.worlds.new("World")
    C.gpu_cycles(1)
    body, arm, info = BB.build_base(mannequin_face=True, head_scale=1.05)
    soften_face(body, {k: np.array(v) for k, v in info["landmarks"].items()})
    w = dress(body, arm)
    body.data.attributes.new("cloth", "FLOAT", "POINT").data.foreach_set("value", w)
    parts = garments(body, arm)
    for o in [body] + parts:
        for m in list(o.modifiers):
            o.modifiers.remove(m)
    body = C.join_objects([body] + parts, "ClaySrc")
    C.ensure_armature_modifier(body, arm)
    low = SC.make_low(body, "Clay", LOW_TRIS)
    hi = SC.make_high(body, "ClayHi", levels=2)
    C.log("low tris", C.count_tris([low]), "hi verts", len(hi.data.vertices))
    clay_detail(hi)
    bpy.data.objects.remove(body)
    imgs = SC.bake_set(low, hi, "Clay", TEX, ao_distance=0.10)
    bpy.data.objects.remove(hi)
    tex_dir = os.path.dirname(C.p("blender", "export", "textures", "x"))
    for k, img in imgs.items():
        C.save_image(img, os.path.join(tex_dir, f"clay_v2_{k}.png"))
    mat = C.final_pbr_material("Clay", imgs["base"], imgs["orm"], imgs["normal"], normal_strength=1.0)
    mat.use_backface_culling = True
    low.data.materials.clear()
    low.data.materials.append(mat)
    C.ensure_armature_modifier(low, arm)
    C.limit_weights(low, 4)
    make_clips(arm)
    C.log("TRIS", C.count_tris([low]))
    C.save_blend(C.p("blender", "characters", "clay.blend"))
    C.export_glb(C.p("blender", "export", "clay_raw.glb"), objects=[arm, low])


main()
