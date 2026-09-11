# Roadmap to mainnet

**Not current work.** Everything in this project runs on testnets and will
still be on testnets at submission. This is the road from there to a deployment
people can put money into — written now, while the reasons are fresh, rather
than reconstructed later.

It is here because a project that charges for something should be able to say
what standing behind that would cost. Each item below is either already done, a
known quantity, or named as unknown.

Part of it has a date: Circle's tracks pay a further $2,500 each for an Arc
Mainnet deployment by 30 September, which is after submission. `The Arc Mainnet
question` at the end sizes that specifically.

---

## What already carries over

The three contracts are chain-agnostic. Nothing in them names an asset — they
split and forward whatever value they are handed — which is why the second
deployment took no changes at all:

| | Hedera testnet | Arc testnet |
|---|---|---|
| `RecipeBook` | `0x333EdFE67b0e1dcEda52CA5D483B6dd54A102e1E` | `0xe0C3Bd1b…` — same bytecode |
| `SplitVault` | `0xBaE7C31f9080733DB1Cd18Ed99b5d70fF65406DE` | `0x870771ec…` — same |
| a craft of 1 | 0.9 HBAR to the author | **0.9 USDC to the author** |

Same code, same 9000 bps, denominated in dollars on one and in HBAR on the
other. A third chain is a deployment, not a rewrite.

---

## What has to change

### 1. The keys stop being ours

Every account in this project is a testnet key in a `.env` file. On mainnet the
operator key signs real transfers and the agent key spends real money.

- The agent's key belongs in a signer that is not a file — a KMS, or a hardware
  device. Everything else here assumes that has happened.
- The operator key controls `setPlatformBps` and `setOwner` on `RecipeBook`, and
  the ENS records that state what every service charges. It should be a
  multisig, not a person.
- `Allowance` already limits the damage a compromised agent can do to one
  window's cap. That is the argument for it, and it is worth more on mainnet
  than it is here.

### 2. The contracts get read by someone who did not write them

29 tests and two live verification scripts are enough to believe the thing works
and not enough to hold other people's balances. `docs/CONTRACT_AUDIT.md` is the
brief we already use internally; before mainnet it is a paid review.

The three places we would point an auditor at first are the same three in that
document: the ordering in `SplitVault.withdraw`, the non-sliding window in
`Allowance`, and the decimals.

### 3. Prices stop being round numbers

Testnet prices were chosen to be legible: 0.001, 0.005, 0.01. Real prices have
to cover a model call, seven seconds of CPU and an external quota, with a margin
that survives a bad month for whichever token they are denominated in.

Arc helps here more than we expected. USDC is the native gas token, so a price
in dollars stays a price in dollars, and the settlement cost is denominated in
the same unit as the sale. On Hedera the facilitator absorbs 261,483 tinybars
per settlement against a service priced at 100,000 — fine while someone else is
paying it, not a number to build a business on. `FEEDBACK.md` has both.

### 4. Somebody has to run the facilitator, or trust one

Every Hedera payment here goes through the public testnet facilitator at
`x402.org/facilitator`. It has not failed us once. It is also a third party
that co-signs and submits every transaction, and on mainnet that is a
dependency worth either paying for under contract or replacing.

We already know what replacing it looks like, because Arc forced the question:
that facilitator serves nine networks and Arc is not one of them, so the Arc side
of this project runs on `services/facilitator`, which is ours. The pieces are in
`@x402/evm`, whose exact scheme declares `eip155:*` and therefore covers any EVM
chain, and Arc's USDC exposes both `nonces` and `authorizationState`, so EIP-2612
and EIP-3009 signatures both work.

Running one on mainnet is the same service against a different RPC and a funded
account.

One thing that has to be decided before then, and is currently the default: a
stage is paid for and then run, so a failed request costs the payer. Fine at a
tenth of a cent; a policy question at scale. `FEEDBACK.md` has the detail.

### 5. Roblox is a quota, not just an API

Open Cloud upload limits and moderation are per-account. A bench that publishes
into its own account hits a ceiling; a bench that publishes into each user's
account — which is what we already built — does not, but it needs each user to
hold a key, and holding other people's API keys is a responsibility we currently
avoid by keeping the key in the browser and never writing it down.

That design carries over unchanged.

### 6. The names move

`voxelbench.eth` is registered on the ENSv2 beta on Sepolia. Mainnet means
registering the name on Ethereum, deploying the registry and resolver again, and
re-granting one role per service.

The records are the interesting part: `x402:network` is what tells the agent
which chain to settle on. Moving a service from Hedera to Arc is a record
change, and the agent follows it without being redeployed. That is how a
multichain deployment stays one deployment.

---

## The Arc Mainnet question, specifically

Deploying to Arc Mainnet by 30 September would take:

| Step | Size |
|---|---|
| The same Ignition module against Arc Mainnet | an afternoon — testnet took no changes |
| Real USDC for gas and the first crafts | small |
| Our facilitator against Arc Mainnet | a config change — it already runs for testnet |
| An audit before charging anything | the real gate |

Nothing here is unknown any more. The facilitator was the open item and Arc
answered it for us: the public one does not serve Arc at all, so we built ours
for testnet, and pointing it at mainnet is an RPC and a funded account.

Prices would stay at testnet levels with the platform share at zero until the
contracts have been audited. A working deployment that charges nothing it has
not earned the right to charge.
