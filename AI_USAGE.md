# AI usage

ETHOnline 2026 requires disclosing which parts of a project were built with AI
assistance. This is the running log, updated as work happens rather than written
at the end.

Tool used throughout: **Claude Code (Claude Opus 5)**, conversationally. No
spec-driven or prompt-file workflow is in use, so there are no spec files to
attach.

**OpenAI Codex** was used by Stefan for the contract audit that found SR-01:
see the SR-01 rows below and `contracts/audit/`.

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
| `services/facilitator/`, Arc deployment | Deployed the contracts to Arc, built the facilitator the public one does not provide for that chain, and wired the paywall and agent to settle on either | Caught that the plan was wrong before it cost a day: it assumed USDC on Hedera would satisfy Circle's tracks, and both are about Arc. Also called for the facilitator to run on its own account rather than the agent's — sharing one works and hides the thing being demonstrated |
| `services/agent/recipes.mjs`, `web/app/components/Marketplace.tsx` | Wired each craft to settle against `RecipeBook`, and replaced the mocked marketplace card with one that reads the chain | Asked for it as the thing that makes the library matter — the site paid for work but nobody was being paid for a recipe. Also drew the line between paying for work and owning what is made, which had been one idea and is two |
| `services/agent/allowance.mjs`, `web/app/components/SpendingCap.tsx` | Wired every craft to draw from the `Allowance` contract before spending, deployed a second cap on Arc, and put both on the page | Asked the question that produced it: what stops someone burning the inference budget on things nobody crafts again. The contract existed and bounded nothing; the answer had to be a number rather than an intention |
| `web/app/components/Wallet.tsx`, `PrivyWallet.tsx` | Moved wallet discovery to EIP-6963, switched the wallet to the contract's chain before signing, then added Privy sign-in and moved it into a browser-only island when it made the Vercel build run out of memory | Found that Connect wallet did nothing with two extensions installed, asked for sign-in with email and Google rather than another wallet button, and set up the Privy app and its login methods |
| `bench/llm.py` fallback | Benchmarked OpenRouter's free models against the default and wired a second route that takes over when the first fails | Supplied the OpenRouter key and the idea of trying the free models; the measurements ruled them out and a paid fallback in |
| Backpack, `services/agent/catalog.mjs`, `supabase/` | Designed the catalog — a recipe filed under its hash and checked against it on every read — and wrote the migration, the backfill and the backpack, and made a busy node read as busy rather than empty | Asked for a place to see what you own, with pictures, proposed Supabase for it, and created the project |
| Marketplace, `services/agent/publish-stock.mjs` | Built the marketplace and Get it, rendered the candidate stock for review, and published the chosen recipes under the platform's address | Proposed the platform as an author with Stefan's recipes as its stock, chose which renders to drop, and caught that the shelf offered you your own recipes and a second copy of one already collected |
| SR-01, the audit — `contracts/audit/`, `contracts/test/` | **OpenAI Codex, used by Stefan:** reviewed the architecture and the `RecipeBook` publication flow, read the contracts and the existing tests, wrote and refined the Foundry unit, fuzz and stateful invariant tests, reproduced the front-run in a controlled local environment, and organised the results, logs and written evidence. **Claude:** reproduced the front-run in a Foundry test of its own, and changed the catalog so an unowned id is never made public | Stefan identified and assessed SR-01 and reviewed the test scenarios and evidence. The remediation design was left to the team, as the audit said |
| SR-01, the fix — `services/agent/crafted.mjs`, `contracts/src/RecipeBook.sol`, `contracts/scripts/` | Built both layers of the fix: the agent's private note of who crafted what, the claim relayed only for them and the Unclaimed tab; `RecipeBook`'s attester, migration and seal. Adapted Stefan's suites to it (64 tests), deployed the new books on both chains with viem when Ignition failed, migrated and sealed them, and ran the end-to-end checks on testnet | Decided to close SR-01 fully before submission rather than only document it. Set the rule — only the person who crafted a recipe can claim it — and asked for the Unclaimed tab. Set the constraint that the live contracts be preserved and changed as little as possible, which is why the vaults were reused and the rest of `RecipeBook` left as it was. Sent the plan to Stefan for review |
| The obby — `services/agent/obby.mjs`, `bench/obby_runtime.lua`, `web/app/components/ObbyBuilder.tsx` | Wrote the course layout, the roles, the script that runs them and the builder on the bench, and tested spawn, hazards, the moving platform and the finish in Studio through the MCP | Rejected the first course — a row of pieces on the ground — as nothing anyone would want to play, and asked for a spawn, hazards that kill and platforms that move. Proposed that building a course gets you the pieces you do not have, asked for dragging to reorder, and played it through in Studio |
| Per-user budgets — `services/agent/budget.mjs`, `web/app/components/Budget.tsx` | Checked that Arc's USDC supports EIP-2612 `permit`, then built the budget: the permit relayed by the agent, one charge per job, the refund when a job fails, the testnet credit, and the check that refuses a job before anything is spent | Asked why the platform was paying for everything, set the rule that each person pays their own way while the platform pays the gas, made setting the limit a step of the happy path, and asked that the test credit say plainly it is testnet-only |
| The guide — `web/app/components/Tour.tsx` | Built the animated six-step guide with its spotlight, and the timing behind each step | Designed the path and its order — budget, describe, claim, backpack, obby, publish — and tuned it by using it: waiting for a scroll, five seconds with the render before moving on, a way past the claim, showing it on every load for the video |
| Payment logs — `web/app/components/Payments.tsx`, `services/agent/pay.mjs` | Logged every step behind a payment — the 402, the check against the name, the signature, the settlement — and made each stage open into its log | Brought the idea from a mentor: a payment should show the process behind it, not only its receipt |
| Publishing sets the icon — `services/roblox_upload.py`, `services/crafter.py` | Uploads the render as an image and sets it as the published model's icon, worked out from the Assets API reference | Insisted that a paid publish deliver a finished model rather than one without a picture, and showed the render worked as an icon by setting one by hand first |
| `docs/PAYMENT_FLOW.md` | Drafted it from the explanation given in conversation | Asked for it once the plain-language version of the flow made sense |
| Circle Nanopayments — `services/paywall/server.mjs`, `services/agent/pay.mjs` | Read the SDK's own types, deposited into Gateway, and moved the craft stage onto Gateway's facilitator with ours kept as a switchable fallback | Asked for our claims to be checked before they went out, and made the call to build on Circle's stack the same day, with a rollback |
| The obby's drop — `bench/obby_runtime.lua` | Raised the course, found by measuring in Studio that the height never survived an import and made the runtime lift the course on Play, laid a black void that kills on touch, and lit the course at night | Asked for a fall that reads as a cliff rather than a hop, then for the ground to be black and the course the only thing lit, and caught in Studio that the first version still sat on the ground |
| Studs conversion | Converted the recipe from metres and added `dims_studs` reporting | Flagged that scale had to be settled before the first upload rather than discovered in Studio |

## Written without AI

`bench/recipes/` — 27 of the 28 recipes are Stefan's, hand-authored from the
brief in `docs/RECIPE_LIBRARY.md`. Every one passed our validator without a
single repair, which is not the normal rate.

`sakura_garden` is his too, and it is the sample the bench shows: 4,408
ingredients of cubes, cylinders and spheres, written by hand in the same format
a prompt produces. It is on the page as the thing to build toward rather than as
model output, and the page says so.

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
- So are the Arc ones. Two x402 signer converters read a field viem does not
  have, and the failure arrives as an invalid address in the middle of signing
  rather than as a bad configuration at startup. Found by reading the library's
  own source after the error made no sense.
- Where the AI stated something it was not sure of — whether Open Cloud accepts
  classic 2D clothing, whether Roblox OAuth needs app approval, current DevEx
  rates — those are recorded as open questions in `PLAN.md` section 11 rather
  than asserted as fact.

<!-- TODO before submission: the "What we did" column is our defence that AI
     assisted rather than authored. Both of us should read it and correct
     anything that overstates the AI's part or understates ours. -->
