// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Allowance} from "../src/Allowance.sol";
import {RecipeBook} from "../src/RecipeBook.sol";
import {SplitVault} from "../src/SplitVault.sol";

/// @notice Bounded command generator for the stateful protocol invariant suite.
contract ProtocolHandler is Test {
    RecipeBook public immutable book;
    SplitVault public immutable vault;
    Allowance public immutable allowance;
    address public immutable owner;

    address public expectedBookOwner;
    address public expectedAgent;

    uint256[4] internal keys = [uint256(0xA11CE), 0xB0B, 0xCA11, 0xD00D];
    bytes32[8] internal ids;
    address[8] internal authors;
    bool[8] internal published;
    uint256[8] internal expectedCrafts;
    uint256[8] internal expectedEarned;

    uint256 public ghostCredits;
    uint256 public ghostWithdrawals;

    constructor(RecipeBook book_, SplitVault vault_, Allowance allowance_, address owner_) {
        book = book_;
        vault = vault_;
        allowance = allowance_;
        owner = owner_;
        expectedBookOwner = owner_;
        expectedAgent = allowance_.agent();
        for (uint256 i; i < ids.length; ++i) {
            ids[i] = keccak256(abi.encode("voxelbench-recipe", i));
        }
    }

    receive() external payable {}

    function actor(uint256 seed) public view returns (address) {
        return vm.addr(keys[seed % keys.length]);
    }

    function _key(uint256 seed) internal view returns (uint256) {
        return keys[seed % keys.length];
    }

    function recipeId(uint256 seed) external view returns (bytes32) {
        return ids[seed % ids.length];
    }

    function trackedActor(uint256 index) external view returns (address) {
        if (index < keys.length) return actor(index);
        return owner;
    }

    function trackedCount() external pure returns (uint256) {
        return 5;
    }

    function recipeExpected(bytes32 id)
        external
        view
        returns (bool exists, address expectedAuthor, uint256 crafts, uint256 earned)
    {
        for (uint256 i; i < ids.length; ++i) {
            if (ids[i] == id) return (published[i], authors[i], expectedCrafts[i], expectedEarned[i]);
        }
    }

    function publish(uint256 idSeed, uint256 authorSeed) public {
        uint256 i = idSeed % ids.length;
        if (published[i]) return;

        address author = actor(authorSeed);
        bytes32 digest = book.publishDigest(ids[i], author);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key(authorSeed), digest);
        book.publishFor(ids[i], author, abi.encodePacked(r, s, v));

        published[i] = true;
        authors[i] = author;
    }

    function _ensurePublished(uint256 idSeed, uint256 authorSeed) internal returns (uint256 i) {
        i = idSeed % ids.length;
        if (!published[i]) publish(idSeed, authorSeed);
    }

    function craft(uint256 idSeed, uint256 authorSeed, uint96 amountSeed) public {
        uint256 i = _ensurePublished(idSeed, authorSeed);
        uint256 amount = bound(uint256(amountSeed), 1, 10 ether);
        address payer = actor(authorSeed + 1);
        vm.deal(payer, amount);

        uint256 toPlatform = (amount * book.platformBps()) / 10_000;
        uint256 toAuthor = amount - toPlatform;
        vm.prank(payer);
        book.craft{value: amount}(ids[i]);

        ghostCredits += amount;
        expectedCrafts[i]++;
        expectedEarned[i] += toAuthor;
    }

    function directCredit(uint256 accountSeed, uint96 amountSeed) public {
        address beneficiary = actor(accountSeed);
        uint256 amount = bound(uint256(amountSeed), 1, 10 ether);
        vm.deal(address(this), amount);
        vault.credit{value: amount}(beneficiary);
        ghostCredits += amount;
    }

    function withdraw(uint256 accountSeed) public {
        address beneficiary = actor(accountSeed);
        uint256 amount = vault.balanceOf(beneficiary);
        if (amount == 0) return;
        vm.prank(beneficiary);
        vault.withdraw();
        ghostWithdrawals += amount;
    }

    function setPlatform(uint256 bpsSeed) public {
        uint16 bps = uint16(bound(bpsSeed, 0, book.MAX_PLATFORM_BPS()));
        vm.prank(expectedBookOwner);
        book.setPlatformBps(bps);
    }

    function setBookOwner(uint256 ownerSeed) public {
        address nextOwner = actor(ownerSeed);
        vm.prank(expectedBookOwner);
        book.setOwner(nextOwner);
        expectedBookOwner = nextOwner;
    }

    function draw(uint96 amountSeed) public {
        uint256 left = allowance.remaining();
        if (left == 0) return;
        uint256 amount = bound(uint256(amountSeed), 1, left);
        vm.prank(expectedAgent);
        allowance.draw(amount);
    }

    function fundAllowance(uint96 amountSeed) public {
        uint256 amount = bound(uint256(amountSeed), 1, 10 ether);
        vm.deal(address(this), amount);
        (bool ok,) = address(allowance).call{value: amount}("");
        assertTrue(ok);
    }

    function sweepAllowance() public {
        vm.prank(owner);
        allowance.sweep();
    }

    function setCap(uint96 capSeed, uint32 windowSeed) public {
        uint256 cap = bound(uint256(capSeed), 0, 20 ether);
        uint64 window = uint64(bound(uint256(windowSeed), 1 hours, 7 days));
        vm.prank(owner);
        allowance.setCap(cap, window);
    }

    function setAgent(uint256 agentSeed) public {
        address nextAgent = actor(agentSeed);
        vm.prank(owner);
        allowance.setAgent(nextAgent);
        expectedAgent = nextAgent;
    }

    function syncInitialAgent(address agent_) external {
        require(msg.sender == owner, "owner only");
        require(allowance.agent() == agent_, "wrong agent");
        expectedAgent = agent_;
    }

    function advance(uint32 secondsSeed) public {
        vm.warp(block.timestamp + bound(uint256(secondsSeed), 0, 2 days));
    }
}
