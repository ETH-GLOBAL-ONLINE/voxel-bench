// The crafting agent, at a terminal.
//
// It holds a wallet and pays for each stage of a craft out of it. Nobody hands
// it an API key for the services it uses: it asks what they cost, pays, and is
// let through. That is the whole argument — a key you share is a key you can
// lose, and a payment is a permission that expires the moment it is spent.
//
//   node orchestrate.mjs "a wooden crate"
//
// The same agent is also reachable over HTTP — see server.mjs, which is what
// the website talks to. This file stays because a thing you can run in one
// line is the fastest way to show that the paying is real.
//
// Needs HEDERA_AGENT_ACCOUNT_ID and HEDERA_AGENT_PRIVATE_KEY, and the paywall
// running. Publishing additionally needs a Roblox account, which is the user's
// rather than the agent's — the agent pays for the work, not for the account.
import { createAgent, loadEnv, tinybar } from "./pay.mjs";

loadEnv();

let agent;
try {
  agent = createAgent();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

async function run(stage, body) {
  const { body: result, receipt } = await agent.callStage(stage, body);
  const paid = receipt.paid ? "paid" : "not charged";
  console.log(`  ${paid.padEnd(11)} ${stage.padEnd(8)} ${receipt.seconds}s`);
  if (receipt.explorer) console.log(`              ${receipt.explorer}`);
  return result;
}

async function main() {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error('usage: node orchestrate.mjs "a wooden crate"');
    process.exit(1);
  }

  const offer = await agent.offer();
  const services = Object.values(offer.services);
  const total = services.reduce((sum, s) => sum + Number(s.price ?? 0), 0);

  console.log(`\n  "${prompt}"\n`);
  console.log(`  agent    ${agent.accountId}`);
  if (offer.source === "ens") {
    console.log(`  found    ${services.length} services under ${offer.parent}`);
    console.log(`  paying   ${offer.payTo} on ${offer.network}`);
    console.log(`  quoted   ${services.map((s) => `${s.stage} ${tinybar(s.price)}`).join(", ")}`);
    console.log(`  total    ${tinybar(total)}\n`);
  } else {
    // Worth saying plainly: with no name to check against, the price is
    // whatever each 402 asks for, and the agent has only its own cap.
    console.log(`  found    services from configuration — ${offer.why}`);
    console.log(`  quoted   nothing; each 402 states its own price\n`);
  }

  const { recipe, notes, usage } = await run("recipe", { prompt });
  const built = await run("craft", { recipe });

  let published = null;
  if (process.env.ROBLOX_API_KEY && process.env.ROBLOX_USER_ID) {
    published = await run("publish", {
      name: built.name,
      api_key: process.env.ROBLOX_API_KEY,
      user_id: process.env.ROBLOX_USER_ID,
    });
  } else {
    console.log("  skipped     publish  (no Roblox account in the environment)");
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
