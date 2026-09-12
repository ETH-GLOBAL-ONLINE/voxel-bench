// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RecipeBook } from "../src/RecipeBook.sol";
import { SplitVault } from "../src/SplitVault.sol";

contract RecipeBookTest is Test {
    SplitVault vault;
    RecipeBook book;

    // The test contract deploys the book, so it is the owner, the attester
    // and the platform, which is how the real deployment is arranged too.
    address platform;
    address crafter = address(0xC24);

    uint256 constant AUTHOR_KEY = 0xA11CE;
    address author;

    bytes32 constant RECIPE = keccak256("market_stall");

    event RecipePublished(bytes32 indexed recipeId, address indexed author);
    event MigrationSealed();

    function setUp() public {
        platform = address(this);
        author = vm.addr(AUTHOR_KEY);
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000); // 10% platform
    }

    function _sign(RecipeBook target, uint256 key, bytes32 recipeId, address who)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, target.publishDigest(recipeId, who));
        return abi.encodePacked(r, s, v);
    }

    /// The author signs, and the attester — this contract — relays.
    function _own(bytes32 recipeId) internal {
        book.publishFor(recipeId, author, _sign(book, AUTHOR_KEY, recipeId, author));
    }

    // ── who may record an author ───────────────────────────────────────────

    function test_the_platform_publishes_its_own_stock() public {
        book.publish(RECIPE);
        assertEq(book.authorOf(RECIPE), platform);
    }

    function test_nobody_else_publishes_directly() public {
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publish(RECIPE);
        assertEq(book.authorOf(RECIPE), address(0));
    }

    function test_republishing_cannot_steal_authorship() public {
        _own(RECIPE);

        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.publish(RECIPE);

        uint256 otherKey = 0xB0B;
        address other = vm.addr(otherKey);
        // Signed first: the digest is a call too, and the expected revert
        // applies to the next one.
        bytes memory otherSig = _sign(book, otherKey, RECIPE, other);
        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.publishFor(RECIPE, other, otherSig);

        assertEq(book.authorOf(RECIPE), author);
    }

    function test_publishFor_is_relayed_only_by_the_attester() public {
        bytes memory signature = _sign(book, AUTHOR_KEY, RECIPE, author);

        // A perfectly valid claim, in the wrong hands.
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publishFor(RECIPE, author, signature);
        assertEq(book.authorOf(RECIPE), address(0));

        // The same claim, relayed by the attester.
        book.publishFor(RECIPE, author, signature);
        assertEq(book.authorOf(RECIPE), author);
    }

    function test_only_the_owner_appoints_the_attester() public {
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.NotOwner.selector);
        book.setAttester(crafter);

        vm.expectRevert(RecipeBook.ZeroAddress.selector);
        book.setAttester(address(0));

        assertEq(book.attester(), platform);
    }

    function test_a_new_attester_takes_over() public {
        book.setAttester(crafter);
        assertEq(book.attester(), crafter);

        // The old key records nothing any more.
        vm.expectRevert(RecipeBook.NotAttester.selector);
        book.publish(RECIPE);

        bytes memory signature = _sign(book, AUTHOR_KEY, RECIPE, author);
        vm.prank(crafter);
        book.publishFor(RECIPE, author, signature);
        assertEq(book.authorOf(RECIPE), author);
    }

    // ── crafting and the split ─────────────────────────────────────────────

    function test_craft_splits_and_counts() public {
        _own(RECIPE);

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
        _own(RECIPE);
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(RECIPE);

        assertEq(address(book).balance, 0);
        assertEq(address(vault).balance, 1 ether);
    }

    function test_author_withdraws_what_they_earned() public {
        _own(RECIPE);
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
        b.publishFor(RECIPE, author, _sign(b, AUTHOR_KEY, RECIPE, author));

        vm.deal(crafter, paid);
        vm.prank(crafter);
        b.craft{value: paid}(RECIPE);

        assertEq(vault.balanceOf(author) + vault.balanceOf(platform), paid);
    }

    // ── the signature ──────────────────────────────────────────────────────

    /// The digest the contract exposes is the EIP-712 digest, built by hand
    /// here so that a drift in the domain would show up.
    function test_publishDigest_is_the_eip712_digest() public view {
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
        bytes32 expected = keccak256(
            abi.encodePacked(
                hex"1901",
                domain,
                keccak256(abi.encode(book.PUBLISH_TYPEHASH(), RECIPE, author))
            )
        );
        assertEq(book.publishDigest(RECIPE, author), expected);
    }

    function test_publishFor_credits_the_signer_not_the_relayer() public {
        book.publishFor(RECIPE, author, _sign(book, AUTHOR_KEY, RECIPE, author));
        assertEq(book.authorOf(RECIPE), author);
        assertTrue(book.authorOf(RECIPE) != platform);
    }

    function test_publishFor_refuses_a_substituted_author() public {
        bytes memory signature = _sign(book, AUTHOR_KEY, RECIPE, author);

        // The relayer swaps in another address. The signature no longer
        // recovers to it, so even the attester cannot misname an author.
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, crafter, signature);
    }

    function test_publishFor_refuses_a_signature_for_another_recipe() public {
        bytes memory signature = _sign(book, AUTHOR_KEY, keccak256("something_else"), author);

        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, author, signature);
    }

    function test_publishFor_refuses_a_malformed_signature() public {
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(RECIPE, author, hex"1234");
    }

    function test_a_relayed_author_is_paid_like_any_other() public {
        _own(RECIPE);

        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{ value: 1 ether }(RECIPE);

        assertEq(vault.balanceOf(author), 0.9 ether);
    }

    // ── carrying an earlier book over ──────────────────────────────────────

    bytes32 constant OLD_A = keccak256("pine_tree");
    bytes32 constant OLD_B = keccak256("mailbox");

    function _migration()
        internal
        view
        returns (bytes32[] memory ids, address[] memory authors, uint64[] memory crafts, uint128[] memory earned)
    {
        ids = new bytes32[](2);
        authors = new address[](2);
        crafts = new uint64[](2);
        earned = new uint128[](2);
        ids[0] = OLD_A;
        authors[0] = author;
        crafts[0] = 3;
        earned[0] = 2.7 ether;
        ids[1] = OLD_B;
        authors[1] = platform;
        crafts[1] = 0;
        earned[1] = 0;
    }

    function test_migration_carries_recipes_over() public {
        (bytes32[] memory ids, address[] memory authors, uint64[] memory crafts, uint128[] memory earned) =
            _migration();

        vm.expectEmit(true, true, false, true, address(book));
        emit RecipePublished(OLD_A, author);
        vm.expectEmit(true, true, false, true, address(book));
        emit RecipePublished(OLD_B, platform);
        book.migrate(ids, authors, crafts, earned);

        (address a, uint64 c, uint128 e) = book.recipes(OLD_A);
        assertEq(a, author);
        assertEq(c, 3);
        assertEq(e, 2.7 ether);
        assertEq(book.authorOf(OLD_B), platform);

        // Life goes on from the carried-over count.
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        book.craft{value: 1 ether}(OLD_A);
        (, c, e) = book.recipes(OLD_A);
        assertEq(c, 4);
        assertEq(e, 3.6 ether);
        // The vault only ever sees the new craft: earlier earnings were
        // credited there by the old book already.
        assertEq(vault.balanceOf(author), 0.9 ether);
    }

    function test_migration_is_the_owners_alone() public {
        (bytes32[] memory ids, address[] memory authors, uint64[] memory crafts, uint128[] memory earned) =
            _migration();
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.NotOwner.selector);
        book.migrate(ids, authors, crafts, earned);
        assertEq(book.authorOf(OLD_A), address(0));
    }

    function test_migration_refuses_mismatched_lists() public {
        (bytes32[] memory ids, address[] memory authors,, uint128[] memory earned) = _migration();
        uint64[] memory crafts = new uint64[](1);
        vm.expectRevert(RecipeBook.LengthMismatch.selector);
        book.migrate(ids, authors, crafts, earned);
    }

    function test_migration_refuses_a_zero_author() public {
        (bytes32[] memory ids, address[] memory authors, uint64[] memory crafts, uint128[] memory earned) =
            _migration();
        authors[1] = address(0);
        vm.expectRevert(RecipeBook.ZeroAddress.selector);
        book.migrate(ids, authors, crafts, earned);
    }

    function test_migration_cannot_overwrite_an_author() public {
        (bytes32[] memory ids, address[] memory authors, uint64[] memory crafts, uint128[] memory earned) =
            _migration();
        book.migrate(ids, authors, crafts, earned);

        // Running it again, with different authors, changes nothing.
        authors[0] = crafter;
        vm.expectRevert(RecipeBook.AlreadyPublished.selector);
        book.migrate(ids, authors, crafts, earned);
        assertEq(book.authorOf(OLD_A), author);
    }

    function test_sealing_ends_the_migration_for_good() public {
        (bytes32[] memory ids, address[] memory authors, uint64[] memory crafts, uint128[] memory earned) =
            _migration();

        vm.prank(crafter);
        vm.expectRevert(RecipeBook.NotOwner.selector);
        book.sealMigration();

        vm.expectEmit(false, false, false, true, address(book));
        emit MigrationSealed();
        book.sealMigration();
        assertTrue(book.migrationSealed());

        vm.expectRevert(RecipeBook.Sealed.selector);
        book.migrate(ids, authors, crafts, earned);
        vm.expectRevert(RecipeBook.Sealed.selector);
        book.sealMigration();

        // Claims still work, of course: sealing closes the side door only.
        _own(RECIPE);
        assertEq(book.authorOf(RECIPE), author);
    }
}
