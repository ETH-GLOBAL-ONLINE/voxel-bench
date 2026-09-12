# Contract test matrix

## Executable test files

| File | Type | What it proves |
|---|---|---|
| `test/RecipeBook.t.sol` | Unit + fuzz | Signature binding, immutable recipe records, fee math, withdrawals, and owner-only controls. |
| `test/Allowance.t.sol` | Unit + fuzz | Agent cap, fixed-window reset, liquidity bound, owner controls, and agent-only draws. |
| `test/FrontRunPublishFor.t.sol` | Discovery PoC | A first observer can self-sign an unclaimed recipe ID and claim authorship. This is active SR-01 evidence, not a green security result. |
| `test/SR01RecipeAuthorshipRegression.t.sol` | Regression | Direct `publish` is disabled; a relayer cannot substitute its address for a real signer's signature. These tests do not prove content provenance. |
| `test/ProtocolHandler.sol` | Stateful helper | Generates bounded actions and keeps an independent ghost-accounting model. |
| `test/ProtocolFuzzTest.t.sol` | Stateless fuzz + stateful invariants | Cross-contract accounting, roles, payment split, withdrawals, agent limits, and reentrancy. |

## LAW properties: expected green

| Group | Properties |
|---|---|
| Signature and access control | A signature cannot be reused for another author or recipe; only the owner changes fee/owner/agent; only the agent draws. |
| Payment and accounting | Author share plus platform share equals payment; `RecipeBook` keeps no payment balance; vault liabilities track credits minus withdrawals. |
| Vault safety | A failed withdrawal is atomic; reentrancy cannot withdraw the same credit twice; vault balance remains at least `totalOwed`. |
| Allowance | `remaining()` is the smaller of liquidity and unused cap; reverting over-cap draws do not mutate state; role rotation is enforced. |
| Stateful model | Random sequences preserve recipe craft counts, recipe earnings, liability accounting, owner state, and agent state. |

## STRICT discovery roots: intentionally non-green

| Root | Meaning | Current classification |
|---|---|---|
| SR-E01 / SR-01 | First observer can capture authorship for an unclaimed public recipe ID. | Security finding; still needs provenance fix. |
| SR-E02 | Two fixed allowance windows can overlap a rolling 24-hour interval. | Product-model decision, not a bug unless product promises a rolling cap. |

## Historical audit campaign results

The following results were imported from Drive and are preserved in `evidence/`:

```text
Solc: 0.8.29
Stateless LAW: 11 passed, 0 failed
Stateful LAW: 8 invariants passed; 100 runs; 10,000 calls; 0 handler reverts
STRICT discovery: 2 expected failures (SR-E01 and SR-E02)
SR-01 PoC: 2 passed, including attacker royalty capture on the old source route
```

These are historical baseline results only. Rerun the current branch before presenting a green result.

The explicit historical `FAIL` output for SR-E01 and SR-E02 is preserved in `evidence/historical-strict-discovery.log`.
