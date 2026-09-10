# AI usage

ETHOnline 2026 requires disclosing which parts of a project were built with AI
assistance. This is the running log, updated as work happens rather than written
at the end.

Tool used throughout: **Claude Code (Claude Opus 5)**, conversationally. No
spec-driven or prompt-file workflow is in use, so there are no spec files to
attach.

Roblox Studio's MCP server was used to check geometry against the engine rather
than against documentation — building candidate shapes in a live Studio session
and looking at them. Two of the findings in `FEEDBACK.md` came out of that and
would not have come out of reading.

## Planning and research

| What | What the AI did | What we did |
|---|---|---|
| `PLAN.md` | Read the ETHOnline prize and rules pages, drafted the plan document: problem framing, the flow, the schedule, the risk table, and the mapping of our architecture onto sponsor tracks | Chose the product, decided which prizes to chase and which to drop, set the scope we could actually finish in six days |
| Idea shaping | Argued the idea back at us: flagged that Roblox prohibits blockchain integrations and off-platform monetisation, so no Roblox in-game revenue can be routed onchain, and proposed charging for the factory instead | Accepted that constraint and made the call to keep Roblox as the export target rather than the platform |
| `docs/ONCHAIN.md` | Drafted the document: each use of the chain paired with the non-blockchain alternative, and the mapping of our architecture onto each sponsor track | Decided which three tracks to chase and in what order, and rejected the ones with no honest fit |
| `CONTRIBUTING.md`, `docs/LOG.md` | Drafted both from decisions we made in conversation | Set the rules themselves: branch per track, PRs, no AI attribution in commits, secrets handling |
| Naming | Screened candidate names for collisions — `forge`/`anvil`/`cast`/`chisel` are Foundry's tools, `Blockbench` is an existing 3D editor for this audience — and generated shortlists | Picked Voxel Bench, and chose the crafting-bench direction for the interface |
| Scope decisions | Laid out trade-offs: one chain versus three, one orchestrator versus a swarm, which Roblox ownership model to use | Decided all three: one chain, one agent, users bring their own API key |
| Product direction | Argued each idea back and flagged what it would cost | Brought the ideas: selling model choice through a router with a margin rather than absorbing the model cost; editing an object instead of re-rolling it; seeding a curated library so the model has good work to imitate; and the question about Roblox's visual ceiling that turned into the shape-versus-look distinction |
| `docs/RECIPE_LIBRARY.md` | Drafted the brief and the catalogue | Rewrote the framing repeatedly: it told an expert which tools not to use, spoke as "we" about a two-person team, assumed the reader had seen our one example, and baked in a port number that was an accident of one machine. All four were caught in review, not by the AI |
| `FEEDBACK.md` | Measured the behaviour, checked it against the primary documentation, drafted the entries | Asked for it to be verified before being written up, and sharpened the Hedera point to the asymmetry — that `getBalance` and `msg.value` disagree by ten orders of magnitude in the same session |
| `docs/STATUS.md` | Rewrote it as what runs, what is left in order, and the traps that already cost time | Asked for it: the document had drifted and is the first thing anyone arriving reads. Also ruled that dates come out of the repo docs, since the order is being decided as we go |
| `docs/CONTRACT_AUDIT.md` | Drafted the brief for Stefan: what the three contracts do, how to run the tests, and the three places a second reading adds most | Asked for the handoff, and rejected the first framing for describing the work in demotivating terms. Also caught that its advice to ask us for a Hedera key was wrong — a reviewer is better off deploying his own copy, which he can do without anything from us |

## Code

| Area | What the AI did | What we did |
|---|---|---|
| `bench/craft.py` | First draft of the headless Blender crafter: recipe parsing, ingredient builder, bounding-sphere camera framing, FBX/GLB exporters, preview render | Chose parametric primitives over text-to-mesh, decided the recipe/ingredient vocabulary, validated the output in Blender 5.2 |
| `services/roblox_upload.py` | Open Cloud Assets multipart upload and operation polling, standard library only | Verified the endpoint, accepted formats and size limit against Roblox Open Cloud documentation |
| `bench/recipes/market_stall.json` | Wrote the first example recipe | Chose the object and the level of detail to target |
| `web/` (Next.js 16, TypeScript, Tailwind 4) | Scaffolded the app and wrote the landing page, the three.js viewer with its 5-stud reference figure, and the API route that serves crafted output with a fallback to the checked-in sample | Directed the design: rejected two palettes before the current one, called out that the hero had fallen out of step with the rest of the page, and asked for the onchain explanation the site was missing |
| `bench/describe.py`, `bench/llm.py`, `bench/recipe.py` | Wrote the prompt, the provider-agnostic LLM interface, and the schema validator that repairs recoverable model output and rejects the rest | Decided that the model writes recipes and never drives Blender, chose the model on measured latency and token cost rather than capability, and set where the line falls between repairing and rejecting |
| `bench/to_rbxmx.py` | Wrote the native Roblox parts writer: primitive mapping, the axis and rotation conversion, linear-to-sRGB colour | Diagnosed with us that FBX arrives 100x too large and colourless, and made the call to emit native parts for Roblox rather than bake a texture |
| `contracts/` — `RecipeBook`, `SplitVault` | Wrote both contracts, nine Solidity tests including a fuzz over the split, the Hardhat and Ignition setup, and the live verification script | Created the Hedera testnet accounts, supplied the sponsor documentation to work from, and decided the split arrangement the contract encodes |
| `services/paywall`, `services/agent` | Read the reference implementation, wrote the x402 gateway and the paying agent, and configured the spend control | Supplied the sponsor documentation and the reference repos to work from, and made the call to wire both HBAR and USDC so one implementation serves two tracks |
| `contracts/` — `Allowance` | Wrote the spending cap contract, its tests and the live verification script that draws within the cap and is refused past it | Decided that the cap belongs in a contract rather than in the agent's configuration, and that it is its own contract rather than a modifier |
| `services/agent/server.mjs`, `web/app/components/Payments.tsx` | Turned the agent into a service the site calls, and built the payment ledger the browser shows while a craft runs | Called for it: the site crafting for free while the agent paid in a terminal was two stories, and the one that mattered was happening where nobody would see it |
| Cone geometry in `bench/to_rbxmx.py` | Found that a cone was arriving as a cylinder, tested all nine `MeshType` values in Studio, and rewrote cones as four `CornerWedge` parts | **Chose the shape.** The AI recommended the cheaper one-part version; the call was to look at both in Studio and pick the four-part pyramid, because its apex is centred and the one-part version's is not. The AI's own cost objection turned out to be worth 30 parts across 28 recipes, which is nothing |
| `contracts/scripts/ens/`, `services/agent/discover.mjs` | Registered the name on ENSv2, deployed the subname registry and the permissioned resolver, and rewrote the agent to resolve names instead of reading a URL from a file | Decided what the names are for. The first sketch was three names resolving to three endpoints, which is an address book; the useful version came out of asking what the records could be trusted to say, and landed on the price being a record the service is not allowed to write |
| Studs conversion | Converted the recipe from metres and added `dims_studs` reporting | Flagged that scale had to be settled before the first upload rather than discovered in Studio |

## Written without AI

`bench/recipes/` — 27 of the 28 recipes are Stefan's, hand-authored from the
brief in `docs/RECIPE_LIBRARY.md`. Every one passed our validator without a
single repair, which is not the normal rate.

They matter here beyond the count: the recipes are the input the rest of the
pipeline exists to serve, and the geometry problem in the cone row above was
found by running his work rather than ours.

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
- The clearest case of that was the cone fix. Claude proposed `SpecialMesh` with
  `Enum.MeshType.Pyramid`, which accepts the assignment and renders nothing at
  all — the spikes would have disappeared rather than improved. It was caught by
  building it in Studio and looking at it before committing to it, which is the
  method the whole episode argues for. The replacement was then chosen by
  putting two candidates side by side on screen and picking the better one,
  against Claude's own recommendation.
- Two findings on the chain came out of testing rather than reading, and are
  written up in `FEEDBACK.md` with the evidence: `msg.value` arrives in tinybars
  on Hedera despite the documentation saying otherwise, and a verification script
  that reported a broken split when the contract was correct — the same account
  was playing both roles.
- The ENS entries in `FEEDBACK.md` are the same shape. The commitment window
  running on the chain's clock rather than ours, and name resolution costing
  twenty-four seconds written the obvious way against one second batched, were
  both found by the first attempt failing rather than by reading ahead.
- Where the AI stated something it was not sure of — whether Open Cloud accepts
  classic 2D clothing, whether Roblox OAuth needs app approval, current DevEx
  rates — those are recorded as open questions in `PLAN.md` section 11 rather
  than asserted as fact.

<!-- TODO before submission: the "What we did" column is our defence that AI
     assisted rather than authored. Both of us should read it and correct
     anything that overstates the AI's part or understates ours. -->
