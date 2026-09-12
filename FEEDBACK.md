# Feedback

Several tracks ask for feedback on the technology, so this collects what we ran
into while building — the parts that cost us time and the parts that saved it.

Everything here is something we hit ourselves and can point at evidence for. We
have left out anything we suspect but did not verify.

---

## Hedera

### What worked

**The testnet facilitator being public and free is the reason x402 was viable
for us at all.** `x402.org/facilitator` needs no account and no application,
which meant the payment layer was something we could try in an afternoon rather
than something we had to plan around.

**`hedera-dev/x402-inference-pay-per-request-poc` answered more questions than
the prose documentation did.** Pay-per-request LLM inference is close enough to
pay-per-craft that we could read the middleware configuration and the facilitator
wiring straight out of it. A working repo that resembles what someone is trying
to build is worth several pages of explanation.

**Deploying with Hardhat and the hashio relay was uneventful**, which is the
compliment it sounds like. Standard tooling, standard config, one network entry.

### x402's spend controls are on by default, and that is the right default

Worth naming because it is unusual. The first payment our agent tried was
refused by its own client library, not by the server: HBAR is not one of the
assets `findDefaultAsset` recognises, so it had to be listed explicitly before
the agent could spend it.

We had been planning to build a spending cap. It was already there, in the
right place — before the payment is constructed rather than after it is sent —
and it fails closed on assets nobody authorised.

The error was also unusually good:

> All payment requirements were rejected by spendControls: only default assets
> or entries in spendControls.allowedAssets are allowed. Add an allowedAssets
> entry for non-default tokens, set allowedAssets: true, or set
> spendControls: false.

It names the control that refused, and the three ways out in descending order
of safety. Most libraries would have said "payment failed".

### `msg.value` arrives in tinybars, and the documentation does not say so

This cost us the most time of anything on the chain side, and it presents as a
bug in your own contract rather than as a unit mismatch.

**What we measured.** Calling a payable function on Hedera testnet (chainId 296,
hashio relay) with viem and `value: 10n ** 18n`, the contract observed
`msg.value == 10n ** 8n`. The relay converts weibars to tinybars before the
contract sees the value. Confirmed across three calls: a vault accumulated
exactly `3 × 10^8` after three payments of `10^18`.

**What the documentation says.** From
`core-concepts/smart-contracts/json-rpc-relay`:

> The Hiero JSON RPC Relay `msg.value` uses 18 decimals when it returns HBAR.

That sentence is about what the relay *returns*. It does not say what a Solidity
contract *observes*, and a developer arriving from any other EVM chain will read
it as a statement that `msg.value` is in 18 decimals everywhere — because on
every other EVM chain, it is.

**The part that is confusing regardless of documentation** is the asymmetry:
`eth_getBalance` answers in wei while `msg.value` inside the contract is in
tinybars. Both in the same RPC session, ten orders of magnitude apart. A
correct 90/10 split formatted with `formatEther` reads as `0.00000000009` and
looks like the contract is broken.

**Suggested wording.** State explicitly which side of the relay each
representation applies to. Something as short as *"the relay accepts value in
weibars and the contract receives tinybars; divide by 10^10"* next to the
existing sentence would have saved us the hunt.

---

### Payment settles before the work happens, and the standard is quiet about it

A stage is paid for, then run. When the stage fails the money is already gone,
and a client that retries pays again — we watched three retries settle against a
provider that was returning 500s, at a cost of 0.003 USDC and no output.

That is a design decision rather than a defect, and it is the right default:
holding funds until work completes needs escrow, and escrow is a much larger
protocol. But which party absorbs a failed request is a question every
integration has to answer, and neither the client nor the server guide raises
it. A paragraph naming the trade-off — and pointing at the `upto` scheme, which
exists partly for this — would put the decision in front of people before they
meet it in production rather than after.

### The facilitator pays more gas than the service costs

Measured across three consecutive settlements on the mirror node: every one
charged **261,483 tinybars** in fees, against a service priced at 100,000. The
transaction costs 2.6x the thing being bought.

It falls on the facilitator, not on either party to the trade — the agent's
account moves exactly the price and the service account receives exactly the
price. That is the arrangement working as designed, and it is the reason an
agent needs an account but never needs gas.

Worth stating plainly in the x402 documentation all the same, since it is the
number that decides whether anyone can afford to run a facilitator at volume.
The client and server guides are clear about who does not pay gas and quiet
about how much the party who does is paying.

---

---

## ENS

### The commitment window runs on the chain's clock, not yours

Registration is a commit, a sixty-second wait, and a reveal. We waited
sixty-five seconds by our own clock and the reveal reverted with
`CommitmentTooNew`.

Sepolia's head runs a few seconds behind wall time, and the gas estimate that
precedes the send is simulated against the latest block. So the wait has to be
measured in block timestamps — read `commitmentAt(commitment)`, add
`MIN_COMMITMENT_AGE`, and poll until a block says it has passed.

The documentation says "wait at least MIN_COMMITMENT_AGE (60 seconds)", which is
true of the contract and misleading about the client. One sentence naming the
block timestamp as the thing that counts would have saved the first attempt.

### Resolving a name a record at a time costs twenty-four seconds

Three names, five text records each. Fetched one after another through the
Universal Resolver this took **24 seconds** — longer than the craft it precedes.
Issued together so the client's batcher can collapse them into multicalls, the
same fifteen lookups take **1.0 second**.

A twenty-fourfold difference between the obvious way to write it and the fast
one is worth a line in the app developer guide. The batching is the client's
job, but nothing prompts you to ask for it, and a first integration will be
written the slow way.

### Reverts are legible, once you have the ABI

`0x6be614e3` and `0x4b27a133` mean `CommitmentTooNew` and
`EACUnauthorizedAccountRoles`. Both were only findable by pulling the interface
from the contracts repository and hashing candidate signatures — neither is in
4byte.directory. Publishing the error selectors alongside the deployment
addresses would be cheap and would make a bad afternoon a short one.

### Enhanced Access Control fits agent-to-agent payment better than we expected

`authorizeTextRoles(name, key, account, grant)` grants the right to write **one
text key on one name**. We used it to let each service edit its own `url` and
nothing else, which makes its price a number it cannot change.

We went looking for a way to describe a service and found a way to constrain
one. That is a stronger primitive than the track's framing suggests, and it is
worth naming in the documentation: per-record delegation is how you publish
terms that the party being paid cannot rewrite.

---

---

## Circle / Arc

### The facilitator does not serve Arc, and the pieces to replace it are already shipped

`x402.org/facilitator` answers for nine networks and Arc is not among them, so
the Arc side of this project runs on a facilitator of ours. That took an evening
rather than a week, because `@x402/evm` ships the facilitator scheme as well as
the client and server ones, and it declares `eip155:*` — so it covers any EVM
chain including one it has never heard of.

Worth saying out loud in the Arc quickstart. "Bring your own facilitator" reads
as a large undertaking until you notice the package already contains it.

### Two signer converters read a field viem does not have

`toFacilitatorEvmSigner` and `toClientEvmSigner` both do `client.address`. A
viem wallet client keeps its account at `client.account.address` and has no
`.address`, so both silently produce an undefined address.

The two failures look nothing alike and neither names the cause. On the server
the facilitator advertises `signers: { "eip155:*": [null] }`, and a resource
server rejects the **entire** `/supported` response as invalid without saying
which field was wrong — every route fails to configure and the process exits. On
the client it surfaces mid-signature as `Address "undefined" is invalid`.

Either reading `client.account?.address` as a fallback, or validating the signer
at registration, would turn both into one clear error at startup.

### The token's EIP-712 domain has to be carried in the offer

A client signing an EIP-3009 authorisation must rebuild the domain the token
checks against, and cannot read it from the chain mid-payment. So the 402 has to
carry `extra: { name, version }` for the asset — and nothing says so until the
client fails with *"EIP-712 domain parameters (name, version) are required"*.

The resource server knows the asset address and could read `name()` and
`version()` off it at startup; we read both in two lines to find out what to put
there. Failing that, naming the requirement where the price is configured would
be enough.

### Three chains, three ways to disagree with yourself about decimals

| | a contract is handed | a client reads back |
|---|---|---|
| Hedera | tinybars, 8 decimals | wei, 18 |
| Arc, native | USDC, 18 decimals | USDC, 18 |
| Arc, ERC-20 | — | USDC, 6 |

We have now made this mistake three times in the same project, each time in a
new disguise: formatting `msg.value` as wei on Hedera, reading an Arc balance at
6 decimals that was held at 18, and — the one that took longest to see — adding
a price quoted in the ERC-20's 6 decimals to one quoted in tinybars and
spending the sum.

None of these are caught by a type. They are all `uint256` and they are all
plausible numbers; the answer is simply wrong by a factor of 10^10 or 10^12,
which reads as a broken split rather than a unit mistake.

A payment library that knows the network and the asset knows the scale of both.
Carrying it in the amount, or refusing to compare two amounts that do not share
one, would make this class of bug impossible rather than merely documented.

### The decimal asymmetry is not a Hedera quirk

Arc's USDC is the native gas token at 18 decimals and an ERC-20 at
`0x3600…0000` at 6. Same balance, two views, a factor of 10^12 between them:

```
erc20 balanceOf     18980175        = 18.980175 USDC
native getBalance   18.98017515134    USDC
```

This is the same shape as the tinybar/wei gap that already cost us time on
Hedera. Two of the three chains we have touched disagree with themselves about
decimals, which stops looking like a quirk of one chain and starts looking like
something a payment library should normalise, or at least warn about.

Arc's documentation does say it, which Hedera's did not. That is the difference
between an hour and a day.

### A rate limit on the public RPC looks like an empty result

Reading `RecipeBook`'s events for one address through Arc testnet's public RPC,
ten block windows asked for at once came back `Request exceeds defined limit`
with `rate limit exceeded`, three rounds in a row.

A public node limiting requests is fair. What cost us was the shape of the
failure: an app that reads a refused query as a query with no events shows a
user an empty list, and a backpack with two recipes in it said "Nothing here
yet". We now read the windows one after another, retry a refusal, and report a
chain we could not read rather than an empty one.

Stating the limit next to the RPC URL — requests per second, and what counts as
one — would let an integration size its reads before it meets it.

### Permit on Arc's USDC is what made a gasless budget possible

Each person gives their agent a budget by signing an EIP-2612 permit; the agent
relays it and pays the gas, and from then on the token enforces the limit. It
worked the first time, because the ERC-20 view of Arc's USDC exposes
`PERMIT_TYPEHASH`, `nonces` and the domain `USDC` / `2` like Circle's USDC
elsewhere. A native gas token that is also a permit-capable ERC-20 is unusual,
and it is what let someone who signed in with an email a minute ago hold a
budget without ever sending a transaction. Worth leading with in the Arc
documentation for agent builders.

---

## Roblox Open Cloud

Not a sponsor, but the same category of finding and it is where we lost the most
time overall. Recorded here so it is in one place.

- **A `403` is almost always the API key's IP allowlist**, and the response never
  mentions the IP. An empty allowlist rejects everything while looking like a
  permissions problem.
- **`assets` and `asset-permissions` are different API systems.** The second
  manages who may use someone else's asset; only the first can upload.
- **FBX arrives 100× too large.** FBX stores centimetres, Blender exports
  assuming metres, and the importer reads the numbers as studs. `.rbxmx` with
  native parts avoids the conversion entirely and was the better path for us.
- **A negative part size is not rejected** — it is clamped to 0.001, so the part
  exists, has the right colour, and is invisible. Nothing errors.
- **Four `MeshType` values are listed and never drawn.** `Pyramid`, `Prism`,
  `ParallelRamp` and `RightAngleRamp` accept the assignment, raise nothing, and
  render an invisible part. `Brick`, `Wedge`, `CornerWedge`, `Sphere` and
  `Cylinder` work. We only found it by putting all nine on screen side by side;
  a deprecated value that silently draws nothing costs more than one that errors.
- **Geometry can be substituted with no signal that it was.** Open Cloud accepts
  a `.rbxmx`, moderation approves it, and nothing anywhere reports that a shape
  the file asked for is not a shape Roblox has. The only way to find out is to
  open the result in Studio and look. An upload response that listed what it
  could not honour would have saved us the round trip.
- **A model's icon can be set through Open Cloud, and the reference barely
  says how.** The Assets API lists `icon` among the fields of an update and
  requires an image asset; there is no example request. What worked: upload the
  render as an image, then `PATCH assets/v1/assets/{id}?updateMask=icon` with a
  multipart `request` part holding `"icon": "assets/{imageId}"` and no file.

---

## Privy

Not a sponsor either, recorded for the same reason.

- **The SDK can exhaust a build's memory.** With the provider wrapping the
  page, Privy — WalletConnect, Solana, Coinbase and more — was compiled for the
  server as well as the browser, and every Vercel build ran out of memory while
  the same commit built locally. The log blamed `globals.css`, the module in
  hand when memory filled. Loading the provider with `next/dynamic` and
  `ssr: false` took Privy out of the server output entirely. A line in the
  Next.js guide recommending that would have saved the bisecting.
- **`login()` is ignored while a session exists.** Signing in through MetaMask
  and then locking MetaMask left a Privy session with no wallet in it, and a
  Sign in button that did nothing, with nothing in the console.
- **A login method is on only when its switch is.** Google configured in the
  dashboard still answered `Login with Google not allowed`. The app's config
  endpoint said `google_oauth: false`; the switch sits apart from the settings
  and only the switch counts.

---

## Still to come

We will add entries as we use each one. Empty headings would be padding, so
they are not here yet.
