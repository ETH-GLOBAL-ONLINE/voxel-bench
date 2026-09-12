# Contract test guide

This folder contains executable Foundry tests for the Solidity contracts. Each row below explains the behaviour checked by a test, so a reviewer can connect the code with its security claim.

Run the suite from `contracts/` with:

```bash
forge test -vvv
```

Historical run evidence and the dated result summary are in [`../audit/TEST_MATRIX.md`](../audit/TEST_MATRIX.md) and [`../audit/evidence/`](../audit/evidence/).

## `RecipeBook.t.sol`

| Test | What it checks |
|---|---|
| `test_publish_records_the_author` | A valid signed publish claim records the signing wallet as author. |
| `test_direct_publish_is_disabled` | The former unsigned `publish` route always reverts and cannot create a claim. |
| `test_relayer_cannot_steal_signed_authorship` | Any account may relay a valid author signature, but royalties remain assigned to the signer. |
| `test_attacker_cannot_publish_with_wrong_signature` | A signature from a different wallet cannot be used to claim authorship for the author. |
| `test_republishing_cannot_steal_authorship` | A claimed recipe ID cannot be claimed again by another wallet. |
| `test_craft_splits_and_counts` | A craft sends 90% to the author and 10% to the platform, tracks the liability, and increments counters. |
| `test_crafting_an_unknown_recipe_reverts` | Crafting an unpublished recipe is rejected. |
| `test_the_contract_never_holds_the_money` | Payment is forwarded to `SplitVault`; `RecipeBook` keeps no ETH. |
| `test_author_withdraws_what_they_earned` | The author can withdraw their credited share and the vault liability decreases correctly. |
| `test_platform_share_is_capped` | The constructor rejects a platform share above the configured maximum. |
| `test_only_the_owner_moves_the_platform_share` | A non-owner cannot change the platform fee. |
| `testFuzz_split_never_loses_or_invents_value` | For many payment and valid fee values, author share plus platform share always equals payment. |
| `test_publishFor_credits_the_signer_not_the_sender` | A relayer is not paid or recorded as author just by submitting the transaction. |
| `test_publishFor_refuses_a_substituted_author` | Replacing the signed author address with another address invalidates the signature. |
| `test_publishFor_refuses_a_signature_for_another_recipe` | A signature for recipe A cannot claim recipe B. |
| `test_publishFor_cannot_take_an_existing_recipe` | The signed route also rejects a recipe that is already claimed. |
| `test_publishFor_refuses_a_malformed_signature` | Invalid-length or malformed signature bytes are rejected. |
| `test_a_relayed_author_is_paid_like_any_other` | An author whose signed claim was relayed still receives their craft proceeds. |

## `Allowance.t.sol`

| Test | What it checks |
|---|---|
| `test_agent_draws_within_the_cap` | The appointed agent can draw ETH within the active cap. |
| `test_the_cap_is_a_wall_not_a_suggestion` | A draw larger than the allowed amount reverts and transfers no ETH. |
| `test_the_agent_cannot_raise_its_own_cap` | Only the owner may edit the cap. |
| `test_nobody_else_can_draw` | Only the appointed agent may draw. |
| `test_draws_accumulate_inside_one_window` | Multiple draws in one time window are summed and cannot exceed the cap. |
| `test_the_window_resets` | The spend allowance becomes available again only after the configured window elapses. |
| `test_the_cap_cannot_outrun_the_balance` | The available draw amount is limited by actual contract liquidity as well as the nominal cap. |
| `test_the_owner_can_take_it_all_back` | The owner can sweep funds; later agent draws fail when nothing remains. |
| `test_raising_the_cap_takes_effect` | A valid owner cap change updates the amount that can be drawn. |
| `testFuzz_the_agent_never_exceeds_the_cap_in_a_window` | Across varied draw sizes, the agent's total received amount never exceeds the window cap. |

## `SR01RecipeAuthorshipRegression.t.sol`

| Test | What it checks |
|---|---|
| `testRegression_DirectPublishCannotCaptureAuthorship` | Regression for SR-01: an attacker cannot use the old direct route to record themselves as author. |
| `testFixed_SignedClaimCreditsAuthorWhenRelayedByAttacker` | A valid claim relayed by an attacker credits and pays the genuine signature holder. |
| `testFixed_AttackerCannotSubstituteTheirAddressForSigner` | An attacker cannot reuse another author's signature while naming themselves as author. |

These tests prove signature binding and direct-route removal. They do **not** prove that the first wallet to sign an observed recipe ID created its content; see the discovery test below.

## `FrontRunPublishFor.t.sol`

| Test | What it checks |
|---|---|
| `test_an_observer_claims_a_seen_id_with_their_own_signature` | Discovery proof for the remaining first-claim risk: an observer of an unclaimed ID can sign it with their own wallet, claim it first, and block the real author. This test is expected to pass because it demonstrates the unresolved provenance issue. |

## `ProtocolFuzzTest.t.sol`

`ProtocolHandler.sol` is the bounded action generator for the stateful fuzz suite. It randomly publishes one of eight recipe IDs, crafts, credits and withdraws vault balances, changes permitted configuration, draws from the allowance, funds/sweeps it, rotates ownership and agent, and advances time. It maintains an independent ghost model against which the contract state is checked.

### Stateful invariants: `ProtocolFuzzTest`

| Invariant | What it checks after every generated action sequence |
|---|---|
| `invariant_BookNeverRetainsValue` | `RecipeBook` never retains ETH. |
| `invariant_VaultIsSolvent` | The vault balance always covers its recorded obligations. |
| `invariant_TrackedVaultLiabilitiesMatchGhostFlow` | Total vault liability and tracked account balances equal credits minus withdrawals in the ghost model. |
| `invariant_RecipeAccountingMatchesGhostState` | Each recipe's existence, craft count, and author earnings equal the handler's expected state. |
| `invariant_AllowanceRemainingFormula` | Allowance remaining equals the smaller of unused cap and available ETH, with correct time-window reset handling. |
| `invariant_AllowanceAgentMatchesHandlerModel` | The on-chain allowance agent matches the latest valid agent rotation in the model. |
| `invariant_BookOwnerMatchesHandlerModel` | The on-chain `RecipeBook` owner matches the model after ownership transfers. |
| `invariant_AllowanceLiquidityBoundHolds` | The remaining allowance can never exceed its contract balance. |

### Stateless laws: `ProtocolLawStatelessTest`

| Test | What it checks |
|---|---|
| `testFuzz_quoteEqualsExecution` | For varied payments and valid fees, `quote` exactly matches the later craft credits. |
| `test_unknownOrZeroPaymentDoesNotChangeState` | Zero payments and unknown recipe IDs revert without creating a balance or liability. |
| `test_publishForCannotSubstituteSigner` | A valid signature cannot be rebound to a different author address. |
| `test_allowanceRejectsOutsiderAndOverCap` | Non-agents cannot draw and agents cannot exceed the cap. |
| `test_failedWithdrawalIsAtomic` | When an ETH recipient rejects payment, their vault credit and total liability stay unchanged. |
| `testFuzz_creditUpdatesAccountAndLiability` | For varied beneficiaries and amounts, vault credit increases the individual balance and total liability equally. |
| `testFuzz_remainingMatchesCapAndLiquidity` | For varied funding and cap values, allowance remaining is the smaller of cap and liquidity. |
| `test_republishAndOwnerTransitionAreBounded` | Duplicate publishing, unauthorized fee edits, zero owners, excessive fees, and former-owner edits all revert. |
| `test_allowanceOwnerBoundariesAndAgentRotation` | Only the owner configures the allowance; the new agent, and no former agent, can draw after rotation. |
| `testFuzz_failedAllowanceDrawDoesNotChangeState` | An over-limit draw fails atomically, leaving both spent amount and ETH balance unchanged. |
| `test_reentrantWithdrawalCannotSpendLiabilityTwice` | A recipient cannot reenter `withdraw` to withdraw the same vault credit twice. |
