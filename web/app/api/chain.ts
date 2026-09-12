// Reading the chains, from the site, without going through the agent.
//
// The bench needs a machine with Blender on it, and that machine is a laptop
// that is usually closed. The contracts are not: they are public, and a
// deployment on Vercel can read them as well as anything else can.
//
// So the marketplace and the spending caps are served from here rather than
// proxied. Someone opening the site with the bench offline still sees which
// recipes exist, who owns them, what they have earned, and how much the agent
// may still spend — which is the half of this project that does not depend on
// anybody's laptop being awake.

import {
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  parseAbi,
  parseAbiItem,
} from "viem";

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

// A cap and a price are numbers in a currency, and the two chains disagree
// about the currency and about its scale. Every amount below is formatted with
// the decimals of the thing that holds it, never with a default.
export const LEDGERS = {
  hedera: {
    chain: hedera,
    symbol: "HBAR",
    decimals: 8,
    book: "0x36C6C3e991B8673c44B7216f1b0499eA19f8Df41",
    allowance: "0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C",
    from: 40436149n,
    window: 10000n,
    explorer: (a: string) => `https://hashscan.io/testnet/contract/${a}`,
  },
  arc: {
    chain: arc,
    symbol: "USDC",
    decimals: 18,
    book: "0xC456D809Fb6B71a1901c4E5957c0F70b034783BA",
    allowance: "0xcc8936bC21B8a521314740B21F300cdF7c0Ca627",
    from: 61783070n,
    window: 10000n,
    explorer: (a: string) => `https://testnet.arcscan.app/address/${a}`,
  },
} as const;

export type LedgerName = keyof typeof LEDGERS;

const bookAbi = parseAbi([
  "function recipes(bytes32) view returns (address author, uint64 crafts, uint128 earned)",
  "event RecipePublished(bytes32 indexed recipeId, address indexed author)",
]);

const allowanceAbi = parseAbi([
  "function remaining() view returns (uint256)",
  "function cap() view returns (uint256)",
  "function window() view returns (uint64)",
]);

const clientFor = (name: LedgerName) =>
  createPublicClient({
    chain: LEDGERS[name].chain,
    transport: http(),
    batch: { multicall: true },
  });

// Recipes published by throwaway accounts while the claim flow was being
// tested against the live chain. They are on the ledger for good — a
// publication cannot be undone — and their authors are keys nobody holds, so
// the shelf leaves them out. Anyone can still read them from the contract.
const HIDDEN = new Set([
  "0x7126e1f680caa619093914dc94ab1ca740f33763c96e7db847967d3ba13616fb",
  "0xdd6c051e9a74763087ceb3c31ce7d6828adc3b586735f4211f9fe81317b620cb",
  "0x72f36b76bb196bd327371d8f3d5cab84af72e10459c67862d7ec5ac2123ad21b",
]);

/** Every recipe published on one chain, newest first. */
async function readPublishedOn(name: LedgerName, limit: number) {
  const ledger = LEDGERS[name];
  const client = clientFor(name);

  const event = bookAbi.find(
    (e) => e.type === "event" && e.name === "RecipePublished",
  );
  const head = await patiently(() => client.getBlockNumber());

  // Logs cannot be asked for since block zero — a query is capped at ten
  // thousand blocks and Arc is sixty-one million deep. Walk back from the head
  // in windows the node accepts, and stop once there is enough to show.
  const seen = new Map<string, string>();
  for (let to = head; to >= ledger.from && seen.size < limit; to -= ledger.window) {
    const from = to - ledger.window + 1n;
    const logs = await patiently(() =>
      client.getLogs({
        address: ledger.book as `0x${string}`,
        event,
        fromBlock: from > ledger.from ? from : ledger.from,
        toBlock: to,
      }),
    );
    for (const log of logs) {
      const { recipeId, author } =
        (log as { args?: { recipeId?: string; author?: string } }).args ?? {};
      if (recipeId && author) seen.set(recipeId, author);
    }
  }

  const ids = [...seen.keys()]
    .filter((id) => !HIDDEN.has(id.toLowerCase()))
    .slice(-limit)
    .reverse();
  const recipes = await Promise.all(
    ids.map(async (id) => {
      const [author, crafts, earned] = (await patiently(() =>
        client.readContract({
          address: ledger.book as `0x${string}`,
          abi: bookAbi,
          functionName: "recipes",
          args: [id as `0x${string}`],
        }),
      )) as [string, bigint, bigint];

      return {
        id,
        author,
        crafts: Number(crafts),
        earned: `${formatUnits(earned, ledger.decimals)} ${ledger.symbol}`,
      };
    }),
  );

  return {
    chain: ledger.chain.name,
    book: ledger.book,
    explorer: ledger.explorer(ledger.book),
    recipes,
  };
}

// The public nodes limit how fast they are asked. Past the limit they answer
// "Request exceeds defined limit", and a backpack that took the refusal for "no
// recipes" told owners their recipes were gone. So a refusal for rate is waited
// out and asked again; any other error is a real failure, and surfaces.
const RATE_LIMITED = /rate limit|exceeds defined limit|429|too many requests/i;

async function patiently<T>(ask: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await ask();
    } catch (err) {
      const e = err as { message?: string; details?: string; shortMessage?: string };
      const said = `${e.shortMessage ?? ""} ${e.details ?? ""} ${e.message ?? ""}`;
      if (i + 1 >= attempts || !RATE_LIMITED.test(said)) throw err;
      await new Promise((wait) => setTimeout(wait, 500 * 2 ** i));
    }
  }
}

const recipePublished = parseAbiItem(
  "event RecipePublished(bytes32 indexed recipeId, address indexed author)",
);

/**
 * Every recipe one address owns on one chain.
 *
 * The author is an indexed topic, so the node does the filtering and every
 * window is cheap. The walk goes all the way back rather than stopping early:
 * an author's first recipe is as much theirs as their latest.
 */
async function readOwnedBy(name: LedgerName, author: `0x${string}`) {
  const ledger = LEDGERS[name];
  const client = clientFor(name);
  const head = await patiently(() => client.getBlockNumber());

  const windows: [bigint, bigint][] = [];
  for (let to = head; to >= ledger.from; to -= ledger.window) {
    const from = to - ledger.window + 1n;
    windows.push([from > ledger.from ? from : ledger.from, to]);
  }

  // One window at a time. Asking for ten at once is how the node's rate limit
  // was found, and a backpack is not worth being refused for.
  const ids: `0x${string}`[] = [];
  for (const [fromBlock, toBlock] of windows) {
    const logs = await patiently(() =>
      client.getLogs({
        address: ledger.book as `0x${string}`,
        event: recipePublished,
        args: { author },
        fromBlock,
        toBlock,
      }),
    );
    for (const log of logs) if (log.args.recipeId) ids.push(log.args.recipeId);
  }

  return Promise.all(
    ids.map(async (id) => {
      const [, crafts, earned] = (await patiently(() =>
        client.readContract({
          address: ledger.book as `0x${string}`,
          abi: bookAbi,
          functionName: "recipes",
          args: [id],
        }),
      )) as [string, bigint, bigint];

      return {
        id: id.toLowerCase(),
        chain: ledger.chain.name,
        explorer: ledger.explorer(ledger.book),
        crafts: Number(crafts),
        earned: `${formatUnits(earned, ledger.decimals)} ${ledger.symbol}`,
      };
    }),
  );
}

/** What the agent may still spend on one chain, in this window. */
export async function capOn(name: LedgerName) {
  const ledger = LEDGERS[name];
  const client = clientFor(name);

  const read = (functionName: "remaining" | "cap" | "window") =>
    client.readContract({
      address: ledger.allowance as `0x${string}`,
      abi: allowanceAbi,
      functionName,
    }) as Promise<bigint>;

  const [remaining, cap, window] = await Promise.all([
    read("remaining"),
    read("cap"),
    read("window"),
  ]);

  return {
    chain: name,
    chainName: ledger.chain.name,
    address: ledger.allowance,
    explorer: ledger.explorer(ledger.allowance),
    remaining: remaining.toString(),
    remainingLabel: `${formatUnits(remaining, ledger.decimals)} ${ledger.symbol}`,
    cap: cap.toString(),
    capLabel: `${formatUnits(cap, ledger.decimals)} ${ledger.symbol}`,
    windowSeconds: Number(window),
  };
}

// A person's budget: how much of their USDC they have let the agent spend, and
// how much they hold. Read here rather than through the agent so it shows with
// the bench switched off. USDC on Arc as an ERC-20 has 6 decimals.
const USDC = "0x3600000000000000000000000000000000000000";
export const AGENT = (process.env.VOXEL_AGENT_ADDRESS ??
  "0xfe3caAd68785d76B70CeC542518d2a003EA90034") as `0x${string}`;

const usdcAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export async function budgetOf(owner: `0x${string}`) {
  const client = clientFor("arc");
  const [allowance, balance] = (await Promise.all([
    patiently(() =>
      client.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [owner, AGENT] }),
    ),
    patiently(() =>
      client.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [owner] }),
    ),
  ])) as [bigint, bigint];

  return {
    owner,
    agent: AGENT,
    allowance: allowance.toString(),
    allowanceLabel: `${formatUnits(allowance, 6)} USDC`,
    balance: balance.toString(),
    balanceLabel: `${formatUnits(balance, 6)} USDC`,
  };
}

/** Whatever answers, across both chains. One being unreachable is not a wall. */
export async function acrossChains<T>(
  read: (name: LedgerName) => Promise<T>,
): Promise<Awaited<T>[]> {
  const names = Object.keys(LEDGERS) as LedgerName[];
  // Called rather than handed to map: map passes the index as a second
  // argument, and `read` has a second parameter. Passing it directly asked
  // Hedera for zero recipes and Arc for one.
  const results = await Promise.allSettled(names.map((name) => read(name)));

  const answered: Awaited<T>[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") answered.push(result.value);
  }
  return answered;
}

// Reading every recipe on a chain is a walk through its history, and the public
// nodes limit how often they can be asked. So each answer is kept for a little
// while, and when a node refuses, the last good answer is served instead: the
// chain only grows, so a reading from seconds ago is still true, only perhaps
// incomplete. A chain that has never been read still reports itself as
// unreadable rather than empty.
const FRESH_MS = 20_000;
const remembered = new Map<string, { value: unknown; at: number }>();

async function recall<T>(key: string, read: () => Promise<T>): Promise<T> {
  const kept = remembered.get(key);
  if (kept && Date.now() - kept.at < FRESH_MS) return kept.value as T;
  try {
    const value = await read();
    remembered.set(key, { value, at: Date.now() });
    return value;
  } catch (err) {
    if (kept) return kept.value as T;
    throw err;
  }
}

/** Every recipe published on one chain, newest first. Kept for a few seconds. */
export const publishedOn = (name: LedgerName, limit = 12) =>
  recall(`published:${name}:${limit}`, () => readPublishedOn(name, limit));

/** Every recipe one address owns on one chain. Kept for a few seconds. */
export const ownedBy = (name: LedgerName, author: `0x${string}`) =>
  recall(`owned:${name}:${author.toLowerCase()}`, () => readOwnedBy(name, author));
