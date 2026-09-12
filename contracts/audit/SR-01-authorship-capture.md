# SR-01 — authorship capture through direct publish

**Status:** fixed and covered by regression tests.

## Original issue

The former direct path `publish(recipeId)` recorded `msg.sender` as author. An observer of an unclaimed recipe ID could publish first, become the permanent author, and receive future royalty payments.

## Fix

Direct publishing now reverts with `DirectPublishDisabled`. Authorship claims use `publishFor(recipeId, author, signature)`, where the author signs EIP-712 data bound to the recipe ID, chain ID, and this contract address.

## Regression test

`test/SR01RecipeAuthorshipRegression.t.sol` verifies that:

1. Direct publication cannot record an attacker as author.
2. A relayer can submit a real author's signed claim, but royalties go to the signer.
3. A relayer cannot substitute their own address for the signed author.

## Demo statement

"We identified SR-01 during audit: a first observer could capture recipe authorship through direct publication. We removed that route, switched claims to author-signed EIP-712 messages, and added a regression test that proves a relayer cannot capture royalties."
