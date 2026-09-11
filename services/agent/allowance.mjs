// The agent's spending money, and the ceiling on it.
//
// Every craft starts by drawing what it is about to spend out of the Allowance
// contract. When the window's cap is used up the draw reverts, and the craft
// does not happen — the brake is the chain rather than a check of ours that the
// same process could skip.
//
// That ordering is the point. A cap consulted before spending is advice; a cap
// the money has to pass through is a cap. It is also the only defence that
// survives the case the whole architecture is built around: an agent acting on
// a prompt nobody wrote, or a model talked into spending.
//
// It costs one transaction per craft. Worth it — this is the number that
// decides how much a bad afternoon can cost, and it should not be a promise.
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  parseAbi,
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

// One cap per chain, because a cap is denominated and the two chains disagree
// about the denomination. On Hedera a contract is handed tinybars, 8 decimals;
// on Arc the native token is USDC at 18. A single number covering both would
// be a number that means nothing on one of them — which is the mistake this
// had before, adding tinybars to USDC units and drawing the sum.
export const CAPS = {
  hedera: {
    chain: hedera,
    address: "0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C",
    symbol: "HBAR",
    decimals: 8,
    explorer: (a) => `https://hashscan.io/testnet/contract/${a}`,
  },
  arc: {
    chain: arc,
    address: "0xcc8936bC21B8a521314740B21F300cdF7c0Ca627",
    symbol: "USDC",
    decimals: 18,
    explorer: (a) => `https://testnet.arcscan.app/address/${a}`,
  },
};

function capFor(name) {
  const cap = CAPS[name];
  if (!cap) throw new Error(`no allowance on ${name}`);
  return cap;
}

const money = (v, cap) => `${formatUnits(v, cap.decimals)} ${cap.symbol}`;

const abi = parseAbi([
  "function draw(uint256 amount)",
  "function remaining() view returns (uint256)",
  "function cap() view returns (uint256)",
  "function window() view returns (uint64)",
  "function agent() view returns (address)",
  "error OverCap(uint256 requested, uint256 remaining)",
  "error NotAgent()",
]);

function clients(cap) {
  const key = process.env.HEDERA_AGENT_PRIVATE_KEY;
  if (!key) throw new Error("HEDERA_AGENT_PRIVATE_KEY is required");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  return {
    account,
    publicClient: createPublicClient({ chain: cap.chain, transport: http() }),
    wallet: createWalletClient({ account, chain: cap.chain, transport: http() }),
  };
}

const enabled = () => process.env.VOXEL_ALLOWANCE !== "off";

/** What is left in this window on one chain, without spending anything. */
export async function remaining(name = "hedera") {
  if (!enabled()) return null;
  const cap = capFor(name);
  const { publicClient } = clients(cap);

  const read = (functionName) =>
    publicClient.readContract({ address: cap.address, abi, functionName });

  const [left, ceiling, window] = await Promise.all([
    read("remaining"), read("cap"), read("window"),
  ]);

  return {
    chain: name,
    chainName: cap.chain.name,
    address: cap.address,
    explorer: cap.explorer(cap.address),
    remaining: left.toString(),
    remainingLabel: money(left, cap),
    cap: ceiling.toString(),
    capLabel: money(ceiling, cap),
    windowSeconds: Number(window),
  };
}

/** Both caps at once, for a page that has to show what is and is not bounded. */
export async function allCaps() {
  if (!enabled()) return [];
  const names = Object.keys(CAPS);
  const results = await Promise.allSettled(names.map((n) => remaining(n)));
  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
}

/**
 * Take `amount` out of the allowance on `name` before spending it.
 *
 * Throws when the window is spent. That is not an error to work around: it is
 * the contract saying no, and the caller's job is to stop.
 */
export async function draw(amount, name = "hedera") {
  if (!enabled()) return { drawn: false, skipped: "VOXEL_ALLOWANCE=off" };
  if (BigInt(amount) === 0n) return { drawn: false, skipped: "nothing to draw" };

  const cap = capFor(name);
  const { publicClient, wallet } = clients(cap);

  try {
    const hash = await wallet.writeContract({
      address: cap.address, abi, functionName: "draw", args: [BigInt(amount)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("the draw reverted");

    const left = await publicClient.readContract({
      address: cap.address, abi, functionName: "remaining",
    });
    return {
      drawn: true,
      chain: name,
      amount: amount.toString(),
      amountLabel: money(BigInt(amount), cap),
      remainingLabel: money(left, cap),
      transaction: hash,
      explorer: cap.explorer(cap.address),
    };
  } catch (err) {
    const named = err?.cause?.data?.errorName;
    if (named === "OverCap") {
      const [requested, left] = err.cause.data.args ?? [];
      throw new Error(
        `the ${cap.symbol} spending cap is used up — asked for ` +
        `${money(requested ?? 0n, cap)}, ${money(left ?? 0n, cap)} left in this window`,
      );
    }
    throw new Error(
      `could not draw from the ${name} allowance: ${err.shortMessage ?? err.message}`,
    );
  }
}
