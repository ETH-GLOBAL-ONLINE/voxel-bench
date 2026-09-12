"""Render the dock's two icons, the Marketplace and the Backpack, in Blender.

Run:  blender --background --python bench/dock_icons.py -- <outdir>

Both are built from blocks the way everything on the bench is: dark stone with
amber seams that glow, like the wall behind the page. Seen from an isometric
camera on a transparent background, so the tile's own frame and glow sit
behind them.
"""

import os
import sys

import bpy
from mathutils import Vector

STONE = (0.055, 0.048, 0.042)
STONE_LIGHT = (0.10, 0.085, 0.07)
LEATHER = (0.07, 0.048, 0.032)
LEATHER_LIGHT = (0.10, 0.068, 0.045)
AMBER = (1.0, 0.45, 0.06)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def solid(name, color, roughness=0.65):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def glow(name, strength=1.6):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*AMBER, 1)
    bsdf.inputs["Emission Color"].default_value = (*AMBER, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def box(size, loc, mat, bevel=0.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    ob.data.materials.append(mat)
    return ob


def market():
    """A stall: a stone counter with a glowing lip, crates on it, posts and a
    striped awning with a scalloped front."""
    stone, light, amber = solid("stone", STONE), solid("light", STONE_LIGHT), glow("amber")
    awning = solid("awning", AMBER, roughness=0.5)

    box((2.0, 1.1, 0.9), (0, 0, 0.45), stone)
    box((2.08, 1.18, 0.07), (0, 0, 0.93), amber, bevel=0.01)
    box((0.36, 0.36, 0.36), (-0.5, -0.05, 1.15), awning)
    box((0.3, 0.3, 0.3), (0.05, 0.12, 1.12), light)
    box((0.22, 0.22, 0.22), (0.5, -0.15, 1.08), amber, bevel=0.02)

    for x in (-0.92, 0.92):
        for y in (-0.48, 0.48):
            box((0.12, 0.12, 1.3), (x, y, 1.6), light, bevel=0.02)

    stripes = 5
    width = 2.2 / stripes
    for i in range(stripes):
        x = -1.1 + width * (i + 0.5)
        mat = awning if i % 2 == 0 else stone
        box((width, 1.42, 0.14), (x, 0, 2.3), mat, bevel=0.015)
        box((width, 0.1, 0.22), (x, -0.71, 2.14), mat, bevel=0.015)


def backpack():
    """A backpack: a leather body, a flap with a glowing seam and a buckle, a
    front pocket, side straps and a handle."""
    leather, light = solid("leather", LEATHER), solid("leather_light", LEATHER_LIGHT)
    stone, amber = solid("stone", STONE), glow("amber")

    box((1.4, 0.9, 1.7), (0, 0, 0.85), leather, bevel=0.08)
    box((1.48, 0.98, 0.42), (0, -0.02, 1.6), light, bevel=0.06)
    box((1.3, 0.05, 0.05), (0, -0.52, 1.42), amber, bevel=0.01)

    box((1.0, 0.34, 0.72), (0, -0.6, 0.56), light, bevel=0.05)
    box((0.9, 0.05, 0.05), (0, -0.78, 0.86), amber, bevel=0.01)

    box((0.2, 0.07, 0.55), (0, -0.53, 1.28), stone, bevel=0.01)
    box((0.26, 0.08, 0.16), (0, -0.57, 1.08), amber, bevel=0.015)

    for x in (-0.74, 0.74):
        box((0.1, 0.14, 1.55), (x, 0.22, 0.9), stone, bevel=0.02)

    for x in (-0.3, 0.3):
        box((0.1, 0.1, 0.3), (x, 0.1, 1.95), stone, bevel=0.02)
    box((0.7, 0.1, 0.1), (0, 0.1, 2.1), stone, bevel=0.02)


def stage(path, size=512):
    scene = bpy.context.scene
    objects = [ob for ob in scene.objects if ob.type == "MESH"]
    corners = [ob.matrix_world @ Vector(c) for ob in objects for c in ob.bound_box]
    center = sum(corners, Vector()) / len(corners)
    radius = max((c - center).length for c in corners)

    # Isometric: the camera looks down the cube's diagonal.
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = radius * 2.1
    direction = Vector((1.0, -1.0, 0.82)).normalized()
    cam.location = center + direction * radius * 6
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    def light(kind, at, energy, color=(1, 1, 1), size_=2.0):
        bpy.ops.object.light_add(type=kind, location=center + Vector(at) * radius)
        lamp = bpy.context.active_object
        lamp.data.energy = energy
        lamp.data.color = color
        if kind == "AREA":
            lamp.data.size = size_ * radius
        lamp.rotation_euler = (center - lamp.location).to_track_quat("-Z", "Y").to_euler()

    # A soft key from the front left, and a warm rim from behind that outlines
    # the blocks against the dark tile.
    light("AREA", (-1.6, -2.4, 2.6), 150 * radius * radius)
    light("AREA", (2.2, 2.6, 1.4), 420 * radius * radius, color=(1.0, 0.62, 0.25))

    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 64
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.06, 0.05, 0.045, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    # Blender resolves a relative path against its own base; see craft.py.
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    outdir = args[0] if args else "out/icons"
    os.makedirs(outdir, exist_ok=True)
    for name, build in (("market", market), ("backpack", backpack)):
        reset()
        build()
        stage(os.path.join(outdir, f"{name}.png"))


main()
