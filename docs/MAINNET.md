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
| `RecipeBook` | `0x36C6C3e991B8673c44B7216f1b0499eA19f8Df41` | `0xC456D809…` — same bytecode |
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
  window's cap, and every craft now draws through it: when the window is used
  up the contract refuses and the craft does not happen.

  One thing has to change for that bound to be complete. The agent holds its own
  balance on both chains, so today the cap limits what it *draws* rather than
  everything it could spend. Funding the agent's account only from the allowance
  makes the two the same number, and is the arrangement a real deployment
  wants — it is also what makes buying credit sensible: a customer tops up the
  allowance, and the agent cannot spend past what was bought.

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

### 7. Authorship is attested, not first come — done

The first address to claim a recipe used to own it, which assumed nobody else
had seen its id (SR-01 in `docs/CONTRACT_AUDIT.md`). On a public chain, with a
public catalog, that does not hold. Now an author is recorded only through the
agent that crafted the recipe: `RecipeBook` has an attester, the agent relays a
claim only for the person it crafted for, and an observer can sign for
themselves but cannot get the relay. The books were deployed again on both
testnets against the existing vaults, and the earlier recipes carried over.

On mainnet the arrangement is the same. What changes is the attester key, which
the owner rotates with `setAttester` when the agent's key does.

### 8. People bring their own money

On testnet a new account is sent 0.10 USDC once, so it can try the bench. On
mainnet that goes: a person arrives with USDC of their own and gives their agent
a budget from it, exactly as now.

Two things follow. People pay the agent in USDC on Arc, while the agent pays the
recipe and publish services in HBAR out of a reserve of the platform's — so that
reserve has to be converted and topped up from what is charged. And every paid
stage costs the facilitator gas: on Hedera it measured 0.0026 HBAR a
settlement, more than the recipe stage's price. A stage that earns less than
its gas either moves to Arc or stops being charged on its own. Publishing, which
costs us almost nothing to do, is the first candidate.

### 9. The bench gets a server of its own

For the demo the bench runs on one of our machines, and the site reaches it
through two tunnels (`docs/DEMO.md`). A deployment runs the same four services
(crafter, paywall, agent, facilitator) on a dedicated server:

- Blender needs a real machine with a CPU to itself. It cannot run as a
  function beside the site.
- Stable HTTPS hostnames replace the tunnels' addresses. `AGENT_URL` and
  `CRAFTER_URL` in the Vercel project point at them.
- Each service writes its public address to its own name's `url` record. The
  role for that record is already granted to it, so this is one transaction per
  service, with no redeployment. The agent follows the new records on its next
  run.
- The paywall and the facilitator can stay private beside the agent, or move to
  hosts of their own. The records decide, not the code.

The keys on that server are the ones item 1 moves out of files.

## The Arc Mainnet question, specifically

Deploying to Arc Mainnet by 30 September would take:

| Step | Size |
|---|---|
| The same Ignition module against Arc Mainnet | an afternoon — testnet took no changes |
| Real USDC for gas and the first crafts | small |
| Circle Gateway's mainnet facilitator (`gateway-api.circle.com`) for the Arc stage, ours as fallback | a config change — both already run for testnet |
| An audit before charging anything | the real gate |

Nothing here is unknown any more. The Arc stage settles through Circle Gateway
with our facilitator behind it as the fallback. On mainnet that is Gateway's
mainnet facilitator and a funded Gateway balance, and ours pointed at a mainnet
RPC with a funded account.

Prices would stay at testnet levels with the platform share at zero until the
contracts have been audited. A working deployment that charges nothing it has
not earned the right to charge.
