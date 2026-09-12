# Where we are, and what is left

If you are picking this up cold: the first section is what already runs, the
second is what is left, in the order we intend to do it. Each item says where to
start and what finished looks like.

---

## What works, verified

**A sentence becomes an object in a Roblox account, and an agent pays for every
step of it.** Both halves run.

```bash
python services/crafter.py             # the crafter,     :8000
node services/paywall/server.mjs       # the paywall,     :4402
node services/agent/server.mjs         # the agent,       :4403
node services/facilitator/server.mjs   # the facilitator, :4404
cd web && npm run dev                  # the site; Next prints the port
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
| The sample it shows | `sakura_garden` — 4,408 ingredients, 87,084 triangles, 70 studs across |
| Connect a Roblox account | the key stays in the browser, never on our disk |
| Deployed | https://voxel-bench-psi.vercel.app |

### The economy

Three contracts on Hedera testnet, 29 tests including three fuzz, each verified
against the live chain rather than only locally.

| Contract | Hedera testnet | Arc testnet |
|---|---|---|
| `RecipeBook` | `0x333EdFE67b0e1dcEda52CA5D483B6dd54A102e1E` | `0xe0C3Bd1b9dD6ee6606C6780dc1979855556bb396` |
| `SplitVault` | `0xBaE7C31f9080733DB1Cd18Ed99b5d70fF65406DE` | `0x870771ecaaf8c059354145B7A0cC5D4Da2A4b721` |
| `Allowance` | `0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C` | — |

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

### Two chains, chosen by a name

The same contracts are deployed on Arc testnet, where USDC is the native token,
so the split is denominated in dollars. Same bytecode, same addresses, same
9000 bps — nothing in them names an asset.

```
Arc Testnet
  crafting, paying 1 USDC...
  author earned    0.9 USDC     author's share  9000 bps
```

On Arc the craft stage is paid through **Circle Gateway (Nanopayments)**: the
agent signs against a balance it holds in Gateway, and Circle settles the
payments in batches. Behind it, `services/facilitator` — the same three
endpoints over `@x402/evm` — settles a direct EIP-3009 transfer from the payer's
wallet, as the fallback (`VOXEL_ARC_SETTLEMENT=own`). It runs on its own account
rather than the agent's, so a receipt shows what the arrangement claims:

```
transaction from   0x1a307ae7…   the facilitator, which paid the gas
agent              paid the price and nothing else
```

Which chain a service settles on is a record on its name. `craft.voxelbench.eth`
is on Arc while its two siblings are on Hedera:

```
recipe   hedera:testnet   100000   0.0.10432254
craft    eip155:5042002     5000   0x1083740075CB…
publish  hedera:testnet  1000000   0.0.10432254
```

`contracts/scripts/ens/05-move-chain.mjs` moves one either way. Nothing is
redeployed and nothing restarts — the agent finds it on its next run.

### Recipes have owners, and owners get paid

Every craft is recorded against `RecipeBook`. A recipe nobody has seen is
published and gains an owner; one that already has an owner is crafted against,
and the split pays them 90%.

A recipe's id is the hash of its content, not its name, so the same recipe is
the same recipe whoever writes it and renaming one does not make it new. Only
the agent computes it, in JavaScript: Python has no keccak in its standard
library, and two languages agreeing on how to print a float is a coin toss.

The marketplace card reads that back from the chain — id, owner, craft count,
earnings — and carries the contract address so an author can check it against a
node rather than against us.

Verified with an owner who is not us: a fresh account published a recipe, we
crafted against it, `SplitVault` credited them 0.9 of 1 USDC, and they withdrew
it.

That account needed gas once, to send its own `publish`, and `publishFor`
removes even that. An author signs an EIP-712 message naming the recipe and
themselves, anyone relays it, and `RecipeBook` credits the signer. The
signature is bound to the contract and the chain, so it cannot be replayed
elsewhere, and it needs no nonce because a recipe publishes once. A relayer who
substitutes their own address produces a signature that does not recover.

So owning what you made costs nothing and requires no funded account, which is
the property the rest of the project is built on.

Verified from a browser, with MetaMask and Phantom installed side by side: a
tank crafted, the claim signed as a message — no gas, no transaction — and the
agent relaying it. `RecipeBook` on Arc records the signer as the author:

```
publishFor   0x9c862484…2cba2bb   success
author       0xd7ed1a1F…6C0e      read back from the contract
relayer      0xfe3caAd6…0034      paid the gas
```

[The transaction on Arcscan](https://testnet.arcscan.app/tx/0x9c862484dc2407d1f2c443c165bb0565d1ce09d784910b32f2c199afd2cba2bb).

**Without a wallet at all.** With `NEXT_PUBLIC_PRIVY_APP_ID` set, the header
offers Sign in: an email, a Google or an X account, and Privy makes a wallet for
anyone who arrives without one. Someone who has a wallet picks it in the same
dialog. Without the variable the page offers browser extensions, as above.

Verified by signing in with Google, crafting a pine tree and claiming it. The
wallet Privy made owns the recipe, holds nothing, and has never sent a
transaction:

```
publishFor       0xd5629e8b…29ddf0   success
author           0x2A46687a…1173     read back from the contract
author balance   0 USDC
author tx count  0
```

[The transaction on Arcscan](https://testnet.arcscan.app/tx/0xd5629e8be5defb1c0db8039898893c5d8601f20417f17542d9d33931f429ddf0).

### A backpack of what you own

Signed in, the header offers Backpack: every recipe the address owns, with its
name, preview, chain, craft count and earnings. Ownership is read from the
chains; names and previews come from a catalog in Supabase, filed under the id
of each recipe and checked against it. 34 recipes are in the catalog. The site
needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
the agent files new crafts with `SUPABASE_SERVICE_ROLE_KEY`.

### A marketplace, stocked by the platform

The header offers Marketplace: every recipe on both chains that can be
crafted, with its preview, author and earnings. The platform publishes recipes of its own under its own
address, like any author: 47 are on Arc, from the recipe library and from the
bench. Get it crafts a recipe for you from the catalog, with no model asked,
and `RecipeBook` pays its author; the backpack lists it under Collected.
Verified with a platform recipe: only the craft stage was paid, the author was
credited, and the copy appeared in the backpack of the address that asked.

Who collected what is noted by the agent, because the chain sees the agent
crafting. The person's own payment for it — a transfer from their budget in the
same job — is on the chain beside it.

### The spending cap is the brake, not a note about one

Every craft begins by drawing what it is about to spend out of an `Allowance`
contract. When the window's cap is used up the draw reverts and the craft does
not happen — the refusal comes from the chain rather than from a check of ours
that the same process could skip.

Demonstrated by lowering the cap below what had been drawn:

```
the spending cap is used up — asked for 0.001 HBAR, 0 HBAR left in this window
```

One cap per chain, because a cap is a number in a currency:

| | Address | Cap |
|---|---|---|
| Hedera | `0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C` | 1 HBAR / day |
| Arc | `0xcc8936bC21B8a521314740B21F300cdF7c0Ca627` | 1 USDC / day |

The bench shows both as bars, with the contract addresses linked, because a
limit nobody can check has the same shape as a promise.

**What it does not bound.** The agent has its own balance on both chains, so
today the cap limits what it draws rather than everything it could possibly
spend. In a deployment the agent's account would be funded only from the
allowance, and then the two are the same number. `docs/MAINNET.md` has it.

### Half of it works with the bench switched off

Blender needs a machine, and that machine is a laptop that is usually closed.
The contracts do not: a deployment reads them as well as anything else can.

So the marketplace and the spending caps are read from the chains by the site
itself rather than proxied through the agent. Someone opening the deployed URL
with nobody's laptop awake still sees which recipes exist, who owns them, what
they earned, and what the agent may still spend.

```
0x2bf0ce56…  Hedera Testnet  0xfe3caAd687…  1 craft,  0.9 HBAR
0x2bf0ce56…  Arc Testnet     0xfe3caAd687…  1 craft,  0.9 USDC
0x977447dd…  Arc Testnet     0x32Ed131b63…  0 crafts, 0 USDC
0x9ef2dd6d…  Arc Testnet     0x29A64Af80A…  0 crafts, 0 USDC
```

The same recipe on two chains earning in two currencies, and two owned by
addresses that are not ours — the ones claimed by accounts holding nothing, by
signing.

### Each person pays from a budget of their own

Signed in, a visitor gives their agent a budget: a limit in USDC on Arc, set by
signing an EIP-2612 permit — no gas, no transaction from them. Every job then
takes what it costs from that budget in one transfer before any work is paid
for, and a job that fails gives it back. The USDC contract is the brake: past
the limit the agent is refused, whoever asks. Nobody signed in crafts nothing.
On testnet a new account is sent 0.10 USDC once, so it can try it.

The agent still pays the services and the authors itself; what changed is whose
money it is. Who pays what, on which chain: [PAYMENT_FLOW.md](PAYMENT_FLOW.md).

Each stage in the ledger opens into its steps — the 402, the check against the
name, the signature, the settlement — and a guide walks a first visitor through
budget, describe, claim, backpack, obby and publish.

### An obby, built from recipes

"Build an obby" on the bench takes 2 to 12 recipes from your backpack or the
marketplace, in the order a player runs them, and the agent crafts them into one
course — no model is asked. Pieces you do not have yet are got along the way:
each author is paid once on `RecipeBook` and the piece goes into your backpack.
Pieces you wrote or already got are not paid for again.

The course floats, climbing and dropping between jumps a character can make,
with the hazards below the jumps. Each piece is a model named for its role, and
one script in the course gives the roles their behaviour: you spawn on the
start, hazards and falling send you back, moving platforms swing and carry you,
and the finish shows your time. Played through in Studio, start to finish.
Measured in `LOG.md`.

Published through Open Cloud with its script inside and the render set as its
icon. Opened in Studio from the Creator Hub, it plays.

### Where it runs

Blender cannot run on Vercel, so the site and the crafter are separate: the site
on Vercel, the crafter on a real machine. That is the same split x402 asks for
anyway. The crafter is offline most of the time and the site says so rather than
breaking.

---

## What is left

### 1. The recipe library · [docs/RECIPE_LIBRARY.md](RECIPE_LIBRARY.md)

Stefan's. Good recipes give the model better work to imitate, make anything in
the library instant, and give the marketplace something to show.

### 2. Contract audit · [docs/CONTRACT_AUDIT.md](CONTRACT_AUDIT.md)

Also Stefan's, and independent of everything else — the contracts are finished,
so this can happen any time.

### 3. Roblox materials

Every part has a `Material` property — `Wood`, `Metal`, `Slate`. Real surface
texture with no image, no upload, no UV mapping: one more field in the recipe,
and the largest visible gain available for the effort.

The catch: the Blender preview will not show it, and a preview that promises
what the result does not deliver undoes the point of having one. So approximate
it in Blender too — map each material to a roughness and a little relief.

**Start at** `bench/to_rbxmx.py` and the schema in `bench/describe.py`. Check the
enum values by asking Studio through the MCP rather than trusting a list.

### 4. Luau scripts on objects

A crate that sits there is decoration; a crate that gives you coins when touched
is a mechanic. Generating Luau is the easy part of this project — well
documented, and unlike geometry it either runs or throws.

The obby already ships one: `bench/obby_runtime.lua`, written into the course
model by `bench/to_rbxmx.py`. It runs when the model is dropped into Studio, and
a course with it inside has been published through Open Cloud. What is left is
scripts on single objects.

### 5. The video

Two to four minutes, narrated by one of us — the rules reject AI voiceover,
text-to-speech and phone recordings. Structure and fallbacks in `PLAN.md`
section 10. Recording takes longer than anyone plans for.

---

## Beyond the hackathon

[docs/MAINNET.md](MAINNET.md) is the road from testnet to a deployment that
holds real balances: what carries over unchanged, what has to change, and the
one item still unknown. Not current work, and not scheduled — written so the
answer exists when someone asks for it.

---

## Prizes

Three at submission, chosen: **Hedera**, **ENS**, **Circle / Arc**.

Not chasing 1inch, Uniswap or Chainlink — no honest fit, and reaching for one
to collect a logo is visible. Ledger was priority two until its tooling turned
out to want a physical device; `docs/ONCHAIN.md` 3.4 has the short version.

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
