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

### Groq is not the answer, measured

The obvious fix for the latency tail was Groq: dedicated hardware, free tier.
Same five prompts, same schema, every result through the validator:

| provider | model | median | range | valid |
|---|---|---|---|---|
| groq | gpt-oss-20b | 5.1s | 1.7-12.1s | 4/5 |
| groq | gpt-oss-120b | 4.1s | **3.8-4.5s** | **2/5** |
| groq | qwen3.8-27b | 5.2s | 2.3-8.1s | **2/5** |
| **gemini** | **flash-lite** | **3.1s** | 2.5-**62.5s** | **5/5** |

Groq is dramatically more consistent — gpt-oss-120b lands between 3.8 and 4.5
seconds every time — and **fails validation about half the time**. It does not
enforce a schema server-side, only valid JSON, so the model returns objects
missing our required fields. An invalid recipe costs a full retry, which is more
time than the latency it saved, and the free tier answers 429 quickly.

**Gemini stays the default.** Schema enforcement is worth more than consistent
latency here. Groq stays configured as the fallback for when Gemini is slow.

Note the Gemini median moved from 17.5s to 3.1s between two runs an hour apart.
Its latency depends on load, not on us. The 62.5s outlier is the real risk, and
the deadline below is what contains it.

### Retries need a clock, not a counter

A run hung for minutes with nothing on screen. `describe()` retried twice, each
attempt retried three times at the HTTP layer, each with a 90s timeout: up to
eight calls and no bound on the wall clock. That is not a wait, it is a hang.

Both layers now run against a deadline — 75s for a call, 120s for the whole
recipe step — and give up with a reason rather than going quiet.

### Groq was unreachable from our own code

Every Groq request came back `403 error code 1010`, which is Cloudflare, not
Groq: it rejects clients by signature and urllib announces itself as
`Python-urllib/3.12`. Every real SDK sends its own User-Agent and ours sent
none. One header, and the same call reached the API.

## Cones

### The enum lists four shapes the renderer will not draw

A cone became a cylinder because Roblox has no cone part. That is the wrong
silhouette for the two things recipes use cones for — spikes and tiered roofs —
and both arrived wrong: posts, and flat discs.

`SpecialMesh` looked like the route out. `Enum.MeshType.Pyramid` exists, accepts
the assignment, throws nothing, and renders an invisible part. So do `Prism`,
`ParallelRamp` and `RightAngleRamp`. Only `Brick`, `Wedge`, `CornerWedge`,
`Sphere` and `Cylinder` draw anything.

Found by building all nine side by side in Studio and looking, which is the only
method that would have found it. A deprecated value that errors costs a minute;
one that silently draws nothing costs an afternoon.

### A cone is four corner wedges

`CornerWedge` is a quarter of a pyramid, and four turned about the up axis close
into a square-based one. Native parts, no mesh, no upload. Four parts instead of
one — across all 28 recipes that is 203 parts becoming 233, which is nothing.

A single `CornerWedge` is already spike-shaped and costs one part, but its apex
sits over a corner rather than the centre, and next to the four-part version the
difference is obvious.

### A rotation that was free in Blender and was not in Roblox

The pagoda roofs carry `rot: [0, 0, 45]`. On a cone that is a no-op — a cone is
round — so the recipe could hold it without consequence. As a square pyramid it
turns the roof into a diamond, and a 6-stud square rotated 45° only covers a
4.24-stud one. The 4.3-stud body underneath pushed its corners through.

Cones now discard the spin and take their orientation from their axis alone. The
general shape of this: **a value that is meaningless in the source can become
meaningful in the target, and it will not announce itself when it does.**

### The report says both numbers now

A cone being four parts means the ingredient count and the part count are no
longer the same number. Both are reported: one is what the recipe asked for, the
other is what Roblox receives.

`stage_craft` computed the note about substituted shapes and dropped it, so the
free path warned and the paid one — the one the site is moving to — did not.
Both now call the same function.

## A scene of four thousand parts

### It goes to Roblox unchanged

A hand-authored garden of 4,408 ingredients converts to `.rbxmx` in 0.33
seconds and lands at 2.88 MB against Open Cloud's 20 MB limit. Moderation
approved it. Nothing in the Roblox path needed a change for two orders of
magnitude more parts than it had ever seen.

Blender is the part that does not scale: **28 minutes**, because every
primitive is a separate `bpy` operator call. That is fine for a sample rendered
once and checked in, and it is the reason a scene this size cannot come out of
the live prompt path.

### The pivot trap, twice, and the second half of it

Placing the model with `PivotTo(CFrame.new(0, 3, 0))` laid it on its edge. That
CFrame carries no rotation, so Roblox turns the whole model to match — and the
pivot is the `PrimaryPart`, which is the one part that *is* rotated, the disc
standing flat. The file was correct; placing it broke it.

Then it floated twelve studs, because the lowest point was computed as
`Position.Y - Size.Y/2`. For a part standing on a rotated axis that is not where
it reaches. The world-space half-height is the size projected through the part's
own rotation:

```lua
0.5 * (|r10| * Size.X + |r11| * Size.Y + |r12| * Size.Z)
```

Both failures are the same mistake: **reading an orientation that belongs to the
pivot as though it belonged to the world.** `GetBoundingBox` has it too — it
returned an 8-stud height for a 17.8-stud garden.

### Scale is not something the validator checks

The garden arrived with a door 3.21 studs tall. A Roblox character is 5, so the
door was shorter than the person walking through it, and the whole island was 31
studs across. Multiplying every position and size by 2.2 puts the door at 7.06
and the island at 68.

Nothing rejected it. The validator checks that a dimension is not absurd on its
own; it has no view on whether a scene reads at human scale. Worth having,
because this is the first recipe written by a person rather than a model and the
person had no 5-stud figure to check against.

### Most of a GLB can be bookkeeping

The export is 5.26 MB, and **3.33 MB of that is the JSON header**: 4,408
primitives, 4,408 materials, 13,370 accessors. One material per ingredient means
one primitive per ingredient, and Draco then compresses 4,408 tiny meshes
separately instead of one large one.

Draco still helps — `KHR_draco_mesh_compression` is in `extensionsRequired` and
the geometry is a third of what it was. The remaining win is baking colours into
a vertex colour layer so the whole scene is one material and one primitive. Not
done: it changes how every object is exported, and the current output is what we
are about to record.

### Fire and forget does not survive the caller

A 28-minute render launched with `nohup … &` from a tool call looked dead when
checked twenty minutes in, and had in fact finished on time. A second render was
started on the assumption it had died. Use the harness's own background mode for
anything long, and check for the output file rather than for the process.

## The ledger meets the site

### An id is what a recipe says, not what it is called

`RecipeBook` was always documented as keying on content, and the only code using
it hashed the name. Content is the one that gives the property the comment
claims: the same recipe is the same id whoever writes it, so a second publisher
cannot take the first one's authorship, and a rename does not mint a new one.

Only the agent computes it, in JavaScript. Python's standard library has
`sha3_256`, which is not keccak256 — different padding, different hash — and
adding a dependency to a crafter that is deliberately stdlib-only is a worse
trade than computing the id in one place. Two languages agreeing on how to print
a float is a coin toss anyway: `1.0` against `1` is a different hash.

### Logs cannot be asked for since the beginning

`eth_getLogs` from block zero is refused on Arc — a query is capped at ten
thousand blocks and the chain is sixty-one million deep. The deployment block
comes from the Ignition journal, and the scan walks backwards from the head in
windows the node accepts, stopping once it has enough. A ledger with four
recipes costs one request rather than six thousand.

### Two meanings of one word, in one file

`ledger` was already the function building the list of payments the browser
shows, and settling against `RecipeBook` produced a second thing that wanted the
same name. Renamed: `quotes()` for the prices, `book` for what the contract
recorded. The word also collides with a sponsor's name, which is reason enough
on its own to spend it carefully.

## The cap becomes a brake

### A limit consulted before spending is advice

`Allowance` was deployed, tested against the live chain and never called by
anything that spends. The agent had its own balance and paid from it, so the
cap bounded nothing.

Every craft now begins with a draw. When the window is used up the contract
reverts and the craft stops there, which is a different kind of thing from a
check of ours: the process cannot skip it by taking another path.

Proved by lowering the cap below what had already been drawn and trying to
craft — `the spending cap is used up — asked for 0.001 HBAR, 0 HBAR left in
this window` — then restoring it.

### One cap per chain, and two ways to get that wrong

The first version summed the stages and drew the total. The stages settle on
different chains, so it was adding 100,000 tinybars to 5,000 USDC units and
drawing 105,000 of something that does not exist.

The second version separated them and still drew the wrong amount on Arc, since
an x402 price there is quoted in the USDC ERC-20's 6 decimals while the
allowance holds native USDC at 18. A factor of 10^12 between the number and what
it meant.

### Ignition parameters are futures, not values

The module tried to accept amounts as strings, because a parameters file is JSON
and 1e18 is past what a JSON number holds exactly. `typeof value === "string"`
is false for what `getParameter` returns — it is a future resolved later — so
every conversion silently took the fallback, and Arc deployed with Hedera's cap,
eight orders of magnitude too small.

It deployed, reported a cap of 0.0000000001 USDC, and nothing complained. Fixed
with `setCap`, and the module now names the chain rather than pretending the
amounts can be passed in.

### Probing a wallet on page load starts a fight

Reading `eth_accounts` on mount to remember a previous visit made two installed
extensions race to answer, and the loser threw from inside its own injected
script where no `catch` of ours can reach it. The user sees a console error from
a file they have never heard of.

Nothing is asked of a wallet until the connect button is pressed.
