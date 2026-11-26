"""Shared helpers for the portfolio characters (run inside Blender, headless).

Everything here is plain bpy/bmesh so it works with:
  blender.exe --background --factory-startup --python make_clay.py
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(os.path.dirname(HERE))  # v1 scripts live in blender/scripts/v1
ROOT = os.path.dirname(BLENDER_DIR)


def p(*parts):
    """Absolute path inside the project; creates parent folders."""
    full = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    return full


def script_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


# --------------------------------------------------------------------------
# Scene
# --------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    return sc


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# --------------------------------------------------------------------------
# Materials (glTF friendly: Principled BSDF only)
# --------------------------------------------------------------------------
def new_material(name, base=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, emit=None,
                 emit_strength=0.0, sheen=0.0, coat=0.0, coat_rough=0.1):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True  # deprecated no-op in 5.x, harmless
    except Exception:
        pass
    mat.use_backface_culling = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.5
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return mat


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def shade_smooth(obj, angle=None):
    select_only(obj)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True


# --------------------------------------------------------------------------
# Metaball body helper: union of blobs -> one connected surface
# --------------------------------------------------------------------------
BALL_K = 1 / 0.68  # radius multiplier so the metaball surface lands near the asked radius


class Blobs:
    def __init__(self, name, resolution=0.02, threshold=0.6):
        self.name = name
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = resolution
        self.mb.render_resolution = resolution
        self.mb.threshold = threshold
        self.obj = bpy.data.objects.new(name, self.mb)
        link(self.obj)

    def ball(self, co, r, scale=(1, 1, 1), stiff=2.0):
        """Ellipsoid blob; r is the approximate visible radius, scale is per axis."""
        e = self.mb.elements.new(type="ELLIPSOID")
        e.co = Vector(co)
        e.radius = r * BALL_K
        e.size_x, e.size_y, e.size_z = scale
        e.stiffness = stiff
        return e

    def chain(self, a, b, r0, r1, scale=(1, 1, 1), step=0.4):
        a, b = Vector(a), Vector(b)
        length = (b - a).length
        n = max(2, int(math.ceil(length / (step * 0.5 * (r0 + r1)))))
        for i in range(n + 1):
            t = i / n
            self.ball(a.lerp(b, t), r0 + (r1 - r0) * t, scale)

    def to_mesh(self, name):
        select_only(self.obj)
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.view_layer.objects.active
        obj.name = name
        obj.data.name = name
        return obj


def decimate_to(obj, target_tris):
    select_only(obj)
    # triangulate first so the count is honest
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    cur = len(obj.data.polygons)
    if cur > target_tris:
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.ratio = target_tris / cur
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return len(obj.data.polygons)


def smooth_mesh(obj, iterations=6, factor=0.5):
    """Light Laplacian smoothing to hide metaball/decimation stair-steps."""
    select_only(obj)
    mod = obj.modifiers.new("smooth", "SMOOTH")
    mod.factor = factor
    mod.iterations = iterations
    bpy.ops.object.modifier_apply(modifier=mod.name)


def slice_extent(obj, axis, pos, tol=0.012, side=None):
    """Bounding extents of vertices within a slab (used to fit rings to the body)."""
    ai = "xyz".index(axis)
    pts = []
    for v in obj.data.vertices:
        c = v.co
        if abs(c[ai] - pos) <= tol:
            if side is not None and (c.x * side) < 0.02:
                continue
            pts.append(c.copy())
    if not pts:
        return None
    mn = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts)))
    mx = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
    return mn, mx


def fit_ring(obj, axis, pos, center2d, n=32, side=None):
    """Fit an ellipse to the surface cross-section by ray casting outward from a point
    inside the body (robust on decimated meshes). axis: 'x','y' or 'z' (ring axis).
    center2d: guess of the centre in the two remaining axes (in x,y,z order).
    Returns (centre Vector, radii Vector) with radii[axis]=0."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    ai = "xyz".index(axis)
    a, b = [i for i in range(3) if i != ai]
    pts = []
    for k in range(n):
        ang = 2 * math.pi * k / n
        o = Vector((0, 0, 0))
        o[ai], o[a], o[b] = pos, center2d[0], center2d[1]
        d = Vector((0, 0, 0))
        d[a], d[b] = math.cos(ang), math.sin(ang)
        loc, _nrm, _i, _dist = tree.ray_cast(o, d)
        if loc is not None:
            pts.append(loc)
    mn = Vector((min(q[i] for q in pts) for i in range(3)))
    mx = Vector((max(q[i] for q in pts) for i in range(3)))
    c, r = (mn + mx) / 2, (mx - mn) / 2
    c[ai], r[ai] = pos, 0.0
    return c, r


def surface_hit(obj, origin, direction):
    """Ray-cast against an object's mesh; returns hit location or None."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    loc, _n, _i, _d = tree.ray_cast(Vector(origin), Vector(direction).normalized())
    bm.free()
    return loc


# --------------------------------------------------------------------------
# Primitive builders (bmesh, return objects)
# --------------------------------------------------------------------------
def _obj_from_bm(bm, name, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    link(obj)
    return obj


def make_sphere(name, loc, radii, segs=32, rings=16, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    obj = _obj_from_bm(bm, name, loc)
    obj.rotation_euler = rot
    return obj


def make_torus(name, loc, major, minor, rot=(0, 0, 0), scale_xy=(1.0, 1.0), seg_major=24, seg_minor=8):
    bm = bmesh.new()
    verts = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        cx, cy = math.cos(a), math.sin(a)
        ring = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((cx * r * scale_xy[0], cy * r * scale_xy[1], minor * math.sin(b))))
        verts.append(ring)
    for i in range(seg_major):
        for j in range(seg_minor):
            a, b = verts[i][j], verts[i][(j + 1) % seg_minor]
            c, d = verts[(i + 1) % seg_major][(j + 1) % seg_minor], verts[(i + 1) % seg_major][j]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = _obj_from_bm(bm, name, loc)
    obj.rotation_euler = rot
    return obj


def make_rounded_box(name, loc, size, bevel=0.02, segments=4, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], offset=bevel,
                    segments=segments, profile=0.7, affect="EDGES")
    obj = _obj_from_bm(bm, name, loc)
    obj.rotation_euler = rot
    return obj


def make_cylinder(name, loc, radius, depth, segs=32, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=radius, radius2=radius, depth=depth)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], offset=bevel,
                        segments=3, profile=0.7, affect="EDGES")
    obj = _obj_from_bm(bm, name, loc)
    obj.rotation_euler = rot
    return obj


def apply_transform(obj):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join_objects(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


# --------------------------------------------------------------------------
# Shared humanoid armature (Mixamo naming, REST POSE = T-pose)
# --------------------------------------------------------------------------
PREFIX = "mixamorig:"
LEG_X = 0.115


def rig_spec():
    """(name, parent, head, tail). One definition for every character -> animations are shared."""
    spec = [
        ("Hips", None, (0, 0, 0.92), (0, 0, 1.00)),
        ("Spine", "Hips", (0, 0, 1.00), (0, 0, 1.11)),
        ("Spine1", "Spine", (0, 0, 1.11), (0, 0, 1.24)),
        ("Spine2", "Spine1", (0, 0, 1.24), (0, 0, 1.37)),
        ("Neck", "Spine2", (0, 0, 1.37), (0, 0, 1.45)),
        ("Head", "Neck", (0, 0, 1.45), (0, 0, 1.71)),
    ]
    for side, sx in (("Left", 1), ("Right", -1)):
        spec += [
            (f"{side}Shoulder", "Spine2", (0.04 * sx, 0, 1.34), (0.15 * sx, 0, 1.34)),
            (f"{side}Arm", f"{side}Shoulder", (0.15 * sx, 0, 1.34), (0.39 * sx, 0, 1.34)),
            (f"{side}ForeArm", f"{side}Arm", (0.39 * sx, 0, 1.34), (0.63 * sx, 0, 1.34)),
            (f"{side}Hand", f"{side}ForeArm", (0.63 * sx, 0, 1.34), (0.75 * sx, 0, 1.34)),
            (f"{side}UpLeg", "Hips", (LEG_X * sx, 0, 0.90), (LEG_X * sx, 0, 0.49)),
            (f"{side}Leg", f"{side}UpLeg", (LEG_X * sx, 0, 0.49), (LEG_X * sx, 0, 0.09)),
            (f"{side}Foot", f"{side}Leg", (LEG_X * sx, 0, 0.09), (LEG_X * sx, -0.11, 0.035)),
            (f"{side}ToeBase", f"{side}Foot", (LEG_X * sx, -0.11, 0.035), (LEG_X * sx, -0.20, 0.035)),
        ]
    return spec


def build_armature(name="Armature"):
    arm = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, arm)
    link(obj)
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, parent, head, tail in rig_spec():
        b = arm.edit_bones.new(PREFIX + bname)
        b.head, b.tail = Vector(head), Vector(tail)
        b.roll = 0.0
        if parent:
            b.parent = arm.edit_bones[PREFIX + parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.display_type = "OCTAHEDRAL"
    return obj


def bind_auto(mesh_obj, arm_obj):
    """Armature-deform with automatic (bone-heat) weights."""
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # tidy: max 4 influences per vertex (glTF limit for JOINTS_0), normalised
    select_only(mesh_obj)
    try:
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    except Exception as ex:  # pragma: no cover
        print("weight cleanup skipped:", ex)


def bind_rigid(mesh_obj, arm_obj, bone, indices=None):
    """Assign vertices 100% to one bone (used for rigid gear parts)."""
    vg = mesh_obj.vertex_groups.get(PREFIX + bone) or mesh_obj.vertex_groups.new(name=PREFIX + bone)
    idx = indices if indices is not None else [v.index for v in mesh_obj.data.vertices]
    vg.add(list(idx), 1.0, "REPLACE")


def finish_rigid_binding(mesh_obj, arm_obj):
    mesh_obj.parent = arm_obj
    mesh_obj.matrix_parent_inverse = Matrix.Identity(4)
    if not any(m.type == "ARMATURE" for m in mesh_obj.modifiers):
        mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm_obj


# --------------------------------------------------------------------------
# Posing (world-space, hierarchy aware) -- used for A-pose display & test poses
# --------------------------------------------------------------------------
def rotate_bone_world(arm_obj, bone, axis, degrees):
    """Rotate a pose bone about its own head around a WORLD axis ('X','Y','Z')."""
    pb = arm_obj.pose.bones[PREFIX + bone] if (PREFIX + bone) in arm_obj.pose.bones else arm_obj.pose.bones[bone]
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    loc = m.translation.copy()
    rot = Matrix.Rotation(math.radians(degrees), 4, axis)
    new = Matrix.Translation(loc) @ rot @ m.to_3x3().to_4x4()
    pb.matrix = new
    bpy.context.view_layer.update()


def local_quat_world_axis(arm_obj, bone, axis, degrees):
    """Local-space quaternion equivalent to a world-axis rotation of the bone at REST."""
    b = arm_obj.data.bones[PREFIX + bone]
    m3 = b.matrix_local.to_3x3()
    rw = Matrix.Rotation(math.radians(degrees), 3, axis)
    return (m3.inverted() @ rw @ m3).to_quaternion()


# --------------------------------------------------------------------------
# Baking (procedural -> 1024 textures) and glTF-compatible final materials
# --------------------------------------------------------------------------
def setup_cycles(samples=16, device="CPU"):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = device
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False


def new_image(name, size, color=(0.5, 0.5, 0.5, 1.0), non_color=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.generated_color = color
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def bake_pass(obj, mat, bake_type, image, margin=10):
    """Bake one pass of `mat` (procedural) into `image` using obj's UVs."""
    select_only(obj)
    nt = mat.node_tree
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = image
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    bk = bpy.context.scene.render.bake
    bk.use_pass_direct = False
    bk.use_pass_indirect = False
    bk.use_pass_color = True
    bk.margin = margin
    bk.use_clear = True
    bpy.ops.object.bake(type=bake_type)
    nt.nodes.remove(node)


def smart_uv(obj, margin=0.02):
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def pack_orm(rough_img, name, size):
    """glTF wants roughness in the G channel and metallic in B of one image."""
    import numpy as np
    px = np.empty(size * size * 4, dtype=np.float32)
    rough_img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    out = np.ones_like(px)
    out[:, 0] = 1.0            # occlusion (unused)
    out[:, 1] = px[:, 0]       # roughness
    out[:, 2] = 0.0            # metallic
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(out.ravel())
    return img


def save_image(img, filepath, fmt="PNG"):
    img.filepath_raw = filepath
    img.file_format = fmt
    img.save()
    img.pack()


def final_pbr_material(name, base_img, orm_img, normal_img, normal_strength=1.0, sheen=0.0, metal=0.0):
    """Principled + Image Textures only: exports cleanly to glTF."""
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tb = nt.nodes.new("ShaderNodeTexImage")
    tb.image = base_img
    nt.links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])

    to = nt.nodes.new("ShaderNodeTexImage")
    to.image = orm_img
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = normal_img
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.6
    return mat


# --------------------------------------------------------------------------
# Idle animation (2 s loop @ 24 fps) -- breathing
# --------------------------------------------------------------------------
def make_idle(arm_obj, action_name="Idle", fps=24, seconds=2.0):
    sc = bpy.context.scene
    sc.render.fps = fps
    arm_obj.animation_data_create()
    arm_obj.rotation_mode = "XYZ"
    select_only(arm_obj)
    bpy.ops.object.mode_set(mode="POSE")
    n = int(fps * seconds)
    keys = [0, n // 4, n // 2, 3 * n // 4, n]
    phase = [0.0, 1.0, 0.0, -0.4, 0.0]  # breathe in, out, tiny settle
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    chain = {
        "Spine1": ("X", -1.4),
        "Spine2": ("X", -1.8),
        "Head": ("X", 1.2),
        "LeftShoulder": ("Y", 1.2),
        "RightShoulder": ("Y", -1.2),
        "LeftArm": ("Y", 0.8),
        "RightArm": ("Y", -0.8),
    }
    for f, ph in zip(keys, phase):
        sc.frame_set(f)
        for b, (axis, deg) in chain.items():
            pb = arm_obj.pose.bones[PREFIX + b]
            pb.rotation_quaternion = local_quat_world_axis(arm_obj, b, axis, deg * ph)
            pb.keyframe_insert("rotation_quaternion", frame=f)
        hips = arm_obj.pose.bones[PREFIX + "Hips"]
        # hips location is in local bone space (Y along the bone = world Z)
        hips.location = (0, 0.004 * ph, 0)
        hips.keyframe_insert("location", frame=f)
    sc.frame_start, sc.frame_end = 0, n
    act = arm_obj.animation_data.action
    act.name = action_name
    act.use_fake_user = True
    for fc in act.fcurves if hasattr(act, "fcurves") else []:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    bpy.ops.object.mode_set(mode="OBJECT")
    sc.frame_set(0)
    return act


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def export_glb(filepath, use_selection=False):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=use_selection,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
    )


def count_tris(objs):
    total = 0
    for o in objs:
        if o.type == "MESH":
            total += sum(len(poly.vertices) - 2 for poly in o.data.polygons)
    return total


def save_blend(filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=filepath)
    b1 = filepath + "1"
    if os.path.exists(b1):
        os.remove(b1)
