// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RecipeBook} from "../src/RecipeBook.sol";
import {SplitVault} from "../src/SplitVault.sol";

/// @notice Regression coverage for SR-01, authorship capture of an observed
/// recipe id. Written with the audit; adapted to the fix, which gates both
/// publishing routes behind the attester.
contract SR01RecipeAuthorshipRegressionTest is Test {
    uint256 internal constant TRUE_AUTHOR_KEY = 0xA11CE;
    uint256 internal constant ATTACKER_KEY = 0xBAD;
    bytes32 internal constant RECIPE_ID = keccak256("private_recipe_content_hash");

    SplitVault internal vault;
    RecipeBook internal book;

    address internal trueAuthor;
    address internal attacker;
    address internal crafter = address(0xC24);

    // This contract deploys the book and is therefore its attester.
    function setUp() public {
        trueAuthor = vm.addr(TRUE_AUTHOR_KEY);
        attacker = vm.addr(ATTACKER_KEY);
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000);
    }

    /// @dev The old direct route assigned the caller as author. Nobody but
    /// the attester can use it now.
    function testRegression_DirectPublishCannotCaptureAuthorship() public {
        vm.prank(attacker);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publish(RECIPE_ID);

        assertEq(book.authorOf(RECIPE_ID), address(0));
    }

    /// @dev The signed route had the same gap: an observer could self-sign a
    /// seen id and relay it. The signature is still valid; the relay is not.
    function testRegression_SelfSignedClaimCannotCaptureAuthorship() public {
        bytes memory signature = _sign(ATTACKER_KEY, RECIPE_ID, attacker);

        vm.prank(attacker);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publishFor(RECIPE_ID, attacker, signature);

        assertEq(book.authorOf(RECIPE_ID), address(0));
    }

    /// @dev A valid claim in the attacker's hands is worth nothing to them:
    /// they cannot relay it at all.
    function testFixed_AttackerCannotRelayEvenAValidClaim() public {
        bytes memory signature = _sign(TRUE_AUTHOR_KEY, RECIPE_ID, trueAuthor);

        vm.prank(attacker);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publishFor(RECIPE_ID, trueAuthor, signature);

        assertEq(book.authorOf(RECIPE_ID), address(0));
    }

    /// @dev The attester relays the true author's claim, and the author is
    /// credited and paid, not the relayer.
    function testFixed_SignedClaimCreditsAuthorWhenRelayedByAttester() public {
        bytes memory signature = _sign(TRUE_AUTHOR_KEY, RECIPE_ID, trueAuthor);
        book.publishFor(RECIPE_ID, trueAuthor, signature);

        assertEq(book.authorOf(RECIPE_ID), trueAuthor);

        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE_ID);

        assertEq(vault.balanceOf(trueAuthor), 0.9 ether);
        assertEq(vault.balanceOf(attacker), 0);
    }

    /// @dev Even the attester cannot put the wrong name on a signature.
    function testFixed_AttesterCannotSubstituteAddressForSigner() public {
        bytes memory signature = _sign(TRUE_AUTHOR_KEY, RECIPE_ID, trueAuthor);

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
