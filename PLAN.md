# Voxel Bench — plan

ETHOnline 2026 · Classic track (from scratch) · submission Sun 13 Sep, 12:00 EDT
Team of 2.

Written in English so both of us and any judge can read it.

---

## 1. What it is

Roblox is a gaming platform with a marketplace built into it: anyone can publish
a game, and creators monetise inside the platform.

Producing a game there means producing hundreds of 3D objects — crates, lamp
posts, furniture, market stalls. Each one is modelled by hand. A 3D artist costs
money and takes days. That is the bottleneck.

**Voxel Bench crafts those objects on demand.** You type "a wooden market stall"
and seconds later the object is built and uploaded to Roblox, ready to use.

The economics, in three points:

1. **Creators keep their game revenue in full.** We charge for crafting, not for
   what the game earns.
2. **Payment is in stablecoins, for a practical reason.** Roblox creators are
   worldwide and many are young and unbanked. Charging two cents to someone in
   Manila is possible onchain and uneconomic through card rails, where the fee
   exceeds the charge.
3. **Recipes earn.** Every object is crafted from a reusable recipe. If forty
   people craft with your recipe, you are paid on each craft, split onchain.
   The accounting is public, so nobody has to trust ours.

Crafting is done by an agent holding its own wallet under a spending cap it
cannot raise itself.

### Vocabulary

One word per concept, everywhere — contract, API, UI and pitch:

| Word | Means |
|---|---|
| **recipe** | the reusable JSON description of an object |
| **ingredients** | the primitives a recipe is composed of |
| **craft** | the verb: run a recipe, pay, get an asset |
| **crafter** | someone who crafts with a recipe |
| **author** | whoever wrote the recipe, and earns from it |
| **RecipeBook** | the contract holding recipes, authors and splits |

A judge who reads the contract should recognise the words they just saw on
screen.

---

## 2. What we deliberately do not do

**We never touch Roblox in-game revenue.** Roblox prohibits blockchain
integrations and off-platform monetisation, and all game earnings must flow
through Robux/DevEx. Any design that routes Roblox revenue onchain is both
against their rules and unoperable after the hackathon.

Everything onchain is *our own* economy: crafting fees, publishing fees and
recipe royalties. Roblox is an export target, not the platform.

The pipeline also emits GLB, so nothing here is Roblox-only.

---

## 3. The flow

Nothing is installed by the user. No Blender, no Studio, no Python.

```
   USER'S BROWSER                 |        OUR SERVER
                                  |
1. writes the prompt -------------+--> 2. LLM -> recipe JSON (ingredients, studs)
                                  |           |
                                  |           v
5. sees the preview <-------------+--- 3. headless Blender crafts it (~7s)
   approve?                       |           |  FBX + GLB + preview.png
        |                         |           v
        +- yes -------------------+--> 4. validate: polycount, size, scale
                                  |           |
                                  |           v
7. gets the assetId <-------------+--- 6. Open Cloud upload -> assetId
```

Blender runs headless on our server. The user never sees it.

Roblox Studio appears in exactly one place and it is optional: opening the
Toolbox to drag the finished asset into a game. That step is Roblox's normal
workflow, not something we invented.

### The preview gate

The user sees the render **before** anything is uploaded. If they don't like it,
they craft again.

This is also the pricing design: **previewing costs cents, publishing costs
more.** Nobody pays to publish something they haven't seen. It turns the x402
metering from a technical detail into something a user understands immediately.

---

## 4. The interface is a crafting bench

Not decoration — the metaphor is already the product, and it does real work.

| Crafting bench | What it actually is |
|---|---|
| ingredient slots | the components of the recipe |
| the recipe | the reusable JSON that defines the object |
| the craft button | the x402 payment |
| the output slot | where the preview render appears |
| "recipe by @someone" | the royalty split, made visible |

That last row is why this matters. **A bench that shows whose recipe you are
using and what they earn from it explains the entire economic model without a
line of narration.** In a three-minute video, that is worth more than a slide.

**Scaffolded Monday**, ahead of the original plan, because with two people Track
B does not have to wait on Track A. Next.js + TypeScript + Tailwind is up, with
the crafted object already viewable in the browser.

The standing constraint is on *polish*, not on existence: a beautiful interface
is exactly the thing that eats a whole week, and if there is no real `assetId`
by Tuesday there is nothing worth decorating. Track B builds structure first and
finishes it Friday.

Palette: warm grey ground under an amber accent. A saturated brown floor reads
as a tavern rather than a workshop, so the warmth lives in the accent and the
off-white text instead. The Blender preview render shares the same background
colour so the two panels read as one room.

---

## 5. Decisions made, and why

| Decision | Why |
|---|---|
| **Parametric ingredients, not text-to-mesh** | Composing primitives with modifiers is far more reliable than generating geometry freehand. The output has to be demoable on command, and reliability beats range. |
| **One orchestrator agent, not a swarm** | Multi-agent negotiation is decoration here. What makes the project interesting is that the *tools charge*, and that works identically with one agent. Less code, same story, more reliable demo. |
| **One chain (Hedera), not three** | Five days buys one integration done well or five done badly. Arc/Circle is the stretch, not the plan. |
| **Users bring their own Roblox API key** | The asset lands in *their* account. Clean ownership, no single point of moderation failure, and no judge can point at "every asset in the world lives in one account". |
| **Small model for recipe generation** | Turning a prompt into constrained JSON is a cheap task. Putting a frontier model there destroys the unit economics, and unit economics *are* the business model. Everything goes behind one `llm.complete()` interface so the provider is swappable. |
| **Recipes measured in studs, not metres** | 1 stud is about 0.28 m and a character is ~5 studs tall. One unit system end to end, no hidden conversions. |
| **Named Voxel Bench** | `forge`, `anvil`, `cast` and `chisel` are Foundry's tools and every Ethereum dev types them daily. `Blockbench` is an existing 3D editor serving exactly this audience. "Craft" outside Minecraft reads as arts-and-crafts. "Voxel" is unambiguously 3D; "bench" is the workbench. |

### On holding user API keys

Users bringing their own key means we store other people's secrets, which makes
us a target. Minimum bar for the week: encrypted at rest, `assets` scope only,
never logged, never committed.

Roblox API keys carry an IP allowlist, which turns from an annoyance into a
feature here: the user allowlists *our server*, so the key is useless anywhere
else even if it leaks.

---

## 6. Prizes we are aiming at

Maximum 3 partner prizes per submission.

| Priority | Track | Why we fit |
|---|---|---|
| **1** | **Hedera — AI & Agentic Payments** ($6k, up to 3 teams @ $2k) | Asks literally for x402-gated services that agents discover and pay for without API keys. That is our architecture verbatim. |
| **2** | **Ledger — AI Agents x Ledger** ($3.5k, pays 3) | Scoped secrets, spending caps, human-in-the-loop. Holding user keys hands us this problem; solving it well is the track. |
| **3** | **Circle / Arc — Agentic Economy** ($1.7k) + Launch on Arc ($3.5k) | USDC subscription and agent-held wallets. Only if Friday has room. |

Backup if one falls through: **ENS — Best Use of ENSv2** ($4.5k, pays 4), agent
identity via subnames. Cheap to add, large pool, first thing to cut.

Not chasing: 1inch, Uniswap, Chainlink. No honest fit and forcing it shows.

### The pitch angle worth keeping

GPT-6 Astra's system card (3 Sep 2026) reports substantially decreased
chain-of-thought monitorability and, under adversarial conditions, monitor
evasion. Meanwhile we are handing agents wallets.

> Agentic payments are here, and the frontier labs' own system cards say seeing
> what these models are thinking is getting harder. So our agent's spending cap
> does not live in the prompt. It lives onchain, where the model cannot talk it
> out of anything.

True, on-topic, and it scores originality and WOW.

---

## 7. Schedule

We are two people, so this runs as two tracks in parallel from Tuesday. An
earlier version of this plan had the UI starting Thursday; that was written for
one person and was wrong. The Thursday constraint applies to *polishing* the
bench, not to scaffolding it.

**Track A — pipeline, chain, agent.** **Track B — frontend and wallet.**

| Day | Track A | Track B |
|---|---|---|
| **Mon 7** (done) | Crafter working: recipe to FBX/GLB/preview, headless, ~7s. Studs conversion. Uploader written, untested. | Site scaffolded early: Next.js 16 + TS + Tailwind 4, crafted GLB orbitable in the browser, landing copy done |
| **Tue 8** | **First real upload, real assetId.** Verify in Studio against a character. | Scaffold Next.js + TS + Tailwind (done Mon), wallet connect working |
| **Wed 9** | `RecipeBook` + splits contract on Hedera testnet. Orchestrator wallet. Luau scripts on objects via `.rbxmx`. | Bench layout: slots, recipe panel, output slot. Static data is fine. |
| **Thu 10** | x402 gating. Agent pays per craft. Spending cap onchain. | Wire the bench to the real API: prompt in, preview out |
| **Fri 11** | The obby: place assembly and publish. Cut this first if anything slipped. | Recipe marketplace view, the "recipe by @author" line, wallet state |
| **Sat 12** | **Freeze code at midday.** Record the video. README, AI_USAGE, FEEDBACK. | Same |
| **Sun 13** | Submit in the morning. Deadline is 12:00 EDT — not 11:50. | — |

The landing page *is* the bench. No separate marketing site: a "Launch App"
button costs fifteen seconds of a three-minute video and scores nothing.

### Stack

Next.js + TypeScript + Tailwind, `wagmi` + `viem` for chain calls, RainbowKit or
ConnectKit for the connect button, plus the x402 SDK. Backend stays Python with
FastAPI, because Blender only speaks Python — `bpy` has no alternative. Starter
kits are explicitly allowed by the rules; prior project code is not.

### Decision points, and what we do if they fail

| Point | If it works | If it fails |
|---|---|---|
| **Tue: Roblox accepts the FBX** | Continue as planned | Retry as GLB. If that also fails, Roblox becomes optional: the three.js viewer is the primary output and the pitch becomes an engine-agnostic asset factory. The onchain half is untouched either way. |
| **Wed: contract deploys to Hedera testnet** | Continue | Deploy to any EVM testnet and drop the Hedera prize; keep x402 as the story |
| **Thu: x402 gating works end to end** | Continue | Gate one service instead of three, and demo that one honestly |
| **Fri: stretches** | Bonus prize | Drop without hesitation. They are labelled stretch for a reason. |

Nothing in the left column is load-bearing for the project as a whole. Every
failure has a version of the demo that still runs.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **Agentic Blender produces junk** | Narrow domain, parametric composition, not freehand geometry. The preview gate means the user never publishes something they haven't seen. |
| **Roblox API rejects the FBX, or is down during the demo** | The pipeline already emits GLB. A three.js web viewer is the parallel output. If Roblox fails on Saturday, the demo still runs. |
| **Three integrations, all shallow** | One chain with one clear job. Arc and ENS are explicitly cuttable. |
| **We hold user secrets and leak one** | Encrypted at rest, `assets` scope only, IP-allowlisted to our server, never logged. |
| **The bench UI eats the week** | It does not start before Thursday, and it is CSS-heavy by design. |

---

## 9. The product, in three stages

The claim we make, and it is deliberately bounded:

> **You can build a playable Roblox game from this platform, within the genres
> we support, and refine it in Studio.**

"Any game" would be a lie, and any judge who knows Roblox spots it in the first
thirty seconds. A bounded claim we can demonstrate is worth more than a big one
we cannot.

### Stage 1 — Objects (done)

Prompt to `assetId`. A recipe of ingredients, crafted headless, uploaded through
Open Cloud into the user's own account.

### Stage 2 — Objects that do something, and a marketplace for recipes

**Scripts.** A crate that does nothing is decoration; a crate that gives you
coins when touched is a game mechanic. Generating Luau is the *easy* part of
this project — it is a well-documented Lua dialect, models write it well, and
unlike geometry it either runs or throws. Delivery is a `.rbxmx` (XML) holding
the MeshPart plus a Script child; the Assets API already accepts `.rbxm`.

Caveat to test rather than assume: Roblox moderates models containing scripts,
and with reason — malicious free models are a real history on that platform.
Expect delays or rejections.

**The recipe marketplace.** This is not a new system, it is the interface to the
`RecipeBook` contract we are building anyway. Publish a recipe, others craft
with it, you earn per craft.

It also fixes a real product problem: if every user starts from nothing, the
model reinvents everything each time. Shared recipes mean **the platform gets
better as it is used**. That is the argument for why this is a platform and not
a script.

### Stage 3 — A whole game, one genre at a time

"A game" is an infinite space and models get lost in it. But Roblox games
cluster into genres with known structure: obby, tycoon, simulator, tower
defence, showcase.

An **obby** is a sequence of platforms, hazards between them, checkpoints and a
finish. That is spatial arrangement of objects — exactly what recipes already
do. **An obby is a recipe of recipes.** Ingredients to object to place, same
metaphor, nothing new invented.

The chain, and which links are actually hard:

| Piece | Difficulty | Why |
|---|---|---|
| Objects | medium | done |
| Luau scripts | **easy** | well-documented, models write it well, and it either runs or errors |
| Assembling a place | medium | `.rbxlx` is readable XML and can be generated; Rojo is the standard scriptable path |
| Publishing the place | low | Open Cloud updates an existing place from an uploaded file |

The counterintuitive part is that generating code is *more* reliable than
generating geometry. A script runs or it doesn't. A mesh can "work" and look
terrible.

### Later

- **Avatar skins.** Better business than props — props are used by the builder,
  skins are bought by the player. Blocked by cage meshes for layered clothing,
  probable lack of headless upload for avatar items, and per-item Robux fees
  plus ID verification. 2D classic clothing is the cheap first step: an image on
  a UV template, not a mesh, reusing the same pipeline.
- **"Connect with Roblox" via OAuth**, replacing pasted API keys.
- **Other engines.** The GLB path already exists.

---

## 10. The demo video, built to survive cuts

Three minutes, and the pieces most likely to be cut are at the end on purpose.
If Friday goes badly the video is shorter, not broken.

| Time | Beat | Depends on |
|---|---|---|
| 0:00–0:20 | The problem: a game needs hundreds of objects, each modelled by hand | nothing |
| 0:20–1:00 | Prompt, craft, preview, publish. A real `assetId` in a real account | **Tuesday** |
| 1:00–1:40 | The agent pays per craft. Spending cap lives onchain, not in the prompt | Wednesday, Thursday |
| 1:40–2:20 | The marketplace: this recipe is someone else's, and they earn from it | Wednesday |
| 2:20–2:50 | **The wow: here is an obby built from these recipes. Click it. Play it.** | Friday, first to cut |
| 2:50–3:00 | The bounded claim, and what comes next | nothing |

Cut the obby and beats 1 to 4 still make a complete two-and-a-half minute video
that demonstrates everything the prizes ask for. The obby is the ending we want,
not the ending we need.

**Requirement, not optional:** the video is narrated by one of us. The rules
reject AI voiceover, text-to-speech, phone recordings, and anything outside the
2 to 4 minute window.

---

## 11. Open questions — verify before they reach the pitch

- [ ] Does Open Cloud accept classic 2D clothing (Shirt/Pants/TShirt) uploads,
      or only Decal? Determines whether the Friday stretch is real.
- [ ] Does Roblox OAuth 2.0 for Open Cloud require app registration/approval?
      Determines how honest the roadmap slide can be.
- [ ] Current Roblox DevEx rate and minimum payout. Quoted in the pitch as "the
      creator keeps their earnings" — the numbers move and ours may be stale.
- [ ] GPT-6 Astra pricing and context window — not published on the page we read.
- [ ] Does Open Cloud publishing a place accept `.rbxlx`, or only binary
      `.rbxl`? Decides whether we can generate XML directly or need Rojo.
- [ ] How long does Roblox moderation take on a model containing a script?
      If it is hours rather than seconds, scripts cannot be in the live demo.
