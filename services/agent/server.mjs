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
import { claimTypedData, lookup, published, recipeId, settle } from "./recipes.mjs";
import { allCaps, draw } from "./allowance.mjs";
import { fetchRecipe, hasCollected, saveCollection, saveRecipe } from "./catalog.mjs";
import { openCrafted } from "./crafted.mjs";
import { composeObby } from "./obby.mjs";
import {
  applyPermit,
  budgetOf,
  charge,
  permitTypedData,
  PRICE,
  refund,
  testCredit,
  usdc,
  userPays,
} from "./budget.mjs";

loadEnv();

const PORT = Number(process.env.AGENT_PORT ?? 4403);
const CRAFTER = process.env.CRAFTER_URL ?? "http://127.0.0.1:8000";

// Where the crafter leaves its files. The agent runs on the same machine, which
// is how it can file a craft's preview in the catalog without asking for it.
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");

// Who crafted what, so that a recipe is claimed by the person who made it and
// by nobody else. Private to this machine; see crafted.mjs.
const crafted = openCrafted(resolve(OUT, "crafted.json"));

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

// Every step the job takes, in order, so the page can show the work behind a
// payment rather than only its receipt: the 402, the check against the name,
// the signature, the settlement.
function log(id, stage, text, link = null) {
  const job = jobs.get(id);
  if (job) job.log.push({ t: since(job.startedAt), stage, text, link });
}

const short = (a) => `${String(a).slice(0, 6)}…${String(a).slice(-4)}`;

const txLink = (chainName, tx) =>
  !tx
    ? null
    : String(chainName ?? "").startsWith("Arc")
      ? `https://testnet.arcscan.app/tx/${tx}`
      : `https://hashscan.io/testnet/transaction/${tx}`;

async function payFor(id, stage, body) {
  mark(id, stage, { status: "paying" });
  set(id, { stage: `paying for the ${stage}` });

  const { body: result, receipt } = await agent.callStage(stage, body, (text, link) =>
    log(id, stage, text, link),
  );

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

async function runCraft(
  id,
  prompt,
  { recipe: existing = null, collector = null, pieces = null, payer = null, bill = [] } = {},
) {
  // What was taken from the person's budget, and whether the work it paid for
  // happened. A job that fails before the craft gives it back.
  let charged = null;
  let worked = false;
  const total = bill.reduce((sum, b) => sum + b.amount, 0n);

  try {
    // The person pays first, from the budget they gave their agent. One
    // transfer for the whole job, so a craft is one line in their wallet
    // rather than a line per stage.
    if (userPays() && payer) {
      set(id, { stage: "taking the cost from your budget" });
      log(
        id,
        "budget",
        `this job costs ${usdc(total)}: ${bill.map((b) => `${b.item} ${usdc(b.amount)}`).join(", ")}`,
      );
      charged = await charge(payer, total);
      log(
        id,
        "budget",
        `took ${charged.amountLabel} from your budget — USDC.transferFrom(${short(payer)} → agent), ${charged.leftLabel} left`,
        charged.explorer,
      );
      set(id, {
        bill: {
          items: bill.map((b) => ({ item: b.item, amount: usdc(b.amount) })),
          total: usdc(total),
          transaction: charged.transaction,
          explorer: charged.explorer,
          left: charged.leftLabel,
        },
      });
    }

    // Draw what this craft will cost before spending any of it. When the
    // window's cap is used up the contract refuses, and the craft stops here —
    // which is the difference between a limit and a note about a limit.
    set(id, { stage: "drawing from the spending cap" });
    const allowance = [];
    for (const [chain, amount] of costOf(id)) {
      const drawn = await draw(amount, chain);
      allowance.push(drawn);
      if (drawn.drawn) {
        log(
          id,
          "cap",
          `drew ${drawn.amountLabel} from the agent's own cap on ${chain === "arc" ? "Arc" : "Hedera"} — ${drawn.remainingLabel} left in this window`,
          txLink(chain === "arc" ? "Arc" : "Hedera", drawn.transaction),
        );
      }
    }
    set(id, { allowance });

    // A recipe from the marketplace already exists: no model is asked for it,
    // which is why getting one is quick and costs only the craft.
    const { recipe, notes, usage } = existing
      ? {
          recipe: existing,
          notes: [
            pieces
              ? `Built from ${pieces.length} pieces: ${pieces.map((p) => p.name).join(", ")}. No model was asked.`
              : "Crafted from the marketplace: no model was asked.",
          ],
          usage: null,
        }
      : await payFor(id, "recipe", { prompt });

    set(id, { stage: "crafting it in Blender" });
    const built = await payFor(id, "craft", { recipe });
    worked = true;

    // Record it against RecipeBook: a recipe nobody has seen is published, one
    // that already has an author is crafted against and the split pays them.
    // This is money changing hands, so it is reported separately from the work
    // and a failure here does not fail a craft that already happened.
    set(id, { stage: "recording it on RecipeBook" });
    const book = await settle(recipe);
    log(
      id,
      "book",
      book.action === "crafted"
        ? `RecipeBook.craft on ${book.chain}: 90% to the author, who has now earned ${book.paidToAuthor}`
        : book.action === "unclaimed"
          ? "RecipeBook: nobody owns this recipe yet, so there is no author to pay — claim it to own it"
          : book.action === "published"
            ? `RecipeBook: published under ${short(book.author)}`
            : `RecipeBook could not be reached: ${book.error ?? "unknown error"}`,
      txLink(book.chain, book.transaction),
    );

    // A new recipe is written down against whoever paid for it, privately, so
    // that only they can claim it (SR-01): the signature on a claim proves a
    // wallet, and this is what proves the work. A recipe that already has an
    // author needs no note.
    if (book.action !== "crafted" && (!existing || pieces)) {
      const crafter = payer ?? collector ?? null;
      crafted.record({ id: book.id, name: built.name, recipe, crafter, chain: book.chain });
      log(
        id,
        "book",
        crafter
          ? `noted as crafted by ${short(crafter)}: only that address can claim it`
          : "noted as crafted with nobody signed in, so nobody can claim it",
      );
    }

    // A new recipe is not filed in the catalog yet. Unowned, its id is up for
    // grabs to whoever sees it first (SR-01), and the catalog is public. It is
    // filed when someone claims it — see /claim.
    const catalog = {
      saved: false,
      skipped: existing && !pieces ? "already in the catalog" : "filed when claimed",
    };

    // A copy got from the marketplace is noted against whoever asked for it.
    // Its author has just been paid on the chain; this says who it was for.
    // Never your own work: a copy of a recipe you wrote is not something you
    // collected, whoever calls this.
    const collected =
      existing &&
      !pieces &&
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

    // Building an obby gets you the pieces you do not have yet. Each distinct
    // one is crafted against RecipeBook, which pays its author the usual
    // share, and goes into your backpack as collected — the same as Get it.
    // A piece you wrote, or already got, is used without paying for it again.
    let paidPieces = null;
    if (pieces) {
      set(id, { stage: "getting the pieces you do not have" });
      paidPieces = [];
      const done = new Set();
      const me = collector?.toLowerCase() ?? null;
      for (const piece of pieces) {
        if (done.has(piece.id)) continue;
        done.add(piece.id);

        // Decided before the job started, when the bill was drawn up, so what
        // was charged and what is paid out are the same list.
        if (piece.plan === "yours" || piece.plan === "had") {
          paidPieces.push({
            id: piece.id,
            name: piece.name,
            action: piece.plan,
            author: piece.author ?? null,
          });
          log(
            id,
            "pieces",
            piece.plan === "yours"
              ? `${piece.name} is yours: nothing to pay`
              : `${piece.name} is already in your backpack: not paid for again`,
          );
          continue;
        }

        const paid = await settle(piece.recipe);
        const kept =
          me && paid.action === "crafted"
            ? await saveCollection({
                collector: me,
                recipeId: piece.id,
                chain: paid.chain,
                transaction: paid.transaction,
              })
            : null;
        paidPieces.push({
          id: piece.id,
          name: piece.name,
          action: paid.action,
          author: paid.author ?? null,
          transaction: paid.transaction ?? null,
          paidToAuthor: paid.paidToAuthor ?? null,
          collected: Boolean(kept?.saved),
        });
        log(
          id,
          "pieces",
          paid.action === "crafted"
            ? `RecipeBook.craft(${piece.name}): its author has now earned ${paid.paidToAuthor}${kept?.saved ? ", and it is in your backpack" : ""}`
            : paid.action === "unclaimed"
              ? `${piece.name} has no author to pay yet`
              : `could not pay the author of ${piece.name}`,
          txLink(paid.chain, paid.transaction),
        );
      }
    }

    set(id, {
      status: "done",
      stage: null,
      book,
      catalog,
      collected,
      pieces: paidPieces,
      result: {
        name: built.name,
        recipe,
        notes: [
          ...(notes ?? []),
          ...(built.notes ?? []),
          // What building from pieces did for their authors, where it shows.
          ...(paidPieces ?? []).map((p) =>
            p.action === "crafted"
              ? `Got ${p.name}${p.collected ? " into your backpack" : ""}; its author has now earned ${p.paidToAuthor}.`
              : p.action === "yours"
              ? `${p.name} is yours: nothing to pay.`
              : p.action === "had"
              ? `${p.name} was already in your backpack: not paid for again.`
              : p.action === "unclaimed"
              ? `${p.name} has no author to pay yet.`
              : `Could not pay the author of ${p.name} this time.`,
          ),
        ],
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
    let said = message(err);
    // Nothing was crafted, so nothing the person paid for was delivered: the
    // job gives back what it took.
    if (charged && !worked) {
      const back = await refund(payer, total).catch(() => null);
      if (back) {
        log(id, "budget", `the job failed, so ${back.amountLabel} went back to your wallet`, back.explorer);
        said = `${said} Your ${back.amountLabel} went back to your wallet.`;
      }
    }
    set(id, { status: "failed", stage: null, error: said });
  }
}

async function runPublish(id, name, apiKey, userId, payer = null) {
  let charged = null;
  try {
    if (userPays() && payer) {
      set(id, { stage: "taking the cost from your budget" });
      charged = await charge(payer, PRICE.publish);
      log(
        id,
        "budget",
        `took ${charged.amountLabel} from your budget for publishing — ${charged.leftLabel} left`,
        charged.explorer,
      );
      set(id, {
        bill: {
          items: [{ item: "publish", amount: usdc(PRICE.publish) }],
          total: usdc(PRICE.publish),
          transaction: charged.transaction,
          explorer: charged.explorer,
          left: charged.leftLabel,
        },
      });
    }
    const asset = await payFor(id, "publish", {
      name,
      api_key: apiKey,
      user_id: userId,
    });
    // The render goes up as the model's icon, so what was paid for arrives
    // finished. A failure there is reported, and does not undo the upload.
    if (asset.icon) {
      log(
        id,
        "publish",
        asset.icon.set
          ? `icon set: the render, uploaded as ${asset.icon.kind ?? "image"} asset ${asset.icon.imageAssetId}`
          : `the icon could not be set: ${asset.icon.error ?? "unknown error"}`,
      );
    }
    // Shared with Voxel Bench Arena, so the model can be played in Roblox.
    if (asset.arena) {
      log(
        id,
        "publish",
        asset.arena.granted
          ? "shared with Voxel Bench Arena, so it can be played in Roblox"
          : `not shared with Voxel Bench Arena: ${asset.arena.error ?? "unknown error"}`,
      );
    }
    set(id, {
      status: "done",
      stage: null,
      result: {
        assetId: asset.assetId,
        moderation: asset.moderation,
        icon: asset.icon ?? null,
        arena: asset.arena ?? null,
        insert: `game:GetService('InsertService'):LoadAsset(${asset.assetId})`,
      },
    });
  } catch (err) {
    let said = message(err);
    if (charged) {
      const back = await refund(payer, PRICE.publish).catch(() => null);
      if (back) {
        log(id, "budget", `publishing failed, so ${back.amountLabel} went back to your wallet`, back.explorer);
        said = `${said} Your ${back.amountLabel} went back to your wallet.`;
      }
    }
    set(id, { status: "failed", stage: null, error: said });
  }
}

// Who each piece of a course belongs to, decided once, before the bill. A
// piece you wrote or already got costs nothing; one nobody owns has no author
// to pay; the rest are bought.
async function planPieces(pieces, payer) {
  const me = payer?.toLowerCase() ?? null;
  const seen = new Set();
  for (const piece of pieces) {
    if (seen.has(piece.id)) {
      piece.plan = "repeat";
      continue;
    }
    seen.add(piece.id);
    const author = await lookup(piece.id).then((r) => r.author).catch(() => null);
    piece.author = author;
    piece.plan = !author
      ? "unclaimed"
      : me && author.toLowerCase() === me
        ? "yours"
        : me && (await hasCollected(me, piece.id))
          ? "had"
          : "buy";
  }
}

/**
 * Whether this person's budget covers `total`, answered before any job starts,
 * so a refusal costs nothing and says what to do about it.
 */
async function affordable(res, payer, total) {
  if (!userPays()) return true;
  if (!payer) {
    res.status(402).json({ error: "Sign in and give your agent a budget first." });
    return false;
  }
  const budget = await budgetOf(payer).catch(() => null);
  if (!budget) {
    res.status(503).json({ error: "Could not read your budget on Arc just now. Try again." });
    return false;
  }
  if (BigInt(budget.allowance) < total) {
    res.status(402).json({
      error: `Your agent's budget has ${budget.allowanceLabel} left and this costs ${usdc(total)}. Raise your limit.`,
    });
    return false;
  }
  if (BigInt(budget.balance) < total) {
    res.status(402).json({
      error: `Your wallet holds ${budget.balanceLabel} and this costs ${usdc(total)}.`,
    });
    return false;
  }
  return true;
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
    bill: null,
    log: [],
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
  // Or a list of pieces, which becomes an obby: a recipe of recipes.
  const obby = Array.isArray(req.body?.obby)
    ? req.body.obby.map((v) => String(v).toLowerCase())
    : null;

  let recipe = null;
  let pieces = null;
  if (obby) {
    if (!obby.every((v) => /^0x[0-9a-f]{64}$/.test(v))) {
      return res.status(400).json({ error: "bad piece id" });
    }
    try {
      ({ recipe, pieces } = await composeObby(obby));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else if (wanted) {
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

  // Who pays: the person signed in. A marketplace get or an obby names them as
  // the collector already.
  const named = String(req.body?.payer ?? "");
  const payer = /^0x[0-9a-fA-F]{40}$/.test(named) ? named : collector;

  // The bill, item by item, before anything is spent.
  if (pieces) await planPieces(pieces, payer);
  const bill = [];
  if (!recipe) bill.push({ item: "recipe", amount: PRICE.recipe });
  bill.push({ item: "craft", amount: PRICE.craft });
  if (recipe && !pieces) bill.push({ item: "its author", amount: PRICE.author });
  for (const piece of pieces ?? []) {
    if (piece.plan === "buy") bill.push({ item: `${piece.name}'s author`, amount: PRICE.author });
  }
  const total = bill.reduce((sum, b) => sum + b.amount, 0n);
  if (!(await affordable(res, payer, total))) return;

  const offer = await quote(res);
  if (!offer) return;

  const stages = Object.values(offer.services).filter(
    (s) => s.stage !== "publish" && !(recipe && s.stage === "recipe"),
  );
  const id = start("craft", offer, stages);

  runCraft(id, recipe ? null : prompt.slice(0, 280), {
    recipe,
    collector,
    pieces,
    payer,
    bill,
  });
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

  const named = String(req.body?.payer ?? "");
  const payer = /^0x[0-9a-fA-F]{40}$/.test(named) ? named : null;
  if (!(await affordable(res, payer, PRICE.publish))) return;

  const offer = await quote(res);
  if (!offer) return;

  const stages = Object.values(offer.services).filter((s) => s.stage === "publish");
  const id = start("publish", offer, stages);

  runPublish(id, String(name), String(apiKey), String(userId), payer);
  res.json({ job: id });
});

// What an author signs to claim a recipe, built from the deployment rather
// than from anything the page knows. A page that hardcodes a contract address
// keeps signing for the wrong one after a redeployment.
// A person's budget: what to sign, the signed permit relayed, and test USDC
// for an account that has none. The budget itself is read by the site from the
// chain, so it shows with the bench switched off.
const isAddress = (v) => /^0x[0-9a-fA-F]{40}$/.test(String(v ?? ""));

app.post("/budget/typed", async (req, res) => {
  const { owner, value } = req.body ?? {};
  if (!isAddress(owner)) return res.status(400).json({ error: "bad address" });
  const units = BigInt(Math.max(0, Math.round(Number(value) || 0)));
  if (units === 0n) return res.status(400).json({ error: "a budget has to be more than zero" });
  // Good for a month; after that the person signs again.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
  try {
    res.json({
      typed: await permitTypedData(owner, units, deadline),
      value: units.toString(),
      deadline: deadline.toString(),
    });
  } catch (err) {
    res.status(502).json({ error: message(err) });
  }
});

app.post("/budget/permit", async (req, res) => {
  const { owner, value, deadline, signature } = req.body ?? {};
  if (!isAddress(owner) || !signature || !value || !deadline) {
    return res.status(400).json({ error: "owner, value, deadline and signature are required" });
  }
  try {
    res.json(await applyPermit({ owner, value, deadline, signature }));
  } catch (err) {
    res.status(502).json({ error: message(err) });
  }
});

app.post("/budget/credit", async (req, res) => {
  const { owner } = req.body ?? {};
  if (!isAddress(owner)) return res.status(400).json({ error: "bad address" });
  try {
    res.json(await testCredit(owner));
  } catch (err) {
    res.status(502).json({ error: message(err) });
  }
});

// A claim is relayed for whoever crafted the recipe here and for nobody else,
// whatever the signature says (SR-01). Knowing an id is not having done the
// work, and a signature only proves a wallet.
function refusal(id, author) {
  if (crafted.get(id)?.claimed) {
    return { status: 409, error: "This recipe has already been claimed." };
  }
  if (!crafted.mayClaim(id, author)) {
    return { status: 403, error: "Only the person who crafted this recipe can claim it." };
  }
  return null;
}

app.get("/claim/:id", (req, res) => {
  const { id } = req.params;
  const author = String(req.query.author ?? "");
  if (!/^0x[a-f0-9]{64}$/i.test(id)) {
    return res.status(400).json({ error: "bad recipe id" });
  }
  if (!isAddress(author)) {
    return res.status(400).json({ error: "bad author address" });
  }
  const refused = refusal(id, author);
  if (refused) return res.status(refused.status).json({ error: refused.error });
  res.json(claimTypedData(id, author));
});

// Relay a claim. The signature says who owns it; we only pay the gas. The
// recipe comes with the request, or by its id from the agent's own note of the
// craft, so a page never has to hold the content of something unclaimed.
app.post("/claim", async (req, res) => {
  const { recipe: given, recipeId: wanted, author, signature } = req.body ?? {};
  if ((!given && !wanted) || !author || !signature) {
    return res.status(400).json({ error: "a recipe or its id, the author and a signature are required" });
  }
  if (!isAddress(author)) return res.status(400).json({ error: "bad author address" });

  const id = (given ? recipeId(given) : String(wanted)).toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(id)) return res.status(400).json({ error: "bad recipe id" });

  const refused = refusal(id, author);
  if (refused) return res.status(refused.status).json({ error: refused.error });

  const note = crafted.get(id);
  const recipe = given ?? note.recipe;
  const result = await settle(recipe, { author, signature });

  // Owned now, so it can go in the catalog: the backpack shows it by name, and
  // its id is no longer something a stranger could claim first.
  if (result.action === "published") {
    crafted.markClaimed(id, { author, transaction: result.transaction });
    result.catalog = await saveRecipe({
      id: result.id,
      recipe,
      preview: resolve(OUT, `${note?.name ?? recipe.name}_preview.png`),
    });
  }

  res.status(result.action === "failed" ? 502 : 200).json(result);
});

// What `address` crafted and has not claimed, from the agent's own note,
// checked against the chain: a recipe that got an author some other way is
// dropped, and the note is corrected. Never the recipe itself — the page asks
// to claim by id.
app.get("/unclaimed", async (req, res) => {
  const address = String(req.query.address ?? "");
  if (!isAddress(address)) return res.status(400).json({ error: "bad address" });

  const mine = crafted.unclaimedOf(address).slice(0, 24);
  const onChain = await Promise.all(mine.map((e) => lookup(e.id).catch(() => null)));

  const items = [];
  mine.forEach((entry, i) => {
    if (onChain[i]?.author) {
      crafted.markClaimed(entry.id, { author: onChain[i].author });
      return;
    }
    items.push({
      id: entry.id,
      name: entry.name,
      chain: entry.chain,
      at: entry.at,
      ingredients: entry.recipe?.ingredients?.length ?? null,
    });
  });
  res.json({ address, items });
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
