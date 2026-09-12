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
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";

import { loadEnv } from "../env.mjs";

loadEnv();

const PORT = Number(process.env.PAYWALL_PORT ?? 4402);
const CRAFTER = process.env.CRAFTER_URL ?? "http://127.0.0.1:8000";
const PAY_TO = process.env.HEDERA_SERVICE_ACCOUNT_ID;
const NETWORK = "hedera:testnet";

// The public testnet facilitator. It verifies the partially signed transfer,
// co-signs it, covers the gas and submits — which is why a caller needs an
// account but not a relationship with us.
const FACILITATOR =
  process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

// Arc is not one of the nine networks that facilitator serves, so the Arc side
// runs on ours — see services/facilitator. A resource server takes a list and
// routes by which one supports the network being paid on.
const ARC_FACILITATOR =
  process.env.ARC_FACILITATOR_URL ?? "http://127.0.0.1:4404";
const ARC_NETWORK = "eip155:5042002";

// Arc's USDC is the native gas token and an ERC-20 at a fixed address. The
// ERC-20 view is the one x402 signs against, and it has 6 decimals where the
// native balance has 18 — the same asymmetry Hedera has between tinybars and
// wei, on a different chain. Prices here are in the 6-decimal units.
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_PAY_TO = process.env.ARC_PAY_TO;

// The EIP-712 domain of that token. A client signing an EIP-3009 authorisation
// has to build the same domain the token will check it against, and it cannot
// read it from the chain in the middle of a payment — so the offer carries it.
// Read off the contract: name "USDC", version "2".
const ARC_USDC_DOMAIN = { name: "USDC", version: "2" };

// How the Arc side settles.
//
//   gateway  Circle Gateway (Nanopayments): the payer signs an authorization
//            against its Gateway balance, and Circle settles many payments in
//            one transaction. Sub-cent stages are what it exists for.
//   own      our facilitator: a plain EIP-3009 transfer straight from the
//            payer's wallet, settled one by one. Kept as the fallback for the
//            day Gateway is not answering: VOXEL_ARC_SETTLEMENT=own.
const ARC_SETTLEMENT = process.env.VOXEL_ARC_SETTLEMENT === "own" ? "own" : "gateway";
const GATEWAY_URL =
  process.env.CIRCLE_GATEWAY_URL ?? "https://gateway-api-testnet.circle.com";

if (!PAY_TO) {
  console.error("HEDERA_SERVICE_ACCOUNT_ID is required — it is who gets paid.");
  process.exit(1);
}

// Prices, in the order the stages actually cost us. HBAR is in tinybars;
// 100,000 tinybars is 0.001 HBAR.
const HBAR = "0.0.0";
const PRICES = {
  recipe: { hbar: { asset: HBAR, amount: "100000" }, usdc: { asset: ARC_USDC, amount: "1000" } },
  craft: { hbar: { asset: HBAR, amount: "500000" }, usdc: { asset: ARC_USDC, amount: "5000" } },
  publish: { hbar: { asset: HBAR, amount: "1000000" }, usdc: { asset: ARC_USDC, amount: "10000" } },
};

// Which chain each asset settles on, and who receives it there.
const RAILS = {
  hbar: { network: NETWORK, payTo: () => PAY_TO, extra: undefined },
  // Through Gateway the signing domain is Gateway's, and the scheme fills it
  // in from what Gateway advertises; the token's own domain is only for ours.
  usdc: {
    network: ARC_NETWORK,
    payTo: () => ARC_PAY_TO,
    extra: ARC_SETTLEMENT === "own" ? ARC_USDC_DOMAIN : undefined,
  },
};

const DESCRIPTIONS = {
  recipe: "Turn a sentence into a validated recipe",
  craft: "Build the recipe in Blender and render a preview",
  publish: "Upload the finished parts to a Roblox account",
};

const resourceServer = new x402ResourceServer([
  new HTTPFacilitatorClient({ url: FACILITATOR }),
  ARC_SETTLEMENT === "gateway"
    ? new BatchFacilitatorClient({ url: GATEWAY_URL })
    : new HTTPFacilitatorClient({ url: ARC_FACILITATOR }),
])
  .register("hedera:*", new ExactHederaScheme({}))
  .register(
    ARC_NETWORK,
    ARC_SETTLEMENT === "gateway" ? new GatewayEvmScheme() : new ExactEvmScheme(),
  );

const app = express();
app.use(express.json({ limit: "4mb" }));

// Each stage is offered in either asset. A caller pays with whichever it
// holds; the route is the same either way, so supporting both costs one line
// per stage rather than a second set of endpoints.
const routes = {};
for (const [stage, price] of Object.entries(PRICES)) {
  for (const [asset, amount] of Object.entries(price)) {
    const rail = RAILS[asset];
    // USDC settles on Arc and needs an account there. Offering a price nobody
    // is configured to receive would fail at the moment of payment rather than
    // at startup, so the route is simply not offered.
    if (!rail.payTo()) continue;

    routes[`POST /${asset}/${stage}`] = {
      accepts: [
        {
          scheme: "exact",
          price: amount,
          network: rail.network,
          payTo: rail.payTo(),
          ...(rail.extra ? { extra: rail.extra } : {}),
        },
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
      hbar: { ...price.hbar, network: NETWORK, payTo: PAY_TO },
      usdc: ARC_PAY_TO
        ? { ...price.usdc, network: ARC_NETWORK, payTo: ARC_PAY_TO }
        : null,
      endpoints: Object.keys(routes)
        .filter((route) => route.endsWith(`/${stage}`))
        .map((route) => route),
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
  console.log(`hbar     ${PAY_TO} on ${NETWORK}  via ${FACILITATOR}`);
  if (ARC_PAY_TO) {
    console.log(
      `usdc     ${ARC_PAY_TO} on ${ARC_NETWORK}  via ${
        ARC_SETTLEMENT === "gateway" ? `Circle Gateway (${GATEWAY_URL})` : ARC_FACILITATOR
      }`,
    );
  } else {
    console.log("usdc     not offered — set ARC_PAY_TO to an account on Arc");
  }
});
