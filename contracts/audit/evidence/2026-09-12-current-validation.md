# Current validation — 12 September 2026

This record is a fresh local run against branch `codex/sr01-signed-authorship` after the signed-claim change and the test-suite repair.

## Commands and results

| Command | Result |
|---|---|
| `forge test --match-contract RecipeBookTest -vv` | 18 passed, 0 failed |
| `forge test --match-contract 'SR01RecipeAuthorshipRegressionTest|FrontRunPublishForTest|ProtocolLawStatelessTest' -vvv` | 15 passed, 0 failed |
| `FOUNDRY_INVARIANT_RUNS=1 FOUNDRY_INVARIANT_DEPTH=10000 forge test --match-contract ProtocolFuzzTest --fuzz-seed 1 -vv --invariant-workers 1` | 8 invariants passed across 10,000 handler calls, 0 reverts |

## Interpretation

- The old direct-call capture is now rejected by `RecipeBook.publish` with `DirectPublishDisabled`.
- Signed claims correctly prevent replacing the signer with a different author address.
- `FrontRunPublishForTest` intentionally passes while demonstrating the remaining provenance gap: an observer can still self-sign a public, unclaimed recipe ID and claim it first. This is an open finding, not a green security result.

For the historical discovery failures, see `historical-strict-discovery.log`. For the exact remaining SR-01 trace, see `../SR-01-attack-trace.md`.
