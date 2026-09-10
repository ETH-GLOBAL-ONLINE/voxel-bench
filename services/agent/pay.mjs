// The agent's wallet, and the one place a payment is made.
//
// Both the command-line agent and the HTTP one pay the same way, so the paying
// lives here and neither of them reimplements it. What a caller gets back is
// the body it asked for plus a receipt: which stage, how much, and the
// transaction the facilitator submitted — because a payment nobody can look up
// is indistinguishable from a claim that one happened.
import { PrivateKey } from "@hiero-ledger/sdk";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

export { loadEnv } from "../env.mjs";
import { disagreement, discover } from "./discover.mjs";

export const PAYWALL = () => process.env.PAYWALL_URL ?? "http://127.0.0.1:4402";
export const ASSET = () => process.env.VOXEL_PAY_ASSET ?? "hbar";

export const tinybar = (n) => `${(Number(n) / 1e8).toFixed(4)} HBAR`;

// Hedera's explorer. Worth linking rather than printing a bare id: the whole
// argument for settling onchain is that someone else can check it.
//
// The facilitator hands back a transaction id as `payer@seconds.nanos`, while
// HashScan and the mirror node both address it as `payer-seconds-nanos`. Same
// transaction, two spellings; this is the one a link can use.
export function hashscan(tx) {
  if (!tx) return null;
  const at = tx.indexOf("@");
  const id = at === -1 ? tx : `${tx.slice(0, at)}-${tx.slice(at + 1).replace(".", "-")}`;
  return `https://hashscan.io/testnet/transaction/${id}`;
}

// A cap the agent cannot argue its way past, enforced before a payment is even
// constructed rather than asked for in a prompt. HBAR is not one of the
// library's recognised default assets, so it has to be listed explicitly —
// which is a good default: an agent should not be able to spend a token nobody
// decided it could spend.
const MAX_PER_PAYMENT_TINYBAR = () => process.env.VOXEL_MAX_TINYBAR ?? "2000000";

export function createAgent() {
  const accountId = process.env.HEDERA_AGENT_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_AGENT_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error(
      "HEDERA_AGENT_ACCOUNT_ID and HEDERA_AGENT_PRIVATE_KEY are required",
    );
  }

  const signer = createClientHederaSigner(
    accountId,
    PrivateKey.fromStringECDSA(privateKey),
    { network: "hedera:testnet" },
  );

  const client = new x402Client()
    .setSpendControls({
      maxAmountPerPayment: "$0.10",
      allowedAssets: [
        {
          network: "hedera:testnet",
          asset: "0.0.0",
          maxAmountPerPayment: MAX_PER_PAYMENT_TINYBAR(),
        },
      ],
    })
    .register("hedera:testnet", new ExactHederaScheme(signer));

  // Every 402 this fetch meets is answered by signing a transfer and retrying.
  // Callers below are written as if payment did not exist, which is the point:
  // paying is plumbing, not a step the caller has to think about.
  //
  // The HTTP client is built here rather than left to wrapFetchWithPayment,
  // which would make its own: reading the receipt afterwards needs the same
  // instance that made the payment, and only this layer knows how to decode
  // the header the facilitator sets.
  const http = new x402HTTPClient(client);

  // Before signing anything, check the bill against the name.
  //
  // A 402 is the service stating its own price. When the stage was discovered
  // through ENS there is a second statement to compare it against — one the
  // service cannot edit, because the role for its `x402:price` record was never
  // granted to it. Disagreement means something is wrong, and the right move is
  // to stop rather than to pay the larger of two numbers.
  //
  // Throwing here is what stops the payment, but the wrapper reports it as a
  // failed fetch and the reason is the whole point — so it is kept aside by
  // url and read back after, where it can be raised properly.
  const refusals = new Map();

  http.onPaymentRequired(async ({ paymentRequired, requestUrl }) => {
    const { services } = await discover();
    const terms = Object.values(services).find((s) => s.url === requestUrl);
    if (!terms) return;

    for (const requirement of paymentRequired.accepts ?? []) {
      const wrong = disagreement(terms, requirement);
      if (wrong) {
        refusals.set(requestUrl, wrong);
        throw new Error(wrong);
      }
    }
  });

  const paidFetch = wrapFetchWithPayment(globalThis.fetch, http);

  /** The stages, their endpoints and their prices, resolved from names. */
  const offer = () => discover();

  async function callStage(stage, body) {
    const started = Date.now();
    const { services } = await discover();
    const terms = services[stage];
    if (!terms) throw new Error(`no service called ${stage}`);

    refusals.delete(terms.url);

    let res;
    try {
      res = await paidFetch(terms.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const refused = refusals.get(terms.url);
      if (refused) {
        refusals.delete(terms.url);
        throw new Error(`did not pay — ${refused}`);
      }
      throw err;
    }

    // processResponse decodes the PAYMENT-RESPONSE header the facilitator sets
    // once it has co-signed and submitted, which is where the transaction id
    // lives. A 200 with no such header means the stage was not paid for.
    const parsed = await http.processResponse(res.clone());
    const settled = parsed.paymentStatus === "settled" ? parsed.header : null;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${stage} failed (${res.status}): ${text.slice(0, 300)}`);
    }

    return {
      body: await res.json(),
      receipt: {
        stage,
        url: terms.url,
        quoted: terms.price,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        paid: Boolean(settled?.success),
        transaction: settled?.transaction ?? null,
        explorer: hashscan(settled?.transaction),
        payer: settled?.payer ?? accountId,
        network: settled?.network ?? "hedera:testnet",
      },
    };
  }

  return { accountId, offer, callStage };
}
