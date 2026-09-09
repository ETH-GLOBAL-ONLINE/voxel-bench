// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RecipeBook } from "../src/RecipeBook.sol";
import { SplitVault } from "../src/SplitVault.sol";

contract RecipeBookTest is Test {
    SplitVault vault;
    RecipeBook book;

    address author = address(0xA47);
    address crafter = address(0xC24);
    address platform;

    bytes32 constant RECIPE = keccak256("market_stall");

    function setUp() public {
        platform = address(this);
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000); // 10% platform
    }

    function test_publish_records_the_author() public {
        vm.prank(author);
        book.publish(RECIPE);
        assertEq(book.authorOf(RECIPE), author);
    }

    function test_republishing_cannot_steal_authorship() public {
        vm.prank(author);
        book.publish(RECIPE);

        vm.prank(crafter);
        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.publish(RECIPE);
    }

    function test_craft_splits_and_counts() public {
        vm.prank(author);
        book.publish(RECIPE);

        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE);

        // 10% to the platform, the rest to the author
        assertEq(vault.balanceOf(author), 0.9 ether);
        assertEq(vault.balanceOf(platform), 0.1 ether);
        assertEq(vault.totalOwed(), 1 ether);

        (, uint64 crafts, uint128 earned) = book.recipes(RECIPE);
        assertEq(crafts, 1);
        assertEq(earned, 0.9 ether);
    }

    function test_crafting_an_unknown_recipe_reverts() public {
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.UnknownRecipe.selector);
        book.craft{value: 1 ether}(RECIPE);
    }

    function test_the_contract_never_holds_the_money() public {
        vm.prank(author);
        book.publish(RECIPE);
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE);

        assertEq(address(book).balance, 0);
        assertEq(address(vault).balance, 1 ether);
    }

    function test_author_withdraws_what_they_earned() public {
        vm.prank(author);
        book.publish(RECIPE);
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE);

        vm.prank(author);
        vault.withdraw();

        assertEq(author.balance, 0.9 ether);
        assertEq(vault.balanceOf(author), 0);
        assertEq(vault.totalOwed(), 0.1 ether);
    }

    function test_platform_share_is_capped() public {
        vm.expectRevert(RecipeBook.ShareTooHigh.selector);
        new RecipeBook(address(vault), 3001);
    }

    function test_only_the_owner_moves_the_platform_share() public {
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.NotOwner.selector);
        book.setPlatformBps(500);
    }

    function testFuzz_split_never_loses_or_invents_value(uint96 paid, uint16 bps)
        public
    {
        vm.assume(paid > 0);
        bps = uint16(bound(bps, 0, book.MAX_PLATFORM_BPS()));

        RecipeBook b = new RecipeBook(address(vault), bps);
        vm.prank(author);
        b.publish(RECIPE);

        vm.deal(crafter, paid);
        vm.prank(crafter);
        b.craft{value: paid}(RECIPE);

        assertEq(vault.balanceOf(author) + vault.balanceOf(platform), paid);
    }
}
