// Our own x402 facilitator, for Arc.
//
//   node server.mjs                       # :4404
//
// A facilitator is the party that makes "the agent needs an account but never
// needs gas" true. The agent signs a transfer authorisation and does not
// submit it; the facilitator checks the signature, submits the transaction and
// pays the fee.
//
// The public one at x402.org serves nine networks and Arc is not among them, so
// the Arc side of this project runs on this. It is the same three endpoints the
// public one exposes — /verify, /settle, /supported — over the same scheme
// implementation, which declares `eip155:*` and therefore covers any EVM chain.
//
// Arc's USDC is the native gas token and also an ERC-20 at a fixed address that
// answers `nonces` and `authorizationState`, so EIP-2612 and EIP-3009
// signatures both work and the exact scheme needs no special case.
//
// Needs ARC_PRIVATE_KEY (or the agent key) on an account holding USDC: this is
// the account that pays everyone else's gas.
import express from "express";
import { createWalletClient, defineChain, formatUnits, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { x402Facilitator } from "@x402/core/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";

import { loadEnv } from "../env.mjs";

loadEnv();

const PORT = Number(process.env.FACILITATOR_PORT ?? 4404);

export const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
});

const NETWORK = `eip155:${arc.id}`;

// Its own account, deliberately not the agent's. Sharing one still works and
// hides the arrangement: the receipt would show the agent submitting its own
// payment, which is the opposite of what a facilitator is for.
const key = process.env.ARC_FACILITATOR_KEY;
if (!key) {
  console.error("ARC_FACILITATOR_KEY is required — it is the account that pays everyone else's gas.");
  process.exit(1);
}

const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

// One client that both reads and writes: the scheme needs to read token state,
// check signatures, send the transaction and wait for its receipt.
const client = createWalletClient({ account, chain: arc, transport: http() })
  .extend(publicActions);

// toFacilitatorEvmSigner reads `client.address`, which a viem wallet client
// does not have — it keeps the account under `client.account`. Without this the
// facilitator advertises a null signer, and a resource server rejects the whole
// /supported response as invalid rather than saying which field was wrong.
const facilitator = registerExactEvmScheme(new x402Facilitator(), {
  signer: toFacilitatorEvmSigner(Object.assign(client, { address: account.address })),
  networks: NETWORK,
});

const app = express();
app.use(express.json({ limit: "1mb" }));

/** What this facilitator will settle, in the shape a resource server expects. */
app.get("/supported", async (_req, res) => {
  try {
    res.json(facilitator.getSupported());
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

// Does this signature authorise this payment? No transaction is sent here —
// the resource server asks before doing the work, so that work it will not be
// paid for is never started.
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body ?? {};
    res.json(await facilitator.verify(paymentPayload, paymentRequirements));
  } catch (err) {
    res.status(400).json({ isValid: false, invalidReason: message(err) });
  }
});

// Submit it and pay the fee. The payer's balance moves; the fee comes out of
// this account, which is the whole point of the arrangement.
app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body ?? {};
    res.json(await facilitator.settle(paymentPayload, paymentRequirements));
  } catch (err) {
    res.status(400).json({ success: false, errorReason: message(err) });
  }
});

app.get("/health", async (_req, res) => {
  let balance = null;
  try {
    balance = formatUnits(await client.getBalance({ address: account.address }), 18);
  } catch {
    // an unreachable RPC is a fact to report, not an error here
  }
  res.json({ ok: true, network: NETWORK, payer: account.address, balance });
});

function message(err) {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

app.listen(PORT, "127.0.0.1", async () => {
  console.log(`facilitator  :${PORT}  ${NETWORK}  (${arc.name})`);
  console.log(`gas paid by  ${account.address}`);
  try {
    const balance = await client.getBalance({ address: account.address });
    console.log(`balance      ${formatUnits(balance, 18)} USDC`);
  } catch (err) {
    console.log(`balance      unreadable — ${message(err)}`);
  }
});
