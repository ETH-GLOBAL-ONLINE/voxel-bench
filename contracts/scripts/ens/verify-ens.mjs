// Checks the names against the live chain, the way an agent would read them.
//
//   node scripts/ens/verify-ens.mjs
//
// Two things are worth proving and neither is provable by reading our own
// resolver directly:
//
//   1. The names resolve. Every lookup here goes through the Universal
//      Resolver at its fixed address, which walks the hierarchy from the root
//      down to our registry. If our delegation were wrong, this is where it
//      would show.
//
//   2. The permissions hold. A service is asked to change its own url, which it
//      may, and then to change its price, which it may not — and the refusal
//      comes from the resolver rather than from anything we wrote.
import { namehash, parseAbi, toHex } from "viem";
import { packetToBytes, normalize } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";

import { clients, ENS, loadEnv, PARENT, SERVICES } from "./ens.mjs";

loadEnv();

const { publicClient } = clients();

const RESOLVER = process.env.ENS_RESOLVER;
if (!RESOLVER) throw new Error("ENS_RESOLVER is required");

const KEYS = ["url", "x402:price", "x402:asset", "x402:network", "description"];

const setTextAbi = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  // Declared so the refusal reads as a named rule rather than a selector.
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
]);

const hbar = (tinybars) => `${(Number(tinybars) / 1e8).toFixed(4)} HBAR`;

async function readTerms(name) {
  const terms = {};
  for (const key of KEYS) {
    terms[key] = await publicClient.getEnsText({
      name: normalize(name),
      key,
      universalResolverAddress: ENS.universalResolver,
    });
  }
  return terms;
}

async function main() {
  console.log(`\n  reading ${PARENT}.eth through the Universal Resolver`);
  console.log(`  ${ENS.universalResolver}\n`);

  let total = 0n;
  for (const service of SERVICES) {
    const name = `${service}.${PARENT}.eth`;
    const terms = await readTerms(name);

    if (!terms.url) {
      console.log(`  ${name}  — nothing resolved. That is a failure.`);
      process.exitCode = 1;
      continue;
    }

    total += BigInt(terms["x402:price"] ?? 0);
    console.log(`  ${name}`);
    console.log(`    ${terms.description}`);
    console.log(`    ${terms.url}`);
    console.log(`    ${hbar(terms["x402:price"])} in ${terms["x402:asset"]} on ${terms["x402:network"]}\n`);
  }
  console.log(`  a whole craft, quoted entirely from names: ${hbar(total)}\n`);

  // ── the permission boundary ─────────────────────────────────────────────
  //
  // Simulated rather than sent: a simulation runs the same checks against the
  // same state and costs nothing, so the service identities never need funding
  // to demonstrate what they may and may not do.
  const service = "recipe";
  const name = `${service}.${PARENT}.eth`;
  const node = namehash(name);
  const identity = privateKeyToAccount(process.env[`ENS_SERVICE_${service.toUpperCase()}_KEY`]);

  console.log(`  ${identity.address} is the ${service} service.\n`);

  const attempt = async (key, value, expectation) => {
    try {
      await publicClient.simulateContract({
        address: RESOLVER, abi: setTextAbi, functionName: "setText",
        args: [node, key, value], account: identity,
      });
      console.log(`    ${key.padEnd(12)} allowed`);
      return true;
    } catch (err) {
      const why = err?.cause?.data?.errorName ?? err.shortMessage ?? "reverted";
      console.log(`    ${key.padEnd(12)} refused — ${why}`);
      return false;
    }
  };

  console.log(`  moving itself to a new host:`);
  const movedHost = await attempt("url", "http://bench.example:4402/hbar/recipe");

  console.log(`\n  raising its own price tenfold:`);
  const raisedPrice = await attempt("x402:price", "1000000");

  console.log();
  if (movedHost && !raisedPrice) {
    console.log("  A service can say where it is and cannot say what it costs.");
    console.log("  The agent has a cap it cannot argue past; the service has a");
    console.log("  price it cannot raise. Both are permissions, not promises.\n");
  } else {
    console.log("  Not the expected outcome. One of the two roles is wrong.\n");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\n  ${err.shortMessage ?? err.message}\n`);
  process.exit(1);
});
