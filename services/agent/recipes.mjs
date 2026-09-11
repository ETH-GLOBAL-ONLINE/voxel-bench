// The recipe ledger: who wrote a recipe, and who gets paid when it is used.
//
// Two things happen here that the rest of the pipeline does not do.
//
// A recipe that has never been seen is published, and whoever is named as its
// author owns it from then on. A recipe that already has an author is settled
// against instead — the fee splits, most of it to them.
//
// That second case is also the answer to latency. A recipe that exists needs no
// model call, so it crafts in seconds rather than tens of seconds, and the
// money that would have paid for inference pays its author instead. The
// platform gets faster as it accumulates recipes, which is the opposite of how
// this usually goes.
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
});

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
});

// What a craft pays the ledger, in each chain's own smallest unit, and how to
// read those units back. Hedera hands a contract tinybars at 8 decimals where
// an EVM chain hands it wei; Arc's native USDC is 18. The fee is a tenth of a
// cent either way.
//
// `from` is the block the contracts were deployed in, taken from the Ignition
// journal. Asking for logs since block zero is refused — Arc caps a query at
// ten thousand blocks and is sixty-one million deep — so the scan has to start
// where there is something to find.
export const LEDGERS = {
  hedera: {
    chain: hedera, symbol: "HBAR", decimals: 8, fee: 100000n,
    book: "0x333EdFE67b0e1dcEda52CA5D483B6dd54A102e1E",
    vault: "0xBaE7C31f9080733DB1Cd18Ed99b5d70fF65406DE",
    from: 40375669n, window: 10000n,
  },
  arc: {
    chain: arc, symbol: "USDC", decimals: 18, fee: 1000000000000000n,
    book: "0xe0C3Bd1b9dD6ee6606C6780dc1979855556bb396",
    vault: "0x870771ecaaf8c059354145B7A0cC5D4Da2A4b721",
    from: 61536156n, window: 10000n,
  },
};

const bookAbi = parseAbi([
  "function publish(bytes32 recipeId)",
  "function publishFor(bytes32 recipeId, address author, bytes signature)",
  "function PUBLISH_TYPEHASH() view returns (bytes32)",
  "function craft(bytes32 recipeId) payable",
  "function authorOf(bytes32) view returns (address)",
  "function recipes(bytes32) view returns (address author, uint64 crafts, uint128 earned)",
  "function platformBps() view returns (uint16)",
  "event RecipePublished(bytes32 indexed recipeId, address indexed author)",
]);

const vaultAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The id of a recipe, which is the hash of what it says rather than what it is
 * called.
 *
 * Two people who write the same thing get the same id, so the second cannot
 * take the first one's authorship, and renaming a recipe does not make it new.
 *
 * Only this function computes it, and only in JavaScript. Python would need a
 * keccak dependency it does not have, and two languages agreeing on how to
 * print a float is a coin toss — `1.0` against `1` is a different hash.
 */
export function recipeId(recipe) {
  return keccak256(toHex(canonical(recipe)));
}

/** JSON with the keys in a fixed order and no whitespace to disagree about. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function ledgerFor(name = process.env.VOXEL_LEDGER ?? "hedera") {
  const ledger = LEDGERS[name];
  if (!ledger) throw new Error(`VOXEL_LEDGER must be one of ${Object.keys(LEDGERS)}`);
  return ledger;
}

function clients(ledger) {
  const key = process.env.RECIPE_BOOK_KEY ?? process.env.HEDERA_AGENT_PRIVATE_KEY;
  if (!key) throw new Error("HEDERA_AGENT_PRIVATE_KEY is required to settle");

  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  return {
    account,
    publicClient: createPublicClient({ chain: ledger.chain, transport: http() }),
    wallet: createWalletClient({ account, chain: ledger.chain, transport: http() }),
  };
}

/** What the chain already knows about a recipe. */
export async function lookup(id, ledger = ledgerFor()) {
  const publicClient = createPublicClient({ chain: ledger.chain, transport: http() });
  const [author, crafts, earned] = await publicClient.readContract({
    address: ledger.book, abi: bookAbi, functionName: "recipes", args: [id],
  });
  return {
    id,
    author: author === ZERO ? null : author,
    crafts: Number(crafts),
    earned: earned.toString(),
    earnedLabel: `${formatUnits(earned, ledger.decimals)} ${ledger.symbol}`,
  };
}

/**
 * Records a craft against the ledger.
 *
 * A recipe nobody has published is published, to `author` — which is whoever
 * the site says owns it, and the platform when nobody does. A recipe that
 * already has an author is crafted against, and the split pays them.
 *
 * Failure here does not fail the craft. The object exists and the user has it;
 * an unreachable RPC is a bookkeeping problem and is reported as one.
 */
export async function settle(recipe, { author, signature, ledgerName } = {}) {
  const ledger = ledgerFor(ledgerName);
  const id = recipeId(recipe);

  try {
    const { account, publicClient, wallet } = clients(ledger);
    const existing = await publicClient.readContract({
      address: ledger.book, abi: bookAbi, functionName: "authorOf", args: [id],
    });

    const send = async (functionName, args, value) => {
      const hash = await wallet.writeContract({
        address: ledger.book, abi: bookAbi, functionName, args, value,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    };

    if (existing === ZERO) {
      // Without a signature, nothing is published. Claiming it for the
      // platform would be the end of the matter — a recipe can only be
      // published once — so the person who made it could never take it back.
      // It stays unowned until someone signs for it.
      if (!author || !signature) {
        return { id, action: "unclaimed", chain: ledger.chain.name };
      }

      const hash = await send("publishFor", [id, author, signature]);
      return {
        id, action: "published", author, relayed: true,
        transaction: hash, chain: ledger.chain.name,
      };
    }

    const hash = await send("craft", [id], ledger.fee);
    const after = await lookup(id, ledger);
    return {
      id, action: "crafted", author: existing, transaction: hash,
      chain: ledger.chain.name, crafts: after.crafts,
      paidToAuthor: after.earnedLabel,
    };
  } catch (err) {
    return { id, action: "failed", error: (err.shortMessage ?? err.message).slice(0, 200) };
  }
}

/** Every recipe the ledger knows about, newest first. */
export async function published({ ledgerName, limit = 50 } = {}) {
  const ledger = ledgerFor(ledgerName);
  const publicClient = createPublicClient({
    chain: ledger.chain, transport: http(), batch: { multicall: true },
  });

  const event = bookAbi.find((e) => e.type === "event" && e.name === "RecipePublished");
  const head = await publicClient.getBlockNumber();

  // Walk the range in windows the node will accept, newest first, and stop
  // once there is enough to show. A ledger with a handful of recipes then
  // costs one request rather than six thousand.
  const seen = new Map();
  for (let to = head; to >= ledger.from && seen.size < limit; to -= ledger.window) {
    const from = to - ledger.window + 1n;
    const logs = await publicClient.getLogs({
      address: ledger.book,
      event,
      fromBlock: from > ledger.from ? from : ledger.from,
      toBlock: to,
    });
    for (const log of logs) seen.set(log.args.recipeId, log.args.author);
  }

  const ids = [...seen.keys()].slice(-limit).reverse();
  const rows = await Promise.all(ids.map(async (id) => {
    const [author, crafts, earned] = await publicClient.readContract({
      address: ledger.book, abi: bookAbi, functionName: "recipes", args: [id],
    });
    return {
      id,
      author,
      crafts: Number(crafts),
      earned: `${formatUnits(earned, ledger.decimals)} ${ledger.symbol}`,
    };
  }));

  return { chain: ledger.chain.name, book: ledger.book, vault: ledger.vault, recipes: rows };
}

/**
 * The EIP-712 typed data an author signs to claim a recipe.
 *
 * Built here rather than in the browser so the page never carries a contract
 * address or a chain id of its own — a page that hardcodes those is a page that
 * keeps signing for the wrong contract after a redeployment.
 */
export function claimTypedData(id, author, ledgerName) {
  const ledger = ledgerFor(ledgerName);
  return {
    domain: {
      name: "VoxelBench RecipeBook",
      version: "1",
      chainId: ledger.chain.id,
      verifyingContract: ledger.book,
    },
    types: {
      Publish: [
        { name: "recipeId", type: "bytes32" },
        { name: "author", type: "address" },
      ],
    },
    primaryType: "Publish",
    message: { recipeId: id, author },
  };
}
