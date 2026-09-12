# VoxelBench contract audit package

This folder separates audit material from executable tests.

| Path | Purpose |
|---|---|
| `SR-01-authorship-capture.md` | The authorship-capture finding, and how it was closed. |
| `SR-01-attack-trace.md` | Step-by-step before/after trace of the SR-01 claim race. |
| `TEST_MATRIX.md` | Test inventory, coverage matrix, and the correct interpretation of results. |
| `evidence/` | Foundry output and run summaries: the audit campaign's, and a dated run of the current suite. |

## Important reading rule

The historical evidence files were produced on 11 September 2026 against the source snapshot recorded inside each file. They demonstrate the audit campaign that found SR-01; they do **not** describe the current source, which was changed to close it.

Before a release or demo, rerun the current suite and add a dated log under `evidence/`.

## Current security status

SR-01 is closed. `RecipeBook` records an author only from its **attester**, the agent that crafts: `publish` and `publishFor` revert with `NotAttester` from any other address. A first observer can still sign a claim for an observed `recipeId` with their own wallet — a signature proves control of a wallet, not creation of content — but cannot have it relayed, and the agent relays a claim only for the person it crafted the recipe for (`services/agent/crafted.mjs`).

This is the platform attestation the finding asked for, carried by the relayer rather than by a second signature. The trust it places is explicit: the attester's word on `(recipeId, author)`. The owner can rotate the attester with `setAttester`.

The books were redeployed on both testnets against the existing vaults, the earlier recipes carried over with `migrate`, and the migration sealed (`../scripts/migrate-book.mjs`). Addresses are in `docs/STATUS.md`.
