// Gives each service a permission of its own, and withholds the rest.
//
//   node scripts/ens/04-roles.mjs
//
// This is the part of ENSv2 that earns its place in this project rather than
// decorating it.
//
// Each service gets an identity, and that identity is authorized to write
// exactly one text record on exactly one name: its own `url`. A service that
// moves to a different host can say so without asking anyone. A service that
// wants to charge more cannot, because `x402:price` is a different record and
// the role to write it was never granted.
//
// The agent already has a cap it cannot argue past, in the Allowance contract.
// This is the same idea from the other side of the trade: the agent cannot
// overspend, and the service cannot overcharge. Neither limit is a promise in a
// prompt or a check in our own backend — both are permissions on a chain.
import { namehash, parseAbi, toHex } from "viem";
import { packetToBytes } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";

import { clients, loadEnv, PARENT, send, SERVICES } from "./ens.mjs";

loadEnv();

const { account, publicClient, wallet } = clients();

const RESOLVER = process.env.ENS_RESOLVER;
if (!RESOLVER) throw new Error("ENS_RESOLVER is required — run 03-services.mjs first");

// The one record a service may write about itself. Everything else on the name
// — price, asset, network — stays with the operator.
const OWN_KEY = "url";

const authorizeAbi = parseAbi([
  "function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool)",
]);

function serviceAccount(service) {
  const key = process.env[`ENS_SERVICE_${service.toUpperCase()}_KEY`];
  if (!key) throw new Error(`ENS_SERVICE_${service.toUpperCase()}_KEY is not set`);
  return privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
}

async function main() {
  console.log(`\n  one permission each, under ${PARENT}.eth\n`);
  console.log(`  operator  ${account.address}`);
  console.log(`  resolver  ${RESOLVER}\n`);

  for (const service of SERVICES) {
    const name = `${service}.${PARENT}.eth`;
    const identity = serviceAccount(service);
    const dnsName = toHex(packetToBytes(name));

    await send(publicClient, await wallet.writeContract({
      address: RESOLVER, abi: authorizeAbi, functionName: "authorizeTextRoles",
      args: [dnsName, OWN_KEY, identity.address, true],
    }), `${service} may write its own ${OWN_KEY}`);

    console.log(`            ${identity.address}  on ${name}`);
  }

  console.log("\n  Nothing was granted for x402:price, x402:asset or x402:network.");
  console.log("  Run verify-ens.mjs to watch a service try one and be refused.\n");
}

main().catch((err) => {
  console.error(`\n  ${err.shortMessage ?? err.message}\n`);
  process.exit(1);
});
