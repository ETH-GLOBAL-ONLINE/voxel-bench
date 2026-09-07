"""A sentence in, a validated recipe out.

This is the half of the product that makes "describe what you need" true. The
model writes the recipe; it never touches Blender. That separation is why the
output is reproducible: the same recipe crafts the same object every time, and
when something looks wrong the recipe is a small readable file you can fix by
hand rather than a dice roll you re-roll.

    python bench/describe.py "a wooden market stall" out
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from llm import LLMError, complete  # noqa: E402
from recipe import RecipeError, summarise, validate  # noqa: E402

# Gemini enforces this server-side, so the model cannot invent a field or a
# shape. It still cannot be trusted on *values*, which is what recipe.py is for.
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "name": {"type": "STRING"},
        "ingredients": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "shape": {"type": "STRING",
                              "enum": ["cube", "cylinder", "sphere", "cone", "plane"]},
                    "loc": {"type": "ARRAY", "items": {"type": "NUMBER"}},
                    "scale": {"type": "ARRAY", "items": {"type": "NUMBER"}},
                    "rot": {"type": "ARRAY", "items": {"type": "NUMBER"}},
                    "color": {"type": "ARRAY", "items": {"type": "NUMBER"}},
                    "bevel": {"type": "NUMBER"},
                    "smooth": {"type": "BOOLEAN"},
                },
                "required": ["name", "shape", "loc", "scale", "color"],
            },
        },
    },
    "required": ["name", "ingredients"],
}

RULES = """\
You compose game props out of primitives for Roblox. Return one recipe.

UNITS. Everything is in Roblox studs. A player character is 5 studs tall, so a
chair is about 3, a market stall about 9, a lamp post about 12. Getting this
wrong is the most common failure: think about how the object compares to a
person before you write a number.

AXES. X is right, Y is depth, Z is up. The object stands on the ground, so the
lowest part of it sits at z = 0 and every loc.z is positive.

SIZES. `scale` is the full width, depth and height of the ingredient — not a
radius and not a half-extent. A cube with scale [2, 2, 2] is a 2-stud cube. A
cylinder with scale [1, 1, 4] is 1 stud across and 4 tall.

POSITION. `loc` is the centre of the ingredient. A leg 3 studs tall standing on
the ground has loc.z = 1.5, not 0.

ROTATION. `rot` is degrees around each axis, and it is optional. Use it for
tilted roofs and for crates knocked slightly askew — a few degrees of rotation
is what stops a build looking machine-made.

COLOUR. `color` is linear RGB, each channel 0 to 1. Real materials are less
saturated than you think: wood is around [0.45, 0.29, 0.15], not [1, 0.5, 0].

SHAPES. Only cube, cylinder, sphere, cone and plane. Compose them. A table is a
slab and four legs; a barrel is a cylinder with a thinner cylinder band.

HOW MANY. Between 6 and 12 ingredients. Fewer reads as unfinished; more rarely
adds anything you can see at game distance, and every extra one costs the person
waiting for it.

NUMBERS. Two decimal places at most. 1.25 is a position; 1.2473819 is noise.

CRAFT IT WELL. Give ingredients descriptive names. Vary the colour slightly
between parts that are the same material — flat identical colour is the main
thing that makes a build look generated. Add small details that sell the object:
what is sitting on the counter, what is stacked beside it.
"""

EXAMPLE = """\
Here is a good recipe, for "a wooden market stall". Note the scale: it stands
about 9 studs tall, so a player comes up to the counter.

%s
"""


def _example():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "recipes", "market_stall.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return EXAMPLE % json.dumps(json.load(fh), separators=(",", ":"))
    except OSError:
        return ""


def describe(prompt, temperature=0.4, retries=2):
    """Turn a sentence into a validated recipe.

    On a validation failure the error is handed back to the model, because it
    reads as instructions — "that is 40x a character, so the units are wrong" is
    a better correction than anything a generic retry would produce.
    """
    ask = "%s\n%s\nNow make: %s" % (RULES, _example(), prompt.strip())
    last = None

    for attempt in range(retries + 1):
        text, usage = complete(ask, schema=SCHEMA, temperature=temperature)
        try:
            raw = json.loads(text)
        except json.JSONDecodeError as exc:
            last = "the model did not return JSON: %s" % exc
        else:
            try:
                recipe, notes = validate(raw)
                return recipe, notes, usage
            except RecipeError as exc:
                last = str(exc)

        if attempt < retries:
            ask = ("%s\n%s\nNow make: %s\n\nYour last attempt was rejected: %s\n"
                   "Fix exactly that and return the whole recipe again."
                   % (RULES, _example(), prompt.strip(), last))

    raise RecipeError("gave up after %d attempts. Last problem: %s"
                      % (retries + 1, last))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    prompt = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "out"

    try:
        recipe, notes, usage = describe(prompt)
    except (LLMError, RecipeError) as exc:
        sys.exit("could not make that: %s" % exc)

    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, recipe["name"] + ".json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(recipe, fh, indent=2)

    print(summarise(recipe))
    for note in notes:
        print("  note: %s" % note)
    print("  %s, %s tokens" % (usage["model"], usage["tokens"]))
    print(path)


if __name__ == "__main__":
    main()
