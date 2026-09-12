// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {Allowance} from "../src/Allowance.sol";
import {RecipeBook} from "../src/RecipeBook.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {ProtocolHandler} from "./ProtocolHandler.sol";

contract ProtocolFuzzTest is StdInvariant, Test {
    SplitVault internal vault;
    RecipeBook internal book;
    Allowance internal allowance;
    ProtocolHandler internal handler;

    receive() external payable {}

    function setUp() public {
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000);
        allowance = new Allowance{value: 100 ether}(address(0xA9E), 10 ether, 1 days);
        handler = new ProtocolHandler(book, vault, allowance, address(this));
        allowance.setAgent(address(handler));
        handler.syncInitialAgent(address(handler));

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.publish.selector;
        selectors[1] = handler.craft.selector;
        selectors[2] = handler.directCredit.selector;
        selectors[3] = handler.withdraw.selector;
        selectors[4] = handler.setPlatform.selector;
        selectors[5] = handler.draw.selector;
        selectors[6] = handler.fundAllowance.selector;
        selectors[7] = handler.sweepAllowance.selector;
        selectors[8] = handler.setCap.selector;
        selectors[9] = handler.advance.selector;
        selectors[10] = handler.setBookOwner.selector;
        selectors[11] = handler.setAgent.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_BookNeverRetainsValue() public view {
        assertEq(address(book).balance, 0);
    }

    function invariant_VaultIsSolvent() public view {
        assertGe(address(vault).balance, vault.totalOwed());
    }

    function invariant_TrackedVaultLiabilitiesMatchGhostFlow() public view {
        assertEq(vault.totalOwed(), handler.ghostCredits() - handler.ghostWithdrawals());
        uint256 sum;
        for (uint256 i; i < handler.trackedCount(); ++i) {
            sum += vault.balanceOf(handler.trackedActor(i));
        }
        assertEq(sum, vault.totalOwed());
    }

    function invariant_RecipeAccountingMatchesGhostState() public view {
        for (uint256 i; i < 8; ++i) {
            bytes32 id = handler.recipeId(i);
            (bool exists,, uint256 expectedCrafts, uint256 expectedEarned) = handler.recipeExpected(id);
            (address author, uint64 crafts, uint128 earned) = book.recipes(id);
            if (!exists) {
                assertEq(author, address(0));
                assertEq(crafts, 0);
                assertEq(earned, 0);
            } else {
                assertTrue(author != address(0));
                assertEq(uint256(crafts), expectedCrafts);
                assertEq(uint256(earned), expectedEarned);
            }
        }
    }

    function invariant_AllowanceRemainingFormula() public view {
        uint256 drawn = block.timestamp >= allowance.windowStartedAt() + allowance.window()
            ? 0
            : allowance.drawnThisWindow();
        uint256 byCap = allowance.cap() > drawn ? allowance.cap() - drawn : 0;
        uint256 expected = byCap < address(allowance).balance ? byCap : address(allowance).balance;
        assertEq(allowance.remaining(), expected);
    }

    function invariant_AllowanceAgentMatchesHandlerModel() public view {
        assertEq(allowance.agent(), handler.expectedAgent());
    }

    function invariant_BookOwnerMatchesHandlerModel() public view {
        assertEq(book.owner(), handler.expectedBookOwner());
    }
}

contract ProtocolLawStatelessTest is Test {
    uint256 internal constant AUTHOR_KEY = 0xA11CE;
    uint256 internal constant CRAFTER_KEY = 0xC24;
    bytes32 internal constant RECIPE = keccak256("stateless-recipe");

    SplitVault internal vault;
    RecipeBook internal book;
    address internal author;
    address internal crafter;

    receive() external payable {}

    function setUp() public {
        vault = new SplitVault();
        book = new RecipeBook(address(vault), 1000);
        author = vm.addr(AUTHOR_KEY);
        crafter = vm.addr(CRAFTER_KEY);
        _publish(book, RECIPE, author, AUTHOR_KEY);
    }

    function testFuzz_quoteEqualsExecution(uint96 paid, uint16 bps) public {
        paid = uint96(bound(paid, 1, 100 ether));
        bps = uint16(bound(bps, 0, book.MAX_PLATFORM_BPS()));
        book.setPlatformBps(bps);
        (uint256 authorPart, uint256 platformPart) = book.quote(paid);
        vm.deal(crafter, paid);
        vm.prank(crafter);
        book.craft{value: paid}(RECIPE);
        assertEq(authorPart + platformPart, paid);
        assertEq(vault.balanceOf(author), authorPart);
        assertEq(vault.balanceOf(address(this)), platformPart);
    }

    function test_unknownOrZeroPaymentDoesNotChangeState() public {
        vm.expectRevert(RecipeBook.NothingSent.selector);
        book.craft{value: 0}(RECIPE);
        vm.deal(crafter, 1 ether);
        vm.prank(crafter);
        vm.expectRevert(RecipeBook.UnknownRecipe.selector);
        book.craft{value: 1 ether}(keccak256("unknown"));
        assertEq(address(book).balance, 0);
        assertEq(vault.totalOwed(), 0);
    }

    function test_publishForCannotSubstituteSigner() public {
        bytes32 id = keccak256("relayed");
        bytes memory signature = _signature(book, AUTHOR_KEY, id, author);
        vm.expectRevert(RecipeBook.InvalidSignature.selector);
        book.publishFor(id, address(0xBAD), signature);
    }

    function test_allowanceRejectsOutsiderAndOverCap() public {
        Allowance a = new Allowance{value: 1 ether}(author, 1 ether, 1 days);
        vm.prank(address(0xBAD));
        vm.expectRevert(Allowance.NotAgent.selector);
        a.draw(1);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(Allowance.OverCap.selector, 1 ether + 1, 1 ether));
        a.draw(1 ether + 1);
    }

    function test_failedWithdrawalIsAtomic() public {
        RejectingReceiver receiver = new RejectingReceiver(vault);
        vm.deal(address(this), 1 ether);
        vault.credit{value: 1 ether}(address(receiver));
        vm.expectRevert(SplitVault.TransferFailed.selector);
        receiver.withdraw();
        assertEq(vault.balanceOf(address(receiver)), 1 ether);
        assertEq(vault.totalOwed(), 1 ether);
    }

    function testFuzz_creditUpdatesAccountAndLiability(address beneficiary, uint96 amountSeed) public {
        uint256 amount = bound(uint256(amountSeed), 1, 100 ether);
        uint256 beforeAccount = vault.balanceOf(beneficiary);
        uint256 beforeOwed = vault.totalOwed();
        vm.deal(address(this), amount);
        vault.credit{value: amount}(beneficiary);
        assertEq(vault.balanceOf(beneficiary), beforeAccount + amount);
        assertEq(vault.totalOwed(), beforeOwed + amount);
    }

    function testFuzz_remainingMatchesCapAndLiquidity(uint96 fundingSeed, uint96 capSeed) public {
        uint256 funding = bound(uint256(fundingSeed), 1, 100 ether);
        uint256 cap = bound(uint256(capSeed), 0, 100 ether);
        Allowance a = new Allowance{value: funding}(author, cap, 1 days);
        assertEq(a.remaining(), cap < funding ? cap : funding);
        assertLe(a.remaining(), address(a).balance);
    }

    function test_reentrantWithdrawalCannotSpendLiabilityTwice() public {
        ReentrantReceiver receiver = new ReentrantReceiver(vault);
        vm.deal(address(this), 1 ether);
        vault.credit{value: 1 ether}(address(receiver));
        receiver.withdraw();
        assertEq(address(receiver).balance, 1 ether);
        assertEq(receiver.reentrantSuccesses(), 0);
        assertEq(vault.balanceOf(address(receiver)), 0);
        assertEq(vault.totalOwed(), 0);
    }

    function _publish(RecipeBook target, bytes32 id, address who, uint256 key) internal {
        target.publishFor(id, who, _signature(target, key, id, who));
    }

    function _signature(RecipeBook target, uint256 key, bytes32 id, address who)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, target.publishDigest(id, who));
        return abi.encodePacked(r, s, v);
    }
}

contract RejectingReceiver {
    SplitVault internal immutable vault;
    constructor(SplitVault vault_) { vault = vault_; }
    function withdraw() external { vault.withdraw(); }
    receive() external payable { revert(); }
}

contract ReentrantReceiver {
    SplitVault internal immutable vault;
    uint256 public reentrantSuccesses;
    constructor(SplitVault vault_) { vault = vault_; }
    function withdraw() external { vault.withdraw(); }
    receive() external payable {
        (bool ok,) = address(vault).call(abi.encodeCall(SplitVault.withdraw, ()));
        if (ok) reentrantSuccesses++;
    }
}
