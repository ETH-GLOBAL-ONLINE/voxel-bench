"""Turn a recipe into native Roblox parts.

Recipes are composed of primitives, and Roblox has primitives of its own, so
for the Roblox target we can skip meshes entirely and emit parts directly.

That avoids both problems the FBX route has:

  * **Scale.** FBX stores centimetres. Blender exports assuming one unit is a
    metre, Roblox reads the numbers as studs, and the model arrives exactly 100
    times too large. Writing parts means writing studs, with nothing in between
    to convert.
  * **Colour.** Roblox imports textures, not material base colours, so an FBX
    with flat-coloured materials and no image map arrives grey. A part carries
    a Color3 and needs no texture at all.

It is also lighter: no mesh upload, no moderation wait, and the result is
editable in Studio, which is what a Roblox developer expects.

Blender still crafts the preview render and the GLB for the web viewer and
other engines. This is the Roblox-shaped output, not a replacement.

    python bench/to_rbxmx.py bench/recipes/market_stall.json out
"""
import json
import math
import os
import sys

# PartType enum
BALL, BLOCK, CYLINDER = 0, 1, 2

SHAPES = {
    "cube": BLOCK,
    "plane": BLOCK,
    "sphere": BALL,
    "cylinder": CYLINDER,
    # Roblox has no cone. A cylinder is the closest primitive; anything that
    # really needs a cone wants the mesh route instead.
    "cone": CYLINDER,
}

PLANE_THICKNESS = 0.05


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def euler_xyz(rx, ry, rz):
    """Blender's default euler order applies X, then Y, then Z."""
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    return mat_mul(Rz, mat_mul(Ry, Rx))


# Blender is Z-up, Roblox is Y-up: (x, y, z) -> (x, z, -y).
TO_ROBLOX = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]

# A Roblox cylinder's length runs along its local X. Blender's runs along Z,
# which becomes Y here, so the part needs a quarter turn to line up.
X_TO_Y = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]


def to_roblox_rotation(rot_degrees):
    r = euler_xyz(*[math.radians(a) for a in rot_degrees])
    ct = [[TO_ROBLOX[j][i] for j in range(3)] for i in range(3)]
    return mat_mul(TO_ROBLOX, mat_mul(r, ct))


def to_roblox_vec(v):
    return [sum(TO_ROBLOX[i][j] * v[j] for j in range(3)) for i in range(3)]


def srgb(c):
    """Recipe colours are linear, the way Blender reads them. Roblox wants
    sRGB, so convert — otherwise every colour lands darker than the preview
    render the user just approved."""
    c = max(0.0, min(1.0, c))
    v = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return int(round(v * 255))


def color3uint8(rgb):
    r, g, b = (srgb(c) for c in rgb[:3])
    return (255 << 24) | (r << 16) | (g << 8) | b


def part_size(shape, scale):
    """scale is the ingredient's size along Blender's axes."""
    sx, sy, sz = scale
    if shape == "plane":
        return to_roblox_vec([sx, sy, PLANE_THICKNESS])
    if shape in ("cylinder", "cone"):
        # length along local X, diameter on the other two
        diameter = (abs(sx) + abs(sy)) / 2
        return [abs(sz), diameter, diameter]
    return [abs(v) for v in to_roblox_vec([sx, sy, sz])]


def xml_escape(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def part_xml(idx, ing, referent):
    shape = ing.get("shape", "cube")
    if shape not in SHAPES:
        raise ValueError("unknown shape %r (allowed: %s)" % (shape, ", ".join(SHAPES)))

    pos = to_roblox_vec(ing.get("loc", [0, 0, 0]))
    rot = to_roblox_rotation(ing.get("rot", [0, 0, 0]))
    if shape in ("cylinder", "cone"):
        rot = mat_mul(rot, X_TO_Y)
    size = part_size(shape, ing.get("scale", [1, 1, 1]))

    r = [f"<R{i}{j}>{rot[i][j]:.6f}</R{i}{j}>" for i in range(3) for j in range(3)]

    return f"""		<Item class="Part" referent="{referent}">
			<Properties>
				<bool name="Anchored">true</bool>
				<Color3uint8 name="Color3uint8">{color3uint8(ing.get("color", [0.6, 0.6, 0.6]))}</Color3uint8>
				<CoordinateFrame name="CFrame">
					<X>{pos[0]:.4f}</X><Y>{pos[1]:.4f}</Y><Z>{pos[2]:.4f}</Z>
					{"".join(r)}
				</CoordinateFrame>
				<string name="Name">{xml_escape(ing.get("name", "part_%02d" % idx))}</string>
				<token name="shape">{SHAPES[shape]}</token>
				<Vector3 name="size">
					<X>{size[0]:.4f}</X><Y>{size[1]:.4f}</Y><Z>{size[2]:.4f}</Z>
				</Vector3>
			</Properties>
		</Item>"""


def primary_index(ingredients):
    """A model without a PrimaryPart borrows a pivot orientation from its
    bounding box, so moving it tilts the whole thing by whatever angle the
    bounds happened to pick up. Anchor it to the first ingredient that is
    axis-aligned in the recipe."""
    for i, ing in enumerate(ingredients):
        if not any(ing.get("rot", [0, 0, 0])):
            return i
    return 0


def build(recipe):
    name = recipe.get("name", "recipe")
    ingredients = recipe.get("ingredients", [])
    if not ingredients:
        raise ValueError("recipe has no ingredients")

    parts = [part_xml(i, ing, "RBX%d" % (i + 1)) for i, ing in enumerate(ingredients)]
    primary = "RBX%d" % (primary_index(ingredients) + 1)
    return f"""<roblox version="4">
	<Item class="Model" referent="RBX0">
		<Properties>
			<string name="Name">{xml_escape(name)}</string>
			<Ref name="PrimaryPart">{primary}</Ref>
		</Properties>
{chr(10).join(parts)}
	</Item>
</roblox>
"""


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    recipe_path, outdir = sys.argv[1], sys.argv[2]

    with open(recipe_path, "r", encoding="utf-8") as fh:
        recipe = json.load(fh)

    if recipe.get("units") != "studs":
        print("warning: recipe does not declare studs; sizes may be wrong",
              file=sys.stderr)

    os.makedirs(outdir, exist_ok=True)
    name = recipe.get("name", "recipe")
    path = os.path.join(outdir, name + ".rbxmx")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(build(recipe))

    ingredients = recipe["ingredients"]
    approximated = [i.get("name") for i in ingredients if i.get("shape") == "cone"]
    report = {
        "name": name,
        "rbxmx": path,
        "parts": len(ingredients),
        "primary_part": ingredients[primary_index(ingredients)].get("name"),
        "bytes": os.path.getsize(path),
        "approximated_as_cylinder": approximated,
    }
    print("RBXMX_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
