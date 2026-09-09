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
which meant the payment layer was something we could try on a Wednesday rather
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

---

## Still to come

We will add entries as we use each one. Empty headings would be padding, so
they are not here yet.
