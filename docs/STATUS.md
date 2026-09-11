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

The public x402 facilitator serves nine networks and Arc is not one, so
`services/facilitator` is ours: the same three endpoints over `@x402/evm`, whose
exact scheme covers any EVM chain. It runs on its own account rather than the
agent's, so a receipt shows what the arrangement claims:

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

### Where it runs

Blender cannot run on Vercel, so the site and the crafter are separate: the site
on Vercel, the crafter on a real machine. That is the same split x402 asks for
anyway. The crafter is offline most of the time and the site says so rather than
breaking.

---

## What is left

### 1. Claiming a recipe from a browser · next

The contract, the agent and the page are all in place: connect a wallet, craft,
press claim, sign the message the agent hands you, and the agent relays it and
pays the gas. Every part has been exercised except the one that needs a person —
a real wallet extension producing a real signature.

**Done looks like** connecting once, crafting, signing a message rather than a
transaction, and the recipe appearing under your own address in the
marketplace.

### 2. The recipe library · [docs/RECIPE_LIBRARY.md](RECIPE_LIBRARY.md)

Stefan's. Good recipes give the model better work to imitate, make anything in
the library instant, and give the marketplace something to show.

### 3. Contract audit · [docs/CONTRACT_AUDIT.md](CONTRACT_AUDIT.md)

Also Stefan's, and independent of everything else — the contracts are finished,
so this can happen any time.

### 4. Roblox materials

Every part has a `Material` property — `Wood`, `Metal`, `Slate`. Real surface
texture with no image, no upload, no UV mapping: one more field in the recipe,
and the largest visible gain available for the effort.

The catch: the Blender preview will not show it, and a preview that promises
what the result does not deliver undoes the point of having one. So approximate
it in Blender too — map each material to a roughness and a little relief.

**Start at** `bench/to_rbxmx.py` and the schema in `bench/describe.py`. Check the
enum values by asking Studio through the MCP rather than trusting a list.

### 5. Luau scripts on objects

A crate that sits there is decoration; a crate that gives you coins when touched
is a mechanic. Generating Luau is the easy part of this project — well
documented, and unlike geometry it either runs or throws.

**Worth checking first:** Roblox moderates models containing scripts. If that
takes hours rather than seconds, scripts stay out of a live demo.

### 6. The obby — the wow, and the first thing to cut

A sequence of platforms, hazards, checkpoints and a finish is spatial
arrangement of objects. An obby is a recipe of recipes: nothing new to invent,
just scale. The model chooses the parameters and the palette; code does the
placing.

Needs `universe-places` on the API key, which is editable on the existing one.

**Cut this first if anything slips.** `PLAN.md` section 10 has the demo built so
losing it shortens the video rather than breaking it.

### 7. The video

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
