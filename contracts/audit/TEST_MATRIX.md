# Contract test matrix

## Executable test files

| File | Type | What it proves |
|---|---|---|
| `test/RecipeBook.t.sol` | Unit + fuzz | Attester-only publishing, signature binding, immutable recipe records, migration and its seal, fee math, withdrawals, and owner-only controls. |
| `test/Allowance.t.sol` | Unit + fuzz | Agent cap, fixed-window reset, liquidity bound, owner controls, and agent-only draws. |
| `test/FrontRunPublishFor.t.sol` | Security test | A first observer's self-signed claim and direct `publish` both revert with `NotAttester`; the real author's claim, relayed by the attester, is recorded. This file was the discovery PoC and is kept, turned around. |
| `test/SR01RecipeAuthorshipRegression.t.sol` | Regression | Neither route records an author from anyone but the attester; a valid claim in an attacker's hands cannot be relayed; the attester cannot misname a signer. |
| `test/ProtocolHandler.sol` | Stateful helper | Generates bounded actions and keeps an independent ghost-accounting model. The handler is the book's attester. |
| `test/ProtocolFuzzTest.t.sol` | Stateless fuzz + stateful invariants | Cross-contract accounting, roles, payment split, withdrawals, agent limits, reentrancy, and that only the attester ever publishes. |

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
| SR-E01 / SR-01 | First observer can capture authorship for an unclaimed public recipe ID. | Closed: an author is recorded only through the attester, which relays a claim only for the person it crafted for. See `SR-01-authorship-capture.md`. |
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
