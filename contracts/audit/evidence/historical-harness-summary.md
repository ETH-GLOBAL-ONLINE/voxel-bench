# Historical EVM harness summary

**Source snapshot:** `5015954e807783a9d6e68cff07984ce98556cfa0`
**Run date:** 11 September 2026
**Scope:** Solidity contracts only; web, x402, ENS, Blender, Roblox, deployment and off-chain services were excluded.

## Test layout at that snapshot

| Component | Role |
|---|---|
| `ProtocolLawStatelessTest` | Negative tests, arithmetic fuzz, and reentrancy regression. |
| `ProtocolFuzzTest` | Stateful handler-driven invariants. |
| `ProtocolHandler` | Public-route driver and ghost accounting. |
| `ProtocolStrictDiscoveryTest` | Expected-fail strict roots. |

## Recorded result

```yaml
stateless_law: 11 passed
stateful_law: 8 invariants passed
stateful_smoke: 100 runs, 100 depth, 10000 handler calls, 0 handler reverts
routes_called: 12 of 12
strict_discovery: 2 expected failures
```

The strict roots were:

1. first-observer authorship capture; and
2. fixed-window boundary burst.

The first evolved into SR-01. The second is a fixed-versus-rolling-window product decision.
