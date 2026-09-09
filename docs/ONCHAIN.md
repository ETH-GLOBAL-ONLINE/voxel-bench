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

### 3.2 Ledger — AI Agents x Ledger (priority 2)

**The track asks for:** the Ledger Agent Stack where device-backed security is
central — agents using scoped secrets, secure payments, or human-in-the-loop
approvals.

**Why we are a natural fit rather than a stretch:** our own product design hands
us this problem twice.

1. **We hold other people's Roblox API keys.** Users bring their own key so the
   asset lands in their account. That means we store third-party secrets, which
   makes us a target. Scoped storage and a hardware-held key ring is the correct
   answer, not a nice-to-have.
2. **The agent spends money.** Raising its cap, or approving an unusually large
   craft, is exactly the human-in-the-loop confirmation the track describes.

**What we build:** the agent's operating allowance is scoped and low. Anything
above it — raising the cap, a batch craft, withdrawing from the split vault —
requires a device confirmation from a human. Roblox keys move out of plain
application storage into scoped secret handling.

Note that Roblox API keys carry an IP allowlist. Users allowlist our server, so
a leaked key is useless anywhere else. That is defence in depth beneath the key
handling, not a replacement for it.

### 3.3 Circle / Arc — Agentic Economy, and Launch on Arc (priority 3)

**The track asks for:** autonomous agents holding wallets and making USDC
payments with clear decision logic and settlement flows; and separately, USDC
payment integrations deployment-ready on Arc mainnet.

**What we build:** crafting fees and author royalties denominated and settled in
USDC. The decision logic is legible rather than emergent — the agent pays a
published price per service, and its allowance is enforced onchain.

**Honest status:** this is the third priority and the first to be cut. It is
listed because the settlement layer genuinely wants a stablecoin, not to collect
another logo.

### 3.4 ENS — Best Use of ENSv2 (backup)

Held in reserve. The track explicitly encourages AI agent identity, and each
service in our pipeline is an addressable agent that could carry a subname with
its permissions attached — `craft.voxelbench.eth`, `publish.voxelbench.eth` —
using Enhanced Access Control to express what each may spend.

It is cheap to add and the pool is large, but it is the first thing to drop if
the week tightens, because identity is not load-bearing for the demo.

### 3.5 What we are not chasing, and why

1inch, Uniswap and Chainlink. There is no honest fit: we are not building a DeFi
position, a swap or an oracle-driven workflow. Forcing an integration to collect
a logo is visible to judges and costs the credibility of the ones that are real.

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

## 6. Open questions

- [ ] Which x402 facilitator we use on Hedera, and whether the testnet
      facilitator is stable enough to demo live or needs a recorded fallback.
- [ ] Whether `Allowance` should be its own contract or a modifier on the
      others. Leaning separate, for the reason in section 4.
- [ ] Gas cost of a craft settlement on Hedera. If it approaches the craft fee,
      the economics argument in section 2.1 weakens and we should batch
      settlements rather than settle per craft.
