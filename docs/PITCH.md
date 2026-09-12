# Voxel Bench — elevator pitch

For the video and the judges.

## 30 seconds

> Voxel Bench is an agent-run Roblox studio. You describe an object, an agent
> builds it in Blender and publishes it to your own Roblox account, paying for
> every step from its own wallet. Every object comes from a recipe, and recipes
> have owners: each time one is crafted, its author is paid 90% onchain. Sign in
> with Google, craft, claim it without paying gas, and it lands in your
> backpack. Get other people's recipes from the marketplace, and build a game
> out of them.

## The happy path

1. **Sign in** with email, Google or a wallet (Privy). No extension and no funds
   needed.
2. **Describe it**, for example "a small red mailbox". The agent pays three x402
   services (recipe, craft, publish). It finds them and their prices by ENS
   name, and refuses to pay a bill that doesn't match the name.
3. **Blender builds it** in seconds, as native Roblox parts, and it's published
   to your account.
4. **Claim it** by signing a message: no gas, no transaction. RecipeBook records
   you as the author, and the recipe lands in your **Backpack**.
5. **Marketplace**: get recipes from the platform or from other people. Each one
   is crafted for you and its author is paid onchain.
6. **Obby**: assemble a course from pieces in your backpack or on the
   marketplace. Pieces you don't have yet are got along the way, each author
   paid once. The course arrives in Roblox playable: a start, hazards that
   kill, platforms that move, checkpoints and a finish with your time.

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
- **Circle / Arc**: crafts settle in native USDC on Arc, so the 90/10 split is
  in dollars. There was no x402 facilitator for Arc, so we wrote one on
  `@x402/evm`. Which chain a service settles on is just a record on its ENS
  name.
- **Safety, which applies to all three**: the agent draws each craft's cost from
  an onchain Allowance first. When the cap is used up, the contract refuses and
  the craft doesn't happen. A limit the money has to pass through, not a
  promise.
