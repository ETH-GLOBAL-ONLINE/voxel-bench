# VoxelBench contract audit package

This folder separates audit material from executable tests.

| Path | Purpose |
|---|---|
| `SR-01-authorship-capture.md` | The authorship-capture finding, its current status, and the required provenance fix. |
| `SR-01-attack-trace.md` | Step-by-step before/after trace of the SR-01 claim race. |
| `TEST_MATRIX.md` | Test inventory, coverage matrix, and the correct interpretation of results. |
| `evidence/` | Historical Foundry output and run summaries imported from the audit Drive folder. |

## Important reading rule

The evidence files were produced on 11 September 2026 against the source snapshot recorded inside each file. They demonstrate the previous audit campaign; they do **not** prove that the current branch passes after later source or test changes.

Before a release or demo, rerun the current suite and replace/add a dated log under `evidence/current/`.

## Current security status

SR-01 is not fully resolved. Direct `publish` is disabled, but the existing `publishFor` route still accepts a first observer's self-signed claim for an observed unclaimed `recipeId`. A signature proves control of a wallet, not creation of content.

The remaining fix must introduce provenance independent from the claimant: either a trusted platform attestation after recipe creation, or a commit-reveal flow with a secret salt.
