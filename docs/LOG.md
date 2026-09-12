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

## Reading a chain from the site

### map passes the index, and the index became a limit

`names.map(read)` hands each callback `(element, index, array)`. The function
being handed over took `(name, limit)`, so Hedera was asked for zero recipes and
Arc for one.

Nothing failed. The marketplace showed a short list, which is exactly what a
nearly empty ledger also looks like, and the bug was only visible by scanning
the logs directly and counting four events where the page showed one.

### ES2017 has no bigint literals

The web app's TypeScript target predated it ever touching a chain. `40375669n`
is a syntax error under ES2017 and the compiler says so clearly, which is the
easy half; the point worth keeping is that a target chosen for a page that
renders text is the wrong one for a page that reads a ledger.

### A key has to be unique, and a note is not

Two ingredients can earn the same note — two cones in one recipe produce the
same sentence twice — and the note text was the React key. Keyed by position
now.

## Claiming a recipe from a browser

### Two wallets, one slot

`window.ethereum` is a single property and every extension wants it. With
MetaMask and Phantom installed together, asking it for an account opened
Phantom's own chooser, which then threw inside its injected script where no
catch of ours could reach. Sites that work on the same machine discover wallets
through EIP-6963, where each extension announces itself; this one now does too.

### A wallet refuses typed data without EIP712Domain

Signing libraries add the domain's type for you. The claim payload travels to
the browser as plain JSON with no library in between, so it has to declare
`EIP712Domain` in `types` itself. The digest does not change.

### The signature is bound to a chain, and so is the wallet

MetaMask refuses `eth_signTypedData_v4` when the domain's `chainId` is not the
wallet's active chain — `Provided chainId "5042002" must match the active
chainId "11155111"`. Signing is free, but it is not chainless. The page now
switches the wallet to the contract's chain first, adding it if the wallet has
never seen it.

The error had been invisible: every failure in signing was treated as the
visitor declining, so the button did nothing. Only a real rejection counts as
declining now; anything else is shown.

## A second route to the model

### A busy free tier is not a bug, but it stops a craft

Gemini's free tier answered `503 — This model is currently experiencing high
demand` in the middle of a test, and the retries only wait that out. The fix is
a second route rather than a better first one: `VOXEL_LLM_FALLBACK` names a
provider and model tried once when the first gives up, and the usage report
says when it was used.

The free models on OpenRouter were measured before being ruled out, on the real
pipeline with the same validator — a tank and a crate each. Every one was
several times slower than the default (36 to 281 seconds), and the ones that
were not slow were rate-limited within two requests. The fallback is the paid
`gemini-2.5-flash-lite` through OpenRouter: as fast as the default, about four
hundredths of a cent per recipe, and on a quota the free tier does not share.
Verified by pointing the primary at a model that does not exist and watching
the recipe arrive anyway.

## Signing in without a wallet

### Most of the people this is for have never installed one

Owning a recipe needs a signature, and until now a signature needed a browser
extension. With a Privy app configured, a visitor signs in with an email or a
Google account and Privy makes a wallet for them. That wallet signs EIP-712 like
any other, so the claim, the agent and `RecipeBook` are unchanged. Someone who
already has a wallet picks it in the same dialog.

Without `NEXT_PUBLIC_PRIVY_APP_ID` the page falls back to the extensions it
finds through EIP-6963, so a fresh clone still works.

### An optional dependency can still block an install

`@privy-io/react-auth` lists `permissionless` as an optional peer, and
`permissionless` asks for `ox@^0.8` while viem ships `ox@0.14`. npm refuses the
install over a package that is never installed. `--legacy-peer-deps` would pass
by switching off peer checks for every package, and a deployment installing
without it would fail the same way. A scoped override, letting `permissionless`
use the `ox` viem already has, resolves exactly that; `permissionless` does not
end up in the tree.

Verified: a Google sign-in, a recipe crafted and claimed, and the wallet Privy
made recorded as its author, holding 0 USDC and having sent no transaction
(`0xd5629e8b…29ddf0` on Arc).

### A session outlives its wallet

Privy keeps a session of its own, apart from any wallet. Signing in through
MetaMask and then locking MetaMask left a Privy session open with no wallet to
sign with, so the page showed Sign in again, and Privy silently ignores
`login()` while a session exists. The button did nothing, with nothing in the
console. The session was visible in the browser as `privy:token`.

Sign in now closes a session that has no wallet before opening the dialog.
Straight after `logout()` Privy still counts the session as open and drops the
login, which made it take two clicks, so the login waits until the session is
seen closed. There is also a Sign out beside the address, which there had not
been: the only way out of that state was clearing the browser.

The dialog logs a React warning about a missing `key` in a list. It comes from
inside Privy, is dev-only, and does not reach a production build.

### A login method is enabled by a switch, not by its settings

Google was opened in Privy's dashboard, its optional credential fields seen, and
Sign in with Google still answered `Login with Google not allowed`. The panel
holds the settings and the switch separately, and only the switch counts. The
app's public configuration says which is which without guessing, readable with
the App ID alone:

```bash
curl -s https://auth.privy.io/api/v1/apps/$APP_ID -H "privy-app-id: $APP_ID"
# google_oauth: false  ->  the switch is off, whatever the panel shows
```

## A build that ran out of memory

### The deployment compiled Privy twice, for a server that cannot run it

Once Privy was added, every deployment failed on Vercel while the same commit
built locally: from a clean clone, with npm 10 and 11, with and without install
scripts, with and without the App ID. The log named the moment: Turbopack
compiling, `Turbopack build failed with 1 error: ./web/app/globals.css`, and a
build system report of an Out of Memory event. `globals.css` was only the module
in hand when the machine filled up.

Measured locally, the build peaked at roughly 5 to 6.5 GB whichever way it ran;
webpack used more, not less. Two options that sound right do nothing here:
`turbopackMemoryEviction` applies to development sessions only, and worker
counts matter after the stage that failed.

What was large was Privy: WalletConnect, Solana, Coinbase and more, compiled
once for the browser and once for the server, because the provider wrapped the
whole page and client components are rendered on the server too. Privy is now
an island loaded with `next/dynamic` and `ssr: false`, reporting the wallet to
the page through the same context. The server output contains no Privy code at
all, the browser output has it in three chunks, and the page still renders on
the server in full. Vercel builds it, with the App ID absent as well as present.

### Reporting state from an island needs a stable report

The island sets state in the page, which renders the island again. Privy returns
a new wallet object on every render, so a report built from it changed every
time: `Maximum update depth exceeded`. The report is keyed on the address, and
the functions it carries read Privy's latest state from a ref.

## A backpack of what you own

### Ownership from the chain, names from a catalog

A backpack needs two things the chain alone cannot give: a name and a picture.
RecipeBook records a recipe as a hash and an author, and the content lived only
on the disk of the machine that crafted it. So the content now also lives in a
Supabase table, filed under the same id, with its preview in a public bucket.

The table has no author column. Which recipes an address owns is read from
`RecipePublished`, where the author is an indexed topic, so the node filters by
it: a few seconds across both chains. The catalog only answers what each id is,
and the route checks every row by hashing its content again and comparing it
with the id it is filed under. A row that fails is dropped, and the recipe is
still listed, by its id.

Postgres stores JSON in its own form, reordering keys and normalising numbers,
which could have broken that check. It did not: the hash is taken over a
serialisation with sorted keys, and every recipe read back hashed to its id.

### Filing what was already made

Five of the six recipes on the chain matched a file in `out/` exactly, by
content. The sixth had been overwritten by a later craft of the same name, and
stays out of the catalog rather than being matched by name. The comparison also
corrected a label: the recipe claimed from MetaMask as a tank is, by its
content, `pirate_loot_chest`.

34 recipes filed, 34 with a preview. New crafts are filed by the agent after
settling; without `SUPABASE_SERVICE_ROLE_KEY` the bench crafts exactly as before.

The call in the agent that files a new craft was then run live: a small red
mailbox, crafted through the site, came back from the agent with its catalog
row saved, filed in Supabase under the id its content hashes to, and with its
preview served publicly.

### A fixed element inside a blur is not fixed

The backpack opened behind the page. Its button lives in the header, and the
header blurs what scrolls under it with `backdrop-filter`. An element with a
backdrop filter becomes the containing block for any `position: fixed`
descendant, so the modal was positioned against the header rather than the
viewport, and painted inside the header's stacking context. It is rendered into
`body` through a portal now, and covers the page as a modal should.

### A busy node is not an empty backpack

A backpack with two recipes in it said "Nothing here yet". Arc's public node
limits how fast it is asked, and the backpack asked for ten block windows at
once: every request came back `Request exceeds defined limit` with `rate limit
exceeded`, three rounds in a row. The code read a rejected chain as a chain
with nothing on it, so a refusal became a false statement about someone's work.

Now the windows are read one at a time, a refusal for rate is waited out and
asked again with a growing pause, and any other error still surfaces. A chain
that cannot be read after that is named in the answer, and the backpack says so
with a way to try again, next to whatever did load. The marketplace reads the
same node the same way.

The two recipes came back on the first call after the change, in five seconds.

## A marketplace, and who owns what

### The platform is an author too

The marketplace needed stock, and the recipe library had none of it on the
chain. The platform now publishes recipes under its own address and is paid
like any author. A review folder held every candidate render; the ones kept
were published by a script that only sends with `--publish`, skips anything
already owned, and publishes a recipe once even when two files hold the same
content. 47 went onto Arc; two library recipes turned out identical to crafts
from the bench.

### Getting a recipe skips the model

Get it asks the agent for a recipe by id. The agent reads it from the catalog,
hashes it to check it is the recipe it claims to be, and pays only the craft
stage: no model is asked for something that already exists. `RecipeBook` sees
a recipe with an author and pays them. Tried with the obby start pad: one stage
paid, the platform credited 0.0009 USDC as author, and the copy listed under
Collected for the address that asked.

### First to claim is not the same as author

SR-01, from the contract audit: `publish` gives a recipe to whoever claims its
id first. A test here added that `publishFor` does the same for an observer who
signs for themselves. The catalog had made that reachable, since it listed
recipes nobody owned yet. New recipes are now filed only once owned, and the
platform stock is owned by the platform. The seven rows from before the change
that nobody owned were removed from the catalog. The contract fix is written up
in `docs/MAINNET.md`.

### An id is not a recipe

Two entries on the shelf had no name. Both were the same id, on Hedera and on
Arc, and it was the hash of the word `market_stall`: the live check that proved
the 90/10 split published an id with no recipe behind it. The chain keeps it,
and has to, since RecipeBook cannot unpublish anything. The marketplace now
lists only recipes the catalog can hand to the crafter, because getting one of
those would have failed.


### Your own recipe is not something you collect

The marketplace offered Get it on the visitor's own recipes. Getting one would
have paid them their own author share, counted a craft nobody else made, and
listed their own work under Collected. Their recipes are marked Yours instead,
and the agent refuses to note a collection whose collector is the recipe's
author, whoever calls it. Crafting your own recipe again is still a sentence at
the bench away; the recipe is reused.

### A busy node, again

With the marketplace, the backpack and tests all reading Arc, its public node
refused the marketplace too, which said so rather than showing an empty shelf.
Chain reads are now kept for twenty seconds on the server, and when the node
refuses, the last good reading is served: the chain only grows, so an answer
from seconds ago is still true. A chain never read yet is still reported as
unreadable. The block number, the one read that failed without a retry, now
retries like the rest.


### Got once is enough

After a get, the marketplace still offered Get it on the same recipe. A second
get would have paid its author again for a copy already in the backpack,
counted a craft that added nothing, and listed the recipe twice under
Collected. The marketplace now marks what the visitor has collected, and the
button goes the moment a get finishes; the line under it says what the get did
for the author. The agent refuses a second get before crafting or paying,
whoever calls it: asked again for a recipe already collected, it answered 409
and started nothing.

## An obby, as a recipe of recipes

### Pieces in, one course out — verified

`services/agent/obby.mjs` reads each piece from the catalog (checked against
its id), lays them along +X with 5 studs of air between them, stands each on
the ground, centres the line on the origin, and returns one recipe that keeps
its `parts`. The validator's 40-ingredient cap is for a single object; a
recipe with `parts` is allowed up to 400, and the 120-stud extent still holds,
so a course that runs long is refused before anything is spent.

Measured on six marketplace pieces (start pad, stepping stone, thin platform,
checkpoint, small platform, finish podium):

| | |
|---|---|
| length | 51.7 studs |
| size | 51.7 x 6 x 6.5 studs |
| ingredients | 39 |
| Roblox parts | 39 |
| model tokens | none — no model is asked |
| pieces paid | 6 of 6, one RecipeBook craft each on Arc |

Each piece's author got the usual 90% of the fee (0.0009 USDC). The start pad
had been got once before, so its author now shows 0.0018 USDC. A piece used
twice in a course is paid once. A piece nobody has claimed is not published
for anyone; it is reported as having no author to pay.

The course itself comes back unclaimed, like any new recipe, and is filed in
the catalog when someone claims it.

### Building an obby gets you its pieces

A piece does not have to be in your backpack before it goes into a course.
Crafting the obby gets the ones you do not have: each is crafted against
RecipeBook once, its author is paid, and it goes into your backpack as
Collected, the same as Get it. A piece you wrote, or already got, is used
without paying for it again. The builder says how many pieces a craft will get
before you press it.

The pieces are read from the catalog in one request, tried twice. A catalog
that cannot be read now says so, instead of reporting a piece as missing.

### A course you can play — verified in Studio

The first courses were a row of pieces on the ground: correct, and nothing to
play. The layout now floats the course 8 studs up and climbs or drops a little
between jumps of 3.5 to 6 studs. A hazard lies in the gap before the next piece
to stand on, 2.5 studs below the jump, so falling short lands in it. Scenery
stands on the ground beside the course.

Each piece carries a role, read from its name: start, path, checkpoint, kill,
move, finish, scenery. The Roblox writer makes each piece a model named for its
role and adds one script, `ObbyRuntime` (`bench/obby_runtime.lua`), that gives
the roles their behaviour. A recipe without roles is written exactly as before,
with no script.

Measured in Studio on a 10-piece course (start pad, thin platform, spikes,
moving platform, ramp, lava pool, small platform, spikes, finish podium, torii
gate as scenery), playing on a fresh Baseplate:

| | |
|---|---|
| spawn | on the start pad, at its surface plus 3 studs, every respawn |
| lava | killed 0.2 s after landing |
| falling below the course | killed |
| respawn | 1.5 s, back on the start |
| moving platform | swings 4 studs either side, moving at up to 5 studs/s, and carries its velocity |
| finish | shows "Finished in … s" |
| script errors | none in the output |

Then played by hand in the same session, start to finish, with the jumps as
laid out.

## Each person pays their own way

### A budget of your own, enforced by the token

Until now the agent paid for every craft out of its own wallet, so every craft
was a gift from the platform. Now whoever crafts gives their agent a budget in
USDC on Arc by signing an EIP-2612 permit — no gas, no transaction from them —
and every job takes what it costs from that budget in one `transferFrom` before
any work is paid for. Past the limit the USDC contract refuses the agent,
whoever asks. The platform still pays every gas.

Checked first that Arc's USDC has it: `PERMIT_TYPEHASH`, `nonces`, and the
domain `USDC` / `2`, at 6 decimals.

Measured end to end with a throwaway wallet, through the agent:

| | |
|---|---|
| test credit | 0.10 USDC sent once; a second request refused |
| permit for 0.02 USDC | signed with no gas and relayed; the allowance read 0.02 on Arc |
| a marketplace get | one transfer of 0.006 USDC from the budget, then the craft paid over x402 and the author paid by RecipeBook |
| a job that failed | the crafter was down; the 0.006 went back to the wallet in the same job |
| a limit too small | with 0.004 left, a 0.006 get refused with 402 before anything was spent |
| nobody signed in | refused: "Sign in and give your agent a budget first." |

Then from the site, by hand: sign in, set the limit, craft, claim, build an
obby, publish — each job charged to the signed-in wallet.

The person pays in USDC on Arc and nothing else. The agent pays the recipe and
publish services in HBAR on Hedera out of the platform's reserve, and the craft
service and the authors in USDC on Arc. `docs/PAYMENT_FLOW.md` has it in plain
words.

### Every step, not only the receipt

A mentor's suggestion: each stage in the ledger now opens into the steps behind
it — the request, the 402, the check against the ENS name, the signature, the
settlement with its transaction. The stage being paid opens by itself, and
every step of the job, including the charge to the budget and the draw on the
platform's cap, is listed in order below it.

### A guide through the happy path

Six steps, each pointing at the thing to do next with the rest of the page
dimmed: give your agent a budget, describe something, claim it, look in the
backpack, build an obby, publish it. Claiming waits until the render has been on
screen for five seconds, so the payment log is read first; the obby is built
without the guide, and its render leads to publishing. It shows on every load,
because it is the path being demonstrated; `?tour=0` turns it off.

### Publishing a course, with its render as its icon

The first course published through Open Cloud — the first model with a script
in it — arrived in the account whose key sent it (asset `88547750146408`), with
no picture until Roblox made one. Publishing now also uploads the render as an
image and sets it as the model's icon; the next publish arrived with the render
on it.

From the Creator Hub, trying the course in Studio played it: spawn, hazards,
finish.

## The craft stage paid through Circle Nanopayments

### Two ways to settle on Arc, Gateway first

The craft stage on Arc settles through Circle Gateway's facilitator —
Nanopayments: `exact` with `GatewayWalletBatched`, where the payer signs an
authorization against a balance held in Gateway and Circle settles many payments
in one transaction. Sub-cent stages are what it is for, and ours cost 0.005
USDC. Our own facilitator stays behind it as the fallback: a direct EIP-3009
transfer from the payer's wallet, which needs no balance deposited anywhere and
keeps the bench charging if Gateway is unavailable.

`@circle-fin/x402-batching` drops into what we had. The paywall's Arc route now
uses Gateway's facilitator client and scheme; the agent registers one composite
scheme that answers a Gateway offer with a batched authorization and any other
with the plain EIP-3009 transfer it used before. The ENS price check is
unchanged: amount, asset, network and payee are the same numbers.
`VOXEL_ARC_SETTLEMENT=own` puts the Arc route back on our facilitator, for a day
Gateway is not answering.

Measured on Arc testnet:

| | |
|---|---|
| deposit into Gateway | 1.00 USDC, onchain in 4 s, spendable 13 s later |
| a marketplace get, end to end | 16.6 s |
| the craft stage | 402 → check against `craft.voxelbench.eth` → signed against Gateway → accepted as transfer `76a3ab1b…`, 7 s |
| the transfer, asked afterwards | `received`, 0.005 USDC from the agent to the craft service, waiting for its batch |
| the agent's Gateway balance | 1.000 → 0.995 |

The receipt changes shape: a Gateway payment comes back as Gateway's transfer
id, settled onchain in a later batch, so the ledger shows it as "via Circle
Gateway" rather than linking a transaction that does not exist yet.

Both paths checked from the site, one craft each. Through Gateway, the craft
stage was accepted as a transfer in 8.9 s. With `VOXEL_ARC_SETTLEMENT=own` and
nothing else changed, the same stage settled as a direct EIP-3009 transfer on
Arc in 22.6 s, with its own transaction (`0x2280789f…`). Switching back is a
restart of the paywall; the agent answers either offer without one.
