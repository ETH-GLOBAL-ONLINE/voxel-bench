# Current validation — 12 September 2026, attested RecipeBook

A run of the current suite after the SR-01 fix: `RecipeBook` records an author only from its attester. Full output in `2026-09-12-hardhat-test.log`.

## Command and result

| Command | Result |
|---|---|
| `npx hardhat test` (from `contracts/`) | 64 passing, 0 failing: `RecipeBook.t.sol` 27, `Allowance.t.sol` 10, `FrontRunPublishFor.t.sol` 3, `SR01RecipeAuthorshipRegression.t.sol` 5, `ProtocolLawStatelessTest` 12, `ProtocolFuzzTest` 9 invariants at 256 runs each |

Before the fix the same command ran 26 tests; the difference is the attester and migration coverage, the regression suite and the invariant suite from the audit.

## Interpretation

- Direct `publish` and self-signed `publishFor` from anyone but the attester revert with `NotAttester`. `FrontRunPublishFor.t.sol`, the audit's discovery test, now passes by showing the capture failing.
- A valid claim relayed by the attester records the signer, never the relayer; a substituted author does not recover.
- Under 256 random action sequences per invariant the attester stays the one the owner set and every recorded author is one the handler published, alongside the accounting, solvency and allowance invariants from the audit.
- Migration records what it is given, refuses an existing id, a zero author and mismatched lists, and is final once sealed.

## On the live chains, the same day

Both books were redeployed against the existing vaults and the earlier recipes carried over: 1 on Hedera testnet, 58 on Arc testnet, each checked against the old book before sealing (`scripts/migrate-book.mjs`). Through the running agent, a fresh account crafted a recipe; a stranger's self-signed claim was refused by the agent, and the same `publishFor` simulated on the contract reverted from the stranger and succeeded from the attester; the crafter's claim was recorded on the new book, filed in the catalog and listed in their backpack; a marketplace craft of a migrated recipe paid its author with the carried-over count continuing.
