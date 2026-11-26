"""Shared helpers for the v2 portfolio characters (run inside Blender 5.2, headless).

Run WITHOUT --factory-startup (that flag disables user extensions, and the base body comes
from the MPFB extension):
  blender.exe --background --python blender/scripts/make_clay.py
"""
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
ROOT = os.path.dirname(BLENDER_DIR)
PREFIX = "mixamorig:"
_T0 = time.time()


def p(*parts):
    """Absolute path inside the project; creates parent folders."""
    full = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    return full


def script_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def log(*a):
    print(f"[{time.time() - _T0:7.1f}s]", *a, flush=True)


# --------------------------------------------------------------------------
# Scene
# --------------------------------------------------------------------------
def reset_scene():
    """Empty the file WITHOUT read_factory_settings (that would disable the MPFB extension)."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                 bpy.data.images, bpy.data.actions, bpy.data.lights, bpy.data.cameras,
                 bpy.data.textures, bpy.data.node_groups, bpy.data.curves):
        for item in list(coll):
            coll.remove(item)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.render.fps = 24
    sc.frame_set(0)
    return sc


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def select_only(obj):
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj, mod):
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def shade_smooth(obj):
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))


def count_tris(objs):
    return sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in objs if o.type == "MESH")


def duplicate(obj, name):
    new = obj.copy()
    new.data = obj.data.copy()
    new.name = new.data.name = name
    new.animation_data_clear()
    link(new)
    return new


def join_objects(objs, name):
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = name
    return obj


def apply_transform(obj):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


# --------------------------------------------------------------------------
# numpy mesh access + smoothing
# --------------------------------------------------------------------------
def get_co(me):
    a = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def set_co(me, co):
    me.vertices.foreach_set("co", np.asarray(co, dtype=np.float64).ravel())
    me.update()


def get_normals(me):
    a = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("normal", a)
    return a.reshape(-1, 3)


def get_edges(me):
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    return e.reshape(-1, 2)


def group_weights(obj, name):
    """Per-vertex weight array of a vertex group (0 where absent)."""
    n = len(obj.data.vertices)
    w = np.zeros(n)
    vg = obj.vertex_groups.get(name)
    if vg is None:
        return w
    gi = vg.index
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == gi:
                w[v.index] = g.weight
                break
    return w


def all_group_weights(obj):
    """dict name -> weight array, one pass over the mesh."""
    n = len(obj.data.vertices)
    names = {vg.index: vg.name for vg in obj.vertex_groups}
    out = {nm: np.zeros(n) for nm in names.values()}
    for v in obj.data.vertices:
        for g in v.groups:
            out[names[g.group]][v.index] = g.weight
    return out


def neighbour_mean(co, edges, deg):
    s = np.zeros_like(co)
    for k in range(co.shape[1]):
        s[:, k] = (np.bincount(edges[:, 0], weights=co[edges[:, 1], k], minlength=len(co)) +
                   np.bincount(edges[:, 1], weights=co[edges[:, 0], k], minlength=len(co)))
    return s / np.maximum(deg, 1)[:, None]


def smooth_weighted(co, edges, w, iterations=10, lam=0.6, mu=-0.62, taubin=True):
    """Taubin (volume-keeping) or plain Laplacian smoothing, scaled per vertex by w in [0,1]."""
    co = co.copy()
    deg = np.bincount(edges.ravel(), minlength=len(co)).astype(np.float64)
    w = np.clip(w, 0, 1)[:, None]
    for _ in range(iterations):
        co += lam * w * (neighbour_mean(co, edges, deg) - co)
        if taubin:
            co += mu * w * (neighbour_mean(co, edges, deg) - co)
    return co


def smooth_scalar(vals, edges, iterations=4):
    deg = np.bincount(edges.ravel(), minlength=len(vals)).astype(np.float64)
    v = vals.astype(np.float64).copy()[:, None]
    for _ in range(iterations):
        v = 0.5 * v + 0.5 * neighbour_mean(v, edges, deg)
    return v[:, 0]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def radial_mask(co, center, r_full, r_zero):
    d = np.linalg.norm(co - np.asarray(center), axis=1)
    return 1.0 - smoothstep(r_full, r_zero, d)


# --------------------------------------------------------------------------
# Rig helpers (pose in world space; rest pose change)
# --------------------------------------------------------------------------
def pbone(arm, short):
    for nm in (PREFIX + short, "mixamorig" + short, short):
        if nm in arm.pose.bones:
            return arm.pose.bones[nm]
    raise KeyError(short)


def rotate_bone_world(arm, short, axis, degrees):
    """Rotate a pose bone about its own head around a WORLD axis ('X','Y','Z' or a Vector)."""
    pb = pbone(arm, short)
    bpy.context.view_layer.update()
    mw = arm.matrix_world
    m = mw @ pb.matrix
    rot = Matrix.Rotation(math.radians(degrees), 4, axis)
    new = Matrix.Translation(m.translation) @ rot @ Matrix.Translation(-m.translation) @ m
    pb.matrix = mw.inverted() @ new
    bpy.context.view_layer.update()


def align_bone_world(arm, short, target_dir):
    """Rotate a pose bone (about its head) so its head->tail points along target_dir (world)."""
    pb = pbone(arm, short)
    bpy.context.view_layer.update()
    mw = arm.matrix_world
    head = mw @ pb.head
    tail = mw @ pb.tail
    q = (tail - head).normalized().rotation_difference(Vector(target_dir).normalized())
    rot = q.to_matrix().to_4x4()
    m = mw @ pb.matrix
    new = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ m
    pb.matrix = mw.inverted() @ new
    bpy.context.view_layer.update()


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def apply_pose_as_rest(arm, meshes):
    """Bake the current pose into the meshes and make it the armature's rest pose."""
    for me in meshes:
        mod = next(m for m in me.modifiers if m.type == "ARMATURE")
        # the armature modifier must be first in the stack to apply cleanly
        select_only(me)
        while me.modifiers[0] != mod:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    select_only(arm)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for me in meshes:
        ensure_armature_modifier(me, arm)


def ensure_armature_modifier(mesh, arm):
    mod = next((m for m in mesh.modifiers if m.type == "ARMATURE"), None)
    if mod is None:
        mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    if mesh.parent != arm:
        mw = mesh.matrix_world.copy()
        mesh.parent = arm
        mesh.matrix_world = mw
    return mod


def limit_weights(obj, limit=4):
    select_only(obj)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=limit)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="BONE_DEFORM", lock_active=False)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.002)


def bind_rigid(mesh_obj, bone_short, indices=None):
    """Assign vertices 100% to one bone (for rigid gear)."""
    nm = PREFIX + bone_short
    vg = mesh_obj.vertex_groups.get(nm) or mesh_obj.vertex_groups.new(name=nm)
    idx = indices if indices is not None else range(len(mesh_obj.data.vertices))
    vg.add(list(idx), 1.0, "REPLACE")


def local_quat_world_axis(arm, short, axis, degrees):
    """Local-space quaternion equivalent to a world-axis rotation of the bone at REST."""
    b = pbone(arm, short).bone
    m3 = (arm.matrix_world.to_3x3() @ b.matrix_local.to_3x3())
    rw = Matrix.Rotation(math.radians(degrees), 3, axis)
    return (m3.inverted() @ rw @ m3).to_quaternion()


def make_idle(arm, action_name="Idle", fps=24, seconds=2.0):
    """2 s seamless breathing loop: spine/head/shoulders + a tiny hip bob."""
    sc = bpy.context.scene
    sc.render.fps = fps
    arm.animation_data_create()
    select_only(arm)
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    n = int(fps * seconds)
    keys = [0, n // 4, n // 2, 3 * n // 4, n]
    phase = [0.0, 1.0, 0.0, -0.4, 0.0]
    chain = {
        "Spine1": ("X", -1.2), "Spine2": ("X", -1.6), "Neck": ("X", 0.6), "Head": ("X", 1.0),
        "LeftShoulder": ("Y", 1.4), "RightShoulder": ("Y", -1.4),
        "LeftArm": ("Y", 0.8), "RightArm": ("Y", -0.8),
    }
    hips = pbone(arm, "Hips")
    hb = hips.bone
    up_local = (hb.matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))).normalized()
    for f, ph in zip(keys, phase):
        for b, (axis, deg) in chain.items():
            pb = pbone(arm, b)
            pb.rotation_quaternion = local_quat_world_axis(arm, b, axis, deg * ph)
            pb.keyframe_insert("rotation_quaternion", frame=f)
        hips.location = up_local * (0.004 * ph)
        hips.keyframe_insert("location", frame=f)
    sc.frame_start, sc.frame_end = 0, n
    act = arm.animation_data.action
    act.name = action_name
    act.use_fake_user = True
    bpy.ops.object.mode_set(mode="OBJECT")
    reset_pose(arm)
    sc.frame_set(0)
    return act


# --------------------------------------------------------------------------
# Materials, UVs and baking
# --------------------------------------------------------------------------
def new_material(name, base=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, emit=None, emit_strength=0.0,
                 coat=0.0, coat_rough=0.1, sheen=0.0):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return mat


def gpu_cycles(samples=16):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    ok = False
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                ok = True
                break
        except Exception:
            continue
    sc.cycles.device = "GPU" if ok else "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    log("cycles device:", sc.cycles.device, prefs.compute_device_type if ok else "")
    return sc.cycles.device


def new_image(name, size, color=(0.5, 0.5, 0.5, 1.0), non_color=False, float_buffer=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buffer)
    img.generated_color = color
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def smart_uv(obj, margin=0.006, angle=66):
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(target, bake_type, image, sources=None, margin=16, extrusion=0.015, max_ray=0.06,
         samples=None, pass_filter=None, normal_space="TANGENT"):
    """Bake into `image` on target's active UVs. With `sources`, bake selected-to-active
    (high-poly -> low-poly) using a cage extrusion."""
    sc = bpy.context.scene
    if samples:
        sc.cycles.samples = samples
    added = []
    for mat in target.data.materials:
        nt = mat.node_tree
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = image
        node.name = "__bake__"
        for n in nt.nodes:
            n.select = False
        node.select = True
        nt.nodes.active = node
        added.append((nt, node))
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    if sources:
        for s in sources:
            s.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bk = sc.render.bake
    bk.use_selected_to_active = bool(sources)
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = max_ray
    bk.margin = margin
    bk.margin_type = "EXTEND"
    bk.use_clear = True
    bk.normal_space = normal_space
    kw = {"type": bake_type}
    if bake_type in ("DIFFUSE", "GLOSSY", "TRANSMISSION"):
        bk.use_pass_direct = False
        bk.use_pass_indirect = False
        bk.use_pass_color = True
    t = time.time()
    bpy.ops.object.bake(**kw)
    log(f"baked {bake_type} -> {image.name} ({time.time() - t:.1f}s)")
    for nt, node in added:
        nt.nodes.remove(node)


def img_pixels(img):
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def pack_orm(name, size, ao_img=None, rough_img=None, metal_img=None, rough_const=0.6, metal_const=0.0):
    """glTF ORM: R = occlusion, G = roughness, B = metallic."""
    out = np.ones((size, size, 4), dtype=np.float32)
    out[..., 0] = img_pixels(ao_img)[..., 0] if ao_img else 1.0
    out[..., 1] = img_pixels(rough_img)[..., 0] if rough_img else rough_const
    out[..., 2] = img_pixels(metal_img)[..., 0] if metal_img else metal_const
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(out.ravel())
    return img


def save_image(img, filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    img.filepath_raw = filepath
    img.file_format = "PNG"
    img.save()
    img.filepath = filepath


def _gltf_output_group():
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng is None:
        ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        ng.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def final_pbr_material(name, base_img, orm_img, normal_img, normal_strength=1.0, use_ao=True,
                       metal_from_map=True, emissive_img=None, emissive_strength=1.0, sheen=0.0):
    """Principled + Image Textures only (exports cleanly to glTF incl. the AO channel)."""
    mat = bpy.data.materials.new(name)
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
    if metal_from_map:
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = 0.0
    if use_ao:
        grp = nt.nodes.new("ShaderNodeGroup")
        grp.node_tree = _gltf_output_group()
        nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = normal_img
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emissive_img is not None:
        te = nt.nodes.new("ShaderNodeTexImage")
        te.image = emissive_img
        nt.links.new(te.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.5
    return mat


# --------------------------------------------------------------------------
# Export / save
# --------------------------------------------------------------------------
def export_glb(filepath, objects=None):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    if objects is not None:
        for o in bpy.context.view_layer.objects:
            o.select_set(o in objects)
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format="GLB", use_selection=objects is not None,
        export_apply=True, export_yup=True, export_animations=True, export_skins=True,
        export_materials="EXPORT", export_image_format="AUTO", export_texcoords=True,
        export_normals=True, export_tangents=False, export_def_bones=True,
        export_animation_mode="ACTIONS",
    )
    log("exported", filepath, f"{os.path.getsize(filepath) / 1e6:.2f} MB")


def save_blend(filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=filepath, compress=True)
    b1 = filepath + "1"
    if os.path.exists(b1):
        os.remove(b1)
