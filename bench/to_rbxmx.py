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

# PartType enum, read off Studio rather than copied from a page
BALL, BLOCK, CYLINDER, WEDGE, CORNER_WEDGE = 0, 1, 2, 3, 4

SHAPES = {
    "cube": BLOCK,
    "plane": BLOCK,
    "sphere": BALL,
    "cylinder": CYLINDER,
    # A cone is four corner wedges — see cone_parts below.
    "cone": CORNER_WEDGE,
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


def yaw(degrees):
    """A turn about Roblox's up axis."""
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def rotate(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


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
        # abs matters: the axis change flips a sign, and a negative size is not
        # rejected — Roblox silently clamps it to its 0.001 minimum, so the part
        # is there, is the right colour, and is invisibly thin.
        return [abs(v) for v in to_roblox_vec([sx, sy, PLANE_THICKNESS])]
    if shape in ("cylinder", "cone"):
        # length along local X, diameter on the other two
        diameter = (abs(sx) + abs(sy)) / 2
        return [abs(sz), diameter, diameter]
    return [abs(v) for v in to_roblox_vec([sx, sy, sz])]


def xml_escape(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def upright_basis(up):
    """A rotation whose local Y is `up`, with no spin about it.

    A cone is round, so a turn about its own axis changes nothing and a recipe
    can carry one without meaning it — the pagoda's roofs all arrive with a
    harmless 45 degrees. Harmless until the cone becomes a square pyramid,
    where it turns the roof into a diamond: rotated 45 degrees, a 6-stud square
    only covers a 4.24-stud one, so a 4.3-stud body pokes its corners through.

    So the spin is dropped and an orientation is chosen here instead. World X,
    with the component along `up` taken out, is the reference; if `up` is
    itself nearly X, world Z stands in.
    """
    length = math.sqrt(sum(c * c for c in up)) or 1.0
    up = [c / length for c in up]

    reference = [0, 0, 1] if abs(up[0]) > 0.9 else [1, 0, 0]
    dot = sum(reference[i] * up[i] for i in range(3))
    right = [reference[i] - dot * up[i] for i in range(3)]
    length = math.sqrt(sum(c * c for c in right)) or 1.0
    right = [c / length for c in right]

    forward = [right[1] * up[2] - right[2] * up[1],
               right[2] * up[0] - right[0] * up[2],
               right[0] * up[1] - right[1] * up[0]]

    # Columns are the local axes in world space, which is what a CFrame wants.
    return [[right[i], up[i], forward[i]] for i in range(3)]


def cone_parts(name, pos, rot, scale):
    """A cone, as four corner wedges meeting at a centred apex.

    Roblox has no cone. It was a cylinder here for a while, which is the wrong
    silhouette for the two things recipes actually use cones for — spikes and
    tiered roofs — and both arrived as posts and discs.

    `SpecialMesh` looks like the answer and is not: `Enum.MeshType.Pyramid`
    accepts the assignment and then draws nothing at all, as do `Prism`,
    `ParallelRamp` and `RightAngleRamp`. Verified in Studio one by one, because
    the enum lists them and the renderer ignores them.

    A `CornerWedge` is a quarter of a pyramid, and four of them turned about the
    up axis close into a square-based one. Four parts instead of one, native, no
    mesh and no upload.
    """
    # The axis is Blender's local Z, which the frame change puts on local Y.
    rot = upright_basis([rot[i][1] for i in range(3)])

    length = abs(scale[2])
    diameter = (abs(scale[0]) + abs(scale[1])) / 2
    size = [diameter / 2, length, diameter / 2]
    quarter = [-diameter / 4, 0, diameter / 4]

    parts = []
    for i, angle in enumerate((0, 90, 180, 270)):
        turned = mat_mul(rot, yaw(angle))
        offset = rotate(turned, quarter)
        parts.append({
            "name": "%s_%d" % (name, i + 1),
            "shape": CORNER_WEDGE,
            "size": size,
            "pos": [pos[j] + offset[j] for j in range(3)],
            "rot": turned,
        })
    return parts


def parts_for(idx, ing):
    """One ingredient, and the Roblox parts it becomes. Usually one."""
    shape = ing.get("shape", "cube")
    if shape not in SHAPES:
        raise ValueError("unknown shape %r (allowed: %s)" % (shape, ", ".join(SHAPES)))

    name = ing.get("name", "part_%02d" % idx)
    pos = to_roblox_vec(ing.get("loc", [0, 0, 0]))
    rot = to_roblox_rotation(ing.get("rot", [0, 0, 0]))
    scale = ing.get("scale", [1, 1, 1])
    colour = color3uint8(ing.get("color", [0.6, 0.6, 0.6]))

    if shape == "cone":
        parts = cone_parts(name, pos, rot, scale)
    else:
        if shape == "cylinder":
            rot = mat_mul(rot, X_TO_Y)
        parts = [{"name": name, "shape": SHAPES[shape],
                  "size": part_size(shape, scale), "pos": pos, "rot": rot}]

    for part in parts:
        part["color"] = colour
    return parts


def part_xml(part, referent):
    rot, pos, size = part["rot"], part["pos"], part["size"]
    r = [f"<R{i}{j}>{rot[i][j]:.6f}</R{i}{j}>" for i in range(3) for j in range(3)]

    return f"""		<Item class="Part" referent="{referent}">
			<Properties>
				<bool name="Anchored">true</bool>
				<Color3uint8 name="Color3uint8">{part["color"]}</Color3uint8>
				<CoordinateFrame name="CFrame">
					<X>{pos[0]:.4f}</X><Y>{pos[1]:.4f}</Y><Z>{pos[2]:.4f}</Z>
					{"".join(r)}
				</CoordinateFrame>
				<string name="Name">{xml_escape(part["name"])}</string>
				<token name="shape">{part["shape"]}</token>
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

    parts = []
    primary = None
    keep = primary_index(ingredients)
    for i, ing in enumerate(ingredients):
        for part in parts_for(i, ing):
            referent = "RBX%d" % (len(parts) + 1)
            if i == keep and primary is None:
                primary = referent
            parts.append(part_xml(part, referent))
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
    # A cone is four parts, so the part count is no longer the ingredient count.
    # Both are worth reporting: one is what the recipe asked for, the other is
    # what Roblox receives.
    parts = sum(len(parts_for(i, ing)) for i, ing in enumerate(ingredients))
    report = {
        "name": name,
        "rbxmx": path,
        "ingredients": len(ingredients),
        "parts": parts,
        "primary_part": ingredients[primary_index(ingredients)].get("name"),
        "bytes": os.path.getsize(path),
        "cones_as_pyramids": [i.get("name") for i in ingredients
                              if i.get("shape") == "cone"],
    }
    print("RBXMX_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
