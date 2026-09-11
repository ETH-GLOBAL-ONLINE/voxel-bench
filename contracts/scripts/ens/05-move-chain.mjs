// Moves one service to a different chain by rewriting its records.
//
//   node scripts/ens/05-move-chain.mjs craft arc
//   node scripts/ens/05-move-chain.mjs craft hedera
//
// This is the argument for putting the terms in a name rather than in a
// configuration file. Nothing is redeployed and nothing restarts: the agent
// resolves the name on its next run, finds a different network, asset and
// price, and pays there.
//
// It also stays honest by itself. The agent compares every 402 against these
// records before signing, so a service whose records say Arc and whose paywall
// asks for HBAR is refused rather than quietly paid.
import { namehash } from "viem";

import { clients, loadEnv, PARENT, resolverAbi, send, SERVICES } from "./ens.mjs";

loadEnv();

const { publicClient, wallet } = clients();

const RESOLVER = process.env.ENS_RESOLVER;
if (!RESOLVER) throw new Error("ENS_RESOLVER is required");

const PAYWALL = process.env.ENS_PAYWALL_URL ?? "http://127.0.0.1:4402";

// Prices are in each chain's own smallest unit: tinybars on Hedera at 8
// decimals, and the USDC ERC-20's 6 on Arc. The same service costs the same
// fraction of a cent either way.
const RAILS = {
  hedera: {
    asset: "0.0.0",
    network: "hedera:testnet",
    payTo: () => process.env.HEDERA_SERVICE_ACCOUNT_ID,
    endpoint: (stage) => `${PAYWALL}/hbar/${stage}`,
    prices: { recipe: "100000", craft: "500000", publish: "1000000" },
  },
  arc: {
    asset: "0x3600000000000000000000000000000000000000",
    network: "eip155:5042002",
    payTo: () => process.env.ARC_PAY_TO,
    endpoint: (stage) => `${PAYWALL}/usdc/${stage}`,
    prices: { recipe: "1000", craft: "5000", publish: "10000" },
  },
};

async function main() {
  const [stage, railName] = process.argv.slice(2);

  if (!SERVICES.includes(stage) || !RAILS[railName]) {
    console.error(`\n  usage: node scripts/ens/05-move-chain.mjs <${SERVICES.join("|")}> <${Object.keys(RAILS).join("|")}>\n`);
    process.exit(1);
  }

  const rail = RAILS[railName];
  const payTo = rail.payTo();
  if (!payTo) throw new Error(`no account configured to receive on ${railName}`);

  const name = `${stage}.${PARENT}.eth`;
  const node = namehash(name);

  console.log(`\n  moving ${name} to ${rail.network}\n`);

  const records = [
    ["url", rail.endpoint(stage)],
    ["x402:price", rail.prices[stage]],
    ["x402:asset", rail.asset],
    ["x402:network", rail.network],
    ["x402:payTo", payTo],
  ];

  let changed = 0;
  for (const [key, value] of records) {
    const current = await publicClient.readContract({
      address: RESOLVER, abi: resolverAbi, functionName: "text", args: [node, key],
    }).catch(() => "");

    if (current === value) {
      console.log(`  ${key.padEnd(13)} unchanged`);
      continue;
    }

    await send(publicClient, await wallet.writeContract({
      address: RESOLVER, abi: resolverAbi, functionName: "setText",
      args: [node, key, value],
    }), `  ${key.padEnd(13)} ${value}`.slice(0, 40));
    changed += 1;
  }

  console.log(`\n  ${changed} record${changed === 1 ? "" : "s"} rewritten.`);
  console.log("  Nothing was redeployed. The agent will find this on its next run.\n");
}

main().catch((err) => {
  console.error(`\n  ${err.shortMessage ?? err.message}\n`);
  process.exit(1);
});
