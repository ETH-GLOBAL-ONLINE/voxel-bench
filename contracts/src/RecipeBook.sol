// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISplitVault {
    function credit(address account) external payable;
}

/// @title RecipeBook
/// @notice Records recipe authorship and settles craft royalties.
contract RecipeBook {
    struct Recipe {
        address author;
        uint64 crafts;
        uint128 earned;
    }

    mapping(bytes32 => Recipe) public recipes;

    ISplitVault public immutable vault;
    address public owner;
    uint16 public platformBps;
    uint16 public constant MAX_PLATFORM_BPS = 3000;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant PUBLISH_TYPEHASH =
        keccak256("Publish(bytes32 recipeId,address author)");

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
    error DirectPublishDisabled();
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

    /// @notice Disabled because knowing a content hash is not proof of authorship.
    function publish(bytes32 recipeId) external {
        recipeId;
        revert DirectPublishDisabled();
    }

    /// @notice Records authorship only after validating an EIP-712 author signature.
    function publishFor(bytes32 recipeId, address author, bytes calldata signature)
        external
    {
        if (author == address(0)) revert InvalidSignature();
        if (_recover(publishDigest(recipeId, author), signature) != author) {
            revert InvalidSignature();
        }
        _publish(recipeId, author);
    }

    function _publish(bytes32 recipeId, address author) internal {
        if (recipes[recipeId].author != address(0)) revert AlreadyPublished();
        recipes[recipeId].author = author;
        emit RecipePublished(recipeId, author);
    }

    function publishDigest(bytes32 recipeId, address author)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                hex"1901",
                _domainSeparator(),
                keccak256(abi.encode(PUBLISH_TYPEHASH, recipeId, author))
            )
        );
    }

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
        if (toPlatform > 0) vault.credit{value: toPlatform}(owner);

        emit Crafted(recipeId, msg.sender, author, msg.value, toAuthor);
    }

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
