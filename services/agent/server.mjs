// The crafting agent, as a service.
//
// Same agent as orchestrate.mjs, reachable over HTTP so the website can ask it
// for an object instead of calling the crafter directly for free. That is the
// point of this file: there were two stories — a site that crafts for nothing
// and an agent that pays in a terminal nobody is watching — and there should
// be one. Now the browser watches the payments happen.
//
//   node server.mjs                       # :4403
//
// The wallet stays here, on the machine that already runs Blender. The browser
// never sees a private key and never signs anything; it watches an agent spend
// its own money, which is the only arrangement that is both honest and safe to
// put on a public site.
//
// Crafting takes twenty to sixty seconds and a serverless function gets ten,
// so this is a job board: start one, poll it. Jobs live in memory and die with
// the process, which is correct for a bench that is switched on to demo.
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { createAgent, loadEnv, money, PAYWALL } from "./pay.mjs";
import { claimTypedData, published, recipeId, settle } from "./recipes.mjs";
import { allCaps, draw } from "./allowance.mjs";
import { fetchRecipe, hasCollected, saveCollection, saveRecipe } from "./catalog.mjs";

loadEnv();

const PORT = Number(process.env.AGENT_PORT ?? 4403);
const CRAFTER = process.env.CRAFTER_URL ?? "http://127.0.0.1:8000";

// Where the crafter leaves its files. The agent runs on the same machine, which
// is how it can file a craft's preview in the catalog without asking for it.
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");

let agent;
try {
  agent = createAgent();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Matches the id shape the website already validates, so nothing downstream
// has to learn a new one.
const newJobId = () => randomBytes(8).toString("hex");

const jobs = new Map();

const since = (t) => Number(((Date.now() - t) / 1000).toFixed(1));

// A craft is old news after an hour and the files it names are still on disk,
// so there is no reason to keep the record. Without this a bench left running
// grows a map it never empties.
const KEEP_MS = 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - KEEP_MS;
  for (const [id, job] of jobs) if (job.startedAt < cutoff) jobs.delete(id);
}, 5 * 60 * 1000).unref();

function set(id, fields) {
  const job = jobs.get(id);
  if (job) Object.assign(job, fields, { elapsed: since(job.startedAt) });
}

// The prices the browser renders. Every stage is listed before it is paid for,
// so someone watching sees what is coming rather than only what already
// happened — a price you learn afterwards is not a price.
function quotes(stages) {
  return stages.map((s) => ({
    stage: s.stage,
    description: s.description,
    amount: s.price,
    network: s.network,
    // Without a name there is no quote until the 402 arrives, and a price the
    // page does not know yet should read as unknown rather than as zero.
    label: money(s.price, s.network) ?? "quoted on request",
    status: "quoted",
    seconds: null,
    transaction: null,
    explorer: null,
  }));
}

function mark(id, stage, fields) {
  const entry = jobs.get(id)?.payments.find((p) => p.stage === stage);
  if (entry) Object.assign(entry, fields);
}

async function payFor(id, stage, body) {
  mark(id, stage, { status: "paying" });
  set(id, { stage: `paying for the ${stage}` });

  const { body: result, receipt } = await agent.callStage(stage, body);

  mark(id, stage, {
    status: receipt.paid ? "paid" : "unpaid",
    seconds: receipt.seconds,
    transaction: receipt.transaction,
    explorer: receipt.explorer,
  });
  return result;
}

/**
 * What this craft will cost, grouped by the chain it settles on.
 *
 * A cap is denominated, and the two chains disagree about the denomination —
 * tinybars at 8 decimals against USDC at 18. Summing them gives a number that
 * is wrong on both, which is what this did before: 100,000 tinybars plus 5,000
 * USDC units came out as "0.00105 HBAR". One draw per chain instead.
 */
//
// One more scale to reconcile. An x402 price on Arc is quoted in the USDC
// ERC-20's 6 decimals, and the allowance holds native USDC at 18 — the same
// balance, two views, a factor of 10^12 between them. Drawing the quoted
// number would take a millionth of a millionth of what the craft costs.
//
// Third time this shape of bug has appeared in three chains. It is written up
// in FEEDBACK because at three it stops being anyone's quirk.
const CHAIN_OF = { "hedera:testnet": "hedera", "eip155:5042002": "arc" };
const TO_ALLOWANCE_UNITS = { hedera: 1n, arc: 1000000000000n };
const MINIMUM_DRAW = { hedera: 100000n, arc: 1000000000000n };

function costOf(id) {
  const job = jobs.get(id);
  const totals = new Map();

  for (const payment of job?.payments ?? []) {
    const chain = CHAIN_OF[payment.network ?? "hedera:testnet"];
    if (!chain) continue;
    const amount = BigInt(payment.amount ?? 0) * TO_ALLOWANCE_UNITS[chain];
    totals.set(chain, (totals.get(chain) ?? 0n) + amount);
  }

  // Nothing quoted yet — draw the smallest sensible amount, since the contract
  // rejects zero outright.
  if (!totals.size) totals.set("hedera", MINIMUM_DRAW.hedera);
  return [...totals].filter(([, amount]) => amount > 0n);
}

function message(err) {
  const text = err instanceof Error ? err.message : String(err);
  // A 403 from Open Cloud is almost always the key's IP allowlist, and the
  // message never says so. Saying it here saves the next person an hour.
  if (text.includes("403")) {
    return `${text} — a 403 from Roblox is almost always the API key's IP allowlist.`;
  }
  return text.slice(0, 400);
}

async function runCraft(id, prompt, { recipe: existing = null, collector = null } = {}) {
  try {
    // Draw what this craft will cost before spending any of it. When the
    // window's cap is used up the contract refuses, and the craft stops here —
    // which is the difference between a limit and a note about a limit.
    set(id, { stage: "drawing from the spending cap" });
    const allowance = [];
    for (const [chain, amount] of costOf(id)) {
      allowance.push(await draw(amount, chain));
    }
    set(id, { allowance });

    // A recipe from the marketplace already exists: no model is asked for it,
    // which is why getting one is quick and costs only the craft.
    const { recipe, notes, usage } = existing
      ? { recipe: existing, notes: ["Crafted from the marketplace: no model was asked."], usage: null }
      : await payFor(id, "recipe", { prompt });

    set(id, { stage: "crafting it in Blender" });
    const built = await payFor(id, "craft", { recipe });

    // Record it against RecipeBook: a recipe nobody has seen is published, one
    // that already has an author is crafted against and the split pays them.
    // This is money changing hands, so it is reported separately from the work
    // and a failure here does not fail a craft that already happened.
    set(id, { stage: "recording it on RecipeBook" });
    const book = await settle(recipe);

    // A new recipe is not filed in the catalog yet. Unowned, its id is up for
    // grabs to whoever sees it first (SR-01), and the catalog is public. It is
    // filed when someone claims it — see /claim.
    const catalog = { saved: false, skipped: existing ? "already in the catalog" : "filed when claimed" };

    // A copy got from the marketplace is noted against whoever asked for it.
    // Its author has just been paid on the chain; this says who it was for.
    // Never your own work: a copy of a recipe you wrote is not something you
    // collected, whoever calls this.
    const collected =
      existing &&
      collector &&
      book.action === "crafted" &&
      collector.toLowerCase() !== String(book.author ?? "").toLowerCase()
        ? await saveCollection({
            collector,
            recipeId: book.id,
            chain: book.chain,
            transaction: book.transaction,
          })
        : null;

    set(id, {
      status: "done",
      stage: null,
      book,
      catalog,
      collected,
      result: {
        name: built.name,
        recipe,
        notes: [...(notes ?? []), ...(built.notes ?? [])],
        ingredients: recipe.ingredients.length,
        // Not the same number: a cone becomes four Roblox parts.
        parts: built.parts ?? null,
        tris: built.tris,
        studs: built.studs,
        model: usage?.model ?? null,
        tokens: usage?.tokens ?? null,
        files: built.files,
      },
    });
  } catch (err) {
    // Whichever stage was mid-payment when this threw keeps the status it had,
    // so the browser can say which one failed rather than blaming the run.
    set(id, { status: "failed", stage: null, error: message(err) });
  }
}

async function runPublish(id, name, apiKey, userId) {
  try {
    const asset = await payFor(id, "publish", {
      name,
      api_key: apiKey,
      user_id: userId,
    });
    set(id, {
      status: "done",
      stage: null,
      result: {
        assetId: asset.assetId,
        moderation: asset.moderation,
        insert: `game:GetService('InsertService'):LoadAsset(${asset.assetId})`,
      },
    });
  } catch (err) {
    set(id, { status: "failed", stage: null, error: message(err) });
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

function start(kind, offer, stages) {
  const id = newJobId();
  jobs.set(id, {
    kind,
    status: "running",
    stage: "asking what it costs",
    startedAt: Date.now(),
    elapsed: 0,
    error: null,
    result: null,
    agent: agent.accountId,
    payTo: offer.payTo,
    network: offer.network,
    // Where the terms came from, so the page can say whether the prices it is
    // showing were resolved from names or taken from the service's own word.
    discovery: offer.source,
    parent: offer.parent ?? null,
    payments: quotes(stages),
  });
  return id;
}

// Read the menu before ordering. The agent does this on every job rather than
// caching it, because a price we assume is a price we can be wrong about.
async function quote(res) {
  try {
    return await agent.offer();
  } catch (err) {
    res.status(503).json({ error: `the paywall is not answering: ${message(err)}` });
    return null;
  }
}

app.post("/craft", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  const wanted = String(req.body?.recipeId ?? "").toLowerCase();
  const asked = String(req.body?.collector ?? "");
  const collector = /^0x[0-9a-fA-F]{40}$/.test(asked) ? asked : null;

  // Either a sentence, which the model turns into a new recipe, or the id of one
  // that exists, which is crafted from the catalog as it is.
  let recipe = null;
  if (wanted) {
    if (!/^0x[0-9a-f]{64}$/.test(wanted)) {
      return res.status(400).json({ error: "bad recipe id" });
    }
    recipe = await fetchRecipe(wanted);
    if (!recipe) return res.status(404).json({ error: "That recipe is not in the catalog." });

    // Got once is enough. A second get would pay the author again for a copy
    // already in the backpack, and count a craft that added nothing. Refused
    // here, before anything is spent, whoever calls this.
    if (collector && (await hasCollected(collector, wanted))) {
      return res.status(409).json({ error: "That recipe is already in your backpack." });
    }
  } else if (prompt.length < 3) {
    return res.status(400).json({ error: "Say a little more about what you want." });
  }

  const offer = await quote(res);
  if (!offer) return;

  const stages = Object.values(offer.services).filter(
    (s) => s.stage !== "publish" && !(recipe && s.stage === "recipe"),
  );
  const id = start("craft", offer, stages);

  runCraft(id, recipe ? null : prompt.slice(0, 280), { recipe, collector });
  res.json({ job: id, agent: agent.accountId, payTo: offer.payTo });
});

// The Roblox key belongs to whoever is publishing — not to us, and not to the
// agent. It arrives with the request, is used once, and is never written down.
app.post("/publish", async (req, res) => {
  const { name, api_key: apiKey, user_id: userId } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "nothing to publish" });
  if (!apiKey || !userId) {
    return res.status(400).json({ error: "Connect a Roblox account first." });
  }

  const offer = await quote(res);
  if (!offer) return;

  const stages = Object.values(offer.services).filter((s) => s.stage === "publish");
  const id = start("publish", offer, stages);

  runPublish(id, String(name), String(apiKey), String(userId));
  res.json({ job: id });
});

// What an author signs to claim a recipe, built from the deployment rather
// than from anything the page knows. A page that hardcodes a contract address
// keeps signing for the wrong one after a redeployment.
app.get("/claim/:id", (req, res) => {
  const { id } = req.params;
  const author = String(req.query.author ?? "");
  if (!/^0x[a-f0-9]{64}$/i.test(id)) {
    return res.status(400).json({ error: "bad recipe id" });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(author)) {
    return res.status(400).json({ error: "bad author address" });
  }
  res.json(claimTypedData(id, author));
});

// Relay a claim. The signature says who owns it; we only pay the gas.
app.post("/claim", async (req, res) => {
  const { recipe, author, signature } = req.body ?? {};
  if (!recipe || !author || !signature) {
    return res.status(400).json({ error: "recipe, author and signature are required" });
  }
  const result = await settle(recipe, { author, signature });

  // Owned now, so it can go in the catalog: the backpack shows it by name, and
  // its id is no longer something a stranger could claim first.
  if (result.action === "published") {
    result.catalog = await saveRecipe({
      id: result.id,
      recipe,
      preview: resolve(OUT, `${recipe.name}_preview.png`),
    });
  }

  res.status(result.action === "failed" ? 502 : 200).json(result);
});

// What RecipeBook holds: every published recipe, its author, how often it was
// crafted and what that earned. Read from the chain rather than from us, which
// is the argument the marketplace rests on.
app.get("/recipes", async (req, res) => {
  try {
    res.json(await published({ ledgerName: req.query.chain }));
  } catch (err) {
    res.status(502).json({ error: message(err) });
  }
});

app.get("/craft/:job", (req, res) => {
  const job = jobs.get(req.params.job);
  if (!job) return res.status(404).json({ status: "failed", error: "no such job" });

  const { startedAt, ...rest } = job;
  res.json({
    ...rest,
    elapsed: job.status === "running" ? since(startedAt) : job.elapsed,
  });
});

// What the agent may still spend in this window, and out of how much.
app.get("/allowance", async (_req, res) => {
  try {
    res.json({ caps: await allCaps() });
  } catch (err) {
    res.status(502).json({ error: message(err) });
  }
});

app.get("/health", async (_req, res) => {
  let paywall = false;
  let crafter = false;
  try {
    const r = await fetch(`${PAYWALL()}/health`, { signal: AbortSignal.timeout(3000) });
    paywall = r.ok;
    crafter = Boolean((await r.json()).crafter);
  } catch {
    // the paywall being down is a fact to report, not an error here
  }
  const terms = await agent.offer().catch(() => null);
  res.json({
    ok: true,
    agent: agent.accountId,
    paywall,
    crafter,
    jobs: jobs.size,
    discovery: terms?.source ?? null,
    parent: terms?.parent ?? null,
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`agent    :${PORT}  ->  ${PAYWALL()}  ->  ${CRAFTER}`);
  console.log(`wallet   ${agent.accountId}`);
  console.log("receipts hashscan.io for Hedera, arcscan.app for Arc");
});
