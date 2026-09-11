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
    book: "0x333EdFE67b0e1dcEda52CA5D483B6dd54A102e1E",
    allowance: "0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C",
    from: 40375669n,
    window: 10000n,
    explorer: (a: string) => `https://hashscan.io/testnet/contract/${a}`,
  },
  arc: {
    chain: arc,
    symbol: "USDC",
    decimals: 18,
    book: "0xe0C3Bd1b9dD6ee6606C6780dc1979855556bb396",
    allowance: "0xcc8936bC21B8a521314740B21F300cdF7c0Ca627",
    from: 61536156n,
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

/** Every recipe published on one chain, newest first. */
export async function publishedOn(name: LedgerName, limit = 12) {
  const ledger = LEDGERS[name];
  const client = clientFor(name);

  const event = bookAbi.find(
    (e) => e.type === "event" && e.name === "RecipePublished",
  );
  const head = await client.getBlockNumber();

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

  const ids = [...seen.keys()].slice(-limit).reverse();
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
export async function ownedBy(name: LedgerName, author: `0x${string}`) {
  const ledger = LEDGERS[name];
  const client = clientFor(name);
  const head = await client.getBlockNumber();

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
