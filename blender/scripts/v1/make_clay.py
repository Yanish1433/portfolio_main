"""Clay: soft clay mannequin. Genderless, featureless head, mitten hands.

Run:  blender.exe --background --factory-startup --python blender/scripts/make_clay.py
Pipeline: metaball union (one connected surface) -> mesh -> decimate -> UV -> bake
procedural clay into 1024 textures -> Principled+Image material -> shared armature
-> auto weights -> Idle -> .blend + .glb
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common as C  # noqa: E402

# ---- tweakables ---------------------------------------------------------
CLAY_COLOR = (0.50, 0.25, 0.19)      # warm terracotta clay
CLAY_COLOR_DARK = (0.40, 0.19, 0.15)
TARGET_TRIS = 17000
TEX = 1024
HEAD_SCALE = 1.1                      # >1 = bigger head (1:5 .. 1:5.5)
# -------------------------------------------------------------------------


def build_body():
    b = C.Blobs("ClayBlobs", resolution=0.017)
    hs = HEAD_SCALE
    # head: slightly tall egg, no features at all
    b.ball((0, 0.0, 1.535), 0.150 * hs, (1.0, 1.04, 1.08))
    # neck
    b.chain((0, 0, 1.40), (0, 0, 1.47), 0.060, 0.056)
    # torso (straight, unisex: no bust, no waist/hip exaggeration)
    b.chain((0, 0, 1.32), (0, 0, 1.25), 0.165, 0.158, (1.0, 0.74, 1.0), step=0.25)
    b.chain((0, 0, 1.25), (0, 0, 1.08), 0.158, 0.145, (1.0, 0.76, 1.0), step=0.25)
    b.chain((0, 0, 1.08), (0, 0, 0.96), 0.145, 0.152, (1.0, 0.8, 1.0), step=0.25)
    b.ball((0, 0, 0.93), 0.15, (1.1, 0.82, 0.9))
    # arms (T-pose)
    for sx in (1, -1):
        b.chain((0.14 * sx, 0, 1.32), (0.39 * sx, 0, 1.335), 0.066, 0.054)     # upper arm
        b.chain((0.39 * sx, 0, 1.335), (0.63 * sx, 0, 1.34), 0.054, 0.042)     # forearm
        b.ball((0.73 * sx, 0, 1.34), 0.078, (1.35, 0.95, 0.55))                # mitten hand
        b.ball((0.70 * sx, -0.07, 1.335), 0.032, (1.2, 1.0, 1.0))               # thumb
        # legs
        lx = C.LEG_X * sx
        b.chain((lx, 0, 0.88), (lx, 0, 0.50), 0.079, 0.060)                    # thigh
        b.chain((lx, 0, 0.50), (lx, 0, 0.12), 0.060, 0.036)                    # shin
        b.ball((lx, -0.075, 0.047), 0.070, (0.95, 2.3, 0.9))                   # foot
    obj = b.to_mesh("ClayBody")
    return obj


def procedural_clay():
    mat = bpy.data.materials.new("ClayProc")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    bsdf = next(n for n in N if n.type == "BSDF_PRINCIPLED")
    coord = N.new("ShaderNodeTexCoord")
    # colour variation
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 7.0
    noise.inputs["Detail"].default_value = 5.0
    L.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*CLAY_COLOR_DARK, 1)
    ramp.color_ramp.elements[1].color = (*CLAY_COLOR, 1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65
    L.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    # fingerprint ridges: distorted wave rings + fine voronoi dents
    wave = N.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 70.0
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 2.0
    L.new(coord.outputs["Object"], wave.inputs["Vector"])
    vor = N.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 160.0
    L.new(coord.outputs["Object"], vor.inputs["Vector"])
    mix = N.new("ShaderNodeMath")
    mix.operation = "ADD"
    L.new(wave.outputs["Fac"], mix.inputs[0])
    L.new(vor.outputs["Distance"], mix.inputs[1])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.004
    L.new(mix.outputs["Value"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # roughness variation
    rr = N.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.55
    rr.inputs["To Max"].default_value = 0.78
    L.new(noise.outputs["Fac"], rr.inputs["Value"])
    L.new(rr.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    return mat


def main():
    C.reset_scene()
    body = build_body()
    tris = C.decimate_to(body, TARGET_TRIS)
    C.smooth_mesh(body, iterations=10, factor=0.5)
    C.shade_smooth(body)
    print("body tris", tris, "bbox z", min(v.co.z for v in body.data.vertices),
          max(v.co.z for v in body.data.vertices))

    # ---- UV + bake procedural clay to textures
    C.smart_uv(body)
    proc = procedural_clay()
    C.assign_material(body, proc)
    C.setup_cycles(samples=16)
    tex_dir = os.path.join(C.ROOT, "blender", "export", "textures")
    os.makedirs(tex_dir, exist_ok=True)

    base = C.new_image("clay_basecolor", TEX)
    C.bake_pass(body, proc, "DIFFUSE", base)
    rough = C.new_image("clay_rough_tmp", TEX, non_color=True)
    C.bake_pass(body, proc, "ROUGHNESS", rough)
    nrm = C.new_image("clay_normal", TEX, color=(0.5, 0.5, 1.0, 1.0), non_color=True)
    C.bake_pass(body, proc, "NORMAL", nrm)
    orm = C.pack_orm(rough, "clay_orm", TEX)
    orm.name = "clay_metalrough"
    C.save_image(base, os.path.join(tex_dir, "clay_basecolor.png"))
    C.save_image(orm, os.path.join(tex_dir, "clay_metalrough.png"))
    C.save_image(nrm, os.path.join(tex_dir, "clay_normal.png"))

    final = C.final_pbr_material("Clay", base, orm, nrm, normal_strength=0.8, sheen=0.35)
    C.assign_material(body, final)
    bpy.data.materials.remove(proc)

    # ---- rig + skin
    arm = C.build_armature("ClayRig")
    body.name = "Clay"
    C.bind_auto(body, arm)
    C.make_idle(arm)

    C.select_only(arm)
    C.save_blend(C.p("blender", "characters", "clay.blend"))
    C.export_glb(C.p("blender", "export", "clay_raw.glb"))
    print("DONE clay tris", C.count_tris([body]))


main()
