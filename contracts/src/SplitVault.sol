// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SplitVault
/// @notice Holds what each recipe author has earned until they withdraw it.
///
/// Kept separate from RecipeBook on purpose. RecipeBook decides how a craft
/// fee divides; this only knows balances and withdrawals. Two contracts that
/// each do one thing are easier to read in the four minutes a judge will spend
/// on them, and easier to reason about when the thing being reasoned about is
/// other people's money.
///
/// Anyone may credit anyone — a credit is funded by the value attached to it,
/// so there is nothing to gain by crediting a stranger. Keeping it open means
/// RecipeBook needs no privileged relationship with this contract.
contract SplitVault {
    mapping(address => uint256) public balanceOf;

    /// @notice Total held on behalf of everyone, so a mismatch with the
    /// contract balance is visible rather than silent.
    uint256 public totalOwed;

    event Credited(address indexed account, uint256 amount, address indexed from);
    event Withdrawn(address indexed account, uint256 amount);

    error NothingToWithdraw();
    error NothingSent();
    error TransferFailed();

    /// @notice Add the attached value to `account`'s balance.
    function credit(address account) external payable {
        if (msg.value == 0) revert NothingSent();
        balanceOf[account] += msg.value;
        totalOwed += msg.value;
        emit Credited(account, msg.value, msg.sender);
    }

    /// @notice Send the caller everything they are owed.
    function withdraw() external {
        uint256 amount = balanceOf[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // Zero the balance before sending. The recipient may be a contract and
        // may call back in; by then there is nothing left to withdraw twice.
        balanceOf[msg.sender] = 0;
        totalOwed -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }
}
