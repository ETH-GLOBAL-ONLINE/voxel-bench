# Running the bench for the demo

The site is on Vercel. The bench is Blender plus the paying agent and the
services it pays, and for the demo it runs on one of our machines. The site
reaches it through two tunnels. That is how the demo runs, and how the video
was recorded on https://voxel-bench-psi.vercel.app.

On mainnet the same services move to a dedicated server (`MAINNET.md`, item 9).
The code stays the same; only where it runs changes.

---

## What runs where

| Piece | Where | Port | Reached by |
|---|---|---|---|
| site | Vercel | — | everyone |
| crafter (Blender) | bench machine | 8000 | the paywall; the site, through a tunnel, for renders and models |
| paywall | bench machine | 4402 | the agent |
| agent | bench machine | 4403 | the site, through a tunnel |
| facilitator (Arc fallback) | bench machine | 4404 | the paywall, when Arc settles through it rather than Circle Gateway |

Only two ports are tunnelled. The paywall and the facilitator are only called
by other services on the same machine, so they stay on `127.0.0.1`.

## Bringing it up

1. The services, as in the README:

   ```bash
   python services/crafter.py
   node services/paywall/server.mjs
   node services/agent/server.mjs
   node services/facilitator/server.mjs
   ```

2. Two Cloudflare quick tunnels. Each prints a `https://….trycloudflare.com`
   address, and the address is new every time the tunnel starts.

   ```bash
   cloudflared tunnel --no-autoupdate --url http://localhost:4403   # the agent
   cloudflared tunnel --no-autoupdate --url http://localhost:8000   # the crafter
   ```

3. Point the deployment at them, then redeploy so it picks the variables up:

   ```bash
   cd web
   npx vercel env add AGENT_URL production     # the agent's tunnel
   npx vercel env add CRAFTER_URL production   # the crafter's tunnel
   npx vercel redeploy <latest production deployment> --target production
   ```

   The Vercel project's root directory is already `web`, so redeploy the
   existing deployment. A `vercel deploy` from inside `web/` would look for
   `web/web`.

4. Check it from outside:

   ```bash
   curl https://voxel-bench-psi.vercel.app/api/bench/status
   # {"online":true,"paid":true,"agent":"0.0.10432214","discovery":"ens","parent":"voxelbench.eth"}
   ```

## Where the agent pays

The agent finds each service through its ENS name. Each name's `url` record says
where the service is, and for the demo those records point to the paywall on
the bench machine:

```
recipe.voxelbench.eth    http://127.0.0.1:4402/hbar/recipe    100000 tinybar   hedera:testnet
craft.voxelbench.eth     http://127.0.0.1:4402/usdc/craft     5000 (0.005 USDC) eip155:5042002
publish.voxelbench.eth   http://127.0.0.1:4402/hbar/publish   1000000 tinybar  hedera:testnet
```

So on the public site the ledger shows the agent posting to `127.0.0.1`. That
is the agent on the bench machine calling the paywall beside it, and the log
says where the address came from before it pays:

```
resolved craft.voxelbench.eth: its url record is http://127.0.0.1:4402/usdc/craft — the service runs on the bench machine, beside the agent
POST http://127.0.0.1:4402/usdc/craft
402 Payment Required: 0.0050 USDC to 0x10837400… on eip155:5042002
checked against craft.voxelbench.eth: the price matches the name, which the service cannot edit
```

Every payment is real, and each one links to its transaction on HashScan or
Arcscan.

We kept the records local on purpose, for two reasons:

- A quick tunnel's address changes every time it starts.
- The price check depends on the name, not on the host.

On a dedicated server, each service writes its own public `url`. It already
holds the role for exactly that record, and nothing else. The ledger then shows
that public address instead.

## Switching it off

```bash
# stop both cloudflared processes, then:
cd web
npx vercel env rm AGENT_URL production
npx vercel env rm CRAFTER_URL production
npx vercel redeploy <latest production deployment> --target production
```

The site then says the bench is offline and shows the checked-in sample. The
rest of the page reads the chains directly and keeps working: the marketplace,
the backpack and the spending caps.

---

## Final QA, on the deployed site

Before submission we ran the happy path end to end on
https://voxel-bench-psi.vercel.app, with the bench up as above. These are the
five steps in `LOG.md` ("The whole path, as submitted").

| Step | Checked |
|---|---|
| Sign in and give the agent a budget | an EIP-2612 permit on Arc's USDC: a signature, no gas, no transaction |
| Describe an object, or pick pieces for an obby | the render and the model load on the public site through the crafter's tunnel |
| The agent pays each stage | each service found through its ENS name, its price checked against the name, then paid over x402: the recipe in HBAR on Hedera, the craft in USDC on Arc through Circle Gateway, each with its receipt |
| Claim the recipe | an EIP-712 signature, relayed by the agent that crafted it, recorded on `RecipeBook` |
| Publish to Roblox | uploaded through Open Cloud into the creator's own account, with the render as its icon, and open in the Creator Dashboard; the obby plays in Studio |

We also checked the logs themselves:

- Every address the ledger shows traces back to its ENS record.
- The deployed site reaches the agent: `/api/bench/status` answers `online` and
  resolves through `voxelbench.eth`.
