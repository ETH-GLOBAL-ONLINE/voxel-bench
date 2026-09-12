// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RecipeBook } from "../src/RecipeBook.sol";
import { SplitVault } from "../src/SplitVault.sol";

/// First-observer capture through the signed route, the audit's SR-01. An
/// attacker who has only seen a recipe id signs a claim naming themselves. The
/// signature is valid, and it used to be enough. It is not any more: a claim is
/// recorded only when relayed by the attester, and the attester relays a claim
/// only for the person it crafted the recipe for.
///
/// This file began as the discovery test that showed the capture working. It
/// is kept, turned around, so that the capture failing stays a tested fact.
contract FrontRunPublishForTest is Test {
    RecipeBook book;
    SplitVault vault;

    uint256 victimKey = 0xA11CE;
    uint256 attackerKey = 0xBAD;
    address victim;
    address attacker;
    bytes32 constant RECIPE = keccak256("a small red mailbox");

    // Deployed from here, so this contract is the attester.
    function setUp() public {
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000);
        victim = vm.addr(victimKey);
        attacker = vm.addr(attackerKey);
    }

    function _sign(uint256 key, bytes32 recipeId, address author) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, book.publishDigest(recipeId, author));
        return abi.encodePacked(r, s, v);
    }

    function test_an_observer_cannot_claim_a_seen_id_with_their_own_signature() public {
        // The attacker never sees the victim's signature, only the id, and
        // signs for themselves. Valid signature; wrong relayer.
        bytes memory attackerSig = _sign(attackerKey, RECIPE, attacker);
        vm.prank(attacker);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publishFor(RECIPE, attacker, attackerSig);
        assertEq(book.authorOf(RECIPE), address(0));

        // Nor by the direct route.
        vm.prank(attacker);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publish(RECIPE);
        assertEq(book.authorOf(RECIPE), address(0));

        // The real author's claim, relayed by the attester, goes through.
        book.publishFor(RECIPE, victim, _sign(victimKey, RECIPE, victim));
        assertEq(book.authorOf(RECIPE), victim);
    }

    function test_an_observer_cannot_have_the_attester_name_them_either() public {
        // Suppose the attacker got hold of the victim's signature and asked the
        // attester to relay it under the attacker's name. It does not recover.
        bytes memory victimSig = _sign(victimKey, RECIPE, victim);
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, attacker, victimSig);
        assertEq(book.authorOf(RECIPE), address(0));
    }

    function test_the_attackers_own_signature_relayed_by_the_attester_is_the_only_way() public {
        // What it would take: the attester itself vouching for the attacker.
        // The attester vouches only for whoever it crafted for (see
        // services/agent/crafted.mjs), which is the point of the design; the
        // contract cannot tell, and this shows where the trust sits.
        book.publishFor(RECIPE, attacker, _sign(attackerKey, RECIPE, attacker));
        assertEq(book.authorOf(RECIPE), attacker);
    }
}
