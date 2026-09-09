// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISplitVault {
    function credit(address account) external payable;
}

/// @title RecipeBook
/// @notice Who wrote which recipe, how often it has been crafted, and where
/// the fee goes when it is.
///
/// The words here are the words on the site and in the docs — recipe, author,
/// craft, crafter — so that reading the contract and using the product feel
/// like the same thing.
///
/// The contract does not set prices. What a craft costs is quoted by the
/// service that performs it, over x402, and the caller sends that amount here
/// to settle. This contract's job is only to divide it and record that it
/// happened, which is what an author needs in order to stop taking our word
/// for the count.
contract RecipeBook {
    struct Recipe {
        address author;
        uint64 crafts;
        uint128 earned; // lifetime, for the author's share only
    }

    /// @dev A recipe id is the hash of its content, so the same recipe is the
    /// same id no matter who publishes it, and republishing an existing one
    /// cannot steal its authorship.
    mapping(bytes32 => Recipe) public recipes;

    ISplitVault public immutable vault;
    address public owner;

    /// @notice The platform's share of a craft, in basis points. The author
    /// takes the remainder — most of it, which is the arrangement the whole
    /// pitch rests on, so it is capped rather than left to trust.
    uint16 public platformBps;
    uint16 public constant MAX_PLATFORM_BPS = 3000; // 30%

    event RecipePublished(bytes32 indexed recipeId, address indexed author);
    event Crafted(
        bytes32 indexed recipeId,
        address indexed crafter,
        address indexed author,
        uint256 paid,
        uint256 toAuthor
    );
    event PlatformBpsChanged(uint16 bps);
    event OwnerChanged(address indexed owner);

    error AlreadyPublished();
    error UnknownRecipe();
    error NothingSent();
    error ShareTooHigh();
    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address vault_, uint16 platformBps_) {
        if (vault_ == address(0)) revert ZeroAddress();
        if (platformBps_ > MAX_PLATFORM_BPS) revert ShareTooHigh();
        vault = ISplitVault(vault_);
        owner = msg.sender;
        platformBps = platformBps_;
    }

    /// @notice Claim authorship of a recipe. First publisher wins, and since
    /// the id is the hash of the content, that is the person who wrote it.
    function publish(bytes32 recipeId) external {
        if (recipes[recipeId].author != address(0)) revert AlreadyPublished();
        recipes[recipeId].author = msg.sender;
        emit RecipePublished(recipeId, msg.sender);
    }

    /// @notice Settle a craft: split the fee, credit both sides, count it.
    /// @dev Value is forwarded to the vault rather than held here, so this
    /// contract never has a balance worth attacking.
    function craft(bytes32 recipeId) external payable {
        if (msg.value == 0) revert NothingSent();

        Recipe storage recipe = recipes[recipeId];
        address author = recipe.author;
        if (author == address(0)) revert UnknownRecipe();

        uint256 toPlatform = (msg.value * platformBps) / 10_000;
        uint256 toAuthor = msg.value - toPlatform;

        recipe.crafts += 1;
        recipe.earned += uint128(toAuthor);

        vault.credit{value: toAuthor}(author);
        if (toPlatform > 0) {
            vault.credit{value: toPlatform}(owner);
        }

        emit Crafted(recipeId, msg.sender, author, msg.value, toAuthor);
    }

    /// @notice What a craft of this recipe would pay out, before it happens.
    /// Lets the site show the author's cut next to the price rather than
    /// asking anyone to take it on faith.
    function quote(uint256 amount)
        external
        view
        returns (uint256 toAuthor, uint256 toPlatform)
    {
        toPlatform = (amount * platformBps) / 10_000;
        toAuthor = amount - toPlatform;
    }

    function authorOf(bytes32 recipeId) external view returns (address) {
        return recipes[recipeId].author;
    }

    function setPlatformBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PLATFORM_BPS) revert ShareTooHigh();
        platformBps = bps;
        emit PlatformBpsChanged(bps);
    }

    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}
