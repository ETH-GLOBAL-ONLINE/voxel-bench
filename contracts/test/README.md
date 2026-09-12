# Contract test guide

This folder contains executable Foundry-style tests for the Solidity contracts. Each row below explains the behaviour checked by a test, so a reviewer can connect the code with its security claim.

Run the suite from `contracts/` with either runner:

```bash
npx hardhat test      # what the repo uses; runs the .t.sol files, fuzz and invariants included
forge test -vvv       # with Foundry installed; foundry.toml is here
```

Historical run evidence and the dated result summary are in [`../audit/TEST_MATRIX.md`](../audit/TEST_MATRIX.md) and [`../audit/evidence/`](../audit/evidence/).

## `RecipeBook.t.sol`

| Test | What it checks |
|---|---|
| `test_the_platform_publishes_its_own_stock` | The attester's direct `publish` records the attester as author. |
| `test_nobody_else_publishes_directly` | Direct `publish` from anyone but the attester reverts with `NotAttester`. |
| `test_republishing_cannot_steal_authorship` | A claimed recipe ID cannot be claimed again, directly or with another wallet's valid signature. |
| `test_publishFor_is_relayed_only_by_the_attester` | A valid claim relayed by anyone but the attester reverts; the same claim relayed by the attester is recorded. |
| `test_only_the_owner_appoints_the_attester` | Only the owner sets the attester, and never to the zero address. |
| `test_a_new_attester_takes_over` | After a rotation the old attester records nothing and the new one relays claims. |
| `test_publishDigest_is_the_eip712_digest` | The digest the contract exposes equals the EIP-712 digest built by hand, so a domain drift would show. |
| `test_migration_carries_recipes_over` | `migrate` records each recipe's author, craft count and earnings, emits `RecipePublished`, and crafts continue from the carried-over count. |
| `test_migration_is_the_owners_alone` | A non-owner cannot migrate. |
| `test_migration_refuses_mismatched_lists` | Lists of different lengths revert with `LengthMismatch`. |
| `test_migration_refuses_a_zero_author` | A zero author reverts with `ZeroAddress`. |
| `test_migration_cannot_overwrite_an_author` | Migrating an id that already has an author reverts with `AlreadyPublished`. |
| `test_sealing_ends_the_migration_for_good` | Only the owner seals; once sealed, `migrate` and `sealMigration` revert with `Sealed`, and claims still work. |
| `test_craft_splits_and_counts` | A craft sends 90% to the author and 10% to the platform, tracks the liability, and increments counters. |
| `test_crafting_an_unknown_recipe_reverts` | Crafting an unpublished recipe is rejected. |
| `test_the_contract_never_holds_the_money` | Payment is forwarded to `SplitVault`; `RecipeBook` keeps no ETH. |
| `test_author_withdraws_what_they_earned` | The author can withdraw their credited share and the vault liability decreases correctly. |
| `test_platform_share_is_capped` | The constructor rejects a platform share above the configured maximum. |
| `test_only_the_owner_moves_the_platform_share` | A non-owner cannot change the platform fee. |
| `testFuzz_split_never_loses_or_invents_value` | For many payment and valid fee values, author share plus platform share always equals payment. |
| `test_publishFor_credits_the_signer_not_the_relayer` | The attester relaying a claim is not recorded as its author; the signer is. |
| `test_publishFor_refuses_a_substituted_author` | Replacing the signed author address with another address invalidates the signature. |
| `test_publishFor_refuses_a_signature_for_another_recipe` | A signature for recipe A cannot claim recipe B. |
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
| `testRegression_DirectPublishCannotCaptureAuthorship` | Regression for SR-01: an attacker cannot use the direct route to record themselves as author. |
| `testRegression_SelfSignedClaimCannotCaptureAuthorship` | Regression for SR-01: an attacker's self-signed claim for an observed id is not relayed. |
| `testFixed_AttackerCannotRelayEvenAValidClaim` | A valid claim in an attacker's hands cannot be relayed at all. |
| `testFixed_SignedClaimCreditsAuthorWhenRelayedByAttester` | The attester relays the true author's claim; the author, not the relayer, is credited and paid. |
| `testFixed_AttesterCannotSubstituteAddressForSigner` | Even the attester cannot reuse an author's signature while naming someone else. |

These tests prove that an author is recorded only through the attester and only under the name that signed. What they do not, and cannot, prove is that the attester vouches for the right person: that is the agent's job (`services/agent/crafted.mjs`), stated as the trust the design places.

## `FrontRunPublishFor.t.sol`

| Test | What it checks |
|---|---|
| `test_an_observer_cannot_claim_a_seen_id_with_their_own_signature` | The SR-01 capture, failing: an observer's self-signed `publishFor` and their direct `publish` both revert with `NotAttester`, and the real author's claim relayed by the attester is recorded. |
| `test_an_observer_cannot_have_the_attester_name_them_either` | An author's signature relayed under another name does not recover, so even the attester cannot misname an author. |
| `test_the_attackers_own_signature_relayed_by_the_attester_is_the_only_way` | States where the trust sits: only the attester vouching for an address records it, which the agent does only for whoever it crafted for. |

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
| `invariant_OnlyTheAttesterPublishes` | The attester stays the one the owner set, whatever the owner does, and every recorded author is one the handler published. |
| `invariant_AllowanceLiquidityBoundHolds` | The remaining allowance can never exceed its contract balance. |

### Stateless laws: `ProtocolLawStatelessTest`

| Test | What it checks |
|---|---|
| `testFuzz_quoteEqualsExecution` | For varied payments and valid fees, `quote` exactly matches the later craft credits. |
| `test_unknownOrZeroPaymentDoesNotChangeState` | Zero payments and unknown recipe IDs revert without creating a balance or liability. |
| `test_publishForCannotSubstituteSigner` | A valid signature cannot be rebound to a different author address. |
| `test_attesterGatesBothRoutes` | `publish` and `publishFor` revert for anyone but the attester; only the owner appoints one, never the zero address; after a rotation the new attester relays and the old one cannot. |
| `test_allowanceRejectsOutsiderAndOverCap` | Non-agents cannot draw and agents cannot exceed the cap. |
| `test_failedWithdrawalIsAtomic` | When an ETH recipient rejects payment, their vault credit and total liability stay unchanged. |
| `testFuzz_creditUpdatesAccountAndLiability` | For varied beneficiaries and amounts, vault credit increases the individual balance and total liability equally. |
| `testFuzz_remainingMatchesCapAndLiquidity` | For varied funding and cap values, allowance remaining is the smaller of cap and liquidity. |
| `test_republishAndOwnerTransitionAreBounded` | Duplicate publishing, unauthorized fee edits, zero owners, excessive fees, and former-owner edits all revert. |
| `test_allowanceOwnerBoundariesAndAgentRotation` | Only the owner configures the allowance; the new agent, and no former agent, can draw after rotation. |
| `testFuzz_failedAllowanceDrawDoesNotChangeState` | An over-limit draw fails atomically, leaving both spent amount and ETH balance unchanged. |
| `test_reentrantWithdrawalCannotSpendLiabilityTwice` | A recipient cannot reenter `withdraw` to withdraw the same vault credit twice. |
