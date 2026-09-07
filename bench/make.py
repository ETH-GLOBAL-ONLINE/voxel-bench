"""One command: a sentence in, everything out.

    python bench/make.py "a rusty oil drum"

Runs the three stages in order — the model writes a recipe, Blender crafts it,
and the Roblox writer turns it into native parts — and prints where each piece
landed. This is also the shape the paid service takes: the same three stages,
each one behind its own x402 paywall.

Needs GEMINI_API_KEY (or GROQ_API_KEY with VOXEL_LLM_PROVIDER=groq) and Blender
on PATH or in the usual place.
"""
import glob
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from describe import describe  # noqa: E402
from llm import LLMError  # noqa: E402
from recipe import RecipeError, summarise  # noqa: E402


def find_blender():
    if os.environ.get("BLENDER"):
        return os.environ["BLENDER"]
    for pattern in (
        r"C:\Program Files\Blender Foundation\Blender */blender.exe",
        "/Applications/Blender.app/Contents/MacOS/Blender",
        "/usr/bin/blender",
        "/usr/local/bin/blender",
    ):
        found = sorted(glob.glob(pattern))
        if found:
            return found[-1]
    return "blender"


def load_env():
    """Read .env without a dependency. Anything already exported wins."""
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def stage(label, fn):
    print("  %-22s" % label, end="", flush=True)
    started = time.time()
    try:
        result = fn()
    except Exception:
        print("failed")
        raise
    print("%.1fs" % (time.time() - started))
    return result


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    prompt = sys.argv[1]
    outdir = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else
                             os.path.join(ROOT, "out"))
    os.makedirs(outdir, exist_ok=True)
    load_env()

    print('\n  "%s"\n' % prompt)

    try:
        recipe, notes, usage = stage("writing the recipe",
                                     lambda: describe(prompt))
    except (LLMError, RecipeError) as exc:
        sys.exit("\n  could not make that: %s\n" % exc)

    recipe_path = os.path.join(outdir, recipe["name"] + ".json")
    with open(recipe_path, "w", encoding="utf-8") as fh:
        json.dump(recipe, fh, indent=2)

    blender = find_blender()

    def craft():
        return subprocess.run(
            [blender, "--background", "--python", os.path.join(HERE, "craft.py"),
             "--", recipe_path, outdir],
            capture_output=True, text=True)

    result = stage("crafting in Blender", craft)
    if result.returncode != 0:
        sys.exit("\n  Blender failed:\n%s\n" % result.stderr[-1200:])

    report = {}
    for line in result.stdout.splitlines():
        if line.startswith("CRAFT_REPORT "):
            report = json.loads(line[len("CRAFT_REPORT "):])

    def to_roblox():
        return subprocess.run(
            [sys.executable, os.path.join(HERE, "to_rbxmx.py"), recipe_path, outdir],
            capture_output=True, text=True)

    result = stage("writing Roblox parts", to_roblox)
    rbx = {}
    for line in result.stdout.splitlines():
        if line.startswith("RBXMX_REPORT "):
            rbx = json.loads(line[len("RBXMX_REPORT "):])

    print("\n  %s" % summarise(recipe))
    if report.get("tris"):
        print("  %s triangles, %s KB as GLB"
              % (report["tris"], round(report["bytes_glb"] / 1024)))
    print("  %s, %s tokens" % (usage["model"], usage["tokens"]))
    for note in notes:
        print("  note: %s" % note)
    for name in rbx.get("approximated_as_cylinder") or []:
        print("  note: %s was a cone; Roblox has none, so it is a cylinder" % name)

    print("\n  preview   %s" % report.get("preview", "-"))
    print("  recipe    %s" % recipe_path)
    print("  roblox    %s" % rbx.get("rbxmx", "-"))
    print("\n  Drag the .rbxmx into Studio: right-click Workspace, "
          "Insert from File.\n")


if __name__ == "__main__":
    main()
