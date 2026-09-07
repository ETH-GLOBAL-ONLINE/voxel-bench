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
| Naming | Screened candidate names for collisions — `forge`/`anvil`/`cast`/`chisel` are Foundry's tools, `Blockbench` is an existing 3D editor for this audience — and generated shortlists | Picked Voxel Bench, and chose the crafting-bench direction for the interface |
| Scope decisions | Laid out trade-offs: one chain versus three, one orchestrator versus a swarm, which Roblox ownership model to use | Decided all three: one chain, one agent, users bring their own API key |

## Code

| Area | What the AI did | What we did |
|---|---|---|
| `bench/craft.py` | First draft of the headless Blender crafter: recipe parsing, ingredient builder, bounding-sphere camera framing, FBX/GLB exporters, preview render | Chose parametric primitives over text-to-mesh, decided the recipe/ingredient vocabulary, validated the output in Blender 5.2 |
| `services/roblox_upload.py` | Open Cloud Assets multipart upload and operation polling, standard library only | Verified the endpoint, accepted formats and size limit against Roblox Open Cloud documentation |
| `bench/recipes/market_stall.json` | Wrote the first example recipe | Chose the object and the level of detail to target |

## Generated assets

The `.fbx`, `.glb` and preview `.png` files under `out/` are produced by
`bench/craft.py`, which was itself drafted with AI assistance. They are output
of the pipeline, not hand-modelled, and that is the point of the project rather
than a shortcut around it.

## Notes

- Claude also raised issues we then fixed: a schedule table that was off by one
  day and ran past the submission deadline, and the Blender 5.2 specifics that
  `BLENDER_EEVEE_NEXT` no longer exists and the default AgX view transform
  washes out flat game colours.
- Where the AI stated something it was not sure of — whether Open Cloud accepts
  classic 2D clothing, whether Roblox OAuth needs app approval, current DevEx
  rates — those are recorded as open questions in `PLAN.md` section 10 rather
  than asserted as fact.

<!-- TODO before submission: the "What we did" column is our defence that AI
     assisted rather than authored. Both of us should read it and correct
     anything that overstates the AI's part or understates ours. -->
