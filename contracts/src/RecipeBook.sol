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
///
/// Who may record an author is the one thing this contract cannot judge on
/// its own. A recipe's id is the hash of its content, and a hash can be seen
/// by someone who did not write it; a signature proves a wallet, not the work
/// (SR-01 in docs/CONTRACT_AUDIT.md). The one party that saw who did the work
/// is the agent that crafted it, so authorship is recorded only through that
/// agent — the attester — and it vouches only for the person it crafted for.
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

    /// @notice The agent that crafts recipes, and the only address that can
    /// record an author: its own, for the platform's stock, or a person's
    /// signed claim that it relays. It vouches, by relaying, that this person
    /// is who it crafted the recipe for. Set to the deployer and changed by
    /// the owner, so the key can be rotated.
    address public attester;

    /// @notice Whether recipes may still be carried over from an earlier
    /// deployment. Sealed once, for good: after that nobody, the owner
    /// included, can record an author without a claim.
    bool public migrationSealed;

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
    event AttesterChanged(address indexed attester);
    event MigrationSealed();

    error AlreadyPublished();
    error InvalidSignature();
    error UnknownRecipe();
    error NothingSent();
    error ShareTooHigh();
    error NotOwner();
    error NotAttester();
    error Sealed();
    error LengthMismatch();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAttester() {
        if (msg.sender != attester) revert NotAttester();
        _;
    }

    constructor(address vault_, uint16 platformBps_) {
        if (vault_ == address(0)) revert ZeroAddress();
        if (platformBps_ > MAX_PLATFORM_BPS) revert ShareTooHigh();
        vault = ISplitVault(vault_);
        owner = msg.sender;
        attester = msg.sender;
        platformBps = platformBps_;
    }

    /// @notice Publish one of the platform's own recipes, under the agent's
    /// address. This used to be open to anyone, first come first served, on
    /// the reasoning that the id is the hash of the content; but a hash can
    /// be seen without the content having been written, so it is now the
    /// agent's alone.
    function publish(bytes32 recipeId) external onlyAttester {
        _publish(recipeId, msg.sender);
    }

    /// @notice Record someone as the author of a recipe, with their signature,
    /// relayed by the agent that crafted it for them.
    ///
    /// The point of this project is that using it costs no gas and needs no
    /// tokens. Requiring an author to send a transaction to own their own work
    /// puts that back: they would need a funded account before they could keep
    /// anything they made.
    ///
    /// So they sign, which is free. The signature names the recipe and the
    /// author and is bound to this contract on this chain, so it cannot be
    /// replayed anywhere else. It needs no nonce: a recipe can only be
    /// published once, and the second attempt reverts.
    ///
    /// Two things have to agree. The signature says this person wants this
    /// recipe, and the relayer — the agent, and only the agent — says this
    /// person is who it crafted the recipe for. Someone who has merely seen an
    /// id can produce the first but not the second, which is what closes
    /// SR-01. The agent pays the gas and gains nothing: authorship goes to
    /// the signer, and a substituted author is a signature that does not
    /// recover.
    function publishFor(bytes32 recipeId, address author, bytes calldata signature)
        external
        onlyAttester
    {
        if (author == address(0)) revert InvalidSignature();
        if (_recover(publishDigest(recipeId, author), signature) != author) {
            revert InvalidSignature();
        }
        _publish(recipeId, author);
    }

    /// @notice What an author signs, exactly as the contract will hash it, so
    /// that a relayer and a test can build the digest without a copy of the
    /// domain that could drift.
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

    function _publish(bytes32 recipeId, address author) internal {
        if (recipes[recipeId].author != address(0)) revert AlreadyPublished();
        recipes[recipeId].author = author;
        emit RecipePublished(recipeId, author);
    }

    /// @notice Carry recipes over from an earlier deployment of this contract:
    /// each one's author, craft count and lifetime earnings, as the old book
    /// recorded them. The vault is shared between the two, so what authors
    /// have earned is already where it belongs and is not touched.
    /// @dev Owner only, and only until sealed. Anyone can check the result
    /// against the old book's events; it emits the same ones.
    function migrate(
        bytes32[] calldata ids,
        address[] calldata authors,
        uint64[] calldata crafts,
        uint128[] calldata earned
    ) external onlyOwner {
        if (migrationSealed) revert Sealed();
        if (
            authors.length != ids.length || crafts.length != ids.length
                || earned.length != ids.length
        ) revert LengthMismatch();

        for (uint256 i = 0; i < ids.length; i++) {
            if (authors[i] == address(0)) revert ZeroAddress();
            _publish(ids[i], authors[i]);
            recipes[ids[i]].crafts = crafts[i];
            recipes[ids[i]].earned = earned[i];
        }
    }

    /// @notice End the migration, for good. From here on the only way to
    /// become an author is a claim relayed by the attester.
    function sealMigration() external onlyOwner {
        if (migrationSealed) revert Sealed();
        migrationSealed = true;
        emit MigrationSealed();
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

    /// @notice Hand the attester's role to another key, when the agent's is
    /// rotated. The old key can record nothing from that block on.
    function setAttester(address newAttester) external onlyOwner {
        if (newAttester == address(0)) revert ZeroAddress();
        attester = newAttester;
        emit AttesterChanged(newAttester);
    }
}
