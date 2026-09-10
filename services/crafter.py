"""The crafter, as a service.

Blender cannot run on Vercel, so this runs wherever there is a real machine and
the site talks to it over HTTP. That split is not a workaround: it is the same
separation x402 asks for, since each stage is a service that charges per call.

Crafting takes twenty to forty seconds — most of it the model writing the
recipe — and a serverless function in front of it gets ten. So a craft is a
**job**: posting one returns immediately with an id, and the browser polls. Every
HTTP call is milliseconds, and the work happens on a thread that nothing is
waiting on.

    python services/crafter.py            # http://127.0.0.1:8000
"""
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BENCH = os.path.join(ROOT, "bench")
OUT = os.path.join(ROOT, "out")
sys.path.insert(0, BENCH)

from describe import describe  # noqa: E402
from llm import LLMError  # noqa: E402
from make import find_blender, load_env  # noqa: E402
from recipe import RecipeError, extents, validate  # noqa: E402

sys.path.insert(0, os.path.join(ROOT, "services"))
from roblox_upload import UploadError, upload_model, wait_for_asset  # noqa: E402

load_env()

app = FastAPI(title="Voxel Bench crafter")

# The site is served from somewhere else — localhost in development, Vercel in
# production — so it is always cross-origin. Nothing here is authenticated yet;
# when payment lands, x402 is what gates it rather than an origin check.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
MAX_JOBS = 100

STAGES = ("writing the recipe", "crafting in Blender", "writing Roblox parts")
PUBLISH_STAGES = ("uploading to Roblox", "waiting for moderation")


class CraftRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=280)


class PublishRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    # The caller's own Roblox credentials, sent per request and never stored.
    # The browser keeps them; we borrow them for one upload. Holding other
    # people's secrets is what would make this service worth attacking.
    api_key: Optional[str] = Field(default=None, max_length=2048)
    user_id: Optional[str] = Field(default=None, max_length=32)


def _shape_notes(rbx):
    """What the Roblox conversion had to change, said the same way whichever
    path asked. The staged path used to compute this and drop it, so the free
    route warned and the paid one did not."""
    return ["%s is a cone; Roblox has no cone, so it is built from four "
            "corner wedges" % name
            for name in rbx.get("cones_as_pyramids") or []]


def _set(job_id: str, **fields):
    with JOBS_LOCK:
        JOBS[job_id].update(fields)


def _run(job_id: str, prompt: str):
    started = time.time()
    try:
        _set(job_id, stage=STAGES[0])
        recipe, notes, usage = describe(prompt)

        os.makedirs(OUT, exist_ok=True)
        recipe_path = os.path.join(OUT, recipe["name"] + ".json")
        with open(recipe_path, "w", encoding="utf-8") as fh:
            json.dump(recipe, fh, indent=2)

        _set(job_id, stage=STAGES[1], name=recipe["name"])
        result = subprocess.run(
            [find_blender(), "--background", "--python",
             os.path.join(BENCH, "craft.py"), "--", recipe_path, OUT],
            capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            raise RuntimeError("Blender failed: %s" % result.stderr[-400:])

        report = {}
        for line in result.stdout.splitlines():
            if line.startswith("CRAFT_REPORT "):
                report = json.loads(line[len("CRAFT_REPORT "):])

        _set(job_id, stage=STAGES[2])
        result = subprocess.run(
            [sys.executable, os.path.join(BENCH, "to_rbxmx.py"), recipe_path, OUT],
            capture_output=True, text=True, timeout=60)
        rbx = {}
        for line in result.stdout.splitlines():
            if line.startswith("RBXMX_REPORT "):
                rbx = json.loads(line[len("RBXMX_REPORT "):])

        size, _ = extents(recipe["ingredients"])
        notes.extend(_shape_notes(rbx))

        _set(job_id,
             status="done",
             stage=None,
             elapsed=round(time.time() - started, 1),
             result={
                 "name": recipe["name"],
                 "recipe": recipe,
                 "notes": notes,
                 "ingredients": len(recipe["ingredients"]),
                 # Not the same number since a cone became four parts.
                 "parts": rbx.get("parts"),
                 "tris": report.get("tris"),
                 "studs": [round(v, 2) for v in size],
                 "model": usage.get("model"),
                 "tokens": usage.get("tokens"),
                 "files": {
                     "preview": "/file/%s_preview.png" % recipe["name"],
                     "glb": "/file/%s.glb" % recipe["name"],
                     "rbxmx": "/file/%s.rbxmx" % recipe["name"],
                     "recipe": "/file/%s.json" % recipe["name"],
                 },
             })
    except (LLMError, RecipeError) as exc:
        _set(job_id, status="failed", stage=None, error=str(exc),
             elapsed=round(time.time() - started, 1))
    except Exception as exc:  # noqa: BLE001 - the browser deserves a reason
        _set(job_id, status="failed", stage=None, error=str(exc)[:400],
             elapsed=round(time.time() - started, 1))


def _publish(job_id: str, name: str, api_key=None, user_id=None):
    """Upload the native parts, not the mesh.

    Open Cloud accepts .rbxmx, so the model that lands in the user's account is
    the one with exact studs and real colours — the FBX route arrives 100x too
    large and grey. There is nothing to download and nothing to drag.
    """
    started = time.time()
    try:
        path = os.path.join(OUT, name + ".rbxmx")
        if not os.path.isfile(path):
            raise UploadError("nothing crafted by that name")

        title = name.replace("_", " ").title()
        creator = {"userId": user_id} if user_id else None

        _set(job_id, stage=PUBLISH_STAGES[0])
        operation = upload_model(path, title, "Crafted with Voxel Bench",
                                 api_key=api_key, creator=creator)

        _set(job_id, stage=PUBLISH_STAGES[1])
        asset = wait_for_asset(operation, api_key=api_key)
        asset_id = asset.get("assetId")

        _set(job_id, status="done", stage=None,
             elapsed=round(time.time() - started, 1),
             result={
                 "assetId": asset_id,
                 "displayName": asset.get("displayName"),
                 "moderation": (asset.get("moderationResult") or {}).get("moderationState"),
                 "insert": "game:GetService('InsertService'):LoadAsset(%s)" % asset_id,
             })
    except UploadError as exc:
        message = str(exc)
        if "403" in message:
            message += (" — a 403 from Open Cloud is almost always the API key's "
                        "IP allowlist, which never says so.")
        _set(job_id, status="failed", stage=None, error=message,
             elapsed=round(time.time() - started, 1))
    except Exception as exc:  # noqa: BLE001
        _set(job_id, status="failed", stage=None, error=str(exc)[:400],
             elapsed=round(time.time() - started, 1))


@app.post("/publish")
def publish(req: PublishRequest):
    # Falling back to the server's own key means anyone who can reach this
    # endpoint publishes into the operator's Roblox account. That is fine on a
    # laptop and wrong anywhere public, so it is off unless asked for.
    allow_server_key = os.environ.get("VOXEL_ALLOW_SERVER_KEY") == "1"
    key = req.api_key or (os.environ.get("ROBLOX_API_KEY") if allow_server_key else None)
    user = req.user_id or (os.environ.get("ROBLOX_USER_ID") if allow_server_key else None)
    if not key or not user:
        raise HTTPException(
            503, "Connect a Roblox account before publishing.")

    job_id = uuid.uuid4().hex[:12]
    with JOBS_LOCK:
        # Note what is not here: the key. Job state is returned verbatim by
        # /craft/{id}, so anything put in it is public to whoever has the id.
        JOBS[job_id] = {"status": "running", "stage": PUBLISH_STAGES[0],
                        "prompt": req.name, "queued": time.time(),
                        "own_key": bool(req.api_key)}
    threading.Thread(target=_publish, args=(job_id, req.name, key, user),
                     daemon=True).start()
    return {"job": job_id, "stages": PUBLISH_STAGES}


# ── the three stages, separately ──────────────────────────────────────────
#
# The bundled /craft job above is what the site uses: one call, one progress
# bar. These are the same work split into three, because a paywall in front of
# one endpoint can only charge one price, and the stages do not cost the same.
# Writing a recipe is a model call; crafting is seven seconds of CPU;
# publishing consumes someone else's quota.
#
# Split this way, no stage can do another's job. The service that crafts holds
# no Roblox key and the service that publishes never sees a prompt, so taking
# one of them does not hand over the others. That is the argument for paying
# per service rather than sharing a key between them.


class RecipeStage(BaseModel):
    prompt: str = Field(min_length=3, max_length=280)


class CraftStage(BaseModel):
    recipe: dict


class PublishStage(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    api_key: Optional[str] = Field(default=None, max_length=2048)
    user_id: Optional[str] = Field(default=None, max_length=32)


@app.post("/stage/recipe")
def stage_recipe(req: RecipeStage):
    """A sentence in, a validated recipe out. No files touched."""
    try:
        recipe, notes, usage = describe(req.prompt)
    except (LLMError, RecipeError) as exc:
        raise HTTPException(422, str(exc)) from None
    return {"recipe": recipe, "notes": notes, "usage": usage}


@app.post("/stage/craft")
def stage_craft(req: CraftStage):
    """A recipe in, the rendered files out. Never calls a model."""
    try:
        recipe, notes = validate(req.recipe)
    except RecipeError as exc:
        raise HTTPException(422, str(exc)) from None

    os.makedirs(OUT, exist_ok=True)
    recipe_path = os.path.join(OUT, recipe["name"] + ".json")
    with open(recipe_path, "w", encoding="utf-8") as fh:
        json.dump(recipe, fh, indent=2)

    blender = subprocess.run(
        [find_blender(), "--background", "--python",
         os.path.join(BENCH, "craft.py"), "--", recipe_path, OUT],
        capture_output=True, text=True, timeout=180)
    if blender.returncode != 0:
        raise HTTPException(500, "Blender failed: %s" % blender.stderr[-300:])

    report = {}
    for line in blender.stdout.splitlines():
        if line.startswith("CRAFT_REPORT "):
            report = json.loads(line[len("CRAFT_REPORT "):])

    parts = subprocess.run(
        [sys.executable, os.path.join(BENCH, "to_rbxmx.py"), recipe_path, OUT],
        capture_output=True, text=True, timeout=60)
    rbx = {}
    for line in parts.stdout.splitlines():
        if line.startswith("RBXMX_REPORT "):
            rbx = json.loads(line[len("RBXMX_REPORT "):])

    size, _ = extents(recipe["ingredients"])
    return {
        "name": recipe["name"],
        "notes": notes + _shape_notes(rbx),
        "tris": report.get("tris"),
        "studs": [round(v, 2) for v in size],
        "parts": rbx.get("parts"),
        "files": {
            "preview": "/file/%s_preview.png" % recipe["name"],
            "glb": "/file/%s.glb" % recipe["name"],
            "rbxmx": "/file/%s.rbxmx" % recipe["name"],
        },
    }


@app.post("/stage/publish")
def stage_publish(req: PublishStage):
    """The finished parts in, a Roblox assetId out."""
    allow_server_key = os.environ.get("VOXEL_ALLOW_SERVER_KEY") == "1"
    key = req.api_key or (os.environ.get("ROBLOX_API_KEY") if allow_server_key else None)
    user = req.user_id or (os.environ.get("ROBLOX_USER_ID") if allow_server_key else None)
    if not key or not user:
        raise HTTPException(503, "No Roblox account connected.")

    path = os.path.join(OUT, req.name + ".rbxmx")
    if not os.path.isfile(path):
        raise HTTPException(404, "nothing crafted by that name")

    try:
        operation = upload_model(path, req.name.replace("_", " ").title(),
                                 "Crafted with Voxel Bench",
                                 api_key=key, creator={"userId": user})
        asset = wait_for_asset(operation, api_key=key)
    except UploadError as exc:
        raise HTTPException(502, str(exc)) from None

    return {
        "assetId": asset.get("assetId"),
        "moderation": (asset.get("moderationResult") or {}).get("moderationState"),
    }


@app.get("/health")
def health():
    return {"ok": True, "blender": os.path.basename(find_blender()),
            "roblox": os.environ.get("VOXEL_ALLOW_SERVER_KEY") == "1",
            "jobs": len(JOBS)}


@app.post("/craft")
def craft(req: CraftRequest):
    job_id = uuid.uuid4().hex[:12]
    with JOBS_LOCK:
        # Keep the map from growing without bound on a long-running machine.
        if len(JOBS) >= MAX_JOBS:
            for stale in sorted(JOBS, key=lambda k: JOBS[k]["queued"])[:MAX_JOBS // 2]:
                JOBS.pop(stale, None)
        JOBS[job_id] = {"status": "running", "stage": STAGES[0],
                        "prompt": req.prompt, "queued": time.time()}
    threading.Thread(target=_run, args=(job_id, req.prompt), daemon=True).start()
    return {"job": job_id, "stages": STAGES}


@app.get("/craft/{job_id}")
def status(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "no such job")
    out = {k: v for k, v in job.items() if k != "queued"}
    if job["status"] == "running":
        out["elapsed"] = round(time.time() - job["queued"], 1)
    return out


@app.get("/file/{name}")
def file(name: str):
    # Serve only from out/, and only by bare filename.
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(400, "no")
    path = os.path.join(OUT, name)
    if not os.path.isfile(path):
        raise HTTPException(404, "not crafted")
    return FileResponse(path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1",
                port=int(os.environ.get("CRAFTER_PORT", "8000")), log_level="warning")
