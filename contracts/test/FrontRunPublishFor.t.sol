// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RecipeBook } from "../src/RecipeBook.sol";
import { SplitVault } from "../src/SplitVault.sol";

/// First-observer capture through the signed route. An attacker who has only
/// seen a recipe id signs a claim naming themselves. publishFor checks that the
/// signature matches the author it is handed, and it does.
contract FrontRunPublishForTest is Test {
    RecipeBook book;
    SplitVault vault;

    uint256 victimKey = 0xA11CE;
    uint256 attackerKey = 0xBAD;
    address victim;
    address attacker;
    bytes32 constant RECIPE = keccak256("a small red mailbox");

    function setUp() public {
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000);
        victim = vm.addr(victimKey);
        attacker = vm.addr(attackerKey);
    }

    function _digest(bytes32 recipeId, address author) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("VoxelBench RecipeBook"),
                keccak256("1"),
                block.chainid,
                address(book)
            )
        );
        bytes32 structHash = keccak256(abi.encode(book.PUBLISH_TYPEHASH(), recipeId, author));
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_an_observer_claims_a_seen_id_with_their_own_signature() public {
        // The attacker never sees the victim's signature, only the id.
        bytes memory attackerSig = _sign(attackerKey, _digest(RECIPE, attacker));
        vm.prank(attacker);
        book.publishFor(RECIPE, attacker, attackerSig);
        assertEq(book.authorOf(RECIPE), attacker);

        // The real author's valid claim now fails.
        bytes memory victimSig = _sign(victimKey, _digest(RECIPE, victim));
        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.publishFor(RECIPE, victim, victimSig);
    }
}
