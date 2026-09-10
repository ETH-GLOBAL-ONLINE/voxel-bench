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

import express from "express";

import { createAgent, loadEnv, PAYWALL, tinybar } from "./pay.mjs";

loadEnv();

const PORT = Number(process.env.AGENT_PORT ?? 4403);
const CRAFTER = process.env.CRAFTER_URL ?? "http://127.0.0.1:8000";

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

// The payment ledger the browser renders. Every stage is listed before it is
// paid for, so someone watching sees what is coming rather than only what
// already happened — a price you learn afterwards is not a price.
function ledger(stages) {
  return stages.map((s) => ({
    stage: s.stage,
    description: s.description,
    amount: s.price,
    // Without a name there is no quote until the 402 arrives, and a price the
    // page does not know yet should read as unknown rather than as zero.
    label: s.price ? tinybar(s.price) : "quoted on request",
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

function message(err) {
  const text = err instanceof Error ? err.message : String(err);
  // A 403 from Open Cloud is almost always the key's IP allowlist, and the
  // message never says so. Saying it here saves the next person an hour.
  if (text.includes("403")) {
    return `${text} — a 403 from Roblox is almost always the API key's IP allowlist.`;
  }
  return text.slice(0, 400);
}

async function runCraft(id, prompt) {
  try {
    const { recipe, notes, usage } = await payFor(id, "recipe", { prompt });

    set(id, { stage: "crafting it in Blender" });
    const built = await payFor(id, "craft", { recipe });

    set(id, {
      status: "done",
      stage: null,
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
    payments: ledger(stages),
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
  if (prompt.length < 3) {
    return res.status(400).json({ error: "Say a little more about what you want." });
  }

  const offer = await quote(res);
  if (!offer) return;

  const stages = Object.values(offer.services).filter((s) => s.stage !== "publish");
  const id = start("craft", offer, stages);

  runCraft(id, prompt.slice(0, 280));
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

app.get("/craft/:job", (req, res) => {
  const job = jobs.get(req.params.job);
  if (!job) return res.status(404).json({ status: "failed", error: "no such job" });

  const { startedAt, ...rest } = job;
  res.json({
    ...rest,
    elapsed: job.status === "running" ? since(startedAt) : job.elapsed,
  });
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
  console.log("receipts https://hashscan.io/testnet/transaction/…");
});
