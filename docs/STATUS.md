# Where we are, and what is left

If you are picking this up cold: the first section is what already runs, the
second is what is left, in the order we intend to do it. Each item says where to
start and what finished looks like.

---

## What works, verified

**A sentence becomes an object in a Roblox account, and an agent pays for every
step of it.** Both halves run.

```bash
python services/crafter.py          # the crafter,  :8000
node services/paywall/server.mjs    # the paywall,  :4402
node services/agent/server.mjs      # the agent,    :4403
cd web && npm run dev               # the site; Next prints the port
```

### The pipeline

| Piece | Measured |
|---|---|
| Sentence to recipe | 3–48s on Gemini's free tier, median ~17s, ~2400 tokens |
| Validator | rejects invented shapes, missing sizes and wrong units; repairs the rest with a note |
| Blender crafts it | ~7s, 250–750 triangles |
| Native Roblox parts | exact studs, exact colours, no mesh upload |
| Publish to Roblox | `.rbxmx` accepted by Open Cloud, moderation approved in ~3s |
| The site | prompt, progress, preview, orbit, publish |
| Connect a Roblox account | the key stays in the browser, never on our disk |
| Deployed | https://voxel-bench-psi.vercel.app |

### The economy

Three contracts on Hedera testnet, 29 tests including three fuzz, each verified
against the live chain rather than only locally.

| Contract | Address |
|---|---|
| `RecipeBook` | `0x58e6af2A5FEfb42d58Bd63aBc87fdA04aEddD9A5` |
| `SplitVault` | `0x95DC0868731Ea10b457d7b937217c2Ed3Da6623C` |
| `Allowance` | `0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C` |

Three crafts settled with the 90/10 split exact and `RecipeBook` holding
nothing. The agent drew 0.05 HBAR from `Allowance` and was refused 10.

### The payments

Three x402-gated stages at three prices, paid on Hedera testnet and confirmed on
the ledger: `+100000`, `+500000` and `+1000000` tinybars landed in the service
account in the order the agent consumed them. The transfers show the facilitator
as sender — the agent signs partially, the facilitator co-signs and covers gas,
so the agent needs an account but never needs gas.

`/services` advertises what is on offer and what it costs, unpriced, since an
agent has to read the menu before it can decide to buy.

**The site pays through the agent, and shows it.** Typing a sentence in the
browser lists the stages and their prices before any of them is paid for, then
moves each one quoted → paying → paid with its transaction id linked to
HashScan. One story rather than two: there is no longer a free path in the
browser and a paid one in a terminal.

The wallet stays on the machine that runs Blender. The browser never sees a
private key and never signs anything — it watches an agent spend its own money,
which is the only arrangement that is both honest and safe to put on a public
site.

### The names

`voxelbench.eth` on the ENSv2 beta on Sepolia, with its children answered by a
registry we deployed rather than by the shared one.

| Contract | Address |
|---|---|
| our registry | `0x49d8963F8098840b0457aFedDe23bD68AEC46EB0` |
| our resolver | `0x6A64e52852906E9a2452c8eD4ac2cb5d11F47DA3` |

The agent resolves `recipe.voxelbench.eth`, `craft.voxelbench.eth` and
`publish.voxelbench.eth` at startup — 1.0s for fifteen records — and reads the
endpoint, price, asset, network and payee from each. Then on every 402 it
compares what the service asks against what the name says, and refuses to sign
when they disagree. Verified by raising the paywall's price to nine times the
name's:

```
did not pay — recipe asks 900000 but its name says 100000
```

Each service holds exactly one role on its own name: permission to write its own
`url`, so it can move hosts. `x402:price` belongs to the operator, so a service
cannot make the two numbers agree. `Allowance` stops the agent overspending;
this stops a service overcharging.

If Sepolia is unreachable the agent says so on the page and falls back to the
configured endpoint, where it has only its own cap and no second price to check
against. Enough to craft on a fresh clone; not the arrangement being built.

### Where it runs

Blender cannot run on Vercel, so the site and the crafter are separate: the site
on Vercel, the crafter on a real machine. That is the same split x402 asks for
anyway. The crafter is offline most of the time and the site says so rather than
breaking.

---

## What is left

### 1. USDC instead of HBAR · Circle / Arc · next

The cheapest of the three, because the wiring already exists: the paywall offers
both assets and the agent can pay either. What is missing is testnet USDC from
`faucet.circle.com` and the token association Hedera requires before an account
can receive a non-native token.

**Done looks like** the same demo settling in USDC, which makes one
implementation serve two tracks.

### 2. The recipe marketplace · Track B

The interface to `RecipeBook`: real recipes, their authors, how often each was
crafted and what it earned, read from the chain rather than mocked. The card in
the "Why onchain" section of `page.tsx` is the shape it should take.

It also fixes latency, which is the interesting part: a recipe that already
exists needs no model call, so it crafts instantly and its author is paid. The
platform gets faster as it gets more recipes.

### 3. The recipe library · [docs/RECIPE_LIBRARY.md](RECIPE_LIBRARY.md)

Stefan's. Good recipes give the model better work to imitate, make anything in
the library instant, and give the marketplace something to show.

### 4. Contract audit · [docs/CONTRACT_AUDIT.md](CONTRACT_AUDIT.md)

Also Stefan's, and independent of everything else — the contracts are finished,
so this can happen any time.

### 5. Roblox materials

Every part has a `Material` property — `Wood`, `Metal`, `Slate`. Real surface
texture with no image, no upload, no UV mapping: one more field in the recipe,
and the largest visible gain available for the effort.

The catch: the Blender preview will not show it, and a preview that promises
what the result does not deliver undoes the point of having one. So approximate
it in Blender too — map each material to a roughness and a little relief.

**Start at** `bench/to_rbxmx.py` and the schema in `bench/describe.py`. Check the
enum values by asking Studio through the MCP rather than trusting a list.

### 6. Luau scripts on objects

A crate that sits there is decoration; a crate that gives you coins when touched
is a mechanic. Generating Luau is the easy part of this project — well
documented, and unlike geometry it either runs or throws.

**Worth checking first:** Roblox moderates models containing scripts. If that
takes hours rather than seconds, scripts stay out of a live demo.

### 7. The obby — the wow, and the first thing to cut

A sequence of platforms, hazards, checkpoints and a finish is spatial
arrangement of objects. An obby is a recipe of recipes: nothing new to invent,
just scale. The model chooses the parameters and the palette; code does the
placing.

Needs `universe-places` on the API key, which is editable on the existing one.

**Cut this first if anything slips.** `PLAN.md` section 10 has the demo built so
losing it shortens the video rather than breaking it.

### 8. The video

Two to four minutes, narrated by one of us — the rules reject AI voiceover,
text-to-speech and phone recordings. Structure and fallbacks in `PLAN.md`
section 10. Recording takes longer than anyone plans for.

---

## Prizes

Three at submission, chosen: **Hedera**, **ENS**, **Circle / Arc**.

Ledger was second until its tooling turned out to need a physical device;
`docs/ONCHAIN.md` 3.2b has the reasoning and the counter-argument.

Not chasing 1inch, Uniswap or Chainlink — no honest fit, and reaching for one to
collect a logo is visible.

---

## Things that will bite you

All of these cost time once already. `docs/LOG.md` has them in full.

- **A 403 from Roblox is the API key's IP allowlist**, and the message never
  says so.
- **FBX arrives 100x too large and colourless.** The native-parts path exists
  for this reason.
- **A negative part size is not rejected** — Roblox clamps it to 0.001, so the
  part is there, the right colour, and invisible.
- **A Roblox model without a `PrimaryPart`** borrows a pivot orientation from
  its bounding box, so moving it tilts everything.
- **Four `MeshType` values are listed and never drawn** — `Pyramid`, `Prism`,
  `ParallelRamp`, `RightAngleRamp`. They accept the assignment and render
  nothing. Check a shape in Studio before building on it.
- **Blender resolves a relative render path against its own base**, not the
  working directory, and writes the preview somewhere else entirely.
- **On Hedera, `msg.value` is in tinybars** while `getBalance` answers in wei.
  Ten orders of magnitude apart in the same session.
- **An unanchored `out/` or `artifacts/` in a gitignore** matches that directory
  at any depth. This has caught us three times.
- **Never enable `VOXEL_ALLOW_SERVER_KEY` on a public bench.** It lets anyone
  reaching the endpoint publish into the operator's Roblox account.
