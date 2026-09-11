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

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    /// @dev What an author signs: this recipe, owned by this address. Nothing
    /// else, because nothing else needs to be agreed.
    bytes32 public constant PUBLISH_TYPEHASH =
        keccak256("Publish(bytes32 recipeId,address author)");
    event OwnerChanged(address indexed owner);

    error AlreadyPublished();
    error InvalidSignature();
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
        _publish(recipeId, msg.sender);
    }

    /// @notice Claim authorship on someone else's behalf, with their signature.
    ///
    /// The point of this project is that using it costs no gas and needs no
    /// tokens. Requiring an author to send a transaction to own their own work
    /// puts that back: they would need a funded account before they could keep
    /// anything they made.
    ///
    /// So they sign, which is free, and anyone may relay it. The signature
    /// names the recipe and the author and is bound to this contract on this
    /// chain, so it cannot be replayed anywhere else. It needs no nonce: a
    /// recipe can only be published once, and the second attempt reverts.
    ///
    /// Whoever relays pays the gas and gains nothing — authorship goes to the
    /// signer, and a relayer who substitutes their own address produces a
    /// signature that does not recover.
    function publishFor(bytes32 recipeId, address author, bytes calldata signature)
        external
    {
        if (author == address(0)) revert InvalidSignature();

        bytes32 digest = keccak256(
            abi.encodePacked(hex"1901", _domainSeparator(), keccak256(
                abi.encode(PUBLISH_TYPEHASH, recipeId, author)
            ))
        );
        if (_recover(digest, signature) != author) revert InvalidSignature();

        _publish(recipeId, author);
    }

    function _publish(bytes32 recipeId, address author) internal {
        if (recipes[recipeId].author != address(0)) revert AlreadyPublished();
        recipes[recipeId].author = author;
        emit RecipePublished(recipeId, author);
    }

    /// @dev Built per call rather than cached at deployment: a cached one is
    /// wrong after a chain splits, and this contract is cheap enough that the
    /// hashing costs less than the mistake would.
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("VoxelBench RecipeBook"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @dev Rejects the high half of the curve order, so one signature cannot
    /// be turned into a second valid one for the same message.
    function _recover(bytes32 digest, bytes calldata signature)
        internal
        pure
        returns (address)
    {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSignature();
        }
        if (v != 27 && v != 28) revert InvalidSignature();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
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
