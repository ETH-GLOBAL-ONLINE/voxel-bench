// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RecipeBook } from "../src/RecipeBook.sol";
import { SplitVault } from "../src/SplitVault.sol";

contract RecipeBookTest is Test {
    SplitVault vault;
    RecipeBook book;

    uint256 authorKey = 0xA47;
    address author;
    address crafter = address(0xC24);
    address attacker = address(0xBAD);
    address platform;

    bytes32 constant RECIPE = keccak256("market_stall");

    function setUp() public {
        platform = address(this);
        author = vm.addr(authorKey);
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000); // 10% platform
    }

    function _signature(bytes32 recipe, address signer)
        internal
        view
        returns (bytes memory)
    {
        uint256 key = signer == author ? authorKey : 0xB0B;
        bytes32 digest = book.publishDigest(recipe, signer);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _publishAsAuthor(bytes32 recipe) internal {
        book.publishFor(recipe, author, _signature(recipe, author));
    }

    function test_publish_records_the_author() public {
        _publishAsAuthor(RECIPE);
        assertEq(book.authorOf(RECIPE), author);
    }

    function test_direct_publish_is_disabled() public {
        vm.prank(attacker);
        vm.expectRevert(RecipeBook.DirectPublishDisabled.selector);
        book.publish(RECIPE);
    }

    function test_relayer_cannot_steal_signed_authorship() public {
        vm.prank(attacker);
        book.publishFor(RECIPE, author, _signature(RECIPE, author));

        assertEq(book.authorOf(RECIPE), author);
    }

    function test_attacker_cannot_publish_with_wrong_signature() public {
        vm.prank(attacker);
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, author, _signature(RECIPE, attacker));
    }

    function test_republishing_cannot_steal_authorship() public {
        _publishAsAuthor(RECIPE);

        vm.prank(crafter);
        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.publishFor(RECIPE, crafter, _signature(RECIPE, crafter));
    }

    function test_craft_splits_and_counts() public {
        _publishAsAuthor(RECIPE);

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
        _publishAsAuthor(RECIPE);
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE);

        assertEq(address(book).balance, 0);
        assertEq(address(vault).balance, 1 ether);
    }

    function test_author_withdraws_what_they_earned() public {
        _publishAsAuthor(RECIPE);
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
        bytes32 digest = b.publishDigest(RECIPE, author);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorKey, digest);
        b.publishFor(RECIPE, author, abi.encodePacked(r, s, v));

        vm.deal(crafter, paid);
        vm.prank(crafter);
        b.craft{value: paid}(RECIPE);

        assertEq(vault.balanceOf(author) + vault.balanceOf(platform), paid);
    }

    // ── publishing on someone else's behalf ──────────────────────────────

    uint256 constant AUTHOR_KEY = 0xA11CE;

    function _digest(bytes32 recipeId, address who) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("VoxelBench RecipeBook"),
                keccak256("1"),
                block.chainid,
                address(book)
            )
        );
        return keccak256(
            abi.encodePacked(
                hex"1901",
                domain,
                keccak256(abi.encode(book.PUBLISH_TYPEHASH(), recipeId, who))
            )
        );
    }

    function _sign(uint256 key, bytes32 recipeId, address who)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(recipeId, who));
        return abi.encodePacked(r, s, v);
    }

    function test_publishFor_credits_the_signer_not_the_sender() public {
        address signer = vm.addr(AUTHOR_KEY);
        bytes memory signature = _sign(AUTHOR_KEY, RECIPE, signer);

        // Anyone may relay, and relaying gains them nothing.
        vm.prank(crafter);
        book.publishFor(RECIPE, signer, signature);

        assertEq(book.authorOf(RECIPE), signer);
    }

    function test_publishFor_refuses_a_substituted_author() public {
        address signer = vm.addr(AUTHOR_KEY);
        bytes memory signature = _sign(AUTHOR_KEY, RECIPE, signer);

        // The relayer swaps in their own address. The signature no longer
        // recovers to it, which is the whole protection.
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, crafter, signature);
    }

    function test_publishFor_refuses_a_signature_for_another_recipe() public {
        address signer = vm.addr(AUTHOR_KEY);
        bytes memory signature = _sign(AUTHOR_KEY, keccak256("something_else"), signer);

        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, signer, signature);
    }

    function test_publishFor_cannot_take_an_existing_recipe() public {
        vm.prank(author);
        book.publish(RECIPE);

        address signer = vm.addr(AUTHOR_KEY);
        bytes memory signature = _sign(AUTHOR_KEY, RECIPE, signer);

        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.publishFor(RECIPE, signer, signature);
        assertEq(book.authorOf(RECIPE), author);
    }

    function test_publishFor_refuses_a_malformed_signature() public {
        address signer = vm.addr(AUTHOR_KEY);

        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, signer, hex"1234");
    }

    function test_a_relayed_author_is_paid_like_any_other() public {
        address signer = vm.addr(AUTHOR_KEY);
        book.publishFor(RECIPE, signer, _sign(AUTHOR_KEY, RECIPE, signer));

        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{ value: 1 ether }(RECIPE);

        assertEq(vault.balanceOf(signer), 0.9 ether);
    }
}
