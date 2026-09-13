# Voxel Bench — elevator pitch

For the video and the judges.

## 30 seconds

> Voxel Bench is an agent-run Roblox studio. You describe an object, an agent
> builds it in Blender and publishes it to your own Roblox account, paying for
> every step from a budget you give it with one signature. Every object comes from a recipe, and recipes
> have owners: each time one is crafted, its author is paid 90% onchain. Sign in
> with Google, craft, claim it without paying gas, and it lands in your
> backpack. Get other people's recipes from the marketplace, and build a game
> out of them.

## The happy path

1. **Sign in** with email, Google or a wallet (Privy). No extension needed.
2. **Give your agent a budget**: sign a limit in USDC on Arc — no gas, no
   transaction. The agent can never take more than that; the token itself
   refuses it. (On testnet a new account gets test USDC; on mainnet you bring
   your own.)
3. **Describe it**, for example "a small red mailbox". The agent takes the job's
   price from your budget and pays the x402 services itself. It finds them and
   their prices by ENS name, and refuses to pay a bill that doesn't match the
   name. Every step behind every payment is on screen.
4. **Blender builds it** in seconds, as native Roblox parts.
5. **Claim it** by signing a message: no gas, no transaction. RecipeBook records
   you as the author, and the recipe lands in your **Backpack**.
6. **Marketplace**: get recipes from the platform or from other people. Each one
   is crafted for you and its author is paid onchain.
7. **Obby**: assemble a course from pieces in your backpack or on the
   marketplace. Pieces you don't have yet are got along the way, each author
   paid once. The course arrives in Roblox playable: a start, hazards that
   kill, platforms that move, checkpoints and a finish with your time.
8. **Publish**: it lands in your Roblox account, with its render as the icon — the page links to your Creator Dashboard, where it is.

## Sponsor tracks, technical

- **Hedera**: RecipeBook, SplitVault and Allowance run on Hedera's EVM. The
  stages are paid over x402: the agent signs a partial transfer, the
  facilitator co-signs and pays the gas, and the agent never needs gas. Along
  the way we documented that a contract receives `msg.value` in tinybars while
  `eth_getBalance` answers in weibars.
- **ENS**: each service is a name, `recipe` / `craft` / `publish.voxelbench.eth`
  on ENSv2. Its records carry the endpoint, price, asset, network and payee. The
  operator owns the price, so a service can't raise its own. *Allowance stops
  the agent overspending; ENS stops a service overcharging.*
- **Circle / Arc**: each person gives their agent a budget in USDC on Arc with an
  EIP-2612 permit — one signature, no gas — and the USDC contract enforces it.
  Crafts settle in native USDC on Arc, so the 90/10 split is
  in dollars. The craft stage is paid through Circle Gateway (Nanopayments):
  the agent signs against its Gateway balance and Circle settles in batches,
  which is what sub-cent, per-stage payments need. Our own facilitator on
  `@x402/evm` stays as the fallback. Which chain a service settles on is just a record on its ENS
  name.
- **Safety, which applies to all three**: two brakes, both onchain. Yours is the
  USDC permit: the agent can never take more than you signed for. The
  platform's is `Allowance`: the agent draws each craft's cost from
  an onchain Allowance first. When the cap is used up, the contract refuses and
  the craft doesn't happen. A limit the money has to pass through, not a
  promise.
