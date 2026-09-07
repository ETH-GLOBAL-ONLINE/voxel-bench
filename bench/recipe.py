"""The recipe schema, and the validator that makes model output trustworthy.

A model will happily return JSON that parses cleanly and describes a chair four
hundred studs tall floating in the air. Everything downstream — Blender, the
Roblox writer, the preview — assumes the recipe is sane, so this is where that
assumption is earned rather than hoped for.

Validation is deliberately forgiving where it can be and strict where it cannot:
a missing colour gets a default, an out-of-range size is clamped and reported,
but an unknown shape is an error, because guessing what the model meant is how
you ship a crate that is secretly a sphere.
"""
import json
import math

SHAPES = ("cube", "cylinder", "sphere", "cone", "plane")

# Roblox measures in studs: one is about 0.28 m and a character is roughly 5
# tall. These bounds are what a prop a player can walk up to looks like.
MIN_DIMENSION = 0.05
MAX_DIMENSION = 60.0
# Past this, the model did not overshoot — it misunderstood the units, most
# likely thinking in centimetres or metres. Clamping would hand back a wrong
# object; an error can at least be retried with a clearer prompt.
ABSURD_DIMENSION = MAX_DIMENSION * 2
MAX_EXTENT = 120.0
MAX_INGREDIENTS = 40
MAX_ABS_POSITION = 200.0

DEFAULT_COLOR = [0.6, 0.6, 0.6]


class RecipeError(ValueError):
    """The recipe cannot be salvaged."""


def _num(value, field, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RecipeError("%s: %s must be numbers, got %r" % (name, field, value))
    if not math.isfinite(value):
        raise RecipeError("%s: %s is not finite" % (name, field))
    return float(value)


def _vec3(value, field, name, default=None):
    if value is None:
        if default is None:
            raise RecipeError("%s: missing %s" % (name, field))
        return list(default)
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise RecipeError("%s: %s must be three numbers, got %r" % (name, field, value))
    return [_num(v, field, name) for v in value]


def _color(value, name, notes):
    if value is None:
        return list(DEFAULT_COLOR)
    if not isinstance(value, (list, tuple)) or len(value) not in (3, 4):
        raise RecipeError("%s: color must be three numbers 0-1, got %r" % (name, value))
    out = []
    for c in value[:3]:
        c = _num(c, "color", name)
        if not 0.0 <= c <= 1.0:
            notes.append("%s: colour channel %.3f clamped into 0-1" % (name, c))
            c = min(1.0, max(0.0, c))
        out.append(c)
    return out


def _clamp_scale(scale, name, notes):
    out = []
    for axis, v in zip("xyz", scale):
        v = abs(v)
        if v > ABSURD_DIMENSION:
            raise RecipeError(
                "%s: %s size %.0f studs — that is %.0fx a character, so the "
                "units are wrong. Recipes are in studs: 1 stud is about 0.28 m "
                "and a player is 5 studs tall." % (name, axis, v, v / 5))
        if v < MIN_DIMENSION:
            notes.append("%s: %s size %.3f raised to the %.2f stud minimum"
                         % (name, axis, v, MIN_DIMENSION))
            v = MIN_DIMENSION
        elif v > MAX_DIMENSION:
            notes.append("%s: %s size %.1f clamped to %.0f studs"
                         % (name, axis, v, MAX_DIMENSION))
            v = MAX_DIMENSION
        out.append(v)
    return out


def validate(recipe):
    """Return (recipe, notes). Raises RecipeError on anything unsalvageable.

    The returned recipe is a repaired copy: defaults filled, sizes clamped,
    units declared. `notes` records every repair, so a caller can show the user
    what was changed rather than silently altering what they asked for.
    """
    notes = []

    if not isinstance(recipe, dict):
        raise RecipeError("a recipe must be a JSON object")

    name = recipe.get("name")
    if not isinstance(name, str) or not name.strip():
        raise RecipeError("missing a name")
    name = "".join(c if (c.isalnum() or c in "_-") else "_"
                   for c in name.strip().lower().replace(" ", "_"))[:48]
    name = name.strip("_-") or "recipe"

    ingredients = recipe.get("ingredients")
    if not isinstance(ingredients, list) or not ingredients:
        raise RecipeError("a recipe needs a non-empty ingredients list")
    if len(ingredients) > MAX_INGREDIENTS:
        notes.append("kept the first %d of %d ingredients"
                     % (MAX_INGREDIENTS, len(ingredients)))
        ingredients = ingredients[:MAX_INGREDIENTS]

    clean = []
    seen = set()
    for i, ing in enumerate(ingredients):
        if not isinstance(ing, dict):
            raise RecipeError("ingredient %d is not an object" % i)

        label = ing.get("name") or "part_%02d" % i
        label = str(label).strip().replace(" ", "_")[:32] or "part_%02d" % i
        while label in seen:
            label += "_2"
        seen.add(label)

        shape = ing.get("shape", "cube")
        if shape not in SHAPES:
            raise RecipeError("%s: unknown shape %r (allowed: %s)"
                              % (label, shape, ", ".join(SHAPES)))

        loc = _vec3(ing.get("loc"), "loc", label, default=[0, 0, 0])
        for axis, v in zip("xyz", loc):
            if abs(v) > MAX_ABS_POSITION:
                raise RecipeError("%s: %s position %.1f is off in space"
                                  % (label, axis, v))

        scale = _clamp_scale(_vec3(ing.get("scale"), "scale", label), label, notes)
        rot = _vec3(ing.get("rot"), "rot", label, default=[0, 0, 0])

        entry = {
            "name": label,
            "shape": shape,
            "loc": [round(v, 3) for v in loc],
            "scale": [round(v, 3) for v in scale],
            "color": [round(v, 4) for v in _color(ing.get("color"), label, notes)],
        }
        if any(rot):
            entry["rot"] = [round(v % 360, 2) for v in rot]
        for extra in ("bevel", "smooth"):
            if extra in ing:
                entry[extra] = ing[extra]
        clean.append(entry)

    out = {"name": name, "units": "studs", "ingredients": clean}

    size, base = extents(clean)
    for axis, v in zip("xyz", size):
        if v > MAX_EXTENT:
            raise RecipeError("the whole thing is %.0f studs across on %s; "
                              "a character is 5 tall" % (v, axis))
    if size[2] < 0.2:
        notes.append("this is nearly flat — %.2f studs tall" % size[2])
    if base < -1.0:
        notes.append("sits %.1f studs below the ground plane" % -base)

    return out, notes


def extents(ingredients):
    """Rough bounding box in studs, ignoring rotation, plus the lowest point.

    Rotation would only ever make the box bigger, so this under-reports rather
    than over-reports — which is the safe direction for a size check.
    """
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for ing in ingredients:
        for i in range(3):
            half = ing["scale"][i] / 2
            lo[i] = min(lo[i], ing["loc"][i] - half)
            hi[i] = max(hi[i], ing["loc"][i] + half)
    return [hi[i] - lo[i] for i in range(3)], lo[2]


def summarise(recipe):
    size, base = extents(recipe["ingredients"])
    return "%s — %d ingredients, %.1f x %.1f x %.1f studs (%.1fx a player)" % (
        recipe["name"], len(recipe["ingredients"]), size[0], size[1], size[2],
        size[2] / 5.0)


def load(path):
    with open(path, "r", encoding="utf-8") as fh:
        return validate(json.load(fh))


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        sys.exit("usage: python bench/recipe.py <recipe.json>")
    try:
        recipe, notes = load(sys.argv[1])
    except RecipeError as exc:
        sys.exit("invalid: %s" % exc)
    print(summarise(recipe))
    for note in notes:
        print("  note: %s" % note)
