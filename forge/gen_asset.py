"""Headless Blender asset generator.

Reads a JSON spec describing a prop as composed primitives, builds it,
and exports FBX (Roblox Open Cloud), GLB (web fallback viewer) and a
preview PNG.

Run:  blender --background --python forge/gen_asset.py -- spec.json outdir
"""
import bpy
import bmesh
import json
import math
import os
import sys


def argv_after_ddash():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


PRIMITIVES = {
    "cube": lambda: bpy.ops.mesh.primitive_cube_add(size=1),
    "cylinder": lambda: bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, vertices=12),
    "sphere": lambda: bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=12, ring_count=8),
    "cone": lambda: bpy.ops.mesh.primitive_cone_add(radius1=0.5, depth=1, vertices=12),
    "plane": lambda: bpy.ops.mesh.primitive_plane_add(size=1),
}


def material_for(name, color):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        r, g, b = color[:3]
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = color[3] if len(color) > 3 else 0.7
    return mat


def build_part(idx, part):
    shape = part.get("shape", "cube")
    if shape not in PRIMITIVES:
        raise ValueError("unknown shape %r (allowed: %s)" % (shape, ", ".join(PRIMITIVES)))
    PRIMITIVES[shape]()
    ob = bpy.context.active_object
    ob.name = part.get("name", "part_%02d" % idx)
    ob.location = part.get("loc", [0, 0, 0])
    ob.scale = part.get("scale", [1, 1, 1])
    ob.rotation_euler = [math.radians(a) for a in part.get("rot", [0, 0, 0])]

    bevel = part.get("bevel", 0.0)
    if bevel > 0:
        mod = ob.modifiers.new(name="bevel", type="BEVEL")
        mod.width = bevel
        mod.segments = part.get("bevel_segments", 2)
        mod.limit_method = "ANGLE"

    ob.data.materials.append(material_for(ob.name + "_mat", part.get("color", [0.6, 0.6, 0.6])))
    for poly in ob.data.polygons:
        poly.use_smooth = part.get("smooth", False)
    return ob


def join(objects, name):
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return merged


def frame_and_light(target):
    """Point a camera at the object's bounding sphere so any prop size fits."""
    from mathutils import Vector

    corners = [target.matrix_world @ Vector(c) for c in target.bound_box]
    center = sum(corners, Vector((0, 0, 0))) / len(corners)
    radius = max((c - center).length for c in corners) or 1.0

    key = bpy.ops.object.light_add(type="AREA", location=center + Vector((2.4, -2.6, 3.0)) * radius)
    key = bpy.context.active_object
    key.data.energy = 210.0 * radius * radius
    key.data.size = radius * 2.0
    key.rotation_euler = (Vector((0, 0, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.light_add(type="SUN", location=center + Vector((-3, 2, 2)) * radius)
    fill = bpy.context.active_object
    fill.data.energy = 1.1

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.lens = 50.0
    fov = 2.0 * math.atan(0.5 * cam.data.sensor_width / cam.data.lens)
    dist = (radius / math.sin(fov / 2.0)) * 1.15

    direction = Vector((1.0, -1.2, 0.62)).normalized()
    cam.location = center + direction * dist
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def render_preview(path, samples=32):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = samples
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.14, 0.15, 0.19, 1)
    bg.inputs[1].default_value = 1.0
    # AgX (Blender's default) desaturates flat game colors; Standard keeps them
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = argv_after_ddash()
    if len(args) < 2:
        sys.exit("usage: blender -b -P gen_asset.py -- <spec.json> <outdir>")
    spec_path, outdir = args[0], args[1]

    with open(spec_path, "r", encoding="utf-8") as fh:
        spec = json.load(fh)

    name = spec.get("name", "asset")
    os.makedirs(outdir, exist_ok=True)

    reset_scene()
    parts = [build_part(i, p) for i, p in enumerate(spec.get("parts", []))]
    if not parts:
        sys.exit("spec has no parts")
    merged = join(parts, name)
    frame_and_light(merged)

    fbx = os.path.join(outdir, name + ".fbx")
    glb = os.path.join(outdir, name + ".glb")
    png = os.path.join(outdir, name + "_preview.png")

    merged.select_set(True)
    bpy.context.view_layer.objects.active = merged
    bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True, path_mode="COPY",
                             embed_textures=True, mesh_smooth_type="FACE")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True)
    render_preview(png)

    report = {
        "name": name,
        "fbx": fbx,
        "glb": glb,
        "preview": png,
        "tris": len(merged.data.loop_triangles) or sum(len(p.vertices) - 2 for p in merged.data.polygons),
        "verts": len(merged.data.vertices),
        "parts": len(spec.get("parts", [])),
        "bytes_fbx": os.path.getsize(fbx),
        "bytes_glb": os.path.getsize(glb),
    }
    with open(os.path.join(outdir, name + ".report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print("ANVIL_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
