# Build log

Running record of what was actually run and what came out of it. Numbers here
are measured, not estimated. If something is untested it says so.

---

## Mon 7 Sep

### Crafter works end to end — verified

`bench/craft.py` takes a recipe JSON of composed primitives and produces FBX,
GLB and a preview render in one headless Blender call.

```bash
blender --background --python bench/craft.py -- bench/recipes/market_stall.json out
```

Measured on `market_stall`:

| | |
|---|---|
| wall clock | 6.9 s |
| triangles | 398 |
| vertices | 227 |
| ingredients | 14 |
| FBX | 75 KB |
| GLB | 31 KB |
| size | 14.27 x 6.23 x 8.94 studs |

The 20 MB Open Cloud limit is not remotely a concern at this scale.

### Recipes are authored in studs, not metres

Roblox measures in studs; 1 stud is about 0.28 m and a character is roughly 5
studs tall. The first recipe was written in metres, which would have imported at
2.34 studs tall — under half a player's height. Converted once at 1/0.28 and the
recipe now carries `"units": "studs"`. The crafter reports `dims_studs` so this
is visible in every report rather than discovered in Studio.

The stall now stands 8.94 studs, about 1.8x a player. Correct for a prop you
walk up to.

### Blender 5.2 specifics worth not rediscovering

- `BLENDER_EEVEE_NEXT` is not a valid engine id. The only engine is
  `BLENDER_EEVEE`.
- The default AgX view transform washes out flat game colours badly. Previews
  force `Standard`, which is why the render looks saturated rather than milky.
- Camera framing is computed from the object's bounding sphere. A hardcoded
  camera worked for one prop and broke on the next size up.

### The site, scaffolded early

Next.js 16.3 + TypeScript + Tailwind 4 in `web/`. Production build passes with
no type errors.

```bash
cd web && npm install && npm run dev
```

The Blender render sits beside the GLB orbiting in the browser, next to a grey
5-stud figure standing in for a Roblox character so scale is judged by eye
rather than by reading a number. Landing copy covers how it works, the three
stages, and why any of it is onchain.

Two things worth knowing:

- **An API route serves the crafter's output**, because Next only serves from
  `public/` and copying on every craft would be silly. It falls back to
  `web/public/samples/`, so a fresh clone shows a populated bench without
  installing Blender. The sample lives under `public/` rather than at the repo
  root because a deployment only bundles what is inside `web/` — anything above
  it simply is not there.
- **The GLB needs no rotation.** Blender is Z-up and three.js is Y-up, but the
  glTF exporter already converts on the way out. Rotating the loaded scene lays
  the model flat on its side, which is exactly what happened first.

Started Monday rather than Thursday: with two people, Track B does not have to
wait on Track A. The constraint on polish still stands.

### Not tested yet

- **`services/roblox_upload.py` has never talked to Roblox.** Written against
  the Open Cloud docs — endpoint, the four accepted model formats, 20 MB cap,
  operation polling — and its local guards are tested, but no real upload has
  happened. It needs an API key.
- Nothing onchain exists. No contract, no wallet, no x402. The site describes
  the design; none of it runs.
- No Luau, no place assembly, no marketplace.

### A gitignore bug worth remembering

`.gitignore` had an unanchored `out/`, which matches *any* directory called
`out` at any depth — including `web/app/api/out/`, the route that serves crafted
files to the browser. Git silently untracked it. A clone would have 404'd on
every asset with no visible error. Anchored to `/out/`.

Unanchored directory patterns are a footgun whenever a framework happens to use
the same word.

### The upload works — verified against the live API

```
assetId          122072897544996
moderationState  Approved
state            Active
```

First try. The key wants the `assets` API system with **both** read and write,
the creator restricted to the account, and an IP allowlist — `0.0.0.0/0` for
now. Leaving the allowlist empty returns 403 on everything with a message that
never mentions the IP.

Moderation came back **Approved immediately**, with no queue. That answers one
of the open worries about whether uploads could be demoed live.

Note the system is called `assets`, not `asset-permissions` — the latter manages
who may use someone else's asset and is the wrong one.

### FBX arrives 100x too large, and grey

Measured in Studio: `1426.687 / 14.27 = 100.0` exactly.

FBX stores centimetres. Blender exports assuming one unit is a metre, so it
writes our numbers multiplied by 100, and Roblox reads them as studs.

The axes were fine — our 8.94 height came back as Y=893.9 and our 6.23 depth as
Z=622.6, so the Z-up to Y-up conversion works.

It also arrived **grey**. Our models carry flat material colours and no image
map, and Roblox imports textures rather than material base colours.

### Native Roblox parts, which fixes both

`bench/to_rbxmx.py` writes a `.rbxmx` of native parts instead: `cube` to Block,
`cylinder` to Cylinder, `sphere` to Ball. Sizes are written in studs with
nothing in between to convert, and each part carries a `Color3` so no texture is
needed.

Verified in Studio through the MCP — 14 parts, correct sizes, correct colours,
`canopy` tilted the 8 degrees the recipe asks for, cylinders turned upright.

Details worth keeping:

- **Colours are converted linear to sRGB.** Recipe colours are linear the way
  Blender reads them; sending them raw lands every colour darker than the
  preview the user just approved.
- **A Roblox cylinder's length runs along local X**, Blender's along Z, so
  cylinders get a quarter turn.
- **Roblox has no cone.** `sack` is approximated as a cylinder, and the report
  says so rather than hiding it.
- **The model needs a `PrimaryPart`.** Without one, its pivot borrows an
  orientation from the bounding box, and moving it tilts the whole thing — the
  first move put every part 8 degrees off. The generator now anchors to the
  first axis-aligned ingredient.

Blender still crafts the preview render and the GLB. This is the Roblox-shaped
output, not a replacement for it.

### Studio MCP, as a development tool

Roblox's standalone MCP server is discontinued; Studio now ships one built in
(Assistant, then Manage MCP Servers, then enable). Registered with
`claude mcp add roblox-studio -- %LOCALAPPDATA%\Roblox\mcp.bat`.

It has to be enabled on the Studio side before the tools appear, and Claude Code
needs a restart afterwards — the tool list is fetched once at startup, so
enabling it later leaves the session with nothing.

**Not part of the product.** It needs Studio open and cannot be hosted. It
exists so verification is a query instead of a walkthrough of menus.

---

## Tue 8 Sep — the day that decides

The first real upload. `market_stall.fbx` is already generated and waiting.

Ladder if it goes wrong, in order:

1. FBX rejected, try the same model as GLB — Open Cloud accepts both.
2. Both rejected, Roblox becomes an optional export target. The three.js viewer
   becomes the primary output and the pitch shifts to an engine-agnostic asset
   factory. The onchain half of the project is untouched either way.

Nothing about the economics depends on Roblox specifically, which is why the
GLB path was built on day one rather than added as a rescue.

---

## Mon 7 Sep, later — a sentence becomes an object

`bench/describe.py` turns a prompt into a validated recipe. Three asked for
cold, all three recognisable: a stone well with a roof, rope and hanging
bucket; a treasure chest with metal bands and a gold lock; a sci-fi crate with
hazard corners and a lit panel.

The model writes the recipe and never touches Blender. Same recipe, same object,
every time — and when something looks wrong the recipe is a small readable file
you fix by hand rather than a dice roll you re-roll.

### The model choice, measured rather than assumed

One crate, same prompt and schema:

| model | time | tokens | thinking |
|---|---|---|---|
| **gemini-flash-lite-latest** | 2.9s | **901** | 0 |
| gemini-3.1-flash-lite | 12.1s | 542 | 0 |
| gemini-3.6-flash | 17.3s | 3587 | 2802 |

The frontier model spends 2802 tokens reasoning its way to the same crate: four
times the tokens for an equivalent result. Since we charge per craft, this is
the unit-economics argument from `docs/ONCHAIN.md` with numbers attached.

**Read those times with care.** They came from a minimal prompt producing a
6-ingredient crate. The real prompt carries the rules and a worked example and
produces around 9 ingredients, and across five prompts the same model measured
**3.5s to 48.5s, median 17.5s** — for near-identical token counts. The variance
is queueing on the free tier, not our output size: tightening the prompt cut
ingredients from 13 to 9 and barely moved the clock.

The token comparison between models still holds, because both ran the same
prompt. The absolute latency does not, and 48 seconds of dead air in front of a
judge is a real problem rather than a rounding error.

Two ways out, and the second is the interesting one:

- **Groq.** Dedicated inference hardware, free tier, far more consistent than a
  shared queue. `llm.py` already speaks it.
- **The recipe library.** A recipe that already exists needs no model call at
  all — it crafts instantly, and its author gets paid. The latency problem and
  the marketplace turn out to be the same feature seen from two sides: only
  genuinely new objects pay the model cost, and the platform gets faster as it
  gets more recipes.

Note `gemini-2.5-flash` is gone for new keys — the API says to use the 3.x line.

The free tier answers **503 under load**, which is a demo risk rather than a bug.
`llm.py` backs off and retries.

### The validator is what makes the output trustworthy

A model returns JSON that parses cleanly and describes a chair 400 studs tall.
`bench/recipe.py` draws the line between mistakes worth repairing and mistakes
worth rejecting:

- **Repaired, with a note:** missing colour, colour out of 0-1, a part below the
  minimum size, duplicate ingredient names, a messy recipe name.
- **Rejected:** an invented shape, a missing scale, a non-numeric size, a part
  positioned off in space, and — the important one — a dimension so large the
  model clearly thought it was working in centimetres. Clamping 200 studs to 60
  hands back a wrong object; an error can be retried, and it is, with the
  validator's own message fed back to the model as the correction.

Guessing what the model meant is how you ship a crate that is secretly a sphere.

### Blender writes the preview somewhere else if you let it

The render landed in `C:\out\` while the FBX and GLB landed correctly in
`out/`. Blender resolves a relative render path against its own base rather than
the working directory; the exporters go through Python and are unaffected, which
is why only the preview went missing. `os.path.abspath` on the render path.
