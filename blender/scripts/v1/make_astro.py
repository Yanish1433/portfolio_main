"""Astro: small explorer in a padded suit. Helmet + mirrored dark visor hides the face.

Run:  blender.exe --background --factory-startup --python blender/scripts/make_astro.py
Body = one connected puffy suit surface (metaballs -> mesh, baked quilted-fabric textures,
auto weights). Gear (helmet, visor, ring, backpack, chest panel, gloves, boots, stripes) is
rigid: every vertex 100% on one bone, joined into a second mesh with several materials.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import common as C  # noqa: E402
from mathutils import Vector  # noqa: E402

# ---- tweakables ---------------------------------------------------------
SUIT_WHITE = (0.90, 0.89, 0.86)
ACCENT = (0.00, 0.58, 0.66)            # teal stripe colour
GLOVE_BOOT = (0.42, 0.44, 0.48)        # graphite
METAL = (0.80, 0.82, 0.86)
BODY_TRIS = 7500
TEX = 1024
# -------------------------------------------------------------------------


def build_suit():
    b = C.Blobs("AstroBlobs", resolution=0.017)
    # neck stub (hidden by collar + helmet)
    b.chain((0, 0, 1.36), (0, 0, 1.43), 0.062, 0.060)
    # puffy torso
    b.chain((0, 0, 1.30), (0, 0, 1.24), 0.178, 0.176, (1.0, 0.80, 1.0))
    b.chain((0, 0, 1.24), (0, 0, 1.08), 0.176, 0.160, (1.0, 0.82, 1.0))
    b.chain((0, 0, 1.08), (0, 0, 0.96), 0.160, 0.165, (1.0, 0.84, 1.0))
    b.ball((0, 0, 0.93), 0.158, (1.1, 0.86, 0.9))
    for sx in (1, -1):
        b.ball((0.18 * sx, 0, 1.30), 0.085, (1, 1, 1))                           # shoulder pad
        b.chain((0.16 * sx, 0, 1.32), (0.38 * sx, 0, 1.335), 0.078, 0.070)       # upper arm puff
        b.ball((0.39 * sx, 0, 1.335), 0.060)                                      # elbow pinch
        b.chain((0.40 * sx, 0, 1.335), (0.62 * sx, 0, 1.34), 0.068, 0.054)       # forearm puff
        lx = C.LEG_X * sx
        b.chain((lx, 0, 0.88), (lx, 0, 0.52), 0.086, 0.076)                     # thigh puff
        b.ball((lx, 0, 0.50), 0.066)                                              # knee pinch
        b.chain((lx, 0, 0.48), (lx, 0, 0.14), 0.068, 0.056)                      # shin puff
    return b.to_mesh("AstroSuit")


def procedural_fabric():
    mat = bpy.data.materials.new("FabricProc")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    bsdf = next(n for n in N if n.type == "BSDF_PRINCIPLED")
    coord = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(coord.outputs["Object"], sep.inputs["Vector"])

    def math_node(op, a=None, b=None, clamp=False):
        n = N.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        return n

    ax = math_node("ABSOLUTE")
    L.new(sep.outputs["X"], ax.inputs[0])
    m1 = math_node("GREATER_THAN")
    L.new(ax.outputs[0], m1.inputs[0])
    m1.inputs[1].default_value = 0.215
    m2 = math_node("GREATER_THAN")
    L.new(sep.outputs["Z"], m2.inputs[0])
    m2.inputs[1].default_value = 1.2
    mask = math_node("MULTIPLY")
    L.new(m1.outputs[0], mask.inputs[0])
    L.new(m2.outputs[0], mask.inputs[1])
    # coordinate along which the quilting repeats: z on body/legs, |x| on arms
    mixc = N.new("ShaderNodeMix")
    mixc.data_type = "FLOAT"
    L.new(mask.outputs[0], mixc.inputs[0])
    L.new(sep.outputs["Z"], mixc.inputs[2])
    L.new(ax.outputs[0], mixc.inputs[3])
    scl = math_node("MULTIPLY")
    L.new(mixc.outputs[0], scl.inputs[0])
    scl.inputs[1].default_value = 1.0 / 0.13      # quilt period ~13 cm
    pp = math_node("PINGPONG")
    L.new(scl.outputs[0], pp.inputs[0])
    pp.inputs[1].default_value = 1.0
    ramp = N.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.06
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.45
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    L.new(pp.outputs[0], ramp.inputs["Fac"])
    # fine weave
    weave = N.new("ShaderNodeTexNoise")
    weave.inputs["Scale"].default_value = 320.0
    weave.inputs["Detail"].default_value = 3.0
    L.new(coord.outputs["Object"], weave.inputs["Vector"])
    h0 = N.new("ShaderNodeMix")
    h0.data_type = "FLOAT"
    h0.inputs[0].default_value = 0.18
    L.new(ramp.outputs["Color"], h0.inputs[2])
    L.new(weave.outputs["Fac"], h0.inputs[3])
    # vertical centre seam (zip) on the torso only: groove where |x| < 6 mm, z above 1.0
    zl = math_node("LESS_THAN")
    L.new(ax.outputs[0], zl.inputs[0])
    zl.inputs[1].default_value = 0.006
    zh = math_node("GREATER_THAN")
    L.new(sep.outputs["Z"], zh.inputs[0])
    zh.inputs[1].default_value = 1.0
    zm = math_node("MULTIPLY")
    L.new(zl.outputs[0], zm.inputs[0])
    L.new(zh.outputs[0], zm.inputs[1])
    inv = math_node("SUBTRACT")
    inv.inputs[0].default_value = 1.0
    L.new(zm.outputs[0], inv.inputs[1])
    h = math_node("MULTIPLY")
    L.new(h0.outputs["Result"], h.inputs[0])
    L.new(inv.outputs[0], h.inputs[1])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.016
    L.new(h.outputs[0], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # colour: white, slightly darker in the seams, faint dirt
    dirt = N.new("ShaderNodeTexNoise")
    dirt.inputs["Scale"].default_value = 5.0
    dirt.inputs["Detail"].default_value = 6.0
    L.new(coord.outputs["Object"], dirt.inputs["Vector"])
    cr = N.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (*[c * 0.80 for c in SUIT_WHITE], 1)
    cr.color_ramp.elements[1].color = (*SUIT_WHITE, 1)
    cr.color_ramp.elements[0].position = 0.2
    cr.color_ramp.elements[1].position = 0.8
    L.new(dirt.outputs["Fac"], cr.inputs["Fac"])
    mul = N.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    L.new(cr.outputs["Color"], mul.inputs[6])
    ao = N.new("ShaderNodeMapRange")
    ao.inputs["To Min"].default_value = 0.72
    ao.inputs["To Max"].default_value = 1.0
    L.new(ramp.outputs["Color"], ao.inputs["Value"])
    # grayscale multiplier as colour
    aoc = N.new("ShaderNodeCombineColor")
    for s in ("Red", "Green", "Blue"):
        L.new(ao.outputs["Result"], aoc.inputs[s])
    L.new(aoc.outputs["Color"], mul.inputs[7])
    L.new(mul.outputs[2], bsdf.inputs["Base Color"])
    # roughness variation (fabric: mostly matte, patchy)
    rr = N.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.55
    rr.inputs["To Max"].default_value = 0.85
    L.new(dirt.outputs["Fac"], rr.inputs["Value"])
    L.new(rr.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def ring_fit(suit, axis, pos, side=None, centre=None):
    """Ellipse (centre, radii) of the suit's cross-section; rays cast from a guessed centre."""
    if centre is None:
        if axis == "z":
            centre = ((side or 0) * C.LEG_X if pos < 0.9 else 0.0, 0.0)
        else:  # x axis: arm
            centre = (0.0, 1.335)
    return C.fit_ring(suit, axis, pos, centre)


def main():
    C.reset_scene()
    suit = build_suit()
    tris = C.decimate_to(suit, BODY_TRIS)
    C.smooth_mesh(suit, iterations=4, factor=0.4)
    C.shade_smooth(suit)
    zs = [v.co.z for v in suit.data.vertices]
    print("suit tris", tris, "z", min(zs), max(zs))

    # -------- bake fabric
    C.smart_uv(suit)
    proc = procedural_fabric()
    C.assign_material(suit, proc)
    C.setup_cycles(samples=16)
    tex_dir = os.path.join(C.ROOT, "blender", "export", "textures")
    os.makedirs(tex_dir, exist_ok=True)
    base = C.new_image("astro_basecolor", TEX)
    C.bake_pass(suit, proc, "DIFFUSE", base)
    rough = C.new_image("astro_rough_tmp", TEX, non_color=True)
    C.bake_pass(suit, proc, "ROUGHNESS", rough)
    nrm = C.new_image("astro_normal", TEX, color=(0.5, 0.5, 1.0, 1.0), non_color=True)
    C.bake_pass(suit, proc, "NORMAL", nrm)
    orm = C.pack_orm(rough, "astro_metalrough", TEX)
    C.save_image(base, os.path.join(tex_dir, "astro_basecolor.png"))
    C.save_image(orm, os.path.join(tex_dir, "astro_metalrough.png"))
    C.save_image(nrm, os.path.join(tex_dir, "astro_normal.png"))
    C.assign_material(suit, C.final_pbr_material("AstroFabric", base, orm, nrm, 1.5, sheen=0.4))
    bpy.data.materials.remove(proc)

    # -------- materials for gear (plain Principled)
    m_helmet = C.new_material("HelmetShell", (0.93, 0.93, 0.92), rough=0.28, coat=0.5, coat_rough=0.1)
    m_visor = C.new_material("Visor", (0.015, 0.02, 0.035), rough=0.05, metal=1.0)
    m_trim = C.new_material("Trim", (0.12, 0.13, 0.15), rough=0.45)
    m_metal = C.new_material("Metal", METAL, rough=0.25, metal=1.0)
    m_accent = C.new_material("Accent", ACCENT, rough=0.5, sheen=0.2)
    m_glove = C.new_material("GloveBoot", GLOVE_BOOT, rough=0.7)
    m_sole = C.new_material("Sole", (0.07, 0.07, 0.08), rough=0.85)
    m_pack = C.new_material("Pack", (0.80, 0.80, 0.79), rough=0.5, metal=0.0)
    m_screen = C.new_material("Screen", (0.02, 0.05, 0.06), rough=0.2, emit=(0.0, 0.7, 0.85), emit_strength=0.8)
    lights = [
        C.new_material("LightGreen", (0.1, 1, 0.3), rough=0.3, emit=(0.1, 1.0, 0.3), emit_strength=4.0),
        C.new_material("LightAmber", (1, 0.6, 0.05), rough=0.3, emit=(1.0, 0.6, 0.05), emit_strength=4.0),
        C.new_material("LightRed", (1, 0.1, 0.1), rough=0.3, emit=(1.0, 0.1, 0.1), emit_strength=4.0),
    ]

    parts = []  # (object, material, [bone names])

    def add(obj, mat, bone):
        obj.data.materials.append(mat)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        C.apply_transform(obj)
        parts.append((obj, bone))
        print('PART', obj.name, C.count_tris([obj]))
        return obj

    # helmet (sits on the collar), visor frame + visor + side pods
    hz = 1.545
    add(C.make_sphere("Helmet", (0, 0, hz), (0.172, 0.18, 0.165), 36, 18), m_helmet, "Head")
    add(C.make_sphere("VisorFrame", (0, -0.085, hz + 0.012), (0.138, 0.112, 0.112), 28, 14), m_trim, "Head")
    add(C.make_sphere("Visor", (0, -0.092, hz + 0.012), (0.124, 0.112, 0.098), 28, 14), m_visor, "Head")
    for sx in (1, -1):
        add(C.make_cylinder(f"HelmetPod{sx}", (0.176 * sx, 0, hz - 0.01), 0.034, 0.05, 16, rot=(0, math.pi / 2, 0)),
            m_metal, "Head")
    # collar ring (metal helmet ring)
    add(C.make_torus("HelmetRing", (0, 0, 1.40), 0.105, 0.022, scale_xy=(1.0, 0.92)), m_metal, "Neck")

    # backpack
    hit = C.surface_hit(suit, (0, 1, 1.17), (0, -1, 0))
    back_y = hit.y if hit else 0.13
    add(C.make_rounded_box("Backpack", (0, back_y + 0.055, 1.17), (0.30, 0.13, 0.36), 0.032), m_pack, "Spine2")
    add(C.make_rounded_box("PackBand", (0, back_y + 0.058, 1.15), (0.305, 0.135, 0.035), 0.012), m_accent, "Spine2")
    for sx in (1, -1):
        add(C.make_cylinder(f"Nozzle{sx}", (0.08 * sx, back_y + 0.06, 0.96), 0.034, 0.07, 12), m_metal, "Spine2")

    # chest control panel
    front = C.surface_hit(suit, (0, -1, 1.21), (0, 1, 0))
    fy = front.y if front else -0.14
    add(C.make_rounded_box("ChestPanel", (0, fy - 0.010, 1.21), (0.17, 0.040, 0.115), 0.010), m_trim, "Spine2")
    add(C.make_rounded_box("Screen", (0, fy - 0.0305, 1.235), (0.11, 0.004, 0.040), 0.003), m_screen, "Spine2")
    for i, lm in enumerate(lights):
        add(C.make_sphere(f"Led{i}", (-0.045 + 0.045 * i, fy - 0.0305, 1.178), (0.0125, 0.007, 0.0125), 16, 8), lm, "Spine2")

    for side, sx in (("Left", 1), ("Right", -1)):
        # gloves (mitten + thumb) and wrist cuff
        add(C.make_sphere(f"Glove{side}", (0.715 * sx, 0, 1.34), (0.082, 0.054, 0.042), 20, 10), m_glove, f"{side}Hand")
        add(C.make_sphere(f"Thumb{side}", (0.69 * sx, -0.058, 1.335), (0.033, 0.026, 0.024), 12, 8), m_glove, f"{side}Hand")
        c, r = ring_fit(suit, "x", 0.62 * sx)
        add(C.make_torus(f"Cuff{side}", (0.64 * sx, c.y, c.z), max(r.y, r.z) + 0.006, 0.016, rot=(0, math.pi / 2, 0)),
            m_metal, f"{side}ForeArm")
        # biceps accent stripe
        c, r = ring_fit(suit, "x", 0.27 * sx)
        add(C.make_torus(f"ArmStripe{side}", (0.27 * sx, c.y, c.z), max(r.y, r.z) + 0.002, 0.011, rot=(0, math.pi / 2, 0)),
            m_accent, f"{side}Arm")
        # thigh accent stripe
        lx = C.LEG_X * sx
        c, r = ring_fit(suit, "z", 0.70, sx)
        add(C.make_torus(f"LegStripe{side}", (c.x, c.y, 0.70), max(r.x, r.y) + 0.002, 0.011, scale_xy=(1, 1)),
            m_accent, f"{side}UpLeg")
        # boots: ankle shaft + toe cap + sole + top ring
        add(C.make_sphere(f"BootShaft{side}", (lx, 0.0, 0.115), (0.072, 0.074, 0.085), 20, 10), m_glove, f"{side}Foot")
        add(C.make_sphere(f"BootToe{side}", (lx, -0.062, 0.058), (0.072, 0.155, 0.056), 22, 12), m_glove, f"{side}Foot")
        add(C.make_sphere(f"Sole{side}", (lx, -0.062, 0.02), (0.076, 0.165, 0.022), 22, 8), m_sole, f"{side}Foot")
        c, r = ring_fit(suit, "z", 0.17, sx)
        add(C.make_torus(f"BootRing{side}", (c.x, c.y, 0.178), max(r.x, r.y) + 0.004, 0.014), m_metal, f"{side}Leg")

    # waist belt (accent) + buckle
    c, r = ring_fit(suit, "z", 1.02)
    add(C.make_torus("Belt", (c.x, c.y, 1.02), r.x + 0.002, 0.013, scale_xy=(1.0, r.y / r.x)), m_accent, "Spine")
    add(C.make_rounded_box("Buckle", (0, c.y - r.y - 0.002, 1.02), (0.05, 0.016, 0.034), 0.005), m_metal, "Spine")

    # -------- rig + skin
    arm = C.build_armature("AstroRig")
    for obj, bone in parts:
        C.bind_rigid(obj, arm, bone)
    gear = C.join_objects([o for o, _ in parts], "AstroGear")
    C.finish_rigid_binding(gear, arm)
    suit.name = "AstroSuit"
    C.bind_auto(suit, arm)
    C.make_idle(arm)

    C.select_only(arm)
    C.save_blend(C.p("blender", "characters", "astro.blend"))
    C.export_glb(C.p("blender", "export", "astro_raw.glb"))
    print("DONE astro tris", C.count_tris([suit, gear]), "suit", C.count_tris([suit]), "gear", C.count_tris([gear]))


main()
