# SR-01 — authorship capture through direct publish

**Status:** direct route disabled; signed first-claim route still requires a provenance fix.

## Original issue

The former direct path `publish(recipeId)` recorded `msg.sender` as author. An observer of an unclaimed recipe ID could publish first, become the permanent author, and receive future royalty payments.

## Partial mitigation

Direct publishing now reverts with `DirectPublishDisabled`. This removes the unsafe direct route.

`publishFor(recipeId, author, signature)` binds a signature to the recipe ID, chain ID, and this contract address. It proves that `author` controls the signing wallet, but it does **not** prove that `author` created the recipe content. A first observer can still sign the observed ID with their own wallet before the legitimate claim arrives.

## Regression test

`test/SR01RecipeAuthorshipRegression.t.sol` verifies that:

1. Direct publication cannot record an attacker as author.
2. A relayer can submit a real author's signed claim, but royalties go to the signer.
3. A relayer cannot substitute their own address for the signed author.

`test/FrontRunPublishFor.t.sol` remains an active discovery test: it demonstrates that a first observer can self-sign and claim an observed ID. This means SR-01 is not fully closed yet.

## Required final fix

The contract needs an authorization source that is independent from the claimant's own wallet. For this product, the clearest option is a backend/platform attestation: after recording recipe creation, the trusted service signs `(recipeId, author)` and the contract accepts only that service's signature. A commit-reveal flow with a secret salt is another option when the author must claim without a trusted backend.

## Demo statement

"We identified SR-01 during audit. Direct publishing is disabled, and signature-substitution is covered by tests. Our remaining security test shows that self-signed first claims still need a provenance mechanism, so we are implementing a platform attestation before calling the issue fully closed."
