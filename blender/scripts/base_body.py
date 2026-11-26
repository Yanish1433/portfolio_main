"""Neutral (genderless) realistic base body from MPFB2 (MakeHuman for Blender, CC0 assets).

build_base() returns (mesh, armature, info):
  * MPFB human: gender 0.5, average age/muscle/weight, mixed race, neutralised chest/hips/waist
  * MPFB built-in "mixamo" rig + its CC0 weights (exact Mixamo bone names, incl. fingers)
  * helper geometry (eyes, teeth, tongue, joint cubes, hair/skirt helpers) deleted
  * chest, navel and groin softened into simple planes (no nipple/navel/genital detail)
  * optional mannequin face (eyes, mouth and ears smoothed away; nose bridge and brow kept)
  * REST POSE converted from MakeHuman's A-pose to a T-pose (arms horizontal, palms down)
  * head scaled ~1.05x (slight stylisation), feet on Z=0, facing -Y
The MPFB extension must be installed in the user profile (see blender/README.md).
"""
import importlib

import bpy
import numpy as np
from mathutils import Vector

import common as C

MPFB_MODULE = "bl_ext.user_default.mpfb"

MACROS = {
    "gender": 0.5, "age": 0.5, "muscle": 0.5, "weight": 0.5, "proportions": 0.5,
    "height": 0.55, "cupsize": 0.2, "firmness": 0.5,
    "race": {"asian": 0.333, "caucasian": 0.333, "african": 0.334},
}

# extra MakeHuman targets (name -> weight) to neutralise sex cues in the silhouette
NEUTRAL_TARGETS = {
    "measure-bust-circ-decr": 0.35,
    "breast-volume-vert-down": 0.0,
    "breast-point-decr": 0.6,
    "measure-hips-circ-decr": 0.25,
    "hip-scale-horiz-decr": 0.15,
    "measure-waist-circ-incr": 0.15,
    "torso-muscle-pectoral-decr": 0.3,
    "stomach-navel-out": 0.8,
    "stomach-tone-incr": 0.3,
}
# mannequin face: shrink ears + flatten lips before the smoothing pass
FACE_TARGETS = {
    "l-ear-scale-decr": 0.7, "r-ear-scale-decr": 0.7,
    "l-ear-flap-decr": 1.0, "r-ear-flap-decr": 1.0,
    "l-ear-lobe-decr": 1.0, "r-ear-lobe-decr": 1.0,
    "mouth-upperlip-volume-decr": 1.0, "mouth-lowerlip-volume-decr": 1.0,
    "mouth-cupidsbow-decr": 1.0, "nose-flaring-decr": 0.6, "nose-nostrils-width-decr": 0.5,
}


def mpfb_services():
    import addon_utils
    if MPFB_MODULE not in bpy.context.preferences.addons:
        addon_utils.enable(MPFB_MODULE, default_set=True)
    hs = importlib.import_module(MPFB_MODULE + ".services.humanservice").HumanService
    ts = importlib.import_module(MPFB_MODULE + ".services.targetservice").TargetService
    return hs, ts


def mpfb_version():
    import addon_utils
    for mod in addon_utils.modules():
        if mod.__name__ == MPFB_MODULE:
            return ".".join(map(str, addon_utils.module_bl_info(mod).get("version", ())))
    return "?"


def _centroid(co, w):
    m = w > 0.5
    return co[m].mean(axis=0) if m.any() else None


def build_base(mannequin_face=False, head_scale=1.05, tpose=True):
    HS, TS = mpfb_services()
    human = HS.create_human(macro_detail_dict=MACROS, detailed_helpers=True, extra_vertex_groups=True,
                            feet_on_ground=True, scale=0.1)
    human.name = human.data.name = "Body"
    targets = dict(NEUTRAL_TARGETS)
    if mannequin_face:
        targets.update(FACE_TARGETS)
    for tname, w in targets.items():
        if w <= 0:
            continue
        path = TS.target_full_path(tname)
        if path is None:
            C.log("WARNING target not found", tname)
            continue
        TS.load_target(human, path, weight=w, name=tname)
    TS.bake_targets(human)

    # rig fitted to the baked shape (uses the joint-cube helpers, so do this before deleting them)
    arm = HS.add_builtin_rig(human, "mixamo", import_weights=True)
    arm.name = "Armature"
    arm.data.name = "Armature"

    # ---- landmarks from helper geometry, then delete all helpers
    me = human.data
    co = C.get_co(me)
    gw = C.all_group_weights(human)
    land = {
        "l_eye": _centroid(co, gw["helper-l-eye"]),
        "r_eye": _centroid(co, gw["helper-r-eye"]),
        "mouth": _centroid(co, gw["helper-upper-teeth"] + gw["helper-lower-teeth"]),
    }
    body = gw["body"] > 0.5
    for m in list(human.modifiers):
        if m.type == "MASK":
            human.modifiers.remove(m)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(~body)[0]], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    keep_prefix = (C.PREFIX,)
    for vg in list(human.vertex_groups):
        if not vg.name.startswith(keep_prefix) and vg.name not in ("nipple", "nippleTip", "genitals", "lips", "ears"):
            human.vertex_groups.remove(vg)

    # ---- neutralise: chest, navel, groin, (face)
    co = C.get_co(me)
    edges = C.get_edges(me)
    gw = C.all_group_weights(human)
    n = len(co)
    w = np.zeros(n)
    nip = gw.get("nipple", np.zeros(n)) + gw.get("nippleTip", np.zeros(n))
    for side in (1, -1):
        sel = (nip > 0.1) & (np.sign(co[:, 0]) == side)
        if sel.any():
            w = np.maximum(w, C.radial_mask(co, co[sel].mean(axis=0), 0.03, 0.065))
    # chest: gentle overall planing
    chest = C.smoothstep(0.0, 0.03, -co[:, 1]) * (1 - C.smoothstep(0.16, 0.22, np.abs(co[:, 0])))
    zc = co[:, 2]
    chest *= C.smoothstep(1.12, 1.18, zc) * (1 - C.smoothstep(1.32, 1.38, zc))
    w = np.maximum(w, 0.45 * chest)
    # navel: deepest point of the front belly
    belly = (np.abs(co[:, 0]) < 0.03) & (zc > 0.9) & (zc < 1.1) & (co[:, 1] < 0)
    if belly.any():
        idx = np.nonzero(belly)[0]
        # navel = most "inward" vertex relative to its neighbours on the belly midline
        lap = C.neighbour_mean(co, edges, np.bincount(edges.ravel(), minlength=n).astype(float)) - co
        navel = co[idx[np.argmin(-lap[idx, 1])]]
        w = np.maximum(w, C.radial_mask(co, navel, 0.025, 0.055))
    gen = gw.get("genitals", np.zeros(n))
    gsel = gen > 0.1
    if gsel.any():
        w = np.maximum(w, C.radial_mask(co, co[gsel].mean(axis=0), 0.05, 0.10))
    co = C.smooth_weighted(co, edges, w, iterations=40)
    if gsel.any():   # groin: flatten into a simple mannequin plane (plain Laplacian removes the bulge)
        gc = co[gsel].mean(axis=0)
        wg = C.radial_mask(co, gc + np.array([0, 0.01, 0.02]), 0.06, 0.11)
        co = C.smooth_weighted(co, edges, wg, iterations=80, taubin=False, lam=0.5)
        co = C.smooth_weighted(co, edges, C.radial_mask(co, gc, 0.08, 0.14), iterations=20)

    C.set_co(me, co)
    if mannequin_face:
        fill_face_pockets(human, land, gw.get("ears", np.zeros(n)) > 0.5)
    for nm in ("nipple", "nippleTip", "genitals", "lips", "ears"):
        vg = human.vertex_groups.get(nm)
        if vg:
            human.vertex_groups.remove(vg)

    C.shade_smooth(human)
    C.ensure_armature_modifier(human, arm)
    C.limit_weights(human, 4)

    if tpose:
        to_tpose(arm, [human])
    if head_scale != 1.0:
        scale_head(human, arm, head_scale)
    info = {"landmarks": {k: (v.tolist() if v is not None else None) for k, v in land.items()},
            "height": float(C.get_co(me)[:, 2].max()), "tris": C.count_tris([human])}
    C.log("base body", info)
    return human, arm, info


def fill_face_pockets(human, land, ears):
    """Mannequin face: cut out the eye pockets (surfaces facing the eyeball), the mouth interior
    (surfaces facing inward) and the ears, fill the holes with fans and relax them into planes."""
    import bmesh
    me = human.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    dl = bm.verts.layers.deform.verify()
    head_idx = human.vertex_groups[C.PREFIX + "Head"].index
    hc = np.array([0.0, -0.01, (land["l_eye"][2] + land["mouth"][2]) / 2])
    kill = []
    for v in bm.verts:
        p = np.array(v.co)
        nn = np.array(v.normal)
        hit = bool(ears[v.index])
        for k in ("l_eye", "r_eye"):
            d = land[k] - p
            dist = np.linalg.norm(d)
            if dist < 0.0175 and np.dot(nn, d) / max(dist, 1e-9) > 0.05:
                hit = True
        e = (p - land["mouth"]) / np.array([0.030, 0.034, 0.014])
        if np.linalg.norm(e) < 1.0:
            out = p - hc
            out /= np.linalg.norm(out)
            if np.dot(nn, out) < 0.3:
                hit = True
        if hit:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    # keep only the main surface (drop bits of pocket left floating)
    bm.verts.ensure_lookup_table()
    seen, comps = set(), []
    for v in bm.verts:
        if v in seen:
            continue
        stack, comp = [v], []
        seen.add(v)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o not in seen:
                    seen.add(o)
                    stack.append(o)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    junk = [v for comp in comps[1:] for v in comp]
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    boundary = [e for e in bm.edges if e.is_boundary]
    res = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    new_faces = res["faces"]
    poked = bmesh.ops.poke(bm, faces=new_faces)
    centres = poked["verts"]
    for c in centres:
        ring = [e.other_vert(c) for e in c.link_edges]
        avg = sum((r.co for r in ring), c.co * 0) / max(len(ring), 1)
        out = avg - type(avg)(hc)
        out.normalize()
        c.co = avg + out * 0.0025
        c[dl].clear()
        c[dl][head_idx] = 1.0
    patch_pts = [np.array(c.co) for c in centres]
    bm.to_mesh(me)
    bm.free()
    me.update()
    # blend the patches into sculpted planes
    co = C.get_co(me)
    edges = C.get_edges(me)
    w = np.zeros(len(co))
    for p in patch_pts:
        w = np.maximum(w, C.radial_mask(co, p, 0.020, 0.040))
    co = C.smooth_weighted(co, edges, w, iterations=40, taubin=False, lam=0.5)   # erase lid/lip creases
    w2 = np.zeros(len(co))
    for p in patch_pts:
        w2 = np.maximum(w2, 0.8 * C.radial_mask(co, p, 0.030, 0.055))
    co = C.smooth_weighted(co, edges, w2, iterations=25)                         # blend into planes
    wm = C.radial_mask(co, land["mouth"] + np.array([0, -0.012, 0]), 0.022, 0.045)  # no lip volume left
    co = C.smooth_weighted(co, edges, wm, iterations=60, taubin=False, lam=0.5)
    C.set_co(me, co)
    C.log("mannequin face: removed", len(kill), "verts,", len(centres), "patches")


def to_tpose(arm, meshes):
    """MakeHuman rests in an A-pose: pose arms horizontal (palms down), then apply as rest."""
    C.reset_pose(arm)
    for side, sx in (("Left", 1), ("Right", -1)):
        for b in ("Arm", "ForeArm", "Hand"):
            C.align_bone_world(arm, side + b, (sx, 0, 0))
    C.apply_pose_as_rest(arm, meshes)
    C.reset_pose(arm)


def scale_head(mesh, arm, s):
    me = mesh.data
    co = C.get_co(me)
    w = C.group_weights(mesh, C.PREFIX + "Head")
    neck = C.group_weights(mesh, C.PREFIX + "Neck")
    w = np.clip(w + 0.35 * neck * (w > 0), 0, 1)
    pivot = np.array(arm.matrix_world @ arm.data.bones[C.PREFIX + "Head"].head_local)
    f = 1 + (s - 1) * w
    co = pivot + (co - pivot) * f[:, None]
    C.set_co(me, co)
    # keep the head bone tail at the top of the bigger head
    C.select_only(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones[C.PREFIX + "Head"]
    eb.tail = eb.head + (eb.tail - eb.head) * s
    bpy.ops.object.mode_set(mode="OBJECT")


def mixamo_bone_names(arm):
    return [b.name for b in arm.data.bones]
