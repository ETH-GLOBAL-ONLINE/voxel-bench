// Where the agent learns what the services are, and what they charge.
//
// Until now it read PAYWALL_URL out of a .env file and took the price from
// whatever the 402 asked for. Both of those are the service describing itself:
// the endpoint we were told to use, and the amount it says it wants.
//
// Here it resolves a name instead. `recipe.voxelbench.eth` carries the endpoint
// and the terms in its resolver records, and those records are writable only by
// the operator — the service itself holds a role for its own `url` and nothing
// else. So the name is the quote and the 402 is a claim, and the two can be
// compared.
//
// Resolution happens once. A name lookup is several round trips to Sepolia and
// a craft should not pay for that three times.
import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";

// ENSv2 beta. Fixed address, and the only ENS address this file needs: the
// Universal Resolver walks the hierarchy from the root down to whichever
// registry answers for the name.
const UNIVERSAL_RESOLVER = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";

const SEPOLIA_RPC = () =>
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const PARENT = () => process.env.VOXEL_ENS_PARENT;
const STAGES = ["recipe", "craft", "publish"];

const KEYS = ["url", "x402:price", "x402:asset", "x402:network", "x402:payTo", "description"];

let cached = null;

/** The terms as the paywall would state them, for a bench with no ENS. */
function fromEnvironment(why) {
  const base = process.env.PAYWALL_URL ?? "http://127.0.0.1:4402";
  const asset = process.env.VOXEL_PAY_ASSET ?? "hbar";
  return {
    source: "configuration",
    why,
    payTo: null,
    network: null,
    services: Object.fromEntries(STAGES.map((stage) => [stage, {
      stage,
      url: `${base}/${asset}/${stage}`,
      // Nothing to check the 402 against: the price is whatever it says.
      price: null,
      asset: null,
      network: null,
      payTo: null,
      description: null,
    }])),
  };
}

async function fromEns(parent) {
  // Batching turns fifteen lookups into a handful of multicalls. Without it
  // resolution costs more than the craft it precedes.
  const client = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC()),
    batch: { multicall: true },
  });

  // Every lookup at once. Sequentially this took 24 seconds, which is longer
  // than the craft it precedes; the batcher collapses them into a few calls.
  const resolved = await Promise.all(STAGES.map(async (stage) => {
    const name = normalize(`${stage}.${parent}`);
    const [url, price, asset, network, payTo, description] = await Promise.all(
      KEYS.map((key) => client.getEnsText({
        name, key, universalResolverAddress: UNIVERSAL_RESOLVER,
      })));

    if (!url) throw new Error(`${name} has no url record`);
    return [stage, { stage, url, price, asset, network, payTo, description }];
  }));

  const services = Object.fromEntries(resolved);
  const first = services[STAGES[0]];
  return {
    source: "ens",
    parent,
    // The three currently agree, and nothing requires them to: a service paid
    // into a different account is a normal thing to want. Taken from the first
    // for the header, checked per stage before each payment.
    payTo: first?.payTo ?? null,
    network: first?.network ?? null,
    services,
  };
}

/**
 * Resolves the services once and remembers them.
 *
 * Without VOXEL_ENS_PARENT, or if Sepolia cannot be reached, this falls back to
 * the configured paywall and says so. Running the bench should not require a
 * second chain to be up, but it should be obvious which one you are running.
 */
export async function discover({ refresh = false } = {}) {
  if (cached && !refresh) return cached;

  const parent = PARENT();
  if (!parent) {
    cached = fromEnvironment("VOXEL_ENS_PARENT is not set");
    return cached;
  }

  try {
    cached = await fromEns(parent);
  } catch (err) {
    cached = fromEnvironment(`${parent} did not resolve: ${err.shortMessage ?? err.message}`);
  }
  return cached;
}

/**
 * Checks what a 402 asks for against what the name says.
 *
 * Returns null when they agree and a sentence when they do not. A service can
 * move itself to a new host — that record is its own — but the price, the asset
 * and the network belong to the name, and a 402 that disagrees with them is one
 * we do not sign.
 */
export function disagreement(terms, requirement) {
  if (!terms?.price) return null; // nothing to check against

  if (requirement.amount !== terms.price) {
    return `${terms.stage} asks ${requirement.amount} but its name says ${terms.price}`;
  }
  if (terms.asset && requirement.asset !== terms.asset) {
    return `${terms.stage} asks to be paid in ${requirement.asset}, not ${terms.asset}`;
  }
  if (terms.network && requirement.network !== terms.network) {
    return `${terms.stage} asks for ${requirement.network}, not ${terms.network}`;
  }
  if (terms.payTo && requirement.payTo !== terms.payTo) {
    return `${terms.stage} asks to be paid into ${requirement.payTo}, not ${terms.payTo}`;
  }
  return null;
}

export const stages = () => STAGES;
