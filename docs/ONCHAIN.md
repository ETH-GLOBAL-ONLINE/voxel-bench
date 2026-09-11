# How Voxel Bench uses the blockchain

Written so a judge can check our claims, and so we can check them on ourselves.
Nothing here is onchain for the sake of being onchain — each piece names the
problem it solves and what the non-blockchain alternative would have been.

---

## 1. The one-paragraph version

The crafter is an agent with its own wallet. Every step it takes — generating a
recipe, crafting the mesh, publishing to Roblox — is a service that charges it
per call over **x402**. The agent's spending limit is enforced by a contract,
not by a prompt. Recipes are registered in a **RecipeBook** contract with their
author, and when someone crafts with a recipe the fee splits automatically
between the platform and that author. No Roblox revenue is ever involved.

---

## 2. Three problems, and why a chain is the answer to each

### 2.1 Charging two cents to someone with no bank account

Our unit of sale is a single craft, which should cost cents. Roblox creators
skew young, so a card is frequently not theirs to use, and the platform's reach
is global enough that assuming any particular payment rail excludes a real share
of them.

Card rails cannot do this. A two-cent charge costs more than two cents to
process, before considering that the customer has no card. Subscriptions would
solve the payments problem by breaking the product: a minimum monthly fee prices
out exactly the person who wants to try one object.

Stablecoin micropayments are the only mechanism where the price can match the
unit of value delivered.

**Non-blockchain alternative considered:** prepaid credit packs bought by card.
Rejected — it reintroduces the card, the minimum purchase and the unbanked
problem, and it makes us hold customer balances.

### 2.2 Paying recipe authors without asking anyone to trust us

Recipes are reusable. If your market-stall recipe is good, other people craft
with it, and you should be paid each time.

The natural objection from an author is: *how do I know you are counting?*
Every creator marketplace has this problem and most answer it with "trust our
dashboard".

A `RecipeBook` contract answers it differently. The recipe, its author and its
split are onchain. Every craft settles against it. The author does not audit us;
they read the ledger.

**Non-blockchain alternative considered:** a payouts table in our database.
Rejected — it works, but it makes us the only party who can see the truth, which
is precisely the trust we are asking a stranger to extend before writing a
recipe for us.

**Where it stands.** Every craft on the site is recorded: a recipe nobody has
seen is published and gains an owner, one that already has an owner is crafted
against and the split pays them. The marketplace reads that back from the chain
and shows the contract address, so the claim above can be checked rather than
believed.

A recipe's id is the hash of its content rather than its name. The same recipe
is the same id whoever writes it, so a second publisher cannot take the first
one's authorship, and renaming a recipe does not make it new.

Tested with an owner who is not us. A fresh account published a recipe, we
crafted against it, and `SplitVault` credited them 0.9 of 1 USDC, which they
withdrew themselves:

```
authorOf -> 0xc25055Fa…          not our address
vault: author 0.9 | platform 1.1
author withdrew 0.89922956 USDC
```

The one step that needed gas was their `publish`. That is the remaining
friction, and the fix is in `STATUS.md`: a signature they give for free and we
relay, so ownership is theirs without them holding anything.

### 2.3 An agent with a wallet needs a limit it cannot argue with

The crafter spends money autonomously. That is the point of the architecture and
it is also the risk.

GPT-6 Astra's system card, published 3 September 2026, reports substantially
decreased chain-of-thought monitorability compared to previous models, and that
under adversarial conditions the model can evade internal monitors by
underperforming on purpose. Frontier labs are saying, in their own documents,
that watching what these models intend is getting harder — while the industry
hands them wallets.

So the spending cap is not an instruction. It is a contract-enforced allowance:
the agent's wallet cannot spend more than its cap in a window, regardless of
what it decides, and raising the cap requires a human signature.

A prepaid card, not your credit card.

**Non-blockchain alternative considered:** rate limits and budget checks in our
own backend. Rejected as insufficient on its own — that is a control the same
system operates, and it protects us but proves nothing to anyone else. We keep
it as defence in depth; the contract is what makes the guarantee legible.

---

## 3. Sponsor by sponsor

We may select at most three partner prizes at submission.

### 3.1 Hedera — AI & Agentic Payments (priority 1)

**The track asks for:** x402-gated services hosted on Hedera testnet or mainnet,
where agents discover and pay for services autonomously, without API keys.

**What we build:** the three stages of the pipeline are separate services, each
behind an x402 paywall:

| Service | What it does | Priced |
|---|---|---|
| `recipe` | prompt to recipe JSON | cheapest — it is one model call |
| `craft` | headless Blender, exports and preview render | mid — it is seven seconds of CPU |
| `publish` | Roblox Open Cloud upload | dearest — it consumes an external quota |

The orchestrator holds a wallet and pays each service per call. No shared
secrets between stages: the `craft` service cannot publish, and the `publish`
service never sees a prompt. Compromising one stage does not hand over the
others, which is the actual argument for paying rather than sharing keys.

This maps onto the product rather than being bolted on: **previewing costs
cents, publishing costs more**, so nobody pays to publish something they have
not seen.

### 3.2 ENS — Best Use of ENSv2 (priority 2)

**The track asks for:** ENSv2 on Sepolia using the hierarchical registry,
wildcard resolution, Enhanced Access Control or Permissioned Resolvers, and
explicitly encourages AI agent identity.

**What it fixes.** "The agent discovers services and pays for them" was true of
the paying and not of the discovering: the agent read `PAYWALL_URL` out of a
file and took each price from the 402 that asked for it. Both of those are the
service describing itself. A configuration file is not discovery.

**What is built.** `voxelbench.eth` is registered on the ENSv2 beta, and its
children are answered by a registry we deployed rather than by the shared one.
Under it:

| Name | Records |
|---|---|
| `recipe.voxelbench.eth` | `url`, `x402:price`, `x402:asset`, `x402:network`, `x402:payTo` |
| `craft.voxelbench.eth` | the same, at its own price |
| `publish.voxelbench.eth` | the same, at its own price |

The agent resolves the three at startup through the Universal Resolver and reads
the terms. Then, on every 402, it compares what the service asks against what
the name says, and refuses to sign when they disagree.

**Why that is worth doing, rather than nice to have.** The service cannot make
them agree. Each service holds one role on its own name — permission to write
its own `url` record, so it can move hosts without asking us — and nothing else.
`x402:price` belongs to the operator.

So the name is a quote and the 402 is a claim, and one of them is not written by
the party being paid.

That closes a symmetry the project was missing. `Allowance` stops the agent
spending more than its cap; ENS stops a service charging more than its name.
Neither limit is a promise in a prompt or a check in our own backend — both are
permissions on a chain, and the agent verifies them without asking us.

**Non-blockchain alternative considered:** a service registry in our own
database, or a signed manifest we publish. Rejected for the same reason as 2.2 —
it works, and it makes us the only party who can say what a service costs. The
point is that the buyer can check the price without trusting the seller *or* us.

### 3.3 Circle / Arc — Agentic Economy on Arc (priority 3)

**The track asks for:** autonomous agents that transact on Arc, holding wallets
and making USDC payments with legible decision logic and settlement flows.

**Why Arc.** USDC is its native gas token, so a craft fee, an author's share and
a transaction fee are all the same unit, and that unit is dollars. Our three
contracts run there as they are — nothing in them names an asset, they split and
forward whatever value they are handed — so the author's share simply arrives
denominated in currency:

```
Arc Testnet
  crafting, paying 1 USDC...
  author earned    0.9 USDC
  author's share   9000 bps
  RecipeBook holds 0 USDC
```

Same bytecode, same addresses, same split as on Hedera.

**What we had to build.** The public x402 facilitator serves nine networks and
Arc is not one, so `services/facilitator` is ours: the same three endpoints over
`@x402/evm`, whose exact scheme declares `eip155:*`. It runs on its own account,
deliberately not the agent's — sharing one still works and hides the
arrangement, since the receipt would show the agent submitting its own payment.

```
transaction from   0x1a307ae7…   the facilitator
agent              paid the price and no gas
service            received the price
```

**Where it meets ENS.** Each service names its own chain in `x402:network`, so
moving one between chains is a record change. `craft.voxelbench.eth` settles in
USDC on Arc while its two siblings settle in HBAR on Hedera — one agent, one
identity, two rails, decided by a name rather than by code.

That is also the answer to "clear decision logic". The agent does not choose a
chain by heuristic. It reads where a service says it is paid, checks the 402
against that, and settles.

### 3.4 What we are not chasing, and why

**1inch, Uniswap, Chainlink.** No honest fit: we are not building a DeFi
position, a swap or an oracle-driven workflow. Forcing an integration to collect
a logo is visible to judges and costs the credibility of the ones that are real.

**Ledger's AI Agents track**, which was priority two until we tried to reach it.
Its tooling wants a physical device on USB, the emulator does not reach the CLI
the track names, and no devices were available. ENS pays more, across more
places, with a known path — so the swap held on the numbers even setting the
hardware aside.

Nothing is held in reserve. The three above are the three we are entering.

---

## 4. Contracts

| Contract | Holds | Called by |
|---|---|---|
| `RecipeBook` | recipe id, author, split terms, craft count | the publish service on each craft |
| `SplitVault` | accrued balances per author | authors withdrawing; agent depositing fees |
| `Allowance` | the agent's cap and window | every x402 payment, and by a human to raise it |

Deliberately small. Three contracts that each do one thing beat one that does
everything, particularly when a judge has four minutes to read them.

Vocabulary matches the product exactly — recipe, ingredients, craft, crafter,
author. Someone who reads the contract should recognise the words they just saw
on screen.

---

## 5. What is explicitly *not* onchain

- **Roblox game revenue.** Roblox prohibits blockchain integrations and
  off-platform monetisation, and all earnings flow through Robux and DevEx. Any
  design routing game revenue onchain breaks their rules and could not be
  operated after the hackathon. Creators keep what their game earns, in full.
- **The 3D assets themselves.** They live in Roblox and in our storage. Putting
  meshes onchain would be expensive theatre.
- **User accounts and API keys.** Secrets, off-chain, encrypted.

If a reviewer asks "why is this onchain at all", section 2 is the answer, and
this section is the evidence that we asked ourselves the same question.

---

## 6. Questions we opened, and how they closed

Kept rather than deleted: what we assumed before measuring is part of the
argument, and two of these turned out differently than we expected.

- [x] **Which facilitator, and is it stable enough to demo live?**
      `https://x402.org/facilitator`, the public testnet one. Every payment in
      this document went through it and none failed. No recorded fallback
      needed, though section 10 of `PLAN.md` still has one.

- [x] **Should `Allowance` be its own contract or a modifier on the others?**
      Its own, for the reason in section 4. A cap that is a separate contract is
      a cap someone can read on its own; a modifier is a cap you have to trust
      the surrounding code to have applied.

- [x] **Gas cost of a settlement, against the craft fee.** Worse than we
      guessed, and it does not matter — which is the interesting part.

      Every settlement costs **261,483 tinybars**, measured across three
      consecutive payments on the mirror node. The recipe stage sells for
      100,000. Gas is 2.6x the thing being bought.

      It lands on nobody in this architecture. The facilitator pays it: the
      agent's account moves exactly the price, the service account receives
      exactly the price, and the fee comes out of the facilitator's balance.
      That is the arrangement x402 is built around — the agent needs an account
      but never needs gas.

      So the economics argument in section 2.1 holds for us, and the question
      moves somewhere else: at volume, a facilitator absorbing 0.0026 HBAR per
      call is a business model we are not paying for. Worth knowing before
      depending on a public one in production.
