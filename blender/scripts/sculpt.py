"""High-poly sculpt + bake helpers for the v2 characters (Clay, Astro).

Workflow: low poly (decimated, Smart UV) <- selected-to-active bakes <- high poly (subdivided copy of the
full-resolution surface + numpy displacement). Colour and roughness are stored as point attributes on
the high poly and baked through an Emission shader, so the shipped material is Principled + image
textures only.
"""
import bpy
import numpy as np
from mathutils import kdtree

import common as C


def make_low(src, name, target_tris, uv_margin=0.004):
    low = C.duplicate(src, name)
    tris = C.count_tris([low])
    if tris > target_tris:
        mod = low.modifiers.new("dec", "DECIMATE")
        mod.ratio = target_tris / tris
        mod.use_collapse_triangulate = True
        # the armature modifier must not be applied: move the decimate to the top of the stack
        C.select_only(low)
        while low.modifiers[0] != mod:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    C.smart_uv(low, margin=uv_margin)
    C.shade_smooth(low)
    return low


def make_high(src, name, levels=2):
    hi = C.duplicate(src, name)
    for m in list(hi.modifiers):
        hi.modifiers.remove(m)
    hi.vertex_groups.clear()
    hi.parent = None
    mod = hi.modifiers.new("sub", "SUBSURF")
    mod.levels = mod.render_levels = levels
    C.apply_modifier(hi, mod)
    C.shade_smooth(hi)
    return hi


def displace(hi, h):
    me = hi.data
    co = C.get_co(me)
    n = C.get_normals(me)
    C.set_co(me, co + n * h[:, None])


def concavity(hi, iterations=2):
    """Positive in creases, negative on ridges (Laplacian along the normal, smoothed)."""
    me = hi.data
    co = C.get_co(me)
    n = C.get_normals(me)
    edges = C.get_edges(me)
    deg = np.bincount(edges.ravel(), minlength=len(co)).astype(float)
    lap = C.neighbour_mean(co, edges, deg) - co
    c = np.sum(lap * n, axis=1)
    c = C.smooth_scalar(c, edges, iterations)
    k = np.percentile(np.abs(c), 98) + 1e-12
    return np.clip(c / k, -1, 1)


def presses(hi, count, r_range, d_range, seed=3, mask=None):
    """Random rounded dents (thumb presses) on the surface; returns a height array."""
    me = hi.data
    co = C.get_co(me)
    rng = np.random.default_rng(seed)
    kd = kdtree.KDTree(len(co))
    for i, p in enumerate(co):
        kd.insert(p, i)
    kd.balance()
    h = np.zeros(len(co))
    prob = None
    if mask is not None:
        prob = np.clip(mask, 0, None) + 1e-6
        prob /= prob.sum()
    centres = rng.choice(len(co), size=count, p=prob)
    for c in centres:
        r = rng.uniform(*r_range)
        d = rng.uniform(*d_range)
        for (_p, idx, dist) in kd.find_range(co[c], r):
            t = 1 - (dist / r) ** 2
            h[idx] = min(h[idx], -d * t * t)
    return h


def point_color(hi, name, rgb):
    me = hi.data
    attr = me.color_attributes.get(name) or me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
    rgba = np.ones((len(me.vertices), 4), dtype=np.float32)
    rgba[:, :3] = np.clip(rgb, 0, 1)
    attr.data.foreach_set("color", rgba.ravel())


def emit_material(name, attr):
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
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = attr
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(a.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def bake_set(low, hi, tag, size, ao_distance=0.08, extrusion=0.008, max_ray=0.025, ao_strength=0.75,
             with_color=True, with_rough=True, rough_const=0.8):
    """Normal + base colour + roughness (from hi point attributes) + AO -> images; returns dict."""
    imgs = {}
    low.data.materials.clear()
    low.data.materials.append(C.new_material(tag + "_bake"))
    hi.data.materials.clear()
    hi.data.materials.append(C.new_material(tag + "_hi"))
    imgs["normal"] = C.new_image(tag + "_normal", size, (0.5, 0.5, 1, 1), non_color=True)
    C.bake(low, "NORMAL", imgs["normal"], sources=[hi], extrusion=extrusion, max_ray=max_ray, samples=1, margin=12)
    if with_color:
        hi.data.materials[0] = emit_material(tag + "_emit_col", "col")
        imgs["base"] = C.new_image(tag + "_base", size, (0.5, 0.5, 0.5, 1))
        C.bake(low, "EMIT", imgs["base"], sources=[hi], extrusion=extrusion, max_ray=max_ray, samples=1, margin=12)
    rough = None
    if with_rough:
        hi.data.materials[0] = emit_material(tag + "_emit_rough", "rough")
        rough = C.new_image(tag + "_rough", size, (0.8, 0.8, 0.8, 1), non_color=True)
        C.bake(low, "EMIT", rough, sources=[hi], extrusion=extrusion, max_ray=max_ray, samples=1, margin=12)
    hi.hide_render = True
    ao = C.new_image(tag + "_ao", size, (1, 1, 1, 1), non_color=True)
    sc = bpy.context.scene
    sc.world = sc.world or bpy.data.worlds.new("World")
    sc.world.light_settings.distance = ao_distance
    C.bake(low, "AO", ao, samples=64, margin=12)
    px = C.img_pixels(ao).copy()
    px[..., :3] = 1 - ao_strength * (1 - px[..., :3])
    ao.pixels.foreach_set(px.ravel())
    imgs["orm"] = C.pack_orm(tag + "_orm", size, ao_img=ao, rough_img=rough, rough_const=rough_const)
    bpy.data.images.remove(ao)
    if rough is not None:
        bpy.data.images.remove(rough)
    return imgs
