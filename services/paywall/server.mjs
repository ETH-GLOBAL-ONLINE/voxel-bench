// The paywall.
//
// Three stages of crafting, each behind its own price, each proxying to the
// Python crafter. The crafter is Python because Blender only speaks Python;
// x402 is Node because that is where the standard's libraries live. A thin
// gateway in front is not a workaround for that mismatch — it is the right
// shape anyway, since charging for work and doing work are separate concerns.
//
// Why three services rather than one endpoint with one price:
//
//   * The stages do not cost the same. Writing a recipe is a model call,
//     crafting is seven seconds of CPU, publishing consumes someone else's
//     quota. One price for all three would overcharge the cheap one and
//     undercharge the dear one.
//   * Previewing costs cents and publishing costs more, so nobody pays to
//     publish something they have not seen. That is a product decision the
//     pricing makes for us.
//   * No stage can do another's job. The crafting service holds no Roblox key;
//     the publishing service never sees a prompt. Taking one does not hand
//     over the others, which is the actual argument for paying per service
//     instead of sharing a key between them.
//
//   node server.mjs
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

const PORT = Number(process.env.PAYWALL_PORT ?? 4402);
const CRAFTER = process.env.CRAFTER_URL ?? "http://127.0.0.1:8000";
const PAY_TO = process.env.HEDERA_SERVICE_ACCOUNT_ID;
const NETWORK = "hedera:testnet";

// The public testnet facilitator. It verifies the partially signed transfer,
// co-signs it, covers the gas and submits — which is why a caller needs an
// account but not a relationship with us.
const FACILITATOR =
  process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

if (!PAY_TO) {
  console.error("HEDERA_SERVICE_ACCOUNT_ID is required — it is who gets paid.");
  process.exit(1);
}

// Prices, in the order the stages actually cost us. HBAR is in tinybars;
// 100,000 tinybars is 0.001 HBAR.
const HBAR = "0.0.0";
const PRICES = {
  recipe: { hbar: { asset: HBAR, amount: "100000" }, usdc: "$0.001" },
  craft: { hbar: { asset: HBAR, amount: "500000" }, usdc: "$0.005" },
  publish: { hbar: { asset: HBAR, amount: "1000000" }, usdc: "$0.01" },
};

const DESCRIPTIONS = {
  recipe: "Turn a sentence into a validated recipe",
  craft: "Build the recipe in Blender and render a preview",
  publish: "Upload the finished parts to a Roblox account",
};

const resourceServer = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: FACILITATOR }),
).register("hedera:*", new ExactHederaScheme({}));

const app = express();
app.use(express.json({ limit: "4mb" }));

// Each stage is offered in either asset. A caller pays with whichever it
// holds; the route is the same either way, so supporting both costs one line
// per stage rather than a second set of endpoints.
const routes = {};
for (const [stage, price] of Object.entries(PRICES)) {
  for (const [asset, amount] of Object.entries(price)) {
    routes[`POST /${asset}/${stage}`] = {
      accepts: [
        { scheme: "exact", price: amount, network: NETWORK, payTo: PAY_TO },
      ],
      description: `${DESCRIPTIONS[stage]} — paid in ${asset.toUpperCase()}`,
      mimeType: "application/json",
    };
  }
}

app.use(paymentMiddleware(routes, resourceServer));

// Past the middleware, payment has already been verified. From here it is a
// plain proxy: the crafter never learns that money was involved, which keeps
// the paywall removable and the crafter testable on its own.
async function forward(stage, req, res) {
  try {
    const upstream = await fetch(`${CRAFTER}/stage/${stage}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(240_000),
    });
    const body = await upstream.text();
    res.status(upstream.status)
      .type(upstream.headers.get("content-type") ?? "application/json")
      .send(body);
  } catch (err) {
    // The payment already settled, so say plainly that the work failed rather
    // than pretending the request never happened.
    res.status(502).json({
      error: "paid, but the crafter did not answer",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

for (const stage of Object.keys(PRICES)) {
  for (const asset of ["hbar", "usdc"]) {
    app.post(`/${asset}/${stage}`, (req, res) => forward(stage, req, res));
  }
}

/// Unpriced on purpose: an agent has to be able to see what is on offer before
/// it can decide to pay for it.
app.get("/services", (_req, res) => {
  res.json({
    network: NETWORK,
    facilitator: FACILITATOR,
    payTo: PAY_TO,
    stages: Object.entries(PRICES).map(([stage, price]) => ({
      stage,
      description: DESCRIPTIONS[stage],
      hbar: price.hbar,
      usdc: price.usdc,
      endpoints: [`POST /hbar/${stage}`, `POST /usdc/${stage}`],
    })),
  });
});

app.get("/health", async (_req, res) => {
  let crafter = false;
  try {
    const r = await fetch(`${CRAFTER}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    crafter = r.ok;
  } catch {
    // the crafter being down is a fact to report, not an error here
  }
  res.json({ ok: true, crafter, network: NETWORK, payTo: PAY_TO });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`paywall  :${PORT}  ->  ${CRAFTER}`);
  console.log(`paid to  ${PAY_TO} on ${NETWORK}`);
  console.log(`facilitator  ${FACILITATOR}`);
});
