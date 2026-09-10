// Gives each stage of the pipeline a name, and puts its terms in the records.
//
//   node scripts/ens/03-services.mjs
//
// Before this, the agent learned where to send work from PAYWALL_URL in a .env
// file, and what it cost by asking the service. Both are things the service
// tells you about itself. After this it resolves a name and reads the terms
// from the resolver — the endpoint, the price, the asset, the network.
//
// That is the difference between an agent that discovers a service and an agent
// that was configured with one.
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
  zeroAddress,
} from "viem";

import {
  admin,
  clients,
  ENS,
  factoryAbi,
  loadEnv,
  PARENT,
  registryAbi,
  resolverAbi,
  ROLE,
  send,
  SERVICES,
} from "./ens.mjs";

loadEnv();

const { account, publicClient, wallet } = clients();

const REGISTRY = process.env.ENS_REGISTRY;
if (!REGISTRY) throw new Error("ENS_REGISTRY is required — run 02-registry.mjs first");

const PAYWALL = process.env.ENS_PAYWALL_URL ?? "http://127.0.0.1:4402";

// The terms, one row per service. Prices match services/paywall/server.mjs
// exactly; the point of putting them here is that the agent stops taking the
// paywall's word for them.
const TERMS = {
  recipe: { price: "100000", about: "Turn a sentence into a validated recipe" },
  craft: { price: "500000", about: "Build the recipe in Blender and render a preview" },
  publish: { price: "1000000", about: "Upload the finished parts to a Roblox account" },
};

const ASSET = "0.0.0";
const NETWORK = "hedera:testnet";

// Who gets paid. On the name rather than only in the 402, so the agent knows
// where its money is going before it signs, from a record the service cannot
// rewrite. Per service rather than on the parent: services being paid into
// different accounts is a normal thing to want.
const PAY_TO = process.env.HEDERA_SERVICE_ACCOUNT_ID;
if (!PAY_TO) throw new Error("HEDERA_SERVICE_ACCOUNT_ID is required");

// A year, less a margin: a subname cannot outlive its parent, and asking for
// exactly the parent's expiry is the kind of off-by-one that reverts.
const EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 300 * 24 * 60 * 60);

// What the owner of a service name may do with it.
const OWNER_ROLES =
  ROLE.SET_RESOLVER | admin(ROLE.SET_RESOLVER) |
  ROLE.SET_SUBREGISTRY | admin(ROLE.SET_SUBREGISTRY);

const RESOLVER_SALT = BigInt(keccak256(encodeAbiParameters(
  [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
  [keccak256(stringToHex("VoxelBenchResolver")), namehash(`${PARENT}.eth`), 0n],
)));

const ALL_RESOLVER_ROLES =
  0x1111111111111111111111111111111111111111111111111111111111111111n;

async function deployResolver() {
  if (process.env.ENS_RESOLVER) {
    console.log(`  resolver  ${process.env.ENS_RESOLVER} (from the environment)`);
    return process.env.ENS_RESOLVER;
  }

  const initialize = encodeFunctionData({
    abi: parseAbi([
      "function initialize(address admin, uint256 roleBitmap, bytes[] setters)",
    ]),
    functionName: "initialize",
    args: [account.address, ALL_RESOLVER_ROLES, []],
  });

  const receipt = await send(publicClient, await wallet.writeContract({
    address: ENS.verifiableFactory, abi: factoryAbi, functionName: "deployProxy",
    args: [ENS.permissionedResolverImpl, RESOLVER_SALT, initialize],
  }), "deployed the resolver proxy");

  const { decodeEventLog } = await import("viem");
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({ abi: factoryAbi, ...log });
      if (event.eventName === "ProxyDeployed") return event.args.proxyAddress;
    } catch {
      // not our event
    }
  }
  throw new Error("no ProxyDeployed event in the receipt");
}

async function main() {
  console.log(`\n  three services under ${PARENT}.eth\n`);
  console.log(`  registry  ${REGISTRY}`);

  const resolver = await deployResolver();
  console.log(`  resolver  ${resolver}\n`);

  for (const service of SERVICES) {
    const owner = await publicClient.readContract({
      address: REGISTRY, abi: registryAbi,
      functionName: "getResolver", args: [service],
    }).catch(() => zeroAddress);

    if (!owner || owner === zeroAddress) {
      await send(publicClient, await wallet.writeContract({
        address: REGISTRY, abi: registryAbi, functionName: "register",
        args: [service, account.address, zeroAddress, resolver, OWNER_ROLES, EXPIRY],
      }), `registered ${service}.${PARENT}.eth`);
    } else {
      console.log(`  ${service}.${PARENT}.eth already exists`);
    }

    const node = namehash(`${service}.${PARENT}.eth`);
    const terms = TERMS[service];

    const records = [
      ["url", `${PAYWALL}/hbar/${service}`],
      ["x402:price", terms.price],
      ["x402:asset", ASSET],
      ["x402:network", NETWORK],
      ["x402:payTo", PAY_TO],
      ["description", terms.about],
    ];

    for (const [key, value] of records) {
      const current = await publicClient.readContract({
        address: resolver, abi: resolverAbi, functionName: "text", args: [node, key],
      }).catch(() => "");
      if (current === value) continue;

      await send(publicClient, await wallet.writeContract({
        address: resolver, abi: resolverAbi, functionName: "setText",
        args: [node, key, value],
      }), `  ${service}.${key} = ${value}`.slice(0, 38));
    }
  }

  console.log(`\n  ENS_REGISTRY=${REGISTRY}`);
  console.log(`  ENS_RESOLVER=${resolver}\n`);
}

main().catch((err) => {
  console.error(`\n  ${err.shortMessage ?? err.message}\n`);
  process.exit(1);
});
