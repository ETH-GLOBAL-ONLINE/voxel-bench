# AI usage

ETHOnline 2026 requires disclosing which parts of a project were built with AI
assistance. This is the running log, updated as work happens rather than written
at the end.

Tool used throughout: **Claude Code (Claude Opus 5)**, conversationally. No
spec-driven or prompt-file workflow is in use, so there are no spec files to
attach.

## Planning and research

| What | What the AI did | What we did |
|---|---|---|
| `PLAN.md` | Read the ETHOnline prize and rules pages, drafted the plan document: problem framing, the flow, the schedule, the risk table, and the mapping of our architecture onto sponsor tracks | Chose the product, decided which prizes to chase and which to drop, set the scope we could actually finish in six days |
| Idea shaping | Argued the idea back at us: flagged that Roblox prohibits blockchain integrations and off-platform monetisation, so no Roblox in-game revenue can be routed onchain, and proposed charging for the factory instead | Accepted that constraint and made the call to keep Roblox as the export target rather than the platform |
| `docs/ONCHAIN.md` | Drafted the document: each use of the chain paired with the non-blockchain alternative, and the mapping of our architecture onto each sponsor track | Decided which three tracks to chase and in what order, and rejected the ones with no honest fit |
| `CONTRIBUTING.md`, `docs/LOG.md` | Drafted both from decisions we made in conversation | Set the rules themselves: branch per track, PRs, no AI attribution in commits, secrets handling |
| Naming | Screened candidate names for collisions — `forge`/`anvil`/`cast`/`chisel` are Foundry's tools, `Blockbench` is an existing 3D editor for this audience — and generated shortlists | Picked Voxel Bench, and chose the crafting-bench direction for the interface |
| Scope decisions | Laid out trade-offs: one chain versus three, one orchestrator versus a swarm, which Roblox ownership model to use | Decided all three: one chain, one agent, users bring their own API key |

## Code

| Area | What the AI did | What we did |
|---|---|---|
| `bench/craft.py` | First draft of the headless Blender crafter: recipe parsing, ingredient builder, bounding-sphere camera framing, FBX/GLB exporters, preview render | Chose parametric primitives over text-to-mesh, decided the recipe/ingredient vocabulary, validated the output in Blender 5.2 |
| `services/roblox_upload.py` | Open Cloud Assets multipart upload and operation polling, standard library only | Verified the endpoint, accepted formats and size limit against Roblox Open Cloud documentation |
| `bench/recipes/market_stall.json` | Wrote the first example recipe | Chose the object and the level of detail to target |
| `web/` (Next.js 16, TypeScript, Tailwind 4) | Scaffolded the app and wrote the landing page, the three.js viewer with its 5-stud reference figure, and the API route that serves crafted output with a fallback to the checked-in sample | Directed the design: rejected two palettes before the current one, called out that the hero had fallen out of step with the rest of the page, and asked for the onchain explanation the site was missing |
| `bench/describe.py`, `bench/llm.py`, `bench/recipe.py` | Wrote the prompt, the provider-agnostic LLM interface, and the schema validator that repairs recoverable model output and rejects the rest | Decided that the model writes recipes and never drives Blender, chose the model on measured latency and token cost rather than capability, and set where the line falls between repairing and rejecting |
| `bench/to_rbxmx.py` | Wrote the native Roblox parts writer: primitive mapping, the axis and rotation conversion, linear-to-sRGB colour | Diagnosed with us that FBX arrives 100x too large and colourless, and made the call to emit native parts for Roblox rather than bake a texture |
| Studs conversion | Converted the recipe from metres and added `dims_studs` reporting | Flagged that scale had to be settled before the first upload rather than discovered in Studio |

## Generated assets

The `.fbx`, `.glb` and preview `.png` files under `out/` and
`web/public/samples/` are
produced by `bench/craft.py`, which was itself drafted with AI assistance. They
are output of the pipeline, not hand-modelled, and that is the point of the
project rather than a shortcut around it. `web/public/samples/` is the same output, checked
in so the site has something to display on a fresh clone or a deployment.

## Notes

- Claude also raised issues we then fixed: a schedule table that was off by one
  day and ran past the submission deadline; the Blender 5.2 specifics that
  `BLENDER_EEVEE_NEXT` no longer exists and the default AgX view transform
  washes out flat game colours; an unanchored `out/` in `.gitignore` that
  silently untracked the API route serving crafted files; and a README that
  described the x402 gating in the present tense before any of it existed.
- We corrected Claude in turn — the "shopping mall" framing for Roblox was wrong
  and patronising in a document judges read, the first GLB was rotated so it lay
  on its side, and the first two colour palettes missed what we were after.
- Where the AI stated something it was not sure of — whether Open Cloud accepts
  classic 2D clothing, whether Roblox OAuth needs app approval, current DevEx
  rates — those are recorded as open questions in `PLAN.md` section 11 rather
  than asserted as fact.

<!-- TODO before submission: the "What we did" column is our defence that AI
     assisted rather than authored. Both of us should read it and correct
     anything that overstates the AI's part or understates ours. -->
