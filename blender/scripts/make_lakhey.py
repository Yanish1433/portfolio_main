"""Lakhey, guardian dancer: third playable character (original design; Newar masked-dance tradition).

  blender.exe --background --python blender/scripts/make_lakhey.py -- --stage full
      > blender/logs/make_lakhey.log 2>&1

Stages:
  mask : the hero mask only            -> blender/export/lakhey_mask_raw.glb
  full : body + mask + hair + costume + rig + Idle/Walk/Run/Dance clips
         -> blender/characters/lakhey.blend, blender/export/lakhey_raw.glb
  clips: keep the built character in lakhey.blend, replace only its clips (seconds, not minutes)
         -> blender/characters/lakhey.blend, blender/export/lakhey_raw.glb
Then compress with gltf-transform (see blender/README.md) -> public/models/lakhey.glb.
Run WITHOUT --factory-startup (the base body comes from the MPFB extension).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

import base_body as BB  # noqa: E402
import common as C  # noqa: E402
import lakhey_costume as LC  # noqa: E402
import lakhey_mask as LM  # noqa: E402
from clips import make_clips  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--stage", default="full", choices=["mask", "full", "clips"])
ap.add_argument("--tex", type=int, default=2048)
args = ap.parse_args(C.script_args())

TEX_DIR = os.path.dirname(C.p("blender", "export", "textures", "x"))
# ------------------------------------------------------------------ build
def build_full():
    C.reset_scene()
    w = bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    C.gpu_cycles(1)
    body, arm, info = BB.build_base(mannequin_face=False, head_scale=1.0)
    body_co_all = C.get_co(body.data)

    # ---- mask (rigid to Head)
    mask, mask_metal = LM.build_mask(TEX_DIR, tex_size=args.tex)
    metal = bpy.data.materials["Metal"]

    # ---- split the body: bare forearms/hands/feet (Skin) + tunic shell
    skin, tunic = LC.split_body(body, arm)
    C.log("skin tris", LC.decimate(skin, 4300), "tunic tris", LC.decimate(tunic, 2500))
    skin.data.materials.clear()
    skin_mat = C.new_material("Skin", base=tuple(LC.SKIN), rough=0.55)
    skin.data.materials.append(skin_mat)

    # ---- robe pieces
    skirt, c_top, r_top = LC.make_skirt(body_co_all)
    collar = LC.make_collar(tunic)
    sash = LC.make_sash(c_top, r_top)
    bells = LC.make_bells(c_top, r_top, metal)
    apron = LC.make_apron(c_top, r_top)
    capes = LC.make_capes(arm)
    bands = LC.make_wristbands(arm, skin)
    sandals = LC.make_sandals(arm, skin)
    robe = C.join_objects([skirt, sash, collar] + capes + bands + sandals, "Robe")
    tunic_all = C.join_objects([tunic, apron], "TunicAll")
    LC.fit_uv_rect(tunic_all, (0.0, 1.0, 0.0, 1.0))

    # ---- hair (collides with the tunic + mask)
    collider = LC.Collider([tunic_all, mask, robe])
    hair = LC.make_hair(collider)
    hb, hn, ho = LC.hair_textures(512)
    hmat = C.final_pbr_material("Hair", LC.np_image("Hair_base", hb, True), LC.np_image("Hair_orm", ho, False),
                                LC.np_image("Hair_normal", hn, False), normal_strength=0.8)
    hmat.use_backface_culling = False
    hair.data.materials.append(hmat)

    # ---- rigid parts
    for o in (mask, mask_metal):
        LC.set_weights(o, {"Head": np.ones(len(o.data.vertices))})

    # ---- cloth bakes (wrinkles -> normals, AO with the whole character present)
    LC.bake_cloth(robe, 1024, 1.0, "Robe", base_img=LC.robe_base_texture(1024), rough=0.72,
                  normal_img=LC.np_image("Robe_normal", LC.robe_normal_map(1024, r_top), False))
    t_base, t_nrm = LC.tunic_maps(1024, LC.uv_scale(tunic_all))
    LC.bake_cloth(tunic_all, 1024, 0.8, "Tunic", base_img=t_base, rough=0.70, normal_img=t_nrm)
    skin_mat.use_backface_culling = True
    metal.use_backface_culling = True
    for img in bpy.data.images:
        if img.name.startswith(("Robe_", "Tunic_", "Hair_")) and img.size[0] > 0:
            C.save_image(img, os.path.join(TEX_DIR, "lakhey_" + img.name.lower() + ".png"))

    # ---- one skinned mesh
    parts = [skin, tunic_all, robe, bells, hair, mask, mask_metal]
    for o in parts:
        for m in list(o.modifiers):
            o.modifiers.remove(m)
    lak = C.join_objects(parts, "Lakhey")
    C.ensure_armature_modifier(lak, arm)
    C.limit_weights(lak, 4)
    C.log("TRIS total", C.count_tris([lak]), "materials", [m.name for m in lak.data.materials])

    make_clips(arm)
    C.save_blend(C.p("blender", "characters", "lakhey.blend"))
    C.export_glb(C.p("blender", "export", "lakhey_raw.glb"), objects=[arm, lak])


def rebuild_clips():
    """Open the built character, drop its old actions, regenerate Idle/Walk/Run/Dance, export."""
    bpy.ops.wm.open_mainfile(filepath=C.p("blender", "characters", "lakhey.blend"))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    lak = next(o for o in bpy.data.objects if o.type == "MESH" and o.name == "Lakhey")
    arm.animation_data_create()
    arm.animation_data.action = None
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    make_clips(arm)
    C.save_blend(C.p("blender", "characters", "lakhey.blend"))
    C.export_glb(C.p("blender", "export", "lakhey_raw.glb"), objects=[arm, lak])


def main():
    if args.stage == "clips":
        rebuild_clips()
        return
    if args.stage == "mask":
        C.reset_scene()
        mask, metal = LM.build_mask(TEX_DIR, tex_size=args.tex)
        C.save_blend(C.p("blender", "characters", "lakhey_mask.blend"))
        C.export_glb(C.p("blender", "export", "lakhey_mask_raw.glb"), objects=[mask, metal])
        C.log("tris total", C.count_tris([mask, metal]))
        return
    build_full()


main()
