// The crafting agent.
//
// It holds a wallet and pays for each stage of a craft out of it. Nobody hands
// it an API key for the services it uses: it asks what they cost, pays, and is
// let through. That is the whole argument — a key you share is a key you can
// lose, and a payment is a permission that expires the moment it is spent.
//
//   node orchestrate.mjs "a wooden crate"
//
// Needs HEDERA_AGENT_ACCOUNT_ID and HEDERA_AGENT_PRIVATE_KEY, and the paywall
// running. Publishing additionally needs a Roblox account, which is the user's
// rather than the agent's — the agent pays for the work, not for the account.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrivateKey } from "@hiero-ledger/sdk";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

function loadEnv() {
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
loadEnv();

const PAYWALL = process.env.PAYWALL_URL ?? "http://127.0.0.1:4402";
const ASSET = process.env.VOXEL_PAY_ASSET ?? "hbar";

const accountId = process.env.HEDERA_AGENT_ACCOUNT_ID;
const privateKey = process.env.HEDERA_AGENT_PRIVATE_KEY;
if (!accountId || !privateKey) {
  console.error("HEDERA_AGENT_ACCOUNT_ID and HEDERA_AGENT_PRIVATE_KEY are required");
  process.exit(1);
}

const signer = createClientHederaSigner(
  accountId,
  PrivateKey.fromStringECDSA(privateKey),
  { network: "hedera:testnet" },
);

// A cap the agent cannot argue its way past, enforced before a payment is even
// constructed rather than asked for in a prompt. HBAR is not one of the
// library's recognised default assets, so it has to be listed explicitly —
// which is a good default: an agent should not be able to spend a token nobody
// decided it could spend.
const MAX_PER_PAYMENT_TINYBAR = process.env.VOXEL_MAX_TINYBAR ?? "2000000"; // 0.02 HBAR

const client = new x402Client()
  .setSpendControls({
    maxAmountPerPayment: "$0.10",
    allowedAssets: [
      {
        network: "hedera:testnet",
        asset: "0.0.0",
        maxAmountPerPayment: MAX_PER_PAYMENT_TINYBAR,
      },
    ],
  })
  .register("hedera:testnet", new ExactHederaScheme(signer));

// Every 402 this fetch meets is answered by signing a transfer and retrying.
// The stages below are written as if payment did not exist, which is the point:
// paying is plumbing, not a step the caller has to think about.
const paidFetch = wrapFetchWithPayment(globalThis.fetch, client);

const tinybar = (n) => `${(Number(n) / 1e8).toFixed(4)} HBAR`;

async function callStage(stage, body) {
  const url = `${PAYWALL}/${ASSET}/${stage}`;
  const started = Date.now();

  const res = await paidFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`${stage} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  console.log(`  paid and ran  ${stage.padEnd(8)} ${seconds}s`);
  return JSON.parse(text);
}

async function main() {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error('usage: node orchestrate.mjs "a wooden crate"');
    process.exit(1);
  }

  const offer = await (await fetch(`${PAYWALL}/services`)).json();
  const total = offer.stages.reduce((sum, s) => sum + Number(s.hbar.amount), 0);

  console.log(`\n  "${prompt}"\n`);
  console.log(`  agent    ${accountId}`);
  console.log(`  paying   ${offer.payTo} on ${offer.network}`);
  console.log(`  quoted   ${offer.stages.map((s) => `${s.stage} ${tinybar(s.hbar.amount)}`).join(", ")}`);
  console.log(`  total    ${tinybar(total)}\n`);

  const { recipe, notes, usage } = await callStage("recipe", { prompt });
  const built = await callStage("craft", { recipe });

  let published = null;
  if (process.env.ROBLOX_API_KEY && process.env.ROBLOX_USER_ID) {
    published = await callStage("publish", {
      name: built.name,
      api_key: process.env.ROBLOX_API_KEY,
      user_id: process.env.ROBLOX_USER_ID,
    });
  } else {
    console.log("  skipped   publish  (no Roblox account in the environment)");
  }

  console.log(`\n  ${built.name} — ${built.parts} parts, ${built.tris} triangles, ` +
    `${built.studs.join(" × ")} studs`);
  console.log(`  recipe written by ${usage.model}, ${usage.tokens} tokens`);
  for (const note of notes ?? []) console.log(`  note: ${note}`);
  if (published) {
    console.log(`  published as asset ${published.assetId} (${published.moderation})`);
  }
  console.log();
}

main().catch((err) => {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
});
