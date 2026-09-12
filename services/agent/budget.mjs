// The customer's budget, and the agent charging it.
//
// Until now the agent paid for everything out of its own wallet, which made
// every craft a gift from the platform. Now whoever crafts gives their agent a
// budget in their own USDC, once, by signing an EIP-2612 permit: "this agent
// may spend up to this much of my USDC". The signature costs nothing — the
// agent relays it and pays the gas — and every job then takes what it costs
// from that budget, in one transfer, before any of the work is paid for.
//
// The brake is the token, not us. Past the permitted amount `transferFrom`
// reverts, whoever calls it, so the limit a person signs for is the most the
// agent can take from them. Lowering it is signing again.
//
// The agent still pays the services and the authors itself, stage by stage,
// the way it always has. What changed is whose money that is.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseAbi,
  parseSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { arc } from "./pay.mjs";

// Arc's USDC as an ERC-20: 6 decimals, where the native balance has 18. Every
// amount in this file is in the 6-decimal units.
export const USDC = "0x3600000000000000000000000000000000000000";
const DECIMALS = 6;

export const usdc = (units) => `${formatUnits(BigInt(units), DECIMALS)} USDC`;

// What a job costs the person asking for it. The stages are the prices the
// services charge on Arc; an author's share is RecipeBook's fee.
export const PRICE = {
  recipe: 1000n,
  craft: 5000n,
  publish: 10000n,
  author: 1000n,
};

// Test USDC for a new account, so someone who signs in with an email can try
// the bench at all. Testnet only: on mainnet a person brings their own.
const CREDIT = BigInt(process.env.VOXEL_TEST_CREDIT ?? "100000"); // 0.10 USDC
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");
const CREDITS = resolve(OUT, "test-credits.json");

const abi = parseAbi([
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
]);

/** Whether jobs are charged to the person asking. On unless switched off. */
export const userPays = () => process.env.VOXEL_USER_PAYS !== "off";

const explorer = (tx) => `https://testnet.arcscan.app/tx/${tx}`;

function clients() {
  const key = process.env.ARC_PRIVATE_KEY ?? process.env.HEDERA_AGENT_PRIVATE_KEY;
  if (!key) throw new Error("the agent has no key for Arc");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  return {
    account,
    publicClient: createPublicClient({ chain: arc, transport: http() }),
    wallet: createWalletClient({ account, chain: arc, transport: http() }),
  };
}

/** The address a budget is given to: the agent's own, on Arc. */
export const agentAddress = () => clients().account.address;

const read = (functionName, args) =>
  clients().publicClient.readContract({ address: USDC, abi, functionName, args });

/** What someone has given their agent, and what they hold. */
export async function budgetOf(owner) {
  const agent = agentAddress();
  const [allowance, balance] = await Promise.all([
    read("allowance", [owner, agent]),
    read("balanceOf", [owner]),
  ]);
  return {
    owner,
    agent,
    allowance: allowance.toString(),
    allowanceLabel: usdc(allowance),
    balance: balance.toString(),
    balanceLabel: usdc(balance),
  };
}

/**
 * What to sign to give the agent a budget of `value`.
 *
 * A permit sets the amount rather than adding to it, so signing again with a
 * smaller number lowers the limit. The nonce makes each signature good once.
 */
export async function permitTypedData(owner, value, deadline) {
  const nonce = await read("nonces", [owner]);
  return {
    domain: {
      // Read off the contract: name "USDC", version "2". A wallet signing for a
      // domain the token does not have produces a signature it will refuse.
      name: "USDC",
      version: "2",
      chainId: arc.id,
      verifyingContract: USDC,
    },
    types: {
      // Declared for the same reason as the claim's: the payload reaches the
      // wallet as JSON with no library in between to add it.
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: {
      owner,
      spender: agentAddress(),
      value: value.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    },
  };
}

/** Relay a signed permit. The person signed; the agent pays the gas. */
export async function applyPermit({ owner, value, deadline, signature }) {
  const { publicClient, wallet } = clients();
  const sig = parseSignature(signature);
  const v = sig.v ?? BigInt(sig.yParity + 27);

  const hash = await wallet.writeContract({
    address: USDC,
    abi,
    functionName: "permit",
    args: [owner, agentAddress(), BigInt(value), BigInt(deadline), Number(v), sig.r, sig.s],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("the permit was refused");

  const now = await budgetOf(owner);
  return { transaction: hash, explorer: explorer(hash), allowanceLabel: now.allowanceLabel };
}

/**
 * Take `amount` from someone's budget before spending it on their job.
 *
 * Checked first so the refusal can say why in words; the token would refuse
 * anyway, and that refusal is the one that counts.
 */
export async function charge(owner, amount) {
  const before = await budgetOf(owner);
  if (BigInt(before.allowance) < amount) {
    throw new Error(
      `Your agent's budget has ${before.allowanceLabel} left and this costs ${usdc(amount)}. Raise your limit.`,
    );
  }
  if (BigInt(before.balance) < amount) {
    throw new Error(`Your wallet holds ${before.balanceLabel} and this costs ${usdc(amount)}.`);
  }

  const { publicClient, wallet } = clients();
  const hash = await wallet.writeContract({
    address: USDC,
    abi,
    functionName: "transferFrom",
    args: [owner, agentAddress(), amount],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("taking the cost from your budget failed");

  const after = await budgetOf(owner);
  return {
    transaction: hash,
    explorer: explorer(hash),
    amountLabel: usdc(amount),
    leftLabel: after.allowanceLabel,
  };
}

/** Give back what a failed job took and never spent. */
export async function refund(owner, amount) {
  const { publicClient, wallet } = clients();
  const hash = await wallet.writeContract({
    address: USDC,
    abi,
    functionName: "transfer",
    args: [owner, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { transaction: hash, explorer: explorer(hash), amountLabel: usdc(amount) };
}

async function credited() {
  try {
    return JSON.parse(await readFile(CREDITS, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Test USDC for an account that has none, once per address. Testnet only —
 * the point is that someone who signed in with an email a minute ago can try
 * the bench; on mainnet they would arrive with their own.
 */
export async function testCredit(owner) {
  const key = owner.toLowerCase();
  const given = await credited();
  if (given[key]) return { sent: false, reason: "already sent to this address" };

  const now = await budgetOf(owner);
  if (BigInt(now.balance) >= CREDIT) return { sent: false, reason: "this address already holds USDC" };

  const { publicClient, wallet } = clients();
  const hash = await wallet.writeContract({
    address: USDC,
    abi,
    functionName: "transfer",
    args: [owner, CREDIT],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  given[key] = { at: new Date().toISOString(), amount: CREDIT.toString(), transaction: hash };
  await mkdir(OUT, { recursive: true });
  await writeFile(CREDITS, JSON.stringify(given, null, 2));
  return { sent: true, amountLabel: usdc(CREDIT), transaction: hash, explorer: explorer(hash) };
}
