# SR-01 — authorship capture of an observed recipe id

**Status:** closed. An author is recorded only through the attester, which relays a claim only for the person it crafted the recipe for.

## Original issue

The direct path `publish(recipeId)` recorded `msg.sender` as author. An observer of an unclaimed recipe ID could publish first, become the permanent author, and receive future royalty payments.

The signed path had the same gap. `publishFor(recipeId, author, signature)` bound a signature to the recipe ID, chain ID and contract address, which proved that `author` controlled the signing wallet but not that `author` created the recipe content. A first observer could sign the observed ID with their own wallet before the legitimate claim arrived. Disabling `publish` alone did not close it; `test/FrontRunPublishFor.t.sol` showed the capture through `publishFor`.

## The fix

Provenance has to come from somewhere other than the claimant's wallet. The one party that saw who did the work is the agent that crafted the recipe — every craft is charged to a signed-in person's budget — so the fix puts the agent between the claim and the record, on both sides of the chain.

**Contract.** `RecipeBook` has an `attester`, set to the deployer and rotated by the owner. Both routes are gated:

- `publish(recipeId)` — `onlyAttester`. The platform's own stock, published under the agent's address.
- `publishFor(recipeId, author, signature)` — `onlyAttester`, and the author's EIP-712 signature is still verified. The signature says this person wants this recipe; the relay says the agent crafted it for them. A substituted author does not recover, so the attester cannot misname a signer either.

Everything else in the contract is unchanged. Recipes from the earlier deployment were carried over with `migrate` (owner-only, refused for an existing id, checked against the old book) and the migration sealed with `sealMigration`, which is final.

**Application.** The agent writes down, privately, who paid for each new craft (`services/agent/crafted.mjs`, in `out/crafted.json`, never in the public catalog), and relays a claim only for them. Anyone else is refused whatever they signed, and a second claim of the same recipe is refused. A recipe not claimed on the spot waits under *Unclaimed* in the backpack, where only its crafter can claim it.

## Tests

`test/FrontRunPublishFor.t.sol` — the discovery test, turned around: the observer's self-signed `publishFor` and their direct `publish` revert with `NotAttester`, the real author's claim relayed by the attester is recorded, and an author's signature relayed under another name does not recover.

`test/SR01RecipeAuthorshipRegression.t.sol` verifies that:

1. Direct publication cannot record an attacker as author.
2. A self-signed claim for an observed id cannot record an attacker as author.
3. A valid claim in an attacker's hands cannot be relayed at all.
4. The attester relays the true author's claim, and the author is credited and paid.
5. The attester cannot substitute an address for the signer's.

`test/ProtocolFuzzTest.t.sol` adds `invariant_OnlyTheAttesterPublishes` and `test_attesterGatesBothRoutes`.

End to end on testnet, through the running agent: a fresh account crafted a recipe; a stranger's self-signed claim was refused by the agent, and the same call simulated on the contract reverted from the stranger and succeeded from the attester; the crafter's claim was recorded on the new book, and a marketplace craft of a migrated recipe paid its author with the carried-over count continuing.

## What remains a matter of trust

The attester is the platform's agent. It could, in principle, vouch for the wrong address; the contract cannot tell. That trust is stated rather than hidden: it is the same agent that already spends the platform's money and crafts the objects, its address is public, and every claim it relays is an event on the chain that names both the recipe and the author.

## Demo statement

"We identified SR-01 during the audit: whoever saw an unclaimed recipe id could claim it, since a signature proves a wallet and not the work. We closed it by recording authors only through the agent that crafted the recipe, which vouches only for the person it crafted for, and redeployed the book on both chains with the earlier recipes carried over. The discovery test now shows the attack failing."
