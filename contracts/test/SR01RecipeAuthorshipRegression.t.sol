// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RecipeBook} from "../src/RecipeBook.sol";
import {SplitVault} from "../src/SplitVault.sol";

/// @notice Regression coverage for SR-01, the former first-observer authorship capture.
contract SR01RecipeAuthorshipRegressionTest is Test {
    uint256 internal constant TRUE_AUTHOR_KEY = 0xA11CE;
    bytes32 internal constant RECIPE_ID = keccak256("private_recipe_content_hash");

    SplitVault internal vault;
    RecipeBook internal book;

    address internal trueAuthor;
    address internal attacker = address(0xBAD);
    address internal crafter = address(0xC24);

    function setUp() public {
        trueAuthor = vm.addr(TRUE_AUTHOR_KEY);
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000);
    }

    /// @dev Before the fix, this call assigned the attacker as author and routed
    /// future royalties to them. It must now always revert before recording an author.
    function testRegression_DirectPublishCannotCaptureAuthorship() public {
        vm.prank(attacker);
        vm.expectRevert(RecipeBook.DirectPublishDisabled.selector);
        book.publish(RECIPE_ID);

        assertEq(book.authorOf(RECIPE_ID), address(0));
    }

    /// @dev A relayer may submit a valid claim, but the EIP-712 signer is the
    /// author and receives the royalty share.
    function testFixed_SignedClaimCreditsAuthorWhenRelayedByAttacker() public {
        bytes memory signature = _sign(TRUE_AUTHOR_KEY, RECIPE_ID, trueAuthor);

        vm.prank(attacker);
        book.publishFor(RECIPE_ID, trueAuthor, signature);

        assertEq(book.authorOf(RECIPE_ID), trueAuthor);

        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE_ID);

        assertEq(vault.balanceOf(trueAuthor), 0.9 ether);
        assertEq(vault.balanceOf(attacker), 0);
    }

    function testFixed_AttackerCannotSubstituteTheirAddressForSigner() public {
        bytes memory signature = _sign(TRUE_AUTHOR_KEY, RECIPE_ID, trueAuthor);

        vm.prank(attacker);
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE_ID, attacker, signature);

        assertEq(book.authorOf(RECIPE_ID), address(0));
    }

    function _sign(uint256 key, bytes32 recipeId, address author)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, book.publishDigest(recipeId, author));
        return abi.encodePacked(r, s, v);
    }
}
