// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Allowance } from "../src/Allowance.sol";

contract AllowanceTest is Test {
    Allowance allowance;

    address owner;
    address agent = address(0xA9E);

    uint256 constant CAP = 1 ether;
    uint64 constant WINDOW = 1 days;

    function setUp() public {
        owner = address(this);
        allowance = new Allowance{value: 10 ether}(agent, CAP, WINDOW);
    }

    receive() external payable {}

    function test_agent_draws_within_the_cap() public {
        vm.prank(agent);
        allowance.draw(0.4 ether);

        assertEq(agent.balance, 0.4 ether);
        assertEq(allowance.remaining(), 0.6 ether);
    }

    function test_the_cap_is_a_wall_not_a_suggestion() public {
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(Allowance.OverCap.selector, 1.5 ether, CAP)
        );
        allowance.draw(1.5 ether);

        assertEq(agent.balance, 0);
    }

    function test_the_agent_cannot_raise_its_own_cap() public {
        vm.prank(agent);
        vm.expectRevert(Allowance.NotOwner.selector);
        allowance.setCap(100 ether, WINDOW);
    }

    function test_nobody_else_can_draw() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(Allowance.NotAgent.selector);
        allowance.draw(0.1 ether);
    }

    function test_draws_accumulate_inside_one_window() public {
        vm.startPrank(agent);
        allowance.draw(0.6 ether);
        allowance.draw(0.4 ether);

        vm.expectRevert(
            abi.encodeWithSelector(Allowance.OverCap.selector, 1, 0)
        );
        allowance.draw(1);
        vm.stopPrank();

        assertEq(agent.balance, CAP);
    }

    function test_the_window_resets() public {
        vm.prank(agent);
        allowance.draw(CAP);
        assertEq(allowance.remaining(), 0);

        skip(WINDOW + 1);
        assertEq(allowance.remaining(), CAP);

        vm.prank(agent);
        allowance.draw(CAP);
        assertEq(agent.balance, 2 * CAP);
    }

    function test_the_cap_cannot_outrun_the_balance() public {
        Allowance small = new Allowance{value: 0.1 ether}(agent, 5 ether, WINDOW);

        // The cap says 5 ether; there is 0.1 ether. remaining() reports what can
        // actually be paid, not what is nominally permitted.
        assertEq(small.remaining(), 0.1 ether);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(Allowance.OverCap.selector, 1 ether, 0.1 ether)
        );
        small.draw(1 ether);
    }

    function test_the_owner_can_take_it_all_back() public {
        uint256 before = owner.balance;
        allowance.sweep();

        assertEq(address(allowance).balance, 0);
        assertEq(owner.balance, before + 10 ether);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(Allowance.OverCap.selector, 0.1 ether, 0)
        );
        allowance.draw(0.1 ether);
    }

    function test_raising_the_cap_takes_effect() public {
        vm.prank(agent);
        allowance.draw(CAP);

        allowance.setCap(3 ether, WINDOW);
        assertEq(allowance.remaining(), 2 ether);

        vm.prank(agent);
        allowance.draw(2 ether);
        assertEq(agent.balance, 3 ether);
    }

    function testFuzz_the_agent_never_exceeds_the_cap_in_a_window(
        uint96 a,
        uint96 b
    ) public {
        vm.assume(a > 0 && b > 0);
        vm.assume(uint256(a) + uint256(b) < 9 ether);

        vm.startPrank(agent);
        if (a <= CAP) allowance.draw(a);
        uint256 left = allowance.remaining();
        if (b <= left && b > 0) allowance.draw(b);
        vm.stopPrank();

        assertLe(agent.balance, CAP);
    }
}
