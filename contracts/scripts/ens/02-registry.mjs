// Deploys our own registry for the name's children, and points the name at it.
//
//   node scripts/ens/02-registry.mjs
//
// This is the hierarchical half of ENSv2, and it is the reason the three
// services are subnames rather than three separate registrations. Everything
// under voxelbench.eth is answered by a registry we deploy and control: who may
// create a service name, who may point it somewhere else, and who may not.
//
// The registry is a proxy deployed through the Verifiable Factory, at an
// address derived from the parent's namehash — so it is reproducible, and
// re-running this finds the existing one rather than deploying a second.
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
  toHex,
} from "viem";

import {
  ALL_ROLES,
  clients,
  ENS,
  factoryAbi,
  loadEnv,
  PARENT,
  registryAbi,
  send,
} from "./ens.mjs";

loadEnv();

const { account, publicClient, wallet } = clients();

const name = `${PARENT}.eth`;
const labelId = BigInt(keccak256(stringToHex(PARENT)));

// The factory's salt scheme, so the same parent always yields the same address.
const VERSION = 0n;
const salt = BigInt(keccak256(encodeAbiParameters(
  [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
  [keccak256(stringToHex("UserRegistry")), namehash(name), VERSION],
)));

async function main() {
  console.log(`\n  a registry for the children of ${name}\n`);

  const existing = await publicClient.readContract({
    address: ENS.ethRegistry, abi: registryAbi,
    functionName: "getSubregistry", args: [PARENT],
  });

  let registry = existing;

  if (existing && existing !== "0x0000000000000000000000000000000000000000") {
    console.log(`  ${name} already delegates to ${existing}`);
  } else {
    // initialize(rootAccount, roleBitmap) — every role to us at the root, which
    // is what lets the next script hand narrower ones out.
    const initialize = encodeFunctionData({
      abi: parseAbi(["function initialize(address rootAccount, uint256 roleBitmap)"]),
      functionName: "initialize",
      args: [account.address, ALL_ROLES],
    });

    const receipt = await send(publicClient, await wallet.writeContract({
      address: ENS.verifiableFactory, abi: factoryAbi, functionName: "deployProxy",
      args: [ENS.userRegistryImpl, salt, initialize],
    }), "deployed the registry proxy");

    // The proxy address comes off the event rather than being predicted: a
    // CREATE2 address computed from bytecode we did not compile is a guess.
    const deployed = receipt.logs
      .map((log) => {
        try {
          return publicClient.chain && log.topics[0] && log;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const { decodeEventLog } = await import("viem");
    for (const log of deployed) {
      try {
        const event = decodeEventLog({ abi: factoryAbi, ...log });
        if (event.eventName === "ProxyDeployed") registry = event.args.proxyAddress;
      } catch {
        // not our event
      }
    }
    if (!registry) throw new Error("no ProxyDeployed event in the receipt");
    console.log(`  registry  ${registry}`);

    await send(publicClient, await wallet.writeContract({
      address: ENS.ethRegistry, abi: registryAbi, functionName: "setSubregistry",
      args: [labelId, registry],
    }), "pointed the name at it");
  }

  const confirmed = await publicClient.readContract({
    address: ENS.ethRegistry, abi: registryAbi,
    functionName: "getSubregistry", args: [PARENT],
  });
  console.log(`\n  ${name} -> ${confirmed}`);
  console.log(`\n  ENS_REGISTRY=${confirmed}\n`);
}

main().catch((err) => {
  console.error(`\n  ${err.shortMessage ?? err.message}\n`);
  process.exit(1);
});
