// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Allowance
/// @notice The agent's spending money, and the ceiling on it.
///
/// The agent does not hold funds. It draws them from here, and this refuses
/// past the cap. That is the difference between a limit and a request: nothing
/// here asks the agent to behave, and there is no instruction it could be
/// argued out of, because the money it cannot draw is money it does not have.
///
/// The x402 client enforces a per-payment cap of its own, before a payment is
/// even constructed. This is the other half: a cap over time, held somewhere
/// the agent cannot reach. Either alone is a control the same system operates.
/// Together they are a control and a bound.
///
/// Raising the cap is the owner's, and is meant to be the moment a human is
/// asked. A prepaid card, not your credit card.
contract Allowance {
    address public owner;
    address public agent;

    /// @notice The most the agent may draw within one window.
    uint256 public cap;

    /// @notice How long a window lasts. Windows do not slide; the first draw
    /// after one expires starts the next, which is cheaper than tracking a
    /// rolling sum and is honest about what it measures.
    uint64 public window;

    uint64 public windowStartedAt;
    uint256 public drawnThisWindow;

    event Funded(address indexed from, uint256 amount);
    event Drawn(address indexed agent, uint256 amount, uint256 remaining);
    event CapChanged(uint256 cap, uint64 window);
    event AgentChanged(address indexed agent);
    event Swept(uint256 amount);

    error NotOwner();
    error NotAgent();
    error OverCap(uint256 requested, uint256 remaining);
    error NothingRequested();
    error TransferFailed();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address agent_, uint256 cap_, uint64 window_) payable {
        if (agent_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = agent_;
        cap = cap_;
        window = window_ == 0 ? 1 days : window_;
        windowStartedAt = uint64(block.timestamp);
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    /// @notice Anyone may top it up; only the agent may take from it.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice What the agent could still draw right now.
    function remaining() public view returns (uint256) {
        uint256 drawn = _expired() ? 0 : drawnThisWindow;
        uint256 left = cap > drawn ? cap - drawn : 0;
        uint256 held = address(this).balance;
        return left < held ? left : held;
    }

    function _expired() internal view returns (bool) {
        return block.timestamp >= windowStartedAt + window;
    }

    /// @notice Take up to the cap. Reverts rather than sending less, so a
    /// caller that asked for too much finds out instead of half-succeeding.
    function draw(uint256 amount) external {
        if (msg.sender != agent) revert NotAgent();
        if (amount == 0) revert NothingRequested();

        if (_expired()) {
            windowStartedAt = uint64(block.timestamp);
            drawnThisWindow = 0;
        }

        uint256 left = remaining();
        if (amount > left) revert OverCap(amount, left);

        drawnThisWindow += amount;

        (bool ok, ) = agent.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Drawn(agent, amount, remaining());
    }

    /// @notice The human's decision. Everything else here runs without one.
    function setCap(uint256 cap_, uint64 window_) external onlyOwner {
        cap = cap_;
        if (window_ != 0) window = window_;
        emit CapChanged(cap, window);
    }

    function setAgent(address agent_) external onlyOwner {
        if (agent_ == address(0)) revert ZeroAddress();
        agent = agent_;
        emit AgentChanged(agent_);
    }

    /// @notice Take it all back. The point of holding the funds here rather
    /// than in the agent's wallet is that this is possible at any moment.
    function sweep() external onlyOwner {
        uint256 amount = address(this).balance;
        (bool ok, ) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Swept(amount);
    }
}
