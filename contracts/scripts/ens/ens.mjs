// The ENSv2 beta on Sepolia: addresses, clients, and the bits of its ABI we use.
//
// Every address here is a beta deployment and will move. They are kept in one
// file rather than spread through the scripts so that when they do move, there
// is one place to change and nothing silently points at a dead contract.
//
// Source: https://docs.ens.domains/learn/deployments
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, ".env"), "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!(key.trim() in process.env)) process.env[key.trim()] = rest.join("=").trim();
    }
  } catch {
    // no .env is fine if the environment is already set
  }
}

export const ENS = {
  ethRegistry: getAddress("0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2"),
  ethRegistrar: getAddress("0xa88553f454b77203b0d036a05c894d555eaaa2cc"),
  userRegistryImpl: getAddress("0x624a25d67b59d587752ebec8dded8827dae52050"),
  verifiableFactory: getAddress("0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef"),
  permissionedResolverImpl: getAddress("0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e"),
  universalResolver: getAddress("0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe"),
  mockUsdc: getAddress("0x768f42455a2d082e23ceef7d51e5787c82d67a39"),
};

// The name the three services live under, and the services themselves. The
// labels match the paywall's stage names exactly — someone who sees
// `recipe.voxelbench.eth` resolve and then reads `POST /hbar/recipe` should not
// have to translate between them.
export const PARENT = process.env.ENS_PARENT_LABEL ?? "voxelbench";
export const SERVICES = ["recipe", "craft", "publish"];

// Enhanced Access Control. A role is a bit; the same bit shifted left 128 is
// the right to grant and revoke that role. Naming them is worth the lines: a
// bitmap in a script is unreadable six weeks later.
export const ROLE = {
  REGISTRAR: 1n << 0n,
  REGISTER_RESERVED: 1n << 4n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
};
export const admin = (role) => role << 128n;
export const ALL_ROLES =
  0x1111111111111111111111111111111111111111111111111111111111111111n;

export const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);

export const registryAbi = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function grantRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);

export const resolverAbi = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
  "function setAddr(bytes32 node, address a)",
  "function addr(bytes32 node) view returns (address)",
  "function initialize(address owner)",
]);

export const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

export function clients(privateKeyEnv = "ENS_PRIVATE_KEY") {
  const key = process.env[privateKeyEnv] ?? process.env.HEDERA_AGENT_PRIVATE_KEY;
  if (!key) throw new Error(`${privateKeyEnv} or HEDERA_AGENT_PRIVATE_KEY is required`);

  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
  return { account, publicClient, wallet };
}

/** Waits for a transaction and fails loudly rather than continuing on a revert. */
export async function send(publicClient, hash, what) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what} reverted: ${hash}`);
  console.log(`  ${what.padEnd(38)} ${hash}`);
  return receipt;
}
